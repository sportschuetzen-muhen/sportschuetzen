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
      1. *Schütze identifiziert & Namensabgleich:* Name komplett, SSV-Lizenznummer (auch aus Barcode wie `1018033721` -> `828521`) und Jahrgang werden mit dem angemeldeten Profil sowie allen Vereinsmitgliedern aus `jm_seasons` (`_knownShooters`) abgeglichen. Weicht der Name ab (z.B. Standblatt von Lukas Burkhalter hochgeladen unter Nicole Zurbriggen), warnt das Frontend unübersehbar und bietet eine 1-Klick-Stellvertretung («Für Lukas Burkhalter einreichen»), Neuauswahl oder manuelle Bestätigung.
     2. *Anlass erkannt:* Fuzzy-Matching gleicht Anlass & Veranstalter (z.B. «43. Stumpenlandschiessen 2026, Menziken-Burg») exakt mit vorhandenen Schiessspalten der aktuellen Jahresmeisterschaft ab (z.B. «Stumpenland-Schiessen Menziken-Burg»).
     3. *Punkte & Maximum:* Stich (z.B. Gruppenstich), erreichte Punktzahl und Maximum (100 Pkt) werden validiert.
2. **Speicherung des Standblatts & Beleg-Abruf:**
   - Das komprimierte Bild wird an Cloudflare R2 übermittelt (`worker_github-dropdown-refresh.js`, Route `action=upload_standblatt`).
   - Die Datei kann über `action=get_standblatt&file=...` mit CORS-Headern und Cache-Headern im Frontend als Belegfoto angezeigt werden.
   - Die Metadaten (Punkte, Maximum, Schütze, Beleg-URL, Jahrgang, exakter Anlassname) sowie die strukturierte `ocr_analysis` (Schütze-Status, Anlass-Status, Score-Status, Beweis-Text) werden mit Status `pending` in `public.contest_ocr_logs` protokolliert.
   - **System-Mails & Bestätigung:** Der Schütze erhält unmittelbar eine Bestätigungs-Mail über den Eingang via Supabase Edge Function `send-email`. Eine Kopie wird automatisch an den Verteiler `Info_Mail_Standblatt_Upload` gesendet (konfigurierbar im Modul System-Mails via `public.system_mail_configs`).
3. **Standblatt-Freigabe-Inbox im Vorstandscockpit (`jahresmeisterschaft-inbox.js`):**
   - Schützenmeister sieht im Header der Jahresmeisterschaft ein Live-Badge `📥 Standblätter (N)`.
   - Das Inbox-Modal listet alle ausstehenden Einreichungen inklusive Belegfoto-Lightbox, Jahrgangsanzeige und Statusbadge (`Verifiziert`, `Prüfung nötig`, `Neuer Anlass`).
   - **Prüfbericht & OCR-Vergleich:** Zu jedem Standblatt kann ein detaillierter Prüfbericht eingeblendet werden, der eine 3-Spalten-Gegenüberstellung (Bereich | Formular-Eingabe | OCR-Erkennung), den Beweis-Text aus dem Beleg und direkte Beleg-Vorschau enthält. Standblätter mit manuellem Status oder unvollständiger Erkennung bieten im Warnbanner und in der Aktionsleiste einen Button «KI-Prüfbericht jetzt durchführen», um die Gemini-Vision-OCR on-demand auf dem Originalbeleg auszuführen. Beim PWA-Upload wird zudem der Submit-Button während der laufenden KI-Analyse deaktiviert.
   - **1-Klick-Übernahme mit Schützen-Prüfung:** Resultat wird in `jmRawGrid` eingetragen (Spalte ab 41/42 automatisch zugeordnet oder erstellt). Bei erkannter Namensabweichung fragt das System explizit nach, ob das Resultat für den Beleg-Schützen oder den Einsender verbucht werden soll. Die Jahresmeisterschaft inklusive Rangierung wird neu berechnet, in `jm_seasons` und `jm_shooters` gespeichert und der Status auf `imported` gesetzt. Bei Freigabe wird der Schütze automatisch per E-Mail informiert.

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
   - Detaillierter Prüfbericht mit visueller Gegenüberstellung (Formular vs. OCR-Erkennung), Beweis-Text und On-Demand-Nachprüfung.
   - RLS-Berechtigungen auf `public.contest_ocr_logs` um `jahresmeisterschaft.view` und `jahresmeisterschaft.manage` erweitert (`50_contest_ocr_logs_jm_rbac.sql`).
3. **PWA Tab-Synchronisation:**
   - `app.js` sendet beim Umschalten der Tabs ein `app:resume`-PostMessage an alle iFrames (`app_jm.html`, `app_gruppe.html`, `app_mannschaft.html`), sodass neue Resultate sofort sichtbar werden.
4. **Cloudflare R2 & Vollständige GAS-Entkopplung:**
   - Standblatt-Uploads speichern Belege exklusiv in Cloudflare R2 (`MY_BUCKET`).
   - Die alte Hintergrund-Weiterleitung an Google Apps Script (`GOOGLE_WEB_APP_URL` / `V_main_dopost.js`) wurde vollständig entfernt (striktes Verbot stiller GAS-Fallbacks gemäss Projekt-Richtlinie 1).
   - Der Google Schützenhaus-Belegungskalender (`GOOGLE_HAUS_KALENDER_URL`) bleibt wie spezifiziert aktiv.
