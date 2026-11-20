-- Migration 109: Verlagerung von hartcodierten Bank-Regeln (Vermietung, RaiseNow, Eigenübertrag) in public.accounting_bank_rules
-- Autor: Antigravity
-- Datum: 2026-11-01

-- 1. Mieterträge Schützenhaus (Miete / Mietvertrag / Vermietung / V-Code an 3650)
INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'Mietertrag Schützenhaus (Miete)', 'Miete', 'Mietertrag Schützenhaus', '1021', '3650', 245
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE label = 'Mietertrag Schützenhaus (Miete)'
);

INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'Mietertrag Schützenhaus (Mietvertrag)', 'Mietvertrag', 'Mietertrag Schützenhaus', '1021', '3650', 246
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE label = 'Mietertrag Schützenhaus (Mietvertrag)'
);

INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'Mietertrag Schützenhaus (Vermietung)', 'Vermietung', 'Mietertrag Schützenhaus', '1021', '3650', 247
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE label = 'Mietertrag Schützenhaus (Vermietung)'
);

INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'Mietertrag Schützenhaus (V-Code)', 'V-20', 'Mietertrag Schützenhaus', '1021', '3650', 249
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE label = 'Mietertrag Schützenhaus (V-Code)'
);

-- 2. RaiseNow Spendenauszahlungen (RaiseNow an 3651)
INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'RaiseNow Payout Spenden', 'RaiseNow', 'Gutschrift RaiseNow', '1020', '3651', 248
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE label = 'RaiseNow Payout Spenden'
);

-- 3. Interne Kontoüberträge bei Absender/Empfänger Sportschützen Muhen
INSERT INTO public.accounting_bank_rules (label, pattern_party, prefix, soll, haben, sort_order)
SELECT 'Kontoübertrag Eigenkonto (Sportschützen Muhen)', 'Sportschützen Muhen', 'Kontoübertrag', '1020', '1099', 15
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE label = 'Kontoübertrag Eigenkonto (Sportschützen Muhen)'
);

-- Saubere UTF-8 Beschriftung und Felder sicherstellen
UPDATE public.accounting_bank_rules 
SET label = 'Mietertrag Schützenhaus (Miete)',
    pattern_text = 'Miete',
    prefix = 'Mietertrag Schützenhaus',
    soll = '1021',
    haben = '3650'
WHERE label = 'Mietertrag Schützenhaus (Miete)';

UPDATE public.accounting_bank_rules 
SET label = 'Mietertrag Schützenhaus (Mietvertrag)',
    pattern_text = 'Mietvertrag',
    prefix = 'Mietertrag Schützenhaus',
    soll = '1021',
    haben = '3650'
WHERE label = 'Mietertrag Schützenhaus (Mietvertrag)';

UPDATE public.accounting_bank_rules 
SET label = 'Mietertrag Schützenhaus (Vermietung)',
    pattern_text = 'Vermietung',
    prefix = 'Mietertrag Schützenhaus',
    soll = '1021',
    haben = '3650'
WHERE label = 'Mietertrag Schützenhaus (Vermietung)';

UPDATE public.accounting_bank_rules 
SET label = 'Mietertrag Schützenhaus (V-Code)',
    pattern_text = 'V-20',
    prefix = 'Mietertrag Schützenhaus',
    soll = '1021',
    haben = '3650'
WHERE label = 'Mietertrag Schützenhaus (V-Code)';

UPDATE public.accounting_bank_rules 
SET label = 'Kontoübertrag Eigenkonto (Sportschützen Muhen)',
    pattern_party = 'Sportschützen Muhen',
    prefix = 'Kontoübertrag',
    soll = '1020',
    haben = '1099'
WHERE label = 'Kontoübertrag Eigenkonto (Sportschützen Muhen)';
