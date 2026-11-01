// === SUB-MODUL: JAHRESMEISTERSCHAFT - INPUT & DRAG-AND-DROP & LIVE-NAVIGATION ===

function handleCellEdit(r, c, val, inputElem) {
    if (r > 4 && inputElem) {
        const maxVal = parseFloat(jmRawGrid[3] && jmRawGrid[3][c]);
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

    if (!jmRawGrid[r]) jmRawGrid[r] = [];
    jmRawGrid[r][c] = val;

    // Gesamte Jahresmeisterschaft inklusive Top 4 Mannschaft, Top 2 Auswärtige & Totals live neu berechnen
    if (typeof recalculateJMRawGrid === 'function') {
        recalculateJMRawGrid(jmRawGrid);
    }

    jmPendingUpdates = jmPendingUpdates.filter(u => !(u.r === r && u.c === c));
    jmPendingUpdates.push({ r, c, v: val });
    AppState.markUnsaved();
    if (typeof updateJMSaveButtonState === 'function') {
        updateJMSaveButtonState();
    }

    // Wenn Kopfzeilen/Einstellungen geändert wurden (r <= 4), gesamte Tabelle neu rendern
    if (r <= 4) {
        renderJahresmeisterschaft(jmRawGrid);
        return;
    }

    // Für Schützen-Zellen (r > 4): Gezielte DOM-Aktualisierung der Zeile ohne Zerstörung des Fokus!
    updateShooterRowDOM(r);
}
window.handleCellEdit = handleCellEdit;

function handleCellKeydown(event, r, c, inputElem) {
    if (event.key === 'Enter') {
        event.preventDefault();
        // Wert vor Sprung festschreiben, falls change noch nicht gefeuert hat
        if (inputElem && inputElem.value !== (jmRawGrid[r] && jmRawGrid[r][c])) {
            handleCellEdit(r, c, inputElem.value, inputElem);
        }
        const direction = event.shiftKey ? -1 : 1;
        focusNextShooterInput(r, c, direction, inputElem);
    } else if (event.key === 'ArrowDown') {
        if (!inputElem || inputElem.selectionStart === inputElem.selectionEnd) {
            event.preventDefault();
            if (inputElem && inputElem.value !== (jmRawGrid[r] && jmRawGrid[r][c])) {
                handleCellEdit(r, c, inputElem.value, inputElem);
            }
            focusNextShooterInput(r, c, 1, inputElem);
        }
    } else if (event.key === 'ArrowUp') {
        if (!inputElem || inputElem.selectionStart === inputElem.selectionEnd) {
            event.preventDefault();
            if (inputElem && inputElem.value !== (jmRawGrid[r] && jmRawGrid[r][c])) {
                handleCellEdit(r, c, inputElem.value, inputElem);
            }
            focusNextShooterInput(r, c, -1, inputElem);
        }
    }
}
window.handleCellKeydown = handleCellKeydown;

function focusNextShooterInput(currentR, c, direction, currentInput) {
    const table = currentInput ? currentInput.closest('table') : document;
    if (!table) return;
    const inputs = Array.from(table.querySelectorAll(`input[data-c="${c}"]:not([readonly]):not([disabled])`));
    if (inputs.length === 0) return;
    const currentIndex = inputs.indexOf(currentInput);
    if (currentIndex === -1) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex >= 0 && targetIndex < inputs.length) {
        const nextInput = inputs[targetIndex];
        nextInput.focus();
        if (typeof nextInput.select === 'function') {
            nextInput.select();
        }
    }
}
window.focusNextShooterInput = focusNextShooterInput;

