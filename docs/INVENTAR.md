# Fachdokumentation: Inventar- & Materialverwaltung

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.inventory_items`, `inventory_transactions`, `inventory_deposits`, `inventory_audit_log`, `inventory_config`, `invoices`, `accounting_journal`  
> **Frontend:** [`vorstand/js/inventar/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/inventar/) (`inventar-core.js`, `inventar-ui.js`, `inventar-cart.js`, `inventar-list.js`, `inventar-journal.js`, `inventar-pdf.js`)  
> **Relevanz für KI:** Definiert die fachlichen Invarianten, Transaktions- und Pfandkassen-Logik, Quittungs-PDF-Generierung, Schnittstellen zu `RechnungsCore` und doppelter Buchhaltung sowie das Berechtigungskonzept.

---

## 1. Übersicht & Systemgrenzen

Das Modul **Inventar-Verwaltung** bildet das operative Herzstück für den Materialwart, den Schützenmeister und den Vorstand der Sportschützen Muhen zur vollständigen Überwachung, Ausleihe, Rücknahme und Verrechnung aller Vereinssachwerte:

* **Gegenstandskategorien:**
  1. **Sportwaffen (`gewehr`):** Kleinkaliber- und Luftgewehre (50m, 10m, 300m) mit Hersteller, Modell, Serien-/Laufnummer, Diopter, Ringkorn, Eigentümer/Spender und Depotbetrag.
  2. **Schlüssel (`schluessel`):** Schliessanlagen- und Anlagenschlüssel für Schützenhaus, Stand, Munitionsschränke und Schützenstube mit Schlüsselnummer und Kautionsbetrag.
  3. **Vereinskleidung (`kleidung`):** Poloshirts, T-Shirts, Softshell-Jacken, Gilets, Trainerhosen mit Grössen (XS bis XXL), Kaufpreisen und Lagerstatus.
  4. **Schiessbekleidung (`schiessbekleidung`):** Schiessjacken, Schiesshosen, Handschuhe, Schiessschuhe und Stative zur Leihe oder zum Kauf.

* **Funktionsumfang:**
  - **Ausleihe (`checkout`):** Übergabe von Sportgeräten/Schlüsseln/Bekleidung an Aktiv- oder Passivmitglieder inklusive digitaler Unterschrift (Mitglied & Vorstand), Pfanderfassung und Quittungs-PDF.
  - **Rücknahme (`checkin`):** Zustandserfassung bei Rückgabe, Abrechnung bzw. Rückerstattung des Pfandes (Bar, Twint, Banküberweisung).
  - **Materialverkauf (`verkauf`):** Abgabe von Vereins- oder Schiessbekleidung mit direkter Erstellung einer QR-Rechnung über den zentralen `RechnungsCore` oder Bar-/Twint-Zahlung inklusive automatisiertem Buchungssatz in der doppelten Buchhaltung (`accounting_journal`).
  - **Kautions- & Pfandkasse:** Lückenlose Erfassung aller offenen Pfandbeträge mit Filter nach Kategorie und Status (`Offen`, `Retour`, `Verrechnet`).
  - **Journal & Historie:** Zeitlich lückenloses Transaktionsjournal mit Beleg-Verknüpfung und Revisions-Auditlog.

* **Führendes System:** Supabase PostgreSQL ist die unumstössliche **Single Source of Truth** (Regel 2). Sämtliche Alt-Schnittstellen (Google Spreadsheet `Vereinsinventar_GAS` `183MBGdaNw_qSZdNQPTxui3gsend9pOkpEpC2K3G7O2U` und Google Apps Script Fallbacks) wurden vollständig entkoppelt (Regel 1).

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum ein einheitliches relationales Schema (`inventory_items`) statt 4 Tabellen/Sheets?
* **Problem im Altsystem:** Im alten Google-Sheets-System existierten getrennte Tabellenblätter für Gewehre, Schlüssel, Vereinskleidung und Schiessbekleidung mit komplett divergierenden Spaltenstrukturen. Abfragen über alle Sachwerte eines Mitglieds erforderten 4 separate Schleifen.
* **Lösung & Warum:** Die Tabelle `public.inventory_items` konsolidiert alle Gegenstände mit einer gemeinsamen Basis (`id`, `category`, `status`, `current_owner_id`, `depot_amount`, `purchase_price`). Kategorienspezifische Spalten (`manufacturer`, `serial_number`, `key_number`, `size`) sind im gleichen Schema typisiert oder in `metadata JSONB` erweiterbar.  
* **Vorteil:** Ein Mitglied kann in einem einzigen Vorgang ein Gewehr, einen Schlüssel und eine Schiessjacke ausleihen (`warenkorb`), und das System validiert die Bestände in einer einzigen Transaktion.

