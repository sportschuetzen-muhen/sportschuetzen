// === SUB-MODUL: JAHRESMEISTERSCHAFT - MANAGER & API & ARCHIV ===
// Native Supabase Architecture mit Google Apps Script Fallback & Dual-Write

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

    // --- 1. SUPABASE-FIRST SPEICHERN ---
    const sb = getJMSupabaseClient();
    if (sb && window._jmIsSupabase) {
        try {
            showLoadingOverlay('Speichere Jahresmeisterschaft in Supabase...');

            // Aktualisiere jmRawGrid mit den pending updates
            jmPendingUpdates.forEach(u => {
                if (jmRawGrid[u.r]) {
                    jmRawGrid[u.r][u.c] = u.v;
                }
            });

            const juniorList = Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true);

            const { error: errSb } = await sb
                .from('jm_seasons')
                .upsert({
                    jahr: jmCurrentJahr,
                    raw_grid: jmRawGrid,
                    junior_exclusions: juniorList,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'jahr' });

            if (errSb) throw errSb;

            // Strukturierte Schützenliste im Hintergrund aktualisieren
            if (typeof syncJMShootersToSupabase === 'function') {
                syncJMShootersToSupabase(sb, jmCurrentJahr, jmRawGrid).catch(e => console.warn(e));
            }

            showSuccess("Erfolgreich in Supabase gespeichert!");
            jmPendingUpdates = [];
            jmPendingMoves = [];
            jmExclusionsChanged = false;
            AppState.clearUnsaved();
            renderJahresmeisterschaft(jmRawGrid);
            return;

        } catch (sbErr) {
            console.error("❌ Fehler beim Speichern in Supabase:", sbErr);
            showError("Fehler beim Speichern in Supabase: " + sbErr.message);
        } finally {
            hideLoadingOverlay();
        }
    } else {
        showError("Supabase-Client ist nicht verfügbar.");
    }
}

async function runJMAction(functionName, actionLabel) {
    if (!confirm(`Möchtest du die Aktion "${actionLabel}" ausführen?`)) {
        return;
    }

    const sb = getJMSupabaseClient();

    try {
        let archivJahr = null;
        if (functionName === 'archiviereJahresmeisterschaft') {
            archivJahr = prompt("Bitte gib das Jahr für das Archiv ein (z.B. 2025):", new Date().getFullYear());
            if (!archivJahr || !/^\d{4}$/.test(archivJahr)) {
                showError("Ungültiges Jahr eingegeben. Aktion abgebrochen.");
                return;
            }

            // Supabase-Archivierung
            if (sb && window._jmIsSupabase) {
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
            }
        } else if (functionName === 'jahresmeisterschaftZuruecksetzen') {
            if (!confirm("ACHTUNG: Dies setzt alle Resultate für das neue Jahr auf 0 zurück!\n\nFortfahren?")) {
                return;
            }
            if (sb && window._jmIsSupabase) {
                showLoadingOverlay("Setze Jahresmeisterschaft in Supabase zurück...");
                // Punkte auf 0 setzen
                const resetGrid = JSON.parse(JSON.stringify(jmRawGrid));
                for (let r = 5; r < resetGrid.length; r++) {
                    if (!resetGrid[r]) continue;
                    for (let c = 6; c < resetGrid[r].length; c++) {
                        // Wenn es eine Punktspalte ist (Zahl)
                        if (resetGrid[r][c] !== '' && !isNaN(parseFloat(resetGrid[r][c]))) {
                            resetGrid[r][c] = '';
                        }
                    }
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
            }
        }

        // Parallel/Fallback Aufruf an Google Apps Script für Import-Aktionen oder Spiegelung
        showLoadingOverlay(`Führe ${actionLabel} aus...`);
        
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
            // Bei Imports auch Supabase mit den neu berechneten Werten synchronisieren
            if (functionName.startsWith('importiere') && sb) {
                setTimeout(async () => {
                    await window.migrateJMFromGoogleSheets();
                }, 2000);
            } else {
                setTimeout(loadJahresmeisterschaftData, 1000);
            }
        } else {
            if (sb && window._jmIsSupabase && (functionName === 'archiviereJahresmeisterschaft' || functionName === 'jahresmeisterschaftZuruecksetzen')) {
                showSuccess(`In Supabase erfolgreich ausgeführt (GAS meldet: ${data.error || 'Timeout'})`);
                setTimeout(loadJahresmeisterschaftData, 1000);
            } else {
                throw new Error(data.error || "Unbekannter Fehler bei der Ausführung.");
            }
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
    
    const sb = getJMSupabaseClient();

    try {
        showLoadingOverlay(`Lösche Archiv ${jahr}...`);

        if (sb && window._jmIsSupabase) {
            await sb.from('jm_seasons').delete().eq('jahr', jahr);
            await sb.from('jm_shooters').delete().eq('jahr', jahr);
        }
        
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

        if (data.success || (sb && window._jmIsSupabase)) {
            showSuccess(`Archiv ${jahr} wurde erfolgreich gelöscht!`);
            jmCurrentJahr = "current";
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
        showLoadingOverlay('Erstelle neues Auswärtsschießen...');
        
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
            setTimeout(async () => {
                if (window.migrateJMFromGoogleSheets) {
                    await window.migrateJMFromGoogleSheets();
                } else {
                    loadJahresmeisterschaftData();
                }
            }, 1500);
        } else {
            showError(data.message || "Fehler beim Erstellen.");
        }
    } catch (err) {
        showError("Netzwerkfehler: " + err.message);
    } finally {
        hideLoadingOverlay();
    }
}
