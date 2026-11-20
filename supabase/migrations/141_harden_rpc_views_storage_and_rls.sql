-- ==============================================================================
-- 141_harden_rpc_views_storage_and_rls.sql
-- Migration: Vollstaendige Sicherheits-Haertung Datenbank, RPCs, Views & Storage
-- Projekt: Vereinsportal Sportschuetzen Muhen
--
-- Schliesst alle verbleibenden externen Angriffsflaechen (anon / PUBLIC):
--   1. Entzieht anon & PUBLIC alle pauschalen Tabellen-, View- und Sequenz-Grants
--      (inkl. TRUNCATE/DELETE/UPDATE/INSERT) und vergibt nur minimale Spalten-/
--      Lese-Rechte fuer explizit oeffentliche Website-Daten (ohne Lizenz-/PIN-Spalten).
--   2. Setzt alle Views auf security_invoker = on und sperrt interne Views
--      (v_event_controlling, v_gv_praesenz_summary, v_contest_team_summary,
--      invoice_layouts) fuer anon.
--   3. Entfernt alle verbliebenen offenen anon/public/true-Policies auf
--      admin_profiles, login_sessions, group_competitions*, member_participations,
--      poll_*, contest_*, jm_*, push_subscriptions, role_permissions,
--      website_contact_messages, rental_settings und document_templates.
--   4. Setzt alle Storage-Buckets (inkl. operatives-storage, campaign-assets,
--      email-templates) auf privat (public = false) mit strikten RLS-Policies.
--   5. Haertet saemtliche SECURITY DEFINER RPCs (save_admin_profile,
--      delete_admin_profile, record_invoice_payment, next_invoice_number,
--      get_member_open_invoices, get_member_pendenzen_count,
--      ensure_rental_proforma_invoice, update_invoice_pdf,
--      update_rental_contract_pdf, sync_jm_to_contest_mannschaft,
--      sync_logins_from_members, create_event_from_template,
--      get_push_audience_stats, get_system_mail*, ping_login_session,
--      verify_bank_ingest_secret, register_member_for_shift,
--      cancel_member_shift_assignment) durch interne Auth-/RBAC-Checks und
--      REVOKE EXECUTE FROM PUBLIC, anon.
--   6. Haertet verify_member_pin & resolve_login_identifier mit DB-Rate-Limiting,
--      Sperre numerischer Identifier-Enumeration und automatischer Provisionierung
--      einer kryptografisch signierten GoTrue-Session fuer PIN-Logins.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. RATE-LIMITING INFRASTRUKTUR FUER AUTH-RPCS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    action TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_auth_rate_limits_key_action UNIQUE (client_key, action)
);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.auth_rate_limits TO service_role;

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
    v_rec RECORD;
    v_now TIMESTAMPTZ := now();
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

-- ==============================================================================
-- 2. HILFSFUNKTION: PRUEFT OB AKTUELLER AUTH-USER ZU EINER MITGLIEDS-LIZENZ GEHOERT
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
    v_meta_pn TEXT;
    v_pn INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT email, raw_user_meta_data ->> 'person_number'
    INTO v_email, v_meta_pn
    FROM auth.users
    WHERE id = v_uid;

    IF v_meta_pn IS NOT NULL AND v_meta_pn ~ '^[0-9]+$' THEN
        RETURN v_meta_pn::INTEGER;
    END IF;

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
    WHERE ap.auth_user_id = v_uid
       OR (v_email IS NOT NULL AND LOWER(TRIM(ap.email)) = LOWER(TRIM(v_email)))
    LIMIT 1;

    RETURN v_pn;
END;
$$;

REVOKE ALL ON FUNCTION public.current_member_person_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_person_number() TO authenticated, service_role;

-- ==============================================================================
-- 3. STORAGE BUCKETS PRIVATISIEREN & RLS HAERTEN
-- ==============================================================================
UPDATE storage.buckets
SET public = false
WHERE id IN (
    'operatives-storage',
    'campaign-assets',
    'email-templates',
    'club-documents',
    'jm-ranglisten',
    'vereins-dokumente'
);

DROP POLICY IF EXISTS "Public Read campaign-assets" ON storage.objects;
DROP POLICY IF EXISTS "campaign_assets_rbac_select" ON storage.objects;

CREATE POLICY "campaign_assets_rbac_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'campaign-assets'
    AND (SELECT public.rbac_allows(ARRAY[
      'mail.view', 'mail.manage',
      'gv.view', 'gv.manage',
      'dokumente.view', 'dokumente.manage',
      'archiv.view', 'archiv.manage',
      'vorstand.view', 'admin'
    ]))
  );

CREATE OR REPLACE FUNCTION public.can_read_own_invoice_pdf(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices inv
    JOIN public.members m
      ON m.person_number = (SELECT public.current_member_person_number())
    WHERE p_object_name LIKE 'invoices/%'
      AND (
        inv.pdf_storage_path = p_object_name
        OR (inv.pdf_url IS NOT NULL AND position(p_object_name in inv.pdf_url) > 0)
      )
      AND (
        inv.person_number = m.person_number::text
        OR inv.person_number = LPAD(m.person_number::text, 6, '0')
        OR (m.address_number IS NOT NULL AND (inv.person_number = m.address_number OR inv.person_number = LPAD(m.address_number, 6, '0')))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_own_invoice_pdf(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_own_invoice_pdf(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "operatives_storage_public_avatars_read" ON storage.objects;
CREATE POLICY "operatives_storage_public_avatars_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'operatives-storage'
    AND name LIKE 'avatars/%'
  );

DROP POLICY IF EXISTS "operatives_storage_member_own_invoice_read" ON storage.objects;
CREATE POLICY "operatives_storage_member_own_invoice_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'operatives-storage'
    AND name LIKE 'invoices/%'
    AND public.can_read_own_invoice_pdf(name)
  );

-- ==============================================================================
-- 4. VIEWS AUF SECURITY_INVOKER SETZEN & ANON-ZUGRIFF AUF INTERNE VIEWS SPERREN
-- ==============================================================================
ALTER VIEW IF EXISTS public.v_event_controlling SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_gv_praesenz_summary SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_contest_team_summary SET (security_invoker = on);
ALTER VIEW IF EXISTS public.invoice_layouts SET (security_invoker = on);

-- ==============================================================================
-- 5. RLS-POLICIES BEREINIGEN & HAERTEN
-- ==============================================================================

-- 5.1 public.admin_profiles (kein anonymer PII-Abruf!)
DROP POLICY IF EXISTS "admin_profiles_read_all" ON public.admin_profiles;
DROP POLICY IF EXISTS "admin_profiles_rbac_select" ON public.admin_profiles;
DROP POLICY IF EXISTS "admin_profiles_admin_write" ON public.admin_profiles;

CREATE POLICY "admin_profiles_rbac_select"
  ON public.admin_profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR auth.has_role('admin'::public.app_role)
    OR auth.has_role('vorstand'::public.app_role)
    OR (SELECT public.rbac_allows(ARRAY[
      'logins.view', 'logins.manage',
      'vorstand.view', 'vorstand.manage',
      'rechnungen.view', 'rechnungen.manage',
      'jahresbeitrag.view', 'jahresbeitrag.manage',
      'vermietung.view', 'vermietung.manage',
      'gv.view', 'gv.manage',
      'mail.view', 'mail.manage',
      'members.view', 'members.manage',
      'admin'
    ]))
  );

CREATE POLICY "admin_profiles_admin_write"
  ON public.admin_profiles FOR ALL
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR auth.has_role('admin'::public.app_role)
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  )
  WITH CHECK (
    auth.uid() = auth_user_id
    OR auth.has_role('admin'::public.app_role)
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  );

-- 5.2 public.login_sessions (kein anonymer IP-/User-Agent-Leak!)
DROP POLICY IF EXISTS "login_sessions_read_all" ON public.login_sessions;
DROP POLICY IF EXISTS "login_sessions_insert_all" ON public.login_sessions;
DROP POLICY IF EXISTS "login_sessions_update_all" ON public.login_sessions;
DROP POLICY IF EXISTS "login_sessions_rbac_select" ON public.login_sessions;
DROP POLICY IF EXISTS "login_sessions_auth_insert" ON public.login_sessions;
DROP POLICY IF EXISTS "login_sessions_auth_update" ON public.login_sessions;
DROP POLICY IF EXISTS "login_sessions_rbac_delete" ON public.login_sessions;

