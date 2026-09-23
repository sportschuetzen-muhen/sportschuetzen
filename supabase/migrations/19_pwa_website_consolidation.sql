-- ==============================================================================
-- 19_pwa_website_consolidation.sql
-- Migration: Phase 18 – PWA & Website Konsolidierung (Supabase-First)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- 1. Erweiterung von public.contest_results für Mannschaftsmeisterschaft (Runden 4-7)
-- 2. Ergänzung RLS Policies & Grants für nahtlosen Lesezugriff
-- ==============================================================================

-- 1. ERWEITERUNG: public.contest_results um Runden 4 bis 7
-- ------------------------------------------------------------------------------
ALTER TABLE public.contest_results
    ADD COLUMN IF NOT EXISTS r4_team VARCHAR(50) DEFAULT '',
    ADD COLUMN IF NOT EXISTS r4_p1 INTEGER,
    ADD COLUMN IF NOT EXISTS r4_p2 INTEGER,
    ADD COLUMN IF NOT EXISTS r5_team VARCHAR(50) DEFAULT '',
    ADD COLUMN IF NOT EXISTS r5_p1 INTEGER,
    ADD COLUMN IF NOT EXISTS r5_p2 INTEGER,
    ADD COLUMN IF NOT EXISTS r6_team VARCHAR(50) DEFAULT '',
    ADD COLUMN IF NOT EXISTS r6_p1 INTEGER,
    ADD COLUMN IF NOT EXISTS r6_p2 INTEGER,
    ADD COLUMN IF NOT EXISTS r7_team VARCHAR(50) DEFAULT '',
    ADD COLUMN IF NOT EXISTS r7_p1 INTEGER,
    ADD COLUMN IF NOT EXISTS r7_p2 INTEGER;

-- Indizes für Runden-Teams
CREATE INDEX IF NOT EXISTS idx_contest_res_r4_team ON public.contest_results(r4_team);
CREATE INDEX IF NOT EXISTS idx_contest_res_r5_team ON public.contest_results(r5_team);
CREATE INDEX IF NOT EXISTS idx_contest_res_r6_team ON public.contest_results(r6_team);
CREATE INDEX IF NOT EXISTS idx_contest_res_r7_team ON public.contest_results(r7_team);

-- 2. POLICIES SICHERSTELLEN
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.contest_results TO anon, authenticated;
GRANT SELECT ON public.contest_setups TO anon, authenticated;
GRANT SELECT ON public.contest_teams TO anon, authenticated;
GRANT SELECT, INSERT ON public.contest_ocr_logs TO anon, authenticated;
GRANT SELECT ON public.termine TO anon, authenticated;
GRANT SELECT ON public.rental_requests TO anon, authenticated;
GRANT SELECT ON public.members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.poll_responses TO anon, authenticated;
GRANT SELECT ON public.poll_events TO anon, authenticated;
GRANT SELECT, INSERT ON public.poll_views TO anon, authenticated;
GRANT SELECT ON public.jm_seasons TO anon, authenticated;
