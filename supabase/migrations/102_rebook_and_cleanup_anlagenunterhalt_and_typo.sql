-- Migration 102: Bereinigung Anlagenunterhalt (nur 4xxx Konten) & Korrektur Typo 2811
-- Autor: Antigravity
-- Datum: 2026-10-27

-- 1. Tippfehler bei Konto 2811 korrigieren (Erneurungen -> Erneuerungen)
UPDATE public.accounting_accounts
SET bezeichnung = 'Vereinskapital Erneuerungen'
WHERE konto = '2811';

-- 2. Bestehende Buchungen von 6001 auf 4100 (Unterhalt KK-Anlage) umbuchen
UPDATE public.accounting_journal
SET konto_soll = '4100'
WHERE konto_soll = '6001';

UPDATE public.accounting_journal
SET konto_haben = '4100'
WHERE konto_haben = '6001';

-- 3. Allfällige Budget-Einträge für 6001 bereinigen
DELETE FROM public.accounting_budgets
WHERE konto = '6001';

-- 4. Konto 6001 aus dem Kontenrahmen löschen (Unterhalt läuft rein über 4100 / 4101)
DELETE FROM public.accounting_accounts
WHERE konto = '6001';
