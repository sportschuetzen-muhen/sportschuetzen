-- Migration 106: Korrektur der Kontenklassen für Ertragskonten (8121, 8122, 8123) & Journal-Buchung 878
-- Autor: Antigravity
-- Datum: 2026-10-31

-- 1. Konten 8121 (Kleiderverkauf), 8122 (Reinigungstücher Ertrag) und 8123 (Parkplatz Umbau) auf 'Ertrag' setzen
UPDATE public.accounting_accounts
SET klasse = 'Ertrag',
    updated_at = now()
WHERE konto IN ('8121', '8122', '8123');

-- 2. Bestehende Buchungen im Journal auf diesen Konten auf buchungstyp 'ERTRAG' synchronisieren
UPDATE public.accounting_journal
SET buchungstyp = 'ERTRAG',
    updated_at = now()
WHERE (konto_soll IN ('8121', '8122', '8123') OR konto_haben IN ('8121', '8122', '8123'))
  AND buchungstyp != 'ERTRAG';
