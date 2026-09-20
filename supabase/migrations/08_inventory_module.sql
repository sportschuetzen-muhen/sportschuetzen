-- ==============================================================================
-- 08_inventory_module.sql
-- Migration: Phase 7 – Inventar-Verwaltung (Waffen, Schlüssel, Bekleidung, Ausleihe)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. TABELLE: public.inventory_items (Vereinsinventar & Material)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id VARCHAR(50) PRIMARY KEY,                         -- z.B. 'G-01', 'S-04', 'K-12', 'SB-05'
    category VARCHAR(50) NOT NULL,                      -- 'gewehr', 'schluessel', 'kleidung', 'schiessbekleidung'
    status VARCHAR(50) NOT NULL DEFAULT 'Im Lager',     -- 'Im Lager', 'Ausgegeben', 'Defekt', 'Verkauft', 'Ausgemustert'
    current_owner_id INTEGER REFERENCES public.members(person_number) ON DELETE SET NULL,
    depot_amount NUMERIC(10, 2) DEFAULT 0.00,
    purchase_price NUMERIC(10, 2),
    purchase_date DATE,
    purchase_year VARCHAR(20),

    -- Gewehr-spezifische Attribute
    manufacturer VARCHAR(100),                          -- Hersteller (z.B. Bleiker, Walther, Grünig)
    model VARCHAR(100),                                 -- Modell (z.B. Challenger, Match 54)
    serial_number VARCHAR(100),                         -- Laufnummer / Seriennummer
    diopter VARCHAR(100),
    front_sight VARCHAR(100),                           -- Ringkorn
    accessories TEXT,                                   -- Zubehör
    special_notes TEXT,                                 -- Spezielles
    caliber_distance VARCHAR(50),                       -- '50m', '10m', '300m'
    owner_person_id VARCHAR(50),                        -- Eigentümer (falls Vereinsmitglied oder extern)
    donor_person_id VARCHAR(50),                        -- Gespendet von
    seller_person_id VARCHAR(50),                       -- Verkäufer

    -- Schlüssel-spezifische Attribute
    key_name VARCHAR(150),                              -- Bezeichnung (z.B. Hauptschlüssel Schützenhaus)
    key_number VARCHAR(50),                             -- Schlüsselnummer

    -- Bekleidungs-Attribute (Vereinskleidung & Schiessbekleidung)
    item_type VARCHAR(100),                             -- z.B. Poloshirt, Schiessjacke, Handschuh
    size VARCHAR(50),                                   -- S, M, L, XL, etc.

    -- Allgemeine Felder & Metadaten
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON public.inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_owner ON public.inventory_items(current_owner_id);

-- 2. TABELLE: public.inventory_transactions (Ausleihen, Rückgaben, Verkäufe)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(50),                              -- Für historische Zeilenreferenzen
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    action VARCHAR(50) NOT NULL,                        -- 'AUSGABE', 'CHECKIN', 'VERKAUF'
    member_id INTEGER REFERENCES public.members(person_number) ON DELETE SET NULL,
    item_id VARCHAR(50) REFERENCES public.inventory_items(id) ON DELETE SET NULL,
    category VARCHAR(50),                               -- 'gewehr', 'schluessel', 'kleidung', 'schiessbekleidung'
    condition_out VARCHAR(100),                         -- Zustand Abgabe (z.B. 'i.O.', 'Gebrauchsspuren')
    condition_in VARCHAR(100),                          -- Zustand Rückgabe
    notes TEXT,                                         -- Bemerkungen
    responsible_person VARCHAR(100),                    -- Erfasser / Vorstand / Materialwart
    deposit_amount NUMERIC(10, 2) DEFAULT 0.00,         -- Pfandbetrag
    deposit_received VARCHAR(20) DEFAULT '-',           -- 'Ja', 'Nein', '-'
    deposit_returned VARCHAR(20) DEFAULT '-',           -- 'Ja', 'Nein', '-'
    payment_method VARCHAR(50) DEFAULT '-',             -- 'Bar', 'Twint', 'Einzahlungsschein', '-'
    sig_member_url TEXT,                                -- Unterschrift Mitglied (Data-URL oder Link)
    sig_board_url TEXT,                                 -- Unterschrift Vorstand (Data-URL oder Link)
    pdf_url TEXT,                                       -- Quittungs-PDF URL
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_trans_item ON public.inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_member ON public.inventory_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_action ON public.inventory_transactions(action);
CREATE INDEX IF NOT EXISTS idx_inv_trans_time ON public.inventory_transactions(timestamp DESC);

-- 3. TABELLE: public.inventory_deposits (Pfand- & Kautionskasse)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_deposits (
    id VARCHAR(50) PRIMARY KEY,                         -- z.B. 'P-01' oder UUID
    member_id INTEGER REFERENCES public.members(person_number) ON DELETE CASCADE,
    item_id VARCHAR(50) REFERENCES public.inventory_items(id) ON DELETE SET NULL,
    category VARCHAR(50),
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    date_out TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_returned TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'Offen',        -- 'Offen', 'Retour', 'Verrechnet'
    payment_method VARCHAR(50) DEFAULT 'Bar',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_deposits_member ON public.inventory_deposits(member_id);
CREATE INDEX IF NOT EXISTS idx_inv_deposits_status ON public.inventory_deposits(status);

-- 4. TABELLE: public.inventory_audit_log (Revisions- & Protokoll)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_name VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    details TEXT
);

CREATE INDEX IF NOT EXISTS idx_inv_log_time ON public.inventory_audit_log(timestamp DESC);

