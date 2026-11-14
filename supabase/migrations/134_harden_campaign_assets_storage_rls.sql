-- ==============================================================================
-- 134_harden_campaign_assets_storage_rls.sql
-- Migration: Haertung Storage-Bucket 'campaign-assets' (kein anonymer Schreibzugriff)
-- Projekt: Vereinsportal Sportschuetzen Muhen
--
-- Behebt:
--   Entfernt 'Anon Insert campaign-assets' und 'Anon Update campaign-assets' auf
--   storage.objects und beschraenkt INSERT/UPDATE/DELETE fuer authenticated
--   strikt auf Nutzer mit 'mail.manage' oder 'gv.manage' (Admin via rbac_allows).
--   Public Read bleibt erhalten, da Dossier-/Beilagen-Links in Mails verlinkt werden.
-- ==============================================================================

BEGIN;

DROP POLICY IF EXISTS "Anon Insert campaign-assets" ON storage.objects;
DROP POLICY IF EXISTS "Anon Update campaign-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Insert campaign-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update campaign-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete campaign-assets" ON storage.objects;

CREATE POLICY "Authenticated Insert campaign-assets" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'campaign-assets'
        AND (SELECT public.rbac_allows(ARRAY['mail.manage', 'gv.manage']))
    );

CREATE POLICY "Authenticated Update campaign-assets" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'campaign-assets'
        AND (SELECT public.rbac_allows(ARRAY['mail.manage', 'gv.manage']))
    )
    WITH CHECK (
        bucket_id = 'campaign-assets'
        AND (SELECT public.rbac_allows(ARRAY['mail.manage', 'gv.manage']))
    );

CREATE POLICY "Authenticated Delete campaign-assets" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'campaign-assets'
        AND (SELECT public.rbac_allows(ARRAY['mail.manage', 'gv.manage']))
    );

COMMIT;
