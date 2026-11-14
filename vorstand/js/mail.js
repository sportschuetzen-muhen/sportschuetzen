// ============================================================
// mail.js – Mail-Baustein Sportschützen Muhen
// ============================================================

const MAIL_GRUPPEN_CONFIG = [
  {
    key: 'vorstand',
    label: '⭐ Vorstand & Funktionäre',
    haupt: true,
    filter: m => Boolean(m._istVorstand || (Number(m._aktiveFunktionenCount || 0) > 0))
  },
  {
    key: 'alle',
    label: '⭐ Alle Mitglieder',
    haupt: true,
    filter: () => true
  },
  {
    key: 'aktiv',
    label: '🎯 Alle Aktiven Schützen',
    haupt: false,
    filter: m => (m.IsActive == 1 || m.IsActive === true) && !m._istPassiv &&
                 ((Number(m._aktiveLizenzenCount || 0) > 0) || (m._kategorien && m._kategorien.some(k => !['Passiv', 'Ehrenmitglied'].includes(k))))
  },
  {
    key: 'g50m',
    label: 'Gewehr 50m Schützen',
    haupt: false,
    filter: m => (m._kategorien && m._kategorien.some(k => k.toLowerCase().includes('50m'))) ||
                 (m._lizenzen && m._lizenzen.some(l => (l.MembershipCategory || '').toLowerCase().includes('50m') && (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate))
  },
  {
    key: 'g10m',
    label: 'Gewehr 10m Schützen',
    haupt: false,
    filter: m => (m._kategorien && m._kategorien.some(k => k.toLowerCase().includes('10m'))) ||
                 (m._lizenzen && m._lizenzen.some(l => (l.MembershipCategory || '').toLowerCase().includes('10m') && (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate))
  },
  {
    key: 'ehren',
    label: 'Ehrenmitglieder',
    haupt: false,
    filter: m => m._istEhren === true || (m._kategorien && m._kategorien.includes('Ehrenmitglied'))
  },
  {
    key: 'passiv',
    label: 'Passivmitglieder',
    haupt: false,
    filter: m => m._istPassiv === true || (m._kategorien && m._kategorien.includes('Passiv'))
  }
];

let _mailAllMembers = [];
let _mailActiveGroups = new Set();
let _mailSelected = new Set();
let _mailLoaded = false;
window._mailTableFilter = 'all'; // 'all', 'with_email', 'no_email'
window._mailSearchTerm = '';
window._mailIncludeAdditional = false;

// ============================================================
// ADRESS-AUFLÖSUNG & HYGIENE
// ============================================================
function _mailCleanEmailStr(raw) {
  return String(raw || '').replace(/^[\s,;]+|[\s,;]+$/g, '').trim();
}

function _mailIsValidEmail(str) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(str);
}

function _mailResolveEmail(m) {
  const pRaw = _mailCleanEmailStr(m.PrimaryEmail || m.primary_email || m.Email || '');
  const aRaw = _mailCleanEmailStr(m.AdditionalEmail || m.additional_email || '');

  const hasPrimary = _mailIsValidEmail(pRaw);
  const hasAdditional = _mailIsValidEmail(aRaw);

  let activeEmail = '';
  let isFallback = false;

  if (hasPrimary) {
    activeEmail = pRaw;
  } else if (hasAdditional) {
    activeEmail = aRaw;
    isFallback = true;
  }

  return {
    primary: pRaw,
    additional: aRaw,
    hasPrimary,
    hasAdditional,
    activeEmail,
    isFallback,
    hasEmail: Boolean(activeEmail)
  };
}

function _getEmail(m) {
  return _mailResolveEmail(m).activeEmail;
}

function _mailGetMemberEmails(m, includeAdditional = Boolean(window._mailIncludeAdditional)) {
  const res = _mailResolveEmail(m);
  if (!res.hasEmail) return [];
  const list = [res.activeEmail];
  if (includeAdditional && res.hasAdditional && res.additional.toLowerCase() !== res.activeEmail.toLowerCase()) {
    list.push(res.additional);
  }
  return list;
}

function _mailHasMembersReadAccess() {
  if (!window.Perms || typeof window.Perms.isLoaded !== 'function' || !window.Perms.isLoaded()) return true;
  return window.Perms.hasAny(['members.view', 'members.manage']);
}

// ============================================================
// LADEN
// ============================================================
async function loadMailData(forceReload = false) {
  const container = document.getElementById('mail-container');

  if (!_mailHasMembersReadAccess()) {
    _mailAllMembers = [];
    _mailLoaded = false;
    if (container) {
      container.innerHTML = `
        <div class="alert alert-warning border-0 shadow-sm rounded-3">
          <i class="fas fa-lock me-2"></i>
          <strong>Fehlende Mitglieder-Einsicht:</strong> Um Empfängerlisten im Mail-Verteiler zusammenzustellen, benötigst du zusätzlich die Berechtigung <code>members.view</code>. Das Versandprotokoll steht dir im zweiten Tab weiterhin zur Verfügung.
        </div>`;
    }
    return;
  }

  if (_mailLoaded && !forceReload) {
    renderMailUI();
    return;
  }

  _mailActiveGroups.clear();
  _mailSelected.clear();

  // Cache-First Integration aus globalem Mitglieder-Store
  if (!forceReload && window._mglData && window._mglData.length > 0) {
    console.log('⚡ loadMailData: Lade Mitglieder aus globalem Cache...');
    _mailProcessMembers(window._mglData);
    _mailLoaded = true;
    renderMailUI();
    return;
  }

  _mailLoaded = false;
  _mailAllMembers = [];

  if (container) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="fas fa-circle-notch fa-spin fa-2x mb-3 text-primary"></i><br>
        Lade Mitgliederdaten für Verteiler...
      </div>`;
  }

  try {
    let list = [];
    if (typeof window.ensureMitgliederLoaded === 'function') {
      list = await window.ensureMitgliederLoaded(forceReload);
    } else {
      const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
      if (!supa) throw new Error('Supabase Client nicht verfügbar.');
      const [
        { data: members, error: mErr },
        { data: lics },
        { data: fns }
      ] = await Promise.all([
        supa.from('members').select('*').order('last_name', { ascending: true }),
        supa.from('member_licenses').select('*'),
        supa.from('member_functions').select('*')
      ]);
      if (mErr) throw mErr;
      const licMap = {};
      (lics || []).forEach(l => {
        const pn = String(l.person_number || '').trim();
        if (!pn) return;
        if (!licMap[pn]) licMap[pn] = [];
        licMap[pn].push({
          PersonNumber: l.person_number,
          MembershipCategory: l.membership_category,
          ExitDate: l.exit_date,
          IsActive: l.is_active ? 1 : 0
        });
      });
      const fnMap = {};
      (fns || []).forEach(f => {
        const pn = String(f.person_number || '').trim();
        if (!pn) return;
        if (!fnMap[pn]) fnMap[pn] = [];
        fnMap[pn].push(f);
      });
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      list = (members || []).map(r => {
        const pn = String(r.person_number || '').trim();
        const mLics = licMap[pn] || [];
        const mFns = fnMap[pn] || [];
        const activeLics = mLics.filter(l => l.IsActive === 1 && (!l.ExitDate || new Date(l.ExitDate).getTime() > todayEnd.getTime()));
        const activeFns = mFns.filter(f => !f.official_function_exit_date || new Date(f.official_function_exit_date).getTime() > todayEnd.getTime());
        const kats = activeLics.map(l => l.MembershipCategory).filter(Boolean);
        if (kats.length === 0) {
          if (r.is_honorary) kats.push('Ehrenmitglied');
          else if (r.is_passive) kats.push('Passiv');
          else if (r.is_active) kats.push('Aktiv');
        }
        return {
          PersonNumber: r.person_number,
          FirstName: r.first_name,
          LastName: r.last_name,
          PrimaryEmail: r.primary_email,
          AdditionalEmail: r.additional_email,
          IsActive: r.is_active ? 1 : 0,
          IsPassive: r.is_passive ? 1 : 0,
          IsHonoraryMember: r.is_honorary ? 1 : 0,
          Deceased: r.deceased ? 1 : 0,
          Vereinsaustritt: r.club_exit_date,
          _istEhren: Boolean(r.is_honorary),
          _istPassiv: Boolean(r.is_passive),
          _lizenzen: mLics,
          _aktiveLizenzen: activeLics,
          _aktiveLizenzenCount: activeLics.length,
          _aktiveFunktionenCount: activeFns.length,
          _istVorstand: activeFns.length > 0,
          _kategorien: kats,
          _kategorie: kats.join(', ')
        };
      });
    }

    _mailProcessMembers(list);
    _mailLoaded = true;
    renderMailUI();
  } catch (e) {
    console.error('❌ Fehler in loadMailData:', e);
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle me-2"></i>
          Verbindungsfehler beim Laden des Mailverteilers: ${escapeHtml(e.message)}
        </div>`;
    }
  }
}