### 2.2 Warum digitaler Ausleih-Warenkorb & Signatur-Pad vor Ort?
* **Rechts- & Sorgfaltspflicht beim Waffengesetz:** Die Überlassung von Vereins-Sportwaffen an Nachwuchsschützen und Mitglieder erfordert den unmissverständlichen Nachweis, wer welche Waffe mit welcher Seriennummer und welchem Zubehör zu welchem Zeitpunkt übernommen hat.
* **Lösung & Warum:** Das Frontend nutzt `SignaturePad` (`signature_pad.umd.min.js`), um bei der Übergabe sowohl die Unterschrift des Mitglieds als auch des verantwortlichen Vorstandsmitglieds digital als Data-URL (`sig_member_url`, `sig_board_url`) zu erfassen.
* **Quittungs-PDF (`jsPDF`):** Direkt im Browser wird clientseitig ein rechtssicheres A4-Beleg-PDF («AUSGABE-QUITTUNG» / «RÜCKNAHME-QUITTUNG» / «VERKAUFS-QUITTUNG») erzeugt und optional in Supabase Storage abgelegt.

### 2.3 Warum Anbindung an `RechnungsCore` und doppelte Buchhaltung?
* **Keine Schattenbuchhaltung:** Wenn ein Mitglied Schiesskleidung oder Munition bezieht, darf dies nicht in einem isolierten Inventar-Silo verbleiben.
  - **Materialverkauf auf Rechnung (Variante A mit Sponsoring):** Erzeugt via `RechnungsCore.createInvoice(order)` sofort eine rechtskonforme DIN 5008 / SIX Swiss QR Rechnung:
    - Position 1: Artikel mit regulärem Katalogpreis (aufgerundet auf ganze CHF)
    - Position 2: `Sponsoringbeitrag C-Ma Trading GmbH` als transparenter Minusbetrag
    - Endbetrag: Netto-Mitgliederpreis
    - Verknüpfung über `source_id: itemId`
  - **Entkopplung vom Direktversand:** Rechnungen werden nicht mehr direkt aus dem Inventar per Mail versendet, sondern verbleiben mit `mail_status: 'entwurf'` im zentralen Rechnungsmodul. Dort stehen sie für die manuelle Prüfung sowie den automatisierten Massenversand bereit.
  - **Excel- & CSV-Massenimport (`SheetJS`):** Im Modul integrierter Import-Assistent mit Vorlagen-Download (.xlsx), Drag-and-Drop, Schema-Validierung und Live-Vorschautabelle für Kleidung, Schlüssel, Gewehre und Schiessbekleidung. Die Mustervorlage umfasst alle Modell- und Preisfelder (inkl. `Grundpreis`, `Veredelung`, `Kaufdatum`, `Depotbetrag`) sowie ein zweites Informationsblatt («Anleitung»). Zeilen 2+ sind Musterbeispiele und können gelöscht werden; leere ID-Zellen erhalten automatisch die nächste freie Inventarnummer (z. B. `K-54`), während angegebene IDs bestehende Artikel per Upsert aktualisieren.
* **Doppelter Buchungssatz:** Bei Bar- oder Twint-Kauf bzw. Pfandbuchung wird direkt in `accounting_journal` gebucht:
  - Verkauf Bar/Twint: Soll `1000 Kasse` bzw. `1020 Bank/Twint` an Haben `8501 Ertrag Kleiderverkauf`
  - Pfandeingang (Depot): Soll `1000 Kasse` an Haben `2030 Kautionen & Pfandkasse`
  - Pfandrückzahlung: Soll `2030 Kautionen & Pfandkasse` an Haben `1000 Kasse`

