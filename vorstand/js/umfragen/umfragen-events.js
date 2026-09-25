// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - EVENTS ===

function renderUmfragenEventsList() {
    const tbody = document.getElementById('umfragen-events-body');
    const cardsContainer = document.getElementById('umfragen-events-cards');
    
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

    if (!umfragenState || umfragenState.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="text-center p-4 text-muted">Keine Events gefunden.</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div class="text-center p-4 text-muted border rounded bg-white">Keine Events gefunden.</div>';
        return;
    }

    // 1. Desktop Table Rows
    if (tbody) {
        tbody.innerHTML = umfragenState.map((e, idx) => renderDesktopEventRow(e, idx, canWrite)).join('');
    }

    // 2. Mobile Cards
    if (cardsContainer) {
        cardsContainer.innerHTML = umfragenState.map((e, idx) => renderMobileEventCard(e, idx, canWrite)).join('');
    }

    // Datalist für Gruppen pflegen
    const datalist = document.getElementById('umfragen-gruppe-list');
    if(datalist) {
        const uniqueGroups = Array.from(new Set(umfragenState.map(e => String(e.gruppe || '').trim()).filter(Boolean)));
        uniqueGroups.sort();
        datalist.innerHTML = uniqueGroups.map(g => `<option value="${escapeHtml(g)}">`).join('');
    }
}

