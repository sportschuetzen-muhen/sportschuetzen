# Zielarchitektur: Supabase Vereinsportal Sportschützen Muhen

**Stand:** 2026-09-19  
**Phase:** 0 & 2 – Zielarchitektur & Datenmodellierung  
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
7. [Migrations-Roadmap (Phasen 0 bis 11)](#7-migrations-roadmap-phasen-0-bis-11)

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

### Pilotmodul: ANLÄSSE

Das Modul `ANLÄSSE` wird als erstes Fachmodul vollständig nativ in Supabase aufgebaut. Es deckt Schiessanlässe, vereinsinterne Feste, GV und Helfereinsätze ab.

```sql
-- 1. Anlass-Kategorien
CREATE TABLE public.event_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,                  -- z.B. 'meisterschaft', 'fest', 'gv', 'training'
    name VARCHAR(100) NOT NULL,
    color_hex VARCHAR(10) DEFAULT '#0f3a5d',
    description TEXT
);

-- 2. Haupttabelle Anlässe
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.event_categories(id),
    location VARCHAR(200) DEFAULT 'Schiessanlage Muhen',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    registration_deadline TIMESTAMPTZ,
    max_participants INTEGER,
    requires_licence BOOLEAN DEFAULT false,            -- Nur für lizenzierte Schützen
    is_public BOOLEAN DEFAULT false,                   -- Auf Vereins-Website sichtbar
    is_cancelled BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Anmeldungen / Teilnehmer (RSVP)
CREATE TABLE public.event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    person_number INTEGER REFERENCES public.members(person_number), -- Wenn Vereinsmitglied
    guest_name VARCHAR(150),                           -- Falls externe Begleitperson
    guest_email VARCHAR(255),
    status rsvp_status NOT NULL DEFAULT 'attending',
    target_discipline VARCHAR(50),                     -- z.B. 'liegend', 'kniend'
    remarks TEXT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_event_member UNIQUE (event_id, person_number)
);

-- 4. Helfer-Schichten für Anlässe
CREATE TABLE public.event_helper_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    role_name VARCHAR(100) NOT NULL,                   -- z.B. 'Wirtschaft', 'Standblatt-Ausgabe', 'Range Officer'
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    required_helpers INTEGER NOT NULL DEFAULT 1,
    assigned_person_number INTEGER REFERENCES public.members(person_number),
    assigned_guest_name VARCHAR(150),
    remarks TEXT
);

CREATE INDEX idx_events_start ON public.events(start_time);
CREATE INDEX idx_event_reg_event ON public.event_registrations(event_id);
```

---

### Fachmodul: VERMIETUNG

Die Vermietung wird als erstes bestehendes Altsystem abgelöst. Das Modell trennt strikt zwischen **operativer Vermietungsverwaltung (Supabase)** und **physischer Kalenderbelegung (Google Calendar)**.

```sql
-- 1. Mietobjekte / Tarife
CREATE TABLE public.rental_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_code VARCHAR(50) UNIQUE NOT NULL,           -- z.B. 'standard_tag', 'mitglied_rabatt', 'abend'
    description VARCHAR(150) NOT NULL,
    base_price_chf NUMERIC(10,2) NOT NULL,
    cleaning_fee_chf NUMERIC(10,2) DEFAULT 0.00,
    deposit_chf NUMERIC(10,2) DEFAULT 200.00,
    is_active BOOLEAN DEFAULT true
);

-- 2. Vermietungsanfragen & Buchungen
CREATE TABLE public.rental_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_number VARCHAR(30) UNIQUE NOT NULL,         -- z.B. 'MIETE-2026-0042'
    
    -- Mietzeitraum
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    
    -- Mieter- / Kundendaten
    customer_type VARCHAR(20) NOT NULL DEFAULT 'private', -- 'private', 'company', 'member'
    person_number INTEGER REFERENCES public.members(person_number), -- Nur bei Vereinsmitgliedern
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company VARCHAR(150),
    street VARCHAR(150) NOT NULL,
    post_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    
    -- Anlassdetails
    event_purpose VARCHAR(255) NOT NULL,               -- Zweck (z.B. 'Geburtstag', 'Familienfeier')
    expected_guests INTEGER,
    remarks TEXT,
    
    -- Finanzielle Abwicklung
    pricing_id UUID REFERENCES public.rental_pricing(id),
    total_amount_chf NUMERIC(10,2) NOT NULL,
    deposit_amount_chf NUMERIC(10,2) DEFAULT 200.00,
    is_deposit_paid BOOLEAN DEFAULT false,
    is_rental_paid BOOLEAN DEFAULT false,
    
    -- Status & Workflow
    status rental_status NOT NULL DEFAULT 'inquiry',
    rejection_reason TEXT,
    cancellation_reason TEXT,
    
    -- Externe Verknüpfungen
    google_calendar_event_id VARCHAR(255),             -- Google Calendar Event-ID (Belegungs-Master!)
    contract_storage_path TEXT,                        -- Supabase Storage Pfad: 'vermietungen/2026/vertrag_0042.pdf'
    
    -- Asynchrone Archivierung in Paperless-NGX
    paperless_status archive_sync_status NOT NULL DEFAULT 'not_applicable',
    paperless_document_id INTEGER,                     -- ID im Paperless-Server
    paperless_error_message TEXT,
    
    -- Metadaten
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_by UUID REFERENCES auth.users(id)          -- Bearbeitender Vermieter/Admin
);

-- 3. Historie / Protokoll zu Vermietungen
CREATE TABLE public.rental_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_request_id UUID NOT NULL REFERENCES public.rental_requests(id) ON DELETE CASCADE,
    previous_status rental_status,
    new_status rental_status NOT NULL,
    comment TEXT,
    changed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rentals_dates ON public.rental_requests(start_date, end_date);
CREATE INDEX idx_rentals_status ON public.rental_requests(status);
CREATE INDEX idx_rentals_paperless ON public.rental_requests(paperless_status);
```

---

## 5. Sicherheitsmodell & Row-Level Security (RLS)

Alle Tabellen laufen unter aktiviertem RLS. **Entscheidender Vorteil des neuen RBAC-Modells:** Die RLS-Policies prüfen nicht mehr auf starre Rollennamen, sondern auf **granulare Aktionen / Berechtigungen** (`auth.has_permission()`). 

Ändert sich die Vereinsorganisation (z. B. "Kassier darf ab sofort Vermietungen genehmigen"), muss **keine einzige RLS-Policy angefasst werden**, sondern lediglich ein Datensatz in `public.role_permissions`.

### 5.1 Policies für `public.events` & `event_registrations`

```sql
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- 1. ANLÄSSE LESEN:
-- Öffentliche Anlässe darf jeder (auch nicht-eingeloggte Besucher) sehen
CREATE POLICY "Public events visible to all" ON public.events
    FOR SELECT TO public
    USING (is_public = true AND is_cancelled = false);

-- Vereinsinterne Anlässe sehen Benutzer mit der Berechtigung 'anlaesse.view_internal' (Mitglieder & Vorstand)
CREATE POLICY "Internal events visible with permission" ON public.events
    FOR SELECT TO authenticated
    USING (auth.has_permission('anlaesse.view_internal'));

-- 2. ANLÄSSE ERSTELLEN / BEARBEITEN / ABSAGEN:
-- Geprüft wird die Aktionsberechtigung 'anlaesse.manage'
CREATE POLICY "Manage events based on permission" ON public.events
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- 3. ANMELDUNGEN (RSVP) - EIGENE ANMELDUNG:
-- Mitglieder dürfen ihre eigene Anmeldung einsehen und verändern ('anlaesse.rsvp_self')
CREATE POLICY "Member manages own registration" ON public.event_registrations
    FOR ALL TO authenticated
    USING (
        auth.has_permission('anlaesse.rsvp_self') AND
        person_number IN (
            SELECT person_number FROM public.members WHERE auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.has_permission('anlaesse.rsvp_self') AND
        person_number IN (
            SELECT person_number FROM public.members WHERE auth_user_id = auth.uid()
        )
    );

-- 4. ANMELDUNGEN VOLLVERWALTUNG:
-- Berechtigte Funktionäre ('anlaesse.rsvp_all') dürfen alle Anmeldungen verwalten
CREATE POLICY "Functionaries manage all registrations" ON public.event_registrations
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.rsvp_all'))
    WITH CHECK (auth.has_permission('anlaesse.rsvp_all'));
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

### 6.3 Mitglieder-Synchronisation (XLSX → Sheets → Supabase)

Während der Übergangsphasen (Phasen 0 bis 5) bleibt Google Sheets der operative Master für die SSV-Verbandsdaten.

```text
                 SCHWEIZER SCHIESSSPORTVERBAND (SSV)
                                │
                                ▼ Offizieller Export
                           XLSX-Datei
                                │
                                ▼ Manueller Import durch Aktuar/Admin
                      Google Sheets (Members100)
                     = Operativer Mitglieder-Master
                                │
                                │ Auslösen durch Button im Vorstand-Portal:
                                │ "Mitglieder nach Supabase synchronisieren"
                                ▼
                       Cloudflare Worker / Script
                                │
                                ▼ Batch-Upsert via Supabase REST API
                      public.members (Supabase)
                           = Read-Replica
                     (Schlüssel: person_number)
```

**Eigenschaften dieses Sync-Musters:**
- **Kein unkontrollierter Cron-Job:** Der Sync wird gezielt nach erfolgtem Verbands-Import manuell ausgelöst.
- **Transaktionale Sicherheit:** Bestehende Verknüpfungen (z. B. zu Resultaten, Beiträgen oder Anlässen) bleiben über `person_number` stabil erhalten.

---

## 7. Migrations-Roadmap (Phasen 0 bis 11)

| Phase | Bereich | Ziel / Inhalt | Führendes System |
|:---|:---|:---|:---|
| **Phase 0** | **Zielarchitektur & Datenmodell** | Detailliertes PostgreSQL Schema, Tabellen, Fremdschlüssel, Enums, RLS-Entwurf | – |
| **Phase 1** | **Auth, Rollen & RLS** | Supabase Auth, `user_roles` Tabelle, JWT Hook, SQL-Hilfsfunktionen | Supabase Auth |
| **Phase 2** | **Pilotmodul ANLÄSSE** | Eigenständige Tabellen für Events, Teilnehmer, Helfer; Integration ins Vorstand-Portal | Supabase |
| **Phase 3** | **Modul VERMIETUNG** | Vollständige Ablösung der Vermietungsverwaltung; Google Calendar bleibt Belegungs-Master | Supabase (Workflow) / Google Calendar (Termine) |
| **Phase 4** | **Mitglieder (Read-only Sync)** | Aufbau von `public.members` als Read-Replica mit Sync-Button nach XLSX-Import | Google Sheets (Master) → Supabase (Replica) |
| **Phase 5** | **Anlässe & Eventplaner Integration**| Ablösung des alten GAS-Eventplaners; Zusammenführung aller Anmeldungen in Supabase | Supabase |
| **Phase 6** | **Mitglieder (Write-Master)** | Supabase wird alleiniger Master für Stammdaten; Mutationen direkt in Supabase | Supabase (Master) |
| **Phase 7** | **Inventar-Verwaltung** | Migration von Vereinsinventar, Ausleihe und Materialwart-Funktionen | Supabase |
| **Phase 8** | **Jahresmeisterschaft** | Übernahme der präferierten KI-/Standblatt-Erkennung nach Abschluss der Testphase | Supabase + Cloudflare AI / OCR |
| **Phase 9** | **Jahresbeiträge** | Beitragsrechnung und Debitorenverwaltung verknüpft mit `public.members` | Supabase |
| **Phase 10** | **Rechnungen & Fakturierung** | QR-Rechnungen, PDF-Generierung und Archivierung in Paperless-NGX | Supabase + Paperless-NGX |
| **Phase 11** | **Finanzbuchhaltung (FiBu)** | Doppelte Buchhaltung, Kontenrahmen und Bilanz/Erfolgsrechnung (letzter Schritt) | Supabase |

---

> **Ergebnis:** Mit dieser Architektur sind alle Schnittstellen, Verantwortlichkeiten und Sicherheitsmechanismen eindeutig und widerspruchsfrei definiert. Phase 0 ist damit abgeschlossen. Die konkreten DDL-Skripte für Phase 1 bis 3 können direkt aus diesem Entwurf abgeleitet werden.
