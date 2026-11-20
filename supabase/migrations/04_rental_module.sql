-- ==============================================================================
-- 04_rental_module.sql
-- Migration: Phase 3 – Fachmodul VERMIETUNG (Schützenstube & Schützenhaus)
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. ENUMS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rental_status') THEN
        CREATE TYPE public.rental_status AS ENUM (
            'inquiry',          -- Unverbindliche Terminanfrage über Website (Vorab-Prüfung)
            'conflict',         -- 00 - Datum belegt / Terminkonflikt
            'contract_sent',    -- 01 - Mietvertrag & QR-Rechnung versandt (Offen)
            'reminded',         -- 02 - Mietbetrag gemahnt
            'paid',             -- 03 - Zahlung erhalten
            'keys_issued',      -- 04 - Schlüsselübergabe erfolgt / versandt
            'completed',        -- Anlass abgeschlossen & abgerechnet
            'cancelled'         -- 05 - Reservation storniert
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'archive_sync_status') THEN
        CREATE TYPE public.archive_sync_status AS ENUM (
            'not_applicable',
            'pending',
            'archived',
            'error'
        );
    END IF;
END$$;

-- 2. DYNAMISCHE EINSTELLUNGEN (Keine Hartcodierungen in Mails / Skripten!)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Initiale Konfiguration mit Vorlagen-ID und Vereinsdaten
INSERT INTO public.rental_settings (setting_key, setting_value, description)
VALUES
    ('club_name', 'Sportschützen Muhen', 'Offizieller Vereinsname'),
    ('club_email', 'sportschuetzen.muhen@gmail.com', 'Hauptkontakt / CC für Vermietungen'),
    ('calendar_id', 'sportschuetzen.muhen@gmail.com', 'Google Calendar ID für Belegungen'),
    ('google_doc_template_id', '1j6s4pq0dOHyF0Viko_uDfhbTwO5pPCX_ZYfu6nC0N-o', 'Google Doc Template-ID für Mietvertrag mit QR-Einzahlungsschein'),
    ('sender_first_name', 'Daniel', 'Vorname des Vermieters / Absenders'),
    ('sender_last_name', 'Hunziker', 'Nachname des Vermieters / Absenders'),
    ('sender_phone', '+41 79 123 45 67', 'Telefonnummer des Vermieters'),
    ('wirtschaft_name', 'Wirtschaftsteam', 'Name / Kontakt Schlüsselübergabe'),
    ('wirtschaft_phone', '+41 79 987 65 43', 'Telefon Schlüsselübergabe'),
    ('wirtschaft_email', 'wirtschaft@sportschuetzen-muhen.ch', 'E-Mail Schlüsselübergabe'),
    ('wirtschaft_salutation', 'Hallo zusammen', 'Begrüssung im Wirtschafts-Mail'),
    ('iban', 'CH44 8080 8009 1234 5678 9', 'IBAN für Schweizer QR-Rechnung'),
    ('feedback_base_url', 'https://sportschuetzen-muhen.github.io/sportschuetzen/vermietungen/storno_feedback.html', 'Basis-URL für Storno-Rückmeldung'),
    ('maps_url', 'https://www.google.com/maps/search/?api=1&query=Schützenhaus+Muhen', 'Google Maps Link Schützenhaus'),
    ('logo_url', 'https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-512.png', 'Logo URL für Mail-Header')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = now();

-- 3. TARIFE & MIETPREISE (rental_pricing)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_code VARCHAR(50) UNIQUE NOT NULL,           -- z.B. 'standard_tag', 'mitglied_rabatt', 'abend'
    description VARCHAR(150) NOT NULL,
    base_price_chf NUMERIC(10,2) NOT NULL,
    cleaning_fee_chf NUMERIC(10,2) DEFAULT 0.00,
    deposit_chf NUMERIC(10,2) DEFAULT 200.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.rental_pricing (tariff_code, description, base_price_chf, cleaning_fee_chf, deposit_chf, is_active)
