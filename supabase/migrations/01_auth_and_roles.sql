-- ==============================================================================
-- 01_auth_and_roles.sql
-- Migration: Phase 1 – Auth, Rollen & RLS-Fundament
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. ROLLEN-ENUM (app_role)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM (
            'admin',              -- System-Administrator (Wildcard-Rechte)
            'vorstand',           -- Vorstandsmitglied (allgemeine Führungsaufgaben)
            'schuetzenmeister',   -- Schiessbetrieb, Teams, Resultate
            'aktuar',             -- Protokolle, Korrespondenz, Anlässe
            'kassier',            -- Finanzen, Rechnungen, Buchhaltung
            'vermieter',          -- Schützenhaus-Vermietung
            'materialwart',       -- Vereinsinventar & Waffen/Material
            'member'              -- Angemeldetes Vereinsmitglied
        );
    END IF;
END$$;

-- 2. TABELLE: public.user_roles (Source of Truth für Benutzerrollen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_user_role UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- 3. TABELLE: public.role_permissions (Berechtigungs-Matrix)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role public.app_role NOT NULL,
    permission VARCHAR(100) NOT NULL,
    description TEXT,
    CONSTRAINT uq_role_permission UNIQUE (role, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_lookup ON public.role_permissions(role, permission);

-- 4. RLS-HILFSFUNKTIONEN (im Schema auth)
-- ------------------------------------------------------------------------------

-- auth.has_role(required_role)
CREATE OR REPLACE FUNCTION auth.has_role(required_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT (
    -- 1. Schneller Check im JWT Cache
    COALESCE(
      (auth.jwt() -> 'app_metadata' -> 'roles')::jsonb ? required_role::text,
      false
    )
    OR
    -- 2. Fallback / Source of Truth aus DB
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.role = required_role OR ur.role = 'admin')
    )
  );
$$;

-- auth.has_permission(required_permission)
CREATE OR REPLACE FUNCTION auth.has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT (
    -- 1. Schneller Check im JWT Cache
    COALESCE(
      (auth.jwt() -> 'app_metadata' -> 'permissions')::jsonb ? required_permission,
      false
    )
    OR
    -- 2. Fallback / Source of Truth aus DB (Admin erhält automatisch Wildcard)
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      LEFT JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = auth.uid()
        AND (rp.permission = required_permission OR ur.role = 'admin')
    )
  );
$$;

-- auth.has_any_permission(required_permissions)
CREATE OR REPLACE FUNCTION auth.has_any_permission(required_permissions text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT (
    -- 1. Check im JWT Cache
    COALESCE(
      (auth.jwt() -> 'app_metadata' -> 'permissions')::jsonb ?| required_permissions,
      false
    )
    OR
    -- 2. Fallback DB
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      LEFT JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = auth.uid()
        AND (rp.permission = ANY(required_permissions) OR ur.role = 'admin')
    )
  );
$$;

-- 5. CUSTOM ACCESS TOKEN HOOK (Füllt JWT app_metadata mit roles und permissions)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  user_id uuid;
  user_roles_arr text[];
  user_perms_arr text[];
  claims jsonb;
