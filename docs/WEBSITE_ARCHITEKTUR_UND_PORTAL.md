# Fachdokumentation: Vereins-Website, Medien & Geschützter Mitgliederbereich

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026 (Migration 51)  
> **Komponenten:** `sportschuetzen-website/frontend/` (`index.html`, `verein.html`, `intern.html`, `schuetzenhaus_vermietung.html`, `resultate.html`), `js/` (`components.js`, `auth-session.js`, `galerie.js`, `main.js`), Cloudflare Worker `sportschuetzen-website-worker.js`, Immich-Sync  
> **Backend & Single Source of Truth:** Supabase PostgreSQL (`public.members`, `public.documents`, `auth.users`), Supabase Storage (`operatives-storage`, `club-documents`), Immich Media Server (`immich-muhen.danfamily.uk`)  
> **Relevanz für KI:** Verbindliche Referenz für die Frontend-Architektur der Website, die nahtlose Universal-SSO-Anbindung, die Medientrennung (öffentlich vs. geschützt), das dynamische PDF-Dokumentenarchiv und die Responsive-Standards für Mobilgeräte und iPads.

---

## 1. Übersicht & Systemgrenzen der Drei Frontends

Das Web-Ökosystem der Sportschützen Muhen gliedert sich in drei spezialisierte, aber eng verzahnte Frontends:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               DAS WEBSYSTEM DER SPORTSCHÜTZEN MUHEN                              │
├───────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ 1. Öffentliche Vereins-Website│ 2. Mitglieder-App (PWA)        │ 3. Vorstands- & Adminportal    │
│    (/sportschuetzen-website/) │    (Root: /index.html)         │    (/vorstand/index.html)      │
├───────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ • Zielgruppe: Öffentlichkeit, │ • Zielgruppe: Vereinsmitglieder│ • Zielgruppe: Vorstand & Admins│
│   Sponsoren, Mieter, Schützen │ • Schiessbetrieb, Standblatt-  │ • Rechnungen, Buchhaltung, GV, │
│ • Schützenhaus-Vermietung     │   Upload, RSVPs, Termine       │   Mitgliederverwaltung, RBAC   │
│ • Öffentliche Galerie & News  │ • Offline-fähig (ServiceWorker)│ • 20 Fachmodule mit RBAC-Matrix│
│ • 🔐 Geschützter Mitglieder-  │ • Authentifizierung: Universal-│ • Authentifizierung: Supabase  │
│   bereich (intern.html)       │   SSO (Magic Link/PIN/OTP)     │   Auth (GoTrue) + 2FA / Audit  │
└───────────────────────────────┴────────────────────────────────┴────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                      ZENTRALE BACKEND-SERVICES (Single Source of Truth)                         │
├───────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ • Supabase PostgreSQL (DB)    │ • Supabase Storage             │ • Immich Foto-Server           │
│   Members, Documents, RLS     │   PDFs, Vorlagen, Belege       │   Hochauflösende Vereinsfotos  │
└───────────────────────────────┴────────────────────────────────┴────────────────────────────────┘
```

---

## 2. Umgesetzte Architektur-Komponenten (Oktober 2026)

### 2.1 Harmonisierte Navigation & Status-Bereinigung (`components.js` & `style.css`)
* **Problem gelöst:** Die verwirrende Doppelung aus `🔐 Mitglieder` (starrer Link) und `🔐 Login` (Button) wurde vollständig beseitigt.
* **Status 1: Nicht angemeldet (Gast / Öffentlich):**
  * Kein redundanter `🔐 Mitglieder`-Link im Hauptmenü.
  * Am rechten Rand der Navigation sitzt ausschliesslich der klare Button **`🔐 Login`** (`.nav-login-btn`).
  * Klick darauf führt direkt zum zentralen Universal-SSO mit automatischem Rücksprung zu `intern.html`.
* **Status 2: Angemeldet (Vereinsmitglied):**
  * In der Menüleiste erscheint der geschützte Punkt **`🔐 Intern`** (`#nav-intern-link` verweist auf `intern.html`).
  * Das Profil-Element (`.nav-user-chip`) zeigt den Vornamen und die Rolle (`👤 Daniel [Mitglied] ▾`).
  * Ein Klick öffnet ein barrierefreies Dropdown-Menü:
    1. 📂 **Mitgliederbereich** (`intern.html`)
    2. 🎯 **Schützen-App (PWA)**
    3. 👑 **Vorstandsportal** *(nur für Benutzer mit Rolle `vorstand` oder `admin`)*
    4. 🚪 **Abmelden**
