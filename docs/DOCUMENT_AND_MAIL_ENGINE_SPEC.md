# 📋 Spezifikation: Supabase Document & Mail Engine (inkl. GV-Dossier-Compiler)

**Stand:** September 2026  
**Status:** ARCHITEKTUR-BRIEFING & SPEZIFIKATION  
**Führendes Gesamtsystem:** Supabase PostgreSQL & Auth (Sportschützen Muhen)  
**Komponenten:** Supabase Edge Functions (`pdf-lib`, Resend/Postmark/SMTP), Storage, Vorstands-Cockpit (Frontend)

---

## 1. Systemübersicht & Architektur

### 1.1 Zielsetzung
Aufbau einer zentralen, robusten Dokumenten- und Kommunikations-Engine für den Verein Sportschützen Muhen. Das System generiert:
1. **Druckfertige PDFs:**
   - Rechnungen mit offiziellem Schweizer QR-Zahlteil (QR-Bill)
   - Offizielle Vorstandsbriefe
   - Generalversammlungs-Einladungen mit Traktanden & Jahresprogramm-Beilage
   - Komplettes „GV-Dossier / GV-Heftli“ (Multi-Dokumenten-Assembler)
   - Endschiessen-Programme / Einladungen
2. **Synchronisierte E-Mails:**
   - 100 % identische Platzhalter-Syntax (`{{...}}`) zwischen Mail-Body und PDF.
3. **Massenversand mit Tracking & Freigabeprozess:**
   - Vorstands-Freigabe, Test-Mail-Funktion („Test-Mail an mich“), idempotenter Versand und lückenloses Logging (`campaign_recipients`, `mail_logs`).

### 1.2 Tech-Stack & Infrastruktur
- **Backend:** Supabase PostgreSQL (Single Source of Truth), GoTrue Auth, Storage Buckets.
- **Storage-Buckets:**
  - `operatives-storage`: Zentraler Produktiv-Bucket für Rechnungen (`invoices/{year}/...`), Mietverträge (`contracts/{year}/...`), GV-Einladungen (`gv/{year}/...`), Assets (`assets/logo.png`) und WORM-Langzeitarchiv (`archive/{year}/...`).
  - `campaign-assets`: Uploads für Beilagen (z. B. Jahresberichte, Protokolle).
  - `generated-docs` / `operatives-storage`: Unveränderliche, revisionssichere PDF-Archive.
- **Edge Functions (Deno):**
  - Rendering-Engine: `supabase/functions/generate-pdf/index.ts` (nativ Deno, `pdf-lib` 1.17.1, SIX SPC 0200 1 QR-Bill Vektorgenerierung, In-Memory-Logo-Cache, Paperless-NGX REST-Sync).
  - E-Mail-Dispatcher: `supabase/functions/send-email/index.ts` (SMTP via Gmail/Infomaniak, HTML/Text, Anhänge via Base64/Storage, Audit-Log in `public.mail_logs`).
- **Frontend-Module:**
  - Vorstands-Portal (`vorstand/js/pdf-engine.js` & `vorstand/js/mail-engine.js` als universelle Shared Services).
  - Vorlagen- & Klauselpool (`vorstand/js/vorlagen/templates-ui.js`).
  - Generalversammlung & Präsenzkontrolle (`vorstand/js/gv.js` & `vorstand/js/umfragen/umfragen-controlling.js`).
  - Zentraler RechnungsCore (`vorstand/js/rechnungen/`).

### 1.3 Bestandsaufnahme: Was bereits existiert (Ist-Zustand)
1. **Bestehende PDF-Engine (`supabase/functions/generate-pdf/index.ts`):**
   - Beherrscht vollvektoriell `generate-invoice` (QR-Bill nach SIX-Norm, Perforation, Schweizerkreuz-Vektor), `generate-contract` (Mietvertrag Rüteli), `generate-gv-invitation` (Einladung + Jahresprogramm-Tabelle aus Terminen), `compile-gv-dossier` (Assembler mit Corporate Stempel) sowie `generate-letter` (Freier Vorstandsbrief DIN 5008 Fenster rechts mit 2-spaltigem Unterschriftenblock).
   - Besitzt WORM-Archivierung und Paperless-NGX-Synchronisation.