### 2.4 Warum Echtzeit-Verknüpfung mit `public.members`?
* **Keine manuellen Adressabgleiche mehr:** Früher musste das Inventar-Adressbuch manuell synchronisiert werden (`syncInventarMembers`).  
* **Lösung:** Das Inventar-Modul verknüpft Fremdschlüssel (`current_owner_id`, `owner_person_id`, `donor_person_id`, `seller_person_id`) direkt mit `public.members(person_number)`. Scheidet ein Mitglied aus oder ändert seine Kontaktdaten, ist das Inventar augenblicklich aktuell.

---

## 3. Datenmodell (Kern-Tabellen & Relationen)

```mermaid
erDiagram
    members ||--o{ inventory_items : "current_owner_id"
    members ||--o{ inventory_transactions : "member_id"
    members ||--o{ inventory_deposits : "member_id"
    inventory_items ||--o{ inventory_transactions : "item_id"
    inventory_items ||--o{ inventory_deposits : "item_id"
    inventory_transactions ||--o{ invoices : "source_id (bei Verkauf)"
    
    inventory_items {
        varchar id PK "z.B. G-01, S-04, K-12"
        varchar category "gewehr, schluessel, kleidung, schiessbekleidung"
        varchar status "Im Lager, Ausgegeben, Defekt, Verkauft"
        integer current_owner_id FK "-> members.person_number"
        numeric depot_amount "Pfand in CHF"
        numeric purchase_price "Kauf-/Verkaufspreis"
        date purchase_date
        varchar manufacturer "Gewehr: Bleiker, Walther, etc."
        varchar model "Gewehr-Modell"
        varchar serial_number "Lauf-/Seriennummer"
        varchar key_name "Schlüssel-Bezeichnung"
        varchar item_type "Kleidungs-Typ"
        varchar size "Grösse"
    }

    inventory_transactions {
        uuid id PK
        timestamptz timestamp
        varchar action "AUSGABE, CHECKIN, VERKAUF"
        integer member_id FK
        varchar item_id FK
        varchar condition_out "Zustand Abgabe"
        varchar condition_in "Zustand Rückgabe"
        numeric deposit_amount
        varchar payment_method
        text sig_member_url
        text sig_board_url
        text pdf_url
    }

    inventory_deposits {
        varchar id PK "z.B. P-01"
        integer member_id FK
        varchar item_id FK
        numeric amount
        timestamptz date_out
        timestamptz date_returned
        varchar status "Offen, Retour, Verrechnet"
        varchar payment_method
    }

    inventory_config {
        uuid id PK
        varchar config_key "z.B. Transaktion_Zustand"
        varchar value
        integer sort_order
    }

    inventory_audit_log {
        uuid id PK
        timestamptz timestamp
        varchar user_name
        varchar action
        text details
    }
```

### 3.1 Tabellen-Spezifikation

| Tabelle | Primärschlüssel | Zweck & Invarianten |
| :--- | :--- | :--- |
| `public.inventory_items` | `id` (VARCHAR) | Alle physischen Inventargüter. Eindeutiger Präfix-Schlüssel (`G-*`, `S-*`, `K-*`, `SB-*`). Status muss stets mit `current_owner_id` synchron sein (`Im Lager` $\Rightarrow$ `current_owner_id IS NULL`; `Ausgegeben` $\Rightarrow$ `current_owner_id IS NOT NULL`). |
| `public.inventory_transactions`| `id` (UUID) | Transaktionsprotokoll aller Ausgaben, Rücknahmen und Verkäufe. Enthält Signatur-Daten, Zustandsbewertung und Quittungsverweis. |
| `public.inventory_deposits` | `id` (VARCHAR) | Kassenführung der Pfand- und Kautionsgelder. Status: `Offen` (Pfand einbehalten), `Retour` (bar/twint zurückbezahlt), `Verrechnet` (z.B. bei Beschädigung einbehalten). |
| `public.inventory_config` | `id` (UUID) | Konfigurierbare Wertelisten für Dropdowns (`Transaktion_Zustand`, `Gewehre_Distanz`, `Kleidung_Typ`, `Schiessbekleidung_Typ`, Grössen). |
| `public.inventory_audit_log` | `id` (UUID) | Revisionssicherer Audit-Trail für alle Neuanlagen, Stammdatenmutationen und Löschungen durch den Vorstand. |

---

## 4. Rollen- & Berechtigungskonzept (RBAC & RLS)

Zugriffsrechte werden auf zwei Ebenen durchgesetzt:

