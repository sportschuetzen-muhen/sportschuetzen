-- Migration 128: Harden apply_ssv_import_batch (RBAC + partial/ABGANG protection)
-- and add explicit deactivation/closure of dropped SSV licenses & functions.

CREATE OR REPLACE FUNCTION public.apply_ssv_import_batch(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, auth, pg_temp
AS $function$
DECLARE
    v_import_id VARCHAR(100);
    v_user VARCHAR(100);
    v_item JSONB;
    v_pn INTEGER;
    v_existing_member RECORD;
    v_created_members INTEGER := 0;
    v_updated_members INTEGER := 0;
    v_synced_licenses INTEGER := 0;
    v_deactivated_licenses INTEGER := 0;
    v_synced_functions INTEGER := 0;
    v_closed_functions INTEGER := 0;
    v_synced_training INTEGER := 0;
    v_logged_history INTEGER := 0;
    v_row_count INTEGER := 0;
BEGIN
    -- RBAC / Authentifizierungs-Check (Service-Role / SQL-Admin erlaubt, sonst members.manage / admin Pflicht)
    IF auth.uid() IS NULL THEN
        IF COALESCE(current_setting('role', true), '') != 'service_role'
           AND session_user NOT IN ('postgres', 'supabase_admin') THEN
            RAISE EXCEPTION 'Nicht authentifiziert: SSV-Import erfordert eine gültige Anmeldung.' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT (public.rbac_allows(ARRAY['members.manage']) OR auth.has_role('admin')) THEN
        RAISE EXCEPTION 'Keine Berechtigung für den SSV-Import (members.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

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
            IF COALESCE((v_item->>'_abgang_only')::BOOLEAN, false) IS TRUE THEN
                -- ABGANG: Nur Aktiv-Status schliessen, bestehende Stammdaten schützen,
                -- und alle offenen SSV-Lizenzen/Funktionen dieses Mitglieds sauber beenden.
                UPDATE public.members SET
                    is_active = COALESCE((v_item->>'is_active')::BOOLEAN, false),
                    last_updated_by = 'SSV-Import (' || v_import_id || ')',
                    synced_at = now(),
                    updated_at = now()
                WHERE person_number = v_pn;

                UPDATE public.member_licenses SET
                    is_active = false,
                    exit_date = COALESCE(exit_date, CURRENT_DATE),
                    last_updated = now(),
                    updated_at = now()
                WHERE person_number = v_pn
                  AND (is_active IS TRUE OR exit_date IS NULL);
                GET DIAGNOSTICS v_row_count = ROW_COUNT;
                v_deactivated_licenses := v_deactivated_licenses + v_row_count;

                UPDATE public.member_functions SET
                    official_function_exit_date = COALESCE(official_function_exit_date, CURRENT_DATE),
                    last_updated = now(),
                    updated_at = now()
                WHERE person_number = v_pn
                  AND official_function_exit_date IS NULL;
                GET DIAGNOSTICS v_row_count = ROW_COUNT;
                v_closed_functions := v_closed_functions + v_row_count;

                v_updated_members := v_updated_members + 1;
            ELSE
                -- UPDATE mit selektivem Feld-Check (nur mitgelieferte Felder anfassen) & Quellschutz
                UPDATE public.members SET
                    address_number = CASE WHEN v_item ? 'address_number' THEN COALESCE(NULLIF(v_item->>'address_number', ''), address_number) ELSE address_number END,
                    salutation = CASE WHEN v_item ? 'salutation' THEN COALESCE(NULLIF(v_item->>'salutation', ''), salutation) ELSE salutation END,
                    first_name = CASE WHEN v_item ? 'first_name' THEN COALESCE(NULLIF(v_item->>'first_name', ''), first_name) ELSE first_name END,
                    last_name = CASE WHEN v_item ? 'last_name' THEN COALESCE(NULLIF(v_item->>'last_name', ''), last_name) ELSE last_name END,
                    company = CASE WHEN v_item ? 'company' THEN v_item->>'company' ELSE company END,
                    addition = CASE WHEN v_item ? 'addition' THEN v_item->>'addition' ELSE addition END,
                    street = CASE WHEN v_item ? 'street' THEN v_item->>'street' ELSE street END,
                    post_code = CASE WHEN v_item ? 'post_code' THEN v_item->>'post_code' ELSE post_code END,
                    city = CASE WHEN v_item ? 'city' THEN v_item->>'city' ELSE city END,
                    country = CASE WHEN v_item ? 'country' THEN COALESCE(NULLIF(v_item->>'country', ''), country, 'CH') ELSE country END,
                    business_landline_phone = CASE WHEN v_item ? 'business_landline_phone' THEN v_item->>'business_landline_phone' ELSE business_landline_phone END,
                    business_mobile_phone = CASE WHEN v_item ? 'business_mobile_phone' THEN v_item->>'business_mobile_phone' ELSE business_mobile_phone END,
                    private_landline_phone = CASE WHEN v_item ? 'private_landline_phone' THEN v_item->>'private_landline_phone' ELSE private_landline_phone END,
                    private_mobile_phone = CASE WHEN v_item ? 'private_mobile_phone' THEN v_item->>'private_mobile_phone' ELSE private_mobile_phone END,
                    primary_email = CASE WHEN v_item ? 'primary_email' THEN v_item->>'primary_email' ELSE primary_email END,
                    additional_email = CASE WHEN v_item ? 'additional_email' THEN v_item->>'additional_email' ELSE additional_email END,
                    webpage = CASE WHEN v_item ? 'webpage' THEN v_item->>'webpage' ELSE webpage END,
                    gender = CASE WHEN v_item ? 'gender' THEN v_item->>'gender' ELSE gender END,
                    birth_date = CASE WHEN v_item ? 'birth_date' THEN NULLIF(v_item->>'birth_date', '')::DATE ELSE birth_date END,
                    insurance_number = CASE WHEN v_item ? 'insurance_number' THEN v_item->>'insurance_number' ELSE insurance_number END,
                    language = CASE WHEN v_item ? 'language' THEN COALESCE(NULLIF(v_item->>'language', ''), language, 'de') ELSE language END,
                    nationality = CASE WHEN v_item ? 'nationality' THEN COALESCE(NULLIF(v_item->>'nationality', ''), nationality, 'Schweiz') ELSE nationality END,
                    organization_number = CASE WHEN v_item ? 'organization_number' THEN COALESCE(NULLIF(v_item->>'organization_number', ''), organization_number) ELSE organization_number END,
                    organization_name = CASE WHEN v_item ? 'organization_name' THEN COALESCE(NULLIF(v_item->>'organization_name', ''), organization_name) ELSE organization_name END,
                    is_active = CASE
                        WHEN v_item ? 'is_active' AND v_item->>'is_active' IS NOT NULL THEN (v_item->>'is_active')::BOOLEAN
                        ELSE is_active
                    END,
                    -- Quellschutz: Wenn manuell gesetzt, nicht durch SSV überschreiben!
                    is_passive = CASE
                        WHEN v_existing_member.is_passive_source = 'manual' THEN v_existing_member.is_passive
                        WHEN v_item ? 'is_passive' AND v_item->>'is_passive' IS NOT NULL THEN (v_item->>'is_passive')::BOOLEAN
                        ELSE is_passive
                    END,
                    is_honorary = CASE
                        WHEN v_existing_member.is_honorary_source = 'manual' THEN v_existing_member.is_honorary
                        WHEN v_item ? 'is_honorary' AND v_item->>'is_honorary' IS NOT NULL THEN (v_item->>'is_honorary')::BOOLEAN
                        ELSE is_honorary
                    END,
                    honorary_member_since = CASE
                        WHEN v_existing_member.is_honorary_source = 'manual' THEN v_existing_member.honorary_member_since
                        WHEN v_item ? 'honorary_member_since' AND v_item->>'honorary_member_since' IS NOT NULL THEN NULLIF(v_item->>'honorary_member_since', '')::DATE
                        ELSE honorary_member_since
                    END,
                    first_club_entry_date_ssv = CASE
                        WHEN v_item ? 'first_club_entry_date_ssv' THEN COALESCE(NULLIF(v_item->>'first_club_entry_date_ssv', '')::DATE, first_club_entry_date_ssv)
                        ELSE first_club_entry_date_ssv
                    END,
                    deceased = CASE
                        WHEN v_item ? 'deceased' AND v_item->>'deceased' IS NOT NULL THEN (v_item->>'deceased')::BOOLEAN
                        ELSE deceased
                    END,
                    raw_data = CASE WHEN v_item ? 'raw_data' AND v_item->'raw_data' IS NOT NULL THEN v_item->'raw_data' ELSE raw_data END,
                    last_updated_by = 'SSV-Import (' || v_import_id || ')',
                    synced_at = now(),
                    updated_at = now()
                WHERE person_number = v_pn;

                v_updated_members := v_updated_members + 1;
            END IF;
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
                COALESCE(NULLIF(v_item->>'country', ''), 'CH'),
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
                COALESCE(NULLIF(v_item->>'language', ''), 'de'),
                COALESCE(NULLIF(v_item->>'nationality', ''), 'Schweiz'),
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
            -- Quellschutz & Integrität:
            -- Wenn die bestehende Lizenz aktiv ist und zu Muhen gehört, darf sie NICHT durch eine
            -- inaktive Lizenz eines Fremdvereins mit demselben Eintrittsdatum überschrieben werden!
            exit_date = CASE
                WHEN public.member_licenses.is_active IS TRUE
                     AND (EXCLUDED.is_active IS FALSE OR EXCLUDED.exit_date IS NOT NULL)
                     AND (public.member_licenses.license_invoicing_club_name ILIKE '%muhen%'
                          OR public.member_licenses.license_invoicing_club_number = '1.19.0.01.029')
                     AND (EXCLUDED.license_invoicing_club_name NOT ILIKE '%muhen%'
                          AND COALESCE(EXCLUDED.license_invoicing_club_number, '') != '1.19.0.01.029')
                THEN public.member_licenses.exit_date
                ELSE EXCLUDED.exit_date
            END,
            license_category = CASE
                WHEN public.member_licenses.is_active IS TRUE
                     AND (EXCLUDED.is_active IS FALSE OR EXCLUDED.exit_date IS NOT NULL)
                     AND (public.member_licenses.license_invoicing_club_name ILIKE '%muhen%'
                          OR public.member_licenses.license_invoicing_club_number = '1.19.0.01.029')
                     AND (EXCLUDED.license_invoicing_club_name NOT ILIKE '%muhen%'
                          AND COALESCE(EXCLUDED.license_invoicing_club_number, '') != '1.19.0.01.029')
                THEN public.member_licenses.license_category
                ELSE EXCLUDED.license_category
            END,
            license_type = CASE
                WHEN public.member_licenses.is_active IS TRUE
                     AND (EXCLUDED.is_active IS FALSE OR EXCLUDED.exit_date IS NOT NULL)
                     AND (public.member_licenses.license_invoicing_club_name ILIKE '%muhen%'
                          OR public.member_licenses.license_invoicing_club_number = '1.19.0.01.029')
                     AND (EXCLUDED.license_invoicing_club_name NOT ILIKE '%muhen%'
                          AND COALESCE(EXCLUDED.license_invoicing_club_number, '') != '1.19.0.01.029')
                THEN public.member_licenses.license_type
                ELSE EXCLUDED.license_type
            END,
            license_invoicing_club_number = CASE
                WHEN public.member_licenses.is_active IS TRUE
                     AND (EXCLUDED.is_active IS FALSE OR EXCLUDED.exit_date IS NOT NULL)
                     AND (public.member_licenses.license_invoicing_club_name ILIKE '%muhen%'
                          OR public.member_licenses.license_invoicing_club_number = '1.19.0.01.029')
                     AND (EXCLUDED.license_invoicing_club_name NOT ILIKE '%muhen%'
                          AND COALESCE(EXCLUDED.license_invoicing_club_number, '') != '1.19.0.01.029')
                THEN public.member_licenses.license_invoicing_club_number
                ELSE EXCLUDED.license_invoicing_club_number
            END,
            license_invoicing_club_name = CASE
                WHEN public.member_licenses.is_active IS TRUE
                     AND (EXCLUDED.is_active IS FALSE OR EXCLUDED.exit_date IS NOT NULL)
                     AND (public.member_licenses.license_invoicing_club_name ILIKE '%muhen%'
                          OR public.member_licenses.license_invoicing_club_number = '1.19.0.01.029')
                     AND (EXCLUDED.license_invoicing_club_name NOT ILIKE '%muhen%'
                          AND COALESCE(EXCLUDED.license_invoicing_club_number, '') != '1.19.0.01.029')
                THEN public.member_licenses.license_invoicing_club_name
                ELSE EXCLUDED.license_invoicing_club_name
            END,
            is_active = CASE
                WHEN public.member_licenses.is_active IS TRUE
                     AND (EXCLUDED.is_active IS FALSE OR EXCLUDED.exit_date IS NOT NULL)
                     AND (public.member_licenses.license_invoicing_club_name ILIKE '%muhen%'
                          OR public.member_licenses.license_invoicing_club_number = '1.19.0.01.029')
                     AND (EXCLUDED.license_invoicing_club_name NOT ILIKE '%muhen%'
                          AND COALESCE(EXCLUDED.license_invoicing_club_number, '') != '1.19.0.01.029')
                THEN TRUE
                ELSE EXCLUDED.is_active
            END,
            import_quelle = EXCLUDED.import_quelle,
            last_updated = now(),
            updated_at = now();

        v_synced_licenses := v_synced_licenses + 1;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- 2b. WEGGEFALLENE / ERSETZTE LIZENZEN DEAKTIVIEREN ('Austritt (Export)' u. a.)
    -- --------------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'licenses_to_deactivate', '[]'::jsonb))
    LOOP
        DECLARE
            v_deact_pn INTEGER := (v_item->>'person_number')::INTEGER;
            v_deact_cat VARCHAR := NULLIF(v_item->>'membership_category', '');
            v_deact_entry DATE := NULLIF(v_item->>'entry_date', '')::DATE;
            v_deact_exit DATE := COALESCE(NULLIF(v_item->>'exit_date', '')::DATE, CURRENT_DATE);
        BEGIN
            IF v_deact_pn IS NULL OR v_deact_cat IS NULL THEN
                CONTINUE;
            END IF;

            UPDATE public.member_licenses SET
                is_active = false,
                exit_date = COALESCE(exit_date, v_deact_exit),
                last_updated = now(),
                updated_at = now()
            WHERE person_number = v_deact_pn
              AND membership_category = v_deact_cat
              AND (v_deact_entry IS NULL OR entry_date = v_deact_entry)
              AND (is_active IS TRUE OR exit_date IS NULL);

            GET DIAGNOSTICS v_row_count = ROW_COUNT;
            v_deactivated_licenses := v_deactivated_licenses + v_row_count;
        END;
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
    -- 3b. WEGGEFALLENE FUNKTIONEN SCHLIESSEN ('Austritt (Export)' / ExitDate)
    -- --------------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'functions_to_close', '[]'::jsonb))
    LOOP
        DECLARE
            v_close_pn INTEGER := (v_item->>'person_number')::INTEGER;
            v_close_cat VARCHAR := NULLIF(v_item->>'official_function_category', '');
            v_close_entry DATE := NULLIF(v_item->>'official_function_entry_date', '')::DATE;
            v_close_exit DATE := COALESCE(NULLIF(v_item->>'official_function_exit_date', '')::DATE, CURRENT_DATE);
        BEGIN
            IF v_close_pn IS NULL OR v_close_cat IS NULL THEN
                CONTINUE;
            END IF;

            UPDATE public.member_functions SET
                official_function_exit_date = COALESCE(official_function_exit_date, v_close_exit),
                last_updated = now(),
                updated_at = now()
            WHERE person_number = v_close_pn
              AND official_function_category = v_close_cat
              AND (v_close_entry IS NULL OR COALESCE(official_function_entry_date, '1900-01-01'::DATE) = v_close_entry)
              AND official_function_exit_date IS NULL;

            GET DIAGNOSTICS v_row_count = ROW_COUNT;
            v_closed_functions := v_closed_functions + v_row_count;
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
        'licenses_deactivated', v_deactivated_licenses,
        'functions_synced', v_synced_functions,
        'functions_closed', v_closed_functions,
        'training_synced', v_synced_training,
        'history_logged', v_logged_history,
        'message', 'SSV-Batch erfolgreich persistiert (' ||
                   v_created_members || ' neu, ' ||
                   v_updated_members || ' aktualisiert, ' ||
                   v_synced_licenses || ' Lizenzen, ' ||
                   v_deactivated_licenses || ' Lizenzen deaktiviert, ' ||
                   v_synced_functions || ' Funktionen, ' ||
                   v_closed_functions || ' Funktionen beendet).'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_ssv_import_batch(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ssv_import_batch(JSONB) TO authenticated, service_role;
