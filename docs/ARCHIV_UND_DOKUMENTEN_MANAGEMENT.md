# Fachdokumentation: Vereins-Archiv, Dokumenten-Management & KI-Suche

> **Status:** ARCHITEKTUR & IMPLEMENTIERUNGSPLAN (Option 2)  
> **Stand:** Oktober 2026  
> **Führendes Gesamtsystem:** Supabase PostgreSQL (CT 117) & Storage (`club-documents`)  
> **Hardware & Lokale KI:** i7-Worker-PC (`192.168.68.56` / GTX 1070 8 GB, Ollama `11434`, Immich-ML `3003`)  
> **Live-LLM für Vorstand:** Groq via Homeassistant-Proxy (`qwen/qwen3.8-27b`)  
> **Komponenten:** `sportschuetzen-website/frontend/intern.html`, `vorstand/js/archiv.js`, `supabase/migrations/`  
> **Relevanz für KI:** Verbindliche Richtlinie für die Entkopplung von Google Drive, Paperless-ngx, lokalem PC und Supabase.

---

## 1. Systemübersicht & Rollenverteilung (Option 2)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. GOOGLE DRIVE (Vorstand / Redaktion)                                                 │
│    • Unveränderte Alltagsablage der Vorstandsmitglieder (Protokolle, GV, Finanzen)     │
│    • Keine Schulung nötig; vertraute Umgebung bleibt 100 % erhalten                     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. LOKALER GPU-WORKER (i7 PC 192.168.68.56 / GTX 1070)                                 │
│    • Läuft NUR bei Bedarf (Batch-Verarbeitung / Ingestion), kein 24/7-Webdienst nötig   │
│    • Digitale PDFs: Direkte Textextraktion                                             │
│    • Historische Handschriften (1919–1960): Vision-Transkription                       │
│    • Schreibt extrahierten Text, Metadaten & Vektoren direkt in Supabase CT 117        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. SUPABASE POSTGRESQL & STORAGE (Single Source of Truth auf CT 117)                  │
│    • Storage Bucket 'club-documents': Revisionssichere Original-PDFs                   │
│    • Tabelle 'public.documents': Metadaten, Jahr, Kategorie, Volltext                 │
│    • Tabelle 'public.document_chunks': Textabschnitte mit pgvector & tsvector         │
│    • RLS-Policies: Mitglieder sehen Vereinsdokumente, Vorstand vertrauliche Akten      │
└───────────────────────┬────────────────────────────────────────┬───────────────────────┘
                        │                                        │
                        ▼                                        ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────────────┐
│ 4. WEBSUCHE & MITGLIEDER (intern.html)│  │ 5. VORSTANDS-ASSISTENT (vorstand/js/archiv.js)│
│    • Blitzschnelle Volltextsuche     │  │    • Chat mit Archiv-KI (Groq qwen3.8-27b)   │
│    • 3 Ordner (GV, Einladung, Chronik)│  │    • Hybrid-RAG (PostgreSQL pgvector)        │
│    • Original-PDF direkt öffnen      │  │    • Exakte Quellenangabe & PDF-Deep-Link    │
└──────────────────────────────────────┘  └──────────────────────────────────────────────┘
```

---

## 2. Die Rollen der Teilsysteme

### 2.1 Google Drive (Eingang & Vorstand)
- Der Vorstand arbeitet wie gewohnt in Google Drive.
- Ordnerstruktur: `01_protokolle`, `02_einladungen`, `05_berichte`, `30_chroniken` etc.
- Es gibt keinen Zwang für den Vorstand, Dokumente über ein separates Webformular hochzuladen.

### 2.2 Paperless-ngx (LXC 119 – 192.168.68.119)
- **Strikte Entkopplung von der Website:** Paperless-ngx wird **nicht** im kritischen Pfad der Website oder des Mitgliederbereichs aufgerufen.
- Dient als reines internes Dokumenten- und Langzeitarchiv für den Administrator.
- Eventuelle Ausfälle oder Reboots von Paperless-ngx haben **keine Auswirkungen** auf die Erreichbarkeit der Vereinsdokumente oder die Archiv-Suche auf der Website.

### 2.3 Lokaler GPU-Worker (Dieser PC – 192.168.68.56)
- **Hardware:** Intel Core i7, NVIDIA GeForce GTX 1070 (8 GB VRAM, CUDA 12.6).
- **Lokale Dienste:**
  - Ollama (`http://127.0.0.1:11434`): Modell `qwen2.5:7b` für Klassifizierung, Textanalyse und Metadaten-Extraktion.
  - Immich Machine Learning (`http://127.0.0.1:3003`): Autonomer ML-Microservice für Gesichtserkennung und Medienanalyse.
