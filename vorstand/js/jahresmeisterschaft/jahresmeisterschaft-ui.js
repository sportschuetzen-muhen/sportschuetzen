// === SUB-MODUL: JAHRESMEISTERSCHAFT - UI ===

let jmViewMode = 'points'; // 'points' | 'percent' | 'both'
window.jmViewMode = jmViewMode;
function setJMViewMode(mode) {
    jmViewMode = mode;
    window.jmViewMode = mode;
    if (typeof jmRawGrid !== 'undefined' && Array.isArray(jmRawGrid) && jmRawGrid.length > 5) {
        renderJahresmeisterschaft(jmRawGrid);
    }
}
window.setJMViewMode = setJMViewMode;

function updateJMSaveButtonState() {
    const saveBtn = document.getElementById('btn-save-jm') || document.querySelector('button[onclick="saveJahresmeisterschaftData()"]');
    if (!saveBtn) return;
    const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('jahresmeisterschaft') : true;
    if (jmCurrentJahr !== "current" || !canWrite) {
        saveBtn.disabled = true;
        saveBtn.classList.add('d-none');
        return;
    }
    saveBtn.classList.remove('d-none');
    const changeCount = (jmPendingUpdates.length || 0) + (jmPendingMoves.length || 0) + (jmExclusionsChanged ? 1 : 0);
    if (changeCount > 0) {
        saveBtn.disabled = false;
        saveBtn.className = 'btn btn-sm btn-warning write-protected fw-bold';
        saveBtn.innerHTML = `<i class="fas fa-save me-1"></i> Speichern (${changeCount})`;
    } else {
        saveBtn.disabled = true;
        saveBtn.className = 'btn btn-sm btn-outline-secondary write-protected';
        saveBtn.innerHTML = `💾 Gespeichert`;
    }
}
window.updateJMSaveButtonState = updateJMSaveButtonState;