function _mailProcessMembers(list) {
  const seen = new Set();
  _mailAllMembers = (list || []).filter(m => {
    const pn = String(m.PersonNumber || m.person_number || '');
    if (!pn || seen.has(pn)) return false;
    seen.add(pn);

    // Verstorbene + Ausgetretene immer raus
    if (m.Deceased == 1 || m.Deceased === true || String(m.Deceased).toLowerCase() === 'true' || m.deceased) return false;
    if (m.Vereinsaustritt || m.club_exit_date) return false;

    // Aktiv ODER Passiv ODER Ehrenmitglied einschliessen
    const istAktiv = m.IsActive == 1 || m.IsActive === true || String(m.IsActive).toLowerCase() === 'true' || m.is_active;
    const istPassiv = m.IsPassive == 1 || m.IsPassive === true || String(m.IsPassive).toLowerCase() === 'true' || m.is_passive;
    const istEhren = m.IsHonoraryMember == 1 || m.IsHonoraryMember === true || String(m.IsHonoraryMember).toLowerCase() === 'true' || m.is_honorary;
    return istAktiv || istPassiv || istEhren;
  });
}

// ============================================================
// UI AUFBAUEN
// ============================================================
function renderMailUI() {
  const container = document.getElementById('mail-container');
  if (!container) return;

  const counts = {};
  MAIL_GRUPPEN_CONFIG.forEach(g => {
    counts[g.key] = _mailAllMembers.filter(g.filter).length;
  });

  const hauptRows = MAIL_GRUPPEN_CONFIG
    .filter(g => g.haupt)
    .map(g => _gruppenCheckbox(g, counts[g.key]))
    .join('');
  const katRows = MAIL_GRUPPEN_CONFIG
    .filter(g => !g.haupt)
    .map(g => _gruppenCheckbox(g, counts[g.key]))
    .join('');

  container.innerHTML = `
    <div class="row g-4">
      <!-- LINKE SPALTE: VERTEILERGRUPPEN -->
      <div class="col-md-5 col-lg-4">
        <div class="card border-0 shadow-sm h-100" style="border-radius: 12px; overflow: hidden;">
          <div class="card-body p-0 d-flex flex-column">
            <div class="p-3 bg-light border-bottom d-flex justify-content-between align-items-center">
              <h6 class="mb-0 fw-bold text-uppercase text-secondary" style="letter-spacing: 0.5px; font-size: 0.8rem;">
                <i class="fas fa-layer-group me-1.5 text-primary"></i> Hauptverteiler
              </h6>
              <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill font-monospace" style="font-size:0.75rem;">
                ${_mailAllMembers.length} Mitglieder
              </span>
            </div>
            <div class="list-group list-group-flush mb-2">
              ${hauptRows}
            </div>
            <div class="p-3 bg-light border-top border-bottom">
              <h6 class="mb-0 fw-bold text-uppercase text-secondary" style="letter-spacing: 0.5px; font-size: 0.8rem;">
                <i class="fas fa-tags me-1.5 text-info"></i> Nach Kategorie &amp; Status
              </h6>
            </div>
            <div class="list-group list-group-flush">
              ${katRows}
            </div>

            <!-- OPTIONEN -->
            <div class="p-3 border-top bg-light-subtle mt-auto">
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" role="switch" id="mail-include-additional"
                       ${window._mailIncludeAdditional ? 'checked' : ''}
                       onchange="mailToggleIncludeAdditional(this.checked)">
                <label class="form-check-label small fw-medium text-dark" for="mail-include-additional">
                  Zweitadressen zusätzlich mitnehmen
                </label>
                <div class="text-muted" style="font-size: 0.72rem;">
                  Nützlich z. B. für Junioren-Eltern oder geschäftliche + private Adresse.
                </div>
              </div>
              <div class="text-end pt-1">
                <button class="btn btn-sm btn-link text-decoration-none text-muted p-0" onclick="mailResetSelection()" style="font-size: 0.82rem;">
                  <i class="fas fa-undo me-1"></i>Auswahl zurücksetzen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RECHTE SPALTE: GLOBAL MODEL EMPFÄNGERTABELLE -->
      <div class="col-md-7 col-lg-8">
        <div class="card border-0 shadow-sm h-100" style="border-radius: 12px;">
          <div class="card-body d-flex flex-column p-3 p-md-4">

            <!-- HEADER TOOLBAR -->
            <div class="d-flex flex-wrap align-items-center justify-content-between mb-3 pb-3 border-bottom gap-2">
              <div>
                <div id="mail-summary" class="fw-semibold text-dark fs-6">
                  👈 Wähle links mindestens eine Verteilergruppe aus.
                </div>
                <div id="mail-sub-summary" class="text-muted small"></div>
              </div>
              <div class="d-flex gap-2 align-items-center">
                <button class="btn btn-primary shadow-sm" onclick="mailKopieren()" id="btn-copy" disabled>
                  <i class="fas fa-copy me-1.5"></i> Adressen kopieren <span id="copy-count" class="badge bg-white text-primary ms-1">0</span>
                </button>
                <button id="btn-mailto" class="btn btn-outline-secondary" onclick="mailOpenMailto()" disabled title="Im Standard-Mailprogramm öffnen">
                  <i class="fas fa-envelope"></i>
                </button>
                <div class="dropdown">
                  <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" title="Weitere Aktionen">
                    <i class="fas fa-ellipsis-v"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                    <li><a class="dropdown-item" href="#" onclick="mailCSV(); return false;"><i class="fas fa-file-csv me-2 text-success"></i>Als CSV exportieren</a></li>
                    <li><a class="dropdown-item" href="#" onclick="mailExcel(); return false;"><i class="fas fa-file-excel me-2 text-primary"></i>Als Excel exportieren</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" onclick="loadMailData(true); return false;"><i class="fas fa-sync me-2 text-primary"></i>Mitglieder neu laden</a></li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- ALERT BOXEN -->
            <div id="mail-missing-warning" class="alert alert-warning py-2 px-3 small d-none d-flex align-items-center mb-3 rounded-3 border-0 shadow-sm">
              <i class="fas fa-exclamation-triangle fs-5 me-2 text-warning"></i>
              <div>
                <strong>Achtung:</strong> Für <span id="mail-missing-count" class="fw-bold"></span> ausgewählte Person(en) ist <strong>keine gültige E-Mail-Adresse</strong> hinterlegt. Diese werden beim Kopieren automatisch übersprungen.
              </div>
            </div>

            <div id="mail-bcc-hint" class="alert alert-info py-2 px-3 small d-none d-flex align-items-center mb-3 rounded-3 border-0 shadow-sm" style="background-color: rgba(15, 58, 93, 0.08); color: #0f3a5d;">
              <i class="fas fa-shield-halved fs-5 me-2 text-primary"></i>
              <div>
                <strong>Datenschutz-Hinweis:</strong> Füge die kopierten Adressen im Mailprogramm bitte immer ins <strong>BCC-Feld</strong> (Blindkopie) ein, um die Privatsphäre aller Mitglieder zu schützen.
              </div>
            </div>

            <div id="mail-copy-success" class="alert alert-success py-2 px-3 small d-none d-flex align-items-center mb-3 rounded-3 border-0 shadow-sm">
              <i class="fas fa-check-circle fs-5 me-2"></i> Adressen erfolgreich in die Zwischenablage kopiert!
            </div>

            <div id="mail-mailto-hint" class="alert alert-danger py-2 px-3 small d-none d-flex align-items-center mb-3 rounded-3 border-0 shadow-sm">
              <i class="fas fa-ban fs-5 me-2"></i>
              <div>
                <strong>Zu viele Empfänger (&gt; 30).</strong> Die «Mail öffnen»-Funktion ist gesperrt, um Mailprogramm-Abbrüche und Spamfilter zu verhindern. Bitte nutze «Adressen kopieren».
              </div>
            </div>

            <!-- LIVE-FILTER & SEARCH TOOLBAR (GLOBALES MODELL) -->
            <div id="mail-table-controls" class="d-none mb-3">
              <div class="row g-2 align-items-center">
                <div class="col-sm-5 col-md-4">
                  <div class="input-group input-group-sm">
                    <span class="input-group-text bg-white border-end-0 text-muted"><i class="fas fa-search"></i></span>
                    <input type="text" class="form-control border-start-0" id="mail-table-search"
                           placeholder="Filtere Name, E-Mail, Kategorie..."
                           value="${escapeHtml(window._mailSearchTerm || '')}"
                           oninput="mailOnSearch(this.value)">
                    <button class="btn btn-outline-secondary border-start-0 bg-white ${window._mailSearchTerm ? '' : 'd-none'}"
                            id="mail-search-clear-btn" onclick="mailClearSearch()" type="button" title="Suche leeren">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                </div>
                <div class="col-sm-7 col-md-8 d-flex flex-wrap gap-2 justify-content-sm-end align-items-center">
                  <div class="btn-group btn-group-sm" role="group" id="mail-filter-pills">
                    <button type="button" data-filter="all" class="btn btn-outline-secondary ${window._mailTableFilter === 'all' ? 'active' : ''}" onclick="mailSetTableFilter('all')">
                      Alle (<span id="pill-count-all">0</span>)
                    </button>
                    <button type="button" data-filter="with_email" class="btn btn-outline-secondary ${window._mailTableFilter === 'with_email' ? 'active' : ''}" onclick="mailSetTableFilter('with_email')">
                      <i class="fas fa-check text-success me-1"></i>Mit Mail (<span id="pill-count-with">0</span>)
                    </button>
                    <button type="button" data-filter="no_email" class="btn btn-outline-secondary ${window._mailTableFilter === 'no_email' ? 'active' : ''}" onclick="mailSetTableFilter('no_email')">
                      <i class="fas fa-times text-danger me-1"></i>Ohne Mail (<span id="pill-count-without">0</span>)
                    </button>
                  </div>
                  <div id="mail-col-toggle"></div>
                </div>
              </div>
            </div>

            <!-- TABLE CONTAINER (GLOBALES TABLEKIT-MODELL) -->
            <div id="mail-preview-container" class="flex-grow-1 overflow-hidden d-flex flex-column">
              <div id="mail-preview" class="h-100">
                <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted py-5" style="opacity: 0.6;">
                  <i class="fas fa-users-rectangle fa-3x mb-3 text-secondary"></i>
                  <p class="mb-0 fw-medium">Wähle mindestens eine Gruppe links aus, um Empfänger zu laden.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>`;
}

