# Fachdokumentation: Festkasse (WaiterOne POS)

> **Status:** PRODUKTIV (Lokal-autarke PWA / Standalone)  
> **Stand:** November 2026  
> **URL:** `https://sps-b55.pages.dev/kasse/`  
> **Komponenten:** `kasse/index.html`, `kasse/kasse.js`, `kasse/epos-print.js`, `kasse/abschluss.js`, `kasse/kellner.js`, `kasse/db.js`, `kasse/sw.js`  
> **Architektur:** 100% Offline-First via IndexedDB (`FestkasseDB`) & Service Worker (`festkasse-v11`). Direktansteuerung von Epson LAN-Bondruckern via ePOS-Print (XML/HTTP) oder LAN-Gateway (ESC/POS Port 9100). Keine dauerhafte Abhängigkeit zu Cloud, GAS oder Internet. WebKit/Safari-Härtung mit Redirect-Bereinigung und solider Statusleiste (kein Schleier/Blur).

---

## 1. Übersicht & Zielsetzung

Die **Festkasse** ist eine eigenständige Progressive Web App (PWA) für das Schützenhaus, Festzelte und Vereinsanlässe der Sportschützen Muhen. Sie wurde entwickelt, um auch bei völligem Netzausfall im Festzelt eine blitzschnelle, intuitive Kassenführung zu gewährleisten:

* **WaiterOne-Bedienlayout (iPad- & iPhone-optimiert):** Horizontale Kategorien-Pills, adaptive Produktkacheln mit grossen Touch-Zielen ($\ge 52\text{px}$), flexibler Bon-Bereich im Hoch- und Querformat sowie Schweizer Notenrechner (10, 20, 50, 100, 200 CHF) mit automatischer Rückgeldanzeige.
* **iOS-/iPadOS-Ergonomie & Gestenschutz:** Striktes Unterbinden von versehentlichem Pull-to-Refresh (`overscroll-behavior: none` & `touchmove`-Guard) zum Schutz vor unbedachtem Neuladen offener Bons. Dynamische Viewport-Anpassung via `100dvh` und Safe-Area-Insets (`env(safe-area-inset-*)`) verhindern Überlagerungen durch iOS-Home-Balken und Systemleisten. Alle Eingabefelder sind auf $\ge 16\text{px}$ genormt, um den störenden Safari-Autozoom zu blockieren.
* **Kassensturz & Z-Abschluss:** Interaktives Münzen- und Noten-Zählprotokoll (5 Rappen bis 1000 Fr), Soll/Ist-Vergleich mit Diskrepanz-Berechnung, Barauslagen-Erfassung und Z-Bericht-Quittung (80mm Thermo-Druck).
* **Multi-Device Kellneransicht & Fliegende Kasse:** Nativer Handheld-Modus für Smartphones (iPhone) zur blitzschnellen Tischerfassung. Ermöglicht sowohl das **direkte Kassieren am Tisch** (`💵 BAR` mit Noten- & Rückgeldrechner oder `📱 TWINT`) als auch das reine Vorab-Senden an die Küche (`🚀 Nur an Küche senden`). Bei Abschluss wird der Bon (Küchen- und Gastbeleg mit Tischnummer) sofort physisch auf dem Bondrucker ausgeworfen und in der lokalen DB verbucht.
* **Permanente Live-Umsatzleiste:** Direkt im Kassen-Header wird der aktuelle Tagesstand (`💵 Bar: CHF ... | 📱 Twint: CHF ...`) in Echtzeit angezeigt. Ein Klick darauf führt direkt in den detaillierten Kassensturz.
* **Entkopplung Schichtplaner:** Der Schichtplaner wurde bewusst aus der Kassen-App herausgelöst und in ein eigenes, cloud-synchronisiertes System überführt (siehe [SCHICHTPLANER.md](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/SCHICHTPLANER.md)). Kassenbediener wechseln ihren Namen direkt über den schnellen Bediener-Dialog im Kassen-Header.

---

