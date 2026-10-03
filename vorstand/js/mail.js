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
    filter: m => true 
  },
  { 
    key: 'aktiv',    
    label: '🎯 Alle Aktiven Schützen', 
    haupt: false, 
    filter: m => (m.IsActive == 1 || m.IsActive === true) && !m._istPassiv && !m._istEhren && 
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
  },
];

let _mailAllMembers    = [];
let _mailActiveGroups  = new Set();
let _mailSelected      = new Set();
let _mailLoaded        = false;
window._mailTableFilter = 'all'; // 'all', 'with_email', 'no_email'
window._mailSearchTerm  = '';
window._mailSortCol     = 'ln';
window._mailSortDir     = 1;

// ============================================================
// ADRESS-AUFLÖSUNG & HYGIENE
// ============================================================
function _mailResolveEmail(m) {
  const pRaw = (m.PrimaryEmail || m.primary_email || m.Email || '').trim();
  const aRaw = (m.AdditionalEmail || m.additional_email || '').trim();

  const isValidEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

  const hasPrimary = isValidEmail(pRaw);
  const hasAdditional = isValidEmail(aRaw);

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

// ============================================================
// LADEN
// ============================================================
async function loadMailData(forceReload = false) {
  if (_mailLoaded && !forceReload) {
    renderMailUI();
    return;
  }

  _mailActiveGroups.clear();
  _mailSelected.clear();

  // Cache-First Integration aus globalem Mitglieder-Store
  if (!forceReload && window._mglData && window._mglData.length > 0) {
    console.log("⚡ loadMailData: Lade Mitglieder aus globalem Cache...");
    _mailProcessMembers(window._mglData);
    _mailLoaded = true;
    renderMailUI();
    return;
  }

  _mailLoaded     = false;
  _mailAllMembers = [];

  const container = document.getElementById('mail-container');
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
      if (supa) {
        const { data, error } = await supa.from('members').select('*');
        if (error) throw error;
        list = data || [];
      } else {
        throw new Error('Supabase Client nicht verfügbar.');
      }
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
    const istAktiv  = m.IsActive  == 1 || m.IsActive  === true || String(m.IsActive).toLowerCase()  === 'true' || m.is_active;
    const istPassiv = m.IsPassive == 1 || m.IsPassive === true || String(m.IsPassive).toLowerCase() === 'true' || m.is_passive;
    const istEhren  = m.IsHonoraryMember == 1 || m.IsHonoraryMember === true || String(m.IsHonoraryMember).toLowerCase() === 'true' || m.is_honorary;
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
          <div class="card-body p-0">
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
            <div class="p-3 border-top text-end bg-white">
              <button class="btn btn-sm btn-link text-decoration-none text-muted p-0" onclick="mailResetSelection()" style="font-size: 0.82rem;">
                <i class="fas fa-undo me-1"></i>Auswahl zurücksetzen
              </button>
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
                <strong>Achtung:</strong> Für <span id="mail-missing-count" class="fw-bold"></span> ausgewählte Person(en) ist <strong>keine E-Mail-Adresse</strong> hinterlegt. Diese werden beim Kopieren automatisch übersprungen.
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
                <strong>Zu viele Empfänger (> 30).</strong> Die «Mail öffnen»-Funktion ist gesperrt, um Mailprogramm-Abbrüche und Spamfilter zu verhindern. Bitte nutze «Adressen kopieren».
              </div>
            </div>

            <!-- LIVE-FILTER & SEARCH TOOLBAR (GLOBALES MODELL) -->
            <div id="mail-table-controls" class="d-none mb-3">
              <div class="row g-2 align-items-center">
                <div class="col-sm-6 col-md-5">
                  <div class="input-group input-group-sm">
                    <span class="input-group-text bg-white border-end-0 text-muted"><i class="fas fa-search"></i></span>
                    <input type="text" class="form-control border-start-0" id="mail-table-search" 
                           placeholder="Filtere Name, E-Mail, Kategorie..." 
                           value="${escapeHtml(window._mailSearchTerm || '')}"
                           oninput="mailOnSearch(this.value)">
                    ${window._mailSearchTerm ? `
                    <button class="btn btn-outline-secondary border-start-0 bg-white" onclick="mailClearSearch()" type="button">
                      <i class="fas fa-times"></i>
                    </button>` : ''}
                  </div>
                </div>
                <div class="col-sm-6 col-md-7 text-sm-end">
                  <div class="btn-group btn-group-sm" role="group" id="mail-filter-pills">
                    <button type="button" class="btn btn-outline-secondary ${window._mailTableFilter === 'all' ? 'active' : ''}" onclick="mailSetTableFilter('all')">
                      Alle (<span id="pill-count-all">0</span>)
                    </button>
                    <button type="button" class="btn btn-outline-secondary ${window._mailTableFilter === 'with_email' ? 'active' : ''}" onclick="mailSetTableFilter('with_email')">
                      <i class="fas fa-check text-success me-1"></i>Mit Mail (<span id="pill-count-with">0</span>)
                    </button>
                    <button type="button" class="btn btn-outline-secondary ${window._mailTableFilter === 'no_email' ? 'active' : ''}" onclick="mailSetTableFilter('no_email')">
                      <i class="fas fa-times text-danger me-1"></i>Ohne Mail (<span id="pill-count-without">0</span>)
                    </button>
                  </div>
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
// GRUPPENAUSWAHL
// ============================================================
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
function mailOnSearch(val) {
  window._mailSearchTerm = (val || '').trim().toLowerCase();
  _mailRenderPreview();
}

function mailClearSearch() {
  window._mailSearchTerm = '';
  const input = document.getElementById('mail-table-search');
  if (input) input.value = '';
  _mailRenderPreview();
}

function mailSetTableFilter(filter) {
  window._mailTableFilter = filter;
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
      const hay = `${m.LastName || ''} ${m.FirstName || ''} ${res.primary} ${res.additional} ${_getKatLabel(m)}`.toLowerCase();
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
  const summaryEl   = document.getElementById('mail-summary');
  const subSumEl    = document.getElementById('mail-sub-summary');
  const controlsEl  = document.getElementById('mail-table-controls');
  const hintEl      = document.getElementById('mail-bcc-hint');
  const warnEl      = document.getElementById('mail-missing-warning');
  const warnCount   = document.getElementById('mail-missing-count');
  const mailtoBtn   = document.getElementById('btn-mailto');
  const copyBtn     = document.getElementById('btn-copy');
  const copyCount   = document.getElementById('copy-count');
  const mailtoHint  = document.getElementById('mail-mailto-hint');

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

  const withEmail    = candidates.filter(m => _mailResolveEmail(m).hasEmail);
  const withoutEmail = candidates.length - withEmail.length;
  const selectedWithEmail = candidates.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || '')) && _mailResolveEmail(m).hasEmail);

  // Filter-Pill Zähler aktualisieren
  const pillAll = document.getElementById('pill-count-all');
  const pillWith = document.getElementById('pill-count-with');
  const pillWithout = document.getElementById('pill-count-without');
  if (pillAll) pillAll.textContent = candidates.length;
  if (pillWith) pillWith.textContent = withEmail.length;
  if (pillWithout) pillWithout.textContent = withoutEmail;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="text-dark fw-bold">${selectedWithEmail.length} Empfänger ausgewählt</span> 
      <span class="text-muted fw-normal">(${withEmail.length} von ${candidates.length} Personen mit E-Mail)</span>`;
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

  const zuViele = selectedWithEmail.length > 30;
  if (mailtoBtn) mailtoBtn.disabled = zuViele || selectedWithEmail.length === 0;
  if (copyBtn) copyBtn.disabled = selectedWithEmail.length === 0;
  if (copyCount) copyCount.textContent = selectedWithEmail.length;
  if (mailtoHint) mailtoHint.classList.toggle('d-none', !zuViele);
}

// ============================================================
// VORSCHAU-TABELLE (GLOBALES TABLEKIT-MODELL)
// ============================================================
function _mailRenderPreview() {
  const container = document.getElementById('mail-preview');
  if (!container) return;

  const candidates = _mailGetActiveCandidates();
  if (candidates.length === 0) {
    container.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted py-5" style="opacity: 0.6;">
        <i class="fas fa-users-rectangle fa-3x mb-3 text-secondary"></i>
        <p class="mb-0 fw-medium">Wähle mindestens eine Gruppe links aus, um Empfänger zu laden.</p>
      </div>`;
    return;
  }

  const visible = _mailGetVisibleCandidates();
  if (visible.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted border rounded-3 bg-white">
        <i class="fas fa-filter fa-2x mb-2 text-secondary opacity-50"></i>
        <p class="mb-1">Keine Empfänger für den aktuellen Such- oder Filterbegriff gefunden.</p>
        <button class="btn btn-sm btn-link" onclick="mailClearSearch(); mailSetTableFilter('all');">Filter zurücksetzen</button>
      </div>`;
    return;
  }

  // Sortierung
  const sorted = [...visible].sort((a, b) => {
    const col = window._mailSortCol;
    const resA = _mailResolveEmail(a);
    const resB = _mailResolveEmail(b);

    const va = col === 'fn'    ? (a.FirstName || a.first_name || '') :
               col === 'ln'    ? (a.LastName  || a.last_name  || '') :
               col === 'email' ? (resA.activeEmail || 'zzz') :
               col === 'kat'   ? _getKatLabel(a) : '';

    const vb = col === 'fn'    ? (b.FirstName || b.first_name || '') :
               col === 'ln'    ? (b.LastName  || b.last_name  || '') :
               col === 'email' ? (resB.activeEmail || 'zzz') :
               col === 'kat'   ? _getKatLabel(b) : '';

    return window._mailSortDir * String(va).localeCompare(String(vb), 'de');
  });

  function sortHeader(col, title, style = '') {
    const isActive = window._mailSortCol === col;
    const icon = !isActive ? '<i class="fas fa-sort text-muted opacity-25 ms-1" style="font-size:0.75rem"></i>' :
                 window._mailSortDir === 1 ? '<i class="fas fa-sort-up text-primary ms-1"></i>' :
                 '<i class="fas fa-sort-down text-primary ms-1"></i>';
    return `<th class="tk-sortable align-middle py-2.5 px-3 user-select-none" style="cursor:pointer; ${style}" onclick="mailSort('${col}')">
      <div class="d-flex align-items-center justify-content-between">
        <span>${title}</span>
        <span>${icon}</span>
      </div>
    </th>`;
  }

  const rows = sorted.map((m, idx) => {
    const pn = String(m.PersonNumber || m.person_number || '');
    const res = _mailResolveEmail(m);
    const isSelected = _mailSelected.has(pn);
    const lastName = escapeHtml(m.LastName || m.last_name || '–');
    const firstName = escapeHtml(m.FirstName || m.first_name || '–');

    // Mail-Zelle mit Status und Zweitadress-Badge
    let emailHtml = '';
    if (res.hasEmail) {
      const copyBtn = `<i class="fa-regular fa-copy text-muted ms-1.5 cursor-pointer opacity-50 hover-opacity-100" 
                          onclick="mailCopySingle('${escapeJs(res.activeEmail)}'); event.stopPropagation();" 
                          title="Adresse kopieren"></i>`;
      emailHtml = `
        <div class="d-flex align-items-center">
          <span class="font-monospace text-dark fw-medium" style="font-size: 0.85rem;">${escapeHtml(res.activeEmail)}</span>
          ${copyBtn}
        </div>`;
      if (res.isFallback) {
        emailHtml += `<div class="small text-warning" style="font-size: 0.72rem;"><i class="fas fa-info-circle me-1"></i>Zweitadresse (Hauptadresse fehlt)</div>`;
      } else if (res.hasAdditional && res.additional !== res.primary) {
        emailHtml += `<div class="small text-muted font-monospace" style="font-size: 0.72rem;">+ ${escapeHtml(res.additional)}</div>`;
      }
    } else {
      emailHtml = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle py-1 px-2 fw-semibold" style="font-size:0.72rem;"><i class="fas fa-times-circle me-1"></i>Keine E-Mail</span>`;
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

    const rowBg = !res.hasEmail ? 'background-color: rgba(220, 53, 69, 0.03);' : (isSelected ? 'background-color: rgba(15, 58, 93, 0.02);' : '');

    return `
      <tr style="${rowBg}" class="cursor-pointer" onclick="mailRowClick('${pn}', event)">
        <td class="text-center align-middle" style="width: 44px;" onclick="event.stopPropagation()">
          <input type="checkbox" class="form-check-input mt-0" 
                 id="chk-recipient-${pn}" 
                 ${isSelected ? 'checked' : ''} 
                 ${!res.hasEmail ? 'disabled' : ''} 
                 onchange="mailToggleSingleRecipient('${pn}', this.checked)">
        </td>
        <td class="align-middle fw-medium text-dark text-nowrap" style="width: 25%;">
          ${lastName}, ${firstName}
        </td>
        <td class="align-middle" style="width: 40%;">
          ${emailHtml}
        </td>
        <td class="align-middle" style="width: 30%;">
          ${katHtml}
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive border rounded-3 bg-white" style="min-height: 250px; max-height: 480px; overflow-y: auto;">
      <table class="table table-hover table-sm mb-0 align-middle" id="mail-recipients-table" style="font-size: 0.88rem;">
        <thead class="table-light sticky-top shadow-sm" style="z-index: 2;">
          <tr>
            <th class="text-center align-middle py-2.5" style="width: 44px;">
              <input type="checkbox" class="form-check-input mt-0" id="mail-master-check" onchange="mailToggleAllVisible(this.checked)" title="Alle sichtbaren an-/abwählen">
            </th>
            ${sortHeader('ln', 'Name, Vorname', 'width: 25%;')}
            ${sortHeader('email', 'E-Mail-Adresse', 'width: 40%;')}
            ${sortHeader('kat', 'Kategorie &amp; Funktion', 'width: 30%;')}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;

  _mailUpdateMasterCheckboxState();

  // TableKit Resizable aktivieren
  if (window.TableKit && typeof window.TableKit.makeResizable === 'function') {
    try {
      window.TableKit.makeResizable('#mail-recipients-table', {
        storageKey: 'portal_mail_recipients_col_widths',
        minWidth: 44,
        columns: {
          0: { resizable: false, minWidth: 44, defaultWidth: 44 }
        }
      });
    } catch (e) {
      // Leise abfangen falls TableKit Options abweichen
    }
  }
}

function mailRowClick(pn, evt) {
  // Wenn Klick auf Link oder Checkbox kam, nicht doppelt toggeln
  if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'BUTTON' || evt.target.tagName === 'I') return;
  const cb = document.getElementById(`chk-recipient-${pn}`);
  if (cb && !cb.disabled) {
    cb.checked = !cb.checked;
    mailToggleSingleRecipient(pn, cb.checked);
  }
}

function mailSort(col) {
  if (window._mailSortCol === col) {
    window._mailSortDir *= -1;
  } else {
    window._mailSortCol = col;
    window._mailSortDir = 1;
  }
  _mailRenderPreview();
}

function _getKatLabel(m) {
  if (m._kategorien && m._kategorien.length > 0) return m._kategorien.join(', ');
  return m._kategorie || '–';
}

function _mailGetTrenner() {
  const ua  = navigator.userAgent;
  const isIOS     = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMac     = /Macintosh/i.test(ua) && !isIOS;
  return (isIOS || isAndroid || isMac) ? ',' : ';';
}

// ============================================================
// EXPORT & AKTIONEN
// ============================================================
function _mailGetEffectiveEmails() {
  const candidates = _mailGetActiveCandidates();
  const selectedMembers = candidates.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || '')));
  
  const rawList = selectedMembers
    .map(m => _getEmail(m))
    .filter(Boolean);

  // Deduplizieren (lowercase), aber Original-Schreibweise erhalten
  const seen = new Set();
  const deduped = [];
  rawList.forEach(email => {
    const clean = email.trim();
    const low = clean.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      deduped.push(clean);
    }
  });

  return deduped;
}

function mailKopieren() {
  const emails = _mailGetEffectiveEmails();
  if (!emails.length) {
    alert('Keine gültigen E-Mail-Adressen in der aktuellen Auswahl vorhanden.');
    return;
  }

  // Für Windows/Outlook/BCC immer Semikolon + Leerzeichen
  const payload = emails.join('; ');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payload).then(() => {
      const el = document.getElementById('mail-copy-success');
      if (el) {
        el.innerHTML = `<i class="fas fa-check-circle fs-5 me-2"></i> <strong>${emails.length} E-Mail-Adresse(n)</strong> erfolgreich in die Zwischenablage kopiert!`;
        el.classList.remove('d-none');
        setTimeout(() => el.classList.add('d-none'), 3500);
      }
      if (typeof showSuccess === 'function') {
        showSuccess(`${emails.length} Adressen kopiert`);
      }
    }).catch(() => {
      prompt('Adressen kopieren (Strg+C):', payload);
    });
  } else {
    prompt('Adressen kopieren (Strg+C):', payload);
  }
}

function mailCopySingle(email, evt) {
  if (evt) evt.stopPropagation();
  if (!email) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).then(() => {
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
    });
  } else {
    prompt('Adresse kopieren (Strg+C):', email);
  }
}

function mailOpenMailto() {
  const emails = _mailGetEffectiveEmails();
  if (!emails.length) return;

  if (emails.length > 30) {
    alert('Zu viele Empfänger (> 30) für einen Mailto-Aufruf. Bitte kopiere die Adressen in die Zwischenablage.');
    return;
  }

  const trenner = _mailGetTrenner();
  const bcc = emails.join(trenner);
  const a = document.createElement('a');
  a.href = 'mailto:?bcc=' + encodeURIComponent(bcc);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

function mailCSV() {
  const candidates = _mailGetActiveCandidates();
  const selectedMembers = candidates.filter(m => _mailSelected.has(String(m.PersonNumber || m.person_number || '')));
  if (!selectedMembers.length) {
    alert('Bitte wähle mindestens ein Mitglied aus.');
    return;
  }

  const lines = ['"Personennummer";"Nachname";"Vorname";"E-Mail";"Zweitadresse";"Kategorie";"Vorstand"'];
  selectedMembers.forEach(m => {
    const res = _mailResolveEmail(m);
    const kat = _getKatLabel(m);
    const isVo = m._istVorstand ? 'Ja' : 'Nein';
    const pn = m.PersonNumber || m.person_number || '';
    lines.push(
      `"${pn}";` +
      `"${(m.LastName || m.last_name || '').replace(/"/g, '""')}";` +
      `"${(m.FirstName || m.first_name || '').replace(/"/g, '""')}";` +
      `"${res.activeEmail.replace(/"/g, '""')}";` +
      `"${res.additional.replace(/"/g, '""')}";` +
      `"${kat.replace(/"/g, '""')}";` +
      `"${isVo}"`
    );
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `muhen_mail_verteiler_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ============================================================
// MAIL-LOG (Versandprotokoll aus public.mail_logs / Supabase)
// ============================================================

let _mailLogData   = [];   // Rohdaten (alle geladenen Logs)
let _mailLogLoaded = false;

/**
 * Lädt die letzten 500 Einträge aus public.mail_logs und rendert die Tabelle.
 * @param {boolean} force – true = Cache ignorieren
 */
async function loadMailLogData(force = false) {
  if (_mailLogLoaded && !force) { filterMailLog(); return; }

  const container = document.getElementById('mail-log-container');
  container.innerHTML = `
    <div class="text-center py-5 text-muted">
      <i class="fas fa-circle-notch fa-spin fa-2x mb-3"></i><br>Lade Versandprotokoll…
    </div>`;

  try {
    const sb = window.supabaseClient || (typeof supabase !== 'undefined' ? supabase : null);
    if (!sb) throw new Error('Supabase-Client nicht initialisiert.');

    const { data, error } = await sb
      .from('mail_logs')
      .select('id,module_ref,record_id,recipient_email,recipient_name,cc_email,subject,body_snippet,status,error_message,sender_name,has_pdf,sent_via,sent_at')
      .order('sent_at', { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    _mailLogData   = data || [];
    _mailLogLoaded = true;

    // Badge aktualisieren
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
        <strong>Fehler:</strong> ${e.message}
      </div>`;
  }
}

