-- ==============================================================================
-- Migration 90: Steuerung & Monitoring der Bank-Automation (Gmail -> Vermietung)
-- Sportschützen Muhen - Zentrales Vereinsportal
--
-- Features:
-- 1. RPC get_bank_automation_status() (Liefert Cron-Status, Intervall, Letzte Ausführung)
-- 2. RPC set_bank_cron_config(p_schedule, p_active) (Sicheres Ändern des Intervalls & Aktivitätsstatus)
-- 3. RPC trigger_bank_mail_scan_now() (Manueller Sofort-Scan via net.http_post)
-- ==============================================================================

BEGIN;

-- 1. Status der Automation abfragen
CREATE OR REPLACE FUNCTION public.get_bank_automation_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
    v_job RECORD;
    v_last_run RECORD;
    v_total_logs INT;
    v_success_logs INT;
    v_error_logs INT;
BEGIN
    -- Berechtigung: vermietung.view oder vermietung.manage
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['vermietung.view', 'vermietung.manage'])
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung (vermietung.view erforderlich).' USING ERRCODE = '42501';
    END IF;

    SELECT jobid, schedule, active INTO v_job
    FROM cron.job
    WHERE jobname = 'bank-mail-ingest'
    LIMIT 1;

    -- Letzter Lauf aus pg_net History
    SELECT created, status_code, error_msg INTO v_last_run
    FROM net._http_response
    ORDER BY id DESC
    LIMIT 1;

    SELECT COUNT(*) INTO v_total_logs FROM public.bank_mail_ingest_logs;
    SELECT COUNT(*) INTO v_success_logs FROM public.bank_mail_ingest_logs WHERE result IN ('success', 'already_paid');
    SELECT COUNT(*) INTO v_error_logs FROM public.bank_mail_ingest_logs WHERE result NOT IN ('success', 'already_paid', 'processing');

    RETURN jsonb_build_object(
        'job_exists', v_job IS NOT NULL,
        'active', COALESCE(v_job.active, false),
        'schedule', COALESCE(v_job.schedule, '5 */2 * * *'),
        'last_run_at', v_last_run.created,
        'last_status_code', v_last_run.status_code,
        'last_error', v_last_run.error_msg,
        'total_processed', v_total_logs,
        'success_count', v_success_logs,
        'error_count', v_error_logs
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_bank_automation_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_automation_status() TO authenticated, service_role;

-- 2. Cron-Konfiguration anpassen (Intervall & Aktivitäts-Switch)
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
    IF v_clean_schedule NOT IN ('*/15 * * * *', '*/30 * * * *', '0 * * * *', '5 */2 * * *', '0 */4 * * *', '0 8 * * *') THEN
        RAISE EXCEPTION 'Ungültiger Cron-Ausdruck: %', p_schedule;
    END IF;

    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'bank-mail-ingest';

    IF v_jobid IS NOT NULL THEN
        -- Schedule anpassen
        PERFORM cron.alter_job(
            job_id := v_jobid,
            schedule := v_clean_schedule,
            active := p_active
        );
    ELSE
        -- Neu anlegen falls nicht existent
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

-- 3. Manueller Sofort-Scan per Klick im Cockpit
CREATE OR REPLACE FUNCTION public.trigger_bank_mail_scan_now()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
    v_req_id BIGINT;
    v_secret TEXT;
BEGIN
    -- Berechtigung: strikt vermietung.manage
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['vermietung.manage'])
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung (vermietung.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'bank_ingest_cron_secret' LIMIT 1;
    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'bank_ingest_cron_secret fehlt im Vault.';
    END IF;

    SELECT net.http_post(
        url := 'http://kong:8000/functions/v1/process-bank-mails',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', v_secret
        ),
        body := '{"trigger":"manual_ui"}'::jsonb,
        timeout_milliseconds := 60000
    ) INTO v_req_id;

    RETURN jsonb_build_object('success', true, 'request_id', v_req_id, 'message', 'Scan erfolgreich angestossen.');
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_bank_mail_scan_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_bank_mail_scan_now() TO authenticated, service_role;

COMMIT;