## 2. Lokales Datenmodell (`FestkasseDB` via IndexedDB)

| Object Store | KeyPath | Indizes | Zweck & Invarianten |
| :--- | :--- | :--- | :--- |
| `categories` | `id` | `sortOrder` | Warengruppen (Alkoholfrei, Bier/Wein, Grill, Kaffee/Dessert, Bar, Depot). |
| `products` | `id` | `categoryId`, `name` | Artikelstamm mit Preisen in CHF, Einheiten, Icons und automatischem Pfandbetrag. |
| `orders` | `id` | `timestamp`, `status`, `orderNumber` | Abgeschlossene Bons mit Positionen, Zahlart (Bar/Twint), erhaltenem Bargeld und Rückgeld. |
| `cashMovements`| `id` | `timestamp`, `type` | Bargeldbewegungen: Einlagen (Wechselgeld) und Barauslagen (Not-Einkauf Senf/Brot). |
| `zReports` | `id` | `timestamp` | Revisionssichere Z-Kassenabschlüsse mit Zählsummen, SOLL/IST-Vergleich und Differenz. |
| `settings` | `key` | – | Lokale Konfiguration (Event-Titel, aktiver Kassier, Station, Wechselgeld). |

---

## 3. Sicherheitsanalyse & Schutz vor Angriffen von aussen

### 3.1 Perimeter-Sicherheit & Sandbox-Isolation
* **Client-seitige Isolation:** Die Festkasse läuft vollständig in der Browser-Sandbox des aufrufenden Endgeräts. Alle Verkäufe, Umsätze und Kassenstürze werden ausschliesslich in der lokalen `window.indexedDB` (`FestkasseDB`) gespeichert.
* **Schutz vor externen Internet-Angriffen:** Selbst wenn ein Angreifer die öffentliche URL `https://sps-b55.pages.dev/kasse/` aufruft, erzeugt er lediglich eine leere, isolierte lokale Datenbank auf seinem eigenen Rechner. Ein Zugriff auf die Kassendaten des Schützenhaus-iPads oder ein Schreiben in die Vereins-PostgreSQL-Datenbank ist über diese Oberfläche technisch ausgeschlossen.

### 3.2 Eingangsvalidierung & XSS-Härtung
* **BroadcastChannel & Bestelleingang:** Eingehende Bestellungen aus dem Handheld-Modus werden strikt per Referenz-ID in einer `pendingOrders`-Map vorgehalten. Es findet keine ungeprüfte String-Interpolation von JSON in Inline-HTML-Attributen mehr statt (Schutz vor DOM-XSS).
* **HTML-Escaping:** Alle dynamischen Felder (Artikelnamen, Bedienername, Tischnummer, Quittungsbelegtexte) werden vor dem Rendern durch `escapeHtml()` bereinigt.

### 3.3 Physische Sicherheit & Bediener-Verwaltung
* Der aktive Bediener und die Station (z.B. «Beat Müller / Kasse 1») können direkt über den Header gewechselt werden.
* Auf Kassenquittungen und Z-Abschlüssen wird der jeweilige Bediener transparent mit Zeitstempel ausgewiesen.

---

## 4. Querverweise & Architektur-Integration
* **Schicht- & Helferplanung:** Siehe [SCHICHTPLANER.md](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/SCHICHTPLANER.md).
* **Finanzbuchhaltung:** Kassen-Sammelbelege und Kassenbuchungen für das Vereinskonto 1000 (Kasse) werden im Vorstandsportal unter [FINANZBUCHHALTUNG_UND_BANK.md](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/FINANZBUCHHALTUNG_UND_BANK.md) gebucht.
* **Portal- & Website-Integration:** 
  - **Vorstandsportal (`vorstand/`):** Prominentes Kachel-Icon und Sidebar-Link «🛒 Festkasse (POS)» mit dediziertem Cockpit (`vorstand/js/festkasse.js`), Live-Vorschau und Vollbild-Start. Berechtigungskontrakt über `anlaesse.view` / `anlaesse.manage`.
  - **Mitgliederbereich (`intern.html`):** Schnellstart-Pill in den Haupt-Tabs und Schnellstart-Banner innerhalb des Helfer- & Schichtplans (`member-shifts.js`) für Kassen- und Thekendienste.

