-- ==============================================================================
-- 45_clean_rental_mail_templates.sql
-- Bereinigung von Browser-Erweiterungs-Artefakten (Noir/Dark Reader) in Vermietungs-Mailvorlagen
-- Single Source of Truth: public.document_templates
-- ==============================================================================

UPDATE public.document_templates
SET mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p><p>Vielen Dank! Die Zahlung für die Schützenstuben-Miete am {mietdatum} (Vertrag {vertragsnr}) ist bei uns eingegangen.</p><p>🔑 <b>Schlüsselübergabe vereinbaren:</b><br>Bitte kontaktiere rechtzeitig vor dem Anlass unsere Wirtschafts-Verantwortlichen zur Absprache der Übergabe:</p><p>{wirtschaft_name}<br>Telefon / WhatsApp: {wirtschaft_phone}<br>E-Mail: {wirtschaft_email}</p><div class="club-banner-callout" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: #78350f;"><strong>Wichtig: Bitte rechtzeitig einen Termin vereinbaren. Ohne Termin keine Übergabe.</strong></div><p>Wir wünschen bereits jetzt ein gelungenes Fest in unserer Schützenstube!</p><p>Freundliche Grüsse</p><p>Sportschützen Muhen</p><p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    updated_at = now()
WHERE id = 'vm_bestaetigung';

UPDATE public.document_templates
SET mail_body = '<p>Guten Tag {mieter_vorname} {mieter_nachname},</p><p>Bei der Prüfung unserer Zahlungseingänge konnten wir für die Reservation am {mietdatum} (Vertrag {vertragsnr}) noch keine Überweisung feststellen.</p><p>Offener Mietbetrag: CHF {mietbetrag}<br>Zahlungsfrist: Innert 7 Tagen<br>Zahlungsmethode: Bitte den Schweizer QR-Einzahlungsschein aus dem Mietvertrag verwenden</p><p>Bitte beachte, dass die Reservation erst mit Zahlungseingang definitiv gesichert ist. Sollte die Frist ungenutzt verstreichen, wird der Termin wieder freigegeben.<br>Bei Fragen oder bereits getätigter Überweisung melde dich bitte kurz bei uns.</p><p>Freundliche Grüsse</p><p>Sportschützen Muhen</p><p>{vermieter_name}<br>Telefon: {vermieter_telefon}<br>E-Mail: {vermieter_email}</p>',
    updated_at = now()
WHERE id = 'vm_mahnung';