CREATE POLICY "login_sessions_rbac_select"
  ON public.login_sessions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT public.rbac_allows(ARRAY['logins.view', 'logins.manage', 'admin']))
  );

CREATE POLICY "login_sessions_auth_insert"
  ON public.login_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "login_sessions_auth_update"
  ON public.login_sessions FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IS NULL
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IS NULL
    OR (SELECT public.rbac_allows(ARRAY['logins.manage', 'admin']))
  );

CREATE POLICY "login_sessions_rbac_delete"
  ON public.login_sessions FOR DELETE
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY['logins.manage', 'admin'])));

-- 5.3 public.contest_results, contest_setups, contest_teams, contest_ocr_logs
DROP POLICY IF EXISTS "Authenticated can read contest_ocr_logs" ON public.contest_ocr_logs;
DROP POLICY IF EXISTS "Authorized roles can manage contest_ocr_logs" ON public.contest_ocr_logs;
DROP POLICY IF EXISTS "contest_ocr_logs_member_insert" ON public.contest_ocr_logs;

CREATE POLICY "contest_ocr_logs_member_insert"
  ON public.contest_ocr_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    contest_type = 'standblatt'
    OR (SELECT public.rbac_allows(ARRAY['resultate.manage', 'jahresmeisterschaft.manage']))
  );

DROP POLICY IF EXISTS "Authorized roles can manage contest_results" ON public.contest_results;
DROP POLICY IF EXISTS "Public and Members can read contest_results" ON public.contest_results;
DROP POLICY IF EXISTS "contest_results_public_select" ON public.contest_results;

CREATE POLICY "contest_results_public_select"
  ON public.contest_results FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authorized roles can manage contest_setups" ON public.contest_setups;
DROP POLICY IF EXISTS "Public and Members can read contest_setups" ON public.contest_setups;
DROP POLICY IF EXISTS "Authorized roles can manage contest_teams" ON public.contest_teams;
DROP POLICY IF EXISTS "Public and Members can read contest_teams" ON public.contest_teams;

-- 5.4 public.jm_seasons, jm_shooters, jm_competitions, jm_competition_files, jm_competitions_catalog
DROP POLICY IF EXISTS "jm_seasons_insert_auth" ON public.jm_seasons;
DROP POLICY IF EXISTS "jm_seasons_update_auth" ON public.jm_seasons;
DROP POLICY IF EXISTS "jm_seasons_delete_auth" ON public.jm_seasons;

DROP POLICY IF EXISTS "jm_shooters_insert_auth" ON public.jm_shooters;
DROP POLICY IF EXISTS "jm_shooters_update_auth" ON public.jm_shooters;
DROP POLICY IF EXISTS "jm_shooters_delete_auth" ON public.jm_shooters;

DROP POLICY IF EXISTS "jm_competitions_select_all" ON public.jm_competitions;
DROP POLICY IF EXISTS "jm_competitions_insert_auth" ON public.jm_competitions;
DROP POLICY IF EXISTS "jm_competitions_update_auth" ON public.jm_competitions;
DROP POLICY IF EXISTS "jm_competitions_delete_auth" ON public.jm_competitions;

DROP POLICY IF EXISTS "jm_comp_files_select" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_insert" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_update" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_delete" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_rbac_select" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_rbac_write" ON public.jm_competition_files;

CREATE POLICY "jm_comp_files_rbac_select"
  ON public.jm_competition_files FOR SELECT
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.view', 'jahresmeisterschaft.manage',
    'resultate.view', 'resultate.manage',
    'jahresbeitrag.view', 'jahresbeitrag.manage',
    'rechnungen.view', 'rechnungen.manage',
    'admin'
  ])));

CREATE POLICY "jm_comp_files_rbac_write"
  ON public.jm_competition_files FOR ALL
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY['jahresmeisterschaft.manage', 'resultate.manage', 'admin'])))
  WITH CHECK ((SELECT public.rbac_allows(ARRAY['jahresmeisterschaft.manage', 'resultate.manage', 'admin'])));

DROP POLICY IF EXISTS "jm_catalog_select" ON public.jm_competitions_catalog;
DROP POLICY IF EXISTS "jm_catalog_insert" ON public.jm_competitions_catalog;
DROP POLICY IF EXISTS "jm_catalog_update" ON public.jm_competitions_catalog;
DROP POLICY IF EXISTS "jm_catalog_delete" ON public.jm_competitions_catalog;
DROP POLICY IF EXISTS "jm_catalog_rbac_select" ON public.jm_competitions_catalog;
DROP POLICY IF EXISTS "jm_catalog_rbac_write" ON public.jm_competitions_catalog;

CREATE POLICY "jm_catalog_rbac_select"
  ON public.jm_competitions_catalog FOR SELECT
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.view', 'jahresmeisterschaft.manage',
    'resultate.view', 'resultate.manage',
    'jahresbeitrag.view', 'jahresbeitrag.manage',
    'admin'
  ])));

CREATE POLICY "jm_catalog_rbac_write"
  ON public.jm_competitions_catalog FOR ALL
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY['jahresmeisterschaft.manage', 'resultate.manage', 'admin'])))
  WITH CHECK ((SELECT public.rbac_allows(ARRAY['jahresmeisterschaft.manage', 'resultate.manage', 'admin'])));

-- 5.5 public.group_competitions & group_competition_members (enthaelt IBAN & Auszahlungen!)
DROP POLICY IF EXISTS "group_comp_select" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_insert" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_update" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_delete" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_rbac_select" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_rbac_write" ON public.group_competitions;

CREATE POLICY "group_comp_rbac_select"
  ON public.group_competitions FOR SELECT
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.view', 'jahresmeisterschaft.manage',
    'jahresbeitrag.view', 'jahresbeitrag.manage',
    'buchhaltung.view', 'buchhaltung.manage',
    'rechnungen.view', 'rechnungen.manage',
    'resultate.view', 'resultate.manage',
    'admin'
  ])));

CREATE POLICY "group_comp_rbac_write"
  ON public.group_competitions FOR ALL
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.manage',
    'jahresbeitrag.manage',
    'buchhaltung.manage',
    'rechnungen.manage',
    'admin'
  ])))
  WITH CHECK ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.manage',
    'jahresbeitrag.manage',
    'buchhaltung.manage',
    'rechnungen.manage',
    'admin'
  ])));

DROP POLICY IF EXISTS "group_comp_members_select" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_insert" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_update" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_delete" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_rbac_select" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_rbac_write" ON public.group_competition_members;

CREATE POLICY "group_comp_members_rbac_select"
  ON public.group_competition_members FOR SELECT
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.view', 'jahresmeisterschaft.manage',
    'jahresbeitrag.view', 'jahresbeitrag.manage',
    'buchhaltung.view', 'buchhaltung.manage',
    'rechnungen.view', 'rechnungen.manage',
    'resultate.view', 'resultate.manage',
    'admin'
  ])));

CREATE POLICY "group_comp_members_rbac_write"
  ON public.group_competition_members FOR ALL
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.manage',
    'jahresbeitrag.manage',
    'buchhaltung.manage',
    'rechnungen.manage',
    'admin'
  ])))
  WITH CHECK ((SELECT public.rbac_allows(ARRAY[
    'jahresmeisterschaft.manage',
    'jahresbeitrag.manage',
    'buchhaltung.manage',
    'rechnungen.manage',
    'admin'
  ])));

-- 5.6 public.member_participations
DROP POLICY IF EXISTS "member_participations_anon_all" ON public.member_participations;
DROP POLICY IF EXISTS "member_participations_select" ON public.member_participations;

-- 5.7 public.poll_events, poll_responses, poll_responses_log, poll_views (kein anon-Zugriff!)
DROP POLICY IF EXISTS "poll_events_anon_all" ON public.poll_events;
DROP POLICY IF EXISTS "poll_events_anon_read" ON public.poll_events;
DROP POLICY IF EXISTS "poll_events_member_select" ON public.poll_events;

CREATE POLICY "poll_events_member_select"
  ON public.poll_events FOR SELECT
  TO authenticated
  USING (
    aktiv = true
    OR (SELECT public.rbac_allows(ARRAY['umfragen.view', 'umfragen.manage']))
  );

DROP POLICY IF EXISTS "poll_responses_anon_all" ON public.poll_responses;
DROP POLICY IF EXISTS "poll_responses_member_select" ON public.poll_responses;
DROP POLICY IF EXISTS "poll_responses_member_write" ON public.poll_responses;

