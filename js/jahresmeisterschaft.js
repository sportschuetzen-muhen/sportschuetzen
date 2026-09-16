let jmRawGrid = [];
let jmCurrentJahr = "current";
let jmPendingUpdates = [];
let jmPendingMoves = [];

const EDITABLE_COLS_SHOOTERS = [6, 7, 8, 14, 15, 16, 17, 27, 28]; // Veraltet: Wird jetzt dynamisch berechnet
const EDITABLE_COLS_HEADER = [6,7,8,9,10,11,12,13,14,15,16,17, 40,41,42,43,44,45,46,47,48,49,50,51]; // Veraltet: Wird jetzt dynamisch berechnet

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

function handleCellEdit(r, c, val, inputElem) {
    if (r > 4 && inputElem) {
        const maxVal = parseFloat(jmRawGrid[3][c]);
        const enteredVal = parseFloat(val);
        if (!isNaN(maxVal) && !isNaN(enteredVal) && enteredVal > maxVal) {
            inputElem.classList.add('is-invalid');
            showError(`Eingabe ungültig: Maximal ${maxVal} Punkte erlaubt.`);
            inputElem.value = jmRawGrid[r][c] || '';
            return;
        } else {
            inputElem.classList.remove('is-invalid');
        }
    }

    jmRawGrid[r][c] = val;

    jmPendingUpdates = jmPendingUpdates.filter(u => !(u.r === r && u.c === c));
    jmPendingUpdates.push({ r, c, v: val });
    AppState.markUnsaved();

    if (r === 0) {
        renderJahresmeisterschaft(jmRawGrid);
    }
}

