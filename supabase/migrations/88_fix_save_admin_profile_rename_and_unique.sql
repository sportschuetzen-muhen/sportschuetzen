-- ==============================================================================
-- 88_fix_save_admin_profile_rename_and_unique.sql
-- Migration: Phase 88 – Härtung save_admin_profile gegen Unique-Constraint-Fehler bei Umbenennung
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. Alte Funktions-Überladung entfernen
DROP FUNCTION IF EXISTS public.save_admin_profile(text, text, text, text, integer, text[], text);
DROP FUNCTION IF EXISTS public.save_admin_profile(text, text, text, text, integer, text[], text, uuid);

-- 2. Aktualisierte Funktion mit p_admin_id und strikter Trennung von Update und Insert
CREATE OR REPLACE FUNCTION public.save_admin_profile(
    p_username TEXT,
    p_display_name TEXT,
    p_email TEXT,
    p_role_external TEXT DEFAULT NULL,
    p_person_number INTEGER DEFAULT NULL,
    p_roles TEXT[] DEFAULT ARRAY['vorstand'],
    p_password TEXT DEFAULT NULL,
    p_admin_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_admin_id UUID := p_admin_id;
    v_auth_uid UUID := NULL;
    v_valid_pn INTEGER := NULL;
    r_role TEXT;
    clean_email TEXT;
    clean_username TEXT;
BEGIN
    clean_email := LOWER(TRIM(p_email));
    clean_username := TRIM(p_username);

    IF clean_username = '' THEN
        RAISE EXCEPTION 'Benutzername darf nicht leer sein.';
    END IF;

    -- Validierung: person_number nur verwenden, wenn sie tatsächlich in members existiert
    IF p_person_number IS NOT NULL AND p_person_number > 0 THEN
        IF EXISTS (SELECT 1 FROM public.members WHERE person_number = p_person_number) THEN
            v_valid_pn := p_person_number;
        ELSE
            v_valid_pn := NULL;
        END IF;
    END IF;

    -- 1. Prüfen, ob Auth-Benutzer anhand der E-Mail bereits existiert
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
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                confirmation_token, recovery_token, email_change_token_new, email_change
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_auth_uid, 'authenticated', 'authenticated',
                clean_email, extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)), now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('name', TRIM(p_display_name)),
                now(), now(),
                '', '', '', ''
            );

            INSERT INTO auth.identities (
                provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_auth_uid::text, v_auth_uid,
                jsonb_build_object('sub', v_auth_uid::text, 'email', clean_email),
                'email', now(), now(), now()
            )
            ON CONFLICT (provider_id, provider) DO UPDATE SET
                identity_data = EXCLUDED.identity_data,
                updated_at = now();
        ELSE
            -- Bestehenden Auth-Benutzer aktualisieren
            UPDATE auth.users
            SET encrypted_password = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                raw_user_meta_data = jsonb_build_object('name', TRIM(p_display_name)),
                updated_at = now()
            WHERE id = v_auth_uid;

            -- Sicherstellen, dass Identity existiert
            INSERT INTO auth.identities (
                provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_auth_uid::text, v_auth_uid,
                jsonb_build_object('sub', v_auth_uid::text, 'email', clean_email),
                'email', now(), now(), now()
            )
            ON CONFLICT (provider_id, provider) DO UPDATE SET
                identity_data = EXCLUDED.identity_data,
                updated_at = now();
        END IF;
    END IF;

    -- 3. In admin_profiles speichern oder aktualisieren
    IF v_admin_id IS NOT NULL THEN
        -- UPDATE-MODUS
        IF NOT EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_admin_id) THEN
            RAISE EXCEPTION 'Admin-Profil mit ID % wurde nicht gefunden.', v_admin_id;
        END IF;

        -- Prüfen, ob der gewünschte clean_username von einem ANDEREN Profil belegt ist
        IF EXISTS (
            SELECT 1 FROM public.admin_profiles
            WHERE LOWER(username) = LOWER(clean_username)
              AND id <> v_admin_id
        ) THEN
            RAISE EXCEPTION 'Der Benutzername "%" ist bereits vergeben.', clean_username;
        END IF;

        -- Prüfen, ob die auth_user_id (falls vorhanden) nicht von einem ANDEREN Profil belegt ist
        IF v_auth_uid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.admin_profiles
            WHERE auth_user_id = v_auth_uid
              AND id <> v_admin_id
        ) THEN
            RAISE EXCEPTION 'Die E-Mail-Adresse bzw. Auth-ID "%" ist bereits mit einem anderen Profil verknüpft.', clean_email;
        END IF;

        -- Update des bestehenden Datensatzes
        UPDATE public.admin_profiles
        SET username = clean_username,
            display_name = TRIM(p_display_name),
            email = TRIM(p_email),
            role_external = TRIM(p_role_external),
            person_number = v_valid_pn,
            auth_user_id = COALESCE(v_auth_uid, admin_profiles.auth_user_id),
            updated_at = now()
        WHERE id = v_admin_id
        RETURNING auth_user_id INTO v_auth_uid;
    ELSE
        -- INSERT-MODUS (Neuanlage)
        -- Vorab prüfen, ob Username bereits existiert
        IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE LOWER(username) = LOWER(clean_username)) THEN
            RAISE EXCEPTION 'Der Benutzername "%" ist bereits vergeben.', clean_username;
        END IF;

        -- Vorab prüfen, ob auth_user_id bereits existiert
        IF v_auth_uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.admin_profiles WHERE auth_user_id = v_auth_uid) THEN
            RAISE EXCEPTION 'Die E-Mail-Adresse "%" ist bereits mit einem Admin-Profil verknüpft.', clean_email;
        END IF;

        INSERT INTO public.admin_profiles (
            username, display_name, email, role_external, person_number, auth_user_id, updated_at
        ) VALUES (
            clean_username, TRIM(p_display_name), TRIM(p_email), TRIM(p_role_external), v_valid_pn, v_auth_uid, now()
        )
        RETURNING id, auth_user_id INTO v_admin_id, v_auth_uid;
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

GRANT EXECUTE ON FUNCTION public.save_admin_profile TO authenticated, anon, service_role;
