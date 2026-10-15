# Fachdokumentation: Resultate & Wettkämpfe (SGM, SMM, Grenzland)

> **Status:** PRODUKTIV & ARCHITEKTUR-SPEZIFIKATION  
> **Stand:** 13. Oktober 2026  
> **Zielarchitektur:** Supabase PostgreSQL (`contest_results`, `contest_teams`, `contest_setups`), SheetJS Excel-Parser, Cache-Busting, Cloudflare Pages  

---

## 1. Das «Warum» – Architektur-Hintergrund & Entkopplung

### 1.1 Warum waren Resultate historisch in Google Sheets getrennt?
In der historischen Google-Infrastruktur gab es ein separates Spreadsheet namens `Mannschaft_Homepage` (`1VuOv6b8r5m1g_9ZidPR3OPZ7YIwLUm6dYLC9nKmC2mE`). Dieses enthielt drei «Live-Tabellenblätter»:
- `aktuell_Gruppe` (Gruppenmeisterschaft SGM, 3 Runden à 2 Passen)
- `aktuell_Mannschaft` (Mannschaftsmeisterschaft SMM, 7 Runden à 1 Passe / 200 Pkt)
- `aktuell_Grenzland` (Grenzlandcup, 3 Runden à 1 Passe / 100 Pkt)

Ende Jahr musste der Administrator manuell oder über ein Google Apps Script (GAS) Kopien dieser Blätter unter dem Namen `2024_Gruppe`, `2025_Gruppe` etc. anlegen, damit sie auf der Website als Archiv aufrufbar waren.

**Schwachstellen dieser alten Architektur:**
1. **Keine Datenintegrität:** Keine Validierung gegen die SSV-Mitgliederdatenbank (`members`). Tippfehler führten zu falschen Zuweisungen.
2. **Fragile Automatisierung:** Ein GAS-Hintergrundskript (`import_gruppe.gs`) scannte Gmail-Postfächer nach Excel-Anhängen, lud sie in Google Drive hoch, konvertierte sie in Google Sheets und schrieb Zeilen per Zell-Range-Schleife. Trat dabei ein Timeout oder Berechtigungsfehler auf, blieb der Import stillschweigend stehen.
3. **Hohe Latenz & Redundanz:** Schützen, die in der Mannschaft schossen, mussten in der Jahresmeisterschaft und im Mannschafts-Sheet doppelt gepflegt werden.

### 1.2 Warum Supabase PostgreSQL als Single Source of Truth?
Mit der Migration auf Supabase wurden die losen Google-Sheets in ein relationales Datenmodell überführt:
- **`public.contest_results`**: Hält alle Schiessresultate atomar über die eindeutige Primärschlüssel-Kombination `(contest_type, year, person_number)`.
- **Echte Verknüpfung:** Jeder Datensatz ist direkt an die `person_number` des Mitglieds gekoppelt.
- **Transaktionssicherheit:** Speichern via Supabase REST API erfolgt atomar in unter 30 Millisekunden.
- **Schnittstelle zur Jahresmeisterschaft (`sync_jm_to_contest_mannschaft`):** Die 7 Runden der Mannschaftsmeisterschaft, die der Schützenmeister im Modul Jahresmeisterschaft erfasst hat, können per Knopfdruck atomar synchronisiert werden – keine redundante Doppelerfassung mehr.

---

## 2. SGM Gruppenmeisterschaft: Client-seitiger Excel-Konverter

### 2.1 Analyse der Beispieldatei (`20260204_d_f_standblatt_sgm_gewehr_50m_ssv_elite_gruppe 2.xlsx`)
Die Analyse des offiziellen SSV-Standblatts für die Gruppenmeisterschaft 50m zeigt eine feste, standardisierte Struktur:
- **Gruppen-Nummer:** Steht auf dem Blatt `Start` in Zelle `E21` (z. B. `2` für «Muhen 2»).
- **Kombinierte Übersicht aller 3 Runden auf Blatt `Start`:**
  - Zeilen 13–15: **Liegend** (3 Schützen)
  - Zeilen 16–17: **Kniend** (2 Schützen)
  - **Runde 1:** Name in Spalte `C`, Lizenz in Spalte `D`, Passe 1 in `E`, Passe 2 in `F`.
  - **Runde 2:** Name in Spalte `H`, Lizenz in Spalte `I`, Passe 1 in `K`, Passe 2 in `L`.
  - **Runde 3:** Name in Spalte `N`, Lizenz in Spalte `O`, Passe 1 in `Q`, Passe 2 in `R`.
