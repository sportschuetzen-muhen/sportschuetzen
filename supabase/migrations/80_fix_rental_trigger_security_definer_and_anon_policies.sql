-- supabase/migrations/80_fix_rental_trigger_security_definer_and_anon_policies.sql
-- ==============================================================================
-- Behebung von RLS-Blockaden bei anonymen Online-Reservationen & Storno-Feedbacks
-- Fachbereich: Vermietung Schützenstube Rüteli (schuetzenhaus_vermietung.html)
-- ==============================================================================

-- 1. TRIGGER FUNCTION: log_rental_status_change mit SECURITY DEFINER härten
-- Stellt sicher, dass automatische Status-Logs bei Buchungen über die öffentliche
-- Website (Rolle 'anon') revisionssicher in 'rental_status_logs' geschrieben werden.
CREATE OR REPLACE FUNCTION public.log_rental_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.rental_status_logs (rental_request_id, previous_status, new_status, comment, changed_by)
        VALUES (NEW.id, NULL, NEW.status, 'Reservation erstellt', 'System');
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.rental_status_logs (rental_request_id, previous_status, new_status, comment, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, 'Status gewechselt von ' || OLD.status::TEXT || ' zu ' || NEW.status::TEXT, 'Portal / Workflow');
    END IF;
    RETURN NEW;
END;
$$;

-- 2. TRIGGER FUNCTION: generate_rental_booking_number mit SECURITY DEFINER härten
CREATE OR REPLACE FUNCTION public.generate_rental_booking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    cur_year TEXT;
    next_seq INT;
BEGIN
    cur_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    SELECT COALESCE(MAX(SUBSTRING(booking_number FROM 8 FOR 4)::INT), 0) + 1
    INTO next_seq
    FROM public.rental_requests
    WHERE booking_number LIKE 'V-' || cur_year || '-%';
    
    NEW.booking_number := 'V-' || cur_year || '-' || LPAD(next_seq::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

-- 3. POLICIES FÜR rental_cancellation_feedbacks: Anon-Insert erlauben
-- Erlaubt Mietern das Absenden von Stornierungs-Feedback über storno_feedback.html
DROP POLICY IF EXISTS rental_feedback_public_insert ON public.rental_cancellation_feedbacks;
CREATE POLICY rental_feedback_public_insert ON public.rental_cancellation_feedbacks
    FOR INSERT TO anon WITH CHECK (true);

-- 4. POLICIES FÜR document_templates: Anon-Read für öffentliche Mail- & Buchungsvorlagen
-- Ermöglicht dem Webformular das dynamische Laden von System-Vorlagen (z.B. vm_anfrage)
DROP POLICY IF EXISTS doc_templates_anon_read ON public.document_templates;
CREATE POLICY doc_templates_anon_read ON public.document_templates
    FOR SELECT TO anon USING (is_system = true OR category = 'Vermietung');

NOTIFY pgrst, 'reload schema';
