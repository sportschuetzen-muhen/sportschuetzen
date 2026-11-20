-- =====================================================================
-- Migration: 43_rental_payment_due_days.sql
-- Beschreibung: Zahlungsfrist (Tage) konfigurierbar in rental_settings
--               und Konsistenz mit document_templates
-- =====================================================================

INSERT INTO public.rental_settings (setting_key, setting_value, description)
VALUES ('payment_due_days', '14', 'Zahlungsfrist in Tagen für Mietvertrag, Benützungsreglement und QR-Rechnung')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description;
