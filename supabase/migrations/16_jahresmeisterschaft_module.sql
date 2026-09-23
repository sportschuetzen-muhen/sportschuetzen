-- ==============================================================================
-- 16_jahresmeisterschaft_module.sql
-- Migration: Fachmodul KK-JAHRESMEISTERSCHAFT (Phase 15)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.jm_seasons: Saisons, Jahres-Snapshots & 2D-Grid (raw_grid, junior_exclusions)
-- 2. public.jm_shooters: Strukturierte Schützenübersicht je Saison (Rang, Ligen 1 & 2, Totals)
-- 3. public.jm_competitions: Konfigurierte Schiessen und Wettkämpfe je Saison
-- ==============================================================================

-- 1. TABELLE: public.jm_seasons (Saisons & Tabellenmatrizen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jm_seasons (
    jahr VARCHAR(50) PRIMARY KEY,                       -- z. B. 'current', '2026', '2025'
    title VARCHAR(150) NOT NULL DEFAULT '',             -- z. B. 'Jahresmeisterschaft 2026 (aktuell)'
    raw_grid JSONB NOT NULL DEFAULT '[]'::jsonb,        -- 2D-Array aller Zellen (Headers, Checkboxen, Schützen, Punkte)
    junior_exclusions JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array von Personennummern / Schlüsseln
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jm_seasons_archived ON public.jm_seasons(is_archived);
CREATE INDEX IF NOT EXISTS idx_jm_seasons_updated ON public.jm_seasons(updated_at DESC);

COMMENT ON TABLE public.jm_seasons IS
    'Saisons und 2D-Tabellenmatrizen der KK-Jahresmeisterschaft Sportschützen Muhen.';

-- 2. TABELLE: public.jm_shooters (Strukturierte Auswertung / Rangliste)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jm_shooters (
    id VARCHAR(100) PRIMARY KEY,                        -- z. B. 'current_1001' oder '2026_1001'
    jahr VARCHAR(50) NOT NULL REFERENCES public.jm_seasons(jahr) ON UPDATE CASCADE ON DELETE CASCADE,
    person_number VARCHAR(50) NOT NULL DEFAULT '',
    name VARCHAR(150) NOT NULL,
    jahrgang INTEGER,
    liga INTEGER NOT NULL DEFAULT 1,                    -- 1 (Liga 1, 8 Schützen), 2 (Liga 2)
    rang INTEGER,
    total NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    streichresultat_prz NUMERIC(6,2),
    status VARCHAR(50) NOT NULL DEFAULT 'neutral',      -- 'aufstieg', 'abstieg', 'neutral'
    is_junior BOOLEAN NOT NULL DEFAULT false,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { schiessen: [...], mannschaft: [...], auswaerts: [...] }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_jm_shooters_season_pn UNIQUE (jahr, person_number, name)
);

CREATE INDEX IF NOT EXISTS idx_jm_shooters_jahr ON public.jm_shooters(jahr);
CREATE INDEX IF NOT EXISTS idx_jm_shooters_liga ON public.jm_shooters(liga);
CREATE INDEX IF NOT EXISTS idx_jm_shooters_rang ON public.jm_shooters(rang);
CREATE INDEX IF NOT EXISTS idx_jm_shooters_total ON public.jm_shooters(total DESC);

COMMENT ON TABLE public.jm_shooters IS
    'Normalisierte Ranglisten und Schützenresultate je Saison für PWA und Auswertungen.';

-- 3. TABELLE: public.jm_competitions (Wettkämpfe und Schiessen je Saison)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jm_competitions (
    id VARCHAR(100) PRIMARY KEY,                        -- z. B. 'current_col_6'
    jahr VARCHAR(50) NOT NULL REFERENCES public.jm_seasons(jahr) ON UPDATE CASCADE ON DELETE CASCADE,
    col_index INTEGER NOT NULL,
    titel VARCHAR(255) NOT NULL,
    max_punkte NUMERIC(8,2) NOT NULL DEFAULT 100.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    typ VARCHAR(100) NOT NULL DEFAULT 'wettkampf',      -- 'verband', 'kantonalstich', 'vereinswett', 'auswaertig', 'endschiessen'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_jm_comp_season_col UNIQUE (jahr, col_index)
);

CREATE INDEX IF NOT EXISTS idx_jm_comp_jahr ON public.jm_competitions(jahr);
CREATE INDEX IF NOT EXISTS idx_jm_comp_col ON public.jm_competitions(col_index);

COMMENT ON TABLE public.jm_competitions IS
    'Konfigurierte Schiessanlässe und Spaltendefinitionen je Jahresmeisterschafts-Saison.';

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.jm_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jm_shooters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jm_competitions ENABLE ROW LEVEL SECURITY;

-- 1. jm_seasons Policies
CREATE POLICY "jm_seasons_select_all"
    ON public.jm_seasons FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "jm_seasons_insert_auth"
    ON public.jm_seasons FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

CREATE POLICY "jm_seasons_update_auth"
    ON public.jm_seasons FOR UPDATE
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "jm_seasons_delete_auth"
    ON public.jm_seasons FOR DELETE
    TO authenticated, anon
    USING (true);

-- 2. jm_shooters Policies
CREATE POLICY "jm_shooters_select_all"
    ON public.jm_shooters FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "jm_shooters_insert_auth"
    ON public.jm_shooters FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

CREATE POLICY "jm_shooters_update_auth"
    ON public.jm_shooters FOR UPDATE
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "jm_shooters_delete_auth"
    ON public.jm_shooters FOR DELETE
    TO authenticated, anon
    USING (true);

-- 3. jm_competitions Policies
CREATE POLICY "jm_competitions_select_all"
    ON public.jm_competitions FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "jm_competitions_insert_auth"
    ON public.jm_competitions FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

CREATE POLICY "jm_competitions_update_auth"
    ON public.jm_competitions FOR UPDATE
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "jm_competitions_delete_auth"
    ON public.jm_competitions FOR DELETE
    TO authenticated, anon
    USING (true);

-- ==============================================================================
-- UPDATED_AT TRIGGER
-- ==============================================================================
CREATE OR REPLACE TRIGGER trg_jm_seasons_updated_at
    BEFORE UPDATE ON public.jm_seasons
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_jm_shooters_updated_at
    BEFORE UPDATE ON public.jm_shooters
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE OR REPLACE TRIGGER trg_jm_competitions_updated_at
    BEFORE UPDATE ON public.jm_competitions
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_updated_at();
