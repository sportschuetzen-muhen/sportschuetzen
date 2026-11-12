#!/bin/bash
set -e
cd /opt/muhen-ca

echo "=== Sportschützen Muhen - Epson POS Zertifikat Erneuerung ==="
# 1. Neuen Server-Schlüssel & CSR generieren
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -config server.cnf

# 2. Durch bestehende Root CA signieren (365 Tage)
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 365 -extfile server.cnf -extensions v3_req -sha256

# 3. PKCS#12 Bundle (.pfx) mit Kennwort 'epson' bauen (legacy für Epson Firmware)
openssl pkcs12 -export -out epson_printer.pfx -inkey server.key -in server.crt -certfile ca.crt -passout pass:epson -legacy
openssl pkcs12 -export -out epson_printer_std.pfx -inkey server.key -in server.crt -certfile ca.crt -passout pass:epson

# 4. Ablaufdatum auslesen
EXP_DATE=$(openssl x509 -in server.crt -noout -enddate | cut -d= -f2)
ISO_DATE=$(date -d "$EXP_DATE" --iso-8601=seconds -u)
NOW_ISO=$(date --iso-8601=seconds -u)

echo "✓ Neues Zertifikat erfolgreich generiert!"
echo "Gültig bis: $EXP_DATE ($ISO_DATE)"
echo "Datei für Drucker-Import: /opt/muhen-ca/epson_printer.pfx"
echo "Passwort: epson"

# 5. Aktualisiere system_app_configs in PostgreSQL
docker exec -i supabase-db psql -U postgres -d postgres << SQLEOF
INSERT INTO system_app_configs (key, value, description, category)
VALUES (
    'festkasse_printer_cert',
    json_build_object(
        'issuer', 'Sportschuetzen Muhen Root CA',
        'subject', '192.168.68.200',
        'valid_to', '$ISO_DATE',
        'printer_ip', '192.168.68.200',
        'port', 443,
        'renewed_at', '$NOW_ISO'
    )::text,
    'TLS-Zertifikatsstatus für Epson Bondrucker ePOS-Print (Gültigkeit & 30-Tage-Ablaufwarnung)',
    'festkasse'
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW();
SQLEOF

echo "✓ Datenbank-Eintrag in system_app_configs aktualisiert."

