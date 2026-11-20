-- ==============================================================================
-- 02_events_module.sql
-- Migration: Phase 2 – Fachmodul ANLÄSSE (Event-Management & Controlling)
-- Projekt: Vereinsportal Sportschützen Muhen
-- Gemäss Projektauftrag Punkte 12–17 (Mengenplanung, Bestellungen, Checklisten,
-- Helfer/Stände, Vorlagen & Controlling)
-- ==============================================================================

-- 1. HAUPTTABELLE ANLÄSSE (Events & Vorlagen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    location VARCHAR(200) NOT NULL DEFAULT 'Schiessanlage Muhen',
    manager_name VARCHAR(150),                          -- Verantwortlicher (Name)
    manager_id UUID REFERENCES auth.users(id),          -- Optional: verknüpfter Benutzer
    expected_visitors INTEGER NOT NULL DEFAULT 0,       -- Erwartete Besucher für Mengenplanung
    status VARCHAR(50) NOT NULL DEFAULT 'draft',        -- 'draft', 'planned', 'active', 'completed', 'cancelled'
    budget NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    is_template BOOLEAN NOT NULL DEFAULT false,         -- True = Event dient als Vorlage (z.B. '1.-August-Feier')
    template_name VARCHAR(100),                         -- Name der Vorlage
    is_public BOOLEAN NOT NULL DEFAULT false,           -- Auf öffentlicher Website anzeigen
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_template ON public.events(is_template);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);

-- 2. MENGEN- & ARTIKELPLANUNG (Punkte 13 & 14)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL DEFAULT 'Festwirtschaft', -- 'Festwirtschaft', 'Getränke', 'Grill', 'Bar', 'Munition', 'Infrastruktur'
    item_name VARCHAR(150) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'Stk',            -- 'Stk', 'Flasche', 'Liter', 'kg', 'Portion'
    cost_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,     -- Einkaufspreis
    sales_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,    -- Verkaufspreis
    qty_per_visitor NUMERIC(8,3) NOT NULL DEFAULT 0.000,-- Menge pro Besucher
    safety_factor NUMERIC(5,2) NOT NULL DEFAULT 1.10,   -- Sicherheitsfaktor (Standard 1.10 = +10%)
    recommended_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,-- Errechnete Empfehlung (Besucher × Faktor × Sicherheit)
    order_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,      -- Tatsächliche Bestellmenge (manuell übersteuerbar)
    actual_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,     -- Tatsächlich gelieferte / vorhandene Menge
    sold_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,       -- Verkaufte Menge
    remaining_qty NUMERIC(10,2) NOT NULL DEFAULT 0.00,  -- Restmenge
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_items_event ON public.event_items(event_id);

-- 3. LIEFERANTEN-BESTELLUNGEN (Punkt 13)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    supplier_name VARCHAR(150) NOT NULL,                -- Lieferant (Metzgerei, Getränkehändler, Bäcker)
    supplier_contact VARCHAR(200),
    item_id UUID REFERENCES public.event_items(id) ON DELETE SET NULL,
    item_description VARCHAR(200) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    unit VARCHAR(50) NOT NULL DEFAULT 'Stk',
    total_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    order_date DATE,
    delivery_date DATE,
    delivery_time TIME,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',        -- 'draft', 'ordered', 'confirmed', 'delivered', 'cancelled'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_orders_event ON public.event_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_orders_supplier ON public.event_orders(supplier_name);

-- 4. VORBEREITUNG & CHECKLISTEN (Punkt 13)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    phase VARCHAR(50) NOT NULL DEFAULT 'Vorbereitung',  -- 'Vorbereitung', 'Einkauf', 'Aufbau', 'Durchführung', 'Abbau', 'Nachbereitung'
    task VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(150),                           -- Verantwortlicher Name
    assigned_user_id UUID REFERENCES auth.users(id),    -- Verknüpfter Benutzer
    due_date DATE,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',     -- 'low', 'medium', 'high', 'urgent'
    status VARCHAR(50) NOT NULL DEFAULT 'pending',      -- 'pending', 'in_progress', 'completed', 'skipped'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_checklists_event ON public.event_checklists(event_id);
CREATE INDEX IF NOT EXISTS idx_event_checklists_status ON public.event_checklists(status);

