// === SUB-MODUL: JAHRESMEISTERSCHAFT - UI ===

let jmViewMode = 'points'; // 'points' | 'percent' | 'both'
window.jmViewMode = jmViewMode;
let jmActiveTab = 'ligen'; // 'ligen' | 'junioren' | 'matrix'
window.jmActiveTab = jmActiveTab;

function jmSetActiveTab(tab) {
    jmActiveTab = tab;
    window.jmActiveTab = tab;
    if (tab === 'junioren') {
        renderJuniorenTabContent();
    } else if (tab === 'matrix') {
        renderMatrixTabContent();
    }
}
window.jmSetActiveTab = jmSetActiveTab;

function setJMViewMode(mode) {
    jmViewMode = mode;
    window.jmViewMode = mode;

    // Aktuellen Tab im DOM abfragen, um Zurückspringen zu verhindern
    const activeNav = document.querySelector('#jmTab .nav-link.active');
    if (activeNav && activeNav.id === 'junioren-tab') {
        jmActiveTab = 'junioren';
    } else if (activeNav && activeNav.id === 'matrix-tab') {
        jmActiveTab = 'matrix';
    } else if (activeNav && activeNav.id === 'ligen-tab') {
        jmActiveTab = 'ligen';
    }

    if (typeof jmRawGrid !== 'undefined' && Array.isArray(jmRawGrid) && jmRawGrid.length > 5) {
        renderJahresmeisterschaft(jmRawGrid);
    }
}
window.setJMViewMode = setJMViewMode;

