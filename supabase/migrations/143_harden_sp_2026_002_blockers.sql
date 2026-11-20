-- ==============================================================================
-- 143_harden_sp_2026_002_blockers.sql
-- Migration: Behebung aller DB-Blocker aus Sicherheitspruefung SP-2026-002
-- Projekt: Vereinsportal Sportschuetzen Muhen
--
-- Schliesst folgende nachgewiesene Befunde (ohne Architekturumbau):
--   - SEC-011 (P0): Entfernt person_number aus resolve_login_identifier und
--                   entfernt person_number als PIN-Fallback in verify_member_pin.
--   - SEC-012 (P0): Entfernt benutzerbeschreibbares raw_user_meta_data aus
--                   current_member_person_number() & sync_member_auth_session()
--                   (inkl. Fix fuer v_admin-Record-Initialisierung bei PIN-Login).
--   - SEC-013 (P0): Entfernt JWT-OR-Cache aus auth.has_role() &
--                   auth.has_any_permission(); blockiert deaktivierte Admins
--                   (admin_profiles.is_active = false) in RBAC; bereinigt
--                   veraltete raw_app_meta_data.roles & deaktivierte user_roles;
--                   entfernt automatische 'vorstand'-Re-Eskalation in
--                   sync_member_auth_session().
--   - SEC-017 (P1): Entfernt FOR-ALL-Altpolicy auf system_app_configs und
--                   trennt Schreibrechte pro Key-Kategorie; trennt
--                   operatives-storage RLS strikt nach Ordnerpraefix & Modul.
--   - SEC-018 (P1): Sperrt Eskalation von logins.manage auf Superuser 'admin'
--                   und Wildcard '*' in user_roles, save_admin_profile,
--                   delete_admin_profile und toggle_role_permission.
--   - SEC-021 (P2): Globales IP-Rate-Limit & 24h-Cleanup in check_auth_rate_limit,
--                   Sperre rein numerischer 1-7-stelliger IDs in
--                   resolve_login_identifier, Sperre anonymer pin_*-Signups,
--                   Rate-Limit auf log_auth_mail_event.
--   - SEC-022 (P2): Haertung von login_sessions RLS & ping_login_session()
--                   gegen Session-Spoofing.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. SEC-013: DEAKTIVIERUNGS-PRUEFUNG & REINE DB-RBAC (KEIN STALE JWT-OR-CACHE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_deactivated_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_profiles ap
        WHERE ap.auth_user_id = p_uid
          AND ap.is_active = false
    )
    AND NOT EXISTS (
        SELECT 1
        FROM public.admin_profiles ap2
        WHERE ap2.auth_user_id = p_uid
          AND ap2.is_active = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_deactivated_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_deactivated_admin(UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.has_role(required_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT (
        auth.uid() IS NOT NULL
        AND NOT (
            required_role <> 'member'::public.app_role
            AND public.is_deactivated_admin(auth.uid())
        )
        AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND (ur.role = required_role OR ur.role = 'admin'::public.app_role)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.rbac_allows(required_permissions text[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT (
        auth.uid() IS NOT NULL
        AND NOT public.is_deactivated_admin(auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND (
                  ur.role = 'admin'::public.app_role
                  OR EXISTS (
                      SELECT 1
                      FROM public.role_permissions rp
                      WHERE rp.role = ur.role
                        AND (rp.permission = ANY(required_permissions) OR rp.permission = '*')
                  )
              )
        )
    );
$$;

CREATE OR REPLACE FUNCTION auth.has_any_permission(required_permissions text[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT public.rbac_allows(required_permissions);
$$;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL OR public.is_deactivated_admin(auth.uid()) THEN ARRAY[]::text[]
        WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
        ) THEN ARRAY['*']::text[]
        ELSE COALESCE((
            SELECT array_agg(DISTINCT rp.permission::text ORDER BY rp.permission::text)
            FROM public.user_roles ur
            JOIN public.role_permissions rp ON rp.role = ur.role
            WHERE ur.user_id = auth.uid()
        ), ARRAY[]::text[])
    END;
$$;

-- Einmalige Bereinigung veralteter JWT-App-Metadata & deaktivierter Board-Rollen auf CT 117
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'roles' - 'permissions',
    updated_at = now()
WHERE raw_app_meta_data ? 'roles'
   OR raw_app_meta_data ? 'permissions';

DELETE FROM public.user_roles ur
WHERE ur.role <> 'member'::public.app_role
  AND public.is_deactivated_admin(ur.user_id);

-- ==============================================================================
-- 2. SEC-012: IDENTITAET OHNE BENUTZERBESCHREIBBARES raw_user_meta_data
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.current_member_person_number()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_pn INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    -- Ausschliesslich unveraenderliche serverseitige E-Mail / DB-Zuordnung nutzen (NIEMALS raw_user_meta_data!)
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = v_uid;

    IF v_email IS NOT NULL AND v_email ~ '^pin_[0-9]+@pin\.sportschuetzen-muhen\.local$' THEN
        RETURN substring(v_email from '^pin_([0-9]+)@')::INTEGER;
    END IF;

    SELECT m.person_number INTO v_pn
    FROM public.members m
    WHERE m.auth_user_id = v_uid
       OR (v_email IS NOT NULL AND LOWER(TRIM(m.primary_email)) = LOWER(TRIM(v_email)))
    ORDER BY (m.auth_user_id = v_uid) DESC, m.person_number ASC
    LIMIT 1;

    IF v_pn IS NOT NULL THEN
        RETURN v_pn;
    END IF;

    SELECT ap.person_number INTO v_pn
    FROM public.admin_profiles ap
    WHERE ap.is_active = true
      AND (
          ap.auth_user_id = v_uid
          OR (v_email IS NOT NULL AND LOWER(TRIM(ap.email)) = LOWER(TRIM(v_email)))
      )
    LIMIT 1;

    RETURN v_pn;
END;
$$;

REVOKE ALL ON FUNCTION public.current_member_person_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_person_number() TO authenticated, service_role;

-- sync_member_auth_session: Kein raw_user_meta_data, keine Auto-Re-Eskalation auf 'vorstand', sauber initialisierte Records
CREATE OR REPLACE FUNCTION public.sync_member_auth_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_pin_pn INTEGER := NULL;
    v_member public.members%ROWTYPE;
    v_has_member BOOLEAN := false;
    v_admin public.admin_profiles%ROWTYPE;
    v_has_admin BOOLEAN := false;
    v_roles TEXT[];
    v_is_board BOOLEAN := false;
    v_is_passive BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert.');
    END IF;

    -- Ausschliesslich auth.users.email auswerten (NIEMALS raw_user_meta_data!)
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = v_user_id;

    IF v_email IS NOT NULL AND v_email ~ '^pin_[0-9]+@pin\.sportschuetzen-muhen\.local$' THEN
        v_pin_pn := substring(v_email from '^pin_([0-9]+)@')::INTEGER;
    END IF;

    -- 1. Aktives Admin-Profil pruefen (nur bei Nicht-PIN-Sitzung)
    IF v_pin_pn IS NULL THEN
        SELECT * INTO v_admin
        FROM public.admin_profiles
        WHERE (auth_user_id = v_user_id OR (v_email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(v_email))))
          AND is_active = true
        LIMIT 1;

        IF FOUND THEN
            v_has_admin := true;
            IF v_admin.auth_user_id IS NULL OR v_admin.auth_user_id <> v_user_id THEN
                UPDATE public.admin_profiles SET auth_user_id = v_user_id WHERE id = v_admin.id;
            END IF;
        END IF;
    END IF;

    -- 2. Mitglied-Profil pruefen
    IF v_pin_pn IS NOT NULL THEN
        SELECT * INTO v_member
        FROM public.members
        WHERE person_number = v_pin_pn
        LIMIT 1;
        v_has_member := FOUND;
    ELSE
        SELECT * INTO v_member
        FROM public.members
        WHERE auth_user_id = v_user_id
           OR (v_email IS NOT NULL AND LOWER(TRIM(primary_email)) = LOWER(TRIM(v_email)))
        ORDER BY (auth_user_id = v_user_id) DESC, person_number ASC
        LIMIT 1;

        IF FOUND THEN
            v_has_member := true;
            IF v_member.auth_user_id IS NULL THEN
                UPDATE public.members SET auth_user_id = v_user_id WHERE person_number = v_member.person_number;
            END IF;
        END IF;
    END IF;

    IF NOT v_has_admin AND NOT v_has_member THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Kein aktives Vereins- oder Vorstandsprofil für dieses Konto gefunden.'
        );
    END IF;

    IF v_has_member THEN
        v_is_passive := COALESCE(v_member.is_passive, false);
    END IF;

    -- 3. Bestehende Rollen aus public.user_roles laden (Single Source of Truth)
    -- WICHTIG (SEC-013): Keine automatische Wiedervergabe entzogener Vorstandsrollen!
    SELECT ARRAY_AGG(DISTINCT role::text)
    INTO v_roles
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND NOT (role <> 'member'::public.app_role AND public.is_deactivated_admin(v_user_id));

    -- Ausschliesslich die Basis-Mitgliederrolle 'member' setzen, falls noch gar keine Rolle existiert und ein echtes Mitglied vorliegt
    IF (v_roles IS NULL OR ARRAY_LENGTH(v_roles, 1) IS NULL) AND v_has_member THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'member'::public.app_role)
        ON CONFLICT DO NOTHING;
        v_roles := ARRAY['member'];
    END IF;

    v_roles := COALESCE(v_roles, ARRAY[]::text[]);

    IF (
        NOT public.is_deactivated_admin(v_user_id)
        AND (
            'admin' = ANY(v_roles) OR 'vorstand' = ANY(v_roles) OR 'kassier' = ANY(v_roles)
            OR 'aktuar' = ANY(v_roles) OR 'schuetzenmeister' = ANY(v_roles)
            OR 'vermieter' = ANY(v_roles) OR 'jungschuetzenleiter' = ANY(v_roles)
        )
    ) THEN
        v_is_board := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'auth_user_id', v_user_id,
        'email', CASE WHEN v_pin_pn IS NOT NULL THEN COALESCE(v_member.primary_email, '') ELSE COALESCE(v_email, '') END,
        'is_board', v_is_board,
        'is_passive', v_is_passive,
        'personenkreis', CASE WHEN v_is_passive THEN 'passiv' ELSE 'aktiv' END,
        'roles', v_roles,
        'primary_role', CASE
            WHEN 'admin' = ANY(v_roles) THEN 'admin'
            WHEN 'kassier' = ANY(v_roles) THEN 'kassier'
            WHEN 'aktuar' = ANY(v_roles) THEN 'aktuar'
            WHEN 'schuetzenmeister' = ANY(v_roles) THEN 'schuetzenmeister'
            WHEN 'vermieter' = ANY(v_roles) THEN 'vermieter'
            WHEN 'jungschuetzenleiter' = ANY(v_roles) THEN 'jungschuetzenleiter'
            WHEN 'vorstand' = ANY(v_roles) THEN 'vorstand'
            WHEN 'member' = ANY(v_roles) THEN 'member'
            ELSE 'none'
        END,
        'display_name', COALESCE(
            CASE WHEN v_has_admin THEN v_admin.display_name ELSE NULL END,
            CASE WHEN v_has_member THEN TRIM(COALESCE(v_member.first_name, '') || ' ' || COALESCE(v_member.last_name, '')) ELSE NULL END,
            v_email
        ),
        'firstname', COALESCE(
            CASE WHEN v_has_member THEN v_member.first_name ELSE NULL END,
            CASE WHEN v_has_admin THEN split_part(COALESCE(v_admin.display_name, ''), ' ', 1) ELSE '' END
        ),
        'lastname', COALESCE(
            CASE WHEN v_has_member THEN v_member.last_name ELSE NULL END,
            CASE WHEN v_has_admin THEN split_part(COALESCE(v_admin.display_name, ''), ' ', 2) ELSE '' END
        ),
        'person_number', COALESCE(
            CASE WHEN v_has_member THEN v_member.person_number ELSE NULL END,
            CASE WHEN v_has_admin THEN v_admin.person_number ELSE NULL END
        ),
        'address_number', CASE WHEN v_has_member THEN v_member.address_number ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_member_auth_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_member_auth_session() TO authenticated, service_role;

-- ==============================================================================
-- 3. SEC-021: RATE-LIMITING (GLOBAL PRO IP + CLEANUP) & SIGNUP-TRIGGER-HAERTUNG
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(
    p_action TEXT,
    p_identifier TEXT DEFAULT '',
    p_max_attempts INTEGER DEFAULT 8,
    p_window_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_headers JSONB := '{}'::jsonb;
    v_ip TEXT := 'unknown';
    v_key TEXT;
    v_ip_key TEXT;
    v_rec RECORD;
    v_now TIMESTAMPTZ := now();
    v_global_max INTEGER := GREATEST(p_max_attempts * 3, 25);
BEGIN
    BEGIN
        v_headers := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb;
        v_ip := COALESCE(
            NULLIF(btrim(v_headers ->> 'cf-connecting-ip'), ''),
            NULLIF(btrim(split_part(COALESCE(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
            NULLIF(btrim(v_headers ->> 'x-real-ip'), ''),
            'unknown'
        );
    EXCEPTION WHEN OTHERS THEN
        v_ip := 'unknown';
    END;

    -- Opportunistisches Cleanup abgelaufener Eintraege (> 24h) gegen unbegrenztes Tabellenwachstum
    DELETE FROM public.auth_rate_limits
    WHERE updated_at < (v_now - INTERVAL '24 hours');

    -- 1. Globales IP-weites Rate-Limit ueber alle Identifier hinweg (verhindert Namens-/Nummern-Enumeration)
    v_ip_key := LOWER(v_ip || ':*');
    SELECT * INTO v_rec
    FROM public.auth_rate_limits
    WHERE client_key = v_ip_key AND action = (p_action || ':ip')
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.auth_rate_limits (client_key, action, attempt_count, window_start, updated_at)
        VALUES (v_ip_key, p_action || ':ip', 1, v_now, v_now);
    ELSE
        IF v_rec.blocked_until IS NOT NULL AND v_rec.blocked_until > v_now THEN
            RETURN FALSE;
        END IF;

        IF v_rec.window_start + make_interval(mins => p_window_minutes) < v_now THEN
            UPDATE public.auth_rate_limits
            SET attempt_count = 1, window_start = v_now, blocked_until = NULL, updated_at = v_now
            WHERE id = v_rec.id;
        ELSIF v_rec.attempt_count + 1 > v_global_max THEN
            UPDATE public.auth_rate_limits
            SET attempt_count = v_rec.attempt_count + 1,
                blocked_until = v_now + make_interval(mins => p_window_minutes),
                updated_at = v_now
            WHERE id = v_rec.id;
            RETURN FALSE;
        ELSE
            UPDATE public.auth_rate_limits
            SET attempt_count = v_rec.attempt_count + 1, updated_at = v_now
            WHERE id = v_rec.id;
        END IF;
    END IF;

    -- 2. Spezifisches Rate-Limit pro (IP, Identifier)
    v_key := LOWER(v_ip || ':' || COALESCE(LEFT(btrim(p_identifier), 80), ''));

    SELECT * INTO v_rec
    FROM public.auth_rate_limits
    WHERE client_key = v_key AND action = p_action
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.auth_rate_limits (client_key, action, attempt_count, window_start, updated_at)
        VALUES (v_key, p_action, 1, v_now, v_now);
        RETURN TRUE;
    END IF;

    IF v_rec.blocked_until IS NOT NULL AND v_rec.blocked_until > v_now THEN
        RETURN FALSE;
    END IF;

    IF v_rec.window_start + make_interval(mins => p_window_minutes) < v_now THEN
        UPDATE public.auth_rate_limits
        SET attempt_count = 1,
            window_start = v_now,
            blocked_until = NULL,
            updated_at = v_now
        WHERE id = v_rec.id;
        RETURN TRUE;
    END IF;

    IF v_rec.attempt_count + 1 > p_max_attempts THEN
        UPDATE public.auth_rate_limits
        SET attempt_count = v_rec.attempt_count + 1,
            blocked_until = v_now + make_interval(mins => p_window_minutes),
            updated_at = v_now
        WHERE id = v_rec.id;
        RETURN FALSE;
    END IF;

    UPDATE public.auth_rate_limits
    SET attempt_count = v_rec.attempt_count + 1,
        updated_at = v_now
    WHERE id = v_rec.id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- enforce_known_member_or_admin_signup: anonyme pin_*-Signups sperren (nur intern via verify_member_pin erlaubt)
CREATE OR REPLACE FUNCTION public.enforce_known_member_or_admin_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_email TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
BEGIN
    IF COALESCE(auth.role(), '') = 'service_role'
       OR current_setting('app.allow_auth_user_insert', true) = 'true'
       OR public.rbac_allows(ARRAY['logins.manage'])
       OR auth.has_role('admin'::public.app_role) THEN
        RETURN NEW;
    END IF;

    IF v_clean_email = '' THEN
        RAISE EXCEPTION 'Registrierung abgelehnt: E-Mail-Adresse fehlt.' USING ERRCODE = '42501';
    END IF;

    -- Interne PIN-Konten duerfen niemals ueber oeffentliches /auth/v1/signup angelegt werden
    IF v_clean_email ~ '^pin_[0-9]+@pin\.sportschuetzen-muhen\.local$' THEN
        RAISE EXCEPTION 'Registrierung abgelehnt: Interne PIN-Konten werden ausschliesslich serverseitig verwaltet.' USING ERRCODE = '42501';
    END IF;

    -- 1. Aktive Vorstands-/Admin-Profile zulassen
    IF EXISTS (
        SELECT 1
        FROM public.admin_profiles ap
        WHERE LOWER(TRIM(ap.email)) = v_clean_email
          AND ap.is_active = true
    ) THEN
        RETURN NEW;
    END IF;

    -- 2. Aktive oder berechtigte Passiv-Mitglieder aus public.members zulassen
    IF EXISTS (
        SELECT 1
        FROM public.members m
        WHERE LOWER(TRIM(COALESCE(m.primary_email, ''))) = v_clean_email
          AND (
              m.is_active = true
              OR (
                  COALESCE(m.is_passive, false) = true
                  AND COALESCE(m.deceased, false) = false
                  AND (m.club_exit_date IS NULL OR m.club_exit_date > CURRENT_DATE)
              )
          )
    ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Registrierung abgelehnt: Diese E-Mail-Adresse ist keinem aktiven Vereinsmitglied zugeordnet.' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_known_member_or_admin_signup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_known_member_or_admin_signup() TO postgres, supabase_auth_admin, service_role;

-- ==============================================================================
-- 4. SEC-011: ANON-KONTOUEBERNAHME IN verify_member_pin & resolve_login_identifier SCHLIESSEN
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.verify_member_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    clean_id TEXT;
    clean_pin TEXT;
    m RECORD;
    ap RECORD;
    v_pin_email TEXT;
    v_pin_uid UUID;
    v_addr_nr TEXT;
BEGIN
    clean_id := REGEXP_REPLACE(TRIM(COALESCE(p_identifier, '')), '\s+', ' ', 'g');
    clean_id := REGEXP_REPLACE(clean_id, '[,;]+', ' ', 'g');
    clean_id := TRIM(clean_id);
    clean_pin := TRIM(COALESCE(p_pin, ''));

    IF clean_id = '' OR clean_pin = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen Namen und deinen 6-stelligen PIN oder dein Passwort eingeben.');
    END IF;

    -- Rate-Limit pruefen (max. 10 Versuche pro 15 Minuten je Identifier + globales IP-Limit)
    IF NOT public.check_auth_rate_limit('verify_member_pin', clean_id, 10, 15) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Zu viele Anmeldeversuche. Bitte warte 15 Minuten oder nutze die Anmeldung per E-Mail-Code.'
        );
    END IF;

    -- 1. Pruefen, ob Identifier einem aktiven Admin-Konto entspricht (Vorstand)
    SELECT * INTO ap
    FROM public.admin_profiles
    WHERE is_active = true
      AND (
          LOWER(username) = LOWER(clean_id)
          OR LOWER(email) = LOWER(clean_id)
          OR LOWER(TRIM(display_name)) = LOWER(clean_id)
          OR LOWER(REGEXP_REPLACE(TRIM(display_name), '^(\S+)\s+(\S+)$', '\2 \1')) = LOWER(clean_id)
      )
    LIMIT 1;

    -- 2. Mitglied in public.members suchen (nur ueber Name oder E-Mail, KEINE reine Nummer als Identifier!)
    IF clean_id !~ '^[0-9]+$' AND LOWER(clean_id) <> LOWER(clean_pin) THEN
        SELECT * INTO m
        FROM public.members
        WHERE (
              is_active = true
              OR (
                  COALESCE(is_passive, false) = true
                  AND COALESCE(deceased, false) = false
                  AND (club_exit_date IS NULL OR club_exit_date > CURRENT_DATE)
              )
          )
          AND (
              LOWER(TRIM(COALESCE(primary_email, ''))) = LOWER(clean_id)
              OR LOWER(TRIM(first_name || ' ' || last_name)) = LOWER(clean_id)
              OR LOWER(TRIM(last_name || ' ' || first_name)) = LOWER(clean_id)
          )
        ORDER BY (auth_user_id IS NOT NULL) DESC, person_number ASC
        LIMIT 1;
    END IF;

    -- WICHTIG (SEC-011): Ausschliesslich 6-stellige address_number als PIN akzeptieren (NIEMALS person_number!)
    IF m.person_number IS NOT NULL THEN
        v_addr_nr := TRIM(COALESCE(m.address_number, ''));
        IF v_addr_nr <> ''
           AND (
               clean_pin = v_addr_nr
               OR clean_pin = LPAD(v_addr_nr, 6, '0')
               OR (clean_pin ~ '^[0-9]{1,6}$' AND LPAD(clean_pin, 6, '0') = LPAD(v_addr_nr, 6, '0'))
           ) THEN

            v_pin_email := 'pin_' || m.person_number::text || '@pin.sportschuetzen-muhen.local';
            SELECT id INTO v_pin_uid FROM auth.users WHERE LOWER(email) = v_pin_email LIMIT 1;

            IF v_pin_uid IS NULL THEN
                v_pin_uid := gen_random_uuid();
                PERFORM set_config('app.allow_auth_user_insert', 'true', true);
                INSERT INTO auth.users (
                    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                    confirmation_token, recovery_token, email_change_token_new, email_change
                ) VALUES (
                    '00000000-0000-0000-0000-000000000000', v_pin_uid, 'authenticated', 'authenticated',
                    v_pin_email, extensions.crypt(clean_pin, extensions.gen_salt('bf', 8)), now(),
                    '{"provider":"email","providers":["email"]}'::jsonb,
                    jsonb_build_object('name', TRIM(m.first_name || ' ' || m.last_name)),
                    now(), now(), '', '', '', ''
                );

                INSERT INTO auth.identities (
                    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
                ) VALUES (
                    v_pin_uid::text, v_pin_uid,
                    jsonb_build_object('sub', v_pin_uid::text, 'email', v_pin_email),
                    'email', now(), now(), now()
                )
                ON CONFLICT (provider_id, provider) DO UPDATE SET
                    identity_data = EXCLUDED.identity_data,
                    updated_at = now();

                INSERT INTO public.user_roles (user_id, role)
                VALUES (v_pin_uid, 'member'::public.app_role)
                ON CONFLICT DO NOTHING;
            ELSE
                UPDATE auth.users
                SET encrypted_password = extensions.crypt(clean_pin, extensions.gen_salt('bf', 8)),
                    email_confirmed_at = COALESCE(email_confirmed_at, now()),
                    raw_user_meta_data = jsonb_build_object('name', TRIM(m.first_name || ' ' || m.last_name)),
                    updated_at = now()
                WHERE id = v_pin_uid;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'type', 'member',
                'pin_auth_email', v_pin_email,
                'user', jsonb_build_object(
                    'id', LPAD(v_addr_nr, 6, '0'),
                    'lizenz', LPAD(v_addr_nr, 6, '0'),
                    'person_number', m.person_number,
                    'address_number', v_addr_nr,
                    'vorname', m.first_name,
                    'nachname', m.last_name,
                    'name', TRIM(m.first_name || ' ' || m.last_name),
                    'role', 'member',
                    'is_board', false,
                    'is_passive', COALESCE(m.is_passive, false),
                    'personenkreis', CASE WHEN COALESCE(m.is_passive, false) THEN 'passiv' ELSE 'aktiv' END
                )
            );
        END IF;
    END IF;

    -- Falls es ein Vorstand/Admin ist (zur Weiterleitung an signInWithPassword):
    IF ap.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_admin', true,
            'email', ap.email,
            'name', ap.display_name,
            'role', COALESCE(ap.role_external, 'vorstand')
        );
    END IF;

    IF m.person_number IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN ungültig. Bitte überprüfe deinen 6-stelligen PIN oder fordere einen Code per E-Mail an.');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Mitglied mit diesem Namen oder dieser E-Mail gefunden. Bitte gib deinen vollständigen Namen (Vorname Nachname) ein.');
END;
$$;

REVOKE ALL ON FUNCTION public.verify_member_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_member_pin(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    clean_id TEXT;
    res_email TEXT;
    res_name TEXT;
    res_pn INTEGER;
    res_is_passive BOOLEAN := false;
BEGIN
    clean_id := REGEXP_REPLACE(TRIM(COALESCE(p_identifier, '')), '\s+', ' ', 'g');
    clean_id := REGEXP_REPLACE(clean_id, '[,;]+', ' ', 'g');
    clean_id := TRIM(clean_id);

    IF clean_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen Namen oder deine E-Mail-Adresse eingeben.');
    END IF;

    IF NOT public.check_auth_rate_limit('resolve_login_identifier', clean_id, 10, 15) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Zu viele Anfragen. Bitte warte 15 Minuten und versuche es danach erneut.'
        );
    END IF;

    -- SEC-011 / SEC-021: Rein numerische Identifier (1..7 Ziffern, inkl. 6-stelliger PINs) abweisen!
    IF clean_id ~ '^[0-9]{1,7}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen vollständigen Namen (Vorname Nachname) oder deine E-Mail-Adresse eingeben.');
    END IF;

    -- 1. Check in admin_profiles (ohne person_number herauszugeben!)
    SELECT ap.email, ap.display_name, ap.person_number
    INTO res_email, res_name, res_pn
    FROM public.admin_profiles ap
    WHERE ap.is_active = true
      AND (
          LOWER(ap.username) = LOWER(clean_id)
          OR LOWER(ap.email) = LOWER(clean_id)
          OR LOWER(TRIM(ap.display_name)) = LOWER(clean_id)
          OR LOWER(REGEXP_REPLACE(TRIM(ap.display_name), '^(\S+)\s+(\S+)$', '\2 \1')) = LOWER(clean_id)
      )
    LIMIT 1;

    IF FOUND AND res_email IS NOT NULL AND TRIM(res_email) <> '' THEN
        IF res_pn IS NOT NULL THEN
            SELECT COALESCE(is_passive, false) INTO res_is_passive FROM public.members WHERE person_number = res_pn;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'email', LOWER(TRIM(res_email)),
            'name', res_name,
            'type', 'admin',
            'is_passive', COALESCE(res_is_passive, false),
            'personenkreis', CASE WHEN COALESCE(res_is_passive, false) THEN 'passiv' ELSE 'aktiv' END
        );
    END IF;

    -- 2. Check in members (nur ueber Name oder E-Mail, KEINE address_number/person_number-Suche, KEIN person_number-Leak!)
    SELECT m.primary_email, TRIM(m.first_name || ' ' || m.last_name), COALESCE(m.is_passive, false)
    INTO res_email, res_name, res_is_passive
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
          OR LOWER(TRIM(m.first_name || ' ' || m.last_name)) = LOWER(clean_id)
          OR LOWER(TRIM(m.last_name || ' ' || m.first_name)) = LOWER(clean_id)
      )
    ORDER BY (m.auth_user_id IS NOT NULL) DESC, m.person_number ASC
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
            'is_passive', COALESCE(res_is_passive, false),
            'personenkreis', CASE WHEN COALESCE(res_is_passive, false) THEN 'passiv' ELSE 'aktiv' END
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Mitglied mit diesem Namen oder dieser E-Mail gefunden.');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_identifier(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role;

-- SEC-021: Rate-Limit auf log_auth_mail_event fuer anonyme Aufrufe
CREATE OR REPLACE FUNCTION public.log_auth_mail_event(
    p_event_type text,
    p_recipient_email character varying,
    p_recipient_name character varying DEFAULT NULL::character varying,
    p_record_id character varying DEFAULT NULL::character varying
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_module_ref  VARCHAR(50);
    v_subject     VARCHAR(500);
    v_snippet     TEXT;
    v_created_by  VARCHAR(100);
    v_id          UUID;
BEGIN
    v_clean_email := LOWER(TRIM(COALESCE(p_recipient_email, '')));
    IF v_clean_email = '' OR position('@' IN v_clean_email) = 0 THEN
        RAISE EXCEPTION 'Ungueltige Anfrage.';
    END IF;

    IF auth.uid() IS NULL THEN
        IF NOT public.check_auth_rate_limit('log_auth_mail_event', v_clean_email, 5, 15) THEN
            RAISE EXCEPTION 'Zu viele Anfragen. Bitte warte kurz.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_event_type IN ('pwd_reset', 'magic_link') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.admin_profiles ap
            WHERE LOWER(TRIM(ap.email)) = v_clean_email
              AND ap.is_active = true
        ) THEN
            RETURN NULL; -- Kein E-Mail-Orakel fuer anon!
        END IF;

        v_module_ref := 'auth';
        v_created_by := 'vorstand_auth';
        IF p_event_type = 'pwd_reset' THEN
            v_subject := 'Passwort zurücksetzen | Vorstandsportal Sportschützen Muhen';
            v_snippet := 'Passwort-Reset-Link angefordert via Supabase Auth';
        ELSE
            v_subject := 'Anmelde-Link (Magic Link) | Vorstandsportal Sportschützen Muhen';
            v_snippet := 'Einmalklick-Anmelde-Link angefordert via Supabase Auth';
        END IF;

    ELSIF p_event_type = 'invite' THEN
        IF NOT (public.rbac_allows(ARRAY['logins.manage']) OR auth.has_role('admin'::public.app_role)) THEN
            RAISE EXCEPTION 'Keine Berechtigung fuer Einladungs-Audit.' USING ERRCODE = '42501';
        END IF;

        v_module_ref := 'logins';
        v_created_by := COALESCE(auth.uid()::text, 'admin');
        v_subject := 'Aktivierung Vorstand-Zugang / Passwort setzen (Supabase Auth)';
        v_snippet := 'Aktivierungs-Link gesendet via Supabase Auth';
    ELSE
        RAISE EXCEPTION 'Unbekannter Event-Typ.';
    END IF;

    INSERT INTO public.mail_logs (
        module_ref, record_id, recipient_email, recipient_name,
        subject, body_snippet, status, sender_email, sender_name,
        sent_via, created_by
    ) VALUES (
        v_module_ref, p_record_id, v_clean_email, p_recipient_name,
        v_subject, v_snippet, 'gesendet', 'info@sportschuetzen-muhen.ch', 'Sportschützen Muhen',
        'Supabase_GoTrue_SMTP', v_created_by
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_auth_mail_event(TEXT, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth_mail_event(TEXT, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. SEC-017: system_app_configs & operatives-storage STRIKT TRENNEN
-- ==============================================================================
DROP POLICY IF EXISTS "Admins can manage system app configs" ON public.system_app_configs;
DROP POLICY IF EXISTS "system_app_configs_rbac_insert" ON public.system_app_configs;
DROP POLICY IF EXISTS "system_app_configs_rbac_update" ON public.system_app_configs;
DROP POLICY IF EXISTS "system_app_configs_rbac_delete" ON public.system_app_configs;

-- Schreibrechte auf system_app_configs getrennt nach Schluessel (KEIN FOR ALL, ueberschreibt SELECT nicht!)
CREATE POLICY "system_app_configs_rbac_insert"
  ON public.system_app_configs FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN key = 'immich_api_key' THEN auth.has_role('admin'::public.app_role)
      WHEN key IN ('onesignal_app_id', 'onesignal_rest_api_key') THEN (SELECT public.rbac_allows(ARRAY['push.manage', 'admin']))
      WHEN key IN ('archiv_ai_endpoint', 'archiv_ai_model', 'archiv_ai_token') THEN (SELECT public.rbac_allows(ARRAY['archiv.manage', 'admin']))
      WHEN key IN ('active_festkasse_event_id', 'festkasse_printer_cert', 'member_schichtplan_enabled', 'member_festkasse_enabled') THEN (SELECT public.rbac_allows(ARRAY['anlaesse.manage', 'admin']))
      ELSE auth.has_role('admin'::public.app_role)
    END
  );

CREATE POLICY "system_app_configs_rbac_update"
  ON public.system_app_configs FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN key = 'immich_api_key' THEN auth.has_role('admin'::public.app_role)
      WHEN key IN ('onesignal_app_id', 'onesignal_rest_api_key') THEN (SELECT public.rbac_allows(ARRAY['push.manage', 'admin']))
      WHEN key IN ('archiv_ai_endpoint', 'archiv_ai_model', 'archiv_ai_token') THEN (SELECT public.rbac_allows(ARRAY['archiv.manage', 'admin']))
      WHEN key IN ('active_festkasse_event_id', 'festkasse_printer_cert', 'member_schichtplan_enabled', 'member_festkasse_enabled') THEN (SELECT public.rbac_allows(ARRAY['anlaesse.manage', 'admin']))
      ELSE auth.has_role('admin'::public.app_role)
    END
  )
  WITH CHECK (
    CASE
      WHEN key = 'immich_api_key' THEN auth.has_role('admin'::public.app_role)
      WHEN key IN ('onesignal_app_id', 'onesignal_rest_api_key') THEN (SELECT public.rbac_allows(ARRAY['push.manage', 'admin']))
      WHEN key IN ('archiv_ai_endpoint', 'archiv_ai_model', 'archiv_ai_token') THEN (SELECT public.rbac_allows(ARRAY['archiv.manage', 'admin']))
      WHEN key IN ('active_festkasse_event_id', 'festkasse_printer_cert', 'member_schichtplan_enabled', 'member_festkasse_enabled') THEN (SELECT public.rbac_allows(ARRAY['anlaesse.manage', 'admin']))
      ELSE auth.has_role('admin'::public.app_role)
    END
  );

CREATE POLICY "system_app_configs_rbac_delete"
  ON public.system_app_configs FOR DELETE
  TO authenticated
  USING (auth.has_role('admin'::public.app_role));

-- operatives-storage: strikte Trennung nach Ordnerpraefix & Fachmodul
DROP POLICY IF EXISTS "operatives_storage_rbac_select" ON storage.objects;
DROP POLICY IF EXISTS "operatives_storage_rbac_write" ON storage.objects;

CREATE POLICY "operatives_storage_rbac_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'operatives-storage'
    AND (
      name LIKE 'avatars/%'
      OR name = 'assets/logo.png'
      OR ((name LIKE 'invoices/%' OR name LIKE 'archive/%/invoices/%') AND (SELECT public.rbac_invoicing_read()))
      OR ((name LIKE 'contracts/%' OR name LIKE 'archive/%/contracts/%') AND (SELECT public.rbac_allows(ARRAY['vermietung.view', 'vermietung.manage', 'rechnungen.view', 'rechnungen.manage', 'buchhaltung.view', 'buchhaltung.manage', 'admin'])))
      OR ((name LIKE 'gv/%' OR name LIKE 'gv-dossiers/%' OR name LIKE 'archive/%/gv/%') AND (SELECT public.rbac_allows(ARRAY['gv.view', 'gv.manage', 'admin'])))
      OR ((name LIKE 'letters/%' OR name LIKE 'archive/%/letters/%') AND (SELECT public.rbac_allows(ARRAY['mail.view', 'mail.manage', 'dokumente.view', 'dokumente.manage', 'admin'])))
      OR ((name LIKE 'endschiessen/%' OR name LIKE 'archive/%/endschiessen/%') AND (SELECT public.rbac_allows(ARRAY['endschiessen.view', 'endschiessen.manage', 'admin'])))
      OR (name LIKE 'event-documents/%' AND (SELECT public.rbac_allows(ARRAY['anlaesse.view', 'anlaesse.manage', 'umfragen.view', 'umfragen.manage', 'admin'])))
      OR auth.has_role('admin'::public.app_role)
    )
  );

CREATE POLICY "operatives_storage_rbac_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'operatives-storage'
    AND (
      (name LIKE 'avatars/%' AND (SELECT public.rbac_allows(ARRAY['members.manage', 'logins.manage', 'admin'])))
      OR ((name LIKE 'invoices/%' OR name LIKE 'archive/%/invoices/%') AND (SELECT public.rbac_invoicing_write()))
      OR ((name LIKE 'contracts/%' OR name LIKE 'archive/%/contracts/%') AND (SELECT public.rbac_allows(ARRAY['vermietung.manage', 'rechnungen.manage', 'admin'])))
      OR ((name LIKE 'gv/%' OR name LIKE 'gv-dossiers/%' OR name LIKE 'archive/%/gv/%') AND (SELECT public.rbac_allows(ARRAY['gv.manage', 'admin'])))
      OR ((name LIKE 'letters/%' OR name LIKE 'archive/%/letters/%') AND (SELECT public.rbac_allows(ARRAY['mail.manage', 'dokumente.manage', 'admin'])))
      OR ((name LIKE 'endschiessen/%' OR name LIKE 'archive/%/endschiessen/%') AND (SELECT public.rbac_allows(ARRAY['endschiessen.manage', 'admin'])))
      OR (name LIKE 'event-documents/%' AND (SELECT public.rbac_allows(ARRAY['anlaesse.manage', 'umfragen.manage', 'admin'])))
      OR auth.has_role('admin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'operatives-storage'
    AND (
      (name LIKE 'avatars/%' AND (SELECT public.rbac_allows(ARRAY['members.manage', 'logins.manage', 'admin'])))
      OR ((name LIKE 'invoices/%' OR name LIKE 'archive/%/invoices/%') AND (SELECT public.rbac_invoicing_write()))
      OR ((name LIKE 'contracts/%' OR name LIKE 'archive/%/contracts/%') AND (SELECT public.rbac_allows(ARRAY['vermietung.manage', 'rechnungen.manage', 'admin'])))
      OR ((name LIKE 'gv/%' OR name LIKE 'gv-dossiers/%' OR name LIKE 'archive/%/gv/%') AND (SELECT public.rbac_allows(ARRAY['gv.manage', 'admin'])))
      OR ((name LIKE 'letters/%' OR name LIKE 'archive/%/letters/%') AND (SELECT public.rbac_allows(ARRAY['mail.manage', 'dokumente.manage', 'admin'])))
      OR ((name LIKE 'endschiessen/%' OR name LIKE 'archive/%/endschiessen/%') AND (SELECT public.rbac_allows(ARRAY['endschiessen.manage', 'admin'])))
      OR (name LIKE 'event-documents/%' AND (SELECT public.rbac_allows(ARRAY['anlaesse.manage', 'umfragen.manage', 'admin'])))
      OR auth.has_role('admin'::public.app_role)
    )
  );

-- ==============================================================================
-- 6. SEC-018: ESKALATION logins.manage -> SUPERUSER 'admin' & WILDCARD '*' SPERREN
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.user_has_admin_role(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p_uid
          AND ur.role = 'admin'::public.app_role
    );
$$;

REVOKE ALL ON FUNCTION public.user_has_admin_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_admin_role(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "user_roles_write_policy" ON public.user_roles;
CREATE POLICY "user_roles_write_policy"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    auth.has_role('admin'::public.app_role)
    OR (
      (SELECT public.rbac_allows(ARRAY['logins.manage']))
      AND role <> 'admin'::public.app_role
      AND NOT public.user_has_admin_role(user_roles.user_id)
    )
  )
  WITH CHECK (
    auth.has_role('admin'::public.app_role)
    OR (
      (SELECT public.rbac_allows(ARRAY['logins.manage']))
      AND role <> 'admin'::public.app_role
      AND NOT public.user_has_admin_role(user_roles.user_id)
    )
  );

CREATE OR REPLACE FUNCTION public.save_admin_profile(
    p_username text,
    p_display_name text,
    p_email text,
    p_role_external text DEFAULT NULL::text,
    p_person_number integer DEFAULT NULL::integer,
    p_roles text[] DEFAULT ARRAY['vorstand'::text],
    p_password text DEFAULT NULL::text,
    p_admin_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_admin_id UUID := p_admin_id;
    v_auth_uid UUID := NULL;
    v_existing_uid UUID := NULL;
    v_valid_pn INTEGER := NULL;
    v_is_superadmin BOOLEAN := false;
    r_role TEXT;
    clean_email TEXT;
    clean_username TEXT;
BEGIN
    v_is_superadmin := (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR auth.has_role('admin'::public.app_role)
    );

    IF NOT (v_is_superadmin OR public.rbac_allows(ARRAY['logins.manage'])) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Verwalten von Admin-Profilen (logins.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    clean_email := LOWER(TRIM(p_email));
    clean_username := TRIM(p_username);

    IF clean_username = '' THEN
        RAISE EXCEPTION 'Benutzername darf nicht leer sein.';
    END IF;

    SELECT id INTO v_auth_uid FROM auth.users WHERE LOWER(email) = clean_email LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
        SELECT auth_user_id INTO v_existing_uid FROM public.admin_profiles WHERE id = v_admin_id;
    END IF;

    -- SEC-018: Nicht-Superadmins duerfen weder die Rolle 'admin' vergeben noch bestehende 'admin'-Konten mutieren/Passwoerter setzen!
    IF NOT v_is_superadmin THEN
        IF p_roles IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(p_roles) AS r WHERE LOWER(TRIM(r)) = 'admin'
        ) THEN
            RAISE EXCEPTION 'Nur System-Administratoren (admin) dürfen die Superuser-Rolle admin zuweisen.' USING ERRCODE = '42501';
        END IF;

        IF (v_auth_uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_auth_uid AND role = 'admin'::public.app_role))
           OR (v_existing_uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_existing_uid AND role = 'admin'::public.app_role)) THEN
            RAISE EXCEPTION 'Nur System-Administratoren (admin) dürfen Superuser-Konten bearbeiten.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_person_number IS NOT NULL AND p_person_number > 0 THEN
        IF EXISTS (SELECT 1 FROM public.members WHERE person_number = p_person_number) THEN
            v_valid_pn := p_person_number;
        ELSE
            v_valid_pn := NULL;
        END IF;
    END IF;

    IF p_password IS NOT NULL AND length(trim(p_password)) >= 6 THEN
        IF v_auth_uid IS NULL THEN
            v_auth_uid := gen_random_uuid();
            PERFORM set_config('app.allow_auth_user_insert', 'true', true);
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                confirmation_token, recovery_token, email_change_token_new, email_change
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_auth_uid, 'authenticated', 'authenticated',
                clean_email, extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)), now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('name', TRIM(p_display_name)),
                now(), now(), '', '', '', ''
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
            UPDATE auth.users
            SET encrypted_password = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                raw_user_meta_data = jsonb_build_object('name', TRIM(p_display_name)),
                updated_at = now()
            WHERE id = v_auth_uid;

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

    IF v_admin_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_admin_id) THEN
            RAISE EXCEPTION 'Admin-Profil mit ID % wurde nicht gefunden.', v_admin_id;
        END IF;

        IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE LOWER(username) = LOWER(clean_username) AND id <> v_admin_id) THEN
            RAISE EXCEPTION 'Der Benutzername "%" ist bereits vergeben.', clean_username;
        END IF;

        IF v_auth_uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.admin_profiles WHERE auth_user_id = v_auth_uid AND id <> v_admin_id) THEN
            RAISE EXCEPTION 'Die E-Mail-Adresse bzw. Auth-ID "%" ist bereits mit einem anderen Profil verknüpft.', clean_email;
        END IF;

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
        IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE LOWER(username) = LOWER(clean_username)) THEN
            RAISE EXCEPTION 'Der Benutzername "%" ist bereits vergeben.', clean_username;
        END IF;

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

    IF v_auth_uid IS NOT NULL AND p_roles IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_auth_uid;
        FOREACH r_role IN ARRAY p_roles LOOP
            BEGIN
                IF NOT v_is_superadmin AND LOWER(TRIM(r_role)) = 'admin' THEN
                    CONTINUE;
                END IF;
                INSERT INTO public.user_roles (user_id, role)
                VALUES (v_auth_uid, TRIM(r_role)::public.app_role)
                ON CONFLICT (user_id, role) DO NOTHING;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END LOOP;

        -- Veraltete JWT-Rollen-Caches im Auth-Datensatz mit bereinigen
        UPDATE auth.users
        SET raw_app_meta_data = raw_app_meta_data - 'roles' - 'permissions'
        WHERE id = v_auth_uid
          AND (raw_app_meta_data ? 'roles' OR raw_app_meta_data ? 'permissions');
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

