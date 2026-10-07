-- ==============================================================================
-- 47_setup_test_personas_and_fix_auth.sql
-- Migration: 4 Test-Personen (Member, Admin, Vorstand, Kassier) & Auth/Rollen-Fix
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. EXTENSION: pgcrypto sicherstellen
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ------------------------------------------------------------------------------
-- 2. TEST-MITGLIEDER IN public.members ANLEGEN / AKTUALISIEREN
-- ------------------------------------------------------------------------------

-- Person 1: Daniel Hunziker (1073722) - REINES MITGLIED
UPDATE public.members
SET primary_email = 'dan.hunziker@hotmail.ch',
    address_number = '125638',
    first_name = 'Daniel',
    last_name = 'Hunziker',
    is_active = true,
    updated_at = now()
WHERE person_number = 1073722;

-- Person 2: Dan Admin (9999999) - ADMIN
INSERT INTO public.members (
    person_number, address_number, first_name, last_name, primary_email, is_active, club_entry_date
) VALUES (
    9999999, '999999', 'Dan', 'Admin', 'dan.hunziker@me.com', true, CURRENT_DATE
)
ON CONFLICT (person_number) DO UPDATE
SET address_number = '999999',
    first_name = 'Dan',
    last_name = 'Admin',
    primary_email = 'dan.hunziker@me.com',
    is_active = true,
    updated_at = now();

-- Person 3: Dan Vorstand (8888888) - VORSTAND
INSERT INTO public.members (
    person_number, address_number, first_name, last_name, primary_email, is_active, club_entry_date
) VALUES (
    8888888, '888888', 'Dan', 'Vorstand', 'dan.hunziker@bluewin.ch', true, CURRENT_DATE
)
ON CONFLICT (person_number) DO UPDATE
SET address_number = '888888',
    first_name = 'Dan',
    last_name = 'Vorstand',
    primary_email = 'dan.hunziker@bluewin.ch',
    is_active = true,
    updated_at = now();

-- Person 4: Dan Kassier (7777777) - KASSIER
INSERT INTO public.members (
    person_number, address_number, first_name, last_name, primary_email, is_active, club_entry_date
) VALUES (
    7777777, '777777', 'Dan', 'Kassier', 'dan.hunziker@outlook.com', true, CURRENT_DATE
)
ON CONFLICT (person_number) DO UPDATE
SET address_number = '777777',
    first_name = 'Dan',
    last_name = 'Kassier',
    primary_email = 'dan.hunziker@outlook.com',
    is_active = true,
    updated_at = now();


-- ------------------------------------------------------------------------------
-- 3. AUTH.USERS & IDENTITIES (Passwort einheitlich 'Muhen2026!')
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_uid_bluewin UUID;
    v_pw_hash TEXT;
