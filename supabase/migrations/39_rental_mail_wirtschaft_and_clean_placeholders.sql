-- ==============================================================================
-- 39_rental_mail_wirtschaft_and_clean_placeholders.sql
-- Migration: Infomail Wirtschaftsverantwortliche, Storno-Verzug-Vorlage & Variablen-Harmonisierung
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- 1. HILFSFUNKTION: get_system_mail_array (falls noch nicht vorhanden)
CREATE OR REPLACE FUNCTION public.get_system_mail_array(p_schluessel VARCHAR)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_raw TEXT;
    v_parts TEXT[];
    v_clean TEXT[];
    v_item TEXT;
BEGIN
    SELECT mailadresse INTO v_raw
    FROM public.system_mail_configs
    WHERE schluessel = p_schluessel
    LIMIT 1;

    IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
        RETURN ARRAY[]::TEXT[];
    END IF;

    -- Ersetze Kommas durch Semikolons und zerlege
    v_parts := string_to_array(replace(v_raw, ',', ';'), ';');
    v_clean := ARRAY[]::TEXT[];

    FOREACH v_item IN ARRAY v_parts
    LOOP
        v_item := TRIM(v_item);
        IF v_item <> '' AND v_item LIKE '%@%' THEN
            v_clean := array_append(v_clean, v_item);
        END IF;
    END LOOP;

    RETURN v_clean;
END;
$$;

COMMENT ON FUNCTION public.get_system_mail_array IS 
    'Gibt ein bereinigtes TEXT-Array aller E-Mail-Adressen eines System-Mail-Verteilerschlüssels zurück.';

GRANT EXECUTE ON FUNCTION public.get_system_mail_array(VARCHAR) TO authenticated, anon, service_role;


-- 2. VORLAGEN AKTUALISIEREN & ERWEITERN (Fachbereich Vermietung Schützenstube)

-- 2.1 vm_vertrag: Mietvertrag & QR-Rechnung per Mail
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_vertrag',
    'vermietung_mail',
    'vm_vertrag',
    'Mietvertrag & QR-Rechnung per Mail',
    'Zustellung des Mietvertrags mit Schweizer QR-Rechnung nach Freigabe der Reservation.',
    '', '', '',
    'Mietvertrag Schützenstube am {mietdatum} – {vertragsnr}',
    'Guten Tag {mieter_vorname} {mieter_nachname},' || E'\n\n' ||
    'Vielen Dank für deine Reservation der Schützenstube Muhen am {mietdatum}.' || E'\n' ||
    'Anbei erhältst du den offiziellen Mietvertrag inklusive Schweizer QR-Rechnung.' || E'\n\n' ||
    'Vertragsnummer: {vertragsnr}' || E'\n' ||
    'Mietdatum: {mietdatum} (Festbeginn: {festbeginn})' || E'\n' ||
    'Mietbetrag: CHF {mietbetrag}' || E'\n\n' ||
    'Bitte überweise den Mietbetrag innert 14 Tagen mit dem im Vertrag enthaltenen QR-Zahlschein, um die Reservation definitiv zu bestätigen.' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    14, true, true, 2, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    version = public.document_templates.version + 1,
    updated_at = now();

-- 2.2 vm_mahnung: Zahlungserinnerung (Frist 7 Tage)
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
    'Guten Tag {mieter_vorname} {mieter_nachname},' || E'\n\n' ||
    'Bei der Prüfung unserer Zahlungseingänge konnten wir für deine Reservation am {mietdatum} (Vertrag {vertragsnr}) noch keine Überweisung feststellen.' || E'\n\n' ||
    'Offener Mietbetrag: CHF {mietbetrag}' || E'\n' ||
    'Zahlungsfrist: Innert 7 Tagen' || E'\n' ||
    'Zahlungsmethode: Bitte verwende den Schweizer QR-Einzahlungsschein aus dem Mietvertrag.' || E'\n\n' ||
    'Bitte beachte, dass die Reservation erst mit Zahlungseingang definitiv gesichert ist. Sollte die Frist ungenutzt verstreichen, wird der Termin wieder freigegeben.' || E'\n' ||
    'Bei Fragen oder bereits getätigter Überweisung melde dich bitte kurz bei uns.' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    7, true, true, 2, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    version = public.document_templates.version + 1,
    updated_at = now();

-- 2.3 vm_bestaetigung: Zahlungseingang & Bestätigung
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_bestaetigung',
    'vermietung_mail',
    'vm_bestaetigung',
    'Zahlungseingang & Bestätigung',
    'Bestätigung des Zahlungseingangs und Aufforderung zur Absprache der Schlüsselübergabe mit dem Wirtschaftsteam.',
    '', '', '',
    '✅ Zahlung erhalten – Schützenstube am {mietdatum}',
    'Guten Tag {mieter_vorname} {mieter_nachname},' || E'\n\n' ||
    'Vielen Dank! Die Zahlung für deine Schützenstuben-Miete am {mietdatum} (Vertrag {vertragsnr}) ist bei uns eingegangen.' || E'\n\n' ||
    '🔑 Schlüsselübergabe vereinbaren:' || E'\n' ||
    'Bitte kontaktiere rechtzeitig vor deinem Anlass unsere Wirtschafts-Verantwortlichen zur Absprache der Übergabe:' || E'\n\n' ||
    '{wirtschaft_name}' || E'\n' ||
    'Telefon / WhatsApp: {wirtschaft_phone}' || E'\n' ||
    'E-Mail: {wirtschaft_email}' || E'\n\n' ||
    'Wichtig: Bitte rechtzeitig einen Termin vereinbaren. Ohne Termin keine Übergabe.' || E'\n\n' ||
    'Wir wünschen dir bereits jetzt ein gelungenes Fest in unserer Schützenstube!' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    0, true, true, 2, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    version = public.document_templates.version + 1,
    updated_at = now();

