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

### 2.1 Warum browser-native SSV-Diff-Engine statt Server-Cronjob?
* **Problem:** Der Verband (SSV) bietet keine direkte REST-Webservice-Schnittstelle; Mutationen müssen periodisch als Excel-Arbeitsmappe exportiert werden. Frühere Google Apps Scripts liefen dabei in 60-Sekunden-Timeouts.
* **Lösung & Warum:** Die Import-Engine ([`mitglieder-import-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/mitglieder/mitglieder-import-engine.js)) parst die Verbands-XLSX direkt im Browser mittels SheetJS in `< 100 ms`.
* **Menschliche Kontrolle (Human-in-the-Loop):** Ein automatischer Server-Cronjob birgt das Risiko, fehlerhafte Verbandsdaten unbemerkt zu importieren. Die Browser-Engine zeigt dem Mitgliederverwalter eine transparente 3-Kategorie-Diff-Vorschau:
  1. *Neu aufzunehmende Mitglieder* (Grün)
  2. *Geänderte Stammdaten / Lizenzen* (Gelb mit Vorher/Nachher-Gegenüberstellung)
  3. *Im SSV nicht mehr geführte Personen* (Rot)
* Erst nach expliziter Prüfung und Klick auf «Änderungen anwenden» werden die Datensätze atomar in Supabase geschrieben.

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

## 3. Datenmodell (Kern-Tabellen)

| Tabelle | Primärschlüssel | Zweck & Invarianten |
| :--- | :--- | :--- |
| `public.members` | `id` (UUID) | Stammdaten (`person_number` = SSV-Nummer UNIQUE, `first_name`, `last_name`, `email`, `status`, `address`, `zip`, `city`, `birth_date`). |
| `public.member_licenses` | `id` (UUID) | Schiesslizenzen (Gewehr 50m, 10m, Lizenzstatus aktiv/inaktiv). |
| `public.member_functions` | `id` (UUID) | Vereinsfunktionen (Vorstand, Präsident, Schützenmeister, Revisor). |
| `public.member_history` | `id` (UUID) | Unveränderliches Audit-Log jeder Stammdaten-Mutation. |

---

## 4. Berechtigungen & RLS

* **Lesen (`members.view`):** Alle authentifizierten Vorstandsmitglieder und Revisoren.
* **Mutieren (`members.edit`):** Strikt beschränkt auf Rollen `admin`, `vorstand` und die Funktion *Mitgliederverwalter*.
* **Mitglieder-App:** Angemeldete Mitglieder sehen über ihre eigene Session ausschliesslich ihr eigenes Profil (`auth_user_id = auth.uid()`).

---

## 5. Erkenntnisse aus dem SSV-Verbandsdatenbestand & Datenschutz

### 5.1 Datenschutz & Ausschluss von Git-Commits
* **Strikter Datenschutz:** Sämtliche Rohdatenexporte des SSV (Ordner `SSV Daten/`, `SSV/` sowie alle `.xlsx`/`.csv`-Dateien) enthalten schützenswerte Personendaten nach Schweizer DSG (Adressen, Geburtsdaten, Telefonnummern, E-Mails, Lizenzdaten).
* **Git-Schutz:** Diese Ordner und Dateitypen sind ausnahmslos in [`.gitignore`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/.gitignore) eingetragen und dürfen **niemals** in das GitHub-Repository committet oder gepusht werden.

### 5.2 SSV-Tabellenstruktur & Lizenz-Erkennung
Die offizielle SSV-Verbandsarbeitsmappe (z. B. `SSV Mitgliederverzeichnis_20092026 (1).xlsx`) liefert im Sheet `DataSource` sämtliche Mitgliedszeilen mit folgenden massgeblichen Spalten:
1. `MembershipCategory`: Spezifiziert die Disziplin und Stufe (z. B. `Aktiv-A G50m`, `Aktiv-B G50m`, `Aktiv-A G10m`, `Aktiv-A G10m Auflage`).
2. `LicenseCategory`: `A` (Voll-Lizenz / Meisterschaften) oder `B` (B-Lizenz / Zweitverein).
3. `LicenseType`: SSV-Typisierung (`LizenzG50m`, `LizenzG10m`).
4. `LicenseInvoicingClubNumber`: Rechnungsstellender Verein des SSV.
   - `1.19.0.01.029`: Muhen (Stammverein $\rightarrow$ beitragspflichtig für Vereinslizenz `LI001` / `LI002`).
   - Abweichende Vereinsnummer: Fremdlizenz ($\rightarrow$ Abrechnung über Drittverein, in Muhen `LI003` CHF 0.00).
5. `OfficialFunctionCategory`: Vereins- und Verbandsfunktionen (Präsident, Kassier, Aktuar, Schützenmeister, Juniorenleiter $\rightarrow$ rabattberechtigt für Vorstand `RA001`).

### 5.3 Relation zu Fachmodulen
* Die Tabellen `public.member_licenses` und `public.member_functions` dienen als relationale Grundlage für die serverseitige Beitragsberechnung ([`calculate_member_contributions`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/30_calculate_contributions_rpc.sql)).
* Beim Import werden Lizenzen und Chargen dedupliziert und synchronisiert.

