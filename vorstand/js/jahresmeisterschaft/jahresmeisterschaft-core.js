// === SUB-MODUL: JAHRESMEISTERSCHAFT - CORE ===
// Native Supabase Architecture mit Google Apps Script Fallback & Dual-Write

let jmRawGrid = [];
let jmCurrentJahr = "current";
let jmPendingUpdates = [];
let jmPendingMoves = [];
let jmJuniorExclusions = {};
let jmExclusionsChanged = false;
window._jmIsSupabase = false;

// Supabase Client Access
function getJMSupabaseClient() {
    if (typeof window.getSupabaseClient === 'function') {
        return window.getSupabaseClient();
    }
    return window.supabaseClient || null;
}
window.getJMSupabaseClient = getJMSupabaseClient;

// Live Badge Aktualisierung
function updateJMSupabaseBadge(isSupabase) {
    window._jmIsSupabase = Boolean(isSupabase);
    let badge = document.getElementById('jm-supabase-badge');
    if (!badge) {
        const headerTitle = document.querySelector('#view-jahresmeisterschaft h2');
        if (headerTitle) {
            badge = document.createElement('span');
            badge.id = 'jm-supabase-badge';
            headerTitle.parentNode.insertBefore(badge, headerTitle.nextSibling);
        }
    }
    if (badge) {
        if (isSupabase) {
            badge.className = 'badge bg-success-subtle text-success border border-success-subtle px-2 py-1 ms-2';
            badge.innerHTML = '<i class="fas fa-database me-1"></i>Supabase Live';
            badge.title = 'Daten werden mit Sub-Sekunden-Geschwindigkeit direkt aus Supabase PostgreSQL geladen.';
        } else {
            badge.className = 'badge bg-warning-subtle text-warning border border-warning-subtle px-2 py-1 ms-2';
            badge.innerHTML = '<i class="fas fa-cloud me-1"></i>GAS Fallback';
            badge.title = 'Daten werden über das Google Apps Script Backend geladen.';
        }
    }
}
window.updateJMSupabaseBadge = updateJMSupabaseBadge;

