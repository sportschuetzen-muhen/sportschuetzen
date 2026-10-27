# KI- & Entwickler-Leitfaden: Globale UI-Toolkits & Modul-Harmonisierung

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Verbindliche Systemregel:** 👉 [`AGENTS.md (Regel 9)`](../AGENTS.md)  
> **Globale Implementierung:** 👉 [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js)  
> **Master-Plan:** 👉 [`docs/GLOBAL_UI_TOOLKITS_IMPLEMENTIERUNGSPLAN.md`](GLOBAL_UI_TOOLKITS_IMPLEMENTIERUNGSPLAN.md)  
> **Architektur-Spezifikation:** 👉 [`docs/SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md`](SYSTEM_HARMONISIERUNG_UND_RECHNUNGSWESEN.md)

---

## 1. Zweck & Verbindlichkeit

Dieses Dokument dient als **verbindlicher Handlungsleitfaden für KI-Agenten und Entwickler**. Bei der Implementierung neuer Features, beim Refactoring bestehender Fachmodule oder beim Beheben von Fehlern im Vorstands- und Vereinsportal der **Sportschützen Muhen** müssen die nachfolgenden Standards **ausnahmslos und ohne gesonderte Aufforderung** angewendet werden.

### Die goldene Regel: Keine nativen Browser-Popups!
* ❌ **Verboten:** `window.alert(...)`, `alert(...)`, `window.confirm(...)`, `confirm(...)`
* ❌ **Verboten:** Manuelle String-Formatierungen wie `'CHF ' + num.toFixed(2)` oder fehleranfälliges `new Date('YYYY-MM-DD').toLocaleDateString()` (Zeitzonen-Verschiebung!).
* ❌ **Verboten:** Ungeblockte Buttons bei asynchronen Operationen (Gefahr von Double-Submits und Doppelbuchungen).
* ❌ **Verboten:** Distanzierte Sie-Form («Sie haben...», «Wählen Sie...») $\rightarrow$ Im gesamten Portal gilt verbindlich die **Du-Form** («du», «dein», «wähle aus», «trage ein»).

---

## 2. Die 6 UI-Toolkits im Detail (Code-Muster)

Alle Toolkits sind über die Datei [`vorstand/js/ui-table-kit.js`](../vorstand/js/ui-table-kit.js) global im Browser verfügbar.

### 2.1 `UIConfirmKit` – Asynchrone Dialoge & Alerts

Ersetzt blockierende Browser-Popups durch barrierefreie, zentrierte Bootstrap-Modale mit semantischen Akzenten und Tastatursteuerung (`Enter` = Bestätigen, `Escape` = Abbrechen).

#### A) Bestätigungsdialog (`Promise<boolean>`):
```javascript
// Typen: 'danger' (Rot/Löschen/Storno), 'warning' (Gelb/Achtung), 'primary' (Blau/Standard)
const ok = await UIConfirmKit.confirm({
  title: 'Reservation stornieren?',
  message: 'Möchtest du die Reservation 2026-04 wirklich stornieren? Dadurch wird der Termin im Kalender freigegeben.',
  confirmText: 'Ja, stornieren',
  cancelText: 'Abbrechen',
  type: 'danger'
});

if (!ok) return;
// Aktion ausführen...
```

#### B) Hinweis-/Fehlerdialog (`Promise<void>`):
```javascript
// Typen: 'danger' (Fehler), 'warning' (Pflichtfelder/Warnung), 'info'/'primary' (Hinweis)
await UIConfirmKit.alert({
  title: 'Fehler beim Speichern',
  message: 'Die Buchung konnte nicht in Supabase persistiert werden: ' + err.message,
  type: 'danger',
  confirmText: 'Verstanden'
});
```

#### C) Robuste Fallback-Syntax:
Bei Mutation von bestehendem Altwelt-Code empfiehlt sich folgende Übergangssyntax:
```javascript
if (window.UIConfirmKit) {
  const ok = await UIConfirmKit.confirm({ title: 'Titel', message: 'Nachricht...', type: 'warning' });
  if (!ok) return;
} else if (!confirm('Nachricht...')) {
  return;
}
```

---

### 2.2 `UIFormatKit` – Schweizer Standard-Formatierungen

Verhindert Rundungsdifferenzen, Zeitzonenversätze und unleserliche IBAN-/Telefonstrings.

