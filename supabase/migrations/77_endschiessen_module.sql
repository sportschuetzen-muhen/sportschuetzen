-- ==============================================================================
-- 77_endschiessen_module.sql
-- Migration: Fachmodul ENDSCHIESSEN (Saisonabschluss KK 50m)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.endschiessen_seasons: Saisons, Jahres-Snapshots & Konfiguration
-- 2. public.endschiessen_stiche: Konfigurierte Stiche je Saison (Tabs/Reiter)
-- 3. public.endschiessen_scores: Schützen-Resultate (20 Schuss, Zehntel, Gaben, Differenzler)
-- 4. public.endschiessen_final_series: Serien 1-8 und Ausscheidungs-Final (Top 8)
--
-- Berechtigungen (RBAC):
-- - endschiessen.view   (Lesen / Navigation freigeschaltet)
-- - endschiessen.manage (Schreiben, Erfassen, Übertragen in JM)
-- ==============================================================================

-- 1. TABELLE: public.endschiessen_seasons
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.endschiessen_seasons (
    jahr VARCHAR(50) PRIMARY KEY,                       -- z. B. '2026', '2025'
    title VARCHAR(150) NOT NULL DEFAULT '',             -- z. B. 'Endschiessen 2026'
    event_date DATE,                                    -- Datum des Schiesstages
    is_archived BOOLEAN NOT NULL DEFAULT false,         -- Schreibschutz bei archivierten Jahren
    is_published BOOLEAN NOT NULL DEFAULT false,        -- Freigabe für Website & PWA
    live_display_active BOOLEAN NOT NULL DEFAULT false, -- Grossbild- / Beamer-Modus Schützenstube
    config JSONB NOT NULL DEFAULT '{
        "jm_sync_col": "Endschiessen",
        "final_participants_count": 8,
        "default_active_tab": "endstich"
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_endschiessen_seasons_archived ON public.endschiessen_seasons(is_archived);
CREATE INDEX IF NOT EXISTS idx_endschiessen_seasons_published ON public.endschiessen_seasons(is_published);

COMMENT ON TABLE public.endschiessen_seasons IS
    'Saisons und Jahres-Konfigurationen des Endschiessens der Sportschützen Muhen.';

-- 2. TABELLE: public.endschiessen_stiche
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.endschiessen_stiche (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jahr VARCHAR(50) NOT NULL REFERENCES public.endschiessen_seasons(jahr) ON UPDATE CASCADE ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,                          -- z. B. 'endstich', 'final', 'gaben', 'glueck', 'sie_er'
    title VARCHAR(150) NOT NULL,                        -- z. B. 'Endstich (20 Schuss)', 'Meister-Final'
    description TEXT,
    scheibe VARCHAR(50) NOT NULL DEFAULT 'A10',         -- 'A10', 'A100', 'Felsen'
    schusszahl INTEGER NOT NULL DEFAULT 20,
    modus VARCHAR(50) NOT NULL DEFAULT 'standard_20',   -- 'standard_20', 'final_elimination', 'tiefschuss', 'differenzler', 'team'
    sort_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_endschiessen_stich UNIQUE (jahr, code)
);

CREATE INDEX IF NOT EXISTS idx_endschiessen_stiche_jahr ON public.endschiessen_stiche(jahr, sort_order);

COMMENT ON TABLE public.endschiessen_stiche IS
    'Stiche und Disziplinen je Endschiessen-Saison (Reiter-System).';

-- 3. TABELLE: public.endschiessen_scores
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.endschiessen_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jahr VARCHAR(50) NOT NULL REFERENCES public.endschiessen_seasons(jahr) ON UPDATE CASCADE ON DELETE CASCADE,
    stich_id UUID NOT NULL REFERENCES public.endschiessen_stiche(id) ON UPDATE CASCADE ON DELETE CASCADE,
    person_number INTEGER REFERENCES public.members(person_number) ON UPDATE CASCADE ON DELETE SET NULL,
    guest_name VARCHAR(150),                            -- Falls Gastschütze (z. B. Sie & Er, Plausch)
    
    -- Endstich 20 Schuss (2 Passen à 10 Schuss)
    passe_1_score NUMERIC(5,1) DEFAULT 0,               -- Ganzpunkte Passe 1 (max 100)
    passe_1_decimal NUMERIC(5,1) DEFAULT 0,             -- Zehntel Passe 1 (max 109.0)
    passe_2_score NUMERIC(5,1) DEFAULT 0,               -- Ganzpunkte Passe 2 (max 100)
    passe_2_decimal NUMERIC(5,1) DEFAULT 0,             -- Zehntel Passe 2 (max 109.0)
    
    -- Totals
    total_score NUMERIC(6,1) NOT NULL DEFAULT 0,        -- Summe Ganzpunkte (max 200)
    total_decimal NUMERIC(6,1) NOT NULL DEFAULT 0,      -- Summe Zehntel (max 218.0)
    
    -- Spezielle Modi (Glück, Gaben, Differenzler)
    target_score NUMERIC(5,1),                          -- Zielwert bei Differenzler
    diff_score NUMERIC(5,1),                            -- Berechnete Abweichung |total - target|
    tiefschuss INTEGER,                                 -- Bester Tiefschuss (1/1000mm oder Teiler)
    
    -- Ränge
    rang_total INTEGER,                                 -- Offizieller Rang nach Ganzpunkten
    rang_decimal INTEGER,                               -- Rang nach reiner Zehntelwertung
    
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_endschiessen_score_entry UNIQUE (jahr, stich_id, person_number, guest_name)
);

