// === MODUL: UMFRAGEN & ANMELDUNGEN ===

let umfragenState = null;
let currentEventId = null;
let eventParticipants = [];
let membersLookup = null;
let umfragenSortField = 'datum';
let umfragenSortDir = -1;

async function loadUmfragenData() {
  const container = document.getElementById('umfragen-container');
  if(!container) return;
  
  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade Umfragen & Events...</div>

        <!-- TAB 4: ERWEITERTES CONTROLLING (GV & PRAESENZ) -->
        <div class="tab-pane fade" id="tab-umfragen-controlling">
            <div class="row g-3">
                <div class="col-md-12 write-protected">
                    <div class="card p-3 mb-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="card-title mb-0">&#128640; Tools</h5>
                            <button class="btn btn-success btn-sm write-protected" onclick="saveGVData()">&#128190; GV-Stammdaten speichern</button>
                        </div>
                        <div class="d-flex gap-2 flex-wrap">
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('genPDF')">&#128196; Einladungs-PDF</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendMails')">&#128231; GV Mails senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendReminders')">&#128276; Mahnungen senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendSummary')">&#128202; Uebersicht senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendPraesenz')">&#128221; Praesenzliste senden</button>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card p-3">
                        <h5 class="card-title">Stammdaten / Platzhalter</h5>
                        <div id="gv-list-embedded"></div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card p-3">
                        <h5 class="card-title">Praesenz / Anmeldungen (Eventplaner)</h5>
                        <div class="mb-2">
                            <label class="form-label small">Verknuepftes Event waehlen:</label>
                            <select class="form-select form-select-sm" id="gv-event-selector" onchange="loadGVParticipants(this.value)">
                                <option value="">-- Lade Events... --</option>
                            </select>
                        </div>
                        <div class="table-responsive" style="max-height: 430px;">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th style="cursor: pointer;" onclick="sortGvTable('name')">Name &#8645;</th>
                                        <th style="cursor: pointer;" onclick="sortGvTable('status')">Teilnahme &#8645;</th>
                                    </tr>
                                </thead>
                                <tbody id="gv-anmelde-body">
                                    <tr><td colspan="2" class="text-center text-muted">Bitte Event auswaehlen</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="gv-anmelde-summary" class="mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  `;

  try {
    // Falls das backend noch nicht aktualisiert wurde, fangen wir das weich ab
    const res = await apiFetch('umfragen', 'action=getAllEventsAdmin');
    const data = await res.json();
    
    if(data.error) throw new Error(data.error);

    umfragenState = Array.isArray(data) ? data : (data.events || []);
    renderUmfragenUI(container);
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden (Google Script bereits aktualisiert?): ${escapeHtml(e.message)}</div>`;
  }
}

function renderUmfragenUI(container) {
  if (!container) return;
  
  // Haupt-Layout mit Tabs
  container.innerHTML = `
    <ul class="nav nav-tabs mb-3" id="umfragen-tabs">
        <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-umfragen-events">🗓️ Events verwalten</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-teilnehmer" onclick="loadParticipantsIfEventSelected()">👥 Auswertung & Mails</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-gruppen" onclick="loadGroupsIfEventSelected()">🎯 Gruppen-Anmeldung</a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-controlling" onclick="initGVControllingTab()">&#9881;&#65039; Generalversammlungen</a></li>
    </ul>

    <div class="tab-content">
        <!-- TAB 1: EVENTS VERWALTEN -->
        <div class="tab-pane fade show active" id="tab-umfragen-events">
            <button class="btn btn-sm btn-success mb-2 write-protected" onclick="addUmfrageEvent()">+ Neuer Event</button>
            <div class="table-responsive bg-white border rounded">
                <table class="table table-sm table-hover mb-0" style="min-width: 800px;">
                    <thead class="table-light">
                        <tr style="cursor:pointer; user-select:none;">
                            <th onclick="sortUmfragenEvents('id')">ID ⇅</th>
                            <th onclick="sortUmfragenEvents('title')">Titel ⇅</th>
                            <th onclick="sortUmfragenEvents('datum')">Datum ⇅</th>
                            <th onclick="sortUmfragenEvents('gruppe')">Personenkreis ⇅</th>
                            <th class="text-center" onclick="sortUmfragenEvents('schiessanlass')">Schiess-<br>anlass 🎯 ⇅</th>
                            <th class="text-center" onclick="sortUmfragenEvents('aktiv')">Aktiv ⇅</th>
                            <th class="text-center" onclick="sortUmfragenEvents('showparticipants')">Teilnehmer<br>sichtbar ⇅</th>
                            <th class="text-center" style="cursor:default;">Frage:<br>Begleitung</th>
                            <th class="text-center" style="cursor:default;">Frage:<br>Essen</th>
                            <th style="cursor:default;"></th>
                        </tr>
                    </thead>
                    <tbody id="umfragen-events-body"></tbody>
                </table>
                <datalist id="umfragen-gruppe-list"></datalist>
            </div>
        </div>

        <!-- TAB 2: TEILNEHMER AUSWERTUNG -->
        <div class="tab-pane fade" id="tab-umfragen-teilnehmer">
            <div class="row g-3">
                <div class="col-md-5">
                    <div class="card shadow-sm border-0 p-3">
                        <label class="form-label fw-bold">Event Auswählen</label>
                        <select class="form-select" id="umfragen-event-selector" onchange="selectEventForParticipants(this.value)">
                            <option value="">-- Bitte wählen --</option>
                            ${(umfragenState || []).map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title || 'Ohne Titel')} (${e.datum ? e.datum.split('T')[0] : '-'})${isTrue(e.schiessanlass) ? ' 🎯' : ''}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="col-md-7">
                    <div class="card shadow-sm border-0 p-3 h-100">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                             <h5 class="card-title mb-0">Angemeldete Teilnehmer ("Ja")</h5>
                             <div class="d-flex gap-2">
                                 <button class="btn btn-sm btn-primary" id="btn-umfragen-mail" onclick="generateMailForParticipants()" disabled>
                                     📧 Mail an Teilnehmer
                                 </button>
                             </div>
                        </div>
                        <div id="umfragen-teilnehmer-list" class="small mt-2">
                            <div class="text-muted">Bitte wähle links einen Event aus.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 3: GRUPPEN AUTOMATISIERUNG -->
        <div class="tab-pane fade" id="tab-umfragen-gruppen">
            <div class="row g-3">
                <div class="col-md-4">
                    <div class="card shadow-sm border-0 p-3">
                        <label class="form-label fw-bold">Schiessanlass wählen</label>
                        <select class="form-select" id="umfragen-gruppen-event-selector" onchange="selectEventForGroups(this.value)">
                            <option value="">-- Bitte wählen --</option>
                            ${(umfragenState || []).filter(e => isTrue(e.schiessanlass)).map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)} (${e.datum ? e.datum.split('T')[0] : '-'})</option>`).join('')}
                        </select>
                        <div class="mt-3 small text-muted">
                            <i class="fas fa-info-circle"></i> Nur Events, die als 🎯 <b>Schiessanlass</b> markiert sind, erscheinen hier.
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card shadow-sm border-0 p-3">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="card-title mb-0">Gruppen-Vorschlag (5er Teams)</h5>
                            <button type="button" class="btn btn-sm btn-primary" id="btn-generate-group-mail" onclick="generateGroupMail()" disabled>
                                📧 Gruppen-Anmeldung Mail
                            </button>
                        </div>
                        <div id="umfragen-gruppen-container" class="small">
                            <div class="text-muted">Wähle einen Schiessanlass aus, um die Gruppenbildung zu sehen.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 4: ERWEITERTES CONTROLLING (GV & PRAESENZ) -->
        <div class="tab-pane fade" id="tab-umfragen-controlling">
            <div class="row g-3">
                <div class="col-md-12 write-protected">
                    <div class="card p-3 mb-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="card-title mb-0">&#128640; Tools</h5>
                            <button class="btn btn-success btn-sm write-protected" onclick="saveGVData()">&#128190; GV-Stammdaten speichern</button>
                        </div>
                        <div class="d-flex gap-2 flex-wrap">
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('genPDF')">&#128196; Einladungs-PDF</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendMails')">&#128231; GV Mails senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendReminders')">&#128276; Mahnungen senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendSummary')">&#128202; Uebersicht senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendPraesenz')">&#128221; Praesenzliste senden</button>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card p-3">
                        <h5 class="card-title">Stammdaten / Platzhalter</h5>
                        <div id="gv-list-embedded"></div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card p-3">
                        <h5 class="card-title">Praesenz / Anmeldungen (Eventplaner)</h5>
                        <div class="mb-2">
                            <label class="form-label small">Verknuepftes Event waehlen:</label>
                            <select class="form-select form-select-sm" id="gv-event-selector" onchange="loadGVParticipants(this.value)">
                                <option value="">-- Lade Events... --</option>
                            </select>
                        </div>
                        <div class="table-responsive" style="max-height: 430px;">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th style="cursor: pointer;" onclick="sortGvTable('name')">Name &#8645;</th>
                                        <th style="cursor: pointer;" onclick="sortGvTable('status')">Teilnahme &#8645;</th>
                                    </tr>
                                </thead>
                                <tbody id="gv-anmelde-body">
                                    <tr><td colspan="2" class="text-center text-muted">Bitte Event auswaehlen</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="gv-anmelde-summary" class="mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  `;
  renderUmfragenEventsList();
}

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

