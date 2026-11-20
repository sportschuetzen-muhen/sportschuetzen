-- ==============================================================================
-- 139_bank_mail_rental_only_matching.sql
-- Migration: Bank-Mail-Ingest auf reines Vermietungs- & Mail-Handling reduzieren
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Fachliche Vorgabe:
-- - Die Rechnungs- und FiBu-Verbuchung erfolgt bewusst NICHT beim Eingang des
--   Raiffeisen-Mails, sondern erst beim Upload des CAMT-Belegs im Modul Buchhaltung.
-- - confirm_rental_payment() setzt ausschliesslich Zahlungsstufe 1 im Modul
--   Vermietung (status = 'paid', is_paid = true, status_raiffeisen = 'bank_notified')
--   und lässt public.invoices sowie public.accounting_journal unberührt.
-- - Das Matching erfolgt ausschliesslich über Vertragsnummer + Betrag (kein
--   Namens-/Mietdatum-Matching mehr, damit Zahlungen durch Dritte nicht blockieren).
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_rental_payment(
    p_booking_number TEXT,
    p_amount         NUMERIC,
    p_payment_date   DATE DEFAULT CURRENT_DATE,
    p_source         TEXT DEFAULT 'Bank-Mail Raiffeisen',
    p_payer_name     TEXT DEFAULT NULL,
    p_payer_address  TEXT DEFAULT NULL,
    p_rent_date      DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rental       RECORD;
    v_soll         NUMERIC(10,2);
    v_comment      TEXT;
    v_matched_vnr  TEXT;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['vermietung.manage'])
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung (vermietung.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Ungültiger Zahlungsbetrag: %', p_amount;
    END IF;

    -- Ausschliesslich über Vertragsnummer (booking_number) zuordnen
    IF p_booking_number IS NOT NULL AND btrim(p_booking_number) <> '' THEN
        SELECT * INTO v_rental
        FROM public.rental_requests
        WHERE booking_number = btrim(p_booking_number)
        FOR UPDATE;
    END IF;

    IF v_rental IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'unknown_contract',
            'message', format('Keine passende Reservation für Vertragsnummer %s gefunden (Betrag: CHF %s).',
                              COALESCE(NULLIF(btrim(p_booking_number), ''), '–'),
                              to_char(p_amount, 'FM999990.00'))
        );
    END IF;

    v_matched_vnr := v_rental.booking_number;
    v_soll := COALESCE(v_rental.total_amount_chf, 0);

    IF v_rental.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'cancelled',
            'rental_id', v_rental.id,
            'booking_number', v_matched_vnr,
            'soll_amount', v_soll,
            'message', 'Reservation ' || v_matched_vnr || ' ist storniert.'
        );
    END IF;

    IF v_rental.is_paid IS TRUE OR v_rental.status IN ('paid', 'keys_issued', 'completed') THEN
        RETURN jsonb_build_object(
            'success', true,
            'code', 'already_paid',
            'rental_id', v_rental.id,
            'booking_number', v_matched_vnr,
            'soll_amount', v_soll,
            'match_method', 'contract_nr',
            'message', 'Reservation ' || v_matched_vnr || ' ist bereits als bezahlt erfasst.'
        );
    END IF;

    IF p_amount < v_soll THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'underpaid',
            'rental_id', v_rental.id,
            'booking_number', v_matched_vnr,
            'soll_amount', v_soll,
            'message', format('Zahlung zu niedrig: erhalten CHF %s, Soll CHF %s.',
                              to_char(p_amount, 'FM999990.00'), to_char(v_soll, 'FM999990.00'))
        );
    END IF;

    v_comment := format('Zahlungseingang erkannt via %s (CHF %s, Vertrag %s – FiBu folgt über CAMT)',
                        p_source, to_char(p_amount, 'FM999990.00'), v_matched_vnr);
    IF p_amount > v_soll THEN
        v_comment := v_comment || format(' – Überzahlung CHF %s', to_char(p_amount - v_soll, 'FM999990.00'));
    END IF;

    PERFORM set_config('app.rental_log_comment', v_comment, true);
    PERFORM set_config('app.rental_log_actor', 'Bank-Mail-Automation', true);

    UPDATE public.rental_requests
    SET status = 'paid',
        is_paid = true,
        status_raiffeisen = 'bank_notified',
        datum_raiffeisen = p_payment_date,
        kommentar_raiffeisen = v_comment,
        updated_at = now()
    WHERE id = v_rental.id;

    PERFORM set_config('app.rental_log_comment', '', true);
    PERFORM set_config('app.rental_log_actor', '', true);

    RETURN jsonb_build_object(
        'success', true,
        'code', 'success',
        'rental_id', v_rental.id,
        'booking_number', v_matched_vnr,
        'soll_amount', v_soll,
        'overpaid', GREATEST(p_amount - v_soll, 0),
        'match_method', 'contract_nr',
        'invoice_id', v_rental.invoice_id,
        'message', v_comment
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_rental_payment(TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_rental_payment(TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, DATE) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
