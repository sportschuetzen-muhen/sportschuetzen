-- ==============================================================================
-- 111_group_competition_payouts_1301.sql
-- Migration: Gruppengewinne auswärtige Schiessen & Aufteilung auf Schützen (Konto 1301)
-- Module: Jahresmeisterschaft, Finanzbuchhaltung (pain.001) & Jahresbeitrag
-- ==============================================================================

-- 1. Tabelle für Gruppen-Wettkämpfe & Gewinne
CREATE TABLE IF NOT EXISTS public.group_competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jahr INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    anlass_name VARCHAR(150) NOT NULL,
    gruppe_name VARCHAR(100) NOT NULL,
    rang INTEGER,
    punkte_total NUMERIC(8,2),
    gruppendoppel NUMERIC(10,2) NOT NULL DEFAULT 30.00,
    gruppengewinn NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ueberschuss NUMERIC(10,2) GENERATED ALWAYS AS (GREATEST(0::numeric, gruppengewinn - gruppendoppel)) STORED,
    anzahl_schuetzen INTEGER NOT NULL DEFAULT 5,
    betrag_pro_schuetze NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    bemerkung TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bereit', 'abgeschlossen')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_comp_jahr ON public.group_competitions(jahr);
CREATE INDEX IF NOT EXISTS idx_group_comp_status ON public.group_competitions(status);

COMMENT ON TABLE public.group_competitions IS
    'Erfasste Gruppenwettkämpfe bei auswärtigen Schiessen mit Gruppendoppel, Gruppengewinn und berechnetem Schützen-Überschuss.';

-- 2. Tabelle für Schützen-Zuweisung und Auszahlungs-/Verrechnungsstatus
CREATE TABLE IF NOT EXISTS public.group_competition_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.group_competitions(id) ON DELETE CASCADE,
    person_number INTEGER REFERENCES public.members(person_number) ON UPDATE CASCADE ON DELETE SET NULL,
    schuetze_name VARCHAR(150) NOT NULL,
    jahrgang INTEGER,
    punkte NUMERIC(8,2),
    betrag NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    payout_method VARCHAR(30) NOT NULL DEFAULT 'jahresbeitrag' CHECK (payout_method IN ('jahresbeitrag', 'bank', 'kasse', 'pendent')),
    iban VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'in_zahlung', 'ausgefuehrt', 'verrechnet')),
    payment_order_id UUID REFERENCES public.accounting_payment_orders(id) ON DELETE SET NULL,
    contribution_position_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_comp_mem_comp_id ON public.group_competition_members(competition_id);
CREATE INDEX IF NOT EXISTS idx_group_comp_mem_pn ON public.group_competition_members(person_number);
CREATE INDEX IF NOT EXISTS idx_group_comp_mem_status ON public.group_competition_members(status);
CREATE INDEX IF NOT EXISTS idx_group_comp_mem_pay_order ON public.group_competition_members(payment_order_id);

COMMENT ON TABLE public.group_competition_members IS
    'Zugeordnete Schützen einer Wettkampfgruppe mit zugewiesenem Gewinnanteil (Konto 1301) und Auszahlungsweg.';

-- 3. Row Level Security (RLS) aktivieren
ALTER TABLE public.group_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_competition_members ENABLE ROW LEVEL SECURITY;

-- Policies group_competitions
DROP POLICY IF EXISTS "group_comp_select" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_insert" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_update" ON public.group_competitions;
DROP POLICY IF EXISTS "group_comp_delete" ON public.group_competitions;

CREATE POLICY "group_comp_select"
    ON public.group_competitions FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "group_comp_insert"
    ON public.group_competitions FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "group_comp_update"
    ON public.group_competitions FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "group_comp_delete"
    ON public.group_competitions FOR DELETE
    TO authenticated
    USING (true);

-- Policies group_competition_members
DROP POLICY IF EXISTS "group_comp_members_select" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_insert" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_update" ON public.group_competition_members;
DROP POLICY IF EXISTS "group_comp_members_delete" ON public.group_competition_members;

CREATE POLICY "group_comp_members_select"
    ON public.group_competition_members FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "group_comp_members_insert"
    ON public.group_competition_members FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "group_comp_members_update"
    ON public.group_competition_members FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "group_comp_members_delete"
    ON public.group_competition_members FOR DELETE
    TO authenticated
    USING (true);

-- 4. Berechtigungen vergeben
GRANT ALL ON public.group_competitions TO authenticated;
GRANT ALL ON public.group_competition_members TO authenticated;
GRANT SELECT ON public.group_competitions TO anon;
GRANT SELECT ON public.group_competition_members TO anon;
