-- ==============================================================================
-- 37_fix_calculate_member_contributions_types.sql
-- Migration: Behebung Typenkonflikt (integer = text) & Spaltennamen in calculate_member_contributions
--            (mf.person_number ist INTEGER, Spalten official_function_category / use_on_board_and_functionary_report)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.calculate_member_contributions(
    p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    p_target_pns TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_created_count INTEGER := 0;
    v_member RECORD;
    v_header_id VARCHAR(50);
    v_age INTEGER;
    v_is_junior BOOLEAN;
    v_is_honorary BOOLEAN;
    v_is_passive BOOLEAN;
    v_is_intern BOOLEAN;
    v_jb_key VARCHAR(50);
    v_has_g50 BOOLEAN;
    v_has_g10 BOOLEAN;
    v_g50_is_b BOOLEAN;
    v_charge_ge BOOLEAN;
    v_ge_override RECORD;
    v_own_lic_charged BOOLEAN;
    v_lic RECORD;
    v_part RECORD;
    v_geb RECORD;
    v_has_ra001 BOOLEAN;
    v_has_ra002 BOOLEAN;
    v_youth_subsidy_total NUMERIC(10,2);
    v_youth_konto VARCHAR(20);
    v_pos_nr INTEGER;
    v_total NUMERIC(10,2);
    v_existing_status VARCHAR(30);
    v_existing_inv_id VARCHAR(50);
    v_existing_pay_date DATE;
    v_existing_pay_method VARCHAR(50);
    v_existing_doc_ref VARCHAR(100);
    v_existing_created_at TIMESTAMPTZ;
    v_base_fee_amt NUMERIC(10,2);
    v_effective_discount NUMERIC(10,2);
BEGIN
    -- 1. Gezielt zu löschende Posten vor Neuberechnung entfernen
    IF p_target_pns IS NOT NULL AND cardinality(p_target_pns) > 0 THEN
        DELETE FROM public.contributions_positions
        WHERE year = p_year AND person_number = ANY(p_target_pns);
        
        DELETE FROM public.contributions_header
        WHERE year = p_year 
          AND person_number = ANY(p_target_pns)
          AND (invoice_id IS NULL OR status = 'offen');
    END IF;

    -- 2. Temporäre Tabelle für Positionen vorbereiten
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_contrib_pos (
        pos_nr INTEGER,
        beschreibung VARCHAR(255),
        betrag NUMERIC(10,2),
        typ VARCHAR(20),
        source_field VARCHAR(50),
        konto VARCHAR(20),
        kategorie VARCHAR(50)
    ) ON COMMIT DROP;

    -- 3. Schleife über alle beitragspflichtigen Mitglieder
    FOR v_member IN
        SELECT m.*
        FROM public.members m
        WHERE m.deceased IS NOT TRUE
          AND (m.is_active IS TRUE OR m.is_passive IS TRUE OR m.is_honorary IS TRUE)
          AND (
            (p_target_pns IS NOT NULL AND cardinality(p_target_pns) > 0 AND m.person_number::text = ANY(p_target_pns))
            OR
            ((p_target_pns IS NULL OR cardinality(p_target_pns) = 0) AND NOT EXISTS (
                SELECT 1 FROM public.contributions_header ch
                WHERE ch.person_number = m.person_number::text
                  AND ch.year = p_year
                  AND ch.status IN ('versendet', 'bezahlt')
            ))
          )
        ORDER BY m.last_name, m.first_name
    LOOP
        TRUNCATE TABLE temp_contrib_pos;
        v_pos_nr := 1;
        v_has_ra001 := false;
        v_has_ra002 := false;
        v_youth_subsidy_total := 0.00;
        v_youth_konto := '3420';
        v_base_fee_amt := 0.00;

        -- Alter & Status bestimmen
        v_age := CASE 
            WHEN v_member.birth_date IS NOT NULL THEN
                p_year - EXTRACT(YEAR FROM v_member.birth_date)::INTEGER
            ELSE 30
        END;
        v_is_junior := (v_age <= 20);
        v_is_honorary := (v_member.is_honorary IS TRUE);
        v_is_passive := (v_member.is_passive IS TRUE);
        v_is_intern := (v_member.organization_name ILIKE '%intern%' OR v_member.organization_number = 'INTERN');

        -- Lizenzen prüfen (G50 / G10)
        v_has_g50 := false;
        v_has_g10 := false;
        v_g50_is_b := false;

        SELECT 
            COALESCE(bool_or(membership_category ILIKE '%g50%' OR membership_category ILIKE '%gewehr 50%'), false),
            COALESCE(bool_or(membership_category ILIKE '%g10%' OR membership_category ILIKE '%luftgewehr%' OR membership_category ILIKE '%10m%'), false),
            COALESCE(bool_or(
                (membership_category ILIKE '%g50%' OR membership_category ILIKE '%gewehr 50%') AND
                (membership_category ILIKE '%aktiv-b%' OR membership_category ILIKE '%aktiv b%' OR membership_category ILIKE '%status b%' OR license_category = 'B')
            ), false)
        INTO v_has_g50, v_has_g10, v_g50_is_b
        FROM public.member_licenses
        WHERE person_number = v_member.person_number AND is_active IS TRUE;

        -- --- SCHRITT 1: Jahresbeitrag Hauptposition ermitteln ---
        -- Auch für Ehrenmitglieder wird zuerst der reguläre Tarif bestimmt
        IF v_is_passive THEN
            v_jb_key := 'JB005'; -- Passivmitglied
        ELSIF v_is_intern AND v_is_junior THEN
            v_jb_key := 'JB006'; -- Schüler intern
        ELSIF v_is_junior THEN
            v_jb_key := 'JB007'; -- Junior / Nachwuchs
        ELSE
            IF v_has_g50 IS TRUE THEN
                IF v_g50_is_b IS TRUE THEN
                    v_jb_key := 'JB002'; -- Aktiv B G50m
                ELSE
                    v_jb_key := 'JB001'; -- Aktiv A G50m
                END IF;
            ELSIF v_has_g10 IS TRUE THEN
                v_jb_key := 'JB003'; -- Aktiv nur 10m
            ELSE
                v_jb_key := 'JB001'; -- Fallback Aktiv A
            END IF;
        END IF;

        -- Jahresbeitrag Position einfügen
        SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = v_jb_key;
        IF FOUND THEN
            v_base_fee_amt := v_geb.betrag;
            INSERT INTO temp_contrib_pos VALUES (
                v_pos_nr,
                COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung, v_jb_key),
                v_geb.betrag,
                'Debit',
                v_jb_key,
                COALESCE(v_geb.konto_haben, '3410'),
                v_geb.kategorie
            );
            v_pos_nr := v_pos_nr + 1;
        END IF;

        -- Ehrenmitglieder: Rabattzeile 'Ehrenmitgliedschaft' in Höhe des Grundbeitrags mit Cap auf RA003
        IF v_is_honorary AND v_base_fee_amt > 0 THEN
            SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'RA003';
            IF FOUND THEN
                v_effective_discount := LEAST(v_base_fee_amt, ABS(v_geb.betrag));
                IF v_effective_discount > 0 THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung, 'Ehrenmitgliedschaft'),
                        -v_effective_discount,
                        'Credit',
                        'RA003',
                        COALESCE(v_geb.konto_haben, '3410'),
                        COALESCE(v_geb.kategorie, 'Rabatt')
                    );
                    v_pos_nr := v_pos_nr + 1;
                END IF;
            END IF;
        END IF;

        -- --- SCHRITT 2: Lizenzen abrechnen ---
        v_own_lic_charged := false;

        FOR v_lic IN
            SELECT *
            FROM public.member_licenses
            WHERE person_number = v_member.person_number AND is_active IS TRUE
        LOOP
            IF v_lic.license_invoicing_club_name ILIKE '%muhen%' OR v_lic.license_invoicing_club_number = '1.19.0.05.184' THEN
                IF NOT v_own_lic_charged THEN
                    IF v_is_junior THEN
                        v_jb_key := 'LI002'; -- Lizenz Junior
                    ELSE
                        v_jb_key := 'LI001'; -- Lizenz Normal
                    END IF;

                    SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = v_jb_key;
                    IF FOUND THEN
                        INSERT INTO temp_contrib_pos VALUES (
                            v_pos_nr,
                            COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung, 'Lizenz eigener Verein'),
                            v_geb.betrag,
                            'Debit',
                            v_jb_key,
                            COALESCE(v_geb.konto_haben, '3411'),
                            v_geb.kategorie
                        );
                        v_pos_nr := v_pos_nr + 1;
                    END IF;
                    v_own_lic_charged := true;
                END IF;
            ELSE
                -- Fremdlizenz
                SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'LI003';
                IF FOUND THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung, 'Lizenz anderer Verein') || ' (' || COALESCE(v_lic.license_invoicing_club_name, 'Fremdverein') || ')',
                        COALESCE(v_geb.betrag, 0.00),
                        'Debit',
                        'LI003',
                        COALESCE(v_geb.konto_haben, '3411'),
                        v_geb.kategorie
                    );
                    v_pos_nr := v_pos_nr + 1;
                END IF;
            END IF;
        END LOOP;

        -- --- SCHRITT 3: Schützenhaus Infrastrukturbeitrag (GE001) ---
        SELECT teilgenommen INTO v_ge_override
        FROM public.member_participations
        WHERE person_number = v_member.person_number::text
          AND year = p_year
          AND event_key = 'GE001';

        IF FOUND THEN
            v_charge_ge := (v_ge_override.teilgenommen = 1);
        ELSE
            v_charge_ge := (NOT v_is_junior AND v_has_g50 AND NOT v_is_passive);
        END IF;

        IF v_charge_ge THEN
            SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'GE001';
            IF FOUND THEN
                INSERT INTO temp_contrib_pos VALUES (
                    v_pos_nr,
                    COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung, 'Schützenhaus Infrastrukturbeitrag'),
                    v_geb.betrag,
                    'Debit',
                    'GE001',
                    COALESCE(v_geb.konto_haben, '3413'),
                    v_geb.kategorie
                );
                v_pos_nr := v_pos_nr + 1;
            END IF;
        END IF;

        -- --- SCHRITT 4: Wettkämpfe & Turniere (member_participations) ---
        FOR v_part IN
            SELECT p.*, g.betrag AS geb_betrag, g.bezeichnung_frontend AS geb_bezeichnung, 
                   g.konto_haben, g.kategorie AS geb_kategorie, g.ui_typ
            FROM public.member_participations p
            JOIN public.gebuehren_config g ON g.key = p.event_key
            WHERE p.person_number = v_member.person_number::text
              AND p.year = p_year
              AND p.teilgenommen > 0
              AND p.event_key NOT IN ('GE001', 'RA001', 'RA002', 'RA003')
            ORDER BY g.sort_order, p.event_key
        LOOP
            DECLARE
                v_part_betrag NUMERIC(10,2);
                v_part_desc VARCHAR(255);
            BEGIN
                IF v_part.ui_typ = 'counter' OR v_part.event_key = 'KK008' THEN
                    v_part_betrag := v_part.geb_betrag * v_part.teilgenommen;
                    v_part_desc := COALESCE(v_part.geb_bezeichnung, v_part.event_key) || ' (' || v_part.teilgenommen || ' Stich' || CASE WHEN v_part.teilgenommen > 1 THEN 'e' ELSE '' END || ')';
                ELSE
                    v_part_betrag := v_part.geb_betrag;
                    v_part_desc := COALESCE(v_part.geb_bezeichnung, v_part.event_key);
                END IF;

                INSERT INTO temp_contrib_pos VALUES (
                    v_pos_nr,
                    v_part_desc,
                    v_part_betrag,
                    'Debit',
                    v_part.event_key,
                    COALESCE(v_part.konto_haben, '1300'),
                    v_part.geb_kategorie
                );
                v_pos_nr := v_pos_nr + 1;

                IF v_is_junior AND (v_part.geb_kategorie ILIKE '%kostenübernahme%' OR v_part.geb_kategorie ILIKE '%kostenuebernahme%') THEN
                    v_youth_subsidy_total := v_youth_subsidy_total + v_part_betrag;
                    IF v_part.konto_haben IS NOT NULL THEN
                        v_youth_konto := v_part.konto_haben;
                    END IF;
                END IF;
            END;
        END LOOP;

        -- --- SCHRITT 5: Rabatte (RA001 Vorstand, RA002 Hausmeister) ---
        -- A. Vorstandsrats-Rabatt (RA001) - Nur wenn kein Ehrenmitglied (da Ehrenmitglieder bereits RA003 haben)
        IF NOT v_is_honorary THEN
            SELECT EXISTS (
                SELECT 1 FROM public.member_functions mf
                WHERE mf.person_number = v_member.person_number
                  AND (mf.official_function_exit_date IS NULL OR mf.official_function_exit_date >= (p_year::TEXT || '-01-01')::DATE)
                  AND (mf.rabattkategorie = 'RA001' OR mf.use_on_board_and_functionary_report IS TRUE OR mf.official_function_category ILIKE '%vorstand%')
            ) INTO v_has_ra001;

            IF v_has_ra001 THEN
                SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'RA001';
                IF FOUND THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung, 'Vorstandsrabatt'),
                        -ABS(v_geb.betrag),
                        'Credit',
                        'RA001',
                        COALESCE(v_geb.konto_haben, '3410'),
                        v_geb.kategorie
                    );
                    v_pos_nr := v_pos_nr + 1;
                END IF;
            END IF;
        END IF;

        -- B. Hausmeister / Unterhalt (RA002) - Steuerung via member_participations (Option B)
        SELECT EXISTS (
            SELECT 1 FROM public.member_participations
            WHERE person_number = v_member.person_number::text
              AND year = p_year
              AND event_key = 'RA002'
              AND teilgenommen > 0
        ) INTO v_has_ra002;

        IF v_has_ra002 THEN
            SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'RA002';
            IF FOUND THEN
                INSERT INTO temp_contrib_pos VALUES (
                    v_pos_nr,
                    COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung, 'Gutschrift Unterhalt Anlage (Hausmeister)'),
                    -ABS(v_geb.betrag),
                    'Credit',
                    'RA002',
                    COALESCE(v_geb.konto_haben, '3413'),
                    v_geb.kategorie
                );
                v_pos_nr := v_pos_nr + 1;
            END IF;
        END IF;

        -- C. Kostenübernahme Jugend / Verein
        IF v_is_junior AND v_youth_subsidy_total > 0 THEN
            INSERT INTO temp_contrib_pos VALUES (
                v_pos_nr,
                'Kostenübernahme Verein (Nachwuchsförderung)',
                -v_youth_subsidy_total,
                'Credit',
                'KOSTENUEBERNAHME_JUGEND',
                v_youth_konto,
                'Rabatt'
            );
            v_pos_nr := v_pos_nr + 1;
        END IF;

        -- --- SCHRITT 6: Header speichern & Positionen persistieren ---
        SELECT COALESCE(SUM(betrag), 0.00) INTO v_total FROM temp_contrib_pos;
        
        -- Floor-Regel: Nicht unter 0.00 fallen, ausser bei Hausmeister
        IF NOT v_has_ra002 AND v_total < 0 THEN
            v_total := 0.00;
        END IF;

        v_header_id := 'CH-' || p_year || '-' || v_member.person_number::text;

        -- Vorhandenen Status und Verknüpfungen beibehalten
        SELECT status, invoice_id, payment_date, payment_method, document_ref, created_at
        INTO v_existing_status, v_existing_inv_id, v_existing_pay_date, v_existing_pay_method, v_existing_doc_ref, v_existing_created_at
        FROM public.contributions_header
        WHERE id = v_header_id;

        INSERT INTO public.contributions_header (
            id, person_number, year, status, gesamt, payment_date, payment_method, document_ref, invoice_id, created_at, updated_at
        ) VALUES (
            v_header_id,
            v_member.person_number::text,
            p_year,
            COALESCE(v_existing_status, 'offen'),
            v_total,
            v_existing_pay_date,
            v_existing_pay_method,
            v_existing_doc_ref,
            v_existing_inv_id,
            COALESCE(v_existing_created_at, now()),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            gesamt = EXCLUDED.gesamt,
            updated_at = now();

        -- Positionen atomar ersetzen
        DELETE FROM public.contributions_positions WHERE header_id = v_header_id;

        INSERT INTO public.contributions_positions (
            id, header_id, person_number, year, position_nr, beschreibung, betrag, typ, source_field, konto, last_upd
        )
        SELECT 
            v_header_id || '-' || pos_nr,
            v_header_id,
            v_member.person_number::text,
            p_year,
            pos_nr,
            beschreibung,
            betrag,
            typ,
            source_field,
            konto,
            now()
        FROM temp_contrib_pos;

        v_created_count := v_created_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'year', p_year,
        'calculated_count', v_created_count
    );
END;
$$;

COMMENT ON FUNCTION public.calculate_member_contributions(INTEGER, TEXT[]) IS 
'Berechnet Mitgliederbeiträge für ein Beitragsjahr mit Unterstützung für Aktiv-A / Aktiv-B G50m, Ehrenmitglieder-Cap, Lizenzen, Vorstandsrabatt und Wettkämpfe.';

GRANT EXECUTE ON FUNCTION public.calculate_member_contributions(INTEGER, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_member_contributions(INTEGER, TEXT[]) TO anon;
