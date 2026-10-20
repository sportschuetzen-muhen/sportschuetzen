// === SUB-MODUL: JAHRESMEISTERSCHAFT - MANAGER & NATIVE SUPABASE ENGINE ===

async function saveJahresmeisterschaftData() {
    if (jmPendingUpdates.length === 0 && jmPendingMoves.length === 0 && !jmExclusionsChanged) {
        showSuccess("Keine Änderungen zum Speichern vorhanden.");
        return;
    }

    const tbody1 = document.getElementById('tbody-liga-1');
    if (tbody1 && tbody1.querySelectorAll('tr').length !== 8) {
        showError("Speichern blockiert: Liga 1 muss exakt 8 Schützen enthalten!");
        return;
    }

    if (!confirm("Bist du sicher, dass du die Änderungen speichern möchtest?")) {
        return;
    }

    const sb = getJMSupabaseClient();
    if (!sb || !window._jmIsSupabase) {
        showError("Supabase-Client ist nicht verfügbar.");
        return;
    }

    try {
        if (typeof updateJMSaveButtonState === 'function') updateJMSaveButtonState(true);
        showLoadingOverlay('Speichere Jahresmeisterschaft in Supabase...');

        // 1. Ausstehende Zelländerungen ins Grid übernehmen
        jmPendingUpdates.forEach(u => {
            if (jmRawGrid[u.r]) {
                jmRawGrid[u.r][u.c] = u.v;
            }
        });

        // 2. Gesamte Jahresmeisterschaft inklusive Top 4 Mannschaft, Top 2 Auswärtige & Totals live berechnen
        if (typeof recalculateJMRawGrid === 'function') {
            recalculateJMRawGrid(jmRawGrid);
        }

        const juniorList = Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true);

        // 3. Atomares Speichern in public.jm_seasons
        const { error: errSb } = await sb
            .from('jm_seasons')
            .upsert({
                jahr: jmCurrentJahr,
                raw_grid: jmRawGrid,
                junior_exclusions: juniorList,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

        if (errSb) throw errSb;

        // 4. Strukturierte Schützenliste für Website und App aktualisieren
        if (typeof syncJMShootersToSupabase === 'function') {
            await syncJMShootersToSupabase(sb, jmCurrentJahr, jmRawGrid);
        }

        showSuccess("Erfolgreich in Supabase gespeichert!");
        jmPendingUpdates = [];
        jmPendingMoves = [];
        jmExclusionsChanged = false;
        AppState.clearUnsaved();
        if (typeof updateJMSaveButtonState === 'function') {
            updateJMSaveButtonState();
        }
        renderJahresmeisterschaft(jmRawGrid);

    } catch (sbErr) {
        console.error("❌ Fehler beim Speichern in Supabase:", sbErr);
        showError("Fehler beim Speichern in Supabase: " + sbErr.message);
    } finally {
        hideLoadingOverlay();
        if (typeof updateJMSaveButtonState === 'function') {
            updateJMSaveButtonState();
        }
    }
}
window.saveJahresmeisterschaftData = saveJahresmeisterschaftData;

async function runJMAction(functionName, actionLabel) {
    if (!confirm(`Möchtest du die Aktion "${actionLabel}" ausführen?`)) {
        return;
    }

    const sb = getJMSupabaseClient();
    if (!sb) {
        showError("Supabase-Client ist nicht verfügbar.");
        return;
    }

    try {
        if (functionName === 'archiviereJahresmeisterschaft') {
            const defaultYear = new Date().getFullYear();
            const archivJahr = prompt("Bitte gib das Jahr für das Archiv ein (z.B. 2025):", defaultYear);
            if (!archivJahr || !/^\d{4}$/.test(archivJahr)) {
                showError("Ungültiges Jahr eingegeben. Aktion abgebrochen.");
                return;
            }

            showLoadingOverlay(`Archiviere Saison ${archivJahr} in Supabase...`);

            // Snapshot mit Status-Spalte und Badges erstellen
            const archivedGrid = createArchivedGridWithStatus(jmRawGrid);

            await sb.from('jm_seasons').upsert({
                jahr: archivJahr,
                title: `Jahresmeisterschaft ${archivJahr}`,
                raw_grid: archivedGrid,
                junior_exclusions: Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true),
                is_archived: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

            if (typeof syncJMShootersToSupabase === 'function') {
                await syncJMShootersToSupabase(sb, archivJahr, archivedGrid);
            }

            showSuccess(`Saison ${archivJahr} wurde erfolgreich archiviert (inkl. Auf- und Absteiger-Badges)!`);
            setTimeout(() => loadJahresmeisterschaftData(true), 800);

        } else if (functionName === 'jahresmeisterschaftZuruecksetzen') {
            // 1. Schützenrangliste auswerten
            const standing = analyzeJMStanding(jmRawGrid);
            if (!standing) {
                showError("Konnte Schützenrangliste für Auf- und Abstieg nicht ermitteln.");
                return;
            }

            const aufsteigerNamen = standing.aufsteiger.map(s => `${s.vorname} ${s.nachname}`).join(', ') || 'Keine';
            const absteigerNamen = standing.absteiger.map(s => `${s.vorname} ${s.nachname}`).join(', ') || 'Keine';

            // 2. Bestätigung mit Anzeige von Auf- und Abstieg
            const doProceed = confirm(
                `NEUES JAHR STARTEN (SAISONWECHSEL & AUF-/ABSTIEG)\n\n` +
                `Folgende Schützen wechseln die Liga:\n` +
                `▲ Aufsteiger in Liga 1: ${aufsteigerNamen}\n` +
                `▼ Absteiger in Liga 2: ${absteigerNamen}\n\n` +
                `Möchtest du mit dem Saisonwechsel fortfahren?`
            );
            if (!doProceed) return;

            // 3. Optionale automatische Archivierung vor dem Nullen
            const doArchive = confirm(
                `Möchtest du die abgelaufene Saison vor dem Nullen archivieren?\n\n` +
                `(Empfohlen: Sichert alle bisherigen Resultate inkl. Auf- und Absteiger-Badges)`
            );

            if (doArchive) {
                const prevYear = new Date().getFullYear();
                const archivJahr = prompt("Bitte gib das Jahr für das Archiv ein (z.B. 2025):", prevYear);
                if (archivJahr && /^\d{4}$/.test(archivJahr)) {
                    showLoadingOverlay(`Archiviere Saison ${archivJahr} in Supabase...`);
                    const archivedGrid = createArchivedGridWithStatus(jmRawGrid);
                    await sb.from('jm_seasons').upsert({
                        jahr: archivJahr,
                        title: `Jahresmeisterschaft ${archivJahr}`,
                        raw_grid: archivedGrid,
                        junior_exclusions: Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true),
                        is_archived: true,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'jahr' });

                    if (typeof syncJMShootersToSupabase === 'function') {
                        await syncJMShootersToSupabase(sb, archivJahr, archivedGrid);
                    }
                } else {
                    if (!confirm("Archivierung übersprungen oder abgebrochen. Trotzdem mit dem Nullen für das neue Jahr fortfahren?")) {
                        return;
                    }
                }
            }

            showLoadingOverlay("Führe Saisonwechsel & Auf-/Abstieg in Supabase aus...");

            // 4. Neues Grid für 'current' mit transferierten Schützen aufbauen
            const newGrid = buildNewSeasonGrid(jmRawGrid, standing);

            // 5. Grid neu durchrechnen (alles wird 0.00 %)
            if (typeof recalculateJMRawGrid === 'function') {
                recalculateJMRawGrid(newGrid);
            }

            // 6. In Supabase speichern
            await sb.from('jm_seasons').upsert({
                jahr: 'current',
                title: 'Jahresmeisterschaft (aktuell)',
                raw_grid: newGrid,
                junior_exclusions: [],
                is_archived: false,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

            jmRawGrid = newGrid;
            if (typeof syncJMShootersToSupabase === 'function') {
                await syncJMShootersToSupabase(sb, 'current', newGrid);
            }

            showSuccess("Neues Jahr erfolgreich gestartet! Liga 1 und 2 wurden mit Auf- und Abstieg aktualisiert.");
            setTimeout(() => loadJahresmeisterschaftData(true), 800);
        }
    } catch (e) {
        showError("Fehler bei der Aktion: " + e.message);
    } finally {
        hideLoadingOverlay();
    }
}
window.runJMAction = runJMAction;

// Erstellt einen Snapshot der aktuellen Saison inklusive 'Status'-Spalte und Auf-/Absteiger-Badges
function createArchivedGridWithStatus(grid) {
    if (!grid || grid.length < 6) return grid;

    const archivedGrid = JSON.parse(JSON.stringify(grid));

    let hasStatusCol = false;
    let statusColIndex = -1;
    if (archivedGrid[4]) {
        for (let c = 0; c < archivedGrid[4].length; c++) {
            if (String(archivedGrid[4][c] || '').trim().toLowerCase() === 'status') {
                hasStatusCol = true;
                statusColIndex = c;
                break;
            }
        }
    }

    // Wenn noch keine Status-Spalte existiert: An Index 6 in allen Zeilen einfügen
    if (!hasStatusCol) {
        statusColIndex = 6;
        for (let r = 0; r < archivedGrid.length; r++) {
            if (!archivedGrid[r]) archivedGrid[r] = [];
            const cellVal = (r === 4) ? 'Status' : '';
            archivedGrid[r].splice(statusColIndex, 0, cellVal);
        }
    }

    const colTotal = 19; // Bei vorhandener Status-Spalte ist Total an Index 19

    // 1. Liga 1 Schützen (Zeilen 5 bis 12)
    const liga1Shooters = [];
    for (let r = 5; r <= 12; r++) {
        if (!archivedGrid[r]) continue;
        const nachname = String(archivedGrid[r][1] || '').trim();
        const vorname = String(archivedGrid[r][2] || '').trim();
        if (!nachname && !vorname) continue;
        const totalVal = parseFloat(String(archivedGrid[r][colTotal] || '').replace(/%/g, '').trim()) || 0;
        liga1Shooters.push({ rowIndex: r, nachname, vorname, total: totalVal });
    }
    liga1Shooters.sort((a, b) => b.total - a.total);

    // Die letzten 2 Schützen aus Liga 1 sind Absteiger
    const absteigerRows = new Set(liga1Shooters.slice(Math.max(0, liga1Shooters.length - 2)).map(s => s.rowIndex));

    // 2. Liga 2 Schützen (Zeilen 15 bis Ende)
    const liga2Shooters = [];
    for (let r = 15; r < archivedGrid.length; r++) {
        if (!archivedGrid[r]) continue;
        const nachname = String(archivedGrid[r][1] || '').trim();
        const vorname = String(archivedGrid[r][2] || '').trim();
        if (!nachname && !vorname) continue;
        const totalVal = parseFloat(String(archivedGrid[r][colTotal] || '').replace(/%/g, '').trim()) || 0;
        liga2Shooters.push({ rowIndex: r, nachname, vorname, total: totalVal });
    }
    liga2Shooters.sort((a, b) => b.total - a.total);

    // Die ersten 2 Schützen aus Liga 2 sind Aufsteiger
    const aufsteigerRows = new Set(liga2Shooters.slice(0, 2).map(s => s.rowIndex));

    // Status-Werte eintragen
    for (let r = 5; r < archivedGrid.length; r++) {
        if (!archivedGrid[r] || r === 13 || r === 14) continue;
        if (absteigerRows.has(r)) {
            archivedGrid[r][statusColIndex] = '▼ Abstieg';
        } else if (aufsteigerRows.has(r)) {
            archivedGrid[r][statusColIndex] = '▲ Aufstieg';
        } else {
            archivedGrid[r][statusColIndex] = '';
        }
    }

    return archivedGrid;
}
window.createArchivedGridWithStatus = createArchivedGridWithStatus;

// Analysiert das Grid und ermittelt die Aufsteiger (Liga 2) und Absteiger (Liga 1)
function analyzeJMStanding(grid) {
    if (!grid || grid.length < 6) return null;

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(c => String(c || '').trim().toLowerCase() === 'status');
    }
    const colTotal = hasStatusCol ? 19 : 18;

    const liga1Shooters = [];
    for (let r = 5; r <= 12; r++) {
        if (!grid[r]) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;
        const totalVal = parseFloat(String(grid[r][colTotal] || '').replace(/%/g, '').trim()) || 0;
        liga1Shooters.push({ rowIndex: r, nachname, vorname, total: totalVal, rowData: [...grid[r]] });
    }
    liga1Shooters.sort((a, b) => b.total - a.total);

    const liga2Shooters = [];
    for (let r = 15; r < grid.length; r++) {
        if (!grid[r]) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;
        const totalVal = parseFloat(String(grid[r][colTotal] || '').replace(/%/g, '').trim()) || 0;
        liga2Shooters.push({ rowIndex: r, nachname, vorname, total: totalVal, rowData: [...grid[r]] });
    }
    liga2Shooters.sort((a, b) => b.total - a.total);

    const absteigerCount = Math.min(2, Math.max(0, liga1Shooters.length - 6));
    const liga1Stay = liga1Shooters.slice(0, Math.max(0, liga1Shooters.length - absteigerCount));
    const absteiger = liga1Shooters.slice(Math.max(0, liga1Shooters.length - absteigerCount));

    const aufsteigerCount = Math.min(2, liga2Shooters.length);
    const aufsteiger = liga2Shooters.slice(0, aufsteigerCount);
    const liga2Stay = liga2Shooters.slice(aufsteigerCount);

    return {
        liga1Stay,
        absteiger,
        aufsteiger,
        liga2Stay
    };
}
window.analyzeJMStanding = analyzeJMStanding;

// Erstellt ein sauberes neues 2D-Grid für die neue Saison mit transferierten Schützen
function buildNewSeasonGrid(grid, standing) {
    const { liga1Stay, aufsteiger, absteiger, liga2Stay } = standing;

    const newGrid = [];
    for (let r = 0; r <= 4; r++) {
        newGrid.push(grid[r] ? [...grid[r]] : []);
    }

    let hasStatusCol = false;
    let statusColIndex = -1;
    if (newGrid[4]) {
        for (let c = 0; c < newGrid[4].length; c++) {
            if (String(newGrid[4][c] || '').trim().toLowerCase() === 'status') {
                hasStatusCol = true;
                statusColIndex = c;
                break;
            }
        }
    }

    const firstScoreCol = hasStatusCol ? 7 : 6;
    const colLen = (grid[0] && grid[0].length) ? grid[0].length : 60;

    function createEmptyRowForShooter(originalRow, targetRang) {
        const row = new Array(colLen).fill('');
        for (let c = 0; c < firstScoreCol; c++) {
            row[c] = originalRow[c] !== undefined ? originalRow[c] : '';
        }
        row[0] = targetRang || '';
        if (hasStatusCol && statusColIndex !== -1) {
            row[statusColIndex] = '';
        }
        return row;
    }

    // Neue Liga 1: 6 Verbleibende + 2 Aufsteiger (exakt 8 Schützen)
    const newLiga1 = [...liga1Stay, ...aufsteiger];
    for (let i = 0; i < 8; i++) {
        if (newLiga1[i]) {
            newGrid.push(createEmptyRowForShooter(newLiga1[i].rowData, i + 1));
        } else {
            newGrid.push(new Array(colLen).fill(''));
        }
    }

    // Zeilen 13 und 14: Puffer- / Trennzeilen
    newGrid.push(grid[13] ? [...grid[13]] : new Array(colLen).fill(''));
    newGrid.push(grid[14] ? [...grid[14]] : new Array(colLen).fill(''));

    // Neue Liga 2: 2 Absteiger + verbleibende Liga 2 Schützen
    const newLiga2 = [...absteiger, ...liga2Stay];
    for (let i = 0; i < newLiga2.length; i++) {
        newGrid.push(createEmptyRowForShooter(newLiga2[i].rowData, i + 1));
    }

    return newGrid;
}
window.buildNewSeasonGrid = buildNewSeasonGrid;

async function runDeleteArchivedYearAction(jahr) {
    const confirmation = prompt(`Bist du absolut sicher, dass du das gesamte Archiv für das Jahr ${jahr} UNWIDERRUFLICH löschen möchtest?\n\nBitte tippe "${jahr}" zur Bestätigung ein:`);
    if (confirmation !== jahr) {
        showError("Löschvorgang abgebrochen. Die Bestätigung war nicht korrekt.");
        return;
    }
    
    const sb = getJMSupabaseClient();
    if (!sb) {
        showError("Supabase-Client ist nicht verfügbar.");
        return;
    }

    try {
        showLoadingOverlay(`Lösche Archiv ${jahr}...`);
        await sb.from('jm_seasons').delete().eq('jahr', jahr);
        await sb.from('jm_shooters').delete().eq('jahr', jahr);

        showSuccess(`Archiv ${jahr} wurde erfolgreich gelöscht!`);
        jmCurrentJahr = "current";
        const select = document.getElementById('jm-history-select');
        if (select) {
            select.value = "current";
        }
        setTimeout(() => loadJahresmeisterschaftData(true), 800);
    } catch (e) {
        showError("Fehler beim Löschen: " + e.message);
    } finally {
        hideLoadingOverlay();
    }
}
window.runDeleteArchivedYearAction = runDeleteArchivedYearAction;

async function addNewAuswaertigesSchiessen() {
    const name = prompt("Gib den Namen des neuen Auswärtsschießens ein (z. B. 'Freischießen Zofingen'):");
    if (!name || name.trim() === "") return;
    
    const maxPunkteStr = prompt("Gib die maximale Punktzahl für dieses Schießen ein (z. B. '100'):", "100");
    if (maxPunkteStr === null) return;
    const maxPunkte = parseInt(maxPunkteStr);
    if (isNaN(maxPunkte) || maxPunkte <= 0) {
        showError("Ungültige Punktzahl eingegeben.");
        return;
    }

    const sb = getJMSupabaseClient();
    if (!sb || !jmRawGrid || jmRawGrid.length < 5) {
        showError("Supabase-Client oder Grid nicht verfügbar.");
        return;
    }

    try {
        showLoadingOverlay('Erstelle neues Auswärtsschießen in Supabase...');

        const compRow = jmRawGrid[2] || [];
        // Suche erste leere Spalte ab Spalte 41 oder hänge neue an
        let targetCol = -1;
        for (let c = 41; c < compRow.length; c++) {
            const t = String(compRow[c] || '').trim().toLowerCase();
            if (!t || t === '' || t.startsWith('spalte')) {
                targetCol = c;
                break;
            }
        }
        if (targetCol === -1) {
            targetCol = compRow.length;
        }

        // Neue Spaltendaten ins Grid eintragen
        if (!jmRawGrid[0]) jmRawGrid[0] = [];
        if (!jmRawGrid[2]) jmRawGrid[2] = [];
        if (!jmRawGrid[3]) jmRawGrid[3] = [];

        jmRawGrid[0][targetCol] = 'TRUE';
        jmRawGrid[2][targetCol] = name.trim();
        jmRawGrid[3][targetCol] = maxPunkte;

        // Alle Schützenzeilen initialisieren
        for (let r = 5; r < jmRawGrid.length; r++) {
            if (jmRawGrid[r]) {
                if (jmRawGrid[r][targetCol] === undefined) {
                    jmRawGrid[r][targetCol] = '';
                }
            }
        }

        if (typeof recalculateJMRawGrid === 'function') {
            recalculateJMRawGrid(jmRawGrid);
        }

        // Direkt nach Supabase speichern
        const { error: errSb } = await sb
            .from('jm_seasons')
            .upsert({
                jahr: jmCurrentJahr,
                raw_grid: jmRawGrid,
                junior_exclusions: Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true),
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

        if (errSb) throw errSb;

        if (typeof syncJMShootersToSupabase === 'function') {
            await syncJMShootersToSupabase(sb, jmCurrentJahr, jmRawGrid);
        }

        showSuccess(`Auswärtsschießen '${name.trim()}' erfolgreich erstellt!`);
        renderJahresmeisterschaft(jmRawGrid);

    } catch (err) {
        showError("Fehler beim Erstellen: " + err.message);
    } finally {
        hideLoadingOverlay();
    }
}
window.addNewAuswaertigesSchiessen = addNewAuswaertigesSchiessen;

async function deleteAuswaertigesSchiessen(colIndex) {
    const sb = getJMSupabaseClient();
    if (!sb || !jmRawGrid || jmRawGrid.length < 5) {
        showError("Supabase-Client oder Grid nicht verfügbar.");
        return;
    }

    const compName = (jmRawGrid[2] && jmRawGrid[2][colIndex]) || `Spalte ${colIndex + 1}`;
    const confirmed = confirm(`Möchtest du das Auswärtsschießen «${compName}» (Spalte ${colIndex + 1}) inklusive aller eingetragenen Punkte unwiderruflich löschen?`);
    if (!confirmed) return;

    try {
        showLoadingOverlay(`Lösche Auswärtsschießen «${compName}»...`);

        // 1. Spaltendaten im Grid bereinigen
        if (jmRawGrid[0]) jmRawGrid[0][colIndex] = '';
        if (jmRawGrid[2]) jmRawGrid[2][colIndex] = '';
        if (jmRawGrid[3]) jmRawGrid[3][colIndex] = '';

        for (let r = 5; r < jmRawGrid.length; r++) {
            if (jmRawGrid[r]) {
                jmRawGrid[r][colIndex] = '';
            }
        }

        // 2. Gesamte Jahresmeisterschaft inklusive Top 2 Auswärtige & Totals live neu berechnen
        if (typeof recalculateJMRawGrid === 'function') {
            recalculateJMRawGrid(jmRawGrid);
        }

        // 3. Atomar nach Supabase speichern
        const juniorList = (typeof jmJuniorExclusions !== 'undefined')
            ? Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true)
            : [];

        const { error: errSb } = await sb
            .from('jm_seasons')
            .upsert({
                jahr: jmCurrentJahr || 'current',
                raw_grid: jmRawGrid,
                junior_exclusions: juniorList,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

        if (errSb) throw errSb;

        if (typeof syncJMShootersToSupabase === 'function') {
            await syncJMShootersToSupabase(sb, jmCurrentJahr || 'current', jmRawGrid);
        }

        showSuccess(`Auswärtsschießen «${compName}» wurde erfolgreich gelöscht.`);
        renderJahresmeisterschaft(jmRawGrid);

    } catch (err) {
        showError("Fehler beim Löschen: " + err.message);
    } finally {
        hideLoadingOverlay();
    }
}
window.deleteAuswaertigesSchiessen = deleteAuswaertigesSchiessen;

function openDeleteAuswaertigesModal() {
    if (!jmRawGrid || !jmRawGrid[2]) {
        showError("Grid-Daten nicht geladen.");
        return;
    }

    let hasStatusCol = false;
    if (jmRawGrid[4]) {
        hasStatusCol = jmRawGrid[4].some(cell => String(cell || '').trim().toLowerCase() === 'status');
    }
    const limitIndex = hasStatusCol ? 42 : 41;
    const compRow = jmRawGrid[2];

    const available = [];
    for (let c = limitIndex; c < compRow.length; c++) {
        const title = String(compRow[c] || '').trim();
        if (title && !title.toLowerCase().startsWith('spalte') && title.toLowerCase() !== 'leer') {
            available.push({ col: c, title });
        }
    }

    if (available.length === 0) {
        showInfo("Es sind aktuell keine Auswärtsschießen zum Löschen vorhanden.");
        return;
    }

    // Modal dynamisch im DOM erzeugen oder aktualisieren
    let modalEl = document.getElementById('modal-delete-auswaertig');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'modal-delete-auswaertig';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg rounded-4">
                <div class="modal-header bg-danger text-white py-3 px-4">
                    <h5 class="modal-title fw-bold">
                        <i class="fas fa-trash-alt me-2"></i>Auswärtiges Schießen löschen
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                </div>
                <div class="modal-body p-4">
                    <p class="text-muted small mb-3">
                        Wähle das Auswärtsschießen aus, das du inklusive aller Punkte unwiderruflich aus der aktuellen Saison löschen möchtest.
                    </p>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Auswärtiges Schießen</label>
                        <select id="select-delete-auswaertig" class="form-select">
                            ${available.map(a => `<option value="${a.col}">${escapeHtml(a.title)} (Spalte ${a.col + 1})</option>`).join('')}
                        </select>
                    </div>
                    <div class="alert alert-warning py-2 px-3 small mb-0">
                        <i class="fas fa-exclamation-triangle me-1"></i>
                        <strong>Hinweis:</strong> Nach dem Löschen rückt automatisch das nächstbeste Auswärtsschießen für alle Schützen nach.
                    </div>
                </div>
                <div class="modal-footer bg-light py-2 px-4 border-top">
                    <button type="button" class="btn btn-secondary rounded-pill px-3" data-bs-dismiss="modal">Abbrechen</button>
                    <button type="button" class="btn btn-danger rounded-pill px-4 fw-bold" id="btn-confirm-delete-ausw">
                        <i class="fas fa-trash-alt me-1"></i>Unwiderruflich löschen
                    </button>
                </div>
            </div>
        </div>
    `;

    const bsModal = new bootstrap.Modal(modalEl);
    const confirmBtn = modalEl.querySelector('#btn-confirm-delete-ausw');
    confirmBtn.onclick = async () => {
        const sel = modalEl.querySelector('#select-delete-auswaertig');
        const colToDel = parseInt(sel.value, 10);
        bsModal.hide();
        if (!isNaN(colToDel)) {
            await deleteAuswaertigesSchiessen(colToDel);
        }
    };

    bsModal.show();
}
window.openDeleteAuswaertigesModal = openDeleteAuswaertigesModal;

