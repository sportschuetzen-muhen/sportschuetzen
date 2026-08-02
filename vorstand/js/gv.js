// === MODUL: GV & PRÄSENZ ===

let gvState = null;
let originalGvState = null;

function getGVState() {
  if (typeof gvState !== 'undefined' && gvState) {
    window.gvState = gvState;
    return gvState;
  }
  if (window.gvState) {
    gvState = window.gvState;
    return window.gvState;
  }
  return null;
}

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
    const textAdmin = await resAdmin.text();
    try {
      gvState = JSON.parse(textAdmin);
    } catch(err) {
      console.error("Non-JSON Server response in loadGVData:", textAdmin);
      throw new Error("Ungültige Antwort vom Server (Google Apps Script). Bitte prüfe das Deployment in Google Apps Script.");
    }
    window.gvState = gvState;
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
                <div class="d-flex gap-2 flex-wrap align-items-center">
                    <div class="form-check form-switch d-flex align-items-center me-2 pe-2 border-end" style="margin-bottom: 0; min-height: auto;">
                        <input class="form-check-input me-2" type="checkbox" id="gv-wahljahr-switch" style="cursor: pointer;">
                        <label class="form-check-label small fw-bold text-muted" for="gv-wahljahr-switch" style="cursor: pointer; user-select: none;">Wahljahr</label>
                    </div>
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
                    <select class="form-select form-select-sm gv-event-selector" id="gv-event-selector" onchange="loadGVParticipants(this.value)">
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
                        <tbody id="gv-anmelde-body" class="gv-anmelde-body">
                            <tr><td colspan="2" class="text-center text-muted">Bitte Event auswählen</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="gv-anmelde-summary" class="mt-3 gv-anmelde-summary"></div>
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
    const isDocAttachment = ['dokument', 'anhänge', 'einladung', 'protokoll', 'jahresbericht'].some(t => label.toLowerCase().includes(t));

    if (isDocAttachment) {
      let docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-paperclip text-primary me-1"></i> Wird beim Mailversand als Anhang mitgeschickt.</div>';
      const lLower = label.toLowerCase();
      if (lLower.includes('einladung')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-file-pdf text-danger me-1"></i> Haupt-Einladungsdokument (PDF oder Google Doc) als E-Mail-Anhang.</div>';
      } else if (lLower.includes('anhänge')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-paperclip text-primary me-1"></i> Weitere Beilagen (z. B. Statuten-Entwurf, Reglemente). Kommagetrennt für mehrere Dateien.</div>';
      } else if (lLower.includes('protokoll')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-file-word text-info me-1"></i> Protokoll der Vorjahres-GV (Word .docx oder PDF) als E-Mail-Anhang.</div>';
      } else if (lLower.includes('jahresbericht')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-file-alt text-success me-1"></i> Jahresbericht des Präsidenten als E-Mail-Anhang.</div>';
      }

      return `
        <div class="mb-3">
          <label class="form-label small fw-bold mb-1">${escapeHtml(label)} <span class="badge bg-primary text-white ms-1" style="font-size:0.65rem;"><i class="fas fa-paperclip me-1"></i> E-Mail-Anhang</span></label>
          <div class="input-group input-group-sm">
            <input type="text" id="gv-doc-input-${i}" class="form-control form-control-sm write-protected"
              value="${escapeHtml(displayValue)}"
              placeholder="${escapeHtml(ph || 'Drive ID / Link eintragen oder Datei uploaden...')}"
              onchange="gvState.platzhalter[${i}].inhalt = this.value">
            <button class="btn btn-outline-primary write-protected" type="button" onclick="document.getElementById('gv-file-upload-${i}').click()">
              <i class="fas fa-cloud-upload-alt me-1"></i> Upload
            </button>
          </div>
          <input type="file" id="gv-file-upload-${i}" class="d-none" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" multiple onchange="uploadGVDocumentFile(this.files, ${i}, 'gv-doc-input-${i}', 'gv-doc-status-${i}')">
          <div id="gv-doc-status-${i}" class="small mt-1 text-muted"></div>
          ${docHint}
        </div>
      `;
    }

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
    const selectors = document.querySelectorAll('.gv-event-selector, #gv-event-selector');
    if(selectors.length === 0) return;
    try {
        const res = await apiFetch('umfragen', 'action=getAllEventsAdmin');
        const data = await res.json();
        const events = Array.isArray(data) ? data : (data.events || []);
        
        const html = '<option value="">-- Bitte wählen --</option>' + 
            events.map(e => `<option value="${escapeHtml(e.id)}" ${gvState.linked_event === e.id ? 'selected' : ''}>${escapeHtml(e.title)} (${formatSwissDate(e.datum)})</option>`).join('');
            
        selectors.forEach(selector => {
            selector.innerHTML = html;
        });
            
        if(gvState.linked_event) {
            loadGVParticipants(gvState.linked_event);
        }
    } catch(e) {
        selectors.forEach(selector => {
            selector.innerHTML = '<option value="">Fehler beim Laden</option>';
        });
    }
}

