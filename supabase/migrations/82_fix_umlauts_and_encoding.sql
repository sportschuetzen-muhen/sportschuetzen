-- ==============================================================================
-- 82_fix_umlauts_and_encoding.sql
-- Korrektur von Zeichencodierungsfehlern (Umlaute äöü / Akzente) in Supabase
-- Betrifft:
-- 1. public.documents & public.document_chunks (Import alter Dateinamen mit U+FFFD)
-- 2. public.endschiessen_stiche (Stiche & Beschreibungen)
-- 3. public.contest_results (Schützennamen)
-- 4. public.accounting_cost_allocations (Zuteilungsquoten & Beschreibungen)
-- 5. public.events, event_items, event_checklists, event_shifts
-- 6. public.role_permissions
-- 7. public.rental_pricing & rental_settings
-- 8. public.gebuehren_config
-- 9. public.system_mail_configs & system_app_configs
-- 10. public.invoice_positions
-- ==============================================================================

-- 1. VEREINSDOKUMENTE & ARCHIV (public.documents: 38 Dokumente mit U+FFFD)
UPDATE public.documents SET title = '1919-12-04 Gründung', description = 'Generalversammlung: 1919-12-04 Gründung' WHERE id = 'bee2c8c0-be5b-42fe-9115-37585bcd3cae';
UPDATE public.documents SET title = '1926-00-00 Beteiligte Schützenhaus Neubau', description = 'Generalversammlung: 1926-00-00 Beteiligte Schützenhaus Neubau' WHERE id = 'e5dee7ea-ffbc-47b7-aed8-30e674218b21';
UPDATE public.documents SET title = '1947-11-10 Gönnerschreiben', description = 'Generalversammlung: 1947-11-10 Gönnerschreiben' WHERE id = 'def87834-96c6-4b69-b8d8-d14e766c19db';
UPDATE public.documents SET title = '1978 Jahresbericht Präsident KK', description = 'Generalversammlung: 1978 Jahresbericht Präsident KK' WHERE id = '777838e2-dc91-41ac-9559-39d4d86cd893';
UPDATE public.documents SET title = '1979 Jahresbericht Präsident KK', description = 'Generalversammlung: 1979 Jahresbericht Präsident KK' WHERE id = '0d952616-31f8-4937-b10c-d4c1d6b3dfc5';
UPDATE public.documents SET title = '1980 Jahresbericht Präsident KK', description = 'Generalversammlung: 1980 Jahresbericht Präsident KK' WHERE id = 'db979ad6-260a-42b5-a2f4-ab72add91116';
UPDATE public.documents SET title = '1981 Jahresbericht Präsident KK', description = 'Generalversammlung: 1981 Jahresbericht Präsident KK' WHERE id = 'd6fd61c3-d305-4d0f-94f5-5f3626b94dda';
UPDATE public.documents SET title = '1982 Jahresbericht Präsident KK', description = 'Generalversammlung: 1982 Jahresbericht Präsident KK' WHERE id = '27f4b80c-a5eb-439d-be84-d002838e48ce';
UPDATE public.documents SET title = '1983 Jahresbericht Präsident KK', description = 'Generalversammlung: 1983 Jahresbericht Präsident KK' WHERE id = '7a4449ef-c62d-4786-964a-44d262a04b46';
UPDATE public.documents SET title = '1984 Jahresbericht Präsident KK', description = 'Generalversammlung: 1984 Jahresbericht Präsident KK' WHERE id = '70a5edbc-3fba-4412-9332-b0e7a6209384';
UPDATE public.documents SET title = '1985 Jahresbericht Präsident KK', description = 'Generalversammlung: 1985 Jahresbericht Präsident KK' WHERE id = 'f1bb0969-0ece-4b8a-9453-e63c4fcaad34';
UPDATE public.documents SET title = '1986 Jahresbericht Präsident KK', description = 'Generalversammlung: 1986 Jahresbericht Präsident KK' WHERE id = 'c7761057-6392-4d20-a378-30c64539a5da';
UPDATE public.documents SET title = '1987 Jahresbericht Präsident KK', description = 'Generalversammlung: 1987 Jahresbericht Präsident KK' WHERE id = '7fe99bfa-9fac-493e-879b-0f93c8944871';
UPDATE public.documents SET title = '1988 Jahresbericht des Präsidenten', description = 'Generalversammlung: 1988 Jahresbericht des Präsidenten' WHERE id = '832fcf52-1d0a-41e8-86a4-463e36fb4de6';
UPDATE public.documents SET title = '1988 Jahresbericht Präsident', description = 'Generalversammlung: 1988 Jahresbericht Präsident' WHERE id = '02048761-23ce-4b0e-9281-747769c784a0';
UPDATE public.documents SET title = '1989 Jahresbericht Präsident KK', description = 'Generalversammlung: 1989 Jahresbericht Präsident KK' WHERE id = '407cdb43-348a-4981-9471-d3b226270b42';
UPDATE public.documents SET title = '1989 Jahresbericht Präsident LG', description = 'Generalversammlung: 1989 Jahresbericht Präsident LG' WHERE id = '696ba3c8-2b24-4f6a-9ab2-37a06f0f870c';
UPDATE public.documents SET title = '1990 Jungschützenbericht', description = 'Generalversammlung: 1990 Jungschützenbericht' WHERE id = '574a8677-f937-4da8-8e79-cb091902020e';
UPDATE public.documents SET title = 'ca 1990 Chronik verfasst von M. Löscher', description = 'Vereinschronik: ca 1990 Chronik verfasst von M. Löscher' WHERE id = 'eb4288f4-ab02-4adc-86f3-0f3202f56de1';
UPDATE public.documents SET title = '1991 Jungschützenbericht', description = 'Generalversammlung: 1991 Jungschützenbericht' WHERE id = '64202ec8-a1bc-45ba-9d8e-90b4694ed78a';
UPDATE public.documents SET title = '1992 Jungschützenbericht', description = 'Generalversammlung: 1992 Jungschützenbericht' WHERE id = 'bbea26d4-d530-4226-9ed4-2cd641c9bd5f';
UPDATE public.documents SET title = '1992 Jahresbericht des Präsidenten', description = 'Generalversammlung: 1992 Jahresbericht des Präsidenten' WHERE id = '7325e0e2-25a1-4322-a823-d28b6953b33c';
UPDATE public.documents SET title = '1993 Jungschützenbericht', description = 'Generalversammlung: 1993 Jungschützenbericht' WHERE id = 'f4e14aeb-8901-4d26-af27-b0b464aafd58';
UPDATE public.documents SET title = '1993 Jahresbericht des Präsidenten', description = 'Generalversammlung: 1993 Jahresbericht des Präsidenten' WHERE id = 'f3c68620-1d88-4baf-b9bd-9779c2c65a12';
UPDATE public.documents SET title = '1994 Jahresbericht des Präsidenten', description = 'Generalversammlung: 1994 Jahresbericht des Präsidenten' WHERE id = '0ae0d63c-1b13-4d79-a49d-fe79003f9a1c';
UPDATE public.documents SET title = '1995-05-23 a.o. Generalversammlung neues Schützenhaus', description = 'Generalversammlung: 1995-05-23 a.o. Generalversammlung neues Schützenhaus' WHERE id = 'a93625aa-152c-4c03-958a-9f619afe03eb';
UPDATE public.documents SET title = '1997 Vereinschronik verfasst durch Hans Böni', description = 'Vereinschronik: 1997 Vereinschronik verfasst durch Hans Böni' WHERE id = '591d255a-c6f6-495e-a726-a46c7476f114';
UPDATE public.documents SET title = '2001 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2001 Jahresbericht des Präsidenten' WHERE id = '6fb6c091-2b6d-4491-8da7-3140012ec951';
UPDATE public.documents SET title = '2002 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2002 Jahresbericht des Präsidenten' WHERE id = '545b385b-96d7-4994-a531-efe4ad4ff710';
UPDATE public.documents SET title = '2003 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2003 Jahresbericht des Präsidenten' WHERE id = '8954ba1a-3776-4a3a-87ba-708faf9f42df';
UPDATE public.documents SET title = '2004 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2004 Jahresbericht des Präsidenten' WHERE id = 'aeaa7435-ac38-43d6-a36c-603608c733b9';
UPDATE public.documents SET title = '2004 1  Jahresbericht des Präsidenten', description = 'Generalversammlung: 2004 1  Jahresbericht des Präsidenten' WHERE id = 'a5e4bb6a-46e1-47a0-a248-be4407f74c52';
UPDATE public.documents SET title = '2005 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2005 Jahresbericht des Präsidenten' WHERE id = '45bf2a6a-a945-42ee-bbc9-6fa80b28d613';
UPDATE public.documents SET title = '2006 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2006 Jahresbericht des Präsidenten' WHERE id = 'd55dc9c4-da2a-46d1-944e-beee96898e0e';
UPDATE public.documents SET title = '2007 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2007 Jahresbericht des Präsidenten' WHERE id = 'eedb8988-eac5-4409-af4d-b195ea596aff';
UPDATE public.documents SET title = '2010 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2010 Jahresbericht des Präsidenten' WHERE id = '265515b0-8fa5-4be0-b523-5c3f6143214a';
UPDATE public.documents SET title = '2015 Jahresbericht des Präsidenten', description = 'Generalversammlung: 2015 Jahresbericht des Präsidenten' WHERE id = '3995e0b6-a5c2-4dc0-b98c-77eb15f45fd6';
UPDATE public.documents SET title = '2021-02-16_Info an die Schützen', description = 'Generalversammlung: 2021-02-16_Info an die Schützen' WHERE id = 'ba16fc41-45a3-435c-92f5-e2222c1a0adb';

