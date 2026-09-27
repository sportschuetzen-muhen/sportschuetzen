-- ==============================================================================
-- 27_document_templates_and_clauses.sql
-- Migration: Phase 12 - Zentraler Dokumenten- & Vorlagen-Pool (Enterprise Standard)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. MASTER-TABELLE: public.document_templates (Kopf- & Metadaten)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_templates (
    id VARCHAR(100) PRIMARY KEY,                         -- z.B. 'jahresbeitrag', 'mietvertrag_rueteli', 'gv_normal'
    category VARCHAR(50) NOT NULL,                      -- 'rechnung', 'mahnung', 'vertrag', 'gv', 'brief'
    code VARCHAR(50) NOT NULL UNIQUE,                   -- Eindeutiger Abrufcode
    title VARCHAR(255) NOT NULL,
    description TEXT,
    intro TEXT,
    outro TEXT,
    notice TEXT,
    mail_subject VARCHAR(255),
    mail_body TEXT,
    due_days INTEGER DEFAULT 30,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_doc_template_category CHECK (
        category IN ('rechnung', 'mahnung', 'vertrag', 'gv', 'brief', 'quittung', 'sonstige')
    )
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_category ON public.document_templates(category);
CREATE INDEX IF NOT EXISTS idx_doc_templates_code ON public.document_templates(code);

-- ------------------------------------------------------------------------------
-- 2. KLAUSEL-TABELLE: public.document_template_clauses (1:n)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_template_clauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id VARCHAR(100) NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    clause_number VARCHAR(20),                          -- z.B. '1', '7.1', 'Checkliste'
    clause_title VARCHAR(255) NOT NULL,
    clause_text TEXT NOT NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_clauses_template ON public.document_template_clauses(template_id, sort_order);

-- ------------------------------------------------------------------------------
-- 3. VERLUSTFREIE DATENMIGRATION (DEDIZIERT GEHÄRTET GEGEN DUPLIKATE)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoice_layouts' AND table_type = 'BASE TABLE'
    ) THEN
        -- DISTINCT ON garantiert exakt 1 Zeile pro LOWER(TRIM(type)) -> Verhindert ERROR 21000
        INSERT INTO public.document_templates (
            id, category, code, title, intro, outro, notice, mail_subject, mail_body, updated_at
        )
        SELECT DISTINCT ON (LOWER(TRIM(type)))
            LOWER(TRIM(type)) AS id,
            CASE 
                WHEN LOWER(TRIM(type)) LIKE 'mahnung%' THEN 'mahnung'
                WHEN LOWER(TRIM(type)) IN ('freier brief', 'freier_brief', 'mitteilung') THEN 'brief'
                ELSE 'rechnung'
            END AS category,
            LOWER(TRIM(type)) AS code,
            COALESCE(title, 'Rechnungsvorlage'),
            intro,
            outro,
            notice,
            mail_subject,
            mail_body,
            COALESCE(updated_at, now())
        FROM public.invoice_layouts
        WHERE type IS NOT NULL AND TRIM(type) <> ''
        ORDER BY LOWER(TRIM(type)), updated_at DESC NULLS LAST
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            intro = EXCLUDED.intro,
            outro = EXCLUDED.outro,
            notice = EXCLUDED.notice,
            mail_subject = EXCLUDED.mail_subject,
            mail_body = EXCLUDED.mail_body,
            updated_at = EXCLUDED.updated_at;

        -- Idempotente Archivierung der alten Basistabelle
        DROP TABLE IF EXISTS public.invoice_layouts_legacy_pre27 CASCADE;
        ALTER TABLE public.invoice_layouts RENAME TO invoice_layouts_legacy_pre27;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. UPDATABLE BACKWARD-COMPATIBILITY VIEW MIT GEHÄRTETEM TRIGGER
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.invoice_layouts CASCADE;

CREATE OR REPLACE VIEW public.invoice_layouts AS
SELECT 
    dt.code AS type,
    dt.title,
    dt.intro,
    dt.outro,
    dt.notice,
    dt.mail_subject,
    dt.mail_body,
    dt.updated_at
FROM public.document_templates dt
WHERE dt.category IN ('rechnung', 'mahnung', 'brief');

-- Trigger-Funktion: Sauber getrennt zwischen INSERT/UPDATE (NEW) und DELETE (OLD)
CREATE OR REPLACE FUNCTION public.trg_invoice_layouts_upsert()
RETURNS TRIGGER AS $$
DECLARE
    clean_code VARCHAR(50);
    cat VARCHAR(50);
