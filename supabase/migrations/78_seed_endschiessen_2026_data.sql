-- ==============================================================================
-- 78_seed_endschiessen_2026_data.sql
-- Initial-Seed: Reale Endschiessen-Ergebnisse (Endstich 20 Schuss & Meister-Final)
-- Auswertung Sportschützen Muhen gemäss Original-Standblatt / Protokoll
-- ==============================================================================

DO $$
DECLARE
    v_endstich_id UUID;
BEGIN
    SELECT id INTO v_endstich_id FROM public.endschiessen_stiche WHERE jahr = '2026' AND code = 'endstich' LIMIT 1;
    
    IF v_endstich_id IS NOT NULL THEN
        -- 1. ENDSTICH (20 SCHUSS: PASSE 1 & 2 MIT GANZ- UND ZEHNTELWERTUNG)
        INSERT INTO public.endschiessen_scores (
            jahr, stich_id, person_number, guest_name, 
            passe_1_score, passe_1_decimal, passe_2_score, passe_2_decimal, 
            total_score, total_decimal, rang_total, rang_decimal
        ) VALUES
            ('2026', v_endstich_id, 1048717, NULL, 98, 102.3, 100, 104.8, 198, 207.1, 1, 1),   -- Luginbühl Jürg
            ('2026', v_endstich_id, 1080345, NULL, 99, 102.9, 99,  101.3, 198, 204.2, 2, 9),   -- Fischer Marco
            ('2026', v_endstich_id, 1274419, NULL, 98, 102.3, 99,  104.7, 197, 207.0, 3, 2),   -- Rossi Olivia
            ('2026', v_endstich_id, 2201937, NULL, 98, 102.3, 99,  102.4, 197, 204.7, 4, 5),   -- Suty Martina
            ('2026', v_endstich_id, 1763202, NULL, 100, 104.4, 96, 101.1, 196, 205.5, 5, 3),   -- Morgenthaler Lars
            ('2026', v_endstich_id, 1070293, NULL, 99, 102.9, 97,  101.7, 196, 204.6, 6, 6),   -- Augsburger Beat
            ('2026', v_endstich_id, 1045507, NULL, 97, 101.5, 99,  102.9, 196, 204.4, 7, 8),   -- Boss Ria
            ('2026', v_endstich_id, 1756055, NULL, 98, 100.4, 98,  103.0, 196, 203.4, 8, 10),  -- Burkhalter Lukas
            ('2026', v_endstich_id, 1225081, NULL, 97, 101.8, 98,  103.0, 195, 204.8, 9, 4),   -- Rossi Andrea
            ('2026', v_endstich_id, 1128417, NULL, 98, 102.0, 97,  102.5, 195, 204.5, 10, 7),  -- Zurbriggen Nicole
            ('2026', v_endstich_id, 1052176, NULL, 94, 99.6,  95,  100.3, 189, 199.9, 11, 11), -- Eichenberger Barbara
            ('2026', v_endstich_id, 1073722, NULL, 90, 94.5,  93,  95.8,  183, 190.3, 12, 13), -- Hunziker Daniel
            ('2026', v_endstich_id, NULL, 'Fuchs Renate', 91, 96.2, 91, 96.1, 182, 192.3, 13, 12), -- Fuchs Renate (Gast)
            ('2026', v_endstich_id, 1247351, NULL, 87, 92.1, 88,  93.2,  175, 185.3, 14, 14)  -- Hediger Simon
        ON CONFLICT (jahr, stich_id, person_number, guest_name) DO UPDATE
        SET passe_1_score = EXCLUDED.passe_1_score,
            passe_1_decimal = EXCLUDED.passe_1_decimal,
            passe_2_score = EXCLUDED.passe_2_score,
            passe_2_decimal = EXCLUDED.passe_2_decimal,
            total_score = EXCLUDED.total_score,
            total_decimal = EXCLUDED.total_decimal,
            rang_total = EXCLUDED.rang_total,
            rang_decimal = EXCLUDED.rang_decimal,
            updated_at = now();

        -- 2. MEISTER-FINAL (TOP 8 AUSSCHIEDUNG SERIEN 1 BIS 8)
        INSERT INTO public.endschiessen_final_series (
            jahr, person_number, start_rang,
            serie_1, serie_2, serie_3, serie_4, serie_5, serie_6, serie_7, serie_8,
            total_score, final_rang, is_eliminated, eliminated_in_serie
        ) VALUES
            ('2026', 1274419, 3, 291, 280, 283, 284, 287, 285, 282, 0, 1992, 1, false, NULL), -- Rossi Olivia (1. Rang)
            ('2026', 1048717, 1, 275, 285, 286, 289, 286, 284, 274, 0, 1979, 2, false, NULL), -- Luginbühl Jürg (2. Rang)
            ('2026', 1045507, 7, 282, 279, 279, 286, 275, 281, 0,   0, 1682, 3, true,  6),    -- Boss Ria (3. Rang)
            ('2026', 2201937, 4, 285, 281, 274, 279, 277, 0,   0,   0, 1396, 4, true,  5),    -- Suty Martina (4. Rang)
            ('2026', 1070293, 6, 268, 280, 285, 276, 0,   0,   0,   0, 1109, 5, true,  4),    -- Augsburger Beat (5. Rang)
            ('2026', 1763202, 5, 267, 288, 274, 0,   0,   0,   0,   0, 829,  6, true,  3),    -- Morgenthaler Lars (6. Rang)
            ('2026', 1080345, 2, 283, 259, 0,   0,   0,   0,   0,   0, 542,  7, true,  2),    -- Fischer Marco (7. Rang)
            ('2026', 1756055, 8, 235, 0,   0,   0,   0,   0,   0,   0, 235,  8, true,  1)     -- Burkhalter Lukas (8. Rang)
        ON CONFLICT (jahr, person_number) DO UPDATE
        SET serie_1 = EXCLUDED.serie_1,
            serie_2 = EXCLUDED.serie_2,
            serie_3 = EXCLUDED.serie_3,
            serie_4 = EXCLUDED.serie_4,
            serie_5 = EXCLUDED.serie_5,
            serie_6 = EXCLUDED.serie_6,
            serie_7 = EXCLUDED.serie_7,
            serie_8 = EXCLUDED.serie_8,
            total_score = EXCLUDED.total_score,
            final_rang = EXCLUDED.final_rang,
            is_eliminated = EXCLUDED.is_eliminated,
            eliminated_in_serie = EXCLUDED.eliminated_in_serie,
            updated_at = now();

    END IF;
END $$;
