-- ==============================================================================
-- 28_communication_campaigns_and_attachments.sql
-- Migration: Phase 28 - Kommunikations-Kampagnen & GV-Dossier-Compiler (Attachments)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. STORAGE BUCKET: campaign-assets (für Berichte, Protokolle & fertige Dossiers)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'campaign-assets',
    'campaign-assets',
    true,
    52428800, -- 50 MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS-Policies für campaign-assets
DROP POLICY IF EXISTS "Public Read campaign-assets" ON storage.objects;
CREATE POLICY "Public Read campaign-assets" ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'campaign-assets');

DROP POLICY IF EXISTS "Authenticated Insert campaign-assets" ON storage.objects;
CREATE POLICY "Authenticated Insert campaign-assets" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'campaign-assets');

DROP POLICY IF EXISTS "Anon Insert campaign-assets" ON storage.objects;
CREATE POLICY "Anon Insert campaign-assets" ON storage.objects
    FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'campaign-assets');

DROP POLICY IF EXISTS "Authenticated Update campaign-assets" ON storage.objects;
CREATE POLICY "Authenticated Update campaign-assets" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'campaign-assets');

DROP POLICY IF EXISTS "Anon Update campaign-assets" ON storage.objects;
CREATE POLICY "Anon Update campaign-assets" ON storage.objects
    FOR UPDATE
    TO anon
    USING (bucket_id = 'campaign-assets');

-- ------------------------------------------------------------------------------
-- 2. TABELLE: public.communication_campaigns (Master-Aussendungen & GV-Kampagnen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code VARCHAR(50) REFERENCES public.document_templates(code) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,                        -- z.B. '100. Generalversammlung 2026'
    campaign_type VARCHAR(50) NOT NULL DEFAULT 'gv',    -- 'gv', 'rechnung', 'brief', 'endschiessen', 'sonstige'
    season_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    status VARCHAR(50) NOT NULL DEFAULT 'draft',        -- 'draft', 'ready', 'processing', 'completed', 'cancelled'
    send_mode VARCHAR(50) NOT NULL DEFAULT 'email_and_print', -- 'email_and_print', 'email_only', 'print_only'
    email_subject VARCHAR(255),
    email_body TEXT,
    dossier_pdf_url TEXT,                               -- Link zum fertig assemblierten Gesamt-PDF
    dossier_storage_path TEXT,                          -- Pfad in 'campaign-assets' oder 'operatives-storage'
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    custom_settings JSONB NOT NULL DEFAULT '{}'::jsonb, -- Traktanden-Overrides, Kalender-Filter etc.
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_campaign_status CHECK (
        status IN ('draft', 'ready', 'processing', 'completed', 'cancelled')
    ),
    CONSTRAINT chk_campaign_type CHECK (
        campaign_type IN ('gv', 'rechnung', 'brief', 'endschiessen', 'sonstige')
    )
);

CREATE INDEX IF NOT EXISTS idx_comm_campaigns_year ON public.communication_campaigns(season_year);
CREATE INDEX IF NOT EXISTS idx_comm_campaigns_type ON public.communication_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_comm_campaigns_status ON public.communication_campaigns(status);

-- ------------------------------------------------------------------------------
-- 3. TABELLE: public.campaign_attachments (Beilagen & Dossier-Compiler)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.communication_campaigns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,                        -- z.B. 'Jahresbericht Präsident', 'Protokoll 99. GV'
    attachment_type VARCHAR(50) NOT NULL DEFAULT 'pdf_upload', -- 'dynamisch_einladung', 'dynamisch_programm', 'pdf_upload'
    sort_order INTEGER NOT NULL DEFAULT 1,              -- Reihenfolge im kompilieren Heft
    storage_path TEXT,                                  -- Pfad im Supabase Storage Bucket
    file_url TEXT,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 1,
    is_mandatory BOOLEAN NOT NULL DEFAULT false,        -- Pflicht-Beilage für Fertigstellung
    status VARCHAR(50) NOT NULL DEFAULT 'pending',      -- 'pending', 'uploaded', 'compiled', 'error'
    error_message TEXT,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_attachment_status CHECK (
        status IN ('pending', 'uploaded', 'compiled', 'error')
    )
);

