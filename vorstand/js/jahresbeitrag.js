/**
 * jahresbeitrag.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul JAHRESBEITRAG.
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/jahresbeitrag/jahresbeitrag-core.js (Supabase Client, Beitragsberechnung)
 * - vorstand/js/jahresbeitrag/jahresbeitrag-calc.js (Gebühren-Engine, Positionen)
 * - vorstand/js/jahresbeitrag/jahresbeitrag-accounting.js (Finanzbuchhaltungs-Integration)
 * - vorstand/js/jahresbeitrag/jahresbeitrag-overview.js (Jahresübersicht, Status)
 * - vorstand/js/jahresbeitrag/jahresbeitrag-schnellerfassung.js (Schnellerfassung)
 * - vorstand/js/jahresbeitrag/jahresbeitrag-import.js (Excel-Import)
 * - vorstand/js/jahresbeitrag/jahresbeitrag-bank.js (Bankabgleich & Buchungen)
 * - vorstand/js/jahresbeitrag/jahresbeitrag-gebuehren.js (Gebührenordnung)
 */

console.log('💰 Modul Jahresbeitrag aktiv mit nativer Supabase-Anbindung.');
