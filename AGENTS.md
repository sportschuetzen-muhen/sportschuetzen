# Projekt-Richtlinien: Migration auf Supabase (Sportschützen Muhen)

## 1. Striktes Verbot von stillen GAS-Fallbacks (Entkopplung)
- **Keine stillen Fallbacks auf Google Apps Script (GAS) oder Google Sheets** in den migrierten Modulen.
- Tritt bei einer Supabase-Abfrage oder einem Supabase-Schreibvorgang ein Fehler auf, darf der Code **nicht** stillschweigend auf Google Apps Script / Google Sheets zurückfallen. Stattdessen ist ein klarer UI-Fehler anzuzeigen.
- **Einzige Ausnahmen:**
  1. **Modul Vermietung:** Bleibt vorerst im Hybrid-Betrieb mit Google Calendar, GAS-Mietvertragserstellung und Buchungs-Synchronisation.
  2. **Portal-Login:** Verbleibt vorübergehend im bestehenden Auth-Verfahren (Worker/Login-Check), bis die Migration auf Supabase Auth ansteht.

## 2. Single Source of Truth
- **Supabase PostgreSQL** ist die verbindliche Single Source of Truth für alle migrierten Fachbereiche (Mitglieder, Termine, Inventar, Rechnungen, Jahresbeitrag, Finanzbuchhaltung, Resultate, Umfragen/Eventplaner, Generalversammlung, Team Manager, System-Mails).
- Jede durch das System ausgelöste Transaktion (z.B. Rechnungsstellung im Inventar) muss unmittelbar in die entsprechenden Supabase-Tabellen (`invoices`, `invoice_positions`, `mail_logs` etc.) geschrieben werden.
