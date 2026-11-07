-- ==============================================================================
-- Rollback Script: Revert Access Members Import (Phase 118)
-- Stellt den Zustand vor dem Access-Import 1:1 wieder her.
-- ==============================================================================

BEGIN;

-- 1. Neu angelegte Archiv- und Verstorbenen-Datensätze löschen
DELETE FROM public.members
WHERE last_updated_by = 'Access-Import-2024'
  AND person_number >= 9000000;

-- 2. Bestehende angereicherte Mitglieder auf Originalzustand aus Snapshot zurücksetzen
UPDATE public.members m
SET 
    club_entry_date = b.club_entry_date,
    club_entry_date_source = b.club_entry_date_source,
    first_club_entry_date_ssv = b.first_club_entry_date_ssv,
    is_honorary = b.is_honorary,
    is_honorary_source = b.is_honorary_source,
    honorary_member_since = b.honorary_member_since,
    honorary_member_since_source = b.honorary_member_since_source,
    is_passive = b.is_passive,
    is_passive_source = b.is_passive_source,
    deceased = b.deceased,
    death_date = b.death_date,
    club_exit_date = b.club_exit_date,
    last_updated_by = b.last_updated_by,
    updated_at = b.updated_at
FROM public.members_backup_pre_access_20261107 b
WHERE m.person_number = b.person_number;

COMMIT;
