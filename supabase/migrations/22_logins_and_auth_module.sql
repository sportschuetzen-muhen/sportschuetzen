-- ==============================================================================
-- 22_logins_and_auth_module.sql
-- Migration: Phase 22 – Supabase Auth, Admin-Profile, Login-Sessions & Mitglieder-Sync
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. TABELLE: public.admin_profiles
-- Speichert Vorstands- & Admin-Profile und verknüpft sie mit auth.users und public.members
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    person_number INTEGER REFERENCES public.members(person_number) ON DELETE SET NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role_external VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_username ON public.admin_profiles(username);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_email ON public.admin_profiles(email);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_pn ON public.admin_profiles(person_number);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_auth ON public.admin_profiles(auth_user_id);

-- 2. TABELLE: public.login_sessions
-- Ersetzt das Google Sheet 'login_sessions' für Online-Präsenz, Session-Dauer und Audit
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    username VARCHAR(100) NOT NULL,
    role VARCHAR(100),
    login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_sec INTEGER NOT NULL DEFAULT 0,
    ip_address VARCHAR(50),
    user_agent TEXT,
    is_online BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_sid ON public.login_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON public.login_sessions(username);
CREATE INDEX IF NOT EXISTS idx_login_sessions_online ON public.login_sessions(is_online, last_seen);

-- 3. STORAGE BUCKET: vereins-dokumente (für geschützte Website- & Vereinsdokumente)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vereins-dokumente',
    'vereins-dokumente',
    false, -- NICHT öffentlich! Zugriff nur via Supabase Auth / Signed URLs
    52428800, -- 50 MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800;

-- Storage RLS-Policies
DROP POLICY IF EXISTS "Authenticated Read vereins-dokumente" ON storage.objects;
CREATE POLICY "Authenticated Read vereins-dokumente" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'vereins-dokumente'
        AND (
            auth.has_role('member') 
            OR auth.has_role('vorstand') 
            OR auth.has_role('admin')
        )
    );

DROP POLICY IF EXISTS "Vorstand Insert vereins-dokumente" ON storage.objects;
CREATE POLICY "Vorstand Insert vereins-dokumente" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'vereins-dokumente'
        AND (auth.has_role('vorstand') OR auth.has_role('admin'))
    );

-- 4. RPC: public.resolve_login_identifier(identifier TEXT)
-- Löst Benutzername, PersonNumber, PIN oder E-Mail in die hinterlegte Auth-E-Mail auf
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    clean_id TEXT;
    res_email TEXT;
    res_user_id UUID;
    res_name TEXT;
    res_type TEXT;
    res_pn INTEGER;
