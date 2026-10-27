# System-Harmonisierung, UI/UX-Standards & Modul-Interaktion

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Führendes Fachdokument Rechnungswesen:** 👉 [`docs/RECHNUNGSWESEN.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/RECHNUNGSWESEN.md)  
> **Führendes Dokument Dokumenten- & Mail-Engine:** 👉 [`docs/DOCUMENT_AND_MAIL_ENGINE_SPEC.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/DOCUMENT_AND_MAIL_ENGINE_SPEC.md)  
> **Historisches Umsetzungstagebuch (Phasen 1–12):** 👉 [`docs/Archiv/HISTORIE_SYSTEM_HARMONISIERUNG_PHASEN_1_BIS_12.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/Archiv/HISTORIE_SYSTEM_HARMONISIERUNG_PHASEN_1_BIS_12.md)

---

## 1. Übergreifende System-Architektur

Das Vereinsportal der Sportschützen Muhen basiert auf einer harmonisierten Service-Architektur. Fachmodule agieren als Auslöser operativer Transaktionen, während bereichsübergreifende Aufgaben durch zentrale Shared Services abgewickelt werden:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FACHMODULE (Transaktions-Auslöser)                   │
│   Inventar        Vermietung        Jahresbeitrag        Anlässe/GV    Resultate│
└───────┬────────────────┬─────────────────┬───────────────────┬──────────────┬────┘
        │                │                 │                   │              │
        ▼                ▼                 ▼                   ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ZENTRALE SHARED SERVICES                              │
│  - RechnungsCore (rechnungen-core.js): Nummernkreis, Lifecycle, Payments, FiBu  │
│  - PDF-Engine (pdf-engine.js + Edge Function): SIX Swiss QR-Bill, WORM-Archiv   │
│  - Mail-Engine (mail-engine.js + send-email): SMTP, Templates, Audit-Logging    │
│  - TableKit (ui-table-kit.js): Spaltenauswahl, Sortierung, Resizing, Export     │
│  - Permissions & RBAC (permissions.js): View & Manage 2-Stufen-Sicherheit      │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
                                         ▼ HTTPS (Cloudflare Tunnel)
┌─────────────────────────────────────────────────────────────────────────────────┐
│                 POSTGRESQL SINGLE SOURCE OF TRUTH (Proxmox CT 117)               │
│  invoices, invoice_positions, invoice_payments, accounting_journal, mail_logs   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Verbindliche UI/UX-Standards

### 2.1 Flächendeckender TableKit-Standard (`ui-table-kit.js`)
Sämtliche tabellarischen Listen in allen Fachmodulen (`mitglieder-list.js`, `vermietung-list.js`, `buchhaltung-ui.js`, `buchhaltung-bank.js`, `jahresbeitrag-matrix.js`, `rechnungen-ui.js`, `termine-ui.js`) implementieren den zentralen Vereinsstandard über das globale `TableKit`:

* **All-in-One Initialisierer (`TableKit.initTable`):**
  Zentraler Einstiegspunkt für jede Tabelle im Portal mit einem einzigen Aufruf und automatischer `localStorage`-Persistenz:
  ```javascript
  TableKit.initTable('#myTable', {
    id: 'modul_name',                  // Erzeugt automatisch tk_widths_*, tk_order_*, tk_cols_*
    resizable: true,                   // Stufenloses Breiten-Resizing mit Doppelklick-Reset
    reorderable: true,                 // Spalten per Header Drag & Drop tauschen
    columnToggle: '#toggle-container', // Dropdown mit Spalten-Checkboxes & Reset
    lockedColumns: ['actions', 'check']// Feste Randspalten (können nicht verschoben werden)
  });
  ```
* **Spalten-Verschieben per Drag & Drop (`TableKit.makeColumnReorderable`):**
  Spaltenköpfe können horizontal gegriffen und an die gewünschte Position gezogen werden. Visuelle Einfügemarkierungen (`th.tk-col-drop-target-left` / `right`) heben das Ziel hervor. Geschützte Randspalten (`actions`, `check`) bleiben fest verankert. Die Reihenfolge wird im `localStorage` persistiert.
* **Flüssiges Resizing ohne Breitenblockaden (`TableKit.makeResizable` & `.tk-table-resizable`):**
  Horizontales Ziehen der Spaltenbreiten an der rechten Spaltenkante (`.tk-col-resizer`). Durch fluid-responsive CSS-Klassen (`.tk-table-resizable`) sperren innere Eingabefelder oder Texte nicht mehr das Verkleinern von Spalten. Ein **Doppelklick** auf die Trennlinie setzt die Spalte sofort auf die Standardbreite zurück.
* **Spalten-Auswahl mit Reset (`TableKit.setupColumnToggle`):**
  Dropdown mit Checkboxen zur individuellen Anzeige/Ausblendung von Spalten. Beinhaltet die Schnellwahltasten *«Alle an»*, *«Alle aus»* sowie den Button *«Standard wiederherstellen»*, um versehentlich verstellte Tabellenansichten auf Werkseinstellung zurückzusetzen.
* **Re-Render-Stabilität & Synchronisation (`TableKit.syncTable` & `MutationObserver`):**
  Werden Tabellenzeilen durch Filterung, Live-Updates aus Supabase oder Sortierung neu aufgebaut (`tbody.innerHTML = ...`), sorgt die automatische DOM-Beobachtung (`MutationObserver`) dafür, dass gezogene Spaltenreihenfolgen und Breiten verlustfrei und ohne Flimmern auf die neuen Datenzeilen angewendet werden.
* **Standard für Konten- und Suchfilterung (`TableKit.cleanKontoDisplay`):**
  In Kontenauswahlfeldern (z.B. Bankabgleich, Journal, Buchungsmodal) wird die Kontobezeichnung von rohen IBAN-Blöcken (`CH...`) bereinigt (`cleanKontoDisplay`). Dadurch wird verhindert, dass Zifferneingaben (z.B. «8») versehentlich alle Bankkonten aufrufen, weil Schweizer IBANs die Ziffer 8 enthalten.
* **Flächendeckender Rollout (`initTable` & `data-col-id` Synchronisation):**
  Alle operativen Tabellen des Vorstands- und Vereinsportals sind vollständig und einheitlich auf `TableKit.initTable` migriert:
  - **Mitglieder:** `#mgl-table`
  - **Rechnungswesen:** `#rn-invoices-table`, `#rn-contacts-table`, `#rn-templates-table`
  - **Vermietung:** `#vermietung-table`
  - **Finanzbuchhaltung:** `#bh-journal-table`, `#bhBankTable`, `#bh-konten-table` (Kontenplan & Budget)
  - **Inventar:** `#inventory-table`, `#table-offene-ausleihen`, `#table-transaktionen`, `#table-protokoll`
  - **Logins & RBAC:** `#logins-table-admin`, `#logins-table-members`, `#logins-table-sessions`
  - **Resultate & Endschiessen:** `#endschiessen-main-table`, `#endschiessen-final-table`
  - **Jahresbeitrag:** `#jbTable` (Beitrags-Übersicht), `#jbMatrixTable` (Beitrags-Matrix), `#jbGebuehrenTable` (Gebühren-Konfiguration), `#jbBankTransactionsTable` (Zahlungsabgleich)
  Alle Zeilenzellen (`<td>`) besitzen explizite `data-col-id`-Attribute für 100%ige Synchronisation zwischen Header und Datenzeilen beim Drag & Drop. Bestehende Filter und Konfigurationen (`localStorage`) bleiben rückwärtskompatibel erhalten. Bei Neu-Rendern werden bestehende Controller über `table._tkController.destroy()` idempotent und leckfrei aufgeräumt.

### 2.2 Standardisiertes Modal- & Drawer-Framework (`UIModalKit`)
* **Flächendeckender `UIModalKit`-Standard:** Sämtliche 80 Modaldialoge im gesamten Vereinsportal (Rechnungswesen, FiBu, Inventar, Vermietung, Mitglieder, Anlässe etc.) sind über den globalen Bootstrap-Hook (`shown.bs.modal`) in `vorstand/js/ui-table-kit.js` automatisch mit interaktiven Fensterfunktionen ausgestattet:
  - **Freies Verschieben (Header-Drag):** Durch Klick & Ziehen auf den `.modal-header` lässt sich jedes Dialogfenster stufenlos auf dem Bildschirm verschieben. Ein Viewport-Kollisionsschutz verhindert das Herausschieben aus dem Sichtbereich.
  - **Maximieren / Vollbild (Toggle):** Per Klick auf den Maximieren-Button (`.rn-modal-maximize-btn`) oder per **Doppelklick** auf die Titelleiste skaliert das Modal auf Fast-Vollbild (`calc(100vw - 24px)` / `calc(100vh - 24px)`). Beim Schliessen wird der Zustand automatisch auf Normalgrösse zurückgesetzt (`hidden.bs.modal`).
  - **Stufenloses Resizing:** Ein diskreter SVG-Resizer-Grip unten rechts (`.rn-modal-resizer`) erlaubt horizontales und vertikales Ziehen bei dynamischer Anpassung von `modalBody.style.maxHeight` und automatischem Scrollen.
  - **Auto-Injection:** Maximize-Button und Resizer-Grip werden bei Bedarf automatisch in den DOM injiziert, ohne dass statische HTML-Definitionen manuell überarbeitet werden müssen.
  - **Mobile-Schutz:** Auf Touchscreens und Mobilgeräten (`window.innerWidth < 768px`) bleibt das freie Verschieben und Resizen zugunsten der nativen Touch-Ergonomie deaktiviert.
* Modale Dialoge nutzen einheitliche Header mit Close-Button (`&times;`).
* Aktionen sind stets rechtsbündig angeordnet: `[ Abbrechen (Secondary) ]` und `[ Speichern / Bestätigen (Primary) ]`.
* Formulareingaben in Schnellerfassungen (`jahresbeitrag-schnellerfassung.js`, `resultate-input.js`) puffern Zwischenstände im `sessionStorage`, um Datenverlust bei unbeabsichtigtem Tab-Wechsel zu verhindern.

### 2.3 Systemweite Status-Tokens & Badges
Statuswerte folgen systemweit einer strikten Farbsemantik:
* 🟢 **Erfolgreich / Bezahlt / Aktiv:** `badge-success` / `badge-emerald`
* 🔵 **Entwurf / Offen / Provisorisch:** `badge-primary` / `badge-blue`
* 🟡 **Teilbezahlt / In Prüfung / Mahnung:** `badge-warning` / `badge-amber`
* 🔴 **Storniert / Abgelehnt / Überfällig:** `badge-danger` / `badge-red`

### 2.4 Einheitliche Du-Kultur (Projekt-Richtlinie 8)
Im gesamten Vereinsportal (Hilfetexte, Modale, Bestätigungs- und Löschdialoge, Tooltips) werden Benutzer grundsätzlich und ausnahmslos in der **Du-Form** angesprochen («du», «dein», «wähle aus», «trage ein»).

---

## 3. Entkopplung & Zero-Trust Sicherheitsmodell

1. **Striktes Verbot stiller Fallbacks (Projekt-Richtlinie 1):**  
   Tritt bei einem Supabase-Schreibvorgang ein Fehler auf, meldet das System einen eindeutigen UI-Fehler. Es existieren keine veralteten Dual-Writes oder stillen Fallbacks mehr.
2. **Row Level Security (RLS):**  
   Berechtigungen werden direkt auf PostgreSQL-Ebene über RLS-Policies und Rollen (`admin`, `vorstand`, `kassier`, `revisor`) durchgesetzt, nicht nur über UI-Sichtbarkeiten.
3. **«View & Manage» Kontrakt (Projekt-Richtlinie 7):**  
   Jedes Fachmodul besitzt exakt zwei Berechtigungsschlüssel:
   * `<modul>.view`: Freischaltung Navigation & Lesezugriff.
   * `<modul>.manage`: Freischaltung aller Mutations- und Schreibaktionen. Wer `manage` besitzt, hat automatisch `view`.

---

## 4. Rechnungs- und Belegintegration

Für alle Details zum Rechnungs-Lebenszyklus, zum Adress-Kontrakt nach DIN 5008 / SIX SPC 0200 1 und zur automatischen PDF-Synchronisation gilt verbindlich:
👉 [`docs/RECHNUNGSWESEN.md`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/docs/RECHNUNGSWESEN.md)
