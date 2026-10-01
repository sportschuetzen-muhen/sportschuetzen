-- ==============================================================================
-- 32_fix_member_licenses_unique_index.sql
-- Migration: Eindeutiger Index für public.member_licenses zur Unterstützung von
--            ON CONFLICT (person_number, membership_category, entry_date)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. Bestehende Dubletten bereinigen (falls noch vorhanden)
DELETE FROM public.member_licenses a
USING public.member_licenses b
WHERE a.person_number = b.person_number
  AND a.membership_category = b.membership_category
  AND (a.entry_date = b.entry_date OR (a.entry_date IS NULL AND b.entry_date IS NULL))
  AND (
    (a.is_active = false AND b.is_active = true)
    OR (a.is_active = b.is_active AND a.updated_at < b.updated_at)
    OR (a.is_active = b.is_active AND a.updated_at = b.updated_at AND a.ctid < b.ctid)
  );

-- 2. Eindeutigen Index mit NULLS NOT DISTINCT anlegen (PostgreSQL 17 kompatibel)
-- Ermöglicht reibungslose UPSERTs via ON CONFLICT (person_number, membership_category, entry_date)
-- auch bei leerem / nicht gesetztem Eintrittsdatum (entry_date IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_unique 
ON public.member_licenses (person_number, membership_category, entry_date) 
NULLS NOT DISTINCT;