```javascript
// 1. Währung (CHF mit Hochkomma als Tausendertrennzeichen):
UIFormatKit.formatCurrency(1234.5);        // ➔ "CHF 1'234.50"
UIFormatKit.formatCurrency(-50);           // ➔ "- CHF 50.00"
UIFormatKit.formatCurrency(100, { showCurrency: false }); // ➔ "100.00"

// 2. Datum (sicher gegen UTC-Shift durch direkten String-Split auf YYYY-MM-DD):
UIFormatKit.formatDate('2026-10-27');      // ➔ "27.10.2026"
UIFormatKit.formatDate('2026-10-27', { withDayOfWeek: true }); // ➔ "Di, 27.10.2026"

// 3. Uhrzeit:
UIFormatKit.formatTime('2026-10-27T14:30:00'); // ➔ "14:30"
UIFormatKit.formatTime('14:00');               // ➔ "14:00"

// 4. Datum & Uhrzeit kombiniert:
UIFormatKit.formatDateTime('2026-10-27T14:30:00'); // ➔ "27.10.2026, 14:30"

// 5. Schweizer IBAN (4er-Blöcke):
UIFormatKit.formatIban('CH9308739012345678901'); // ➔ "CH93 0873 9012 3456 7890 1"

// 6. Schweizer Telefonnummer:
UIFormatKit.formatPhone('0791234567');     // ➔ "079 123 45 67"
UIFormatKit.formatPhone('+41791234567');   // ➔ "+41 79 123 45 67"
```

*Alias:* Auch über `window.UIFormat` oder `TableKit.Format` aufrufbar.

---

### 2.3 `UIButtonKit` – Double-Submit Schutz & Loading-Feedback

Sichert asynchrone Klick-Events gegen Doppel-Klicks ab. Injiziert automatisch einen Spinner, deaktiviert den Button und garantiert die Rückstellung im `finally`-Block.

```javascript
// Button kann als DOM-Element oder Selector übergeben werden:
await UIButtonKit.withLoading('#btn-save-member', async () => {
  // 1. Asynchrone Mutation in Supabase
  const { data, error } = await supa.from('members').insert(payload);
  if (error) throw error;

  // 2. UI aktualisieren & Toast
  showToast('✅ Mitglied erfolgreich gespeichert!');
  modal.hide();
}, {
  loadingText: 'Speichere...', // Optional (Standard: Spinner + Originaltext)
  minDisplayTimeMs: 250        // Verhindert unruhiges Flackern bei extrem schnellen Requests
});
```

---

### 2.4 `UIExportKit` – SheetJS Excel- & CSV-Exporte

Standardisiert alle Tabellen- und Rohdatenexporte nach Excel (.xlsx) und CSV.

#### A) Tabelle direkt aus DOM exportieren (inkl. automatischem Filtern von Aktionsspalten):
```javascript
// Filtert automatisch .tk-col-hidden, Aktionsspalten ('aktionen', 'actions') und Checkboxes heraus
UIExportKit.exportTableToExcel('#vermietung-table', 'Vermietungen_Muhen.xlsx');
```

#### B) Beliebiges Rohdaten-Array exportieren:
```javascript
const daten = [
  { nr: 1, name: 'Muster Hans', status: 'Aktiv', betrag: 150 },
  { nr: 2, name: 'Beispiel Peter', status: 'Passiv', betrag: 60 }
];

const spalten = [
  { key: 'nr', label: 'Mitglied-Nr.', width: 15 },
  { key: 'name', label: 'Vollständiger Name', width: 30 },
  { key: 'status', label: 'Mitgliederstatus', width: 18 },
  { key: 'betrag', label: 'Jahresbeitrag CHF', width: 20 }
];

UIExportKit.dataToExcel(daten, spalten, 'Mitglieder_Muhen.xlsx');
```

---

### 2.5 `UIHotkeyKit` – Globale Tastatur-Ergonomie

Läuft im Hintergrund ohne manuellen Setup-Aufwand:
* **`Strg + S` / `Cmd + S` (Speichern-Guard):** Fängt das Standard-Browser-Druckmenü ab. Wenn ein Modal offen ist, löst es automatisch den primären Button aus (`.btn-primary`, `#*-save-btn`).
* **`Escape` (Hierarchie-Schliessen):** Schliesst der Reihe nach oberste Modale $\rightarrow$ offene Dropdowns $\rightarrow$ leert Suchfilter.
* **`Strg + K` oder `/` (Suche):** Setzt den Cursor direkt in das primäre Filterfeld der Kachel.

*Anforderung an KI beim Erstellen von Formularen:*  
Jedes Speicher-/Formular-Modal muss im Footer einen primären Button mit der Klasse `btn-primary` besitzen (idealerweise mit ID `id="...-save-btn"`), damit der `Strg+S`-Shortcut nahtlos greift.

---

### 2.6 `UIConnectivityKit` – Offline-Banner & JWT-Heartbeat

