document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
});

// Global state to store raw results for detailed lookups
let rawGM = [];
let rawGC = [];
let rawMannschaft = [];

// === SWR CACHING HELPER ===
// Zeigt gecachte Daten sofort an (keine Ladezeit!) und aktualisiert im Hintergrund
async function fetchWithSWRCache(url, cacheKey, onSuccess, onError) {
    let hasRenderedCache = false;
    try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.data) {
                onSuccess(parsed.data, true);
                hasRenderedCache = true;
            }
        }
    } catch (e) {
        console.warn('Cache-Lesefehler:', e);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("HTTP Fehler " + response.status);
        const data = await response.json();
        
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: data
            }));
        } catch (e) {
            // QuotaExceeded oder private browsing
        }
        
        onSuccess(data, false);
    } catch (err) {
        if (!hasRenderedCache) {
            onError(err);
        } else {
            console.info('Hintergrund-Update fehlgeschlagen, gecachte Daten bleiben aktiv:', err.message);
        }
    }
}

function initDashboard() {
    const selectElement = document.getElementById('jahr-select');
    if (!selectElement) return;

    const startYear = 2025;
    const currentYear = new Date().getFullYear();

    // 1. Populate Dropdown dynamically
    let defaultOption = document.createElement('option');
    defaultOption.value = "aktuell";
    defaultOption.textContent = `Aktuelle Saison (${currentYear})`;
    selectElement.appendChild(defaultOption);

    for (let y = currentYear - 1; y >= startYear; y--) {
        let archiveOption = document.createElement('option');
        archiveOption.value = y.toString();
        archiveOption.textContent = `Saison ${y}`;
        selectElement.appendChild(archiveOption);
    }

    // 2. Tab switching logic mit voller ARIA-Barrierefreiheit
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            const tabId = btn.getAttribute('data-tab');
            const targetContent = document.getElementById(tabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Update helper text depending on tab
            const subtitleEl = document.getElementById('info-subtitle');
            if (tabId === 'tab-jm') {
                subtitleEl.textContent = "Tippe auf einen Schützen für detaillierte Jahresresultate.";
            } else if (tabId === 'tab-gruppe') {
                subtitleEl.textContent = "Tippe auf ein Rundenresultat für Einzelschützen-Details.";
            } else if (tabId === 'tab-mannschaft') {
                subtitleEl.textContent = "Tippe auf ein Rundenresultat für detaillierte Mannschafts-Einzelwerte.";
            }
        });
    });

    // 3. Load initial data when year changes or on load
    selectElement.addEventListener('change', () => {
        loadAllData(selectElement.value);
    });

    // Initial load
    loadAllData("aktuell");
}

function loadAllData(selectedYear) {
    // Show spinner inside all tbody tables only if no cache exists
    const spinners = `<tr class="no-hover"><td colspan="8"><div class="results-loading"><div class="spinner"></div>Daten werden geladen...</div></td></tr>`;
    document.getElementById('tbody-liga1').innerHTML = spinners;
    document.getElementById('tbody-liga2').innerHTML = spinners;
    document.getElementById('tbody-gm').innerHTML = spinners;
    document.getElementById('tbody-gc').innerHTML = spinners;
    document.getElementById('tbody-mannschaft').innerHTML = spinners;

    const mobileContainer = document.getElementById('mobile-mannschaft-container');
    if (mobileContainer) {
        mobileContainer.innerHTML = '<div class="results-loading p-4 text-center"><div class="spinner"></div>Lade Mannschaftsdaten...</div>';
    }

    // Load JM data (Maps "aktuell" to "current" for this API)
    const jmYear = selectedYear === "aktuell" ? "current" : selectedYear;
    loadJahresmeisterschaft(jmYear);

    // Load Group & Grenzland & Mannschaft
    const groupYear = selectedYear === "aktuell" ? "aktuell" : selectedYear;
    loadGruppeGrenzland(groupYear);
    loadMannschaft(groupYear);
}

