# Website Verbesserungen & Roadmap – Sportschützen Muhen

Dieses Dokument dokumentiert die durchgeführten Optimierungen der Website und dient als Leitfaden für zukünftige Anpassungen, die Foto-To-Do-Liste sowie die Umsetzung der **virtuellen 360°-Besichtigung**.

---

## 1. Durchgeführte Sofort-Verbesserungen (Release September 2026)

### A. Startseite (`index.html`): Maximale Sichtbarkeit für die Schützenhaus-Vermietung
* **Hero-Bereich:** Neuer, auffälliger Primär-Button `🏠 Schützenhaus mieten` direkt neben den Vereins-Buttons platziert.
* **Hauptnavigation (`components.js`):** Menüpunkt `🏠 Vermietung` als auffälliger Accent-Button am rechten Rand der Navigationsleiste verankert (gilt automatisch für alle Seiten).
* **Schnellzugriff („Erkunden Sie unseren Verein“):** Zusätzliche 6. Kachel `🏠 Schützenstube mieten (bis 40 Pers.)` mit Preis-Badge `CHF 300.-/Tag` integriert.
* **Teaser-Sektion (`#vermietung`):** Zum visuellen Mini-Feature aufgewertet:
  * Bilddarstellung des Saals mit Live-Badges (`CHF 300.- inkl. Nebenkosten`, `40 Sitzplätze`, `Besenreine Abgabe`).
  * 3 herausgestellte Kern-USPs (Sitzplätze & Ambiente, Küche mit Gastro-Spüler, transparente Kosten ohne Zuschläge).
  * Direkter Buchungs-CTA `📅 Kalender & Buchung` zum interaktiven Belegungskalender.
* **Kontaktformular (`#kontakt`):** Betreff-Auswahl mit Schnellauswahl `🏠 Vermietung Schützenstube (Anfrage & Termine)` und Hilfelink zum Belegungskalender ausgestattet.

### B. Vermietungsseite (`schuetzenhaus_vermietung.html`)
* **Besenreine Abgabe:**
  * In Kosten-Badge und Ausstattungsliste fest verankert: *CHF 300.- / Tag inkl. Nebenkosten. Rückgabe erfolgt besenrein durch den Mieter – keine teuren obligatorischen Reinigungsgebühren.*
  * In den FAQ als eigene, prominente Frage detailliert aufgeführt.
  * Im Schema.org JSON-LD (`FAQPage` & `EventVenue`) für Google Rich Results und KI-Suchmaschinen (GEO) aktualisiert.
* **Kaution & Schlüsseldepot:**
  * Transparente Klärung in den FAQ: Kaution von CHF 100.- als Schlüsseldepot, vollständige Rückerstattung nach besenreiner Abnahme.
* **Baustellen-Hinweis (2026–2027) optisch dezent:**
  * Alarmsignal-Optik (rot) durch vertrauenswürdiges, dezentes Info-Design ersetzt.
  * Kernbotschaft hervorgehoben: **„Am Wochenende herrscht 100 % Baustellenruhe – Feiern vollkommen ungestört möglich!“**
* **Modernisierte Downloads & Neues Mieter-Merkblatt:**
  * Neues interaktives und druckoptimiertes Dokument [merkblatt_mieter.html](frontend/merkblatt_mieter.html) erstellt.
  * Enthält Hausordnung, Sicherheitsregeln, Notfallkontakte und eine interaktive **Checkliste für die besenreine Übergabe**.
  * Download-Sektion aktualisiert.

---

## 2. Foto To-Do-Liste (Aufgaben für Vorstand & Hüttenwart)

Die bisherigen 4 Innenaufnahmen (Saal, Buffet, Küche, Kaffeemaschine) sind technisch gut, decken jedoch noch nicht das gesamte Entscheidungsspektrum potenzieller Mieter ab.