function isColumnActive(grid, c) {
    const colTitle = String(grid[2][c] || '').trim().toLowerCase();
    if (colTitle.includes('total') || colTitle === 'tot' || colTitle === 't') {
        return true;
    }
    if (colTitle.includes('mannschaft')) {
        return true;
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

function renderJahresmeisterschaft(grid) {
    if (!grid || grid.length < 10) {
        document.getElementById('jahresmeisterschaft-container').innerHTML = '<div class="alert alert-warning">Ungültige Datenstruktur empfangen.</div>';
        return;
    }

    let canWrite = hasWriteAccess('jahresmeisterschaft');
    if (jmCurrentJahr !== "current") {
        canWrite = false;
    }

    // Speichern-Button steuern
    const saveBtn = document.querySelector('button[onclick="saveJahresmeisterschaftData()"]');
    if (saveBtn) {
        saveBtn.disabled = (jmCurrentJahr !== "current");
    }

    // Aktionen-Menü dynamisch füllen
    const actionsMenu = document.getElementById('jm-actions-menu');
    if (actionsMenu) {
        if (jmCurrentJahr === "current") {
            actionsMenu.innerHTML = `
                <li><a class="dropdown-item" href="#" onclick="runJMAction('importiereKantonalstichDaten', 'Kantonalstich importieren')">Import: Kantonalstich</a></li>
                <li><a class="dropdown-item" href="#" onclick="runJMAction('importiereVerbandsschiessendaten', 'Verbandsschiessen importieren')">Import: Verband</a></li>
                <li><a class="dropdown-item" href="#" onclick="runJMAction('importiereVereinswettschiessendaten', 'Vereinswettschiessen importieren')">Import: Vereinswettschiessen</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-warning" href="#" onclick="runJMAction('archiviereJahresmeisterschaft', 'Jahr archivieren')">Archivieren (Aktuelles Jahr)</a></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="runJMAction('jahresmeisterschaftZuruecksetzen', 'Neues Jahr starten')">Neues Jahr (Nullen)</a></li>
            `;
        } else {
            actionsMenu.innerHTML = `
                <li><a class="dropdown-item text-danger fw-bold" href="#" onclick="runDeleteArchivedYearAction('${jmCurrentJahr}')"><i class="fas fa-trash-alt me-2"></i>Archiv ${jmCurrentJahr} unwiderruflich löschen</a></li>
            `;
        }
    }

    // Statusspalte (Auf-/Abstieg) ermitteln
    let hasStatusCol = false;
    let statusColIndex = -1;
    if (grid[4]) {
        for (let c = 0; c < grid[4].length; c++) {
            const val = String(grid[4][c] || '').trim().toLowerCase();
            if (val === 'status') {
                hasStatusCol = true;
                statusColIndex = c;
                break;
            }
        }
    }

    // Spaltenindizes anpassen (dynamisch bei verschobenen Spalten durch Status)
    const baseHeaderCols = [6,7,8,9,10,11,12,13,14,15,16,17, 41,42,43,44,45,46,47,48,49,50,51];
    const baseShooterCols = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 27, 28, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];

    const activeHeaderCols = baseHeaderCols.map(c => (hasStatusCol && c >= 6) ? c + 1 : c);
    const activeShooterCols = baseShooterCols.map(c => (hasStatusCol && c >= 6) ? c + 1 : c);

    // Spalten ab Spalte 42 (Index 41 / 42) filtern: nur anzeigen wenn ein Wettkampftitel vorhanden ist
    const limitIndex = hasStatusCol ? 42 : 41;
    const filteredHeaderCols = activeHeaderCols.filter(c => {
        if (c < limitIndex) return true;
        return hasValidTitle(grid, c);
    });

    // Nur Spalten anzeigen, die aktiv sind UND ab Spalte 42 einen Titel haben
    const visibleShooterCols = activeShooterCols.filter(c => {
        if (c >= limitIndex && !hasValidTitle(grid, c)) return false;
        return isColumnActive(grid, c);
    });

    let html = `
        <div class="card shadow-sm mb-4">
            <div class="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
                <h5 class="mb-0">Allgemeine Einstellungen (Kopfzeilen)</h5>
                ${canWrite ? `<button class="btn btn-sm btn-light fw-bold text-dark animate__animated animate__fadeIn" onclick="addNewAuswaertigesSchiessen()"><i class="fas fa-plus me-1"></i>Neues Auswärtiges Schießen</button>` : ''}
            </div>
            <div class="card-body overflow-auto">
                <table class="table table-bordered table-sm align-middle" style="min-width: 800px; font-size: 0.85rem; table-layout: fixed;">
                    <thead class="table-light">
                        <tr>
                            <th style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'};">Einstellung</th>
                            ${filteredHeaderCols.map((c, colIndex) => {
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #eef2f6;' : '';
                                return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate" title="${escapeHtml(grid[2][c] || '')}">${escapeHtml(grid[2][c] || ('Spalte '+(c+1)))}</th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Checkboxen (Zeile 1) -->
                        <tr>
                            <td style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'};"><strong>Aktiv (Checkboxen)</strong></td>
                            ${filteredHeaderCols.map((c, colIndex) => {
                                const limit = hasStatusCol ? 18 : 17;
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                                if (c <= limit) {
                                    const val = grid[0][c] || '';
                                    const isChecked = ['ja','j','x','1','true','yes','✓','✔','☑'].includes(val.toString().trim().toLowerCase());
                                    return `<td class="text-center" style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"><input type="checkbox" class="form-check-input write-protected" ${canWrite ? '' : 'disabled'} ${isChecked ? 'checked' : ''} onchange="handleCellEdit(0, ${c}, this.checked ? 'TRUE' : 'FALSE')"></td>`;
                                }
                                return `<td class="bg-light" style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"></td>`;
                            }).join('')}
                        </tr>
                        <!-- Titel (Zeile 3) -->
                        <tr>
                            <td style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'};"><strong>Wettkampf Titel</strong></td>
                            ${filteredHeaderCols.map((c, colIndex) => {
                                const val = grid[2][c] || '';
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                                const inputStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                                return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"><input type="text" class="form-control form-control-sm write-protected text-center" style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} value="${escapeHtml(val)}" onchange="handleCellEdit(2, ${c}, this.value)"></td>`;
                            }).join('')}
                        </tr>
                        <!-- Max Werte (Zeile 4) -->
                        <tr>
                            <td style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'};"><strong>Max. Punkte</strong></td>
                            ${filteredHeaderCols.map((c, colIndex) => {
                                const val = grid[3][c] || '';
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                                const inputStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                                return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"><input type="text" class="form-control form-control-sm write-protected text-center" style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} value="${escapeHtml(val)}" onchange="handleCellEdit(3, ${c}, this.value)"></td>`;
                            }).join('')}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // LIGA 1
    html += buildLigaTable("Liga 1", grid, 5, 12, canWrite, hasStatusCol, statusColIndex, visibleShooterCols);
    
    // LIGA 2
    html += buildLigaTable("Liga 2", grid, 15, grid.length - 1, canWrite, hasStatusCol, statusColIndex, visibleShooterCols);

    document.getElementById('jahresmeisterschaft-container').innerHTML = html;

    // Init Sortable für Liga 1 und Liga 2
    if (canWrite) {
        const tbody1 = document.getElementById('tbody-liga-1');
        const tbody2 = document.getElementById('tbody-liga-2');
        
        const sortableOptions = {
            group: 'shared',
            animation: 150,
            fallbackOnBody: true,
            swapThreshold: 0.65,
            onEnd: handleSortEnd
        };

        if (tbody1 && tbody2) {
            new Sortable(tbody1, sortableOptions);
            new Sortable(tbody2, sortableOptions);
        }
    }
    
    // Check sizes initially
    checkLigaSizes();
}

