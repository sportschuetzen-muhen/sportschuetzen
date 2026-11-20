-- ==============================================================================
-- 85_document_templates_expansion.sql
-- Migration: Integration von Team-Manager, Gruppenanmeldung & Standblatt-Mails
--            Harmonisierung der Signaturen (Sportschützen Muhen oben, Vermieter unten)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

BEGIN;

-- 1. TEAM MANAGER: Aufgebot Wettkämpfe (tm_aufgebot)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'tm_aufgebot',
    'brief',
    'tm_aufgebot',
    'Team Manager: Aufgebot Wettkämpfe',
    'E-Mail-Aufgebot für eingeteilte Schützen (Grenzlandcup, Gruppen- und Mannschaftsmeisterschaft) mit PDF-Anhängen.',
    '', '', '',
    'Aufgebot {wettkaempfe}',
    '<p>Hallo</p>' || E'\n\n' ||
    '<p>Im Anhang findest du das offizielle Aufgebot für:</p>' || E'\n' ||
    '{wettkaempfe_liste}' || E'\n\n' ||
    '{pdf_liste}' || E'\n\n' ||
    '<p>Wir wünschen allen Schützinnen und Schützen «Guet Schuss» und viel Erfolg!</p>' || E'\n\n' ||
    '<p>Freundliche Grüsse</p>' || E'\n' ||
    '<p>Sportschützen Muhen</p>' || E'\n' ||
    '<p>{absender_name}<br>Team Manager</p>',
    NULL, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    category = 'brief',
    is_system = true,
    is_active = true,
    version = public.document_templates.version + 1,
    updated_at = now();


-- 2. GRUPPENANMELDUNG: Externe Schiessanlässe (gruppenanmeldung)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'gruppenanmeldung',
    'brief',
    'gruppenanmeldung',
    'Gruppenanmeldung an externe Veranstalter',
    'Offizielle Gruppenanmeldung der Sportschützen Muhen für auswärtige Schiessanlässe mit Gruppentabellen.',
    '', '', '',
    'Gruppenanmeldung Sportschützen Muhen für {anlass}',
    '<p>Guten Tag</p>' || E'\n\n' ||
    '<p>Wir nehmen gerne teil an eurem Anlass <strong>{anlass}</strong>.</p>' || E'\n\n' ||
    '<p style="color:#555;">Ein allfälliger Gruppengewinn ist bitte mittels beiliegendem Einzahlungsschein zu begleichen.</p>' || E'\n\n' ||
    '{gruppen_tabellen}' || E'\n\n' ||
    '<p style="margin-top:25px;">Besten Dank für die Organisation und «Guet Schuss»!</p>' || E'\n\n' ||
    '<p>Freundliche Grüsse</p>' || E'\n' ||
    '<p>Sportschützen Muhen</p>' || E'\n' ||
    '<p>{absender_name}</p>',
    NULL, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    category = 'brief',
    is_system = true,
    is_active = true,
    version = public.document_templates.version + 1,
    updated_at = now();


-- 3. JAHRESMEISTERSCHAFT: Standblatt-Upload Eingangsbestätigung (jm_standblatt_eingereicht)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'jm_standblatt_eingereicht',
    'brief',
    'jm_standblatt_eingereicht',
    'Standblatt-Upload: Eingangsbestätigung',
    'Automatische Bestätigung an den Schützen bei Einreichung eines Standblatts über die Web-App.',
    '', '', '',
    'Bestätigung: Eingang Standblatt – {anlass} ({punkte} Pkt)',
    '<p>Hallo <strong>{vorname}</strong>,</p>' || E'\n\n' ||
    '<p>vielen Dank für deine Meldung über <strong>{punkte} Punkte</strong> für das <strong>{anlass}</strong>{proxy_info}.</p>' || E'\n\n' ||
    '{info_banner}' || E'\n\n' ||
    '{detail_tabelle}' || E'\n\n' ||
    '{beleg_button}' || E'\n\n' ||
    '<p style="font-size:13px; color:#6b7280; margin-top:24px; border-top:1px solid #e5e7eb; padding-top:16px;">' || E'\n' ||
    'Sobald die Freigabe durch den Schützenmeister erfolgt ist, erscheint das Resultat offiziell in der Jahresmeisterschaft.<br>' || E'\n' ||
    '<a href="https://www.sportschuetzen-muhen.ch/resultate/aktuelles_Jahr/jahresmeisterschaft" style="color:#0284c7; text-decoration:none;">Zur Online-Rangliste der Jahresmeisterschaft</a>' || E'\n' ||
    '</p>' || E'\n\n' ||
    '<p>Guet Schuss!<br><strong>Sportschützen Muhen</strong></p>',
    NULL, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    category = 'brief',
    is_system = true,
    is_active = true,
    version = public.document_templates.version + 1,
    updated_at = now();


