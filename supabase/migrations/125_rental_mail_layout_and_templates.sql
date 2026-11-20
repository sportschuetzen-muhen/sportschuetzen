-- ==============================================================================
-- 125_rental_mail_layout_and_templates.sql
-- Harmonisierung aller Vermietungs-Mailvorlagen (Layout, Du-Form, kompakte
-- Signatur, Eckdaten-Tabellen, Korrektur Encoding/Tippfehler) sowie Ergänzung
-- der bisher hartcodierten internen Mails als echte System-Vorlagen:
--   - vm_anfrage_intern (Website-Benachrichtigung bei Vorab-Terminanfrage)
--   - vm_storno_alarm   (Dringend-Alarm aus storno_feedback.html)
-- ==============================================================================

BEGIN;

-- 1. vm_vertrag: Mietvertrag & QR-Rechnung per Mail
UPDATE public.document_templates
SET title = 'Mietvertrag & QR-Rechnung per Mail',
    mail_subject = 'Mietvertrag Schützenstube am {mietdatum} – {vertragsnr}',
    mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
'<p>vielen Dank für deine Reservation der Schützenstube Muhen am {mietdatum}. Anbei erhältst du den offiziellen Mietvertrag inklusive Schweizer QR-Rechnung.</p>' || E'\n\n' ||
'<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:165px; color:#475569; font-size:13.5px;"><strong>Vertragsnummer</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{vertragsnr}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mietdatum</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mietdatum} (Festbeginn: {festbeginn})</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mietbetrag</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>CHF {mietbetrag}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Zahlungsfrist</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{zahlungsfrist_tage} Tage</td></tr>' || E'\n' ||
'</table>' || E'\n\n' ||
'<div class="club-banner-callout" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: #78350f;">' || E'\n' ||
'  <strong>Wichtige Hinweise zum Abschluss:</strong><br>' || E'\n' ||
'  <strong>Vertragsabschluss:</strong> Wirksam mit der Zahlung von CHF {mietbetrag} innert {zahlungsfrist_tage} Tagen.<br>' || E'\n' ||
'  <strong>Zahlung:</strong> Bitte CHF {mietbetrag} via <strong>QR-Einzahlungsschein auf der letzten Seite</strong> des PDF-Anhanges überweisen.' || E'\n' ||
'</div>' || E'\n\n' ||
'<p>Wir freuen uns, dich bald bei uns in der Schützenstube begrüssen zu dürfen.</p>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_vertrag';

-- 2. vm_anfrage: Bestätigung Vorab-Terminanfrage (an Interessent)
UPDATE public.document_templates
SET title = 'Mail: Bestätigung Vorab-Terminanfrage',
    mail_subject = 'Bestätigung deiner Terminanfrage für die Schützenstube Muhen ({mietdatum})',
    mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
'<p>vielen Dank für deine unverbindliche Terminanfrage für die Schützenstube Muhen.</p>' || E'\n\n' ||
'<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:165px; color:#475569; font-size:13.5px;"><strong>Anfragenummer</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{vertragsnr}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Wunschdatum</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mietdatum}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Geplanter Festbeginn</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{festbeginn}</td></tr>' || E'\n' ||
'</table>' || E'\n\n' ||
'<p>Da an oder um diesen Termin bereits andere Vereinsaktivitäten oder Reinigungspuffer anstehen, prüfen wir derzeit die zeitliche Machbarkeit mit unserem Team.</p>' || E'\n\n' ||
'<p>Wir melden uns in Kürze direkt bei dir.</p>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_anfrage';

-- 3. vm_anfrage_intern (NEU): Interne Benachrichtigung an Verein/Vorstand bei Vorab-Terminanfrage
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_anfrage_intern',
    'vermietung_mail',
    'vm_anfrage_intern',
    'Mail: Vorab-Terminanfrage (Intern)',
    'Interne Benachrichtigung an Verein/Vorstand zur Prüfung, sobald eine unverbindliche Vorab-Terminanfrage über die Website eingeht.',
    '', '', '',
    '📅 Neue Vorab-Terminanfrage: {vertragsnr} ({mietdatum})',
    '<p>Hallo zusammen,</p>' || E'\n\n' ||
    '<p>über die Website wurde eine unverbindliche Terminanfrage eingereicht, die eine Prüfung erfordert:</p>' || E'\n\n' ||
    '<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:150px; color:#475569; font-size:13.5px;"><strong>Buchungsnr.</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{vertragsnr}</strong></td></tr>' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mietdatum</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mietdatum} (Beginn: {festbeginn})</td></tr>' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mieter</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mieter_anrede} {mieter_vorname} {mieter_nachname}</td></tr>' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Kontakt</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mieter_email} / {mieter_telefon}</td></tr>' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Adresse</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mieter_adresse}</td></tr>' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Bemerkung</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{bemerkung}</td></tr>' || E'\n' ||
    '</table>' || E'\n\n' ||
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 18px 0;"><tr>' || E'\n' ||
    '  <td align="center" bgcolor="#0f3c5c" style="background-color:#0f3c5c; border-radius:6px; padding:11px 22px;">' || E'\n' ||
    '    <a href="{cockpit_url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:''Segoe UI'',Arial,sans-serif; font-size:14px; font-weight:bold; line-height:18px; text-decoration:none; display:inline-block;">Im Vorstands-Cockpit öffnen</a>' || E'\n' ||
    '  </td>' || E'\n' ||
    '</tr></table>' || E'\n\n' ||
    '<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>',
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

