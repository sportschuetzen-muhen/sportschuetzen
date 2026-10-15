const WORKER_UPLOAD_URL = "https://github-dropdown-refresh.dan-hunziker73.workers.dev/";
const WORKER_OCR_URL = "https://v1-vorstand-api.dan-hunziker73.workers.dev/?module=resultate&action=ocr";
const SUPABASE_REST_URL = "https://supabase-muhen.danfamily.uk/rest/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

let _currentOcrAnalysis = null;

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

    // Jahrgang ergänzen falls in _knownShooters vorhanden
    if (!user.jahrgang && Array.isArray(_knownShooters) && _knownShooters.length > 0) {
        const sh = _knownShooters.find(s => 
            (lizenzFormatted && s.lizenz === lizenzFormatted) || 
            (s.nachname && s.nachname.toLowerCase() === (user.nachname || '').toLowerCase())
        );
        if (sh && sh.jahrgang) {
            user.jahrgang = sh.jahrgang;
            localStorage.setItem('sportschuetzen_user', JSON.stringify(user));
        }
    }

    badge.innerHTML = `👤 Angemeldet als:<br><strong>${user.vorname} ${user.nachname || ''}</strong> ${lizenzFormatted ? `(${lizenzFormatted})` : ''}${user.jahrgang ? ` · Jg. ${user.jahrgang}` : ''}`;
    nameInput.value = lizenzFormatted || user.vorname;
}

/* ---------------------------------------------
   BEKANNTE ANLÄSSE & SCHÜTZEN AUS SUPABASE LADEN
--------------------------------------------- */
let _knownCompetitions = [];
let _knownShooters = [];

