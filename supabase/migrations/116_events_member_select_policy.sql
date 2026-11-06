-- 116_events_member_select_policy.sql
-- Ermöglicht authentifizierten Vereinsmitgliedern das Einsehen aktiver Vereinsanlässe für den Schicht- & Helferplaner

-- 1. Tabelle events: Policy für authentifizierte Vereinsmitglieder
DROP POLICY IF EXISTS events_member_select ON public.events;

CREATE POLICY events_member_select ON public.events
    FOR SELECT TO authenticated
    USING (
        -- Vorstand / Admin mit Berechtigung
        (SELECT public.rbac_allows(ARRAY['anlaesse.view', 'anlaesse.manage']))
        OR
        -- Oder aktiver/geplanter Vereinsanlass (keine Vorlagen)
        (is_template = false AND status IN ('planned', 'in_progress', 'completed'))
    );
