-- ==============================================================================
-- 64_inventory_haben_konto_config.sql
-- Migration: Persistierung der Standard-Habenkonten für Inventar-Verkäufe & Depots
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. STANDARD-HABENKONTEN IN public.inventory_config INITIALISIEREN
-- ------------------------------------------------------------------------------
INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'inventar_haben_konto_verkauf', '8501', 1
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'inventar_haben_konto_verkauf'
);

INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'inventar_haben_konto_depot', '2030', 2
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'inventar_haben_konto_depot'
);

COMMENT ON TABLE public.inventory_config IS 'Systemkonfiguration und Dropdown-Werte für das Inventarmodul inkl. Haben-Konten';