BEGIN
    clean_id := TRIM(p_identifier);
    IF clean_id = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Identifikator darf nicht leer sein.');
    END IF;

    -- 1. Check in admin_profiles nach E-Mail oder Username
    SELECT ap.email, ap.auth_user_id, ap.display_name, ap.person_number
    INTO res_email, res_user_id, res_name, res_pn
    FROM public.admin_profiles ap
    WHERE LOWER(ap.username) = LOWER(clean_id)
       OR LOWER(ap.email) = LOWER(clean_id)
    LIMIT 1;

    IF FOUND AND res_email IS NOT NULL AND res_email <> '' THEN
        RETURN jsonb_build_object(
            'success', true,
            'email', res_email,
            'name', res_name,
            'type', 'admin',
            'person_number', res_pn,
            'auth_user_id', res_user_id
        );
    END IF;

    -- 2. Check in members (für Mitglieder, PWA & Website)
    -- Prüft: primary_email, person_number oder address_number / PIN (auch zero-padded)
    SELECT m.primary_email, m.auth_user_id, (m.first_name || ' ' || m.last_name), m.person_number
    INTO res_email, res_user_id, res_name, res_pn
    FROM public.members m
    WHERE LOWER(m.primary_email) = LOWER(clean_id)
       OR (clean_id ~ '^[0-9]+$' AND m.person_number = clean_id::INTEGER)
       OR m.address_number = clean_id
       OR m.address_number = LPAD(clean_id, 6, '0')
    LIMIT 1;

    IF FOUND THEN
        -- Falls Mitglied noch keine E-Mail hat, generieren wir eine deterministische Auth-Adresse
        IF res_email IS NULL OR TRIM(res_email) = '' THEN
            res_email := 'pn' || res_pn || '@members.sportschuetzen-muhen.ch';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'email', res_email,
            'name', res_name,
            'type', 'member',
            'person_number', res_pn,
            'auth_user_id', res_user_id
        );
    END IF;

    -- 3. Fallback: Wenn es direkt wie eine E-Mail aussieht
    IF clean_id LIKE '%@%' THEN
        RETURN jsonb_build_object(
            'success', true,
            'email', clean_id,
            'type', 'direct'
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Kein Benutzer mit dieser Kennung gefunden.');
END;
$$;

-- 5. RPC: public.sync_logins_from_members()
-- Gleicht Vorstands-Admins und Mitglieder-Konten mit den Stammdaten in public.members ab.
-- Füllt fehlende E-Mails, synchronisiert Namen und verknüpft PersonNumbers.
-- ------------------------------------------------------------------------------
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
    -- 1. Vorstands-Profile ohne Mail oder ohne PersonNumber abgleichen
    FOR admin_rec IN 
        SELECT ap.id, ap.username, ap.display_name, ap.email, ap.person_number 
        FROM public.admin_profiles ap
    LOOP
        -- Falls person_number vorhanden:
        IF admin_rec.person_number IS NOT NULL THEN
            SELECT * INTO m_rec FROM public.members WHERE person_number = admin_rec.person_number;
        ELSE
            -- Versuch über Vorname / Nachname Match
            SELECT * INTO m_rec FROM public.members 
            WHERE LOWER(first_name || ' ' || last_name) = LOWER(admin_rec.display_name)
               OR LOWER(last_name || ' ' || first_name) = LOWER(admin_rec.display_name)
               OR LOWER(admin_rec.username) = LOWER(first_name || '.' || last_name)
            LIMIT 1;
        END IF;

        IF m_rec.person_number IS NOT NULL THEN
            -- Update Admin-Profile mit Daten aus members
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

    -- 2. Anzahl aktiver Mitglieder mit Login-Fähigkeit zählen
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

-- 6. RPC: public.ping_login_session(p_session_id, p_username, p_role, p_device, p_ip)
-- Aktualisiert Online-Präsenz, setzt inaktive Sessions (> 5 Min) auf offline
-- und liefert die Liste aktuell aktiver Benutzer zurück
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ping_login_session(
    p_session_id TEXT,
    p_username TEXT,
    p_role TEXT DEFAULT 'vorstand',
    p_device TEXT DEFAULT 'Browser',
    p_ip TEXT DEFAULT 'unbekannt'
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
    dur INTEGER := 0;
BEGIN
    -- 1. Inaktive Sessions (> 5 Minuten ohne Ping) als offline markieren
    UPDATE public.login_sessions
    SET is_online = false
    WHERE is_online = true AND last_seen < (now_ts - INTERVAL '5 minutes');

    -- 2. Bestehende Session suchen
    SELECT * INTO existing_sess 
    FROM public.login_sessions 
    WHERE session_id = sess_id_val 
    ORDER BY created_at DESC 
    LIMIT 1;

    IF FOUND THEN
        dur := EXTRACT(EPOCH FROM (now_ts - existing_sess.login_time))::INTEGER;
        UPDATE public.login_sessions
        SET last_seen = now_ts,
            duration_sec = dur,
            is_online = true,
            role = COALESCE(p_role, role),
            ip_address = COALESCE(p_ip, ip_address),
            user_agent = COALESCE(p_device, user_agent)
        WHERE id = existing_sess.id;
    ELSE
        INSERT INTO public.login_sessions (
            session_id, username, role, user_agent, ip_address, login_time, last_seen, duration_sec, is_online
        ) VALUES (
            sess_id_val, user_name_val, p_role, p_device, p_ip, now_ts, now_ts, 0, true
        );
    END IF;

    -- 3. Liste der aktuell aktiven Benutzer aggregieren
    SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'username', username,
        'role', role,
        'lastSeen', to_char(last_seen AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY HH24:MI:SS'),
        'device', user_agent
    ))
    INTO active_users
    FROM public.login_sessions
    WHERE is_online = true;

    RETURN jsonb_build_object(
        'success', true,
        'onlineUsers', COALESCE(active_users, '[]'::jsonb),
        'serverTime', now_ts
    );
END;
$$;

-- 7. RLS-POLICIES FÜR DIE NEUEN TABELLEN
-- ------------------------------------------------------------------------------
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

-- admin_profiles Policies
DROP POLICY IF EXISTS "admin_profiles_read_all" ON public.admin_profiles;
CREATE POLICY "admin_profiles_read_all" ON public.admin_profiles
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "admin_profiles_admin_write" ON public.admin_profiles;
CREATE POLICY "admin_profiles_admin_write" ON public.admin_profiles
    FOR ALL TO authenticated
    USING (auth.has_role('admin') OR auth.uid() = auth_user_id)
    WITH CHECK (auth.has_role('admin') OR auth.uid() = auth_user_id);

-- login_sessions Policies
DROP POLICY IF EXISTS "login_sessions_read_all" ON public.login_sessions;
CREATE POLICY "login_sessions_read_all" ON public.login_sessions
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "login_sessions_insert_all" ON public.login_sessions;
CREATE POLICY "login_sessions_insert_all" ON public.login_sessions
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "login_sessions_update_all" ON public.login_sessions;
CREATE POLICY "login_sessions_update_all" ON public.login_sessions
    FOR UPDATE TO authenticated, anon
    USING (true);

-- 8. RPC: public.save_admin_profile
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_admin_profile(
    p_username TEXT,
    p_display_name TEXT,
    p_email TEXT,
    p_role_external TEXT DEFAULT NULL,
    p_person_number INTEGER DEFAULT NULL,
    p_roles TEXT[] DEFAULT ARRAY['vorstand']
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_auth_uid UUID;
    r_role TEXT;
BEGIN
    INSERT INTO public.admin_profiles (
        username, display_name, email, role_external, person_number, updated_at
    ) VALUES (
        TRIM(p_username), TRIM(p_display_name), TRIM(p_email), TRIM(p_role_external), p_person_number, now()
    )
    ON CONFLICT (username) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        role_external = EXCLUDED.role_external,
        person_number = COALESCE(EXCLUDED.person_number, admin_profiles.person_number),
        updated_at = now()
    RETURNING id, auth_user_id INTO v_admin_id, v_auth_uid;

    -- Falls mit auth.users verknüpft: Rollen aktualisieren
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
        'message', 'Admin-Profil erfolgreich gespeichert'
    );
END;
$$;

-- 9. RPC: public.delete_admin_profile
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_admin_profile(p_username TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_auth_uid UUID;
BEGIN
    SELECT auth_user_id INTO v_auth_uid FROM public.admin_profiles WHERE username = p_username;
    
    DELETE FROM public.admin_profiles WHERE username = p_username;
    
    IF v_auth_uid IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = v_auth_uid;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Admin-Profil gelöscht');
END;
$$;

