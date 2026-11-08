-- =============================================================================
-- 101: Storno-Mails – Feedback-Link als geräteübergreifender Button
-- =============================================================================
-- Statt der sichtbaren Roh-URL wird ein "Bulletproof"-Button (reine Tabelle,
-- Padding + bgcolor auf der Zelle) verwendet. Funktioniert in Outlook Desktop
-- (Word-Engine), Outlook Web/Mobile, Gmail, Apple Mail, iOS/Android & Dark Mode.
-- Bewusst ohne VML-/MSO-Kommentare und ohne DIV-Wrapper, da der Vorlagen-Editor
-- (ClubWysiwyg.cleanHtml) diese entfernen bzw. umwandeln würde.
-- Ein Scanner-/Prefetch-Aufruf des Links ist unkritisch (GET zeigt nur das Formular).
-- =============================================================================

UPDATE public.document_templates
   SET mail_body = regexp_replace(
         mail_body,
         ':<br>\s*<a href="\{feedback_url\}"[^>]*>\{feedback_url\}</a></p>',
         ':</p>' || E'\n' ||
         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 18px 0;"><tr>' ||
         '<td align="center" bgcolor="#742a2a" style="background-color:#742a2a; border-radius:6px; padding:12px 26px;">' ||
         '<a href="{feedback_url}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:''Segoe UI'',Arial,sans-serif; font-size:16px; font-weight:bold; line-height:20px; text-decoration:none; display:inline-block;">Rückmeldung geben</a>' ||
         '</td></tr></table>'
       ),
       updated_at = now()
 WHERE code IN ('vm_storno', 'vm_storno_verzug')
   AND mail_body ~ '<a href="\{feedback_url\}"[^>]*>\{feedback_url\}</a>';