* **Offline-Banner:** Zeigt am oberen Bildschirmrand automatisch `#ui-connectivity-banner` bei Netzwerkunterbruch an, um Benutzer vor Datenverlust durch Neuladen zu schützen.
* **Auth-Token Heartbeat:** Prüft alle 10 Minuten im Hintergrund das Supabase-JWT und erneuert Sessions automatisch vor dem Ablauf.

---

## 3. Audit- & Bereinigungs-Checkliste für Fachmodule

Wenn eine KI den Auftrag erhält, ein Modul zu harmonisieren, ist folgende systematische **6-Schritte-Checkliste** abzuarbeiten:

### Schritt 1: Auffinden veralteter Browser-Popups
```powershell
Get-ChildItem -Path vorstand/js/<modul>/ -Filter *.js | Select-String -Pattern '\b(alert|confirm)\('
```

### Schritt 2: Dialoge ersetzen (`UIConfirmKit`)
* Jedes `confirm(...)` durch `await UIConfirmKit.confirm({ title, message, type, confirmText })` ersetzen.
* Jedes `alert(...)` durch `await UIConfirmKit.alert({ title, message, type })` ersetzen.
* Strikte Du-Form («du», «dein») sicherstellen.

### Schritt 3: Speicher- & Sende-Buttons schützen (`UIButtonKit`)
* Speicher-, Buchungs-, Batch- und Sende-Funktionen mit `await UIButtonKit.withLoading('#button-id', ...)` absichern.
* Falls der Button im HTML noch keine ID besitzt, eine eindeutige ID (z.B. `id="inv-btn-save"`) vergeben.

### Schritt 4: Beträge & Daten formatieren (`UIFormatKit`)
* Betragsanzeigen (`CHF ...`) mit `UIFormatKit.formatCurrency(betrag)` harmonisieren.
* Kalenderdaten (`YYYY-MM-DD`) mit `UIFormatKit.formatDate(datum)` formatieren.

### Schritt 5: Tabellen-Export ergänzen (`UIExportKit`)
* Im Header/Toolbar der Tabelle einen standardisierten Excel-Export-Button ergänzen:
  ```html
  <button class="btn btn-sm btn-outline-success py-1 fw-bold" onclick="UIExportKit.exportTableToExcel('#meine-tabelle', 'Dateiname.xlsx')" title="Tabelle nach Excel exportieren">
    <i class="fas fa-file-excel me-1"></i>Excel
  </button>
  ```

### Schritt 6: Validierung, Dokumentation & Git-Push (Projekt-Richtlinie 5)
1. **Syntax prüfen:**
   ```powershell
   node -c vorstand/js/<modul>/*.js
   ```
2. **Dokumentation aktualisieren:**
   Im entsprechenden Fachdokument in `docs/<MODUL>.md` einen 2–3-zeiligen Abschnitt zur UI-Harmonisierung ergänzen.
3. **Git Commit & Push:**
   ```powershell
   git add docs/ vorstand/js/<modul>/ ; git commit -m "feat(<modul>): integrate UIConfirmKit, UIButtonKit and UIFormatKit" ; git push origin migration-supabase
   ```

---

## 4. Status der Fachmodule

| Modul | Pfad | Status | Toolkits integriert |
| :--- | :--- | :---: | :--- |
| **Rechnungswesen** | `vorstand/js/rechnungen/` | ✅ Erledigt | `UIConfirmKit`, `UIButtonKit`, `TableKit`, `UIFormatKit` |
| **Jahresbeitrag** | `vorstand/js/jahresbeitrag/` | ✅ Erledigt | `UIConfirmKit`, `UIButtonKit`, `TableKit`, `UIFormatKit`, `UIExportKit` |
| **Vermietung** | `vorstand/js/vermietung/` | ✅ Erledigt | `UIConfirmKit`, `UIButtonKit`, `TableKit`, `UIFormatKit`, `UIExportKit` |
| **Inventar** | `vorstand/js/inventar/` | ⏳ Bereit für Audit | Bereit für Schritt 1–6 |
| **Mitglieder & SSV** | `vorstand/js/mitglieder/` | ⏳ Bereit für Audit | Bereit für Schritt 1–6 |
| **Termine & Schichten** | `vorstand/js/termine/` | ⏳ Bereit für Audit | Bereit für Schritt 1–6 |
| **Anlässe & GV** | `vorstand/js/events/` | ⏳ Bereit für Audit | Bereit für Schritt 1–6 |
| **Resultate** | `vorstand/js/resultate/` | ⏳ Bereit für Audit | Bereit für Schritt 1–6 |
| **Buchhaltung & Kasse**| `vorstand/js/buchhaltung/`| ⏳ Bereit für Audit | Bereit für Schritt 1–6 |
| **Logins & RBAC** | `vorstand/js/logins/` | ⏳ Bereit für Audit | Bereit für Schritt 1–6 |
