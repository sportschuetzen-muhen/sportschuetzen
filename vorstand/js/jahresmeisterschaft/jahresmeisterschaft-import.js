// vorstand/js/jahresmeisterschaft/jahresmeisterschaft-import.js
// ============================================================
// MODUL: JAHRESMEISTERSCHAFT - CLIENT-SEITIGER RESULTATE-IMPORT
// & KI-STANDBLATT/PDF-PARSER (MIT HEIC-SUPPORT & SCHWEIZER PROGRAMMEN)
// & TOP-4 MANNSCHAFT, TOP-2 AUSWÄRTIGE & LIVE-BERECHNUNG
// ============================================================

let _jmImportState = {
    type: null,
    targetRound: 1,
    targetCol: -1,
    targetTitle: '',
    maxPoints: 100,
    isNewComp: false,
    rows: [],
    metadata: {},
    previewData: []
};

/**
 * Öffnet das zentrale Import-Modal für die 5 Wettkampfarten.
 */
function openJMImportModal() {
    _jmImportState = {
        type: null,
        targetRound: 1,
        targetCol: -1,
        targetTitle: '',
        maxPoints: 100,
        isNewComp: false,
        rows: [],
        metadata: {},
        previewData: []
    };

    const loadingElem = document.getElementById('jm-import-loading');
    if (loadingElem) loadingElem.classList.add('d-none');

    const auswConfig = document.getElementById('jm-import-auswaertig-config');
    if (auswConfig) auswConfig.classList.add('d-none');

    const previewContainer = document.getElementById('jm-import-preview-container');
    if (previewContainer) previewContainer.classList.add('d-none');

    const previewBody = document.getElementById('jm-import-preview-body');
    if (previewBody) previewBody.innerHTML = '';

    const commitBtn = document.getElementById('jm-import-commit-btn');
    if (commitBtn) commitBtn.disabled = true;

    // File inputs zurücksetzen
    ['importFileVerein', 'importFileVerband', 'importFileKantonal', 'importFileMannschaft', 'importFileAuswaertig'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Dropdown für Auswärtige Anlässe vorab initialisieren
    jmPopulateTargetCompetitions();

    const modalElem = document.getElementById('jm-import-modal');
    if (modalElem) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalElem);
        modal.show();
    }
}
window.openJMImportModal = openJMImportModal;

/**
 * Befüllt das Ziel-Anlass-Dropdown für Auswärtige Schiessen (Spalten ab 41/42).
 */
function jmPopulateTargetCompetitions(selectedCol = -1, detectedName = '') {
    const selectElem = document.getElementById('jm-import-target-competition');
    if (!selectElem) return;

    selectElem.innerHTML = '';
    const grid = jmRawGrid;
    if (!grid || !grid[2]) return;

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }
    const startDynamic = hasStatusCol ? 42 : 41;

    let bestMatchCol = -1;
    const cleanDetected = detectedName.toLowerCase().replace(/[^a-z0-9äöü]/g, '');

    for (let c = startDynamic; c < grid[2].length; c++) {
        const title = String(grid[2][c] || '').trim();
        if (title && !title.includes('%') && !title.toLowerCase().startsWith('spalte')) {
            const maxPts = grid[3] ? (parseFloat(grid[3][c]) || 100) : 100;
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = `${title} (Spalte ${c + 1}, Max: ${maxPts})`;
            
            if (cleanDetected) {
                const cleanT = title.toLowerCase().replace(/[^a-z0-9äöü]/g, '');
                if (cleanDetected.includes(cleanT) || cleanT.includes(cleanDetected)) {
                    bestMatchCol = c;
                }
            }
            selectElem.appendChild(opt);
        }
    }

    // Option für neuen Anlass
    const newOpt = document.createElement('option');
    newOpt.value = 'new';
    newOpt.textContent = detectedName ? `➕ Neuen Anlass anlegen: "${detectedName}"` : `➕ Neuen Anlass anlegen...`;
    selectElem.appendChild(newOpt);

    if (selectedCol !== -1) {
        selectElem.value = String(selectedCol);
    } else if (bestMatchCol !== -1) {
        selectElem.value = String(bestMatchCol);
    } else if (selectElem.options.length > 1) {
        selectElem.selectedIndex = 0;
    } else {
        selectElem.value = 'new';
    }
}

/**
 * Event-Handler bei Änderung des Ziel-Anlasses im Dropdown.
 */
function jmOnTargetCompetitionChange() {
    const selectElem = document.getElementById('jm-import-target-competition');
    if (!selectElem) return;

    const val = selectElem.value;
    const grid = jmRawGrid;
    const maxInput = document.getElementById('jm-import-max-points');

    if (val === 'new') {
        _jmImportState.isNewComp = true;
        _jmImportState.targetCol = -1;
        _jmImportState.targetTitle = _jmImportState.metadata.title || 'Auswärtiges Schiessen';
    } else {
        const colIdx = parseInt(val);
        _jmImportState.isNewComp = false;
        _jmImportState.targetCol = colIdx;
        _jmImportState.targetTitle = String(grid[2][colIdx] || '').trim();

        if (grid[3] && grid[3][colIdx]) {
            const existingMax = parseFloat(grid[3][colIdx]);
            if (!isNaN(existingMax) && existingMax > 0 && maxInput) {
                maxInput.value = existingMax;
                _jmImportState.maxPoints = existingMax;
            }
        }
    }

    // Vorschau mit der neu gewählten Spalte aktualisieren
    if (_jmImportState.rows && _jmImportState.rows.length > 0) {
        jmRenderPreview(_jmImportState.rows, 'auswaertig', _jmImportState.metadata);
    }
}
window.jmOnTargetCompetitionChange = jmOnTargetCompetitionChange;

/**
 * Event-Handler bei manueller Änderung der Maximalpunkte.
 */