// === TAB 1: JAHRESMEISTERSCHAFT ===
async function loadJahresmeisterschaft(yearParam) {
    const API_URL = `https://jahresmeisterschaft-muhen.dan-hunziker73.workers.dev?jahr=${yearParam}`;
    const fmt = v => isFinite(v) ? Number(v).toFixed(2) : "0.00";
    const arr = v => Array.isArray(v) ? v : [];
    const cacheKey = `res_cache_jm_${yearParam}`;

    fetchWithSWRCache(
        API_URL,
        cacheKey,
        (data) => {
            renderLiga(1, data.liga1, 'tbody-liga1', fmt, arr);
            renderLiga(2, data.liga2, 'tbody-liga2', fmt, arr);
        },
        (err) => {
            console.error("Fehler beim Laden der Jahresmeisterschaft:", err);
            const errorRow = `<tr><td colspan="3"><div class="results-error-msg">Jahresmeisterschaft konnte nicht geladen werden.</div></td></tr>`;
            document.getElementById('tbody-liga1').innerHTML = errorRow;
            document.getElementById('tbody-liga2').innerHTML = errorRow;
        }
    );
}

function renderLiga(ligaNr, listData, tbodyId, fmt, arr) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!listData || listData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted" style="padding:2rem;">Keine Ranglistendaten für diese Saison vorhanden.</td></tr>`;
        return;
    }

    let html = "";
    arr(listData).forEach((t, i) => {
        const detailRowId = `detail-jm-${tbodyId}-${i}`;
        
        let rowClass = "clickable-row";
        let statusLabel = "";
        
        if (ligaNr === 1 && i >= listData.length - 2) {
            rowClass += " down-status";
            statusLabel = '<span class="status-lbl down">Abstieg</span>';
        } else if (ligaNr === 2 && i < 2) {
            rowClass += " up-status";
            statusLabel = '<span class="status-lbl up">Aufstieg</span>';
        }

        html += `
            <tr class="${rowClass}" 
                tabindex="0" 
                role="button" 
                aria-expanded="false" 
                aria-controls="${detailRowId}" 
                aria-label="Rang ${t.rang || i+1}: ${t.name || '-'}, Total ${fmt(t.total)} Punkte. Klicke für Details."
                onclick="window.toggleRow('${detailRowId}', this)"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.toggleRow('${detailRowId}', this);}">
                <td class="col-rang"><b>${t.rang || "-"}</b>${statusLabel}</td>
                <td class="col-name">${t.name || "-"}</td>
                <td class="col-total"><b>${fmt(t.total)}</b></td>
            </tr>
            <tr id="${detailRowId}" class="detail-row" role="region" aria-label="Detailresultate ${t.name}">
                <td colspan="3">
                    <div class="detail-container">
                        <div class="detail-grid-3">
                            <!-- Meisterschaft -->
                            <div class="detail-box">
                                <h4><span>Meisterschaft</span><span>Pkt (%)</span></h4>
                                <ul class="detail-list">
        `;

        let used = false;
        const streich = Number(t.streichresultat_prz) || 0;
        
        arr(t.schiessen).forEach(s => {
            const p = Number(s.prozent);
            const isStreich = !used && streich > 0 && Math.abs(p - streich) < 0.0001;
            if (isStreich) used = true;
            
            html += `
                <li class="${isStreich ? 'is-streich' : ''}">
                    <span>${s.name}</span>
                    <span><b>${s.punkte}</b> (${fmt(p)}%)</span>
                </li>
            `;
        });

        html += `
                                </ul>
                            </div>
                            <!-- Mannschaft -->
                            <div class="detail-box">
                                <h4><span>Mannschaft</span><span>Pkt</span></h4>
                                <ul class="detail-list">
        `;

        arr(t.mannschaft).forEach((m, j) => {
            html += `
                <li>
                    <span>Runde ${j + 1}</span>
                    <span><b>${m.punkte || "-"}</b></span>
                </li>
            `;
        });

        html += `
                                </ul>
                            </div>
                            <!-- Auswärts -->
                            <div class="detail-box">
                                <h4><span>Auswärts</span><span>Pkt</span></h4>
                                <ul class="detail-list">
        `;

        const au = arr(t.auswaerts);
        if (au.length > 0) {
            au.forEach(a => {
                html += `
                    <li>
                        <span>${a.name}</span>
                        <span><b>${a.punkte}</b></span>
                    </li>
                `;
            });
        } else {
            html += `<li class="text-center text-muted" style="border:none; padding-top: 1rem;">Keine Resultate</li>`;
        }

        html += `
                                </ul>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

window.toggleRow = (detailRowId, triggerEl) => {
    const el = document.getElementById(detailRowId);
    if (!el) return;
    const isVisible = el.style.display === "table-row";
    
    // Close other open detail rows
    document.querySelectorAll('.detail-row').forEach(row => {
        if (row.id.startsWith('detail-jm-')) {
            row.style.display = 'none';
        }
    });
    document.querySelectorAll('.table-results tr[aria-expanded="true"]').forEach(tr => {
        if (tr.getAttribute('aria-controls') && tr.getAttribute('aria-controls').startsWith('detail-jm-')) {
            tr.setAttribute('aria-expanded', 'false');
        }
    });
    
    el.style.display = isVisible ? "none" : "table-row";
    if (triggerEl) {
        triggerEl.setAttribute('aria-expanded', isVisible ? "false" : "true");
    }
};

// === TAB 2: GRUPPE & GRENZLAND ===
async function loadGruppeGrenzland(yearParam) {
    const WORKER_URL = "https://gruppe.dan-hunziker73.workers.dev";
    const cacheKeyGM = `res_cache_gm_${yearParam}`;
    const cacheKeyGC = `res_cache_gc_${yearParam}`;

    fetchWithSWRCache(
        `${WORKER_URL}?type=gruppe&jahr=${yearParam}`,
        cacheKeyGM,
        (data) => {
            rawGM = data;
            buildGroupTable("gm", rawGM, "tbody-gm");
        },
        (err) => {
            console.error("Fehler beim Laden von GM:", err);
            document.getElementById('tbody-gm').innerHTML = `<tr><td colspan="4"><div class="results-error-msg">Gruppendaten konnten nicht geladen werden.</div></td></tr>`;
        }
    );

    fetchWithSWRCache(
        `${WORKER_URL}?type=grenzland&jahr=${yearParam}`,
        cacheKeyGC,
        (data) => {
            rawGC = data;
            buildGroupTable("gc", rawGC, "tbody-gc");
        },
        (err) => {
            console.error("Fehler beim Laden von GC:", err);
            document.getElementById('tbody-gc').innerHTML = `<tr><td colspan="4"><div class="results-error-msg">Grenzlanddaten konnten nicht geladen werden.</div></td></tr>`;
        }
    );
}

function buildGroupTable(type, data, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:2rem;">Keine Gruppen-Resultate in dieser Saison.</td></tr>`;
        return;
    }

    const teams = [...new Set(data.flatMap(r => [r.r1Team, r.r2Team, r.r3Team]).filter(Boolean))].sort();
    let html = "";

    teams.forEach((team, tIdx) => {
        const detailRowId = `detail-row-${type}-${tIdx}`;
        html += `<tr><td class="col-name" style="padding-left:12px;">${team}</td>`;
        
        for (let r = 1; r <= 3; r++) {
            const teamRows = data.filter(p => p[`r${r}Team`] === team);
            const sum = teamRows.reduce((a, b) => a + (type === "gm" ? (b[`r${r}P1`] + b[`r${r}P2`]) : b[`r${r}Pkt`]), 0);
            const avg = teamRows.length > 0 ? sum / teamRows.length : 0;
            const hmClass = getHMClass(avg, type);

            html += `
                <td class="cell-round ${hmClass}" 
                    tabindex="0" 
                    role="button"
                    aria-label="${type === 'gm' ? 'Gruppe' : 'Grenzland'} ${team}, Runde ${r}: ${sum || 'noch nicht geschossen'}. Klicken für Details."
                    onclick="window.toggleGroupDetail('${type}', '${team.replace(/'/g,"\\'")}', ${r}, ${tIdx})"
                    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.toggleGroupDetail('${type}', '${team.replace(/'/g,"\\'")}', ${r}, ${tIdx});}">
                    <b>${sum || "–"}</b>
                </td>
            `;
        }
        
        html += `</tr>
        <tr id="${detailRowId}" class="detail-row" role="region" aria-label="Details für ${team}">
            <td colspan="4">
                <div id="detail-container-${type}-${tIdx}" class="detail-container" style="display:none;"></div>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

window.toggleGroupDetail = (type, team, round, tIdx) => {
    const detailRowId = `detail-row-${type}-${tIdx}`;
    const detailContainerId = `detail-container-${type}-${tIdx}`;
    
    const detailRow = document.getElementById(detailRowId);
    const detailContainer = document.getElementById(detailContainerId);
    if (!detailRow || !detailContainer) return;

    const isCurrentlyOpen = detailRow.style.display === 'table-row' && detailContainer.getAttribute('data-active-round') === round.toString();
    
    // Close other group details
    document.querySelectorAll('.detail-row').forEach(row => {
        if (row.id.startsWith(`detail-row-${type}-`)) {
            row.style.display = 'none';
        }
    });

    if (isCurrentlyOpen) {
        detailRow.style.display = 'none';
        return;
    }

    const data = type === "gm" ? rawGM : rawGC;
    const teamRows = data.filter(p => p[`r${round}Team`] === team);
    if (teamRows.length === 0) return;

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--glass-border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
            <h4 style="margin: 0; color: var(--primary-color);">${team} &ndash; Runde ${round} Details</h4>
            <button type="button" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; cursor:pointer;" onclick="document.getElementById('${detailRowId}').style.display='none'">Schliessen &times;</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    `;

    let total = 0;
    teamRows.forEach(p => {
        if (type === "gm") {
            const p1 = p[`r${round}P1`];
            const p2 = p[`r${round}P2`];
            const sub = p1 + p2;
            total += sub;
            const avg = sub / 2;
            const hm = getHMClass(avg, "gm", p.stellung);
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.5rem; border-bottom: 1px dashed rgba(15, 58, 93, 0.05);">
                    <span>${p.name} <small class="text-muted" style="margin-left: 5px;">(${p.stellung})</small></span>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span class="text-muted" style="font-size: 0.85rem;">${p1} / ${p2}</span>
                        <span class="stellung-badge ${hm}" style="font-weight: 800; font-size: 0.9rem;">${sub}</span>
                    </div>
                </div>
            `;
        } else {
            const pkt = p[`r${round}Pkt`];
            total += pkt;
            const hm = getHMClass(pkt, "gc", p.stellung);
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.5rem; border-bottom: 1px dashed rgba(15, 58, 93, 0.05);">
                    <span>${p.name} <small class="text-muted" style="margin-left: 5px;">(${p.stellung})</small></span>
                    <span class="stellung-badge ${hm}" style="font-weight: 800; font-size: 0.9rem;">${pkt}</span>
                </div>
            `;
        }
    });

    html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.5rem; font-weight: 800; color: var(--primary-color); border-top: 2px solid var(--primary-color); margin-top: 0.5rem;">
            <span>Gesamt:</span>
            <span style="font-size: 1.1rem;">${total}</span>
        </div>
        </div>
    `;

    detailContainer.innerHTML = html;
    detailContainer.setAttribute('data-active-round', round.toString());
    detailRow.style.display = 'table-row';
    detailContainer.style.display = 'block';
};

// === TAB 3: MANNSCHAFT ===
async function loadMannschaft(yearParam) {
    const WORKER_URL = "https://gruppe.dan-hunziker73.workers.dev";
    const tbody = document.getElementById('tbody-mannschaft');
    if (!tbody) return;

    const cacheKeyMS = `res_cache_ms_${yearParam}`;

    fetchWithSWRCache(
        `${WORKER_URL}?type=mannschaft&jahr=${yearParam}`,
        cacheKeyMS,
        (data) => {
            rawMannschaft = data;

            if (!rawMannschaft || rawMannschaft.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:2rem;">Keine Mannschafts-Resultate in dieser Saison.</td></tr>`;
                const mobCont = document.getElementById('mobile-mannschaft-container');
                if (mobCont) mobCont.innerHTML = `<p class="text-center text-muted p-4">Keine Mannschafts-Resultate in dieser Saison.</p>`;
                return;
            }

            const teams = [...new Set(rawMannschaft.flatMap(r => {
                let t = [];
                for (let i = 1; i <= 7; i++) if (r[`r${i}Team`]) t.push(r[`r${i}Team`]);
                return t;
            }))].sort();

            // 1. Desktop Table rendern
            let html = "";
            teams.forEach((team, tIdx) => {
                const detailRowId = `detail-row-ms-${tIdx}`;
                html += `<tr><td class="col-name" style="padding-left:15px; width:30%;">${team}</td>`;
                
                for (let r = 1; r <= 7; r++) {
                    const teamData = rawMannschaft.filter(p => p[`r${r}Team`] === team && p[`r${r}Pkt`] > 0);
                    const sum = teamData.reduce((a, b) => a + b[`r${r}Pkt`], 0);
                    const avg = teamData.length > 0 ? sum / teamData.length : 0;
                    const hmClass = getHeatmapClass(avg);

                    html += `
                        <td class="cell-round ${hmClass}" 
                            tabindex="0" 
                            role="button"
                            aria-label="Mannschaft ${team}, Runde ${r}: ${sum || 'noch nicht geschossen'}. Klicken für Details."
                            onclick="window.toggleMannschaftDetail('${team.replace(/'/g,"\\'")}', ${r}, '${tIdx}')"
                            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.toggleMannschaftDetail('${team.replace(/'/g,"\\'")}', ${r}, '${tIdx}');}">
                            <b>${sum || "–"}</b>
                        </td>
                    `;
                }

                html += `</tr>
                <tr id="${detailRowId}" class="detail-row" role="region" aria-label="Details für ${team}">
                    <td colspan="8">
                        <div id="detail-container-ms-${tIdx}" class="detail-container" style="display:none;"></div>
                    </td>
                </tr>`;
            });

            tbody.innerHTML = html;

            // 2. Adaptive Mobile Cards rendern (Kein horizontales Scrollen mehr!)
            buildMobileMannschaftCards(teams, rawMannschaft);
        },
        (err) => {
            console.error("Fehler beim Laden der Mannschaftsdaten:", err);
            tbody.innerHTML = `<tr><td colspan="8"><div class="results-error-msg">Mannschaftsdaten konnten nicht geladen werden.</div></td></tr>`;
            const mobCont = document.getElementById('mobile-mannschaft-container');
            if (mobCont) mobCont.innerHTML = `<div class="results-error-msg p-3">Mannschaftsdaten konnten nicht geladen werden.</div>`;
        }
    );
}