function _gruppenCheckbox(g, count) {
  const isChecked = _mailActiveGroups.has(g.key);
  return `
    <label class="list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 px-3 py-2.5 ${isChecked ? 'bg-light fw-semibold text-primary' : ''}" style="cursor: pointer;" id="label-${g.key}">
      <div class="d-flex align-items-center">
        <input class="form-check-input me-3 mt-0" type="checkbox" id="mg-${g.key}" onchange="mailGruppeToggle('${g.key}')" ${isChecked ? 'checked' : ''}>
        <span>${g.label}</span>
      </div>
      <span class="badge ${count > 0 ? (isChecked ? 'bg-primary' : 'bg-secondary') : 'bg-light text-muted border'} rounded-pill font-monospace">${count}</span>
    </label>`;
}

// ============================================================
// GRUPPENAUSWAHL & OPTIONEN
// ============================================================
function mailToggleIncludeAdditional(checked) {
  window._mailIncludeAdditional = Boolean(checked);
  _mailRenderSummary();
}

function mailGruppeToggle(key) {
  const cb = document.getElementById(`mg-${key}`);
  const isChecked = cb ? cb.checked : false;

  if (key === 'alle') {
    if (isChecked) {
      _mailActiveGroups.clear();
      _mailActiveGroups.add('alle');
      MAIL_GRUPPEN_CONFIG.forEach(g => {
        if (g.key !== 'alle') {
          const el = document.getElementById(`mg-${g.key}`);
          if (el) { el.checked = false; el.disabled = true; }
          const lbl = document.getElementById(`label-${g.key}`);
          if (lbl) { lbl.classList.add('text-muted', 'opacity-50'); lbl.classList.remove('bg-light', 'fw-semibold', 'text-primary'); }
        }
      });
    } else {
      _mailActiveGroups.delete('alle');
      MAIL_GRUPPEN_CONFIG.forEach(g => {
        const el = document.getElementById(`mg-${g.key}`);
        if (el) el.disabled = false;
        const lbl = document.getElementById(`label-${g.key}`);
        if (lbl) lbl.classList.remove('text-muted', 'opacity-50');
      });
    }
  } else {
    if (isChecked) {
      _mailActiveGroups.add(key);
    } else {
      _mailActiveGroups.delete(key);
    }
  }

  // Optisches Highlight aktualisieren
  MAIL_GRUPPEN_CONFIG.forEach(g => {
    const el = document.getElementById(`mg-${g.key}`);
    const lbl = document.getElementById(`label-${g.key}`);
    if (el && lbl && !el.disabled) {
      if (el.checked) {
        lbl.classList.add('bg-light', 'fw-semibold', 'text-primary');
      } else {
        lbl.classList.remove('bg-light', 'fw-semibold', 'text-primary');
      }
    }
  });

  _mailUpdateCandidatePool();
}

function mailResetSelection() {
  _mailActiveGroups.clear();
  _mailSelected.clear();
  window._mailSearchTerm = '';
  window._mailTableFilter = 'all';
  window._mailIncludeAdditional = false;

  const searchInput = document.getElementById('mail-table-search');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('mail-search-clear-btn');
  if (clearBtn) clearBtn.classList.add('d-none');
  const addSwitch = document.getElementById('mail-include-additional');
  if (addSwitch) addSwitch.checked = false;

  _mailUpdateFilterPillsUI();

  MAIL_GRUPPEN_CONFIG.forEach(g => {
    const el = document.getElementById(`mg-${g.key}`);
    const lbl = document.getElementById(`label-${g.key}`);
    if (el) { el.checked = false; el.disabled = false; }
    if (lbl) lbl.classList.remove('bg-light', 'fw-semibold', 'text-primary', 'text-muted', 'opacity-50');
  });

  _mailUpdateCandidatePool();
}

