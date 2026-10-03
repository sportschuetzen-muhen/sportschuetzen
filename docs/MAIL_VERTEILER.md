# Fachdokumentation: Mail-Verteiler & Empfänger-Management

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.members`, `member_licenses`, `member_functions`, `mail_logs`  
> **Frontend:** [`vorstand/js/mail.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/mail.js), [`vorstand/js/ui-table-kit.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/ui-table-kit.js)  
> **Relevanz für KI:** Definiert die fachlichen Invarianten, das Berechtigungs- und Datenschutz-Konzept sowie die saubere Adressauflösung für Vereins-Rundmails.

---

## 1. Übersicht & Systemgrenzen

Das Modul **Mail-Verteiler** dient dem Vorstand und den Funktionären der Sportschützen Muhen zur zielgerichteten, datenschutzkonformen Zusammenstellung von Empfängerlisten für die interne und externe Vereinskommunikation.

* **Zweck:** Ad-hoc-Zusammenstellung von E-Mail-Adressen nach dynamischen Kriterien (Vorstand, Gesamtverein, Aktive Schützen G50m/G10m, Ehrenmitglieder, Passivmitglieder).
* **Ausgabeformate:**
  1. **BCC-Zwischenablage:** Semikolon-separierte Adresszeile für Mail-Programme (Outlook, Apple Mail, Thunderbird).
  2. **Mailto-Direktaufruf:** Öffnen des System-Mailprogramms mit vorbefülltem BCC-Feld (limitiert auf max. 30 Empfänger zum Schutz vor Provider-Limits).
  3. **CSV-Export:** Strukturierter Export für Serienbriefe oder Archivierung.
* **Abgrenzung:** Das Modul versendet **keine** automatisierten Transaktionsmails und generiert keine Rechnungs-PDFs. Diese Aufgaben liegen ausschliesslich bei der zentralen [Document & Mail Engine](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/DOCUMENT_AND_MAIL_ENGINE_SPEC.md).

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum ein nativer Mail-Verteiler statt externer Tools (z.B. Mailchimp / Google Groups)?
* **Problem:** Externe Mailinglisten und Newsletter-Tools führen unweigerlich zu Datensilos. Mutiert ein Mitglied im SSV-Portal oder ändert sich eine Vorstandsposition, sind externe Listen sofort veraltet. Zudem verlangen DSG und Schweizer Datenschutzrecht strikte Datensparsamkeit.
* **Lösung & Warum:** Der Mail-Verteiler operiert direkt auf den Live-Mitgliederdaten von Supabase (`public.members`, `member_licenses`, `member_functions`). Es existieren keine statischen Empfängerlisten – jede Verteilergruppe wird zur Laufzeit dynamisch berechnet. Scheidet ein Funktionär aus oder tritt ein Schütze aus dem Verein aus, ist er im selben Moment aus allen Verteilern entfernt.

### 2.2 Warum striktes BCC-Prinzip und Mailto-Limit (>30 Empfänger)?
* **Datenschutz (DSG):** Gemäss Datenschutzgesetz dürfen persönliche E-Mail-Adressen von Vereinsmitgliedern bei allgemeinen Rundschreiben niemals im sichtbaren `TO`- oder `CC`-Feld stehen.
* **Warum das Modul warnt & BCC erzwingt:** Der Verteiler platziert Adressen beim `mailto:`-Befehl zwingend im `BCC:`-Feld und blendet beim Kopieren einen gut sichtbaren Datenschutzhinweis ein.
* **Warum Mailto bei >30 Adressen gesperrt wird:** Betriebssysteme und Browser limitieren URL-Längen (`mailto:` URLs scheitern bei ca. 2000 Zeichen). Ausserdem blockieren viele SMTP-Provider Mails mit zu vielen Empfängern im Mailto-Header als Spam. Bei grossen Gruppen (>30) führt das Modul den Benutzer gezielt über die Zwischenablage («Adressen kopieren»).

### 2.3 Warum Trennung zwischen `primary_email` und `additional_email`?
* **Realität in Schützenvereinen:** Viele Mitglieder haben eine geschäftliche E-Mail (z. B. für Rechnungen oder tagsüber) und eine private E-Mail für Wettkampf-Aufgebote. Junioren/Nachwuchsschützen haben oft die E-Mail-Adresse der Eltern als Zweitadresse hinterlegt.
* **Warum sauberes Matching Pflicht ist:** 
  1. Wenn `primary_email` fehlt, muss automatisch auf `additional_email` zurückgegriffen werden, statt die Person fälschlicherweise als «ohne Mail» zu deklarieren.
  2. Im globalen Modell muss sichtbar sein, welche Adresse genutzt wird, und dem Anwender die Option gegeben werden, Zweitadressen mitzunehmen.

### 2.4 Warum Entkopplung von Transaktionsmails (`mail_logs`)?
* **Mensch vs. Maschine:** 
  - **Transaktionsmails** (Rechnungen, GV-Einladungen, Mietverträge) laufen vollautomatisch über Supabase Edge Functions (`send-email`), besitzen einen PDF-Anhang und werden im `mail_logs`-Audit-Trail unveränderlich protokolliert.
  - **Mail-Verteiler** ist ein operatives Arbeitswerkzeug für den Vorstand zur persönlichen Kontaktaufnahme. Der Versand erfolgt über das persönliche Postfach des Vorstandsmitglieds (z. B. `praesident@...`), damit Rückantworten direkt im Posteingang des Absenders ankommen.

---

## 3. Datenmodell & Adressauflösung

### 3.1 Relevante Tabellen

| Tabelle | Relevante Felder | Fachliche Invariante im Mail-Verteiler |
| :--- | :--- | :--- |
| `public.members` | `person_number`, `first_name`, `last_name`, `primary_email`, `additional_email`, `is_active`, `is_passive`, `is_honorary`, `deceased`, `club_exit_date` | **Hygienefilter:** `deceased = false` UND `club_exit_date IS NULL`. Mindestens eines der Flags `is_active`, `is_passive` oder `is_honorary` muss `true` sein. |
| `public.member_licenses` | `person_number`, `membership_category`, `is_active`, `exit_date` | Lizenzen steuern die Schützenkategorien (`G50m`, `G10m`). Nur aktive Lizenzen ohne Austrittsdatum (`is_active = true` AND `exit_date IS NULL`) qualifizieren für Schützen-Verteiler. |
| `public.member_functions` | `person_number`, `official_function_category`, `official_function_exit_date` | Steuert den Hauptverteiler **«Vorstand»**. Mitglieder mit aktiven Funktionen (`exit_date IS NULL OR exit_date > NOW()`) bilden diese Gruppe. |

### 3.2 Adress-Kaskade (Resolution Contract)

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Prüfe primary_email                                      │
│    - Bereinige Whitespace & ungültige Trennzeichen          │
│    - Validiere Format (regex: user@domain.tld)              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                Ist gültig?    ├──► JA  ──► Hauptadresse gesetzt
                               │
                               ▼ NEIN / LEER
┌─────────────────────────────────────────────────────────────┐
│ 2. Fallback auf additional_email                            │
│    - Bereinige Whitespace                                   │
│    - Validiere Format                                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                Ist gültig?    ├──► JA  ──► Ersatzadresse gesetzt (optisch markiert)
                               │
                               ▼ NEIN / LEER
┌─────────────────────────────────────────────────────────────┐
│ 3. Status "Keine E-Mail"                                    │
│    - Person verbleibt in der Tabelle mit Warn-Badge         │
│    - Automatisch von Export/Kopieren ausgeschlossen         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Systematischer Dokumenten-Vergleich

Um Verwechslungen bei Weiterentwicklungen durch KIs auszuschliessen, stellt folgende Matrix die Abgrenzung zwischen den verwandten Dokumenten dar:

| Kriterium | Dieses Dokument: [`docs/MAIL_VERTEILER.md`](MAIL_VERTEILER.md) | Transaktions-Spezifikation: [`docs/DOCUMENT_AND_MAIL_ENGINE_SPEC.md`](DOCUMENT_AND_MAIL_ENGINE_SPEC.md) | Stammdaten-Spezifikation: [`docs/MITGLIEDER_UND_SSV.md`](MITGLIEDER_UND_SSV.md) |
| :--- | :--- | :--- | :--- |
| **Hauptfokus** | Interaktiver Empfänger-Filter & Adress-Export für den Vorstand | Vollautomatische Server-Engine für PDF & SMTP-Versand | Single Source of Truth für Mitglieder, Lizenzen & SSV |
| **Ausführungskontext** | Frontend Client ([`vorstand/js/mail.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/mail.js)) | Deno Edge Functions (`generate-pdf`, `send-email`) | Supabase PostgreSQL Schema & SheetJS Diff-Engine |
| **Versandweg** | Lokaler Mail-Client des Vorstandsmitglieds (BCC / Mailto) | Server-Side SMTP via Gmail/Infomaniak API | Kein Versand (reine Datenverwaltung) |
| **Revisionssicherheit** | Keine Belegarchivierung (Ad-hoc Kommunikation) | WORM-Archivierung in `operatives-storage`, Swiss QR Norm | Audit-Trail in `member_history` |
| **Empfängerauswahl** | Dynamisch per Gruppen-Checkboxen & Einzelausschluss | Fest verdrahtet per `InvoiceOrder` oder GV-Teilnehmer | Gesamte Vereins- und Lizenzstruktur |
| **Anhang** | Keine Anhänge (reine Adressliste) | Binäre Vektor-PDFs (`pdf-lib`, SIX-Standard) | Keine |

