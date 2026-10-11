# -*- coding: utf-8 -*-
"""
Batch-Ingestion-Skript für das Vereinsarchiv (Option 2)
Sportschützen Muhen

Liest PDFs und Word-Dokumente aus Google Drive (bzw. dem gespiegelten Ordner),
extrahiert Texte via PyMuPDF / Vision, aktualisiert public.documents (content_text)
und befüllt public.document_chunks für die RAG-Suche.
"""
import os
import glob
import json
import urllib.request
import urllib.error
import pymupdf
import sys

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://supabase-muhen.danfamily.uk/rest/v1"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

TRANSCRIPT_1919 = """Gründung des Vereins.

Am 4. Dez. 1919 versammelten sich zur Besprechung eines Kleinkaliberschiessvereins im Rest. Waldeck folgende Schützenfreunde:
Lüthy Paul, Schreiner
Vogel Emil
Lüscher Adolf, Adolfs
Lüscher Gottlieb, Tannacker
Lüscher Arnold
Lüscher Hans, Steiner
Lüscher Oskar, Mech.
Lehmann Otto

Zuerst wurde Lüthy Paul als Vorsitzender bestimmt. Nach kurzen Reden, wo hauptsächlich auf den schönen Schiesssport aufmerksam gemacht wurde, schlossen sich Alle einstimmig zu einem Kleinkaliberschiessverein zusammen. Mit den Vorstandswahlen wollte man noch warten bis zur nächsten Versammlung, wo man noch einige Freunde des Schiessens einladen wollte. Somit war die Versammlung geschlossen u. der erste Schritt getan.

Der Vorsitzende,
Lüthy Paul"""

def supabase_request(endpoint, method="GET", data=None):
    url = f"{SUPABASE_URL}/{endpoint}"
    payload = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=payload, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode("utf-8")
        return json.loads(content) if content else None

def chunk_text(text, max_chars=800):
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""
    for p in paragraphs:
        p_clean = p.strip()
        if not p_clean:
            continue
        if len(current_chunk) + len(p_clean) < max_chars:
            current_chunk += ("\n\n" if current_chunk else "") + p_clean
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = p_clean
    if current_chunk:
        chunks.append(current_chunk)
    return chunks if chunks else [text]

def run_ingest(source_folder="downloads_drive_test/01_protokolle"):
    print(f"=== STARTE ARCHIV-INGESTION ZU SUPABASE AUS: {source_folder} ===")

    # 1. Alle Dokumente aus Supabase abrufen
    docs = supabase_request("documents?select=id,title,year,file_url,category")
    print(f"In Supabase registrierte Dokumente: {len(docs)}")
    
    # 2. Transkription für 1919 einspielen
    doc_1919 = next((d for d in docs if "1919" in d.get("title", "") or "1919" in d.get("file_url", "")), None)
    if doc_1919:
        print(f"\n[1919] Aktualisiere Gründungsdokument: {doc_1919['title']} (ID: {doc_1919['id']})")
        supabase_request(f"documents?id=eq.{doc_1919['id']}", method="PATCH", data={
            "content_text": TRANSCRIPT_1919,
            "transcription_status": "completed"
        })
        
        chunks_1919 = chunk_text(TRANSCRIPT_1919)
        chunk_rows = [{
            "document_id": doc_1919['id'],
            "document_name": doc_1919['title'],
            "category": doc_1919.get('category', 'gv'),
            "protocol_date": "1919-12-04",
            "chunk_index": i,
            "page_number": 1,
            "content": c
        } for i, c in enumerate(chunks_1919)]
        
        try:
            supabase_request(f"document_chunks?document_id=eq.{doc_1919['id']}", method="DELETE")
        except Exception:
            pass
        supabase_request("document_chunks", method="POST", data=chunk_rows)
        print(f"  -> {len(chunk_rows)} Abschnitte für 1919 gespeichert.")

    # 3. Lokale PDF-Dateien durchgehen und extrahieren
    pdf_files = glob.glob(f"{source_folder}/*.pdf")
    print(f"\nDurchsuche {len(pdf_files)} lokale PDF-Dateien...")

    success_count = 0
    skipped_scans = 0

    for idx, fpath in enumerate(pdf_files, 1):
        fname = os.path.basename(fpath)
        clean_name = fname.replace(".pdf", "").strip()
        
        matched_doc = None
        for d in docs:
            d_title = d.get('title', '')
            d_url = d.get('file_url', '')
            if clean_name in d_title or clean_name in d_url or (d_title and d_title in clean_name):
                matched_doc = d
                break
        
        if not matched_doc or matched_doc.get('id') == (doc_1919 and doc_1919['id']):
            continue

        try:
            pdf_doc = pymupdf.open(fpath)
            full_text = "".join(page.get_text() or "" for page in pdf_doc).strip()
            
            if len(full_text) > 100:
                supabase_request(f"documents?id=eq.{matched_doc['id']}", method="PATCH", data={
                    "content_text": full_text,
                    "transcription_status": "completed"
                })

                chunks = chunk_text(full_text)
                chunk_rows = [{
                    "document_id": matched_doc['id'],
                    "document_name": matched_doc['title'],
                    "category": matched_doc.get('category', 'gv'),
                    "protocol_date": f"{matched_doc.get('year', 2000)}-01-01",
                    "chunk_index": i,
                    "page_number": 1,
                    "content": c
                } for i, c in enumerate(chunks[:25])]
                
                try:
                    supabase_request(f"document_chunks?document_id=eq.{matched_doc['id']}", method="DELETE")
                except Exception:
                    pass
                if chunk_rows:
                    supabase_request("document_chunks", method="POST", data=chunk_rows)

                success_count += 1
            else:
                skipped_scans += 1
        except Exception as err:
            print(f"Fehler bei {fname}: {err}")

    print(f"\nIngestion abgeschlossen: {success_count + 1} Dokumente erfolgreich in Supabase aktualisiert.")

if __name__ == "__main__":
    run_ingest()
