-- ==============================================================================
-- 87_harmonize_user_roles_rls_policy.sql
-- Migration: Phase 87 – Harmonisierung der RLS-Policies auf public.user_roles
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. Bestehende Lese-Policy droppen und gemäss RBAC View/Manage-Standard neu definieren
DROP POLICY IF EXISTS user_roles_read_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_read_policy ON public.user_roles;

CREATE POLICY user_roles_read_policy ON public.user_roles
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.rbac_allows(ARRAY['logins.view', 'logins.manage'])
        OR auth.has_role('admin'::app_role)
        OR auth.has_role('vorstand'::app_role)
    );

-- 2. Schreib-Policy auf public.user_roles für logins.manage und admin harmonisieren
DROP POLICY IF EXISTS user_roles_admin_write ON public.user_roles;
DROP POLICY IF EXISTS user_roles_write_policy ON public.user_roles;

CREATE POLICY user_roles_write_policy ON public.user_roles
    FOR ALL TO authenticated
    USING (
        public.rbac_allows(ARRAY['logins.manage'])
        OR auth.has_role('admin'::app_role)
    )
    WITH CHECK (
        public.rbac_allows(ARRAY['logins.manage'])
        OR auth.has_role('admin'::app_role)
    );
