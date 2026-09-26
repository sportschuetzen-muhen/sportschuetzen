/**
 * logins.js
 * Einstiegspunkt und Abwärtskompatibilitäts-Bridge für das Modul LOGINS & BENUTZERVERWALTUNG.
 *
 * Delegiert an die modularisierten Komponenten:
 * - vorstand/js/logins/logins-core.js (Supabase Client, Profile, PINs, Sessions)
 * - vorstand/js/logins/logins-ui.js (Benutzerliste, Rollen, Filter)
 * - vorstand/js/logins/logins-events.js (Dialoge, Event-Handler)
 * - vorstand/js/logins/logins-actions.js (Passwort-Reset, Session-Kill, Sperren)
 */

console.log('🔐 Modul Logins & Zugänge aktiv mit nativer Supabase-Anbindung.');
