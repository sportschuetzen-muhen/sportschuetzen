# Projekt-Richtlinien: Migration auf Supabase (Sportschützen Muhen)

## 1. Striktes Verbot von stillen GAS-Fallbacks (Entkopplung)
- **Keine stillen Fallbacks auf Google Apps Script (GAS) oder Google Sheets** in allen Fachmodulen inklusive Vermietung.
- Tritt bei einer Supabase-Abfrage oder einem Supabase-Schreibvorgang ein Fehler auf, darf der Code **nicht** stillschweigend auf Google Apps Script / Google Sheets zurückfallen. Stattdessen ist ein klarer UI-Fehler anzuzeigen.

## 2. Single Source of Truth
- **Supabase PostgreSQL** ist die verbindliche Single Source of Truth für alle migrierten Fachbereiche (Vermietung, Mitglieder, Termine, Inventar, Rechnungen, Jahresbeitrag, Finanzbuchhaltung, Resultate, Umfragen/Eventplaner, Generalversammlung, Team Manager, System-Mails, Logins & Authentifizierung).
- Jede durch das System ausgelöste Transaktion (z.B. Vermietungsbuchungen, Statusänderungen, Rechnungsstellung, Login-Session-Tracking) muss unmittelbar in die entsprechenden Supabase-Tabellen (`rental_requests`, `rental_status_logs`, `invoices`, `invoice_positions`, `mail_logs`, `login_sessions`, `admin_profiles` etc.) geschrieben werden.