function renderDesktopEventRow(e, idx, canWrite) {
    const isSchiess = isTrue(e.schiessanlass);
    const parsedOpts = (typeof parsePollOptions === 'function') ? parsePollOptions(e.options) : (Array.isArray(e.options) ? e.options : []);
    const optCount = parsedOpts.length;

    return `
    <tr>
        <td class="text-muted small align-middle">${escapeHtml(e.id || '-')}</td>
        <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(e.title || '')}" onchange="umfragenState[${idx}].title=this.value; syncEventField(${idx}, 'title', this.value); window.markUnsaved()" ${!canWrite?'readonly disabled':''}></td>
        <td><input type="date" class="form-control form-control-sm" value="${formatISODate(e.datum)}" onchange="umfragenState[${idx}].datum=this.value; syncEventField(${idx}, 'datum', this.value); window.markUnsaved()" ${!canWrite?'readonly disabled':''}></td>
        <td>
            <select class="form-select form-select-sm" onchange="umfragenState[${idx}].gruppe=this.value; syncEventField(${idx}, 'gruppe', this.value); window.markUnsaved()" ${!canWrite?'disabled':''}>
                <option value="aktiv" ${(e.gruppe === 'aktiv' || !e.gruppe) ? 'selected' : ''}>Aktiv</option>
                <option value="passiv" ${e.gruppe === 'passiv' ? 'selected' : ''}>Passiv</option>
                <option value="alle" ${e.gruppe === 'alle' ? 'selected' : ''}>Alle</option>
            </select>
        </td>
        <td class="text-center align-middle">
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <input type="checkbox" id="cb-schiess-${idx}" class="form-check-input" ${isSchiess ? 'checked' : ''}
                    onchange="onSchiessanlassChange(${idx}, this.checked)" ${!canWrite?'disabled':''}>
                <button id="poll-btn-${idx}" class="btn btn-xs btn-outline-primary px-1 py-0"
                    style="font-size:0.65rem; display:${isSchiess ? 'inline-block' : 'none'};"
                    onclick="togglePollOptionsEditor(${idx})" ${!canWrite?'disabled':''}>
                    📅 ${optCount > 0 ? optCount + ' Opt.' : 'Optionen'}
                </button>
            </div>
        </td>
        <td class="text-center align-middle">
            <input type="checkbox" id="cb-aktiv-${idx}" class="form-check-input" ${isTrue(e.aktiv) ? 'checked' : ''} onchange="umfragenState[${idx}].aktiv=this.checked; syncEventField(${idx}, 'aktiv', this.checked); window.markUnsaved()" ${!canWrite?'disabled':''}>
        </td>
        <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Bei externen Gruppenschiessen automatisch sichtbar (für Teambildung)' : ''}">
            <input type="checkbox" id="cb-part-${idx}" class="form-check-input" ${(isSchiess || isTrue(e.showparticipants)) ? 'checked' : ''}
                onchange="umfragenState[${idx}].showparticipants=this.checked; syncEventField(${idx}, 'showparticipants', this.checked); window.markUnsaved()"
                ${!canWrite || isSchiess ? 'disabled' : ''}>
        </td>
        <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Nicht anwendbar bei externen Gruppenschiessen' : ''}">
            <input type="checkbox" id="cb-begl-${idx}" class="form-check-input" ${isTrue(e.frage_begleitung) && !isSchiess ? 'checked' : ''}
                onchange="umfragenState[${idx}].frage_begleitung=this.checked; syncEventField(${idx}, 'frage_begleitung', this.checked); window.markUnsaved()"
                ${!canWrite || isSchiess ? 'disabled' : ''}>
        </td>
        <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Nicht anwendbar bei externen Gruppenschiessen' : ''}">
            <input type="checkbox" id="cb-essen-${idx}" class="form-check-input" ${isTrue(e.frage_essen) && !isSchiess ? 'checked' : ''}
                onchange="umfragenState[${idx}].frage_essen=this.checked; syncEventField(${idx}, 'frage_essen', this.checked); window.markUnsaved()"
                ${!canWrite || isSchiess ? 'disabled' : ''}>
        </td>
        <td class="text-center align-middle" style="opacity:${isSchiess ? '0.3' : '1'}" title="${isSchiess ? 'Nicht anwendbar bei externen Gruppenschiessen' : ''}">
            <input type="checkbox" id="cb-grund-${idx}" class="form-check-input" ${isTrue(e.frage_grund) && !isSchiess ? 'checked' : ''}
                onchange="umfragenState[${idx}].frage_grund=this.checked; syncEventField(${idx}, 'frage_grund', this.checked); window.markUnsaved()"
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
}

function renderMobileEventCard(e, idx, canWrite) {
    const isSchiess = isTrue(e.schiessanlass);
    const parsedOpts = (typeof parsePollOptions === 'function') ? parsePollOptions(e.options) : (Array.isArray(e.options) ? e.options : []);
    const optCount = parsedOpts.length;
    const isAktiv = isTrue(e.aktiv);

    return `
    <div class="event-mobile-card" id="event-mobile-card-${idx}">
        <!-- Card Top Bar: Status Badge + Aktiv Toggle + Delete -->
        <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="d-flex align-items-center gap-2">
                <span id="mob-badge-aktiv-${idx}" class="badge ${isAktiv ? 'bg-success' : 'bg-secondary'}" style="font-size:0.75rem;">
                    ${isAktiv ? 'Aktiv' : 'Inaktiv'}
                </span>
                <span class="text-muted small">#${escapeHtml(e.id || '-')}</span>
            </div>
            <div class="d-flex align-items-center gap-2">
                <div class="form-check form-switch m-0" title="Event aktiv schalten">
                    <input type="checkbox" class="form-check-input" role="switch"
                        id="mob-cb-aktiv-${idx}"
                        ${isAktiv ? 'checked' : ''}
                        onchange="umfragenState[${idx}].aktiv=this.checked; syncEventField(${idx}, 'aktiv', this.checked); window.markUnsaved()"
                        ${!canWrite ? 'disabled' : ''}>
                </div>
                <button class="btn btn-sm btn-outline-danger p-1 px-2"
                    onclick="removeUmfrageEvent(${idx})" ${!canWrite ? 'disabled' : ''} title="Event löschen">
                    🗑️
                </button>
            </div>
        </div>

        <!-- Titel Input (Vollbreite, sofort lesbar & editierbar) -->
        <div class="mb-2">
            <label class="form-label text-muted small mb-1 fw-bold">Titel des Anlasses</label>
            <input type="text" id="mob-input-title-${idx}" class="form-control"
                value="${escapeHtml(e.title || '')}"
                placeholder="z.B. Endschiessen 2026"
                onchange="umfragenState[${idx}].title=this.value; syncEventField(${idx}, 'title', this.value); window.markUnsaved()"
                ${!canWrite ? 'readonly disabled' : ''}>
        </div>

        <!-- Datum & Personenkreis nebeneinander -->
        <div class="row g-2 mb-2">
            <div class="col-6">
                <label class="form-label text-muted small mb-1 fw-bold">Datum</label>
                <input type="date" id="mob-input-datum-${idx}" class="form-control form-control-sm"
                    value="${formatISODate(e.datum)}"
                    onchange="umfragenState[${idx}].datum=this.value; syncEventField(${idx}, 'datum', this.value); window.markUnsaved()"
                    ${!canWrite ? 'readonly disabled' : ''}>
            </div>
            <div class="col-6">
                <label class="form-label text-muted small mb-1 fw-bold">Personenkreis</label>
                <select id="mob-select-gruppe-${idx}" class="form-select form-select-sm"
                    onchange="umfragenState[${idx}].gruppe=this.value; syncEventField(${idx}, 'gruppe', this.value); window.markUnsaved()"
                    ${!canWrite ? 'disabled' : ''}>
                    <option value="aktiv" ${(e.gruppe === 'aktiv' || !e.gruppe) ? 'selected' : ''}>Aktiv</option>
                    <option value="passiv" ${e.gruppe === 'passiv' ? 'selected' : ''}>Passiv</option>
                    <option value="alle" ${e.gruppe === 'alle' ? 'selected' : ''}>Alle</option>
                </select>
            </div>
        </div>

        <!-- Optionen Box -->
        <div class="p-2 mb-2 rounded border bg-light">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="form-check m-0">
                    <input type="checkbox" class="form-check-input" id="mob-cb-schiess-${idx}"
                        ${isSchiess ? 'checked' : ''}
                        onchange="onSchiessanlassChange(${idx}, this.checked)"
                        ${!canWrite ? 'disabled' : ''}>
                    <label class="form-check-label fw-bold small text-dark" for="mob-cb-schiess-${idx}">
                        🎯 Ext. Gruppenschiessen
                    </label>
                </div>
                <button id="mob-poll-btn-${idx}" class="btn btn-xs btn-outline-primary px-2 py-1"
                    style="font-size:0.75rem; display:${isSchiess ? 'inline-block' : 'none'};"
                    onclick="togglePollOptionsEditor(${idx})" ${!canWrite ? 'disabled' : ''}>
                    📅 ${optCount > 0 ? optCount + ' Optionen' : '+ Optionen'}
                </button>
            </div>

            <!-- Zusätzliche Fragen / Optionen -->
            <div class="d-flex flex-wrap gap-2 pt-2 border-top" style="font-size:0.8rem;">
                <div class="form-check form-check-inline m-0" style="opacity:${isSchiess ? '0.3' : '1'}">
                    <input type="checkbox" class="form-check-input" id="mob-cb-part-${idx}"
                        ${(isSchiess || isTrue(e.showparticipants)) ? 'checked' : ''}
                        onchange="umfragenState[${idx}].showparticipants=this.checked; syncEventField(${idx}, 'showparticipants', this.checked); window.markUnsaved()"
                        ${!canWrite || isSchiess ? 'disabled' : ''}>
                    <label class="form-check-label small" for="mob-cb-part-${idx}">👁️ Teilnehmer</label>
                </div>
                <div class="form-check form-check-inline m-0" style="opacity:${isSchiess ? '0.3' : '1'}">
                    <input type="checkbox" class="form-check-input" id="mob-cb-begl-${idx}"
                        ${isTrue(e.frage_begleitung) && !isSchiess ? 'checked' : ''}
                        onchange="umfragenState[${idx}].frage_begleitung=this.checked; syncEventField(${idx}, 'frage_begleitung', this.checked); window.markUnsaved()"
                        ${!canWrite || isSchiess ? 'disabled' : ''}>
                    <label class="form-check-label small" for="mob-cb-begl-${idx}">👥 Begleitung</label>
                </div>
                <div class="form-check form-check-inline m-0" style="opacity:${isSchiess ? '0.3' : '1'}">
                    <input type="checkbox" class="form-check-input" id="mob-cb-essen-${idx}"
                        ${isTrue(e.frage_essen) && !isSchiess ? 'checked' : ''}
                        onchange="umfragenState[${idx}].frage_essen=this.checked; syncEventField(${idx}, 'frage_essen', this.checked); window.markUnsaved()"
                        ${!canWrite || isSchiess ? 'disabled' : ''}>
                    <label class="form-check-label small" for="mob-cb-essen-${idx}">🍽️ Essen</label>
                </div>
                <div class="form-check form-check-inline m-0" style="opacity:${isSchiess ? '0.3' : '1'}">
                    <input type="checkbox" class="form-check-input" id="mob-cb-grund-${idx}"
                        ${isTrue(e.frage_grund) && !isSchiess ? 'checked' : ''}
                        onchange="umfragenState[${idx}].frage_grund=this.checked; syncEventField(${idx}, 'frage_grund', this.checked); window.markUnsaved()"
                        ${!canWrite || isSchiess ? 'disabled' : ''}>
                    <label class="form-check-label small" for="mob-cb-grund-${idx}">💬 Grund</label>
                </div>
            </div>

            <!-- Mobiler Poll-Optionen Editor Container -->
            <div id="mob-poll-editor-${idx}" class="mt-2 p-2 rounded border bg-white" style="display:none;">
                <div style="font-weight:700; color:#0f3a5d; font-size:0.8rem; margin-bottom:6px;">
                    📅 Poll-Optionen fuer &laquo;${escapeHtml(e.title || 'Anlass')}&raquo;
                </div>
                <div id="mob-poll-options-list-${idx}" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                    ${(e.options || []).map((opt, oi) => renderPollOptionRow(idx, oi, opt)).join('')}
                </div>
                <button class="btn btn-xs btn-outline-primary py-1 px-2" style="font-size:0.75rem;" onclick="addPollOption(${idx})">
                    + Zeitoption hinzufügen
                </button>
            </div>
        </div>

        <!-- Dokument / Link / Upload -->
        <div>
            <label class="form-label text-muted small mb-1 fw-bold">📄 Dokument / Beilage (PDF, Word, Drive-ID)</label>
            <div class="input-group input-group-sm">
                <input type="text" id="event-doc-input-mob-${idx}" class="form-control"
                    placeholder="URL(s), Drive-ID(s)..."
                    value="${escapeHtml(e.dokument_url || '')}"
                    onchange="umfragenState[${idx}].dokument_url=this.value.trim(); renderUmfragenEventDocAction(${idx}); window.markUnsaved()"
                    ${!canWrite ? 'readonly disabled' : ''}>
                
                <button class="btn btn-outline-primary px-2" type="button" title="Datei(en) hochladen"
                    onclick="document.getElementById('event-file-upload-mob-${idx}').click()"
                    ${!canWrite ? 'disabled' : ''}>
                    <i class="fas fa-cloud-upload-alt" id="event-upload-icon-mob-${idx}"></i>
                </button>
                
                <span id="event-doc-links-container-mob-${idx}" class="d-inline-flex align-items-center">
                    ${renderDocActionLinksHtml(e.dokument_url)}
                </span>
            </div>
            <input type="file" id="event-file-upload-mob-${idx}" class="d-none"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" multiple
                onchange="if(this.files.length) uploadEventDocumentFiles(this.files, ${idx}, true)">
            <div id="event-doc-status-mob-${idx}" class="small" style="font-size:0.75rem;"></div>
        </div>
    </div>
    `;
}

// Synchronisiert Eingaben zwischen Desktop-Tabelle und Mobile-Card
function syncEventField(idx, field, value) {
    if (field === 'title') {
        const mob = document.getElementById(`mob-input-title-${idx}`);
        if (mob && mob.value !== value) mob.value = value;
    } else if (field === 'datum') {
        const mob = document.getElementById(`mob-input-datum-${idx}`);
        if (mob && mob.value !== value) mob.value = value;
    } else if (field === 'gruppe') {
        const mob = document.getElementById(`mob-select-gruppe-${idx}`);
        if (mob && mob.value !== value) mob.value = value;
    } else if (field === 'aktiv') {
        const cb = document.getElementById(`cb-aktiv-${idx}`);
        if (cb && cb.checked !== value) cb.checked = value;
        const mobCb = document.getElementById(`mob-cb-aktiv-${idx}`);
        if (mobCb && mobCb.checked !== value) mobCb.checked = value;
        const badge = document.getElementById(`mob-badge-aktiv-${idx}`);
        if (badge) {
            badge.className = `badge ${value ? 'bg-success' : 'bg-secondary'}`;
            badge.innerText = value ? 'Aktiv' : 'Inaktiv';
        }
    } else if (field === 'showparticipants') {
        const mob = document.getElementById(`mob-cb-part-${idx}`);
        if (mob && mob.checked !== value) mob.checked = value;
        const dt = document.getElementById(`cb-part-${idx}`);
        if (dt && dt.checked !== value) dt.checked = value;
    } else if (field === 'frage_begleitung') {
        const mob = document.getElementById(`mob-cb-begl-${idx}`);
        if (mob && mob.checked !== value) mob.checked = value;
        const dt = document.getElementById(`cb-begl-${idx}`);
        if (dt && dt.checked !== value) dt.checked = value;
    } else if (field === 'frage_essen') {
        const mob = document.getElementById(`mob-cb-essen-${idx}`);
        if (mob && mob.checked !== value) mob.checked = value;
        const dt = document.getElementById(`cb-essen-${idx}`);
        if (dt && dt.checked !== value) dt.checked = value;
    } else if (field === 'frage_grund') {
        const mob = document.getElementById(`mob-cb-grund-${idx}`);
        if (mob && mob.checked !== value) mob.checked = value;
        const dt = document.getElementById(`cb-grund-${idx}`);
        if (dt && dt.checked !== value) dt.checked = value;
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
    if(!confirm("Alle Events in der Umfrage-App speichern?")) return;
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

        // 1. SUPABASE MASTER: Direkt und schnell speichern
        const supa = (typeof getPollSupabaseClient === 'function') ? getPollSupabaseClient() : (window.supabaseClient || null);
        if (supa) {
            const pollRows = cleanEvents.map(e => ({
                id: String(e.id || ('pe_' + Date.now())),
                title: String(e.title || 'Unbenannter Anlass'),
                datum: e.datum ? formatISODate(e.datum) : null,
                gruppe: String(e.gruppe || 'aktiv').trim(),
                schiessanlass: isTrue(e.schiessanlass),
                aktiv: isTrue(e.aktiv),
                showparticipants: isTrue(e.showparticipants),
                frage_begleitung: isTrue(e.frage_begleitung),
                frage_essen: isTrue(e.frage_essen),
                frage_grund: isTrue(e.frage_grund),
                dokument_url: String(e.dokument_url || ''),
                details: String(e.details || ''),
                options: e.options || []
            }));

            const { error: supaErr } = await supa.from('poll_events').upsert(pollRows);
            if (supaErr) {
                console.error("Fehler beim Speichern in Supabase:", supaErr);
                throw new Error("Supabase Fehler: " + supaErr.message);
            }
            console.log(`✅ ${pollRows.length} Events erfolgreich in Supabase gespeichert.`);
        }

        window.clearUnsaved();
        alert("✅ Umfragen erfolgreich in Supabase gespeichert!");
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
    // 1. Mobile Editor umschalten, falls vorhanden
    const mobEditor = document.getElementById(`mob-poll-editor-${idx}`);
    if (mobEditor) {
        mobEditor.style.display = (mobEditor.style.display === 'none') ? 'block' : 'none';
    }

    // 2. Desktop Editor umschalten
    const editorId = `poll-editor-${idx}`;
    const existing = document.getElementById(editorId);
    if (existing) {
        existing.remove();
        return;
    }
    renderPollOptionsEditor(idx);
}

function renderPollOptionsEditor(idx) {
    const e = umfragenState[idx];
    if (!e) return;
    e.options = (typeof parsePollOptions === 'function') ? parsePollOptions(e.options) : (Array.isArray(e.options) ? e.options : []);
    const tbody = document.getElementById('umfragen-events-body');
    if (!tbody) return;
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
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;" id="poll-opt-row-${idx}-${oi}">
            <input type="date" class="form-control form-control-sm" style="flex:1; min-width:130px;"
                value="${opt.datum || ''}"
                onchange="updatePollOption(${idx}, ${oi}, 'datum', this.value)">
            <input type="time" class="form-control form-control-sm" style="width:90px;"
                value="${opt.start || ''}" placeholder="09:00"
                onchange="updatePollOption(${idx}, ${oi}, 'start', this.value)">
            <span class="text-muted">&ndash;</span>
            <input type="time" class="form-control form-control-sm" style="width:90px;"
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
    const mobList = document.getElementById(`mob-poll-options-list-${idx}`);
    if (mobList) mobList.innerHTML = e.options.map((opt, oi) => renderPollOptionRow(idx, oi, opt)).join('');
    updatePollButtonsText(idx);
}

function removePollOption(idx, oi) {
    const e = umfragenState[idx];
    if (!Array.isArray(e.options)) return;
    e.options.splice(oi, 1);
    window.markUnsaved();
    const list = document.getElementById(`poll-options-list-${idx}`);
    if (list) list.innerHTML = e.options.map((opt, oi2) => renderPollOptionRow(idx, oi2, opt)).join('');
    const mobList = document.getElementById(`mob-poll-options-list-${idx}`);
    if (mobList) mobList.innerHTML = e.options.map((opt, oi2) => renderPollOptionRow(idx, oi2, opt)).join('');
    updatePollButtonsText(idx);
}

function updatePollOption(idx, oi, field, value) {
    const e = umfragenState[idx];
    if (!Array.isArray(e.options) || !e.options[oi]) return;
    e.options[oi][field] = value;
    window.markUnsaved();
}

function updatePollButtonsText(idx) {
    const e = umfragenState[idx];
    const count = (e && Array.isArray(e.options)) ? e.options.length : 0;
    const txt = count > 0 ? `${count} Opt.` : 'Optionen';
    const mobTxt = count > 0 ? `${count} Optionen` : '+ Optionen';
    const b1 = document.getElementById(`poll-btn-${idx}`);
    if (b1) b1.innerText = '📅 ' + txt;
    const b2 = document.getElementById(`mob-poll-btn-${idx}`);
    if (b2) b2.innerText = '📅 ' + mobTxt;
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

    // 1. Desktop Elemente aktualisieren
    const cbSchiess = document.getElementById(`cb-schiess-${idx}`);
    if (cbSchiess && cbSchiess.checked !== checked) cbSchiess.checked = checked;
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

    // 2. Mobile Elemente aktualisieren
    const mobCbSchiess = document.getElementById(`mob-cb-schiess-${idx}`);
    if (mobCbSchiess && mobCbSchiess.checked !== checked) mobCbSchiess.checked = checked;
    const mobCbPart = document.getElementById(`mob-cb-part-${idx}`);
    const mobCbBegl = document.getElementById(`mob-cb-begl-${idx}`);
    const mobCbEssen = document.getElementById(`mob-cb-essen-${idx}`);
    const mobCbGrund = document.getElementById(`mob-cb-grund-${idx}`);
    if (mobCbPart) { mobCbPart.checked = checked; mobCbPart.disabled = checked; mobCbPart.closest('.form-check').style.opacity = checked ? '0.3' : '1'; }
    if (mobCbBegl) { mobCbBegl.checked = false; mobCbBegl.disabled = checked; mobCbBegl.closest('.form-check').style.opacity = checked ? '0.3' : '1'; }
    if (mobCbEssen) { mobCbEssen.checked = false; mobCbEssen.disabled = checked; mobCbEssen.closest('.form-check').style.opacity = checked ? '0.3' : '1'; }
    if (mobCbGrund) { mobCbGrund.checked = false; mobCbGrund.disabled = checked; mobCbGrund.closest('.form-check').style.opacity = checked ? '0.3' : '1'; }
    const mobPollBtn = document.getElementById(`mob-poll-btn-${idx}`);
    if (mobPollBtn) mobPollBtn.style.display = checked ? 'inline-block' : 'none';
    const mobEditor = document.getElementById(`mob-poll-editor-${idx}`);
    if (mobEditor && !checked) mobEditor.style.display = 'none';
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
    
    // Desktop
    const container = document.getElementById(`event-doc-links-container-${idx}`);
    if (container) container.innerHTML = renderDocActionLinksHtml(val);
    const inputEl = document.getElementById(`event-doc-input-${idx}`);
    if (inputEl && inputEl.value !== val) inputEl.value = val;

    // Mobile
    const mobContainer = document.getElementById(`event-doc-links-container-mob-${idx}`);
    if (mobContainer) mobContainer.innerHTML = renderDocActionLinksHtml(val);
    const mobInputEl = document.getElementById(`event-doc-input-mob-${idx}`);
    if (mobInputEl && mobInputEl.value !== val) mobInputEl.value = val;
}

async function uploadEventDocumentFiles(fileList, idx, isMobile = false) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const statusEl = document.getElementById(isMobile ? `event-doc-status-mob-${idx}` : `event-doc-status-${idx}`);
    const iconEl = document.getElementById(isMobile ? `event-upload-icon-mob-${idx}` : `event-upload-icon-${idx}`);
    const fileInputEl = document.getElementById(isMobile ? `event-file-upload-mob-${idx}` : `event-file-upload-${idx}`);

    if (iconEl) iconEl.className = 'fas fa-spinner fa-spin';
    if (statusEl) {
        statusEl.innerHTML = `<span class="text-primary"><i class="fas fa-spinner fa-spin me-1"></i> Lade ${files.length} Datei(en) hoch...</span>`;
    }

    const uploadedUrls = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const supa = (typeof getPollSupabaseClient === 'function') ? getPollSupabaseClient() : (window.supabaseClient || null);
            if (!supa) throw new Error("Supabase-Client nicht verfügbar");

            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `event-documents/${Date.now()}_${cleanName}`;

            const { error: upErr } = await supa.storage.from('operatives-storage').upload(storagePath, file, {
                upsert: true,
                contentType: file.type || 'application/octet-stream'
            });

            if (upErr) throw new Error(upErr.message);

            const { data: urlData } = supa.storage.from('operatives-storage').getPublicUrl(storagePath);
            const publicUrl = urlData?.publicUrl;
            if (publicUrl) {
                uploadedUrls.push(publicUrl);
            } else {
                errors.push(`${file.name}: Keine öffentliche URL generiert`);
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
