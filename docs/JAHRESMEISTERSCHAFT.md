# Fachdokumentation: KK-Jahresmeisterschaft & Supabase-Migration

> **Status:** Testbetrieb / Migrationsphase  
> **Erstellt am:** 24. September 2026  
> **Zielarchitektur:** Supabase PostgreSQL (`jm_seasons`, `jm_shooters`, `jm_competitions`), Cloudflare R2, Gemini Vision OCR  

---

## 1. Executive Summary & Ausgangslage

Die Kleinkaliber-Jahresmeisterschaft der Sportschützen Muhen basiert historisch auf einer hochkomplexen 2D-Tabellenkalkulationsmatrix in Google Sheets (`Jahresmeisterschaft_GAS_Original`, Spreadsheet-ID `1ye7nbT1lLLYzilwNhw6NnslwvUrtxFuT-ZZJRrG2sT0`). 

Im Rahmen von **Phase 15** und **Phase 19** wurde die Zielarchitektur auf **Supabase PostgreSQL** umgestellt:
- **Phase 15 (Fachmodul):** Definition des Datenmodells (`16_jahresmeisterschaft_module.sql`) mit den Tabellen `jm_seasons` (2D-Grid Snapshot), `jm_shooters` (normalisierte Schützen- und Ranglistendaten) und `jm_competitions` (Spalten/Wettkämpfe).
- **Phase 19 (Cut-Over):** Vollständige Deaktivierung des redundanten Dual-Writes an Google Sheets, um Sheet-Lock-Latenzen (10–15 Sekunden je Speichervorgang) zu eliminieren.

---

## 2. Beantwortung der Kernfragen

