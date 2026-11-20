-- ==============================================================================
-- 62_inventory_cleanup_and_retail_price.sql
-- Migration: Bereinigung der Inventardaten (Katalogpreise / retail_price nachführen)
--            und Sicherstellung konsistenter Preise vor Sponsoringabzug
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. BESTEHENDE DATENSÄTZE BEREINIGEN
-- ------------------------------------------------------------------------------
-- Bei allen Kleidungsstücken mit Sponsoringbeitrag, deren retail_price (Katalogpreis)
-- bisher NULL war, diesen aus purchase_price (Kaufpreis) oder selling_price + discount_amount befüllen.
UPDATE public.inventory_items
SET retail_price = COALESCE(retail_price, purchase_price, selling_price + discount_amount)
WHERE category = 'kleidung' 
  AND retail_price IS NULL 
  AND (discount_amount IS NOT NULL OR purchase_price IS NOT NULL);

-- 2. TRIGGER ZUR AUTOMATISCHEN ERMITTLUNG DES KATALOGPREISES
-- ------------------------------------------------------------------------------
-- Falls bei neuen Kleidungsstücken retail_price nicht explizit übergeben wird,
-- soll dieser automatisch aus purchase_price bzw. selling_price + discount_amount gesetzt werden.
CREATE OR REPLACE FUNCTION public.fn_inventory_auto_retail_price()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.category IN ('kleidung', 'schiessbekleidung') AND NEW.retail_price IS NULL THEN
        IF NEW.purchase_price IS NOT NULL THEN
            NEW.retail_price := NEW.purchase_price;
        ELSIF NEW.selling_price IS NOT NULL AND NEW.discount_amount IS NOT NULL THEN
            NEW.retail_price := NEW.selling_price + NEW.discount_amount;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_auto_retail_price ON public.inventory_items;

CREATE TRIGGER trg_inventory_auto_retail_price
BEFORE INSERT OR UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_inventory_auto_retail_price();

COMMENT ON FUNCTION public.fn_inventory_auto_retail_price IS 'Stellt sicher, dass retail_price (Katalogpreis vor Sponsoring) bei Bekleidung immer konsistent befüllt ist.';