* **iPad- & Mobile-Optimierung:**
  * Das Desktop-Grid (`.desktop-nav`) schrumpft zwischen `1024px` und `1250px` dynamisch auf `gap: 0.85rem` und `font-size: 0.92rem`. Dadurch passt die Menüleiste auf allen iPad-Modellen im Querformat ohne störenden Zeilenumbruch.

---

### 2.2 Entkoppeltes Universal-SSO & Supabase GoTrue Auth (`auth-session.js`)
* **Native Supabase-Anbindung:** Auf allen HTML-Seiten (`index.html`, `verein.html`, `schuetzenhaus_vermietung.html`, `resultate.html`) ist `@supabase/supabase-js@2` eingebunden.
* **Intelligente Sitzungs-Erkennung:**
  1. `_initSupabase()`: Bindet an `https://supabase-muhen.danfamily.uk` und registriert `supabase.auth.onAuthStateChange()`.
  2. `_checkSupabaseSession()`: Erkennt bestehende GoTrue-Sitzungen (Magic Link, OTP-Code oder Vorstand-Login) automatisch.
  3. `_syncFromSupabaseUser()`: Ruft die RPC `sync_member_auth_session` auf und synchronisiert Profil, Rollen (`member`, `vorstand`, `admin`) und Vorstandsstatus (`is_board`).
  4. Tab-übergreifende Synchronisation via `storage`-Event über die Keys `sm_member_session` und `sportschuetzen_user`.
  5. 60-Tage Sitzungsvalidität gemäss Vorgabe aus [LOGINS_UND_BENUTZERVERWALTUNG.md](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/LOGINS_UND_BENUTZERVERWALTUNG.md).
* **Dynamisches Host-Routing (`getLoginUrl`):**
  * `localhost` / `127.0.0.1`: Löst relative Pfade (`../../index.html`) auf – sofortige Testbarkeit ohne Internet-Fallback.
  * `*.pages.dev`: Verweist dynamisch auf `origin + '/index.html'`.
  * `sportschuetzen-muhen.ch`: Verweist auf `https://sportschuetzen-muhen.ch/app/`.
  * `github.io`: Verweist auf `https://sportschuetzen-muhen.github.io/sportschuetzen/`.

---

### 2.3 Medientrennung: Öffentliche vs. Geschützte Fotos (`galerie.js` & `galerie.json`)
* **Klassifizierung mit `visibility`:**
  * Jedes Foto in `data/galerie.json` besitzt das Attribut `"visibility": "public"` oder `"visibility": "members"`.
  * `public` (69 Medien): Historischer Bau des Schützenhauses Rüteli 1996/1997, Empfang Eidgenössisches Schützenfest, Schützenhaus & Schützenstube.
  * `members` (22 Medien): Jugendtag AGSV, interne Vereinsfeiern, Absenden, Aufnahmen mit Namens- und Gesichtserkennung.
