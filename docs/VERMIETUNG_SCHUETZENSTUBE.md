# Fachdokumentation: Vermietung Schützenstube Rüteli

> **Status:** PRODUKTIV (Supabase Single Source of Truth)  
> **Stand:** Oktober 2026  
> **Komponenten:** `public.rental_requests`, `rental_pricing`, `rental_settings`, `rental_status_logs`, `rental_cancellation_feedbacks`  
> **Frontend:** [`vorstand/js/vermietung/`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/vermietung/) + Website ([`schuetzenhaus_vermietung.html`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/sportschuetzen-website/frontend/schuetzenhaus_vermietung.html))

---

## 1. Übersicht & Systemgrenzen

Das Modul Vermietung steuert den gesamten Lebenszyklus der Vermietung der vereinsinternen Schützenstube «Rüteli» an Privatpersonen, Vereine und Firmen – von der Online-Buchungsanfrage über die Vertragserstellung und Rechnungsstellung bis hin zur Schlüsselrückgabe.

* **Führendes System:** Supabase PostgreSQL (`public.rental_requests`).
* **Kalender & Belegung:** Google Calendar wird ausschliesslich als schreibgeschützter iCal-Feed zur Belegungsanzeige auf der Website genutzt.
* **Entkopplung:** Sämtliche früheren Google Docs Template-Ersetzungen, Google Drive Ablagen und GAS-Trigger wurden vollständig durch Supabase Edge Functions (`generate-pdf`, `send-email`) und Storage abgelöst.

---

## 2. Kern-Architektur & Das «Warum» hinter den Designentscheidungen

### 2.1 Warum Supabase als alleiniger Daten- & Finanz-Master?
* **Problem im Altsystem:** Mietanträge wurden in Google Sheets gespeichert, Verträge per Google Docs generiert und Termine im Google Kalender eingetragen. Lief ein Script auf einen Fehler, existierte ein Kalendereintrag ohne Mietvertrag oder ein Vertrag ohne Buchungszeile.
* **Lösung & Warum:** Supabase ist die unangefochtene Single Source of Truth für alle Kunden-, Datums-, Preis- und Vertragsdaten.
* **Google Calendar Rolle:** Dient nur noch als Anzeige-Proxy für den Belegungskalender auf der Website (`FreeBusy`-Status), besitzt aber keinerlei Hoheit über Kundendaten oder Zahlungen.

### 2.2 Warum ein lückenloser Status-Workflow mit Audit-Log?
* **Die Status-Maschine:**
  1. `inquiry`: Kunde reicht Anfrage über das Webformular ein.
  2. `approved`: Vermieter prüft und gibt die Buchung frei.
  3. `contract_sent`: Mietvertrag mit integrierter Schweizer QR-Rechnung wird automatisch generiert und per SMTP versandt.
  4. `reminded`: Automatische Zahlungserinnerung bei Fälligkeit.
  5. `paid`: Miete und Kaution sind eingegangen (Abgleich via FiBu oder Bank).
  6. `keys_issued`: Übergabe der Schlüssel & Übergabeprotokoll.
  7. `completed`: Abnahme erfolgt, Kaution rückerstattet, Beleg revisionssicher archiviert.
  8. `cancelled`: Stornierung (mit Dokumentation des Stornogrunds).
* **Audit-Trail (`rental_status_logs`):** Jeder Statuswechsel wird mit Zeitstempel, vorigem Status, neuem Status und ausführendem Benutzer historisiert.

### 2.3 Warum Anbindung an `RechnungsCore` und Vorlagen-Pool?
* **Keine Insel-Lösung:** Statt eigene Rechnungsnummern zu vergeben, erzeugt das Vermietungsmodul (`ensureRentalInvoice`) eine standardisierte `InvoiceOrder` im zentralen [`RechnungsCore`](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/vorstand/js/rechnungen/rechnungen-core.js).
* **Dynamische Rüteli-Klauseln (Phase 27):** Die 8 nummerierten Vertragsklauseln (Benützungsreglement, Nachtruhe ab 22:00 Uhr, Reinigungsgebühren, Kaution, Parkplatzordnung) werden zur Laufzeit aus `public.document_template_clauses` geladen.
* **Vorteil:** Wenn der Vorstand eine Bestimmung oder Reinigungsgebühr anpasst, gilt diese sofort für alle neuen Verträge, ohne dass Entwickler den PDF-Code anfassen müssen.

### 2.4 Warum Storno-Feedback mit Dringlichkeits-Alarm (`is_urgent`)?
* **Wiedervermietungs-Chance:** Storniert ein Mieter kurzfristig (Termin innerhalb der nächsten 14 Tage), wird der Datensatz in `rental_cancellation_feedbacks` mit `is_urgent = true` markiert.
* **Nutzen:** Der Vermieter sieht den Fall sofort im Cockpit ganz oben und kann die Schützenstube aktiv an Interessenten auf der Warteliste weitervermitteln.

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