-- Muster-Bereinigung für allfällige weitere Reste in documents
UPDATE public.documents
SET 
    title = replace(
        replace(
        replace(
        replace(
        replace(
        replace(
        replace(
        replace(title, 
            'B' || chr(65533) || 'ni', 'Böni'),
            'L' || chr(65533) || 'scher', 'Löscher'),
            'Gr' || chr(65533) || 'ndung', 'Gründung'),
            'Sch' || chr(65533) || 'tzen', 'Schützen'),
            'G' || chr(65533) || 'nner', 'Gönner'),
            'Pr' || chr(65533) || 'sident', 'Präsident'),
            'Jungsch' || chr(65533) || 'tzen', 'Jungschützen'),
            chr(65533), ''
    ),
    description = replace(
        replace(
        replace(
        replace(
        replace(
        replace(
        replace(
        replace(description, 
            'B' || chr(65533) || 'ni', 'Böni'),
            'L' || chr(65533) || 'scher', 'Löscher'),
            'Gr' || chr(65533) || 'ndung', 'Gründung'),
            'Sch' || chr(65533) || 'tzen', 'Schützen'),
            'G' || chr(65533) || 'nner', 'Gönner'),
            'Pr' || chr(65533) || 'sident', 'Präsident'),
            'Jungsch' || chr(65533) || 'tzen', 'Jungschützen'),
            chr(65533), ''
    ),
    updated_at = now()
