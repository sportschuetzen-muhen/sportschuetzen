# Zielarchitektur: Supabase Vereinsportal Sportschützen Muhen

**Stand:** 2026-09-27  
**Status:** TECHNISCHES SCHEMA- & RLS-REFERENZHANDBUCH  
**Führendes Master-Dokument:** [SYSTEM_ARCHITECTURE_MASTER.md](file:///docs/SYSTEM_ARCHITECTURE_MASTER.md)  
**Historische Analyse:** [Archiv/LEGACY_ARCHITECTURE_ANALYSIS_2026-09-19.md](file:///docs/Archiv/LEGACY_ARCHITECTURE_ANALYSIS_2026-09-19.md)

---

## Inhaltsverzeichnis

1. [Architektur-Prinzipien & Leitlinien](#1-architektur-prinzipien--leitlinien)
2. [Gesamtsystem & Systemgrenzen](#2-gesamtsystem--systemgrenzen)
3. [Rollen- & Authentifizierungskonzept](#3-rollen--authentifizierungskonzept)
4. [Datenmodell & Kern-Tabellenstrukturen](#4-datenmodell--tabellenstrukturen)
   - [Basistypen & Enums](#basistypen--enums)
   - [Auth & Benutzerverwaltung](#auth--benutzerverwaltung)
   - [Mitglieder-Stammdaten](#mitglieder-stammdaten)
   - [Pilotmodul: ANLÄSSE](#pilotmodul-anlässe)
   - [Fachmodul: VERMIETUNG](#fachmodul-vermietung)
5. [Sicherheitsmodell & Row-Level Security (RLS)](#5-sicherheitsmodell--row-level-security-rls)
6. [Modul-Spezifikationen & Archiv-Referenzen](#6-modul-spezifikationen--archiv-referenzen)

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
   - **Supabase** ist der alleinige Write-Master für Mitgliederdaten (Import erfolgt browser-nativ via XLSX-Diff).
   - **Paperless-NGX** ist das langfristige Revisionsarchiv für PDF-Dokumente.
5. **Kein Ausbau der unsicheren Legacy-Authentifizierung:**  
   Klartext-Passwörter und unsalted SHA-256 Hashes werden nicht weitergeführt. Supabase Auth bildet die neue, unveränderliche Sicherheitsgrenze.
6. **Striktes Verbot von stillen GAS-Fallbacks (Entkopplung):**  
   In **allen** Fachmodulen inklusive Vermietung, Mitglieder und Logins sind **stille Fallbacks auf Google Apps Script (GAS) oder Google Sheets strikt verboten**.  
   - Alle Lese- und Schreibzugriffe laufen primär und verbindlich über Supabase.
   - Dual-Writes zu Google Sheets sind deaktiviert.
   - Tritt bei Supabase ein Fehler auf, wird ein klarer UI-Fehler gemeldet, anstatt veraltete Google Sheets anzusprechen oder Daten inkonsistent zu spalten.

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

> **UI-Design im Vorstand-Portal:** Da sämtliche Kernmodule erfolgreich auf Supabase migriert wurden, wurden temporäre Migrations-Badges und Banner entfernt. Das Vorstand-Portal präsentiert sich nun einheitlich im finalen Produktions-Design ohne visuelles Rauschen.

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
## 6. Modul-Spezifikationen & Archiv-Referenzen

Für das tiefe Fachverständnis («das Warum»), Daten-Payloads und spezifische Business-Invarianten existieren dedizierte, schlanke Fachdokumente:

* **Gesamtsystem-Architektur:** [docs/SYSTEM_ARCHITECTURE_MASTER.md](SYSTEM_ARCHITECTURE_MASTER.md)
* **Rechnungswesen, Vorlagen & FiBu-Kopplung:** [docs/SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md](SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md)
* **PDF- & Mail-Engine Spezifikation (DIN 5008 & SIX Swiss QR):** [docs/DOCUMENT_AND_MAIL_ENGINE_SPEC.md](DOCUMENT_AND_MAIL_ENGINE_SPEC.md)
* **KK-Jahresmeisterschaft (2D-Grid & Berechnungen):** [docs/JAHRESMEISTERSCHAFT.md](JAHRESMEISTERSCHAFT.md)
* **Mitglieder & SSV-Import (Diff-Engine & Audit):** [docs/MITGLIEDER_UND_SSV.md](MITGLIEDER_UND_SSV.md)
* **Finanzbuchhaltung & Bankabgleich (CAMT & Buchungssätze):** [docs/FINANZBUCHHALTUNG_UND_BANK.md](FINANZBUCHHALTUNG_UND_BANK.md)
* **Vermietung Schützenhaus (Workflow & Status):** [docs/VERMIETUNG_SCHUETZENSTUBE.md](VERMIETUNG_SCHUETZENSTUBE.md)

### Historische Archive
* **Migrations-Tagebuch (Phasen 0 bis 23):** [docs/Archiv/MIGRATION_HISTORY_PHASES_0_TO_23.md](Archiv/MIGRATION_HISTORY_PHASES_0_TO_23.md)
* **Historische Vor-Migrations-Analyse:** [docs/Archiv/LEGACY_ARCHITECTURE_ANALYSIS_2026-09-19.md](Archiv/LEGACY_ARCHITECTURE_ANALYSIS_2026-09-19.md)
