-- ==============================================================================
-- 55_inventory_clothing_pricing_columns.sql
-- Migration: Erweiterung der Inventar-Preise um Sponsoring- und Kalkulationsspalten
--            sowie Ergänzung der Dropdown-Grössen und -Typen
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. TABELLE public.inventory_items ERWEITERN
-- ------------------------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10, 2),    -- Verkaufspreis an Mitglieder (z.B. 63.00)
  ADD COLUMN IF NOT EXISTS retail_price NUMERIC(10, 2),     -- Regulärer Brutto-Katalogpreis vor Sponsoring (z.B. 83.00)
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2),  -- Sponsoringbeitrag C-Ma Trading GmbH (z.B. 20.00)
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(10, 2),       -- Grundpreis Textil netto (z.B. 42.00)
  ADD COLUMN IF NOT EXISTS finishing_price NUMERIC(10, 2);  -- Veredelung & Fixkosten netto (z.B. 37.64)

COMMENT ON COLUMN public.inventory_items.selling_price IS 'Verkaufspreis / Abgabepreis an Mitglieder nach Sponsoring';
COMMENT ON COLUMN public.inventory_items.retail_price IS 'Regulärer Brutto-Katalogpreis vor Sponsoringabzug';
COMMENT ON COLUMN public.inventory_items.discount_amount IS 'Sponsoringbeitrag C-Ma Trading GmbH als Rabatt pro Stück';
COMMENT ON COLUMN public.inventory_items.base_price IS 'Netto-Grundpreis des Textil-Lieferanten';
COMMENT ON COLUMN public.inventory_items.finishing_price IS 'Netto-Veredelungs- und Bestickungskosten';

-- 2. DROPDOWN-KONFIGURATION IN public.inventory_config ERGÄNZEN
-- ------------------------------------------------------------------------------

-- Zusätzliche Grössen: 38 (Damen), 164 (Kinder), 2XL, 3XL
INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'Kleidung_Schiessbekleidung_Groesse', '38', 1
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'Kleidung_Schiessbekleidung_Groesse' AND value = '38'
);

INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'Kleidung_Schiessbekleidung_Groesse', '164', 2
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'Kleidung_Schiessbekleidung_Groesse' AND value = '164'
);

INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'Kleidung_Schiessbekleidung_Groesse', '2XL', 9
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'Kleidung_Schiessbekleidung_Groesse' AND value = '2XL'
);

INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'Kleidung_Schiessbekleidung_Groesse', '3XL', 10
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'Kleidung_Schiessbekleidung_Groesse' AND value = '3XL'
);

-- Zusätzliche Kleidungstypen: Trainerjacke, Team-Jacke
INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'Kleidung_Typ', 'Trainerjacke', 3
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'Kleidung_Typ' AND value = 'Trainerjacke'
);

INSERT INTO public.inventory_config (config_key, value, sort_order)
SELECT 'Kleidung_Typ', 'Team-Jacke', 4
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_config 
    WHERE config_key = 'Kleidung_Typ' AND value = 'Team-Jacke'
);
