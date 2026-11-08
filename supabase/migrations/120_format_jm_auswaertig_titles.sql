-- ==============================================================================
-- 120_format_jm_auswaertig_titles.sql
-- Migration: Harmonisierung der Auswärtsschiessen-Titel in der Jahresmeisterschaft
-- Format: «Anlass (Ortschaft) Jahr» (Variante A)
-- ==============================================================================

-- 1. Aktualisierung der Spaltentitel in jm_seasons (Saison 'current')
UPDATE public.jm_seasons
SET raw_grid = jsonb_set(
    jsonb_set(
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    raw_grid,
                    '{2,41}', to_jsonb('Deisigrabenschiessen (Sulz) 2026'::text)
                ),
                '{2,42}', to_jsonb('Balsthaler Liegendmatch 2026'::text)
            ),
            '{2,43}', to_jsonb('Bärenmoos-Schiessen (Villmergen) 2026'::text)
        ),
        '{2,44}', to_jsonb('Stumpenland-Schiessen (Menziken-Burg) 2026'::text)
    ),
    '{2,49}', to_jsonb('Siggenbergschiessen (Siggenthal) 2026'::text)
),
updated_at = now()
WHERE jahr = 'current';

-- 2. Aktualisierung der exportierten Auswärts-Wettkampfnamen in jm_shooters (Saison 'current')
UPDATE public.jm_shooters
SET details = (
    replace(
        replace(
            replace(
                replace(
                    replace(
                        details::text,
                        '"Deisigrabenschiessen 2026"',
                        '"Deisigrabenschiessen (Sulz) 2026"'
                    ),
                    '"Balsthaler Liegendmatch"',
                    '"Balsthaler Liegendmatch 2026"'
                ),
                '"Bärenmoos-Schiessen 2026"',
                '"Bärenmoos-Schiessen (Villmergen) 2026"'
            ),
            '"Stumpenland-Schiessen 2026"',
            '"Stumpenland-Schiessen (Menziken-Burg) 2026"'
        ),
        '"Siggenbergschiessen"',
        '"Siggenbergschiessen (Siggenthal) 2026"'
    )
)::jsonb,
updated_at = now()
WHERE jahr = 'current';
