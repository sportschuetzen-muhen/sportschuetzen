/**
 * manager.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul TEAM MANAGER.
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/manager/manager-core.js (Supabase Client, Team-Konfiguration)
 * - vorstand/js/manager/manager-ui.js (Pool, Team-Cards, Shell)
 * - vorstand/js/manager/manager-dnd.js (Drag & Drop Zuteilung)
 * - vorstand/js/manager/manager-mail.js (Mail-Assistent mit GMail-Versand)
 * - vorstand/js/manager/manager-pdf.js (Aufgebots-PDFs)
 */

console.log('📋 Modul Team Manager aktiv mit nativer Supabase-Anbindung.');
