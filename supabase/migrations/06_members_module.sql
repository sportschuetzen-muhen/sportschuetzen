-- ==============================================================================
-- 06_members_module.sql
-- Migration: Phase 4 – Mitglieder-Stammdaten & SSV-Spiegelung (Read-Replica & Master)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. TABELLE: public.members (Mitglieder-Stammdaten)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
    person_number INTEGER PRIMARY KEY,                  -- SSV-Personennummer (z.B. 123456)
    address_number VARCHAR(50),                         -- Adressnummer / ehem. PIN
    salutation VARCHAR(50),                             -- Anrede (Herr, Frau, Familie, etc.)
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company VARCHAR(150),
    addition VARCHAR(150),                              -- Adresszusatz
    street VARCHAR(150),
    post_code VARCHAR(20),
    city VARCHAR(100),
    country VARCHAR(50) DEFAULT 'CH',
    
    -- Kommunikation & Kontaktdaten
    business_landline_phone VARCHAR(50),
    business_mobile_phone VARCHAR(50),
    private_landline_phone VARCHAR(50),
    private_mobile_phone VARCHAR(50),
    primary_email VARCHAR(255),
    additional_email VARCHAR(255),
    webpage VARCHAR(255),
    
    -- Persönliche Angaben
    gender VARCHAR(20),
    birth_date DATE,
    insurance_number VARCHAR(50),
    language VARCHAR(20) DEFAULT 'de',
    nationality VARCHAR(50) DEFAULT 'Schweiz',
    organization_number VARCHAR(50),
    organization_name VARCHAR(150),
    
    -- Status im Verein & SSV
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_passive BOOLEAN NOT NULL DEFAULT false,
    is_passive_source VARCHAR(50) DEFAULT 'ssv',        -- 'ssv' oder 'manual' (Source-Protection)
    is_honorary BOOLEAN NOT NULL DEFAULT false,
    is_honorary_source VARCHAR(50) DEFAULT 'ssv',       -- 'ssv' oder 'manual' (Source-Protection)
    
    club_entry_date DATE,
    club_entry_date_source VARCHAR(50) DEFAULT 'ssv',
    first_club_entry_date_ssv DATE,
    honorary_member_since DATE,
    honorary_member_since_source VARCHAR(50) DEFAULT 'ssv',
    
    deceased BOOLEAN NOT NULL DEFAULT false,
    death_date DATE,
    club_exit_date DATE,
    remark TEXT,
    newsletter_ssv_type VARCHAR(50),
    exported_on VARCHAR(50),
    
    -- Finanz- & Zahlungsdaten
    rechnungsversand VARCHAR(50),
    nie_mahnen BOOLEAN DEFAULT false,
    iban VARCHAR(50),
    bic VARCHAR(50),
    kontoinhaber VARCHAR(150),
    
    -- Login & Verknüpfung mit Supabase Auth
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Metadaten & Audit
    raw_data JSONB,                                     -- Vollständiger Originaldatensatz
    last_updated_by VARCHAR(100) DEFAULT 'System',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indizes für schnelle Suche & Lookups
