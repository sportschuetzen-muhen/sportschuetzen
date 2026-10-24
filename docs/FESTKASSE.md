# Fachdokumentation: Festkasse (WaiterOne POS)

> **Status:** PRODUKTIV (Lokal-autarke PWA / Standalone)  
> **Stand:** Oktober 2026  
> **URL:** `https://sps-b55.pages.dev/kasse/`  
> **Komponenten:** `kasse/index.html`, `kasse/kasse.js`, `kasse/abschluss.js`, `kasse/kellner.js`, `kasse/db.js`, `kasse/sw.js`  
> **Architektur:** 100% Offline-First via IndexedDB (`FestkasseDB`) & Service Worker. Keine dauerhafte Abhängigkeit zu Cloud, GAS oder Internet.

---

## 1. Übersicht & Zielsetzung

Die **Festkasse** ist eine eigenständige Progressive Web App (PWA) für das Schützenhaus, Festzelte und Vereinsanlässe der Sportschützen Muhen. Sie wurde entwickelt, um auch bei völligem Netzausfall im Festzelt eine blitzschnelle, intuitive Kassenführung zu gewährleisten:

* **WaiterOne-Bedienlayout (iPad-optimiert):** Horizontale Kategorien-Pills, Produktkacheln mit grossen Touch-Zielen ($\ge 52\text{px}$), rechter Bon-Bereich mit Mengen-Steppern und Schweizer Notenrechner (10, 20, 50, 100, 200 CHF) mit automatischer Rückgeldanzeige.
* **Kassensturz & Z-Abschluss:** Interaktives Münzen- und Noten-Zählprotokoll (5 Rappen bis 1000 Fr), Soll/Ist-Vergleich mit Diskrepanz-Berechnung, Barauslagen-Erfassung und Z-Bericht-Quittung (80mm Thermo-Druck).
* **Multi-Device Kellneransicht:** Handheld-Modus für Smartphones (iPhone) zur Tischerfassung mit Übermittlung an die Hauptkasse.
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
