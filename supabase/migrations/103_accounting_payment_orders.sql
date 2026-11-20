-- =====================================================================
-- Migration 103: ISO 20022 pain.001 Zahlungsaufträge & Auszahlungen
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.accounting_payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_nr VARCHAR(50) NOT NULL UNIQUE,
    jahr INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    datum DATE NOT NULL DEFAULT CURRENT_DATE,
    execution_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Begünstigtes Mitglied / Empfänger
    member_pn VARCHAR(50),
    recipient_name VARCHAR(150) NOT NULL,
    recipient_street VARCHAR(150),
    recipient_zip VARCHAR(20),
    recipient_city VARCHAR(100),
    recipient_iban VARCHAR(50) NOT NULL,
    
    -- Betrag & Kontierung
    betrag NUMERIC(12, 2) NOT NULL CHECK (betrag > 0),
    konto_soll VARCHAR(10) NOT NULL REFERENCES public.accounting_accounts(konto) ON UPDATE CASCADE,
    konto_haben VARCHAR(10) NOT NULL DEFAULT '1020' REFERENCES public.accounting_accounts(konto) ON UPDATE CASCADE,
    beschreibung TEXT NOT NULL,
    positions JSONB DEFAULT '[]'::jsonb,
    
    -- Status & Workflow ('pendent', 'exportiert', 'ausgefuehrt', 'storniert')
    status VARCHAR(30) NOT NULL DEFAULT 'pendent' CHECK (status IN ('pendent', 'exportiert', 'ausgefuehrt', 'storniert')),
    pain_msg_id VARCHAR(100),
    exported_at TIMESTAMPTZ,
    
    -- Zuordnung nach CAMT-Import / Bankabgleich
    journal_id BIGINT REFERENCES public.accounting_journal(id) ON DELETE SET NULL,
    executed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indizes für performanten Abruf und CAMT-Matching
CREATE INDEX IF NOT EXISTS idx_acc_pay_orders_jahr ON public.accounting_payment_orders(jahr);
CREATE INDEX IF NOT EXISTS idx_acc_pay_orders_status ON public.accounting_payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_acc_pay_orders_order_nr ON public.accounting_payment_orders(order_nr);
CREATE INDEX IF NOT EXISTS idx_acc_pay_orders_journal_id ON public.accounting_payment_orders(journal_id);
CREATE INDEX IF NOT EXISTS idx_acc_pay_orders_iban ON public.accounting_payment_orders(recipient_iban);

-- RLS aktivieren
ALTER TABLE public.accounting_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acc_pay_orders_select ON public.accounting_payment_orders;
CREATE POLICY acc_pay_orders_select ON public.accounting_payment_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS acc_pay_orders_write ON public.accounting_payment_orders;
CREATE POLICY acc_pay_orders_write ON public.accounting_payment_orders FOR ALL USING (true) WITH CHECK (true);

-- Updated_at Trigger
CREATE OR REPLACE FUNCTION set_accounting_payment_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acc_pay_orders_updated_at ON public.accounting_payment_orders;
CREATE TRIGGER trg_acc_pay_orders_updated_at
    BEFORE UPDATE ON public.accounting_payment_orders
    FOR EACH ROW
    EXECUTE FUNCTION set_accounting_payment_orders_updated_at();

COMMENT ON TABLE public.accounting_payment_orders IS 
'Vorgemerkte Zahlungsaufträge für Banküberweisungen (pain.001) vor der finalen CAMT-Verbuchung im Journal.';
