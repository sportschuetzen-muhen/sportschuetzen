# Fachdokumentation: Finanzbuchhaltung (FiBu) & Bankabgleich

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.accounting_accounts`, `accounting_journal`, `accounting_budgets`, `accounting_bank_rules`, `invoice_payments`  
> **Frontend:** [`vorstand/js/buchhaltung/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/buchhaltung/) (`buchhaltung-core.js`, `buchhaltung-bank.js`, `buchhaltung-journal.js`, `buchhaltung-konten.js`, `buchhaltung-controlling.js`)

---

## 1. Übersicht & Systemgrenzen

Die Finanzbuchhaltung verwaltet das Rechnungswesen, die doppelte Buchführung und den bankgestützten Zahlungsabgleich des Vereins nach Schweizer Rechnungslegungsrecht (OR 957ff).

* **Führendes System:** Supabase PostgreSQL (`public.accounting_journal`).
* **Schnittstelle Bank:** XML-Dateien nach ISO-20022 Standard (`CAMT.053` Kontoauszug, `CAMT.054` Sammlergutschrift).
* **Entkopplung:** Das alte Google Sheet `Finanzbuchhaltung` und alle GAS-Funktionen wurden vollständig stillgelegt.

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum Schweizer KMU-Kontenrahmen (4-stellig)?
* **Gesetzliche Konformität (OR 957ff):** Der Schweizer Standard-Kontenrahmen für Vereine garantiert eine saubere Trennung von Aktiven, Passiven, Ertrag und Aufwand:
  - `1000`: Kasse (Bargeld Munition, Kiosk)
  - `1020`: Bank / Postfinance (Vereinskonto)
  - `1100`: Debitoren / Offene Forderungen (Schnittstelle zu `public.invoices`)
  - `2000`: Kreditoren (Offene Verbindlichkeiten)
  - `3000`: Ertrag Jahresbeiträge (Schnittstelle zu `contributions_header`)
  - `3200`: Ertrag Material- & Munitionsverkauf (Schnittstelle zu `inventory_items`)
  - `3400`: Ertrag Vermietung Schützenhaus (Schnittstelle zu `rental_requests`)
* **Revisionssicherheit:** Revisoren und GV erhalten einen standardisierten Jahresbericht mit Bilanz und Erfolgsrechnung ohne manuelle Umformatierung.

### 2.2 Warum zwingender doppelter Buchungssatz bei jeder Zahlung?
* **Das Kernproblem:** In einfachen Systemen wird bei einer Zahlung lediglich ein Haken gesetzt (`status = 'bezahlt'`). Dadurch weiss die Buchhaltung jedoch nicht, auf welches Gegenkonto das Geld geflossen ist.
* **Die Invariante:** Jede Rechnungsbegleichung (ob über `RechnungsCore.recordPayment`, manuell im Cockpit oder über Bankimport) erzeugt automatisch einen Eintrag in `public.accounting_journal`:
  - **Soll:** `1020 Bank` (oder `1000 Kasse` bei Barzahlung)
  - **Haben:** `1100 Debitoren`
  - **Betrag:** Exakter Zahlungsbetrag in CHF
* Dadurch stimmen Bilanz, Debitorenspiegel und Bankkonto jederzeit auf den Rappen genau überein.

### 2.3 Warum CAMT.054 Bankabgleich über die 27-stellige QR-Referenz?
* **Automatisierter Abgleich:** Bei der Ausgabe von Rechnungen mit Schweizer QR-Zahlteil (SIX SPC 0200 1) wird eine eindeutige 27-stellige Referenznummer (QRR) hinterlegt.
* **Ablauf beim Import:**
  1. Der Kassier lädt die `CAMT.054` XML-Datei der Bank im Cockpit hoch.
  2. Der Parser extrahiert die Gutschriften und sucht via QRR die zugehörige Rechnung in `public.invoices`.
  3. Bei 100% Match wird die Zahlung in `public.invoice_payments` erfasst, der Status der Rechnung auf `bezahlt` aktualisiert und der Buchungssatz im Journal erzeugt.
  4. Manuelle Tippfehler oder falsche Buchungsbeträge sind dadurch rechnerisch ausgeschlossen.

### 2.4 Warum `accounting_journal.id` als `BIGSERIAL` (Integer)?
* **Revisionssichere Belegnummerierung:** Revisoren verlangen in der Buchführung fortlaufende, lückenlose Belegnummern (1, 2, 3...).
* **Entscheidung:** Statt unübersichtlicher UUIDs nutzt `accounting_journal` eine PostgreSQL `BIGSERIAL` Sequenz. Das garantiert automatische Chronologie und performante Sortierung.

---

## 3. Datenmodell (Kern-Tabellen)

| Tabelle | Primärschlüssel | Zweck & Invarianten |
| :--- | :--- | :--- |
| `public.accounting_accounts` | `account_number` (INT) | Kontenplan (z.B. 1000, 1020, 1100) mit Typ (Aktive, Passive, Aufwand, Ertrag). |
| `public.accounting_journal` | `id` (BIGSERIAL) | Das lückenlose Hauptbuch (Datum, Beleg-Nr, Soll, Haben, Betrag, Buchungstext). |
| `public.accounting_budgets` | `id` (UUID) | Jahresbudgets je Konto für den Soll/Ist-Vergleich im Controlling. |
| `public.accounting_bank_rules` | `id` (UUID) | Automatische Kontierungsregeln für wiederkehrende Banktexte (z.B. Zinsen, Spesen). |

---

## 4. Berechtigungen & RLS

* **Einsehen (`finanzen.view`):** Rollen `kassier`, `admin`, `vorstand`, `revisor`.
* **Buchen & Mutieren (`finanzen.buchhaltung`):** Strikt beschränkt auf `kassier` und `admin`.
