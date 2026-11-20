-- ==============================================================================
-- 27_fix_save_admin_profile_pgcrypto.sql
-- Migration: Phase 27 – Behebung gen_salt Search Path in save_admin_profile
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_admin_profile(
    p_username TEXT,
    p_display_name TEXT,
    p_email TEXT,
    p_role_external TEXT DEFAULT NULL,
    p_person_number INTEGER DEFAULT NULL,
    p_roles TEXT[] DEFAULT ARRAY['vorstand'],
    p_password TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_auth_uid UUID;
    v_valid_pn INTEGER := NULL;
    r_role TEXT;
    clean_email TEXT;
BEGIN
    clean_email := LOWER(TRIM(p_email));

    -- Validierung: person_number nur verwenden, wenn sie tatsächlich in members existiert
    IF p_person_number IS NOT NULL AND p_person_number > 0 THEN
        IF EXISTS (SELECT 1 FROM public.members WHERE person_number = p_person_number) THEN
            v_valid_pn := p_person_number;
        ELSE
            v_valid_pn := NULL;
        END IF;
    END IF;

    -- 1. Prüfen, ob Auth-Benutzer bereits existiert
    SELECT id INTO v_auth_uid 
    FROM auth.users 
    WHERE LOWER(email) = clean_email
    LIMIT 1;

    -- 2. Falls Passwort angegeben ist:
    IF p_password IS NOT NULL AND length(trim(p_password)) >= 6 THEN
        IF v_auth_uid IS NULL THEN
            -- Neuen Auth-Benutzer anlegen
            v_auth_uid := gen_random_uuid();
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_auth_uid, 'authenticated', 'authenticated',
                clean_email, extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)), now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('name', TRIM(p_display_name)),
                now(), now()
            );

            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_auth_uid, v_auth_uid,
                jsonb_build_object('sub', v_auth_uid::text, 'email', clean_email),
                'email', now(), now(), now()
            );
        ELSE
            -- Bestehenden Auth-Benutzer aktualisieren
            UPDATE auth.users
            SET encrypted_password = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                updated_at = now()
            WHERE id = v_auth_uid;
        END IF;
    END IF;

    -- 3. In admin_profiles speichern oder aktualisieren
    INSERT INTO public.admin_profiles (
        username, display_name, email, role_external, person_number, auth_user_id, updated_at
    ) VALUES (
        TRIM(p_username), TRIM(p_display_name), TRIM(p_email), TRIM(p_role_external), v_valid_pn, v_auth_uid, now()
    )
    ON CONFLICT (username) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        role_external = EXCLUDED.role_external,
        person_number = v_valid_pn,
        auth_user_id = COALESCE(EXCLUDED.auth_user_id, admin_profiles.auth_user_id),
        updated_at = now()
    RETURNING id, auth_user_id INTO v_admin_id, v_auth_uid;

    -- Nachträgliche Verknüpfung sichern
    IF v_auth_uid IS NOT NULL THEN
        UPDATE public.admin_profiles
        SET auth_user_id = v_auth_uid
        WHERE id = v_admin_id AND (auth_user_id IS NULL OR auth_user_id <> v_auth_uid);
    END IF;

    -- 4. Rollen aktualisieren
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
