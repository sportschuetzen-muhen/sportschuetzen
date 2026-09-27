-- ==============================================================================
-- 25_central_invoicing_and_payments.sql
-- Migration: ZENTRALES RECHNUNGSWESEN & ZAHLUNGSVERKEHR (Harmonisierung Phase 25)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Inhalte:
-- 1. Erweiterung public.invoices:
--    - source_module: Herkunft ('inventar', 'vermietung', 'jahresbeitrag', 'manuell', 'sponsoring')
--    - source_id: Eindeutige ID im Herkunftsmodul
--    - recipient_address: JSONB Snapshot der vollständigen Empfängerdaten
--    - open_amount: Restforderung / offener Saldo
--    - due_date: Zahlungsfrist (Datum)
--    - currency: Währung (Standard 'CHF')
--    - cancel_reason / cancelled_at: Revisionssichere Stornierung
-- 2. Neue Tabelle public.invoice_payments:
--    - Zahlungseingänge, Teilzahlungen, Mehrfachzahlungen
--    - Verknüpfung zu FiBu (accounting_journal.id) und CAMT.054 Bankabgleich
-- 3. Trigger & Reaktivität:
--    - Automatische Saldo- und Statusaktualisierung bei Zahlungseingängen
-- 4. RLS-Policies für Authenticated & Anon Dev
-- ==============================================================================

