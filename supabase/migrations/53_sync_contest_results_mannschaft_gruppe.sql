-- ==============================================================================
-- 53_sync_contest_results_mannschaft_gruppe.sql
-- Migration: Datenübertrag Mannschaftsmeisterschaft (SMM) & Gruppenmeisterschaft (SGM)
--            nach public.contest_results & Stored Procedure zur JM-Synchronisation
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. GRUPPENMEISTERSCHAFT (SGM) 2026: 11 Schützen mit 3 Runden à 2 Passen
-- ------------------------------------------------------------------------------
INSERT INTO public.contest_results (
    id, contest_type, year, person_number, name, stellung,
    r1_team, r1_p1, r1_p2,
    r2_team, r2_p1, r2_p2,
    r3_team, r3_p1, r3_p2,
    is_auto_r2, is_auto_r3
)
VALUES
    ('gruppe_2026_1080345', 'gruppe', 2026, '1080345', 'Fischer Marco', 'liegend',
     'Muhen 1', 98, 100, 'Muhen 1', 97, 97, 'Muhen 1', 94, 98, true, true),

    ('gruppe_2026_1274419', 'gruppe', 2026, '1274419', 'Rossi Olivia', 'liegend',
     'Muhen 1', 96, 97, 'Muhen 1', 99, 100, 'Muhen 1', 99, 99, true, true),

    ('gruppe_2026_1128417', 'gruppe', 2026, '1128417', 'Zurbriggen Nicole', 'liegend',
     'Muhen 1', 96, 99, 'Muhen 1', 96, 95, 'Muhen 1', 99, 96, true, true),

    ('gruppe_2026_1048717', 'gruppe', 2026, '1048717', 'Luginbühl Jürg', 'kniend',
     'Muhen 1', 93, 92, 'Muhen 1', 96, 99, 'Muhen 1', 96, 95, true, true),

    ('gruppe_2026_1225081', 'gruppe', 2026, '1225081', 'Rossi Andrea', 'kniend',
     'Muhen 1', 96, 96, 'Muhen 1', 95, 98, 'Muhen 1', 98, 100, true, true),

    ('gruppe_2026_1070293', 'gruppe', 2026, '1070293', 'Augsburger Beat', 'liegend',
     'Muhen 2', 97, 99, 'Muhen 2', 96, 94, 'Muhen 2', 98, 97, true, true),

    ('gruppe_2026_1073704', 'gruppe', 2026, '1073704', 'Berchtold Daniel', 'liegend',
     'Muhen 2', 96, 95, 'Muhen 2', 98, 96, 'Muhen 2', 99, 98, true, true),

    ('gruppe_2026_1756055', 'gruppe', 2026, '1756055', 'Burkhalter Lukas', 'liegend',
     'Muhen 2', 96, 99, 'Muhen 2', NULL, NULL, 'Muhen 2', NULL, NULL, true, true),

    ('gruppe_2026_1763202', 'gruppe', 2026, '1763202', 'Morgenthaler Lars', 'kniend',
     'Muhen 2', 93, 93, 'Muhen 2', 91, 90, 'Muhen 2', 88, 94, true, true),

    ('gruppe_2026_1026762', 'gruppe', 2026, '1026762', 'Plattner Riwana', 'kniend',
     'Muhen 2', 96, 94, 'Muhen 2', 94, 93, 'Muhen 2', 96, 91, true, true),

    ('gruppe_2026_1410615', 'gruppe', 2026, '1410615', 'Keller Christiane', 'liegend',
     'Muhen 2', NULL, NULL, 'Muhen 2', 97, 99, 'Muhen 2', 98, 96, true, true)
ON CONFLICT (contest_type, year, person_number) DO UPDATE
SET name = EXCLUDED.name,
    stellung = EXCLUDED.stellung,
    r1_team = EXCLUDED.r1_team,
    r1_p1 = EXCLUDED.r1_p1,
    r1_p2 = EXCLUDED.r1_p2,
    r2_team = EXCLUDED.r2_team,
    r2_p1 = EXCLUDED.r2_p1,
    r2_p2 = EXCLUDED.r2_p2,
    r3_team = EXCLUDED.r3_team,
    r3_p1 = EXCLUDED.r3_p1,
    r3_p2 = EXCLUDED.r3_p2,
    updated_at = now();


