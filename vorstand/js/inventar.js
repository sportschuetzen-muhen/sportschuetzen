/**
 * inventar.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul VEREINSINVENTAR.
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/inventar/inventar-core.js (Supabase Client, Bestände, Adressbuch)
 * - vorstand/js/inventar/inventar-ui.js (Katalog, Filter, Shell)
 * - vorstand/js/inventar/inventar-cart.js (Ausleih-Warenkorb & Signatur)
 * - vorstand/js/inventar/inventar-list.js (Item-Verwaltung, Edit, Löschen)
 * - vorstand/js/inventar/inventar-journal.js (Transaktions-Journal & Audit-Log)
 * - vorstand/js/inventar/inventar-pdf.js (Ausleihverträge & Quittungen)
 */

console.log('📦 Modul Vereinsinventar aktiv mit nativer Supabase-Anbindung.');
