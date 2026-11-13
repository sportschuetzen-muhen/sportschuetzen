-- ==============================================================================
-- 124_fix_variable_fee_labels_and_z002_sync.sql
-- Migration:
--   1. calculate_member_contributions: Sauberer Fallback auf g.bezeichnung_frontend /
--      g.bezeichnung für variable Zusatzpositionen sowie Unterdrückung leerer
--      CHF 0.00 Positionen bei ui_typ = 'amount' / Z%.
--   2. Daten-Nachzug 2026 für Z002: Übernahme der aktualisierten Bezeichnung
--      "Eidg. Schützenfest Stich (ohne Verein & Grundbeitrag)" in bestehende
--      contributions_positions und offene Entwurfs-Rechnungen (JB-26-0466),
--      inkl. Backfill von invoice_positions.source_field & PDF-Cache-Invalidierung.
-- Module: Jahresbeitrag & Rechnungen
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
    v_foreign_lic_charged BOOLEAN;
    v_lic RECORD;
    v_part RECORD;
    v_geb RECORD;
    v_group_win RECORD;
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
    -- 1. Gezielt zu löschende Posten nur für nicht mehr beitragspflichtige Ziel-Mitglieder vorab entfernen
    IF p_target_pns IS NOT NULL AND cardinality(p_target_pns) > 0 THEN
        DELETE FROM public.contributions_positions cp
        WHERE cp.year = p_year
          AND cp.person_number = ANY(p_target_pns)
          AND NOT EXISTS (
              SELECT 1 FROM public.members m
              WHERE m.person_number::text = cp.person_number
                AND m.deceased IS NOT TRUE
                AND (m.is_active IS TRUE OR m.is_passive IS TRUE OR m.is_honorary IS TRUE)
          );

        DELETE FROM public.contributions_header ch
        WHERE ch.year = p_year
          AND ch.person_number = ANY(p_target_pns)
          AND (ch.invoice_id IS NULL OR ch.status = 'offen')
          AND NOT EXISTS (
              SELECT 1 FROM public.members m
              WHERE m.person_number::text = ch.person_number
                AND m.deceased IS NOT TRUE
                AND (m.is_active IS TRUE OR m.is_passive IS TRUE OR m.is_honorary IS TRUE)
          );
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
        v_header_id := 'CH-' || p_year || '-' || v_member.person_number::text;

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

        -- --- SCHRITT 2: Lizenzen abrechnen (Deduplizierung für eigene & fremde Lizenzen) ---
        v_own_lic_charged := false;
        v_foreign_lic_charged := false;

        FOR v_lic IN
            SELECT *
            FROM public.member_licenses
            WHERE person_number = v_member.person_number AND is_active IS TRUE
            ORDER BY CASE WHEN license_invoicing_club_name ILIKE '%muhen%' OR license_invoicing_club_number = '1.19.0.05.184' THEN 0 ELSE 1 END
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
                -- Fremdlizenz: Höchstens 1x abrechnen, sofern nicht bereits eigene Lizenz verrechnet
                IF NOT v_foreign_lic_charged AND NOT v_own_lic_charged THEN
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
                    v_foreign_lic_charged := true;
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

        -- --- SCHRITT 4: Wettkämpfe, Turniere & Variable Zusatzpositionen (member_participations) ---
        FOR v_part IN
            SELECT p.*, g.betrag AS geb_betrag, g.bezeichnung_frontend AS geb_bezeichnung,
                   g.bezeichnung AS geb_bezeichnung_full,
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
                v_part_konto VARCHAR(20);
                v_existing_var_betrag NUMERIC(10,2);
                v_existing_var_desc VARCHAR(255);
                v_existing_var_konto VARCHAR(20);
                v_is_variable BOOLEAN;
            BEGIN
                v_part_konto := COALESCE(v_part.konto_haben, '1300');
                v_is_variable := (v_part.ui_typ = 'amount' OR v_part.geb_kategorie ILIKE 'variabel' OR v_part.event_key LIKE 'Z%');

                IF v_part.ui_typ = 'counter' OR v_part.event_key = 'KK008' THEN
                    v_part_betrag := v_part.geb_betrag * v_part.teilgenommen;
                    v_part_desc := COALESCE(v_part.geb_bezeichnung, v_part.geb_bezeichnung_full, v_part.event_key) || ' (' || v_part.teilgenommen || ' Stich' || CASE WHEN v_part.teilgenommen > 1 THEN 'e' ELSE '' END || ')';
                ELSIF v_is_variable THEN
                    SELECT cp.betrag, cp.beschreibung, cp.konto
                    INTO v_existing_var_betrag, v_existing_var_desc, v_existing_var_konto
                    FROM public.contributions_positions cp
                    WHERE (cp.header_id = v_header_id OR (cp.year = p_year AND cp.person_number = v_member.person_number::text))
                      AND cp.source_field = v_part.event_key
                    ORDER BY (CASE WHEN cp.betrag <> v_part.geb_betrag THEN 0 ELSE 1 END), cp.position_nr DESC
                    LIMIT 1;

                    v_part_betrag := COALESCE(v_existing_var_betrag, v_part.geb_betrag);
                    v_part_desc := COALESCE(
                        NULLIF(TRIM(v_existing_var_desc), ''),
                        NULLIF(TRIM(v_part.geb_bezeichnung), ''),
                        NULLIF(TRIM(v_part.geb_bezeichnung_full), ''),
                        v_part.event_key
                    );
                    v_part_konto := COALESCE(NULLIF(TRIM(v_existing_var_konto), ''), v_part.konto_haben, '1300');
                ELSE
                    v_part_betrag := v_part.geb_betrag;
                    v_part_desc := COALESCE(v_part.geb_bezeichnung, v_part.geb_bezeichnung_full, v_part.event_key);
                END IF;

                IF NOT (v_is_variable AND COALESCE(v_part_betrag, 0) = 0) THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        v_part_desc,
                        v_part_betrag,
                        CASE WHEN v_part_betrag < 0 THEN 'Credit' ELSE 'Debit' END,
                        v_part.event_key,
                        v_part_konto,
                        v_part.geb_kategorie
                    );
                    v_pos_nr := v_pos_nr + 1;

                    -- Option A: Automatische Kostenübernahme für Junioren bei allen Wettkämpfen (KK & LG)
                    IF v_is_junior AND (
                        v_part.geb_kategorie ILIKE '%kostenübernahme%' 
                        OR v_part.geb_kategorie ILIKE '%kostenuebernahme%'
                        OR v_part.geb_kategorie ILIKE '%kleinkaliber%'
                        OR v_part.geb_kategorie ILIKE '%luftgewehr%'
                        OR v_part.geb_kategorie ILIKE '%wettkampf%'
                        OR v_part.geb_kategorie ILIKE '%schiessgeld%'
                        OR v_part.event_key LIKE 'KK%'
                        OR v_part.event_key LIKE 'LG%'
                    ) THEN
                        v_youth_subsidy_total := v_youth_subsidy_total + v_part_betrag;
                        IF v_part.konto_haben IS NOT NULL THEN
                            v_youth_konto := v_part.konto_haben;
                        END IF;
                    END IF;
                END IF;
            END;
        END LOOP;

        -- --- SCHRITT 5: Rabatte (RA001 Vorstand, RA002 Hausmeister, Jugendförderung) ---
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

        -- B. Hausmeister / Unterhalt (RA002)
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

        -- C. Kostenübernahme Jugend / Verein (Option A)
        IF v_is_junior AND v_youth_subsidy_total > 0 THEN
            INSERT INTO temp_contrib_pos VALUES (
                v_pos_nr,
                'Kostenübernahme Verein (Nachwuchsförderung)',
                -v_youth_subsidy_total,
                'Credit',
                'KOSTENUEBERNAHME_JUGEND',
                COALESCE(v_youth_konto, '3420'),
                'Rabatt'
            );
            v_pos_nr := v_pos_nr + 1;
        END IF;

        -- --- SCHRITT 5d: Schützengewinne auswärtige Schiessen (Konto 1301) ---
        FOR v_group_win IN
            SELECT 
                gcm.id AS gcm_id, 
                gcm.betrag AS win_betrag,
                gcm.anteil_gruppe,
                gcm.anteil_einzel,
                gcm.stich_name,
                gc.gruppe_name, 
                gc.anlass_name,
                COALESCE(gc.anlass_typ, 'gruppe') AS anlass_typ
            FROM public.group_competition_members gcm
            JOIN public.group_competitions gc ON gc.id = gcm.competition_id
            WHERE gcm.person_number = v_member.person_number
              AND gc.jahr = p_year
              AND gcm.payout_method = 'jahresbeitrag'
              AND gcm.betrag > 0
            ORDER BY gc.created_at, gcm.created_at
        LOOP
            IF v_group_win.anlass_typ = 'kombiniert' THEN
                IF COALESCE(v_group_win.anteil_gruppe, 0) > 0 THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        'Gutschrift Gruppengewinn: ' || COALESCE(v_group_win.gruppe_name, 'Gruppe') || ' (' || v_group_win.anlass_name || ')',
                        -ABS(v_group_win.anteil_gruppe),
                        'Credit',
                        '1301',
                        '1301',
                        'Gruppengewinn'
                    );
                    v_pos_nr := v_pos_nr + 1;
                END IF;
                IF COALESCE(v_group_win.anteil_einzel, 0) > 0 THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        'Gutschrift Einzelgewinn' || CASE WHEN v_group_win.stich_name IS NOT NULL AND v_group_win.stich_name <> '' THEN ' (' || v_group_win.stich_name || ')' ELSE '' END || ': ' || v_group_win.anlass_name,
                        -ABS(v_group_win.anteil_einzel),
                        'Credit',
                        '1301',
                        '1301',
                        'Einzelgewinn'
                    );
                    v_pos_nr := v_pos_nr + 1;
                END IF;
            ELSIF v_group_win.anlass_typ = 'einzel' THEN
                INSERT INTO temp_contrib_pos VALUES (
                    v_pos_nr,
                    'Gutschrift Einzelgewinn' || CASE WHEN v_group_win.stich_name IS NOT NULL AND v_group_win.stich_name <> '' THEN ' (' || v_group_win.stich_name || ')' ELSE '' END || ': ' || v_group_win.anlass_name,
                    -ABS(v_group_win.win_betrag),
                    'Credit',
                    '1301',
                    '1301',
                    'Einzelgewinn'
                );
                v_pos_nr := v_pos_nr + 1;
            ELSE
                INSERT INTO temp_contrib_pos VALUES (
                    v_pos_nr,
                    'Gutschrift Gruppengewinn: ' || COALESCE(v_group_win.gruppe_name, 'Gruppe') || ' (' || v_group_win.anlass_name || ')',
                    -ABS(v_group_win.win_betrag),
                    'Credit',
                    '1301',
                    '1301',
                    'Gruppengewinn'
                );
                v_pos_nr := v_pos_nr + 1;
            END IF;
        END LOOP;

        -- --- SCHRITT 6: Header speichern & Positionen persistieren ---
        SELECT COALESCE(SUM(betrag), 0.00) INTO v_total FROM temp_contrib_pos;
        
        IF NOT v_has_ra002 AND v_total < 0 THEN
            v_total := 0.00;
        END IF;

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

        DELETE FROM public.contributions_positions
        WHERE header_id = v_header_id
           OR (year = p_year AND person_number = v_member.person_number::text);

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

        UPDATE public.group_competition_members gcm
        SET status = 'verrechnet',
            contribution_position_id = cp.id,
            updated_at = now()
        FROM public.group_competitions gc, public.contributions_positions cp
        WHERE gcm.competition_id = gc.id
          AND gcm.person_number = v_member.person_number
          AND gc.jahr = p_year
          AND gcm.payout_method = 'jahresbeitrag'
          AND cp.header_id = v_header_id
          AND cp.source_field = '1301'
          AND (
              (cp.beschreibung LIKE ('%' || gc.anlass_name || '%'))
              OR (gc.gruppe_name IS NOT NULL AND cp.beschreibung LIKE ('%' || gc.gruppe_name || '%'))
          );

        v_created_count := v_created_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'year', p_year,
        'calculated_count', v_created_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. DATEN-NACHZUG 2026: Z002 Bezeichnung & invoice_positions.source_field
