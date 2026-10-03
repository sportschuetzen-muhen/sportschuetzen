// =========================================================
//  LOGINS - UI Rendering (Globaler Standard & TableKit)
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
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <button class="btn btn-sm btn-outline-primary shadow-xs rounded-2 d-inline-flex align-items-center" onclick="fetchLoginsData()" id="btn-logins-reload" title="Aktuelle Daten aus Supabase neu laden">
          <i class="fas fa-sync-alt me-1.5"></i> Aktualisieren
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-0 border-bottom-0" id="logins-tabs-nav">
      <li class="nav-item">
        <a class="nav-link active fw-medium" id="tab-btn-login_daten" href="#"
           onclick="loginsSetTab('login_daten'); return false;">
          <i class="fas fa-user-shield me-1.5 text-primary"></i>Vorstand & Admins <span class="badge bg-primary ms-1.5 rounded-pill" id="logins-badge-login_daten">0</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link fw-medium" id="tab-btn-app_login" href="#"
           onclick="loginsSetTab('app_login'); return false;">
          <i class="fas fa-users me-1.5 text-info"></i>Vereinsmitglieder (PIN) <span class="badge bg-secondary ms-1.5 rounded-pill" id="logins-badge-app_login">0</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link fw-medium" id="tab-btn-login_sessions" href="#"
           onclick="loginsSetTab('login_sessions'); return false;">
          <i class="fas fa-tower-broadcast me-1.5 text-success"></i>Aktive Sitzungen & Audit <span class="badge bg-secondary ms-1.5 rounded-pill" id="logins-badge-login_sessions">0</span>
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link fw-medium" id="tab-btn-role_permissions" href="#"
           onclick="loginsSetTab('role_permissions'); return false;">
          <i class="fas fa-th me-1.5 text-warning"></i>Rollen & Berechtigungen <span class="badge bg-secondary ms-1.5 rounded-pill" id="logins-badge-role_permissions">0</span>
        </a>
      </li>
    </ul>

    <!-- Toolbar: Search & Actions -->
    <div class="card border p-2 mb-3 shadow-xs rounded-bottom rounded-0" style="border-top: 1px solid #dee2e6 !important;">
      <div class="d-flex gap-2 align-items-center flex-wrap">
        <div class="flex-grow-1 position-relative" style="min-width: 200px;">
          <i class="fas fa-search position-absolute" style="left:12px;top:50%;transform:translateY(-50%);color:#aaa;"></i>
          <input type="text" class="form-control form-control-sm ps-4 rounded-2" id="logins-search"
                 placeholder="Suchen nach Name, Benutzer, E-Mail oder Rolle..." oninput="loginsRenderTable()">
        </div>
        <div id="logins-col-toggle-container"></div>
        <button class="btn btn-sm btn-primary write-protected rounded-2 shadow-xs d-inline-flex align-items-center" id="btn-logins-add" onclick="loginsOpenAdd()">
          <i class="fas fa-plus me-1.5"></i> Neu
        </button>
      </div>
    </div>

    <!-- Table container -->
    <div id="logins-table-wrapper" style="overflow-x:auto;">
      <div class="text-center text-muted py-5">
        <div class="spinner-border spinner-border-sm me-2 text-primary"></div> Lade Daten aus Supabase...
      </div>
    </div>

    <!-- Modal (Globaler Standard UIModalKit) -->
    <div class="modal fade" id="logins-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content shadow-lg border-0 rounded-3 overflow-hidden">
          <div class="modal-header bg-primary text-white py-2.5 px-3">
            <h5 class="modal-title fw-bold" id="logins-modal-title">Eintrag</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
          </div>
          <div class="modal-body p-3 p-md-4" id="logins-modal-body" style="background-color: #f8fafc;"></div>
          <div class="modal-footer bg-white py-2 px-3 border-top d-flex justify-content-between align-items-center">
            <div>
              <button type="button" class="btn btn-sm btn-outline-danger d-none rounded-2" id="logins-btn-delete" onclick="loginsConfirmDelete()">
                <i class="fas fa-trash me-1"></i> Löschen
              </button>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-sm btn-secondary px-3 rounded-2" data-bs-dismiss="modal">Abbrechen</button>
              <button type="button" class="btn btn-sm btn-primary px-3 rounded-2 fw-semibold" id="logins-btn-save" onclick="loginsSave()">
                <i class="fas fa-save me-1.5"></i> Speichern
              </button>
            </div>
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
    const toggleContainer = document.getElementById('logins-col-toggle-container');
    if (toggleContainer) toggleContainer.innerHTML = '';
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
    wrapper.innerHTML = `
      <div class="card p-4 text-center text-muted shadow-xs border rounded-3 bg-white">
        <i class="fas fa-search fa-2x mb-2 text-secondary opacity-50"></i>
        <h6>Keine Einträge gefunden</h6>
        <small>Passe die Suchkriterien an oder erfasse einen neuen Eintrag.</small>
      </div>`;
    return;
  }

  if (tab === 'login_daten') {
    wrapper.innerHTML = renderLoginDatenTable(rows, canWrite);
  } else if (tab === 'app_login') {
    wrapper.innerHTML = renderAppLoginTable(rows, canWrite);
  } else {
    wrapper.innerHTML = renderLoginSessionsTable(rows);
  }

  // TableKit initialisieren
  initTableKitForLogins(tab);
}