CREATE INDEX IF NOT EXISTS idx_camp_attachments_cid ON public.campaign_attachments(campaign_id, sort_order);

-- ------------------------------------------------------------------------------
-- 4. TABELLE: public.campaign_recipients (Empfänger-Protokoll & Zustellstatus)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.communication_campaigns(id) ON DELETE CASCADE,
    person_number INTEGER REFERENCES public.members(person_number) ON DELETE SET NULL,
    recipient_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    recipient_address JSONB,                            -- Snapshot von { strasse, plz, ort, land }
    delivery_channel VARCHAR(50) NOT NULL DEFAULT 'email', -- 'email', 'post', 'both'
    status VARCHAR(50) NOT NULL DEFAULT 'pending',      -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
    pdf_storage_path TEXT,                              -- Pfad zum individuellen Dokument
    pdf_url TEXT,
    mail_log_id UUID REFERENCES public.mail_logs(id) ON DELETE SET NULL,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_campaign_recipient UNIQUE (campaign_id, person_number),
    CONSTRAINT chk_recipient_status CHECK (
        status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')
    )
);

CREATE INDEX IF NOT EXISTS idx_camp_recipients_cid ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_camp_recipients_pn ON public.campaign_recipients(person_number);
CREATE INDEX IF NOT EXISTS idx_camp_recipients_status ON public.campaign_recipients(campaign_id, status);

-- ------------------------------------------------------------------------------
-- 5. TRIGGER: updated_at Automatismus
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_campaigns_updated_at ON public.communication_campaigns;
CREATE TRIGGER set_campaigns_updated_at
    BEFORE UPDATE ON public.communication_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_set_updated_at();

DROP TRIGGER IF EXISTS set_attachments_updated_at ON public.campaign_attachments;
CREATE TRIGGER set_attachments_updated_at
    BEFORE UPDATE ON public.campaign_attachments
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) & BERECHTIGUNGEN
-- ------------------------------------------------------------------------------
ALTER TABLE public.communication_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Leseberechtigungen
DROP POLICY IF EXISTS campaigns_read_auth ON public.communication_campaigns;
CREATE POLICY campaigns_read_auth ON public.communication_campaigns FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS campaigns_read_anon ON public.communication_campaigns;
CREATE POLICY campaigns_read_anon ON public.communication_campaigns FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS attachments_read_auth ON public.campaign_attachments;
CREATE POLICY attachments_read_auth ON public.campaign_attachments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS attachments_read_anon ON public.campaign_attachments;
CREATE POLICY attachments_read_anon ON public.campaign_attachments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS recipients_read_auth ON public.campaign_recipients;
CREATE POLICY recipients_read_auth ON public.campaign_recipients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS recipients_read_anon ON public.campaign_recipients;
CREATE POLICY recipients_read_anon ON public.campaign_recipients FOR SELECT TO anon USING (true);

-- Schreibberechtigungen
DROP POLICY IF EXISTS campaigns_write_auth ON public.communication_campaigns;
CREATE POLICY campaigns_write_auth ON public.communication_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS campaigns_write_anon ON public.communication_campaigns;
CREATE POLICY campaigns_write_anon ON public.communication_campaigns FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS attachments_write_auth ON public.campaign_attachments;
CREATE POLICY attachments_write_auth ON public.campaign_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS attachments_write_anon ON public.campaign_attachments;
CREATE POLICY attachments_write_anon ON public.campaign_attachments FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS recipients_write_auth ON public.campaign_recipients;
CREATE POLICY recipients_write_auth ON public.campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS recipients_write_anon ON public.campaign_recipients;
CREATE POLICY recipients_write_anon ON public.campaign_recipients FOR ALL TO anon USING (true) WITH CHECK (true);

-- Rollen-Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_campaigns TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_attachments TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated, anon;

COMMIT;
