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
  - `1090`: Noch abzuklärende Bankzahlungen (Transit / Klärungskonto)
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

### 2.4 Warum `accounting_journal.id` als `BIGSERIAL` (Integer) & Belegnummern-Chronologie?
* **Revisionssichere Belegnummerierung:** Revisoren verlangen in der Buchführung fortlaufende, lückenlose Belegnummern (1, 2, 3...).
* **Entscheidung:** Statt unübersichtlicher UUIDs nutzt `accounting_journal` eine PostgreSQL `BIGSERIAL` Sequenz. Das garantiert automatische Chronologie und performante Sortierung. Client-Payloads übergeben kein manuelles String-`id`-Feld, damit PostgreSQL die Sequenz lückenlos selbst hochzählt.
* **Integrität bei Batch-Buchungen:** Jede Transaktion muss zwingend über gültige Soll- und Haben-Konten verfügen (Fremdschlüssel auf `accounting_accounts`). Unvollständige Bankbuchungen ohne Gegenkonto verbleiben als unklar in der Vormerkliste und werden nicht an die DB übermittelt, um Foreign-Key-Abbrüche zu verhindern. Obsolete Hilfsfelder wie `split_group_id` werden clientseitig nicht übergeben. Die PostgreSQL-Sequenz `accounting_journal_id_seq` wird strikt synchron auf `MAX(id)` gehalten (`98_fix_accounting_journal_sequence.sql`), um Primärschlüssel-Kollisionen (HTTP 409) auszuschliessen. DB-Fehlermeldungen werden transparent bis in die UI-Toasts durchgereicht und gesperrte Aktionsbuttons bei Fehlern via `bhBankRenderResults` automatisch zurückgesetzt.
* **Klärungskonto 1090 für lückenlos synchrone Bank-Belegnummern:** Um sicherzustellen, dass alle Banktransaktionen aus CAMT-Auszügen streng chronologisch nach Valutadatum mit aufsteigenden Belegnummern (`B_Zahl_YYYY-xxx`, `B_Wirt_YYYY-xxx`) im Journal verankert werden, schlägt das System für noch unklare Posten standardmässig das Konto `1090 Noch abzuklärende Bankzahlungen (Transit)` vor. Dadurch kann der gesamte Bankauszug ohne Nummern-Lücken oder spätere Versatzbuchungen in einem Durchlauf verbucht werden. Im Journal signalisiert ein dedizierter Filter-Badge (`Klärung 1090`) offene Abklärungen, die jederzeit per Klick auf das Bearbeiten-Icon auf das endgültige Konto umkontiert werden können, wobei die ursprüngliche Belegnummer unverändert erhalten bleibt.
* **Top-to-Bottom-Garantie (CAMT-Reihenfolge & Belegnummern-Synchronisation):** Gemäss den SIX Swiss Payment Standards entspricht die Anordnung der `<Ntry>`-Elemente in den CAMT.053-Dateien der Raiffeisenbank exakt dem gedruckten Papierauszug von oben nach unten. Der Parser hinterlegt für jede Transaktion den ursprünglichen XML-Index (`_camtOrderIndex`). Die Frontend-Tabelle wird standardmässig chronologisch aufsteigend (`asc`) dargestellt und blendet auf jeder Zeile eine Live-Vorschau der geplanten Belegnummer ein. Bei Sammel- und Stapelbuchungen (`bhBankBookAll`, `bhBankBookSelected`) werden die Belegnummern strikt in dieser Auszugs-Reihenfolge vergeben. Beim Versuch, spätere Zeilen vorab einzeln zu buchen, weist ein Dialog auf allfällige noch ungebuchte frühere Zeilen hin, um Nummern-Sprünge und Chronologiebrüche zu verhindern.