function _mailGetActiveCandidates() {
  if (_mailActiveGroups.size === 0) return [];
  if (_mailActiveGroups.has('alle')) return [..._mailAllMembers];

  const activeConfigs = MAIL_GRUPPEN_CONFIG.filter(g => _mailActiveGroups.has(g.key));
  const seen = new Set();
  const result = [];

  _mailAllMembers.forEach(m => {
    const pn = String(m.PersonNumber || m.person_number || '');
    if (seen.has(pn)) return;
    const matchesAny = activeConfigs.some(g => g.filter(m));
    if (matchesAny) {
      seen.add(pn);
      result.push(m);
    }
  });

  return result;
}

function _mailUpdateCandidatePool() {
  const candidates = _mailGetActiveCandidates();

  // Neu selektierte Kandidaten mit gültiger E-Mail automatisch anwählen
  _mailSelected.clear();
  candidates.forEach(m => {
    const res = _mailResolveEmail(m);
    if (res.hasEmail) {
      _mailSelected.add(String(m.PersonNumber || m.person_number || ''));
    }
  });

  _mailRenderSummary();
  _mailRenderPreview();
}

// ============================================================
// SUCHE & FILTER-PILLS FÜR DIE TABELLE
// ============================================================
function _mailUpdateFilterPillsUI() {
  const container = document.getElementById('mail-filter-pills');
  if (!container) return;
  container.querySelectorAll('button[data-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === window._mailTableFilter);
  });
}

function mailOnSearch(val) {
  window._mailSearchTerm = (val || '').trim().toLowerCase();
  const clearBtn = document.getElementById('mail-search-clear-btn');
  if (clearBtn) clearBtn.classList.toggle('d-none', !window._mailSearchTerm);
  _mailRenderPreview();
}

