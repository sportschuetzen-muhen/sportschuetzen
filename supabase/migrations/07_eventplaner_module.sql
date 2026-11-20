-- ==============================================================================
-- 07_eventplaner_module.sql
-- Migration: Phase 5 – Fachmodul ANLÄSSE & UMFRAGEN (Eventplaner / RSVP / Polls)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Eigenständige Supabase-Tabellen für das Modul 'Anlässe & Umfragen':
-- - poll_events: Umfragen, Anlässe, Datums-Optionen, Abfrage-Optionen
-- - poll_responses: Mitglieder-Rückmeldungen (Zu-/Absagen, Begleitung, Essen/Vegi, Optionen)
-- - poll_views: Tracking (wer hat welchen Anlass/Liste wann geöffnet)
-- - poll_responses_log: Revisions- und Änderungs-Log
-- ==============================================================================

-- 1. UMFRAGEN & EVENTS (POLL_EVENTS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poll_events (
    id VARCHAR(100) PRIMARY KEY,                         -- Eindeutige ID (Altsystem z.B. 'pe_...' oder UUID)
    title VARCHAR(255) NOT NULL,
    datum DATE,
    gruppe VARCHAR(50) NOT NULL DEFAULT 'aktiv',        -- 'aktiv', 'passiv', 'alle'
    schiessanlass BOOLEAN NOT NULL DEFAULT false,       -- Externes Schiessen mit Datums-Optionen
    aktiv BOOLEAN NOT NULL DEFAULT true,                -- Aktiv in der App sichtbar
    showparticipants BOOLEAN NOT NULL DEFAULT false,    -- Teilnehmerliste öffentlich sichtbar
    frage_begleitung BOOLEAN NOT NULL DEFAULT false,    -- Frage nach Anzahl Begleitpersonen
    frage_essen BOOLEAN NOT NULL DEFAULT false,         -- Frage nach Fleisch / Vegi
    frage_grund BOOLEAN NOT NULL DEFAULT false,         -- Frage nach Grund bei Absage
    dokument_url TEXT,                                  -- Link zu Dokument(en) / Google Drive
    details TEXT,                                       -- Beschreibungstext / Infos
    options JSONB NOT NULL DEFAULT '[]'::jsonb,         -- Array von Termin-Optionen [{id, datum, start, ende}]
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_events_datum ON public.poll_events(datum);
CREATE INDEX IF NOT EXISTS idx_poll_events_aktiv ON public.poll_events(aktiv);
CREATE INDEX IF NOT EXISTS idx_poll_events_gruppe ON public.poll_events(gruppe);
CREATE INDEX IF NOT EXISTS idx_poll_events_schiess ON public.poll_events(schiessanlass);

-- 2. RÜCKMELDUNGEN / RSVPS (POLL_RESPONSES)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poll_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) NOT NULL REFERENCES public.poll_events(id) ON DELETE CASCADE,
    lizenz VARCHAR(20) NOT NULL,                        -- 6-stellige SSV-Lizenznummer
    attending BOOLEAN NOT NULL DEFAULT false,           -- Zusage (true) / Absage (false)
    count INTEGER NOT NULL DEFAULT 1,                   -- Anzahl Personen (1 = Mitglied, >1 mit Begleitung)
    essen INTEGER NOT NULL DEFAULT 0,                   -- Anzahl Standard-/Fleisch-Menüs
    vegi INTEGER NOT NULL DEFAULT 0,                    -- Anzahl Vegi-Menüs
    grund TEXT,                                         -- Begründung bei Absage oder Notiz
    optionids TEXT,                                     -- Gewählte Poll-Optionen (z.B. 'opt_1,opt_2')
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_poll_response_event_lizenz UNIQUE (event_id, lizenz)
);

CREATE INDEX IF NOT EXISTS idx_poll_responses_event ON public.poll_responses(event_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_lizenz ON public.poll_responses(lizenz);
CREATE INDEX IF NOT EXISTS idx_poll_responses_attending ON public.poll_responses(attending);

-- 3. TRACKING VON AUFRUFEN (POLL_VIEWS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poll_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) NOT NULL,
    lizenz VARCHAR(20) NOT NULL,
    zeitpunkt TIMESTAMPTZ NOT NULL DEFAULT now(),
    info VARCHAR(255) NOT NULL DEFAULT 'Gesehen'
);

CREATE INDEX IF NOT EXISTS idx_poll_views_event ON public.poll_views(event_id);
CREATE INDEX IF NOT EXISTS idx_poll_views_lizenz ON public.poll_views(lizenz);
CREATE INDEX IF NOT EXISTS idx_poll_views_zeit ON public.poll_views(zeitpunkt);

-- 4. ÄNDERUNGS- UND AUDIT-LOG (POLL_RESPONSES_LOG)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poll_responses_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) NOT NULL,
    lizenz VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL DEFAULT 'rsvp',         -- 'rsvp', 'reset_to_open', 'delete'
    count INTEGER NOT NULL DEFAULT 1,
    essen INTEGER NOT NULL DEFAULT 0,
    vegi INTEGER NOT NULL DEFAULT 0,
    grund TEXT,
    zeitstempel TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_log_event ON public.poll_responses_log(event_id);
CREATE INDEX IF NOT EXISTS idx_poll_log_lizenz ON public.poll_responses_log(lizenz);
CREATE INDEX IF NOT EXISTS idx_poll_log_zeit ON public.poll_responses_log(zeitstempel);

-- 5. ROW LEVEL SECURITY (RLS) & POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.poll_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_responses_log ENABLE ROW LEVEL SECURITY;

-- Dev-Policies für anon und authenticated (für Vorstand & Mitglieder-App)
DROP POLICY IF EXISTS poll_events_anon_all ON public.poll_events;
CREATE POLICY poll_events_anon_all ON public.poll_events
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS poll_responses_anon_all ON public.poll_responses;
CREATE POLICY poll_responses_anon_all ON public.poll_responses
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS poll_views_anon_all ON public.poll_views;
CREATE POLICY poll_views_anon_all ON public.poll_views
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS poll_responses_log_anon_all ON public.poll_responses_log;
CREATE POLICY poll_responses_log_anon_all ON public.poll_responses_log
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Trigger für automatischen updated_at Timestamp
CREATE OR REPLACE FUNCTION public.set_poll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_poll_events_updated_at ON public.poll_events;
CREATE TRIGGER trg_poll_events_updated_at
    BEFORE UPDATE ON public.poll_events
    FOR EACH ROW EXECUTE FUNCTION public.set_poll_updated_at();

DROP TRIGGER IF EXISTS trg_poll_responses_updated_at ON public.poll_responses;
CREATE TRIGGER trg_poll_responses_updated_at
    BEFORE UPDATE ON public.poll_responses
    FOR EACH ROW EXECUTE FUNCTION public.set_poll_updated_at();
