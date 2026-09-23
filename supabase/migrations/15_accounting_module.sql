-- ==============================================================================
-- 15_accounting_module.sql
-- Migration: Fachmodul FINANZBUCHHALTUNG (FiBu) (Phase 11)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.accounting_accounts: KMU-Kontenrahmen (Kontonummer, Bezeichnung,
--    Klasse/Kategorie, Eröffnungssaldo, Sortierung)
-- 2. public.accounting_journal: Hauptbuch & Kassabuch-Journal (ID, Jahr,
--    Datum, Beleg-Nr, Beschreibung, Konto Soll, Konto Haben, Betrag,
--    Typ, Buchungstyp)
-- 3. public.accounting_budgets: Jahresbudgets je Konto und Jahr
-- 4. public.accounting_bank_rules: Automatisierungs-Regeln für CAMT.053
--    Bankabgleich
-- ==============================================================================

-- 1. TABELLE: public.accounting_accounts (KMU-Kontenrahmen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_accounts (
    konto VARCHAR(50) PRIMARY KEY,                       -- z. B. '1000', '1020', '2000', '3000'
    bezeichnung VARCHAR(255) NOT NULL,                  -- z. B. 'Kasse', 'Raiffeisen Betriebskonto', 'Mitgliederbeiträge'
    klasse VARCHAR(100) NOT NULL,                       -- z. B. '10 Aktiven', '20 Passiven', '30 Ertrag', '40 Aufwand'
    eroeffnungssaldo NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_accounts_klasse ON public.accounting_accounts(klasse);
CREATE INDEX IF NOT EXISTS idx_acc_accounts_sort ON public.accounting_accounts(sort_order);

COMMENT ON TABLE public.accounting_accounts IS
    'KMU-Kontenrahmen für die doppelte Buchhaltung der Sportschützen Muhen.';

-- 2. TABELLE: public.accounting_journal (Hauptbuch & Kassabuch-Journal)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_journal (
    id BIGSERIAL PRIMARY KEY,
    jahr INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    datum DATE NOT NULL DEFAULT CURRENT_DATE,
    beleg_nr VARCHAR(100) NOT NULL DEFAULT '',
    beschreibung TEXT NOT NULL DEFAULT '',
    konto_soll VARCHAR(50) NOT NULL REFERENCES public.accounting_accounts(konto) ON UPDATE CASCADE ON DELETE RESTRICT,
    konto_haben VARCHAR(50) NOT NULL REFERENCES public.accounting_accounts(konto) ON UPDATE CASCADE ON DELETE RESTRICT,
    betrag NUMERIC(12,2) NOT NULL CHECK (betrag > 0),
    typ VARCHAR(50) NOT NULL DEFAULT 'Kassa',           -- 'Kassa', 'Bank', 'Rechnung', 'Umbuchung', 'Kaution', etc.
    buchungstyp VARCHAR(50) NOT NULL DEFAULT 'TRANSIT',  -- 'ERTRAG', 'AUFWAND', 'TRANSIT', 'KASSE', 'BANK', 'DEBITOR'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_journal_jahr ON public.accounting_journal(jahr);
CREATE INDEX IF NOT EXISTS idx_acc_journal_datum ON public.accounting_journal(datum);
CREATE INDEX IF NOT EXISTS idx_acc_journal_beleg ON public.accounting_journal(beleg_nr);
CREATE INDEX IF NOT EXISTS idx_acc_journal_soll ON public.accounting_journal(konto_soll);
CREATE INDEX IF NOT EXISTS idx_acc_journal_haben ON public.accounting_journal(konto_haben);
CREATE INDEX IF NOT EXISTS idx_acc_journal_buchungstyp ON public.accounting_journal(buchungstyp);
CREATE INDEX IF NOT EXISTS idx_acc_journal_created ON public.accounting_journal(created_at DESC);

COMMENT ON TABLE public.accounting_journal IS
    'Journal und Hauptbuch der doppelten Buchhaltung mit Soll-/Haben-Buchungssätzen.';

-- 3. TABELLE: public.accounting_budgets (Jahresbudgets)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    konto VARCHAR(50) NOT NULL REFERENCES public.accounting_accounts(konto) ON UPDATE CASCADE ON DELETE CASCADE,
    jahr INTEGER NOT NULL,
    betrag NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_acc_budget_konto_jahr UNIQUE (konto, jahr)
);

CREATE INDEX IF NOT EXISTS idx_acc_budget_jahr ON public.accounting_budgets(jahr);
CREATE INDEX IF NOT EXISTS idx_acc_budget_konto ON public.accounting_budgets(konto);

COMMENT ON TABLE public.accounting_budgets IS
    'Geplante Jahresbudgets je Sachkonto und Kalenderjahr.';

-- 4. TABELLE: public.accounting_bank_rules (CAMT.053 Automatisierungs-Regeln)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_bank_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(255) NOT NULL,
    pattern_party TEXT NOT NULL DEFAULT '',
    pattern_text TEXT NOT NULL DEFAULT '',
    prefix VARCHAR(100) NOT NULL DEFAULT '',
    soll VARCHAR(50) NOT NULL DEFAULT '',
    haben VARCHAR(50) NOT NULL DEFAULT '',
    pattern TEXT NOT NULL DEFAULT '',
    scope VARCHAR(50) NOT NULL DEFAULT 'all',           -- 'all', 'party', 'text'
    amount_mode VARCHAR(50) NOT NULL DEFAULT 'any',     -- 'any', 'exact', 'range'
    amount_min NUMERIC(12,2),
    amount_max NUMERIC(12,2),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_bank_rules_sort ON public.accounting_bank_rules(sort_order);

COMMENT ON TABLE public.accounting_bank_rules IS
    'Regeln für die automatische Kontierung und Zuordnung von CAMT.053 E-Banking-Transaktionen.';

-- ==============================================================================
-- 5. TRIGGER FÜR UPDATED_AT TIMESTAMP
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_accounting_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_accounts_updated_at ON public.accounting_accounts;
CREATE TRIGGER trg_acc_accounts_updated_at
    BEFORE UPDATE ON public.accounting_accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_accounting_timestamp();

DROP TRIGGER IF EXISTS trg_acc_journal_updated_at ON public.accounting_journal;
CREATE TRIGGER trg_acc_journal_updated_at
    BEFORE UPDATE ON public.accounting_journal
    FOR EACH ROW EXECUTE FUNCTION public.update_accounting_timestamp();

DROP TRIGGER IF EXISTS trg_acc_budgets_updated_at ON public.accounting_budgets;
CREATE TRIGGER trg_acc_budgets_updated_at
    BEFORE UPDATE ON public.accounting_budgets
    FOR EACH ROW EXECUTE FUNCTION public.update_accounting_timestamp();

DROP TRIGGER IF EXISTS trg_acc_bank_rules_updated_at ON public.accounting_bank_rules;
CREATE TRIGGER trg_acc_bank_rules_updated_at
    BEFORE UPDATE ON public.accounting_bank_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_accounting_timestamp();

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) & POLICIES
-- ==============================================================================
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_rules ENABLE ROW LEVEL SECURITY;

-- SELECT Policies:
-- anon & authenticated dürfen lesen (anon für GAS und Portal ohne Login im lokalen Modus)
DROP POLICY IF EXISTS acc_accounts_select ON public.accounting_accounts;
CREATE POLICY acc_accounts_select ON public.accounting_accounts FOR SELECT USING (true);

DROP POLICY IF EXISTS acc_journal_select ON public.accounting_journal;
CREATE POLICY acc_journal_select ON public.accounting_journal FOR SELECT USING (true);

DROP POLICY IF EXISTS acc_budgets_select ON public.accounting_budgets;
CREATE POLICY acc_budgets_select ON public.accounting_budgets FOR SELECT USING (true);

DROP POLICY IF EXISTS acc_bank_rules_select ON public.accounting_bank_rules;
CREATE POLICY acc_bank_rules_select ON public.accounting_bank_rules FOR SELECT USING (true);

-- WRITE Policies (INSERT, UPDATE, DELETE):
-- Vorstand / Kassier / Dev
DROP POLICY IF EXISTS acc_accounts_write ON public.accounting_accounts;
CREATE POLICY acc_accounts_write ON public.accounting_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS acc_journal_write ON public.accounting_journal;
CREATE POLICY acc_journal_write ON public.accounting_journal FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS acc_budgets_write ON public.accounting_budgets;
CREATE POLICY acc_budgets_write ON public.accounting_budgets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS acc_bank_rules_write ON public.accounting_bank_rules;
CREATE POLICY acc_bank_rules_write ON public.accounting_bank_rules FOR ALL USING (true) WITH CHECK (true);