BEGIN
    IF TG_OP = 'DELETE' THEN
        clean_code := LOWER(TRIM(OLD.type));
        DELETE FROM public.document_templates WHERE id = clean_code OR code = clean_code;
        RETURN OLD;
    END IF;

    -- Ab hier nur noch INSERT oder UPDATE (NEW ist sicher belegt)
    clean_code := LOWER(TRIM(NEW.type));
    
    IF clean_code LIKE 'mahnung%' THEN
        cat := 'mahnung';
    ELSIF clean_code IN ('freier brief', 'freier_brief', 'mitteilung') THEN
        cat := 'brief';
    ELSE
        cat := 'rechnung';
    END IF;

    INSERT INTO public.document_templates (
        id, category, code, title, intro, outro, notice, mail_subject, mail_body, version, updated_at
    ) VALUES (
        clean_code,
        cat,
        clean_code,
        COALESCE(NEW.title, 'Rechnung'),
        NEW.intro,
        NEW.outro,
        NEW.notice,
        NEW.mail_subject,
        NEW.mail_body,
        1,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        intro = EXCLUDED.intro,
        outro = EXCLUDED.outro,
        notice = EXCLUDED.notice,
        mail_subject = EXCLUDED.mail_subject,
        mail_body = EXCLUDED.mail_body,
        version = public.document_templates.version + 1,
        updated_at = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_layouts_io_upsert
    INSTEAD OF INSERT OR UPDATE OR DELETE ON public.invoice_layouts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_invoice_layouts_upsert();

-- ------------------------------------------------------------------------------
-- 5. INITIALES SEEDING: STANDARD-DOKUMENTE & REALE VORLAGEN
-- ------------------------------------------------------------------------------

-- A. Standard-Rechnungsvorlagen
INSERT INTO public.document_templates (id, category, code, title, intro, outro, notice, mail_subject, mail_body, due_days)
VALUES
    ('jahresbeitrag', 'rechnung', 'jahresbeitrag', 
     'Rechnung {rechnungsjahr} – Jahresbeitrag Sportschützen Muhen',
     'Sehr geehrte Damen und Herren, lieber {vorname},' || E'\n\n' || 'anbei senden wir dir die Rechnung für deinen Jahresbeitrag des Vereinsjahres {rechnungsjahr}. Wir danken dir herzlich für deine geschätzte Treue und dein Engagement in unserem Verein.',
     'Mit sportlichen Grüssen' || E'\n' || 'Sportschützen Muhen',
     'Zahlbar innert 30 Tagen ohne Abzug. Am Ende dieser Seite findest du deinen persönlichen Schweizer QR-Zahlteil.',
     'Rechnung {rechnungsnummer} – Jahresbeitrag {rechnungsjahr} | Sportschützen Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'anbei senden wir Ihnen die Rechnung für Ihren Jahresbeitrag des Vereinsjahres {rechnungsjahr}.' || E'\n\n' || 'Gesamtbetrag: CHF {gesamtbetrag}' || E'\n' || 'Zahlungsziel: 30 Tage' || E'\n\n' || 'Am Ende des angehängten PDF finden Sie Ihren persönlichen QR-Einzahlungsschein.' || E'\n\n' || 'Vielen Dank für Ihre wertvolle Unterstützung als Mitglied!' || E'\n\n' || 'Mit freundlichen Grüssen' || E'\n' || 'Sportschützen Muhen',
     30),

    ('vermietung', 'rechnung', 'vermietung',
     'Rechnung – Miete Schützenhaus Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'vielen Dank für die Miete unseres Schützenhauses in Muhen. Anbei erhalten Sie die detaillierte Abrechnung gemäss Mietvereinbarung.',
     'Wir hoffen, Sie hatten einen gelungenen Anlass in unserem Schützenhaus und würden uns freuen, Sie wieder begrüssen zu dürfen.' || E'\n\n' || 'Freundliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     'Bitte überweisen Sie den Rechnungsbetrag innert 30 Tagen mittels beiliegendem QR-Zahlteil.',
     'Rechnung {rechnungsnummer} – Miete Schützenhaus Muhen | Sportschützen Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'anbei übersenden wir Ihnen die Rechnung für die Miete unseres Schützenhauses in Muhen.' || E'\n\n' || 'Rechnungsnummer: {rechnungsnummer}' || E'\n' || 'Rechnungsbetrag: CHF {gesamtbetrag}' || E'\n\n' || 'Der QR-Einzahlungsschein befindet sich auf der zweiten Seite des angehängten PDFs.' || E'\n\n' || 'Freundliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     30),

    ('schulsport', 'rechnung', 'schulsport',
     'Rechnung – Schulsport / Kurse',
     'Liebe Kursteilnehmerin, lieber Kursteilnehmer, lieber {vorname},' || E'\n\n' || 'anbei senden wir dir die Abrechnung für den Schulsportkurs / Schiesskurs der Sportschützen Muhen.',
     'Wir wünschen dir weiterhin viel Freude und Gut Schuss!' || E'\n\n' || 'Sportliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     'Bitte begleiche den Betrag bis zum Kursstart / innert 30 Tagen.',
     'Rechnung {rechnungsnummer} – Schulsport | Sportschützen Muhen',
     'Hallo {vorname},' || E'\n\n' || 'anbei erhältst du die Rechnung für deine Teilnahme am Schulsportkurs der Sportschützen Muhen.' || E'\n\n' || 'Betrag: CHF {gesamtbetrag}' || E'\n\n' || 'Der QR-Zahlteil befindet sich im Anhang.' || E'\n\n' || 'Viele Grüsse' || E'\n' || 'Sportschützen Muhen',
     30),

    ('sponsoring', 'rechnung', 'sponsoring',
     'Rechnung – Sponsoring & Gönnerbeitrag',
     'Sehr geehrte Damen und Herren, geschätzte Gönner,' || E'\n\n' || 'im Namen des gesamten Vereins danken wir Ihnen herzlich für Ihre wertvolle Unterstützung als Sponsor / Gönner der Sportschützen Muhen.',
     'Dank Ihres Beitrags können wir die Nachwuchsförderung und den Schiesssport in Muhen nachhaltig sichern.' || E'\n\n' || 'Mit besten Grüssen' || E'\n' || 'Sportschützen Muhen',
     'Zahlbar innert 30 Tagen. QR-Zahlteil untenstehend.',
     'Sponsoring & Gönnerbeitrag {rechnungsjahr} | Sportschützen Muhen',
     'Sehr geehrte Damen und Herren,' || E'\n\n' || 'herzlichen Dank für Ihre Zusage zur Unterstützung der Sportschützen Muhen.' || E'\n\n' || 'Anbei senden wir Ihnen die entsprechende Rechnung (CHF {gesamtbetrag}) inkl. QR-Einzahlungsschein.' || E'\n\n' || 'Mit freundlichen Grüssen' || E'\n' || 'Sportschützen Muhen',
     30),

    ('materialverkauf', 'rechnung', 'materialverkauf',
     'Rechnung – Material- & Kleiderbezug',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'vielen Dank für deinen Materialbezug aus unserem Vereinsinventar. Nachfolgend stellen wir dir die bezogenen Artikel in Rechnung.',
     'Vielen Dank für deine Unterstützung unseres Vereins.' || E'\n\n' || 'Sportliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     'Zahlbar innert 30 Tagen mit beiliegendem QR-Einzahlungsschein.',
     'Rechnung {rechnungsnummer} – Materialverkauf | Sportschützen Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'vielen Dank für deinen Bezug aus unserem Vereinsinventar.' || E'\n\n' || 'Anbei senden wir dir die Rechnung {rechnungsnummer} über CHF {gesamtbetrag} inkl. QR-Einzahlungsschein.' || E'\n\n' || 'Bitte überweise den Betrag innert 30 Tagen.' || E'\n\n' || 'Sportliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     30),

    ('depot_pfand', 'rechnung', 'depot_pfand',
     'Rechnung – Depot / Kaution für Vereinsmaterial',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'anbei erhältst du die Rechnung für das hinterlegte Depot / Pfand für das bezogene Vereinsmaterial.',
     'Dieses Depot wird dir bei unversehrter Rückgabe des Materials vollumfänglich zurückerstattet.' || E'\n\n' || 'Sportliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     'Zahlbar innert 30 Tagen mit beiliegendem QR-Einzahlungsschein.',
     'Rechnung {rechnungsnummer} – Depot / Kaution | Sportschützen Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'anbei senden wir dir die Rechnung {rechnungsnummer} über CHF {gesamtbetrag} für das hinterlegte Depot / Pfand für das bezogene Vereinsmaterial.' || E'\n\n' || 'Dieses Depot wird dir bei unversehrter Rückgabe des Materials vollumfänglich zurückerstattet.' || E'\n\n' || 'Sportliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     30),

    ('mahnung_1', 'mahnung', 'mahnung_1',
     'Zahlungserinnerung zur Rechnung {rechnungsnummer}',
     'Sehr geehrte Damen und Herren, lieber {vorname},' || E'\n\n' || 'bei der Durchsicht unserer Buchhaltung haben wir festgestellt, dass für die unten aufgeführte Rechnung noch kein Zahlungseingang verbucht werden konnte. Sicherlich ist dies im Alltagsstress lediglich untergegangen.',
     'Sollte sich deine Zahlung mit dieser Erinnerung gekreuzt haben, betrachte dieses Schreiben bitte als gegenstandslos. Herzlichen Dank für deine Unterstützung!' || E'\n\n' || 'Sportliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     'Zahlbar innert 14 Tagen mit beiliegendem QR-Einzahlungsschein.',
     'Zahlungserinnerung: Rechnung {rechnungsnummer} | Sportschützen Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'bei der Überprüfung unserer Buchhaltung haben wir festgestellt, dass für folgende Rechnung noch kein Zahlungseingang vorliegt:' || E'\n\n' || 'Rechnungsnummer: {rechnungsnummer}' || E'\n' || 'Ausstehender Betrag: CHF {gesamtbetrag}' || E'\n\n' || 'Wir bitten dich höflich, den Betrag innert 14 Tagen zu begleichen. Den QR-Einzahlungsschein findest du im Anhang.' || E'\n\n' || 'Falls du den Betrag bereits überwiesen hast, betrachte diese E-Mail bitte als gegenstandslos.' || E'\n\n' || 'Sportliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     14),

    ('mahnung_2', 'mahnung', 'mahnung_2',
     '2. Mahnung zur Rechnung {rechnungsnummer}',
     'Sehr geehrte Damen und Herren, lieber {vorname},' || E'\n\n' || 'trotz unserer Zahlungserinnerung konnten wir für die untenstehende Rechnung bis heute leider noch keinen Zahlungseingang feststellen.',
     'Wir bitten dich, den offenen Betrag nun umgehend und ohne weiteren Verzug zu überweisen. Bei allfälligen Fragen oder Unklarheiten stehen wir dir gerne zur Verfügung.' || E'\n\n' || 'Mit freundlichen Grüssen' || E'\n' || 'Sportschützen Muhen',
     'Dringend zahlbar innert 10 Tagen mit beiliegendem QR-Einzahlungsschein.',
     '2. Mahnung: Rechnung {rechnungsnummer} dringend | Sportschützen Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'auf unsere bisherige Zahlungserinnerung konnten wir leider noch keinen Zahlungseingang verzeichnen:' || E'\n\n' || 'Rechnungsnummer: {rechnungsnummer}' || E'\n' || 'Ausstehender Betrag: CHF {gesamtbetrag}' || E'\n\n' || 'Wir bitten Sie/dich hiermit ausdrücklich, die Zahlung innert 10 Tagen vorzunehmen. Den QR-Einzahlungsschein finden Sie/findest du im angehängten PDF.' || E'\n\n' || 'Mit freundlichen Grüssen' || E'\n' || 'Sportschützen Muhen',
     10),

    ('mahnung_3', 'mahnung', 'mahnung_3',
     '3. und letzte Mahnung zur Rechnung {rechnungsnummer}',
     'Sehr geehrte Damen und Herren, lieber {vorname},' || E'\n\n' || 'trotz wiederholter Zahlungserinnerung und Mahnung ist der Rechnungsbetrag für die untenstehende Rechnung noch immer nicht bei uns eingegangen.',
     'Wir setzen dir hiermit eine letzte Zahlungsfrist. Sollte der Betrag bis zum Ablauf der Frist nicht auf unserem Konto gutgeschrieben sein, sehen wir uns gezwungen, ohne weitere Vorankündigung die Betreibung (SchKG) einzuleiten sowie statutarische Massnahmen (Lizenzsperre/Ausschluss) zu prüfen.' || E'\n\n' || 'Mit förmlichen Grüssen' || E'\n' || 'Sportschützen Muhen',
     'Letzte Zahlungsfrist: Zahlbar innert 7 Tagen. Den QR-Zahlteil findest du untenstehend.',
     '3. und LETZTE Mahnung vor rechtlichen Schritten: Rechnung {rechnungsnummer}',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'für die unten aufgeführte Rechnung konnte trotz mehrfacher Mahnung kein Zahlungseingang verbucht werden:' || E'\n\n' || 'Rechnungsnummer: {rechnungsnummer}' || E'\n' || 'Fälliger Betrag: CHF {gesamtbetrag}' || E'\n\n' || 'Wir fordern Sie/dich hiermit letztmalig auf, den ausstehenden Betrag innert 7 Tagen zu überweisen.' || E'\n\n' || 'Nach ungenutztem Ablauf dieser Frist werden wir ohne weiteren Verzug das rechtliche Betreibungsverfahren einleiten. Allfällige Mahn- und Verzugskosten gehen zu Ihren/deinen Lasten.' || E'\n\n' || 'Vorstand Sportschützen Muhen',
     7),

    ('freier_brief', 'brief', 'freier_brief',
     'Mitteilung',
     'Sehr geehrte Damen und Herren, geschätzte Schützenkameradinnen und Schützenkameraden, lieber {vorname},' || E'\n\n' || 'anbei lassen wir Ihnen/dir folgende Mitteilung zukommen:',
     'Bei allfälligen Fragen oder Anliegen stehen wir Ihnen/dir gerne zur Verfügung.' || E'\n\n' || 'Freundliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     '',
     'Mitteilung: {betreff} | Sportschützen Muhen',
     'Guten Tag {vorname} {nachname},' || E'\n\n' || 'anbei senden wir Ihnen unser offizielles Schreiben der Sportschützen Muhen.' || E'\n\n' || 'Das Dokument finden Sie als PDF-Brief im Anhang dieser E-Mail.' || E'\n\n' || 'Freundliche Grüsse' || E'\n' || 'Sportschützen Muhen',
     30)
ON CONFLICT (id) DO NOTHING;

-- B. Mietvertrag Schützenstube Rüteli (Kopfdaten)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice, due_days
) VALUES (
    'mietvertrag_rueteli',
    'vertrag',
    'mietvertrag',
    'Benützungsreglement & Mietvertrag für die Schützenstube Rüteli',
    'Offizieller Mietvertrag und Benützungsordnung der Sportschützen Muhen für die Vermietung der Schützenstube Rüteli.',
    'Benützungsreglement für die Schützenstube Rüteli der Sportschützen Muhen',
    'Der Mieter bestätigt mit der fristgerechten Zahlung der Mietgebühr, dass er die vorliegenden Vertragsbedingungen vollständig gelesen, verstanden und akzeptiert hat.' || E'\n\n' || 'Sportschützen Muhen' || E'\n' || 'Vermietung Schützenstube Hard/Rüteli',
    'Zahlbar innert 14 Tagen mit beiliegendem QR-Einzahlungsschein. Bei Zahlungsverzug verfällt die Reservation automatisch.',
    14
) ON CONFLICT (id) DO NOTHING;

