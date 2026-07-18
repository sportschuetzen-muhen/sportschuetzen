// === SUB-MODUL: JAHRESMEISTERSCHAFT - CORE ===

let jmRawGrid = [];
let jmCurrentJahr = "current";
let jmPendingUpdates = [];
let jmPendingMoves = [];
let jmJuniorExclusions = {};
let jmExclusionsChanged = false;

async function loadJahresmeisterschaftData(force = false, silent = false) {
    const historySelect = document.getElementById('jm-history-select');
    if (historySelect && historySelect.value) {
        jmCurrentJahr = historySelect.value;
    }

    if (!force && jmRawGrid.length > 0 && historySelect) {
        console.log("⚡ loadJahresmeisterschaftData: Lade aus lokalem Cache...");
        return;
    }

    // Dropdown sperren während des Ladens
    if (historySelect) {
        historySelect.disabled = true;
    }

    try {
        let res;
        if (silent) {
            const data = await apiFetch('jahresmeisterschaft', { jahr: jmCurrentJahr });
            res = await data.json();
        } else {
            const data = await apiFetchWithLoading('jahresmeisterschaft', { jahr: jmCurrentJahr }, { loadingMessage: 'Lade Jahresmeisterschaft...' });
            res = await data.json();
        }

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

    const currentVal = select.value;
    
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
    
    // Statusspalte (Auf-/Abstieg) ermitteln
    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }
    const limitIndex = hasStatusCol ? 42 : 41; // ab und mit Spalte 42 (Index 41 / 42)
    
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
    if (!grid[2]) return false;
    const title = String(grid[2][c] || '').trim();
    return title !== '' && !title.toLowerCase().startsWith('spalte');
}
