-- ==============================================================================
-- Migration 91: Erweitertes Matching für Bank-Gutschriften (Name + Mietdatum + Betrag)
-- Sportschützen Muhen - Zentrales Vereinsportal
--
-- Erweitert:
-- 1. public.bank_mail_ingest_logs um Spalten fuer extrahierte Bank-Metadaten
-- 2. public.confirm_rental_payment() um Fallback-Matching:
--    Wenn p_booking_number nicht gefunden wird, sucht die Funktion nach
--    start_date = p_rent_date UND last_name ILIKE p_payer_last_name UND total_amount_chf = p_amount
-- ==============================================================================

BEGIN;

-- 1. Spalten in bank_mail_ingest_logs anfügen
ALTER TABLE public.bank_mail_ingest_logs 
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS payer_address TEXT,
  ADD COLUMN IF NOT EXISTS rent_date DATE,
  ADD COLUMN IF NOT EXISTS match_method VARCHAR(30) DEFAULT 'contract_nr';

-- 2. Erweiterte RPC-Funktion mit Kaskaden-Matching
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
    v_inv_res      JSONB;
    v_inv_id       VARCHAR(50);
    v_inv          RECORD;
    v_pay_amt      NUMERIC(10,2);
    v_pay_res      JSONB := NULL;
    v_comment      TEXT;
    v_match_method VARCHAR(30) := 'contract_nr';
    v_last_name    TEXT := NULL;
    v_matched_vnr  TEXT;
BEGIN
    -- Berechtigung: Service-Role, Postgres oder vermietung.manage
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

    -- 1. VERSUCH: Primär über Buchungsnummer
    IF p_booking_number IS NOT NULL AND p_booking_number <> '' THEN
        SELECT * INTO v_rental
        FROM public.rental_requests
        WHERE booking_number = p_booking_number
        FOR UPDATE;
    END IF;

    -- 2. VERSUCH: Fallback über Mietdatum + Nachname + EXAKTER Betrag
    IF v_rental IS NULL AND p_rent_date IS NOT NULL AND p_payer_name IS NOT NULL AND trim(p_payer_name) <> '' THEN
        -- Extrahiere Nachnamen (letztes Wort des Namens)
        v_last_name := trim(split_part(trim(p_payer_name), ' ', array_length(string_to_array(trim(p_payer_name), ' '), 1)));

        IF v_last_name IS NOT NULL AND length(v_last_name) >= 3 THEN
            SELECT * INTO v_rental
            FROM public.rental_requests
            WHERE start_date = p_rent_date
              AND (last_name ILIKE '%' || v_last_name || '%' OR first_name ILIKE '%' || v_last_name || '%')
              AND total_amount_chf = p_amount
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE;

            IF FOUND THEN
                v_match_method := 'name_date_amount_match';
            END IF;
        END IF;
    END IF;

    -- Weder über Nummer noch über Fallback gefunden
    IF v_rental IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'unknown_contract',
            'message', format('Keine passende Reservation gefunden (Nr: %s, Mieter: %s, Mietdatum: %s, Betrag: CHF %s).',
                              COALESCE(p_booking_number, '–'),
                              COALESCE(p_payer_name, '–'),
                              COALESCE(to_char(p_rent_date, 'DD.MM.YYYY'), '–'),
                              to_char(p_amount, 'FM999990.00'))
        );
    END IF;

    v_matched_vnr := v_rental.booking_number;
    v_soll := COALESCE(v_rental.total_amount_chf, 0);

    IF v_rental.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'code', 'cancelled', 'rental_id', v_rental.id,
                                  'booking_number', v_matched_vnr,
                                  'soll_amount', v_soll,
                                  'message', 'Reservation ' || v_matched_vnr || ' ist storniert.');
    END IF;

    IF v_rental.is_paid IS TRUE OR v_rental.status IN ('paid', 'keys_issued', 'completed') THEN
        RETURN jsonb_build_object('success', true, 'code', 'already_paid', 'rental_id', v_rental.id,
                                  'booking_number', v_matched_vnr,
                                  'soll_amount', v_soll,
                                  'match_method', v_match_method,
                                  'message', 'Reservation ' || v_matched_vnr || ' ist bereits als bezahlt erfasst.');
    END IF;

    -- Betrag muss dem Sollbetrag entsprechen (oder größer)
    IF p_amount < v_soll THEN
        RETURN jsonb_build_object('success', false, 'code', 'underpaid', 'rental_id', v_rental.id,
                                  'booking_number', v_matched_vnr,
                                  'soll_amount', v_soll,
                                  'message', format('Zahlung zu niedrig: erhalten CHF %s, Soll CHF %s.',
                                                    to_char(p_amount, 'FM999990.00'), to_char(v_soll, 'FM999990.00')));
    END IF;

    -- RechnungsCore: Proforma-Rechnung sicherstellen und Zahlung atomar verbuchen
    v_inv_res := public.ensure_rental_proforma_invoice(v_matched_vnr);
    IF COALESCE((v_inv_res->>'success')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Proforma-Rechnung für % konnte nicht sichergestellt werden: %',
                        v_matched_vnr, COALESCE(v_inv_res->>'error', 'unbekannt');
    END IF;
    v_inv_id := v_inv_res->>'invoice_id';

    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_id;
    IF FOUND AND v_inv.status IN ('offen', 'teilbezahlt', 'entwurf') THEN
        v_pay_amt := COALESCE(NULLIF(v_inv.open_amount, 0), v_inv.total_amount);
        IF v_pay_amt IS NOT NULL AND v_pay_amt > 0 THEN
            v_pay_res := public.record_invoice_payment(
                v_inv_id, v_pay_amt, p_payment_date, 'Bank',
                'BANK-' || v_matched_vnr,
                format('Zahlungseingang Mietvertrag %s (%s, erhalten CHF %s via %s)',
                       v_matched_vnr, p_source, to_char(p_amount, 'FM999990.00'), v_match_method),
                true, NULL, NULL
            );
        END IF;
    END IF;

    v_comment := format('Zahlung automatisch erkannt via %s (CHF %s, Match: %s)', p_source, to_char(p_amount, 'FM999990.00'), v_match_method);
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
        'match_method', v_match_method,
        'invoice_id', v_inv_id,
        'payment', v_pay_res,
        'message', v_comment
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_rental_payment(TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_rental_payment(TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, DATE) TO authenticated, service_role;

COMMIT;
