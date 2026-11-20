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
    1. 📂 **Mitgliederbereich & Archiv** (`intern.html`)
    2. 🎯 **Schützen-App (PWA)**
    3. 👑 **Vorstandsportal** *(nur für Benutzer mit Rolle `vorstand` oder `admin`)*
    4. 🚪 **Abmelden**
* **Tri-Direktionaler App-Switcher (Website ↔ Schützen-App ↔ Vorstandsportal):**
  * Nahtloser Wechsel zwischen allen 3 Frontends ohne manuelle URL-Eingabe.
  * In der **Schützen-App (PWA)** öffnet ein Klick auf das `#user-badge` (`👤 Vorname ▾`) ein Dropdown mit Absprüngen zu Website, Archiv (`intern.html`), Vorstandsportal (falls berechtigt) und Abmelden; auf `page-home` bieten zudem zwei Schnellwahltasten direkten Zugriff.
  * Im **Vorstandsportal** stehen sowohl in der Desktop-Sidebar direkt unter dem Header als auch im Mobile-Header zwei Schnellwahl-Buttons (`🎯 Schützen-App` und `🌐 Website`) zur Verfügung.
* **iPad- & Mobile-Optimierung:**
  * Das Desktop-Grid (`.desktop-nav`) schrumpft zwischen `1024px` und `1250px` dynamisch auf `gap: 0.85rem` und `font-size: 0.92rem`. Dadurch passt die Menüleiste auf allen iPad-Modellen im Querformat ohne störenden Zeilenumbruch.

---

### 2.2 Entkoppeltes Universal-SSO & Dynamischer URL-Resolver (`auth-session.js` & `getAppUrls`)
* **Native Supabase-Anbindung:** Auf allen HTML-Seiten (`index.html`, `verein.html`, `schuetzenhaus_vermietung.html`, `resultate.html`) ist `@supabase/supabase-js@2` eingebunden.
* **Intelligente Sitzungs-Erkennung:**
  1. `_initSupabase()`: Bindet an `https://supabase-muhen.danfamily.uk` und registriert `supabase.auth.onAuthStateChange()`.
  2. `_checkSupabaseSession()`: Erkennt bestehende GoTrue-Sitzungen (Magic Link, OTP-Code oder Vorstand-Login) automatisch.
  3. `_syncFromSupabaseUser()`: Ruft die RPC `sync_member_auth_session` auf und synchronisiert Profil, Rollen (`member`, `vorstand`, `admin`) und Vorstandsstatus (`is_board`).
  4. Tab-übergreifende Synchronisation via `storage`-Event über die Keys `sm_member_session` und `sportschuetzen_user`.
  5. 60-Tage Sitzungsvalidität gemäss Vorgabe aus [LOGINS_UND_BENUTZERVERWALTUNG.md](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/LOGINS_UND_BENUTZERVERWALTUNG.md).
* **Universeller Host- & Pfad-Resolver (`getAppUrls()`):**
  * Erkennt die Umgebung (`localhost`, `127.0.0.1`, `*.pages.dev`, `github.io`, `sportschuetzen-muhen.ch`) und löst unabhängig von der aktuellen Ordnertiefe stets die korrekten Ziel-URLs für Website, Archiv, PWA und Vorstandsportal auf. Keine statischen Domain-Verdrahtungen mehr.
  * Dynamisches Login-Routing (`getLoginUrl`): Leitet mit `redirect`-Parameter zur Web-App weiter und kehrt nach Authentifizierung zur Ausgangsseite zurück.

---

