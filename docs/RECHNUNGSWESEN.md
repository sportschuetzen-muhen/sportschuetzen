# Fachdokumentation: Rechnungswesen & RechnungsCore

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.invoices`, `invoice_positions`, `invoice_payments`, `invoice_number_seq`, `accounting_journal`  
> **Verknüpfung:** `invoices.source_module` & `source_id` $\rightarrow$ Fachmodule (`contributions_header`, `rental_requests`, `inventory_items`)  
> **Frontend:** [`vorstand/js/rechnungen/`](file:///vorstand/js/rechnungen/) (`rechnungen-core.js`, `rechnungen-ui.js`, `rechnungen-actions.js`, `rechnungen-templates.js`)  
> **Shared Services:** `pdf-engine.js` (Rendering via Edge Function `generate-pdf`), `mail-engine.js` (Versand via Edge Function `send-email`)

---

## 1. Übersicht & Systemgrenzen

Das Rechnungswesen bildet das zentrale kaufmännische Nervenzentrum des Vereins Sportschützen Muhen. Über den [`RechnungsCore`](file:///vorstand/js/rechnungen/rechnungen-core.js) laufen sämtliche Fakturierungs-, Zahlungsverfolgungs- und Mahnprozesse aller Vereinsdomänen zusammen:

* **Führendes System:** Supabase PostgreSQL (`public.invoices`, `public.invoice_positions`, `public.invoice_payments`).
* **Verbindlicher Standard:** Alle Fachmodule (Inventar, Vermietung, Jahresbeitrag, Sponsoring sowie manuelle Vorstandsforderungen) nutzen zwingend und ausschliesslich den `RechnungsCore`.
* **Entkopplung:** Fachmodule besitzen **keine eigenen Rechnungs- oder PDF-Engines**. Sie fungieren rein als *Forderungs-Auslöser* und übergeben typisierte Auftrags-Payloads (`InvoiceOrder`).
* **Buchhaltungs-Kopplung:** Jede Zahlung synchronisiert unmittelbar das doppelte Buchhaltungsjournal (`public.accounting_journal`), sodass Debitoren, Bankkonto und Erfolgsrechnung zu 100% kongruent sind.

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum ein zentraler `RechnungsCore` statt Beleg-Generierung in Fachmodulen?
* **Problem früher:** Wenn das Inventar (`inventar-pdf.js`), die Vermietung (`vermietung-pdf.js`) und das Jahresbeitrags-Sheet eigene PDFs erzeugen, entstehen Beleg-Inseln mit unkoordinierten Nummernkreisen, uneinheitlichem Erscheinungsbild und fehlender Übersicht für den Kassier.
* **Lösung & Warum:** Der `RechnungsCore` ist die alleinige Instanz zur Rechnungsanlage. Nur er vergibt Rechnungsnummern, erzeugt 27-stellige Schweizer QR-Referenzen, überwacht Fälligkeiten und übergibt Zahlungen an die Finanzbuchhaltung. Fachmodule bleiben dadurch schlank und fokussieren sich rein auf ihre Fachlogik.

### 2.2 Warum standardisierter `InvoiceOrder`-Payload (DTO)?
* **Problem:** Unterschiedliche Benennungen (`kto` vs `konto`, `price` vs `betrag`, `amount` vs `total`) führen zu Datenverlust bei Schnittstellenübergaben.
* **Lösung & Warum:** `RechnungsCore.createInvoice(order)` validiert jede Anfrage gegen einen strikten Vertrag (`RechnungsCore.validateOrder`). Ein Aufruf ohne vollständigen Empfängernamen, Adressdaten oder mindestens eine gültige Position mit Gegenkonto (`konto`) wird mit einer aussagekräftigen Fehlermeldung sofort abgewiesen.

### 2.3 Warum strikte Mutations-Sperren nach Versand und Zahlung? (Projekt-Richtlinie 6)
* **Revisionssicherheit (OR 957ff & GoBD):**
  - `mail_status === 'entwurf'` & `total_paid === 0`: Die Rechnung darf frei editiert oder gelöscht werden (z. B. Tippfehler korrigieren).
  - `mail_status === 'versendet'` & `total_paid === 0`: Bearbeitung (`rnOpenEditModal` / `rnSaveEditInvoice`) ist **strikt gesperrt**. Das Dokument befindet sich bereits beim Debitor. Eine nachträgliche Änderung im System würde zu einer fatalen Diskrepanz zwischen Kundenbeleg und Buchhaltung führen. Korrekturen erfordern eine offizielle Stornierung (`RechnungsCore.cancelInvoice`).
  - `status === 'bezahlt'` oder `total_paid > 0`: Weder Bearbeiten noch Löschen ist zulässig. Da bereits Zahlungen in `invoice_payments` und Journalbuchungen in `accounting_journal` existieren, würde ein Löschen das gesetzliche Hauptbuch korrumpieren.

### 2.4 Warum ist der Typ `Jahresbeitrag` im Rechnungs-Cockpit gesperrt?
* **Invariante:** Rechnungen des Typs `Jahresbeitrag` können im Rechnungs-Cockpit (`rechnungen-actions.js`) nicht manuell modifiziert werden.
* **Das «Warum»:** Die Beitragsrechnung ist das exakte Spiegelbild der hochgradig reglementierten Beitragsordnung (`contributions_positions`: Grundbeitrag, Lizenzrabatte, Schützenhausgebühr, Ehrenmitgliedschaft etc.). Würde jemand im Rechnungs-Cockpit per Freitext Beträge anpassen, entstünde eine Differenz zur Mitglieder-Beitragsliste. Korrekturen erfolgen ausschliesslich im Modul `jahresbeitrag-overview.js`.

### 2.5 Warum DIN 5008 & SIX SPC 0200 1 Adress-Kontrakt?
* **Schweizer QR-Bill Standard:** Nach DIN 5008 und SIX SPC 0200 1 entscheidet die Zeilenstruktur des Adressfensters über die Rechtsform:
  - **Natürliche Person (Mitglied / Privatkunde):**  
    Zeile 1: Anrede (`Herr` / `Frau`) im normalen Schriftgewicht.  
    Zeile 2: `Vorname Nachname` im normalen Schriftgewicht (**niemals fett**, kein Doppelname!).  
    *Zwingende Invariante:* Das Feld `firma` muss zwingend **leer (`""`) oder `null`** sein!
  - **Juristische Person (Firma / Verband / Behörde):**  
    Zeile 1: `Firmenname` im Fettdruck (**bold**).  
    Zeile 2: Optionale Abteilung / Zusatz.  
    Zeile 3: Ansprechperson mit Anrede (`Herr`/`Frau` Vorname Nachname im normalen Schriftgewicht).
  - **Sicherheitsnetz:** Bei `typ === 'privat'` darf niemals der Personenname in das Feld `firma` geschrieben werden.
  - **Ländercode & Zeichenkodierung (SIX SPC 0200 1 Validierung):** Im Schweizer QR-Payload (Zeile 11 Creditor & Zeile 27 Ultimate Debtor) ist zwingend ein 2-stelliger ISO 3166-1 alpha-2 Ländercode (`CH`, `LI`, `DE` etc.) vorgeschrieben; Freitexte wie `Schweiz` werden durch `normalizeCountryCode()` automatisch zu `CH` normalisiert. Zudem erfordert `CodingType: "1"` eine strikte UTF-8-Bytekodierung (`qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]`), damit Umlaute in Vereins- und Personennamen von Beleglesern und E-Banking-Scannern fehlerfrei verarbeitet werden.

### 2.6 Warum 2-stufige Absender-Ermittlung mit unveränderlichem JSONB-Snapshot & Amts-Prinzip?
* **Problem:** Wechselt im Verein der Kassier oder der Präsident, dürfen historische Rechnungen aus den Vorjahren nicht plötzlich den Namen des neuen Amtsinhabers tragen. Zudem führten Rechnungsgenerierungen durch Hilfsadmins oder andere Vorstandsmitglieder zu falschen Kontaktdaten auf Belegen.
* **Lösung (`RechnungsCore.resolveSender` / `findBoardMemberByFunction` / `rnGetLoggedInSender`):**
  1. *Stufe 1 (Amts- & Rollen-Ermittlung):* Fachmodule erfordern feste Rollen (z. B. `Jahresbeitrag` und `Vermietung` $\rightarrow$ immer `Kassier`; `Materialverkauf` $\rightarrow$ `Materialwart`; `Schulsport` $\rightarrow$ `Juniorenleiter`). `resolveSender` löst diesen Amtsinhaber live aus den SSV-Stammdaten (`public.member_functions` und `public.members`) mit dessen vollständiger Postanschrift, Mobilnummer und E-Mail auf. Bei freien Rechnungen dient der angemeldete Benutzer als Fallback.
  2. *Stufe 2 (Unveränderlicher DB-Snapshot):* Beim Speichern wird der Absender als JSONB-Objekt in `public.invoices.sender_address` eingefroren.
  3. *Synchronität bei Versand:* Der Massenversand nutzt strikt `inv.sender_address` (wodurch Mail-Display-Name, Mail-Signatur und PDF-Briefkopf zu 100% übereinstimmen). Wird im Einzelversand der Absender im Dropdown manuell übersteuert, aktualisiert das System `sender_address` in der DB und stösst automatisch die sofortige Neugenerierung des Rechnungs-PDFs an (`RechnungsCore.renderPdf(invoiceId, { forceRecreate: true })`).

### 2.7 Warum atomare Rechnungsnummern via PostgreSQL-Sequenz?
* **Problem:** Clientseitig generierte Rechnungsnummern (Zählen von `window._invoices.length`) führen zu Doppelnummern (Race Conditions), wenn zwei Vorstandsmitglieder gleichzeitig Rechnungen erstellen.
* **Lösung:** Migration 26 etabliert `public.invoice_number_seq` und die Stored Procedure `public.next_invoice_number(p_prefix, p_year)`. Nummern werden direkt in PostgreSQL atomar und lückenlos vergeben:
  - `RE-26-XXXX`: Manuelle Vorstandsrechnungen
  - `JB-26-XXXX`: Jahresbeiträge
  - `VM-26-XXXX`: Schützenhaus-Vermietungen (Mietverträge & Zusatzrechnungen Wirtschaft/Vermietung)
  - `MV-26-XXXX`: Material- & Munitionsverkäufe (Inventar)
  - `DP-26-XXXX`: Schlüsseldepots & Kautionen
  - `SP-26-XXXX`: Sponsoren & Gönner

### 2.8 Warum Trennung von Rechnung, Zahlung und Buchungsjournal?
* **Rechnung (`public.invoices`):** Repräsentiert die rechtliche Forderung mit Fälligkeitsdatum.
* **Zahlungen (`public.invoice_payments`):** Erlaubt beliebige Teilzahlungen (z. B. Anzahlung 100.-, Restzahlung 200.- via TWINT, Bank oder Bar).
* **Hauptbuch (`public.accounting_journal`):** Automatische Verbuchung bei Zahlungseingang (`Soll 1020 Bank an Haben 1100 Debitoren`).
* **Ergebnis:** Salden und Offene Posten stimmen in Echtzeit überein.

### 2.9 Warum automatische PDF-Neugenerierung & Cache-Busting?
* Jede Mutation an einer Rechnung (Erstellung, Statusänderung, Zahlungseingang, Storno) ruft im Hintergrund unmittelbar `RechnungsCore.renderPdf(invoiceId, { forceRecreate: true })` auf.
* Da Browser und Proxies PDF-URLs aggressiv cachen, müssen alle Frontend-Aufrufe mit Zeitstempel aufgerufen werden (`?t=${Date.now()}`).

---

## 3. Der Rechnungs-Lebenszyklus (State Machine)

```text
       ┌───────────────┐
       │    ENTWURF    │  (Frei editierbar, kein Beleg versendet)
       └───────┬───────┘
               │  Rechnung versenden (Mail oder Druck)
               ▼
       ┌───────────────┐
       │ OFFEN / GEST. │  (Bearbeitung GESPERRT, PDF unveränderlich im WORM-Storage)
       └───────┬───────┘
               │
       ┌───────┴───────────────────────────┐
       │ Teilzahlung (total_paid < total)   │ Vollzahlung (open_amount == 0)
       ▼                                   ▼