BEGIN
    v_pw_hash := crypt('Muhen2026!', gen_salt('bf', 10));

    -- A. dan.hunziker@me.com (Admin)
    UPDATE auth.users
    SET encrypted_password = v_pw_hash,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = jsonb_build_object('name', 'Dan Admin'),
        updated_at = now()
    WHERE LOWER(email) = 'dan.hunziker@me.com';

    -- B. dan.hunziker@outlook.com (Kassier)
    UPDATE auth.users
    SET encrypted_password = v_pw_hash,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = jsonb_build_object('name', 'Dan Kassier'),
        updated_at = now()
    WHERE LOWER(email) = 'dan.hunziker@outlook.com';

    -- C. dan.hunziker@hotmail.ch (Member)
    UPDATE auth.users
    SET encrypted_password = v_pw_hash,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = jsonb_build_object('name', 'Daniel Hunziker'),
        updated_at = now()
    WHERE LOWER(email) = 'dan.hunziker@hotmail.ch';

    -- D. dan.hunziker@bluewin.ch (Vorstand) - falls noch nicht vorhanden, anlegen
    SELECT id INTO v_uid_bluewin FROM auth.users WHERE LOWER(email) = 'dan.hunziker@bluewin.ch';
    IF v_uid_bluewin IS NULL THEN
        v_uid_bluewin := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_uid_bluewin, 'authenticated', 'authenticated',
            'dan.hunziker@bluewin.ch', v_pw_hash, now(),
            '', '', '', '',
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('name', 'Dan Vorstand'),
            now(), now()
        );

        INSERT INTO auth.identities (
            provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_uid_bluewin::text, v_uid_bluewin,
            jsonb_build_object('sub', v_uid_bluewin::text, 'email', 'dan.hunziker@bluewin.ch'),
            'email', now(), now(), now()
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_pw_hash,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            raw_user_meta_data = jsonb_build_object('name', 'Dan Vorstand'),
            updated_at = now()
        WHERE id = v_uid_bluewin;
    END IF;

    -- Auth_user_id Verknüpfungen in members sicherstellen
    UPDATE public.members
    SET auth_user_id = (SELECT id FROM auth.users WHERE LOWER(email) = 'dan.hunziker@me.com' LIMIT 1)
    WHERE person_number = 9999999;

    UPDATE public.members
    SET auth_user_id = (SELECT id FROM auth.users WHERE LOWER(email) = 'dan.hunziker@bluewin.ch' LIMIT 1)
    WHERE person_number = 8888888;

    UPDATE public.members
    SET auth_user_id = (SELECT id FROM auth.users WHERE LOWER(email) = 'dan.hunziker@outlook.com' LIMIT 1)
    WHERE person_number = 7777777;

    UPDATE public.members
    SET auth_user_id = (SELECT id FROM auth.users WHERE LOWER(email) = 'dan.hunziker@hotmail.ch' LIMIT 1)
    WHERE person_number = 1073722;
END $$;


-- ------------------------------------------------------------------------------
-- 4. ADMIN_PROFILES TABELLE AKTUALISIEREN
-- ------------------------------------------------------------------------------

-- Deaktiviere das alte 'danhu' Profil für hotmail.ch (soll reines Mitglied sein!)
UPDATE public.admin_profiles
SET is_active = false,
    updated_at = now()
WHERE username = 'danhu' OR email = 'dan.hunziker@hotmail.ch';

-- 1. Dan Admin (9999999)
INSERT INTO public.admin_profiles (
    username, display_name, email, role_external, person_number, auth_user_id, is_active, updated_at
)
SELECT 'admin', 'Dan Admin', 'dan.hunziker@me.com', 'admin', 9999999, u.id, true, now()
FROM auth.users u WHERE LOWER(u.email) = 'dan.hunziker@me.com'
ON CONFLICT (username) DO UPDATE
SET display_name = 'Dan Admin',
    email = 'dan.hunziker@me.com',
    role_external = 'admin',
    person_number = 9999999,
    auth_user_id = EXCLUDED.auth_user_id,
    is_active = true,
    updated_at = now();

-- 2. Dan Vorstand (8888888)
INSERT INTO public.admin_profiles (
    username, display_name, email, role_external, person_number, auth_user_id, is_active, updated_at
)
SELECT 'dan.vorstand', 'Dan Vorstand', 'dan.hunziker@bluewin.ch', 'vorstand', 8888888, u.id, true, now()
FROM auth.users u WHERE LOWER(u.email) = 'dan.hunziker@bluewin.ch'
ON CONFLICT (username) DO UPDATE
SET display_name = 'Dan Vorstand',
    email = 'dan.hunziker@bluewin.ch',
    role_external = 'vorstand',
    person_number = 8888888,
    auth_user_id = EXCLUDED.auth_user_id,
    is_active = true,
    updated_at = now();

-- 3. Dan Kassier (7777777) - bestehendes Outlook Profil aktualisieren
UPDATE public.admin_profiles
SET username = 'dan.kassier',
    display_name = 'Dan Kassier',
    role_external = 'kassier',
    person_number = 7777777,
    is_active = true,
    updated_at = now()
WHERE LOWER(email) = 'dan.hunziker@outlook.com';

INSERT INTO public.admin_profiles (
    username, display_name, email, role_external, person_number, auth_user_id, is_active, updated_at
)
SELECT 'dan.kassier', 'Dan Kassier', 'dan.hunziker@outlook.com', 'kassier', 7777777, u.id, true, now()
FROM auth.users u WHERE LOWER(u.email) = 'dan.hunziker@outlook.com'
AND NOT EXISTS (SELECT 1 FROM public.admin_profiles WHERE LOWER(email) = 'dan.hunziker@outlook.com');

-- 4. Beat Augsburger (PersonNumber nachführen)
UPDATE public.admin_profiles
SET person_number = 1070293
WHERE username = 'b.augsburger';


-- ------------------------------------------------------------------------------
-- 5. PUBLIC.USER_ROLES SYNCHRONISIEREN
-- ------------------------------------------------------------------------------

-- A. Admin (dan.hunziker@me.com): Rollen admin + vorstand
DO $$
DECLARE
    v_uid UUID;
BEGIN
    SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = 'dan.hunziker@me.com';
    IF v_uid IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_uid;
        INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin'::app_role);
        INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'vorstand'::app_role);
    END IF;
