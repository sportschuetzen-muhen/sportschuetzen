# Fachdokumentation: Galerie Manager & Immich Vereins-Fotoarchiv

> **Status:** PRODUKTIV  
> **Stand:** Oktober 2026  
> **Komponenten:** `vorstand/js/galerie.js`, `vorstand/index.html`, `supabase/functions/immich-sync/index.ts`, `supabase/functions/immich-upload/index.ts`, `public.gallery_albums`, `public.gallery_photos`, `sportschuetzen-website/frontend/js/galerie.js`  
> **Infrastruktur & Server:** Immich Media Server auf Proxmox CT 116 (`http://192.168.68.120:2283`, Medion Node), Supabase Edge Functions & PostgreSQL auf Proxmox CT 117 (`192.168.68.117`), Cloudflare Worker Proxy  
> **Relevanz für KI:** Verbindliche Referenz für das Vereins-Fotoarchiv, die Immich-Integration, das Kuratierungs-Cockpit, die Medientrennung (öffentlich vs. intern), das rollenbasierte Benachrichtigungs-Badge-System und den 1-Klick-Synchronisations-Workflow.

---

## 1. Übersicht & Zielsetzung

Der **Galerie Manager** im Vorstandsportal dient als zentrales Kontrollzentrum für das gesamte visuelle Gedächtnis der Sportschützen Muhen:
1. **Zentrales Fotoarchiv (Immich CT 116):** Hochperformante, lokale Speicherung aller Originalaufnahmen und Videos mit integrierter KI-Gesichtserkennung, Objekterkennung und EXIF-Indexierung auf dem Vereins-Server.
2. **Kuratierungs-Cockpit:** Einfache Übersicht über neu hochgeladene Mitgliederfotos aus dem Sammelalbum «Mitglieder-Uploads», Zuordnung erkannter Gesichter zu Vereinsmitgliedern und Bereinigung von Dubletten.
3. **Medientrennung & Datenschutz:** Strikte Unterscheidung zwischen allgemein zugänglichen Bildern auf der Website und geschützten Fotos im Mitgliederbereich.
4. **Benachrichtigungssystem (Badges):** Rote Pendenzen-Punkte mit Zähler in der Desktop-Navigation, auf der Dashboard-Kachel sowie als aggregiertes Sammel-Badge im mobilen Header (Smartphones & iPads).
5. **Synchronisation zur Website:** Gezieltes Publizieren ausgewählter Alben/Ordner in das statische bzw. Cloudflare-gecachte Website-Archiv (`galerie.json`).

---

