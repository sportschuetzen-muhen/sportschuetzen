-- Migration 105: Automatische Ermittlung & Trigger für accounting_journal.buchungstyp
-- Autor: Antigravity
-- Datum: 2026-10-31

-- 1. Trigger-Funktion zur Bestimmung des Buchungstyps
CREATE OR REPLACE FUNCTION public.fn_accounting_journal_set_buchungstyp()
RETURNS TRIGGER AS $$
DECLARE
    v_soll_klasse VARCHAR;
    v_haben_klasse VARCHAR;
BEGIN
    -- Echte Transit-Konten: 1090 (Klärung), 1190 (Geldtransit), 13xx (Stiche/Sonderprojekte)
    IF (NEW.konto_soll LIKE '109%' OR NEW.konto_haben LIKE '109%'
        OR NEW.konto_soll LIKE '119%' OR NEW.konto_haben LIKE '119%'
        OR NEW.konto_soll LIKE '13%'  OR NEW.konto_haben LIKE '13%') THEN
        NEW.buchungstyp := 'TRANSIT';
        RETURN NEW;
    END IF;

    -- Falls ein spezifischer Buchungstyp (z. B. 'DEBITOR', 'KASSE', 'AUFWAND', 'ERTRAG')
    -- explizit übergeben wurde und NICHT fälschlicherweise 'TRANSIT' lautet: beibehalten!
    IF NEW.buchungstyp IS NOT NULL AND NEW.buchungstyp NOT IN ('', 'TRANSIT') THEN
        RETURN NEW;
    END IF;

    -- Kontenklasse ermitteln
    SELECT klasse INTO v_soll_klasse FROM public.accounting_accounts WHERE konto = NEW.konto_soll;
    SELECT klasse INTO v_haben_klasse FROM public.accounting_accounts WHERE konto = NEW.konto_haben;

    IF v_soll_klasse = 'Ertrag' OR v_haben_klasse = 'Ertrag' THEN
        NEW.buchungstyp := 'ERTRAG';
    ELSIF v_soll_klasse = 'Aufwand' OR v_haben_klasse = 'Aufwand' THEN
        NEW.buchungstyp := 'AUFWAND';
    ELSIF NEW.konto_soll LIKE '3%' OR NEW.konto_haben LIKE '3%' 
       OR NEW.konto_soll LIKE '81%' OR NEW.konto_haben LIKE '81%' 
       OR NEW.konto_soll LIKE '857%' OR NEW.konto_haben LIKE '857%' THEN
        NEW.buchungstyp := 'ERTRAG';
    ELSIF NEW.konto_soll LIKE '4%' OR NEW.konto_haben LIKE '4%' 
       OR NEW.konto_soll LIKE '5%' OR NEW.konto_haben LIKE '5%' 
       OR NEW.konto_soll LIKE '6%' OR NEW.konto_haben LIKE '6%' 
       OR NEW.konto_soll LIKE '7%' OR NEW.konto_haben LIKE '7%' 
       OR NEW.konto_soll LIKE '8%' OR NEW.konto_haben LIKE '8%' THEN
        NEW.buchungstyp := 'AUFWAND';
    ELSIF NEW.konto_soll LIKE '100%' OR NEW.konto_haben LIKE '100%' THEN
        NEW.buchungstyp := 'KASSE';
    ELSIF NEW.konto_soll LIKE '110%' OR NEW.konto_haben LIKE '110%' THEN
        NEW.buchungstyp := 'DEBITOR';
    ELSIF NEW.konto_soll LIKE '102%' OR NEW.konto_haben LIKE '102%' THEN
        NEW.buchungstyp := 'BANK';
    ELSE
        NEW.buchungstyp := 'TRANSIT';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger auf accounting_journal registrieren
DROP TRIGGER IF EXISTS trg_acc_journal_set_buchungstyp ON public.accounting_journal;
CREATE TRIGGER trg_acc_journal_set_buchungstyp
    BEFORE INSERT OR UPDATE OF konto_soll, konto_haben, buchungstyp
    ON public.accounting_journal
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_accounting_journal_set_buchungstyp();

-- 3. Bestehende Fehlklassifikationen in accounting_journal korrigieren
UPDATE public.accounting_journal j
SET buchungstyp = CASE
    WHEN (j.konto_soll LIKE '109%' OR j.konto_haben LIKE '109%'
          OR j.konto_soll LIKE '119%' OR j.konto_haben LIKE '119%'
          OR j.konto_soll LIKE '13%'  OR j.konto_haben LIKE '13%') THEN 'TRANSIT'
    WHEN (acc_s.klasse = 'Ertrag' OR acc_h.klasse = 'Ertrag'
          OR j.konto_soll LIKE '3%' OR j.konto_haben LIKE '3%' 
          OR j.konto_soll LIKE '81%' OR j.konto_haben LIKE '81%' 
          OR j.konto_soll LIKE '857%' OR j.konto_haben LIKE '857%') THEN 'ERTRAG'
    WHEN (acc_s.klasse = 'Aufwand' OR acc_h.klasse = 'Aufwand'
          OR j.konto_soll LIKE '4%' OR j.konto_haben LIKE '4%' 
          OR j.konto_soll LIKE '5%' OR j.konto_haben LIKE '5%' 
          OR j.konto_soll LIKE '6%' OR j.konto_haben LIKE '6%' 
          OR j.konto_soll LIKE '7%' OR j.konto_haben LIKE '7%' 
          OR j.konto_soll LIKE '8%' OR j.konto_haben LIKE '8%') THEN 'AUFWAND'
    WHEN (j.konto_soll LIKE '100%' OR j.konto_haben LIKE '100%') THEN 'KASSE'
    WHEN (j.konto_soll LIKE '110%' OR j.konto_haben LIKE '110%') THEN 'DEBITOR'
    WHEN (j.konto_soll LIKE '102%' OR j.konto_haben LIKE '102%') THEN 'BANK'
    ELSE 'TRANSIT'
END
FROM public.accounting_accounts acc_s, public.accounting_accounts acc_h
WHERE j.konto_soll = acc_s.konto
  AND j.konto_haben = acc_h.konto
  AND j.buchungstyp = 'TRANSIT'
  AND NOT (
      j.konto_soll LIKE '109%' OR j.konto_haben LIKE '109%'
      OR j.konto_soll LIKE '119%' OR j.konto_haben LIKE '119%'
      OR j.konto_soll LIKE '13%'  OR j.konto_haben LIKE '13%'
  );