┌───────────────┐                  ┌───────────────┐
│  TEILBEZAHLT  │                  │    BEZAHLT    │  (ABSOLUT UNVERÄNDERLICH)
└───────┬───────┘                  └───────────────┘
        │ Restzahlung                      ▲
        └──────────────────────────────────┘
        
(Sonderpfad aus ENTWURF oder OFFEN):
┌───────────────┐
│   STORNIERT   │  (Gutschrift / Stornobeleg, cancel_reason dokumentiert)
└───────────────┘
```

### Zulässige Aktionen je Status

| Aktion | Entwurf (`entwurf`) | Versendet (`offen`) | Teilbezahlt (`teilbezahlt`) | Bezahlt (`bezahlt`) | Storniert (`storniert`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Positionen / Betrag editieren** | ✅ Ja | ❌ **Gesperrt** | ❌ **Gesperrt** | ❌ **Gesperrt** | ❌ **Gesperrt** |
| **Rechnung löschen** | ✅ Ja | ⚠️ Nur mit Warnung | ❌ **Gesperrt** | ❌ **Gesperrt** | ❌ **Gesperrt** |
| **Stornieren (`cancelInvoice`)** | ✅ Ja | ✅ Ja (bevorzugt) | ⚠️ Reststorno | ❌ **Gesperrt** | ❌ Bereits storniert |
| **Zahlung erfassen** | ❌ Erst nach Versand | ✅ Ja | ✅ Ja | ❌ Vollständig bezahlt | ❌ **Gesperrt** |
| **Mahnung generieren** | ❌ Nicht fällig | ✅ Wenn überfällig | ✅ Für Restsaldo | ❌ **Gesperrt** | ❌ **Gesperrt** |
| **PDF herunterladen / ansehen** | ✅ Vorschau | ✅ Originalbeleg | ✅ Originalbeleg | ✅ Quittungsbeleg | ✅ Stornobeleg |

### 3.1 Entkoppelung von Quellmodulen beim Löschen (Einzel- & Sammellöschung)
Wird eine Rechnung im Rechnungsmodul gelöscht – entweder einzeln (`rnDeleteInvoicePrompt`) oder via Multi-Select Tabellenauswahl (`rnDeleteSelectedInvoices`) –, entkoppelt das System die verknüpften Fachmodule atomar:
- **Jahresbeitrag (`contributions_header`):** Setzt `invoice_id = NULL`. Der Status im Jahresbeitragsmodul fällt von `entwurf` bzw. `versendet` sauber auf `berechnet` zurück. Betroffene Mitglieder können im Jahresbeitrags-Cockpit sofort wieder über «Rechnungen bereitstellen» oder Einzelklick neu fakturiert werden.
- **Vermietung Schützenstube (`rental_requests`):** Setzt `invoice_id = NULL`. Die Buchung bleibt bestätigt und kann neu fakturiert werden.
- **In-Memory Cache-Synchronisation:** Die lokalen Datenstrukturen (`window._jbData`, `window._jbAllBeitraege`, `window._invoices`) werden unmittelbar aktualisiert, sodass auch ohne manuellen Reload konsistente Status-Badges und Bereitstellungs-Zähler vorliegen.
- **Schutz bezahlter Rechnungen:** Rechnungen mit `status === 'bezahlt'` oder `total_paid > 0` werden bei der Sammellöschung automatisch geschützt und übersprungen.

### 3.2 Zusatzrechnung Wirtschaft/Vermietung & Mahnwesen-Abgrenzung
* **Grundmiete (vor dem Anlass):** Die Grundmiete wird über den Mietvertrag inklusive Schweizer QR-Zahlteil auf separater Schlussseite fakturiert. Zur automatischen Abstimmung im CAMT-Bankimport generiert das System via RPC `ensure_rental_proforma_invoice` eine Proforma-Rechnung (`invoices`, Typ `Vermietung`, Ertragskonto 3400). Proforma-Mietrechnungen sind im kaufmännischen Mahnwesen des Rechnungsmoduls (`rnOpenMahnungModal`, `rnGetDueDunningInvoices`) **vollständig gesperrt**, da die Terminsicherung ausschliesslich im Fachmodul Vermietung über den dortigen Erinnerungsworkflow geregelt wird.
* **Zusatzrechnung Wirtschaft/Vermietung (nach dem Anlass):** Fallen nach der Durchführung des Anlasses zusätzliche Kosten an (z. B. Nachreinigung CHF 35.–/h bei ungenügender Besenreinheit, zusätzliches Cheminéeholz CHF 20.–, Getränkebezüge Wirtschaft oder Sachbeschädigungen), wird hierfür über den `RechnungsCore` eine **«Zusatzrechnung Wirtschaft/Vermietung»** (Konto 3400) erstellt.
* **Mahnwesen für Zusatzrechnungen:** Da der Anlass bereits stattgefunden hat, greift bei ausstehenden Zusatzrechnungen das reguläre, dreistufige kaufmännische Mahnwesen im zentralen Rechnungsmodul (`mahnung_1`, `mahnung_2`, `mahnung_3`).

### 3.3 Materialverkauf & Depot-/Kautionsrechnungen (Inventar-Anbindung)
* **Entkopplung vom Direktversand:** Rechnungen aus dem Inventarmodul (`source_module: 'inventar'`, Typen `Materialverkauf` und `Depot / Pfand`) werden nicht direkt im Fachmodul per E-Mail versendet, sondern im Rechnungsmodul im Status `mail_status: 'entwurf'` hinterlegt.
* **Massenversand & Einzelkontrolle:** Im Rechnungs-Cockpit erscheinen diese Belege sofort unter «Noch nicht versendet» und können gezielt nach Typ gefiltert oder gesammelt via Massenversand per E-Mail mit QR-Rechnungs-PDF versendet werden.

---

## 4. Datenmodell (Supabase PostgreSQL)

### 4.1 Kern-Tabellen

```sql
-- 1. Zentrale Rechnungen (public.invoices)
CREATE TABLE public.invoices (
    id VARCHAR(50) PRIMARY KEY,                    -- z.B. 'RE-26-0001', 'JB-26-0042'
    person_number VARCHAR(50),                     -- Verknüpfung zu members.person_number
    recipient_name TEXT NOT NULL,
    recipient_address JSONB NOT NULL,              -- Adress-Snapshot (Strasse, PLZ, Ort, Firma)
    sender_address JSONB NOT NULL,                 -- Absender-Snapshot des Erstellers
    year INTEGER NOT NULL,                         -- Buchungsjahr
    type VARCHAR(50) NOT NULL,                     -- 'Jahresbeitrag', 'Vermietung', 'Inventar' etc.
    source_module VARCHAR(50) NOT NULL,            -- 'jahresbeitrag', 'vermietung', 'inventar', 'manuell'
    source_id VARCHAR(100),                        -- ID im Quellmodul (z.B. rental_requests.booking_number)
    status VARCHAR(30) NOT NULL DEFAULT 'offen',   -- 'entwurf', 'offen', 'teilbezahlt', 'bezahlt', 'storniert'
    mail_status VARCHAR(30) DEFAULT 'entwurf',     -- 'entwurf', 'versendet'
    total_amount NUMERIC(10,2) NOT NULL,
    open_amount NUMERIC(10,2) NOT NULL,
    total_paid NUMERIC(10,2) DEFAULT 0.00,
    due_date DATE,
    currency VARCHAR(10) DEFAULT 'CHF',
    pdf_url TEXT,
    pdf_storage_path TEXT,                         -- Pfad in operatives-storage
    cancel_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    mahnstufe INTEGER DEFAULT 0,
    mahn_historie JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Rechnungspositionen (public.invoice_positions)
CREATE TABLE public.invoice_positions (
    id VARCHAR(100) PRIMARY KEY,
    invoice_id VARCHAR(50) NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    position_nr INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    konto VARCHAR(20) NOT NULL DEFAULT '3000',     -- Gegenkonto im KMU-Kontenrahmen
    type VARCHAR(30) DEFAULT 'standard',
    source_field VARCHAR(50)
);

-- 3. Zahlungen & Teilzahlungen (public.invoice_payments)
CREATE TABLE public.invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id VARCHAR(50) NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    amount NUMERIC(10,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) NOT NULL,           -- 'bank', 'twint', 'bar', 'camt054'
    booking_reference TEXT,                        -- Bank-Transaktions-ID / QRR
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. Schnittstellen-Definition: `InvoiceOrder`-Payload

Jedes Fachmodul, das eine Rechnung auslösen möchte, übergibt ein standardisiertes `InvoiceOrder`-Objekt an `RechnungsCore.createInvoice(order)`:

```javascript
const invoiceOrder = {
  // 1. Quellreferenz
  source: {
    module: 'vermietung',        // 'jahresbeitrag' | 'vermietung' | 'inventar' | 'sponsoring' | 'manuell'
    id: bookingNr                // Eindeutige ID im Quellmodul
  },

  // 2. Empfängerdaten (DIN 5008 / SIX Swiss QR konform)
  recipient: {
    memberId: member.id || null, // Optional bei Nicht-Mitgliedern
    personNumber: '10042',       // Optional bei Externen
    name: 'Hans Muster',         // Vollständiger Name
    salutation: 'Herr',          // 'Herr' | 'Frau'
    street: 'Dorfstrasse 12',
    zip: '5037',
    city: 'Muhen',
    email: 'hans.muster@bluewin.ch',
    company: null,               // ZWINGEND null/leer bei Privatpersonen!
    department: null
  },

  // 3. Absender (Optional, sonst automatisch die angemeldete Person)
  sender: {
    bereich: 'Vermietung Schützenstube',
    funktion: 'Vermieter'
  },

  // 4. Rechnungspositionen
  positions: [
    {
      title: 'Miete Schützenstube Rüteli (24.10.2026)',
      quantity: 1,
      unitPrice: 300.00,
      total: 300.00,
      konto: '3400'              // Ertragskonto im KMU-Kontenrahmen
    },
    {
      title: 'Cheminéeholz Pauschale',
      quantity: 1,
      unitPrice: 30.00,
      total: 30.00,
      konto: '3400'
    }
  ],

  // 5. Konditionen & Optionen
  options: {
    dueDateDays: 30,             // Zahlungsziel in Tagen (Standard: 30)
    type: 'Vermietung',          // Rechnungs-Kategorie
    notes: 'Vielen Dank für Ihre Reservation.'
  }
};

// Ausführung via RechnungsCore
const newInvoice = await window.RechnungsCore.createInvoice(invoiceOrder);
```

---

## 6. Berechtigungen & RLS (Harmonisiertes View & Manage Modell, Migration 48 & 49)

* **Entkoppelte Durchsetzung (RBAC Single Source of Truth):** Zugriff auf das Rechnungswesen richtet sich nicht mehr nach statischen Rollennamen, sondern nach den harmonisierten Schaltern in `public.role_permissions`.
* **Lesen (`public.rbac_invoicing_read()`):** Erfordert `rechnungen.view`, `rechnungen.manage`, `jahresbeitrag.view`, `jahresbeitrag.manage`, `buchhaltung.view`, `buchhaltung.manage`, `vermietung.view`, `vermietung.manage`, `inventar.view` oder `inventar.manage`.
* **Schreiben (`public.rbac_invoicing_write()`):** Erfordert `rechnungen.manage`, `jahresbeitrag.manage`, `buchhaltung.manage`, `vermietung.manage` oder `inventar.manage` (auslösende Fachmodule lösen Rechnungen über den `RechnungsCore` aus und sind via RLS autorisiert).
* **Admin-Wildcard:** Die Rolle `admin` besitzt systemweit uneingeschränkten Vollzugriff (`*`).
* **Sicherheits-Härtung:** Alle offenen `USING (true)`- und Dev-Anon-Policies auf den Rechnungstabellen (`invoices`, `invoice_positions`, `invoice_payments`, `invoice_templates`, `external_contacts`) wurden vollständig entfernt; Anon-Zugriff auf die Stored Procedures `next_invoice_number` und `record_invoice_payment` wurde entzogen. Rollen ohne aktive Schalter (z. B. einfaches Vorstandsmitglied ohne Rechte) werden serverseitig mit RLS-Fehlern abgewiesen und sehen im Frontend weder Nav-Link noch Dashboard-Kachel.
* **Frontend-Integration:** Sowohl `Perms.VIEW_ACCESS` als auch `hasWriteAccess('rechnungen')` prüfen dynamisch gegen `rechnungen.manage` bzw. `rechnungen.view`. Mutation-Buttons sind für reine Betrachter mit `.write-protected` ausgeblendet/gesperrt.

---

## 7. Zusammenfassung für Entwickler & KI

1. **Niemals direkte Inserts in `public.invoices` vornehmen!** Immer `window.RechnungsCore.createInvoice(order)` nutzen.
2. **Niemals eine versendete oder bezahlte Rechnung im UI editieren lassen!** Die Mutationssperren in `rechnungen-actions.js` schützen die GoBD-Konformität.
3. **Bei Privatpersonen niemals das Feld `firma` füllen!** Andernfalls bricht der Schweizer QR-Zahlteil die SIX-Norm.
4. **Jedes PDF mit Cache-Busting abrufen:** `?t=${Date.now()}`.
5. **E-Mail-Vorlagen & WYSIWYG-Harmonisierung:** Das Rechnungsmodul nutzt für E-Mail-Begleittexte (`rnm-mail-body`, `rn-mahnung-body`, `rnl-mail-body`) den globalen Vereins-WYSIWYG (`ClubWysiwyg`). Pre-gerendertes HTML aus `document_templates` wird visuell formatiert gerendert und nativ als HTML an `renderClubEmailHtml` übergeben (kein doppeltes `<p>`-Wrapping); für reine Text-Mailclients wird automatisiert ein bereinigter Plaintext ohne HTML-Tags erzeugt.
6. **Absenderauflösung & Profil-Synchronisation (Migration 59):** Absenderdaten für Rechnungen, E-Mails und Mahnungen stammen prioritär aus dem persönlichen Profil des eingeloggten Vorstandsmitglieds (`public.admin_profiles` via `localStorage`). `rnPopulateSenderSelect` dedupliziert die Auswahlliste nach SSV-Mitgliedsnummer und bindet den eingeloggten Absender nahtlos ein. In `generate-pdf` werden Absenderzeilen und die Grussformel dynamisch mit den Profilangaben des Erstellers ergänzt.

