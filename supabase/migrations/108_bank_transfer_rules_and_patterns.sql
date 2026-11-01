-- Migration 108: Automatische Bankregeln für interne Kontoüberträge & Geldtransit (1099)
-- Autor: Antigravity
-- Datum: 2026-11-01

INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'Uebertrag Wirtschaftskonto an Zahlungskonto', 'Wirtschaft', 'Kontoübertrag Wirtschaft', '1020', '1099', 11
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE sort_order = 11
);

INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'Uebertrag Zahlungskonto an Wirtschaftskonto', 'Zahlungskonto', 'Kontoübertrag Zahlung', '1021', '1099', 12
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE sort_order = 12
);

INSERT INTO public.accounting_bank_rules (label, pattern_text, prefix, soll, haben, sort_order)
SELECT 'Kontoübertrag intern Raiffeisen', 'Kontoübertrag', 'Kontoübertrag', '1020', '1099', 14
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounting_bank_rules WHERE sort_order = 14
);

-- Saubere UTF-8 Beschriftung sicherstellen
UPDATE public.accounting_bank_rules 
SET label = 'Übertrag Wirtschaftskonto an Zahlungskonto',
    pattern_text = 'Wirtschaft',
    prefix = 'Kontoübertrag Wirtschaft'
WHERE sort_order = 11;

UPDATE public.accounting_bank_rules 
SET label = 'Übertrag Zahlungskonto an Wirtschaftskonto',
    pattern_text = 'Zahlungskonto',
    prefix = 'Kontoübertrag Zahlung'
WHERE sort_order = 12;

UPDATE public.accounting_bank_rules 
SET label = 'Kontoübertrag intern Raiffeisen',
    pattern_text = 'Kontoübertrag',
    prefix = 'Kontoübertrag'
WHERE sort_order = 14;
