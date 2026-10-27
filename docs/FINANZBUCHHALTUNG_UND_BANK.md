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
* **E-Banking Gutschrifts-Automation (Vermietung):** Ergänzend zum periodischen CAMT-Sammelimport werden eingehende Mietzahlungen über die Edge Function `process-bank-mails` via Gmail-Schnittstelle und Kaskaden-Matching (Vertrags-Nr. oder Mietdatum + Nachname + exakter Betrag CHF 300.00) atomar über den `RechnungsCore` erfasst und direkt als Zahlungseingang verbucht.

### 2.4 Warum `accounting_journal.id` als `BIGSERIAL` (Integer)?
* **Revisionssichere Belegnummerierung:** Revisoren verlangen in der Buchführung fortlaufende, lückenlose Belegnummern (1, 2, 3...).
* **Entscheidung:** Statt unübersichtlicher UUIDs nutzt `accounting_journal` eine PostgreSQL `BIGSERIAL` Sequenz. Das garantiert automatische Chronologie und performante Sortierung. Client-Payloads übergeben kein manuelles String-`id`-Feld, damit PostgreSQL die Sequenz lückenlos selbst hochzählt.
* **Integrität bei Batch-Buchungen:** Jede Transaktion muss zwingend über gültige Soll- und Haben-Konten verfügen (Fremdschlüssel auf `accounting_accounts`). Unvollständige Bankbuchungen ohne Gegenkonto verbleiben als unklar in der Vormerkliste und werden nicht an die DB übermittelt, um Foreign-Key-Abbrüche zu verhindern. Obsolete Hilfsfelder wie `split_group_id` werden clientseitig nicht übergeben. Die PostgreSQL-Sequenz `accounting_journal_id_seq` wird strikt synchron auf `MAX(id)` gehalten (`98_fix_accounting_journal_sequence.sql`), um Primärschlüssel-Kollisionen (HTTP 409) auszuschliessen. DB-Fehlermeldungen werden transparent bis in die UI-Toasts durchgereicht und gesperrte Aktionsbuttons bei Fehlern via `bhBankRenderResults` automatisch zurückgesetzt.

### 2.5 Warum variable Zuteilungsquoten für das Controlling?
* **Problemstellung:** Gemeinsame Kosten wie Schützenhaus-Reinigung (4010), Energie & Wasser (6400) oder Liegenschaftsunterhalt (6000) fallen für das gesamte Schützenhaus an, das sowohl dem Schiessbetrieb als auch externen Vermietungen dient. Eine pauschale 100%-Belastung verfälschte die Rentabilitätsrechnungen.
* **Lösung:** In `public.accounting_cost_allocations` werden prozentuale Zuteilungsschlüssel (z.B. 70% Reinigung, 30% Energie, 10% Gebäude/Versicherung für Vermietung) persistent gespeichert und im Cockpit (`vorstand/js/buchhaltung-controlling.js`) interaktiv mit Sofortberechnung visualisiert und verwaltet.

