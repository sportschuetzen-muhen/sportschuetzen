-- ==============================================================================
-- 140_harden_website_documents_storage_and_rls.sql
-- Migration: Sicherheits-Haertung Website, Archiv, Storage & Rest-Dev-Policies
-- Projekt: Vereinsportal Sportschuetzen Muhen
--
-- Behebt kritische Befunde aus dem Website- & Sicherheits-Audit:
--   1. Entfernt offene Dev-/Anon-Policies auf public.documents & document_chunks
--      (bisher waren alle 818 vertraulichen Vorstandsdokumente fuer anon les-/schreibbar).
--   2. Setzt Storage Bucket 'club-documents' auf privat (public = false) mit
--      strikten RLS-Policies fuer authenticated (Members vs. Vorstand RBAC).
--   3. Entfernt offene anon-Schreib/Lese-Policies auf 'operatives-storage' und
--      'jm-ranglisten' (oeffentliche Vorstands-Avatare & Vereinslogo bleiben lesbar).
--   4. Haertet public.system_app_configs (keine Secrets fuer anon abrufbar).
--   5. Entfernt members_anon_select (kein PII-/IBAN-/PIN-Leak fuer anon) und
--      stellt fuer resultate.html (Endschiessen) eine minimale SECURITY-DEFINER-RPC
--      get_endschiessen_public_results(TEXT) bereit.
--   6. Aktiviert RLS auf public.members_backup_pre_access_20261107 (ohne anon/auth Zugriff).
--   7. Beschraenkt public.gallery_albums fuer anon auf visibility = 'public'.
--   8. Entfernt verbliebene Dev-/Anon-/Public-Altpolicies auf FiBu-, Beitrags-,
--      Vorlagen-, Gebuehren-, GV- und System-Mail-Tabellen (RBAC-Policies bestehen).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. public.documents & public.document_chunks + search_archive_fulltext
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Dev Anon documents write" ON public.documents;
DROP POLICY IF EXISTS "Dev anon manage chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Members can view chunks" ON public.document_chunks;

CREATE POLICY "Members can view chunks"
  ON public.document_chunks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND (
          d.visibility IN ('public', 'members')
          OR (SELECT public.rbac_allows(ARRAY['dokumente.view', 'dokumente.manage', 'archiv.view', 'archiv.manage', 'vorstand.view', 'admin']))
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_documents_storage_path ON public.documents(storage_path);

REVOKE ALL ON FUNCTION public.search_archive_fulltext(TEXT, VARCHAR, INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_archive_fulltext(TEXT, VARCHAR, INT, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. Storage Buckets & storage.objects RLS ('club-documents', 'operatives-storage', 'jm-ranglisten')
-- ------------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id = 'club-documents';

DROP POLICY IF EXISTS "Public read access for club-documents" ON storage.objects;
DROP POLICY IF EXISTS "Manage access for club-documents" ON storage.objects;
DROP POLICY IF EXISTS "club_documents_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "club_documents_rbac_write" ON storage.objects;

CREATE POLICY "club_documents_auth_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'club-documents'
    AND (
      (SELECT public.rbac_allows(ARRAY['archiv.view', 'archiv.manage', 'dokumente.view', 'dokumente.manage', 'vorstand.view', 'admin']))
      OR EXISTS (
        SELECT 1
        FROM public.documents d
        WHERE d.visibility IN ('public', 'members')
          AND d.storage_path = storage.objects.name
      )
    )
  );

CREATE POLICY "club_documents_rbac_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'club-documents'
    AND (SELECT public.rbac_allows(ARRAY['archiv.manage', 'dokumente.manage', 'admin']))
  )
  WITH CHECK (
    bucket_id = 'club-documents'
    AND (SELECT public.rbac_allows(ARRAY['archiv.manage', 'dokumente.manage', 'admin']))
  );

-- operatives-storage: Dev-Anon-Vollzugriff entfernen, nur Vorstands-Avatare/Logo oeffentlich lesbar
DROP POLICY IF EXISTS "Dev Anon operatives-storage" ON storage.objects;
DROP POLICY IF EXISTS "Public Read operatives-storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Insert operatives-storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update operatives-storage" ON storage.objects;
DROP POLICY IF EXISTS "operatives_storage_public_avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "operatives_storage_rbac_select" ON storage.objects;
DROP POLICY IF EXISTS "operatives_storage_rbac_write" ON storage.objects;

CREATE POLICY "operatives_storage_public_avatars_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'operatives-storage'
    AND (name LIKE 'avatars/%' OR name = 'assets/logo.png')
  );