---

## 5. Bondruck & 2-Bon-System für Festbetrieb (ESC/POS LAN Port 9100)

### 5.1 Druck-Architektur & Epson TM-T20II Multi-Treiber
* **Voreinstellung «Out of the Box»:** Alle neu geöffneten Geräte (iPads, iPhones, PCs) sind standardmässig auf `192.168.68.200`, Treiber `epos_direct` und aktives `HTTPS/SSL` vorkonfiguriert, sodass ohne manuelle Konfiguration sofort gedruckt werden kann.
* **Multi-Treiber-Modell (Schützenhaus vs. Autarkes Festzelt):**
  - **Treiber 1: ⚡ LAN-Gateway (CT 117 / Supabase Edge Function):** Standard im Vereinsheim/Schützenhaus. Druckaufträge werden als JSON an die Edge Function `pos-print` gesendet, welche rohe ESC/POS-Binärbefehle über TCP-Port 9100 an den Drucker streamt. Dies erlaubt nahtlosen Hintergrunddruck ohne jeden App-Wechsel auf dem iPad, PC oder Android-Gerät.
  - **Treiber 2: 🌐 Direkter ePOS-Print (100% ohne Supabase / rein Browser):** Autarke Direktanbindung des Epson ePOS-Print Webservers via Port 80 (HTTP) oder 443 (HTTPS). Der Browser sendet standardisiertes SOAP/XML direkt an `http://<ip>/cgi-bin/epos/service.cgi`. Ideal für den autarken Festbetrieb über lokalen HTTP-Webserver ohne jede Server- oder Cloud-Abhängigkeit.
  - **Treiber 3: 📄 Browser-Druckdialog (AirPrint):** Fallback via nativer Druckausgabe.

### 5.2 2-Bon-Splittung (Kunde & Küche/Grill)
* **Fortlaufende Bestellnummer:** Vergabe einer grossen, gut lesbaren Abhol-Nummer (`#01` bis `#999`), die bei Schichtbeginn im Einstellungsmenü jederzeit auf `#01` zurückgesetzt werden kann.
* **Bon 1 (Gastquittung):** Enthält Vereins-Header, Zeitstempel, Bediener/Kasse, grosse Bestellnummer, Einzelpositionen mit Preisen, Zahlart (Bar mit Rückgeld / Twint) sowie automatischen Papierschnitt (`cut`) und optionalen Impuls für die Kassenschublade (`pulse`).
* **Bon 2 (Küchen- / Grill-Bon):** Enthält eine riesige Bestellnummer (3-fache Vergrösserung), Zeitstempel, Kasse und ausschliesslich Zubereitungsartikel (Kategorie `cat_grill`) in grosser Schrift ohne Preise. Enthält ein Bon keine Küchenartikel, wird automatisch kein leerer Küchenbon gedruckt.
* **Optional Bon 3 (Getränkebon):** Für räumlich getrennte Ausschank-/Barstationen konfigurierbar.

### 5.3 Kassen-Ergonomie & Konfiguration
* **Blitz-Checkout:** Nach dem Kassieren wird der Verkauf verbucht, das Rückgeld prominent für 6 Sekunden eingeblendet und die Kasse ist in 0.1s wieder frei für die nächste Bestellung.
* **Druckmodi im Einstellungsmenü (⚙️):**
  - *Manuell (Empfohlen):* Kasse bleibt sofort frei; Bon wird nur auf Wunsch über den Schnellzugriff `[🧾 Letzter Bon]` gedruckt.
  - *Automatischer Sofortdruck:* Druckt Gast- und Küchenbon ohne jeden Dialog direkt nach der Zahlung.
  - *Browser-Druckdialog:* Fallback via AirPrint.
