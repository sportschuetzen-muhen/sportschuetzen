-- ==============================================================================
-- 76_fix_sync_jm_to_contest_mannschaft.sql
-- Migration: Erweiterte Synchronisation Jahresmeisterschaft -> Mannschaftsmeisterschaft
--            mit striktem Abgleich gegen Team Manager (contest_setups)
--            Verhindert überfüllte Teams und verschiebt Nicht-Team-Schützen in den Pool.
--            Bereinigt zudem den Datenstand der Saison 2026.
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. STORED PROCEDURE: public.sync_jm_to_contest_mannschaft(p_year)
CREATE OR REPLACE FUNCTION public.sync_jm_to_contest_mannschaft(p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
    v_moved_to_pool INT := 0;
    v_deleted_count INT := 0;
    v_season_jahr VARCHAR(50);
    v_setup_count INT := 0;
    r RECORD;
    v_p1 INT; v_p2 INT; v_p3 INT; v_p4 INT; v_p5 INT; v_p6 INT; v_p7 INT;
    v_has_points BOOLEAN;
BEGIN
    -- 'current' für aktuelles Jahr, sonst Jahreszahl als String
    IF p_year = EXTRACT(YEAR FROM CURRENT_DATE)::INT THEN
        v_season_jahr := 'current';
    ELSE
        v_season_jahr := p_year::TEXT;
    END IF;

    -- 1. Prüfen, ob für dieses Jahr Einträge in contest_setups (Team Manager) vorliegen
    SELECT COUNT(*) INTO v_setup_count
    FROM public.contest_setups
    WHERE contest_type = 'mannschaft' AND year = p_year AND team IS NOT NULL AND TRIM(team) != '';

    IF v_setup_count > 0 THEN
        -- A: Schützen aus contest_setups in contest_results sicherstellen / Team-Zuweisung aktualisieren
        INSERT INTO public.contest_results (
            id, contest_type, year, person_number, name, stellung,
            r1_team, r2_team, r3_team, r4_team, r5_team, r6_team, r7_team,
            is_auto_r2, is_auto_r3
        )
        SELECT 
            'mannschaft_' || p_year || '_' || s.person_number,
            'mannschaft',
            p_year,
            s.person_number,
            s.name,
            COALESCE(s.stellung, 'liegend'),
            s.team, s.team, s.team, s.team, s.team, s.team, s.team,
            true, true
        FROM public.contest_setups s
        WHERE s.contest_type = 'mannschaft' AND s.year = p_year AND s.team IS NOT NULL AND TRIM(s.team) != ''
        ON CONFLICT (contest_type, year, person_number) DO UPDATE
        SET name = EXCLUDED.name,
            r1_team = EXCLUDED.r1_team,
            r2_team = EXCLUDED.r2_team,
            r3_team = EXCLUDED.r3_team,
            r4_team = EXCLUDED.r4_team,
            r5_team = EXCLUDED.r5_team,
            r6_team = EXCLUDED.r6_team,
            r7_team = EXCLUDED.r7_team,
            updated_at = now();

        -- B: Schützen in contest_results, die NICHT mehr im contest_setups mit Team vertreten sind:
        -- Falls sie Punkte haben -> in den Pool verschieben (r1_team .. r7_team = '')
        -- Falls sie KEINE Punkte haben -> löschen
        FOR r IN
            SELECT cr.id, cr.person_number,
                   ((cr.r1_p1 IS NOT NULL AND cr.r1_p1 > 0) OR
                    (cr.r2_p1 IS NOT NULL AND cr.r2_p1 > 0) OR
                    (cr.r3_p1 IS NOT NULL AND cr.r3_p1 > 0) OR
                    (cr.r4_p1 IS NOT NULL AND cr.r4_p1 > 0) OR
                    (cr.r5_p1 IS NOT NULL AND cr.r5_p1 > 0) OR
                    (cr.r6_p1 IS NOT NULL AND cr.r6_p1 > 0) OR
                    (cr.r7_p1 IS NOT NULL AND cr.r7_p1 > 0)) AS has_contest_pts,
                   j.details->'mannschaft' AS jm_smm
            FROM public.contest_results cr
            LEFT JOIN public.jm_shooters j
              ON (j.jahr = v_season_jahr OR j.jahr = p_year::TEXT)
             AND (j.person_number = cr.person_number OR TRIM(LOWER(j.name)) = TRIM(LOWER(cr.name)))
            WHERE cr.contest_type = 'mannschaft'
              AND cr.year = p_year
              AND cr.person_number NOT IN (
                  SELECT s.person_number
                  FROM public.contest_setups s
                  WHERE s.contest_type = 'mannschaft' AND s.year = p_year AND s.team IS NOT NULL AND TRIM(s.team) != ''
              )
        LOOP
            v_has_points := r.has_contest_pts;
            IF NOT v_has_points AND r.jm_smm IS NOT NULL THEN
                -- Prüfen ob in jm_smm Punkte existieren (> 0)
                v_has_points := (
                    COALESCE((r.jm_smm->0->>'punkte')::INT, 0) > 0 OR
                    COALESCE((r.jm_smm->1->>'punkte')::INT, 0) > 0 OR
                    COALESCE((r.jm_smm->2->>'punkte')::INT, 0) > 0 OR
                    COALESCE((r.jm_smm->3->>'punkte')::INT, 0) > 0 OR
                    COALESCE((r.jm_smm->4->>'punkte')::INT, 0) > 0 OR
                    COALESCE((r.jm_smm->5->>'punkte')::INT, 0) > 0 OR
                    COALESCE((r.jm_smm->6->>'punkte')::INT, 0) > 0
                );
            END IF;

            IF v_has_points THEN
                -- In Pool verschieben, damit Teams sauber bleiben, aber Punkte erhalten bleiben
                UPDATE public.contest_results
                SET r1_team = '', r2_team = '', r3_team = '',
                    r4_team = '', r5_team = '', r6_team = '', r7_team = '',
                    updated_at = now()
                WHERE id = r.id;
                v_moved_to_pool := v_moved_to_pool + 1;
            ELSE
                -- Keine Punkte und nicht im Team -> sicher entfernen
                DELETE FROM public.contest_results WHERE id = r.id;
                v_deleted_count := v_deleted_count + 1;
            END IF;
        END LOOP;
    END IF;

    -- 2. Schleife über alle Schützen in contest_results (Typ: mannschaft) zur Punkte-Aktualisierung
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
        'setups_checked', v_setup_count,
        'updated_count', v_updated_count,
        'moved_to_pool_count', v_moved_to_pool,
        'deleted_count', v_deleted_count,
        'timestamp', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.sync_jm_to_contest_mannschaft(INTEGER) TO anon, authenticated;


-- 2. DATEN-KORREKTUR SAISON 2026: Verbindliche 24 Schützen in contest_setups
-- ------------------------------------------------------------------------------
-- Zuerst bestehende 2026 Setups für Mannschaft bereinigen
DELETE FROM public.contest_setups
WHERE contest_type = 'mannschaft' AND year = 2026;

INSERT INTO public.contest_setups (
    id, contest_type, year, person_number, name, team, stellung, sort_order, updated_at
)
VALUES
    -- Muhen 1 (8 Schützen)
    ('setup_mannschaft_2026_1080345', 'mannschaft', 2026, '1080345', 'Fischer Marco', 'Muhen 1', 'liegend', 1, now()),
    ('setup_mannschaft_2026_1247351', 'mannschaft', 2026, '1247351', 'Hediger Simon', 'Muhen 1', 'liegend', 2, now()),
    ('setup_mannschaft_2026_1410615', 'mannschaft', 2026, '1410615', 'Keller Christiane', 'Muhen 1', 'liegend', 3, now()),
    ('setup_mannschaft_2026_1048717', 'mannschaft', 2026, '1048717', 'Luginbühl Jürg', 'Muhen 1', 'liegend', 4, now()),
    ('setup_mannschaft_2026_1763202', 'mannschaft', 2026, '1763202', 'Morgenthaler Lars', 'Muhen 1', 'liegend', 5, now()),
    ('setup_mannschaft_2026_1225081', 'mannschaft', 2026, '1225081', 'Rossi Andrea', 'Muhen 1', 'liegend', 6, now()),
    ('setup_mannschaft_2026_1274419', 'mannschaft', 2026, '1274419', 'Rossi Olivia', 'Muhen 1', 'liegend', 7, now()),
    ('setup_mannschaft_2026_1128417', 'mannschaft', 2026, '1128417', 'Zurbriggen Nicole', 'Muhen 1', 'liegend', 8, now()),

    -- Muhen 2 (8 Schützen)
    ('setup_mannschaft_2026_1070293', 'mannschaft', 2026, '1070293', 'Augsburger Beat', 'Muhen 2', 'liegend', 1, now()),
    ('setup_mannschaft_2026_1073704', 'mannschaft', 2026, '1073704', 'Berchtold Daniel', 'Muhen 2', 'liegend', 2, now()),
    ('setup_mannschaft_2026_1756055', 'mannschaft', 2026, '1756055', 'Burkhalter Lukas', 'Muhen 2', 'liegend', 3, now()),
    ('setup_mannschaft_2026_1052176', 'mannschaft', 2026, '1052176', 'Eichenberger Barbara', 'Muhen 2', 'liegend', 4, now()),
    ('setup_mannschaft_2026_1080343', 'mannschaft', 2026, '1080343', 'Hunziker Erich', 'Muhen 2', 'liegend', 5, now()),
    ('setup_mannschaft_2026_1253636', 'mannschaft', 2026, '1253636', 'Seeberger Roger', 'Muhen 2', 'liegend', 6, now()),
    ('setup_mannschaft_2026_2201937', 'mannschaft', 2026, '2201937', 'Suty Martina', 'Muhen 2', 'liegend', 7, now()),
    ('setup_mannschaft_2026_1046383', 'mannschaft', 2026, '1046383', 'Verrillo Simone Luigi', 'Muhen 2', 'liegend', 8, now()),

    -- Muhen 3 (8 Schützen)
    ('setup_mannschaft_2026_1252792', 'mannschaft', 2026, '1252792', 'Aeberhard Andreas', 'Muhen 3', 'liegend', 1, now()),
    ('setup_mannschaft_2026_1045507', 'mannschaft', 2026, '1045507', 'Boss Ria', 'Muhen 3', 'liegend', 2, now()),
    ('setup_mannschaft_2026_1042289', 'mannschaft', 2026, '1042289', 'Frey Felix', 'Muhen 3', 'liegend', 3, now()),
    ('setup_mannschaft_2026_1857354', 'mannschaft', 2026, '1857354', 'Läuppi Raphael', 'Muhen 3', 'liegend', 4, now()),
    ('setup_mannschaft_2026_1026762', 'mannschaft', 2026, '1026762', 'Plattner Riwana', 'Muhen 3', 'liegend', 5, now()),
    ('setup_mannschaft_2026_2193321', 'mannschaft', 2026, '2193321', 'Schweizer Ayleen', 'Muhen 3', 'liegend', 6, now()),
    ('setup_mannschaft_2026_2202571', 'mannschaft', 2026, '2202571', 'Seeberger Ariane', 'Muhen 3', 'liegend', 7, now()),
    ('setup_mannschaft_2026_1252794', 'mannschaft', 2026, '1252794', 'Weibel Andreas', 'Muhen 3', 'liegend', 8, now())
ON CONFLICT (contest_type, year, person_number) DO UPDATE
SET name = EXCLUDED.name,
    team = EXCLUDED.team,
    stellung = EXCLUDED.stellung,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();


-- 3. DATEN-KORREKTUR SAISON 2026 in contest_results:
-- Inaktive Schützen ohne Punkte aus 2026 entfernen
DELETE FROM public.contest_results
WHERE contest_type = 'mannschaft'
  AND year = 2026
  AND person_number IN (
      '1073712', -- Haller Roger
      '1070312', -- Morgenthaler Stephan
      '2365705', -- Wigger Therese
      '1060987', -- Zihlmann Jean-Claude
      '2261634', -- Baumberger Rafael
      '1073742', -- Lüscher Stefan
      '1158097', -- Matter Christian
      '1814691', -- Obrist Marion
      '1237972', -- Hochuli Thomas
      '1161664'  -- Rauch Christian
  );

-- Die 24 echten Schützen auf ihre jeweiligen Teams zurücksetzen
UPDATE public.contest_results
SET r1_team = s.team, r2_team = s.team, r3_team = s.team,
    r4_team = s.team, r5_team = s.team, r6_team = s.team, r7_team = s.team,
    updated_at = now()
FROM public.contest_setups s
WHERE contest_results.contest_type = 'mannschaft'
  AND contest_results.year = 2026
  AND s.contest_type = 'mannschaft'
  AND s.year = 2026
  AND s.person_number = contest_results.person_number;
