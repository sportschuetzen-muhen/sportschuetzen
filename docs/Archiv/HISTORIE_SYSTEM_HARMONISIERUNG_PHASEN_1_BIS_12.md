# System-Harmonisierung, UI/UX & Zentralisiertes Rechnungswesen

> **Hinweis zur Dokumenten-Struktur:**  
> Das aktive, führende Fachdokument für das Rechnungswesen und den `RechnungsCore` ist ausgelagert in:  
> 👉 [`docs/RECHNUNGSWESEN.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/RECHNUNGSWESEN.md)  
> Das vorliegende Dokument dient als übergeordneter Architektur-Leitfaden für UI/UX-Harmonisierung und dokumentiert den historischen Migrations- und Einführungsfahrplan (Phasen 1–12).

**Stand:** 2026-09-27 (Archiv/Referenz)  
**Status:** Konzept & Migrations-Historie  

---

## 1. Übergreifende System-Architektur

### Zentralisierte Engines für PDF und Mail
- **Shared Services:** `pdf-engine.js` und `mail-engine.js` müssen als universelle Shared Services fungieren.
- **Entkopplung:** Spezialmodule wie `rechnungen-templates.js` oder `manager-mail.js` speisen lediglich typisierte JSON-Payloads ein.

### UI-Harmonisierung und Layout-Standardisierung
- **Flächendeckender Einsatz von `ui-table-kit.js`:** Das Tabellen-Kit sollte konsistent für Listen in `mitglieder-list.js`, `vermietung-list.js` und `buchhaltung-ui.js` mit identischen Filterzeilen, Sortierindikatoren und mobilem Card-Layout verwendet werden.
- **Einheitliches Modal- und Drawer-Framework:** Modale Dialoge (`buchhaltung-modals.js`, Rechnungs-Overlays) benötigen einen standardisierten Container mit einheitlicher Platzierung primärer Aktionen (Rechtsbündig: Abbrechen / Speichern) und Backdrop-Handling.
- **Systemweite Status-Tokens:** Statuswerte (offen, bezahlt, storniert, provisorisch) sollten über modulübergreifende CSS-Badges mit fester Farbsemantik geregelt werden, statt über modulspezifische Inline-Styles.

### UX-Optimierung und Reaktivität
- **Optimistische UI-Updates:** Bei Massenaktionen oder Statusänderungen (z. B. Haken bei Jahresbeiträgen) sollte die Oberfläche sofort reagieren und die Synchronisation im Hintergrund via Supabase mit Rollback-Möglichkeit bei Verbindungsfehlern abwickeln.
- **Schutz vor Eingabeverlust:** Formulare in Schnellerfassungen (`jahresbeitrag-schnellerfassung.js`, `resultate-input.js`) sollten Formulardaten bei unbeabsichtigtem Tab-Wechsel temporär im `sessionStorage` sichern.

### Architektur-Synergien mit Supabase
- **Row Level Security (RLS) als Sicherheitsanker:** Die Berechtigungsprüfungen aus `auth.js` und `logins/` müssen zwingend auf Datenbankebene über Postgres-RLS (z. B. Rollen wie Vorstand, Kassier, Revisor) durchgesetzt werden, nicht nur über DOM-Sichtbarkeiten.
- **PostgreSQL Views für Auswertungen:** Komplexe Berechnungen aus `buchhaltung-controlling.js` und `jahresmeisterschaft-core.js` sollten von clientseitigen JavaScript-Schleifen in Supabase Database Views oder RPC-Funktionen ausgelagert werden.
- **Dokumentenverwaltung per Supabase Storage:** Generierte Belege und Rechnungs-PDFs sollten direkt in Storage-Buckets abgelegt und in den Tabellen nur über Pfade referenziert werden, um die Nutzlast der Datenbanktabellen minimal zu halten.

---

## 2. Zentralisierung von Rechnungswesen und Vorlagenverwaltung

Das geschilderte Problem trifft den Kern der Software-Architektur: Wenn Module wie das **Inventar** (z. B. Munitions-, Material- oder Bekleidungsverkäufe) oder die **Vermietung** eigene PDF-Generatoren (`inventar-pdf.js`) mitbringen, führt das unweigerlich zu **Inkonsistenzen im Vereins-Branding**, getrennten Nummernkreisen und einem Albtraum für den Kassier bei der Nachverfolgung von Zahlungen.

Ja: **Rechnungswesen und Vorlagenverwaltung gehören zwingend zentralisiert.** Das Inventar sollte **keine eigene Rechnungs-Engine** betreiben, sondern lediglich als *Forderungs-Auslöser* fungieren.

### 2.1 Das Kernproblem: Warum das aktuelle Konzept scheitert

* **Architektur-Silo:** `inventar-pdf.js` zeichnet ein Dokument unabhängig von `rechnungen-templates.js` und `rechnungen-layouts.js`. Änderungen am Vereinslogo (`Muhen_32_mit_Namen_roter_Balken.png`), der QR-IBAN oder den Absenderangaben greifen im Inventar schlicht nicht.
* **Risiko bei QR-Rechnungen (Schweizer Standard):** Der Schweizer QR-Zahlteil (105 × 210 mm) unterliegt strengen typografischen und masslichen Vorgaben der SIX. Wenn zwei verschiedene Skripte den QR-Code und die Trennlinien berechnen, riskiert man fehlerhafte Belege, die am Postschalter oder beim E-Banking-Scanning abgewiesen werden.
* **Verlust des Rechnungs-Lifecycles:** Eine Rechnung ist mehr als ein PDF. Sie besitzt Statuswerte (`entwurf`, `gestellt`, `faellig`, `bezahlt`, `storniert`). Wenn das Inventar nur ein PDF druckt, ohne einen vollwertigen Rechnungsdatensatz in Supabase zu erzeugen, weiss der Kassier nicht, ob und wann die Zahlung via CAMT.054 (Bankabgleich) eingetroffen ist.

---

### 2.2 Die Ziel-Architektur: Zentrales Modul & Service-Schichten

Das Rechnungsmodul wird in zwei klar getrennte Aufgabenbereiche aufgeteilt:

```
┌────────────────────────────────────────────────────────┐
│  FACHMODULE (Auslöser)                                 │
│  - Inventar (Warenkorb / Journal)                      │
│  - Vermietung (Schützenhaus / Verträge)                │
│  - Jahresbeitrag (Mitgliederbeiträge)                  │
└───────────────────────────┬────────────────────────────┘
                            │ übergibt Auftrags-Payload (JSON)
                            ▼
┌────────────────────────────────────────────────────────┐
│  ZENTRALES MODUL: RECHNUNGEN & FORDERUNGEN             │
│  - Nummernkreisvergabe (z. B. RE-2026-0042)           │
│  - QR-Referenz-Generierung                             │
│  - Speicherung in Supabase (`rechnungen`, `posten`)    │
│  - Mahnwesen & Statusüberwachung                       │
└───────────────────────────┬────────────────────────────┘
                            │ nutzt
                            ▼
┌────────────────────────────────────────────────────────┐
│  SHARED SERVICE: VORLAGEN & PDF-ENGINE                 │
│  - Zentrale Vorlagen (rechnungen-templates.js)        │
│  - Layouts & Briefkopf (rechnungen-layouts.js)        │
│  - QR-Bill Generator (SIX-konform)                    │
│  - Zentrale CI/CD-Einstellungen (Logo, Farben, Schrift)│
└────────────────────────────────────────────────────────┘
```

---

### 2.3 Datenbank-Zusammenspiel in Supabase

In Supabase sollte eine einheitliche Datenstruktur für alle Vereinsrechnungen gelten, unabhängig davon, woher sie stammen:

```sql
-- Zentrale Rechnungen
CREATE TABLE rechnungen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rechnungsnummer TEXT UNIQUE NOT NULL,      -- z.B. 2026-0158
    quelle_modul TEXT NOT NULL,                 -- 'inventar', 'vermietung', 'jahresbeitrag', 'manuell'
    quelle_id UUID,                             -- Referenz z.B. auf inventar_transaktion.id
    empfaenger_typ TEXT NOT NULL,              -- 'mitglied' oder 'extern'
    empfaenger_id UUID REFERENCES mitglieder(id),
    empfaenger_adresse JSONB NOT NULL,         -- Snapshot von Name, Strasse, PLZ, Ort
    datum DATE NOT NULL DEFAULT CURRENT_DATE,
    faellig_am DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'offen',       -- 'entwurf', 'offen', 'bezahlt', 'gemahnt', 'storniert'
    total_betrag NUMERIC(10,2) NOT NULL,
    qr_referenz TEXT,                           -- 27-stellige QRR oder Creditor Reference
    pdf_storage_path TEXT,                      -- Link zum Storage Bucket
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Rechnungspositionen
CREATE TABLE rechnungspositionen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rechnung_id UUID REFERENCES rechnungen(id) ON DELETE CASCADE,
    pos_nr INT NOT NULL,
    titel TEXT NOT NULL,
    beschreibung TEXT,
    menge NUMERIC(10,2) NOT NULL DEFAULT 1,
    einzelpreis NUMERIC(10,2) NOT NULL,
    total_preis NUMERIC(10,2) NOT NULL,
    buchungskonto_haben TEXT                     -- z.B. Ertragskonto Munitionsverkauf (3200)
);
```

---

### 2.4 UI- & UX-Verbesserungen

#### A. Übergang vom Inventar zur Rechnung (Nahtloser Workflow)

* **Status Quo:** Im Inventar klickt man auf „PDF drucken“; es öffnet sich ein isoliertes Dokument.
* **Bessere UX:**
  1. Im Warenkorb (`inventar-cart.js`) gibt es zwei Optionen: **„Bar/Twint bezahlt“** (erzeugt Quittung) oder **„Auf Rechnung“**.
  2. Bei Klick auf „Auf Rechnung“ öffnet sich ein modaler Dialog:
     * Mitglied auswählen (automatische Übernahme der Adresse aus `mitglieder`).
     * Zahlungsziel (z. B. 30 Tage default).
     * Button: **„Rechnung erstellen & QR-PDF öffnen“**.
  3. Das System legt den Datensatz in Supabase an, leitet die Rechnungsnummer zurück und zeigt direkt das standardisierte PDF im Vorstands-Viewer an.
  4. Im Inventar-Journal steht nun direkt ein anklickbarer Chip: `Rechnung #2026-089 (Offen)`.