BEGIN
  user_id := (event->>'user_id')::uuid;
  claims := event->'claims';

  -- Aggregierte Rollen abfragen
  SELECT array_agg(DISTINCT role::text)
  INTO user_roles_arr
  FROM public.user_roles
  WHERE public.user_roles.user_id = custom_access_token_hook.user_id;

  -- Aggregierte Berechtigungen über alle Rollen abfragen
  SELECT array_agg(DISTINCT rp.permission)
  INTO user_perms_arr
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role = ur.role
  WHERE ur.user_id = custom_access_token_hook.user_id;

  -- Wenn Benutzer Admin ist, auch 'admin' Permission sicherstellen
  IF 'admin' = ANY(user_roles_arr) THEN
    user_perms_arr := array_append(user_perms_arr, '*');
  END IF;

  -- Claims mit Rollen und Permissions befüllen
  claims := jsonb_set(
    claims,
    '{app_metadata,roles}',
    to_jsonb(COALESCE(user_roles_arr, ARRAY[]::text[]))
  );

  claims := jsonb_set(
    claims,
    '{app_metadata,permissions}',
    to_jsonb(COALESCE(user_perms_arr, ARRAY[]::text[]))
  );

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Berechtigungen für Hook-Ausführung vergeben
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- 6. ROW LEVEL SECURITY (RLS) AKTIVIEREN & POLICIES ANLEGEN
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Policies für public.role_permissions:
-- Alle authentifizierten Benutzer dürfen Berechtigungen lesen (wichtig für Frontend/UI)
DROP POLICY IF EXISTS "role_permissions_read_all" ON public.role_permissions;
CREATE POLICY "role_permissions_read_all"
  ON public.role_permissions
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Nur Admins dürfen Berechtigungen verwalten
DROP POLICY IF EXISTS "role_permissions_admin_all" ON public.role_permissions;
CREATE POLICY "role_permissions_admin_all"
  ON public.role_permissions
  FOR ALL
  TO authenticated
  USING (auth.has_role('admin'))
  WITH CHECK (auth.has_role('admin'));

-- Policies für public.user_roles:
-- Benutzer können ihre eigenen Rollen einsehen
DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
CREATE POLICY "user_roles_read_own"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR auth.has_role('admin') OR auth.has_role('vorstand'));

-- Nur Admins können Rollen zuweisen oder entziehen
DROP POLICY IF EXISTS "user_roles_admin_write" ON public.user_roles;
CREATE POLICY "user_roles_admin_write"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (auth.has_role('admin'))
  WITH CHECK (auth.has_role('admin'));

