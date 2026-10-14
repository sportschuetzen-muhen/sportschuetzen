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
Sämtliche tabellarischen Listen in allen Fachmodulen (`mitglieder-list.js`, `vermietung-list.js`, `buchhaltung-ui.js`, `jahresbeitrag-matrix.js`, `rechnungen-ui.js`) implementieren den zentralen Vereinsstandard:
* **Heller Sticky-Header:** Tabellenköpfe bleiben beim vertikalen Scrollen dauerhaft sichtbar.
* **Spaltenauswahl (`TableKit.setupColumnToggle`):** Spalten lassen sich per Klick ein- und ausblenden; Präferenzen werden pro Benutzer im `localStorage` persistiert.
* **Interaktive Sortierung:** Spaltenköpfe mit `data-sort-key` und Sortierindikatoren (`▲`/`▼`).
* **Spaltenbreiten (`TableKit.makeResizable`):** Horizontales Resizing per Drag & Drop.

### 2.2 Standardisiertes Modal- & Drawer-Framework
* Modale Dialoge (Rechnungserfassung, Zählerstand, Buchungsdetails) nutzen einheitliche Header mit Close-Button (`&times;`).
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
