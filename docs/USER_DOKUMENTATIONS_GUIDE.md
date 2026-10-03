# Entwickler- & Anwender-Leitfaden: Dokumentations-Konzept & KI-Zusammenspiel

> **Hinweis zur Nutzung:** Dieses Dokument dient ausschliesslich der Orientierung für den menschlichen Entwickler / Projektleiter (**«User-Info»**).  
> Es muss von der KI bei der Programmierung **nicht** eingelesen werden, sondern fasst die Arbeitsweise und Regeln kompakt zusammen.

---

## 1. Das 3-Stufen-Modell: Wie die KI Dokumente liest

Es muss bei einer Programmier-Aufgabe **niemals alles eingelesen werden**. Das System arbeitet nach einem schlanken 3-Stufen-Prinzip:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ STUFE 1: AUTOMATISCH BEI JEDEM PROMPT (0 Aufwand für Sie)                   │
│          AGENTS.md                                                          │
│          Wird bei jeder Anfrage zwingend als Systemregel mitgesendet.       │
│          Enthält die unverrückbaren Gesetze (GAS-Verbot, Single Source of   │
│          Truth, Rückfragepflicht, Deployment-Pflicht, Rechnungs-Lifecycle). │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STUFE 2: GEZIELT ON-DEMAND (KI liest NUR das betroffene Fachdokument)       │
│          Je nach Thema wird exakt EIN Dokument geöffnet:                    │
│          - Jahresbeitrag       ──► docs/JAHRESBEITRAG.md                    │
│          - Rechnungswesen      ──► docs/RECHNUNGSWESEN.md                   │
│          - PDF- & Mail-Layout  ──► docs/DOCUMENT_AND_MAIL_ENGINE_SPEC.md    │
│          - Jahresmeisterschaft ──► docs/JAHRESMEISTERSCHAFT.md              │
│          - Mitglieder & SSV    ──► docs/MITGLIEDER_UND_SSV.md               │
│          - Buchhaltung & Bank  ──► docs/FINANZBUCHHALTUNG_UND_BANK.md       │
│          - Vermietung          ──► docs/VERMIETUNG_SCHUETZENSTUBE.md        │
│          - Inventar            ──► docs/INVENTAR.md                         │
│          - Mail-Verteiler      ──► docs/MAIL_VERTEILER.md                   │
│          - Datenbank / Schema  ──► docs/SUPABASE_ARCHITECTURE.md            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼ (Nur bei unklarer Zuständigkeit)
┌─────────────────────────────────────────────────────────────────────────────┐
│ STUFE 3: SYSTEMWEITE NAVIGATION                                             │
│          docs/SYSTEM_ARCHITECTURE_MASTER.md (Kurzübersicht, 160 Zeilen)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Pflegeaufwand: Was muss wann aktualisiert werden?

* **Reine Kosmetik & Textanpassungen (CSS, Farben, Bezeichnungen, Tippfehler):**  
  $\rightarrow$ **0 Dokumentations-Aufwand!** Keine Dokumente anfassen.
* **Fachliche Invarianten, Caching & Schnittstellen (auch bei Bugfixes!):**  
  $\rightarrow$ Wenn das «Warum» hinter einer Lösung dokumentationswürdig ist (z. B. ein neues Berechnungsmodell, Cache-Busting, Modul-Kopplung oder Modal-DOM-Lifecycle):  
  $\rightarrow$ Nur das **eine betroffene Fachdokument** (z. B. `docs/JAHRESBEITRAG.md`) um 2–3 Sätze ergänzen.