- **Ersatzschützen-Erkennung:** Wechselschützen (wie `Keller Christiane`, die in Runde 2 und 3 für `Burkhalter Lukas` antritt) werden direkt in den jeweiligen Rundenspalten geführt und automatisch erkannt.

### 2.2 Geplanter Konverter-Ablauf (analog zur Jahresmeisterschaft)
Der Konverter wird vollständig im Browser via **SheetJS** (`XLSX`) realisiert (kein Backend-Upload nötig):
1. **Datei wählen / Drag & Drop:** Nutzer zieht die Excel-Datei in den Import-Bereich.
2. **Autonomes Parsing:**
   - Liest Gruppe aus `E21` aus (`Muhen 2`).
   - Extrahiert für alle 3 Runden Schützenname, Lizenznummer, Stellung (`liegend`/`kniend`), Passe 1 und Passe 2.
   - Gleicht die Schützen mit `public.members` ab (über Name oder SSV-Lizenznummer aus `member_licenses`), um die eindeutige `person_number` zu ermitteln.
3. **Vorschau-Modal mit Checkboxen:**
   - Visualisiert die erkannten Schützen und Rundenwerte vor der Übernahme.
   - Nutzer kann einzelne Schützen selektieren oder bei Bedarf Werte anpassen.
4. **Übernahme & Speichern:**
   - Aktualisiert `resultateState.rows` im Cockpit.
   - Aktiviert den Speichern-Button für atomaren Supabase-Upsert in `public.contest_results`.

---

## 3. Code-basiertes Archivierungs- & Saison-Konzept

### 3.1 Wie wird die Archivierung ohne Google Sheets gelöst?
In Supabase existiert kein physisches «Blatt-Kopieren» mehr. Jeder Datensatz in `public.contest_results` besitzt bereits das Attribut `year` (z. B. `2026`).

**Der vorgeschlagene code-basierte Workflow:**
1. **Jahres-Umschalter im Vorstandscockpit:**
   - Oben im Cockpit wird ein Dropdown für das Jahr ergänzt (`2026 (Aktiv)`, `2025 (Archiv)` etc.).
   - Archivierte Jahre werden schreibgeschützt geöffnet.
2. **Aktion «Saison archivieren & neues Jahr starten» (mit manuellem Zieljahr & Kollisionsschutz):**
   - Wird am Ende der Saison (Oktober/November) im Aktionen-Menü ausgelöst (`openArchiveSeasonModal`).
   - Ein übersichtliches Modal zeigt das aktuelle Quell-/Archivjahr (z. B. `2026`) und bietet ein **frei editierbares Eingabefeld für das neue Zieljahr** (z. B. `2027`).
   - **Kollisionsprüfung:** Existieren für das gewählte Zieljahr in `contest_results` bereits Einträge, erfolgt eine explizite Warn- und Bestätigungsabfrage vor dem Überschreiben.
   - **Code-Ablauf:**
     1. Die Teams und Schützen-Zuordnungen werden für das neue Jahr (`targetYear`) aus der aktuellen Saison vorerfasst (Punkte auf `NULL`). Bei der SGM bleibt die Schiessstellung (`liegend`/`kniend`) strikt erhalten.
     2. Die alte Saison bleibt unverändert in `public.contest_results` konserviert und wandert ins Archiv.
     3. Das Cockpit schaltet automatisch auf die neu initialisierte Saison um.
3. **Automatischer Abruf auf der Vereins-Homepage (`resultate.html`):**
   - Das Archiv-Dropdown (`jahr-select`) auf der Homepage liest dynamisch alle vorhandenen Jahre aus Supabase (`contest_results` und `jm_seasons`).
   - Wählt ein Besucher `2025` oder `2026`, sendet das Frontend einfach:
     `GET /rest/v1/contest_results?contest_type=eq.gruppe&year=eq.2025`
   - Die Gruppen-, Mannschafts- und Grenzland-Tabellen aktualisieren sich in Millisekunden aus dem Cache.
   - **Vorteil:** Null manueller Pflegeaufwand, keine Sheet-Duplikate, 100% konsistent.