### 2.6 Auszahlungsbelege & ISO 20022 pain.001 Zahlungsdatei-Export (Bank 1020 & Kasse 1000)
* **Problemstellung & Anwendungsfall:** Vorfinanzierte Auslagen von Mitgliedern (z.B. Gruppendoppel für Schiessanlässe, Munition oder Materialspesen) müssen mit detailliertem Nachweis vergütet werden.
* **Ablauf & Belegdruck:** Bei Erfassung von Einzel- oder Sammelauszahlungen (Konto `1020 Bank` oder `1000 Kasse`) kann ein Mitglied aus dem Mitgliederstamm ausgewählt werden. Das System generiert auf Knopfdruck einen revisionssicheren A4-Vergütungsbeleg mit Begünstigtem, Adresse, IBAN, Positionsaufstellung und Freigabevisum.
* **ISO 20022 pain.001 XML-Export:** Für Banküberweisungen via `1020 Bank` wird direkt beim Buchen eine normierte XML-Zahlungsdatei nach Schweizer Standard (`pain.001.001.03.ch.02`) erzeugt und heruntergeladen. Diese folgt strikt den Vorgaben von SIX Interbank Clearing (`http://www.six-interbank-clearing.com/de/pain.001.001.03.ch.02.xsd`), nutzt konforme SWIFT-Identifier (Bereinigung von verbotenen Sonderzeichen wie `_`) und verzichtet bei Standard-Inlands-IBAN auf fehleranfällige Agent-Dummyknoten (`CdtrAgt`). Die Datei kann ohne manuelle Nachbearbeitung direkt im E-Banking (z.B. PostFinance, Raiffeisen) zur Ausführung hochgeladen werden. IBAN-Änderungen können auf Wunsch direkt in `public.members` synchronisiert werden.
* **UI/UX & DB-Integrität:** Das Buchungs-Modal sowie das Bank-Split-Modal folgen dem globalen Standard (`UIModalKit` mit Drag & Resize, Maximize `[⛶]`, `modal-xl` und Tabellen-Standard mit `table-hover` und sauberer Spaltenbreite). Soll- und Haben-Kontenfelder im Bank-Split-Modal sind mit vollwertigem Autocomplete (`bh-konto-ac-input`), visuellen Richtungs-Indikatoren (`➔ Soll (Empfänger)` / `⬅ Haben (Quelle)`) und automatischer Kontenvalidierung (`.is-resolved`) vollständig analog zur manuellen Buchungsmaske harmonisiert. Neben der reinen Datenübernahme steht direkt im Split-Modal der Button «Split übernehmen & Beleg drucken» (`bhBankSaveAndPrintSplitBooking`) zur Verfügung, welcher automatisch einen druckfertigen A4-Split-Buchungsbeleg mit allen Positionen und Visumszeilen via `bhPrintJournalBeleg` generiert. Splitbuchungen erhalten dabei bereits im Modal die offizielle Bank-Belegnummer (`_batchBelegNr`, z.B. `B_Zahl_2026-068`), und die einzelnen Split-Teilpositionen werden nach Schweizer KMU-Standard mit direkt angehängten Kleinbuchstaben (`a`, `b`, `c` etc. ohne Bindestrich, z.B. `B_Zahl_2026-068a`, `B_Zahl_2026-068b`) belegt. Dies wird sowohl im Header-Badge (`B_Zahl_2026-068 (a, b, c)`) als auch in der Positionszeile des Belegdrucks einheitlich ausgewiesen und beim anschliessenden Buchen ins Journal 1:1 deckungsgleich übernommen. In der Bankabgleich-Tabelle `#bhBankTable` erlaubt zudem ein dedizierter Druckbutton (🖨️) bei bereits verbuchten Transaktionen (`alreadyBooked`) den direkten Wiederabruf des Buchungsbelegs. Reduziert der Benutzer im Split-Modal eine Aufteilung auf eine einzige Zeile oder hebt den Split auf («Split aufheben»), wird `_customSplitEdited` persistent gesetzt, wodurch automatische Re-Splits durch mehrzeilige Rechnungspositionen bei der Ausführung strikt unterbunden werden und Gegenkonten nahtlos erhalten bleiben. Aufwandskonten-Dropdowns nutzen freie Viewport-Positionierung, und die DB-Sequenz `accounting_journal_id_seq` ist lückenlos mit `MAX(id)` synchronisiert. Die Bankabgleich-Tabelle `#bhBankTable` implementiert den globalen Standard `TableKit.initTable` (vollständige Spezifikation siehe [`docs/SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md`](SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md)); Konten-Suchfelder und Datalists filtern rohe IBAN-Muster (`CH...`) automatisch aus dem Suchindex heraus.

### 2.7 Intelligente Modul-Erkennung & Status-Rücksetzung beim Löschen im Journal
* **Problemstellung & Kopplung:** Wird ein Buchungssatz im Journal gelöscht, dessen Zahlung zuvor ein Fachmodul (Rechnungen `invoices`, Jahresbeitrag `contributions_header`, Vermietung `rental_requests` oder Inventar-Depots `inventory_deposits`) auf `bezahlt` gesetzt hatte, führte eine isolierte Journalzeilen-Löschung zu Diskrepanzen (z.B. CAMT-Bankimport markierte die Buchung weiterhin als «bereits gebucht»).
* **Lösung & Kaskade:** Vor dem Löschen (Einzelbuchung, Split-Gruppe oder Sammellöschung) scannt `bhDetectLinkedModulesForJournal` automatisch Fremdschlüssel (`invoice_payments`), Belegnummern und Buchungstexte auf verknüpfte Vorgänge. Bei erkannten bezahlten Modulen öffnet sich ein Entscheidungsmodal, in welchem der Benutzer wählen kann, ob nur der Buchungssatz gelöscht werden soll oder ob zusätzlich der Status der verknüpften Rechnungen und Module wieder auf `offen` (bzw. `confirmed`) zurückgesetzt und Zahlungen entfernt werden sollen (inklusive CAMT-Cache-Freigabe zur erneuten Buchung).

---

## 3. Datenmodell (Kern-Tabellen)

| Tabelle | Primärschlüssel | Zweck & Invarianten |
| :--- | :--- | :--- |
| `public.accounting_accounts` | `konto` (VARCHAR) | KMU-Kontenrahmen mit Klassifizierung und Salden. |
| `public.accounting_journal` | `id` (BIGSERIAL) | Das lückenlose Hauptbuch (Datum, Beleg-Nr, Soll, Haben, Betrag, Buchungstext). |
| `public.accounting_budgets` | `id` (UUID) | Jahresbudgets je Konto für den Soll/Ist-Vergleich im Controlling. |
| `public.accounting_bank_rules` | `id` (UUID) | Automatische Kontierungsregeln für wiederkehrende Banktexte (z.B. Zinsen, Spesen). |
| `public.accounting_cost_allocations` | `id` (UUID) | Konfigurierbare Zuteilungsquoten (%) für Vermietung, Wirtschaft und Sportbetrieb. |

---

## 4. Berechtigungen & RLS

* **Einsehen (`finanzen.view`):** Rollen `kassier`, `admin`, `vorstand`, `revisor`.
* **Buchen & Mutieren (`finanzen.buchhaltung`):** Strikt beschränkt auf `kassier` und `admin`.
