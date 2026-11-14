-- ==============================================================================
-- 131_normalize_invoices_mail_status_versendet.sql
-- Normalisiert historisch gespeicherte mail_status = 'gesendet' Einträge
-- einheitlich auf den kanonischen Status 'versendet' (AGENTS.md Regel 6).
-- ==============================================================================

BEGIN;

UPDATE public.invoices
SET mail_status = 'versendet',
    updated_at = now()
WHERE LOWER(TRIM(COALESCE(mail_status, ''))) = 'gesendet';

COMMIT;
