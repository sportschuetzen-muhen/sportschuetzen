-- ==============================================================================
-- 70_members_anon_select_policy.sql
-- Migration: Öffentliche Lese-Berechtigung auf aktive Mitglieder für Web-App PWA Login
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Hintergrund:
-- Nach Migration 49 (RBAC-Harmonisierung) fehlte auf public.members eine SELECT-Policy
-- für die Rolle 'anon'. Nicht angemeldete Besucher der PWA (sps-b55.pages.dev)
-- konnten daher die Teilnehmerliste im Login-Dropdown nicht laden ("Lade Teilnehmer...").
--
-- Lösung:
-- Dedizierte SELECT-Policy für 'anon' mit Filter auf is_active = true.
-- ==============================================================================

DROP POLICY IF EXISTS members_anon_select ON public.members;

CREATE POLICY members_anon_select ON public.members
  FOR SELECT TO anon
  USING (is_active = true);

-- Rechte sicherstellen
GRANT SELECT ON public.members TO anon, authenticated;
