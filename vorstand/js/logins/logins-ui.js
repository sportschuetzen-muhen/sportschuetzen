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
        <h2 class="mb-0 fw-bold text-primary"><i class="fas fa-user-lock me-2"></i>Login- & Zugangsverwaltung</h2>
        <small class="text-muted">Benutzerkonten, Rollenrechte & Live-Sitzungen (Supabase PostgreSQL)</small>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-outline-primary write-protected shadow-xs" onclick="loginsSync()" id="btn-logins-sync">
          <i class="fas fa-sync-alt me-1"></i> App-Users Synchronisieren
        </button>
        <button class="btn btn-sm btn-outline-secondary shadow-xs" onclick="fetchLoginsData()" id="btn-logins-reload">
          <i class="fas fa-redo me-1"></i> Aktualisieren
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-0" id="logins-tabs-nav">
      <li class="nav-item">
        <a class="nav-link active fw-medium" id="tab-btn-login_daten" href="#"
           onclick="loginsSetTab('login_daten'); return false;">
          <i class="fas fa-user-shield me-1 text-primary"></i> Vorstand & Admins <span class="badge bg-primary ms-1" id="logins-badge-login_daten">0</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link fw-medium" id="tab-btn-app_login" href="#"
           onclick="loginsSetTab('app_login'); return false;">
          <i class="fas fa-users me-1 text-info"></i> Vereinsmitglieder (PIN) <span class="badge bg-secondary ms-1" id="logins-badge-app_login">0</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link fw-medium" id="tab-btn-login_sessions" href="#"
           onclick="loginsSetTab('login_sessions'); return false;">
          <i class="fas fa-tower-broadcast me-1 text-success"></i> Aktive Sitzungen & Audit <span class="badge bg-secondary ms-1" id="logins-badge-login_sessions">0</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link fw-medium" id="tab-btn-role_permissions" href="#"
           onclick="loginsSetTab('role_permissions'); return false;">
          <i class="fas fa-th me-1 text-warning"></i> Rollen & Berechtigungen <span class="badge bg-secondary ms-1" id="logins-badge-role_permissions">0</span>
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
  const b4 = document.getElementById('logins-badge-role_permissions');
  if (b1) b1.textContent = LoginsState.login_daten.length;
  if (b2) b2.textContent = LoginsState.app_login.length;
  if (b3) b3.textContent = LoginsState.login_sessions.length;
  if (b4) b4.textContent = LoginsState.role_permissions.length;
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
    if (tab === 'login_sessions' || tab === 'role_permissions') {
      addBtn.classList.add('d-none');
    } else {
      if (canWrite) addBtn.classList.remove('d-none');
    }
  }

  // 4. Tab: Rollen & Berechtigungs-Grid
  if (tab === 'role_permissions') {
    wrapper.innerHTML = renderRolePermissionsGrid(canWrite);
    return;
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

function renderRolePermissionsGrid(canWrite) {
  const search = (document.getElementById('logins-search')?.value || '').toLowerCase().trim();
  const perms = LoginsState.role_permissions || [];

  // Lookup-Set: role + '::' + permission
  const activeSet = new Set(perms.map(p => `${p.role}::${p.permission}`));

  let filteredModules = RBAC_MODULES.map(m => {
    const matchedPerms = m.permissions.filter(p => {
      if (!search) return true;
      return (
        m.module.toLowerCase().includes(search) ||
        p.key.toLowerCase().includes(search) ||
        p.label.toLowerCase().includes(search) ||
        (p.desc && p.desc.toLowerCase().includes(search))
      );
    });
    return { ...m, permissions: matchedPerms };
  }).filter(m => m.permissions.length > 0);

  if (filteredModules.length === 0) {
    return `<div class="alert alert-secondary text-center py-4">Keine Berechtigungen zu diesem Suchbegriff gefunden.</div>`;
  }

  // Header Spalten für Rollen
  const roleHeadersHtml = RBAC_ROLES.map(r => `
    <th class="text-center" style="width: 100px; font-size: 0.78rem;">
      <span class="badge ${r.badge} py-1 px-2 rounded-pill d-inline-block text-truncate" style="max-width: 90px;" title="${escapeHtml(r.label)}">
        ${escapeHtml(r.label)}
      </span>
    </th>
  `).join('');

  let tableBodyHtml = '';

  filteredModules.forEach(mod => {
    // Gruppen-Header Zeile
    tableBodyHtml += `
      <tr class="table-light">
        <td colspan="${2 + RBAC_ROLES.length}" class="py-2 px-3 fw-bold text-primary">
          <i class="fas ${mod.icon} me-2 text-primary"></i>${escapeHtml(mod.module)}
          <span class="badge bg-light text-muted border ms-2" style="font-size: 0.7rem;">${mod.permissions.length} Aktionen</span>
        </td>
      </tr>
    `;

    mod.permissions.forEach(p => {
      const cellsHtml = RBAC_ROLES.map(r => {
        // Admin ist Wildcard: immer voll aktiv und geschützt
        if (r.key === 'admin') {
          return `
            <td class="text-center bg-danger-subtle bg-opacity-25" style="vertical-align: middle;">
              <span class="badge bg-danger text-white rounded-pill px-2 py-0.5" style="font-size: 0.68rem;" title="System-Administrator besitzt Wildcard-Vollzugriff">
                <i class="fas fa-check me-0.5"></i> Aktiv
              </span>
            </td>
          `;
        }

        const isChecked = activeSet.has(`${r.key}::${p.key}`);
        const disabledAttr = canWrite ? '' : 'disabled';

        return `
          <td class="text-center" style="vertical-align: middle;">
            <div class="form-check form-switch d-inline-block m-0 p-0" style="min-height: auto;">
              <input class="form-check-input" type="checkbox" role="switch"
                     style="cursor: ${canWrite ? 'pointer' : 'not-allowed'};"
                     ${isChecked ? 'checked' : ''}
                     ${disabledAttr}
                     onchange="toggleRolePermission('${r.key}', '${p.key}', this.checked, '${escapeHtml(p.desc || p.label)}')"
                     title="${r.label}: ${p.key}">
            </div>
          </td>
        `;
      }).join('');

      tableBodyHtml += `
        <tr>
          <td style="vertical-align: middle; min-width: 220px;">
            <div class="fw-bold text-dark" style="font-size: 0.88rem;">${escapeHtml(p.label)}</div>
            <code class="text-muted" style="font-size: 0.72rem;">${escapeHtml(p.key)}</code>
          </td>
          <td class="text-muted small" style="vertical-align: middle; min-width: 200px; font-size: 0.8rem;">
            ${escapeHtml(p.desc || '—')}
          </td>
          ${cellsHtml}
        </tr>
      `;
    });
  });

  return `
    <div class="alert alert-info py-2.5 px-3 small mb-3 border-0 shadow-xs d-flex align-items-center justify-content-between flex-wrap gap-2 rounded-3" style="background-color: #f0f7ff; color: #0b4375;">
      <div>
        <i class="fas fa-shield-halved me-2 text-primary"></i>
        <strong>Entkoppeltes RBAC-Berechtigungsmodell:</strong> Diese Matrix definiert die granularen Berechtigungen (<code>public.role_permissions</code>). Jede Änderung wird direkt in PostgreSQL persistiert und steuert Row Level Security (RLS) sowie Frontend-Schreibrechte.
      </div>
      <div>
        <span class="badge bg-primary rounded-pill px-2.5 py-1">
          <i class="fas fa-key me-1"></i> ${perms.length} Aktive Rollenzuweisungen
        </span>
      </div>
    </div>

    <div class="card shadow-xs border rounded-3 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" style="min-width: 1050px;">
          <thead class="table-light text-secondary border-bottom" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
            <tr>
              <th style="min-width: 220px;">Modul & Granulare Aktion</th>
              <th style="min-width: 200px;">Beschreibung / Wirkung</th>
              ${roleHeadersHtml}
            </tr>
          </thead>
          <tbody>
            ${tableBodyHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderLoginDatenTable(rows, canWrite) {
  const th = (key, label) =>
    `<th style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  const editBtn = canWrite
    ? (r) => `<button class="btn btn-sm btn-outline-primary py-0 px-2 rounded-2" title="Bearbeiten" onclick='loginsOpenEdit(${JSON.stringify(r)})'>
                <i class="fas fa-pencil-alt"></i>
              </button>`
    : () => '';

  const rows_html = rows.map(r => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center" style="width:28px;height:28px;font-size:0.75rem;">
            ${escapeHtml((r.username || '?').substring(0, 2).toUpperCase())}
          </div>
          <code class="text-primary fw-bold">${escapeHtml(r.username)}</code>
        </div>
      </td>
      <td>${r.personnumber ? `<span class="badge bg-light text-dark border font-monospace">${escapeHtml(r.personnumber)}</span>` : '<span class="text-muted">–</span>'}</td>
      <td><span class="badge ${roleBadgeColor(r.rolle)} rounded-pill">${escapeHtml(r.rolle)}</span></td>
      <td class="fw-medium">${escapeHtml(r.anzeigename)}</td>
      <td class="text-muted small">${escapeHtml(r.mailadresse || r.mailanzeige || '—')}</td>
      <td class="text-muted small fw-medium">${escapeHtml(r.rolle_extern || '—')}</td>
      <td class="text-center">
        ${r.passwort_hash 
          ? '<span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2 rounded-pill"><i class="fas fa-shield-alt me-1"></i>Supabase Auth</span>' 
          : `<div class="d-inline-flex align-items-center gap-1">
               <span class="badge bg-warning-subtle text-warning border border-warning-subtle py-1 px-2 rounded-pill"><i class="fas fa-clock me-1"></i>Ausstehend</span>
               ${canWrite && (r.mailadresse || r.mailanzeige) ? `<button class="btn btn-xs btn-outline-primary py-0 px-2 rounded-pill shadow-xs" style="font-size:0.72rem;" title="Aktivierungs- / Reset-Mail senden" onclick="loginsSendInvite('${escapeHtml(r.mailadresse || r.mailanzeige)}', '${escapeHtml(r.username)}')"><i class="fas fa-paper-plane me-1"></i>Einladen</button>` : ''}
             </div>`}
      </td>
      <td class="text-end">${editBtn(r)}</td>
    </tr>`).join('');

  return `
    <div class="card shadow-xs border rounded-3 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" style="min-width:750px">
          <thead class="table-light text-secondary border-bottom" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
            <tr>
              ${th('username','Benutzername')}
              ${th('personnumber','PersonNr')}
              ${th('rolle','Rolle')}
              ${th('anzeigename','Anzeigename')}
              ${th('mailadresse','E-Mail (Auth)')}
              ${th('rolle_extern','Vorstandsfunktion')}
              <th class="text-center">Auth-Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    </div>`;
}

function renderAppLoginTable(rows, canWrite) {
  const th = (key, label) =>
    `<th style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  const editBtn = canWrite
    ? (r) => `<button class="btn btn-sm btn-outline-primary py-0 px-2 rounded-2" title="PIN bearbeiten" onclick='loginsOpenEdit(${JSON.stringify(r)})'>
                <i class="fas fa-pencil-alt"></i>
              </button>`
    : () => '';

  const rows_html = rows.map(r => `
    <tr>
      <td><span class="badge bg-light text-muted border font-monospace">${escapeHtml(r.personnumber)}</span></td>
      <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace px-2 py-1">${escapeHtml(r.addressnumber_pin)}</span></td>
      <td class="fw-medium">${escapeHtml(r.firstname)}</td>
      <td class="fw-medium">${escapeHtml(r.lastname)}</td>
      <td class="text-muted small">${escapeHtml(r.email || '—')}</td>
      <td class="text-center">
        ${r.passwort_hash 
          ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill py-1 px-2"><i class="fas fa-check-circle me-1"></i>Aktiv</span>' 
          : '<span class="badge bg-light text-muted border rounded-pill py-1 px-2"><i class="fas fa-key me-1"></i>PIN</span>'}
      </td>
      <td class="text-end">${editBtn(r)}</td>
    </tr>`).join('');

  return `
    <div class="card shadow-xs border rounded-3 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" style="min-width:650px">
          <thead class="table-light text-secondary border-bottom" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
            <tr>
              ${th('personnumber','PersonNr (SSV)')}
              ${th('addressnumber_pin','PIN (AddressNr)')}
              ${th('firstname','Vorname')}
              ${th('lastname','Nachname')}
              ${th('email','E-Mail')}
              <th class="text-center">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    </div>`;
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
    if (now - lat < 300000 || r.isOnline) { // Letzte 5 Minuten aktiv
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
    const lat = parseGermanDate(r.lastActive).getTime();
    const isOnlineNow = (now - lat < 300000) || r.isOnline;

    const statusBadge = isOnlineNow
      ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1"><span class="spinner-grow spinner-grow-sm text-success me-1 align-middle" style="width:6px;height:6px;" role="status"></span>Online</span>'
      : '<span class="badge bg-light text-muted border rounded-pill px-2 py-1">Beendet</span>';

    return `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <code class="text-primary fw-bold">${escapeHtml(r.username)}</code>
        </div>
      </td>
      <td>${statusBadge}</td>
      <td class="small text-muted">${escapeHtml(r.loginTime)}</td>
      <td class="small text-dark">${escapeHtml(r.lastActive)}</td>
      <td class="fw-medium font-monospace small">${escapeHtml(formattedDur)}</td>
      <td class="small"><span class="badge bg-light text-dark border font-monospace">${escapeHtml(r.ip)}</span></td>
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
            <h6 class="text-muted mb-1 small text-uppercase fw-bold"><i class="fas fa-users me-1 text-success"></i> Aktive Vorstände online</h6>
            <h3 class="mb-0 text-success fw-bold d-flex align-items-center justify-content-center gap-2">
              ${activeUsersCount > 0 ? '<span class="spinner-grow spinner-grow-sm text-success" style="width:10px;height:10px;"></span>' : ''}
              ${activeUsersCount}
            </h3>
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

    <div class="card shadow-xs border rounded-3 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" style="min-width:750px">
          <thead class="table-light text-secondary border-bottom" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
            <tr>
              ${th('username','Benutzer')}
              <th style="width: 100px;">Status</th>
              ${th('loginTime','Login-Zeit')}
              ${th('lastActive','Letzte Aktivität')}
              ${th('durationSec','Dauer')}
              ${th('ip','IP-Adresse')}
              ${th('userAgent','Gerät / Browser')}
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    </div>`;
}

function loginDatenForm(r) {
  const v = (field) => escapeHtml(r ? (r[field] || '') : '');
  const ROLES = ['admin','vorstand','kassier','aktuar','schuetzenmeister','vermieter','materialwart'];
  const roleOptions = ROLES.map(ro =>
    `<option value="${ro}" ${r && r.rolle && r.rolle.split(',').map(x=>x.trim()).includes(ro) ? 'selected' : ''}>${ro}</option>`
  ).join('');

  const curPN = r ? String(r.personnumber || r.PersonNumber || '').trim() : '';

  const members = [...(window._mglData || [])]
    .filter(m => {
      const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1' || String(m.Deceased).toLowerCase() === 'true' || Boolean(m.Todesdatum) || String(m.Status || '').toLowerCase().includes('verstorben');
      const isExited = Boolean(m.Vereinsaustritt) || Boolean(m.ExitDate) || String(m.Status || '').toLowerCase().includes('ausgetreten') || String(m.Status || '').toLowerCase().includes('ehemalig');
      if (curPN && curPN === String(m.PersonNumber || '').trim()) return true;
      return !isDeceased && !isExited;
    })
    .sort((a, b) => {
      const na = `${a.LastName || ''} ${a.FirstName || ''}`.trim().toLowerCase();
      const nb = `${b.LastName || ''} ${b.FirstName || ''}`.trim().toLowerCase();
      return na.localeCompare(nb, 'de');
    });

  const memberOptions = members.map(m => {
    const pn = String(m.PersonNumber || '').trim();
    const isSel = curPN && curPN === pn;
    const fn = m.FirstName || '';
    const ln = m.LastName || '';
    return `<option value="${escapeHtml(pn)}" ${isSel ? 'selected' : ''}>${escapeHtml(ln)} ${escapeHtml(fn)} (${escapeHtml(pn)})</option>`;
  }).join('');

  return `
    <div class="row g-3">
      <div class="col-12">
        <div class="p-3 bg-light rounded border">
          <label class="form-label fw-bold mb-1 text-primary">
            <i class="fas fa-users me-1"></i> Mitglied verknüpfen (Members100)
          </label>
          <select class="form-select" id="lf-member-select" onchange="loginsOnMemberSelect(this.value)">
            <option value="">-- Mitglied auswählen (übernimmt Name, Vorname, Mail) --</option>
            ${memberOptions}
          </select>
          <div class="form-text small text-muted">
            Wähle ein Vereinsmitglied: PersonNumber, Name, Vorname und E-Mail-Adresse werden automatisch ausgefüllt.
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <label class="form-label fw-bold">PersonNumber (Mitglieds-Nr)</label>
        <input type="text" class="form-control font-monospace" id="lf-personnumber" value="${v('personnumber')}" placeholder="z.B. 123456" oninput="loginsOnPersonNumberInput(this.value)">
      </div>
      <div class="col-md-4">
        <label class="form-label fw-bold">Benutzername *</label>
        <input type="text" class="form-control" id="lf-username" value="${v('username')}" placeholder="z.B. j.muster">
      </div>
      <div class="col-md-4">
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
        <label class="form-label fw-bold">E-Mail-Adresse (Supabase Auth) *</label>
        <input type="email" class="form-control" id="lf-mailadresse" value="${escapeHtml(r ? (r.mailadresse || r.mailanzeige || '') : '')}" placeholder="name@email.ch">
        <div class="form-text">Dient als Login-Adresse und für Passwort-Reset / Magic Link.</div>
      </div>
      <div class="col-md-6">
        <label class="form-label fw-bold">Vorstandsfunktion (z.B. Kassier, Aktuar) *</label>
        <input type="text" class="form-control" id="lf-rolle-extern" value="${v('rolle_extern')}" placeholder="z.B. Mitgliederverwalter, Kassier, Aktuar..." list="vorstandsfunktionen-list">
        <datalist id="vorstandsfunktionen-list">
          <option value="Präsident">
          <option value="Vizepräsident">
          <option value="Kassier">
          <option value="Aktuar">
          <option value="Aktuarin">
          <option value="Mitgliederverwalter">
          <option value="Schützenmeister 10m">
          <option value="Schützenmeister 50m">
          <option value="Vermieter">
          <option value="Materialwart">
          <option value="Beisitzer">
        </datalist>
        <div class="form-text">Wird in der Übersicht als Vorstandsfunktion ausgewiesen.</div>
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