### 2.3 Medientrennung & Mitglieder-Upload: Öffentliche vs. Geschützte Fotos (`galerie.js`, `intern.html` & Immich)
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
* **Mitglieder-Upload ins Vereinsarchiv (Migration 55):**
  * Angemeldete Vereinsmitglieder können im geschützten Bereich (`intern.html` unter «📷 Vereinsfotos») Schnappschüsse und Fotos von Anlässen direkt per Drag & Drop oder Smartphone-Kamera einreichen.
  * Automatische Client-seitige Konvertierung von Apple HEIC/HEIF-Bildern (`heic2any`) zu kompaktem JPEG vor dem Transfer.
  * Authentifizierter Transfer über die Supabase Edge Function `immich-upload` (`https://supabase-muhen.danfamily.uk/functions/v1/immich-upload`) mit Weiterleitung über das lokale Gigabit-Netzwerk an den Immich-Server auf Proxmox CT 116 (`192.168.68.120:2283`).
  * Automatisches Ablegen im Sammelalbum `📥 Mitglieder-Uploads` (`6184f06d-be38-426b-8737-1bec29ab045e`) und serverseitige KI-Gesichtserkennung.
* **Entflechtung & Verschlankung im Vorstandsportal (`vorstand/js/galerie.js`):**
  * Die veraltete, 15 MB schwere clientseitige `face-api.js`-Bibliothek wurde vollständig entfernt.
  * Das Modul dient neu als übersichtliches Administrations- und Kuratierungs-Cockpit mit Live-Server-Status, Anzeige des Sammelalbums und Direkt-Absprung zur nativen Immich Web-App (`https://immich-muhen.danfamily.uk`).
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

### 2.6 Startseiten-Hub (3 Zielgruppen) & Termine-Filterung
* **3-Zielgruppen-Navigator (`#zielgruppen`):**
  * Direkter Einstieg unterhalb des Hero für:
    1. 🎯 **Schiesssport & Nachwuchs:** Schnuppertraining-Call-to-Action (mit automatischer Betreff-Vorwahl) & J+S-Informationen.
    2. 🏠 **Schützenstube mieten:** Belegungskalender & Konditionen.
    3. 👥 **Vereinsportal & Schützen:** Schnelleinstieg in PWA, Resultate und internes Archiv.
* **Datenschutzkonforme & entflochtene Terminedarstellung (`main.js`):**
  * Hausbelegungen werden öffentlich neutral als `🏠 Schützenhaus reserviert` ausgegeben (keine internen Namenskürzel).
  * Reine interne Reinigungsblockaden (`gesperrt für Reinigung`) werden aus dem Standard-Stream der Startseite gefiltert, damit echte Vereinsanlässe (Endschiessen, Generalversammlung) nicht verdrängt werden. Im Tab `🏠 Schützenhaus-Belegung` bleiben alle Buchungsfenster vollständig einsehbar.

---

### 2.7 Dynamischer Vorstand & Porträt-Fotos (Migration 54)
* **Single Source of Truth:** View `public.v_board_members_public` in Supabase PostgreSQL (aggregiert aus `public.members` und `public.member_functions` mit `official_function_exit_date IS NULL`).
* **Datenschutzkonforme Bereitstellung:** Die View exponiert ausschliesslich `first_name`, `last_name`, `role_title`, `avatar_url` und `sort_order` (keine privaten Kontakt- oder Adressdaten).
* **Porträt-Upload im Vorstandsportal (`mitglieder-details.js` / `mitglieder-manager.js`):**
  * Im Mitglieder-Modal können Porträtfotos per Drag & Drop hochgeladen werden.
  * Fotos werden browser-nativ auf 600×600 px (quadratischer Center-Crop) als WebP komprimiert und in den Supabase Storage Bucket `operatives-storage/avatars/member_${pn}.webp` hochgeladen.
  * Die URL wird direkt in `public.members.avatar_url` persistiert.
