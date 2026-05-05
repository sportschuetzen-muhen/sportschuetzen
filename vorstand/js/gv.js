// === MODUL: GV & PRÄSENZ ===

let gvState = null;
let originalGvState = null;

async function loadGVData() {
  const container = document.getElementById('gv-container');
  if(!container) return;
  
  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade GV Daten...</div>
    </div>
  `;

  try {
    const res = await apiFetch('termine', 'action=loadAdminData');
    gvState = await res.json();
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
                <h5 class="card-title">Präsenz / Anmeldungen</h5>
                <div class="table-responsive" style="max-height: 500px;">
                    <table class="table table-sm table-striped">
                        <thead><tr><th>Name</th><th>Teilnahme</th><th>Zeit</th></tr></thead>
                        <tbody id="gv-anmelde-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
  `;
  renderGVList();
  renderGVAnmeldungenList();
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
          <label class="form-label small fw-bold mb-1">${escapeHtml(label)}</label>
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

function renderGVAnmeldungenList() {
    const tbody = document.getElementById('gv-anmelde-body');
    if(!tbody || !gvState || !gvState.anmeldungen) return;
    tbody.innerHTML = gvState.anmeldungen.map(a => `
        <tr>
            <td>${escapeHtml(a.vorname)} ${escapeHtml(a.nachname)}</td>
            <td><span class="badge bg-${a.teilnahme==='Ja'?'success':'danger'}">${escapeHtml(a.teilnahme)}</span></td>
            <td><small>${a.zeitstempel ? a.zeitstempel.split('T')[0] : '-'}</small></td>
        </tr>`).join('');
}

function getGVMemberMails() {
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
        const res = await apiFetch('termine', '', {
            method: 'POST', body: JSON.stringify({ action: 'runTool', tool: toolName, user: localStorage.getItem('portal_user') })
        });
        const data = await res.json();
        alert(data.success ? "✅ " + data.msg : "❌ Fehler: " + data.error);
    } catch(e) { alert("Netzwerkfehler: " + e); }
}

async function saveGVData() {
  if(!confirm("GV-Änderungen speichern?")) return;
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
    await apiFetch('termine', '', { method: 'POST', body: JSON.stringify(payload) });
    window.clearUnsaved();
    alert("✅ Gespeichert!");
    loadGVData();
  } catch(e) {
    alert("Fehler: " + e);
  }
}
