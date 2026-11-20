-- ==============================================================================
-- 13_mail_module.sql
-- Migration: Fachmodul MAIL-LOG (Phase 13)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Zweck:
--   Zentrales Protokoll aller versendeten E-Mails aus sämtlichen Modulen
--   (Rechnungen, Mietverträge, Veranstaltungs-Bestätigungen, Mahnungen, etc.).
--   Der tatsächliche Mailversand bleibt weiterhin bei Google Apps Script (GAS) /
--   MailApp / GmailApp. Diese Tabelle dient als "zweiter Reiter" – Audit-Trail
--   und Übersicht im Vorstand-Portal, ohne den bestehenden GAS-Prozess zu stören.
--
-- Tabellen:
--   1. public.mail_logs  – Versandprotokoll je E-Mail-Ereignis
--
-- Design-Entscheidungen:
--   - Kein FK-Constraint auf invoice_id / rental_id etc., da Logs auch für
--     Module entstehen, die noch nicht in Supabase migriert sind. Referenzen
--     werden als VARCHAR geführt (loose coupling).
--   - module_ref erlaubt die spätere Filterung je Herkunfts-Modul.
--   - GAS schreibt nach Versand einen Eintrag via REST-API (anon/authenticated).
-- ==============================================================================

-- 1. TABELLE: public.mail_logs (Versandprotokoll)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Herkunft & Kontext
    module_ref      VARCHAR(50)  NOT NULL DEFAULT 'unbekannt',
    -- Mögliche Werte: 'rechnung', 'mietvertrag', 'anlasse', 'jahresbeitrag',
    --                  'mahnung', 'vermietung', 'mitglieder', 'sonstige'

    record_id       VARCHAR(100),
    -- ID des zugehörigen Datensatzes (z.B. Rechnungs-ID 'RE-26-7K4M',
    -- Mietvertrags-Nr, Anlasse-ID usw.). Kein FK – loose coupling.

    -- Empfänger
    recipient_email VARCHAR(255) NOT NULL,          -- Primärer Empfänger (to:)
    recipient_name  VARCHAR(255),                   -- Anzeigename des Empfängers
    cc_email        VARCHAR(500),                   -- CC-Adressen (kommagetrennt)

    -- Inhalt (Snapshot zum Versandzeitpunkt)
    subject         VARCHAR(500) NOT NULL,          -- Betreffzeile
    body_snippet    TEXT,                           -- Ersten ~500 Zeichen des Body-Texts (für Vorschau)

    -- Versandstatus
    status          VARCHAR(30)  NOT NULL DEFAULT 'gesendet',
    -- 'gesendet', 'fehler', 'simuliert' (Dev-Modus ohne echten Versand)

    error_message   TEXT,                           -- Fehlermeldung bei status = 'fehler'

    -- Absender (GAS-Absender, nicht Supabase-Auth-User)
    sender_email    VARCHAR(255),                   -- z.B. sportschuetzen.muhen@gmail.com
    sender_name     VARCHAR(255),                   -- z.B. 'Kassier Vorname Nachname'

    -- Anhänge (optional, nur Metadaten)
    attachment_name VARCHAR(500),                   -- Dateiname(n), kommagetrennt (kein Upload)
    has_pdf         BOOLEAN      NOT NULL DEFAULT false,

    -- Herkunftssystem
    sent_via        VARCHAR(50)  NOT NULL DEFAULT 'GAS_MailApp',
    -- 'GAS_MailApp', 'GAS_GmailApp', 'Supabase_SMTP', 'Resend', 'Test'

    -- Audit
    created_by      VARCHAR(100) DEFAULT 'gas_script',
    -- GAS-Skriptname oder Supabase-Auth-User-ID (UUID oder 'gas_script')

    sent_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Indizes für häufige Abfragen im Vorstand-Portal
CREATE INDEX IF NOT EXISTS idx_mail_logs_module_ref  ON public.mail_logs(module_ref);
CREATE INDEX IF NOT EXISTS idx_mail_logs_record_id   ON public.mail_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_mail_logs_status      ON public.mail_logs(status);
CREATE INDEX IF NOT EXISTS idx_mail_logs_sent_at     ON public.mail_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_logs_recipient   ON public.mail_logs(recipient_email);

-- Kommentar für Datenbankdokumentation
COMMENT ON TABLE public.mail_logs IS
    'Zentrales Versandprotokoll für alle E-Mails aus allen Vereinsmodulen. '
    'GAS schreibt nach Versand per REST-API. Keine FK-Constraints (loose coupling).';

COMMENT ON COLUMN public.mail_logs.module_ref    IS 'Herkunfts-Modul: rechnung, mietvertrag, anlasse, jahresbeitrag, mahnung, sonstige';
COMMENT ON COLUMN public.mail_logs.record_id     IS 'ID des zugehörigen Datensatzes (Rechnungs-ID, Mietvertrag-Nr, etc.)';
COMMENT ON COLUMN public.mail_logs.body_snippet  IS 'Ersten max. 500 Zeichen des E-Mail-Bodys als Vorschau';
COMMENT ON COLUMN public.mail_logs.sent_via      IS 'Versandweg: GAS_MailApp, GAS_GmailApp, Supabase_SMTP, Resend, Test';

-- ==============================================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.mail_logs ENABLE ROW LEVEL SECURITY;

