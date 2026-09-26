/**
 * mitglieder.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul MITGLIEDER.
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/mitglieder/mitglieder-core.js (Supabase Client, State, Caches)
 * - vorstand/js/mitglieder/mitglieder-ui.js (Tabelle, Suche, Filter, Shell)
 * - vorstand/js/mitglieder/mitglieder-list.js (Listendarstellung, Pagination)
 * - vorstand/js/mitglieder/mitglieder-details.js (Mitgliederprofil, Lizenzen, Historie)
 * - vorstand/js/mitglieder/mitglieder-manager.js (Mutationen, Speichern)
 * - vorstand/js/mitglieder/mitglieder-import-engine.js (Clientseitiger SSV-Excel-Import)
 * - vorstand/js/mitglieder/mitglieder-import-ui.js (Import-Assistent, Diff-Viewer)
 * - vorstand/js/mitglieder/mitglieder-sync-ui.js (System-Synchronisation)
 * - vorstand/js/mitglieder/mitglieder-export.js (CSV/Excel-Export)
 */

console.log('👥 Modul Mitglieder aktiv mit nativer Supabase-Anbindung.');
