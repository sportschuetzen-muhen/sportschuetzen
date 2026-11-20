-- Migration 104: Transitkonten-Struktur für Stiche & Jahresbeitrag (KK, LG, Z)
-- Autor: Antigravity
-- Datum: 2026-10-31

-- 1. Bestehende Sammelkonten benennen
UPDATE public.accounting_accounts
SET bezeichnung = 'Transit Sammel- & Klärungskonto Meisterschaften'
WHERE konto = '1300';

-- 2. Block 1: Kleinkaliber 50m (1310 - 1329)
INSERT INTO public.accounting_accounts (konto, bezeichnung, klasse, eroeffnungssaldo, sort_order)
VALUES
  ('1310', 'Transit 50m Kleinkaliber (Sammelkonto)', 'Aktiven', 0.00, 100),
  ('1311', 'Transit KK001: 50m Grenzland', 'Aktiven', 0.00, 110),
  ('1312', 'Transit KK002: 50m AG DEZ liegend', 'Aktiven', 0.00, 120),
  ('1313', 'Transit KK003: 50m AG DEZ 2-Stellung', 'Aktiven', 0.00, 130),
  ('1314', 'Transit KK004: 50m AG DEZ 3-Stellung', 'Aktiven', 0.00, 140),
  ('1315', 'Transit KK005: 50m AG DEZ Seniorenveteranen', 'Aktiven', 0.00, 150),
  ('1316', 'Transit KK006: 50m Verbandsschiessen', 'Aktiven', 0.00, 160),
  ('1317', 'Transit KK007: 50m Vereinsschiessen', 'Aktiven', 0.00, 170),
  ('1318', 'Transit KK008: 50m Volksschiessen', 'Aktiven', 0.00, 180),
  ('1319', 'Transit KK009: 50m Meisterschaft (Reserve)', 'Aktiven', 0.00, 190),
  ('1320', 'Transit KK010: 50m Meisterschaft (Reserve)', 'Aktiven', 0.00, 200)
ON CONFLICT (konto) DO UPDATE
SET bezeichnung = EXCLUDED.bezeichnung,
    klasse = EXCLUDED.klasse;

-- 3. Block 2: Luftgewehr 10m (1330 - 1349)
INSERT INTO public.accounting_accounts (konto, bezeichnung, klasse, eroeffnungssaldo, sort_order)
VALUES
  ('1330', 'Transit 10m Luftgewehr (Sammelkonto)', 'Aktiven', 0.00, 210),
  ('1331', 'Transit LG001: 10m AG DEZ', 'Aktiven', 0.00, 220),
  ('1332', 'Transit LG002: 10m AG DEZ Auflage', 'Aktiven', 0.00, 230),
  ('1333', 'Transit LG003: 10m CH DEZ', 'Aktiven', 0.00, 240),
  ('1334', 'Transit LG004: 10m CH DEZ Auflage', 'Aktiven', 0.00, 250),
  ('1335', 'Transit LG005: 10m Verbandsschiessen', 'Aktiven', 0.00, 260),
  ('1336', 'Transit LG006: 10m Vereinsschiessen', 'Aktiven', 0.00, 270),
  ('1337', 'Transit LG007: 10m CH Kniendmeisterschaft', 'Aktiven', 0.00, 280),
  ('1338', 'Transit LG008: 10m Verbandsschiessen Nachwuchs', 'Aktiven', 0.00, 290),
  ('1339', 'Transit LG009: 10m Vereinswettschiessen U10-U17', 'Aktiven', 0.00, 300),
  ('1340', 'Transit LG010: 10m Vereinswettschiessen U21', 'Aktiven', 0.00, 310)
ON CONFLICT (konto) DO UPDATE
SET bezeichnung = EXCLUDED.bezeichnung,
    klasse = EXCLUDED.klasse;

