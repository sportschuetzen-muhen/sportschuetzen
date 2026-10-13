# Fachdokumentation: KK-Jahresmeisterschaft & Supabase-Migration

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** 27. September 2026  
> **Zielarchitektur:** Supabase PostgreSQL (`jm_seasons`, `jm_shooters`, `jm_competitions`), Cloudflare R2, Gemini Vision OCR  

---

## 1. Executive Summary & Ausgangslage

Die Kleinkaliber-Jahresmeisterschaft der Sportschützen Muhen basierte historisch auf einer hochkomplexen 2D-Tabellenkalkulationsmatrix in Google Sheets (`Jahresmeisterschaft_GAS_Original`, Spreadsheet-ID `1ye7nbT1lLLYzilwNhw6NnslwvUrtxFuT-ZZJRrG2sT0`). 

Im Rahmen von **Phase 15**, **Phase 19** und **Phase 21.1** wurde die Zielarchitektur vollständig auf **Supabase PostgreSQL** umgestellt:
- **Phase 15 (Fachmodul):** Definition des relationalen und dokumentenbasierten Datenmodells (`16_jahresmeisterschaft_module.sql`) mit den Tabellen `jm_seasons` (2D-Grid Snapshot im JSONB-Feld `raw_grid`), `jm_shooters` (normalisierte Schützen- und Ranglistendaten) und `jm_competitions` (Spalten/Wettkämpfe).
- **Phase 19 (Cut-Over):** Vollständige Deaktivierung des redundanten Dual-Writes an Google Sheets, wodurch die früheren Sheet-Lock-Latenzen (10–15 Sekunden je Speichervorgang) eliminiert wurden.
- **Phase 21.1 (GAS-Entkopplung):** Endgültige Beseitigung aller stillen Lese-Fallbacks; Supabase ist verbindlich der alleinige Single Source of Truth.

---

## 2. Architektur & Beantwortung der Kernfragen