* **Galerie-Steuerung in `galerie.js`:**
  * `getVisibleGalleryData()`: Prüft `window.AuthSession.isLoggedIn()`. Nicht angemeldete Besucher erhalten ausschliesslich `visibility === 'public'`.
  * Album-Filter (`generateAlbumFilters`): Für Gäste wird die Gesamtzahl auf öffentliche Alben beschränkt und ein dezenter Hinweis eingeblendet:  
    *«🔒 22 weitere Vereinsfotos & Alben im geschützten Mitgliederbereich verfügbar.»*
  * Tag-Cloud (`generateTagCloud`): Zeigt Personennamen und interne Schlagworte erst nach Anmeldung.
  * Echtzeit-Freischaltung: Ein Login über `window.AuthSession.onChange()` schaltet die geschützten Alben sofort frei, ohne dass die Seite neu geladen werden muss.
* **Touch-Swipe Lightbox:**
  * In `DOMContentLoaded` wurden Wischgesten (`touchstart`, `touchend`) integriert.
  * Horizontale Wischbewegungen (> 50px) blättern auf iPads und Mobilgeräten flüssig zum nächsten bzw. vorherigen Bild.

---

### 2.4 Zentrales Dokumenten- & PDF-Archiv (Migration 50 & 51)
* **Single Source of Truth:** Tabelle `public.documents` in PostgreSQL und Storage-Buckets `operatives-storage` / `club-documents`.
* **Datenmodell (`public.documents`):**

```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'gv', 'einladungen', 'chronik'
    visibility VARCHAR(20) NOT NULL DEFAULT 'members', -- 'public', 'members', 'vorstand'
    file_url TEXT NOT NULL,
    file_size_kb INTEGER DEFAULT 0,
    file_type VARCHAR(20) DEFAULT 'pdf',
    year INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

* **Row-Level Security (RLS):**
  * `public`: Für jedermann sichtbar (z.B. Schützenhausordnung, Merkblatt Mieter).
  * `members`: Für angemeldete Vereinsmitglieder sichtbar (Archivdokumente, Einladungen, Chroniken).
  * `vorstand`: Vertraulich; nur über RBAC-Rechte `dokumente.view` / `dokumente.manage` oder Vorstandsrolle abrufbar (Vorstandsprotokolle, Buchhaltungsberichte).
* **Entkoppelter geschützter Bereich (`intern.html`):**
  * Der Mitgliederbereich ist vollständig von `verein.html` in eine eigene Seite `intern.html` ausgelagert. Dadurch wird verhindert, dass beim Hoch- oder Runterscrollen versehentlich in allgemeine öffentliche Inhalte (Geschichte, Galerie, Nachwuchs) gescrollt wird.
  * **Standard-Tab:** Beim Betreten des Bereichs ist **`📄 Vereinsdokumente & Archiv` sofort als primärer Tab geöffnet** (Fotos folgen als zweiter Tab; die redundante Termine-Doppelung wurde entfernt).
  * Live-Abfrage via Supabase REST API (`/rest/v1/documents?order=year.desc,sort_order.asc,title.asc`).
  * Live-Suche (`#doc-search-input`) nach Titel, Beschreibung und Jahreszahl (z.B. Suche nach `1923` oder `1996`).
  * **Kompakte 3-Ordner-Struktur (Migration 51):**
    1. 🗳️ **Generalversammlung** (`category = 'gv'`, 245 Dokumente: Protokolle & Jahresberichte ab Gründungsjahr 1919)
    2. ✉️ **Einladungen** (`category = 'einladungen'`, 34 Dokumente: GV-Einladungen & Traktanden)
    3. 📖 **Chronik** (`category = 'chronik'`, 2 Dokumente: Historische Vereinschroniken 1990 & 1997)
    * Alle unvollständigen Dummy-Einträge ohne Archivbezug ("leere Hüllen") wurden bereinigt.
  * Responsive Karten mit Typ-Badge (`PDF`, `DOCX`, `MSG`), Dateigrösse, Jahr (`📅 1923`) und direktem Öffnen-Button (`target="_blank" rel="noopener"`).
  * Dynamischer Dokumentenzähler (`#doc-count-badge`) zur transparenten Anzeige der gefilterten Trefferanzahl.
