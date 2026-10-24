# Fachdokumentation: Aplano Schicht- & Helferplaner

> **Status:** PRODUKTIV (Supabase Native & Aplano UI)  
> **Stand:** Oktober 2026  
> **Komponenten:**  
> - **Vorstandsportal:** `vorstand/index.html`, `vorstand/js/anlaesse.js` (Modul «Anlässe», Tab «Helfer & Stände»)  
> - **Mitgliederbereich:** `sportschuetzen-website/frontend/intern.html`, `sportschuetzen-website/frontend/js/member-shifts.js`  
> - **Datenbank (PostgreSQL):** `public.event_shifts`, `public.event_shift_assignments`, RPC-Funktionen `register_member_for_shift`, `cancel_member_shift_assignment`  
> **Architektur:** 2-Stufen-Modell (Vorstands-Planung & Mitglieder-Selfservice) mit Aplano-Matrix, Status-Ampel und strikter Row Level Security (RLS).

---

## 1. Übersicht & Zielsetzung

Der **Aplano Schicht- & Helferplaner** organisiert die Einsatzplanung für Schützenfeste, Bundesfeiern, Endschiessen und Vereinsanlässe der Sportschützen Muhen. Das System orientiert sich am modernen Bedienkonzept von [Aplano](https://www.aplano.de):

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      APLANO SCHICHT- & HELFERPLANER                             │
├────────────────────────────────────────┬────────────────────────────────────────┤
│ 👑 VORSTANDS-STUFE                     │ 👥 MITGLIEDER-SELFSERVICE              │
│ (/vorstand/ -> Modul Anlässe)          │ (/intern.html -> Tab Schichtplan)      │
├────────────────────────────────────────┼────────────────────────────────────────┤
│ - Timeline-Matrix nach Ständen & Zeit  │ - Übersicht anstehender Vereinsanlässe │
│ - Stände anlegen (Grill, Kasse, Bar)   │ - «Meine Helfereinsätze» (Persönlich)  │
│ - Helfer manuell zuweisen & bestätigen │ - 1-Klick-Selbsteintrag mit Profil     │
│ - A4-Druckansicht für Festzelt-Aushang │ - Verhinderungs- & Abmeldefunktion     │
│ - Status-Pills (Voll, Offen, Teilweise)│ - Live-Aktualisierung der freien Slots │
└────────────────────────────────────────┴────────────────────────────────────────┘
```

---

## 2. Die beiden Fach-Stufen im Detail

### 2.1 Stufe 1: Vorstandsportal (`vorstand/js/anlaesse.js`)
* **Aplano-Matrix (Timeline):** Zeilen bilden die Stände und Bereiche (Kasse 1, Kasse 2, Grill & Küche, Ausschank, Bar, Service, Springer, Standblattbüro) mit individuellen Farbstreifen und Icons. Spalten bilden die chronologischen Zeitfenster (z.B. 10:00–14:00, 14:00–18:00, 18:00–23:00).
* **Visuelle Besetzungsindikatoren:**
  - 🟢 **Voll:** Alle benötigten Helfer eingeteilt (`● 2/2 Voll`).
  - 🟡 **Teilweise:** Mindestens 1 Helfer eingeteilt, weitere gesucht (`● 1/2 Teilweise`).
  - 🔴 **Offen:** Noch kein Helfer vorhanden (`● 0/2 Offen`).
* **Schnell-Aktionen:**
  - Klick auf ein leeres Feld öffnet den Dialog «Neue Schicht erfassen» mit Vorbelegung von Stand und Zeitfenster.
  - Zuweisen von Helfern mit Vor- und Nachname, Telefonnummer und Rolle.
  - Bestätigungsstatus («Bestätigt» / «Offen») mit 1 Klick umschalten.
* **A4-Druckansicht:** 1-Klick-Export («Drucken (A4)») erzeugt eine druckoptimierte Querformat-Tabelle aller Schichten und Helfer zum Aushang an den Festständen.

---

### 2.2 Stufe 2: Mitglieder-Selfservice (`sportschuetzen-website/frontend/intern.html`)
* **Geschützter Zugang:** Mitglieder loggen sich mit ihrem Vereinskonto ein (`AuthSession`).
* **Anlass-Auswahl:** Dropdown erlaubt das Umschalten zwischen allen geplanten und aktiven Vereinsanlässen.
* **Bereich «Meine Helfereinsätze»:**
  - Zeigt dem angemeldeten Mitglied sofort alle eigenen Schichten mit Datum, Stand, Uhrzeit und den Namen der Schicht-Partner.
  - Enthält einen Abmelde-Button («Verhindert? Einsatz abgeben») mit Rückfrage.
* **1-Klick-Eintragung («Ich übernehme diese Schicht»):**
  - Bei offenen oder teilweise besetzten Schichten öffnet ein Klick das Anmelde-Modal.
  - Vorname, Nachname, E-Mail und Telefonnummer werden automatisch aus dem eingeloggten Mitgliederprofil vorbelegt.

---

## 3. Datenbankmodell & Revisionssicherheit (PostgreSQL)

### 3.1 Tabellen in Supabase

| Tabelle | Primärschlüssel | Wichtige Felder | Zweck |
| :--- | :--- | :--- | :--- |
| `public.event_shifts` | `id` (UUID) | `event_id`, `area`, `role_name`, `shift_date`, `start_time`, `end_time`, `required_helpers`, `status` | Schicht-Definitionen eines Anlasses. |
| `public.event_shift_assignments` | `id` (UUID) | `shift_id`, `user_id`, `helper_name`, `helper_phone`, `helper_email`, `confirmed_by_helper`, `confirmation_date`, `notes` | Einzelne Helfer-Zuteilungen. |

### 3.2 Sichere RPC-Funktionen (`SECURITY DEFINER`)
* **`public.register_member_for_shift(p_shift_id, p_name, p_phone, p_email, p_notes)`:**
  1. Prüft, ob die Schicht existiert und zu einem aktiven Anlass gehört.
  2. Zählt die bestehende Belegung und blockiert Überbuchung (`assigned >= required_helpers`).
  3. Verhindert doppelte Eintragung derselben Person auf derselben Schicht.
  4. Trägt den Helfer mit `user_id = auth.uid()` ein und aktualisiert den Schichtstatus (`filled` bzw. `partially_filled`).
* **`public.cancel_member_shift_assignment(p_assignment_id)`:**
  1. Prüft die Eigentümerschaft: Nur das eingeteilte Mitglied (`user_id = auth.uid()`) oder Vorstandsmitglieder (`anlaesse.manage`) dürfen die Zuteilung aufheben.
  2. Entfernt die Zuteilung und stellt den Schichtstatus auf `open` oder `partially_filled` zurück.

---

## 4. Sicherheitsarchitektur & Schutz vor Angriffen von aussen

* **Strikter RLS-Schutz:** Anonymous (`anon`) besitzt **keine** direkten Schreibrechte auf `event_shifts` oder `event_shift_assignments`. Manipulationen von aussen ohne Vereins-Login sind verunmöglicht.
* **Datenschutz:** Telefonnummern und E-Mail-Adressen von Helfern sind durch RLS geschützt und werden nur an autorisierte Vereinsmitglieder und Vorstände ausgeliefert.
* **Race-Condition-Schutz:** Durch die serverseitige Zählung innerhalb der Postgres-Transaktion in `register_member_for_shift` können sich nicht versehentlich zwei Personen gleichzeitig den letzten freien Helferplatz sichern.