### 2.5 Warum variable Zuteilungsquoten für das Controlling?
* **Problemstellung:** Gemeinsame Kosten wie Schützenhaus-Reinigung (4010), Energie & Wasser (6400) oder Liegenschaftsunterhalt (6000) fallen für das gesamte Schützenhaus an, das sowohl dem Schiessbetrieb als auch externen Vermietungen dient. Eine pauschale 100%-Belastung verfälschte die Rentabilitätsrechnungen.
* **Lösung:** In `public.accounting_cost_allocations` werden prozentuale Zuteilungsschlüssel (z.B. 70% Reinigung, 30% Energie, 10% Gebäude/Versicherung für Vermietung) persistent gespeichert und im Cockpit (`vorstand/js/buchhaltung-controlling.js`) interaktiv mit Sofortberechnung visualisiert und verwaltet.

### 2.6 Zweistufige Auszahlungen, Zahlungsaufträge & ISO 20022 pain.001 Sammel-Export
* **Problemstellung & Anwendungsfall:** Vorfinanzierte Auslagen von Mitgliedern (z.B. Gruppendoppel für Schiessanlässe, Munition oder Materialspesen) müssen mit detailliertem Nachweis vergütet werden.
* **Differenzierung Zahlweg (Kasse vs. Bank):**
  - **Kasse (`1000`):** Barauszahlungen erfolgen unmittelbar physisch vor Ort. Das System vergibt direkt die finale Belegnummer `Kasse_YYYY-xxx`, bucht den Satz sofort ins Hauptjournal (`accounting_journal`) und druckt den Kassenbeleg.
  - **Bank (`1020` via pain.001):** Um Chronologie-Brüche und Geisterbuchungen im Journal zu verhindern (da das Geld die Bank erst Tage später nach E-Banking-Upload verlässt), wird bei Banküberweisungen **keine** `B_Zahl_`-Nummer vorab vergeben. Stattdessen wird der Vorgang als **Zahlungsauftrag** (`ZA-YYYY-xxx`) in `public.accounting_payment_orders` mit Status `pendent` gespeichert. Die automatische Nummernvergabe (`bhGetNextPaymentOrderNr` / `bhResolveSafePaymentOrderNr`) wertet sowohl in der Einzel- als auch in der Sammelbeleg-Erfassung direkt die bestehenden Einträge in `accounting_payment_orders` aus und verhindert vor dem Datenbank-Insert jegliche `order_nr`-Duplikate.
* **ISO 20022 pain.001 Sammel- & Einzel-Export:**
  - Über das Modal «Zahlungsaufträge» (`bhOpenPaymentOrdersModal`) können mehrere erfasste Auszahlungen an unterschiedliche Mitglieder ausgewählt und in **einer einzigen normierten Sammel-XML** (`pain.001.001.03.ch.02` via `bhDownloadPain001BatchXml`) gebündelt werden.
  - Alternativ kann direkt beim Erfassen eine Einzel-XML heruntergeladen werden. Der Status wechselt auf `exportiert`.
* **Chronologische Verbuchung beim CAMT-Bankabgleich:**
  - Sobald der CAMT.053/054-Kontoauszug eingelesen wird, extrahiert `bhBankParseCAMT053` zusätzlich die `EndToEndId` (`<Refs>`) sowie die Gegenpartei-IBAN (`partyIban`) und gleicht Belastungen (`DBIT`) automatisch über Auftrags-Nr., IBAN oder Name und Betrag mit offenen Zahlungsaufträgen ab (Match-Typ `payment_order`).
  - Beim Einzel- und Sammel-Buchen (`bhBankBookAll`) wird der Buchungssatz **erst jetzt mit dem echten Valutadatum** und der nächsten fortlaufenden, lückenlosen `B_Zahl_YYYY-xxx` ins Journal geschrieben und der Zahlungsauftrag atomar auf `status = 'ausgefuehrt'` mit Referenz auf `journal_id` gesetzt.
* **Belegdruck & Quittung:** Sowohl im Status Zahlungsauftrag (`ZA-...`) als auch nach finaler Verbuchung (`B_Zahl_...`) kann jederzeit via `bhPrintJournalBeleg` ein A4-Auszahlungsbeleg mit Empfänger-Box und IBAN ausgegeben werden.