-- 1. ERWEITERUNG: public.invoices
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS source_module VARCHAR(50) NOT NULL DEFAULT 'manuell',
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS recipient_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS open_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS due_date DATE,
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'CHF',
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_source_module ON public.invoices(source_module);
CREATE INDEX IF NOT EXISTS idx_invoices_source_id ON public.invoices(source_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_open_amount ON public.invoices(open_amount);

-- Initialer Datenabgleich für bestehende Rechnungen
UPDATE public.invoices
SET open_amount = total_amount
WHERE status = 'offen' AND (open_amount = 0 OR open_amount IS NULL);

UPDATE public.invoices
SET open_amount = 0.00
WHERE status = 'bezahlt';

UPDATE public.invoices
SET recipient_address = jsonb_build_object(
    'name', recipient_name,
    'person_number', person_number
)
WHERE recipient_address = '{}'::jsonb OR recipient_address IS NULL;

-- 2. NEUE TABELLE: public.invoice_payments (Zahlungsverkehr & Teilzahlungen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id VARCHAR(50) NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank', -- 'Bank', 'Bar', 'TWINT', 'CAMT054', 'Kompensation', 'Sonstiges'
    document_ref VARCHAR(100),                         -- Beleg-Nr / Buchungsreferenz
    camt_entry_id VARCHAR(100),                        -- Transaktions-ID aus CAMT.054 Bankfile
    journal_entry_id BIGINT REFERENCES public.accounting_journal(id) ON DELETE SET NULL,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_pay_invoice_id ON public.invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_pay_date ON public.invoice_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_inv_pay_method ON public.invoice_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_inv_pay_camt ON public.invoice_payments(camt_entry_id);

COMMENT ON TABLE public.invoice_payments IS
    'Zahlungseingänge und Teilzahlungen zu Rechnungen mit Verknüpfung zu FiBu und Bankabgleich.';

-- 3. TRIGGER FUNKTION: Saldo- und Statusneuberechnung bei Zahlungen
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_invoice_payments_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_id VARCHAR(50);
    v_total_amount NUMERIC(10,2);
    v_total_paid NUMERIC(10,2);
    v_open_balance NUMERIC(10,2);
    v_current_status VARCHAR(30);
    v_last_pay_date DATE;
    v_last_pay_method VARCHAR(50);
    v_last_doc_ref VARCHAR(100);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;

    -- Rechnungskopf abfragen
    SELECT total_amount, status
    INTO v_total_amount, v_current_status
    FROM public.invoices
    WHERE id = v_invoice_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Summe aller bisherigen Zahlungen berechnen
    SELECT 
        COALESCE(SUM(amount), 0.00),
        MAX(payment_date),
        (SELECT payment_method FROM public.invoice_payments WHERE invoice_id = v_invoice_id ORDER BY payment_date DESC, created_at DESC LIMIT 1),
        (SELECT document_ref FROM public.invoice_payments WHERE invoice_id = v_invoice_id ORDER BY payment_date DESC, created_at DESC LIMIT 1)
    INTO 
        v_total_paid,
        v_last_pay_date,
        v_last_pay_method,
        v_last_doc_ref
    FROM public.invoice_payments
    WHERE invoice_id = v_invoice_id;

    v_open_balance := GREATEST(0.00, v_total_amount - v_total_paid);

    -- Status bestimmen (falls nicht 'storniert' oder 'entwurf')
    IF v_current_status NOT IN ('storniert', 'entwurf') THEN
        IF v_open_balance <= 0.00 AND v_total_amount > 0 THEN
            v_current_status := 'bezahlt';
        ELSIF v_total_paid > 0.00 THEN
            v_current_status := 'teilbezahlt';
        ELSE
            -- Wurden Zahlungen gelöscht oder storniert, fällt der Status auf 'offen' zurück
            IF v_current_status IN ('bezahlt', 'teilbezahlt') THEN
                v_current_status := 'offen';
            END IF;
        END IF;
    END IF;

    -- Rechnungskopf synchronisieren
    UPDATE public.invoices
    SET 
        open_amount = v_open_balance,
        status = v_current_status,
        payment_date = v_last_pay_date,
        payment_method = COALESCE(v_last_pay_method, invoices.payment_method),
        document_ref = COALESCE(v_last_doc_ref, invoices.document_ref),
        updated_at = now()
    WHERE id = v_invoice_id;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payments_sync ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_invoice_payments_status();

-- 4. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_payments_auth ON public.invoice_payments;
CREATE POLICY invoice_payments_auth ON public.invoice_payments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_payments_dev_anon ON public.invoice_payments;
CREATE POLICY invoice_payments_dev_anon ON public.invoice_payments
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. ATOMARE RPC-FUNKTION: record_invoice_payment
-- Ermöglicht die atomare Verbuchung von Zahlung + FiBu Journal in einer Transaktion
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
    p_invoice_id VARCHAR(50),
    p_amount NUMERIC(10,2),
    p_payment_date DATE DEFAULT CURRENT_DATE,
    p_payment_method VARCHAR(50) DEFAULT 'Bank',
    p_document_ref VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_sync_fibu BOOLEAN DEFAULT TRUE,
    p_soll_konto VARCHAR(50) DEFAULT NULL,
    p_haben_konto VARCHAR(50) DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv RECORD;
    v_payment_id UUID;
    v_journal_id BIGINT := NULL;
    v_soll VARCHAR(50);
    v_haben VARCHAR(50);
    v_doc_ref VARCHAR(100);
    v_res jsonb;
BEGIN
    -- 1. Rechnung abfragen
    SELECT * INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rechnung % existiert nicht.', p_invoice_id;
    END IF;

    IF v_inv.status = 'storniert' THEN
        RAISE EXCEPTION 'Rechnung % ist storniert und kann keine Zahlungen annehmen.', p_invoice_id;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Zahlungsbetrag muss grösser als 0 sein (erhalten: %)', p_amount;
    END IF;

    v_doc_ref := COALESCE(p_document_ref, 'ZAL-' || p_invoice_id);

    -- 2. Optional: FiBu Journal buchen
    IF p_sync_fibu IS TRUE THEN
        -- Sollkonto ableiten: Bar = 1000, Bank/TWINT = 1020
        IF p_soll_konto IS NOT NULL AND p_soll_konto <> '' THEN
            v_soll := p_soll_konto;
        ELSIF LOWER(p_payment_method) IN ('bar', 'kassa', 'kassabuch') THEN
            v_soll := '1000';
        ELSE
            v_soll := '1020';
        END IF;

        -- Habenkonto ermitteln: aus Position oder Parameter
        IF p_haben_konto IS NOT NULL AND p_haben_konto <> '' THEN
            v_haben := p_haben_konto;
        ELSE
            SELECT konto INTO v_haben
            FROM public.invoice_positions
            WHERE invoice_id = p_invoice_id
            LIMIT 1;
            
            IF v_haben IS NULL OR v_haben = '' THEN
                v_haben := '3400'; -- Fallback Ertrag
            END IF;
        END IF;

        -- Ins FiBu Journal eintragen
        INSERT INTO public.accounting_journal (
            jahr, datum, beleg_nr, beschreibung,
            konto_soll, konto_haben, betrag, typ, buchungstyp
        ) VALUES (
            EXTRACT(YEAR FROM p_payment_date)::INTEGER,
            p_payment_date,
            v_doc_ref,
            'Zahlungseingang ' || p_invoice_id || ' (' || v_inv.recipient_name || ')',
            v_soll,
            v_haben,
            p_amount,
            'Rechnung',
            'DEBITOR'
        )
        RETURNING id INTO v_journal_id;
    END IF;

    -- 3. Zahlung erfassen (triggert automatisch sync_invoice_payments_status)
    INSERT INTO public.invoice_payments (
        invoice_id, payment_date, amount, payment_method,
        document_ref, journal_entry_id, notes
    ) VALUES (
        p_invoice_id, p_payment_date, p_amount, p_payment_method,
        v_doc_ref, v_journal_id, p_notes
    )
    RETURNING id INTO v_payment_id;

    -- 4. Resultat zusammensetzen
    SELECT jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'invoice_id', p_invoice_id,
        'amount', p_amount,
        'status', status,
        'open_amount', open_amount,
        'journal_entry_id', v_journal_id
    ) INTO v_res
    FROM public.invoices
    WHERE id = p_invoice_id;

    RETURN v_res;
END;
$$;
