-- ==============================================================================
-- 136_switch_club_email_to_infomaniak.sql
-- Migration: Umstellung der Vereins-Mailadresse & SMTP-Konfiguration auf Infomaniak
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Inhalte:
-- 1. public.rental_settings: club_email -> 'info@sportschuetzen-muhen.ch' sowie
--    Ersetzung von sportschuetzen.muhen@gmail.com in rental_cc_emails & wirtschaft_email
--    (calendar_id bleibt fuer Google Calendar auf sportschuetzen.muhen@gmail.com)
-- 2. public.system_mail_configs: Ersetzung von sportschuetzen.muhen@gmail.com
--    durch info@sportschuetzen-muhen.ch
-- 3. public.document_templates & document_template_clauses: Ersetzung von
--    sportschuetzen.muhen@gmail.com durch info@sportschuetzen-muhen.ch
-- 4. public.invoices: Nur bei unbezahlten Entwurfsrechnungen ohne Zahlungen
--    sender_address->>'email' auf info@sportschuetzen-muhen.ch umstellen
-- 5. public.log_auth_mail_event(): Audit-Log sender_email auf info@sportschuetzen-muhen.ch
-- ==============================================================================

BEGIN;

-- 1. rental_settings aktualisieren (calendar_id bewusst ausgenommen)
INSERT INTO public.rental_settings (setting_key, setting_value, description)
VALUES (
    'club_email',
    'info@sportschuetzen-muhen.ch',
    'Hauptkontakt / Absender-E-Mail-Adresse des Vereins'
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = 'info@sportschuetzen-muhen.ch',
    updated_at    = now();

UPDATE public.rental_settings
SET setting_value = REPLACE(setting_value, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    updated_at    = now()
WHERE setting_key IN ('rental_cc_emails', 'wirtschaft_email')
  AND setting_value ILIKE '%sportschuetzen.muhen@gmail.com%';

-- 2. system_mail_configs aktualisieren
UPDATE public.system_mail_configs
SET mailadresse = REPLACE(mailadresse, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    updated_at  = now()
WHERE mailadresse ILIKE '%sportschuetzen.muhen@gmail.com%';

-- 3. document_templates & document_template_clauses aktualisieren
UPDATE public.document_templates
SET intro        = REPLACE(intro, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    outro        = REPLACE(outro, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    notice       = REPLACE(notice, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    mail_subject = REPLACE(mail_subject, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    mail_body    = REPLACE(mail_body, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    updated_at   = now()
WHERE COALESCE(intro, '')        ILIKE '%sportschuetzen.muhen@gmail.com%'
   OR COALESCE(outro, '')        ILIKE '%sportschuetzen.muhen@gmail.com%'
   OR COALESCE(notice, '')       ILIKE '%sportschuetzen.muhen@gmail.com%'
   OR COALESCE(mail_subject, '') ILIKE '%sportschuetzen.muhen@gmail.com%'
   OR COALESCE(mail_body, '')    ILIKE '%sportschuetzen.muhen@gmail.com%';

UPDATE public.document_template_clauses
SET clause_title = REPLACE(clause_title, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    clause_text  = REPLACE(clause_text, 'sportschuetzen.muhen@gmail.com', 'info@sportschuetzen-muhen.ch'),
    updated_at   = now()
WHERE COALESCE(clause_title, '') ILIKE '%sportschuetzen.muhen@gmail.com%'
   OR COALESCE(clause_text, '')  ILIKE '%sportschuetzen.muhen@gmail.com%';

-- 4. Unbezahlte Entwurfsrechnungen (ohne Zahlungen, GoBD-konform) aktualisieren
UPDATE public.invoices i
SET sender_address = jsonb_set(i.sender_address, '{email}', '"info@sportschuetzen-muhen.ch"'::jsonb, true),
    updated_at     = now()
WHERE i.status != 'bezahlt'
  AND COALESCE(i.mail_status, 'entwurf') = 'entwurf'
  AND i.open_amount >= i.total_amount
  AND NOT EXISTS (
      SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = i.id
  )
  AND LOWER(COALESCE(i.sender_address->>'email', '')) = 'sportschuetzen.muhen@gmail.com';

-- 5. log_auth_mail_event(): sender_email auf info@sportschuetzen-muhen.ch aktualisieren
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
        'info@sportschuetzen-muhen.ch',
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

NOTIFY pgrst, 'reload schema';

COMMIT;