#### B. Zentrale Rechnungsübersicht mit Herkunfts-Filtern

* In der Hauptansicht des Rechnungsmoduls erhält die Tabelle Filter nach Quelle:
  `[ Alle ] [ Jahresbeiträge ] [ Inventar / Material ] [ Vermietung ] [ Manuell ]`
* Der Kassier sieht auf einen Blick:
  * Welche Inventar-Rechnungen sind noch unbezahlt?
  * Kann Zahlungseingänge via Bankimport automatisiert abgleichen, ohne jemals ins Inventar-Modul wechseln zu müssen.

#### C. Zentraler Einstellungsbereich: "Design & Druckvorlagen"

* Statt Code-Anpassungen in einzelnen JS-Dateien erhält der Vorstand unter **Einstellungen > Vorlagen**:
  * **Briefkopf:** Upload Vereinslogo, Ausrichtung (links/rechts), Absenderzeile.
  * **Bankverbindung:** IBAN / QR-IBAN, BESR-ID, Bankname.
  * **QR-Rechnung Einstellungen:** Standard-Zahlungszweck, Währung (CHF), Rundungsregeln.
  * **Live-Vorschau:** Ein Split-Screen mit Formular links und synchroner PDF-Vorschau (Canvas/PDF.js) rechts.

---

### 2.5 Verbindlicher Rechnungs-Lebenszyklus, Mutationsgrenzen & Adress-Kontrakt

Um Fehler bei künftigen Code-Erweiterungen zu verhindern, sind hier die fachlichen Hintergründe (**das «Warum»**) und die verbindlichen Datenverträge definiert:

#### A. Das «Warum» hinter den Mutations- und Löschgrenzen
1. **Warum ist die Bearbeitung nach dem Rechnungsversand gesperrt?**  
   Sobald eine Rechnung per E-Mail versendet wurde (`mail_status === 'versendet'`), befindet sich das offizielle PDF mit unveränderlicher Rechnungsnummer und QR-Referenz beim Empfänger. Würde der Vorstand die Rechnung danach im System mutieren (z. B. Betrag, Positionen oder Debitor anpassen), entstünde eine Beleg-Diskrepanz zwischen dem Dokument beim Kunden und den Forderungs- und Buchungsdaten in der Vereinsbuchhaltung.  
   *Regel:* Nach dem Versand ist eine In-Place-Bearbeitung strikt gesperrt. Korrekturen müssen über Stornierung (`RechnungsCore.cancelInvoice`) oder vor Zahlungseingang über kontrolliertes Löschen und Neuerstellen erfolgen.
2. **Warum sind bezahlte Rechnungen absolut unveränderlich?**  
   Sobald eine Rechnung ganz oder teilweise bezahlt wurde (`status === 'bezahlt'` oder `total_paid > 0`), existieren verknüpfte Buchungssätze in `public.accounting_journal` und Zahlungsbelege in `public.invoice_payments`. Das Löschen oder Ändern einer bezahlten Rechnung verstösst gegen Schweizer Rechnungslegungsrecht (OR 957ff) und Grundsätze ordnungsmässiger Buchführung (GoBD).  
   *Regel:* Weder Bearbeiten noch Löschen ist für bezahlte Rechnungen zulässig.
3. **Warum ist der Typ «Jahresbeitrag» im Rechnungs-Cockpit gesperrt?**  
   Jahresbeiträge basieren auf der Vereins-Gebührenordnung, Lizenzen und Schiessprogrammen. Sie werden vom Modul `jahresbeitrag-overview.js` synchronisiert. Manuelle Eingriffe im Rechnungsmodul würden die Konsistenz mit `contributions_header` zerstören.