2. **Bestehende Client-Wrapper (`vorstand/js/pdf-engine.js`):**
   - Stellt `window.generatePdfViaEngine(options)`, `window.createSwissQrBillPayload(invoice, recipient)`, `window.rnGeneratePDFOnly()`, `window.jbGenerateInvoicePdfRemote()`, `window.vmGenerateRentalContractPdf()`, `window.gvGenerateInvitationPdf()`, `window.gvCompileDossierPdf()` und `window.generateLetterPdfRemote()` bereit.
3. **Bestehende Vorlagen-Verwaltung (`supabase/migrations/27_document_templates_and_clauses.sql`):**
   - Tabellen `public.document_templates` und `public.document_template_clauses` sind bereits migriert und über `vorstand/js/vorlagen/templates-ui.js` im Vorstands-Cockpit editierbar.
4. **Bestehende GV-Stammdaten (`supabase/migrations/18_generalversammlung_module.sql`):**
   - `public.gv_instances` verwaltet bereits Traktanden, Wahljahr-Flags sowie URLs für `doc_einladung_url`, `doc_protokoll_url`, `doc_jahresbericht_url`, `doc_anhaenge_url`.

### 1.4 Delta-Analyse: Was neu dazukommt (Ziel-Erweiterung)
1. **Der modulare GV-Dossier-Compiler (`pdf-lib` Multi-Dokumenten-Assembler):**
   - Dynamisch generierte Einladung & Jahresprogramm mit extern hochgeladenen PDF-Berichten (Präsident, Jungschützen, Protokoll, Revisoren) zu einem Master-Heft zusammenfügen (`copyPages`).
   - Einheitlicher Corporate Stempel (Vereinskopf oben, fortlaufende Seitennummerierung `Seite X von Y` unten).
2. **Kampagnen- & Empfänger-Tracking (Massenversand):**
   - DDL-Erweiterung um `communication_campaigns`, `campaign_attachments`, `campaign_recipients` (oder Verknüpfung mit bestehendem `mail_logs` & `gv_praesenz`).
   - Idempotenter Versand mit Fortschrittsbalken und Bounce-Schutz (schlanker Anhang < 1 MB + geschützter Download-Link auf Gesamt-Dossier).
3. **Endschiessen-Layout:**
   - Vorlage & Rendering für Schiesstage, Stichprogramme und Absenden-Menüs.
4. **GV-Schaltzentrale im Frontend:**
   - 2-Spalten-Workspace: Links Checkliste für Berichte-Uploads & Traktanden, rechts Live-Vorschau (E-Mail / PDF).

---

## 2. Typografie & Corporate Design (Schweizer Vereinsstandard)

### 2.1 Grundregeln
- **Keine Unterstreichungen:** Unterstrichener Text ist ausschliesslich Hyperlinks vorbehalten. Hervorhebungen erfolgen über **Fett (Bold)** oder *Kursiv (Italic)*.
- **Textfarbe:** Schiefer-Anthrazit (`#1e293b`), kein Rein-Schwarz (`#000000`).
- **Akzentfarbe:** Vereins-Hauptfarben (z. B. Tannengrün `#14532d` oder Schützen-Dunkelblau `#1e3a8a`) für Haupttitel (H1) und Trennelemente.
- **Rahmen & Linien:** Dezentes Grau (`#e2e8f0`).

### 2.2 Schriftarten (Font Stack)
- **PDF (Druck / A4):** Standard-Schriftarten wie **Helvetica** oder **Arial / Liberation Sans**.
  - *Begründung:* 100 % konform mit den offiziellen Schweizer SIX-Vorgaben für den QR-Zahlteil; standardmässig ohne externe Ladezeiten oder Font-Parsing-Fehler in PDF-Engines verfügbar.
