-- ==============================================================================
-- 05_rental_dev_policies.sql
-- Übergangs- und Entwicklungs-Policies für anon/authenticated Zugriff auf Fachmodul VERMIETUNG
-- Ermöglicht nahtlose Nutzung über Vorstand-Portal & Homepage mit ANON_KEY
-- ==============================================================================

-- 1. ROW LEVEL SECURITY AKTIVIEREN
ALTER TABLE public.rental_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_cancellation_feedbacks ENABLE ROW LEVEL SECURITY;

-- 2. POLICIES FÜR rental_settings
DROP POLICY IF EXISTS rental_settings_anon_read ON public.rental_settings;
CREATE POLICY rental_settings_anon_read ON public.rental_settings
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS rental_settings_anon_manage ON public.rental_settings;
CREATE POLICY rental_settings_anon_manage ON public.rental_settings
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 3. POLICIES FÜR rental_pricing
DROP POLICY IF EXISTS rental_pricing_anon_read ON public.rental_pricing;
CREATE POLICY rental_pricing_anon_read ON public.rental_pricing
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS rental_pricing_anon_manage ON public.rental_pricing;
CREATE POLICY rental_pricing_anon_manage ON public.rental_pricing
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 4. POLICIES FÜR rental_requests
DROP POLICY IF EXISTS rental_requests_anon_manage ON public.rental_requests;
CREATE POLICY rental_requests_anon_manage ON public.rental_requests
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 5. POLICIES FÜR rental_status_logs
DROP POLICY IF EXISTS rental_status_logs_anon_manage ON public.rental_status_logs;
CREATE POLICY rental_status_logs_anon_manage ON public.rental_status_logs
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 6. POLICIES FÜR rental_cancellation_feedbacks
DROP POLICY IF EXISTS rental_feedback_anon_manage ON public.rental_cancellation_feedbacks;
CREATE POLICY rental_feedback_anon_manage ON public.rental_cancellation_feedbacks
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 7. RECHTE FÜR SEQUENZ UND FUNKTIONEN
GRANT USAGE, SELECT ON SEQUENCE public.rental_booking_seq TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_rental_booking_number TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_rental_status_change TO anon, authenticated;