function jmOnMaxPointsChange() {
    const maxInput = document.getElementById('jm-import-max-points');
    if (!maxInput) return;
    const pts = parseFloat(maxInput.value);
    if (!isNaN(pts) && pts > 0) {
        _jmImportState.maxPoints = pts;
        const badge = document.getElementById('jm-import-max-source-badge');
        if (badge) badge.innerText = "Manuell angepasst";
    }
}
window.jmOnMaxPointsChange = jmOnMaxPointsChange;

/**
 * CSV-Parser mit Erkennung von Trennzeichen (; , \t)
 */
function jmParseCSV(text) {
    const lines = text.split(/\r?\n/);
    return lines.map(line => {
        let parts = line.split(';');
        if (parts.length <= 1) parts = line.split(',');
        if (parts.length <= 1) parts = line.split('\t');
        return parts.map(p => {
            p = p.trim();
            if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
            return p;
        });
    });
}

/**
 * Verarbeitet den Datei-Upload für alle 5 Wettkampfarten (Excel, CSV, PDF, Foto, HEIC).
 */
async function jmHandleFileUpload(file, type) {
    if (!file) return;

    _jmImportState.type = type;
    const loadingElem = document.getElementById('jm-import-loading');
    const loadingTitle = document.getElementById('jm-import-loading-title');
    const loadingDesc = document.getElementById('jm-import-loading-desc');

    // ──────────────────────────────────────────────
    // 0. APPLE HEIC KONVERTIERUNG (für iPhone-Fotos)
    // ──────────────────────────────────────────────
    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
        if (loadingElem) {
            loadingElem.classList.remove('d-none');
            if (loadingTitle) loadingTitle.innerText = "Konvertiere Apple HEIC-Foto...";
            if (loadingDesc) loadingDesc.innerText = "Das iPhone-Bildformat wird in Standard-JPEG umgewandelt.";
        }
        try {
            if (typeof heic2any !== 'undefined') {
                const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
                const blobObj = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                file = new File([blobObj], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
            }
        } catch (heicErr) {
            console.warn("HEIC Konvertierung Hinweis:", heicErr);
        }
    }

    // ──────────────────────────────────────────────
    // 1. PDF-VERARBEITUNG (Digitale Rangliste wie Villmergen oder Scan)
    // ──────────────────────────────────────────────
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (isPdf) {
        if (loadingElem) {
            loadingElem.classList.remove('d-none');
            if (loadingTitle) loadingTitle.innerText = "Analysiere PDF-Rangliste...";
            if (loadingDesc) loadingDesc.innerText = "PDF-Inhalt und Schiessprogramm werden extrahiert.";
        }
        try {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error("PDF.js Bibliothek nicht geladen.");
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += '\n' + pageText;
            }

            if (fullText.trim().length > 30) {
                // Digitales PDF mit Text (wie das Villmergen-Beispiel)
                jmProcessAuswaertigFromText(fullText, file.name);
                if (loadingElem) loadingElem.classList.add('d-none');
                return;
            } else {
                // Gescanntes PDF: Rendere 1. Seite als Bild für Vision OCR
                const firstPage = await pdf.getPage(1);
                const viewport = firstPage.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await firstPage.render({ canvasContext: ctx, viewport: viewport }).promise;
                const base64Data = canvas.toDataURL('image/jpeg', 0.85);
                await jmProcessAuswaertigFromImage(base64Data, file.name);
                if (loadingElem) loadingElem.classList.add('d-none');
                return;
            }
        } catch (pdfErr) {
            console.error("PDF Parsing Fehler:", pdfErr);
            showError("Fehler beim Verarbeiten des PDFs: " + pdfErr.message);
            if (loadingElem) loadingElem.classList.add('d-none');
            return;
        }
    }

    // ──────────────────────────────────────────────
    // 2. FOTO / BILD-DATEI (Standblatt-Foto vom Smartphone)
    // ──────────────────────────────────────────────
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    if (isImage && type === 'auswaertig') {
        if (loadingElem) {
            loadingElem.classList.remove('d-none');
            if (loadingTitle) loadingTitle.innerText = "Analysiere Standblatt-Foto mit KI...";
            if (loadingDesc) loadingDesc.innerText = "Google Gemini erkennt Schützen, Punkte und Schiessprogramm.";
        }
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            await jmProcessAuswaertigFromImage(base64, file.name);
        } catch (imgErr) {
            console.error("Bildanalyse Fehler:", imgErr);
            showError("Fehler bei der Bildanalyse: " + imgErr.message);
        } finally {
            if (loadingElem) loadingElem.classList.add('d-none');
        }
        return;
    }

    // ──────────────────────────────────────────────
    // 3. EXCEL / CSV VERARBEITUNG
    // ──────────────────────────────────────────────
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();

    if (isCsv) {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const rows = jmParseCSV(text);
                jmProcessImportRows(rows, type, file.name);
            } catch (err) {
                showError("Fehler beim Lesen der CSV-Datei: " + err.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    } else {
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                if (typeof XLSX === 'undefined') {
                    showError("Excel-Bibliothek (SheetJS) nicht geladen.");
                    return;
                }
                const workbook = XLSX.read(data, { type: 'array' });

                let chosenSheet = workbook.SheetNames[0];
                if (type === 'mannschaft') {
                    const eingabeSheet = workbook.SheetNames.find(s => s.toLowerCase().trim() === 'eingabe');
                    if (eingabeSheet) chosenSheet = eingabeSheet;
                } else {
                    const resSheet = workbook.SheetNames.find(s => s.toLowerCase().trim() === 'resultatblatt');
                    if (resSheet) chosenSheet = resSheet;
                }

                const worksheet = workbook.Sheets[chosenSheet];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                jmProcessImportRows(rows, type, file.name);
            } catch (err) {
                showError("Fehler beim Lesen der Excel-Datei: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }
}
window.jmHandleFileUpload = jmHandleFileUpload;

/**
 * Analysiert den reinen Text eines PDFs/Dokuments auf Schützen, Punkte und Schiessprogramme.
 */
function jmProcessAuswaertigFromText(text, fileName) {
    const grid = jmRawGrid;
    if (!grid || grid.length < 6) return;

    // Bekannte Schützen aus jmRawGrid indizieren
    const knownShooters = [];
    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        const lizenz = String(grid[r][4] || '').replace(/\D/g, '').padStart(6, '0');
        if (nachname || vorname) {
            knownShooters.push({
                rowIndex: r,
                nachname,
                vorname,
                fullName: `${nachname} ${vorname}`.trim(),
                lizenz
            });
        }
    }

    // Wettkampf-Titel erkennen
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let detectedTitle = fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') : 'Auswärtiges Schiessen';
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const l = lines[i];
        if (/(?:schiessen|stich|cup|fest|verband|verein|stumpenland|bärenmoos|freischiessen|sektion|gruppe)/i.test(l)) {
            detectedTitle = l;
            break;
        }
    }

    // Schützen-Matching
    const matchedResults = [];
    const seenRows = new Set();

    lines.forEach(line => {
        knownShooters.forEach(s => {
            if (seenRows.has(s.rowIndex)) return;
            const nachnameMatches = s.nachname && new RegExp('\\b' + s.nachname + '\\b', 'i').test(line);
            const vornameMatches = s.vorname && new RegExp('\\b' + s.vorname + '\\b', 'i').test(line);
            const lizenzMatches = s.lizenz && s.lizenz !== '000000' && line.includes(s.lizenz);

            if ((nachnameMatches && vornameMatches) || lizenzMatches) {
                // Punktzahlen suchen (Schiesssport typisch 40 bis 600)
                const nums = line.match(/\b(100|[4-9][0-9]|1[0-9]{2}|200|5[0-9]{2}|600)\b/g);
                if (nums && nums.length > 0) {
                    // Filter Jahrgänge (1940..2025)
                    const validNums = nums.filter(n => !/^19[4-9][0-9]$|^20[0-2][0-9]$/.test(n));
                    if (validNums.length > 0) {
                        const pts = parseFloat(validNums[0]);
                        matchedResults.push({
                            rowIndex: s.rowIndex,
                            name: s.fullName,
                            lizenz: s.lizenz,
                            points: pts,
                            matched: true
                        });
                        seenRows.add(s.rowIndex);
                    }
                }
            }
        });
    });

    // Kontext Schweizer Schiessprogramme:
    // 6x10=60, 8x10=80, 10x10=100 (Gruppenstich), 12x10=120, 15x10=150, 20x10=200, 30x10=300, 60x10=600
    const pointsList = matchedResults.map(r => r.points);
    const maxScore = pointsList.length > 0 ? Math.max(...pointsList) : 100;
    
    let forecastMax = 100;
    let forecastReason = '10 Schuss à 10 Pkt. (Gruppenstich G50)';
    
    if (/60\s*schuss|liegend/i.test(text) || maxScore > 300) {
        forecastMax = 600;
        forecastReason = '60 Schuss Liegendmatch / Meisterschaft (Max. 600)';
    } else if (/kantonalstich|30\s*schuss/i.test(text) || maxScore > 200) {
        forecastMax = 300;
        forecastReason = '30 Schuss Programm (Max. 300)';
    } else if (/vereinsstich|verband|20\s*schuss/i.test(text) || maxScore > 150) {
        forecastMax = 200;
        forecastReason = '20 Schuss Programm (Max. 200)';
    } else if (/15\s*schuss|auszahlung|sektion/i.test(text) || (maxScore > 120 && maxScore <= 150)) {
        forecastMax = 150;
        forecastReason = '15 Schuss Programm (Max. 150)';
    } else if (/12\s*schuss|6\s*x\s*20/i.test(text) || (maxScore > 100 && maxScore <= 120)) {
        forecastMax = 120;
        forecastReason = '12 Schuss bzw. 6x20 Programm (Max. 120)';
    } else if (/8\s*schuss|8\s*x\s*10/i.test(text) || (maxScore > 60 && maxScore <= 80 && !text.includes('10 Schuss'))) {
        forecastMax = 80;
        forecastReason = '8 Schuss à 10 Pkt. (Max. 80)';
    } else if (/6\s*schuss|6\s*x\s*10/i.test(text) || (maxScore <= 60 && !text.includes('10 Schuss'))) {
        forecastMax = 60;
        forecastReason = '6 Schuss à 10 Pkt. (Max. 60)';
    } else {
        forecastMax = 100;
        forecastReason = '10 Schuss à 10 Pkt. (Gruppenstich / Einzelstich)';
    }

    _jmImportState.rows = matchedResults;
    _jmImportState.metadata = {
        title: detectedTitle,
        maxPoints: forecastMax,
        reason: forecastReason,
        fileName: fileName
    };

    jmSetupAuswaertigPreview(detectedTitle, forecastMax, forecastReason, matchedResults);
}

