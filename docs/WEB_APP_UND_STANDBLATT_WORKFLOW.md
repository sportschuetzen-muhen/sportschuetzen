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
1. **KI-Unterstützung im Frontend (3-stufige Validierung):**
   - **PDF:** `pdfjs-dist` extrahiert Textblöcke direkt im Browser, erkennt den Schützen und Schiessname und prognostiziert über `forecastMaxPoints()` Schweizer Standard-Schiesstableaus (60, 80, 100, 120, 150, 200, 300, 600 Pkt).
   - **Fotos & Smartphone:** Apple HEIC wird via `heic2any` zu JPEG konvertiert. Bei Fotos analysiert die Gemini 3 Vision KI (`action=ocr_standblatt` mit Multi-Modell Fallback `gemini-3-flash-preview` -> `gemini-3.5-flash` -> `gemini-flash-latest` -> `gemini-3.8-flash` -> `gemini-3.1-flash-lite`) via Vorstand-API-Worker das Standblatt.
   - **3-stufige Validierung & Feedback:**
     1. *Schütze identifiziert:* Name komplett, SSV-Lizenznummer (auch aus Barcode wie `1018033721`) und Jahrgang (z.B. 1984) abgeglichen mit allen lizenzierten Schützen aus `jm_seasons`.
     2. *Anlass erkannt:* Fuzzy-Matching gleicht Anlass & Veranstalter (z.B. «43. Stumpenlandschiessen 2026, Menziken-Burg») exakt mit vorhandenen Schiessspalten der aktuellen Jahresmeisterschaft ab (z.B. «Stumpenland-Schiessen Menziken-Burg»).
     3. *Punkte & Maximum:* Stich (z.B. Gruppenstich), erreichte Punktzahl und Maximum (100 Pkt) werden validiert.
2. **Speicherung des Standblatts & Beleg-Abruf:**
   - Das komprimierte Bild wird an Cloudflare R2 übermittelt (`worker_github-dropdown-refresh.js`, Route `action=upload_standblatt`).
   - Die Datei kann über `action=get_standblatt&file=...` mit CORS-Headern und Cache-Headern im Frontend als Belegfoto angezeigt werden.
   - Die Metadaten (Punkte, Maximum, Schütze, Beleg-URL, Jahrgang, exakter Anlassname) werden mit Status `pending` in `public.contest_ocr_logs` protokolliert.
3. **Standblatt-Freigabe-Inbox im Vorstandscockpit (`jahresmeisterschaft-inbox.js`):**
   - Schützenmeister sieht im Header der Jahresmeisterschaft ein Live-Badge `📥 Standblätter (N)`.
   - Das Inbox-Modal listet alle ausstehenden Einreichungen inklusive Belegfoto-Lightbox und Jahrgangsanzeige.
   - **1-Klick-Übernahme:** Resultat wird in `jmRawGrid` eingetragen (Spalte ab 41/42 automatisch zugeordnet oder erstellt), die Jahresmeisterschaft inklusive Rangierung neu berechnet, in `jm_seasons` und `jm_shooters` gespeichert und der Status auf `imported` gesetzt.

---

## 4. Bereinigtes Analyseergebnis: Dynamische Rangierung in Liga 1 & 2

Die vormalige Diskrepanz in `public.jm_shooters` wurde vollständig behoben:
- `recalculateJMRawGrid()` (`jahresmeisterschaft-import.js`) sortiert Liga 1 und Liga 2 dynamisch nach Total absteigend und aktualisiert Spalte 0 (`colRang`).
- `syncJMShootersToSupabase()` (`jahresmeisterschaft-core.js`) vergibt Ränge und Auf-/Abstiegsstati basierend auf den dynamisch errechneten Prozentpunkten.
- Morgenthaler Lars führt Liga 1 mit `778.50 %` auf Rang 1 an.

---

## 5. Durchgeführte Verbesserungen & Architektur-Status

1. **Dynamische Rangierung:**
   - Liga 1 und Liga 2 werden bei jeder Berechnung und Synchronisation nach `total` absteigend sortiert.
2. **Standblatt-Freigabe-Inbox im Vorstandscockpit:**
   - Vollständiger Prüf- und Übernahmeworkflow via `vorstand/js/jahresmeisterschaft/jahresmeisterschaft-inbox.js`.
   - RLS-Berechtigungen auf `public.contest_ocr_logs` um `jahresmeisterschaft.view` und `jahresmeisterschaft.manage` erweitert (`50_contest_ocr_logs_jm_rbac.sql`).
3. **PWA Tab-Synchronisation:**
   - `app.js` sendet beim Umschalten der Tabs ein `app:resume`-PostMessage an alle iFrames (`app_jm.html`, `app_gruppe.html`, `app_mannschaft.html`), sodass neue Resultate sofort sichtbar werden.
4. **Cloudflare R2 & Google Drive Sicherheitskopie:**
   - Der Worker speichert Standblatt-Belege originär in Cloudflare R2 (`MY_BUCKET`) und triggert parallel eine Non-blocking Sicherungskopie in den konfigurierten Google-Drive-Ordner (`1qXvWfBCZx6ZipGMIuANyOCzNMKLkqfuY`).
5. **Synchronisierte Badges & Jahresarchiv:**
   - Offene Standblätter (`_jmPendingStandblaetter`) synchronisieren automatisch Badges im Modul-Header, in der Sidebar-Navigation und auf der Dashboard-Kachel der Jahresmeisterschaft KK.
   - Das Standblatt-Modal bietet ein dediziertes «Archiv & Historie»-Tab mit Jahresfilter zur permanenten Einsicht aller übernommenen oder abgelehnten Belege.
   - Beim Upload werden bekannte Saison-Wettkämpfe via Datalist geladen und beim Import via Fuzzy-Matching mit bestehenden Tabellenspalten verknüpft.

