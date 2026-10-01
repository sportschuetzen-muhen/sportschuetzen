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

---

## 5. Berechnungslogik & SSV-Lizenz-Hierarchie

Die Beitragsberechnung erfolgt nach einer deterministischen Kaskade aus Mitgliederkategorie, Lizenzen, Anlagennutzung, Wettkampfteilnahmen und Rabatten:

### 5.1 Kaskade für den Grundbeitrag (JB001–JB007)
1. **Ehrenmitglied:** `is_honorary = true` $\rightarrow$ `JB004` (CHF 0.00).
2. **Passivmitglied:** `is_passive = true` $\rightarrow$ `JB005` (CHF 20.00).
3. **Schüler intern (ohne SSV-Lizenz):** `person_number` beginnt mit `INT-` $\rightarrow$ `JB006` (CHF 0.00).
4. **Junior / Nachwuchs:** Alter am Stichtag $\le$ 20 Jahre (SSV U21-Definition) $\rightarrow$ `JB007` (CHF 20.00).
5. **Aktivmitglied (Erwachsene mit SSV-Lizenz):**
   - Prüfung aktiver Lizenzen in `member_licenses` (`is_active = true` und `exit_date IS NULL`):
     - **Gewehr 50m (G50m):**
       - **Aktiv-A:** Wenn `license_category = 'A'` oder Kategorie `'Aktiv-A'` enthält $\rightarrow$ **`JB001` (CHF 100.00)**.
       - **Aktiv-B:** Wenn `license_category = 'B'` oder Kategorie `'Aktiv-B'` enthält $\rightarrow$ **`JB002` (CHF 70.00)**.
     - **Gewehr 10m (G10m):**
       - Wenn aktive 10m-Lizenz vorhanden und keine 50m-Lizenz $\rightarrow$ **`JB003` (CHF 10.00)**.
     - **Keine eigene Muhen-Lizenz (z. B. nur Fremdlizenz G300):**
       - $\rightarrow$ **`JB005` (CHF 20.00, Passivbeitrag)**.

### 5.2 SSV-Lizenzen (LI001–LI003)
- **Eigener Verein (Muhen, `license_invoicing_club_number = '1.19.0.01.029'`):**
  - Genau einmal pro Schütze abgerechnet:
    - Junior ($\le$ 20 Jahre): `LI002` (CHF 0.00).
    - Erwachsene: `LI001` (CHF 18.00).
- **Fremdlizenz (Anderer Verein rechnet SSV ab):**
  - Für jede Fremdlizenz: `LI003` (CHF 0.00, informative Position mit Vereinsname).

### 5.3 Gebäudebeitrag / Schützenhaus (GE001)
- Ansatz: `GE001` (CHF 50.00).
- **Manueller Override:** Falls in `member_participations` für `event_key = 'GE001'` ein Eintrag existiert, gilt dessen Wert (`teilgenommen = 1` bzw. `0`).
- **Standard:** Pflichtig für alle Nicht-Junioren, Nicht-Passiven mit aktiver **G50m-Lizenz** in Muhen.

### 5.4 Wettkämpfe & Turniere (KK001–KK008, LG001–LG007)
- Liest alle erfassten Teilnahmen aus `member_participations` je Mitglied und Beitragsjahr (`teilgenommen > 0`).
- **Einzelfeld:** Betrag = 1 $\times$ Tarifansatz aus `gebuehren_config`.
- **Counter-Feld (z. B. KK008 Volksschiessen):** Betrag = `teilgenommen` $\times$ Tarifansatz.

### 5.5 Rabatte (RA001, RA002)
- Aus `member_functions`:
  - Vorstand (`RA001`): CHF -100.00 (Kredit), entfällt für Ehrenmitglieder.
  - Hausmeister / Unterhalt (`RA002`): CHF -300.00 (Kredit).

### 5.6 Jugendförderung (Kostenübernahme Verein)
- Bei Junioren werden alle Wettkampfpositionen der Kategorie `Kostenübernahme_Jugend` saldiert und als Gegenposition `KOSTENUEBERNAHME_JUGEND` gutgeschrieben.

### 5.7 Floor-Regel
- Rechnungsbetrag wird auf mindestens CHF 0.00 begrenzt, ausser bei Hausmeister-Gutschriften (`RA002`), wo negative Auszahlungsbeträge zulässig sind.

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


