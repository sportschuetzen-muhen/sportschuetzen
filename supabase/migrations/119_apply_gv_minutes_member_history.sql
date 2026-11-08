-- Migration 119: Einpflegen historischer Daten aus GV-Protokollen (1919-2024)
-- Basierend auf Prüfung und Freigabe der Excel-Arbeitsmappe GV_Protokoll_Abgleich_Sportschuetzen_Muhen.xlsx
-- Ausschluss: Zeile 10 (Daniel Berchtold) & Zeile 11 (Olivia Rossi) als aktive Mitglieder bestätigt.

BEGIN;

-- ===========================================================================
-- 1. EINTRITTE NACHFÜHREN
-- ===========================================================================
-- Zeile 5: Raphael Läuppi (Läuppi Raphael, PN 1857354)
UPDATE public.members SET club_entry_date = '2024-03-24', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1857354;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1857354, 'Läuppi Raphael', '2024-03-24', 'EINTRITT', '2024-03-24', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 6: Simone Virello (Simone Luigi Verrillo, PN 1046383)
UPDATE public.members SET club_entry_date = '2024-03-24', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1046383;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1046383, 'Simone Luigi Verrillo', '2024-03-24', 'EINTRITT', '2024-03-24', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 7: Ariane Wälti (Ariane Seeberger, PN 2202571)
UPDATE public.members SET club_entry_date = '2024-03-24', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 2202571;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (2202571, 'Ariane Seeberger', '2024-03-24', 'EINTRITT', '2024-03-24', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 77: Hochuli Thomas (Hochuli Thomas, PN 1237972)
UPDATE public.members SET club_entry_date = '1989-01-01', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1237972;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1237972, 'Hochuli Thomas', '1989-01-01', 'EINTRITT', '1989-01-01', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 83: Marco Fischer (Fischer Marco, PN 1080345)
UPDATE public.members SET club_entry_date = '2003-03-21', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1080345;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1080345, 'Fischer Marco', '2003-03-21', 'EINTRITT', '2003-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 85: Daniel Berchtold (Berchtold Daniel, PN 1073704)
UPDATE public.members SET club_entry_date = '2003-03-21', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1073704;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1073704, 'Berchtold Daniel', '2003-03-21', 'EINTRITT', '2003-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 86: Stefan Lüscher (Lüscher Stefan, PN 1073742)
UPDATE public.members SET club_entry_date = '2003-03-21', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1073742;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1073742, 'Lüscher Stefan', '2003-03-21', 'EINTRITT', '2003-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 87: Stefan Härdi (Härdi Stefan, PN 9000081)
UPDATE public.members SET club_entry_date = '2003-03-21', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 9000081;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000081, 'Härdi Stefan', '2003-03-21', 'EINTRITT', '2003-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 96: Mollet André (Mollet André, PN 9000084)
UPDATE public.members SET club_entry_date = '2001-03-21', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 9000084;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000084, 'Mollet André', '2001-03-21', 'EINTRITT', '2001-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 102: Wasser Sacha (Wasser Sacha, PN 9000052)
UPDATE public.members SET club_entry_date = '2000-04-21', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 9000052;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000052, 'Wasser Sacha', '2000-04-21', 'EINTRITT', '2000-04-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 117: Hirt Hans (Hirt Hans, PN 9000142)
UPDATE public.members SET club_entry_date = '1992-03-03', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 9000142;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000142, 'Hirt Hans', '1992-03-03', 'EINTRITT', '1992-03-03', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 130: Gloor Karl (Gloor Karl, PN 9000122)
UPDATE public.members SET club_entry_date = '1977-02-28', club_entry_date_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 9000122;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000122, 'Gloor Karl', '1977-02-28', 'EINTRITT', '1977-02-28', 'GV-Protokoll-Abgleich', 'GV-Import');

