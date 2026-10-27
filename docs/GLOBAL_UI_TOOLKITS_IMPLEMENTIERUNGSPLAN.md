# Implementierungsplan: Globale UI-Toolkits & System-Harmonisierung

> **Status:** PRODUKTIV VOLLSTÄNDIG UMGESETZT (Alle 6 Phasen verifiziert)  
> **Stand:** 27. Oktober 2026  
> **Gültigkeit:** Verbindlicher Leitfaden für die globalen Toolkits im Vorstandscockpit (`vorstand/js/`)  
> **Referenz:** [`docs/SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md`](SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md)  

---

## 1. Zielsetzung & Architektur-Prinzip

Nach der erfolgreichen flächendeckenden Einführung von **`TableKit`** (Tabellen) und **`UIModalKit`** (Verschieben, Resizen, Vollbild für alle 80 Modale) werden die verbleibenden Querschnittsfunktionen des Vereinsportals schrittweise in globale, modulare Services überführt. 

Ziel ist es:
1. **Native blockierende Browser-Popups (`confirm`, `alert`) restlos abzulösen.**
2. **Formatierungen (Schweizer Franken CHF, Datum, Uhrzeit, IBAN) einheitlich aus einer Single Source of Truth bereitzustellen.**
3. **Einfrierende Buttons bei Netzwerkfehlern und versehentliche Doppelbuchungen (`Double-Submit`) dauerhaft zu verhindern.**
4. **Redundanten SheetJS-Exportcode in 7 Fachmodulen durch einen zentralen Export-Service zu ersetzen.**
5. **Ergonomische Desktop-Shortcuts (`Strg+S`, `Escape`, `Strg+K`) einzuführen.**
6. **Verbindungsverlust (Offline-Banner) und Session-Timeouts frühzeitig abzufangen.**

---

