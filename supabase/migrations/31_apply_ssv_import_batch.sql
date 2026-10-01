-- ==============================================================================
-- 31_apply_ssv_import_batch.sql
-- Migration: Atomarer Batch-SSV-Import für Stammdaten, Lizenzen, Funktionen & Training
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. Deduplizierung bestehender Daten vor Indexerstellung
DELETE FROM public.member_functions a
USING public.member_functions b
WHERE a.ctid < b.ctid
  AND a.person_number = b.person_number
  AND a.official_function_category = b.official_function_category
  AND COALESCE(a.official_function_entry_date, '1900-01-01'::DATE) = COALESCE(b.official_function_entry_date, '1900-01-01'::DATE);

DELETE FROM public.member_training a
USING public.member_training b
WHERE a.ctid < b.ctid
  AND a.person_number = b.person_number
  AND a.course_category = b.course_category
  AND a.module = b.module
  AND COALESCE(a.completed_training_date, '1900-01-01'::DATE) = COALESCE(b.completed_training_date, '1900-01-01'::DATE);

-- 2. Eindeutige Indizes für idempotentes Upserting
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_functions_unique 
ON public.member_functions(person_number, official_function_category, COALESCE(official_function_entry_date, '1900-01-01'::DATE));

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_training_unique 
ON public.member_training(person_number, course_category, module, COALESCE(completed_training_date, '1900-01-01'::DATE));