WHERE title LIKE '%' || chr(65533) || '%' OR description LIKE '%' || chr(65533) || '%';

-- 1b. DOCUMENT CHUNKS
UPDATE public.document_chunks
SET document_name = replace(document_name, 'Gr' || chr(65533) || 'ndung', 'Gründung')
WHERE document_name LIKE '%' || chr(65533) || '%';


-- 2. ENDSCHIESSEN STICHE
UPDATE public.endschiessen_stiche
SET 
    title = CASE code
        WHEN 'endstich' THEN 'Endstich (20 Schuss)'
        WHEN 'final' THEN 'Meister-Final (Top 8)'
        WHEN 'gaben' THEN 'Gabenstich / Fleischstich'
        WHEN 'glueck' THEN 'Glücksstich / Differenzler'
        WHEN 'sie_er' THEN 'Sie & Er (Stich à Deux)'
        ELSE title
    END,
    description = CASE code
        WHEN 'endstich' THEN 'Hauptwettkampf mit 2 Passen à 10 Schuss (Ganz- und Zehntelwertung). Zählt zur Jahresmeisterschaft.'
        WHEN 'final' THEN 'Ausscheidungsschiessen der 8 besten Schützen des Endstichs über Serien 1 bis 8.'
        WHEN 'gaben' THEN 'Preise vom Gabentempel. Wertung nach bestem Tiefschuss / Teiler.'
        WHEN 'glueck' THEN 'Geheimer Zielwert vor dem Schiessen deklariert. Kleinste Differenz gewinnt.'
        WHEN 'sie_er' THEN 'Partnerstich: 2 Personen (Aktivschütze + Partner/Gast), kombiniertes Total.'
        ELSE description
    END,
    updated_at = now()
