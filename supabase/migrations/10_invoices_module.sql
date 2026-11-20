-- ==============================================================================
-- 10_invoices_module.sql
-- Migration: Fachmodul RECHNUNGEN & FAKTURIERUNG (Phase 10)
-- Projekt: Vereinsportal Sportschützen Muhen
--
-- Tabellen:
-- 1. public.invoices: Rechnungs-Kopfdaten (ID, PersonNumber, Name, Typ, Betrag,
--    Status, Zahlungsdaten, PDF-URL, Mailstatus, Mahnwesen, Notizen)
-- 2. public.invoice_positions: Rechnungspositionen mit Gegenkonto & Betrag
-- 3. public.invoice_templates: Wiederverwendbare Standard-Positionen
-- 4. public.invoice_layouts: Textbausteine & Vorlagentexte je Rechnungstyp
-- 5. public.external_contacts: Externe Adressen (Kunden, Firmen, Sponsoren)
-- ==============================================================================

-- 1. TABELLE: public.invoices (Rechnungsköpfe)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
    id VARCHAR(50) PRIMARY KEY,                         -- z. B. 'RE-26-7K4M', 'MV-26-8N2W', 'JB-26-XXXX'
    person_number VARCHAR(50),                          -- Verknüpfung zu public.members(person_number) oder 'EXT-XXXX'
    recipient_name VARCHAR(255) NOT NULL,               -- Name des Empfängers / Firma
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    type VARCHAR(50) NOT NULL DEFAULT 'Jahresbeitrag',  -- 'Jahresbeitrag', 'Vermietung', 'Schulsport', 'Sponsoring', 'Materialverkauf', 'Sonstige'
    status VARCHAR(30) NOT NULL DEFAULT 'offen',        -- 'offen', 'bezahlt', 'storniert'
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    payment_date DATE,
    payment_method VARCHAR(50),                         -- 'Überweisung', 'Bar', 'TWINT', 'CAMT053'
    document_ref VARCHAR(100),                          -- Beleg-Nr / Buchungsreferenz
    pdf_url TEXT,                                       -- Google Drive URL oder Supabase Storage Link
    pdf_storage_path TEXT,                              -- Optionaler Pfad im Bucket 'rechnungen'
    mail_status VARCHAR(50) DEFAULT 'entwurf',          -- 'entwurf', 'versendet', 'fehler', 'nicht_versenden'
    send_date TIMESTAMPTZ,
    mahnstufe INTEGER NOT NULL DEFAULT 0,               -- 0 = Keine, 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung
    mahn_datum DATE,
    mahn_historie JSONB DEFAULT '[]'::jsonb,            -- Chronologischer Verlauf aller Mahnungen
    notes TEXT,                                         -- Interne Bemerkungen
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_year ON public.invoices(year);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON public.invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_person ON public.invoices(person_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON public.invoices(created_at DESC);

-- 2. TABELLE: public.invoice_positions (Rechnungspositionen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id VARCHAR(50) NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    position_nr INTEGER NOT NULL DEFAULT 1,
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    konto VARCHAR(50) NOT NULL DEFAULT '3000',           -- Habenkonto (z. B. '3000' Beitragsertrag, '3400' Mietertrag, '3200' Schulsport)
    type VARCHAR(50) DEFAULT 'standard',                -- 'standard', 'custom', 'rabatt'
    source_field VARCHAR(50),                           -- Zuordnung zu Gebührenkatalogen (z.B. 'RA001', 'RA002')
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_pos_invoice_id ON public.invoice_positions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_pos_konto ON public.invoice_positions(konto);

-- 3. TABELLE: public.invoice_templates (Standard-Positionen)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL DEFAULT 'Allgemein',
    description VARCHAR(255) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    habenkonto VARCHAR(50) NOT NULL DEFAULT '3000',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_tmpl_category ON public.invoice_templates(category);

-- 4. TABELLE: public.invoice_layouts (Textbausteine je Rechnungstyp)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_layouts (
    type VARCHAR(50) PRIMARY KEY,                       -- 'jahresbeitrag', 'vermietung', 'schulsport', 'sponsoring', 'materialverkauf', 'sonstige'
    title VARCHAR(255) NOT NULL,
    intro TEXT,
    outro TEXT,
    notice TEXT,
    mail_subject VARCHAR(255),
    mail_body TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABELLE: public.external_contacts (Externe Kunden & Sponsoren)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_contacts (
    id VARCHAR(50) PRIMARY KEY,                         -- z.B. 'EXT-1001' oder UUID
    typ VARCHAR(50) NOT NULL DEFAULT 'privat',          -- 'privat', 'firma'
    kategorie VARCHAR(100),                             -- 'Mieter', 'Sponsor', 'Gemeinde', 'Lieferant', 'Schulsport'
    firma VARCHAR(255),
    abteilung VARCHAR(255),
    anrede VARCHAR(50),
    vorname VARCHAR(100),
    nachname VARCHAR(100),
    strasse VARCHAR(255),
    adresszusatz VARCHAR(255),
    plz VARCHAR(20),
    ort VARCHAR(100),
    land VARCHAR(100) DEFAULT 'Schweiz',
    email VARCHAR(255),
    telefon VARCHAR(100),
    bemerkungen TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ext_contacts_kategorie ON public.external_contacts(kategorie);
CREATE INDEX IF NOT EXISTS idx_ext_contacts_name ON public.external_contacts(nachname, firma);

-- 6. INITIALE STANDARD-LAYOUTS (FALLS LEER)
-- ------------------------------------------------------------------------------
INSERT INTO public.invoice_layouts (type, title, intro, outro, notice, mail_subject, mail_body)
VALUES
    ('jahresbeitrag', 'Jahresbeitrag', 'Gerne stellen wir dir den Jahresbeitrag für das laufende Vereinsjahr in Rechnung.', 'Wir danken dir herzlich für deine Treue und Unterstützung.', 'Zahlbar innert 30 Tagen.', 'Rechnung Jahresbeitrag {JAHR} - Sportschützen Muhen', 'Hallo {VORNAME}\n\nAnbei erhältst du deine Rechnung für den Jahresbeitrag {JAHR}.\n\nMit sportlichen Grüssen\nSportschützen Muhen'),
    ('vermietung', 'Miete Schützenhaus', 'Für die Benützung unseres Schützenhauses stellen wir dir folgende Positionen in Rechnung.', 'Wir hoffen, du hattest einen gelungenen Anlass bei uns.', 'Zahlbar innert 30 Tagen.', 'Rechnung Vermietung Schützenhaus {RECHNUNG_NR}', 'Guten Tag {VORNAME} {NACHNAME}\n\nAnbei findest du die Abrechnung für deine Miete des Schützenhauses.\n\nFreundliche Grüsse\nSportschützen Muhen'),
    ('schulsport', 'Schulsportkurs', 'Für die Teilnahme am freiwilligen Schulsportkurs stellen wir folgende Kursgebühr in Rechnung.', 'Wir wünschen viel Freude am Schiesssport!', 'Zahlbar innert 30 Tagen.', 'Rechnung Schulsportkurs {JAHR} - Sportschützen Muhen', 'Hallo {VORNAME}\n\nAnbei erhältst du die Rechnung für den Schulsportkurs.\n\nSportliche Grüsse\nSportschützen Muhen'),
    ('sponsoring', 'Sponsoring & Inserate', 'Herzlichen Dank für dein wertvolles Engagement zu Gunsten unseres Vereins!', 'Dein Beitrag leistet eine wichtige Unterstützung für unseren Nachwuchs.', 'Zahlbar innert 30 Tagen.', 'Rechnung Sponsoring - Sportschützen Muhen', 'Sehr geehrte Damen und Herren\n\nHerzlichen Dank für Ihre Unterstützung. Anbei senden wir Ihnen die Rechnung.\n\nFreundliche Grüsse\nSportschützen Muhen'),
    ('materialverkauf', 'Material- & Munitionsbezug', 'Für bezogenes Material oder Munition stellen wir dir folgenden Betrag in Rechnung.', 'Besten Dank für deinen Einkauf.', 'Zahlbar innert 30 Tagen.', 'Rechnung Materialverkauf {RECHNUNG_NR}', 'Hallo {VORNAME}\n\nAnbei findest du die Rechnung für deinen Materialbezug.\n\nSportliche Grüsse\nSportschützen Muhen'),
    ('sonstige', 'Rechnung', 'Für unsere erbrachten Leistungen stellen wir Ihnen folgenden Betrag in Rechnung.', 'Vielen Dank für das Vertrauen.', 'Zahlbar innert 30 Tagen.', 'Rechnung {RECHNUNG_NR} - Sportschützen Muhen', 'Guten Tag {VORNAME} {NACHNAME}\n\nAnbei erhalten Sie die Rechnung {RECHNUNG_NR}.\n\nFreundliche Grüsse\nSportschützen Muhen'),
    ('freier_brief', 'Mitteilung', 'Sehr geehrte Damen und Herren, geschätzte Mitglieder,\n\nanbei lassen wir Ihnen folgende Mitteilung zukommen.', 'Bei allfälligen Fragen stehen wir Ihnen gerne zur Verfügung.\n\nFreundliche Grüsse\nSportschützen Muhen', '', 'Mitteilung Sportschützen Muhen', 'Guten Tag {VORNAME} {NACHNAME}\n\nanbei senden wir Ihnen unser offizielles Schreiben der Sportschützen Muhen.\n\nFreundliche Grüsse\nSportschützen Muhen')
ON CONFLICT (type) DO NOTHING;

-- 7. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_contacts ENABLE ROW LEVEL SECURITY;

-- RBAC Authenticated Policies (Rollen: admin, vorstand, kassier)
DROP POLICY IF EXISTS invoices_select_auth ON public.invoices;
CREATE POLICY invoices_select_auth ON public.invoices
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS invoices_manage_auth ON public.invoices;
CREATE POLICY invoices_manage_auth ON public.invoices
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_positions_auth ON public.invoice_positions;
CREATE POLICY invoice_positions_auth ON public.invoice_positions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_templates_auth ON public.invoice_templates;
CREATE POLICY invoice_templates_auth ON public.invoice_templates
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_layouts_auth ON public.invoice_layouts;
CREATE POLICY invoice_layouts_auth ON public.invoice_layouts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS external_contacts_auth ON public.external_contacts;
CREATE POLICY external_contacts_auth ON public.external_contacts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Entwicklungs- / Parallelbetrieb-Policies für Dev-Anon
DROP POLICY IF EXISTS invoices_dev_anon ON public.invoices;
CREATE POLICY invoices_dev_anon ON public.invoices
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_positions_dev_anon ON public.invoice_positions;
CREATE POLICY invoice_positions_dev_anon ON public.invoice_positions
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_templates_dev_anon ON public.invoice_templates;
CREATE POLICY invoice_templates_dev_anon ON public.invoice_templates
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_layouts_dev_anon ON public.invoice_layouts;
CREATE POLICY invoice_layouts_dev_anon ON public.invoice_layouts
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS external_contacts_dev_anon ON public.external_contacts;
CREATE POLICY external_contacts_dev_anon ON public.external_contacts
    FOR ALL TO anon USING (true) WITH CHECK (true);