/**
 * Sendet ein Standblatt-Foto an die zentrale Gemini Vision OCR API.
 */
async function jmProcessAuswaertigFromImage(base64Data, fileName) {
    const grid = jmRawGrid;
    if (!grid || grid.length < 6) return;

    const shooters = [];
    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (nachname || vorname) {
            shooters.push({
                id: r,
                name: `${nachname} ${vorname}`.trim()
            });
        }
    }

    try {
        const res = await apiFetch("resultate", "action=ocr", {
            method: "POST",
            body: JSON.stringify({
                image: base64Data,
                shooters: shooters,
                round: "auswaertig",
                model: "gemini-2.5-flash"
            })
        });

        const data = await res.json();
        if (data && data.success && Array.isArray(data.ergebnisse)) {
            const matchedResults = [];
            data.ergebnisse.forEach(item => {
                if (item.id && item.points > 0) {
                    matchedResults.push({
                        rowIndex: parseInt(item.id),
                        name: item.name || '',
                        lizenz: '',
                        points: item.points,
                        matched: true
                    });
                }
            });

            const ptsList = matchedResults.map(r => r.points);
            const maxPts = ptsList.length > 0 ? (Math.max(...ptsList) <= 100 ? 100 : 200) : 100;
            const detectedTitle = fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') : 'Standblatt Auswärtig';
            
            _jmImportState.rows = matchedResults;
            _jmImportState.metadata = {
                title: detectedTitle,
                maxPoints: maxPts,
                reason: 'Gemini Vision Erkennung',
                fileName: fileName
            };
            jmSetupAuswaertigPreview(detectedTitle, maxPts, 'KI-Standblatt-Erkennung', matchedResults);
            return;
        }
    } catch (ocrErr) {
        console.warn("Zentraler OCR-Aufruf Fehler, öffne manuelle Eingabe:", ocrErr);
    }

    // Fallback falls OCR nicht antwortet
    const fallbackTitle = fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') : 'Auswärtiges Schiessen';
    jmSetupAuswaertigPreview(fallbackTitle, 100, 'Manuelle Erfassung (KI-Fallback)', []);
}