* **Testdruck & Diagnose:** Direkte Testdruck-Buttons für Gastbeleg und Küchenbon mit Live-Status im Konfigurationsdialog.

### 5.4 Abendauswertung & Z-Kassenabschluss
* **Artikel- & Verkaufsstatistik («Renner & Penner»):** Im Reiter «Kassensturz & Z-Bericht» wird eine aufklappbare Tabelle aller verkauften Artikel automatisch nach Absatzmenge und CHF-Umsatz sortiert dargestellt.
* **1-Klick-Z-Bericht auf Epson LAN:** Der offizielle Z-Tagesabschluss (SOLL/IST-Vergleich, Münzzählung, TWINT/Bar-Split, Differenz) kann per Knopfdruck `[🖨️ Z-Bericht an Epson]` direkt auf dem 80mm-Thermodrucker ausgegeben werden.
* **Strikte Entkopplung von der Finanzbuchhaltung (Keine automatischen Fibu-Buchungen):** Die Festkasse führt keine automatischen Schreibzugriffe in die Supabase-Finanzbuchhaltung durch. Der Z-Bericht dient als physischer/digitaler Belegnachweis für das Kassenkuvert; die eigentliche Verbuchung auf Konto 1000/3200 erfolgt bei Bedarf manuell durch den Kassier im Vorstandsportal.

### 5.5 Bedarfsgesteuerte Freigabe im Mitgliederbereich (`intern.html`)
* **Single Source of Truth (`system_app_configs`):** Über den Schlüssel `member_festkasse_enabled` steuert der Vorstand, ob die Festkasse im Mitgliederbereich (`intern.html`) als Tab/Kachel sichtbar ist.
* **Vorstands-Schalter:** Im Vorstandsportal (`vorstand/js/festkasse.js`) kann die Kasse mit 1 Klick aktiviert oder deaktiviert werden. Die Anbindung nutzt die globale Client-Auflösung `getFestkasseClient()` und sichert Benutzerhinweise über `UIConfirmKit.alert()` ab.
* **Strikte Sichtbarkeitssteuerung:** Bei Status `inaktiv` wird die Festkasse in `intern.html` sowie im Schichtplan für alle Benutzer ausnahmslos ausgeblendet.

---

### 5.6 TLS/HTTPS-Zertifikatskette & ePOS-Print (Epson TM-T20II & iPadOS)

#### 5.6.1 Problemstellung & Apple WebKit Sicherheitsvorgaben
Da die Festkasse als moderne Progressive Web App über HTTPS (`https://sps-b55.pages.dev/kasse/` oder PWA-Homescreen) betrieben wird, blockiert Safari jegliche unverschlüsselte HTTP-Anfrage an eine lokale LAN-IP (`192.168.68.200`) als **Mixed-Content**. Der autarke ePOS-Direktdruck aus dem Browser erfordert daher zwingend HTTPS auf Port 443 des Druckers.

Apple setzt in iOS/iPadOS strikte Vorgaben für TLS-Serverzertifikate durch:
1. **Gültigkeitsdauer:** Server-Zertifikate dürfen seit iOS 13 maximal 398 Tage gültig sein (wir setzen 365 Tage ein).
2. **Subject Alternative Name (SAN):** Die IP des Druckers (`IP:192.168.68.200`) und optionale Hostnames müssen zwingend als SAN im Zertifikat eingetragen sein (reines `CN` reicht Apple nicht mehr).
3. **Extended Key Usage:** Muss `serverAuth` enthalten.
4. **Schalter für Stammzertifikate:** Damit in iPadOS unter *Einstellungen $\rightarrow$ Allgemein $\rightarrow$ Info $\rightarrow$ Zertifikatsvertrauenseinstellungen* der Schalter für volles Vertrauen erscheint, **muss** das installierte Profil eine echte Certificate Authority (Root CA) mit `basicConstraints = critical, CA:true` enthalten. Ein direktes End-Entity-Zertifikat wird von iOS als Server-Zertifikat, nicht als CA eingestuft und schaltet die Vertrauenseinstellung nicht frei.

