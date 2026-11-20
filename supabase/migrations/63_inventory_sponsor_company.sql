-- ==============================================================================
-- 63_inventory_sponsor_company.sql
-- Migration: Variable Sponsoring-Firma im Inventar
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. SPALTE sponsor_company HINZUFÜGEN
-- ------------------------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS sponsor_company VARCHAR(150);

COMMENT ON COLUMN public.inventory_items.sponsor_company IS 'Name der Sponsoring-Firma (z.B. C-Ma Trading GmbH)';

-- 2. BESTEHENDE DATENSÄTZE MIT SPONSORING-ABZUG VORBELEGEN (ABWÄRTSKOMPATIBILITÄT)
-- ------------------------------------------------------------------------------
UPDATE public.inventory_items
SET sponsor_company = 'C-Ma Trading GmbH'
WHERE discount_amount IS NOT NULL 
  AND discount_amount > 0 
  AND (sponsor_company IS NULL OR sponsor_company = '');
