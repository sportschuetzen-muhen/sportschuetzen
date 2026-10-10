-- ==============================================================================
-- 59_admin_profiles_address_and_update_my_profile.sql
-- Migration: Eigene Profil- & Absenderdaten in public.admin_profiles
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. Spalten für Absender- und Kontaktdaten in admin_profiles ergänzen
ALTER TABLE public.admin_profiles 
    ADD COLUMN IF NOT EXISTS street VARCHAR(150),
    ADD COLUMN IF NOT EXISTS zip VARCHAR(20),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- 2. Datenübernahme aus public.members für bestehende Profile
UPDATE public.admin_profiles ap
SET 
    street = COALESCE(ap.street, m.street),
    zip = COALESCE(ap.zip, m.post_code::text),
    city = COALESCE(ap.city, m.city),
    phone = COALESCE(ap.phone, m.private_mobile_phone, m.business_mobile_phone)
FROM public.members m
WHERE ap.person_number = m.person_number;

-- 3. Initial-Aktualisierung der bestehenden Konten
-- Danhu -> Verknüpfung mit Daniel Hunziker (1073722)
UPDATE public.admin_profiles
SET 
    person_number = 1073722,
    role_external = COALESCE(NULLIF(role_external, 'admin'), 'Präsident / IT'),
    street = COALESCE(street, 'Rebweg 12'),
    zip = COALESCE(zip, '8181'),
    city = COALESCE(city, 'Höri'),
    phone = COALESCE(phone, '+41 79 578 51 68')
WHERE username = 'danhu';

-- Dan Admin (Test-Admin)
UPDATE public.admin_profiles
SET 
    role_external = 'Materialwart',
    street = COALESCE(street, 'Hard 1'),
    zip = COALESCE(zip, '5037'),
    city = COALESCE(city, 'Muhen'),
    phone = COALESCE(phone, '+41 79 578 51 68')
WHERE username = 'admin';

-- Beat Augsburger
UPDATE public.admin_profiles
SET 
    role_external = 'Mitgliederverwalter'
WHERE username = 'b.augsburger';

-- Dan Kassier
UPDATE public.admin_profiles
SET 
    role_external = 'Kassier',
    street = COALESCE(street, 'Kassierweg 5'),
    zip = COALESCE(zip, '5037'),
    city = COALESCE(city, 'Muhen')
WHERE username = 'dan.kassier';

-- Dan Vorstand
UPDATE public.admin_profiles
SET 
    role_external = 'Vorstand',
    street = COALESCE(street, 'Schützenmatt 10'),
    zip = COALESCE(zip, '5037'),
    city = COALESCE(city, 'Muhen')
WHERE username = 'dan.vorstand';

-- 4. RPC: public.get_my_profile()
-- Gibt das Profil des aktuell authentifizierten Benutzers zurück
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_prof RECORD;
    v_member RECORD;
    v_email TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert');
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

    SELECT * INTO v_prof 
    FROM public.admin_profiles 
    WHERE auth_user_id = v_uid 
       OR LOWER(email) = LOWER(v_email)
    LIMIT 1;

    IF v_prof.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kein Admin-Profil für dieses Konto gefunden');
    END IF;

    -- Falls noch nicht verknüpft: auth_user_id nachziehen
    IF v_prof.auth_user_id IS NULL THEN
        UPDATE public.admin_profiles SET auth_user_id = v_uid WHERE id = v_prof.id;
    END IF;

    IF v_prof.person_number IS NOT NULL THEN
        SELECT * INTO v_member FROM public.members WHERE person_number = v_prof.person_number LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'profile', jsonb_build_object(
            'id', v_prof.id,
            'auth_user_id', v_uid,
            'username', v_prof.username,
            'display_name', v_prof.display_name,
            'email', v_prof.email,
            'role_external', COALESCE(v_prof.role_external, ''),
            'person_number', v_prof.person_number,
            'street', COALESCE(v_prof.street, v_member.street, ''),
            'zip', COALESCE(v_prof.zip, v_member.post_code::text, ''),
            'city', COALESCE(v_prof.city, v_member.city, ''),
            'phone', COALESCE(v_prof.phone, v_member.private_mobile_phone, v_member.business_mobile_phone, ''),
            'member_first_name', v_member.first_name,
            'member_last_name', v_member.last_name
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, anon;

-- 5. RPC: public.update_my_profile(...)
-- Erlaubt jedem angemeldeten Benutzer, sein eigenes Profil & Absenderdaten zu aktualisieren
CREATE OR REPLACE FUNCTION public.update_my_profile(
    p_display_name TEXT DEFAULT NULL,
    p_role_external TEXT DEFAULT NULL,
    p_street TEXT DEFAULT NULL,
    p_zip TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_person_number INTEGER DEFAULT NULL
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
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert');
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

    -- Profil des aktuellen Benutzers suchen
    SELECT * INTO v_profile 
    FROM public.admin_profiles 
    WHERE auth_user_id = v_uid 
       OR LOWER(email) = LOWER(v_email)
    LIMIT 1;
    
    IF v_profile.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kein Profil für dieses Konto gefunden');
    END IF;

    -- Verknüpfung mit auth_user_id sicherstellen
    IF v_profile.auth_user_id IS NULL THEN
        UPDATE public.admin_profiles SET auth_user_id = v_uid WHERE id = v_profile.id;
    END IF;

    -- Profil aktualisieren
    UPDATE public.admin_profiles
    SET 
        display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), v_profile.display_name),
        role_external = COALESCE(TRIM(p_role_external), v_profile.role_external),
        street = NULLIF(TRIM(p_street), ''),
        zip = NULLIF(TRIM(p_zip), ''),
        city = NULLIF(TRIM(p_city), ''),
        phone = NULLIF(TRIM(p_phone), ''),
        email = COALESCE(NULLIF(TRIM(p_email), ''), v_profile.email),
        person_number = COALESCE(p_person_number, v_profile.person_number),
        updated_at = now()
    WHERE id = v_profile.id;

    RETURN jsonb_build_object('success', true, 'message', 'Profil erfolgreich aktualisiert');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile TO authenticated, anon;
