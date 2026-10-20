-- Migration 83: Website Gallery Sync & Immich Integration
-- Single Source of Truth fuer Website- und Mitglieder-Galerien

CREATE TABLE IF NOT EXISTS public.gallery_albums (
  id text PRIMARY KEY,
  album_name text NOT NULL,
  website_title text NOT NULL,
  visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'public')),
  category text NOT NULL DEFAULT 'events' CHECK (category IN ('events', 'nachwuchs', 'geschichte')),
  share_key text,
  media_count integer DEFAULT 0,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gallery_photos (
  id text PRIMARY KEY,
  album_id text REFERENCES public.gallery_albums(id) ON DELETE CASCADE,
  album text NOT NULL,
  album_key text,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'events',
  visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'public')),
  date text,
  description text,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  thumbnail_url text NOT NULL,
  image_url text NOT NULL,
  video_url text,
  tags text[] DEFAULT '{}'::text[],
  detected_persons text[] DEFAULT '{}'::text[],
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indizes fuer performante Website- und Filter-Abfragen
CREATE INDEX IF NOT EXISTS idx_gallery_photos_album_id ON public.gallery_photos(album_id);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_visibility ON public.gallery_photos(visibility);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_category ON public.gallery_photos(category);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_sort_order ON public.gallery_photos(sort_order);

-- RLS aktivieren
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;

-- Permissions & Grants
GRANT SELECT ON public.gallery_albums TO anon, authenticated;
GRANT SELECT ON public.gallery_photos TO anon, authenticated;
GRANT ALL ON public.gallery_albums TO service_role;
GRANT ALL ON public.gallery_photos TO service_role;

-- RLS Policies gallery_albums
DROP POLICY IF EXISTS anon_select_public_gallery_albums ON public.gallery_albums;
CREATE POLICY anon_select_public_gallery_albums ON public.gallery_albums
  FOR SELECT TO anon
  USING (visibility = 'public');

DROP POLICY IF EXISTS auth_select_all_gallery_albums ON public.gallery_albums;
CREATE POLICY auth_select_all_gallery_albums ON public.gallery_albums
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS manage_gallery_albums ON public.gallery_albums;
CREATE POLICY manage_gallery_albums ON public.gallery_albums
  FOR ALL TO authenticated
  USING (public.rbac_allows(ARRAY['galerie.manage']))
  WITH CHECK (public.rbac_allows(ARRAY['galerie.manage']));

-- RLS Policies gallery_photos
DROP POLICY IF EXISTS anon_select_public_gallery_photos ON public.gallery_photos;
CREATE POLICY anon_select_public_gallery_photos ON public.gallery_photos
  FOR SELECT TO anon
  USING (visibility = 'public');

DROP POLICY IF EXISTS auth_select_all_gallery_photos ON public.gallery_photos;
CREATE POLICY auth_select_all_gallery_photos ON public.gallery_photos
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS manage_gallery_photos ON public.gallery_photos;
CREATE POLICY manage_gallery_photos ON public.gallery_photos
  FOR ALL TO authenticated
  USING (public.rbac_allows(ARRAY['galerie.manage']))
  WITH CHECK (public.rbac_allows(ARRAY['galerie.manage']));

