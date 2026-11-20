-- ==============================================================================
-- 03_anon_dev_policies.sql
-- Übergangs- und Entwicklungs-Policies für anon-Zugriff auf Fachmodul ANLÄSSE
-- Ermöglicht die nahtlose Nutzung des Moduls im Vorstand-Portal mit ANON_KEY
-- ==============================================================================

DROP POLICY IF EXISTS events_anon_manage ON public.events;
CREATE POLICY events_anon_manage ON public.events FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS event_items_anon_manage ON public.event_items;
CREATE POLICY event_items_anon_manage ON public.event_items FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS event_orders_anon_manage ON public.event_orders;
CREATE POLICY event_orders_anon_manage ON public.event_orders FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS event_checklists_anon_manage ON public.event_checklists;
CREATE POLICY event_checklists_anon_manage ON public.event_checklists FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS event_shifts_anon_manage ON public.event_shifts;
CREATE POLICY event_shifts_anon_manage ON public.event_shifts FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS event_shift_assignments_anon_manage ON public.event_shift_assignments;
CREATE POLICY event_shift_assignments_anon_manage ON public.event_shift_assignments FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.create_event_from_template TO anon, authenticated;