function renderJahresmeisterschaft(grid) {
    if (!grid || grid.length < 10) {
        document.getElementById('jahresmeisterschaft-container').innerHTML = '<div class="alert alert-warning">Ungültige Datenstruktur empfangen.</div>';
        return;
    }

    let canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('jahresmeisterschaft') : true;
    if (jmCurrentJahr !== "current") {
        canWrite = false;
    }

    // Speichern-Button und Aktions-Buttons im Header steuern
    updateJMSaveButtonState();

    const actionsDropdown = document.getElementById('jm-actions-menu')?.closest('.dropdown');
    if (actionsDropdown) {
        actionsDropdown.classList.toggle('d-none', !canWrite);
    }

    // Live-Badge aktualisieren
    if (typeof updateJMSupabaseBadge === 'function') {
        updateJMSupabaseBadge(window._jmIsSupabase);
    }

    // Aktionen-Menü dynamisch füllen
    const actionsMenu = document.getElementById('jm-actions-menu');
    if (actionsMenu && canWrite) {
        if (jmCurrentJahr === "current") {
            actionsMenu.innerHTML = `
                <li><a class="dropdown-item text-success fw-semibold" href="#" onclick="openJMImportModal()"><i class="fas fa-file-import me-2"></i>Resultate importieren...</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-warning" href="#" onclick="runJMAction('archiviereJahresmeisterschaft', 'Jahr archivieren')"><i class="fas fa-archive me-2"></i>Archivieren (Aktuelles Jahr)</a></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="runJMAction('jahresmeisterschaftZuruecksetzen', 'Neues Jahr starten')"><i class="fas fa-undo me-2"></i>Neues Jahr (Nullen)</a></li>
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

    // Dynamisches Maximum & Live-Berechnung ausführen
    const maxPercent = (typeof recalculateJMRawGrid === 'function')
        ? recalculateJMRawGrid(grid)
        : 1000;
    const colTotal = hasStatusCol ? 19 : 18;

    // Spaltenindizes anpassen (dynamisch bei verschobenen Spalten durch Status)
    const baseHeaderCols = [6,7,8,9,10,11,12,13,14,15,16,17, 41,42,43,44,45,46,47,48,49,50,51];
    const baseShooterCols = [6, 7, 8, 33, 34, 35, 36, 37, 38, 39, 13, 14, 15, 16, 17, 18, 27, 28, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];

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

    let settingsHtml = `
        <div class="card rounded-4 border-0 shadow-sm mb-4">
            <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
                <h5 class="mb-0 fw-bold text-primary"><i class="fas fa-sliders-h text-primary me-2"></i>Allgemeine Einstellungen (Kopfzeilen)</h5>
                ${canWrite ? `<button class="btn btn-sm btn-primary rounded-pill fw-semibold shadow-xs" onclick="addNewAuswaertigesSchiessen()"><i class="fas fa-plus me-1"></i>Neues Auswärtiges Schiessen</button>` : ''}
            </div>
            <div class="card-body p-0 overflow-auto">
                <table class="table table-bordered table-sm align-middle mb-0" style="min-width: 800px; font-size: 0.85rem; table-layout: fixed;">
                    <thead class="table-light">
                        <tr>
                            <th style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'}; position: sticky; left: 0; z-index: 3; background-color: #f8f9fa; border-right: 2px solid #dee2e6;">Einstellung</th>
                            ${filteredHeaderCols.map((c, colIndex) => {
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #eef2f6;' : '';
                                let titleStr = grid[2][c] || ('Spalte '+(c+1));
                                if (c === colTotal) titleStr = `Total (max. ${maxPercent}%)`;
                                return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate" title="${escapeHtml(titleStr)}">${escapeHtml(titleStr)}</th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Checkboxen (Zeile 1) -->
                        <tr>
                            <td style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'}; position: sticky; left: 0; z-index: 2; background-color: #fff; border-right: 2px solid #dee2e6;"><strong>Aktiv (Checkboxen)</strong></td>
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
                            <td style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'}; position: sticky; left: 0; z-index: 2; background-color: #fff; border-right: 2px solid #dee2e6;"><strong>Wettkampf Titel</strong></td>
                            ${filteredHeaderCols.map((c, colIndex) => {
                                const val = grid[2][c] || '';
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                                const inputStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                                return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}"><input type="text" class="form-control form-control-sm write-protected text-center" style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} value="${escapeHtml(val)}" onchange="handleCellEdit(2, ${c}, this.value)"></td>`;
                            }).join('')}
                        </tr>
                        <!-- Max Werte (Zeile 4) -->
                        <tr>
                            <td style="width: ${hasStatusCol ? '340px' : '240px'}; min-width: ${hasStatusCol ? '340px' : '240px'}; max-width: ${hasStatusCol ? '340px' : '240px'}; position: sticky; left: 0; z-index: 2; background-color: #fff; border-right: 2px solid #dee2e6;"><strong>Max. Punkte</strong></td>
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
    let ligenHtml = buildLigaTable("Liga 1", grid, 5, 12, canWrite, hasStatusCol, statusColIndex, visibleShooterCols, maxPercent);
    
    // LIGA 2
    ligenHtml += buildLigaTable("Liga 2", grid, 15, grid.length - 1, canWrite, hasStatusCol, statusColIndex, visibleShooterCols, maxPercent);

    // Bootstrap Tab-Layout mit Ansichts-Umschalter (Punkte / % / Kombi)
    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <ul class="nav nav-tabs border-bottom-0 mb-0" id="jmTab" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active fw-bold text-dark px-4 py-2 border-0" id="ligen-tab" data-bs-toggle="tab" data-bs-target="#ligen-pane" type="button" role="tab" style="border-radius: var(--radius-sm) var(--radius-sm) 0 0; margin-right: 4px; background: rgba(0,0,0,0.03);">
                        <i class="fas fa-list-ol me-2"></i>1. & 2. Liga
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link fw-bold text-dark px-4 py-2 border-0" id="junioren-tab" data-bs-toggle="tab" data-bs-target="#junioren-pane" type="button" role="tab" style="border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: rgba(0,0,0,0.03);" onclick="renderJuniorenTabContent()">
                        <i class="fas fa-user-graduate me-2"></i>Junioren-Wertung (U21)
                    </button>
                </li>
            </ul>
            <div class="d-flex align-items-center gap-2">
                <span class="small text-muted fw-semibold me-1"><i class="fas fa-eye me-1"></i>Wertung:</span>
                <div class="btn-group btn-group-sm rounded-pill shadow-xs p-1 bg-white border" role="group" aria-label="Ansichtsmodus">
                    <button type="button" class="btn btn-sm rounded-pill px-3 fw-semibold ${jmViewMode === 'points' ? 'btn-primary' : 'btn-light text-muted'}" onclick="setJMViewMode('points')" title="Punkte anzeigen">
                        <i class="fas fa-bullseye me-1"></i>Punkte
                    </button>
                    <button type="button" class="btn btn-sm rounded-pill px-3 fw-semibold ${jmViewMode === 'percent' ? 'btn-primary' : 'btn-light text-muted'}" onclick="setJMViewMode('percent')" title="Berechnete Prozente (%) anzeigen">
                        <i class="fas fa-percent me-1"></i>Prozent (%)
                    </button>
                    <button type="button" class="btn btn-sm rounded-pill px-3 fw-semibold ${jmViewMode === 'both' ? 'btn-primary' : 'btn-light text-muted'}" onclick="setJMViewMode('both')" title="Punkte und Prozente gleichzeitig anzeigen">
                        <i class="fas fa-columns me-1"></i>Punkte &amp; %
                    </button>
                </div>
            </div>
        </div>
        <div class="tab-content" id="jmTabContent">
            <div class="tab-pane fade show active" id="ligen-pane" role="tabpanel" aria-labelledby="ligen-tab">
                <!-- Allgemeine Einstellungen -->
                ${settingsHtml}
                ${ligenHtml}
            </div>
            <div class="tab-pane fade" id="junioren-pane" role="tabpanel" aria-labelledby="junioren-tab">
                <div class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Lade Junioren-Daten...</div>
            </div>
        </div>
    `;

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

function buildLigaTable(title, grid, startRow, endRow, canWrite, hasStatusCol, statusColIndex, visibleShooterCols, maxPercent) {
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
    const colStreich = hasStatusCol ? 32 : 31;
    shooterRows.sort((a, b) => {
        const valA = parseFloat(String(a.rowData[totalCol] || '').replace(/%/g, '').trim()) || 0;
        const valB = parseFloat(String(b.rowData[totalCol] || '').replace(/%/g, '').trim()) || 0;
        return valB - valA;
    });

    for (const s of shooterRows) {
        const r = s.rowIndex;
        const vorname = s.rowData[2] || '';
        const nachname = s.rowData[1] || '';
        const shooterStreich = parseFloat(String(s.rowData[colStreich] || '0').replace(',', '.')) || 0;

        let statusTd = '';
        if (hasStatusCol && statusColIndex !== -1) {
            const statusVal = s.rowData[statusColIndex] || '';
            let badgeClass = 'bg-secondary';
            if (statusVal.includes('Aufstieg')) badgeClass = 'bg-success';
            if (statusVal.includes('Abstieg')) badgeClass = 'bg-danger';
            statusTd = `<td style="width: 100px; min-width: 100px; max-width: 100px;"><span class="badge ${badgeClass}">${escapeHtml(statusVal)}</span></td>`;
        }

        tbodyHtml += `<tr data-row="${r}">
            <td style="cursor: grab; width: 40px; min-width: 40px; max-width: 40px; position: sticky; left: 0; z-index: 2; background-color: #fff;" class="text-center text-muted"><i class="fas fa-grip-lines tk-drag-handle"></i></td>
            <td class="fw-bold" style="width: 200px; min-width: 200px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: sticky; left: 40px; z-index: 2; background-color: #fff; border-right: 2px solid #dee2e6;">${escapeHtml(vorname)} ${escapeHtml(nachname)}</td>
            ${statusTd}
            ${visibleShooterCols.map((c, colIndex) => {
                let val = s.rowData[c] || '';
                if (typeof val === 'string' && (val.includes('#NUM!') || val.includes('#REF!'))) {
                    val = '';
                }
                const colTitle = String(grid[2][c] || '').trim().toLowerCase();
                const isAuswaertiges = colTitle.includes('auswärts') || colTitle.includes('ausw');
                const isPercent = colTitle.includes('%');
                const isTotal = colTitle.includes('total') || colTitle === 'tot' || colTitle === 't';
                const isMannschaft = colTitle.includes('mannschaft');
                
                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                const inputStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                
                if (isTotal) {
                    const totalBg = (colIndex % 2 === 1) ? 'background-color: #e2e6ea;' : '';
                    const totalText = val !== '' ? (escapeHtml(val) + ' %') : '0.00 %';
                    return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}">
                        <input type="text" class="form-control form-control-sm fw-bold text-center text-primary" style="width: 100%; ${totalBg}" readonly value="${totalText}">
                    </td>`;
                }

                // Prozentwert für die Zelle ermitteln
                let pct = 0;
                let pctStr = '';
                const rawNum = parseFloat(String(val).replace(',', '.'));
                if (!isNaN(rawNum) && rawNum > 0) {
                    pct = getColumnPercentage(grid, r, c, hasStatusCol);
                    if (pct > 0) {
                        pctStr = (Math.round(pct * 100) / 100).toFixed(2) + '%';
                    }
                }

                // Prüfen ob dieser Wettkampf das Streichresultat des Schützen ist
                const isStreich = (pct > 0 && shooterStreich > 0 && Math.abs(pct - shooterStreich) < 0.05);

                let cellContent = '';

                if (isAuswaertiges || isPercent) {
                    const calcBg = (colIndex % 2 === 1) ? 'background-color: #e2e6ea;' : '';
                    let displayVal = escapeHtml(val);
                    if (jmViewMode === 'percent' && pctStr) displayVal = pctStr;

                    cellContent = `
                        <input type="text" class="form-control form-control-sm write-protected cursor-pointer text-center" 
                               style="width: 100%; ${calcBg}" readonly value="${displayVal}" 
                               title="${pctStr ? `Wert: ${escapeHtml(val)} | Prozent: ${pctStr}` : ''}"
                               onclick="${canWrite ? `openAuswaertigesCalculator(${r}, ${c})` : ''}">
                    `;
                    if (jmViewMode === 'both' && pctStr) {
                        cellContent += `
                            <div class="mt-1 d-flex justify-content-center">
                                <span class="badge ${isStreich ? 'bg-warning-subtle text-danger border border-warning' : 'bg-primary-subtle text-primary border border-primary-subtle'} px-1 py-0" 
                                      style="font-size: 10px; font-weight: 600;" 
                                      title="${isStreich ? `Streichresultat (-${shooterStreich}%)` : `Prozentwert: ${pctStr}`}">
                                    ${isStreich ? '<i class="fas fa-strikethrough me-1"></i>' : ''}${pctStr}
                                </span>
                            </div>
                        `;
                    }
                } else if (jmViewMode === 'percent') {
                    // Modus Prozent: Zeigt die berechneten % an
                    const displayVal = pctStr || (val ? '0%' : '–');
                    cellContent = `
                        <div class="position-relative">
                            <input type="text" class="form-control form-control-sm text-center fw-bold ${pct > 0 ? (isStreich ? 'text-danger text-decoration-line-through' : 'text-primary') : 'text-muted'}" 
                                   style="width: 100%; ${inputStyle}" readonly value="${displayVal}"
                                   title="${escapeHtml(val)} Punkte (Max: ${grid[3][c] || '–'})${isStreich ? ' [Streichresultat]' : ''}">
                        </div>
                    `;
                } else if (jmViewMode === 'both') {
                    // Modus Kombi: Punkte-Eingabefeld + kompakter Prozent-Badge
                    cellContent = `
                        <div class="d-flex flex-column align-items-center">
                            <input type="text" class="form-control form-control-sm write-protected text-center ${isStreich ? 'text-decoration-line-through text-muted' : ''}" 
                                   style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} 
                                   value="${escapeHtml(val)}" onchange="handleCellEdit(${r}, ${c}, this.value, this)">
                            <div class="mt-1" style="min-height: 16px;">
                                ${pctStr ? `
                                    <span class="badge ${isStreich ? 'bg-warning-subtle text-danger border border-warning' : 'bg-primary-subtle text-primary border border-primary-subtle'} px-1 py-0" 
                                          style="font-size: 10px; font-weight: 600;" 
                                          title="${isStreich ? `Streichresultat (-${shooterStreich}%)` : `Prozentwert: ${pctStr}`}">
                                        ${isStreich ? '<i class="fas fa-strikethrough me-1"></i>' : ''}${pctStr}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    `;
                } else {
                    // Modus Standard (Punkte)
                    cellContent = `
                        <input type="text" class="form-control form-control-sm write-protected text-center ${isStreich ? 'text-muted' : ''}" 
                               style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} 
                               value="${escapeHtml(val)}" 
                               title="${pctStr ? `Prozent: ${pctStr}` : ''}"
                               onchange="handleCellEdit(${r}, ${c}, this.value, this)">
                    `;
                }

                return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}">${cellContent}</td>`;
            }).join('')}
        </tr>`;
    }

    const tbodyId = title.replace(/\s+/g, '-').toLowerCase();
    const statusTh = hasStatusCol ? `<th style="width: 100px; min-width: 100px; max-width: 100px;">Status</th>` : '';

    return `
        <div class="card rounded-4 border-0 shadow-sm mb-4">
            <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
                <h5 class="mb-0 fw-bold text-primary"><i class="fas fa-trophy text-warning me-2"></i>${title}</h5>
                <span class="badge bg-light text-muted border"><i class="fas fa-arrows-alt-v me-1"></i>Drag & Drop zum Verschieben</span>
            </div>
            <div class="card-body p-0 overflow-auto">
                <table class="table table-hover table-sm align-middle mb-0" style="min-width: 800px; font-size: 0.9rem; table-layout: fixed;">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 40px; min-width: 40px; max-width: 40px; position: sticky; left: 0; z-index: 3; background-color: #f8f9fa;"></th>
                            <th style="width: 200px; min-width: 200px; max-width: 200px; position: sticky; left: 40px; z-index: 3; background-color: #f8f9fa; border-right: 2px solid #dee2e6;">Schütze</th>
                            ${statusTh}
                            ${visibleShooterCols.map((c, colIndex) => {
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #eef2f6;' : '';
                                let titleStr = grid[2][c] || ('Spalte '+(c+1));
                                if (c === totalCol) titleStr = `Total (max. ${maxPercent || 1000}%)`;
                                return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate" title="${escapeHtml(titleStr)}">${escapeHtml(titleStr)}</th>`;
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

function getCompCategory(c, hasStatusCol) {
    const normalCol = (hasStatusCol && c >= 6) ? c - 1 : c;
    if (normalCol === 6) return "Verbandsschiessen";
    if (normalCol === 7) return "Kantonalstich";
    if (normalCol === 8) return "Vereinswettschiessen";
    if ((normalCol >= 9 && normalCol <= 12) || (normalCol >= 33 && normalCol <= 39)) return "Mannschaftsschießen";
    if (normalCol === 13) return "Endschiessen";
    if (normalCol === 14) return "Auswärtiges 1";
    if (normalCol === 15) return "Auswärtiges 2";
    if (normalCol === 16) return "Eidgenössisches";
    return null;
}

function isCategoryExcluded(grid, category, hasStatusCol) {
    return jmJuniorExclusions[category] === true;
}

function getColumnPercentage(grid, r, c, hasStatusCol) {
    if (!grid || !grid[r]) return 0;
    const colTotal = hasStatusCol ? 19 : 18;
    const title = String(grid[2][c] || '').trim();
    if (!title || title.toLowerCase() === 'leer') return 0;

    // Sonderfall Auswärtiges 1 & 2
    const normalCol = (hasStatusCol && c >= 6) ? c - 1 : c;
    if (normalCol === 14) {
        const pctCol = hasStatusCol ? 28 : 27;
        return parseFloat(String(grid[r][pctCol] || '').replace(/%/g, '').trim()) || 0;
    }
    if (normalCol === 15) {
        const pctCol = hasStatusCol ? 29 : 28;
        return parseFloat(String(grid[r][pctCol] || '').replace(/%/g, '').trim()) || 0;
    }

    // 1. Suche nach korrespondierender Spalte '<Wettkampf> %'
    const pctCol = grid[2].findIndex((t, idx) => idx > colTotal && String(t || '').trim().toLowerCase() === (title.toLowerCase() + ' %'));
    if (pctCol !== -1 && grid[r][pctCol] !== undefined && grid[r][pctCol] !== '') {
        const p = parseFloat(String(grid[r][pctCol]).replace(/%/g, '').replace(',', '.').trim());
        if (!isNaN(p) && p > 0) return p;
    }

    // 2. Fallback: Punkte geteilt durch Max-Punkte
    const val = parseFloat(String(grid[r][c] || '').replace(',', '.').trim());
    const maxVal = parseFloat(String(grid[3][c] || '').replace(',', '.').trim());
    if (isNaN(val) || isNaN(maxVal) || maxVal <= 0) return 0;
    return (val / maxVal) * 100;
}

function renderJuniorenTabContent() {
    const grid = jmRawGrid;
    if (!grid || grid.length < 10) return;

    let canWrite = hasWriteAccess('jahresmeisterschaft');
    if (jmCurrentJahr !== "current") {
        canWrite = false;
    }

    // Statusspalte (Auf-/Abstieg) ermitteln
    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }

    const baseHeaderCols = [6,7,8,9,10,11,12,13,14,15,16,17, 41,42,43,44,45,46,47,48,49,50,51];
    const baseShooterCols = [6, 7, 8, 33, 34, 35, 36, 37, 38, 39, 13, 14, 15, 16, 17, 18, 27, 28, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];

    const activeHeaderCols = baseHeaderCols.map(c => (hasStatusCol && c >= 6) ? c + 1 : c);
    const activeShooterCols = baseShooterCols.map(c => (hasStatusCol && c >= 6) ? c + 1 : c);

    const limitIndex = hasStatusCol ? 42 : 41;
    const visibleShooterCols = activeShooterCols.filter(c => {
        if (c >= limitIndex && !hasValidTitle(grid, c)) return false;
        return isColumnActive(grid, c);
    });

    // 8 feste Kategorien definieren
    const juniorCategories = [
        "Verbandsschiessen",
        "Kantonalstich",
        "Vereinswettschiessen",
        "Mannschaftsschießen",
        "Endschiessen",
        "Auswärtiges 1",
        "Auswärtiges 2",
        "Eidgenössisches"
    ];

    // Schalter UI rendern
    let switchesHtml = `
        <div class="card shadow-sm mb-4">
            <div class="card-header bg-secondary text-white">
                <h5 class="mb-0"><i class="fas fa-sliders-h me-2"></i>Wettkämpfe für Junioren-Wertung filtern</h5>
            </div>
            <div class="card-body">
                <p class="small text-muted mb-3">Deaktiviere Schalter, um die entsprechenden Resultate aus dem Total der Junioren auszuschließen.</p>
                <div class="d-flex flex-wrap gap-4">
    `;

    juniorCategories.forEach(comp => {
        const isExcluded = isCategoryExcluded(grid, comp, hasStatusCol);
        switchesHtml += `
            <div class="form-check form-switch form-check-inline">
                <input class="form-check-input" type="checkbox" role="switch" id="switch-junior-${comp.replace(/\s+/g, '-')}" data-comp="${comp}" ${isExcluded ? '' : 'checked'} ${canWrite ? '' : 'disabled'} onchange="handleJuniorSwitchChange(this)">
                <label class="form-check-label fw-semibold" for="switch-junior-${comp.replace(/\s+/g, '-')}">${escapeHtml(comp)}</label>
            </div>
        `;
    });

    switchesHtml += `
                </div>
            </div>
        </div>
    `;

    // Junioren filtern & Berechnen
    let jahrgangColIdx = -1;
    if (grid[4]) {
        jahrgangColIdx = grid[4].findIndex(val => String(val || '').trim().toLowerCase() === 'jahrgang');
    }
    if (jahrgangColIdx === -1) jahrgangColIdx = 3;

    let currentYear = new Date().getFullYear();
    if (jmCurrentJahr && jmCurrentJahr !== "current") {
        currentYear = parseInt(jmCurrentJahr) || currentYear;
    }
    const juniors = [];
    const totalCol = hasStatusCol ? 19 : 18;

    for (let r = 5; r < grid.length; r++) {
        if (r === 13 || r === 14) continue; // Excluded rows
        if (!grid[r]) continue;
        const vorname = grid[r][2] || '';
        const nachname = grid[r][1] || '';
        if (!nachname && !vorname) continue;

        let jg = 0;
        const rawJg = grid[r][jahrgangColIdx];
        if (rawJg) {
            const match = String(rawJg).match(/\b(19|20)\d{2}\b/);
            jg = match ? parseInt(match[0]) : 0;
        }
        if (jg <= 0 || (currentYear - jg) > 21) continue;

        // Calculate virtual total
        let rawTotal = parseFloat(String(grid[r][totalCol] || '').replace(/%/g, '').trim()) || 0;
        let virtualTotal = rawTotal;

        // Subtraction columns (Verband, Kantonal, Vereinswett, Best 4 Mannschaft (9-12), Endschiessen, Auswaertiges 1-2, Eidgenoessisches)
        const subtractionCols = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        const activeSubtractionCols = subtractionCols.map(c => (hasStatusCol && c >= 6) ? c + 1 : c);

        activeSubtractionCols.forEach(c => {
            const cat = getCompCategory(c, hasStatusCol);
            if (!cat) return; // skip total, streich, raw external, etc.

            if (isCategoryExcluded(grid, cat, hasStatusCol)) {
                const colPct = getColumnPercentage(grid, r, c, hasStatusCol);
                virtualTotal -= colPct;
            }
        });

        juniors.push({
            rowIndex: r,
            vorname,
            nachname,
            jahrgang: jg,
            originalRow: grid[r],
            virtualTotal: Math.max(0, virtualTotal)
        });
    }

    // Sort juniors
    juniors.sort((a, b) => b.virtualTotal - a.virtualTotal);

    // Junioren-Tabelle rendern
    let tableHtml = `
        <div class="card shadow-sm mb-4">
            <div class="card-header bg-primary text-white">
                <h5 class="mb-0"><i class="fas fa-user-graduate me-2"></i>Rangliste U21 Junioren</h5>
            </div>
            <div class="card-body overflow-auto">
                <table class="table table-hover table-sm align-middle" style="min-width: 800px; font-size: 0.9rem; table-layout: fixed;">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 60px;">Rang</th>
                            <th style="width: 200px;">Schütze</th>
                            <th style="width: 80px;" class="text-center">Jahrgang</th>
                            <th style="width: 100px;" class="text-center">Virtuelles Total</th>
                            ${visibleShooterCols.map((c, colIndex) => {
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #eef2f6;' : '';
                                return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate" title="${escapeHtml(grid[2][c] || '')}">${escapeHtml(grid[2][c] || ('Spalte '+(c+1)))}</th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (juniors.length === 0) {
        tableHtml += `<tr><td colspan="${4 + visibleShooterCols.length}" class="text-center py-4 text-muted">Keine Junioren (U21) registriert oder aktiv.</td></tr>`;
    } else {
        juniors.forEach((jr, idx) => {
            tableHtml += `
                <tr>
                    <td class="fw-bold text-center">${idx + 1}</td>
                    <td class="fw-bold">${escapeHtml(jr.vorname)} ${escapeHtml(jr.nachname)}</td>
                    <td class="text-center">${jr.jahrgang}</td>
                    <td class="text-center text-primary fw-bold">${jr.virtualTotal.toFixed(2)} %</td>
                    ${visibleShooterCols.map((c, colIndex) => {
                        let val = jr.originalRow[c] || '';
                        if (typeof val === 'string' && (val.includes('#NUM!') || val.includes('#REF!'))) {
                            val = '-';
                        }
                        const colTitle = String(grid[2][c] || '').trim().toLowerCase();
                        const isTotal = colTitle.includes('total') || colTitle === 'tot' || colTitle === 't';
                        const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                        
                        const cat = getCompCategory(c, hasStatusCol);
                        const isExcluded = cat && isCategoryExcluded(grid, cat, hasStatusCol);
                        const cellStyle = isExcluded ? 'text-decoration: line-through; opacity: 0.5;' : '';
                        const tdBg = isTotal ? 'background-color: #e2e6ea;' : bgStyle;

                        return `<td class="text-center" style="width: 90px; min-width: 90px; max-width: 90px; ${tdBg}; ${cellStyle}">${escapeHtml(val)}</td>`;
                    }).join('')}
                </tr>
            `;
        });
    }

    tableHtml += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('junioren-pane').innerHTML = switchesHtml + tableHtml;
}
