-- ==============================================================================
-- 112_fix_jm_catalog_keywords.sql
-- Optimierung der Suchbegriffe im Schützenfeste-Katalog
-- Verhindert False-Positives durch Gastvereine (z.B. Balsthal-Klus in Bärenmoos)
-- ==============================================================================

-- 1. Bärenmoos-Schiessen: Suchbegriffe um Schreibweisen ohne Bindestrich und Tippfehler erweitern
UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'baerenmoos;baeren moos;baeren-moos;bärenmoos;bären moos;baeremoos;baerenmoosschiessen;bärenmoosschiessen;baerenmoos-schiessen;bärenmoos-schiessen;bärenmoos schiessen;baerenmoos schiessen;baerenmosschiessen;bärenmosschiessen;bärenmossschiessen;villmergen baerenmoos;villmergen bärenmoos;villmergen baeren moos;villmergen bärenmoosschiessen;villmergen baerenmoosschiessen',
    updated_at = now()
WHERE anlass = 'Bärenmoos-Schiessen';

-- 2. Balsthaler Liegendmatch: unspezifisches "schiessanlage moos;" präzisieren
UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'balsthaler liegendmatch;liegendmatch balsthal;balsthal liegend;balsthaler liegend;schiessanlage moos balsthal;freischützen balsthal;freischützen balsthal-klus',
    updated_at = now()
WHERE anlass = 'Balsthaler Liegendmatch';

-- 3. Weitere Schiessen um bindestrichlose Varianten ergänzen
UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'sonnenberg;sonnenbergschiessen;sonnenberg-schiessen;sonnen berg;sonenberg;reinach sonnenberg;reinach sonnenbergschiessen;reinach sonnenberg-schiessen',
    updated_at = now()
WHERE anlass = 'Sonnenberg-Schiessen';

UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'stumpenland;stumpen land;stumpenlandschiessen;stumpenland-schiessen;menziken-burg stumpenland;menziken-burg stumpenlandschiessen;menziken-burg stumpenland-schiessen',
    updated_at = now()
WHERE anlass = 'Stumpenland-Schiessen';

UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'deisigraben;deisigrabenschiessen;deisigraben-schiessen;deisigraben schiessen;sulz deisigraben;sulz deisigrabenschiessen;talschützen sulz',
    updated_at = now()
WHERE anlass = 'Deisigrabenschiessen';

UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'siggenberg;siggenbergschiessen;siggenberg-schiessen;siggen berg;siggenthal siggenberg;siggenthal siggenbergschiessen',
    updated_at = now()
WHERE anlass = 'Siggenbergschiessen';

UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'kornberg;kornbergschiessen;kornberg-schiessen;korn berg;gipf-oberfrick kornberg;gipf-oberfrick kornbergschiessen',
    updated_at = now()
WHERE anlass = 'Kornberg-Schiessen';

UPDATE public.jm_competitions_catalog
SET suchbegriffe = 'laubberg;laubbergschiessen;laubberg-schiessen;laub berg;mettauertal laubberg;mettauertal laubbergschiessen',
    updated_at = now()
WHERE anlass = 'Laubbergschiessen';
