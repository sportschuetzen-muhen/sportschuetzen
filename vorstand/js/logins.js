// === MODUL: LOGINS-VERWALTUNG ===
// Vollständiges CRUD für login_daten (Admins) und app_login (Mitglieder)
// Verbindung über apiFetch('logins', ...) → Worker → admin-Script

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const LoginsState = {
  login_daten: [],
  app_login:   [],
  sortKey:     { login_daten: 'username', app_login: 'lastname' },
  sortDir:     { login_daten: 1, app_login: 1 },
  activeTab:   'login_daten',
  loaded:      false
};

// ─────────────────────────────────────────────
//  ENTRY POINT (called from navTo in main.js)
// ─────────────────────────────────────────────
async function loadLoginsData() {
  renderLoginsShell();
  await fetchLoginsData();
}

// ─────────────────────────────────────────────
//  SHELL HTML (Tabs, Toolbar, Tables)
// ─────────────────────────────────────────────
function renderLoginsShell() {
  const container = document.getElementById('view-logins');
  if (!container) return;

  container.innerHTML = `
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <div>
        <h2 class="mb-0">🔐 Login-Verwaltung</h2>
        <small class="text-muted">Admins (login_daten) und App-Mitglieder (app_login)</small>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-outline-info write-protected" onclick="loginsSync()" id="btn-logins-sync">
          <i class="fas fa-sync-alt me-1"></i> App-Users Synchronisieren
        </button>
        <button class="btn btn-sm btn-outline-secondary" onclick="fetchLoginsData()" id="btn-logins-reload">
          <i class="fas fa-redo me-1"></i> Aktualisieren
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-0" id="logins-tabs-nav">
      <li class="nav-item">
        <a class="nav-link active" id="tab-btn-login_daten" href="#"
           onclick="loginsSetTab('login_daten'); return false;">
          <i class="fas fa-user-shield me-1"></i> Admins <span class="badge bg-secondary ms-1" id="logins-badge-login_daten">0</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link" id="tab-btn-app_login" href="#"
           onclick="loginsSetTab('app_login'); return false;">
          <i class="fas fa-users me-1"></i> App-Mitglieder <span class="badge bg-secondary ms-1" id="logins-badge-app_login">0</span>
        </a>
      </li>
    </ul>

    <!-- Search bar -->
    <div class="card border-top-0 rounded-0 rounded-bottom border p-2 mb-3" style="border-top:none!important">
      <div class="d-flex gap-2 align-items-center">
        <div class="flex-grow-1 position-relative">
          <i class="fas fa-search position-absolute" style="left:10px;top:50%;transform:translateY(-50%);color:#aaa;"></i>
          <input type="text" class="form-control form-control-sm ps-4" id="logins-search"
                 placeholder="Suchen..." oninput="loginsRenderTable()">
        </div>
        <button class="btn btn-sm btn-primary write-protected" id="btn-logins-add" onclick="loginsOpenAdd()">
          <i class="fas fa-plus me-1"></i> Neu
        </button>
      </div>
    </div>

    <!-- Table container -->
    <div id="logins-table-wrapper" style="overflow-x:auto;">
      <div class="text-center text-muted py-5">
        <div class="spinner-border spinner-border-sm me-2"></div> Lade Daten...
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="logins-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header" style="background:var(--primary);color:white;">
            <h5 class="modal-title" id="logins-modal-title">Eintrag</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="logins-modal-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
            <button type="button" class="btn btn-danger d-none" id="logins-btn-delete" onclick="loginsConfirmDelete()">
              <i class="fas fa-trash me-1"></i> Löschen
            </button>
            <button type="button" class="btn btn-primary" id="logins-btn-save" onclick="loginsSave()">
              <i class="fas fa-save me-1"></i> Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
//  API: Daten laden
// ─────────────────────────────────────────────
async function fetchLoginsData() {
  const wrapper = document.getElementById('logins-table-wrapper');
  if (wrapper) {
    wrapper.innerHTML = `<div class="text-center text-muted py-5">
      <div class="spinner-border spinner-border-sm me-2"></div> Lade Daten...
    </div>`;
  }
  try {
    const res  = await apiFetch('logins', 'action=getLogins');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    LoginsState.login_daten = data.login_daten || [];
    LoginsState.app_login   = data.app_login   || [];
    LoginsState.loaded      = true;

    loginsUpdateBadges();
    loginsRenderTable();
  } catch (e) {
    if (wrapper) {
      wrapper.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>${escapeHtml(e.message)}</div>`;
    }
  }
}

