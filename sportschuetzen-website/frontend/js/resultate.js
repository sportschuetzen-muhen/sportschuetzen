(() => {
    'use strict';

    document.addEventListener("DOMContentLoaded", () => {
        initDashboard();
    });

    // Global state to store raw results for detailed lookups
    let rawGM = [];
    let rawGC = [];
    let rawMannschaft = [];

    const SUPABASE_REST_URL = window.SUPABASE_REST_URL || "https://supabase-muhen.danfamily.uk/rest/v1";
    const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

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
        const headers = url.includes('supabase') ? {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        } : {};
        const response = await fetch(url, { headers });
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

    const currentYear = new Date().getFullYear();

    // 1. Initial Populate mit Standardoptionen
    selectElement.innerHTML = `
        <option value="aktuell">Aktuelle Saison (${currentYear})</option>
        <option value="2025">Saison 2025</option>
        <option value="2023">Saison 2023</option>
    `;

    // 2. Verfügbare Saisons dynamisch aus Supabase nachladen
    loadAvailableSeasons(selectElement);

    // 3. Tab switching logic mit voller ARIA-Barrierefreiheit
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
            } else if (tabId === 'tab-endschiessen') {
                subtitleEl.textContent = "Offizielle Ranglisten des Endschiessens (Saisonabschluss Kleinkaliber 50m).";
            }
        });
    });

    // 4. Load initial data when year changes or on load
    selectElement.addEventListener('change', () => {
        loadAllData(selectElement.value);
    });

    // 5. URL-Hash / Parameter Support (z. B. #endschiessen oder ?tab=endschiessen)
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, '');
    const tabParam = urlParams.get('tab') || (hash === 'endschiessen' ? 'tab-endschiessen' : hash);
    if (tabParam) {
        const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabParam}"]`) || 
                          document.querySelector(`.tab-btn[data-tab="tab-${tabParam}"]`);
        if (targetBtn) targetBtn.click();
    }

    // Initial load
    loadAllData("aktuell");
}

async function loadAvailableSeasons(selectElement) {
    const cacheKey = "res_cache_available_seasons";
    fetchWithSWRCache(
        `${SUPABASE_REST_URL}/jm_seasons?select=jahr,title,is_archived&order=jahr.desc`,
        cacheKey,
        async (seasons) => {
            const currentVal = selectElement.value || "aktuell";
            const currentYear = new Date().getFullYear();

            const yearsSet = new Set();
            if (Array.isArray(seasons)) {
                seasons.filter(s => s.jahr !== 'current').forEach(s => yearsSet.add(s.jahr));
            }

            // Auch Jahre aus contest_results nachladen
            try {
                const res = await fetch(`${SUPABASE_REST_URL}/contest_results?select=year`, {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    }
                });
                if (res.ok) {
                    const cYears = await res.json();
                    if (Array.isArray(cYears)) {
                        cYears.forEach(item => {
                            if (item.year && item.year < currentYear) {
                                yearsSet.add(String(item.year));
                            }
                        });
                    }
                }
            } catch (e) {
                // Silently fallback to jm_seasons
            }

            // Auch Jahre aus endschiessen_seasons nachladen
            try {
                const resEnd = await fetch(`${SUPABASE_REST_URL}/endschiessen_seasons?is_published=eq.true&select=jahr`, {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    }
                });
                if (resEnd.ok) {
                    const eYears = await resEnd.json();
                    if (Array.isArray(eYears)) {
                        eYears.forEach(item => {
                            if (item.jahr && item.jahr !== 'current') {
                                yearsSet.add(String(item.jahr));
                            }
                        });
                    }
                }
            } catch (e) {
                // Ignore
            }

            const archivedYears = Array.from(yearsSet)
                .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

            selectElement.innerHTML = '';
            
            const curOpt = document.createElement('option');
            curOpt.value = 'aktuell';
            curOpt.textContent = `Aktuelle Saison (${currentYear})`;
            selectElement.appendChild(curOpt);

            archivedYears.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = `Saison ${y}`;
                selectElement.appendChild(opt);
            });

            if ([...selectElement.options].some(o => o.value === currentVal)) {
                selectElement.value = currentVal;
            }
        },
        (err) => {
            console.warn("Konnte verfügbare Saisons nicht aus Supabase laden:", err);
        }
    );
}

