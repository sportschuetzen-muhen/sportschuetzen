-- Migration: Initialer Eintrag für festkasse_printer_cert in system_app_configs
-- Phase: Festkasse POS TLS-Zertifikat Ablauf-Monitoring

INSERT INTO public.system_app_configs (key, value, description, category)
VALUES (
    'festkasse_printer_cert',
    json_build_object(
        'issuer', 'Sportschuetzen Muhen Root CA',
        'subject', '192.168.68.200',
        'valid_to', '2027-11-12T19:04:10Z',
        'printer_ip', '192.168.68.200',
        'port', 443,
        'renewed_at', '2026-11-12T19:04:10Z'
    )::text,
    'TLS-Zertifikatsstatus für Epson Bondrucker ePOS-Print (Gültigkeit & 30-Tage-Ablaufwarnung)',
    'festkasse'
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW();