-- 5. HELFER / STÄNDE & SCHICHTEN (Punkt 13)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    area VARCHAR(100) NOT NULL,                         -- Bereich/Stand (z.B. 'Grill', 'Ausschank', 'Kasse', 'Standblattbüro')
    role_name VARCHAR(100) NOT NULL,                    -- Funktion (z.B. 'Grillmeister', 'Service', 'Kassier', 'Schiessleiter')
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    required_helpers INTEGER NOT NULL DEFAULT 1,        -- Benötigte Personen
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open',         -- 'open', 'partially_filled', 'filled', 'completed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_shifts_event ON public.event_shifts(event_id);

-- 6. HELFER-ZUORDNUNGEN & BESTÄTIGUNG DURCH MITGLIEDER (Punkt 13)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES public.event_shifts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),             -- Verknüpftes Login-Konto des Mitglieds
    helper_name VARCHAR(150) NOT NULL,                  -- Name des Helfers (Mitglied oder Gast)
    helper_email VARCHAR(255),
    helper_phone VARCHAR(50),
    confirmed_by_helper BOOLEAN NOT NULL DEFAULT false, -- Mitglied hat Einsatz bestätigt
    confirmation_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_shift_assign_shift ON public.event_shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_event_shift_assign_user ON public.event_shift_assignments(user_id);

-- 7. EVENT-CONTROLLING (Punkt 16) – Berechneter View
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_event_controlling AS
WITH item_stats AS (
    SELECT
        event_id,
        COALESCE(SUM(order_qty * cost_price), 0.00) AS total_planned_cost,
        COALESCE(SUM(actual_qty * cost_price), 0.00) AS total_actual_cost,
        COALESCE(SUM(order_qty * sales_price), 0.00) AS total_planned_revenue,
        COALESCE(SUM(sold_qty * sales_price), 0.00) AS total_actual_revenue
    FROM public.event_items
    GROUP BY event_id
),
shift_stats AS (
    SELECT
        s.event_id,
        COALESCE(SUM(
            ROUND(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0, 2) *
            (SELECT COUNT(*) FROM public.event_shift_assignments a WHERE a.shift_id = s.id)
        ), 0.00) AS total_helper_hours
    FROM public.event_shifts s
    GROUP BY s.event_id
)
SELECT
    e.id AS event_id,
    e.name AS event_name,
    e.event_date,
    e.status,
    e.budget,
    e.expected_visitors,
    COALESCE(i.total_planned_cost, 0.00) AS planned_cost,
    COALESCE(i.total_actual_cost, 0.00) AS actual_cost,
    COALESCE(i.total_planned_revenue, 0.00) AS planned_revenue,
    COALESCE(i.total_actual_revenue, 0.00) AS actual_revenue,
    (COALESCE(i.total_actual_revenue, 0.00) - COALESCE(i.total_actual_cost, 0.00)) AS gross_margin,
    COALESCE(s.total_helper_hours, 0.00) AS total_helper_hours,
    CASE
        WHEN COALESCE(s.total_helper_hours, 0) > 0 THEN
            ROUND((COALESCE(i.total_actual_revenue, 0.00) - COALESCE(i.total_actual_cost, 0.00)) / s.total_helper_hours, 2)
        ELSE 0.00
    END AS margin_per_helper_hour
FROM public.events e
LEFT JOIN item_stats i ON i.event_id = e.id
LEFT JOIN shift_stats s ON s.event_id = e.id;