### 2.7 Intelligente Modul-Erkennung & Status-Rücksetzung beim Löschen im Journal
* **Problemstellung & Kopplung:** Wird ein Buchungssatz im Journal gelöscht, dessen Zahlung zuvor ein Fachmodul (Rechnungen `invoices`, Jahresbeitrag `contributions_header`, Vermietung `rental_requests` oder Inventar-Depots `inventory_deposits`) auf `bezahlt` gesetzt hatte, führte eine isolierte Journalzeilen-Löschung zu Diskrepanzen (z.B. CAMT-Bankimport markierte die Buchung weiterhin als «bereits gebucht»).
* **Lösung & Kaskade:** Vor dem Löschen (Einzelbuchung, Split-Gruppe oder Sammellöschung) scannt `bhDetectLinkedModulesForJournal` automatisch Fremdschlüssel (`invoice_payments`), Belegnummern und Buchungstexte auf verknüpfte Vorgänge. Bei erkannten bezahlten Modulen öffnet sich ein Entscheidungsmodal, in welchem der Benutzer wählen kann, ob nur der Buchungssatz gelöscht werden soll oder ob zusätzlich der Status der verknüpften Rechnungen und Module wieder auf `offen` (bzw. `confirmed`) zurückgesetzt und Zahlungen entfernt werden sollen (inklusive CAMT-Cache-Freigabe zur erneuten Buchung).

### 2.8 Netto-Zahlungsfluss & Ertragsminderungen bei Split-Verbunden (Sammelbuchungen)
* **Problemstellung:** Enthält eine Sammelbuchung (z.B. Jahresbeitragsabrechnung mit Lizenz, Beitrag und Ehrenmitglieder-Rabatt) sowohl Erträge als auch Ertragsminderungen/Gutschriften, führte ein blindes Aufsummieren aller Zeilenbeträge zu einem verfälschten Brutto-Total (z.B. CHF 268.00 statt der effektiv eingegangenen CHF 68.00).
* **Invariante & Anker-Konto:** Ein Split-Verbund repräsentiert einen einzigen Zahlungsfluss auf das massgebliche Liquiditäts- bzw. Anker-Konto (z.B. Bank `1020` bei `B_Zahl_`, Kasse `1000` bei `Kasse_`). Das Total des Verbunds wird immer als Netto-Saldo auf diesem Anker-Konto berechnet (`|Soll - Haben|`), sodass Gutschriften und Rabatte korrekt als Minderung abgezogen werden.
* **Darstellung im Journal & Split-Editor:** Buchungszeilen mit Ertragsminderung (Ertragskonto im Soll, Bank im Haben) werden mit negativem Vorzeichen (`- `) und Badge `ERTRAG (ABZUG)` dargestellt. Auch bei Mehrfachauswahl im Journal und beim Belegdruck wird der exakte Netto-Zahlungsbetrag ausgewiesen.
* **Suffix-Invariante & Live-Kontierung im Split-Verbund:** Sowohl beim Sammel- als auch beim Einzel-Verbuchen im CAMT-Abgleich (`_bhBankBookOneInternal`) und beim nachträglichen Aufteilen (`bhConvertEntryToSplit` / `bhSaveSplitGroupEdit`) erhalten zusammengehörige Teilpositionen durchgehend alphabetische Suffixe (`a, b, c...`) am Belegstamm (`baseBeleg`). Beim Hinzufügen oder Aufteilen einer Buchung bleibt das Liquiditäts-Ankerkonto (`1020`, `1000`, `1021`, `1022`) je nach Flussrichtung im Soll oder Haben vorbelegt, während Kontoänderungen im Split-Editor sofort den Netto-Saldo und die Abzug-Kennzeichnung live neu berechnen. Beim Bearbeiten bestehender CAMT-Buchungen bleibt der Aktionstyp `Bank` im Auswahlfeld `#bhe-typ` erhalten.
* **Vorjahres-Erkennung & automatische Split-Übernahme bei Jahresbeiträgen im CAMT-Abgleich:** Bei eingehenden Jahresbeitragszahlungen ermittelt `bhBankFindBestBeitragForMember` anhand expliziter Jahresangaben im Verwendungszweck (z.B. `Jahresbeitrag 2025`) oder eines exakten Betragstreffers auf einen offenen Beitrags-Header (`contributions_header`) das korrekte Beitragsjahr. Über `bhBankApplyJbPositionsToTx` und `jbGetSplitBookings` werden die zugehörigen Beitragspositionen (`contributions_positions`) unmittelbar in `tx.splitRows` (`tx.isSplit = true`) überführt, sodass sowohl die Haupttabelle als auch das Detail-Modal «Split-Buchung aufteilen» (`bhBankOpenSplitModal`) alle Teilbuchungen inklusive Ehrenmitglieder-/Vorstands-Abzügen konsistent ausweisen.

