# Fachdokumentation: Web-App (PWA) & Standblatt-Upload Workflow

> **Status:** PRODUKTIV-ANALYSE & INTEGRATIONSSPEZIFIKATION  
> **Stand:** 13. Oktober 2026  
> **Komponenten:** `app/` (PWA-Module), `vorstand/` (Cockpit), Supabase PostgreSQL (`jm_shooters`, `contest_results`, `contest_ocr_logs`), Cloudflare R2  

---

## 1. Systemübersicht & Ordnerstruktur `app/` (Web-App)

Die Web-App der Sportschützen Muhen ist als Progressive Web App (PWA) für Smartphones und Desktop konzipiert. Die Rahmenstruktur (`index.html` und `app.js`) bettet die Fachmodule als responsive, leichtgewichtige iFrames ein:

```
├── index.html                  # PWA Shell mit Login/SSO, Header und Bottom-Navigation
├── app.js                      # Authentifizierung, Session-Tracking, Termine & RSVP
├── app/
│   ├── app_jm.html             # Jahresmeisterschaft (Liga 1, Liga 2, U21 Junioren)
│   ├── app_gruppe.html         # Gruppenmeisterschaft (SGM) & Grenzlandcup
│   ├── app_mannschaft.html     # Schweizer Mannschaftsmeisterschaft (SMM Runden 1–7)
│   ├── upload.html             # Standblatt-Upload Formular mit Bild- & PDF-Vorschau
│   └── upload.js               # Client-seitige KI (PDF.js, HEIC, Gemini Vision OCR)
```

---

## 2. Status der Datenverbindungen («Single Source of Truth»)

Alle drei Fachmodule der Web-App lesen **exklusiv und direkt** aus Supabase PostgreSQL über die performante REST-API mit anonymem API-Key.

| Modul in Web-App | Eingebettete Datei | Supabase REST-Endpunkt | Status & Aktualität |
| :--- | :--- | :--- | :--- |
| **Jahresmeisterschaft (JM)** | `app/app_jm.html` | `GET /jm_shooters?jahr=eq.current&order=liga.asc,rang.asc` | ✅ **Aktiv** (Liefert 8 Schützen in Liga 1, 31 in Liga 2, Ränge, Streichresultate & Details). Pull-to-Refresh & Wakeup aktiv. |
| **Gruppe (SGM)** | `app/app_gruppe.html` | `GET /contest_results?contest_type=eq.gruppe&year=eq.2026&order=name.asc` | ✅ **Aktiv** (11 Schützen in `Muhen 1` & `Muhen 2`, Runden 1–3, Liegend/Kniend, Heatmaps). |
| **Grenzlandcup (GC)** | `app/app_gruppe.html` | `GET /contest_results?contest_type=eq.grenzland&year=eq.2026&order=name.asc` | ✅ **Aktiv** (1 Schütze in `Muhen 1`, Runden 1–3). |
| **Mannschaft (SMM)** | `app/app_mannschaft.html` | `GET /contest_results?contest_type=eq.mannschaft&year=eq.2026&order=name.asc` | ✅ **Aktiv** (24 Schützen in `Muhen 1`, `Muhen 2`, `Muhen 3`, `Pool`, Runden 1–7). |

---

## 3. Analyse des Standblatt-Uploads: Alter GAS-Ablauf vs. Supabase-KI

### 3.1 Historischer Google Apps Script Ablauf (`GAS/Jahresmeisterschaft_GAS_Original/`)
1. **Upload:** Schütze lud Bild/PDF über Web-Formular hoch.
2. **Drive & Formular:** Das Bild wurde in Google Drive gespeichert; die Daten in das Sheet `Formularantworten` geschrieben (`V_main_dopost.js`).
3. **Automatischer Direkteintrag:** Das Skript rief `updateZielSheetRefactored()` auf:
   - Suchte die Schützenzeile via 6-stelliger Lizenznummer.
   - Suchte die Spalte des Schiessens (ab Spalte 42) nach Name und Maximalpunktzahl. War keine vorhanden, wurde automatisch eine neue Spalte angelegt.
   - Trug die erreichten Punkte direkt in die Tabellenzelle ein.
4. **Automatisches Ranking-Update:** Das Skript rief sofort `runRankingUpdate()` auf (`V_ranking_auswärtige.js`):
   - Berechnete für alle Schützen die Prozentwerte aller Auswärtsschiessen (`(Punkte / Max) * 100`).
   - Ermittelte die beiden besten Resultate.
   - Schrieb die Werte in Spalten 15 & 16 (`Auswärtiges 1 & 2`) und 28 & 29 (`Prozentwerte`).
