# Fachdokumentation: Generalversammlung (GV-Cockpit, Traktanden, Dossier-Compiler & Präsenz)

> **Status:** PRODUKTIV / ENTKOPPELT  
> **Stand:** Oktober 2026  
> **Führendes System:** Supabase PostgreSQL (Sportschützen Muhen)  
> **Komponenten:** `public.gv_instances`, `public.gv_traktanden`, `public.campaign_attachments`, `public.communication_campaigns`, `public.poll_events`, `public.poll_responses`, `public.gv_praesenz`, `public.system_mail_configs`  
> **Edge Functions:** `generate-pdf` (`compile-gv-dossier`, `generate-gv-invitation`, `generate-gv-praesenzliste`), `send-email`  
> **Frontend:** Vorstandsportal (`vorstand/js/gv-dossier.js`, `vorstand/js/pdf-engine.js`, `vorstand/js/mail-engine.js`) & Mobile PWA (`index.html`, `app.js`)  
> **Berechtigungen:** `gv.view` (Einsehen) / `gv.manage` (Verwalten)

---

## 1. Übersicht & Systemgrenzen

Die **Generalversammlung (GV)** ist das oberste statutarisches Organ der Sportschützen Muhen. Das Modul **Generalversammlung** vereint die gesamte organisatorische und administrative Vorbereitung, Durchführung und Nachbereitung des Anlasses in einem eigenständigen Vorstands-Cockpit.

### 1.1 Kernfunktionen des Moduls
1. **Traktanden-Management mit Hierarchie & Wahlen:** Strukturierte Erfassung von Haupt- und Untertraktanden (`parent_id`), Drag & Drop Sortierung (SortableJS), Vorjahres-Kopierfunktion und dynamische Wahljahr-Steuerung.
2. **Dossier-Compiler & Beilagen-Assembler:** Automatisches Zusammenfügen von dynamisch generierter Einladung & Jahresprogramm mit extern hochgeladenen PDF-Vorstandsberichten (Präsident, Jungschützen, Protokoll Vorjahr, Revisoren) zu einem druckfertigen Master-Heft inklusive einheitlichem «Corporate Stempel» (`pdf-lib`).
3. **Kampagnen-Steuerung & Massenversand:** Idempotenter Versand personalisierter Einladungs-Mails via `send-email` Edge Function mit schlankem PDF-Anhang (< 1 MB) und geschütztem Download-Link für das Gesamtdossier (Bounce-Schutz).
4. **Live-RSVP & Menübestellung für den Wirt:** Echtzeit-Synchronisation der An-/Abmeldungen mit `public.poll_responses`, automatische Menüzählung (Fleisch vs. Vegi, Allergien) und 1-Klick-Export für das Gastroteam der Schützenstube.
5. **Vor-Ort-Präsenzkontrolle & Stimmquorum:** 1-Klick-Toggle am GV-Abend in `public.gv_praesenz`, automatische Berechnung des absoluten Mehrs (Stimmquorum) und automatischer Versand der druckfertigen DIN A4 Präsenzliste an den Aktuar.

### 1.2 Systemgrenzen & Leitprinzipien
* **Single Source of Truth:** Alle Stammdaten, Traktanden, Beschlüsse, Beilagen und Teilnehmerrückmeldungen liegen direkt in Supabase PostgreSQL.
* **Keine stillen Fallbacks:** Vollständige Entkopplung von Google Drive-Verlinkungen, Google Sheets oder Google Apps Script (GAS).
* **Eigenständiges Fachmodul:** Vollständige Entflechtung aus dem Modul *«Anlässe & Umfragen»* (wo GV früher als Tab 4 geführt wurde) sowie aus der *«Dokumenten-Vorlagen-Zentrale»*. Die Generalversammlung besitzt eine eigene Sidebar-Navigation und eine eigene Kachel im Dashboard.

---

## 2. Datenbank-Architektur & Single Source of Truth

