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
        tbody.innerHTML = '<tr><td colspan="12" class="text-center p-4 text-muted">Keine Events gefunden.</td></tr>';
        return;
    }

    tbody.innerHTML = umfragenState.map((e, idx) => {
        const isSchiess = isTrue(e.schiessanlass);
        const parsedOpts = (typeof parsePollOptions === 'function') ? parsePollOptions(e.options) : (Array.isArray(e.options) ? e.options : []);
        const optCount = parsedOpts.length;
        const hasDoc = Boolean(e.dokument_url && e.dokument_url.trim());

        return `
        <tr>
            <td class="text-muted small align-middle">${escapeHtml(e.id || '-')}</td>
            <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(e.title || '')}" onchange="umfragenState[${idx}].title=this.value; window.markUnsaved()" ${!canWrite?'readonly disabled':''}></td>
            <td><input type="date" class="form-control form-control-sm" value="${formatISODate(e.datum)}" onchange="umfragenState[${idx}].datum=this.value; window.markUnsaved()" ${!canWrite?'readonly disabled':''}></td>
            <td>
                <select class="form-select form-select-sm" onchange="umfragenState[${idx}].gruppe=this.value; window.markUnsaved()" ${!canWrite?'disabled':''}>
                    <option value="aktiv" ${(e.gruppe === 'aktiv' || !e.gruppe) ? 'selected' : ''}>Aktiv</option>
                    <option value="passiv" ${e.gruppe === 'passiv' ? 'selected' : ''}>Passiv</option>
                    <option value="alle" ${e.gruppe === 'alle' ? 'selected' : ''}>Alle</option>
                </select>
            </td>
            <td class="text-center align-middle">
                <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                    <input type="checkbox" class="form-check-input" ${isSchiess ? 'checked' : ''}
                        onchange="onSchiessanlassChange(${idx}, this.checked)" ${!canWrite?'disabled':''}>
                    <button id="poll-btn-${idx}" class="btn btn-xs btn-outline-primary px-1 py-0"
                        style="font-size:0.65rem; display:${isSchiess ? 'inline-block' : 'none'};"
                        onclick="togglePollOptionsEditor(${idx})" ${!canWrite?'disabled':''}>
                        📅 ${optCount > 0 ? optCount + ' Opt.' : 'Optionen'}
                    </button>
                </div>
            </td>
            <td class="text-center align-middle">
                <input type="checkbox" class="form-check-input" ${isTrue(e.aktiv) ? 'checked' : ''} onchange="umfragenState[${idx}].aktiv=this.checked; window.markUnsaved()" ${!canWrite?'disabled':''}>
            </td>
            <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Bei externen Gruppenschiessen automatisch sichtbar (für Teambildung)' : ''}">
                <input type="checkbox" id="cb-part-${idx}" class="form-check-input" ${(isSchiess || isTrue(e.showparticipants)) ? 'checked' : ''}
                    onchange="umfragenState[${idx}].showparticipants=this.checked; window.markUnsaved()"
                    ${!canWrite || isSchiess ? 'disabled' : ''}>
            </td>
            <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Nicht anwendbar bei externen Gruppenschiessen' : ''}">
                <input type="checkbox" id="cb-begl-${idx}" class="form-check-input" ${isTrue(e.frage_begleitung) && !isSchiess ? 'checked' : ''}
                    onchange="umfragenState[${idx}].frage_begleitung=this.checked; window.markUnsaved()"
                    ${!canWrite || isSchiess ? 'disabled' : ''}>
            </td>
            <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Nicht anwendbar bei externen Gruppenschiessen' : ''}">
                <input type="checkbox" id="cb-essen-${idx}" class="form-check-input" ${isTrue(e.frage_essen) && !isSchiess ? 'checked' : ''}
                    onchange="umfragenState[${idx}].frage_essen=this.checked; window.markUnsaved()"
                    ${!canWrite || isSchiess ? 'disabled' : ''}>
            </td>
            <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Nicht anwendbar bei externen Gruppenschiessen' : ''}">
                <input type="checkbox" id="cb-grund-${idx}" class="form-check-input" ${isTrue(e.frage_grund) && !isSchiess ? 'checked' : ''}
                    onchange="umfragenState[${idx}].frage_grund=this.checked; window.markUnsaved()"
                    ${!canWrite || isSchiess ? 'disabled' : ''}>
            </td>
            <td class="align-middle">
                <div class="input-group input-group-sm" style="min-width: 185px;">
                    <input type="text" id="event-doc-input-${idx}" class="form-control form-control-sm"
                        placeholder="URL(s), Drive-ID(s)..."
                        title="Mehrere Dokumente einfach durch Komma trennen (z.B. url1, url2)"
                        value="${escapeHtml(e.dokument_url || '')}"
                        onchange="umfragenState[${idx}].dokument_url=this.value.trim(); renderUmfragenEventDocAction(${idx}); window.markUnsaved()"
                        ${!canWrite ? 'readonly disabled' : ''}>
                    
                    <button class="btn btn-outline-primary px-2" type="button" title="Datei(en) hochladen (auch mehrere auswählbar)"
                        onclick="document.getElementById('event-file-upload-${idx}').click()"
                        ${!canWrite ? 'disabled' : ''}>
                        <i class="fas fa-cloud-upload-alt" id="event-upload-icon-${idx}"></i>
                    </button>
                    
                    <span id="event-doc-links-container-${idx}" class="d-inline-flex align-items-center">
                        ${renderDocActionLinksHtml(e.dokument_url)}
                    </span>
                </div>
                <input type="file" id="event-file-upload-${idx}" class="d-none"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" multiple
                    onchange="if(this.files.length) uploadEventDocumentFiles(this.files, ${idx})">
                <div id="event-doc-status-${idx}" class="small" style="font-size:0.75rem;"></div>
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
        frage_essen: false,
        frage_grund: true,
        dokument_url: "",
        options: []
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
        const cleanEvents = (umfragenState || []).map(e => {
            const opts = (typeof parsePollOptions === 'function') ? parsePollOptions(e.options) : (Array.isArray(e.options) ? e.options : []);
            return {
                ...e,
                options: opts
            };
        });
        const payload = {
            action: "saveEventsAdmin",
            events: cleanEvents
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

// =====================================================================
// POLL-OPTIONEN EDITOR (fuer Auswaertsschiessen)
// =====================================================================

function togglePollOptionsEditor(idx) {
    const editorId = `poll-editor-${idx}`;
    const existing = document.getElementById(editorId);
    if (existing) { existing.remove(); return; }
    renderPollOptionsEditor(idx);
}

function renderPollOptionsEditor(idx) {
    const e = umfragenState[idx];
    if (!e) return;
    e.options = (typeof parsePollOptions === 'function') ? parsePollOptions(e.options) : (Array.isArray(e.options) ? e.options : []);
    const tbody = document.getElementById('umfragen-events-body');
    const rows = tbody.querySelectorAll('tr');
    const targetRow = rows[idx];
    if (!targetRow) return;

    const editorRow = document.createElement('tr');
    editorRow.id = `poll-editor-${idx}`;
    editorRow.style.background = '#eef6ff';
    const td = document.createElement('td');
    td.colSpan = 12;
    td.style.padding = '12px 16px';
    td.innerHTML = `
        <div style="font-weight:700; color:#0f3a5d; margin-bottom:10px;">📅 Poll-Optionen (Datum + Uhrzeit) fuer &laquo;${escapeHtml(e.title || 'Anlass')}&raquo;</div>
        <div id="poll-options-list-${idx}" style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
            ${(e.options || []).map((opt, oi) => renderPollOptionRow(idx, oi, opt)).join('')}
        </div>
        <button class="btn btn-sm btn-outline-primary" onclick="addPollOption(${idx})">
            + Zeitoption hinzufuegen
        </button>
        <small class="text-muted ms-2">Der User sieht alle Optionen als Checkboxen und kann mehrere auswaehlen.</small>
    `;
    editorRow.appendChild(td);
    targetRow.insertAdjacentElement('afterend', editorRow);
}

function renderPollOptionRow(idx, oi, opt) {
    return `
        <div style="display:flex; align-items:center; gap:8px;" id="poll-opt-row-${idx}-${oi}">
            <input type="date" class="form-control form-control-sm" style="width:150px;"
                value="${opt.datum || ''}"
                onchange="updatePollOption(${idx}, ${oi}, 'datum', this.value)">
            <input type="time" class="form-control form-control-sm" style="width:100px;"
                value="${opt.start || ''}" placeholder="09:00"
                onchange="updatePollOption(${idx}, ${oi}, 'start', this.value)">
            <span class="text-muted">&ndash;</span>
            <input type="time" class="form-control form-control-sm" style="width:100px;"
                value="${opt.ende || ''}" placeholder="12:00"
                onchange="updatePollOption(${idx}, ${oi}, 'ende', this.value)">
            <button class="btn btn-sm btn-outline-danger" onclick="removePollOption(${idx}, ${oi})">x</button>
        </div>
    `;
}

function addPollOption(idx) {
    const e = umfragenState[idx];
    if (!Array.isArray(e.options)) e.options = [];
    e.options.push({ id: 'o' + Date.now().toString(36), datum: '', start: '', ende: '' });
    window.markUnsaved();
    const list = document.getElementById(`poll-options-list-${idx}`);
    if (list) list.innerHTML = e.options.map((opt, oi) => renderPollOptionRow(idx, oi, opt)).join('');
}

function removePollOption(idx, oi) {
    const e = umfragenState[idx];
    if (!Array.isArray(e.options)) return;
    e.options.splice(oi, 1);
    window.markUnsaved();
    const list = document.getElementById(`poll-options-list-${idx}`);
    if (list) list.innerHTML = e.options.map((opt, oi2) => renderPollOptionRow(idx, oi2, opt)).join('');
}

function updatePollOption(idx, oi, field, value) {
    const e = umfragenState[idx];
    if (!Array.isArray(e.options) || !e.options[oi]) return;
    e.options[oi][field] = value;
    window.markUnsaved();
}

function onSchiessanlassChange(idx, checked) {
    umfragenState[idx].schiessanlass = checked;
    if (checked) {
        umfragenState[idx].showparticipants = true;
        umfragenState[idx].frage_begleitung = false;
        umfragenState[idx].frage_essen = false;
        umfragenState[idx].frage_grund = false;
    } else {
        umfragenState[idx].showparticipants = false;
    }
    window.markUnsaved();
    const cbPart = document.getElementById(`cb-part-${idx}`);
    const cbBegl = document.getElementById(`cb-begl-${idx}`);
    const cbEssen = document.getElementById(`cb-essen-${idx}`);
    const cbGrund = document.getElementById(`cb-grund-${idx}`);
    if (cbPart) { cbPart.checked = checked; cbPart.disabled = checked; cbPart.closest('td').style.opacity = checked ? '0.3' : '1'; }
    if (cbBegl) { cbBegl.checked = false; cbBegl.disabled = checked; cbBegl.closest('td').style.opacity = checked ? '0.3' : '1'; }
    if (cbEssen) { cbEssen.checked = false; cbEssen.disabled = checked; cbEssen.closest('td').style.opacity = checked ? '0.3' : '1'; }
    if (cbGrund) { cbGrund.checked = false; cbGrund.disabled = checked; cbGrund.closest('td').style.opacity = checked ? '0.3' : '1'; }
    const pollBtn = document.getElementById(`poll-btn-${idx}`);
    if (pollBtn) pollBtn.style.display = checked ? 'inline-block' : 'none';
    if (!checked) { const editor = document.getElementById(`poll-editor-${idx}`); if (editor) editor.remove(); }
}

// =====================================================================
// DOKUMENT-URL & DRIVE-UPLOAD FÜR EVENTS
// =====================================================================

function formatDocLink(urlOrId) {
    if (!urlOrId) return '#';
    const trimmed = String(urlOrId).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    // Falls reine Drive-ID
    return 'https://drive.google.com/file/d/' + encodeURIComponent(trimmed) + '/view?usp=sharing';
}

function renderDocActionLinksHtml(dokumentUrl) {
    if (!dokumentUrl) return '';
    const urls = String(dokumentUrl).split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return '';
    if (urls.length === 1) {
        return `<a href="${formatDocLink(urls[0])}" target="_blank"
            class="btn btn-outline-secondary px-2"
            title="Dokument / Link in neuem Tab öffnen">
            <i class="fas fa-external-link-alt"></i>
        </a>`;
    }
    // Mehrere Dokumente: Buttons mit 1, 2, ...
    return urls.map((u, i) => `
        <a href="${formatDocLink(u)}" target="_blank"
            class="btn btn-outline-secondary px-2 d-inline-flex align-items-center justify-content-center"
            style="font-size:0.72rem; font-weight:700; min-width:28px;"
            title="Dokument ${i + 1} in neuem Tab öffnen">
            ${i + 1} ↗
        </a>
    `).join('');
}

function renderUmfragenEventDocAction(idx) {
    const val = (umfragenState[idx]?.dokument_url || '').trim();
    const container = document.getElementById(`event-doc-links-container-${idx}`);
    if (container) {
        container.innerHTML = renderDocActionLinksHtml(val);
    }
}

async function uploadEventDocumentFiles(fileList, idx) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const statusEl = document.getElementById(`event-doc-status-${idx}`);
    const inputEl = document.getElementById(`event-doc-input-${idx}`);
    const iconEl = document.getElementById(`event-upload-icon-${idx}`);
    const fileInputEl = document.getElementById(`event-file-upload-${idx}`);

    if (iconEl) iconEl.className = 'fas fa-spinner fa-spin';
    if (statusEl) {
        statusEl.innerHTML = `<span class="text-primary"><i class="fas fa-spinner fa-spin me-1"></i> Lade ${files.length} Datei(en) hoch...</span>`;
    }

    const uploadedUrls = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const res = await apiFetch('umfragen', '', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'uploadEventDocument',
                    fileName: file.name,
                    mimeType: file.type || 'application/pdf',
                    base64: base64
                })
            });

            const data = await res.json();
            if (data.success && (data.fileUrl || data.fileId)) {
                uploadedUrls.push(data.fileUrl || data.fileId);
            } else {
                errors.push(`${file.name}: ${data.error || 'Fehler'}`);
            }
        } catch (err) {
            errors.push(`${file.name}: ${err.message || 'Fehler'}`);
        }
    }

    // Bestehende Dokumente behalten und neue anhängen
    if (uploadedUrls.length > 0) {
        const existing = String(umfragenState[idx].dokument_url || '')
            .split(',')
            .map(u => u.trim())
            .filter(Boolean);
        
        uploadedUrls.forEach(u => {
            if (!existing.includes(u)) existing.push(u);
        });

        const finalVal = existing.join(', ');
        umfragenState[idx].dokument_url = finalVal;
        if (inputEl) inputEl.value = finalVal;
        renderUmfragenEventDocAction(idx);
        window.markUnsaved();

        if (statusEl) {
            const msg = `${uploadedUrls.length} Datei(en) erfolgreich hochgeladen!`;
            statusEl.innerHTML = `<span class="text-success"><i class="fas fa-check-circle me-1"></i> ${msg} (Speichern nicht vergessen)</span>`;
            setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 6000);
        }
    } else if (errors.length > 0 && statusEl) {
        statusEl.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i> ${escapeHtml(errors.join(', '))}</span>`;
    }

    if (iconEl) iconEl.className = 'fas fa-cloud-upload-alt';
    if (fileInputEl) fileInputEl.value = '';
}