function isTrue(val) {
    if(val === true || val === 1 || String(val).toLowerCase() === 'ja' || String(val).toLowerCase() === 'true') return true;
    return false;
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

// === TEILNEHMER & MAIL ===

async function ensureMembersLookup() {
    if(membersLookup !== null) return;
    membersLookup = {};
    try {
        // Fetch original mitglieder list to get addresses
        const res = await apiFetch('mitglieder', 'action=getAll');
        const data = await res.json();
        const members = Array.isArray(data.data) ? data.data : [];
        members.forEach(m => {
            if(m.PersonNumber) {
                membersLookup[String(m.PersonNumber).trim()] = m;
            }
            if(m.AddressNumber) {
                membersLookup[String(m.AddressNumber).trim()] = m;
                membersLookup[String(m.AddressNumber).trim().padStart(6, '0')] = m;
            }
        });
    } catch(e) {
        console.error("Fehler beim Laden der Mitglieder-Adressen", e);
    }
}

async function selectEventForParticipants(eventId) {
    currentEventId = eventId;
    loadParticipantsIfEventSelected();
}

async function loadParticipantsIfEventSelected() {
    if(!currentEventId) return;
    const listDiv = document.getElementById('umfragen-teilnehmer-list');
    const mailBtn = document.getElementById('btn-umfragen-mail');
    if(!listDiv) return;

    listDiv.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div> Lade Teilnehmer...`;
    if(mailBtn) mailBtn.disabled = true;
    try {
        await ensureMembersLookup();

        const res = await apiFetch('umfragen', `action=getParticipants&eventid=${encodeURIComponent(currentEventId)}`);
        const pData = await res.json();
        // pData is array of {lizenz, name} // The GAS only returns Lizenz + Name
        
        eventParticipants = [];

        // Cross-Reference Address
        let html = `<div class="table-responsive"><table class="table table-sm table-striped">
            <thead><tr><th>Lizenz</th><th>Name</th><th>Adresse (aus DB)</th><th>Begl.</th><th>Essen</th></tr></thead>
            <tbody>`;

        if(pData.length === 0) {
            html += `<tr><td colspan="5" class="text-center text-muted">Niemand hat sich bisher angemeldet.</td></tr>`;
        } else {
            pData.forEach(p => {
                let liz = String(p.lizenz || '').trim();
                if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
                
                let m = membersLookup[liz] || membersLookup[String(p.lizenz).trim()];
                
                let addrStr = "-";
                let emailStr = "";
                let nameVorname = p.name;

                let vorname = "";
                let nachname = "";
                let jahrgang = "–";
                let strasse = "";
                let plz = "";
                let ort = "";

                if(m) {
                    addrStr = `${m.Street || ''}, ${m.PostCode || ''} ${m.City || ''}`.trim();
                    if(addrStr === ',') addrStr = "-";
                    emailStr = m.PrimaryEmail || m.AdditionalEmail || "";
                    if(m.LastName && m.FirstName) nameVorname = `${m.LastName} ${m.FirstName}`;
                    
                    vorname = m.FirstName || "";
                    nachname = m.LastName || "";
                    jahrgang = m.BirthDate ? m.BirthDate.split('-')[0] : "–";
                    strasse = m.Street || "";
                    plz = m.PostCode || "";
                    ort = m.City || "";
                }

                // Push to array for mail generator
                eventParticipants.push({
                    lizenz: liz,
                    name: nameVorname,
                    email: emailStr,
                    address: addrStr,
                    count: p.count,
                    essen: p.essen,
                    vorname: vorname,
                    nachname: nachname,
                    jahrgang: jahrgang,
                    strasse: strasse,
                    plz: plz,
                    ort: ort
                });

                html += `<tr>
                    <td><small class="text-muted">${escapeHtml(liz)}</small></td>
                    <td><b>${escapeHtml(nameVorname)}</b></td>
                    <td><small>${escapeHtml(addrStr)}</small></td>
                    <td>${p.count > 1 ? '<span class="badge bg-info text-dark">+'+(p.count-1)+'</span>' : '-'}</td>
                    <td>${p.essen > 0 ? '<span class="badge bg-success">'+p.essen+'</span>' : '-'}</td>
                </tr>`;
            });
        }
        
        html += `</tbody></table></div>`;
        listDiv.innerHTML = html;

        if(eventParticipants.length > 0) {
            if(mailBtn) mailBtn.disabled = false;
            }

    } catch(e) {
        listDiv.innerHTML = `<div class="text-danger">Fehler: ${escapeHtml(e.message)}</div>`;
    }
}

function generateMailForParticipants() {
    if(eventParticipants.length === 0) return;

    // Finde alle gültigen E-Mails
    const emails = eventParticipants.map(p => p.email).filter(e => e && e.trim() !== "");
    
    if(emails.length === 0) {
        alert("Keiner der Teilnehmer hat eine hinterlegte E-Mail Adresse.");
        return;
    }

    const bcc = emails.join(",");
    const subject = encodeURIComponent("Infos zum Event");
    const body = encodeURIComponent("Hallo zusammen,\n\n");

    const mailmailto = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
    window.location.href = mailmailto;
}

// === GRUPPEN-AUTOMATISIERUNG (5er Teams) ===

let currentGroupEventId = null;
let currentGroupParticipants = [];

async function selectEventForGroups(eventId) {
    currentGroupEventId = eventId;
    loadGroupsIfEventSelected();
}

async function loadGroupsIfEventSelected() {
    if(!currentGroupEventId) return;
    const container = document.getElementById('umfragen-gruppen-container');
    const mailBtn = document.getElementById('btn-generate-group-mail');
    if(!container) return;

    container.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div> Lade Teilnehmer & bilde Gruppen...`;
    mailBtn.disabled = true;

    try {
        await ensureMembersLookup();

        const res = await apiFetch('umfragen', `action=getParticipants&eventid=${encodeURIComponent(currentGroupEventId)}`);
        const pData = await res.json();
        
        currentGroupParticipants = [];

        pData.forEach(p => {
            let liz = String(p.lizenz || '').trim();
            if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
            
            let m = membersLookup[liz] || membersLookup[String(p.lizenz).trim()];
            
            if(m) {
                // Nur Personen mit vollständigen Daten für die Gruppenanmeldung
                currentGroupParticipants.push({
                    lizenz: liz,
                    vorname: m.FirstName || '',
                    nachname: m.LastName || '',
                    jahrgang: m.BirthDate ? m.BirthDate.split('-')[0] : '–',
                    strasse: m.Street || '',
                    plz: m.PostCode || '',
                    ort: m.City || '',
                    name: `${m.LastName} ${m.FirstName}`
                });
            }
        });

        renderGroups(container, mailBtn);

    } catch(e) {
        container.innerHTML = `<div class="text-danger">Fehler: ${escapeHtml(e.message)}</div>`;
    }
}

function renderGroups(container, mailBtn) {
    if (currentGroupParticipants.length === 0) {
        container.innerHTML = `<div class="alert alert-info">Noch keine Anmeldungen für diesen Anlass vorhanden.</div>`;
        return;
    }

    mailBtn.disabled = false;

    // Gruppierung in 5er Blöcke
    const groups = [];
    for (let i = 0; i < currentGroupParticipants.length; i += 5) {
        groups.push(currentGroupParticipants.slice(i, i + 5));
    }

    let html = '';
    groups.forEach((group, idx) => {
        const isFull = group.length === 5;
        const isOver = group.length > 5;
        const groupName = `Muhen ${idx + 1}`;
        
        html += `
            <div class="card mb-3 border-0 shadow-sm">
                <div class="card-header ${isFull ? 'bg-primary text-white' : 'bg-warning text-dark'} py-2 d-flex justify-content-between align-items-center">
                    <span class="fw-bold">${groupName} ${!isFull ? '(Unvollständig)' : ''}</span>
                    <span class="badge bg-light text-dark">${group.length} / 5</span>
                </div>
                <div class="card-body p-0">
                    <table class="table table-sm table-hover mb-0">
                        <colgroup>
                            <col style="width: 20%;">
                            <col style="width: 40%;">
                            <col style="width: 15%;">
                            <col style="width: 25%;">
                        </colgroup>
                        <thead class="table-light small">
                            <tr>
                                <th>Lizenz</th>
                                <th>Name</th>
                                <th>Jahrgang</th>
                                <th>Ort</th>
                            </tr>
                        </thead>
                        <tbody class="small sortable-group-list">
                            ${group.map(p => `
                                <tr data-lizenz="${escapeHtml(p.lizenz)}" style="cursor: grab;">
                                    <td><i class="fa-solid fa-grip-vertical text-muted me-2"></i>${escapeHtml(p.lizenz)}</td>
                                    <td><b>${escapeHtml(p.name)}</b></td>
                                    <td>${escapeHtml(p.jahrgang)}</td>
                                    <td>${escapeHtml(p.ort)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Initialize drag & drop for groups
    if (typeof Sortable !== 'undefined') {
        const lists = container.querySelectorAll('.sortable-group-list');
        lists.forEach(list => {
            new Sortable(list, {
                group: 'shared',
                animation: 150,
                handle: 'tr',
                onEnd: function () {
                    // Update counters and headers
                    const cards = container.querySelectorAll('.card');
                    cards.forEach((card, idx) => {
                        const rowCount = card.querySelectorAll('tbody tr').length;
                        const badge = card.querySelector('.badge');
                        if (badge) badge.innerText = `${rowCount} / 5`;
                        
                        const header = card.querySelector('.card-header');
                        const headerSpan = header.querySelector('.fw-bold');
                        const isFull = rowCount === 5;
                        const isOver = rowCount > 5;
                        
                        if (headerSpan) {
                            if (isOver) {
                                headerSpan.innerText = `Muhen ${idx + 1} (Zu viele!)`;
                            } else if (!isFull) {
                                headerSpan.innerText = `Muhen ${idx + 1} (Unvollständig)`;
                            } else {
                                headerSpan.innerText = `Muhen ${idx + 1}`;
                            }
                        }

                        if (isOver) {
                            header.classList.remove('bg-warning', 'bg-primary', 'text-dark', 'text-white');
                            header.classList.add('bg-danger', 'text-white');
                        } else if (isFull) {
                            header.classList.remove('bg-warning', 'bg-danger', 'text-dark', 'text-white');
                            header.classList.add('bg-primary', 'text-white');
                        } else {
                            header.classList.remove('bg-primary', 'bg-danger', 'text-white');
                            header.classList.add('bg-warning', 'text-dark');
                        }
                    });
                }
            });
        });
    }
}


async function generateGroupMail() {
    if (currentGroupParticipants.length === 0) return;

    if (!hasWriteAccess || !hasWriteAccess('umfragen')) {
        alert("Keine Berechtigung zum Mailversand");
        return;
    }

    const event = umfragenState.find(e => e.id === currentGroupEventId);
    const eventTitle = event ? event.title : "Schiessanlass";

    const mailanzeige = localStorage.getItem('portal_mailanzeige') || window.currentUser || "Vorstand";
    const rolleExtern = localStorage.getItem('portal_rolle_extern') || "";

    // Gruppen aus dem DOM lesen (berücksichtigt Drag & Drop)
    const groups = [];
    const container = document.getElementById('umfragen-gruppen-container');
    if (container) {
        const cards = container.querySelectorAll('.card');
        cards.forEach(card => {
            const rows = card.querySelectorAll('tbody tr');
            if (rows.length > 0) {
                const group = [];
                rows.forEach(row => {
                    const liz = row.dataset.lizenz;
                    const p = currentGroupParticipants.find(x => x.lizenz === liz);
                    if (p) group.push(p);
                });
                groups.push(group);
            }
        });
    } else {
        // Fallback
        for (let i = 0; i < currentGroupParticipants.length; i += 5) {
            groups.push(currentGroupParticipants.slice(i, i + 5));
        }
    }

    // HTML generieren – modernes Layout mit Logo links
    let html = `
    <div style="font-family: Arial, sans-serif; font-size:14px; color:#333; max-width:700px;">

        <!-- HEADER: Logo links -->
        <div style="display:flex; align-items:center; margin-bottom:24px; padding-bottom:14px; border-bottom:2px solid #e9ecef;">
            <img src="https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-512.png"
                 width="48" height="48"
                 style="border-radius:8px; margin-right:16px; flex-shrink:0;" />
            <div style="font-size:13px; color:#6c757d; line-height:1.4;">
                <span style="font-size:12px;">Gruppenanmeldung – ${eventTitle}</span>
            </div>
        </div>

        <p>Guten Tag</p>
        <p>Wir nehmen gerne teil an eurem Anlass <b>${eventTitle}</b>.</p>
        <p style="color:#555;">Ein allfälliger Gruppengewinn ist bitte mittels beiliegendem Einzahlungsschein zu begleichen.</p>
    `;

    groups.forEach((group, idx) => {
        const isFull = group.length === 5;
        const isOver = group.length > 5;
        const tnChar = isFull ? 'G' : 'E';
        
        html += `
        <div style="margin-top:25px;">
            ${isFull ? `<h3 style="margin-bottom:8px; color:#0d6efd;">Muhen ${idx + 1}</h3>` : `<h3 style="margin-bottom:8px; color:#6c757d;">Einzelschützen</h3>`}

            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f1f3f5;">
                        <th style="border:1px solid #ddd; padding:6px;">TN</th>
                        <th style="border:1px solid #ddd; padding:6px;">Lizenz</th>
                        <th style="border:1px solid #ddd; padding:6px;">Name Vorname</th>
                        <th style="border:1px solid #ddd; padding:6px;">Jg</th>
                        <th style="border:1px solid #ddd; padding:6px;">Strasse</th>
                        <th style="border:1px solid #ddd; padding:6px;">PLZ Ort</th>
                    </tr>
                </thead>
                <tbody>
        `;

        group.forEach(p => {
            html += `
                <tr>
                    <td style="border:1px solid #ddd; padding:6px; text-align:center; font-weight:bold;">${tnChar}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.lizenz}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.nachname} ${p.vorname}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.jahrgang}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.strasse}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.plz} ${p.ort}</td>
                </tr>
            `;
        });

        // leere Zeilen auffüllen → wichtig für saubere Tabelle
        for (let i = group.length; i < 5; i++) {
            html += `
                <tr>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>

            <div style="font-size:12px; margin-top:5px; color:#666;">
                G = Gruppenschütze &nbsp;&nbsp;|&nbsp;&nbsp; E = Einzelschütze
            </div>
        </div>
        `;
    });

    html += `
        <p style="margin-top:30px;">Besten Dank.</p>

        <p>
        Freundliche Grüsse<br><br>
        Sportschützen Muhen<br><br>
        ${mailanzeige}
        ${rolleExtern ? `<br>${rolleExtern}` : ''}
        </p>
    </div>
    `;

    try {
        const res = await apiFetch('umfragen', '', {
            method: 'POST',
            body: JSON.stringify({
                action: "sendGroupMail",
                subject: `Gruppenanmeldung Sportschützen Muhen für ${eventTitle}`,
                html: html,
                attachmentFileId: "1vXxjiaj9zwjz8aW0-BJF6RBGZ00oRki0"
            })
        });

        const data = await res.json();
        if (data.error) {
            throw new Error(data.error);
        }

        alert("✅ " + (data.message || "Entwurf erfolgreich erstellt!"));
    } catch (e) {
        alert("Fehler beim Mailversand: " + e.message);
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

// === TAB 4: ERWEITERTES CONTROLLING (Integration von gv.js) ===

/**
 * Wird aufgerufen, wenn Tab 4 "Erweitertes Controlling" geoeffnet wird.
 * Laedt die GV-Stammdaten (falls noch nicht geladen) und baut die UI auf.
 */
async function initGVControllingTab() {
  if (gvState) {
    // Daten bereits geladen – nur UI neu rendern
    renderGVListEmbedded();
    fetchGVEventsEmbedded();
    return;
  }

  const listDiv = document.getElementById('gv-list-embedded');
  if (listDiv) {
    listDiv.innerHTML = '<div class="text-center p-3 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-2"></div><div>Lade GV Daten...</div></div>';
  }

  try {
    const [resAdmin, resVorstand] = await Promise.all([
      apiFetch('termine', 'action=loadAdminData'),
      apiFetch('mitglieder', 'action=getVorstand')
    ]);
    gvState = await resAdmin.json();
    try {
      const vorstandData = await resVorstand.json();
      if(vorstandData.success) {
        gvState.vorstandMembers = vorstandData.data;
      } else {
        gvState.vorstandMembers = [];
      }
    } catch(e) { gvState.vorstandMembers = []; }

    originalGvState = JSON.parse(JSON.stringify(gvState));
    renderGVListEmbedded();
    fetchGVEventsEmbedded();
  } catch (e) {
    if (listDiv) {
      listDiv.innerHTML = '<div class="alert alert-danger">Fehler beim Laden: ' + escapeHtml(e.message) + '</div>';
    }
  }
}

/**
 * Rendert die Stammdaten/Platzhalter-Liste in den eingebetteten Container.
 * Wie renderGVList() aus gv.js, aber mit dem Embedded-Container-ID.
 */
function renderGVListEmbedded() {
  const list = document.getElementById('gv-list-embedded');
  if (!list || !gvState || !gvState.platzhalter) return;

  const pickPlaceholder = (label) => {
    const l = String(label || '').toLowerCase();
    if (l.includes('datum') && l.includes('gv') && l.includes('vorjahr')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('abmeldung')) return 'dd.mm.jjjj';
    if (l.includes('mahndatum')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('gv')) return 'dd.mm.jjjj';
    if (l.includes('zeit') && l.includes('gv')) return 'hh:mm';
    if (l.includes('welche gv')) return '100';
    return '';
  };

  const isBudget = (label) => String(label || '').toLowerCase().includes('budget') || label.toLowerCase().includes('wort');
  const isMailField = (label) => String(label || '').toLowerCase().includes('mail');
  const isAttachment = (label) => ['anhänge', 'einladung', 'protokoll', 'jahresbericht', 'logo'].some(term => label.toLowerCase().includes(term));
  const isPresident = (label) => label.toLowerCase().includes('präsident') && !label.toLowerCase().includes('wort') && !label.toLowerCase().includes('bericht');
  const isTermin = (label) => label.toLowerCase().includes('datum') || label.toLowerCase().includes('zeit');

  const members = typeof getGVMemberMails === 'function' ? getGVMemberMails() : [];

  let htmlTermine = '';
  let htmlAllgemein = '';
  let htmlDocs = '';
  let htmlMails = '';

  gvState.platzhalter.forEach((p, i) => {
    const label = p.bezeichnung_app || p.platzhaltername || '';
    const ph = pickPlaceholder(label);
    const value = p.inhalt || '';
    
    let fieldHtml = '';

    if (isBudget(label)) {
      fieldHtml = '<div class="mb-3">' +
        '<label class="form-label small fw-bold mb-1">' + escapeHtml(label) + '</label>' +
        '<textarea class="form-control form-control-sm write-protected" rows="5" placeholder="Mehrzeiliger Text..." ' +
        'onchange="gvState.platzhalter[' + i + '].inhalt=this.value">' + escapeHtml(value) + '</textarea>' +
        '</div>';
    } else if (isMailField(label)) {
      const mails = value.split(';').map(x => x.trim()).filter(Boolean);
      const tags = mails.length
        ? mails.map(m => '<span style="background:#e9f2ff;color:#0d6efd;padding:2px 8px;border-radius:10px;font-size:.85rem;">' +
            escapeHtml(m) + ' <span style="color:#dc3545;cursor:pointer;" class="write-protected" onclick="removeGVMailEmbedded(' + i + ', \'' + escapeJs(m) + '\')">&times;</span></span>').join('')
        : '<span class="text-muted small">Keine</span>';
      const opts = members.map(mm => '<option value="' + escapeHtml(mm.email) + '">' + escapeHtml(mm.name) + '</option>').join('');
      fieldHtml = '<div class="mb-3 pb-2">' +
        '<label class="form-label small fw-bold mb-1">' + escapeHtml(label) + ' <span class="text-muted fw-normal" style="font-size:0.8em;">(nur Vorstandsmitglieder)</span></label>' +
        '<div class="tag-box mb-2" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;border:1px solid #ccc;border-radius:8px;min-height:40px;">' + tags + '</div>' +
        '<select class="form-select form-select-sm write-protected" onchange="addGVMailEmbedded(' + i + ', this.value); this.value=\'\'">' +
        '<option value="">+ Empfänger hinzufügen</option>' + opts + '</select></div>';
    } else if (isPresident(label)) {
      const opts = members.map(mm => '<option value="' + escapeHtml(mm.name) + '" ' + (value === mm.name ? 'selected' : '') + '>' + escapeHtml(mm.name) + '</option>').join('');
      fieldHtml = '<div class="mb-2">' +
        '<label class="form-label small fw-bold mb-0">' + escapeHtml(label) + ' <span class="text-muted fw-normal" style="font-size:0.8em;">(nur Vorstandsmitglieder)</span></label>' +
        '<div class="input-group input-group-sm"><input type="text" class="form-control write-protected" value="' + escapeHtml(value) + '" placeholder="Name manuell..." onchange="gvState.platzhalter[' + i + '].inhalt=this.value">' +
        '<select class="form-select write-protected" style="max-width:200px;" onchange="gvState.platzhalter[' + i + '].inhalt=this.value; renderGVListEmbedded();"><option value="">-- Wählen --</option>' + opts + '</select></div>' +
        '</div>';
    } else if (label.toLowerCase() === 'logo') {
      fieldHtml = '<div class="mb-3 border rounded p-2 bg-light">' +
        '<div class="d-flex justify-content-between align-items-center mb-1"><label class="form-label small fw-bold mb-0 text-muted">' + escapeHtml(label) + ' (Geschützt)</label>' +
        '<button class="btn btn-xs btn-outline-secondary py-0" onclick="document.getElementById(\'gv-logo-edit-' + i + '\').classList.toggle(\'d-none\')"><i class="fas fa-lock-open"></i> Ändern</button></div>' +
        '<div id="gv-logo-edit-' + i + '" class="d-none mt-2"><input type="text" class="form-control form-control-sm write-protected" value="' + escapeHtml(value) + '" onchange="gvState.platzhalter[' + i + '].inhalt=this.value"></div>' +
        '</div>';
    } else {
      const isDateField = ph === 'dd.mm.jjjj';
      const displayValue = isDateField ? isoToDisplay(value) : value;
      let hint = '';
      if (label.toLowerCase().includes('anhänge')) {
          hint = '<div class="form-text text-info" style="font-size:0.75rem;"><i class="fas fa-info-circle"></i> Bei mehreren Anhängen diese mit Komma trennen.</div>';
      }
      fieldHtml = '<div class="mb-2">' +
        '<label class="form-label small fw-bold mb-0">' + escapeHtml(label) + '</label>' +
        '<input type="text" class="form-control form-control-sm write-protected"' +
        ' value="' + escapeHtml(displayValue) + '" placeholder="' + escapeHtml(ph) + '"' +
        ' onchange="gvState.platzhalter[' + i + '].inhalt = ' + (isDateField ? 'displayToIso(this.value)' : 'this.value') + '">' +
        hint +
        '</div>';
    }

    if (isTermin(label)) {
        htmlTermine += fieldHtml;
    } else if (isAttachment(label)) {
        htmlDocs += fieldHtml;
    } else if (isMailField(label)) {
        htmlMails += fieldHtml;
    } else {
        htmlAllgemein += fieldHtml;
    }
  });

  list.innerHTML = `
    <div class="mb-4">
        <h6 class="border-bottom pb-1 text-primary">Allgemeine Infos</h6>
        ${htmlAllgemein}
    </div>
    <div class="mb-4">
        <h6 class="border-bottom pb-1 text-primary">Termine & Fristen</h6>
        ${htmlTermine}
    </div>
    <div class="mb-4">
        <h6 class="border-bottom pb-1 text-primary">Dokumente & Anhänge</h6>
        ${htmlDocs}
    </div>
    <div class="mb-2">
        <h6 class="border-bottom pb-1 text-primary">Mail-Verteiler</h6>
        ${htmlMails}
    </div>
  `;
}

function addGVMailEmbedded(idx, email) {
  if (!email) return;
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x => x.trim()).filter(Boolean);
  if (!current.includes(email)) current.push(email);
  gvState.platzhalter[idx].inhalt = current.join('; ');
  renderGVListEmbedded();
}

function removeGVMailEmbedded(idx, email) {
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x => x.trim()).filter(Boolean);
  gvState.platzhalter[idx].inhalt = current.filter(x => x !== email).join('; ');
  renderGVListEmbedded();
}

async function fetchGVEventsEmbedded() {
  const selector = document.getElementById('gv-event-selector');
  if (!selector) return;
  try {
    const res = await apiFetch('umfragen', 'action=getAllEventsAdmin');
    const data = await res.json();
    const events = Array.isArray(data) ? data : (data.events || []);
    selector.innerHTML = '<option value="">-- Bitte waehlen --</option>' +
      events.map(e => '<option value="' + escapeHtml(e.id) + '"' +
        (gvState.linked_event === e.id ? ' selected' : '') + '>' +
        escapeHtml(e.title) + ' (' + (e.datum ? e.datum.split('T')[0] : '') + ')</option>').join('');
    if (gvState.linked_event) {
      loadGVParticipants(gvState.linked_event);
    }
  } catch (e) {
    if (selector) selector.innerHTML = '<option value="">Fehler beim Laden</option>';
  }
}