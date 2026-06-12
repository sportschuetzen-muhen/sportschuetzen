// vorstand/js/jahresbeitrag/jahresbeitrag-schnellerfassung.js
// ============================================================
// TAB 2: ACCESS-STYLE SCHNELLERFASSUNG RENDER
// ============================================================
function renderSchnellerfassungTab() {
  return `
    <div class="row g-3 border rounded bg-white p-1" style="height: calc(100vh - 200px); overflow: hidden;">
      
      <!-- Linke Seitenleiste: Mitgliederliste -->
      <div class="col-md-3 border-end d-flex flex-column h-100 p-2 bg-light rounded-start">
        <div class="mb-2">
          <input type="text" class="form-control form-control-sm" id="jbEntrySearch" 
                 placeholder="🔍 Suchen (Name / ID)…" oninput="jbEntrySearchFilter(this.value)">
          <div class="text-muted small mt-1 px-1" style="font-size: 11px;">
            <i class="fas fa-info-circle me-1"></i> Tipp: Scrollen & Pfeiltasten wechseln Schütze
          </div>
        </div>

        <!-- Sortierung für Sidebar -->
        <div class="d-flex mb-2 bg-white p-0.5 rounded border" style="gap: 2px;">
          <button class="btn btn-xs flex-fill py-1 rounded transition border-0 fs-7 ${_jbSidebarSort === 'name' ? 'btn-primary text-white' : 'bg-transparent text-muted'}" 
                  onclick="jbSortSidebar('name')" style="font-size: 10px; padding: 2px;">ABC</button>
          <button class="btn btn-xs flex-fill py-1 rounded transition border-0 fs-7 ${_jbSidebarSort === 'status' ? 'btn-primary text-white' : 'bg-transparent text-muted'}" 
                  onclick="jbSortSidebar('status')" style="font-size: 10px; padding: 2px;">Status</button>
          <button class="btn btn-xs flex-fill py-1 rounded transition border-0 fs-7 ${_jbSidebarSort === 'modified' ? 'btn-primary text-white' : 'bg-transparent text-muted'}" 
                  onclick="jbSortSidebar('modified')" style="font-size: 10px; padding: 2px;">Geändert</button>
        </div>
        
        <!-- Bulk Save Container -->
        <div id="jbBulkSaveContainer" class="mb-2 d-none">
          <button class="btn btn-success btn-sm w-100 fw-bold py-2 shadow-sm" onclick="jbSaveAllBulkLocalChanges()">
            <i class="fas fa-cloud-upload-alt me-1"></i> <span id="jbBulkSaveCount">0</span> Änderungen speichern
          </button>
        </div>

        <div class="list-group flex-fill overflow-y-auto border rounded bg-white" id="jbEntryMemberList" style="max-height: calc(100% - 135px);">
          <!-- Dynamisch geladen -->
        </div>
      </div>

      <!-- Rechte Arbeitsfläche: Details & Erfassung -->
      <div class="col-md-9 h-100 overflow-y-auto p-3 d-flex flex-column" id="jbEntryWorkspace">
        <div class="text-center my-auto text-muted py-5">
          <i class="fas fa-users fa-3x mb-3 text-primary" style="opacity: 0.3;"></i>
          <h5>Wählen Sie ein Mitglied aus der linken Liste aus</h5>
          <p class="small">Nutzen Sie das Mausrad oder die Pfeiltasten zur schnellen Navigation.</p>
        </div>
      </div>

    </div>
  `;
}

// ============================================================
// SCHNELLERFASSUNG WORKSPACE CONTROLS & LOGIC
// ============================================================

