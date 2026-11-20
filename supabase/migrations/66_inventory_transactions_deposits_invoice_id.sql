-- 66_inventory_transactions_deposits_invoice_id.sql
-- Verbindliche Verknüpfung zwischen Inventar-Buchungen/Depots und Rechnungen (Zwei-Wege-Identifikation)

-- 1. Spalte invoice_id zu public.inventory_transactions hinzufügen
ALTER TABLE public.inventory_transactions
    ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(50) REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_trans_invoice_id ON public.inventory_transactions(invoice_id);

-- 2. Spalte invoice_id zu public.inventory_deposits hinzufügen
ALTER TABLE public.inventory_deposits
    ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(50) REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_deposits_invoice_id ON public.inventory_deposits(invoice_id);

-- 3. Bestehende Daten nach Möglichkeit verknüpfen (Heuristischer Backfill für Altdaten)
-- A: Materialverkäufe über invoice_positions source_field (item_id)
UPDATE public.inventory_transactions t
SET invoice_id = p.invoice_id
FROM public.invoice_positions p
JOIN public.invoices inv ON inv.id = p.invoice_id
WHERE t.invoice_id IS NULL
  AND t.action = 'VERKAUF'
  AND p.source_field = t.item_id
  AND inv.source_module = 'inventar'
  AND (inv.person_number = t.member_id::text OR inv.recipient_address->>'member_id' = t.member_id::text);

-- B: Pfand/Depot über invoice_positions source_field (item_id)
UPDATE public.inventory_deposits d
SET invoice_id = p.invoice_id
FROM public.invoice_positions p
JOIN public.invoices inv ON inv.id = p.invoice_id
WHERE d.invoice_id IS NULL
  AND p.source_field = d.item_id
  AND inv.type = 'Depot / Pfand'
  AND (inv.person_number = d.member_id::text OR inv.recipient_address->>'member_id' = d.member_id::text);