#### B. Das «Warum» hinter dem DIN 5008- & QR-Adress-Kontrakt
* **Rechtsform-Unterscheidung im Adressfenster:**  
  Nach DIN 5008 und SIX SPC 0200 1 bestimmt die erste Zeile im Adressfenster, ob der Empfänger eine juristische Person (Firma/Verband) oder eine natürliche Person (Privatperson/Mitglied) ist.
  - **Privatperson / Mitglied:**  
    Zeile 1: Anrede (`Herr` / `Frau`) im normalen Schriftgewicht.  
    Zeile 2: `[Vorname Nachname]` im normalen Schriftgewicht (**niemals fett**, niemals Name doppelt!).  
    *Zwingende Invariante:* Das Feld `firma` muss zwingend **leer (`""`) oder `null`** sein!
  - **Firma / Verein / Institution:**  
    Zeile 1: `[Firmenname]` im Fettdruck (**bold**).  
    Zeile 2: Optionale Abteilung oder Zusatz (`abteilung`).  
    Zeile 3: Ansprechperson mit Anrede (`Herr` / `Frau` `[Vorname Nachname]` im normalen Schriftgewicht).
  - **Externe Kontakte:**  
    Bei `typ === 'privat'` darf der Personenname niemals in das Feld `firma` geschrieben werden. Bei `typ === 'firma'` ist `firma` ein Pflichtfeld.

#### C. Automatische PDF-Synchronisation & Cache-Busting
* **Vollautomatische Neugenerierung:**  
  Jede Mutation an einer Rechnung (Erstellung, Statusänderung, Zahlungsverbuchung, Storno) ruft im Hintergrund unmittelbar `RechnungsCore.renderPdf(invoiceId, { forceRecreate: true })` auf.
* **Cache-Busting:**  
  Weil Browser und Cloudflare PDFs aggressiv zwischenspeichern, müssen alle Frontend-Aufrufe (`rnOpenInvoicePdf`) zwingend mit einem Zeitstempel-Query-Parameter versehen werden (`?t=${Date.now()}`).

---

## 3. Konkreter Fahrplan zur Umsetzung

1. **`inventar-pdf.js` entkernen:**
   Die Datei sollte keine eigene Rechnungslayout-Logik mehr enthalten. Stattdessen wird sie entweder gelöscht oder dient nur noch als Adapter, der die Warenkorb-Daten in das Standard-Rechnungsformat konvertiert.
2. **Standard-Payload definieren (`InvoiceOrder`):**
   ```javascript
   // Einheitliches Übergabeformat für alle Module
   const invoicePayload = {
     source: { module: 'inventar', id: cart.transactionId },
     recipient: { memberId: selectedMember.id, name: selectedMember.fullName, address: ... },
     items: cart.items.map(item => ({
       title: item.bezeichnung,
       quantity: item.qty,
       unitPrice: item.preis,
       total: item.qty * item.preis,
       account: '3200' // Ertragskonto Inventar
     })),
     dueDateDays: 30
   };

   // Aufruf des zentralen Services
   const invoice = await RechnungsCore.createInvoice(invoicePayload);
   PDFEngine.renderAndDownloadInvoice(invoice.id);
   ```
3. **QR-Rechnungslogik in `rechnungen-layouts.js` konsolidieren:**
   Sicherstellen, dass der Einzahlungsschein einmal sauber nach SIX-Spezifikation (Swiss QR-Code mit Perforationsrahmen) gebaut ist und von allen Belegen genutzt werden kann.
4. **Buchhaltungskopplung schliessen:**
   Sobald die Rechnung in Supabase gespeichert ist, wird automatisch eine Offene-Posten-Buchung (Debitoren an Ertrag Inventar) erzeugt.

---

## 4. Fortschritts- & Roadmap-Tracking (Live-Status)

**Status-Legende:**  
✅ **Abgeschlossen** | 🔄 **In Bearbeitung** | ⏳ **Geplant**

