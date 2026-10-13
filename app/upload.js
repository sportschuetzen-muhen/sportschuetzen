const WORKER_UPLOAD_URL = "https://github-dropdown-refresh.dan-hunziker73.workers.dev/";
const WORKER_OCR_URL = "https://v1-vorstand-api.dan-hunziker73.workers.dev/?module=resultate&action=ocr";
const SUPABASE_REST_URL = "https://supabase-muhen.danfamily.uk/rest/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

/* ---------------------------------------------
   STATUS-MELDUNG ANZEIGEN
--------------------------------------------- */
function showAiStatus(message, type = "info") {
    const el = document.getElementById("ai-status");
    if (!el) return;

    el.style.display = "block";
    if (type === "success") {
        el.style.background = "#dcfce7";
        el.style.color = "#166534";
        el.style.border = "1px solid #bbf7d0";
    } else if (type === "warning") {
        el.style.background = "#fef9c3";
        el.style.color = "#854d0e";
        el.style.border = "1px solid #fde047";
    } else if (type === "error") {
        el.style.background = "#fee2e2";
        el.style.color = "#991b1b";
        el.style.border = "1px solid #fecaca";
    } else {
        // info / loading
        el.style.background = "#e0f2fe";
        el.style.color = "#075985";
        el.style.border = "1px solid #bae6fd";
    }
    el.innerHTML = message;
}

function hideAiStatus() {
    const el = document.getElementById("ai-status");
    if (el) el.style.display = "none";
}

/* ---------------------------------------------
   TEILNEHMER AUS LOGIN LADEN (Du-Form)
--------------------------------------------- */
function loadTeilnehmer() {
    const userStr = localStorage.getItem('sportschuetzen_user');
    const badge = document.getElementById("upload-user-info");
    const nameInput = document.getElementById("name");
    const submitBtn = document.getElementById("submitBtn");

    if (!userStr) {
        badge.innerHTML = "⚠️ Nicht eingeloggt.<br><span style='font-size:0.82rem; font-weight:normal;'>Bitte öffne die Startseite (Haus-Icon) und logge dich kurz ein.</span>";
        badge.style.background = "#fee2e2";
        badge.style.color = "#ef4444";
        submitBtn.disabled = true;
        return;
    }

    const user = JSON.parse(userStr);
    const lizenzFormatted = user.lizenz ? String(user.lizenz).padStart(6, '0') : '';
    badge.innerHTML = `👤 Angemeldet als:<br><strong>${user.vorname} ${user.nachname || ''}</strong> ${lizenzFormatted ? `(${lizenzFormatted})` : ''}`;
    nameInput.value = lizenzFormatted || user.vorname;
}

/* ---------------------------------------------
   BILD-KOMPRESSION (Canvas zu JPEG Data-URL)
--------------------------------------------- */
async function compressImage(fileOrBlob, maxWidth = 1800, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = e => {
            img.src = e.target.result;
        };

        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ratio = img.width > maxWidth ? maxWidth / img.width : 1;

            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
            resolve(compressedBase64);
        };

        img.onerror = reject;
        reader.readAsDataURL(fileOrBlob);
    });
}

/* ---------------------------------------------
   SCHWEIZER SCHIESSPROGRAMME MAX-PROGNOSE
--------------------------------------------- */
function forecastMaxPoints(text, score) {
    const lower = (text || '').toLowerCase();
    const pts = parseFloat(score) || 0;

    if (/60\s*schuss|liegend/i.test(lower) || pts > 300) {
        return { max: 600, reason: "60 Schuss Liegendmatch / Meisterschaft" };
    }
    if (/kantonalstich|30\s*schuss/i.test(lower) || pts > 200) {
        return { max: 300, reason: "30 Schuss Programm" };
    }
    if (/vereinsstich|verband|20\s*schuss/i.test(lower) || pts > 150) {
        return { max: 200, reason: "20 Schuss Programm" };
    }
    if (/15\s*schuss|auszahlung|sektion/i.test(lower) || (pts > 120 && pts <= 150)) {
        return { max: 150, reason: "15 Schuss Programm" };
    }
    if (/12\s*schuss|6\s*x\s*20/i.test(lower) || (pts > 100 && pts <= 120)) {
        return { max: 120, reason: "12 Schuss bzw. 6x20 Programm" };
    }
    if (/8\s*schuss|8\s*x\s*10/i.test(lower) || (pts > 60 && pts <= 80 && !lower.includes('10 schuss'))) {
        return { max: 80, reason: "8 Schuss à 10 Pkt." };
    }
    if (/6\s*schuss|6\s*x\s*10/i.test(lower) || (pts <= 60 && pts > 0 && !lower.includes('10 schuss'))) {
        return { max: 60, reason: "6 Schuss à 10 Pkt." };
    }
    return { max: 100, reason: "10 Schuss à 10 Pkt. (Gruppenstich / Einzelstich)" };
}