* **Dynamisches Frontend & Porträt-Zoom (`verein.html`):**
  * Das Raster `#board-grid-container` lädt die Vorstandsdaten live via Supabase REST.
  * Liegt ein Porträt vor, wird `.board-photo` angezeigt; andernfalls greift der Initialen-Farbverlauf als Fallback. Das statische HTML bleibt als unzerstörbare Offline-Ausfallsicherung erhalten.
  * **Interaktive Porträt-Vergrösserung:** Vorstandsmitglieder mit hinterlegtem Foto erhalten die Klasse `.has-photo`, `cursor: pointer` sowie einen animierten Zoom-Indikator (🔍). Ein Klick öffnet das zentrierte Porträt-Modal `#board-photo-modal` im edlen Dark-Glassmorphism-Look mit voller 600×600 px Auflösung, Name und Amtsbezeichnung. Das Schliessen erfolgt intuitiv per Button, Klick in den Hintergrund oder `Escape`-Taste.

---

### 2.8 Publishing, Social Media & Lösch-Management für News & Vereinsberichte
* **Single-Target Publishing & geprüfter Bild-Upload (`v1-vorstand.js`):**
  * Veröffentlichte Berichte (`data/berichte.json`) und Fotos (`img/reports/*`) aus dem Modul News & KI werden auf das zentrale Ziel-Repository `sportschuetzen-muhen/website` (Branch `main`) übertragen, von wo aus auch die Website (`main.js`) und die Berichte-Verwaltung (`news.js`) live lesen.
  * Bildpfade werden erst nach bestätigtem GitHub-Upload (`HTTP 2xx`) in den Bericht bzw. an Instagram/Facebook übergeben, um `404`-Folgefehler (z. B. Instagram-Containerfehler bei fehlgeschlagenem Upload) auszuschliessen.
  * Für Facebook-Beiträge nutzt der Worker Meta Graph API `v25.0` und löst aus einem hinterlegten System-User- oder User-Access-Token dynamisch das erforderliche Page Access Token auf (`resolveFacebookPageToken`); zudem prüft `action=test_social` neben Meta-Token-Typ, fehlenden Scopes (`pages_manage_posts`, `instagram_content_publish`) und Page-Token-Auflösung auch die Erreichbarkeit und Schreibberechtigung (`push`) des GitHub-Targets.
* **Robuste Frontend-Darstellung mit Live-Fallback (`main.js`):**
  * `loadReports()` lädt primär die GitHub-Live-Quelle (`sportschuetzen-muhen/website/main/data/berichte.json`) mit automatischem Fallback auf die lokale `data/berichte.json`, falls GitHub nicht erreichbar ist.
  * Bild-URLs verwenden bei Bedarf die GitHub-Raw-URL als Fallback (`onerror`), um Darstellungsunterbrüche auszuschliessen.
* **Sicheres Löschen fehlpublizierter Berichte:**
  * Im Vorstandsportal (`news.js`) steht unter dem Reiter **«📋 Publizierte Berichte»** eine Echtzeit-Verwaltung zur Verfügung.
  * Das Löschen erfolgt granular über die eindeutige Berichts-ID (`id: "report_..."`), inklusive Sicherheitsdialog und Hinweis auf allfällige manuelle Social-Media-Entfernungen; schlägt beim Publizieren ein Kanal fehl, bleiben Entwurf und hochgeladene Fotos im Formular erhalten.
* **Modulübergreifende Apple HEIC/HEIF Bildverarbeitung (`ImageKit`):**
  * Fotos zum Bericht im Modul KI-News (`news.js`) unterstützen durch Integration mit dem zentralen `ImageKit` und `heic2any` die vollautomatische Client-seitige Konvertierung von Apple HEIC/HEIF-Dateien direkt beim Upload oder Fotografieren mit dem iPhone.
  * Neben KI-News greifen auch Resultate OCR (`resultate-events.js`), der Standblatt-Upload (`upload.js`), die Vereins-Galerie (`galerie.js`) und die Mitgliederverwaltung auf denselben Normalisierungs-Standard zurück.

---

