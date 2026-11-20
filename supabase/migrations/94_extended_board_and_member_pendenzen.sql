-- ==============================================================================
-- Migration 94: extended_board_and_member_pendenzen RPC für iOS/Android PWA Badges
-- Erweitert get_member_pendenzen_count um:
-- - A1: Vermietung (Vorab-Anfragen 'inquiry')
-- - A3: Jahresmeisterschaft (OCR-Standblätter zur Prüfung)
-- - A4: Rechnungen (Entwürfe 'entwurf' + überfällige Rechnungen)
-- - A5: Anlässe & Umfragen (Abgelaufene aktive Anlässe, die Abschluss/Auswertung brauchen)
-- - A8: System-Mails (Fehlgeschlagene Mails 'fehler'/'failed')
-- - B1: Mitglieder RSVPs (Aktive Umfragen ohne Rückmeldung)
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

        -- B2: Offene persönliche Rechnungen (Status 'offen' und bereits an das Mitglied versendet)
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

-- Berechtigungen für API-Zugriff (anon für Web-App, authenticated für eingeloggte User)
GRANT EXECUTE ON FUNCTION public.get_member_pendenzen_count(TEXT, BOOLEAN) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_member_pendenzen_count IS 'Ermittelt aggregierte Pendenzen für Vereinsmitglieder und Vorstand für das iOS/Android App-Icon Badging und Fachmodul-Kacheln';
