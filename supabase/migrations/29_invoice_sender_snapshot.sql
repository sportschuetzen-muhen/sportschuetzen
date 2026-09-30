-- ==============================================================================
-- 29_invoice_sender_snapshot.sql
-- Migration: ABSENDER-SNAPSHOT IN RECHNUNGEN (Revisionssicheres Absender-Handling)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Inhalte:
-- 1. Erweiterung public.invoices:
--    - sender_address: JSONB Snapshot der vollständigen Absenderdaten
--      (vorname, nachname, verein, funktion, bereich, strasse, plz, ort, email, mobil)
-- 2. Datenabgleich: Bestehende Rechnungen erhalten einen soliden Standard-Snapshot
-- ==============================================================================

-- 1. Spalte sender_address hinzufügen
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS sender_address JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.invoices.sender_address IS 'Revisionssicherer JSONB-Snapshot des Absenders (Verein, Name, Funktion, Bereich, Adresse, Kontakt)';

-- 2. Bestehende Rechnungen mit Default-Absender befüllen, falls leer
UPDATE public.invoices
SET sender_address = jsonb_build_object(
    'verein', 'Sportschützen Muhen',
    'vorname', '',
    'nachname', '',
    'funktion', CASE 
        WHEN type ILIKE '%Vermietung%' THEN 'Vermieter'
        WHEN type ILIKE '%Jahresbeitrag%' THEN 'Kassier'
        WHEN type ILIKE '%Material%' THEN 'Materialwart'
        ELSE 'Vorstand'
    END,
    'bereich', COALESCE(type, 'Rechnung'),
    'strasse', '',
    'plz', '5037',
    'ort', 'Muhen',
    'email', 'sportschuetzen.muhen@gmail.com',
    'mobil', ''
)
WHERE sender_address = '{}'::jsonb OR sender_address IS NULL;
