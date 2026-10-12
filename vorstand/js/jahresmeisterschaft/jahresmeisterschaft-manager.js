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
        let archivJahr = null;
        if (functionName === 'archiviereJahresmeisterschaft') {
            archivJahr = prompt("Bitte gib das Jahr für das Archiv ein (z.B. 2025):", new Date().getFullYear());
            if (!archivJahr || !/^\d{4}$/.test(archivJahr)) {
                showError("Ungültiges Jahr eingegeben. Aktion abgebrochen.");
                return;
            }

            showLoadingOverlay(`Archiviere Saison ${archivJahr} in Supabase...`);
            await sb.from('jm_seasons').upsert({
                jahr: archivJahr,
                title: `Jahresmeisterschaft ${archivJahr}`,
                raw_grid: jmRawGrid,
                junior_exclusions: Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true),
                is_archived: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

            if (typeof syncJMShootersToSupabase === 'function') {
                await syncJMShootersToSupabase(sb, archivJahr, jmRawGrid);
            }

            showSuccess(`Saison ${archivJahr} wurde erfolgreich archiviert!`);
            setTimeout(() => loadJahresmeisterschaftData(true), 800);

        } else if (functionName === 'jahresmeisterschaftZuruecksetzen') {
            if (!confirm("ACHTUNG: Dies setzt alle Resultate für das neue Jahr auf 0 zurück!\n\nFortfahren?")) {
                return;
            }

            showLoadingOverlay("Setze Jahresmeisterschaft in Supabase zurück...");
            const resetGrid = JSON.parse(JSON.stringify(jmRawGrid));
            for (let r = 5; r < resetGrid.length; r++) {
                if (!resetGrid[r]) continue;
                for (let c = 6; c < resetGrid[r].length; c++) {
                    if (resetGrid[r][c] !== '' && !isNaN(parseFloat(resetGrid[r][c]))) {
                        resetGrid[r][c] = '';
                    }
                }
            }

            if (typeof recalculateJMRawGrid === 'function') {
                recalculateJMRawGrid(resetGrid);
            }

            await sb.from('jm_seasons').upsert({
                jahr: 'current',
                title: 'Jahresmeisterschaft (aktuell)',
                raw_grid: resetGrid,
                junior_exclusions: [],
                is_archived: false,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

            jmRawGrid = resetGrid;
            if (typeof syncJMShootersToSupabase === 'function') {
                await syncJMShootersToSupabase(sb, 'current', resetGrid);
            }

            showSuccess("Jahresmeisterschaft für das neue Jahr zurückgesetzt!");
            setTimeout(() => loadJahresmeisterschaftData(true), 800);
        }
    } catch (e) {
        showError("Fehler bei der Aktion: " + e.message);
    } finally {
        hideLoadingOverlay();
    }
}
window.runJMAction = runJMAction;

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