-- C. Mietvertrag Schützenstube Rüteli: Exakte Ziffern 1 bis 8
DELETE FROM public.document_template_clauses WHERE template_id = 'mietvertrag_rueteli';

INSERT INTO public.document_template_clauses (template_id, sort_order, clause_number, clause_title, clause_text, is_mandatory)
VALUES
    ('mietvertrag_rueteli', 1, '1', 'Zweckbestimmung',
     '• Die Schützenstube dient den Sportschützen Muhen als Vereinslokal.' || E'\n' || '• Sie kann an Privatpersonen, Vereine und Institutionen vermietet werden.' || E'\n' || '• Die Mieter haben zur Kenntnis zu nehmen, dass während der Nutzung Schiesslärm auftreten kann. Eine Mietreduktion aus diesem Grund ist ausgeschlossen.',
     true),

    ('mietvertrag_rueteli', 2, '2', 'Benutzungsrecht',
     '• Dem Mieter stehen die Schützenstube, der Zugang zu den Elektroanlagen sowie die Toiletten zur Verfügung. Der Schiessraum dient als Durchgang zu den Sanitärräumen und darf nicht anderweitig genutzt werden. Andere Räume des Gebäudes sind nicht zugänglich.' || E'\n' || '• Das vorhandene Kücheninventar darf benutzt werden.' || E'\n' || '• Ein Wirte-Recht besteht nicht: Der Verkauf von Speisen und Getränken im und um das Schützenhaus ist untersagt. Selbst mitgebrachte Lebensmittel dürfen in der Küche zubereitet werden.' || E'\n' || '• Der Geschirrspüler kann verwendet werden (bitte Gebrauchsanweisung beachten).' || E'\n' || '• Das Cheminée dient ausschliesslich zu Heizzwecken – Grillieren ist untersagt. Die Gebrauchsanleitung ist zwingend vorgängig zu lesen.' || E'\n' || '• Eine bereitgestellte Kiste Cheminéeholz ist im Mietpreis inbegriffen. Jede weitere Kiste wird mit CHF 20.00 verrechnet.' || E'\n' || '• Der Abfall ist vom Mieter selbst zu entsorgen. Liegengebliebener Abfall wird vom Vermieter in kostenpflichtigen Säcken entsorgt (CHF 4.00 pro Sack).',
     true),

    ('mietvertrag_rueteli', 3, '3', 'Sorgfaltspflicht',
     '• Die Benutzer sind verpflichtet, sorgfältig mit dem Schützenhaus und der Einrichtung umzugehen.' || E'\n' || '• Aschenbecher und Cheminéeasche sind in die vorgesehenen Metallkübel zu entleeren.' || E'\n' || '• Fehlendes oder beschädigtes Inventar (z. B. Besteck, Geschirr) wird dem Mieter in Rechnung gestellt.' || E'\n' || '• Ab 20:00 Uhr ist das Zünden von Knallkörpern oder ähnlichen Gegenständen untersagt. Eine Ausnahmebewilligung kann nur auf schriftliches Gesuch hin durch den Gemeinderat Muhen erteilt werden (gemäss Polizeireglement der Gemeinde Muhen). Bei störendem Verhalten kann dem Mieter das Nutzungsrecht entzogen werden.' || E'\n' || '• Die gemieteten Räumlichkeiten, inklusive Inventar, Toiletten und Aussenparkplatz, sind besenrein und frei von Schäden zu übergeben.' || E'\n' || '• Zusätzlicher Reinigungsaufwand durch den Hauswart (z. B. starke Verschmutzungen, Klebereste, Kaugummi) wird mit CHF 35.00 pro Stunde verrechnet.',
     true),

    ('mietvertrag_rueteli', 4, '4', 'Dekoration',
     '• Es ist untersagt, Dekorationsmaterial mit Nägeln, Bostitch oder Ähnlichem an Wänden oder Decken zu befestigen.' || E'\n' || '• Klebebänder müssen rückstandslos entfernt werden.',
     true),

    ('mietvertrag_rueteli', 5, '5', 'Haftung',
     '• Die Eigentümerin lehnt jede Haftung für Unfälle oder Schäden ab, die im Zusammenhang mit der Nutzung der Mietsache oder den Parkplätzen entstehen.',
     true),

    ('mietvertrag_rueteli', 6, '6', 'Vermietung',
     '• Zuständig für die Vermietung ist:' || E'\n' || 'Sportschützen Muhen' || E'\n' || 'Simon Hediger' || E'\n' || 'Tel.: 079 888 50 37' || E'\n' || 'E-Mail: sportschuetzen.muhen@gmail.com',
     true),

    ('mietvertrag_rueteli', 7, '7', 'Reservation & Vertrag',
     '• Der Mietvertrag wird mit der Reservation des Datums online per E-Mail zugestellt. Mit der fristgerechten Zahlung gilt der Mietvertrag als abgeschlossen und das Datum ist definitiv reserviert.' || E'\n' || '• Mit der Zahlung bestätigt der Mieter, dass er den Inhalt dieses Benützungsreglements vollständig gelesen, verstanden und akzeptiert hat.' || E'\n' || '• Die Mietgebühr ist innerhalb von 14 Tagen nach Zustellung des Mietvertrags zu bezahlen. Erfolgt die Zahlung nicht innerhalb dieser Frist, verfällt die Reservation automatisch und der Mietvertrag ist hinfällig.' || E'\n' || '• Bei einer Stornierung durch den Mieter nach erfolgter Zahlung wird eine Bearbeitungsgebühr von CHF 100.00 einbehalten. Der verbleibende Betrag der bereits geleisteten Miete wird dem Mieter zurückerstattet.',
     true),

    ('mietvertrag_rueteli', 8, '8', 'Gebühren & Abgaben',
     '• Die Mietgebühr für die Nutzung der Schützenstube inklusive Einrichtung beträgt CHF {mietbetrag} pro Tag/Abend.' || E'\n' || '• Zusätzliche Entschädigungen gemäss Ziffer 2 & 3 sind bei der Rückgabe der Mietsache via Banküberweisung oder in bar zu entrichten.' || E'\n' || '• Der genaue Zeitpunkt der Übergabe ist mit dem Vermieter abzusprechen.',
     true),

    ('mietvertrag_rueteli', 9, 'Checkliste', 'Allfällige zusätzliche Entschädigungen (Raumrückgabe)',
     '1. Holz-Zuschlag (pro zusätzliche Kiste CHF 20.00)' || E'\n' || '2. Glasbruch (Glas CHF 2.00, Teller CHF 5.00)' || E'\n' || '3. Andere beschädigte Gegenstände (nach Aufwand)' || E'\n' || '4. Zusätzliche Reinigung durch Hauswart (CHF 35.00 / Stunde)' || E'\n' || '5. Getränkeverbrauch' || E'\n' || '6. Kehrichtentsorgung (Kehrichtsack CHF 4.00)' || E'\n\n' || 'Der Betrag, welcher sich aus der Rückgabe der Mietsache ergibt, ist bar oder per TWINT/Banküberweisung nach Nutzung der Räumlichkeiten zu begleichen.',
     true);