---

## 4. Bereinigung & UX-Optimierung: Entrümpelung des Cockpits

### 4.1 Warum wirkt das Resultate-Modul aktuell überfrachtet?
1. **Karten-Explosion (28 Karten bei Mannschaft):**
   - Bei 7 Runden à 4 Teams (Muhen 1, Muhen 2, Muhen 3, Pool) wurden historisch **28 grosse Karten** untereinander gerendert. Der Nutzer verlor die Übersicht und musste endlos scrollen.
2. **Button-Dschungel in der Kopfzeile:**
   - Ein redundanter «🔄 Laden»-Button sowie verschiedene Spezialfunktionen standen unstrukturiert nebeneinander.
3. **Ständiges «Schütze hinzufügen» Formular:**
   - Ein grosses graues Formular am unteren Seitenrand mit 4 Dropdowns nahm dauerhaft Platz weg, obwohl neue Schützen selten unter dem Jahr hinzugefügt werden.

### 4.2 Der 4-Punkte-Bereinigungsplan
1. **Runden-Sub-Navigation (Tabs / Pills):**
   - Statt alle 7 Runden gleichzeitig anzuzeigen, führt eine schlanke Runden-Leiste (`Runde 1` bis `Runde 7` sowie `Kompakt-Matrix`) durch den Wettbewerb.
   - Auf einen Blick sieht der Schützenmeister genau die 3–4 Teams der aktuellen Runde.
2. **Bündelung im «⚡ Aktionen»-Dropdown & Bereinigung:**
   - Der redundante «🔄 Laden»-Button wurde entfernt, da Daten automatisch bei Navigation und Modulstart geladen werden.
   - Alle Sonderfunktionen wandern in ein aufgeräumtes Dropdown-Menü:
     - 📥 *SGM Excel-Standblatt importieren* (bei Gruppe)
     - 🔄 *Aus Jahresmeisterschaft synchronisieren* (bei Mannschaft)
     - 👥 *Aus Team-Setup laden*
     - 📸 *KI-Standblattfoto einlesen (OCR)*
     - 🗄️ *Saison archivieren / Neues Jahr starten...* (mit manuellem Zieljahr-Modal)
3. **Standardisierter Speichern-Button (`SaveButtonKit`):**
   - Konsistent wie in Jahresmeisterschaft und Termine: Dezent grau wenn gespeichert, auffällig orange-gelb mit Änderungszähler (`💾 Speichern (3)`), sobald Änderungen vorliegen.
4. **Schützen-Verwaltung als kompaktes Modal:**
   - Ein eleganter Button `+ Schütze` öffnet bei Bedarf ein kleines Modal, statt permanent die Seite zu überfrachten.

### 4.3 SGM Gruppenmeisterschaft Layout & Stellungs-Sortierung
- **Grosszügiges 2-Spalten-Layout:** Da in der SGM 6 Spalten (Name, Stellung, Team, P1, P2, Total) erfasst werden, nutzen die Gruppen-Karten `col-12 col-lg-6` und `overflow-x: auto`. Dies verhindert das Abschneiden von Passe 2 (P2) und Namenskürzungen.
- **Kopfzeile & Team-Rundentotal:** Jede Karte besitzt eine dezente Tabellenkopfzeile (`Schütze | Stellung | Team | P1 | P2 | Total`) sowie eine dynamische Live-Anzeige der Rundensumme im Header (z. B. `968 Pkt`).
- **Verbindliche Sortierung nach Stellung:** Sowohl im Vorstandscockpit (`resultate-ui.js`, `renderRoundSection`, `renderMatrixView`) als auch in den Runden-Details der Vereins-Homepage (`resultate.js`, `toggleGroupDetail`) werden Schützen strikt nach Stellung sortiert: zuerst alle liegenden Schützen (1–3), danach die knienden Schützen (4–5), jeweils alphabetisch nach Name.
