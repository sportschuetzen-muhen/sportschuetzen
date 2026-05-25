// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - EVENTS ===

function renderUmfragenEventsList() {
    const tbody = document.getElementById('umfragen-events-body');
    
    // Eindeutige Prüfung der Schreibrechte
    let canWrite = false;
    if (typeof hasWriteAccess === 'function') {
        canWrite = hasWriteAccess('umfragen');
    } else {
        canWrite = (window.currentRoles || []).includes('admin');
    }
    
    // Speichern- und Hinzufügen-Buttons steuern
    const successBtns = document.querySelectorAll('#umfragen-container .btn-success');
    successBtns.forEach(btn => {
        if (canWrite) {
            btn.classList.remove('d-none');
            btn.removeAttribute('disabled');
        } else {
            btn.classList.add('d-none');
        }
    });

    if (!tbody) return;
    if (!umfragenState || umfragenState.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center p-4 text-muted">Keine Events gefunden.</td></tr>';
        return;
    }

    tbody.innerHTML = umfragenState.map((e, idx) => {
        return `
        <tr>
            <td class="text-muted small align-middle">${escapeHtml(e.id || '-')}</td>
            <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(e.title || '')}" onchange="umfragenState[${idx}].title=this.value; window.markUnsaved()" ${!canWrite?'readonly disabled':''}></td>
            <td><input type="date" class="form-control form-control-sm" value="${e.datum ? e.datum.split('T')[0] : ''}" onchange="umfragenState[${idx}].datum=this.value; window.markUnsaved()" ${!canWrite?'readonly disabled':''}></td>
            <td>
                <select class="form-select form-select-sm" onchange="umfragenState[${idx}].gruppe=this.value; window.markUnsaved()" ${!canWrite?'disabled':''}>
                    <option value="aktiv" ${(e.gruppe === 'aktiv' || !e.gruppe) ? 'selected' : ''}>Aktiv</option>
                    <option value="passiv" ${e.gruppe === 'passiv' ? 'selected' : ''}>Passiv</option>
                    <option value="alle" ${e.gruppe === 'alle' ? 'selected' : ''}>Alle</option>
                </select>
            </td>
            
            <td class="text-center align-middle">
                <input type="checkbox" class="form-check-input" ${isTrue(e.schiessanlass) ? 'checked' : ''} onchange="umfragenState[${idx}].schiessanlass=this.checked; window.markUnsaved()" ${!canWrite?'disabled':''}>
            </td>
            <td class="text-center align-middle">
                <input type="checkbox" class="form-check-input" ${isTrue(e.aktiv) ? 'checked' : ''} onchange="umfragenState[${idx}].aktiv=this.checked; window.markUnsaved()" ${!canWrite?'disabled':''}>
            </td>
             <td class="text-center align-middle">
                <input type="checkbox" class="form-check-input" ${isTrue(e.showparticipants) ? 'checked' : ''} onchange="umfragenState[${idx}].showparticipants=this.checked; window.markUnsaved()" ${!canWrite?'disabled':''}>
            </td>
             <td class="text-center align-middle">
                <input type="checkbox" class="form-check-input" ${isTrue(e.frage_begleitung) ? 'checked' : ''} onchange="umfragenState[${idx}].frage_begleitung=this.checked; window.markUnsaved()" ${!canWrite?'disabled':''}>
            </td>
             <td class="text-center align-middle">
                <input type="checkbox" class="form-check-input" ${isTrue(e.frage_essen) ? 'checked' : ''} onchange="umfragenState[${idx}].frage_essen=this.checked; window.markUnsaved()" ${!canWrite?'disabled':''}>
            </td>
            
            <td class="align-middle">
                <button class="btn btn-link text-danger p-0" onclick="removeUmfrageEvent(${idx})" ${!canWrite ? 'disabled':''}>🗑️</button>
            </td>
        </tr>
        `;
    }).join('');

    // Datalist für Gruppen pflegen
    const datalist = document.getElementById('umfragen-gruppe-list');
    if(datalist) {
        const uniqueGroups = Array.from(new Set(umfragenState.map(e => String(e.gruppe || '').trim()).filter(Boolean)));
        uniqueGroups.sort();
        datalist.innerHTML = uniqueGroups.map(g => `<option value="${escapeHtml(g)}">`).join('');
    }
}

function addUmfrageEvent() {
    window.markUnsaved();
    umfragenState.push({
        id: 'e_' + Date.now().toString(36),
        title: "Neuer Anlass",
        datum: new Date().toISOString().split('T')[0],
        gruppe: "aktiv",
        schiessanlass: false,
        aktiv: true,
        showparticipants: false,
        frage_begleitung: false,
        frage_essen: false
    });
    renderUmfragenEventsList();
}

function removeUmfrageEvent(idx) {
    if(!confirm("Event wirklich aus der Umfragenliste löschen?")) return;
    window.markUnsaved();
    umfragenState.splice(idx, 1);
    renderUmfragenEventsList();
}

async function saveUmfragenData() {
    if(!confirm("Alle Events in der Umfrage-App updaten?")) return;
    try {
        const payload = {
            action: "saveEventsAdmin",
            events: umfragenState
        };
        await apiFetch('umfragen', '', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        window.clearUnsaved();
        alert("✅ Umfragen Gespeichert!");
        loadUmfragenData();
    } catch(e) {
        alert("Fehler beim Speichern der Umfragen: " + e.message);
    }
}

function sortUmfragenEvents(field) {
    if (umfragenSortField === field) {
        umfragenSortDir *= -1;
    } else {
        umfragenSortField = field;
        umfragenSortDir = 1;
    }
    
    umfragenState.sort((a, b) => {
        let valA = a[field] || '';
        let valB = b[field] || '';
        if (field === 'datum') {
            valA = new Date(valA).getTime() || 0;
            valB = new Date(valB).getTime() || 0;
        } else if (typeof valA === 'boolean' || typeof valB === 'boolean') {
            valA = valA ? 1 : 0;
            valB = valB ? 1 : 0;
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }
        
        if (valA < valB) return -1 * umfragenSortDir;
        if (valA > valB) return 1 * umfragenSortDir;
        return 0;
    });
    
    renderUmfragenEventsList();
}