// 1. Liste rendern
function jbRenderEntryList() {
  const listEl = document.getElementById('jbEntryMemberList');
  if (!listEl) return;

  const search = _jbEntrySearch.toLowerCase().trim();
  const filtered = _jbMembers.filter(m => {
    const name = `${m.FirstName || ''} ${m.LastName || ''} ${m.PersonNumber || ''}`.toLowerCase();
    return !search || name.includes(search);
  });

  listEl.innerHTML = filtered.map(m => {
    const activeClass = String(_jbSelectedMemberPN) === String(m.PersonNumber) ? 'active border-primary bg-primary text-white' : '';
    const statusText = m._istEhren ? '🏆 Ehren' : (m._istPassiv ? '💤 Passiv' : '🎯 Aktiv');
    const isModified = _jbLocalBulkChanges[String(m.PersonNumber)] !== undefined;
    const modifiedBadge = isModified ? `<span class="badge bg-warning text-dark ms-1" style="font-size: 9px;">Geändert</span>` : '';
    
    // Berechne Live-Total für die Sidebar
    const header = _jbData.find(x => String(x.PersonNumber).trim() === String(m.PersonNumber).trim());
    let liveTotal = header ? Number(header.Gesamt || 0) : 0;
    if (isModified) {
      const calc = jbCalculateLiveTotal(m, _jbLocalBulkChanges[String(m.PersonNumber)]);
      liveTotal = calc.total;
    }
    const totalText = `CHF ${liveTotal.toFixed(2)}`;

    let itemClass = 'list-group-item list-group-item-action py-2 px-3 border-bottom d-flex justify-content-between align-items-center';
    let itemStyle = 'outline: none; transition: var(--transition);';
    
    if (activeClass) {
      itemClass += ' active border-primary bg-primary text-white';
    } else if (isModified) {
      itemClass += ' border-start border-4 border-warning';
      itemStyle += ' background-color: #fffbeb;'; // Soft pastell yellow/orange background
    }

    return `
      <button class="${itemClass}" style="${itemStyle}" 
              onclick="jbEntrySelectMember('${m.PersonNumber}')">
        <div>
          <div class="fw-semibold" style="font-size: 13px;">${m.FirstName} ${m.LastName} ${modifiedBadge}</div>
          <div class="small text-muted" style="font-size: 11px; ${activeClass ? 'color: #cbd5e1 !important;' : ''}">
            ${m.PersonNumber} · <strong class="${activeClass ? 'text-white' : 'text-primary'}">${totalText}</strong>
          </div>
        </div>
        <span class="badge ${activeClass ? 'bg-white text-primary' : 'bg-secondary'} rounded-pill" style="font-size: 10px;">${statusText}</span>
      </button>
    `;
  }).join('');
}

// 2. Suche in der Seitenleiste
function jbEntrySearchFilter(val) {
  _jbEntrySearch = val;
  jbRenderRowsFilter();
}

// Debounce Filter
function jbRenderRowsFilter() {
  jbRenderEntryList();
}

