-- ==============================================================================
-- 79_unified_login_and_pin_auth.sql
-- Optimierte Login-Funktionen: Freitext-Auflösung und sichere PIN-Verifikation
-- ==============================================================================

-- 1. resolve_login_identifier: Tolerante Eingabe-Bereinigung & Namensauflösung
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
    -- Mehrfache Leerzeichen, Kommas und führende/nachfolgende Leerzeichen entfernen
    clean_id := REGEXP_REPLACE(TRIM(COALESCE(p_identifier, '')), '\s+', ' ', 'g');
    clean_id := REGEXP_REPLACE(clean_id, '[,;]+', ' ', 'g');
    clean_id := TRIM(clean_id);

    IF clean_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen Namen, deine E-Mail oder Lizenznummer eingeben.');
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
          OR LOWER(REGEXP_REPLACE(TRIM(ap.display_name), '^(\S+)\s+(\S+)$', '\2 \1')) = LOWER(clean_id)
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

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Mitglied mit diesem Namen, dieser E-Mail oder Lizenznummer gefunden.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role;


-- 2. verify_member_pin: Direkte serverseitige PIN-Prüfung
CREATE OR REPLACE FUNCTION public.verify_member_pin(p_identifier TEXT, p_pin TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    clean_id TEXT;
    clean_pin TEXT;
    m RECORD;
    ap RECORD;
BEGIN
    clean_id := REGEXP_REPLACE(TRIM(COALESCE(p_identifier, '')), '\s+', ' ', 'g');
    clean_id := REGEXP_REPLACE(clean_id, '[,;]+', ' ', 'g');
    clean_id := TRIM(clean_id);
    clean_pin := TRIM(COALESCE(p_pin, ''));

    IF clean_id = '' OR clean_pin = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte Name und PIN/Passwort eingeben.');
    END IF;

    -- Prüfen, ob Identifier einem aktiven Admin-Konto entspricht (Vorstand)
    SELECT * INTO ap
    FROM public.admin_profiles
    WHERE is_active = true
      AND (
          LOWER(username) = LOWER(clean_id)
          OR LOWER(email) = LOWER(clean_id)
          OR LOWER(TRIM(display_name)) = LOWER(clean_id)
          OR LOWER(REGEXP_REPLACE(TRIM(display_name), '^(\S+)\s+(\S+)$', '\2 \1')) = LOWER(clean_id)
          OR (clean_id ~ '^[0-9]+$' AND person_number = clean_id::INTEGER)
      )
    LIMIT 1;

    -- Mitglied in public.members suchen
    SELECT * INTO m
    FROM public.members
    WHERE is_active = true
      AND (
          LOWER(TRIM(COALESCE(primary_email, ''))) = LOWER(clean_id)
          OR (clean_id ~ '^[0-9]+$' AND person_number = clean_id::INTEGER)
          OR address_number = clean_id
          OR address_number = LPAD(clean_id, 6, '0')
          OR LOWER(TRIM(first_name || ' ' || last_name)) = LOWER(clean_id)
          OR LOWER(TRIM(last_name || ' ' || first_name)) = LOWER(clean_id)
      )
    ORDER BY (auth_user_id IS NOT NULL) DESC, person_number ASC
    LIMIT 1;

    -- Falls Mitglied gefunden: PIN prüfen (address_number oder person_number)
    IF m.person_number IS NOT NULL THEN
        IF clean_pin = TRIM(m.address_number)
           OR clean_pin = LPAD(TRIM(m.address_number), 6, '0')
           OR LPAD(clean_pin, 6, '0') = LPAD(TRIM(m.address_number), 6, '0')
           OR clean_pin = m.person_number::TEXT THEN
            
            RETURN jsonb_build_object(
                'success', true,
                'type', 'member',
                'user', jsonb_build_object(
                    'id', LPAD(COALESCE(m.address_number, m.person_number::text), 6, '0'),
                    'lizenz', LPAD(COALESCE(m.address_number, m.person_number::text), 6, '0'),
                    'person_number', m.person_number,
                    'address_number', m.address_number,
                    'vorname', m.first_name,
                    'nachname', m.last_name,
                    'name', TRIM(m.first_name || ' ' || m.last_name),
                    'email', COALESCE(m.primary_email, ''),
                    'role', 'member',
                    'is_board', (ap.id IS NOT NULL)
                )
            );
        END IF;
    END IF;

    -- Falls es ein Vorstand/Admin ist (zur Kennzeichnung für das Client-Passwort-Login):
    IF ap.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_admin', true,
            'email', ap.email,
            'name', ap.display_name,
            'person_number', ap.person_number,
            'role', COALESCE(ap.role_external, 'vorstand')
        );
    END IF;

    IF m.person_number IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN ungültig. Bitte überprüfe deinen 6-stelligen PIN oder fordere einen Code per E-Mail an.');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein Mitglied mit diesem Namen, dieser E-Mail oder Lizenznummer gefunden.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_member_pin(TEXT, TEXT) TO anon, authenticated, service_role;
