-- ==============================================================================
-- 14_system_mail_configs.sql
-- Migration: Fachmodul SYSTEM-MAIL-KONFIGURATION (Phase 14)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Zweck:
--   Speichert alle Mail-Verteiler-Konfigurationen (bisher in Google Sheets
--   "App_Info"-Tab). GAS-Skripte lesen künftig via Supabase REST-API,
--   das Vorstand-Portal schreibt direkt in Supabase (Supabase-First).
--
-- Tabellen:
--   1. public.system_mail_configs – Mail-Verteiler je Systemereignis
--
-- Design-Entscheidungen:
--   - schluessel ist UNIQUE (entspricht Spalte A im alten App_Info-Sheet)
--   - mailadresse bleibt als TEXT mit Semikolon-Trennung (GAS-Kompatibilität)
--   - anon-SELECT erlaubt, damit GAS ohne JWT lesen kann
--   - UPDATE/INSERT/DELETE nur für authenticated (Vorstand-Portal)
-- ==============================================================================

-- 1. TABELLE: public.system_mail_configs (Mail-Verteiler)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_mail_configs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Eindeutiger Schlüssel (entspricht Spalte A "Bezeichnung" im App_Info-Sheet)
    schluessel      VARCHAR(100) NOT NULL UNIQUE,
    -- Beispiele: 'Info_Mail_Mannschaft', 'Info_Mail_Vereinswettschiessen'

    -- Anzeigename im Vorstand-Portal (lesbarer als der Schlüssel)
    bezeichnung     VARCHAR(255) NOT NULL DEFAULT '',

    -- Semikolon-getrennte Liste der Empfänger-Mailadressen
    mailadresse     TEXT        NOT NULL DEFAULT '',
    -- Beispiel: 'daniel.hunziker@gmail.com; vorstand@sportschuetzen-muhen.ch'

    -- Herkunfts-Modul für Gruppierung im UI
    modul           VARCHAR(100) NOT NULL DEFAULT 'allgemein',
    -- 'jahresmeisterschaft', 'vermietung', 'gv', 'termine', 'allgemein'

    -- Optionale Beschreibung / Hinweis für den Vorstand
    beschreibung    TEXT,

    -- Sortierung innerhalb des Moduls
    sort_order      INTEGER     NOT NULL DEFAULT 0,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_sys_mail_schluessel ON public.system_mail_configs(schluessel);
CREATE INDEX IF NOT EXISTS idx_sys_mail_modul      ON public.system_mail_configs(modul);
CREATE INDEX IF NOT EXISTS idx_sys_mail_sort       ON public.system_mail_configs(modul, sort_order);

COMMENT ON TABLE public.system_mail_configs IS
    'Mail-Verteiler-Konfiguration (Migration aus Google Sheets App_Info). '
    'GAS liest via REST-API (anon), Vorstand-Portal schreibt via Supabase-Client.';

COMMENT ON COLUMN public.system_mail_configs.schluessel   IS 'Eindeutiger Schlüssel, z.B. Info_Mail_Mannschaft (=Spalte A im alten App_Info-Sheet)';
COMMENT ON COLUMN public.system_mail_configs.mailadresse  IS 'Semikolon-getrennte Empfänger-Mailadressen';
COMMENT ON COLUMN public.system_mail_configs.modul        IS 'Herkunfts-Modul: jahresmeisterschaft, vermietung, gv, termine, allgemein';

-- ==============================================================================
-- 2. AUTO-UPDATE TRIGGER für updated_at
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_system_mail_configs_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sys_mail_updated_at ON public.system_mail_configs;
CREATE TRIGGER trg_sys_mail_updated_at
    BEFORE UPDATE ON public.system_mail_configs
    FOR EACH ROW EXECUTE FUNCTION public.update_system_mail_configs_timestamp();

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.system_mail_configs ENABLE ROW LEVEL SECURITY;

-- Lesen: anon darf lesen (damit GAS ohne JWT per REST lesen kann)
DROP POLICY IF EXISTS sys_mail_select_anon ON public.system_mail_configs;
CREATE POLICY sys_mail_select_anon ON public.system_mail_configs
    FOR SELECT
    TO anon
    USING (true);

