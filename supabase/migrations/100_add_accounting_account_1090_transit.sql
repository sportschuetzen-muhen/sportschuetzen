-- Migration 100: Klärungskonto 1090 für Bankabgleich anlegen & Textliche Konten-Klarstellung
-- Autor: Antigravity
-- Datum: 2026-10-27

-- 1. Klärungskonto 1090 für noch abzuklärende Bankzahlungen anlegen
INSERT INTO public.accounting_accounts (konto, bezeichnung, klasse, eroeffnungssaldo, sort_order)
VALUES ('1090', 'Noch abzuklärende Bankzahlungen (Transit)', 'Aktiven', 0.00, 55)
ON CONFLICT (konto) DO UPDATE
SET bezeichnung = EXCLUDED.bezeichnung,
    klasse = EXCLUDED.klasse,
    sort_order = EXCLUDED.sort_order;

-- 2. Textliche Eindeutigkeit für Lizenzgebühren schaffen:
-- 3411 = Ertrag (Einnahme von Mitgliedern)
-- 4401 = Aufwand (Verbandsabgabe / Weiterleitung an Verband)
UPDATE public.accounting_accounts
SET bezeichnung = 'Lizenzgebühren Aktive (Ertrag)'
WHERE konto = '3411';

UPDATE public.accounting_accounts
SET bezeichnung = 'Lizenzgebühren Aktive (Aufwand Verband)'
WHERE konto = '4401';