-- 7. INITIALES SEED-DATA FÜR role_permissions (Matrix aus SUPABASE_ARCHITECTURE.md)
-- ------------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission, description)
VALUES
  -- VERMIETUNG
  ('admin', 'vermietung.view', 'Alle Buchungen & Kalender einsehen'),
  ('admin', 'vermietung.create', 'Buchung manuell anlegen'),
  ('admin', 'vermietung.edit', 'Buchungsdetails bearbeiten'),
  ('admin', 'vermietung.approve', 'Buchung bestätigen / Kalendereintrag erstellen'),
  ('admin', 'vermietung.cancel', 'Buchung ablehnen / stornieren'),
  ('admin', 'vermietung.contract', 'Mietvertrag erzeugen & archivieren'),

  ('vorstand', 'vermietung.view', 'Buchungen einsehen'),
  ('vorstand', 'vermietung.create', 'Buchung manuell anlegen'),
  ('vorstand', 'vermietung.edit', 'Buchungsdetails bearbeiten'),
  ('vorstand', 'vermietung.approve', 'Buchung freigeben'),
  ('vorstand', 'vermietung.cancel', 'Buchung stornieren'),
  ('vorstand', 'vermietung.contract', 'Vertrag einsehen/erzeugen'),

  ('vermieter', 'vermietung.view', 'Buchungen einsehen'),
  ('vermieter', 'vermietung.create', 'Buchung manuell anlegen'),
  ('vermieter', 'vermietung.edit', 'Buchungsdetails bearbeiten'),
  ('vermieter', 'vermietung.approve', 'Buchung freigeben'),
  ('vermieter', 'vermietung.cancel', 'Buchung stornieren'),
  ('vermieter', 'vermietung.contract', 'Mietvertrag erzeugen & archivieren'),

  ('kassier', 'vermietung.view', 'Buchungsübersicht & Zahlungsstatus einsehen'),
  ('kassier', 'vermietung.contract', 'Mietvertrag & Abrechnung einsehen'),

  -- ANLÄSSE
  ('admin', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('admin', 'anlaesse.view_internal', 'Interne Vereinsanlässe einsehen'),
  ('admin', 'anlaesse.manage', 'Anlässe erstellen, ändern, absagen'),
  ('admin', 'anlaesse.rsvp_self', 'Eigene An-/Abmeldung erfassen'),
  ('admin', 'anlaesse.rsvp_all', 'Teilnehmer- & Helferliste verwalten'),

  ('vorstand', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('vorstand', 'anlaesse.view_internal', 'Interne Anlässe einsehen'),
  ('vorstand', 'anlaesse.manage', 'Anlässe verwalten'),
  ('vorstand', 'anlaesse.rsvp_self', 'Eigene Anmeldung'),
  ('vorstand', 'anlaesse.rsvp_all', 'Teilnehmerliste verwalten'),

  ('schuetzenmeister', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('schuetzenmeister', 'anlaesse.view_internal', 'Interne Anlässe einsehen'),
  ('schuetzenmeister', 'anlaesse.manage', 'Schiessanlässe verwalten'),
  ('schuetzenmeister', 'anlaesse.rsvp_self', 'Eigene Anmeldung'),
  ('schuetzenmeister', 'anlaesse.rsvp_all', 'Teilnehmer & Schützen zuweisen'),

  ('aktuar', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('aktuar', 'anlaesse.view_internal', 'Interne Anlässe einsehen'),
  ('aktuar', 'anlaesse.manage', 'Anlässe erfassen & Protokolle verknüpfen'),
  ('aktuar', 'anlaesse.rsvp_self', 'Eigene Anmeldung'),

  ('kassier', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('kassier', 'anlaesse.view_internal', 'Interne Anlässe einsehen'),
  ('kassier', 'anlaesse.rsvp_self', 'Eigene Anmeldung'),

  ('vermieter', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('vermieter', 'anlaesse.view_internal', 'Interne Anlässe einsehen'),
  ('vermieter', 'anlaesse.rsvp_self', 'Eigene Anmeldung'),

  ('materialwart', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('materialwart', 'anlaesse.view_internal', 'Interne Anlässe einsehen'),
  ('materialwart', 'anlaesse.rsvp_self', 'Eigene Anmeldung'),

  ('member', 'anlaesse.view_public', 'Öffentliche Anlässe einsehen'),
  ('member', 'anlaesse.view_internal', 'Interne Anlässe einsehen'),
  ('member', 'anlaesse.rsvp_self', 'Eigene An-/Abmeldung erfassen'),

  -- MITGLIEDER
  ('admin', 'members.view', 'Mitgliederliste und Kontaktdaten einsehen'),
  ('admin', 'members.edit', 'Mitgliederstammdaten mutieren'),
  ('admin', 'members.export', 'Mitgliederdaten exportieren'),

  ('vorstand', 'members.view', 'Mitgliederliste einsehen'),
  ('vorstand', 'members.edit', 'Mitgliederdaten bearbeiten'),
  ('vorstand', 'members.export', 'Mitglieder exportieren'),

  ('kassier', 'members.view', 'Mitglieder für Beitragsabrechnung einsehen'),
  ('kassier', 'members.export', 'Debitoren- & Adresslisten exportieren'),

  ('schuetzenmeister', 'members.view', 'Mitglieder & Schiesslizenz-Status einsehen'),

  -- FINANZEN
  ('admin', 'finanzen.rechnungen', 'Fakturierung & Rechnungen verwalten'),
  ('admin', 'finanzen.buchhaltung', 'Doppelte Buchhaltung & Kontenrahmen verwalten'),

  ('kassier', 'finanzen.rechnungen', 'Fakturierung & Rechnungen verwalten'),
  ('kassier', 'finanzen.buchhaltung', 'Doppelte Buchhaltung & Kontenrahmen verwalten'),

  ('vorstand', 'finanzen.rechnungen', 'Rechnungsstatus einsehen'),

  -- INVENTAR
  ('admin', 'inventar.view', 'Vereinsinventar einsehen'),
  ('admin', 'inventar.manage', 'Inventar, Waffen und Ausleihe verwalten'),

  ('materialwart', 'inventar.view', 'Vereinsinventar einsehen'),
  ('materialwart', 'inventar.manage', 'Inventar, Waffen und Ausleihe verwalten'),

  ('vorstand', 'inventar.view', 'Inventar einsehen')

ON CONFLICT (role, permission) DO UPDATE
SET description = EXCLUDED.description;
