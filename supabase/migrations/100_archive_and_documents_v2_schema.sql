-- ==============================================================================
-- MIGRATION 100: VEREINS-ARCHIV & DOKUMENTEN-MANAGEMENT V2 (KOMPLETT-ARCHITEKTUR)
-- 1. Erweitert public.documents um subcategory, document_date, storage_path,
--    source_path, original_filename, ocr_method, page_count
-- 2. Verbessert den gewichteten deutschen Volltext-Trigger (Titel A, Meta B, Text C)
-- 3. Harmonisiert bestehende 281 Dokumente (05_berichte -> category 'berichte',
--    extrahiert document_date und storage_path)
-- 4. Öffnet Storage Bucket 'club-documents' für alle Archiv-Formate (Excel, PPTX,
--    MSG, ODT, PDF, Word etc.) bis 100 MB und entfernt leeren Dummy-Bucket
-- 5. Schliesst RLS-Lücke auf public.document_chunks und aktualisiert RPC-Suche
--    inkl. direktem file_url-Rückgabewert (eliminiert GAS getPdfLink)
-- ==============================================================================

-- 1. SCHEMA-ERWEITERUNG: public.documents
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100),
    ADD COLUMN IF NOT EXISTS document_date DATE,
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS source_path TEXT,
    ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
    ADD COLUMN IF NOT EXISTS ocr_method VARCHAR(50) DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_documents_subcategory ON public.documents(subcategory);
CREATE INDEX IF NOT EXISTS idx_documents_document_date ON public.documents(document_date DESC);
DROP INDEX IF EXISTS idx_documents_source_path_unique;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS uq_documents_source_path;
ALTER TABLE public.documents ADD CONSTRAINT uq_documents_source_path UNIQUE (source_path);