/**
 * Richtet die Konfigurationsleiste und Vorschau für Auswärtige Schiessen ein.
 */
function jmSetupAuswaertigPreview(detectedTitle, forecastMax, forecastReason, matchedResults) {
    const configCard = document.getElementById('jm-import-auswaertig-config');
    if (configCard) configCard.classList.remove('d-none');

    // Dropdown mit Anlässen befüllen
    jmPopulateTargetCompetitions(-1, detectedTitle);

    const maxInput = document.getElementById('jm-import-max-points');
    if (maxInput) maxInput.value = forecastMax;

    const sourceBadge = document.getElementById('jm-import-max-source-badge');
    if (sourceBadge) sourceBadge.innerText = "KI-Prognose";

    const reasonHint = document.getElementById('jm-import-prognose-hint');
    if (reasonHint) reasonHint.innerText = `💡 ${forecastReason}`;

    _jmImportState.maxPoints = forecastMax;

    const selectElem = document.getElementById('jm-import-target-competition');
    if (selectElem && selectElem.value !== 'new') {
        _jmImportState.targetCol = parseInt(selectElem.value);
    } else {
        _jmImportState.targetCol = -1;
        _jmImportState.isNewComp = true;
    }

    jmRenderPreview(matchedResults, 'auswaertig', _jmImportState.metadata);
}

/**
 * Extrahiert Schützen- und Punktdaten aus den rohen Tabellenzeilen (Verein, Verband, Kantonalstich, Mannschaft).
 */
