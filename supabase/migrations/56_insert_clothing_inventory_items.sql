-- ==============================================================================
-- 56_insert_clothing_inventory_items.sql
-- Migration: Import der 49 Vereinsbekleidungs-Artikel (K-1 bis K-49)
--            inkl. Sponsoring-Kalkulation (C-Ma Trading GmbH), aufgerundet
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

INSERT INTO public.inventory_items (
    id, category, status, current_owner_id, depot_amount,
    purchase_price, selling_price, retail_price, discount_amount, base_price, finishing_price,
    purchase_date, manufacturer, model, item_type, size, created_at, updated_at
) VALUES
-- 1. Erima Celebrate 125 Trainerjacke (21 Stück, K-1 bis K-21)
('K-1',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'XS', now(), now()),
('K-2',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'XS', now(), now()),
('K-3',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'S',  now(), now()),
('K-4',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'S',  now(), now()),
('K-5',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'S',  now(), now()),
('K-6',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'S',  now(), now()),
('K-7',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'S',  now(), now()),
('K-8',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'M',  now(), now()),
('K-9',  'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'M',  now(), now()),
('K-10', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'M',  now(), now()),
('K-11', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'L',  now(), now()),
('K-12', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'L',  now(), now()),
('K-13', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'L',  now(), now()),
('K-14', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'L',  now(), now()),
('K-15', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'XL', now(), now()),
('K-16', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', 'XL', now(), now()),
('K-17', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', '2XL', now(), now()),
('K-18', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', '2XL', now(), now()),
('K-19', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', '2XL', now(), now()),
('K-20', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', '2XL', now(), now()),
('K-21', 'kleidung', 'Im Lager', NULL, 0.00, 80.00, 63.00, 83.00, 20.00, 42.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Trainerjacke', '3XL', now(), now()),

-- 2. Erima Softshelljacke Function (3 Stück, K-22 bis K-24)
('K-22', 'kleidung', 'Im Lager', NULL, 0.00, 122.00, 96.00, 127.00, 31.00, 84.00, 37.64, '2026-09-01', 'Erima', 'Erima Function', 'Softshell-Jacke', '38', now(), now()),
('K-23', 'kleidung', 'Im Lager', NULL, 0.00, 122.00, 96.00, 127.00, 31.00, 84.00, 37.64, '2026-09-01', 'Erima', 'Erima Function', 'Softshell-Jacke', 'S',  now(), now()),
('K-24', 'kleidung', 'Im Lager', NULL, 0.00, 122.00, 96.00, 127.00, 31.00, 84.00, 37.64, '2026-09-01', 'Erima', 'Erima Function', 'Softshell-Jacke', 'L',  now(), now()),

-- 3. Erima Team Jacke m. abnehmb. Ärmeln (3 Stück, K-25 bis K-27)
('K-25', 'kleidung', 'Im Lager', NULL, 0.00, 110.00, 87.00, 114.00, 27.00, 72.00, 37.64, '2026-09-01', 'Erima', 'Erima Team Jacke m. abnehmb. Ärmeln', 'Team-Jacke', 'S',   now(), now()),
('K-26', 'kleidung', 'Im Lager', NULL, 0.00, 110.00, 87.00, 114.00, 27.00, 72.00, 37.64, '2026-09-01', 'Erima', 'Erima Team Jacke m. abnehmb. Ärmeln', 'Team-Jacke', 'M',   now(), now()),
('K-27', 'kleidung', 'Im Lager', NULL, 0.00, 110.00, 87.00, 114.00, 27.00, 72.00, 37.64, '2026-09-01', 'Erima', 'Erima Team Jacke m. abnehmb. Ärmeln', 'Team-Jacke', '2XL', now(), now()),

-- 4. Erima Celebrate 125 Poloshirt (2 Stück, K-28 bis K-29)
('K-28', 'kleidung', 'Im Lager', NULL, 0.00, 69.00, 55.00, 72.00, 17.00, 31.20, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Poloshirt', '2XL', now(), now()),
('K-29', 'kleidung', 'Im Lager', NULL, 0.00, 69.00, 55.00, 72.00, 17.00, 31.20, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'Poloshirt', '2XL', now(), now()),

-- 5. Erima Celebrate 125 T-Shirt Erwachsene (16 Stück, K-30 bis K-45)
('K-30', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'S',   now(), now()),
('K-31', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'S',   now(), now()),
('K-32', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'S',   now(), now()),
('K-33', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'S',   now(), now()),
('K-34', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'M',   now(), now()),
('K-35', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'M',   now(), now()),
('K-36', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'M',   now(), now()),
('K-37', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'L',   now(), now()),
('K-38', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'L',   now(), now()),
('K-39', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'L',   now(), now()),
('K-40', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'XL',  now(), now()),
('K-41', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', 'XL',  now(), now()),
('K-42', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '2XL', now(), now()),
('K-43', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '2XL', now(), now()),
('K-44', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '2XL', now(), now()),
('K-45', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '2XL', now(), now()),

-- 6. Erima Celebrate 125 T-Shirt Kinder (3 Stück, K-46 bis K-48)
('K-46', 'kleidung', 'Im Lager', NULL, 0.00, 62.00, 49.00, 65.00, 16.00, 24.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '164', now(), now()),
('K-47', 'kleidung', 'Im Lager', NULL, 0.00, 62.00, 49.00, 65.00, 16.00, 24.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '164', now(), now()),
('K-48', 'kleidung', 'Im Lager', NULL, 0.00, 62.00, 49.00, 65.00, 16.00, 24.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '164', now(), now()),

-- 7. Erima Celebrate 125 T-Shirt Damen (1 Stück, K-49)
('K-49', 'kleidung', 'Im Lager', NULL, 0.00, 65.00, 51.00, 68.00, 17.00, 27.00, 37.64, '2026-09-01', 'Erima', 'Erima Celebrate 125', 'T-Shirt', '38',  now(), now())

ON CONFLICT (id) DO UPDATE SET
    category = EXCLUDED.category,
    status = EXCLUDED.status,
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
    updated_at = now();

-- Audit-Log Eintrag
INSERT INTO public.inventory_audit_log (timestamp, user_name, action, details)
VALUES (now(), 'System', 'importClothing', 'Import von 49 Vereinsbekleidungs-Artikeln (K-1 bis K-49) mit Sponsoring-Kalkulation C-Ma Trading GmbH');