CREATE POLICY "operatives_storage_rbac_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'operatives-storage'
    AND (
      name LIKE 'avatars/%'
      OR name = 'assets/logo.png'
      OR (SELECT public.rbac_allows(ARRAY[
        'rechnungen.view', 'rechnungen.manage',
        'vermietung.view', 'vermietung.manage',
        'jahresbeitrag.view', 'jahresbeitrag.manage',
        'umfragen.view', 'umfragen.manage',
        'gv.view', 'gv.manage',
        'endschiessen.view', 'endschiessen.manage',
        'members.view', 'members.manage',
        'archiv.view', 'archiv.manage',
        'dokumente.view', 'dokumente.manage',
        'vorstand.view', 'admin'
      ]))
    )
  );

CREATE POLICY "operatives_storage_rbac_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'operatives-storage'
    AND (SELECT public.rbac_allows(ARRAY[
      'rechnungen.manage', 'vermietung.manage', 'jahresbeitrag.manage',
      'umfragen.manage', 'gv.manage', 'endschiessen.manage',
      'members.manage', 'archiv.manage', 'dokumente.manage', 'admin'
    ]))
  )
  WITH CHECK (
    bucket_id = 'operatives-storage'
    AND (SELECT public.rbac_allows(ARRAY[
      'rechnungen.manage', 'vermietung.manage', 'jahresbeitrag.manage',
      'umfragen.manage', 'gv.manage', 'endschiessen.manage',
      'members.manage', 'archiv.manage', 'dokumente.manage', 'admin'
    ]))
  );

-- jm-ranglisten: Anon-Vollzugriff entfernen
DROP POLICY IF EXISTS "JM Ranglisten Cockpit Anon All" ON storage.objects;
DROP POLICY IF EXISTS "JM Ranglisten Authenticated All" ON storage.objects;
DROP POLICY IF EXISTS "jm_ranglisten_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "jm_ranglisten_rbac_write" ON storage.objects;

CREATE POLICY "jm_ranglisten_auth_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'jm-ranglisten');

CREATE POLICY "jm_ranglisten_rbac_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'jm-ranglisten'
    AND (SELECT public.rbac_allows(ARRAY['jahresmeisterschaft.manage', 'resultate.manage', 'admin']))
  )
  WITH CHECK (
    bucket_id = 'jm-ranglisten'
    AND (SELECT public.rbac_allows(ARRAY['jahresmeisterschaft.manage', 'resultate.manage', 'admin']))
  );

-- ------------------------------------------------------------------------------
-- 3. public.system_app_configs: API-Secrets fuer anon & normale Mitglieder sperren
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Dev anon manage app configs" ON public.system_app_configs;
DROP POLICY IF EXISTS "Anyone can read system app configs" ON public.system_app_configs;
DROP POLICY IF EXISTS "system_app_configs_public_read" ON public.system_app_configs;
DROP POLICY IF EXISTS "system_app_configs_auth_read" ON public.system_app_configs;

CREATE POLICY "system_app_configs_public_read"
  ON public.system_app_configs FOR SELECT
  TO anon
  USING (
    key IN (
      'active_festkasse_event_id',
      'festkasse_printer_cert',
      'member_schichtplan_enabled',
      'member_festkasse_enabled',
      'onesignal_app_id'
    )
  );

CREATE POLICY "system_app_configs_auth_read"
  ON public.system_app_configs FOR SELECT
  TO authenticated
  USING (
    key NOT IN ('onesignal_rest_api_key', 'archiv_ai_token')
    OR (SELECT public.rbac_allows(ARRAY['archiv.view', 'archiv.manage', 'dokumente.view', 'dokumente.manage', 'mail.manage', 'vorstand.view', 'admin']))
  );

