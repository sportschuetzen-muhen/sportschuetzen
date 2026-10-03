-- Migration 34: Erweiterung gebuehren_config um UI- und Steuerungseigenschaften (Single Source of Truth)
-- =========================================================================================

-- 1. Spalten für UI-Darstellung und Zielgruppensteuerung ergänzen
ALTER TABLE public.gebuehren_config 
  ADD COLUMN IF NOT EXISTS ui_gruppe VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ui_feld VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ui_typ VARCHAR(50) DEFAULT 'checkbox',
  ADD COLUMN IF NOT EXISTS zielgruppe VARCHAR(50) DEFAULT 'Alle',
  ADD COLUMN IF NOT EXISTS aktiv BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS bemerkung TEXT;

-- 2. Bereinigung unvollständiger / leerer Dummy-Zeilen
DELETE FROM public.gebuehren_config 
WHERE (key = 'Z003' OR key = '') AND (bezeichnung IS NULL OR TRIM(bezeichnung) = '');

-- 3. Saubere Aktualisierung der bestehenden variablen Zusatzpositionen (Z001, Z002)
-- Z001: Beitrag Vereinsjacke (CHF 60.00, Haben-Konto 8500 'Zusatzerträge')
INSERT INTO public.gebuehren_config (
  key, bezeichnung, bezeichnung_frontend, betrag, konto_haben, kategorie, 
  sort_order, ui_gruppe, ui_feld, ui_typ, zielgruppe, aktiv, bemerkung, updated_at
) VALUES (
  'Z001', 
  'Beitrag Vereinsjacke', 
  'Beitrag Vereinsjacke', 
  60.00, 
  '8500', 
  'variabel', 
  10, 
  'Variable Zusatzpositionen', 
  'Beitrag Vereinsjacke', 
  'amount', 
  'Alle', 
  true, 
  'Standard-Zusatzbeitrag für Vereinsbekleidung',
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  bezeichnung = EXCLUDED.bezeichnung,
  bezeichnung_frontend = EXCLUDED.bezeichnung_frontend,
  betrag = EXCLUDED.betrag,
  konto_haben = EXCLUDED.konto_haben,
  kategorie = EXCLUDED.kategorie,
  sort_order = EXCLUDED.sort_order,
  ui_gruppe = EXCLUDED.ui_gruppe,
  ui_feld = EXCLUDED.ui_feld,
  ui_typ = EXCLUDED.ui_typ,
  zielgruppe = EXCLUDED.zielgruppe,
  aktiv = EXCLUDED.aktiv,
  bemerkung = EXCLUDED.bemerkung,
  updated_at = NOW();

-- Z002: Beitrag Eidg. Schützenfest (CHF 150.00, Haben-Konto 1300 'Verrechnete Schiessgelder')
INSERT INTO public.gebuehren_config (
  key, bezeichnung, bezeichnung_frontend, betrag, konto_haben, kategorie, 
  sort_order, ui_gruppe, ui_feld, ui_typ, zielgruppe, aktiv, bemerkung, updated_at
) VALUES (
  'Z002', 
  'Beitrag Eidg. Schützenfest', 
  'Beitrag Eidg. Schützenfest', 
  150.00, 
  '1300', 
  'variabel', 
  20, 
  'Variable Zusatzpositionen', 
  'Beitrag Eidg. Schützenfest', 
  'amount', 
  'Alle', 
  true, 
  'Umlage/Teilnahmebeitrag Eidg. Schützenfest',
  NOW()
) ON CONFLICT (key) DO UPDATE SET
  bezeichnung = EXCLUDED.bezeichnung,
  bezeichnung_frontend = EXCLUDED.bezeichnung_frontend,
  betrag = EXCLUDED.betrag,
  konto_haben = EXCLUDED.konto_haben,
  kategorie = EXCLUDED.kategorie,
  sort_order = EXCLUDED.sort_order,
  ui_gruppe = EXCLUDED.ui_gruppe,
  ui_feld = EXCLUDED.ui_feld,
  ui_typ = EXCLUDED.ui_typ,
  zielgruppe = EXCLUDED.zielgruppe,
  aktiv = EXCLUDED.aktiv,
  bemerkung = EXCLUDED.bemerkung,
  updated_at = NOW();

-- 4. Initialisierung der bestehenden Gebühren mit Standard-UI-Werten
UPDATE public.gebuehren_config
SET 
  ui_gruppe = CASE 
    WHEN key = 'GE001' THEN 'Infrastruktur'
    WHEN key LIKE 'KK%' THEN '50m Wettschiessen (KK)'
    WHEN key LIKE 'LG%' THEN '10m Wettschiessen (LG)'
    WHEN key LIKE 'JB%' THEN 'Jahresbeitrag'
    WHEN key LIKE 'LI%' THEN 'Lizenzen'
    WHEN key LIKE 'RA%' THEN 'Rabatte'
    WHEN key LIKE 'Z%' THEN 'Variable Zusatzpositionen'
    ELSE COALESCE(kategorie, 'Sonstige Gebühren')
  END,
  ui_feld = COALESCE(ui_feld, bezeichnung_frontend, bezeichnung),
  ui_typ = CASE 
    WHEN key = 'KK008' THEN 'counter'
    WHEN key IN ('KK002', 'KK003', 'KK004', 'KK005') THEN 'singleselect'
    WHEN key LIKE 'Z%' THEN 'amount'
    ELSE 'checkbox'
  END,
  zielgruppe = CASE 
    WHEN kategorie ILIKE '%jugend%' OR kategorie ILIKE '%junioren%' OR key IN ('JB006', 'JB007', 'LI002', 'LG008', 'LG009', 'LG010') THEN 'Junioren'
    WHEN kategorie ILIKE '%aktiv%' OR key IN ('JB001', 'JB002', 'JB003', 'LI001') THEN 'Aktive'
    ELSE 'Alle'
  END,
  aktiv = true
WHERE ui_gruppe IS NULL OR ui_typ IS NULL;