- **E-Mail (Screen):** Robuster System-Font-Stack:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`

### 2.3 Grössen- und Stilhierarchie

| Element | PDF (Druck A4) | E-Mail (HTML) | Schriftschnitt | Einsatz / Styling |
| :--- | :--- | :--- | :--- | :--- |
| **H1 (Haupttitel)** | 18 – 20 pt | 22 – 24 px | Bold (700) | Dokumententitel, Einladungskopf |
| **H2 (Zwischentitel)** | 12 – 13 pt | 17 – 18 px | Semi-Bold (600) | Sektionen, Traktanden |
| **Body (Fliesstext)** | 9.5 – 10.5 pt | 15 – 16 px | Regular (400) | Zeilenabstand PDF: 1.35 / Mail: 1.55 |
| **Tabelleninhalte** | 8.5 – 9.5 pt | 14 – 15 px | Regular (400) | Zwingend Tabellenziffern (`tabular-nums`) |
| **Fusszeile / Meta** | 7.5 – 8.5 pt | 12 – 13 px | Regular (400) | Vereinsangaben, IBAN, Seitenzahlen |

---

## 3. Die 4 Dokument- & E-Mail-Typen

### Typ 1: Rechnung / Jahresbeitrag / Schulsport (Formal mit QR-Bill)
*Referenz-Layout gemäss offiziellem Belegmuster:*
- **PDF-Aufbau:**
  - **Logo:** Offizielles Wappen `logo.png` freistehend oben links (ca. 35 × 35 mm, keine Textzeilen daneben).
  - **Absenderblock (links, unterhalb des Logos):**
    - Zeile 1: **`Sportschützen Muhen [Rolle/Bereich]`** (fett, z. B. *Sportschützen Muhen Schulsport*)
    - Zeile 2: `[Vorname Nachname]` des tatsächlichen Erstellers (z. B. *Andrea Rossi*)
    - Zeile 3: `[Strasse Hausnummer]` (z. B. *Eppenbergstrasse 164*)
    - Zeile 4: `[PLZ Ort]` (z. B. *5012 Eppenberg-Wöschnau*)
    - Zeile 5: `Mobil [Nummer]` (z. B. *Mobil 079 138 84 72*)
    - Zeile 6: `[E-Mail]` in Vereinsblau (z. B. *andrea.rossi@sportschuetzen-muhen.ch*)
    - Zeilen 7–8 (mit Abstand):  
      `Datum:       DD.MM.YYYY`  
      `Zahlbar bis: DD.MM.YYYY`
  - **Empfängerblock (rechts, DIN 5008 Fenster rechts):**
    - Platziert auf gleicher Höhe wie der Absenderblock rechts (`X ≈ 125 mm`):
      `[Firma / Funktion / Zusatz]`  
      `[Vorname Nachname]`  
      `[Strasse Hausnummer]`  
      `[PLZ Ort]`
  - **Titel (H1):**
    - Linksbündig, 14–16 pt Bold (z. B. **Schulsport Semester** oder **Jahresbeitrag 2026**).
  - **Anrede & Intro:**
    - Persönliche Anrede (*Guten Tag Mike*) gefolgt vom Anschreibetext.
  - **Positionstabelle:**
    - Schlichte Linientabelle: Spalten `Pos`, `Beschreibung`, `Menge`, `Einzelpreis`, `Preis (CHF)`.
    - Totalzeile fett mit Schweizer Hochkomma-Tausendertrennzeichen (z. B. **2'280.00**).
  - **Outro & Grussformel:**
    - Outro-Text (z. B. *„Bei allfälligen Fragen bitte bei mir melden. Vielen Dank für das Vertrauen.“*)
    - Grusszeile:  
      *Mit besten Grüssen*  
      **Sportschützen Muhen**  
      *(Leerzeile)*  
      *Andrea Rossi*  
      *Schulsportleiter*
  - **Vereins-Footer (juristische Anschrift):**
    - Dezent ganz unten (knapp über dem QR-Zahlteil) über einer dünnen grauen Linie:  
      `Sportschützen Muhen (gegründet 1919) · Schiessanlage Rüteli, 5037 Muhen · www.sportschuetzen-muhen.ch · sportschuetzen.muhen@gmail.com`
  - **Swiss QR-Bill Integration:**
    - Auf den unteren 105 mm der A4-Seite (SIX SPC 0200 1 konform) oder als separate QR-Beilage per `pdf-lib` Merge.
- **E-Mail (Shell & Corporate Footer via `renderClubEmailHtml`):**
  - Höfliche Information mit Fälligkeitsdatum, Betrag in CHF, Verweis auf das angehängte Original-PDF.
  - Der Textkörper (`contentHtml`) enthält die vollständige Grussformel und Absendersignatur. Keine nachgelagerten doppelten Infoboxen oder redundanten `senderInfo`-Blöcke.
  - **Globaler E-Mail-Footer:** Dezent zentriert am E-Mail-Ende:  
    `Sportschützen Muhen (gegründet 1919) • Schiessanlage Rüteli • 5037 Muhen`  
    `Instagram: https://www.instagram.com/sportschuetzen.muhen/ • Facebook: https://www.facebook.com/SportschuetzenMuhen/?locale=de_DE`  
    `Dieses Schreiben wurde über das Vereinsportal generiert.`