### 2.9 Strukturierte 20er-Block Transitkonten für Stiche & Weiterverrechnungen (13xx)
* **Problemstellung:** Laufen sämtliche Meisterschaftsstiche, Verbandsschiessen und Sonderbeiträge über ein einziges Sammelkonto `1300`, ist die rechnerische Detailkontrolle bei Jahresend-Differenzen extrem zeitaufwendig.
* **Architektur & Block-Standard:** Der 13xx-Bereich ist in feste 20er-Nummernblöcke gegliedert, deren Endziffern exakt mit den Gebühren-Codes korrespondieren:
  - `1300–1309`: Meisterschafts-Sammel- & Klärungskonto (`1300`), Gruppengewinne (`1301`).
  - `1310–1329`: 50m Kleinkaliber (`1310` Sammel; `1311` Grenzland KK001 bis `1318` Volksschiessen KK008; `1319–1329` Reserve).
  - `1330–1349`: 10m Luftgewehr (`1330` Sammel; `1331` AG DEZ LG001 bis `1337` Kniend LG007; `1338–1349` Reserve/Nachwuchs).
  - `1350–1369`: Zusatzpositionen & Feste (`1350` Sammel; `1351` Bekleidung Z001; `1352` Schützenfest Stiche Z002; `1353` Fest-Logis Z003; `1354–1369` Reserve).
* **Vorteil:** Die Bilanz saldiert jeden einzelnen Anlass transparent gegen die Verbandsrechnungen des Ausrichters (Soll = Verbandsrechnung, Haben = Beitragsanteile Mitglieder -> Saldo CHF 0.00).

---

## 3. Datenmodell (Kern-Tabellen)

| Tabelle | Primärschlüssel | Zweck & Invarianten |
| :--- | :--- | :--- |
| `public.accounting_accounts` | `konto` (VARCHAR) | KMU-Kontenrahmen mit Klassifizierung und Salden. |
| `public.accounting_journal` | `id` (BIGSERIAL) | Das lückenlose Hauptbuch (Datum, Beleg-Nr, Soll, Haben, Betrag, Buchungstext). |
| `public.accounting_payment_orders` | `id` (UUID) | Vorgemerkte Zahlungsaufträge (`ZA-YYYY-xxx`) für Banküberweisungen vor CAMT-Verbuchung. |
| `public.accounting_budgets` | `id` (UUID) | Jahresbudgets je Konto für den Soll/Ist-Vergleich im Controlling. |
| `public.accounting_bank_rules` | `id` (UUID) | Automatische Kontierungsregeln für wiederkehrende Banktexte (z.B. Zinsen, Spesen). |
| `public.accounting_cost_allocations` | `id` (UUID) | Konfigurierbare Zuteilungsquoten (%) für Vermietung, Wirtschaft und Sportbetrieb. |

---

## 4. Berechtigungen & RLS

* **Einsehen (`finanzen.view`):** Rollen `kassier`, `admin`, `vorstand`, `revisor`.
* **Buchen & Mutieren (`finanzen.buchhaltung`):** Strikt beschränkt auf `kassier` und `admin`.