async function loadGVParticipants(eventId) {
    if(!eventId) return;
    
    // Speichere die Auswahl im State
    gvState.linked_event = eventId;
    window.markUnsaved();
    
    // Synchronisiere alle Dropdowns
    const selectors = document.querySelectorAll('.gv-event-selector, #gv-event-selector');
    selectors.forEach(selector => {
        if (selector.value !== eventId) {
            selector.value = eventId;
        }
    });
    
    const tbodies = document.querySelectorAll('.gv-anmelde-body, #gv-anmelde-body');
    if(tbodies.length === 0) return;

    const hasCache = window._gvParticipantsCache && window._gvParticipantsCache[eventId];
    if (!hasCache) {
        tbodies.forEach(tbody => {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';
        });
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
        tbodies.forEach(tbody => {
            tbody.innerHTML = `<tr><td colspan="2" class="text-danger">Fehler: ${escapeHtml(e.message)}</td></tr>`;
        });
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
    const tbodies = document.querySelectorAll('.gv-anmelde-body, #gv-anmelde-body');
    const summaryDivs = document.querySelectorAll('.gv-anmelde-summary, #gv-anmelde-summary');
    if (tbodies.length === 0 || !window.currentGvData) return;
    
    if(window.currentGvData.length === 0) {
        tbodies.forEach(tb => {
            tb.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Keine Daten gefunden.</td></tr>';
        });
        summaryDivs.forEach(sd => {
            sd.innerHTML = '';
        });
        return;
    }
    
    let countJa = 0;
    let countNein = 0;
    let countOffen = 0;
    let countEssen = 0;
    let countVegi = 0;

    const rowsHtml = window.currentGvData.map(a => {
        let badgeStr = '';
        if (a.status === 'ja') {
            let essenInfo = '';
            if (Number(a.essen) > 0 || Number(a.vegi) > 0) {
                let parts = [];
                if (Number(a.essen) > 0) parts.push(`${a.essen} Std`);
                if (Number(a.vegi) > 0) parts.push(`${a.vegi} Vegi`);
                essenInfo = ` (+Essen: ${parts.join(', ')})`;
            }
            badgeStr = `<span class="badge bg-success">Ja</span>${essenInfo}`;
            countJa++;
            if(a.essen > 0) countEssen += Number(a.essen);
            if(a.vegi > 0) countVegi += Number(a.vegi);
        }
        else if (a.status === 'nein') {
            const grundText = a.grund || a.reason ? ` <small class="text-muted fst-italic">💬 (${escapeHtml(a.grund || a.reason)})</small>` : '';
            badgeStr = `<span class="badge bg-danger">Nein</span>${grundText}`;
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

    tbodies.forEach(tb => {
        tb.innerHTML = rowsHtml;
    });

    const summaryHtml = `
        <div class="d-flex justify-content-between align-items-center bg-light p-2 rounded border mt-2">
            <span class="text-success fw-bold" style="font-size:0.85rem;"><i class="fas fa-check-circle"></i> Zugesagt: ${countJa}</span>
            <span class="text-danger fw-bold" style="font-size:0.85rem;"><i class="fas fa-times-circle"></i> Abgesagt: ${countNein}</span>
            <span class="text-secondary fw-bold" style="font-size:0.85rem;"><i class="fas fa-question-circle"></i> Offen: ${countOffen}</span>
            <span class="text-info fw-bold" style="font-size:0.85rem;"><i class="fas fa-utensils"></i> Essen Total: ${countEssen + countVegi} (Standard: ${countEssen}, Vegi: ${countVegi})</span>
        </div>
    `;

    summaryDivs.forEach(sd => {
        sd.innerHTML = summaryHtml;
    });
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
    if (toolName === 'sendMails') {
        let hasDoc = false;
        const state = getGVState();
        if (state && Array.isArray(state.platzhalter)) {
            const item = state.platzhalter.find(p => {
                const name = String(p.platzhaltername || p.Platzhaltername || p[0] || '').toLowerCase();
                const appName = String(p.bezeichnung_app || p.Bezeichnung_App || '').toLowerCase();
                return name.includes('aktuelle_gv_einladung_dokument_id') || name.includes('einladung_dokument') || appName.includes('einladung');
            });
            if (item) {
                const val = String(item.inhalt || item.Inhalt || item[1] || '').trim();
                if (val) hasDoc = true;
            }
        }
        if (!hasDoc) {
            if (!confirm("⚠️ Achtung: Es ist kein Einladungs-PDF als Anhang hinterlegt.\n\nMöchtest du die Einladungs-Mails trotzdem OHNE PDF-Anhang versenden?")) {
                return;
            }
        } else {
            if (!confirm("Möchtest du die GV-Einladungs-Mails inkl. PDF-Anhang jetzt versenden?")) return;
        }
    } else {
        if(!confirm('Tool "'+toolName+'" starten?')) return;
    }

    try {
        let evId = "";
        const dropdown = document.getElementById('gv-event-selector');
        if(dropdown && dropdown.value) {
            evId = dropdown.value;
        }

        let payload = { action: 'runTool', tool: toolName, eventId: evId, user: localStorage.getItem('portal_user') };

        if (toolName === 'genPDF') {
            const sw1 = document.getElementById('gv-wahljahr-switch');
            const sw2 = document.getElementById('gv-wahljahr-switch-embedded');
            payload.isElectionYear = (sw1 && sw1.checked) || (sw2 && sw2.checked) || false;
        }

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

async function saveGVData(silent = false) {
  if (!silent && !confirm("GV-Aenderungen speichern?")) return;
  const user = localStorage.getItem('portal_user') || "Admin";
  const stateToSave = getGVState();
  if (!stateToSave || !stateToSave.platzhalter) {
    if (!silent) alert("Fehler: Keine GV-Daten vorhanden.");
    return;
  }
  const payload = {
    action: "saveAdminData",
    user: user,
    termine: stateToSave.termine,
    platzhalter: stateToSave.platzhalter,
    app_info: stateToSave.app_info,
    dropdowns: stateToSave.dropdowns,
    logDetails: "GV-Daten aktualisiert"
  };
  try {
    const res = await apiFetch('termine', '', { method: 'POST', body: JSON.stringify(payload) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { error: "Ungueltige Server-Antwort" }; }
    
    if (data.status === 'success' || data.success) {
        if (typeof window.clearUnsaved === 'function') window.clearUnsaved();
        if (!silent) alert("✅ Gespeichert!");
    } else {
        if (!silent) alert("Fehler beim Speichern: " + (data.error || data.message || "Unbekannt"));
    }
  } catch(e) {
    if (!silent) alert("Netzwerk/Skript-Fehler: " + e);
  }
}

async function uploadGVDocumentFile(fileOrFileList, idx, inputId, statusId) {
    if (!fileOrFileList) return;
    const files = (fileOrFileList instanceof FileList || Array.isArray(fileOrFileList))
        ? Array.from(fileOrFileList)
        : [fileOrFileList];

    if (files.length === 0) return;

    const inputEl = document.getElementById(inputId);
    const statusEl = document.getElementById(statusId);

    // Reset hidden file input so re-selecting the same file always triggers onchange
    const fileInputId = inputId.replace('gv-doc-input', 'gv-file-upload');
    const fileInputEl = document.getElementById(fileInputId);
    if (fileInputEl) fileInputEl.value = '';

    if (statusEl) {
        statusEl.innerHTML = `<span class="text-primary"><i class="fas fa-spinner fa-spin me-1"></i> Lade ${files.length} Datei(en) hoch nach Google Drive...</span>`;
    }

    const state = getGVState();
    const item = (state && Array.isArray(state.platzhalter) && state.platzhalter[idx])
        ? state.platzhalter[idx]
        : null;

    const label = item ? (item.bezeichnung_app || item.platzhaltername || '') : '';
    const isMulti = label.toLowerCase().includes('anhänge');

    let uploadedIds = [];
    let uploadedNames = [];
    let errors = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const res = await apiFetch('termine', '', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'uploadGVDocument',
                    fileName: file.name,
                    mimeType: file.type || 'application/pdf',
                    base64: base64,
                    user: localStorage.getItem('portal_user') || 'Admin'
                })
            });
            const data = await res.json();

            if (data.success && data.fileId) {
                uploadedIds.push(data.fileId);
                uploadedNames.push(data.fileName || file.name);
            } else {
                errors.push(`${file.name}: ${data.error || 'Fehler'}`);
            }
        } catch(err) {
            errors.push(`${file.name}: ${err.message || 'Netzwerkfehler'}`);
        }
    }

    if (uploadedIds.length > 0) {
        let currentIds = [];
        let currentNames = [];

        if (item && item.inhalt) {
            currentIds = item.inhalt.split(',').map(x => x.trim()).filter(Boolean);
        } else if (inputEl && inputEl.value.trim()) {
            currentIds = inputEl.value.split(',').map(x => x.trim()).filter(Boolean);
        }

        const existingNamesStr = item ? (item.erklaerung || item.erklärung || item.erkl_rung || '') : '';
        if (existingNamesStr) {
            currentNames = existingNamesStr.split(';').map(x => x.trim()).filter(Boolean);
        }

        if (isMulti) {
            uploadedIds.forEach((id, nIdx) => {
                if (!currentIds.includes(id)) {
                    currentIds.push(id);
                    currentNames.push(uploadedNames[nIdx]);
                }
            });
        } else {
            currentIds = [uploadedIds[uploadedIds.length - 1]];
            currentNames = [uploadedNames[uploadedNames.length - 1]];
        }

        const finalIdsString = currentIds.join(', ');
        const finalNamesString = currentNames.join('; ');

        if (item) {
            item.inhalt = finalIdsString;
            item.erklaerung = finalNamesString;
            item.erklärung = finalNamesString;
            item.erkl_rung = finalNamesString;
        }
        if (inputEl) {
            inputEl.value = finalIdsString;
        }

        if (statusEl) {
            const badgesHtml = renderGVFileBadges(idx, finalIdsString, finalNamesString, inputId, statusId);
            statusEl.innerHTML = `${badgesHtml}
            <div class="text-primary small mt-1"><i class="fas fa-spinner fa-spin me-1"></i> Speichere automatisch in Google Sheets...</div>`;
        }

        // Automatisches Speichern in Google Sheets im Hintergrund!
        await saveGVData(true);

        if (statusEl) {
            const badgesHtml = renderGVFileBadges(idx, finalIdsString, finalNamesString, inputId, statusId);
            statusEl.innerHTML = `${badgesHtml}
            <div class="text-success small mt-1"><i class="fas fa-check-circle me-1"></i> '${escapeHtml(uploadedNames.join(', '))}' hochgeladen & in Google Sheets gespeichert!</div>`;
        }
    } else if (errors.length > 0 && statusEl) {
        statusEl.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Upload fehlgeschlagen: ${escapeHtml(errors.join('; '))}</span>`;
    }
}

function renderGVFileBadges(idx, idsString, namesString, inputId, statusId) {
    const ids = (idsString || '').split(',').map(x => x.trim()).filter(Boolean);
    const names = (namesString || '').split(';').map(x => x.trim()).filter(Boolean);
    if (ids.length === 0) return '';

    return '<div class="d-flex flex-wrap gap-1 mt-1 mb-1">' + ids.map((id, fIdx) => {
        const name = names[fIdx] || ('Datei ' + (fIdx + 1));
        return `<span class="badge bg-light text-dark border p-1.5 d-inline-flex align-items-center me-1 mb-1" style="font-size:0.82rem;">
            <i class="fas fa-file-pdf text-danger me-1"></i>
            <strong class="me-1" title="ID: ${escapeHtml(id)}">${escapeHtml(name)}</strong>
            <span class="text-danger ms-1 write-protected" style="cursor:pointer;font-weight:bold;" title="Datei entfernen" onclick="removeGVAttachment(${idx}, '${escapeJs(id)}', '${inputId}', '${statusId}')">&times;</span>
        </span>`;
    }).join('') + '</div>';
}

async function removeGVAttachment(idx, fileIdToRemove, inputId, statusId) {
    const state = getGVState();
    if (!state || !state.platzhalter || !state.platzhalter[idx]) return;
    const item = state.platzhalter[idx];

    let ids = (item.inhalt || '').split(',').map(x => x.trim()).filter(Boolean);
    let names = (item.erklaerung || item.erklärung || item.erkl_rung || '').split(';').map(x => x.trim()).filter(Boolean);

    const remIdx = ids.indexOf(fileIdToRemove);
    if (remIdx !== -1) {
        ids.splice(remIdx, 1);
        if (names[remIdx] !== undefined) {
            names.splice(remIdx, 1);
        }
    }

    const finalIds = ids.join(', ');
    const finalNames = names.join('; ');

    item.inhalt = finalIds;
    item.erklaerung = finalNames;
    item.erklärung = finalNames;
    item.erkl_rung = finalNames;

    const inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.value = finalIds;

    const statusEl = document.getElementById(statusId);
    if (statusEl) {
        statusEl.innerHTML = renderGVFileBadges(idx, finalIds, finalNames, inputId, statusId);
    }

    await saveGVData(true);
}