WHERE jahr = '2026';


-- 3. CONTEST RESULTS (Mannschaftsresultate Namen)
UPDATE public.contest_results
SET name = 'Luginbühl Jürg'
WHERE id = 'mannschaft_2026_1048717' OR name LIKE 'Lugin%hl J%rg';

UPDATE public.contest_results
SET name = 'Läuppi Raphael'
WHERE id = 'mannschaft_2026_1857354' OR name LIKE 'L%uppi Raphael';


-- 4. INVOICE POSITIONS
UPDATE public.invoice_positions
SET description = replace(description, 'Sch??tzenstube', 'Schützenstube')
WHERE description LIKE '%Sch??tzenstube%';


-- 5. ACCOUNTING COST ALLOCATIONS
INSERT INTO public.accounting_cost_allocations (key, bereich, label, konten, quote_percent, beschreibung, sort_order)
VALUES
    ('vermietung_entschaedigung_4011', 'vermietung', 'Vermietungsentschädigung (Künzlis)', '4011', 100.00, 'Direkte Entschädigung für Wohnungs-/Schlüsselübergabe und Abnahme (100% direkt)', 10),
    ('vermietung_reinigung_4010', 'vermietung', 'Reinigung & Verbrauch (Vermietungsanteil)', '4010,4002', 70.00, 'Anteil der vermietungsbedingten Reinigung und Verbrauchsmaterial', 20),
    ('vermietung_energie_6400', 'vermietung', 'Energie & Wasser (Vermietungsanteil)', '6400', 30.00, 'Strom- und Wasserverbrauch für Ganztages-Vermietungsanlässe (Heizung, Küche)', 30),
    ('vermietung_unterhalt_6000', 'vermietung', 'Gebäudeunterhalt (Gemeinkostenanteil)', '6000,6010', 10.00, 'Laufender Schützenstuben-Unterhalt (ohne vereinsbezogene Grossinvestitionen)', 40),
    ('vermietung_versicherung_6301', 'vermietung', 'Sach- & Haftpflichtversicherung', '6301,6302', 10.00, 'Zugeordneter Versicherungsanteil für externe Raumnutzung', 50),
    ('wirtschaft_reinigung_4010', 'wirtschaft', 'Reinigung Wirtschaft (Stubenbetrieb)', '4010,4002', 30.00, 'Reinigungsanteil für den laufenden Schiess- und Festwirtschaftsbetrieb', 60),
    ('wirtschaft_anlaesse_abzug', 'wirtschaft', 'Pauschalabzug Vereinsanlässe vom Wareneinsatz', '4000,4001', 15.00, 'Pauschale Auslagerung von Getränken/Lebensmitteln für GV, Putztag, Endschiessen', 70)
ON CONFLICT (key) DO UPDATE
SET
    label = EXCLUDED.label,
    konten = EXCLUDED.konten,
    quote_percent = EXCLUDED.quote_percent,
    beschreibung = EXCLUDED.beschreibung,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();


-- 6. ROLE PERMISSIONS
UPDATE public.role_permissions SET description = 'Anlässe & Controlling verwalten' WHERE permission = 'anlaesse.manage';
UPDATE public.role_permissions SET description = 'Anlässe & Umfragen verwalten' WHERE permission = 'umfragen.manage';
UPDATE public.role_permissions SET description = 'Anlässe & Controlling einsehen' WHERE permission = 'anlaesse.view';


-- 7. EVENTS & PLANER
UPDATE public.events
SET description = 'Standard-Festwirtschaft mit Grill, Getränken, Lampionumzug und Feuerwerk.'
WHERE description LIKE '%Standard-Festwirtschaft mit Grill, Getr??nken%';

