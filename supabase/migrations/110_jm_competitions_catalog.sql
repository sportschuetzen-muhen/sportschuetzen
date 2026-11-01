-- ==============================================================================
-- 110_jm_competitions_catalog.sql
-- Migration: Stammdaten-Katalog Schützenfeste & Auswärtige Schiessen
-- Modul: KK-Jahresmeisterschaft
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.jm_competitions_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anlass VARCHAR(150) NOT NULL,
    ort VARCHAR(100) NOT NULL DEFAULT '',
    suchbegriffe TEXT NOT NULL DEFAULT '',
    max_punkte NUMERIC(8,2) NOT NULL DEFAULT 100.00,
    stich_typ VARCHAR(50) NOT NULL DEFAULT 'standard_100', -- 'standard_100', 'liegend_600', 'sektion_200', 'auszahler_600'
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_jm_catalog_anlass UNIQUE (anlass)
);

CREATE INDEX IF NOT EXISTS idx_jm_catalog_active ON public.jm_competitions_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_jm_catalog_sort ON public.jm_competitions_catalog(sort_order, anlass);

COMMENT ON TABLE public.jm_competitions_catalog IS
    'Katalog bekannter Schützenfeste und Schiessanlässe mit Suchbegriffen für automatisches Matching.';

-- RLS aktivieren
ALTER TABLE public.jm_competitions_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jm_catalog_select"
    ON public.jm_competitions_catalog FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "jm_catalog_insert"
    ON public.jm_competitions_catalog FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "jm_catalog_update"
    ON public.jm_competitions_catalog FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "jm_catalog_delete"
    ON public.jm_competitions_catalog FOR DELETE
    TO authenticated
    USING (true);

-- Initialer Datenbestand (exakt aus altem Google Sheets Schützenfeste-Katalog)
INSERT INTO public.jm_competitions_catalog (anlass, ort, suchbegriffe, max_punkte, stich_typ, is_active, sort_order)
VALUES
    ('Bärenmoos-Schiessen', 'Villmergen', 'baerenmoos;baeren moos;baeren-moos;bärenmoos;bären moos;baeremoos;villmergen baerenmoos;villmergen bärenmoos;villmergen baeren moos', 100, 'standard_100', true, 10),
    ('Sonnenberg-Schiessen', 'Reinach', 'sonnenberg;sonnenberg-schiessen;sonnen berg;sonenberg;reinach sonnenberg;reinach sonnenberg-schiessen', 100, 'standard_100', true, 20),
    ('Stumpenland-Schiessen', 'Menziken-Burg', 'stumpenland;stumpen land;stumpenlandschiessen;menziken-burg stumpenland;menziken-burg stumpenland-schiessen', 100, 'standard_100', true, 30),
    ('Fricktaler-Schiessen', 'Frick', 'fricktaler;fricktaler-schiessen;fricktaler schiessen;frick fricktaler;frick fricktaler-schiessen', 100, 'standard_100', true, 40),
    ('Kornberg-Schiessen', 'Gipf-Oberfrick', 'kornberg;kornberg-schiessen;korn berg;gipf-oberfrick kornberg;gipf-oberfrick kornberg-schiessen', 100, 'standard_100', true, 50),
    ('Laubbergschiessen', 'Mettauertal', 'laubberg;laubbergschiessen;laub berg;mettauertal laubberg;mettauertal laubbergschiessen', 100, 'standard_100', true, 60),
    ('Deisigrabenschiessen', 'Sulz', 'deisigraben;deisigraben-schiessen;deisigraben schiessen;sulz deisigraben;sulz deisigrabenschiessen', 100, 'standard_100', true, 70),
    ('Siggenbergschiessen', 'Siggenthal', 'siggenberg;siggenberg-schiessen;siggen berg;siggenthal siggenberg;siggenthal siggenberg-schiessen', 100, 'standard_100', true, 80),
    ('Vindonissa-Schiessen', 'Brugg', 'vindonissa;vindonissa-schiessen;vindonissa schiessen;brugg vindonissa;brugg vindonissa-schiessen', 100, 'standard_100', true, 90),
    ('Les Trois-Tour', 'Fribourg', 'les trois-tour;trois;les amis du pc;trois tour;les trois tours;fribourg les trois-tour;fribourg trois tour', 100, 'standard_100', true, 100),
    ('Berchtoldstagschiessen', 'Kollbrunn', 'berchtoldstagschiessen;berchtolds tagschiessen;berchtoldstag;kollbrunn berchtoldstagschiessen;kollbrunn berchtoldstag', 100, 'standard_100', true, 110),
    ('Storenbergschiessen', 'Dettighofen', 'storenbergschiessen;storen berg schiessen;storenberg;dettighofen storenberg;dettighofen storenbergschiessen', 100, 'standard_100', true, 120),
    ('Cholberg-Schiessen', 'Bazenheid', 'cholberg-schiessen;cholberg schiessen;cholberg;bazenheid cholberg-schiessen;bazenheid cholberg', 100, 'standard_100', true, 130),
    ('Standweihschiessen Aach', 'Neckertal', 'standweihschiessen aach;standweih aach;standweihschiessen aach neckertal;neckertal standweih aach', 100, 'standard_100', true, 140),
    ('Wildenburgschiessen', 'Wildhaus', 'wildenburgschiessen;wildenburg;wild haus;wildhaus wildenburg;wildhaus wildenburgschiessen', 100, 'standard_100', true, 150),
    ('Adliswiler Matchtage', 'Adliswil', 'adliswiler matchtage;adliswil matchtage;adliswil;adliswiler adliswiler matchtage', 600, 'liegend_600', true, 160),
    ('Winterthurer Liegendmatch', 'Winterthur-Stadt', 'winterthurer liegendmatch;winterthur liegend;winterthur-stadt;winterthur-liegend;winterthur-stadt winterthurer liegendmatch;liegendmatch winterthur', 600, 'liegend_600', true, 170),
    ('Hasenbergschiessen', 'Kirchberg', 'hasenbergschiessen;hasenberg;kirchberg;hasenberg schiessen;kirchberg hasenberg;kirchberg hasenbergschiessen', 100, 'standard_100', true, 180),
    ('Speckschiessen', 'Egnach', 'speckschiessen;speck schiessen;egnach speck;egnach speckschiessen', 100, 'standard_100', true, 190),
    ('Nachtschiessen', 'Lengwil', 'nachtschiessen;nachts schiessen;lengwil nachts;lengwil nachtschiessen', 100, 'standard_100', true, 200),
    ('Adliswiler Nachtschiessen für G50m', 'Adliswil', 'adliswiler nachtschiessen;adliswiler nachtschiessen g50;g50;adliswil;adliswil g50;adliswil adliswiler nachtschiessen', 100, 'standard_100', true, 210),
    ('Chlausschiessen', 'Kreuzlingen', 'chlausschiessen;chlaus schiessen;kreuzlingen chlaus;chlausschiessen kreuzlingen', 100, 'standard_100', true, 220),
    ('St. Sebastiansschiessen', 'Neuendorf', 'neuendorf;haerkingen;härkingen;sebastiansschiessen;sebastian;st. sebastiansschiessen', 100, 'standard_100', true, 230)
ON CONFLICT (anlass) DO UPDATE
SET
    ort = EXCLUDED.ort,
    suchbegriffe = EXCLUDED.suchbegriffe,
    max_punkte = EXCLUDED.max_punkte,
    stich_typ = EXCLUDED.stich_typ,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();
