-- Migration 69: System-Mail-Konfiguration für Standblatt-Uploads
-- Trägt den Verteiler 'Info_Mail_Standblatt_Upload' unter dem Modul 'jahresmeisterschaft' ein.

INSERT INTO public.system_mail_configs (id, modul, schluessel, bezeichnung, mailadresse, beschreibung, sort_order)
VALUES (
    gen_random_uuid(),
    'jahresmeisterschaft',
    'Info_Mail_Standblatt_Upload',
    'Info-Mail: Standblatt-Upload',
    'dan.hunziker@bluewin.ch',
    'Empfänger einer Kopie bei Standblatt-Einreichung via Web-App (PWA)',
    60
)
ON CONFLICT (schluessel) DO UPDATE SET
    bezeichnung = EXCLUDED.bezeichnung,
    beschreibung = EXCLUDED.beschreibung,
    modul = EXCLUDED.modul,
    sort_order = EXCLUDED.sort_order;