// Zentrale Laderoutine
async function loadJahresmeisterschaftData(force = false, silent = false) {
    const historySelect = document.getElementById('jm-history-select');
    if (historySelect && historySelect.value) {
        jmCurrentJahr = historySelect.value;
    }

    if (!force && jmRawGrid.length > 0 && historySelect && historySelect.dataset.loadedYear === jmCurrentJahr) {
        console.log("⚡ loadJahresmeisterschaftData: Lade aus lokalem Cache...");
        return;
    }

    // Dropdown sperren während des Ladens
    if (historySelect) {
        historySelect.disabled = true;
    }

    if (!silent) {
        showLoadingOverlay('Lade Jahresmeisterschaft...');
    }

    // --- 1. SUPABASE-FIRST LADEN ---
    const sb = getJMSupabaseClient();
    if (sb) {
        try {
            const { data: seasonsList, error: errList } = await sb
                .from('jm_seasons')
                .select('jahr, title, is_archived')
                .order('is_archived', { ascending: true })
                .order('jahr', { ascending: false });

            if (!errList && seasonsList && seasonsList.length > 0) {
                const { data: seasonData, error: errSeason } = await sb
                    .from('jm_seasons')
                    .select('raw_grid, junior_exclusions')
                    .eq('jahr', jmCurrentJahr)
                    .maybeSingle();

                if (!errSeason && seasonData && Array.isArray(seasonData.raw_grid) && seasonData.raw_grid.length > 5) {
                    jmRawGrid = seasonData.raw_grid;
                    jmPendingUpdates = [];
                    jmPendingMoves = [];
                    jmJuniorExclusions = {};
                    if (Array.isArray(seasonData.junior_exclusions)) {
                        seasonData.junior_exclusions.forEach(k => {
                            jmJuniorExclusions[k] = true;
                        });
                    } else if (typeof seasonData.junior_exclusions === 'object' && seasonData.junior_exclusions !== null) {
                        jmJuniorExclusions = seasonData.junior_exclusions;
                    }
                    jmExclusionsChanged = false;
                    AppState.clearUnsaved();

                    const sheetNames = seasonsList.map(s => s.jahr === 'current' ? 'Jahresmeisterschaft' : ('JM_' + s.jahr));
                    renderHistoryDropdown(sheetNames);
                    renderJahresmeisterschaft(jmRawGrid);
                    updateJMSupabaseBadge(true);

                    if (historySelect) {
                        historySelect.dataset.loadedYear = jmCurrentJahr;
                        historySelect.disabled = false;
                    }
                    if (!silent) {
                        hideLoadingOverlay();
                    }
                    console.log(`⚡ Jahresmeisterschaft (${jmCurrentJahr}) erfolgreich aus Supabase geladen.`);
                    return;
                }
            }
        } catch (sbErr) {
            console.warn("⚠️ Supabase Fehler in Jahresmeisterschaft, wechsle auf GAS Fallback:", sbErr);
        }
    }

    // --- 2. FALLBACK: GOOGLE APPS SCRIPT ---
    try {
        const data = await apiFetch('jahresmeisterschaft', { jahr: jmCurrentJahr });
        const res = await data.json();

        if (res.error) {
            throw new Error(res.message);
        }

        jmRawGrid = res.rawGrid || [];
        jmPendingUpdates = [];
        jmPendingMoves = [];
        jmJuniorExclusions = {};
        if (Array.isArray(res.juniorExclusions)) {
            res.juniorExclusions.forEach(k => {
                jmJuniorExclusions[k] = true;
            });
        }
        jmExclusionsChanged = false;
        AppState.clearUnsaved();

        renderHistoryDropdown(res.sheets);
        renderJahresmeisterschaft(jmRawGrid);
        updateJMSupabaseBadge(false);

        // Auffälliger Migrations-Hinweis bei GAS-Fallback
        const container = document.getElementById('jahresmeisterschaft-container');
        if (container) {
            const banner = document.createElement('div');
            banner.className = 'alert alert-warning d-flex justify-content-between align-items-center mb-3 shadow-sm';
            banner.innerHTML = `
                <div>
                    <i class="fas fa-exclamation-triangle me-2 fs-5"></i>
                    <strong>Hinweis:</strong> Die Daten laufen derzeit im <b>Google Sheets Fallback</b>, weil Supabase noch keine Daten enthält. Website und PWA zeigen Resultate erst nach dem Import.
                </div>
                <button class="btn btn-sm btn-primary ms-3 text-nowrap" onclick="migrateJMFromGoogleSheets()">
                    <i class="fas fa-file-import me-1"></i> Jetzt nach Supabase importieren
                </button>
            `;
            container.prepend(banner);
        }

        if (historySelect) {
            historySelect.dataset.loadedYear = jmCurrentJahr;
        }

    } catch (e) {
        document.getElementById('jahresmeisterschaft-container').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>Fehler beim Laden: ${escapeHtml(e.message)}
            </div>`;
    } finally {
        if (historySelect) {
            historySelect.disabled = false;
        }
        if (!silent) {
            hideLoadingOverlay();
        }
    }
}

function renderHistoryDropdown(sheets) {
    if (!sheets || !sheets.length) return;
    const select = document.getElementById('jm-history-select');
    if (!select) return;

    const currentVal = select.value || jmCurrentJahr;
    
    // Blätter filtern
    const filteredSheets = sheets.filter(s => s === "Jahresmeisterschaft" || s.startsWith("JM_"));
    
    // Sortieren: Jahresmeisterschaft oben, danach Archiv-Jahre absteigend (z.B. JM_2026, JM_2025)
    filteredSheets.sort((a, b) => {
        if (a === "Jahresmeisterschaft") return -1;
        if (b === "Jahresmeisterschaft") return 1;
        const yearA = parseInt(a.replace("JM_", "")) || 0;
        const yearB = parseInt(b.replace("JM_", "")) || 0;
        return yearB - yearA;
    });

    const existingOptions = Array.from(select.options).map(o => o.value);
    const newOptions = ["current", ...filteredSheets.filter(s => s !== "Jahresmeisterschaft").map(s => s.replace("JM_", ""))];
    
    if (JSON.stringify(existingOptions) === JSON.stringify(newOptions)) {
        select.value = currentVal;
        return;
    }

    select.innerHTML = '';
    
    const currentOpt = document.createElement('option');
    currentOpt.value = "current";
    currentOpt.textContent = "Jahresmeisterschaft (aktuell)";
    if (currentVal === "current") currentOpt.selected = true;
    select.appendChild(currentOpt);

    filteredSheets.forEach(s => {
        if (s === "Jahresmeisterschaft") return;
        const val = s.replace("JM_", "");
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = s;
        if (val === currentVal || s === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
}

function isColumnActive(grid, c) {
    if (!grid || !grid[2]) return false;
    const colTitle = String(grid[2][c] || '').trim().toLowerCase();
    if (colTitle.includes('total') || colTitle === 'tot' || colTitle === 't') {
        return true;
    }
    // Statusspalte (Auf-/Abstieg) ermitteln
    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }

    const startRawMannschaft = hasStatusCol ? 34 : 33;
    const endRawMannschaft = hasStatusCol ? 40 : 39;
    if (c >= startRawMannschaft && c <= endRawMannschaft) {
        const checkCol = hasStatusCol ? 10 : 9;
        const val = grid[0][checkCol] || '';
        return ['ja','j','x','1','true','yes','✓','✔','☑'].includes(val.toString().trim().toLowerCase());
    }

    if (colTitle.includes('mannschaft')) {
        const val = grid[0][c] || '';
        return ['ja','j','x','1','true','yes','✓','✔','☑'].includes(val.toString().trim().toLowerCase());
    }
    
    const limitIndex = hasStatusCol ? 42 : 41;
    
    if (c >= limitIndex) {
        return hasValidTitle(grid, c);
    }
    
    const val = grid[0][c] || '';
    const isChecked = ['ja','j','x','1','true','yes','✓','✔','☑'].includes(val.toString().trim().toLowerCase());
    if (isChecked) return true;
    
    if (colTitle.includes('%')) {
        const targetTitle = colTitle.replace(/%/g, '').trim().toLowerCase();
        const pointsColIdx = grid[2].findIndex((t, idx) => {
            const cleanT = String(t || '').trim().toLowerCase();
            return cleanT === targetTitle && idx !== c;
        });
        
        if (pointsColIdx !== -1) {
            const parentVal = grid[0][pointsColIdx] || '';
            return ['ja','j','x','1','true','yes','✓','✔','☑'].includes(parentVal.toString().trim().toLowerCase());
        }
        
        if (c > 0) {
            const prevVal = grid[0][c - 1] || '';
            return ['ja','j','x','1','true','yes','✓','✔','☑'].includes(prevVal.toString().trim().toLowerCase());
        }
    }
    
    return false;
}

function hasValidTitle(grid, c) {
    if (!grid || !grid[2]) return false;
    const title = String(grid[2][c] || '').trim();
    return title !== '' && !title.toLowerCase().startsWith('spalte');
}

// 1-Klick-Import aller Daten aus Google Sheets nach Supabase
window.migrateJMFromGoogleSheets = async function() {
    const sb = getJMSupabaseClient();
    if (!sb) {
        showError("Supabase-Client ist nicht initialisiert.");
        return;
    }

    if (!confirm("Möchtest du alle Jahresmeisterschafts-Daten (aktuelles Jahr & alle Archiv-Jahre) aus Google Sheets nach Supabase importieren?\n\nBestehende Einträge in Supabase werden aktualisiert.")) {
        return;
    }

    try {
        showLoadingOverlay("Lese Jahresmeisterschafts-Daten aus Google Sheets (GAS)... Bitte Geduld...");

        // 1. Initialer Abruf von 'current' und der Sheet-Namen
        const resInit = await apiFetch('jahresmeisterschaft', { jahr: 'current' });
        const initData = await resInit.json();

        if (initData.error) {
            throw new Error(initData.message || "Fehler beim Abruf aus Google Sheets");
        }

        const sheets = initData.sheets || ['Jahresmeisterschaft'];
        let importedCount = 0;

        // 2. Aktuelles Jahr importieren
        if (initData.rawGrid && initData.rawGrid.length > 5) {
            showLoadingOverlay("Speichere aktuelles Jahr in Supabase...");
            const { error: errCurr } = await sb
                .from('jm_seasons')
                .upsert({
                    jahr: 'current',
                    title: 'Jahresmeisterschaft (aktuell)',
                    raw_grid: initData.rawGrid,
                    junior_exclusions: initData.juniorExclusions || [],
                    is_archived: false,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'jahr' });

            if (errCurr) throw errCurr;
            importedCount++;
            await syncJMShootersToSupabase(sb, 'current', initData.rawGrid);
        }

        // 3. Archiv-Jahre importieren
        const archiveYears = sheets
            .filter(s => s && s.startsWith('JM_'))
            .map(s => s.replace('JM_', ''));

        for (let idx = 0; idx < archiveYears.length; idx++) {
            const y = archiveYears[idx];
            showLoadingOverlay(`Lese und importiere Archivjahr ${y} (${idx + 1}/${archiveYears.length})...`);
            try {
                const resY = await apiFetch('jahresmeisterschaft', { jahr: y });
                const dataY = await resY.json();

                if (dataY.rawGrid && dataY.rawGrid.length > 5) {
                    const { error: errY } = await sb
                        .from('jm_seasons')
                        .upsert({
                            jahr: y,
                            title: `Jahresmeisterschaft ${y}`,
                            raw_grid: dataY.rawGrid,
                            junior_exclusions: dataY.juniorExclusions || [],
                            is_archived: true,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'jahr' });

                    if (!errY) {
                        importedCount++;
                        await syncJMShootersToSupabase(sb, y, dataY.rawGrid);
                    }
                }
            } catch (errArc) {
                console.warn(`Fehler beim Import von Archivjahr ${y}:`, errArc);
            }
        }

        showSuccess(`Erfolgreich ${importedCount} Saisons nach Supabase importiert!`);
        await loadJahresmeisterschaftData(true);

    } catch (e) {
        showError("Migrations-Fehler: " + e.message);
    } finally {
        hideLoadingOverlay();
    }
};

// Hilfsfunktion: Synchronisiert strukturierte Schützenlisten nach public.jm_shooters
async function syncJMShootersToSupabase(sb, jahr, grid) {
    if (!sb || !grid || grid.length < 10) return;

    try {
        const shooters = [];
        const hasStatusCol = grid[4] && grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
        
        // Personen-Spalten ermitteln
        const headerRow = grid[4] || [];
        const colNachname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'nachname');
        const colVorname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'vorname');
        const colLizenz = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('lizenz'));
        const colJahrgang = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('jahrgang'));
        
        // Total- und Streich-Spalten
        const compRow = grid[2] || [];
        const colTotal = compRow.findIndex(t => String(t || '').trim().toLowerCase() === 'total' || String(t || '').trim().toLowerCase() === 'tot');
        const colStreich = compRow.findIndex(t => String(t || '').trim().toLowerCase().includes('streich'));

        // Liga 1: Zeilen 5 bis 12
        for (let r = 5; r <= 12; r++) {
            if (!grid[r]) continue;
            const nachname = String(grid[r][colNachname] || '').trim();
            const vorname = String(grid[r][colVorname] || '').trim();
            if (!nachname) continue;
            
            const fullName = `${nachname} ${vorname}`.trim();
            const lizenz = String(grid[r][colLizenz] || '').trim();
            const total = parseFloat(grid[r][colTotal]) || 0;
            const streich = colStreich !== -1 ? (parseFloat(grid[r][colStreich]) || 0) : 0;
            const jg = parseInt(grid[r][colJahrgang]) || null;
            const isJunior = jg ? (new Date().getFullYear() - jg <= 20) : false;

            shooters.push({
                id: `${jahr}_L1_${r}_${lizenz || fullName}`,
                jahr: jahr,
                person_number: lizenz,
                name: fullName,
                jahrgang: jg,
                liga: 1,
                rang: r - 4,
                total: total,
                streichresultat_prz: streich,
                status: (r >= 11) ? 'abstieg' : 'neutral',
                is_junior: isJunior,
                details: {},
                updated_at: new Date().toISOString()
            });
        }

        // Liga 2: Zeilen 15 bis Ende
        for (let r = 15; r < grid.length; r++) {
            if (!grid[r]) continue;
            const nachname = String(grid[r][colNachname] || '').trim();
            const vorname = String(grid[r][colVorname] || '').trim();
            if (!nachname) continue;

            const fullName = `${nachname} ${vorname}`.trim();
            const lizenz = String(grid[r][colLizenz] || '').trim();
            const total = parseFloat(grid[r][colTotal]) || 0;
            const streich = colStreich !== -1 ? (parseFloat(grid[r][colStreich]) || 0) : 0;
            const jg = parseInt(grid[r][colJahrgang]) || null;
            const isJunior = jg ? (new Date().getFullYear() - jg <= 20) : false;

            shooters.push({
                id: `${jahr}_L2_${r}_${lizenz || fullName}`,
                jahr: jahr,
                person_number: lizenz,
                name: fullName,
                jahrgang: jg,
                liga: 2,
                rang: r - 14,
                total: total,
                streichresultat_prz: streich,
                status: (r <= 16) ? 'aufstieg' : 'neutral',
                is_junior: isJunior,
                details: {},
                updated_at: new Date().toISOString()
            });
        }

        if (shooters.length > 0) {
            await sb.from('jm_shooters').delete().eq('jahr', jahr);
            await sb.from('jm_shooters').insert(shooters);
        }
    } catch (e) {
        console.warn("Konnte jm_shooters nicht synchronisieren:", e);
    }
}
