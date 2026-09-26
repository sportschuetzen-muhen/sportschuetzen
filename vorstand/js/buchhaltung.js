/**
 * buchhaltung.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul FINANZBUCHHALTUNG.
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/buchhaltung/buchhaltung-core.js (Supabase Client, Kontenrahmen, Journal)
 * - vorstand/js/buchhaltung/buchhaltung-ui.js (Berichte, Bilanz, Erfolgsrechnung)
 * - vorstand/js/buchhaltung/buchhaltung-modals.js (Buchungsdialoge, Konten-Editor)
 * - vorstand/js/buchhaltung/buchhaltung-bank.js (camt.053 Bankimport & Buchungsregeln)
 * - vorstand/js/buchhaltung-controlling.js (Controlling, KPI & Auswertungen)
 */

console.log('📊 Modul Buchhaltung & Finanzberichte aktiv mit nativer Supabase-Anbindung.');