## 2. Die 6 Phasen im Überblick

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        6 PHASEN DER GLOBALEN UI-HARMONISIERUNG                         │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ Phase 1: UIConfirmKit    │ Phase 2: UIFormatKit        │ Phase 3: UIButtonKit          │
│ • Asynchrones Confirm    │ • Währung (CHF 1'234.50)    │ • withLoading(btn, asyncFn)   │
│ • Rich-Text & Semantik   │ • Datum (CH DD.MM.YYYY)     │ • Auto-Reset in finally       │
│ • Danger/Warning/Success │ • IBAN & Telefon-Format     │ • Double-Submit Schutz        │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ Phase 4: UIExportKit     │ Phase 5: UIHotkeyKit        │ Phase 6: UIConnectivityKit    │
│ • Table-to-Excel (XLSX)  │ • Strg+S (Speichern)        │ • Offline-Erkennung (Banner)  │
│ • Array-to-Excel & CSV   │ • Escape (Hierarchie-Close) │ • Token-Heartbeat & Refresh   │
│ • Auto-Fit Spaltenbreite │ • Strg+K / / (Suchfeld)     │ • Schutz langer Formulare     │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 3. Detaillierte Spezifikation der Toolkits

### Phase 1: `UIConfirmKit` (Asynchrone Bestätigungs- & Alert-Modale)
* **Datei:** [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js)
* **Schnittstelle (API):**
  ```javascript
  // 1. Bestätigungs-Dialog (liefert Promise<boolean>):
  const ok = await UIConfirmKit.confirm({
    title: 'Rechnung stornieren?',
    message: 'Möchtest du Rechnung <strong>RE-2026-0042</strong> wirklich stornieren? Der offene Saldo wird auf 0 gesetzt.',
    type: 'danger',           // 'danger' (Rot) | 'warning' (Gelb) | 'primary' (Blau)
    confirmText: 'Stornieren', // Standard: 'Bestätigen'
    cancelText: 'Abbrechen'    // Standard: 'Abbrechen'
  });
  if (!ok) return;

  // 2. Info-/Warnhinweis (liefert Promise<void>):
  await UIConfirmKit.alert({
    title: 'Aktion nicht möglich',
    message: 'Diese Rechnung wurde bereits versendet und kann nicht mehr gelöscht werden.',
    type: 'warning'
  });
  ```
* **Eigenschaften:**
  - Erzeugt automatisch ein sauberes, elegantes Bootstrap-5-Modal im DOM (oder nutzt ein wiederverwendbares Singleton `#ui-confirm-modal`).
  - Schliesst per `Escape` (ergibt `false`) oder Klick auf Abbrechen.
  - Verhindert das Einfrieren des Browser-Threads.
  - Globale Hilfsfunktion: `window.confirmAsync = UIConfirmKit.confirm`.

---

### Phase 2: `UIFormatKit` (Schweizer Standard-Formatierungen)
* **Datei:** [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js)
* **Schnittstelle (API):**
  ```javascript
  // Währung nach Schweizer Norm:
  UIFormat.money(1234.5);            // "CHF 1'234.50"
  UIFormat.money(1234.5, { symbol: false }); // "1'234.50"
  UIFormat.money(-50);               // "- CHF 50.00"

  // Schweizer Datum & Zeit:
  UIFormat.date('2026-10-27');       // "27.10.2026"
  UIFormat.dateTime('2026-10-27T14:30:00Z'); // "27.10.2026, 16:30"
  UIFormat.time('14:30:00');         // "14:30"

  // Strukturierte Daten:
  UIFormat.iban('CH9300762011623852957'); // "CH93 0076 2011 6238 5295 7"
  UIFormat.phone('0791234567');           // "+41 79 123 45 67"
  ```
* **Eigenschaften:**
  - Löst die bisher redundanten Einzelfunktionen `formatCHF`, `formatChfNum`, `formatMoney`, `rnFormatMoney` und `formatSwissDate` ab.
  - Sichere Behandlung von `null`, `undefined` und ungültigen Eingaben (`"-"` als Fallback).

---

### Phase 3: `UIButtonKit` (Lifecycle, Spinner & Double-Submit Guard)
* **Datei:** [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js)
* **Schnittstelle (API):**
  ```javascript
  // Asynchrone Aktion mit automatischem Ladezustand umschliessen:
  await UIButtonKit.withLoading(buttonElement, async () => {
    await RechnungsCore.recordPayment(invoiceId, paymentData);
  }, {
    loadingText: 'Buche Zahlung...',
    successText: 'Gebucht! ✅', // optional für 1.5s
    disabled: true
  });
  ```
* **Eigenschaften:**
  - Speichert `btn.innerHTML` und `btn.disabled` vor Beginn.
  - Setzt einen feinen Spinner (`spinner-border spinner-border-sm`) und deaktiviert den Button gegen Mehrfachklicks (`Double-Submit`).
  - Stellt im `finally`-Block den Originalzustand **ausnahmslos und fehlersicher** wieder her, selbst wenn die Supabase-Query fehlschlägt.

---

### Phase 4: `UIExportKit` (Zentraler SheetJS Excel- & CSV-Service)
* **Datei:** [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js)
* **Schnittstelle (API):**
  ```javascript
  // 1. Direkt aus einer gerenderten HTML-Tabelle exportieren:
  UIExportKit.tableToExcel('#mgl-table', {
    filename: 'Mitgliederliste',
    sheetName: 'Mitglieder',
    excludeHiddenColumns: true // beachtet automatisch TableKit-Ausblendungen!
  });

  // 2. Aus Rohdaten (Array von Objekten):
  UIExportKit.dataToExcel(dataArray, {
    filename: 'Jahresbeitraege_2026',
    sheetName: 'Uebersicht',
    headers: { person_number: 'Mitglied-Nr', name: 'Name', gesamt: 'Beitrag CHF' },
    columnWidths: [15, 25, 15]
  });
  ```
* **Eigenschaften:**
  - Hängt automatisch den aktuellen Tagesstempel an (`_YYYY-MM-DD.xlsx`).
  - Formatiert Spaltenköpfe mit sauberem Styling (Hintergrund, Fettschrift).
  - Bereinigt Zeilenumbrüche und HTML-Tags aus Tabellenzellen.

---

### Phase 5: `UIHotkeyKit` (Globale Tastatur-Ergonomie)
* **Datei:** [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js)
* **Funktionsweise:**
  - **`Strg + S` / `Cmd + S`:** Verhindert das Browser-Popup *„Seite speichern unter...“*. Wenn ein Modal geöffnet ist, wird dessen primärer Submit-Button ausgelöst; ist kein Modal offen, wird der aktive `SaveButtonKit`-Button des Moduls getriggert.
  - **`Escape`:** Schliesst hierarchisch zuerst das oberste Modal, dann offene Dropdowns oder leert aktive Filter.
  - **`Strg + K` oder `/`:** Setzt den Fokus direkt in das Suchfeld der aktuellen Tabelle/Kachel.

---

### Phase 6: `UIConnectivityKit` (Offline- & Session-Heartbeat)
* **Datei:** [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js)
* **Funktionsweise:**
  - Überwacht `window.addEventListener('online')` und `'offline'`.
  - Zeigt am oberen Bildschirmrand ein sanftes Infobanner bei Verbindungsunterbruch: *«⚠️ Offline: Keine Verbindung zum Server. Bitte keine Seiten neu laden.»*
  - Auth-Heartbeat: Prüft periodisch die Gültigkeit des Supabase-JWTs und erneuert die Session im Hintergrund, damit Admins beim Ausfüllen langer Rechnungen oder Protokolle nicht unverhofft ausgeloggt werden.

---

## 4. Umsetzungsempfehlung & Schrittfolge

Zur Einhaltung von Stabilität, Reviewbarkeit und Projekt-Richtlinien wird die Umsetzung in **drei überschaubare Pakete** unterteilt:

1. **Paket A (Fundament & Dialoge):** ✅ **ABGESCHLOSSEN & VERIFIZIERT**
   - Implementierung von `UIConfirmKit` & `UIFormatKit` in `vorstand/js/ui-table-kit.js`.
   - Asynchroner Modal-Confirm (`Promise<boolean>`) und Alert (`Promise<void>`) mit Danger/Warning/Primary/Success Semantik.
   - Schweizer Währungs-, Datums- (ohne UTC-Shift), Zeit-, IBAN- und Telefonformatierung inklusive Browser- und Node-E2E-Tests.
   - Globale Verfügbarkeit über `window.UIConfirmKit`, `window.confirmAsync`, `window.alertAsync`, `window.UIFormat` und `TableKit.Format`.
2. **Paket B (Interaktion & Export):** ✅ **ABGESCHLOSSEN & VERIFIZIERT**
   - Implementierung von `UIButtonKit` & `UIExportKit` in `vorstand/js/ui-table-kit.js`.
   - `UIButtonKit.withLoading`: Double-Submit Schutz, Spinner-Injektion und garantierter Originalzustand-Reset im `finally`-Block.
   - `UIExportKit`: Zentraler SheetJS Excel- (`tableToExcel`, `dataToExcel`) und CSV-Export (`dataToCsv`) mit Auto-Breiten (`!cols`), Datumssuffix und TableKit-Filterung.
   - Unit- und E2E-Tests im Browser erfolgreich bestanden.
3. **Paket C (Ergonomie & Stabilität):** ✅ **ABGESCHLOSSEN & VERIFIZIERT**
   - Implementierung von `UIHotkeyKit` & `UIConnectivityKit` in `vorstand/js/ui-table-kit.js`.
   - `UIHotkeyKit`: `Strg+S` Speichern-Guard (Modal-Submit oder Sektions-Speichern mit dezentem Feedback), `Escape` Hierarchie-Schliessen (Modal, Dropdown, Suchfilter-Reset), `/` oder `Strg+K` Direktfokus ins Suchfeld.
   - `UIConnectivityKit`: Fixes Offline-Warnbanner am oberen Bildschirmrand (`#ui-connectivity-banner`), sanftes Online-Feedback und automatischer transparenter Auth-Token Heartbeat für Supabase-Sessions.
   - Unit- und E2E-Tests im Browser erfolgreich bestanden.

---

## 5. Synchronisations- & Deployment-Pflicht (Projekt-Richtlinie 5)
Nach jedem Paket:
1. Smoke-Test im Browser.
2. Dokumentations-Aktualisierung in [`docs/SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md`](SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md).
3. Commit & Push auf GitHub (`git push origin migration-supabase`).