CREATE INDEX IF NOT EXISTS idx_endschiessen_scores_lookup ON public.endschiessen_scores(jahr, stich_id, rang_total);
CREATE INDEX IF NOT EXISTS idx_endschiessen_scores_person ON public.endschiessen_scores(person_number);

COMMENT ON TABLE public.endschiessen_scores IS
    'Standblätter und Schützenresultate aller Stiche des Endschiessens.';

-- 4. TABELLE: public.endschiessen_final_series
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.endschiessen_final_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jahr VARCHAR(50) NOT NULL REFERENCES public.endschiessen_seasons(jahr) ON UPDATE CASCADE ON DELETE CASCADE,
    person_number INTEGER NOT NULL REFERENCES public.members(person_number) ON UPDATE CASCADE ON DELETE CASCADE,
    start_rang INTEGER NOT NULL,                        -- Qualifikationsrang aus Endstich (1–8)
    
    -- Serien 1 bis 8 (Punkte z. B. auf Hunderter-Wertung oder Zehntel)
    serie_1 NUMERIC(6,1) DEFAULT 0,
    serie_2 NUMERIC(6,1) DEFAULT 0,
    serie_3 NUMERIC(6,1) DEFAULT 0,
    serie_4 NUMERIC(6,1) DEFAULT 0,
    serie_5 NUMERIC(6,1) DEFAULT 0,
    serie_6 NUMERIC(6,1) DEFAULT 0,
    serie_7 NUMERIC(6,1) DEFAULT 0,
    serie_8 NUMERIC(6,1) DEFAULT 0,
    
    total_score NUMERIC(7,1) NOT NULL DEFAULT 0,        -- Kumuliertes Total
    final_rang INTEGER,                                 -- Endrang (1 = Meister, ..., 8)
    is_eliminated BOOLEAN NOT NULL DEFAULT false,       -- Kennzeichnung wenn ausgeschieden
    eliminated_in_serie INTEGER,                        -- In welcher Serie ausgeschieden
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_endschiessen_final_shooter UNIQUE (jahr, person_number)
);

CREATE INDEX IF NOT EXISTS idx_endschiessen_final_lookup ON public.endschiessen_final_series(jahr, total_score DESC);

COMMENT ON TABLE public.endschiessen_final_series IS
    'Ergebnisse des Meister-Finals der besten 8 Schützen (Ausscheidungs-Modus Serien 1-8).';

-- ==============================================================================
-- 5. INITIALE BERECHTIGUNGEN (RBAC) & MATRIX SEED (Richtlinie 7)
-- ==============================================================================
INSERT INTO public.role_permissions (role, permission, description) VALUES
  ('schuetzenmeister', 'endschiessen.view', 'Endschiessen einsehen'),
  ('schuetzenmeister', 'endschiessen.manage', 'Endschiessen erfassen & verwalten'),
  ('vorstand', 'endschiessen.view', 'Endschiessen einsehen'),
  ('vorstand', 'endschiessen.manage', 'Endschiessen erfassen & verwalten'),
  ('kassier', 'endschiessen.view', 'Endschiessen einsehen'),
  ('aktuar', 'endschiessen.view', 'Endschiessen einsehen'),
  ('materialwart', 'endschiessen.view', 'Endschiessen einsehen'),
  ('vermieter', 'endschiessen.view', 'Endschiessen einsehen')
ON CONFLICT (role, permission) DO NOTHING;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.endschiessen_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endschiessen_stiche ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endschiessen_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endschiessen_final_series ENABLE ROW LEVEL SECURITY;

