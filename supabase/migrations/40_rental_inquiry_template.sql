-- ==============================================================================
-- 40_rental_inquiry_template.sql
-- Migration: E-Mail-Vorlage für unverbindliche Vorab-Terminanfrage (vm_anfrage)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_anfrage',
    'vermietung_mail',
    'vm_anfrage',
    'Mail: Bestätigung Vorab-Terminanfrage',
    'Automatische Empfangsbestätigung an den Interessenten bei einer unverbindlichen Vorab-Prüfung (Puffer- oder Reinigungstag).',
    '', '', '',
    'Bestätigung deiner Terminanfrage für die Schützenstube Muhen ({mietdatum})',
    'Guten Tag {mieter_vorname} {mieter_nachname},' || E'\n\n' ||
    'Vielen Dank für deine unverbindliche Terminanfrage für die Schützenstube Muhen am {mietdatum} (geplanter Festbeginn: {festbeginn}).' || E'\n\n' ||
    'Da an oder um diesen Termin bereits andere Vereinsaktivitäten oder Reinigungspuffer anstehen, prüfen wir derzeit die zeitliche Machbarkeit mit unserem Team.' || E'\n\n' ||
    'Wir melden uns in Kürze direkt bei dir.' || E'\n\n' ||
    'Freundliche Grüsse' || E'\n' ||
    '{vermieter_name}' || E'\n' ||
    'Sportschützen Muhen' || E'\n' ||
    'Telefon: {vermieter_telefon}' || E'\n' ||
    'E-Mail: {vermieter_email}',
    NULL, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    category = 'vermietung_mail',
    is_system = true,
    is_active = true,
    version = public.document_templates.version + 1,
    updated_at = now();

COMMIT;
