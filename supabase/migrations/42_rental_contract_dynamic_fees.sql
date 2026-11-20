-- ==============================================================================
-- 42_rental_contract_dynamic_fees.sql
-- Migration: Mietvertrag Schützenstube – dynamische Gebühren & Vermieterdaten
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- - Neue Tarife in rental_settings: Glasbruch (pro Glas), Teller (pro Teller),
--   Mietobjekt-Bezeichnung
-- - Kaution entfällt fachlich (deposit = 0)
-- - Vertragsklauseln verwenden Platzhalter statt fest verdrahteter Beträge/Namen:
--   {vermieter_name} {vermieter_telefon} {vermieter_email}
--   {gebuehr_holz} {gebuehr_abfallsack} {gebuehr_reinigung} {gebuehr_storno}
--   {gebuehr_glas} {gebuehr_teller} {mietbetrag}
--   Die Ersetzung erfolgt in der Edge Function generate-pdf (generate-contract)
--   aus public.rental_settings.
-- ==============================================================================

BEGIN;

-- 1. Neue / bereinigte Tarife & Einstellungen
INSERT INTO public.rental_settings (setting_key, setting_value, description)
VALUES
    ('glass_fee', '2', 'Glasbruch pro Glas in CHF'),
    ('plate_fee', '5', 'Glasbruch / Bruch pro Teller in CHF'),
    ('rental_object', 'Schützenstube Muhen inkl. Mobiliar, Küche, Geschirr und WC-Anlagen', 'Bezeichnung Mietobjekt (Mietvertrag-Kopf)')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.rental_settings (setting_key, setting_value, description)
VALUES ('deposit_amount', '0', 'Kaution entfällt (nicht mehr verwendet)')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = '0', description = EXCLUDED.description, updated_at = now();

UPDATE public.rental_pricing SET deposit_chf = 0.00;

-- 2. Vertragsklauseln dynamisieren (Bullets je Zeile, keine Leerzeilen)
UPDATE public.document_template_clauses SET clause_text =
    '• Die Schützenstube dient den Sportschützen Muhen als Vereinslokal.' || E'\n' ||
    '• Sie kann an Privatpersonen, Vereine und Institutionen vermietet werden.' || E'\n' ||
    '• Die Mieter haben zur Kenntnis zu nehmen, dass während der Nutzung Schiesslärm auftreten kann. Eine Mietreduktion aus diesem Grund ist ausgeschlossen.',
    updated_at = now()
WHERE template_id = 'mietvertrag_rueteli' AND clause_number = '1';

UPDATE public.document_template_clauses SET clause_text =
    '• Dem Mieter stehen die Schützenstube, der Zugang zu den Elektroanlagen sowie die Toiletten zur Verfügung. Der Schiessraum dient als Durchgang zu den Sanitärräumen und darf nicht anderweitig genutzt werden. Andere Räume des Gebäudes sind nicht zugänglich.' || E'\n' ||
    '• Das vorhandene Kücheninventar darf benutzt werden.' || E'\n' ||
    '• Ein Wirte-Recht besteht nicht: Der Verkauf von Speisen und Getränken im und um das Schützenhaus ist untersagt. Selbst mitgebrachte Lebensmittel dürfen in der Küche zubereitet werden.' || E'\n' ||
    '• Der Geschirrspüler kann verwendet werden (bitte Gebrauchsanweisung beachten).' || E'\n' ||
    '• Das Cheminée dient ausschliesslich zu Heizzwecken – Grillieren ist untersagt. Die Gebrauchsanleitung ist zwingend vorgängig zu lesen.' || E'\n' ||
    '• Eine bereitgestellte Kiste Cheminéeholz ist im Mietpreis inbegriffen. Jede weitere Kiste wird mit CHF {gebuehr_holz} verrechnet.' || E'\n' ||
    '• Der Abfall ist vom Mieter selbst zu entsorgen. Liegengebliebener Abfall wird vom Vermieter in kostenpflichtigen Säcken entsorgt (CHF {gebuehr_abfallsack} pro Sack).',
    updated_at = now()
WHERE template_id = 'mietvertrag_rueteli' AND clause_number = '2';