// ─────────────────────────────────────────────
//  BADGES
// ─────────────────────────────────────────────
function loginsUpdateBadges() {
  const b1 = document.getElementById('logins-badge-login_daten');
  const b2 = document.getElementById('logins-badge-app_login');
  if (b1) b1.textContent = LoginsState.login_daten.length;
  if (b2) b2.textContent = LoginsState.app_login.length;
}

// ─────────────────────────────────────────────
//  TAB SWITCH
// ─────────────────────────────────────────────
function loginsSetTab(tab) {
  LoginsState.activeTab = tab;
  document.querySelectorAll('#logins-tabs-nav .nav-link').forEach(a => a.classList.remove('active'));
  const btn = document.getElementById('tab-btn-' + tab);
  if (btn) btn.classList.add('active');

  // Suchfeld leeren
  const sf = document.getElementById('logins-search');
  if (sf) sf.value = '';

  loginsRenderTable();
}

// ─────────────────────────────────────────────
//  SORTIERUNG
// ─────────────────────────────────────────────
function loginsSort(key) {
  const tab = LoginsState.activeTab;
  if (LoginsState.sortKey[tab] === key) {
    LoginsState.sortDir[tab] *= -1;
  } else {
    LoginsState.sortKey[tab] = key;
    LoginsState.sortDir[tab] = 1;
  }
  loginsRenderTable();
}

function loginsSortIcon(key) {
  const tab = LoginsState.activeTab;
  if (LoginsState.sortKey[tab] !== key) return '<i class="fas fa-sort text-muted ms-1" style="font-size:0.7em"></i>';
  return LoginsState.sortDir[tab] === 1
    ? '<i class="fas fa-sort-up ms-1 text-primary" style="font-size:0.7em"></i>'
    : '<i class="fas fa-sort-down ms-1 text-primary" style="font-size:0.7em"></i>';
}

// ─────────────────────────────────────────────
//  TABELLEN-RENDER
// ─────────────────────────────────────────────
function loginsRenderTable() {
  const wrapper = document.getElementById('logins-table-wrapper');
  if (!wrapper || !LoginsState.loaded) return;

  const tab      = LoginsState.activeTab;
  const search   = (document.getElementById('logins-search')?.value || '').toLowerCase();
  const sortKey  = LoginsState.sortKey[tab];
  const sortDir  = LoginsState.sortDir[tab];
  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('logins') : true;

  // Daten
  let rows = [...LoginsState[tab]];

  // Filtern
  if (search) {
    rows = rows.filter(r =>
      Object.values(r).some(v => String(v).toLowerCase().includes(search))
    );
  }

  // Sortieren
  rows.sort((a, b) => {
    const av = String(a[sortKey] || '').toLowerCase();
    const bv = String(b[sortKey] || '').toLowerCase();
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });

  if (rows.length === 0) {
    wrapper.innerHTML = `<div class="alert alert-secondary text-center">Keine Einträge gefunden.</div>`;
    return;
  }

  if (tab === 'login_daten') {
    wrapper.innerHTML = renderLoginDatenTable(rows, canWrite);
  } else {
    wrapper.innerHTML = renderAppLoginTable(rows, canWrite);
  }
}