END $$;

-- B. Vorstand (dan.hunziker@bluewin.ch): Rolle vorstand
DO $$
DECLARE
    v_uid UUID;
BEGIN
    SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = 'dan.hunziker@bluewin.ch';
    IF v_uid IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_uid;
        INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'vorstand'::app_role);
    END IF;
END $$;

-- C. Kassier (dan.hunziker@outlook.com): Rollen kassier + vorstand
DO $$
DECLARE
    v_uid UUID;
BEGIN
    SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = 'dan.hunziker@outlook.com';
    IF v_uid IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_uid;
        INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'kassier'::app_role);
        INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'vorstand'::app_role);
    END IF;
END $$;

-- D. Member (dan.hunziker@hotmail.ch): Nur Rolle member
DO $$
DECLARE
    v_uid UUID;
BEGIN
    SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = 'dan.hunziker@hotmail.ch';
    IF v_uid IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_uid;
        INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'member'::app_role);
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 6. RPC: resolve_login_identifier ERWEITERN (display_name & PersonNumber)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    clean_id TEXT;
    res_email TEXT;
    res_user_id UUID;
    res_name TEXT;
    res_type TEXT;
    res_pn INTEGER;
BEGIN
    clean_id := TRIM(p_identifier);
    IF clean_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte einen Benutzernamen, Namen oder eine E-Mail-Adresse eingeben.');
    END IF;

    -- 1. Check in admin_profiles nach E-Mail, Username, Display_Name oder PersonNumber
    SELECT ap.email, ap.auth_user_id, ap.display_name, ap.person_number
    INTO res_email, res_user_id, res_name, res_pn
    FROM public.admin_profiles ap
    WHERE ap.is_active = true
      AND (
          LOWER(ap.username) = LOWER(clean_id)
          OR LOWER(ap.email) = LOWER(clean_id)
          OR LOWER(TRIM(ap.display_name)) = LOWER(clean_id)
          OR (clean_id ~ '^[0-9]+$' AND ap.person_number = clean_id::INTEGER)
      )
    LIMIT 1;

    IF FOUND AND res_email IS NOT NULL AND TRIM(res_email) <> '' THEN
        RETURN jsonb_build_object(
            'success', true,
            'email', LOWER(TRIM(res_email)),
            'name', res_name,
            'type', 'admin',
            'person_number', res_pn,
            'auth_user_id', res_user_id
        );
    END IF;

    -- 2. Check in members (für reguläre Vereinsmitglieder, Web-App & Website)
    SELECT m.primary_email, m.auth_user_id, TRIM(m.first_name || ' ' || m.last_name), m.person_number
    INTO res_email, res_user_id, res_name, res_pn
    FROM public.members m
    WHERE m.is_active = true
      AND (
          LOWER(TRIM(COALESCE(m.primary_email, ''))) = LOWER(clean_id)
          OR (clean_id ~ '^[0-9]+$' AND m.person_number = clean_id::INTEGER)
          OR m.address_number = clean_id
          OR m.address_number = LPAD(clean_id, 6, '0')
          OR LOWER(TRIM(m.first_name || ' ' || m.last_name)) = LOWER(clean_id)
          OR LOWER(TRIM(m.last_name || ' ' || m.first_name)) = LOWER(clean_id)
      )
    ORDER BY (m.auth_user_id IS NOT NULL) DESC, (m.last_name = 'Hunziker') DESC, m.person_number ASC
    LIMIT 1;

    IF FOUND THEN
        IF res_email IS NULL OR TRIM(res_email) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'name', res_name,
                'error', 'Für ' || res_name || ' ist keine E-Mail-Adresse hinterlegt. Bitte wende dich an den Vorstand für die Registrierung.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'email', LOWER(TRIM(res_email)),
            'name', res_name,
            'type', 'member',
            'person_number', res_pn,
            'auth_user_id', res_user_id
        );
    END IF;

    -- 3. Direkte E-Mail Eingabe Fallback
    IF clean_id LIKE '%@%' THEN
        IF EXISTS (SELECT 1 FROM public.members WHERE LOWER(TRIM(primary_email)) = LOWER(clean_id) AND is_active = false) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Dieses Mitgliederkonto ist momentan inaktiv. Bitte kontaktiere den Vorstand.');
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'Diese E-Mail-Adresse ist nicht im Vereinsverzeichnis registriert.');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Konto mit diesem Namen, dieser E-Mail oder Lizenznummer gefunden.');
END;
$$;


