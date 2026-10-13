# Fachdokumentation: KK-Jahresmeisterschaft & Supabase-Migration

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** 13. Oktober 2026  
> **Zielarchitektur:** Supabase PostgreSQL (`jm_seasons`, `jm_shooters`, `jm_competitions`), Cloudflare R2, Gemini Vision OCR  

---

## 1. Ausgangslage & Datenmodell

Die Kleinkaliber-Jahresmeisterschaft der Sportschützen Muhen basierte historisch auf einer komplexen 2D-Tabellenkalkulation in Google Sheets (`Jahresmeisterschaft_GAS_Original`). Mit dem Abschluss der Migrationsphasen ist **Supabase PostgreSQL** die verbindliche Single Source of Truth; sämtliche stillen GAS-Fallbacks und redundanten Dual-Writes wurden vollständig eliminiert.

### 1.1 Datenstrukturen in Supabase (`16_jahresmeisterschaft_module.sql`)

1. **`public.jm_seasons` (Snapshot- & Archivspeicher):**
   - Hält pro Saison (`jahr`, z. B. `'current'`, `'2025'`, `'2023'`) das vollständige zweidimensionale Tabellengrid im JSONB-Feld `raw_grid`.
   - Speichert im JSONB-Feld `junior_exclusions` die Liste der für die Junioren-Wertung deaktivierten Wettkämpfe.
   - Steuert über `is_archived` den Bearbeitungsschutz.
2. **`public.jm_shooters` (Normalisierte Auswertung):**
   - Strukturierte Einzeldaten jedes Schützen (`jahr`, `liga`, `rang`, `name`, `vorname`, `total_pct`, `streich_pct`, `details`).
   - Dient als performante Datenquelle für die öffentliche Website und die Mitglieder-PWA (Sortierung: `order=liga.asc,rang.asc`).
3. **`public.contest_ocr_logs` (Audit & Standblatt-Erfassung):**
   - Revisionssicheres Logging aller Standblatt-Uploads (Schütze, Rohpunkte, Maximum, Bild-URL in Cloudflare R2, KI-Modell).

---

## 2. Systemarchitektur & Datenflüsse

```mermaid
graph TD
    A["Mitglieder-PWA (Upload Standblatt)"] -->|"POST (Audit & R2 Image)"| B["Cloudflare Worker / R2"]
    B -->|"Audit-Log"| C[("Supabase: contest_ocr_logs")]
    
    D["Vorstand-Cockpit (Schützenmeister)"] -->|"1. PDF / Excel Import<br>2. Gemini Vision OCR"| E["Client-seitiger Parser (SheetJS, pdf.js)"]
    E -->|"Manuelle Prüfung & Freigabe"| D
    D -->|"Atomares Speichern (Grid Snapshot)"| F[("Supabase: jm_seasons (raw_grid)")]
    D -->|"syncJMShootersToSupabase()"| G[("Supabase: jm_shooters")]
    
    F -->|"REST (< 30 ms)"| D
    G -->|"REST (order=liga.asc,rang.asc)"| H["Website (resultate.js)"]
    G -->|"REST (order=liga.asc,rang.asc)"| I["PWA (app_jm.html)"]
```

### 2.1 Beantwortung der Kernfragen

* **Google Dual-Write entkoppelt?**
  Ja. In [`jahresmeisterschaft-manager.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-manager.js) ist jeglicher Schreibzugriff auf Google Apps Script / Google Sheets deaktiviert. Das Cockpit schreibt direkt und atomar nach Supabase (`jm_seasons` und `jm_shooters`).
* **Lesen Website und PWA exklusiv aus Supabase?**
  Ja. Sowohl die Vereinswebsite ([`resultate.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/sportschuetzen-website/frontend/js/resultate.js)) als auch die Mitglieder-PWA ([`app_jm.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app/app_jm.html)) fragen die Tabelle `public.jm_shooters` mit dynamischem SWR-Caching über die Supabase REST API ab.
* **Schreibt die PWA direkt in die Rangliste?**
  Nein. Die Erfassung in der PWA ([`upload.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app/upload.js)) legt Standblätter in Cloudflare R2 ab und schreibt einen Eintrag in `public.contest_ocr_logs`. Die offizielle Freigabe und Einreihung in die Jahresmeisterschaft obliegt ausschliesslich dem Schützenmeister im Vorstandscockpit.