-- D. Generalversammlung Vorlagen (Normaljahr & Wahljahr)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice
) VALUES 
    ('gv_einladung_normal', 'gv', 'gv_normal',
     'Einladung zur {gv_nummer}. Generalversammlung der Sportschützen Muhen',
     'Offizielle Einladungsbroschüre für die ordentliche Generalversammlung (Normaljahr) inkl. Traktandenliste und Jahresprogramm.',
     'Sehr geehrte Vereinsmitglieder, geschätzte Ehrenmitglieder und Schützenkameraden,' || E'\n\n' || 'zur {gv_nummer}. ordentlichen Generalversammlung der Sportschützen Muhen vom {gv_datum} um {gv_zeit} Uhr im Schützenhaus Rüteli laden wir euch herzlich ein.' || E'\n\n' || 'In dieser Einladung sind der Jahresbericht des Präsidenten sowie das Protokoll der letzten Generalversammlung enthalten. Ebenso finden sich der Bericht der Jungschützenleiterin, die Jahresrechnung und das Budget. Der Besuch der Generalversammlung ist für alle Wettkampfmitglieder obligatorisch. Entschuldigungen sind dem Präsidenten eine Woche vor der Generalversammlung mitzuteilen.',
     'Mit sportlichen Grüssen' || E'\n' || 'Der Präsident' || E'\n' || '{praesident_name}',
     'Hinweis: Anträge zuhanden der GV müssen gemäss Art. 15.2 der Vereinsstatuten mindestens 8 Tage vor der Versammlung schriftlich an den Präsidenten eingereicht werden.'
    ),
    ('gv_einladung_wahljahr', 'gv', 'gv_wahljahr',
     'Einladung zur {gv_nummer}. Generalversammlung (Wahljahr) der Sportschützen Muhen',
     'Offizielle Einladungsbroschüre für die Generalversammlung im Wahljahr inkl. Gesamterneuerungswahlen Vorstand & Rechnungsrevisoren.',
     'Sehr geehrte Vereinsmitglieder, geschätzte Ehrenmitglieder und Schützenkameraden,' || E'\n\n' || 'zur {gv_nummer}. ordentlichen Generalversammlung (Wahljahr) der Sportschützen Muhen vom {gv_datum} um {gv_zeit} Uhr im Schützenhaus Rüteli laden wir euch herzlich ein.' || E'\n\n' || 'In dieser Einladung sind der Jahresbericht des Präsidenten sowie das Protokoll der letzten Generalversammlung enthalten. Ebenso finden sich der Bericht der Jungschützenleiterin, die Jahresrechnung, das Budget sowie die Gesamterneuerungswahlen des Vorstands. Der Besuch der Generalversammlung ist für alle Wettkampfmitglieder obligatorisch. Entschuldigungen sind dem Präsidenten eine Woche vor der Generalversammlung mitzuteilen.',
     'Mit sportlichen Grüssen' || E'\n' || 'Der Präsident' || E'\n' || '{praesident_name}',
     'Hinweis: Wahlen von Vorstand und Revisoren finden gemäss Statuten für eine Amtsdauer von zwei Jahren statt.'
    )
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    intro = EXCLUDED.intro,
    outro = EXCLUDED.outro,
    notice = EXCLUDED.notice;