-- 1. endschiessen_seasons
CREATE POLICY "endschiessen_seasons_select" ON public.endschiessen_seasons
    FOR SELECT TO authenticated, anon
    USING (is_published = true OR public.rbac_allows(ARRAY['endschiessen.view', 'endschiessen.manage']) OR auth.has_role('admin'));

CREATE POLICY "endschiessen_seasons_write" ON public.endschiessen_seasons
    FOR ALL TO authenticated
    USING (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'))
    WITH CHECK (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'));

-- 2. endschiessen_stiche
CREATE POLICY "endschiessen_stiche_select" ON public.endschiessen_stiche
    FOR SELECT TO authenticated, anon
    USING (
        EXISTS (
            SELECT 1 FROM public.endschiessen_seasons s 
            WHERE s.jahr = endschiessen_stiche.jahr 
              AND (s.is_published = true OR public.rbac_allows(ARRAY['endschiessen.view', 'endschiessen.manage']) OR auth.has_role('admin'))
        )
    );

CREATE POLICY "endschiessen_stiche_write" ON public.endschiessen_stiche
    FOR ALL TO authenticated
    USING (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'))
    WITH CHECK (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'));

-- 3. endschiessen_scores
CREATE POLICY "endschiessen_scores_select" ON public.endschiessen_scores
    FOR SELECT TO authenticated, anon
    USING (
        EXISTS (
            SELECT 1 FROM public.endschiessen_seasons s 
            WHERE s.jahr = endschiessen_scores.jahr 
              AND (s.is_published = true OR public.rbac_allows(ARRAY['endschiessen.view', 'endschiessen.manage']) OR auth.has_role('admin'))
        )
    );

CREATE POLICY "endschiessen_scores_write" ON public.endschiessen_scores
    FOR ALL TO authenticated
    USING (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'))
    WITH CHECK (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'));

-- 4. endschiessen_final_series
CREATE POLICY "endschiessen_final_series_select" ON public.endschiessen_final_series
    FOR SELECT TO authenticated, anon
    USING (
        EXISTS (
            SELECT 1 FROM public.endschiessen_seasons s 
            WHERE s.jahr = endschiessen_final_series.jahr 
              AND (s.is_published = true OR public.rbac_allows(ARRAY['endschiessen.view', 'endschiessen.manage']) OR auth.has_role('admin'))
        )
    );

CREATE POLICY "endschiessen_final_series_write" ON public.endschiessen_final_series
    FOR ALL TO authenticated
    USING (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'))
    WITH CHECK (public.rbac_allows(ARRAY['endschiessen.manage']) OR auth.has_role('admin'));

-- ==============================================================================
-- 7. INITIALER SEED: SAISON 2026 & BASIS-STICHE
-- ==============================================================================
INSERT INTO public.endschiessen_seasons (jahr, title, event_date, is_archived, is_published, live_display_active)
VALUES 
    ('2026', 'Endschiessen 2026', '2026-10-10', false, false, false)
ON CONFLICT (jahr) DO NOTHING;

INSERT INTO public.endschiessen_stiche (jahr, code, title, description, scheibe, schusszahl, modus, sort_order)
VALUES
    ('2026', 'endstich', 'Endstich (20 Schuss)', 'Hauptwettkampf mit 2 Passen à 10 Schuss (Ganz- und Zehntelwertung). Zählt zur Jahresmeisterschaft.', 'A10', 20, 'standard_20', 1),
    ('2026', 'final', 'Meister-Final (Top 8)', 'Ausscheidungsschiessen der 8 besten Schützen des Endstichs über Serien 1 bis 8.', 'A100', 24, 'final_elimination', 2),
    ('2026', 'gaben', 'Gabenstich / Fleischstich', 'Preise vom Gabentempel. Wertung nach bestem Tiefschuss / Teiler.', 'A100', 6, 'tiefschuss', 3),
    ('2026', 'glueck', 'Glücksstich / Differenzler', 'Geheimer Zielwert vor dem Schiessen deklariert. Kleinste Differenz gewinnt.', 'A10', 10, 'differenzler', 4),
    ('2026', 'sie_er', 'Sie & Er (Stich à Deux)', 'Partnerstich: 2 Personen (Aktivschütze + Partner/Gast), kombiniertes Total.', 'A10', 10, 'team', 5)
ON CONFLICT (jahr, code) DO NOTHING;

-- Schema-Cache von PostgREST sofort aktualisieren
NOTIFY pgrst, 'reload schema';
