// === SUB-MODUL: JAHRESMEISTERSCHAFT - STANDBLATT INBOX ===
// Ermöglicht dem Schützenmeister die Prüfung und 1-Klick-Übernahme von via PWA eingereichten Standblättern

let _jmPendingStandblaetter = [];
let _jmArchivedStandblaetter = [];
let _jmInboxActive = false;

/**
 * Lädt alle eingereichten Standblätter aus contest_ocr_logs
 */
async function loadPendingStandblaetter(silent = false) {
    const sb = (typeof getJMSupabaseClient === 'function') ? getJMSupabaseClient() : (window.supabaseClient || null);
    if (!sb) return [];

    try {
        const { data, error } = await sb
            .from('contest_ocr_logs')
            .select('*')
            .eq('contest_type', 'standblatt')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const allItems = Array.isArray(data) ? data : [];
        _jmPendingStandblaetter = allItems.filter(item => {
            const resp = item.raw_response || {};
            return resp.status !== 'imported' && resp.status !== 'rejected';
        });

        _jmArchivedStandblaetter = allItems.filter(item => {
            const resp = item.raw_response || {};
            return resp.status === 'imported' || resp.status === 'rejected';
        });

        updateJMInboxBadge(_jmPendingStandblaetter.length);
        return _jmPendingStandblaetter;
    } catch (err) {
        if (!silent) console.warn("Konnte Standblätter-Inbox nicht laden:", err);
        return [];
    }
}
window.loadPendingStandblaetter = loadPendingStandblaetter;

/**
 * Aktualisiert die Benachrichtigungs-Badges synchron (Header, Sidebar & Dashboard-Kachel)
 */
