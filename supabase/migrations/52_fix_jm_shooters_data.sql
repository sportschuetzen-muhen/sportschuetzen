-- ==============================================================================
-- Migration 52: Korrektur der Jahresmeisterschaftsdaten in public.jm_shooters
-- Extrahiert korrekte Totals, Streichresultate und Details aus jm_seasons.raw_grid
-- ==============================================================================

DELETE FROM public.jm_shooters WHERE jahr IN ('current', '2023', '2025');

INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_5_132261', 'current', '132261', 'Fischer Marco', 1986, 1, 1, 687, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":197,"prozent":98.5},{"name":"Mannschaft #4","punkte":194,"prozent":97},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":100,"prozent":100},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":192},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":197},{"name":"Mannschaft #4","punkte":197},{"name":"Mannschaft #5","punkte":197},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[{"name":"Auswärtsschiessen","punkte":100}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_6_836405', 'current', '836405', 'Morgenthaler Lars', 2004, 1, 2, 583.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":190,"prozent":95},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":197,"prozent":98.5},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":196,"prozent":98},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":193,"prozent":96.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":196},{"name":"Mannschaft #4","punkte":192},{"name":"Mannschaft #5","punkte":195},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_7_462551', 'current', '462551', 'Keller Christiane', 1996, 1, 4, 586, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":196,"prozent":98},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":194,"prozent":97},{"name":"Mannschaft #4","punkte":193,"prozent":96.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":198},{"name":"Mannschaft #3","punkte":197},{"name":"Mannschaft #4","punkte":194},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_8_326349', 'current', '326349', 'Rossi Olivia', 1997, 1, 6, 589, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":193,"prozent":96.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":198,"prozent":99},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":198,"prozent":99},{"name":"Mannschaft #3","punkte":196,"prozent":98},{"name":"Mannschaft #4","punkte":194,"prozent":97},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":199},{"name":"Mannschaft #5","punkte":198},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_9_132259', 'current', '132259', 'Hunziker Erich', 1971, 1, 2, 484.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":191,"prozent":95.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":196,"prozent":98},{"name":"Mannschaft #3","punkte":194,"prozent":97},{"name":"Mannschaft #4","punkte":192,"prozent":96},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":190},{"name":"Mannschaft #4","punkte":192},{"name":"Mannschaft #5","punkte":194},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_10_828521', 'current', '828521', 'Burkhalter Lukas', 2000, 1, 25, 878.5, 0, 'abstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":195,"prozent":97.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":190,"prozent":95},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":195,"prozent":97.5},{"name":"Endschiessen","punkte":0,"prozent":97.5},{"name":"Auswärtiges 1","punkte":99,"prozent":99},{"name":"Auswärtiges 2","punkte":99,"prozent":99},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":195},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":196},{"name":"Mannschaft #4","punkte":195},{"name":"Mannschaft #5","punkte":190},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[{"name":"Freundschaftsschiessen","punkte":195},{"name":"Bärenmoos-Schiessen","punkte":99},{"name":"Auswärtsschiessen","punkte":99}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_11_125620', 'current', '125620', 'Berchtold Daniel', 1987, 1, 7, 583, 0, 'abstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":193,"prozent":96.5},{"name":"Mannschaft #4","punkte":193,"prozent":96.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":189},{"name":"Mannschaft #2","punkte":193},{"name":"Mannschaft #3","punkte":195},{"name":"Mannschaft #4","punkte":196},{"name":"Mannschaft #5","punkte":193},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L1_12_277008', 'current', '277008', 'Rossi Andrea', 1991, 1, 8, 594, 0, 'abstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":200,"prozent":100},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":199,"prozent":99.5},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":198,"prozent":99},{"name":"Mannschaft #3","punkte":196,"prozent":98},{"name":"Mannschaft #4","punkte":196,"prozent":98},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":198},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":199},{"name":"Mannschaft #4","punkte":196},{"name":"Mannschaft #5","punkte":196},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_15_100631', 'current', '100631', 'Luginbühl Jürg', 1974, 2, 3, 591, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":196,"prozent":98},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":198,"prozent":99},{"name":"Mannschaft #3","punkte":197,"prozent":98.5},{"name":"Mannschaft #4","punkte":196,"prozent":98},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":197},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":199},{"name":"Mannschaft #4","punkte":198},{"name":"Mannschaft #5","punkte":195},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_16_289899', 'current', '289899', 'Hochuli Thomas', 1967, 2, 1, 300, 0, 'aufstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":200,"prozent":100},{"name":"Mannschaft #2","punkte":200,"prozent":100},{"name":"Mannschaft #3","punkte":200,"prozent":100},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":200},{"name":"Mannschaft #2","punkte":200},{"name":"Mannschaft #3","punkte":200},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_17_4046', 'current', '4046', 'Suty Martina', 1980, 2, 5, 687, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":195,"prozent":97.5},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":194,"prozent":97},{"name":"Endschiessen","punkte":200,"prozent":100},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":195},{"name":"Mannschaft #2","punkte":197},{"name":"Mannschaft #3","punkte":194},{"name":"Mannschaft #4","punkte":197},{"name":"Mannschaft #5","punkte":194},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_18_771455', 'current', '771455', 'Italia Daniela', 1977, 2, 3, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_19_125638', 'current', '125638', 'Hunziker Daniel', 1973, 2, 4, 273.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":189,"prozent":94.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":167,"prozent":83.5},{"name":"Mannschaft #1","punkte":191,"prozent":95.5},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_20_103951', 'current', '103951', 'Huwiler Willi', 1953, 2, 5, 188.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":188,"prozent":94},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":189,"prozent":94.5},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_21_825773', 'current', '825773', 'Eichenberger Walter', 1956, 2, 7, 493, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":200,"prozent":100},{"name":"Mannschaft #2","punkte":200,"prozent":100},{"name":"Mannschaft #3","punkte":200,"prozent":100},{"name":"Mannschaft #4","punkte":200,"prozent":100},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_22_210022', 'current', '210022', 'Matter Christian', 1962, 2, 8, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_23_125658', 'current', '125658', 'Lüscher Stefan', 1986, 2, 9, 95.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":191,"prozent":95.5},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_24_891361', 'current', '891361', 'Obrist Marion', 2002, 2, 11, 595.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":195,"prozent":97.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":196,"prozent":98},{"name":"Mannschaft #1","punkte":200,"prozent":100},{"name":"Mannschaft #2","punkte":200,"prozent":100},{"name":"Mannschaft #3","punkte":200,"prozent":100},{"name":"Mannschaft #4","punkte":200,"prozent":100},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":200},{"name":"Mannschaft #2","punkte":200},{"name":"Mannschaft #3","punkte":200},{"name":"Mannschaft #4","punkte":200},{"name":"Mannschaft #5","punkte":200},{"name":"Mannschaft #6","punkte":200},{"name":"Mannschaft #7","punkte":200}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_25_29373', 'current', '29373', 'Peter Chloé', 2011, 2, 12, 484, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":182,"prozent":91},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":186,"prozent":93},{"name":"Mannschaft #1","punkte":200,"prozent":100},{"name":"Mannschaft #2","punkte":200,"prozent":100},{"name":"Mannschaft #3","punkte":200,"prozent":100},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_26_310118', 'current', '310118', 'Razumovitch Julia', 1975, 2, 13, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_27_104090', 'current', '104090', 'Eichenberger Barbara', 1969, 2, 14, 579.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":192,"prozent":96},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":192,"prozent":96},{"name":"Mannschaft #4","punkte":191,"prozent":95.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":185},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":197},{"name":"Mannschaft #5","punkte":191},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_28_935937', 'current', '935937', 'Läuppi Raphael', 2008, 2, 15, 567.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":183,"prozent":91.5},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":189,"prozent":94.5},{"name":"Mannschaft #4","punkte":189,"prozent":94.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":189},{"name":"Mannschaft #2","punkte":188},{"name":"Mannschaft #3","punkte":189},{"name":"Mannschaft #4","punkte":194},{"name":"Mannschaft #5","punkte":194},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_29_104104', 'current', '104104', 'Ruf Werner', 1946, 2, 16, 180.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":181,"prozent":90.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":180,"prozent":90},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_30_29372', 'current', '29372', 'Schweizer Ayleen', 2011, 2, 17, 567.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":185,"prozent":92.5},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":190,"prozent":95},{"name":"Mannschaft #3","punkte":190,"prozent":95},{"name":"Mannschaft #4","punkte":190,"prozent":95},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":187},{"name":"Mannschaft #2","punkte":190},{"name":"Mannschaft #3","punkte":190},{"name":"Mannschaft #4","punkte":194},{"name":"Mannschaft #5","punkte":190},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_31_305564', 'current', '305564', 'Seeberger Roger', 1989, 2, 18, 572.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":191,"prozent":95.5},{"name":"Mannschaft #4","punkte":188,"prozent":94},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":187},{"name":"Mannschaft #2","punkte":191},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":188},{"name":"Mannschaft #5","punkte":194},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_32_122209', 'current', '122209', 'Augsburger Beat', 1965, 2, 19, 676, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":195,"prozent":97.5},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":193,"prozent":96.5},{"name":"Mannschaft #4","punkte":188,"prozent":94},{"name":"Endschiessen","punkte":0,"prozent":96.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":188},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":194},{"name":"Mannschaft #5","punkte":188},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_33_23154', 'current', '23154', 'Verrillo Simone Luigi', 1992, 2, 20, 589.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":199,"prozent":99.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":195,"prozent":97.5},{"name":"Endschiessen","punkte":0,"prozent":97.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":198},{"name":"Mannschaft #2","punkte":197},{"name":"Mannschaft #3","punkte":195},{"name":"Mannschaft #4","punkte":195},{"name":"Mannschaft #5","punkte":193},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_34_27624', 'current', '27624', 'Seeberger Ariane', 1985, 2, 21, 641.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":188,"prozent":94},{"name":"Mannschaft #1","punkte":186,"prozent":93},{"name":"Mannschaft #2","punkte":186,"prozent":93},{"name":"Mannschaft #3","punkte":180,"prozent":90},{"name":"Mannschaft #4","punkte":177,"prozent":88.5},{"name":"Endschiessen","punkte":0,"prozent":90},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":176},{"name":"Mannschaft #2","punkte":177},{"name":"Mannschaft #3","punkte":186},{"name":"Mannschaft #4","punkte":186},{"name":"Mannschaft #5","punkte":180},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_35_304722', 'current', '304722', 'Weibel Andreas', 1992, 2, 22, 677.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":194,"prozent":97},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":193,"prozent":96.5},{"name":"Mannschaft #4","punkte":193,"prozent":96.5},{"name":"Endschiessen","punkte":0,"prozent":96.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":194},{"name":"Mannschaft #2","punkte":193},{"name":"Mannschaft #3","punkte":194},{"name":"Mannschaft #4","punkte":190},{"name":"Mannschaft #5","punkte":193},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_36_180337', 'current', '180337', 'Zurbriggen Nicole', 1984, 2, 23, 880.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":193,"prozent":96.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":194,"prozent":97},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":194,"prozent":97},{"name":"Mannschaft #4","punkte":194,"prozent":97},{"name":"Endschiessen","punkte":0,"prozent":97},{"name":"Auswärtiges 1","punkte":100,"prozent":100},{"name":"Auswärtiges 2","punkte":100,"prozent":100},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":197},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":194},{"name":"Mannschaft #4","punkte":194},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[{"name":"Stumpenland-Schiessen Menziken-Burg","punkte":100},{"name":"St. Sebastiansschiessen Neuendorf","punkte":100}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_37_257518', 'current', '257518', 'Berchtold Stefanie', 1989, 2, 24, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_38_304720', 'current', '304720', 'Aeberhard Andreas', 1992, 2, 27, 671.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":192,"prozent":96},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":188,"prozent":94},{"name":"Mannschaft #1","punkte":195,"prozent":97.5},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":192,"prozent":96},{"name":"Mannschaft #4","punkte":191,"prozent":95.5},{"name":"Endschiessen","punkte":0,"prozent":96},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":192},{"name":"Mannschaft #2","punkte":193},{"name":"Mannschaft #3","punkte":195},{"name":"Mannschaft #4","punkte":190},{"name":"Mannschaft #5","punkte":191},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_39_27222', 'current', '27222', 'Baumberger Rafael', 2009, 2, 28, 90.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":181,"prozent":90.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_40_19046', 'current', '19046', 'Frey Felix', 2009, 2, 30, 675, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":193,"prozent":96.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":189,"prozent":94.5},{"name":"Mannschaft #1","punkte":195,"prozent":97.5},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":193,"prozent":96.5},{"name":"Mannschaft #4","punkte":192,"prozent":96},{"name":"Endschiessen","punkte":0,"prozent":96.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":182},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":195},{"name":"Mannschaft #5","punkte":195},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_41_27223', 'current', '27223', 'Fringeli Kai', 2009, 2, 31, 584.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":184,"prozent":92},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":185,"prozent":92.5},{"name":"Mannschaft #1","punkte":200,"prozent":100},{"name":"Mannschaft #2","punkte":200,"prozent":100},{"name":"Mannschaft #3","punkte":200,"prozent":100},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":100},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":200},{"name":"Mannschaft #2","punkte":200},{"name":"Mannschaft #3","punkte":200},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_42_299278', 'current', '299278', 'Hediger Simon', 1981, 2, 32, 759.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":190,"prozent":95},{"name":"Mannschaft #2","punkte":189,"prozent":94.5},{"name":"Mannschaft #3","punkte":188,"prozent":94},{"name":"Mannschaft #4","punkte":187,"prozent":93.5},{"name":"Endschiessen","punkte":0,"prozent":94},{"name":"Auswärtiges 1","punkte":95,"prozent":95},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":188},{"name":"Mannschaft #2","punkte":190},{"name":"Mannschaft #3","punkte":187},{"name":"Mannschaft #4","punkte":183},{"name":"Mannschaft #5","punkte":189},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[{"name":"St. Sebastiansschiessen Neuendorf","punkte":95}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_43_125628', 'current', '125628', 'Haller Roger', 1969, 2, 37, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_44_3373', 'current', '3373', 'Plattner Riwana', 2005, 2, 46, 680.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":199,"prozent":99.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":196,"prozent":98},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":192,"prozent":96},{"name":"Mannschaft #4","punkte":191,"prozent":95.5},{"name":"Endschiessen","punkte":0,"prozent":96},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":191},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":191},{"name":"Mannschaft #4","punkte":192},{"name":"Mannschaft #5","punkte":197},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('current_L2_45_22274', 'current', '22274', 'Boss Ria', 2009, 2, 47, 678.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":191,"prozent":95.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":195,"prozent":97.5},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":194,"prozent":97},{"name":"Mannschaft #4","punkte":193,"prozent":96.5},{"name":"Endschiessen","punkte":0,"prozent":97},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":194},{"name":"Mannschaft #4","punkte":196},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_5_132261', '2023', '132261', 'Fischer Marco', 1986, 1, 1, 343, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":100,"prozent":50},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":192,"prozent":96},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":59,"prozent":100},{"name":"Auswärtiges 2","punkte":98.33,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":192},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[{"name":"Auswärtsschiessen","punkte":100}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_6_836405', '2023', '836405', 'Morgenthaler Lars', 2004, 1, 2, 294.33, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":1,"prozent":0.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":149,"prozent":99.33},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_7_277008', '2023', '277008', 'Rossi Andrea', 1991, 1, 4, 197, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":196,"prozent":98},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":198},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_8_4046', '2023', '4046', 'Suty Martina', 1980, 1, 5, 196, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":195},{"name":"Mannschaft #2","punkte":197},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_9_132259', '2023', '132259', 'Hunziker Erich', 1971, 1, 6, 196, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":196,"prozent":98},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_10_462551', '2023', '462551', 'Keller Christiane', 1996, 1, 2, 195.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":198},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_11_326349', '2023', '326349', 'Rossi Olivia', 1997, 1, 7, 195, 0, 'abstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L1_12_125620', '2023', '125620', 'Berchtold Daniel', 1987, 1, 8, 191, 0, 'abstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":193,"prozent":96.5},{"name":"Mannschaft #2","punkte":189,"prozent":94.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":189},{"name":"Mannschaft #2","punkte":193},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_15_828521', '2023', '828521', 'Burkhalter Lukas', 2000, 2, 3, 391.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":195,"prozent":97.5},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":99,"prozent":99},{"name":"Auswärtiges 2","punkte":195,"prozent":97.5},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":195},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[{"name":"Freundschaftsschiessen","punkte":195},{"name":"Bärenmoos-Schiessen","punkte":99}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_16_100631', '2023', '100631', 'Luginbühl Jürg', 1974, 2, 1, 296, 0, 'aufstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":196,"prozent":98},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":199,"prozent":99.5},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":197},{"name":"Mannschaft #2","punkte":196},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_17_180337', '2023', '180337', 'Zurbriggen Nicole', 1984, 2, 3, 296, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":100,"prozent":100},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":197},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[{"name":"Stumpenland-Schiessen Menziken-Burg","punkte":100}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_18_23154', '2023', '23154', 'Verrillo Simone Luigi', 1992, 2, 4, 197.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":198},{"name":"Mannschaft #2","punkte":197},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_19_304722', '2023', '304722', 'Weibel Andreas', 1992, 2, 5, 193.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":194},{"name":"Mannschaft #2","punkte":193},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_20_22274', '2023', '22274', 'Boss Ria', 2009, 2, 7, 193.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_21_304720', '2023', '304720', 'Aeberhard Andreas', 1992, 2, 8, 192.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":193,"prozent":96.5},{"name":"Mannschaft #2","punkte":192,"prozent":96},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":192},{"name":"Mannschaft #2","punkte":193},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_22_3373', '2023', '3373', 'Plattner Riwana', 2005, 2, 9, 192.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":191,"prozent":95.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":191},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_23_122209', '2023', '122209', 'Augsburger Beat', 1965, 2, 11, 191.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":195,"prozent":97.5},{"name":"Mannschaft #2","punkte":188,"prozent":94},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":188},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_24_305564', '2023', '305564', 'Seeberger Roger', 1989, 2, 12, 189, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":191,"prozent":95.5},{"name":"Mannschaft #2","punkte":187,"prozent":93.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":187},{"name":"Mannschaft #2","punkte":191},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_25_299278', '2023', '299278', 'Hediger Simon', 1981, 2, 13, 189, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":190,"prozent":95},{"name":"Mannschaft #2","punkte":188,"prozent":94},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":188},{"name":"Mannschaft #2","punkte":190},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_26_104090', '2023', '104090', 'Eichenberger Barbara', 1969, 2, 14, 188.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":192,"prozent":96},{"name":"Mannschaft #2","punkte":185,"prozent":92.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":185},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_27_935937', '2023', '935937', 'Läuppi Raphael', 2008, 2, 15, 188.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":189,"prozent":94.5},{"name":"Mannschaft #2","punkte":188,"prozent":94},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":189},{"name":"Mannschaft #2","punkte":188},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_28_29372', '2023', '29372', 'Schweizer Ayleen', 2011, 2, 16, 188.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":190,"prozent":95},{"name":"Mannschaft #2","punkte":187,"prozent":93.5},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":187},{"name":"Mannschaft #2","punkte":190},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_29_19046', '2023', '19046', 'Frey Felix', 2009, 2, 17, 187, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":192,"prozent":96},{"name":"Mannschaft #2","punkte":182,"prozent":91},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":182},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_30_27624', '2023', '27624', 'Seeberger Ariane', 1985, 2, 18, 176.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":177,"prozent":88.5},{"name":"Mannschaft #2","punkte":176,"prozent":88},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":176},{"name":"Mannschaft #2","punkte":177},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_31_289899', '2023', '289899', 'Hochuli Thomas', 1967, 2, 19, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_32_771455', '2023', '771455', 'Italia Daniela', 1977, 2, 20, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_33_125638', '2023', '125638', 'Hunziker Daniel', 1973, 2, 21, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_34_103951', '2023', '103951', 'Huwiler Willi', 1953, 2, 22, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_35_825773', '2023', '825773', 'Eichenberger Walter', 1956, 2, 23, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_36_210022', '2023', '210022', 'Matter Christian', 1962, 2, 24, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_37_125658', '2023', '125658', 'Lüscher Stefan', 1986, 2, 25, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_38_891361', '2023', '891361', 'Obrist Marion', 2002, 2, 27, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_39_29373', '2023', '29373', 'Peter Chloé', 2011, 2, 28, 0, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_40_310118', '2023', '310118', 'Razumovitch Julia', 1975, 2, 30, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_41_104104', '2023', '104104', 'Ruf Werner', 1946, 2, 31, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_42_257518', '2023', '257518', 'Berchtold Stefanie', 1989, 2, 32, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_43_27222', '2023', '27222', 'Baumberger Rafael', 2009, 2, 37, 0, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_44_27223', '2023', '27223', 'Fringeli Kai', 2009, 2, 46, 0, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2023_L2_45_125628', '2023', '125628', 'Haller Roger', 1969, 2, 47, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_5_277008', '2025', '277008', 'Rossi Andrea', 1991, 1, 1, 696.1666666666666, 98.75, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":200,"prozent":100},{"name":"Kantonalstich","punkte":299,"prozent":99.66666666666666},{"name":"Vereinswettschiessen","punkte":199,"prozent":99.5},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":199,"prozent":99.5},{"name":"Mannschaft #3","punkte":198,"prozent":99},{"name":"Mannschaft #4","punkte":198,"prozent":99},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":79,"prozent":98.75},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":197},{"name":"Mannschaft #2","punkte":199},{"name":"Mannschaft #3","punkte":198},{"name":"Mannschaft #4","punkte":197},{"name":"Mannschaft #5","punkte":199},{"name":"Mannschaft #6","punkte":197},{"name":"Mannschaft #7","punkte":198}],"auswaerts":[{"name":"Kirchberg","punkte":79}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_6_326349', '2025', '326349', 'Rossi Olivia', 1997, 1, 2, 690.7499999999999, 96.33333333333333, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":193,"prozent":96.5},{"name":"Kantonalstich","punkte":289,"prozent":96.33333333333333},{"name":"Vereinswettschiessen","punkte":198,"prozent":99},{"name":"Mannschaft #1","punkte":200,"prozent":100},{"name":"Mannschaft #2","punkte":198,"prozent":99},{"name":"Mannschaft #3","punkte":198,"prozent":99},{"name":"Mannschaft #4","punkte":197,"prozent":98.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":79,"prozent":98.75},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":198},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":197},{"name":"Mannschaft #5","punkte":200},{"name":"Mannschaft #6","punkte":196},{"name":"Mannschaft #7","punkte":198}],"auswaerts":[{"name":"Kirchberg","punkte":79}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_7_836405', '2025', '836405', 'Morgenthaler Lars', 2004, 1, 3, 688.1666666666666, 95, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":190,"prozent":95},{"name":"Kantonalstich","punkte":287,"prozent":95.66666666666666},{"name":"Vereinswettschiessen","punkte":197,"prozent":98.5},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":197,"prozent":98.5},{"name":"Mannschaft #4","punkte":196,"prozent":98},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":100,"prozent":100},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":198},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":197},{"name":"Mannschaft #4","punkte":195},{"name":"Mannschaft #5","punkte":197},{"name":"Mannschaft #6","punkte":196},{"name":"Mannschaft #7","punkte":192}],"auswaerts":[{"name":"Siggenthal","punkte":99},{"name":"Vindonissa","punkte":100}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_8_100631', '2025', '100631', 'Luginbühl Jürg', 1974, 1, 4, 688.1666666666666, 97.5, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":293,"prozent":97.66666666666666},{"name":"Vereinswettschiessen","punkte":196,"prozent":98},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":195,"prozent":97.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":100,"prozent":100},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":197},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":197},{"name":"Mannschaft #4","punkte":193},{"name":"Mannschaft #5","punkte":195},{"name":"Mannschaft #6","punkte":195},{"name":"Mannschaft #7","punkte":195}],"auswaerts":[{"name":"Siggenthal","punkte":98},{"name":"Vindonissa","punkte":100}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_9_132261', '2025', '132261', 'Fischer Marco', 1986, 1, 5, 685.3333333333333, 95, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":289,"prozent":96.33333333333333},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":197,"prozent":98.5},{"name":"Mannschaft #4","punkte":197,"prozent":98.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":76,"prozent":95},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":195},{"name":"Mannschaft #2","punkte":197},{"name":"Mannschaft #3","punkte":198},{"name":"Mannschaft #4","punkte":197},{"name":"Mannschaft #5","punkte":197},{"name":"Mannschaft #6","punkte":191},{"name":"Mannschaft #7","punkte":193}],"auswaerts":[{"name":"Kirchberg","punkte":76}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_10_125620', '2025', '125620', 'Berchtold Daniel', 1987, 1, 6, 682.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":294,"prozent":98},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":194,"prozent":97},{"name":"Mannschaft #4","punkte":192,"prozent":96},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":192},{"name":"Mannschaft #2","punkte":191},{"name":"Mannschaft #3","punkte":197},{"name":"Mannschaft #4","punkte":194},{"name":"Mannschaft #5","punkte":190},{"name":"Mannschaft #6","punkte":188},{"name":"Mannschaft #7","punkte":197}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_11_122209', '2025', '122209', 'Augsburger Beat', 1965, 1, 7, 682, 96, 'abstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":294,"prozent":98},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":193,"prozent":96.5},{"name":"Mannschaft #4","punkte":192,"prozent":96},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":98,"prozent":98},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":192},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":189},{"name":"Mannschaft #7","punkte":192}],"auswaerts":[{"name":"Siggenthal","punkte":98},{"name":"Vindonissa","punkte":97}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L1_12_125638', '2025', '125638', 'Hunziker Daniel', 1973, 1, 8, 649.6666666666666, 0, 'abstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":189,"prozent":94.5},{"name":"Kantonalstich","punkte":272,"prozent":90.66666666666666},{"name":"Vereinswettschiessen","punkte":167,"prozent":83.5},{"name":"Mannschaft #1","punkte":192,"prozent":96},{"name":"Mannschaft #2","punkte":191,"prozent":95.5},{"name":"Mannschaft #3","punkte":190,"prozent":95},{"name":"Mannschaft #4","punkte":189,"prozent":94.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":95,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":189},{"name":"Mannschaft #2","punkte":184},{"name":"Mannschaft #3","punkte":191},{"name":"Mannschaft #4","punkte":190},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":182},{"name":"Mannschaft #7","punkte":177}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_15_4046', '2025', '4046', 'Suty Martina', 1980, 2, 1, 687.6666666666666, 0, 'aufstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":196,"prozent":98},{"name":"Kantonalstich","punkte":293,"prozent":97.66666666666666},{"name":"Vereinswettschiessen","punkte":195,"prozent":97.5},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":198,"prozent":99},{"name":"Mannschaft #3","punkte":197,"prozent":98.5},{"name":"Mannschaft #4","punkte":195,"prozent":97.5},{"name":"Endschiessen","punkte":0,"prozent":98.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":199},{"name":"Mannschaft #2","punkte":197},{"name":"Mannschaft #3","punkte":198},{"name":"Mannschaft #4","punkte":195},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":194},{"name":"Mannschaft #7","punkte":194}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_16_462551', '2025', '462551', 'Keller Christiane', 1996, 2, 2, 685, 96.5, 'aufstieg', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":291,"prozent":97},{"name":"Vereinswettschiessen","punkte":196,"prozent":98},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":194,"prozent":97},{"name":"Mannschaft #4","punkte":193,"prozent":96.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":80,"prozent":100},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":189},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":192},{"name":"Mannschaft #4","punkte":192},{"name":"Mannschaft #5","punkte":193},{"name":"Mannschaft #6","punkte":198},{"name":"Mannschaft #7","punkte":194}],"auswaerts":[{"name":"Kirchberg","punkte":80}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_17_180337', '2025', '180337', 'Zurbriggen Nicole', 1984, 2, 3, 685, 96, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":193,"prozent":96.5},{"name":"Kantonalstich","punkte":288,"prozent":96},{"name":"Vereinswettschiessen","punkte":194,"prozent":97},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":196,"prozent":98},{"name":"Mannschaft #4","punkte":196,"prozent":98},{"name":"Endschiessen","punkte":0,"prozent":98},{"name":"Auswärtiges 1","punkte":98,"prozent":98},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":198},{"name":"Mannschaft #3","punkte":197},{"name":"Mannschaft #4","punkte":193},{"name":"Mannschaft #5","punkte":196},{"name":"Mannschaft #6","punkte":190},{"name":"Mannschaft #7","punkte":191}],"auswaerts":[{"name":"Siggenthal","punkte":93},{"name":"Vindonissa","punkte":98}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_18_104090', '2025', '104090', 'Eichenberger Barbara', 1969, 2, 4, 682.8333333333333, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":295,"prozent":98.33333333333333},{"name":"Vereinswettschiessen","punkte":192,"prozent":96},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":196,"prozent":98},{"name":"Mannschaft #3","punkte":194,"prozent":97},{"name":"Mannschaft #4","punkte":194,"prozent":97},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":194},{"name":"Mannschaft #2","punkte":191},{"name":"Mannschaft #3","punkte":194},{"name":"Mannschaft #4","punkte":199},{"name":"Mannschaft #5","punkte":189},{"name":"Mannschaft #6","punkte":196},{"name":"Mannschaft #7","punkte":191}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_19_828521', '2025', '828521', 'Burkhalter Lukas', 2000, 2, 5, 680.8333333333333, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":195,"prozent":97.5},{"name":"Kantonalstich","punkte":292,"prozent":97.33333333333333},{"name":"Vereinswettschiessen","punkte":190,"prozent":95},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":197,"prozent":98.5},{"name":"Mannschaft #3","punkte":196,"prozent":98},{"name":"Mannschaft #4","punkte":192,"prozent":96},{"name":"Endschiessen","punkte":0,"prozent":98},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":191},{"name":"Mannschaft #2","punkte":190},{"name":"Mannschaft #3","punkte":196},{"name":"Mannschaft #4","punkte":190},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":197},{"name":"Mannschaft #7","punkte":197}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_20_304722', '2025', '304722', 'Weibel Andreas', 1992, 2, 6, 680.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":291,"prozent":97},{"name":"Vereinswettschiessen","punkte":194,"prozent":97},{"name":"Mannschaft #1","punkte":195,"prozent":97.5},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":194,"prozent":97},{"name":"Endschiessen","punkte":0,"prozent":97.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":195},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":186},{"name":"Mannschaft #4","punkte":193},{"name":"Mannschaft #5","punkte":191},{"name":"Mannschaft #6","punkte":194},{"name":"Mannschaft #7","punkte":195}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_21_299278', '2025', '299278', 'Hediger Simon', 1981, 2, 7, 677.5, 92, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":194,"prozent":97},{"name":"Kantonalstich","punkte":276,"prozent":92},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":197,"prozent":98.5},{"name":"Mannschaft #2","punkte":196,"prozent":98},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":190,"prozent":95},{"name":"Endschiessen","punkte":0,"prozent":97.5},{"name":"Auswärtiges 1","punkte":95,"prozent":95},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":188},{"name":"Mannschaft #2","punkte":197},{"name":"Mannschaft #3","punkte":196},{"name":"Mannschaft #4","punkte":190},{"name":"Mannschaft #5","punkte":190},{"name":"Mannschaft #6","punkte":195},{"name":"Mannschaft #7","punkte":189}],"auswaerts":[{"name":"Siggenthal","punkte":94},{"name":"Vindonissa","punkte":95}]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_22_19046', '2025', '19046', 'Frey Felix', 2009, 2, 8, 672.6666666666666, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":193,"prozent":96.5},{"name":"Kantonalstich","punkte":287,"prozent":95.66666666666666},{"name":"Vereinswettschiessen","punkte":189,"prozent":94.5},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":193,"prozent":96.5},{"name":"Mannschaft #3","punkte":192,"prozent":96},{"name":"Mannschaft #4","punkte":191,"prozent":95.5},{"name":"Endschiessen","punkte":0,"prozent":96},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":186},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":183},{"name":"Mannschaft #5","punkte":189},{"name":"Mannschaft #6","punkte":191},{"name":"Mannschaft #7","punkte":196}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_23_305564', '2025', '305564', 'Seeberger Roger', 1989, 2, 9, 672, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":288,"prozent":96},{"name":"Vereinswettschiessen","punkte":193,"prozent":96.5},{"name":"Mannschaft #1","punkte":198,"prozent":99},{"name":"Mannschaft #2","punkte":192,"prozent":96},{"name":"Mannschaft #3","punkte":192,"prozent":96},{"name":"Mannschaft #4","punkte":191,"prozent":95.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":191},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":188},{"name":"Mannschaft #4","punkte":198},{"name":"Mannschaft #5","punkte":192},{"name":"Mannschaft #6","punkte":189},{"name":"Mannschaft #7","punkte":189}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_24_304720', '2025', '304720', 'Aeberhard Andreas', 1992, 2, 10, 671.8333333333333, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":192,"prozent":96},{"name":"Kantonalstich","punkte":286,"prozent":95.33333333333333},{"name":"Vereinswettschiessen","punkte":188,"prozent":94},{"name":"Mannschaft #1","punkte":195,"prozent":97.5},{"name":"Mannschaft #2","punkte":194,"prozent":97},{"name":"Mannschaft #3","punkte":193,"prozent":96.5},{"name":"Mannschaft #4","punkte":191,"prozent":95.5},{"name":"Endschiessen","punkte":0,"prozent":96.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":194},{"name":"Mannschaft #3","punkte":191},{"name":"Mannschaft #4","punkte":195},{"name":"Mannschaft #5","punkte":189},{"name":"Mannschaft #6","punkte":191},{"name":"Mannschaft #7","punkte":181}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_25_27223', '2025', '27223', 'Fringeli Kai', 2009, 2, 11, 657.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":184,"prozent":92},{"name":"Kantonalstich","punkte":279,"prozent":93},{"name":"Vereinswettschiessen","punkte":185,"prozent":92.5},{"name":"Mannschaft #1","punkte":194,"prozent":97},{"name":"Mannschaft #2","punkte":190,"prozent":95},{"name":"Mannschaft #3","punkte":189,"prozent":94.5},{"name":"Mannschaft #4","punkte":187,"prozent":93.5},{"name":"Endschiessen","punkte":0,"prozent":94.5},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":174},{"name":"Mannschaft #2","punkte":184},{"name":"Mannschaft #3","punkte":187},{"name":"Mannschaft #4","punkte":189},{"name":"Mannschaft #5","punkte":186},{"name":"Mannschaft #6","punkte":190},{"name":"Mannschaft #7","punkte":194}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_26_27624', '2025', '27624', 'Wälti Ariane', 1985, 2, 12, 649.1666666666666, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":278,"prozent":92.66666666666666},{"name":"Vereinswettschiessen","punkte":188,"prozent":94},{"name":"Mannschaft #1","punkte":186,"prozent":93},{"name":"Mannschaft #2","punkte":185,"prozent":92.5},{"name":"Mannschaft #3","punkte":184,"prozent":92},{"name":"Mannschaft #4","punkte":184,"prozent":92},{"name":"Endschiessen","punkte":0,"prozent":92},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":184},{"name":"Mannschaft #2","punkte":186},{"name":"Mannschaft #3","punkte":185},{"name":"Mannschaft #4","punkte":184},{"name":"Mannschaft #5","punkte":184},{"name":"Mannschaft #6","punkte":180},{"name":"Mannschaft #7","punkte":176}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_27_891361', '2025', '891361', 'Obrist Marion', 2002, 2, 13, 589, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":195,"prozent":97.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":196,"prozent":98},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":198,"prozent":99},{"name":"Mannschaft #3","punkte":195,"prozent":97.5},{"name":"Mannschaft #4","punkte":195,"prozent":97.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":187},{"name":"Mannschaft #2","punkte":195},{"name":"Mannschaft #3","punkte":198},{"name":"Mannschaft #4","punkte":199},{"name":"Mannschaft #5","punkte":194},{"name":"Mannschaft #6","punkte":191},{"name":"Mannschaft #7","punkte":195}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_28_132259', '2025', '132259', 'Hunziker Erich', 1971, 2, 14, 580, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":191,"prozent":95.5},{"name":"Kantonalstich","punkte":288,"prozent":96},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":196,"prozent":98},{"name":"Mannschaft #2","punkte":195,"prozent":97.5},{"name":"Mannschaft #3","punkte":193,"prozent":96.5},{"name":"Mannschaft #4","punkte":193,"prozent":96.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":193},{"name":"Mannschaft #2","punkte":192},{"name":"Mannschaft #3","punkte":196},{"name":"Mannschaft #4","punkte":193},{"name":"Mannschaft #5","punkte":195},{"name":"Mannschaft #6","punkte":186},{"name":"Mannschaft #7","punkte":192}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_29_23154', '2025', '23154', 'Verrillo Simone Luigi', 1992, 2, 15, 496.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":199,"prozent":99.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":199,"prozent":99.5},{"name":"Mannschaft #3","punkte":198,"prozent":99},{"name":"Mannschaft #4","punkte":198,"prozent":99},{"name":"Endschiessen","punkte":0,"prozent":99},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":199},{"name":"Mannschaft #2","punkte":193},{"name":"Mannschaft #3","punkte":198},{"name":"Mannschaft #4","punkte":198},{"name":"Mannschaft #5","punkte":198},{"name":"Mannschaft #6","punkte":199},{"name":"Mannschaft #7","punkte":198}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_30_125658', '2025', '125658', 'Lüscher Stefan', 1986, 2, 16, 489.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":191,"prozent":95.5},{"name":"Mannschaft #1","punkte":199,"prozent":99.5},{"name":"Mannschaft #2","punkte":198,"prozent":99},{"name":"Mannschaft #3","punkte":196,"prozent":98},{"name":"Mannschaft #4","punkte":195,"prozent":97.5},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":196},{"name":"Mannschaft #2","punkte":199},{"name":"Mannschaft #3","punkte":193},{"name":"Mannschaft #4","punkte":198},{"name":"Mannschaft #5","punkte":194},{"name":"Mannschaft #6","punkte":193},{"name":"Mannschaft #7","punkte":195}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_31_29372', '2025', '29372', 'Schweizer Ayleen', 2011, 2, 17, 280.16666666666663, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":284,"prozent":94.66666666666666},{"name":"Vereinswettschiessen","punkte":185,"prozent":92.5},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_32_935937', '2025', '935937', 'Läuppi Raphael', 2008, 2, 18, 277.8333333333333, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":280,"prozent":93.33333333333333},{"name":"Vereinswettschiessen","punkte":183,"prozent":91.5},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_33_29373', '2025', '29373', 'Peter Chloé', 2011, 2, 19, 274.66666666666663, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":182,"prozent":91},{"name":"Kantonalstich","punkte":272,"prozent":90.66666666666666},{"name":"Vereinswettschiessen","punkte":186,"prozent":93},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_34_104104', '2025', '104104', 'Ruf Werner', 1946, 2, 20, 272.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":181,"prozent":90.5},{"name":"Kantonalstich","punkte":276,"prozent":92},{"name":"Vereinswettschiessen","punkte":180,"prozent":90},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_35_103951', '2025', '103951', 'Huwiler Willi', 1953, 2, 21, 188.5, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":188,"prozent":94},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":189,"prozent":94.5},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_36_825773', '2025', '825773', 'Eichenberger Walter', 1956, 2, 22, 183.66666666666666, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":186,"prozent":93},{"name":"Kantonalstich","punkte":272,"prozent":90.66666666666666},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_37_29376', '2025', '29376', 'Gräni Yannis', 2011, 2, 23, 179, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":185,"prozent":92.5},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":173,"prozent":86.5},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_38_27222', '2025', '27222', 'Baumberger Rafael', 2009, 2, 24, 178.5, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":181,"prozent":90.5},{"name":"Kantonalstich","punkte":264,"prozent":88},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_39_289899', '2025', '289899', 'Hochuli Thomas', 1967, 2, 25, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_40_771455', '2025', '771455', 'Italia Daniela', 1977, 2, 27, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_41_125656', '2025', '125656', 'Lüscher Markus', 1966, 2, 28, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_42_210022', '2025', '210022', 'Matter Christian', 1962, 2, 30, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_43_29374', '2025', '29374', 'Müller Damian', 2011, 2, 31, 0, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_44_310118', '2025', '310118', 'Razumovitch Julia', 1975, 2, 32, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_45_257518', '2025', '257518', 'Berchtold Stefanie', 1989, 2, 34, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_46_15330', '2025', '15330', 'Kabakovitch Jan', 2011, 2, 35, 0, 0, 'neutral', true, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_47_795187', '2025', '795187', 'Bühlmann Lucien', 2005, 2, 36, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
INSERT INTO public.jm_shooters (id, jahr, person_number, name, jahrgang, liga, rang, total, streichresultat_prz, status, is_junior, details, updated_at)
VALUES ('2025_L2_48_125628', '2025', '125628', 'Haller Roger', 1969, 2, 37, 0, 0, 'neutral', false, '{"schiessen":[{"name":"Verbandsschiessen","punkte":0,"prozent":0},{"name":"Kantonalstich","punkte":0,"prozent":0},{"name":"Vereinswettschiessen","punkte":0,"prozent":0},{"name":"Mannschaft #1","punkte":0,"prozent":0},{"name":"Mannschaft #2","punkte":0,"prozent":0},{"name":"Mannschaft #3","punkte":0,"prozent":0},{"name":"Mannschaft #4","punkte":0,"prozent":0},{"name":"Endschiessen","punkte":0,"prozent":0},{"name":"Auswärtiges 1","punkte":0,"prozent":0},{"name":"Auswärtiges 2","punkte":0,"prozent":0},{"name":"Eidgenössisches","punkte":0,"prozent":0}],"mannschaft":[{"name":"Mannschaft #1","punkte":0},{"name":"Mannschaft #2","punkte":0},{"name":"Mannschaft #3","punkte":0},{"name":"Mannschaft #4","punkte":0},{"name":"Mannschaft #5","punkte":0},{"name":"Mannschaft #6","punkte":0},{"name":"Mannschaft #7","punkte":0}],"auswaerts":[]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    streichresultat_prz = EXCLUDED.streichresultat_prz,
    details = EXCLUDED.details,
    rang = EXCLUDED.rang,
    status = EXCLUDED.status,
    is_junior = EXCLUDED.is_junior,
    updated_at = now();
