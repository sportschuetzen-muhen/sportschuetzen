// === SUB-MODUL: JAHRESMEISTERSCHAFT - UI ===

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
