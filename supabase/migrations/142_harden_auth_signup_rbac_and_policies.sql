-- ==============================================================================
-- 142_harden_auth_signup_rbac_and_policies.sql
-- Migration: Haertung Auth-Signup, RBAC-Privilege-Escalation, Hooks & Policies
-- Projekt: Vereinsportal Sportschuetzen Muhen
--
-- Behebt die Sicherheitsbefunde vor dem Go-Live (ohne Aenderung der Website-Zugriffs-Policies):
--   1. Blockiert Fremd-Registrierungen (POST /auth/v1/signup & /auth/v1/otp) auf
--      Datenbankebene via BEFORE INSERT Trigger auf auth.users fuer unbekannte E-Mails.
--   2. Schliesst vertikale Privilege Escalation in handle_auth_user_sync,
--      sync_member_auth_session, admin_profiles_admin_write und update_my_profile.
--   3. Entzieht anon & authenticated die Ausfuehrungsrechte auf custom_access_token_hook
--      und haertet toggle_role_permission.
--   4. Beschraenkt poll_views fuer Mitglieder auf INSERT/SELECT (kein fremdes DELETE)
--      und trennt API-Secrets in system_app_configs strikt nach Modul-Berechtigung.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. FREMD-REGISTRIERUNGEN AUF AUTH.USERS BLOCKIEREN
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_known_member_or_admin_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_email TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
BEGIN
    -- Interne Service-Role / Admin-Erstellungen (z.B. via save_admin_profile) zulassen
    IF COALESCE(auth.role(), '') = 'service_role'
       OR current_setting('app.allow_auth_user_insert', true) = 'true'
       OR public.rbac_allows(ARRAY['logins.manage'])
       OR auth.has_role('admin') THEN
        RETURN NEW;
    END IF;

    IF v_clean_email = '' THEN
        RAISE EXCEPTION 'Registrierung abgelehnt: E-Mail-Adresse fehlt.' USING ERRCODE = '42501';
    END IF;

    -- 1. Dedizierte interne PIN-Session-Konten zulassen
    IF v_clean_email ~ '^pin_[0-9]+@pin\.sportschuetzen-muhen\.local$' THEN
        RETURN NEW;
    END IF;

    -- 2. Aktive Vorstands-/Admin-Profile zulassen
    IF EXISTS (
        SELECT 1
        FROM public.admin_profiles ap
        WHERE LOWER(TRIM(ap.email)) = v_clean_email
          AND ap.is_active = true
    ) THEN
        RETURN NEW;
    END IF;

    -- 3. Aktive oder berechtigte Passiv-Mitglieder aus public.members zulassen
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

DROP TRIGGER IF EXISTS trg_enforce_known_member_or_admin_signup ON auth.users;
CREATE TRIGGER trg_enforce_known_member_or_admin_signup
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_known_member_or_admin_signup();

-- ==============================================================================
-- 2. PRIVILEGE ESCALATION SCHLIESSEN (RBAC & ADMIN_PROFILES)
-- ==============================================================================

-- 2.1 handle_auth_user_sync: Keine pauschale 'vorstand'- oder 'admin'-Zuweisung mehr
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
    IF v_clean_email = '' OR v_clean_email ~ '^pin_[0-9]+@pin\.sportschuetzen-muhen\.local$' THEN
        RETURN NEW;
    END IF;

    -- 1. Pruefe ob aktives Admin-Profil in admin_profiles existiert
    SELECT * INTO v_admin
    FROM public.admin_profiles
    WHERE LOWER(TRIM(email)) = v_clean_email
      AND is_active = true
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.admin_profiles
        SET auth_user_id = NEW.id, updated_at = now()
        WHERE id = v_admin.id
          AND (auth_user_id IS NULL OR auth_user_id <> NEW.id);

        -- Nur falls noch KEINE Vorstandsrolle in user_roles hinterlegt ist, eine sichere Basisrolle setzen (niemals automatisch 'admin'!)
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = NEW.id
              AND role <> 'member'::public.app_role
        ) THEN
            v_role := LOWER(TRIM(COALESCE(v_admin.role_external, '')));
            IF v_role NOT IN ('vorstand', 'kassier', 'aktuar', 'schuetzenmeister', 'vermieter', 'jungschuetzenleiter') THEN
                v_role := 'vorstand';
            END IF;

            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, v_role::public.app_role)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- 2. Pruefe ob Mitglied in members existiert
    SELECT person_number INTO v_pn
    FROM public.members
    WHERE LOWER(TRIM(primary_email)) = v_clean_email
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.members
        SET auth_user_id = NEW.id, updated_at = now()
        WHERE person_number = v_pn
          AND (auth_user_id IS NULL OR auth_user_id <> NEW.id);

        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'member'::public.app_role)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_auth_user_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_auth_user_sync() TO postgres, supabase_auth_admin, service_role;