-- 8. HILFSFUNKTION: VORLAGE DUPLIZIEREN (Punkt 15)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_event_from_template(
    template_id UUID,
    new_event_name VARCHAR,
    new_event_date DATE,
    new_expected_visitors INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    new_event_id UUID;
    src_visitors INTEGER;
BEGIN
    -- Prüfen, ob Quell-Event existiert
    SELECT expected_visitors INTO src_visitors
    FROM public.events WHERE id = template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vorlage mit ID % wurde nicht gefunden', template_id;
    END IF;

    IF new_expected_visitors IS NULL THEN
        new_expected_visitors := src_visitors;
    END IF;

    -- 1. Neuen Anlass anlegen
    INSERT INTO public.events (
        name, description, event_date, start_time, end_time, location,
        manager_name, expected_visitors, status, budget, notes,
        is_template, created_by
    )
    SELECT
        new_event_name, description, new_event_date, start_time, end_time, location,
        manager_name, new_expected_visitors, 'planned', budget, notes,
        false, auth.uid()
    FROM public.events
    WHERE id = template_id
    RETURNING id INTO new_event_id;

    -- 2. Artikel & Mengenplanung kopieren (mit Neuberechnung der Empfehlung)
    INSERT INTO public.event_items (
        event_id, category, item_name, unit, cost_price, sales_price,
        qty_per_visitor, safety_factor, recommended_qty, order_qty, notes
    )
    SELECT
        new_event_id, category, item_name, unit, cost_price, sales_price,
        qty_per_visitor, safety_factor,
        ROUND(new_expected_visitors * qty_per_visitor * safety_factor, 2),
        ROUND(new_expected_visitors * qty_per_visitor * safety_factor, 2),
        notes
    FROM public.event_items
    WHERE event_id = template_id;

    -- 3. Checklisten kopieren
    INSERT INTO public.event_checklists (
        event_id, phase, task, assigned_to, priority, status, notes
    )
    SELECT
        new_event_id, phase, task, assigned_to, priority, 'pending', notes
    FROM public.event_checklists
    WHERE event_id = template_id;

    -- 4. Schichten/Stände kopieren
    INSERT INTO public.event_shifts (
        event_id, area, role_name, shift_date, start_time, end_time,
        required_helpers, description, status
    )
    SELECT
        new_event_id, area, role_name, new_event_date, start_time, end_time,
        required_helpers, description, 'open'
    FROM public.event_shifts
    WHERE event_id = template_id;

    RETURN new_event_id;
END;
$$;

-- 9. ROW LEVEL SECURITY (RLS) AKTIVIEREN & POLICIES ANLEGEN
-- ------------------------------------------------------------------------------
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_shift_assignments ENABLE ROW LEVEL SECURITY;

-- Policies für public.events:
-- Öffentliche Events sind für alle lesbar; interne für Mitglieder
DROP POLICY IF EXISTS "events_select_policy" ON public.events;
CREATE POLICY "events_select_policy" ON public.events
    FOR SELECT TO authenticated, anon
    USING (
        is_public = true
        OR auth.has_permission('anlaesse.view_internal')
        OR auth.has_permission('anlaesse.manage')
    );

DROP POLICY IF EXISTS "events_manage_policy" ON public.events;
CREATE POLICY "events_manage_policy" ON public.events
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- Policies für public.event_items:
DROP POLICY IF EXISTS "event_items_select_policy" ON public.event_items;
CREATE POLICY "event_items_select_policy" ON public.event_items
    FOR SELECT TO authenticated
    USING (auth.has_permission('anlaesse.view_internal') OR auth.has_permission('anlaesse.manage'));

DROP POLICY IF EXISTS "event_items_manage_policy" ON public.event_items;
CREATE POLICY "event_items_manage_policy" ON public.event_items
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- Policies für public.event_orders:
DROP POLICY IF EXISTS "event_orders_manage_policy" ON public.event_orders;
CREATE POLICY "event_orders_manage_policy" ON public.event_orders
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- Policies für public.event_checklists:
DROP POLICY IF EXISTS "event_checklists_select_policy" ON public.event_checklists;
CREATE POLICY "event_checklists_select_policy" ON public.event_checklists
    FOR SELECT TO authenticated
    USING (auth.has_permission('anlaesse.view_internal') OR auth.has_permission('anlaesse.manage'));

DROP POLICY IF EXISTS "event_checklists_manage_policy" ON public.event_checklists;
CREATE POLICY "event_checklists_manage_policy" ON public.event_checklists
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- Policies für public.event_shifts:
DROP POLICY IF EXISTS "event_shifts_select_policy" ON public.event_shifts;
CREATE POLICY "event_shifts_select_policy" ON public.event_shifts
    FOR SELECT TO authenticated
    USING (auth.has_permission('anlaesse.view_internal') OR auth.has_permission('anlaesse.manage'));

DROP POLICY IF EXISTS "event_shifts_manage_policy" ON public.event_shifts;
CREATE POLICY "event_shifts_manage_policy" ON public.event_shifts
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- Policies für public.event_shift_assignments:
-- Mitglieder können ihre eigenen Schichten sehen und bestätigen
DROP POLICY IF EXISTS "event_shift_assign_select_policy" ON public.event_shift_assignments;
CREATE POLICY "event_shift_assign_select_policy" ON public.event_shift_assignments
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR auth.has_permission('anlaesse.manage')
        OR auth.has_permission('anlaesse.rsvp_all')
    );

DROP POLICY IF EXISTS "event_shift_assign_manage_policy" ON public.event_shift_assignments;
CREATE POLICY "event_shift_assign_manage_policy" ON public.event_shift_assignments
    FOR ALL TO authenticated
    USING (auth.has_permission('anlaesse.manage'))
    WITH CHECK (auth.has_permission('anlaesse.manage'));