* **Systemweite Grundregeln (Betrifft alle Fachmodule):**  
  $\rightarrow$ Nur in diesem Fall wird ein kurzer Spiegelstrich in [AGENTS.md](file:///c:/Users/danhu/.gemini/antigravity/scratch/migration%20supabase/AGENTS.md) ergänzt.

---

## 3. Deployment- & Synchronisations-Garantie (Regel 5)

Nach jeder vorgenommenen Code- oder Schemaänderung gilt:
1. **Edge Functions (`supabase/functions/`):** Direkt per `scp` auf CT 117 (`192.168.68.117`) kopieren und Container `supabase-edge-functions` neustarten.
2. **Datenbank-Migrationen (`supabase/migrations/`):** Per SSH-Pipe direkt in den PostgreSQL-Container `supabase-db` einspielen.
3. **Verifikation:** Smoke- / E2E-Test durchführen.
4. **Dokumentations-Check (Vor dem Commit!):** Falls Invarianten, Caching oder Schnittstellen geändert wurden, betroffenes Fachdokument in `docs/` um 2–3 Sätze nachführen.
5. **GitHub Push (`migration-supabase`):** Unmittelbar committen und pushen, damit lokaler Entwicklungsstand, Server und GitHub zu 100% synchron sind.

---

## 4. Übersicht der Fachdokumente («Das Warum»)

| Modul | Zuständiges Dokument | Beantwortete Kernfragen («Das Warum») |
| :--- | :--- | :--- |
| **Jahresbeitrag** | [`docs/JAHRESBEITRAG.md`](JAHRESBEITRAG.md) | Dynamische Gebührenordnung, Kopplung an `RechnungsCore`, Bearbeitungssperre im Rechnungsmodul, Bankabgleich. |
| **Rechnungswesen** | [`docs/RECHNUNGSWESEN.md`](RECHNUNGSWESEN.md) | `RechnungsCore`, Lebenszyklus-Sperren (Entwurf vs. Versandt vs. Bezahlt), DIN 5008 Adress-Kontrakt, Cache-Busting. |
| **PDF- & Mail-Engine** | [`docs/DOCUMENT_AND_MAIL_ENGINE_SPEC.md`](DOCUMENT_AND_MAIL_ENGINE_SPEC.md) | SIX Swiss QR Norm, DIN 5008 Geometrie, WinAnsi Zeichensatz-Schutz, SMTP Mail-Versand. |
| **Jahresmeisterschaft**| [`docs/JAHRESMEISTERSCHAFT.md`](JAHRESMEISTERSCHAFT.md) | 2D-Grid im JSONB `raw_grid`, virtuelle U21-Berechnung, Streichresultate, Gemini Vision OCR. |
| **Mitglieder & SSV** | [`docs/MITGLIEDER_UND_SSV.md`](MITGLIEDER_UND_SSV.md) | Browser-native SheetJS Diff-Engine, Quellschutz für Ehrenmitglieder, `member_history` Audit. |
| **Finanzbuchhaltung** | [`docs/FINANZBUCHHALTUNG_UND_BANK.md`](FINANZBUCHHALTUNG_UND_BANK.md) | Schweizer KMU-Kontenrahmen, doppelter Buchungssatz bei Rechnungen, CAMT.054 XML-Matching, `BIGSERIAL` Belegnummern. |
| **Vermietung** | [`docs/VERMIETUNG_SCHUETZENSTUBE.md`](VERMIETUNG_SCHUETZENSTUBE.md) | Status-Maschine mit `rental_status_logs`, dynamische Klauseln 1–8, Google Calendar als reine Leseanzeige. |
| **Inventar** | [`docs/INVENTAR.md`](INVENTAR.md) | Sportwaffen, Schlüssel & Bekleidung; Ausleihe mit digitaler Signatur; Kautions-/Pfandkasse; Materialverkauf via `RechnungsCore`. |
| **Mail-Verteiler** | [`docs/MAIL_VERTEILER.md`](MAIL_VERTEILER.md) | Ad-hoc Empfängerauswahl, Adresskaskade (`primary`/`additional`), BCC-Datenschutz, Abgrenzung zur Mail-Engine. |
| **Datenbank-Schema** | [`docs/SUPABASE_ARCHITECTURE.md`](SUPABASE_ARCHITECTURE.md) | Aktive PostgreSQL Tabellen, Fremdschlüssel und Row Level Security (RLS) Policies. |
