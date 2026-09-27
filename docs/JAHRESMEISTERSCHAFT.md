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

## 4. Fachliche Roadmap & Weiterentwicklung

### Phase A: Berechnungs-Architektur (Optional)
- Evaluation zur Überführung der Streichresultat-Logik (Liga 1 Top 8, Auf-/Abstieg) in eine Postgres Stored Procedure (`public.recalculate_jahresmeisterschaft(jahr)`), um die Berechnung vollständig serverseitig zu kapseln.

### Phase B: Standblatt-Upload & KI-Pipeline
- **Speicherort:** Prüfung der Migration von Cloudflare R2 auf den Supabase Storage Bucket `contest-sheets` für einheitliche RLS-Richtlinien.
- **Self-Service KI:** Bereitstellung der Gemini-Vision-Erkennung für die Mitglieder-PWA mit manueller Bestätigung durch den Schützen vor dem Einreichen.
- **Schützenmeister-Inbox:** Übergabe der PWA-Meldungen in eine Freigabe-Warteschlange im Cockpit für die 1-Klick-Übernahme ins Grid.