### Priorität 1: Aussenbereich & Umgebung (Wichtig für Grill- & Sommerfeste)
| Motiv | Beschreibung / Szene | Verwendungszweck |
| :--- | :--- | :--- |
| **Aussenbereich mit Festbänken** | Sonnige Aufnahme der Wiese/Vorplatz mit 2–3 aufgestellten Festbänken | Zeigt Eignung für Sommerfeste, Apéros & Grillpartys |
| **Gebäudefront & Zugang** | Schützenhaus von aussen bei Tageslicht (schöner Himmel, einladend) | Erkennbarkeit bei Anreise, Vertrauensaufbau |
| **Parkplatz-Situation** | Übersicht über die grosszügigen Gratis-Parkplätze direkt am Haus | Bequeme Anreise für Gäste & Senioren |
| **Idylle im Grünen** | Blick auf die angrenzende Natur / Suhre-Landschaft | Stimmung & ruhige Lage abseits des Verkehrs |

### Priorität 2: Event-Atmosphäre Innenbereich
| Motiv | Beschreibung / Szene | Verwendungszweck |
| :--- | :--- | :--- |
| **Gedeckte Festtafel** | Tische mit Tischdecken, Gläsern, Besteck & Deko (z.B. Geburtstagsfeier) | Weckt Emotionen; Mieter können sich ihr Fest bildlich vorstellen |
| **Gastro-Geschirrspüler im Detail** | Geöffneter Gastro-Spüler mit Besteckkorb & Spülkörben | Beweist Schnelligkeit und Praxistauglichkeit der Küche |
| **Kühlmöglichkeiten & Vorratsraum** | Grosser Kühlschrank (sauber, beleuchtet) | Wichtig für Getränkekühlung bei Feiern |
| **Barrierefreies WC** | Helle, saubere Aufnahme der rollstuhlgängigen Toilette | Wichtig für barrierefreie Anlässe & Familien |

### Richtlinien zur Bildaufnahme & Web-Optimierung:
1. **Format:** Immer im Querformat (16:9 oder 4:3), kein Hochformat für Hero- und Galerie-Kacheln.
2. **Licht:** Vorzugsweise bei sonnigem oder hellem Wetter, Innenräume gut ausleuchten (alle Deckenlampen an).
3. **Optimierung vor dem Upload:** Gemäss [docs/BILDER_OPTIMIERUNG.md](frontend/docs/BILDER_OPTIMIERUNG.md):
   * Max. Breite: 1400–1920 Pixel.
   * Format: `.webp` mit ca. 80 % Qualität (ergibt nur ~120–180 KB pro Foto bei brillanter Schärfe).

---

## 3. Virtuelle 360°-Besichtigung (360° Panorama Rundgang)

### Welchen Mehrwert bringt ein 360°-Rundgang?
* **Reduzierte Vor-Ort-Besichtigungen:** Interessenten können den Raum von Zuhause aus in 360° drehen, heranzoomen und die Raumaufteilung prüfen.
* **Höhere Buchungsrate:** Vermittelt maximale Transparenz und Vertrauen.
* **Innovativer Vereinsauftritt:** Hebt das Schützenhaus Muhen von Standard-Waldhütten ab.

---

### Was ist dazu nötig? (Equipment, Software, Umsetzung)

#### Schritt 1: Die Hardware & Aufnahme vor Ort
Es werden **3 bis 4 Panorama-Standpunkte** benötigt:
1. **Aussenbereich / Vorplatz:** Blick auf Eingang, Parkplätze und Grünzone.
2. **Saal Mitte:** Rundumblick auf alle 40 Sitzplätze, Decke, Fenster und Beleuchtung.
3. **Buffet & Bar:** Blick auf Theke, Kaffeemaschine und Durchgang zur Küche.
4. **Küche:** 360°-Blick auf Herd, Spüler, Arbeitsflächen und Schränke.