### 2.9 Resultate Mannschaft & G & G (Migration 53)
* **Modul-Harmonisierung & Multi-Wettbewerbs-Architektur:** Das Modul «Resultate» im Vorstandsportal wurde in **«Resultate Mannschaft & G & G»** umbenannt und unterstützt die drei Hauptwettbewerbe:
  1. **👥 Mannschaft (SMM):** 7 Runden à 200 Pkt, 8 Schützen je Team (Muhen 1–3).
  2. **🎯 Gruppe (SGM):** 3 Runden à 2 Passen (P1+P2 à 100 Pkt), 5 Schützen je Team (3 Liegend, 2 Kniend).
  3. **🛡️ Grenzland Cup:** 3 Runden à 100 Pkt, 4 Schützen je Team.
* **Single Source of Truth in `public.contest_results`:** Sämtliche Wettkampfresultate werden direkt in `public.contest_results` geführt und über PostgREST für Website und App bereitgestellt.
* **Schnittstelle zur Jahresmeisterschaft:** Die 7 SMM-Runden werden über die Stored Procedure `public.sync_jm_to_contest_mannschaft(p_year)` auf Knopfdruck oder automatisiert aus `jm_shooters.details->'mannschaft'` nach `contest_results` synchronisiert. Doppelerfassungen und E-Mail-Polling entfallen vollständig.

---

### 2.10 Schützenhaus-Vermietung & Disaster Recovery Ausfallschutz (Migration 96)
* **Öffentliche Buchungsstrecke (`schuetzenhaus_vermietung.html`):** Erlaubt Webseitenbesuchern das Buchen der Schützenstube Rüteli sowie das Einreichen von Vorab-Terminanfragen direkt gegen die Supabase-REST-API (`public.rental_requests`).
* **Zero-Lost-Leads Ausfallschutz (Cloudflare Proxy):**
  * Bei Nichterreichbarkeit des primären Heimservers (Timeout > 9 Sekunden) prüft das Frontend zunächst über `get_public_rental_calendar`, ob das Datum bereits in Supabase gespeichert wurde, und schaltet nur bei echtem Ausfall auf den öffentlichen Cloudflare Edge-Proxy `sportschuetzen-website-worker` (`https://sportschuetzen-website-worker.dan-hunziker73.workers.dev/?action=notfallVermietung`) um.
  * Der Worker leitet den Buchungs-Payload serverseitig und ohne Offenlegung der Google-Apps-Script-URL an das Google Notfall-Backend weiter.
  * Das Notfall-GAS blockiert den Google Kalender, erstellt den Schweizer QR-Mietvertrag als PDF auf Google Drive, versendet die Bestätigungsmail und speichert den Fall im Google Sheet `Notfall_Reservationen`.
