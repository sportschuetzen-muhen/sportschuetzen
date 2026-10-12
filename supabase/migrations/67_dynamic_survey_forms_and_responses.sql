-- ==============================================================================
-- 67_dynamic_survey_forms_and_responses.sql
-- Migration: Dynamischer Formularbaukasten für Umfragen & Anlässe (Ebene 3)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Erweitert:
-- 1. public.poll_events um:
--    - questions_schema (JSONB Array von konfigurierbaren Fragen)
--    - event_type (VARCHAR(50) DEFAULT 'standard')
-- 2. public.poll_responses um:
--    - answers (JSONB Key-Value Store für Mitglieds-Antworten)
-- ==============================================================================

-- 1. SPALTEN ERWEITERN (Idempotent)
ALTER TABLE public.poll_events
    ADD COLUMN IF NOT EXISTS questions_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.poll_events
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) NOT NULL DEFAULT 'standard';

ALTER TABLE public.poll_responses
    ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. INDIZES FÜR SCHNELLE JSONB-FILTERUNG
CREATE INDEX IF NOT EXISTS idx_poll_events_event_type ON public.poll_events(event_type);
CREATE INDEX IF NOT EXISTS idx_poll_events_questions_schema ON public.poll_events USING gin (questions_schema);
CREATE INDEX IF NOT EXISTS idx_poll_responses_answers ON public.poll_responses USING gin (answers);

-- 3. SCHEMA CACHE RELOAD FÜR POSTGREST
NOTIFY pgrst, 'reload schema';
