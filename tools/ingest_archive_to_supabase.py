# -*- coding: utf-8 -*-
"""
Vollständige Archiv-Migration & Text-Ingestion (Phase 2)
Sportschützen Muhen -> Supabase (CT 117)

Aufgaben:
1. Vervollständigt die Textextraktion (PDF, DOC, DOCX, MSG, XLSX, ODT) für die
   bereits in public.documents vorhandenen 281 Dokumente.
2. Überträgt alle relevanten Vorstands- und Vereinsdokumente aus
   G:\Meine Ablage\Sportschützen Muhen GMail strukturiert in den Supabase Storage
   Bucket 'club-documents', extrahiert deren Volltext und befüllt public.documents
   sowie public.document_chunks (für Volltext- & KI-RAG-Suche).
"""
import os
import re
import sys
import json
import time
import glob
import zipfile
import unicodedata
import urllib.parse
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

SUPABASE_BASE = "https://supabase-muhen.danfamily.uk"
SUPABASE_REST = f"{SUPABASE_BASE}/rest/v1"
SUPABASE_STORAGE = f"{SUPABASE_BASE}/storage/v1"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M"
BUCKET = "club-documents"

JSON_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "User-Agent": "SPS-Muhen-Archiv-Ingest/2.0"
}

MIME_MAP = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".dot": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".docm": "application/vnd.ms-word.document.macroEnabled.12",
    ".dotx": "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    ".dotm": "application/vnd.ms-word.template.macroEnabled.12",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    ".xltm": "application/vnd.ms-excel.template.macroEnabled.12",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".rtf": "application/rtf",
    ".txt": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".msg": "application/vnd.ms-outlook",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".bmp": "image/bmp",
}

ALLOWED_DOC_EXTS = {
    ".pdf", ".doc", ".docx", ".docm", ".dot", ".dotx", ".dotm",
    ".odt", ".rtf", ".txt", ".xls", ".xlsx", ".xlsm", ".xltm",
    ".ods", ".csv", ".pptx", ".msg"
}
SCAN_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}

# Globale Word COM Instanz für schnelle .doc/.rtf/.dot Konvertierung
_word_app = None

def get_word_app():
    global _word_app
    if _word_app is None:
        try:
            import win32com.client
            _word_app = win32com.client.Dispatch("Word.Application")
            _word_app.Visible = False
            _word_app.DisplayAlerts = 0
        except Exception as e:
            print(f"  [WARN] MS Word COM konnte nicht gestartet werden: {e}")
            _word_app = False
    return _word_app if _word_app is not False else None

def close_word_app():
    global _word_app
    if _word_app:
        try:
            _word_app.Quit()
        except Exception:
            pass
        _word_app = None


def sb_request(endpoint, method="GET", data=None, extra_headers=None, retries=3):
    url = f"{SUPABASE_REST}/{endpoint}"
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8") if data is not None else None
    headers = dict(JSON_HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="replace")
            if attempt == retries - 1:
                raise RuntimeError(f"HTTP {he.code} auf {endpoint}: {err_body[:300]}")
            time.sleep(1.0)
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(1.0)


def sb_upload_file(storage_path, local_path):
    ext = os.path.splitext(local_path)[1].lower()
    mime = MIME_MAP.get(ext, "application/octet-stream")
    encoded_path = "/".join(urllib.parse.quote(part, safe="") for part in storage_path.split("/"))
    url = f"{SUPABASE_STORAGE}/object/{BUCKET}/{encoded_path}"

    with open(local_path, "rb") as f:
        file_bytes = f.read()

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": mime,
        "x-upsert": "true",
        "User-Agent": "SPS-Muhen-Archiv-Ingest/2.0"
    }
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=file_bytes, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=90) as resp:
                resp.read()
                return f"{SUPABASE_STORAGE}/object/public/{BUCKET}/{encoded_path}"
        except urllib.error.HTTPError as he:
            if he.code == 400 and attempt == 0:
                # Fallback auf PUT falls Objekt schon existiert
                req_put = urllib.request.Request(url, data=file_bytes, headers=headers, method="PUT")
                with urllib.request.urlopen(req_put, timeout=90) as resp:
                    resp.read()
                    return f"{SUPABASE_STORAGE}/object/public/{BUCKET}/{encoded_path}"
            if attempt == 2:
                err_body = he.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"Storage Upload HTTP {he.code}: {err_body[:200]}")
            time.sleep(1.5)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.5)


