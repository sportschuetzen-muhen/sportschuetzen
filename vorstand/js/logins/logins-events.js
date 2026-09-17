// =========================================================
//  LOGINS - Events & Navigation
// =========================================================

async function loadLoginsData(force = false) {
  if (typeof loadMitgliederData === 'function' && (!window._mglData || window._mglData.length === 0)) {
    loadMitgliederData(false).catch(() => {});
  }
  if (!force && LoginsState.loaded && document.getElementById('tab-btn-login_daten')) {
    console.log("⚡ loadLoginsData: Lade aus lokalem Cache...");
    return;
  }
  renderLoginsShell();
  await fetchLoginsData();
}

function refreshMemberSelectIfEmpty(currentPN) {
  const sel = document.getElementById('lf-member-select');
  if (!sel) return;
  if (!window._mglData || window._mglData.length === 0) {
    if (typeof loadMitgliederData === 'function') {
      loadMitgliederData(false).then(() => {
        const selNow = document.getElementById('lf-member-select');
        const cur = String(currentPN || document.getElementById('lf-personnumber')?.value || '').trim();
        const members = [...(window._mglData || [])]
          .filter(m => {
            const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1' || String(m.Deceased).toLowerCase() === 'true' || Boolean(m.Todesdatum) || String(m.Status || '').toLowerCase().includes('verstorben');
            const isExited = Boolean(m.Vereinsaustritt) || Boolean(m.ExitDate) || String(m.Status || '').toLowerCase().includes('ausgetreten') || String(m.Status || '').toLowerCase().includes('ehemalig');
            if (cur && cur === String(m.PersonNumber || '').trim()) return true;
            return !isDeceased && !isExited;
          })
          .sort((a, b) => {
            const na = `${a.LastName || ''} ${a.FirstName || ''}`.trim().toLowerCase();
            const nb = `${b.LastName || ''} ${b.FirstName || ''}`.trim().toLowerCase();
            return na.localeCompare(nb, 'de');
          });
        let opts = '<option value="">-- Mitglied auswählen (übernimmt Name, Vorname, Mail) --</option>';
        opts += members.map(m => {
          const pn = String(m.PersonNumber || '').trim();
          const isSel = cur && cur === pn;
          return `<option value="${escapeHtml(pn)}" ${isSel ? 'selected' : ''}>${escapeHtml(m.LastName || '')} ${escapeHtml(m.FirstName || '')} (${escapeHtml(pn)})</option>`;
        }).join('');
        selNow.innerHTML = opts;
      }).catch(e => console.warn("Mitglieder-Ladefehler für Login-Modal:", e));
    }
  }
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

  if (tab === 'login_daten') {
    refreshMemberSelectIfEmpty(null);
  }

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

  if (tab === 'login_daten') {
    refreshMemberSelectIfEmpty(record.personnumber || record.PersonNumber);
  }

  window._loginsEditMode = 'edit';
  window._loginsEditRow  = record;

  const modal = new bootstrap.Modal(document.getElementById('logins-modal'));
  modal.show();
}