-- 4. vm_mahnung: Zahlungserinnerung (Frist 7 Tage)
UPDATE public.document_templates
SET title = 'Zahlungserinnerung (Frist 7 Tage)',
    mail_subject = '❗ Zahlungserinnerung – Schützenstube am {mietdatum}',
    mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
'<p>bei der Prüfung unserer Zahlungseingänge konnten wir für deine Reservation am {mietdatum} (Vertrag {vertragsnr}) noch keine Überweisung feststellen.</p>' || E'\n\n' ||
'<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:165px; color:#475569; font-size:13.5px;"><strong>Offener Mietbetrag</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#c53030; font-size:13.5px;"><strong>CHF {mietbetrag}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Zahlungsfrist</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">Innert 7 Tagen</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Zahlungsmethode</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">Schweizer QR-Einzahlungsschein aus dem Mietvertrag (im Anhang)</td></tr>' || E'\n' ||
'</table>' || E'\n\n' ||
'<p>Bitte beachte, dass die Reservation erst mit Zahlungseingang definitiv gesichert ist. Sollte die Frist ungenutzt verstreichen, wird der Termin wieder freigegeben.</p>' || E'\n\n' ||
'<p>Bei Fragen oder bereits getätigter Überweisung melde dich bitte kurz bei uns.</p>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_mahnung';

-- 5. vm_bestaetigung: Zahlungseingang & Bestätigung
UPDATE public.document_templates
SET title = 'Zahlungseingang & Bestätigung',
    mail_subject = '✅ Zahlung erhalten – Schützenstube am {mietdatum}',
    mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
'<p>vielen Dank! Die Zahlung für die Schützenstuben-Miete am {mietdatum} (Vertrag {vertragsnr}) ist bei uns eingegangen.</p>' || E'\n\n' ||
'<p>🔑 <strong>Schlüsselübergabe vereinbaren:</strong><br>Bitte kontaktiere rechtzeitig vor deinem Anlass unsere Wirtschafts-Verantwortlichen zur Absprache der Übergabe:</p>' || E'\n\n' ||
'<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:165px; color:#475569; font-size:13.5px;"><strong>Ansprechperson</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{wirtschaft_name}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Telefon / WhatsApp</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{wirtschaft_phone}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>E-Mail</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{wirtschaft_email}</td></tr>' || E'\n' ||
'</table>' || E'\n\n' ||
'<div class="club-banner-callout" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: #78350f;">' || E'\n' ||
'  <strong>Wichtig:</strong> Bitte rechtzeitig einen Termin vereinbaren. Ohne Termin keine Übergabe.' || E'\n' ||
'</div>' || E'\n\n' ||
'<p>Wir wünschen dir bereits jetzt ein gelungenes Fest in unserer Schützenstube!</p>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_bestaetigung';

-- 6. vm_schluessel: Schlüsselübergabe & Hinweise (korrigiert Test-Artefakte & Sie-Form)
UPDATE public.document_templates
SET title = 'Schlüsselübergabe & Hinweise',
    mail_subject = '🔑 Schlüsselübergabe Schützenstube – {mietdatum}',
    mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
