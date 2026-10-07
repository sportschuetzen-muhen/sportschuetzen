-- ==============================================================================
-- 48_rbac_enforcement_pilot.sql
-- Migration: RBAC-Durchsetzung (Pilot: Navigation/Kacheln & Rechnungswesen)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Zweck:
-- 1. Live-Berechtigungsprüfung ohne JWT-Cache (public.rbac_allows)
-- 2. RPC public.my_permissions() als Quelle der Frontend-Rechte
-- 3. Neue Berechtigungsschlüssel für bisher nicht abbildbare Kacheln (Seed)
-- 4. Rechnungswesen: RLS-Policies (USING true / anon) durch Rechteprüfung ersetzen
-- 5. Anon-Zugriff auf Rechnungs-RPCs entziehen
-- Hinweis: public.invoice_layouts ist eine VIEW auf document_templates (offene Policies)
--          und wird erst in einer Folgephase zusammen mit document_templates abgesichert.
-- Dokumentation: docs/LOGINS_UND_BENUTZERVERWALTUNG.md, Abschnitt 10
-- ==============================================================================

-- 1. LIVE-PRÜFUNG GEGEN DIE BERECHTIGUNGSMATRIX (Admin = Wildcard)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rbac_allows(required_permissions text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = ur.role
            AND (rp.permission = ANY(required_permissions) OR rp.permission = '*')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.rbac_allows(text[]) IS
  'Live-Check (kein JWT-Cache): TRUE, wenn der angemeldete Benutzer Admin ist oder mindestens eine der Berechtigungen über user_roles/role_permissions besitzt.';

-- 2. EFFEKTIVE BERECHTIGUNGEN DES ANGEMELDETEN BENUTZERS (für das Frontend)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    ) THEN ARRAY['*']::text[]
    ELSE COALESCE((
      SELECT array_agg(DISTINCT rp.permission::text ORDER BY rp.permission::text)
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = auth.uid()
    ), ARRAY[]::text[])
  END;
$$;

COMMENT ON FUNCTION public.my_permissions() IS
  'Liefert die effektiven Berechtigungs-Schlüssel des angemeldeten Benutzers (Admin = [*]). Quelle der Frontend-Rechte (Navigation/Kacheln).';

-- 3. FACHLICHE ZUGRIFFSLISTEN RECHNUNGSWESEN (einzige Pflegestelle)
-- ------------------------------------------------------------------------------
-- Schreiben: Fachmodule lösen Rechnungen über den RechnungsCore aus.
CREATE OR REPLACE FUNCTION public.rbac_invoicing_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.rbac_allows(ARRAY[
    'finanzen.rechnungen',
    'finanzen.jahresbeitrag',
    'finanzen.buchhaltung',
    'vermietung.edit',
    'vermietung.approve',
    'vermietung.contract',
    'inventar.manage'
  ]);
$$;

-- Lesen: Schreibberechtigte + reine Ansichtsrechte der auslösenden Fachmodule.
CREATE OR REPLACE FUNCTION public.rbac_invoicing_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.rbac_allows(ARRAY[
    'finanzen.rechnungen',
    'finanzen.jahresbeitrag',
    'finanzen.buchhaltung',
    'vermietung.view',
    'vermietung.edit',
    'vermietung.approve',
    'vermietung.contract',
    'inventar.view',
    'inventar.manage'
  ]);
$$;

REVOKE ALL ON FUNCTION public.rbac_allows(text[])     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_permissions()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rbac_invoicing_write()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rbac_invoicing_read()   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_allows(text[])    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_permissions()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_invoicing_write() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_invoicing_read()  TO authenticated, service_role;

-- 4. NEUE BERECHTIGUNGSSCHLÜSSEL (Seed = bisheriges data-roles-Verhalten, ohne 'vorstand')
-- ------------------------------------------------------------------------------
-- Bestehende Schlüssel/Zuweisungen bleiben unangetastet (ON CONFLICT DO NOTHING).
INSERT INTO public.role_permissions (role, permission, description)
SELECT v.role::public.app_role, v.permission, v.description
FROM (VALUES
  -- Jahresprogramm / Termine
  ('schuetzenmeister','termine.manage','Jahresprogramm & Termine verwalten'),
  ('aktuar',          'termine.manage','Jahresprogramm & Termine verwalten'),
  ('kassier',         'termine.manage','Jahresprogramm & Termine verwalten'),
  ('vermieter',       'termine.manage','Jahresprogramm & Termine verwalten'),
  -- Anlässe & Umfragen
  ('schuetzenmeister','umfragen.manage','Anlässe, Umfragen & RSVP verwalten'),
  ('aktuar',          'umfragen.manage','Anlässe, Umfragen & RSVP verwalten'),
  ('kassier',         'umfragen.manage','Anlässe, Umfragen & RSVP verwalten'),
  -- Dokumenten-Vorlagen & Kampagnen
  ('kassier',         'dokumente.manage','Dokumenten-Vorlagen & Kampagnen'),
  ('aktuar',          'dokumente.manage','Dokumenten-Vorlagen & Kampagnen'),
  ('vermieter',       'dokumente.manage','Dokumenten-Vorlagen & Kampagnen'),
  -- Vereins-Archiv & KI
  ('schuetzenmeister','archiv.view','Vereins-Archiv & KI-Suche'),
  ('aktuar',          'archiv.view','Vereins-Archiv & KI-Suche'),
  ('kassier',         'archiv.view','Vereins-Archiv & KI-Suche'),
  -- Meeting-Recorder
  ('schuetzenmeister','meeting.record','Meeting-Recorder & Protokolle'),
  ('aktuar',          'meeting.record','Meeting-Recorder & Protokolle'),
  ('kassier',         'meeting.record','Meeting-Recorder & Protokolle'),
  -- News KI
  ('schuetzenmeister','news.manage','News-Berichte (KI) erstellen'),
  ('aktuar',          'news.manage','News-Berichte (KI) erstellen'),
  ('kassier',         'news.manage','News-Berichte (KI) erstellen'),
  -- Galerie Manager
  ('schuetzenmeister','galerie.manage','Galerie, Gesichtserkennung & EXIF-Tagging'),
  ('aktuar',          'galerie.manage','Galerie, Gesichtserkennung & EXIF-Tagging'),
  ('kassier',         'galerie.manage','Galerie, Gesichtserkennung & EXIF-Tagging')
) AS v(role, permission, description)
ON CONFLICT (role, permission) DO NOTHING;

-- 5. RECHNUNGSWESEN: RLS DURCHSETZEN
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t   text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices', 'invoice_positions', 'invoice_payments',
    'invoice_templates', 'external_contacts'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabelle public.% existiert nicht – übersprungen', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Alle bisherigen Policies (USING true / dev_anon) entfernen
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.rbac_invoicing_read()))',
      t || '_rbac_select', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT public.rbac_invoicing_write())) WITH CHECK ((SELECT public.rbac_invoicing_write()))',
      t || '_rbac_write', t);
  END LOOP;
END$$;

-- 6. ANON-ZUGRIFF AUF RECHNUNGS-RPCs ENTZIEHEN
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(VARCHAR, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.next_invoice_number(VARCHAR, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_invoice_payment(VARCHAR, NUMERIC, DATE, VARCHAR, VARCHAR, TEXT, BOOLEAN, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_invoice_payment(VARCHAR, NUMERIC, DATE, VARCHAR, VARCHAR, TEXT, BOOLEAN, VARCHAR, VARCHAR) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
