-- ==============================================================================
-- MIGRATION 51: VEREINFACHUNG DOKUMENTEN-KATEGORIEN & BEREINIGUNG DUMMY-DATEN
-- 1. Weist den 34 GV-Einladungen die dedizierte Kategorie 'einladungen' zu.
-- 2. Bereinigt die 8 veralteten Platzhalter-Dokumente ("leere Hüllen").
-- 3. Bildet die 3 klaren Ordner ab: 'gv', 'einladungen', 'chronik'.
-- ==============================================================================

-- 1. Dedizierte Kategorie für Einladungen
UPDATE public.documents
SET category = 'einladungen',
    updated_at = now()
WHERE file_url LIKE '%/02_einladungen/%';

-- 2. Fehlende Jahreszahlen anhand des Titels nachtragen
UPDATE public.documents 
SET year = 2026,
    updated_at = now()
WHERE year IS NULL AND (title LIKE '%2026%' OR file_url LIKE '%2026%');

-- 3. Bereinigung der 8 alten Dummy-Einträge ohne Archiv-Dateien
DELETE FROM public.documents
WHERE file_url NOT LIKE '%/archiv/%';

-- 3. Überprüfung / Statistik
-- gv: Protokolle & Jahresberichte (ca. 245)
-- einladungen: GV-Einladungen & Traktanden (34)
-- chronik: Historische Chroniken (2)