-- 2.4 vm_schluessel: Schlüsselübergabe & Hinweise
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
    'Guten Tag {mieter_vorname} {mieter_nachname},' || E'\n\n' ||
    'In wenigen Tagen findet dein Anlass in der Schützenstube Muhen am {mietdatum} statt.' || E'\n\n' ||
    'Wichtige Hinweise zur Übergabe & Benutzung:' || E'\n' ||
    '• Schlüsselkontakt: {wirtschaft_name} ({wirtschaft_phone})' || E'\n' ||
    '• E-Mail: {wirtschaft_email}' || E'\n' ||
    '• Festbeginn: {festbeginn}' || E'\n' ||
    '• Rückgabe: Die Schützenstube ist besenrein abzugeben. Abfälle sind ordnungsgemäss zu entsorgen.' || E'\n\n' ||
    'Wir freuen uns auf deinen Besuch!' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    0, true, true, 2, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    version = public.document_templates.version + 1,
    updated_at = now();

-- 2.5 vm_storno: Stornierungsbestätigung (Allgemein)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_storno',
    'vermietung_mail',
    'vm_storno',
    'Stornierungsbestätigung (Allgemein)',
    'Bestätigung der Stornierung einer Reservation mit Link zum Mieter-Feedback-Formular.',
    '', '', '',
    'Reservation storniert: Schützenstube am {mietdatum}',
    'Guten Tag {mieter_vorname} {mieter_nachname},' || E'\n\n' ||
    'Die Reservation für die Schützenstube Muhen am {mietdatum} (Vertrag {vertragsnr}) wurde storniert.' || E'\n\n' ||
    'Dein Feedback ist uns sehr wichtig, um unseren Service kontinuierlich zu verbessern:' || E'\n' ||
    '{feedback_url}' || E'\n\n' ||
    'Falls die Stornierung irrtümlich erfolgte oder du die Zahlung bereits getätigt hast, melde dich bitte umgehend bei uns.' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    0, true, true, 2, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    version = public.document_templates.version + 1,
    updated_at = now();

-- 2.6 vm_storno_verzug: Stornierung wegen Zahlungsverzug (nach Mahnung / Fristablauf)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_storno_verzug',
    'vermietung_mail',
    'vm_storno_verzug',
    'Stornierung wegen Zahlungsverzug',
    'Mitteilung über die Stornierung und Terminfreigabe nach ergebnislosem Ablauf der Zahlungsfrist.',
    '', '', '',
    'Reservation storniert: Schützenstube am {mietdatum} – {vertragsnr}',
    'Guten Tag {mieter_vorname} {mieter_nachname},' || E'\n\n' ||
    'Da wir für Ihre Reservation der Schützenstube am {mietdatum} (Vertrag {vertragsnr}) trotz erfolgter Zahlungserinnerung keinen Zahlungseingang feststellen konnten und keine Rückmeldung erhalten haben, mussten wir die Reservation stornieren und den Termin wieder freigeben.' || E'\n\n' ||
    'Falls Sie an der Miete weiterhin interessiert sind oder es sich hierbei um ein Missverständnis handelt (z. B. eine bereits getätigte Überweisung), bitten wir Sie, uns über den untenstehenden Link eine kurze Rückmeldung zu geben:' || E'\n' ||
    '{feedback_url}' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    0, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    version = public.document_templates.version + 1,
    updated_at = now();

-- 2.7 vm_info_wirtschaft: Internes Info-Mail an Wirtschaftsverantwortliche
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_info_wirtschaft',
    'vermietung_mail',
    'vm_info_wirtschaft',
    'Info-Mail: Neue Reservation (Intern)',
    'Automatische Benachrichtigung an die Wirtschaftsverantwortlichen bei neuen Online-Reservationen oder Terminanfragen.',
    '', '', '',
    '🏠 Neue Schützenhaus-Reservation: {vertragsnr} ({mietdatum})',
    'Hallo {wirtschaft_name},' || E'\n\n' ||
    'Es ist eine neue Online-Reservation für die Schützenstube eingegangen:' || E'\n\n' ||
    'Buchungsnr: {vertragsnr}' || E'\n' ||
    'Mietdatum: {mietdatum} (Beginn: {festbeginn})' || E'\n' ||
    'Mieter: {mieter_anrede} {mieter_vorname} {mieter_nachname}' || E'\n' ||
    'Kontakt: {mieter_email} / {mieter_telefon}' || E'\n' ||
    'Adresse: {mieter_adresse}' || E'\n' ||
    'Notiz / Bemerkung: {bemerkung}' || E'\n\n' ||
    'Im Vorstands-Cockpit öffnen:' || E'\n' ||
    '{cockpit_url}' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    0, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    is_system = true,
    version = public.document_templates.version + 1,
    updated_at = now();

COMMIT;
