-- Migration 92: Korrektur von Umlauten in gallery_photos und cover_url fuer gallery_albums
UPDATE public.gallery_photos p
SET album = a.album_name
FROM public.gallery_albums a
WHERE a.album_name LIKE '2026 Empfang Eidgen%'
  AND p.album LIKE '2026 Empfang Eidgen%';

-- cover_url Spalte auf gallery_albums ergaenzen fuer performantes, RLS-unabhaengiges Titelbild-Laden
ALTER TABLE public.gallery_albums ADD COLUMN IF NOT EXISTS cover_url text;

UPDATE public.gallery_albums a
SET cover_url = sub.thumbnail_url
FROM (
  SELECT DISTINCT ON (album) album, thumbnail_url 
  FROM public.gallery_photos 
  ORDER BY album, created_at DESC
) sub
WHERE a.album_name = sub.album;