-- 4. JAHRESMEISTERSCHAFT: Resultat freigegeben (jm_standblatt_freigegeben)
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'jm_standblatt_freigegeben',
    'brief',
    'jm_standblatt_freigegeben',
    'Standblatt: Resultat freigegeben',
    'Benachrichtigung an den Schützen, sobald sein Standblatt vom Schützenmeister genehmigt und in die Rangliste übernommen wurde.',
    '', '', '',
    'Jahresmeisterschaft: Resultat freigegeben – {anlass} ({punkte} Pkt)',
    '<p>Hallo <strong>{vorname}</strong>,</p>' || E'\n\n' ||
    '<p>dein Standblatt für das <strong>{anlass}</strong> wurde soeben vom Schützenmeister geprüft und erfolgreich in die Jahresmeisterschaft übernommen.</p>' || E'\n\n' ||
    '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px; margin:20px 0; text-align:center;">' || E'\n' ||
    '  <div style="font-size:26px; font-weight:bold; color:#15803d;">{punkte} Punkte</div>' || E'\n' ||
    '  <div style="color:#4b5563; font-size:14px; margin-top:4px;">Max. {max_punkte} Pkt · Leistung: <strong>{prozent}%</strong></div>' || E'\n' ||
    '</div>' || E'\n\n' ||
    '<p style="font-size:14px;">' || E'\n' ||
    '  <a href="https://www.sportschuetzen-muhen.ch/resultate/aktuelles_Jahr/jahresmeisterschaft" style="color:#0284c7; font-weight:600; text-decoration:none;">' || E'\n' ||
    '    Zur Online-Rangliste der Jahresmeisterschaft →' || E'\n' ||
    '  </a>' || E'\n' ||
    '</p>' || E'\n\n' ||
    '<p style="font-size:13px; color:#6b7280; margin-top:24px; border-top:1px solid #e5e7eb; padding-top:16px;">' || E'\n' ||
    'Guet Schuss!<br>' || E'\n' ||
    '<strong>Sportschützen Muhen</strong>' || E'\n' ||
    '</p>',
    NULL, true, true, 1, now()
) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    mail_subject = EXCLUDED.mail_subject,
    mail_body = EXCLUDED.mail_body,
    category = 'brief',
    is_system = true,
    is_active = true,
    version = public.document_templates.version + 1,
    updated_at = now();


-- 5. VERMIETUNG: Harmonisierung der Signatur (Sportschützen Muhen oben, Vermieter unten)
-- 5.1 vm_anfrage
UPDATE public.document_templates
SET mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
    '<p>Vielen Dank für deine unverbindliche Terminanfrage für die Schützenstube Muhen am {mietdatum} (geplanter Festbeginn: {festbeginn}).</p>' || E'\n\n' ||
    '<p>Da an oder um diesen Termin bereits andere Vereinsaktivitäten oder Reinigungspuffer anstehen, prüfen wir derzeit die zeitliche Machbarkeit mit unserem Team.</p>' || E'\n\n' ||
    '<p>Wir melden uns in Kürze direkt bei dir.</p>' || E'\n\n' ||
    '<p>Freundliche Grüsse</p>' || E'\n' ||
    '<p>Sportschützen Muhen</p>' || E'\n' ||
    '<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    version = version + 1,
    updated_at = now()
