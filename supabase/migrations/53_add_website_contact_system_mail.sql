-- ==============================================================================
-- 53_add_website_contact_system_mail.sql
-- Migration: Website Kontaktformular & System-Mail-Konfiguration
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Zweck:
--   1. Speichert Kontaktformular-Anfragen der öffentlichen Website in Supabase
--      (public.website_contact_messages) als Single Source of Truth.
--   2. Registriert den System-Mail-Schlüssel 'Info_Mail_Kontakt_Website' in
--      public.system_mail_configs, sodass Empfänger dynamisch über das
--      Vorstandsportal gepflegt werden können.
-- ==============================================================================

-- 1. Tabelle für Website-Kontaktanfragen
CREATE TABLE IF NOT EXISTS public.website_contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'neu', -- 'neu', 'in_bearbeitung', 'erledigt', 'archiviert'
    ip_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_website_contact_status ON public.website_contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_website_contact_created ON public.website_contact_messages(created_at DESC);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION public.update_website_contact_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_website_contact_updated_at ON public.website_contact_messages;
CREATE TRIGGER trg_website_contact_updated_at
    BEFORE UPDATE ON public.website_contact_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_website_contact_timestamp();

-- RLS aktivieren
ALTER TABLE public.website_contact_messages ENABLE ROW LEVEL SECURITY;

-- Anon darf neue Kontaktanfragen einfügen
DROP POLICY IF EXISTS website_contact_anon_insert ON public.website_contact_messages;
CREATE POLICY website_contact_anon_insert ON public.website_contact_messages
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Authenticated (Vorstand/Admin) darf alle Anfragen einsehen und bearbeiten
DROP POLICY IF EXISTS website_contact_auth_select ON public.website_contact_messages;
CREATE POLICY website_contact_auth_select ON public.website_contact_messages
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS website_contact_auth_manage ON public.website_contact_messages;
CREATE POLICY website_contact_auth_manage ON public.website_contact_messages
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Berechtigungen für API-Rollen vergeben
GRANT ALL ON public.website_contact_messages TO anon, authenticated;

-- PostgREST Schema-Cache aktualisieren
NOTIFY pgrst, 'reload schema';

-- 2. System-Mail-Schlüssel für Website-Kontaktformular registrieren
INSERT INTO public.system_mail_configs
    (schluessel, bezeichnung, modul, beschreibung, sort_order, mailadresse)
VALUES
    (
        'Info_Mail_Kontakt_Website',
        'Info-Mail: Website Kontaktformular',
        'website',
        'Empfänger bei neuen Anfragen über das Kontaktformular der Vereins-Website',
        10,
        'dan.hunziker@hotmail.ch; sportschuetzen.muhen@gmail.com'
    )
ON CONFLICT (schluessel) DO UPDATE
SET bezeichnung = EXCLUDED.bezeichnung,
    modul = EXCLUDED.modul,
    beschreibung = EXCLUDED.beschreibung;