function mailClearSearch() {
  window._mailSearchTerm = '';
  const input = document.getElementById('mail-table-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('mail-search-clear-btn');
  if (clearBtn) clearBtn.classList.add('d-none');
  _mailRenderPreview();
}

function mailSetTableFilter(filter) {
  window._mailTableFilter = filter || 'all';
  _mailUpdateFilterPillsUI();
  _mailRenderPreview();
}

// ============================================================
// EINZELSELEKTION & MASTER CHECKBOX
// ============================================================
function mailToggleSingleRecipient(pn, isChecked) {
  pn = String(pn);
  if (isChecked) {
    _mailSelected.add(pn);
  } else {
    _mailSelected.delete(pn);
  }
  _mailRenderSummary();
  _mailUpdateMasterCheckboxState();
}

function mailToggleAllVisible(isChecked) {
  const visible = _mailGetVisibleCandidates();
  visible.forEach(m => {
    const pn = String(m.PersonNumber || m.person_number || '');
    const res = _mailResolveEmail(m);
    if (isChecked) {
      if (res.hasEmail) _mailSelected.add(pn);
    } else {
      _mailSelected.delete(pn);
    }
  });

  _mailRenderSummary();
  _mailRenderPreview();
}

function _mailGetVisibleCandidates() {
  const candidates = _mailGetActiveCandidates();
  const search = window._mailSearchTerm;
  const filter = window._mailTableFilter;

  return candidates.filter(m => {
    const res = _mailResolveEmail(m);

    // Status Filter
    if (filter === 'with_email' && !res.hasEmail) return false;
    if (filter === 'no_email' && res.hasEmail) return false;

    // Suchfilter
    if (search) {
      const pn = m.PersonNumber || m.person_number || '';
      const ln = m.LastName || m.last_name || '';
      const fn = m.FirstName || m.first_name || '';
      const boardTag = (m._istVorstand || Number(m._aktiveFunktionenCount || 0) > 0) ? 'vorstand' : '';
      const hay = `${pn} ${ln} ${fn} ${res.primary} ${res.additional} ${_getKatLabel(m)} ${boardTag}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    return true;
  });
}

function _mailUpdateMasterCheckboxState() {
  const master = document.getElementById('mail-master-check');
  if (!master) return;

  const visibleWithMail = _mailGetVisibleCandidates().filter(m => _mailResolveEmail(m).hasEmail);
  if (visibleWithMail.length === 0) {
    master.checked = false;
    master.indeterminate = false;
    return;
  }

  const selectedCount = visibleWithMail.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || ''))).length;
  if (selectedCount === visibleWithMail.length) {
    master.checked = true;
    master.indeterminate = false;
  } else if (selectedCount > 0) {
    master.checked = false;
    master.indeterminate = true;
  } else {
    master.checked = false;
    master.indeterminate = false;
  }
}

// ============================================================
// SUMMARY & STATUSLEISTE
// ============================================================
function _mailRenderSummary() {
  const candidates = _mailGetActiveCandidates();
  const summaryEl = document.getElementById('mail-summary');
  const subSumEl = document.getElementById('mail-sub-summary');
  const controlsEl = document.getElementById('mail-table-controls');
  const hintEl = document.getElementById('mail-bcc-hint');
  const warnEl = document.getElementById('mail-missing-warning');
  const warnCount = document.getElementById('mail-missing-count');
  const mailtoBtn = document.getElementById('btn-mailto');
  const copyBtn = document.getElementById('btn-copy');
  const copyCount = document.getElementById('copy-count');
  const mailtoHint = document.getElementById('mail-mailto-hint');

  if (candidates.length === 0) {
    if (summaryEl) summaryEl.innerHTML = '👈 Wähle links mindestens eine Verteilergruppe aus.';
    if (subSumEl) subSumEl.textContent = '';
    if (controlsEl) controlsEl.classList.add('d-none');
    if (hintEl) hintEl.classList.add('d-none');
    if (warnEl) warnEl.classList.add('d-none');
    if (mailtoHint) mailtoHint.classList.add('d-none');
    if (mailtoBtn) mailtoBtn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    if (copyCount) copyCount.textContent = '0';
    return;
  }

  if (controlsEl) controlsEl.classList.remove('d-none');

  const withEmail = candidates.filter(m => _mailResolveEmail(m).hasEmail);
  const withoutEmail = candidates.length - withEmail.length;
  const selectedWithEmail = candidates.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || '')) && _mailResolveEmail(m).hasEmail);
  const effectiveEmails = _mailGetEffectiveEmails();

  // Filter-Pill Zähler aktualisieren
  const pillAll = document.getElementById('pill-count-all');
  const pillWith = document.getElementById('pill-count-with');
  const pillWithout = document.getElementById('pill-count-without');
  if (pillAll) pillAll.textContent = candidates.length;
  if (pillWith) pillWith.textContent = withEmail.length;
  if (pillWithout) pillWithout.textContent = withoutEmail;

  if (summaryEl) {
    const addrInfo = window._mailIncludeAdditional && effectiveEmails.length !== selectedWithEmail.length
      ? ` · ${effectiveEmails.length} Adressen inkl. Zweitadressen`
      : '';
    summaryEl.innerHTML = `
      <span class="text-dark fw-bold">${selectedWithEmail.length} Empfänger ausgewählt</span>
      <span class="text-muted fw-normal">(${withEmail.length} von ${candidates.length} Personen mit E-Mail${escapeHtml(addrInfo)})</span>`;
  }

  if (subSumEl) {
    const grpLabels = MAIL_GRUPPEN_CONFIG
      .filter(g => _mailActiveGroups.has(g.key))
      .map(g => g.label)
      .join(', ');
    subSumEl.innerHTML = `<span class="badge bg-light text-secondary border me-1">Aktive Gruppen:</span> ${escapeHtml(grpLabels)}`;
  }

  if (withoutEmail > 0) {
    if (warnCount) warnCount.textContent = withoutEmail;
    if (warnEl) warnEl.classList.remove('d-none');
  } else {
    if (warnEl) warnEl.classList.add('d-none');
  }

  if (hintEl) hintEl.classList.remove('d-none');

  const zuViele = effectiveEmails.length > 30;
  if (mailtoBtn) mailtoBtn.disabled = zuViele || effectiveEmails.length === 0;
  if (copyBtn) copyBtn.disabled = effectiveEmails.length === 0;
  if (copyCount) copyCount.textContent = effectiveEmails.length;
  if (mailtoHint) mailtoHint.classList.toggle('d-none', !zuViele);
}

// ============================================================
// VORSCHAU-TABELLE (GLOBALES TABLEKIT-MODELL)
// ============================================================
function _mailBuildRowHtml(m) {
  const pn = String(m.PersonNumber || m.person_number || '');
  const safePn = escapeHtml(pn);
  const res = _mailResolveEmail(m);
  const isSelected = _mailSelected.has(pn);
  const lastName = m.LastName || m.last_name || '–';
  const firstName = m.FirstName || m.first_name || '–';
  const displayName = `${lastName}, ${firstName}`;

  let emailHtml = '';
  if (res.hasEmail) {
    const copyBtn = `<i class="fa-regular fa-copy text-muted ms-1.5 cursor-pointer opacity-50 hover-opacity-100"
                        data-email="${escapeHtml(res.activeEmail)}"
                        onclick="mailCopySingle(this.dataset.email, event)"
                        title="Adresse kopieren"></i>`;
    emailHtml = `
      <div class="d-flex align-items-center">
        <span class="font-monospace text-dark fw-medium" style="font-size: 0.85rem;">${escapeHtml(res.activeEmail)}</span>
        ${copyBtn}
      </div>`;
    if (res.isFallback) {
      emailHtml += `<div class="small text-warning" style="font-size: 0.72rem;"><i class="fas fa-info-circle me-1"></i>Zweitadresse (Hauptadresse fehlt)</div>`;
    } else if (res.hasAdditional && res.additional.toLowerCase() !== res.primary.toLowerCase()) {
      emailHtml += `<div class="small text-muted font-monospace" style="font-size: 0.72rem;">+ ${escapeHtml(res.additional)}</div>`;
    }
  } else {
    emailHtml = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle py-1 px-2 fw-semibold" style="font-size:0.72rem;"><i class="fas fa-times-circle me-1"></i>Keine E-Mail</span>`;
  }

  let additionalHtml = '<span class="text-muted">–</span>';
  if (res.hasAdditional) {
    additionalHtml = `<span class="font-monospace small text-secondary">${escapeHtml(res.additional)}</span>`;
  } else if (res.additional) {
    additionalHtml = `<span class="text-danger small" title="Ungültiges Format">${escapeHtml(res.additional)}</span>`;
  }

  // Kategorie & Funktion Badges
  let katHtml = '–';
  const badges = [];
  if (m._istVorstand || (m._aktiveFunktionenCount && m._aktiveFunktionenCount > 0)) {
    badges.push('<span class="badge bg-info text-dark">Vorstand</span>');
  }
  if (m._kategorien && m._kategorien.length > 0) {
    m._kategorien.forEach(k => {
      badges.push(typeof mglKatBadge === 'function' ? mglKatBadge(k) : `<span class="badge bg-secondary">${escapeHtml(k)}</span>`);
    });
  } else if (m._kategorie) {
    badges.push(typeof mglKatBadge === 'function' ? mglKatBadge(m._kategorie) : `<span class="badge bg-secondary">${escapeHtml(m._kategorie)}</span>`);
  }
  if (badges.length > 0) katHtml = `<div class="d-flex flex-wrap gap-1">${badges.join(' ')}</div>`;

  let statusBadge = '';
  let statusSortVal = '';
  if (!res.hasEmail) {
    statusBadge = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Keine E-Mail</span>`;
    statusSortVal = '3_Keine E-Mail';
  } else if (res.isFallback) {
    statusBadge = `<span class="badge bg-warning-subtle text-dark border border-warning-subtle">Zweitadresse</span>`;
    statusSortVal = '2_Zweitadresse';
  } else {
    statusBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle">Hauptadresse</span>`;
    statusSortVal = '1_Hauptadresse';
  }

  const rowBg = !res.hasEmail ? 'background-color: rgba(220, 53, 69, 0.03);' : (isSelected ? 'background-color: rgba(15, 58, 93, 0.02);' : '');

  return `
    <tr style="${rowBg}" class="cursor-pointer" data-id="${safePn}" data-pn="${safePn}" onclick="mailRowClick(this.dataset.pn, event)">
      <td class="text-center align-middle tk-col-check" data-col-id="check" onclick="event.stopPropagation()">
        <input type="checkbox" class="form-check-input mt-0"
               id="chk-recipient-${safePn}"
               data-pn="${safePn}"
               ${isSelected ? 'checked' : ''}
               ${!res.hasEmail ? 'disabled' : ''}
               onchange="mailToggleSingleRecipient(this.dataset.pn, this.checked)">
      </td>
      <td class="align-middle font-monospace text-muted small tk-col-pn" data-col-id="pn" data-cell="pn">${safePn}</td>
      <td class="align-middle fw-medium text-dark text-nowrap tk-col-name" data-col-id="name" data-cell="name">${escapeHtml(displayName)}</td>
      <td class="align-middle tk-col-email" data-col-id="email" data-cell="email" data-sort-value="${escapeHtml(res.activeEmail || 'zzz')}">${emailHtml}</td>
      <td class="align-middle tk-col-additional" data-col-id="additional" data-cell="additional">${additionalHtml}</td>
      <td class="align-middle tk-col-kat" data-col-id="kat" data-cell="kat">${katHtml}</td>
      <td class="align-middle tk-col-status" data-col-id="status" data-cell="status" data-sort-value="${statusSortVal}">${statusBadge}</td>
    </tr>`;
}

function _mailDestroyPreviewTable() {
  const existing = document.getElementById('mail-recipients-table');
  if (existing && existing._tkController && typeof existing._tkController.destroy === 'function') {
    existing._tkController.destroy();
  }
}

function _mailApplyActiveSort(table) {
  if (!table) return;
  const activeTh = table.querySelector('thead th.tk-sort-asc, thead th.tk-sort-desc');
  if (!activeTh) return;
  const key = activeTh.dataset.sortKey;
  if (!key) return;
  const dirMult = activeTh.classList.contains('tk-sort-desc') ? -1 : 1;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr[data-id]'));
  if (rows.length < 2) return;
  const getVal = (row) => {
    const cell = row.querySelector(`[data-cell="${key}"]`);
    if (!cell) return '';
    return cell.dataset.sortValue !== undefined ? cell.dataset.sortValue : cell.textContent.trim();
  };
  rows.sort((a, b) => String(getVal(a)).localeCompare(String(getVal(b)), 'de-CH', { numeric: true, sensitivity: 'base' }) * dirMult);
  rows.forEach(r => tbody.appendChild(r));
}

function _mailRenderPreview() {
  const container = document.getElementById('mail-preview');
  if (!container) return;

  const candidates = _mailGetActiveCandidates();
  if (candidates.length === 0) {
    _mailDestroyPreviewTable();
    container.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted py-5" style="opacity: 0.6;">
        <i class="fas fa-users-rectangle fa-3x mb-3 text-secondary"></i>
        <p class="mb-0 fw-medium">Wähle mindestens eine Gruppe links aus, um Empfänger zu laden.</p>
      </div>`;
    return;
  }

  const visible = _mailGetVisibleCandidates();
  if (visible.length === 0) {
    _mailDestroyPreviewTable();
    container.innerHTML = `
      <div class="text-center py-5 text-muted border rounded-3 bg-white">
        <i class="fas fa-filter fa-2x mb-2 text-secondary opacity-50"></i>
        <p class="mb-1">Keine Empfänger für den aktuellen Such- oder Filterbegriff gefunden.</p>
        <button class="btn btn-sm btn-link" onclick="mailClearSearch(); mailSetTableFilter('all');">Filter zurücksetzen</button>
      </div>`;
    return;
  }

  // Standardsortierung nach Nachname, Vorname
  const sorted = [...visible].sort((a, b) => {
    const na = `${a.LastName || a.last_name || ''} ${a.FirstName || a.first_name || ''}`;
    const nb = `${b.LastName || b.last_name || ''} ${b.FirstName || b.first_name || ''}`;
    return na.localeCompare(nb, 'de-CH', { numeric: true, sensitivity: 'base' });
  });

  const rowsHtml = sorted.map(_mailBuildRowHtml).join('');
  let table = document.getElementById('mail-recipients-table');

  if (!table) {
    container.innerHTML = `
      <div class="table-responsive border rounded-3 bg-white" style="min-height: 250px; max-height: 480px; overflow-y: auto;">
        <table class="table table-hover table-sm mb-0 align-middle" id="mail-recipients-table" style="font-size: 0.88rem;">
          <thead class="table-light sticky-top shadow-sm" style="z-index: 2;">
            <tr>
              <th class="text-center align-middle py-2.5 tk-col-check" data-col-id="check" data-col-toggle="false" style="width: 44px;">
                <input type="checkbox" class="form-check-input mt-0" id="mail-master-check" onchange="mailToggleAllVisible(this.checked)" title="Alle sichtbaren an-/abwählen">
              </th>
              <th class="align-middle py-2.5 px-3 tk-col-pn" data-col-id="pn" data-col-name="SSV-Nummer" data-col-default="hidden" data-sort-key="pn">SSV-Nr.</th>
              <th class="align-middle py-2.5 px-3 tk-col-name" data-col-id="name" data-col-name="Name, Vorname" data-sort-key="name">Name, Vorname</th>
              <th class="align-middle py-2.5 px-3 tk-col-email" data-col-id="email" data-col-name="E-Mail-Adresse" data-sort-key="email">E-Mail-Adresse</th>
              <th class="align-middle py-2.5 px-3 tk-col-additional" data-col-id="additional" data-col-name="Zweitadresse" data-col-default="hidden" data-sort-key="additional">Zweitadresse</th>
              <th class="align-middle py-2.5 px-3 tk-col-kat" data-col-id="kat" data-col-name="Kategorie & Funktion" data-sort-key="kat">Kategorie &amp; Funktion</th>
              <th class="align-middle py-2.5 px-3 tk-col-status" data-col-id="status" data-col-name="Status" data-sort-key="status">Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    table = document.getElementById('mail-recipients-table');
    if (window.TableKit && typeof window.TableKit.initTable === 'function' && table) {
      window.TableKit.initTable(table, {
        id: 'mail_recipients',
        storagePrefix: 'tk_mail_',
        reorderable: true,
        lockedColumns: ['check'],
        resizable: true,
        minWidth: 44,
        columns: {
          check: { resizable: false, minWidth: 44, defaultWidth: 44 },
          pn: { defaultWidth: 105 },
          status: { defaultWidth: 125 }
        },
        columnToggle: {
          container: '#mail-col-toggle'
        },
        sortable: {
          initialKey: 'name',
          initialDir: 'asc',
          getValue: (row, key) => {
            const cell = row.querySelector(`[data-cell="${key}"]`);
            if (!cell) return '';
            if (cell.dataset.sortValue !== undefined) return cell.dataset.sortValue;
            return cell.textContent.trim();
          }
        },
        autoSync: true
      });
    }
  } else {
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = rowsHtml;
      _mailApplyActiveSort(table);
    }
    if (window.TableKit && typeof window.TableKit.syncTable === 'function') {
      window.TableKit.syncTable(table);
    }
  }

  _mailUpdateMasterCheckboxState();
}

function mailRowClick(pn, evt) {
  if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'BUTTON' || evt.target.tagName === 'I') return;
  const cb = document.getElementById(`chk-recipient-${pn}`);
  if (cb && !cb.disabled) {
    cb.checked = !cb.checked;
    mailToggleSingleRecipient(pn, cb.checked);
  }
}

function _getKatLabel(m) {
  if (m._kategorien && m._kategorien.length > 0) return m._kategorien.join(', ');
  return m._kategorie || '–';
}

// ============================================================
// EXPORT & AKTIONEN
// ============================================================
function _mailGetEffectiveEmails() {
  const candidates = _mailGetActiveCandidates();
  const selectedMembers = candidates.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || '')));

  const rawList = [];
  selectedMembers.forEach(m => {
    rawList.push(..._mailGetMemberEmails(m));
  });

  // Deduplizieren (lowercase), aber Original-Schreibweise erhalten
  const seen = new Set();
  const deduped = [];
  rawList.forEach(email => {
    const clean = email.trim();
    const low = clean.toLowerCase();
    if (clean && !seen.has(low)) {
      seen.add(low);
      deduped.push(clean);
    }
  });

  return deduped;
}