-- ===========================================================================
-- 2. AUSTRITTE NACHFÜHREN
-- ===========================================================================
-- Zeile 8: Peter Schörg (Schörg Peter, PN 1479857)
UPDATE public.members SET is_active = false, club_exit_date = '2024-03-24', updated_at = NOW() WHERE person_number = 1479857;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1479857, 'Schörg Peter', '2024-03-24', 'AUSTRITT', 'Aktiv', '2024-03-24', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 9: Urs Spinnler (Spinnler Urs, PN 1073754)
UPDATE public.members SET is_active = false, club_exit_date = '2024-03-24', updated_at = NOW() WHERE person_number = 1073754;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1073754, 'Spinnler Urs', '2024-03-24', 'AUSTRITT', 'Aktiv', '2024-03-24', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 15: Peter Brunner (Brunner Peter, PN 1099438)
UPDATE public.members SET is_active = false, club_exit_date = '2023-03-17', updated_at = NOW() WHERE person_number = 1099438;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1099438, 'Brunner Peter', '2023-03-17', 'AUSTRITT', 'Aktiv', '2023-03-17', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 16: Hans Zürcher (Zürcher Hans, PN 9000068)
UPDATE public.members SET is_active = false, club_exit_date = '2023-03-17', updated_at = NOW() WHERE person_number = 9000068;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000068, 'Zürcher Hans', '2023-03-17', 'AUSTRITT', 'Aktiv', '2023-03-17', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 17: Hansjörg Rohrer (Rohrer Hansjörg, PN 1071944)
UPDATE public.members SET is_active = false, club_exit_date = '2023-03-17', updated_at = NOW() WHERE person_number = 1071944;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1071944, 'Rohrer Hansjörg', '2023-03-17', 'AUSTRITT', 'Aktiv', '2023-03-17', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 18: Louis Scheffler (Scheffler Louis, PN 1724615)
UPDATE public.members SET is_active = false, club_exit_date = '2023-03-17', updated_at = NOW() WHERE person_number = 1724615;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1724615, 'Scheffler Louis', '2023-03-17', 'AUSTRITT', 'Aktiv', '2023-03-17', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 33: Lüscher Regula (Lüscher Regula, PN 9000064)
UPDATE public.members SET is_active = false, club_exit_date = '2021-05-28', updated_at = NOW() WHERE person_number = 9000064;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000064, 'Lüscher Regula', '2021-05-28', 'AUSTRITT', 'Aktiv', '2021-05-28', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 34: Lüscher Willy (Lüscher Willi, PN 9000065)
UPDATE public.members SET is_active = false, club_exit_date = '2021-05-28', updated_at = NOW() WHERE person_number = 9000065;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000065, 'Lüscher Willi', '2021-05-28', 'AUSTRITT', 'Aktiv', '2021-05-28', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 38: Flückiger Sylvia (Flückiger Sylvia, PN 9000131)
UPDATE public.members SET is_active = false, club_exit_date = '2020-03-05', updated_at = NOW() WHERE person_number = 9000131;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000131, 'Flückiger Sylvia', '2020-03-05', 'AUSTRITT', 'Aktiv', '2020-03-05', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 44: Basler Markus (Basler Markus, PN 1073588)
UPDATE public.members SET is_active = false, club_exit_date = '2019-03-07', updated_at = NOW() WHERE person_number = 1073588;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1073588, 'Basler Markus', '2019-03-07', 'AUSTRITT', 'Aktiv', '2019-03-07', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 48: Vogt Carole (Vogt Carole, PN 9000149)
UPDATE public.members SET is_active = false, club_exit_date = '2019-03-07', updated_at = NOW() WHERE person_number = 9000149;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000149, 'Vogt Carole', '2019-03-07', 'AUSTRITT', 'Aktiv', '2019-03-07', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 58: Haas René (Haas René, PN 9000008)
UPDATE public.members SET is_active = false, club_exit_date = '2017-03-09', updated_at = NOW() WHERE person_number = 9000008;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000008, 'Haas René', '2017-03-09', 'AUSTRITT', 'Aktiv', '2017-03-09', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 61: Vogt Fabienne (Vogt Fabienne, PN 1226859)
UPDATE public.members SET is_active = false, club_exit_date = '2016-03-10', updated_at = NOW() WHERE person_number = 1226859;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1226859, 'Vogt Fabienne', '2016-03-10', 'AUSTRITT', 'Aktiv', '2016-03-10', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 66: Hans Hunziker (Hunziker Hans, PN 1080350)
UPDATE public.members SET is_active = false, club_exit_date = '2014-03-14', updated_at = NOW() WHERE person_number = 1080350;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1080350, 'Hunziker Hans', '2014-03-14', 'AUSTRITT', 'Aktiv', '2014-03-14', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 71: Hirt Hans (Hirt Hans, PN 9000142)
UPDATE public.members SET is_active = false, club_exit_date = '2012-03-15', updated_at = NOW() WHERE person_number = 9000142;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000142, 'Hirt Hans', '2012-03-15', 'AUSTRITT', 'Aktiv', '2012-03-15', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 79: Kyburz Fritz (Kyburz Fritz, PN 9000088)
UPDATE public.members SET is_active = false, club_exit_date = '2005-03-18', updated_at = NOW() WHERE person_number = 9000088;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000088, 'Kyburz Fritz', '2005-03-18', 'AUSTRITT', 'Aktiv', '2005-03-18', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 81: Hochstrasser Sven (Hochstrasser Sven, PN 9000014)
UPDATE public.members SET is_active = false, club_exit_date = '2004-03-26', updated_at = NOW() WHERE person_number = 9000014;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000014, 'Hochstrasser Sven', '2004-03-26', 'AUSTRITT', 'Aktiv', '2004-03-26', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 88: Schmied Hansjörg (Schmied Hansjörg, PN 9000045)
UPDATE public.members SET is_active = false, club_exit_date = '2003-03-21', updated_at = NOW() WHERE person_number = 9000045;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000045, 'Schmied Hansjörg', '2003-03-21', 'AUSTRITT', 'Aktiv', '2003-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 89: Thomas Hochuli (Hochuli Thomas, PN 1237972)
-- Thomas Hochuli ist heute aktiv: Status bleibt is_active = true, Austritt nur in Historie dokumentiert
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1237972, 'Hochuli Thomas', '2003-03-21', 'AUSTRITT', 'Aktiv (1989)', 'Ausgetreten 2003 (Historisch vor Wiedereintritt)', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 94: Lüscher Nicole (Lüscher Nicole, PN 9000037)
UPDATE public.members SET is_active = false, club_exit_date = '2002-03-21', updated_at = NOW() WHERE person_number = 9000037;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000037, 'Lüscher Nicole', '2002-03-21', 'AUSTRITT', 'Aktiv', '2002-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 97: Schaffner Philipp (Schaffner Philipp, PN 9000043)
UPDATE public.members SET is_active = false, club_exit_date = '2001-03-21', updated_at = NOW() WHERE person_number = 9000043;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000043, 'Schaffner Philipp', '2001-03-21', 'AUSTRITT', 'Aktiv', '2001-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 98: Blank Markus (Blank Markus, PN 9000001)
UPDATE public.members SET is_active = false, club_exit_date = '2001-03-21', updated_at = NOW() WHERE person_number = 9000001;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000001, 'Blank Markus', '2001-03-21', 'AUSTRITT', 'Aktiv', '2001-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 99: Gloor Eveline (Gloor Eveline, PN 9000006)
UPDATE public.members SET is_active = false, club_exit_date = '2001-03-21', updated_at = NOW() WHERE person_number = 9000006;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000006, 'Gloor Eveline', '2001-03-21', 'AUSTRITT', 'Aktiv', '2001-03-21', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 114: Wegmüller Arthur (Wegmüller Arthur, PN 1073758)
-- Arthur Wegmüller ist 2022 verstorben: 1997-Austritt in Historie dokumentiert
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (1073758, 'Wegmüller Arthur', '1997-04-25', 'AUSTRITT', 'Aktiv', '1997-04-25', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 124: Pia Peter (Peter Pia, PN 9000092)
UPDATE public.members SET is_active = false, club_exit_date = '1986-03-07', updated_at = NOW() WHERE person_number = 9000092;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000092, 'Peter Pia', '1986-03-07', 'AUSTRITT', 'Aktiv', '1986-03-07', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 131: Steger Hermann (Steger Hermann, PN 9000078)
UPDATE public.members SET is_active = false, club_exit_date = '1976-03-12', updated_at = NOW() WHERE person_number = 9000078;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000078, 'Steger Hermann', '1976-03-12', 'AUSTRITT', 'Aktiv', '1976-03-12', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 132: Zimmerli Peter (Zimmerli Peter, PN 9000099)
UPDATE public.members SET is_active = false, club_exit_date = '1976-03-12', updated_at = NOW() WHERE person_number = 9000099;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, alterwert, neuerwert, source, erfasstvon)
VALUES (9000099, 'Zimmerli Peter', '1976-03-12', 'AUSTRITT', 'Aktiv', '1976-03-12', 'GV-Protokoll-Abgleich', 'GV-Import');

