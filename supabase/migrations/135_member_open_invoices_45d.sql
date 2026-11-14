-- ==============================================================================
-- Migration 135: Offene Mitglieder-Rechnungen erst ab 45 Tagen ab Versanddatum
-- 1. Aktualisiert public.get_member_pendenzen_count:
--    B2 (member_invoices) zählt nur noch Rechnungen mit status = 'offen',
--    mail_status IN ('gesendet', 'versendet') und Versanddatum >= 45 Tage zurück.
-- 2. Neu: public.get_member_open_invoices(p_lizenz, p_min_age_days DEFAULT 45):
--    Liefert genau diese überfälligen offenen Rechnungen für die Anzeige in der Web-App.
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
    v_board_invoices_draft_count INTEGER := 0;
    v_board_invoices_overdue_count INTEGER := 0;
    v_board_invoices_total INTEGER := 0;
    v_board_polls_past_count INTEGER := 0;
    v_board_mails_failed_count INTEGER := 0;
    v_board_total INTEGER := 0;
    v_total INTEGER := 0;
BEGIN
    v_clean_lizenz := NULLIF(TRIM(p_lizenz), '');
    
    -- --------------------------------------------------------------------------
    -- 1. PERSÖNLICHE MITGLIEDER-PENDENZEN
    -- --------------------------------------------------------------------------
    IF v_clean_lizenz IS NOT NULL THEN
        v_padded_lizenz := LPAD(v_clean_lizenz, 6, '0');
        v_unpadded_lizenz := LTRIM(v_clean_lizenz, '0');
        IF v_unpadded_lizenz = '' THEN
            v_unpadded_lizenz := '0';
        END IF;

        -- B1: Offene Umfragen / RSVPs (aktiv, Datum heute oder Zukunft, noch keine Rückmeldung)
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

        -- B2: Offene persönliche Rechnungen (Status 'offen', versendet und >= 45 Tage alt)
        SELECT COUNT(*)::INTEGER
        INTO v_invoices_count
        FROM public.invoices inv
        WHERE (
            inv.person_number = v_clean_lizenz
            OR inv.person_number = v_padded_lizenz
            OR inv.person_number = v_unpadded_lizenz
        )
        AND inv.status = 'offen'
        AND inv.mail_status IN ('gesendet', 'versendet')
        AND COALESCE(inv.send_date, inv.created_at) <= (NOW() - INTERVAL '45 days');
    END IF;

    -- --------------------------------------------------------------------------
    -- 2. VORSTANDS-PENDENZEN (falls p_is_board = TRUE)
    -- --------------------------------------------------------------------------
    IF p_is_board IS TRUE THEN
        -- A1: Neue Vorab-Mietanfragen
        SELECT COUNT(*)::INTEGER
        INTO v_board_rentals_count
        FROM public.rental_requests rr
        WHERE rr.status = 'inquiry';

        -- A3: OCR-Standblätter zur Prüfung / Validierung
        SELECT COUNT(*)::INTEGER
        INTO v_board_ocr_count
        FROM public.contest_ocr_logs ocr
        WHERE ocr.contest_type = 'standblatt'
          AND COALESCE(ocr.raw_response->>'status', '') NOT IN ('imported', 'rejected');

        -- A4: Rechnungs-Pendenzen (Entwürfe zum Versenden + überfällige Rechnungen)
        SELECT COUNT(*)::INTEGER
        INTO v_board_invoices_draft_count
        FROM public.invoices inv
        WHERE inv.mail_status = 'entwurf' OR inv.status = 'entwurf';

        SELECT COUNT(*)::INTEGER
        INTO v_board_invoices_overdue_count
        FROM public.invoices inv
        WHERE inv.status = 'offen'
          AND inv.due_date IS NOT NULL
          AND inv.due_date < CURRENT_DATE;

        v_board_invoices_total := v_board_invoices_draft_count + v_board_invoices_overdue_count;

        -- A5: Anlässe & Umfragen (Abgelaufene aktive Anlässe, die auf Auswertung/Archivierung warten)
        SELECT COUNT(*)::INTEGER
        INTO v_board_polls_past_count
        FROM public.poll_events pe
        WHERE pe.aktiv = true
          AND pe.datum IS NOT NULL
          AND pe.datum < CURRENT_DATE;

        -- A8: System-Mails / Mail-Log (Fehlgeschlagene Mails / Bounces)
        SELECT COUNT(*)::INTEGER
        INTO v_board_mails_failed_count
        FROM public.mail_logs ml
        WHERE ml.status IN ('fehler', 'failed');

        -- Summe aller Vorstandspendenzen
        v_board_total := v_board_rentals_count
                       + v_board_ocr_count
                       + v_board_invoices_total
                       + v_board_polls_past_count
                       + v_board_mails_failed_count;
    END IF;

    -- Gesamtsumme für App-Badging
    v_total := v_rsvps_count + v_invoices_count + v_board_total;

    RETURN jsonb_build_object(
        'total', v_total,
        'member_rsvps', v_rsvps_count,
        'member_invoices', v_invoices_count,
        'board_rentals', v_board_rentals_count,
        'board_ocr', v_board_ocr_count,
        'board_invoices_draft', v_board_invoices_draft_count,
        'board_invoices_overdue', v_board_invoices_overdue_count,
        'board_invoices_total', v_board_invoices_total,
        'board_polls_past', v_board_polls_past_count,
        'board_mails_failed', v_board_mails_failed_count,
        'board_total', v_board_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_pendenzen_count(TEXT, BOOLEAN) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- RPC: Offene persönliche Rechnungen ab p_min_age_days Tagen ab Versanddatum
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_member_open_invoices(
    p_lizenz TEXT,
    p_min_age_days INTEGER DEFAULT 45
)
RETURNS TABLE (
    id VARCHAR(50),
    type VARCHAR(50),
    year INTEGER,
    open_amount NUMERIC(10,2),
    total_amount NUMERIC(10,2),
    send_date TIMESTAMPTZ,
    due_date DATE,
    pdf_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_lizenz TEXT;
    v_padded_lizenz TEXT;
    v_unpadded_lizenz TEXT;
    v_days INTEGER;
BEGIN
    v_clean_lizenz := NULLIF(TRIM(p_lizenz), '');
    IF v_clean_lizenz IS NULL THEN
        RETURN;
    END IF;

    v_padded_lizenz := LPAD(v_clean_lizenz, 6, '0');
    v_unpadded_lizenz := LTRIM(v_clean_lizenz, '0');
    IF v_unpadded_lizenz = '' THEN
        v_unpadded_lizenz := '0';
    END IF;
    v_days := GREATEST(COALESCE(p_min_age_days, 45), 0);

    RETURN QUERY
    SELECT
        inv.id,
        inv.type,
        inv.year,
        CASE WHEN COALESCE(inv.open_amount, 0) > 0 THEN inv.open_amount ELSE inv.total_amount END AS open_amount,
        inv.total_amount,
        COALESCE(inv.send_date, inv.created_at) AS send_date,
        inv.due_date,
        inv.pdf_url
    FROM public.invoices inv
    WHERE (
        inv.person_number = v_clean_lizenz
        OR inv.person_number = v_padded_lizenz
        OR inv.person_number = v_unpadded_lizenz
    )
    AND inv.status = 'offen'
    AND inv.mail_status IN ('gesendet', 'versendet')
    AND COALESCE(inv.send_date, inv.created_at) <= (NOW() - make_interval(days => v_days))
    ORDER BY COALESCE(inv.send_date, inv.created_at) ASC, inv.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_open_invoices(TEXT, INTEGER) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_member_open_invoices IS 'Liefert versendete, noch offene persönliche Rechnungen ab einem Mindestalter in Tagen (Standard 45 Tage) für die Web-App.';