/** Filtert _mailLogData anhand der drei Filter-Controls und rendert die Tabelle. */
function filterMailLog() {
  const module = (document.getElementById('mail-log-filter-module')?.value || '').toLowerCase();
  const status = (document.getElementById('mail-log-filter-status')?.value || '').toLowerCase();
  const search = (document.getElementById('mail-log-search')?.value || '').toLowerCase();

  const filtered = _mailLogData.filter(r => {
    if (module && r.module_ref !== module) return false;
    if (status && r.status    !== status)  return false;
    if (search) {
      const hay = `${r.recipient_email} ${r.recipient_name || ''} ${r.subject}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  _renderMailLogTable(filtered);
}

/** Rendert die gefilterten Einträge als Bootstrap-Tabelle. */
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
    const modLabel    = _mailLogModuleLabel(r.module_ref);
    const sentAt      = r.sent_at ? new Date(r.sent_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '–';
    const pdfIcon     = r.has_pdf ? '<i class="fas fa-paperclip text-muted" title="PDF Anhang"></i>' : '';
    const subject     = escapeHtml(r.subject || '–');
    const recipient   = escapeHtml(r.recipient_email || '–');
    const name        = escapeHtml(r.recipient_name || '');

    return `
      <tr style="cursor:pointer" onclick="_showMailLogDetail('${r.id}')">
        <td class="align-middle text-nowrap text-muted small">${sentAt}</td>
        <td class="align-middle">${modLabel}</td>
        <td class="align-middle">
          <div class="fw-medium">${recipient}</div>
          ${name ? `<div class="text-muted small">${name}</div>` : ''}
        </td>
        <td class="align-middle" style="max-width:300px">
          <div class="text-truncate">${subject}</div>
          ${r.record_id ? `<span class="badge bg-light text-dark border small">${escapeHtml(r.record_id)}</span>` : ''}
        </td>
        <td class="align-middle text-center">${pdfIcon}</td>
        <td class="align-middle">${statusBadge}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="text-muted small mb-2">${rows.length} Einträge</div>
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle" style="font-size:0.875rem">
        <thead class="table-light">
          <tr>
            <th>Datum</th>
            <th>Modul</th>
            <th>Empfänger</th>
            <th>Betreff / Ref.</th>
            <th class="text-center"><i class="fas fa-paperclip" title="PDF"></i></th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;
}

/** Zeigt Detailansicht eines Log-Eintrags (Klick auf Zeile). */
function _showMailLogDetail(itemOrId) {
  let r = null;
  if (typeof itemOrId === 'string') {
    r = _mailLogData.find(x => x.id === itemOrId);
    if (!r) {
      try { r = JSON.parse(itemOrId); } catch (e) { r = null; }
    }
  } else if (itemOrId && typeof itemOrId === 'object') {
    r = itemOrId;
  }
  if (!r) return;

  const sentAt = r.sent_at ? new Date(r.sent_at).toLocaleString('de-CH') : '–';

  const rows = [
    ['Datum',       sentAt],
    ['Modul',       r.module_ref || '–'],
    ['Referenz-ID', r.record_id  || '–'],
    ['Empfänger',   r.recipient_email + (r.recipient_name ? ` (${r.recipient_name})` : '')],
    ['CC',          r.cc_email  || '–'],
    ['Betreff',     r.subject   || '–'],
    ['Status',      r.status    || '–'],
    ['Absender',    r.sender_name || '–'],
    ['Versandweg',  r.sent_via  || '–'],
    ['PDF-Anhang',  r.has_pdf ? '✅ Ja' : '–'],
    ['Vorschau',    r.body_snippet ? `<pre style="white-space:pre-wrap;font-size:0.8rem;max-height:200px;overflow:auto">${escapeHtml(r.body_snippet)}</pre>` : '–'],
    ...(r.error_message ? [['Fehlermeldung', `<span class="text-danger">${escapeHtml(r.error_message)}</span>`]] : [])
  ];

  const tableRows = rows.map(([k, v]) =>
    `<tr><th class="text-muted fw-normal" style="width:130px;white-space:nowrap">${k}</th><td>${v}</td></tr>`
  ).join('');

  // Modal dynamisch erzeugen oder wiederverwenden
  let modal = document.getElementById('mail-log-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mail-log-detail-modal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-envelope me-2"></i>Mail-Log Detail</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="mail-log-detail-body"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Schliessen</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('mail-log-detail-body').innerHTML =
    `<table class="table table-sm table-borderless">${tableRows}</table>`;

  new bootstrap.Modal(modal).show();
}

/** Gibt ein farbiges Badge für den Mail-Status zurück. */
function _mailLogStatusBadge(status) {
  const map = {
    'gesendet':  '<span class="badge bg-success">✅ Gesendet</span>',
    'fehler':    '<span class="badge bg-danger">❌ Fehler</span>',
    'simuliert': '<span class="badge bg-warning text-dark">🧪 Simuliert</span>',
  };
  return map[status] || `<span class="badge bg-secondary">${escapeHtml(status || '–')}</span>`;
}

/** Gibt ein Emoji-Label für das Herkunftsmodul zurück. */
function _mailLogModuleLabel(ref) {
  const map = {
    'rechnung':     '💶 Rechnung',
    'mietvertrag':  '🏠 Mietvertrag',
    'jahresbeitrag':'📋 Jahresbeitrag',
    'mahnung':      '⚠️ Mahnung',
    'anlasse':      '📅 Anlässe',
    'vermietung':   '🔑 Vermietung',
    'mitglieder':   '👥 Mitglieder',
    'sonstige':     '📁 Sonstige',
    'unbekannt':    '❓ Unbekannt',
  };
  return map[ref] || escapeHtml(ref || '–');
}

