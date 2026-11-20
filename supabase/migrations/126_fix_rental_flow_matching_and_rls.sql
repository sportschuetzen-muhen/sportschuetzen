-- ==============================================================================
-- 126_fix_rental_flow_matching_and_rls.sql
-- Migration: Durchfluss-Fixes, Trigger-Schutz, Bank-Matching & PII-Schutz (RLS)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Inhalt:
-- 1. Trigger generate_rental_booking_number():
--    - Vorhandene booking_number (z.B. Notfall-Nummern V-2026-N001) nicht mehr
--      überschreiben (verhindert auch Integer-Cast-Absturz auf 'N001').
--    - Präfix 'A-' bei is_inquiry = true, sonst 'V-'.
--    - Jahr aus start_date (Fallback CURRENT_DATE), Sequenz via rental_booking_seq.
--    - updated_at sauber setzen.
-- 2. confirm_rental_payment():
--    - 3-Punkte-Fallback schliesst status IN ('cancelled', 'inquiry') explizit aus.
-- 3. PII-Schutz für anonyme Website-Abfragen:
--    - Neue SECURITY-DEFINER-RPC get_public_rental_calendar() (nur Kalenderfelder).
--    - Neue SECURITY-DEFINER-RPC submit_public_rental_request(p_payload JSONB)
--      mit serverseitigem Doppelbuchungs-Check & Tarif-Enforcement (standard_tag).
--    - Offene anon-Policies (rental_requests_public_read / _insert) entfernen.
-- ==============================================================================

BEGIN;

-- 1. Sequenz mit höchster bestehender regulärer Nummer abgleichen
SELECT setval(
    'public.rental_booking_seq',
    GREATEST(
        COALESCE((
            SELECT MAX((regexp_match(booking_number, '^[VA]-\d{4}-(\d+)$'))[1]::BIGINT)
            FROM public.rental_requests
            WHERE booking_number ~ '^[VA]-\d{4}-\d+$'
        ), 0),
        1
    ),
    true
);

-- 2. Buchungsnummern-Trigger reparieren (Notfall-Nummern & Anfragen schützen)
CREATE OR REPLACE FUNCTION public.generate_rental_booking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    cur_year TEXT;
    prefix   TEXT;
    seq_val  BIGINT;
BEGIN
    IF NEW.booking_number IS NULL OR btrim(NEW.booking_number) = '' THEN
        cur_year := TO_CHAR(COALESCE(NEW.start_date, CURRENT_DATE), 'YYYY');
        prefix := CASE WHEN COALESCE(NEW.is_inquiry, false) THEN 'A-' ELSE 'V-' END;
        seq_val := nextval('public.rental_booking_seq');
        NEW.booking_number := prefix || cur_year || '-' || LPAD(seq_val::TEXT, 4, '0');
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- 3. confirm_rental_payment(): 3-Punkte-Fallback schliesst cancelled/inquiry aus
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

    -- 2. VERSUCH: Fallback über Mietdatum + Nachname + exakter Betrag
    IF v_rental IS NULL AND p_rent_date IS NOT NULL AND p_payer_name IS NOT NULL AND trim(p_payer_name) <> '' THEN
        v_last_name := trim(split_part(trim(p_payer_name), ' ', array_length(string_to_array(trim(p_payer_name), ' '), 1)));

        IF v_last_name IS NOT NULL AND length(v_last_name) >= 3 THEN
            SELECT * INTO v_rental
            FROM public.rental_requests
            WHERE start_date = p_rent_date
              AND status NOT IN ('cancelled', 'inquiry')
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

    IF p_amount < v_soll THEN
        RETURN jsonb_build_object('success', false, 'code', 'underpaid', 'rental_id', v_rental.id,
                                  'booking_number', v_matched_vnr,
                                  'soll_amount', v_soll,
                                  'message', format('Zahlung zu niedrig: erhalten CHF %s, Soll CHF %s.',
                                                    to_char(p_amount, 'FM999990.00'), to_char(v_soll, 'FM999990.00')));
    END IF;

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