* **Zentraler Mail-Verteiler (`rental_cc_emails`):** Sowohl im regulären Supabase-Betrieb als auch im Notfall-Fallback erhalten alle konfigurierten Vereins- und Team-Adressen lückenlose E-Mail-Kopien (CC).
* **Wöchentlicher Re-Sync ins Vereinsportal:** Über den Button *«Notfall-Sync»* im Vorstands-Cockpit werden Notfall-Buchungen mit Kennzeichen `V-YYYY-N...` atomar in Supabase importiert und Proforma-Rechnungen im `RechnungsCore` erzeugt. Details siehe [VERMIETUNG_SCHUETZENSTUBE.md](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/VERMIETUNG_SCHUETZENSTUBE.md#L95-L125).

---

### 2.11 Core Web Vitals, Barrierefreiheit & Subresource Security (Modern Web Guidance)
* **LCP- & CLS-Optimierung:** Sämtliche Bilder im sichtbaren Bereich und in den Galerien besitzen explizite `width`- und `height`-Attribute gegen Layout-Shifts (CLS), `fetchpriority="high"` für das LCP-Hauptbild (`index.html` Hero und `schuetzenhaus_vermietung.html`) sowie `loading="lazy" decoding="async"` für Offscreen-Medien. Die Startseite (`index.html`) wurde ohne Splash-Video direkt auf fünf klare Hauptbereiche (Einstieg, Schiesssport, Vermietung, Vereinsleben, Kontakt) fokussiert.
* **Schriften & Zugänglichkeit:** Selbst gehostete Web-Fonts (`Inter`, `Outfit`) nutzen `font-size-adjust: from-font` und Preloading des Haupt-Schriftschnitts. Lange Inhaltssektionen verzichten bewusst auf `content-visibility: auto`, sodass der gesamte Inhalt jederzeit vollständig im Accessibility-Tree und ohne Sprungverhalten beim Scrollen bereitsteht.
* **Barrierefreie Formulare & Tastatursteuerung (WCAG AA):** Alle Formulare (`index.html`, `schuetzenhaus_vermietung.html`, `storno_feedback.html`) verfügen über standardisierte `name`-, `autocomplete`- und `inputmode`-Attribute, sichtbare `:focus-visible`-Ringe, `:user-invalid`-Validierung mit `aria-invalid`-Synchronisation sowie `role="status"`/`aria-live`-Meldungen. Der Belegungskalender ist vollständig per Tastatur (`Tab`, `Enter`/`Space`, `aria-pressed`) bedienbar; die Storno-Gründe nutzen semantische Radio-Buttons im `<fieldset>`/`<legend>`, und die Resultate-Tabellen besitzen fokussierbare Scroll-Container (`tabindex="0"`, `role="region"`).
* **Subresource Integrity (SRI) & Moderne CSS-Standards:** Externe CDN-Ressourcen (`font-awesome`, `heic2any`) sind mit `integrity="sha384-..." crossorigin="anonymous" referrerpolicy="no-referrer"` abgesichert; Scrollbars nutzen `scrollbar-width`/`scrollbar-color` mit `@supports not (scrollbar-color: auto)`-Fallback.
* **Mitglieder-PWA (`index.html`, `style.css`, `app.js`, `manifest.json`, `app/*.html`, `app/upload.js`):** Responsive AVIF/WebP-Logovarianten (`icons/logo-{100,200}.{avif,webp}` mit `<picture>` und `fetchpriority="high"`), `font-size-adjust: from-font`, Lazy Loading für die vier Unterseiten-Iframes (`data-src`, Initialisierung erst beim Tab-Wechsel unter Erhalt von `app:resume`) sowie On-Demand-Laden von `heic2any` und `pdf.js` im Standblatt-Upload, native `<dialog closedby="any">`-Modale statt blockierender `alert()`/`confirm()`-Dialoge, `:user-invalid`/`aria-invalid`-Formularvalidierung im Du-Stil sowie tastaturbedienbare Tabellen- und Detailansichten (`tabindex="0"`, `aria-expanded`, `:focus-visible`).

---

### 2.12 Sicherheits-Härtung, Signed-URL-Archiv & Bereinigung (Migration 140)
* **Strikter Datenschutz & RLS-Härtung:** Durch Migration `140_harden_website_documents_storage_and_rls.sql` ist `club-documents` auf `public = false` umgestellt, sämtliche Legacy-Dev-/Anon-Bypass-Policies (u. a. auf `documents`, `document_chunks`, `members`, `system_app_configs`, `gallery_albums`) wurden entfernt und Endschiessen-Resultate laufen datensparsam über die `SECURITY DEFINER`-RPC `get_endschiessen_public_results` ohne anonymen Zugriff auf `public.members`.
* **Signed URLs & verifizierte JWT-Sessions:** `intern.html`, `galerie.js` und `archiv.js` akzeptieren für geschützte Daten ausschliesslich verifizierte Supabase-GoTrue-JWTs (keine unbeglaubigten PIN-Sitzungen oder `ANON_KEY`-Fallbacks) und öffnen Dokumente über zeitlich begrenzte signierte URLs (300 Sekunden). Nach der 2-Worker-Konsolidierung (Option B) übernimmt `sportschuetzen-website-worker.js` ausschliesslich den geheimnisfreien öffentlichen Edge-Proxy (`immich`, `getHausKalender`, `notfallVermietung`), während sämtliche geschützten Endpunkte (`v1-vorstand.js` inkl. R2-Standblatt, Vermietungs-Sync, Whisper und KI) sowie die Edge Function `immich-upload` unautorisierte Aufrufe bzw. `ANON_KEY`-Tokens strikt mit HTTP 401/403 ablehnen.
* **Altlasten-Bereinigung:** Die nicht mehr benötigten Legacy-Editoren `admin.html` und `galerie-editor.html` wurden entfernt; Berichte- und News-Rendering in `main.js` und `galerie.js` sind gekapselt (IIFE), HTML-bereinigt und mit Fetch-Timeouts samt Retry-Steuerung abgesichert.

---

## 3. Responsive Kompatibilität & Geräte-Standards

| Gerät / Browser | Getroffene Massnahme | Ergebnis |
| :--- | :--- | :--- |
| **iPad Landscape (1024px–1180px)** | Dynamische Reduktion des Abstands `.desktop-nav` von `2rem` auf `0.85rem`–`1.25rem`. | Kein Header-Umbruch; Logo und Navigation bleiben einzeilig. |
| **Smartphones & iPad Portrait (<=1024px)** | Hamburger-Menü (`.mobile-toggle`) mit `100dvh` und `env(safe-area-inset-top)` / `bottom`. | Keine Überdeckung durch Notch oder Safari-Leisten; 44×44px Touch-Targets. |
| **Desktop-Browser (Resultate & Jahresmeisterschaft)** | Vollbreiten-Karten (`results-card`) für Liga 1, Liga 2 und U21 mit Schnellauswahl-Pills; `repeat(auto-fit, minmax(280px, 1fr))` für das 3-Spalten-Detailraster. In Liga 2 und U21 werden Schützen ohne gewertete Resultate ausgeblendet (`total > 0`). | Grosszügige Darstellung (>350px je Detailspalte) ohne Abschneiden oder Textüberlappung; schlanke Rangliste mit motivierendem Info-Hinweis. |
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
4. **Keine stillen Google-Sheets-Fallbacks:**  
   Die Website fragt Daten im Normalbetrieb direkt via Supabase REST (`/rest/v1/...`) oder den Cloudflare Worker ab. Der Notfall-Ausfallschutz bei Server-Ausfall greift nur als explizites Disaster-Recovery-Netz mit Re-Sync-Pflicht.
5. **Entkoppelte Skript-Scopes & Resultate-Dashboard (`resultate.js`):**  
   Modulspezifische Frontend-Skripte werden in IIFEs gekapselt, um globale Namensraum-Kollisionen mit `main.js` auszuschliessen. `resultate.html` bindet ausschliesslich die benötigten Komponenten (`components.js`, `auth-session.js`, `resultate.js`) ein und lädt Schützendaten (`jm_shooters`) performant und rangiert direkt aus Supabase.
6. **Zero-Leakage & Spalten-Level-Härtung für `anon` (Migration 141):**  
   Über die Rolle `anon` sind ausschliesslich öffentliche, personennummernfreie Spalten (`jm_shooters`, `contest_results`, `v_board_members_public`) sowie der anonymisierte Belegungs-RPC `get_public_rental_calendar` erreichbar; `person_number` (SSV-Lizenz / Mitglieder-PIN) und `jm_seasons.raw_grid` sind für `anon` auf Spaltenebene gesperrt. Statische Galerie-Metadaten (`galerie.json`) enthalten nur Einträge mit `visibility === 'public'`, und die Mitglieder-App provisioniert beim PIN-Login (`verify_member_pin` mit Rate-Limiting) eine echte signierte Supabase-GoTrue-Session (`authenticated`).
