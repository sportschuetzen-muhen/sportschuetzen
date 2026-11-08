-- =============================================================================
-- 102: Automatische Zeitstempel-Aktualisierung fuer rental_settings
-- =============================================================================
-- Aktualisiert updated_at bei jedem UPDATE oder UPSERT auf rental_settings automatisch.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_rental_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rental_settings_updated_at ON public.rental_settings;
CREATE TRIGGER trg_rental_settings_updated_at
  BEFORE UPDATE ON public.rental_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_rental_settings_updated_at();