function jmProcessImportRows(rows, type, fileName) {
    if (!rows || rows.length < 5) {
        showError("Die Import-Datei enthält keine verwertbaren Zeilen.");
        return;
    }

    const grid = jmRawGrid;
    if (!grid || grid.length < 6) {
        showError("Keine Jahresmeisterschafts-Daten geladen.");
        return;
    }

    const configCard = document.getElementById('jm-import-auswaertig-config');
    if (configCard) configCard.classList.add('d-none');

    const parsedData = [];
    const meta = { fileName: fileName || '', soll: null, runde: 1 };

    // ──────────────────────────────────────────────
    // 1. KANTONALSTICH (CSV / Excel)
    // ──────────────────────────────────────────────
    if (type === 'kantonal') {
        let startRow = 1;
        for (let r = 0; r < Math.min(10, rows.length); r++) {
            const rowStr = (rows[r] || []).join(' ').toLowerCase();
            if (rowStr.includes('lizenz') || rowStr.includes('total') || rowStr.includes('punkte')) {
                startRow = r + 1;
                break;
            }
        }

        for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 3) continue;

            const rawLiz = String(row[0] || '').trim();
            const nName = String(row[1] || '').trim();
            const vName = String(row[2] || '').trim();
            
            let tot = parseFloat(String(row[6] || '').replace(',', '.'));
            if (isNaN(tot) || tot <= 0) {
                for (let c = 3; c < row.length; c++) {
                    const num = parseFloat(String(row[c] || '').replace(',', '.'));
                    if (!isNaN(num) && num > 0) {
                        tot = num;
                        break;
                    }
                }
            }

            if ((rawLiz || nName) && !isNaN(tot) && tot > 0) {
                const liz = rawLiz.replace(/\D/g, '').padStart(6, '0');
                parsedData.push({
                    lizenz: liz,
                    name: `${nName} ${vName}`.trim() || nName,
                    points: tot
                });
            }
        }
    }

    // ──────────────────────────────────────────────
    // 2. VEREINSWETTSCHIESSEN & 3. VERBANDSSCHIESSEN
    // ──────────────────────────────────────────────
    else if (type === 'verein' || type === 'verband') {
        for (let r = 68; r < Math.min(75, rows.length); r++) {
            const cellVal = Number(rows[r] && rows[r][4]);
            if (!isNaN(cellVal) && cellVal > 0) {
                meta.soll = cellVal;
                break;
            }
        }

        let lizCol = 2;
        let nameCol = 3;
        let vornameCol = 4;
        let totCol = 9;
        let startRow = 18;

        for (let r = 0; r < Math.min(30, rows.length); r++) {
            const row = rows[r] || [];
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] || '').toLowerCase().trim();
                if (cell === 'lizenz' || cell === 'lizenz-nr' || cell === 'ausweis') lizCol = c;
                if (cell === 'name' || cell === 'nachname') nameCol = c;
                if (cell === 'vorname') vornameCol = c;
                if (cell === 'total' || cell === 'punkte' || cell === 'resultat') totCol = c;
            }
            if (row.some(c => String(c || '').toLowerCase().includes('lizenz'))) {
                startRow = r + 1;
                break;
            }
        }

        for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;

            const nName = String(row[nameCol] || '').trim();
            const vName = String(row[vornameCol] || '').trim();
            const rawLiz = String(row[lizCol] || '').trim();
            const tot = parseFloat(String(row[totCol] || '').replace(',', '.'));

            if ((nName || rawLiz) && !isNaN(tot) && tot > 0) {
                const liz = rawLiz.replace(/\D/g, '').padStart(6, '0');
                parsedData.push({
                    lizenz: liz,
                    name: `${nName} ${vName}`.trim() || nName,
                    points: tot
                });
            }
        }
    }

    // ──────────────────────────────────────────────
    // 4. MANNSCHAFT (Runden 1 bis 7)
    // ──────────────────────────────────────────────
    else if (type === 'mannschaft') {
        let detectedRound = 1;
        if (rows[5] && rows[5][15] !== undefined) {
            const rNum = parseInt(rows[5][15]);
            if (!isNaN(rNum) && rNum >= 1 && rNum <= 7) detectedRound = rNum;
        } else if (rows[5] && rows[5][7] !== undefined) {
            const rNum = parseInt(rows[5][7]);
            if (!isNaN(rNum) && rNum >= 1 && rNum <= 7) detectedRound = rNum;
        }
        
        const matchName = fileName ? fileName.match(/(?:runde|r)[\s_-]?([1-7])/i) : null;
        if (matchName) {
            detectedRound = parseInt(matchName[1]);
        }

        const roundSelect = document.getElementById('jm-mannschaft-round-select');
        if (roundSelect) {
            if (roundSelect.value && roundSelect.value !== '') {
                detectedRound = parseInt(roundSelect.value) || detectedRound;
            } else {
                roundSelect.value = String(detectedRound);
            }
        }
        meta.runde = detectedRound;

        let startRow = 5;
        let teamCol = 1;
        let nameCol = 2;
        let lizCol = 5;
        let totCol = 6;

        for (let r = 0; r < Math.min(10, rows.length); r++) {
            const row = rows[r] || [];
            if (row.some(c => String(c || '').toLowerCase().includes('schütze') || String(c || '').toLowerCase().includes('lizenz'))) {
                startRow = r + 1;
                for (let c = 0; c < row.length; c++) {
                    const v = String(row[c] || '').toLowerCase().trim();
                    if (v.includes('team') || v.includes('mannschaft')) teamCol = c;
                    if (v.includes('schütze') || v.includes('name')) nameCol = c;
                    if (v.includes('lizenz')) lizCol = c;
                    if (v.includes('total') || v.includes('punkte')) totCol = c;
                }
                break;
            }
        }

        for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;

            const team = String(row[teamCol] || '').trim();
            const fullName = String(row[nameCol] || '').trim();
            const rawLiz = String(row[lizCol] || '').trim();
            const tot = parseFloat(String(row[totCol] || '').replace(',', '.'));

            if (fullName && !isNaN(tot) && tot > 0) {
                const liz = rawLiz.replace(/\D/g, '').padStart(6, '0');
                parsedData.push({
                    lizenz: liz,
                    name: fullName,
                    team: team,
                    points: tot
                });
            }
        }
    }

    _jmImportState.rows = parsedData;
    _jmImportState.metadata = meta;
    jmRenderPreview(parsedData, type, meta);
}

/**
 * Rendert die Vorschau-Tabelle mit Abgleich gegen die Schützen in der Jahresmeisterschaft.
 */
