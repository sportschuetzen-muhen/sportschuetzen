-- ==============================================================================
-- 112_fix_inventory_haben_konto_config.sql
-- Migration: Bereinigung & Trennung der Standard-Habenkonten für Inventar
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. Bestehende Einträge für inventar_haben_konto_* bereinigen (Duplikate entfernen)
DELETE FROM public.inventory_config
WHERE config_key IN ('inventar_haben_konto_depot', 'inventar_haben_konto_verkauf');

-- 2. Kautionskonto für Depots zwingend auf Passivkonto 2030 (Kautionen und Depots) setzen
INSERT INTO public.inventory_config (config_key, value, sort_order)
VALUES ('inventar_haben_konto_depot', '2030', 2);

-- 3. Ertragskonto für Materialverkauf auf Ertragskonto 8121 (Kleiderverkauf) setzen
INSERT INTO public.inventory_config (config_key, value, sort_order)
VALUES ('inventar_haben_konto_verkauf', '8121', 1);

COMMENT ON TABLE public.inventory_config IS 'Systemkonfiguration und Dropdown-Werte für das Inventarmodul inkl. getrennter Haben-Konten (Verkauf=Ertrag 8121, Depot=Passiven 2030)';