5. **System-Mails Verteiler & Benachrichtigungen:**
   - Neuer Verteiler `Info_Mail_Standblatt_Upload` im Modul System-Mails unter Jahresmeisterschaft integriert (`public.system_mail_configs`, Migration `69_standblatt_upload_system_mail.sql`).
   - Schützen erhalten Eingangs- und Freigabebestätigungen, der Vorstand/Schützenmeister automatisch eine Kopie.
6. **Synchronisierte Badges & Jahresarchiv:**
   - Offene Standblätter (`_jmPendingStandblaetter`) synchronisieren automatisch Badges im Modul-Header, in der Sidebar-Navigation und auf der Dashboard-Kachel der Jahresmeisterschaft KK.
   - Das Standblatt-Modal bietet ein dediziertes «Archiv & Historie»-Tab mit Jahresfilter zur permanenten Einsicht aller übernommenen oder abgelehnten Belege.
   - Beim Upload werden bekannte Saison-Wettkämpfe via Datalist geladen und beim Import via Fuzzy-Matching mit bestehenden Tabellenspalten verknüpft.
7. **Browserübergreifende Upload-Stabilität (Edge, Firefox, Safari):**
   - Vollständige Syntaxbereinigung der Try-Catch- und Kontrollfluss-Blöcke in `app/upload.js` (`processPdfStandblatt` und `processImageStandblatt`).
   - Bubbling- und klicksichere Bindung des Datei-Auswahldialogs via nativem `<label for="foto" class="upload-area">` in `app/upload.html` ohne fehleranfälliges Inline-`onclick`.
   - Versions- und Cache-Busting (`upload.html?v=5`, `upload.js?v=6`) für sofortige Ausführung auf allen Desktop- und Mobil-Browsern.
8. **Formular-Verschlankung & Animierter KI-Fortschritts-Timer:**
   - Entfernung des sichtbaren Anlassfeldes: Der Schütze muss den Anlass nicht mehr manuell wählen oder erfassen; die Zuordnung erfolgt vollautomatisch im Hintergrund via Hidden-Field (`#anlass`) und OCR-Matching.
   - Visuelle Fortschrittsanzeige: Sobald ein Beleg gewählt wird, visualisiert ein animierter Farb-Ladebalken mit Countdown (ca. 6s) und Erklärungstext die aktive Standblatt-Analyse.
   - Manuelle Sofort-Freigabe & Spin-Button-Bereinigung: Tippt der Schütze Punkte manuell ein, wird der Senden-Button sofort aktiviert. Die Up/Down-Pfeile an Zahlenfeldern wurden browserübergreifend ausgeblendet.

9. **Zuverlässiger Schützenabgleich, Mismatch-Erkennung & Stellvertretung:**
   - Automatische Erkennung von Namens- und Lizenzabweichungen auf Belegen gegenüber dem eingeloggten Schützen.
   - Frontend bietet 1-Klick-Stellvertretung («Für [Name] einreichen»), Neuauswahl oder manuelle Bestätigung; Submit-Button wird bei Abweichung bis zur Bestätigung gesperrt.
   - Vorstand-Inbox markiert Diskrepanzen visuell und fragt beim Übernehmen gezielt nach der Schützen-Zuordnung.

10. **Scope- & Fehlerbehebungs-Bereinigung bei Stellvertretungs-Submit:**
   - Behebung eines Laufzeitfehlers (`ReferenceError: targetFullName is not defined`) in `app/upload.js`, der bei aktivierter Stellvertretung fälschlicherweise als «Netzwerkfehler beim Übermitteln» gemeldet wurde.
   - Präzisierung der Fehlerbehandlung zur Ausgabe echter Fehlermeldungen sowie Cache-Busting (`upload.html?v=7`, `upload.js?v=9`).

11. **PWA Homescreen Badges & Persönliche Pendenzen in der Web-App:**
   - Jedes eingeloggte Vereinsmitglied sieht auf seinem iOS/Android Home-Screen direkt am App-Icon via native Web Badging API (`navigator.setAppBadge`), ob persönliche Pendenzen (offene Umfragen/RSVPs und unbezahlte Rechnungen) anstehen.
   - Vorstandsmitglieder (`is_board`) erhalten zusätzlich Vorstands-Pendenzen (offene Standblätter, Immich-Galerie-Uploads und Miet-Vorabanfragen), visualisiert an den roten Badges am Schnellzugriff «👑 Vorstand» sowie im Profil-Dropdown.
   - Die Aggregation erfolgt atomar über die PostgreSQL-Funktion `public.get_member_pendenzen_count(p_lizenz, p_is_board)` (Migration 93) und wird bei jedem App-Resume (`visibilitychange`, `pageshow`, `focus`) sowie nach Beantwortung von Umfragen in `app.js` automatisch synchronisiert.
   - Sowohl die Mitglieder-App als auch das Vorstandsportal verfügen über dedizierte Manifeste (`manifest.json` und `vorstand/manifest.json`) und Apple Touch Icons für eine native Vollbild-Installation.
