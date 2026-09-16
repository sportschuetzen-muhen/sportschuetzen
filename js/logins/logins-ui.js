// =========================================================
//  LOGINS - UI Rendering
// =========================================================

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
      <li class="nav-item">
        <a class="nav-link" id="tab-btn-login_sessions" href="#"
           onclick="loginsSetTab('login_sessions'); return false;">
          <i class="fas fa-history me-1"></i> Online-Protokoll <span class="badge bg-secondary ms-1" id="logins-badge-login_sessions">0</span>
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

function loginsUpdateBadges() {
  const b1 = document.getElementById('logins-badge-login_daten');
  const b2 = document.getElementById('logins-badge-app_login');
  const b3 = document.getElementById('logins-badge-login_sessions');
  if (b1) b1.textContent = LoginsState.login_daten.length;
  if (b2) b2.textContent = LoginsState.app_login.length;
  if (b3) b3.textContent = LoginsState.login_sessions.length;
}

function loginsRenderTable() {
  const wrapper = document.getElementById('logins-table-wrapper');
  if (!wrapper || !LoginsState.loaded) return;

  const tab      = LoginsState.activeTab;
  const search   = (document.getElementById('logins-search')?.value || '').toLowerCase();
  const sortKey  = LoginsState.sortKey[tab];
  const sortDir  = LoginsState.sortDir[tab];
  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('logins') : true;

  // Show/Hide Add button
  const addBtn = document.getElementById('btn-logins-add');
  if (addBtn) {
    if (tab === 'login_sessions') {
      addBtn.classList.add('d-none');
    } else {
      if (canWrite) addBtn.classList.remove('d-none');
    }
  }

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
    let av = a[sortKey];
    let bv = b[sortKey];

    if (sortKey === 'loginTime' || sortKey === 'lastActive') {
      const ad = parseGermanDate(String(av));
      const bd = parseGermanDate(String(bv));
      return (ad.getTime() - bd.getTime()) * sortDir;
    } else if (sortKey === 'durationSec' || sortKey === 'durationMin') {
      return (Number(av || 0) - Number(bv || 0)) * sortDir;
    }

    const avStr = String(av || '').toLowerCase();
    const bvStr = String(bv || '').toLowerCase();
    return avStr < bvStr ? -sortDir : avStr > bvStr ? sortDir : 0;
  });

  if (rows.length === 0) {
    wrapper.innerHTML = `<div class="alert alert-secondary text-center">Keine Einträge gefunden.</div>`;
    return;
  }

  if (tab === 'login_daten') {
    wrapper.innerHTML = renderLoginDatenTable(rows, canWrite);
  } else if (tab === 'app_login') {
    wrapper.innerHTML = renderAppLoginTable(rows, canWrite);
  } else {
    wrapper.innerHTML = renderLoginSessionsTable(rows);
  }
}

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
      <td class="text-muted small">${escapeHtml(r.mailadresse || r.mailanzeige || '')}</td>
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
          ${th('mailadresse','E-Mail-Adresse')}
          ${th('rolle_extern','Rolle extern')}
          <th class="text-center">Hash</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>`;
}

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

function renderLoginSessionsTable(rows) {
  const th = (key, label) =>
    `<th style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  // Statistik-Berechnungen
  const now = Date.now();
  const activeUserSet = new Set();
  let totalDurationSec = 0;
  let durationCount = 0;

  rows.forEach(r => {
    const lat = parseGermanDate(r.lastActive).getTime();
    if (now - lat < 300000) { // Letzte 5 Minuten aktiv
      activeUserSet.add(r.username);
    }
    const dSec = parseInt(r.durationSec || '0');
    if (dSec > 0) {
      totalDurationSec += dSec;
      durationCount++;
    }
  });

  const activeUsersCount = activeUserSet.size;
  const avgDurationSec = durationCount > 0 ? Math.round(totalDurationSec / durationCount) : 0;
  const friendlyAvgDur = formatDuration(avgDurationSec);

  const rows_html = rows.map(r => {
    const formattedDur = formatDuration(r.durationSec);
    const friendlyUA = simplifyUserAgent(r.userAgent);
    const deviceIcon = getDeviceIcon(r.userAgent);
    return `
    <tr>
      <td><code class="text-primary fw-bold">${escapeHtml(r.username)}</code></td>
      <td class="small">${escapeHtml(r.loginTime)}</td>
      <td class="small">${escapeHtml(r.lastActive)}</td>
      <td class="fw-medium">${escapeHtml(formattedDur)}</td>
      <td class="small"><code>${escapeHtml(r.ip)}</code></td>
      <td class="small text-muted" title="${escapeHtml(r.userAgent)}">
        <i class="fas ${deviceIcon} me-1 text-secondary"></i> ${escapeHtml(friendlyUA)}
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="card p-3 shadow-xs mb-3 border bg-white rounded-3">
      <div class="row g-3">
        <div class="col-md-4">
          <div class="p-3 border rounded-3 text-center" style="background-color: #f8fafc;">
            <h6 class="text-muted mb-1 small text-uppercase fw-bold"><i class="fas fa-sign-in-alt me-1 text-primary"></i> Sitzungen gesamt</h6>
            <h3 class="mb-0 text-primary fw-bold">${rows.length}</h3>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 border rounded-3 text-center" style="background-color: #f0fdf4;">
            <h6 class="text-muted mb-1 small text-uppercase fw-bold"><i class="fas fa-users me-1 text-success"></i> Aktive Nutzer (5 Min)</h6>
            <h3 class="mb-0 text-success fw-bold">${activeUsersCount}</h3>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 border rounded-3 text-center" style="background-color: #fef8ec;">
            <h6 class="text-muted mb-1 small text-uppercase fw-bold"><i class="fas fa-hourglass-half me-1 text-warning"></i> Durchschnitts-Dauer</h6>
            <h3 class="mb-0 text-dark fw-bold" style="font-size: 1.5rem;">${friendlyAvgDur}</h3>
          </div>
        </div>
      </div>
    </div>

    <table class="table table-hover table-sm align-middle mb-0" style="min-width:650px">
      <thead class="table-dark">
        <tr>
          ${th('username','Benutzer')}
          ${th('loginTime','Login-Zeit')}
          ${th('lastActive','Letzte Aktivität')}
          ${th('durationSec','Dauer')}
          ${th('ip','IP-Adresse')}
          ${th('userAgent','Gerät / Browser')}
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>`;
}

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
        <label class="form-label">E-Mail-Adresse</label>
        <input type="email" class="form-control" id="lf-mailadresse" value="${escapeHtml(r ? (r.mailadresse || r.mailanzeige || '') : '')}" placeholder="name@email.ch">
      </div>
      <div class="col-md-6">
        <label class="form-label">Rolle extern</label>
        <input type="text" class="form-control" id="lf-rolle-extern" value="${v('rolle_extern')}" placeholder="z.B. Kassier">
      </div>
    </div>`;
}

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