* **KI-Einsatz bei der Standblatt-Erkennung:**
  Über den zentralen Vorstand-API-Worker (`action=ocr`) ist Google Gemini Vision (`gemini-2.5-flash`) integriert. Die KI erkennt Schützen, erzielte Punkte sowie gängige Schweizer Schiessprogramme und prognostiziert das Programmmaximum.

---

## 3. Berechnungs- & Wertungsregeln im Cockpit

Die Auswertung der Jahresmeisterschaft erfolgt im Frontend über [`jahresmeisterschaft-ui.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-ui.js) und [`jahresmeisterschaft-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-core.js).

### 3.1 Tabellenaufbau & Ligen-Integrität
* **Liga 1:** Zeilen 5–12 im 2D-Grid (immer exakt 8 Schützen).
* **Pufferzeilen:** Zeilen 13 und 14 dienen als Trennung und sind schreibgeschützt.
* **Liga 2:** Zeile 15 bis Tabellenende (variable Anzahl Schützen).
* **Rangierung:** Schützen werden nach `total_pct` absteigend sortiert. Manuelles Drag & Drop unter dem Jahr ist deaktiviert, um versehentliches Verschieben in Pufferzeilen zu verhindern.

### 3.2 SMM Runden (1–7) & Top 4 Wertung
* Die 7 Einzelrunden der Schweizerischen Mannschaftsmeisterschaft (SMM) liegen in den Spalten 33–39 (bzw. 34–40 bei vorhandener Statusspalte).
* Das System ermittelt für jeden Schützen dynamisch die **4 höchsten Punkteresultate** und überträgt sie in die Meisterschaftsspalten 9–12 (`Mannschaft #1` bis `#4`).
* Im Cockpit werden die zählenden Top-4-Runden mit einem grünen Badge (`<i class="fas fa-check"></i>`) markiert; die verbleibenden 3 Runden werden automatisch durchgestrichen und als Streichrunden gekennzeichnet.

### 3.3 Streichresultat-Eindeutigkeit
* Ein Streichresultat wird nur abgezogen, wenn ein Schütze mindestens alle aktiven Meisterschaftswettkämpfe absolviert hat.
* Wurde das identische Tiefstresultat mehrfach erzielt, wird sowohl rechnerisch als auch visuell exakt **ein einziges Resultat** gestrichen (`streichMarked`).

### 3.4 Auswärtsschiessen (Rohwerte & Top 2)
* Sämtliche Auswärtsschiessen (Spalten ab Index 41 bzw. 42, z. B. Bärenmoos, Stumpenland) werden als reine Rohpunktzahlen (z. B. `95`) erfasst und dargestellt.
* Die beiden prozentual besten Auswärtsschiessen werden automatisch in die Meisterschaftsspalten 14 und 15 (`Auswärtiges 1` und `Auswärtiges 2`) übernommen.

### 3.5 Junioren-Wertung (U21)
* Berechnet dynamisch ein virtuelles Total für Nachwuchsschützen im Tab *Junioren-Wertung*.
* Die Schalterleiste im Tab liest alle Wettkämpfe dynamisch aus Zeile 3 (`grid[2]`) aus. Deaktivierte Wettkämpfe werden aus dem Gesamttotal des Juniors abgezogen. Einzig der Mannschaftsblock (Top 4) ist als feste Einheit verdrahtet.

### 3.6 Ansichtsmodi & Gesamt-Matrix
* **Wertungs-Ansichtsmodus:** Toolbar-Umschalter für `Punkte`, `Prozent (%)` oder `Punkte & %` (Kombiansicht mit Badges).
* **Gesamt-Matrix:** Ein separater Tab visualisiert alle Spalten (Hauptwettkämpfe, Top 4 SMM, alle 7 SMM-Runden, Auswärtige und Gesamtwertung) mit optional einblendbaren Roh-Prozentspalten.

