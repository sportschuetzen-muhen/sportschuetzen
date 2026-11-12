-- 124_event_items_depot_and_festkasse_sync.sql
-- Migration: Depot-Unterstützung für Anlässe & Verknüpfung mit Festkassen-Sortiment

-- 1. Spalte depot_amount zu public.event_items hinzufügen
ALTER TABLE public.event_items 
ADD COLUMN IF NOT EXISTS depot_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 2. Systemkonfiguration für den aktuell aktiven Festkassen-Anlass
INSERT INTO public.system_app_configs (key, value, description, category)
VALUES (
    'active_festkasse_event_id',
    '63620ca8-f28d-41cc-b740-a5166a48b659',
    'Aktuell aktiver Anlass für die Festkassen-PWA und fliegende Kellner-iPhones (steuert Sortiment, Preise und Depot)',
    'festkasse'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Depot-Artikel für Beispiel-Event 1.-August-Feier 2026 anlegen (falls noch nicht vorhanden)
INSERT INTO public.event_items (
    event_id, category, item_name, unit, cost_price, sales_price, 
    qty_per_visitor, safety_factor, recommended_qty, order_qty, actual_qty, sold_qty, depot_amount
)
SELECT 
    '63620ca8-f28d-41cc-b740-a5166a48b659',
    'Depot',
    'Depot Becher / Glas',
    'Stk',
    0.00,
    2.00,
    1.0,
    1.0,
    500.0,
    500.0,
    500.0,
    0.0,
    0.00
WHERE NOT EXISTS (
    SELECT 1 FROM public.event_items 
    WHERE event_id = '63620ca8-f28d-41cc-b740-a5166a48b659' 
      AND item_name = 'Depot Becher / Glas'
);

INSERT INTO public.event_items (
    event_id, category, item_name, unit, cost_price, sales_price, 
    qty_per_visitor, safety_factor, recommended_qty, order_qty, actual_qty, sold_qty, depot_amount
)
SELECT 
    '63620ca8-f28d-41cc-b740-a5166a48b659',
    'Depot',
    'Depot Geschirr / Teller',
    'Stk',
    0.00,
    5.00,
    0.5,
    1.0,
    200.0,
    200.0,
    200.0,
    0.0,
    0.00
WHERE NOT EXISTS (
    SELECT 1 FROM public.event_items 
    WHERE event_id = '63620ca8-f28d-41cc-b740-a5166a48b659' 
      AND item_name = 'Depot Geschirr / Teller'
);

-- 4. Bier mit automatischem Glasdepot (CHF 2.00) versehen
UPDATE public.event_items
SET depot_amount = 2.00
WHERE event_id = '63620ca8-f28d-41cc-b740-a5166a48b659'
  AND item_name ILIKE '%bier%'
  AND depot_amount = 0.00;

-- 5. RLS-Policies: Erlaube Festkassen-PWA (anon & authenticated) das Auslesen des aktiven Anlasses & Sortiments
DROP POLICY IF EXISTS events_festkasse_anon_select ON public.events;
CREATE POLICY events_festkasse_anon_select ON public.events
    FOR SELECT TO anon, authenticated
    USING (
        id IN (SELECT value::uuid FROM public.system_app_configs WHERE key = 'active_festkasse_event_id')
        OR is_public = true
    );

DROP POLICY IF EXISTS event_items_festkasse_anon_select ON public.event_items;
CREATE POLICY event_items_festkasse_anon_select ON public.event_items
    FOR SELECT TO anon, authenticated
    USING (
        event_id IN (SELECT value::uuid FROM public.system_app_configs WHERE key = 'active_festkasse_event_id')
    );

