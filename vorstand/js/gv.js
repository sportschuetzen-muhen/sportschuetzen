// === MODUL: GV & PRÄSENZ ===

let gvState = null;
let originalGvState = null;

async function loadGVData(force = false) {
  const container = document.getElementById('gv-container');
  if(!container) return;

  if (!force && gvState && document.getElementById('gv-list')) {
    console.log("⚡ loadGVData: Lade aus lokalem Cache...");
    return;
  }
  
  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade GV Daten...</div>
    </div>
  `;

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
    
    renderGVUI(container);
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${escapeHtml(e.message)}</div>`;
  }
}

function renderGVUI(container) {
  container.innerHTML = `
    <div class="row g-3">
        <div class="col-md-12 write-protected">
             <div class="card p-3 mb-3">
                <h5 class="card-title">🚀 Tools</h5>
                <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('genPDF')">📄 Einladungs-PDF</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('importClubdesk')">📥 Clubdesk Import</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendMails')">📧 GV Mails senden</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendReminders')">🔔 Mahnungen senden</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendSummary')">📊 Übersicht senden</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendPraesenz')">📝 Präsenzliste senden</button>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card p-3">
                <h5 class="card-title">Stammdaten / Platzhalter</h5>
                <div id="gv-list"></div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card p-3">
                <h5 class="card-title">Präsenz / Anmeldungen (Eventplaner)</h5>
                <div class="mb-2">
                    <label class="form-label small">Verknüpftes Event wählen:</label>
                    <select class="form-select form-select-sm" id="gv-event-selector" onchange="loadGVParticipants(this.value)">
                        <option value="">-- Lade Events... --</option>
                    </select>
                </div>
                <div class="table-responsive" style="max-height: 430px;">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th style="cursor: pointer;" onclick="sortGvTable('name')">Name ↕</th>
                                <th style="cursor: pointer;" onclick="sortGvTable('status')">Teilnahme ↕</th>
                            </tr>
                        </thead>
                        <tbody id="gv-anmelde-body">
                            <tr><td colspan="2" class="text-center text-muted">Bitte Event auswählen</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
  `;
  renderGVList();
  fetchGVEvents();
}

function renderGVList() {
  const list = document.getElementById('gv-list');
  if (!list || !gvState || !gvState.platzhalter) return;

  const pickPlaceholder = (label) => {
    const l = String(label || '').toLowerCase();
    if (l.includes('datum') && l.includes('gv') && l.includes('vorjahr')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('abmeldung')) return 'dd.mm.jjjj';
    if (l.includes('mahndatum')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('gv')) return 'dd.mm.jjjj';
    if (l.includes('zeit') && l.includes('gv')) return 'hh:mm';
    return '';
  };

  const isBudget = (label) => String(label || '').toLowerCase().includes('budget');
  const isMailField = (label) => String(label || '').toLowerCase().includes('mail');

  // Reuse logic from terming.js to format email
  const members = getGVMemberMails();

  list.innerHTML = gvState.platzhalter.map((p, i) => {
    const label = p.bezeichnung_app || p.platzhaltername || '';
    const ph = pickPlaceholder(label);
    const value = p.inhalt || '';

    if (isBudget(label)) {
      return `
        <div class="mb-3">
          <label class="form-label small fw-bold mb-1">${escapeHtml(label)}</label>
          <textarea class="form-control form-control-sm write-protected" rows="5"
            placeholder="Mehrzeiliger Text…"
            onchange="gvState.platzhalter[${i}].inhalt=this.value">${escapeHtml(value)}</textarea>
        </div>
      `;
    }

    if (isMailField(label)) {
      const mails = value.split(';').map(x => x.trim()).filter(Boolean);
      return `
        <div class="mb-3 border-bottom pb-3">
          <label class="form-label small fw-bold mb-1">${escapeHtml(label)} <span class="text-muted fw-normal" style="font-size:0.8em;">(nur Vorstandsmitglieder)</span></label>
          <div class="tag-box mb-2" style="display:flex; flex-wrap:wrap; gap:6px; padding:6px; border:1px solid #ccc; border-radius:8px; min-height:40px;">
            ${mails.length ? mails.map(m => `
                <span style="background:#e9f2ff; color:#0d6efd; padding:2px 8px; border-radius:10px; font-size:.85rem;">
                  ${escapeHtml(m)} <span style="color:#dc3545; cursor:pointer;" class="write-protected" onclick="removeGVMail(${i}, '${escapeJs(m)}')">×</span>
                </span>
              `).join('') : '<span class="text-muted small">Keine</span>'}
          </div>
          <select class="form-select form-select-sm write-protected" onchange="addGVMail(${i}, this.value); this.value=''">
            <option value="">+ Empfänger hinzufügen</option>
            ${members.map(mm => `<option value="${escapeHtml(mm.email)}">${escapeHtml(mm.name)}</option>`).join('')}
          </select>
        </div>
      `;
    }

    const isDateField = ph === 'dd.mm.jjjj';
    const displayValue = isDateField ? isoToDisplay(value) : value;

    return `
      <div class="mb-2">
        <label class="form-label small fw-bold mb-0">${escapeHtml(label)}</label>
        <input type="text" class="form-control form-control-sm write-protected"
          value="${escapeHtml(displayValue)}"
          placeholder="${escapeHtml(ph)}"
          onchange="gvState.platzhalter[${i}].inhalt = ${isDateField} ? displayToIso(this.value) : this.value">
      </div>
    `;
  }).join('');
}

