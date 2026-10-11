-- ==============================================================================
-- 58_inventory_key_config.sql
-- Migration: Dropdown-Werteliste für Schlüssel-Bezeichnungen
-- Werte: allgemein, Wirtschaftsraum, Tresor 1, Tresor 2, Tresor 3
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- Bestehende Schlüssel-Einträge in inventory_config bereinigen
DELETE FROM public.inventory_config 
WHERE config_key = 'Schluessel_Bezeichnung';

-- Standard-Schlüsselbezeichnungen gemäss Vorstand-Vorgabe anlegen
INSERT INTO public.inventory_config (config_key, value, sort_order)
VALUES
    ('Schluessel_Bezeichnung', 'allgemein', 1),
    ('Schluessel_Bezeichnung', 'Wirtschaftsraum', 2),
    ('Schluessel_Bezeichnung', 'Tresor 1', 3),
    ('Schluessel_Bezeichnung', 'Tresor 2', 4),
    ('Schluessel_Bezeichnung', 'Tresor 3', 5);