UPDATE public.event_items
SET category = 'Getränke'
WHERE category LIKE 'Getr??nke';

UPDATE public.event_items
SET item_name = 'Bratwurst mit Bürli'
WHERE item_name LIKE 'Bratwurst mit B??rli';

UPDATE public.event_items
SET item_name = 'Cervelat mit Bürli'
WHERE item_name LIKE 'Cervelat mit B??rli';

UPDATE public.event_items
SET item_name = 'Bier Feldschlösschen 33cl'
WHERE item_name LIKE 'Bier Feldschl??sschen 33cl';

UPDATE public.event_checklists
SET phase = 'Durchführung'
WHERE phase LIKE 'Durchf??hrung';

UPDATE public.event_checklists
SET task = 'Bewilligung für Feuerwerk & Festwirtschaft einholen', assigned_to = 'Präsident'
WHERE task LIKE 'Bewilligung f??r Feuerwerk%';

UPDATE public.event_checklists
SET task = 'Lieferanten anfragen & Preise bestätigen'
WHERE task LIKE 'Lieferanten anfragen & Preise best??tigen';

UPDATE public.event_checklists
SET task = 'Festbänke & Zelte aufstellen'
WHERE task LIKE 'Festb??nke & Zelte aufstellen';

UPDATE public.event_checklists
SET task = 'Kühlschränke & Grill anschliessen'
WHERE task LIKE 'K??hlschr??nke & Grill anschliessen';

UPDATE public.event_checklists
SET task = 'Zelte abbrechen & Schützenhaus reinigen'
WHERE task LIKE 'Zelte abbrechen & Sch??tzenhaus reinigen';

UPDATE public.event_shifts
SET role_name = 'Getränkeausgabe', description = 'Bier, Softdrinks, Mineral servieren'
WHERE role_name LIKE 'Getr??nkeausgabe' AND role_name NOT LIKE '%Sp??t%';

UPDATE public.event_shifts
SET role_name = 'Getränkeausgabe Spätschicht', description = 'Bar- und Getränkebetrieb bis Festende'
WHERE role_name LIKE '%Sp??tschicht%';

UPDATE public.event_shifts
SET description = 'Bratwürste, Cervelats & Steaks grillieren'
WHERE role_name = 'Grillmeister' AND description LIKE '%Bratw??rste%';


-- 8. RENTAL PRICING & SETTINGS
UPDATE public.rental_pricing
SET description = 'Ganzer Tag Schützenstube (Standard)'
WHERE tariff_code = 'standard_tag';

UPDATE public.rental_settings
SET description = 'Google Calendar ID für Belegungen'
WHERE setting_key = 'calendar_id';


-- 9. GEBUEHREN CONFIG
UPDATE public.gebuehren_config
SET bemerkung = 'Standard-Zusatzbeitrag für Vereinsbekleidung'
WHERE key = 'Z001';

UPDATE public.gebuehren_config
SET bemerkung = 'Umlage/Teilnahmebeitrag Eidg. Schützenfest'
WHERE key = 'Z002';

UPDATE public.gebuehren_config
SET bemerkung = 'Automatische Kostenübernahme für Junioren-Wettkampfteilnahmen (Option A)'
WHERE key = 'KOSTENUEBERNAHME_JUGEND';


-- 10. SYSTEM CONFIGS & MAILS
UPDATE public.system_app_configs
SET description = 'Aktives LLM-Modell für den Vereins-Archiv-Assistenten (z.B. qwen/qwen3.8-27b, llama-3.3-70b-versatile)'
WHERE key = 'archiv_ai_model';

UPDATE public.system_mail_configs
SET beschreibung = 'Empfänger bei neuen Anfragen über das Kontaktformular der Vereins-Website'
WHERE schluessel = 'Info_Mail_Kontakt_Website';

UPDATE public.system_mail_configs
SET beschreibung = 'Empfänger einer Kopie bei Standblatt-Einreichung via Web-App (PWA)'
WHERE schluessel = 'Info_Mail_Standblatt_Upload';


-- Schema Cache aktualisieren
NOTIFY pgrst, 'reload schema';