**Möglichkeiten zur Aufnahme:**
* **Option A (Beste Qualität, minimaler Aufwand): 360°-Kamera**
  * Geräte: z.B. *Insta360 X3 / X4*, *Ricoh Theta SC2 / Z1*.
  * Vorteil: 1 Klick pro Raum, Kamera sticht das 360°-Bild (Equirectangular 2:1 Format, z.B. 6080 × 3040 px) vollautomatisch zusammen.
  * Kosten: Oft im privaten Umfeld von Vereinsmitgliedern vorhanden oder für ca. CHF 30–50.- für 1 Wochenende mietbar.
* **Option B (Kostenlos mit Smartphone):**
  * Mit einer Panorama- oder Photosphere-App (z.B. Google Street View App oder 360 Camera App) das Handy langsam im Kreis drehen.
* **Stativ:** Ein einfaches Stativ mit schmalem Kopf (damit unter der Kamera keine Stativbeine stören).

---

#### Schritt 2: Software & Hosting (100 % DSGVO-konform, werbefrei & kostenlos)
Wir empfehlen für die Sportschützen Muhen **keine teuren Abos** (wie Matterport für CHF 20.-/Monat), sondern eine native, schlanke Open-Source-Lösung:

* **Empfehlung: [Pannellum.js](https://pannellum.org/)**
  * **Kosten:** 0.00 CHF (Free & Open Source).
  * **Datenschutz:** 100 % konform mit dem Schweizer Datenschutzgesetz (nDSG) und DSGVO – keine externen Server, keine Tracking-Cookies.
  * **Performance:** Extrem leichtgewichtig (~15 KB Skript). Funktioniert auf iOS, Android, Tablets und Desktop flüssig via WebGL.
  * **Hosting:** Die Panorama-Dateien (`saal_360.webp`) liegen direkt im Ordner `bilder_haus/` auf GitHub Pages / Cloudflare Pages.

---

#### Schritt 3: So sieht die Einbindung im HTML-Code aus

**1. CSS & JS im `<head>` einbinden (selbstgehostet oder CDN):**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
<script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
```

**2. Viewer-Container auf `schuetzenhaus_vermietung.html` platzieren:**
```html
<section class="panorama-section" style="margin: 40px 0;">
  <h2 class="section-title"><i class="fa-solid fa-vr-cardboard"></i> Virtueller 360°-Rundgang</h2>
  <p style="margin-bottom: 15px; color: var(--text-muted);">
    Bewegen Sie sich virtuell durch unsere Schützenstube. Klicken und ziehen Sie mit der Maus oder dem Finger.
  </p>
  
  <div id="panorama-viewer" style="width: 100%; height: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 60, 92, 0.1);"></div>
</section>
```

**3. Initialisierungs-Skript:**
```javascript
pannellum.viewer('panorama-viewer', {
    "type": "equirectangular",
    "panorama": "bilder_haus/saal_360.webp",
    "autoLoad": true,
    "autoRotate": -1.5,
    "compass": false,
    "title": "Schützenstube Muhen - Saal & Buffet",
    "author": "Sportschützen Muhen"
});
```

---

## 4. Zukünftige Weiterentwicklungen & SEO-Roadmap

1. **Google Business Profil (Google Maps):**
   * Das Schützenhaus Muhen auf Google Maps mit der Kategorie *„Eventlokal / Partyraum / Veranstaltungsraum“* pflegen.
   * Den direkten Buchungslink `https://sportschuetzen-muhen.ch/schuetzenhaus_vermietung.html` in den Maps-Eintrag einpflegen.
2. **Automatisierte Mietvertrag-Zustellung:**
   * Beim Einreichen einer Online-Reservation über das Formular wird dem Mieter nebst dem Mietvertrag automatisch das `merkblatt_mieter.html` als praktische Vorbereitung beigelegt.
3. **PWA-Offline-Checkliste für den Hüttenwart:**
   * Die Abnahme-Checkliste aus `merkblatt_mieter.html` kann künftig in die vereinsinterne Mitglieder-PWA integriert werden, damit der Hüttenwart bei der Übergabe vor Ort direkt auf dem Smartphone den Haken setzen kann.
