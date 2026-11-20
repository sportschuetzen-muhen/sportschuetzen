-- ==============================================================================
-- 65_inventory_trainerjacke_retail_price.sql
-- Migration: Korrektur des Katalogpreises (retail_price) für Trainer-Jacken
--            Sicherstellung der mathematischen Konsistenz:
--            Verkaufspreis gerundet (83.00) - Sponsoring Beitrag (19.00) = Endpreis für Mitglied (64.00)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

UPDATE public.inventory_items
SET retail_price = 83.00
WHERE category = 'kleidung'
  AND (item_type = 'Trainer-Jacke' OR item_type = 'Trainerjacke')
  AND selling_price = 64.00
  AND discount_amount = 19.00;
