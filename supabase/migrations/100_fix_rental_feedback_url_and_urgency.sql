-- =============================================================================
-- 100: Storno-Feedback – korrekte URL & serverseitige Dringlichkeits-Logik
-- =============================================================================
-- 1. feedback_base_url zeigte auf den nicht existierenden Pfad /vermietungen/.
--    Die Seite liegt auf Cloudflare Pages unter /sportschuetzen-website/frontend/.
-- 2. is_urgent wird serverseitig bestimmt (Doku Abschnitt 2.4): Termin innerhalb
--    der nächsten 14 Tage ODER Mieter meldet "Zahlung bereits getätigt"
--    (vom Formular als is_urgent = true übermittelt). Zudem wird die Rückmeldung
--    über die Buchungsnummer mit rental_requests verknüpft.
--    anon hat kein SELECT auf rental_requests, daher SECURITY DEFINER.
-- =============================================================================

UPDATE public.rental_settings
   SET setting_value = 'https://sps-b55.pages.dev/sportschuetzen-website/frontend/storno_feedback',
       updated_at    = now()
 WHERE setting_key = 'feedback_base_url';

INSERT INTO public.rental_settings (setting_key, setting_value, description)
VALUES ('feedback_base_url', 'https://sps-b55.pages.dev/sportschuetzen-website/frontend/storno_feedback', 'Basis-URL für Storno-Rückmeldung')
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rental_feedback_enrich()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_start date;
BEGIN
  SELECT id, start_date
    INTO v_id, v_start
    FROM public.rental_requests
   WHERE booking_number = NEW.booking_number
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    NEW.rental_request_id := COALESCE(NEW.rental_request_id, v_id);
  END IF;

  NEW.is_urgent := COALESCE(NEW.is_urgent, false)
                   OR (v_start IS NOT NULL
                       AND v_start >= (now() AT TIME ZONE 'Europe/Zurich')::date
                       AND v_start <= (now() AT TIME ZONE 'Europe/Zurich')::date + 14);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rental_feedback_enrich ON public.rental_cancellation_feedbacks;
CREATE TRIGGER trg_rental_feedback_enrich
  BEFORE INSERT ON public.rental_cancellation_feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.rental_feedback_enrich();
