-- ==============================================================================
-- 74_restore_inventory_item_k27.sql
-- Wiederherstellung des versehentlich gelöschten Artikels K-27 (Team-Jacke 2XL)
-- ==============================================================================

INSERT INTO public.inventory_items (
    id, category, status, current_owner_id, depot_amount,
    purchase_price, selling_price, retail_price, discount_amount, base_price, finishing_price,
    purchase_date, manufacturer, model, item_type, size, sponsor_company, metadata,
    created_at, updated_at
) VALUES (
    'K-27', 'kleidung', 'Im Lager', NULL, 25.00,
    110.00, 86.00, 114.00, 28.00, 72.00, 38.00,
    '2026-07-01', 'Erima', (SELECT model FROM public.inventory_items WHERE id = 'K-26'), 'Team-Jacke', '2XL', 'C-Ma-Trading GmbH', '{}'::jsonb,
    now(), now()
) ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    current_owner_id = EXCLUDED.current_owner_id,
    depot_amount = EXCLUDED.depot_amount,
    purchase_price = EXCLUDED.purchase_price,
    selling_price = EXCLUDED.selling_price,
    retail_price = EXCLUDED.retail_price,
    discount_amount = EXCLUDED.discount_amount,
    base_price = EXCLUDED.base_price,
    finishing_price = EXCLUDED.finishing_price,
    purchase_date = EXCLUDED.purchase_date,
    manufacturer = EXCLUDED.manufacturer,
    model = EXCLUDED.model,
    item_type = EXCLUDED.item_type,
    size = EXCLUDED.size,
    sponsor_company = EXCLUDED.sponsor_company,
    updated_at = now();

INSERT INTO public.inventory_audit_log (
    timestamp, user_name, action, details
) VALUES (
    now(), 'System/Admin', 'restoreItem', 'Inventar_Kleidung: ID K-27 wiederhergestellt (Erima Team Jacke 2XL)'
);
