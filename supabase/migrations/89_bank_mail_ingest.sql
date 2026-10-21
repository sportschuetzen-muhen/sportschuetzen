-- ==============================================================================
-- Migration 89: Automatischer Bank-Mail-Eingang (Raiffeisen → Vermietung)
-- Sportschützen Muhen - Zentrales Vereinsportal
--
-- Ablösung des GAS-Triggers processRaiffeisenEmails() (vermietung_GAS/raiffeisen.js).
-- Die Edge Function `process-bank-mails` liest das Gmail-Postfach
-- sportschuetzen.muhen@gmail.com (Gmail API, OAuth Refresh-Token) und verbucht
-- erkannte Mietzahlungen über die RPC confirm_rental_payment().
--
-- Inhalt:
-- 1. Tabelle public.bank_mail_ingest_logs (Idempotenz + Audit, RLS vermietung.view)
-- 2. Trigger log_rental_status_change: optionaler Kommentar/Akteur via Session-GUC
-- 3. RPC public.confirm_rental_payment() (atomar: Status, Zahlungsstufe 1, RechnungsCore-Zahlung)
-- 4. RPC public.verify_bank_ingest_secret() (Cron-Authentifizierung via Supabase Vault)
-- 5. Mail-Vorlage vm_bank_report (Modul Dokumente-Vorlagen)
-- 6. System-Mail-Verteiler Info_Mail_Bank_Eingang
-- 7. pg_cron Job 'bank-mail-ingest' (alle 2 Stunden)
--
-- Voraussetzung (einmalig, NICHT im Repository):
--   SELECT vault.create_secret('<zufälliger-wert>', 'bank_ingest_cron_secret');
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Ingest-Log
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_mail_ingest_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gmail_message_id   VARCHAR(64) NOT NULL UNIQUE,
    gmail_thread_id    VARCHAR(64),
    mail_from          TEXT,
    mail_subject       TEXT,
    mail_date          TIMESTAMPTZ,
    contract_nr        VARCHAR(30),
    amount_chf         NUMERIC(10,2),
    booking_date       DATE,
    rental_request_id  UUID REFERENCES public.rental_requests(id) ON DELETE SET NULL,
    result             VARCHAR(30) NOT NULL DEFAULT 'processing'
                       CHECK (result IN ('processing','success','already_paid','underpaid',
                                         'unknown_contract','cancelled','ignored','parse_error','error')),
    error_message      TEXT,
    mail_error         TEXT,
    raw_excerpt        TEXT,
    processed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_ingest_contract ON public.bank_mail_ingest_logs (contract_nr);
CREATE INDEX IF NOT EXISTS idx_bank_ingest_processed ON public.bank_mail_ingest_logs (processed_at DESC);

ALTER TABLE public.bank_mail_ingest_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_mail_ingest_logs_rbac_select ON public.bank_mail_ingest_logs;
CREATE POLICY bank_mail_ingest_logs_rbac_select ON public.bank_mail_ingest_logs
    FOR SELECT TO authenticated
    USING ((SELECT public.rbac_allows(ARRAY['vermietung.view','vermietung.manage'])));

DROP POLICY IF EXISTS bank_mail_ingest_logs_rbac_write ON public.bank_mail_ingest_logs;
CREATE POLICY bank_mail_ingest_logs_rbac_write ON public.bank_mail_ingest_logs
    FOR ALL TO authenticated
    USING ((SELECT public.rbac_allows(ARRAY['vermietung.manage'])))
    WITH CHECK ((SELECT public.rbac_allows(ARRAY['vermietung.manage'])));

REVOKE ALL ON public.bank_mail_ingest_logs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.bank_mail_ingest_logs TO authenticated;
GRANT ALL ON public.bank_mail_ingest_logs TO service_role;