---

## 4. Resultate-Import & KI-Standblatt-Erkennung

Der Import ([`jahresmeisterschaft-import.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-import.js)) läuft vollständig clientseitig im Browser ohne externe Skripte:

```mermaid
graph LR
    A["Excel / CSV (SheetJS)"] --> E["Vorschau-Modal mit Checkboxen"]
    B["SMM Standblatt (PDF)"] --> E
    C["Auswärtige Ranglisten (PDF)"] --> E
    D["Foto Standblatt (Gemini Vision)"] --> E
    E -->|"Schützenmeister bestätigt"| F["Übernahme in jmRawGrid"]
    F -->|"Speichern"| G[("Supabase: jm_seasons & jm_shooters")]
```

1. **Excel & CSV (SheetJS):**
   * Automatische Selektion des korrekten Tabellenblatts (z. B. `Eingabe` bei Kantonalstich, `Resultatblatt` bei Vereinswettschiessen).
   * Kopfzeilen- und Abrechnungsfilterung: Verhindert doppelte Schützenimporte durch strikten Abgleich auf Lizenz-, Namens- und Punktestruktur.
2. **Offizieller SSV SMM PDF-Standblatt-Import:**
   * Liest PDF-Standblätter via `pdf.js` ein.
   * Erkennt die Wettkampfrunde (1–7) autonom aus dem Dokumentkopf und extrahiert alle 8 Schützen inklusive Punkten.
3. **Auswärtige PDF-Ranglisten:**
   * Textblöcke werden über y-Koordinaten zu konsistenten Tabellenzeilen gruppiert (`extractLinesFromPdfPage`). Schützen aus Muhen werden via Lizenz- und Namensabgleich unter Maskierung von Jahrgängen exakt zugeordnet.
4. **Foto-Upload & Gemini Vision OCR:**
   * Konvertiert Smartphone-Formate (inkl. Apple `.heic` via `heic2any`) clientseitig zu JPEG.
   * Gemini 2.5 Flash prognostiziert das Programmmaximum anhand typischer Schweizer Schiessprogramme ($60, 80, 100, 120, 150, 200, 300, 600$) und liefert eine nachvollziehbare Begründung.
5. **Vorschau-Modal:**
   * Schützen können vor der Übernahme per Checkbox einzeln selektiert oder korrigiert werden.

---

## 5. Saison-Lebenszyklus, Archivierung & Historie

### 5.1 Kontrollierter Saisonwechsel («Neues Jahr starten»)
Beim Starten eines neuen Jahres über das Aktionen-Menü wird ein automatisierter Ablauf angestossen:
1. **Ranglistenanalyse:** Ermittelt die finalen Ränge der abgelaufenen Saison.
2. **Liga-Transfer (Auf- und Abstieg):**
   - Die besten 2 Schützen aus Liga 2 steigen in Liga 1 auf.
   - Die letzten 2 Schützen aus Liga 1 steigen in Liga 2 ab.
   - Liga 1 behält exakt 8 Schützen; Liga 2 nimmt alle weiteren Schützen auf.
3. **Nullung:** Sämtliche Wettkampfresultate werden zurückgesetzt und das neue Grid atomar in `current` gespeichert.

### 5.2 Archiv-Snapshots & Status-Badges
* Vor dem Saisonwechsel wird die Saison über «Jahr archivieren» in `jm_seasons` persistiert (z. B. `2026`).
* Die Funktion `createArchivedGridWithStatus` fügt im Snapshot automatisch eine Statusspalte mit den Badges `▲ Aufstieg` und `▼ Abstieg` ein, wodurch historische Ranglisten konsistent dokumentiert bleiben.
* Archivierte Saisons sind im Vorstandscockpit schreibgeschützt und sperren Import-Aktionen.