def sanitize_storage_filename(name):
    """Wandelt Umlaute und Sonderzeichen in sichere Storage-Dateinamen um."""
    replacements = {
        "ä": "ae", "ö": "oe", "ü": "ue",
        "Ä": "Ae", "Ö": "Oe", "Ü": "Ue",
        "ß": "ss", "é": "e", "è": "e", "à": "a"
    }
    for k, v in replacements.items():
        name = name.replace(k, v)
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    base, ext = os.path.splitext(name)
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", base).strip("_")
    if not base:
        base = "dokument"
    return f"{base[:140]}{ext.lower()}"


def extract_date_and_year(filename, folder_path="", fallback_mtime=None):
    """Extrahiert (year, document_date_iso) aus Dateiname oder Ordnerpfad."""
    combined = f"{filename} {folder_path}"

    # 1. YYYY-MM-DD oder YYYY_MM_DD
    m = re.search(r"(19\d{2}|20\d{2})[\.\-_](0[1-9]|1[0-2])[\.\-_](0[1-9]|[12]\d|3[01])", combined)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            datetime(y, mo, d)
            return y, f"{y:04d}-{mo:02d}-{d:02d}"
        except ValueError:
            return y, f"{y:04d}-01-01"

    # 2. DD.MM.YYYY oder DD_MM_YYYY
    m = re.search(r"(0[1-9]|[12]\d|3[01])[\.\-_](0[1-9]|1[0-2])[\.\-_](19\d{2}|20\d{2})", combined)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            datetime(y, mo, d)
            return y, f"{y:04d}-{mo:02d}-{d:02d}"
        except ValueError:
            return y, f"{y:04d}-01-01"

    # 3. YYYYMMDD kompakt
    m = re.search(r"(?<!\d)(19\d{2}|20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)", combined)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            datetime(y, mo, d)
            return y, f"{y:04d}-{mo:02d}-{d:02d}"
        except ValueError:
            return y, f"{y:04d}-01-01"

    # 4. Vierstellige Jahreszahl im Dateinamen
    m = re.search(r"(?<!\d)(19\d{2}|20[0-2]\d)(?!\d)", filename)
    if m:
        y = int(m.group(1))
        return y, f"{y:04d}-01-01"

    # 5. Vierstellige Jahreszahl im Ordnerpfad (z.B. "Protokolle 2018")
    m = re.search(r"(?<!\d)(19\d{2}|20[0-2]\d)(?!\d)", folder_path)
    if m:
        y = int(m.group(1))
        return y, f"{y:04d}-01-01"

    # 6. Zweistellige Jahreszahl am Anfang wie "14-08-29" oder "AKSF17"
    if "AKSF17" in combined or "AKSF 2017" in combined:
        return 2017, "2017-01-01"

    if fallback_mtime:
        dt = datetime.fromtimestamp(fallback_mtime)
        return dt.year, dt.strftime("%Y-%m-%d")

    return None, None