function updateJMInboxBadge(count) {
    const badge = document.getElementById('jm-inbox-badge');
    const navBadge = document.getElementById('jm-nav-badge');
    const tileBadge = document.getElementById('jm-tile-badge');
    const tabBadge = document.getElementById('jm-tab-badge-pending');

    [badge, navBadge, tileBadge, tabBadge].forEach(el => {
        if (!el) return;
        if (count > 0) {
            el.innerText = count;
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });

    if (typeof window.updateMobileGlobalBadge === 'function') {
        window.updateMobileGlobalBadge();
    }
}
window.updateJMInboxBadge = updateJMInboxBadge;

/**
 * Öffnet das Standblatt-Inbox Modal
 */
async function openJMStandblattInboxModal() {
    const modalElem = document.getElementById('jm-standblatt-inbox-modal');
    if (!modalElem) return;

    const modal = new bootstrap.Modal(modalElem);
    modal.show();

    renderJMStandblattInboxLoading();
    await loadPendingStandblaetter();
    renderJMStandblattInboxTable();
}
window.openJMStandblattInboxModal = openJMStandblattInboxModal;

function renderJMStandblattInboxLoading() {
    const body = document.getElementById('jm-inbox-table-body');
    if (body) {
        body.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade eingereichte Standblätter...</td></tr>`;
    }
}

/**
 * Ermittelt das visuelle Status-Badge für ein Standblatt
 */
function renderJMStandblattStatusBadge(raw) {
    const ocr = raw.ocr_analysis;
    if (raw.status === 'imported') {
        return '<span class="badge bg-success-subtle text-success border border-success-subtle fw-semibold px-2 py-1"><i class="fas fa-check me-1"></i>Übernommen</span>';
    }
    if (raw.status === 'rejected') {
        return '<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-semibold px-2 py-1"><i class="fas fa-times me-1"></i>Abgelehnt</span>';
    }
    if (!ocr) {
        return '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle fw-semibold px-2 py-1"><i class="fas fa-clock me-1"></i>Ausstehend</span>';
    }

    const s = ocr.schuetze || {};
    const det = s.detectedShooter || s.detectedClubMember || {};
    const detVor = (det.vorname || '').toLowerCase().trim();
    const detNach = (det.nachname || '').toLowerCase().trim();
    const rawVor = (raw.vorname || '').toLowerCase().trim();
    const rawNach = (raw.nachname || '').toLowerCase().trim();
    const isMismatch = (s.nameStatus === 'MISMATCH') || ((detVor || detNach) && (detVor !== rawVor || detNach !== rawNach));

    if (isMismatch) {
        return '<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-semibold px-2 py-1" title="Erkannter Schütze weicht von der Meldung ab"><i class="fas fa-user-slash me-1"></i>Namensabweichung</span>';
    }
    if (ocr.verified === true) {
        return '<span class="badge bg-success-subtle text-success border border-success-subtle fw-semibold px-2 py-1"><i class="fas fa-check-circle me-1"></i>Verifiziert</span>';
    }
    if (ocr.anlass && ocr.anlass.status === 'NEW_COL') {
        return '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle fw-semibold px-2 py-1"><i class="fas fa-sparkles me-1"></i>Neuer Anlass</span>';
    }
    return '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fw-semibold px-2 py-1"><i class="fas fa-exclamation-triangle me-1"></i>Prüfung nötig</span>';
}

/**
 * Toggelt die Sichtbarkeit des Detail-Prüfberichts
 */
function jmTogglePrüfbericht(logId, forceOpen = false) {
    const detailRow = document.getElementById(`inbox-detail-${logId}`);
    const btn = document.getElementById(`btn-toggle-report-${logId}`);
    if (!detailRow) return;

    const isHidden = detailRow.classList.contains('d-none');
    if (forceOpen || isHidden) {
        detailRow.classList.remove('d-none');
        if (btn) {
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-outline-primary');
            btn.innerHTML = `<i class="fas fa-chevron-up me-1"></i>Prüfbericht verbergen`;
        }
    } else {
        detailRow.classList.add('d-none');
        if (btn) {
            btn.classList.remove('active', 'btn-primary');
            btn.classList.add('btn-outline-primary');
            btn.innerHTML = `<i class="fas fa-table-list me-1"></i>Prüfbericht`;
        }
    }
}
window.jmTogglePrüfbericht = jmTogglePrüfbericht;

/**
 * Rendert die Detailkarte des Prüfberichts (Gegenüberstellung Formular vs. OCR-Erkennung & Beweis-Text)
 */
function renderJMStandblattDetailRow(item, canWrite) {
    const raw = item.raw_response || {};
    const ocr = raw.ocr_analysis || null;
    const vorname = escapeHtml(raw.vorname || '');
    const nachname = escapeHtml(raw.nachname || '');
    const fullName = `${vorname} ${nachname}`.trim() || 'Unbekannt';
    const lizenz = escapeHtml(raw.lizenz ? String(raw.lizenz).padStart(6, '0') : '-');
    const jg = escapeHtml(raw.jahrgang ? String(raw.jahrgang) : '');
    const anlass = escapeHtml(raw.anlass || 'Auswärtiges Schiessen');
    const erzielt = parseFloat(raw.erzielt) || 0;
    const maximal = parseFloat(raw.maximal) || 100;
    const pct = maximal > 0 ? ((erzielt / maximal) * 100).toFixed(2) : '0.00';
    const fileUrl = raw.fileUrl || '';
    const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('de-CH') : '-';
    const modelUsed = ocr ? (ocr.modelUsed || ocr.source || 'KI') : 'Nicht analysiert';
    const snippet = ocr ? (ocr.snippet || ocr.raw_text || '') : '';

    const isVerified = ocr && ocr.verified === true;
    const isNewCol = ocr && ocr.anlass && ocr.anlass.status === 'NEW_COL';

    const s = ocr ? (ocr.schuetze || {}) : {};
    const detShooter = s.detectedShooter || s.detectedClubMember || {};
    const detName = `${detShooter.vorname || ''} ${detShooter.nachname || ''}`.trim();
    const detVor = (detShooter.vorname || '').toLowerCase().trim();
    const detNach = (detShooter.nachname || '').toLowerCase().trim();
    const rawVor = (raw.vorname || '').toLowerCase().trim();
    const rawNach = (raw.nachname || '').toLowerCase().trim();
    const isMismatch = (s.nameStatus === 'MISMATCH') || (detName && (detVor !== rawVor || detNach !== rawNach));

    let bannerHtml = '';
    if (isMismatch) {
        bannerHtml = `
            <div class="alert alert-danger d-flex align-items-center mb-3 py-2 px-3 border border-danger-subtle rounded-3">
                <i class="fas fa-user-slash fa-lg me-2 text-danger"></i>
                <div>
                    <strong>⚠️ Namensabweichung auf Beleg:</strong> Auf dem Standblatt steht <strong>«${escapeHtml(detName)}»</strong>${detShooter.lizenz ? ` (Lizenz: ${escapeHtml(detShooter.lizenz)})` : ''}.
                    Eingereicht wurde es unter <strong>«${fullName}»</strong> (Lizenz: ${lizenz}).
                    ${raw.submitted_by ? `<div class="small mt-1 text-muted"><i class="fas fa-share me-1"></i>Eingereicht durch: ${escapeHtml(raw.submitted_by.vorname || '')} ${escapeHtml(raw.submitted_by.nachname || '')} (Lizenz: ${escapeHtml(raw.submitted_by.lizenz || '')})</div>` : ''}
                </div>
            </div>
        `;
    } else if (isVerified) {
        bannerHtml = `
            <div class="alert alert-success d-flex align-items-center mb-3 py-2 px-3 border border-success-subtle rounded-3">
                <i class="fas fa-check-circle fa-lg me-2 text-success"></i>
                <div><strong>Resultat verifiziert:</strong> Schütze, Lizenz und Punkte stimmen mit dem Standblatt-Beleg überein.</div>
            </div>
        `;
    } else if (isNewCol) {
        bannerHtml = `
            <div class="alert alert-info d-flex align-items-center mb-3 py-2 px-3 border border-info-subtle rounded-3">
                <i class="fas fa-sparkles fa-lg me-2 text-info"></i>
                <div><strong>✨ Neuer Anlass:</strong> Die Spalte <em>«${escapeHtml(anlass)}»</em> existiert noch nicht und wird beim Übernehmen neu angelegt.</div>
            </div>
        `;
    } else if (ocr) {
        bannerHtml = `
            <div class="alert alert-warning d-flex align-items-center justify-content-between mb-3 py-2 px-3 border border-warning-subtle rounded-3 flex-wrap gap-2">
                <div class="d-flex align-items-center">
                    <i class="fas fa-exclamation-triangle fa-lg me-2 text-warning"></i>
                    <div><strong>⚠️ Manuelle Prüfung erforderlich:</strong> Die Angaben wurden noch nicht vollständig verifiziert. Bitte prüfe die Eingabe gegen das Originalfoto oder starte die KI-Erkennung.</div>
                </div>
                ${fileUrl && canWrite ? `
                    <button type="button" class="btn btn-sm btn-outline-warning text-dark border-warning rounded-pill px-3 py-1 btn-ocr-ondemand-${item.id}" onclick="jmRunOnDemandOcr('${item.id}')">
                        <i class="fas fa-magic me-1"></i>KI-Prüfbericht jetzt durchführen
                    </button>
                ` : ''}
            </div>
        `;
    } else {
        bannerHtml = `
            <div class="alert alert-secondary d-flex align-items-center justify-content-between mb-3 py-2 px-3 border rounded-3 flex-wrap gap-2">
                <div class="d-flex align-items-center">
                    <i class="fas fa-info-circle fa-lg me-2 text-secondary"></i>
                    <div>Dieses Standblatt besitzt noch keine automatische KI-Erkennung.</div>
                </div>
                ${fileUrl && canWrite ? `
                    <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 btn-ocr-ondemand-${item.id}" onclick="jmRunOnDemandOcr('${item.id}')">
                        <i class="fas fa-magic me-1"></i>KI-Prüfbericht jetzt durchführen
                    </button>
                ` : ''}
            </div>
        `;
    }

    // Schütze Vergleich
    let ocrShooterHtml = '<span class="text-muted small">Nicht analysiert</span>';
    if (ocr && ocr.schuetze) {
        const nameIcon = s.nameStatus === 'MATCH' ? '✔️' : (s.nameStatus === 'PARTIAL' ? '⚠️' : '❌');
        const lizIcon = s.lizenzStatus === 'MATCH' ? '✔️' : '❌';
        ocrShooterHtml = `
            <div>Status: <span class="fw-semibold">${nameIcon} ${s.nameStatus || 'UNBEKANNT'}</span></div>
            ${detName ? `<div>Beleg-Name: <strong class="${isMismatch ? 'text-danger' : 'text-success'}">${escapeHtml(detName)}</strong> ${detShooter.lizenz ? `(Lizenz: ${escapeHtml(detShooter.lizenz)})` : ''}</div>` : ''}
            <div>Lizenz-Status: <span class="fw-semibold">${lizIcon} ${s.lizenzStatus || 'UNBEKANNT'}</span></div>
            ${s.jgFound ? `<div>Jahrgang: <span class="fw-semibold">✔️ MATCH</span></div>` : ''}
        `;
    }

    // Anlass Vergleich
    let ocrAnlassHtml = '<span class="text-muted small">Nicht analysiert</span>';
    if (ocr && ocr.anlass) {
        const a = ocr.anlass;
        const aIcon = a.status === 'MATCH' ? '✔️' : (a.status === 'NEW_COL' ? '✨' : '⚠️');
        ocrAnlassHtml = `
            <div class="fw-semibold">${escapeHtml(a.erkannt || 'Auswärtiges Schiessen')}</div>
            <small class="text-muted">Status: ${aIcon} ${a.status === 'MATCH' ? 'In Tabelle gefunden' : (a.status === 'NEW_COL' ? 'Neue Spalte' : a.status)}</small>
        `;
    }

    // Punkte Vergleich
    let ocrPointsHtml = '<span class="text-muted small">Nicht analysiert</span>';
    if (ocr && ocr.ergebnis) {
        const e = ocr.ergebnis;
        const pVal = e.punkte !== null && e.punkte !== undefined ? e.punkte : '???';
        const maxVal = e.maximal ? ` / ${e.maximal} Pkt.` : '';
        const pStatus = e.status === 'MATCH' ? '✔️ MATCH' : (e.status === 'DISCREPANCY' ? '⚠️ ABWEICHUNG' : '❌ NOT_FOUND');
        ocrPointsHtml = `
            <span class="fs-6 fw-bold ${e.status === 'MATCH' ? 'text-success' : 'text-danger'}">${pVal}</span>${maxVal}
            <small class="text-muted ms-1">(${pStatus})</small>
        `;
    }

    return `
        <div class="p-3 bg-white border border-light-subtle rounded-3 shadow-xs">
            ${bannerHtml}
            <div class="card border border-light-subtle shadow-none rounded-3 overflow-hidden mb-3">
                <table class="table table-sm table-bordered align-middle mb-0 bg-white">
                    <thead class="table-light small text-uppercase text-muted">
                        <tr>
                            <th style="width: 22%;">Bereich</th>
                            <th style="width: 39%;">Formular-Eingabe</th>
                            <th style="width: 39%;">OCR-Erkennung (Foto)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="fw-semibold text-secondary">Schütze / Lizenz</td>
                            <td>
                                <div class="fw-bold text-dark">${fullName}</div>
                                <small class="text-muted">Lizenz: ${lizenz}${jg ? ` · Jg. ${jg}` : ''}</small>
                            </td>
                            <td>${ocrShooterHtml}</td>
                        </tr>
                        <tr>
                            <td class="fw-semibold text-secondary">Schiessanlass</td>
                            <td>
                                <div class="fw-semibold text-primary">${anlass}</div>
                            </td>
                            <td>${ocrAnlassHtml}</td>
                        </tr>
                        <tr class="table-light">
                            <td class="fw-semibold text-secondary">Totalpunkte & Maximum</td>
                            <td>
                                <span class="fs-6 fw-bold text-dark">${erzielt}</span> / ${maximal} Pkt.
                                <span class="badge bg-secondary ms-1">${pct}%</span>
                            </td>
                            <td>${ocrPointsHtml}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            ${snippet ? `
                <div class="p-2.5 bg-light border border-light-subtle rounded-3 mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong class="small text-muted text-uppercase"><i class="fas fa-file-alt me-1"></i>Beweis-Text aus OCR:</strong>
                        <span class="badge bg-white text-muted border small">${escapeHtml(modelUsed)}</span>
                    </div>
                    <code class="d-block p-2 bg-white border rounded text-dark small font-monospace" style="white-space: pre-wrap; max-height: 120px; overflow-y: auto;">${escapeHtml(snippet)}</code>
                </div>
            ` : ''}

            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-2 border-top">
                <div class="small text-muted">
                    <i class="fas fa-clock me-1"></i>Eingereicht: ${dateStr}
                    ${raw.fileName ? ` · Datei: <code>${escapeHtml(raw.fileName)}</code>` : ''}
                </div>
                <div class="d-flex gap-2 flex-wrap">
                    ${fileUrl && canWrite && !isVerified ? `
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 btn-ocr-ondemand-${item.id}" onclick="jmRunOnDemandOcr('${item.id}')">
                            <i class="fas fa-magic me-1"></i>KI-Prüfbericht durchführen
                        </button>
                    ` : ''}
                    ${fileUrl ? `
                        <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-3" onclick="jmViewStandblattPhoto('${escapeHtml(fileUrl)}', '${escapeHtml(fullName + ' - ' + anlass)}')">
                            <i class="fas fa-image me-1"></i>Standblatt-Original öffnen
                        </button>
                    ` : ''}
                    ${canWrite && raw.status !== 'imported' && raw.status !== 'rejected' ? `
                        <button type="button" class="btn btn-sm btn-success rounded-pill px-3 fw-semibold shadow-xs" onclick="jmImportStandblatt('${item.id}')">
                            <i class="fas fa-check me-1"></i>Resultat übernehmen
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-2.5" onclick="jmRejectStandblatt('${item.id}')">
                            <i class="fas fa-times me-1"></i>Ablehnen
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Führt für ein bestehendes Standblatt eine On-Demand-OCR durch
 */
async function jmRunOnDemandOcr(logId) {
    const item = (_jmPendingStandblaetter || []).find(i => i.id === logId) || (_jmArchivedStandblaetter || []).find(i => i.id === logId);
    if (!item) return;

    const raw = item.raw_response || {};
    const fileUrl = raw.fileUrl;
    if (!fileUrl) {
        showError("Kein Belegfoto für diesen Eintrag hinterlegt.");
        return;
    }

    const btns = document.querySelectorAll(`.btn-ocr-ondemand-${logId}, #btn-ocr-ondemand-${logId}`);
    btns.forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>KI analysiert...`;
    });

    try {
        const imgResp = await fetch(fileUrl);
        const blob = await imgResp.blob();
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const compList = (typeof _knownCompetitions !== 'undefined' && Array.isArray(_knownCompetitions)) ? _knownCompetitions : [];
        const ocrUrl = "https://v1-vorstand-api.dan-hunziker73.workers.dev/?module=resultate&action=ocr_standblatt";
        const res = await fetch(ocrUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                image: base64Data,
                user: {
                    vorname: raw.vorname || '',
                    nachname: raw.nachname || '',
                    lizenz: raw.lizenz || '',
                    jahrgang: raw.jahrgang || ''
                },
                known_competitions: compList,
                model: "gemini-3-flash-preview"
            })
        });

        const data = await res.json();
        if (!data || !data.success) {
            throw new Error(data?.error || "KI-Analyse lieferte kein Ergebnis.");
        }

        const rawText = data.raw_text || '';
        const detectedShooter = data.schuetze || {};
        const detectedContest = data.anlass || {};
        const detectedResult = data.ergebnis || {};

        const uVor = (raw.vorname || '').toLowerCase().trim();
        const uNach = (raw.nachname || '').toLowerCase().trim();
        const uLiz = raw.lizenz ? String(raw.lizenz).padStart(6, '0') : '';
        const textLower = (rawText + ' ' + JSON.stringify(detectedShooter)).toLowerCase();

        const nameFound = (uVor && textLower.includes(uVor)) && (uNach && textLower.includes(uNach));
        const lizenzFound = uLiz && uLiz !== '000000' && (textLower.includes(uLiz) || (detectedShooter.lizenz && detectedShooter.lizenz.includes(uLiz)));
        const jgFound = raw.jahrgang && textLower.includes(String(raw.jahrgang).trim());
        const pts = parseFloat(detectedResult.punkte);

        const nameStatus = nameFound ? "MATCH" : ((uVor && textLower.includes(uVor)) || (uNach && textLower.includes(uNach)) ? "PARTIAL" : "NOT_FOUND");
        const lizenzStatus = lizenzFound ? "MATCH" : "NOT_FOUND";
        const scoreStatus = (!isNaN(pts) && pts > 0) ? "MATCH" : "NOT_FOUND";

        const ocrAnalysis = {
            source: "gemini_vision",
            modelUsed: data.modelUsed || "gemini-3-flash-preview",
            schuetze: {
                formName: `${raw.vorname || ''} ${raw.nachname || ''}`.trim(),
                formLizenz: uLiz,
                formJahrgang: raw.jahrgang || '',
                detectedShooter: detectedShooter,
                nameFound: nameFound,
                nameStatus: nameStatus,
                lizenzFound: lizenzFound,
                lizenzStatus: lizenzStatus,
                jgFound: jgFound,
                jgStatus: jgFound ? "MATCH" : "NOT_FOUND"
            },
            anlass: {
                erkannt: detectedContest.matched_title || detectedContest.erkannt || raw.anlass,
                matchedTitle: detectedContest.matched_title || "",
                stich: detectedContest.stich || "",
                status: detectedContest.matched_title ? "MATCH" : "NEW_COL"
            },
            ergebnis: {
                punkte: !isNaN(pts) ? pts : null,
                maximal: parseFloat(detectedResult.maximal) || raw.maximal || 100,
                status: scoreStatus
            },
            raw_text: rawText,
            snippet: rawText ? (rawText.length > 500 ? rawText.substring(0, 500) + '...' : rawText) : "",
            verified: (nameStatus === "MATCH") && (lizenzStatus === "MATCH") && (scoreStatus === "MATCH")
        };

        const sb = (typeof getJMSupabaseClient === 'function') ? getJMSupabaseClient() : (window.supabaseClient || null);
        if (sb) {
            await sb.from('contest_ocr_logs').update({
                raw_response: {
                    ...raw,
                    ocr_analysis: ocrAnalysis
                }
            }).eq('id', logId);
        }

        item.raw_response.ocr_analysis = ocrAnalysis;
        renderJMStandblattInboxTable();
        renderJMStandblattArchiveTable();
        jmTogglePrüfbericht(logId, true);
        showSuccess("✨ KI-Prüfbericht erfolgreich erstellt und gespeichert!");

    } catch (err) {
        console.error("On-Demand OCR Fehler:", err);
        showError("Fehler bei der KI-Analyse: " + err.message);
        btns.forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-magic me-1"></i>KI-Prüfbericht jetzt durchführen`;
        });
    }
}
window.jmRunOnDemandOcr = jmRunOnDemandOcr;

