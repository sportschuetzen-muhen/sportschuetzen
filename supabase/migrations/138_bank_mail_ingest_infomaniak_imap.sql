-- ==============================================================================
-- 138_bank_mail_ingest_infomaniak_imap.sql
-- Migration: Bank-Mail-Ingest von Gmail auf Infomaniak IMAP umstellen
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Inhalte:
-- 1. public.bank_mail_ingest_logs: gmail_message_id / gmail_thread_id auf
--    VARCHAR(255) erweitern (für Standard-RFC-Message-IDs / IMAP-UIDs).
-- 2. public.set_bank_cron_config(): Standard-Zeitplan '0 2,3,4,13 * * *'
--    (03:00, 04:00, 05:00 & 14:00 Uhr MEZ / UTC+1) zulassen.
-- 3. pg_cron Job 'bank-mail-ingest' auf '0 2,3,4,13 * * *' aktivieren und
--    rental_settings synchronisieren.
-- ==============================================================================

BEGIN;

-- 1. Idempotenz-Spalten für Message-IDs / IMAP-Schlüssel erweitern
ALTER TABLE public.bank_mail_ingest_logs
    ALTER COLUMN gmail_message_id TYPE VARCHAR(255),
    ALTER COLUMN gmail_thread_id TYPE VARCHAR(255);

-- 2. Cron-Konfiguration um täglichen Nacht-/Mittags-Scan erweitern
CREATE OR REPLACE FUNCTION public.set_bank_cron_config(
    p_schedule TEXT,
    p_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
    v_jobid BIGINT;
    v_clean_schedule TEXT;
BEGIN
    -- Berechtigung: strikt vermietung.manage
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['vermietung.manage'])
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung (vermietung.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    -- Validiere Intervall (Standard-Auswahlen schützen)
    v_clean_schedule := trim(p_schedule);
    IF v_clean_schedule NOT IN (
        '0 2,3,4,13 * * *',
        '*/15 * * * *',
        '*/30 * * * *',
        '0 * * * *',
        '5 */2 * * *',
        '0 */4 * * *',
        '0 8 * * *'
    ) THEN
        RAISE EXCEPTION 'Ungültiger Cron-Ausdruck: %', p_schedule;
    END IF;

    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'bank-mail-ingest';

    IF v_jobid IS NOT NULL THEN
        PERFORM cron.alter_job(
            job_id := v_jobid,
            schedule := v_clean_schedule,
            active := p_active
        );
    ELSE
        PERFORM cron.schedule(
            'bank-mail-ingest',
            v_clean_schedule,
            $cmd$
              SELECT net.http_post(
                url := 'http://kong:8000/functions/v1/process-bank-mails',
                headers := jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bank_ingest_cron_secret' LIMIT 1)
                ),
                body := '{"trigger":"cron"}'::jsonb,
                timeout_milliseconds := 120000
              );
            $cmd$
        );
        IF p_active IS FALSE THEN
            SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'bank-mail-ingest';
            PERFORM cron.alter_job(job_id := v_jobid, active := false);
        END IF;
    END IF;

    -- In rental_settings hinterlegen für UI-Zustand
    INSERT INTO public.rental_settings (setting_key, setting_value, description, updated_at)
    VALUES
        ('bank_cron_schedule', v_clean_schedule, 'Zeitintervall für Bank-Mail-Ingest Cronjob', now()),
        ('bank_cron_active', p_active::TEXT, 'Aktivitätsstatus des Bank-Mail-Ingest Cronjobs', now())
    ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'schedule', v_clean_schedule, 'active', p_active);
END;
$$;

REVOKE ALL ON FUNCTION public.set_bank_cron_config(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_bank_cron_config(TEXT, BOOLEAN) TO authenticated, service_role;

-- 3. Bestehenden Cronjob auf 03:00, 04:00, 05:00 und 14:00 Uhr MEZ (02,03,04,13 UTC) aktivieren
SELECT public.set_bank_cron_config('0 2,3,4,13 * * *', true);

NOTIFY pgrst, 'reload schema';

COMMIT;
