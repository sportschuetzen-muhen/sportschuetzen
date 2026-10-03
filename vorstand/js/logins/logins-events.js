// =========================================================
//  LOGINS - Events & Navigation (Globaler Standard)
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
        if (!selNow) return;
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
        let opts = '<option value="">-- Vereinsmitglied auswählen (übernimmt PersonNr, Name, Mail, Funktion) --</option>';
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

function refreshAppMemberSelectIfEmpty() {
  const sel = document.getElementById('af-member-select');
  if (!sel) return;
  if (!window._mglData || window._mglData.length === 0) {
    if (typeof loadMitgliederData === 'function') {
      loadMitgliederData(false).then(() => {
        const selNow = document.getElementById('af-member-select');
        if (!selNow) return;
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
        let opts = '<option value="">-- Mitglied auswählen --</option>';
        opts += members.map(m => {
          const pn = String(m.PersonNumber || '').trim();
          const hasPin = Boolean(m.AddressNumber);
          return `<option value="${escapeHtml(pn)}">${escapeHtml(m.LastName || '')} ${escapeHtml(m.FirstName || '')} (${escapeHtml(pn)})${hasPin ? ' [PIN vorhanden]' : ' [Kein PIN]'}</option>`;
        }).join('');
        selNow.innerHTML = opts;
      }).catch(e => console.warn("Mitglieder-Ladefehler für App-Login-Modal:", e));
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
  const modalTitle = document.getElementById('logins-modal-title');
  if (modalTitle) {
    modalTitle.innerHTML = tab === 'login_daten'
      ? '<i class="fas fa-user-plus me-2"></i>Neuer Admin-Zugang' 
      : '<i class="fas fa-mobile-screen-button me-2"></i>Neues App-Mitglied (PIN)';
  }
  
  const delBtn = document.getElementById('logins-btn-delete');
  if (delBtn) delBtn.classList.add('d-none');
  
  const modalBody = document.getElementById('logins-modal-body');
  if (modalBody) {
    modalBody.innerHTML = tab === 'login_daten' ? loginDatenForm(null) : appLoginForm(null);
  }

  if (tab === 'login_daten') {
    refreshMemberSelectIfEmpty(null);
  } else {
    refreshAppMemberSelectIfEmpty();
  }

  window._loginsEditMode = 'add';
  window._loginsEditRow  = null;

  const modalEl = document.getElementById('logins-modal');
  if (modalEl) {
    if (window.UIModalKit?.makeMovableAndResizable) {
      window.UIModalKit.makeMovableAndResizable(modalEl);
    }
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

function loginsOpenEdit(record) {
  const tab = LoginsState.activeTab;
  const modalTitle = document.getElementById('logins-modal-title');
  if (modalTitle) {
    modalTitle.innerHTML = tab === 'login_daten'
      ? `<i class="fas fa-user-pen me-2"></i>Admin bearbeiten: <span class="fw-normal text-white-50">${escapeHtml(record.username || '')}</span>` 
      : `<i class="fas fa-key me-2"></i>App-PIN bearbeiten: <span class="fw-normal text-white-50">${escapeHtml(record.firstname || '')} ${escapeHtml(record.lastname || '')}</span>`;
  }

  const delBtn = document.getElementById('logins-btn-delete');
  if (delBtn) delBtn.classList.remove('d-none');

  const modalBody = document.getElementById('logins-modal-body');
  if (modalBody) {
    modalBody.innerHTML = tab === 'login_daten' ? loginDatenForm(record) : appLoginForm(record);
  }

  if (tab === 'login_daten') {
    refreshMemberSelectIfEmpty(record.personnumber || record.PersonNumber);
    const pwInput = document.getElementById('lf-passwort');
    if (pwInput) pwInput.value = '';
  }

  window._loginsEditMode = 'edit';
  window._loginsEditRow  = record;

  const modalEl = document.getElementById('logins-modal');
  if (modalEl) {
    if (window.UIModalKit?.makeMovableAndResizable) {
      window.UIModalKit.makeMovableAndResizable(modalEl);
    }
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

// =========================================================
//  Modal Interaktions-Handler (Globaler Standard)
// =========================================================

window.loginsToggleExternalAdmin = function(isExternal) {
  const memberSec = document.getElementById('lf-member-section');
  const extHint = document.getElementById('lf-external-hint');
  const pnWrap = document.getElementById('lf-pn-display-wrap');
  const pnInput = document.getElementById('lf-personnumber');
  const memberSel = document.getElementById('lf-member-select');

  if (isExternal) {
    if (memberSec) memberSec.classList.add('d-none');
    if (extHint) extHint.classList.remove('d-none');
    if (pnWrap) pnWrap.classList.add('d-none');
    if (pnInput) pnInput.value = '';
    if (memberSel) memberSel.value = '';
  } else {
    if (memberSec) memberSec.classList.remove('d-none');
    if (extHint) extHint.classList.add('d-none');
  }
};

window.loginsToggleRoleChip = function(roleKey) {
  const input = document.getElementById('lf-rolle-val');
  if (!input) return;

  let roles = (input.value || '').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
  const idx = roles.indexOf(roleKey.toLowerCase());

  if (idx !== -1) {
    // Mindestens eine Rolle muss gewählt bleiben
    if (roles.length > 1) {
      roles.splice(idx, 1);
    } else {
      if (typeof showError === 'function') showError("Mindestens eine Rolle muss zugewiesen sein.");
      return;
    }
  } else {
    roles.push(roleKey.toLowerCase());
  }

  input.value = roles.join(',');
  const container = document.getElementById('lf-roles-container');
  if (container) {
    container.innerHTML = renderRoleChips(input.value);
  }
};

window.loginsGeneratePin = function() {
  const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
  const pinInput = document.getElementById('af-pin');
  if (pinInput) {
    pinInput.value = randomPin;
    pinInput.focus();
    pinInput.select();
  }
  if (typeof showSuccess === 'function') {
    showSuccess(`Neuer 6-stelliger PIN generiert: ${randomPin}`);
  }
};

window.loginsOnAppMemberSelect = function(personNumber) {
  const pn = String(personNumber || '').trim();
  const m = (window._mglData || []).find(x => String(x.PersonNumber || '').trim() === pn);
  
  const pnInput = document.getElementById('af-personnumber');
  const fnInput = document.getElementById('af-firstname');
  const lnInput = document.getElementById('af-lastname');
  const mailInput = document.getElementById('af-email');
  const pinInput = document.getElementById('af-pin');

  if (!m) {
    if (pnInput) pnInput.value = '';
    if (fnInput) fnInput.value = '';
    if (lnInput) lnInput.value = '';
    if (mailInput) mailInput.value = '';
    return;
  }

  if (pnInput) pnInput.value = pn;
  if (fnInput) fnInput.value = m.FirstName || '';
  if (lnInput) lnInput.value = m.LastName || '';
  if (mailInput) mailInput.value = m.PrimaryEmail || m.Email || '';

  if (pinInput && !pinInput.value) {
    if (m.AddressNumber) {
      pinInput.value = String(m.AddressNumber).padStart(6, '0');
    } else {
      pinInput.value = Math.floor(100000 + Math.random() * 900000).toString();
    }
  }
};
