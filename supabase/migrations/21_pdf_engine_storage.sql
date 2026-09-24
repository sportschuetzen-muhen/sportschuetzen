-- ==============================================================================
-- 21_pdf_engine_storage.sql
-- Migration: Phase 21 – Zentrale PDF-Engine & Supabase Storage Integration
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Zweck:
--   1. Einrichtung des Supabase Storage Buckets 'operatives-storage'
--   2. Storage RLS-Policies für Rechnungen, Mietverträge und Quittungen
--   3. Erweiterung von public.invoices und public.rental_bookings um Storage-
--      und Paperless-Felder
--   4. Audit-Tabelle public.document_generation_logs für PDF-Historie
--   5. Hilfs-RPCs zur Verknüpfung von generierten Dokumenten
-- ==============================================================================

-- 1. ENUM-ABSICHERUNG: archive_sync_status
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'archive_sync_status') THEN
        CREATE TYPE public.archive_sync_status AS ENUM (
            'not_applicable',
            'pending',
            'archived',
            'error'
        );
    END IF;
END$$;

-- 2. SUPABASE STORAGE BUCKET: operatives-storage
-- ------------------------------------------------------------------------------
-- Erstellt den zentralen Storage-Bucket für Rechnungen (invoices/{year}/),
-- Mietverträge (contracts/{year}/) und Quittungen (receipts/{year}/).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'operatives-storage',
    'operatives-storage',
    true,
    52428800, -- 50 MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. STORAGE RLS POLICIES
-- ------------------------------------------------------------------------------
-- Öffentlicher Lesezugriff auf operative Dokumente (oder via signierte URLs)
DROP POLICY IF EXISTS "Public Read operatives-storage" ON storage.objects;
CREATE POLICY "Public Read operatives-storage" ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'operatives-storage');

-- Authentifizierte Benutzer dürfen Dokumente hochladen und aktualisieren
DROP POLICY IF EXISTS "Authenticated Insert operatives-storage" ON storage.objects;
CREATE POLICY "Authenticated Insert operatives-storage" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'operatives-storage');

DROP POLICY IF EXISTS "Authenticated Update operatives-storage" ON storage.objects;
CREATE POLICY "Authenticated Update operatives-storage" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'operatives-storage');

-- Entwickler- / Testzugriff für anon (Development Sandbox)
DROP POLICY IF EXISTS "Dev Anon operatives-storage" ON storage.objects;
CREATE POLICY "Dev Anon operatives-storage" ON storage.objects
    FOR ALL
    TO anon
    USING (bucket_id = 'operatives-storage')
    WITH CHECK (bucket_id = 'operatives-storage');

-- 4. TABELLEN-ERWEITERUNG: public.invoices
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS paperless_status public.archive_sync_status DEFAULT 'not_applicable',
    ADD COLUMN IF NOT EXISTS paperless_document_id INTEGER,
    ADD COLUMN IF NOT EXISTS paperless_error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_paperless_status ON public.invoices(paperless_status);

-- 5. TABELLEN-ERWEITERUNG: public.rental_bookings
-- ------------------------------------------------------------------------------
ALTER TABLE public.rental_bookings
    ADD COLUMN IF NOT EXISTS contract_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS paperless_error_message TEXT;

