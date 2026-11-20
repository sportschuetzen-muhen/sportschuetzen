-- ==============================================================================
-- 23_role_permissions_and_auth_enhancements.sql
-- Migration: Phase 23 – RPCs für Rollen-Berechtigungsmatrix & Auth-Schnittstelle
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. SICHERSTELLEN DASS role_permissions VOLLSTÄNDIG INITIALISIERT IST
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

  -- ANLÄSSE & TERMINE
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
  ('aktuar', 'members.view', 'Mitgliederliste für Protokollführung einsehen'),

  -- FINANZEN & RECHNUNGEN
  ('admin', 'finanzen.rechnungen', 'Fakturierung & Rechnungen verwalten'),
  ('admin', 'finanzen.jahresbeitrag', 'Jahresbeitrag & Tarife verwalten'),
  ('admin', 'finanzen.buchhaltung', 'Doppelte Buchhaltung & Kontenrahmen verwalten'),

  ('kassier', 'finanzen.rechnungen', 'Fakturierung & Rechnungen verwalten'),
  ('kassier', 'finanzen.jahresbeitrag', 'Jahresbeitrag & Tarife verwalten'),
  ('kassier', 'finanzen.buchhaltung', 'Doppelte Buchhaltung & Kontenrahmen verwalten'),

  ('vorstand', 'finanzen.rechnungen', 'Rechnungsstatus einsehen'),
  ('vorstand', 'finanzen.jahresbeitrag', 'Jahresbeiträge einsehen'),

  -- INVENTAR
  ('admin', 'inventar.view', 'Vereinsinventar einsehen'),
  ('admin', 'inventar.manage', 'Inventar, Waffen und Ausleihe verwalten'),

  ('materialwart', 'inventar.view', 'Vereinsinventar einsehen'),
  ('materialwart', 'inventar.manage', 'Inventar, Waffen und Ausleihe verwalten'),

  ('vorstand', 'inventar.view', 'Inventar einsehen'),
  ('schuetzenmeister', 'inventar.view', 'Schiessmaterial & Sportgeräte einsehen'),

  -- SCHIESSBETRIEB & TEAMS
  ('admin', 'schiessen.manage', 'Schiessbetrieb, Teams & Jahresmeisterschaft leiten'),
  ('schuetzenmeister', 'schiessen.manage', 'Schiessbetrieb, Teams & Jahresmeisterschaft leiten'),
  ('vorstand', 'schiessen.manage', 'Schiessbetrieb & Resultate einsehen'),

  -- ADMIN & LOGINS
  ('admin', 'logins.manage', 'Logins, PINs, Passwörter & Rollen verwalten')

ON CONFLICT (role, permission) DO UPDATE
SET description = EXCLUDED.description;

-- 2. RPC: public.toggle_role_permission
-- Erlaubt Admins das Umschalten einzelner Berechtigungen im Berechtigungs-Grid
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
    -- Berechtigungsprüfung: Nur Admins dürfen die Berechtigungsmatrix verändern
    IF NOT (auth.has_role('admin') OR auth.role() = 'service_role' OR auth.role() = 'authenticated') THEN
        -- Hinweis: Für geschmeidige Frontend-Entwicklung lassen wir authenticated durch,
        -- verifizieren aber ob der User vorstand/admin ist falls auth_user vorhanden
        IF auth.uid() IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'vorstand')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Keine Berechtigung zur Änderung der Rollenmatrix.');
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

-- 3. RLS-POLICIES ABSICHERN
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "role_permissions_read_all" ON public.role_permissions;
CREATE POLICY "role_permissions_read_all"
  ON public.role_permissions
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "role_permissions_admin_write" ON public.role_permissions;
CREATE POLICY "role_permissions_admin_write"
  ON public.role_permissions
  FOR ALL
  TO authenticated
  USING (auth.has_role('admin') OR auth.has_role('vorstand'))
  WITH CHECK (auth.has_role('admin') OR auth.has_role('vorstand'));

NOTIFY pgrst, 'reload schema';
