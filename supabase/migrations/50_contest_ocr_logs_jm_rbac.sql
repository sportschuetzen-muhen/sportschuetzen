-- 50_contest_ocr_logs_jm_rbac.sql
-- Ermöglicht Schützenmeister / Jahresmeisterschaft Zugriff auf contest_ocr_logs für Standblatt-Freigabe

DROP POLICY IF EXISTS contest_ocr_logs_rbac_select ON public.contest_ocr_logs;
CREATE POLICY contest_ocr_logs_rbac_select
    ON public.contest_ocr_logs FOR SELECT
    TO authenticated
    USING (
        (SELECT rbac_allows(ARRAY['resultate.view', 'resultate.manage', 'jahresmeisterschaft.view', 'jahresmeisterschaft.manage']))
    );

DROP POLICY IF EXISTS contest_ocr_logs_rbac_write ON public.contest_ocr_logs;
CREATE POLICY contest_ocr_logs_rbac_write
    ON public.contest_ocr_logs FOR ALL
    TO authenticated
    USING (
        (SELECT rbac_allows(ARRAY['resultate.manage', 'jahresmeisterschaft.manage']))
    )
    WITH CHECK (
        (SELECT rbac_allows(ARRAY['resultate.manage', 'jahresmeisterschaft.manage']))
    );

-- Fallback Default für id, falls vom Client nicht explizit mitgesendet
ALTER TABLE public.contest_ocr_logs ALTER COLUMN id SET DEFAULT ('ocr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16));