1. **Frontend-Schutz (`main.js` & `inventar-core.js`):**
   - **Navigation & Leserecht:** Rollen `schuetzenmeister`, `kassier`, `admin`, `aktuar`, `vorstand`.
   - **Erfassungsrecht (`canAdd()`):** Rollen `admin`, `materialwart`, `schuetzenmeister`.
   - **Löschrecht (`canDelete()`):** Rollen `admin`, `materialwart`.
   - **Portal-Berechtigungen (`auth.has_permission`):** `inventar.view` (Lesen), `inventar.manage` (Schreiben).

2. **Row Level Security (RLS) in PostgreSQL:**
   - Authentifizierte Vorstands- und Materialwart-Benutzer besitzen `SELECT`- und `ALL`-Rechte gemäss `auth.has_permission('inventar.manage')` bzw. Rollenprüfung.
   - Entwicklungs- und Service-Policies (`*_anon_dev`) sichern die nahtlose Funktion im Frontend-Client ab.

---

## 5. Frontend-Komponenten & Lifecycle

Das Modul ist modular im Verzeichnis `vorstand/js/inventar/` aufgeteilt:

```text
vorstand/js/inventar/
├── inventar-core.js      # State, Lade-Routine, Adressbuch-Mapping, Berechtigungen & Lifecycle
├── inventar-ui.js        # Tab-Navigation, UI-Shell, Dropdown-Hydration, Formular-Toggles
├── inventar-cart.js      # Warenkorb-Engine, Multi-Item Checkout/Checkin/Verkauf, FiBu-Buchung
├── inventar-list.js      # Bestandesanzeige mit Spaltensortierung, Filter, Admin-CRUD
├── inventar-journal.js   # Offene Ausleihen, Transaktionen, Finanz-/Pfandkasse, Audit-Log
└── inventar-pdf.js       # jsPDF-Quittungsengine mit Dual-Signatur & Notfall-Rekonstruktion
```

### 5.1 Lifecycle beim Modulstart (`loadInventarData`)
1. **Container prüfen:** Ermittelt `#inventar-container` in `view-inventar`.
2. **Cache-Prüfung:** Wurden die Daten bereits geladen und kein `force = true` übergeben, wird sofort aus `inventarState` gerendert.
3. **Paralleler Supabase-Fetch:**
   - `inventory_items` (alle Artikel)
   - `inventory_transactions` (letzte 250 Buchungen)
   - `inventory_deposits` (alle Pfandpositionen)
   - `inventory_audit_log` (letzte 60 Audit-Logs)
   - `inventory_config` (Dropdown-Konfigurationen)
   - `members` (Mitglieder-Stammdaten zur Klarnamenauflösung)
4. **Initialisierung `initInventarUI`:**
   - HTML-Gerüst rendern (`renderInventarUI`)
   - Canvas-Signatur-Pads binden (`SignaturePad`)
   - Dropdowns und Filter befüllen (`fillInventarDropdowns`)
   - Tabellen aufbauen (`renderJournalTables`)
   - Letzten aktiven Tab wiederherstellen (`showInventarSection`).

### 5.2 Pfandausleihe & RechnungsCore-Integration
- **Validierung bei Pfand-QR-Rechnung:** Wird bei einer Ausgabe («Checkout») die Zahlungsmethode «QR-Rechnung (Einzahlungsschein)» gewählt, verlangt das Frontend zwingend einen Pfandbetrag $> 0$. Ein stillschweigendes Überspringen bei Betrag 0 ist ausgeschlossen.
- **Zentraler RechnungsCore (`DP` / `Depot / Pfand`):** Pfandrechnungen werden über `window.RechnungsCore.createInvoice(invoiceOrder)` mit Typ `Depot / Pfand`, Buchungskonto `2030` (Kautionen / Depots) und Präfix `DP` angelegt und verbleiben für den gebündelten Vorstand-Massenversand in `mail_status: 'entwurf'`.
- **PDF-Synchronisation (Richtlinie 6):** Die PDF-Generierung wird über `RechnungsCore.renderPdf(invoiceId, { forceRecreate: true })` angestossen und im Supabase Storage hinterlegt. Bei Fehlern wird ein klarer UI-Fehler geworfen (keine stillen Fallbacks).
- **Standard-Depot für Bekleidung:** Für alle Vereinsbekleidungs-Artikel (`category = 'kleidung'`) ist in `public.inventory_items` ein Standard-Depotbetrag von CHF 25.00 hinterlegt.

