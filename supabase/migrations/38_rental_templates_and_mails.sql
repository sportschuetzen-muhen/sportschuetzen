-- ==============================================================================
-- 38_rental_templates_and_mails.sql
-- Migration: Erweiterung Vorlagen-Pool Vermietung, Umbenennungen & Schutzsystem
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- 1. KATEGORIE-CHECK AKTUALISIEREN (inkl. vermietung_mail)
ALTER TABLE public.document_templates DROP CONSTRAINT IF EXISTS chk_doc_template_category;
ALTER TABLE public.document_templates ADD CONSTRAINT chk_doc_template_category 
    CHECK (category IN ('rechnung', 'mahnung', 'vertrag', 'gv', 'brief', 'quittung', 'sonstige', 'vermietung_mail'));

-- 2. SPALTE is_system ERGÄNZEN (falls nicht vorhanden)
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.document_template_clauses ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- 3. UMBENENNUNGEN
-- A. Rechnungsvorlage vermietung -> "Zusatzrechnung Wirtschaft/Vermietung"
UPDATE public.document_templates 
SET title = 'Zusatzrechnung Wirtschaft/Vermietung',
    description = 'Zusatzrechnung für Aufwände, Nachreinigung, Cheminéeholz oder Konsumationen nach der Vermietung der Schützenstube.',
    is_system = true,
    updated_at = now()
WHERE code = 'vermietung' OR id = 'vermietung';

-- B. Mietvertrag -> "Mietvertrag & Benützungsreglement Schützenstube"
UPDATE public.document_templates
SET title = 'Mietvertrag & Benützungsreglement Schützenstube',
    description = 'Offizieller Mietvertrag und Benützungsordnung der Sportschützen Muhen für die Vermietung der Schützenstube.',
    is_system = true,
    updated_at = now()
WHERE id = 'mietvertrag_rueteli' OR code = 'mietvertrag';

-- 4. BESTEHENDE SYSTEMVORLAGEN SCHÜTZEN
UPDATE public.document_templates
SET is_system = true
WHERE code IN (
    'jahresbeitrag', 'vermietung', 'materialverkauf', 'depot_pfand', 
    'schulsport', 'sponsoring', 'sonstige', 'mahnung', 'mahnung_1', 
    'mahnung_2', 'mahnung_3', 'mietvertrag', 'gv_normal', 'gv_wahljahr', 'freier_brief'
);

-- 5. DIE 5 VERMIETUNGS-MAILVORLAGEN ANLEGEN / AKTUALISIEREN
-- 5.1 Mietvertrag-Versand mit QR-Rechnung
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_vertrag',
    'vermietung_mail',
    'vm_vertrag',
    'Mietvertrag & QR-Rechnung per Mail',
    'Zustellung des Mietvertrags mit QR-Rechnung nach Freigabe der Reservation.',
    '', '', '',
    'Mietvertrag Schützenstube am {mietdatum} – {vertragsnr}',
    'Guten Tag {vorname} {nachname},' || E'\n\n' ||
    'Vielen Dank für deine Reservation der Schützenstube Muhen am {mietdatum}.' || E'\n' ||
    'Anbei erhältst du den offiziellen Mietvertrag inklusive Schweizer QR-Rechnung.' || E'\n\n' ||
    'Vertragsnummer: {vertragsnr}' || E'\n' ||
    'Mietdatum: {mietdatum} (Festbeginn: {festbeginn})' || E'\n' ||
    'Mietbetrag: CHF {mietbetrag}' || E'\n\n' ||
    'Bitte überweise den Mietbetrag innert 14 Tagen mit dem im Vertrag enthaltenen QR-Zahlschein, um die Reservation definitiv zu bestätigen.' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    'Sportschützen Muhen',
    14, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    updated_at = now();

-- 5.2 Zahlungserinnerung / Mahnung (7 Tage Frist vor Storno)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_mahnung',
    'vermietung_mail',
    'vm_mahnung',
    'Zahlungserinnerung (Frist 7 Tage)',
    'Zahlungserinnerung bei ausstehender Zahlung vor dem Anlass mit Hinweis auf Verfall der Reservation.',
    '', '', '',
    '❗ Zahlungserinnerung – Schützenstube am {mietdatum}',
    'Guten Tag {vorname} {nachname},' || E'\n\n' ||
    'Bei der Prüfung unserer Zahlungseingänge konnten wir für deine Reservation am {mietdatum} (Vertrag {vertragsnr}) noch keine Überweisung feststellen.' || E'\n\n' ||
    'Offener Mietbetrag: CHF {mietbetrag}' || E'\n' ||
    'Zahlungsfrist: Innert 7 Tagen' || E'\n' ||
    'Zahlungsmethode: Bitte verwende den Schweizer QR-Einzahlungsschein aus dem Mietvertrag.' || E'\n\n' ||
    'Bitte beachte, dass die Reservation erst mit Zahlungseingang definitiv gesichert ist. Sollte die Frist ungenutzt verstreichen, wird der Termin wieder freigegeben.' || E'\n' ||
    'Bei Fragen oder bereits getätigter Überweisung melde dich bitte kurz bei uns.' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    'Sportschützen Muhen',
    7, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    updated_at = now();