-- 6. TABELLE: public.document_generation_logs (PDF-Audit-Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_generation_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type       VARCHAR(50) NOT NULL, -- 'invoice', 'rental_contract', 'receipt', 'sonstige'
    record_id           VARCHAR(100),         -- z. B. 'RE-2026-0042' oder 'MV-2026-0012'
    title               VARCHAR(255) NOT NULL,
    recipient_name      VARCHAR(255),
    storage_bucket      VARCHAR(50) NOT NULL DEFAULT 'operatives-storage',
    storage_path        TEXT NOT NULL,
    file_url            TEXT,
    file_size_bytes     INTEGER,
    generation_engine   VARCHAR(50) DEFAULT 'edge_function_pdf_lib',
    paperless_status    VARCHAR(50) DEFAULT 'not_applicable',
    paperless_document_id INTEGER,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_gen_record_id ON public.document_generation_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_doc_gen_type      ON public.document_generation_logs(document_type);
CREATE INDEX IF NOT EXISTS idx_doc_gen_created   ON public.document_generation_logs(created_at DESC);

COMMENT ON TABLE public.document_generation_logs IS
    'Audit-Log aller serverseitig und clientseitig erzeugten PDFs inkl. Storage-URI und Paperless-Status.';

-- 7. HILFSFUNKTION: Verknüpfung Rechnungs-PDF aktualisieren
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_invoice_pdf(
    p_invoice_id        VARCHAR,
    p_pdf_url           TEXT,
    p_storage_path      TEXT,
    p_file_size         INTEGER DEFAULT NULL,
    p_paperless_status  public.archive_sync_status DEFAULT 'pending',
    p_paperless_id      INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.invoices
    SET
        pdf_url                 = p_pdf_url,
        pdf_storage_path        = p_storage_path,
        paperless_status        = COALESCE(p_paperless_status, paperless_status),
        paperless_document_id   = COALESCE(p_paperless_id, paperless_document_id),
        updated_at              = now()
    WHERE id = p_invoice_id;

    INSERT INTO public.document_generation_logs (
        document_type,
        record_id,
        title,
        storage_bucket,
        storage_path,
        pdf_url,
        file_size_bytes,
        paperless_status,
        paperless_document_id
    ) VALUES (
        'invoice',
        p_invoice_id,
        'Rechnung ' || p_invoice_id,
        'operatives-storage',
        p_storage_path,
        p_pdf_url,
        p_file_size,
        p_paperless_status::text,
        p_paperless_id
    );

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.update_invoice_pdf IS
    'Aktualisiert die PDF-Referenz einer Rechnung und protokolliert die Erstellung im Audit-Log.';

-- 8. HILFSFUNKTION: Verknüpfung Mietvertrags-PDF aktualisieren
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_rental_contract_pdf(
    p_booking_id        VARCHAR,
    p_pdf_url           TEXT,
    p_storage_path      TEXT,
    p_file_size         INTEGER DEFAULT NULL,
    p_paperless_status  public.archive_sync_status DEFAULT 'pending',
    p_paperless_id      INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Unterstützt Suche nach booking_number (z.B. 'MV-2026-0012') oder UUID
    UPDATE public.rental_bookings
    SET
        contract_file_url       = p_pdf_url,
        contract_storage_path   = p_storage_path,
        paperless_status        = COALESCE(p_paperless_status, paperless_status),
        paperless_document_id   = COALESCE(p_paperless_id, paperless_document_id),
        updated_at              = now()
    WHERE booking_number = p_booking_id OR id::text = p_booking_id;

    INSERT INTO public.document_generation_logs (
        document_type,
        record_id,
        title,
        storage_bucket,
        storage_path,
        pdf_url,
        file_size_bytes,
        paperless_status,
        paperless_document_id
    ) VALUES (
        'rental_contract',
        p_booking_id,
        'Mietvertrag ' || p_booking_id,
        'operatives-storage',
        p_storage_path,
        p_pdf_url,
        p_file_size,
        p_paperless_status::text,
        p_paperless_id
    );

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.update_rental_contract_pdf IS
    'Aktualisiert die Mietvertrags-Referenz einer Buchung und protokolliert die Erstellung im Audit-Log.';

-- 9. RLS & RECHTE
-- ------------------------------------------------------------------------------
ALTER TABLE public.document_generation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_gen_logs_authenticated ON public.document_generation_logs;
CREATE POLICY doc_gen_logs_authenticated ON public.document_generation_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS doc_gen_logs_dev_anon ON public.document_generation_logs;
CREATE POLICY doc_gen_logs_dev_anon ON public.document_generation_logs
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.document_generation_logs TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_pdf(VARCHAR, TEXT, TEXT, INTEGER, public.archive_sync_status, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_rental_contract_pdf(VARCHAR, TEXT, TEXT, INTEGER, public.archive_sync_status, INTEGER) TO authenticated, anon;
