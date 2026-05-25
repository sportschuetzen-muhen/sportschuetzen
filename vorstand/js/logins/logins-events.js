// =========================================================
//  LOGINS - Events & Navigation
// =========================================================

async function loadLoginsData(force = false) {
  if (!force && LoginsState.loaded && document.getElementById('tab-btn-login_daten')) {
    console.log("⚡ loadLoginsData: Lade aus lokalem Cache...");
    return;
  }
  renderLoginsShell();
  await fetchLoginsData();
}

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
