-- ==============================================================================
-- 12_results_module.sql
-- Migration: Fachmodul RESULTATE & WETTKÄMPFE (Grenzlandcup, Mannschaft, Gruppe)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.contest_results: Schiessresultate je Wettbewerb, Jahr, Runde & Schütze
-- 2. public.contest_setups: Schützen-Zuteilungen und Vorerfassung aus Team Manager
-- 3. public.contest_teams: Team-Konfigurationen je Wettbewerb und Jahr
-- 4. public.contest_ocr_logs: Audit-Log für KI-Bilderkennung von Standblättern
-- ==============================================================================

-- 1. TABELLE: public.contest_results (Resultate)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contest_results (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. 'grenzland_2026_1001' oder UUID
    contest_type VARCHAR(50) NOT NULL DEFAULT 'grenzland', -- 'grenzland', 'mannschaft', 'gruppe'
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    person_number VARCHAR(50) NOT NULL,                 -- SSV-Personennummer / Mitglieder-ID
    name VARCHAR(150) NOT NULL,                         -- Name des Schützen (Nachname Vorname)
    stellung VARCHAR(50) DEFAULT 'liegend',             -- 'liegend', 'kniend' (besonders relevant für Gruppenmeisterschaft)
    
    -- Runde 1
    r1_team VARCHAR(50) DEFAULT '',                     -- Teamname (z. B. 'Muhen 1') oder leer für 'Pool'
    r1_p1 INTEGER,                                      -- Punkte Passe 1 (0-100)
    r1_p2 INTEGER,                                      -- Punkte Passe 2 (Gruppe)
    
    -- Runde 2
    r2_team VARCHAR(50) DEFAULT '',                     -- Default = r1_team (Vererbung)
    r2_p1 INTEGER,                                      -- Punkte Passe 1 (0-100)
    r2_p2 INTEGER,                                      -- Punkte Passe 2 (Gruppe)
    
    -- Runde 3
    r3_team VARCHAR(50) DEFAULT '',                     -- Default = r2_team (Vererbung)
    r3_p1 INTEGER,                                      -- Punkte Passe 1 (0-100)
    r3_p2 INTEGER,                                      -- Punkte Passe 2 (Gruppe)
    
    -- Flags für automatische Vererbung
    is_auto_r2 BOOLEAN NOT NULL DEFAULT true,
    is_auto_r3 BOOLEAN NOT NULL DEFAULT true,
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contest_results_entry UNIQUE (contest_type, year, person_number)
);

CREATE INDEX IF NOT EXISTS idx_contest_res_type_year ON public.contest_results(contest_type, year);
CREATE INDEX IF NOT EXISTS idx_contest_res_pn ON public.contest_results(person_number);
CREATE INDEX IF NOT EXISTS idx_contest_res_r1_team ON public.contest_results(r1_team);
CREATE INDEX IF NOT EXISTS idx_contest_res_r2_team ON public.contest_results(r2_team);
CREATE INDEX IF NOT EXISTS idx_contest_res_r3_team ON public.contest_results(r3_team);

-- 2. TABELLE: public.contest_setups (Team-Manager Zuteilungen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contest_setups (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. 'setup_grenzland_2026_1001'
    contest_type VARCHAR(50) NOT NULL DEFAULT 'grenzland', -- 'grenzland', 'mannschaft', 'gruppe'
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    person_number VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    team VARCHAR(50) DEFAULT '',                        -- Primäre Zuteilung (z. B. 'Muhen 1')
    stellung VARCHAR(50) DEFAULT 'liegend',             -- 'liegend', 'kniend'
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contest_setup_entry UNIQUE (contest_type, year, person_number)
);

CREATE INDEX IF NOT EXISTS idx_contest_setup_type_year ON public.contest_setups(contest_type, year);
CREATE INDEX IF NOT EXISTS idx_contest_setup_pn ON public.contest_setups(person_number);
CREATE INDEX IF NOT EXISTS idx_contest_setup_team ON public.contest_setups(team);

-- 3. TABELLE: public.contest_teams (Konfigurierte Teams je Wettbewerb)
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

-- 4. TABELLE: public.contest_ocr_logs (Audit-Trail KI-Standblatterkennung)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contest_ocr_logs (
    id VARCHAR(50) PRIMARY KEY,
    contest_type VARCHAR(50) NOT NULL DEFAULT 'grenzland',
    round VARCHAR(20) NOT NULL DEFAULT 'r1',
    model_used VARCHAR(50),
    recognized_count INTEGER DEFAULT 0,
    raw_response JSONB,
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contest_ocr_created ON public.contest_ocr_logs(created_at DESC);

-- 5. INITIALDATEN: public.contest_teams (Standard-Teams)
-- ------------------------------------------------------------------------------
INSERT INTO public.contest_teams (id, contest_type, year, team_name, max_shooters, sort_order)
VALUES
    ('grenzland_2026_m1', 'grenzland', 2026, 'Muhen 1', 4, 10),
    ('grenzland_2026_m2', 'grenzland', 2026, 'Muhen 2', 4, 20),
    ('grenzland_2026_m3', 'grenzland', 2026, 'Muhen 3', 4, 30),
    ('mannschaft_2026_m1', 'mannschaft', 2026, 'Muhen 1', 8, 10),
    ('mannschaft_2026_m2', 'mannschaft', 2026, 'Muhen 2', 8, 20),
    ('mannschaft_2026_m3', 'mannschaft', 2026, 'Muhen 3', 8, 30),
    ('gruppe_2026_m1', 'gruppe', 2026, 'Muhen 1', 5, 10),
    ('gruppe_2026_m2', 'gruppe', 2026, 'Muhen 2', 5, 20)
ON CONFLICT (contest_type, year, team_name) DO NOTHING;

-- 6. TRIGGER: updated_at Aktualisierung
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_contest_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contest_results_updated ON public.contest_results;
CREATE TRIGGER trg_contest_results_updated
    BEFORE UPDATE ON public.contest_results
    FOR EACH ROW
    EXECUTE FUNCTION public.set_contest_updated_at();

DROP TRIGGER IF EXISTS trg_contest_setups_updated ON public.contest_setups;
CREATE TRIGGER trg_contest_setups_updated
    BEFORE UPDATE ON public.contest_setups
    FOR EACH ROW
    EXECUTE FUNCTION public.set_contest_updated_at();

-- 7. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.contest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_ocr_logs ENABLE ROW LEVEL SECURITY;

-- Leseberechtigung (Öffentlich / Authentifiziert für Vereinsmitglieder & App)
CREATE POLICY "Public and Members can read contest_results"
    ON public.contest_results FOR SELECT
    USING (true);

CREATE POLICY "Public and Members can read contest_setups"
    ON public.contest_setups FOR SELECT
    USING (true);

CREATE POLICY "Public and Members can read contest_teams"
    ON public.contest_teams FOR SELECT
    USING (true);

CREATE POLICY "Authenticated can read contest_ocr_logs"
    ON public.contest_ocr_logs FOR SELECT
    USING (true);

-- Schreibberechtigung (Vorstand & Schützenmeister, Entwicklungsmodus-kompatibel)
CREATE POLICY "Authorized roles can manage contest_results"
    ON public.contest_results FOR ALL
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

CREATE POLICY "Authorized roles can manage contest_ocr_logs"
    ON public.contest_ocr_logs FOR ALL
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
