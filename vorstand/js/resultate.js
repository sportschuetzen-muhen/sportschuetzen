/**
 * resultate.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul RESULTATE (Grenzland).
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/resultate/resultate-core.js (Supabase Client, State, Mappings)
 * - vorstand/js/resultate/resultate-ui.js (Card UI je Runde/Team, Shell, Status)
 * - vorstand/js/resultate/resultate-events.js (Input-Handlers, Vererbung, KI-OCR Modal)
 * - vorstand/js/resultate/resultate-actions.js (Supabase Upsert, GAS Dual-Write, Setup-Sync)
 */

console.log('🏁 Modul Resultate (Grenzland & Team-Wettkämpfe) aktiv mit nativer Supabase-Anbindung.');