| Phase | Bereich / Thema | Status | Umgesetzte Artefakte / Details |
|---|---|:---:|---|
| **Phase 1** | **Datenmodell & Lifecycle** | ✅ | Status-Maschine: `entwurf` ➔ `gestellt`/`offen` ➔ `teilbezahlt` ➔ `bezahlt` (plus `storniert` & `gemahnt`). Unveränderlicher Adress-Snapshot (`recipient_address` JSONB). Saubere Trennung: Rechnung (Forderung) ➔ Zahlung (`invoice_payments`) ➔ Buchungssatz (`accounting_journal`). |
| **Phase 2** | **Vertrag `InvoiceOrder`** | ✅ | Standardisiertes DTO-Payload für rufende Module (`source`, `recipient`, `positions`, `options`). Strenge Validierung in `RechnungsCore.validateOrder()`. |
| **Phase 3** | **SQL-Migration 25** | ✅ | [`supabase/migrations/25_central_invoicing_and_payments.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/25_central_invoicing_and_payments.sql):<br>• `public.invoices` erweitert um `source_module`, `source_id`, `recipient_address`, `open_amount`, `due_date`, `currency`, `cancel_reason`<br>• Neue Tabelle `public.invoice_payments` (Teilzahlungen, Bank, TWINT, Bar, CAMT.054)<br>• Saldo-Trigger `trg_invoice_payments_sync`<br>• Atomare RPC-Funktion `record_invoice_payment`<br>• RLS-Policies für Authenticated & Anon Dev |
| **Phase 4** | **`RechnungsCore` Implementierung** | ✅ | In [`vorstand/js/rechnungen/rechnungen-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js):<br>• `createInvoice(order)`: Nummernkreis, Adress-Snapshot, Status `entwurf`<br>• `issueInvoice(id)`: Rechnungsfestschreibung, Status `offen`<br>• `recordPayment(id, input)`: Teil- und Vollzahlungen, Restsaldo-Berechnung, FiBu-Buchungssatz<br>• `cancelInvoice(id, reason)`: Revisionssichere Stornierung<br>• `getInvoice(id)`: Aggregierte Abfrage (Kopf + Posten + Zahlungen)<br>• UI-Integration: [`rechnungen-actions.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-actions.js) & [`rechnungen-ui.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-ui.js)<br>• **100% automatisierte Unit-Tests bestanden** (`test_rechnungs_core.js`) |
| **Phase 5** | **Inventar-Integration (Client 1)** | ✅ | [`inventar-cart.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/inventar/inventar-cart.js) entkoppelt:<br>• Nutzt `RechnungsCore.createInvoice(invoiceOrder)` für Materialverkäufe (`MV-`) & Kautionen/Depots (`DP-`)<br>• Direkte `invoices`-Upserts & redundante ID-Generierung entfernt<br>• Rechnungs-Script-Ladefolge in [`vorstand/index.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/index.html) vor `inventar-core.js` gelegt<br>• Bar-FiBu-Buchungssätze in `accounting_journal` auf `BIGSERIAL` bereinigt<br>• [`inventar-pdf.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/inventar/inventar-pdf.js) verbleibt rein als Signatur-/Ausleihquittung (ohne Rechnungslogik) |
| **Phase 6** | **PDF-Engine Zentralisierung** | ✅ | In [`rechnungen-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js) & [`pdf-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/pdf-engine.js):<br>• `RechnungsCore.renderPdf(id)` ist die zentrale Rechnungsdruck-Schnittstelle<br>• `rnGeneratePDFOnly` in [`rechnungen-actions.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-actions.js) und `pdf-engine.js` delegiert primär an `RechnungsCore.renderPdf`<br>• Automatische Ablage im Storage Bucket `operatives-storage` und Update von `pdf_url` |
| **Phase 7** | **Swiss QR-Bill (SIX SPC 0200 1)** | ✅ | In [`pdf-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/pdf-engine.js):<br>• `createSwissQrBillPayload` vollständig SIX SPC 0200 1 konform (Absenderadresse mit Strasse/Hausnummer, strukturierte Empfängerdaten, Referenztypen `QRR`, `SCOR`, `NON`, 140-Zeichen Begrenzung)<br>• Browser-Fallback mit exakter Schweizer Kreuz Geometrie (7×7mm) und Perforationslinie bei 105mm |
| **Phase 8** | **Vermietung-Integration (Client 2)** | ✅ | In [`vermietung-manager.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/vermietung/vermietung-manager.js):<br>• `ensureRentalInvoice(d)` erstellt automatisiert eine `InvoiceOrder` für Reservierungen<br>• `vermietungAktion('bestaetigen')` bucht Zahlungseingänge über `RechnungsCore.recordPayment()`<br>• `vermietungAktion('stornieren')` storniert offene Rechnungen über `RechnungsCore.cancelInvoice()` |
| **Phase 9** | **Jahresbeiträge-Integration (Client 3)** | ✅ | In [`jahresbeitrag-overview.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresbeitrag/jahresbeitrag-overview.js):<br>• `ensureInvoiceCreatedRemote` erzeugt Rechnungen für Mitgliederbeiträge via `RechnungsCore.createInvoice()` inklusive Adress-Snapshot<br>• `jbSaveZahlung()` verbucht Zahlungen via `RechnungsCore.recordPayment()`<br>• `jbGenerateInvoicePdfRemote()` nutzt `RechnungsCore.renderPdf()` |
| **Phase 10** | **CAMT.054 / 053 Bankabgleich** | ✅ | In [`buchhaltung-bank.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/buchhaltung/buchhaltung-bank.js) & [`jahresbeitrag-bank.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresbeitrag/jahresbeitrag-bank.js):<br>• Gematchte Banktransaktionen verbuchen Rechnungszahlungen direkt über `RechnungsCore.recordPayment()`<br>• Batch-Bankbuchung im Jahresbeitrag synchronisiert `invoice_payments` und `invoices`<br>• `accounting_journal.id` Bereinigung (Postgres `BIGSERIAL`) verhindert SQL-Typenkonflikte |
| **Phase 11** | **PDF-Geometrie & Atomare Nummernvergabe** | ✅ | Behebung der 5 kritischen Sollbruchstellen im Rechnungs- und PDF-Betrieb:<br>• **Dynamischer $Y$-Cursor & Text-Wrapping:** Keine starre `length > 8` Schwelle; automatischer Textumbruch (`wrapText`) mit flexibler Zeilenhöhe in [`supabase/functions/generate-pdf/index.ts`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/functions/generate-pdf/index.ts)<br>• **Intelligenter Lookahead:** Verhindert "Orphan Payment Slips" (leere Folgeseiten nur mit QR-Zahlteil); hält passende Rechnungen exakt auf 1 Seite<br>• **Logo-Handling:** Zentral in `operatives-storage/assets/logo.png`, In-Memory-Caching im Deno-Scope (`cachedLogoBytes`) und dynamische Skalierung via `scaleToFit()` (keine Verzerrung)<br>• **Atomare Rechnungsnummern:** Migration [`26_atomic_invoice_numbers.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/26_atomic_invoice_numbers.sql) (`invoice_number_seq` & Stored Procedure `next_invoice_number()`) verhindert Race Conditions im Frontend<br>• **UTF-8 & WinAnsi-Schutz:** `sanitizeText()` schützt `pdf-lib` vor Zeichensatz-Crashes bei Schweizer Umlauten und Sonderzeichen |
| **Phase 12** | **Zentraler Dokumenten- & Vorlagen-Pool** | ✅ | Entkopplung von Layout & Textbausteinen aus dem Rechnungsmodul in eine eigenständige Modul-Kachel:<br>• **Schritt 1 (DB):** Migration [`27_document_templates_and_clauses.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/27_document_templates_and_clauses.sql) mit `document_templates`, `document_template_clauses`, View `invoice_layouts` & RLS ✅<br>• **Schritt 2 (UI):** Kachel „Dokumenten-Vorlagen“ (`templates-ui.js`, Navigation in `index.html` & `main.js`) ✅<br>• **Schritt 3 (Engine):** Upgrade Edge Function [`generate-pdf/index.ts`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/functions/generate-pdf/index.ts) mit Base64-Inlining, `sanitizeWinAnsiText`, SIX SPC 0200 1 Nachlaufseite, dynamischen Mietvertragsklauseln, GV-Einladung (`generate-gv-invitation`) & WORM-Archivierung ✅<br>• **Schritt 4 (GV-Anbindung):** Umfragen/GV Controlling entkoppelt, PDF-Engine & Mail-Engine voll integriert ✅<br>• **Schritt 5 (E2E-Tests & Deployment):** Live-Deployment auf CT 117, Container-Reload & erfolgreiche Verifikation im UI ✅ |

---

## 5. Changelog der Umsetzungen

### [2026-09-27] Phase 12 / Schritt 5 abgeschlossen: Live-Deployment & E2E-Verifikation PDF-Engine
1. **Live-Deployment Edge Function auf CT 117 (`generate-pdf`):**
   * Vollständiger Transfer von `index.ts` und `logo-base64.ts` nach `/opt/supabase/docker/volumes/functions/generate-pdf/`.
   * Hot-Reload des `supabase-edge-functions`-Containers.
2. **Härtung Template-Resolution & Platzhalterersetzung:**
   * Vorlagen-Vorschau in [`templates-ui.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/vorlagen/templates-ui.js) übergibt atomare `templateId` und `templateCode`.
   * Edge Function löst spezifische Vorlagen (`gv_einladung_normal` vs. `gv_einladung_wahljahr`) auf und ersetzt `{gv_nummer}`, `{rechnungsjahr}` und `{jahr}` deterministisch.
3. **End-to-End Test erfolgreich:**
   * Testaufruf von `generate-gv-invitation` generiert revisionssicheres PDF im WORM-Archiv (`operatives-storage/archive/2026/gv/GV-2026.pdf`, HTTP 200, 38 KB) und öffnet die Vorschau ohne Fehler.

