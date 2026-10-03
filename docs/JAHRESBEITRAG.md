# Fachdokumentation: Jahresbeitrag & Beitragsverwaltung

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.contributions_header`, `contributions_positions`, `member_participations`, `gebuehren_config`  
> **Verknüpfung:** `contributions_header.invoice_id` $\rightarrow$ `public.invoices.id`  
> **Frontend:** [`vorstand/js/jahresbeitrag/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresbeitrag/) (`jahresbeitrag-overview.js`, `jahresbeitrag-matrix.js`, `jahresbeitrag-core.js`, `jahresbeitrag-gebuehren.js`, `jahresbeitrag-calc.js`, `jahresbeitrag-bank.js`, `jahresbeitrag-schnellerfassung.js`)

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

### 2.7 Warum einheitlicher TableKit-Standard & Spaltensortierung?
* **Konsistenz:** Sämtliche Tabellen (`jbTable`, `jbGebuehrenTable`, `jbMatrixTable`, `jbModalPositionsTable`, `jbBankTransactionsTable`) implementieren den zentralen `TableKit`-Standard (`ui-table-kit.js`) mit hellem Sticky-Header, persistenten Spaltenbreiten (`makeResizable`), Spaltenauswahl (`setupColumnToggle`), interaktiver Spaltensortierung (`data-sort-key` mit `▲`/`▼`) und barrierefreiem Scrollen.

### 2.8 Beitragsmatrix & Gebühren-Übersicht (`jahresbeitrag-matrix.js`)
* **Problem:** In der klassischen Rechnungsliste sieht man nur das Gesamttotal pro Schütze, hat aber keinen Gesamtüberblick über alle Gebühreneinnahmen (z. B. Wie viel nimmt der Verein insgesamt an Aktivbeiträgen, Lizenzen, Schützenhausgebühren oder Turnieren ein?).
* **Lösung:** Ein eigenständiger Reiter **«Beitragsmatrix»** stellt alle Schützen als Zeilen und alle anfallenden Gebühren als Spalten gegenüber:
  - **Pickliste ganz links:** Standardmässig sind alle Schützen ausgewählt. Wird ein Schütze abgewählt, wird er gedimmt und seine Beträge werden **live aus den Spaltensummen und dem Gesamttotal herausgerechnet**.
  - **Summenzeile (`<tfoot>`):** Fixierte Fusszeile mit Spaltensumme für jede Gebühr und Gesamttotal.
  - **Excel-Export:** Direkter Export der Matrix nach `.xlsx` über SheetJS (`XLSX`).
  - **Druckansicht:** Spezialisiertes `@media print`-Stylesheet optimiert für A4-Querformat mit wiederholten Kopf-/Fusszeilen.

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
  - Ein zentraler Bereinigungsmechanismus (`jbCleanupModals()`) stellt sicher, dass beim Schliessen, bei Fehlern oder bei Modal-Übergängen (z. B. Wechsel zu Rechnungsdetails oder Mail-Prompt via `rnTransitionFromDetails`) alle Backdrop-Fragmente rückstandslos entfernt und der Scroll-Status des Bodys wiederhergestellt wird.

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
1. **Passivmitglied:** `is_passive = true` $\rightarrow$ `JB005` (CHF 20.00).
2. **Schüler intern (ohne SSV-Lizenz):** `person_number` beginnt mit `INT-` und Junior $\rightarrow$ `JB006` (CHF 0.00).
3. **Junior / Nachwuchs:** Alter am Stichtag $\le$ 20 Jahre (SSV U21-Definition) $\rightarrow$ `JB007` (CHF 20.00).
4. **Aktivmitglied (Erwachsene mit SSV-Lizenz):**
   - Prüfung aktiver Lizenzen in `member_licenses` (`is_active = true` und `exit_date IS NULL`):
     - **Gewehr 50m (G50m):**
       - **Aktiv-A:** Wenn `license_category = 'A'` oder Kategorie `'Aktiv-A'` enthält $\rightarrow$ **`JB001` (CHF 100.00)**.
       - **Aktiv-B:** Wenn `license_category = 'B'` oder Kategorie `'Aktiv-B'` enthält $\rightarrow$ **`JB002` (CHF 70.00)**.
     - **Gewehr 10m (G10m):**
       - Wenn aktive 10m-Lizenz vorhanden und keine 50m-Lizenz $\rightarrow$ **`JB003` (CHF 10.00)**.
     - **Keine eigene Muhen-Lizenz (z. B. nur Fremdlizenz G300):**
       - $\rightarrow$ **`JB005` (CHF 20.00, Passivbeitrag)**.