-- 2.2 sync_member_auth_session: Keine automatische Hochstufung auf 'vorstand'/'admin' & kein 'member' fuer Fremde
CREATE OR REPLACE FUNCTION public.sync_member_auth_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_meta_pn TEXT;
    v_pin_pn INTEGER := NULL;
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

    SELECT email, raw_user_meta_data ->> 'person_number'
    INTO v_email, v_meta_pn
    FROM auth.users
    WHERE id = v_user_id;

    IF v_email IS NOT NULL AND v_email ~ '^pin_[0-9]+@pin\.sportschuetzen-muhen\.local$' THEN
        v_pin_pn := substring(v_email from '^pin_([0-9]+)@')::INTEGER;
    ELSIF v_meta_pn IS NOT NULL AND v_meta_pn ~ '^[0-9]+$' THEN
        v_pin_pn := v_meta_pn::INTEGER;
    END IF;

    -- 1. Pruefe Admin-Profil (nur bei echtem Admin-Account, nicht bei PIN-Only-Session)
    IF v_pin_pn IS NULL THEN
        SELECT * INTO v_admin
        FROM public.admin_profiles
        WHERE (auth_user_id = v_user_id OR (v_email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(v_email))))
          AND is_active = true
        LIMIT 1;

        IF FOUND AND (v_admin.auth_user_id IS NULL OR v_admin.auth_user_id <> v_user_id) THEN
            UPDATE public.admin_profiles SET auth_user_id = v_user_id WHERE id = v_admin.id;
        END IF;
    END IF;

    -- 2. Pruefe Mitglied-Profil
    IF v_pin_pn IS NOT NULL THEN
        SELECT * INTO v_member
        FROM public.members
        WHERE person_number = v_pin_pn
        LIMIT 1;
    ELSE
        SELECT * INTO v_member
        FROM public.members
        WHERE auth_user_id = v_user_id
           OR (v_email IS NOT NULL AND LOWER(TRIM(primary_email)) = LOWER(TRIM(v_email)))
        ORDER BY (auth_user_id = v_user_id) DESC, person_number ASC
        LIMIT 1;

        IF FOUND AND v_member.auth_user_id IS NULL THEN
            UPDATE public.members SET auth_user_id = v_user_id WHERE person_number = v_member.person_number;
        END IF;
    END IF;

    -- Sicherheitscheck: Weder Vorstandsprofil noch Vereinsmitglied -> Zugriff verweigern (keine 'member'-Rolle vergeben!)
    IF v_admin.id IS NULL AND v_member.person_number IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Kein aktives Vereins- oder Vorstandsprofil für dieses Konto gefunden.'
        );
    END IF;

    IF v_member.person_number IS NOT NULL THEN
        v_is_passive := COALESCE(v_member.is_passive, false);
    END IF;

    -- 3. Bestehende Rollen aus public.user_roles laden (Single Source of Truth fuer RBAC)
    SELECT ARRAY_AGG(DISTINCT role::text)
    INTO v_roles
    FROM public.user_roles
    WHERE user_id = v_user_id;

    -- Nur falls noch gar keine Rolle existiert:
    IF v_roles IS NULL OR ARRAY_LENGTH(v_roles, 1) IS NULL THEN
        IF v_admin.id IS NOT NULL THEN
            DECLARE
                v_fallback_role TEXT := LOWER(TRIM(COALESCE(v_admin.role_external, '')));
            BEGIN
                IF v_fallback_role NOT IN ('vorstand', 'kassier', 'aktuar', 'schuetzenmeister', 'vermieter', 'jungschuetzenleiter') THEN
                    v_fallback_role := 'vorstand';
                END IF;
                INSERT INTO public.user_roles (user_id, role)
                VALUES (v_user_id, v_fallback_role::public.app_role)
                ON CONFLICT DO NOTHING;
                v_roles := ARRAY[v_fallback_role];
            END;
        ELSIF v_member.person_number IS NOT NULL THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_user_id, 'member'::public.app_role)
            ON CONFLICT DO NOTHING;
            v_roles := ARRAY['member'];
        END IF;
    END IF;

    IF (v_admin.id IS NOT NULL AND v_admin.is_active = true) OR
       ('admin' = ANY(v_roles) OR 'vorstand' = ANY(v_roles) OR 'kassier' = ANY(v_roles) OR 'aktuar' = ANY(v_roles) OR 'schuetzenmeister' = ANY(v_roles) OR 'vermieter' = ANY(v_roles) OR 'jungschuetzenleiter' = ANY(v_roles)) THEN
        v_is_board := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'auth_user_id', v_user_id,
        'email', CASE WHEN v_pin_pn IS NOT NULL THEN COALESCE(v_member.primary_email, '') ELSE v_email END,
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
            WHEN 'jungschuetzenleiter' = ANY(v_roles) THEN 'jungschuetzenleiter'
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

REVOKE ALL ON FUNCTION public.sync_member_auth_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_member_auth_session() TO authenticated, service_role;

-- 2.3 admin_profiles_admin_write: Direkte Tabellen-Mutationen nur fuer logins.manage / admin
-- (Selbst-Bearbeitung der Absender-Adresse laeuft kontrolliert ueber update_my_profile)
DROP POLICY IF EXISTS "admin_profiles_admin_write" ON public.admin_profiles;
CREATE POLICY "admin_profiles_admin_write"
  ON public.admin_profiles FOR ALL
  TO authenticated
  USING (
    auth.has_role('admin'::public.app_role)
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  )
  WITH CHECK (
    auth.has_role('admin'::public.app_role)
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  );