/**
 * Rendert die Tabelle der ausstehenden Standblätter
 */
function renderJMStandblattInboxTable() {
    const body = document.getElementById('jm-inbox-table-body');
    const emptyAlert = document.getElementById('jm-inbox-empty-alert');
    const tableCard = document.getElementById('jm-inbox-table-card');
    if (!body) return;

    const items = _jmPendingStandblaetter || [];

    if (items.length === 0) {
        if (emptyAlert) emptyAlert.classList.remove('d-none');
        if (tableCard) tableCard.classList.add('d-none');
        return;
    }

    if (emptyAlert) emptyAlert.classList.add('d-none');
    if (tableCard) tableCard.classList.remove('d-none');

    const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('jahresmeisterschaft') : true;

    body.innerHTML = items.map((item, idx) => {
        const raw = item.raw_response || {};
        const vorname = escapeHtml(raw.vorname || '');
        const nachname = escapeHtml(raw.nachname || '');
        const fullName = `${vorname} ${nachname}`.trim() || 'Unbekannt';
        const lizenz = escapeHtml(raw.lizenz ? String(raw.lizenz).padStart(6, '0') : '-');
        const anlass = escapeHtml(raw.anlass || 'Auswärtiges Schiessen');
        const erzielt = parseFloat(raw.erzielt) || 0;
        const maximal = parseFloat(raw.maximal) || 100;
        const pct = maximal > 0 ? ((erzielt / maximal) * 100).toFixed(2) : '0.00';

        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('de-CH', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '-';

        const fileUrl = raw.fileUrl || '';
        let belegHtml = '<span class="text-muted small">Kein Beleg</span>';
        if (fileUrl) {
            belegHtml = `
                <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2.5 py-1" onclick="jmViewStandblattPhoto('${escapeHtml(fileUrl)}', '${escapeHtml(fullName + ' - ' + anlass)}')">
                    <i class="fas fa-image me-1"></i>Beleg
                </button>
            `;
        }

        const statusBadge = renderJMStandblattStatusBadge(raw);

        const ocr = raw.ocr_analysis || {};
        const s = ocr.schuetze || {};
        const detShooter = s.detectedShooter || s.detectedClubMember || {};
        const detName = `${detShooter.vorname || ''} ${detShooter.nachname || ''}`.trim();
        const detVor = (detShooter.vorname || '').toLowerCase().trim();
        const detNach = (detShooter.nachname || '').toLowerCase().trim();
        const rawVor = (raw.vorname || '').toLowerCase().trim();
        const rawNach = (raw.nachname || '').toLowerCase().trim();
        const isMismatch = (s.nameStatus === 'MISMATCH') || (detName && (detVor !== rawVor || detNach !== rawNach));

        let shooterExtraHtml = '';
        if (raw.submitted_by) {
            shooterExtraHtml += `<div class="small text-primary"><i class="fas fa-share me-1"></i>Via: ${escapeHtml(raw.submitted_by.vorname || '')} ${escapeHtml(raw.submitted_by.nachname || '')}</div>`;
        }
        if (isMismatch && detName) {
            shooterExtraHtml += `<div class="small text-danger fw-semibold"><i class="fas fa-exclamation-triangle me-1"></i>Beleg: ${escapeHtml(detName)}</div>`;
        }

        return `
            <tr id="inbox-row-${item.id}">
                <td class="small text-muted text-nowrap">${dateStr}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="fw-bold text-dark">${fullName}</div>
                    <div class="small text-muted">Lizenz: ${lizenz}${raw.jahrgang ? ` · Jg. ${escapeHtml(raw.jahrgang)}` : ''}</div>
                    ${shooterExtraHtml}
                </td>
                <td>
                    <div class="fw-semibold text-primary">${anlass}</div>
                </td>
                <td class="text-center">
                    <span class="badge bg-primary fs-6 px-2 py-1">${erzielt}</span>
                    <span class="text-muted small ms-1">/ ${maximal} Pkt (${pct}%)</span>
                </td>
                <td class="text-center">
                    <button type="button" id="btn-toggle-report-${item.id}" class="btn btn-sm btn-outline-primary rounded-pill px-2.5 py-1" onclick="jmTogglePrüfbericht('${item.id}')">
                        <i class="fas fa-table-list me-1"></i>Prüfbericht
                    </button>
                </td>
                <td class="text-center">${belegHtml}</td>
                <td class="text-end text-nowrap">
                    ${canWrite ? `
                        <button type="button" id="btn-import-${item.id}" class="btn btn-sm btn-success rounded-pill px-3 fw-semibold me-1 shadow-xs" onclick="jmImportStandblatt('${item.id}')">
                            <i class="fas fa-check me-1"></i>Übernehmen
                        </button>
                        <button type="button" id="btn-reject-${item.id}" class="btn btn-sm btn-outline-danger rounded-pill px-2" title="Ablehnen" onclick="jmRejectStandblatt('${item.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : '<span class="badge bg-secondary">Nur Ansicht</span>'}
                </td>
            </tr>
            <tr id="inbox-detail-${item.id}" class="d-none bg-light bg-opacity-25 border-bottom border-primary-subtle">
                <td colspan="8" class="p-3">
                    ${renderJMStandblattDetailRow(item, canWrite)}
                </td>
            </tr>
        `;
    }).join('');
}

let _jmCurrentInboxTab = 'pending';

/**
 * Wechselt zwischen 'pending' (Ausstehend) und 'archive' (Archiv/Historie)
 */
function switchJMInboxTab(tab) {
    _jmCurrentInboxTab = tab;
    if (tab === 'archive') {
        renderJMStandblattArchiveTable();
    } else {
        renderJMStandblattInboxTable();
    }
}
window.switchJMInboxTab = switchJMInboxTab;

/**
 * Rendert die historische Archiv-Tabelle (übernommene & abgelehnte Standblätter)
 */
function renderJMStandblattArchiveTable() {
    const body = document.getElementById('jm-archive-table-body');
    const emptyAlert = document.getElementById('jm-archive-empty-alert');
    const tableCard = document.getElementById('jm-archive-table-card');
    const countInfo = document.getElementById('jm-archive-count-info');
    const yearSelect = document.getElementById('jm-archive-year-select');
    if (!body) return;

    const selectedYear = yearSelect ? yearSelect.value : 'all';
    const items = (_jmArchivedStandblaetter || []).filter(item => {
        if (selectedYear === 'all') return true;
        const d = item.created_at ? new Date(item.created_at) : null;
        return d && String(d.getFullYear()) === selectedYear;
    });

    if (countInfo) {
        countInfo.innerText = `${items.length} archivierte Standblätter ${selectedYear !== 'all' ? '(' + selectedYear + ')' : ''}`;
    }

    if (items.length === 0) {
        if (emptyAlert) emptyAlert.classList.remove('d-none');
        if (tableCard) tableCard.classList.add('d-none');
        body.innerHTML = '';
        return;
    }

    if (emptyAlert) emptyAlert.classList.add('d-none');
    if (tableCard) tableCard.classList.remove('d-none');

    body.innerHTML = items.map(item => {
        const raw = item.raw_response || {};
        const vorname = escapeHtml(raw.vorname || '');
        const nachname = escapeHtml(raw.nachname || '');
        const fullName = `${vorname} ${nachname}`.trim() || 'Unbekannt';
        const lizenz = escapeHtml(raw.lizenz ? String(raw.lizenz).padStart(6, '0') : '-');
        const anlass = escapeHtml(raw.anlass || 'Auswärtiges Schiessen');
        const erzielt = parseFloat(raw.erzielt) || 0;
        const maximal = parseFloat(raw.maximal) || 100;
        const pct = maximal > 0 ? ((erzielt / maximal) * 100).toFixed(2) : '0.00';

        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('de-CH', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '-';

        const fileUrl = raw.fileUrl || '';
        let belegHtml = '<span class="text-muted small">Kein Beleg</span>';
        if (fileUrl) {
            belegHtml = `
                <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2.5 py-1" onclick="jmViewStandblattPhoto('${escapeHtml(fileUrl)}', '${escapeHtml(fullName + ' - ' + anlass)}')">
                    <i class="fas fa-image me-1"></i>Beleg
                </button>
            `;
        }

        const statusBadge = renderJMStandblattStatusBadge(raw);

        return `
            <tr>
                <td class="small text-muted text-nowrap">${dateStr}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="fw-bold text-dark">${fullName}</div>
                    <div class="small text-muted">Lizenz: ${lizenz}</div>
                </td>
                <td>
                    <div class="fw-semibold text-primary">${anlass}</div>
                </td>
                <td class="text-center">
                    <span class="badge bg-secondary fs-6 px-2 py-1">${erzielt}</span>
                    <span class="text-muted small ms-1">/ ${maximal} Pkt (${pct}%)</span>
                </td>
                <td class="text-center">
                    <button type="button" id="btn-toggle-report-${item.id}" class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1" onclick="jmTogglePrüfbericht('${item.id}')">
                        <i class="fas fa-table-list me-1"></i>Prüfbericht
                    </button>
                </td>
                <td class="text-center">${belegHtml}</td>
            </tr>
            <tr id="inbox-detail-${item.id}" class="d-none bg-light bg-opacity-25 border-bottom">
                <td colspan="7" class="p-3">
                    ${renderJMStandblattDetailRow(item, false)}
                </td>
            </tr>
        `;
    }).join('');
}
window.renderJMStandblattArchiveTable = renderJMStandblattArchiveTable;

/**
 * Zeigt das Foto des Standblatts in voller Grösse an
 */
function jmViewStandblattPhoto(url, title) {
    if (!url) return;
    const modalElem = document.getElementById('jm-standblatt-photo-modal');
    const imgElem = document.getElementById('jm-standblatt-photo-img');
    const titleElem = document.getElementById('jm-standblatt-photo-title');

    if (imgElem) imgElem.src = url;
    if (titleElem) titleElem.innerText = title || 'Standblatt Belegfoto';

    if (modalElem) {
        const modal = new bootstrap.Modal(modalElem);
        modal.show();
    }
}
window.jmViewStandblattPhoto = jmViewStandblattPhoto;

/**
 * Übernimmt ein eingereichtes Standblatt direkt in jmRawGrid und Supabase
 */
async function jmImportStandblatt(logId) {
    const item = _jmPendingStandblaetter.find(i => i.id === logId);
    if (!item) {
        showError("Standblatt-Eintrag nicht gefunden.");
        return;
    }

    const raw = item.raw_response || {};
    const vorname = String(raw.vorname || '').trim();
    const nachname = String(raw.nachname || '').trim();
    const lizenz = raw.lizenz ? String(raw.lizenz).padStart(6, '0') : '';
    const anlass = String(raw.anlass || 'Auswärtiges Schiessen').trim();
    const erzielt = parseFloat(raw.erzielt) || 0;
    const maximal = parseFloat(raw.maximal) || 100;

    const ocr = raw.ocr_analysis || {};
    const s = ocr.schuetze || {};
    const detShooter = s.detectedShooter || s.detectedClubMember || {};
    const detName = `${detShooter.vorname || ''} ${detShooter.nachname || ''}`.trim();
    const detVor = (detShooter.vorname || '').toLowerCase().trim();
    const detNach = (detShooter.nachname || '').toLowerCase().trim();
    const rawVor = vorname.toLowerCase();
    const rawNach = nachname.toLowerCase();
    const isMismatch = (s.nameStatus === 'MISMATCH') || (detName && (detVor !== rawVor || detNach !== rawNach));

    let finalVorname = vorname;
    let finalNachname = nachname;
    let finalLizenz = lizenz;

    if (isMismatch && detName) {
        const choice = confirm(
            `⚠️ ACHTUNG: Namensabweichung erkannt!\n\n` +
            `Auf dem Standblatt steht: "${detName}" (Lizenz: ${detShooter.lizenz || '-'})\n` +
            `Eingereicht wurde es unter: "${vorname} ${nachname}" (Lizenz: ${lizenz})\n\n` +
            `Möchtest du das Resultat (${erzielt} / ${maximal} Pkt) für den Beleg-Schützen "${detName}" übernehmen?\n\n` +
            `[OK] = Für Beleg-Schütze "${detName}" übernehmen\n` +
            `[Abbrechen] = Weiter zur Bestätigung für "${vorname} ${nachname}" oder Abbruch`
        );
        if (choice) {
            finalVorname = detShooter.vorname || '';
            finalNachname = detShooter.nachname || '';
            let rawDetLiz = String(detShooter.lizenz || '').trim();
            if (/^10\d{8}$/.test(rawDetLiz)) rawDetLiz = rawDetLiz.substring(2, 8);
            finalLizenz = rawDetLiz ? rawDetLiz.padStart(6, '0') : '';
        } else {
            const confirmOrig = confirm(
                `Soll das Resultat wirklich für "${vorname} ${nachname}" übernommen werden?\n\n` +
                `[OK] = Ja, für "${vorname} ${nachname}" eintragen\n` +
                `[Abbrechen] = Nicht übernehmen (Vorgang abbrechen)`
            );
            if (!confirmOrig) return;
        }
    } else {
        if (!confirm(`Möchtest du das Standblatt für "${vorname} ${nachname}" (${erzielt} / ${maximal} Pkt beim "${anlass}") in die Jahresmeisterschaft übernehmen?`)) {
            return;
        }
    }

    const grid = jmRawGrid;
    if (!grid || grid.length < 6) {
        showError("Keine Jahresmeisterschafts-Daten geladen. Bitte lade die Seite neu.");
        return;
    }

    const sb = (typeof getJMSupabaseClient === 'function') ? getJMSupabaseClient() : (window.supabaseClient || null);
    if (!sb) {
        showError("Supabase-Client nicht verfügbar.");
        return;
    }

    const importBtn = document.getElementById(`btn-import-${logId}`);
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Übernehme...`;
    }

    try {
        const headerRow = grid[4] || [];
        const colNachname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'nachname');
        const colVorname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'vorname');
        const colLizenz = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('lizenz'));

        // 1. Schützenzeile im Grid suchen
        let targetRowIndex = -1;
        for (let r = 5; r < grid.length; r++) {
            if (!grid[r] || r === 13 || r === 14) continue;
            const rowLiz = String(grid[r][colLizenz] || '').trim().padStart(6, '0');
            const rowNach = String(grid[r][colNachname] || '').trim().toLowerCase();
            const rowVor = String(grid[r][colVorname] || '').trim().toLowerCase();

            if (finalLizenz && rowLiz === finalLizenz) {
                targetRowIndex = r;
                break;
            }
            if (rowNach === finalNachname.toLowerCase() && rowVor === finalVorname.toLowerCase()) {
                targetRowIndex = r;
                break;
            }
        }

        if (targetRowIndex === -1) {
            throw new Error(`Schütze "${finalVorname} ${finalNachname}" (Lizenz: ${finalLizenz || '-'}) wurde in der Jahresmeisterschaft nicht gefunden.`);
        }

        // 2. Passende Spalte suchen oder neue Spalte anlegen (ab Spalte 41 bzw. 42)
        const hasStatusCol = headerRow.some(val => String(val || '').trim().toLowerCase() === 'status');
        const startDynamic = hasStatusCol ? 42 : 41;
        const compRow = grid[2] || [];
        const maxRow = grid[3] || [];

        let targetCol = -1;

        // Prio 1: Gleicher Anlassname (exakt oder intelligenter Fuzzy-Match)
        const cleanAnlass = anlass.toLowerCase().replace(/[^a-z0-9äöü]/gi, '');
        for (let c = startDynamic; c < compRow.length; c++) {
            const title = String(compRow[c] || '').trim();
            const cleanTitle = title.toLowerCase().replace(/[^a-z0-9äöü]/gi, '');
            if (!cleanTitle || cleanTitle.startsWith('spalte')) continue;

            if (title.toLowerCase() === anlass.toLowerCase() ||
                cleanTitle === cleanAnlass ||
                (cleanAnlass.length >= 5 && cleanTitle.includes(cleanAnlass)) ||
                (cleanTitle.length >= 5 && cleanAnlass.includes(cleanTitle))) {
                targetCol = c;
                break;
            }
        }

        // Prio 2: Neue Spalte anlegen
        if (targetCol === -1) {
            for (let c = startDynamic; c < compRow.length; c++) {
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
            grid[2][targetCol] = anlass;
            grid[3][targetCol] = maximal;

            for (let r = 5; r < grid.length; r++) {
                if (grid[r] && grid[r][targetCol] === undefined) {
                    grid[r][targetCol] = '';
                }
            }
        } else {
            // Maximum aktualisieren falls abweichend
            grid[3][targetCol] = maximal;
        }

        // 3. Punktezahl in jmRawGrid eintragen
        grid[targetRowIndex][targetCol] = erzielt;

        // 4. Gesamtes Grid inklusive Top 4 SMM, Top 2 Auswärtige, Rangierung & Totals neu berechnen
        if (typeof recalculateJMRawGrid === 'function') {
            recalculateJMRawGrid(grid);
        }

        // 5. In public.jm_seasons speichern
        const juniorList = (typeof jmJuniorExclusions !== 'undefined')
            ? Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true)
            : [];

        const { error: errSeason } = await sb
            .from('jm_seasons')
            .upsert({
                jahr: jmCurrentJahr || 'current',
                raw_grid: grid,
                junior_exclusions: juniorList,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

        if (errSeason) throw errSeason;

        // 6. Strukturierte Ranglisten synchronisieren (public.jm_shooters)
        if (typeof syncJMShootersToSupabase === 'function') {
            await syncJMShootersToSupabase(sb, jmCurrentJahr || 'current', grid);
        }

        // 7. Status in contest_ocr_logs auf 'imported' setzen
        await sb
            .from('contest_ocr_logs')
            .update({
                raw_response: {
                    ...raw,
                    status: 'imported',
                    imported_at: new Date().toISOString(),
                    imported_for: {
                        vorname: finalVorname,
                        nachname: finalNachname,
                        lizenz: finalLizenz
                    }
                }
            })
            .eq('id', logId);

        // 8. Inbox & Archiv bereinigen & UI aktualisieren
        _jmPendingStandblaetter = _jmPendingStandblaetter.filter(i => i.id !== logId);
        _jmArchivedStandblaetter.unshift({
            ...item,
            raw_response: { 
                ...raw, 
                status: 'imported', 
                imported_at: new Date().toISOString(),
                imported_for: {
                    vorname: finalVorname,
                    nachname: finalNachname,
                    lizenz: finalLizenz
                }
            }
        });
        updateJMInboxBadge(_jmPendingStandblaetter.length);
        renderJMStandblattInboxTable();
        renderJMStandblattArchiveTable();

        if (typeof renderJahresmeisterschaft === 'function') {
            renderJahresmeisterschaft(grid);
        }

        showSuccess(`✅ Standblatt für ${finalVorname} ${finalNachname} (${erzielt} Pkt) erfolgreich in die Jahresmeisterschaft übernommen!`);

        // 9. Info-Mail an Schützen über erfolgreiche Übernahme & Kopie an Info_Mail_Standblatt_Upload
        try {
            let shooterEmail = '';
            if (finalLizenz) {
                const { data: mems } = await sb.from('members').select('primary_email').eq('person_number', finalLizenz);
                if (mems && mems.length > 0 && mems[0].primary_email) shooterEmail = mems[0].primary_email;
            }
            const perf = maximal > 0 ? ((erzielt / maximal) * 100).toFixed(1) : '100.0';
            const htmlBody = `
                <div style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width:620px; margin:0 auto; padding:24px; color:#1f2937; line-height:1.5;">
                    <div style="border-bottom:2px solid #2e7d32; padding-bottom:12px; margin-bottom:20px;">
                        <h2 style="color:#2e7d32; margin:0; font-size:20px;">Resultat freigegeben: Jahresmeisterschaft</h2>
                        <div style="font-size:13px; color:#6b7280; margin-top:4px;">Sportschützen Muhen</div>
                    </div>
                    <p style="font-size:15px;">Hallo <strong>${escapeHtml(finalVorname)}</strong>,</p>
                    <p>dein Standblatt für das <strong>${escapeHtml(anlass)}</strong> wurde soeben vom Schützenmeister geprüft und erfolgreich in die Jahresmeisterschaft übernommen.</p>
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px; margin:20px 0; text-align:center;">
                        <div style="font-size:26px; font-weight:bold; color:#15803d;">${erzielt} Punkte</div>
                        <div style="color:#4b5563; font-size:14px; margin-top:4px;">Max. ${maximal} Pkt · Leistung: <strong>${perf}%</strong></div>
                    </div>
                    <p style="font-size:14px;">
                        <a href="https://www.sportschuetzen-muhen.ch/resultate/aktuelles_Jahr/jahresmeisterschaft" style="color:#0284c7; font-weight:600; text-decoration:none;">
                            Zur Online-Rangliste der Jahresmeisterschaft →
                        </a>
                    </p>
                    <p style="font-size:13px; color:#6b7280; margin-top:24px; border-top:1px solid #e5e7eb; padding-top:16px;">
                        Guet Schuss!<br>
                        <strong>Sportschützen Muhen</strong>
                    </p>
                </div>
            `;
            fetch("https://supabase-muhen.danfamily.uk/functions/v1/send-email", {
                method: "POST",
                headers: {
                    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M",
                    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    to: shooterEmail || undefined,
                    ccSystemMailKey: "Info_Mail_Standblatt_Upload",
                    subject: `Jahresmeisterschaft: Resultat freigegeben – ${anlass} (${erzielt} Pkt)`,
                    html: htmlBody,
                    module: "jahresmeisterschaft",
                    recordId: logId
                })
            }).catch(e => console.warn("Mail-Versand nach Freigabe Warnung:", e));
        } catch (mailErr) {
            console.warn("Mail-Versand nach Freigabe fehlgeschlagen:", mailErr);
        }

    } catch (err) {
        console.error("Fehler beim Übernehmen des Standblatts:", err);
        showError("Fehler beim Übernehmen: " + err.message);
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = `<i class="fas fa-check me-1"></i>Übernehmen`;
        }
    }
}
window.jmImportStandblatt = jmImportStandblatt;

