# Fachdokumentation: Umfragen, Anlässe & Dynamischer Formularbaukasten

> **Status:** PRODUKTIV (Migration 67 umgesetzt)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.poll_events`, `poll_responses`, `poll_views`, `poll_responses_log`, `events`, `event_items`, `event_shifts`, `gv_instances`  
> **Migration:** [`67_dynamic_survey_forms_and_responses.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/67_dynamic_survey_forms_and_responses.sql)  
> **Frontend:** Vorstandsportal ([`vorstand/js/umfragen/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/umfragen/)) & Mobile PWA ([`index.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/index.html), [`app.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/app.js))  
> **Berechtigungen:** `umfragen.view` (Einsehen) / `umfragen.manage` (Verwalten)

---

## 1. Übersicht & Systemgrenzen

Das Modul **Umfragen & Anlässe** steuert die digitale Interaktion zwischen dem Vorstand und den Vereinsmitgliedern für alle vereinsinternen und auswärtigen Aktivitäten der Sportschützen Muhen:
* **Vereinsanlässe & Feste:** Helferaufrufe, Jubiläen, 1.-August-Feier, Absenden, Endschiessen.
* **Auswärtige Gruppenschiessen:** Terminkoordination mit Datumsslots und automatischer Bildung von 5er-Wettkampfteams.
* **Generalversammlung (GV):** An-/Abmeldungen, Essensauswahl (Fleisch / Vegi) und Traktandenvorbereitung.
* **Spontane Umfragen & Feedback:** Meinungsbilder, Terminumfragen, Materialbedarfsabfragen.

### Systemgrenzen & Prinzipien:
1. **Single Source of Truth:** Alle Termine, Fragestellungen und Rückmeldungen liegen transaktionssicher in Supabase PostgreSQL.
2. **Keine stillen Fallbacks:** Vollständige Entkopplung von Google Forms, Google Sheets oder Google Apps Script (GAS).
3. **Zwei Welten im Frontend:**
   * **Vorstands-Cockpit (`vorstand/js/umfragen/`):** Verwaltung von Events, Zuweisung von Personenkreisen, automatisierte Gruppeneinteilung, Live-Auswertung, Mail-Verteiler und Kalenderexport (.ics).
   * **Mitglieder-App (`app.js`):** Schlanke, extrem schnelle Hero-Cards auf dem Smartphone (1-Klick-Zusage/Absage, Quick-Chips für Abmeldegründe, dynamische Optionen).

---

## 2. Analyse der vorgeschlagenen Architektur (Dynamischer Baukasten)

### 2.1 Die vorgelegte Meinung im Überblick
Die vorgeschlagene Vision sieht vor, das Modul von starren Spalten zu entkoppeln und in einen **universellen, dynamischen Formular- und Umfragebaukasten** zu transformieren:
* Trennung von Programmierlogik und Inhalten.
* Beliebige Fragen (Text, Ja/Nein, Dropdown, Mehrfachauswahl, Zahlen, Datum, Mengen) ohne Datenbankänderungen.
* Frei konfigurierbare Personenkreise und Zielgruppen.
* Dynamische Auswertungen mit Diagrammen und Exporten.
* Datenbankstruktur mit relational verknüpften Tabellen (`events`, `surveys`, `survey_questions`, `survey_options`, `survey_responses`, `survey_answers`, `survey_audience`).

---

### 2.2 Fundierte Bewertung & Architektur-Gegenüberstellung

| Kriterium | Aktueller Ist-Zustand (`poll_events` & `poll_responses`) | Vorgeschlagener reiner EAV-Baukasten | Empfohlene hybride Supabase-Architektur |
| :--- | :--- | :--- | :--- |
| **Flexibilität bei neuen Fragen** | ❌ **Starr:** Fragen beschränkt auf `frage_begleitung`, `frage_essen`, `frage_grund` und feste `options`. Jede neue Frage benötigt DB-Migrationen. | 🟢 **Maximal:** Beliebige Fragen, Typen und Optionen können vom Vorstand per UI angelegt werden. | 🟢 **Sehr hoch:** Frei definierbare Fragenblöcke über typisiertes JSONB-Schema pro Event ohne Schema-Mutationen. |
| **Abfrage-Komplexität & Performance** | 🟢 **Sehr schnell:** Direkte Spaltenabfrage mit 1 Query. Sub-Sekunden Ladezeit in PWA. | 🔴 **Schwerfällig:** Jede Auswertung erfordert 5-fache Joins (`events` $\rightarrow$ `surveys` $\rightarrow$ `questions` $\rightarrow$ `responses` $\rightarrow$ `answers`) oder komplexe SQL-Pivots. | 🟢 **Optimal:** Relationale Kern-Entität mit PostgreSQL GIN-indiziertem JSONB-Payload. 1 Query liefert vollständige Daten. |
| **Mobile PWA Usability (Schützen)** | 🟢 **Exzellent:** 1-Klick-RSVP, Nudge-Chips bei Abmeldung, native UI. | ⚠️ **Gefahr von Reibung:** Generische Formulare (Typeform-Style) senken auf Mobilgeräten oft die Rücklaufquote älterer Schützen. | 🟢 **Exzellent:** Dynamische Felder werden nahtlos in das bewährte native Hero-Card-Design eingebettet. |
| **Schützenspezifische Fachlogik** | 🟢 **Integriert:** Automatische 5er-Team-Bildung für Gruppenschiessen in `umfragen-eval.js`. | 🔴 **Verlust der Domäne:** Generische Antworten kennen keine "5er-Gruppen" oder Wettkampf-Regeln mehr. | 🟢 **Geschützt:** Standard-RSVP & Gruppenschiessen bleiben native Kernmodelle; Baukasten fungiert als erweiterbare Engine. |
| **Row Level Security (RLS)** | 🟢 **Einfach:** 2 Tabellen abzusichern (`poll_events`, `poll_responses`). | ⚠️ **Komplex:** RLS über 7 Tabellen mit kaskadierenden Berechtigungsprüfungen (`survey_audience`). | 🟢 **Robust & Schlank:** RLS auf 2 Tabellen (`poll_events`, `poll_responses`) mit klarer `lizenz` / `auth.uid()` Bindung. |

---

### 2.3 Die Kernfrage: Generisches EAV vs. Hybrides JSONB-Schema

Die vorgeschlagene relationale Zerlegung in `survey_questions` und `survey_answers` (klassisches **Entity-Attribute-Value-Muster**) hat in PostgreSQL bekannte Nachteile:
1. **Aggregations-Overhead:** Eine Teilnehmerliste für ein Vereinsfest mit 60 Schützen und 5 Fragen erzeugt 300 Zeilen in `survey_answers`. Um diese im Vorstands-Cockpit tabellarisch anzuzeigen, müssen aufwendige PIVOT-Queries oder Client-Transformationen ausgeführt werden.
2. **Datenintegrität vs. Flexibilität:** In reinem EAV sind Spaltentypen (`survey_answers.value`) typischerweise Text. Zahlen oder Daten verlieren ihre strenge Typisierung in der Datenbank.

**Die moderne Supabase-Lösung:**  
Supabase PostgreSQL brilliert beim **hybriden Modell**:
* **Relationale Metadaten:** `event_id`, `lizenz`, `attending`, `created_at` bleiben erstklassige relationale SQL-Spalten mit Indizes und Foreign Keys.
* **Dynamisches Fragenschema (`questions_schema` JSONB):** Die Fragenkonfiguration (Typ, Label, Optionen, Validierung, Pflichtfeld) liegt strukturiert im Event.
* **Typisierte Antworten (`answers` JSONB):** Alle Antworten des Mitglieds werden atomar in einem strukturierten JSONB-Objekt gespeichert (`{ "helfer_bereich": ["festwirtschaft"], "kuchen": "ja", "stunden": 3 }`).
* **Vorteil:** PostgreSQL JSONB unterstützt GIN-Indizierung, direkte Operatoren (`answers->>'kuchen' = 'ja'`) und relationale JSON-Funktionen (`jsonb_to_record`), ohne dass das Datenbankschema bei neuen Fragen angepasst werden muss.

---

## 3. Ziel-Datenmodell (Das hybride Schema)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ public.poll_events (Umfragen & Anlässe)                                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ id: VARCHAR(100) PRIMARY KEY                                                           │
│ title: VARCHAR(255) NOT NULL                                                           │
│ datum: DATE                                                                            │
│ end_datum: DATE (optional für mehrtägige Feste)                                        │
│ gruppe: VARCHAR(50) NOT NULL DEFAULT 'aktiv' (Zielgruppe / Einladungskreis)            │
│ event_type: VARCHAR(50) DEFAULT 'standard' ('standard', 'schiessen', 'helfer', 'gv')   │
│ aktiv: BOOLEAN NOT NULL DEFAULT true                                                   │
│ showparticipants: BOOLEAN NOT NULL DEFAULT false                                       │
│ details: TEXT                                                                          │
│ dokument_url: TEXT                                                                     │
│ questions_schema: JSONB NOT NULL DEFAULT '[]'::jsonb                                   │
│ options: JSONB NOT NULL DEFAULT '[]'::jsonb (Terminslots für Gruppenschiessen)         │
│ created_at / updated_at: TIMESTAMPTZ                                                   │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │ 1:n
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ public.poll_responses (Rückmeldungen der Mitglieder)                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()                                         │
│ event_id: VARCHAR(100) REFERENCES public.poll_events(id) ON DELETE CASCADE             │
│ lizenz: VARCHAR(20) NOT NULL (SSV-Lizenznummer des Mitglieds)                          │
│ attending: BOOLEAN NOT NULL DEFAULT false (Zusage / Absage)                            │
│ count: INTEGER NOT NULL DEFAULT 1 (Gesamtanzahl Personen)                              │
│ essen: INTEGER NOT NULL DEFAULT 0 (Standardmenüs)                                      │
│ vegi: INTEGER NOT NULL DEFAULT 0 (Vegi-Menüs)                                          │
│ grund: TEXT (Begründung bei Absage)                                                    │
│ optionids: TEXT (Gewählte Terminslots bei Schiessanlässen)                             │
│ answers: JSONB NOT NULL DEFAULT '{}'::jsonb (Freie Antworten gemäss questions_schema)   │
│ created_at / updated_at: TIMESTAMPTZ                                                   │
│ UNIQUE(event_id, lizenz)                                                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Struktur des `questions_schema` (JSONB)
Jeder Event kann ein flexibles Fragen-Array definieren:
```json
[
  {
    "id": "q_helfer_ressort",
    "type": "multiselect",
    "title": "In welchen Bereichen kannst du mithelfen?",
    "required": true,
    "options": ["Festwirtschaft", "Aufbau", "Abbau", "Schiessbetrieb", "Kuchenspende"]
  },
  {
    "id": "q_stunden",
    "type": "select",
    "title": "Wie viele Einsatzstunden sind für dich möglich?",
    "required": false,
    "options": ["1-2 Stunden", "3-4 Stunden", "Ganzer Tag"]
  },
  {
    "id": "q_bemerkungen",
    "type": "text",
    "title": "Spezielle Wünsche / Bemerkungen",
    "required": false
  }
]
```

### 3.2 Unterstützte Antworttypen
1. `boolean` (Ja / Nein)
2. `select` (Einfachauswahl Dropdown / Radio)
3. `multiselect` (Mehrfachauswahl mit Checkboxen)
4. `text` (Einzeiliger Text)
5. `textarea` (Mehrzeiliger Kommentar)
6. `number` (Numerische Eingabe mit Min/Max)
7. `date` / `time` (Datum oder Uhrzeit)

---

## 4. Berechtigungsmodell & Sicherheits-Kontrakt (RBAC & RLS)

Gemäss **Projekt-Richtlinie 7** (`AGENTS.md`) gilt für das Modul das symmetrische 2-Stufen-Modell:

### 4.1 Berechtigungsschlüssel
* `umfragen.view` (👁️ Einsehen):
  * Freischaltung des Moduls im Vorstandsportal als Leseansicht.
  * Mitglieder besitzen automatisch Leserecht auf die ihnen zugewiesenen aktiven Events (`aktiv = true` und Abgleich mit `gruppe`).
* `umfragen.manage` (✏️ Verwalten):
  * Events erstellen, bearbeiten, aktivieren/schliessen und löschen.
  * Fragenschema konfigurieren.
  * Vollzugriff auf Auswertungen, Exporte, E-Mail-Versand und Audit-Logs.

### 4.2 Row Level Security (RLS) Kontrakt
* **`poll_events`:**
  * `SELECT`: Für alle authentifizierten Benutzer (Mitglieder sehen nur `aktiv = true`; Vorstandsmitglieder mit `umfragen.view` sehen alle).
  * `INSERT / UPDATE / DELETE`: Streng autorisiert über `auth.has_permission('umfragen.manage')`.
* **`poll_responses`:**
  * `SELECT`: 
    * Vorstandsmitglieder (`umfragen.view` / `umfragen.manage`) sehen alle Rückmeldungen.
    * Mitglieder sehen ihre **eigenen** Rückmeldungen (`lizenz = current_user_license`).
    * Ist `showparticipants = true` geschaltet, dürfen alle Mitglieder die Liste der angemeldeten Namen einsehen (personenbezogene Details wie Essen oder freie Antworten bleiben geschützt).
  * `INSERT / UPDATE`: Mitglieder dürfen nur für ihre **eigene Lizenz** schreiben. Vorstand mit `umfragen.manage` darf Korrekturen erfassen.

---

## 5. Schnittstellen & Integration in bestehende Subsysteme

### 5.1 Gruppenschiessen (5er-Team Generator)
* Auswärtige Gruppenschiessen nutzen das relationale Flag `schiessanlass = true` und das Feld `options` (Termin-Slots).
* Der bestehende Algorithmus in [`vorstand/js/umfragen/umfragen-eval.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/umfragen/umfragen-eval.js) gruppiert Schützen mit passenden Datumswünschen automatisch in 5er-Teams und bereitet die Anmelde-E-Mail vor.
* **Invariant:** Diese Fachlogik bleibt unberührt und wird durch den dynamischen Baukasten nicht abstrahiert oder verlangsamt.

### 5.2 Generalversammlung (GV) & Konsolidierung im GV-Dossier
* **Zentrale Schaltzentrale (`gv-dossier.js`):** Die vollständige Steuerung der GV (Traktanden, Beilagen-Assembler, Kampagnen-Versand, Live-Präsenzkontrolle und Gastronomie-/Menüauswertung für den Schützenstuben-Wirt) ist im Modul **Generalversammlung / GV-Dossier** konsolidiert (Reiter 5 «Anmeldungen & Präsenz» und Ansicht «Gastronomie & Wirt»).
* **Tab 4 in Umfragen als Weiterleitung:** Im Modul Umfragen dient der bisherige Tab 4 («GV-Controlling») als redundanzfreier Schnellzugriff und verweist direkt auf das GV-Dossier.
* **Schlüsselwort-Invariante «Generalversammlung»:** Damit die mobile PWA (`app.js`) und das GV-Cockpit den Umfrage-Event automatisch erkennen und verknüpfen, muss der Event-Titel zwingend das Wort **«Generalversammlung»** enthalten (Gross-/Kleinschreibung irrelevant, z. B. `112. Generalversammlung 2026`). Beim Eintippen des Titels in der Event-Erfassung wird das Wort automatisch erkannt und setzt selbsttätig `event_type = 'gv'`, `frage_essen = true` und `frage_grund = true`.
* **Single Source of Truth:** `public.poll_responses` fungiert als transaktionssichere Datenbasis für die Anmeldungen der Mitglieder; Vor-Ort-Anwesenheiten und Stimmbeteiligungen werden in `public.gv_praesenz` geführt.

### 5.3 Kalender- & E-Mail-Engine
* **Kalenderexport:** Automatische Generierung von `.ics`-Dateien mit Weckfunktion (1 Tag und 1 Stunde vor Anlass) via `downloadEventICS()`.
* **E-Mail-Engine:** Anbindung an `send-email` Edge Function für gezielte Reminder an Teilnehmer oder Nicht-Reagierende.

---

## 6. Beantwortung der strategischen Kernfrage

> **Frage:** *«Sollen auch die Rückmeldungen vollständig frei definierbar sein – beispielsweise mehrere verschiedene Anmeldungen, Helfereinteilungen und Mengenangaben innerhalb einer einzigen Umfrage – oder primär klassische Fragen mit Antworten und anschliessender Auswertung?»*

### Empfehlung für die Sportschützen Muhen:

Die optimale Lösung ist ein **gestuftes 3-Ebenen-Modell**:

1. **Ebene 1 – Die universelle Schützen-Basis (Immer aktiv):**
   * Jede Anmeldung behält das vertraute Muster: **Zusage / Absage / Begleitpersonen / Abmeldegrund**.
   * Auf dem Smartphone bleibt die Rückmeldung für Standard-Anlässe eine **1-Klick-Aktion**.

2. **Ebene 2 – Schützenspezifische Fach-Vorlagen (Domänen-Workflows):**
   * **Auswärtiges Gruppenschiessen:** Terminauswahl mit Mehrfachauswahl (Poll-Slots) und automatischer 5er-Teambildung.
   * **Generalversammlung (GV):** Abmeldefristen, Menüauswahl (Fleisch / Vegi) für den Wirt und Verknüpfung zu Traktanden & Stimmberechtigung.
   * *(Hinweis: Helfer- & Festwirtschaftsplanung wird getrennt über das Modul **«Anlässe & Controlling»** via `events`, `event_shifts` und `event_items` gelöst. Ein separates Feedback-/Umfrage-Template entfällt, da Meinungsbilder bei Bedarf direkt über Ebene 3 abgebildet werden).*

3. **Ebene 3 – Freie Zusatzfragen (Der Formularbaukasten via JSONB `questions_schema`):**
   * Über das JSONB-Feld `questions_schema` kann der Vorstand zu jedem Event **beliebig viele individuelle Zusatzfragen** konfigurieren (z. B. «Bringst du einen Salat oder Kuchen mit?», «T-Shirt-Grösse», «Fahrgemeinschaft»).
   * 100 % dynamisch ohne Programmieraufwand oder SQL-Migrationen.

### Warum dieser Weg der beste ist:
* Er kombiniert die **Flexibilität eines Formularbaukastens** mit der **hohen Usability und Schnelligkeit** der bestehenden Schützen-App.
* Bestehende Spezialfunktionen (5er-Gruppen, GV-Controlling, Menüsummen) bleiben zu 100 % erhalten und funktionsfähig.
* Es entstehen keine komplexen Datenbank-Pivots oder Performance-Einbrüche bei Auswertungen.

---

## 7. Web-App Integration & Lifecycle der Zusatzfragen

* **Lifecycle & Synchronisation:** Termine aus dem Jahresprogramm (`termine`) und RSVP-Anlässe (`poll_events`) werden im Frontend-Merge (`app.js`) verlustfrei mit `questions_schema`, `answers` und `event_type` synchronisiert.
* **Hero-Card & Poll-Card Integration:** 
  * Bei Anlässen mit Zusatzfragen (`questions_schema.length > 0`) öffnet der Button «Ja, sicher» bzw. «Details ändern» das dynamische Formular (`openRSVPForm`).
  * Unterstützte Fragetypen: `text`, `textarea`, `number`, `boolean`, `select`, `multiselect`, `date`, `time`.
  * Nach erfolgter Zusage werden alle erfassten Antworten als Zusammenfassung auf der Karte (`✅ Angemeldet`) übersichtlich angezeigt.
  * Auch Terminumfragen (`renderPollCard`) binden Zusatzfragen nativ im Abstimmungs- und Auswertungsmodus ein und persistieren sie transaktionssicher in `public.poll_responses.answers`.

