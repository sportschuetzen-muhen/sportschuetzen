# Go-Live-Checkliste: GitHub Pages & Branch-Strategie

Dieses Dokument fasst den Stand, die Sicherheitsprüfung und den Ablauf für die Veröffentlichung von Website, PWA, Kasse und Vorstandsportal über GitHub Pages (`sportschuetzen-muhen/sportschuetzen`) zusammen.

---

## 1. Branch- & Entwicklungsstrategie

* **Repository:** `https://github.com/sportschuetzen-muhen/sportschuetzen` (aktuell **Public**)
* **`main` (Produktion / Live):** Wird über GitHub Pages ausgeliefert.
* **`migration-supabase` (Entwicklung):** Hier wird weiterentwickelt und getestet, ohne dass die Live-Version auf `main` beeinflusst wird. Sobald ein Stand stabil ist, wird er per Merge/Pull Request auf `main` übernommen.
* **Nach Abschluss der Migration:** Kleine laufende Verbesserungen können direkt auf `main` gepusht werden (GitHub Pages aktualisiert in ca. 1–2 Minuten) oder weiterhin über einen Entwicklungs-Branch geprüft werden.

### Besonderheit: Gemeinsames Supabase-Backend (CT 117)
Da `main` und `migration-supabase` aktuell auf dieselbe Supabase-Instanz (`https://supabase-muhen.danfamily.uk`) zugreifen:
* Reine UI-, Layout- und Bugfix-Änderungen auf `migration-supabase` stören `main` nicht.
* **Breaking Changes** an Datenbank-Tabellen/-Spalten oder Edge Functions auf CT 117 wirken sich jedoch sofort auf beide Branches aus und sollten bei Bedarf zeitnah nach `main` gemerged werden.

---

## 2. Sicherheits- & Datenschutz-Check (Stand der Prüfung)

### Bereits sauber gelöst
* Über `.gitignore` sind sensible Ordner und Exporte bereits vom Git-Tracking ausgeschlossen (`SSV Daten/`, `CAMT/`, `Ranglisten/`, `/Jahresmeisterschaft/`, `Goolge Kalender API Zugriff/`, `GAS/`, `WORKER/`, `scratch/`, `downloads_drive_test/`, `.env*`, `*.pem`, `*.key`, `*.xlsx`, `*.csv`).
* Alle JWT-Tokens im Frontend-Code sind ausschliesslich der öffentliche `SUPABASE_ANON_KEY` (kein `service_role`-Key im Repository).
* **Sensible Daten-Seeds & Test-Migrationen aus Git entfernt (`git rm --cached` + `.gitignore`):**
  * `supabase/migrations/118_enrich_members_from_access.sql` & `119_apply_gv_minutes_member_history.sql`
  * `supabase/migrations/47_setup_test_personas_and_fix_auth.sql` & `26_admin_save_password_and_fix_dan.sql`
  * `supabase/migrations/52_fix_jm_shooters_data.sql` & `78_seed_endschiessen_2026_data.sql`
  * `kasse/test-twint.html`
* **Passwort-Rotation auf CT 117 abgeschlossen:** Alle Vorstands- und Admin-Konten in `auth.users`, die noch das historische Test-Passwort aus Migration 26/47 nutzten, wurden auf CT 117 rotiert.
* **Datenbank- & Auth-Härtung (Migrationen 140–142 auf CT 117 aktiv):**
  * 100 % RLS auf allen Tabellen im `public`-Schema, spaltengenaue `anon`-Grants, privatisierte Storage-Buckets.
  * `BEFORE INSERT`-Trigger `enforce_known_member_or_admin_signup` auf `auth.users` blockiert Fremd-Registrierungen (`/auth/v1/signup` & `/auth/v1/otp`).
  * Vertikale Privilege-Escalation-Pfade über `admin_profiles`, `update_my_profile`, `handle_auth_user_sync` und `sync_member_auth_session` geschlossen.
  * `custom_access_token_hook` für `anon` und `authenticated` gesperrt.
* **GitHub Pages Workflow (`.github/workflows/pages.yml`) angelegt:** Veröffentlicht ausschliesslich die Web-Dateien ohne Backend-/Migrations-/Doku-Ordner.

---

## 3. GitHub Pages gezielt ausliefern (GitHub Actions)

Wenn GitHub Pages direkt aus dem Branch-Root ausliefert, ist **jede** Datei im Repository über eine URL abrufbar (auch `supabase/`, `docs/`, `scripts/`, `tools/`, `AGENTS.md`, `server.js`).

**Empfohlene Lösung:**
Einen Workflow `.github/workflows/pages.yml` anlegen, der bei jedem Push auf `main` **ausschliesslich** die Web-Dateien in das Deployment-Artefakt kopiert:
* `index.html`, `app.js`, `style.css`, `manifest.json`
* `OneSignalSDKWorker.js`, `OneSignalSDKUpdaterWorker.js`
* `apple-touch-icon.png`, `apple-touch-icon-precomposed.png`, `sportschuetzen-muhen-intro.webm`
* `icons/`, `app/`, `sportschuetzen-website/`, `vorstand/`, `kasse/` (ohne `test-twint.html`)

Nicht veröffentlicht werden dadurch: `supabase/`, `docs/`, `scripts/`, `tools/`, `AGENTS.md`, `server.js`.

*(Hinweis: In den GitHub-Repository-Einstellungen unter **Settings → Pages** muss die Quelle dafür von „Deploy from a branch“ auf **„GitHub Actions“** umgestellt werden.)*

---

## 4. Ablauf für den Go-Live & Rollback

### Go-Live-Schritte (sobald du bereit bist)
1. **Backup von altem `main` anlegen:** Auf dem aktuellen Stand von `main` (Commit `a66ee88`) einen Backup-Tag/Branch anlegen (z. B. `backup-main-gas`).
2. **Sensible Migrationen bereinigen & Passwort rotieren:** Siehe Abschnitt 2.
3. **`.github/workflows/pages.yml` hinzufügen.**
4. **`main` auf den bereinigten Stand aktualisieren und nach `origin/main` pushen.**
5. **In GitHub (Settings → Pages):** Source auf **„GitHub Actions“** stellen.
6. **Live-Test:** Website, PWA, Vorstandsportal (Login + RLS) und Kasse unter der GitHub-Pages-URL prüfen.

### Rollback (jederzeit in Sekunden möglich)
* **Zurück auf den alten GAS-Stand:** `main` per `git reset --hard backup-main-gas` und `git push --force origin main` zurücksetzen und in GitHub Settings → Pages wieder auf *„Deploy from a branch“* umstellen.
* **Workflow deaktivieren:** `.github/workflows/pages.yml` löschen oder deaktivieren.

