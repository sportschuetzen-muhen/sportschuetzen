-- ==============================================================================
-- 57_set_clothing_depot_amount.sql
-- Migration: Standard-Depotbetrag CHF 25.00 für alle Bekleidungsartikel
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

UPDATE public.inventory_items
SET depot_amount = 25.00,
    updated_at = now()
WHERE category = 'kleidung';