async function _mailShowCopyFallbackModal(payload, title = 'Adressen manuell kopieren') {
  if (window.UIConfirmKit && typeof window.UIConfirmKit.prompt === 'function') {
    await window.UIConfirmKit.prompt({
      title,
      message: 'Der direkte Zugriff auf die Zwischenablage wurde blockiert. Kopiere den Text mit <strong>Strg+C</strong>:',
      defaultValue: payload,
      confirmText: 'Schliessen',
      cancelText: 'Abbrechen',
      type: 'info'
    });
  }
}

async function mailKopieren() {
  const emails = _mailGetEffectiveEmails();
  if (!emails.length) {
    if (window.UIConfirmKit) {
      await window.UIConfirmKit.alert({
        title: 'Keine E-Mail-Adressen',
        message: 'In der aktuellen Auswahl sind keine gültigen E-Mail-Adressen vorhanden.',
        type: 'warning'
      });
    }
    return;
  }

  // Für Outlook/Thunderbird/BCC Semikolon + Leerzeichen
  const payload = emails.join('; ');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(payload);
      const el = document.getElementById('mail-copy-success');
      if (el) {
        el.innerHTML = `<i class="fas fa-check-circle fs-5 me-2"></i> <strong>${emails.length} E-Mail-Adresse(n)</strong> erfolgreich in die Zwischenablage kopiert!`;
        el.classList.remove('d-none');
        setTimeout(() => el.classList.add('d-none'), 3500);
      }
      if (typeof showSuccess === 'function') {
        showSuccess(`${emails.length} Adressen kopiert`);
      }
    } catch (_) {
      await _mailShowCopyFallbackModal(payload);
    }
  } else {
    await _mailShowCopyFallbackModal(payload);
  }
}

async function mailCopySingle(email, evt) {
  if (evt) evt.stopPropagation();
  if (!email) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(email);
      if (typeof showSuccess === 'function') {
        showSuccess(`Adresse kopiert: ${email}`);
      } else {
        const el = document.getElementById('mail-copy-success');
        if (el) {
          el.innerHTML = `<i class="fas fa-check-circle fs-5 me-2"></i> Adresse <strong>${escapeHtml(email)}</strong> kopiert!`;
          el.classList.remove('d-none');
          setTimeout(() => el.classList.add('d-none'), 2500);
        }
      }
    } catch (_) {
      await _mailShowCopyFallbackModal(email, 'Adresse manuell kopieren');
    }
  } else {
    await _mailShowCopyFallbackModal(email, 'Adresse manuell kopieren');
  }
}

