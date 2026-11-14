-- Migration 100: Zusammengesetzter Primaerschluessel (album_id, id) fuer gallery_photos
-- Erlaubt es, dass dasselbe Immich-Asset in mehreren publizierten Alben gleichzeitig vorkommt.

ALTER TABLE public.gallery_photos
  ALTER COLUMN album_id SET NOT NULL;

ALTER TABLE public.gallery_photos
  DROP CONSTRAINT IF EXISTS gallery_photos_pkey;

ALTER TABLE public.gallery_photos
  ADD CONSTRAINT gallery_photos_pkey PRIMARY KEY (album_id, id);

CREATE INDEX IF NOT EXISTS idx_gallery_photos_asset_id
  ON public.gallery_photos(id);