def clean_extracted_text(text):
    if not text:
        return ""
    # Null-Bytes und Steuerzeichen bereinigen (PostgreSQL TEXT erlaubt kein \x00)
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def extract_text_from_file(local_path):
    """
    Universeller Text-Extraktor für PDF, DOCX, DOC, DOT, ODT, RTF, TXT, CSV,
    XLS, XLSX, XLSM, ODS, PPTX und MSG.
    Gibt (text, ocr_method, page_count) zurück.
    """
    ext = os.path.splitext(local_path)[1].lower()
    abs_path = os.path.abspath(local_path)

    try:
        # 1. PDF
        if ext == ".pdf":
            pdf = pymupdf.open(abs_path)
            pages = len(pdf)
            texts = []
            for p in pdf:
                t = p.get_text() or ""
                if t.strip():
                    texts.append(t.strip())
            pdf.close()
            full = clean_extracted_text("\n\n".join(texts))
            if len(full) >= 40:
                return full, "digital_pdf", max(1, pages)
            return "", "none", max(1, pages)

        # 2. DOCX / DOCM / DOTX / DOTM
        if ext in {".docx", ".docm", ".dotx", ".dotm"}:
            parts = []
            try:
                import docx
                d = docx.Document(abs_path)
                for p in d.paragraphs:
                    if p.text and p.text.strip():
                        parts.append(p.text.strip())
                for tbl in d.tables:
                    for row in tbl.rows:
                        row_txt = " | ".join(c.text.strip().replace("\n", " ") for c in row.cells if c.text.strip())
                        if row_txt:
                            parts.append(row_txt)
            except Exception:
                # Fallback direkt über word/document.xml im ZIP
                with zipfile.ZipFile(abs_path, "r") as z:
                    if "word/document.xml" in z.namelist():
                        xml_bytes = z.read("word/document.xml")
                        root = ET.fromstring(xml_bytes)
                        parts = [el.text.strip() for el in root.iter() if el.text and el.text.strip()]
            full = clean_extracted_text("\n\n".join(parts))
            if len(full) >= 20:
                return full, "office_extract", 1

        # 3. DOC / DOT / RTF (via MS Word COM oder striprtf)
        if ext in {".doc", ".dot", ".rtf"}:
            if ext == ".rtf":
                try:
                    from striprtf.striprtf import rtf_to_text
                    with open(abs_path, "r", encoding="latin-1", errors="ignore") as f:
                        full = clean_extracted_text(rtf_to_text(f.read()))
                    if len(full) >= 20:
                        return full, "office_extract", 1
                except Exception:
                    pass

            word = get_word_app()
            if word is not None:
                try:
                    doc = word.Documents.Open(
                        abs_path,
                        ConfirmConversions=False,
                        ReadOnly=True,
                        AddToRecentFiles=False,
                        Visible=False
                    )
                    txt = doc.Content.Text or ""
                    pages = 1
                    try:
                        pages = max(1, int(doc.ComputeStatistics(2)))  # wdStatisticPages = 2
                    except Exception:
                        pass
                    doc.Close(False)
                    full = clean_extracted_text(txt)
                    if len(full) >= 20:
                        return full, "office_extract", pages
                except Exception as we:
                    print(f"    [WARN] Word COM Fehler bei {os.path.basename(abs_path)}: {we}")

        # 4. ODT / ODS (OpenDocument XML)
        if ext in {".odt", ".ods"}:
            with zipfile.ZipFile(abs_path, "r") as z:
                if "content.xml" in z.namelist():
                    root = ET.fromstring(z.read("content.xml"))
                    texts = [el.text.strip() for el in root.iter() if el.text and el.text.strip()]
                    full = clean_extracted_text("\n".join(texts))
                    if len(full) >= 20:
                        return full, "office_extract", 1

        # 5. XLSX / XLSM / XLTM
        if ext in {".xlsx", ".xlsm", ".xltm"}:
            import openpyxl
            wb = openpyxl.load_workbook(abs_path, data_only=True, read_only=True)
            sheet_texts = []
            for sname in wb.sheetnames:
                sh = wb[sname]
                rows_str = [f"=== Tabellenblatt: {sname} ==="]
                row_count = 0
                for row in sh.iter_rows(values_only=True):
                    vals = [str(v).strip() for v in row if v is not None and str(v).strip() != ""]
                    if vals:
                        rows_str.append(" | ".join(vals))
                        row_count += 1
                        if row_count >= 400:
                            break
                if len(rows_str) > 1:
                    sheet_texts.append("\n".join(rows_str))
            wb.close()
            full = clean_extracted_text("\n\n".join(sheet_texts))
            if len(full) >= 15:
                return full, "office_extract", max(1, len(sheet_texts))

        # 6. XLS (Excel 97-2003 via xlrd)
        if ext == ".xls":
            import xlrd
            wb = xlrd.open_workbook(abs_path, on_demand=True)
            sheet_texts = []
            for sname in wb.sheet_names():
                sh = wb.sheet_by_name(sname)
                rows_str = [f"=== Tabellenblatt: {sname} ==="]
                for r_idx in range(min(sh.nrows, 400)):
                    vals = []
                    for c_idx in range(sh.ncols):
                        v = sh.cell_value(r_idx, c_idx)
                        if v is not None and str(v).strip() != "":
                            vals.append(str(v).strip())
                    if vals:
                        rows_str.append(" | ".join(vals))
                if len(rows_str) > 1:
                    sheet_texts.append("\n".join(rows_str))
            wb.release_resources()
            full = clean_extracted_text("\n\n".join(sheet_texts))
            if len(full) >= 15:
                return full, "office_extract", max(1, len(sheet_texts))

        # 7. PPTX (PowerPoint XML)
        if ext == ".pptx":
            slides_txt = []
            with zipfile.ZipFile(abs_path, "r") as z:
                slide_files = sorted([f for f in z.namelist() if f.startswith("ppt/slides/slide") and f.endswith(".xml")])
                for idx, sf in enumerate(slide_files, 1):
                    root = ET.fromstring(z.read(sf))
                    t_list = [el.text.strip() for el in root.iter() if el.text and el.text.strip()]
                    if t_list:
                        slides_txt.append(f"[Folie {idx}] " + " ".join(t_list))
            full = clean_extracted_text("\n\n".join(slides_txt))
            if len(full) >= 15:
                return full, "office_extract", max(1, len(slides_txt))

        # 8. MSG (Outlook E-Mail)
        if ext == ".msg":
            import extract_msg
            msg = extract_msg.Message(abs_path)
            subj = msg.subject or ""
            sender = msg.sender or ""
            date_str = str(msg.date or "")
            body = msg.body or ""
            msg.close()
            full = clean_extracted_text(f"Betreff: {subj}\nVon: {sender}\nDatum: {date_str}\n\n{body}")
            if len(full) >= 15:
                return full, "office_extract", 1

        # 9. TXT / CSV
        if ext in {".txt", ".csv"}:
            for enc in ("utf-8", "cp1252", "latin-1"):
                try:
                    with open(abs_path, "r", encoding=enc) as f:
                        full = clean_extracted_text(f.read(200000))
                    if len(full) >= 10:
                        return full, "office_extract", 1
                    break
                except UnicodeDecodeError:
                    continue

    except Exception as e:
        print(f"    [WARN] Extraktion fehlgeschlagen bei {os.path.basename(abs_path)}: {e}")

    return "", "none", 1