### [2026-09-27] Phase 12 / Schritt 4 abgeschlossen: GV-Modul Anbindung an PDF- & Mail-Engine
1. **Zentraler Generator `window.gvGenerateInvitationPdf` in `pdf-engine.js`:**
   * Validierung in `generatePdfViaEngine` für Aktionen mit `action: 'generate-gv-invitation'` und `year` freigegeben.
   * Wrapper `window.gvGenerateInvitationPdf(year, gvData, options)` generiert die Broschüre inkl. Jahresprogramm und aktualisiert `gv_instances.doc_einladung_url`.
2. **`runGVTool('genPDF')` in `umfragen-controlling.js` vollständig aktiviert:**
   * Liest Jahr, Wahljahr-Status, Datum, Zeit, Ort und GV-Nummer atomar aus dem aktuellen GV-State.
   * Ruft die zentrale Edge Function auf, sichert das PDF in Supabase Storage (`operatives-storage/gv/{year}/GV_Einladung_{year}.pdf`) und öffnet das fertige Dokument im neuen Browser-Tab.
   * Aktualisiert den Platzhalter `{{Dokument_Einladung}}` und rendert die Embedded-Liste (`#gv-list-embedded`) unmittelbar neu.
3. **Automatischer E-Mail-Anhang im GV-Mail-Wizard:**
   * `openGVMailWizard` prüft verknüpfte Einladungs-PDFs über standardisierte Platzhalternamen (`{{Dokument_Einladung}}`, `Dokument Einladung`, `doc_einladung_url`).
   * `executeGVMailSend` übergibt die generierte PDF-Datei als Storage-Attachment an `sendMailViaEngine`, sodass jedes Mitglied das Einladungs-PDF direkt als E-Mail-Anhang erhält.

### [2026-09-27] Phase 12 / Schritt 3 abgeschlossen: Edge Function generate-pdf Upgrade & Harmonisierung
1. **Logo Base64-Inlining (`logo-base64.ts`):**
   * Kompiliertes Vereinslogo als Base64-Konstante direkt im Function-Scope eingebunden.
   * `getOrLoadLogoBytes()` garantiert 0 ms Latenz bei Cold-Starts auf Deno Deploy (mit optionalem Supabase-Storage Fallback).
2. **Zweistufige Text-Normalisierung (`sanitizeWinAnsiText`):**
   * Stufe 1: Typografische Anführungszeichen (`«», “”, „“`), Gedankenstriche (`–, —`), Aufzählungspunkte (`•`) und geschützte Leerzeichen (`\u00A0, \u202F`) normalisiert.
   * Stufe 2: Native europäische Umlaut-Garantie (`ä, ö, ü, Ä, Ö, Ü, é, è, ê, à, â, ç`) bei gleichzeitig 100%igem WinAnsi-Crash-Schutz vor nicht darstellbaren Zeichen (> 255).
3. **SIX SPC 0200 1 QR-Zahlteil Nachlaufseite & Belegbezugskopf:**
   * Platzbudget-Prüfung ($Y_{\text{cursor}} - H_{\text{block}} < 111\text{ mm}$).
   * Bei mehrseitigen Dokumenten wird auf der dedizierten Nachlaufseite ein standardisierter Belegbezugs-Kopf mit Rechnungs-Nr., Empfängername, Betrag und Schnittlinie gerendert.
4. **Mietvertrag Schützenstube Rüteli (Dynamische Klauseln):**
   * Vollständig aus `document_templates` und `document_template_clauses` gespeist (Ziffern 1–8).
   * Deterministisches 2-Seiten-Budgeting mit Benützungsordnung auf Seite 1 & 2, Übergabeprotokoll/Checkliste, Unterschriften und QR-Zahlteil auf Seite 2.
5. **Neuer Action-Handler `generate-gv-invitation`:**
   * Action `{ action: 'generate-gv-invitation', year }` implementiert.
   * Generiert eine mehrseitige GV-Einladungsbroschüre mit Traktandenliste aus `document_template_clauses` und dynamischem Jahresprogramm aus `public.termine` mit wiederholendem Tabellenkopf und 2-Pass Seitennummerierung ("Seite X von Y").
   * Automatische Verknüpfung der generierten PDF-URL in `public.gv_instances.doc_einladung_url`.
6. **WORM-Archivierung (OR 957ff):**
   * Vor Neu-Generierung wird geprüft, ob unter `operatives-storage/archive/{year}/{category}/{recordId}.pdf` bereits ein unveränderbares WORM-Belegarchiv existiert.
   * Bei existierenden Belegen wird direkt das revisionssichere Archiv-Blob geliefert.
   * Neu erzeugte Dokumente werden zusätzlich unveränderlich im Archiv-Pfad gesichert.

### [2026-09-27] Phase 11 abgeschlossen: PDF-Geometrie, Lookahead & Atomare Rechnungsnummern
1. **Behebung Schwachstelle 1 (Positionszähler-Irrtum & Text-Wrapping):**
   * Starre Begrenzung `positions.length > 8` komplett eliminiert.
   * `wrapText` bricht lange Beschreibungen dynamisch um. Tabellenzeilen berechnen ihre Höhe flexibel anhand der Zeilenzahl.
   * Fließender Y-Cursor steuert Paginierung präzise über `minAllowedY`.
2. **Behebung Schwachstelle 2 (Orphan Payment Slip Prevention):**
   * Intelligenter Lookahead prüft vorab die Gesamthöhe aller Positionen + Schlusstext.
   * Wenn Positionen über den 105-mm-Schnitt passen, bleibt das Dokument strikt einseitig.
   * Bei mehrseitigen Dokumenten wird Seite 1 bis 22 mm Rand gefüllt; die Folgeseite bindet den QR-Zahlteil nahtlos ein.
3. **Behebung Schwachstelle 3 (Logo-Verzerrung & Storage-Latenz):**
   * Vereinslogo in `operatives-storage/assets/logo.png` zentralisiert.
   * `cachedLogoBytes` im globalen Deno-Scope verhindert redundante Downloads bei Folgeaufrufen.
   * Proportionale Skalierung mit `scaleToFit(38 * MM, 18 * MM)` verhindert jede Streckung/Stauchung von Bannern oder Quadraten.
4. **Behebung Schwachstelle 4 (Atomare Rechnungsnummern in PostgreSQL):**
   * Migration [`26_atomic_invoice_numbers.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/26_atomic_invoice_numbers.sql) etabliert `public.invoice_number_seq` und `public.next_invoice_number(prefix, year)`.
   * [`rechnungen-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js) ruft vor dem Insert atomar die Sequenz ab.
   * Dialoge laden über `RechnungsCore.fetchNextInvoiceNumber` asynchron die nächste offizielle Nummer.
5. **Behebung Schwachstelle 5 (UTF-8 & Schweizer Umlaute):**
   * `sanitizeText()` normalisiert NFC-Unicode, wandelt typografische Bindestriche/Anführungszeichen und fängt WinAnsi-Inkompatibilitäten sicher ab.
6. **Strikte Entkopplung & Decommissioning:**
   * Browserbasierter `jsPDF`-Fallback vollständig dekommissioniert; Fehler werden im UI klar angezeigt.

