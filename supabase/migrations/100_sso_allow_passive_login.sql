-- ==============================================================================
-- 100_sso_allow_passive_login.sql
-- Lebende Passivmitglieder ohne Austrittsdatum duerfen sich im SSO-Login auch
-- dann anmelden, wenn is_active = false ist (z. B. durch SSV-Export IsActive=0).
-- ==============================================================================

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

    -- 2. Check in members (aktive Mitglieder ODER lebende Passivmitglieder ohne Austrittsdatum)
    SELECT m.primary_email, m.auth_user_id, TRIM(m.first_name || ' ' || m.last_name), m.person_number, COALESCE(m.is_passive, false)
    INTO res_email, res_user_id, res_name, res_pn, res_is_passive
    FROM public.members m
    WHERE (
          m.is_active = true
          OR (
              COALESCE(m.is_passive, false) = true
              AND COALESCE(m.deceased, false) = false
              AND (m.club_exit_date IS NULL OR m.club_exit_date > CURRENT_DATE)
          )
      )
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
        IF EXISTS (
            SELECT 1 FROM public.members m
            WHERE LOWER(TRIM(m.primary_email)) = LOWER(clean_id)
              AND NOT (
                  m.is_active = true
                  OR (
                      COALESCE(m.is_passive, false) = true
                      AND COALESCE(m.deceased, false) = false
                      AND (m.club_exit_date IS NULL OR m.club_exit_date > CURRENT_DATE)
                  )
              )
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Dieses Mitgliederkonto ist momentan inaktiv. Bitte kontaktiere den Vorstand.');
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'Diese E-Mail-Adresse ist nicht im Vereinsverzeichnis registriert.');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Mitglied mit diesem Namen, dieser E-Mail oder Lizenznummer gefunden.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role;