UPDATE public.document_template_clauses SET clause_text =
    '• Die Benutzer sind verpflichtet, sorgfältig mit dem Schützenhaus und der Einrichtung umzugehen.' || E'\n' ||
    '• Aschenbecher und Cheminéeasche sind in die vorgesehenen Metallkübel zu entleeren.' || E'\n' ||
    '• Fehlendes oder beschädigtes Inventar (z. B. Besteck, Geschirr) wird dem Mieter in Rechnung gestellt. Glasbruch wird mit CHF {gebuehr_glas} pro Glas und CHF {gebuehr_teller} pro Teller verrechnet.' || E'\n' ||
    '• Ab 20:00 Uhr ist das Zünden von Knallkörpern oder ähnlichen Gegenständen untersagt. Eine Ausnahmebewilligung kann nur auf schriftliches Gesuch hin durch den Gemeinderat Muhen erteilt werden (gemäss Polizeireglement der Gemeinde Muhen). Bei störendem Verhalten kann dem Mieter das Nutzungsrecht entzogen werden.' || E'\n' ||
    '• Die gemieteten Räumlichkeiten, inklusive Inventar, Toiletten und Aussenparkplatz, sind besenrein und frei von Schäden zu übergeben.' || E'\n' ||
    '• Zusätzlicher Reinigungsaufwand durch den Hauswart (z. B. starke Verschmutzungen, Klebereste, Kaugummi) wird mit CHF {gebuehr_reinigung} pro Stunde verrechnet.',
    updated_at = now()
WHERE template_id = 'mietvertrag_rueteli' AND clause_number = '3';

UPDATE public.document_template_clauses SET clause_text =
    '• Zuständig für die Vermietung ist:' || E'\n' ||
    'Sportschützen Muhen, {vermieter_name}' || E'\n' ||
    'Tel.: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    updated_at = now()
WHERE template_id = 'mietvertrag_rueteli' AND clause_number = '6';

UPDATE public.document_template_clauses SET clause_text =
    '• Der Mietvertrag wird mit der Reservation des Datums online per E-Mail zugestellt. Mit der fristgerechten Zahlung gilt der Mietvertrag als abgeschlossen und das Datum ist definitiv reserviert.' || E'\n' ||
    '• Mit der Zahlung bestätigt der Mieter, dass er den Inhalt dieses Benützungsreglements vollständig gelesen, verstanden und akzeptiert hat.' || E'\n' ||
    '• Die Mietgebühr ist innerhalb von 14 Tagen nach Zustellung des Mietvertrags zu bezahlen. Erfolgt die Zahlung nicht innerhalb dieser Frist, verfällt die Reservation automatisch und der Mietvertrag ist hinfällig.' || E'\n' ||
    '• Bei einer Stornierung durch den Mieter nach erfolgter Zahlung wird eine Bearbeitungsgebühr von CHF {gebuehr_storno} einbehalten. Der verbleibende Betrag der bereits geleisteten Miete wird dem Mieter zurückerstattet.',
    updated_at = now()
WHERE template_id = 'mietvertrag_rueteli' AND clause_number = '7';

UPDATE public.document_template_clauses SET clause_text =
    '1. Holz-Zuschlag (pro zusätzliche Kiste CHF {gebuehr_holz})' || E'\n' ||
    '2. Glasbruch (Glas CHF {gebuehr_glas}, Teller CHF {gebuehr_teller})' || E'\n' ||
    '3. Andere beschädigte Gegenstände (nach Aufwand)' || E'\n' ||
    '4. Zusätzliche Reinigung durch Hauswart (CHF {gebuehr_reinigung} / Stunde)' || E'\n' ||
    '5. Getränkeverbrauch' || E'\n' ||
    '6. Kehrichtentsorgung (Kehrichtsack CHF {gebuehr_abfallsack})' || E'\n' ||
    'Der Betrag, welcher sich aus der Rückgabe der Mietsache ergibt, ist bar oder per TWINT/Banküberweisung nach Nutzung der Räumlichkeiten zu begleichen.',
    updated_at = now()
WHERE template_id = 'mietvertrag_rueteli' AND clause_number = 'Checkliste';

COMMIT;
