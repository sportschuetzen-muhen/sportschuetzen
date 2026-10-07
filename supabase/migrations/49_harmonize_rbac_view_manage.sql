-- ==============================================================================
-- 49_harmonize_rbac_view_manage.sql
-- Migration: Einheitliches «View & Manage»-Berechtigungsmodell (20 Kacheln)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Konzept:
-- Jedes Fachmodul besitzt exakt zwei Stufen:
-- 1. <modul>.view:   Lesen / Kachel & Sidebar-Navigation freigeschaltet (Read-Only)
-- 2. <modul>.manage: Schreiben / Verwalten (autorisiert INSERT, UPDATE, DELETE)
-- (Wer .manage besitzt, hat automatisch auch .view-Rechte).
--
-- Ausnahme: Logins bleibt strikt der System-Rolle 'admin' vorbehalten.
-- ==============================================================================

-- 1. TABELLE role_permissions BEREINIGEN & INITIAL-SEED EINSETZEN
-- ------------------------------------------------------------------------------
TRUNCATE TABLE public.role_permissions;

INSERT INTO public.role_permissions (role, permission, description) VALUES
  -- 1. KASSIER
  -- Manage (5)
  ('kassier', 'rechnungen.manage', 'Rechnungen verwalten'),
  ('kassier', 'jahresbeitrag.manage', 'Jahresbeitrag & Tarife verwalten'),
  ('kassier', 'buchhaltung.manage', 'Doppelte Buchhaltung & Konten verwalten'),
  ('kassier', 'dokumente.manage', 'Dokumente & Vorlagen verwalten'),
  ('kassier', 'mail.manage', 'Mail-Verteiler & Kampagnen verwalten'),
  -- View (6)
  ('kassier', 'members.view', 'Mitgliederstamm einsehen'),
  ('kassier', 'vermietung.view', 'Vermietungen & Belegung einsehen'),
  ('kassier', 'inventar.view', 'Inventar & Material einsehen'),
  ('kassier', 'termine.view', 'Jahresprogramm & Termine einsehen'),
  ('kassier', 'umfragen.view', 'Anlässe & Umfragen einsehen'),
  ('kassier', 'archiv.view', 'Vereins-Archiv & KI einsehen'),

  -- 2. SCHUETZENMEISTER
  -- Manage (6)
  ('schuetzenmeister', 'manager.manage', 'Team Manager leiten'),
  ('schuetzenmeister', 'resultate.manage', 'Resultate erfassen & auswerten'),
  ('schuetzenmeister', 'jahresmeisterschaft.manage', 'Jahresmeisterschaft KK leiten'),
  ('schuetzenmeister', 'termine.manage', 'Jahresprogramm & Termine verwalten'),
  ('schuetzenmeister', 'anlaesse.manage', 'Anlässe & Controlling verwalten'),
  ('schuetzenmeister', 'umfragen.manage', 'Anlässe & Umfragen verwalten'),
  -- View (5)
  ('schuetzenmeister', 'members.view', 'Mitgliederstamm einsehen'),
  ('schuetzenmeister', 'inventar.view', 'Inventar & Material einsehen'),
  ('schuetzenmeister', 'archiv.view', 'Vereins-Archiv & KI einsehen'),
  ('schuetzenmeister', 'galerie.view', 'Galerie einsehen'),
  ('schuetzenmeister', 'news.view', 'News KI einsehen'),

  -- 3. AKTUAR
  -- Manage (8)
  ('aktuar', 'gv.manage', 'Generalversammlung (GV) verwalten'),
  ('aktuar', 'meeting.manage', 'Meeting-Recorder & Protokolle verwalten'),
  ('aktuar', 'news.manage', 'News KI verwalten'),
  ('aktuar', 'dokumente.manage', 'Dokumente & Vorlagen verwalten'),
  ('aktuar', 'members.manage', 'Mitglieder verwalten'),
  ('aktuar', 'mail.manage', 'Mail-Verteiler & Kampagnen verwalten'),
  ('aktuar', 'termine.manage', 'Jahresprogramm & Termine verwalten'),
  ('aktuar', 'umfragen.manage', 'Anlässe & Umfragen verwalten'),
  -- View (3)
  ('aktuar', 'archiv.view', 'Vereins-Archiv & KI einsehen'),
  ('aktuar', 'galerie.view', 'Galerie einsehen'),
  ('aktuar', 'anlaesse.view', 'Anlässe & Controlling einsehen'),

  -- 4. VERMIETER
  -- Manage (1)
  ('vermieter', 'vermietung.manage', 'Vermietung verwalten'),
  -- View (4)
  ('vermieter', 'rechnungen.view', 'Rechnungen einsehen'),
  ('vermieter', 'termine.view', 'Jahresprogramm & Termine einsehen'),
  ('vermieter', 'members.view', 'Mitgliederstamm einsehen'),
  ('vermieter', 'dokumente.view', 'Dokumente & Vorlagen einsehen'),

  -- 5. MATERIALWART
  -- Manage (1)
  ('materialwart', 'inventar.manage', 'Inventar & Material verwalten'),
  -- View (2)
  ('materialwart', 'members.view', 'Mitgliederstamm einsehen'),
  ('materialwart', 'termine.view', 'Jahresprogramm & Termine einsehen'),

  -- 6. VORSTAND (Allgemeines Vorstandsmitglied)
  -- View (9)
  ('vorstand', 'termine.view', 'Jahresprogramm & Termine einsehen'),
  ('vorstand', 'anlaesse.view', 'Anlässe & Controlling einsehen'),
  ('vorstand', 'umfragen.view', 'Anlässe & Umfragen einsehen'),
  ('vorstand', 'members.view', 'Mitgliederstamm einsehen'),
  ('vorstand', 'resultate.view', 'Resultate einsehen'),
  ('vorstand', 'archiv.view', 'Vereins-Archiv & KI einsehen'),
  ('vorstand', 'vermietung.view', 'Vermietung einsehen'),
  ('vorstand', 'news.view', 'News KI einsehen'),
  ('vorstand', 'galerie.view', 'Galerie einsehen');

