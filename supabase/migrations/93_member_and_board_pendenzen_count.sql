-- ==============================================================================
-- Migration 93: get_member_pendenzen_count RPC für iOS/Android PWA App-Badging
-- Berechnet atomar offene Pendenzen für Mitglieder (RSVPs, offene Rechnungen)
-- sowie optional für Vorstandsmitglieder (Standblätter, Miet-Anfragen)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_member_pendenzen_count(
    p_lizenz TEXT DEFAULT NULL,
    p_is_board BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_lizenz TEXT;
    v_padded_lizenz TEXT;
    v_unpadded_lizenz TEXT;
    v_rsvps_count INTEGER := 0;
    v_invoices_count INTEGER := 0;
    v_board_ocr_count INTEGER := 0;
    v_board_rentals_count INTEGER := 0;
    v_total INTEGER := 0;
BEGIN
    v_clean_lizenz := NULLIF(TRIM(p_lizenz), '');
    
    IF v_clean_lizenz IS NOT NULL THEN
        v_padded_lizenz := LPAD(v_clean_lizenz, 6, '0');
        v_unpadded_lizenz := LTRIM(v_clean_lizenz, '0');
        IF v_unpadded_lizenz = '' THEN
            v_unpadded_lizenz := '0';
        END IF;

        -- 1. Offene Umfragen / RSVPs (aktiv, Datum heute oder Zukunft, noch keine Rückmeldung)
        SELECT COUNT(*)::INTEGER
        INTO v_rsvps_count
        FROM public.poll_events pe
        WHERE pe.aktiv = true
          AND (pe.datum >= CURRENT_DATE OR pe.datum IS NULL)
          AND NOT EXISTS (
              SELECT 1 FROM public.poll_responses pr
              WHERE pr.event_id = pe.id
                AND (
                    pr.lizenz = v_clean_lizenz
                    OR pr.lizenz = v_padded_lizenz
                    OR pr.lizenz = v_unpadded_lizenz
                )
          );

        -- 2. Offene persönliche Rechnungen (Status 'offen' und bereits an das Mitglied zugestellt)
        SELECT COUNT(*)::INTEGER
        INTO v_invoices_count
        FROM public.invoices inv
        WHERE (
            inv.person_number = v_clean_lizenz
            OR inv.person_number = v_padded_lizenz
            OR inv.person_number = v_unpadded_lizenz
        )
        AND inv.status = 'offen'
        AND inv.mail_status IN ('gesendet', 'versendet');
    END IF;

    -- 3. Vorstands-Pendenzen (falls Vorstandsmitglied)
    IF p_is_board IS TRUE THEN
        -- OCR Standblätter zur Validierung
        SELECT COUNT(*)::INTEGER
        INTO v_board_ocr_count
        FROM public.contest_ocr_logs ocr
        WHERE ocr.contest_type = 'standblatt'
          AND COALESCE(ocr.raw_response->>'status', '') NOT IN ('imported', 'rejected');

        -- Neue Miet-Vorabanfragen
        SELECT COUNT(*)::INTEGER
        INTO v_board_rentals_count
        FROM public.rental_requests rr
        WHERE rr.status = 'inquiry';
    END IF;

    v_total := v_rsvps_count + v_invoices_count + v_board_ocr_count + v_board_rentals_count;

    RETURN jsonb_build_object(
        'total', v_total,
        'member_rsvps', v_rsvps_count,
        'member_invoices', v_invoices_count,
        'board_ocr', v_board_ocr_count,
        'board_rentals', v_board_rentals_count,
        'board_total', (v_board_ocr_count + v_board_rentals_count)
    );
END;
$$;

-- Berechtigungen für API-Zugriff (anon für Web-App, authenticated für eingeloggte User)
GRANT EXECUTE ON FUNCTION public.get_member_pendenzen_count(TEXT, BOOLEAN) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_member_pendenzen_count IS 'Ermittelt aggregierte Pendenzen für Vereinsmitglieder und Vorstand für das iOS/Android App-Icon Badging';
