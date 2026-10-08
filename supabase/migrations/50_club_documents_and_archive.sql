-- ==============================================================================
-- MIGRATION 50: VEREINS-DOKUMENTE & PDF-ARCHIV (Supabase Single Source of Truth)
-- Erstellt die zentrale Tabelle public.documents für das Vereinsarchiv,
-- integriert RLS-Schutz (public vs members vs vorstand) und registriert den Bucket.
-- ==============================================================================

-- 1. TABELLE: public.documents
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'statuten', 'reglement', 'anleitung', 'gv', 'protokoll', 'finanzen'
    visibility VARCHAR(20) NOT NULL DEFAULT 'members', -- 'public', 'members', 'vorstand'
    file_url TEXT NOT NULL,
    file_size_kb INTEGER DEFAULT 0,
    file_type VARCHAR(20) DEFAULT 'pdf',
    year INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexe für schnelle Filterung nach Sichtbarkeit und Kategorie
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON public.documents(visibility);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_year ON public.documents(year DESC);

-- 2. ROW-LEVEL SECURITY (RLS)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view public documents" ON public.documents;
CREATE POLICY "Public can view public documents"
    ON public.documents
    FOR SELECT
    TO anon, authenticated
    USING (visibility = 'public');

DROP POLICY IF EXISTS "Members can view member documents" ON public.documents;
CREATE POLICY "Members can view member documents"
    ON public.documents
    FOR SELECT
    TO authenticated
    USING (
        visibility IN ('public', 'members') 
        OR (SELECT public.rbac_allows(ARRAY['dokumente.view', 'dokumente.manage', 'vorstand.view']))
    );

DROP POLICY IF EXISTS "Vorstand can view all documents" ON public.documents;
CREATE POLICY "Vorstand can view all documents"
    ON public.documents
    FOR SELECT
    TO authenticated
    USING (
        (SELECT public.rbac_allows(ARRAY['dokumente.view', 'dokumente.manage', 'vorstand.view', 'admin']))
    );

DROP POLICY IF EXISTS "Admins and managers can modify documents" ON public.documents;
CREATE POLICY "Admins and managers can modify documents"
    ON public.documents
    FOR ALL
    TO authenticated
    USING (
        (SELECT public.rbac_allows(ARRAY['dokumente.manage', 'admin']))
    )
    WITH CHECK (
        (SELECT public.rbac_allows(ARRAY['dokumente.manage', 'admin']))
    );

-- Dev / Anon Schreibzugriff für Migration & Initial-Seed
DROP POLICY IF EXISTS "Dev Anon documents write" ON public.documents;
CREATE POLICY "Dev Anon documents write"
    ON public.documents
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- 3. STORAGE BUCKET: operatives-storage & club-documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'club-documents',
    'club-documents',
    true,
    52428800, -- 50 MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4. INITIALER DATEN-SEED FÜR STANDARD-DOKUMENTE
INSERT INTO public.documents (title, description, category, visibility, file_url, file_size_kb, file_type, year, sort_order)
VALUES 
    (
        'Vereinsstatuten Sportschützen Muhen',
        'Offizielle Vereinsstatuten der Sportschützen Muhen gemäss Beschluss der Generalversammlung.',
        'statuten',
        'members',
        'https://supabase-muhen.danfamily.uk/storage/v1/object/public/operatives-storage/documents/statuten_sportschuetzen_muhen.pdf',
        245,
        'pdf',
        2024,
        10
    ),
    (
        'Schiessordnung & Sicherheitsreglement',
        'Sicherheits- und Schiessvorschriften für die Schiessanlagen 50m und 10m sowie Schiessbetriebsregeln.',
        'reglement',
        'members',
        'https://supabase-muhen.danfamily.uk/storage/v1/object/public/operatives-storage/documents/schiessordnung_und_sicherheit.pdf',
        180,
        'pdf',
        2024,
        20
    ),
    (
        'Schützenhausordnung & Benützung',
        'Hausordnung und Benützungsrichtlinien für das Schützenhaus und die Schützenstube Rüteli.',
        'reglement',
        'public',
        'https://supabase-muhen.danfamily.uk/storage/v1/object/public/operatives-storage/documents/schuetzenhausordnung.pdf',
        165,
        'pdf',
        2025,
        30
    ),
    (
        'Merkblatt für Mieter & Übergabe-Checkliste',
        'Interaktive Checkliste für die besenreine Übergabe, Notfallkontakte und Verhaltensregeln.',
        'anleitung',
        'public',
        'merkblatt_mieter.html',
        120,
        'html',
        2026,
        40
    ),
    (
        'Standblatt-Upload Leitfaden (PWA)',
        'Schritt-für-Schritt Anleitung zur digitalen Erfassung und zum Upload von Standblättern in der Web-App.',
        'anleitung',
        'members',
        'https://supabase-muhen.danfamily.uk/storage/v1/object/public/operatives-storage/documents/anleitung_standblatt_upload.pdf',
        310,
        'pdf',
        2025,
        50
    ),
    (
        'Munitionsbestellung & Konditionen',
        'Subventionierte Vereinsmunition, Preise, Munitionsausgabe und Bestellfristen für Aktivmitglieder.',
        'reglement',
        'members',
        'https://supabase-muhen.danfamily.uk/storage/v1/object/public/operatives-storage/documents/munitionsbestellung_konditionen.pdf',
        140,
        'pdf',
        2026,
        60
    ),
    (
        'Spesen- und Entschädigungsreglement',
        'Entschädigungsansätze für Vorstandsmitglieder, Leiter und Richter an Schiessanlässen und Meisterschaften.',
        'finanzen',
        'members',
        'https://supabase-muhen.danfamily.uk/storage/v1/object/public/operatives-storage/documents/spesenreglement.pdf',
        195,
        'pdf',
        2024,
        70
    ),
    (
        'Protokoll Vorstandssitzung',
        'Interne Beschlüsse, Pendenzen und Traktanden der Vorstandssitzung.',
        'protokoll',
        'vorstand',
        'docs/2018-06-25%20Protokoll%20Vorstandssitzung%20Sportsch%C3%BCtzen%20Muhen.pdf',
        340,
        'pdf',
        2026,
        80
    )
ON CONFLICT DO NOTHING;