-- E. Traktandenliste Normaljahr Seeding
DELETE FROM public.document_template_clauses WHERE template_id = 'gv_einladung_normal';

INSERT INTO public.document_template_clauses (template_id, sort_order, clause_number, clause_title, clause_text, is_mandatory)
VALUES
    ('gv_einladung_normal', 1, '1', 'Begrüssung / Präsenz', 'Eröffnung der Generalversammlung durch den Präsidenten und Feststellung der Beschlussfähigkeit.', true),
    ('gv_einladung_normal', 2, '2', 'Wahl von zwei Stimmenzählern', 'Bestimmung der Stimmenzähler für offene und geheime Abstimmungen.', true),
    ('gv_einladung_normal', 3, '3', 'Protokoll der letzten GV', 'Genehmigung des Protokolls der ordentlichen Generalversammlung vom Vorjahr.', true),
    ('gv_einladung_normal', 4, '4', 'Mutationen', 'Aufnahme von Neumitgliedern, Übertritte und Gedenken an verstorbene Kameraden.', true),
    ('gv_einladung_normal', 5, '5', 'Jahresbericht des Präsidenten', 'Bericht über das vergangene Vereinsjahr Gewehr KK 50m und LG 10m.', true),
    ('gv_einladung_normal', 6, '6', 'Jahresbericht Jungschützenleiterin', 'Rückblick auf die Nachwuchsförderung, Schiesskurse und Erfolge der Jugend.', true),
    ('gv_einladung_normal', 7, '7', 'Jahresrechnung & Revisorenbericht', '7.1 Betriebs- und Vermögensrechnung' || E'\n' || '7.2 Bericht und Antrag der Rechnungsrevisoren' || E'\n' || '7.3 Decharge-Erteilung an den Vorstand', true),
    ('gv_einladung_normal', 8, '8', 'Budget & Finanzplanung', 'Präsentation des Budgets für das kommende Vereinsjahr und Genehmigung.', true),
    ('gv_einladung_normal', 9, '9', 'Festsetzung Jahresbeitrag', 'Beschlussfassung über die Mitgliederbeiträge für das laufende Vereinsjahr.', true),
    ('gv_einladung_normal', 10, '10', 'Tätigkeitsprogramm & Jahresmeisterschaft', 'Vorstellung und Verabschiedung des Jahresprogramms sowie des Meisterschaftsreglements.', true),
    ('gv_einladung_normal', 11, '11', 'Ehrungen & Auszeichnungen', 'Würdigung verdienter Vereinsmitglieder, Jubilare und sportlicher Spitzenleistungen.', true),
    ('gv_einladung_normal', 12, '12', 'Erledigung von Anträgen & Varia', 'Behandlung statutengemäss eingereichter Anträge sowie allgemeine Umfrage.', true);