Das Modul stützt sich auf folgende relationale Tabellen in Supabase PostgreSQL:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ public.gv_instances (Stammdaten & Fristen)                                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ id: VARCHAR(50) PRIMARY KEY (z.B. 'gv_2026')                                           │
│ year: INTEGER NOT NULL UNIQUE (z.B. 2026)                                              │
│ number: INTEGER NOT NULL DEFAULT 100 (z.B. 100 für die 100. GV)                        │
│ datum: DATE (Durchführungsdatum)                                                       │
│ zeit: VARCHAR(10) DEFAULT '19:30'                                                      │
│ ort: VARCHAR(150) DEFAULT 'Schützenhaus Muhen'                                         │
│ datum_vorjahr: DATE                                                                    │
│ abmelde_datum: DATE (Frist für Rückmeldungen)                                          │
│ mahn_datum: DATE (Mahn- / Erinnerungsfrist)                                            │
│ is_election_year: BOOLEAN NOT NULL DEFAULT false (Wahljahr-Flag)                       │
│ linked_event_id: VARCHAR(100) (Verknüpfung zu public.poll_events.id)                   │
│ praesident_wort: TEXT (Persönliches Grusswort des Präsidenten)                         │
│ budget_text: TEXT (Kommentar zum Jahresbudget)                                         │
│ custom_placeholders: JSONB NOT NULL DEFAULT '{}'::jsonb                                │
│ created_at / updated_at: TIMESTAMPTZ                                                   │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │ 1:n                         │ 1:n                         │ 1:n
         ▼                             ▼                             ▼
┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────────────────────┐
│ public.gv_traktanden         ││ public.gv_praesenz           ││ public.campaign_attachments  │
├──────────────────────────────┤├──────────────────────────────┤├──────────────────────────────┤
│ id: VARCHAR(50) PRIMARY KEY  ││ id: VARCHAR(100) PRIMARY KEY ││ id: UUID PRIMARY KEY         │
│ gv_id: VARCHAR(50) FK        ││ gv_id: VARCHAR(50) FK        ││ campaign_id: UUID FK         │
│ parent_id: VARCHAR(50) FK    ││ person_number: VARCHAR(50)   ││ title: VARCHAR(255)          │
│ sort_order: INTEGER          ││ name: VARCHAR(150)           ││ attachment_type: VARCHAR(50) │
│ nummer: VARCHAR(10)          ││ lizenz: VARCHAR(20)          ││ sort_order: INTEGER          │
│ titel: VARCHAR(255) NOT NULL ││ mitglied_status: VARCHAR(50) ││ storage_path: TEXT           │
│ beschreibung: TEXT           ││ stimmberechtigt: BOOLEAN     ││ file_url: TEXT               │
│ referent: VARCHAR(100)       ││ anmeldung_status: VARCHAR(20)││ page_count: INTEGER          │
│ beschluss: TEXT              ││ anwesend: BOOLEAN            ││ created_at: TIMESTAMPTZ      │
│ ja / nein / enthaltungen: INT││ essen: INTEGER (Fleisch)     │└──────────────────────────────┘
│ status: VARCHAR(50)          ││ vegi: INTEGER (Vegetarisch)  │
│ created_at / updated_at      ││ grund: TEXT                  │
└──────────────────────────────┘│ notizen: TEXT                │
                                │ created_at / updated_at      │
                                └──────────────────────────────┘