VALUES
    ('standard_tag', 'Ganzer Tag Schützenstube (Standard)', 300.00, 0.00, 200.00, true),
    ('mitglied_rabatt', 'Vereinsmitglieder Rabatt (Ganzer Tag)', 150.00, 0.00, 200.00, true),
    ('abend_kurz', 'Abendanlass unter der Woche', 200.00, 0.00, 200.00, true)
ON CONFLICT (tariff_code) DO UPDATE
SET description = EXCLUDED.description,
    base_price_chf = EXCLUDED.base_price_chf,
    is_active = EXCLUDED.is_active;

-- 4. SEQUENZ FÜR BUCHUNGSNUMMERN
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.rental_booking_seq START WITH 1;

-- 5. VERMIETUNGSANFRAGEN & BUCHUNGEN (rental_requests)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_number VARCHAR(30) UNIQUE NOT NULL,         -- 'V-2026-0001' oder 'A-2026-0001'
    is_inquiry BOOLEAN NOT NULL DEFAULT false,          -- true bei Vorab-Terminanfrage
    inquiry_type VARCHAR(50),                           -- 'reinigung', 'teilbelegung'
    inquiry_note TEXT,                                  -- Info für Vorab-Prüfung
    
    -- Mietzeitraum
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    festbeginn VARCHAR(50),                             -- z.B. '14:00'
    
    -- Mieter- & Kundendaten (aus Homepage-Formular)
    salutation VARCHAR(20),                             -- 'Herr', 'Frau', 'Familie', 'Firma'
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    street VARCHAR(150) NOT NULL,
    post_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    
    -- Finanzen (Dynamisch berechnet / aus Tarif)
    pricing_id UUID REFERENCES public.rental_pricing(id),
    total_amount_chf NUMERIC(10,2) NOT NULL DEFAULT 300.00,
    deposit_amount_chf NUMERIC(10,2) DEFAULT 200.00,
    is_paid BOOLEAN DEFAULT false,
    
    -- Status & Workflow
    status public.rental_status NOT NULL DEFAULT 'contract_sent',
    rejection_reason TEXT,
    cancellation_reason TEXT,
    
    -- Workflow-Zeitstempel & Protokolle
    datum_vertrag DATE,
    datum_mahnung DATE,
    datum_schluessel DATE,
    datum_storno DATE,
    datum_raiffeisen DATE,
    status_raiffeisen VARCHAR(100),
    kommentar_raiffeisen TEXT,
    mail_wirtschaft_sent_at TIMESTAMPTZ,
    
    -- Externe Verknüpfungen
    google_calendar_event_id VARCHAR(255),
    contract_file_url TEXT,                             -- Direktlink zum generierten PDF-Mietvertrag
    paperless_status public.archive_sync_status NOT NULL DEFAULT 'not_applicable',
    paperless_document_id INTEGER,
    
    admin_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_by UUID REFERENCES auth.users(id)
);

-- Trigger: Automatische Buchungsnummer generieren falls nicht angegeben
CREATE OR REPLACE FUNCTION public.generate_rental_booking_number()
RETURNS TRIGGER AS $$
DECLARE
    cur_year TEXT;
    prefix TEXT;
    seq_val BIGINT;
BEGIN
    IF NEW.booking_number IS NULL OR NEW.booking_number = '' THEN
        cur_year := TO_CHAR(COALESCE(NEW.start_date, now()::date), 'YYYY');
        IF NEW.is_inquiry THEN
            prefix := 'A-';
        ELSE
            prefix := 'V-';
        END IF;
        seq_val := nextval('public.rental_booking_seq');
        NEW.booking_number := prefix || cur_year || '-' || LPAD(seq_val::TEXT, 4, '0');
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rental_booking_number ON public.rental_requests;
CREATE TRIGGER trg_rental_booking_number
    BEFORE INSERT ON public.rental_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_rental_booking_number();