'<p>in wenigen Tagen findet dein Anlass in der Schützenstube Muhen am {mietdatum} statt. Nachfolgend die wichtigsten Angaben für die Schlüsselübergabe:</p>' || E'\n\n' ||
'<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:165px; color:#475569; font-size:13.5px;"><strong>Schlüsselkontakt</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{wirtschaft_name}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Telefon / WhatsApp</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{wirtschaft_phone}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>E-Mail</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{wirtschaft_email}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Festbeginn</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{festbeginn}</td></tr>' || E'\n' ||
'</table>' || E'\n\n' ||
'<div class="club-banner-callout" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: #1e3a8a;">' || E'\n' ||
'  <strong>Rückgabe &amp; Reinigung:</strong> Bitte die Schützenstube besenrein übergeben und Abfälle ordnungsgemäss entsorgen.' || E'\n' ||
'</div>' || E'\n\n' ||
'<p>Wir freuen uns auf deinen Besuch und wünschen ein schönes Fest!</p>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_schluessel';

-- 7. vm_storno: Stornierungsbestätigung (Allgemein)
UPDATE public.document_templates
SET title = 'Stornierungsbestätigung (Allgemein)',
    mail_subject = 'Reservation storniert: Schützenstube am {mietdatum}',
    mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
'<p>die Reservation für die Schützenstube Muhen am {mietdatum} (Vertrag {vertragsnr}) wurde storniert.</p>' || E'\n\n' ||
'<p>Dein Feedback ist uns sehr wichtig, um unseren Service kontinuierlich zu verbessern:</p>' || E'\n' ||
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 18px 0;"><tr>' || E'\n' ||
'  <td align="center" bgcolor="#742a2a" style="background-color:#742a2a; border-radius:6px; padding:12px 26px;">' || E'\n' ||
'    <a href="{feedback_url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:''Segoe UI'',Arial,sans-serif; font-size:15px; font-weight:bold; line-height:20px; text-decoration:none; display:inline-block;">Rückmeldung geben</a>' || E'\n' ||
'  </td>' || E'\n' ||
'</tr></table>' || E'\n\n' ||
'<p>Falls die Stornierung irrtümlich erfolgte oder du die Zahlung bereits getätigt hast, melde dich bitte umgehend bei uns.</p>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_storno';

-- 8. vm_storno_verzug: Stornierung wegen Zahlungsverzug
UPDATE public.document_templates
SET title = 'Stornierung wegen Zahlungsverzug',
    mail_subject = 'Reservation storniert: Schützenstube am {mietdatum} – {vertragsnr}',
    mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
'<p>da wir für deine Reservation der Schützenstube am {mietdatum} (Vertrag {vertragsnr}) trotz Zahlungserinnerung keinen Zahlungseingang feststellen konnten und keine Rückmeldung erhalten haben, mussten wir die Reservation stornieren und den Termin wieder freigeben.</p>' || E'\n\n' ||
'<p>Falls du an der Miete weiterhin interessiert bist oder es sich hierbei um ein Missverständnis handelt, bitten wir dich um eine kurze Rückmeldung:</p>' || E'\n' ||
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 18px 0;"><tr>' || E'\n' ||
'  <td align="center" bgcolor="#7f1d1d" style="background-color:#7f1d1d; border-radius:6px; padding:12px 26px;">' || E'\n' ||
'    <a href="{feedback_url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:''Segoe UI'',Arial,sans-serif; font-size:15px; font-weight:bold; line-height:20px; text-decoration:none; display:inline-block;">Rückmeldung geben</a>' || E'\n' ||
'  </td>' || E'\n' ||
'</tr></table>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_storno_verzug';

-- 9. vm_storno_alarm (NEU): Dringend-Alarm aus storno_feedback.html
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_storno_alarm',
    'vermietung_mail',
    'vm_storno_alarm',
    'Mail: Dringend Storno-Rückmeldung (Intern)',
    'Automatische Alarm-Mail an den Verein, wenn ein Mieter im Storno-Feedback «Zahlung bereits getätigt» meldet.',
    '', '', '',
    '⚠️ Dringend: Rückmeldung zu Stornierung {vertragsnr}',
    '<p>Hallo zusammen,</p>' || E'\n\n' ||
    '<p>ein Mieter hat sich bezüglich einer stornierten Reservation gemeldet und wünscht eine dringende Kontaktaufnahme (Zahlung bereits getätigt / möchte Termin behalten):</p>' || E'\n\n' ||
    '<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:175px; color:#475569; font-size:13.5px;"><strong>Vertragsnummer</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{vertragsnr}</strong></td></tr>' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Ausgewählter Grund</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#991b1b; font-size:13.5px;"><strong>{storno_grund}</strong></td></tr>' || E'\n' ||
    '  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Bemerkung des Mieters</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{bemerkung}</td></tr>' || E'\n' ||
    '</table>' || E'\n\n' ||
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 18px 0;"><tr>' || E'\n' ||
    '  <td align="center" bgcolor="#b91c1c" style="background-color:#b91c1c; border-radius:6px; padding:11px 22px;">' || E'\n' ||
    '    <a href="{cockpit_url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:''Segoe UI'',Arial,sans-serif; font-size:14px; font-weight:bold; line-height:18px; text-decoration:none; display:inline-block;">Im Vorstands-Cockpit prüfen</a>' || E'\n' ||
    '  </td>' || E'\n' ||
    '</tr></table>' || E'\n\n' ||
    '<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>',
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

