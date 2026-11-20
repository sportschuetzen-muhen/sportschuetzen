-- ==============================================================================
-- 121_jm_ranglisten_storage.sql
-- Migration: Zentraler & geschützter Ranglisten-Speicher (Konto 1301 & JM)
-- Features:
--   1. Privater Storage-Bucket 'jm-ranglisten' (Zugriff von aussen nur via
--      kryptografisch signiertem Link mit 180 Tagen Ablaufdatum).
--   2. Spalte 'ranglisten_files' (JSONB) auf public.group_competitions.
--   3. Tabelle 'public.jm_competition_files' zur Speicherung von Ranglisten
--      bereits beim ersten Auswärts-Import in der Jahresmeisterschaft.
-- ==============================================================================

-- 1. PRIVATER SUPABASE STORAGE BUCKET: jm-ranglisten (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'jm-ranglisten',
    'jm-ranglisten',
    false,
    52428800, -- 50 MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS Policies für Cockpit-Zugriff und Signierung (createSignedUrl)
DROP POLICY IF EXISTS "JM Ranglisten Authenticated All" ON storage.objects;
CREATE POLICY "JM Ranglisten Authenticated All" ON storage.objects
    FOR ALL
    TO authenticated
    USING (bucket_id = 'jm-ranglisten')
    WITH CHECK (bucket_id = 'jm-ranglisten');

DROP POLICY IF EXISTS "JM Ranglisten Cockpit Anon All" ON storage.objects;
CREATE POLICY "JM Ranglisten Cockpit Anon All" ON storage.objects
    FOR ALL
    TO anon
    USING (bucket_id = 'jm-ranglisten')
    WITH CHECK (bucket_id = 'jm-ranglisten');

-- 2. ERWEITERUNG public.group_competitions
ALTER TABLE public.group_competitions
    ADD COLUMN IF NOT EXISTS ranglisten_files JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.group_competitions.ranglisten_files IS
    'Array von gespeicherten Ranglisten-Dokumenten [{ title, filename, storage_bucket, storage_path, size_kb, uploaded_at }] für 180-Tage-Signatur-Links beim Jahresbeitrag.';

-- 3. TABELLE public.jm_competition_files (Anlass-basierter Ranglisten-Speicher)
CREATE TABLE IF NOT EXISTS public.jm_competition_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jahr INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    anlass_name VARCHAR(150) NOT NULL,
    files JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_jm_comp_files_jahr_anlass UNIQUE (jahr, anlass_name)
);

CREATE INDEX IF NOT EXISTS idx_jm_comp_files_jahr ON public.jm_competition_files(jahr);

COMMENT ON TABLE public.jm_competition_files IS
    'Speichert hochgeladene Auswärts-Ranglisten (Einzel & Gruppe) pro Saison und Anlass, damit sie sowohl in der Jahresmeisterschaft als auch bei den Gruppengewinnen (1301) automatisch bereitstehen.';

ALTER TABLE public.jm_competition_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jm_comp_files_select" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_insert" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_update" ON public.jm_competition_files;
DROP POLICY IF EXISTS "jm_comp_files_delete" ON public.jm_competition_files;

CREATE POLICY "jm_comp_files_select"
    ON public.jm_competition_files FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "jm_comp_files_insert"
    ON public.jm_competition_files FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

CREATE POLICY "jm_comp_files_update"
    ON public.jm_competition_files FOR UPDATE
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "jm_comp_files_delete"
    ON public.jm_competition_files FOR DELETE
    TO authenticated, anon
    USING (true);

GRANT ALL ON public.jm_competition_files TO authenticated;
GRANT ALL ON public.jm_competition_files TO anon;
