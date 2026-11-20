-- ==============================================================================
-- 67_inventory_rifle_stock_column.sql
-- Migration: Inventar – Spalte 'stock' (Schaft) für Sportgewehre
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS stock VARCHAR(100);

COMMENT ON COLUMN public.inventory_items.stock IS 'Schaft-Ausführung bei Gewehren (z.B. Holzschaft und Bügel, Aluschaft, Standard, etc.)';
