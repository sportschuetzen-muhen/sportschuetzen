-- 71_storage_bucket_allow_webp.sql
-- Erweitert die erlaubten MIME-Types der Storage-Buckets 'operatives-storage' und 'campaign-assets'
-- um 'image/webp', damit moderne WebP-Porträtfotos, Avatare und Web-Belege hochgeladen werden können.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/json']
WHERE id IN ('operatives-storage', 'campaign-assets');
