# Bildoptimierungs-Leitfaden für die Sportschützen Muhen Website

Dieser Leitfaden erklärt, wie Fotos und Grafiken für die Website optimal vorbereitet werden, um schnelle Ladezeiten (auch bei schwachem Mobilfunkempfang im Schützenhaus) und beste Darstellungsqualität zu erzielen.

---

## 1. Warum Bildoptimierung & WebP / AVIF?

Klassische Digitalfotos aus Smartphones oder Kameras haben heute oft 5 bis 15 Megabyte. Wenn solche Dateien direkt auf die Website geladen werden:
* Müssen Besucher auf dem Smartphone lange warten.
* Verbrauchen Besucher unnötig mobiles Datenvolumen.
* Werden Websites bei Google schlechter gerankt (Core Web Vitals).

**Der Vorteil moderner Formate:**
* **WebP:** Kompatibel mit allen modernen Browsern (Apple Safari, Google Chrome, Mozilla Firefox, Microsoft Edge). Spart ca. **40–70 % Speicherplatz** gegenüber JPG bei identischer Bildqualität.
* **AVIF:** Noch stärkere Kompression, ideal für Banner und Porträts.

---

## 2. Empfohlene Richtwerte für Abmessungen & Grössen

| Bildtyp | Empfohlene Maximal-Auflösung | Ziel-Dateigrösse | Format |
| :--- | :--- | :--- | :--- |
| **Hero-Banner (Header)** | 1920 × 1080 Pixel | 150 – 250 KB | WebP / JPG |
| **Berichte & News** | 1200 × 800 Pixel | 80 – 140 KB | WebP |
| **Fotogalerie & Archiv** | 1400 × 950 Pixel | 100 – 180 KB | WebP |
| **Vorstand / Porträts** | 600 × 600 Pixel | 40 – 70 KB | WebP / JPG |
| **Logos & Wappen** | 400 × 400 Pixel | < 50 KB | PNG (Transparent) oder SVG |

---

## 3. Kostenlose & einfache Tools zur Konvertierung

### Methode A: Direkt im Browser (Ohne Installation – Empfohlen für den Vorstand)

1. **[Squoosh.app](https://squoosh.app)** (von Google entwickelt):
   * Foto einfach per Drag & Drop ins Browserfenster ziehen.
   * Rechts unten auf **WebP** stellen.
   * Den Qualitätsregler auf **75–80 %** einstellen (optisch kein Unterschied zum Original).
   * Bildgrösse bei Bedarf unter *Resize* auf z. B. `1400px` Breite begrenzen.
   * Datei herunterladen – fertig!

2. **[TinyPNG / TinyJPG](https://tinypng.com)**:
   * Bis zu 20 Bilder gleichzeitig hochladen, komprimieren und als ZIP herunterladen.

---

### Methode B: Stapelverarbeitung für viele Bilder (Batch-Tool)

Für ganze Jahresalben oder Galerie-Archive empfiehlt sich ein kostenloses Desktop-Tool wie:
* **[XnConvert](https://www.xnview.com/de/xnconvert/)** (Windows & Mac, kostenlos für Vereine/privat):
  * Ganzen Ordner hineinziehen.
  * Reiter *Aktionen* ➔ Grösse ändern auf max. 1400 px Breite (Seitenverhältnis beibehalten).
  * Reiter *Ausgabe* ➔ Format: **WebP**, Qualität: **80**.
  * Konvertieren klicken – Hunderte Fotos in Sekunden optimiert.

---

## 4. Best-Practice Einbindung im HTML-Code

### Modernes Responsive `<picture>`-Tag (mit JPG-Fallback):
```html
<picture>
  <!-- Modernes WebP für 99% aller Browser -->
  <source srcset="assets/galerie/foto2026.webp" type="image/webp">
  <!-- Fallback für ältere Systeme -->
  <img src="assets/galerie/foto2026.jpg" 
       alt="Gruppenmeisterschaft 2026 Sportschützen Muhen"
       width="1200" height="800"
       loading="lazy" 
       decoding="async">
</picture>
```

### Die wichtigsten HTML-Attribute:
* **`loading="lazy"`:** Bilder ausserhalb des sichtbaren Bereichs werden erst geladen, wenn der Besucher dorthin scrollt. Spart sofort Ladezeit beim Seitenaufruf.
* **`decoding="async"`:** Verhindert Ruckeln beim Scrollen, während der Browser das Bild dekomprimiert.
* **`width` und `height`:** Feste Seitenverhältnisse verhindern störende Layout-Sprünge (Cumulative Layout Shift) beim Laden.