```

### 2.1 Traktanden-Hierarchie (`parent_id`)
Mit Migration `44_gv_traktanden_parent_and_hierarchy.sql` wurde die Spalte `parent_id` eingeführt:
* **Haupttraktandum:** `parent_id IS NULL` (z. B. Traktandum 5: «Wahlen»).
* **Untertraktandum:** `parent_id = 'traktandum_2026_5'` (z. B. 5.1 Präsident, 5.2 Vorstand, 5.3 Revisoren, 5.4 Fähnrich).
* **Cascade Delete:** Beim Löschen eines Haupttraktandums werden dessen Untertraktanden automatisch kaskadierend entfernt.

### 2.2 Storage-Infrastruktur
* **Bucket `campaign-assets`:** Dient als Upload-Ziel für Berichte (PDFs der Vorstandsmitglieder) sowie als Zwischenspeicher für assembliertes Gesamt-Dossier (`gv-dossiers/{year}/GV_Dossier_{year}_Gesamt.pdf`).
* **Bucket `operatives-storage`:** Revisionssichere Langzeitarchivierung (`gv/{year}/...`).

---

## 3. Berechtigungsmodell (RBAC & RLS Kontrakt)

Gemäss **Projekt-Richtlinie 7** (`AGENTS.md`) gilt für das Modul das symmetrische 2-Stufen-Modell:

### 3.1 Berechtigungsschlüssel
* `gv.view` (👁️ Einsehen - Read-Only):
  * Freischaltung der Kachel im Dashboard und des Menüpunkts in der linken Navigation.
  * Vollständige Einsicht in Traktanden, Stammdaten, Beilagen, E-Mail-Vorschau, RSVPs und Menüauswertungen.
* `gv.manage` (✏️ Verwalten - Schreiben):
  * Bearbeiten von GV-Stammdaten, Traktanden (inkl. Drag & Drop und Wahljahr-Trigger).
  * Upload und Löschen von Beilagen, Starten der Dossier-Kompilierung.
  * Starten des Massenversands und Senden von Test-Mails.
  * Erfassen von Vor-Ort-Präsenzen und manuellen RSVP-Mutationen.
  * Auslösen des E-Mail-Versands an Aktuar und Vorstand.
* **System-Rolle `admin`:** Besitzt als Superuser automatisch Vollzugriff (`*`).

### 3.2 Row Level Security (RLS)
* `public.gv_instances`, `public.gv_traktanden`, `public.gv_praesenz`:
  * `SELECT`: Berechtigung `gv.view` oder `gv.manage`.
  * `INSERT / UPDATE / DELETE`: Berechtigung `gv.manage`.
* `public.poll_responses`:
  * Mitglieder dürfen über die PWA ihre eigene Zeile mutieren (`lizenz = current_user_license`).
  * Vorstandsmitglieder mit `gv.manage` dürfen im GV-Cockpit manuelle Nachmeldungen vornehmen.

---

## 4. Die 5 Kernbereiche des GV-Cockpits (Left Panel)

Das UI des Moduls (`vorstand/js/gv-dossier.js`) ist als übersichtlicher 2-Spalten-Workspace konzipiert:

### Reiter 1: Traktanden-Manager
* **Hierarchische Gliederung:** Hauptpunkte mit fortlaufender Nummerierung und optisch eingerückte Unterpunkte.
* **SortableJS Drag & Drop:** Intuitive Neuanordnung von Haupttraktanden (`.gv-main-drag-handle`) und Untertraktanden (`.gv-sub-drag-handle`) mit sofortiger Persistierung der `sort_order` in Supabase.
* **Wahljahr-Automation (`gvDossierToggleWahljahr`):** Aktiviert oder deaktiviert mit 1 Klick das Traktandum «Wahlen» samt den 4 statutarischen Unterpunkten (Präsident, Vorstand, Revisoren, Fähnrich).
* **Vorjahres-Übernahme (`gvDossierCopyPreviousYearTraktanden`):** Kopiert auf Knopfdruck alle Traktanden des Vorjahres inklusive Unterstrukturen, sodass keine manuelle Neuerfassung nötig ist.

### Reiter 2: GV-Stammdaten & Fristen
* Steuerung von GV-Nummer, Datum, Uhrzeit, Durchführungsort, Abmeldefrist und Mahndatum.
* Verknüpfung zum Umfrage-Event in `public.poll_events`.
* **Globaler SaveButtonKit Dirty Tracker:** Änderungen werden überwacht. Der Speichern-Button zeigt die Anzahl ungespeicherter Mutationen (`Speichern (N)`). Entwürfe bleiben beim Wechsel zwischen den Reitern verlustfrei erhalten.

### Reiter 3: Dossier-Beilagen & Assembler
* **Dateiuploads nach `campaign-assets`:** Upload von Vorstandsberichten, Protokollen und Kassenberichten als PDF.
* **SortableJS Beilagen-Sortierung:** Festlegung der genauen Reihenfolge der Dokumente im fertigen Heft.
* **Button «Gesamtes GV-Dossier jetzt kompilieren & stempeln»:**
  * Ruft die Edge Function `generate-pdf` mit Action `compile-gv-dossier` auf.
  * Erzeugt dynamisch Seite 1 (Einladung & Traktanden mit harmonisierten Untertraktanden) sowie Folgeseiten für **Jahresprogramm** (`kategorie = 'Jahresprogramm'`) und **Schiesstermine** (`kategorie = 'Schiesstermine'`) aus `public.termine` (`anlasstitel`, `startzeit`, `endzeit`, `ort`).
  * Textinhalte ausserhalb der Traktanden (Titel, Intro, Antragsfristen, Outro) stammen aus `public.document_templates` (`gv_normal` / `gv_wahljahr`) und können direkt im GV-Cockpit («Stammdaten & Fristen») oder unter «Dokumenten-Vorlagen» bearbeitet werden.
  * Hängt alle hochgeladenen PDF-Beilagen nahtlos an (`copyPages`).
  * Prägt den einheitlichen **Corporate Stempel** (Vereinskopf oben, fortlaufende Seitennummerierung `Seite X von Y` unten) über das gesamte Dokument.

### Reiter 4: E-Mail-Text & Kampagne
* Konfiguration von E-Mail-Betreff und Begleittext über den globalen Vereins-Editor `ClubWysiwyg` mit formatierungsreicher Toolbar, Alert-Bannern, Call-to-Actions und dynamischen Platzhaltern (`{{mitglied.vorname}}`, `{{mitglied.nachname}}`, `{{event.datum_formatiert}}`, `{{dossier.download_url}}`).
* **Sicherheits-Features:**
  * Button «Test-Mail an mich senden»: Sendet ein reales Test-PDF direkt an die Adresse des eingeloggten Benutzers.
  * Massenversand mit Fortschrittsanzeige und Idempotenz (kein versehentlicher Doppelversand).
  * **Bounce-Schutz:** Versand eines schlanken Einladungs-PDFs als Mailanhang (< 1 MB) und Einbettung eines geschützten Download-Links für das grosse Gesamt-Dossier.

### Reiter 5: Anmeldungen & Vor-Ort-Präsenzkontrolle
* **Live-Status:** Übersicht über Zusagen, Absagen, Offene Rückmeldungen sowie Menüwünsche (Fleisch vs. Vegi).
* **1-Klick-Präsenzkontrolle (`gvDossierToggleAnwesend`):** Schnelle Erfassung der Anwesenheit am GV-Abend mit automatischer Ermittlung der stimmberechtigten Mitglieder und Berechnung des **absoluten Mehrs** (Stimmquorum).
* **Manuelle Nachmeldungen:** Erfassung von Gästen oder telefonischen Nachmeldungen direkt über das Modal `gvDossierOpenRSVPModal`.

---

## 5. Live-Monitor, Vorschau & Gastronomie (Rechtes Panel)

Das rechte Panel synchronisiert sich live mit den Eingaben im linken Bereich:

### Ansicht 1: `[ 📄 PDF-Vorschau ]`
* Wahlweise Anzeige des dynamischen Einladungs-PDFs oder des kompilierten Gesamt-Dossiers im interaktiven Vorschau-Frame.

### Ansicht 2: `[ ✉️ E-Mail-Vorschau ]`
* Echtzeit-Vorschau des E-Mail-Inhalts mit realen Mitgliedsdaten aus einem Empfänger-Dropdown.

### Ansicht 3: `[ 🍽️ Gastronomie & Wirt ]`
* Spezifisch für die Vorbereitung der Bewirtung:
  * Gesamtzahl der Essen.
  * Aufteilung in Normalmenü (Fleisch) und Vegetarisch.
  * Liste der angemeldeten Mitglieder mit individuellen Bemerkungen (Allergien, Unverträglichkeiten).
  * **1-Klick-Aktion «In Zwischenablage kopieren»:** Formatiert die Menü-Bestellung sofort als Textnachricht für WhatsApp oder E-Mail an den Schützenstuben-Wirt.

---

## 6. Automatisierte Schnittstellen & System-Mails

### 6.1 Automatische Erkennung des Umfrage-Events
Beim Laden oder Neuanlegen einer GV sucht das System in `public.poll_events` nach einem Event, dessen Titel das Schlüsselwort **«Generalversammlung»** (Case-Insensitive) und das aktuelle Jahreskürzel enthält (z. B. `100. Generalversammlung 2026`). Wird ein Treffer gefunden, wird `linked_event_id` automatisch gesetzt.

### 6.2 Druckfertige DIN A4 Präsenzliste & Mail an Aktuar
* **Edge Function `generate-gv-praesenzliste`:** Generiert ein druckfertiges DIN A4 Dokument mit bündig am oberen Rand ausgerichtetem Vereinswappen, Quorum-Box, Stimmberechtigten-Tabelle (`Nr.`, `Nachname`, `Vorname`, `Unterschrift`) und Leerzeilen für spontane Nachmeldungen.
* **Teilnehmerkreis:** Es werden ausschliesslich tatsächlich angemeldete Mitglieder (`status = 'ja'`) aufgeführt, ergänzt durch 15 nummerierte Leerzeilen für spontane Gäste und Nachmeldungen am Versammlungsabend.
* **Automatischer Verteiler:** Versand als PDF-Anhang an den Aktuar über den Verteilerschlüssel `Info_Mail_Aktuar` in `public.system_mail_configs`.

### 6.3 Zwischenstand-Mail an Vorstand
* Auf Knopfdruck generierter Bericht über den aktuellen Anmeldestand (Zusagen/Absagen-Listen, Gastronomiesummen) an alle Vorstandsmitglieder via Verteilerschlüssel `Info_Mail_Vorstand`.

---

## 7. Entflechtung & Klare Abgrenzung zu «Dokumenten-Vorlagen»

Historisch war das GV-Cockpit teilweise als Tab 1 in `vorstand/js/vorlagen/templates-ui.js` eingeklinkt und in `DOCUMENT_AND_MAIL_ENGINE_SPEC.md` integriert. Zur Vermeidung von Redundanzen und Architektur-Konflikten gilt folgende saubere Trennung:

| Bereich | Modul Generalversammlung (`gv-dossier`) | Modul Dokumenten-Vorlagen (`dokument-vorlagen`) |
| :--- | :--- | :--- |
| **Zweck** | Statutarische Durchführung, Traktanden, Beilagen-Assembler, RSVPs & Präsenz | Zentraler Vorlagen- & Klauselpool für Rechnungen, Verträge & Briefe |
| **Datenbasis** | `gv_instances`, `gv_traktanden`, `campaign_attachments`, `gv_praesenz` | `document_templates`, `document_template_clauses` |
| **Navigation** | Eigene Navigations-Kachel `🏛️ Generalversammlung` & eigener Sidebar-Link | Kachel `📄 Dokumenten-Vorlagen` & eigener Sidebar-Link |
| **Berechtigung** | `gv.view` / `gv.manage` | `dokumente.view` / `dokumente.manage` |
| **Fokus** | Operatives Event- und Dossier-Management | Textvorlagen, Klauseln und Standardtexte für das Gesamtsystem |

---

## 8. PDF-Rendering, E-Mail-Harmonisierung & RSVP-Matching (Oktober 2026)
* **Vollvektorielle PDF-Generierung:** Das Rendering der Einladung (`generate-gv-invitation`) greift primär direkt auf `public.gv_traktanden` des aktuellen Durchführungsjahres zu. Die Variablenauflösung (`{gv_datum}`, `{gv_zeit}`, `{gv_ort}`) ist auf Funktionsebene entkoppelt und WinAnsi-sicher (inklusive `generate-gv-praesenzliste` mit `Anw.` statt Unicode-Sonderzeichen).
* **ClubWysiwyg E-Mail-Editor:** Der E-Mail-Versand nutzt das zentrale Vereinsmodell `ClubWysiwyg` mit dynamischen Platzhalter-Pills (`{{mitglied.vorname}}`, `{{mitglied.nachname}}`, `{{event.datum_formatiert}}`, `{{dossier.download_url}}`), sauberem HTML-Sanitizing (`getCleanHtml()`) und WYSIWYG-Livevorschau im rechten Monitor.
* **SSV-Adress- und Lizenznummer-Matching:** `loadGVParticipantsData` lädt zusätzlich `address_number` aus `public.members`. Rückmeldungen aus `public.poll_responses` werden redundant über Personennummer, 6-stellige SSV-Adressnummer und führende Nullen abgeglichen. Spontane Nachmeldungen oder Statusänderungen im RSVP-Modal synchronisieren bidirektional mit `poll_responses` und `gv_praesenz`.
