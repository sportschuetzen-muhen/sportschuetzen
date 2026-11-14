-- ==============================================================================
-- 133_harden_mail_rls_and_rbac.sql
-- Migration: Sicherheits-Haertung Mail-Modul (RLS, RPC & Berechtigungsmatrix)
-- Projekt: Vereinsportal Sportschuetzen Muhen
--
-- Behebt:
--   1. Entfernt verbliebene offene anon-/dev-/insert-Policies auf:
--      - public.mail_logs
--      - public.communication_campaigns
--      - public.campaign_attachments
--      - public.campaign_recipients
--   2. Entzieht anon direkte Tabellenrechte auf den genannten Mail-Tabellen
--      sowie EXECUTE auf public.log_mail_sent(...) fuer anon/authenticated.
--   3. Stellt eine eng begrenzte SECURITY DEFINER RPC public.log_auth_mail_event(...)
--      fuer Passwort-Reset / Magic-Link / Einladungs-Audit bereit.
--   4. Stellt members.view fuer Rolle 'kassier' wieder her, damit der Mail-Verteiler
--      Mitgliederdaten gemaess RBAC lesen kann.
-- ==============================================================================

BEGIN;

-- 1. Verbliebene Alt-/Dev-Policies entfernen
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS mail_logs_dev_anon ON public.mail_logs;
DROP POLICY IF EXISTS mail_logs_insert_auth ON public.mail_logs;
DROP POLICY IF EXISTS mail_logs_select_auth ON public.mail_logs;
DROP POLICY IF EXISTS mail_logs_manage_auth ON public.mail_logs;

DROP POLICY IF EXISTS campaigns_read_anon ON public.communication_campaigns;
DROP POLICY IF EXISTS campaigns_read_auth ON public.communication_campaigns;
DROP POLICY IF EXISTS campaigns_write_anon ON public.communication_campaigns;
DROP POLICY IF EXISTS campaigns_write_auth ON public.communication_campaigns;

DROP POLICY IF EXISTS attachments_read_anon ON public.campaign_attachments;
DROP POLICY IF EXISTS attachments_read_auth ON public.campaign_attachments;
DROP POLICY IF EXISTS attachments_write_anon ON public.campaign_attachments;
DROP POLICY IF EXISTS attachments_write_auth ON public.campaign_attachments;

DROP POLICY IF EXISTS recipients_read_anon ON public.campaign_recipients;
DROP POLICY IF EXISTS recipients_read_auth ON public.campaign_recipients;
DROP POLICY IF EXISTS recipients_write_anon ON public.campaign_recipients;
DROP POLICY IF EXISTS recipients_write_auth ON public.campaign_recipients;

-- 2. RBAC-Policies explizit sicherstellen (idempotent)
-- ------------------------------------------------------------------------------
ALTER TABLE public.mail_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_logs_rbac_select ON public.mail_logs;
CREATE POLICY mail_logs_rbac_select ON public.mail_logs
    FOR SELECT TO authenticated
    USING ((SELECT public.rbac_allows(ARRAY['mail.view', 'mail.manage'])));

DROP POLICY IF EXISTS mail_logs_rbac_write ON public.mail_logs;
CREATE POLICY mail_logs_rbac_write ON public.mail_logs
    FOR ALL TO authenticated
    USING ((SELECT public.rbac_allows(ARRAY['mail.manage'])))
    WITH CHECK ((SELECT public.rbac_allows(ARRAY['mail.manage'])));

-- 3. Direkte anon-Tabellenrechte entziehen
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.mail_logs FROM anon;
REVOKE ALL ON public.communication_campaigns FROM anon;
REVOKE ALL ON public.campaign_attachments FROM anon;
REVOKE ALL ON public.campaign_recipients FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;

