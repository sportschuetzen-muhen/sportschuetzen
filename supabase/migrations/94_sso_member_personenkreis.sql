-- ==============================================================================
-- 94_sso_member_personenkreis.sql
-- Ergänzung von is_passive und personenkreis ('aktiv' | 'passiv')
-- in resolve_login_identifier und sync_member_auth_session
-- ==============================================================================

-- 1. resolve_login_identifier: Liefert is_passive und personenkreis mit
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
    res_is_passive BOOLEAN := false;
BEGIN
    clean_id := REGEXP_REPLACE(TRIM(COALESCE(p_identifier, '')), '\s+', ' ', 'g');
    clean_id := REGEXP_REPLACE(clean_id, '[,;]+', ' ', 'g');
    clean_id := TRIM(clean_id);

    IF clean_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen Namen, deine E-Mail oder Lizenznummer eingeben.');
    END IF;

    -- 1. Check in admin_profiles
    SELECT ap.email, ap.auth_user_id, ap.display_name, ap.person_number
    INTO res_email, res_user_id, res_name, res_pn
    FROM public.admin_profiles ap
    WHERE ap.is_active = true
      AND (
          LOWER(ap.username) = LOWER(clean_id)
          OR LOWER(ap.email) = LOWER(clean_id)
          OR LOWER(TRIM(ap.display_name)) = LOWER(clean_id)
          OR LOWER(REGEXP_REPLACE(TRIM(ap.display_name), '^(\S+)\s+(\S+)$', '\2 \1')) = LOWER(clean_id)
          OR (clean_id ~ '^[0-9]+$' AND ap.person_number = clean_id::INTEGER)
      )
    LIMIT 1;

    IF FOUND AND res_email IS NOT NULL AND TRIM(res_email) <> '' THEN
        -- Prüfe, ob in members als passiv markiert
        IF res_pn IS NOT NULL THEN
            SELECT COALESCE(is_passive, false) INTO res_is_passive FROM public.members WHERE person_number = res_pn;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'email', LOWER(TRIM(res_email)),
            'name', res_name,
            'type', 'admin',
            'person_number', res_pn,
            'auth_user_id', res_user_id,
            'is_passive', COALESCE(res_is_passive, false),
            'personenkreis', CASE WHEN COALESCE(res_is_passive, false) THEN 'passiv' ELSE 'aktiv' END
        );
    END IF;

    -- 2. Check in members
    SELECT m.primary_email, m.auth_user_id, TRIM(m.first_name || ' ' || m.last_name), m.person_number, COALESCE(m.is_passive, false)
    INTO res_email, res_user_id, res_name, res_pn, res_is_passive
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
            'auth_user_id', res_user_id,
            'is_passive', COALESCE(res_is_passive, false),
            'personenkreis', CASE WHEN COALESCE(res_is_passive, false) THEN 'passiv' ELSE 'aktiv' END
        );
    END IF;

    -- 3. Direkte E-Mail Eingabe Fallback
    IF clean_id LIKE '%@%' THEN
        IF EXISTS (SELECT 1 FROM public.members WHERE LOWER(TRIM(primary_email)) = LOWER(clean_id) AND is_active = false) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Dieses Mitgliederkonto ist momentan inaktiv. Bitte kontaktiere den Vorstand.');
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'Diese E-Mail-Adresse ist nicht im Vereinsverzeichnis registriert.');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Mitglied mit diesem Namen, dieser E-Mail oder Lizenznummer gefunden.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role;


-- 2. sync_member_auth_session: Liefert is_passive und personenkreis mit
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
    v_is_passive BOOLEAN := false;
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

    IF FOUND AND (v_admin.auth_user_id IS NULL OR v_admin.auth_user_id <> v_user_id) THEN
        UPDATE public.admin_profiles SET auth_user_id = v_user_id WHERE id = v_admin.id;
    END IF;

    -- Prüfe Mitglied-Profil
    SELECT * INTO v_member
    FROM public.members
    WHERE auth_user_id = v_user_id
       OR (v_email IS NOT NULL AND LOWER(TRIM(primary_email)) = LOWER(TRIM(v_email)))
    LIMIT 1;

    IF FOUND AND (v_member.auth_user_id IS NULL OR v_member.auth_user_id <> v_user_id) THEN
        UPDATE public.members SET auth_user_id = v_user_id WHERE person_number = v_member.person_number;
    END IF;

    IF v_member.person_number IS NOT NULL THEN
        v_is_passive := COALESCE(v_member.is_passive, false);
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
        'is_passive', v_is_passive,
        'personenkreis', CASE WHEN v_is_passive THEN 'passiv' ELSE 'aktiv' END,
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

GRANT EXECUTE ON FUNCTION public.sync_member_auth_session() TO authenticated, service_role;