function updateJMSaveButtonState(isSaving = false) {
    const saveBtn = document.getElementById('btn-save-jm') || document.querySelector('button[onclick="saveJahresmeisterschaftData()"]');
    if (!saveBtn) return;
    const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('jahresmeisterschaft') : true;
    if (jmCurrentJahr !== "current" || !canWrite) {
        saveBtn.disabled = true;
        saveBtn.classList.add('d-none');
        return;
    }
    const changeCount = (jmPendingUpdates.length || 0) + (jmPendingMoves.length || 0) + (jmExclusionsChanged ? 1 : 0);
    if (window.SaveButtonKit) {
        SaveButtonKit.update(saveBtn, {
            count: changeCount,
            canWrite: true,
            isSaving: isSaving
        });
    } else {
        saveBtn.classList.remove('d-none');
        if (isSaving) {
            saveBtn.disabled = true;
            saveBtn.className = 'btn btn-sm btn-warning write-protected fw-bold';
            saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Speichern...`;
        } else if (changeCount > 0) {
            saveBtn.disabled = false;
            saveBtn.className = 'btn btn-sm btn-warning write-protected fw-bold';
            saveBtn.innerHTML = `<i class="fas fa-save me-1"></i> Speichern (${changeCount})`;
        } else {
            saveBtn.disabled = true;
            saveBtn.className = 'btn btn-sm btn-outline-secondary write-protected';
            saveBtn.innerHTML = `💾 Gespeichert`;
        }
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
                <li><a class="dropdown-item text-primary fw-semibold" href="#" onclick="openJMStandblattInboxModal()"><i class="fas fa-inbox me-2"></i>Eingereichte Standblätter...</a></li>
                <li><a class="dropdown-item text-success fw-semibold" href="#" onclick="openJMImportModal()"><i class="fas fa-file-import me-2"></i>Resultate importieren...</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-warning" href="#" onclick="runJMAction('archiviereJahresmeisterschaft', 'Jahr archivieren')"><i class="fas fa-archive me-2"></i>Archivieren (Aktuelles Jahr)</a></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="runJMAction('jahresmeisterschaftZuruecksetzen', 'Neues Jahr starten')"><i class="fas fa-calendar-plus me-2"></i>Neues Jahr starten (Saisonwechsel &amp; Auf-/Abstieg)</a></li>
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

    // Tabs definieren mit Berücksichtigung von jmActiveTab
    const isLigenActive = (jmActiveTab === 'ligen');
    const isJuniorenActive = (jmActiveTab === 'junioren');
    const isMatrixActive = (jmActiveTab === 'matrix');

    // Bootstrap Tab-Layout mit Ansichts-Umschalter (Punkte / % / Kombi)
    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <ul class="nav nav-tabs border-bottom-0 mb-0" id="jmTab" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${isLigenActive ? 'active' : ''} fw-bold text-dark px-4 py-2 border-0" id="ligen-tab" data-bs-toggle="tab" data-bs-target="#ligen-pane" type="button" role="tab" style="border-radius: var(--radius-sm) var(--radius-sm) 0 0; margin-right: 4px; background: rgba(0,0,0,0.03);" onclick="jmSetActiveTab('ligen')">
                        <i class="fas fa-list-ol me-2"></i>1. & 2. Liga
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${isJuniorenActive ? 'active' : ''} fw-bold text-dark px-4 py-2 border-0" id="junioren-tab" data-bs-toggle="tab" data-bs-target="#junioren-pane" type="button" role="tab" style="border-radius: var(--radius-sm) var(--radius-sm) 0 0; margin-right: 4px; background: rgba(0,0,0,0.03);" onclick="jmSetActiveTab('junioren')">
                        <i class="fas fa-user-graduate me-2"></i>Junioren-Wertung (U21)
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${isMatrixActive ? 'active' : ''} fw-bold text-dark px-4 py-2 border-0" id="matrix-tab" data-bs-toggle="tab" data-bs-target="#matrix-pane" type="button" role="tab" style="border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: rgba(0,0,0,0.03);" onclick="jmSetActiveTab('matrix')">
                        <i class="fas fa-table me-2"></i>Gesamt-Matrix (Alle Spalten)
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
            <div class="tab-pane fade ${isLigenActive ? 'show active' : ''}" id="ligen-pane" role="tabpanel" aria-labelledby="ligen-tab">
                <!-- Allgemeine Einstellungen -->
                ${settingsHtml}
                ${ligenHtml}
            </div>
            <div class="tab-pane fade ${isJuniorenActive ? 'show active' : ''}" id="junioren-pane" role="tabpanel" aria-labelledby="junioren-tab">
                <div class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Lade Junioren-Daten...</div>
            </div>
            <div class="tab-pane fade ${isMatrixActive ? 'show active' : ''}" id="matrix-pane" role="tabpanel" aria-labelledby="matrix-tab">
                <div class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Lade Gesamt-Matrix...</div>
            </div>
        </div>
    `;

    document.getElementById('jahresmeisterschaft-container').innerHTML = html;

    // Drag & Drop unter dem Jahr deaktiviert (Auf- und Abstieg erfolgt kontrolliert beim Saisonwechsel)
    
    // Check sizes initially
    checkLigaSizes();

    // Falls der Junioren- oder Matrix-Tab aktiv war, Inhalt sofort rendern
    if (isJuniorenActive) {
        renderJuniorenTabContent();
    } else if (isMatrixActive) {
        renderMatrixTabContent();
    }
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
    
    const limitIndex = hasStatusCol ? 42 : 41;
    const rawStart = hasStatusCol ? 34 : 33;
    const rawEnd = hasStatusCol ? 40 : 39;
    const rawCols = [rawStart, rawStart + 1, rawStart + 2, rawStart + 3, rawStart + 4, rawStart + 5, rawStart + 6];

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
        let streichMarked = false; // Garantiert, dass bei identischen Tiefstwerten visuell nur genau 1 Resultat gestrichen wird

        // Die 4 besten Mannschaftsrunden für diesen Schützen ermitteln
        const mRounds = [];
        rawCols.forEach(colIdx => {
            const rawVal = s.rowData[colIdx];
            const num = parseFloat(String(rawVal || '').replace(',', '.'));
            if (!isNaN(num) && num > 0) {
                mRounds.push({ col: colIdx, score: num });
            }
        });
        mRounds.sort((a, b) => b.score - a.score);
        const top4MannschaftCols = new Set(mRounds.slice(0, 4).map(item => item.col));

        let statusTd = '';
        if (hasStatusCol && statusColIndex !== -1) {
            const statusVal = String(s.rowData[statusColIndex] || '').trim();
            let badgeHtml = '';
            if (statusVal.includes('Aufstieg')) {
                badgeHtml = `<span class="badge bg-success">${escapeHtml(statusVal)}</span>`;
            } else if (statusVal.includes('Abstieg')) {
                badgeHtml = `<span class="badge bg-danger">${escapeHtml(statusVal)}</span>`;
            } else if (statusVal !== '') {
                badgeHtml = `<span class="badge bg-secondary">${escapeHtml(statusVal)}</span>`;
            }
            statusTd = `<td style="width: 100px; min-width: 100px; max-width: 100px;" class="text-center">${badgeHtml}</td>`;
        }

        tbodyHtml += `<tr data-row="${r}">
            <td class="fw-bold" style="width: 200px; min-width: 200px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: sticky; left: 0; z-index: 2; background-color: #fff; border-right: 2px solid #dee2e6;">${escapeHtml(vorname)} ${escapeHtml(nachname)}</td>
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

                // Auswärtsschiessen (ab Spalte limitIndex / 41 bzw. 42) sind reine Punkteresultate (z. B. 95)
                const isSingleAuswaertig = (c >= limitIndex);
                if (isSingleAuswaertig) {
                    return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}">
                        <input type="text" class="form-control form-control-sm write-protected text-center" 
                               style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} 
                               value="${escapeHtml(val)}" 
                               title="${escapeHtml(grid[2][c] || '')}: ${escapeHtml(val)} Punkte" 
                               onchange="handleCellEdit(${r}, ${c}, this.value, this)">
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

                // Prüfen auf Mannschaftsrunde (Top 4 vs Streichrunde)
                const isRawMannschaft = (c >= rawStart && c <= rawEnd);
                let isMannschaftStreich = false;
                let isCountedMannschaft = false;
                if (isRawMannschaft && rawNum > 0) {
                    if (top4MannschaftCols.has(c)) {
                        isCountedMannschaft = true;
                    } else {
                        isMannschaftStreich = true;
                    }
                }

                // Prüfen ob dieser Wettkampf das Haupt-Streichresultat des Schützen ist (genau ein Treffer!)
                // WICHTIG: Gilt nur für Meisterschaftswettkämpfe, NICHT für die Rohrunden der Mannschaft!
                let isStreich = false;
                if (!isRawMannschaft && !streichMarked && pct > 0 && shooterStreich > 0 && Math.abs(pct - shooterStreich) < 0.05) {
                    isStreich = true;
                    streichMarked = true;
                }

                let cellContent = '';

                const normalCol = (hasStatusCol && c >= 6) ? c - 1 : c;
                const isTopAuswaertiges = (normalCol === 14 || normalCol === 15);

                if (isTopAuswaertiges || isPercent) {
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
                    const isStruck = isStreich || isMannschaftStreich;
                    const isGreen = isCountedMannschaft && !isStruck;
                    cellContent = `
                        <div class="position-relative">
                            <input type="text" class="form-control form-control-sm text-center ${isStruck ? 'text-muted text-decoration-line-through opacity-75' : (isGreen ? 'text-success fw-bold' : (pct > 0 ? 'text-primary fw-bold' : 'text-muted'))}" 
                                   style="width: 100%; ${inputStyle}" readonly value="${displayVal}"
                                   title="${escapeHtml(val)} Punkte (Max: ${grid[3][c] || '–'})${isMannschaftStreich ? ' [SMM Streichrunde (zählt nicht)]' : (isCountedMannschaft ? ' [Top 4 SMM gewertet]' : (isStreich ? ' [Haupt-Streichresultat]' : ''))}">
                        </div>
                    `;
                } else if (jmViewMode === 'both') {
                    // Modus Kombi: Punkte-Eingabefeld + intelligenter Badge
                    const isStruck = isStreich || isMannschaftStreich;
                    let badgeClass = 'bg-primary-subtle text-primary border border-primary-subtle';
                    let badgeTitle = `Prozentwert: ${pctStr}`;
                    let badgeIcon = '';
                    if (isMannschaftStreich) {
                        badgeClass = 'bg-secondary-subtle text-muted border border-secondary-subtle text-decoration-line-through';
                        badgeTitle = 'Streichrunde SMM (zählt nicht)';
                        badgeIcon = '<i class="fas fa-strikethrough me-1"></i>';
                    } else if (isCountedMannschaft) {
                        badgeClass = 'bg-success-subtle text-success border border-success-subtle';
                        badgeTitle = 'Zählt für Jahresmeisterschaft (Top 4 SMM)';
                        badgeIcon = '<i class="fas fa-check me-1"></i>';
                    } else if (isStreich) {
                        badgeClass = 'bg-warning-subtle text-danger border border-warning';
                        badgeTitle = `Haupt-Streichresultat (-${shooterStreich}%)`;
                        badgeIcon = '<i class="fas fa-strikethrough me-1"></i>';
                    }

                    cellContent = `
                        <div class="d-flex flex-column align-items-center">
                            <input type="text" class="form-control form-control-sm write-protected text-center ${isStruck ? 'text-decoration-line-through text-muted opacity-75' : (isCountedMannschaft ? 'fw-semibold' : '')}" 
                                   style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} 
                                   value="${escapeHtml(val)}" onchange="handleCellEdit(${r}, ${c}, this.value, this)">
                            <div class="mt-1" style="min-height: 16px;">
                                ${pctStr ? `
                                    <span class="badge ${badgeClass} px-1 py-0" 
                                          style="font-size: 10px; font-weight: 600;" 
                                          title="${badgeTitle}">
                                        ${badgeIcon}${pctStr}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    `;
                } else {
                    // Modus Standard (Punkte)
                    const isStruck = isStreich || isMannschaftStreich;
                    let titleNote = '';
                    if (isMannschaftStreich) titleNote = ' | Streichrunde SMM (zählt nicht)';
                    else if (isCountedMannschaft) titleNote = ' | Top 4 SMM gewertet';
                    else if (isStreich) titleNote = ' | Haupt-Streichresultat';

                    cellContent = `
                        <input type="text" class="form-control form-control-sm write-protected text-center ${isStruck ? 'text-muted text-decoration-line-through opacity-75' : (isCountedMannschaft ? 'fw-bold' : '')}" 
                               style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} 
                               value="${escapeHtml(val)}" 
                               title="${pctStr ? `Prozent: ${pctStr}` : ''}${titleNote}"
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
            </div>
            <div class="card-body p-0 overflow-auto">
                <table class="table table-hover table-sm align-middle mb-0" style="min-width: 800px; font-size: 0.9rem; table-layout: fixed;">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 200px; min-width: 200px; max-width: 200px; position: sticky; left: 0; z-index: 3; background-color: #f8f9fa; border-right: 2px solid #dee2e6;">Schütze</th>
                            ${statusTh}
                            ${visibleShooterCols.map((c, colIndex) => {
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #eef2f6;' : '';
                                let titleStr = grid[2][c] || ('Spalte '+(c+1));
                                let headerHtml = escapeHtml(titleStr);
                                let thTitle = titleStr;
                                if (c === totalCol) {
                                    titleStr = `Total (max. ${maxPercent || 1000}%)`;
                                    headerHtml = escapeHtml(titleStr);
                                    thTitle = titleStr;
                                } else if (c >= rawStart && c <= rawEnd) {
                                    const rNum = c - rawStart + 1;
                                    thTitle = `Mannschaftsmeisterschaft Runde ${rNum} (Die besten 4 Runden zählen)`;
                                    headerHtml = `<div class="d-flex flex-column align-items-center" style="line-height: 1.1;"><span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-1 py-0 mb-1" style="font-size: 8px; font-weight: 700;">SMM</span><span>R${rNum}</span></div>`;
                                }
                                return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate align-middle" title="${escapeHtml(thTitle)}">${headerHtml}</th>`;
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

function getCompCategory(c, hasStatusCol, grid = (typeof jmRawGrid !== 'undefined' ? jmRawGrid : null)) {
    if (!grid || !grid[2]) return null;
    const colTotal = hasStatusCol ? 19 : 18;
    const firstCompCol = hasStatusCol ? 7 : 6;
    const normalCol = (hasStatusCol && c >= 6) ? c - 1 : c;

    // Fix verdrahtet ist ausschliesslich die Mannschaft (Spalten 9..12 bzw. Runden 33..39)
    if ((normalCol >= 9 && normalCol <= 12) || (normalCol >= 33 && normalCol <= 39)) {
        return "Mannschaft";
    }

    // Alle anderen Meisterschafts-Wettkämpfe vor TOTAL nehmen ihren Namen dynamisch aus Zeile 3 (grid[2][c])
    if (c >= firstCompCol && c < colTotal) {
        const title = String(grid[2][c] || '').trim();
        return title || (`Spalte ${c + 1}`);
    }

    return null;
}

function isCategoryExcluded(grid, category, hasStatusCol) {
    if (!category) return false;
    // Unterstützung für "Mannschaft" sowie historisches "Mannschaftsschießen"
    if (category === "Mannschaft" || category === "Mannschaftsschießen") {
        return jmJuniorExclusions["Mannschaft"] === true || jmJuniorExclusions["Mannschaftsschießen"] === true;
    }
    return jmJuniorExclusions[category] === true;
}

function getJuniorCategories(grid, hasStatusCol) {
    if (!grid || !grid[2]) return [];
    const colTotal = hasStatusCol ? 19 : 18;
    const firstCompCol = hasStatusCol ? 7 : 6;
    const categories = [];
    const seen = new Set();

    for (let c = firstCompCol; c < colTotal; c++) {
        const cat = getCompCategory(c, hasStatusCol, grid);
        if (cat && !seen.has(cat)) {
            seen.add(cat);
            categories.push(cat);
        }
    }
    return categories;
}

function getColumnPercentage(grid, r, c, hasStatusCol) {
    if (!grid || !grid[r]) return 0;
    const colTotal = hasStatusCol ? 19 : 18;
    const limitIndex = hasStatusCol ? 42 : 41;

    // Auswärtsschiessen ab limitIndex sind reine Punkteresultate ohne Prozentwert
    if (c >= limitIndex) {
        return 0;
    }

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

    // Sonderfall Roh-Mannschaftsrunden 33..39 (bzw. 34..40):
    // Maximum ist 200 Punkte; darf NICHT in den Spalten 'Mannschaft #1..#4 %' nachgeschlagen werden!
    const rawStart = hasStatusCol ? 34 : 33;
    const rawEnd = hasStatusCol ? 40 : 39;
    if (c >= rawStart && c <= rawEnd) {
        const val = parseFloat(String(grid[r][c] || '').replace(',', '.').trim());
        const maxVal = parseFloat(String(grid[3][c] || '').replace(',', '.').trim()) || 200;
        if (isNaN(val) || val <= 0 || isNaN(maxVal) || maxVal <= 0) return 0;
        return (val / maxVal) * 100;
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

    // Dynamische Kategorien aus Zeile 3 ermitteln (nur Mannschaft fix verdrahtet)
    const juniorCategories = getJuniorCategories(grid, hasStatusCol);

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
        const switchId = 'switch-junior-' + comp.replace(/[^a-zA-Z0-9_-]/g, '_');
        switchesHtml += `
            <div class="form-check form-switch form-check-inline">
                <input class="form-check-input" type="checkbox" role="switch" id="${switchId}" data-comp="${escapeHtml(comp)}" ${isExcluded ? '' : 'checked'} ${canWrite ? '' : 'disabled'} onchange="handleJuniorSwitchChange(this)">
                <label class="form-check-label fw-semibold" for="${switchId}">${escapeHtml(comp)}</label>
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
    const firstCompCol = hasStatusCol ? 7 : 6;

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

        // Subtraktions-Spalten dynamisch von firstCompCol bis vor totalCol
        for (let c = firstCompCol; c < totalCol; c++) {
            const cat = getCompCategory(c, hasStatusCol, grid);
            if (!cat) continue;

            if (isCategoryExcluded(grid, cat, hasStatusCol)) {
                const colPct = getColumnPercentage(grid, r, c, hasStatusCol);
                virtualTotal -= colPct;
            }
        }

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
                        
                        const cat = getCompCategory(c, hasStatusCol, grid);
                        const isExcluded = cat && isCategoryExcluded(grid, cat, hasStatusCol);
                        const cellStyle = isExcluded ? 'text-decoration: line-through; opacity: 0.5;' : '';
                        const tdBg = isTotal ? 'background-color: #e2e6ea;' : bgStyle;

                        let displayVal = escapeHtml(val);
                        const isSingleAuswaertig = (c >= limitIndex);
                        if (!isTotal && val !== '' && val !== '-' && !isSingleAuswaertig) {
                            const pct = getColumnPercentage(grid, jr.rowIndex, c, hasStatusCol);
                            const pctStr = pct > 0 ? (Math.round(pct * 100) / 100).toFixed(2) + '%' : '';
                            if (jmViewMode === 'percent' && pctStr) {
                                displayVal = `<span class="fw-bold text-primary">${pctStr}</span>`;
                            } else if (jmViewMode === 'both' && pctStr) {
                                displayVal = `
                                    <div class="d-flex flex-column align-items-center">
                                        <span>${escapeHtml(val)}</span>
                                        <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-1 py-0 mt-1" style="font-size: 10px; font-weight: 600;">${pctStr}</span>
                                    </div>
                                `;
                            }
                        }

                        return `<td class="text-center" style="width: 90px; min-width: 90px; max-width: 90px; ${tdBg}; ${cellStyle}">${displayVal}</td>`;
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

// === GESAMT-MATRIX (ALLE SPALTEN) ===
window._jmMatrixShowPct = false;

function renderMatrixTabContent() {
    const pane = document.getElementById('matrix-pane');
    if (!pane) return;
    const grid = jmRawGrid;
    if (!grid || grid.length < 6) {
        pane.innerHTML = '<div class="alert alert-warning">Keine Daten für die Gesamt-Matrix verfügbar.</div>';
        return;
    }

    let canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('jahresmeisterschaft') : true;
    if (jmCurrentJahr !== "current") {
        canWrite = false;
    }

    // Statusspalte ermitteln
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

    const colTotal = hasStatusCol ? 19 : 18;
    const colStreich = hasStatusCol ? 32 : 31;
    const rawStart = hasStatusCol ? 34 : 33;
    const rawEnd = hasStatusCol ? 40 : 39;
    const limitIndex = hasStatusCol ? 42 : 41;

    // Spaltengruppen definieren:
    // 1. Hauptwettkämpfe (Verband, Kantonalstich, Vereinswettkampf, Endschiessen, evtl. Eidgenössisches)
    const hauptCols = [];
    [hasStatusCol ? 7 : 6, hasStatusCol ? 8 : 7, hasStatusCol ? 9 : 8, hasStatusCol ? 14 : 13, hasStatusCol ? 17 : 16].forEach(c => {
        if (c < grid[2].length && hasValidTitle(grid, c)) {
            hauptCols.push(c);
        }
    });

    // 2. Top 4 Mannschaft
    const top4Cols = [
        hasStatusCol ? 10 : 9,
        hasStatusCol ? 11 : 10,
        hasStatusCol ? 12 : 11,
        hasStatusCol ? 13 : 12
    ];

    // 3. SMM Runden 1 bis 7
    const smmCols = [];
    for (let c = rawStart; c <= rawEnd; c++) {
        if (c < grid[2].length) {
            smmCols.push(c);
        }
    }

    // 4. Top 2 Auswärtige
    const topAuswCols = [
        hasStatusCol ? 15 : 14,
        hasStatusCol ? 16 : 15
    ];

    // 5. Alle Auswärtigen Schiessen
    const auswCols = [];
    for (let c = limitIndex; c < grid[2].length; c++) {
        if (hasValidTitle(grid, c) && isColumnActive(grid, c)) {
            auswCols.push(c);
        }
    }

    // 6. Roh-Prozentspalten (optional einblendbar)
    const showPct = Boolean(window._jmMatrixShowPct);
    const pctCols = [];
    if (showPct) {
        const startPct = hasStatusCol ? 20 : 19;
        const endPct = hasStatusCol ? 31 : 30;
        for (let c = startPct; c <= endPct; c++) {
            if (c < grid[2].length && hasValidTitle(grid, c)) {
                pctCols.push(c);
            }
        }
    }

    let matrixHtml = `
        <div class="card rounded-4 border-0 shadow-sm mb-4">
            <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <h5 class="mb-1 fw-bold text-primary"><i class="fas fa-table text-primary me-2"></i>Gesamt-Matrix (Alle Spalten)</h5>
                    <p class="text-muted small mb-0">Vollständige 2D-Übersicht aller Meisterschafts-, Mannschafts- (Top 4 &amp; R1–7) und Auswärtigen Resultate.</p>
                </div>
                <div class="d-flex align-items-center gap-3 flex-wrap">
                    <div class="form-check form-switch mb-0">
                        <input class="form-check-input" type="checkbox" id="matrix-toggle-pct" onchange="window._jmMatrixShowPct = this.checked; renderMatrixTabContent();" ${showPct ? 'checked' : ''}>
                        <label class="form-check-label small fw-semibold text-muted" for="matrix-toggle-pct">Roh-Prozentspalten einblenden</label>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1"><i class="fas fa-trophy me-1"></i>Meisterschaft</span>
                        <span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="fas fa-check-circle me-1"></i>Top 4 SMM</span>
                        <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1"><i class="fas fa-users me-1"></i>SMM R1–7</span>
                        <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1"><i class="fas fa-map-marker-alt me-1"></i>Auswärtige</span>
                        <span class="badge bg-dark text-white border px-2 py-1"><i class="fas fa-calculator me-1"></i>Total &amp; Streich</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    matrixHtml += buildMatrixLigaTable("Liga 1 (Gesamt-Matrix)", grid, 5, 12, canWrite, hasStatusCol, statusColIndex, hauptCols, top4Cols, smmCols, topAuswCols, auswCols, pctCols, showPct, colStreich, colTotal);
    matrixHtml += buildMatrixLigaTable("Liga 2 (Gesamt-Matrix)", grid, 15, grid.length - 1, canWrite, hasStatusCol, statusColIndex, hauptCols, top4Cols, smmCols, topAuswCols, auswCols, pctCols, showPct, colStreich, colTotal);

    pane.innerHTML = matrixHtml;
}
window.renderMatrixTabContent = renderMatrixTabContent;

function buildMatrixLigaTable(title, grid, startRow, endRow, canWrite, hasStatusCol, statusColIndex, hauptCols, top4Cols, smmCols, topAuswCols, auswCols, pctCols, showPct, colStreich, colTotal) {
    const rawStart = hasStatusCol ? 34 : 33;
    const rawEnd = hasStatusCol ? 40 : 39;
    const rawCols = [rawStart, rawStart + 1, rawStart + 2, rawStart + 3, rawStart + 4, rawStart + 5, rawStart + 6];

    const shooterRows = [];
    for (let r = startRow; r <= endRow; r++) {
        if (!grid[r]) continue;
        const vorname = grid[r][2] || '';
        const nachname = grid[r][1] || '';
        if (!nachname && !vorname) continue;
        shooterRows.push({ rowIndex: r, rowData: grid[r] });
    }

    shooterRows.sort((a, b) => {
        const valA = parseFloat(String(a.rowData[colTotal] || '').replace(/%/g, '').trim()) || 0;
        const valB = parseFloat(String(b.rowData[colTotal] || '').replace(/%/g, '').trim()) || 0;
        return valB - valA;
    });

    const allMatrixCols = [
        ...hauptCols,
        ...top4Cols,
        ...smmCols,
        ...topAuswCols,
        ...auswCols,
        ...(showPct ? pctCols : []),
        colStreich,
        colTotal
    ];

    let tbodyHtml = '';
    for (let sIdx = 0; sIdx < shooterRows.length; sIdx++) {
        const s = shooterRows[sIdx];
        const r = s.rowIndex;
        const vorname = s.rowData[2] || '';
        const nachname = s.rowData[1] || '';
        const shooterStreich = parseFloat(String(s.rowData[colStreich] || '0').replace(',', '.')) || 0;
        let streichMarked = false;

        // Top 4 SMM Runden für diesen Schützen ermitteln
        const mRounds = [];
        rawCols.forEach(colIdx => {
            const rawVal = s.rowData[colIdx];
            const num = parseFloat(String(rawVal || '').replace(',', '.'));
            if (!isNaN(num) && num > 0) {
                mRounds.push({ col: colIdx, score: num });
            }
        });
        mRounds.sort((a, b) => b.score - a.score);
        const top4MannschaftCols = new Set(mRounds.slice(0, 4).map(item => item.col));

        let statusTd = '';
        if (hasStatusCol && statusColIndex !== -1) {
            const statusVal = String(s.rowData[statusColIndex] || '').trim();
            let badgeHtml = '';
            if (statusVal.includes('Aufstieg')) {
                badgeHtml = `<span class="badge bg-success">${escapeHtml(statusVal)}</span>`;
            } else if (statusVal.includes('Abstieg')) {
                badgeHtml = `<span class="badge bg-danger">${escapeHtml(statusVal)}</span>`;
            } else if (statusVal !== '') {
                badgeHtml = `<span class="badge bg-secondary">${escapeHtml(statusVal)}</span>`;
            }
            statusTd = `<td style="width: 100px; min-width: 100px; max-width: 100px;" class="text-center">${badgeHtml}</td>`;
        }

        tbodyHtml += `<tr data-row="${r}">
            <td style="width: 40px; min-width: 40px; max-width: 40px; position: sticky; left: 0; z-index: 2; background-color: #fff;" class="text-center text-muted fw-bold">${sIdx + 1}</td>
            <td class="fw-bold" style="width: 200px; min-width: 200px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: sticky; left: 40px; z-index: 2; background-color: #fff; border-right: 2px solid #dee2e6;">${escapeHtml(vorname)} ${escapeHtml(nachname)}</td>
            ${statusTd}
            ${allMatrixCols.map((c, colIndex) => {
                let val = s.rowData[c] || '';
                if (typeof val === 'string' && (val.includes('#NUM!') || val.includes('#REF!'))) {
                    val = '';
                }
                const isTotal = (c === colTotal);
                const isStreichCol = (c === colStreich);
                const isRawMannschaft = (c >= rawStart && c <= rawEnd);
                const isTop4Mannschaft = top4Cols.includes(c);
                const isTopAusw = topAuswCols.includes(c);

                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';
                const inputStyle = (colIndex % 2 === 1) ? 'background-color: #f7f9fc;' : '';

                if (isTotal) {
                    const totalText = val !== '' ? (escapeHtml(val) + ' %') : '0.00 %';
                    return `<td style="width: 95px; min-width: 95px; max-width: 95px; background-color: #212529; color: #fff;">
                        <input type="text" class="form-control form-control-sm fw-bold text-center text-white bg-dark border-0" style="width: 100%;" readonly value="${totalText}">
                    </td>`;
                }

                if (isStreichCol) {
                    const streichText = val !== '' && parseFloat(val) > 0 ? (escapeHtml(val) + ' %') : '–';
                    return `<td style="width: 90px; min-width: 90px; max-width: 90px; background-color: #fff3cd;">
                        <input type="text" class="form-control form-control-sm fw-bold text-center text-danger border-warning" style="width: 100%; background-color: #fff3cd;" readonly value="${streichText}" title="Haupt-Streichresultat der Jahresmeisterschaft">
                    </td>`;
                }

                if (auswCols.includes(c)) {
                    // Auswärtige Schiessen sind reine Punkteresultate (z. B. 95)
                    return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}">
                        <input type="text" class="form-control form-control-sm write-protected text-center" 
                               style="width: 100%; ${inputStyle}" ${canWrite ? '' : 'disabled readonly'} 
                               value="${escapeHtml(val)}" 
                               title="${escapeHtml(grid[2][c] || '')}: ${escapeHtml(val)} Punkte" 
                               onchange="handleCellEdit(${r}, ${c}, this.value, this)">
                    </td>`;
                }

                // Prozentwert ermitteln
                let pct = 0;
                let pctStr = '';
                const rawNum = parseFloat(String(val).replace(',', '.'));
                if (!isNaN(rawNum) && rawNum > 0) {
                    pct = getColumnPercentage(grid, r, c, hasStatusCol);
                    if (pct > 0) {
                        pctStr = (Math.round(pct * 100) / 100).toFixed(2) + '%';
                    }
                }

                let isMannschaftStreich = false;
                let isCountedMannschaft = false;
                if (isRawMannschaft && rawNum > 0) {
                    if (top4MannschaftCols.has(c)) {
                        isCountedMannschaft = true;
                    } else {
                        isMannschaftStreich = true;
                    }
                }

                // Streich-Check für Hauptwettkämpfe
                let isStreich = false;
                if (!isRawMannschaft && !streichMarked && pct > 0 && shooterStreich > 0 && Math.abs(pct - shooterStreich) < 0.05) {
                    isStreich = true;
                    streichMarked = true;
                }

                // Farbliche Hervorhebung von Top 4 und Top Auswärtig
                let colCategoryStyle = inputStyle;
                if (isTop4Mannschaft) {
                    colCategoryStyle = 'background-color: #e8f5e9; font-weight: 600; color: #2e7d32;';
                } else if (isTopAusw) {
                    colCategoryStyle = 'background-color: #fffde7; font-weight: 600; color: #f57f17;';
                }

                let cellContent = '';
                if (jmViewMode === 'percent') {
                    let displayVal = pctStr || (val ? '0%' : '–');
                    cellContent = `
                        <input type="text" class="form-control form-control-sm text-center ${isMannschaftStreich || isStreich ? 'text-decoration-line-through text-muted opacity-75' : (isCountedMannschaft ? 'text-success fw-bold' : '')}" 
                               style="width: 100%; ${colCategoryStyle}" readonly value="${displayVal}"
                               title="${escapeHtml(val)} Punkte (Max: ${grid[3][c] || '–'})${isMannschaftStreich ? ' [SMM Streichrunde]' : (isStreich ? ' [Haupt-Streichresultat]' : '')}">
                    `;
                } else if (jmViewMode === 'both') {
                    let badgeHtml = '';
                    if (isMannschaftStreich && pctStr) {
                        badgeHtml = `<span class="badge bg-secondary-subtle text-muted border border-secondary-subtle px-1 py-0 text-decoration-line-through" style="font-size: 10px;" title="Streichrunde SMM (zählt nicht)"><i class="fas fa-strikethrough me-1"></i>${pctStr}</span>`;
                    } else if (isCountedMannschaft && pctStr) {
                        badgeHtml = `<span class="badge bg-success-subtle text-success border border-success-subtle px-1 py-0" style="font-size: 10px;" title="Zählt für Jahresmeisterschaft (Top 4 SMM)"><i class="fas fa-check me-1"></i>${pctStr}</span>`;
                    } else if (isStreich && pctStr) {
                        badgeHtml = `<span class="badge bg-warning-subtle text-danger border border-warning px-1 py-0" style="font-size: 10px;" title="Haupt-Streichresultat (-${shooterStreich}%)"><i class="fas fa-strikethrough me-1"></i>${pctStr}</span>`;
                    } else if (pctStr) {
                        badgeHtml = `<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-1 py-0" style="font-size: 10px;">${pctStr}</span>`;
                    }

                    cellContent = `
                        <div class="d-flex flex-column align-items-center">
                            <input type="text" class="form-control form-control-sm write-protected text-center ${isMannschaftStreich || isStreich ? 'text-decoration-line-through text-muted opacity-75' : ''}" 
                                   style="width: 100%; ${colCategoryStyle}" ${canWrite ? '' : 'disabled readonly'} 
                                   value="${escapeHtml(val)}" onchange="handleCellEdit(${r}, ${c}, this.value, this)">
                            <div class="mt-1" style="min-height: 16px;">
                                ${badgeHtml}
                            </div>
                        </div>
                    `;
                } else {
                    // Standard: Punkte
                    cellContent = `
                        <input type="text" class="form-control form-control-sm write-protected text-center ${isMannschaftStreich || isStreich ? 'text-muted text-decoration-line-through opacity-75' : ''}" 
                               style="width: 100%; ${colCategoryStyle}" ${canWrite ? '' : 'disabled readonly'} 
                               value="${escapeHtml(val)}" 
                               title="${pctStr ? `Prozent: ${pctStr}` : ''}${isMannschaftStreich ? ' [SMM Streichrunde]' : (isCountedMannschaft ? ' [Top 4 SMM]' : '')}"
                               onchange="handleCellEdit(${r}, ${c}, this.value, this)">
                    `;
                }

                return `<td style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}">${cellContent}</td>`;
            }).join('')}
        </tr>`;
    }

    const statusThTop = hasStatusCol ? `<th rowspan="2" style="width: 100px; min-width: 100px; max-width: 100px;" class="align-middle text-center bg-light">Status</th>` : '';

    return `
        <div class="card rounded-4 border-0 shadow-sm mb-4">
            <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
                <h5 class="mb-0 fw-bold text-primary"><i class="fas fa-trophy text-warning me-2"></i>${title}</h5>
                <span class="badge bg-light text-muted border"><i class="fas fa-arrows-alt-h me-1"></i>Horizontal scrollbar</span>
            </div>
            <div class="card-body p-0 overflow-auto">
                <table class="table table-hover table-sm align-middle mb-0" style="min-width: 1400px; font-size: 0.85rem; table-layout: fixed;">
                    <thead class="table-light">
                        <!-- Zeile 1: Gruppen-Header -->
                        <tr>
                            <th rowspan="2" style="width: 40px; min-width: 40px; max-width: 40px; position: sticky; left: 0; z-index: 4; background-color: #f8f9fa;" class="align-middle text-center">#</th>
                            <th rowspan="2" style="width: 200px; min-width: 200px; max-width: 200px; position: sticky; left: 40px; z-index: 4; background-color: #f8f9fa; border-right: 2px solid #dee2e6;" class="align-middle">Schütze</th>
                            ${statusThTop}
                            <th colspan="${hauptCols.length}" class="text-center bg-primary text-white py-1 fw-bold" style="font-size: 0.8rem;"><i class="fas fa-trophy me-1"></i>Haupt-Wettkämpfe</th>
                            <th colspan="${top4Cols.length}" class="text-center bg-success text-white py-1 fw-bold" style="font-size: 0.8rem;"><i class="fas fa-check-circle me-1"></i>Top 4 SMM (Gewertet)</th>
                            <th colspan="${smmCols.length}" class="text-center bg-info text-white py-1 fw-bold" style="font-size: 0.8rem;"><i class="fas fa-users me-1"></i>SMM Einzelrunden (1–7)</th>
                            <th colspan="${topAuswCols.length}" class="text-center bg-warning text-dark py-1 fw-bold" style="font-size: 0.8rem;"><i class="fas fa-star me-1"></i>Top Auswärtige</th>
                            <th colspan="${auswCols.length}" class="text-center bg-secondary text-white py-1 fw-bold" style="font-size: 0.8rem;"><i class="fas fa-map-marker-alt me-1"></i>Auswärtige Schiessen</th>
                            ${showPct ? `<th colspan="${pctCols.length}" class="text-center bg-light text-muted py-1 fw-bold" style="font-size: 0.8rem;">Roh-Prozente (%)</th>` : ''}
                            <th colspan="2" class="text-center bg-dark text-white py-1 fw-bold" style="font-size: 0.8rem;"><i class="fas fa-calculator me-1"></i>Wertung</th>
                        </tr>
                        <!-- Zeile 2: Spaltentitel & Max -->
                        <tr>
                            ${allMatrixCols.map((c, colIndex) => {
                                let titleStr = grid[2][c] || ('Spalte ' + (c + 1));
                                const maxPts = grid[3][c] ? ` (Max. ${grid[3][c]})` : '';
                                const bgStyle = (colIndex % 2 === 1) ? 'background-color: #eef2f6;' : '';

                                if (c === colTotal) {
                                    return `<th style="width: 95px; min-width: 95px; max-width: 95px; background-color: #212529; color: #fff;" class="text-center text-truncate align-middle" title="Gesamttotal in %">Total %</th>`;
                                }
                                if (c === colStreich) {
                                    return `<th style="width: 90px; min-width: 90px; max-width: 90px; background-color: #fff3cd; color: #856404;" class="text-center text-truncate align-middle" title="Haupt-Streichresultat">Streich %</th>`;
                                }
                                if (c >= rawStart && c <= rawEnd) {
                                    const rNum = c - rawStart + 1;
                                    return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate align-middle" title="SMM Runde ${rNum} (Max. 200 Pkt. - Top 4 zählen)">R${rNum}</th>`;
                                }
                                if (top4Cols.includes(c)) {
                                    const idx = top4Cols.indexOf(c) + 1;
                                    return `<th style="width: 90px; min-width: 90px; max-width: 90px; background-color: #e8f5e9; color: #2e7d32;" class="text-center text-truncate align-middle" title="Top ${idx} Mannschaft (Max. 200 Pkt.)">Top #${idx}</th>`;
                                }
                                if (topAuswCols.includes(c)) {
                                    const idx = topAuswCols.indexOf(c) + 1;
                                    return `<th style="width: 90px; min-width: 90px; max-width: 90px; background-color: #fffde7; color: #f57f17;" class="text-center text-truncate align-middle" title="Top ${idx} Auswärtiges Schiessen">Top #${idx}</th>`;
                                }

                                return `<th style="width: 90px; min-width: 90px; max-width: 90px; ${bgStyle}" class="text-center text-truncate align-middle" title="${escapeHtml(titleStr)}${escapeHtml(maxPts)}">${escapeHtml(titleStr)}</th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${tbodyHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