-- 4. SECURITY DEFINER Hilfsfunktion log_mail_sent nur fuer service_role
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.log_mail_sent(
    VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, BOOLEAN, VARCHAR, VARCHAR
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_mail_sent(
    VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, BOOLEAN, VARCHAR, VARCHAR
) TO service_role;

-- 5. Eng begrenzte Audit-RPC fuer Auth-Ereignisse (Passwort-Reset, Magic Link, Einladung)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_auth_mail_event(
    p_event_type      TEXT,
    p_recipient_email VARCHAR,
    p_recipient_name  VARCHAR DEFAULT NULL,
    p_record_id       VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_module_ref  VARCHAR(50);
    v_subject     VARCHAR(500);
    v_snippet     TEXT;
    v_created_by  VARCHAR(100);
    v_id          UUID;
BEGIN
    v_clean_email := LOWER(TRIM(COALESCE(p_recipient_email, '')));
    IF v_clean_email = '' OR position('@' IN v_clean_email) = 0 THEN
        RAISE EXCEPTION 'Ungueltige E-Mail-Adresse.';
    END IF;

    IF p_event_type IN ('pwd_reset', 'magic_link') THEN
        -- Nur fuer aktive Vorstands-Accounts zulassen (verhindert Spam/Missbrauch durch anon)
        IF NOT EXISTS (
            SELECT 1 FROM public.admin_profiles ap
            WHERE LOWER(TRIM(ap.email)) = v_clean_email
              AND ap.is_active = true
        ) THEN
            RAISE EXCEPTION 'Unbekanntes oder inaktives Vorstandsprofil.';
        END IF;

        v_module_ref := 'auth';
        v_created_by := 'vorstand_auth';
        IF p_event_type = 'pwd_reset' THEN
            v_subject := 'Passwort zurücksetzen | Vorstandsportal Sportschützen Muhen';
            v_snippet := 'Passwort-Reset-Link angefordert via Supabase Auth';
        ELSE
            v_subject := 'Anmelde-Link (Magic Link) | Vorstandsportal Sportschützen Muhen';
            v_snippet := 'Einmalklick-Anmelde-Link angefordert via Supabase Auth';
        END IF;

    ELSIF p_event_type = 'invite' THEN
        IF NOT (public.rbac_allows(ARRAY['logins.manage']) OR auth.has_role('admin')) THEN
            RAISE EXCEPTION 'Keine Berechtigung fuer Einladungs-Audit.';
        END IF;

        v_module_ref := 'logins';
        v_created_by := COALESCE(auth.uid()::text, 'admin');
        v_subject := 'Aktivierung Vorstand-Zugang / Passwort setzen (Supabase Auth)';
        v_snippet := 'Aktivierungs-Link gesendet via Supabase Auth';
    ELSE
        RAISE EXCEPTION 'Unbekannter Auth-Mail-Event-Typ: %', p_event_type;
    END IF;

    INSERT INTO public.mail_logs (
        module_ref,
        record_id,
        recipient_email,
        recipient_name,
        subject,
        body_snippet,
        status,
        sender_email,
        sender_name,
        sent_via,
        created_by
    ) VALUES (
        v_module_ref,
        LEFT(COALESCE(p_record_id, p_event_type || '_' || EXTRACT(EPOCH FROM clock_timestamp())::bigint::text), 100),
        LEFT(v_clean_email, 255),
        LEFT(NULLIF(TRIM(COALESCE(p_recipient_name, '')), ''), 255),
        v_subject,
        v_snippet,
        'gesendet',
        'sportschuetzen.muhen@gmail.com',
        'Sportschuetzen Muhen (Auth)',
        'Supabase_Auth_GoTrue',
        v_created_by
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_auth_mail_event(TEXT, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth_mail_event(TEXT, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

-- 6. Berechtigungsmatrix: kassier erhaelt members.view fuer Mail-Verteiler
-- ------------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission, description)
VALUES ('kassier', 'members.view', 'Mitgliederstamm einsehen')
ON CONFLICT (role, permission) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