## 2. Systemarchitektur & Datenfluss

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FOTO-WORKFLOW & DATENFLUSS                             │
├────────────────────────────────┬───────────────────────────────┬───────────────────────┤
│ 1. UPLOAD (Mitglieder)         │ 2. KURATIERUNG (Vorstand)     │ 3. PUBLIKATION        │
├────────────────────────────────┼───────────────────────────────┼───────────────────────┤
│ • Smartphone / Browser         │ • Vorstandsportal & Immich    │ • 1-Klick-Sync Button │
│   (intern.html «Vereinsfotos») │ • Pendenzen-Badge zeigt offene│ • Edge Function       │
│ • Client-Konvertierung (HEIC)  │   Uploads im Sammelalbum      │   immich-sync         │
│ • Edge Function immich-upload  │ • Gesichter zuweisen & taggen │ • Single Source:      │
│ • Ablage in Sammelalbum        │ • Sortierung in Event-Alben   │   - gallery_albums    │
│   «Mitglieder-Uploads»         │   (z.B. «Endschiessen 2026»)  │   - gallery_photos    │
└────────────────────────────────┴───────────────────────────────┴───────────────────────┘
                                                │
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SERVER-INFRASTRUKTUR & PROXY                              │
├────────────────────────────────┬───────────────────────────────┬───────────────────────┤
│ • Proxmox CT 116 (Immich)      │ • Proxmox CT 117 (Supabase)   │ • Cloudflare Worker   │
│   192.168.68.120:2283          │   Edge Functions (Deno)       │   CORS- & CORP-Proxy  │
│   Original-Assets & ML-Cluster │   Healthcheck & Foto-Ingest   │   Sichere Auslieferung│
└────────────────────────────────┴───────────────────────────────┴───────────────────────┘
```

---

## 3. Benachrichtigungs- & Badge-Architektur

Um dem Vorstand sofort zu signalisieren, dass neue Fotos von Mitgliedern eingegangen sind, nutzt das System ein mehrstufiges Benachrichtigungsmodell:

### 3.1 Zähler-Ermittlung
* Die Supabase Edge Function `immich-upload` prüft per `GET`-Request den aktuellen Zustand des Sammelalbums `Mitglieder-Uploads` (`6184f06d-be38-426b-8737-1bec29ab045e`).
* Antwort-Payload:
  ```json
  {
    "status": "online",
    "album": {
      "id": "6184f06d-be38-426b-8737-1bec29ab045e",
      "name": "Mitglieder-Uploads",
      "count": 9
    }
  }
  ```
* Liefert `count > 0`, sind neue, ungesichtete Bilder vorhanden.

### 3.2 Badge-Elemente im Vorstandsportal
1. **Sidebar-Menü (`#galerie-nav-badge`):** Roter Pill-Badge neben «Galerie Manager».
2. **Dashboard-Kachel (`#galerie-tile-badge`):** Roter Zähler auf der Kachel «Galerie Manager» auf der Übersichtsseite.
3. **Mobile- & iPad-Header (`#mobile-global-badge`):**
   * Auf mobilen Geräten und Tablets (< 1200px) ist die Navigation standardmässig eingeklappt.
   * Am Hamburger-Icon (`fa-bars`) im `.mobile-header` wird ein **aggregiertes Sammel-Badge** angezeigt:
     $$\text{Total Pendenzen} = \text{Standblätter Jahresmeisterschaft} + \text{Offene Galerie-Uploads}$$
   * Sobald der Benutzer das Menü öffnet, sieht er die genaue Aufteilung pro Fachbereich.

---

## 4. Rollen- & Berechtigungskonzept

### 4.1 RBAC im Vorstandsportal
Gemäss dem einheitlichen 2-Stufen-Modell («View & Manage» Kontrakt):
* `galerie.view`: Berechtigt zum Einsehen des Galerie Managers, der Server-Statusanzeige und der synchronisierten Alben.
* `galerie.manage`: Berechtigt zur Synchronisation von Alben, Änderung der Sichtbarkeit und Administration.
* Zugeordneten Rollen: `admin`, `vorstand`, `schuetzenmeister`, `aktuar`, `kassier`.

### 4.2 Rollenverteilung in Immich
* **Admin-Account:** Dient ausschliesslich der Systemwartung (Storage, Docker-Mounts, Hardwarebeschleunigung, ML-Pipeline).
* **Vorstand-Account:** Für den Vorstandsbetrieb wird ein reguläres Benutzerkonto (Rolle `User`) genutzt (z. B. `vorstand@sportschuetzen-muhen.ch`). Dies verhindert versehentliche Änderungen an der Server-Infrastruktur und gewährleistet gleichzeitig vollen Zugriff auf alle Alben, Gesichter-Zuweisungen und Freigaben.

---

## 5. Medientrennung: Öffentlich vs. Geschützt

Aus Datenschutz- und Persönlichkeitsrechtsgründen wird jedes synchronisierte Medium strikt klassifiziert:

| Klassifizierung | Sichtbarkeit | Zielseite | Typische Inhalte |
| :--- | :--- | :--- | :--- |
| **`public`** (Öffentlich) | Für alle Besucher ohne Anmeldung | Homepage (`verein.html#galerie`) | Bau des Schützenhauses Rüteli 1996/1997, offizielle Verbandsfeste, Schützenhaus & Schützenstube. |
| **`members`** (Geschützt) | Nur für angemeldete Vereinsmitglieder | Mitgliederbereich (`intern.html` Tab «Vereinsfotos») | Nachwuchs- und Jugendtage, interne Vereinsfeiern, Absenden, Aufnahmen mit Personen- und Gesichtserkennung. |

