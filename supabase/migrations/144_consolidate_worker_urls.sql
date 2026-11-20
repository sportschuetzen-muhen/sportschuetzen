-- Migration 144: 2-Worker-Konsolidierung (Option B)
-- 1. Bestehende Standblatt-R2-URLs in public.contest_ocr_logs auf v1-vorstand-api umschreiben
-- 2. Doppelten unauthentifizierten pg_cron-Job ai-model-healthcheck entfernen (Cloudflare Cron Trigger scheduled() ist aktiv)

BEGIN;

UPDATE public.contest_ocr_logs
SET raw_response = jsonb_set(
  raw_response,
  '{fileUrl}',
  to_jsonb(
    replace(
      raw_response->>'fileUrl',
      'https://github-dropdown-refresh.dan-hunziker73.workers.dev',
      'https://v1-vorstand-api.dan-hunziker73.workers.dev'
    )
  ),
  false
)
WHERE contest_type = 'standblatt'
  AND raw_response->>'fileUrl' LIKE 'https://github-dropdown-refresh.dan-hunziker73.workers.dev%';

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'ai-model-healthcheck'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

COMMIT;