function jmRenderPreview(parsedData, type, meta) {
    const previewContainer = document.getElementById('jm-import-preview-container');
    const previewBody = document.getElementById('jm-import-preview-body');
    const statsElem = document.getElementById('jm-import-stats');
    const commitBtn = document.getElementById('jm-import-commit-btn');

    if (!previewContainer || !previewBody) return;

    previewBody.innerHTML = '';
    previewContainer.classList.remove('d-none');

    const grid = jmRawGrid;
    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }

    // Zielspalte ermitteln
    let targetCol = -1;
    let targetTitle = '';

    if (type === 'verband') {
        targetCol = hasStatusCol ? 7 : 6;
        targetTitle = 'Verbandsschiessen';
    } else if (type === 'kantonal') {
        targetCol = hasStatusCol ? 8 : 7;
        targetTitle = 'Kantonalstich';
    } else if (type === 'verein') {
        targetCol = hasStatusCol ? 9 : 8;
        targetTitle = 'Vereinswettschiessen';
    } else if (type === 'mannschaft') {
        const rawStart = hasStatusCol ? 34 : 33;
        const runde = meta.runde || 1;
        targetCol = rawStart + (runde - 1);
        targetTitle = `Mannschaft Runde ${runde}`;
    } else if (type === 'auswaertig') {
        targetCol = _jmImportState.targetCol;
        targetTitle = _jmImportState.targetTitle || 'Auswärtiges Schiessen';
    }

    // Schützen aus Grid indizieren
    const gridShooters = [];
    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        const lizenz = String(grid[r][4] || '').replace(/\D/g, '').padStart(6, '0');
        const currentScore = (targetCol !== -1 && grid[r][targetCol] !== undefined)
            ? (parseFloat(String(grid[r][targetCol] || '').replace(',', '.')) || 0)
            : 0;
        
        if (nachname || vorname) {
            gridShooters.push({
                rowIndex: r,
                nachname,
                vorname,
                fullName: `${nachname} ${vorname}`.trim(),
                lizenz,
                currentScore
            });
        }
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    const previewList = [];

    parsedData.forEach(entry => {
        let matched = null;
        if (entry.rowIndex !== undefined && entry.rowIndex !== null) {
            matched = gridShooters.find(s => s.rowIndex === entry.rowIndex);
        }
        if (!matched && entry.lizenz && entry.lizenz !== '000000') {
            matched = gridShooters.find(s => s.lizenz === entry.lizenz);
        }
        if (!matched && entry.name) {
            const cleanEntryName = entry.name.toLowerCase().replace(/[^a-zäöü]/g, '');
            matched = gridShooters.find(s => {
                const sName = s.fullName.toLowerCase().replace(/[^a-zäöü]/g, '');
                return sName.includes(cleanEntryName) || cleanEntryName.includes(sName);
            });
        }

        if (matched) {
            matchedCount++;
            const diff = entry.points - matched.currentScore;
            previewList.push({
                matched: true,
                rowIndex: matched.rowIndex,
                targetCol: targetCol,
                lizenz: entry.lizenz || matched.lizenz,
                name: matched.fullName,
                oldScore: matched.currentScore,
                newScore: entry.points,
                diff: diff
            });
        } else {
            unmatchedCount++;
            previewList.push({
                matched: false,
                rowIndex: null,
                targetCol: targetCol,
                lizenz: entry.lizenz || '–',
                name: entry.name,
                oldScore: 0,
                newScore: entry.points,
                diff: entry.points
            });
        }
    });

    _jmImportState.previewData = previewList;

    // Vorschau HTML
    let rowsHtml = '';
    previewList.forEach(item => {
        const badge = item.matched 
            ? `<span class="badge bg-success"><i class="fas fa-check me-1"></i>Gematcht</span>` 
            : `<span class="badge bg-warning text-dark"><i class="fas fa-exclamation-triangle me-1"></i>Nicht in JM</span>`;
        
        let diffBadge = `<span class="text-muted">±0</span>`;
        if (item.diff > 0) diffBadge = `<span class="text-success fw-bold">+${item.diff}</span>`;
        else if (item.diff < 0) diffBadge = `<span class="text-danger fw-bold">${item.diff}</span>`;

        rowsHtml += `
            <tr class="${item.matched ? '' : 'table-light text-muted'}">
                <td><code>${escapeHtml(item.lizenz)}</code></td>
                <td class="fw-semibold">${escapeHtml(item.name)}</td>
                <td class="text-center">${item.matched ? item.oldScore : '–'}</td>
                <td class="text-center fw-bold text-primary">${item.newScore}</td>
                <td class="text-center">${diffBadge}</td>
                <td>${badge}</td>
            </tr>
        `;
    });

    previewBody.innerHTML = rowsHtml;

    // Statistik-Hinweis
    if (statsElem) {
        let sollText = meta.soll ? ` | Soll-Teilnehmer: <strong>${meta.soll}</strong>` : '';
        statsElem.innerHTML = `
            <div class="alert alert-info py-2 px-3 small mb-0 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <i class="fas fa-info-circle me-1"></i>
                    Ziel: <strong>${escapeHtml(targetTitle || 'Auswärtiges')}</strong> |
                    Gefunden in Datei: <strong>${parsedData.length}</strong> |
                    Gematcht: <strong class="text-success">${matchedCount}</strong> |
                    Ausserhalb JM: <strong class="text-warning">${unmatchedCount}</strong>
                    ${sollText}
                </div>
                ${matchedCount > 0 ? `<span class="badge bg-primary">${matchedCount} Resultate bereit</span>` : ''}
            </div>
        `;
    }

    if (commitBtn) {
        commitBtn.disabled = (matchedCount === 0);
    }
}

/**
 * Übernimmt die geprüften Werte atomar in jmRawGrid,
 * berechnet Top 4 Mannschaft, Top 2 Auswärtige, Prozente und Totals neu
 * und speichert atomar direkt nach Supabase.
 */