- **Batch-Aufgabe:** Der lokale Worker liest geänderte Dateien aus dem gespiegelten Google Drive, transkribiert Handschriften und befüllt Supabase. Sobald der Batch abgeschlossen ist, kann der PC heruntergefahren werden.

### 2.4 Groq LLM API (Live-RAG für Vorstand)
- **Proxy-Endpunkt:** `https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions`
- **Authentifizierung:** `Bearer <DEIN_TOKEN>`
- **Aktives Modell:** `qwen/qwen3.8-27b` (Der Nachfolger des dekommissionierten `qwen3.6-27b`).
- **Performance:** Liefert Antworten in unter 1,5 Sekunden.

---

## 3. Datenmodell in Supabase PostgreSQL (CT 117)

### 3.1 Tabelle `public.documents` (Stammdaten & Volltext)
Erweiterung der bestehenden Tabelle (aus Migration 50/51):
* `id` (UUID, Primary Key)
* `title` (VARCHAR(255))
* `description` (TEXT)
* `category` (VARCHAR(50): `'gv'`, `'einladungen'`, `'chronik'`, `'vorstand'`)
* `visibility` (VARCHAR(20): `'public'`, `'members'`, `'vorstand'`)
* `file_url` (TEXT – Link zu Supabase Storage `club-documents`)
* `file_size_kb` (INTEGER)
* `file_type` (VARCHAR(20))
* `year` (INTEGER)
* `content_text` (TEXT – vollständiger transkribierter Text für globale Suche)
* `transcription_status` (VARCHAR(30): `'pending'`, `'completed'`, `'manual_review'`)
* `tsv_content` (tsvector – generiert via Trigger für die deutsche Volltextsuche)

### 3.2 Tabelle `public.document_chunks` (Vektor- & Abschnitts-Index für RAG)
Für die semantische KI-Suche und den RAG-Chat:
```sql
CREATE TABLE public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'gv',
    protocol_date DATE,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER DEFAULT 1,
    content TEXT NOT NULL,
    embedding vector(1024), -- BGE-M3 oder Standard-Vektorgrösse
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_doc_chunks_doc_id ON public.document_chunks(document_id);
CREATE INDEX idx_doc_chunks_embedding ON public.document_chunks USING hnsw (embedding vector_cosine_ops);
```

### 3.3 RPC-Funktion `search_archive_hybrid`
Kombiniert Volltext (`tsvector`) und Vektorähnlichkeit (`pgvector`), um sowohl exakte Namen/Jahreszahlen als auch sinngemässe Beschlüsse zuverlässig zu finden:
```sql
CREATE OR REPLACE FUNCTION public.search_archive_hybrid(
    query_text TEXT,
    query_embedding vector(1024),
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    document_name VARCHAR,
    protocol_date DATE,
    content TEXT,
    similarity FLOAT
) ...
```

---

## 4. Unverrückbare Regeln & Invarianten für die KI (Code-Guidelines)

1. **Keine direkte Kopplung Website $\leftrightarrow$ Paperless:**  
   Weder `intern.html` noch Vorstands-Skripte dürfen während des normalen Webseiten-Besuchs synchrone Requests an die Paperless-API senden. Fällt Paperless aus, muss die Vereinsseite uneingeschränkt weiterlaufen.
2. **Supabase ist Single Source of Truth:**  
   Alle Dokument-Referenzen, Transkriptionen und Vektoren liegen in Supabase PostgreSQL auf CT 117.
3. **Groq Modell-Standard:**  
   Für die KI-Chat-Generierung ist ausschliesslich das aktive Modell `qwen/qwen3.8-27b` (oder `openai/gpt-oss-120b`) zu verwenden. Das veraltete `qwen/qwen3.6-27b` darf im Code nicht mehr referenziert werden.
4. **Keine Datenvernichtung bei Synchronisation:**  
   Wird ein Dokument aus Google Drive neu indexiert, bleiben bestehende manuelle Korrekturen in `public.documents` erhalten, sofern sie nicht explizit überschrieben werden.
5. **Mitglieder-Datenschutz (RLS):**  
   Vorstandsprotokolle (`visibility = 'vorstand'`) dürfen in RAG-Ergebnissen für reguläre Mitglieder niemals auftauchen.
6. **UTF-8 Zeichenkodierung & Umlaute (Migration 82):**  
   Historisch importierte Dokumenttitel und Beschreibungen sind verbindlich in standardkonformem UTF-8 ohne Ersetzungszeichen (`U+FFFD`) zu führen. Bei Migrationen und Daten-Pipings via Shell/PowerShell muss der Stream zwingend als UTF-8 definiert werden, um Umlautverfälschungen (ä, ö, ü, à) dauerhaft zu unterbinden.
