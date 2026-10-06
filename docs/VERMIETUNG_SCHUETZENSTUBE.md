# Fachdokumentation: Vermietung Schützenstube Rüteli

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.rental_requests`, `rental_pricing`, `rental_settings`, `rental_status_logs`, `rental_cancellation_feedbacks`  
> **Frontend:** [`vorstand/js/vermietung/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/vermietung/) + Website ([`schuetzenhaus_vermietung.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/sportschuetzen-website/frontend/schuetzenhaus_vermietung.html))

---

## 1. Übersicht & Systemgrenzen

Das Modul Vermietung steuert den gesamten Lebenszyklus der Vermietung der vereinsinternen Schützenstube «Rüteli» an Privatpersonen, Vereine und Firmen – von der Online-Buchungsanfrage über die Vertragserstellung und Rechnungsstellung bis hin zur Schlüsselrückgabe.

* **Führendes System:** Supabase PostgreSQL (`public.rental_requests`).
* **Kalender & Belegung:** Google Calendar wird zur Belegungsanzeige auf der Website genutzt. Die direkte Blockierung von Mietterminen (`Vermietet an XX`) und Reinigungspuffern (`Gesperrt für Reinigung`) sowie deren Freigabe bei Stornierung erfolgt über das verifizierte Google Cloud Service Account Dienstkonto (`vermietung-bot@kalender-api-zugriff.iam.gserviceaccount.com`) mit vollen Lese-, Schreib- und Löschrechten auf den Vereinskalender `sportschuetzen.muhen@gmail.com`.
* **Entkopplung:** Sämtliche früheren Google Docs Template-Ersetzungen, Google Drive Ablagen und manuellen GAS-Trigger wurden vollständig durch Supabase Edge Functions (`generate-pdf`, `send-email`), Supabase Storage und native API-Aufrufe abgelöst.

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum Supabase als alleiniger Daten- & Finanz-Master?
* **Problem im Altsystem:** Mietanträge wurden in Google Sheets gespeichert, Verträge per Google Docs generiert und Termine im Google Kalender eingetragen. Lief ein Script auf einen Fehler, existierte ein Kalendereintrag ohne Mietvertrag oder ein Vertrag ohne Buchungszeile.
* **Lösung & Warum:** Supabase ist die unangefochtene Single Source of Truth für alle Kunden-, Datums-, Preis- und Vertragsdaten.
* **Google Calendar Rolle:** Dient als Anzeige-Proxy für den Belegungskalender auf der Website (`FreeBusy`-Status) und wird automatisiert synchronisiert, besitzt aber keinerlei Hoheit über Kundendaten oder Zahlungen.

### 2.2 Warum ein lückenloser Status-Workflow mit Audit-Log?
* **Die Status-Maschine:**
  1. `inquiry`: Kunde reicht unverbindliche Anfrage über das Webformular ein.
  2. `approved`: Vermieter prüft und gibt die Buchung frei.
  3. `contract_sent`: Mietvertrag mit integrierter Schweizer QR-Rechnung wird automatisch generiert und per SMTP versandt.
  4. `reminded`: Automatische Zahlungserinnerung bei Fälligkeit.
  5. `paid`: Miete und Kaution sind eingegangen (Abgleich via FiBu oder Bank).
  6. `keys_issued`: Übergabe der Schlüssel & Übergabeprotokoll.
  7. `completed`: Abnahme erfolgt, Kaution rückerstattet, Beleg revisionssicher archiviert.
  8. `cancelled`: Stornierung (mit Dokumentation des Stornogrunds und Kalender-Freigabe).
* **Audit-Trail (`rental_status_logs`):** Jeder Statuswechsel wird mit Zeitstempel, vorigem Status, neuem Status und ausführendem Benutzer historisiert.

### 2.3 Warum Anbindung an `RechnungsCore` und Vorlagen-Pool?
* **Keine Insel-Lösung:** Statt eigene Rechnungsnummern zu vergeben, erzeugt das Vermietungsmodul (`ensureRentalInvoice`) eine standardisierte `InvoiceOrder` im zentralen [`RechnungsCore`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js).
* **Dynamische Rüteli-Klauseln (Phase 27):** Die 8 nummerierten Vertragsklauseln (Benützungsreglement, Nachtruhe ab 22:00 Uhr, Reinigungsgebühren, Kaution, Parkplatzordnung) werden zur Laufzeit aus `public.document_template_clauses` geladen.
* **Vorteil:** Wenn der Vorstand eine Bestimmung oder Reinigungsgebühr anpasst, gilt diese sofort für alle neuen Verträge, ohne dass Entwickler den PDF-Code anfassen müssen.

### 2.4 Warum Storno-Feedback mit Dringlichkeits-Alarm (`is_urgent`)?
* **Wiedervermietungs-Chance:** Storniert ein Mieter kurzfristig (Termin innerhalb der nächsten 14 Tage), wird der Datensatz in `rental_cancellation_feedbacks` mit `is_urgent = true` markiert.
* **Nutzen:** Der Vermieter sieht den Fall sofort im Cockpit ganz oben und kann die Schützenstube aktiv an Interessenten auf der Warteliste weitervermitteln.

### 2.5 Modernes Vorstands-Cockpit (TableKit Standard & Tarife-Verwaltung)
* **3-Register-Struktur:** Das Cockpit bündelt alle Fachaspekte in drei Reitern: `Reservationen`, `Stornorückmeldungen` und `Tarife & Einstellungen`.
* **TableKit Spalten-Steuerung:** Die Reservationstabelle ist an den globalen Vereinsstandard `TableKit.setupColumnToggle` angebunden. Spalten (Datum, Mieter Name, Vertrags-Nr., Festbeginn, Kontakt, Mietbetrag, Status, Aktionen) lassen sich beliebig ein-/ausblenden und werden persistent im `localStorage` (`tk_cols_vermietung`) gesichert.
* **Zentralisierte Tarife:** Mietpreise (`rental_pricing`) und Konfigurationswerte (`rental_settings`) werden in einer einheitlichen Maske gepflegt und atomar synchronisiert.

### 2.6 Mehrseitiger Mietvertrag & dynamische Gebühren (Phase 42 & 43)
* **Dynamische Gebühren, Zahlungsfrist & Vermieterkopf:** Ziffer 6 (Zuständigkeit Vermietung) und die Gebühren für Zusatz-Cheminéeholz (`wood_fee`), Kehrichtsäcke (`garbage_bag_fee`), Nachreinigung (`cleaning_fee_per_hour`), Stornierung (`storno_fee`) sowie Glasbruch (`glass_fee`), Teller (`plate_fee`) und die **Zahlungsfrist** (`payment_due_days`, Standard: 14 Tage) werden direkt im Modul *Vermietung Schützenstube* konfiguriert, in `public.rental_settings` persistiert und über Platzhalter `{zahlungsfrist_tage}` nahtlos in Vertrag und QR-Rechnung eingesetzt. Das **Mietobjekt (Bezeichnung Vertrag)** wird im Modul *Dokumente* direkt in der Vorlage verwaltet, sodass Vertragswortlaut und Berechnungs-Variablen sauber getrennt sind.
* **Platzhalter im Klausel-Editor:** Das Bearbeiten-Modal für Benützungsordnungs-Klauseln bietet eine direkte Klick-Leiste aller Vertrags- und Vermieter-Variablen, welche direkt an der Cursor-Position in Klauseltext und -titel eingefügt werden.
* **Entfall von Übergabeprotokoll & Unterschriften:** Gemäss Ziffer 7 gilt der Vertrag mit fristgerechter Bezahlung des QR-Einzahlungsscheins als abgeschlossen; manuelle Unterschriftszeilen und das Übergabeprotokoll wurden entfernt. Aufzählungszeichen (Bullets) fliessen zeilenweise mit hängendem Einzug sauber untereinander.
* **Dedizierte Schlussseite für QR-Rechnung:** Die Schlussseite positioniert den Vereinskopf oben bündig (analog Seite 1) und platziert die Buchungs- & Zahlungsdetails in einer übersichtlichen Box direkt über dem Schweizer QR-Zahlteil (SIX SPC 0200 1 Standard, 105 mm).

### 2.7 Vorlagen-Zentrale & Live-Vorschau der 8 Workflow-Mails (Phase 39 & 40)
* **Entkopplung der E-Mail-Texte:** Sämtliche 8 Vermietungs-Mails (`vm_vertrag`, `vm_anfrage`, `vm_mahnung`, `vm_bestaetigung`, `vm_schluessel`, `vm_storno`, `vm_storno_verzug`, `vm_info_wirtschaft`) sind vollständig in `public.document_templates` überführt und im Modul *Dokumente-Vorlagen* in einer eigenen hervorgehobenen Zeile («Fachbereich Vermietung Schützenstube») editierbar.
* **Live-Mail-Vorschau für Rechnungen:** Im Vorlagen-Pool werden bei Rechnungen & Mahnwesen keine Klauseln mehr angezeigt, sondern eine responsive E-Mail-Vorschau mit dynamischen Rechnungsmustern.
* **Sonderfall Vorab-Terminanfrage (`vm_anfrage`):** Bei unverbindlichen Anfragen über das Webformular (Puffertage, parallele Aktivitäten) erhält der Interessent automatisch eine freundliche Eingangsbestätigung (`vm_anfrage`), während der Verein intern zur Terminprüfung benachrichtigt wird.
* **Internes Info-Mail an Wirtschaftsverantwortliche (`vm_info_wirtschaft`):** Wird erst ausgelöst, wenn die Miete **definitiv bezahlt** ist (`status = 'paid'`), damit das Wirtschaftsteam den Termin für Schlüsselübergabe und Getränke fix einplanen kann. Die Empfängeradresse wird dynamisch aus dem Modul *System-Mails* (`public.system_mail_configs`, Schlüssel `Info_Mail_an_Wirtschaftsverantwortliche`) via Edge Function aufgelöst.
* **Storno-Differenzierung (`vm_storno_verzug` vs. `vm_storno`):** Bei Stornierungen nach erfolgloser Mahnung wird automatisch die Verzugsvorlage verwendet; für mieterseitige Absagen die allgemeine Stornobestätigung.
* **Harmonisiertes Platzhaltersystem & Grussformel:** Variablen sind rollenbasiert gegliedert (`{mieter_...}`, `{vermieter_...}`, `{wirtschaft_...}`). Die Grussformel speist sich konsistent aus den Vermieter-Kontaktdaten der `rental_settings`.
* **Live-HTML-Vorschau:** E-Mail-Texte werden beim Tippen in Echtzeit im offiziellen Corporate-Design der Sportschützen Muhen (Header-Banner, Paragraphen, Footer) mit Muster-Daten gerendert.
* **Striktes Fallback-Verbot & Betriebssicherheit (`is_system = true`):** Das System führt keine stillen Code-Fallbacks mehr aus. Fehlende Vorlagen führen zu klaren Fehlermeldungen. Ein PostgreSQL-Trigger verhindert das versehentliche Löschen von System-Vorlagen.
* **Zusatzrechnung Wirtschaft/Vermietung:** Für nachgelagerte Aufwände (Nachreinigung, Mehrholz, Konsumationen) existiert im Rechnungsmodul die separate Vorlage `Zusatzrechnung Wirtschaft/Vermietung`.

### 2.8 Vollautomation bei Online-Reservation & Google-Kalender-Blockierung
* **Vollautomatischer Buchungsfluss:** Bei Absenden einer verbindlichen Reservation auf der Website wird unmittelbar das mehrseitige Mietvertrags-PDF inklusive Schweizer QR-Zahlteil via Edge Function `generate-pdf` generiert und in `rental_requests.contract_file_url` verlinkt. Der Mieter erhält das Dokument sofort per E-Mail (`vm_vertrag`) mit 14 Tagen Zahlungsfrist.
* **Google-Kalender-Blockierung & API-Integration:** Zeitgleich wird der Miettag im offiziellen Google Kalender ganztägig als `Vermietet an XX` (Initialen) und der Folgetag als `Gesperrt für Reinigung` geblockt. Dies erfolgt über das autorisierte Google Cloud Service Account Dienstkonto (`vermietung-bot@kalender-api-zugriff.iam.gserviceaccount.com`), das über volle Lese-, Schreib- und Löschrechte auf `sportschuetzen.muhen@gmail.com` verfügt.
* **Überwachungs-Cockpit des Vorstands:** Das Cockpit dient der reinen Überwachung der Fristen. Bei Zahlungseingang wird mit *«Zahlung bestätigen»* der Status auf `paid` gesetzt, die Zahlung im `RechnungsCore` verbucht, dem Mieter die Bestätigung (`vm_bestaetigung`) zugestellt und das Wirtschaftsteam (`vm_info_wirtschaft`) benachrichtigt. Bei Stornierung werden die Kalender-Blockierungen wieder freigegeben.

### 2.9 Proforma-Rechnung, CAMT-Bankabgleich & Zwei-stufiger Zahlungsvermerk (Phase 41)
* **Automatische Proforma-Rechnung:** Bei der Erstellung des Mietvertrags wird über die RPC-Funktion `ensure_rental_proforma_invoice` sofort ein korrespondierender Proforma-Rechnungsdatensatz (`invoices`, Präfix `VM-YY-NNNN`) mit Ertragskonto 3400 (Ertrag Vermietung Schützenhaus) angelegt und atomar in `rental_requests.invoice_id` hinterlegt.
* **CAMT-Bankabgleich (Buchhaltung):** Beim Einlesen von Bankauszügen (CAMT.053 / CAMT.054) im Buchhaltungsmodul matcht das System den Zahlungseingang anhand der Buchungsnummer (z. B. `V-2026-0105`) oder der Rechnungsnummer und bucht den Zahlungssatz automatisch ins Journal (Soll 1020 Bank, Haben 3400 Miete).
* **Zwei-stufiger Zahlungsvermerk:**
  * **Stufe 1 («Info-Mail Bank»):** Wird im Vermietungs-Cockpit über *«Info-Mail Bank vermerken»* oder bei Eingang der Bank-Benachrichtigung gesetzt (`status_raiffeisen = 'bank_notified'`). Visuelle Kennzeichnung im Cockpit und in der Tabelle: **hellgrün** (`#dcfce7`, Text `#15803d`, Rand `#86efac`).
  * **Stufe 2 («FIBU gebucht»):** Wird vollautomatisch durch den CAMT-Bankabgleich bei der Buchung im FIBU-Journal gesetzt (`status_raiffeisen = 'fibu_gebucht'`, `datum_raiffeisen = bookingDate`). Visuelle Kennzeichnung: **dunkelgrün** (`#166534`, Text weiss).
* **Mahnwesen-Abgrenzung:** Vermietungsrechnungen sind im kaufmännischen Mahnwesen des Rechnungsmoduls strikt gesperrt. Das Mahnwesen für Mietverträge erfolgt ausschliesslich über das Vermietungsmodul zur Terminsicherung.
* **Empfänger- und CC-Verteiler:** Mietvertrags-Mails werden an den Mieter adressiert; eine CC-Kopie geht gezielt an den System-Mail-Verteiler (`public.system_mail_configs`, Schlüssel `Info_Mail_an_Wirtschaftsverantwortliche`). Die Absenderadresse des Vereins wird nicht in CC genommen.

---

## 3. Datenmodell (Kern-Tabellen)

| Tabelle | Primärschlüssel | Zweck & Invarianten |
| :--- | :--- | :--- |
| `public.rental_requests` | `id` (UUID) | Alle Mietbuchungen (Mieter, Adresse, Mietdatum, Personenzahl, Tarif, Rechnungs-Link, Status). |
| `public.rental_pricing` | `id` (UUID) | Tarifordnung (Standard-Tag, Wochenend-Tarif, Mitglieder-Rabatt, Halbtag). |
| `public.rental_settings` | `key` (TEXT) | Dynamische Einstellungen (Standard-Mietzeiten, Kautionstarif, Bankverbindung). |
| `public.rental_status_logs` | `id` (UUID) | Revisionssicherer Audit-Trail aller Statusänderungen. |
| `public.rental_cancellation_feedbacks` | `id` (UUID) | Stornierungsgründe und Mieter-Feedback. |

---

## 4. Berechtigungen & RLS

* **Mietanfrage erstellen (Public):** Jeder Webseitenbesucher darf Anfragen anlegen (`status = 'inquiry'`).
* **Eigene Anfrage einsehen:** Authentifizierte Kunden über E-Mail-Matching.
* **Verwalten (`vermietung.edit`, `vermietung.approve`):** Rollen `vermieter`, `vorstand` und `admin`.