#### 5.6.2 Architektur der 2-stufigen Zertifikatskette (`/opt/muhen-ca`)
Auf dem Proxmox Container **CT 117** (`192.168.68.117`) ist die vereinsinterne Zertifizierungsstelle eingerichtet:

| Ebene | Zertifikat | Gültigkeit | Speicherort CT 117 | Verwendungszweck |
| :--- | :--- | :--- | :--- | :--- |
| **Ebene 1** | **Sportschützen Muhen Root CA** (`ca.crt`) | **10 Jahre (bis Nov 2036)** | `/opt/muhen-ca/ca.crt` | Stammzertifizierungsstelle (`CA:TRUE`). Wird einmalig via `.mobileconfig`-Profil auf den Schützenhaus-Tablets installiert. |
| **Ebene 2** | **Epson POS Server-Zertifikat** (`server.crt` / `.pfx`) | **1 Jahr (365 Tage)** | `/opt/muhen-ca/epson_printer.pfx` | End-Entity Server-Zertifikat für `192.168.68.200`. Wird in den Epson-Drucker importiert. |

> [!IMPORTANT]
> **Riesiger Wartungsvorteil:** Da die Root CA 10 Jahre gültig ist und bereits im Truststore der iPads liegt, muss bei der jährlichen Erneuerung des Serverzertifikats **kein neues Profil auf den iPads installiert werden**! Sobald das neue Serverzertifikat auf dem Drucker aktiv ist, vertrauen alle iPads dem Drucker sofort wieder nahtlos.

#### 5.6.3 Technische OpenSSL-Parameter & Epson Firmware Kompatibilität
Die Epson TM-T20II Firmware benötigt für den PKCS#12-Import Legacy-Verschlüsselungsalgorithmen (3DES/RC2-40 via PKCS#12 PBES1). OpenSSL 3 nutzt standardmässig PBES2/AES-256, was von älteren Epson-Geräten abgelehnt wird. Der Export muss daher zwingend mit dem `-legacy`-Flag erfolgen:
```bash
openssl pkcs12 -export -out epson_printer.pfx \
  -inkey server.key -in server.crt -certfile ca.crt \
  -passout pass:epson -legacy
```

#### 5.6.4 Apple Konfigurationsprofil (`.mobileconfig`)
Für die nahtlose iPad-Installation wird die Root CA in ein standardisiertes Apple-Konfigurationsprofil mit `PayloadType = com.apple.security.root` verpackt (`Sportschuetzen-Festkasse-CA.mobileconfig`). Dadurch erkennt iPadOS die CA beim Öffnen per AirDrop oder Download sofort als Profil und leitet direkt zur Installation in die iOS-Einstellungen.

#### 5.6.5 Automatisches Monitoring & 30-Tage Ablaufwarnung
* **Single Source of Truth (`system_app_configs`):** Unter dem Schlüssel `festkasse_printer_cert` werden `valid_from`, `valid_to`, `days_remaining`, `issuer` und `printer_ip` in Supabase PostgreSQL vorgehalten.
* **Täglicher CT 117 Cronjob (03:00 Uhr):** Das Skript `/opt/muhen-ca/check-printer-cert.sh` fragt den Drucker im lokalen LAN via OpenSSL TLS-Handshake ab, berechnet die Resttage und aktualisiert die Datenbank.
* **Vorstandsportal Cockpit (`vorstand/js/festkasse.js`):**
  - Zeigt Live-Status (`🟢 Gültig bis DD.MM.YYYY (noch X Tage)`).
  - Warnt bei $\le 30$ Tagen automatisch mit auffälligem gelbem Banner (`⚠️ Läuft in X Tagen ab – Erneuerung vor dem nächsten Festanlass empfohlen`).
  - Warnt bei Ablauf mit rotem Alarm (`🚨 Abgelaufen! HTTPS-Druckaufträge blockiert`).
  - Bietet Buttons für «Status prüfen» (Live-TCP-Check via Edge Function) und «Anleitung Erneuerung» (Modal mit Schritt-für-Schritt-Anleitung).