-- ------------------------------------------------------------------------------
-- 7. TRIGGER: handle_auth_user_sync HÄRTEN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_pn INTEGER;
    v_admin RECORD;
    v_clean_email TEXT;
    v_role TEXT;
BEGIN
    v_clean_email := LOWER(TRIM(COALESCE(NEW.email, '')));
    IF v_clean_email = '' THEN
        RETURN NEW;
    END IF;

    -- 1. Prüfe ob Admin in admin_profiles
    SELECT * INTO v_admin
    FROM public.admin_profiles
    WHERE LOWER(TRIM(email)) = v_clean_email AND is_active = true
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.admin_profiles
        SET auth_user_id = NEW.id, updated_at = now()
        WHERE id = v_admin.id AND (auth_user_id IS NULL OR auth_user_id <> NEW.id);

        -- Berechtigte Vorstands-/Admin-Rollen zuweisen:
        v_role := LOWER(TRIM(COALESCE(v_admin.role_external, 'vorstand')));
        IF v_role NOT IN ('admin', 'vorstand', 'kassier', 'aktuar', 'schuetzenmeister', 'vermieter', 'materialwart') THEN
            v_role := 'vorstand';
        END IF;

        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.id, v_role::app_role)
        ON CONFLICT DO NOTHING;

        IF v_role <> 'vorstand' THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'vorstand'::app_role)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- 2. Prüfe ob Mitglied in members
    SELECT person_number INTO v_pn 
    FROM public.members
    WHERE LOWER(TRIM(primary_email)) = v_clean_email
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.members
        SET auth_user_id = NEW.id, updated_at = now()
        WHERE person_number = v_pn AND (auth_user_id IS NULL OR auth_user_id <> NEW.id);

        -- Rolle 'member' nur vergeben, falls der Benutzer noch KEINE Rollen besitzt
        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'member'::app_role)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- ------------------------------------------------------------------------------