function initTableKitForLogins(tab) {
  if (typeof window.TableKit === 'undefined') return;

  const tableSelector = tab === 'login_daten' ? '#logins-table-admin'
    : tab === 'app_login' ? '#logins-table-members'
    : tab === 'login_sessions' ? '#logins-table-sessions' : null;

  if (!tableSelector) return;
  const tableEl = document.querySelector(tableSelector);
  if (!tableEl) return;

  // 1. Spalten-Sichtbarkeit per Dropdown
  if (typeof window.TableKit.setupColumnToggle === 'function') {
    window.TableKit.setupColumnToggle(tableSelector, {
      container: '#logins-col-toggle-container',
      storageKey: `tk_cols_${tab}`
    });
  }

  // 2. Spaltenbreiten verändern
  if (typeof window.TableKit.makeResizable === 'function') {
    window.TableKit.makeResizable(tableSelector, {
      storageKey: `tk_widths_${tab}`
    });
  }

  // 3. Spalten-Sortierung
  if (typeof window.TableKit.makeSortable === 'function') {
    window.TableKit.makeSortable(tableEl, {
      onSort: (colId, dir) => {
        if (LoginsState.sortKey[tab] === colId) {
          LoginsState.sortDir[tab] = dir === 'desc' ? -1 : 1;
        }
      }
    });
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
    return `<div class="alert alert-secondary text-center py-4 rounded-3 shadow-xs">Keine Berechtigungen zu diesem Suchbegriff gefunden.</div>`;
  }

  // Header Spalten für Rollen
  const roleHeadersHtml = RBAC_ROLES.map(r => `
    <th class="text-center" style="width: 105px; font-size: 0.78rem;">
      <span class="badge ${r.badge} py-1 px-2 rounded-pill d-inline-block text-truncate" style="max-width: 95px;" title="${escapeHtml(r.label)}">
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
        <table class="table table-hover align-middle mb-0" id="logins-table-rbac" style="min-width: 1050px;">
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
  const th = (key, label, colId) =>
    `<th data-col-id="${colId || key}" style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  const editBtn = canWrite
    ? (r) => `<button class="btn btn-sm btn-outline-primary py-0 px-2 rounded-2" title="Bearbeiten" onclick='loginsOpenEdit(${JSON.stringify(r)})'>
                <i class="fas fa-pencil-alt"></i>
              </button>`
    : () => '';

  const rows_html = rows.map(r => `
    <tr>
      <td data-col-id="username" class="tk-col-username">
        <div class="d-flex align-items-center gap-2">
          <div class="rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center" style="width:28px;height:28px;font-size:0.75rem;">
            ${escapeHtml((r.username || '?').substring(0, 2).toUpperCase())}
          </div>
          <code class="text-primary fw-bold">${escapeHtml(r.username)}</code>
        </div>
      </td>
      <td data-col-id="personnumber" class="tk-col-personnumber">
        ${r.personnumber ? `<span class="badge bg-light text-dark border font-monospace">${escapeHtml(r.personnumber)}</span>` : '<span class="text-muted">–</span>'}
      </td>
      <td data-col-id="rolle" class="tk-col-rolle">
        ${(String(r.rolle || 'vorstand')).split(',').map(ro => `<span class="badge ${roleBadgeColor(ro.trim())} rounded-pill me-1">${escapeHtml(ro.trim())}</span>`).join('')}
      </td>
      <td data-col-id="anzeigename" class="tk-col-anzeigename fw-medium">${escapeHtml(r.anzeigename)}</td>
      <td data-col-id="mailadresse" class="tk-col-mailadresse text-muted small">${escapeHtml(r.mailadresse || r.mailanzeige || '—')}</td>
      <td data-col-id="rolle_extern" class="tk-col-rolle_extern text-muted small fw-medium">${escapeHtml(r.rolle_extern || '—')}</td>
      <td data-col-id="auth_status" class="tk-col-auth_status text-center">
        ${r.passwort_hash 
          ? '<span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2 rounded-pill"><i class="fas fa-shield-alt me-1"></i>Supabase Auth</span>' 
          : `<div class="d-inline-flex align-items-center gap-1">
               <span class="badge bg-warning-subtle text-warning border border-warning-subtle py-1 px-2 rounded-pill"><i class="fas fa-clock me-1"></i>Ausstehend</span>
               ${canWrite && (r.mailadresse || r.mailanzeige) ? `<button class="btn btn-xs btn-outline-primary py-0 px-2 rounded-pill shadow-xs" style="font-size:0.72rem;" title="Aktivierungs- / Reset-Mail senden" onclick="loginsSendInvite('${escapeHtml(r.mailadresse || r.mailanzeige)}', '${escapeHtml(r.username)}')"><i class="fas fa-paper-plane me-1"></i>Einladen</button>` : ''}
             </div>`}
      </td>
      <td class="text-end" style="white-space: nowrap;">${editBtn(r)}</td>
    </tr>`).join('');

  return `
    <div class="card shadow-xs border rounded-3 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="logins-table-admin" style="min-width:850px">
          <thead class="table-light text-secondary border-bottom" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
            <tr>
              ${th('username','Benutzername','username')}
              ${th('personnumber','PersonNr','personnumber')}
              ${th('rolle','Rollen','rolle')}
              ${th('anzeigename','Anzeigename','anzeigename')}
              ${th('mailadresse','E-Mail (Auth)','mailadresse')}
              ${th('rolle_extern','Vorstandsfunktion','rolle_extern')}
              <th data-col-id="auth_status" class="text-center">Auth-Status</th>
              <th style="width: 50px;"></th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    </div>`;
}

function renderAppLoginTable(rows, canWrite) {
  const th = (key, label, colId) =>
    `<th data-col-id="${colId || key}" style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  const editBtn = canWrite
    ? (r) => `<button class="btn btn-sm btn-outline-primary py-0 px-2 rounded-2" title="PIN bearbeiten" onclick='loginsOpenEdit(${JSON.stringify(r)})'>
                <i class="fas fa-pencil-alt"></i>
              </button>`
    : () => '';

  const rows_html = rows.map(r => `
    <tr>
      <td data-col-id="personnumber" class="tk-col-personnumber"><span class="badge bg-light text-muted border font-monospace">${escapeHtml(r.personnumber)}</span></td>
      <td data-col-id="addressnumber_pin" class="tk-col-addressnumber_pin"><span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace px-2 py-1">${escapeHtml(r.addressnumber_pin || '–')}</span></td>
      <td data-col-id="firstname" class="tk-col-firstname fw-medium">${escapeHtml(r.firstname)}</td>
      <td data-col-id="lastname" class="tk-col-lastname fw-medium">${escapeHtml(r.lastname)}</td>
      <td data-col-id="email" class="tk-col-email text-muted small">${escapeHtml(r.email || '—')}</td>
      <td data-col-id="status" class="tk-col-status text-center">
        ${r.addressnumber_pin 
          ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill py-1 px-2"><i class="fas fa-check-circle me-1"></i>PIN aktiv</span>' 
          : '<span class="badge bg-light text-muted border rounded-pill py-1 px-2"><i class="fas fa-minus me-1"></i>Kein PIN</span>'}
      </td>
      <td class="text-end" style="white-space: nowrap;">${editBtn(r)}</td>
    </tr>`).join('');

  return `
    <div class="card shadow-xs border rounded-3 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="logins-table-members" style="min-width:750px">
          <thead class="table-light text-secondary border-bottom" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
            <tr>
              ${th('personnumber','PersonNr (SSV)','personnumber')}
              ${th('addressnumber_pin','PIN (AddressNr)','addressnumber_pin')}
              ${th('firstname','Vorname','firstname')}
              ${th('lastname','Nachname','lastname')}
              ${th('email','E-Mail','email')}
              <th data-col-id="status" class="text-center">Status</th>
              <th style="width: 50px;"></th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    </div>`;
}

function renderLoginSessionsTable(rows) {
  const th = (key, label, colId) =>
    `<th data-col-id="${colId || key}" style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="loginsSort('${key}')">${label}${loginsSortIcon(key)}</th>`;

  // Statistik-Berechnungen
  const now = Date.now();
  const activeUserSet = new Set();
  let totalDurationSec = 0;
  let durationCount = 0;

  rows.forEach(r => {
    const lat = parseGermanDate(r.lastActive).getTime();
    if (now - lat < 300000 || r.isOnline) {
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
      <td data-col-id="username" class="tk-col-username">
        <div class="d-flex align-items-center gap-2">
          <code class="text-primary fw-bold">${escapeHtml(r.username)}</code>
        </div>
      </td>
      <td data-col-id="status" class="tk-col-status">${statusBadge}</td>
      <td data-col-id="loginTime" class="tk-col-loginTime small text-muted">${escapeHtml(r.loginTime)}</td>
      <td data-col-id="lastActive" class="tk-col-lastActive small text-dark">${escapeHtml(r.lastActive)}</td>
      <td data-col-id="durationSec" class="tk-col-durationSec fw-medium font-monospace small">${escapeHtml(formattedDur)}</td>
      <td data-col-id="ip" class="tk-col-ip small"><span class="badge bg-light text-dark border font-monospace">${escapeHtml(r.ip)}</span></td>
      <td data-col-id="userAgent" class="tk-col-userAgent small text-muted" title="${escapeHtml(r.userAgent)}">
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
        <table class="table table-hover align-middle mb-0" id="logins-table-sessions" style="min-width:800px">
          <thead class="table-light text-secondary border-bottom" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">
            <tr>
              ${th('username','Benutzer','username')}
              <th data-col-id="status" style="width: 100px;">Status</th>
              ${th('loginTime','Login-Zeit','loginTime')}
              ${th('lastActive','Letzte Aktivität','lastActive')}
              ${th('durationSec','Dauer','durationSec')}
              ${th('ip','IP-Adresse','ip')}
              ${th('userAgent','Gerät / Browser','userAgent')}
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    </div>`;
}

// =========================================================
//  MODAL FORMULARE (Globaler Standard)
// =========================================================

function renderRoleChips(currentRolesStr) {
  const activeRoles = String(currentRolesStr || 'vorstand').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
  const ROLES = [
    { key: 'admin', label: 'Admin', color: 'danger' },
    { key: 'vorstand', label: 'Vorstand', color: 'primary' },
    { key: 'kassier', label: 'Kassier', color: 'success' },
    { key: 'aktuar', label: 'Aktuar', color: 'info' },
    { key: 'schuetzenmeister', label: 'Schützenmeister', color: 'warning' },
    { key: 'vermieter', label: 'Vermieter', color: 'secondary' },
    { key: 'materialwart', label: 'Materialwart', color: 'dark' }
  ];

  return ROLES.map(r => {
    const isAct = activeRoles.includes(r.key);
    return `
      <button type="button" class="btn btn-sm rounded-pill px-3 py-1 ${isAct ? `btn-${r.color} text-white` : `btn-outline-${r.color} bg-white`} shadow-xs fw-medium"
              onclick="loginsToggleRoleChip('${r.key}')" id="role-chip-${r.key}">
        <i class="fas ${isAct ? 'fa-check' : 'fa-plus'} me-1" style="font-size: 0.75rem;"></i>${r.label}
      </button>
    `;
  }).join('');
}

function loginDatenForm(r) {
  const v = (field) => escapeHtml(r ? (r[field] || '') : '');
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
    <div class="container-fluid p-0">
      <!-- Sektion 1: Verknüpfung mit Vereinsmitglied -->
      <div class="card mb-3 border shadow-xs rounded-3 overflow-hidden bg-white">
        <div class="card-header bg-light py-2 px-3 border-bottom d-flex justify-content-between align-items-center">
          <span class="fw-bold text-primary small text-uppercase">
            <i class="fas fa-id-badge me-1.5"></i>1. Vereinszugehörigkeit & Stammdaten
          </span>
          <div class="form-check form-switch m-0">
            <input class="form-check-input" type="checkbox" id="lf-is-external" onchange="loginsToggleExternalAdmin(this.checked)" ${!curPN && r ? 'checked' : ''}>
            <label class="form-check-label small fw-semibold text-secondary" for="lf-is-external">Externer Admin (ohne SSV-Mitgliedschaft)</label>
          </div>
        </div>
        <div class="card-body p-3">
          <div id="lf-member-section" class="${!curPN && r ? 'd-none' : ''}">
            <label class="form-label fw-semibold small mb-1 text-dark">
              <i class="fas fa-users me-1 text-primary"></i> Mitglied aus Stammdaten auswählen
            </label>
            <select class="form-select" id="lf-member-select" onchange="loginsOnMemberSelect(this.value)">
              <option value="">-- Vereinsmitglied auswählen (übernimmt PersonNr, Name, Mail, Funktion) --</option>
              ${memberOptions}
            </select>
            <div class="form-text small text-muted mt-1">
              Wähle ein Vereinsmitglied: PersonNumber, Name, Vorname, Mail und Vorstandsfunktion werden automatisch übernommen.
            </div>
          </div>
          
          <div id="lf-external-hint" class="alert alert-light border py-2 px-3 mb-0 small text-muted ${!curPN && r ? '' : 'd-none'}">
            <i class="fas fa-user-tie me-1 text-secondary"></i> <strong>Externes Administrator-Konto:</strong> Dieses Konto ist mit keinem SSV-Vereinsmitglied verknüpft (PersonNumber bleibt <code>null</code>).
          </div>
          
          <input type="hidden" id="lf-personnumber" value="${curPN}">
          <div class="mt-2 ${curPN ? '' : 'd-none'}" id="lf-pn-display-wrap">
            <span class="badge bg-light text-dark border font-monospace px-2 py-1">
              <i class="fas fa-link me-1 text-success"></i> Verknüpfte SSV-PersonNumber: <strong id="lf-pn-display">${curPN}</strong>
            </span>
          </div>
        </div>
      </div>

      <!-- Sektion 2: Benutzerkonto & Profil -->
      <div class="card mb-3 border shadow-xs rounded-3 overflow-hidden bg-white">
        <div class="card-header bg-light py-2 px-3 border-bottom">
          <span class="fw-bold text-primary small text-uppercase">
            <i class="fas fa-user me-1.5"></i>2. Benutzerkonto & Profil
          </span>
        </div>
        <div class="card-body p-3">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-bold small">Benutzername <span class="text-danger">*</span></label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted"><i class="fas fa-at"></i></span>
                <input type="text" class="form-control" id="lf-username" value="${v('username')}" placeholder="z.B. d.muster" required>
              </div>
              <div class="form-text small text-muted">Eindeutiger Benutzername für das Portal-Login.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold small">Anzeigename <span class="text-danger">*</span></label>
              <input type="text" class="form-control" id="lf-anzeigename" value="${v('anzeigename')}" placeholder="z.B. Daniel Muster" required>
              <div class="form-text small text-muted">Vollständiger Name für Begrüssung & Logs.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold small">E-Mail-Adresse (Supabase Auth) <span class="text-danger">*</span></label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted"><i class="fas fa-envelope"></i></span>
                <input type="email" class="form-control" id="lf-mailadresse" value="${escapeHtml(r ? (r.mailadresse || r.mailanzeige || '') : '')}" placeholder="name@email.ch" required>
              </div>
              <div class="form-text small text-muted">Primäre Adresse für Auth-Login & Passwort-Reset.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold small">Vorstandsfunktion</label>
              <input type="text" class="form-control" id="lf-rolle-extern" value="${v('rolle_extern')}" placeholder="z.B. Kassier, Aktuar..." list="vorstandsfunktionen-list">
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
                <option value="Revisor">
                <option value="Webmaster">
              </datalist>
              <div class="form-text small text-muted">Wird in der Übersicht als Funktion ausgewiesen.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sektion 3: Rollen & Berechtigungen -->
      <div class="card mb-3 border shadow-xs rounded-3 overflow-hidden bg-white">
        <div class="card-header bg-light py-2 px-3 border-bottom">
          <span class="fw-bold text-primary small text-uppercase">
            <i class="fas fa-shield-halved me-1.5"></i>3. Rollen & Autorisierung
          </span>
        </div>
        <div class="card-body p-3">
          <label class="form-label fw-bold small mb-2">Zugeordnete Rollen (Mehrfachauswahl möglich):</label>
          <div class="d-flex flex-wrap gap-2" id="lf-roles-container">
            ${renderRoleChips(r ? (r.rolle || 'vorstand') : 'vorstand')}
          </div>
          <input type="hidden" id="lf-rolle-val" value="${escapeHtml(r ? (r.rolle || 'vorstand') : 'vorstand')}">
          <div class="form-text small text-muted mt-2">
            Klicke auf die Rollen, um sie zu aktivieren oder zu deaktivieren. Berechtigungen werden kumulativ vererbt.
          </div>
        </div>
      </div>

      <!-- Sektion 4: Passwort & Sicherheit -->
      <div class="card border shadow-xs rounded-3 overflow-hidden bg-white">
        <div class="card-header bg-light py-2 px-3 border-bottom d-flex justify-content-between align-items-center">
          <span class="fw-bold text-primary small text-uppercase">
            <i class="fas fa-key me-1.5"></i>4. Passwort & Sicherheit
          </span>
          ${r && r.passwort_hash 
            ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-0.5"><i class="fas fa-shield-check me-1"></i>Supabase Auth aktiv</span>' 
            : '<span class="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill px-2 py-0.5"><i class="fas fa-clock me-1"></i>Passwort ausstehend</span>'}
        </div>
        <div class="card-body p-3">
          <div class="row g-2 align-items-center">
            <div class="col-md-7">
              <div class="input-group">
                <span class="input-group-text bg-light text-muted"><i class="fas fa-lock"></i></span>
                <input type="password" class="form-control" id="lf-passwort" placeholder="${r ? 'Leer lassen = unverändert' : 'Mindestens 6 Zeichen eingeben'}">
                <button class="btn btn-outline-secondary" type="button" onclick="loginsTogglePw('lf-passwort')">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
            </div>
            <div class="col-md-5 small text-muted">
              ${r ? 'Nur ausfüllen, wenn ein neues Passwort gesetzt werden soll (min. 6 Zeichen).' : 'Initiales Passwort für diesen Zugang (mindestens 6 Zeichen).'}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function appLoginForm(r) {
  const v = (field) => escapeHtml(r ? (r[field] || '') : '');
  const curPN = r ? String(r.personnumber || '').trim() : '';

  const members = [...(window._mglData || [])]
    .filter(m => {
      const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1' || String(m.Deceased).toLowerCase() === 'true' || Boolean(m.Todesdatum) || String(m.Status || '').toLowerCase().includes('verstorben');
      const isExited = Boolean(m.Vereinsaustritt) || Boolean(m.ExitDate) || String(m.Status || '').toLowerCase().includes('ausgetreten') || String(m.Status || '').toLowerCase().includes('ehemalig');
      return !isDeceased && !isExited;
    })
    .sort((a, b) => {
      const na = `${a.LastName || ''} ${a.FirstName || ''}`.trim().toLowerCase();
      const nb = `${b.LastName || ''} ${b.FirstName || ''}`.trim().toLowerCase();
      return na.localeCompare(nb, 'de');
    });

  const appMemberOptions = members.map(m => {
    const pn = String(m.PersonNumber || '').trim();
    const isSel = curPN && curPN === pn;
    const fn = m.FirstName || '';
    const ln = m.LastName || '';
    const hasPin = Boolean(m.AddressNumber);
    return `<option value="${escapeHtml(pn)}" ${isSel ? 'selected' : ''}>${escapeHtml(ln)} ${escapeHtml(fn)} (${escapeHtml(pn)})${hasPin ? ' [PIN vorhanden]' : ' [Kein PIN]'}</option>`;
  }).join('');

  return `
    <div class="container-fluid p-0">
      <!-- Sektion 1: Mitgliedsauswahl -->
      <div class="card mb-3 border shadow-xs rounded-3 overflow-hidden bg-white">
        <div class="card-header bg-light py-2 px-3 border-bottom">
          <span class="fw-bold text-info small text-uppercase">
            <i class="fas fa-user-check me-1.5"></i>1. Vereinsmitglied (public.members)
          </span>
        </div>
        <div class="card-body p-3">
          ${r ? `
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div>
                <h6 class="mb-0 fw-bold text-dark">${escapeHtml(r.firstname)} ${escapeHtml(r.lastname)}</h6>
                <span class="badge bg-light text-muted border font-monospace mt-1">PersonNr: ${escapeHtml(r.personnumber)}</span>
              </div>
              <input type="hidden" id="af-personnumber" value="${escapeHtml(r.personnumber)}">
              <input type="hidden" id="af-firstname" value="${escapeHtml(r.firstname)}">
              <input type="hidden" id="af-lastname" value="${escapeHtml(r.lastname)}">
            </div>
          ` : `
            <label class="form-label fw-bold small text-dark mb-1">Vereinsmitglied auswählen <span class="text-danger">*</span></label>
            <select class="form-select" id="af-member-select" onchange="loginsOnAppMemberSelect(this.value)">
              <option value="">-- Mitglied auswählen --</option>
              ${appMemberOptions}
            </select>
            <input type="hidden" id="af-personnumber" value="">
            <input type="hidden" id="af-firstname" value="">
            <input type="hidden" id="af-lastname" value="">
            <div class="form-text small text-muted mt-1">
              Wähle das Vereinsmitglied aus den Stammdaten, für das ein PIN vergeben oder angepasst werden soll.
            </div>
          `}
        </div>
      </div>

      <!-- Sektion 2: PIN & Zugang -->
      <div class="card border shadow-xs rounded-3 overflow-hidden bg-white">
        <div class="card-header bg-light py-2 px-3 border-bottom d-flex justify-content-between align-items-center">
          <span class="fw-bold text-info small text-uppercase">
            <i class="fas fa-key me-1.5"></i>2. 6-Stelliger App-PIN (AddressNumber)
          </span>
          <button type="button" class="btn btn-xs btn-outline-info rounded-pill py-0.5 px-2.5 shadow-xs" onclick="loginsGeneratePin()">
            <i class="fas fa-dice me-1"></i> 🎲 PIN generieren
          </button>
        </div>
        <div class="card-body p-3">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-bold small">PIN-Code <span class="text-danger">*</span></label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted"><i class="fas fa-hashtag"></i></span>
                <input type="text" class="form-control font-monospace fw-bold" id="af-pin" value="${v('addressnumber_pin')}" placeholder="z.B. 012345" maxlength="6">
              </div>
              <div class="form-text small text-muted">Wird beim Speichern automatisch 6-stellig formatiert.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold small">E-Mail (Stammdaten)</label>
              <input type="text" class="form-control bg-light" id="af-email" value="${escapeHtml(r ? (r.email || '') : '')}" readonly>
              <div class="form-text small text-muted">Aus den Mitglieds-Stammdaten (für Benachrichtigungen).</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}
