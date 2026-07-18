// === SUB-MODUL: JAHRESMEISTERSCHAFT - INPUT & DRAG-AND-DROP & RECHNER ===

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

function handleJuniorSwitchChange(input) {
    const comp = input.dataset.comp;
    const isExcluded = !input.checked;
    
    const grid = jmRawGrid;
    if (!grid) return;
    
    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }
    
    if (!grid[1]) {
        grid[1] = new Array(grid[2].length).fill('');
    }
    
    for (let c = 0; c < grid[2].length; c++) {
        if (getCompCategory(c, hasStatusCol) === comp) {
            const val = isExcluded ? 'FALSE' : 'TRUE';
            handleCellEdit(1, c, val);
        }
    }
    
    renderJuniorenTabContent();
}
