-- ==============================================================================
-- MIGRATION 61: ARCHIV-VOLLTEXT, CHUNKS & DYNAMISCHE KI-KONFIGURATION
-- 1. Erweitert public.documents um Volltext (content_text) und tsvector
-- 2. Erstellt public.system_app_configs für variable KI-Modelle & Endpunkte
-- 3. Erstellt public.document_chunks für RAG-Abschnitte (Volltext + optional pgvector)
-- 4. Richtet RLS & RPC-Suchfunktionen ein
-- ==============================================================================

-- 1. ERWEITERUNG DER TABELLE public.documents
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS content_text TEXT,
    ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(30) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS tsv_content tsvector;

-- Funktion und Trigger zur automatischen Aktualisierung des tsvector-Suchindex
CREATE OR REPLACE FUNCTION public.documents_update_tsv()
RETURNS trigger AS $$
BEGIN
    NEW.tsv_content := to_tsvector(
        'german', 
        coalesce(NEW.title, '') || ' ' || 
        coalesce(NEW.description, '') || ' ' || 
        coalesce(NEW.year::text, '') || ' ' || 
        coalesce(NEW.content_text, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_update_tsv ON public.documents;
CREATE TRIGGER trg_documents_update_tsv
    BEFORE INSERT OR UPDATE OF title, description, year, content_text
    ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.documents_update_tsv();

-- Bestehende Einträge initial indizieren
UPDATE public.documents
SET tsv_content = to_tsvector(
    'german', 
    coalesce(title, '') || ' ' || 
    coalesce(description, '') || ' ' || 
    coalesce(year::text, '') || ' ' || 
    coalesce(content_text, '')
)
WHERE tsv_content IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_tsv ON public.documents USING gin(tsv_content);
CREATE INDEX IF NOT EXISTS idx_documents_transcription_status ON public.documents(transcription_status);


-- 2. TABELLE FÜR DYNAMISCHE SYSTEM- & KI-KONFIGURATION (public.system_app_configs)
CREATE TABLE IF NOT EXISTS public.system_app_configs (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100) NOT NULL UNIQUE,
    value       TEXT         NOT NULL DEFAULT '',
    description VARCHAR(255) DEFAULT '',
    category    VARCHAR(50)  DEFAULT 'allgemein',
    updated_at  TIMESTAMPTZ  DEFAULT now()
);

-- Initiale Konfiguration für KI-Archiv-Assistenten
INSERT INTO public.system_app_configs (key, value, description, category)
VALUES
    ('archiv_ai_model', 'qwen/qwen3.8-27b', 'Aktives LLM-Modell für den Vereins-Archiv-Assistenten (z.B. qwen/qwen3.8-27b, llama-3.3-70b-versatile)', 'archiv'),
    ('archiv_ai_endpoint', 'https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions', 'API-Endpunkt des Groq-LLM-Proxys', 'archiv'),
    ('archiv_ai_token', '', 'Authentifizierungs-Token für den KI-Proxy', 'archiv')
ON CONFLICT (key) DO UPDATE SET
    description = EXCLUDED.description,
    updated_at = now();

ALTER TABLE public.system_app_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read system app configs" ON public.system_app_configs;
CREATE POLICY "Anyone can read system app configs"
    ON public.system_app_configs FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage system app configs" ON public.system_app_configs;
CREATE POLICY "Admins can manage system app configs"
    ON public.system_app_configs FOR ALL
    TO authenticated
    USING (
        (SELECT public.rbac_allows(ARRAY['dokumente.manage', 'vorstand.manage', 'admin']))
    )
    WITH CHECK (
        (SELECT public.rbac_allows(ARRAY['dokumente.manage', 'vorstand.manage', 'admin']))
    );

DROP POLICY IF EXISTS "Dev anon manage app configs" ON public.system_app_configs;
CREATE POLICY "Dev anon manage app configs"
    ON public.system_app_configs FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);


-- 3. TABELLE FÜR DOKUMENTEN-CHUNKS (public.document_chunks)
-- Erweiterung pgvector aktivieren, falls verfügbar
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pgvector Extension nicht verfügbar oder bereits aktiviert.';
END;
$$;

CREATE TABLE IF NOT EXISTS public.document_chunks (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    UUID         REFERENCES public.documents(id) ON DELETE CASCADE,
    document_name  VARCHAR(255) NOT NULL,
    category       VARCHAR(50)  NOT NULL DEFAULT 'gv',
    protocol_date  DATE,
    chunk_index    INTEGER      NOT NULL DEFAULT 0,
    page_number    INTEGER      DEFAULT 1,
    content        TEXT         NOT NULL,
    tsv_content    tsvector,
    created_at     TIMESTAMPTZ  DEFAULT now()
);

-- Optional Embedding Spalte hinzufügen, falls pgvector aktiv
DO $$
BEGIN
    ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Spalte embedding konnte nicht hinzugefügt werden (pgvector evtl. nicht installiert).';
END;
$$;

-- Trigger für tsvector auf Chunks
CREATE OR REPLACE FUNCTION public.document_chunks_update_tsv()
RETURNS trigger AS $$
BEGIN
    NEW.tsv_content := to_tsvector(
        'german', 
        coalesce(NEW.document_name, '') || ' ' || 
        coalesce(NEW.content, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_chunks_update_tsv ON public.document_chunks;
CREATE TRIGGER trg_document_chunks_update_tsv
    BEFORE INSERT OR UPDATE OF document_name, content
    ON public.document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION public.document_chunks_update_tsv();

CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_tsv ON public.document_chunks USING gin(tsv_content);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_date ON public.document_chunks(protocol_date DESC);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view chunks" ON public.document_chunks;
CREATE POLICY "Members can view chunks"
    ON public.document_chunks FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage chunks" ON public.document_chunks;
CREATE POLICY "Admins can manage chunks"
    ON public.document_chunks FOR ALL
    TO authenticated
    USING (
        (SELECT public.rbac_allows(ARRAY['dokumente.manage', 'admin']))
    )
    WITH CHECK (
        (SELECT public.rbac_allows(ARRAY['dokumente.manage', 'admin']))
    );

DROP POLICY IF EXISTS "Dev anon manage chunks" ON public.document_chunks;
CREATE POLICY "Dev anon manage chunks"
    ON public.document_chunks FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);


-- 4. RPC-SUCHFUNKTION: Volltext-Suche in Chunks & Dokumenten
CREATE OR REPLACE FUNCTION public.search_archive_fulltext(
    p_query TEXT,
    p_category VARCHAR DEFAULT NULL,
    p_limit INT DEFAULT 6
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    document_name VARCHAR,
    protocol_date DATE,
    category VARCHAR,
    content TEXT,
    rank FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.document_id,
        c.document_name,
        c.protocol_date,
        c.category,
        c.content,
        ts_rank(c.tsv_content, plainto_tsquery('german', p_query))::FLOAT AS rank
    FROM public.document_chunks c
    WHERE 
        (p_category IS NULL OR c.category = p_category)
        AND c.tsv_content @@ plainto_tsquery('german', p_query)
    ORDER BY rank DESC, c.protocol_date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