### 5.3 Vereinfachtes Bestands- & Artikelmanagement (Harmonisiertes Modal)
- **Konsolidierung im Tab «Bestand»:** Der historische, verwirrende Tab «Admin» wurde vollständig eliminiert.
- **Neuer Artikel & Bearbeiten:** Im Kopfbereich des Bestands existiert nun der Button `[➕ Neuer Artikel]`, welcher ein fokussiertes Dialogfenster (`#modal-inventar-item`) passend zur gewählten Kategorie (Gewehre, Schlüssel, Kleidung, Schiessbekleidung) öffnet. Auch die Bearbeitung (`✏️`) bestehender Datensätze erfolgt direkt in diesem Modal vor Ort ohne Seiten- oder Tab-Sprung.
- **Mitgliederverwaltung entkoppelt:** Die Erfassung von Mitgliedern im Inventar wurde entfernt; die Daten stammen aus der zentralen Single Source of Truth `public.members`.

### 5.4 Buchungs-Storno & Zwei-Wege-Rückmeldung mit dem Rechnungsmodul
- **Storno-Aktion im Journal (`storniereInventarBuchung`):** Fehlbuchungen können von berechtigten Benutzern im Journal per Knopfdruck rückgängig gemacht werden. Dies stellt den Artikelstatus in `public.inventory_items` auf den Vorzustand zurück (z.B. zurück ins Lager), storniert offene Pfandeinträge in `public.inventory_deposits`, setzt die Transaktion in `inventory_transactions` auf `STORNO` und storniert bzw. löscht eine verknüpfte, unbezahlte Entwurfsrechnung im Rechnungsmodul. Bar-Kassenbuchungen bleiben davon unberührt.
- **Zwei-Wege-Kopplung bei Rechnungs-Löschung (`rnDeleteInvoicePrompt`):** Löscht ein Benutzer eine Inventar- oder Depot-Rechnung im Modul Rechnungen, meldet das Rechnungsmodul dies an das Inventar zurück: Die verknüpften Artikel werden automatisch wieder auf `Im Lager` gesetzt, die Transaktion auf `STORNO` aktualisiert und offene Pfandeinträge storniert.

### 5.5 Schlüssel-Bezeichnungen & Flexible Bekleidungs-Attribute (Migration 58)
- **Feste Schlüssel-Optionen:** Schlüsselbezeichnungen sind gemäss Vorstandsbeschluss standardmässig auf exakt 5 Werte beschränkt: `allgemein`, `Wirtschaftsraum`, `Tresor 1`, `Tresor 2`, `Tresor 3`. Diese werden über `public.inventory_config` (`config_key: 'Schluessel_Bezeichnung'`) gesteuert.
- **Datalist-Comboboxen für Bekleidung:** Für Grössen und Bekleidungstypen kommen HTML5-Datalists zum Einsatz. Benutzer können aus Standardvorschlägen wählen oder freie Werte erfassen, welche bei der Speicherung automatisch in `inventory_config` übernommen werden.
- **Harmonisiertes Erfassungsmodal:** Das Modal `#modal-inventar-item` folgt mit Primary-Header und abgerundetem Design dem einheitlichen Vorstand-Portalstandard.