async function jmCommitImport() {
    const previewList = _jmImportState.previewData;
    if (!previewList || previewList.length === 0) return;

    const matchedEntries = previewList.filter(item => item.matched && item.rowIndex !== null);
    if (matchedEntries.length === 0) {
        showError("Keine gematchten Schützen zum Eintragen vorhanden.");
        return;
    }

    const grid = jmRawGrid;
    const sb = getJMSupabaseClient();
    if (!sb) {
        showError("Supabase-Client ist nicht verfügbar.");
        return;
    }

    try {
        showLoadingOverlay(`Importiere ${matchedEntries.length} Resultate und berechne Jahresmeisterschaft neu...`);

        let targetCol = _jmImportState.targetCol;

        // Falls Auswärtiges Schiessen und neuer Anlass angelegt werden soll:
        if (_jmImportState.type === 'auswaertig') {
            const compRow = grid[2] || [];
            const maxPts = _jmImportState.maxPoints || 100;
            const newTitle = (_jmImportState.targetTitle || 'Auswärtiges Schiessen').trim();

            if (_jmImportState.isNewComp || targetCol === -1) {
                // Suche erste leere Spalte ab Spalte 41 oder hänge neue an
                for (let c = 41; c < compRow.length; c++) {
                    const t = String(compRow[c] || '').trim().toLowerCase();
                    if (!t || t === '' || t.startsWith('spalte')) {
                        targetCol = c;
                        break;
                    }
                }
                if (targetCol === -1) {
                    targetCol = compRow.length;
                }

                if (!grid[0]) grid[0] = [];
                if (!grid[2]) grid[2] = [];
                if (!grid[3]) grid[3] = [];

                grid[0][targetCol] = 'TRUE';
                grid[2][targetCol] = newTitle;
                grid[3][targetCol] = maxPts;

                for (let r = 5; r < grid.length; r++) {
                    if (grid[r] && grid[r][targetCol] === undefined) {
                        grid[r][targetCol] = '';
                    }
                }
            } else {
                // Bestehender Anlass: Maximalpunkte in Zeile 3 aktualisieren
                if (grid[3]) {
                    grid[3][targetCol] = maxPts;
                }
            }
        }

        // 1. Neue Punktwerte in jmRawGrid eintragen
        matchedEntries.forEach(item => {
            const finalCol = (_jmImportState.type === 'auswaertig') ? targetCol : item.targetCol;
            if (grid[item.rowIndex]) {
                grid[item.rowIndex][finalCol] = item.newScore;
            }
        });

        // 2. Gesamte Jahresmeisterschaft inklusive Top 4 Mannschaft & Top 2 Auswärtige neu berechnen
        const maxPercent = recalculateJMRawGrid(grid);

        // 3. Atomares Speichern nach public.jm_seasons
        const juniorList = Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true);
        const { error: errSeason } = await sb
            .from('jm_seasons')
            .upsert({
                jahr: jmCurrentJahr,
                raw_grid: grid,
                junior_exclusions: juniorList,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

        if (errSeason) throw errSeason;

        // 4. Strukturierte Ranglisten synchronisieren (public.jm_shooters)
        if (typeof syncJMShootersToSupabase === 'function') {
            await syncJMShootersToSupabase(sb, jmCurrentJahr, grid);
        }

        // Modal schliessen
        const modalElem = document.getElementById('jm-import-modal');
        if (modalElem) {
            const modal = bootstrap.Modal.getInstance(modalElem);
            if (modal) modal.hide();
        }

        // State bereinigen
        jmPendingUpdates = [];
        jmPendingMoves = [];
        jmExclusionsChanged = false;
        AppState.clearUnsaved();

        // UI neu rendern
        renderJahresmeisterschaft(grid);

        showSuccess(`✅ Import erfolgreich! ${matchedEntries.length} Resultate eingetragen. Neues Maximum: ${maxPercent} %`);

    } catch (err) {
        console.error("❌ Fehler beim Import-Speichern:", err);
        showError("Fehler beim Speichern: " + err.message);
    } finally {
        hideLoadingOverlay();
    }
}
window.jmCommitImport = jmCommitImport;

// ============================================================
// BERECHNUNGS-ENGINE: MANNSCHAFT (TOP 4), AUSWÄRTIGE (TOP 2) & TOTALS
// ============================================================

/**
 * Ermittelt für jeden Schützen aus den 7 Mannschaftsrunden (Spalten 33..39)
 * die vier höchsten Resultate und überträgt sie in Spalten 9..12 (Mannschaft #1..#4).
 */
function updateTopMannschaft(grid) {
    if (!grid || grid.length < 6) return;

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }
    const rawStart = hasStatusCol ? 34 : 33;
    const rawCols = [rawStart, rawStart + 1, rawStart + 2, rawStart + 3, rawStart + 4, rawStart + 5, rawStart + 6];

    // Zielspalten vor TOTAL: Mannschaft #1..#4
    const targetCols = [
        hasStatusCol ? 10 : 9,
        hasStatusCol ? 11 : 10,
        hasStatusCol ? 12 : 11,
        hasStatusCol ? 13 : 12
    ];
    // Prozent-Spalten für Mannschaft #1..#4
    const pctCols = [
        hasStatusCol ? 23 : 22,
        hasStatusCol ? 24 : 23,
        hasStatusCol ? 25 : 24,
        hasStatusCol ? 26 : 25
    ];

    const maxPoints = parseFloat(grid[3][targetCols[0]]) || 200;

    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;

        // Alle Punkte aus den 7 Runden sammeln
        const scores = [];
        rawCols.forEach(colIdx => {
            const val = grid[r][colIdx];
            if (val !== undefined && val !== null && val !== '') {
                const num = parseFloat(String(val).replace(',', '.'));
                if (!isNaN(num) && num > 0) {
                    scores.push(num);
                }
            }
        });

        // Absteigend sortieren
        scores.sort((a, b) => b - a);

        // Die 4 besten eintragen
        for (let i = 0; i < 4; i++) {
            const targetCol = targetCols[i];
            const pctCol = pctCols[i];
            if (scores[i] !== undefined && scores[i] > 0) {
                grid[r][targetCol] = scores[i];
                if (pctCol !== undefined) {
                    grid[r][pctCol] = Math.round(((scores[i] / maxPoints) * 100) * 100) / 100;
                }
            } else {
                grid[r][targetCol] = '';
                if (pctCol !== undefined) {
                    grid[r][pctCol] = '';
                }
            }
        }
    }
}
window.updateTopMannschaft = updateTopMannschaft;

/**
 * Ermittelt für jeden Schützen aus allen Auswärtigen Schiessen (ab Spalte 41/42)
 * die beiden prozentual besten Resultate und überträgt sie in Auswärtiges 1 & 2 (Spalten 14 & 15).
 */
