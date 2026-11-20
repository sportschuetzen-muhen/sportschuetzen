-- ==============================================================================
-- 73_gv_dossier_self_contained_texts.sql
-- Migration: Vollständige Entkopplung Generalversammlung & PDF-/Mail-Editor
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- 1. Erweiterung public.gv_instances um dedizierte Einladungs- & Textbausteine
ALTER TABLE public.gv_instances
    ADD COLUMN IF NOT EXISTS einladung_titel TEXT,
    ADD COLUMN IF NOT EXISTS einladung_intro TEXT,
    ADD COLUMN IF NOT EXISTS antragsfrist_hinweis TEXT,
    ADD COLUMN IF NOT EXISTS amtsdauer_text VARCHAR(150),
    ADD COLUMN IF NOT EXISTS praesident_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS grussformel TEXT;

-- 2. Erweiterung public.gv_traktanden um Wahlgeschäft-Kennzeichnung & Kandidaturen
ALTER TABLE public.gv_traktanden
    ADD COLUMN IF NOT EXISTS is_election BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS candidate_names TEXT;

-- 3. Initialwerte für bestehende GV-Instanzen aus Altdaten seeden
UPDATE public.gv_instances
SET
    einladung_titel = COALESCE(einladung_titel, 'Einladung zur ' || number || '. Generalversammlung der Sportschützen Muhen'),
    einladung_intro = COALESCE(einladung_intro, 
        'Sehr geehrte Vereinsmitglieder, geschätzte Ehrenmitglieder und Schützenkameraden,' || E'\n\n' ||
        'zur ' || number || '. ordentlichen Generalversammlung der Sportschützen Muhen laden wir euch herzlich ein.' || E'\n\n' ||
        'In dieser Einladung sind der Jahresbericht des Präsidenten sowie das Protokoll der letzten Generalversammlung enthalten. Ebenso finden sich der Bericht der Jungschützenleiterin, die Jahresrechnung und das Budget. Der Besuch der Generalversammlung ist für alle Wettkampfmitglieder obligatorisch. Entschuldigungen sind dem Präsidenten eine Woche vor der Generalversammlung mitzuteilen.'),
    antragsfrist_hinweis = COALESCE(antragsfrist_hinweis, 'Hinweis: Anträge zuhanden der GV müssen gemäss Art. 15.2 der Vereinsstatuten mindestens 8 Tage vor der Versammlung schriftlich an den Präsidenten eingereicht werden.'),
    amtsdauer_text = COALESCE(amtsdauer_text, 'Amtsdauer ' || year || '–' || (year + 2)),
    praesident_name = COALESCE(praesident_name, 'Andrea Rossi'),
    grussformel = COALESCE(grussformel, 'Mit sportlichen Grüssen' || E'\n' || 'Der Präsident' || E'\n' || 'Andrea Rossi')
WHERE einladung_titel IS NULL OR einladung_intro IS NULL;

-- 4. Traktanden, die Wahlen betreffen, initial flaggen
UPDATE public.gv_traktanden
SET is_election = true
WHERE LOWER(titel) LIKE '%wahl%' OR LOWER(titel) LIKE '%erneuerung%';

COMMIT;
