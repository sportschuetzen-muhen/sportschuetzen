# Fachdokumentation: Vereins-Archiv, Dokumenten-Management & KI-Suche

> **Status:** ARCHITEKTUR & IMPLEMENTIERUNGSPLAN V2 (Supabase Voll-Archiv & KI-RAG)  
> **Stand:** Oktober 2026 (Migration 100 – 1'148 Dokumente & 6'724 Volltext-Chunks)  
> **Führendes Gesamtsystem:** Supabase PostgreSQL (CT 117) & Storage (`club-documents`)  
> **Hardware & Lokale KI:** i7-Worker-PC (`192.168.68.56` / GTX 1070 8 GB, Ollama `11434`, Immich-ML `3003`)  
> **Live-LLM für Vorstand:** Groq via Homeassistant-Proxy (`qwen/qwen3.8-27b`)  
> **Komponenten:** `sportschuetzen-website/frontend/intern.html`, `vorstand/js/archiv.js`, `tools/ingest_archive_to_supabase.py`, `supabase/migrations/100_archive_and_documents_v2_schema.sql`  
> **Relevanz für KI:** Verbindliche Richtlinie für die vollständige Ablösung von Google Drive durch Supabase Storage (`club-documents`), Paperless-Entkopplung und KI-RAG.

---