* **Festkasse PWA (`kasse/kasse.js` & IndexedDB):**
  - Synchronisiert die Zertifikatsdaten in den lokalen IndexedDB-Speicher `FestkasseDB`.
  - Zeigt im Einstellungs-Menü unter «🌐 Direkter ePOS-Print» den Zertifikatsstatus und bietet den Info-Button «ℹ️ Erneuerung».
  - Wirft beim Start der Kasse automatisch einen Warn-Toast, falls das Zertifikat in $\le 30$ Tagen abläuft.

#### 5.6.6 Schritt-für-Schritt-Anleitung zur Erneuerung (bei Ablauf)
1. **Schritt 1 (CT 117):** Erneuerungsskript aufrufen:
   ```bash
   ssh root@192.168.68.117 "/opt/muhen-ca/renew-printer-cert.sh"
   ```
2. **Schritt 2 (Download):** Die erzeugte Datei auf den PC kopieren:
   ```bash
   scp root@192.168.68.117:/opt/muhen-ca/epson_printer.pfx ~/Downloads/
   ```
3. **Schritt 3 (Drucker-Import):**
   - Im Browser auf `https://192.168.68.200` einloggen.
   - Menü `Authentication` $\rightarrow$ `Certificate Import` $\rightarrow$ `Password Protected PKCS#12 Certificate` wählen $\rightarrow$ `epson_printer.pfx` auswählen, Passwort `epson` eingeben $\rightarrow$ `Import`.
   - Menü `Security` $\rightarrow$ `SSL/TLS` $\rightarrow$ `Server Certificate` auf `CA-Signed Certificate 1` einstellen $\rightarrow$ `Send`.
   - Menü `Optional` $\rightarrow$ `Reset` anklicken (oder Drucker kurz ausschalten).
4. **Schritt 4:** Auf den iPads/iPhones ist keine Änderung erforderlich. Testdruck in der Festkasse ausführen.

---

## 5.7 Sortiments-, Preis- & Depot-Steuerung via «Anlässe & Controlling»

### 5.7.1 Single Source of Truth im Mengenrechner (`event_items`)
Die Artikel und Verkaufspreise der Festkasse stammen nicht mehr aus statischen Hardcode-Werten, sondern werden direkt aus dem im Modul **«Anlässe & Controlling»** (`vorstand/js/anlaesse.js`) hinterlegten Mengenrechner bezogen:
* **Tabelle `public.event_items`:** Enthält Artikelname, Sparte (`Grill`, `Getränke`, `Bar`, `Depot`, `Festwirtschaft`), Einkaufspreis (`cost_price`), **Verkaufspreis (`sales_price`)** und optionales **Depot-Pfand (`depot_amount`)**.
* **Aktiver Kassen-Anlass (`system_app_configs`):** Der Schlüssel `active_festkasse_event_id` steuert zentral, welcher Vereinsanlass (z.B. *«1.-August-Feier 2026»*) für alle Kassen-iPads und Handheld-iPhones aktiv geschaltet ist.

### 5.7.2 Vollständige Depot- & Kaution-Verwaltung
Jeder Anlass steuert seine Pfandregeln individuell:
* **Kategorie `Depot`:** Wird im Mengenrechner ein Artikel mit Kategorie `Depot` angelegt (z.B. *«Depot Becher / Glas»* mit VK CHF 2.00 oder *«Depot Geschirr / Teller»* mit VK CHF 5.00), erzeugt die Festkasse automatisch:
  1. Grüne Plus-Kachel: `+ Depot [Name]` (+ CHF 2.00)
  2. Rote/Blaue Minus-Kachel: `− Rückgabe [Name]` (− CHF 2.00)