-- 2.4 update_my_profile haerten (nur aktive Profile, kein E-Mail-Hijacking, kein 'admin'-Role-Spoofing)
CREATE OR REPLACE FUNCTION public.update_my_profile(
    p_display_name text DEFAULT NULL,
    p_role_external text DEFAULT NULL,
    p_street text DEFAULT NULL,
    p_zip text DEFAULT NULL,
    p_city text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_person_number integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_profile RECORD;
    v_email TEXT;
    v_new_email TEXT;
    v_new_role_ext TEXT;
    v_is_login_admin BOOLEAN := false;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert');
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

    SELECT * INTO v_profile
    FROM public.admin_profiles
    WHERE (auth_user_id = v_uid OR LOWER(TRIM(email)) = LOWER(TRIM(v_email)))
      AND is_active = true
    LIMIT 1;

    IF v_profile.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Vorstandsprofil für dieses Konto gefunden.');
    END IF;

    v_is_login_admin := (public.rbac_allows(ARRAY['logins.manage']) OR auth.has_role('admin'));

    v_new_email := COALESCE(NULLIF(LOWER(TRIM(p_email)), ''), v_profile.email);
    IF LOWER(TRIM(v_new_email)) <> LOWER(TRIM(v_profile.email)) THEN
        IF EXISTS (
            SELECT 1 FROM public.admin_profiles
            WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_new_email))
              AND id <> v_profile.id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Diese E-Mail-Adresse wird bereits von einem anderen Vorstandsprofil verwendet.');
        END IF;
    END IF;

    v_new_role_ext := COALESCE(TRIM(p_role_external), v_profile.role_external);
    IF NOT v_is_login_admin AND LOWER(TRIM(COALESCE(v_new_role_ext, ''))) = 'admin' THEN
        v_new_role_ext := v_profile.role_external;
    END IF;

    IF v_profile.auth_user_id IS NULL THEN
        UPDATE public.admin_profiles SET auth_user_id = v_uid WHERE id = v_profile.id;
    END IF;

    UPDATE public.admin_profiles
    SET
        display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), v_profile.display_name),
        role_external = v_new_role_ext,
        street = NULLIF(TRIM(p_street), ''),
        zip = NULLIF(TRIM(p_zip), ''),
        city = NULLIF(TRIM(p_city), ''),
        phone = NULLIF(TRIM(p_phone), ''),
        email = v_new_email,
        person_number = CASE
            WHEN v_is_login_admin THEN COALESCE(p_person_number, v_profile.person_number)
            ELSE COALESCE(v_profile.person_number, p_person_number)
        END,
        updated_at = now()
    WHERE id = v_profile.id;

    RETURN jsonb_build_object('success', true, 'message', 'Profil erfolgreich aktualisiert');
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;

-- 2.5 Veraltetes Rollen-Relikt 'materialwart' aus role_permissions entfernen
DELETE FROM public.role_permissions WHERE role::text = 'materialwart';

-- ==============================================================================
-- 3. CUSTOM_ACCESS_TOKEN_HOOK & TOGGLE_ROLE_PERMISSION HAERTEN
-- ==============================================================================
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin, postgres, service_role;

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
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['logins.manage'])
        OR auth.has_role('admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Keine Berechtigung zur Änderung der Rollenmatrix (erfordert Administrator oder logins.manage).');
    END IF;

    IF p_enable THEN
        INSERT INTO public.role_permissions (role, permission, description)
        VALUES (p_role, TRIM(p_permission), p_description)
        ON CONFLICT (role, permission) DO UPDATE
        SET description = COALESCE(EXCLUDED.description, role_permissions.description);
    ELSE
        DELETE FROM public.role_permissions
        WHERE role = p_role AND permission = TRIM(p_permission);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'role', p_role,
        'permission', p_permission,
        'enabled', p_enable
    );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_role_permission(public.app_role, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_role_permission(public.app_role, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 4. POLL_VIEWS & SYSTEM_APP_CONFIGS POLICIES HAERTEN
-- ==============================================================================
DROP POLICY IF EXISTS "poll_views_member_write" ON public.poll_views;
DROP POLICY IF EXISTS "poll_views_member_select" ON public.poll_views;
DROP POLICY IF EXISTS "poll_views_member_insert" ON public.poll_views;

CREATE POLICY "poll_views_member_select"
  ON public.poll_views FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "poll_views_member_insert"
  ON public.poll_views FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "system_app_configs_auth_read" ON public.system_app_configs;
CREATE POLICY "system_app_configs_auth_read"
  ON public.system_app_configs FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN key = 'immich_api_key' THEN
        (SELECT public.rbac_allows(ARRAY['admin']))
      WHEN key = 'onesignal_rest_api_key' THEN
        (SELECT public.rbac_allows(ARRAY['push.manage', 'admin']))
      WHEN key = 'archiv_ai_token' THEN
        (SELECT public.rbac_allows(ARRAY['archiv.view', 'archiv.manage', 'admin']))
      ELSE
        true
    END
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
