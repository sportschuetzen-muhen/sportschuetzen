# Fachdokumentation: Festkasse (WaiterOne POS)

> **Status:** PRODUKTIV (Lokal-autarke PWA / Standalone)  
> **Stand:** November 2026  
> **URL:** `https://sps-b55.pages.dev/kasse/`  
> **Komponenten:** `kasse/index.html`, `kasse/kasse.js`, `kasse/epos-print.js`, `kasse/abschluss.js`, `kasse/kellner.js`, `kasse/db.js`, `kasse/sw.js`  
> **Architektur:** 100% Offline-First via IndexedDB (`FestkasseDB`) & Service Worker (`festkasse-v3`). Direktansteuerung von Epson LAN-Bondruckern via ePOS-Print (XML/HTTP). Keine dauerhafte Abhängigkeit zu Cloud, GAS oder Internet.

---

## 1. Übersicht & Zielsetzung

Die **Festkasse** ist eine eigenständige Progressive Web App (PWA) für das Schützenhaus, Festzelte und Vereinsanlässe der Sportschützen Muhen. Sie wurde entwickelt, um auch bei völligem Netzausfall im Festzelt eine blitzschnelle, intuitive Kassenführung zu gewährleisten:

* **WaiterOne-Bedienlayout (iPad- & iPhone-optimiert):** Horizontale Kategorien-Pills, adaptive Produktkacheln mit grossen Touch-Zielen ($\ge 52\text{px}$), flexibler Bon-Bereich im Hoch- und Querformat sowie Schweizer Notenrechner (10, 20, 50, 100, 200 CHF) mit automatischer Rückgeldanzeige.
* **Kassensturz & Z-Abschluss:** Interaktives Münzen- und Noten-Zählprotokoll (5 Rappen bis 1000 Fr), Soll/Ist-Vergleich mit Diskrepanz-Berechnung, Barauslagen-Erfassung und Z-Bericht-Quittung (80mm Thermo-Druck).
* **Multi-Device Kellneransicht & Sofortdruck:** Nativer Fullscreen-Handheld-Modus für Smartphones (iPhone) zur blitzschnellen Tischerfassung. Bei Klick auf «Bestellung senden» wird der Bon (Küchen- und Gastbeleg mit Tischnummer) sofort physisch auf dem Bondrucker ausgeworfen und in der lokalen DB verbucht.
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
* **Multi-Treiber-Modell (Schützenhaus vs. Autarkes Festzelt):**
  - **Treiber 1: ⚡ LAN-Gateway (CT 117 / Supabase Edge Function):** Standard im Vereinsheim/Schützenhaus. Druckaufträge werden als JSON an die Edge Function `pos-print` gesendet, welche rohe ESC/POS-Binärbefehle über TCP-Port 9100 an den Drucker streamt. Dies erlaubt nahtlosen Hintergrunddruck ohne jeden App-Wechsel auf dem iPad, PC oder Android-Gerät.
  - **Treiber 2: 🌐 Direkter ePOS-Print (100% ohne Supabase / rein Browser):** Autarke Direktanbindung des Epson ePOS-Print Webservers via Port 80 (HTTP) oder 443 (HTTPS). Der Browser sendet standardisiertes SOAP/XML direkt an `http://<ip>/cgi-bin/epos/service.cgi`. Ideal für den autarken Festbetrieb über lokalen HTTP-Webserver ohne jede Server- oder Cloud-Abhängigkeit.
  - **Treiber 3: 📱 Epson TM Print Assistant (Offizielle iPadOS-App):** Weiterleitung via URI-Scheme `tmprintassistant://x-callback-url/print?ver=1...`.
  - **Treiber 4: 📄 Browser-Druckdialog (AirPrint):** Fallback via nativer Druckausgabe.

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
