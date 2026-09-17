// =========================================================
//  LOGINS - Actions / Server Requests
// =========================================================

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
    LoginsState.login_sessions = data.login_sessions || [];
    LoginsState.loaded      = true;

    loginsUpdateBadges();
    loginsRenderTable();
  } catch (e) {
    if (wrapper) {
      wrapper.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>${escapeHtml(e.message)}</div>`;
    }
  }
}

function loginsTogglePw(inputId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function loginsSave() {
  const tab    = LoginsState.activeTab;
  const mode   = window._loginsEditMode;
  const record = window._loginsEditRow;
  const btn    = document.getElementById('logins-btn-save');

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Speichern...';

    let params = {};

    if (tab === 'login_daten') {
      const rolle = (document.getElementById('lf-rolle-custom')?.value?.trim() ||
                     document.getElementById('lf-rolle')?.value || '');
      params = {
        action:       mode === 'add' ? 'addLoginDaten' : 'saveLoginDaten',
        username:     document.getElementById('lf-username')?.value?.trim()    || '',
        personnumber: document.getElementById('lf-personnumber')?.value?.trim()|| '',
        anzeigename:  document.getElementById('lf-anzeigename')?.value?.trim() || '',
        rolle:        rolle,
        passwort:     document.getElementById('lf-passwort')?.value            || '',
        mailadresse:  document.getElementById('lf-mailadresse')?.value?.trim() || '',
        mailanzeige:  document.getElementById('lf-mailadresse')?.value?.trim() || '', // Rückwärtskompatibilität
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

// =========================================================
//  Event-Handler für Mitglieder-Zuordnung aus Members100
// =========================================================

window.loginsOnMemberSelect = function(personNumber) {
  const pn = String(personNumber || '').trim();
  const pnInput = document.getElementById('lf-personnumber');
  const anzeigeInput = document.getElementById('lf-anzeigename');
  const mailInput = document.getElementById('lf-mailadresse');
  const userInput = document.getElementById('lf-username');
  const rolleExtInput = document.getElementById('lf-rolle-extern');

  if (!pn) {
    if (pnInput) pnInput.value = '';
    return;
  }

  if (pnInput) pnInput.value = pn;

  const m = (window._mglData || []).find(x => String(x.PersonNumber || '').trim() === pn);
  if (!m) return;

  const fn = String(m.FirstName || '').trim();
  const ln = String(m.LastName || '').trim();
  const fullName = [fn, ln].filter(Boolean).join(' ');
  if (anzeigeInput) anzeigeInput.value = fullName;

  const email = String(m.PrimaryEmail || m.Email || '').trim();
  if (mailInput) mailInput.value = email;

  // Falls Benutzername noch leer ist: Vorschlag generieren
  if (userInput && !userInput.value.trim()) {
    const cleanFn = fn.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanLn = ln.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanFn && cleanLn) {
      userInput.value = `${cleanFn[0]}.${cleanLn}`;
    } else if (cleanLn) {
      userInput.value = cleanLn;
    }
  }

  // Falls Funktion vorhanden und Rolle extern noch leer
  if (rolleExtInput && !rolleExtInput.value.trim() && m.Funktion) {
    rolleExtInput.value = m.Funktion;
  }
};

window.loginsOnPersonNumberInput = function(val) {
  const pn = String(val || '').trim();
  const sel = document.getElementById('lf-member-select');
  if (sel) {
    sel.value = pn;
  }
};