### Typ 2: Freier Vorstandsbrief (Formal)
*Differenziertes Layout für offizielle Mitteilungen ohne Rechnungscharakter:*
- **PDF-Aufbau:**
  - Briefkopf mit Absender und Adressfenster (C5/C4).
  - Freier, strukturierter Fliesstext (Absätze, nummerierte Listen, Bulletpoints).
  - **Zweispaltiger Unterschriftenblock** am Briefende (z. B. links *Präsident*, rechts *Aktuar* oder *Kassier*).
  - Juristischer Vereins-Footer am Seitenende.
- **E-Mail:** Vollständiger Brieftext als HTML-E-Mail oder kurzes Anschreiben mit PDF im Anhang.

### Typ 3: Generalversammlung (Einladung, Traktanden & Jahresprogramm / GV-Dossier)
*Mehrseitiges Dokument für die GV-Aussendung:*
- **PDF-Aufbau:**
  - **Seite 1 (Die Einladung):** Kopfdaten (Datum, Zeit, Lokalität, Antragsfrist), nummerierte Traktandenliste (Titel, Berichterstatter kursiv, Beschlussanträge), Unterschriftenzeile Vorstand.
  - **Seite 2 (Beilage Jahresprogramm):** Aus Vereinskalender `club_calendar` generierte Termin-Tabelle (Datum, Wochentag, Zeit, Anlass, Ort, Wertung).
  - **GV-Dossier (Compiler):** Zusammenfügen mit Protokoll Vorjahr und Jahresberichten (Präsident, Jungschützen, Kassa) inkl. Corporate Stempel (`Seite X von Y`).
- **E-Mail:** Zusammenfassung der Rahmendaten, Traktanden-Überblick, Anmeldefrist und geschützter Download-Link auf das Gesamtdossier.

### Typ 4: Endschiessen-Einladung (Event / Programm)
*Aufgelockertes Event-Layout:*
- **PDF-Aufbau:**
  - Modulares 2-Spalten- oder Karten-Layout.
  - Infoboxen für Schiesstage, Schiesszeiten, Standblattausgabe.
  - Stichtabellen (Vereinsstich, Gabenstich, Nachdoppel, Munitionstarife).
  - Details zum Absenden (Gemeinsames Nachtessen, Rangverkündigung).
- **E-Mail:** Kameradschaftliche Ansprache, Vorbestellungsfristen für das Nachtessen, Call-to-Action.

---

## 4. Das modulare GV-Dossier („GV-Heftli-Compiler“)

### 4.1 Konzept: Assembler statt manuelles Word-Zusammenkopieren
Statt Dokumente manuell zusammenzufügen, wird das GV-Heft aus zwei Quellen kompiliert:
```text
┌────────────────────────────────────────────────────────────────────────┐
│                          DAS MASTER-GV-DOSSIER                         │
├───────────────────────────────────┬────────────────────────────────────┤
│ A) DYNAMISCH GENERIERT (Supabase) │ B) BEILAGEN / UPLOADS (Vorstand)   │
│ ───────────────────────────────── │ ────────────────────────────────── │
│ 1. Einladung & Traktanden         │ 3. Protokoll letzte GV (Aktuar)    │
│    (Aus Vorlage + DB)             │ 4. Jahresbericht Präsident         │
│ 2. Jahresprogramm Beilage         │ 5. Jahresbericht Jungschützen      │
│    (Aus Vereinstabelle)           │ 6. Evtl. Kassa-/Revisorenbericht   │
└───────────────────────────────────┴────────────────────────────────────┘
                                    │
                                    ▼
       [ Supabase Edge Function: pdf-lib fügt alles zusammen ]
                                    │
                                    ▼
       [ "Corporate Stempel": Einheitlicher Vereinskopf & Seitenzahlen ]
                                    │
                                    ▼
                    Fertiges, druckfertiges PDF-Dossier
```