### [2026-09-27] Phase 6 bis 10 abgeschlossen: Systemweite Harmonisierung
1. **PDF-Engine & SIX Swiss QR-Bill (Phasen 6 & 7):**
   * [`pdf-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/pdf-engine.js) `createSwissQrBillPayload` nach SIX SPC 0200 1 standardisiert: Strasse des Gläubigers, strukturierter Debitor, QRR/SCOR/NON-Referenz-Validierung, 140 Zeichen Textgrenze.
   * `RechnungsCore.renderPdf(invoiceId)` als universelle Ausgabe-Schnittstelle in [`rechnungen-actions.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-actions.js) und `pdf-engine.js` verankert.
2. **Vermietung integriert (Phase 8):**
   * [`vermietung-manager.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/vermietung/vermietung-manager.js) mit `ensureRentalInvoice()` ausgestattet.
   * Bestätigte Mietverträge verbuchen Zahlungen via `RechnungsCore.recordPayment()`; Stornierungen rufen `RechnungsCore.cancelInvoice()`.
3. **Jahresbeiträge harmonisiert (Phase 9):**
   * [`jahresbeitrag-overview.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresbeitrag/jahresbeitrag-overview.js) erzeugt Rechnungen via `RechnungsCore.createInvoice()`.
   * Manuelle Beitragszahlungen in `jbSaveZahlung` synchronisieren `RechnungsCore.recordPayment()`.
   * PDF-Druck ruft `RechnungsCore.renderPdf()`.
4. **CAMT Bankabgleich synchronisiert (Phase 10):**
   * [`buchhaltung-bank.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/buchhaltung/buchhaltung-bank.js) und [`jahresbeitrag-bank.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresbeitrag/jahresbeitrag-bank.js) verbuchen erkannte Rechnungen und Beiträge via `RechnungsCore.recordPayment()`.
   * Postgres-Sequence-Schlüssel für `accounting_journal` bereinigt.

### [2026-09-27] Phase 5 abgeschlossen: Inventar-Migration
1. **`inventar-cart.js` vollständig auf `InvoiceOrder` umgestellt:**
   * Materialverkauf (`verarbeiteVerkaufNachbereitung`) und Kautionsbelege (`verarbeitePfandRechnungen`) rufen ausschliesslich `window.RechnungsCore.createInvoice()` auf.
   * `saveInventarInvoiceToSupabase` entlastet; keine isolierten SQL-Einträge mehr im Fachmodul.
2. **Skript-Reihenfolge korrigiert:** `rechnungen-core.js` wird in `vorstand/index.html` vor allen Fachmodulen geladen.
3. **Kassabuch-Journalbuchungen bereinigt:** Manuelle String-Schlüssel bei `accounting_journal.id` entfernt; Postgres `BIGSERIAL` vergibt fortlaufende Buchungsnummern.

### [2026-09-27] Phasen 1 bis 4 abgeschlossen: Rechnungs-Kern & Lifecycle
1. **Migration 25 angelegt:** [`25_central_invoicing_and_payments.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/25_central_invoicing_and_payments.sql)
2. **`RechnungsCore` implementiert:** [`rechnungen-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js) enthält alle Lebenszyklus-Methoden (`createInvoice`, `issueInvoice`, `recordPayment`, `cancelInvoice`, `getInvoice`, `getOpenInvoices`, `getPayments`).
3. **Zahlungsmodal & Aktionen umgebaut:** [`rechnungen-actions.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-actions.js) unterstützt jetzt Teilzahlungen mit Live-Neuberechnung.
4. **UI-Cockpit erweitert:** [`rechnungen-ui.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-ui.js) rendert Status-Tokens für `Teilbezahlt`, `Entwurf` und `Storniert`.
5. **Automatische Tests:** 8/8 Tests in `test_rechnungs_core.js` erfolgreich bestanden.

---

## 6. Architektur-Spezifikation: Zentraler Vorlagen- & Dokumenten-Pool (Phase 12)

### 6.1 Ausgangslage & Entkopplung des PDF-Bereichs
* **Standard-Positionen verbleiben im Rechnungsmodul:** Die Verwaltung der Standard-Rechnungspositionen (`rechnungen-templates.js` -> `invoice_templates`) bleibt als operativer Artikelstamm weiterhin fester Bestandteil des Rechnungs-Cockpits.
* **Auslagerung PDF-Bereich:** Lediglich der Tab „Layouts & Texte“ (`rechnungen-layouts.js`) sowie die vertragsspezifischen Vorlagen (Mietverträge, Mahnstufen, Vorstandsbriefe) werden in eine eigenständige Modul-Kachel **„PDF- & Dokumenten-Vorlagen“** ausgelagert.
* **100% Stabilität des `RechnungsCore`-Payloads:**
  Am Rechnungsmodul und der Schnittstelle `RechnungsCore.renderPdf()` werden **keinerlei Änderungen** vorgenommen. Der bestehende Payload (`invoiceId`, `recipient`, `sender`, `positions`, `totalAmount`, `year`, `type`) ist vollkommen ausreichend. Die Edge Function löst das zuständige Template serverseitig anhand des Dokumenttyps (`type`) aus der Datenbank auf.
* **Europäische Umlaut-Garantie (ä, ö, ü, Ä, Ö, Ü, é, è, à):**
  Umlaute und Sonderzeichen werden in nativer europäischer Schreibweise dargestellt (keine Konvertierung in `ae/oe/ue`). Die Sanitizer-Routine garantiert sauberes WinAnsi-Mapping (ISO-8859-1), um Zeichensatz-Crashes bei gleichzeitig vollem Erhalt aller Schweizer Umlaute und Akzente auszuschliessen.

---

### 6.2 Die 4 Architektur-Säulen der Ziel-Implementierung

#### Säule 1: Revisionssicherheit & Beleg-Unveränderlichkeit (OR 957ff)
* **Binäres Archiv (Single Source of Truth für fertige Belege):**
  Sobald ein Dokument (Rechnung, Mietvertrag, Mahnung) festgeschrieben wird (`status = 'gestellt'` / `'offen'`), wird das finale PDF deterministisch im Storage abgelegt:
  `operatives-storage/archive/{year}/{category}/{document_id}.pdf`
  Folgeaufrufe zum Drucken oder Herunterladen servieren ausschliesslich dieses unveränderbare Blob.
* **Snapshot-Absicherung im Datensatz:**
  Jeder Beleg speichert einen `template_snapshot` (JSONB) mit dem exakten Wortlaut von Titel, Einleitung, Klauseln und Zahlungskonditionen zum Zeitpunkt des Abschlusses. Vorlagenänderungen in Folgejahren beeinflussen historische Belege zu 0%.

#### Säule 2: Deterministisches Seitenumbruch- & Höhen-Budgeting (SIX SPC 0200 1)
* **Das Problem:** Der Schweizer QR-Zahlteil beansprucht zwingend **105 mm am unteren Seitenrand** und darf weder gestaucht noch skaliert werden.
* **Das Höhen-Budgeting:**
  $$\text{Verfügbare Höhe } Y_{\text{avail}} = Y_{\text{cursor}} - \text{MarginBottom}$$
  $$\text{Benötigter Platz } H_{\text{block}} = H_{\text{content}} + H_{\text{footer}} + H_{\text{qr}} + \text{SafetyMargin (6 mm)}$$
