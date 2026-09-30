# Projekt-Richtlinien: Migration auf Supabase (Sportschützen Muhen)

## 1. Striktes Verbot von stillen GAS-Fallbacks (Entkopplung)
- **Keine stillen Fallbacks auf Google Apps Script (GAS) oder Google Sheets** in allen Fachmodulen inklusive Vermietung.
- Tritt bei einer Supabase-Abfrage oder einem Supabase-Schreibvorgang ein Fehler auf, darf der Code **nicht** stillschweigend auf Google Apps Script / Google Sheets zurückfallen. Stattdessen ist ein klarer UI-Fehler anzuzeigen.

## 2. Single Source of Truth
- **Supabase PostgreSQL** ist die verbindliche Single Source of Truth für alle migrierten Fachbereiche (Vermietung, Mitglieder, Termine, Inventar, Rechnungen, Jahresbeitrag, Finanzbuchhaltung, Resultate, Umfragen/Eventplaner, Generalversammlung, Team Manager, System-Mails, Logins & Authentifizierung).
- Jede durch das System ausgelöste Transaktion (z.B. Vermietungsbuchungen, Statusänderungen, Rechnungsstellung, Login-Session-Tracking) muss unmittelbar in die entsprechenden Supabase-Tabellen (`rental_requests`, `rental_status_logs`, `invoices`, `invoice_positions`, `mail_logs`, `login_sessions`, `admin_profiles` etc.) geschrieben werden.
## 3. Strikte Rückfragepflicht vor Code-Änderungen
- **Immer rückfragen vor Code-Änderungen:** Vor jeder Änderung an Code-Dateien ist dem Benutzer zuerst die Analyse und der genaue Änderungsplan vorzulegen und dessen ausdrückliche Freigabe einzuholen.
- Keine eigenmächtigen oder ungefragten Anpassungen an bestehenden Funktionen oder Architektur-Komponenten.

## 4. Stabilität des zentralen Rechnungsmoduls (`RechnungsCore`)
- Das Rechnungsmodul (`vorstand/js/rechnungen/`) und der `RechnungsCore` sind der verbindliche zentrale Standard für das gesamte Vereinsportal und bleiben in ihrer Architektur und Schnittstellendefinition (`InvoiceOrder`-Payload) unverändert wie spezifiziert.
- Fachmodule (Inventar, Vermietung, Jahresbeitrag etc.) müssen ihre Datenanlieferung strikt an die `InvoiceOrder`-Schnittstelle des `RechnungsCore` anpassen. Der `RechnungsCore` wird nicht durch modulspezifische Sonderlogiken verwässert.

## 5. Verbindliche Synchronisations- & Deployment-Pflicht (CT 117 & GitHub Push)
Nach **jeder** vorgenommenen Code- oder Schemaänderung müssen der lokale Entwicklungsstand (`scratch`), die Live-Supabase-Instanz auf Proxmox Container **CT 117** (`192.168.68.117`) und das GitHub-Repository (`migration-supabase`) unmittelbar synchronisiert werden.

### Standard-Ablauf nach Änderungen:

1. **Edge Functions übertragen & neustarten (bei Änderungen in `supabase/functions/`):**
   ```powershell
   # Datei(en) auf CT 117 kopieren:
   scp supabase/functions/generate-pdf/index.ts root@192.168.68.117:/opt/supabase/docker/volumes/functions/generate-pdf/index.ts
   
   # Deno Edge Functions Container neustarten:
   ssh root@192.168.68.117 "docker restart supabase-edge-functions"
   ```

2. **Datenbank-Migrationen einspielen (bei neuen/geänderten SQL-Dateien in `supabase/migrations/`):**
   ```powershell
   # Migration direkt per Pipe in den PostgreSQL-Container einspielen:
   Get-Content -Raw 'supabase/migrations/<dateiname>.sql' | ssh root@192.168.68.117 'docker exec -i supabase-db psql -U postgres -d postgres'
   ```

3. **Verifikation (Smoke- / E2E-Test):**
   - Bei Edge Functions: Test-Aufruf an `https://supabase-muhen.danfamily.uk/functions/v1/<funktion>` senden und `200 OK` prüfen.
   - Bei DB-Migrationen: Schema-Integrität (Tabellen, Spalten, RLS-Policies) per `psql`-Query verifizieren.

4. **GitHub Commit & Push (Single Source of Truth im Repository):**
   ```powershell
   git add <dateien>
   git commit -m "<typ>(<scope>): <prägnante beschreibung>"
   git push origin migration-supabase
   ```