-- 2. MANNSCHAFTSMEISTERSCHAFT (SMM) 2026: 24 Schützen mit allen 7 Runden
-- ------------------------------------------------------------------------------
INSERT INTO public.contest_results (
    id, contest_type, year, person_number, name, stellung,
    r1_team, r1_p1,
    r2_team, r2_p1,
    r3_team, r3_p1,
    r4_team, r4_p1,
    r5_team, r5_p1,
    r6_team, r6_p1,
    r7_team, r7_p1,
    is_auto_r2, is_auto_r3
)
VALUES
    -- Muhen 1 (Kernmannschaft)
    ('mannschaft_2026_1080345', 'mannschaft', 2026, '1080345', 'Fischer Marco', 'liegend',
     'Muhen 1', 192, 'Muhen 1', 194, 'Muhen 1', 197, 'Muhen 1', 197, 'Muhen 1', 197, 'Muhen 1', 194, 'Muhen 1', 191, true, true),

    ('mannschaft_2026_1247351', 'mannschaft', 2026, '1247351', 'Hediger Simon', 'liegend',
     'Muhen 1', 188, 'Muhen 1', 190, 'Muhen 2', 187, 'Muhen 2', 183, 'Muhen 2', 189, 'Muhen 2', 186, 'Muhen 2', 185, false, false),

    ('mannschaft_2026_1410615', 'mannschaft', 2026, '1410615', 'Keller Christiane', 'liegend',
     'Muhen 1', 193, 'Muhen 1', 198, 'Muhen 1', 197, 'Muhen 1', 194, 'Muhen 1', 192, 'Muhen 1', 194, 'Muhen 1', 196, true, true),

    ('mannschaft_2026_1048717', 'mannschaft', 2026, '1048717', 'Luginbühl Jürg', 'liegend',
     'Muhen 1', 197, 'Muhen 1', 196, 'Muhen 1', 199, 'Muhen 1', 198, 'Muhen 1', 195, 'Muhen 1', 194, 'Muhen 1', 194, true, true),

    ('mannschaft_2026_1763202', 'mannschaft', 2026, '1763202', 'Morgenthaler Lars', 'liegend',
     'Muhen 1', 193, 'Muhen 1', 196, 'Muhen 1', 196, 'Muhen 1', 192, 'Muhen 1', 195, 'Muhen 1', 193, 'Muhen 1', 191, true, true),

    ('mannschaft_2026_1225081', 'mannschaft', 2026, '1225081', 'Rossi Andrea', 'liegend',
     'Muhen 1', 198, 'Muhen 1', 196, 'Muhen 1', 199, 'Muhen 1', 196, 'Muhen 1', 196, 'Muhen 1', 198, 'Muhen 1', 199, true, true),

    ('mannschaft_2026_1274419', 'mannschaft', 2026, '1274419', 'Rossi Olivia', 'liegend',
     'Muhen 1', 196, 'Muhen 1', 194, 'Muhen 1', 193, 'Muhen 1', 199, 'Muhen 1', 198, 'Muhen 1', 196, 'Muhen 1', 199, true, true),

    ('mannschaft_2026_1128417', 'mannschaft', 2026, '1128417', 'Zurbriggen Nicole', 'liegend',
     'Muhen 1', 197, 'Muhen 1', 195, 'Muhen 1', 194, 'Muhen 1', 194, 'Muhen 1', 192, 'Muhen 1', 198, 'Muhen 1', 198, true, true),

    -- Muhen 2 (Kernmannschaft)
    ('mannschaft_2026_1070293', 'mannschaft', 2026, '1070293', 'Augsburger Beat', 'liegend',
     'Muhen 2', 188, 'Muhen 2', 195, 'Muhen 2', 193, 'Muhen 2', 194, 'Muhen 2', 188, 'Muhen 2', 195, 'Muhen 2', 193, true, true),

    ('mannschaft_2026_1073704', 'mannschaft', 2026, '1073704', 'Berchtold Daniel', 'liegend',
     'Muhen 2', 189, 'Muhen 2', 193, 'Muhen 2', 195, 'Muhen 2', 196, 'Muhen 2', 193, 'Muhen 2', 195, 'Muhen 2', 196, true, true),

    ('mannschaft_2026_1756055', 'mannschaft', 2026, '1756055', 'Burkhalter Lukas', 'liegend',
     'Muhen 2', 195, 'Muhen 2', 195, 'Muhen 2', 196, 'Muhen 2', 195, 'Muhen 2', 190, 'Muhen 2', 185, 'Muhen 2', 192, true, true),

    ('mannschaft_2026_1052176', 'mannschaft', 2026, '1052176', 'Eichenberger Barbara', 'liegend',
     'Muhen 2', 185, 'Muhen 2', 192, 'Muhen 2', 193, 'Muhen 2', 197, 'Muhen 2', 191, 'Muhen 2', 195, 'Muhen 2', 199, true, true),

    ('mannschaft_2026_1080343', 'mannschaft', 2026, '1080343', 'Hunziker Erich', 'liegend',
     'Muhen 2', 196, 'Muhen 2', 196, 'Muhen 1', 190, 'Muhen 1', 192, 'Muhen 1', 194, 'Muhen 1', 197, 'Muhen 1', 194, false, false),

    ('mannschaft_2026_1253636', 'mannschaft', 2026, '1253636', 'Seeberger Roger', 'liegend',
     'Muhen 2', 187, 'Muhen 2', 191, 'Muhen 2', 193, 'Muhen 2', 188, 'Muhen 2', 194, 'Muhen 2', 192, 'Muhen 2', 195, true, true),

    ('mannschaft_2026_2201937', 'mannschaft', 2026, '2201937', 'Suty Martina', 'liegend',
     'Muhen 2', 195, 'Muhen 2', 197, 'Muhen 2', 194, 'Muhen 2', 197, 'Muhen 2', 194, 'Muhen 2', 196, 'Muhen 2', 197, true, true),

    ('mannschaft_2026_1046383', 'mannschaft', 2026, '1046383', 'Verrillo Simone Luigi', 'liegend',
     'Muhen 2', 198, 'Muhen 2', 197, 'Muhen 2', 195, 'Muhen 2', 195, 'Muhen 2', 193, 'Muhen 2', 197, 'Muhen 2', 193, true, true),

    -- Muhen 3 (Kernmannschaft)
    ('mannschaft_2026_1252792', 'mannschaft', 2026, '1252792', 'Aeberhard Andreas', 'liegend',
     'Muhen 3', 192, 'Muhen 3', 193, 'Muhen 3', 195, 'Muhen 3', 190, 'Muhen 3', 191, 'Muhen 3', 189, 'Muhen 3', 193, true, true),

    ('mannschaft_2026_1045507', 'mannschaft', 2026, '1045507', 'Boss Ria', 'liegend',
     'Muhen 3', 193, 'Muhen 3', 194, 'Muhen 3', 194, 'Muhen 3', 196, 'Muhen 3', 192, 'Muhen 3', 198, 'Muhen 3', 191, true, true),

    ('mannschaft_2026_1042289', 'mannschaft', 2026, '1042289', 'Frey Felix', 'liegend',
     'Muhen 3', 182, 'Muhen 3', 192, 'Muhen 3', 193, 'Muhen 3', 195, 'Muhen 3', 195, 'Muhen 3', 193, 'Muhen 3', 193, true, true),

    ('mannschaft_2026_1857354', 'mannschaft', 2026, '1857354', 'Läuppi Raphael', 'liegend',
     'Muhen 3', 189, 'Muhen 3', 188, 'Muhen 3', 189, 'Muhen 3', 194, 'Muhen 3', 194, 'Muhen 3', 194, 'Muhen 3', 195, true, true),

    ('mannschaft_2026_1026762', 'mannschaft', 2026, '1026762', 'Plattner Riwana', 'liegend',
     'Muhen 3', 191, 'Muhen 3', 194, 'Muhen 3', 191, 'Muhen 3', 192, 'Muhen 3', 197, 'Muhen 3', 191, 'Muhen 3', 197, true, true),

    ('mannschaft_2026_2193321', 'mannschaft', 2026, '2193321', 'Schweizer Ayleen', 'liegend',
     'Muhen 3', 187, 'Muhen 3', 190, 'Muhen 3', 190, 'Muhen 3', 194, 'Muhen 3', 190, 'Muhen 3', 185, 'Muhen 3', 192, true, true),

    ('mannschaft_2026_2202571', 'mannschaft', 2026, '2202571', 'Seeberger Ariane', 'liegend',
     'Muhen 3', 176, 'Muhen 3', 177, 'Muhen 3', 186, 'Muhen 3', 186, 'Muhen 3', 180, 'Muhen 3', 191, 'Muhen 3', 184, true, true),

    ('mannschaft_2026_1252794', 'mannschaft', 2026, '1252794', 'Weibel Andreas', 'liegend',
     'Muhen 3', 194, 'Muhen 3', 193, 'Muhen 3', 194, 'Muhen 3', 190, 'Muhen 3', 193, 'Muhen 3', 192, 'Muhen 3', 191, true, true)