5. **Ranglisten-Sortierung (`JM_Cloudfare2Github.js`):**
   ```javascript
   liga1.sort((a,b) => b.total - a.total).forEach((t,i) => t.rang = i + 1);
   liga2.sort((a,b) => b.total - a.total).forEach((t,i) => t.rang = i + 1);
   ```

### 3.2 Neuer Ablauf mit Supabase & Client-seitiger KI (`app/upload.js`)
1. **KI-Unterstützung im Frontend:**
   - **PDF:** `pdfjs-dist` extrahiert Textblöcke direkt im Browser, erkennt den Schützen und Schiessname und prognostiziert über `forecastMaxPoints()` Schweizer Standard-Schiesstableaus (60, 80, 100, 120, 150, 200, 300, 600 Pkt).
   - **Fotos & Smartphone:** Apple HEIC wird via `heic2any` zu JPEG konvertiert. Bei Fotos analysiert die Gemini 2.5 Flash KI via Vorstand-API-Worker das Standblatt und extrahiert Punkte und Anlass.
2. **Speicherung des Standblatts:**
   - Das komprimierte Bild wird an Cloudflare R2 übermittelt (`worker_github-dropdown-refresh.js`).
   - Die Metadaten (Punkte, Maximum, Schütze) werden in `public.contest_ocr_logs` protokolliert.
3. **Aktuelle Lücke:**
   - Das hochgeladene Resultat wird **nicht** automatisch in `jm_seasons` (`raw_grid`) eingetragen.
   - Im Vorstandscockpit existiert aktuell noch keine Übersicht/Inbox, um eingereichte Standblätter aus `contest_ocr_logs` einzusehen und mit einem Klick in die Jahresmeisterschaft zu übernehmen.

---

## 4. Wichtiges Analyseergebnis: Rangierungs-Inkonsistenz in Liga 1

Bei der Überprüfung der Rangierung in `public.jm_shooters` wurde eine Diskrepanz aufgedeckt:

- **Morgenthaler Lars:** Total = `778.50 %` -> in DB hinterlegter Rang: **2**
- **Fischer Marco:** Total = `777.83 %` -> in DB hinterlegter Rang: **1**

### Ursache im Code:
1. In `recalculateJMRawGrid()` (`jahresmeisterschaft-import.js`) werden zwar die Totals der Schützen in Spalte 18/19 neu berechnet, die Rangspalte (Spalte 0, `colRang`) wird jedoch **nicht** dynamisch aktualisiert.
2. In `syncJMShootersToSupabase()` (`jahresmeisterschaft-core.js`) werden die Zeilen in physischer Reihenfolge (`r = 5..12`) durchlaufen und der Rang statisch aus Spalte 0 übernommen:
   ```javascript
   const rangVal = parseInt(grid[r][colRang]) || (r - 4);
   ```
3. `app_jm.html` und die Vereinswebsite sortieren nach `order=liga.asc,rang.asc`. Dadurch erscheint Fischer Marco fälschlicherweise auf Rang 1 vor Morgenthaler Lars.

---

## 5. Empfohlene Verbesserungen

1. **Dynamische Rangierung in `syncJMShootersToSupabase` & `recalculateJMRawGrid`:**
   - Vor dem Speichern müssen Schützen in Liga 1 und Liga 2 strikt nach `total` absteigend sortiert und die Ränge `1, 2, 3...` dynamisch vergeben werden (analog zum alten GAS-Code).
   - Die Rangspalte 0 in `raw_grid` wird synchron nachgeführt.
2. **Standblatt-Freigabe-Inbox im Vorstandscockpit:**
   - Im Jahresmeisterschafts-Modul des Vorstands wird ein neuer Reiter oder Button «📥 Eingereichte Standblätter (${count})» integriert.
   - Schützenmeister sieht die von Mitgliedern via PWA hochgeladenen Standblätter aus `contest_ocr_logs`, prüft das Vorschaubild und übernimmt das Resultat mit 1 Klick direkt in die Jahresmeisterschaft.
3. **PWA Tab-Refresh bei Navigation:**
   - In `app.js` bei Klick auf die Bottom-Nav-Tabs (JM, G&G, Mannschaft) die Daten der iFrames auffrischen bzw. das Event `app:resume` in den iFrames abfangen, damit Aktualisierungen ohne manuelles Pull-to-Refresh sichtbar sind.