-- 5.3 Zahlungseingang & Buchungsbestätigung
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_bestaetigung',
    'vermietung_mail',
    'vm_bestaetigung',
    'Zahlungseingang & Bestätigung',
    'Bestätigung des Zahlungseingangs und Aufforderung zur Absprache der Schlüsselübergabe.',
    '', '', '',
    '✅ Zahlung erhalten – Schützenstube am {mietdatum}',
    'Guten Tag {vorname} {nachname},' || E'\n\n' ||
    'Vielen Dank! Die Zahlung für deine Schützenstuben-Miete am {mietdatum} (Vertrag {vertragsnr}) ist bei uns eingegangen.' || E'\n\n' ||
    '🔑 Schlüsselübergabe vereinbaren:' || E'\n' ||
    'Bitte kontaktiere rechtzeitig vor deinem Anlass unsere Wirtschafts-Verantwortlichen zur Absprache der Übergabe:' || E'\n' ||
    '{wirtschaft_name}' || E'\n' ||
    'Telefon / WhatsApp: {wirtschaft_phone}' || E'\n' ||
    'E-Mail: {wirtschaft_email}' || E'\n\n' ||
    'Wir wünschen dir bereits jetzt ein gelungenes Fest in unserer Schützenstube!' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    'Sportschützen Muhen',
    0, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    updated_at = now();

-- 5.4 Schlüsselübergabe-Detailinfo kurz vor Anlass
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_schluessel',
    'vermietung_mail',
    'vm_schluessel',
    'Schlüsselübergabe & Hinweise',
    'Informationen kurz vor dem Anlass bezüglich Schlüssel, Festbeginn und Besenreinheit.',
    '', '', '',
    '🔑 Schlüsselübergabe Schützenstube – {mietdatum}',
    'Guten Tag {vorname} {nachname},' || E'\n\n' ||
    'In wenigen Tagen findet dein Anlass in der Schützenstube Muhen am {mietdatum} statt.' || E'\n\n' ||
    'Wichtige Hinweise zur Übergabe & Benutzung:' || E'\n' ||
    '• Schlüsselkontakt: {wirtschaft_name} ({wirtschaft_phone})' || E'\n' ||
    '• Festbeginn: {festbeginn}' || E'\n' ||
    '• Rückgabe: Die Schützenstube ist besenrein abzugeben. Abfälle sind ordnungsgemäss zu entsorgen.' || E'\n\n' ||
    'Wir freuen uns auf deinen Besuch!' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    'Sportschützen Muhen',
    0, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    updated_at = now();

-- 5.5 Stornierungsbestätigung mit Feedbacklink
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_storno',
    'vermietung_mail',
    'vm_storno',
    'Stornierungsbestätigung & Feedback',
    'Bestätigung der Stornierung mit Link zum Mieter-Feedback-Formular.',
    '', '', '',
    'Reservation storniert: Schützenstube am {mietdatum}',
    'Guten Tag {vorname} {nachname},' || E'\n\n' ||
    'Die Reservation für die Schützenstube Muhen am {mietdatum} (Vertrag {vertragsnr}) wurde storniert.' || E'\n\n' ||
    'Dein Feedback ist uns sehr wichtig, um unseren Service kontinuierlich zu verbessern:' || E'\n' ||
    '{feedback_url}' || E'\n\n' ||
    'Falls die Stornierung irrtümlich erfolgte oder du die Zahlung bereits getätigt hast, melde dich bitte umgehend bei uns.' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    'Sportschützen Muhen',
    0, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    updated_at = now();

-- 6. TRIGGER ZUM SCHUTZ VON SYSTEM-VORLAGEN (VERHINDERT ACCIDENTAL DELETE)
CREATE OR REPLACE FUNCTION public.prevent_delete_system_document_templates()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_system = true THEN
        RAISE EXCEPTION 'Systemvorlage "%" (Code: %) ist für den stabilen Vereinsbetrieb zwingend erforderlich und darf nicht gelöscht werden.', OLD.title, OLD.code;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_system_document_templates ON public.document_templates;
CREATE TRIGGER trg_prevent_delete_system_document_templates
    BEFORE DELETE ON public.document_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_delete_system_document_templates();

COMMIT;