CREATE INDEX IF NOT EXISTS idx_members_name ON public.members(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_members_email ON public.members(primary_email);
CREATE INDEX IF NOT EXISTS idx_members_active ON public.members(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_members_auth_user ON public.members(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_members_synced_at ON public.members(synced_at);

-- 2. TABELLE: public.member_licenses (Schiesslizenzen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_number INTEGER NOT NULL REFERENCES public.members(person_number) ON DELETE CASCADE,
    membership_category VARCHAR(150),                   -- z.B. 'Gewehr 50m', 'Gewehr 10m'
    license_category VARCHAR(100),                      -- z.B. 'A-Lizenz', 'B-Lizenz'
    license_type VARCHAR(100),                          -- z.B. 'U21', 'Elite', 'Senior'
    license_invoicing_club_number VARCHAR(50),          -- z.B. '1.19.0.01.029' (Muhen)
    license_invoicing_club_name VARCHAR(150),
    entry_date DATE,
    exit_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    import_quelle VARCHAR(100),
    last_updated TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_person ON public.member_licenses(person_number);
CREATE INDEX IF NOT EXISTS idx_licenses_active ON public.member_licenses(person_number, is_active);

-- 3. TABELLE: public.member_functions (Vorstand & Vereinschargen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_functions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_number INTEGER NOT NULL REFERENCES public.members(person_number) ON DELETE CASCADE,
    official_function_category VARCHAR(150) NOT NULL,   -- z.B. 'Präsident', 'Kassier', 'Aktuar'
    official_function_remark TEXT,
    official_function_entry_date DATE,
    official_function_exit_date DATE,
    use_on_board_and_functionary_report BOOLEAN DEFAULT false,
    rabattkategorie VARCHAR(100),                       -- z.B. 'Vorstand'
    import_quelle VARCHAR(100),
    last_updated TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_functions_person ON public.member_functions(person_number);
CREATE INDEX IF NOT EXISTS idx_functions_category ON public.member_functions(official_function_category);

-- 4. TABELLE: public.member_training (Ausbildungen & J+S)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_number INTEGER NOT NULL REFERENCES public.members(person_number) ON DELETE CASCADE,
    course_category VARCHAR(150),
    module VARCHAR(150),
    completed_training_date DATE,
    training_status VARCHAR(50),
    completed_training_expiration_date DATE,
    last_updated TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_person ON public.member_training(person_number);

-- 5. TABELLE: public.member_history (Audit-Log & Revisions-Historie)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_number INTEGER NOT NULL REFERENCES public.members(person_number) ON DELETE CASCADE,
    name VARCHAR(150),
    datum DATE NOT NULL DEFAULT CURRENT_DATE,
    ereignistyp VARCHAR(100) NOT NULL,                  -- 'NEU', 'AENDERUNG', 'ABGANG', 'LIZENZ', 'FUNKTION'
    alterwert TEXT,
    neuerwert TEXT,
    periodstart VARCHAR(50),
    periodend VARCHAR(50),
    phasekey VARCHAR(50),
    phasetype VARCHAR(50),
    source VARCHAR(100) DEFAULT 'SSV-Import',
    importid VARCHAR(100),
    erfasstam TIMESTAMPTZ NOT NULL DEFAULT now(),
    erfasstvon VARCHAR(100) DEFAULT 'System'
);

CREATE INDEX IF NOT EXISTS idx_history_person ON public.member_history(person_number);
CREATE INDEX IF NOT EXISTS idx_history_datum ON public.member_history(datum DESC);

-- 6. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_history ENABLE ROW LEVEL SECURITY;

-- Leseberechtigungen
DROP POLICY IF EXISTS members_select_auth ON public.members;
CREATE POLICY members_select_auth ON public.members
    FOR SELECT TO authenticated
    USING (auth.has_permission('members.view') OR auth.has_role('admin') OR auth.has_role('vorstand'));

DROP POLICY IF EXISTS member_licenses_select_auth ON public.member_licenses;
CREATE POLICY member_licenses_select_auth ON public.member_licenses
    FOR SELECT TO authenticated
    USING (auth.has_permission('members.view') OR auth.has_role('admin') OR auth.has_role('vorstand'));

DROP POLICY IF EXISTS member_functions_select_auth ON public.member_functions;
CREATE POLICY member_functions_select_auth ON public.member_functions
    FOR SELECT TO authenticated
    USING (auth.has_permission('members.view') OR auth.has_role('admin') OR auth.has_role('vorstand'));

DROP POLICY IF EXISTS member_training_select_auth ON public.member_training;
CREATE POLICY member_training_select_auth ON public.member_training
    FOR SELECT TO authenticated
    USING (auth.has_permission('members.view') OR auth.has_role('admin') OR auth.has_role('vorstand'));

DROP POLICY IF EXISTS member_history_select_auth ON public.member_history;
CREATE POLICY member_history_select_auth ON public.member_history
    FOR SELECT TO authenticated
    USING (auth.has_permission('members.view') OR auth.has_role('admin') OR auth.has_role('vorstand'));

-- Bearbeitungsberechtigungen
DROP POLICY IF EXISTS members_manage_auth ON public.members;
CREATE POLICY members_manage_auth ON public.members
    FOR ALL TO authenticated
    USING (auth.has_permission('members.edit') OR auth.has_role('admin'))
    WITH CHECK (auth.has_permission('members.edit') OR auth.has_role('admin'));

DROP POLICY IF EXISTS member_licenses_manage_auth ON public.member_licenses;
CREATE POLICY member_licenses_manage_auth ON public.member_licenses
    FOR ALL TO authenticated
    USING (auth.has_permission('members.edit') OR auth.has_role('admin'))
    WITH CHECK (auth.has_permission('members.edit') OR auth.has_role('admin'));

DROP POLICY IF EXISTS member_functions_manage_auth ON public.member_functions;
CREATE POLICY member_functions_manage_auth ON public.member_functions
    FOR ALL TO authenticated
    USING (auth.has_permission('members.edit') OR auth.has_role('admin'))
    WITH CHECK (auth.has_permission('members.edit') OR auth.has_role('admin'));

DROP POLICY IF EXISTS member_training_manage_auth ON public.member_training;
CREATE POLICY member_training_manage_auth ON public.member_training
    FOR ALL TO authenticated
    USING (auth.has_permission('members.edit') OR auth.has_role('admin'))
    WITH CHECK (auth.has_permission('members.edit') OR auth.has_role('admin'));

DROP POLICY IF EXISTS member_history_manage_auth ON public.member_history;
CREATE POLICY member_history_manage_auth ON public.member_history
    FOR ALL TO authenticated
    USING (auth.has_permission('members.edit') OR auth.has_role('admin'))
    WITH CHECK (auth.has_permission('members.edit') OR auth.has_role('admin'));

-- Entwicklungs- / Übergangs-Policies für das Vorstand-Portal (ANON_KEY):
DROP POLICY IF EXISTS members_anon_dev ON public.members;
CREATE POLICY members_anon_dev ON public.members FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS member_licenses_anon_dev ON public.member_licenses;
CREATE POLICY member_licenses_anon_dev ON public.member_licenses FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS member_functions_anon_dev ON public.member_functions;
CREATE POLICY member_functions_anon_dev ON public.member_functions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS member_training_anon_dev ON public.member_training;
CREATE POLICY member_training_anon_dev ON public.member_training FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS member_history_anon_dev ON public.member_history;
CREATE POLICY member_history_anon_dev ON public.member_history FOR ALL TO anon USING (true) WITH CHECK (true);

-- 7. FREMDSCHLÜSSEL IN rental_requests ABSICHERN
-- ------------------------------------------------------------------------------
ALTER TABLE public.rental_requests 
ADD COLUMN IF NOT EXISTS person_number INTEGER REFERENCES public.members(person_number) ON DELETE SET NULL;