async function loadKnownCompetitions() {
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/jm_seasons?jahr=eq.current&select=raw_grid`, {
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0 || !data[0].raw_grid) return;

        const grid = data[0].raw_grid;
        const titles = grid[2] || [];
        const maxPts = grid[3] || [];
        const datalist = document.getElementById("anlaesse-list");

        _knownCompetitions = [];
        _knownShooters = [];

        // 1. Bekannte Schiessanlässe (Spaltenüberschriften der Saison)
        for (let c = 2; c < titles.length; c++) {
            const title = String(titles[c] || '').trim();
            if (!title || title.toLowerCase().startsWith('spalte') || title.toLowerCase() === 'leer') continue;
            const maxVal = parseFloat(maxPts[c]) || 100;
            _knownCompetitions.push({ title, max: maxVal });

            if (datalist) {
                const opt = document.createElement("option");
                opt.value = title;
                opt.label = `Max. ${maxVal} Pkt`;
                datalist.appendChild(opt);
            }
        }

        // 2. Bekannte Schützen aus dem Grid (Liga 1 & Liga 2)
        const headerRow = grid[4] || [];
        const colNachname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'nachname');
        const colVorname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'vorname');
        const colJahrgang = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('jahrgang'));
        const colLizenz = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('lizenz'));

        for (let r = 5; r < grid.length; r++) {
            if (!grid[r] || r === 13 || r === 14) continue;
            const nachname = String(grid[r][colNachname !== -1 ? colNachname : 1] || '').trim();
            const vorname = String(grid[r][colVorname !== -1 ? colVorname : 2] || '').trim();
            const jahrgang = String(grid[r][colJahrgang !== -1 ? colJahrgang : 3] || '').trim();
            const lizenz = String(grid[r][colLizenz !== -1 ? colLizenz : 4] || '').trim().padStart(6, '0');

            if (nachname || vorname) {
                _knownShooters.push({
                    nachname,
                    vorname,
                    fullName: `${vorname} ${nachname}`.trim(),
                    jahrgang,
                    lizenz: (lizenz && lizenz !== '000000') ? lizenz : ''
                });
            }
        }

        const anlassInput = document.getElementById("anlass");
        if (anlassInput) {
            anlassInput.addEventListener("input", () => {
                const val = anlassInput.value.trim().toLowerCase();
                const match = _knownCompetitions.find(k => k.title.toLowerCase() === val);
                if (match) {
                    const maxEl = document.getElementById("maximal");
                    if (maxEl && !maxEl.value) {
                        maxEl.value = match.max;
                    }
                }
            });
        }
    } catch (err) {
        console.warn("Konnte bekannte Anlässe und Schützen nicht vorladen:", err);
    }
}

/**
 * Findet den besten passenden Anlass aus den Spalten der Jahresmeisterschaft
 */
function findBestMatchingCompetition(text) {
    if (!text || !Array.isArray(_knownCompetitions) || _knownCompetitions.length === 0) return null;
    const cleanFull = String(text).toLowerCase().replace(/[^a-z0-9äöü]/gi, ' ');

    let bestComp = null;
    let bestScore = 0;

    for (const comp of _knownCompetitions) {
        const compTitle = (comp.title || '').trim();
        const cleanTitle = compTitle.toLowerCase().replace(/[^a-z0-9äöü]/gi, ' ');
        const words = cleanTitle.split(/\s+/).filter(w => w.length >= 4 && w !== 'schiessen' && w !== 'verband' && w !== 'stich');

        let score = 0;
        for (const w of words) {
            if (cleanFull.includes(w)) {
                score += w.length;
            }
        }

        // Exakter Substring Match auf den ganzen bereinigten Titel gibt Bonus
        const compactTitle = compTitle.toLowerCase().replace(/[^a-z0-9äöü]/gi, '');
        const compactFull = String(text).toLowerCase().replace(/[^a-z0-9äöü]/gi, '');
        if (compactTitle.length >= 6 && compactFull.includes(compactTitle)) {
            score += 30;
        }

        if (score > bestScore) {
            bestScore = score;
            bestComp = comp;
        }
    }

    return bestScore >= 5 ? bestComp : null;
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
    const submitBtn = document.getElementById("submitBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "📄 PDF wird analysiert...";
    }

    try {
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

    // Titel & bekannten Anlass erkennen
    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let bestComp = findBestMatchingCompetition(fullText);
    let detectedTitle = bestComp ? bestComp.title : (file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));

    if (!bestComp) {
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const l = lines[i];
            if (/(?:schiessen|stich|cup|fest|verband|verein|bärenmoos|stumpenland|freischiessen|sektion|gruppe)/i.test(l)) {
                detectedTitle = l;
                bestComp = findBestMatchingCompetition(l);
                if (bestComp) detectedTitle = bestComp.title;
                break;
            }
        }
    }

    // Nach Benutzer & Schützen-Identität suchen (Name, Lizenz, Jahrgang)
    const uNachname = (user.nachname || '').trim();
    const uVorname = (user.vorname || '').trim();
    const uLizenz = user.lizenz ? String(user.lizenz).padStart(6, '0') : '';
    const uJahrgang = user.jahrgang ? String(user.jahrgang).trim() : '';

    let nameMatches = false;
    let lizenzMatches = false;
    let jahrgangMatches = false;
    let foundPoints = null;

    for (const line of lines) {
        const nachMatches = uNachname && new RegExp('\\b' + uNachname + '\\b', 'i').test(line);
        const vorMatches = uVorname && new RegExp('\\b' + uVorname + '\\b', 'i').test(line);
        const lizMatches = uLizenz && uLizenz !== '000000' && line.includes(uLizenz);
        const jgMatches = uJahrgang && (line.includes(uJahrgang) || (uJahrgang.length === 4 && line.includes(uJahrgang.slice(2))));

        if (nachMatches && vorMatches) nameMatches = true;
        if (lizMatches) lizenzMatches = true;
        if (jgMatches) jahrgangMatches = true;

        if ((nachMatches && vorMatches) || lizMatches || (nachMatches && jgMatches)) {
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

    // Schützen-Feedback
    let shooterMsg = "";
    if (nameMatches && (lizenzMatches || jahrgangMatches)) {
        shooterMsg = `✅ <strong>Schütze bestätigt:</strong> ${user.vorname} ${user.nachname} ${lizenzMatches ? `(Lizenz: ${uLizenz})` : ''} ${jahrgangMatches ? `(Jg. ${uJahrgang})` : ''}`;
    } else if (nameMatches) {
        shooterMsg = `✅ <strong>Schütze erkannt:</strong> ${user.vorname} ${user.nachname}`;
    } else {
        shooterMsg = `👤 <strong>Schütze:</strong> ${user.vorname} ${user.nachname || ''}`;
    }

    // Anlass-Feedback
    let contestMsg = "";
    if (bestComp) {
        contestMsg = `🎯 <strong>Anlass erkannt & zugeordnet:</strong> ${detectedTitle} <span style="font-size:0.8em; color:#15803d; font-weight:600;">(in Jahresmeisterschaft vorhanden)</span>`;
    } else {
        contestMsg = `📝 <strong>Anlass erkannt:</strong> ${detectedTitle}`;
    }

    const isVerifiedPdf = nameMatches && (lizenzMatches || jahrgangMatches) && foundPoints !== null;
    _currentOcrAnalysis = {
        source: "pdf",
        modelUsed: "pdfjs_client",
        schuetze: {
            formName: `${user.vorname || ''} ${user.nachname || ''}`.trim(),
            formLizenz: uLizenz,
            formJahrgang: uJahrgang,
            nameFound: nameMatches,
            nameStatus: nameMatches ? "MATCH" : "NOT_FOUND",
            lizenzFound: lizenzMatches,
            lizenzStatus: lizenzMatches ? "MATCH" : "NOT_FOUND",
            jgFound: jahrgangMatches,
            jgStatus: jahrgangMatches ? "MATCH" : "NOT_FOUND"
        },
        anlass: {
            erkannt: detectedTitle,
            matchedTitle: bestComp ? bestComp.title : "",
            isKnown: !!bestComp,
            status: bestComp ? "MATCH" : "NEW_COL"
        },
        ergebnis: {
            punkte: foundPoints,
            maximal: foundPoints !== null ? (bestComp ? bestComp.max : 100) : null,
            status: foundPoints !== null ? "MATCH" : "NOT_FOUND"
        },
        raw_text: fullText ? fullText.substring(0, 1000) : "",
        snippet: lines.slice(0, 8).join(" | "),
        verified: isVerifiedPdf
    };

    if (foundPoints !== null) {
        const defaultMax = bestComp ? bestComp.max : null;
        const { max, reason } = defaultMax ? { max: defaultMax, reason: "Aus Tabelle bekannte Maximalpunktzahl" } : forecastMaxPoints(fullText, foundPoints);
        document.getElementById("erzielt").value = foundPoints;
        document.getElementById("maximal").value = max;
        const pct = max > 0 ? ((foundPoints / max) * 100).toFixed(2) : '100.00';

        const statusHtml = `
            <div style="text-align:left; font-size:0.87rem; line-height:1.45;">
                <div style="font-weight:700; margin-bottom:4px; color:#166534;">📄 PDF-Rangliste erfolgreich ausgewertet:</div>
                <div>${shooterMsg}</div>
                <div>${contestMsg}</div>
                <div>💯 <strong>Punkte & Maximum:</strong> <strong>${foundPoints}</strong> / ${max} Pkt. (${pct}% · ${reason})</div>
            </div>
        `;
        showAiStatus(statusHtml, "success");
    } else {
        showAiStatus(`📄 PDF geladen: <em>${detectedTitle}</em>. Punkte wurden nicht automatisch gefunden – bitte kurz eintragen.`, "warning");
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
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Standblatt jetzt einreichen";
        }
    }
}

/* ---------------------------------------------
   ZENTRALE GEMINI VISION OCR (Standblatt Bild)
--------------------------------------------- */
async function processImageStandblatt(base64Data, user) {
    showAiStatus("🔍 Standblatt wird mit KI analysiert...", "info");
    const submitBtn = document.getElementById("submitBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "🔍 KI analysiert Standblatt...";
    }

    try {
        const ocrUrl = WORKER_OCR_URL.replace('action=ocr', 'action=ocr_standblatt');
        const res = await fetch(ocrUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                image: base64Data,
                user: {
                    vorname: user.vorname || '',
                    nachname: user.nachname || '',
                    lizenz: user.lizenz || '',
                    jahrgang: user.jahrgang || ''
                },
                known_competitions: _knownCompetitions,
                model: "gemini-3-flash-preview"
            })
        });

        if (!res.ok) {
            throw new Error(`Server antwortete mit Status ${res.status}`);
        }

        const data = await res.json();
        if (data && data.success) {
            const rawText = data.raw_text || '';
            const detectedShooter = data.schuetze || {};
            const detectedContest = data.anlass || {};
            const detectedResult = data.ergebnis || {};

            // 1. Schütze abgleichen
            const uVor = (user.vorname || '').toLowerCase().trim();
            const uNach = (user.nachname || '').toLowerCase().trim();
            const uLiz = user.lizenz ? String(user.lizenz).padStart(6, '0') : '';
            const uJg = user.jahrgang ? String(user.jahrgang).trim() : '';

            const textLower = (rawText + ' ' + JSON.stringify(detectedShooter)).toLowerCase();
            const nameFound = (uVor && textLower.includes(uVor)) && (uNach && textLower.includes(uNach));
            const lizenzFound = uLiz && uLiz !== '000000' && (textLower.includes(uLiz) || (detectedShooter.lizenz && detectedShooter.lizenz.includes(uLiz)));
            const jgFound = uJg && textLower.includes(uJg);

            let shooterMsg = "";
            if (nameFound && (lizenzFound || jgFound)) {
                shooterMsg = `✅ <strong>Schütze bestätigt:</strong> ${user.vorname} ${user.nachname} ${lizenzFound ? `(Lizenz: ${uLiz})` : ''} ${jgFound ? `(Jg. ${uJg})` : ''}`;
            } else if (nameFound) {
                shooterMsg = `✅ <strong>Schütze erkannt:</strong> ${user.vorname} ${user.nachname} ${lizenzFound ? `(Lizenz: ${uLiz})` : ''}`;
            } else {
                shooterMsg = `👤 <strong>Schütze:</strong> ${user.vorname} ${user.nachname || ''} ${lizenzFound ? `(Lizenz: ${uLiz})` : ''}`;
            }

            // 2. Anlass mit Jahresmeisterschaft abgleichen
            const fullContestSearchText = `${detectedContest.erkannt || ''} ${detectedContest.veranstalter || ''} ${detectedContest.stich || ''} ${detectedContest.matched_title || ''} ${rawText}`;
            let bestComp = findBestMatchingCompetition(fullContestSearchText);

            const chosenTitle = (bestComp ? bestComp.title : (detectedContest.matched_title || detectedContest.erkannt || '')).trim();
            const anlassInput = document.getElementById("anlass");
            if (anlassInput && chosenTitle) {
                anlassInput.value = chosenTitle;
            }

            let contestMsg = "";
            if (bestComp) {
                contestMsg = `🎯 <strong>Anlass erkannt & zugeordnet:</strong> ${chosenTitle} <span style="font-size:0.8em; color:#15803d; font-weight:600;">(in Jahresmeisterschaft vorhanden)</span>`;
            } else if (chosenTitle) {
                contestMsg = `📝 <strong>Anlass erkannt:</strong> ${chosenTitle}`;
            } else {
                contestMsg = `📝 <strong>Anlass:</strong> Auswärtiges Schiessen`;
            }

            // 3. Punkte & Maximum ermitteln
            const pts = parseFloat(detectedResult.punkte);
            let maxPts = parseFloat(detectedResult.maximal);

            if (bestComp && (!maxPts || isNaN(maxPts))) {
                maxPts = bestComp.max;
            } else if (!maxPts || isNaN(maxPts)) {
                const fc = forecastMaxPoints(rawText, pts || 100);
                maxPts = fc.max;
            }

            const nameStatus = nameFound ? "MATCH" : ((uVor && textLower.includes(uVor)) || (uNach && textLower.includes(uNach)) ? "PARTIAL" : "NOT_FOUND");
            const lizenzStatus = lizenzFound ? "MATCH" : "NOT_FOUND";
            const contestStatus = bestComp ? "MATCH" : (chosenTitle ? "NEW_COL" : "ERROR");
            const scoreStatus = (!isNaN(pts) && pts > 0) ? "MATCH" : "NOT_FOUND";
            const isVerified = (nameStatus === "MATCH") && (lizenzStatus === "MATCH") && (scoreStatus === "MATCH");

            _currentOcrAnalysis = {
                source: "gemini_vision",
                modelUsed: data.modelUsed || "gemini-3-flash-preview",
                schuetze: {
                    formName: `${user.vorname || ''} ${user.nachname || ''}`.trim(),
                    formLizenz: uLiz,
                    formJahrgang: uJg,
                    detectedShooter: detectedShooter,
                    nameFound: nameFound,
                    nameStatus: nameStatus,
                    lizenzFound: lizenzFound,
                    lizenzStatus: lizenzStatus,
                    jgFound: jgFound,
                    jgStatus: jgFound ? "MATCH" : "NOT_FOUND"
                },
                anlass: {
                    erkannt: chosenTitle,
                    matchedTitle: bestComp ? bestComp.title : "",
                    stich: detectedContest.stich || "",
                    isKnown: !!bestComp,
                    status: contestStatus
                },
                ergebnis: {
                    punkte: !isNaN(pts) ? pts : null,
                    maximal: !isNaN(maxPts) ? maxPts : null,
                    status: scoreStatus
                },
                raw_text: rawText,
                snippet: rawText ? (rawText.length > 500 ? rawText.substring(0, 500) + '...' : rawText) : "",
                verified: isVerified
            };

            if (!isNaN(pts) && pts > 0) {
                document.getElementById("erzielt").value = pts;
                document.getElementById("maximal").value = maxPts;
                const pct = maxPts > 0 ? ((pts / maxPts) * 100).toFixed(2) : '100.00';
                const stichName = detectedContest.stich ? ` · ${detectedContest.stich}` : '';

                const statusHtml = `
                    <div style="text-align:left; font-size:0.87rem; line-height:1.45;">
                        <div style="font-weight:700; margin-bottom:4px; color:#166534;">✨ Standblatt erfolgreich ausgewertet:</div>
                        <div>${shooterMsg}</div>
                        <div>${contestMsg}</div>
                        <div>💯 <strong>Punkte & Maximum:</strong> <strong>${pts}</strong> / ${maxPts} Pkt. (${pct}%${stichName})</div>
                    </div>
                `;
                showAiStatus(statusHtml, "success");
                return;
            }
    } catch (err) {
        console.warn("Zentraler KI-OCR Aufruf nicht erfolgreich, Fallback auf manuelle Eingabe:", err);
        showAiStatus("📸 Foto bereit. Bitte trage deine Punkte und das Maximum kurz ein.", "info");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Standblatt jetzt einreichen";
        }
    }
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
        let fileUrl = null;
        try {
            const resData = await res.json();
            fileName = resData.fileName;
            fileUrl = resData.fileUrl || (fileName ? `${WORKER_UPLOAD_URL}?action=get_standblatt&file=${encodeURIComponent(fileName)}` : null);
        } catch (_) {}

        if (!fileUrl && fileName) {
            fileUrl = `${WORKER_UPLOAD_URL}?action=get_standblatt&file=${encodeURIComponent(fileName)}`;
        }

        // Fallback falls keine OCR stattfand (z.B. manuelle Eingabe)
        if (!_currentOcrAnalysis) {
            _currentOcrAnalysis = {
                source: "manual",
                modelUsed: "none",
                schuetze: {
                    formName: `${user.vorname || ''} ${user.nachname || ''}`.trim(),
                    formLizenz: String(user.lizenz || user.id || ''),
                    nameStatus: "UNCHECKED",
                    lizenzStatus: "UNCHECKED"
                },
                anlass: { erkannt: anlass || "Auswärtiges Schiessen", status: "UNCHECKED" },
                ergebnis: { punkte: erzielt, maximal: maximal, status: "UNCHECKED" },
                snippet: "Manuell eingereicht ohne vorherige automatische KI-Prüfung.",
                verified: false
            };
        }

        const logId = `sb_${user.lizenz || user.id}_${Date.now()}`;

        // 2. Supabase Audit-Log & Inbox (in contest_ocr_logs protokollieren mit Status 'pending' & ocr_analysis)
        await fetch(`${SUPABASE_REST_URL}/contest_ocr_logs`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id: logId,
                contest_type: "standblatt",
                round: "auswaertig",
                model_used: _currentOcrAnalysis.modelUsed || "client_ai_assisted",
                recognized_count: 1,
                raw_response: {
                    status: "pending",
                    anlass: anlass || "Auswärtiges Schiessen",
                    erzielt,
                    maximal,
                    lizenz: user.lizenz || user.id,
                    vorname: user.vorname,
                    nachname: user.nachname,
                    jahrgang: user.jahrgang || '',
                    fileName: fileName,
                    fileUrl: fileUrl,
                    ocr_analysis: _currentOcrAnalysis,
                    timestamp: new Date().toISOString()
                },
                created_by: String(user.lizenz || user.id)
            })
        });

        // 3. E-Mail-Bestätigung an Schützen & Kopie an System-Mails (Info_Mail_Standblatt_Upload)
        try {
            let shooterEmail = user.email || '';
            if (!shooterEmail && (user.lizenz || user.id)) {
                try {
                    const lizVal = encodeURIComponent(String(user.lizenz || user.id));
                    const memRes = await fetch(`${SUPABASE_REST_URL}/members?person_number=eq.${lizVal}&select=primary_email`, {
                        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` }
                    });
                    const memData = await memRes.json();
                    if (Array.isArray(memData) && memData.length > 0 && memData[0].primary_email) {
                        shooterEmail = memData[0].primary_email;
                    }
                } catch (memErr) {
                    console.warn("Konnte E-Mail aus Mitgliederstamm nicht nachladen:", memErr);
                }
            }

            const isVerified = _currentOcrAnalysis && _currentOcrAnalysis.verified;
            const perf = maximal > 0 ? ((erzielt / maximal) * 100).toFixed(1) : '100.0';
            const subject = isVerified
                ? `Bestätigung: Eingang Standblatt – ${anlass || 'Auswärtiges Schiessen'} (${erzielt} Pkt)`
                : `Eingang bestätigt: Meldung (${erzielt} Pkt) – ${anlass || 'Auswärtiges Schiessen'}`;

            const headerColor = isVerified ? '#2e7d32' : '#b45309';
            const headerTitle = isVerified ? 'Eingang bestätigt: Standblatt erfasst' : 'Eingang bestätigt: Manuelle Prüfung eingeleitet';
            const infoBanner = isVerified
                ? `<div style="background:#dcfce7; border-left:4px solid #22c55e; padding:12px 16px; border-radius:6px; margin:16px 0; color:#166534; font-size:14px;">
                     <strong>✅ Standblatt automatisch zugeordnet:</strong> Dein Resultat wurde erfasst und zur 1-Klick-Übernahme in die Jahresmeisterschaft bereitgestellt.
                   </div>`
                : `<div style="background:#fef9c3; border-left:4px solid #eab308; padding:12px 16px; border-radius:6px; margin:16px 0; color:#854d0e; font-size:14px;">
                     <strong>ℹ️ Hinweis zur Verarbeitung:</strong> Dein Standblatt-Foto konnte automatisch noch nicht vollständig zweifelsfrei zugeordnet werden. Dein Schützenmeister wird das Resultat <strong>manuell prüfen und in die Jahresmeisterschaft übernehmen</strong>. Du musst nichts weiter unternehmen.
                   </div>`;

            const htmlBody = `
                <div style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width:620px; margin:0 auto; padding:24px; color:#1f2937; line-height:1.5;">
                    <div style="border-bottom:2px solid ${headerColor}; padding-bottom:12px; margin-bottom:20px;">
                        <h2 style="color:${headerColor}; margin:0; font-size:20px;">${headerTitle}</h2>
                        <div style="font-size:13px; color:#6b7280; margin-top:4px;">Sportschützen Muhen · Jahresmeisterschaft</div>
                    </div>

                    <p style="font-size:15px; margin-bottom:16px;">
                        Hallo <strong>${user.vorname || 'Schütze'}</strong>,<br>
                        vielen Dank für deine Meldung über <strong>${erzielt} Punkte</strong> für das <strong>${anlass || 'Auswärtiges Schiessen'}</strong>.
                    </p>

                    ${infoBanner}

                    <table style="width:100%; border-collapse:collapse; margin:20px 0; background:#f9fafb; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;">
                        <tr>
                            <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; font-weight:600; width:35%; color:#4b5563;">Schütze</td>
                            <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; color:#111827;">${user.vorname} ${user.nachname || ''} ${user.lizenz ? `(Lizenz: ${user.lizenz})` : ''}</td>
                        </tr>
                        <tr>
                            <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; font-weight:600; color:#4b5563;">Schiessanlass</td>
                            <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; color:#111827;">${anlass || 'Auswärtiges Schiessen'}</td>
                        </tr>
                        <tr>
                            <td style="padding:12px 16px; font-weight:600; color:#4b5563;">Resultat</td>
                            <td style="padding:12px 16px; color:#111827;">
                                <span style="font-size:18px; font-weight:bold; color:${headerColor};">${erzielt}</span> / ${maximal} Pkt.
                                <span style="color:#6b7280; font-size:13px; margin-left:6px;">(${perf}%)</span>
                            </td>
                        </tr>
                    </table>

                    ${fileUrl ? `
                    <div style="margin:20px 0; text-align:center;">
                        <a href="${fileUrl}" target="_blank" style="display:inline-block; background:#0284c7; color:#ffffff; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none; font-size:14px;">
                            📄 Standblatt-Beleg anzeigen
                        </a>
                    </div>` : ''}

                    <p style="font-size:13px; color:#6b7280; margin-top:24px; border-top:1px solid #e5e7eb; padding-top:16px;">
                        Sobald die Freigabe durch den Schützenmeister erfolgt ist, erscheint dein Resultat offiziell in der Jahresmeisterschaft.<br>
                        <a href="https://www.sportschuetzen-muhen.ch/resultate/aktuelles_Jahr/jahresmeisterschaft" style="color:#0284c7; text-decoration:none;">Zur Online-Rangliste</a>
                    </p>

                    <p style="font-size:14px; margin-top:20px; color:#374151;">
                        Guet Schuss!<br>
                        <strong>Sportschützen Muhen</strong>
                    </p>
                </div>
            `;

            await fetch("https://supabase-muhen.danfamily.uk/functions/v1/send-email", {
                method: "POST",
                headers: {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    to: shooterEmail || undefined,
                    ccSystemMailKey: "Info_Mail_Standblatt_Upload",
                    subject: subject,
                    html: htmlBody,
                    module: "jahresmeisterschaft",
                    recordId: logId
                })
            });
        } catch (mailErr) {
            console.warn("Mail-Versand an Schütze / Info-Mail nicht erfolgreich:", mailErr);
        }

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

window.onload = async () => {
    await loadKnownCompetitions();
    loadTeilnehmer();
};