-- ------------------------------------------------------------------------------

-- A. Aktualisierte Z002-Bezeichnung in noch nicht versendete/bezahlte contributions_positions 2026 übernehmen
UPDATE public.contributions_positions cp
SET beschreibung = COALESCE(
        NULLIF(TRIM(g.bezeichnung_frontend), ''),
        NULLIF(TRIM(g.bezeichnung), ''),
        'Eidg. Schützenfest Stich (ohne Verein & Grundbeitrag)'
    ),
    last_upd = now()
FROM public.gebuehren_config g,
     public.contributions_header ch
LEFT JOIN public.invoices i ON i.id = ch.invoice_id
WHERE g.key = 'Z002'
  AND cp.header_id = ch.id
  AND cp.year = 2026
  AND cp.source_field = 'Z002'
  AND cp.beschreibung = 'Beitrag Eidg. Schützenfest'
  AND ch.status <> 'bezahlt'
  AND (
      i.id IS NULL
      OR (
          (i.mail_status IS NULL OR i.mail_status = 'entwurf')
          AND i.status NOT IN ('bezahlt', 'teilbezahlt', 'storniert')
          AND NOT EXISTS (SELECT 1 FROM public.invoice_payments pay WHERE pay.invoice_id = i.id)
      )
  );

-- B. Backfill von source_field auf offenen 2026er Jahresbeitrags-Entwürfen
UPDATE public.invoice_positions ip
SET source_field = cp.source_field
FROM public.contributions_header ch,
     public.invoices i,
     public.contributions_positions cp