* **Automatischer Becherpfand-Vorschlag (`depot_amount`):** Bei Getränken (z.B. Offenausschank-Bier) kann ein Pfandbetrag hinterlegt werden. Beim Antippen des Artikels legt die Kasse und das Kellner-iPhone das passende Becherdepot automatisch in den Warenkorb.
* **Kein Depot bei kleinen Anlässen:** Enthält ein Anlass keine Depot-Artikel im Mengenrechner, blendet die Festkasse die Depot-Warengruppe komplett aus.

### 5.7.3 Synchronisation & 100% Offline-Schutz
* **Automatischer Abgleich:** Beim Start prüft die Festkasse online, ob ein neuer Anlass geschaltet wurde, transformiert die Artikel und speichert sie in die lokale `FestkasseDB` (Stores `products` und `categories`).
* **Manueller Abgleich:** Im Einstellungsdialog (`⚙️`) kann das Sortiment jederzeit über «🔄 Sortiment abgleichen» aktualisiert werden.
* **Netzausfall-Sicherheit:** Im Festzelt läuft die Kasse vollkommen unabhängig von Internet oder Server – alle Artikel, Preise und Pfandregeln verbleiben stabil im lokalen IndexedDB-Speicher.

---

## 5.8 TWINT PayLink & RaiseNow Hub Integration (`twint-payment-modal` & `test-twint.html`)
* **Touchpoint-Lösung (Sportschützen Muhen):** Nutzung der aktiven RaiseNow Hub Touchpoint-Lösung `cctmv` (`solution_type: twint_qr_simple`).
* **Parameter-Kontrakt für dynamische Beträge:** Bei kompatiblen Touchpoints (z.B. `pay_plus`, `twint_qr_payments`) werden Beträge in CHF übergeben (`amount.values=14.50&amount.custom=0`), optional ergänzt um die Bestellnummer (`custom_reference=BON-01`). Beim Typ `twint_qr_simple` ignoriert RaiseNow URL-Beträge; hier lässt sich der Betrag direkt im eingebetteten Tamaro-Widget per `paymentForm.setAmount(amountChf)` programmatisch setzen.
* **Integrierter 1-Klick-Turbo im TWINT-Zahlungsmodal (Kasse & Kellner-iPhone):** Beim Antippen von `[📱 TWINT]` öffnen `#twint-payment-modal` bzw. `#kellner-twint-modal` direkt das RaiseNow-Tamaro-Widget per **1-Klick-Turbo**: Die Touchpoint-Konfiguration wird beim Laden der Kasse im RAM vorwärm-gecached, das Widget setzt den Bon-Betrag im Digital-Terminal-Modus (`terminal_mode=true`) und löst «Einkassieren» automatisch aus, sodass sofort der native, von der TWINT-App scannbare QR-Code erscheint. Über den `events.paymentComplete`-Listener verbucht die Kasse automatisch bei Zahlungserfolg und stösst den ePOS-Bondruck an; `cleanupTamaroUrl()` bereinigt anschliessend den von Tamaro gesetzten URL-Hash (`#/tamaro/...`) rückstandsfrei, während `[✓ Bereits bezahlt / Manuell]` als Offline-/Notfall-Fallback bestehen bleibt.
* **Sanfter Offline-Druckerschutz:** Ist der Epson-LAN-Drucker `192.168.68.200` (z.B. beim Vorab-Testen daheim) nicht erreichbar, bricht die Festkasse nicht mit einem blockierenden Fehler ab, sondern verbucht die Zahlung verlässlich in IndexedDB und informiert den Bediener transparent per Toast-Meldung.
* **Test- & Diagnose-Cockpit:** Unter `kasse/test-twint.html` steht ein interaktives Test-Cockpit zur Verfügung, das denselben **1-Klick-Turbo** (Pre-Warming der Tamaro-Konfiguration im RAM + automatisches Auslösen von «Einkassieren» + `events.paymentComplete`-Listener), Iframe-Einbettung, QR-Code-Grossansicht, `window.postMessage`-Monitoring und die direkte Auslösung des Epson ePOS-Bondrucks (`192.168.68.200`) vereint.