function updateTopAuswaertige(grid) {
    if (!grid || grid.length < 6) return;
    const compRow = grid[2] || [];

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }

    const colAusw1 = hasStatusCol ? 15 : 14;
    const colAusw2 = hasStatusCol ? 16 : 15;
    const colAusw1Pct = hasStatusCol ? 28 : 27;
    const colAusw2Pct = hasStatusCol ? 29 : 28;

    const startDynamic = hasStatusCol ? 42 : 41;
    const maxCols = compRow.length;

    // Checkboxen in Zeile 0 prüfen (wie im GAS Code statusRang1 & statusRang2)
    const isChecked1 = ['ja', 'j', 'x', '1', 'true', true, 'yes', '✓', '✔', '☑'].includes(
        typeof grid[0][colAusw1] === 'string' ? grid[0][colAusw1].trim().toLowerCase() : grid[0][colAusw1]
    );
    const isChecked2 = ['ja', 'j', 'x', '1', 'true', true, 'yes', '✓', '✔', '☑'].includes(
        typeof grid[0][colAusw2] === 'string' ? grid[0][colAusw2].trim().toLowerCase() : grid[0][colAusw2]
    );

    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;

        const results = [];
        for (let c = startDynamic; c < maxCols; c++) {
            const title = String(compRow[c] || '').trim();
            if (!title || title.toLowerCase().includes('%') || title.toLowerCase().startsWith('spalte')) continue;

            const rawVal = grid[r][c];
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                const pts = parseFloat(String(rawVal).replace(',', '.'));
                const maxVal = parseFloat(grid[3][c]) || 100;
                if (!isNaN(pts) && pts > 0 && maxVal > 0) {
                    const pct = (pts / maxVal) * 100;
                    results.push({ pts, pct, max: maxVal, col: c });
                }
            }
        }

        // Absteigend nach Prozent sortieren
        results.sort((a, b) => b.pct - a.pct);

        // Auswärtiges 1 (Bestes)
        if (isChecked1 && results.length > 0) {
            grid[r][colAusw1] = results[0].pts;
            grid[r][colAusw1Pct] = Math.round(results[0].pct * 100) / 100;
        } else {
            grid[r][colAusw1] = '';
            grid[r][colAusw1Pct] = '';
        }

        // Auswärtiges 2 (Zweitbestes)
        if (isChecked2 && results.length > 1) {
            grid[r][colAusw2] = results[1].pts;
            grid[r][colAusw2Pct] = Math.round(results[1].pct * 100) / 100;
        } else {
            grid[r][colAusw2] = '';
            grid[r][colAusw2Pct] = '';
        }
    }
}
window.updateTopAuswaertige = updateTopAuswaertige;

/**
 * Berechnet das gesamte Grid neu:
 * 1. Top 4 Mannschaft
 * 2. Top 1 & 2 Auswärtige
 * 3. Prozentwerte aller aktiven Wettkämpfe
 * 4. Gesamttotal in %
 * 5. Dynamisches Maximum (Anzahl aktive Checkboxen * 100 %)
 */
function recalculateJMRawGrid(grid) {
    if (!grid || grid.length < 6) return 1000;

    // 1. Top 4 Mannschaft & Top 2 Auswärtige aktualisieren
    updateTopMannschaft(grid);
    updateTopAuswaertige(grid);

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }

    const colTotal = hasStatusCol ? 19 : 18;
    const colStreich = hasStatusCol ? 32 : 31;
    const firstCompCol = hasStatusCol ? 7 : 6;
    const colAusw1 = hasStatusCol ? 15 : 14;
    const colAusw2 = hasStatusCol ? 16 : 15;

    // 2. Aktive Checkboxen ermitteln
    let activeCount = 0;
    const activeCompCols = [];

    for (let c = firstCompCol; c < colTotal; c++) {
        const title = String(grid[2][c] || '').trim();
        if (!title || title.toLowerCase() === 'leer') continue;

        const checkVal = grid[0][c];
        const isChecked = ['ja', 'j', 'x', '1', 'true', true, 'yes', '✓', '✔', '☑'].includes(
            typeof checkVal === 'string' ? checkVal.trim().toLowerCase() : checkVal
        );
        if (isChecked) {
            activeCount++;
            activeCompCols.push(c);
        }
    }

    const maxPercent = activeCount * 100;
    // Row 3 Total Max anpassen
    grid[3][colTotal] = `MAX. = ${maxPercent} %`;

    // 3. Für jeden Schützen Einzelprozente & Total neu berechnen
    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;

        let shooterTotalPct = 0;

        activeCompCols.forEach(compCol => {
            const compTitle = String(grid[2][compCol] || '').trim();
            const pctCol = grid[2].findIndex((t, idx) => idx > colTotal && String(t || '').trim().toLowerCase() === (compTitle.toLowerCase() + ' %'));

            let pctVal = 0;

            // Sonderfall: Auswärtiges 1 & 2 haben keinen festen Max-Wert in Zeile 3,
            // der Prozentwert wurde bereits durch updateTopAuswaertige berechnet!
            const isAuswSlot = (compCol === colAusw1 || compCol === colAusw2);
            if (isAuswSlot) {
                if (pctCol !== -1 && grid[r][pctCol] !== undefined && grid[r][pctCol] !== '') {
                    pctVal = parseFloat(String(grid[r][pctCol]).replace(',', '.')) || 0;
                }
            } else {
                const ptsRaw = grid[r][compCol];
                const maxPts = parseFloat(grid[3][compCol]) || 100;

                if (ptsRaw !== undefined && ptsRaw !== null && ptsRaw !== '') {
                    const pts = parseFloat(String(ptsRaw).replace(',', '.')) || 0;
                    if (pts > 0 && maxPts > 0) {
                        pctVal = (pts / maxPts) * 100;
                        if (pctCol !== -1) {
                            grid[r][pctCol] = Math.round(pctVal * 100) / 100;
                        }
                    } else if (pctCol !== -1) {
                        grid[r][pctCol] = 0;
                    }
                } else if (pctCol !== -1 && grid[r][pctCol] !== undefined && grid[r][pctCol] !== '') {
                    pctVal = parseFloat(String(grid[r][pctCol]).replace(',', '.')) || 0;
                }
            }

            shooterTotalPct += pctVal;
        });

        const streich = parseFloat(String(grid[r][colStreich] || '0').replace(',', '.')) || 0;
        const finalTotal = Math.max(0, shooterTotalPct - streich);
        grid[r][colTotal] = Math.round(finalTotal * 100) / 100;
    }

    return maxPercent;
}
window.recalculateJMRawGrid = recalculateJMRawGrid;