def chunk_text(text, max_chars=900):
    text = clean_extracted_text(text)
    if not text:
        return []
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []
    current = ""
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        if len(current) + len(p) + 2 <= max_chars:
            current = f"{current}\n\n{p}" if current else p
        else:
            if current:
                chunks.append(current)
            if len(p) <= max_chars:
                current = p
            else:
                # Sehr lange Absätze (z.B. Tabellen) in Blöcke à max_chars teilen
                for i in range(0, len(p), max_chars):
                    sub = p[i:i + max_chars].strip()
                    if sub:
                        chunks.append(sub)
                current = ""
    if current:
        chunks.append(current)
    # Maximal 80 Chunks pro Dokument (verhindert DB-Explosion bei riesigen Excel-Tabellen, deckt aber alle Chroniken & Protokolle komplett ab)
    return chunks[:80]


def save_chunks_for_document(doc_id, title, category, doc_date, text):
    chunks = chunk_text(text)
    try:
        sb_request(f"document_chunks?document_id=eq.{doc_id}", method="DELETE")
    except Exception:
        pass
    if not chunks:
        return 0
    rows = [{
        "document_id": doc_id,
        "document_name": title[:250],
        "category": category,
        "protocol_date": doc_date,
        "chunk_index": i,
        "page_number": 1,
        "content": c
    } for i, c in enumerate(chunks)]
    # In Batches zu 40 Zeilen einfügen
    for i in range(0, len(rows), 40):
        sb_request("document_chunks", method="POST", data=rows[i:i + 40])
    return len(rows)


