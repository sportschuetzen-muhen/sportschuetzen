-- ==============================================================================
-- 32_calculate_contributions_hausmeister_participations.sql
-- Migration: Erweiterung Beitragsberechnung um Hausmeister-Rabatt via member_participations (Option B)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Erlaubt die Zuweisung von RA002 (Gutschrift Hausmeister CHF -300.00) direkt im
-- Fachmodul Jahresbeitrag via public.member_participations (event_key = 'RA002'),
-- vollkommen entkoppelt vom SSV-Mitgliederimport.
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
    v_g50_is_a BOOLEAN;
    v_has_own_g50 BOOLEAN;
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
BEGIN
    -- 1. Gezielt zu löschende Posten vor Neuberechnung entfernen
    IF p_target_pns IS NOT NULL AND cardinality(p_target_pns) > 0 THEN
        DELETE FROM public.contributions_positions
        WHERE year = p_year AND person_number = ANY(p_target_pns);
        
        -- Header nur löschen, wenn noch keine finalisierte/bezahlte Rechnung existiert
        DELETE FROM public.contributions_header
        WHERE year = p_year 
          AND person_number = ANY(p_target_pns)
          AND (invoice_id IS NULL OR status = 'offen');
    END IF;

    -- 2. Temporäre Tabelle für Positionen einmalig vorbereiten
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
                WHERE ch.person_number = m.person_number::text AND ch.year = p_year
            ))
          )
        ORDER BY m.last_name, m.first_name
    LOOP
        v_header_id := p_year::TEXT || '-' || v_member.person_number::TEXT;
        v_pos_nr := 1;
        v_total := 0.00;
        v_has_ra001 := false;
        v_has_ra002 := false;
        v_youth_subsidy_total := 0.00;
        v_youth_konto := '3420';

        TRUNCATE temp_contrib_pos;

        -- Alter & Status ermitteln
        v_age := CASE 
            WHEN v_member.birth_date IS NOT NULL THEN (p_year - EXTRACT(YEAR FROM v_member.birth_date)::INTEGER)
            ELSE 30
        END;
        v_is_junior := (v_age <= 20);
        v_is_honorary := (v_member.is_honorary IS TRUE);
        v_is_passive := (v_member.is_passive IS TRUE);
        v_is_intern := (v_member.organization_name ILIKE '%intern%' OR v_member.organization_number = 'INTERN');

        -- --- SCHRITT 1: Jahresbeitrag Hauptposition ermitteln ---
        IF v_is_honorary THEN
            v_jb_key := 'JB004'; -- Ehrenmitglied (CHF 0)
        ELSIF v_is_passive THEN
            v_jb_key := 'JB005'; -- Passivmitglied (CHF 20)
        ELSIF v_is_intern AND v_is_junior THEN
            v_jb_key := 'JB006'; -- Schüler intern (CHF 0)
        ELSIF v_is_junior THEN
            v_jb_key := 'JB007'; -- Junior / Nachwuchs (CHF 10 oder Tarif)
        ELSE
            -- Aktiv: Disziplinen & A/B-Status anhand Lizenzen bestimmen
            v_has_g50 := false;
            v_has_g10 := false;
            v_g50_is_a := true; -- Standard Aktiv A

            SELECT 
                bool_or(membership_category ILIKE '%g50%' OR membership_category ILIKE '%gewehr 50%'),
                bool_or(membership_category ILIKE '%g10%' OR membership_category ILIKE '%luftgewehr%' OR membership_category ILIKE '%10m%'),
                bool_or(membership_category ILIKE '%aktiv b%' OR membership_category ILIKE '%status b%')
            INTO v_has_g50, v_has_g10, v_g50_is_a
            FROM public.member_licenses
            WHERE person_number = v_member.person_number AND is_active IS TRUE;

            IF v_has_g50 IS TRUE THEN
                IF v_g50_is_a IS TRUE THEN
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
            INSERT INTO temp_contrib_pos VALUES (
                v_pos_nr,
                COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung),
                v_geb.betrag,
                'Debit',
                v_jb_key,
                COALESCE(v_geb.konto_haben, '3410'),
                v_geb.kategorie
            );
            v_pos_nr := v_pos_nr + 1;
        END IF;

        -- --- SCHRITT 2: Lizenzen abrechnen ---
        v_own_lic_charged := false;
        v_has_own_g50 := false;

        FOR v_lic IN
            SELECT *
            FROM public.member_licenses
            WHERE person_number = v_member.person_number AND is_active IS TRUE
        LOOP
            IF v_lic.license_invoicing_club_name ILIKE '%muhen%' OR v_lic.club_number = '1.19.0.05.184' OR v_lic.is_main_club IS TRUE THEN
                IF NOT v_own_lic_charged THEN
                    IF v_is_junior THEN
                        v_jb_key := 'LI002'; -- Lizenz Junior (CHF 0)
                    ELSE
                        v_jb_key := 'LI001'; -- Lizenz Normal
                    END IF;

                    SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = v_jb_key;
                    IF FOUND THEN
                        INSERT INTO temp_contrib_pos VALUES (
                            v_pos_nr,
                            COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung),
                            v_geb.betrag,
                            'Debit',
                            v_jb_key,
                            COALESCE(v_geb.konto_haben, '3411'),
                            v_geb.kategorie
                        );
                        v_pos_nr := v_pos_nr + 1;
                        v_own_lic_charged := true;
                    END IF;
                END IF;

                IF v_lic.membership_category ILIKE '%g50%' OR v_lic.membership_category ILIKE '%gewehr 50%' THEN
                    v_has_own_g50 := true;
                END IF;
            ELSE
                -- Fremdlizenz (CHF 0)
                SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'LI003';
                IF FOUND THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung) || ' (' || COALESCE(v_lic.license_invoicing_club_name, 'Fremdverein') || ')',
                        v_geb.betrag,
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
        -- Standard: G50m Schützen mit Lizenz bei Muhen zahlen Schützenhaus (nicht Junioren/Passive)
        v_charge_ge := (NOT v_is_junior AND NOT v_is_passive AND v_has_own_g50);

        -- Override aus member_participations prüfen
        SELECT * INTO v_ge_override 
        FROM public.member_participations 
        WHERE person_number = v_member.person_number::TEXT AND year = p_year AND event_key = 'GE001';
        
        IF FOUND THEN
            v_charge_ge := (v_ge_override.teilgenommen > 0);
        END IF;

        IF v_charge_ge THEN
            SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'GE001';
            IF FOUND THEN
                INSERT INTO temp_contrib_pos VALUES (
                    v_pos_nr,
                    COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung),
                    v_geb.betrag,
                    'Debit',
                    'GE001',
                    COALESCE(v_geb.konto_haben, '3413'),
                    v_geb.kategorie
                );
                v_pos_nr := v_pos_nr + 1;
            END IF;
        END IF;

        -- --- SCHRITT 4: Wettkampfteilnahmen & Variable Posten ---
        FOR v_part IN
            SELECT 
                p.*,
                COALESCE(g.betrag, 0.00) AS geb_betrag,
                COALESCE(g.bezeichnung_frontend, g.bezeichnung, p.event_key) AS geb_bezeichnung,
                COALESCE(g.konto_haben, '1300') AS konto_haben,
                COALESCE(g.kategorie, 'Wettkampf') AS geb_kategorie,
                COALESCE(g.sort_order, 100) AS sort_order
            FROM public.member_participations p
            JOIN public.gebuehren_config g ON g.key = p.event_key
            WHERE p.person_number = v_member.person_number::TEXT
              AND p.year = p_year
              AND p.teilgenommen > 0
              AND p.event_key != 'GE001'
              AND p.event_key != 'RA001'
              AND p.event_key != 'RA002'
            ORDER BY g.sort_order, p.event_key
        LOOP
            DECLARE
                v_part_betrag NUMERIC(10,2);
                v_part_desc VARCHAR(255);
            BEGIN
                -- Counter (z.B. Volksschiessen Stiche)
                IF v_part.event_key = 'KK008' THEN
                    v_part_betrag := v_part.geb_betrag * v_part.teilgenommen;
                    v_part_desc := v_part.geb_bezeichnung || ' (' || v_part.teilgenommen || ' Stich' || CASE WHEN v_part.teilgenommen > 1 THEN 'e' ELSE '' END || ')';
                ELSE
                    v_part_betrag := v_part.geb_betrag;
                    v_part_desc := v_part.geb_bezeichnung;
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

                -- Falls Nachwuchskategorie: für Gegenbuchung merken
                IF v_is_junior AND (v_part.geb_kategorie ILIKE '%kostenübernahme%' OR v_part.geb_kategorie ILIKE '%kostenuebernahme%') THEN
                    v_youth_subsidy_total := v_youth_subsidy_total + v_part_betrag;
                    IF v_part.konto_haben IS NOT NULL THEN
                        v_youth_konto := v_part.konto_haben;
                    END IF;
                END IF;
            END;
        END LOOP;

        -- --- SCHRITT 5: Rabatte (RA001 / RA002) ---
        -- A) Vorstand aus member_functions
        FOR v_lic IN
            SELECT *
            FROM public.member_functions
            WHERE person_number = v_member.person_number
              AND (official_function_exit_date IS NULL OR official_function_exit_date >= (p_year::TEXT || '-01-01')::DATE)
        LOOP
            -- Vorstand
            IF (v_lic.rabattkategorie = 'RA001' OR v_lic.use_on_board_and_functionary_report IS TRUE) 
               AND NOT v_has_ra001 AND NOT v_is_honorary THEN
                SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'RA001';
                IF FOUND THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung),
                        v_geb.betrag,
                        'Credit',
                        'RA001',
                        COALESCE(v_geb.konto_haben, '3410'),
                        v_geb.kategorie
                    );
                    v_pos_nr := v_pos_nr + 1;
                    v_has_ra001 := true;
                END IF;
            END IF;

            -- Hausmeister aus Funktion (historischer Fallback)
            IF (v_lic.rabattkategorie = 'RA002' OR v_lic.official_function_category ILIKE '%hausmeister%') 
               AND NOT v_has_ra002 THEN
                SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'RA002';
                IF FOUND THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung),
                        v_geb.betrag,
                        'Credit',
                        'RA002',
                        COALESCE(v_geb.konto_haben, '6002'),
                        v_geb.kategorie
                    );
                    v_pos_nr := v_pos_nr + 1;
                    v_has_ra002 := true;
                END IF;
            END IF;
        END LOOP;

        -- B) Option B: Hausmeister-Rabatt direkt via public.member_participations (event_key = 'RA002')
        IF NOT v_has_ra002 THEN
            IF EXISTS (
                SELECT 1 FROM public.member_participations
                WHERE person_number = v_member.person_number::text
                  AND year = p_year
                  AND event_key = 'RA002'
                  AND teilgenommen > 0
            ) THEN
                SELECT * INTO v_geb FROM public.gebuehren_config WHERE key = 'RA002';
                IF FOUND THEN
                    INSERT INTO temp_contrib_pos VALUES (
                        v_pos_nr,
                        COALESCE(v_geb.bezeichnung_frontend, v_geb.bezeichnung),
                        v_geb.betrag,
                        'Credit',
                        'RA002',
                        COALESCE(v_geb.konto_haben, '6002'),
                        v_geb.kategorie
                    );
                    v_pos_nr := v_pos_nr + 1;
                    v_has_ra002 := true;
                END IF;
            END IF;
        END IF;

        -- --- SCHRITT 6: Jugendförderung Übernahme SpS Muhen ---
        IF v_youth_subsidy_total > 0 THEN
            INSERT INTO temp_contrib_pos VALUES (
                v_pos_nr,
                'Beitrag Jugendförderung Verein (Übernahme SpS Muhen)',
                -v_youth_subsidy_total,
                'Credit',
                'KOSTENUEBERNAHME_JUGEND',
                v_youth_konto,
                'Kostenübernahme_Jugend'
            );
            v_pos_nr := v_pos_nr + 1;
        END IF;

        -- --- SCHRITT 7: Total & Floor-Regel ---
        SELECT COALESCE(SUM(betrag), 0.00) INTO v_total FROM temp_contrib_pos;
        IF NOT v_has_ra002 THEN
            v_total := GREATEST(0.00, v_total);
        END IF;

        -- Bestehende Kopfdaten (Zahlung etc.) beibehalten, falls vorhanden
        SELECT status, invoice_id, payment_date, payment_method, document_ref, created_at
        INTO v_existing_status, v_existing_inv_id, v_existing_pay_date, v_existing_pay_method, v_existing_doc_ref, v_existing_created_at
        FROM public.contributions_header
        WHERE id = v_header_id;

        -- Header einfügen / aktualisieren
        INSERT INTO public.contributions_header (
            id,
            person_number,
            year,
            status,
            gesamt,
            payment_date,
            payment_method,
            document_ref,
            invoice_id,
            created_at,
            updated_at
        ) VALUES (
            v_header_id,
            v_member.person_number::TEXT,
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
        ON CONFLICT (person_number, year) DO UPDATE SET
            gesamt = EXCLUDED.gesamt,
            updated_at = now();

        -- Positionen schreiben
        DELETE FROM public.contributions_positions WHERE header_id = v_header_id;

        INSERT INTO public.contributions_positions (
            id,
            header_id,
            person_number,
            year,
            position_nr,
            beschreibung,
            betrag,
            typ,
            source_field,
            konto,
            last_upd
        )
        SELECT 
            v_header_id || '-' || pos_nr,
            v_header_id,
            v_member.person_number::TEXT,
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
        'calculated_count', v_created_count,
        'message', 'Beitragsberechnung für ' || p_year || ' erfolgreich abgeschlossen (' || v_created_count || ' Mitglieder berechnet).'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_member_contributions(INTEGER, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_member_contributions(INTEGER, TEXT[]) TO anon;