CREATE POLICY "poll_responses_member_select"
  ON public.poll_responses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "poll_responses_member_write"
  ON public.poll_responses FOR ALL
  TO authenticated
  USING (
    (SELECT public.rbac_allows(ARRAY['umfragen.manage']))
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.person_number = (SELECT public.current_member_person_number())
        AND (
          poll_responses.lizenz = m.person_number::text
          OR poll_responses.lizenz = LPAD(m.person_number::text, 6, '0')
          OR (m.address_number IS NOT NULL AND (poll_responses.lizenz = m.address_number OR poll_responses.lizenz = LPAD(m.address_number, 6, '0')))
        )
    )
  )
  WITH CHECK (
    (SELECT public.rbac_allows(ARRAY['umfragen.manage']))
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.person_number = (SELECT public.current_member_person_number())
        AND (
          poll_responses.lizenz = m.person_number::text
          OR poll_responses.lizenz = LPAD(m.person_number::text, 6, '0')
          OR (m.address_number IS NOT NULL AND (poll_responses.lizenz = m.address_number OR poll_responses.lizenz = LPAD(m.address_number, 6, '0')))
        )
    )
  );

DROP POLICY IF EXISTS "poll_responses_log_anon_all" ON public.poll_responses_log;
DROP POLICY IF EXISTS "poll_responses_log_member_insert" ON public.poll_responses_log;

CREATE POLICY "poll_responses_log_member_insert"
  ON public.poll_responses_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "poll_views_anon_all" ON public.poll_views;
DROP POLICY IF EXISTS "poll_views_member_write" ON public.poll_views;

CREATE POLICY "poll_views_member_write"
  ON public.poll_views FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5.8 public.push_subscriptions
DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_upsert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_rbac_select" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_auth_upsert" ON public.push_subscriptions;

CREATE POLICY "push_subscriptions_rbac_select"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (
    person_number = (SELECT public.current_member_person_number())
    OR (SELECT public.rbac_allows(ARRAY['push.view', 'push.manage', 'admin']))
  );

CREATE POLICY "push_subscriptions_auth_upsert"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (
    person_number = (SELECT public.current_member_person_number())
    OR (SELECT public.rbac_allows(ARRAY['push.manage', 'admin']))
  )
  WITH CHECK (
    person_number = (SELECT public.current_member_person_number())
    OR (SELECT public.rbac_allows(ARRAY['push.manage', 'admin']))
  );

-- 5.9 public.role_permissions
DROP POLICY IF EXISTS "role_permissions_read_all" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_auth_read" ON public.role_permissions;

CREATE POLICY "role_permissions_auth_read"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- 5.10 public.website_contact_messages
DROP POLICY IF EXISTS "website_contact_auth_select" ON public.website_contact_messages;
DROP POLICY IF EXISTS "website_contact_auth_manage" ON public.website_contact_messages;
DROP POLICY IF EXISTS "website_contact_rbac_select" ON public.website_contact_messages;
DROP POLICY IF EXISTS "website_contact_rbac_write" ON public.website_contact_messages;

CREATE POLICY "website_contact_rbac_select"
  ON public.website_contact_messages FOR SELECT
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'mail.view', 'mail.manage',
    'system-mails.view', 'system-mails.manage',
    'vorstand.view', 'vorstand.manage',
    'admin'
  ])));

CREATE POLICY "website_contact_rbac_write"
  ON public.website_contact_messages FOR ALL
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY[
    'mail.manage',
    'system-mails.manage',
    'vorstand.manage',
    'admin'
  ])))
  WITH CHECK ((SELECT public.rbac_allows(ARRAY[
    'mail.manage',
    'system-mails.manage',
    'vorstand.manage',
    'admin'
  ])));

-- 5.10b public.system_app_configs (immich_api_key nur fuer service_role / admin)
DROP POLICY IF EXISTS "system_app_configs_auth_read" ON public.system_app_configs;
CREATE POLICY "system_app_configs_auth_read"
  ON public.system_app_configs FOR SELECT
  TO authenticated
  USING (
    key NOT IN ('onesignal_rest_api_key', 'archiv_ai_token', 'immich_api_key')
    OR (SELECT public.rbac_allows(ARRAY['archiv.view', 'archiv.manage', 'dokumente.view', 'dokumente.manage', 'mail.manage', 'vorstand.view', 'admin']))
  );

-- 5.11 public.rental_settings & public.rental_pricing & public.document_templates
DROP POLICY IF EXISTS "rental_pricing_anon_read" ON public.rental_pricing;
DROP POLICY IF EXISTS "rental_settings_anon_read" ON public.rental_settings;
DROP POLICY IF EXISTS "rental_settings_public_read" ON public.rental_settings;

CREATE POLICY "rental_settings_public_read"
  ON public.rental_settings FOR SELECT
  TO anon
  USING (
    setting_key IN (
      'club_name',
      'club_email',
      'rental_cc_emails',
      'sender_first_name',
      'sender_last_name',
      'sender_phone',
      'wirtschaft_name',
      'wirtschaft_phone',
      'wirtschaft_email',
      'payment_due_days',
      'rental_object',
      'logo_url'
    )
  );

DROP POLICY IF EXISTS "doc_templates_anon_read" ON public.document_templates;
CREATE POLICY "doc_templates_anon_read"
  ON public.document_templates FOR SELECT
  TO anon, authenticated
  USING (
    code IN (
      'vm_vertrag',
      'vm_anfrage',
      'vm_anfrage_intern',
      'vm_storno_alarm',
      'jm_standblatt_eingereicht'
    )
  );

-- 5.12 Legacy Inventar-Policies bereinigen (RBAC-Policies bestehen bereits)
DROP POLICY IF EXISTS "inventory_audit_log_all_auth" ON public.inventory_audit_log;
DROP POLICY IF EXISTS "inventory_config_all_auth" ON public.inventory_config;
DROP POLICY IF EXISTS "inventory_deposits_all_auth" ON public.inventory_deposits;
DROP POLICY IF EXISTS "inventory_transactions_all_auth" ON public.inventory_transactions;

-- ==============================================================================
-- 6. SECURITY DEFINER RPCS HAERTEN (INTERNE RBAC-CHECKS & REVOKE VON ANON)
-- ==============================================================================

-- 6.1 save_admin_profile
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
    v_valid_pn INTEGER := NULL;
    r_role TEXT;
    clean_email TEXT;
    clean_username TEXT;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['logins.manage'])
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Verwalten von Admin-Profilen (logins.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    clean_email := LOWER(TRIM(p_email));
    clean_username := TRIM(p_username);

    IF clean_username = '' THEN
        RAISE EXCEPTION 'Benutzername darf nicht leer sein.';
    END IF;

    IF p_person_number IS NOT NULL AND p_person_number > 0 THEN
        IF EXISTS (SELECT 1 FROM public.members WHERE person_number = p_person_number) THEN
            v_valid_pn := p_person_number;
        ELSE
            v_valid_pn := NULL;
        END IF;
    END IF;

    SELECT id INTO v_auth_uid
    FROM auth.users
    WHERE LOWER(email) = clean_email
    LIMIT 1;

    IF p_password IS NOT NULL AND length(trim(p_password)) >= 6 THEN
        IF v_auth_uid IS NULL THEN
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

        IF EXISTS (
            SELECT 1 FROM public.admin_profiles
            WHERE LOWER(username) = LOWER(clean_username)
              AND id <> v_admin_id
        ) THEN
            RAISE EXCEPTION 'Der Benutzername "%" ist bereits vergeben.', clean_username;
        END IF;

        IF v_auth_uid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.admin_profiles
            WHERE auth_user_id = v_auth_uid
              AND id <> v_admin_id
        ) THEN
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