def classify_google_drive_file(rel_path):
    """
    Ordnet jeden Dateipfad aus 'Sportschützen Muhen GMail' einer sauberen
    (category, subcategory, visibility, description_prefix) Struktur zu.
    Gibt None zurück, wenn die Datei übersprungen werden soll (z.B. Fotos für Immich, Binaries).
    """
    parts = rel_path.replace("/", "\\").split("\\")
    top = parts[0]
    sub = parts[1] if len(parts) > 2 else ""
    fname = parts[-1]
    ext = os.path.splitext(fname)[1].lower()

    # System- und temporäre Dateien ignorieren
    if fname.startswith("~$") or fname.lower() in {"desktop.ini", "thumbs.db", ".ds_store"}:
        return None

    # 1. General- und Vereinsversammlungen 1919 bis heute
    if top == "General- und Vereinsversammlungen 1919 bis heute":
        if sub in {"01 Protokolle Generalversammlungen", "02 Einladungen zur GV", "05 Berichte Präsident und Jungschützen", "30 Chroniken"}:
            # Diese 4 Ordner wurden bereits im ersten Transfer hochgeladen (werden in Schritt A vervollständigt)
            return ("EXISTING_GV", sub, "members", "")
        if sub == "20 Alte Liste Vereinsmitglieder":
            if ext in ALLOWED_DOC_EXTS or ext in SCAN_IMAGE_EXTS:
                return ("schiessbetrieb", "mitglieder_listen", "vorstand", "Historische Mitgliederliste")
        if sub == "Anträge" and ext in ALLOWED_DOC_EXTS:
            return ("gv", "01_protokolle", "members", "GV-Antrag")
        if sub in {"10 Vorlagen", "Draft"} and ext in ALLOWED_DOC_EXTS:
            return ("vorstand", "gv_vorlagen", "vorstand", f"GV-Vorlage / Entwurf ({sub})")
        return None

    # 2. Vorstand (Sitzungsprotokolle 1973–2026 & Statuten)
    if top == "Vorstand":
        if ext not in ALLOWED_DOC_EXTS:
            return None
        if sub == "Statuten":
            return ("statuten", "statuten_reglemente", "members", "Vereinsstatuten & Reglemente")
        return ("vorstand", "vorstand_protokolle", "vorstand", f"Vorstandsprotokoll ({sub or 'Allgemein'})")

    # 3. Gebäude (Schützenhaus Rüteli, Pachtvertrag, Umbauten, Scheiben 2016, Wasserschaden)
    if top == "Gebäude":
        if ext not in ALLOWED_DOC_EXTS and ext not in SCAN_IMAGE_EXTS:
            return None
        if "Scheiben 2016" in sub:
            return ("gebaeude", "scheiben_2016", "vorstand", "Gebäude • Elektronische Scheiben 2016")
        if "Neubau" in sub or "Umbau" in sub:
            return ("gebaeude", "umbau_neubau", "vorstand", f"Gebäude • {sub}")
        if "Vermietungen" in sub:
            return ("gebaeude", "vermietung_historisch", "vorstand", "Gebäude • Vermietung Schützenstube")
        return ("gebaeude", "schuetzenhaus", "vorstand", f"Gebäude & Infrastruktur{(' • ' + sub) if sub else ''}")

    # 4. 50 m Anlage & 10 m Anlage
    if top in {"50 m Anlage", "10 m Anlage"}:
        if ext not in ALLOWED_DOC_EXTS and ext not in SCAN_IMAGE_EXTS:
            return None
        return ("gebaeude", "anlagen_50m_10m", "vorstand", f"{top}{(' • ' + sub) if sub else ''}")

    # 5. Versicherungen Policen
    if top == "Versicherungen Policen":
        if ext not in ALLOWED_DOC_EXTS:
            return None
        return ("versicherungen", "policen_schatzungen", "vorstand", "Versicherungspolice & Gebäudeschatzung")

    # 6. Presse Artikel
    if top == "Presse Artikel":
        if ext not in ALLOWED_DOC_EXTS and ext not in SCAN_IMAGE_EXTS:
            return None
        return ("chronik", "presse", "members", "Pressebericht & Zeitungsarchiv")

    # 7. Festanlässe ohne Schiessen
    if top == "Festanlässe ohne Schiessen":
        if ext not in ALLOWED_DOC_EXTS:
            return None
        return ("anlaesse", "festanlaesse", "vorstand", f"Festanlass{(' • ' + sub) if sub else ''}")

    # 8. Abteilung Kleinkaliber & Abteilung Luftgewehr
    if top == "Abteilung Kleinkaliber":
        if ext not in ALLOWED_DOC_EXTS:
            return None
        if "Vereinbarung Nutzung" in sub:
            return ("statuten", "statuten_reglemente", "vorstand", "AGSV Vereinbarung Nutzung der Anlage")
        return ("schiessbetrieb", "abteilung_kk", "vorstand", f"Kleinkaliber 50m{(' • ' + sub) if sub else ''}")

    if top == "Abteilung Luftgewehr":
        if ext not in ALLOWED_DOC_EXTS:
            return None
        return ("schiessbetrieb", "abteilung_lg", "vorstand", f"Luftgewehr 10m{(' • ' + sub) if sub else ''}")

    # 9. Mitglieder DB (Gewehrliste, Schlüsselliste, historisches SSV-Verzeichnis; ohne Zint/TCL-Binaries und ohne 99 Einzelrechnungen)
    if top.startswith("Mitglieder DB"):
        if any(skip in rel_path for skip in ("zint", "tcl", "QR_Erstellung_Zint", "Via Mail versandt", "Mahnungen via Mail")):
            return None
        if ext not in ALLOWED_DOC_EXTS:
            return None
        return ("schiessbetrieb", "mitglieder_listen", "vorstand", f"Mitglieder- & Waffenverzeichnis{(' • ' + sub) if sub else ''}")

    # 10. Kleider, Jungschütze, Ausbildung, Rechnung an AGSV
    if top in {"Kleider", "Jungschütze", "Ausbildung", "Rechnung an AGSV"}:
        if ext not in ALLOWED_DOC_EXTS and ext not in SCAN_IMAGE_EXTS:
            return None
        return ("schiessbetrieb", "kleider_ausbildung", "vorstand", f"{top}{(' • ' + sub) if sub else ''}")

    # 11. Photos -> Nur echte PDF/Word-Dokumente (z.B. Alte Unterlagen, Wegweiser), keine Kamerafotos!
    if top == "Photos":
        if ext in ALLOWED_DOC_EXTS:
            return ("chronik", "30_chroniken", "members", f"Historische Unterlagen ({sub or 'Archiv'})")
        return None

    # 12. Einzeldateien im Root (z.B. SSV Mitgliederverzeichnis_08022026.xlsx)
    if len(parts) == 1 and ext in ALLOWED_DOC_EXTS:
        return ("schiessbetrieb", "mitglieder_listen", "vorstand", "SSV Mitgliederverzeichnis")

    return None


