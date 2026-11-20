-- ==============================================================================
-- 60_rbac_logins_module.sql
-- Migration: Integration des Moduls "Logins & Rollen" in die RBAC-Matrix
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Konzept:
-- 1. logins.view:   Lesen / Kachel & Sidebar-Navigation freigeschaltet (Read-Only)
-- 2. logins.manage: Verwalten (Admins mutieren, Passwörter provisionieren, PINs & Matrix steuern)
-- ==============================================================================

-- 1. RPC: toggle_role_permission für logins.manage und admin freigeben
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_role_permission(
    p_role public.app_role,
    p_permission TEXT,
    p_enable BOOLEAN,
    p_description TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- Nur System-Administratoren oder Benutzer mit logins.manage dürfen Rollenberechtigungen anpassen
    IF NOT (auth.has_role('admin') OR auth.role() = 'service_role') THEN
        IF auth.uid() IS NOT NULL AND NOT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur 
                WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
            )
            OR public.rbac_allows(ARRAY['logins.manage'])
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Keine Berechtigung zur Änderung der Rollenmatrix (erfordert Administrator oder logins.manage).');
        END IF;
    END IF;

    IF p_enable THEN
        INSERT INTO public.role_permissions (role, permission, description)
        VALUES (p_role, TRIM(p_permission), p_description)
        ON CONFLICT (role, permission) DO UPDATE
        SET description = COALESCE(EXCLUDED.description, role_permissions.description);
    ELSE
        DELETE FROM public.role_permissions
        WHERE role = p_role AND permission = TRIM(p_permission);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'role', p_role,
        'permission', p_permission,
        'enabled', p_enable
    );
END;
$$;

-- Schema-Cache von PostgREST sofort aktualisieren
NOTIFY pgrst, 'reload schema';
