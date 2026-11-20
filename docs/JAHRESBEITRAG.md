# Fachdokumentation: Jahresbeitrag & Beitragsverwaltung

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.contributions_header`, `contributions_positions`, `member_participations`, `gebuehren_config`  
> **Verknüpfung:** `contributions_header.invoice_id` $\rightarrow$ `public.invoices.id`  
> **Frontend:** [`vorstand/js/jahresbeitrag/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresbeitrag/) (`jahresbeitrag-overview.js`, `jahresbeitrag-matrix.js`, `jahresbeitrag-core.js`, `jahresbeitrag-gebuehren.js`, `jahresbeitrag-calc.js`, `jahresbeitrag-import.js`, `jahresbeitrag-schnellerfassung.js`) & [`buchhaltung-bank.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/buchhaltung/buchhaltung-bank.js) (CAMT-Bankabgleich)

---

## 1. Übersicht & Systemgrenzen

Das Modul Jahresbeitrag steuert die jährliche Beitragsbemessung, Rechnungsstellung und Zahlungsabwicklung für alle Vereinsmitglieder. Es kombiniert die Mitglieder-Stammdaten (`members`) mit der dynamischen Gebührenordnung (`gebuehren_config`) und erzeugt für jedes beitragspflichtige Mitglied eine offizielle Vereinsrechnung mit Schweizer QR-Zahlteil.

* **Führendes System:** Supabase PostgreSQL (`public.contributions_header`, `public.contributions_positions`).
* **Forderungswesen:** Rechnungen werden über den zentralen [`RechnungsCore`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js) verwaltet.
* **Entkopplung:** Das alte Google Sheet `Jahresbeitrag` und alle damit verknüpften GAS-Makros sind vollständig stillgelegt.

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum dynamische Gebührenordnung (`gebuehren_config`) statt statischer Code-Werte?
* **Problem:** Beitrags- und Lizenzansätze werden an der Generalversammlung periodisch angepasst (z. B. Aktiv A G50m `JB001`, Aktiv B G50m `JB002`, Aktiv nur 10m `JB003`, Ehrenmitglied `JB004`, Passivmitglied `JB005`, Schüler intern `JB006`, Junior `JB007`, SSV-Lizenz `LI001`, Gebäudebeitrag / Schützenhaus `GE001`).
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
* **Automatisierung:** Der zentrale CAMT.054-Bankabgleich erfolgt konsolidiert über `buchhaltung-bank.js` (`jahresbeitrag-bank.js` wurde vollständig aus dem Projekt entfernt): Er liest den `CAMT.054`-XML-Kontoauszug, erkennt die 27-stelligen QR-Referenzen, setzt `contributions_header.status = 'bezahlt'` und bucht den Zahlungseingang in `public.invoice_payments` sowie im Finanzjournal (`accounting_journal`).

### 2.6 Warum KMU-Kontenrahmen (`accounting_accounts`) & Saubere Konto-Übergabe an `RechnungsCore`?
* **Problem:** Werden Gegenkonten statisch codiert oder Freitextnummern ohne Validierung eingetippt, entstehen Fehlbuchungen im Journal. Zudem gingen Kontierungszuordnungen verloren, wenn Fachmodule abweichende Key-Namen (`account` statt `konto`/`accountHaben`) an `RechnungsCore` schickten.
* **Lösung:** Alle Gebühren (`gebuehren_config`) und variablen Zusatzpositionen (Freie Beträge in Schnellerfassung) sind live an `public.accounting_accounts` angebunden. Bei Rechnungsfinalisierung übergibt `ensureInvoiceCreatedRemote` die aufgelösten Haben-Konten (`konto` & `accountHaben`) verbindlich an `RechnungsCore.createInvoice()`, sodass `invoice_positions.konto` und das Journal stets exakt kontiert sind. Weiterverrechnete Stiche und Anlässe nutzen die dedizierten 20er-Block Transitkonten (`1310–1329` für 50m Kleinkaliber KK, `1330–1349` für 10m Luftgewehr LG, `1350–1369` für Zusatzpositionen Z), wodurch jeder Schiessanlass in der Buchhaltung einzeln gegen die Verbandsrechnungen auf Null saldiert werden kann.

### 2.7 Warum einheitlicher TableKit-Standard & Spaltensortierung?
* **Konsistenz:** Sämtliche Tabellen (`jbTable`, `jbGebuehrenTable`, `jbMatrixTable`, `jbModalPositionsTable`, `jbBankTransactionsTable`) implementieren den zentralen `TableKit`-Standard (`ui-table-kit.js`) mit hellem Sticky-Header, persistenten Spaltenbreiten (`makeResizable`), Spaltenauswahl (`setupColumnToggle`), interaktiver Spaltensortierung (`data-sort-key` mit `▲`/`▼`) und barrierefreiem Scrollen.

### 2.8 Beitragsmatrix & Gebühren-Übersicht (`jahresbeitrag-matrix.js`)
* **Problem:** In der klassischen Rechnungsliste sieht man nur das Gesamttotal pro Schütze, hat aber keinen Gesamtüberblick über alle Gebühreneinnahmen (z. B. Wie viel nimmt der Verein insgesamt an Aktivbeiträgen, Lizenzen, Schützenhausgebühren oder Turnieren ein?).
* **Lösung:** Ein eigenständiger Reiter **«Beitragsmatrix»** stellt alle Schützen als Zeilen und alle anfallenden Gebühren als Spalten gegenüber:
  - **Farbliche Gruppierung & Kategorisierung im Header:** Alle Gebührenspalten sind logisch und farblich strukturiert (Blau = Jahresbeitrag `JB...`, Teal = Lizenzen & Schützenhaus `LI...`/`GE...`, Orange = Kleinkaliber 50m `KK...`, Violett = Luftgewehr 10m `LG...`, Grün = Rabatte & Nachwuchsförderung `RA...`/`KOSTENUEBERNAHME_JUGEND`, Slate = Variable Positionen `Z...`). Alle Badges sind bündig an der Oberkante ausgerichtet.
  - **Kompakte Zeilen & Multi-Kategorie-Hover:** Die Zeilenhöhe ist ultrakompakt (11px Schrift, 3px Padding). Die Personennummer ist in der Tabelle ausgeblendet; stattdessen listet der Tooltip beim Überfahren des Schützennamens alle Kategorien und Lizenzen der Person lückenlos auf (`Name (Ehrenmitglied, G50m (A), G10m (A))`).
  - **Treffer-basierte Kategorie-Filterung (ohne «Nur»-Einschränkung):** In der Toolbar filtert die Schnellauswahl nach Treffern: Sobald mindestens eine der Kategorien/Lizenzen eines Mitglieds zutrifft (z. B. `Ehrenmitglied`, `G50m (A)`, `G10m (A)`, `Aktiv A`), erscheint der Schütze im Filter und kann auch gezielt in der Pickliste selektiert werden.
  - **Optimiertes horizontales Scrollen:** Nur die Checkbox (`28px`) und der Schützenname (`130px`) sind links fixiert (`position: sticky`). Die Status-Spalte (`65px`) scrollt natürlich mit den Daten mit, wodurch frühere Überlagerungsfehler behoben sind.
  - **Dual-Scrollbar & Barrierefreiheit:** Eine synchronisierte obere Scrollleiste (`#jbMatrixTopScroll`) sowie Shift+Mausrad-Unterstützung erlauben horizontales Gleiten direkt vom Bildschirmkopf aus, ohne vorher zum Tabellenende scrollen zu müssen.
  - **Strukturierte Spaltenauswahl & Reset:** Spalten können über das Menü *«Spalten»* ein-/ausgeblendet oder mit *«Standard-Spalten»* jederzeit auf die Standardordnung zurückgesetzt werden.
  - **Pickliste ganz links:** Standardmässig sind alle Schützen ausgewählt. Wird ein Schütze abgewählt, wird er gedimmt und seine Beträge werden **live aus den Spaltensummen und dem Gesamttotal herausgerechnet**.
  - **Summenzeile (`<tfoot>`):** Fixierte Fusszeile mit Spaltensumme für jede Gebühr und Gesamttotal; passt sich live an sichtbare Spalten und ausgewählte Schützen an.
  - **Excel-Export:** Direkter Export der Matrix nach `.xlsx` über SheetJS (`XLSX`) unter Berücksichtigung der aktiv gefilterten Kategorien und eingeblendeten Spalten.
  - **Druckansicht:** Spezialisiertes `@media print`-Stylesheet optimiert für A4-Querformat mit wiederholten Kopf-/Fusszeilen, bei dem ausgeblendete Spalten automatisch unterdrückt werden.

### 2.9 Hausmeister-Rabatt (`RA002`) über die Beitragsverwaltung (Option B)
* **Problem:** Wird die Entschädigung «Hausmeister» als Verbandsfunktion in `member_functions` erfasst, wurde sie bei jedem SSV-Import gelöscht, da «Hausmeister» keine offizielle SSV-Funktion ist.
* **Lösung (Option B):** Der Hausmeister-Rabatt (`RA002`: CHF -300.00) wird vollständig im Fachmodul Jahresbeitrag gesteuert:
  - In der Schnellerfassung (`jahresbeitrag-schnellerfassung.js`) existiert ein eigener Umschalter *«Gutschrift Unterhalt Anlage (Hausmeister)»*.
  - Die Zuweisung wird pro Jahr in `public.member_participations` (`event_key = 'RA002'`) und den Rechnungspositionen persistiert.
  - Sowohl die Supabase RPC `calculate_member_contributions` (Migration 32) als auch die clientseitige Live-Berechnung `jbCalculateLiveTotal` unterstützen diesen Modus.
  - Der SSV-Import greift nicht auf Jahresbeitragstabellen zu – der Rabatt bleibt damit **100% vor Überschreibungen geschützt**.

### 2.10 Einheitlicher UIModalKit-Standard für alle Dialoge & Inspektoren
* **Problem:** Uneinheitliche Modals ohne Drag-, Resize- und Maximier-Funktionen führten auf kleineren Bildschirmen oder beim Vergleichen von Rechnungsdetails zu schlechter Usability.
* **Lösung:** Alle Dialoge im Modul Jahresbeitrag wurden auf den globalen `UIModalKit`-Standard (`ui-table-kit.js`) gehoben:
  - **`jbModalPositionen` (Rechnungs-Inspektor):** Frei verschiebbar per Header-Drag, stufenlos vergrösserbar/verkleinerbar via Resizer-Grip unten rechts, Fullscreen-Maximieren via Icon oder Header-Doppelklick.
  - **`jbModalZahlung` (Zahlungserfassung):** Zentriertes Layout mit Card-Design für Fälligkeitsbetrag, Drag & Resize Unterstützung.
  - **`jbModalGebuehrEdit` (Gebührenkonfiguration):** Vollständiges Drag & Resize mit Maximierungsmodus für die Live-Vorschau und Hilfesektionen.
  - **`bankReassignModal` (Bankabgleich / Zahlungsumbuchung):** Grossflächiges Drag- & Resize-Modal mit fixiertem Tabellenkopf für Match-Scores.

### 2.11 Automatische PDF-Neugenerierung (`forceRecreate`) & Cache-Busting
* **Problem:** Werden in der Schnellerfassung (`jahresbeitrag-schnellerfassung.js`) Beträge oder Rabatte mutiert, speichert die Supabase-DB die neuen Positionen ab. Die Deno Edge Function `generate-pdf` lieferte jedoch weiterhin das alte PDF aus dem Speicherarchiv (`storage/archive/`), und Browser luden die statische URL aus dem Disk-Cache.
* **Lösung & Warum:**
  - Jede Mutation in der Schnellerfassung (`jbSaveSingleMemberDirect`) triggert im Hintergrund unmittelbar `RechnungsCore.renderPdf(invoiceId, { forceRecreate: true })`.
  - Bei manuellem Klick auf *„PDF generieren“* in der Beitragsübersicht oder im Positions-Modal wird das Flag `{ forceRecreate: true }` mitgesendet.
  - Das Öffnen von PDFs im Frontend (`jbOpenInvoicePdfSafe`) erfolgt zwingend mit einem dynamischen Cache-Busting-Query-Parameter (`?t=${Date.now()}`), wodurch Browser und Proxies stets das aktuelle Dokument anzeigen.

### 2.12 DOM-Entkopplung der Modale & Backdrop-Lifecycle
* **Problem:** Wurden Dialoge (`#jbModalPositionen`, `#jbModalZahlung`) innerhalb von `#jahresbeitrag-container` gerendert, löschte jeder asynchrone Re-Render der Tabelle (`loadJahresbeitragData` / `renderJahresbeitragView`) den DOM-Knoten des aktiven Modals. Zurück blieb ein verwaistes `.modal-backdrop`-Overlay und die Klasse `body.modal-open`, was das gesamte UI unbedienbar machte (schwarzer Bildschirm / Freeze).
* **Lösung & Warum:**
  - Die Modale werden über `jbEnsureOverviewModals()` direkt als Kinder von `document.body` instanziiert.
### 2.13 Robuste Deduplizierung beim Turnier- & Dez-Import (`jahresbeitrag-import.js`)
* **Problem:** Haben Schützen in Excel-Blättern mehrere Starts im selben Wettkampf (z. B. SSV- und AGSV-Dezernat oder Mehrfachstarts), lieferte der Parser denselben `event_key` mehrfach im selben Batch. PostgreSQL lehnte den Batch mit Fehler `21000 (ON CONFLICT DO UPDATE command cannot affect row a second time)` ab.
* **Lösung & Warum:**
  - `jbSubmitExcelImport` dedupliziert alle Teilnahmen vor dem Schreiben nach `(person_number, year, event_key)` (`dedupMap`), sodass jeder Schlüssel pro Schütze und Jahr exakt einmal im Upsert-Payload vorkommt.

### 2.14 Multi-Select Checkbox-Dropdowns für Kategorien & Belegstatus (`jahresbeitrag-matrix.js`, `jahresbeitrag-overview.js`)
* **Problem:** Einzelne `<select>`-Dropdowns erlaubten jeweils nur das Auswählen einer einzigen Kategorie oder eines einzigen Status (z. B. nur «Aktiv A» oder nur «Offen»). Kombinationen (z. B. Aktiv A + Aktiv B oder Offen + Versendet) konnten nicht gleichzeitig betrachtet oder exportiert werden.
* **Lösung & Warum:**
  - Ersatz der bisherigen Einfach-Selects durch Bootstrap-Dropdowns mit `data-bs-auto-close="outside"`, Checkbox-Zeilen und dynamischen Zähler-Badges.
  - Ermöglicht das flexible, schrittweise Ankreuzen beliebiger Optionen (z. B. 1, 2, 5 Kategorien) sowie komfortable Schnellumschaltung («Alle Kategorien» / «Alle Status» / «Leeren»).
  - Die Filterlogik operiert reaktiv über JavaScript-`Set`-Objekte (`_jbMatrixCategoryFilter`, `_jbMatrixStatusFilter`, `_jbOverviewCategoryFilter`, `_jbOverviewStatusFilter`) und wird sowohl bei der Tabellenanzeige als auch bei Live-Summen und Excel-Exporten konsistent angewendet.
  - Das Parsing für `type === 'dez'` verhindert doppelte Event-Keys bereits in der Einzelzeilen-Erkennung (`addDezEvent`).
  - Echte Fehlerüberwachung: Fehler von `supa.from('member_participations').upsert` und `calculate_member_contributions` werfen nun explizite Ausnahmen, anstatt stillschweigend einen Erfolgs-Toast auszugeben.

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

---

## 5. Berechnungslogik & SSV-Lizenz-Hierarchie

Die Beitragsberechnung erfolgt nach einer deterministischen Kaskade aus Mitgliederkategorie, Lizenzen, Anlagennutzung, Wettkampfteilnahmen und Rabatten:

### 5.1 Kaskade für den Grundbeitrag (JB001–JB007)
1. **Ehrenmitglied (`is_honorary = true`):** $\rightarrow$ **`JB004` (`Ehrenmitglied`, CHF 0.00, Konto `3410`)**.
2. **Passivmitglied (`is_passive = true`):** $\rightarrow$ **`JB005` (`Passivmitglied`, CHF 20.00, Konto `3412`)**.
3. **Schüler intern (ohne aktive SSV-Lizenz / internes Profil):** `person_number` beginnt mit `INT-` oder Verein/Organisation `INTERN` $\rightarrow$ **`JB006` (`Schüler intern`, CHF 0.00, Konto `3420`)**.
4. **Junior / Nachwuchs:** Alter am Stichtag (Beitragsjahr) $\le$ 20 Jahre (SSV U20 bis U17) $\rightarrow$ **`JB007` (`Junior (U20 bis U17)`, CHF 10.00, Konto `3410`)**.
5. **Aktivmitglied (Erwachsene mit aktiver Muhen-Lizenz `1.19.0.01.029` in `member_licenses`, `is_active = true` und `exit_date IS NULL`):**
   - **Gewehr 50m (G50m, inklusive Liegend / Auflage – keine separaten Gebührenschlüssel):**
     - **Aktiv-A:** Wenn `license_category` auf `A` bzw. `Aktiv-A` lautet $\rightarrow$ **`JB001` (`Aktiv A G50m`, CHF 100.00, Konto `3410`)**.
     - **Aktiv-B:** Wenn `license_category` auf `B` bzw. `Aktiv-B` lautet $\rightarrow$ **`JB002` (`Aktiv B G50m`, CHF 70.00, Konto `3410`)**.
   - **Gewehr 10m / Luftgewehr (G10m, egal ob A oder B, inklusive Liegend / Auflage – ohne 50m-Lizenz):**
     - Wenn aktive 10m-Lizenz vorhanden und keine 50m-Lizenz $\rightarrow$ **`JB003` (`Aktiv nur 10m`, CHF 10.00, Konto `3410`)**.
   - **Keine aktive Muhen-Lizenz (z. B. nur Fremdlizenz G300 oder ohne Lizenz):**
     - $\rightarrow$ **`JB005` (`Passivmitglied`, CHF 20.00, Konto `3412`)**.

### 5.2 Ehrenmitglieder (`JB004` – direkter Nulltarif)
- **Regel (Migration 130):** Ehrenmitglieder (`is_honorary = true`) werden in der Kaskade prioritär direkt mit dem Tarif **`JB004` (`Ehrenmitglied`, CHF 0.00)** eingestuft, statt zuerst einen Aktiv-/Passivtarif zu berechnen und über `RA003` wieder abzuziehen.
- **Schutz vor Doppelrabatt & Altlasten (`RA003`):** `RA003` verbleibt in `gebuehren_config` lediglich als optionaler/historischer Abzugsschlüssel und wird bei `JB004` nicht zusätzlich ausgelöst (damit niemals ein negativer Grundbeitrag entsteht).
- **Gebühren-Invariante:** Lizenzen (SSV `LI001`) und Schützenhaus (`GE001`) sowie allfällige Wettkämpfe werden **weiterhin regulär verrechnet** (Befreiung betrifft ausschliesslich den Grundbeitrag).

### 5.3 SSV-Lizenzen (LI001–LI003)
- **Eigener Verein (Muhen, `license_invoicing_club_number = '1.19.0.01.029'`):**
  - Genau einmal pro Schütze abgerechnet:
    - Junior ($\le$ 20 Jahre): `LI002` (CHF 0.00).
    - Erwachsene: `LI001` (CHF 18.00).
- **Fremdlizenz (Anderer Verein rechnet SSV ab):**
  - Genau einmal pro Schütze abgerechnet: `LI003` (CHF 0.00, informative Position mit Vereinsname).
  - **Deduplizierung (Migration 41 & 114):** Hat ein Mitglied bei einem Fremdverein mehrere aktive Lizenzen (z. B. G50m und G10m), wird `LI003` in `calculate_member_contributions` strikt dedupliziert und nur exakt einmal in `contributions_positions` und auf der Rechnung ausgewiesen (analog zur Schnellerfassung). Eigene Muhen-Lizenzen haben Vorrang vor Fremdlizenzen.

### 5.4 Gebäudebeitrag / Schützenhaus (GE001)
- **Ansatz:** Vollständig dynamisch aus `public.gebuehren_config` (`GE001`, Ertragskonto `3413`).
- **Standard:** Pflichtig für alle Nicht-Junioren, Nicht-Passiven mit aktiver **G50m-Lizenz** in Muhen (unabhängig davon, ob die SSV-Lizenz über Muhen oder einen Fremdverein wie Oberentfelden abgerechnet wird).
- **Manueller Override:** Falls in `member_participations` für `event_key = 'GE001'` ein Eintrag existiert, gilt dessen Wert (`teilgenommen = 1` bzw. `0`).

### 5.5 Wettkämpfe & Turniere (KK001–KK008, LG001–LG007)
- Liest alle erfassten Teilnahmen aus `member_participations` je Mitglied und Beitragsjahr (`teilgenommen > 0`).
- **Einzelfeld:** Betrag = 1 $\times$ Tarifansatz aus `gebuehren_config`.
- **Counter-Feld (z. B. KK008 Volksschiessen):** Betrag = `teilgenommen` $\times$ Tarifansatz.

### 5.6 Rabatte & Gutschriften (RA001, RA002, RA003) & Vorzeichentoleranz
- **Vorzeichentoleranz:** In `public.gebuehren_config` erfasste Beträge für Rabatte werden vom System immer als Abzug behandelt (`-ABS(betrag)`). Ein versehentliches Erfassen von `100.00` anstelle von `-100.00` führt nicht zu Fehlern.
- **Vorstand (`RA001`):** Bleibt auf den Grundbeitrag beschränkt und greift nicht auf Schützenhaus oder Lizenzen über. Entfällt für Ehrenmitglieder (`JB004`), da deren Grundbeitrag bereits CHF 0.00 beträgt.
- **Hausmeister / Unterhalt (`RA002`):** Reine Gutschrift (keine Belastung wie bei Junioren). Betrag und Gegenkonto werden zu 100% dynamisch aus `public.gebuehren_config` gelesen (keine feste Verdrahtung).
- **Ehrenmitgliedschaft (`RA003`):** Historischer/optionaler Korrekturschlüssel (aktive Ehrenmitglieder werden seit Migration 130 direkt über `JB004` mit CHF 0.00 abgebildet; `RA003` wird bei `JB004` nicht ausgelöst).

### 5.7 Keine stillen Fallbacks & Fehlerbehandlung
- Das System verwendet keine hardcodierten Betrags- oder Konten-Fallbacks mehr.
- Fehlt ein Pflicht-Tarif oder ein Haben-Konto in `gebuehren_config`, wird im Frontend ein auffälliges Warn-Banner mit konkreter Handlungsanweisung angezeigt und die Rechnungsgenerierung blockiert.

### 5.8 Jugendförderung (Kostenübernahme Verein / Option A, Migration 72 & 114)
- **Vollautomatische Kostenübernahme:** Bei Junioren (`is_junior = true` bzw. Alter $\le$ 20 Jahre oder Tarif `JB006`/`JB007`) werden sämtliche Wettkampfteilnahmen (Kategorien `Kleinkaliber`, `Luftgewehr`, `Wettkampf` bzw. Schlüssel `KK%`, `LG%`) vollautomatisch saldiert.
- **Buchhalterischer Gegenbeleg:** Das System generiert automatisch je Wettkampf-Gegenkonto (Gruppierung in `calculate_member_contributions` nach `konto_haben`) eine Gegenposition **`KOSTENUEBERNAHME_JUGEND`** (*«Kostenübernahme Verein (Nachwuchsförderung)»*) in Höhe der dort summierten Wettkampfgebühren.
- **Transparenz:** Auf der Beitragsrechnung des Nachwuchsschützen sowie in der Beitragsmatrix sind alle geschossenen Stiche einzeln als Soll aufgeführt und durch die Vereinssubvention auf Saldo CHF 0.00 ausgeglichen (effektiver Rechnungsbetrag entspricht dem reinen Grundbeitrag `JB007` bzw. `JB006`). In der Buchhaltung (`RechnungsCore`) wird jedes betroffene Wettkampf- bzw. Ertragskonto exakt auf Null entlastet.

### 5.9 Floor-Regel
- Rechnungsbetrag wird auf mindestens CHF 0.00 begrenzt, ausser bei Hausmeister-Gutschriften (`RA002`), wo negative Auszahlungsbeträge für Unterhaltsentschädigungen zulässig sind.

---

## 6. Analyse: Warum bisher nur B-Lizenzen berechnet wurden

1. **Leere Lizenz-Tabelle in Supabase:**
   - In Supabase war die Tabelle `public.member_licenses` noch unbefüllt (0 Datensätze).
   - Beim Aufruf von `jbBerechnen()` fehlten dem Frontend jegliche Lizenzinformationen, sodass alle Schützen auf den Passiv-/Fallback-Tarif liefen.
2. **Defekter String-Abgleich im Legacy-GAS-Code:**
   - Die alte GAS-Funktion `lizenzTyp(cat)` prüfte ausschliesslich `c.includes('aktiv-a')`.
   - Schützen mit Kategorie `"G50m"` und separater `license_category = 'A'` wurden durch den ternären Operator `isA ? 'Aktiv-A' : 'Aktiv-B'` fälschlicherweise immer zu `'Aktiv-B G50m'` evaluiert.
3. **Unvollständige Parameterübergabe in `jbBerechnen()`:**
   - Das Frontend rief `jbCalculateLiveTotal(m, {})` mit leerem Settings-Objekt auf.
   - Weder Lizenzen (`settings.lizenz`) noch Turniere (`settings.events`) noch Vorstand-Rabatte wurden mitgeliefert.

---

## 7. Ziel-Architektur: Supabase PostgreSQL RPC Stored Procedure

Statt einer fehleranfälligen N-fachen HTTP-Schleife im Browser wird die persistente Massenberechnung als **PostgreSQL Stored Procedure (`public.calculate_member_contributions`)** ausgeführt:
- **Transaktionssicherheit:** Vollständig in einer ACID-Transaktion im Backend.
- **Performance:** Berechnung für alle 80+ Mitglieder in < 50 Millisekunden.
- **Konsistenz:** Single Source of Truth direkt in PostgreSQL; keine Datenverfälschung bei Verbindungsabbrüchen.
- **Frontend-Synchronität:** Die clientseitige `jbCalculateLiveTotal`-Funktion dient ausschliesslich der Live-Vorschau in der Schnellerfassung und teilt exakt dieselbe Spezifikation.

---

## 8. Ablauf & Rechnungs-Lifecycle: Von der Beitragsberechnung zur Rechnungsstellung

### 8.1 Der 4-Stufen-Workflow der Beitragsabwicklung

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STUFE 1: BEITRAGSBEMESSUNG (Fachmodul Jahresbeitrag)                                   │
│          Klick auf "Alle Beiträge berechnen" (jbBerechnen)                             │
│          ──► RPC calculate_member_contributions schreibt:                              │
│              - contributions_header (gesamt, status = 'offen', invoice_id = NULL)       │
│              - contributions_positions (Grundbeitrag, Lizenzen, Rabatte, Turniere)     │
│          ──► KEINE Rechnungen in public.invoices erzeugt! Nummernkreis unberührt.      │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STUFE 2: KONTROLLE & ABSTIMMUNG (Kassier / Vorstand)                                   │
│          - Kontrolle in der Beitragsmatrix (jahresbeitrag-matrix.js)                    │
│          - Prüfung: Ehrenmitglieder (JB004), Hausmeister (RA002), U21, Lizenzen        │
│          - Bei Bedarf: Manuelle Anpassungen via Schnellerfassung                        │
│          - Vorteil: Wiederholtes Berechnen möglich, OHNE Nummernkreise zu verbrennen.  │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STUFE 3: RECHNUNGS-BEREITSTELLUNG (Kopplung an RechnungsCore)                          │
│          Auslösung: Sammelversand-Start oder Klick auf "Rechnungen generieren"         │
│          ──► Für alle berechneten Mitglieder ohne invoice_id wird                      │
│              RechnungsCore.createInvoice(invoiceOrder) aufgerufen                      │
│          ──► Nummernkreis JB-26-XXXX atomar vergeben                                   │
│          ──► public.invoices (Status 'entwurf' / 'offen') und invoice_positions erzeugt │
│          ──► contributions_header.invoice_id verknüpft                                 │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STUFE 4: VERSAND & ZAHLUNGSABGLEICH (Zentrale Engines & FiBu)                           │
│          1. Sammelversand via Mail-Engine (PDF-Anhang, mail_status = 'versendet')       │
│          2. Rechnungs-Cockpit zeigt alle Jahresbeiträge mit Salden                     │
│          3. Bankabgleich: CAMT.054 matcht 27-stellige QRR lückenlos                    │
│          4. RechnungsCore.recordPayment verbucht im Hauptbuch (accounting_journal)      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Analyse: Entspricht der bisherige Ablauf der Systemarchitektur?

* **Der bisherige Ist-Zustand (Bruch in der Architektur):**
  - Nach `jbBerechnen()` existierten die Daten ausschliesslich in `contributions_header` und `contributions_positions`.
  - Rechnungen in `public.invoices` wurden bisher erst **„lazy / on-demand“** angelegt, wenn der Kassier für ein Mitglied einzeln auf das PDF-Icon (`jbGenerateInvoicePdfRemote`) oder Mail-Icon (`jbSendInvoiceEmailRemote`) klickte.
* **Architektur-Probleme des bisherigen Ist-Zustands:**
  1. **Sammelversand schlägt fehl:** Klickte der Kassier nach der Berechnung auf *„Sammelversand“* (`jbOpenSammelversandModal`), suchte das Modal in `window._invoices` nach Rechnungen des Typs `Jahresbeitrag`. Da diese noch nicht existierten, war die Liste **leer (0 Rechnungen)**.
  2. **Rechnungs-Cockpit unvollständig:** Das Rechnungsmodul (`public.invoices`) wusste nichts von den offenen Beitragsforderungen der 80+ Mitglieder.
  3. **Kein Bankabgleich:** CAMT.054 XML-Gutschriften konnten nicht automatisch gematcht werden, da die 27-stelligen QR-Referenzen in `public.invoices` noch gar nicht existierten.

### 8.3 Variantenvergleich & Empfohlene Soll-Architektur

| Kriterium | Variante A: Sofort-Erzeugung in `jbBerechnen()` | Variante B: 2-Stufen-Workflow (Berechnen ➔ Bereitstellen) ⭐ | Variante C: Bisheriges Lazy-Loading (Einzelklick) |
| :--- | :--- | :--- | :--- |
| **Ablauf** | `calculate_member_contributions` legt sofort für alle 80+ Mitglieder Rechnungen im `RechnungsCore` an. | Stufe 1 berechnet und prüft. Stufe 2 erzeugt alle Rechnungen im Batch vor dem Versand (oder automatisiert beim Klick auf Sammelversand). | Rechnungen werden erst beim Klick auf das PDF/Mail-Symbol des einzelnen Mitglieds angelegt. |
| **Nummernkreis-Sicherheit** | ❌ Schlecht: Ändert der Kassier nach der Berechnung noch Tarife, sind bereits 80 Nummern (`JB-26-XXXX`) vergeben und müssen storniert/gelöscht werden. | ✅ **Perfekt:** Berechnung kann beliebig oft wiederholt werden. Nummern werden erst bei definitiver Rechnungslegung vergeben. | ⚠️ Chaotisch: Nur wenige Mitglieder haben Rechnungsnummern, der Rest nicht. |
| **Sammelversand** | ✅ Funktioniert sofort | ✅ **Funktioniert zuverlässig** (generiert fehlende Rechnungen vor Modal-Öffnung) | ❌ **Kaputt** (öffnet mit 0 Rechnungen) |
| **Rechnungs-Cockpit & FiBu** | ✅ Sofort sichtbar | ✅ **Vollständig synchron** nach Rechnungsbereitstellung | ❌ Unvollständig (Debitorenspiegel fehlt) |
| **Bankabgleich (CAMT.054)** | ✅ Vollständig matchbar | ✅ **Vollständig matchbar** | ❌ Nicht matchbar für nicht-geklickte Belege |

> **Fazit & Architektur-Standard:**  
> **Variante B ist der verbindliche Standard.** Die fachliche Beitragsbemessung (Stufe 1) bleibt sauber von der buchhalterischen Forderungsentstehung (Stufe 2) entkoppelt. Vor dem Sammelversand oder auf Knopfdruck stellt das System sicher, dass für alle aktiven Beitragspositionen eine offizielle Rechnung im `RechnungsCore` existiert (`jbRechnungenBereitstellenBatch`).

---

### 8.4 Der 6-stufige effektive Status-Lebenszyklus (`jbGetEffectiveStatus`)

Da die Beitragsabwicklung sich über mehrere Phasen erstreckt (von der internen Kalkulation bis zum Buchhaltungsabgleich), reicht ein einfaches `'offen'` / `'bezahlt'` nicht aus. Das System ermittelt den tatsächlichen Zustand dynamisch über `jbGetEffectiveStatus(r)`:

```text
┌──────────────┐     Rechnungen      ┌──────────────┐      Sammel- /       ┌──────────────┐
│  berechnet   │ ──────────────────► │   entwurf    │ ───────────────────► │  versendet   │
│  (Total > 0, │   bereitstellen     │ (JB-26-XXXX, │    Einzelversand     │ (Ausstehend, │
│  keine RE)   │ ◄────────────────── │ mail:entwurf)│                      │ Mail gesandt)│
└──────────────┘    Rechnung löschen └──────────────┘                      └──────┬───────┘
                                                                                  │
       ┌──────────────┐                       Zahlungseingang /                   │
       │   befreit    │                       Bankabgleich (CAMT.054)             │
       │  (Total = 0) │                                                           │
       └──────────────┘                                                           ▼
                                     ┌──────────────┐      Vollzahlung     ┌──────────────┐
                                     │   bezahlt    │ ◄─────────────────── │ teilbezahlt  │
                                     │ (Salde = 0)  │                      │ (Rest offen) │
                                     └──────────────┘                      └──────────────┘
```

#### Status-Definitionen & Systemzustände

| Status | Bedingung im Datenmodell | Fachliche Bedeutung & Rechte |
| :--- | :--- | :--- |
| **`berechnet`** | `contributions_header.gesamt > 0` UND `invoice_id IS NULL` | Beitrag ist rein intern im Fachmodul berechnet. Es existiert noch keine Rechnungsnummer im RechnungsCore. Tarife und Teilnahmen dürfen frei recalculiert werden. |
| **`entwurf`** | `contributions_header.invoice_id` vorhanden, Beleg in `invoices` hat `mail_status === 'entwurf'` und `total_paid === 0` | Offizielle Rechnung mit Schweizer QR-Code existiert im RechnungsCore (`JB-26-XXXX`). Wurde noch nicht an das Mitglied zugestellt. Darf im Rechnungsmodul gelöscht werden (setzt `invoice_id` wieder auf `NULL`). |
| **`versendet`** | Beleg in `invoices` hat `mail_status === 'versendet'` und `open_amount > 0` | Rechnung wurde dem Mitglied per Mail zugestellt oder gedruckt. **Bearbeitungssperre aktiv** (Schutz vor GoBD-/Revisionsdiskrepanzen). |
| **`teilbezahlt`**| `invoices.status === 'teilbezahlt'` oder `total_paid > 0` und `< total_amount` | Teilzahlung über Bankabgleich oder Kasse verbucht. Mahnwesen mahnt Restsaldo an. |
| **`bezahlt`** | `invoices.status === 'bezahlt'` oder `contributions_header.status === 'bezahlt'` | Vollständig beglichen. Bearbeitung und Löschung vollständig gesperrt. |
| **`befreit`** | `contributions_header.gesamt === 0` | Befreiter Schütze (z.B. Ehrenmitglieder mit Vollbefreiung oder Nachwuchsschützen ohne Gebührenpflicht). Keine Rechnungsstellung nötig. |

---

### 8.5 Batch-Bereitstellung & Sammelversand Pre-Flight

1. **Button «Rechnungen bereitstellen (${uncreatedCount})»:**
   - Berechnet alle Datensätze des aktiven Jahres mit `gesamt > 0` und ohne `invoice_id`.
   - Ruft `window.jbRechnungenBereitstellenBatch()` auf.
   - Legt für jedes unübertragene Mitglied via `window.RechnungsCore.createInvoice(order)` atomar einen Rechnungsentwurf im RechnungsCore an, verknüpft `contributions_header.invoice_id` und erzeugt die QR-Bill.
2. **Pre-Flight Check bei Klick auf «Sammelversand» (`jbOpenSammelversandModal`):**
   - Prüft vor dem Öffnen des Massenversand-Modals, ob es noch unübertragene Mitglieder gibt.
   - Falls ja, fragt ein Bestätigungsdialog, ob diese vor dem Versand automatisch bereitgestellt werden sollen.
   - Übergibt anschliessend alle `JB-26-XXXX`-Rechnungs-IDs an `rnOpenMassSendModal`.

---

### 8.6 Entkoppelung bei Löschung im Rechnungsmodul (Einzel- & Sammellöschung)

Wird eine Jahresbeitrags-Rechnung (`JB-26-XXXX`) im Rechnungsmodul gelöscht – entweder über das Zeilenmenü (`rnDeleteInvoicePrompt`) oder via Sammelauswahl (`rnDeleteSelectedInvoices`):
1. Löscht `invoice_positions` und `invoices` (sofern nicht bezahlt).
2. Führt atomar `UPDATE contributions_header SET invoice_id = NULL WHERE invoice_id = :id` (bzw. `IN (...)`) aus.
3. Aktualisiert unmittelbar den lokalen Frontend-RAM-Cache (`window._jbData`, `window._jbAllBeitraege`, `window._jbAllInvoices`).
4. `jbMergeInvoicesIntoData` entkoppelt gelöschte Belege automatisch, wenn sie nicht mehr im geladenen Rechnungsbestand existieren.
5. Das System triggert im Hintergrund unmittelbar `loadJahresbeitragData(true, false)`, sodass beim Tab-Wechsel ins Jahresbeitrags-Cockpit alle Zeilen ohne F5-Reload sofort auf **`berechnet`** stehen und der Zähler *«Rechnungen bereitstellen»* aktuell ist.
6. Es entstehen keine verwaisten Rechnungs-IDs oder Inkonsistenzen.

---

### 8.7 TableKit-Standard (Spaltenverschiebung & Resizing)
* Sowohl die Haupt-Beitragstabelle (`#jbTable`) als auch die Beitragsmatrix (`#jbMatrixTable`) nutzen das globale `TableKit`:
  - Spalten per Drag & Drop verschiebbar via `TableKit.makeColumnReorderable` (mit lokaler Persistenz in `localStorage`).
  - Spaltenbreiten anpassbar via `TableKit.makeResizable`.
  - Spaltenauswahl via `TableKit.setupColumnToggle`.

---

### 8.8 Globale UI-Harmonisierung (`UIConfirmKit` & `UIButtonKit`)
* **Asynchrone Modale:** Sämtliche Bestätigungs- und Gefahrendialoge (Beitragsberechnung `jbBerechnen`, Beitragsjahr-Reset `jbResetYear`, Bereitstellung `jbRechnungenBereitstellenBatch`, E-Mail-Einzelversand `jbSendInvoiceEmailRemote`, Schützenhausbeitrag-Override und Bankabgleich `jbBankBookAll` / `jbBankBookOne`) wurden vollständig auf asynchrone Vereins-Modale (`UIConfirmKit.confirm` / `UIConfirmKit.alert`) umgestellt.
* **Doppelklick-Schutz & Spinner:** Schreibvorgänge wie Beitragsberechnung, manuelle Zahlungsverbuchung und automatischer Bankabgleich sind über `UIButtonKit.withLoading` mit sichtbarem Spinner und ausnahmslosem `finally`-Reset gegen Double-Submits gehärtet.
* **Tonalität:** Alle Dialogtexte und Benachrichtigungen sprechen Anwender einheitlich in der vereinsnahen Du-Form an.

---

### 8.9 Gruppengewinne Auswärtige Schiessen (Konto 1301) & Idempotenz-Kontrakt
* **Idempotente Beitragsberechnung:** Die PostgreSQL-Funktion `calculate_member_contributions` liest alle für das Beitragsjahr erfassten Gruppengewinne aus `public.group_competition_members` (mit `payout_method = 'jahresbeitrag'`) automatisch ein und generiert Positionen mit `source_field = '1301'` und Haben-Konto `1301`. Ein Klick auf *«Alle Beiträge berechnen»* löscht übertragene Gewinne nicht mehr, sondern synchronisiert sie stets idempotent mit dem aktuellen Stand.
* **Transparenz, Beiblatt & E-Mail-Anhang:** In der Beitragsübersicht weist ein Badge in der Spalte Gesamt den Gruppengewinn-Abzug direkt aus. Im Rechnungs-Inspektor Modal (`jbShowPositionen`) wird die Position mit Trophy-Icon und Herkunftshinweis (Anlass, Gruppe, Rang) transparent dargestellt. Auf dem generierten Rechnungs-PDF (`generate-pdf`) wird automatisch ein Beiblatt «Zusammensetzung Gruppengewinne» vor dem QR-Zahlteil eingefügt; beim E-Mail-Versand (Einzel- und Sammelversand) wird die Einzelberechnung mit 180 Tage gültigen Ranglisten-Links direkt im Mailtext eingeblendet und das separate Übersichts-PDF `Zusammensetzung_Gruppengewinne_<Jahr>.pdf` automatisch angehängt (die Ranglisten selbst werden zur Postfachschonung ausschliesslich als 180-Tage-Links bereitgestellt).
* **Reset- & Löschkaskade:** Beim Zurücksetzen des Beitragsjahres via `jbResetYear()` werden alle zugehörigen Schützen in `group_competition_members` atomar von `status = 'verrechnet'` wieder auf `status = 'offen'` zurückgesetzt. Beim Löschen einer Gruppe in der Jahresmeisterschaft (`jmDeleteGroupCompetition`) greift eine Löschsperre, falls die Jahresbeitragsrechnung bereits versendet oder bezahlt wurde; bei unversendeten Entwürfen wird die Gutschriftzeile automatisch aus `contributions_positions` und `invoice_positions` entfernt.

### 8.10 Resilienz bei SSV-Lizenz-Konflikten (Migration 117)
* **Lizenz-Integrität als Berechnungsgrundlage:** Die Beitragsermittlung in `calculate_member_contributions` hängt direkt von aktiven Lizenzen in `public.member_licenses` ab (`is_active IS TRUE`).
* **Verhinderung falscher Fallbacks:** Durch Migration 117 und die Härtung der Import-Engine (`extractAllLicenses`) werden aktive Muhen-Lizenzen bei Mitgliedern mit Mehrfachmitgliedschaften (z. B. Rolf Denzler mit beendeter Lizenz in Balsthal-Klus und aktiver Lizenz in Muhen) nicht mehr durch inaktive Fremdvereinszeilen überschrieben.
* **Ergebnis:** Das System weist Mitgliedern mit Aktiv-B-Lizenzen verlässlich `JB002 Aktiv B G50m` (CHF 70.00) plus Verbandskosten `LI001` (CHF 18.00) zu, anstatt auf `JB001` (CHF 100.00) zurückzufallen.

### 8.11 Variable Zusatzpositionen (`Z001`–`Z003`) & Bewahrung individueller Beträge (Migration 122)
* **Vorschlagswert vs. individueller Betrag:** Für variable Zusatzpositionen (`kategorie = 'variabel'` / `ui_typ = 'amount'` / Schlüssel `Z%`, z. B. `Z002` Beitrag Eidg. Schützenfest, `Z003` Übernachtung Eidgenössisches) dient `gebuehren_config.betrag` ausschliesslich als initialer Vorschlagswert. Sobald ein individueller Betrag, Text oder ein Haben-Konto für ein Mitglied erfasst wurde, ist `public.contributions_positions` die führende Quelle.
* **Saubere Trennung in Schnellerfassung & Live-Kalkulation:** `jbEntrySelectMember` löst bestehende Positionen über den kanonischen Schlüssel `CH-${_jbYear}-${pn}` (sowie Fallbacks) auf und schliesst `Z%`-Einträge aus `_jbParticipationsState.events` aus; `jbCalculateLiveTotal` verarbeitet variable Positionen ausschliesslich in Schritt 4 (`varFees`), sodass keine Doppelerfassung mit dem Standardtarif aus Schritt 3 entstehen kann.
* **Backend-Persistenz (`calculate_member_contributions`):** Bei einer Neuberechnung über die PostgreSQL-RPC bewahrt Schritt 4 für aktive `Z%`-Teilnahmen den bereits in `public.contributions_positions` gespeicherten individuellen `betrag`, `beschreibung` und `konto`, bevor die Positionen in Schritt 6 atomar neu geschrieben werden.

### 8.12 Bezeichnungs-Priorität, offene Beträge bei variablen Gebühren & Entwurfs-Sync (Migration 124)
* **Kanonische Text-Priorität (`bezeichnung_frontend` vor `ui_feld`):** Sowohl bei Standardgebühren als auch bei variablen Zusatzpositionen (`Z%`) gilt für Positionen und Rechnungsdruck die einheitliche Reihenfolge `bezeichnung_frontend || bezeichnung || ui_feld` (`jahresbeitrag-calc.js`, `jahresbeitrag-schnellerfassung.js`, `calculate_member_contributions`); `ui_feld` dient ausschliesslich als kurzes Steuerelement-/Spaltenlabel.
* **Leere / offene Standardbeträge bei `ui_typ = 'amount'`:** Variable Zusatzpositionen dürfen in `gebuehren_config` leer bzw. mit `CHF 0.00` gespeichert werden (`jahresbeitrag-gebuehren.js`); Positionen mit Betrag `0.00` werden weder im Frontend noch in `calculate_member_contributions` als Nullzeile fakturiert.
* **Automatischer Entwurfs-Abgleich & `source_field`-Vererbung:** Änderungen in der Gebührenkonfiguration gleichen automatisch unveränderte Standardtexte in offenen `contributions_positions` und noch nicht versendeten/bezahlten `entwurf`-Rechnungen ab (mit anschliessender PDF-Neugenerierung), und `ensureInvoiceCreatedRemote` sowie `jbSaveSingleMemberDirect` schreiben `source_field` durchgängig in `invoice_positions`.

### 8.13 Revisionssichere Sperren, Split-FiBu-Buchung & Tarif-/Stichjahr-Härtung (Migration 129)
* **SSV-Vereinsnummer, Fallback & Stichjahr:** `calculate_member_contributions` prüft ausschliesslich Muhen-Lizenzen der Vereinsnummer `1.19.0.01.029`, verwendet ohne aktive Muhen-Lizenz den Fallback `JB005` (`Passivmitglied`) und berechnet die U21-Altersgrenze (`age > 0 AND age <= 20`) sowohl serverseitig als auch in allen Frontend-Modulen (`jahresbeitrag-core.js`, `jahresbeitrag-calc.js`, `jahresbeitrag-overview.js`, `jahresbeitrag-schnellerfassung.js`) einheitlich gegen das ausgewählte Beitragsjahr `_jbYear`.
* **Durchgängige Lebenszyklus-Sperre:** Bereits versendete (`mail_status = 'versendet'`), teilbezahlte oder bezahlte Beiträge/Rechnungen werden durch `calculate_member_contributions` (inklusive gezieltem `p_target_pns`-Aufruf), `jbGetContributionLockState()` in der Schnellerfassung sowie `jbResetYear()` strikt geschützt; offene Entwürfe werden zentral und fehlergeprüft über `jbSyncOpenDraftInvoice()` aktualisiert.
* **Doppelbuchungs-Schutz bei Zahlungen & RBAC:** `jbSaveZahlung()` ruft `RechnungsCore.recordPayment(..., { syncBookkeeping: false, paymentMethod, documentRef })` auf und verbucht ausschliesslich die Konten-Splitbuchung im `accounting_journal` exakt einmal; Migration 129 ergänzt zudem die `SECURITY DEFINER`-Berechtigungsprüfung in `calculate_member_contributions` und schaltet `member_participations` per RLS für `jahresbeitrag.view`/`.manage` (inklusive Kassier) frei.
* **Globale UI-Toolkits & Modul-Hygiene:** Alle aktiven Skripte nutzen ausschliesslich `UIConfirmKit` (`{ title, message, type }`), `UIFormatKit` (`money`/`date`), `UIButtonKit.withLoading`, Du-Form und XSS-Escaping.

### 8.14 Harmonisierung Tarife JB001–JB007, Liegend/Auflage, Entwurfs-Sync & FiBu-Teilzahlungen (Migration 130)
* **Kanonische Tarife `JB001`–`JB007` & Liegend/Auflage:** Migration 130 harmonisiert `public.gebuehren_config` sowie `calculate_member_contributions` und `jahresbeitrag-calc.js` verbindlich auf `JB001 Aktiv A G50m` (`100.00`), `JB002 Aktiv B G50m` (`70.00`), `JB003 Aktiv nur 10m` (`10.00`, A und B), `JB004 Ehrenmitglied` (`0.00`), `JB005 Passivmitglied` (`20.00`), `JB006 Schüler intern` (`0.00`) und `JB007 Junior (U20 bis U17)` (`10.00`). Liegend- und Auflage-Lizenzen (`G50m Aufl.`, `G10m Aufl.`) werden direkt `JB001`–`JB003` zugeordnet, ohne separate Gebührenschlüssel anzulegen.
* **Ehrenmitglieder direkt mit `JB004`:** Mitglieder mit `is_honorary = true` erhalten direkt `JB004` (`CHF 0.00`), statt einen Aktivtarif über `RA003` gegenzurechnen (`RA003` dient nur noch als Legacy-Hinweis/Schutz falls `jbKey !== 'JB004'`). Bei der gezielten Neuberechnung sowie im Komplettluf bereinigt Schritt 1 stets nicht gesperrte Altzeilen vor dem Neuaufbau, und `KOSTENUEBERNAHME_JUGEND` gruppiert Subventionen sauber nach Wettkampf-Habenkonto (`temp_youth_subsidies`).
* **Revisionssichere Entwurfs-Synchronisation, `storniert`-Schutz & FiBu-Skalierung:** Alle Lebenszyklus-Prüfungen (`jbGetContributionLockState`, `jbGetEffectiveStatus`, `jbMergeInvoicesIntoData`, `ensureInvoiceCreatedRemote`, `jbResetYear`) schliessen stornierte Belege (`status === 'storniert'`) konsequent aus und ermitteln bereits bezahlte Beträge konsistent über `total_amount - open_amount`. `jbBerechnen` synchronisiert veränderte unversendete Entwürfe nach der Neuberechnung automatisch über `jbSyncOpenDraftInvoice` (inklusive Hintergrund-PDF-Refresh); `jbGetSplitBookings` skaliert Split-Buchungen bei Teilzahlungen proportional mit Cent-Rundungsausgleich. Die obsolete Altdatei `vorstand/js/jahresbeitrag/jahresbeitrag-bank.js` wurde vollständig entfernt, und globale Namenskollisionen (`jbEscHtml`) sowie fehlende UI-Kit-Wrappings (`UIExportKit.dataToExcel`, `UIButtonKit.withLoading`) behoben.