* **Historisches Vereinsarchiv & Google-Drive-Entkopplung:**
  * Spiegelung von 281 historischen Originaldokumenten aus den Vorstands-Google-Drive-Ordnern in den Supabase Storage Bucket `club-documents/archiv/`.
  * Volle Datensouveränität auf CT 117 ohne Abhängigkeit von Google-Authentifizierung oder Drittanbieter-Laufzeiten.

---

### 2.5 Nativer Website-Kontaktdienst & Dynamische System-Mails (Migration 53)
* **Entkopplung von externen Drittanbietern:** Das bisherige Formular (Web3Forms) wurde vollständig durch die native Supabase Mail-Engine und PostgreSQL abgelöst.
* **Single Source of Truth:**
  1. Jede Anfrage wird direkt per REST in `public.website_contact_messages` persistiert (`status = 'neu'`).
  2. Der E-Mail-Versand erfolgt über die Supabase Edge Function `send-email`.
* **Dynamische Empfänger-Auflösung via System-Mail:**
  * Das Formular übergibt `systemMailKey: 'Info_Mail_Kontakt_Website'`.
  * Die Empfänger werden serverseitig dynamisch über `public.system_mail_configs` und die RPC `get_system_mail_array` aufgelöst.
  * Der Vorstand kann die Empfängerliste im Vorstandsportal unter **✉️ System-Mails** in der Kategorie **🌐 Website & Kontakt** jederzeit anpassen, ohne dass Code geändert werden muss.
* **Komfortable Antwortfunktion:**
  * Die Edge Function setzt den Header `Reply-To` auf die E-Mail-Adresse des Anfragenden. Vorstandsmitglieder können im Mailprogramm direkt auf «Antworten» klicken.

---

## 3. Responsive Kompatibilität & Geräte-Standards

| Gerät / Browser | Getroffene Massnahme | Ergebnis |
| :--- | :--- | :--- |
| **iPad Landscape (1024px–1180px)** | Dynamische Reduktion des Abstands `.desktop-nav` von `2rem` auf `0.85rem`–`1.25rem`. | Kein Header-Umbruch; Logo und Navigation bleiben einzeilig. |
| **Smartphones & iPad Portrait (<=1024px)** | Hamburger-Menü (`.mobile-toggle`) mit `100dvh` und `env(safe-area-inset-top)` / `bottom`. | Keine Überdeckung durch Notch oder Safari-Leisten; 44×44px Touch-Targets. |
| **Touch-Bedienung in der Lightbox** | Wischgesten-Listener (`touchstart` / `touchend`) mit Schwelle von 50px. | Intuitives horizontales Wischen auf Touchscreens für Bildwechsel. |
| **PDF-Betrachtung auf iOS Safari** | Öffnen aller Dokumente im neuen Tab (`target="_blank"`). | Nativer iOS PDF-Reader statt fehlerhafter iFrame-Skalierung. |

---

## 4. Richtlinien für zukünftige Website-Erweiterungen

1. **Neue Dokumente erfassen:**  
   Immer über `public.documents` via Supabase Studio, RPC oder Vorstandsportal einfügen. Niemals statische HTML-Textzeilen ohne Link hinterlegen.
2. **Neue Fotos & Alben (Immich-Sync):**  
   Im Immich-Manager dem Album den Status-Tag zuweisen. Das Sync-Skript `sync-immich-album.js` übernimmt `visibility: 'public'` für historische Aufnahmen und Hausbilder, ansonsten automatisch `visibility: 'members'`.
3. **Keine Drittanbieter-Formulare:**  
   Kontakt- und Buchungsformulare kommunizieren ausschliesslich über Supabase REST und die Edge Function `send-email` mit Empfänger-Steuerung via `system_mail_configs`.
4. **Keine Google-Sheets-Fallbacks:**  
   Die Website fragt Daten direkt via Supabase REST (`/rest/v1/...`) oder den Cloudflare Worker ab.
