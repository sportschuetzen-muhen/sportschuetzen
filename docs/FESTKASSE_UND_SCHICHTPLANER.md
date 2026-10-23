# Fachdokumentation: Festkasse & Aplano Schichtplaner (POS)

> **Status:** PRODUKTIV (Lokal-autarke PWA / Standalone)  
> **Stand:** Oktober 2026  
> **Komponenten:** `kasse/index.html`, `kasse/kasse.js`, `kasse/schichtplan.js`, `kasse/abschluss.js`, `kasse/kellner.js`, `kasse/db.js`, `kasse/sw.js`  
> **Architektur:** 100% Offline-First via IndexedDB (`FestkasseDB`) & Service Worker. Keine Abhängigkeit zu Cloud, GAS oder dauerhafter Internetverbindung.

---

## 1. Übersicht & Zielsetzung

Die **Festkasse** ist eine eigenständige Progressive Web App (PWA) für das Schützenhaus, Festzelte und Vereinsanlässe der Sportschützen Muhen. Sie wurde entwickelt, um auch bei völligem Netzausfall im Festzelt eine blitzschnelle, intuitive Kassenführung zu gewährleisten:

* **WaiterOne-Bedienlayout (iPad-optimiert):** Horizontale Kategorien-Pills, Produktkacheln mit Touch-Zielen $\ge 52\text{px}$, rechter Bon-Bereich mit Mengen-Steppern und Schweizer Notenrechner (10, 20, 50, 100, 200 CHF) mit automatischer Rückgeldanzeige.
* **Schichtplaner nach Vorbild von [Aplano](https://www.aplano.de):** Visuelle Timeline-Matrix gegliedert nach Stationen (Kasse 1, Kasse 2, Grill, Ausschank, Bar, Service, Springer) und Schichten (Früh, Nachmittag, Abend). Farbkodierte Besetzungsstatus (`● 2/2 Voll`, `● 1/2 Teilweise`, `● 0/1 Offen`) und 1-Klick-Übernahme als aktiver Kassenbediener.
* **Kassensturz & Z-Abschluss (Phase 2):** Interaktives Münzen- und Noten-Zählprotokoll (5 Rappen bis 1000 Fr), Soll/Ist-Vergleich mit Diskrepanz-Berechnung, Barauslagen-Erfassung und Z-Bericht-Quittung (80mm Thermo-Druck).
* **Multi-Device Kellneransicht (Phase 3):** Schlanker Handheld-Modus für Smartphones (iPhone) zur Tischerfassung mit drahtloser Offline-Übermittlung via `BroadcastChannel`.

---

## 2. Lokales Datenmodell (`FestkasseDB` via IndexedDB)

| Object Store | KeyPath | Indizes | Zweck & Invarianten |
| :--- | :--- | :--- | :--- |
| `categories` | `id` | `sortOrder` | Warengruppen (Alkoholfrei, Bier/Wein, Grill, Kaffee/Dessert, Bar, Depot). |
| `products` | `id` | `categoryId`, `name` | Artikelstamm mit Preisen in CHF, Einheiten, Icons und automatischem Pfandbetrag. |
| `orders` | `id` | `timestamp`, `status`, `orderNumber` | Abgeschlossene Bons mit Positionen, Zahlart (Bar/Twint), erhaltenem Bargeld und Rückgeld. |
| `cashMovements`| `id` | `timestamp`, `type` | Bargeldbewegungen: Einlagen (Wechselgeld) und Barauslagen (Not-Einkauf Senf/Brot). |
| `stations` | `id` | – | Aplano-Bereiche (Kasse, Grill, Ausschank, Bar, Service, Springer). |
| `shifts` | `id` | `stationId`, `date` | Schichten mit Soll-Helfern und zugewiesenen Helfern (Name, Telefon, Rolle). |
| `zReports` | `id` | `timestamp` | Revisionssichere Z-Kassenabschlüsse mit Zählsummen, SOLL/IST-Vergleich und Differenz. |
| `settings` | `key` | – | Lokale Konfiguration (Event-Titel, aktiver Kassier, Station, Wechselgeld). |

---

## 3. Die 4 Kern-Module im Überblick

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FESTKASSE SPORTSCHÜTZEN MUHEN                         │
│               (/kasse/index.html + IndexedDB + Service Worker)                  │
├─────────────────┬───────────────────┬───────────────────┬───────────────────────┤
│ 🛒 KASSE        │ 📅 SCHICHTPLAN    │ 📊 KASSENSTURZ    │ 📱 KELLNER (IPHONE)   │
│ - WaiterOne POS │ - Aplano-Timeline │ - Münzzähler CH   │ - Tische 1–30         │
│ - Kategorien    │ - Stationen/Slots │ - Notenzähler CH  │ - Handheld-Bestellung │
│ - Artikel-Grid  │ - Status Voll/Off │ - SOLL vs. IST    │ - Broadcast-Sync      │
│ - Bon / Stepper │ - Helfer-Avatar   │ - Barauslagen     │ - Live-Bon Übergabe   │
│ - BAR / TWINT   │ - Kassenübernahme │ - Z-Abschluss-Bon │                       │
└─────────────────┴───────────────────┴───────────────────┴───────────────────────┘
```

### 3.1 Kassenoberfläche (`kasse/kasse.js`)
* **Schweizer Notenrechner:** Schnelltasten für Exakt, 10 Fr, 20 Fr, 50 Fr, 100 Fr berechnen live das Rückgeld an den Kunden.
* **Depot-Automatik:** Beim Hinzufügen von Offenausschank (z.B. Bier 0.5l) wird automatisch das Glasdepot (+CHF 2.00) im Bon ergänzt.
* **TWINT-Direktabschluss:** 1-Klick-Zahlung für bargeldlose Festbesucher.
* **80mm Bon-Druck:** Druckdialog formatiert Belege im Standard-Thermobon-Format mit Kopfzeile, Artikelliste, MwSt-/Zahlart-Ausweis und Schützen-Gruss.

### 3.2 Aplano-Schichtplaner (`kasse/schichtplan.js`)
* **Matrix-Layout:** Stationen bilden die Zeilen, Zeitfenster (Früh, Nachmittag, Abend) die Spalten.
* **Visuelle Besetzungsindikatoren:**
  - 🟢 **Voll:** Alle benötigten Helfer eingeteilt.
  - 🟡 **Teilweise:** Noch mind. 1 Helfer gesucht.
  - 🔴 **Offen:** Noch kein Helfer vorhanden.
* **Kassenbediener-Kopplung:** Ein Klick auf *«👤 Als Bediener übernehmen»* an einer Kassen-Schicht aktualisiert den Namen im Kassen-Header und weist alle folgenden Bons diesem Helfer zu.

### 3.3 Kassensturz & Z-Bericht (`kasse/abschluss.js`)
* **Stückelungs-Zähltabelle:** Unterstützt alle Schweizer Währungseinheiten (5 Rp, 10 Rp, 20 Rp, 50 Rp, 1 Fr, 2 Fr, 5 Fr, 10er, 20er, 50er, 100er, 200er, 1000er Noten).
* **SOLL/IST-Vergleich:** $\text{SOLL} = \text{Anfangsbestand} + \text{Bar-Umsatz} - \text{Barauslagen}$.
* **Z-Bericht:** Erzeugt eine fortlaufende Z-Nummer (z.B. `Z-202610231940`) und sperrt die Periode revisionssicher ab.

### 3.4 Kellner-Handheld (`kasse/kellner.js`)
* **Lokaler BroadcastChannel (`festkasse_channel`):** Smartphones und iPads im selben Browser/WLAN synchronisieren Bestellungen in Echtzeit ohne Internetverbindung.
* **Akustischer & Haptischer Alarm:** Geht an der Hauptkasse eine Bestellung vom Tisch ein, vibriert das iPad und spielt einen dezenten Doppelton ab.

---

## 4. Berechtigungen & Governance

* **Rollen & RBAC:**
  - Kasse und Schichtplan können autark vor Ort ohne Vorstands-Login bedient werden.
  - Im Vorstandsportal wird das Modul unter `kasse.view` und `kasse.manage` geführt.
* **Projekt-Richtlinie 1 & 2:** Keine Google Apps Script Fallbacks, keine Google Sheets.
* **Projekt-Richtlinie 8:** Durchgehende Du-Form in allen Hinweistexten, Quittungen und Dialogen.
