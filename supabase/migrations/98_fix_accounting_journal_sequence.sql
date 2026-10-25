-- Migration 98: Synchronize accounting_journal_id_seq with MAX(id)
-- Behebt den Fehler: duplicate key value violates unique constraint "accounting_journal_pkey"
SELECT setval('accounting_journal_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.accounting_journal));
