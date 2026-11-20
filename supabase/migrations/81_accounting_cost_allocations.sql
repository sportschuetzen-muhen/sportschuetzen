-- ==============================================================================
-- 81_accounting_cost_allocations.sql
-- Migration: Zuteilungsquoten & Gemeinkostenschlüssel für die Finanzbuchhaltung
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.accounting_cost_allocations: Konfigurierbare Zuteilungsquoten (%)
--    für Schützenhaus-Vermietung, Wirtschaft und Sportbetrieb.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.accounting_cost_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(50) UNIQUE NOT NULL,
    bereich VARCHAR(50) NOT NULL,                       -- 'vermietung', 'wirtschaft', 'mitglieder', 'sportbetrieb'
    label VARCHAR(150) NOT NULL,
    konten VARCHAR(100) NOT NULL,                       -- Sachkonten (z.B. '4011', '4010,4002', '6400', '6000', '6301,6302')
    quote_percent NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (quote_percent >= 0 AND quote_percent <= 100),
    beschreibung TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_alloc_bereich ON public.accounting_cost_allocations(bereich);
CREATE INDEX IF NOT EXISTS idx_acc_alloc_active ON public.accounting_cost_allocations(is_active);
CREATE INDEX IF NOT EXISTS idx_acc_alloc_sort ON public.accounting_cost_allocations(sort_order);

COMMENT ON TABLE public.accounting_cost_allocations IS
    'Konfigurierbare Zuteilungsquoten und Gemeinkostenschlüssel für das Controlling der Sportschützen Muhen.';

-- Trigger für automatischen updated_at Zeitstempel
DROP TRIGGER IF EXISTS trg_acc_alloc_updated_at ON public.accounting_cost_allocations;
CREATE TRIGGER trg_acc_alloc_updated_at
    BEFORE UPDATE ON public.accounting_cost_allocations
    FOR EACH ROW
    EXECUTE FUNCTION update_accounting_timestamp();

-- RLS aktivieren
ALTER TABLE public.accounting_cost_allocations ENABLE ROW LEVEL SECURITY;

-- Leseberechtigung: alle authentifizierten Benutzer mit Buchhaltungs-Einsicht (oder öffentlich innerhalb Portal)
DROP POLICY IF EXISTS "accounting_cost_allocations_select" ON public.accounting_cost_allocations;
CREATE POLICY "accounting_cost_allocations_select"
    ON public.accounting_cost_allocations
    FOR SELECT
    USING (true);

-- Schreibberechtigung: strikt beschränkt auf buchhaltung.manage
DROP POLICY IF EXISTS "accounting_cost_allocations_write" ON public.accounting_cost_allocations;
CREATE POLICY "accounting_cost_allocations_write"
    ON public.accounting_cost_allocations
    FOR ALL
    TO authenticated
    USING ((SELECT rbac_allows(ARRAY['buchhaltung.manage'::text]) AS rbac_allows))
    WITH CHECK ((SELECT rbac_allows(ARRAY['buchhaltung.manage'::text]) AS rbac_allows));

-- Initialer Seed der vorgeschlagenen Zuteilungsquoten
INSERT INTO public.accounting_cost_allocations (key, bereich, label, konten, quote_percent, beschreibung, sort_order)
VALUES
    ('vermietung_entschaedigung_4011', 'vermietung', 'Vermietungsentschädigung (Künzlis)', '4011', 100.00, 'Direkte Entschädigung für Wohnungs-/Schlüsselübergabe und Abnahme (100% direkt)', 10),
    ('vermietung_reinigung_4010', 'vermietung', 'Reinigung & Verbrauch (Vermietungsanteil)', '4010,4002', 70.00, 'Anteil der vermietungsbedingten Reinigung und Verbrauchsmaterial', 20),
    ('vermietung_energie_6400', 'vermietung', 'Energie & Wasser (Vermietungsanteil)', '6400', 30.00, 'Strom- und Wasserverbrauch für Ganztages-Vermietungsanlässe (Heizung, Küche)', 30),
    ('vermietung_unterhalt_6000', 'vermietung', 'Gebäudeunterhalt (Gemeinkostenanteil)', '6000,6010', 10.00, 'Laufender Schützenstuben-Unterhalt (ohne vereinsbezogene Grossinvestitionen)', 40),
    ('vermietung_versicherung_6301', 'vermietung', 'Sach- & Haftpflichtversicherung', '6301,6302', 10.00, 'Zugeordneter Versicherungsanteil für externe Raumnutzung', 50),
    ('wirtschaft_reinigung_4010', 'wirtschaft', 'Reinigung Wirtschaft (Stubenbetrieb)', '4010,4002', 30.00, 'Reinigungsanteil für den laufenden Schiess- und Festwirtschaftsbetrieb', 60),
    ('wirtschaft_anlaesse_abzug', 'wirtschaft', 'Pauschalabzug Vereinsanlässe vom Wareneinsatz', '4000,4001', 15.00, 'Pauschale Auslagerung von Getränken/Lebensmitteln für GV, Putztag, Endschiessen', 70)
ON CONFLICT (key) DO UPDATE
SET
    label = EXCLUDED.label,
    konten = EXCLUDED.konten,
    quote_percent = EXCLUDED.quote_percent,
    beschreibung = EXCLUDED.beschreibung,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();