-- ===========================================================================
-- 3. TODESFÄLLE / STERBEDATUM NACHFÜHREN
-- ===========================================================================
-- Zeile 13: Arthur Wegmüller (Wegmüller Arthur, PN 1073758)
UPDATE public.members SET deceased = true, death_date = '2022-09-06', is_active = false, club_exit_date = COALESCE(club_exit_date, '2022-09-06'), updated_at = NOW() WHERE person_number = 1073758;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1073758, 'Wegmüller Arthur', '2022-09-06', 'VERSTORBEN', '2022-09-06', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 22: Bernhard Hauri (Hauri Bernhard, PN 9000010)
UPDATE public.members SET deceased = true, death_date = '2021-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2021-12-31'), updated_at = NOW() WHERE person_number = 9000010;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000010, 'Hauri Bernhard', '2021-12-31', 'VERSTORBEN', '2021-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 29: Suter Heinrich (Suter Heinrich, PN 9000086)
UPDATE public.members SET deceased = true, death_date = '2020-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2020-12-31'), updated_at = NOW() WHERE person_number = 9000086;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000086, 'Suter Heinrich', '2020-12-31', 'VERSTORBEN', '2020-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 49: Hans Bäni (Bäni Hans, PN 9000108)
UPDATE public.members SET deceased = true, death_date = '2017-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2017-12-31'), updated_at = NOW() WHERE person_number = 9000108;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000108, 'Bäni Hans', '2017-12-31', 'VERSTORBEN', '2017-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 53: Ruth Künzli (Künzli Ruth, PN 9000027)
UPDATE public.members SET deceased = true, death_date = '2016-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2016-12-31'), updated_at = NOW() WHERE person_number = 9000027;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000027, 'Künzli Ruth', '2016-12-31', 'VERSTORBEN', '2016-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 54: Hansruedi Hochstrasser (Hochstrasser Hansrudolf, PN 9000013)
UPDATE public.members SET deceased = true, death_date = '2016-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2016-12-31'), updated_at = NOW() WHERE person_number = 9000013;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000013, 'Hochstrasser Hansrudolf', '2016-12-31', 'VERSTORBEN', '2016-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 80: Widmer Hanspeter (Widmer Hanspeter, PN 9000054)
UPDATE public.members SET deceased = true, death_date = '2003-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2003-12-31'), updated_at = NOW() WHERE person_number = 9000054;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000054, 'Widmer Hanspeter', '2003-12-31', 'VERSTORBEN', '2003-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 82: Werner Hofmann (Hofmann Werner, PN 9000016)
UPDATE public.members SET deceased = true, death_date = '2002-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2002-12-31'), updated_at = NOW() WHERE person_number = 9000016;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000016, 'Hofmann Werner', '2002-12-31', 'VERSTORBEN', '2002-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 90: Gehrig Willi (Gehrig Willy, PN 9000062)
UPDATE public.members SET deceased = true, death_date = '2002-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2002-12-31'), updated_at = NOW() WHERE person_number = 9000062;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000062, 'Gehrig Willy', '2002-12-31', 'VERSTORBEN', '2002-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 91: Künzli Werner (Künzli Werner, PN 9000073)
UPDATE public.members SET deceased = true, death_date = '2001-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2001-12-31'), updated_at = NOW() WHERE person_number = 9000073;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000073, 'Künzli Werner', '2001-12-31', 'VERSTORBEN', '2001-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 92: Ernst Robert (Ernst Robert, PN 9000186)
UPDATE public.members SET deceased = true, death_date = '2001-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '2001-12-31'), updated_at = NOW() WHERE person_number = 9000186;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000186, 'Ernst Robert', '2001-12-31', 'VERSTORBEN', '2001-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 100: Eichenberger Max (Eichenberger Max, PN 9000070)
UPDATE public.members SET deceased = true, death_date = '1999-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '1999-12-31'), updated_at = NOW() WHERE person_number = 9000070;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000070, 'Eichenberger Max', '1999-12-31', 'VERSTORBEN', '1999-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 101: Müller Rudolf (Müller Rudolf, PN 9000076)
UPDATE public.members SET deceased = true, death_date = '1999-12-31', is_active = false, club_exit_date = COALESCE(club_exit_date, '1999-12-31'), updated_at = NOW() WHERE person_number = 9000076;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000076, 'Müller Rudolf', '1999-12-31', 'VERSTORBEN', '1999-12-31', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Ergänzung Historie für bereits früher bestätigte Todesfälle:
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
SELECT 9000025, 'Künzli Gerhard', '2022-09-29', 'VERSTORBEN', '2022-09-29', 'GV-Protokoll-Abgleich', 'GV-Import'
WHERE NOT EXISTS (SELECT 1 FROM public.member_history WHERE person_number = 9000025 AND ereignistyp = 'VERSTORBEN');

INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
SELECT 9000035, 'Kurt Lüscher', '2024-12-24', 'VERSTORBEN', '2024-12-24', 'GV-Protokoll-Abgleich', 'GV-Import'
WHERE NOT EXISTS (SELECT 1 FROM public.member_history WHERE person_number = 9000035 AND ereignistyp = 'VERSTORBEN');

-- ===========================================================================
-- 4. EHRENMITGLIEDSCHAFTEN NACHFÜHREN
-- ===========================================================================
-- Zeile 26: Marco Fischer (Fischer Marco, PN 1080345)
UPDATE public.members SET is_honorary = true, honorary_member_since = '2022-05-05', honorary_member_since_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1080345;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1080345, 'Fischer Marco', '2022-05-05', 'EHRENMITGLIED', '2022-05-05', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 111: Thomas Gebert (Gebert Thomas, PN 2365703)
UPDATE public.members SET is_honorary = true, honorary_member_since = '1997-04-25', honorary_member_since_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 2365703;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (2365703, 'Gebert Thomas', '1997-04-25', 'EHRENMITGLIED', '1997-04-25', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 112: Ernst Kunz (Kunz Ernst, PN 1073730)
UPDATE public.members SET is_honorary = true, honorary_member_since = '1997-04-25', honorary_member_since_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 1073730;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (1073730, 'Kunz Ernst', '1997-04-25', 'EHRENMITGLIED', '1997-04-25', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 113: Beat Lenherr (Lenherr Beat, PN 9000030)
UPDATE public.members SET is_honorary = true, honorary_member_since = '1997-04-25', honorary_member_since_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 9000030;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000030, 'Lenherr Beat', '1997-04-25', 'EHRENMITGLIED', '1997-04-25', 'GV-Protokoll-Abgleich', 'GV-Import');

-- Zeile 126: Edwin Lüscher (Lüscher Edwin, PN 9000185)
UPDATE public.members SET is_honorary = true, honorary_member_since = '1981-02-26', honorary_member_since_source = 'GV-Protokoll', updated_at = NOW() WHERE person_number = 9000185;
INSERT INTO public.member_history (person_number, name, datum, ereignistyp, neuerwert, source, erfasstvon)
VALUES (9000185, 'Lüscher Edwin', '1981-02-26', 'EHRENMITGLIED', '1981-02-26', 'GV-Protokoll-Abgleich', 'GV-Import');

COMMIT;