### 5.6 Robuster Sponsoring-Abzug, TableKit-Harmonisierung & Du-Form (Migration 62)
- **Katalogpreis- & Sponsoring-Invarianten:** Beim Materialverkauf von Bekleidung wird auf Rechnungen immer der reguläre Katalogpreis vor Sponsoring (z.B. CHF 83.00) und der Sponsoringabzug der hinterlegten Sponsor-Firma (z.B. -CHF 20.00) als separate Positionen ausgewiesen. Fehlt `retail_price` in der Datenbank, ermittelt das System den Basispreis automatisch aus `purchase_price` bzw. `selling_price + discount_amount`. Ein DB-Trigger (`trg_inventory_auto_retail_price`) sichert diese Konsistenz bei Mutationen dauerhaft ab.
- **Globaler Tabellen- & Modal-Standard:** Bestandes- und Pfandtabellen nutzen das helle Design (`table-light`), integrierte Live-Suche sowie `TableKit` (Spaltenbreiten anpassen, Spalten ein-/ausblenden, horizontales Verschieben per Drag & Drop via `TableKit.makeColumnReorderable`). Zur synchronen Spaltensteuerung in der Bestandsliste besitzen sowohl alle Kopfzeilen als auch sämtliche Datenzellen einheitliche `data-col-id`-Attribute, wodurch das dynamische Ein- und Ausblenden über das Dropdown sowie das Verschieben der Spalten ohne Tabellenversatz arbeitet. Die Standard-Reihenfolge der Preisspalten folgt der kaufmännischen Logik (`Katalogpreis` vor `Sponsoring`, gefolgt von `Verkaufspreis`, `Kaufpreis`, `Grundpreis` und `Veredelung`). Die Aktions-Spalte mit Bearbeiten- und Löschen-Buttons ist als «Aktionen» beschriftet. Das Erfassungsmodal ist via `UIModalKit` verschieb-, maximier- und skalierbar und bietet im Bearbeitungsmodus eine direkte Löschfunktion.
- **Einheitliche Du-Kultur (Regel 8):** Sämtliche Benutzerhinweise, Tooltips und Formularmeldungen sprechen den Benutzer vereinsnah in der Du-Form an.

### 5.7 Variable Sponsor-Firma, Bestands-Export & Druckfunktionen (Migration 63)
- **Variable Sponsoring-Firma (`sponsor_company`):** Die Sponsoring-Firma ist in `public.inventory_items` als eigenständige Spalte hinterlegt und nicht mehr hartcodiert. Bestehende Datensätze sind mit «Clientis» bzw. früheren Sponsoren vorbelegt. Das Erfassungsmodal bietet ein Eingabefeld «Sponsor-Firma», und bei Materialverkäufen wird der Name der Firma dynamisch im Warenkorb sowie auf der generierten Rechnung («Sponsoringbeitrag [Firma]») ausgewiesen. Die Excel-Import-Engine erkennt Spaltenköpfe wie `Sponsor`, `Sponsor-Firma` oder `Firma` automatisch.
- **Excel-Export (`exportInventarExcel` via SheetJS):** Über ein Dropdown im Bestand kann entweder die aktuell ausgewählte Kategorie als Einzel-Tabelle oder das gesamte Inventar (alle 4 Kategorien als separate Arbeitsmappen-Reiter) exportiert werden. Zahlen und Währungen werden sauber formatiert und verknüpfte Besitzer-IDs als Klarnamen ausgegeben.
- **Druck- & PDF-Ausgabe (`printInventarBestand`):** Eine dedizierte Druckansicht im Vereinsdesign erlaubt den Ausdruck der Bestände nach aktueller Kategorie oder über das gesamte Inventar (nach Kategorien gegliedert). Sie enthält KPI-Zusammenfassungen (Gesamtanzahl, im Lager, ausgegeben), Stichtagsangabe und A4-Landscape-Optimierung.
- **Bereinigung von Migrationsrelikten:** Der veraltete Button «Neu laden» oben rechts im Inventar sowie temporäre «Supabase»-Badges und Hinweistexte im gesamten Portal wurden vollständig entfernt.

### 5.8 Standardisierte Preis-Begrifflichkeiten, 2-zeilige Header & Habenkonto-Persistierung (Migration 64)
- **Kaufmännische Begriffs-Harmonisierung:** Alle Beschriftungen in Erfassungsmodalen, Bestandslisten, Exporten, Druckansichten und im Excel-Import wurden einheitlich auf die vereinsweit verbindliche Nomenklatur umgestellt:
  - `Einstandspreis Material` (ehemals *Grundpreis*)
  - `Einstandspreis Druck` (ehemals *Veredelung*)
  - `Total Einstandspreis` (ehemals *Kaufpreis*)
  - `Verkaufspreis gerundet` (ehemals *Katalogpreis*)
  - `Sponsoring Beitrag` (ehemals *Sponsoring*)
  - `Endpreis für Mitglied` (ehemals *Verkaufspreis*)