function checkLigaSizes() {
    const tbody1 = document.getElementById('tbody-liga-1');
    if (!tbody1) return;
    const count = tbody1.querySelectorAll('tr').length;
    let banner = document.getElementById('liga1-warning-banner');
    
    if (count !== 8) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'liga1-warning-banner';
            banner.className = 'alert alert-danger fw-bold mt-3 mb-3 animate__animated animate__fadeIn';
            const card = tbody1.closest('.card');
            card.parentNode.insertBefore(banner, card);
        }
        banner.innerHTML = `<i class="fas fa-exclamation-triangle me-2"></i>Achtung: Liga 1 muss exakt 8 Schützen enthalten! (Aktuell: ${count})`;
    } else if (banner) {
        banner.remove();
    }
}

function handleSortEnd(evt) {
    const item = evt.item;
    const fromRow = parseInt(item.dataset.row);
    if (isNaN(fromRow)) return;

    const toTbody = evt.to;
    const rows = Array.from(toTbody.querySelectorAll('tr'));
    const localIndex = rows.indexOf(item);
    if (localIndex === -1) return;

    let toRow;
    if (toTbody.id === 'tbody-liga-1') {
        toRow = 5 + localIndex;
    } else {
        toRow = 15 + localIndex;
    }

    if (fromRow === toRow) return;

    // Move in memory
    const movedRow = jmRawGrid[fromRow];
    jmRawGrid.splice(fromRow, 1);
    jmRawGrid.splice(toRow, 0, movedRow);

    // Record for backend
    jmPendingMoves.push({ from: fromRow, to: toRow });
    AppState.markUnsaved();
    
    // Re-render
    renderJahresmeisterschaft(jmRawGrid);
    showSuccess("Verschiebung vermerkt. Bitte Speichern nicht vergessen.");
}