// Adaptive Mobile Card Generator
function buildMobileMannschaftCards(teams, data) {
    const mobileContainer = document.getElementById('mobile-mannschaft-container');
    if (!mobileContainer) return;

    if (!teams || teams.length === 0) {
        mobileContainer.innerHTML = '<p class="text-center text-muted p-3">Keine Resultate vorhanden.</p>';
        return;
    }

    let html = "";
    teams.forEach((team, tIdx) => {
        let grandTotal = 0;
        let roundChipsHtml = "";

        for (let r = 1; r <= 7; r++) {
            const teamData = data.filter(p => p[`r${r}Team`] === team && p[`r${r}Pkt`] > 0);
            const sum = teamData.reduce((a, b) => a + b[`r${r}Pkt`], 0);
            grandTotal += sum;
            const avg = teamData.length > 0 ? sum / teamData.length : 0;
            const hmClass = getHeatmapClass(avg);

            roundChipsHtml += `
                <button type="button" 
                        class="mobile-round-chip ${hmClass}" 
                        aria-label="Runde ${r}: ${sum || 'noch nicht geschossen'}. Details anzeigen"
                        onclick="window.toggleMannschaftDetail('${team.replace(/'/g,"\\'")}', ${r}, 'mob-${tIdx}')">
                    <span class="chip-rnd">R${r}</span>
                    <span class="chip-val">${sum || '–'}</span>
                </button>
            `;
        }

        const detailRowId = `detail-row-ms-mob-${tIdx}`;

        html += `
            <div class="glass-card mobile-team-card">
                <div class="team-card-header">
                    <div class="team-card-title">
                        <span style="font-size: 1.2rem;">🎯</span>
                        <h4>${team}</h4>
                    </div>
                    <span class="team-total-badge">Total: <b>${grandTotal > 0 ? grandTotal : '–'}</b> Pkt</span>
                </div>
                <div class="team-rounds-grid">
                    ${roundChipsHtml}
                </div>
                <div id="${detailRowId}" class="detail-row mobile-detail-row" style="display:none; margin-top:12px;">
                    <div id="detail-container-ms-mob-${tIdx}" class="detail-container" style="display:none;"></div>
                </div>
            </div>
        `;
    });

    mobileContainer.innerHTML = html;
}