-- 4. Block 3: Zusatzpositionen, Feste & Bekleidung (1350 - 1369)
INSERT INTO public.accounting_accounts (konto, bezeichnung, klasse, eroeffnungssaldo, sort_order)
VALUES
  ('1350', 'Transit Sonderprojekte & Anlässe (Sammelkonto)', 'Aktiven', 0.00, 320),
  ('1351', 'Transit Z001: Vereinsbekleidung / Jacken', 'Aktiven', 0.00, 330),
  ('1352', 'Transit Z002: Schützenfeste (Festkarten & Stiche)', 'Aktiven', 0.00, 340),
  ('1353', 'Transit Z003: Schützenfeste (Logis & Übernachtung)', 'Aktiven', 0.00, 350),
  ('1354', 'Transit Z004: Sonderbeitrag Anlass (Reserve)', 'Aktiven', 0.00, 360),
  ('1355', 'Transit Z005: Sonderbeitrag Anlass (Reserve)', 'Aktiven', 0.00, 370)
ON CONFLICT (konto) DO UPDATE
SET bezeichnung = EXCLUDED.bezeichnung,
    klasse = EXCLUDED.klasse;

-- 5. Sort Order global strikt nach Kontonummer KMU ausrichten
WITH reordered AS (
  SELECT konto, ROW_NUMBER() OVER (ORDER BY konto) * 10 AS new_sort
  FROM public.accounting_accounts
)
UPDATE public.accounting_accounts a
SET sort_order = r.new_sort
FROM reordered r
WHERE a.konto = r.konto;

-- 6. Gebührenkonfiguration (gebuehren_config) auf die neuen Transitkonten mappen
UPDATE public.gebuehren_config SET konto_haben = '1311' WHERE key = 'KK001';
UPDATE public.gebuehren_config SET konto_haben = '1312' WHERE key = 'KK002';
UPDATE public.gebuehren_config SET konto_haben = '1313' WHERE key = 'KK003';
UPDATE public.gebuehren_config SET konto_haben = '1314' WHERE key = 'KK004';
UPDATE public.gebuehren_config SET konto_haben = '1315' WHERE key = 'KK005';
UPDATE public.gebuehren_config SET konto_haben = '1316' WHERE key = 'KK006';
UPDATE public.gebuehren_config SET konto_haben = '1317' WHERE key = 'KK007';
UPDATE public.gebuehren_config SET konto_haben = '1318' WHERE key = 'KK008';

UPDATE public.gebuehren_config SET konto_haben = '1331' WHERE key = 'LG001';
UPDATE public.gebuehren_config SET konto_haben = '1332' WHERE key = 'LG002';
UPDATE public.gebuehren_config SET konto_haben = '1333' WHERE key = 'LG003';
UPDATE public.gebuehren_config SET konto_haben = '1334' WHERE key = 'LG004';
UPDATE public.gebuehren_config SET konto_haben = '1335' WHERE key = 'LG005';
UPDATE public.gebuehren_config SET konto_haben = '1336' WHERE key = 'LG006';
UPDATE public.gebuehren_config SET konto_haben = '1337' WHERE key = 'LG007';

UPDATE public.gebuehren_config SET konto_haben = '1351' WHERE key = 'Z001';
UPDATE public.gebuehren_config SET konto_haben = '1352' WHERE key = 'Z002';
UPDATE public.gebuehren_config SET konto_haben = '1353' WHERE key = 'Z003';

-- 7. Bestehende 2026 Beitragspositionen (contributions_positions) angleichen
UPDATE public.contributions_positions cp
SET konto = gc.konto_haben
FROM public.gebuehren_config gc
WHERE cp.source_field = gc.key
  AND cp.year = 2026
  AND cp.source_field IN (
    'KK001','KK002','KK003','KK004','KK005','KK006','KK007','KK008',
    'LG001','LG002','LG003','LG004','LG005','LG006','LG007',
    'Z001','Z002','Z003'
  );
