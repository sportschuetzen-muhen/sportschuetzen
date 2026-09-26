// vorstand/js/jahresbeitrag/jahresbeitrag-schnellerfassung.js
// ============================================================
// TAB 2: ACCESS-STYLE SCHNELLERFASSUNG RENDER
// ============================================================
function jbGetDefaultAccountForExtra(key, fallback) {
  const g = (window._jbGebuehren || []).find(x => {
    const k = String(x.key || '').trim().toUpperCase();
    return k === key || k === key.replace(/^Z0*/, 'Z');
  });
  if (g) {
    const k = String(g['Haben-Konto-Jahresbeitrag-Buchhaltung'] || g['Vorgeschlagenes Haben-Konto'] || g.konto_haben || g.konto || '').trim();
    if (k) return k;
  }
  return fallback;
}

function renderSchnellerfassungTab() {
  return `
    <div class="row g-3 border rounded bg-white p-2" style="min-height: calc(100vh - 215px);">
      
      <!-- Linke Seitenleiste: Mitgliederliste -->
      <div class="col-md-3 border-end d-flex flex-column p-2 bg-light rounded-start" style="height: calc(100vh - 225px); min-height: 520px; position: sticky; top: 10px;">
        <div class="mb-2">
          <input type="text" class="form-control form-control-sm" id="jbEntrySearch" 
                 placeholder="🔍 Suchen (Name / ID)…" oninput="jbEntrySearchFilter(this.value)" onkeydown="jbHandleSidebarKeyDown(event)">
          <div class="text-muted small mt-1 px-1" style="font-size: 11px;">
            <i class="fas fa-keyboard me-1"></i> Tipp: Pfeiltasten (▲/▼) wechseln Schütze
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
        
        <!-- Auto-Save Status Container -->
        <div id="jbAutoSaveStatus" class="mb-2 text-center py-1.5 px-2 bg-light border rounded text-muted small" style="font-size: 11px;">
          <i class="fas fa-shield-alt text-success me-1"></i>Auto-Save aktiv
        </div>

        <div class="list-group flex-fill overflow-y-auto border rounded bg-white" id="jbEntryMemberList">
          <!-- Dynamisch geladen -->
        </div>
      </div>

      <!-- Rechte Arbeitsfläche: Details & Erfassung -->
      <div class="col-md-9 p-3 d-flex flex-column" id="jbEntryWorkspace" style="min-height: calc(100vh - 225px);">
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
  const savedScroll = listEl.scrollTop;

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

  if (savedScroll > 0) {
    listEl.scrollTop = savedScroll;
  }
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
      if (!_jbParticipationsState.events) _jbParticipationsState.events = {};
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
      events: {},
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
      const k = String(p.eventkey || '').trim().toUpperCase();
      if (k) {
        _jbParticipationsState.events[k] = val;
      }
      if (k === 'GE001') {
        _jbParticipationsState.schuetzenhaus = val > 0;
      }
      if (val > 0) {
        // Event Key ermitteln und in State schreiben
        if (k === 'KK001') _jbParticipationsState.kk_grenzland = '1';
        if (k === 'KK002') hasKK002 = true;
        if (k === 'KK003') hasKK003 = true;
        if (k === 'KK004') hasKK004 = true;
        if (k === 'KK005') hasKK005 = true;
        if (k === 'KK006') _jbParticipationsState.kk_verband = true;
        if (k === 'KK007') _jbParticipationsState.kk_verein = true;   // KK007 = Vereinsschiessen
        if (k === 'KK008') _jbParticipationsState.kk_volksschiessen = String(val); // KK008 = Volksschiessen
        
        // 10m
        if (k === 'LG001') _jbParticipationsState.lg_ag_dez = true;
        if (k === 'LG002') _jbParticipationsState.lg_ag_dez_auflage = true;
        if (k === 'LG003') _jbParticipationsState.lg_ch_dez = true;
        if (k === 'LG004') _jbParticipationsState.lg_ch_dez_auflage = true;
        if (k === 'LG005') _jbParticipationsState.lg_verband = true;
        if (k === 'LG006') _jbParticipationsState.lg_verein = true;
        if (k === 'LG007') _jbParticipationsState.lg_ch_kniend = true;
      }
    });

    if (_jbParticipationsState.events['GE001'] === undefined) {
      _jbParticipationsState.events['GE001'] = defaultGe ? 1 : 0;
    }

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

// ============================================================
// DYNAMIC FEE ENGINE & SCHEMA HELPERS
// ============================================================
function jbGetEffectiveFeeItems() {
  const fees = window._jbGebuehren || [];
  
  // Standard-Fallbacks für historisch bestehende Keys ohne explizite UI-Spalten
  const legacyDefaults = {
    'GE001': { ui_gruppe: 'Infrastruktur', ui_feld: 'Schützenhaus-Beitrag', ui_typ: 'checkbox', ui_sort: 10 },
    'KK008': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'KK Volksschiessen', ui_typ: 'counter', ui_sort: 10 },
    'KK002': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 20 },
    'KK003': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 21 },
    'KK004': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 22 },
    'KK005': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 23 },
    'KK001': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'KK Grenzland', ui_typ: 'checkbox', ui_sort: 30 },
    'KK006': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: '50m Verbandsschiessen', ui_typ: 'checkbox', ui_sort: 40 },
    'KK007': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: '50m Vereinsschiessen', ui_typ: 'checkbox', ui_sort: 50 },
    'LG001': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m AG DEZ', ui_typ: 'checkbox', ui_sort: 10 },
    'LG002': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m AG DEZ Auflage', ui_typ: 'checkbox', ui_sort: 20 },
    'LG003': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m CH DEZ', ui_typ: 'checkbox', ui_sort: 30 },
    'LG004': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m CH DEZ Auflage', ui_typ: 'checkbox', ui_sort: 40 },
    'LG005': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m Verbandsschiessen', ui_typ: 'checkbox', ui_sort: 50 },
    'LG006': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m Vereinsschiessen', ui_typ: 'checkbox', ui_sort: 60 },
    'LG007': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m CH Kniendmeisterschaft', ui_typ: 'checkbox', ui_sort: 70 },
    'Z001':  { ui_gruppe: 'Variable Zusatzpositionen', ui_feld: 'Beitrag Vereinsjacke', ui_typ: 'amount', ui_sort: 10 },
    'Z002':  { ui_gruppe: 'Variable Zusatzpositionen', ui_feld: 'Beitrag Eidg. Schützenfest', ui_typ: 'amount', ui_sort: 20 }
  };

  return fees.map(f => {
    const key = String(f.key || '').trim().toUpperCase();
    const d = legacyDefaults[key] || {};
    
    // Check if aktiv is set (default to true if missing/empty)
    const aktiv = f.aktiv !== false && f.aktiv !== 'false' && f.aktiv !== 0 && f.aktiv !== '0';

    let gruppe = (f.ui_gruppe && String(f.ui_gruppe).trim()) || d.ui_gruppe || '';
    if (!gruppe) {
      if (key.startsWith('KK')) gruppe = '50m Wettschiessen (KK)';
      else if (key.startsWith('LG')) gruppe = '10m Wettschiessen (LG)';
      else if (key.startsWith('Z')) gruppe = 'Variable Zusatzpositionen';
      else if (key === 'GE001') gruppe = 'Infrastruktur';
      else gruppe = f.kategorie || 'Sonstige Gebühren';
    }

    let typ = (f.ui_typ && String(f.ui_typ).trim().toLowerCase()) || d.ui_typ || 'checkbox';
    let feld = (f.ui_feld && String(f.ui_feld).trim()) || d.ui_feld || f.bezeichnungfrontend || f.bezeichnung || key;
    let sort = (f.ui_sort !== undefined && f.ui_sort !== null && f.ui_sort !== '') ? Number(f.ui_sort) : (d.ui_sort !== undefined ? d.ui_sort : 99);

    return {
      ...f,
      key,
      aktiv,
      ui_gruppe: gruppe,
      ui_typ: typ,
      ui_feld: feld,
      ui_sort: sort,
      betrag: Number(f.betrag || 0)
    };
  });
}

function jbRenderDynamicFeeGroupsHTML(m, state) {
  const feeItems = jbGetEffectiveFeeItems();
  const events = state.events || {};
  const age = m && m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;

  // Filtere nicht-aktive Gebühren sowie System-Gebühren (JB, LI, RA, GE001, amount/Zusatz)
  const displayItems = feeItems.filter(f => {
    if (!f.aktiv) return false;
    const key = f.key;
    if (key.startsWith('JB') || key.startsWith('LI') || key.startsWith('RA')) return false;
    if (key === 'GE001') return false; // eigenes Schützenhaus-Widget
    if (f.ui_typ === 'amount' || key.startsWith('Z')) return false; // eigene Zusatzpositionen-Card
    const kat = String(f.kategorie || '').toLowerCase();
    if (kat.includes('jahresbeitrag') || kat.includes('lizenz') || kat.includes('rabatt')) return false;

    // Variante A: Zielgruppen-Filter (Alle, Aktive, Junioren)
    const zg = String(f.zielgruppe || '').trim().toLowerCase();
    if (zg === 'junioren' && !isJunior) return false;
    if (zg === 'aktive' && isJunior) return false;

    return true;
  });

  // Gruppieren nach ui_gruppe
  const groups = {};
  displayItems.forEach(item => {
    const grp = item.ui_gruppe || 'Weitere Gebühren';
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(item);
  });

  let html = '';
  Object.entries(groups).forEach(([groupName, items]) => {
    // Sortieren nach ui_sort, dann key
    items.sort((a, b) => (a.ui_sort || 99) - (b.ui_sort || 99));

    // Icon anhand des Gruppennamens bestimmen
    let icon = 'fa-bullseye text-primary';
    const gLower = groupName.toLowerCase();
    if (gLower.includes('50m') || gLower.includes('kk')) icon = 'fa-bullseye text-danger';
    else if (gLower.includes('10m') || gLower.includes('lg')) icon = 'fa-bullseye text-primary';
    else if (gLower.includes('300m')) icon = 'fa-crosshairs text-success';
    else if (gLower.includes('pistole')) icon = 'fa-shield-alt text-warning';
    else icon = 'fa-trophy text-info';

    let bodyHtml = '';
    const renderedKeys = new Set();

    // Check for SSV Dezernat cluster
    const ssvKeys = ['KK002', 'KK003', 'KK004', 'KK005'];
    const hasSsvKeys = ssvKeys.some(k => items.some(it => it.key === k));

    items.forEach(item => {
      if (renderedKeys.has(item.key)) return;

      if (item.ui_typ === 'counter') {
        renderedKeys.add(item.key);
        const count = Number(events[item.key] || 0);
        bodyHtml += `
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label small fw-semibold text-muted mb-0">${escHtml(item.ui_feld || item.bezeichnungfrontend || item.key)} (${item.key})</label>
              <span class="badge bg-secondary" style="font-size: 10px;">CHF ${item.betrag.toFixed(2)} / Stk.</span>
            </div>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 0 ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 0, '${m.PersonNumber}')">Kein Stich</button>
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 1 ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 1, '${m.PersonNumber}')">1 Stich</button>
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 2 ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 2, '${m.PersonNumber}')">2 Stiche</button>
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 3 ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 3, '${m.PersonNumber}')">3 Stiche</button>
            </div>
          </div>
        `;
      } else if (item.ui_typ === 'singleselect') {
        const fieldName = item.ui_feld || 'Auswahl';
        const isSsvCluster = hasSsvKeys && (fieldName === 'SSV Dezernat' || ssvKeys.includes(item.key));
        
        let fieldItems = [];
        if (isSsvCluster) {
          fieldItems = items.filter(it => ssvKeys.includes(it.key));
        } else {
          fieldItems = items.filter(it => it.ui_typ === 'singleselect' && it.ui_feld === fieldName);
        }
        fieldItems.forEach(it => renderedKeys.add(it.key));

        const allKeys = fieldItems.map(it => it.key);
        const allKeysStr = allKeys.join(',');

        if (isSsvCluster) {
          const ssvVal = state.ssv_dez || (
            events['KK005'] ? 'sv' :
            (events['KK002'] && events['KK003'] && events['KK004']) ? 'liegend_2_3' :
            events['KK002'] ? 'liegend' :
            events['KK003'] ? '2-stellung' :
            events['KK004'] ? '3-stellung' : 'keine'
          );
          bodyHtml += `
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label small fw-semibold text-muted mb-0">SSV dez (KK002/003/004/005)</label>
                <span class="badge bg-secondary" style="font-size: 10px;">CHF ${item.betrag.toFixed(2)}</span>
              </div>
              <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('keine', '${allKeysStr}', '${m.PersonNumber}')">Kein Stich</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'liegend' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK002', '${allKeysStr}', '${m.PersonNumber}')">Liegend</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === '2-stellung' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK003', '${allKeysStr}', '${m.PersonNumber}')">2-Stellung</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === '3-stellung' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK004', '${allKeysStr}', '${m.PersonNumber}')">3-Stellung</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'liegend_2_3' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('liegend_2_3', '${allKeysStr}', '${m.PersonNumber}')">L+2+3 St.</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'sv' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK005', '${allKeysStr}', '${m.PersonNumber}')">SV Stich</button>
              </div>
            </div>
          `;
        } else {
          // Generische Einzelauswahl (Radio-Pills)
          const activeItem = fieldItems.find(it => Number(events[it.key] || 0) > 0);
          const activeKey = activeItem ? activeItem.key : 'keine';

          const buttonsHtml = fieldItems.map(it => {
            const isActive = activeKey === it.key;
            return `
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${isActive ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbSelectSingleSelectOption('${it.key}', '${allKeysStr}', '${m.PersonNumber}')"
                      title="${escHtml(it.bezeichnung || '')} (CHF ${it.betrag.toFixed(2)})">
                ${escHtml(it.bezeichnungfrontend || it.bezeichnung || it.key)}
              </button>
            `;
          }).join('');

          bodyHtml += `
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label small fw-semibold text-muted mb-0">${escHtml(fieldName)}</label>
                <span class="badge bg-secondary" style="font-size: 10px;">Einzelauswahl</span>
              </div>
              <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${activeKey === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('keine', '${allKeysStr}', '${m.PersonNumber}')">Keine</button>
                ${buttonsHtml}
              </div>
            </div>
          `;
        }
      } else if (item.ui_typ === 'multiselect') {
        const fieldName = item.ui_feld || 'Mehrfachauswahl';
        const fieldItems = items.filter(it => it.ui_typ === 'multiselect' && it.ui_feld === fieldName);
        fieldItems.forEach(it => renderedKeys.add(it.key));

        const buttonsHtml = fieldItems.map(it => {
          const isActive = Number(events[it.key] || 0) > 0;
          return `
            <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${isActive ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                    onclick="jbToggleMultiSelectOption('${it.key}', '${m.PersonNumber}')"
                    title="${escHtml(it.bezeichnung || '')} (CHF ${it.betrag.toFixed(2)})">
              ${isActive ? '<i class="fas fa-check me-1"></i>' : ''}${escHtml(it.bezeichnungfrontend || it.bezeichnung || it.key)}
              <span class="badge ${isActive ? 'bg-white text-dark' : 'bg-secondary'} ms-1" style="font-size: 9px;">CHF ${it.betrag.toFixed(2)}</span>
            </button>
          `;
        }).join('');

        bodyHtml += `
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label small fw-semibold text-muted mb-0">${escHtml(fieldName)}</label>
              <span class="badge bg-info text-dark" style="font-size: 10px;">Mehrfachauswahl</span>
            </div>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
              ${buttonsHtml}
            </div>
          </div>
        `;
      }
    });

    // Verbleibende Checkbox-Elemente in 2-Spalten Grid rendern
    const checkboxItems = items.filter(it => !renderedKeys.has(it.key) && (it.ui_typ === 'checkbox' || !it.ui_typ));
    if (checkboxItems.length > 0) {
      bodyHtml += '<div class="row g-2">';
      checkboxItems.forEach(it => {
        renderedKeys.add(it.key);
        const isChecked = Number(events[it.key] || 0) > 0;
        bodyHtml += `
          <div class="col-6">
            <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
              <div>
                <span class="small fw-semibold text-muted">${escHtml(it.ui_feld || it.bezeichnungfrontend || it.bezeichnung || it.key)}</span>
                <span class="badge bg-secondary ms-1" style="font-size: 9px;">CHF ${it.betrag.toFixed(2)}</span>
              </div>
              <input type="checkbox" class="form-check-input" ${isChecked ? 'checked' : ''} 
                     onchange="jbUpdateEventState('${it.key}', this.checked ? 1 : 0, '${m.PersonNumber}')">
            </label>
          </div>
        `;
      });
      bodyHtml += '</div>';
    }

    html += `
      <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
        <h6 class="text-secondary fw-bold mb-3" style="font-size: 12px; text-transform: uppercase;">
          <i class="fas ${icon} me-2"></i>${escHtml(groupName)}
        </h6>
        ${bodyHtml}
      </div>
    `;
  });

  return html;
}

window.jbUpdateEventState = function(key, val, pn) {
  const pnClean = String(pn || '').trim();
  key = String(key).trim().toUpperCase();
  val = Number(val || 0);

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }
  _jbParticipationsState.events[key] = val;

  // Sync to legacy fields if applicable
  if (key === 'GE001') _jbParticipationsState.schuetzenhaus = val > 0;
  if (key === 'KK008') _jbParticipationsState.kk_volksschiessen = val > 0 ? String(val) : 'keine';
  if (key === 'KK006') _jbParticipationsState.kk_verband = val > 0;
  if (key === 'KK007') _jbParticipationsState.kk_verein = val > 0;
  if (key === 'KK001') _jbParticipationsState.kk_grenzland = val > 0 ? '1' : 'keine';
  if (key === 'LG001') _jbParticipationsState.lg_ag_dez = val > 0;
  if (key === 'LG002') _jbParticipationsState.lg_ag_dez_auflage = val > 0;
  if (key === 'LG003') _jbParticipationsState.lg_ch_dez = val > 0;
  if (key === 'LG004') _jbParticipationsState.lg_ch_dez_auflage = val > 0;
  if (key === 'LG005') _jbParticipationsState.lg_verband = val > 0;
  if (key === 'LG006') _jbParticipationsState.lg_verein = val > 0;
  if (key === 'LG007') _jbParticipationsState.lg_ch_kniend = val > 0;

  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };
  _jbLocalBulkChanges[pnClean][key] = val;

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }

  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbRenderEntryForm(m);
  }

  jbTriggerAutoSave(pnClean);
};

window.jbSelectSingleSelectOption = function(activeKey, allKeysStr, pn) {
  const pnClean = String(pn || '').trim();
  const allKeys = String(allKeysStr || '').split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
  
  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }

  // Deactivate all keys in this group
  allKeys.forEach(k => {
    _jbParticipationsState.events[k] = 0;
  });

  // Activate selected option
  if (activeKey === 'liegend_2_3') {
    _jbParticipationsState.ssv_dez = 'liegend_2_3';
    _jbParticipationsState.events['KK002'] = 1;
    _jbParticipationsState.events['KK003'] = 1;
    _jbParticipationsState.events['KK004'] = 1;
  } else if (activeKey && activeKey !== 'keine') {
    _jbParticipationsState.events[activeKey.toUpperCase()] = 1;
    if (activeKey === 'KK002') _jbParticipationsState.ssv_dez = 'liegend';
    else if (activeKey === 'KK003') _jbParticipationsState.ssv_dez = '2-stellung';
    else if (activeKey === 'KK004') _jbParticipationsState.ssv_dez = '3-stellung';
    else if (activeKey === 'KK005') _jbParticipationsState.ssv_dez = 'sv';
  } else {
    if (allKeys.includes('KK002')) _jbParticipationsState.ssv_dez = 'keine';
  }

  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };
  if (_jbParticipationsState.ssv_dez) _jbLocalBulkChanges[pnClean].ssv_dez = _jbParticipationsState.ssv_dez;

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }

  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbRenderEntryForm(m);
  }

  jbTriggerAutoSave(pnClean);
};

window.jbToggleMultiSelectOption = function(key, pn) {
  const pnClean = String(pn || '').trim();
  key = String(key).trim().toUpperCase();

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }
  const currentVal = Number(_jbParticipationsState.events[key] || 0);
  const newVal = currentVal > 0 ? 0 : 1;
  jbUpdateEventState(key, newVal, pnClean);
};

// Live-Zusammenfassung der linken Spalte gezielt aktualisieren (ohne Re-Render der rechten Spalte)
function jbUpdateLiveSummary(m) {
  if (!m) return;
  const calc = jbCalculateLiveTotal(m, _jbParticipationsState);

  const totalEl = document.getElementById('jbLiveTotal');
  if (totalEl) {
    totalEl.textContent = `CHF ${calc.total.toFixed(2)}`;
  }

  const listEl = document.getElementById('jbLivePositionsList');
  if (listEl) {
    listEl.innerHTML = `
      <div class="fw-bold text-muted small mb-2 text-uppercase" style="font-size: 10px; letter-spacing: 1px;">Postenübersicht</div>
      ${calc.positions.map(p => `
        <div class="d-flex justify-content-between align-items-center py-1 border-bottom" style="font-size: 12px;">
          <span class="text-muted">${p.name}</span>
          <span class="fw-bold ${p.typ === 'Kredit' ? 'text-success' : 'text-dark'}">
            ${p.typ === 'Kredit' ? '-' : ''}CHF ${Math.abs(p.betrag).toFixed(2)}
          </span>
        </div>
      `).join('')}
    `;
  }
}

// 4. Formular für den aktiven Schützen rendern
function jbRenderEntryForm(m) {
  const workspace = document.getElementById('jbEntryWorkspace');
  if (!workspace) return;

  // Scrollposition & aktives Eingabefeld merken, damit Fokus & Ansicht nicht springen
  const rightCol = document.getElementById('jbEntryRightCol');
  const savedScroll = rightCol ? rightCol.scrollTop : 0;
  const focusedEl = document.activeElement;
  const focusedId = (focusedEl && focusedEl.id) ? focusedEl.id : null;
  const cursorStart = (focusedEl && focusedEl.selectionStart !== undefined) ? focusedEl.selectionStart : null;
  const cursorEnd = (focusedEl && focusedEl.selectionEnd !== undefined) ? focusedEl.selectionEnd : null;

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
      
      <!-- LINKE SPALTE: Live-Kostenübersicht (Sticky) -->
      <div class="col-md-5 d-flex flex-column" style="position: sticky; top: 10px; height: calc(100vh - 235px); min-height: 480px;">
        <div class="card p-3 shadow-sm border-0 bg-light flex-fill d-flex flex-column rounded-3" style="background: rgba(243, 244, 246, 0.7); backdrop-filter: blur(10px);">
          <div class="mb-3 border-bottom pb-2">
            <h5 class="mb-0 text-primary fw-bold">${m.FirstName} ${m.LastName}</h5>
            <small class="text-muted">${m.PersonNumber} · ${isJunior ? '👦 Junior' : '👤 Erwachsen'}</small>
          </div>

          <div class="flex-fill overflow-y-auto mb-3 pe-1" id="jbLivePositionsList" style="max-height: calc(100vh - 430px);">
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

      <!-- RECHTE SPALTE: Auswahlelemente (Scrollbar mit ausreichend Puffer unten) -->
      <div class="col-md-7 d-flex flex-column overflow-y-auto pr-2 pb-5 mb-4" id="jbEntryRightCol" style="max-height: calc(100vh - 235px); min-height: 480px;">
        
        <!-- 0. Schnell-Presets (Vorlagen) -->
        <div class="card p-2 border-0 shadow-sm mb-3 rounded-3 bg-light border-start border-4 border-warning">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-1">
            <span class="small fw-bold text-muted" style="font-size:11px;"><i class="fas fa-bolt text-warning me-1"></i>Schnell-Vorlage:</span>
            <div class="d-flex gap-1">
              <button type="button" class="btn btn-xs btn-outline-primary py-1 px-2 fw-semibold" onclick="jbApplyPreset('aktiv_a', '${m.PersonNumber}')" style="font-size:11px;">⚡ Aktiv A</button>
              <button type="button" class="btn btn-xs btn-outline-primary py-1 px-2 fw-semibold" onclick="jbApplyPreset('aktiv_b', '${m.PersonNumber}')" style="font-size:11px;">⚡ Aktiv B</button>
              <button type="button" class="btn btn-xs btn-outline-secondary py-1 px-2 fw-semibold" onclick="jbApplyPreset('passiv', '${m.PersonNumber}')" style="font-size:11px;">⚡ Passiv</button>
            </div>
          </div>
        </div>

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

        <!-- 2. Dynamische Wettkämpfe & Gebührengruppen (50m, 10m, weitere) -->
        ${jbRenderDynamicFeeGroupsHTML(m, _jbParticipationsState)}

        <!-- 3. Variable Zusatzpositionen (Freie Beträge) & Schloss 🔒 -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3 bg-white border-start border-4 border-info">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="text-secondary fw-bold mb-0" style="font-size: 12px; text-transform: uppercase;">
              <i class="fas fa-plus-circle me-2 text-info"></i>Variable Zusatzpositionen (Freie Beträge)
            </h6>
            <div>
              <button type="button" class="btn btn-xs btn-outline-primary fw-bold me-1" onclick="jbToggleAllAktiveZusatz(true, '${m.PersonNumber}')" style="font-size: 10px;">
                <i class="fas fa-bolt me-1"></i>⚡ Für Aktive (AN)
              </button>
              <button type="button" class="btn btn-xs btn-outline-secondary fw-bold" onclick="jbToggleAllAktiveZusatz(false, '${m.PersonNumber}')" style="font-size: 10px;">
                Alle abwählen
              </button>
            </div>
          </div>
          
          <!-- Zusatzposition 1 -->
          <div class="p-2 bg-light rounded-2 border mb-2">
            <div class="row g-2 align-items-center">
              <div class="col-auto">
                <input class="form-check-input" type="checkbox" id="z1_active_${m.PersonNumber}" ${
                  _jbParticipationsState.z1_active ? 'checked' : ''
                } onchange="jbUpdateState('z1_active', this.checked, '${m.PersonNumber}')">
              </div>
              <div class="col">
                <input type="text" class="form-control form-control-sm" placeholder="Text (z.B. Beitrag Vereinsjacke)" 
                       value="${escHtml(_jbParticipationsState.z1_text || 'Beitrag Vereinsjacke')}" 
                       onchange="jbUpdateState('z1_text', this.value, '${m.PersonNumber}')">
              </div>
              <div class="col-3">
                <div class="input-group input-group-sm">
                  <span class="input-group-text px-1">CHF</span>
                  <input type="number" step="0.05" class="form-control form-control-sm text-end" placeholder="60.00" 
                         value="${_jbParticipationsState.z1_betrag !== undefined ? _jbParticipationsState.z1_betrag : 60}" 
                         onchange="jbUpdateState('z1_betrag', parseFloat(this.value)||0, '${m.PersonNumber}')">
                </div>
              </div>
              <div class="col-auto">
                <div class="input-group input-group-sm" style="width: 110px;">
                  <input type="text" id="z1_konto_${m.PersonNumber}" class="form-control form-control-sm font-monospace" 
                         value="${_jbParticipationsState.z1_konto || jbGetDefaultAccountForExtra('Z001', '8500')}" 
                         ${_jbParticipationsState.z1_unlocked ? '' : 'readonly style="background-color: #e9ecef;"'}
                         onchange="jbUpdateState('z1_konto', this.value, '${m.PersonNumber}')">
                  <button class="btn btn-outline-secondary" type="button" 
                          onclick="jbToggleKontoLock('z1_unlocked', '${m.PersonNumber}')" 
                          title="${_jbParticipationsState.z1_unlocked ? 'Konto sperren' : 'Konto bearbeiten'}">
                    <i class="fas ${_jbParticipationsState.z1_unlocked ? 'fa-lock-open text-warning' : 'fa-lock'}"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Zusatzposition 2 -->
          <div class="p-2 bg-light rounded-2 border">
            <div class="row g-2 align-items-center">
              <div class="col-auto">
                <input class="form-check-input" type="checkbox" id="z2_active_${m.PersonNumber}" ${
                  _jbParticipationsState.z2_active ? 'checked' : ''
                } onchange="jbUpdateState('z2_active', this.checked, '${m.PersonNumber}')">
              </div>
              <div class="col">
                <input type="text" class="form-control form-control-sm" placeholder="Text (z.B. Eidg. Schützenfest)" 
                       value="${escHtml(_jbParticipationsState.z2_text || 'Beitrag Eidg. Schützenfest')}" 
                       onchange="jbUpdateState('z2_text', this.value, '${m.PersonNumber}')">
              </div>
              <div class="col-3">
                <div class="input-group input-group-sm">
                  <span class="input-group-text px-1">CHF</span>
                  <input type="number" step="0.05" class="form-control form-control-sm text-end" placeholder="150.00" 
                         value="${_jbParticipationsState.z2_betrag !== undefined ? _jbParticipationsState.z2_betrag : 150}" 
                         onchange="jbUpdateState('z2_betrag', parseFloat(this.value)||0, '${m.PersonNumber}')">
                </div>
              </div>
              <div class="col-auto">
                <div class="input-group input-group-sm" style="width: 110px;">
                  <input type="text" id="z2_konto_${m.PersonNumber}" class="form-control form-control-sm font-monospace" 
                         value="${_jbParticipationsState.z2_konto || jbGetDefaultAccountForExtra('Z002', '1300')}" 
                         ${_jbParticipationsState.z2_unlocked ? '' : 'readonly style="background-color: #e9ecef;"'}
                         onchange="jbUpdateState('z2_konto', this.value, '${m.PersonNumber}')">
                  <button class="btn btn-outline-secondary" type="button" 
                          onclick="jbToggleKontoLock('z2_unlocked', '${m.PersonNumber}')" 
                          title="${_jbParticipationsState.z2_unlocked ? 'Konto sperren' : 'Konto bearbeiten'}">
                    <i class="fas ${_jbParticipationsState.z2_unlocked ? 'fa-lock-open text-warning' : 'fa-lock'}"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Speichern & Aktionen (mit großzügigem Abstand nach unten) -->
        <div class="d-flex gap-2 mt-4 pt-2 pb-5">
          <button class="btn btn-outline-danger px-3" onclick="jbEntryResetForm('${m.PersonNumber}')">
            <i class="fas fa-trash-alt me-1"></i> Zurücksetzen
          </button>
          <button class="btn btn-success flex-fill py-2.5 fw-bold shadow-sm" onclick="jbEntrySaveAndNext('${m.PersonNumber}')">
            <i class="fas fa-save me-1"></i> Speichern & Weiter (Nächster Schütze)
          </button>
        </div>

      </div>

    </div>
  `;

  // Scrollposition & Fokus wiederherstellen
  const newRightCol = document.getElementById('jbEntryRightCol');
  if (newRightCol && savedScroll > 0) {
    newRightCol.scrollTop = savedScroll;
  }
  if (focusedId) {
    const el = document.getElementById(focusedId);
    if (el) {
      try {
        el.focus({ preventScroll: true });
        if (cursorStart !== null && cursorEnd !== null && el.setSelectionRange) {
          el.setSelectionRange(cursorStart, cursorEnd);
        }
      } catch(e) {}
    }
  }
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

// 5. State live aktualisieren & Auto-Save ausführen
let _jbAutoSaveTimer = null;

function jbTriggerAutoSave(pnClean) {
  const statusEl = document.getElementById('jbAutoSaveStatus');
  if (statusEl) {
    statusEl.innerHTML = `<span class="text-warning fw-semibold"><i class="fas fa-spinner fa-spin me-1"></i>Speichere...</span>`;
  }

  if (_jbAutoSaveTimer) clearTimeout(_jbAutoSaveTimer);

  _jbAutoSaveTimer = setTimeout(async () => {
    try {
      const settings = _jbLocalBulkChanges[pnClean] || _jbParticipationsState;
      const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
      if (!m) return;

      const events = settings.events ? { ...settings.events } : {};
      if (settings.schuetzenhaus !== undefined) events['GE001'] = settings.schuetzenhaus ? 1 : 0;
      if (settings.kk_volksschiessen !== undefined) events['KK008'] = settings.kk_volksschiessen === 'keine' ? 0 : Number(settings.kk_volksschiessen);
      if (settings.kk_verein !== undefined) events['KK007'] = settings.kk_verein ? 1 : 0;
      if (settings.kk_verband !== undefined) events['KK006'] = settings.kk_verband ? 1 : 0;
      if (settings.kk_grenzland !== undefined) events['KK001'] = settings.kk_grenzland !== 'keine' ? 1 : 0;
      if (settings.ssv_dez !== undefined) {
        const ssv = settings.ssv_dez;
        events['KK002'] = (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK003'] = (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK004'] = (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK005'] = ssv === 'sv' ? 1 : 0;
      }
      if (settings.lg_ag_dez !== undefined) events['LG001'] = settings.lg_ag_dez ? 1 : 0;
      if (settings.lg_ag_dez_auflage !== undefined) events['LG002'] = settings.lg_ag_dez_auflage ? 1 : 0;
      if (settings.lg_ch_dez !== undefined) events['LG003'] = settings.lg_ch_dez ? 1 : 0;
      if (settings.lg_ch_dez_auflage !== undefined) events['LG004'] = settings.lg_ch_dez_auflage ? 1 : 0;
      if (settings.lg_verband !== undefined) events['LG005'] = settings.lg_verband ? 1 : 0;
      if (settings.lg_verein !== undefined) events['LG006'] = settings.lg_verein ? 1 : 0;
      if (settings.lg_ch_kniend !== undefined) events['LG007'] = settings.lg_ch_kniend ? 1 : 0;

      const list = Object.entries(events).map(([eventkey, teilgenommen]) => ({
        pn: pnClean,
        year: _jbYear,
        eventkey,
        teilgenommen: Number(teilgenommen || 0),
        quelle: 'schnellerfassung'
      }));

      const licenses = settings.lizenz ? [{ pn: pnClean, lizenz: settings.lizenz }] : [];

      // 1. Direkt in Supabase speichern
      const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
      if (supa && list.length > 0) {
        try {
          const dbParts = list.map(item => ({
            id: `${item.pn}-${item.year}-${item.eventkey}`,
            person_number: item.pn,
            year: Number(item.year),
            event_key: item.eventkey,
            teilgenommen: Number(item.teilgenommen || 0),
            quelle: 'schnellerfassung',
            erfasst_am: new Date().toISOString(),
            erfasst_von: window.currentUser || 'frontend'
          }));
          await supa.from('member_participations').upsert(dbParts, { onConflict: 'person_number,year,event_key' });
        } catch (errSup) {
          console.warn("⚠️ Fehler bei Supabase Auto-Save Participations:", errSup);
        }
      }

      const payload = {
        action: 'saveParticipationsBulk',
        list: list,
        licenses: licenses,
        user: window.currentUser || 'frontend'
      };

      
      // Memory Caches updaten
      if (!_jbParticipationsCache[pnClean]) _jbParticipationsCache[pnClean] = [];
      list.forEach(item => {
        const idx = _jbParticipationsCache[pnClean].findIndex(p => p.eventkey === item.eventkey && Number(p.year) === Number(item.year));
        if (idx >= 0) {
          _jbParticipationsCache[pnClean][idx].teilgenommen = item.teilgenommen;
        } else {
          _jbParticipationsCache[pnClean].push({
            PersonNumber: pnClean,
            year: item.year,
            eventkey: item.eventkey,
            teilgenommen: item.teilgenommen
          });
        }
      });

      if (typeof jbSyncMemberToCache === 'function') {
        jbSyncMemberToCache(pnClean, settings);
      }

      const now = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-1"></i>Auto-Gespeichert (${now})</span>`;
      }
    } catch(err) {
      console.warn("Auto-Save Fehler:", err);
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-danger fw-semibold"><i class="fas fa-exclamation-circle me-1"></i>Speicherfehler</span>`;
      }
    }
  }, 400);
}

function jbApplyPreset(presetType, pn) {
  const pnClean = String(pn || '').trim();
  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (!m) return;

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }

  if (presetType === 'aktiv_a') {
    _jbParticipationsState.lizenz = 'verein';
    _jbParticipationsState.schuetzenhaus = true;
    _jbParticipationsState.kk_volksschiessen = '1';
    _jbParticipationsState.kk_verband = true;
    _jbParticipationsState.kk_verein = true;
    _jbParticipationsState.events['GE001'] = 1;
    _jbParticipationsState.events['KK008'] = 1;
    _jbParticipationsState.events['KK006'] = 1;
    _jbParticipationsState.events['KK007'] = 1;
  } else if (presetType === 'aktiv_b') {
    _jbParticipationsState.lizenz = 'verein';
    _jbParticipationsState.schuetzenhaus = true;
    _jbParticipationsState.kk_volksschiessen = '1';
    _jbParticipationsState.kk_verband = false;
    _jbParticipationsState.kk_verein = true;
    _jbParticipationsState.events['GE001'] = 1;
    _jbParticipationsState.events['KK008'] = 1;
    _jbParticipationsState.events['KK006'] = 0;
    _jbParticipationsState.events['KK007'] = 1;
  } else if (presetType === 'passiv') {
    _jbParticipationsState.lizenz = 'passiv';
    _jbParticipationsState.schuetzenhaus = false;
    _jbParticipationsState.kk_volksschiessen = 'keine';
    _jbParticipationsState.kk_verband = false;
    _jbParticipationsState.kk_verein = false;
    _jbParticipationsState.events['GE001'] = 0;
    _jbParticipationsState.events['KK008'] = 0;
    _jbParticipationsState.events['KK006'] = 0;
    _jbParticipationsState.events['KK007'] = 0;
  }

  _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }
  jbRenderEntryList();
  jbRenderEntryForm(m);
  jbTriggerAutoSave(pnClean);
}