### 4.2 Handling von Vorstandsberichten (Option A: PDF-Uploads)
- **Best Practice:** Die Vorstandsmitglieder verfassen Berichte wie gewohnt (z. B. Word mit Fotos/Tabellen), exportieren diese als PDF und laden sie im Cockpit hoch.
- **Vorteil:** Keine Layout-Zerschlagungen, maximale Bildqualität, keine fehleranfälligen Server-Konvertierungen.

### 4.3 Der „Corporate Stempel“ (`pdf-lib`)
Damit das Dossier wie aus einem Guss wirkt, stempelt die Edge Function über alle zusammengefügten Seiten:
1. **Kopfzeile:** Dezent oben: `Sportschützen Muhen – Generalversammlung {Jahr}` (8 pt, `#64748b`).
2. **Seitennummerierung:** Zentriert unten: `Seite X von Y`.
3. **Optionales Inhaltsverzeichnis:** Automatisch auf Seite 2 mit Sprungzielen / Seitenzahlen der Berichte.

### 4.4 Versand-Strategie bei Grossdokumenten (Bounce-Schutz)
- Grosse GV-Dossiers mit vielen Bildern (10–25 MB) führen bei Mailprovidern (z. B. Bluewin, Firmen-Server) oft zu Bounces.
- **Lösung:**
  - **E-Mail-Anhang:** Schlankes Einladungs-PDF (Einladung + Jahresprogramm, < 1 MB).
  - **Download-Link:** Sicherer Direktlink zum vollständigen GV-Dossier im Supabase Storage Bucket (`campaign-assets` / `generated-docs`).

---

## 5. Swiss QR-Bill Merging & RechnungsCore-Stabilität

1. **RechnungsCore-Garantie:**
   - Gemäss Projekt-Richtlinie bleibt der bestehende `RechnungsCore` (`vorstand/js/rechnungen/`) die zentrale Instanz.
   - Seine Schnittstelle (`InvoiceOrder`-Payload) wird nicht verändert.
2. **Merging-Logik via `pdf-lib`:**
   - Die Edge Function erzeugt den Rechnungskopf und die Positionstabelle.
   - Der vom `RechnungsCore` gelieferte QR-Teil wird pixelgenau auf den unteren 105 mm der A4-Seite eingebettet (*Page-Embed / Stamp*) oder als Folgeseite nahtlos angehängt.

---

## 6. Variablen-System (`{{...}}`) & Pre-Flight-Validierung

### 6.1 Namensraum-Konvention (Handlebars-Standard)
```handlebars
-- Mitglied / Empfänger --
{{mitglied.anrede}}          -- Lieber Max / Sehr geehrter Herr Muster
{{mitglied.vorname}}
{{mitglied.nachname}}
{{mitglied.strasse}}
{{mitglied.plz}}
{{mitglied.ort}}
{{mitglied.status}}          -- Aktiv, Veteran, Ehrenmitglied

-- Verein / Absender --
{{verein.name}}
{{verein.postadresse}}
{{verein.praesident_name}}
{{verein.aktuar_name}}
{{verein.iban}}

-- Rechnungsmodul Payload --
{{rechnung.nummer}}
{{rechnung.datum}}
{{rechnung.faelligkeit}}
{{rechnung.total_chf}}       -- z.B. 120.00
{{rechnung.positionen}}      -- Array von { bezeichnung: string, betrag: number }

-- Event-Spezifisch (GV / Endschiessen) --
{{event.titel}}
{{event.datum_formatiert}}   -- z.B. Samstag, 24. Oktober 2026
{{event.zeit}}
{{event.lokalitaet}}
{{event.antragsfrist}}
```

