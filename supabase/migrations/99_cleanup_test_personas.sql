-- ==============================================================================
-- 99_cleanup_test_personas.sql
-- Migration: Bereinigung der Test-Personas (Dan Kassier, Dan Vorstand, Dan Admin)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- 1. admin_profiles: person_number für 'admin' auf NULL setzen (reines Systemkonto)
UPDATE public.admin_profiles
SET person_number = NULL,
    updated_at = now()
WHERE username = 'admin';

-- 2. Test-Daten in Hilfstabellen löschen
DELETE FROM public.contributions_positions 
WHERE person_number IN ('7777777', '8888888', '9999999');

DELETE FROM public.contributions_header 
WHERE person_number IN ('7777777', '8888888', '9999999');

DELETE FROM public.gv_praesenz 
WHERE person_number::text IN ('7777777', '8888888', '9999999') 
   OR lizenz IN ('7777777', '8888888', '9999999');

DELETE FROM public.contest_setups 
WHERE person_number::text IN ('7777777', '8888888', '9999999');

DELETE FROM public.poll_responses 
WHERE lizenz IN ('7777777', '8888888', '9999999');

DELETE FROM public.poll_views 
WHERE lizenz IN ('7777777', '8888888', '9999999');

DELETE FROM public.push_notifications 
WHERE target_person_number IN (7777777, 8888888, 9999999);

DELETE FROM public.login_sessions 
WHERE user_id IN ('67bf200d-8112-4772-9bbe-6a9c01eaab44', 'c30a07a0-1465-4d1f-b075-c5bcb3e74b8e') 
   OR username IN ('Dan Kassier', 'Dan Vorstand', 'Dan Admin');

DELETE FROM public.user_roles 
WHERE user_id IN ('67bf200d-8112-4772-9bbe-6a9c01eaab44', 'c30a07a0-1465-4d1f-b075-c5bcb3e74b8e');

DELETE FROM public.admin_profiles 
WHERE person_number IN (7777777, 8888888) 
   OR auth_user_id IN ('67bf200d-8112-4772-9bbe-6a9c01eaab44', 'c30a07a0-1465-4d1f-b075-c5bcb3e74b8e');

-- 3. Schein-Mitglieder aus public.members löschen
DELETE FROM public.members 
WHERE person_number IN (7777777, 8888888, 9999999);

-- 4. Auth-Konten für Dan Kassier und Dan Vorstand löschen
DELETE FROM auth.identities 
WHERE user_id IN ('67bf200d-8112-4772-9bbe-6a9c01eaab44', 'c30a07a0-1465-4d1f-b075-c5bcb3e74b8e');

DELETE FROM auth.users 
WHERE id IN ('67bf200d-8112-4772-9bbe-6a9c01eaab44', 'c30a07a0-1465-4d1f-b075-c5bcb3e74b8e');

COMMIT;
