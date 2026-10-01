# Fachdokumentation: Jahresbeitrag & Beitragsverwaltung

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.contributions_header`, `contributions_positions`, `member_participations`, `gebuehren_config`  
> **Verknüpfung:** `contributions_header.invoice_id` $\rightarrow$ `public.invoices.id`  
> **Frontend:** [`vorstand/js/jahresbeitrag/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresbeitrag/) (`jahresbeitrag-overview.js`, `jahresbeitrag-core.js`, `jahresbeitrag-gebuehren.js`, `jahresbeitrag-calc.js`, `jahresbeitrag-bank.js`, `jahresbeitrag-schnellerfassung.js`)

---

## 1. Übersicht & Systemgrenzen

Das Modul Jahresbeitrag steuert die jährliche Beitragsbemessung, Rechnungsstellung und Zahlungsabwicklung für alle Vereinsmitglieder. Es kombiniert die Mitglieder-Stammdaten (`members`) mit der dynamischen Gebührenordnung (`gebuehren_config`) und erzeugt für jedes beitragspflichtige Mitglied eine offizielle Vereinsrechnung mit Schweizer QR-Zahlteil.

* **Führendes System:** Supabase PostgreSQL (`public.contributions_header`, `public.contributions_positions`).
* **Forderungswesen:** Rechnungen werden über den zentralen [`RechnungsCore`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js) verwaltet.
* **Entkopplung:** Das alte Google Sheet `Jahresbeitrag` und alle damit verknüpften GAS-Makros sind vollständig stillgelegt.

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum dynamische Gebührenordnung (`gebuehren_config`) statt statischer Code-Werte?
* **Problem:** Beitrags- und Lizenzansätze werden an der Generalversammlung periodisch angepasst (z. B. Aktivbeitrag `JB001`, Passivbeitrag `JB002`, Nachwuchstarif `JB004`, SSV-Lizenz Gewehr 50m `LI001`, Munitionsbeitrag `GE001`).
* **Lösung & Warum:** Alle Ansätze liegen in `public.gebuehren_config`. Der Vorstand kann Beiträge im Cockpit unter *Einstellungen > Gebührenordnung* direkt anpassen. Es sind **keinerlei Code-Änderungen** erforderlich, wenn die GV neue Ansätze beschliesst.

### 2.2 Warum Rechnungsstellung zwingend über den zentralen `RechnungsCore`?
* **Keine Beleg-Inseln:** Früher erzeugte das Jahresbeitrags-Sheet eigene PDF-Belege. Dadurch wusste das allgemeine Rechnungsmodul nicht, welche Debitoren noch offen waren.
* **Invariante:** Sobald eine Beitragsrechnung finalisiert wird (`ensureInvoiceCreatedRemote`), übergibt das Modul eine standardisierte `InvoiceOrder` an `RechnungsCore.createInvoice()`.
* **Ergebnis:**
  - Die Rechnung erhält eine fortlaufende Rechnungsnummer (`RE-26-XXXX`).
  - Eine 27-stellige Schweizer QR-Referenz (QRR) wird generiert.
  - Das PDF wird einheitlich über die zentrale PDF-Engine gerendert und in Supabase Storage gesichert.
  - Die Verbindung wird in `contributions_header.invoice_id` festgehalten.

### 2.3 Warum ist die Bearbeitung im Rechnungs-Cockpit strikt gesperrt?
* **Invariante (Projekt-Richtlinie 6):** Rechnungen des Typs `Jahresbeitrag` können im Rechnungsmodul (`rechnungen-actions.js`) **nicht** manuell editiert werden.
* **Das «Warum»:** Die Rechnungspositionen eines Jahresbeitrags spiegeln exakt die Berechnungslogik aus `contributions_positions` (Grundbeitrag minus allfällige Vorstandsrabatte plus Lizenzen). Würde jemand im Rechnungsmodul per Freitext Positionen ändern, entstünde eine fatale Diskrepanz zwischen Beitragsliste und Buchhaltung.  
  *Regel:* Korrekturen an Jahresbeiträgen erfolgen **ausschliesslich** über das Modul `jahresbeitrag-overview.js`.