def normalize_match_key(s):
    """Normalisiert Dateinamen zur sicheren Zuordnung trotz Umlaut-Unterschieden."""
    s = os.path.splitext(s)[0].lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def step_a_complete_existing_281_docs(drive_base):
    print("\n======================================================================")
    print("SCHRITT A: VERVOLLSTÄNDIGUNG DER BESTEHENDEN 281 DOKUMENTE IN SUPABASE")
    print("======================================================================")

    docs = sb_request("documents?select=id,title,category,subcategory,year,document_date,file_url,file_type,transcription_status,content_text&limit=1000")
    print(f"Aktuell in public.documents geladen: {len(docs)} Einträge")

    gv_base = os.path.join(drive_base, "General- und Vereinsversammlungen 1919 bis heute")
    folder_map = {
        "01_protokolle": os.path.join(gv_base, "01 Protokolle Generalversammlungen"),
        "02_einladungen": os.path.join(gv_base, "02 Einladungen zur GV"),
        "05_berichte": os.path.join(gv_base, "05 Berichte Präsident und Jungschützen"),
        "30_chroniken": os.path.join(gv_base, "30 Chroniken"),
    }

    # Indexiere alle lokalen Dateien in diesen 4 Ordnern nach ihrem normalisierten Schlüssel
    local_lookup = {}
    for subcat, folder_path in folder_map.items():
        if os.path.isdir(folder_path):
            for fname in os.listdir(folder_path):
                fpath = os.path.join(folder_path, fname)
                if os.path.isfile(fpath):
                    key = (subcat, normalize_match_key(fname))
                    local_lookup[key] = fpath

    updated_text_count = 0
    rechunked_count = 0
    scan_only_count = 0

    for idx, d in enumerate(docs, 1):
        subcat = d.get("subcategory") or "01_protokolle"
        url_fname = urllib.parse.unquote(d.get("file_url", "").split("/")[-1])
        key_url = (subcat, normalize_match_key(url_fname))
        key_title = (subcat, normalize_match_key(d.get("title", "")))

        local_file = local_lookup.get(key_url) or local_lookup.get(key_title)
        if not local_file:
            # Fuzzy-Suche im jeweiligen Unterordner
            target_dir = folder_map.get(subcat, "")
            if os.path.isdir(target_dir):
                nk = normalize_match_key(d.get("title", ""))
                for fname in os.listdir(target_dir):
                    if nk and (nk in normalize_match_key(fname) or normalize_match_key(fname) in nk):
                        local_file = os.path.join(target_dir, fname)
                        break

        # Falls bereits completed (z.B. 1919 oder die 40 PDFs), sicherstellen dass alle Chunks vorhanden sind
        if d.get("transcription_status") == "completed" and d.get("content_text") and len(d["content_text"]) > 80:
            continue

        if not local_file or not os.path.isfile(local_file):
            continue

        text, ocr_method, page_count = extract_text_from_file(local_file)
        orig_fname = os.path.basename(local_file)
        fsize_kb = max(1, int(round(os.path.getsize(local_file) / 1024.0)))

        if len(text) >= 40:
            sb_request(f"documents?id=eq.{d['id']}", method="PATCH", data={
                "content_text": text,
                "transcription_status": "completed",
                "ocr_method": ocr_method,
                "page_count": page_count,
                "original_filename": orig_fname,
                "file_size_kb": fsize_kb,
                "updated_at": datetime.utcnow().isoformat() + "Z"
            })
            n_chunks = save_chunks_for_document(
                d["id"],
                d["title"],
                d["category"],
                d.get("document_date") or (f"{d['year']}-01-01" if d.get("year") else None),
                text
            )
            updated_text_count += 1
            rechunked_count += n_chunks
            if updated_text_count % 15 == 0:
                print(f"  [A] {updated_text_count} bestehende Dokumente neu extrahiert & indexiert...")
        else:
            # Reiner Bild-Scan ohne eingebetteten Text -> Metadaten trotzdem ergänzen
            sb_request(f"documents?id=eq.{d['id']}", method="PATCH", data={
                "original_filename": orig_fname,
                "file_size_kb": fsize_kb,
                "page_count": page_count
            })
            scan_only_count += 1

    print(f"-> Schritt A abgeschlossen: {updated_text_count} Dokumente neu mit Volltext ({rechunked_count} Chunks) befüllt, {scan_only_count} historische Bild-Scans markiert.")