-- 2. GEWICHTETER DEUTSCHER VOLLTEXT-INDEX (Titel = A, Metadaten = B, Volltext = C)
CREATE OR REPLACE FUNCTION public.documents_update_tsv()
RETURNS trigger AS $$
BEGIN
    NEW.tsv_content :=
        setweight(to_tsvector('german', coalesce(NEW.title, '') || ' ' || coalesce(NEW.original_filename, '')), 'A') ||
        setweight(to_tsvector('german', coalesce(NEW.description, '') || ' ' || coalesce(NEW.category, '') || ' ' || coalesce(NEW.subcategory, '') || ' ' || coalesce(NEW.year::text, '')), 'B') ||
        setweight(to_tsvector('german', coalesce(NEW.content_text, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_update_tsv ON public.documents;
CREATE TRIGGER trg_documents_update_tsv
    BEFORE INSERT OR UPDATE OF title, original_filename, description, category, subcategory, year, content_text
    ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.documents_update_tsv();

-- 3. HARMONISIERUNG DER BESTEHENDEN 281 DOKUMENTE AUS DEM ERSTEN DRIVE-TRANSFER
-- 3a. Subcategory und storage_path aus file_url ableiten
UPDATE public.documents
SET 
    storage_path = regexp_replace(file_url, '^.*/storage/v1/object/public/club-documents/', ''),
    subcategory = CASE
        WHEN file_url LIKE '%/01_protokolle/%' THEN '01_protokolle'
        WHEN file_url LIKE '%/02_einladungen/%' THEN '02_einladungen'
        WHEN file_url LIKE '%/05_berichte/%'    THEN '05_berichte'
        WHEN file_url LIKE '%/30_chroniken/%'   THEN '30_chroniken'
        ELSE subcategory
    END
WHERE file_url LIKE '%/club-documents/%';

-- 3b. Jahresberichte (05_berichte) als eigene Hauptkategorie 'berichte' führen
UPDATE public.documents
SET 
    category = 'berichte',
    description = regexp_replace(description, '^Generalversammlung:', 'Jahresbericht:'),
    updated_at = now()
WHERE subcategory = '05_berichte' AND category = 'gv';

UPDATE public.document_chunks c
SET category = d.category
FROM public.documents d
WHERE c.document_id = d.id AND c.category <> d.category;

-- 3c. Exaktes Datum (YYYY-MM-DD) aus Titel/URL in document_date extrahieren (wo gültig)
DO $$
DECLARE
    rec RECORD;
    m TEXT[];
    yr INT;
    mo INT;
    dy INT;
BEGIN
    FOR rec IN SELECT id, title, file_url, year FROM public.documents WHERE document_date IS NULL LOOP
        m := regexp_match(rec.title || ' ' || rec.file_url, '(19[0-9]{2}|20[0-9]{2})-([0-1][0-9])-([0-3][0-9])');
        IF m IS NOT NULL THEN
            yr := m[1]::INT;
            mo := m[2]::INT;
            dy := m[3]::INT;
            IF mo BETWEEN 1 AND 12 AND dy BETWEEN 1 AND 31 THEN
                BEGIN
                    UPDATE public.documents 
                    SET document_date = make_date(yr, mo, dy)
                    WHERE id = rec.id;
                EXCEPTION WHEN OTHERS THEN
                    -- Ungültiges Kalenderdatum (z.B. 30.02.), Fallback auf 01.01.
                    IF rec.year IS NOT NULL THEN
                        UPDATE public.documents SET document_date = make_date(rec.year, 1, 1) WHERE id = rec.id;
                    END IF;
                END;
            ELSIF rec.year IS NOT NULL THEN
                UPDATE public.documents SET document_date = make_date(rec.year, 1, 1) WHERE id = rec.id;
            END IF;
        ELSIF rec.year IS NOT NULL AND rec.year BETWEEN 1900 AND 2100 THEN
            UPDATE public.documents SET document_date = make_date(rec.year, 1, 1) WHERE id = rec.id;
        END IF;
    END LOOP;
END;
$$;

-- 3d. OCR-Methode für bereits transkribierte Dokumente markieren
UPDATE public.documents
SET ocr_method = CASE 
    WHEN year = 1919 THEN 'vision_ocr'
    ELSE 'digital_pdf'
END
WHERE transcription_status = 'completed' AND (ocr_method IS NULL OR ocr_method = 'none');

-- 3e. Volltext-Vektoren mit neuer Gewichtung neu aufbauen
UPDATE public.documents SET updated_at = now();


-- 4. STORAGE BUCKET KONFIGURATION (Alle Archiv-Formate bis 100 MB erlauben)
UPDATE storage.buckets
SET 
    file_size_limit = 104857600, -- 100 MB
    allowed_mime_types = NULL    -- Erlaubt PDF, DOC, DOCX, XLS, XLSX, XLSM, PPTX, MSG, ODT, ODS, RTF, CSV, ZIP etc.
WHERE id = 'club-documents';

-- Storage RLS Policies für club-documents sicherstellen
DROP POLICY IF EXISTS "Public read access for club-documents" ON storage.objects;
CREATE POLICY "Public read access for club-documents"
    ON storage.objects FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'club-documents');

DROP POLICY IF EXISTS "Manage access for club-documents" ON storage.objects;
CREATE POLICY "Manage access for club-documents"
    ON storage.objects FOR ALL
    TO anon, authenticated
    USING (bucket_id = 'club-documents')
    WITH CHECK (bucket_id = 'club-documents');


-- 5. RLS-SCHUTZ AUF public.documents & public.document_chunks (inkl. archiv.view / archiv.manage)
DROP POLICY IF EXISTS "Members can view member documents" ON public.documents;
CREATE POLICY "Members can view member documents"
    ON public.documents FOR SELECT
    TO authenticated
    USING (
        visibility IN ('public', 'members')
        OR (SELECT public.rbac_allows(ARRAY['archiv.view', 'archiv.manage', 'dokumente.view', 'dokumente.manage', 'vorstand.view', 'admin']))
    );

DROP POLICY IF EXISTS "Vorstand can view all documents" ON public.documents;
CREATE POLICY "Vorstand can view all documents"
    ON public.documents FOR SELECT
    TO authenticated
    USING (
        (SELECT public.rbac_allows(ARRAY['archiv.view', 'archiv.manage', 'dokumente.view', 'dokumente.manage', 'vorstand.view', 'admin']))
    );

DROP POLICY IF EXISTS "Admins and managers can modify documents" ON public.documents;
CREATE POLICY "Admins and managers can modify documents"
    ON public.documents FOR ALL
    TO authenticated
    USING (
        (SELECT public.rbac_allows(ARRAY['archiv.manage', 'dokumente.manage', 'admin']))
    )
    WITH CHECK (
        (SELECT public.rbac_allows(ARRAY['archiv.manage', 'dokumente.manage', 'admin']))
    );

DROP POLICY IF EXISTS "Admins can manage chunks" ON public.document_chunks;
CREATE POLICY "Admins can manage chunks"
    ON public.document_chunks FOR ALL
    TO authenticated
    USING (
        (SELECT public.rbac_allows(ARRAY['archiv.manage', 'dokumente.manage', 'admin']))
    )
    WITH CHECK (
        (SELECT public.rbac_allows(ARRAY['archiv.manage', 'dokumente.manage', 'admin']))
    );

DROP POLICY IF EXISTS "Members can view chunks" ON public.document_chunks;
CREATE POLICY "Members can view chunks"
    ON public.document_chunks FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_chunks.document_id
              AND (
                  d.visibility IN ('public', 'members')
                  OR (SELECT public.rbac_allows(ARRAY['dokumente.view', 'dokumente.manage', 'archiv.view', 'archiv.manage', 'vorstand.view', 'admin']))
              )
        )
        OR document_id IS NULL
    );

