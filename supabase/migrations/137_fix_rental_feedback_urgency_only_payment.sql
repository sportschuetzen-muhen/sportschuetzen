-- =============================================================================
-- 137: Storno-Feedback Dringlichkeit nur bei "Zahlung bereits getätigt"
-- =============================================================================
-- Bisher setzte rental_feedback_enrich() is_urgent = true auch dann, wenn das
-- ursprüngliche Mietdatum innerhalb der nächsten 14 Tage lag. Im Cockpit
-- erschien dadurch bei jedem Feedback-Grund das rote Warn-Badge
-- "⚠️ Dringend: Zahlung erfolgt".
-- Künftig gilt is_urgent = true ausschliesslich bei "Zahlung bereits getätigt".
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rental_feedback_enrich()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id
    INTO v_id
    FROM public.rental_requests
   WHERE booking_number = NEW.booking_number
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    NEW.rental_request_id := COALESCE(NEW.rental_request_id, v_id);
  END IF;

  NEW.is_urgent := (COALESCE(NEW.reason, '') ILIKE U&'%bereits get\00E4tigt%');
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'trg_rental_feedback_enrich'
       AND tgrelid = 'public.rental_cancellation_feedbacks'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_rental_feedback_enrich
      BEFORE INSERT ON public.rental_cancellation_feedbacks
      FOR EACH ROW EXECUTE FUNCTION public.rental_feedback_enrich();
  END IF;
END;
$$;

UPDATE public.rental_cancellation_feedbacks
   SET is_urgent = (COALESCE(reason, '') ILIKE U&'%bereits get\00E4tigt%')
 WHERE is_urgent IS DISTINCT FROM (COALESCE(reason, '') ILIKE U&'%bereits get\00E4tigt%');

COMMIT;