-- F. Traktandenliste Wahljahr Seeding
DELETE FROM public.document_template_clauses WHERE template_id = 'gv_einladung_wahljahr';

INSERT INTO public.document_template_clauses (template_id, sort_order, clause_number, clause_title, clause_text, is_mandatory)
VALUES
    ('gv_einladung_wahljahr', 1, '1', 'Begrüssung / Präsenz', 'Eröffnung der Generalversammlung durch den Präsidenten und Feststellung der Beschlussfähigkeit.', true),
    ('gv_einladung_wahljahr', 2, '2', 'Wahl von zwei Stimmenzählern', 'Bestimmung der Stimmenzähler für offene und geheime Abstimmungen.', true),
    ('gv_einladung_wahljahr', 3, '3', 'Protokoll der letzten GV', 'Genehmigung des Protokolls der ordentlichen Generalversammlung vom Vorjahr.', true),
    ('gv_einladung_wahljahr', 4, '4', 'Mutationen', 'Aufnahme von Neumitgliedern, Übertritte und Gedenken an verstorbene Kameraden.', true),
    ('gv_einladung_wahljahr', 5, '5', 'Jahresbericht des Präsidenten', 'Bericht über das vergangene Vereinsjahr Gewehr KK 50m und LG 10m.', true),
    ('gv_einladung_wahljahr', 6, '6', 'Jahresbericht Jungschützenleiterin', 'Rückblick auf die Nachwuchsförderung, Schiesskurse und Erfolge der Jugend.', true),
    ('gv_einladung_wahljahr', 7, '7', 'Jahresrechnung & Revisorenbericht', '7.1 Betriebs- und Vermögensrechnung' || E'\n' || '7.2 Bericht und Antrag der Rechnungsrevisoren' || E'\n' || '7.3 Decharge-Erteilung an den Vorstand', true),
    ('gv_einladung_wahljahr', 8, '8', 'Budget & Finanzplanung', 'Präsentation des Budgets für das kommende Vereinsjahr und Genehmigung.', true),
    ('gv_einladung_wahljahr', 9, '9', 'Festsetzung Jahresbeitrag', 'Beschlussfassung über die Mitgliederbeiträge für das laufende Vereinsjahr.', true),
    ('gv_einladung_wahljahr', 10, '10', 'Gesamterneuerungswahlen', '10.1 Wahl des Präsidenten' || E'\n' || '10.2 Wahl der übrigen Vorstandsmitglieder' || E'\n' || '10.3 Wahl der Rechnungsrevisoren', true),
    ('gv_einladung_wahljahr', 11, '11', 'Tätigkeitsprogramm & Jahresmeisterschaft', 'Vorstellung und Verabschiedung des Jahresprogramms sowie des Meisterschaftsreglements.', true),
    ('gv_einladung_wahljahr', 12, '12', 'Ehrungen & Auszeichnungen', 'Würdigung verdienter Vereinsmitglieder, Jubilare und sportlicher Spitzenleistungen.', true),
    ('gv_einladung_wahljahr', 13, '13', 'Erledigung von Anträgen & Varia', 'Behandlung statutengemäss eingereichter Anträge sowie allgemeine Umfrage.', true);

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & RECHTE
-- ------------------------------------------------------------------------------
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_clauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_templates_read_auth ON public.document_templates;
CREATE POLICY doc_templates_read_auth ON public.document_templates
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS doc_templates_read_anon ON public.document_templates;
CREATE POLICY doc_templates_read_anon ON public.document_templates
    FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS doc_clauses_read_auth ON public.document_template_clauses;
CREATE POLICY doc_clauses_read_auth ON public.document_template_clauses
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS doc_clauses_read_anon ON public.document_template_clauses;
CREATE POLICY doc_clauses_read_anon ON public.document_template_clauses
    FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS doc_templates_write_auth ON public.document_templates;
CREATE POLICY doc_templates_write_auth ON public.document_templates
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS doc_templates_write_anon ON public.document_templates;
CREATE POLICY doc_templates_write_anon ON public.document_templates
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS doc_clauses_write_auth ON public.document_template_clauses;
CREATE POLICY doc_clauses_write_auth ON public.document_template_clauses
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS doc_clauses_write_anon ON public.document_template_clauses;
CREATE POLICY doc_clauses_write_anon ON public.document_template_clauses
    FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_template_clauses TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_layouts TO authenticated, anon;

COMMIT;
