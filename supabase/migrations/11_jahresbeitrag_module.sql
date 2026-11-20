-- ==============================================================================
-- 11_jahresbeitrag_module.sql
-- Migration: Fachmodul JAHRESBEITRAG & BEITRAGSVERWALTUNG (Phase 9)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.contributions_header: Beitragsrechnungen je Mitglied & Jahr
-- 2. public.contributions_positions: Detaillierte Rechnungspositionen (Beitrag, Lizenzen, Schiessgelder)
-- 3. public.member_participations: Wettkampfteilnahmen für Beitragsrabatte & Schiessgelder
-- 4. public.gebuehren_config: Dynamische Gebührenordnung (JB001-JB007, LI001-LI003, GE001, Wettkämpfe)
-- ==============================================================================

-- 1. TABELLE: public.contributions_header (Beitragsköpfe)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contributions_header (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. '1', '2', '2026-1001'
    person_number VARCHAR(50) NOT NULL,                 -- SSV-Personennummer oder 'INT-XXXX'
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    status VARCHAR(30) NOT NULL DEFAULT 'offen',        -- 'offen', 'bezahlt', 'storniert'
    gesamt NUMERIC(10,2) NOT NULL DEFAULT 0.00,         -- Gesamtbetrag in CHF
    payment_date DATE,
    payment_method VARCHAR(50),                         -- 'Überweisung', 'Bar', 'TWINT', 'CAMT053'
    document_ref VARCHAR(100),                          -- Beleg-Referenz / Buchungsvermerk
    invoice_id VARCHAR(50) REFERENCES public.invoices(id) ON DELETE SET NULL, -- Verknüpfung zur Rechnung
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contrib_pn_year UNIQUE (person_number, year)
);

CREATE INDEX IF NOT EXISTS idx_contrib_head_year ON public.contributions_header(year);
CREATE INDEX IF NOT EXISTS idx_contrib_head_status ON public.contributions_header(status);
CREATE INDEX IF NOT EXISTS idx_contrib_head_pn ON public.contributions_header(person_number);
CREATE INDEX IF NOT EXISTS idx_contrib_head_inv ON public.contributions_header(invoice_id);

