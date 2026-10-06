-- ==============================================================================
-- 44_gv_traktanden_parent_and_hierarchy.sql
-- Migration: Untertraktanden und Hierarchie für Generalversammlung
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- 1. Spalte parent_id für Untertraktanden hinzufügen (Selbstreferenz mit Cascade Delete)
ALTER TABLE public.gv_traktanden
    ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50) REFERENCES public.gv_traktanden(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gv_traktanden_parent ON public.gv_traktanden(parent_id);

-- 2. Berechtigungen sicherstellen
GRANT ALL ON public.gv_traktanden TO authenticated, anon;
GRANT ALL ON public.gv_instances TO authenticated, anon;
GRANT ALL ON public.gv_praesenz TO authenticated, anon;

COMMIT;