REVOKE ALL ON FUNCTION public.save_admin_profile(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT[], TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_profile(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT[], TEXT, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_admin_profile(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_auth_uid UUID;
    v_is_superadmin BOOLEAN := false;
BEGIN
    v_is_superadmin := (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR auth.has_role('admin'::public.app_role)
    );

    IF NOT (v_is_superadmin OR public.rbac_allows(ARRAY['logins.manage'])) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Löschen von Admin-Profilen (logins.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    SELECT auth_user_id INTO v_auth_uid FROM public.admin_profiles WHERE username = p_username;

    IF NOT v_is_superadmin AND v_auth_uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = v_auth_uid AND role = 'admin'::public.app_role
    ) THEN
        RAISE EXCEPTION 'Nur System-Administratoren (admin) dürfen Superuser-Konten löschen.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.admin_profiles WHERE username = p_username;

    IF v_auth_uid IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_auth_uid AND role <> 'member'::public.app_role;
        UPDATE auth.users
        SET raw_app_meta_data = raw_app_meta_data - 'roles' - 'permissions'
        WHERE id = v_auth_uid;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Admin-Profil gelöscht');
END;
$$;

REVOKE ALL ON FUNCTION public.delete_admin_profile(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_admin_profile(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.toggle_role_permission(
    p_role public.app_role,
    p_permission text,
    p_enable boolean,
    p_description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_is_superadmin BOOLEAN := false;
    v_clean_perm TEXT := TRIM(COALESCE(p_permission, ''));
BEGIN
    v_is_superadmin := (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR auth.has_role('admin'::public.app_role)
    );

    IF NOT (v_is_superadmin OR public.rbac_allows(ARRAY['logins.manage'])) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Keine Berechtigung zur Änderung der Rollenmatrix (erfordert Administrator oder logins.manage).');
    END IF;

    -- SEC-018: Wildcard '*' und Rolle 'admin' exklusiv fuer Superuser 'admin' schuetzen
    IF NOT v_is_superadmin AND (p_role = 'admin'::public.app_role OR v_clean_perm = '*' OR v_clean_perm = 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nur System-Administratoren (admin) dürfen Superuser- oder Wildcard-Berechtigungen ändern.');
    END IF;

    IF p_enable THEN
        INSERT INTO public.role_permissions (role, permission, description)
        VALUES (p_role, v_clean_perm, p_description)
        ON CONFLICT (role, permission) DO UPDATE
        SET description = COALESCE(EXCLUDED.description, role_permissions.description);
    ELSE
        DELETE FROM public.role_permissions
        WHERE role = p_role AND permission = v_clean_perm;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'role', p_role,
        'permission', v_clean_perm,
        'enabled', p_enable
    );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_role_permission(public.app_role, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_role_permission(public.app_role, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 7. SEC-022: login_sessions RLS & ping_login_session GEGEN SPOOFING HAERTEN
-- ==============================================================================
DROP POLICY IF EXISTS "login_sessions_auth_insert" ON public.login_sessions;
CREATE POLICY "login_sessions_auth_insert"
  ON public.login_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  );

DROP POLICY IF EXISTS "login_sessions_auth_update" ON public.login_sessions;
CREATE POLICY "login_sessions_auth_update"
  ON public.login_sessions FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  );

CREATE OR REPLACE FUNCTION public.ping_login_session(
    p_session_id text,
    p_username text,
    p_role text DEFAULT 'vorstand'::text,
    p_device text DEFAULT 'Browser'::text,
    p_ip text DEFAULT 'unbekannt'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    now_ts TIMESTAMPTZ := now();
    sess_id_val TEXT := COALESCE(NULLIF(TRIM(p_session_id), ''), 'sess_' || COALESCE(auth.uid()::text, 'default'));
    user_name_val TEXT := COALESCE(NULLIF(TRIM(p_username), ''), 'Gast');
    active_users jsonb;
    existing_sess RECORD;
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert');
    END IF;

    -- Nur eigene Session (oder logins.manage/admin) aktualisieren!
    SELECT id, login_time, user_id INTO existing_sess
    FROM public.login_sessions
    WHERE session_id = sess_id_val
    LIMIT 1;

    IF existing_sess.id IS NOT NULL THEN
        IF existing_sess.user_id IS DISTINCT FROM auth.uid()
           AND NOT public.rbac_allows(ARRAY['logins.manage', 'admin']) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Fremde Session darf nicht aktualisiert werden');
        END IF;

        UPDATE public.login_sessions
        SET last_seen = now_ts,
            duration_sec = GREATEST(0, EXTRACT(EPOCH FROM (now_ts - existing_sess.login_time))::INTEGER),
            is_online = true,
            username = user_name_val,
            role = COALESCE(p_role, role)
        WHERE id = existing_sess.id;
    ELSE
        INSERT INTO public.login_sessions (
            session_id, user_id, username, role, login_time, last_seen, duration_sec, ip_address, user_agent, is_online
        ) VALUES (
            sess_id_val, auth.uid(), user_name_val, COALESCE(p_role, 'vorstand'), now_ts, now_ts, 0, p_ip, p_device, true
        );
    END IF;

    UPDATE public.login_sessions
    SET is_online = false
    WHERE is_online = true AND last_seen < (now_ts - INTERVAL '3 minutes');

    IF public.rbac_allows(ARRAY['logins.view', 'logins.manage', 'vorstand.view']) OR auth.has_role('admin'::public.app_role) THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'session_id', session_id,
            'username', username,
            'role', role,
            'last_seen', last_seen,
            'duration_sec', duration_sec
        )), '[]'::jsonb)
        INTO active_users
        FROM public.login_sessions
        WHERE is_online = true AND last_seen >= (now_ts - INTERVAL '3 minutes');
    ELSE
        active_users := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_object('success', true, 'active_users', active_users);
END;
$$;

REVOKE ALL ON FUNCTION public.ping_login_session(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ping_login_session(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