### 6.2 Dynamische Absender-Ermittlung (Backend & Frontend)
> **Architektur-Standard für Frontend & RechnungsCore (`rnGetLoggedInSender` & `RechnungsCore.resolveSender`):**  
> Die Funktion `rnGetLoggedInSender()` und `RechnungsCore.resolveSender()` bestücken alle Felder (`mobil`, `email`, `strasse`, `plz`, `ort`, `bereich`, `funktion`) vollständig aus der Mitgliedertabelle `public.members` über die `person_number` des angemeldeten Benutzers (`admin_profiles` / Auth).  
> **Revisionssicherer DB-Snapshot:** Bei der Erstellung einer Rechnung (`RechnungsCore.createInvoice`) wird der Absender als unveränderlicher JSONB-Snapshot in `public.invoices.sender_address` festgeschrieben.  
> **2-stufiges Absender-Modell:**
> 1. *Primär (Default):* Automatisch die angemeldete Person (mit Fachbereich des Quellmoduls).
> 2. *Sekundär (Übersteuerung):* Explizite Angabe im `InvoiceOrder` (`sender`-Objekt, `personNumber` oder gezielte Rollen/Funktionen).
> *Status: Vollständig implementiert in `rechnungen-core.js`, Fachmodulen (Inventar, Vermietung, Jahresbeitrag) und Migration 29.*

### 6.3 Pre-Flight-Validierung (Missing Variables Check)
- Vor dem Start des Batch-Renderings prüft das System alle Tags im Template gegen den Datensatz der Empfänger.
- Fehlen Pflichtfelder (z. B. PLZ/Ort bei postalischem Versand), wird ein Warn-Dialog mit Fehlerliste angezeigt.
- Bereitstellung robuster Fallbacks (z. B. `{{mitglied.anrede_formell}}` bei unklaren Stammdaten).

---

## 7. Vorschau- & Rendering-Strategie

- **E-Mail-Vorschau (Client-seitig):**
  - 100 % im Browser ohne Server-Roundtrip (Echtzeit-Rendering beim Tippen via Regex/Mustache gegen Test-Datensätze).
- **PDF-Vorschau (Serverseitig on-demand):**
  - Klick auf „Vorschau aktualisieren“ ruft die Edge Function mit Parametern auf (`preview: true`).
  - Rückgabe als `Blob`/`application/pdf` zur direkten Anzeige im Frontend in einem Sandboxed `<iframe src="blob:...">`.

---

## 8. Frontend UI/UX Konzept

### 8.1 2-Spalten-Arbeitsbereich
- **Linke Spalte (Konfiguration & Redaktion):**
  - Empfängerauswahl (z. B. *„Aktivmitglieder (64)“*, *„Vorstand (7)“*).
  - Tabs: `[ E-Mail-Text ]` | `[ PDF-Konfiguration ]`.
  - Traktanden-Manager (für GV): Sortierbare Liste mit Drag & Drop, Hinzufügen, Deaktivieren.
  - Jahresprogramm-Schalter: Checkbox *„Jahresprogramm 2026 als Seite 2 einbinden“*.
  - Variable-Chips: Klickbare Buttons (`+ Name`, `+ Datum`, `+ Betrag`), die Platzhalter direkt an die Cursor-Position setzen.
- **Rechte Spalte (Live-Monitor):**
  - Umschaltbar zwischen `[ ✉️ E-Mail-Vorschau ]` und `[ 📄 PDF-Vorschau ]`.
  - Dropdown zur Auswahl realer Testmitglieder (*„Vorschau für: Hans Muster ▼“*).

### 8.2 Sicherheits- & Kontroll-Features
- **„Test-Mail an mich senden“:** Generiert ein echtes Test-PDF und sendet die Mail direkt an das eingeloggte Vorstandsmitglied.
- **Idempotenter Versand & Retry:** PDFs werden im Storage unter festen Pfaden gespeichert. Wiederholte Versuche überschreiben/ergänzen den Status ohne Doppelversand.
- **Live-Statusbar:** Fortschrittsanzeige mit Fehlerprotokollierung (`pending`, `sent`, `failed`).

---

## 9. Datenmodell (Supabase PostgreSQL DDL)

*Implementiert in Migration [28_communication_campaigns_and_attachments.sql](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/28_communication_campaigns_and_attachments.sql) sowie den Vorlagen-Tabellen aus Migration 27:*

