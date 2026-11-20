-- ==============================================================================
-- 25_admin_profiles_fk_and_validation.sql
-- Migration: Phase 25 – Härtung von save_admin_profile gegen FK-Constraint-Fehler
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_admin_profile(
    p_username TEXT,
    p_display_name TEXT,
    p_email TEXT,
    p_role_external TEXT DEFAULT NULL,
    p_person_number INTEGER DEFAULT NULL,
    p_roles TEXT[] DEFAULT ARRAY['vorstand']
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_auth_uid UUID;
    v_valid_pn INTEGER := NULL;
    r_role TEXT;
BEGIN
    -- Validierung: person_number nur verwenden, wenn sie tatsächlich in members existiert
    IF p_person_number IS NOT NULL AND p_person_number > 0 THEN
        IF EXISTS (SELECT 1 FROM public.members WHERE person_number = p_person_number) THEN
            v_valid_pn := p_person_number;
        ELSE
            -- Falls die Nummer nicht in members existiert (z.B. externer Admin oder Tippfehler),
            -- wird sie als NULL gespeichert (verhindert FK-Constraint-Absturz).
            v_valid_pn := NULL;
        END IF;
    END IF;

    INSERT INTO public.admin_profiles (
        username, display_name, email, role_external, person_number, updated_at
    ) VALUES (
        TRIM(p_username), TRIM(p_display_name), TRIM(p_email), TRIM(p_role_external), v_valid_pn, now()
    )
    ON CONFLICT (username) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        role_external = EXCLUDED.role_external,
        person_number = v_valid_pn,
        updated_at = now()
    RETURNING id, auth_user_id INTO v_admin_id, v_auth_uid;

    -- Automatische Verknüpfung mit auth.users herstellen, falls noch nicht verknüpft
    IF v_auth_uid IS NULL THEN
        SELECT id INTO v_auth_uid 
        FROM auth.users 
        WHERE LOWER(email) = LOWER(TRIM(p_email)) 
        LIMIT 1;

        IF v_auth_uid IS NOT NULL THEN
            UPDATE public.admin_profiles 
            SET auth_user_id = v_auth_uid 
            WHERE id = v_admin_id;
        END IF;
    END IF;

    -- Falls mit auth.users verknüpft: Rollen aktualisieren
    IF v_auth_uid IS NOT NULL AND p_roles IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_auth_uid;
        FOREACH r_role IN ARRAY p_roles LOOP
            BEGIN
                INSERT INTO public.user_roles (user_id, role)
                VALUES (v_auth_uid, TRIM(r_role)::public.app_role)
                ON CONFLICT (user_id, role) DO NOTHING;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'admin_id', v_admin_id,
        'auth_user_id', v_auth_uid,
        'person_number', v_valid_pn,
        'message', 'Admin-Profil erfolgreich gespeichert'
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