-- 10. vm_info_wirtschaft: Info-Mail an Wirtschaftsverantwortliche (Intern)
UPDATE public.document_templates
SET title = 'Info Wirtschaft (Intern)',
    mail_subject = '🏠 Schützenhaus-Reservation bezahlt: {vertragsnr} ({mietdatum})',
    mail_body = '<p>Hallo {wirtschaft_name},</p>' || E'\n\n' ||
'<p>die Reservation für die Schützenstube ist bezahlt und damit definitiv bestätigt:</p>' || E'\n\n' ||
'<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:150px; color:#475569; font-size:13.5px;"><strong>Buchungsnr.</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{vertragsnr}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mietdatum</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mietdatum} (Beginn: {festbeginn})</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mieter</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mieter_anrede} {mieter_vorname} {mieter_nachname}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Kontakt</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mieter_email} / {mieter_telefon}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Adresse</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mieter_adresse}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Notiz / Bemerkung</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{bemerkung}</td></tr>' || E'\n' ||
'</table>' || E'\n\n' ||
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 18px 0;"><tr>' || E'\n' ||
'  <td align="center" bgcolor="#d97706" style="background-color:#d97706; border-radius:6px; padding:11px 22px;">' || E'\n' ||
'    <a href="{cockpit_url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:''Segoe UI'',Arial,sans-serif; font-size:14px; font-weight:bold; line-height:18px; text-decoration:none; display:inline-block;">Im Vorstands-Cockpit öffnen</a>' || E'\n' ||
'  </td>' || E'\n' ||
'</tr></table>' || E'\n\n' ||
'<p>Freundliche Grüsse<br><strong>Sportschützen Muhen</strong></p>' || E'\n' ||
'<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_info_wirtschaft';

-- 11. vm_bank_report: Rapport Bank-Mail-Eingang (behebt ???-Encoding)
UPDATE public.document_templates
SET title = 'Mail: Rapport Bank-Mail-Eingang (Intern)',
    mail_subject = '{bank_ergebnis} – Bank-Mail {vertragsnr}',
    mail_body = '<p>Hallo zusammen,</p>' || E'\n\n' ||
'<p>die Bank-Mail-Automation hat eine Raiffeisen-Gutschrift verarbeitet:</p>' || E'\n\n' ||
'<table class="vm-info-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; margin:14px 0; border:1px solid #e2e8f0;">' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; width:160px; color:#475569; font-size:13.5px;"><strong>Ergebnis</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;"><strong>{bank_ergebnis}</strong></td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Vertrag</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{vertragsnr}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mieter</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mieter_vorname} {mieter_nachname}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Mietdatum</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">{mietdatum}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Betrag erhalten</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">CHF {bank_betrag}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13.5px;"><strong>Sollbetrag</strong></td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:13.5px;">CHF {bank_sollbetrag}</td></tr>' || E'\n' ||
'  <tr><td style="padding:8px 12px; background-color:#f8fafc; color:#475569; font-size:13.5px;"><strong>Buchungsdatum</strong></td><td style="padding:8px 12px; color:#0f172a; font-size:13.5px;">{bank_buchungsdatum}</td></tr>' || E'\n' ||
'</table>' || E'\n\n' ||
'<div class="club-banner-callout" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: #1e3a8a;">{bank_hinweis}</div>' || E'\n\n' ||
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 18px 0;"><tr>' || E'\n' ||
'  <td align="center" bgcolor="#1e40af" style="background-color:#1e40af; border-radius:6px; padding:11px 22px;">' || E'\n' ||
'    <a href="{cockpit_url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:''Segoe UI'',Arial,sans-serif; font-size:14px; font-weight:bold; line-height:18px; text-decoration:none; display:inline-block;">Details im Vermietungs-Cockpit</a>' || E'\n' ||
'  </td>' || E'\n' ||
'</tr></table>' || E'\n\n' ||
'<p>Automatisches System<br><strong>Sportschützen Muhen</strong></p>',
    is_system = true,
    version = version + 1,
    updated_at = now()
WHERE code = 'vm_bank_report';

COMMIT;