WHERE id = 'vm_anfrage';

-- 5.2 vm_vertrag
UPDATE public.document_templates
SET mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
    '<p>Vielen Dank für deine Reservation der Schützenstube Muhen am {mietdatum}. Anbei erhältst du den offiziellen Mietvertrag inklusive Schweizer QR-Rechnung.</p>' || E'\n\n' ||
    '<div class="club-banner-callout" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 12px 16px; margin: 16px 0; line-height: 1.55;">' || E'\n' ||
    '  <strong style="color: #78350f; font-size: 13.5px;">Wichtige Hinweise zum Abschluss:</strong><br>' || E'\n' ||
    '  <span style="color: #78350f; font-size: 13px;">' || E'\n' ||
    '    <strong>Vertragsabschluss:</strong> Wirksam mit der Zahlung von CHF {mietbetrag} innert {zahlungsfrist_tage} Tagen.<br>' || E'\n' ||
    '    <strong>Zahlung:</strong> Bitte CHF {mietbetrag} via <strong>QR-Einzahlungsschein auf der letzten Seite</strong> des PDF-Anhanges überweisen.' || E'\n' ||
    '  </span>' || E'\n' ||
    '</div>' || E'\n\n' ||
    '<p>Wir freuen uns, dich bald bei uns in der Schützenstube begrüssen zu dürfen.</p>' || E'\n\n' ||
    '<p>Freundliche Grüsse</p>' || E'\n' ||
    '<p>Sportschützen Muhen</p>' || E'\n' ||
    '<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    version = version + 1,
    updated_at = now()
WHERE id = 'vm_vertrag';

-- 5.3 vm_storno
UPDATE public.document_templates
SET mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
    '<p>Die Reservation für die Schützenstube Muhen am {mietdatum} (Vertrag {vertragsnr}) wurde storniert.</p>' || E'\n\n' ||
    '<p>Dein Feedback ist uns sehr wichtig, um unseren Service kontinuierlich zu verbessern:<br>' || E'\n' ||
    '<a href="{feedback_url}" target="_blank" style="color: #0284c7; text-decoration: underline;">{feedback_url}</a></p>' || E'\n\n' ||
    '<p>Falls die Stornierung irrtümlich erfolgte oder du die Zahlung bereits getätigt hast, melde dich bitte umgehend bei uns.</p>' || E'\n\n' ||
    '<p>Freundliche Grüsse</p>' || E'\n' ||
    '<p>Sportschützen Muhen</p>' || E'\n' ||
    '<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    version = version + 1,
    updated_at = now()
WHERE id = 'vm_storno';

-- 5.4 vm_storno_verzug
UPDATE public.document_templates
SET mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p>' || E'\n\n' ||
    '<p>Da wir für deine Reservation der Schützenstube am {mietdatum} (Vertrag {vertragsnr}) trotz Zahlungserinnerung keinen Zahlungseingang feststellen konnten und keine Rückmeldung erhalten haben, mussten wir die Reservation stornieren und den Termin wieder freigeben.</p>' || E'\n\n' ||
    '<p>Falls du an der Miete weiterhin interessiert bist oder es sich hierbei um ein Missverständnis handelt, bitten wir dich um eine kurze Rückmeldung:<br>' || E'\n' ||
    '<a href="{feedback_url}" target="_blank" style="color: #0284c7; text-decoration: underline;">{feedback_url}</a></p>' || E'\n\n' ||
    '<p>Freundliche Grüsse</p>' || E'\n' ||
    '<p>Sportschützen Muhen</p>' || E'\n' ||
    '<p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    version = version + 1,
    updated_at = now()
WHERE id = 'vm_storno_verzug';

COMMIT;