function jbHandleSidebarKeyDown(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const search = _jbEntrySearch.toLowerCase().trim();
    const filtered = _jbMembers.filter(m => {
      const name = `${m.FirstName || ''} ${m.LastName || ''} ${m.PersonNumber || ''}`.toLowerCase();
      return !search || name.includes(search);
    });
    if (!filtered.length) return;
    
    let currentIdx = filtered.findIndex(m => String(m.PersonNumber).trim() === String(_jbSelectedMemberPN).trim());
    if (e.key === 'ArrowDown') {
      currentIdx = currentIdx < filtered.length - 1 ? currentIdx + 1 : 0;
    } else if (e.key === 'ArrowUp') {
      currentIdx = currentIdx > 0 ? currentIdx - 1 : filtered.length - 1;
    }
    
    const nextMem = filtered[currentIdx];
    if (nextMem) {
      jbEntrySelectMember(nextMem.PersonNumber);
    }
  }
}

function jbUpdateState(key, val, pn) {
  const pnClean = String(pn || '').trim();
  _jbParticipationsState[key] = val;

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }

  // Sync to events map
  if (key === 'schuetzenhaus') _jbParticipationsState.events['GE001'] = val ? 1 : 0;
  else if (key === 'kk_volksschiessen') _jbParticipationsState.events['KK008'] = val === 'keine' ? 0 : Number(val);
  else if (key === 'kk_verband') _jbParticipationsState.events['KK006'] = val ? 1 : 0;
  else if (key === 'kk_verein') _jbParticipationsState.events['KK007'] = val ? 1 : 0;
  else if (key === 'kk_grenzland') _jbParticipationsState.events['KK001'] = val !== 'keine' ? 1 : 0;
  else if (key === 'ssv_dez') {
    _jbParticipationsState.events['KK002'] = (val === 'liegend' || val === 'liegend_2_3') ? 1 : 0;
    _jbParticipationsState.events['KK003'] = (val === '2-stellung' || val === 'liegend_2_3') ? 1 : 0;
    _jbParticipationsState.events['KK004'] = (val === '3-stellung' || val === 'liegend_2_3') ? 1 : 0;
    _jbParticipationsState.events['KK005'] = val === 'sv' ? 1 : 0;
  } else if (key === 'lg_ag_dez') _jbParticipationsState.events['LG001'] = val ? 1 : 0;
  else if (key === 'lg_ag_dez_auflage') _jbParticipationsState.events['LG002'] = val ? 1 : 0;
  else if (key === 'lg_ch_dez') _jbParticipationsState.events['LG003'] = val ? 1 : 0;
  else if (key === 'lg_ch_dez_auflage') _jbParticipationsState.events['LG004'] = val ? 1 : 0;
  else if (key === 'lg_verband') _jbParticipationsState.events['LG005'] = val ? 1 : 0;
  else if (key === 'lg_verein') _jbParticipationsState.events['LG006'] = val ? 1 : 0;
  else if (key === 'lg_ch_kniend') _jbParticipationsState.events['LG007'] = val ? 1 : 0;
  
  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean][key] = val;
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }

  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    // Bei Eingabefeldern und Schaltern nur die Live-Summary aktualisieren,
    // damit der Cursor im Feld bleibt und der Fokus/Scroll nicht springt!
    if (key.startsWith('z1_') || key.startsWith('z2_') || key === 'schuetzenhaus') {
      jbUpdateLiveSummary(m);
    } else {
      jbRenderEntryForm(m);
    }
  }

  jbTriggerAutoSave(pnClean);
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
    events: {
      'GE001': defaultGe ? 1 : 0
    },
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
      const events = state.events ? { ...state.events } : {};

      if (state.schuetzenhaus !== undefined) events['GE001'] = state.schuetzenhaus ? 1 : 0;
      if (state.kk_volksschiessen !== undefined) events['KK008'] = state.kk_volksschiessen === 'keine' ? 0 : Number(state.kk_volksschiessen);
      if (state.kk_verein !== undefined) events['KK007'] = state.kk_verein ? 1 : 0;
      if (state.kk_verband !== undefined) events['KK006'] = state.kk_verband ? 1 : 0;
      if (state.kk_grenzland !== undefined) events['KK001'] = state.kk_grenzland !== 'keine' ? 1 : 0;
      if (state.ssv_dez !== undefined) {
        const ssv = state.ssv_dez;
        events['KK002'] = (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK003'] = (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK004'] = (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK005'] = ssv === 'sv' ? 1 : 0;
      }
      if (state.lg_ag_dez !== undefined) events['LG001'] = state.lg_ag_dez ? 1 : 0;
      if (state.lg_ag_dez_auflage !== undefined) events['LG002'] = state.lg_ag_dez_auflage ? 1 : 0;
      if (state.lg_ch_dez !== undefined) events['LG003'] = state.lg_ch_dez ? 1 : 0;
      if (state.lg_ch_dez_auflage !== undefined) events['LG004'] = state.lg_ch_dez_auflage ? 1 : 0;
      if (state.lg_verband !== undefined) events['LG005'] = state.lg_verband ? 1 : 0;
      if (state.lg_verein !== undefined) events['LG006'] = state.lg_verein ? 1 : 0;
      if (state.lg_ch_kniend !== undefined) events['LG007'] = state.lg_ch_kniend ? 1 : 0;

      Object.entries(events).forEach(([eventkey, teilgenommen]) => {
        list.push({
          pn,
          year,
          eventkey,
          teilgenommen: Number(teilgenommen || 0),
          quelle: 'schnellerfassung'
        });
      });
    });

    // 1. Direkt in Supabase speichern
    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    if (supa && list.length > 0) {
      try {
        const dbParts = list.map(item => ({
          id: `${item.pn}-${item.year}-${item.eventkey}`,
          person_number: item.pn,
          year: Number(item.year),
          event_key: item.eventkey,
          teilgenommen: Number(item.teilgenommen || 0),
          quelle: 'schnellerfassung',
          erfasst_am: new Date().toISOString(),
          erfasst_von: window.currentUser || 'frontend'
        }));
        await supa.from('member_participations').upsert(dbParts, { onConflict: 'person_number,year,event_key' });

        // Für jeden geänderten Schützen den Beitrag neu berechnen und speichern
        for (const pn of editedPNs) {
          const m = (_jbMemberMap && _jbMemberMap[pn]) || (_jbMembers || []).find(x => String(x.PersonNumber).trim() === pn);
          if (m && typeof jbCalculateLiveTotal === 'function') {
            const settings = _jbLocalBulkChanges[pn] || {};
            const calc = jbCalculateLiveTotal(m, settings);
            const headId = `${year}-${pn}`;

            await supa.from('contributions_header').upsert({
              id: headId,
              person_number: pn,
              year: Number(year),
              status: 'offen',
              gesamt: calc.total,
              updated_at: new Date().toISOString()
            }, { onConflict: 'person_number,year' });

            const newPos = calc.positions.map((p, idx) => ({
              id: `${headId}-${idx + 1}`,
              header_id: headId,
              person_number: pn,
              year: Number(year),
              position_nr: idx + 1,
              beschreibung: p.name || 'Position',
              betrag: Number(p.betrag || 0),
              typ: p.typ || 'Debit',
              source_field: p.key || '',
              konto: p.konto || (typeof window.jbResolveAccountForPosition === 'function' ? window.jbResolveAccountForPosition(p.key, p.name) : '3000'),
              last_upd: new Date().toISOString()
            }));

            await supa.from('contributions_positions').delete().eq('header_id', headId);
            if (newPos.length > 0) {
              await supa.from('contributions_positions').insert(newPos);
            }
          }
        }
        console.log(`✅ [Supabase] ${list.length} Teilnahmen und Beiträge für ${editedPNs.length} Schützen gespeichert.`);
      } catch (errSup) {
        console.warn("⚠️ Fehler bei direkter Supabase Bulk-Speicherung:", errSup);
      }
    }


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