-- Leseberechtigung: Alle authentifizierten Benutzer dürfen Logs lesen
-- (Vorstand-Portal Übersicht, Maillog-Tab in Rechnungsdetails)
DROP POLICY IF EXISTS mail_logs_select_auth ON public.mail_logs;
CREATE POLICY mail_logs_select_auth ON public.mail_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Schreibberechtigung: Alle authentifizierten Benutzer dürfen Logs einfügen
-- (GAS schreibt via API-Key / anon oder eigenen Service-Account)
DROP POLICY IF EXISTS mail_logs_insert_auth ON public.mail_logs;
CREATE POLICY mail_logs_insert_auth ON public.mail_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Update / Delete nur für admin (Korrekturen / Bereinigung)
DROP POLICY IF EXISTS mail_logs_manage_auth ON public.mail_logs;
CREATE POLICY mail_logs_manage_auth ON public.mail_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Entwicklungs- / Parallelbetrieb-Policy (Dev-Anon für GAS ohne JWT)
DROP POLICY IF EXISTS mail_logs_dev_anon ON public.mail_logs;
CREATE POLICY mail_logs_dev_anon ON public.mail_logs
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 3. HILFSFUNKTION: GAS-kompatible INSERT-Funktion (optional nutzbar)
-- ==============================================================================
-- Kann per RPC aufgerufen werden:
--   supabase.rpc('log_mail_sent', { ... })
-- Alternativ: direktes INSERT auf die Tabelle via REST.
CREATE OR REPLACE FUNCTION public.log_mail_sent(
    p_module_ref      VARCHAR,
    p_record_id       VARCHAR,
    p_recipient_email VARCHAR,
    p_recipient_name  VARCHAR DEFAULT NULL,
    p_cc_email        VARCHAR DEFAULT NULL,
    p_subject         VARCHAR DEFAULT '',
    p_body_snippet    TEXT    DEFAULT NULL,
    p_status          VARCHAR DEFAULT 'gesendet',
    p_error_message   TEXT    DEFAULT NULL,
    p_sender_email    VARCHAR DEFAULT 'sportschuetzen.muhen@gmail.com',
    p_sender_name     VARCHAR DEFAULT NULL,
    p_attachment_name VARCHAR DEFAULT NULL,
    p_has_pdf         BOOLEAN DEFAULT false,
    p_sent_via        VARCHAR DEFAULT 'GAS_MailApp',
    p_created_by      VARCHAR DEFAULT 'gas_script'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.mail_logs (
        module_ref,
        record_id,
        recipient_email,
        recipient_name,
        cc_email,
        subject,
        body_snippet,
        status,
        error_message,
        sender_email,
        sender_name,
        attachment_name,
        has_pdf,
        sent_via,
        created_by
    ) VALUES (
        p_module_ref,
        p_record_id,
        p_recipient_email,
        p_recipient_name,
        p_cc_email,
        p_subject,
        p_body_snippet,
        p_status,
        p_error_message,
        p_sender_email,
        p_sender_name,
        p_attachment_name,
        p_has_pdf,
        p_sent_via,
        p_created_by
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_mail_sent IS
    'Hilfsfunktion für GAS: Logt einen E-Mail-Versand in mail_logs. '
    'Aufruf via supabase.rpc(''log_mail_sent'', {...}) oder direktes REST-INSERT.';

-- ==============================================================================
-- 4. BEISPIEL-DATEN (Entwicklungsmodus – verifiziert Schema & RLS)
-- ==============================================================================
INSERT INTO public.mail_logs (
    module_ref, record_id, recipient_email, recipient_name, cc_email,
    subject, body_snippet, status, sender_email, sender_name,
    has_pdf, sent_via, created_by, sent_at
) VALUES
    (
        'rechnung', 'RE-26-TEST1', 'mitglied.test@example.com',
        'Max Mustermann', 'sportschuetzen.muhen@gmail.com',
        'Rechnung RE-26-TEST1 – Jahresbeitrag 2026 | Sportschützen Muhen',
        'Guten Tag Max Mustermann, anbei senden wir Ihnen die Rechnung für Ihren Jahresbeitrag...',
        'gesendet', 'sportschuetzen.muhen@gmail.com', 'Kassier Martina Muster',
        true, 'GAS_MailApp', 'gas_script', now() - INTERVAL '2 days'
    ),
    (
        'mietvertrag', 'MV-26-TEST2', 'vermieter.test@example.com',
        'Erika Beispiel', 'sportschuetzen.muhen@gmail.com',
        'Mietvertrag Schützenhaus Muhen – 15.09.2026',
        'Guten Tag Erika Beispiel, anbei erhalten Sie Ihren Mietvertrag...',
        'gesendet', 'sportschuetzen.muhen@gmail.com', 'Vermieter Daniel Hunziker',
        true, 'GAS_MailApp', 'gas_script', now() - INTERVAL '5 days'
    ),
    (
        'mahnung', 'RE-26-TEST3', 'schuldner.test@example.com',
        'Peter Schuld', 'sportschuetzen.muhen@gmail.com',
        'Zahlungserinnerung Rechnung RE-26-TEST3 | Sportschützen Muhen',
        'Guten Tag Peter Schuld, für untenstehende Rechnung konnten wir noch keinen Zahlungseingang feststellen...',
        'gesendet', 'sportschuetzen.muhen@gmail.com', 'Kassier Martina Muster',
        true, 'GAS_MailApp', 'gas_script', now() - INTERVAL '1 day'
    )
ON CONFLICT DO NOTHING;