### 5.2 Ehrenmitglieder & Ausweisung mit Rabatt-Cap (RA003)
- **Regel:** Ehrenmitglieder erhalten ihren regulären Grundbeitrag (z. B. Aktiv A CHF 100.–, Aktiv B CHF 70.– bzw. Passiv CHF 20.–) ausgewiesen.
- **Gegenzeile mit Cap:** Direkt darunter wird als Gegenposition **`Ehrenmitgliedschaft`** (`RA003`) mit negativem Betrag eingefügt.
  - **Formel:** `effektiver_rabatt = -Math.min(Grundbeitrag, ABS(Tarif RA003))` (in PostgreSQL: `-LEAST(v_base_fee_amt, ABS(v_geb.betrag))`).
  - **Beispiel:** Beträgt der Grundbeitrag CHF 150.– und der Rabatt CHF 100.–, zahlt das Ehrenmitglied die Differenz (CHF 50.–). Beträgt der Grundbeitrag CHF 70.– oder CHF 20.–, wird der Rabatt auf CHF -70.– bzw. CHF -20.– gespiegelt.
  - **Schutz vor Minusbetrag:** Da der Abzug exakt auf die Höhe des Grundbeitrags gedeckelt ist, entsteht auch bei Passiv-Ehrenmitgliedern niemals ein negativer Saldo.
- **Gebühren-Invariante:** Lizenzen (SSV `LI001`) und Schützenhaus (`GE001`) sowie allfällige Wettkämpfe werden **weiterhin regulär verrechnet** (keine Befreiung durch Ehrenmitgliedschaft).

### 5.3 SSV-Lizenzen (LI001–LI003)
- **Eigener Verein (Muhen, `license_invoicing_club_number = '1.19.0.01.029'`):**
  - Genau einmal pro Schütze abgerechnet:
    - Junior ($\le$ 20 Jahre): `LI002` (CHF 0.00).
    - Erwachsene: `LI001` (CHF 18.00).
- **Fremdlizenz (Anderer Verein rechnet SSV ab):**
  - Für jede Fremdlizenz: `LI003` (CHF 0.00, informative Position mit Vereinsname).

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
- **Vorstand (`RA001`):** Bleibt auf den Grundbeitrag beschränkt und greift nicht auf Schützenhaus oder Lizenzen über. Entfällt für Ehrenmitglieder, da diese bereits durch `RA003` vom Grundbeitrag entlastet sind.
- **Hausmeister / Unterhalt (`RA002`):** Reine Gutschrift (keine Belastung wie bei Junioren). Betrag und Gegenkonto werden zu 100% dynamisch aus `public.gebuehren_config` gelesen (keine feste Verdrahtung).
- **Ehrenmitgliedschaft (`RA003`):** Dynamischer Rabatt bis zur Höhe des Grundbeitrags (Konto aus `gebuehren_config`, Standard `3410`).

### 5.7 Keine stillen Fallbacks & Fehlerbehandlung
- Das System verwendet keine hardcodierten Betrags- oder Konten-Fallbacks mehr.
- Fehlt ein Pflicht-Tarif oder ein Haben-Konto in `gebuehren_config`, wird im Frontend ein auffälliges Warn-Banner mit konkreter Handlungsanweisung angezeigt und die Rechnungsgenerierung blockiert.

### 5.8 Jugendförderung (Kostenübernahme Verein)
- Bei Junioren werden alle Wettkampfpositionen der Kategorie `Kostenübernahme_Jugend` saldiert und als Gegenposition `KOSTENUEBERNAHME_JUGEND` gutgeschrieben.

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
│          - Prüfung: Ehrenmitglieder (RA003), Hausmeister (RA002), U21, Lizenzen        │
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




