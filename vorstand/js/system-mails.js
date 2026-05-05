// === MODUL: SYSTEM-MAILS (App-Info) ===

let sysMailState = null;

async function loadSystemMailsData() {
  const container = document.getElementById('system-mails-container');
  if(!container) return;
  
  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade Mailverteiler...</div>
    </div>
  `;

  try {
    const res = await apiFetch('termine', 'action=loadAdminData');
    sysMailState = await res.json();
    renderSystemMailsUI(container);
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${escapeHtml(e.message)}</div>`;
  }
}

function renderSystemMailsUI(container) {
  container.innerHTML = `
    <div class="card p-3 shadow-sm border-0">
        <h5 class="card-title">Mail-Verteiler für Systemereignisse</h5>
        <div id="app-info-list"></div>
    </div>
  `;
  renderAppInfoList();
}

function renderAppInfoList() {
  const list = document.getElementById('app-info-list');
  if (!list || !sysMailState || !sysMailState.app_info) return;

  const members = getSysMemberMails();

  list.innerHTML = sysMailState.app_info.map((info, i) => {
    const mails = (info.mailadresse || "").split(';').map(x => x.trim()).filter(Boolean);

    return `
      <div class="mb-3 border-bottom pb-3">
        <label class="form-label small fw-bold mb-1">${escapeHtml(info.bezeichnung || '')}</label>

        <div class="tag-box mb-2" style="display:flex; flex-wrap:wrap; gap:6px; padding:6px; border:1px solid #ccc; border-radius:8px; min-height:40px;">
          ${mails.length ? mails.map(m => `
                <span style="background:#e9f2ff; color:#0d6efd; padding:2px 8px; border-radius:10px; font-size:.85rem;">
                  ${escapeHtml(m)} <span style="color:#dc3545; cursor:pointer;" class="write-protected" onclick="removeAppInfoMail(${i}, '${escapeJs(m)}')">×</span>
                </span>
              `).join('') : '<span class="text-muted small">Keine Empfänger</span>'}
        </div>

        <select class="form-select form-select-sm write-protected" onchange="addAppInfoMail(${i}, this.value); this.value=''">
          <option value="">+ Empfänger hinzufügen</option>
          ${members.map(mm => `<option value="${escapeHtml(mm.email)}">${escapeHtml(mm.name)} (${escapeHtml(mm.email)})</option>`).join('')}
        </select>
      </div>
    `;
  }).join('');
}

function getSysMemberMails() {
  const arr = (sysMailState.members || []).map(m => ({
    name: (m.nachname + " " + m.vorname).trim() || m.name || m.email,
    email: m.e_mail || m.email || m.mailadresse
  })).filter(x => x.email);
  arr.sort((a,b) => a.name.localeCompare(b.name));
  return arr;
}

function addAppInfoMail(idx, email) {
  if (!email) return;
  window.markUnsaved();
  const current = (sysMailState.app_info[idx].mailadresse || '').split(';').map(x=>x.trim()).filter(Boolean);
  if (!current.includes(email)) current.push(email);
  sysMailState.app_info[idx].mailadresse = current.join('; ');
  renderAppInfoList();
}

function removeAppInfoMail(idx, email) {
  window.markUnsaved();
  const current = (sysMailState.app_info[idx].mailadresse || '').split(';').map(x=>x.trim()).filter(Boolean);
  sysMailState.app_info[idx].mailadresse = current.filter(x => x !== email).join('; ');
  renderAppInfoList();
}

async function saveSystemMailsData() {
  if(!confirm("Mail-Verteiler speichern?")) return;
  const user = localStorage.getItem('portal_user') || "Admin";
  const payload = {
    action: "saveAdminData",
    user: user,
    termine: sysMailState.termine,
    platzhalter: sysMailState.platzhalter,
    app_info: sysMailState.app_info,
    dropdowns: sysMailState.dropdowns,
    logDetails: "Mail-Verteiler aktualisiert"
  };
  try {
    await apiFetch('termine', '', { method: 'POST', body: JSON.stringify(payload) });
    window.clearUnsaved();
    alert("✅ Gespeichert!");
    loadSystemMailsData();
  } catch(e) {
    alert("Fehler: " + e);
  }
}