// ── login_daten Tabelle ──────────────────────
function renderLoginDatenTable(rows, canWrite) {
  const th = (key, label) =>
    `<th style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  const editBtn = canWrite
    ? (r) => `<button class="btn btn-xs btn-outline-primary btn-sm py-0 px-2" onclick='loginsOpenEdit(${JSON.stringify(r)})'>
                <i class="fas fa-pencil-alt"></i>
              </button>`
    : () => '';

  const rows_html = rows.map(r => `
    <tr>
      <td><code class="text-primary fw-bold">${escapeHtml(r.username)}</code></td>
      <td><span class="badge ${roleBadgeColor(r.rolle)}">${escapeHtml(r.rolle)}</span></td>
      <td>${escapeHtml(r.anzeigename)}</td>
      <td class="text-muted small">${escapeHtml(r.mailanzeige)}</td>
      <td class="text-muted small">${escapeHtml(r.rolle_extern)}</td>
      <td class="text-center">
        ${r.passwort_hash ? '<i class="fas fa-check-circle text-success" title="Hash gesetzt"></i>' : '<i class="fas fa-times-circle text-danger" title="Kein Hash"></i>'}
      </td>
      <td class="text-end">${editBtn(r)}</td>
    </tr>`).join('');

  return `
    <table class="table table-hover table-sm align-middle mb-0" style="min-width:650px">
      <thead class="table-dark">
        <tr>
          ${th('username','Benutzername')}
          ${th('rolle','Rolle')}
          ${th('anzeigename','Anzeigename')}
          ${th('mailanzeige','Mail-Anzeige')}
          ${th('rolle_extern','Rolle extern')}
          <th class="text-center">Hash</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>`;
}

// ── app_login Tabelle ────────────────────────
function renderAppLoginTable(rows, canWrite) {
  const th = (key, label) =>
    `<th style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  const editBtn = canWrite
    ? (r) => `<button class="btn btn-xs btn-outline-primary btn-sm py-0 px-2" onclick='loginsOpenEdit(${JSON.stringify(r)})'>
                <i class="fas fa-pencil-alt"></i>
              </button>`
    : () => '';

  const rows_html = rows.map(r => `
    <tr>
      <td class="text-muted small"><code>${escapeHtml(r.personnumber)}</code></td>
      <td><code class="text-success fw-bold">${escapeHtml(r.addressnumber_pin)}</code></td>
      <td>${escapeHtml(r.firstname)}</td>
      <td>${escapeHtml(r.lastname)}</td>
      <td class="text-center">
        ${r.passwort_hash ? '<i class="fas fa-check-circle text-success" title="Hash gesetzt"></i>' : '<i class="fas fa-minus text-muted" title="Kein Passwort"></i>'}
      </td>
      <td class="text-end">${editBtn(r)}</td>
    </tr>`).join('');

  return `
    <table class="table table-hover table-sm align-middle mb-0" style="min-width:550px">
      <thead class="table-dark">
        <tr>
          ${th('personnumber','PersonNr')}
          ${th('addressnumber_pin','PIN (AddressNr)')}
          ${th('firstname','Vorname')}
          ${th('lastname','Nachname')}
          <th class="text-center">Hash</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>`;
}

// ─────────────────────────────────────────────
//  ROLLE → BADGE FARBE
// ─────────────────────────────────────────────
function roleBadgeColor(rolle) {
  const map = {
    admin:         'bg-danger',
    vorstand:      'bg-primary',
    kassier:       'bg-success',
    aktuar:        'bg-info text-dark',
    schuetzenmeister: 'bg-warning text-dark',
    vermieter:     'bg-secondary',
    materialwart:  'bg-dark'
  };
  const r = String(rolle || '').split(',')[0].trim().toLowerCase();
  return map[r] || 'bg-secondary';
}

// ─────────────────────────────────────────────
//  MODAL: NEU
// ─────────────────────────────────────────────
function loginsOpenAdd() {
  const tab = LoginsState.activeTab;
  document.getElementById('logins-modal-title').textContent = tab === 'login_daten'
    ? '➕ Neuer Admin-Zugang' : '➕ Neues App-Mitglied';
  document.getElementById('logins-btn-delete').classList.add('d-none');
  document.getElementById('logins-modal-body').innerHTML = tab === 'login_daten'
    ? loginDatenForm(null) : appLoginForm(null);

  // _mode speichern
  window._loginsEditMode = 'add';
  window._loginsEditRow  = null;

  const modal = new bootstrap.Modal(document.getElementById('logins-modal'));
  modal.show();
}

// ─────────────────────────────────────────────
//  MODAL: BEARBEITEN
// ─────────────────────────────────────────────
function loginsOpenEdit(record) {
  const tab = LoginsState.activeTab;
  document.getElementById('logins-modal-title').textContent = tab === 'login_daten'
    ? `✏️ Admin bearbeiten: ${escapeHtml(record.username || '')}` 
    : `✏️ App-Mitglied bearbeiten: ${escapeHtml(record.firstname || '')} ${escapeHtml(record.lastname || '')}`;

  document.getElementById('logins-btn-delete').classList.remove('d-none');
  document.getElementById('logins-modal-body').innerHTML = tab === 'login_daten'
    ? loginDatenForm(record) : appLoginForm(record);

  window._loginsEditMode = 'edit';
  window._loginsEditRow  = record;

  const modal = new bootstrap.Modal(document.getElementById('logins-modal'));
  modal.show();
}