-- ------------------------------------------------------------------------------
-- 4. public.members, Backup-Tabelle & sichere Endschiessen-RPC
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS members_anon_select ON public.members;

DO $$
BEGIN
  IF to_regclass('public.members_backup_pre_access_20261107') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.members_backup_pre_access_20261107 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.members_backup_pre_access_20261107 FROM anon, authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_endschiessen_public_results(p_year TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_season RECORD;
  v_stiche JSONB;
  v_scores JSONB;
  v_finals JSONB;
BEGIN
  IF p_year IS NULL OR btrim(p_year) = '' OR lower(btrim(p_year)) IN ('aktuell', 'current') THEN
    SELECT * INTO v_season
    FROM public.endschiessen_seasons
    WHERE is_published = true
    ORDER BY jahr DESC
    LIMIT 1;
  ELSE
    SELECT * INTO v_season
    FROM public.endschiessen_seasons
    WHERE jahr = btrim(p_year)
      AND is_published = true
    LIMIT 1;
  END IF;

  IF v_season IS NULL THEN
    RETURN jsonb_build_object(
      'published', false,
      'season', NULL,
      'stiche', '[]'::jsonb,
      'scores', '[]'::jsonb,
      'finals', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(st) ORDER BY st.sort_order ASC), '[]'::jsonb)
  INTO v_stiche
  FROM public.endschiessen_stiche st
  WHERE st.jahr = v_season.jahr
    AND st.is_active = true;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sc.id,
      'jahr', sc.jahr,
      'stich_id', sc.stich_id,
      'guest_name', sc.guest_name,
      'passe_1_score', sc.passe_1_score,
      'passe_1_decimal', sc.passe_1_decimal,
      'passe_2_score', sc.passe_2_score,
      'passe_2_decimal', sc.passe_2_decimal,
      'total_score', sc.total_score,
      'total_decimal', sc.total_decimal,
      'target_score', sc.target_score,
      'diff_score', sc.diff_score,
      'tiefschuss', sc.tiefschuss,
      'rang_total', sc.rang_total,
      'rang_decimal', sc.rang_decimal,
      'member', CASE
        WHEN m.person_number IS NOT NULL THEN jsonb_build_object(
          'first_name', m.first_name,
          'last_name', m.last_name,
          'birth_year', EXTRACT(YEAR FROM m.birth_date)::INT
        )
        ELSE NULL
      END
    )
  ), '[]'::jsonb)
  INTO v_scores
  FROM public.endschiessen_scores sc
  LEFT JOIN public.members m ON m.person_number = sc.person_number
  WHERE sc.jahr = v_season.jahr;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', fs.id,
      'jahr', fs.jahr,
      'start_rang', fs.start_rang,
      'serie_1', fs.serie_1,
      'serie_2', fs.serie_2,
      'serie_3', fs.serie_3,
      'serie_4', fs.serie_4,
      'serie_5', fs.serie_5,
      'serie_6', fs.serie_6,
      'serie_7', fs.serie_7,
      'serie_8', fs.serie_8,
      'total_score', fs.total_score,
      'final_rang', fs.final_rang,
      'is_eliminated', fs.is_eliminated,
      'eliminated_in_serie', fs.eliminated_in_serie,
      'member', CASE
        WHEN m.person_number IS NOT NULL THEN jsonb_build_object(
          'first_name', m.first_name,
          'last_name', m.last_name
        )
        ELSE NULL
      END
    ) ORDER BY fs.final_rang ASC NULLS LAST
  ), '[]'::jsonb)
  INTO v_finals
  FROM public.endschiessen_final_series fs
  LEFT JOIN public.members m ON m.person_number = fs.person_number
  WHERE fs.jahr = v_season.jahr;

  RETURN jsonb_build_object(
    'published', true,
    'season', to_jsonb(v_season),
    'stiche', v_stiche,
    'scores', v_scores,
    'finals', v_finals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_endschiessen_public_results(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_endschiessen_public_results(TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. public.gallery_albums fuer anon auf oeffentliche Alben beschraenken
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS anon_select_all_gallery_albums ON public.gallery_albums;
DROP POLICY IF EXISTS anon_select_public_gallery_albums ON public.gallery_albums;

CREATE POLICY anon_select_public_gallery_albums
  ON public.gallery_albums FOR SELECT
  TO anon
  USING (visibility = 'public');

-- ------------------------------------------------------------------------------
-- 6. Verbliebene Alt-/Dev-Policies auf FiBu-, Beitrags-, Vorlagen-, GV- & Mail-Tabellen entfernen
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS acc_accounts_select ON public.accounting_accounts;
DROP POLICY IF EXISTS acc_accounts_write ON public.accounting_accounts;
DROP POLICY IF EXISTS acc_bank_rules_select ON public.accounting_bank_rules;
DROP POLICY IF EXISTS acc_bank_rules_write ON public.accounting_bank_rules;
DROP POLICY IF EXISTS acc_budgets_select ON public.accounting_budgets;
DROP POLICY IF EXISTS acc_budgets_write ON public.accounting_budgets;
DROP POLICY IF EXISTS acc_journal_select ON public.accounting_journal;
DROP POLICY IF EXISTS acc_journal_write ON public.accounting_journal;

DROP POLICY IF EXISTS accounting_cost_allocations_select ON public.accounting_cost_allocations;
CREATE POLICY accounting_cost_allocations_select
  ON public.accounting_cost_allocations FOR SELECT
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY['buchhaltung.view', 'buchhaltung.manage'])));

