-- ==============================================================================
-- 75_gv_traktanden_pool_and_auto_numbering.sql
-- Migration: Traktanden-Pool (Vorratskammer) & dynamische Nummerierung
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- 1. Spalte is_in_pool hinzufügen
ALTER TABLE public.gv_traktanden
    ADD COLUMN IF NOT EXISTS is_in_pool BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_gv_traktanden_pool ON public.gv_traktanden(gv_id, is_in_pool, sort_order);

-- 2. Bestehende Wahl-Traktanden konsolidieren
UPDATE public.gv_traktanden
SET is_election = true
WHERE LOWER(titel) LIKE '%wahl%' OR LOWER(titel) LIKE '%erneuerung%';

-- 3. GV 2026 Wahljahr-Status konsolidieren
UPDATE public.gv_instances
SET is_election_year = true
WHERE id = 'gv_2026' OR year = 2026;

-- 4. Berechtigungen sicherstellen
GRANT ALL ON public.gv_traktanden TO authenticated, anon;
GRANT ALL ON public.gv_instances TO authenticated, anon;

COMMIT;