-- 2. TABELLE: public.contributions_positions (Beitragspositionen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contributions_positions (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. '1', '2', UUID
    header_id VARCHAR(50) NOT NULL REFERENCES public.contributions_header(id) ON DELETE CASCADE,
    person_number VARCHAR(50) NOT NULL,
    year INTEGER NOT NULL,
    position_nr INTEGER NOT NULL DEFAULT 1,
    beschreibung VARCHAR(255) NOT NULL,
    betrag NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    typ VARCHAR(20) NOT NULL DEFAULT 'Debit',           -- 'Debit', 'Credit'
    source_field VARCHAR(50),                           -- Gebühren-Schlüssel (z. B. 'JB001', 'LI001', 'GE001', 'Z1', 'KK006')
    konto VARCHAR(20) DEFAULT '3000',                   -- Haben-Konto für Buchhaltung
    last_upd TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrib_pos_header ON public.contributions_positions(header_id);
CREATE INDEX IF NOT EXISTS idx_contrib_pos_pn_year ON public.contributions_positions(person_number, year);
CREATE INDEX IF NOT EXISTS idx_contrib_pos_source ON public.contributions_positions(source_field);

-- 3. TABELLE: public.member_participations (Wettkampfteilnahmen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_participations (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. '1', '2', UUID
    person_number VARCHAR(50) NOT NULL,
    year INTEGER NOT NULL,
    event_key VARCHAR(50) NOT NULL,                     -- z. B. 'KK001', 'KK006', 'LG001', 'LG005'
    teilgenommen INTEGER NOT NULL DEFAULT 0,            -- 1 = teilgenommen, 0 = nicht teilgenommen
    quelle VARCHAR(50) DEFAULT 'schnellerfassung',      -- 'schnellerfassung', 'excel-import', 'ssv-rawimport'
    erfasst_am TIMESTAMPTZ DEFAULT now(),
    erfasst_von VARCHAR(100) DEFAULT 'system',
    CONSTRAINT uq_member_event_year UNIQUE (person_number, year, event_key)
);

CREATE INDEX IF NOT EXISTS idx_contrib_part_pn_year ON public.member_participations(person_number, year);
CREATE INDEX IF NOT EXISTS idx_contrib_part_event ON public.member_participations(event_key);

-- 4. TABELLE: public.gebuehren_config (Dynamische Gebührenordnung)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gebuehren_config (
    key VARCHAR(50) PRIMARY KEY,                        -- 'JB001', 'JB002', 'LI001', 'GE001', 'Z001'
    bezeichnung VARCHAR(150) NOT NULL,
    bezeichnung_frontend VARCHAR(150),
    betrag NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    konto_haben VARCHAR(20) DEFAULT '3000',
    kategorie VARCHAR(50) DEFAULT 'Jahresbeitrag',      -- 'Jahresbeitrag', 'Lizenz', 'Schiessgeld', 'Wettkampf', 'Zusatz'
    sort_order INTEGER DEFAULT 10,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gebuehren_kategorie ON public.gebuehren_config(kategorie);

-- 5. INITIALDATEN: public.gebuehren_config (Standard-Gebührenordnung)
-- ------------------------------------------------------------------------------
INSERT INTO public.gebuehren_config (key, bezeichnung, bezeichnung_frontend, betrag, konto_haben, kategorie, sort_order)
VALUES
    ('JB001', 'Jahresbeitrag Aktiv A G50m', 'Aktiv A (G50m)', 100.00, '3000', 'Jahresbeitrag', 10),
    ('JB002', 'Jahresbeitrag Aktiv B G50m', 'Aktiv B (G50m)', 70.00, '3000', 'Jahresbeitrag', 20),
    ('JB003', 'Jahresbeitrag Aktiv nur 10m', 'Aktiv (nur G10m)', 10.00, '3000', 'Jahresbeitrag', 30),
    ('JB004', 'Jahresbeitrag Ehrenmitglied', 'Ehrenmitglied', 0.00, '3000', 'Jahresbeitrag', 40),
    ('JB005', 'Jahresbeitrag Passivmitglied', 'Passivmitglied', 20.00, '3010', 'Jahresbeitrag', 50),
    ('JB006', 'Schüler intern (ohne Lizenz)', 'Schüler intern', 0.00, '3000', 'Jahresbeitrag', 60),
    ('JB007', 'Jahresbeitrag Junior', 'Junior / Nachwuchs', 20.00, '3000', 'Jahresbeitrag', 70),
    ('LI001', 'Lizenz eigener Verein (Normal)', 'Lizenz Verein', 18.00, '3100', 'Lizenz', 110),
    ('LI002', 'Lizenz eigener Verein (Junior)', 'Lizenz Junior', 0.00, '3100', 'Lizenz', 120),
    ('LI003', 'Lizenz anderer Verein', 'Lizenz Fremdverein', 0.00, '3100', 'Lizenz', 130),
    ('GE001', 'Nutzungsgebühr Schützenhaus', 'Schützenhaus-Beitrag', 50.00, '3400', 'Schiessgeld', 210),
    ('KK001', 'Grenzlandschiessen 50m', 'Grenzland 50m', 25.00, '3200', 'Wettkampf', 310),
    ('KK006', 'Verbandsschiessen 50m', 'Verbandsschiessen 50m', 20.00, '3200', 'Wettkampf', 320),
    ('KK007', 'Vereinsschiessen 50m', 'Vereinsschiessen 50m', 20.00, '3200', 'Wettkampf', 330),
    ('LG001', 'Aargauer Dezentralisiert 10m', 'AG DEZ 10m', 15.00, '3210', 'Wettkampf', 410),
    ('LG002', 'AG Dezentralisiert 10m Auflage', 'AG DEZ Auflage 10m', 15.00, '3210', 'Wettkampf', 420),
    ('LG003', 'Schweizer Dezentralisiert 10m', 'CH DEZ 10m', 18.00, '3210', 'Wettkampf', 430),
    ('LG004', 'CH Dezentralisiert 10m Auflage', 'CH DEZ Auflage 10m', 18.00, '3210', 'Wettkampf', 440),
    ('LG005', 'Verbandsschiessen 10m', 'Verband 10m', 15.00, '3210', 'Wettkampf', 450),
    ('LG006', 'Vereinsschiessen 10m', 'Verein 10m', 15.00, '3210', 'Wettkampf', 460),
    ('LG007', 'CH Kniendmeisterschaft 10m', 'CH Kniend 10m', 15.00, '3210', 'Wettkampf', 470),
    ('Z001', 'Zusatzposition 1', 'Zusatz 1 (z.B. Jacke)', 0.00, '8500', 'Zusatz', 510),
    ('Z002', 'Zusatzposition 2', 'Zusatz 2 (Gutschrift/Transitorisch)', 0.00, '1300', 'Zusatz', 520)
ON CONFLICT (key) DO NOTHING;

-- 6. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.contributions_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gebuehren_config ENABLE ROW LEVEL SECURITY;

-- Leserechte für Authentifizierte Benutzer (Vorstand, Kassier, Schützenmeister)
CREATE POLICY "contributions_head_select" ON public.contributions_header
    FOR SELECT TO authenticated
    USING (
        auth.has_permission('finanzen.rechnungen')
        OR auth.has_permission('members.view')
        OR person_number IN (SELECT person_number::varchar FROM public.members WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "contributions_pos_select" ON public.contributions_positions
    FOR SELECT TO authenticated
    USING (
        auth.has_permission('finanzen.rechnungen')
        OR auth.has_permission('members.view')
        OR person_number IN (SELECT person_number::varchar FROM public.members WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "member_participations_select" ON public.member_participations
    FOR SELECT TO authenticated
    USING (
        auth.has_permission('finanzen.rechnungen')
        OR auth.has_permission('members.view')
        OR person_number IN (SELECT person_number::varchar FROM public.members WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "gebuehren_config_select" ON public.gebuehren_config
    FOR SELECT TO authenticated, anon
    USING (true);

-- Schreibrechte für Vorstand / Kassier
CREATE POLICY "contributions_head_manage" ON public.contributions_header
    FOR ALL TO authenticated
    USING (auth.has_permission('finanzen.rechnungen'))
    WITH CHECK (auth.has_permission('finanzen.rechnungen'));

CREATE POLICY "contributions_pos_manage" ON public.contributions_positions
    FOR ALL TO authenticated
    USING (auth.has_permission('finanzen.rechnungen'))
    WITH CHECK (auth.has_permission('finanzen.rechnungen'));

CREATE POLICY "member_participations_manage" ON public.member_participations
    FOR ALL TO authenticated
    USING (auth.has_permission('finanzen.rechnungen') OR auth.has_permission('members.edit'))
    WITH CHECK (auth.has_permission('finanzen.rechnungen') OR auth.has_permission('members.edit'));

CREATE POLICY "gebuehren_config_manage" ON public.gebuehren_config
    FOR ALL TO authenticated
    USING (auth.has_permission('finanzen.rechnungen'))
    WITH CHECK (auth.has_permission('finanzen.rechnungen'));

-- 7. ENTWICKLUNGS- & ÜBERGANGS-POLICIES (ANON_KEY)
-- ------------------------------------------------------------------------------
CREATE POLICY "contributions_head_anon_all" ON public.contributions_header FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "contributions_pos_anon_all" ON public.contributions_positions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "member_participations_anon_all" ON public.member_participations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "gebuehren_config_anon_all" ON public.gebuehren_config FOR ALL TO anon USING (true) WITH CHECK (true);