-- Erweiterte Volltext-/Hybrid-Suche mit direkter Rückgabe von file_url, visibility, year & subcategory
DROP FUNCTION IF EXISTS public.search_archive_fulltext(TEXT, VARCHAR, INT);
DROP FUNCTION IF EXISTS public.search_archive_fulltext(TEXT, VARCHAR, INT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.search_archive_fulltext(
    p_query TEXT,
    p_category VARCHAR DEFAULT NULL,
    p_limit INT DEFAULT 8,
    p_include_vorstand BOOLEAN DEFAULT true
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    document_name VARCHAR,
    protocol_date DATE,
    year INT,
    category VARCHAR,
    subcategory VARCHAR,
    visibility VARCHAR,
    file_url TEXT,
    file_type VARCHAR,
    content TEXT,
    rank FLOAT
) AS $$
DECLARE
    v_and_query tsquery;
    v_or_query tsquery;
    v_clean_query TEXT;
    v_plain_text TEXT;
BEGIN
    v_clean_query := trim(coalesce(p_query, ''));
    IF v_clean_query = '' THEN
        RETURN;
    END IF;

    BEGIN
        v_and_query := plainto_tsquery('german', v_clean_query);
        v_plain_text := v_and_query::TEXT;
        IF v_plain_text <> '' THEN
            v_or_query := replace(v_plain_text, ' & ', ' | ')::tsquery;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_and_query := NULL;
        v_or_query := NULL;
    END;

    RETURN QUERY
    WITH ranked_matches AS (
        SELECT 
            c.id,
            c.document_id,
            coalesce(d.title, c.document_name)::VARCHAR AS document_name,
            coalesce(d.document_date, c.protocol_date) AS protocol_date,
            d.year,
            coalesce(d.category, c.category)::VARCHAR AS category,
            d.subcategory::VARCHAR AS subcategory,
            coalesce(d.visibility, 'members')::VARCHAR AS visibility,
            d.file_url,
            d.file_type::VARCHAR AS file_type,
            c.content,
            (
                -- Bonus wenn ALLE Begriffe im Abschnitt vorkommen
                CASE WHEN v_and_query IS NOT NULL AND v_and_query::TEXT <> '' AND c.tsv_content @@ v_and_query 
                     THEN ts_rank_cd(c.tsv_content, v_and_query) * 3.0 + 0.5
                     ELSE 0.0
                END +
                -- Flexibles Ranking über ODER-Verknüpfung (ideal für natürliche Fragen im KI-Chat)
                CASE WHEN v_or_query IS NOT NULL AND c.tsv_content @@ v_or_query 
                     THEN ts_rank(c.tsv_content, v_or_query) * 2.0
                     ELSE 0.0
                END +
                CASE WHEN v_or_query IS NOT NULL AND d.tsv_content @@ v_or_query
                     THEN ts_rank(d.tsv_content, v_or_query) * 1.5
                     ELSE 0.0
                END +
                CASE WHEN d.title ILIKE '%' || v_clean_query || '%'
                     THEN 1.2
                     ELSE 0.0
                END +
                CASE WHEN c.content ILIKE '%' || v_clean_query || '%'
                     THEN 0.8
                     ELSE 0.0
                END
            )::FLOAT AS calc_rank
        FROM public.document_chunks c
        LEFT JOIN public.documents d ON d.id = c.document_id
        WHERE 
            (p_category IS NULL OR p_category = '' OR p_category = 'all' OR d.category = p_category OR c.category = p_category)
            AND (p_include_vorstand = true OR coalesce(d.visibility, 'members') IN ('public', 'members'))
            AND (
                (v_or_query IS NOT NULL AND (c.tsv_content @@ v_or_query OR d.tsv_content @@ v_or_query))
                OR d.title ILIKE '%' || v_clean_query || '%'
                OR c.content ILIKE '%' || v_clean_query || '%'
            )
    ),
    diversified AS (
        SELECT 
            rm.*,
            ROW_NUMBER() OVER (
                PARTITION BY coalesce(rm.document_id::TEXT, rm.document_name)
                ORDER BY rm.calc_rank DESC
            ) AS doc_chunk_rn
        FROM ranked_matches rm
        WHERE rm.calc_rank > 0
    )
    SELECT 
        dv.id,
        dv.document_id,
        dv.document_name,
        dv.protocol_date,
        dv.year,
        dv.category,
        dv.subcategory,
        dv.visibility,
        dv.file_url,
        dv.file_type,
        dv.content,
        dv.calc_rank AS rank
    FROM diversified dv
    WHERE dv.doc_chunk_rn <= 2
    ORDER BY dv.calc_rank DESC, dv.year DESC NULLS LAST, dv.protocol_date DESC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

NOTIFY pgrst, 'reload schema';