/**
 * Lehnt ein Standblatt ab
 */
async function jmRejectStandblatt(logId) {
    if (!confirm("Möchtest du dieses Standblatt wirklich ablehnen?")) {
        return;
    }

    const sb = (typeof getJMSupabaseClient === 'function') ? getJMSupabaseClient() : (window.supabaseClient || null);
    if (!sb) return;

    try {
        const item = _jmPendingStandblaetter.find(i => i.id === logId);
        const raw = item ? (item.raw_response || {}) : {};

        await sb
            .from('contest_ocr_logs')
            .update({
                raw_response: {
                    ...raw,
                    status: 'rejected',
                    rejected_at: new Date().toISOString()
                }
            })
            .eq('id', logId);

        _jmPendingStandblaetter = _jmPendingStandblaetter.filter(i => i.id !== logId);
        _jmArchivedStandblaetter.unshift({
            ...item,
            raw_response: { ...raw, status: 'rejected', rejected_at: new Date().toISOString() }
        });
        updateJMInboxBadge(_jmPendingStandblaetter.length);
        renderJMStandblattInboxTable();
        renderJMStandblattArchiveTable();
        showSuccess("Standblatt abgelehnt.");
    } catch (err) {
        showError("Fehler beim Ablehnen: " + err.message);
    }
}
window.jmRejectStandblatt = jmRejectStandblatt;

// Beim Start des Vorstands-Portals Badge initial prüfen
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        loadPendingStandblaetter(true);
    }, 1200);
});