/* ---------------------------------------------
   DIGITALE PDF-ANALYSE (Client-seitig < 50ms)
--------------------------------------------- */
async function processPdfStandblatt(file, user) {
    showAiStatus("📄 PDF-Rangliste wird durchsucht...", "info");
    const arrayBuffer = await file.arrayBuffer();

    if (typeof pdfjsLib === 'undefined') {
        throw new Error("PDF.js ist nicht geladen.");
    }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    const maxPages = Math.min(pdf.numPages, 5);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
    }

    // Titel erkennen
    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let detectedTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const l = lines[i];
        if (/(?:schiessen|stich|cup|fest|verband|verein|bärenmoos|freischiessen|sektion|gruppe)/i.test(l)) {
            detectedTitle = l;
            break;
        }
    }

    // Nach Benutzer suchen
    const uNachname = (user.nachname || '').trim();
    const uVorname = (user.vorname || '').trim();
    const uLizenz = user.lizenz ? String(user.lizenz).padStart(6, '0') : '';

    let matchedLine = null;
    let foundPoints = null;

    for (const line of lines) {
        const nachnameMatches = uNachname && new RegExp('\\b' + uNachname + '\\b', 'i').test(line);
        const vornameMatches = uVorname && new RegExp('\\b' + uVorname + '\\b', 'i').test(line);
        const lizenzMatches = uLizenz && uLizenz !== '000000' && line.includes(uLizenz);

        if ((nachnameMatches && vornameMatches) || lizenzMatches) {
            matchedLine = line;
            const nums = line.match(/\b(100|[4-9][0-9]|1[0-9]{2}|200|5[0-9]{2}|600)\b/g);
            if (nums && nums.length > 0) {
                const validNums = nums.filter(n => !/^19[4-9][0-9]$|^20[0-2][0-9]$/.test(n));
                if (validNums.length > 0) {
                    foundPoints = parseFloat(validNums[0]);
                    break;
                }
            }
        }
    }

    const anlassInput = document.getElementById("anlass");
    if (anlassInput && detectedTitle) {
        anlassInput.value = detectedTitle;
    }

    if (foundPoints !== null) {
        const { max, reason } = forecastMaxPoints(fullText, foundPoints);
        document.getElementById("erzielt").value = foundPoints;
        document.getElementById("maximal").value = max;
        showAiStatus(`✨ <strong>${foundPoints} Punkte</strong> (Max. ${max}, ${reason}) in der PDF-Rangliste gefunden! Bitte kurz prüfen.`, "success");
    } else {
        showAiStatus(`📄 PDF geladen: <em>${detectedTitle}</em>. Dein Name wurde nicht automatisch gefunden – bitte Punkte kurz manuell erfassen.`, "warning");
    }

    // Render Erste Seite als Vorschaubild
    try {
        const page1 = await pdf.getPage(1);
        const viewport = page1.getViewport({ scale: 1.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page1.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        const pdfImgData = canvas.toDataURL('image/jpeg', 0.8);
        document.getElementById("foto").dataset.compressed = pdfImgData;
    } catch (renderErr) {
        console.warn("PDF-Vorschau Render Warnung:", renderErr);
    }
}

/* ---------------------------------------------
   ZENTRALE GEMINI VISION OCR (Standblatt Bild)
--------------------------------------------- */
async function processImageStandblatt(base64Data, user) {
    showAiStatus("🔍 Standblatt wird mit KI analysiert...", "info");

    try {
        const res = await fetch(WORKER_OCR_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                image: base64Data,
                shooters: [{
                    id: user.lizenz || "user",
                    name: `${user.vorname} ${user.nachname || ''}`.trim()
                }],
                round: "standblatt",
                model: "gemini-2.5-flash"
            })
        });

        const data = await res.json();
        if (data && data.success && Array.isArray(data.ergebnisse) && data.ergebnisse.length > 0) {
            const bestResult = data.ergebnisse[0];
            const pts = parseFloat(bestResult.points);

            if (!isNaN(pts) && pts > 0) {
                const { max, reason } = forecastMaxPoints(bestResult.comment || '', pts);
                document.getElementById("erzielt").value = pts;
                document.getElementById("maximal").value = max;
                showAiStatus(`✨ KI-Erkennung: <strong>${pts} Punkte</strong> (Max. ${max}, ${reason}). Bitte kurz prüfen.`, "success");
                return;
            }
        }
    } catch (err) {
        console.warn("Zentraler KI-OCR Aufruf nicht erfolgreich, Fallback auf manuelle Eingabe:", err);
    }

    showAiStatus("📸 Foto bereit. Bitte trage deine Punkte und das Maximum kurz ein.", "info");
}