-- ========================================================
-- INITIALER SEED DER BESTEHENDEN 91 FOTOS (DATENERHALT)
-- ========================================================
INSERT INTO public.gallery_albums (id, album_name, website_title, visibility, category, share_key)
VALUES ('0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', '2026 Jugendtag AGSV', 'members', 'nachwuchs', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0')
ON CONFLICT (id) DO UPDATE SET
  website_title = EXCLUDED.website_title,
  visibility = EXCLUDED.visibility,
  category = EXCLUDED.category,
  share_key = EXCLUDED.share_key;
INSERT INTO public.gallery_albums (id, album_name, website_title, visibility, category, share_key)
VALUES ('4d24367d-8f59-4c15-afbd-64867c720510', '2026 Empfang Eidgenössisches', '2026 Empfang Eidgenössisches', 'members', 'events', 'SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk')
ON CONFLICT (id) DO UPDATE SET
  website_title = EXCLUDED.website_title,
  visibility = EXCLUDED.visibility,
  category = EXCLUDED.category,
  share_key = EXCLUDED.share_key;
INSERT INTO public.gallery_albums (id, album_name, website_title, visibility, category, share_key)
VALUES ('ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '1996/1997 Erstellung Schützenhaus Rüteli', 'public', 'geschichte', 'Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0')
ON CONFLICT (id) DO UPDATE SET
  website_title = EXCLUDED.website_title,
  visibility = EXCLUDED.visibility,
  category = EXCLUDED.category,
  share_key = EXCLUDED.share_key;

INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('94989e63-83c6-4aaf-b865-c0c5e8d5fab2', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (1)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=94989e63-83c6-4aaf-b865-c0c5e8d5fab2&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=94989e63-83c6-4aaf-b865-c0c5e8d5fab2&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 0)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('c62fd4f8-670a-430e-9255-f5e40529e836', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (2)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=c62fd4f8-670a-430e-9255-f5e40529e836&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=c62fd4f8-670a-430e-9255-f5e40529e836&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 1)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('b2dfc55e-3b2e-4fb3-9bd1-93f8826ca3f4', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (3)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=b2dfc55e-3b2e-4fb3-9bd1-93f8826ca3f4&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=b2dfc55e-3b2e-4fb3-9bd1-93f8826ca3f4&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 2)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('ae955ccc-fa4c-47a3-a356-894351a2ae1f', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (4)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=ae955ccc-fa4c-47a3-a356-894351a2ae1f&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=ae955ccc-fa4c-47a3-a356-894351a2ae1f&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 3)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('5860ec94-d290-4da3-8e4c-7eb91b94ead4', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (5)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=5860ec94-d290-4da3-8e4c-7eb91b94ead4&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=5860ec94-d290-4da3-8e4c-7eb91b94ead4&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 4)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('937c23a4-31a5-4c3a-8eb3-dbca384a2ed4', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (6)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=937c23a4-31a5-4c3a-8eb3-dbca384a2ed4&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=937c23a4-31a5-4c3a-8eb3-dbca384a2ed4&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 5)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('4465d411-ce70-4cfb-97a1-072d4dd69fd9', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (7)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=4465d411-ce70-4cfb-97a1-072d4dd69fd9&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=4465d411-ce70-4cfb-97a1-072d4dd69fd9&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 6)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('bf773305-7229-4f33-a601-b2f28b0c9699', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (8)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=bf773305-7229-4f33-a601-b2f28b0c9699&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=bf773305-7229-4f33-a601-b2f28b0c9699&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 7)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('5681e458-6232-40e5-be35-34561697d9de', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (9)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=5681e458-6232-40e5-be35-34561697d9de&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=5681e458-6232-40e5-be35-34561697d9de&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 8)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('f1bc5904-a750-4c5c-87b2-9a4300eb3203', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (10)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=f1bc5904-a750-4c5c-87b2-9a4300eb3203&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=f1bc5904-a750-4c5c-87b2-9a4300eb3203&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 9)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('dcbd1f81-839c-44f8-accd-d2d35ec21917', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (11)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=dcbd1f81-839c-44f8-accd-d2d35ec21917&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=dcbd1f81-839c-44f8-accd-d2d35ec21917&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 10)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('26f6823c-a1c4-4616-8d15-d6b27ff1a4f7', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (12)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=26f6823c-a1c4-4616-8d15-d6b27ff1a4f7&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=26f6823c-a1c4-4616-8d15-d6b27ff1a4f7&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 11)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('aca7d1d3-9a8f-436f-bb8f-8a204dfb29a1', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (13)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=aca7d1d3-9a8f-436f-bb8f-8a204dfb29a1&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=aca7d1d3-9a8f-436f-bb8f-8a204dfb29a1&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 12)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('d0879f3c-d40e-4fbf-8c4d-024427224a4d', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (14)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=d0879f3c-d40e-4fbf-8c4d-024427224a4d&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=d0879f3c-d40e-4fbf-8c4d-024427224a4d&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 13)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('1d22c448-afb7-4cc8-a802-ce65f4fed9b2', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (15)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=1d22c448-afb7-4cc8-a802-ce65f4fed9b2&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=1d22c448-afb7-4cc8-a802-ce65f4fed9b2&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 14)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('700e8c0f-e5c1-4f8e-9694-1c1e0b3c3bea', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (16)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=700e8c0f-e5c1-4f8e-9694-1c1e0b3c3bea&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=700e8c0f-e5c1-4f8e-9694-1c1e0b3c3bea&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 15)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('8d2339bc-f049-4472-9174-41fe7de87e58', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (17)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=8d2339bc-f049-4472-9174-41fe7de87e58&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=8d2339bc-f049-4472-9174-41fe7de87e58&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 16)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('38c190c2-3066-4fb3-854e-863addb7de11', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (18)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=38c190c2-3066-4fb3-854e-863addb7de11&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=38c190c2-3066-4fb3-854e-863addb7de11&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 17)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('9d2c0eae-9b97-42a7-9ff9-3da04e493903', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (19)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=9d2c0eae-9b97-42a7-9ff9-3da04e493903&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=9d2c0eae-9b97-42a7-9ff9-3da04e493903&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 18)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('a3b8d799-d6a6-4e7b-b74b-cd65190a1df6', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (20)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=a3b8d799-d6a6-4e7b-b74b-cd65190a1df6&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=a3b8d799-d6a6-4e7b-b74b-cd65190a1df6&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 19)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('5d4b4e2d-6b5b-4372-b60d-d2b77847453b', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (21)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=5d4b4e2d-6b5b-4372-b60d-d2b77847453b&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=5d4b4e2d-6b5b-4372-b60d-d2b77847453b&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 20)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('05b613c7-00fc-46d5-b392-2014c1ed77ee', '0503b252-1ba9-4237-8d60-051d313207bd', '2026 Jugendtag AGSV', 'mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0', '2026 Jugendtag AGSV (22)', 'nachwuchs', 'members', '23.08.2026', 'Impressionen zum Anlass «2026 Jugendtag AGSV» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=05b613c7-00fc-46d5-b392-2014c1ed77ee&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=mG2zcv5GYwagTxjanXhB-xFGDnRzTGc584EB-ozEjU5SUY3EztyBiBdTSASt4bfsrr0&id=05b613c7-00fc-46d5-b392-2014c1ed77ee&size=preview', NULL, ARRAY['2026','Jugendtag','AGSV','Muhen']::text[], ARRAY[]::text[], 21)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('917c36fc-9b86-46b3-a3c8-cffb2f51b5b0', '4d24367d-8f59-4c15-afbd-64867c720510', '2026 Empfang Eidgenössisches', 'SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk', '2026 Empfang Eidgenössisches (1)', 'events', 'public', '23.08.2026', 'Impressionen zum Anlass «2026 Empfang Eidgenössisches» (23.08.2026).', 'video', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=917c36fc-9b86-46b3-a3c8-cffb2f51b5b0&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=917c36fc-9b86-46b3-a3c8-cffb2f51b5b0&size=preview', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=video&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=917c36fc-9b86-46b3-a3c8-cffb2f51b5b0', ARRAY['2026','Empfang','Eidgenössisches','Muhen']::text[], ARRAY[]::text[], 22)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('7f932f42-8cce-400f-b813-301793733ad3', '4d24367d-8f59-4c15-afbd-64867c720510', '2026 Empfang Eidgenössisches', 'SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk', '2026 Empfang Eidgenössisches (2)', 'events', 'public', '23.08.2026', 'Impressionen zum Anlass «2026 Empfang Eidgenössisches» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=7f932f42-8cce-400f-b813-301793733ad3&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=7f932f42-8cce-400f-b813-301793733ad3&size=preview', NULL, ARRAY['2026','Empfang','Eidgenössisches','Muhen']::text[], ARRAY[]::text[], 23)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('4d55aa27-8969-4b99-89b2-82d777253171', '4d24367d-8f59-4c15-afbd-64867c720510', '2026 Empfang Eidgenössisches', 'SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk', '2026 Empfang Eidgenössisches (3)', 'events', 'public', '23.08.2026', 'Impressionen zum Anlass «2026 Empfang Eidgenössisches» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=4d55aa27-8969-4b99-89b2-82d777253171&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=4d55aa27-8969-4b99-89b2-82d777253171&size=preview', NULL, ARRAY['2026','Empfang','Eidgenössisches','Muhen']::text[], ARRAY[]::text[], 24)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('efd45286-e5b5-450e-abe1-58d8b8367b9c', '4d24367d-8f59-4c15-afbd-64867c720510', '2026 Empfang Eidgenössisches', 'SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk', '2026 Empfang Eidgenössisches (4)', 'events', 'public', '23.08.2026', 'Impressionen zum Anlass «2026 Empfang Eidgenössisches» (23.08.2026).', 'video', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=efd45286-e5b5-450e-abe1-58d8b8367b9c&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=efd45286-e5b5-450e-abe1-58d8b8367b9c&size=preview', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=video&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=efd45286-e5b5-450e-abe1-58d8b8367b9c', ARRAY['2026','Empfang','Eidgenössisches','Muhen']::text[], ARRAY[]::text[], 25)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('8c99d101-e800-446c-a766-822ed53eb895', '4d24367d-8f59-4c15-afbd-64867c720510', '2026 Empfang Eidgenössisches', 'SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk', '2026 Empfang Eidgenössisches (5)', 'events', 'public', '23.08.2026', 'Impressionen zum Anlass «2026 Empfang Eidgenössisches» (23.08.2026).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=8c99d101-e800-446c-a766-822ed53eb895&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=SBLEOjvJHeRBCVVtaKGP9iP9A--57kGcKYeunY7NhLbsj6BAWMqg7o6bU8EJAr3irHk&id=8c99d101-e800-446c-a766-822ed53eb895&size=preview', NULL, ARRAY['2026','Empfang','Eidgenössisches','Muhen']::text[], ARRAY[]::text[], 26)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('26518719-2695-46ce-aabf-6d480cfa2fb3', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=26518719-2695-46ce-aabf-6d480cfa2fb3&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=26518719-2695-46ce-aabf-6d480cfa2fb3&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 27)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('e074f30a-c8f4-452b-a487-7cdee064e30f', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e074f30a-c8f4-452b-a487-7cdee064e30f&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e074f30a-c8f4-452b-a487-7cdee064e30f&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 28)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('6e107b3b-0800-4749-8edf-174013dd68f5', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (3)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=6e107b3b-0800-4749-8edf-174013dd68f5&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=6e107b3b-0800-4749-8edf-174013dd68f5&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 29)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('8998529f-768e-4cd0-89f1-fc7e1055d9dc', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8998529f-768e-4cd0-89f1-fc7e1055d9dc&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8998529f-768e-4cd0-89f1-fc7e1055d9dc&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 30)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('d28bc15a-bfed-4f56-83eb-ffac1184a6c7', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d28bc15a-bfed-4f56-83eb-ffac1184a6c7&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d28bc15a-bfed-4f56-83eb-ffac1184a6c7&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 31)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('d410195c-ccf7-404d-a19a-b61aed2f4e4c', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Hansjürg Schmid & Thomas Hochuli', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Hansjürg Schmid & Thomas Hochuli beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d410195c-ccf7-404d-a19a-b61aed2f4e4c&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d410195c-ccf7-404d-a19a-b61aed2f4e4c&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Schmid','Hochuli']::text[], ARRAY['Hansjürg Schmid','Thomas Hochuli']::text[], 32)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('428ec947-411c-4837-a28e-6b5df0edbe3b', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Patrick Schotzko', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Patrick Schotzko beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=428ec947-411c-4837-a28e-6b5df0edbe3b&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=428ec947-411c-4837-a28e-6b5df0edbe3b&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Schotzko']::text[], ARRAY['Patrick Schotzko']::text[], 33)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('1a49576c-0bc7-40a2-aed1-014d27b4e70a', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Ruth Künzli', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Ruth Künzli beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=1a49576c-0bc7-40a2-aed1-014d27b4e70a&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=1a49576c-0bc7-40a2-aed1-014d27b4e70a&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Künzli']::text[], ARRAY['Ruth Künzli']::text[], 34)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('2f89caa4-c644-4e58-8613-0ee9dc24d82e', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Romano Schotzko', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Romano Schotzko beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=2f89caa4-c644-4e58-8613-0ee9dc24d82e&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=2f89caa4-c644-4e58-8613-0ee9dc24d82e&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Schotzko']::text[], ARRAY['Romano Schotzko']::text[], 35)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('8bfdac10-1895-48d5-ae4a-69251565c708', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8bfdac10-1895-48d5-ae4a-69251565c708&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8bfdac10-1895-48d5-ae4a-69251565c708&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 36)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('6f40491e-4822-4abc-b330-af69ad3041e1', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (11)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=6f40491e-4822-4abc-b330-af69ad3041e1&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=6f40491e-4822-4abc-b330-af69ad3041e1&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 37)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('16412c78-ee45-4010-98b5-04f10f5407c3', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Baugelände Rüteli', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=16412c78-ee45-4010-98b5-04f10f5407c3&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=16412c78-ee45-4010-98b5-04f10f5407c3&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 38)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('fca7a40f-41a3-4e0c-a6ba-f3d7f462728c', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=fca7a40f-41a3-4e0c-a6ba-f3d7f462728c&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=fca7a40f-41a3-4e0c-a6ba-f3d7f462728c&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 39)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('088af20f-635e-4299-97bf-352e6b703d4b', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (14)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=088af20f-635e-4299-97bf-352e6b703d4b&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=088af20f-635e-4299-97bf-352e6b703d4b&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 40)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('cc574809-c930-4dbd-a0ce-38a0dfa019cd', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (15)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=cc574809-c930-4dbd-a0ce-38a0dfa019cd&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=cc574809-c930-4dbd-a0ce-38a0dfa019cd&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 41)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('75ea669b-96d8-4f81-a504-68627a0ae5a6', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (16)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=75ea669b-96d8-4f81-a504-68627a0ae5a6&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=75ea669b-96d8-4f81-a504-68627a0ae5a6&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 42)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('0729e7c6-dec1-43be-85a0-8630daba7c65', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (17)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=0729e7c6-dec1-43be-85a0-8630daba7c65&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=0729e7c6-dec1-43be-85a0-8630daba7c65&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 43)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('fad787fd-a927-4fc6-987e-20767cc9e175', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (18)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=fad787fd-a927-4fc6-987e-20767cc9e175&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=fad787fd-a927-4fc6-987e-20767cc9e175&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 44)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('a318c864-b3f9-41bc-8a32-b366229dcc83', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (19)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=a318c864-b3f9-41bc-8a32-b366229dcc83&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=a318c864-b3f9-41bc-8a32-b366229dcc83&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 45)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('daa3f43d-bb73-40dc-8fe2-7e4c0c4f1017', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Gerhard Künzli & Hans Bäni', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Gerhard Künzli & Hans Bäni beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=daa3f43d-bb73-40dc-8fe2-7e4c0c4f1017&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=daa3f43d-bb73-40dc-8fe2-7e4c0c4f1017&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Künzli','Bäni']::text[], ARRAY['Gerhard Künzli','Hans Bäni']::text[], 46)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('352ec729-3853-4d3d-931b-74871de27518', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=352ec729-3853-4d3d-931b-74871de27518&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=352ec729-3853-4d3d-931b-74871de27518&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 47)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('ff751220-9ad1-46d6-8bac-e5431c9c68dc', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Zufahrtsstrasse / Schnellstrasse', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ff751220-9ad1-46d6-8bac-e5431c9c68dc&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ff751220-9ad1-46d6-8bac-e5431c9c68dc&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 48)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('d00a2287-3bf7-4215-b6fb-3f52afd6c059', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (23)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d00a2287-3bf7-4215-b6fb-3f52afd6c059&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d00a2287-3bf7-4215-b6fb-3f52afd6c059&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 49)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('2a3a8b70-6035-48e8-9f76-e2859788e701', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (24)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=2a3a8b70-6035-48e8-9f76-e2859788e701&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=2a3a8b70-6035-48e8-9f76-e2859788e701&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 50)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('932b123b-8f8f-48e3-9a55-7edb2ebc110a', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Romano Schotzko & Ernst Kunz', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Romano Schotzko & Ernst Kunz beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=932b123b-8f8f-48e3-9a55-7edb2ebc110a&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=932b123b-8f8f-48e3-9a55-7edb2ebc110a&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Schotzko','Kunz']::text[], ARRAY['Romano Schotzko','Ernst Kunz']::text[], 51)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('314d3808-933a-4a3c-8cd2-61f697d5479d', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Gerhard Künzli & Hans Bäni', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Gerhard Künzli & Hans Bäni beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=314d3808-933a-4a3c-8cd2-61f697d5479d&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=314d3808-933a-4a3c-8cd2-61f697d5479d&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Künzli','Bäni']::text[], ARRAY['Gerhard Künzli','Hans Bäni']::text[], 52)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('e8522d4a-5522-4b87-b730-9cdcb8d5b05d', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (27)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e8522d4a-5522-4b87-b730-9cdcb8d5b05d&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e8522d4a-5522-4b87-b730-9cdcb8d5b05d&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 53)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('9d8b437f-b3da-4a8b-a9f5-d23f06cd3033', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (28)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=9d8b437f-b3da-4a8b-a9f5-d23f06cd3033&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=9d8b437f-b3da-4a8b-a9f5-d23f06cd3033&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 54)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('86429530-9732-4208-a939-a6575b2ef44b', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (29)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=86429530-9732-4208-a939-a6575b2ef44b&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=86429530-9732-4208-a939-a6575b2ef44b&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 55)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('b6a7ed36-d371-4304-a5a4-3519862cc929', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Daniel Berchtold, Gerhard Künzli, Fritz Suter & Bruno Berchtold', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Daniel Berchtold, Gerhard Künzli, Fritz Suter & Bruno Berchtold beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=b6a7ed36-d371-4304-a5a4-3519862cc929&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=b6a7ed36-d371-4304-a5a4-3519862cc929&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Berchtold','Künzli','Suter']::text[], ARRAY['Daniel Berchtold','Gerhard Künzli','Fritz Suter','Bruno Berchtold']::text[], 56)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('92e2cb5b-44fc-4b77-ab16-d66b790e5d46', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=92e2cb5b-44fc-4b77-ab16-d66b790e5d46&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=92e2cb5b-44fc-4b77-ab16-d66b790e5d46&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 57)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('8fd71043-d88c-45a8-ac81-2b4152ce8b07', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8fd71043-d88c-45a8-ac81-2b4152ce8b07&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8fd71043-d88c-45a8-ac81-2b4152ce8b07&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 58)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('0aac896b-2786-4eb7-8549-4bec642b62f2', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=0aac896b-2786-4eb7-8549-4bec642b62f2&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=0aac896b-2786-4eb7-8549-4bec642b62f2&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 59)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('77089e92-8c79-4b75-9a9f-d1808dc38874', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (34)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=77089e92-8c79-4b75-9a9f-d1808dc38874&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=77089e92-8c79-4b75-9a9f-d1808dc38874&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 60)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('d6ecb94d-29df-4e07-a0fd-f40fb6564720', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (35)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d6ecb94d-29df-4e07-a0fd-f40fb6564720&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=d6ecb94d-29df-4e07-a0fd-f40fb6564720&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 61)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('9a695f5e-9851-4923-af96-bea96b7af8a9', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Thomas Gebert', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Thomas Gebert beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=9a695f5e-9851-4923-af96-bea96b7af8a9&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=9a695f5e-9851-4923-af96-bea96b7af8a9&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Gebert']::text[], ARRAY['Thomas Gebert']::text[], 62)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('8592f621-91ae-40f2-a2b1-4442e5d9ff23', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (37)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8592f621-91ae-40f2-a2b1-4442e5d9ff23&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=8592f621-91ae-40f2-a2b1-4442e5d9ff23&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 63)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('e89235b3-3222-4a65-88b9-425b08596715', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (38)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e89235b3-3222-4a65-88b9-425b08596715&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e89235b3-3222-4a65-88b9-425b08596715&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 64)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('4bc8d6b8-acfa-4ced-9679-08ceeecaaa5c', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Hansjürg Schmid & Thomas Hochuli', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Hansjürg Schmid & Thomas Hochuli beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=4bc8d6b8-acfa-4ced-9679-08ceeecaaa5c&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=4bc8d6b8-acfa-4ced-9679-08ceeecaaa5c&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Schmid','Hochuli']::text[], ARRAY['Hansjürg Schmid','Thomas Hochuli']::text[], 65)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('b832c4ae-2c29-4349-b9a5-3b2cf7b9ba6d', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (40)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=b832c4ae-2c29-4349-b9a5-3b2cf7b9ba6d&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=b832c4ae-2c29-4349-b9a5-3b2cf7b9ba6d&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 66)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('ca1ea55d-e2e1-45b6-aabd-436b9a93f4b2', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Spatenstich', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ca1ea55d-e2e1-45b6-aabd-436b9a93f4b2&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ca1ea55d-e2e1-45b6-aabd-436b9a93f4b2&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 67)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('b9bb422e-62f1-455d-8936-8e7e9ff3ebaf', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Gerhard Künzli, Thomas Hochuli & Urs Spinnler', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Gerhard Künzli, Thomas Hochuli & Urs Spinnler beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=b9bb422e-62f1-455d-8936-8e7e9ff3ebaf&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=b9bb422e-62f1-455d-8936-8e7e9ff3ebaf&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Künzli','Hochuli','Spinnler']::text[], ARRAY['Gerhard Künzli','Thomas Hochuli','Urs Spinnler']::text[], 68)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('40a430fd-3479-4a80-a718-bc8e375236e5', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Gerhard Künzli, Ernst Kunz & Roger Haller', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Gerhard Künzli, Ernst Kunz & Roger Haller beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=40a430fd-3479-4a80-a718-bc8e375236e5&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=40a430fd-3479-4a80-a718-bc8e375236e5&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Künzli','Kunz','Haller']::text[], ARRAY['Gerhard Künzli','Ernst Kunz','Roger Haller']::text[], 69)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('355e934c-57e0-4d2e-9241-08cc44a1b831', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Leitungen Ins Erdreich Verlegen', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=355e934c-57e0-4d2e-9241-08cc44a1b831&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=355e934c-57e0-4d2e-9241-08cc44a1b831&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 70)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('aa73cf88-a66a-4a66-a246-bf4f2327890d', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Gerhard Künzli & Ernst Kunz', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Gerhard Künzli & Ernst Kunz beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=aa73cf88-a66a-4a66-a246-bf4f2327890d&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=aa73cf88-a66a-4a66-a246-bf4f2327890d&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Künzli','Kunz']::text[], ARRAY['Gerhard Künzli','Ernst Kunz']::text[], 71)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('a9c57eb8-9706-4e30-9f0f-8b2f8c2cff98', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (46)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=a9c57eb8-9706-4e30-9f0f-8b2f8c2cff98&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=a9c57eb8-9706-4e30-9f0f-8b2f8c2cff98&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 72)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('2f492979-cfad-448d-a593-fb3c0af4f449', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (47)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=2f492979-cfad-448d-a593-fb3c0af4f449&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=2f492979-cfad-448d-a593-fb3c0af4f449&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 73)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('4fc2b65e-2eb8-40bd-a372-8b495a155285', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (48)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=4fc2b65e-2eb8-40bd-a372-8b495a155285&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=4fc2b65e-2eb8-40bd-a372-8b495a155285&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 74)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('0d6dface-b6f4-4c4a-ae9a-7c5b216b09d7', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (49)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=0d6dface-b6f4-4c4a-ae9a-7c5b216b09d7&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=0d6dface-b6f4-4c4a-ae9a-7c5b216b09d7&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 75)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('3d7e3e45-9e24-4d08-83ec-af81cc40cfd7', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Hans Bäni, Fritz Suter & Romano Schotzko', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Hans Bäni, Fritz Suter & Romano Schotzko beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=3d7e3e45-9e24-4d08-83ec-af81cc40cfd7&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=3d7e3e45-9e24-4d08-83ec-af81cc40cfd7&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Bäni','Suter','Schotzko']::text[], ARRAY['Hans Bäni','Fritz Suter','Romano Schotzko']::text[], 76)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('fcf3e2dd-197c-493b-abf1-d1f0f96bcb68', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Romano Schotzko & Ernst Kunz', 'geschichte', 'public', '01.07.1995', 'Historische Aufnahme: Romano Schotzko & Ernst Kunz beim Bau des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=fcf3e2dd-197c-493b-abf1-d1f0f96bcb68&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=fcf3e2dd-197c-493b-abf1-d1f0f96bcb68&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996','Schotzko','Kunz']::text[], ARRAY['Romano Schotzko','Ernst Kunz']::text[], 77)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('417e6457-c180-41b4-9972-e007928cc361', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (52)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=417e6457-c180-41b4-9972-e007928cc361&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=417e6457-c180-41b4-9972-e007928cc361&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 78)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('e2414f71-5efa-4547-a7ee-b8493f49e787', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Betonbodenplatte Giessen', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e2414f71-5efa-4547-a7ee-b8493f49e787&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=e2414f71-5efa-4547-a7ee-b8493f49e787&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 79)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('172e0ca3-58a2-469b-816f-ae30a7263705', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (54)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=172e0ca3-58a2-469b-816f-ae30a7263705&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=172e0ca3-58a2-469b-816f-ae30a7263705&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 80)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('7010e550-e5d8-4d18-ae1a-a879b7038f8d', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (55)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=7010e550-e5d8-4d18-ae1a-a879b7038f8d&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=7010e550-e5d8-4d18-ae1a-a879b7038f8d&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 81)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('49b75aed-4d02-4e17-b86a-2baf65d0e00a', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (56)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=49b75aed-4d02-4e17-b86a-2baf65d0e00a&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=49b75aed-4d02-4e17-b86a-2baf65d0e00a&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 82)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('846940b9-1e2a-49c9-b645-4377ea864015', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (57)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=846940b9-1e2a-49c9-b645-4377ea864015&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=846940b9-1e2a-49c9-b645-4377ea864015&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 83)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('924dcef1-b14b-471c-93a7-9c6229fd3207', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (58)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=924dcef1-b14b-471c-93a7-9c6229fd3207&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=924dcef1-b14b-471c-93a7-9c6229fd3207&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 84)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('64729a61-18b3-46fa-98b8-86ca40addba0', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (59)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=64729a61-18b3-46fa-98b8-86ca40addba0&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=64729a61-18b3-46fa-98b8-86ca40addba0&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 85)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('ebcb59f8-4367-4657-a7fa-cabd4abcb29d', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (60)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ebcb59f8-4367-4657-a7fa-cabd4abcb29d&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ebcb59f8-4367-4657-a7fa-cabd4abcb29d&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 86)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('a574aa92-7c33-4035-b3d4-17903ab170ad', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (61)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=a574aa92-7c33-4035-b3d4-17903ab170ad&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=a574aa92-7c33-4035-b3d4-17903ab170ad&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 87)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('7c96ae2b-c846-4c10-b3de-e59830423a53', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (62)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=7c96ae2b-c846-4c10-b3de-e59830423a53&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=7c96ae2b-c846-4c10-b3de-e59830423a53&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 88)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('ae305e0f-562e-4204-a6cf-ab0e7c810e4a', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (63)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ae305e0f-562e-4204-a6cf-ab0e7c810e4a&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=ae305e0f-562e-4204-a6cf-ab0e7c810e4a&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 89)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.gallery_photos (id, album_id, album, album_key, title, category, visibility, date, description, media_type, thumbnail_url, image_url, video_url, tags, detected_persons, sort_order)
VALUES ('c772546c-e779-4090-8b8a-cbfd60be8156', 'ad154da9-de55-40f7-987b-5c7aaab29426', '1996/1997 Erstellung Schützenhaus Rüteli', '', 'Bauarbeiten Schützenhaus Rüteli (64)', 'geschichte', 'public', '01.07.1995', 'Dokumentation aus der Entstehungsphase des Schützenhauses Rüteli (1996/1997).', 'image', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=c772546c-e779-4090-8b8a-cbfd60be8156&size=thumbnail', 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev?module=immich&action=image&host=https%3A%2F%2Fimmich-muhen.danfamily.uk&key=Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0&id=c772546c-e779-4090-8b8a-cbfd60be8156&size=preview', NULL, ARRAY['Schützenhaus','Bau','Rüteli','1996']::text[], ARRAY[]::text[], 90)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  visibility = EXCLUDED.visibility,
  date = EXCLUDED.date,
  description = EXCLUDED.description,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url = EXCLUDED.image_url,
  video_url = EXCLUDED.video_url,
  tags = EXCLUDED.tags,
  detected_persons = EXCLUDED.detected_persons,
  sort_order = EXCLUDED.sort_order;

-- Medien-Zaehler in gallery_albums aktualisieren
UPDATE public.gallery_albums a
SET media_count = (SELECT count(*) FROM public.gallery_photos p WHERE p.album_id = a.id);
