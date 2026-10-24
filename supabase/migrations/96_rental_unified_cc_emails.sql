-- ==============================================================================
-- Migration 96: Zentraler E-Mail-Verteiler & Notfall-Quelle für Vermietung
-- ==============================================================================

-- 1. Neues Setting 'rental_cc_emails' in rental_settings hinterlegen
INSERT INTO public.rental_settings (setting_key, setting_value, description)
VALUES (
    'rental_cc_emails',
    'sportschuetzen.muhen@gmail.com',
    'Zentraler E-Mail-Verteiler für alle Vermietungs-Mails (Kopien an Verein & Team, kommagetrennt)'
)
ON CONFLICT (setting_key) DO UPDATE
SET description = EXCLUDED.description;

-- 2. Spalte 'source' in rental_requests hinzufügen (Standard: 'supabase', Fallback: 'google_fallback')
ALTER TABLE public.rental_requests 
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'supabase';

-- 3. RLS-Prüfung: Anon darf rental_settings für rental_cc_emails lesen
-- (Bereits durch rental_settings_public_read abgedeckt, hier zur Absicherung)
GRANT SELECT ON public.rental_settings TO anon, authenticated;
