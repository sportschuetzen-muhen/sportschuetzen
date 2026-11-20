-- Migration 101: Bereinigung obsoletes Konto 3710 (Sponsoring & Spenden)
-- Autor: Antigravity
-- Datum: 2026-10-27
-- Grund: Konto 3710 weist über alle Jahre (2025, 2026) 0 Buchungen auf.
--        Aktives Konto für Spenden & Sponsoring ist 3800 (Sponsoring, Gönner & Spenden).

-- 1. Allfällige Null-Budgeteinträge für 3710 bereinigen
DELETE FROM public.accounting_budgets 
WHERE konto = '3710';

-- 2. Konto 3710 aus dem Kontenrahmen löschen
DELETE FROM public.accounting_accounts 
WHERE konto = '3710';