WHERE i.id = ch.invoice_id
  AND cp.header_id = ch.id
  AND cp.position_nr = ip.position_nr
  AND ip.invoice_id = i.id
  AND ch.year = 2026
  AND lower(i.type) = 'jahresbeitrag'
  AND (i.mail_status IS NULL OR i.mail_status = 'entwurf')
  AND i.status NOT IN ('bezahlt', 'teilbezahlt', 'storniert')
  AND NOT EXISTS (SELECT 1 FROM public.invoice_payments pay WHERE pay.invoice_id = i.id)
  AND (ip.source_field IS NULL OR ip.source_field = '')
  AND cp.source_field IS NOT NULL
  AND cp.source_field <> '';

-- C. Z002-Beschreibung in offenen 2026er Rechnungsentwürfen nachziehen & PDF invalidieren
UPDATE public.invoice_positions ip
SET description = COALESCE(
        NULLIF(TRIM(g.bezeichnung_frontend), ''),
        NULLIF(TRIM(g.bezeichnung), ''),
        'Eidg. Schützenfest Stich (ohne Verein & Grundbeitrag)'
    )
FROM public.invoices i,
     public.gebuehren_config g
WHERE ip.invoice_id = i.id
  AND g.key = 'Z002'
  AND i.year = 2026
  AND lower(i.type) = 'jahresbeitrag'
  AND (i.mail_status IS NULL OR i.mail_status = 'entwurf')
  AND i.status NOT IN ('bezahlt', 'teilbezahlt', 'storniert')
  AND NOT EXISTS (SELECT 1 FROM public.invoice_payments pay WHERE pay.invoice_id = i.id)
  AND (ip.source_field = 'Z002' OR ip.description = 'Beitrag Eidg. Schützenfest')
  AND ip.description = 'Beitrag Eidg. Schützenfest';

UPDATE public.invoices i
SET pdf_url = NULL,
    pdf_storage_path = NULL,
    updated_at = now()
WHERE i.year = 2026
  AND lower(i.type) = 'jahresbeitrag'
  AND (i.mail_status IS NULL OR i.mail_status = 'entwurf')
  AND i.status NOT IN ('bezahlt', 'teilbezahlt', 'storniert')
  AND NOT EXISTS (SELECT 1 FROM public.invoice_payments pay WHERE pay.invoice_id = i.id)
  AND EXISTS (
      SELECT 1 FROM public.invoice_positions ip
      WHERE ip.invoice_id = i.id AND ip.source_field = 'Z002'
  );