-- 6. STATUS-HISTORIE (rental_status_logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_request_id UUID NOT NULL REFERENCES public.rental_requests(id) ON DELETE CASCADE,
    previous_status public.rental_status,
    new_status public.rental_status NOT NULL,
    comment TEXT,
    changed_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: Automatischer Eintrag in rental_status_logs bei Statusänderung
CREATE OR REPLACE FUNCTION public.log_rental_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.rental_status_logs (rental_request_id, previous_status, new_status, comment, changed_by)
        VALUES (NEW.id, NULL, NEW.status, 'Reservation erstellt', 'System');
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.rental_status_logs (rental_request_id, previous_status, new_status, comment, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, 'Status gewechselt von ' || OLD.status::TEXT || ' zu ' || NEW.status::TEXT, 'Portal / Workflow');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_rental_status ON public.rental_requests;
CREATE TRIGGER trg_log_rental_status
    AFTER INSERT OR UPDATE OF status ON public.rental_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.log_rental_status_change();

-- 7. STORNO-RÜCKMELDUNGEN (rental_cancellation_feedbacks)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_cancellation_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_request_id UUID REFERENCES public.rental_requests(id) ON DELETE SET NULL,
    booking_number VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    remarks TEXT,
    is_urgent BOOLEAN DEFAULT false,                    -- true bei "Zahlung bereits getätigt"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_rentals_dates ON public.rental_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON public.rental_requests(status);
CREATE INDEX IF NOT EXISTS idx_rentals_vnr ON public.rental_requests(booking_number);
CREATE INDEX IF NOT EXISTS idx_rentals_email ON public.rental_requests(email);
CREATE INDEX IF NOT EXISTS idx_rental_logs_req ON public.rental_status_logs(rental_request_id);
CREATE INDEX IF NOT EXISTS idx_rental_feedback_vnr ON public.rental_cancellation_feedbacks(booking_number);

-- 8. INITIALES SEED-DATA (Historische Beispiel-Buchungen zur Demonstration)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    p_std UUID;
BEGIN
    SELECT id INTO p_std FROM public.rental_pricing WHERE tariff_code = 'standard_tag' LIMIT 1;
    
    INSERT INTO public.rental_requests (
        booking_number, is_inquiry, start_date, end_date, festbeginn,
        salutation, first_name, last_name, street, post_code, city,
        email, phone, pricing_id, total_amount_chf, status,
        datum_vertrag, datum_mahnung, datum_schluessel
    ) VALUES
    ('V-2026-0001', false, '2026-05-16', '2026-05-16', '14:00', 'Herr', 'Markus', 'Muster', 'Hauptstrasse 12', '5037', 'Muhen', 'markus.muster@beispiel.ch', '079 111 22 33', p_std, 300.00, 'paid', '2026-02-10', NULL, '2026-02-18'),
    ('V-2026-0002', false, '2026-06-20', '2026-06-20', '16:00', 'Frau', 'Sarah', 'Weber', 'Dorfplatz 4', '5034', 'Suhr', 'sarah.weber@beispiel.ch', '078 222 33 44', p_std, 300.00, 'reminded', '2026-02-15', '2026-03-01', NULL),
    ('V-2026-0003', false, '2026-07-04', '2026-07-04', '11:00', 'Familie', 'Peter', 'Keller', 'Aarauerstrasse 8', '5000', 'Aarau', 'peter.keller@beispiel.ch', '076 333 44 55', p_std, 300.00, 'contract_sent', '2026-03-05', NULL, NULL),
    ('V-2026-0004', false, '2026-08-15', '2026-08-15', '18:00', 'Herr', 'Thomas', 'Meier', 'Lindenweg 2', '5037', 'Muhen', 'thomas.meier@beispiel.ch', '079 444 55 66', p_std, 300.00, 'cancelled', '2026-01-10', '2026-01-25', NULL)
    ON CONFLICT (booking_number) DO NOTHING;

    INSERT INTO public.rental_cancellation_feedbacks (booking_number, reason, remarks, is_urgent)
    VALUES
    ('V-2026-0004', 'Anlass abgesagt / Terminverschiebung', 'Unser Familienfest musste leider auf nächstes Jahr verschoben werden. Danke für das Verständnis!', false)
    ON CONFLICT DO NOTHING;
END$$;
