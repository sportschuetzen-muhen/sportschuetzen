// === SUB-MODUL: JAHRESMEISTERSCHAFT - MANAGER & API & ARCHIV ===

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