-- 2. RPC: toggle_role_permission AUF ADMIN BESCHRÄNKEN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_role_permission(
    p_role public.app_role,
    p_permission TEXT,
    p_enable BOOLEAN,
    p_description TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- Nur System-Administratoren dürfen Rollenberechtigungen anpassen
    IF NOT (auth.has_role('admin') OR auth.role() = 'service_role') THEN
        IF auth.uid() IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Keine Berechtigung zur Änderung der Rollenmatrix (nur Administrator).');
        END IF;
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

-- auth.has_permission leitet auf live rbac_allows um
CREATE OR REPLACE FUNCTION auth.has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.rbac_allows(ARRAY[required_permission]);
$$;

-- 3. RECHNUNGSWESEN: HELFER AUF HARMONISIERTE SCHLÜSSEL UMSTELLEN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rbac_invoicing_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.rbac_allows(ARRAY[
    'rechnungen.manage',
    'jahresbeitrag.manage',
    'buchhaltung.manage',
    'vermietung.manage',
    'inventar.manage'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.rbac_invoicing_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.rbac_allows(ARRAY[
    'rechnungen.view',
    'rechnungen.manage',
    'jahresbeitrag.view',
    'jahresbeitrag.manage',
    'buchhaltung.view',
    'buchhaltung.manage',
    'vermietung.view',
    'vermietung.manage',
    'inventar.view',
    'inventar.manage'
  ]);
$$;

REVOKE ALL ON FUNCTION public.rbac_invoicing_write() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rbac_invoicing_read()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_invoicing_write() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_invoicing_read()  TO authenticated, service_role;

-- 4. RLS-POLICIES PRO TABELLE HARMONISIEREN
-- ------------------------------------------------------------------------------
-- Hilfsfunktion zur Zuweisung der Standard-Policies
DO $$
DECLARE
  rec RECORD;
  t text;
  pol record;
BEGIN
  -- Tabelle -> (view_perm, manage_perm)
  FOR rec IN (
    SELECT 'inventory_items' AS tbl, 'inventar.view' AS vp, 'inventar.manage' AS mp UNION ALL
    SELECT 'inventory_transactions', 'inventar.view', 'inventar.manage' UNION ALL
    SELECT 'inventory_audit_log', 'inventar.view', 'inventar.manage' UNION ALL
    SELECT 'inventory_config', 'inventar.view', 'inventar.manage' UNION ALL
    SELECT 'inventory_deposits', 'inventar.view', 'inventar.manage' UNION ALL
    SELECT 'termine', 'termine.view', 'termine.manage' UNION ALL
    SELECT 'termine_event_types', 'termine.view', 'termine.manage' UNION ALL
    SELECT 'termine_locations', 'termine.view', 'termine.manage' UNION ALL
    SELECT 'system_mail_configs', 'system-mails.view', 'system-mails.manage' UNION ALL
    SELECT 'events', 'anlaesse.view', 'anlaesse.manage' UNION ALL
    SELECT 'event_checklists', 'anlaesse.view', 'anlaesse.manage' UNION ALL
    SELECT 'event_items', 'anlaesse.view', 'anlaesse.manage' UNION ALL
    SELECT 'event_orders', 'anlaesse.view', 'anlaesse.manage' UNION ALL
    SELECT 'event_shifts', 'anlaesse.view', 'anlaesse.manage' UNION ALL
    SELECT 'event_shift_assignments', 'anlaesse.view', 'anlaesse.manage' UNION ALL
    SELECT 'poll_events', 'umfragen.view', 'umfragen.manage' UNION ALL
    SELECT 'poll_responses', 'umfragen.view', 'umfragen.manage' UNION ALL
    SELECT 'poll_responses_log', 'umfragen.view', 'umfragen.manage' UNION ALL
    SELECT 'poll_views', 'umfragen.view', 'umfragen.manage' UNION ALL
    SELECT 'contest_teams', 'manager.view', 'manager.manage' UNION ALL
    SELECT 'contest_setups', 'manager.view', 'manager.manage' UNION ALL
    SELECT 'contest_results', 'resultate.view', 'resultate.manage' UNION ALL
    SELECT 'contest_ocr_logs', 'resultate.view', 'resultate.manage' UNION ALL
    SELECT 'rental_requests', 'vermietung.view', 'vermietung.manage' UNION ALL
    SELECT 'rental_status_logs', 'vermietung.view', 'vermietung.manage' UNION ALL
    SELECT 'rental_pricing', 'vermietung.view', 'vermietung.manage' UNION ALL
    SELECT 'rental_settings', 'vermietung.view', 'vermietung.manage' UNION ALL
    SELECT 'rental_cancellation_feedbacks', 'vermietung.view', 'vermietung.manage' UNION ALL
    SELECT 'jm_seasons', 'jahresmeisterschaft.view', 'jahresmeisterschaft.manage' UNION ALL
    SELECT 'jm_competitions', 'jahresmeisterschaft.view', 'jahresmeisterschaft.manage' UNION ALL
    SELECT 'jm_shooters', 'jahresmeisterschaft.view', 'jahresmeisterschaft.manage' UNION ALL
    SELECT 'mail_logs', 'mail.view', 'mail.manage' UNION ALL
    SELECT 'communication_campaigns', 'mail.view', 'mail.manage' UNION ALL
    SELECT 'campaign_recipients', 'mail.view', 'mail.manage' UNION ALL
    SELECT 'campaign_attachments', 'mail.view', 'mail.manage' UNION ALL
    SELECT 'contributions_header', 'jahresbeitrag.view', 'jahresbeitrag.manage' UNION ALL
    SELECT 'contributions_positions', 'jahresbeitrag.view', 'jahresbeitrag.manage' UNION ALL
    SELECT 'gebuehren_config', 'jahresbeitrag.view', 'jahresbeitrag.manage' UNION ALL
    SELECT 'document_templates', 'dokumente.view', 'dokumente.manage' UNION ALL
    SELECT 'document_template_clauses', 'dokumente.view', 'dokumente.manage' UNION ALL
    SELECT 'document_generation_logs', 'dokumente.view', 'dokumente.manage' UNION ALL
    SELECT 'accounting_accounts', 'buchhaltung.view', 'buchhaltung.manage' UNION ALL
    SELECT 'accounting_journal', 'buchhaltung.view', 'buchhaltung.manage' UNION ALL
    SELECT 'accounting_budgets', 'buchhaltung.view', 'buchhaltung.manage' UNION ALL
    SELECT 'accounting_bank_rules', 'buchhaltung.view', 'buchhaltung.manage' UNION ALL
    SELECT 'members', 'members.view', 'members.manage' UNION ALL
    SELECT 'member_licenses', 'members.view', 'members.manage' UNION ALL
    SELECT 'member_functions', 'members.view', 'members.manage' UNION ALL
    SELECT 'member_history', 'members.view', 'members.manage' UNION ALL
    SELECT 'member_training', 'members.view', 'members.manage' UNION ALL
    SELECT 'member_participations', 'members.view', 'members.manage' UNION ALL
    SELECT 'gv_instances', 'gv.view', 'gv.manage' UNION ALL
    SELECT 'gv_traktanden', 'gv.view', 'gv.manage' UNION ALL
    SELECT 'gv_praesenz', 'gv.view', 'gv.manage'
  ) LOOP
    t := rec.tbl;
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabelle public.% existiert nicht – übersprungen', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Veraltete RBAC-/Auth-Policies auf dieser Tabelle entfernen
    FOR pol IN SELECT policyname FROM pg_policies 
               WHERE schemaname = 'public' AND tablename = t 
                 AND (policyname LIKE '%_rbac_%' 
                      OR policyname LIKE '%_manage_auth' 
                      OR policyname LIKE '%_select_auth'
                      OR policyname LIKE '%_manage'
                      OR policyname LIKE '%_anon_dev')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Harmonisierte Policies anlegen
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.rbac_allows(ARRAY[%L, %L])))',
      t || '_rbac_select', t, rec.vp, rec.mp);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT public.rbac_allows(ARRAY[%L]))) WITH CHECK ((SELECT public.rbac_allows(ARRAY[%L])))',
      t || '_rbac_write', t, rec.mp, rec.mp);
  END LOOP;