- **Automatischer Zeilenumbruch für Tabellen-Header:** In der Bestandsliste und im `TableKit` brechen lange Spaltentitel (`th`) beim Zusammenschieben oder auf schmalen Bildschirmen automatisch harmonisch auf zwei Zeilen um (`white-space: normal; line-height: 1.25; vertical-align: bottom; min-width: 80px`).
- **Persistierung des Haben-Kontos in Supabase (`public.inventory_config`):** 
  - Die Auswahlliste für das Ertragskonto beim Materialverkauf wurde von «Ertrag Kleiderverkauf» auf «Ertrag Materialverkauf» verallgemeinert.
  - Das gewählte Haben-Konto wird in Supabase unter `public.inventory_config` (`config_key: 'inventar_haben_konto_verkauf'`, Default `8501`) bzw. für Depots unter `inventar_haben_konto_depot` (Default `2030`) dauerhaft gespeichert.
  - Jede manuelle Änderung im Dropdown wird sofort asynchron nach Supabase sowie `localStorage` synchronisiert.
  - Die Übergabe an den zentralen `RechnungsCore` erfolgt verlässlich über `accountHaben: customKontoHaben` in allen `InvoiceOrder`-Positionen.
- **Excel-Import & Mustervorlage:** Die Mustervorlage `.xlsx` enthält die Spalte `Sponsor-Firma` (z.B. «Clientis») sowie die neuen Fachbegriffe. Die Parsing-Engine unterstützt sowohl die neuen als auch die historischen Begriffe tolerant via Fuzzy-Matching und deutscher Umlaut-Normalisierung.

### 5.9 Sponsoring-Invarianten, Warenkorb-Responsivität & Portal-Sidebar (Migration 65)
- **Mathematische Harmonisierung (`retail_price = 83.00`):** Bei der Trainer-Jacke wurde der Katalogpreis auf CHF 83.00 nachgeführt, womit die kaufmännische Gleichung `Verkaufspreis gerundet (83.00) - Sponsoring Beitrag (19.00) = Endpreis für Mitglied (64.00)` exakt aufgeht. In `inventar-cart.js` wird die Rechnungserstellung zusätzlich abgesichert: Liegt ein Sponsoring vor, wird der Bruttobetrag dynamisch als `endBetrag + sponsorDiscount` abgeleitet, sodass Sponsoring-Zeilen niemals verloren gehen.
- **Warenkorb-Responsivität & Löschspalte:** Die Tabelle im Erfassungs-Warenkorb ist nun horizontal scrollbar (`table-responsive`, `overflow-x: auto`), Sponsoring-Badges brechen zweizeilig um und die Aktionsspalte besitzt eine feste Mindestbreite, wodurch der Lösch-Button `[✕]` jederzeit vollständig sichtbar und bedienbar bleibt.
- **Scrollbare Sidebar & Sticky Header:** Die linke Modulleiste des Vorstandsportals (`.sidebar`) ist auf Desktop-Viewports vertikal scrollbar mit dezenter Scrollbar und sticky Header (`Muhen Portal` & Benutzerstatus).

### 5.10 Bestands-Responsivität, Sticky-Spalten & Dropdown-Z-Index-Absicherung
- **Dropdown-Z-Index & Stacking-Schutz:** Die Toolbar-Aktionsleiste im Bestand (`.inv-toolbar-card`) besitzt eine priorisierte Stacking-Ebene (`z-index: 45; overflow: visible`). Die Dropdown-Menüs für `Excel-Export` und `Drucken` nutzen Bootstrap Poppers Fixed-Strategy (`strategy: 'fixed'`, `z-index: 1070`), wodurch ein Vordrängen bzw. Überlagern durch den nachfolgenden Tabellenkopf (`<thead>`) wirksam verhindert wird.
- **Sticky Spalten (ID links & Aktionen rechts):** In der Bestandsliste sind die `ID`-Spalte links (`inv-col-sticky-id`, `left: 0`) und die `Aktionen`-Spalte rechts (`inv-col-sticky-action`, `right: 0`) fixiert. Beim horizontalen Scrollen breiter Bestände bleiben Artikel-Identifikation sowie Bearbeiten- und Löschen-Buttons dauerhaft im Blickfeld und ohne Rechts-Scrollen direkt bedienbar.
- **Kompakte Standard-Spaltensichtbarkeit:** Interne Preiskomponenten wie «Einstandspreis Material», «Einstandspreis Druck», «Total Einstandspreis» und «Kaufdatum» sind standardmässig per `data-col-default="hidden"` ausgeblendet, wodurch die Hauptansicht auf Standardbildschirmen sofort ohne horizontales Scrollen übersichtlich bleibt und bei Bedarf über das Dropdown «Spalten» eingeblendet werden kann.



