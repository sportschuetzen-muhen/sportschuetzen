-- ==============================================================================
-- 127_inventar_fibu_rpc_and_checks.sql
-- Migration: Sichere FiBu-Journal-Buchung für Inventar-Berechtigte (RPC)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Hintergrund:
--   Gemäss Migration 49 erfordert direkter Schreibzugriff auf
--   `public.accounting_journal` die Berechtigung `buchhaltung.manage`.
--   Benutzer mit `inventar.manage` (z. B. Jungschützenleiter) müssen bei
--   Bar-/Twint-Materialverkäufen sowie Pfand-Ein-/-Auszahlungen jedoch gültige
--   Kassa-/Transit-Buchungen im Journal erfassen dürfen, ohne vollen Zugriff
--   auf das gesamte Modul Finanzbuchhaltung zu erhalten.
--
-- Inhalt:
--   1. SECURITY DEFINER RPC `public.inventar_book_accounting_journal(...)`
--      mit RBAC-Prüfung auf `inventar.manage` oder `buchhaltung.manage`.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.inventar_book_accounting_journal(
    p_jahr INTEGER,
    p_datum DATE,
    p_beleg_nr TEXT,
    p_beschreibung TEXT,
    p_konto_soll TEXT,
    p_konto_haben TEXT,
    p_betrag NUMERIC,
    p_typ TEXT DEFAULT 'Kassa',
    p_buchungstyp TEXT DEFAULT 'ERTRAG'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id BIGINT;
    v_jahr INTEGER;
BEGIN
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['inventar.manage', 'buchhaltung.manage'])
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung (inventar.manage oder buchhaltung.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    IF p_betrag IS NULL OR p_betrag <= 0 THEN
        RAISE EXCEPTION 'Ungültiger Buchungsbetrag: % (muss > 0 sein).', p_betrag USING ERRCODE = '22023';
    END IF;

    IF COALESCE(btrim(p_konto_soll), '') = '' OR COALESCE(btrim(p_konto_haben), '') = '' THEN
        RAISE EXCEPTION 'Soll- und Haben-Konto dürfen nicht leer sein.' USING ERRCODE = '22023';
    END IF;

    v_jahr := COALESCE(p_jahr, EXTRACT(YEAR FROM COALESCE(p_datum, CURRENT_DATE))::INTEGER);

    INSERT INTO public.accounting_journal (
        jahr,
        datum,
        beleg_nr,
        beschreibung,
        konto_soll,
        konto_haben,
        betrag,
        typ,
        buchungstyp
    ) VALUES (
        v_jahr,
        COALESCE(p_datum, CURRENT_DATE),
        COALESCE(left(btrim(p_beleg_nr), 100), ''),
        COALESCE(p_beschreibung, ''),
        btrim(p_konto_soll),
        btrim(p_konto_haben),
        ROUND(p_betrag, 2),
        COALESCE(NULLIF(btrim(p_typ), ''), 'Kassa'),
        COALESCE(NULLIF(btrim(p_buchungstyp), ''), 'ERTRAG')
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.inventar_book_accounting_journal(INTEGER, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) IS
  'Erstellt eine Journal-Buchung in accounting_journal für Inventar-Transaktionen (Bar/Twint Verkauf & Depot), abgesichert über rbac_allows(inventar.manage | buchhaltung.manage).';

REVOKE ALL ON FUNCTION public.inventar_book_accounting_journal(INTEGER, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventar_book_accounting_journal(INTEGER, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