-- 3. Atomare Stored Procedure für Massenimport
CREATE OR REPLACE FUNCTION public.apply_ssv_import_batch(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_import_id VARCHAR(100);
    v_user VARCHAR(100);
    v_item JSONB;
    v_pn INTEGER;
    v_existing_member RECORD;
    v_created_members INTEGER := 0;
    v_updated_members INTEGER := 0;
    v_synced_licenses INTEGER := 0;
    v_synced_functions INTEGER := 0;
    v_synced_training INTEGER := 0;
    v_logged_history INTEGER := 0;
BEGIN
    v_import_id := COALESCE(p_payload->>'import_id', 'IMP-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS'));
    v_user := COALESCE(p_payload->>'user', 'Vorstand Admin');

    -- --------------------------------------------------------------------------
    -- 1. STAMMDATEN (public.members)
    -- --------------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'members', '[]'::jsonb))
    LOOP
        v_pn := (v_item->>'person_number')::INTEGER;
        IF v_pn IS NULL OR v_pn = 0 THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_existing_member FROM public.members WHERE person_number = v_pn;

        IF FOUND THEN
            -- UPDATE mit striktem Quellschutz für manuelle Einträge
            UPDATE public.members SET
                address_number = COALESCE(NULLIF(v_item->>'address_number', ''), address_number),
                salutation = COALESCE(v_item->>'salutation', salutation),
                first_name = COALESCE(NULLIF(v_item->>'first_name', ''), first_name),
                last_name = COALESCE(NULLIF(v_item->>'last_name', ''), last_name),
                company = v_item->>'company',
                addition = v_item->>'addition',
                street = v_item->>'street',
                post_code = v_item->>'post_code',
                city = v_item->>'city',
                country = COALESCE(v_item->>'country', 'CH'),
                business_landline_phone = v_item->>'business_landline_phone',
                business_mobile_phone = v_item->>'business_mobile_phone',
                private_landline_phone = v_item->>'private_landline_phone',
                private_mobile_phone = v_item->>'private_mobile_phone',
                primary_email = v_item->>'primary_email',
                additional_email = v_item->>'additional_email',
                webpage = v_item->>'webpage',
                gender = v_item->>'gender',
                birth_date = NULLIF(v_item->>'birth_date', '')::DATE,
                insurance_number = v_item->>'insurance_number',
                language = COALESCE(v_item->>'language', 'de'),
                nationality = COALESCE(v_item->>'nationality', 'Schweiz'),
                organization_number = v_item->>'organization_number',
                organization_name = v_item->>'organization_name',
                is_active = CASE 
                    WHEN v_item->>'is_active' IS NOT NULL THEN (v_item->>'is_active')::BOOLEAN 
                    ELSE is_active 
                END,
                -- Quellschutz: Wenn manuell gesetzt, nicht durch SSV überschreiben!
                is_passive = CASE 
                    WHEN v_existing_member.is_passive_source = 'manual' THEN v_existing_member.is_passive
                    WHEN v_item->>'is_passive' IS NOT NULL THEN (v_item->>'is_passive')::BOOLEAN
                    ELSE is_passive
                END,
                is_honorary = CASE
                    WHEN v_existing_member.is_honorary_source = 'manual' THEN v_existing_member.is_honorary
                    WHEN v_item->>'is_honorary' IS NOT NULL THEN (v_item->>'is_honorary')::BOOLEAN
                    ELSE is_honorary
                END,
                honorary_member_since = CASE
                    WHEN v_existing_member.is_honorary_source = 'manual' THEN v_existing_member.honorary_member_since
                    WHEN v_item->>'honorary_member_since' IS NOT NULL THEN NULLIF(v_item->>'honorary_member_since', '')::DATE
                    ELSE honorary_member_since
                END,
                first_club_entry_date_ssv = COALESCE(NULLIF(v_item->>'first_club_entry_date_ssv', '')::DATE, first_club_entry_date_ssv),
                deceased = CASE 
                    WHEN v_item->>'deceased' IS NOT NULL THEN (v_item->>'deceased')::BOOLEAN 
                    ELSE deceased 
                END,
                raw_data = COALESCE(v_item->'raw_data', raw_data),
                last_updated_by = 'SSV-Import (' || v_import_id || ')',
                synced_at = now(),
                updated_at = now()
            WHERE person_number = v_pn;

            v_updated_members := v_updated_members + 1;
        ELSE
            -- INSERT neues Mitglied
            INSERT INTO public.members (
                person_number, address_number, salutation, first_name, last_name,
                company, addition, street, post_code, city, country,
                business_landline_phone, business_mobile_phone, private_landline_phone, private_mobile_phone,
                primary_email, additional_email, webpage, gender, birth_date,
                insurance_number, language, nationality, organization_number, organization_name,
                is_active, is_passive, is_passive_source, is_honorary, is_honorary_source,
                honorary_member_since, first_club_entry_date_ssv, deceased,
                raw_data, last_updated_by, synced_at, created_at, updated_at
            ) VALUES (
                v_pn,
                v_item->>'address_number',
                v_item->>'salutation',
                COALESCE(v_item->>'first_name', ''),
                COALESCE(v_item->>'last_name', ''),
                v_item->>'company',
                v_item->>'addition',
                v_item->>'street',
                v_item->>'post_code',
                v_item->>'city',
                COALESCE(v_item->>'country', 'CH'),
                v_item->>'business_landline_phone',
                v_item->>'business_mobile_phone',
                v_item->>'private_landline_phone',
                v_item->>'private_mobile_phone',
                v_item->>'primary_email',
                v_item->>'additional_email',
                v_item->>'webpage',
                v_item->>'gender',
                NULLIF(v_item->>'birth_date', '')::DATE,
                v_item->>'insurance_number',
                COALESCE(v_item->>'language', 'de'),
                COALESCE(v_item->>'nationality', 'Schweiz'),
                v_item->>'organization_number',
                v_item->>'organization_name',
                COALESCE((v_item->>'is_active')::BOOLEAN, true),
                COALESCE((v_item->>'is_passive')::BOOLEAN, false),
                'ssv',
                COALESCE((v_item->>'is_honorary')::BOOLEAN, false),
                'ssv',
                NULLIF(v_item->>'honorary_member_since', '')::DATE,
                NULLIF(v_item->>'first_club_entry_date_ssv', '')::DATE,
                COALESCE((v_item->>'deceased')::BOOLEAN, false),
                v_item->'raw_data',
                'SSV-Import (' || v_import_id || ')',
                now(), now(), now()
            );

            v_created_members := v_created_members + 1;
        END IF;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- 2. LIZENZEN (public.member_licenses)
    -- --------------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'licenses', '[]'::jsonb))
    LOOP
        INSERT INTO public.member_licenses (
            person_number, membership_category, entry_date, exit_date,
            license_category, license_type, license_invoicing_club_number, license_invoicing_club_name,
            is_active, import_quelle, last_updated, updated_at
        ) VALUES (
            (v_item->>'person_number')::INTEGER,
            v_item->>'membership_category',
            NULLIF(v_item->>'entry_date', '')::DATE,
            NULLIF(v_item->>'exit_date', '')::DATE,
            v_item->>'license_category',
            v_item->>'license_type',
            v_item->>'license_invoicing_club_number',
            v_item->>'license_invoicing_club_name',
            COALESCE((v_item->>'is_active')::BOOLEAN, true),
            COALESCE(v_item->>'import_quelle', 'SSV-Import'),
            now(), now()
        )
        ON CONFLICT (person_number, membership_category, entry_date)
        DO UPDATE SET
            exit_date = EXCLUDED.exit_date,
            license_category = EXCLUDED.license_category,
            license_type = EXCLUDED.license_type,
            license_invoicing_club_number = EXCLUDED.license_invoicing_club_number,
            license_invoicing_club_name = EXCLUDED.license_invoicing_club_name,
            is_active = EXCLUDED.is_active,
            import_quelle = EXCLUDED.import_quelle,
            last_updated = now(),
            updated_at = now();

        v_synced_licenses := v_synced_licenses + 1;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- 3. FUNKTIONEN (public.member_functions)
    -- --------------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'functions', '[]'::jsonb))
    LOOP
        DECLARE
            v_fn_cat VARCHAR := v_item->>'official_function_category';
            v_fn_entry DATE := NULLIF(v_item->>'official_function_entry_date', '')::DATE;
            v_fn_exit DATE := NULLIF(v_item->>'official_function_exit_date', '')::DATE;
            v_fn_rabatt VARCHAR;
        BEGIN
            IF v_fn_cat ILIKE '%hausmeister%' THEN
                v_fn_rabatt := 'RA002';
            ELSIF v_fn_cat ILIKE '%präsident%' 
               OR v_fn_cat ILIKE '%kassier%' 
               OR v_fn_cat ILIKE '%aktuar%' 
               OR v_fn_cat ILIKE '%schützenmeister%' 
               OR v_fn_cat ILIKE '%leiter%' 
               OR v_fn_cat ILIKE '%vorstand%' 
               OR v_fn_cat ILIKE '%beisitzer%' 
               OR v_fn_cat ILIKE '%mitgliederverwalter%' 
               OR ((v_item->>'use_on_board_and_functionary_report')::BOOLEAN IS TRUE) THEN
                v_fn_rabatt := 'RA001';
            ELSE
                v_fn_rabatt := v_item->>'rabattkategorie';
            END IF;

            INSERT INTO public.member_functions (
                person_number, official_function_category, official_function_remark,
                official_function_entry_date, official_function_exit_date,
                use_on_board_and_functionary_report, rabattkategorie,
                import_quelle, last_updated, updated_at
            ) VALUES (
                (v_item->>'person_number')::INTEGER,
                v_fn_cat,
                v_item->>'official_function_remark',
                v_fn_entry,
                v_fn_exit,
                COALESCE((v_item->>'use_on_board_and_functionary_report')::BOOLEAN, false),
                v_fn_rabatt,
                COALESCE(v_item->>'import_quelle', 'SSV-Import'),
                now(), now()
            )
            ON CONFLICT (person_number, official_function_category, COALESCE(official_function_entry_date, '1900-01-01'::DATE))
            DO UPDATE SET
                official_function_remark = EXCLUDED.official_function_remark,
                official_function_exit_date = EXCLUDED.official_function_exit_date,
                use_on_board_and_functionary_report = EXCLUDED.use_on_board_and_functionary_report,
                rabattkategorie = COALESCE(v_fn_rabatt, public.member_functions.rabattkategorie),
                import_quelle = EXCLUDED.import_quelle,
                last_updated = now(),
                updated_at = now();

            v_synced_functions := v_synced_functions + 1;
        END;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- 4. TRAINING / AUSBILDUNG (public.member_training)
    -- --------------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'training', '[]'::jsonb))
    LOOP
        INSERT INTO public.member_training (
            person_number, course_category, module, completed_training_date,
            training_status, completed_training_expiration_date,
            last_updated
        ) VALUES (
            (v_item->>'person_number')::INTEGER,
            v_item->>'course_category',
            v_item->>'module',
            NULLIF(v_item->>'completed_training_date', '')::DATE,
            v_item->>'training_status',
            NULLIF(v_item->>'completed_training_expiration_date', '')::DATE,
            now()
        )
        ON CONFLICT (person_number, course_category, module, COALESCE(completed_training_date, '1900-01-01'::DATE))
        DO UPDATE SET
            training_status = EXCLUDED.training_status,
            completed_training_expiration_date = EXCLUDED.completed_training_expiration_date,
            last_updated = now();

        v_synced_training := v_synced_training + 1;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- 5. REVISIONS-HISTORIE (public.member_history)
    -- --------------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'history', '[]'::jsonb))
    LOOP
        INSERT INTO public.member_history (
            person_number, name, datum, ereignistyp, alterwert, neuerwert,
            source, importid, erfasstvon
        ) VALUES (
            (v_item->>'person_number')::INTEGER,
            v_item->>'name',
            COALESCE(NULLIF(v_item->>'datum', '')::DATE, CURRENT_DATE),
            COALESCE(v_item->>'ereignistyp', 'AENDERUNG'),
            v_item->>'alterwert',
            v_item->>'neuerwert',
            COALESCE(v_item->>'source', 'SSV-Import'),
            v_import_id,
            COALESCE(v_item->>'erfasstvon', v_user)
        );

        v_logged_history := v_logged_history + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'import_id', v_import_id,
        'members_created', v_created_members,
        'members_updated', v_updated_members,
        'licenses_synced', v_synced_licenses,
        'functions_synced', v_synced_functions,
        'training_synced', v_synced_training,
        'history_logged', v_logged_history,
        'message', 'SSV-Batch erfolgreich persistiert (' || 
                   v_created_members || ' neu, ' || 
                   v_updated_members || ' aktualisiert, ' || 
                   v_synced_licenses || ' Lizenzen, ' ||
                   v_synced_functions || ' Funktionen).'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_ssv_import_batch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ssv_import_batch(JSONB) TO anon;