END$$;

-- 5. ÖFFENTLICHE ANON-POLICIES (Website-Kalender, Mietanfragen, Umfragen)
-- ------------------------------------------------------------------------------
-- Termine für Website-Kalender
DROP POLICY IF EXISTS termine_public_read ON public.termine;
CREATE POLICY termine_public_read ON public.termine FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS termine_types_public_read ON public.termine_event_types;
CREATE POLICY termine_types_public_read ON public.termine_event_types FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS termine_locations_public_read ON public.termine_locations;
CREATE POLICY termine_locations_public_read ON public.termine_locations FOR SELECT TO anon USING (true);

-- Vermietungsanfragen & Kalenderbelegung auf Website
DROP POLICY IF EXISTS rental_requests_public_read ON public.rental_requests;
CREATE POLICY rental_requests_public_read ON public.rental_requests FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS rental_requests_public_insert ON public.rental_requests;
CREATE POLICY rental_requests_public_insert ON public.rental_requests FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS rental_pricing_public_read ON public.rental_pricing;
CREATE POLICY rental_pricing_public_read ON public.rental_pricing FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS rental_settings_public_read ON public.rental_settings;
CREATE POLICY rental_settings_public_read ON public.rental_settings FOR SELECT TO anon USING (true);

-- Umfragen / RSVP öffentlich
DROP POLICY IF EXISTS poll_events_anon_read ON public.poll_events;
CREATE POLICY poll_events_anon_read ON public.poll_events FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS poll_responses_anon_all ON public.poll_responses;
CREATE POLICY poll_responses_anon_all ON public.poll_responses FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS poll_responses_log_anon_all ON public.poll_responses_log;
CREATE POLICY poll_responses_log_anon_all ON public.poll_responses_log FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS poll_views_anon_all ON public.poll_views;
CREATE POLICY poll_views_anon_all ON public.poll_views FOR ALL TO anon USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
