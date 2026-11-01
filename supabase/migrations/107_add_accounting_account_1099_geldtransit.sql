-- Migration 107: Anlage Sachkonto 1099 Geldtransit & Bankregel für Bargeldüberträge
-- Autor: Antigravity
-- Datum: 2026-11-01

-- 1. Sachkonto 1099 Geldtransit (Transferkonto liquide Mittel) anlegen
INSERT INTO public.accounting_accounts (konto, bezeichnung, klasse, eroeffnungssaldo, sort_order)
VALUES ('1099', 'Geldtransit (Transferkonto liquide Mittel)', 'Aktiven', 0.00, 56)
ON CONFLICT (konto) DO UPDATE
SET bezeichnung = EXCLUDED.bezeichnung,
    klasse = EXCLUDED.klasse,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- 2. Automatische Bankregel für Bancomat- / Kassen-Einzahlungen hinterlegen
INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
VALUES ('Bargeldeinzahlung Kasse an Bank', 'Bancomat Einzahlung', 'Bargeldeinzahlung Kasse', '1020', '1099', 10)
ON CONFLICT DO NOTHING;

-- 3. Bestehende Bank-Buchung ID 891 (Bancomat-Einzahlung RB Neerach) auf Gegenkonto 1099 umkontieren
UPDATE public.accounting_journal
SET konto_haben = '1099',
    buchungstyp = 'TRANSIT',
    updated_at = now()
WHERE id = 891 AND konto_haben = '1000';

-- 4. Physische Kassenentnahme für den Bargeldübertrag vom 08.03.2026 im Journal verankern
-- Soll 1099 Geldtransit an Haben 1000 Kasse (CHF 1'150.00), damit Konto 1099 saldiert (0.00) ist
INSERT INTO public.accounting_journal (
    jahr,
    datum,
    beleg_nr,
    beschreibung,
    konto_soll,
    konto_haben,
    betrag,
    typ,
    buchungstyp,
    created_at,
    updated_at
)
SELECT
    2026,
    '2026-03-08'::date,
    'Kasse_2026-000',
    'Barauszahlung Kasse für Bankeinzahlung RB Neerach',
    '1099',
    '1000',
    1150.00,
    'Kassa',
    'TRANSIT',
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_journal 
    WHERE jahr = 2026 AND konto_soll = '1099' AND konto_haben = '1000' AND betrag = 1150.00
);