---

## 5. Globales Tabellenmodell (`TableKit` Standard)

Im Rahmen der Systemharmonisierung muss die Empfängervorschau zwingend auf das **globale Modell** des Portals umgestellt werden:

1. **Standardisierte Tabellenstruktur:**
   - Einbettung in `table-responsive border rounded-3`.
   - CSS-Klassen: `table table-hover table-sm mb-0 align-middle`.
   - Keine proprietären Inline-Styles oder unkoordinierte Sortierfunktionen mehr.
2. **Interaktive Selektionslogik:**
   - Checkbox-Spalte mit `Master-Checkbox` im `thead` (Select All / Deselect All).
   - Jede Zeile besitzt eine Checkbox, damit Vorstandsmitglieder einzelne Personen temporär aus dem Verteiler entfernen können, ohne die Gruppe verlassen zu müssen.
3. **TableKit Integration:**
   - `TableKit.makeSortable`: Native Sortierung nach Name, E-Mail, Kategorie, Status.
   - `TableKit.setupColumnToggle`: Optionale Spalten (z.B. SSV-Nummer, Zweitadresse) ein-/ausblenden.
   - `TableKit.makeResizable`: Anpassbare Spaltenbreiten mit `localStorage`-Speicherung.
4. **Live-Filterung & Suchfeld:**
   - Integriertes Suchfeld über Name, Vorname und Mailadresse direkt über der Tabelle.
   - Schnellfilter-Pills: `Alle`, `Nur mit E-Mail`, `Ohne E-Mail`.