/* ---------------------------------------------
   FILE / FOTO AUSWAHL EVENT-HANDLER
--------------------------------------------- */
document.getElementById("foto").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;

    const errorDiv = document.getElementById("error-msg");
    errorDiv.style.display = "none";

    const preview = document.getElementById("preview");
    const pdfBox = document.getElementById("pdf-preview-box");
    const pdfName = document.getElementById("pdf-file-name");
    const uploadHint = document.getElementById("upload-hint");

    let user = {};
    try {
        user = JSON.parse(localStorage.getItem('sportschuetzen_user') || '{}');
    } catch (_) {}

    try {
        // 1. APPLE HEIC / HEIF Erkennung
        const isHeic = file.name.toLowerCase().endsWith('.heic') ||
                       file.name.toLowerCase().endsWith('.heif') ||
                       file.type === 'image/heic' ||
                       file.type === 'image/heif';

        let processedFile = file;
        if (isHeic) {
            showAiStatus("🍎 Apple HEIC wird für Web-Upload konvertiert...", "info");
            if (typeof heic2any === 'undefined') {
                throw new Error("HEIC-Konverter nicht geladen.");
            }
            const convertedBlob = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.85
            });
            processedFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        }

        // 2. PDF Erkennung
        const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
        if (isPdf) {
            preview.style.display = "none";
            pdfBox.style.display = "block";
            pdfName.textContent = file.name;
            uploadHint.style.display = "none";

            await processPdfStandblatt(file, user);
            return;
        }

        // 3. Bild-Verarbeitung & KI Vision
        pdfBox.style.display = "none";
        const compressed = await compressImage(processedFile);

        preview.src = compressed;
        preview.style.display = "block";
        uploadHint.style.display = "none";

        // Im Dataset für den Upload speichern
        e.target.dataset.compressed = compressed;

        await processImageStandblatt(compressed, user);

    } catch (err) {
        console.error("Upload-Vorbereitung Fehler:", err);
        showAiStatus(`⚠️ ${err.message || 'Datei konnte nicht verarbeitet werden.'}`, "error");
    }
});

/* ---------------------------------------------
   FORM SUBMIT (Du-Form, Supabase Audit Log)
--------------------------------------------- */
document.getElementById("uploadForm").onsubmit = async (e) => {
    e.preventDefault();

    const errorDiv = document.getElementById("error-msg");
    errorDiv.style.display = "none";

    const erzielt = parseFloat(document.getElementById("erzielt").value);
    const maximal = parseFloat(document.getElementById("maximal").value);
    const anlass = (document.getElementById("anlass") ? document.getElementById("anlass").value : '').trim();

    if (isNaN(erzielt) || isNaN(maximal)) {
        errorDiv.textContent = "Bitte trage die erzielten Punkte und das Maximum ein.";
        errorDiv.style.display = "block";
        return;
    }

    if (erzielt > maximal) {
        errorDiv.textContent = "Die erzielten Punkte können nicht höher als das Maximum sein!";
        errorDiv.style.display = "block";
        return;
    }

    const btn = document.getElementById("submitBtn");
    btn.disabled = true;
    btn.textContent = "Wird gesendet...";

    try {
        const userStr = localStorage.getItem('sportschuetzen_user');
        if (!userStr) {
            alert("Du bist nicht eingeloggt. Bitte lade die Seite neu und melde dich an.");
            return;
        }
        const user = JSON.parse(userStr);
        const compressedImage = document.getElementById("foto").dataset.compressed;

        if (!compressedImage) {
            errorDiv.textContent = "Bitte wähle zuerst ein Foto oder eine PDF-Rangliste aus.";
            errorDiv.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Jetzt senden";
            return;
        }

        // 1. Upload an Worker übermitteln (Cloudflare R2 Speicher)
        const res = await fetch(WORKER_UPLOAD_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "upload_standblatt",
                anlass: anlass || "Auswärtiges Schiessen",
                lizenz: user.lizenz || user.id,
                vorname: user.vorname,
                nachname: user.nachname,
                erzielt,
                maximal,
                foto: compressedImage
            })
        });

        if (!res.ok) {
            throw new Error("Fehler beim Übermitteln an den Speicher.");
        }

        let fileName = null;
        try {
            const resData = await res.json();
            fileName = resData.fileName;
        } catch (_) {}

        const fileUrl = fileName ? `${WORKER_UPLOAD_URL}?action=get_standblatt&file=${encodeURIComponent(fileName)}` : null;

        // 2. Supabase Audit-Log & Inbox (in contest_ocr_logs protokollieren mit Status 'pending')
        await fetch(`${SUPABASE_REST_URL}/contest_ocr_logs`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id: `sb_${user.lizenz || user.id}_${Date.now()}`,
                contest_type: "standblatt",
                round: "auswaertig",
                model_used: "client_ai_assisted",
                recognized_count: 1,
                raw_response: {
                    status: "pending",
                    anlass: anlass || "Auswärtiges Schiessen",
                    erzielt,
                    maximal,
                    lizenz: user.lizenz || user.id,
                    vorname: user.vorname,
                    nachname: user.nachname,
                    fileName: fileName,
                    fileUrl: fileUrl,
                    timestamp: new Date().toISOString()
                },
                created_by: String(user.lizenz || user.id)
            })
        });

        alert("✔ Dein Standblatt wurde erfolgreich übermittelt und zur Prüfung eingereicht!");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("Netzwerkfehler beim Übermitteln.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Jetzt senden";
    }
};

window.onload = loadTeilnehmer;