-- Mitglieder dürfen ihre eigene Schicht bestätigen (UPDATE nur für confirmed_by_helper)
DROP POLICY IF EXISTS "event_shift_assign_self_confirm" ON public.event_shift_assignments;
CREATE POLICY "event_shift_assign_self_confirm" ON public.event_shift_assignments
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 10. SEED DATA: MUSTER-VORLAGE "1.-August-Feier" (Punkt 15)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    tpl_id UUID;
    bratwurst_id UUID;
BEGIN
    -- Vorlage anlegen, falls noch nicht vorhanden
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE is_template = true AND template_name = '1.-August-Feier') THEN
        INSERT INTO public.events (
            name, description, event_date, start_time, end_time, location,
            manager_name, expected_visitors, status, budget, notes,
            is_template, template_name, is_public
        ) VALUES (
            'Vorlage: 1.-August-Feier',
            'Standard-Festwirtschaft mit Grill, Getränken, Lampionumzug und Feuerwerk.',
            CURRENT_DATE,
            '17:00:00',
            '01:00:00',
            'Schiessanlage Muhen',
            'Wirtschaftschef',
            120,
            'planned',
            2500.00,
            'Standard-Faktoren basieren auf Erfahrungswerten der letzten 3 Jahre.',
            true,
            '1.-August-Feier',
            false
        ) RETURNING id INTO tpl_id;

        -- Muster-Artikel mit Mengenrechner-Faktoren
        -- Besucher: 120 × Faktor 0.85 × 1.10 = 112.2 -> 112 Stk
        INSERT INTO public.event_items (
            event_id, category, item_name, unit, cost_price, sales_price,
            qty_per_visitor, safety_factor, recommended_qty, order_qty
        ) VALUES
            (tpl_id, 'Grill', 'Bratwurst mit Bürli', 'Stk', 3.50, 7.50, 0.85, 1.10, 112.00, 120.00),
            (tpl_id, 'Grill', 'Cervelat mit Bürli', 'Stk', 2.20, 5.50, 0.40, 1.10, 53.00, 60.00),
            (tpl_id, 'Getränke', 'Bier Feldschlösschen 33cl', 'Flasche', 1.60, 4.50, 1.20, 1.15, 166.00, 180.00),
            (tpl_id, 'Getränke', 'Mineralwasser 50cl', 'Flasche', 0.90, 3.50, 0.80, 1.10, 106.00, 120.00),
            (tpl_id, 'Getränke', 'Kaffee / Espresso', 'Portion', 0.60, 3.50, 0.50, 1.10, 66.00, 70.00);

        -- Muster-Checkliste
        INSERT INTO public.event_checklists (
            event_id, phase, task, assigned_to, priority, status
        ) VALUES
            (tpl_id, 'Vorbereitung', 'Bewilligung für Feuerwerk & Festwirtschaft einholen', 'Präsident', 'high', 'pending'),
            (tpl_id, 'Vorbereitung', 'Lieferanten anfragen & Preise bestätigen', 'Wirtschaftschef', 'medium', 'pending'),
            (tpl_id, 'Aufbau', 'Festbänke & Zelte aufstellen', 'Bauchef', 'high', 'pending'),
            (tpl_id, 'Aufbau', 'Kühlschränke & Grill anschliessen', 'Wirtschaftschef', 'high', 'pending'),
            (tpl_id, 'Durchführung', 'Kasse vorbereiten & Wechselgeld einlegen', 'Kassier', 'urgent', 'pending'),
            (tpl_id, 'Abbau', 'Zelte abbrechen & Schützenhaus reinigen', 'Alle Helfer', 'high', 'pending');

        -- Muster-Schichten
        INSERT INTO public.event_shifts (
            event_id, area, role_name, shift_date, start_time, end_time, required_helpers, description
        ) VALUES
            (tpl_id, 'Grill', 'Grillmeister', CURRENT_DATE, '17:00:00', '21:00:00', 2, 'Bratwürste, Cervelats & Steaks grillieren'),
            (tpl_id, 'Ausschank', 'Getränkeausgabe', CURRENT_DATE, '17:00:00', '21:30:00', 2, 'Bier, Softdrinks, Mineral servieren'),
            (tpl_id, 'Ausschank', 'Getränkeausgabe Spätschicht', CURRENT_DATE, '21:30:00', '01:00:00', 2, 'Bar- und Getränkebetrieb bis Festende'),
            (tpl_id, 'Kasse', 'Hauptkasse', CURRENT_DATE, '17:00:00', '22:00:00', 1, 'Bonverkauf und Bargeld/TWINT-Abrechnung');
    END IF;
END$$;
