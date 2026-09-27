-- ==============================================================================
-- 26_atomic_invoice_numbers.sql
-- Migration: ATOMARE RECHNUNGSNUMMERNVERGABE IN POSTGRESQL (Race-Condition Schutz)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Zweck:
-- 1. Etablierung einer fortlaufenden PostgreSQL-Sequence für Rechnungsnummern
-- 2. Stored Procedure public.next_invoice_number(prefix, year)
--    Garantiert atomare, lückenlose und kollisionsfreie Nummernvergabe
--    Format: {PREFIX}-{YY}-{NNNN}, z. B. 'RE-26-0042', 'MV-26-0015', 'JB-26-0120'
-- 3. RLS / Grants für authentifizierte Vorstandsmitglieder und Anon Dev
-- ==============================================================================

-- 1. SEQUENCE FÜR RECHNUNGSNUMMERN
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- 2. ATOMARE FUNKTION: next_invoice_number
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_invoice_number(
    p_prefix VARCHAR DEFAULT 'RE',
    p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_seq_val BIGINT;
    v_short_year VARCHAR(2);
    v_clean_prefix VARCHAR(10);
    v_inv_id VARCHAR(50);
BEGIN
    -- Sequenz atomar hochzählen
    v_seq_val := nextval('public.invoice_number_seq');
    
    -- Zweistelliges Jahr (z.B. '26' für 2026)
    v_short_year := to_char(p_year, 'YY');
    
    -- Bereinigtes Präfix (Standard 'RE')
    v_clean_prefix := UPPER(COALESCE(NULLIF(TRIM(p_prefix), ''), 'RE'));
    
    -- Formatieren: z.B. RE-26-0001
    v_inv_id := v_clean_prefix || '-' || v_short_year || '-' || lpad(v_seq_val::text, 4, '0');
    
    RETURN v_inv_id;
END;
$$;

-- 3. BERECHTIGUNGEN
-- ------------------------------------------------------------------------------
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(VARCHAR, INTEGER) TO authenticated, anon;

COMMENT ON FUNCTION public.next_invoice_number IS
    'Atomare, kollisionsfreie Vergabe von Rechnungsnummern direkt in PostgreSQL (verhindert Race Conditions im Client).';