### 2.1 Ist die Jahresmeisterschaft vom Google Dual-Write abgehängt?
* **Ja.** In [`vorstand/js/jahresmeisterschaft/jahresmeisterschaft-manager.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-manager.js#L51-L79) ist der asynchrone Dual-Write an Google Sheets (`WORKER_URL + "?module=jahresmeisterschaft"`) vollständig deaktiviert.
* Sämtliche Mutationen im Vorstandscockpit schreiben atomar und direkt nach Supabase (`jm_seasons` und `jm_shooters`).

### 2.2 Lesen Website und PWA nur noch aus Supabase?
* **Ja:**
  * **Website (`sportschuetzen-website`):** [`resultate.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/sportschuetzen-website/frontend/js/resultate.js#L141-L166) (`loadJahresmeisterschaft()`) fragt `public.jm_shooters?jahr=eq.current&order=rang.asc` via Supabase REST API ab.
  * **Mitglieder-PWA:** [`app_jm.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app/app_jm.html#L207-L225) (`loadJMData()`) fragt ebenfalls exklusiv `public.jm_shooters?jahr=eq.current&order=rang.asc` aus Supabase ab.
  * **Vorstand-Cockpit:** Lädt direkt mit `< 30 ms` Latenz aus `public.jm_seasons` (JSONB `raw_grid`) via Supabase REST API.

### 2.3 Wie sind die komplexen Berechnungsfunktionen implementiert?
* In Supabase existiert in der Migration [`16_jahresmeisterschaft_module.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/16_jahresmeisterschaft_module.sql) die Datenhaltung und ein Zeitstempel-Trigger (`trigger_set_updated_at`).
* **Berechnungs-Verteilung:**
  1. **Google Sheets (historisch abgelöst):** Die Tabellenmatrix enthielt Formeln für Totals, Streichresultate und Ränge.
  2. **Supabase `jm_seasons`:** Speichert die gesamte 2D-Matrix als Snapshot im JSONB-Feld `raw_grid`.
  3. **Frontend-Logik (`syncJMShootersToSupabase()` in `jahresmeisterschaft-core.js`):** Extrahiert beim Speichern die Zeilen von Liga 1 (Zeilen 5–12) und Liga 2 (Zeile 15 ff.), liest Totals und Streichwerte aus und persistiert die Datensätze strukturiert in `jm_shooters`.
  4. **Frontend-Logik (`jahresmeisterschaft-ui.js`):** Berechnet die U21-Junioren-Wertung mit virtuellen Totals (Abzug von ausgeschlossenen Streichwettkämpfen wie Verband, Kantonalstich, Vereinswettschiessen) dynamisch im Client-Browser.

### 2.4 Schreibt der Upload von der PWA (Web_app) direkt in Supabase?
* Beim Standblatt-Upload in [`app/upload.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app/upload.js#L122-L160) wird ein Audit-Log mit Metadaten (Schütze, Datum, erzielte Punkte, Modell `"manual_upload"`) in `public.contest_ocr_logs` geschrieben.
* Das Bild und die Punktedaten selbst werden per `POST` an den Cloudflare Worker gesendet, welcher das Foto in **Cloudflare R2** speichert.
* Es erfolgt **kein direkter unmoderierter Schreibzugriff** in die Meisterschaftstabellen `jm_shooters` oder `jm_seasons`. Die offizielle Freigabe und Erfassung in die Jahresmeisterschaft obliegt dem Schützenmeister.

### 2.5 Wird eine KI für die Standblatt-Erkennung genutzt?
* **In der Mitglieder-PWA (`app/upload.html`):** Schützen erfassen Foto, erzielte Punkte und Maximum manuell zur Dokumentation.
* **Im Vorstand-Cockpit (Resultate-Modul):** In [`vorstand/js/resultate/resultate-events.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/resultate/resultate-events.js#L266-L316) ist **Google Gemini Vision** (`gemini-2.5-flash`, `gemini-1.5-pro`) angebunden. Standblätter werden gescannt, Schützen automatisiert zugeordnet und in `public.contest_ocr_logs` protokolliert.

---

## 3. Historischer Rückblick: Behebung der Dateninitialisierung (Phase 21.1)

Vor der vollständigen Entkopplung in Phase 21.1 waren die Tabellen `jm_seasons` und `jm_shooters` temporär noch nicht befüllt worden, weshalb im Cockpit ein GAS-Warnbanner erschien.

### Durchgeführte Massnahmen:
1. **Google Sheets 1-Klick-Import:** Über den Button `Google Sheets Import` im Vorstandscockpit (`migrateJMFromGoogleSheets()`) wurden die historischen Saisons und das aktuelle Jahr (`current`) aus Google Sheets extrahiert, als 2D-Grids in `jm_seasons` persistiert und via `syncJMShootersToSupabase()` in `jm_shooters` überführt.
2. **Kappung der stillen Fallbacks:** Stille Lese-Fallbacks wurden im gesamten Codebase entfernt (entsprechend Projekt-Richtlinie 1). Das Cockpit lädt zuverlässig und sub-sekündlich aus Supabase.

---

## 4. Migration 52: Korrektur der Datenextraktion & Dynamische Saisons (Oktober 2026)

- **Extraktions-Korrektur in `jm_shooters`:** Der Synchronisations-Parser in `syncJMShootersToSupabase()` (`jahresmeisterschaft-core.js`) wurde korrigiert, um Spaltenüberschriften wie `TOTAL ... %` tolerant zu erkennen und vollständige Einzelresultate (`details`: Meisterschaft, Mannschaftsrunden, Auswärtsschiessen) zu strukturieren. Migration `52_fix_jm_shooters_data.sql` reparierte alle historischen Saisons (`current`, `2025`, `2023`).
- **Dynamisches Saison-Archiv im Frontend:** In `resultate.js` wird die Saisonauswahl (`#jahr-select`) nun dynamisch via SWR-Cache aus `public.jm_seasons` gespeist, sodass alle archivierten Jahre sofort ladezeitoptimiert abrufbar sind.
- **Sortierung:** Die REST-Abfragen in Website und PWA wurden auf `order=liga.asc,rang.asc` vereinheitlicht.

---

## 6. Client-seitiger Resultate-Import & Dynamisches Maximum (Oktober 2026)

- **Ablösung Google Sheets & GAS Import:** Der alte Google Sheets Import Button und alle Cloudflare Worker / GAS Brücken wurden vollständig eliminiert. Neu steht im Cockpit das Modul `jahresmeisterschaft-import.js` bereit, das Excel- (`.xlsx`, `.xls`) und CSV-Dateien direkt via SheetJS im Browser einliest.
- **Wettkampf-Kacheln mit Vorschau:** Direkte Imports für *Vereinswettschiessen*, *Verbandsschiessen*, *Kantonalstich* und *Mannschaft* (Runden 1–7) mit Lizenz-/Namens-Matching und interaktivem Vorschau-Abgleich vor dem atomaren Speichern in Supabase.
- **Auswärtige Schiessen & KI-Standblatt-Erkennung:** Neu integrierte 5. Kachel für Auswärtige Schiessen:
  - **Digitale PDF-Ranglisten:** Werden direkt im Browser via `pdf.js` in < 50 ms geparst. Alle Schützen aus Muhen werden automatisch anhand Name und Lizenz extrahiert.
  - **Apple HEIC & Smartphone-Fotos:** Automatische clientseitige Konvertierung von `.heic`/`.heif` nach JPEG via `heic2any`.
  - **Zentraler Gemini Vision OCR:** Fotos von Standblättern werden über den zentralen Vorstand-API-Worker (`action=ocr`, Gemini 2.5 Flash) analysiert.
  - **Domain-Kontext Schweizer Schiessprogramme:** Die KI prognostiziert das Maximum dynamisch anhand gängiger Schweizer Programme ($6\times 10 = 60$, $8\times 10 = 80$, $10\times 10 = 100$ [Gruppenstich G50], $12\times 10 / 6\times 20 = 120$, $15\times 10 = 150$, $20\times 10 = 200$, $30\times 10 = 300$, $60\times 10 = 600$) und hinterlegt eine Begründungs-Pille im UI.
- **PWA Standblatt-Upload (`app/upload.html`):** Schützen können Fotos (inkl. HEIC) oder PDF-Ranglisten hochladen. Die App analysiert die Datei direkt via PDF-Parser oder zentraler KI, schlägt erzielte Punkte und Maximum vor und loggt Metadaten revisionssicher in `public.contest_ocr_logs`.
- **Top 4 Mannschaft & Top 2 Auswärtige:** Mannschaftsresultate aus den Runden 1–7 übertragen automatisch die 4 höchsten Resultate in die Spalten 9–12 (`Mannschaft #1` bis `#4`). Auswärtige Schiessen übertragen automatisch die beiden höchsten Prozentwerte in `Auswärtiges 1` und `Auswärtiges 2`.
- **Smarter Speichern-Button:** Zeigt ungespeicherte Änderungen an, schützt die 8-Schützen-Integrität von Liga 1 und sperrt unnötige DB-Schreibvorgänge bei unverändertem Grid.

---

## 7. Import-Harmonisierung & Portal-Standardisierung (Oktober 2026)

- **Header- & Metadaten-Filterung (Verein & Verband):** Die Tabellenkopf-Erkennung in `jahresmeisterschaft-import.js` erfordert nun zwingend das gleichzeitige Vorhandensein von Lizenz-, Namens- und Punktspalten. Kopfzeilen und Abrechnungs-Metadaten (Etiketten, Kranzkarten, Adressdaten) werden strikt herausgefiltert. Dadurch wurde der frühere Doppelimport (z. B. Marco Fischer mit falschen Werten aus dem Kopfbereich) vollständig behoben.
- **Kantonalstich-Sheet-Selektion:** Liest gezielt das Resultatblatt `Eingabe` ein (statt der Limiten-Tabelle `Kategorie`), wodurch alle Vereinsresultate (30-Schuss-Programm) mit 100 % Trefferquote zugeordnet werden.
- **Automatische Runden-Erkennung (Mannschaft / SMM):** Erkennt die Runden 1–7 automatisch aus Zelle `H6` des Standblatts sowie aus Dateinamen mit führenden Nummern (`04 smm...` $\rightarrow$ Runde 4) und synchronisiert die Dropdown-Vorauswahl unterbrechungsfrei.
- **Selektiver Import mit Checkboxen & Direktkorrektur:** Die Vorschau-Tabelle bietet individuelle Checkboxen sowie einen Master-Toggle («Alle an-/abwählen») und editierbare Punktfelder. Nur aktiv markierte Schützen werden in `jmRawGrid` und Supabase übernommen; Schützen ausserhalb der JM sind standardmässig abgewählt.
- **Portal-Standard & Sticky-Spalten:** Das Import-Modal (`#jm-import-modal`) wurde an das Design-System des Vorstands-Portals angeglichen (Farbgradient, Du-Kultur gemäss Richtlinie 8). Die Haupttabelle fixiert die Schützen- und Verschiebe-Spalte beim horizontalen Scrollen (`position: sticky`), während inaktive Spalten weiterhin sauber ausgeblendet bleiben.

---

## 8. SMM Standblatt PDF-Import, Blatt-Priorisierung & Wertungs-Ansichtsmodus (Oktober 2026)

- **SMM Mannschafts-PDF-Import:** Offizielle SSV-Standblätter der Mannschaftsmeisterschaft (`.pdf`) werden clientseitig via `pdf.js` geparst; Runde und alle 8 Schützen inklusive Punkten werden automatisch extrahiert. Das manuelle Rundenauswahl-Dropdown wurde entfernt, da die Runderkennung autonom arbeitet.
- **Exakte Blatt-Priorisierung (Vereins- & Verbandsschiessen):** Die SheetJS-Auswahl priorisiert exakt das Schützen-Blatt `Resultatblatt` bzw. `Eingabe`, wodurch Berechnungsblätter wie `BerechnungVereinsresultat` beim Vereins- und Verbandsschiessen nicht mehr fälschlicherweise vorzeitig ausgewählt werden.
- **Wertungs-Ansichtsmodus (`Punkte` | `Prozent (%)` | `Punkte & %`):** Ein Segment-Umschalter in der Toolbar über der Tabelle erlaubt das flexible Umschalten zwischen Rohpunkten, berechneten Prozenten und der kombinierten Ansicht mit kompakten Badges. Streichresultate werden visuell markiert und durchgestrichen.
- **Archiv-Schutz & Import-Duplikatbereinigung:** Der grüne Schnellzugriff-Button für den Import wurde aus der Toolbar entfernt. Der Import steht ausschliesslich im Aktionen-Menü des aktuellen Jahres (`current`) bereit, wodurch versehentliche Importe in archivierte Vorjahre sicher verhindert werden.

---

## 9. PDF-Zeilen-Extraktion, Streichresultat-Eindeutigkeit & Tab-Persistenz (Oktober 2026)

- **PDF-Zeilengruppierung (Auswärtige Schiessen):** Digitale Ranglisten (z. B. WinFire Gruppen- und Einzelranglisten wie Bärenmoosschiessen) gruppieren Textelemente vertikal nach y-Koordinaten zu echten Tabellenzeilen (`extractLinesFromPdfPage`). Schützen und Punkte werden zeilenweise extrahiert (unter Maskierung von Jahrgängen und Lizenzen), wodurch frühere Fehlzuordnungen des ersten Seitenwerts (z. B. 99 Punkte) vollständig behoben sind.
- **Eindeutigkeit & dynamische Berechnung des Streichresultats:** Ein Streichresultat wird dynamisch in `recalculateJMRawGrid` nur dann ermittelt und abgezogen, wenn ein Schütze mindestens alle aktiven Wettkämpfe absolviert hat. Haben Schützen dasselbe Tiefstresultat mehrfach erzielt, wird sowohl rechnerisch als auch visuell im Cockpit (`streichMarked`) exakt nur ein einziges Resultat gestrichen.
- **Tab-Persistenz & Junioren-Ansichtsmodus:** Beim Umschalten des Ansichtsmodus (`Punkte`, `Prozent (%)`, `Punkte & %`) bleibt der ausgewählte Tab (z. B. `Junioren-Wertung (U21)`) via `jmActiveTab` unterbrechungsfrei geöffnet. Die Junioren-Zellen unterstützen den gewählten Ansichtsmodus synchron mit formatierten Prozent-Badges.