async function mailOpenMailto() {
  const emails = _mailGetEffectiveEmails();
  if (!emails.length) return;

  if (emails.length > 30) {
    if (window.UIConfirmKit) {
      await window.UIConfirmKit.alert({
        title: 'Zu viele Empfänger (> 30)',
        message: 'Für mehr als 30 Empfänger ist der direkte Mailto-Aufruf gesperrt. Bitte kopiere die Adressen in die Zwischenablage.',
        type: 'warning'
      });
    }
    return;
  }

  // Gemäss RFC 6068 müssen Adressen einzeln URL-kodiert und mit unkodiertem Komma getrennt werden
  const bcc = emails.map(e => encodeURIComponent(e)).join(',');
  const mailtoUrl = 'mailto:?bcc=' + bcc;

  if (mailtoUrl.length > 1950) {
    if (window.UIConfirmKit) {
      await window.UIConfirmKit.alert({
        title: 'Adresszeile zu lang',
        message: 'Die erzeugte Mailto-URL überschreitet das Limit vieler Mailprogramme (~2000 Zeichen). Bitte nutze stattdessen «Adressen kopieren».',
        type: 'warning'
      });
    }
    return;
  }

  const a = document.createElement('a');
  a.href = mailtoUrl;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

async function mailCSV() {
  const candidates = _mailGetActiveCandidates();
  const selectedMembers = candidates.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || '')));
  if (!selectedMembers.length) {
    if (window.UIConfirmKit) {
      await window.UIConfirmKit.alert({
        title: 'Keine Empfänger ausgewählt',
        message: 'Bitte wähle mindestens ein Mitglied aus.',
        type: 'warning'
      });
    }
    return;
  }

  const csvEsc = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
  const lines = ['"Personennummer";"Nachname";"Vorname";"E-Mail";"Zweitadresse";"Kategorie";"Vorstand"'];
  selectedMembers.forEach(m => {
    const res = _mailResolveEmail(m);
    const kat = _getKatLabel(m);
    const isVo = (m._istVorstand || Number(m._aktiveFunktionenCount || 0) > 0) ? 'Ja' : 'Nein';
    const pn = m.PersonNumber || m.person_number || '';
    lines.push([
      csvEsc(pn),
      csvEsc(m.LastName || m.last_name || ''),
      csvEsc(m.FirstName || m.first_name || ''),
      csvEsc(res.activeEmail),
      csvEsc(res.additional),
      csvEsc(kat),
      csvEsc(isVo)
    ].join(';'));
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `muhen_mail_verteiler_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

async function mailExcel() {
  const candidates = _mailGetActiveCandidates();
  const selectedMembers = candidates.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || '')));
  if (!selectedMembers.length) {
    if (window.UIConfirmKit) {
      await window.UIConfirmKit.alert({
        title: 'Keine Empfänger ausgewählt',
        message: 'Bitte wähle mindestens ein Mitglied aus.',
        type: 'warning'
      });
    }
    return;
  }

  if (window.UIExportKit && typeof window.UIExportKit.dataToExcel === 'function') {
    const exportRows = selectedMembers.map(m => {
      const res = _mailResolveEmail(m);
      return {
        pn: m.PersonNumber || m.person_number || '',
        lastName: m.LastName || m.last_name || '',
        firstName: m.FirstName || m.first_name || '',
        email: res.activeEmail,
        additional: res.additional,
        kategorie: _getKatLabel(m),
        vorstand: (m._istVorstand || Number(m._aktiveFunktionenCount || 0) > 0) ? 'Ja' : 'Nein'
      };
    });
    window.UIExportKit.dataToExcel(exportRows, {
      headers: {
        pn: 'SSV-Nummer',
        lastName: 'Nachname',
        firstName: 'Vorname',
        email: 'E-Mail',
        additional: 'Zweitadresse',
        kategorie: 'Kategorie',
        vorstand: 'Vorstand'
      },
      columnWidths: [14, 22, 20, 32, 32, 22, 12],
      sheetName: 'Mail-Verteiler',
      filename: 'muhen_mail_verteiler',
      dateSuffix: true
    });
  } else {
    await mailCSV();
  }
}

// ============================================================
// MAIL-LOG (Versandprotokoll aus public.mail_logs / Supabase)
// ============================================================
let _mailLogData = [];
let _mailLogLoaded = false;

/**
 * Lädt die letzten 500 Einträge aus public.mail_logs und rendert die Tabelle.
 * @param {boolean} force – true = Cache ignorieren
 * @param {HTMLElement} [btnEl] – optionaler Auslöser-Button für Double-Submit/Loading-Schutz
 */
async function loadMailLogData(force = false, btnEl = null) {
  const container = document.getElementById('mail-log-container');
  if (!container) return;

  if (_mailLogLoaded && !force) {
    filterMailLog();
    return;
  }

  const runLoad = async () => {
    container.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="fas fa-circle-notch fa-spin fa-2x mb-3"></i><br>Lade Versandprotokoll…
      </div>`;

    try {
      const sb = (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null) ||
                 window.supabaseClient ||
                 (typeof supabase !== 'undefined' ? supabase : null);
      if (!sb) throw new Error('Supabase-Client nicht initialisiert.');

      const { data, error } = await sb
        .from('mail_logs')
        .select('id,module_ref,record_id,recipient_email,recipient_name,cc_email,subject,body_snippet,status,error_message,sender_name,has_pdf,sent_via,sent_at')
        .order('sent_at', { ascending: false })
        .limit(500);

      if (error) throw new Error(error.message);

      _mailLogData = data || [];
      _mailLogLoaded = true;

      const badge = document.getElementById('mail-log-badge');
      if (badge) {
        badge.textContent = _mailLogData.length;
        badge.classList.remove('d-none');
      }

      filterMailLog();
    } catch (e) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Fehler:</strong> ${escapeHtml(e.message)}
        </div>`;
    }
  };

  if (btnEl && window.UIButtonKit && typeof window.UIButtonKit.withLoading === 'function') {
    await window.UIButtonKit.withLoading(btnEl, runLoad);
  } else {
    await runLoad();
  }
}

/** Filtert _mailLogData anhand der drei Filter-Controls und rendert die Tabelle. */
function filterMailLog() {
  const moduleFilter = (document.getElementById('mail-log-filter-module')?.value || '').toLowerCase();
  const statusFilter = (document.getElementById('mail-log-filter-status')?.value || '').toLowerCase();
  const search = (document.getElementById('mail-log-search')?.value || '').trim().toLowerCase();

  const filtered = _mailLogData.filter(r => {
    if (moduleFilter && String(r.module_ref || '').toLowerCase() !== moduleFilter) return false;
    if (statusFilter && String(r.status || '').toLowerCase() !== statusFilter) return false;
    if (search) {
      const hay = `${r.recipient_email || ''} ${r.recipient_name || ''} ${r.subject || ''} ${r.record_id || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  _renderMailLogTable(filtered);
}

function _mailFormatDateTime(isoStr, includeSeconds = false) {
  if (!isoStr) return '–';
  if (window.UIFormatKit && typeof window.UIFormatKit.dateTime === 'function') {
    return window.UIFormatKit.dateTime(isoStr, { seconds: includeSeconds, fallback: '–' });
  }
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? '–' : d.toLocaleString('de-CH');
}

/** Rendert die gefilterten Einträge als TableKit-Tabelle. */
function _renderMailLogTable(rows) {
  const container = document.getElementById('mail-log-container');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="fas fa-inbox fa-2x mb-2"></i><br>Keine Einträge gefunden.
      </div>`;
    return;
  }

  const tbody = rows.map(r => {
    const statusBadge = _mailLogStatusBadge(r.status);
    const modLabel = _mailLogModuleLabel(r.module_ref);
    const sentAt = _mailFormatDateTime(r.sent_at);
    const pdfIcon = r.has_pdf ? '<i class="fas fa-paperclip text-muted" title="PDF Anhang"></i>' : '';
    const subject = escapeHtml(r.subject || '–');
    const recipient = escapeHtml(r.recipient_email || '–');
    const name = escapeHtml(r.recipient_name || '');
    const safeId = escapeHtml(r.id);

    return `
      <tr style="cursor:pointer" data-id="${safeId}" data-log-id="${safeId}" onclick="_showMailLogDetail(this.dataset.logId)">
        <td class="align-middle text-nowrap text-muted small" data-col-id="sent_at" data-cell="sent_at" data-sort-value="${escapeHtml(r.sent_at || '')}">${escapeHtml(sentAt)}</td>
        <td class="align-middle" data-col-id="module" data-cell="module">${modLabel}</td>
        <td class="align-middle" data-col-id="recipient" data-cell="recipient">
          <div class="fw-medium">${recipient}</div>
          ${name ? `<div class="text-muted small">${name}</div>` : ''}
        </td>
        <td class="align-middle" style="max-width:300px" data-col-id="subject" data-cell="subject">
          <div class="text-truncate">${subject}</div>
          ${r.record_id ? `<span class="badge bg-light text-dark border small">${escapeHtml(r.record_id)}</span>` : ''}
        </td>
        <td class="align-middle text-center" data-col-id="pdf" data-cell="pdf" data-sort-value="${r.has_pdf ? '1' : '0'}">${pdfIcon}</td>
        <td class="align-middle" data-col-id="status" data-cell="status">${statusBadge}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="text-muted small mb-2">${rows.length} Einträge</div>
    <div class="table-responsive border rounded-3 bg-white">
      <table class="table table-hover table-sm mb-0 align-middle" id="mail-log-table" style="font-size:0.875rem">
        <thead class="table-light">
          <tr>
            <th data-col-id="sent_at" data-sort-key="sent_at">Datum</th>
            <th data-col-id="module" data-sort-key="module">Modul</th>
            <th data-col-id="recipient" data-sort-key="recipient">Empfänger</th>
            <th data-col-id="subject" data-sort-key="subject">Betreff / Ref.</th>
            <th class="text-center" data-col-id="pdf" data-sort-key="pdf"><i class="fas fa-paperclip" title="PDF"></i></th>
            <th data-col-id="status" data-sort-key="status">Status</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  if (window.TableKit && typeof window.TableKit.initTable === 'function') {
    window.TableKit.initTable('#mail-log-table', {
      id: 'mail_log',
      storagePrefix: 'tk_mail_',
      reorderable: false,
      resizable: true,
      sortable: {
        getValue: (row, key) => {
          const cell = row.querySelector(`[data-cell="${key}"]`);
          if (!cell) return '';
          if (cell.dataset.sortValue !== undefined) return cell.dataset.sortValue;
          return cell.textContent.trim();
        }
      },
      autoSync: false
    });
  }
}

/** Zeigt Detailansicht eines Log-Eintrags (Klick auf Zeile). */
function _showMailLogDetail(itemOrId) {
  let r = null;
  if (typeof itemOrId === 'string') {
    r = _mailLogData.find(x => String(x.id) === itemOrId);
    if (!r) {
      try { r = JSON.parse(itemOrId); } catch (_) { r = null; }
    }
  } else if (itemOrId && typeof itemOrId === 'object') {
    r = itemOrId;
  }
  if (!r) return;

  const sentAt = _mailFormatDateTime(r.sent_at, true);
  const recipientDisplay = escapeHtml(r.recipient_email || '–') +
    (r.recipient_name ? ` (${escapeHtml(r.recipient_name)})` : '');

  const rows = [
    ['Datum',       escapeHtml(sentAt)],
    ['Modul',       escapeHtml(r.module_ref || '–')],
    ['Referenz-ID', escapeHtml(r.record_id || '–')],
    ['Empfänger',   recipientDisplay],
    ['CC',          escapeHtml(r.cc_email || '–')],
    ['Betreff',     escapeHtml(r.subject || '–')],
    ['Status',      _mailLogStatusBadge(r.status)],
    ['Absender',    escapeHtml(r.sender_name || '–')],
    ['Versandweg',  escapeHtml(r.sent_via || '–')],
    ['PDF-Anhang',  r.has_pdf ? '✅ Ja' : '–'],
    ['Vorschau',    r.body_snippet ? `<pre class="mb-0 p-2 bg-light rounded border" style="white-space:pre-wrap;font-size:0.8rem;max-height:200px;overflow:auto">${escapeHtml(r.body_snippet)}</pre>` : '–'],
    ...(r.error_message ? [['Fehlermeldung', `<span class="text-danger">${escapeHtml(r.error_message)}</span>`]] : [])
  ];

  const tableRows = rows.map(([k, v]) =>
    `<tr><th class="text-muted fw-normal" style="width:130px;white-space:nowrap">${escapeHtml(k)}</th><td>${v}</td></tr>`
  ).join('');

  // Modal dynamisch erzeugen oder wiederverwenden
  let modal = document.getElementById('mail-log-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mail-log-detail-modal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-labelledby', 'mailLogDetailModalTitle');
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="mailLogDetailModalTitle"><i class="fas fa-envelope me-2"></i>Mail-Log Detail</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schliessen"></button>
          </div>
          <div class="modal-body" id="mail-log-detail-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Schliessen</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('mail-log-detail-body').innerHTML =
    `<table class="table table-sm table-borderless mb-0">${tableRows}</table>`;

  bootstrap.Modal.getOrCreateInstance(modal).show();
}

/** Gibt ein farbiges Badge für den Mail-Status zurück. */
function _mailLogStatusBadge(status) {
  const map = {
    'gesendet':  '<span class="badge bg-success">✅ Gesendet</span>',
    'fehler':    '<span class="badge bg-danger">❌ Fehler</span>',
    'simuliert': '<span class="badge bg-warning text-dark">🧪 Simuliert</span>'
  };
  return map[status] || `<span class="badge bg-secondary">${escapeHtml(status || '–')}</span>`;
}

/** Gibt ein Emoji-Label für das Herkunftsmodul zurück. */
function _mailLogModuleLabel(ref) {
  const map = {
    'rechnung':            '💶 Rechnung',
    'mietvertrag':         '🏠 Mietvertrag',
    'jahresbeitrag':       '📋 Jahresbeitrag',
    'mahnung':             '⚠️ Mahnung',
    'anlasse':             '📅 Anlässe',
    'vermietung':          '🔑 Vermietung',
    'vermietung_test':     '🧪 Vermietung-Test',
    'mitglieder':          '👥 Mitglieder',
    'gv':                  '🏛️ GV',
    'manager':             '🎯 Manager',
    'jahresmeisterschaft': '🏅 Jahresmeisterschaft',
    'umfragen':            '📊 Umfragen',
    'kontakt':             '📬 Website-Kontakt',
    'auth':                '🔐 Auth',
    'logins':              '🪪 Logins',
    'ai_system':           '🤖 KI-System',
    'system_test':         '🧪 System-Test',
    'allgemein':           '✉️ Allgemein',
    'sonstige':            '📁 Sonstige',
    'unbekannt':           '❓ Unbekannt'
  };
  return map[ref] || escapeHtml(ref || '–');
}