function updateShooterRowDOM(r) {
    if (!jmRawGrid || !jmRawGrid[r]) return;
    const rows = document.querySelectorAll(`tr[data-row="${r}"]`);
    if (rows.length === 0) return;

    let hasStatusCol = false;
    if (jmRawGrid[4]) {
        hasStatusCol = jmRawGrid[4].some(cell => String(cell || '').trim().toLowerCase() === 'status');
    }

    const colTotal = hasStatusCol ? 19 : 18;
    const colStreich = hasStatusCol ? 32 : 31;
    const rawStart = hasStatusCol ? 34 : 33;
    const rawEnd = hasStatusCol ? 40 : 39;
    const limitIndex = hasStatusCol ? 42 : 41;
    const colAusw1 = hasStatusCol ? 15 : 14;
    const colAusw2 = hasStatusCol ? 16 : 15;
    const smmSlots = hasStatusCol ? [10, 11, 12, 13] : [9, 10, 11, 12];

    // 1. Zählende Auswärtsschiessen für diesen Schützen ermitteln (Top 2)
    const auswSlotCols = [colAusw1, colAusw2];
    const auswSlots = auswSlotCols.filter(sc => ['ja','j','x','1','true','yes','✓','✔','☑'].includes(String(jmRawGrid[0] && jmRawGrid[0][sc] !== undefined ? jmRawGrid[0][sc] : '').trim().toLowerCase())).length;

    const countedAuswCols = new Set();
    if (auswSlots > 0 && jmRawGrid[2]) {
        const auswResults = [];
        for (let ac = limitIndex; ac < jmRawGrid[2].length; ac++) {
            const rawVal = jmRawGrid[r][ac];
            const pts = parseFloat(String(rawVal === undefined || rawVal === null ? '' : rawVal).replace(',', '.'));
            const maxPts = parseFloat(String(jmRawGrid[3][ac] || '').replace(',', '.')) || 100;
            if (!isNaN(pts) && pts > 0 && maxPts > 0) {
                auswResults.push({ col: ac, pct: (pts / maxPts) * 100 });
            }
        }
        auswResults.sort((a, b) => b.pct - a.pct).slice(0, auswSlots).forEach(x => countedAuswCols.add(x.col));
    }

    // 2. Die 4 besten Mannschaftsrunden (SMM Top 4) ermitteln
    const mRounds = [];
    for (let mc = rawStart; mc <= rawEnd; mc++) {
        const rawVal = jmRawGrid[r][mc];
        const num = parseFloat(String(rawVal || '').replace(',', '.'));
        if (!isNaN(num) && num > 0) {
            mRounds.push({ col: mc, score: num });
        }
    }
    mRounds.sort((a, b) => b.score - a.score);
    const top4MannschaftCols = new Set(mRounds.slice(0, 4).map(item => item.col));

    // 3. Jedes tr-Element dieses Schützen im DOM gezielt aktualisieren
    rows.forEach(tr => {
        // A) Total-Zelle
        const totalInput = tr.querySelector('input[data-cell="total"]');
        if (totalInput) {
            const totVal = jmRawGrid[r][colTotal];
            totalInput.value = (totVal !== '' && totVal !== undefined && totVal !== null) ? `${totVal} %` : '0.00 %';
        }

        // B) Top 4 SMM Meisterschaftsspalten (Spalten 9-12 bzw. 10-13)
        smmSlots.forEach(sc => {
            const smmInput = tr.querySelector(`input[data-c="${sc}"]`);
            if (smmInput) {
                smmInput.value = jmRawGrid[r][sc] || '';
            }
        });

        // C) Auswärtiges 1 & 2 Meisterschaftsspalten
        const a1Input = tr.querySelector(`input[data-c="${colAusw1}"]`);
        if (a1Input) {
            a1Input.value = jmRawGrid[r][colAusw1] || '';
        }
        const a2Input = tr.querySelector(`input[data-c="${colAusw2}"]`);
        if (a2Input) {
            a2Input.value = jmRawGrid[r][colAusw2] || '';
        }

        // D) Einzelne Auswärtsschiessen (gelbe Markierung der besten 2)
        const allInputs = tr.querySelectorAll('input[data-c]');
        allInputs.forEach(inp => {
            const c = parseInt(inp.getAttribute('data-c'), 10);
            if (c >= limitIndex) {
                const isCounted = countedAuswCols.has(c);
                if (isCounted) {
                    inp.style.backgroundColor = '#fff3cd';
                    inp.style.fontWeight = '700';
                    inp.style.borderColor = '#ffc107';
                } else {
                    inp.style.backgroundColor = '';
                    inp.style.fontWeight = '';
                    inp.style.borderColor = '';
                }
            } else if (c >= rawStart && c <= rawEnd) {
                // E) SMM-Runden (Top 4 grün / Streichrunde durchgestrichen)
                const pts = parseFloat(String(jmRawGrid[r][c] || '').replace(',', '.'));
                const isCounted = top4MannschaftCols.has(c) && !isNaN(pts) && pts > 0;
                const isStreich = !top4MannschaftCols.has(c) && !isNaN(pts) && pts > 0;

                if (isCounted) {
                    inp.classList.remove('text-decoration-line-through', 'text-muted', 'opacity-75');
                    inp.classList.add('fw-bold');
                } else if (isStreich) {
                    inp.classList.add('text-decoration-line-through', 'text-muted', 'opacity-75');
                    inp.classList.remove('fw-bold');
                } else {
                    inp.classList.remove('text-decoration-line-through', 'text-muted', 'opacity-75', 'fw-bold');
                }
            }
        });
    });
}
window.updateShooterRowDOM = updateShooterRowDOM;

function handleSortEnd(evt) {
    // Manuelles Verschieben unter dem Jahr deaktiviert (Auf- und Abstieg erfolgt kontrolliert beim Saisonwechsel)
    return;
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
        infoElem.innerHTML = `<i class="fas fa-info-circle me-1"></i> <strong>Wichtig:</strong> «Auswärtiges 1» und «Auswärtiges 2» berechnet das System automatisch aus den zwei prozentual besten Auswärtsschiessen (${escapeHtml(names.join(', '))}). Hier eingetragene Werte werden beim nächsten Berechnen überschrieben. Erfasse die Punkte deshalb direkt beim jeweiligen Auswärtsschiessen in der Rangliste.`;
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
    
    jmJuniorExclusions[comp] = isExcluded;
    jmExclusionsChanged = true;
    AppState.markUnsaved();
    if (typeof updateJMSaveButtonState === 'function') {
        updateJMSaveButtonState();
    }
    
    renderJuniorenTabContent();
}
