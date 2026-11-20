-- ==============================================================================
-- 140_bank_mail_status_keys_issued.sql
-- Migration: Zahlungseingang setzt direkt Status 'keys_issued' (Stufe 4)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Inhalte:
-- 1. public.confirm_rental_payment(): Setzt bei Zahlungseingang direkt
--    status = 'keys_issued' (Stufe 4: Schlüsselübergabe-Hinweis inkl. Mail an
--    Wirtschaftsteam) sowie datum_schluessel = CURRENT_DATE.
-- 2. Bereinigung Testdatensatz V-2026-0009 (Status 'keys_issued',
--    datum_schluessel = '2026-11-18', sauberes UTF-8-Encoding im Kommentar).
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
    SET status = 'keys_issued',
        is_paid = true,
        status_raiffeisen = 'bank_notified',
        datum_raiffeisen = p_payment_date,
        datum_schluessel = COALESCE(datum_schluessel, CURRENT_DATE),
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

-- Bestehenden Testdatensatz V-2026-0009 auf Stufe 4 (keys_issued) & sauberes UTF-8 aktualisieren
UPDATE public.rental_requests
SET status = 'keys_issued',
    datum_schluessel = COALESCE(datum_schluessel, DATE '2026-11-18'),
    kommentar_raiffeisen = 'Zahlungseingang erkannt via Bank-Mail Raiffeisen (CHF 300.00, Vertrag V-2026-0009 – FiBu folgt über CAMT)',
    updated_at = now()
WHERE booking_number = 'V-2026-0009'
  AND status = 'paid';

NOTIFY pgrst, 'reload schema';

COMMIT;