### 2.4 Warum Schnellerfassung mit `sessionStorage`-Puffer?
* **Kassier-Workflow:** Bei Versammlungen oder Sammel-Einzahlungen hakt der Kassier in der Schnellerfassung (`jahresbeitrag-schnellerfassung.js`) Dutzende Zahlungen hintereinander ab.
* **Schutz vor Datenverlust:** Formularstände und Haken werden temporär im `sessionStorage` zwischengespeichert. Wechselt der Anwender versehentlich den Browser-Tab, gehen keine Eingaben verloren.

### 2.5 Warum CAMT.054 Batch-Bankabgleich?
* **Massenabgleich:** Nach dem Versand der Beitragsrechnungen treffen viele Zahlungen gleichzeitig auf dem Vereinskonto ein.
* **Automatisierung:** Das Bankabgleichsmodul (`jahresbeitrag-bank.js`) liest den `CAMT.054`-XML-Kontoauszug, erkennt die 27-stelligen QR-Referenzen, setzt `contributions_header.status = 'bezahlt'` und bucht den Zahlungseingang in `public.invoice_payments` sowie im Finanzjournal (`accounting_journal`).

### 2.6 Warum KMU-Kontenrahmen (`accounting_accounts`) & Saubere Konto-Übergabe an `RechnungsCore`?
* **Problem:** Werden Gegenkonten statisch codiert oder Freitextnummern ohne Validierung eingetippt, entstehen Fehlbuchungen im Journal. Zudem gingen Kontierungszuordnungen verloren, wenn Fachmodule abweichende Key-Namen (`account` statt `konto`/`accountHaben`) an `RechnungsCore` schickten.
* **Lösung:** Alle Gebühren (`gebuehren_config`) und variablen Zusatzpositionen (Freie Beträge in Schnellerfassung) sind live an `public.accounting_accounts` angebunden. Bei Rechnungsfinalisierung übergibt `ensureInvoiceCreatedRemote` die aufgelösten Haben-Konten (`konto` & `accountHaben`) verbindlich an `RechnungsCore.createInvoice()`, sodass `invoice_positions.konto` und das Journal stets exakt kontiert sind.

### 2.7 Warum einheitlicher TableKit-Standard?
* **Konsistenz:** Sämtliche Tabellen (`jbTable`, `jbGebuehrenTable`, `jbModalPositionsTable`, `jbBankTransactionsTable`) implementieren den zentralen `TableKit`-Standard (`ui-table-kit.js`) mit hellem Sticky-Header, persistenten Spaltenbreiten (`makeResizable`), Spaltenauswahl (`setupColumnToggle`) und barrierefreiem Scrollen.

---

## 3. Datenmodell (Kern-Tabellen)

| Tabelle | Primärschlüssel | Zweck & Invarianten |
| :--- | :--- | :--- |
| `public.contributions_header` | `id` (VARCHAR) | Beitrags-Kopfdatensatz je Mitglied & Jahr (`person_number`, `year`, `gesamt`, `status`, `payment_date`, `payment_method`, `invoice_id`). Eindeutiger Constraint `(person_number, year)`. |
| `public.contributions_positions` | `id` (VARCHAR) | Detaillierte Einzelpositionen (Grundbeitrag, Lizenzen, Schiessgelder, Haben-Konto). Fremdschlüssel `header_id` mit `ON DELETE CASCADE`. |
| `public.member_participations` | `id` (VARCHAR) | Erfasste Schiessanlass-Teilnahmen zur Rabatt- und Schiessgeldberechnung je Mitglied & Saison. |
| `public.gebuehren_config` | `key` (VARCHAR) | Dynamischer Gebührentarif (`key`, `bezeichnung`, `bezeichnung_frontend`, `betrag`, `konto_haben`, `kategorie`, `sort_order`). |
| `public.accounting_accounts` | `konto` (VARCHAR) | Vollständiger KMU-Kontenrahmen als Single Source of Truth für Gegenkonten. |

---

## 4. Berechtigungen & RLS

* **Einsehen (`jahresbeitrag.view`):** Kassier, Vorstand, Admin, Revisoren.
* **Berechnen & Mutieren (`jahresbeitrag.manage`):** Strikt beschränkt auf `kassier` und `admin`.

