-- ==============================================================================
-- Migration 68: KI-Modell Healthcheck, Fallback-Konfiguration & pg_cron Automation
-- Sportschützen Muhen - Zentrales Vereinsportal
--
-- Features:
-- 1. Aktivierung von pg_net und pg_cron (falls nicht vorhanden)
-- 2. Initiale Konfiguration für ai_primary_model und ai_model_health in system_app_configs
-- 3. Zeitgesteuerter Cronjob 'ai-model-healthcheck' (täglich um 04:00 Uhr via net.http_get)
-- ==============================================================================

-- 1. Extensions sicherstellen
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Standard-Konfiguration in system_app_configs hinterlegen
INSERT INTO public.system_app_configs (key, value, description, category, updated_at)
VALUES 
  ('ai_primary_model', 'gemini-3-flash-preview', 'Aktuell empfohlenes primäres Google Gemini KI-Modell', 'ai_system', NOW()),
  ('ai_model_health', '{"tested_at":null,"status":"initial_seed","primary_model":"gemini-3-flash-preview"}', 'Prüfbericht des automatischen KI-Modell Healthchecks', 'ai_system', NOW())
ON CONFLICT (key) DO UPDATE 
SET updated_at = NOW();

-- 3. Cronjob registrieren (täglich um 04:00 Uhr)
DO $$
BEGIN
  -- Vorhandenen Job entfernen falls bereits registriert
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-model-healthcheck') THEN
    PERFORM cron.unschedule('ai-model-healthcheck');
  END IF;

  -- Täglicher Check um 04:00 Uhr UTC
  PERFORM cron.schedule(
    'ai-model-healthcheck',
    '0 4 * * *',
    $cmd$
      SELECT net.http_get(
        url := 'https://v1-vorstand-api.dan-hunziker73.workers.dev/?action=check_ai_models',
        timeout_milliseconds := 15000
      );
    $cmd$
  );
END $$;