-- 5. TABELLE: public.inventory_config (Dropdown-Wertelisten)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) NOT NULL,                   -- 'Schluessel_Bezeichnung', 'Gewehre_Distanz', 'Kleidung_Typ', etc.
    value VARCHAR(255) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_config_key ON public.inventory_config(config_key);

-- Initial-Werte für Dropdown-Konfiguration falls leer
INSERT INTO public.inventory_config (config_key, value, sort_order)
VALUES
    ('Transaktion_Zustand', 'i.O.', 1),
    ('Transaktion_Zustand', 'Gebrauchsspuren', 2),
    ('Transaktion_Zustand', 'Revisionsbedürftig', 3),
    ('Transaktion_Zustand', 'Defekt', 4),
    ('Gewehre_Distanz', '50m', 1),
    ('Gewehre_Distanz', '10m', 2),
    ('Gewehre_Distanz', '300m', 3),
    ('Kleidung_Typ', 'Poloshirt', 1),
    ('Kleidung_Typ', 'T-Shirt', 2),
    ('Kleidung_Typ', 'Softshell-Jacke', 3),
    ('Kleidung_Typ', 'Gilet', 4),
    ('Kleidung_Typ', 'Trainerhose', 5),
    ('Schiessbekleidung_Typ', 'Schiessjacke', 1),
    ('Schiessbekleidung_Typ', 'Schiesshose', 2),
    ('Schiessbekleidung_Typ', 'Schiesshandschuh', 3),
    ('Schiessbekleidung_Typ', 'Schiessschuhe', 4),
    ('Schiessbekleidung_Typ', 'Stativ', 5),
    ('Kleidung_Schiessbekleidung_Groesse', 'XS', 1),
    ('Kleidung_Schiessbekleidung_Groesse', 'S', 2),
    ('Kleidung_Schiessbekleidung_Groesse', 'M', 3),
    ('Kleidung_Schiessbekleidung_Groesse', 'L', 4),
    ('Kleidung_Schiessbekleidung_Groesse', 'XL', 5),
    ('Kleidung_Schiessbekleidung_Groesse', 'XXL', 6)
ON CONFLICT DO NOTHING;

-- 6. ROW-LEVEL SECURITY (RLS) & POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_config ENABLE ROW LEVEL SECURITY;

-- RBAC-Policies für Authentifizierte Benutzer (Materialwart, Admin, Vorstand)
DROP POLICY IF EXISTS inventory_items_select_auth ON public.inventory_items;
CREATE POLICY inventory_items_select_auth ON public.inventory_items
    FOR SELECT TO authenticated
    USING (auth.has_permission('inventar.view') OR auth.has_role('admin') OR auth.has_role('materialwart') OR auth.has_role('vorstand'));

DROP POLICY IF EXISTS inventory_items_manage_auth ON public.inventory_items;
CREATE POLICY inventory_items_manage_auth ON public.inventory_items
    FOR ALL TO authenticated
    USING (auth.has_permission('inventar.manage') OR auth.has_role('admin') OR auth.has_role('materialwart'))
    WITH CHECK (auth.has_permission('inventar.manage') OR auth.has_role('admin') OR auth.has_role('materialwart'));

DROP POLICY IF EXISTS inventory_transactions_all_auth ON public.inventory_transactions;
CREATE POLICY inventory_transactions_all_auth ON public.inventory_transactions
    FOR ALL TO authenticated
    USING (auth.has_permission('inventar.view') OR auth.has_role('admin') OR auth.has_role('materialwart') OR auth.has_role('vorstand'))
    WITH CHECK (auth.has_permission('inventar.manage') OR auth.has_role('admin') OR auth.has_role('materialwart') OR auth.has_role('vorstand'));

DROP POLICY IF EXISTS inventory_deposits_all_auth ON public.inventory_deposits;
CREATE POLICY inventory_deposits_all_auth ON public.inventory_deposits
    FOR ALL TO authenticated
    USING (auth.has_permission('inventar.view') OR auth.has_role('admin') OR auth.has_role('materialwart') OR auth.has_role('vorstand'))
    WITH CHECK (auth.has_permission('inventar.manage') OR auth.has_role('admin') OR auth.has_role('materialwart'));

DROP POLICY IF EXISTS inventory_audit_log_all_auth ON public.inventory_audit_log;
CREATE POLICY inventory_audit_log_all_auth ON public.inventory_audit_log
    FOR ALL TO authenticated
    USING (auth.has_permission('inventar.view') OR auth.has_role('admin') OR auth.has_role('materialwart') OR auth.has_role('vorstand'))
    WITH CHECK (true);

DROP POLICY IF EXISTS inventory_config_all_auth ON public.inventory_config;
CREATE POLICY inventory_config_all_auth ON public.inventory_config
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (auth.has_permission('inventar.manage') OR auth.has_role('admin'));

-- Entwicklungs- & Übergangs-Policies für das Vorstand-Portal (ANON_KEY):
DROP POLICY IF EXISTS inventory_items_anon_dev ON public.inventory_items;
CREATE POLICY inventory_items_anon_dev ON public.inventory_items FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_transactions_anon_dev ON public.inventory_transactions;
CREATE POLICY inventory_transactions_anon_dev ON public.inventory_transactions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_deposits_anon_dev ON public.inventory_deposits;
CREATE POLICY inventory_deposits_anon_dev ON public.inventory_deposits FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_audit_log_anon_dev ON public.inventory_audit_log;
CREATE POLICY inventory_audit_log_anon_dev ON public.inventory_audit_log FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_config_anon_dev ON public.inventory_config;
CREATE POLICY inventory_config_anon_dev ON public.inventory_config FOR ALL TO anon USING (true) WITH CHECK (true);
