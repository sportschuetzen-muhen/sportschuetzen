-- ==============================================================================
-- 46_sso_member_auth_sync.sql
-- Migration: Phase 46 – Universelles SSO für Mitglieder & Vorstand
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. RPC: public.resolve_login_identifier(identifier TEXT)
-- Löst Benutzername, E-Mail, Lizenz-/Personennummer, PIN oder Vor- und Nachname
-- serverseitig in die registrierte Auth-E-Mail auf und unterscheidet zwischen
-- Vorstands-Accounts und regulären Vereinsmitgliedern.
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

    -- 1. Check in admin_profiles nach E-Mail, Username oder PersonNumber
    SELECT ap.email, ap.auth_user_id, ap.display_name, ap.person_number
    INTO res_email, res_user_id, res_name, res_pn
    FROM public.admin_profiles ap
    WHERE ap.is_active = true
      AND (
          LOWER(ap.username) = LOWER(clean_id)
          OR LOWER(ap.email) = LOWER(clean_id)
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
    -- Unterstützt: primary_email, person_number (SSV), address_number (PIN) oder vollständigen Namen
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

    -- 3. Fallback: Direkte E-Mail-Eingabe (nur wenn in admin_profiles oder members vorhanden)
    IF clean_id LIKE '%@%' THEN
        -- Prüfe nochmals ohne is_active Filter zur sauberen Rückmeldung
        IF EXISTS (SELECT 1 FROM public.members WHERE LOWER(TRIM(primary_email)) = LOWER(clean_id) AND is_active = false) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Dieses Mitgliederkonto ist momentan inaktiv. Bitte kontaktiere den Vorstand.');
        END IF;
        
        RETURN jsonb_build_object('success', false, 'error', 'Diese E-Mail-Adresse ist nicht im Vereinsverzeichnis registriert.');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Mitglied mit diesem Namen, dieser E-Mail oder Lizenznummer gefunden.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role;


-- 2. TRIGGER & FUNCTION: Automatische Verknüpfung von auth.users mit public.members & user_roles
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_pn INTEGER;
    v_admin_id UUID;
    v_clean_email TEXT;
BEGIN
    v_clean_email := LOWER(TRIM(COALESCE(NEW.email, '')));
    IF v_clean_email = '' THEN
        RETURN NEW;
    END IF;

    -- 1. Prüfe ob Admin in admin_profiles
    SELECT id INTO v_admin_id 
    FROM public.admin_profiles
    WHERE LOWER(TRIM(email)) = v_clean_email
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.admin_profiles
        SET auth_user_id = NEW.id, updated_at = now()
        WHERE id = v_admin_id AND (auth_user_id IS NULL OR auth_user_id <> NEW.id);
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

        -- Rolle 'member' vergeben, falls der Benutzer noch keine Rollen besitzt
        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'member')
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_sync ON auth.users;
CREATE TRIGGER trg_auth_user_sync
    AFTER INSERT OR UPDATE OF email ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_sync();


-- 3. RPC: public.sync_member_auth_session()
-- Ermöglicht dem authentifizierten Client, seine Session-Daten (Name, Lizenz, Rolle)
-- sicher und autorisiert aus der Single Source of Truth abzufragen.
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

    -- Rollen abfragen
    SELECT ARRAY_AGG(DISTINCT role::text)
    INTO v_roles
    FROM public.user_roles
    WHERE user_id = v_user_id;

    -- Prüfe Admin-Profil
    SELECT * INTO v_admin
    FROM public.admin_profiles
    WHERE auth_user_id = v_user_id 
       OR (v_email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(v_email)))
    LIMIT 1;

    -- Falls in admin_profiles vorhanden, aber auth_user_id noch fehlt:
    IF FOUND AND v_admin.auth_user_id IS NULL THEN
        UPDATE public.admin_profiles SET auth_user_id = v_user_id WHERE id = v_admin.id;
    END IF;

    -- Prüfe Mitglied-Profil
    SELECT * INTO v_member
    FROM public.members
    WHERE auth_user_id = v_user_id
       OR (v_email IS NOT NULL AND LOWER(TRIM(primary_email)) = LOWER(TRIM(v_email)))
    LIMIT 1;

    -- Falls in members vorhanden, aber auth_user_id noch fehlt:
    IF FOUND AND v_member.auth_user_id IS NULL THEN
        UPDATE public.members SET auth_user_id = v_user_id WHERE person_number = v_member.person_number;
    END IF;

    -- Falls noch keine Rolle in user_roles existiert, Rolle 'member' sicherstellen
    IF v_roles IS NULL OR ARRAY_LENGTH(v_roles, 1) IS NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'member')
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
        'primary_role', CASE WHEN v_is_board THEN COALESCE(v_roles[1], 'vorstand') ELSE 'member' END,
        'display_name', COALESCE(v_admin.display_name, TRIM(COALESCE(v_member.first_name, '') || ' ' || COALESCE(v_member.last_name, '')), v_email),
        'firstname', COALESCE(v_member.first_name, split_part(COALESCE(v_admin.display_name, ''), ' ', 1)),
        'lastname', COALESCE(v_member.last_name, split_part(COALESCE(v_admin.display_name, ''), ' ', 2)),
        'person_number', COALESCE(v_member.person_number, v_admin.person_number),
        'address_number', v_member.address_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_member_auth_session() TO authenticated, service_role;