* **Schlussseiten-Strategie:**
  Reicht $Y_{\text{cursor}} - H_{\text{block}} < 111\text{ mm}$, platziert die Engine den QR-Zahlteil **deterministisch auf einer dedizierten Nachlaufseite**, statt ihn abzuschneiden oder unkontrolliert zu brechen. Dies gilt künftig identisch für Rechnungen, Mietverträge und Mitteilungen.

#### Säule 3: Relationale Vorlagen-Struktur statt unvalidiertem JSONB
* **Postgres ENUM:**
  ```sql
  CREATE TYPE document_category AS ENUM (
      'jahresbeitrag', 'vermietung', 'schulsport', 'sponsoring',
      'materialverkauf', 'depot_pfand', 'mahnung_1', 'mahnung_2',
      'mahnung_3', 'freier_brief', 'mietvertrag', 'gv_einladung'
  );
  ```
* **Kopf-Tabelle `public.document_templates`:**
  Enthält Metadaten, Standard-Zahlungsziel (Tage), Titel, Einleitung, Schlusstext, Footer-Hinweis, E-Mail-Betreff und E-Mail-Body.
* **Klausel-Tabelle `public.document_template_clauses` (1:n):**
  Für nummerierte Paragraphen, Reglemente und Traktanden:
  * **Mietvertrag Schützenstube Rüteli:** Ziffern 1 bis 8 (1. Zweckbestimmung, 2. Benutzungsrecht & Cheminée, 3. Sorgfaltspflicht & Reinigung CHF 35/h, 4. Dekoration, 5. Haftung, 6. Vermietungskontakt, 7. Reservation & Stornogebühr CHF 100, 8. Gebühren & Übergabe-Checkliste).
  * **GV-Einladung (Modul Umfragen/GV):** Traktandenliste, Begleittext, Wort des Präsidenten, Termine.
  * Schema: `template_id (FK)`, `sort_order (INT)`, `clause_title (VARCHAR)`, `clause_text (TEXT)`, `is_mandatory (BOOLEAN)`.
* **System-Stammdaten (`public.organization_settings`):**
  Bankverbindungen (IBAN/QR-IBAN), Absenderadressen und statische Vereinsdaten werden nicht in Vorlagen dupliziert, sondern zentral bereitgestellt.

#### Säule 4: Cold-Start-Optimierung & Server-Side Template Resolution
* **Base64-Inlining:** Vereinslogo und Standard-Grafiken werden als kompilierte Base64-Konstante direkt im TypeScript-Bundle der Edge Function geführt (Dateigrösse $< 30\text{ KB}$). Keine Latenz und keine Ausfälle bei Serverless Cold Starts auf Deno Deploy.
* **Backend-First Template Resolution:** Die Edge Function `generate-pdf` lädt das passende Template primär direkt aus Postgres (`document_templates` + `clauses`), falls der Aufrufer keine expliziten temporären Overrides sendet.
* **GV-Planung & Umfragen Integration:**
  Das GV-Modul (`umfragen-controlling.js`) ersetzt den alten entkoppelten GAS-Aufruf von `genPDF` durch einen sauberen Aufruf von `window.generatePdfViaEngine({ action: 'generate-gv-invitation', year, gvData })`. Die PDF-Engine rendert die mehrseitige GV-Broschüre/Einladung vollautomatisch in das Storage-Bucket und verknüpft sie mit der E-Mail-Versandpipeline.
* **Serverseitige Vorschau-Pipeline:** Im neuen Editor speichert der Benutzer erst nach erfolgreichem Test-Render via Edge Function (Rendering-Check verhindert Syntax- oder Umbruchsfehler).

---

### 6.3 Umsetzungs-Fahrplan (Schritte 1 bis 5)

#### ✅ Schritt 1: Datenbank-Konsolidierung (Migration 27) – ABGESCHLOSSEN
* **Datei:** [`supabase/migrations/27_document_templates_and_clauses.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/27_document_templates_and_clauses.sql)
* **Master-Tabellen:**
  - `public.document_templates`: Kopfdaten (Titel, Einleitung, Schlusstext, Footer, Zahlungsziel, E-Mail-Betreff/Body, Version).
  - `public.document_template_clauses`: 1:n Paragraphen, Reglemente & Traktanden mit `sort_order`, `clause_title`, `clause_text`, `is_mandatory`.
* **Zero-Breaking-Change Kompatibilität:**
  - Updatable View `public.invoice_layouts` leitet Lese- und Schreibzugriffe transparent auf `document_templates` um.
  - Gehärteter `INSTEAD OF`-Trigger unterscheidet strikt `NEW` (INSERT/UPDATE) und `OLD` (DELETE).
  - `DISTINCT ON (LOWER(TRIM(type)))` schützt vor Postgres-Kardinalitätskonflikten (`ERROR: 21000`).
* **Initiales Seeding aus Vereinsdokumenten:**
  - Rechnungen (Standard) & Mahnstufen 1 bis 3.
  - Mietvertrag Schützenstube Rüteli (Benützungsreglement Ziffern 1–8 + Übergabe-Checkliste).
  - GV-Einladungen: Normaljahr (12 Traktanden) & Wahljahr (13 Traktanden).
* **Sicherheit:** RLS aktiviert für `authenticated` und `anon` mit PostgREST-GRANTS.

---

#### ✅ Schritt 2: Frontend-Entkopplung & Kachel „Dokumenten-Vorlagen“ – ABGESCHLOSSEN
* **Ziel:** Saubere Trennung zwischen operativem Artikelstamm (Rechnungen) und zentralen Dokumenten-Vorlagen (Portal).
* **Umgesetzte Komponenten:**
  1. [`rechnungen-ui.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-ui.js):
     - Tab `#rn-tab-btn-templates` umbenannt in **„Artikelstamm & Positionen“** (`fa-boxes-stacked`).
     - Tab `#rn-tab-btn-layouts` ersatzlos entfernt.
     - `RechnungsCore`-Schnittstelle und `InvoiceOrder`-Payload bleiben zu 100% stabil.
  2. [`rechnungen-templates.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-templates.js):
     - Titel und Beschreibungen auf Artikelstamm & Standard-Positionen angepasst.
  3. [`vorstand/js/vorlagen/templates-ui.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/vorlagen/templates-ui.js):
     - Komplettes Modul-Cockpit für `document_templates` und `document_template_clauses`.
     - Tab-Filterung nach Kategorien (Rechnungen, Mahnungen, Mietverträge, GV, Briefe).
     - Live-Klausel-Editor mit Drag-and-Drop-Sortierung und Sofortspeicherung.
     - Serverseitiger Vorschau-Render via `docTestRenderPdf()`.
  4. [`vorstand/index.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/index.html):
     - Sidebar-Nav-Link hinzugefügt (`navTo('dokument-vorlagen', this)` mit Rollenschutz `admin,vorstand,kassier,vermieter`).
     - Kachel auf Dashboard integriert.
     - Modul-View-Container eingefügt: `<div id="view-dokument-vorlagen" class="module-view"><div id="dokument-vorlagen-container"></div></div>`.
     - Script eingebunden: `<script src="js/vorlagen/templates-ui.js"></script>`.
  5. [`vorstand/js/main.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/main.js):
     - In `navTo(viewId)` Routing für `'dokument-vorlagen'` ergänzt (ruft `window.renderDokumentVorlagen()` auf).
     - Rollenberechtigung für `dokument-vorlagen` hinterlegt.