```sql
-- 1. Vereinskalender (für GV-Beilage & Event-Import)
CREATE TABLE IF NOT EXISTS club_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year INT NOT NULL,
  event_date DATE NOT NULL,
  time_start TIME,
  time_end TIME,
  title TEXT NOT NULL,
  location TEXT,
  category TEXT,
  is_championship BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Vorlagen (Mail & PDF Struktur)
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 'invoice', 'letter', 'agm', 'endschiessen'
  name TEXT NOT NULL,
  layout_type TEXT NOT NULL, -- 'formal' oder 'event'
  default_email_subject TEXT NOT NULL,
  default_email_body TEXT NOT NULL,
  default_pdf_blocks JSONB NOT NULL, -- Standard-Traktanden, Spaltenkonfigurationen
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Kommunikations-Kampagnen / Aussendungen
CREATE TABLE IF NOT EXISTS communication_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code TEXT REFERENCES document_templates(code),
  title TEXT NOT NULL,
  season_year INT NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'processing', 'completed', 'cancelled'
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Beilagen für Kampagnen (GV-Dossier-Compiler)
CREATE TABLE IF NOT EXISTS campaign_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES communication_campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,              -- z.B. "Jahresbericht Präsident"
  sort_order INT NOT NULL DEFAULT 1, -- Reihenfolge im Heft
  storage_path TEXT NOT NULL,       -- Pfad im Bucket 'campaign-assets'
  page_count INT DEFAULT 1,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Empfänger-Log & Dokumenten-Verknüpfung
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES communication_campaigns(id) ON DELETE CASCADE,
  member_id UUID NOT NULL, -- Referenz auf mitglieder-Tabelle
  pdf_storage_path TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE club_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
```

---

## 10. Revisionssichere Archivierung & Page-Spilling-Regeln

1. **Revisionssicherheit & Archivierung:**
   - Gemäss Schweizer Vereins- und Rechnungslegungsrecht (Art. 957ff. OR) müssen Rechnungen und offizielle Beschlüsse/GV-Einladungen unveränderlich aufbewahrt werden.
   - Nach erfolgreichem Versand verbleiben die generierten PDFs als statische Dokumente im Supabase Storage Bucket `generated-docs` und werden mit dem Rechnungs- bzw. Kampagnen-Log verknüpft.
2. **Page Spilling & Seitenbudgets:**
   - Für formale Briefe und Rechnungen gilt ein festes Höhenbudget.
   - Überschreitet der Fliesstext die Höhe von Seite 1, sodass ein „Waisen-Absatz“ mit wenigen Zeilen auf Seite 2 entsteht, warnt das Vorstands-UI aktiv:  
     *⚠️ „Achtung: Der Brieftext erzeugt eine 2. Seite mit nur wenigen Zeilen. Text bitte kürzen oder Schriftgrösse anpassen.“*

---

## 11. Implementierungs- und Integrationsstatus (Stand: September 2026)

| Dokumenttyp / Komponente | Backend (`generate-pdf`) | Frontend UI / Workspace | Status |
| :--- | :--- | :--- | :--- |
| **Typ 1: Rechnung & QR-Rechnung** | ✅ `generate-invoice` (`operatives-storage/invoices/`) | ✅ Rechnungs-Dashboard (`rechnungen/`) | **Produktiv** |
| **Typ 2: Freier Vorstandsbrief** | ✅ `generate-letter` (DIN 5008, WORM-Archiv, Paperless) | ✅ Vorlagen-Pool & Live-PDF-Test (`templates-ui.js`) | **Vollständig implementiert** |
| **Typ 3: GV-Dossier & Kampagne** | ✅ `compile-gv-dossier` (`campaign_attachments`, Stempel) | ✅ 2-Spalten-Workspace (`gv-dossier.js`, Index, Router) | **Vollständig implementiert** |
| **Typ 4: Endschiessen / Festführer** | ✅ `generate-endschiessen` (Schiesstage, Ablösung, Gaben) | ✅ Vorlagen-Pool & Remote-Generator (`pdf-engine.js`) | **Vollständig implementiert** |

