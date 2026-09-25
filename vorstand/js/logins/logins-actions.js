// =========================================================
//  LOGINS - Actions / Server Requests (Supabase Migration)
// =========================================================

async function fetchLoginsData() {
  const wrapper = document.getElementById('logins-table-wrapper');
  if (wrapper) {
    wrapper.innerHTML = `<div class="text-center text-muted py-5">
      <div class="spinner-border spinner-border-sm me-2"></div> Lade Daten aus Supabase...
    </div>`;
  }
  try {
    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!supa) throw new Error("Supabase Client ist nicht initialisiert.");

    // 1. Admins aus public.admin_profiles
    const { data: admins, error: aErr } = await supa
      .from('admin_profiles')
      .select('*, user_roles:auth_user_id(role)')
      .order('username');
    if (aErr) throw aErr;

    LoginsState.login_daten = (admins || []).map(a => {
      let rStr = 'vorstand';
      if (a.user_roles && Array.isArray(a.user_roles) && a.user_roles.length > 0) {
        rStr = a.user_roles.map(x => x.role).join(',');
      }
      return {
        id: a.id,
        auth_user_id: a.auth_user_id,
        username: a.username,
        anzeigename: a.display_name,
        mailadresse: a.email,
        mailanzeige: a.email,
        personnumber: a.person_number,
        rolle: rStr,
        rolle_extern: a.role_external || '',
        passwort_hash: Boolean(a.auth_user_id)
      };
    });

    // 2. App-Mitglieder aus public.members
    const { data: members, error: mErr } = await supa
      .from('members')
      .select('person_number, address_number, first_name, last_name, primary_email, is_active, auth_user_id')
      .eq('is_active', true)
      .order('last_name');
    if (mErr) throw mErr;

    LoginsState.app_login = (members || []).map(m => ({
      personnumber: m.person_number,
      addressnumber_pin: m.address_number ? String(m.address_number).padStart(6, '0') : '',
      firstname: m.first_name,
      lastname: m.last_name,
      email: m.primary_email,
      passwort_hash: Boolean(m.auth_user_id)
    }));

    // 3. Login-Sessions aus public.login_sessions
    const { data: sessions, error: sErr } = await supa
      .from('login_sessions')
      .select('*')
      .order('login_time', { ascending: false })
      .limit(100);
    if (sErr) throw sErr;

    LoginsState.login_sessions = (sessions || []).map(s => {
      const lt = s.login_time ? new Date(s.login_time).toLocaleString('de-CH') : '';
      const ls = s.last_seen ? new Date(s.last_seen).toLocaleString('de-CH') : '';
      return {
        id: s.id,
        username: s.username,
        loginTime: lt,
        lastActive: ls,
        durationSec: s.duration_sec || 0,
        ip: s.ip_address || '—',
        userAgent: s.user_agent || 'Browser',
        isOnline: s.is_online
      };
    });

    LoginsState.loaded = true;
    loginsUpdateBadges();
    loginsRenderTable();
  } catch (e) {
    if (wrapper) {
      wrapper.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Fehler beim Laden der Logins: ${escapeHtml(e.message)}</div>`;
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

    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!supa) throw new Error("Supabase Client nicht verfügbar.");

    if (tab === 'login_daten') {
      const username = document.getElementById('lf-username')?.value?.trim() || '';
      const anzeigename = document.getElementById('lf-anzeigename')?.value?.trim() || '';
      const email = document.getElementById('lf-mailadresse')?.value?.trim() || '';
      const personnumber = parseInt(document.getElementById('lf-personnumber')?.value?.trim()) || null;
      const rolleRaw = document.getElementById('lf-rolle-custom')?.value?.trim() || document.getElementById('lf-rolle')?.value || 'vorstand';
      const rolleExtern = document.getElementById('lf-rolle-extern')?.value?.trim() || '';

      if (!username) throw new Error("Benutzername ist Pflicht.");
      if (!email) throw new Error("E-Mail-Adresse ist Pflicht für das Supabase-Login.");

      const rolesArr = rolleRaw.split(',').map(r => r.trim()).filter(Boolean);

      const { data, error } = await supa.rpc('save_admin_profile', {
        p_username: username,
        p_display_name: anzeigename || username,
        p_email: email,
        p_role_external: rolleExtern,
        p_person_number: personnumber,
        p_roles: rolesArr
      });
      if (error) throw error;

      bootstrap.Modal.getInstance(document.getElementById('logins-modal'))?.hide();
      showSuccess('Admin-Profil erfolgreich in Supabase gespeichert!');
      await fetchLoginsData();

    } else {
      const pn = parseInt(document.getElementById('af-personnumber')?.value?.trim());
      const pin = document.getElementById('af-pin')?.value?.trim() || '';
      const fn = document.getElementById('af-firstname')?.value?.trim() || '';
      const ln = document.getElementById('af-lastname')?.value?.trim() || '';

      if (!pn) throw new Error("PersonNumber ist Pflicht.");
      if (!pin) throw new Error("PIN ist Pflicht.");

      const paddedPin = pin.padStart(6, '0');
      const { error } = await supa.from('members').update({
        address_number: paddedPin,
        first_name: fn,
        last_name: ln,
        updated_at: new Date().toISOString()
      }).eq('person_number', pn);

      if (error) throw error;

      bootstrap.Modal.getInstance(document.getElementById('logins-modal'))?.hide();
      showSuccess('App-Mitglied PIN/Daten in Supabase gespeichert!');
      await fetchLoginsData();
    }
  } catch (e) {
    showError("Fehler beim Speichern: " + e.message);
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
    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!supa) throw new Error("Supabase Client nicht verfügbar.");

    if (tab === 'login_daten') {
      const { error } = await supa.rpc('delete_admin_profile', { p_username: record.username });
      if (error) throw error;
    } else {
      const { error } = await supa.from('members').update({
        address_number: null,
        updated_at: new Date().toISOString()
      }).eq('person_number', record.personnumber);
      if (error) throw error;
    }

    bootstrap.Modal.getInstance(document.getElementById('logins-modal'))?.hide();
    showSuccess('Eintrag gelöscht.');
    await fetchLoginsData();
  } catch (e) {
    showError("Fehler beim Löschen: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function loginsSync() {
  if (!confirm('🔄 Mitglieder-Stammdaten mit Logins synchronisieren?\n\nDies übernimmt fehlende E-Mails aus den Mitgliederdaten für den Vorstand und gleicht alle PINs ab.')) return;

  const btn = document.getElementById('btn-logins-sync');
  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Synchronisiere...';

    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!supa) throw new Error("Supabase Client nicht verfügbar.");

    const { data, error } = await supa.rpc('sync_logins_from_members');
    if (error) throw error;

    showSuccess('✅ ' + (data.message || 'Sync erfolgreich abgeschlossen!'));
    await fetchLoginsData();
  } catch (e) {
    showError('Sync-Fehler: ' + e.message);
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