window.jbToggleKontoLock = function(key, pn) {
  const pnClean = String(pn || '').trim();
  const current = !!_jbParticipationsState[key];
  const next = !current;
  _jbParticipationsState[key] = next;
  if (!_jbLocalBulkChanges[pnClean]) _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  _jbLocalBulkChanges[pnClean][key] = next;

  const prefix = key.startsWith('z1') ? 'z1' : 'z2';
  const inputEl = document.getElementById(`${prefix}_konto_${pnClean}`);
  if (inputEl) {
    if (next) {
      inputEl.removeAttribute('readonly');
      inputEl.style.backgroundColor = '';
      inputEl.focus();
    } else {
      inputEl.setAttribute('readonly', 'readonly');
      inputEl.style.backgroundColor = '#e9ecef';
    }
  }
  const btn = event && event.currentTarget ? event.currentTarget : null;
  if (btn) {
    btn.title = next ? 'Konto sperren' : 'Konto bearbeiten';
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = `fas ${next ? 'fa-lock-open text-warning' : 'fa-lock'}`;
    }
  }
};

window.jbToggleAllAktiveZusatz = function(activateState, currentPn) {
  const textMsg = activateState ? 'für ALLE aktiven Schützen aktivieren' : 'für ALLE Schützen abwählen';
  const ok = confirm(`Möchten Sie die Zusatzposition 1 (Beitrag Vereinsjacke) ${textMsg}?`);
  if (!ok) return;

  _jbMembers.forEach(m => {
    const isEhren = m._istEhren || false;
    const isPassiv = m._istPassiv || false;
    const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
    const isJunior = age > 0 && age <= 20;

    // Nur für Aktive (oder beim Abwählen für alle)
    if (!activateState || (!isPassiv && !isEhren && !isJunior)) {
      const pnClean = String(m.PersonNumber || '').trim();
      if (!_jbLocalBulkChanges[pnClean]) {
        _jbLocalBulkChanges[pnClean] = {};
      }
      _jbLocalBulkChanges[pnClean].z1_active = activateState;
      if (activateState) {
        if (!_jbLocalBulkChanges[pnClean].z1_text) _jbLocalBulkChanges[pnClean].z1_text = _jbParticipationsState.z1_text || 'Beitrag Vereinsjacke';
        if (_jbLocalBulkChanges[pnClean].z1_betrag === undefined) _jbLocalBulkChanges[pnClean].z1_betrag = _jbParticipationsState.z1_betrag !== undefined ? _jbParticipationsState.z1_betrag : 60;
        if (!_jbLocalBulkChanges[pnClean].z1_konto) _jbLocalBulkChanges[pnClean].z1_konto = _jbParticipationsState.z1_konto || jbGetDefaultAccountForExtra('Z001', '8500');
      }
    }
  });

  _jbParticipationsState.z1_active = activateState;
  jbUpdateState('z1_active', activateState, currentPn);
  showToast(`⚡ Zusatzposition 1 ${activateState ? 'für alle aktiven Schützen aktiviert' : 'abgewählt'}.`, 'success');
};