ON CONFLICT (contest_type, year, person_number) DO UPDATE
SET name = EXCLUDED.name,
    r1_team = EXCLUDED.r1_team, r1_p1 = EXCLUDED.r1_p1,
    r2_team = EXCLUDED.r2_team, r2_p1 = EXCLUDED.r2_p1,
    r3_team = EXCLUDED.r3_team, r3_p1 = EXCLUDED.r3_p1,
    r4_team = EXCLUDED.r4_team, r4_p1 = EXCLUDED.r4_p1,
    r5_team = EXCLUDED.r5_team, r5_p1 = EXCLUDED.r5_p1,
    r6_team = EXCLUDED.r6_team, r6_p1 = EXCLUDED.r6_p1,
    r7_team = EXCLUDED.r7_team, r7_p1 = EXCLUDED.r7_p1,
    updated_at = now();


-- 3. STORED PROCEDURE: public.sync_jm_to_contest_mannschaft(p_year int)
-- Synchronisiert automatisch die 7 SMM-Runden aus der Jahresmeisterschaft nach contest_results
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_jm_to_contest_mannschaft(p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
    v_season_jahr VARCHAR(50);
    r RECORD;
    v_p1 INT; v_p2 INT; v_p3 INT; v_p4 INT; v_p5 INT; v_p6 INT; v_p7 INT;
BEGIN
    -- 'current' für aktuelles Jahr, sonst Jahreszahl als String
    IF p_year = EXTRACT(YEAR FROM CURRENT_DATE)::INT THEN
        v_season_jahr := 'current';
    ELSE
        v_season_jahr := p_year::TEXT;
    END IF;

    -- Schleife über alle Schützen in contest_results (Typ: mannschaft)
    FOR r IN
        SELECT cr.id, cr.person_number, cr.name, j.details->'mannschaft' AS smm
        FROM public.contest_results cr
        JOIN public.jm_shooters j 
          ON (j.jahr = v_season_jahr OR j.jahr = p_year::TEXT)
         AND (
             j.person_number = cr.person_number 
             OR TRIM(LOWER(j.name)) = TRIM(LOWER(cr.name))
         )
        WHERE cr.contest_type = 'mannschaft'
          AND cr.year = p_year
          AND (j.details->'mannschaft') IS NOT NULL
          AND jsonb_array_length(j.details->'mannschaft') > 0
    LOOP
        v_p1 := NULLIF((r.smm->0->>'punkte')::INT, 0);
        v_p2 := NULLIF((r.smm->1->>'punkte')::INT, 0);
        v_p3 := NULLIF((r.smm->2->>'punkte')::INT, 0);
        v_p4 := NULLIF((r.smm->3->>'punkte')::INT, 0);
        v_p5 := NULLIF((r.smm->4->>'punkte')::INT, 0);
        v_p6 := NULLIF((r.smm->5->>'punkte')::INT, 0);
        v_p7 := NULLIF((r.smm->6->>'punkte')::INT, 0);

        UPDATE public.contest_results
        SET r1_p1 = COALESCE(v_p1, r1_p1),
            r2_p1 = COALESCE(v_p2, r2_p1),
            r3_p1 = COALESCE(v_p3, r3_p1),
            r4_p1 = COALESCE(v_p4, r4_p1),
            r5_p1 = COALESCE(v_p5, r5_p1),
            r6_p1 = COALESCE(v_p6, r6_p1),
            r7_p1 = COALESCE(v_p7, r7_p1),
            updated_at = now()
        WHERE id = r.id;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'year', p_year,
        'updated_count', v_updated_count,
        'timestamp', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.sync_jm_to_contest_mannschaft(INTEGER) TO anon, authenticated;