DROP POLICY IF EXISTS contributions_head_anon_all ON public.contributions_header;
DROP POLICY IF EXISTS contributions_head_select ON public.contributions_header;
DROP POLICY IF EXISTS contributions_pos_anon_all ON public.contributions_positions;
DROP POLICY IF EXISTS contributions_pos_select ON public.contributions_positions;

DROP POLICY IF EXISTS doc_gen_logs_dev_anon ON public.document_generation_logs;
DROP POLICY IF EXISTS doc_gen_logs_authenticated ON public.document_generation_logs;

DROP POLICY IF EXISTS doc_clauses_read_anon ON public.document_template_clauses;
DROP POLICY IF EXISTS doc_clauses_write_anon ON public.document_template_clauses;
DROP POLICY IF EXISTS doc_clauses_read_auth ON public.document_template_clauses;
DROP POLICY IF EXISTS doc_clauses_write_auth ON public.document_template_clauses;

DROP POLICY IF EXISTS doc_templates_read_anon ON public.document_templates;
DROP POLICY IF EXISTS doc_templates_write_anon ON public.document_templates;
DROP POLICY IF EXISTS doc_templates_read_auth ON public.document_templates;
DROP POLICY IF EXISTS doc_templates_write_auth ON public.document_templates;

DROP POLICY IF EXISTS gebuehren_config_anon_all ON public.gebuehren_config;
DROP POLICY IF EXISTS gebuehren_config_select ON public.gebuehren_config;

DROP POLICY IF EXISTS "Authorized roles can manage gv_instances" ON public.gv_instances;
DROP POLICY IF EXISTS "Public and Members can read gv_instances" ON public.gv_instances;
DROP POLICY IF EXISTS "Authorized roles can manage gv_praesenz" ON public.gv_praesenz;
DROP POLICY IF EXISTS "Public and Members can read gv_praesenz" ON public.gv_praesenz;
DROP POLICY IF EXISTS "Authorized roles can manage gv_traktanden" ON public.gv_traktanden;
DROP POLICY IF EXISTS "Public and Members can read gv_traktanden" ON public.gv_traktanden;

DROP POLICY IF EXISTS sys_mail_manage_anon ON public.system_mail_configs;
DROP POLICY IF EXISTS sys_mail_select_anon ON public.system_mail_configs;

NOTIFY pgrst, 'reload schema';

COMMIT;
