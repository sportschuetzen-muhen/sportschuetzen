-- ==============================================================================
-- 58_fix_mail_templates_html_and_rechnungen.sql
-- Bereinigung von Test-Artefakten & Normalisierung der Depot/Pfand-Vorlagen
-- Single Source of Truth: public.document_templates
-- ==============================================================================

UPDATE public.document_templates
SET intro = 'Guten Tag {vorname} {nachname}' || E'\n\n' || 'Anbei erhältst du die Rechnung für das zu hinterlegende Depot / Pfand für das von dir bezogene Vereinsmaterial.',
    outro = 'Das Depot wird dir bei vollständiger und unversehrter Rückgabe des Materials selbstverständlich vollumfänglich zurückerstattet.' || E'\n\n' || 'Freundliche Grüsse' || E'\n\n' || 'Sportschützen Muhen' || E'\n\n' || '{absender_name}' || E'\n' || '{absender_funktion}',
    mail_body = '<p>Guten Tag {vorname} {nachname},</p><p>Anbei senden wir dir die Rechnung {rechnungsnummer} über CHF {gesamtbetrag} für das hinterlegte Depot / Pfand für das bezogene Vereinsmaterial.</p><p>Dieses Depot wird dir bei unversehrter Rückgabe des Materials vollumfänglich zurückerstattet.</p><p>Sportliche Grüsse</p><p>Sportschützen Muhen<br>{absender_name}<br>{absender_funktion}</p>',
    updated_at = now()
WHERE id = 'depot_pfand' OR code = 'depot_pfand';
