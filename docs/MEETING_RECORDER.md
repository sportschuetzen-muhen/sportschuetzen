# Meeting-Recorder & Protokoll-Assistent

## 1. Übersicht & Zweck
Das Modul **Meeting-Recorder & Protokoll-Assistent** (`vorstand/js/meeting-recorder.js`) unterstützt den Vorstand der Sportschützen Muhen bei der effizienten Audioaufzeichnung und automatisierten Protokollierung von Vorstandsitzungen.

Es verbindet:
* **Browserseitige Audioaufzeichnung:** Kontinuierliche Mikrofon-Aufnahme mit automatischer Segmentierung alle 10 Minuten (`audio/webm;codecs=opus`).
* **Cloudflare Whisper AI:** Asynchrone Spracherkennung der Audio-Segmente mit Exponential-Backoff Retry.
* **LLM-basierte Protokollgenerierung (Gemini Advanced):** Strukturierte Protokollerstellung nach dem offiziellen Musterprotokoll der Sportschützen Muhen (Schweizer Hochdeutsch ohne «ß»).

---

## 2. Sitzungs-Lebenszyklus & Schutz vor Vermischung

1. **Session-Metadaten (`mr_session_meta`):**
   * Speichert Startzeitpunkt (`startedAt`), Zeitpunkt der letzten Segmentübertragung (`lastRecordedAt`), Gesamtdauer in Sekunden (`totalElapsedSeconds`) und die Anzahl Segmente.
2. **Intelligente Alt-Sitzungsprüfung:**
   * Beim Klick auf «Aufnahme starten» prüft das System, ob noch Transkripte einer früheren Sitzung vorhanden sind.
   * Liegt die letzte Aufzeichnung mehr als 3 Stunden zurück oder stammt sie von einem früheren Kalendertag, öffnet sich ein Dialog via `UIConfirmKit.confirm`.
   * Der Benutzer kann wählen zwischen:
     * **Neue Sitzung starten:** Vorherige Transkripte und Logs werden verworfen; die Aufnahme beginnt sauber bei Segment 1 mit zurückgesetztem Timer.
     * **Sitzung fortsetzen:** Bestehende Segmente bleiben erhalten; neue Segmente werden angehängt und der Timer zählt die bisherige Gesamtdauer nahtlos weiter.
3. **Verlustschutz (`beforeunload`):**
   * Solange eine Aufnahme aktiv läuft (`mrIsRecordingActive === true`), fängt ein `beforeunload`-Listener versehentliches Schliessen des Fensters oder Neuladen (`F5`) ab.

---

## 3. Dynamische Teilnehmer- & Sprecher-Matrix (Speaker Attribution)

Da serverlose Spracherkennungsmodelle (Cloudflare Whisper) auf Mono-Tischmikrofonen keine native Sprecherdiarisierung bieten, erfolgt die Zuordnung von Voten, Beschlüssen und Aufgaben über eine **kontextuelle Prompt-Matrix**:

1. **Dynamischer Abgleich mit Mitgliederstamm (`public.members` & `public.v_board_members_public`):**
   * Die aktiven Vorstandsmitglieder werden beim Modulaufruf automatisch und direkt aus der Supabase-Datenbank geladen (Filter: `is_active = true`, nicht ausgetreten, offizielle Vorstandsfunktion).
   * Typische Fachressorts werden anhand der offiziellen Rolle (`role_title`) automatisch zugeordnet (z. B. Simon Hediger / Präsident, Daniel Hunziker / Vizepräsident & Kassier, Andrea Rossi / Juniorenleiter, Marco Fischer & Olivia Rossi / Schützenmeister, Beat Augsburger / Mitgliederverwalter, Nicole Zurbriggen / Vorstand).
   * Ein manueller Sync-Button (**«DB-Sync»**) in der UI erlaubt es dem Aktuar, bei personellen Mutationen die Vorstandsliste jederzeit per 1-Klick neu aus Supabase zu synchronisieren.
   * Externe Sitzungsteilnehmer oder Referenten können über den Button «+ Gast» (via `UIConfirmKit.prompt`) dynamisch erfasst werden.
2. **Anwesenheitssteuerung:**
   * Vor oder während der Sitzung können Teilnehmer per Checkbox als anwesend/abwesend markiert werden. Die Anwesenheitsauswahl bleibt im `localStorage` gesichert.
3. **Gemini Advanced Prompt-Injizierung:**
   * Der generierte Prompt enthält die Liste aller anwesenden Personen mit ihren Aufgabenbereichen sowie die Liste der Abwesenden.
   * Gemini wird instruiert, Voten anhand von Fachressorts und Schweizerdeutschen Anreden («Dani», «Andrea», «Simon», «Beat») zuzuordnen und in der abschliessenden Aufgabenliste jede Pflicht einer konkreten Person zuzuweisen.

---

## 4. UI/UX-Richtlinien & Toolkits

* **Dialoge (`UIConfirmKit`):** Alle Bestätigungen (Sitzungs-Reset, Fortsetzungsabfrage, Gast-Erfassung, Mikrofon-Fehlermeldungen) erfolgen asynchron über `UIConfirmKit.confirm`, `UIConfirmKit.alert` und `UIConfirmKit.prompt`.
* **Ladezustände (`UIButtonKit`):** Die KI-Protokollgenerierung ist mit `UIButtonKit.withLoading('#mr-generate-protocol-btn', ...)` gegen Mehrfachklicks geschützt.
* **Tonalität:** Konsequente Du-Kultur in allen Eingabehinweisen, Tooltips und Dialogen.