-- ------------------------------------------------------------------------------
-- 2. Status-Trigger: optionaler Kommentar & Akteur (abwärtskompatibel)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_rental_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_comment TEXT := NULLIF(current_setting('app.rental_log_comment', true), '');
    v_actor   TEXT := NULLIF(current_setting('app.rental_log_actor', true), '');
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.rental_status_logs (rental_request_id, previous_status, new_status, comment, changed_by)
        VALUES (NEW.id, NULL, NEW.status, COALESCE(v_comment, 'Reservation erstellt'), COALESCE(v_actor, 'System'));
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.rental_status_logs (rental_request_id, previous_status, new_status, comment, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status,
                COALESCE(v_comment, 'Status gewechselt von ' || OLD.status::TEXT || ' zu ' || NEW.status::TEXT),
                COALESCE(v_actor, 'Portal / Workflow'));
    END IF;
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. RPC confirm_rental_payment
--    Zahlungsstufe 1 («Info-Mail Bank») serverseitig & atomar.
--    Rückgabe-Codes: success | already_paid | unknown_contract | cancelled | underpaid
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_rental_payment(
    p_booking_number TEXT,
    p_amount         NUMERIC,
    p_payment_date   DATE DEFAULT CURRENT_DATE,
    p_source         TEXT DEFAULT 'Bank-Mail Raiffeisen'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rental   RECORD;
    v_soll     NUMERIC(10,2);
    v_inv_res  JSONB;
    v_inv_id   VARCHAR(50);
    v_inv      RECORD;
    v_pay_amt  NUMERIC(10,2);
    v_pay_res  JSONB := NULL;
    v_comment  TEXT;
BEGIN
    -- Berechtigung: Service-Role (Edge Function / Cron), DB-Admin oder vermietung.manage
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
        OR public.rbac_allows(ARRAY['vermietung.manage'])
    ) THEN
        RAISE EXCEPTION 'Keine Berechtigung (vermietung.manage erforderlich).' USING ERRCODE = '42501';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Ungültiger Zahlungsbetrag: %', p_amount;
    END IF;

    SELECT * INTO v_rental
    FROM public.rental_requests
    WHERE booking_number = p_booking_number
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'unknown_contract',
                                  'message', 'Vertrag ' || COALESCE(p_booking_number, 'NULL') || ' nicht gefunden.');
    END IF;

    v_soll := COALESCE(v_rental.total_amount_chf, 0);

    IF v_rental.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'code', 'cancelled', 'rental_id', v_rental.id,
                                  'soll_amount', v_soll,
                                  'message', 'Reservation ' || p_booking_number || ' ist storniert.');
    END IF;

    IF v_rental.is_paid IS TRUE OR v_rental.status IN ('paid', 'keys_issued', 'completed') THEN
        RETURN jsonb_build_object('success', true, 'code', 'already_paid', 'rental_id', v_rental.id,
                                  'soll_amount', v_soll,
                                  'message', 'Reservation ' || p_booking_number || ' ist bereits als bezahlt erfasst.');
    END IF;

    IF p_amount < v_soll THEN
        RETURN jsonb_build_object('success', false, 'code', 'underpaid', 'rental_id', v_rental.id,
                                  'soll_amount', v_soll,
                                  'message', format('Zahlung zu niedrig: erhalten CHF %s, Soll CHF %s.',
                                                    to_char(p_amount, 'FM999990.00'), to_char(v_soll, 'FM999990.00')));
    END IF;

    -- RechnungsCore: Proforma-Rechnung sicherstellen und Zahlung atomar verbuchen
    v_inv_res := public.ensure_rental_proforma_invoice(p_booking_number);
    IF COALESCE((v_inv_res->>'success')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Proforma-Rechnung für % konnte nicht sichergestellt werden: %',
                        p_booking_number, COALESCE(v_inv_res->>'error', 'unbekannt');
    END IF;
    v_inv_id := v_inv_res->>'invoice_id';

    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_id;
    IF FOUND AND v_inv.status IN ('offen', 'teilbezahlt', 'entwurf') THEN
        v_pay_amt := COALESCE(NULLIF(v_inv.open_amount, 0), v_inv.total_amount);
        IF v_pay_amt IS NOT NULL AND v_pay_amt > 0 THEN
            v_pay_res := public.record_invoice_payment(
                v_inv_id, v_pay_amt, p_payment_date, 'Bank',
                'BANK-' || p_booking_number,
                format('Zahlungseingang Mietvertrag %s (%s, erhalten CHF %s)',
                       p_booking_number, p_source, to_char(p_amount, 'FM999990.00')),
                true, NULL, NULL
            );
        END IF;
    END IF;

    v_comment := format('Zahlung automatisch erkannt via %s (CHF %s)', p_source, to_char(p_amount, 'FM999990.00'));
    IF p_amount > v_soll THEN
        v_comment := v_comment || format(' – Überzahlung CHF %s', to_char(p_amount - v_soll, 'FM999990.00'));
    END IF;

    PERFORM set_config('app.rental_log_comment', v_comment, true);
    PERFORM set_config('app.rental_log_actor', 'Bank-Mail-Automation', true);

    UPDATE public.rental_requests
    SET status = 'paid',
        is_paid = true,
        status_raiffeisen = 'bank_notified',
        datum_raiffeisen = p_payment_date,
        kommentar_raiffeisen = v_comment,
        updated_at = now()
    WHERE id = v_rental.id;

    PERFORM set_config('app.rental_log_comment', '', true);
    PERFORM set_config('app.rental_log_actor', '', true);

    RETURN jsonb_build_object(
        'success', true,
        'code', 'success',
        'rental_id', v_rental.id,
        'soll_amount', v_soll,
        'overpaid', GREATEST(p_amount - v_soll, 0),
        'invoice_id', v_inv_id,
        'payment', v_pay_res,
        'message', v_comment
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_rental_payment(TEXT, NUMERIC, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_rental_payment(TEXT, NUMERIC, DATE, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Cron-Secret-Prüfung (Secret liegt ausschliesslich im Supabase Vault)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_bank_ingest_secret(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'bank_ingest_cron_secret'
    LIMIT 1;

    RETURN v_secret IS NOT NULL AND p_secret IS NOT NULL AND length(p_secret) >= 24 AND v_secret = p_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_bank_ingest_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_bank_ingest_secret(TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. Mail-Vorlage: Admin-Rapport Bank-Mail-Eingang
-- ------------------------------------------------------------------------------
INSERT INTO public.document_templates (
    id, category, code, title, description, intro, outro, notice,
    mail_subject, mail_body, due_days, is_system, is_active, version, updated_at
) VALUES (
    'vm_bank_report',
    'vermietung_mail',
    'vm_bank_report',
    'Mail: Rapport Bank-Mail-Eingang (Intern)',
    'Interner Rapport an den Verteiler «Info_Mail_Bank_Eingang», sobald die Bank-Mail-Automation eine Raiffeisen-Gutschrift verarbeitet hat (Erfolg, Unterzahlung, unbekannter Vertrag, Fehler).',
    '', '', '',
    '{bank_ergebnis} – Bank-Mail {vertragsnr}',
    '<p>Hallo zusammen</p>'
    || '<p>Die Bank-Mail-Automation hat eine Raiffeisen-Gutschrift verarbeitet:</p>'
    || '<p><b>Ergebnis:</b> {bank_ergebnis}<br>'
    || '<b>Vertrag:</b> {vertragsnr}<br>'
    || '<b>Mieter:</b> {mieter_vorname} {mieter_nachname}<br>'
    || '<b>Mietdatum:</b> {mietdatum}<br>'
    || '<b>Betrag erhalten:</b> CHF {bank_betrag}<br>'
    || '<b>Sollbetrag:</b> CHF {bank_sollbetrag}<br>'
    || '<b>Buchungsdatum:</b> {bank_buchungsdatum}</p>'
    || '<div class="club-banner-callout" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: #1e3a8a;">{bank_hinweis}</div>'
    || '<p>Details findest du im Vermietungs-Cockpit: <a href="{cockpit_url}">{cockpit_url}</a></p>'
    || '<p>Automatisches System – Sportschützen Muhen</p>',
    NULL, true, true, 1, now()
) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. System-Mail-Verteiler für den Rapport
-- ------------------------------------------------------------------------------
INSERT INTO public.system_mail_configs (id, modul, schluessel, bezeichnung, mailadresse, beschreibung, sort_order)
VALUES (
    gen_random_uuid(),
    'vermietung',
    'Info_Mail_Bank_Eingang',
    'Info-Mail: Bank-Mail-Eingang (Raiffeisen)',
    'sportschuetzen.muhen@gmail.com',
    'Empfänger des Rapports der automatischen Bank-Mail-Verarbeitung (Zahlungseingänge Vermietung)',
    70
)
ON CONFLICT (schluessel) DO UPDATE SET
    bezeichnung = EXCLUDED.bezeichnung,
    beschreibung = EXCLUDED.beschreibung,
    modul = EXCLUDED.modul;

COMMIT;

-- ------------------------------------------------------------------------------
-- 7. pg_cron: alle 2 Stunden (Edge Function intern über das API-Gateway)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bank-mail-ingest') THEN
    PERFORM cron.unschedule('bank-mail-ingest');
  END IF;

  PERFORM cron.schedule(
    'bank-mail-ingest',
    '5 */2 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'http://kong:8000/functions/v1/process-bank-mails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bank_ingest_cron_secret' LIMIT 1)
        ),
        body := '{"trigger":"cron"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
END $$;