def step_b_ingest_all_drive_folders(drive_base, my_drive_root):
    print("\n======================================================================")
    print("SCHRITT B: MIGRATION & INDEXIERUNG ALLER WEITEREN GOOGLE DRIVE ORDNER")
    print("======================================================================")

    # Bereits importierte source_paths abrufen, damit das Skript 100% idempotent ist
    existing_docs = sb_request("documents?select=id,source_path,title,file_url&limit=3000")
    existing_sources = {d["source_path"]: d for d in existing_docs if d.get("source_path")}
    print(f"Bereits via source_path registriert: {len(existing_sources)} Dokumente")

    candidates = []

    # 1. Die 2 wichtigen PDFs direkt in G:\Meine Ablage (Fahnenweihe 2021 & GV 2026)
    root_specials = [
        ("Fahnenweihe Sportschützen Muhen 15.08.2021.pdf", "chronik", "30_chroniken", "members", "Festschrift & Chronik Fahnenweihe 2021"),
        ("GV_2026_vom_12.03.2026.pdf", "gv", "01_protokolle", "members", "Generalversammlung 2026"),
    ]
    for fname, cat, subcat, vis, desc_pref in root_specials:
        fpath = os.path.join(my_drive_root, fname)
        if os.path.isfile(fpath):
            candidates.append((fpath, f"Root/{fname}", cat, subcat, vis, desc_pref))

    # 2. Alle Dateien unter G:\Meine Ablage\Sportschützen Muhen GMail durchlaufen
    for root, dirs, files in os.walk(drive_base):
        for fname in files:
            fpath = os.path.join(root, fname)
            rel_path = os.path.relpath(fpath, drive_base)
            cls = classify_google_drive_file(rel_path)
            if cls is None:
                continue
            cat, subcat, vis, desc_pref = cls
            if cat == "EXISTING_GV":
                continue
            candidates.append((fpath, rel_path.replace("\\", "/"), cat, subcat, vis, desc_pref))

    print(f"Gefundene neue Dokumente für Upload & Indexierung: {len(candidates)}")

    uploaded_count = 0
    extracted_count = 0
    total_chunks = 0
    skipped_existing = 0
    errors = []

    for idx, (fpath, rel_source, cat, subcat, vis, desc_pref) in enumerate(candidates, 1):
        if rel_source in existing_sources:
            skipped_existing += 1
            continue

        fname = os.path.basename(fpath)
        ext = os.path.splitext(fname)[1].lower().lstrip(".")
        title_clean = os.path.splitext(fname)[0].replace("_", " ").strip()
        folder_context = os.path.dirname(rel_source)

        try:
            mtime = os.path.getmtime(fpath)
            year, doc_date = extract_date_and_year(fname, folder_context, fallback_mtime=mtime)
            fsize_kb = max(1, int(round(os.path.getsize(fpath) / 1024.0)))

            # Eindeutiger Storage-Pfad unter archiv/<subcategory>/<year>_<safe_name>
            safe_name = sanitize_storage_filename(fname)
            # Kurzer Hash aus rel_source verhindert Namenskollisionen (z.B. "Protokoll 1.doc" in 2012 vs 2014)
            short_hash = f"{abs(hash(rel_source)) % 100000:05d}"
            storage_path = f"archiv/{subcat}/{short_hash}_{safe_name}"

            # 1. Datei in Supabase Storage 'club-documents' hochladen
            file_url = sb_upload_file(storage_path, fpath)

            # 2. Volltext extrahieren
            text, ocr_method, page_count = extract_text_from_file(fpath)
            has_text = len(text) >= 25
            status = "completed" if has_text else "pending"

            desc = f"{desc_pref}: {title_clean}" if desc_pref else title_clean
            if folder_context and "/" in folder_context:
                sub_detail = folder_context.split("/", 1)[1]
                desc = f"{desc_pref} ({sub_detail}): {title_clean}"

            row_payload = {
                "title": title_clean[:250],
                "description": desc[:500],
                "category": cat,
                "subcategory": subcat,
                "visibility": vis,
                "file_url": file_url,
                "storage_path": storage_path,
                "source_path": rel_source,
                "original_filename": fname[:250],
                "file_size_kb": fsize_kb,
                "file_type": ext[:20],
                "year": year,
                "document_date": doc_date,
                "content_text": text if has_text else None,
                "transcription_status": status,
                "ocr_method": ocr_method,
                "page_count": page_count,
                "sort_order": 100
            }

            inserted = sb_request(
                "documents?on_conflict=source_path",
                method="POST",
                data=row_payload,
                extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"}
            )
            doc_id = inserted[0]["id"] if isinstance(inserted, list) and inserted else None

            uploaded_count += 1
            if has_text and doc_id:
                n_c = save_chunks_for_document(doc_id, title_clean, cat, doc_date, text)
                extracted_count += 1
                total_chunks += n_c

            if uploaded_count % 25 == 0 or idx == len(candidates):
                print(f"  [B] Fortschritt: {idx}/{len(candidates)} verarbeitet | {uploaded_count} hochgeladen | {extracted_count} mit Volltext ({total_chunks} Chunks)")

        except Exception as e:
            err_msg = f"{rel_source}: {e}"
            print(f"  [ERR] {err_msg}")
            errors.append(err_msg)

    print(f"\n-> Schritt B abgeschlossen: {uploaded_count} neue Dokumente in Supabase gespeichert, {extracted_count} direkt volltext-indexiert ({total_chunks} neue Chunks). Fehler: {len(errors)}")


def main():
    my_drive_root = r"G:\Meine Ablage"
    drive_base = None
    for entry in os.listdir(my_drive_root):
        if entry.startswith("Sportsch") and "Muhen" in entry:
            drive_base = os.path.join(my_drive_root, entry)
            break

    if not drive_base or not os.path.isdir(drive_base):
        print("FEHLER: Google Drive Ordner 'Sportschützen Muhen GMail' nicht unter G:\\Meine Ablage gefunden!")
        sys.exit(1)

    print(f"Gefundener Google Drive Pfad: {drive_base}")
    try:
        step_a_complete_existing_281_docs(drive_base)
        step_b_ingest_all_drive_folders(drive_base, my_drive_root)
    finally:
        close_word_app()


if __name__ == "__main__":
    main()