// ─────────────────────────────────────────────
//  FORMULAR: login_daten
// ─────────────────────────────────────────────
function loginDatenForm(r) {
  const v = (field) => escapeHtml(r ? (r[field] || '') : '');
  const ROLES = ['admin','vorstand','kassier','aktuar','schuetzenmeister','vermieter','materialwart'];
  const roleOptions = ROLES.map(ro =>
    `<option value="${ro}" ${r && r.rolle && r.rolle.split(',').map(x=>x.trim()).includes(ro) ? 'selected' : ''}>${ro}</option>`
  ).join('');

  return `
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label fw-bold">Benutzername *</label>
        <input type="text" class="form-control" id="lf-username" value="${v('username')}" placeholder="z.B. j.muster">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-bold">Anzeigename *</label>
        <input type="text" class="form-control" id="lf-anzeigename" value="${v('anzeigename')}" placeholder="z.B. Jochen Muster">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-bold">Rolle(n) *</label>
        <select class="form-select" id="lf-rolle">${roleOptions}</select>
        <div class="form-text">Mehrere mit Komma trennen: <code>admin,vorstand</code></div>
        <input type="text" class="form-control form-control-sm mt-1" id="lf-rolle-custom"
               value="${v('rolle')}" placeholder="Oder manuell eingeben...">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-bold">Neues Passwort <span class="text-muted fw-normal">(leer = unverändert)</span></label>
        <div class="input-group">
          <input type="password" class="form-control" id="lf-passwort" placeholder="Leer lassen = kein Update">
          <button class="btn btn-outline-secondary" type="button" onclick="loginsTogglePw('lf-passwort')">
            <i class="fas fa-eye"></i>
          </button>
        </div>
        ${r && r.passwort_hash ? '<div class="form-text text-success"><i class="fas fa-check-circle"></i> Hash vorhanden</div>' : '<div class="form-text text-danger"><i class="fas fa-times-circle"></i> Kein Hash gesetzt</div>'}
      </div>
      <div class="col-md-6">
        <label class="form-label">Mail-Anzeige</label>
        <input type="email" class="form-control" id="lf-mailanzeige" value="${v('mailanzeige')}" placeholder="name@email.ch">
      </div>
      <div class="col-md-6">
        <label class="form-label">Rolle extern</label>
        <input type="text" class="form-control" id="lf-rolle-extern" value="${v('rolle_extern')}" placeholder="z.B. Kassier">
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
//  FORMULAR: app_login
// ─────────────────────────────────────────────
function appLoginForm(r) {
  const v = (field) => escapeHtml(r ? (r[field] || '') : '');
  return `
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label fw-bold">PersonNummer</label>
        <input type="text" class="form-control" id="af-personnumber" value="${v('personnumber')}" placeholder="z.B. 123456">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-bold">PIN (AddressNumber) *</label>
        <input type="text" class="form-control" id="af-pin" value="${v('addressnumber_pin')}" placeholder="6-stellig, z.B. 012345">
        <div class="form-text">Wird automatisch auf 6 Stellen aufgefüllt.</div>
      </div>
      <div class="col-md-6">
        <label class="form-label fw-bold">Vorname</label>
        <input type="text" class="form-control" id="af-firstname" value="${v('firstname')}">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-bold">Nachname</label>
        <input type="text" class="form-control" id="af-lastname" value="${v('lastname')}">
      </div>
      <div class="col-12">
        <label class="form-label">Passwort überschreiben <span class="text-muted fw-normal">(optional — bei App-Mitgliedern normalerweise leer)</span></label>
        <div class="input-group">
          <input type="password" class="form-control" id="af-passwort" placeholder="Leer lassen = kein Update">
          <button class="btn btn-outline-secondary" type="button" onclick="loginsTogglePw('af-passwort')">
            <i class="fas fa-eye"></i>
          </button>
        </div>
        ${r && r.passwort_hash ? '<div class="form-text text-success"><i class="fas fa-check-circle"></i> Hash vorhanden</div>' : '<div class="form-text text-muted"><i class="fas fa-minus-circle"></i> Kein Hash</div>'}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
//  PASSWORT ANZEIGEN/VERBERGEN
// ─────────────────────────────────────────────
function loginsTogglePw(inputId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─────────────────────────────────────────────
//  SPEICHERN
// ─────────────────────────────────────────────
async function loginsSave() {
  const tab    = LoginsState.activeTab;
  const mode   = window._loginsEditMode;
  const record = window._loginsEditRow;
  const btn    = document.getElementById('logins-btn-save');

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Speichern...';

    let params = {};
    let action = '';

    if (tab === 'login_daten') {
      const rolle = (document.getElementById('lf-rolle-custom')?.value?.trim() ||
                     document.getElementById('lf-rolle')?.value || '');
      params = {
        action:       mode === 'add' ? 'addLoginDaten' : 'saveLoginDaten',
        username:     document.getElementById('lf-username')?.value?.trim()    || '',
        anzeigename:  document.getElementById('lf-anzeigename')?.value?.trim() || '',
        rolle:        rolle,
        passwort:     document.getElementById('lf-passwort')?.value            || '',
        mailanzeige:  document.getElementById('lf-mailanzeige')?.value?.trim() || '',
        rolle_extern: document.getElementById('lf-rolle-extern')?.value?.trim()|| ''
      };
      if (mode === 'edit' && record) params.row = record._row;

      if (!params.username) { showError('Benutzername ist Pflicht.'); return; }

    } else {
      params = {
        action:           mode === 'add' ? 'addAppLogin' : 'saveAppLogin',
        personnumber:      document.getElementById('af-personnumber')?.value?.trim() || '',
        addressnumber_pin: document.getElementById('af-pin')?.value?.trim()          || '',
        firstname:         document.getElementById('af-firstname')?.value?.trim()    || '',
        lastname:          document.getElementById('af-lastname')?.value?.trim()     || '',
        passwort:          document.getElementById('af-passwort')?.value             || ''
      };
      if (mode === 'edit' && record) params.row = record._row;

      if (!params.addressnumber_pin) { showError('PIN (AddressNumber) ist Pflicht.'); return; }
    }

    const qs  = new URLSearchParams(params).toString();
    const res = await apiFetch('logins', qs);
    const data = await res.json();

    if (data.success) {
      bootstrap.Modal.getInstance(document.getElementById('logins-modal'))?.hide();
      showSuccess(data.message || 'Gespeichert!');
      await fetchLoginsData();
    } else {
      showError('Fehler: ' + (data.error || 'Unbekannt'));
    }

  } catch (e) {
    showError('Verbindungsfehler: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save me-1"></i> Speichern';
  }
}

// ─────────────────────────────────────────────
//  LÖSCHEN
// ─────────────────────────────────────────────
async function loginsConfirmDelete() {
  const tab    = LoginsState.activeTab;
  const record = window._loginsEditRow;
  if (!record) return;

  const label = tab === 'login_daten'
    ? `Admin "${record.username}"`
    : `App-Mitglied "${record.firstname} ${record.lastname}"`;

  if (!confirm(`⚠️ Wirklich löschen?\n\n${label}\n\nDieser Vorgang kann nicht rückgängig gemacht werden!`)) return;

  const btn = document.getElementById('logins-btn-delete');
  try {
    btn.disabled = true;

    const action = tab === 'login_daten' ? 'deleteLoginDaten' : 'deleteAppLogin';
    const qs = new URLSearchParams({ action, row: record._row }).toString();
    const res = await apiFetch('logins', qs);
    const data = await res.json();

    if (data.success) {
      bootstrap.Modal.getInstance(document.getElementById('logins-modal'))?.hide();
      showSuccess('Eintrag gelöscht.');
      await fetchLoginsData();
    } else {
      showError('Fehler: ' + (data.error || 'Unbekannt'));
    }
  } catch (e) {
    showError('Verbindungsfehler: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ─────────────────────────────────────────────
//  SYNC-AUSLÖSER
// ─────────────────────────────────────────────
async function loginsSync() {
  if (!confirm('🔄 App-Users aus der Hauptdatenbank synchronisieren?\n\nDies aktualisiert alle Mitglieder in der app_login-Tabelle.')) return;

  const btn = document.getElementById('btn-logins-sync');
  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Synchronisiere...';

    const res  = await apiFetch('logins', 'action=syncAppUsers');
    const data = await res.json();

    if (data.success) {
      showSuccess('✅ ' + (data.message || 'Sync abgeschlossen!'));
      await fetchLoginsData();
    } else {
      showError('Sync-Fehler: ' + (data.error || 'Unbekannt'));
    }
  } catch (e) {
    showError('Verbindungsfehler beim Sync: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync-alt me-1"></i> App-Users Synchronisieren';
  }
}