### 2.1 Ist die Jahresmeisterschaft vom Google Dual-Write abgehängt?
* **Ja.** In [`vorstand/js/jahresmeisterschaft/jahresmeisterschaft-manager.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-manager.js#L51-L79) ist der asynchrone Dual-Write an Google Sheets (`WORKER_URL + "?module=jahresmeisterschaft"`) vollständig auskommentiert und deaktiviert:
  ```javascript
  // Asynchroner Non-Blocking Dual-Write an Google Sheets (GAS) (DEAKTIVIERT - Supabase ist Single Source of Truth)
  /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
     fetch(WORKER_URL + "?module=jahresmeisterschaft", ...);
  */
  ```
* Mutationen im Vorstandscockpit schreiben atomar direkt nach Supabase (`jm_seasons` und `jm_shooters`).

### 2.2 Lesen Website und PWA nur noch aus Supabase?
* **Ja für Website und PWA:**
  * **Website (`sportschuetzen-website`):** [`resultate.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/sportschuetzen-website/frontend/js/resultate.js#L141-L166) (`loadJahresmeisterschaft()`) fragt `public.jm_shooters?jahr=eq.current&order=rang.asc` via Supabase REST API ab.
  * **Mitglieder-PWA:** [`app_jm.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app/app_jm.html#L207-L225) (`loadJMData()`) fragt ebenfalls exklusiv `public.jm_shooters?jahr=eq.current&order=rang.asc` aus Supabase ab.
* **Vorstand-Cockpit:** Verwendet eine **Supabase-First**-Strategie in [`jahresmeisterschaft-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-core.js#L68-L105). Falls Supabase Daten enthält, wird mit `< 30 ms` Latenz direkt aus `public.jm_seasons` geladen und das grüne Badge `Supabase Live` angezeigt. Ein GAS-Fallback existiert nur als passiver Notfallpfad.

### 2.3 Sind die komplexen Berechnungsfunktionen alle auf Supabase?
* **Nein, nicht als Datenbank-Funktionen (PostgreSQL Stored Procedures / Triggers).**
* In Supabase existiert in der Migration [`16_jahresmeisterschaft_module.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/16_jahresmeisterschaft_module.sql) lediglich die Datenhaltung und ein Zeitstempel-Trigger (`trigger_set_updated_at`).
* **Berechnungs-Verteilung:**
  1. **Google Sheets (historisch):** Die Tabellenmatrix enthielt Formeln für Totals, Streichresultate und Ränge.
  2. **Supabase `jm_seasons`:** Speichert die gesamte 2D-Matrix als Snapshot im JSONB-Feld `raw_grid`.
  3. **Frontend-Logik (`syncJMShootersToSupabase()` in `jahresmeisterschaft-core.js`):** Extrahiert beim Speichern die Zeilen von Liga 1 (Zeilen 5–12) und Liga 2 (Zeile 15 ff.), liest Totals und Streichwerte aus und persistiert die Datensätze strukturiert in `jm_shooters`.
  4. **Frontend-Logik (`jahresmeisterschaft-ui.js`):** Berechnet die U21-Junioren-Wertung mit virtuellen Totals (Abzug von ausgeschlossenen Streichwettkämpfen wie Verband, Kantonalstich, Vereinswettschiessen) dynamisch im Client-Browser.

### 2.4 Schreibt der Upload von der PWA (Web_app) direkt in Supabase?
* **Nein, nur ein Audit-Log:**
  * Beim Standblatt-Upload in [`app/upload.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app/upload.js#L122-L160) wird lediglich ein Audit-Log mit Metadaten (Schütze, Datum, erzielte Punkte, Modell `"manual_upload"`) in `public.contest_ocr_logs` geschrieben.
  * Das Bild und die Punktedaten selbst werden per `POST` an den Cloudflare Worker gesendet (`https://github-dropdown-refresh.dan-hunziker73.workers.dev/`), welcher das Foto in **Cloudflare R2** speichert.
  * Es erfolgt **kein direkter Schreibzugriff** in die Meisterschaftstabellen `jm_shooters` oder `jm_seasons`. Die Erfassung in die Jahresmeisterschaft obliegt dem Schützenmeister.

### 2.5 Wird eine KI für die Standblatt-Erkennung genutzt?
* **In der Mitglieder-PWA (`app/upload.html`): Nein.** Schützen erfassen Foto, erzielte Punkte und Maximum manuell.
* **Im Vorstand-Cockpit (Resultate-Modul): Ja.** In [`vorstand/js/resultate/resultate-events.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/resultate/resultate-events.js#L266-L316) ist **Google Gemini Vision** (`gemini-2.5-flash`, `gemini-1.5-pro`) angebunden. Standblätter werden gescannt, Schützen automatisiert zugeordnet und in `public.contest_ocr_logs` protokolliert.

---

## 3. Fehleranalyse: Warum steht aktuell «GAS-Fallback» und warum sind Website & PWA leer?

### 3.1 Technischer Befund der Supabase-Datenbank
Eine direkte Live-Abfrage der REST-API von Supabase ergab:
```json
GET /rest/v1/jm_seasons?select=jahr,title,is_archived
Result: [] (Count: 0)

GET /rest/v1/jm_shooters?select=jahr,name,rang,total
Result: [] (Count: 0)
```
**Die Tabellen `jm_seasons` und `jm_shooters` in Supabase sind aktuell komplett leer.**

### 3.2 Die Kettenreaktion
1. **Vorstandscockpit:**
   * [`loadJahresmeisterschaftData()`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-core.js#L72-L78) fragt Supabase ab. Da 0 Datensätze zurückkommen (`seasonsList.length === 0`), springt das Cockpit in den **GAS-Fallback**.
   * Die Funktion ruft `updateJMSupabaseBadge(false)` auf -> Anzeige wechselt auf das gelbe Badge **`GAS Fallback`**.
2. **Website & PWA:**
   * Die Website ([`resultate.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/sportschuetzen-website/frontend/js/resultate.js#L143)) und die PWA ([`app_jm.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app/app_jm.html#L213)) fragen `public.jm_shooters?jahr=eq.current` ab.
   * Da keine Zeilen in Supabase existieren, erhalten beide ein leeres Array `[]`.
   * Die Website zeigt *"Keine Ranglistendaten für diese Saison vorhanden"*, die PWA zeigt eine leere Tabelle.

### 3.3 Warum fehlte der Button zum Importieren?
* Die Import-Funktion [`window.migrateJMFromGoogleSheets()`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-core.js#L274-L360) existiert im Code bereits.
* Sie war jedoch **nur dynamisch** im Aktions-Dropdown vorhanden, welches erst nach einem erfolgreichen Rendern des Grids aufgebaut wird.
* Im statischen HTML-Header von [`vorstand/index.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/index.html#L956-L972) fehlte der Button komplett. Wenn das Grid aufgrund von Ladeverzögerungen oder Fehlern nicht gerendert wurde, war der Import-Befehl für den Benutzer unsichtbar.

---

## 4. Bereits umgesetzte Sofortmassnahmen

1. **Prominenter Import-Button in Vorstand-Header:**
   * In [`vorstand/index.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/index.html#L956) wurde direkt neben dem Saisonauswahl-Dropdown ein Button `<button class="btn btn-sm btn-outline-primary" onclick="migrateJMFromGoogleSheets()"><i class="fas fa-file-import me-1"></i> Google Sheets Import</button>` eingebaut.
   * Zusätzlich wurde der Eintrag statisch in das Menü `⚙️ Aktionen` aufgenommen.
2. **Auffälliger Alert-Banner bei GAS-Fallback:**
   * In [`jahresmeisterschaft-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/jahresmeisterschaft/jahresmeisterschaft-core.js#L144-L162) wurde ein Warn-Banner integriert. Sobald das Cockpit mangels Supabase-Daten auf GAS zurückfällt, erscheint direkt über der Tabelle ein Banner mit Hinweistext und Aktions-Button:
     > ⚠️ **Hinweis:** Die Daten laufen derzeit im **Google Sheets Fallback**, weil Supabase noch keine Daten enthält. Website und PWA zeigen Resultate erst nach dem Import. [Jetzt nach Supabase importieren]

---

## 5. Roadmap & Aufgabenliste (ToDos)

### Phase A: Dateninitialisierung (Sofort)
- [ ] **1-Klick-Import durchführen:** Im Vorstandscockpit auf den Button `Google Sheets Import` klicken.
  * Lädt das aktuelle Jahr (`current`) und historische Jahre (`JM_2023`, `JM_2025` etc.) aus dem Google Sheet.
  * Speichert die 2D-Grids in `jm_seasons`.
  * Führt `syncJMShootersToSupabase()` aus, um `jm_shooters` zu befüllen.
- [ ] **Erfolgsprüfung:**
  * Prüfen, ob das Badge im Vorstand auf grün **`Supabase Live`** wechselt.
  * Prüfen, ob auf der Vereinswebsite (`/resultate.html`) Liga 1 und Liga 2 mit Rängen und Punkten gerendert werden.
  * Prüfen, ob in der Mitglieder-PWA (`/app/app_jm.html`) die Ranglisten sichtbar sind.

### Phase B: Berechnungs-Architektur konsolidieren
- [ ] **Entscheidung Berechnungs-Engine:**
  * *Option A (Aktuell):* Snapshot-Speicherung in `raw_grid` + Client-Side Synchronisation nach `jm_shooters`.
  * *Option B (Postgres-Native):* Überführung der Formeln (Streichresultat-Logik, Liga 1 Top 8, Auf-/Abstieg) in eine Postgres Stored Procedure (`public.recalculate_jahresmeisterschaft(jahr)`) oder eine Supabase Edge Function. Vorteil: Volle Unabhängigkeit vom Google Sheets Formelapparat.

### Phase C: PWA Standblatt-Upload & KI-Pipeline
- [ ] **Upload-Ziel harmonisieren:**
  * Aktuell lädt die PWA das Bild via Cloudflare Worker nach Cloudflare R2 hoch.
  * Prüfen, ob der Upload direkt in den Supabase Storage Bucket (`contest-sheets`) erfolgen soll (einheitliche Authentifizierung und RLS-Richtlinien).
- [ ] **KI-Erkennung für Schützen bereitstellen:**
  * Evaluieren, ob die im Vorstandscockpit vorhandene Gemini-Erkennung (`resultate-events.js`) auch für den Self-Service-Upload in der PWA freigeschaltet wird (z. B. sofortige Punkt-Vorschläge nach Fotoaufnahme mit manueller Bestätigung durch den Schützen).
- [ ] **Freigabe-Workflow Schützenmeister:**
  * Eingehende Uploads aus der PWA in einem Schützenmeister-Inbox-Cockpit auflisten, um sie mit einem Klick in die Jahresmeisterschaft zu übernehmen.
