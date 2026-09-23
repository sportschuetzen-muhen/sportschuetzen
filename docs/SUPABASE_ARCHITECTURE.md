# Zielarchitektur: Supabase Vereinsportal Sportschützen Muhen

**Stand:** 2026-09-23  
**Phase:** 0 bis 19 – Zielarchitektur, Auth, Anlässe, Vermietung, Mitglieder (Write-Master), Umfragen, Termine, Inventar, Jahresbeitrag, Rechnungen, Resultate, Mail-Log, System-Mails, Finanzbuchhaltung, KK-Jahresmeisterschaft, Team Manager, Generalversammlung, App & Website, Cut-Over  
**Status:** DEFINITIV – Basiert auf Bestandsanalyse und verifizierten Architekturentscheidungen  
**Referenz:** [ARCHITECTURE_ANALYSIS.md](file:///docs/ARCHITECTURE_ANALYSIS.md)

---

## Inhaltsverzeichnis

1. [Architektur-Prinzipien & Leitlinien](#1-architektur-prinzipien--leitlinien)
2. [Gesamtsystem & Systemgrenzen](#2-gesamtsystem--systemgrenzen)
3. [Rollen- & Authentifizierungskonzept](#3-rollen--authentifizierungskonzept)
4. [Datenmodell & Tabellenstrukturen](#4-datenmodell--tabellenstrukturen)
   - [Basistypen & Enums](#basistypen--enums)
   - [Auth & Benutzerverwaltung](#auth--benutzerverwaltung)
   - [Mitglieder-Stammdaten (Read-Replica)](#mitglieder-stammdaten-read-replica)
   - [Pilotmodul: ANLÄSSE](#pilotmodul-anlässe)
   - [Fachmodul: VERMIETUNG](#fachmodul-vermietung)
5. [Sicherheitsmodell & Row-Level Security (RLS)](#5-sicherheitsmodell--row-level-security-rls)
6. [Integrations- & Schnittstellen-Architektur](#6-integrations--schnittstellen-architektur)
   - [Google Calendar (Belegungs-Master)](#google-calendar-belegungs-master)
   - [Dokumentenfluss: Supabase Storage & Paperless-NGX](#dokumentenfluss-supabase-storage--paperless-ngx)
   - [Mitglieder-Synchronisation (XLSX → Sheets → Supabase)](#mitglieder-synchronisation-xlsx--sheets--supabase)
   - [Fachmodul: ANLÄSSE & UMFRAGEN](#64-fachmodul-anlässe--umfragen-phase-5--abgeschlossen--im-testbetrieb)
   - [Fachmodul: INVENTAR-VERWALTUNG](#65-fachmodul-inventar-verwaltung-phase-7--abgeschlossen--im-testbetrieb)
   - [Fachmodul: JAHRESPROGRAMM & TERMINE](#66-fachmodul-jahresprogramm-termine-anlässe--orte)
   - [Zentraler UI-Standard: TableKit](#67-zentraler-ui-standard-tablekit-vorstandjsui-table-kitjs)
   - [Fachmodul: MITGLIEDER WRITE-MASTER](#68-fachmodul-mitglieder-write-master--status-u21-phase-8--abgeschlossen--im-testbetrieb)
   - [Fachmodul: JAHRESBEITRAG & BEITRAGSVERWALTUNG](#69-fachmodul-jahresbeitrag--beitragsverwaltung-supabase-master--dual-write)
   - [Fachmodul: RESULTATE & WETTKÄMPFE](#610-fachmodul-resultate--wettkämpfe-phase-12--abgeschlossen--im-testbetrieb)
   - [Fachmodul: MAIL-LOG & VERSANDPROTOKOLL](#611-fachmodul-mail-log--versandprotokoll-phase-13--abgeschlossen--im-testbetrieb)
   - [Fachmodul: SYSTEM-MAIL-KONFIGURATION](#612-fachmodul-system-mail-konfiguration-phase-14--abgeschlossen--im-testbetrieb)
   - [Fachmodul: FINANZBUCHHALTUNG (FiBu)](#613-fachmodul-finanzbuchhaltung-fibu-phase-11--abgeschlossen--im-testbetrieb)
   - [Fachmodul: KK-JAHRESMEISTERSCHAFT](#614-fachmodul-kk-jahresmeisterschaft-phase-15--in-umsetzung)
   - [Fachmodul: TEAM MANAGER SUPABASE-FIRST](#615-fachmodul-team-manager-supabase-first-phase-16--geplant)
   - [Fachmodul: GENERALVERSAMMLUNG & PRÄSENZ](#616-fachmodul-generalversammlung--präsenzkontrolle-phase-17--geplant)
   - [PWA & WEBSITE KONSOLIDIERUNG](#617-mitglieder-app--website-konsolidierung-phase-18--geplant)
   - [FINALER CUT-OVER & GOOGLE-SHEETS-STILLEGUNG](#618-finaler-cut-over--google-sheets-stilllegung-phase-19--geplant)
7. [Migrations-Roadmap (Phasen 0 bis 19)](#7-migrations-roadmap-phasen-0-bis-19)

---

## 1. Architektur-Prinzipien & Leitlinien

Die Migration von Google Sheets / Google Apps Script (GAS) auf Supabase folgt fünf unverrückbaren Prinzipien:

1. **Kein Big-Bang – Kontrollierter Parallelbetrieb:**  
   Bestehende operative Abläufe dürfen zu keinem Zeitpunkt unterbrochen werden. Module werden schrittweise migriert. Bestehende Systeme bleiben solange aktiv, bis das jeweilige Supabase-Modul vollständig abgenommen ist.
2. **Datenmodell & Rollen vor Auth-Migration (Phase 0):**  
   Das Ziel-Datenmodell sowie die Berechtigungsstrukturen werden vor der Auth-Implementierung finalisiert. Dies verhindert kostspielige Refactorings von RLS-Policies und Fremdschlüsseln.
3. **RLS von Tag 1 (Zero-Trust-Datenbank):**  
   Jede Tabelle wird unmittelbar bei ihrer Erstellung mit `ENABLE ROW LEVEL SECURITY` versehen. Es gibt keine Tabelle ohne explizite, getestete Zugriffs-Policies.
4. **Klare Systemhoheit (Single Source of Truth je Domäne):**  
   Es gibt keine konkurrierenden Master-Systeme:
   - **Google Calendar** ist und bleibt der Master für die physische Schützenhaus-Belegung.
   - **Supabase** ist der Master für Vermietungsanträge, Verträge, Kunden, Anlässe und Berechtigungen.
   - **Google Sheets** bleibt vorerst der operative Master für SSV-Verbandsstammdaten (Mutation via Verbands-XLSX).
   - **Paperless-NGX** ist das langfristige Revisionsarchiv für PDF-Dokumente.
5. **Kein Ausbau der unsicheren Legacy-Authentifizierung:**  
   Klartext-Passwörter und unsalted SHA-256 Hashes werden nicht weitergeführt. Supabase Auth bildet die neue, unveränderliche Sicherheitsgrenze.

---

## 2. Gesamtsystem & Systemgrenzen

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       BENUTZER (Browser)                                        │
│         Vorstand (Desktop/Tablet)        Mitglieder (Mobile PWA)        Öffentlich (Website)    │
└────────────────┬─────────────────────────────────┬───────────────────────────────┬──────────────┘
                 │ HTTPS                           │ HTTPS                         │ HTTPS
                 ▼                                 ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         DREI FRONTENDS                                          │
│  1. Vorstand-Portal:    vorstand/index.html + vorstand/js/* (SPA, Bootstrap 5)                  │
│  2. Mitglieder-App:     index.html + app.js + app/* (PWA, Standblatt, RSVP)                     │
│  3. Vereins-Website:    sportschuetzen-website/frontend/* (Homepage, News, Buchungsanfrage)    │
└────────────────┬─────────────────────────────────┬───────────────────────────────┬──────────────┘
                 │                                 │                               │
                 │ HTTPS (REST / GraphQL / Realtime) via Supabase Client           │
                 ▼                                 ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               CLOUDFLARE WORKERS (Edge Gateways)                                │
│  - v1-vorstand-api / sportschuetzen-website-worker / Hilfs-Worker                               │
│  - Leiten Legacy-Requests an GAS weiter / Neue Endpunkte an Supabase REST                       │
│  - Immich Proxy (Fotogalerien) & Social Media Graph APIs                                        │
└────────────────┬─────────────────────────────────────────────────────────────────┬──────────────┘
                 │                                                                 │
                 ▼                                                                 ▼
┌──────────────────────────────────────────────┐  ┌───────────────────────────────────────────────┐
│         LEGACY-SCHICHT (Google Sheets)       │  │        PROXMOX VE HOST (Self-Hosted)          │
│                                              │  │                                               │
│  - Google Sheets (10 Master-Spreadsheets)    │  │  ┌─────────────────────────────────────────┐  │
│  - Google Apps Script (11 Projekte)          │  │  │        SUPABASE (Docker / VM)           │  │
│  - SSV-XLSX Import (Verbandsdaten)           │  │  │  ├── Auth (GoTrue / JWT)                │  │
│                                              │  │  │  ├── PostgreSQL (Relational + RLS)     │  │
│  [Bleibt Master für SSV-Stammdaten & Legacy] │  │  │  ├── Storage (Operative PDFs)          │  │
│                        │                     │  │  │  └── PostgREST (Auto-REST API)         │  │
│                        │ manueller Sync      │  │  └────────────────────┬────────────────────┘  │
│                        ▼                     │  │                       │                       │
│        ┌─────────────────────────────┐       │  │                       ▼ Asynchroner Push      │
│        │  Supabase Read-Replica      │───────┼──┼─►┌─────────────────────────────────────────┐  │
│        │  public.members             │       │  │  │   PAPERLESS-NGX (Dokumenten-Archiv)     │  │
│        └─────────────────────────────┘       │  │  │   Langfristarchiv Verträge & Quittungen │  │
│                                              │  │  └─────────────────────────────────────────┘  │
│                                              │  │  ┌─────────────────────────────────────────┐  │
│                                              │  │  │   IMMICH (Fotoverwaltung & Alben)       │  │
│                                              │  │  └─────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────┘  └───────────────────────────────────────────────┘
                       │
                       ▼ API-Call bei Buchungsbestätigung
┌──────────────────────────────────────────────┐
│       GOOGLE CALENDAR (Belegungs-Master)     │
│   Führendes System für Schützenhaus-Belegung │
└──────────────────────────────────────────────┘
```

> **Visuelle Kennzeichnung im Vorstand-Portal:** Erfolgreich auf Supabase migrierte Module (**Anlässe & Controlling**, **Vermietung**, **Mitglieder**) sind in der linken Navigations-Sidebar sowie im Dashboard (Übersichtskarten) mit einem einheitlichen `Supabase`-Badge optisch hervorgehoben.

### Rollenverteilung der Teilsysteme

| System / Komponente | Host / Umgebung | Führende Zuständigkeit (Single Source of Truth) |
|:--------------------|:----------------|:------------------------------------------------|
| **Supabase PostgreSQL** | Proxmox VE (LXC/VM) | Anlässe, Vermietungs-Verwaltung, Buchungsstatus, Inventar, Benutzerrollen, Berechtigungen |
| **Supabase Auth** | Proxmox VE | Zentrales Login (JWT) für alle 3 Frontends, Passwortverwaltung mit bcrypt |
| **Supabase Storage** | Proxmox VE | Operative Dokumentenablage (generierte Mietvertrags-PDFs, temporäre Uploads) |
| **Google Calendar** | Google Cloud | Tatsächliche Raumbelegung / Belegungsstatus des Schützenhauses |
| **Paperless-NGX** | Proxmox VE | Revisionssicheres Langzeitarchiv für Verträge, Rechnungen und Protokolle |
| **Immich** | Proxmox VE | Original-Bildverwaltung, Gesichts- und Objekterkennung, Fotogalerien |
| **Google Sheets** | Google Drive | Vorübergehender Master für SSV-Mitgliederdaten (während Phasen 0–5) |
| **Cloudflare Workers** | Cloudflare Edge | Caching, Edge-Proxy, API-Routing zwischen Legacy- und Supabase-Welt |
| **Cloudflare Tunnel** | Proxmox VE (LXC 112) | Sichere, weltweite HTTPS-Verbindung ohne offene Router-Ports |

### 2.3 Netzwerk-Architektur & Anbindung (Cloudflare Tunnel)

> [!IMPORTANT]
> **Architektur-Standard für alle zukünftigen Anbindungen:**
> Sämtliche Frontends (Vorstand-Portal, Mitglieder-App, Vereinswebsite), Cloudflare Worker und Hintergrunddienste greifen **ausschließlich über die offizielle HTTPS-Endpunkt-URL** auf Supabase zu:
> **`https://supabase-muhen.danfamily.uk`**
> Direkte Zugriffe über lokale IP-Adressen (`192.168.x.x`) sind in Produktions-Builds und Frontends untersagt, um Mixed-Content-Sicherheitsblockaden moderner Browser zu verhindern und weltweite Verfügbarkeit zu garantieren.

```text
  [ Browser / Frontends ]          [ Cloudflare Edge ]          [ Proxmox VE Host "Medion" ]
(sps-b55.pages.dev / App / Web)     (SSL/TLS Edge ZRH)            (192.168.68.61)
           │                                │                                │
           │ HTTPS                          │ Encrypted Tunnel               │
           └───────────────────────────────►│ (48417d69-...)                 │
             https://supabase-muhen.        └───────────────────────────────►│ Container 112 (cloudfared)
             danfamily.uk                                                    │            │
                                                                             │            ▼ HTTP (intern)
                                                                             │ Container 117 (supabase-verein)
                                                                             │ Port 8000 (Kong/Envoy / REST / Auth)
```

* **Öffentliche HTTPS-URL:** `https://supabase-muhen.danfamily.uk` (SSL über Cloudflare Edge Zürich/Amsterdam).
* **Interner Proxmox-Host:** Medion (`192.168.68.61`).
* **Supabase-Container:** LXC `117` (`supabase-verein`), interner Port `8000`, automatischer Start (`onboot: 1`).
* **Tunnel-Container:** LXC `112` (`cloudfared`), Tunnel-Name `proxmox`.
* **Zero-Downtime:** Bestehende Tunnel-Verbindungen (PVE, Home Assistant, Immich, Jellyfin etc.) bleiben vollständig isoliert und unberührt.

---

## 3. Rollen- & Berechtigungsmodell (Entkoppeltes RBAC)

Um die Vereinsorganisation zukunftssicher und flexibel abzubilden, setzt Supabase auf ein **dreistufiges, entkoppeltes Berechtigungsmodell**:

```text
Benutzer (auth.users)
   │
   ▼ viele-zu-viele (public.user_roles)
Rollen (app_role: vorstand, kassier, vermieter, member ...)
   │
   ▼ viele-zu-viele (public.role_permissions)
Granulare Berechtigungen / Aktionen (vermietung.approve, anlaesse.manage, members.edit ...)
   │
   ├────────► Backend (RLS-Policies prüfen auth.has_permission())
   │
   └────────► Frontend (UI blendet Buttons/Module dynamisch ein/aus)
```

### 3.1 Vorteile dieses Modells für den Verein

1. **Multi-Rollen-Vererbung:**  
   Ein Benutzer kann beliebig viele Rollen haben (z. B. `vorstand` + `kassier`). Er erhält automatisch die **Summe (Union) aller Berechtigungen** aus beiden Rollen.
2. **Aktionsbasierte Granularität (nicht nur „Modul sichtbar“):**  
   Rechte werden nicht pauschal pro Modul vergeben, sondern nach konkreten Aktionen differenziert (z. B. Anzeigen vs. Genehmigen vs. Vertrag erzeugen).
3. **Reine Konfigurationsänderung bei Organisationsanpassungen:**  
   Wenn künftig der Kassier Vermietungen freigeben darf oder der Schützenmeister Zugriff auf Rechnungen erhält, ist das **eine einzige Zeile in `role_permissions`** – weder Programmcode im Frontend noch RLS-Policies in der Datenbank müssen angepasst werden.
4. **Harte Backend-Erzwingung via RLS:**  
   Der Schutz greift direkt in PostgreSQL. Selbst wenn im Frontend ein Button manipuliert wird, blockiert Supabase den Zugriff auf Tabellenebene.

---

### 3.2 Tabellenstrukturen: `user_roles` & `role_permissions`

```sql
-- 1. Rollen-Katalog
CREATE TYPE app_role AS ENUM (
    'admin',              -- System-Administrator (Wildcard-Rechte)
    'vorstand',           -- Vorstandsmitglied (allgemeine Führungsaufgaben)
    'schuetzenmeister',   -- Schiessbetrieb, Teams, Resultate
    'aktuar',             -- Protokolle, Korrespondenz, Anlässe
    'kassier',            -- Finanzen, Rechnungen, Buchhaltung
    'vermieter',          -- Schützenhaus-Vermietung
    'materialwart',       -- Vereinsinventar & Waffen/Material
    'member'              -- Angemeldetes Vereinsmitglied
);

-- 2. Benutzer-zu-Rollen Zuordnung (Source of Truth)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_user_role UNIQUE (user_id, role)
);

-- 3. Rollen-zu-Berechtigungen Zuordnung (Konfigurations-Matrix)
CREATE TABLE public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role app_role NOT NULL,
    permission VARCHAR(100) NOT NULL,                  -- z.B. 'vermietung.approve', 'members.view'
    description TEXT,
    CONSTRAINT uq_role_permission UNIQUE (role, permission)
);

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_role_permissions_lookup ON public.role_permissions(role, permission);
```

---

### 3.3 Beispiel: Granulare Berechtigungs-Matrix

| Modul | Granulare Berechtigung | admin | vorstand | vermieter | kassier | member |
|:------|:-----------------------|:-----:|:--------:|:---------:|:-------:|:------:|
| **Vermietung** | `vermietung.view` (Buchungen einsehen) | ✓ | ✓ | ✓ | ✓ | – |
| | `vermietung.create` (Manuelle Erfassung) | ✓ | ✓ | ✓ | – | – |
| | `vermietung.edit` (Daten korrigieren) | ✓ | ✓ | ✓ | – | – |
| | `vermietung.approve` (Buchung bestätigen / Kalender eintragen) | ✓ | ✓ | ✓ | – | – |
| | `vermietung.cancel` (Stornieren / Ablehnen) | ✓ | ✓ | ✓ | – | – |
| | `vermietung.contract` (Vertrags-PDF generieren / Paperless) | ✓ | ✓ | ✓ | ✓ | – |
| **Anlässe** | `anlaesse.view_public` (Öffentliche Anlässe) | ✓ | ✓ | ✓ | ✓ | ✓ |
| | `anlaesse.view_internal` (Interne Vereinsanlässe) | ✓ | ✓ | ✓ | ✓ | ✓ |
| | `anlaesse.manage` (Erstellen, Ändern, Absagen) | ✓ | ✓ | – | – | – |
| | `anlaesse.rsvp_self` (Eigene An-/Abmeldung) | ✓ | ✓ | ✓ | ✓ | ✓ |
| | `anlaesse.rsvp_all` (Teilnehmerliste verwalten) | ✓ | ✓ | – | – | – |
| **Mitglieder** | `members.view` (Stammdaten lesen) | ✓ | ✓ | – | ✓ | – |
| | `members.edit` (Stammdaten mutieren) | ✓ | ✓ | – | – | – |
| | `members.export` (Listen exportieren) | ✓ | ✓ | – | ✓ | – |
| **Finanzen** | `finanzen.rechnungen` (Fakturierung) | ✓ | ✓ | – | ✓ | – |
| | `finanzen.buchhaltung` (Journal & Kontenrahmen) | ✓ | – | – | ✓ | – |

---

### 3.4 JWT Custom Claims als performanter RLS-Cache

Damit Datenbank-Abfragen nicht bei jedem SELECT-Befehl Joins über `user_roles` und `role_permissions` ausführen müssen, synchronisiert ein **Auth Hook / Trigger** beim Erstellen oder Refreshen des Access Tokens die Rollen und effektiven Berechtigungen in das JWT:

```json
{
  "sub": "b2c918e0-...",
  "app_metadata": {
    "roles": ["vorstand", "kassier"],
    "permissions": [
      "vermietung.view",
      "vermietung.contract",
      "anlaesse.view_public",
      "anlaesse.view_internal",
      "anlaesse.manage",
      "anlaesse.rsvp_self",
      "anlaesse.rsvp_all",
      "members.view",
      "members.edit",
      "members.export",
      "finanzen.rechnungen",
      "finanzen.buchhaltung"
    ]
  }
}
```

> **Sicherheits-Grundsatz:**  
> - `user_roles` und `role_permissions` in der PostgreSQL-Datenbank sind die **Wahrheit**.  
> - Das JWT ist ein **Cache**.  
> - Bei Entzug einer Berechtigung oder Rolle wird diese sofort in der DB gelöscht. Bei kritischen Aktionen (oder bei Token-Ablauf nach typischerweise 60 Minuten) greift automatisch der aktuelle Stand.

---

### 3.5 SQL-Hilfsfunktionen für RLS

Policies prüfen künftig direkt auf **Berechtigungen**, nicht auf starre Rollennamen:

```sql
-- Prüft, ob der angemeldete Benutzer eine bestimmte Berechtigung besitzt
CREATE OR REPLACE FUNCTION auth.has_permission(required_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (
    -- 1. Schneller Check im JWT Cache
    COALESCE(
      (auth.jwt() -> 'app_metadata' -> 'permissions')::jsonb ? required_permission,
      false
    )
    OR
    -- 2. Fallback / Source of Truth aus DB (inklusive Admin-Wildcard)
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = auth.uid()
        AND (rp.permission = required_permission OR rp.role = 'admin')
    )
  );
$$;

-- Prüft, ob der Benutzer MINDESTENS EINE der Berechtigungen besitzt
CREATE OR REPLACE FUNCTION auth.has_any_permission(required_permissions text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (
    COALESCE(
      (auth.jwt() -> 'app_metadata' -> 'permissions')::jsonb ?| required_permissions,
      false
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = auth.uid()
        AND (rp.permission = ANY(required_permissions) OR rp.role = 'admin')
    )
  );
$$;
```

---

### 3.6 Verwendung im Frontend

Das Frontend erhält beim Login das Token mit dem `permissions`-Array. Anstatt zu prüfen `if (user.role === 'vorstand')` prüft das Frontend:

```javascript
// Berechtigungsprüfung im Frontend (z.B. vorstand/js/main.js)
if (auth.hasPermission('vermietung.approve')) {
    document.getElementById('btn-approve-booking').classList.remove('d-none');
} else {
    document.getElementById('btn-approve-booking').classList.add('d-none');
}
```

Wird die Berechtigung in der DB geändert, passt sich das Frontend bei der nächsten Anmeldung sofort an, **ohne dass eine einzige Zeile JavaScript-Code angefasst werden muss**.

---

### 3.7 Migration der Passwörter

- Die unsicheren Klartext- und unsalted SHA-256-Passwörter aus den Google Sheets werden **nicht** in Supabase übernommen.
- Vorstandsmitglieder und Funktionäre erhalten Einladungs-Links (`supabase.auth.admin.inviteUserByEmail()`) zur initialen Passwortvergabe (bcrypt).
- Mitglieder können sich künftig über Magic-Link oder mit ihrer E-Mail und einem neuen Passwort anmelden.

---

## 4. Datenmodell & Tabellenstrukturen

### Basistypen & Enums

```sql
-- Status für Vermietungsanfragen
CREATE TYPE rental_status AS ENUM (
    'inquiry',          -- Neue unverbindliche Anfrage über Website
    'in_review',        -- In Prüfung durch Vermieter (Verfügbarkeit/Kriterien)
    'approved',         -- Genehmigt, Vertrag wird/ist erstellt
    'contract_sent',    -- Mietvertrag an Mieter versandt
    'confirmed',        -- Mieter hat unterschrieben / bestätigt
    'paid',             -- Rechnung / Mietgebühr bezahlt
    'completed',        -- Anlass abgeschlossen, Abrechnung erledigt
    'rejected',         -- Durch Verein abgelehnt
    'cancelled'         -- Durch Mieter storniert
);

-- Status für Dokumenten-Archivierung
CREATE TYPE archive_sync_status AS ENUM (
    'not_applicable',
    'pending',
    'archived',
    'error'
);

-- Status für Anmeldungen / RSVP
CREATE TYPE rsvp_status AS ENUM (
    'attending',        -- Nimmt teil
    'declined',         -- Nimmt nicht teil
    'tentative',        -- Unsicher / provisorisch
    'waiting_list'      -- Warteliste
);
```

---

### Mitglieder-Stammdaten (Read-Replica)

Die Tabelle `public.members` dient in den Phasen 0 bis 5 als **Read-Replica** der Google-Sheets-Masterdaten. Der Primärschlüssel ist die offizielle SSV-Personennummer (`person_number`), die als globaler Fremdschlüssel für alle Module fungiert.

```sql
CREATE TABLE public.members (
    person_number INTEGER PRIMARY KEY,                 -- SSV-Personennummer (z.B. 123456)
    address_number VARCHAR(20),                        -- Adressnummer / ehem. PIN
    salutation VARCHAR(20),                            -- Anrede
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company VARCHAR(150),
    street VARCHAR(150),
    post_code VARCHAR(20),
    city VARCHAR(100),
    country VARCHAR(10) DEFAULT 'CH',
    email VARCHAR(255),
    additional_email VARCHAR(255),
    phone_mobile VARCHAR(50),
    phone_landline VARCHAR(50),
    birth_date DATE,
    gender VARCHAR(10),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_passive BOOLEAN NOT NULL DEFAULT false,
    is_honorary BOOLEAN NOT NULL DEFAULT false,
    club_entry_date DATE,
    club_exit_date DATE,
    ssv_licence_active BOOLEAN DEFAULT false,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Verknüpfung mit Login
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_members_name ON public.members(last_name, first_name);
CREATE INDEX idx_members_email ON public.members(email);
CREATE INDEX idx_members_auth_user ON public.members(auth_user_id);
```

---

### Pilotmodul: ANLÄSSE (Event-Management & Controlling)

Das Modul `ANLÄSSE` wird als erstes Fachmodul vollständig nativ in Supabase aufgebaut (gemäss Projektauftrag Punkte 12–17). Es deckt nicht nur die Event-Ausschreibung ab, sondern fungiert als vollständiges operatives Planungs-, Festwirtschafts- und Controlling-Werkzeug:

```sql
-- 1. Haupttabelle Anlässe & Vorlagen (Punkte 12, 13, 15)
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    location VARCHAR(200) NOT NULL DEFAULT 'Schiessanlage Muhen',
    manager_name VARCHAR(150),                          -- Verantwortlicher (Name)
    manager_id UUID REFERENCES auth.users(id),          -- Verknüpfter Benutzer
    expected_visitors INTEGER NOT NULL DEFAULT 0,       -- Erwartete Besucher für Mengenplanung
    status VARCHAR(50) NOT NULL DEFAULT 'draft',        -- 'draft', 'planned', 'active', 'completed', 'cancelled'
    budget NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    is_template BOOLEAN NOT NULL DEFAULT false,         -- True = Dient als Vorlage (z.B. '1.-August-Feier')
    template_name VARCHAR(100),
    is_public BOOLEAN NOT NULL DEFAULT false,           -- Auf öffentlicher Vereins-Website anzeigen
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Mengen- & Artikelplanung (Punkte 13 & 14)
-- Formel: erwartete Besucher × Menge pro Besucher × Sicherheitsfaktor = empfohlene Bestellmenge
CREATE TABLE public.event_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL DEFAULT 'Festwirtschaft',
    item_name VARCHAR(150) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'Stk',
    cost_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,     -- Einkaufspreis
    sales_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,    -- Verkaufspreis
    qty_per_visitor NUMERIC(8,3) NOT NULL DEFAULT 0.000,-- Menge pro Besucher
    safety_factor NUMERIC(5,2) NOT NULL DEFAULT 1.10,   -- Sicherheitsfaktor (Standard 1.10 = +10%)
    recommended_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,-- Errechnete Empfehlung
    order_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,      -- Tatsächliche Bestellmenge (übersteuerbar)
    actual_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,     -- Tatsächlich gelieferte Menge
    sold_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,       -- Verkaufte Menge
    remaining_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,  -- Restmenge
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Lieferanten-Bestellungen (Punkt 13)
CREATE TABLE public.event_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    supplier_name VARCHAR(150) NOT NULL,                -- Lieferant
    supplier_contact VARCHAR(200),
    item_id UUID REFERENCES public.event_items(id) ON DELETE SET NULL,
    item_description VARCHAR(200) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    unit VARCHAR(50) NOT NULL DEFAULT 'Stk',
    total_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    order_date DATE,
    delivery_date DATE,
    delivery_time TIME,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Vorbereitung & Checklisten (Punkt 13)
CREATE TABLE public.event_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    phase VARCHAR(50) NOT NULL DEFAULT 'Vorbereitung',  -- 'Vorbereitung', 'Einkauf', 'Aufbau', 'Durchführung', 'Abbau', 'Nachbereitung'
    task VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(150),
    assigned_user_id UUID REFERENCES auth.users(id),
    due_date DATE,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Helfer / Stände / Schichten (Punkt 13)
CREATE TABLE public.event_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    area VARCHAR(100) NOT NULL,                         -- Bereich/Stand (z.B. 'Grill', 'Ausschank', 'Kasse', 'Standblattbüro')
    role_name VARCHAR(100) NOT NULL,                    -- Funktion (z.B. 'Grillmeister', 'Service', 'Kassier', 'Schiessleiter')
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    required_helpers INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Helfer-Zuordnungen & Bestätigung durch Mitglieder (Punkt 13)
CREATE TABLE public.event_shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES public.event_shifts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),             -- Verknüpftes Login-Konto
    helper_name VARCHAR(150) NOT NULL,
    helper_email VARCHAR(255),
    helper_phone VARCHAR(50),
    confirmed_by_helper BOOLEAN NOT NULL DEFAULT false, -- Mitglied hat Einsatz bestätigt
    confirmation_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Event-Controlling (Punkt 16) – Berechneter View
CREATE OR REPLACE VIEW public.v_event_controlling AS
WITH item_stats AS (
    SELECT event_id,
        COALESCE(SUM(order_qty * cost_price), 0.00) AS total_planned_cost,
        COALESCE(SUM(actual_qty * cost_price), 0.00) AS total_actual_cost,
        COALESCE(SUM(order_qty * sales_price), 0.00) AS total_planned_revenue,
        COALESCE(SUM(sold_qty * sales_price), 0.00) AS total_actual_revenue
    FROM public.event_items GROUP BY event_id
),
shift_stats AS (
    SELECT s.event_id,
        COALESCE(SUM(
            ROUND(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0, 2) *
            (SELECT COUNT(*) FROM public.event_shift_assignments a WHERE a.shift_id = s.id)
        ), 0.00) AS total_helper_hours
    FROM public.event_shifts s GROUP BY s.event_id
)
SELECT e.id AS event_id, e.name AS event_name, e.event_date, e.status, e.budget, e.expected_visitors,
    COALESCE(i.total_planned_cost, 0.00) AS planned_cost,
    COALESCE(i.total_actual_cost, 0.00) AS actual_cost,
    COALESCE(i.total_planned_revenue, 0.00) AS planned_revenue,
    COALESCE(i.total_actual_revenue, 0.00) AS actual_revenue,
    (COALESCE(i.total_actual_revenue, 0.00) - COALESCE(i.total_actual_cost, 0.00)) AS gross_margin,
    COALESCE(s.total_helper_hours, 0.00) AS total_helper_hours,
    CASE WHEN COALESCE(s.total_helper_hours, 0) > 0 THEN
        ROUND((COALESCE(i.total_actual_revenue, 0.00) - COALESCE(i.total_actual_cost, 0.00)) / s.total_helper_hours, 2)
    ELSE 0.00 END AS margin_per_helper_hour
FROM public.events e
LEFT JOIN item_stats i ON i.event_id = e.id
LEFT JOIN shift_stats s ON s.event_id = e.id;

-- 8. Vorlage duplizieren (Punkt 15)
-- public.create_event_from_template(template_id, new_name, new_date, new_visitors)
-- Dupliziert Event, skaliert alle Artikel mit neuem Besucherfaktor und kopiert Checklisten & Schichten.
```

#### Frontend-Integration: Modul ANLÄSSE im Vorstand-Portal

Das Modul ist im bestehenden Vorstand-Portal (`vorstand/`) nahtlos als eigenständiger Bereich **„Anlässe & Controlling“** integriert:

* **[vorstand/js/supabase-client.js](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/supabase-client.js):** Initialisiert `@supabase/supabase-js` mit dem öffentlichen `ANON_KEY` und Host `https://supabase-muhen.danfamily.uk` (via Cloudflare Tunnel).
* **[vorstand/js/anlaesse.js](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/anlaesse.js):** Enthält 6 interaktive Funktions-Tabs:
  1. **📅 Übersicht & Anlässe (Punkte 12 & 13):** Filter nach Status (`Geplant`, `Aktiv`, `Abgeschlossen`, `Vorlagen`), Suche, Metadatenkarten, Neuerfassung und Duplizierung aus Vorlagen.
  2. **⚖️ Mengenrechner & Artikelplanung (Punkte 13 & 14):** Formel $\text{Menge} = \text{Besucher} \times \text{Menge/Besucher} \times \text{Sicherheitsfaktor}$. Echtzeit-Neuberechnung bei Besucheränderung und Soll/Ist-Vergleich (bestellt, geliefert, verkauft, Rest).
  3. **🛒 Bestellwesen & Lieferanten (Punkt 13):** Lieferanten-Bestellungen mit Lieferterminen, Mengenkontingenten und Status (`draft`, `ordered`, `confirmed`, `delivered`, `cancelled`).
  4. **✅ Checklisten & Vorbereitung (Punkt 13):** Phasenbasierte Vorbereitung (`Vorbereitung`, `Einkauf`, `Aufbau`, `Durchführung`, `Abbau`, `Nachbereitung`) mit interaktiven Checkboxen, Fälligkeit und Prioritäten.
  5. **👥 Helfer & Stände / Schichten (Punkt 13):** Stand- und Schichtplan (Grill, Ausschank, Kasse), Soll- vs. Ist-Besetzung, Zuweisung von Helfern und Bestätigungs-Workflow.
  6. **📊 Event-Controlling & Marge (Punkt 16):** Anbindung an PostgreSQL View `v_event_controlling`, 4 KPI-Kacheln (Soll-/Ist-Kosten, Einnahmen, Bruttomarge, Deckungsbeitrag pro Helferstunde).
* **[vorstand/index.html](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/index.html) & [vorstand/js/main.js](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/main.js):** Sidebar-Navigation, Dashboard-Kachel, View-Container `#view-anlaesse` und Einbindung in `navTo('anlaesse')` sowie `hasWriteAccess`.

---

### Fachmodul: VERMIETUNG (Phase 3 – Abgeschlossen)

Die Vermietungsverwaltung für Schützenstube und Schützenhaus wurde als erstes operatives Altsystem erfolgreich migriert.

#### Architektur & Aufgabenteilung (Hybridbetrieb):
* **Supabase PostgreSQL (Master-Datenbank):**
  * Hält alle Buchungen (`rental_requests`), Statusabläufe (`rental_status_logs`), Storno-Feedbacks (`rental_cancellation_feedbacks`), Tarife (`rental_pricing`) und dynamische Konfigurationen (`rental_settings`).
  * Keine Hartcodierung: Mietpreise (Standard CHF 300.-), Vorlagen-ID (`1j6s4pq0dOHyF0Viko_uDfhbTwO5pPCX_ZYfu6nC0N-o`), IBAN, Absender- und Wirtschaftsdaten werden dynamisch verwaltet.
* **Google Apps Script & Google Calendar (Ausführungs-Dienstleister):**
  * Belegungs-Master & Concurrency-Schutz: Miettermin ganztägig belegt, Folgetag automatisch als Reinigungspuffer gesperrt; Freigabe bei Stornierung.
  * PDF-Mietvertrag: Erstellung mit amtlicher Schweizer QR-Rechnung (SPC 0200 1) via Google Doc Template.
  * E-Mail-Versand: Versand von Vertrag, Mahnung, Schlüsselübergabe, Storno-Mail mit Feedbacklink und Wirtschafts-Benachrichtigung.
  * E-Banking Scan: `raiffeisen.js` scannt automatische Gutschrifts-Mails der Raiffeisenbank im Gmail-Label `Raiffeisen` und stößt automatische Zahlungsbestätigung an.
* **Automatischer Abgleich & Schutz vor Doppelversand:**
  * Mails werden ausschließlich über definierte Workflow-Trigger versendet.
  * Das Vorstand-Portal (`vorstand/js/vermietung/`) prüft vor Mailaktionen (z. B. Mahnung, Schlüsselübergabe), ob diese bereits versandt wurden, und gleicht im Hintergrund neue Raiffeisen-Zahlungseingänge automatisch nach Supabase ab.
  * Bereinigt: Clubdesk-Export und WhatsApp/CallMeBot wurden vollständig entfernt.

```sql
-- 1. Dynamische Einstellungen (100% ohne Hartcodierung)
CREATE TABLE public.rental_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tarife & Mietpreise
CREATE TABLE public.rental_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_code VARCHAR(50) UNIQUE NOT NULL,           -- 'standard_tag', 'mitglied_rabatt', 'abend'
    description VARCHAR(150) NOT NULL,
    base_price_chf NUMERIC(10,2) NOT NULL,
    cleaning_fee_chf NUMERIC(10,2) DEFAULT 0.00,
    deposit_chf NUMERIC(10,2) DEFAULT 200.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Sequenz & Trigger für automatische Buchungsnummern (V-YYYY-XXXX / A-YYYY-XXXX)
CREATE SEQUENCE public.rental_booking_seq START WITH 100;

-- 4. Buchungen & Anfragen
CREATE TABLE public.rental_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_number VARCHAR(30) UNIQUE NOT NULL,
    is_inquiry BOOLEAN NOT NULL DEFAULT false,
    inquiry_type VARCHAR(50),
    inquiry_note TEXT,
    
    -- Mietzeitraum
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    festbeginn VARCHAR(50),
    
    -- Mieter- / Kundendaten
    salutation VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    street VARCHAR(150) NOT NULL,
    post_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    
    -- Finanzen
    pricing_id UUID REFERENCES public.rental_pricing(id),
    total_amount_chf NUMERIC(10,2) NOT NULL DEFAULT 300.00,
    deposit_amount_chf NUMERIC(10,2) DEFAULT 200.00,
    is_paid BOOLEAN DEFAULT false,
    
    -- Status & Workflow
    status public.rental_status NOT NULL DEFAULT 'contract_sent',
    rejection_reason TEXT,
    cancellation_reason TEXT,
    
    -- Zeitstempel & Protokolle
    datum_vertrag DATE,
    datum_mahnung DATE,
    datum_schluessel DATE,
    datum_storno DATE,
    datum_raiffeisen DATE,
    status_raiffeisen VARCHAR(100),
    kommentar_raiffeisen TEXT,
    mail_wirtschaft_sent_at TIMESTAMPTZ,
    
    -- Externe Verknüpfungen
    google_calendar_event_id VARCHAR(255),
    contract_file_url TEXT,
    paperless_status public.archive_sync_status NOT NULL DEFAULT 'not_applicable',
    paperless_document_id INTEGER,
    
    admin_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_by UUID REFERENCES auth.users(id)
);

-- 5. Status-Historie & Audit-Trail (automatischer Trigger)
CREATE TABLE public.rental_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_request_id UUID NOT NULL REFERENCES public.rental_requests(id) ON DELETE CASCADE,
    previous_status public.rental_status,
    new_status public.rental_status NOT NULL,
    comment TEXT,
    changed_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Storno-Rückmeldungen mit Alarmfunktion
CREATE TABLE public.rental_cancellation_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_request_id UUID REFERENCES public.rental_requests(id) ON DELETE SET NULL,
    booking_number VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    remarks TEXT,
    is_urgent BOOLEAN DEFAULT false,                    -- true bei "Zahlung bereits getätigt"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rentals_dates ON public.rental_requests(start_date, end_date);
CREATE INDEX idx_rentals_status ON public.rental_requests(status);
CREATE INDEX idx_rentals_vnr ON public.rental_requests(booking_number);
CREATE INDEX idx_rental_logs_req ON public.rental_status_logs(rental_request_id);
```


---

## 5. Sicherheitsmodell & Row-Level Security (RLS)

Alle Tabellen laufen unter aktiviertem RLS. **Entscheidender Vorteil des neuen RBAC-Modells:** Die RLS-Policies prüfen nicht mehr auf starre Rollennamen, sondern auf **granulare Aktionen / Berechtigungen** (`auth.has_permission()`). 

Ändert sich die Vereinsorganisation (z. B. "Kassier darf ab sofort Vermietungen genehmigen"), muss **keine einzige RLS-Policy angefasst werden**, sondern lediglich ein Datensatz in `public.role_permissions`.

### 5.1 Policies für `public.events` & Fachmodul ANLÄSSE

Alle Tabellen des Fachmoduls sind durch RLS geschützt. Im Zielmodell steuern Berechtigungen (`anlaesse.view_internal`, `anlaesse.manage`, `anlaesse.rsvp_all`) den Zugriff. Für die Übergangs- und Entwicklungsphase im Vorstand-Portal (`03_anon_dev_policies.sql`) ist der Zugriff über den öffentlichen `ANON_KEY` freigeschaltet:

```sql
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_shift_assignments ENABLE ROW LEVEL SECURITY;

-- 1. ANLÄSSE (public.events):
-- Öffentliche Anlässe für alle (auch Website-Gäste); interne für Vereinsmitglieder
CREATE POLICY "events_select_policy" ON public.events
    FOR SELECT TO authenticated, anon
    USING (
        is_public = true
        OR auth.has_permission('anlaesse.view_internal')
        OR auth.has_permission('anlaesse.manage')
    );

CREATE POLICY "events_manage_policy" ON public.events
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- 2. MENGEN- & ARTIKELPLANUNG (public.event_items):
CREATE POLICY "event_items_select_policy" ON public.event_items
    FOR SELECT TO authenticated
    USING (auth.has_permission('anlaesse.view_internal') OR auth.has_permission('anlaesse.manage'));

CREATE POLICY "event_items_manage_policy" ON public.event_items
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- 3. LIEFERANTEN-BESTELLUNGEN (public.event_orders):
CREATE POLICY "event_orders_manage_policy" ON public.event_orders
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- 4. CHECKLISTEN (public.event_checklists):
CREATE POLICY "event_checklists_select_policy" ON public.event_checklists
    FOR SELECT TO authenticated
    USING (auth.has_permission('anlaesse.view_internal') OR auth.has_permission('anlaesse.manage'));

CREATE POLICY "event_checklists_manage_policy" ON public.event_checklists
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- 5. SCHICHTEN & HELFER (public.event_shifts & public.event_shift_assignments):
CREATE POLICY "event_shifts_select_policy" ON public.event_shifts
    FOR SELECT TO authenticated
    USING (auth.has_permission('anlaesse.view_internal') OR auth.has_permission('anlaesse.manage'));

CREATE POLICY "event_shift_assign_select_policy" ON public.event_shift_assignments
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR auth.has_permission('anlaesse.manage')
        OR auth.has_permission('anlaesse.rsvp_all')
    );

-- Helfer dürfen ihre eigene Schicht bestätigen
CREATE POLICY "event_shift_assign_self_confirm" ON public.event_shift_assignments
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 6. ENTWICKLUNGS- & ÜBERGANGSPOLICIES (03_anon_dev_policies.sql):
-- Ermöglicht die nahtlose Nutzung des Moduls im Vorstand-Portal mit ANON_KEY
CREATE POLICY "events_anon_manage" ON public.events FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "event_items_anon_manage" ON public.event_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "event_orders_anon_manage" ON public.event_orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "event_checklists_anon_manage" ON public.event_checklists FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "event_shifts_anon_manage" ON public.event_shifts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "event_shift_assignments_anon_manage" ON public.event_shift_assignments FOR ALL TO anon USING (true) WITH CHECK (true);
```

### 5.2 Policies für `public.rental_requests` (Vermietung)

```sql
ALTER TABLE public.rental_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_status_logs ENABLE ROW LEVEL SECURITY;

-- 1. ANFRAGE ERSTELLEN (Public):
-- Jeder (auch anonymer Gast auf der Vereins-Website) darf eine Mietanfrage einreichen
CREATE POLICY "Anyone can submit a rental inquiry" ON public.rental_requests
    FOR INSERT TO public
    WITH CHECK (status = 'inquiry');

-- 2. EIGENE ANFRAGE EINSEHEN (Kunde / Mieter):
-- Mieter können ihre eigene Buchung über ihre E-Mail oder verknüpfte Personennummer einsehen
CREATE POLICY "Customers can view own rental inquiry" ON public.rental_requests
    FOR SELECT TO authenticated
    USING (
        email = (auth.jwt() ->> 'email')
        OR
        person_number IN (SELECT person_number FROM public.members WHERE auth_user_id = auth.uid())
    );

-- 3. VERMIETUNG ANZEIGEN ('vermietung.view'):
-- Wer die Leseberechtigung besitzt (z. B. Vorstand, Vermieter, Kassier), darf alle Anfragen sehen
CREATE POLICY "View all rentals based on permission" ON public.rental_requests
    FOR SELECT TO authenticated
    USING (auth.has_permission('vermietung.view'));

-- 4. VERMIETUNG BEARBEITEN & GENEHMIGEN ('vermietung.edit' oder 'vermietung.approve'):
-- Änderungen an Status, Daten, Preisen oder Zusage erfordern die entsprechende Aktionsberechtigung
CREATE POLICY "Manage rentals based on permission" ON public.rental_requests
    FOR UPDATE TO authenticated
    USING (auth.has_any_permission(ARRAY['vermietung.edit', 'vermietung.approve', 'vermietung.cancel']))
    WITH CHECK (auth.has_any_permission(ARRAY['vermietung.edit', 'vermietung.approve', 'vermietung.cancel']));

-- 5. MANUELLE ERFASSUNG ('vermietung.create'):
-- Berechtigte Benutzer dürfen Buchungen auch direkt intern anlegen
CREATE POLICY "Staff can create rental requests" ON public.rental_requests
    FOR INSERT TO authenticated
    WITH CHECK (auth.has_permission('vermietung.create'));

-- 6. STATUS-LOGS:
CREATE POLICY "View status logs based on permission" ON public.rental_status_logs
    FOR SELECT TO authenticated
    USING (auth.has_permission('vermietung.view'));

CREATE POLICY "Insert status logs on change" ON public.rental_status_logs
    FOR INSERT TO authenticated
    WITH CHECK (auth.has_any_permission(ARRAY['vermietung.edit', 'vermietung.approve', 'vermietung.cancel']));
```

---

## 6. Integrations- & Schnittstellen-Architektur

### 6.1 Google Calendar (Belegungs-Master)

Um Konflikte und komplexe Zwei-Wege-Synchronisationen zu vermeiden, bleibt Google Calendar die unangefochtene **Source of Truth für die tatsächliche physische Belegung** des Schützenhauses.

```text
[Mieter auf Website] 
        │ 1. Anfrageformular absenden
        ▼
[Cloudflare Worker / Supabase]
        │ 2. Frei-/Belegt-Prüfung via Google Calendar API (FreeBusy Query)
        ├──────► Zeitraum belegt? → Meldung an Mieter im Frontend
        │
        │ 3. Datensatz in public.rental_requests anlegen (status: 'inquiry')
        ▼
[Vermieter im Vorstand-Portal]
        │ 4. Prüfen & Genehmigen (status: 'approved' / 'confirmed')
        │
        ├───► A: Google Calendar API erzeugt definitiven Kalender-Termin
        │        Termin-ID wird in rental_requests.google_calendar_event_id gespeichert
        │
        └───► B: Mietvertrag wird generiert & versandt
```

**Kalenderanzeige in Mitglieder-App & Website:**  
Beide Frontends lesen weiterhin die Belegungsinformationen über den bestehenden Cloudflare-Worker aus Google Calendar. Eine Speicherung der rohen Kalenderereignisse in Supabase ist nicht notwendig.

---

### 6.2 Dokumentenfluss: Supabase Storage & Paperless-NGX

Für Mietverträge, Rechnungen und Dokumente wird eine zweistufige Speicherstrategie angewendet:

```text
[Buchung bestätigt]
        │
        ▼
1. PDF-Mietvertrag generieren (jsPDF / PDFKit)
        │
        ▼
2. Speicherung in Supabase Storage
   Bucket: 'vermietungen'
   Pfad: '2026/MIETE-2026-0042_Vertrag.pdf'
        │
        ▼
3. Datensatz in public.rental_requests aktualisieren:
   - contract_storage_path = '2026/MIETE-2026-0042_Vertrag.pdf'
   - paperless_status = 'pending'
        │
        ▼ (asynchroner Prozess / Worker / Edge Function)
4. Paperless-NGX REST API aufrufen:
   POST /api/documents/post_document/ (PDF-Stream + Tags + Korrespondent)
        │
        ├──► Erfolg (200/201):
        │    - paperless_status = 'archived'
        │    - paperless_document_id = <ID>
        │
        └──► Fehler (Timeout/Server down):
             - paperless_status = 'error'
             - paperless_error_message = <Error Text>
             (Vermietung bleibt voll funktionsfähig; Retry über Cron/Button möglich)
```

**Aufgabenteilung:**
- **Supabase Storage:** Schneller operativer Zugriff, Erzeugung von zeitlich beschränkten Download-Links (Signed URLs) für Mieter und Vorstand.
- **Paperless-NGX:** Revisionssichere Langzeitarchivierung, automatische OCR-Texterkennung, Volltextsuche und Dokumentenhistorie auf dem Proxmox-Server.

---

### 6.3 Mitglieder-Synchronisation (Browser-Native SSV Engine & Dual-Write)

Im Zuge von Phase 4 wurde der bisherige, komplexe GAS-Import durch eine hochperformante, browser-native SSV-Import-Engine abgelöst. Das Frontend übernimmt das Parsen der Verbands-XLSX und die 1:1 Diff-Berechnung im Speicher des Browsers.

```text
                 SCHWEIZER SCHIESSSPORTVERBAND (SSV)
                                │
                                ▼ Offizieller Export
                           XLSX-Datei
                                │
                                ▼ Browser-Upload (Vorstand-Portal)
                 ┌───────────────────────────────────────────┐
                 │  Browser-Native SSV Diff Engine           │
                 │  vorstand/js/mitglieder/                  │
                 │  mitglieder-import-engine.js              │
                 │  - SheetJS Client-Parsing (< 100 ms)      │
                 │  - 1:1 SSV-Regelwerk & Quellschutz        │
                 │  - Lizenz-, Funktions- & Adress-Diff      │
                 └─────────────────────┬─────────────────────┘
                                       │
                      Interaktive Diff-Vorschau & Genehmigung
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        1. SCHREIBEN (Primär)                 2. DUAL-WRITE (Spiegelung)
        Supabase PostgreSQL                   Google Sheet (Test-Kopie)
        supabase-muhen.danfamily.uk           ID: 1GdoopFudDXcmrP-DH8z2Ge_ALG3YDmHybJpXe1HgZQ0
        ├── public.members                    ├── members
        ├── public.member_licenses            ├── memberlicenses
        ├── public.member_functions           ├── memberfunctions
        ├── public.member_training            ├── membertrainings
        └── public.member_history             └── memberaudit
                                                          │
                                                          ▼
                                              Satelliten-Sheets & Module
                                              (Jahresmeisterschaft, Inventar,
                                               Eventplaner, GV-Admin)
```

**Wichtige Test-Konfiguration (Testphase):**
- **Test-Spreadsheet-ID:** `1GdoopFudDXcmrP-DH8z2Ge_ALG3YDmHybJpXe1HgZQ0` (1:1 Arbeitskopie des Vorstands zum ausgiebigen Testen).
- **Produktions-Spreadsheet-ID:** `11G9LdZhghm8U-Dpsv4NOyBg5mm5xlD2nhU10BQNvq3A` (bleibt während der Testphase vollständig unverändert und geschützt).
- **Quellschutz-Garantie:** Manuelle Markierungen (`is_passive_source = 'manual'`, Ehrenmitglieder) werden durch SSV-Imports weder in Supabase noch im Google Sheet überschrieben.

### 6.4 Fachmodul ANLÄSSE & UMFRAGEN (Phase 5 – Abgeschlossen & im Testbetrieb)

Gemäss Architekturentscheidung bleiben das operative Controlling-Modul **ANLÄSSE & Controlling** (`public.events`, Mengenrechner, Bestellungen, Checklisten, Helfer/Schichten) und das RSVP-/Umfragen-Modul **Anlässe & Umfragen** (`public.poll_events`, `public.poll_responses`, `public.poll_views`, `public.poll_responses_log`) als zwei getrennte, eigenständige Module bestehen.

**Architektur-Highlights von Phase 5:**
1. **Eigenständiges PostgreSQL-Schema (`07_eventplaner_module.sql`):**
   - `public.poll_events`: Speichert Umfragen, Schiessanlass-Optionen, Abfrage-Flags und Dokumenten-Links.
   - `public.poll_responses`: Speichert Teilnehmer-RSVPs mit Personenanzahl, Essenswünschen (Fleisch/Vegi), Absagegründen und Termin-Optionen.
   - `public.poll_views`: Verfolgt Aufrufe und Gelesen-Status für Nachfassaktionen.
   - `public.poll_responses_log`: Revisionssicheres Audit-Log aller Statusänderungen.
2. **Vorstand-Cockpit (`vorstand/js/umfragen/`):**
   - Vollständig getrennt von `anlaesse.js` in der Sidebar und Übersicht.
   - Lädt primär aus Supabase (< 50 ms) mit automatischem Fallback auf GAS.
   - Dual-Write ins Google Spreadsheet (`1lN180zraGTBsxxb7uJid7607nLHrBNxmoLjLH8jZWiE`) bei jeder Event-Änderung.
   - 1-Klick-Synchronisation / Import alter Sheet-Daten direkt nach Supabase.
3. **Mitglieder-PWA (`app.js`):**
   - Direkte REST-Abfrage von Supabase mit Stale-While-Revalidate Caching.
   - Schnelle Speicherung von Zu-/Absagen in `poll_responses` und asynchroner Dual-Write an das Google Sheet.

### 6.5 Fachmodul INVENTAR-VERWALTUNG (Phase 7 – Abgeschlossen & im Testbetrieb)

Die Verwaltung des gesamten Vereinsinventars (Sportwaffen, Schlüssel, Vereinskleidung, Schiessbekleidung, Ausleihe mit digitaler Signatur und Kautions-/Pfandkasse) wurde erfolgreich auf Supabase migriert.

**Architektur-Highlights von Phase 7:**
1. **Relationales PostgreSQL-Schema (`08_inventory_module.sql`):**
   - `public.inventory_items`: Einheitliche, relational verknüpfte Tabelle für alle 4 Gegenstandskategorien (`gewehr`, `schluessel`, `kleidung`, `schiessbekleidung`) mit Status (`Im Lager`, `Ausgegeben`, `Verkauft`, `Defekt`) und Fremdschlüssel `current_owner_id` zu `public.members(person_number)`.
   - `public.inventory_transactions`: Lückenloses Buchungsjournal aller Ausleihen (`AUSGABE`), Rücknahmen (`CHECKIN`) und Verkäufe (`VERKAUF`) mit Signaturen, PDF-Quittungs-URL und Zahlungsart.
   - `public.inventory_deposits`: Dediziertes Pfand- und Kautionskassen-Tracking mit Status (`Offen`, `Retour`, `Verrechnet`).
   - `public.inventory_audit_log`: Revisionssicheres Änderungsprotokoll für alle administrativen Mutationen.
   - `public.inventory_config`: Zentrale Konfiguration aller Dropdown-Wertelisten.
2. **Modulares Vorstand-Cockpit (`vorstand/js/inventar/`):**
   - `inventar-core.js`: Lädt alle Daten blitzschnell (< 60 ms) primär aus Supabase und verknüpft Besitzer und Empfänger direkt mit `public.members`. Transparenter Fallback auf Google Apps Script.
   - `inventar-cart.js`: Transaktionen werden sofort in Supabase persistiert (Status-Update der Artikel, Transaction-Insert, Kautionseintrag). Ein paralleler, asynchroner Dual-Write an das alte Google Apps Script hält das bestehende Google Spreadsheet (`183MBGdaNw_qSZdNQPTxui3gsend9pOkpEpC2K3G7O2U`) synchron.
   - `inventar-list.js`: Neuanlage, Bearbeitung und Löschung von Inventargegenständen direkt über Supabase REST.
   - 1-Klick-Import (`syncInventarFromLegacy()`): Ermöglicht den sofortigen Transfer aller bestehenden Gegenstände, Historien und Pfanddaten aus Google Sheets nach Supabase.
3. **Optische Kennzeichnung:**
   - Grüner `Supabase`-Badge in der Sidebar-Navigation und auf der Dashboard-Übersichtskarte.

---

### 6.6 Fachmodul: Jahresprogramm (Termine, Anlässe & Orte)

Die Terminplanung, Schiesstage und Vereinsanlässe sowie die damit verknüpften Austragungsorte mit Google Maps wurden von Google Sheets (`Admin_Generalversammlungen_GAS`, Sheet-ID `1q54RIa3Oo3DT1ONIkAgsvv5-qAhU1UuV0KvLP0f-PyI`) auf Supabase PostgreSQL migriert.

1. **Datenbankmodell (`supabase/migrations/09_termine_module.sql`):**
   - `public.termine`: Speichert alle Vereinstermine und Schiesstage mit Datum, Startzeit, Endzeit, Titel, Ort, Kategorie (`Jahresprogramm`, `Schiesstermine`), Status (`fix`, `provisorisch`, `abgesagt`), Google Maps Link, Typ (`verein`) und `sort_order` für benutzerdefinierte Reihenfolgen.
   - `public.termine_locations`: Stammdaten der Austragungsorte mit Namen und Google Maps URLs, sortierbar per Drag & Drop (`sort_order`).
   - `public.termine_event_types`: Vordefinierte Anlass-Typen zur Vereinheitlichung aller Terminbezeichnungen im Portal, sortierbar per Drag & Drop (`sort_order`).
   - Vollständige RLS-Absicherung mit Authenticated-Policies für Vorstand und Schützenmeister sowie Anon-Dev-Policies für die Website/PWA.
2. **Modulare Frontend-Architektur (`vorstand/js/termine/`):**
   - `termine-core.js`: Supabase-First Laderoutine (< 50 ms) mit automatischem Fallback auf Google Apps Script.
   - **Dual-Write**: Beim Speichern im Vorstand-Portal werden Termine und Stammdaten primär in Supabase aktualisiert und parallel asynchron an Google Apps Script übermittelt. Dadurch bleiben bestehende Google-Docs-Vorlagen (GV-Einladung via `write_termine.js`) und ältere Webhooks zu 100% synchron.
   - **1-Klick-Import (`syncTermineFromLegacy()`):** Bequeme Übernahme aller bestehenden Termine und Orte aus Google Sheets nach Supabase mit einem einzigen Knopfdruck.
   - `termine-ui.js`: Rendering und Interaktion basierend auf dem neuen `TableKit`-Standard.

---

### 6.7 Zentraler UI-Standard: `TableKit` (`vorstand/js/ui-table-kit.js`)

Mit der Migration des Jahresprogramms wurde ein **unternehmensweiter Standard** für interaktive Tabellen und Listen geschaffen, der das Look & Feel über alle Fachmodule hinweg vereinheitlicht:

1. **Spalten-Sortierung (`TableKit.makeSortable`):**
   - Klickbare Spalten-Header mit Sortier-Pfeilen (`↕`, `▲`, `▼`).
   - Automatische Typenerkennung: Schweizer Datumsformate (`DD.MM.YYYY`, `YYYY-MM-DD`), Uhrzeiten (`HH:mm`), Zahlen, Text (inkl. Umlaute mit `de-CH` Collation) sowie Live-Werte von Formularfeldern (`<input>`, `<select>`).
2. **Drag & Drop Verschiebung (`TableKit.makeDraggable`):**
   - Diskreter Griff (`⋮⋮`) an jeder Zeile zum manuellen Reordering.
   - Volle Unterstützung für Desktop (HTML5 Drag & Drop) und Mobilgeräte (Touch-Tracking).
   - Reorder-Callback zur sofortigen Aktualisierung der Daten-Arrays und Unsaved-State-Tracking.
3. **Aus- und Einblendbarkeit & Filter (`TableKit.setupFilter`):**
   - **Status-Pills**: Schnelles Umschalten zwischen z.B. *Alle*, *Nur Fix*, *Provisorisch* und *Abgesagte ausblenden*.
   - **Live-Suche**: Freitextsuche über alle Zeilen und Formularfelder hinweg.
   - **Einklappbare Bereiche (`TableKit.setupCollapsible`):** Akkordeon-artiges Minimieren von Tabellen und Stammdaten-Karten mit Speicherung des Zustands im `localStorage`.
4. **Spalten-Ausblendung (`TableKit.setupColumnToggle`):**
   - Interaktives Dropdown zur vollständigen Ein- und Ausblendung beliebiger Tabellenspalten (Header und Zellen).
   - Persistente Speicherung der Spaltenauswahl im `localStorage`.
   - Zähler-Badge (z.B. `7/7` oder `9/9`).

#### 📌 Nachrüst-Plan für bereits migrierte Module:
Die folgenden Module werden/wurden im Zuge der weiteren Portal-Harmonisierung mit dem zentralen `TableKit`-Standard nachgerüstet:
- [x] **Modul Termine (`vorstand/js/termine/`):** Spaltensortierung, Drag & Drop und Spalten-Ausblender aktiv.
- [x] **Modul Mitglieder (`vorstand/js/mitglieder/`):** Mitglieder- und Adresslisten mit TableKit-Spaltensortierung, Spalten-Ausblender und Status-Pills ausgerüstet.
- [ ] **Modul Inventar (`vorstand/js/inventar/`):** Inventarliste, Pfandkasse und Journal mit Spaltensortierung und Filter-Pills ausrüsten.
- [ ] **Modul Anlässe & Umfragen (`vorstand/js/umfragen/`):** Teilnehmerlisten und Umfragen-Übersicht sortierbar und einklappbar machen.
- [ ] **Modul Vermietung (`vorstand/js/vermietung/`):** Buchungstabelle und Belegungsliste mit Spaltensortierung und Status-Pills versehen.
- [ ] **Modul Anlässe & Controlling (`vorstand/js/anlaesse.js`):** Helferlisten, Mengenrechner und Checklisten per Drag & Drop sortierbar machen.

---

### 6.8 Fachmodul: Mitglieder Write-Master & Status U21 (Phase 8 – Abgeschlossen & im Testbetrieb)

Mit Abschluss von Phase 8 wurde Supabase zum führenden **Write-Master** für die Mitglieder-Stammdaten erhoben:

1. **Umfassende Daten-Mutation direkt in Supabase:**
   - Vorstandsmitglieder können im Tab ✏️ *Bearbeiten* sämtliche Personalien (Vorname, Nachname, Anrede, Geburtsdatum, Geschlecht), Adressdaten (Strasse, PLZ, Ort, E-Mail, Telefon), Vereinsstatus (Passivmitglied mit SSV-Quellschutz, Ehrenmitglied, Ein-/Austritt, Bemerkungen) sowie Bank- und Rechnungsdaten (IBAN, BIC, Kontoinhaber, Rechnungsversand, Nie mahnen) mutieren.
   - Mutationen werden direkt via Supabase REST in `public.members` gespeichert (< 50 ms).
2. **Revisionssicheres Audit-Log (`public.member_history`):**
   - Jede Mutation erzeugt automatisch einen Eintrag in `public.member_history` mit Erfasser, Datum, Vorher-/Nachher-Zusammenfassung und Ereignistyp (`Mutation Vorstand`).
3. **Dual-Write (Abwärtskompatibilität):**
   - Beim Speichern wird parallel asynchron an Google Apps Script (`action=saveVerein`) gespiegelt, sodass bestehende Google Sheets (Jahresbeitrag, alte Skripte) stets synchron bleiben.
4. **Neuanlage (`mglSaveNeu`):**
   - Interne Neuanlagen vergeben automatisch die nächste freie Personennummer ab `990001` und schreiben primär in Supabase mit Dual-Write an Google Sheets.
5. **Alterskategorie Jugend (U21):**
   - Vollständige Integration der SSV-Nachwuchskategorie `Jugend (U21)` (`Kalenderjahr - Geburtsjahr <= 20` oder Nachwuchs-Lizenz).
   - Eigener Status-Filter-Button `Jugend (U21)` in der Filterleiste.
   - Einheitliche optische Kennzeichnung mit `U21`-Badge in Tabelle, Karten und Profilkopf.

### 6.9 Fachmodul: Jahresbeitrag & Beitragsverwaltung (Supabase Master & Dual-Write)

Mit dem Modul Jahresbeitrag wurde die Verbindung zwischen Mitglieder-Stammdaten (`public.members`) und Fakturierung (`public.invoices`) auf Supabase PostgreSQL als führenden Master überführt:

1. **Relationales Datenmodell (`supabase/migrations/11_jahresbeitrag_module.sql`):**
   - `public.contributions_header`: Hält alle Beitragsrechnungen je Mitglied und Jahr mit Gesamtbetrag, Zahlungsstatus, Zahlungsdatum, Zahlungsmethode, Belegreferenz und Fremdschlüssel `invoice_id` zu `public.invoices(id)`.
   - `public.contributions_positions`: Detail-Rechnungspositionen mit Gegenkonto (Haben-Konto für Buchhaltung), Betrag, Positionstyp ('Debit'/'Credit') und Quellenschlüssel.
   - `public.member_participations`: Wettkampfteilnahmen für Beitragsrabatte & Schiessgelder.
   - `public.gebuehren_config`: Dynamische Gebührenordnung (JB001-JB007, LI001-LI003, GE001, Turniere und Zusatzpositionen).
2. **Supabase-First Cockpit (`vorstand/js/jahresbeitrag/`):**
   - `jahresbeitrag-core.js`: Blitzschnelles Laden aller Beitragsrechnungen, Positionen, Turniere und Gebühren direkt via Supabase REST (< 50 ms) mit automatischem Fallback auf GAS.
   - `jahresbeitrag-overview.js`: Direkte Verbuchung von Zahlungen in Supabase, automatische Rechnungsanlage und -verknüpfung in `public.invoices`. TableKit Spaltenausblendung (`TableKit.setupColumnToggle`) in der Beitragsübersicht.
   - `jahresbeitrag-schnellerfassung.js`: Sofortige Speicherung von Teilnahmen und Neuberechnungen in Supabase mit asynchronem Dual-Write an Google Sheets (`Members100_GAS`).
   - `jahresbeitrag-gebuehren.js`: Dynamische Verwaltung der Gebührenordnung direkt in Supabase.
   - **1-Klick-Import (`syncJahresbeitragFromLegacy()`):** Bequeme Übernahme aller bestehenden Beitragsrechnungen, Positionen, Turnierteilnahmen und Gebühren aus Google Sheets nach Supabase mit einem einzigen Knopfdruck.

---

## 6.6 Fachmodul: RESULTATE & WETTKÄMPFE (Phase 12 – Abgeschlossen & im Testbetrieb)

Phase 12 implementiert das vollständige Schiessergebnis-Modul für den Grenzlandcup, die Mannschafts- und Gruppenmeisterschaft.

**Datenbankmodell (`supabase/migrations/12_results_module.sql`):**
- `public.contest_results` – Schiessresultate je Wettbewerb, Jahr, Runde & Schütze (bis zu 3 Runden à 2 Passen; auto-Vererbung via `is_auto_r2`/`is_auto_r3`)
- `public.contest_setups` – Schützen-Zuteilungen aus dem Team Manager (Primärzuteilung je Runde)
- `public.contest_teams` – Konfigurierte Teams je Wettbewerb & Jahr (inkl. `max_shooters`)
- `public.contest_ocr_logs` – Audit-Trail für die KI-gestützte Standblatt-Erkennung (Gemini Vision)

**Besonderheiten:**
- `contest_type` unterscheidet `grenzland`, `mannschaft`, `gruppe`
- Team-Vererbung über Runden hinweg (Standardfall: selbes Team in R2/R3 wie R1)
- Initial-Stammdaten für Saison 2026 (Muhen 1–3 für alle Wettbewerbe)

---

## 6.7 Fachmodul: MAIL-LOG & VERSANDPROTOKOLL (Phase 13 – Abgeschlossen & im Testbetrieb)

Phase 13 ergänzt das System um ein **zentrales, modulübergreifendes E-Mail-Versandprotokoll**. Der tatsächliche Mailversand bleibt vollständig bei Google Apps Script (`MailApp` / `GmailApp`). Supabase übernimmt ausschliesslich die Rolle des Audit-Logs.

**Datenbankmodell (`supabase/migrations/13_mail_module.sql`):**
- `public.mail_logs` – Protokolleintrag je versendeter E-Mail

| Feld | Bedeutung |
|:---|:---|
| `module_ref` | Herkunftsmodul: `rechnung`, `mietvertrag`, `jahresbeitrag`, `mahnung`, `anlasse`, `vermietung`, `mitglieder`, `sonstige` |
| `record_id` | ID des verknüpften Datensatzes (z.B. `RE-26-7K4M`) – kein FK (loose coupling) |
| `recipient_email` / `recipient_name` | Primärer Empfänger |
| `cc_email` | CC-Adressen (kommagetrennt) |
| `subject` / `body_snippet` | Betreff & erste ~500 Zeichen als Vorschau |
| `status` | `gesendet`, `fehler`, `simuliert` |
| `sender_email` / `sender_name` | GAS-Absenderkonto |
| `has_pdf` | Boolean – war ein PDF-Anhang vorhanden? |
| `sent_via` | `GAS_MailApp`, `GAS_GmailApp`, `Supabase_SMTP`, `Resend`, `Test` |
| `sent_at` | Versandzeitpunkt (TIMESTAMPTZ) |

**RPC-Hilfsfunktion:**
GAS-Skripte schreiben nach dem Versand per `supabase.rpc('log_mail_sent', {...})` oder direktem REST-INSERT einen Eintrag. Kein FK-Constraint notwendig – loose coupling zu allen Modulen.

**Frontend-Integration (`vorstand/js/mail.js`, `vorstand/index.html`):**
- Mail-Seite erhielt einen zweiten Tab **«Versandprotokoll»** neben dem bestehenden Verteiler-Tab
- Filter nach Modul, Status und Freitext-Suche (Empfänger/Betreff)
- Lazy Loading: Daten werden erst beim Tab-Klick aus Supabase geladen
- Klick auf Zeile öffnet Detail-Modal (inkl. Body-Vorschau, CC, Fehlerinfo)
- Badge am Tab zeigt Gesamtanzahl der geladenen Log-Einträge

---

## 6.8 Fachmodul: SYSTEM-MAIL-KONFIGURATION (Phase 14 – Abgeschlossen & im Testbetrieb)

Phase 14 überführt alle systemweiten E-Mail-Verteiler und automatischen Benachrichtigungsempfänger (bisher im Google Spreadsheet `App_Info`-Tab) in Supabase PostgreSQL (`public.system_mail_configs`).

**Datenbankmodell (`supabase/migrations/14_system_mail_configs.sql`):**
- `public.system_mail_configs`: Hält alle Systemereignis-Verteiler (`schluessel`, `bezeichnung`, `mailadresse`, `modul`, `beschreibung`, `sort_order`).
- `schluessel` ist `UNIQUE` und entspricht der Spalte A des Altsystems (z.B. `Info_Mail_Mannschaft`, `Info_Mail_Vereinswettschiessen`, `Info_Mail_Gruppe`, etc.).
- RLS: `anon`-SELECT für GAS-Skripte ohne JWT; Schreibzugriff nur für `authenticated` (Vorstand).
- RPC-Funktion `public.get_system_mail(p_schluessel)` für direkte GAS-Abfragen.

**Frontend-Integration (`vorstand/js/system-mails.js`, `vorstand/index.html`):**
- Supabase-First Laderoutine mit automatischem Fallback auf GAS `loadAdminData`.
- Mitglieder-Dropdown wird dynamisch aus `public.members` befüllt.
- Speichern erfolgt primär in Supabase (< 50 ms) mit asynchronem Dual-Write zu Google Apps Script (`App_Info`-Sheet).
- Grüner `Supabase`-Badge in der Sidebar und auf der Dashboard-Übersichtskarte.

---

## 6.9 Fachmodul: FINANZBUCHHALTUNG (FiBu) (Phase 11 – Abgeschlossen & im Testbetrieb)

Phase 11 migriert das gesamte Buchhaltungs- und Finanzwesen (Kassabuch, doppelter Kontenrahmen, Budgetierung, CAMT.053 Bankabgleich & Buchungszentrale) in Supabase PostgreSQL (`supabase/migrations/15_accounting_module.sql`).

**Datenbankmodell (`supabase/migrations/15_accounting_module.sql`):**
- `public.accounting_accounts`: Vollständiger KMU-Kontenrahmen (`konto` PK, `bezeichnung`, `klasse`, `hauptgruppe`, `gruppe`, `untergruppe`, `soll_haben`, `eroeffnungssaldo`).
- `public.accounting_journal`: Buchungsjournal (`id` PK, `jahr`, `datum`, `beleg_nr`, `beschreibung`, `konto_soll`, `konto_haben`, `betrag`, `typ`, `split_group_id`, `created_at`).
  - Fremdschlüssel-Absicherung: `konto_soll` und `konto_haben` referenzieren `accounting_accounts(konto) ON UPDATE CASCADE ON DELETE RESTRICT`.
- `public.accounting_budgets`: Normalisierte Jahresbudgets (`id` PK, `konto`, `jahr`, `betrag`, `updated_at`, `UNIQUE(konto, jahr)`).
- `public.accounting_bank_rules`: CAMT.053 Erkennungs- und Kontierungsregeln (`id` PK, `rule_key`, `label`, `pattern_party`, `pattern_text`, `prefix`, `soll`, `haben`, `scope`, `amount_mode`, `amount_min`, `amount_max`, `sort_order`).

**UI-Standard TableKit (Ein- & Ausblendbare Spalten mit LocalStorage-Persistenz):**
Sämtliche Tabellen und Modale des Buchhaltungsmoduls wurden nahtlos an den `TableKit`-Standard angebunden:
- **Kassabuch-Journal:** `#bh-journal-table` mit Spaltenauswahl-Button `#bh-journal-column-toggle` (`tk_cols_bh_journal`).
- **Kontenrahmen & Budget:** `#bh-konten-table` mit Spaltenauswahl-Button `#bh-konten-column-toggle` (`tk_cols_bh_konten`).
- **Kontoauszug-Modal:** `#bh-kontoauszug-modal-table` mit Spaltenauswahl-Button `#bh-kontoauszug-col-toggle` (`tk_cols_bh_kontoauszug`).
- **Massen-Budgetierungs-Modal:** `#bh-budget-matrix-table` mit Spaltenauswahl-Button `#bh-budget-matrix-col-toggle` (`tk_cols_bh_budget_matrix`).
- **Bankabgleich & Buchungszentrale:** `#bhBankTable` mit Spaltenauswahl-Button `#bh-bank-column-toggle` (`tk_cols_bh_bank`).
- **Automatische Buchungsregeln:** `#bh-manage-rules-table` mit Spaltenauswahl-Button `#bh-rules-column-toggle` (`tk_cols_bh_manage_rules`).

**Modulübergreifende Buchungsintegration (Supabase Direct Write):**
- **Rechnungsmodul (`rechnungen-actions.js`):** Direkter Buchungssatz-Eintrag in `accounting_journal` bei Zahlungseingang (Bank 1020 / Kasse 1000 an Ertrag).
- **Jahresbeitragswesen (`jahresbeitrag-overview.js`):** Automatische Verbuchung von Split-Buchungssätzen direkt in `accounting_journal`.
- **Inventar / Materialwart (`inventar-cart.js`):** Bar-Verkäufe und Kautionen/Depots (checkout/checkin) werden direkt in `accounting_journal` gebucht.

**Migrations- & Synchronisationswerkzeuge:**
- **1-Klick-Import (`migrateBuchhaltungFromGoogleSheets()`):** Automatische Übernahme aller Konten, Journal-Einträge, Budgets und Bankregeln aus Google Sheets (`Buchhaltung_GAS`) nach Supabase mit Live-Fortschrittsanzeige.
- **Asynchroner Dual-Write:** Alle schreibenden Operationen schreiben primär in Supabase (< 50 ms) und spiegeln die Änderungen non-blocking im Hintergrund an Google Sheets.

---

### 6.14 Fachmodul: KK-JAHRESMEISTERSCHAFT (Phase 15 – In Umsetzung)

Phase 15 überführt das gesamte Kernmodul der Kleinkaliber-Jahresmeisterschaft von Google Sheets (`Jahresmeisterschaft_GAS_Original` & `Jahresmeisterschaft_GAS_KI_Testcode...`, Spreadsheet-ID `1ye7nbT1lLLYzilwNhw6NnslwvUrtxFuT-ZZJRrG2sT0` / `1Dihy7Xey4DIko8Qw0qnzzRtVqx7TftLueCmUXT7Uv5g`) auf Supabase PostgreSQL.

**Hintergrund & Herausforderung:**
- Die bisherige Jahresmeisterschaft ist eine hochkomplexe zweidimensionale Matrix (Titel, Max-Punkte, Aktiv-Flags, Liga 1 à 8 Schützen mit Abstieg, Liga 2 mit Aufstieg, U21-Junioren, Streichresultate-Berechnung, Totals und Prozente).
- In Google Sheets führte das Speichern zu Rechenzeiten von 10–15 Sekunden mit Sheet-Locks.
- Auf Supabase erfolgt die Berechnung der Totals, Streichresultate und Ranglisten blitzschnell im Browser bzw. in PostgreSQL (< 30 ms).

**Datenbankmodell (`supabase/migrations/16_jahresmeisterschaft_module.sql`):**
- `public.jm_seasons`: Speichert Jahres-Snapshots (`jahr` PK z.B. 'current', '2026', '2025', `raw_grid` JSONB, `junior_exclusions` JSONB, `is_archived` BOOLEAN, `updated_at`).
- `public.jm_shooters`: Strukturierte Schützenübersicht je Saison (`id` PK, `jahr`, `person_number`, `name`, `liga`, `rang`, `total`, `streichresultat_prz`, `status`).
- `public.jm_competitions`: Stammdaten der Wettkämpfe und Schiessen je Saison (`id` PK, `jahr`, `name`, `max_punkte`, `is_active`, `col_index`, `typ`).
- RLS-Policies: Lesezugriff für authentifizierte Benutzer und Anon (PWA/Website); Schreibzugriff nur für autorisierte Rollen (`admin`, `schuetzenmeister`, `vorstand`).

**Vorstand-Cockpit (`vorstand/js/jahresmeisterschaft/`):**
- `jahresmeisterschaft-core.js`: Lädt `raw_grid` und Archiv-Jahre direkt aus Supabase (< 30 ms) mit transparentem Fallback auf GAS.
- `jahresmeisterschaft-manager.js`: Schreibt Mutationen und Drag-and-Drop-Verschiebungen atomar nach Supabase mit asynchronem Dual-Write an das Google Sheet.
- 1-Klick-Import (`migrateJMFromGoogleSheets()`): Übernahme aller bestehenden Tabellen und Archivblätter nach Supabase.

---

### 6.15 Fachmodul: TEAM MANAGER SUPABASE-FIRST (Phase 16 – Geplant)

Phase 16 bindet das Frontend des Team Managers (`vorstand/js/manager/`) vollständig an die in Phase 12 erstellten Tabellen `public.contest_setups` und `public.contest_teams` an.
- Ablösung der Aufrufe an `mannschaft_homepage_GAS`.
- Drag & Drop Zuteilung für Grenzlandcup, Mannschafts- und Gruppenmeisterschaft direkt in Supabase mit Dual-Write.

---

### 6.16 Fachmodul: GENERALVERSAMMLUNG & PRÄSENZKONTROLLE (Phase 17 – Geplant)

Phase 17 löst die verbleibende Logik von `Admin_Generalversammlungen_GAS` in `vorstand/js/gv.js` ab:
- Tabellen für GV-Instanzen, Traktanden, Beschlüsse und Präsenzen/Stimmrechte.
- Direkte Verknüpfung mit den Aktiv- und Ehrenmitgliedern aus `public.members`.

---

### 6.17 MITGLIEDER-APP & WEBSITE KONSOLIDIERUNG (Phase 18 – Geplant)

Phase 18 migriert die verbliebenen Satellitenschnittstellen in der Mobile PWA (`app.js`, `app/*`) und auf der Vereins-Website:
- Direkter Abruf von `public.termine` und Hausbelegung in der PWA.
- Standblatt-Upload-Metadaten direkt nach Supabase (`public.contest_ocr_logs` / `public.jm_seasons`).
- Resultate-Feed auf der Vereins-Website direkt aus Supabase REST.

---

### 6.18 FINALER CUT-OVER & GOOGLE-SHEETS-STILLEGUNG (Phase 19 – Geplant)

Sobald alle Module im Parallelbetrieb mit Dual-Write erfolgreich getestet wurden:
- Gezielte Deaktivierung aller asynchronen Dual-Write Spiegelungen.
- Vollständige Stilllegung der 10 Legacy Google Spreadsheets und 11 Google Apps Script Projekte.

---

## 7. Migrations-Roadmap (Phasen 0 bis 19)

| Phase | Bereich | Ziel / Inhalt | Führendes System | Status |
|:---|:---|:---|:---|:---|
| **Phase 0** | **Zielarchitektur & Datenmodell** | Detailliertes PostgreSQL Schema, Tabellen, Fremdschlüssel, Enums, RLS-Entwurf | – | ✅ **Abgeschlossen** |
| **Phase 1** | **Auth, Rollen & RLS** | Supabase Auth, `user_roles` Tabelle, JWT Hook, 70 Permissions, SQL-Hilfsfunktionen (`01_auth_and_roles.sql`) | Supabase Auth | ✅ **Abgeschlossen** |
| **Phase 2** | **Pilotmodul ANLÄSSE** | Event-Management, Mengenrechner, Bestellwesen, Checklisten, Helfer/Stände, Vorlagen & Controlling (`02_events_module.sql`, `03_anon_dev_policies.sql`); Vollständige Integration ins Vorstand-Portal (`anlaesse.js`, `supabase-client.js`) | Supabase | ✅ **Abgeschlossen** |
| **Phase 3** | **Modul VERMIETUNG** | Vollständige Integration der Vermietungsverwaltung (Supabase Master, Hybridbetrieb mit GAS für PDF/QR/Kalender/Mails, Bereinigung WhatsApp/Clubdesk, Raiffeisen E-Banking Gmail-Scan & Doppelversand-Schutz; `04_rental_module.sql`, `05_rental_dev_policies.sql`, Vorstands-Cockpit `vorstand/js/vermietung/`) | Supabase (Master) / Google Calendar (Termine) / GAS (PDF/Mail) | ✅ **Abgeschlossen** |
| **Phase 4** | **Mitglieder & SSV-Import** | Browser-native SSV-Diff-Engine (ohne GAS), relationale Tabellen (`members`, `member_licenses`, `member_functions`, `member_training`, `member_history`), Dual-Write zu Google Sheet Test-Kopie | Supabase (Master) ⇄ Google Sheet (Test-Kopie) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 5** | **Anlässe & Umfragen (Eventplaner)** | Eigenständige Supabase-Migration des RSVP- und Umfragen-Moduls (`poll_events`, `poll_responses`, `poll_views`, `poll_responses_log`, `07_eventplaner_module.sql`); Beibehaltung der Modultrennung; Dual-Write zum Google Sheet | Supabase (Master) ⇄ Google Sheet (Parallelbetrieb) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 6** | **Jahresprogramm (Termine & Orte)** | Migration von Jahresprogramm, Schiessterminen und Austragungsorten & Maps (`09_termine_module.sql`); Einführung des zentralen UI-Standards `TableKit` (`ui-table-kit.js`) | Supabase (Master) ⇄ Google Sheet (Parallelbetrieb) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 7** | **Inventar-Verwaltung** | Migration von Vereinsinventar, Ausleihe und Materialwart-Funktionen (`08_inventory_module.sql`); Dual-Write zum Google Sheet | Supabase (Master) ⇄ Google Sheet (Parallelbetrieb) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 8** | **Mitglieder (Write-Master)** | Supabase ist führender Master für Stammdaten; Mutationen direkt via Supabase REST; Revisions-Audit in `public.member_history`; Jugend (U21) Statusfilter & Badges; Dual-Write zu Google Sheet | Supabase (Master) ⇄ Google Sheet (Spiegelung) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 9** | **Jahresbeitrag & Beitragsverwaltung** | Beitragsrechnungen, Detailpositionen, Wettkampfteilnahmen & Gebührenordnung (`11_jahresbeitrag_module.sql`); asynchrones Dual-Write zu Google Sheets | Supabase (Master) ⇄ Google Sheet (Spiegelung) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 10** | **Rechnungsmodul & Fakturierung** | Rechnungsverwaltung, Positionen, Layouts & externe Kontakte (`10_invoices_module.sql`); QR-Rechnungs-PDF & Gmail-Versand via GAS | Supabase (Master) ⇄ Google Sheet (Spiegelung) / GAS (PDF/Mail) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 11** | **Finanzbuchhaltung (FiBu)** | Doppelte Buchhaltung, Kontenrahmen, Journal, Budgets und CAMT.053 Bankregeln (`15_accounting_module.sql`); TableKit-Standard (ein-/ausblendbare Spalten & Persistenz) in allen Tabellen & Modalen; asynchrones Dual-Write zu `Buchhaltung_GAS`; 1-Klick-Importtool | Supabase (Master) ⇄ Google Sheet (Spiegelung) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 12** | **Resultate & Wettkämpfe** | Schiessresultate je Wettbewerb, Jahr & Runde; Team-Zuteilungen; KI-Standblatt-Erkennung Audit-Log (`12_results_module.sql`); Unterstützung Grenzlandcup, Mannschaft & Gruppenmeisterschaft | Supabase (Master) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 13** | **Mail-Log & Versandprotokoll** | Zentrales, modulübergreifendes E-Mail-Audit-Log (`13_mail_module.sql`, `public.mail_logs`); RPC-Funktion `log_mail_sent()` für GAS-Integration; Frontend-Tab «Versandprotokoll» mit Filtern, Lazy Loading & Detail-Modal | Supabase (Log) / GAS (Versand) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 14** | **System-Mail-Verteiler** | Migration aller automatischen Mail-Empfänger und Abo-Verteiler (`14_system_mail_configs.sql`, `public.system_mail_configs`); RPC-Funktion `get_system_mail()`; Supabase-First UI & Dual-Write zu `App_Info` | Supabase (Master) ⇄ Google Sheet (Spiegelung) | ✅ **Abgeschlossen & im Testbetrieb** |
| **Phase 15** | **KK-Jahresmeisterschaft** | 2D-Matrix & Resultate-Import, Ligen 1 & 2 (Auf-/Abstieg), U21-Junioren, Streichresultate & Totals; Sub-Sekunden-Berechnung statt 15s Sheet-Lock; 1-Klick-Import alter Jahrgänge; Dual-Write (`16_jahresmeisterschaft_module.sql`) | Supabase (Master) ⇄ Google Sheet (Spiegelung) | 🚀 **In Umsetzung** |
| **Phase 16** | **Team Manager (Supabase-First)** | Frontend-Anbindung von `manager-core.js` an `contest_setups` & `contest_teams`; Ablösung `mannschaft_homepage_GAS` | Supabase (Master) ⇄ Google Sheet (Spiegelung) | 📋 **Geplant** |
| **Phase 17** | **Generalversammlung & Präsenz** | Migration von `gv.js` (Traktanden, Beschlüsse, Präsenz, Stimmberechtigung); Ablösung `Admin_GV_GAS` | Supabase (Master) ⇄ Google Sheet (Spiegelung) | 📋 **Geplant** |
| **Phase 18** | **PWA & Website Konsolidierung** | Direkte Supabase REST Anbindung für Termine, Hauskalender, Standblatt-Upload und Website-Resultate | Supabase (Master) | 📋 **Geplant** |
| **Phase 19** | **Finaler Cut-Over** | Vollständige Deaktivierung aller Dual-Writes; Stilllegung aller Google Sheets & Google Apps Scripts | Supabase (Single Source of Truth) | 📋 **Geplant** |

---

> **Ergebnis:** Mit dieser Roadmap sind alle verbleibenden Arbeitspakete bis zur 100%igen Unabhängigkeit von Google Sheets und Google Apps Script strukturiert und priorisiert. Phase 15 (KK-Jahresmeisterschaft) befindet sich nun in Umsetzung.

