-- ==============================================================================
-- 09_termine_module.sql
-- Migration: Fachmodul JAHRESPROGRAMM (Termine, Anlässe & Orte)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.termine: Termine (Jahresprogramm & Schiesstermine), Datum, Zeiten,
--    Titel, Ort, Status, Kategorie, Google Maps Link, sort_order
-- 2. public.termine_locations: Austragungsorte mit Google Maps URLs & Reihenfolge
-- 3. public.termine_event_types: Vordefinierte Anlass-Typen & Kategorien
-- ==============================================================================

-- 1. TABELLE: public.termine (Termine & Jahresprogramm)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.termine (
    id VARCHAR(100) PRIMARY KEY DEFAULT ('t_' || substr(md5(random()::text), 1, 12)),
    datum DATE,
    startzeit VARCHAR(20),                              -- z.B. '19:00' oder '19:00:00'
    endzeit VARCHAR(20),                                -- z.B. '22:00' oder '22:00:00'
    anlasstitel VARCHAR(255) NOT NULL,                  -- z.B. 'Bundesprogramm 300m'
    ort VARCHAR(255),                                   -- z.B. 'Schiessanlage Muhen'
    kategorie VARCHAR(100) NOT NULL DEFAULT 'Jahresprogramm', -- 'Jahresprogramm', 'Schiesstermine'
    status VARCHAR(50) NOT NULL DEFAULT 'provisorisch', -- 'fix', 'provisorisch', 'abgesagt'
    austragungsorte_map TEXT,                           -- Google Maps Link
    typ VARCHAR(50) NOT NULL DEFAULT 'verein',          -- 'verein' für Mitglieder-App
    sort_order INTEGER NOT NULL DEFAULT 0,              -- Manuelle Sortier-Reihenfolge (Drag & Drop)
    notes TEXT,                                         -- Interne Notizen / Bemerkungen
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_termine_datum ON public.termine(datum);
CREATE INDEX IF NOT EXISTS idx_termine_kategorie ON public.termine(kategorie);
CREATE INDEX IF NOT EXISTS idx_termine_status ON public.termine(status);
CREATE INDEX IF NOT EXISTS idx_termine_sort ON public.termine(sort_order);
CREATE INDEX IF NOT EXISTS idx_termine_anlasstitel ON public.termine(anlasstitel);

-- 2. TABELLE: public.termine_locations (Austragungsorte & Maps Stammdaten)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.termine_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    map_link TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,              -- Reihung in Dropdowns (Drag & Drop)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_termine_locations_sort ON public.termine_locations(sort_order);

-- 3. TABELLE: public.termine_event_types (Anlass-Typen Stammdaten)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.termine_event_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100) NOT NULL DEFAULT 'Jahresprogramm',
    sort_order INTEGER NOT NULL DEFAULT 0,              -- Reihung in Dropdowns (Drag & Drop)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_termine_types_sort ON public.termine_event_types(sort_order);

-- 4. INITIALE BASIS-STAMMDATEN (FALLS LEER)
-- ------------------------------------------------------------------------------
INSERT INTO public.termine_locations (name, map_link, sort_order)
VALUES
    ('Schiessanlage Muhen', 'https://maps.app.goo.gl/w18RzUjWkL9e6gS38', 1),
    ('Schützenhaus Suhr', '', 2),
    ('Schiessanlage Buchs AG', '', 3),
    ('Schiessanlage Oberentfelden', '', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.termine_event_types (name, category, sort_order)
VALUES
    ('Bundesprogramm 300m', 'Jahresprogramm', 1),
    ('Feldschiessen 300m', 'Jahresprogramm', 2),
    ('Generalversammlung', 'Jahresprogramm', 3),
    ('Vorstandssitzung', 'Jahresprogramm', 4),
    ('Cupschiessen', 'Jahresprogramm', 5),
    ('Freundschaftsschiessen', 'Jahresprogramm', 6),
    ('Endschiessen', 'Jahresprogramm', 7),
    ('Absenden & Chlaushock', 'Jahresprogramm', 8),
    ('Aargauer Meisterschaft', 'Schiesstermine', 9),
    ('Kantonalstich', 'Schiesstermine', 10)
ON CONFLICT (name) DO NOTHING;

-- 5. ROW LEVEL SECURITY (RLS) & POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.termine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termine_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termine_event_types ENABLE ROW LEVEL SECURITY;

-- RBAC Authenticated Policies (Rollen: admin, vorstand, schuetzenmeister, aktuar, member)
DROP POLICY IF EXISTS termine_select_auth ON public.termine;
CREATE POLICY termine_select_auth ON public.termine
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS termine_manage_auth ON public.termine;
CREATE POLICY termine_manage_auth ON public.termine
    FOR ALL TO authenticated
    USING (auth.has_permission('termine.manage') OR auth.has_role('admin') OR auth.has_role('vorstand') OR auth.has_role('schuetzenmeister') OR auth.has_role('aktuar'))
    WITH CHECK (auth.has_permission('termine.manage') OR auth.has_role('admin') OR auth.has_role('vorstand') OR auth.has_role('schuetzenmeister') OR auth.has_role('aktuar'));

DROP POLICY IF EXISTS termine_locations_select_auth ON public.termine_locations;
CREATE POLICY termine_locations_select_auth ON public.termine_locations
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS termine_locations_manage_auth ON public.termine_locations;
CREATE POLICY termine_locations_manage_auth ON public.termine_locations
    FOR ALL TO authenticated
    USING (auth.has_permission('termine.manage') OR auth.has_role('admin') OR auth.has_role('vorstand') OR auth.has_role('schuetzenmeister'))
    WITH CHECK (auth.has_permission('termine.manage') OR auth.has_role('admin') OR auth.has_role('vorstand') OR auth.has_role('schuetzenmeister'));

DROP POLICY IF EXISTS termine_types_select_auth ON public.termine_event_types;
CREATE POLICY termine_types_select_auth ON public.termine_event_types
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS termine_types_manage_auth ON public.termine_event_types;
CREATE POLICY termine_types_manage_auth ON public.termine_event_types
    FOR ALL TO authenticated
    USING (auth.has_permission('termine.manage') OR auth.has_role('admin') OR auth.has_role('vorstand') OR auth.has_role('schuetzenmeister'))
    WITH CHECK (auth.has_permission('termine.manage') OR auth.has_role('admin') OR auth.has_role('vorstand') OR auth.has_role('schuetzenmeister'));

-- Entwicklungs- und Übergangs-Policies (ANON KEY für Vorstand & Website PWA)
DROP POLICY IF EXISTS termine_anon_dev ON public.termine;
CREATE POLICY termine_anon_dev ON public.termine
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS termine_locations_anon_dev ON public.termine_locations;
CREATE POLICY termine_locations_anon_dev ON public.termine_locations
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS termine_types_anon_dev ON public.termine_event_types;
CREATE POLICY termine_types_anon_dev ON public.termine_event_types
    FOR ALL TO anon USING (true) WITH CHECK (true);