-- Lesen: authenticated darf lesen
DROP POLICY IF EXISTS sys_mail_select_auth ON public.system_mail_configs;
CREATE POLICY sys_mail_select_auth ON public.system_mail_configs
    FOR SELECT
    TO authenticated
    USING (true);

-- Schreiben: authenticated und anon (Vorstand-Portal läuft mit ANON_KEY)
DROP POLICY IF EXISTS sys_mail_manage_auth ON public.system_mail_configs;
CREATE POLICY sys_mail_manage_auth ON public.system_mail_configs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS sys_mail_manage_anon ON public.system_mail_configs;
CREATE POLICY sys_mail_manage_anon ON public.system_mail_configs
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 4. RPC-FUNKTION: get_system_mail (für GAS-Lesezugriff via RPC)
-- ==============================================================================
-- Kann per GAS aufgerufen werden:
--   supabase.rpc('get_system_mail', { p_schluessel: 'Info_Mail_Mannschaft' })
-- Alternativ: direktes REST-GET auf die Tabelle (anon-SELECT erlaubt).
CREATE OR REPLACE FUNCTION public.get_system_mail(p_schluessel VARCHAR)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_mailadresse TEXT;
BEGIN
    SELECT mailadresse INTO v_mailadresse
    FROM public.system_mail_configs
    WHERE schluessel = p_schluessel;

    RETURN COALESCE(v_mailadresse, '');
END;
$$;

COMMENT ON FUNCTION public.get_system_mail IS
    'Gibt die semikolon-getrennte Mailadressliste für einen Schlüssel zurück. '
    'GAS-Aufruf: supabase.rpc(''get_system_mail'', {p_schluessel: ''Info_Mail_Mannschaft''})';

-- ==============================================================================
-- 5. SEED-DATEN (alle bekannten App_Info-Schlüssel)
-- ==============================================================================
INSERT INTO public.system_mail_configs
    (schluessel, bezeichnung, modul, beschreibung, sort_order, mailadresse)
VALUES
    -- Jahresmeisterschaft
    (
        'Info_Mail_Mannschaft',
        'Info-Mail: Mannschaftswettschiessen',
        'jahresmeisterschaft',
        'Empfänger der Benachrichtigung nach Mannschafts-Import (CSV)',
        10,
        ''
    ),
    (
        'Info_Mail_Vereinswettschiessen',
        'Info-Mail: Vereinswettschiessen',
        'jahresmeisterschaft',
        'Empfänger der Benachrichtigung nach Vereins-Import (CSV)',
        20,
        ''
    ),
    (
        'Info_Mail_Verbandswettschiessen',
        'Info-Mail: Verbandswettschiessen',
        'jahresmeisterschaft',
        'Empfänger der Benachrichtigung nach Verbands-Import (CSV)',
        30,
        ''
    ),
    (
        'Info_Mail_Kantonalstich',
        'Info-Mail: Kantonalstich',
        'jahresmeisterschaft',
        'Empfänger der Benachrichtigung nach Kantonalstich-Import (CSV)',
        40,
        ''
    ),
    (
        'Info_Mail_Gruppe',
        'Info-Mail: Gruppenmeisterschaft',
        'jahresmeisterschaft',
        'Empfänger der Benachrichtigung nach Gruppen-Import (CSV)',
        50,
        ''
    ),
    -- Vermietung
    (
        'Info_Mail_an_Wirtschaftsverantwortliche',
        'Info-Mail: Wirtschaftsverantwortliche (Vermietung)',
        'vermietung',
        'Empfänger der Benachrichtigung bei neuer Vermietungs-Anfrage',
        10,
        ''
    ),
    -- Allgemein
    (
        'Info_Mail_Vorstand',
        'Info-Mail: Vorstand (allgemein)',
        'allgemein',
        'Allgemeine Vorstand-Benachrichtigungen',
        10,
        ''
    ),
    (
        'Info_Mail_Aktuar',
        'Info-Mail: Aktuar',
        'allgemein',
        'Benachrichtigungen für den Aktuar (Protokolle, Anmeldungen)',
        20,
        ''
    )
ON CONFLICT (schluessel) DO NOTHING;