async function fetchGVEvents() {
    const selector = document.getElementById('gv-event-selector');
    if(!selector) return;
    try {
        const res = await apiFetch('umfragen', 'action=getAllEventsAdmin');
        const data = await res.json();
        const events = Array.isArray(data) ? data : (data.events || []);
        
        selector.innerHTML = '<option value="">-- Bitte wählen --</option>' + 
            events.map(e => `<option value="${escapeHtml(e.id)}" ${gvState.linked_event === e.id ? 'selected' : ''}>${escapeHtml(e.title)} (${e.datum ? e.datum.split('T')[0] : ''})</option>`).join('');
            
        if(gvState.linked_event) {
            loadGVParticipants(gvState.linked_event);
        }
    } catch(e) {
        selector.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
}

async function loadGVParticipants(eventId) {
    if(!eventId) return;
    
    // Speichere die Auswahl im State (wird beim Speichern an backend gesendet, falls gewünscht)
    gvState.linked_event = eventId;
    window.markUnsaved();
    
    const tbody = document.getElementById('gv-anmelde-body');
    if(!tbody) return;

    const hasCache = window._gvParticipantsCache && window._gvParticipantsCache[eventId];
    if (!hasCache) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';
    }
    
    try {
        let pData;
        if (hasCache) {
            console.log("⚡ loadGVParticipants: Verwende Cache...");
            pData = window._gvParticipantsCache[eventId];
        } else {
            // Wir nutzen nun die neue Backend-API "getGVStatus", die uns Ja, Nein und Offen liefert!
            const res = await apiFetch('termine', { action: 'runTool', tool: 'getGVStatus', eventId: eventId }, 'POST');
            const result = await res.json();
            
            if (!result.success) throw new Error(result.error || "Fehler beim Laden");
            
            pData = result.data || [];
            window._gvParticipantsCache = window._gvParticipantsCache || {};
            window._gvParticipantsCache[eventId] = pData;
        }
        
        window.currentGvData = pData;
        window.gvSortDir = { name: 1, status: 1 };
        renderGvTableBody();
        
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-danger">Fehler: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function sortGvTable(field) {
    if (!window.currentGvData) return;
    window.gvSortDir[field] *= -1;
    const dir = window.gvSortDir[field];
    
    window.currentGvData.sort((a, b) => {
        let valA = String(a[field]).toLowerCase();
        let valB = String(b[field]).toLowerCase();
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
    renderGvTableBody();
}

function renderGvTableBody() {
    const tbody = document.getElementById('gv-anmelde-body');
    if (!tbody || !window.currentGvData) return;
    
    if(window.currentGvData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Keine Daten gefunden.</td></tr>';
        const summaryDiv = document.getElementById('gv-anmelde-summary');
        if(summaryDiv) summaryDiv.innerHTML = '';
        return;
    }
    
    let countJa = 0;
    let countNein = 0;
    let countOffen = 0;
    let countEssen = 0;

    tbody.innerHTML = window.currentGvData.map(a => {
        let badgeStr = '';
        if (a.status === 'ja') {
            badgeStr = `<span class="badge bg-success">Ja</span> ${a.essen > 0 ? '(+Essen)' : ''}`;
            countJa++;
            if(a.essen > 0) countEssen += Number(a.essen);
        }
        else if (a.status === 'nein') {
            badgeStr = `<span class="badge bg-danger">Nein</span>`;
            countNein++;
        }
        else {
            badgeStr = `<span class="badge bg-secondary">Offen</span>`;
            countOffen++;
        }
        
        return `
        <tr>
            <td>${escapeHtml(a.name)}</td>
            <td>${badgeStr}</td>
        </tr>`;
    }).join('');

    const summaryDiv = document.getElementById('gv-anmelde-summary');
    if(summaryDiv) {
        summaryDiv.innerHTML = `
            <div class="d-flex justify-content-between align-items-center bg-light p-2 rounded border mt-2">
                <span class="text-success fw-bold" style="font-size:0.85rem;"><i class="fas fa-check-circle"></i> Zugesagt: ${countJa}</span>
                <span class="text-danger fw-bold" style="font-size:0.85rem;"><i class="fas fa-times-circle"></i> Abgesagt: ${countNein}</span>
                <span class="text-secondary fw-bold" style="font-size:0.85rem;"><i class="fas fa-question-circle"></i> Offen: ${countOffen}</span>
                <span class="text-info fw-bold" style="font-size:0.85rem;"><i class="fas fa-utensils"></i> Essen: ${countEssen}</span>
            </div>
        `;
    }
}

function getGVMemberMails() {
  if (gvState && gvState.vorstandMembers && gvState.vorstandMembers.length > 0) {
    return gvState.vorstandMembers;
  }
  // Fallback to legacy
  const arr = (gvState.members || []).map(m => ({
    name: (m.nachname + " " + m.vorname).trim() || m.name || m.email,
    email: m.e_mail || m.email || m.mailadresse
  })).filter(x => x.email);
  arr.sort((a,b) => a.name.localeCompare(b.name));
  return arr;
}
function addGVMail(idx, email) {
  if (!email) return;
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x=>x.trim()).filter(Boolean);
  if (!current.includes(email)) current.push(email);
  gvState.platzhalter[idx].inhalt = current.join('; ');
  renderGVList();
}
function removeGVMail(idx, email) {
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x=>x.trim()).filter(Boolean);
  gvState.platzhalter[idx].inhalt = current.filter(x => x !== email).join('; ');
  renderGVList();
}

async function runGVTool(toolName) {
    if(!confirm('Tool "'+toolName+'" starten?')) return;
    try {
        let evId = "";
        const dropdown = document.getElementById('gv-event-selector');
        if(dropdown && dropdown.value) {
            evId = dropdown.value;
        }

        let payload = { action: 'runTool', tool: toolName, eventId: evId, user: localStorage.getItem('portal_user') };

        // Pass participants data if it's sendSummary, sendPraesenz, or sendReminders
        if (toolName === 'sendSummary' || toolName === 'sendPraesenz' || toolName === 'sendReminders') {
            if (window.currentGvData) {
                payload.participants = window.currentGvData;
            }
        }

        const res = await apiFetch('termine', '', {
            method: 'POST', body: JSON.stringify(payload)
        });
        const data = await res.json();
        alert(data.success ? "✅ " + data.msg : "❌ Fehler: " + data.error);
    } catch(e) { alert("Netzwerkfehler: " + e); }
}

async function saveGVData() {
  if(!confirm("GV-Aenderungen speichern?")) return;
  const user = localStorage.getItem('portal_user') || "Admin";
  // The server expects all payload parts, so we send the whole state
  const payload = {
    action: "saveAdminData",
    user: user,
    termine: gvState.termine,
    platzhalter: gvState.platzhalter,
    app_info: gvState.app_info,
    dropdowns: gvState.dropdowns,
    logDetails: "GV-Daten aktualisiert"
  };
  try {
    const res = await apiFetch('termine', '', { method: 'POST', body: JSON.stringify(payload) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { error: "Ungueltige Server-Antwort" }; }
    
    if(data.status === 'success' || data.success) {
        window.clearUnsaved();
        alert("✅ Gespeichert!");
        gvState = null;
        if (typeof adminState !== 'undefined') {
            adminState = null;
        }
        if (typeof initGVControllingTab === 'function') {
            initGVControllingTab();
        }
    } else {
        alert("Fehler beim Speichern: " + (data.error || data.message || "Unbekannt"));
    }
  } catch(e) {
    alert("Netzwerk/Skript-Fehler: " + e);
  }
}
