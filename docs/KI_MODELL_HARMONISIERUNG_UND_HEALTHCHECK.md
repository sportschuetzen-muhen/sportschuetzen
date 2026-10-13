# Fachdokumentation: KI-Modell-Harmonisierung & Automatischer Healthcheck

> **Status:** PRODUKTIV IMPLEMENTIERT  
> **Stand:** 13. Oktober 2026  
> **Komponenten:** Cloudflare Worker (`v1-vorstand.js`), Supabase PostgreSQL (`system_app_configs`, `mail_logs`, `pg_cron`, `pg_net`), Vorstand-Cockpit (`ai-health.js`, `#modal-ai-health`)  

---

## 1. Ausgangslage & Problemstellung

Google deprecatiert ältere Gemini-Modelle (wie z.B. `gemini-2.5-flash` mit HTTP 404 *«no longer available»*) und verzeichnet bei einzelnen Flagship-Modellen (z.B. `gemini-3.8-flash` mit HTTP 503 *«UNAVAILABLE: high demand»*) temporäre Kapazitätsengpässe.

Da mehrere Fachmodule des Vereinsportals KI-Dienste nutzen:
1. **KI-News & Social Media** (Berichtserstellung, Bildinhaltsanalyse, Instagram/Facebook-Snippets)
2. **Protokoll-Archiv & Vision OCR** (Transkription alter Handschriften, Sütterlin & Fraktur)
3. **Standblatt-Erkennung** (PWA-Upload, SSV-Lizenz-, Barcode- und Anlass-Matching)
4. **Resultate OCR** (Auswärtige Schiessen, Rundenresultate)
5. **Umfragen / Generalversammlung** (Generierung von Einladungstexten)

durfte kein Modul mehr hardcodiert von einem einzelnen Sprachmodell abhängen. Bei einem Modell-Ausfall muss das System selbstheilend und transparent reagieren.

---

## 2. Architektur: 3-Säulen-Modell der KI-Harmonisierung

```mermaid
flowchart TD
    subgraph Trigger ["1. Trigger"]
        Cron["Supabase pg_cron (täglich 04:00 Uhr)<br/>& Cloudflare Worker scheduled()"]
        Manual["1-Klick Button im Cockpit<br/>(News & Resultate)"]
    end

    subgraph Worker ["2. Cloudflare Worker: checkAndTestAiModels()"]
        Catalog["Google API: GET /models"]
        Ping["Mini-Ping Test aller Kandidaten<br/>(Latenz, Status 200/503/404)"]
        Decide["Primärmodell & Fallback-Kette ermitteln"]
    end

    subgraph Supabase ["3. Single Source of Truth: Supabase CT 117"]
        Config["system_app_configs<br/>(ai_model_health, ai_primary_model)"]
        Alert["mail_logs<br/>(system_alert bei Ausfall)"]
    end

    Trigger --> Worker
    Catalog --> Ping --> Decide
    Decide --> Config
    Decide -- "Fehler / Ausfall" --> Alert
```

---

## 3. Die Komponenten im Detail

### 3.1 Einheitliche Ausführungskette (`executeGeminiWithFallback`)
Alle KI-Anfragen laufen zentral über `executeGeminiWithFallback` im Cloudflare Worker:
```javascript
const GEMINI_MODELS_FALLBACK_CHAIN = [
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite'
];
```
- Fällt ein Modell mit `404`, `503` oder `429` aus, probiert der Worker automatisch das nächste Modell in der Kette.
- Für den Benutzer entsteht kein Verbindungsabbruch.

### 3.2 Automatischer Selbsttest & Modellentdeckung (`checkAndTestAiModels`)
Der Worker fragt Googles Model-Endpoint ab, entdeckt neue Modelle, filtert veraltete heraus und führt einen echten Ping-Test gegen jeden Kandidaten durch:
- **`healthy` (200 OK):** Modell ist online und einsatzbereit; Latenz wird gemessen.
- **`degraded` (503):** Modell ist temporär überlastet (z.B. *high demand*).
- **`deprecated` (404/410):** Modell wurde von Google eingestellt.
- **`quota_exceeded` (429):** API-Limit erreicht.

### 3.3 Persistierung in Supabase (`system_app_configs`)
Die Prüfergebnisse werden atomar in der Tabelle `public.system_app_configs` abgelegt:
- `key = 'ai_model_health'`: Vollständiger JSON-Prüfbericht inklusive Latenzen und Timestamp.
- `key = 'ai_primary_model'`: Das aktuell empfohlene Standardmodell (z.B. `gemini-3-flash-preview`).

### 3.4 Automatischer Cron-Job & Admin-Alarmierung
1. **Supabase `pg_cron` & `pg_net`:**
   In PostgreSQL ist Job #1 `ai-model-healthcheck` registriert, der täglich um 04:00 Uhr UTC via `net.http_get` den Worker aufruft:
   ```sql
   SELECT cron.schedule('ai-model-healthcheck', '0 4 * * *', $$
     SELECT net.http_get(url := 'https://v1-vorstand-api.dan-hunziker73.workers.dev/?action=check_ai_models');
   $$);
   ```
2. **Cloudflare Worker Cron Trigger:**
   Zusätzlich exportiert der Worker einen nativen `scheduled()`-Handler für maximale Redundanz.
3. **Alarmierung bei Ausfall:**
   Sollte das Standardmodell ausfallen oder kein gesundes Modell mehr verfügbar sein, wird automatisch ein Eintrag in `public.mail_logs` mit Status `system_alert` angelegt und der Administrator benachrichtigt.

### 3.5 Cockpit-UI (`ai-health.js` & `#modal-ai-health`)
Im Vorstand-Cockpit steht ein Diagnose-Modal zur Verfügung:
- Schneller Aufruf über den Button **«KI-Status»** in News- und Resultate-Modulen.
- Übersichtliche Darstellung mit Status-Badges (🟢 Funktionsfähig, 🟡 Hohe Nachfrage, 🔴 Eingestellt) und gemessenen Antwortzeiten in Millisekunden.
- Button **«Modelle jetzt prüfen & testen»** für sofortige On-Demand-Prüfung.
