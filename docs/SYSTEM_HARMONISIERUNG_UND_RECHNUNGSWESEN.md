# System-Harmonisierung, UI/UX & Zentralisiertes Rechnungswesen

**Stand:** 2026-09-27  
**Status:** Konzept & Architektur-Leitfaden  

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

---

## 5. Changelog der Umsetzungen

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