// 3. Schütze auswählen & Initialisieren der Werte
async function jbEntrySelectMember(pn) {
  _jbSelectedMemberPN = pn;
  jbRenderEntryList();

  const workspace = document.getElementById('jbEntryWorkspace');
  workspace.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-2 text-muted">Lade Schützen-Details…</p>
    </div>`;

  try {
    const pnClean = String(pn || '').trim();
    const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
    if (!m) throw new Error("Schütze nicht gefunden");

    // Falls ungespeicherte Bulk-Änderungen vorhanden sind, diese direkt laden!
    if (_jbLocalBulkChanges[pnClean]) {
      _jbParticipationsState = { ..._jbLocalBulkChanges[pnClean] };
      jbRenderEntryForm(m);
      return;
    }

    // Initialisiere lokalen State für Radio-Buttons / Checkboxen
    const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
    const isJunior = age > 0 && age <= 20;
    const hatG50mOwn = (m._lizenzen || []).some(l => l.istMuhen && l.MembershipCategory.toLowerCase().includes('g50'));
    const defaultGe = !isJunior && hatG50mOwn && !m._istPassiv;

    _jbParticipationsState = {
      lizenz: m._istPassiv ? 'passiv' : 'verein', // Default
      kk_volksschiessen: 'keine',
      ssv_dez: 'keine',
      kk_grenzland: 'keine',
      kk_verband: false,
      kk_verein: false,
      lg_ag_dez: false,
      lg_ag_dez_auflage: false,
      lg_ch_dez: false,
      lg_ch_dez_auflage: false,
      lg_verband: false,
      lg_verein: false,
      lg_ch_kniend: false,
      schuetzenhaus: defaultGe
    };

    // Lizenz-Initialisierung anhand m._lizenzen
    const ownLiz = (m._lizenzen || []).find(l => l.istMuhen);
    if (ownLiz) {
      const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
      if (age > 0 && age <= 20) {
        _jbParticipationsState.lizenz = 'junior';
      } else {
        _jbParticipationsState.lizenz = 'verein';
      }
    } else if ((m._lizenzen || []).length > 0) {
      _jbParticipationsState.lizenz = 'fremd';
    } else if (m._istPassiv) {
      _jbParticipationsState.lizenz = 'passiv';
    } else {
      _jbParticipationsState.lizenz = 'keine';
    }

    // Teilnahmen in den State einpflegen
    const memberParts = _jbParticipationsCache[pnClean] || [];
    let hasKK002 = false;
    let hasKK003 = false;
    let hasKK004 = false;
    let hasKK005 = false;

    memberParts.forEach(p => {
      const val = Number(p.teilgenommen || 0);
      if (p.eventkey === 'GE001') {
        _jbParticipationsState.schuetzenhaus = val > 0;
      }
      if (val > 0) {
        // Event Key ermitteln und in State schreiben
        if (p.eventkey === 'KK001') _jbParticipationsState.kk_grenzland = '1';
        if (p.eventkey === 'KK002') hasKK002 = true;
        if (p.eventkey === 'KK003') hasKK003 = true;
        if (p.eventkey === 'KK004') hasKK004 = true;
        if (p.eventkey === 'KK005') hasKK005 = true;
        if (p.eventkey === 'KK006') _jbParticipationsState.kk_verband = true;
        if (p.eventkey === 'KK007') _jbParticipationsState.kk_verein = true;   // KK007 = Vereinsschiessen
        if (p.eventkey === 'KK008') _jbParticipationsState.kk_volksschiessen = String(val); // KK008 = Volksschiessen
        
        // 10m
        if (p.eventkey === 'LG001') _jbParticipationsState.lg_ag_dez = true;
        if (p.eventkey === 'LG002') _jbParticipationsState.lg_ag_dez_auflage = true;
        if (p.eventkey === 'LG003') _jbParticipationsState.lg_ch_dez = true;
        if (p.eventkey === 'LG004') _jbParticipationsState.lg_ch_dez_auflage = true;
        if (p.eventkey === 'LG005') _jbParticipationsState.lg_verband = true;
        if (p.eventkey === 'LG006') _jbParticipationsState.lg_verein = true;
        if (p.eventkey === 'LG007') _jbParticipationsState.lg_ch_kniend = true;
      }
    });

    if (hasKK005) {
      _jbParticipationsState.ssv_dez = 'sv';
    } else if (isJunior && (hasKK002 || hasKK003 || hasKK004)) {
      _jbParticipationsState.ssv_dez = 'js';
    } else if (hasKK002 && hasKK003 && hasKK004) {
      _jbParticipationsState.ssv_dez = 'liegend_2_3';
    } else if (hasKK002) {
      _jbParticipationsState.ssv_dez = 'liegend';
    } else if (hasKK003) {
      _jbParticipationsState.ssv_dez = '2-stellung';
    } else if (hasKK004) {
      _jbParticipationsState.ssv_dez = '3-stellung';
    }

    jbRenderEntryForm(m);
  } catch(e) {
    workspace.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  }
}

// 4. Formular für den aktiven Schützen rendern
function jbRenderEntryForm(m) {
  const workspace = document.getElementById('jbEntryWorkspace');
  if (!workspace) return;

  // Live-Berechnung der Summen
  const calc = jbCalculateLiveTotal(m, _jbParticipationsState);

  const isJunior = m.BirthDate ? ((new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) <= 20) : false;

  const positionsHTML = calc.positions.map(p => `
    <div class="d-flex justify-content-between align-items-center py-1 border-bottom" style="font-size: 12px;">
      <span class="text-muted">${p.name}</span>
      <span class="fw-bold ${p.typ === 'Kredit' ? 'text-success' : 'text-dark'}">
        ${p.typ === 'Kredit' ? '-' : ''}CHF ${Math.abs(p.betrag).toFixed(2)}
      </span>
    </div>
  `).join('');

  workspace.innerHTML = `
    <div class="row g-4 h-100 flex-fill">
      
      <!-- LINKE SPALTE: Live-Kostenübersicht -->
      <div class="col-md-5 d-flex flex-column">
        <div class="card p-3 shadow-sm border-0 bg-light flex-fill d-flex flex-column rounded-3" style="background: rgba(243, 244, 246, 0.6); backdrop-filter: blur(10px);">
          <div class="mb-3 border-bottom pb-2">
            <h5 class="mb-0 text-primary">${m.FirstName} ${m.LastName}</h5>
            <small class="text-muted">${m.PersonNumber} · ${isJunior ? '👦 Junior' : '👤 Erwachsen'}</small>
          </div>

          <div class="flex-fill overflow-y-auto mb-3" style="max-height: calc(100vh - 430px);">
            <div class="fw-bold text-muted small mb-2 text-uppercase" style="font-size: 10px; letter-spacing: 1px;">Postenübersicht</div>
            ${positionsHTML}
          </div>

          <!-- Total Highlight Box -->
          <div class="p-3 bg-white border border-primary rounded-3 text-center shadow-sm mt-auto">
            <div class="small text-muted fw-semibold">Berechneter Gesamtbetrag</div>
            <div class="fs-2 fw-extrabold text-primary" id="jbLiveTotal">CHF ${calc.total.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <!-- RECHTE SPALTE: Auswahlelemente -->
      <div class="col-md-7 d-flex flex-column overflow-y-auto pr-1" style="max-height: calc(100vh - 210px);">
        
        <!-- 1. Lizenz & Status -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <h6 class="text-secondary fw-bold mb-2" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-id-card me-2"></i>Lizenz & Status</h6>
          <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                    onclick="jbUpdateState('lizenz', 'keine', '${m.PersonNumber}')">Keine (Fremd)</button>
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'verein' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                    onclick="jbUpdateState('lizenz', 'verein', '${m.PersonNumber}')">Eigener JB</button>
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'junior' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                    onclick="jbUpdateState('lizenz', 'junior', '${m.PersonNumber}')">Jungschütze</button>
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'passiv' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                    onclick="jbUpdateState('lizenz', 'passiv', '${m.PersonNumber}')">Passiv</button>
          </div>
        </div>

        <!-- Schützenhaus Infrastrukturbeitrag -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <h6 class="text-secondary fw-bold mb-2" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-home me-2 text-success"></i>Infrastrukturbeitrag Schützenhaus</h6>
          <div class="d-flex align-items-center justify-content-between bg-light p-2 rounded-2 border">
            <span class="small fw-semibold text-muted">Schützenhaus-Beitrag (CHF 50.00)</span>
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" id="entry_schuetzenhaus" ${
                _jbParticipationsState.schuetzenhaus ? 'checked' : ''
              } onchange="jbConfirmEntrySchuetzenhaus(this, '${m.PersonNumber}')">
            </div>
          </div>
        </div>

        <!-- 2. Kleinkaliber (50m) -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <h6 class="text-secondary fw-bold mb-3" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-bullseye me-2 text-danger"></i>50m Wettschiessen (KK)</h6>
          
          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">KK Volksschiessen (KK008)</label>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('kk_volksschiessen', 'keine', '${m.PersonNumber}')">Kein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === '1' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('kk_volksschiessen', '1', '${m.PersonNumber}')">1 Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === '2' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('kk_volksschiessen', '2', '${m.PersonNumber}')">2 Stiche</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === '3' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('kk_volksschiessen', '3', '${m.PersonNumber}')">3 Stiche</button>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">SSV dez (KK002/003/004/005)</label>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('ssv_dez', 'keine', '${m.PersonNumber}')">Kein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'liegend' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('ssv_dez', 'liegend', '${m.PersonNumber}')">Liegend</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === '2-stellung' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('ssv_dez', '2-stellung', '${m.PersonNumber}')">2-Stellung</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === '3-stellung' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('ssv_dez', '3-stellung', '${m.PersonNumber}')">3-Stellung</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'liegend_2_3' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('ssv_dez', 'liegend_2_3', '${m.PersonNumber}')">L+2+3 St.</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'js' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('ssv_dez', 'js', '${m.PersonNumber}')">JS Stich</button>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">KK Grenzland (KK001)</label>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_grenzland === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('kk_grenzland', 'keine', '${m.PersonNumber}')">Kein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_grenzland === '1' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('kk_grenzland', '1', '${m.PersonNumber}')">Ein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_grenzland === 'js' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateState('kk_grenzland', 'js', '${m.PersonNumber}')">JS Stich</button>
            </div>
          </div>

          <div class="row g-2">
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">50m Verbandsschiessen</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.kk_verband ? 'checked' : ''} 
                       onchange="jbUpdateState('kk_verband', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">50m Vereinsschiessen</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.kk_verein ? 'checked' : ''} 
                       onchange="jbUpdateState('kk_verein', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
          </div>
        </div>

        <!-- 3. Luftgewehr (10m) & Sonstiges -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <h6 class="text-secondary fw-bold mb-3" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-bullseye me-2 text-primary"></i>10m Wettschiessen (LG)</h6>
          
          <div class="row g-2">
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">10m AG DEZ</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.lg_ag_dez ? 'checked' : ''} 
                       onchange="jbUpdateState('lg_ag_dez', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">10m AG DEZ Auflage</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.lg_ag_dez_auflage ? 'checked' : ''} 
                       onchange="jbUpdateState('lg_ag_dez_auflage', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">10m CH DEZ</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.lg_ch_dez ? 'checked' : ''} 
                       onchange="jbUpdateState('lg_ch_dez', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">10m CH DEZ Auflage</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.lg_ch_dez_auflage ? 'checked' : ''} 
                       onchange="jbUpdateState('lg_ch_dez_auflage', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">10m Verbandsschiessen</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.lg_verband ? 'checked' : ''} 
                       onchange="jbUpdateState('lg_verband', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">10m Vereinsschiessen</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.lg_verein ? 'checked' : ''} 
                       onchange="jbUpdateState('lg_verein', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
            <div class="col-12">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
                <span class="small fw-semibold text-muted">10m CH Kniendmeisterschaft</span>
                <input type="checkbox" class="form-check-input" ${_jbParticipationsState.lg_ch_kniend ? 'checked' : ''} 
                       onchange="jbUpdateState('lg_ch_kniend', this.checked, '${m.PersonNumber}')">
              </label>
            </div>
          </div>
        </div>

        <!-- 4. Speichern & Aktionen -->
        <div class="d-flex gap-2 mt-auto pt-2">
          <button class="btn btn-outline-danger" onclick="jbEntryResetForm('${m.PersonNumber}')">
            <i class="fas fa-trash-alt me-1"></i> Zurücksetzen
          </button>
          <button class="btn btn-success flex-fill py-2 fw-bold shadow-sm" onclick="jbEntrySaveAndNext('${m.PersonNumber}')">
            <i class="fas fa-save me-1"></i> Speichern & Weiter (Nächster Schütze)
          </button>
        </div>

      </div>

    </div>
  `;
}

function jbConfirmEntrySchuetzenhaus(chk, pn) {
  const currentVal = chk.checked;
  const prevVal = !currentVal;
  
  if (confirm("Möchten Sie den Infrastrukturbeitrag Schützenhaus für dieses Mitglied wirklich manuell ändern?")) {
    jbUpdateState('schuetzenhaus', currentVal, pn);
  } else {
    chk.checked = prevVal;
  }
}

// 5. State live aktualisieren
function jbUpdateState(key, val, pn) {
  const pnClean = String(pn || '').trim();
  _jbParticipationsState[key] = val;
  
  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean][key] = val;

  jbUpdateBulkSaveButton();
  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbRenderEntryForm(m);
  }
}

// 6. Formular-Reset
function jbEntryResetForm(pn) {
  const pnClean = String(pn || '').trim();
  
  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  const age = m && m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;
  const hatG50mOwn = m && (m._lizenzen || []).some(l => l.istMuhen && l.MembershipCategory.toLowerCase().includes('g50'));
  const defaultGe = m ? (!isJunior && hatG50mOwn && !m._istPassiv) : false;

  _jbParticipationsState = {
    lizenz: 'keine',
    kk_volksschiessen: 'keine',
    ssv_dez: 'keine',
    kk_grenzland: 'keine',
    kk_verband: false,
    kk_verein: false,
    lg_ag_dez: false,
    lg_ag_dez_auflage: false,
    lg_ch_dez: false,
    lg_ch_dez_auflage: false,
    lg_verband: false,
    lg_verein: false,
    lg_ch_kniend: false,
    schuetzenhaus: defaultGe
  };

  _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  jbUpdateBulkSaveButton();
  jbRenderEntryList();

  if (m) {
    jbRenderEntryForm(m);
  }
}

// 7. Zwischenspeichern & Automatisch zum nächsten Schützen springen
function jbEntrySaveAndNext(pn) {
  const pnClean = String(pn || '').trim();
  
  _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  
  jbUpdateBulkSaveButton();
  jbRenderEntryList();
  
  showToast(`💾 Änderungen für ${pnClean} im Browser zwischengespeichert!`);

  jbEntrySelectNext();
}

function jbEntrySelectNext() {
  const currentIdx = _jbMembers.findIndex(m => String(m.PersonNumber || '').trim() === String(_jbSelectedMemberPN || '').trim());
  if (currentIdx >= 0 && currentIdx < _jbMembers.length - 1) {
    const nextPn = _jbMembers[currentIdx + 1].PersonNumber;
    jbEntrySelectMember(nextPn);
    jbScrollToActiveMember();
  } else {
    showToast("🎉 Letzter Schütze in der Liste erreicht!");
  }
}

function jbEntrySelectPrev() {
  const currentIdx = _jbMembers.findIndex(m => String(m.PersonNumber || '').trim() === String(_jbSelectedMemberPN || '').trim());
  if (currentIdx > 0) {
    const prevPn = _jbMembers[currentIdx - 1].PersonNumber;
    jbEntrySelectMember(prevPn);
    jbScrollToActiveMember();
  }
}

function jbScrollToActiveMember() {
  const listEl = document.getElementById('jbEntryMemberList');
  if (!listEl) return;
  setTimeout(() => {
    const activeItem = listEl.querySelector('.active');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 100);
}

function jbUpdateBulkSaveButton() {
  const container = document.getElementById('jbBulkSaveContainer');
  const countSpan = document.getElementById('jbBulkSaveCount');
  if (!container) return;

  const count = Object.keys(_jbLocalBulkChanges).length;
  if (count > 0) {
    container.classList.remove('d-none');
    if (countSpan) countSpan.textContent = count;
  } else {
    container.classList.add('d-none');
  }
}

async function jbSaveAllBulkLocalChanges() {
  const count = Object.keys(_jbLocalBulkChanges).length;
  if (count === 0) return;

  const btn = document.querySelector('#jbBulkSaveContainer button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Speichere ' + count + ' Schützen…';
  }

  try {
    showLoadingOverlay(`Speichere Änderungen für ${count} Schützen und berechne Beiträge neu…`);
    const list = [];
    const year = _jbYear;
    const editedPNs = Object.keys(_jbLocalBulkChanges);
    const licenses = Object.entries(_jbLocalBulkChanges).map(([pn, state]) => ({ pn, lizenz: state.lizenz }));

    Object.entries(_jbLocalBulkChanges).forEach(([pn, state]) => {
      list.push({ pn, year, eventkey: 'GE001', teilgenommen: state.schuetzenhaus ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK008', teilgenommen: state.kk_volksschiessen === 'keine' ? 0 : Number(state.kk_volksschiessen), quelle: 'volksschiessen' });
      list.push({ pn, year, eventkey: 'KK007', teilgenommen: state.kk_verein ? 1 : 0, quelle: 'verein' });
      
      const ssv = state.ssv_dez;
      list.push({ pn, year, eventkey: 'KK002', teilgenommen: (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK003', teilgenommen: (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK004', teilgenommen: (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK005', teilgenommen: ssv === 'sv' ? 1 : 0 });
      
      list.push({ pn, year, eventkey: 'KK001', teilgenommen: state.kk_grenzland !== 'keine' ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK006', teilgenommen: state.kk_verband ? 1 : 0 });

      list.push({ pn, year, eventkey: 'LG001', teilgenommen: state.lg_ag_dez ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG002', teilgenommen: state.lg_ag_dez_auflage ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG003', teilgenommen: state.lg_ch_dez ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG004', teilgenommen: state.lg_ch_dez_auflage ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG005', teilgenommen: state.lg_verband ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG006', teilgenommen: state.lg_verein ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG007', teilgenommen: state.lg_ch_kniend ? 1 : 0 });
    });

    const resSave = await apiFetch('jahresbeitrag', '', {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveParticipationsBulk',
        list: list,
        licenses: licenses,
        user: window.currentUser || 'frontend'
      })
    });
    const saveJson = await resSave.json();
    if (!saveJson.success) throw new Error(saveJson.error);

    const resCalc = await apiFetch('jahresbeitrag', `action=berechnen&year=${year}&pn=${editedPNs.join(',')}`);
    const calcJson = await resCalc.json();
    if (!calcJson.success) throw new Error(calcJson.error);

    showToast(`🎉 ${count} Schützen erfolgreich gespeichert und Beiträge neu berechnet!`);
    
    _jbLocalBulkChanges = {};
    jbUpdateBulkSaveButton();
    await loadJahresbeitragData(true, false);
    
    // Automatisch verknüpfte Rechnungen synchronisieren
    for (const pn of editedPNs) {
      const cleanPn = pn.trim();
      const updatedHeader = _jbData.find(x => String(x.PersonNumber).trim() === cleanPn);
      if (updatedHeader && updatedHeader.invoiceId) {
        const updatedM = _jbMemberMap[cleanPn] || {};
        const updatedName = updatedM.FirstName ? `${updatedM.FirstName} ${updatedM.LastName}` : cleanPn;
        try {
          console.log(`🤖 Synchronisiere Rechnung für ${cleanPn} nach Bulk-Änderung...`);
          if (typeof ensureInvoiceCreatedRemote === 'function') {
            await ensureInvoiceCreatedRemote(updatedHeader, updatedM, updatedName);
          }
        } catch (err) {
          console.error(`⚠️ Fehler bei automatischer Rechnungs-Aktualisierung für ${cleanPn}:`, err);
        }
      }
    }

    // Rechnungen-Modul zwingen, die Daten neu zu laden
    if (typeof loadRechnungenData === 'function') {
      await loadRechnungenData(true, true);
    }

    // Re-merge invoices into Jahresbeitrag data
    if (typeof jbMergeInvoicesIntoData === 'function') {
      jbMergeInvoicesIntoData(window._jbAllInvoices || []);
    }

    // Automatisch zurück zur Beitrags-Übersicht wechseln
    _jbActiveTab = 'overview';
    renderJahresbeitragView();
  } catch(e) {
    alert("Fehler beim Bulk-Speichern: " + e.message);
  } finally {
    hideLoadingOverlay();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> ' + count + ' Änderungen speichern';
    }
  }
}

// 8. TASTENSTEUERUNG UND MAUSRAD-SUPPORT
function jbAddScrollSupport() {
  const listEl = document.getElementById('jbEntryMemberList');
  if (!listEl) return;

  listEl.addEventListener('wheel', function(e) {
    e.preventDefault();
    if (e.deltaY > 0) {
      jbEntrySelectNext();
    } else {
      jbEntrySelectPrev();
    }
  });

  document.onkeydown = function(e) {
    if (_jbActiveTab !== 'entry' || !_jbSelectedMemberPN) return;
    
    if (document.activeElement.tagName === 'INPUT') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      jbEntrySelectNext();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      jbEntrySelectPrev();
    }
  };
}

function jbApplySidebarSorting() {
  _jbMembers.sort((a, b) => {
    if (_jbSidebarSort === 'modified') {
      const isModA = _jbLocalBulkChanges[String(a.PersonNumber)] !== undefined ? 1 : 0;
      const isModB = _jbLocalBulkChanges[String(b.PersonNumber)] !== undefined ? 1 : 0;
      if (isModA !== isModB) {
        return isModB - isModA;
      }
    }

    if (_jbSidebarSort === 'status') {
      const statA = a._istEhren ? 1 : (a._istPassiv ? 3 : 2);
      const statB = b._istEhren ? 1 : (b._istPassiv ? 3 : 2);
      if (statA !== statB) {
        return statA - statB;
      }
    }

    const nameA = `${a.LastName || ''} ${a.FirstName || ''}`.toLowerCase();
    const nameB = `${b.LastName || ''} ${b.FirstName || ''}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function jbSortSidebar(col) {
  _jbSidebarSort = col;
  jbApplySidebarSorting();
  jbRenderEntryList();
}