window.toggleMannschaftDetail = (team, round, tIdx) => {
    const detailRowId = `detail-row-ms-${tIdx}`;
    const detailContainerId = `detail-container-ms-${tIdx}`;
    
    const detailRow = document.getElementById(detailRowId);
    const detailContainer = document.getElementById(detailContainerId);
    if (!detailRow || !detailContainer) return;

    const isCurrentlyOpen = (detailRow.style.display === 'table-row' || detailRow.style.display === 'block') && 
                            detailContainer.getAttribute('data-active-round') === round.toString();
    
    // Close other team details
    document.querySelectorAll('.detail-row').forEach(row => {
        if (row.id.startsWith('detail-row-ms-')) {
            row.style.display = 'none';
        }
    });

    if (isCurrentlyOpen) {
        detailRow.style.display = 'none';
        return;
    }

    const list = rawMannschaft.filter(p => p[`r${round}Team`] === team && p[`r${round}Pkt`] > 0);
    if (list.length === 0) return;

    let total = 0;
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--glass-border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
            <h4 style="margin: 0; color: var(--primary-color); font-size:1.1rem;">${team} &ndash; Runde ${round}</h4>
            <button type="button" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; cursor:pointer;" onclick="document.getElementById('${detailRowId}').style.display='none'">Schliessen &times;</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    `;

    list.forEach(p => {
        const val = p[`r${round}Pkt`];
        total += val;
        const hm = getHeatmapClass(val);
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.5rem; border-bottom: 1px dashed rgba(15, 58, 93, 0.05);">
                <span style="font-weight: 600;">${p.name}</span>
                <span class="stellung-badge ${hm}" style="font-weight: 800; font-size: 0.9rem;">${val}</span>
            </div>
        `;
    });

    html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.5rem; font-weight: 800; color: var(--primary-color); border-top: 2px solid var(--primary-color); margin-top: 0.5rem;">
            <span>Gesamt:</span>
            <span style="font-size: 1.1rem;">${total}</span>
        </div>
        </div>
    `;

    detailContainer.innerHTML = html;
    detailContainer.setAttribute('data-active-round', round.toString());
    
    // Check if mobile or desktop
    const isMobile = String(tIdx).startsWith('mob-');
    detailRow.style.display = isMobile ? 'block' : 'table-row';
    detailContainer.style.display = 'block';
};

// === CORE UTILITIES ===

function getHMClass(val, type, stellung = "") {
    if (!val || val === 0) return "";
    let bonus = stellung.toLowerCase().includes("kniend") ? 3 : 0;
    if (type === "gm") {
        if (val + bonus >= 196) return "hm-top";
        if (val + bonus >= 191) return "hm-high";
        if (val + bonus >= 186) return "hm-mid";
    } else {
        if (val >= 98) return "hm-top";
        if (val >= 96) return "hm-high";
        if (val >= 94) return "hm-mid";
    }
    return "hm-low";
}

function getHeatmapClass(val) {
    if (!val || val === 0) return "";
    if (val >= 197) return "hm-top";
    if (val >= 191) return "hm-high";
    if (val >= 185) return "hm-mid";
    return "hm-low";
}

function getTrend(curr, prev) {
    if (!prev || prev === 0 || !curr || curr === 0) return "";
    if (curr > prev) return '<span class="trend-ind up" title="Verbesserung gegenüber Vorrunde">▲</span>';
    if (curr < prev) return '<span class="trend-ind down" title="Verschlechterung gegenüber Vorrunde">▼</span>';
    return '<span class="trend-ind steady" title="Konstante Leistung">▶</span>';
}
