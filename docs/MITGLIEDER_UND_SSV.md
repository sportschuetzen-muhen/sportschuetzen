# Fachdokumentation: Mitgliederverwaltung & SSV-Verbandsimport

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.members`, `member_licenses`, `member_functions`, `member_training`, `member_history`  
> **Frontend:** [`vorstand/js/mitglieder/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/mitglieder/) (`mitglieder-core.js`, `mitglieder-import-engine.js`, `mitglieder-edit.js`, `mitglieder-sync-ui.js`)

---

## 1. Übersicht & Systemgrenzen

Die Mitgliederverwaltung ist das zentrale personelle Stammdaten-Rückgrat des gesamten Vereinsportals. Alle Module (Rechnungen, Jahresbeitrag, KK-Jahresmeisterschaft, Vermietung, Generalversammlung, Resultate) beziehen Personendaten und Adress-Snapshots aus dieser Domäne.

* **Führendes System:** Supabase PostgreSQL (`public.members`).
* **Verbandsdaten:** Offizieller Export des Schweizer Schiesssportverbands (SSV) als `.xlsx`.
* **Entkopplung:** Google Sheets und GAS-Dual-Writes sind vollständig stillgelegt.

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum browser-native SSV-Diff-Engine & atomare PostgreSQL Batch-RPC (`apply_ssv_import_batch`)?
* **Problem:** Der Verband (SSV) bietet keine direkte REST-Webservice-Schnittstelle; Mutationen müssen periodisch als Excel-Arbeitsmappe exportiert werden. Frühere Google Apps Scripts liefen dabei in 60-Sekunden-Timeouts und führten langsame Einzeloperationen durch.
* **Lösung & Warum:** Die Import-Engine ([`mitglieder-import-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/mitglieder/mitglieder-import-engine.js)) parst die Verbands-XLSX direkt im Browser mittels SheetJS in `< 100 ms`.
* **Menschliche Kontrolle (Human-in-the-Loop):** Ein automatischer Server-Cronjob birgt das Risiko, fehlerhafte Verbandsdaten unbemerkt zu importieren. Die Browser-Engine zeigt dem Mitgliederverwalter eine transparente 3-Kategorie-Diff-Vorschau (im globalen TableKit-Standard mit hellem Sticky-Header):
  1. *Neu aufzunehmende Mitglieder* (Grün)
  2. *Geänderte Stammdaten / Lizenzen* (Gelb mit Vorher/Nachher-Gegenüberstellung)
  3. *Im SSV nicht mehr geführte Personen* (Rot)
* **Atomare Massenpersistierung:** Nach Prüfung und Klick auf «Änderungen anwenden» wird das gesamte Datenpaket in einem einzigen RPC-Aufruf an die Stored Procedure `public.apply_ssv_import_batch` übergeben. In PostgreSQL werden `members`, `member_licenses`, `member_functions`, `member_training` und das Revisions-Log `member_history` in einer einzigen ACID-Transaktion in `< 40 ms` synchronisiert.

### 2.1.1 Einheitlicher TableKit-Standard im gesamten Modul
* Sämtliche Tabellen des Mitgliederbereichs (Hauptliste `#mgl-table`, Import-Vorschau `#mglImportDiffTable` und Detail-Tabellen für Lizenzen und Funktionen) implementieren den globalen `TableKit`-Standard (`ui-table-kit.js`):
  - Heller Sticky-Header (`thead.table-light sticky-top small text-muted text-uppercase`) mit `z-index: 10`.
  - Persistente Spaltenbreiten via `TableKit.makeResizable` mit lokalem Browser-Speicher.
  - Spaltenauswahl via `TableKit.setupColumnToggle`.

### 2.2 Warum zwingender Quellschutz für Passiv- & Ehrenmitglieder?
* **Invariante:** Der SSV-Export enthält ausschliesslich lizenzierte Aktivschützen. Passivmitglieder, Gönner, Veteranen und Ehrenmitglieder ohne Schiesslizenz tauchen in der Verbandsdatei nicht auf.
* **Schutzmechanismus:** Das Feld `is_passive_source = 'manual'` bzw. Status `ehrenmitglied` / `passiv` ist gegen automatisches Löschen oder Deaktivieren durch den SSV-Import gesperrt. Sie verbleiben dauerhaft im Verein, selbst wenn sie im SSV-Auszug fehlen.

### 2.3 Warum lückenloser Audit-Trail in `public.member_history`?
* **Revisionssicherheit:** Jede Mutation an einem Mitglied (Adresse, Telefon, E-Mail, Statuswechsel) erzeugt einen unveränderbaren Eintrag in `public.member_history` (inkl. Zeitstempel, ausführendem Vorstandskonto und `diff`-JSONB).
* **Nutzen:** Kommt es zu Fehlern bei der Rechnungsstellung oder Postrückläufern, kann sekundengenau nachvollzogen werden, wer wann welche Adressänderung vorgenommen hat.

### 2.4 Warum die Sonderkategorie «Jugend (U21)»?
* **Stichtag:** Nach den Statuten des SSV und der Sportschützen Muhen gilt ein Schütze bis zum 20. Altersjahr als Nachwuchs (Stichtag: $\text{Geburtsjahr} \ge \text{Aktuelles Jahr} - 20$).
* **Auswirkungen:**
  - **Jahresbeitrag:** Erhält automatisch den reduzierten Nachwuchs-Tarif in der Gebührenordnung.
  - **KK-Jahresmeisterschaft:** Wird automatisch für die U21-Nachwuchswertung klassiert (mit reduzierten Streichresultaten).
  - **UI-Kennzeichnung:** Erhält im Vorstandscockpit ein blaues `U21`-Badge zur schnellen Identifikation.

---

## 3. Datenmodell (Kern-Tabellen & Indizes)

| Tabelle | Primärschlüssel | Eindeutige Indizes (Idempotenz) | Zweck & Invarianten |
| :--- | :--- | :--- | :--- |
| `public.members` | `person_number` (INT) | `members_pkey (person_number)` | Stammdaten (`person_number` = SSV-Nummer, `first_name`, `last_name`, `email`, `address`, `post_code`, `city`, `birth_date`). |
| `public.member_licenses` | `id` (UUID) | `idx_licenses_unique (person_number, membership_category, entry_date) NULLS NOT DISTINCT` | Schiesslizenzen (Gewehr 50m, 10m, Lizenzstatus aktiv/inaktiv). `NULLS NOT DISTINCT` stellt sicher, dass auch Lizenzen ohne explizites Eintrittsdatum konfliktfrei via `ON CONFLICT` aktualisiert werden. |
| `public.member_functions` | `id` (UUID) | `idx_member_functions_unique (person_number, official_function_category, COALESCE(official_function_entry_date, '1900-01-01'))` | Vereinsfunktionen (Vorstand, Präsident, Schützenmeister, Revisor). |
| `public.member_training` | `id` (UUID) | `idx_member_training_unique (person_number, course_category, module, COALESCE(completed_training_date, '1900-01-01'))` | J+S- und Schiessleiter-Ausbildungen. |
| `public.member_history` | `id` (UUID) | – | Unveränderliches Audit-Log jeder Stammdaten- und Lizenzmutation. |

---

## 4. Berechtigungen & RLS

* **Lesen (`members.view`):** Alle authentifizierten Vorstandsmitglieder und Revisoren.
* **Mutieren (`members.edit`):** Strikt beschränkt auf Rollen `admin`, `vorstand` und die Funktion *Mitgliederverwalter*.
* **Mitglieder-App:** Angemeldete Mitglieder sehen über ihre eigene Session ausschliesslich ihr eigenes Profil (`auth_user_id = auth.uid()`).

---

## 5. Erstimport vs. Periodische Monats-Synchronisation

### 5.1 Erstimport (Initialer Verbandsdatenbestand ab Januar)
* **Zweck:** Schaffung einer sauberen, revisionssicheren Ausgangsbasis (Baseline) zum Jahresbeginn (z. B. 01. Januar).
* **Resilientes Verhalten bei leerer Datenbank (Zero-State-Robustheit):**
  - Befindet sich das System im Ausgangszustand vor dem Erstimport (`count(*) = 0` in `public.members`), darf dies vom Frontend **niemals als Systemfehler** interpretiert werden.
  - Das Modul rendert die Navigationsleiste vollständig und zeigt eine benutzerfreundliche Empty-State-Card mit Direktlink auf den Tab *«SSV-Import»*. Sämtliche Altlasten und irreführende Google Apps Script Fehlermeldungen wurden restlos eliminiert (striktes GAS-Fallback-Verbot).
* **Ablauf:**
  1. Die betroffenen Tabellen (`member_history`, `member_training`, `member_licenses`, `member_functions`, `members`) sind initial leer.
  2. Der Verwalter wechselt direkt in den Tab *«SSV-Import»* und lädt die Januar-Arbeitsmappe (`.xlsx`) hoch.
  3. Die Diff-Engine erkennt alle Datensätze automatisch zu 100 % als **«NEU» (Grün)**.
  4. Mit Klick auf *«Änderungen anwenden»* persistiert `apply_ssv_import_batch` die Stammdaten, Lizenzen und Funktionen atomar in PostgreSQL. Es entstehen keine Vorher-Nachher-Diskrepanzen.

### 5.2 Periodische Folge-Synchronisation (Monatliche SSV-Updates)
* **Ablauf:**
  1. Hochladen des aktuellen SSV-Exportes (z. B. Februar, März oder Herbst).
  2. Die Diff-Engine gleicht den Verbandsdatenbestand mit der PostgreSQL-Datenbank ab und visualisiert exakt die Mutationen:
     - **Grün:** Neu aufgenommene Personen / neue Lizenzen.
     - **Gelb:** Adressänderungen, Namenskorrekturen, Lizenz-Kategorie-Wechsel.
     - **Rot:** Personen, die im SSV nicht mehr als aktiv geführt werden (Quellschutz beachten: manuelle Ehren- und Passivmitglieder werden nicht gelöscht).
  3. Beim Anwenden werden Mutationen in `members` und via `ON CONFLICT` in `member_licenses` bzw. `member_functions` eingepflegt und sekundengenau in `member_history` archiviert.

---

## 6. Erkenntnisse aus dem SSV-Verbandsdatenbestand & Datenschutz

### 6.1 Datenschutz & Ausschluss von Git-Commits
* **Strikter Datenschutz:** Sämtliche Rohdatenexporte des SSV (Ordner `SSV Daten/`, `SSV/` sowie alle `.xlsx`/`.csv`-Dateien) enthalten schützenswerte Personendaten nach Schweizer DSG (Adressen, Geburtsdaten, Telefonnummern, E-Mails, Lizenzdaten).
* **Git-Schutz:** Diese Ordner und Dateitypen sind ausnahmslos in [`.gitignore`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/.gitignore) eingetragen und dürfen **niemals** in das GitHub-Repository committet oder gepusht werden.

### 6.2 SSV-Tabellenstruktur & Lizenz-Erkennung
Die offizielle SSV-Verbandsarbeitsmappe (z. B. `SSV Mitgliederverzeichnis_20092026 (1).xlsx`) liefert im Sheet `DataSource` sämtliche Mitgliedszeilen mit folgenden massgeblichen Spalten:
1. `MembershipCategory`: Spezifiziert die Disziplin und Stufe (z. B. `Aktiv-A G50m`, `Aktiv-B G50m`, `Aktiv-A G10m`, `Aktiv-A G10m Auflage`).
2. `LicenseCategory`: `A` (Voll-Lizenz / Meisterschaften) oder `B` (B-Lizenz / Zweitverein).
3. `LicenseType`: SSV-Typisierung (`LizenzG50m`, `LizenzG10m`).
4. `LicenseInvoicingClubNumber`: Rechnungsstellender Verein des SSV.
   - `1.19.0.01.029`: Muhen (Stammverein $\rightarrow$ beitragspflichtig für Vereinslizenz `LI001` / `LI002`).
   - Abweichende Vereinsnummer: Fremdlizenz ($\rightarrow$ Abrechnung über Drittverein, in Muhen `LI003` CHF 0.00).
5. `OfficialFunctionCategory`: Vereins- und Verbandsfunktionen (Präsident, Kassier, Aktuar, Schützenmeister, Juniorenleiter $\rightarrow$ rabattberechtigt für Vorstand `RA001`).

### 6.3 Disziplinen-basiertes Lizenz-Matching & Klare Mutationstypen (Variante A)
* **Problem isolierter String-Vergleiche:** Ein Schütze, der den Stammverein zu Muhen wechselt (z. B. von Frick als B-Mitglied zu Muhen als A-Mitglied), erhielt im SSV eine beendete B-Zeile und eine neue A-Zeile. Eine naive String-Vergleichslogik erzeugte daraus fälschlicherweise zwei unverbundene Operationen: *«Lizenz Neu»* (Grün) und *«Lizenz Ende»* (Rot/Entzug).
* **Priorität der A-Lizenz (Voll-Lizenz Muhen):** Wenn eine Person in Muhen eine aktive 10m- oder 50m-Lizenz der Kategorie `Aktiv-A` (oder `LicenseCategory = 'A'`) besitzt, ist Muhen in dieser Disziplin Stammverein mit Voll-Lizenz – selbst wenn `LicenseInvoicingClubNumber` eine fremde Vereinsnummer ausweist (z. B. ein 300m- oder Pistolenverein wie Kölliken Pistolenschützen bei Leonardo Iapello).
* **Darstellung in der Vorschau:** Bei A-Lizenzen wird der neue Wert ohne verwirrenden Klammerzusatz ausgegeben (`Aktiv-A G10m Auflage`). Bei B-Lizenzen (wie Patrick Fleischli) wird der tatsächliche Stammverein in Klammern mitgeführt (`Aktiv-B G10m [Buchs LU Schützengesellschaft]`).
* **Klassifizierung der Lizenzmutationen:**
  1. `LIZENZ-UEBERNAHME` (Gelb): Wechsel von `Aktiv-B` zu `Aktiv-A` bzw. Wechsel des Stammvereins zu Muhen. Erläuterung: *«Stammverein zu Muhen gewechselt (vorher {AlterVerein}).»*
  2. `B-LIZENZ (ZWEITVEREIN)` (Blau): Schütze schiesst als B-Mitglied in Muhen; der Verbandsbeitrag wird vom Erstclub getragen (`MembershipCategory` enthält `Aktiv-B`). Erläuterung: *«Zweitmitgliedschaft (Stammverein {ClubName}).»*
  3. `A-LIZENZ NEU (MUHEN)` (Grün): Echte Neulizenzierung direkt über Muhen als Stammverein. Erläuterung: *«Neue Voll-Lizenz bei Muhen als Stammverein.»*
  4. `LIZENZ-ABGABE` (Orange): Stammverein wechselt von Muhen weg zu einem Fremdverein (z. B. Kölliken). Erläuterung: *«Stammverein wechselt von Muhen zu {NeuerClub}.»*
  5. `LIZENZ BEENDET` (Rot): Lizenz in dieser Disziplin beendet (kein Folgeverein). Erläuterung: *«Lizenz in dieser Disziplin beendet (ExitDate {Datum}).»*
  6. `DATUMSKORREKTUR` (Gelb): Reines Eintrittsdatum im Verband angepasst. Erläuterung: *«Verbandsdatum synchronisiert.»*

### 6.4 Dedizierte Spalte «Erläuterung» in der Vorschau-Tabelle
* Die Vorschau-Tabelle (`#mglImportDiffTable`) besitzt direkt nach der Spalte *Mutationstyp* die Spalte **Erläuterung**.
* Sie liefert dem Vorstand auf einen Blick die verständliche Begründung (z.B. *«Stammverein zu Muhen gewechselt (vorher Frick Sportschützen)»*, *«Zweitmitgliedschaft (Stammverein Wettingen-Würenlos Sportschützen)»* oder *«Vereinsfunktion im Verein neu erfasst»*).

### 6.5 Relation zu Fachmodulen (Jahresbeitrag & Finanzen)
* Die Tabellen `public.member_licenses` und `public.member_functions` dienen als relationale Grundlage für die serverseitige Beitragsberechnung ([`calculate_member_contributions`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/30_calculate_contributions_rpc.sql)).
* Anhand von `license_invoicing_club_number` entscheidet die Stored Procedure, ob `LI001` (CHF 18.00 bei Stammverein Muhen) oder `LI003` (CHF 0.00 informativ bei Fremdlizenz) in Rechnung gestellt wird.
* Beim Import werden Lizenzen und Chargen dedupliziert und synchronisiert.

---

## 7. Frontend-Präsentation & Kennzahlen-Harmonisierung (Karten- & Tabellen-Standard)

### 7.1 Klare Unterscheidung: Lizenz-Nr. (AddressNumber) vs. Personen-Nr. (PersonNumber)
* **Lizenz-Nr. (`AddressNumber`, 6-stellig, z. B. `304720`):** Dies ist die vom SSV vergebene Lizenznummer des Schützen (auf dem physischen Schützenpass). Sie wird in der Kartenansicht und in der Tabelle prominent mit Schnellkopier-Icon (`clipboard.writeText`) zur Verfügung gestellt.
* **SSV Personen-Nr. (`PersonNumber`, 7-stellig, z. B. `1252792`):** Dies ist die eindeutige ID des Schützen im SSV-Zentralregister.
* **Historischer Fehler behoben:** Zuvor war die Beschriftung im Code invertiert (die 6-stellige Lizenznummer wurde als "Mitglied-Nr." und die 7-stellige Personen-ID als "Liz" tituliert). Dies wurde modulumfassend in Karten, Tabelle, Export und Modal korrigiert.

### 7.2 UI-Standard: Visuelle Disziplinen- & Funktions-Badges
* **Kartenansicht:**
  - **Header:** Initialen-Avatar, voller Name, Wohnort (`City`), Jahrgang (`Jg. YYYY`), Altersklasse (`U21`, `Elite`, `Senior`, `Veteran`, `Seniorveteran`).
  - **Status:** Status-Badge (`Aktiv`, `Passiv`, `Ehrenmitglied`, `Verstorben`).
  - **Funktionen:** Direkte farbige Badges für alle aktiven Vereinsfunktionen (`👑 Präsident`, `💼 Kassier`, `🎯 Schützenmeister 50m`, `Juniorenleiter`, etc.), dauerhaft sichtbar (nicht nur im Vorstand-Filter).
  - **Lizenzen / Disziplinen:** Konkrete Disziplinen-Badges (`G50m (A)`, `G10m (A)`, `G10m Aufl. (A)`, `G50m (B)` etc.) anstelle leerer Platzhalter.
  - **Footer:** Lizenz-Nr. (6-stellig, fett mit 1-Klick-Kopierer), SSV-Nr., Mail, Telefon und Detail-Absprung.
* **Tabellenansicht (TableKit):**
  - **Spalte `Lizenz / SSV-Nr.`:** Zweizeilig: Oben fette Lizenz-Nr. mit Kopier-Button, unten dezente SSV-Nummer.
  - **Spalte `Name`:** Name plus Wohnort in zweiter Zeile.
  - **Spalte `Geburtsdatum`:** Schweizer Datum plus Altersklassen-Badge (`Elite`, `Senior`, `Veteran`, etc.).
  - **Spalte `Lizenzen`:** Konkrete Disziplinen-Badges anstelle einer reinen Ziffer.
  - **Spalte `Funktionen`:** Konkrete Chargen-Badges (auch Doppelfunktionen) anstelle einer reinen Ziffer.
  - **Eliminierung der leeren Spalte `Kategorie`:** Die zuvor leere Spalte wurde zu Gunsten der aussagekräftigen Lizenzen- und Funktionen-Spalten bereinigt.

### 7.3 Vollständige Synchronisation von `_kategorien`
* In `ensureMitgliederLoaded` werden `members`, `member_licenses`, `member_functions` und `member_history` parallel per `Promise.all` synchron geladen.
* Jedes Mitglied erhält sofort berechnete Attribute: `_aktiveLizenzen`, `_aktiveFunktionen`, `_kategorien`, `_kategorie`, `_altersklasse` und `_alter`.
* Damit greifen auch die Filter in anderen Modulen (z. B. `mail.js` für 50m-/10m-Verteiler und `jahresbeitrag-overview.js`) nahtlos auf die aktiven Schiesskategorien zu.

### 7.4 SSV-Altersklassen & Jahrgangsberechnung
Die Altersklasse wird dynamisch nach den offiziellen SSV-Vorgaben anhand des Schützen-Jahrgangs (Differenz aktuelles Kalenderjahr minus Geburtsjahr) ermittelt:
* **U21 (Nachwuchs):** Alter $\le 20$ Jahre (`bg-info-subtle`)
* **Elite:** Alter $21 - 45$ Jahre (`bg-light`)
* **Senior:** Alter $46 - 59$ Jahre (`bg-secondary-subtle`)
* **Veteran:** Alter $60 - 69$ Jahre (`bg-warning-subtle`)
* **Seniorveteran:** Alter $\ge 70$ Jahre (`bg-dark-subtle`)

Dies erleichtert dem Vorstand und den Schützenmeistern die sofortige Einordnung bei Mannschaftsaufstellungen und Gruppenmeisterschaften direkt in den Karten- und Tabellenansichten.

### 7.5 Schnellkopierer & Wettkampf-Workflows
* Die 6-stellige **Lizenz-Nr.** (`AddressNumber`) ist der primäre Schlüssel für die Erfassung von Schützen in Schiesssport-Software (z. B. SIUS, SMV, SchiessenSchweiz).
* Durch Klick auf das Kopier-Icon ($\text{📋}$) neben der Lizenznummer wird der 6-stellige Wert sofort ohne Leerzeichen in die Zwischenablage kopiert und eine Bestätigung eingeblendet.

### 7.6 Vereinsfunktionen: Lebenszyklus, Austrittsdaten & Stichtagsprüfung
* **Austrittsdatum in `member_functions` (`official_function_exit_date`):** Im SSV-Verbandsexport ist das Austrittsdatum (`OfficialFunctionExitDate`) bei Amtsabgaben (z. B. Stabswechsel im Präsidium oder Schützenmeisteramt) verbindlich hinterlegt.
* **Synchronisation durch SSV-Import (`extractAllFunctions`):** Die Import-Engine überträgt sowohl aktive als auch beendete Funktionen in die Supabase-Tabelle `public.member_functions`, damit Austrittsdaten bei Mutationen unmittelbar in die Datenbank geschrieben werden (`ON CONFLICT ... DO UPDATE SET official_function_exit_date = EXCLUDED.official_function_exit_date`).
* **Zentrale Stichtagsprüfung (`mglIsFunctionActive`):** Eine Funktion gilt nur dann als aktiv, wenn entweder kein Austrittsdatum vorliegt (`exit_date IS NULL`) oder das Austrittsdatum in der Zukunft liegt (`exit_date > heute`). Ist das Austrittsdatum erreicht oder überschritten, wird die Charge nicht mehr als aktives Badge auf Karten/Tabelle geführt, sondern im Detail-Modal unter Stammdaten als grau hinterlegtes historisches Amt (`ehemalig`) ausgewiesen.
* **Historischer Bereinigungsfall (März 2026):**
  * Daniel Berchtold (Präsident bis 12.03.2026 $\rightarrow$ beendet)
  * Simon Hediger (Schützenmeister bis 12.03.2026 $\rightarrow$ beendet; seit 12.03.2026 neu Präsident $\rightarrow$ aktiv)
  * Stefanie Berchtold (Juniorenleiterin bis 12.03.2026 $\rightarrow$ beendet)