---

#### ✅ Schritt 3: Edge Function `generate-pdf` Upgrade & Harmonisierung – ABGESCHLOSSEN
* **Dateien:** [`supabase/functions/generate-pdf/index.ts`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/functions/generate-pdf/index.ts) & [`supabase/functions/generate-pdf/logo-base64.ts`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/functions/generate-pdf/logo-base64.ts)
* **Architektur-Spezifikation der 6 Kernkomponenten:**
  1. **Logo Base64-Inlining:**
     - Vereinslogo (`Muhen_32_mit_Namen_roter_Balken.png`) wird als kompilierte Base64-Konstante direkt im TypeScript-Code hinterlegt.
     - Eliminiert Storage-Netzwerkanfragen und Cold-Start-Verzögerungen auf Deno Deploy.
  2. **Zweistufige Text-Normalisierung (`sanitizeWinAnsiText`):**
     - Stufe 1 (Typografie & Whitespace):
       * `«`, `»`, `“`, `”`, `„`, `”` $\rightarrow$ `"`
       * `‘`, `’`, `‚` $\rightarrow$ `'`
       * `–` (U+2013 En-Dash), `—` (U+2014 Em-Dash) $\rightarrow$ `-`
       * `•` (U+2022 Bullet) $\rightarrow$ `-`
       * `…` (U+2026 Ellipsis) $\rightarrow$ `...`
       * `\u00A0` (NBSP), `\u202F` (Narrow NBSP) $\rightarrow$ einfaches Leerzeichen
     - Stufe 2 (ISO-8859-1 / WinAnsi Schutz mit Umlaut-Garantie):
       * Europäische Umlaute und Sonderzeichen (`ä, ö, ü, Ä, Ö, Ü, é, è, ê, à, â, ç`) bleiben im Klartext erhalten.
       * Nicht darstellbare Unicode-Zeichen (Code-Points $> 255$) werden sicher durch ASCII-Äquivalente ersetzt oder gefiltert, um Laufzeitabbrüche von `pdf-lib` (`cannot encode glyph`) deterministisch zu verhindern.
  3. **SIX SPC 0200 1 QR-Zahlteil Nachlaufseite:**
     - Prüft vertikales Platzbudget: $Y_{\text{cursor}} - H_{\text{block}} < 111\text{ mm}$ (105 mm Zahlteil + 6 mm Sicherheitsabstand).
     - Bei Platzmangel: Automatisches Einfügen einer Folgeseite.
     - Folgeseite erhält oberhalb der 105-mm-Schnittlinie einen standardisierten **Belegbezugs-Kopf**:
       * Dokumenttyp, Rechnungs-Nr., Empfängername, Rechnungsbetrag, Fälligkeit.
       * Gestrichelte Schnittlinie mit Scherensymbol und Hinweistext.
  4. **Mietvertrag Schützenstube Rüteli (Dynamische Klauseln):**
     - Liest Ziffern 1–8 und Checkliste direkt aus `document_template_clauses` (kein hartverdrahteter Text mehr).
     - Flexible Zeilenhöhenberechnung mit automatischem Seitenumbruch zwischen Reglement und Übergabeprotokoll.
  5. **Neuer Action-Handler `generate-gv-invitation`:**
     - **Input:** `{ action: 'generate-gv-invitation', year: 2026, eventId?: string }`.
     - **Datenquellen:**
       * Template & Begleittext aus `document_templates` (`category = 'gv_einladung'`).
       * Traktanden aus `gv_traktanden` (oder `document_template_clauses`).
       * Jahresprogramm-Termine aus `public.termine` (`WHERE EXTRACT(YEAR FROM datum) = year ORDER BY datum ASC`).
     - **Dynamischer Paginator:**
       * Automatische Aufteilung über 2 bis 4 Seiten.
       * Wiederholung der Tabellenkopfzeile bei Seitenwechsel.
       * 2-Pass-Seitennummerierung („Seite X von Y“).
  6. **WORM-Archivierung (OR 957ff):**
     - Festgeschriebene Dokumente werden in `operatives-storage/archive/{year}/{category}/{id}.pdf` gespeichert.
     - Bei erneutem Aufruf wird direkt das existierende Archiv-Blob zurückgegeben.

---

#### ✅ Schritt 4: GV-Modul Anbindung – ABGESCHLOSSEN
* **Dateien:** [`vorstand/js/umfragen/umfragen-controlling.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/umfragen/umfragen-controlling.js) & [`vorstand/js/pdf-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/pdf-engine.js)
* **Umgesetzte Funktionen:**
  1. `runGVTool('genPDF')` ist vollständig von GAS entkoppelt und generiert das Einladungs-PDF über `window.gvGenerateInvitationPdf`.
  2. Nach der Generierung wird `public.gv_instances.doc_einladung_url` via Supabase aktualisiert, im lokalen State abgelegt und im Embedded-Container neu gerendert.
  3. Der GV-Mail-Wizard (`openGVMailWizard`) erkennt das Einladungs-PDF verlässlich als Anhang (grünes Badge).
  4. Der E-Mail-Versand (`executeGVMailSend`) übergibt das generierte PDF aus `operatives-storage/gv/{year}/GV_Einladung_{year}.pdf` automatisiert als Anhang an `window.sendMailViaEngine`.

---

#### ⏳ Schritt 5: End-to-End Verifikation & Tests
* **Prüfpunkte:**
  1. **Rechnungen & Mahnungen:**
     - 1-seitige Kurzrechnung (QR-Zahlteil direkt auf Seite 1).
     - Mehrseitige Rechnung mit vielen Positionen (QR-Zahlteil auf Nachlaufseite mit Belegbezugskopf).
     - Rückwärtskompatibilität des Views `invoice_layouts` bei bestehenden Rechnungs-Core-Aufrufen.
  2. **Mietvertrag Rüteli:**
     - Korrekte Darstellung von Ziffern 1–8 und Checkliste aus `document_template_clauses`.
  3. **GV-Einladung:**
     - Vollständiger Durchlauf mit 30–50 Terminen aus `public.termine`.
     - Seitenumbruch-Konsistenz und Seitennummerierung „Seite X von Y“.
  4. **Umlaut- & Zeichensatzprüfung:**
     - Validierung von `ä, ö, ü, Ä, Ö, Ü, é, è, à` sowie typografischen Anführungszeichen ohne Absturz oder Darstellungsfehler.