---

## 6. Synchronisations-Workflow (1-Klick im Vorstandsportal)

Die Übernahme von Alben aus Immich in das Web-Frontend erfolgt vollautomatisch über die Supabase Edge Function `immich-sync` direkt im Vorstandsportal:

### 6.1 Album-Erstellung & Kuratierungs-Workflow
Für das Anlegen von Zielalben und das Einsortieren existieren zwei harmonisierte Wege:
* **Variante 1 (Direkt in Immich beim Sichten):** Fotos im Sammelalbum «Mitglieder-Uploads» markieren, auf `+` klicken und Zielalbum wählen bzw. direkt «Neues Album erstellen». Anschliessend im Drei-Punkte-Menü `⋮` zwingend **«Aus Album entfernen»** wählen (niemals auf den Papierkorb/Löschen klicken, da dies das Foto vom gesamten Server löscht).
* **Variante 2 (Direkt im Vorstandsportal anlegen):** Über den Button **«➕ Neues Album»** neben dem Dropdown wird das Album via Edge Function `immich-sync` (`action: 'create_album'`) direkt per Immich API (`POST /api/albums`) auf Proxmox CT 116 erstellt.
* **Duplikat-Schutz & Auto-Refresh:** Die Eingabe prüft live gegen vorhandene Alben, um versehentliche Doppelungen zu verhindern. Zudem aktualisiert ein Window-Focus-Listener die Albenliste automatisch im Hintergrund, sobald der Benutzer aus Immich zurück in das Vorstandsportal wechselt.

### 6.2 Benutzer-Workflow zur Publikation (Browser)
1. **Album-Auswahl:** Aus einem Dropdown werden alle auf dem Immich-Server (CT 116) vorhandenen Alben geladen. Über das Aktualisieren-Icon `[🔄]` kann die Liste jederzeit manuell neu geladen werden.
2. **Ordner- / Albumname:** Wird automatisch mit dem Immich-Namen vorausgefüllt und kann frei angepasst werden.
3. **Sichtbarkeit:**
   * `members`: **🔒 Nur Mitglieder (geschützter Bereich)** – Nur für angemeldete Vereinsmitglieder in `intern.html` sichtbar.
   * `public`: **🌐 Öffentlich und Mitglieder (Homepage & geschützter Bereich)** – Sowohl auf der öffentlichen Homepage `verein.html` als auch für angemeldete Mitglieder in `intern.html` sichtbar.
4. **1-Klick-Auslösung:** Ein Klick auf **«Album jetzt synchronisieren & publizieren»** startet den automatischen API-Prozess:
   * Edge Function generiert bei Bedarf vollautomatisch den Immich Share-Link per API.
   * Sämtliche Assets werden bereinigt (Titel, EXIF, Personenerkennung, Tags).
   * Schreibt die Daten unmittelbar in `public.gallery_albums` und `public.gallery_photos` (Single Source of Truth).
   * Das Album ist sofort auf der Website und im Mitgliederbereich live.

### 6.3 Depublizieren & Löschen
Publizierte Alben können direkt in der Liste «Aktuell publizierte Alben» über das Mülleimer-Icon `[🗑️]` wieder von der Website entfernt werden. Die Original-Fotos auf Immich bleiben dabei unberührt.

### 6.4 Entwickler-Fallback (CLI)
Das bisherige CLI-Skript `sportschuetzen-website/sync-immich-album.js` bleibt ausschliesslich für Offline-Wartungsarbeiten und lokale Batch-Tests erhalten.

---

## 7. Cloudflare Worker Proxy-Schutz
Da moderne Browser Anfragen blockieren, wenn externe Foto-Server restriktive Header (`Cross-Origin-Resource-Policy: same-origin`) senden, laufen alle Bild- und Video-Abrufe auf der Website über den Cloudflare-Worker-Proxy:
* **Worker-URL:** `https://sportschuetzen-website-worker.dan-hunziker73.workers.dev`
* **Funktion:** Anreicherung mit `Cross-Origin-Resource-Policy: cross-origin` und sicheres Caching zur Entlastung des Proxmox-Servers.
