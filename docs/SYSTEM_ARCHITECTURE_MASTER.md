# System-Architektur Master: Vereinsportal Sportschützen Muhen

**Stand:** 27. September 2026  
**Status:** PRODUKTIV / TESTBETRIEB  
**Führendes Gesamtsystem:** Supabase PostgreSQL & Auth (Self-Hosted auf Proxmox VE Host „Medion“)  
**Gültigkeit:** Verbindliche Single Source of Truth für alle Fachmodule und Architektur-Standards  

---

## 1. Gesamtsystem & Infrastruktur

Das Vereinsportal bedient drei Frontends über eine einheitliche, entkoppelte Backend-Infrastruktur ohne stille Google Apps Script (GAS) Fallbacks oder automatische Dual-Writes:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BENUTZER (Browser)                                   │
│    Desktop / Tablet (Vorstand)        Smartphone (Mitglieder)        Öffentlich / Web  │
└───────────────┬──────────────────────────────────┬────────────────────────────┬────────┘
                │ HTTPS                            │ HTTPS                      │ HTTPS
                ▼                                  ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     DREI FRONTENDS                                     │
│  1. Vorstand-Portal (SPA):    vorstand/index.html + vorstand/js/* (Bootstrap 5)       │
│  2. Mitglieder-App (PWA):     index.html + app.js + app/* (Mobile First, Standblatt)   │
│  3. Vereins-Website:          sportschuetzen-website/frontend/* (News, Vermietung, Ränge)
└───────────────┬──────────────────────────────────┬────────────────────────────┬────────┘
                │                                  │                            │
                │ HTTPS (REST API / Storage / Auth via Supabase Client JS)       │
                ▼                                  ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 CLOUDFLARE EDGE & TUNNEL (https://supabase-muhen.danfamily.uk)         │
│  - Container 112 (cloudfared) auf Proxmox leitet weltweiten Traffic verschlüsselt weiter│
│  - Keine offenen Router-Ports, kein lokaler IP-Zugriff in Client-Builds                │
│  - Edge-Proxy für Immich-Galerien & Social Media Graph APIs                            │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PROXMOX VE HOST "MEDION" (Self-Hosted)                          │
│                                                                                        │
│  Container 117: SUPABASE (Single Source of Truth)                                      │
│  ├── PostgreSQL (Relational, RLS-gesichert auf Tabellenebene)                          │
│  ├── GoTrue Auth (JWT, bcrypt, Magic-Link, Password-Recovery via SMTP)                 │
│  ├── Storage Buckets ('operatives-storage', 'vereins-dokumente')                       │
│  └── Edge Functions ('send-email' via SMTP, 'generate-pdf' via pdf-lib)                │
│                                                                                        │
│  Container 112: Cloudflare Tunnel daemon (cloudfared)                                  │
│  Integrierte Server-Dienste:                                                           │
│  ├── Paperless-NGX: Revisionssicheres Langzeitarchiv für Verträge, Rechnungen, Belege   │
│  └── Immich Server: Original-Bildarchiv & Gesichts-/Objekterkennung                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Projekt-Richtlinie 1 & 2:** Google Apps Script und Google Sheets wurden für alle Datenabfragen und Mutationen vollständig entkoppelt. Es existieren keine stillen Fallbacks oder automatischen Dual-Writes mehr. Tritt bei einer Supabase-Transaktion ein Fehler auf, wird ein klarer UI-Fehler gemeldet.

---

## 2. Zentrale Shared Engines & Standards

Alle Fachmodule greifen auf fünf zentrale, entkoppelte Querschnittsdienste zu:

### 2.1 Zentrales Forderungswesen & Lifecycle: `RechnungsCore`
* **Implementierung:** [`vorstand/js/rechnungen/rechnungen-core.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js) (gestützt durch Migration [`25_central_invoicing_and_payments.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/25_central_invoicing_and_payments.sql))
* **Standard-Vertrag (`InvoiceOrder`):** Fachmodule wie Inventar (Materialverkäufe `MV-`, Kautionen `DP-`), Vermietung und Jahresbeiträge betreiben **keine eigenen Rechnungslogiken** mehr. Sie übergeben ein typisiertes JSON-Payload an `RechnungsCore.createInvoice(order)`.
* **Rechnungs-Lifecycle:** `entwurf` $\rightarrow$ `offen` $\rightarrow$ `teilbezahlt` $\rightarrow$ `bezahlt` (sowie `storniert`, `gemahnt`).
* **Zahlungsverbuchung:** `RechnungsCore.recordPayment(id, input)` bucht Teil- und Vollzahlungen in `public.invoice_payments`, aktualisiert den Restsaldo (`open_amount`) über einen Datenbanktrigger und erzeugt automatisch den doppelten Buchungssatz in `public.accounting_journal`.
* **Revisionssicherheit:** Fester Adress-Snapshot (`recipient_address` JSONB) beim Festschreiben; spätere Änderungen an Mitglieder-Stammdaten verändern historische Rechnungen nicht.
* **Atomare Nummernvergabe:** PostgreSQL-Sequenz `invoice_number_seq` und Funktion `next_invoice_number()` (Migration [`26_atomic_invoice_numbers.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/26_atomic_invoice_numbers.sql)) verhindern Race Conditions und doppelte Nummern bei gleichzeitigen Zugriffen.

### 2.2 Dokument- & PDF-Engine: `pdf-engine.js` & `generate-pdf`
* **Implementierung:** Supabase Edge Function `supabase/functions/generate-pdf/index.ts` mit Client-API [`vorstand/js/pdf-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/pdf-engine.js).
* **Swiss QR-Bill Standard:** Exakte Einhaltung der Schweizer Norm SIX SPC 0200 1 (105 × 210 mm Zahlteil, Empfangsschein, Perforationslinie, zentriertes 7×7 mm Schweizerkreuz, QRR/SCOR/NON-Referenzen).
* **Dynamische Geometrie & Lookahead:** Flexibles Text-Wrapping ohne starre Positionsgrenzen; Lookahead verhindert „Orphan Payment Slips“ (leere Folgeseiten nur mit QR-Teil).
* **Ablage & WORM-Archiv:** Fertige Dokumente werden im Bucket `operatives-storage` persistiert (`invoices/{year}/`, `contracts/{year}/` oder `archive/{year}/`) und bei Bedarf an Paperless-NGX übergeben.

### 2.3 E-Mail- & Kommunikations-Engine: `send-email`
* **Implementierung:** Supabase Edge Function `supabase/functions/send-email/index.ts` mit Client-API [`vorstand/js/mail-engine.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/mail-engine.js).
* **SMTP-Transport:** Direkter nativer Versand via SSL (Port 465) / STARTTLS (Port 587) über Gmail (`sportschuetzen.muhen@gmail.com`) oder Infomaniak (`mail.infomaniak.com`).
* **Zentrales Audit-Log:** Jede versendete E-Mail wird transaktionssicher in `public.mail_logs` protokolliert (Empfänger, Betreff, Vorschau, Modulbezug, Status).

### 2.4 Authentifizierung & RBAC-Sicherheitsmatrix
* **Implementierung:** Supabase Auth (GoTrue) + Migrationen [`01_auth_and_roles.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/01_auth_and_roles.sql), [`22_logins_and_auth_module.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/22_logins_and_auth_module.sql), [`23_role_permissions_and_auth_enhancements.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/23_role_permissions_and_auth_enhancements.sql) und [`24_admin_auth_sync_and_functions.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/24_admin_auth_sync_and_functions.sql).
* **3-stufiges Berechtigungsmodell:**
  1. `auth.users`: Verschlüsselte Identität (bcrypt), Login via E-Mail/Passwort, Magic-Link oder Passwort-Recovery.
  2. `public.user_roles`: Zuordnung der 8 Vereinsrollen (`admin`, `vorstand`, `schuetzenmeister`, `aktuar`, `kassier`, `vermieter`, `materialwart`, `member`).
  3. `public.role_permissions`: Granulare Zuweisung von über 70 Aktionsberechtigungen (z. B. `vermietung.approve`, `finanzen.buchhaltung`).
* **Erzwingung:** Datenbankseitig über PostgreSQL Row Level Security (RLS) und `auth.has_permission()`. Im Vorstandscockpit steht unter „Logins“ eine interaktive Matrix zur Verfügung, mit der Rechte in Echtzeit geschaltet werden können.

### 2.5 Einheitlicher UI-Standard: `TableKit`
* **Implementierung:** [`vorstand/js/ui-table-kit.js`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/ui-table-kit.js)
* Konsistente Spaltensortierung (Typenerkennung für Schweizer Datumsformate, Zahlen, Text mit `de-CH` Collation), Drag & Drop Reordering, Status-Pill-Filterung sowie dynamisches Ein-/Ausblenden von Tabellenspalten mit Speicherung im `localStorage`.

---

## 3. Status der migrierten Fachmodule

Alle Fachmodule arbeiten mit Supabase als alleinigem Single Source of Truth. Dual-Writes an Google Sheets sind vollständig deaktiviert:

| Fachmodul | Datenmodell (Supabase PostgreSQL) | Führende Funktionen & Besonderheiten |
| :--- | :--- | :--- |
| **Mitglieder (Write-Master)** | `members`, `member_licenses`, `member_functions`, `member_training`, `member_history` | Browser-native SSV-Diff-Engine (< 100 ms); Mutationen direkt im Cockpit; automatisches Audit-Log in `member_history`; Nachwuchskategorie `Jugend (U21)` voll integriert. |
| **Rechnungswesen** | `invoices`, `invoice_positions`, `invoice_payments`, `external_contacts` | Vollständiger Rechnungs-Lifecycle via `RechnungsCore`; Teilzahlungen; Mahnwesen; Schweizer QR-Rechnung SPC 0200 1 via `generate-pdf`; automatische Debitoren-Verbuchung in die FiBu. |
| **Jahresbeitrag** | `contributions_header`, `contributions_positions`, `gebuehren_config`, `member_participations` | Dynamische Gebührenordnung; automatische Rechnungserzeugung über `RechnungsCore`; bankgestützte Zahlungsverbuchung; sub-sekündliches Laden ohne Polling. |
| **Finanzbuchhaltung (FiBu)** | `accounting_accounts`, `accounting_journal`, `accounting_budgets`, `accounting_bank_rules` | Vollständiger KMU-Kontenrahmen; Journal mit doppelter Buchhaltung; CAMT.053/054 XML-Bankabgleich mit automatischen Kontierungsregeln; TableKit für alle Auswertungen. |
| **Vermietung Schützenhaus** | `rental_requests`, `rental_pricing`, `rental_settings`, `rental_status_logs`, `rental_cancellation_feedbacks` | Vollständige Workflow-Steuerung von Anfrage bis Abschluss; automatische Mietvertragserstellung mit QR-Zahlschein; SMTP-Mailversand; iCal-Synchronisation für physische Belegung. |
| **KK-Jahresmeisterschaft** | `jm_seasons`, `jm_shooters`, `jm_competitions`, `contest_ocr_logs` | 2D-Grid-Snapshots in JSONB (`raw_grid`); strukturierte Auswertung für Liga 1, 2 und U21 in `jm_shooters`; blitzschnelle Berechnung (< 30 ms) statt 15s Sheet-Lock; Standblatt-Scan via Gemini Vision OCR. |
| **Resultate & Team Manager** | `contest_results`, `contest_setups`, `contest_teams`, `contest_ocr_logs` | Verwaltung Grenzlandcup, Gruppen- und Mannschaftsmeisterschaft (Runden 1–7); Team-Zuteilungen aus `contest_setups`; Matchbericht-Versand via `send-email`. |
| **Anlässe & Controlling (Pilot)** | `events`, `event_items`, `event_orders`, `event_checklists`, `event_shifts`, `event_shift_assignments`, `v_event_controlling` | Operatives Event-Management; dynamischer Mengenrechner (Besucher × Faktor); Bestellwesen; Checklisten; Helfereinteilung; Deckungsbeitrags-Controlling. |
| **Anlässe & Umfragen (RSVP)** | `poll_events`, `poll_responses`, `poll_views`, `poll_responses_log` | Anmelde- und Umfragesystem für Mitglieder via Mobile PWA; Essenswünsche; Begleitpersonen; Auswertungs-Controlling. |
| **Jahresprogramm & Termine** | `termine`, `termine_locations`, `termine_event_types` | Verwaltung aller Schiesstage und Vereinstermine mit Google Maps Verknüpfung; Drag & Drop Sortierung; PWA- und Website-Anbindung ohne GAS. |
| **Vereinsinventar** | `inventory_items`, `inventory_transactions`, `inventory_deposits`, `inventory_audit_log`, `inventory_config` | Waffen, Schlüssel, Bekleidung; Ausleihe mit digitaler Signatur; Kautionen/Pfandkasse; Materialverkäufe erzeugen Rechnungen direkt über `RechnungsCore`. |
| **Generalversammlung (GV)** | `gv_instances`, `gv_traktanden`, `gv_praesenz`, `v_gv_praesenz_summary` | Traktanden und Beschlüsse; automatisierte Stimmberechtigungsprüfung aus `members`; Vor-Ort-Präsenzkontrolle und Menüauswertung; Einladungs-Generator via `generate-pdf`. |
| **System-Mails & Log** | `system_mail_configs`, `mail_logs` | Dynamische Verwaltung aller automatischen System-Verteiler; revisionssicheres Versandprotokoll aller ausgehenden Mails. |

---

## 4. Revisionssicherer Dokumenten- & Vorlagen-Pool (Phase 27)

Das Modul Rechnungswesen wurde entlastet: Der Artikelstamm verbleibt im Rechnungs-Cockpit, während Briefköpfe, Vertragsklauseln und Dokumentvorlagen in die Kachel **„Dokumenten-Vorlagen“** überführt wurden:

* **Datenbankstruktur (Migration [`27_document_templates_and_clauses.sql`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/supabase/migrations/27_document_templates_and_clauses.sql)):**
  - `public.document_templates`: Header-Daten, Kategorien (`mietvertrag`, `rechnung`, `mahnung`, `gv`, `brief`), Einleitungs- und Schlusstexte, Zahlungsziele.
  - `public.document_template_clauses`: 1:n Klauseltabelle für nummerierte Paragraphen (Mietvertrag Schützenstube Rüteli Ziffern 1 bis 8, Benützungsreglement, Reinigungsgebühren, Übergabe-Checkliste) mit Drag-&-Drop-Sortierung.
  - Updatable View `public.invoice_layouts` garantiert 100%ige Abwärtskompatibilität bestehender Programmaufrufe.
* **Deterministisches Höhen-Budgeting & QR-Schlussseite:**
  - Reicht der verbleibende Platz auf Seite 1 nicht für den unteilbaren 105-mm-QR-Zahlteil samt Sicherheitsabstand aus ($< 111\text{ mm}$), lagert die Engine den Einzahlungsschein samt Belegzusammenfassung deterministisch auf eine dedizierte Folgeseite aus.

---

## 5. Bereinigte Gesamt-Roadmap (Phasen 0 bis 29)

| Phasen-Nr. | Bereich / Thema | Führendes System | Status |
| :--- | :--- | :--- | :--- |
| **Phase 0–2** | Zielarchitektur, RLS-Fundament, Pilotmodul ANLÄSSE | Supabase PostgreSQL / RLS | ✅ Abgeschlossen |
| **Phase 3–5** | Vermietung, Mitglieder & SSV-Import, Anlässe & Umfragen (Eventplaner) | Supabase (Single Source of Truth) | ✅ Abgeschlossen |
| **Phase 6–9** | Termine (TableKit), Inventar, Mitglieder Write-Master, Jahresbeitrag | Supabase (Single Source of Truth) | ✅ Abgeschlossen |
| **Phase 10–12** | Rechnungsmodul, Finanzbuchhaltung (FiBu), Resultate & Wettkämpfe | Supabase (Single Source of Truth) | ✅ Abgeschlossen |
| **Phase 13–17** | Mail-Log, System-Mails, KK-Jahresmeisterschaft, Team Manager, Generalversammlung | Supabase (Single Source of Truth) | ✅ Abgeschlossen |
| **Phase 18–19** | PWA & Website Konsolidierung, Finaler Cut-Over (Google Sheets Dual-Writes gekappt) | Supabase REST / Edge | ✅ Abgeschlossen |
| **Phase 20–21** | Zentrale Mail-Engine (`send-email`), PDF-Engine (`generate-pdf`, SIX Swiss QR SPC 0200 1) | Supabase Edge Functions / Storage | ✅ Abgeschlossen |
| **Phase 21.1–21.3** | Vollständige GAS-Entkopplung aller Fachmodule (Keine Fallbacks, keine Dual-Writes) | Supabase PostgreSQL | ✅ Abgeschlossen |
| **Phase 22–23** | Supabase Auth Integration, RBAC-Berechtigungsmatrix, Passwort-Recovery & Magic-Link | Supabase GoTrue Auth / PostgreSQL | ✅ Abgeschlossen |
| **Phase 24** | Admin Auth Synchronisation & Hilfsfunktionen (`24_admin_auth_sync_and_functions.sql`) | Supabase PostgreSQL / Auth | ✅ Abgeschlossen |
| **Phase 25** | Zentrales Forderungswesen & Zahlungsverbuchung (`25_central_invoicing_and_payments.sql`, `RechnungsCore`) | `RechnungsCore` / PostgreSQL | ✅ Abgeschlossen |
| **Phase 26** | Atomare Rechnungsnummernvergabe (`26_atomic_invoice_numbers.sql`, `invoice_number_seq`) | PostgreSQL Sequence & Stored Proc | ✅ Abgeschlossen |
| **Phase 27** | Zentraler Vorlagen- & Klauselpool (`27_document_templates_and_clauses.sql`, Rüteli-Klauseln, `templates-ui.js`, GV-Anbindung) | Supabase PostgreSQL / Edge Function | 🔄 Schritte 1–4 abgeschlossen (Schritt 5 Verifikation) |
| **Phase 28** | Infomaniak Cut-Over (Domain-Transfer, DNS-Aufschaltung, CalDAV für Schützenhaus) | Infomaniak / Supabase | ⏳ Geplant |
| **Phase 29** | Zeitgesteuerte Automationen via `pg_cron` & endgültige Stilllegung von GAS-Triggern | PostgreSQL (`pg_cron`, `pg_net`) | ⏳ Geplant |

---

## 6. Dokumenten-Governance & Referenzen

* **Master-Architektur (dieses Dokument):** [`docs/SYSTEM_ARCHITECTURE_MASTER.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/SYSTEM_ARCHITECTURE_MASTER.md) – Verbindliche Referenz für Architektur, Standards und Phasenstand.
* **Historische Vor-Migrationsanalyse (Archiv):** [`docs/Archiv/LEGACY_ARCHITECTURE_ANALYSIS_2026-09-19.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/Archiv/LEGACY_ARCHITECTURE_ANALYSIS_2026-09-19.md) – Beschreibt den ursprünglichen Stand mit Google Sheets und GAS vor der Migration.
* **Fachkonzept KK-Jahresmeisterschaft:** [`docs/JAHRESMEISTERSCHAFT.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/JAHRESMEISTERSCHAFT.md) – Detailerklärung zur 2D-Matrix, Streichresultaten, U21-Wertung und Gemini Vision OCR.
* **Rechnungswesen & Vorlagen-Harmonisierung:** [`docs/SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md) – Vertiefte Spezifikation der Phasen 25–27 (RechnungsCore, PDF-Geometrie, Vorlagen-Cockpit).
* **Datenbank- & RLS-Referenzhandbuch:** [`docs/SUPABASE_ARCHITECTURE.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/SUPABASE_ARCHITECTURE.md) – Detailliertes Nachschlagewerk für Tabellenschemata und Sicherheitsrichtlinien.
