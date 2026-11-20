-- ==============================================================================
-- 20_mail_engine_integration.sql
-- Migration: Phase 20 – Zentrale Mail-Engine Integration
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Zweck:
--   1. Erweiterung von public.mail_logs um Metadaten (JSONB) und Empfängeranzahl
--   2. Tabelle public.mail_queue für zuverlässigen, asynchronen Mailversand mit Retry
--   3. RPC-Funktionen zur System-Mail-Auflösung und Queue-Steuerung
--   4. RLS-Policies und Berechtigungen für Edge Functions und Vorstand-Portal
-- ==============================================================================

-- 1. ERWEITERUNG: public.mail_logs
-- ------------------------------------------------------------------------------
ALTER TABLE public.mail_logs
    ADD COLUMN IF NOT EXISTS recipient_count INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS recipients_summary TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. TABELLE: public.mail_queue (Asynchrone Versand-Queue & Retry-Puffer)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_ref      VARCHAR(50) NOT NULL DEFAULT 'allgemein',
    record_id       VARCHAR(100),
    sender_name     VARCHAR(255),
    sender_email    VARCHAR(255),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name  VARCHAR(255),
    cc_email        VARCHAR(500),
    bcc_email       VARCHAR(500),
    subject         VARCHAR(500) NOT NULL,
    body_text       TEXT,
    body_html       TEXT NOT NULL,
    attachments     JSONB DEFAULT '[]'::jsonb, -- Array von { filename, content_base64, content_type, storage_path }
    status          VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed'
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 3,
    last_error      TEXT,
    scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_queue_status_sched ON public.mail_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_mail_queue_record_id    ON public.mail_queue(record_id);

COMMENT ON TABLE public.mail_queue IS
    'Zentrale Versand-Queue für ausgehende E-Mails via Edge Function / SMTP (Gmail/Infomaniak).';

-- 3. HILFSFUNKTION: System-Mail-Empfänger als Array abrufen
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_system_mail_array(p_schluessel VARCHAR)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_raw TEXT;
    v_parts TEXT[];
    v_clean TEXT[];
    v_item TEXT;
BEGIN
    SELECT mailadresse INTO v_raw
    FROM public.system_mail_configs
    WHERE schluessel = p_schluessel
    LIMIT 1;

    IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
        RETURN ARRAY[]::TEXT[];
    END IF;

    -- Ersetze Kommas durch Semikolons und zerlege
    v_parts := string_to_array(replace(v_raw, ',', ';'), ';');
    v_clean := ARRAY[]::TEXT[];

    FOREACH v_item IN ARRAY v_parts
    LOOP
        v_item := TRIM(v_item);
        IF v_item <> '' AND v_item LIKE '%@%' THEN
            v_clean := array_append(v_clean, v_item);
        END IF;
    END LOOP;

    RETURN v_clean;
END;
$$;

COMMENT ON FUNCTION public.get_system_mail_array IS
    'Gibt die bereinigten Empfänger-Mailadressen für einen System-Schlüssel als Array zurück.';

-- 4. HILFSFUNKTION: Mail in die Queue einreihen
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_mail(
    p_module_ref      VARCHAR,
    p_recipient_email VARCHAR,
    p_subject         VARCHAR,
    p_body_html       TEXT,
    p_record_id       VARCHAR DEFAULT NULL,
    p_recipient_name  VARCHAR DEFAULT NULL,
    p_cc_email        VARCHAR DEFAULT NULL,
    p_bcc_email       VARCHAR DEFAULT NULL,
    p_body_text       TEXT    DEFAULT NULL,
    p_sender_name     VARCHAR DEFAULT 'Sportschützen Muhen',
    p_sender_email    VARCHAR DEFAULT NULL,
    p_attachments     JSONB   DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_queue_id UUID;
BEGIN
    INSERT INTO public.mail_queue (
        module_ref,
        record_id,
        recipient_email,
        recipient_name,
        cc_email,
        bcc_email,
        subject,
        body_text,
        body_html,
        sender_name,
        sender_email,
        attachments
    ) VALUES (
        p_module_ref,
        p_record_id,
        p_recipient_email,
        p_recipient_name,
        p_cc_email,
        p_bcc_email,
        p_subject,
        p_body_text,
        p_body_html,
        p_sender_name,
        p_sender_email,
        p_attachments
    )
    RETURNING id INTO v_queue_id;

    RETURN v_queue_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_mail IS
    'Fügt eine E-Mail zur asynchronen Versendung in die Queue ein.';

-- 5. RLS & RECHTE
-- ------------------------------------------------------------------------------
ALTER TABLE public.mail_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_queue_all_authenticated ON public.mail_queue;
CREATE POLICY mail_queue_all_authenticated ON public.mail_queue
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS mail_queue_dev_anon ON public.mail_queue;
CREATE POLICY mail_queue_dev_anon ON public.mail_queue
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_queue TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_system_mail_array(VARCHAR) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_mail(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB) TO authenticated, anon;
