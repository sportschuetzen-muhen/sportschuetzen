-- Migration 84: RLS-Anpassung fuer gallery_albums (Vorstands-Cockpit & Albenkatalog)
-- Erlaubt SELECT auf public.gallery_albums fuer anon, damit publizierte Alben-Titel
-- und Sichtbarkeits-Flags (members vs public) im Vorstands-Cockpit vollstaendig geladen werden koennen.
-- (Die eigentlichen Medien und Bilddaten in public.gallery_photos bleiben weiterhin geschuetzt:
-- anon darf dort nur Fotos mit visibility = 'public' einsehen!)

DROP POLICY IF EXISTS anon_select_public_gallery_albums ON public.gallery_albums;
DROP POLICY IF EXISTS anon_select_all_gallery_albums ON public.gallery_albums;

CREATE POLICY anon_select_all_gallery_albums ON public.gallery_albums
  FOR SELECT TO anon
  USING (true);
