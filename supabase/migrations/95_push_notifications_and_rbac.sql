-- ==============================================================================
-- 95_push_notifications_and_rbac.sql
-- Modul: Push-Mitteilungen (OneSignal Cockpit)
-- Tabellen: push_notifications, push_subscriptions
-- RBAC: push.view & push.manage nach Richtlinie 7
-- ==============================================================================

-- 1. Tabelle für gesendete Push-Mitteilungen
CREATE TABLE IF NOT EXISTS public.push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_group TEXT NOT NULL, -- 'alle', 'aktiv', 'passiv', 'vorstand', 'individual'
    target_person_number INTEGER REFERENCES public.members(person_number) ON DELETE SET NULL,
    target_url TEXT,
    sent_by_user TEXT NOT NULL,
    recipients_count INTEGER DEFAULT 0,
    onesignal_id TEXT,
    status TEXT DEFAULT 'sent', -- 'sent', 'simulated', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_created_at ON public.push_notifications(created_at DESC);

-- 2. Tabelle für Abonnenten-Tracking & Reichweite
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_number INTEGER NOT NULL REFERENCES public.members(person_number) ON DELETE CASCADE,
    device_type TEXT DEFAULT 'web', -- 'ios', 'android', 'desktop', 'web'
    permission_status TEXT DEFAULT 'granted', -- 'granted', 'denied', 'default'
    last_active_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT push_subscriptions_person_device_key UNIQUE (person_number, device_type)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_person ON public.push_subscriptions(person_number);

-- 3. Row Level Security aktivieren
ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies für public.push_notifications
DROP POLICY IF EXISTS "push_notifications_select" ON public.push_notifications;
CREATE POLICY "push_notifications_select" ON public.push_notifications
    FOR SELECT TO authenticated
    USING ((SELECT rbac_allows(ARRAY['push.view'::text, 'push.manage'::text])));

DROP POLICY IF EXISTS "push_notifications_insert" ON public.push_notifications;
CREATE POLICY "push_notifications_insert" ON public.push_notifications
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT rbac_allows(ARRAY['push.manage'::text])));

DROP POLICY IF EXISTS "push_notifications_delete" ON public.push_notifications;
CREATE POLICY "push_notifications_delete" ON public.push_notifications
    FOR DELETE TO authenticated
    USING ((SELECT rbac_allows(ARRAY['push.manage'::text])));

-- Policies für public.push_subscriptions
DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select" ON public.push_subscriptions
    FOR SELECT TO authenticated
    USING (true); -- Alle angemeldeten Benutzer / Modul können Abonnentenstatus aggregieren

DROP POLICY IF EXISTS "push_subscriptions_upsert" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_upsert" ON public.push_subscriptions
    FOR ALL TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- 4. Initialer Seed in public.role_permissions (Richtlinie 7)
INSERT INTO public.role_permissions (role, permission, description)
VALUES
    -- Admin
    ('admin', 'push.view', 'Push-Mitteilungen, Abonnenten & Reichweite einsehen'),
    ('admin', 'push.manage', 'Push-Mitteilungen verfassen, sofort versenden & API-Einstellungen verwalten'),
    -- Vorstand
    ('vorstand', 'push.view', 'Push-Mitteilungen, Abonnenten & Reichweite einsehen'),
    ('vorstand', 'push.manage', 'Push-Mitteilungen verfassen, sofort versenden & API-Einstellungen verwalten'),
    -- Schützenmeister
    ('schuetzenmeister', 'push.view', 'Push-Mitteilungen, Abonnenten & Reichweite einsehen'),
    ('schuetzenmeister', 'push.manage', 'Push-Mitteilungen verfassen, sofort versenden & API-Einstellungen verwalten'),
    -- Aktuar
    ('aktuar', 'push.view', 'Push-Mitteilungen, Abonnenten & Reichweite einsehen'),
    ('aktuar', 'push.manage', 'Push-Mitteilungen verfassen, sofort versenden & API-Einstellungen verwalten'),
    -- Kassier, Vermieter, Jungschützenleiter (Read-Only)
    ('kassier', 'push.view', 'Push-Mitteilungen, Abonnenten & Reichweite einsehen'),
    ('vermieter', 'push.view', 'Push-Mitteilungen, Abonnenten & Reichweite einsehen'),
    ('jungschuetzenleiter', 'push.view', 'Push-Mitteilungen, Abonnenten & Reichweite einsehen')
ON CONFLICT (role, permission) DO UPDATE
SET description = EXCLUDED.description;

-- 5. System-App-Configs für OneSignal vorbereiten
INSERT INTO public.system_app_configs (key, value, description, category)
VALUES
    ('onesignal_app_id', 'fe30b2b7-1dcb-43e9-8e39-b1870d1a6815', 'OneSignal App ID für Sportschützen Muhen Web-App & Portal', 'onesignal'),
    ('onesignal_rest_api_key', '', 'OneSignal REST API Key für serverseitigen Push-Versand', 'onesignal')
ON CONFLICT (key) DO NOTHING;

-- 6. RPC: Aggregation der Push-Reichweite für das Vorstandscockpit
CREATE OR REPLACE FUNCTION public.get_push_audience_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_members INTEGER := 0;
    v_active_members INTEGER := 0;
    v_passive_members INTEGER := 0;
    v_board_members INTEGER := 0;
    v_active_with_push INTEGER := 0;
    v_passive_with_push INTEGER := 0;
    v_board_with_push INTEGER := 0;
    v_total_with_push INTEGER := 0;
BEGIN
    -- Gesamtzahlen der Mitglieder
    SELECT COUNT(*) INTO v_active_members FROM public.members WHERE is_active = true AND is_passive = false AND deceased = false;
    SELECT COUNT(*) INTO v_passive_members FROM public.members WHERE is_active = true AND is_passive = true AND deceased = false;
    SELECT COUNT(DISTINCT person_number) INTO v_board_members FROM public.admin_profiles WHERE is_active = true AND person_number IS NOT NULL;
    v_total_members := v_active_members + v_passive_members;

    -- Abonnenten mit Push-Berechtigung
    SELECT COUNT(DISTINCT ps.person_number) INTO v_active_with_push
    FROM public.push_subscriptions ps
    JOIN public.members m ON m.person_number = ps.person_number
    WHERE ps.permission_status = 'granted' AND m.is_active = true AND m.is_passive = false AND m.deceased = false;

    SELECT COUNT(DISTINCT ps.person_number) INTO v_passive_with_push
    FROM public.push_subscriptions ps
    JOIN public.members m ON m.person_number = ps.person_number
    WHERE ps.permission_status = 'granted' AND m.is_active = true AND m.is_passive = true AND m.deceased = false;

    SELECT COUNT(DISTINCT ps.person_number) INTO v_board_with_push
    FROM public.push_subscriptions ps
    JOIN public.admin_profiles ap ON ap.person_number = ps.person_number
    WHERE ps.permission_status = 'granted' AND ap.is_active = true;

    SELECT COUNT(DISTINCT ps.person_number) INTO v_total_with_push
    FROM public.push_subscriptions ps
    WHERE ps.permission_status = 'granted';

    RETURN jsonb_build_object(
        'total_members', v_total_members,
        'active_members', v_active_members,
        'passive_members', v_passive_members,
        'board_members', v_board_members,
        'total_with_push', v_total_with_push,
        'active_with_push', v_active_with_push,
        'passive_with_push', v_passive_with_push,
        'board_with_push', v_board_with_push
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_push_audience_stats() TO authenticated, service_role;
