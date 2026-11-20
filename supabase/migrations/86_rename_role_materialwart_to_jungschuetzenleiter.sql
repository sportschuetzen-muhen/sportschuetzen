-- ==============================================================================
-- 86_rename_role_materialwart_to_jungschuetzenleiter.sql
-- Migration: Phase 86 – Umbenennung Rolle Materialwart -> Jungschützenleiter
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. Enum-Wert jungschuetzenleiter zu app_role hinzufügen (Owner: supabase_admin)
DO $$
BEGIN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'jungschuetzenleiter';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Berechtigungen in public.role_permissions von materialwart auf jungschuetzenleiter kopieren
INSERT INTO public.role_permissions (role, permission, description)
SELECT 'jungschuetzenleiter'::public.app_role, permission, description
FROM public.role_permissions
WHERE role = 'materialwart'::public.app_role
ON CONFLICT (role, permission) DO NOTHING;

-- 3. Zuweisungen in public.user_roles von materialwart auf jungschuetzenleiter umstellen
UPDATE public.user_roles
SET role = 'jungschuetzenleiter'::public.app_role
WHERE role = 'materialwart'::public.app_role;

-- 4. Freitext-Rollen in public.admin_profiles aktualisieren
UPDATE public.admin_profiles
SET role_external = REPLACE(role_external, 'Materialwart', 'Jungschützenleiter')
WHERE role_external ILIKE '%Materialwart%';
