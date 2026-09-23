-- ==============================================================================
-- 17_team_manager_module.sql
-- Migration: Fachmodul TEAM MANAGER SUPABASE-FIRST (Phase 16)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Dieses Skript stellt sicher, dass die Tabellen public.contest_setups und
-- public.contest_teams alle nötigen Indizes, Views und Integritäten besitzen,
-- um als primäre Datenquelle (Master) für den Team Manager zu fungieren.
-- ==============================================================================

-- 1. SICHERSTELLUNG TABELLE: public.contest_teams
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contest_teams (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. 'grenzland_2026_muhen1'
    contest_type VARCHAR(50) NOT NULL DEFAULT 'grenzland',
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    team_name VARCHAR(50) NOT NULL,                     -- z. B. 'Muhen 1'
    max_shooters INTEGER NOT NULL DEFAULT 4,            -- Grenzland=4, Mannschaft=8, Gruppe=5
    sort_order INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contest_teams_entry UNIQUE (contest_type, year, team_name)
);

CREATE INDEX IF NOT EXISTS idx_contest_teams_type_year ON public.contest_teams(contest_type, year);
CREATE INDEX IF NOT EXISTS idx_contest_teams_sort ON public.contest_teams(contest_type, year, sort_order);

-- 2. SICHERSTELLUNG TABELLE: public.contest_setups
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contest_setups (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. 'setup_grenzland_2026_1001'
    contest_type VARCHAR(50) NOT NULL DEFAULT 'grenzland', -- 'grenzland', 'mannschaft', 'gruppe'
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    person_number VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    team VARCHAR(50) DEFAULT '',                        -- Primäre Zuteilung (z. B. 'Muhen 1') oder leer für Pool
    stellung VARCHAR(50) DEFAULT 'liegend',             -- 'liegend', 'kniend'
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contest_setup_entry UNIQUE (contest_type, year, person_number)
);

CREATE INDEX IF NOT EXISTS idx_contest_setup_type_year ON public.contest_setups(contest_type, year);
CREATE INDEX IF NOT EXISTS idx_contest_setup_pn ON public.contest_setups(person_number);
CREATE INDEX IF NOT EXISTS idx_contest_setup_team ON public.contest_setups(contest_type, year, team);

-- 3. TRIGGER FÜR updated_at
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_contest_setups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contest_setups_updated ON public.contest_setups;
CREATE TRIGGER trg_contest_setups_updated
    BEFORE UPDATE ON public.contest_setups
    FOR EACH ROW
    EXECUTE FUNCTION public.set_contest_setups_updated_at();

-- 4. VIEW: public.v_contest_team_summary
-- Aggregiert Auslastung je Team und Wettbewerb zur visuellen Kontrolle
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_contest_team_summary AS
SELECT 
    t.contest_type,
    t.year,
    t.team_name,
    t.max_shooters,
    t.sort_order,
    COUNT(s.person_number) AS assigned_shooters,
    CASE 
        WHEN COUNT(s.person_number) = t.max_shooters THEN 'voll'
        WHEN COUNT(s.person_number) > t.max_shooters THEN 'ueberbelegt'
        ELSE 'offen'
    END AS status
FROM public.contest_teams t
LEFT JOIN public.contest_setups s 
    ON t.contest_type = s.contest_type 
   AND t.year = s.year 
   AND t.team_name = s.team
GROUP BY t.contest_type, t.year, t.team_name, t.max_shooters, t.sort_order
ORDER BY t.contest_type, t.year, t.sort_order;

-- 5. INITIALDATEN: Standard-Teams für 2026 & 2027 idempotent sicherstellen
-- ------------------------------------------------------------------------------
INSERT INTO public.contest_teams (id, contest_type, year, team_name, max_shooters, sort_order)
VALUES
    -- 2026
    ('grenzland_2026_m1', 'grenzland', 2026, 'Muhen 1', 4, 10),
    ('grenzland_2026_m2', 'grenzland', 2026, 'Muhen 2', 4, 20),
    ('grenzland_2026_m3', 'grenzland', 2026, 'Muhen 3', 4, 30),
    ('mannschaft_2026_m1', 'mannschaft', 2026, 'Muhen 1', 8, 10),
    ('mannschaft_2026_m2', 'mannschaft', 2026, 'Muhen 2', 8, 20),
    ('mannschaft_2026_m3', 'mannschaft', 2026, 'Muhen 3', 8, 30),
    ('gruppe_2026_m1', 'gruppe', 2026, 'Muhen 1', 5, 10),
    ('gruppe_2026_m2', 'gruppe', 2026, 'Muhen 2', 5, 20),
    -- 2027 Vorbereitung
    ('grenzland_2027_m1', 'grenzland', 2027, 'Muhen 1', 4, 10),
    ('grenzland_2027_m2', 'grenzland', 2027, 'Muhen 2', 4, 20),
    ('grenzland_2027_m3', 'grenzland', 2027, 'Muhen 3', 4, 30),
    ('mannschaft_2027_m1', 'mannschaft', 2027, 'Muhen 1', 8, 10),
    ('mannschaft_2027_m2', 'mannschaft', 2027, 'Muhen 2', 8, 20),
    ('mannschaft_2027_m3', 'mannschaft', 2027, 'Muhen 3', 8, 30),
    ('gruppe_2027_m1', 'gruppe', 2027, 'Muhen 1', 5, 10),
    ('gruppe_2027_m2', 'gruppe', 2027, 'Muhen 2', 5, 20)
ON CONFLICT (contest_type, year, team_name) DO UPDATE 
SET max_shooters = EXCLUDED.max_shooters,
    sort_order = EXCLUDED.sort_order;

-- 6. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.contest_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_teams ENABLE ROW LEVEL SECURITY;

-- Leseberechtigung (Öffentlich / Authentifiziert)
DROP POLICY IF EXISTS "Public and Members can read contest_setups" ON public.contest_setups;
CREATE POLICY "Public and Members can read contest_setups"
    ON public.contest_setups FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public and Members can read contest_teams" ON public.contest_teams;
CREATE POLICY "Public and Members can read contest_teams"
    ON public.contest_teams FOR SELECT
    USING (true);

-- Schreibberechtigung (Vorstand & Schützenmeister, Entwicklungsmodus-kompatibel)
DROP POLICY IF EXISTS "Authorized roles can manage contest_setups" ON public.contest_setups;
CREATE POLICY "Authorized roles can manage contest_setups"
    ON public.contest_setups FOR ALL
    USING (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    )
    WITH CHECK (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    );

DROP POLICY IF EXISTS "Authorized roles can manage contest_teams" ON public.contest_teams;
CREATE POLICY "Authorized roles can manage contest_teams"
    ON public.contest_teams FOR ALL
    USING (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    )
    WITH CHECK (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    );
