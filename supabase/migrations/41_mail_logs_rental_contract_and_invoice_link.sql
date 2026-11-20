-- ==============================================================================
-- 41_mail_logs_rental_contract_and_invoice_link.sql
-- Migration: Mail-Log Audit Spalten, Mietvertrag PDF-RPC & Proforma-Rechnung für Vermietung (FIBU/CAMT)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. mail_logs Tabellenerweiterung für Edge Function Audit-Trail
ALTER TABLE public.mail_logs
    ADD COLUMN IF NOT EXISTS recipient_count INTEGER,
    ADD COLUMN IF NOT EXISTS recipients_summary TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2. rental_requests Tabellenerweiterung: Verknüpfung mit invoices & Storage-Pfad
ALTER TABLE public.rental_requests
    ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(50) REFERENCES public.invoices(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contract_storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_rental_requests_inv ON public.rental_requests(invoice_id);

-- 3. RPC FUNCTION: public.update_rental_contract_pdf
CREATE OR REPLACE FUNCTION public.update_rental_contract_pdf(
    p_booking_id        VARCHAR,
    p_pdf_url           TEXT,
    p_storage_path      TEXT,
    p_file_size         INTEGER DEFAULT NULL,
    p_paperless_status  public.archive_sync_status DEFAULT 'pending',
    p_paperless_id      INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.rental_requests
    SET
        contract_file_url       = p_pdf_url,
        contract_storage_path   = p_storage_path,
        paperless_status        = COALESCE(p_paperless_status, paperless_status),
        paperless_document_id   = COALESCE(p_paperless_id, paperless_document_id),
        updated_at              = now()
    WHERE booking_number = p_booking_id OR id::text = p_booking_id;

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_rental_contract_pdf(VARCHAR, TEXT, TEXT, INTEGER, public.archive_sync_status, INTEGER) TO authenticated, anon, service_role;

-- 4. RPC FUNCTION: public.ensure_rental_proforma_invoice
-- Erzeugt idempotent eine Proforma-Rechnung (Typ 'Vermietung', Konto 3400) für das CAMT-Matching in der Buchhaltung
CREATE OR REPLACE FUNCTION public.ensure_rental_proforma_invoice(
    p_booking_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rental RECORD;
    v_inv_id VARCHAR(50);
    v_existing_inv RECORD;
    v_recipient JSONB;
    v_amount NUMERIC(10,2);
    v_date_str TEXT;
BEGIN
    SELECT * INTO v_rental FROM public.rental_requests
    WHERE booking_number = p_booking_number OR id::text = p_booking_number
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Buchung nicht gefunden: ' || COALESCE(p_booking_number, 'NULL'));
    END IF;

    v_amount := COALESCE(v_rental.total_amount_chf, 300.00);
    v_date_str := to_char(COALESCE(v_rental.start_date, CURRENT_DATE), 'DD.MM.YYYY');

    v_recipient := jsonb_build_object(
        'name', trim(COALESCE(v_rental.salutation, '') || ' ' || v_rental.first_name || ' ' || v_rental.last_name),
        'salutation', COALESCE(v_rental.salutation, ''),
        'vorname', v_rental.first_name,
        'nachname', v_rental.last_name,
        'strasse', COALESCE(v_rental.street, ''),
        'plz', COALESCE(v_rental.post_code, ''),
        'ort', COALESCE(v_rental.city, ''),
        'email', COALESCE(v_rental.email, ''),
        'telefon', COALESCE(v_rental.phone, '')
    );

    -- 1. Prüfen, ob bereits eine verknüpfte Rechnung existiert
    IF v_rental.invoice_id IS NOT NULL THEN
        SELECT * INTO v_existing_inv FROM public.invoices WHERE id = v_rental.invoice_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'invoice_id', v_existing_inv.id, 'is_new', false);
        END IF;
    END IF;

    -- 2. Prüfen über source_module / source_id
    SELECT * INTO v_existing_inv FROM public.invoices
    WHERE source_module = 'vermietung' AND (source_id = v_rental.booking_number OR source_id = v_rental.id::text)
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.rental_requests SET invoice_id = v_existing_inv.id WHERE id = v_rental.id;
        RETURN jsonb_build_object('success', true, 'invoice_id', v_existing_inv.id, 'is_new', false);
    END IF;

    -- 3. Neue Rechnungsnummer vergeben via next_invoice_number
    BEGIN
        SELECT public.next_invoice_number('VM', EXTRACT(year FROM COALESCE(v_rental.start_date, CURRENT_DATE))::int) INTO v_inv_id;
    EXCEPTION WHEN OTHERS THEN
        v_inv_id := NULL;
    END;

    IF v_inv_id IS NULL OR v_inv_id = '' THEN
        v_inv_id := 'VM-' || to_char(CURRENT_DATE, 'YY') || '-' || upper(substr(md5(random()::text), 1, 4));
    END IF;

    INSERT INTO public.invoices (
        id,
        year,
        type,
        status,
        total_amount,
        open_amount,
        currency,
        source_module,
        source_id,
        recipient_name,
        recipient_address,
        sender_address,
        notes,
        due_date,
        mail_status,
        pdf_url,
        pdf_storage_path
    ) VALUES (
        v_inv_id,
        EXTRACT(year FROM COALESCE(v_rental.start_date, CURRENT_DATE))::int,
        'Vermietung',
        CASE WHEN v_rental.status = 'paid' OR v_rental.is_paid = true THEN 'bezahlt' ELSE 'offen' END,
        v_amount,
        CASE WHEN v_rental.status = 'paid' OR v_rental.is_paid = true THEN 0.00 ELSE v_amount END,
        'CHF',
        'vermietung',
        v_rental.booking_number,
        trim(v_rental.first_name || ' ' || v_rental.last_name),
        v_recipient,
        jsonb_build_object('bereich', 'Vermietung Schützenstube', 'funktion', 'Vermieter', 'verein', 'Sportschützen Muhen'),
        'Mietvertrag ' || v_rental.booking_number,
        (CURRENT_DATE + INTERVAL '14 days')::date,
        'versendet',
        v_rental.contract_file_url,
        v_rental.contract_storage_path
    );

    INSERT INTO public.invoice_positions (
        invoice_id,
        position_nr,
        description,
        quantity,
        unit_price,
        amount,
        konto,
        type
    ) VALUES (
        v_inv_id,
        1,
        'Miete Schützenstube Muhen (' || v_date_str || ')',
        1.00,
        v_amount,
        v_amount,
        '3400',
        'vermietung'
    );

    UPDATE public.rental_requests SET invoice_id = v_inv_id WHERE id = v_rental.id;

    RETURN jsonb_build_object('success', true, 'invoice_id', v_inv_id, 'is_new', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_rental_proforma_invoice(TEXT) TO authenticated, anon, service_role;