-- 4. PII-freie öffentliche Kalender-RPC für Website
CREATE OR REPLACE FUNCTION public.get_public_rental_calendar()
RETURNS TABLE (
    start_date DATE,
    end_date   DATE,
    festbeginn VARCHAR,
    status     public.rental_status,
    is_inquiry BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        r.start_date,
        r.end_date,
        r.festbeginn,
        r.status,
        COALESCE(r.is_inquiry, false) AS is_inquiry
    FROM public.rental_requests r
    WHERE r.status <> 'cancelled'
    ORDER BY r.start_date ASC;
$$;

REVOKE ALL ON FUNCTION public.get_public_rental_calendar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_rental_calendar() TO anon, authenticated, service_role;

-- 5. Geschützte öffentliche Buchungs-/Anfrage-RPC (ohne anon SELECT/INSERT auf PII-Tabelle)
CREATE OR REPLACE FUNCTION public.submit_public_rental_request(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_first_name   TEXT := btrim(COALESCE(p_payload->>'first_name', ''));
    v_last_name    TEXT := btrim(COALESCE(p_payload->>'last_name', ''));
    v_email        TEXT := btrim(COALESCE(p_payload->>'email', ''));
    v_phone        TEXT := btrim(COALESCE(p_payload->>'phone', ''));
    v_salutation   TEXT := NULLIF(btrim(COALESCE(p_payload->>'salutation', '')), '');
    v_street       TEXT := btrim(COALESCE(p_payload->>'street', ''));
    v_post_code    TEXT := btrim(COALESCE(p_payload->>'post_code', ''));
    v_city         TEXT := btrim(COALESCE(p_payload->>'city', ''));
    v_festbeginn   TEXT := NULLIF(btrim(COALESCE(p_payload->>'festbeginn', '')), '');
    v_start_date   DATE;
    v_is_inquiry   BOOLEAN := COALESCE((p_payload->>'is_inquiry')::BOOLEAN, false);
    v_inquiry_type TEXT := NULLIF(btrim(COALESCE(p_payload->>'inquiry_type', '')), '');
    v_inquiry_note TEXT := NULLIF(btrim(COALESCE(p_payload->>'inquiry_note', '')), '');
    v_pricing_id   UUID;
    v_amount       NUMERIC(10,2) := 300.00;
    v_today_ch     DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
    v_inserted     public.rental_requests%ROWTYPE;
BEGIN
    IF v_first_name = '' OR v_last_name = '' OR v_email = '' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Vorname, Nachname und E-Mail sind Pflichtfelder.' USING ERRCODE = 'P0001';
    END IF;

    BEGIN
        v_start_date := (p_payload->>'start_date')::DATE;
    EXCEPTION WHEN OTHERS THEN
        v_start_date := NULL;
    END;

    IF v_start_date IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Ungültiges Mietdatum.' USING ERRCODE = 'P0001';
    END IF;

    IF v_start_date < v_today_ch THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Das Mietdatum darf nicht in der Vergangenheit liegen.' USING ERRCODE = 'P0001';
    END IF;

    -- Serverseitige Doppelbuchungsprüfung bei regulären Buchungen
    IF NOT v_is_inquiry THEN
        PERFORM 1 FROM public.rental_requests
        WHERE start_date = v_start_date
          AND status <> 'cancelled'
          AND COALESCE(is_inquiry, false) = false;
        IF FOUND THEN
            RAISE EXCEPTION 'DOUBLE_BOOKING: Dieser Termin ist bereits reserviert.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Aktiven Standardtarif serverseitig ermitteln (verhindert Preismanipulation)
    SELECT id, COALESCE(base_price_chf, 300.00)
    INTO v_pricing_id, v_amount
    FROM public.rental_pricing
    WHERE tariff_code = 'standard_tag' AND is_active IS TRUE
    LIMIT 1;

    INSERT INTO public.rental_requests (
        is_inquiry,
        inquiry_type,
        inquiry_note,
        salutation,
        first_name,
        last_name,
        email,
        phone,
        street,
        post_code,
        city,
        start_date,
        end_date,
        festbeginn,
        pricing_id,
        total_amount_chf,
        deposit_amount_chf,
        status,
        datum_vertrag,
        source
    ) VALUES (
        v_is_inquiry,
        v_inquiry_type,
        v_inquiry_note,
        v_salutation,
        v_first_name,
        v_last_name,
        v_email,
        v_phone,
        v_street,
        v_post_code,
        v_city,
        v_start_date,
        v_start_date,
        v_festbeginn,
        v_pricing_id,
        COALESCE(v_amount, 300.00),
        0.00,
        CASE WHEN v_is_inquiry THEN 'inquiry'::public.rental_status ELSE 'contract_sent'::public.rental_status END,
        CASE WHEN v_is_inquiry THEN NULL ELSE v_today_ch END,
        'supabase'
    )
    RETURNING * INTO v_inserted;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_inserted.id,
        'booking_number', v_inserted.booking_number,
        'status', v_inserted.status,
        'is_inquiry', v_inserted.is_inquiry,
        'total_amount_chf', v_inserted.total_amount_chf
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_rental_request(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_rental_request(JSONB) TO anon, authenticated, service_role;

-- 6. Offene anonyme PII-Policies auf rental_requests entfernen
DROP POLICY IF EXISTS rental_requests_public_read ON public.rental_requests;
DROP POLICY IF EXISTS rental_requests_public_insert ON public.rental_requests;

COMMIT;