function buildLigaTable(title, grid, startRow, endRow, canWrite, hasStatusCol, statusColIndex, visibleShooterCols) {
    let tbodyHtml = '';
    
    // Gültige Schützen ermitteln und nach Total in % absteigend sortieren
    const shooterRows = [];
    for (let r = startRow; r <= endRow; r++) {
        if (!grid[r]) continue;
        const vorname = grid[r][2] || ''; // C
        const nachname = grid[r][1] || ''; // B
        if (!nachname && !vorname) continue;
        shooterRows.push({ rowIndex: r, rowData: grid[r] });
    }

    const totalCol = hasStatusCol ? 19 : 18;
    shooterRows.sort((a, b) => {
        const valA = parseFloat(String(a.rowData[totalCol] || '').replace(/%/g, '').trim()) || 0;
        const valB = parseFloat(String(b.rowData[totalCol] || '').replace(/%/g, '').trim()) || 0;
        return valB - valA;
    });

    for (const s of shooterRows) {
        const r = s.rowIndex;
        const vorname = s.rowData[2] || '';
        const nachname = s.rowData[1] || '';

        let statusTd = '';
        if (hasStatusCol && statusColIndex !== -1) {
            const statusVal = s.rowData[statusColIndex] || '';
            let badgeClass = 'bg-secondary';
            if (statusVal.includes('Aufstieg')) badgeClass = 'bg-success';
            if (statusVal.includes('Abstieg')) badgeClass = 'bg-danger';
            statusTd = `<td style="width: 100px; min-width: 100px; max-width: 100px;"><span class="badge ${badgeClass}">${escapeHtml(statusVal)}</span></td>`;
        }

        tbodyHtml += `<tr data-row="${r}">
            <td style="cursor: grab; width: 40px; min-width: 40px; max-width: 40px;" class="text-center text-muted"><i class="fas fa-grip-lines"></i></td>
            <td class="fw-bold" style="width: 200px; min-width: 200px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(vorname)} ${escapeHtml(nachname)}</td>
            ${statusTd}
            ${visibleShooterCols.map((c, colIndex) => {
                const val = s.rowData[c] || '';
                const colTitle = String(grid[2][c] || '').trim().toLowerCase();
                const isAuswaertiges = colTitle.includes('auswärts') || colTitle.includes('ausw');
                const isPercent = colTitle.includes('%');
                const isTotal = colTitle.includes('total') || colTitle === 'tot' || colTitle === 't';
                const isMannschaft = colTitle.includes('mannschaft');
                
                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                const inputStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                
                if (isTotal || isMannschaft) {
                    const totalBg = (colIndex % 2 === 1) ? 'background-color: #e2e6ea;' : '';
                    return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"><input type="text" class="form-control form-control-sm fw-bold text-center" style="width: 100%; ${totalBg}" readonly value="${escapeHtml(val)}"></td>`;
                }

                if (isAuswaertiges || isPercent) {
                    const calcBg = (colIndex % 2 === 1) ? 'background-color: #e2e6ea;' : '';
                    return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"><input type="text" class="form-control form-control-sm write-protected cursor-pointer text-center" style="width: 100%; ${calcBg}" readonly value="${escapeHtml(val)}" onclick="${canWrite ? `openAuswaertigesCalculator(${r}, ${c})` : ''}"></td>`;
                }

                return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"><input type="text" class="form-control form-control-sm write-protected text-center" style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} value="${escapeHtml(val)}" onchange="handleCellEdit(${r}, ${c}, this.value, this)"></td>`;
            }).join('')}
        </tr>`;
    }

    const tbodyId = title.replace(/\s+/g, '-').toLowerCase();
    const statusTh = hasStatusCol ? `<th style="width: 100px; min-width: 100px; max-width: 100px;">Status</th>` : '';

    return `
        <div class="card shadow-sm mb-4">
            <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <h5 class="mb-0">${title}</h5>
                <small class="badge bg-light text-dark">Drag & Drop zum Verschieben</small>
            </div>
            <div class="card-body overflow-auto">
                <table class="table table-hover table-sm align-middle" style="min-width: 800px; font-size: 0.9rem; table-layout: fixed;">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 40px; min-width: 40px; max-width: 40px;"></th>
                            <th style="width: 200px; min-width: 200px; max-width: 200px;">Schütze</th>
                            ${statusTh}
                            ${visibleShooterCols.map((c, colIndex) => {
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #eef2f6;' : '';
                                return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate" title="${escapeHtml(grid[2][c] || '')}">${escapeHtml(grid[2][c] || ('Spalte '+(c+1)))}</th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody id="tbody-${tbodyId}">
                        ${tbodyHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function saveJahresmeisterschaftData() {
    if (jmPendingUpdates.length === 0 && jmPendingMoves.length === 0) {
        showSuccess("Keine Änderungen zum Speichern vorhanden.");
        return;
    }

    const tbody1 = document.getElementById('tbody-liga-1');
    if (tbody1 && tbody1.querySelectorAll('tr').length !== 8) {
        showError("Speichern blockiert: Liga 1 muss exakt 8 Schützen enthalten!");
        return;
    }

    if (!confirm("Bist du sicher, dass du die Änderungen im Google Sheet speichern möchtest? Dies überschreibt die Live-Daten!")) {
        return;
    }

    try {
        showLoadingOverlay('Speichere Jahresmeisterschaft... Bitte Geduld, Google Sheets berechnet alle Ränge neu (kann 10-15 Sek. dauern)...');
        
        const payload = {
            action: 'saveJahresmeisterschaft',
            jahr: jmCurrentJahr,
            updates: jmPendingUpdates,
            moves: jmPendingMoves
        };

        const res = await fetch(WORKER_URL + "?module=jahresmeisterschaft", {
            method: 'POST',
            headers: {
                'X-CSRF-Token': getCsrfToken(),
                'X-User-Role': window.userRole,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            showSuccess("Erfolgreich gespeichert!");
            jmPendingUpdates = [];
            jmPendingMoves = [];
            AppState.clearUnsaved();
            // Lade Daten neu, um Formeln (Totals/%) neu zu berechnen
            setTimeout(loadJahresmeisterschaftData, 1000);
        } else {
            throw new Error(data.error || "Unbekannter Fehler beim Speichern.");
        }
    } catch (e) {
        showError("Fehler beim Speichern: " + e.message);
    } finally {
        hideLoadingOverlay();
    }
}

function updateCalculatorAlertText(hasStatusCol) {
    const startCol = hasStatusCol ? 42 : 41;
    const endCol = hasStatusCol ? 52 : 51;
    const names = [];
    
    for (let c = startCol; c <= endCol; c++) {
        const title = jmRawGrid[2] && jmRawGrid[2][c];
        if (title && !title.includes('%')) {
            names.push(title);
        }
    }
    
    const infoElem = document.getElementById('calc-info-text');
    if (infoElem) {
        infoElem.innerHTML = `<i class="fas fa-info-circle me-1"></i> <strong>Wichtig:</strong> Bitte selbst prüfen, welches Resultat aus den folgenden Wettkämpfen das höchste ist, da dieses eingetragen werden sollte:<br><strong class="text-primary">${escapeHtml(names.join(', '))}</strong>`;
    }
}

function openAuswaertigesCalculator(r, c) {
    const title = String(jmRawGrid[2][c] || '').trim();
    let pointsCol, percentCol;
    
    if (title.toLowerCase().includes('%')) {
        percentCol = c;
        const targetTitle = title.replace(/%/g, '').trim().toLowerCase();
        
        pointsCol = jmRawGrid[2].findIndex((t, idx) => {
            const cleanT = String(t || '').trim().toLowerCase();
            return cleanT === targetTitle && idx !== c;
        });
        
        if (pointsCol === -1) {
            pointsCol = c - 6; // Fallback
        }
    } else {
        pointsCol = c;
        const targetTitle1 = (title + ' %').toLowerCase();
        const targetTitle2 = (title + '%').toLowerCase();
        
        percentCol = jmRawGrid[2].findIndex((t, idx) => {
            const cleanT = String(t || '').trim().toLowerCase();
            return (cleanT === targetTitle1 || cleanT === targetTitle2) && idx !== c;
        });
        
        if (percentCol === -1) {
            percentCol = c + 6; // Fallback
        }
    }

    const pointsVal = jmRawGrid[r][pointsCol] || '';
    
    let maxVal = parseFloat(jmRawGrid[3][pointsCol]);
    if (isNaN(maxVal) || maxVal <= 0) {
        maxVal = 100;
    }

    document.getElementById('calc-row').value = r;
    document.getElementById('calc-points-col').value = pointsCol;
    document.getElementById('calc-percent-col').value = percentCol;
    document.getElementById('calc-max-points').value = maxVal;
    document.getElementById('calc-points').value = pointsVal;
    
    if (pointsVal !== '') {
        const percent = (parseFloat(pointsVal) / maxVal) * 100;
        document.getElementById('calc-percent').value = percent.toFixed(2) + ' %';
    } else {
        document.getElementById('calc-percent').value = '';
    }

    // Dynamischen Hinweistext mit Wettkampfnamen aktualisieren
    let hasStatusCol = false;
    if (jmRawGrid[4]) {
        hasStatusCol = jmRawGrid[4].some(cell => String(cell || '').trim().toLowerCase() === 'status');
    }
    updateCalculatorAlertText(hasStatusCol);

    const modal = new bootstrap.Modal(document.getElementById('auswaertiges-modal'));
    modal.show();
}

function calculatePercentage() {
    const maxVal = parseFloat(document.getElementById('calc-max-points').value) || 100;
    const pointsValRaw = document.getElementById('calc-points').value;
    const percentField = document.getElementById('calc-percent');

    if (pointsValRaw === '') {
        percentField.value = '';
        return;
    }

    const pointsVal = parseFloat(pointsValRaw);
    if (isNaN(pointsVal) || pointsVal < 0) {
        percentField.value = '';
        return;
    }

    if (pointsVal > maxVal) {
        showError(`Eingabe ungültig: Punkte können nicht größer als ${maxVal} sein.`);
        document.getElementById('calc-points').value = maxVal;
        percentField.value = '100.00 %';
        return;
    }

    const percent = (pointsVal / maxVal) * 100;
    percentField.value = percent.toFixed(2) + ' %';
}

function saveAuswaertigesCalculator() {
    const row = parseInt(document.getElementById('calc-row').value);
    const pointsCol = parseInt(document.getElementById('calc-points-col').value);
    const percentCol = parseInt(document.getElementById('calc-percent-col').value);
    
    const maxVal = parseFloat(document.getElementById('calc-max-points').value) || 100;
    const pointsValRaw = document.getElementById('calc-points').value;

    if (pointsValRaw === '') {
        showError("Bitte Punkte eingeben oder 'Leeren / Löschen' klicken.");
        return;
    }

    const pointsVal = parseFloat(pointsValRaw);
    if (isNaN(pointsVal) || pointsVal < 0 || pointsVal > maxVal) {
        showError(`Bitte gültige Punkte zwischen 0 und ${maxVal} eingeben.`);
        return;
    }

    const percent = (pointsVal / maxVal) * 100;

    handleCellEdit(row, pointsCol, pointsVal.toString());
    handleCellEdit(row, percentCol, percent.toFixed(2));

    const modalElem = document.getElementById('auswaertiges-modal');
    const modal = bootstrap.Modal.getInstance(modalElem);
    if (modal) modal.hide();

    renderJahresmeisterschaft(jmRawGrid);
    showSuccess("Auswärtiges Resultat & Prozentwert erfolgreich gespeichert.");
}

function clearAuswaertigesCalculator() {
    const row = parseInt(document.getElementById('calc-row').value);
    const pointsCol = parseInt(document.getElementById('calc-points-col').value);
    const percentCol = parseInt(document.getElementById('calc-percent-col').value);

    handleCellEdit(row, pointsCol, '');
    handleCellEdit(row, percentCol, '');

    const modalElem = document.getElementById('auswaertiges-modal');
    const modal = bootstrap.Modal.getInstance(modalElem);
    if (modal) modal.hide();

    renderJahresmeisterschaft(jmRawGrid);
    showSuccess("Auswärtige Resultate erfolgreich gelöscht.");
}

async function runJMAction(functionName, actionLabel) {
    if (!confirm(`Möchtest du die Aktion "${actionLabel}" im Hintergrund ausführen?`)) {
        return;
    }

    try {
        let archivJahr = null;
        if (functionName === 'archiviereJahresmeisterschaft') {
            archivJahr = prompt("Bitte gib das Jahr für das Archiv ein (z.B. 2025):", new Date().getFullYear());
            if (!archivJahr || !/^\d{4}$/.test(archivJahr)) {
                showError("Ungültiges Jahr eingegeben. Aktion abgebrochen.");
                return;
            }
        }

        showLoadingOverlay(`Führe ${actionLabel} aus... Bitte Geduld, Google Sheets verarbeitet die Daten und berechnet alle Ränge neu...`);
        
        const payload = {
            action: 'runFunction',
            functionName: functionName,
            archivJahr: archivJahr
        };

        const res = await fetch(WORKER_URL + "?module=jahresmeisterschaft", {
            method: 'POST',
            headers: {
                'X-CSRF-Token': getCsrfToken(),
                'X-User-Role': window.userRole,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            showSuccess(`Aktion erfolgreich: ${data.message || actionLabel}`);
            // Lade aktuelle Daten neu
            setTimeout(loadJahresmeisterschaftData, 1000);
        } else {
            throw new Error(data.error || "Unbekannter Fehler bei der Ausführung.");
        }
    } catch (e) {
        showError("Fehler bei der Aktion: " + e.message);
    } finally {
        hideLoadingOverlay();
    }
}

async function runDeleteArchivedYearAction(jahr) {
    const confirmation = prompt(`Bist du absolut sicher, dass du das gesamte Archiv für das Jahr ${jahr} UNWIDERRUFLICH löschen möchtest?\n\nBitte tippe "${jahr}" zur Bestätigung ein:`);
    if (confirmation !== jahr) {
        showError("Löschvorgang abgebrochen. Die Bestätigung war nicht korrekt.");
        return;
    }
    
    try {
        showLoadingOverlay(`Lösche Archiv ${jahr}... Bitte Geduld, Google Sheets löscht das Tabellenblatt (kann einen Moment dauern)...`);
        
        const payload = {
            action: 'runFunction',
            functionName: 'loescheArchiviertesJahr',
            archivJahr: jahr
        };

        const res = await fetch(WORKER_URL + "?module=jahresmeisterschaft", {
            method: 'POST',
            headers: {
                'X-CSRF-Token': getCsrfToken(),
                'X-User-Role': window.userRole,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            showSuccess(`Archiv ${jahr} wurde erfolgreich gelöscht!`);
            jmCurrentJahr = "current";
            // Dropdown aktualisieren
            const select = document.getElementById('jm-history-select');
            if (select) {
                select.value = "current";
            }
            setTimeout(loadJahresmeisterschaftData, 1000);
        } else {
            throw new Error(data.error || "Fehler beim Löschen des Archivs.");
        }
    } catch (e) {
        showError("Fehler beim Löschen: " + e.message);
    } finally {
        hideLoadingOverlay();
    }
}

async function addNewAuswaertigesSchiessen() {
    const name = prompt("Gib den Namen des neuen Auswärtsschießens ein (z. B. 'Freischießen Zofingen'):");
    if (!name || name.trim() === "") return;
    
    const maxPunkteStr = prompt("Gib die maximale Punktzahl für dieses Schießen ein (z. B. '100'):");
    if (maxPunkteStr === null) return;
    const maxPunkte = parseInt(maxPunkteStr);
    if (isNaN(maxPunkte) || maxPunkte <= 0) {
        showError("Ungültige Punktzahl eingegeben.");
        return;
    }

    try {
        showLoadingOverlay('Erstelle neues Auswärtsschießen... Bitte Geduld, Google Sheets berechnet alle Ränge neu (kann 10-15 Sek. dauern)...');
        
        const payload = {
            action: 'runFunction',
            functionName: 'neuesAuswaertigesSchiessen',
            name: name.trim(),
            maxPunkte: maxPunkte
        };

        const res = await fetch(WORKER_URL + "?module=jahresmeisterschaft", {
            method: 'POST',
            headers: {
                'X-CSRF-Token': getCsrfToken(),
                'X-User-Role': window.userRole,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showSuccess(`Auswärtsschießen '${name}' wurde erfolgreich erstellt.`);
            loadJahresmeisterschaftData();
        } else {
            showError(data.message || "Fehler beim Erstellen.");
        }
    } catch (err) {
        showError("Netzwerkfehler: " + err.message);
    } finally {
        hideLoadingOverlay();
    }
}
