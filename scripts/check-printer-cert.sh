#!/bin/bash
PRINTER_IP=${1:-192.168.68.200}
PORT=${2:-443}

RAW_OUTPUT=$(echo | openssl s_client -connect "${PRINTER_IP}:${PORT}" 2>/dev/null)
if [ -z "$RAW_OUTPUT" ]; then
    echo '{"success":false,"error":"Drucker nicht erreichbar"}'
    exit 1
fi

CERT_TEXT=$(echo "$RAW_OUTPUT" | openssl x509 -noout -dates -subject -issuer 2>/dev/null)
if [ -z "$CERT_TEXT" ]; then
    echo '{"success":false,"error":"Kein SSL-Zertifikat empfangen"}'
    exit 1
fi

NOT_AFTER=$(echo "$CERT_TEXT" | grep 'notAfter=' | cut -d= -f2)
NOT_BEFORE=$(echo "$CERT_TEXT" | grep 'notBefore=' | cut -d= -f2)
SUBJECT=$(echo "$CERT_TEXT" | grep 'subject=' | cut -d= -f2-)
ISSUER=$(echo "$CERT_TEXT" | grep 'issuer=' | cut -d= -f2-)

ISO_END=$(date -d "$NOT_AFTER" --iso-8601=seconds -u)
ISO_START=$(date -d "$NOT_BEFORE" --iso-8601=seconds -u)
NOW_TS=$(date +%s)
END_TS=$(date -d "$NOT_AFTER" +%s)
DAYS_REMAINING=$(( (END_TS - NOW_TS) / 86400 ))
CHECKED_AT=$(date --iso-8601=seconds -u)

# Update system_app_configs in PostgreSQL
docker exec -i supabase-db psql -U postgres -d postgres << SQLEOF >/dev/null 2>&1
INSERT INTO system_app_configs (key, value, description, category)
VALUES (
    'festkasse_printer_cert',
    json_build_object(
        'issuer', '$ISSUER',
        'subject', '$SUBJECT',
        'valid_from', '$ISO_START',
        'valid_to', '$ISO_END',
        'printer_ip', '$PRINTER_IP',
        'port', $PORT,
        'days_remaining', $DAYS_REMAINING,
        'checked_at', '$CHECKED_AT'
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

cat << JSONEOF
{
  "success": true,
  "printerIp": "$PRINTER_IP",
  "port": $PORT,
  "valid_from": "$ISO_START",
  "valid_to": "$ISO_END",
  "daysRemaining": $DAYS_REMAINING,
  "issuer": "$ISSUER",
  "subject": "$SUBJECT",
  "checked_at": "$CHECKED_AT"
}
JSONEOF