-- 8. RPC: sync_member_auth_session HÄRTEN (Priorisierung Admin & Rollen-Merge)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_member_auth_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_member RECORD;
    v_admin RECORD;
    v_roles TEXT[];
    v_is_board BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert.');
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

    -- Prüfe Admin-Profil
    SELECT * INTO v_admin
    FROM public.admin_profiles
    WHERE (auth_user_id = v_user_id OR (v_email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(v_email))))
      AND is_active = true
    LIMIT 1;

    -- Falls in admin_profiles vorhanden, aber auth_user_id noch fehlt:
    IF FOUND AND (v_admin.auth_user_id IS NULL OR v_admin.auth_user_id <> v_user_id) THEN
        UPDATE public.admin_profiles SET auth_user_id = v_user_id WHERE id = v_admin.id;
    END IF;

    -- Prüfe Mitglied-Profil
    SELECT * INTO v_member
    FROM public.members
    WHERE auth_user_id = v_user_id
       OR (v_email IS NOT NULL AND LOWER(TRIM(primary_email)) = LOWER(TRIM(v_email)))
    LIMIT 1;

    -- Falls in members vorhanden, aber auth_user_id noch fehlt:
    IF FOUND AND (v_member.auth_user_id IS NULL OR v_member.auth_user_id <> v_user_id) THEN
        UPDATE public.members SET auth_user_id = v_user_id WHERE person_number = v_member.person_number;
    END IF;

    -- Falls Admin-Profil existiert, Rolle synchronisieren
    IF v_admin.id IS NOT NULL THEN
        DECLARE
            v_admin_role TEXT := LOWER(TRIM(COALESCE(v_admin.role_external, 'vorstand')));
        BEGIN
            IF v_admin_role NOT IN ('admin', 'vorstand', 'kassier', 'aktuar', 'schuetzenmeister', 'vermieter', 'materialwart') THEN
                v_admin_role := 'vorstand';
            END IF;
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_user_id, v_admin_role::app_role)
            ON CONFLICT DO NOTHING;
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_user_id, 'vorstand'::app_role)
            ON CONFLICT DO NOTHING;
        END;
    END IF;

    -- Rollen abfragen
    SELECT ARRAY_AGG(DISTINCT role::text)
    INTO v_roles
    FROM public.user_roles
    WHERE user_id = v_user_id;

    -- Falls noch immer keine Rolle existiert:
    IF v_roles IS NULL OR ARRAY_LENGTH(v_roles, 1) IS NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'member'::app_role)
        ON CONFLICT DO NOTHING;
        v_roles := ARRAY['member'];
    END IF;

    -- Ist Vorstandsmitglied?
    IF (v_admin.id IS NOT NULL AND v_admin.is_active = true) OR
       ('admin' = ANY(v_roles) OR 'vorstand' = ANY(v_roles) OR 'kassier' = ANY(v_roles) OR 'aktuar' = ANY(v_roles) OR 'schuetzenmeister' = ANY(v_roles) OR 'vermieter' = ANY(v_roles) OR 'materialwart' = ANY(v_roles)) THEN
        v_is_board := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'auth_user_id', v_user_id,
        'email', v_email,
        'is_board', v_is_board,
        'roles', COALESCE(v_roles, ARRAY['member']),
        'primary_role', CASE 
            WHEN 'admin' = ANY(v_roles) THEN 'admin'
            WHEN 'kassier' = ANY(v_roles) THEN 'kassier'
            WHEN 'aktuar' = ANY(v_roles) THEN 'aktuar'
            WHEN 'schuetzenmeister' = ANY(v_roles) THEN 'schuetzenmeister'
            WHEN 'vermieter' = ANY(v_roles) THEN 'vermieter'
            WHEN 'materialwart' = ANY(v_roles) THEN 'materialwart'
            WHEN 'vorstand' = ANY(v_roles) THEN 'vorstand'
            ELSE 'member' 
        END,
        'display_name', COALESCE(v_admin.display_name, TRIM(COALESCE(v_member.first_name, '') || ' ' || COALESCE(v_member.last_name, '')), v_email),
        'firstname', COALESCE(v_member.first_name, split_part(COALESCE(v_admin.display_name, ''), ' ', 1)),
        'lastname', COALESCE(v_member.last_name, split_part(COALESCE(v_admin.display_name, ''), ' ', 2)),
        'person_number', COALESCE(v_member.person_number, v_admin.person_number),
        'address_number', v_member.address_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_member_auth_session() TO authenticated, service_role;
