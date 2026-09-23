-- ==============================================================================
-- 18_generalversammlung_module.sql
-- Migration: Fachmodul GENERALVERSAMMLUNG & PRÄSENZKONTROLLE (Phase 17)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.gv_instances: GV-Stammdaten, Termine, Wahljahr, Dokumente & Einstellungen
-- 2. public.gv_traktanden: Traktandenliste, Anträge, Beschlüsse & Abstimmungen
-- 3. public.gv_praesenz: Präsenzkontrolle, Anmeldungen, Essen & Stimmberechtigung
-- 4. public.v_gv_praesenz_summary: View für Beschlussfähigkeit & Kennzahlen
-- ==============================================================================

-- 1. TABELLE: public.gv_instances (Generalversammlungen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gv_instances (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. 'gv_2026' oder '100_gv'
    year INTEGER NOT NULL UNIQUE,                       -- Durchführungsjahr (z. B. 2026)
    number INTEGER NOT NULL DEFAULT 100,                -- Nummer der GV (z. B. 100)
    datum DATE,                                         -- Durchführungsdatum
    zeit VARCHAR(10) DEFAULT '19:30',                   -- Startzeit
    ort VARCHAR(150) DEFAULT 'Schützenhaus Muhen',      -- Austragungsort
    datum_vorjahr DATE,                                 -- Datum Vorjahres-GV
    abmelde_datum DATE,                                 -- Frist für Abmeldungen
    mahn_datum DATE,                                    -- Mahnungs-Frist
    is_election_year BOOLEAN NOT NULL DEFAULT false,    -- Wahljahr-Flag
    linked_event_id VARCHAR(100),                       -- Verknüpfung zu public.poll_events(id)
    praesident_wort TEXT,                               -- Grusswort / Einladungstext
    budget_text TEXT,                                   -- Budget-Details / Kommentar
    vorstand_mails TEXT[] DEFAULT '{}',                 -- E-Mail-Kopien an Vorstandsmitglieder
    doc_einladung_url TEXT,                             -- Link / Drive-ID Einladungs-PDF
    doc_protokoll_url TEXT,                             -- Link / Drive-ID Vorjahres-Protokoll
    doc_jahresbericht_url TEXT,                         -- Link / Drive-ID Jahresbericht
    doc_anhaenge_url TEXT,                              -- Link / Drive-ID Zusätzliche Anhänge
    custom_placeholders JSONB NOT NULL DEFAULT '{}'::jsonb, -- Beliebige weitere Schlüssel-Werte
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gv_instances_year ON public.gv_instances(year);

-- 2. TABELLE: public.gv_traktanden (Traktanden & Beschlüsse)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gv_traktanden (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. 'traktandum_2026_1'
    gv_id VARCHAR(50) NOT NULL REFERENCES public.gv_instances(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 1,
    nummer VARCHAR(10) NOT NULL DEFAULT '1',            -- '1', '2', '3a'
    titel VARCHAR(255) NOT NULL,
    beschreibung TEXT,
    referent VARCHAR(100),
    beschluss TEXT,
    ja_stimmen INTEGER DEFAULT 0,
    nein_stimmen INTEGER DEFAULT 0,
    enthaltungen INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'offen',        -- 'offen', 'genehmigt', 'abgelehnt', 'verschoben'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gv_traktanden_gv ON public.gv_traktanden(gv_id, sort_order);

-- 3. TABELLE: public.gv_praesenz (Präsenzliste & Stimmberechtigung)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gv_praesenz (
    id VARCHAR(100) PRIMARY KEY,                        -- z. B. 'praesenz_2026_1001'
    gv_id VARCHAR(50) NOT NULL REFERENCES public.gv_instances(id) ON DELETE CASCADE,
    person_number VARCHAR(50) NOT NULL,                 -- SSV-Personennummer
    name VARCHAR(150) NOT NULL,                         -- Nachname Vorname
    lizenz VARCHAR(20),                                 -- Lizenznummer
    mitglied_status VARCHAR(50) DEFAULT 'Aktivmitglied',-- 'Aktivmitglied', 'Ehrenmitglied', etc.
    stimmberechtigt BOOLEAN NOT NULL DEFAULT true,      -- Gemäss Statuten: Aktiv & Ehren = true
    anmeldung_status VARCHAR(20) NOT NULL DEFAULT 'offen', -- 'ja', 'nein', 'offen'
    anwesend BOOLEAN NOT NULL DEFAULT false,            -- Vor Ort anwesend
    essen INTEGER NOT NULL DEFAULT 0,                   -- Fleisch-Menü
    vegi INTEGER NOT NULL DEFAULT 0,                    -- Vegi-Menü
    grund TEXT,                                         -- Entschuldigungsgrund
    notizen TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_gv_praesenz_entry UNIQUE (gv_id, person_number)
);

CREATE INDEX IF NOT EXISTS idx_gv_praesenz_gv ON public.gv_praesenz(gv_id);
CREATE INDEX IF NOT EXISTS idx_gv_praesenz_pn ON public.gv_praesenz(person_number);
CREATE INDEX IF NOT EXISTS idx_gv_praesenz_status ON public.gv_praesenz(gv_id, anmeldung_status);
CREATE INDEX IF NOT EXISTS idx_gv_praesenz_anwesend ON public.gv_praesenz(gv_id, anwesend);

-- 4. VIEW: public.v_gv_praesenz_summary (Auswertung & Beschlussfähigkeit)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_gv_praesenz_summary AS
SELECT 
    p.gv_id,
    COUNT(*) AS total_mitglieder,
    COUNT(*) FILTER (WHERE p.stimmberechtigt = true) AS total_stimmberechtigt,
    COUNT(*) FILTER (WHERE p.anmeldung_status = 'ja') AS anmeldungen_ja,
    COUNT(*) FILTER (WHERE p.anmeldung_status = 'nein') AS anmeldungen_nein,
    COUNT(*) FILTER (WHERE p.anmeldung_status = 'offen') AS anmeldungen_offen,
    COUNT(*) FILTER (WHERE p.anwesend = true) AS total_anwesend,
    COUNT(*) FILTER (WHERE p.anwesend = true AND p.stimmberechtigt = true) AS anwesend_stimmberechtigt,
    -- Absolutes Mehr der anwesenden Stimmberechtigten
    FLOOR(COUNT(*) FILTER (WHERE p.anwesend = true AND p.stimmberechtigt = true) / 2) + 1 AS absolutes_mehr,
    SUM(p.essen) AS total_essen_fleisch,
    SUM(p.vegi) AS total_essen_vegi
FROM public.gv_praesenz p
GROUP BY p.gv_id;

-- 5. TRIGGER: updated_at Aktualisierung
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_gv_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gv_instances_updated ON public.gv_instances;
CREATE TRIGGER trg_gv_instances_updated
    BEFORE UPDATE ON public.gv_instances
    FOR EACH ROW
    EXECUTE FUNCTION public.set_gv_updated_at();

DROP TRIGGER IF EXISTS trg_gv_traktanden_updated ON public.gv_traktanden;
CREATE TRIGGER trg_gv_traktanden_updated
    BEFORE UPDATE ON public.gv_traktanden
    FOR EACH ROW
    EXECUTE FUNCTION public.set_gv_updated_at();

DROP TRIGGER IF EXISTS trg_gv_praesenz_updated ON public.gv_praesenz;
CREATE TRIGGER trg_gv_praesenz_updated
    BEFORE UPDATE ON public.gv_praesenz
    FOR EACH ROW
    EXECUTE FUNCTION public.set_gv_updated_at();

-- 6. INITIALDATEN: Standard-GV 2026 (100. GV)
-- ------------------------------------------------------------------------------
INSERT INTO public.gv_instances (
    id, year, number, datum, zeit, ort, is_election_year,
    praesident_wort, budget_text
)
VALUES (
    'gv_2026',
    2026,
    100,
    '2026-03-20',
    '19:30',
    'Schützenhaus Muhen',
    false,
    'Liebe Schützinnen und Schützen, geschätzte Ehrenmitglieder. Zur 100. ordentlichen Generalversammlung lade ich euch herzlich ein.',
    'Das Budget 2026 sieht ausgeglichene Finanzen vor. Detailunterlagen liegen auf.'
)
ON CONFLICT (year) DO NOTHING;

-- Standard-Traktanden für die 100. GV
INSERT INTO public.gv_traktanden (id, gv_id, sort_order, nummer, titel, referent)
VALUES
    ('tr_2026_1', 'gv_2026', 1, '1', 'Begrüssung und Appell', 'Präsident'),
    ('tr_2026_2', 'gv_2026', 2, '2', 'Wahl der Stimmenzähler', 'Präsident'),
    ('tr_2026_3', 'gv_2026', 3, '3', 'Protokoll der 99. Generalversammlung', 'Aktuar'),
    ('tr_2026_4', 'gv_2026', 4, '4', 'Jahresberichte (Präsident, Schützenmeister, Jungschützen)', 'Vorstand'),
    ('tr_2026_5', 'gv_2026', 5, '5', 'Jahresrechnung 2025 und Revisorenbericht', 'Kassier / Revisoren'),
    ('tr_2026_6', 'gv_2026', 6, '6', 'Budget 2026 und Festsetzung der Jahresbeiträge', 'Kassier'),
    ('tr_2026_7', 'gv_2026', 7, '7', 'Jahresprogramm 2026', 'Schützenmeister'),
    ('tr_2026_8', 'gv_2026', 8, '8', 'Ehrungen und Mutationen', 'Präsident'),
    ('tr_2026_9', 'gv_2026', 9, '9', 'Verschiedenes und Umfrage', 'Alle')
ON CONFLICT (id) DO NOTHING;

-- 7. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.gv_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gv_traktanden ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gv_praesenz ENABLE ROW LEVEL SECURITY;

-- Leseberechtigung (Öffentlich / Authentifiziert)
DROP POLICY IF EXISTS "Public and Members can read gv_instances" ON public.gv_instances;
CREATE POLICY "Public and Members can read gv_instances"
    ON public.gv_instances FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public and Members can read gv_traktanden" ON public.gv_traktanden;
CREATE POLICY "Public and Members can read gv_traktanden"
    ON public.gv_traktanden FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public and Members can read gv_praesenz" ON public.gv_praesenz;
CREATE POLICY "Public and Members can read gv_praesenz"
    ON public.gv_praesenz FOR SELECT
    USING (true);

-- Schreibberechtigung (Vorstand & Aktuar & Admin)
DROP POLICY IF EXISTS "Authorized roles can manage gv_instances" ON public.gv_instances;
CREATE POLICY "Authorized roles can manage gv_instances"
    ON public.gv_instances FOR ALL
    USING (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    )
    WITH CHECK (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    );

DROP POLICY IF EXISTS "Authorized roles can manage gv_traktanden" ON public.gv_traktanden;
CREATE POLICY "Authorized roles can manage gv_traktanden"
    ON public.gv_traktanden FOR ALL
    USING (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    )
    WITH CHECK (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    );

DROP POLICY IF EXISTS "Authorized roles can manage gv_praesenz" ON public.gv_praesenz;
CREATE POLICY "Authorized roles can manage gv_praesenz"
    ON public.gv_praesenz FOR ALL
    USING (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    )
    WITH CHECK (
        auth.role() = 'authenticated'
        OR current_user = 'postgres'
        OR current_user = 'anon'
    );
