/**
 * rechnungen.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul RECHNUNGEN.
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/rechnungen/rechnungen-core.js (Supabase Client, Datenverwaltung)
 * - vorstand/js/rechnungen/rechnungen-ui.js (Rechnungsliste, Status, Filter)
 * - vorstand/js/rechnungen/rechnungen-templates.js (Rechnungsvorlagen)
 * - vorstand/js/rechnungen/rechnungen-layouts.js (Layouts & Briefpapier)
 * - vorstand/js/rechnungen/rechnungen-actions.js (QR-Rechnung, PDF, E-Mail-Versand)
 * - vorstand/js/pdf-engine.js (PDF-Generierung & QR-Rechnung)
 */

console.log('🧾 Modul Rechnungen & PDF-Cockpit aktiv mit nativer Supabase-Anbindung.');