function loadAllData(selectedYear) {
    // Show spinner inside all tbody tables only if no cache exists
    const spinners = `<tr class="no-hover"><td colspan="8"><div class="results-loading"><div class="spinner"></div>Daten werden geladen...</div></td></tr>`;
    document.getElementById('tbody-liga1').innerHTML = spinners;
    document.getElementById('tbody-liga2').innerHTML = spinners;
    const u21Spin = document.getElementById('tbody-u21');
    if (u21Spin) u21Spin.innerHTML = spinners;
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

    // Load Group & Grenzland & Mannschaft & Endschiessen
    const groupYear = selectedYear === "aktuell" ? "aktuell" : selectedYear;
    loadGruppeGrenzland(groupYear);
    loadMannschaft(groupYear);
    loadEndschiessen(selectedYear);
}

// === TAB 1: JAHRESMEISTERSCHAFT ===
async function loadJahresmeisterschaft(yearParam) {
    const jmYear = (yearParam === "aktuell" || yearParam === "current") ? "current" : yearParam;
    const API_URL = `${SUPABASE_REST_URL}/jm_shooters?jahr=eq.${encodeURIComponent(jmYear)}&order=liga.asc,rang.asc`;
    const fmt = v => isFinite(v) ? Number(v).toFixed(2) : "0.00";
    const arr = v => Array.isArray(v) ? v : [];
    const cacheKey = `res_cache_jm_${yearParam}`;

    fetchWithSWRCache(
        API_URL,
        cacheKey,
        (data) => {
            let liga1 = [];
            let liga2 = [];
            let junioren = [];
            if (data && (data.liga1 || data.liga2)) {
                liga1 = data.liga1 || [];
                liga2 = data.liga2 || [];
                junioren = data.junioren || [];
            } else if (Array.isArray(data)) {
                const parsedList = data.map(s => ({
                    ...s,
                    schiessen: s.details?.schiessen || [],
                    mannschaft: s.details?.mannschaft || [],
                    auswaerts: s.details?.auswaerts || []
                }));
                liga1 = parsedList
                    .filter(s => Number(s.liga) === 1)
                    .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
                    .map((s, idx) => ({ ...s, rang: idx + 1, status: idx >= 6 ? 'abstieg' : 'neutral' }));

                liga2 = parsedList
                    .filter(s => Number(s.liga) === 2)
                    .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
                    .map((s, idx) => ({ ...s, rang: idx + 1, status: idx < 2 ? 'aufstieg' : 'neutral' }));

                junioren = parsedList
                    .filter(s => s.is_junior)
                    .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
                    .map((s, idx) => ({ ...s, rang: idx + 1, status: 'neutral' }));
            }
            const allShooters = [...liga1, ...liga2];
            const maxPercent = allShooters[0]?.details?.max_total_prz || 900;

            renderLiga(1, liga1, 'tbody-liga1', fmt, arr);
            renderLiga(2, liga2, 'tbody-liga2', fmt, arr);
            renderLiga("u21", junioren, 'tbody-u21', fmt, arr);

            // Spaltenkopf mit dynamischem Maximum aktualisieren
            document.querySelectorAll('#table-liga1 .col-total, #table-liga2 .col-total, #table-u21 .col-total').forEach(el => {
                if (el.tagName.toLowerCase() === 'th') {
                    el.innerHTML = `Total <span class="max-badge" style="font-size:0.75rem; font-weight:normal; opacity:0.85;">(max. ${maxPercent}%)</span>`;
                }
            });
        },
        (err) => {
            console.error("Fehler beim Laden der Jahresmeisterschaft:", err);
            const errorRow = `<tr><td colspan="3"><div class="results-error-msg">Jahresmeisterschaft konnte nicht geladen werden.</div></td></tr>`;
            document.getElementById('tbody-liga1').innerHTML = errorRow;
            document.getElementById('tbody-liga2').innerHTML = errorRow;
            const u21Tbody = document.getElementById('tbody-u21');
            if (u21Tbody) u21Tbody.innerHTML = errorRow;
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
        
        if (t.status === 'abstieg' || (ligaNr === 1 && i >= listData.length - 2)) {
            rowClass += " down-status";
            statusLabel = '<span class="status-lbl down">Abstieg</span>';
        } else if (t.status === 'aufstieg' || (ligaNr === 2 && i < 2)) {
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
    const cacheKeyGM = `res_cache_gm_${yearParam}`;
    const cacheKeyGC = `res_cache_gc_${yearParam}`;
    const currentYear = new Date().getFullYear();
    const yearFilter = (yearParam === "aktuell" || yearParam === "current") ? currentYear : parseInt(yearParam, 10);

    fetchWithSWRCache(
        `${SUPABASE_REST_URL}/contest_results?contest_type=eq.gruppe&year=eq.${yearFilter}&order=name.asc`,
        cacheKeyGM,
        (data) => {
            rawGM = (Array.isArray(data) ? data : []).map(r => ({
                name: r.name,
                stellung: r.stellung || 'liegend',
                r1Team: r.r1_team || '',
                r1P1: r.r1_p1 || 0,
                r1P2: r.r1_p2 || 0,
                r2Team: r.r2_team || '',
                r2P1: r.r2_p1 || 0,
                r2P2: r.r2_p2 || 0,
                r3Team: r.r3_team || '',
                r3P1: r.r3_p1 || 0,
                r3P2: r.r3_p2 || 0
            }));
            rawGM.sort((a, b) => {
                const stA = (a.stellung || 'liegend').toLowerCase();
                const stB = (b.stellung || 'liegend').toLowerCase();
                if (stA !== stB) return stA === 'liegend' ? -1 : 1;
                return (a.name || '').localeCompare(b.name || '', 'de');
            });
            buildGroupTable("gm", rawGM, "tbody-gm");
        },
        (err) => {
            console.error("Fehler beim Laden von GM:", err);
            document.getElementById('tbody-gm').innerHTML = `<tr><td colspan="4"><div class="results-error-msg">Gruppendaten konnten nicht geladen werden.</div></td></tr>`;
        }
    );

    fetchWithSWRCache(
        `${SUPABASE_REST_URL}/contest_results?contest_type=eq.grenzland&year=eq.${yearFilter}&order=name.asc`,
        cacheKeyGC,
        (data) => {
            rawGC = (Array.isArray(data) ? data : []).map(r => ({
                name: r.name,
                stellung: r.stellung || 'liegend',
                r1Team: r.r1_team || '',
                r1Pkt: r.r1_p1 || 0,
                r2Team: r.r2_team || '',
                r2Pkt: r.r2_p1 || 0,
                r3Team: r.r3_team || '',
                r3Pkt: r.r3_p1 || 0
            }));
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

    if (type === "gm") {
        teamRows.sort((a, b) => {
            const stA = (a.stellung || 'liegend').toLowerCase();
            const stB = (b.stellung || 'liegend').toLowerCase();
            if (stA !== stB) {
                return stA === 'liegend' ? -1 : 1;
            }
            return (a.name || '').localeCompare(b.name || '', 'de');
        });
    }

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
    const tbody = document.getElementById('tbody-mannschaft');
    if (!tbody) return;

    const cacheKeyMS = `res_cache_ms_${yearParam}`;
    const currentYear = new Date().getFullYear();
    const yearFilter = (yearParam === "aktuell" || yearParam === "current") ? currentYear : parseInt(yearParam, 10);

    fetchWithSWRCache(
        `${SUPABASE_REST_URL}/contest_results?contest_type=eq.mannschaft&year=eq.${yearFilter}&order=name.asc`,
        cacheKeyMS,
        (data) => {
            rawMannschaft = (Array.isArray(data) ? data : []).map(r => ({
                name: r.name,
                r1Team: r.r1_team || '',
                r1Pkt: r.r1_p1 || 0,
                r2Team: r.r2_team || '',
                r2Pkt: r.r2_p1 || 0,
                r3Team: r.r3_team || '',
                r3Pkt: r.r3_p1 || 0,
                r4Team: r.r4_team || '',
                r4Pkt: r.r4_p1 || 0,
                r5Team: r.r5_team || '',
                r5Pkt: r.r5_p1 || 0,
                r6Team: r.r6_team || '',
                r6Pkt: r.r6_p1 || 0,
                r7Team: r.r7_team || '',
                r7Pkt: r.r7_p1 || 0
            }));

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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// === TAB 4: ENDSCHIESSEN (SAISONABSCHLUSS KK 50M) ===
async function loadEndschiessen(selectedYear) {
    const loadingEl = document.getElementById('endschiessen-loading-state');
    const contentEl = document.getElementById('endschiessen-content-container');
    const emptyEl = document.getElementById('endschiessen-empty-state');
    const tbodyEndstich = document.getElementById('tbody-endschiessen-endstich');
    const tbodyFinal = document.getElementById('tbody-endschiessen-final');
    const finalCard = document.getElementById('endschiessen-final-card');
    const otherContainer = document.getElementById('endschiessen-other-stiche-container');

    if (!contentEl) return;

    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
        let targetYear = selectedYear;
        let seasonObj = null;

        // 1. Saison ermitteln (dynamisch die neueste freigegebene Saison bei "aktuell" oder leer)
        if (selectedYear === "aktuell" || !selectedYear) {
            try {
                const resLatest = await fetch(`${SUPABASE_REST_URL}/endschiessen_seasons?is_published=eq.true&order=jahr.desc&limit=1`, {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    }
                });
                if (resLatest.ok) {
                    const latestList = await resLatest.json();
                    if (Array.isArray(latestList) && latestList.length > 0) {
                        seasonObj = latestList[0];
                        targetYear = seasonObj.jahr;
                    }
                }
            } catch (e) {
                console.warn("Fehler beim Abrufen der neuesten Endschiessen-Saison:", e);
            }
            if (!seasonObj) {
                targetYear = new Date().getFullYear().toString();
            }
        }

        // Falls noch nicht geladen: gezielte Saison abrufen
        if (!seasonObj) {
            const resSeason = await fetch(`${SUPABASE_REST_URL}/endschiessen_seasons?jahr=eq.${encodeURIComponent(targetYear)}&is_published=eq.true&select=*`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            if (resSeason.ok) {
                const seasons = await resSeason.json();
                if (Array.isArray(seasons) && seasons.length > 0) {
                    seasonObj = seasons[0];
                }
            }
        }

        if (!seasonObj) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) {
                emptyEl.style.display = 'block';
                const emptyTitle = emptyEl.querySelector('h3');
                const emptyText = emptyEl.querySelector('p');
                if (emptyTitle) emptyTitle.textContent = `Endschiessen ${targetYear || ''} noch nicht freigegeben`;
                if (emptyText) emptyText.textContent = 'Die Resultate für dieses Jahr sind noch nicht öffentlich freigegeben oder das Schiessen hat noch nicht stattgefunden.';
            }
            return;
        }

        // 2. Stiche laden
        const resStiche = await fetch(`${SUPABASE_REST_URL}/endschiessen_stiche?jahr=eq.${encodeURIComponent(targetYear)}&is_active=eq.true&order=sort_order.asc&select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        const stiche = resStiche.ok ? await resStiche.json() : [];

        // 3. Scores laden inklusive Schützen-Stammdaten
        const resScores = await fetch(`${SUPABASE_REST_URL}/endschiessen_scores?jahr=eq.${encodeURIComponent(targetYear)}&select=*,member:members(first_name,last_name,birth_date)&order=rang_total.asc,total_decimal.desc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        const scores = resScores.ok ? await resScores.json() : [];

        // 4. Final-Serien laden
        const resFinal = await fetch(`${SUPABASE_REST_URL}/endschiessen_final_series?jahr=eq.${encodeURIComponent(targetYear)}&select=*,member:members(first_name,last_name)&order=final_rang.asc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        const finals = resFinal.ok ? await resFinal.json() : [];

        // Endstich herausfiltern
        const endstichDef = stiche.find(s => s.code === 'endstich') || stiche[0];
        const endstichScores = endstichDef ? scores.filter(s => s.stich_id === endstichDef.id) : [];

        // Endstich rendern
        if (tbodyEndstich) {
            if (endstichScores.length === 0) {
                tbodyEndstich.innerHTML = `<tr><td colspan="7" class="text-center py-4" style="color: var(--text-muted);">Noch keine Endstich-Resultate vorhanden.</td></tr>`;
            } else {
                tbodyEndstich.innerHTML = endstichScores.map((s, idx) => {
                    const name = s.member ? `${s.member.last_name} ${s.member.first_name}` : (s.guest_name || 'Unbekannt');
                    const jg = s.member?.birth_date ? ` (${new Date(s.member.birth_date).getFullYear()})` : '';
                    const rang = s.rang_total || (idx + 1);
                    const rankBadge = rang === 1 
                        ? `<span class="col-rang-badge col-rang-1">🥇 1</span>` 
                        : (rang === 2 
                            ? `<span class="col-rang-badge col-rang-2">🥈 2</span>` 
                            : (rang === 3 
                                ? `<span class="col-rang-badge col-rang-3">🥉 3</span>` 
                                : `<strong>${rang}</strong>`));
                    return `
                        <tr>
                            <td class="col-rang">${rankBadge}</td>
                            <td class="col-name">${escapeHtml(name)}<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-left: 4px;">${jg}</span></td>
                            <td style="text-align: center;">${s.passe_1_score || 0} <span style="font-size: 0.8rem; color: var(--text-muted);">(${Number(s.passe_1_decimal || 0).toFixed(1)})</span></td>
                            <td style="text-align: center;">${s.passe_2_score || 0} <span style="font-size: 0.8rem; color: var(--text-muted);">(${Number(s.passe_2_decimal || 0).toFixed(1)})</span></td>
                            <td class="col-total"><b>${s.total_score || 0}</b></td>
                            <td style="text-align: center; font-weight: 700; color: var(--primary-color);">${Number(s.total_decimal || 0).toFixed(1)}</td>
                            <td style="text-align: center; color: var(--text-muted); font-size: 0.85rem;">${s.rang_decimal || '-'}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Meister-Final rendern
        if (tbodyFinal && finalCard) {
            if (finals.length > 0) {
                finalCard.style.display = 'block';
                tbodyFinal.innerHTML = finals.map((f, idx) => {
                    const name = f.member ? `${f.member.last_name} ${f.member.first_name}` : `Schütze ${idx + 1}`;
                    const rang = f.final_rang || (idx + 1);
                    const rankBadge = rang === 1 
                        ? `<span class="col-rang-badge col-rang-1">🥇 1</span>` 
                        : (rang === 2 
                            ? `<span class="col-rang-badge col-rang-2">🥈 2</span>` 
                            : (rang === 3 
                                ? `<span class="col-rang-badge col-rang-3">🥉 3</span>` 
                                : `<strong>${rang}</strong>`));
                    const badge = rang === 1 
                        ? '<span class="col-rang-badge col-rang-1">🥇 Meister</span>' 
                        : (rang === 2 
                            ? '<span class="col-rang-badge col-rang-2">🥈 2. Rang</span>' 
                            : (rang === 3 
                                ? '<span class="col-rang-badge col-rang-3">🥉 3. Rang</span>' 
                                : '<span class="badge" style="background: rgba(15, 58, 93, 0.08); color: var(--primary-color); padding: 4px 8px; border-radius: 12px; font-size: 0.75rem;">Finalist</span>'));
                    return `
                        <tr>
                            <td class="col-rang">${rankBadge}</td>
                            <td class="col-name">${escapeHtml(name)}</td>
                            <td style="text-align: center;">${f.serie_1 || '-'}</td>
                            <td style="text-align: center;">${f.serie_2 || '-'}</td>
                            <td style="text-align: center;">${f.serie_3 || '-'}</td>
                            <td style="text-align: center;">${f.serie_4 || '-'}</td>
                            <td style="text-align: center;">${f.serie_5 || '-'}</td>
                            <td style="text-align: center;">${f.serie_6 || '-'}</td>
                            <td style="text-align: center;">${f.serie_7 || '-'}</td>
                            <td class="col-total"><b>${f.total_score || 0}</b></td>
                            <td style="text-align: center;">${badge}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                finalCard.style.display = 'none';
            }
        }

        // Weitere Stiche (Gaben, Differenzler etc.) rendern falls vorhanden
        if (otherContainer) {
            const otherStiche = stiche.filter(s => s.code !== 'endstich' && s.code !== 'final');
            if (otherStiche.length > 0) {
                otherContainer.innerHTML = otherStiche.map(st => {
                    const stScores = scores.filter(s => s.stich_id === st.id);
                    if (!stScores.length) return '';
                    return `
                        <div class="results-card" style="margin-bottom: 1.5rem;">
                            <h3>${escapeHtml(st.title)}</h3>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">${escapeHtml(st.description || '')}</p>
                            <div class="table-responsive">
                                <table class="table-results">
                                    <thead>
                                        <tr>
                                            <th scope="col" class="col-rang">Rang</th>
                                            <th scope="col" class="col-name">Schütze</th>
                                            ${st.modus === 'differenzler' ? '<th scope="col" style="text-align: center;">Ziel</th><th scope="col" style="text-align: center;">Ist</th><th scope="col" class="col-total">Diff</th>' : ''}
                                            ${st.modus === 'tiefschuss' ? '<th scope="col" class="col-total">Total</th><th scope="col" style="text-align: center;">Tiefschuss</th>' : ''}
                                            ${st.modus !== 'differenzler' && st.modus !== 'tiefschuss' ? '<th scope="col" class="col-total">Total</th>' : ''}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${stScores.map((s, sIdx) => {
                                            const sName = s.member ? `${s.member.last_name} ${s.member.first_name}` : (s.guest_name || 'Unbekannt');
                                            const sRang = s.rang_total || (sIdx + 1);
                                            const sRankBadge = sRang === 1 
                                                ? `<span class="col-rang-badge col-rang-1">🥇 1</span>` 
                                                : (sRang === 2 
                                                    ? `<span class="col-rang-badge col-rang-2">🥈 2</span>` 
                                                    : (sRang === 3 
                                                        ? `<span class="col-rang-badge col-rang-3">🥉 3</span>` 
                                                        : `<strong>${sRang}</strong>`));
                                            return `
                                                <tr>
                                                    <td class="col-rang">${sRankBadge}</td>
                                                    <td class="col-name">${escapeHtml(sName)}</td>
                                                    ${st.modus === 'differenzler' ? `<td style="text-align: center;">${s.target_score || '-'}</td><td style="text-align: center;">${s.total_score || '-'}</td><td class="col-total" style="color: #ef4444; font-weight: 800;">${s.diff_score !== null ? s.diff_score : '-'}</td>` : ''}
                                                    ${st.modus === 'tiefschuss' ? `<td class="col-total">${s.total_score || 0}</td><td style="text-align: center; color: var(--primary-color); font-weight: 700;">${s.tiefschuss || '-'}</td>` : ''}
                                                    ${st.modus !== 'differenzler' && st.modus !== 'tiefschuss' ? `<td class="col-total">${s.total_score || 0}</td>` : ''}
                                                </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                otherContainer.innerHTML = '';
            }
        }

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

    } catch (err) {
        console.warn("Fehler beim Laden des Endschiessens:", err);
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = "Fehler beim Laden der Endschiessen-Daten: " + err.message;
        }
    }
}

})();