## 1. Systemübersicht & Rollenverteilung (V2 – 100 % Supabase Native)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. DIREKT-UPLOAD (vorstand/js/archiv.js) & BATCH-INGESTION (tools/ingest_archive_...) │
│    • Neue Dokumente werden direkt im Vorstandsportal in 'club-documents' hochgeladen   │
│    • Alle 1'148 Bestandsdokumente aus Google Drive sind vollständig migriert           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. TEXT-EXTRAKTION & LOKALER GPU-WORKER (i7 PC 192.168.68.56 / GTX 1070)               │
│    • Digitale PDFs, Word (.doc/.docx), Excel (.xls/.xlsx), E-Mails (.msg), .odt        │
│    • Historische Handschriften (1919–1960): Vision-Transkription & Split-Screen-Editor │
│    • Automatische Chunk-Generierung (6'724 Abschnitte in 'public.document_chunks')     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. SUPABASE POSTGRESQL & STORAGE (Single Source of Truth auf CT 117)                  │
│    • Storage Bucket 'club-documents': 1'149 Originaldateien (19 Unterordner, 100 MB)   │
│    • Tabelle 'public.documents': Metadaten, Jahr, Kategorie, Subkategorie, Volltext    │
│    • Tabelle 'public.document_chunks': Textabschnitte mit gewichtetem tsvector (A/B/C) │
│    • RLS-Policies: Mitglieder sehen Vereinsdokumente (328), Vorstand alles (1'148)     │
└───────────────────────┬────────────────────────────────────────┬───────────────────────┘
                        │                                        │
                        ▼                                        ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────────────┐
│ 4. MITGLIEDERPORTAL (intern.html)    │  │ 5. VORSTANDS-ARCHIV (vorstand/js/archiv.js)  │
│    • 5 Rubriken + Epochen-Zeitleiste │  │    • Tab 1: Dokumenten-Explorer & Split-View │
│    • Echtzeit-Volltextsuche          │  │    • Tab 2: KI-Archivar (Groq qwen3.8-27b)   │
│    • Split-Screen Lesemodal          │  │    • Tab 3: Transkriptions-Werkstatt         │
└──────────────────────────────────────┘  └──────────────────────────────────────────────┘
```

---

## 2. Die Rollen der Teilsysteme

### 2.1 Vorstandsportal (`vorstand/js/archiv.js` – 3-Tab-Arbeitsplatz)
- **Tab 1 – Dokumenten-Explorer:** Ersetzt das frühere Google-Drive-Iframe vollständig. Bietet Domänen-Filter (Vertrauliches Vorstandsarchiv vs. Vereinsarchiv für Mitglieder), Unterordner-Auswahl, Jahrzehnt-Filter (`1919–2020er`), Echtzeit-Volltextsuche mit hervorgehobenen Textstellen, Direkt-Upload nach Supabase Storage (`club-documents/archiv/<subcategory>/`) sowie ein **Split-Screen Lese- & Bearbeitungs-Modal** (links Original-PDF/Bild-Vorschau mit `?t=` Cache-Busting, rechts Metadaten & editierbarer Volltext mit automatischer Chunk-Neuindexierung).
- **Tab 2 – KI-Archivar & RAG-Suche:** Durchsucht über `public.search_archive_fulltext` alle 6'724 Textabschnitte (wahlweise gesamtes Archiv, nur Vorstandsprotokolle, GV & Berichte oder Bau & Versicherungen) und übergibt die Top-Quellen samt Direktlink (`file_url` & `document_id`) an den Cloudflare Worker (`WORKER/v1-vorstand.js`) bzw. Groq (`qwen/qwen3.8-27b`). Stille Fallbacks auf Google Apps Script (`getPdfLink`) sind vollständig eliminiert.
- **Tab 3 – Transkriptions-Werkstatt:** Zeigt den Indexierungs-Fortschritt pro Kategorie in Echtzeit und listet Bild-Scans ohne Textschicht direkt zum Öffnen im Split-Screen-Editor auf.

### 2.2 Mitgliederbereich (`sportschuetzen-website/frontend/intern.html`)
- Bietet regulären Vereinsmitgliedern Zugriff auf alle 328 freigegebenen Vereinsdokumente (`visibility = 'members'`) in 5 Rubriken (`Generalversammlung`, `Jahresberichte`, `Einladungen & Traktanden`, `Chronik & Presse`, `Statuten & Reglemente`).
- Integrierte **Epochen-Zeitleiste** (`Alle Jahre`, `2020er` bis `1919–1949 Gründerzeit`) und **Split-Screen Lesemodal (`openMemberDocReaderModal`)** zum komfortablen Lesen historischer Handschrift-Transkriptionen und Office-Dokumente direkt im Browser.

### 2.3 Paperless-ngx (LXC 119 – 192.168.68.119)
- **Strikte Entkopplung von der Website:** Paperless-ngx wird **nicht** im kritischen Pfad der Website oder des Mitgliederbereichs aufgerufen.
- Dient als reines internes Dokumenten- und Langzeitarchiv für den Administrator.
- Eventuelle Ausfälle oder Reboots von Paperless-ngx haben **keine Auswirkungen** auf die Erreichbarkeit der Vereinsdokumente oder die Archiv-Suche auf der Website.

### 2.4 Lokaler GPU-Worker (Dieser PC – 192.168.68.56)
- **Hardware:** Intel Core i7, NVIDIA GeForce GTX 1070 (8 GB VRAM, CUDA 12.6).
- **Lokale Dienste:**
  - Ollama (`http://127.0.0.1:11434`): Modell `qwen2.5:7b` für Klassifizierung, Textanalyse und Metadaten-Extraktion.
  - Immich Machine Learning (`http://127.0.0.1:3003`): Autonomer ML-Microservice für Gesichtserkennung und Medienanalyse.
- **Batch-Aufgabe (`tools/ingest_archive_to_supabase.py`):** Extrahiert Texte aus PDFs (PyMuPDF), Word (`.docx` & binäre `.doc`/`.dot`), Excel (`.xlsx`/`.xlsm`/`.xls`), PowerPoint (`.pptx`), OpenDocument (`.odt`/`.ods`), Outlook (`.msg`) sowie `.txt`/`.csv` und synchronisiert diese idempotent über `on_conflict=source_path` nach Supabase CT 117.

### 2.5 Groq LLM API (Live-RAG für Vorstand)
- **Proxy-Endpunkt:** `https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions`
- **Authentifizierung:** `Bearer <DEIN_TOKEN>`
- **Aktives Modell:** `qwen/qwen3.8-27b` (Der Nachfolger des dekommissionierten `qwen3.6-27b`).
- **Performance:** Liefert Antworten in unter 1,5 Sekunden inklusive anklickbarer Quellenkarten zum Öffnen im Split-Screen oder als Original-PDF.

---

## 3. Datenmodell in Supabase PostgreSQL (CT 117)

### 3.1 Tabelle `public.documents` (Stammdaten & Volltext – 1'148 Dokumente)
Erweiterung der bestehenden Tabelle (Migrationen 50, 51, 61, 82 & 100):
* `id` (UUID, Primary Key)
* `title` (VARCHAR(255))
* `description` (TEXT)
* `category` (VARCHAR(50): `'gv'`, `'berichte'`, `'einladungen'`, `'chronik'`, `'statuten'`, `'vorstand'`, `'gebaeude'`, `'versicherungen'`, `'anlaesse'`, `'schiessbetrieb'`)
* `subcategory` (VARCHAR(100): `'01_protokolle'`, `'02_einladungen'`, `'05_berichte'`, `'30_chroniken'`, `'presse'`, `'statuten_reglemente'`, `'vorstand_protokolle'`, `'gv_vorlagen'`, `'schuetzenhaus'`, `'umbau_neubau'`, `'scheiben_2016'`, `'anlagen_50m_10m'`, `'vermietung_historisch'`, `'policen_schatzungen'`, `'festanlaesse'`, `'abteilung_kk'`, `'abteilung_lg'`, `'mitglieder_listen'`, `'kleider_ausbildung'`)
* `visibility` (VARCHAR(20): `'public'`, `'members'`, `'vorstand'`)
* `file_url` (TEXT – Direktlink zu Supabase Storage `club-documents`)
* `storage_path` (TEXT – relativer Objektpfad in `club-documents`)
* `source_path` (TEXT UNIQUE – kanonischer Ursprungspfad aus dem Google-Drive-Import zur Idempotenz)
* `original_filename` (VARCHAR(255))
* `file_size_kb` (INTEGER)
* `file_type` (VARCHAR(20): `'pdf'`, `'doc'`, `'docx'`, `'xls'`, `'xlsx'`, `'xlsm'`, `'pptx'`, `'msg'`, `'odt'`, `'csv'`, `'txt'`, `'jpg'`)
* `year` (INTEGER) & `document_date` (DATE – exaktes Dokumentdatum)
* `content_text` (TEXT – extrahierter Volltext aus PDF, Word `.doc`/`.docx`, Excel `.xls`/`.xlsx`, `.msg`, `.odt` und Vision-OCR)
* `transcription_status` (VARCHAR(30): `'pending'`, `'completed'`, `'manual_review'`)
* `ocr_method` (VARCHAR(50): `'digital_pdf'`, `'office_extract'`, `'vision_ocr'`, `'manual'`, `'none'`)
* `page_count` (INTEGER)
* `tsv_content` (tsvector – gewichteter deutscher Volltextindex: Titel `A`, Metadaten `B`, Inhalt `C`)

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