REVOKE ALL ON FUNCTION public.save_admin_profile(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT[], TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_profile(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT[], TEXT, UUID) TO authenticated, service_role;

-- 6.2 delete_admin_profile
CREATE OR REPLACE FUNCTION public.delete_admin_profile(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_auth_uid UUID;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['logins.manage'])
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Löschen von Admin-Profilen (logins.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    SELECT auth_user_id INTO v_auth_uid FROM public.admin_profiles WHERE username = p_username;

    DELETE FROM public.admin_profiles WHERE username = p_username;

    IF v_auth_uid IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_auth_uid;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Admin-Profil gelöscht');
END;
$$;

REVOKE ALL ON FUNCTION public.delete_admin_profile(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_admin_profile(TEXT) TO authenticated, service_role;

-- 6.3 record_invoice_payment & next_invoice_number
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_prefix character varying DEFAULT 'RE'::character varying, p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_seq_val BIGINT;
    v_short_year VARCHAR(2);
    v_clean_prefix VARCHAR(10);
    v_inv_id VARCHAR(50);
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_invoicing_write()
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zur Rechnungsnummern-Vergabe.' USING ERRCODE = '42501';
    END IF;

    v_seq_val := nextval('public.invoice_number_seq');
    v_short_year := RIGHT(p_year::text, 2);
    v_clean_prefix := UPPER(REGEXP_REPLACE(COALESCE(p_prefix, 'RE'), '[^A-Za-z0-9]', '', 'g'));
    IF v_clean_prefix = '' THEN
        v_clean_prefix := 'RE';
    END IF;

    v_inv_id := v_clean_prefix || '-' || v_short_year || '-' || LPAD(v_seq_val::text, 4, '0');
    RETURN v_inv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number(VARCHAR, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(VARCHAR, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
    p_invoice_id character varying,
    p_amount numeric,
    p_payment_date date DEFAULT CURRENT_DATE,
    p_payment_method character varying DEFAULT 'Bank'::character varying,
    p_document_ref character varying DEFAULT NULL::character varying,
    p_notes text DEFAULT NULL::text,
    p_sync_fibu boolean DEFAULT true,
    p_soll_konto character varying DEFAULT NULL::character varying,
    p_haben_konto character varying DEFAULT NULL::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inv RECORD;
    v_payment_id UUID;
    v_journal_id BIGINT := NULL;
    v_soll VARCHAR(50);
    v_haben VARCHAR(50);
    v_doc_ref VARCHAR(100);
    v_res jsonb;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_invoicing_write()
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Verbuchen von Zahlungen.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rechnung % existiert nicht.', p_invoice_id;
    END IF;

    IF v_inv.status = 'storniert' THEN
        RAISE EXCEPTION 'Rechnung % ist storniert und kann keine Zahlungen annehmen.', p_invoice_id;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Zahlungsbetrag muss grösser als 0 sein (erhalten: %)', p_amount;
    END IF;

    v_doc_ref := COALESCE(p_document_ref, 'ZAL-' || p_invoice_id);

    IF p_sync_fibu IS TRUE THEN
        IF p_soll_konto IS NOT NULL AND p_soll_konto <> '' THEN
            v_soll := p_soll_konto;
        ELSIF LOWER(p_payment_method) IN ('bar', 'kassa', 'kassabuch') THEN
            v_soll := '1000';
        ELSE
            v_soll := '1020';
        END IF;

        IF p_haben_konto IS NOT NULL AND p_haben_konto <> '' THEN
            v_haben := p_haben_konto;
        ELSE
            SELECT konto INTO v_haben
            FROM public.invoice_positions
            WHERE invoice_id = p_invoice_id
            LIMIT 1;

            IF v_haben IS NULL OR v_haben = '' THEN
                v_haben := '3400';
            END IF;
        END IF;

        INSERT INTO public.accounting_journal (
            jahr, datum, beleg_nr, beschreibung,
            konto_soll, konto_haben, betrag, typ, buchungstyp
        ) VALUES (
            EXTRACT(YEAR FROM p_payment_date)::INTEGER,
            p_payment_date,
            v_doc_ref,
            'Zahlungseingang ' || p_invoice_id || ' (' || v_inv.recipient_name || ')',
            v_soll,
            v_haben,
            p_amount,
            'Rechnung',
            'DEBITOR'
        )
        RETURNING id INTO v_journal_id;
    END IF;

    INSERT INTO public.invoice_payments (
        invoice_id, payment_date, amount, payment_method,
        document_ref, journal_entry_id, notes
    ) VALUES (
        p_invoice_id, p_payment_date, p_amount, p_payment_method,
        v_doc_ref, v_journal_id, p_notes
    )
    RETURNING id INTO v_payment_id;

    SELECT jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'invoice_id', p_invoice_id,
        'amount', p_amount,
        'status', status,
        'open_amount', open_amount,
        'journal_entry_id', v_journal_id
    ) INTO v_res
    FROM public.invoices
    WHERE id = p_invoice_id;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(VARCHAR, NUMERIC, DATE, VARCHAR, VARCHAR, TEXT, BOOLEAN, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(VARCHAR, NUMERIC, DATE, VARCHAR, VARCHAR, TEXT, BOOLEAN, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 6.4 ensure_rental_proforma_invoice, update_invoice_pdf, update_rental_contract_pdf
CREATE OR REPLACE FUNCTION public.ensure_rental_proforma_invoice(p_booking_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rental RECORD;
    v_inv_id VARCHAR(50);
    v_existing_inv RECORD;
    v_recipient JSONB;
    v_amount NUMERIC(10,2);
    v_date_str TEXT;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_invoicing_write()
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Erstellen von Proforma-Rechnungen.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_rental FROM public.rental_requests
    WHERE booking_number = p_booking_number OR id::text = p_booking_number
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Buchung nicht gefunden: ' || COALESCE(p_booking_number, 'NULL'));
    END IF;

    v_amount := COALESCE(v_rental.total_amount_chf, 300.00);
    v_date_str := to_char(COALESCE(v_rental.start_date, CURRENT_DATE), 'DD.MM.YYYY');

    v_recipient := jsonb_build_object(
        'name', trim(COALESCE(v_rental.salutation, '') || ' ' || v_rental.first_name || ' ' || v_rental.last_name),
        'salutation', COALESCE(v_rental.salutation, ''),
        'vorname', v_rental.first_name,
        'nachname', v_rental.last_name,
        'strasse', COALESCE(v_rental.street, ''),
        'plz', COALESCE(v_rental.post_code, ''),
        'ort', COALESCE(v_rental.city, ''),
        'email', COALESCE(v_rental.email, ''),
        'telefon', COALESCE(v_rental.phone, '')
    );

    IF v_rental.invoice_id IS NOT NULL THEN
        SELECT * INTO v_existing_inv FROM public.invoices WHERE id = v_rental.invoice_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'invoice_id', v_existing_inv.id, 'is_new', false);
        END IF;
    END IF;

    SELECT * INTO v_existing_inv FROM public.invoices
    WHERE source_module = 'vermietung' AND (source_id = v_rental.booking_number OR source_id = v_rental.id::text)
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.rental_requests SET invoice_id = v_existing_inv.id WHERE id = v_rental.id;
        RETURN jsonb_build_object('success', true, 'invoice_id', v_existing_inv.id, 'is_new', false);
    END IF;

    BEGIN
        SELECT public.next_invoice_number('VM', EXTRACT(year FROM COALESCE(v_rental.start_date, CURRENT_DATE))::int) INTO v_inv_id;
    EXCEPTION WHEN OTHERS THEN
        v_inv_id := NULL;
    END;

    IF v_inv_id IS NULL OR v_inv_id = '' THEN
        v_inv_id := 'VM-' || to_char(CURRENT_DATE, 'YY') || '-' || upper(substr(md5(random()::text), 1, 4));
    END IF;

    INSERT INTO public.invoices (
        id, year, type, status, total_amount, open_amount, currency,
        source_module, source_id, recipient_name, recipient_address, sender_address,
        notes, due_date, mail_status, pdf_url, pdf_storage_path
    ) VALUES (
        v_inv_id,
        EXTRACT(year FROM COALESCE(v_rental.start_date, CURRENT_DATE))::int,
        'Vermietung',
        CASE WHEN v_rental.status = 'paid' OR v_rental.is_paid = true THEN 'bezahlt' ELSE 'offen' END,
        v_amount,
        CASE WHEN v_rental.status = 'paid' OR v_rental.is_paid = true THEN 0.00 ELSE v_amount END,
        'CHF',
        'vermietung',
        v_rental.booking_number,
        trim(v_rental.first_name || ' ' || v_rental.last_name),
        v_recipient,
        jsonb_build_object('bereich', 'Vermietung Schützenstube', 'funktion', 'Vermieter', 'verein', 'Sportschützen Muhen'),
        'Mietvertrag ' || v_rental.booking_number,
        (CURRENT_DATE + INTERVAL '14 days')::date,
        'versendet',
        v_rental.contract_file_url,
        v_rental.contract_storage_path
    );

    INSERT INTO public.invoice_positions (
        invoice_id, position_nr, description, quantity, unit_price, amount, konto, type
    ) VALUES (
        v_inv_id, 1,
        'Miete Schützenstube Muhen (' || v_date_str || ')',
        1.00, v_amount, v_amount, '3400', 'vermietung'
    );

    UPDATE public.rental_requests SET invoice_id = v_inv_id WHERE id = v_rental.id;

    RETURN jsonb_build_object('success', true, 'invoice_id', v_inv_id, 'is_new', true);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_rental_proforma_invoice(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_rental_proforma_invoice(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_invoice_pdf(
    p_invoice_id character varying,
    p_pdf_url text,
    p_storage_path text,
    p_file_size integer DEFAULT NULL::integer,
    p_paperless_status public.archive_sync_status DEFAULT 'pending'::public.archive_sync_status,
    p_paperless_id integer DEFAULT NULL::integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_invoicing_write()
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Aktualisieren von Rechnungs-PDFs.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.invoices
    SET
        pdf_url               = p_pdf_url,
        pdf_storage_path      = p_storage_path,
        paperless_status      = COALESCE(p_paperless_status, paperless_status),
        paperless_document_id = COALESCE(p_paperless_id, paperless_document_id),
        updated_at            = now()
    WHERE id = p_invoice_id;

    INSERT INTO public.document_generation_logs (
        document_type, record_id, title, storage_bucket, storage_path,
        file_url, file_size_bytes, paperless_status, paperless_document_id
    ) VALUES (
        'invoice', p_invoice_id, 'Rechnung ' || p_invoice_id, 'operatives-storage',
        p_storage_path, p_pdf_url, p_file_size, p_paperless_status::text, p_paperless_id
    );

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_pdf(VARCHAR, TEXT, TEXT, INTEGER, public.archive_sync_status, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_pdf(VARCHAR, TEXT, TEXT, INTEGER, public.archive_sync_status, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_rental_contract_pdf(
    p_booking_id character varying,
    p_pdf_url text,
    p_storage_path text,
    p_file_size integer DEFAULT NULL::integer,
    p_paperless_status public.archive_sync_status DEFAULT 'pending'::public.archive_sync_status,
    p_paperless_id integer DEFAULT NULL::integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['vermietung.manage', 'rechnungen.manage'])
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Aktualisieren von Mietvertrags-PDFs.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.rental_requests
    SET
        contract_file_url     = p_pdf_url,
        contract_storage_path = p_storage_path,
        paperless_status      = COALESCE(p_paperless_status, paperless_status),
        paperless_document_id = COALESCE(p_paperless_id, paperless_document_id),
        updated_at            = now()
    WHERE booking_number = p_booking_id OR id::text = p_booking_id;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_rental_contract_pdf(VARCHAR, TEXT, TEXT, INTEGER, public.archive_sync_status, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_rental_contract_pdf(VARCHAR, TEXT, TEXT, INTEGER, public.archive_sync_status, INTEGER) TO authenticated, service_role;

-- 6.5 get_member_open_invoices & get_member_pendenzen_count (strikt nur authentifiziert + Eigentuemer-Check!)
CREATE OR REPLACE FUNCTION public.get_member_open_invoices(p_lizenz text, p_min_age_days integer DEFAULT 45)
RETURNS TABLE(
    id character varying,
    type character varying,
    year integer,
    open_amount numeric,
    total_amount numeric,
    send_date timestamp with time zone,
    due_date date,
    pdf_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_lizenz TEXT;
    v_padded_lizenz TEXT;
    v_unpadded_lizenz TEXT;
    v_days INTEGER;
    v_caller_pn INTEGER;
    v_is_authorized_board BOOLEAN := false;
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN;
    END IF;

    v_clean_lizenz := NULLIF(TRIM(p_lizenz), '');
    IF v_clean_lizenz IS NULL THEN
        RETURN;
    END IF;

    v_padded_lizenz := LPAD(v_clean_lizenz, 6, '0');
    v_unpadded_lizenz := LTRIM(v_clean_lizenz, '0');
    IF v_unpadded_lizenz = '' THEN
        v_unpadded_lizenz := '0';
    END IF;

    v_is_authorized_board := (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_invoicing_read()
        OR auth.has_role('admin')
    );

    IF NOT v_is_authorized_board THEN
        v_caller_pn := public.current_member_person_number();
        IF v_caller_pn IS NULL OR NOT EXISTS (
            SELECT 1
            FROM public.members m
            WHERE m.person_number = v_caller_pn
              AND (
                m.person_number::text IN (v_clean_lizenz, v_padded_lizenz, v_unpadded_lizenz)
                OR (m.address_number IS NOT NULL AND m.address_number IN (v_clean_lizenz, v_padded_lizenz, v_unpadded_lizenz))
                OR (m.address_number IS NOT NULL AND LPAD(m.address_number, 6, '0') = v_padded_lizenz)
              )
        ) THEN
            RETURN;
        END IF;
    END IF;

    v_days := GREATEST(COALESCE(p_min_age_days, 45), 0);

    RETURN QUERY
    SELECT
        inv.id,
        inv.type,
        inv.year,
        CASE WHEN COALESCE(inv.open_amount, 0) > 0 THEN inv.open_amount ELSE inv.total_amount END AS open_amount,
        inv.total_amount,
        COALESCE(inv.send_date, inv.created_at) AS send_date,
        inv.due_date,
        inv.pdf_url
    FROM public.invoices inv
    WHERE (
        inv.person_number = v_clean_lizenz
        OR inv.person_number = v_padded_lizenz
        OR inv.person_number = v_unpadded_lizenz
    )
    AND inv.status = 'offen'
    AND inv.mail_status IN ('gesendet', 'versendet')
    AND COALESCE(inv.send_date, inv.created_at) <= (NOW() - make_interval(days => v_days))
    ORDER BY COALESCE(inv.send_date, inv.created_at) ASC, inv.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_open_invoices(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_open_invoices(TEXT, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_pendenzen_count(p_lizenz text DEFAULT NULL::text, p_is_board boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_lizenz TEXT;
    v_padded_lizenz TEXT;
    v_unpadded_lizenz TEXT;
    v_caller_pn INTEGER;
    v_caller_is_board BOOLEAN := false;
    v_rsvps_count INTEGER := 0;
    v_invoices_count INTEGER := 0;
    v_board_ocr_count INTEGER := 0;
    v_board_rentals_count INTEGER := 0;
    v_board_invoices_draft_count INTEGER := 0;
    v_board_invoices_overdue_count INTEGER := 0;
    v_board_invoices_total INTEGER := 0;
    v_board_polls_past_count INTEGER := 0;
    v_board_mails_failed_count INTEGER := 0;
    v_board_total INTEGER := 0;
    v_total INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN jsonb_build_object('total', 0, 'member_rsvps', 0, 'member_invoices', 0, 'board_total', 0);
    END IF;

    v_caller_is_board := (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role <> 'member')
        OR EXISTS (SELECT 1 FROM public.admin_profiles ap WHERE ap.auth_user_id = auth.uid() AND ap.is_active = true)
    );

    v_clean_lizenz := NULLIF(TRIM(p_lizenz), '');
    IF v_clean_lizenz IS NOT NULL THEN
        v_padded_lizenz := LPAD(v_clean_lizenz, 6, '0');
        v_unpadded_lizenz := LTRIM(v_clean_lizenz, '0');
        IF v_unpadded_lizenz = '' THEN
            v_unpadded_lizenz := '0';
        END IF;

        v_caller_pn := public.current_member_person_number();
        IF v_caller_is_board OR (v_caller_pn IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.person_number = v_caller_pn
              AND (
                m.person_number::text IN (v_clean_lizenz, v_padded_lizenz, v_unpadded_lizenz)
                OR (m.address_number IS NOT NULL AND (m.address_number IN (v_clean_lizenz, v_padded_lizenz, v_unpadded_lizenz) OR LPAD(m.address_number, 6, '0') = v_padded_lizenz))
              )
        )) THEN
            SELECT COUNT(*)::INTEGER
            INTO v_rsvps_count
            FROM public.poll_events pe
            WHERE pe.aktiv = true
              AND (pe.datum >= CURRENT_DATE OR pe.datum IS NULL)
              AND NOT EXISTS (
                  SELECT 1 FROM public.poll_responses pr
                  WHERE pr.event_id = pe.id
                    AND (
                        pr.lizenz = v_clean_lizenz
                        OR pr.lizenz = v_padded_lizenz
                        OR pr.lizenz = v_unpadded_lizenz
                    )
              );

            SELECT COUNT(*)::INTEGER
            INTO v_invoices_count
            FROM public.invoices inv
            WHERE (
                inv.person_number = v_clean_lizenz
                OR inv.person_number = v_padded_lizenz
                OR inv.person_number = v_unpadded_lizenz
            )
            AND inv.status = 'offen'
            AND inv.mail_status IN ('gesendet', 'versendet')
            AND COALESCE(inv.send_date, inv.created_at) <= (NOW() - INTERVAL '45 days');
        END IF;
    END IF;

    IF p_is_board IS TRUE AND v_caller_is_board THEN
        SELECT COUNT(*)::INTEGER INTO v_board_rentals_count
        FROM public.rental_requests rr WHERE rr.status = 'inquiry';

        SELECT COUNT(*)::INTEGER INTO v_board_ocr_count
        FROM public.contest_ocr_logs ocr
        WHERE ocr.contest_type = 'standblatt'
          AND COALESCE(ocr.raw_response->>'status', '') NOT IN ('imported', 'rejected');

        SELECT COUNT(*)::INTEGER INTO v_board_invoices_draft_count
        FROM public.invoices inv WHERE inv.mail_status = 'entwurf' OR inv.status = 'entwurf';

        SELECT COUNT(*)::INTEGER INTO v_board_invoices_overdue_count
        FROM public.invoices inv
        WHERE inv.status = 'offen' AND inv.due_date IS NOT NULL AND inv.due_date < CURRENT_DATE;

        v_board_invoices_total := v_board_invoices_draft_count + v_board_invoices_overdue_count;

        SELECT COUNT(*)::INTEGER INTO v_board_polls_past_count
        FROM public.poll_events pe
        WHERE pe.aktiv = true AND pe.datum IS NOT NULL AND pe.datum < CURRENT_DATE;

        SELECT COUNT(*)::INTEGER INTO v_board_mails_failed_count
        FROM public.mail_logs ml WHERE ml.status IN ('fehler', 'failed');

        v_board_total := v_board_rentals_count
                       + v_board_ocr_count
                       + v_board_invoices_total
                       + v_board_polls_past_count
                       + v_board_mails_failed_count;
    END IF;

    v_total := v_rsvps_count + v_invoices_count + v_board_total;

    RETURN jsonb_build_object(
        'total', v_total,
        'member_rsvps', v_rsvps_count,
        'member_invoices', v_invoices_count,
        'board_rentals', v_board_rentals_count,
        'board_ocr', v_board_ocr_count,
        'board_invoices_draft', v_board_invoices_draft_count,
        'board_invoices_overdue', v_board_invoices_overdue_count,
        'board_invoices_total', v_board_invoices_total,
        'board_polls_past', v_board_polls_past_count,
        'board_mails_failed', v_board_mails_failed_count,
        'board_total', v_board_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_pendenzen_count(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_pendenzen_count(TEXT, BOOLEAN) TO authenticated, service_role;

-- 6.6 create_event_from_template, sync_logins_from_members, get_push_audience_stats, get_system_mail*, ping_login_session
CREATE OR REPLACE FUNCTION public.create_event_from_template(
    template_id uuid,
    new_event_name character varying,
    new_event_date date,
    new_expected_visitors integer DEFAULT NULL::integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    new_event_id UUID;
    src_visitors INTEGER;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['anlaesse.manage'])
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Erstellen von Anlässen (anlaesse.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    SELECT expected_visitors INTO src_visitors
    FROM public.events WHERE id = template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vorlage mit ID % wurde nicht gefunden', template_id;
    END IF;

    IF new_expected_visitors IS NULL THEN
        new_expected_visitors := src_visitors;
    END IF;

    INSERT INTO public.events (
        name, description, event_date, start_time, end_time, location,
        manager_name, expected_visitors, status, budget, notes,
        is_template, created_by
    )
    SELECT
        new_event_name, description, new_event_date, start_time, end_time, location,
        manager_name, new_expected_visitors, 'planned', budget, notes,
        false, auth.uid()
    FROM public.events
    WHERE id = template_id
    RETURNING id INTO new_event_id;

    INSERT INTO public.event_items (
        event_id, category, item_name, unit, cost_price, sales_price,
        qty_per_visitor, safety_factor, recommended_qty, order_qty, notes
    )
    SELECT
        new_event_id, category, item_name, unit, cost_price, sales_price,
        qty_per_visitor, safety_factor,
        ROUND(new_expected_visitors * qty_per_visitor * safety_factor, 2),
        ROUND(new_expected_visitors * qty_per_visitor * safety_factor, 2),
        notes
    FROM public.event_items
    WHERE event_id = template_id;

    INSERT INTO public.event_checklists (
        event_id, phase, task, assigned_to, priority, status, notes
    )
    SELECT
        new_event_id, phase, task, assigned_to, priority, 'pending', notes
    FROM public.event_checklists
    WHERE event_id = template_id;

    INSERT INTO public.event_shifts (
        event_id, area, role_name, shift_date, start_time, end_time,
        required_helpers, description, status
    )
    SELECT
        new_event_id, area, role_name, new_event_date, start_time, end_time,
        required_helpers, description, 'open'
    FROM public.event_shifts
    WHERE event_id = template_id;

    RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_from_template(UUID, VARCHAR, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event_from_template(UUID, VARCHAR, DATE, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_logins_from_members()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    admin_rec RECORD;
    m_rec RECORD;
    updated_admins_count INTEGER := 0;
    matched_members_count INTEGER := 0;
    sync_logs jsonb := '[]'::jsonb;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['logins.manage', 'members.manage'])
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung für den Login-Stammdatenabgleich (logins.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    FOR admin_rec IN
        SELECT ap.id, ap.username, ap.display_name, ap.email, ap.person_number
        FROM public.admin_profiles ap
    LOOP
        IF admin_rec.person_number IS NOT NULL THEN
            SELECT * INTO m_rec FROM public.members WHERE person_number = admin_rec.person_number;
        ELSE
            SELECT * INTO m_rec FROM public.members
            WHERE LOWER(first_name || ' ' || last_name) = LOWER(admin_rec.display_name)
               OR LOWER(last_name || ' ' || first_name) = LOWER(admin_rec.display_name)
               OR LOWER(admin_rec.username) = LOWER(first_name || '.' || last_name)
            LIMIT 1;
        END IF;

        IF m_rec.person_number IS NOT NULL THEN
            UPDATE public.admin_profiles
            SET person_number = COALESCE(person_number, m_rec.person_number),
                email = CASE
                    WHEN email IS NULL OR email = '' OR email = 'name@email.ch' THEN COALESCE(m_rec.primary_email, email)
                    ELSE email
                END,
                display_name = COALESCE(display_name, (m_rec.first_name || ' ' || m_rec.last_name)),
                updated_at = now()
            WHERE id = admin_rec.id;

            updated_admins_count := updated_admins_count + 1;
            sync_logs := sync_logs || jsonb_build_object(
                'username', admin_rec.username,
                'person_number', m_rec.person_number,
                'email', m_rec.primary_email,
                'status', 'Aktualisiert aus Stammdaten'
            );
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO matched_members_count
    FROM public.members
    WHERE is_active = true;

    RETURN jsonb_build_object(
        'success', true,
        'updated_admins', updated_admins_count,
        'active_members', matched_members_count,
        'details', sync_logs,
        'message', format('Sync erfolgreich: %s Admin-Profile abgeglichen, %s aktive Mitglieder bereit.', updated_admins_count, matched_members_count)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_logins_from_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_logins_from_members() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_push_audience_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_members INTEGER := 0;
    v_active_members INTEGER := 0;
    v_passive_members INTEGER := 0;
    v_board_members INTEGER := 0;
    v_active_with_push INTEGER := 0;
    v_passive_with_push INTEGER := 0;
    v_board_with_push INTEGER := 0;
    v_total_with_push INTEGER := 0;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['push.view', 'push.manage', 'vorstand.view'])
        OR auth.has_role('admin')
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Abrufen der Push-Statistiken.' USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*) INTO v_active_members FROM public.members WHERE is_active = true AND is_passive = false AND deceased = false;
    SELECT COUNT(*) INTO v_passive_members FROM public.members WHERE is_active = true AND is_passive = true AND deceased = false;
    SELECT COUNT(DISTINCT person_number) INTO v_board_members FROM public.admin_profiles WHERE is_active = true AND person_number IS NOT NULL;
    v_total_members := v_active_members + v_passive_members;

    SELECT COUNT(DISTINCT ps.person_number) INTO v_active_with_push
    FROM public.push_subscriptions ps
    JOIN public.members m ON m.person_number = ps.person_number
    WHERE ps.permission_status = 'granted' AND m.is_active = true AND m.is_passive = false AND m.deceased = false;

    SELECT COUNT(DISTINCT ps.person_number) INTO v_passive_with_push
    FROM public.push_subscriptions ps
    JOIN public.members m ON m.person_number = ps.person_number
    WHERE ps.permission_status = 'granted' AND m.is_active = true AND m.is_passive = true AND m.deceased = false;

    SELECT COUNT(DISTINCT ps.person_number) INTO v_board_with_push
    FROM public.push_subscriptions ps
    JOIN public.admin_profiles ap ON ap.person_number = ps.person_number
    WHERE ps.permission_status = 'granted' AND ap.is_active = true;

    SELECT COUNT(DISTINCT ps.person_number) INTO v_total_with_push
    FROM public.push_subscriptions ps
    WHERE ps.permission_status = 'granted';

    RETURN jsonb_build_object(
        'total_members', v_total_members,
        'active_members', v_active_members,
        'passive_members', v_passive_members,
        'board_members', v_board_members,
        'total_with_push', v_total_with_push,
        'active_with_push', v_active_with_push,
        'passive_with_push', v_passive_with_push,
        'board_with_push', v_board_with_push
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_push_audience_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_push_audience_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_system_mail(p_schluessel character varying)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_mailadresse TEXT;
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Authentifizierung erforderlich.' USING ERRCODE = '42501';
    END IF;

    SELECT mailadresse INTO v_mailadresse FROM public.system_mail_configs WHERE schluessel = p_schluessel;
    RETURN COALESCE(v_mailadresse, '');
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_mail(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_mail(VARCHAR) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_system_mail_array(p_schluessel character varying)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raw TEXT;
    v_parts TEXT[];
    v_clean TEXT[];
    v_item TEXT;
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Authentifizierung erforderlich.' USING ERRCODE = '42501';
    END IF;

    SELECT mailadresse INTO v_raw FROM public.system_mail_configs WHERE schluessel = p_schluessel LIMIT 1;
    IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
        RETURN ARRAY[]::TEXT[];
    END IF;

    v_parts := regexp_split_to_array(v_raw, '[,;]+');
    v_clean := ARRAY[]::TEXT[];
    FOREACH v_item IN ARRAY v_parts LOOP
        v_item := TRIM(v_item);
        IF v_item <> '' AND position('@' IN v_item) > 1 THEN
            v_clean := array_append(v_clean, v_item);
        END IF;
    END LOOP;

    RETURN v_clean;
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_mail_array(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_mail_array(VARCHAR) TO authenticated, service_role;

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
    sess_id_val TEXT := COALESCE(NULLIF(TRIM(p_session_id), ''), 'sess_default');
    user_name_val TEXT := COALESCE(NULLIF(TRIM(p_username), ''), 'Gast');
    active_users jsonb;
    existing_sess RECORD;
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert');
    END IF;

    SELECT id, login_time INTO existing_sess
    FROM public.login_sessions
    WHERE session_id = sess_id_val
    LIMIT 1;

    IF existing_sess.id IS NOT NULL THEN
        UPDATE public.login_sessions
        SET last_seen = now_ts,
            duration_sec = GREATEST(0, EXTRACT(EPOCH FROM (now_ts - existing_sess.login_time))::INTEGER),
            is_online = true,
            username = user_name_val,
            role = COALESCE(p_role, role),
            user_id = COALESCE(auth.uid(), user_id)
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

    IF public.rbac_allows(ARRAY['logins.view', 'logins.manage', 'vorstand.view']) OR auth.has_role('admin') THEN
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

-- 6.7 sync_jm_to_contest_mannschaft: RBAC-Pruefung am Funktionsbeginn + REVOKE von anon
DO $$
DECLARE
    v_src TEXT;
BEGIN
    SELECT prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_jm_to_contest_mannschaft'
    LIMIT 1;

    IF v_src IS NOT NULL AND v_src NOT ILIKE '%rbac_allows%' THEN
        v_src := regexp_replace(
            v_src,
            'BEGIN',
            E'BEGIN\n    IF NOT (COALESCE(auth.role(), '''') = ''service_role'' OR session_user IN (''postgres'', ''supabase_admin'') OR public.rbac_allows(ARRAY[''jahresmeisterschaft.manage'', ''resultate.manage'', ''manager.manage'']) OR auth.has_role(''admin'')) THEN\n        RAISE EXCEPTION ''Keine Berechtigung fuer Mannschafts-Synchronisation.'' USING ERRCODE = ''42501'';\n    END IF;',
            ''
        );
        EXECUTE format(
            'CREATE OR REPLACE FUNCTION public.sync_jm_to_contest_mannschaft(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$%s$fn$',
            v_src
        );
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.sync_jm_to_contest_mannschaft(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_jm_to_contest_mannschaft(INTEGER) TO authenticated, service_role;

-- 6.8 register_member_for_shift & cancel_member_shift_assignment: strikt nur authenticated
DO $$
DECLARE
    v_src TEXT;
BEGIN
    SELECT prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_member_for_shift'
    LIMIT 1;

    IF v_src IS NOT NULL AND v_src NOT ILIKE '%Nicht authentifiziert%' THEN
        v_src := regexp_replace(
            v_src,
            'v_user_id := auth\.uid\(\);',
            E'v_user_id := auth.uid();\n    IF v_user_id IS NULL THEN\n        RAISE EXCEPTION ''Bitte melde dich zuerst an, um dich fuer eine Schicht einzutragen.'' USING ERRCODE = ''42501'';\n    END IF;',
            ''
        );
        EXECUTE format(
            'CREATE OR REPLACE FUNCTION public.register_member_for_shift(p_shift_id uuid, p_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $fn$%s$fn$',
            v_src
        );
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.register_member_for_shift(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_member_for_shift(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_member_shift_assignment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_member_shift_assignment(UUID) TO authenticated, service_role;

-- 6.9 Veraltete 4-Parameter confirm_rental_payment entfernen & weitere interne Funktionen von anon entziehen
DROP FUNCTION IF EXISTS public.confirm_rental_payment(TEXT, NUMERIC, DATE, TEXT);

REVOKE ALL ON FUNCTION public.calculate_member_contributions(INTEGER, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_member_contributions(INTEGER, TEXT[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_bank_automation_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_automation_status() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.inventar_book_accounting_journal(INTEGER, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventar_book_accounting_journal(INTEGER, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.toggle_role_permission(public.app_role, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_role_permission(public.app_role, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.trigger_bank_mail_scan_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_bank_mail_scan_now() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_member_auth_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_member_auth_session() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rbac_invoicing_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_invoicing_read() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rbac_invoicing_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_invoicing_write() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_bank_ingest_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_bank_ingest_secret(TEXT) TO service_role;

-- ==============================================================================
-- 7. AUTH- & SSO-FUNKTIONEN HAERTEN (verify_member_pin, resolve_login_identifier, sync_member_auth_session)
-- ==============================================================================
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

    IF v_member.person_number IS NOT NULL THEN
        v_is_passive := COALESCE(v_member.is_passive, false);
    END IF;

    -- 3. Falls echtes Admin-Profil existiert, Rolle synchronisieren
    IF v_admin.id IS NOT NULL THEN
        DECLARE
            v_admin_role TEXT := LOWER(TRIM(COALESCE(v_admin.role_external, 'vorstand')));
        BEGIN
            IF v_admin_role NOT IN ('admin', 'vorstand', 'kassier', 'aktuar', 'schuetzenmeister', 'vermieter', 'jungschuetzenleiter') THEN
                v_admin_role := 'vorstand';
            END IF;
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_user_id, v_admin_role::public.app_role)
            ON CONFLICT DO NOTHING;
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_user_id, 'vorstand'::public.app_role)
            ON CONFLICT DO NOTHING;
        END;
    END IF;

    SELECT ARRAY_AGG(DISTINCT role::text)
    INTO v_roles
    FROM public.user_roles
    WHERE user_id = v_user_id;

    IF v_roles IS NULL OR ARRAY_LENGTH(v_roles, 1) IS NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'member'::public.app_role)
        ON CONFLICT DO NOTHING;
        v_roles := ARRAY['member'];
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
BEGIN
    clean_id := REGEXP_REPLACE(TRIM(COALESCE(p_identifier, '')), '\s+', ' ', 'g');
    clean_id := REGEXP_REPLACE(clean_id, '[,;]+', ' ', 'g');
    clean_id := TRIM(clean_id);
    clean_pin := TRIM(COALESCE(p_pin, ''));

    IF clean_id = '' OR clean_pin = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen Namen und deinen 6-stelligen PIN oder dein Passwort eingeben.');
    END IF;

    -- Rate-Limit pruefen (max. 10 Versuche pro 15 Minuten)
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

    -- 2. Mitglied in public.members suchen (nur über Name oder E-Mail, KEINE reine Nummer als Identifier!)
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

    -- Falls Mitglied gefunden und 6-stelliger PIN (Lizenz-/Personennummer) exakt passt
    IF m.person_number IS NOT NULL THEN
        IF clean_pin = TRIM(COALESCE(m.address_number, ''))
           OR clean_pin = LPAD(TRIM(COALESCE(m.address_number, '')), 6, '0')
           OR (COALESCE(m.address_number, '') <> '' AND LPAD(clean_pin, 6, '0') = LPAD(TRIM(m.address_number), 6, '0'))
           OR clean_pin = m.person_number::TEXT
           OR LPAD(clean_pin, 6, '0') = LPAD(m.person_number::TEXT, 6, '0') THEN

            -- Dedizierten GoTrue-Session-Benutzer fuer PIN-Anmeldung bereitstellen (ohne Kollision mit Admin-Accounts)
            v_pin_email := 'pin_' || m.person_number::text || '@pin.sportschuetzen-muhen.local';
            SELECT id INTO v_pin_uid FROM auth.users WHERE LOWER(email) = v_pin_email LIMIT 1;

            IF v_pin_uid IS NULL THEN
                v_pin_uid := gen_random_uuid();
                INSERT INTO auth.users (
                    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                    confirmation_token, recovery_token, email_change_token_new, email_change
                ) VALUES (
                    '00000000-0000-0000-0000-000000000000', v_pin_uid, 'authenticated', 'authenticated',
                    v_pin_email, extensions.crypt(clean_pin, extensions.gen_salt('bf', 8)), now(),
                    '{"provider":"email","providers":["email"]}'::jsonb,
                    jsonb_build_object(
                        'name', TRIM(m.first_name || ' ' || m.last_name),
                        'person_number', m.person_number,
                        'address_number', m.address_number
                    ),
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
                    raw_user_meta_data = jsonb_build_object(
                        'name', TRIM(m.first_name || ' ' || m.last_name),
                        'person_number', m.person_number,
                        'address_number', m.address_number
                    ),
                    updated_at = now()
                WHERE id = v_pin_uid;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'type', 'member',
                'pin_auth_email', v_pin_email,
                'user', jsonb_build_object(
                    'id', LPAD(COALESCE(m.address_number, m.person_number::text), 6, '0'),
                    'lizenz', LPAD(COALESCE(m.address_number, m.person_number::text), 6, '0'),
                    'person_number', m.person_number,
                    'address_number', m.address_number,
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
            'person_number', ap.person_number,
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
    res_type TEXT;
    res_pn INTEGER;
    res_is_passive BOOLEAN := false;
BEGIN
    clean_id := REGEXP_REPLACE(TRIM(COALESCE(p_identifier, '')), '\s+', ' ', 'g');
    clean_id := REGEXP_REPLACE(clean_id, '[,;]+', ' ', 'g');
    clean_id := TRIM(clean_id);

    IF clean_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen Namen oder deine E-Mail-Adresse eingeben.');
    END IF;

    -- Rate-Limit pruefen (max. 10 Abfragen pro 15 Minuten)
    IF NOT public.check_auth_rate_limit('resolve_login_identifier', clean_id, 10, 15) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Zu viele Anfragen. Bitte warte 15 Minuten und versuche es danach erneut.'
        );
    END IF;

    -- Kurze numerische IDs (Sequenz-Enumeration 1..99999) abweisen
    IF clean_id ~ '^[0-9]{1,5}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte deinen vollständigen Namen (Vorname Nachname) oder deine E-Mail-Adresse eingeben.');
    END IF;

    -- 1. Check in admin_profiles
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
            'person_number', res_pn,
            'is_passive', COALESCE(res_is_passive, false),
            'personenkreis', CASE WHEN COALESCE(res_is_passive, false) THEN 'passiv' ELSE 'aktiv' END
        );
    END IF;

    -- 2. Check in members
    SELECT m.primary_email, TRIM(m.first_name || ' ' || m.last_name), m.person_number, COALESCE(m.is_passive, false)
    INTO res_email, res_name, res_pn, res_is_passive
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
            'is_passive', COALESCE(res_is_passive, false),
            'personenkreis', CASE WHEN COALESCE(res_is_passive, false) THEN 'passiv' ELSE 'aktiv' END
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein aktives Mitglied mit diesem Namen oder dieser E-Mail gefunden.');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_identifier(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role;

-- 7.4 Minimale Namensliste fuer eingeloggte Mitglieder (fuer Teilnehmer-Anzeige in App ohne PII-Leak)
CREATE OR REPLACE FUNCTION public.get_active_members_directory()
RETURNS TABLE(
    person_number integer,
    first_name character varying,
    last_name character varying,
    is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        m.person_number,
        m.first_name,
        m.last_name,
        m.is_active
    FROM public.members m
    WHERE m.is_active = true
    ORDER BY m.last_name ASC, m.first_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_members_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_members_directory() TO authenticated, service_role;

-- ==============================================================================
-- 8. TABELLEN-, VIEW- UND SEQUENZ-GRANTS FUER ANON / PUBLIC STRIKT MINIMIEREN
-- ==============================================================================
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;

-- Gezielte, spaltengenaue Grants fuer oeffentliche Website-Abfragen (anon):
GRANT SELECT ON public.termine TO anon;
GRANT SELECT ON public.termine_event_types TO anon;
GRANT SELECT ON public.termine_locations TO anon;
GRANT SELECT ON public.rental_pricing TO anon;
GRANT SELECT (setting_key, setting_value) ON public.rental_settings TO anon;
GRANT INSERT (booking_number, reason, remarks, is_urgent) ON public.rental_cancellation_feedbacks TO anon;
GRANT INSERT (name, email, subject, message, status) ON public.website_contact_messages TO anon;
GRANT SELECT (code, category, title, description, intro, outro, notice, mail_subject, mail_body, due_days, is_active, is_default) ON public.document_templates TO anon;
GRANT SELECT ON public.documents TO anon;
GRANT SELECT ON public.gallery_albums TO anon;
GRANT SELECT ON public.gallery_photos TO anon;
GRANT SELECT (jahr, title, event_date, is_archived, is_published, live_display_active, config) ON public.endschiessen_seasons TO anon;
GRANT SELECT ON public.endschiessen_stiche TO anon;
GRANT SELECT (id, jahr, stich_id, guest_name, passe_1_score, passe_1_decimal, passe_2_score, passe_2_decimal, total_score, total_decimal, target_score, diff_score, tiefschuss, rang_total, rang_decimal) ON public.endschiessen_scores TO anon;
GRANT SELECT (id, jahr, start_rang, serie_1, serie_2, serie_3, serie_4, serie_5, serie_6, serie_7, serie_8, total_score, final_rang, is_eliminated, eliminated_in_serie) ON public.endschiessen_final_series TO anon;
GRANT SELECT (jahr, title, is_archived, created_at, updated_at) ON public.jm_seasons TO anon;
GRANT SELECT (id, jahr, name, liga, rang, total, streichresultat_prz, status, is_junior, details, created_at, updated_at) ON public.jm_shooters TO anon;
GRANT SELECT ON public.jm_competitions TO anon;
GRANT SELECT (first_name, last_name, role_title, avatar_url, sort_order) ON public.v_board_members_public TO anon;
GRANT SELECT (key, value) ON public.system_app_configs TO anon;
GRANT SELECT ON public.events TO anon;
GRANT SELECT ON public.event_items TO anon;

-- Auf public.contest_results fuer anon alle Ergebnis-Spalten ausser person_number und notes freigeben:
DO $$
DECLARE
    v_cols TEXT;
BEGIN
    SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contest_results'
      AND column_name NOT IN ('person_number', 'notes');

    IF v_cols IS NOT NULL THEN
        EXECUTE format('GRANT SELECT (%s) ON public.contest_results TO anon', v_cols);
    END IF;
END $$;

-- Views fuer authenticated sicherstellen (v_board_members_public nur SELECT):
REVOKE ALL ON public.v_board_members_public FROM authenticated;
GRANT SELECT ON public.v_board_members_public TO authenticated, service_role;
GRANT SELECT ON public.v_event_controlling, public.v_gv_praesenz_summary, public.v_contest_team_summary, public.invoice_layouts TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
