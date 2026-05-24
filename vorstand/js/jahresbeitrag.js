// js/jahresbeitrag.js
// ============================================================
// STATE & CONFIG
// ============================================================
window._jbYear = window._jbYear || new Date().getFullYear();
window._jbData = window._jbData || []; // Rechnungs-Header
window._jbMembers = window._jbMembers || []; // Stammdaten aller aktiven Mitglieder
window._jbMemberMap = window._jbMemberMap || {};
window._jbActiveTab = window._jbActiveTab || 'overview'; // 'overview', 'entry', 'import'
window._jbSelectedMemberPN = window._jbSelectedMemberPN || null; // Aktive Person in der Schnellerfassung
window._jbEntrySearch = window._jbEntrySearch || ''; // Filter für die Mitgliederliste in der Schnellerfassung
window._jbParticipationsState = window._jbParticipationsState || {}; // Lokale Teilnahmen-Änderungen vor dem Speichern
window._jbImportData = window._jbImportData || null; // Gelesene Excel-Import-Daten
window._jbLocalBulkChanges = window._jbLocalBulkChanges || {}; // Lokale, ungespeicherte Änderungen für die Schnellerfassung
window._jbParticipationsCache = window._jbParticipationsCache || {}; // Lokaler Cache für Turnierteilnahmen: { [pn]: [ ... ] }
window._jbPositionsCache = window._jbPositionsCache || {}; // Lokaler Cache für Rechnungspositionen: { [headerId]: [ ... ] }
window._jbSortCol = window._jbSortCol || 'name'; // Aktuell sortierte Tabellenspalte: 'name', 'kat', 'gesamt', 'status', 'date', 'method', 'beleg'
window._jbSortAsc = window._jbSortAsc === undefined ? true : window._jbSortAsc; // Sortierrichtung: true (aufsteigend), false (absteigend)
window._jbSidebarSort = window._jbSidebarSort || 'name'; // Sortierung der Seitenleiste: 'name', 'status', 'modified'
window._jbBankTransactions = window._jbBankTransactions || []; // Parsed CAMT.053 transactions
window._jbBankMatchResults = window._jbBankMatchResults || [];  // Match results after reconciliation

// Komplette globale Caches über alle Jahre hinweg
window._jbAllBeitraege = window._jbAllBeitraege || null;
window._jbAllParticipations = window._jbAllParticipations || null;
window._jbAllPositions = window._jbAllPositions || null;

// Event-Keys Zuordnung für Wettschiessen
const EVENT_KEYS = {
  // Kleinkaliber (50m)
  kk_volksschiessen: 'KK007',
  kk_verband: 'KK006',
  kk_verein: 'KK007',
  kk_grenzland: 'KK001',
  ssv_dez_liegend: 'KK002',
  ssv_dez_2stellung: 'KK003',
  ssv_dez_3stellung: 'KK004',
  ssv_dez_sv: 'KK005',
  // Luftgewehr (10m)
  lg_ag_dez: 'LG001',
  lg_ag_dez_auflage: 'LG002',
  lg_ch_dez: 'LG003',
  lg_ch_dez_auflage: 'LG004',
  lg_verband: 'LG005',
  lg_verein: 'LG006',
  lg_ch_kniend: 'LG007'
};

// ============================================================
// EINSTIEGSPUNKT
// ============================================================
async function loadJahresbeitragData(forceReload = false) {
  const container = document.getElementById('jahresbeitrag-container');
  
  console.log("🔍 loadJahresbeitragData check:", { forceReload, _jbAllBeitraege: window._jbAllBeitraege, len: window._jbAllBeitraege?.length });
  
  // Wenn Caches bereits geladen sind und kein forceReload erzwungen wird,
  // laden wir direkt und instant aus dem lokalen Speicher!
  if (!forceReload && window._jbAllBeitraege && window._jbAllBeitraege.length > 0) {
    console.log("⚡ loadJahresbeitragData: Lade aus lokalem Cache...");
    
    _jbData = _jbAllBeitraege.filter(h => Number(h.year) === Number(_jbYear));
    
    _jbParticipationsCache = {};
    _jbAllParticipations.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const pn = String(p.PersonNumber).trim();
        if (!_jbParticipationsCache[pn]) _jbParticipationsCache[pn] = [];
        _jbParticipationsCache[pn].push(p);
      }
    });

    _jbPositionsCache = {};
    _jbAllPositions.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const hid = String(p.headerid).trim();
        if (!_jbPositionsCache[hid]) _jbPositionsCache[hid] = [];
        _jbPositionsCache[hid].push(p);
      }
    });

    jbApplyTableSorting();
    jbApplySidebarSorting();
    renderJahresbeitragView();
    return;
  }

  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-2 text-muted">Lade Beitrags- und Mitgliederdaten (alle Jahre)…</p>
    </div>`;

  try {
    const [beitraege, members, participations, positions] = await Promise.all([
      apiFetch('jahresbeitrag', `action=getBeitraege`).then(r => r.json()),
      apiFetch('jahresbeitrag', `action=getMembers`).then(r => r.json()),
      apiFetch('jahresbeitrag', `action=getParticipations`).then(r => r.json()),
      apiFetch('jahresbeitrag', `action=getPositionen`).then(r => r.json())
    ]);

    if (!beitraege.success) throw new Error(beitraege.error);
    if (!members.success)   throw new Error(members.error);
    if (!participations.success) throw new Error(participations.error);
    if (!positions.success) throw new Error(positions.error);

    // Alle aktiven Mitglieder filtern
    _jbMembers = (members.data || []).filter(m => m.IsActive == 1 && m.Deceased != 1);
    
    _jbMemberMap = {};
    (members.data || []).forEach(m => { 
      _jbMemberMap[String(m.PersonNumber)] = m; 
    });

    // In globalen Caches speichern
    _jbAllBeitraege = beitraege.data || [];
    _jbAllParticipations = participations.data || [];
    _jbAllPositions = positions.positions || [];

    // Für das aktive Jahr filtern
    _jbData = _jbAllBeitraege.filter(h => Number(h.year) === Number(_jbYear));

    // Turnierteilnahmen-Cache aufbauen (nur für das aktive Jahr)
    _jbParticipationsCache = {};
    _jbAllParticipations.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const pn = String(p.PersonNumber).trim();
        if (!_jbParticipationsCache[pn]) _jbParticipationsCache[pn] = [];
        _jbParticipationsCache[pn].push(p);
      }
    });

    // Rechnungspositionen-Cache aufbauen (nur für das aktive Jahr)
    _jbPositionsCache = {};
    _jbAllPositions.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const hid = String(p.headerid).trim();
        if (!_jbPositionsCache[hid]) _jbPositionsCache[hid] = [];
        _jbPositionsCache[hid].push(p);
      }
    });
    
    // Sortierungen anwenden
    jbApplyTableSorting();
    jbApplySidebarSorting();
    
    renderJahresbeitragView();
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  }
}

function jbApplyTableSorting() {
  _jbData.sort((a, b) => {
    let valA, valB;
    const mA = _jbMemberMap[String(a.PersonNumber)] || {};
    const mB = _jbMemberMap[String(b.PersonNumber)] || {};

    if (_jbSortCol === 'name') {
      valA = `${mA.LastName || ''} ${mA.FirstName || ''}`.toLowerCase();
      valB = `${mB.LastName || ''} ${mB.FirstName || ''}`.toLowerCase();
    } else if (_jbSortCol === 'kat') {
      valA = (mA._kategorie || '').toLowerCase();
      valB = (mB._kategorie || '').toLowerCase();
    } else if (_jbSortCol === 'gesamt') {
      valA = Number(a.Gesamt || 0);
      valB = Number(b.Gesamt || 0);
    } else if (_jbSortCol === 'status') {
      valA = (a.status || '').toLowerCase();
      valB = (b.status || '').toLowerCase();
    } else if (_jbSortCol === 'date') {
      valA = a.payment_date || '';
      valB = b.payment_date || '';
    } else if (_jbSortCol === 'method') {
      valA = (a.payment_method || '').toLowerCase();
      valB = (b.payment_method || '').toLowerCase();
    } else if (_jbSortCol === 'beleg') {
      valA = (a.document_ref || '').toLowerCase();
      valB = (b.document_ref || '').toLowerCase();
    }

    if (valA < valB) return _jbSortAsc ? -1 : 1;
    if (valA > valB) return _jbSortAsc ? 1 : -1;
    return 0;
  });
}

function jbApplySidebarSorting() {
  _jbMembers.sort((a, b) => {
    if (_jbSidebarSort === 'modified') {
      const isModA = _jbLocalBulkChanges[String(a.PersonNumber)] !== undefined ? 1 : 0;
      const isModB = _jbLocalBulkChanges[String(b.PersonNumber)] !== undefined ? 1 : 0;
      if (isModA !== isModB) {
        return isModB - isModA; // Geänderte Schützen nach ganz oben schieben!
      }
    }

    if (_jbSidebarSort === 'status') {
      const statA = a._istEhren ? 1 : (a._istPassiv ? 3 : 2); // Ehren > Aktiv > Passiv
      const statB = b._istEhren ? 1 : (b._istPassiv ? 3 : 2);
      if (statA !== statB) {
        return statA - statB;
      }
    }

    // Name (Alphabetisch)
    const nameA = `${a.LastName || ''} ${a.FirstName || ''}`.toLowerCase();
    const nameB = `${b.LastName || ''} ${b.FirstName || ''}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function jbSortTable(col) {
  if (_jbSortCol === col) {
    _jbSortAsc = !_jbSortAsc;
  } else {
    _jbSortCol = col;
    _jbSortAsc = true;
  }
  jbApplyTableSorting();
  renderJahresbeitragView();
}

function jbSortSidebar(col) {
  _jbSidebarSort = col;
  jbApplySidebarSorting();
  jbRenderEntryList();
}

// ============================================================
// SWITCH TABS
// ============================================================
function jbSwitchTab(tabName) {
  _jbActiveTab = tabName;
  renderJahresbeitragView();
}

// ============================================================
// RENDER GENERAL VIEW
// ============================================================
function renderJahresbeitragView() {
  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 4; y--) years.push(y);

  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));

  // Tab Navigation Controls
  const tabControlHTML = `
    <div class="d-flex bg-white p-1 rounded shadow-sm mb-4 border" style="max-width: 720px;">
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'overview' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('overview')">
        <i class="fas fa-list-ul me-2"></i> Beitrags-Übersicht
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'entry' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('entry')">
        <i class="fas fa-bolt me-2"></i> Schnellerfassung
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'import' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('import')">
        <i class="fas fa-file-excel me-2"></i> Excel-Import
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'bank' ? 'btn-success text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('bank')">
        <i class="fas fa-university me-2"></i> Bankabgleich
      </button>
    </div>
  `;

  let contentHTML = '';
  
  if (_jbActiveTab === 'overview') {
    contentHTML = renderOverviewTab(canEdit, years);
  } else if (_jbActiveTab === 'entry') {
    contentHTML = renderSchnellerfassungTab();
  } else if (_jbActiveTab === 'import') {
    contentHTML = renderExcelImportTab();
  } else if (_jbActiveTab === 'bank') {
    contentHTML = renderBankabgleichTab();
  }

  document.getElementById('jahresbeitrag-container').innerHTML = tabControlHTML + contentHTML;

  if (_jbActiveTab === 'overview') {
    jbRenderRows(_jbData);
  } else if (_jbActiveTab === 'entry') {
    jbRenderEntryList();
    jbAddScrollSupport();
  } else if (_jbActiveTab === 'bank') {
    jbBankRenderResults();
  }
}

// ============================================================
// TAB 1: OVERVIEW TAB RENDER
// ============================================================
function renderOverviewTab(canEdit, years) {
  const total    = _jbData.reduce((s, r) => s + Number(r.Gesamt || 0), 0);
  const bezahlt  = _jbData.filter(r => r.status === 'bezahlt').reduce((s, r) => s + Number(r.Gesamt || 0), 0);
  const offen    = total - bezahlt;
  const offenCount  = _jbData.filter(r => r.status !== 'bezahlt').length;
  const bezahltCount = _jbData.filter(r => r.status === 'bezahlt').length;

  const yearOptions = years.map(y =>
    `<option value="${y}" ${y == _jbYear ? 'selected' : ''}>${y}</option>`
  ).join('');

  return `
    <!-- Toolbar -->
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <select class="form-select form-select-sm" style="width:100px" id="jbYearSel" onchange="jbChangeYear(this.value)">
        ${yearOptions}
      </select>
      <input type="text" class="form-control form-control-sm" style="width:220px"
             id="jbSearch" placeholder="🔍 Name / PersonenNummer…" oninput="jbFilter()">
      <select class="form-select form-select-sm" style="width:130px" id="jbStatusFilter" onchange="jbFilter()">
        <option value="">Alle Status</option>
        <option value="offen">Offen</option>
        <option value="bezahlt">Bezahlt</option>
      </select>
      ${canEdit ? `
      <button class="btn btn-sm btn-outline-warning ms-auto" onclick="jbBerechnen()">
        <i class="fas fa-calculator"></i> Alle Beiträge berechnen
      </button>` : ''}
    </div>

    <!-- KPI-Karten -->
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-primary">
          <div class="small text-muted">Total</div>
          <div class="fs-5 fw-bold">${fmtChf(total)}</div>
          <div class="text-muted small">${_jbData.length} Rechnungen</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-success">
          <div class="small text-muted">Bezahlt</div>
          <div class="fs-5 fw-bold text-success">${fmtChf(bezahlt)}</div>
          <div class="text-muted small">${bezahltCount} Mitglieder</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-danger">
          <div class="small text-muted">Offen</div>
          <div class="fs-5 fw-bold text-danger">${fmtChf(offen)}</div>
          <div class="text-muted small">${offenCount} ausstehend</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-warning">
          <div class="small text-muted">Fortschritt</div>
          <div class="fs-5 fw-bold">${total > 0 ? Math.round(bezahlt/total*100) : 0}%</div>
          <div class="progress mt-1" style="height:6px">
            <div class="progress-bar bg-success" style="width:${total > 0 ? bezahlt/total*100 : 0}%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabelle -->
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0" id="jbTable">
            <thead class="table-dark">
              <tr>
                <th onclick="jbSortTable('name')" style="cursor: pointer; user-select: none;">Name${_jbSortCol === 'name' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
                <th onclick="jbSortTable('kat')" style="cursor: pointer; user-select: none;">Kategorie${_jbSortCol === 'kat' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
                <th onclick="jbSortTable('gesamt')" class="text-end" style="cursor: pointer; user-select: none;">Gesamt${_jbSortCol === 'gesamt' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
                <th onclick="jbSortTable('status')" style="cursor: pointer; user-select: none;">Status${_jbSortCol === 'status' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
                <th onclick="jbSortTable('date')" style="cursor: pointer; user-select: none;">Bezahlt am${_jbSortCol === 'date' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
                <th onclick="jbSortTable('method')" style="cursor: pointer; user-select: none;">Methode${_jbSortCol === 'method' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
                <th onclick="jbSortTable('beleg')" style="cursor: pointer; user-select: none;">Beleg${_jbSortCol === 'beleg' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
                ${canEdit ? '<th></th>' : ''}
              </tr>
            </thead>
            <tbody id="jbTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer text-muted small" id="jbCount"></div>
    </div>

    <!-- Modals für Zahlung und Positionen -->
    ${renderOverviewModals()}
  `;
}

function renderOverviewModals() {
  return `
    <!-- Modal: Zahlung -->
    <div class="modal fade" id="jbModalZahlung" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">💳 Zahlung erfassen</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="jbZahlungId">
            <div class="mb-3">
              <label class="form-label fw-semibold">Mitglied</label>
              <div class="form-control-plaintext fw-bold" id="jbZahlungName"></div>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Betrag</label>
              <div class="form-control-plaintext text-danger fw-bold" id="jbZahlungBetrag"></div>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Bezahlt am *</label>
              <input type="date" class="form-control" id="jbZahlungDatum">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Zahlungsmethode</label>
              <select class="form-select" id="jbZahlungMethode">
                <option>Überweisung</option>
                <option>Bar</option>
                <option>TWINT</option>
                <option>E-Banking</option>
                <option>Dauerauftrag</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Belegnummer / Referenz</label>
              <input type="text" class="form-control" id="jbZahlungBeleg" placeholder="z.B. REF-2026-001">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
            <button class="btn btn-success" onclick="jbSaveZahlung()">
              <i class="fas fa-check"></i> Zahlung speichern
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Positionen -->
    <div class="modal fade" id="jbModalPositionen" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-dark text-white">
            <h5 class="modal-title">📋 Rechnungsdetails</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="jbModalBody"></div>
        </div>
      </div>
    </div>
  `;
}

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
// TAB 3: EXCEL IMPORT TAB RENDER
// ============================================================
function renderExcelImportTab() {
  return `
    <div class="card border-0 shadow-sm p-4 bg-white">
      <h4 class="mb-3 text-primary"><i class="fas fa-file-excel me-2"></i>Excel Turnier-Import</h4>
      <p class="text-muted small">
        Hier können Sie die rohen Resultatsblätter aus dem <strong>Vereinswettschiessen</strong>, 
        <strong>Verbandsschiessen</strong> oder <strong>Dez-Import</strong> direkt hochladen. 
        Das System liest die Lizenzen aus und trägt die Teilnahmen vollautomatisch ein.
      </p>

      <div class="row g-4 mt-2">
        <div class="col-md-4">
          <div class="card p-3 border-dashed text-center h-100 bg-light" style="border: 2px dashed #ccc; cursor: pointer;" 
               onclick="document.getElementById('importFileVerein').click()">
            <input type="file" id="importFileVerein" class="d-none" accept=".xlsx,.xlsm,.xls,.csv" 
                   onchange="jbHandleExcelUpload(this.files[0], 'verein')">
            <i class="fas fa-trophy fa-2x mb-2 text-success"></i>
            <h6>1. Vereinswettschiessen</h6>
            <span class="text-muted small" style="font-size: 11px;">(Vereinswettschiessen.xlsx / .csv)</span>
            <div class="btn btn-sm btn-outline-success mt-3">Datei wählen</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card p-3 border-dashed text-center h-100 bg-light" style="border: 2px dashed #ccc; cursor: pointer;" 
               onclick="document.getElementById('importFileVerband').click()">
            <input type="file" id="importFileVerband" class="d-none" accept=".xlsx,.xlsm,.xls,.csv" 
                   onchange="jbHandleExcelUpload(this.files[0], 'verband')">
            <i class="fas fa-medal fa-2x mb-2 text-primary"></i>
            <h6>2. Verbandsschiessen</h6>
            <span class="text-muted small" style="font-size: 11px;">(Verband.xlsx / .csv)</span>
            <div class="btn btn-sm btn-outline-primary mt-3">Datei wählen</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card p-3 border-dashed text-center h-100 bg-light" style="border: 2px dashed #ccc;" 
               onclick="document.getElementById('importFileDez').click()" id="jbDezCard">
            <input type="file" id="importFileDez" class="d-none" accept=".xlsx,.xlsm,.xls,.csv"
                   multiple
                   onchange="jbHandleExcelUploadMulti(this.files, 'dez')">
            <i class="fas fa-chart-line fa-2x mb-2 text-warning"></i>
            <h6>3. Dez-Import (Dezember)</h6>
            <span class="text-muted small" style="font-size: 11px;">
              Mehrere Dateien möglich (Ctrl+Klick)<br>
              (Resultatblatt_1.xlsx, _2.xlsx / .csv)
            </span>
            <div id="jbDezFileCount" class="mt-2 d-none">
              <span class="badge bg-warning text-dark" id="jbDezFileBadge"></span>
            </div>
            <div class="btn btn-sm btn-outline-warning mt-2" style="cursor:pointer;">Datei(en) wählen</div>
          </div>
        </div>
      </div>

      <!-- Preview-Bereich für gelesene Excel-Daten -->
      <div id="jbImportPreviewContainer" class="mt-4 d-none">
        <hr>
        <h5 class="mb-3 d-flex justify-content-between align-items-center">
          <span>👀 Vorschau für importierte Daten:</span>
          <button class="btn btn-sm btn-success" onclick="jbSubmitExcelImport()">
            <i class="fas fa-cloud-upload-alt me-1"></i> Import in Google Sheets starten
          </button>
        </h5>
        <div class="table-responsive border rounded bg-light" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover table-sm mb-0">
            <thead class="table-dark sticky-top">
              <tr>
                <th>Lizenznummer</th>
                <th>Name (erkannt)</th>
                <th>Turnier / Event</th>
                <th>Status / Wert</th>
              </tr>
            </thead>
            <tbody id="jbImportPreviewBody"></tbody>
          </table>
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
    return `
      <button class="list-group-item list-group-item-action py-2 px-3 border-bottom d-flex justify-content-between align-items-center ${activeClass}" 
              onclick="jbEntrySelectMember('${m.PersonNumber}')" style="outline: none;">
        <div>
          <div class="fw-semibold" style="font-size: 13px;">${m.FirstName} ${m.LastName} ${modifiedBadge}</div>
          <div class="small text-muted" style="font-size: 11px; ${activeClass ? 'color: #cbd5e1 !important;' : ''}">${m.PersonNumber}</div>
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

    // Direkt aus dem lokalen Browser-Cache laden (Blitzschnell ohne API-Aufruf!)
    const memberParts = _jbParticipationsCache[pnClean] || [];

    // Initialisiere lokalen State für Radio-Buttons / Checkboxen
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
      lg_ch_kniend: false
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
    memberParts.forEach(p => {
      if (p.teilgenommen == 1) {
        // Event Key ermitteln und in State schreiben
        if (p.eventkey === 'KK001') _jbParticipationsState.kk_grenzland = '1';
        if (p.eventkey === 'KK006') _jbParticipationsState.kk_verband = true;
        if (p.eventkey === 'KK007') _jbParticipationsState.kk_verein = true;
        
        // 10m
        if (p.eventkey === 'LG001') _jbParticipationsState.lg_ag_dez = true;
        if (p.eventkey === 'LG002') _jbParticipationsState.lg_ag_dez_auflage = true;
        if (p.eventkey === 'LG003') _jbParticipationsState.lg_ch_dez = true;
        if (p.eventkey === 'LG004') _jbParticipationsState.lg_ch_dez_auflage = true;
        if (p.eventkey === 'LG005') _jbParticipationsState.lg_verband = true;
        if (p.eventkey === 'LG006') _jbParticipationsState.lg_verein = true;
        if (p.eventkey === 'LG007') _jbParticipationsState.lg_ch_kniend = true;
        
        // Volksschiessen Stiche (VBA: 1, 2 oder 3)
        if (p.eventkey === 'KK007' && p.quelle === 'volksschiessen') {
          _jbParticipationsState.kk_volksschiessen = '1';
        }
      }
    });

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
      
      <!-- LINKE SPALTE: Live-Kostenübersicht (Premium Glassmorphism Card) -->
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

      <!-- RECHTE SPALTE: Moderne Auswahlelemente (Pills, Sliders) -->
      <div class="col-md-7 d-flex flex-column overflow-y-auto pr-1" style="max-height: calc(100vh - 210px);">
        
        <!-- 1. Lizenz & Status -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <h6 class="text-secondary fw-bold mb-2" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-id-card me-2"></i>Lizenz & Status</h6>
          <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'keine' ? 'btn-primary' : 'bg-transparent text-muted'}" 
                    onclick="jbUpdateState('lizenz', 'keine', '${m.PersonNumber}')">Keine (Fremd)</button>
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'verein' ? 'btn-primary' : 'bg-transparent text-muted'}" 
                    onclick="jbUpdateState('lizenz', 'verein', '${m.PersonNumber}')">Eigener JB</button>
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'junior' ? 'btn-primary' : 'bg-transparent text-muted'}" 
                    onclick="jbUpdateState('lizenz', 'junior', '${m.PersonNumber}')">Jungschütze</button>
            <button class="btn btn-sm flex-fill rounded-2 border-0 py-2 ${_jbParticipationsState.lizenz === 'passiv' ? 'btn-primary' : 'bg-transparent text-muted'}" 
                    onclick="jbUpdateState('lizenz', 'passiv', '${m.PersonNumber}')">Passiv</button>
          </div>
        </div>

        <!-- 2. Kleinkaliber (50m) -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <h6 class="text-secondary fw-bold mb-3" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-bullseye me-2 text-danger"></i>50m Wettschiessen (KK)</h6>
          
          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">KK Volksschiessen (KK007)</label>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === 'keine' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('kk_volksschiessen', 'keine', '${m.PersonNumber}')">Kein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === '1' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('kk_volksschiessen', '1', '${m.PersonNumber}')">1 Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === '2' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('kk_volksschiessen', '2', '${m.PersonNumber}')">2 Stiche</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_volksschiessen === '3' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('kk_volksschiessen', '3', '${m.PersonNumber}')">3 Stiche</button>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">SSV dez (KK002/003/004/005)</label>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'keine' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('ssv_dez', 'keine', '${m.PersonNumber}')">Kein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'liegend' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('ssv_dez', 'liegend', '${m.PersonNumber}')">Liegend</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === '2-stellung' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('ssv_dez', '2-stellung', '${m.PersonNumber}')">2-Stellung</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === '3-stellung' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('ssv_dez', '3-stellung', '${m.PersonNumber}')">3-Stellung</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'liegend_2_3' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('ssv_dez', 'liegend_2_3', '${m.PersonNumber}')">L+2+3 St.</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.ssv_dez === 'js' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('ssv_dez', 'js', '${m.PersonNumber}')">JS Stich</button>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">KK Grenzland (KK001)</label>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_grenzland === 'keine' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('kk_grenzland', 'keine', '${m.PersonNumber}')">Kein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_grenzland === '1' ? 'btn-danger' : 'bg-transparent text-muted'}" 
                      onclick="jbUpdateState('kk_grenzland', '1', '${m.PersonNumber}')">Ein Stich</button>
              <button class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${_jbParticipationsState.kk_grenzland === 'js' ? 'btn-danger' : 'bg-transparent text-muted'}" 
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

// 5. State live aktualisieren
function jbUpdateState(key, val, pn) {
  const pnClean = String(pn || '').trim();
  _jbParticipationsState[key] = val;
  
  // Im Bulk-Speicher zwischenspeichern
  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean][key] = val;

  jbUpdateBulkSaveButton();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbRenderEntryForm(m);
  }
}

// 6. Formular-Reset (Alles auf Null)
function jbEntryResetForm(pn) {
  const pnClean = String(pn || '').trim();
  
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
    lg_ch_kniend: false
  };

  // Lokale Bulk-Changes für diesen Schützen aktualisieren
  _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  jbUpdateBulkSaveButton();
  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbRenderEntryForm(m);
  }
}

// 7. Speichern & Automatisch zum nächsten Schützen springen
// 7. Zwischenspeichern & Automatisch zum nächsten Schützen springen (Optimiert)
function jbEntrySaveAndNext(pn) {
  const pnClean = String(pn || '').trim();
  
  // Lokal im Browser-Bulk-Speicher sichern
  _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  
  // UI-Buttons und Sidebar-Badges aktualisieren
  jbUpdateBulkSaveButton();
  jbRenderEntryList();
  
  showToast(`💾 Änderungen für ${pnClean} im Browser zwischengespeichert!`);

  // Zum nächsten Mitglied wechseln
  jbEntrySelectNext();
}

// Navigiere zum nächsten Mitglied (Typensicher)
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

// Navigiere zum vorherigen Mitglied (Typensicher)
function jbEntrySelectPrev() {
  const currentIdx = _jbMembers.findIndex(m => String(m.PersonNumber || '').trim() === String(_jbSelectedMemberPN || '').trim());
  if (currentIdx > 0) {
    const prevPn = _jbMembers[currentIdx - 1].PersonNumber;
    jbEntrySelectMember(prevPn);
    jbScrollToActiveMember();
  }
}

// Scrollt die Liste zum aktiven Element
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

// Bulk-Save UI Button ansteuern
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

// Alle im Browser zwischengespeicherten Änderungen gesammelt speichern (Netzwerk-optimiert)
async function jbSaveAllBulkLocalChanges() {
  const count = Object.keys(_jbLocalBulkChanges).length;
  if (count === 0) return;

  const btn = document.querySelector('#jbBulkSaveContainer button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Speichere ' + count + ' Schützen…';
  }

  try {
    const list = [];
    const year = _jbYear;

    Object.entries(_jbLocalBulkChanges).forEach(([pn, state]) => {
      // Mapping von State auf Server-Eventkeys
      list.push({ pn, year, eventkey: 'KK007', teilgenommen: state.kk_volksschiessen !== 'keine' ? 1 : 0, quelle: 'volksschiessen' });
      
      const ssv = state.ssv_dez;
      list.push({ pn, year, eventkey: 'KK002', teilgenommen: (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK003', teilgenommen: (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK004', teilgenommen: (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK005', teilgenommen: ssv === 'sv' ? 1 : 0 });
      
      list.push({ pn, year, eventkey: 'KK001', teilgenommen: state.kk_grenzland !== 'keine' ? 1 : 0 });
      list.push({ pn, year, eventkey: 'KK006', teilgenommen: state.kk_verband ? 1 : 0 });
      if (state.kk_volksschiessen === 'keine') {
        list.push({ pn, year, eventkey: 'KK007', teilgenommen: state.kk_verein ? 1 : 0 });
      }

      list.push({ pn, year, eventkey: 'LG001', teilgenommen: state.lg_ag_dez ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG002', teilgenommen: state.lg_ag_dez_auflage ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG003', teilgenommen: state.lg_ch_dez ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG004', teilgenommen: state.lg_ch_dez_auflage ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG005', teilgenommen: state.lg_verband ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG006', teilgenommen: state.lg_verein ? 1 : 0 });
      list.push({ pn, year, eventkey: 'LG007', teilgenommen: state.lg_ch_kniend ? 1 : 0 });
    });

    // 1. In Google Sheets speichern via Bulk-API
    const resSave = await apiFetch('jahresbeitrag', '', {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveParticipationsBulk',
        list: list,
        user: window.currentUser || 'frontend'
      })
    });
    const saveJson = await resSave.json();
    if (!saveJson.success) throw new Error(saveJson.error);

    // 2. Beiträge für das aktive Jahr komplett neu berechnen
    const resCalc = await apiFetch('jahresbeitrag', `action=berechnen&year=${year}`);
    const calcJson = await resCalc.json();
    if (!calcJson.success) throw new Error(calcJson.error);

    showToast(`🎉 ${count} Schützen erfolgreich gespeichert und Beiträge neu berechnet!`);
    
    // Speicher leeren & UI aktualisieren
    _jbLocalBulkChanges = {};
    jbUpdateBulkSaveButton();
    await loadJahresbeitragData();
    
    // Aktuellen Schützen neu laden
    if (_jbSelectedMemberPN) {
      jbEntrySelectMember(_jbSelectedMemberPN);
    }
  } catch(e) {
    alert("Fehler beim Bulk-Speichern: " + e.message);
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

  // Mausrad (Wheel) Unterstützung
  listEl.addEventListener('wheel', function(e) {
    e.preventDefault();
    if (e.deltaY > 0) {
      jbEntrySelectNext();
    } else {
      jbEntrySelectPrev();
    }
  });

  // Tastatursteuerung (Pfeil Rauf / Pfeil Runter)
  // Wird registriert sobald die Schnellerfassung aktiv ist
  document.onkeydown = function(e) {
    if (_jbActiveTab !== 'entry' || !_jbSelectedMemberPN) return;
    
    // Prüfen, ob wir in einem Eingabefeld (z.B. Suche) schreiben
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

// ============================================================
// CLIENT-SEITIGER DATEI-IMPORTPARSER (Excel & CSV)
// ============================================================
function jbHandleExcelUpload(file, type) {
  if (!file) return;

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();

  if (isCsv) {
    reader.onload = function(e) {
      try {
        const text = e.target.result;
        const parsedRows = jbParseCSV(text);
        jbProcessExcelRows(parsedRows, type);
      } catch(err) {
        alert("Fehler beim Lesen der CSV-Datei: " + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        console.log('📂 Sheets in der Datei:', workbook.SheetNames);

        let bestSheet = workbook.SheetNames[0];
        let bestScore = -1;

        // Priorität 1: Sheet namens "Resultatblatt" (case-insensitive) bevorzugen
        const foundResultatblatt = workbook.SheetNames.find(s => s.toLowerCase().trim() === 'resultatblatt');
        if (foundResultatblatt) {
          bestSheet = foundResultatblatt;
          console.log('🎯 Prio 1: Sheet "Resultatblatt" direkt gewählt:', bestSheet);
        } else {
          // Fallback: Bestes Sheet finden: dasjenige mit den meisten Header-Keywords
          // (nicht immer Sheet 1 – z.B. Verbandsschiessen hat Daten auf Sheet 6)
          const SCORE_KEYWORDS = [
            'lizenz', 'ausweis', 'liz', 'total', 'resultat', 'ergebnis',
            'punkte', 'passe', 'stich', 'name', 'vorname', 'jahrgang'
          ];

          workbook.SheetNames.forEach(sheetName => {
            const ws = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            let score = 0;
            // Scanne erste 40 Zeilen nach Keywords
            for (let r = 0; r < Math.min(rows.length, 40); r++) {
              const row = rows[r] || [];
              for (let c = 0; c < row.length; c++) {
                const val = String(row[c] || '').toLowerCase().trim();
                if (SCORE_KEYWORDS.some(k => val.includes(k))) score++;
              }
            }
            console.log('  Sheet "' + sheetName + '": Score ' + score);
            if (score > bestScore) {
              bestScore = score;
              bestSheet = sheetName;
            }
          });
        }

        console.log('✅ Verwende Sheet:', bestSheet, '(Score ' + bestScore + ')');

        const worksheet = workbook.Sheets[bestSheet];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        jbProcessExcelRows(jsonRows, type);
      } catch(err) {
        alert("Fehler beim Lesen der Excel-Datei: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

// Multi-Datei Upload für Dez (akkumuliert alle Dateien in einer Vorschau)
async function jbHandleExcelUploadMulti(files, type) {
  if (!files || files.length === 0) return;

  // Vorschau und Daten zurücksetzen
  _jbImportData = [];
  const previewBody = document.getElementById('jbImportPreviewBody');
  const previewContainer = document.getElementById('jbImportPreviewContainer');
  previewBody.innerHTML = '';
  previewContainer.classList.add('d-none');

  // Badge anzeigen
  const badge = document.getElementById('jbDezFileBadge');
  const badgeContainer = document.getElementById('jbDezFileCount');
  if (badge && badgeContainer) {
    badge.textContent = files.length + ' Datei' + (files.length > 1 ? 'en ausgewählt' : ' ausgewählt');
    badgeContainer.classList.remove('d-none');
  }

  // Dateien sequenziell verarbeiten (append=true ab 2. Datei)
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isAppend = i > 0;
    await new Promise((resolve) => {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const reader = new FileReader();
      if (isCsv) {
        reader.onload = function(e) {
          try {
            const parsedRows = jbParseCSV(e.target.result);
            jbProcessExcelRows(parsedRows, type, isAppend);
          } catch(err) {
            alert('Fehler in Datei ' + file.name + ': ' + err.message);
          }
          resolve();
        };
        reader.readAsText(file, 'UTF-8');
      } else {
        reader.onload = function(e) {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            let bestSheet = workbook.SheetNames[0];
            let bestScore = -1;

            // Priorität 1: Sheet namens "Resultatblatt" (case-insensitive) bevorzugen
            const foundResultatblatt = workbook.SheetNames.find(s => s.toLowerCase().trim() === 'resultatblatt');
            if (foundResultatblatt) {
              bestSheet = foundResultatblatt;
              console.log('🎯 Prio 1 (Multi): Sheet "Resultatblatt" direkt gewählt:', bestSheet);
            } else {
              const SCORE_KW = ['lizenz','name','vorname','jahrgang','kat','ssv','agsv'];
              workbook.SheetNames.forEach(sheetName => {
                const ws = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                let score = 0;
                for (let r = 0; r < Math.min(rows.length, 15); r++) {
                  (rows[r] || []).forEach(cell => {
                    const v = String(cell || '').toLowerCase();
                    if (SCORE_KW.some(k => v.includes(k))) score++;
                  });
                }
                if (score > bestScore) { bestScore = score; bestSheet = sheetName; }
              });
            }
            const ws = workbook.Sheets[bestSheet];
            const jsonRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            jbProcessExcelRows(jsonRows, type, isAppend);
          } catch(err) {
            alert('Fehler in Datei ' + file.name + ': ' + err.message);
          }
          resolve();
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }
}

// CSV Parser Hilfsfunktion (Semikolon, Komma und Tabulator)
function jbParseCSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    let parts = line.split(';');
    if (parts.length <= 1) {
      parts = line.split(',');
    }
    if (parts.length <= 1) {
      parts = line.split('\t');
    }
    return parts.map(p => {
      p = p.trim();
      if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
      return p;
    });
  });
}

function jbProcessExcelRows(rows, type, appendMode) {
  if (!rows || rows.length < 5) {
    alert("Die Import-Datei enthält keine brauchbaren Zeilen oder ist leer.");
    return;
  }

  // appendMode=true: Daten akkumulieren (Dez mit 2 Dateien)
  // appendMode=false/undefined: neu starten
  if (!appendMode) {
    _jbImportData = [];
    const previewBody = document.getElementById('jbImportPreviewBody');
    const previewContainer = document.getElementById('jbImportPreviewContainer');
    previewBody.innerHTML = '';
    previewContainer.classList.add('d-none');
  }

  const previewBody = document.getElementById('jbImportPreviewBody');
  const previewContainer = document.getElementById('jbImportPreviewContainer');

  let detectedCount = 0;

  // ============================================================
  // DEBUG: Alle Rohdaten in Konsole ausgeben
  // ============================================================
  console.group('🔍 DEBUG Excel-Import – Typ: ' + type);
  console.log('Anzahl Zeilen gesamt:', rows.length);
  console.log('Erste 30 Rohdaten-Zeilen:');
  rows.slice(0, 30).forEach((row, i) => {
    console.log(`  Zeile ${i}:`, row);
  });
  console.groupEnd();

  // Debug-Panel im HTML anzeigen (temporär – wird nach Import ausgeblendet)
  let debugHtml = `
    <div id="jbDebugPanel" style="
      background: #1e1e2e; color: #cdd6f4; font-family: monospace; font-size: 11px;
      padding: 12px; border-radius: 8px; margin-top: 16px; max-height: 350px;
      overflow-y: auto; border: 2px solid #89b4fa;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong style="color:#89dceb">🔍 DEBUG: Rohdaten Excel-Import (Typ: <span style="color:#a6e3a1">${type}</span>)</strong>
        <button onclick="document.getElementById('jbDebugPanel').remove()" 
                style="background:#f38ba8; color:#1e1e2e; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:10px;">✕ Schliessen</button>
      </div>
      <div style="color:#f9e2af; margin-bottom:6px">Gesamtzeilen: <strong>${rows.length}</strong> | Erste 30 Zeilen angezeigt:</div>
      <table style="width:100%; border-collapse:collapse; font-size:10px;">
        <thead><tr style="background:#313244; color:#89b4fa; position:sticky; top:0;">
          <th style="padding:3px 6px; text-align:left; border-bottom:1px solid #45475a">Zeile #</th>
          <th style="padding:3px 6px; text-align:left; border-bottom:1px solid #45475a">Zellen-Inhalt (alle Spalten)</th>
        </tr></thead>
        <tbody>
  `;
  rows.slice(0, 30).forEach((row, i) => {
    const cellsHtml = (row || []).map((cell, ci) => {
      const v = String(cell ?? '');
      const highlight = v.length > 0 ? 'color:#a6e3a1;' : 'color:#6c7086;';
      return `<span style="${highlight}" title="Spalte ${ci}">[${ci}]:${v || '–'}</span>`;
    }).join(' &nbsp; ');
    const rowBg = i % 2 === 0 ? 'background:#1e1e2e' : 'background:#181825';
    debugHtml += `<tr style="${rowBg}">
      <td style="padding:2px 6px; color:#cba6f7; white-space:nowrap">${i}</td>
      <td style="padding:2px 6px; white-space:pre-wrap; word-break:break-all">${cellsHtml || '<span style="color:#6c7086">–leer–</span>'}</td>
    </tr>`;
  });
  debugHtml += `</tbody></table></div>`;

  // Debug-Panel nach dem previewContainer einfügen
  const existingDebug = document.getElementById('jbDebugPanel');
  if (existingDebug) existingDebug.remove();
  previewContainer.insertAdjacentHTML('beforebegin', debugHtml);

  // DYNAMISCHE SPALTENERKENNUNG (Erweiterte Keywords)
  let colLizenzIdx = 1; // Default Spalte B (1)
  let colPruefIdx = 8;  // Default Spalte I (8)
  let startRowIdx = 18; // Default Zeile 19 (18)

  // ---------------------------------------------------------------
  // VERBESSERTE KOPFZEILEN-ERKENNUNG:
  // Statt "letzter Treffer gewinnt" → Zeile mit den meisten Header-
  // Treffern auswählen (robuster gegenüber Keywords in Datenzellen)
  // ---------------------------------------------------------------
  const LIZENZ_KEYWORDS  = ['lizenznr', 'lizenz-nr', 'lizenz nr', 'ausweisnr', 'ausweis-nr',
                             'lizenznummer', 'ausweisnummer', 'liz.nr', 'lznr', 'liz nr',
                             'adressnr', 'adress-nr', 'adressnummer',
                             'mitglied-nr', 'mitgliedernr', 'mitgliedsnr',
                             'person-nr', 'personennr', 'person nr'];
  // Fuzzy-Fallbacks (nur wenn kein exakter Treffer):
  const LIZENZ_FUZZY     = ['lizenz', 'ausweis', 'adress'];
  const PRUEF_KEYWORDS   = ['total', 'resultat', 'ergebnis', 'punkte', 'score',
                             'prüfwert', 'pruefwert', '1. passe', 'passe', 'stich',
                             'wert', 'ring'];

  let bestHeaderRow = -1;
  let bestHeaderScore = 0;

  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r];
    if (!row) continue;
    let score = 0;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toLowerCase().trim();
      // Exact keyword → strong signal
      if (LIZENZ_KEYWORDS.some(k => val === k || val.startsWith(k)))  score += 3;
      if (PRUEF_KEYWORDS.some(k  => val === k || val.startsWith(k)))  score += 2;
      // Fuzzy keyword → weak signal (avoid false positives in data cells)
      if (LIZENZ_FUZZY.some(k => val.includes(k)))                    score += 1;
      // Generic header patterns (short alphabetic cells = likely headers)
      if (/^[a-zäöüA-ZÄÖÜ\s\-.]{2,20}$/.test(val) && val.length < 20) score += 0.5;
    }
    if (score > bestHeaderScore) {
      bestHeaderScore = score;
      bestHeaderRow = r;
    }
  }

  if (bestHeaderRow >= 0) {
    startRowIdx = bestHeaderRow + 1;
    const headerRow = rows[bestHeaderRow];

    // Spalten aus der besten Kopfzeile bestimmen (erster Treffer gewinnt)
    let lizenzFound = false;
    let pruefFound  = false;
    for (let c = 0; c < headerRow.length; c++) {
      const val = String(headerRow[c] || '').toLowerCase().trim();
      if (!lizenzFound) {
        if (LIZENZ_KEYWORDS.some(k => val === k || val.startsWith(k)) ||
            LIZENZ_FUZZY.some(k => val.includes(k))) {
          colLizenzIdx = c;
          lizenzFound = true;
        }
      }
      if (!pruefFound) {
        if (PRUEF_KEYWORDS.some(k => val === k || val.startsWith(k))) {
          colPruefIdx = c;
          pruefFound = true;
        }
      }
    }

    // Fallback: Wenn kein Prüfwert gefunden, nach der ersten Spalte mit
    // rein numerischem Inhalt in den ersten Datenzeilen suchen
    if (!pruefFound && startRowIdx < rows.length) {
      for (let c = 0; c < (rows[startRowIdx] || []).length; c++) {
        if (c === colLizenzIdx) continue;
        const sampleVals = [];
        for (let sr = startRowIdx; sr < Math.min(startRowIdx + 5, rows.length); sr++) {
          const v = Number(String((rows[sr] || [])[c] || '').replace(',', '.'));
          if (!isNaN(v) && v > 0) sampleVals.push(v);
        }
        if (sampleVals.length >= 2) { colPruefIdx = c; pruefFound = true; break; }
      }
    }

    console.log('📋 Beste Kopfzeile (Zeile ' + bestHeaderRow + ', Score ' + bestHeaderScore.toFixed(1) + '):', headerRow);
  } else {
    console.warn('⚠️ Keine Kopfzeile erkannt – verwende Standardwerte');
  }

  // Debug: Erkannte Spalten in Konsole und Panel loggen
  console.log('🔎 Erkannte Spalten:', { colLizenzIdx, colPruefIdx, startRowIdx, type });
  const detectedInfo = document.getElementById('jbDebugPanel');
  if (detectedInfo) {
    detectedInfo.insertAdjacentHTML('beforeend', `
      <div style="margin-top:8px; padding:6px 8px; background:#313244; border-radius:6px; color:#f9e2af; font-size:11px;">
        <strong>🎯 Erkannte Parameter:</strong>
        &nbsp; Lizenz-Spalte: <span style="color:#a6e3a1"><strong>[${colLizenzIdx}]</strong></span>
        &nbsp; Prüf-Spalte: <span style="color:#fab387"><strong>[${colPruefIdx}]</strong></span>
        &nbsp; Daten ab Zeile: <span style="color:#89dceb"><strong>${startRowIdx}</strong></span>
        &nbsp; Typ: <span style="color:#cba6f7"><strong>${type}</strong></span>
      </div>
    `);
  }

  if (type === 'verein' || type === 'verband') {
    const eventKey = type === 'verein' ? EVENT_KEYS.kk_verein : EVENT_KEYS.kk_verband;
    const eventName = type === 'verein' ? '50m Vereinsschiessen' : '50m Verbandsschiessen';

    for (let i = startRowIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length <= colLizenzIdx) continue;

      const rawLizenz = String(row[colLizenzIdx] || '').trim();
      const cleanedLizenz = rawLizenz.replace(/\D/g, '');
      // Normalisierung: auf 6 Stellen mit führenden Nullen (Excel schneidet diese oft ab)
      const normLizenz = cleanedLizenz.padStart(6, '0');

      // Falls Spalte out-of-bounds, scannen wir die Zeile nach dem ersten Spaltenwert, der ein Score > 0 ist
      let rawPruef = 0;
      if (row[colPruefIdx] !== undefined) {
        rawPruef = Number(String(row[colPruefIdx] || '0').replace(',', '.'));
      } else {
        for (let c = 0; c < row.length; c++) {
          if (c === colLizenzIdx) continue;
          const val = Number(String(row[c] || '0').replace(',', '.'));
          if (!isNaN(val) && val > 0) {
            rawPruef = val;
            break;
          }
        }
      }

      // Validierung: Lizenznummer muss mind. 4 Ziffern haben UND es muss tatsächlich geschossen worden sein (Resultat > 0)
      if (cleanedLizenz.length >= 4 && !isNaN(rawPruef) && rawPruef > 0) {
        // Matching via AddressNumber (= SSV-Lizenznummer / Mitgliederausweis-Nr.)
        // PersonNumber wird für die Speicherung verwendet (Beitragslogik)
        // Beide Seiten auf 6 Stellen normalisiert (führende Nullen)
        const m = _jbMembers.find(x => String(x.AddressNumber || '').replace(/\D/g, '').padStart(6, '0') === normLizenz);
        const memberName = m ? `${m.FirstName} ${m.LastName}` : '⚠️ Unbekanntes Mitglied';
        const memberPN = m ? m.PersonNumber : '';

        _jbImportData.push({
          pn: m ? m.PersonNumber : null, // null = kein Match, wird beim Submit übersprungen
          year: _jbYear,
          eventkey: eventKey,
          teilgenommen: 1,
          quelle: 'excel-import'
        });

        previewBody.innerHTML += `
          <tr>
            <td>${cleanedLizenz}</td>
            <td class="${m ? '' : 'text-danger fw-bold'}">${memberName}${memberPN ? `<br><small class="text-muted">${memberPN}</small>` : ''}</td>
            <td>${eventName}</td>
            <td><span class="badge bg-${m ? 'success' : 'danger'}">${m ? 'Erkannt' : 'Kein Match'}</span></td>
          </tr>
        `;
        detectedCount++;
      }
    }
  } else if (type === 'dez') {
    // ================================================================
    // DEZ-IMPORT: 1:1 Port der VBA-Logik aus Modul08d_Import_Dez.bas
    //
    // Spalten im Resultatblatt (0-basiert):
    //   [0]  A: Lizenznummer (AdressNummer)
    //   [8]  I: Altersklasse (z.B. U17, U21, E, V, SV)
    //   [9]  J: SSV-Teilnahme / CH DEZ  → wenn nicht leer = teilgenommen
    //   [10] K: AG DEZ (1D)             → wenn nicht leer = teilgenommen
    //   [11] L: Score liegend (L)
    //   [13] N: Score N
    //   [14] O: Score O
    //   [16] Q: Score Q (2D)
    //   [17] R: Score R (3D)
    //
    // Daten ab Zeile 5 (Index 4), Zeile 4 = Kopfzeile mit Spaltennummern
    // Lizenznummer: numerisch vergleichen (CLng), führende Nullen egal
    // ================================================================

    // Startzeile ermitteln: erste Zeile nach der Kopfzeile mit 'Lizenz' in Spalte A
    let dezStartRow = 4; // VBA: ab Zeile 5 = Index 4
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const val = String((rows[r] || [])[0] || '').toLowerCase().trim();
      if (val === 'lizenz') {
        dezStartRow = r + 2; // +1 für Spaltenbezeichnungs-Unterzeile (SSV/AGSV etc.)
        break;
      }
    }

    for (let i = dezStartRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      // Lizenznummer: nur Ziffern, mind. 4 Stellen (VBA: Len >= 4)
      const rawLizenz = String(row[0] || '').trim();
      const cleanedLizenz = rawLizenz.replace(/\D/g, '');
      if (cleanedLizenz.length < 4) continue;

      // Numerischer Vergleich: führende Nullen auf beiden Seiten ignorieren
      const normLizenz = cleanedLizenz.padStart(6, '0');

      // Mitglied via AddressNumber suchen (VBA: CLng-Vergleich)
      const m = _jbMembers.find(x =>
        String(x.AddressNumber || '').replace(/\D/g, '').padStart(6, '0') === normLizenz
      );
      if (!m) continue;

      // Altersklasse (VBA: col I = Index 8)
      const ageClass = String(row[8] || '').trim().toUpperCase();
      const isJunior = ageClass === 'U17' || ageClass === 'U21';

      // Scores (VBA: L=col12/idx11, N=col14/idx13, O=col15/idx14, Q=col17/idx16, R=col18/idx17)
      const valueL = Number(String(row[11] || '0').replace(',', '.')) || 0;
      const valueN = Number(String(row[13] || '0').replace(',', '.')) || 0;
      const valueO = Number(String(row[14] || '0').replace(',', '.')) || 0;
      const valueQ = Number(String(row[16] || '0').replace(',', '.')) || 0;
      const valueR = Number(String(row[17] || '0').replace(',', '.')) || 0;

      // Teilnahme-Felder: nicht-leer = teilgenommen (VBA: <> "")
      const colJ = String(row[9]  || '').trim(); // SSV / CH DEZ
      const colK = String(row[10] || '').trim(); // AG DEZ

      let matchedEvents = [];

      if (isJunior) {
        // VBA: Jugend → Cyan einfärben, Wert 0
        // J nicht leer → CH DEZ (50m CH DEZ)
        // K nicht leer → AG DEZ 1D
        // sonst → SV DEZ
        if (colJ !== '' && colJ !== '-') {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend, name: '50m CH DEZ (Junior)' });
        } else if (colK !== '' && colK !== '-') {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend, name: '50m AG DEZ 1D (Junior)' });
        } else {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_sv, name: '50m AG DEZ SV (Junior)' });
        }
      } else {
        // VBA: Erwachsene → normale Prüfung mit Score > 200

        // J nicht leer UND (L>200 ODER Q>200 ODER R>200) → CH DEZ
        if (colJ !== '' && colJ !== '-') {
          if (valueL > 200 || valueQ > 200 || valueR > 200) {
            matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend, name: '50m CH DEZ' });
          }
        }

        // K nicht leer → AG DEZ nach Scores
        if (colK !== '' && colK !== '-') {
          if (valueL > 200) matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend,   name: '50m AG DEZ 1D' });
          if (valueQ > 200) matchedEvents.push({ key: EVENT_KEYS.ssv_dez_2stellung, name: '50m AG DEZ 2D' });
          if (valueR > 200) matchedEvents.push({ key: EVENT_KEYS.ssv_dez_3stellung, name: '50m AG DEZ 3D' });
        }

        // J leer UND (N>200 ODER O>200) → SV DEZ
        if ((colJ === '' || colJ === '-') && (valueN > 200 || valueO > 200)) {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_sv, name: '50m AG DEZ SV' });
        }
      }

      matchedEvents.forEach(evt => {
        _jbImportData.push({
          pn: m.PersonNumber,
          year: _jbYear,
          eventkey: evt.key,
          teilgenommen: 1,
          quelle: 'excel-import-dez'
        });

        previewBody.innerHTML += `
          <tr>
            <td>${cleanedLizenz}</td>
            <td>${m.FirstName} ${m.LastName}<br><small class="text-muted">${m.PersonNumber}</small></td>
            <td>${evt.name} <span class="badge bg-secondary ms-1" style="font-size:9px">${ageClass||'E'}</span></td>
            <td><span class="badge bg-success">Erkannt</span></td>
          </tr>
        `;
        detectedCount++;
      });
    }
  }

  if (detectedCount > 0) {
    previewContainer.classList.remove('d-none');
    showToast(`✅ ${detectedCount} Turnierteilnahmen erfolgreich analysiert!`);
  } else {
    const debugMsg = `Es wurden keine gültigen Einträge gefunden.\n\n` +
      `Erkannte Parameter:\n` +
      `  • Lizenz-Spalte: [${colLizenzIdx}]\n` +
      `  • Prüfwert-Spalte: [${colPruefIdx}]\n` +
      `  • Daten ab Zeile: ${startRowIdx}\n` +
      `  • Gesamtzeilen: ${rows.length}\n\n` +
      `Bitte Debug-Panel prüfen: Ist die Lizenznummer in Spalte [${colLizenzIdx}]? ` +
      `Hat Spalte [${colPruefIdx}] Zahlenwerte > 0?`;
    alert(debugMsg);
  }
}

// Sende gelesene Excel-Importe an das Apps Script Backend
async function jbSubmitExcelImport() {
  if (!_jbImportData || !_jbImportData.length) return;

  const btn = document.querySelector('button[onclick="jbSubmitExcelImport()"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Übertrage…';

  try {
    // Nur Einträge mit gültigem PersonNumber-Match senden (null = kein AddressNumber-Match)
    const validList = _jbImportData.filter(x => x.pn !== null && x.pn !== '');
    const skippedCount = _jbImportData.length - validList.length;
    if (skippedCount > 0) {
      console.warn(`⚠️ ${skippedCount} Einträge ohne Mitglieder-Match (AddressNumber nicht gefunden) werden übersprungen.`);
    }
    if (!validList.length) {
      alert('Keine gültigen Einträge zum Importieren (kein Mitglied via AddressNumber gefunden).');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> Import in Google Sheets starten';
      return;
    }

    const res = await apiFetch('jahresbeitrag', '', {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveParticipationsBulk',
        list: validList,
        user: window.currentUser || 'frontend'
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`🎉 ${json.message}`);
    document.getElementById('jbImportPreviewContainer').classList.add('d-none');
    _jbImportData = null;

    // Daten im Backend neu berechnen
    await jbBerechnen();
  } catch(e) {
    alert("Fehler beim Hochladen der Daten: " + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> Import in Google Sheets starten';
  }
}

// ============================================================
// TAB 1 UTILS (CLASSIC CALCULATOR & PAYMENT HANDLERS)
// ============================================================

function jbRenderRows(data) {
  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));
  const tbody = document.getElementById('jbTableBody');
  if (!tbody) return;

  tbody.innerHTML = data.map(r => {
    const m    = _jbMemberMap[String(r.PersonNumber)] || {};
    const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : (r._name || r.PersonNumber);
    const kat  = (m._kategorie || '').replace('Aktiv-', 'Aktiv ');
    const isOffen = r.status !== 'bezahlt';

    return `<tr>
      <td>
        <a href="#" class="text-decoration-none fw-semibold"
           onclick="jbShowPositionen(${r.id}); return false;">${name}</a>
        <div class="text-muted small">${r.PersonNumber}</div>
      </td>
      <td><span class="badge bg-secondary">${kat || '–'}</span></td>
      <td class="text-end fw-bold">${fmtChf(r.Gesamt)}</td>
      <td>
        <span class="badge ${isOffen ? 'bg-danger' : 'bg-success'}">
          ${r.status || 'offen'}
        </span>
      </td>
      <td class="small">${fmtDate(r.payment_date)}</td>
      <td class="small">${r.payment_method || '–'}</td>
      <td class="small">${r.document_ref || '–'}</td>
      ${canEdit ? `
      <td>
        ${isOffen ? `
          <button class="btn btn-xs btn-success btn-sm py-0 px-2"
                  onclick="jbOpenZahlung(${r.id}, '${name}', ${r.Gesamt})"
                  title="Zahlung erfassen">
            <i class="fas fa-check"></i>
          </button>` : ''}
      </td>` : ''}
    </tr>`;
  }).join('');

  document.getElementById('jbCount').textContent =
    `${data.length} Einträge · ${data.filter(r => r.status !== 'bezahlt').length} offen`;
}

function jbFilter() {
  const search = (document.getElementById('jbSearch')?.value || '').toLowerCase();
  const status = document.getElementById('jbStatusFilter')?.value || '';

  const filtered = _jbData.filter(r => {
    const m    = _jbMemberMap[String(r.PersonNumber)] || {};
    const name = ((m.FirstName || '') + ' ' + (m.LastName || '') + ' ' + r.PersonNumber).toLowerCase();
    const matchSearch = !search || name.includes(search);
    const matchStatus = !status || r.status === status ||
      (status === 'offen' && r.status !== 'bezahlt');
    return matchSearch && matchStatus;
  });

  jbRenderRows(filtered);
}

let _jbModalParticipationsState = {}; // Modal-spezifischer Teilnahmen-State

async function jbShowPositionen(headerId) {
  const modalEl = document.getElementById('jbModalPositionen');
  const modal = new bootstrap.Modal(modalEl);
  
  const modalBody = document.getElementById('jbModalBody');
  modalBody.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-2 text-muted">Lade Rechnungsdetails…</p>
    </div>`;
  modal.show();

  try {
    // 1. Hole Rechnungskopf direkt aus der lokalen Liste in Memory (Bypasst API-Aufruf!)
    const header = _jbData.find(x => String(x.id) === String(headerId));
    if (!header) throw new Error('Beitragsrechnung nicht gefunden: ' + headerId);

    const pn = String(header.PersonNumber || '').trim();
    const m = _jbMemberMap[pn] || {};
    const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : pn;

    // 2. Hole Positionen direkt aus dem lokalen Browser-Cache! (Bypasst API-Aufruf, absolut instant!)
    const pos = _jbPositionsCache[headerId] || [];

    // 3. Hole Teilnahmen direkt aus dem lokalen Browser-Cache! (Bypasst API-Aufruf, absolut instant!)
    const memberParts = _jbParticipationsCache[pn] || [];

    // Initialisiere den modalen State exakt analog zur Schnellerfassung
    _jbModalParticipationsState = {
      lizenz: m._istPassiv ? 'passiv' : 'verein',
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
      lg_ch_kniend: false
    };

    // Lizenz-Defaulting
    const ownLiz = (m._lizenzen || []).find(l => l.istMuhen);
    if (ownLiz) {
      const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
      _jbModalParticipationsState.lizenz = (age > 0 && age <= 20) ? 'junior' : 'verein';
    } else if ((m._lizenzen || []).length > 0) {
      _jbModalParticipationsState.lizenz = 'fremd';
    } else if (m._istPassiv) {
      _jbModalParticipationsState.lizenz = 'passiv';
    } else {
      _jbModalParticipationsState.lizenz = 'keine';
    }

    // Teilnahmen in den modalen State einpflegen
    memberParts.forEach(p => {
      if (p.teilgenommen == 1) {
        if (p.eventkey === 'KK001') _jbModalParticipationsState.kk_grenzland = '1';
        if (p.eventkey === 'KK006') _jbModalParticipationsState.kk_verband = true;
        if (p.eventkey === 'KK007') _jbModalParticipationsState.kk_verein = true;
        if (p.eventkey === 'LG001') _jbModalParticipationsState.lg_ag_dez = true;
        if (p.eventkey === 'LG002') _jbModalParticipationsState.lg_ag_dez_auflage = true;
        if (p.eventkey === 'LG003') _jbModalParticipationsState.lg_ch_dez = true;
        if (p.eventkey === 'LG004') _jbModalParticipationsState.lg_ch_dez_auflage = true;
        if (p.eventkey === 'LG005') _jbModalParticipationsState.lg_verband = true;
        if (p.eventkey === 'LG006') _jbModalParticipationsState.lg_verein = true;
        if (p.eventkey === 'LG007') _jbModalParticipationsState.lg_ch_kniend = true;
        if (p.eventkey === 'KK007' && p.quelle === 'volksschiessen') {
          _jbModalParticipationsState.kk_volksschiessen = '1';
        }
      }
    });

    // Render das tabellarische Layout im Modal
    jbRenderModalContent(header, pos, m, name);
  } catch(e) {
    modalBody.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  }
}

function jbRenderModalContent(header, pos, m, name) {
  const modalBody = document.getElementById('jbModalBody');
  const isPaid = header.status === 'bezahlt';

  // Positions-Tabelle für Reiter 1
  const posRows = pos.map(p => `
    <tr>
      <td>${p.position_nr}</td>
      <td>${p.beschreibung}</td>
      <td>
        <span class="badge ${p.typ === 'Kredit' ? 'bg-success' : 'bg-primary'}">${p.typ}</span>
      </td>
      <td class="text-end ${p.typ === 'Kredit' ? 'text-success' : ''}">${fmtChf(p.betrag)}</td>
    </tr>
  `).join('');

  // 1. RECHNUNDSPOSTEN TAB CONTENT
  const tabPostenHTML = `
    <div id="jbModalTabPosten" class="jb-modal-tab-content">
      <div class="table-responsive">
        <table class="table table-hover table-sm">
          <thead class="table-light">
            <tr><th>#</th><th>Beschreibung</th><th>Typ</th><th class="text-end">Betrag</th></tr>
          </thead>
          <tbody>${posRows}</tbody>
          <tfoot class="fw-bold">
            <tr class="table-secondary">
              <td colspan="3" class="text-end">Gesamt</td>
              <td class="text-end">${fmtChf(header.Gesamt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${header.payment_date ? `
        <div class="alert alert-success small mb-0 d-flex align-items-center">
          <i class="fas fa-check-circle me-2 fs-5"></i>
          <div>
            <strong>Bezahlt am ${fmtDate(header.payment_date)}</strong><br>
            via ${header.payment_method || '–'} · Beleg: ${header.document_ref || '–'}
          </div>
        </div>` : ''}
    </div>
  `;

  // 2. BEARBEITEN TAB CONTENT
  const calc = jbCalculateLiveTotal(m, _jbModalParticipationsState);
  const isJunior = m.BirthDate ? ((new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) <= 20) : false;

  const tabBearbeitenHTML = `
    <div id="jbModalTabBearbeiten" class="jb-modal-tab-content d-none">
      ${isPaid ? `
        <div class="alert alert-warning py-2 mb-3 small fw-semibold">
          <i class="fas fa-exclamation-triangle me-2 text-warning"></i>
          <strong>Zahlungs-Warnhinweis:</strong> Diese Rechnung wurde bereits als <strong>BEZAHLT</strong> markiert! 
          Änderungen an den Posten können zu Differenzen zwischen erhaltenem Geld und Soll-Betrag führen.
        </div>` : ''}

      <div class="row g-3">
        <!-- Live-Summe links -->
        <div class="col-md-5 d-flex flex-column">
          <div class="card p-3 shadow-sm border-0 bg-light flex-fill d-flex flex-column rounded-3">
            <div class="mb-2 border-bottom pb-2">
              <h6 class="mb-0 text-primary">${m.FirstName} ${m.LastName}</h6>
              <small class="text-muted">${header.PersonNumber} · ${isJunior ? 'Junior' : 'Erwachsen'}</small>
            </div>
            
            <div class="flex-fill overflow-y-auto mb-2" style="max-height: 200px;" id="jbModalLivePositions">
              <!-- Postenübersicht -->
            </div>

            <div class="p-2.5 bg-white border border-primary rounded-3 text-center shadow-sm mt-auto">
              <div class="small text-muted fw-semibold" style="font-size: 11px;">Berechneter Gesamtbetrag</div>
              <div class="fs-4 fw-extrabold text-primary" id="jbModalLiveTotal">CHF ${calc.total.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <!-- Steuerungselemente rechts -->
        <div class="col-md-7 overflow-y-auto" style="max-height: 380px;">
          <!-- Lizenz -->
          <div class="card p-2.5 border-0 bg-light shadow-sm mb-2 rounded-3">
            <div class="small fw-bold text-secondary mb-1.5 text-uppercase" style="font-size: 10px;">Lizenz & Status</div>
            <div class="d-flex bg-white p-0.5 rounded border" style="gap: 3px;">
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition fs-7 ${
                _jbModalParticipationsState.lizenz === 'keine' ? 'btn-primary' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('lizenz', 'keine', '${header.PersonNumber}')" style="font-size: 11px;">Keine</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition fs-7 ${
                _jbModalParticipationsState.lizenz === 'verein' ? 'btn-primary' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('lizenz', 'verein', '${header.PersonNumber}')" style="font-size: 11px;">Eigener JB</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition fs-7 ${
                _jbModalParticipationsState.lizenz === 'junior' ? 'btn-primary' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('lizenz', 'junior', '${header.PersonNumber}')" style="font-size: 11px;">Junior</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition fs-7 ${
                _jbModalParticipationsState.lizenz === 'passiv' ? 'btn-primary' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('lizenz', 'passiv', '${header.PersonNumber}')" style="font-size: 11px;">Passiv</button>
            </div>
          </div>

          <!-- KK Volksschiessen -->
          <div class="card p-2.5 border-0 bg-light shadow-sm mb-2 rounded-3">
            <div class="small fw-bold text-secondary mb-1.5 text-uppercase" style="font-size: 10px;">KK Volksschiessen (KK007)</div>
            <div class="d-flex bg-white p-0.5 rounded border" style="gap: 3px;">
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition ${
                _jbModalParticipationsState.kk_volksschiessen === 'keine' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('kk_volksschiessen', 'keine', '${header.PersonNumber}')" style="font-size: 11px;">Kein</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition ${
                _jbModalParticipationsState.kk_volksschiessen === '1' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('kk_volksschiessen', '1', '${header.PersonNumber}')" style="font-size: 11px;">1 St.</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition ${
                _jbModalParticipationsState.kk_volksschiessen === '2' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('kk_volksschiessen', '2', '${header.PersonNumber}')" style="font-size: 11px;">2 St.</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition ${
                _jbModalParticipationsState.kk_volksschiessen === '3' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('kk_volksschiessen', '3', '${header.PersonNumber}')" style="font-size: 11px;">3 St.</button>
            </div>
          </div>

          <!-- SSV dez -->
          <div class="card p-2.5 border-0 bg-light shadow-sm mb-2 rounded-3">
            <div class="small fw-bold text-secondary mb-1.5 text-uppercase" style="font-size: 10px;">SSV dez (KK002-KK005)</div>
            <div class="d-flex bg-white p-0.5 rounded border flex-wrap" style="gap: 3px;">
              <button class="btn btn-xs rounded border-0 py-1 flex-fill ${
                _jbModalParticipationsState.ssv_dez === 'keine' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('ssv_dez', 'keine', '${header.PersonNumber}')" style="font-size: 11px;">Kein</button>
              <button class="btn btn-xs rounded border-0 py-1 flex-fill ${
                _jbModalParticipationsState.ssv_dez === 'liegend' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('ssv_dez', 'liegend', '${header.PersonNumber}')" style="font-size: 11px;">Liegend</button>
              <button class="btn btn-xs rounded border-0 py-1 flex-fill ${
                _jbModalParticipationsState.ssv_dez === '2-stellung' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('ssv_dez', '2-stellung', '${header.PersonNumber}')" style="font-size: 11px;">2-St.</button>
              <button class="btn btn-xs rounded border-0 py-1 flex-fill ${
                _jbModalParticipationsState.ssv_dez === '3-stellung' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('ssv_dez', '3-stellung', '${header.PersonNumber}')" style="font-size: 11px;">3-St.</button>
              <button class="btn btn-xs rounded border-0 py-1 flex-fill ${
                _jbModalParticipationsState.ssv_dez === 'liegend_2_3' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('ssv_dez', 'liegend_2_3', '${header.PersonNumber}')" style="font-size: 11px;">L+2+3</button>
              <button class="btn btn-xs rounded border-0 py-1 flex-fill ${
                _jbModalParticipationsState.ssv_dez === 'js' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('ssv_dez', 'js', '${header.PersonNumber}')" style="font-size: 11px;">JS</button>
            </div>
          </div>

          <!-- KK Grenzland -->
          <div class="card p-2.5 border-0 bg-light shadow-sm mb-2 rounded-3">
            <div class="small fw-bold text-secondary mb-1.5 text-uppercase" style="font-size: 10px;">KK Grenzland (KK001)</div>
            <div class="d-flex bg-white p-0.5 rounded border" style="gap: 3px;">
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition ${
                _jbModalParticipationsState.kk_grenzland === 'keine' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('kk_grenzland', 'keine', '${header.PersonNumber}')" style="font-size: 11px;">Kein</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition ${
                _jbModalParticipationsState.kk_grenzland === '1' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('kk_grenzland', '1', '${header.PersonNumber}')" style="font-size: 11px;">1 Stich</button>
              <button class="btn btn-xs flex-fill py-1 rounded border-0 transition ${
                _jbModalParticipationsState.kk_grenzland === 'js' ? 'btn-danger text-white' : 'bg-transparent text-muted'
              }" onclick="jbModalUpdateState('kk_grenzland', 'js', '${header.PersonNumber}')" style="font-size: 11px;">JS Stich</button>
            </div>
          </div>

          <!-- KK Toggles -->
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-white" style="cursor: pointer;">
                <span class="fw-semibold text-muted" style="font-size: 11px;">50m Verband</span>
                <input type="checkbox" class="form-check-input" id="modal_kk_verband" ${
                  _jbModalParticipationsState.kk_verband ? 'checked' : ''
                } onchange="jbModalUpdateState('kk_verband', this.checked, '${header.PersonNumber}')">
              </label>
            </div>
            <div class="col-6">
              <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-white" style="cursor: pointer;">
                <span class="fw-semibold text-muted" style="font-size: 11px;">50m Verein</span>
                <input type="checkbox" class="form-check-input" id="modal_kk_verein" ${
                  _jbModalParticipationsState.kk_verein ? 'checked' : ''
                } onchange="jbModalUpdateState('kk_verein', this.checked, '${header.PersonNumber}')">
              </label>
            </div>
          </div>

          <!-- LG Toggles -->
          <div class="card p-2 border-0 bg-light shadow-sm rounded-3">
            <div class="small fw-bold text-secondary mb-1 text-uppercase" style="font-size: 10px;">Luftgewehr 10m</div>
            <div class="row g-1.5">
              <div class="col-6">
                <label class="w-100 p-1.5 border rounded bg-white d-flex align-items-center justify-content-between" style="cursor: pointer; font-size: 10px;">
                  <span>10m AG DEZ</span>
                  <input type="checkbox" class="form-check-input" id="modal_lg_ag_dez" ${
                    _jbModalParticipationsState.lg_ag_dez ? 'checked' : ''
                  } onchange="jbModalUpdateState('lg_ag_dez', this.checked, '${header.PersonNumber}')">
                </label>
              </div>
              <div class="col-6">
                <label class="w-100 p-1.5 border rounded bg-white d-flex align-items-center justify-content-between" style="cursor: pointer; font-size: 10px;">
                  <span>10m AG DEZ Aufl.</span>
                  <input type="checkbox" class="form-check-input" id="modal_lg_ag_dez_auflage" ${
                    _jbModalParticipationsState.lg_ag_dez_auflage ? 'checked' : ''
                  } onchange="jbModalUpdateState('lg_ag_dez_auflage', this.checked, '${header.PersonNumber}')">
                </label>
              </div>
              <div class="col-6">
                <label class="w-100 p-1.5 border rounded bg-white d-flex align-items-center justify-content-between" style="cursor: pointer; font-size: 10px;">
                  <span>10m CH DEZ</span>
                  <input type="checkbox" class="form-check-input" id="modal_lg_ch_dez" ${
                    _jbModalParticipationsState.lg_ch_dez ? 'checked' : ''
                  } onchange="jbModalUpdateState('lg_ch_dez', this.checked, '${header.PersonNumber}')">
                </label>
              </div>
              <div class="col-6">
                <label class="w-100 p-1.5 border rounded bg-white d-flex align-items-center justify-content-between" style="cursor: pointer; font-size: 10px;">
                  <span>10m CH DEZ Aufl.</span>
                  <input type="checkbox" class="form-check-input" id="modal_lg_ch_dez_auflage" ${
                    _jbModalParticipationsState.lg_ch_dez_auflage ? 'checked' : ''
                  } onchange="jbModalUpdateState('lg_ch_dez_auflage', this.checked, '${header.PersonNumber}')">
                </label>
              </div>
              <div class="col-6">
                <label class="w-100 p-1.5 border rounded bg-white d-flex align-items-center justify-content-between" style="cursor: pointer; font-size: 10px;">
                  <span>10m Verband</span>
                  <input type="checkbox" class="form-check-input" id="modal_lg_verband" ${
                    _jbModalParticipationsState.lg_verband ? 'checked' : ''
                  } onchange="jbModalUpdateState('lg_verband', this.checked, '${header.PersonNumber}')">
                </label>
              </div>
              <div class="col-6">
                <label class="w-100 p-1.5 border rounded bg-white d-flex align-items-center justify-content-between" style="cursor: pointer; font-size: 10px;">
                  <span>10m Verein</span>
                  <input type="checkbox" class="form-check-input" id="modal_lg_verein" ${
                    _jbModalParticipationsState.lg_verein ? 'checked' : ''
                  } onchange="jbModalUpdateState('lg_verein', this.checked, '${header.PersonNumber}')">
                </label>
              </div>
              <div class="col-12">
                <label class="w-100 p-1.5 border rounded bg-white d-flex align-items-center justify-content-between" style="cursor: pointer; font-size: 10px;">
                  <span>10m CH Kniendmeisterschaft</span>
                  <input type="checkbox" class="form-check-input" id="modal_lg_ch_kniend" ${
                    _jbModalParticipationsState.lg_ch_kniend ? 'checked' : ''
                  } onchange="jbModalUpdateState('lg_ch_kniend', this.checked, '${header.PersonNumber}')">
                </label>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Aktionen Bearbeiten -->
      <div class="d-flex gap-2 justify-content-end mt-4 pt-3 border-top">
        <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
        <button class="btn btn-success px-4 fw-bold shadow-sm" onclick="jbModalSave(${header.id}, '${header.PersonNumber}')">
          <i class="fas fa-save me-1"></i> Änderungen speichern
        </button>
      </div>
    </div>
  `;

  // RENDER DUAL-TAB LAYOUT INTO MODAL BODY
  modalBody.innerHTML = `
    <!-- Header Info -->
    <div class="d-flex justify-content-between align-items-start mb-3 border-bottom pb-2">
      <div>
        <h5 class="mb-0 text-primary">${name}</h5>
        <small class="text-muted">PersonenNr: ${header.PersonNumber} · Jahr: ${header.year}</small>
      </div>
      <span class="badge fs-6 ${isPaid ? 'bg-success' : 'bg-danger'}">
        ${isPaid ? 'bezahlt' : 'offen'}
      </span>
    </div>

    <!-- Tab Buttons -->
    <ul class="nav nav-pills mb-3" style="gap: 5px;">
      <li class="nav-item">
        <button class="nav-link active px-3 py-1.5 fw-semibold" id="jbModalLinkPosten" onclick="jbModalSwitchSubTab('posten')" style="font-size: 13px;">
          <i class="fas fa-list-alt me-1.5"></i> Rechnungsdetails
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link px-3 py-1.5 fw-semibold text-muted bg-transparent" id="jbModalLinkBearbeiten" onclick="jbModalSwitchSubTab('bearbeiten')" style="font-size: 13px;">
          <i class="fas fa-edit me-1.5"></i> Rechnung bearbeiten
        </button>
      </li>
    </ul>

    ${tabPostenHTML}
    ${tabBearbeitenHTML}
  `;

  // Init live list in modal
  jbModalRenderLivePositions(m);
}

// Modal Reiter umschalten
function jbModalSwitchSubTab(tab) {
  const tabPosten = document.getElementById('jbModalTabPosten');
  const tabBearbeiten = document.getElementById('jbModalTabBearbeiten');
  const linkPosten = document.getElementById('jbModalLinkPosten');
  const linkBearbeiten = document.getElementById('jbModalLinkBearbeiten');

  if (tab === 'posten') {
    tabPosten.classList.remove('d-none');
    tabBearbeiten.classList.add('d-none');
    linkPosten.className = 'nav-link active px-3 py-1.5 fw-semibold';
    linkBearbeiten.className = 'nav-link px-3 py-1.5 fw-semibold text-muted bg-transparent';
  } else {
    tabPosten.classList.add('d-none');
    tabBearbeiten.classList.remove('d-none');
    linkPosten.className = 'nav-link px-3 py-1.5 fw-semibold text-muted bg-transparent';
    linkBearbeiten.className = 'nav-link active px-3 py-1.5 fw-semibold';
  }
}

// Live Positions im Modal updaten
function jbModalRenderLivePositions(m) {
  const container = document.getElementById('jbModalLivePositions');
  if (!container) return;

  const calc = jbCalculateLiveTotal(m, _jbModalParticipationsState);
  container.innerHTML = calc.positions.map(p => `
    <div class="d-flex justify-content-between align-items-center py-1 border-bottom" style="font-size: 11px;">
      <span class="text-muted">${p.name}</span>
      <span class="fw-bold ${p.typ === 'Kredit' ? 'text-success' : 'text-dark'}">
        ${p.typ === 'Kredit' ? '-' : ''}CHF ${Math.abs(p.betrag).toFixed(2)}
      </span>
    </div>
  `).join('');
  
  const totalDisplay = document.getElementById('jbModalLiveTotal');
  if (totalDisplay) {
    totalDisplay.textContent = 'CHF ' + calc.total.toFixed(2);
  }
}

// Modal State anpassen und live neu rendern
function jbModalUpdateState(key, val, pn) {
  const pnClean = String(pn || '').trim();
  _jbModalParticipationsState[key] = val;
  
  const m = _jbMemberMap[pnClean];
  if (m) {
    jbModalRenderLivePositions(m);
  }

  // Segmented Pill Buttons aktualisieren (falls Toggle)
  const buttons = document.querySelectorAll(`#jbModalTabBearbeiten button[onclick*="${key}"]`);
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick').includes(`'${val}'`)) {
      btn.className = btn.className.replace('bg-transparent text-muted', 'btn-primary');
      btn.className = btn.className.replace('btn-danger text-white', 'btn-danger'); // keep danger active
      if (!btn.className.includes('btn-primary') && !btn.className.includes('btn-danger')) {
        if (key === 'lizenz') btn.classList.add('btn-primary');
        else btn.classList.add('btn-danger');
      }
    } else {
      btn.className = btn.className.replace('btn-primary', 'bg-transparent text-muted');
      btn.className = btn.className.replace('btn-danger', 'bg-transparent text-muted');
      btn.className = btn.className.replace('text-white', '');
    }
  });

  // Checkboxen aktualisieren (falls checkbox)
  const chk = document.getElementById(`modal_${key}`);
  if (chk) {
    chk.checked = val;
  }
}

// Änderungen über das Modal speichern
async function jbModalSave(headerId, pn) {
  const pnClean = String(pn || '').trim();
  const btn = document.querySelector('#jbModalTabBearbeiten button[onclick*="jbModalSave"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Speichere…';
  }

  try {
    const list = [];
    const year = _jbYear;

    // Mapping von State auf Server-Eventkeys
    list.push({ pn: pnClean, year, eventkey: 'KK007', teilgenommen: _jbModalParticipationsState.kk_volksschiessen !== 'keine' ? 1 : 0, quelle: 'volksschiessen' });
    
    const ssv = _jbModalParticipationsState.ssv_dez;
    list.push({ pn: pnClean, year, eventkey: 'KK002', teilgenommen: (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK003', teilgenommen: (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK004', teilgenommen: (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK005', teilgenommen: ssv === 'sv' ? 1 : 0 });
    
    list.push({ pn: pnClean, year, eventkey: 'KK001', teilgenommen: _jbModalParticipationsState.kk_grenzland !== 'keine' ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK006', teilgenommen: _jbModalParticipationsState.kk_verband ? 1 : 0 });
    if (_jbModalParticipationsState.kk_volksschiessen === 'keine') {
      list.push({ pn: pnClean, year, eventkey: 'KK007', teilgenommen: _jbModalParticipationsState.kk_verein ? 1 : 0 });
    }

    list.push({ pn: pnClean, year, eventkey: 'LG001', teilgenommen: _jbModalParticipationsState.lg_ag_dez ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG002', teilgenommen: _jbModalParticipationsState.lg_ag_dez_auflage ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG003', teilgenommen: _jbModalParticipationsState.lg_ch_dez ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG004', teilgenommen: _jbModalParticipationsState.lg_ch_dez_auflage ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG005', teilgenommen: _jbModalParticipationsState.lg_verband ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG006', teilgenommen: _jbModalParticipationsState.lg_verein ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG007', teilgenommen: _jbModalParticipationsState.lg_ch_kniend ? 1 : 0 });

    // 1. In Google Sheets speichern via Bulk-API
    const resSave = await apiFetch('jahresbeitrag', '', {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveParticipationsBulk',
        list: list,
        user: window.currentUser || 'frontend'
      })
    });
    const saveJson = await resSave.json();
    if (!saveJson.success) throw new Error(saveJson.error);

    // 2. Beiträge für dieses EINE Mitglied neu berechnen
    const resCalc = await apiFetch('jahresbeitrag', `action=berechnen&year=${year}&pn=${pnClean}`);
    const calcJson = await resCalc.json();
    if (!calcJson.success) throw new Error(calcJson.error);

    showToast(`🎉 Beitrag für ${pnClean} erfolgreich aktualisiert und neu berechnet!`);

    // 3. Schließe das Modal
    const modalEl = document.getElementById('jbModalPositionen');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    // 4. Haupt-Tabelle aktualisieren
    await loadJahresbeitragData();
  } catch(e) {
    alert("Fehler beim Speichern: " + e.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Änderungen speichern';
    }
  }
}

function jbOpenZahlung(id, name, betrag) {
  document.getElementById('jbZahlungId').value    = id;
  document.getElementById('jbZahlungName').textContent  = name;
  document.getElementById('jbZahlungBetrag').textContent = fmtChf(betrag);
  document.getElementById('jbZahlungDatum').value  = new Date().toISOString().split('T')[0];
  document.getElementById('jbZahlungBeleg').value  = '';
  new bootstrap.Modal(document.getElementById('jbModalZahlung')).show();
}

async function jbSaveZahlung() {
  const id     = document.getElementById('jbZahlungId').value;
  const datum  = document.getElementById('jbZahlungDatum').value;
  const methode= document.getElementById('jbZahlungMethode').value;
  const beleg  = document.getElementById('jbZahlungBeleg').value;

  if (!datum) { alert('Bitte Datum angeben'); return; }

  const btn = document.querySelector('#jbModalZahlung .btn-success');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const res  = await apiFetch('jahresbeitrag',
      `action=saveZahlung&headerId=${id}&datum=${datum}&methode=${encodeURIComponent(methode)}&beleg=${encodeURIComponent(beleg)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    bootstrap.Modal.getInstance(document.getElementById('jbModalZahlung')).hide();
    await loadJahresbeitragData();
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Zahlung speichern';
  }
}

async function jbBerechnen() {
  if (!confirm(`Beiträge für ${_jbYear} berechnen? Bereits berechnete werden übersprungen.`)) return;
  const btn = document.querySelector('button[onclick="jbBerechnen()"]');
  if (btn) {
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Berechne…';
  }
  try {
    const res  = await apiFetch('jahresbeitrag', `action=berechnen&year=${_jbYear}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    alert(data.message || '✅ Fertig');
    await loadJahresbeitragData();
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-calculator"></i> Alle Beiträge berechnen';
    }
  }
}

function jbChangeYear(year) {
  _jbYear = Number(year);
  
  if (_jbAllBeitraege) {
    _jbData = _jbAllBeitraege.filter(h => Number(h.year) === Number(_jbYear));
  }
  
  if (_jbAllParticipations) {
    _jbParticipationsCache = {};
    _jbAllParticipations.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const pn = String(p.PersonNumber).trim();
        if (!_jbParticipationsCache[pn]) _jbParticipationsCache[pn] = [];
        _jbParticipationsCache[pn].push(p);
      }
    });
  }

  if (_jbAllPositions) {
    _jbPositionsCache = {};
    _jbAllPositions.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const hid = String(p.headerid).trim();
        if (!_jbPositionsCache[hid]) _jbPositionsCache[hid] = [];
        _jbPositionsCache[hid].push(p);
      }
    });
  }

  // Sortierungen anwenden
  jbApplyTableSorting();
  jbApplySidebarSorting();
  
  renderJahresbeitragView();
}

// ============================================================
// VIRTUAL LIVE CALCULATOR (Floor CHF 0.00 und alle Tarife)
// ============================================================
function jbCalculateLiveTotal(m, settings) {
  const isEhren = m._istEhren || false;
  const isPassiv = m._istPassiv || false;
  const isIntern = String(m.PersonNumber || '').startsWith('INT-');
  
  const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;
  
  const positions = [];
  
  // 1. Jahresbeitrag
  let jbBetrag = 0;
  let jbDesc = '';
  if (isEhren) {
    jbBetrag = 0;
    jbDesc = 'Jahresbeitrag Ehrenmitglied';
  } else if (isPassiv) {
    jbBetrag = 20;
    jbDesc = 'Jahresbeitrag Passivmitglied';
  } else if (isIntern) {
    jbBetrag = 0;
    jbDesc = 'Schüler intern (ohne Lizenz)';
  } else {
    // Aktiv
    const haupt = m._hauptlizenz || '';
    if (haupt.includes('G50m')) {
      if (haupt.includes('Aktiv-A')) {
        jbBetrag = 100;
        jbDesc = 'Jahresbeitrag Aktiv A G50m';
      } else {
        jbBetrag = 70;
        jbDesc = 'Jahresbeitrag Aktiv B G50m';
      }
    } else if (haupt.includes('G10m')) {
      jbBetrag = 10;
      jbDesc = 'Jahresbeitrag Aktiv nur 10m';
    } else {
      jbBetrag = 10;
      jbDesc = 'Jahresbeitrag Aktiv nur 10m';
    }
  }
  
  positions.push({ name: jbDesc, betrag: jbBetrag, typ: 'Debit' });
  
  // 2. Lizenzen
  const licType = settings.lizenz || 'keine';
  if (licType === 'verein') {
    positions.push({ name: 'Lizenz eigener Verein (Normal)', betrag: 18, typ: 'Debit' });
  } else if (licType === 'junior') {
    positions.push({ name: 'Lizenz eigener Verein (Junior)', betrag: 0, typ: 'Debit' });
  } else if (licType === 'fremd') {
    positions.push({ name: 'Lizenz anderer Verein', betrag: 0, typ: 'Debit' });
  }
  
  // 3. Schützenhaus (GE001)
  // G50m Lizenzinhaber, nicht Junior
  const hatG50mOwn = (m._lizenzen || []).some(l => l.istMuhen && l.MembershipCategory.toLowerCase().includes('g50'));
  if (!isJunior && hatG50mOwn && licType !== 'passiv') {
    positions.push({ name: 'Schützenhaus (Infrastrukturbeitrag)', betrag: 50, typ: 'Debit' });
  }
  
  // 4. Turniere
  // KK Volksschiessen (KK007)
  const volk = settings.kk_volksschiessen || 'keine';
  if (volk !== 'keine') {
    let stiche = 1;
    if (volk === '2') stiche = 2;
    if (volk === '3') stiche = 3;
    positions.push({ name: `KK Volksschiessen (${stiche} Stich${stiche > 1 ? 'e' : ''})`, betrag: stiche * 15, typ: 'Debit' });
  }
  
  // SSV dez (KK002/003/004/005)
  const ssvdez = settings.ssv_dez || 'keine';
  if (ssvdez !== 'keine') {
    if (ssvdez === 'liegend') {
      positions.push({ name: '50m AG DEZ liegend', betrag: 24, typ: 'Debit' });
    } else if (ssvdez === '2-stellung') {
      positions.push({ name: '50m AG DEZ 2-Stellung', betrag: 24, typ: 'Debit' });
    } else if (ssvdez === '3-stellung') {
      positions.push({ name: '50m AG DEZ 3-Stellung', betrag: 24, typ: 'Debit' });
    } else if (ssvdez === 'liegend_2_3') {
      positions.push({ name: '50m AG DEZ liegend & 2-Stellung & 3-Stellung', betrag: 72, typ: 'Debit' });
    } else if (ssvdez === 'js') {
      positions.push({ name: '50m AG DEZ (Jungschütze)', betrag: 0, typ: 'Debit' });
    }
  }
  
  // KK Grenzland (KK001)
  const grenz = settings.kk_grenzland || 'keine';
  if (grenz === '1') {
    positions.push({ name: '50m Grenzland', betrag: 15, typ: 'Debit' });
  } else if (grenz === 'js') {
    positions.push({ name: '50m Grenzland (Jungschütze)', betrag: 0, typ: 'Debit' });
  }
  
  // Toggles for 50m
  if (settings.kk_verband) positions.push({ name: '50m Verbandsschiessen', betrag: 15, typ: 'Debit' });
  if (settings.kk_verein)  positions.push({ name: '50m Vereinsschiessen', betrag: 15, typ: 'Debit' });
  
  // Toggles for 10m
  if (settings.lg_ag_dez)         positions.push({ name: '10m AG DEZ', betrag: 17, typ: 'Debit' });
  if (settings.lg_ag_dez_auflage) positions.push({ name: '10m AG DEZ Auflage', betrag: 17, typ: 'Debit' });
  if (settings.lg_ch_dez)         positions.push({ name: '10m CH DEZ', betrag: 20, typ: 'Debit' });
  if (settings.lg_ch_dez_auflage) positions.push({ name: '10m CH DEZ Auflage', betrag: 20, typ: 'Debit' });
  if (settings.lg_verband)        positions.push({ name: '10m Verbandsschiessen', betrag: 11, typ: 'Debit' });
  if (settings.lg_verein)         positions.push({ name: '10m Vereinsschiessen', betrag: 14, typ: 'Debit' });
  if (settings.lg_ch_kniend)      positions.push({ name: '10m CH Kniendmeisterschaft', betrag: 20, typ: 'Debit' });
  
  // 5. Rabatte
  let isVorstand = m._istVorstand || false;
  let isHausmeister = (m._kategorie || '').toLowerCase().includes('hausmeister');
  
  let hasRA002 = false;
  if (isVorstand) {
    positions.push({ name: 'Rabatt Vorstand', betrag: -100, typ: 'Kredit' });
  }
  
  if (isHausmeister) {
    positions.push({ name: 'Gutschrift Unterhalt Anlage (Hausmeister)', betrag: -300, typ: 'Kredit' });
    hasRA002 = true;
  }
  
  // Summing up
  let total = 0;
  positions.forEach(p => { total += p.betrag; });
  
  // Floor check: If not janitor (Hausmeister), floor at 0
  if (!hasRA002) {
    total = Math.max(0, total);
  }
  
  return { positions, total };
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function fmtChf(val) {
  return 'CHF ' + Number(val || 0).toFixed(2);
}
function fmtDate(val) {
  if (!val || val === '') return '–';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('de-CH');
}

// ============================================================
// TAB 4: BANKABGLEICH (CAMT.053 XML)
// ============================================================

// ---- Render: Upload-Bereich + Ergebnistabelle ----------------
function renderBankabgleichTab() {
  const hasResults = _jbBankMatchResults && _jbBankMatchResults.length > 0;
  const jbCount  = hasResults ? _jbBankMatchResults.filter(r => r.isJahresbeitrag).length : 0;
  const otherCount = hasResults ? _jbBankMatchResults.filter(r => !r.isJahresbeitrag).length : 0;

  const ibanFilterChecked = window._jbBankIbanFilterOff ? '' : 'checked';

  return `
    <div class="card border-0 shadow-sm p-4 bg-white">
      <h4 class="mb-1 text-success"><i class="fas fa-university me-2"></i>Bankabgleich – Jahresbeiträge</h4>
      <p class="text-muted small mb-3">CAMT.053 Kontoauszug hochladen. Das System erkennt Jahresbeitragszahlungen automatisch und gleicht sie mit den Mitgliederdaten ab.</p>

      <!-- Upload-Zone -->
      <div class="card bg-light border-0 mb-2" style="border: 2px dashed #28a745 !important; border-radius: 12px; cursor: pointer;"
           onclick="document.getElementById('bankXmlInput').click()"
           ondragover="event.preventDefault(); this.style.background='#d4edda';"
           ondragleave="this.style.background='';"
           ondrop="event.preventDefault(); this.style.background=''; jbBankHandleFile(event.dataTransfer.files[0]);">
        <div class="p-4 text-center">
          <input type="file" id="bankXmlInput" class="d-none" accept=".xml" onchange="jbBankHandleFile(this.files[0])">
          <i class="fas fa-file-code fa-3x mb-2 text-success" style="opacity:0.7;"></i>
          <h6 class="text-success fw-bold mb-1">CAMT.053 XML-Datei hier ablegen oder klicken</h6>
          <div class="text-muted small">Unterstützt: camt.053.001.08 (Raiffeisenbank)</div>
        </div>
      </div>

      <!-- IBAN-Filter Hinweis -->
      <div class="d-flex align-items-center gap-3 mb-4 px-1">
        <div class="d-flex align-items-center gap-2 bg-light border rounded px-3 py-2" style="font-size:12px;">
          <i class="fas fa-filter text-success"></i>
          <span class="text-muted">Kontofilter:</span>
          <code class="fw-bold text-dark">CH0680808003633131892</code>
          <span class="text-muted">(Raiffeisenbank)</span>
        </div>
        <div class="form-check form-switch mb-0" title="Dateinamen-Prüfung deaktivieren">
          <input class="form-check-input" type="checkbox" id="bankIbanFilterCheck" ${ibanFilterChecked}
                 onchange="window._jbBankIbanFilterOff = !this.checked;">
          <label class="form-check-label small text-muted" for="bankIbanFilterCheck">Kontofilter aktiv</label>
        </div>
      </div>

      <!-- Statistik-Banner (nur wenn Ergebnisse) -->
      <div id="bankStatsBanner" class="${hasResults ? '' : 'd-none'}">
        ${hasResults ? jbBankStatsBannerHTML() : ''}
      </div>

      <!-- Filter-Buttons -->
      <div id="bankFilterBar" class="${hasResults ? 'd-flex gap-2 mb-3 flex-wrap' : 'd-none'}">
        <button class="btn btn-sm btn-outline-secondary active" id="bankFilterAll" onclick="jbBankFilter('all')">Alle (${hasResults ? _jbBankMatchResults.length : 0})</button>
        <button class="btn btn-sm btn-success" id="bankFilterJb" onclick="jbBankFilter('jb')"><i class="fas fa-euro-sign me-1"></i>Jahresbeiträge (${jbCount})</button>
        <button class="btn btn-sm btn-outline-warning" id="bankFilterOther" onclick="jbBankFilter('other')">Andere Buchungen (${otherCount})</button>
        <button class="btn btn-sm btn-outline-danger" id="bankFilterUnmatched" onclick="jbBankFilter('unmatched')">❓ Nicht zugeordnet</button>
        <button class="btn btn-sm btn-outline-primary ms-auto" onclick="jbBankBookAll()"><i class="fas fa-check-double me-1"></i>Alle ✅ buchen</button>
      </div>

      <!-- Ergebnistabelle -->
      <div id="bankResultsContainer">
        ${hasResults ? '' : '<div class="text-center text-muted py-5"><i class="fas fa-file-upload fa-3x mb-3" style="opacity:0.2;"></i><br>Noch keine Datei geladen</div>'}
      </div>
    </div>
  `;
}

// ---- Stats-Banner HTML ----------------------------------------
function jbBankStatsBannerHTML() {
  const results = _jbBankMatchResults;
  const jbRows = results.filter(r => r.isJahresbeitrag);
  const matched = jbRows.filter(r => r.matchScore >= 2);
  const unsure  = jbRows.filter(r => r.matchScore === 1);
  const none    = jbRows.filter(r => r.matchScore === 0);
  const already = jbRows.filter(r => r.alreadyPaid);
  const totalCHF = jbRows.reduce((s, r) => s + r.amount, 0);

  return `
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-success">
          <div class="small text-muted">Jahresbeitrag-Buchungen</div>
          <div class="fs-5 fw-bold text-success">${jbRows.length}</div>
          <div class="text-muted small">CHF ${totalCHF.toFixed(2)}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-primary">
          <div class="small text-muted">✅ Eindeutig zugeordnet</div>
          <div class="fs-5 fw-bold text-primary">${matched.length}</div>
          <div class="text-muted small">Betrag + Name stimmt</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-warning">
          <div class="small text-muted">⚠️ Unsicher</div>
          <div class="fs-5 fw-bold text-warning">${unsure.length}</div>
          <div class="text-muted small">Manuelle Prüfung</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-danger">
          <div class="small text-muted">❓ Nicht zugeordnet</div>
          <div class="fs-5 fw-bold text-danger">${none.length}</div>
          <div class="text-muted small">Kein Treffer</div>
        </div>
      </div>
    </div>
  `;
}

// ---- Render Results Table -------------------------------------
function jbBankRenderResults(filter) {
  const container = document.getElementById('bankResultsContainer');
  if (!container) return;

  let rows = _jbBankMatchResults || [];
  if (!rows.length) return;

  // Apply filter
  const activeFilter = filter || window._jbBankActiveFilter || 'all';
  window._jbBankActiveFilter = activeFilter;
  let filtered = rows;
  if (activeFilter === 'jb')        filtered = rows.filter(r => r.isJahresbeitrag);
  if (activeFilter === 'other')     filtered = rows.filter(r => !r.isJahresbeitrag);
  if (activeFilter === 'unmatched') filtered = rows.filter(r => r.isJahresbeitrag && r.matchScore === 0);

  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));

  // Build a real-index map so Umbuchen always refers to the correct _jbBankMatchResults slot
  const realIdx = filtered.map(r => rows.indexOf(r));

  const rowsHTML = filtered.map((r, idx) => {
    const realI  = realIdx[idx]; // index into _jbBankMatchResults
    const isJb = r.isJahresbeitrag;
    const score = r.matchScore;

    // Status-Badge
    let badge = '';
    if (!isJb) {
      badge = '<span class="badge bg-secondary">Andere Buchung</span>';
    } else if (r.alreadyPaid) {
      badge = '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Bereits gebucht</span>';
    } else if (score >= 2) {
      badge = '<span class="badge bg-primary">✅ Eindeutig</span>';
    } else if (score === 1) {
      badge = '<span class="badge bg-warning text-dark">⚠️ Unsicher</span>';
    } else {
      badge = '<span class="badge bg-danger">❓ Kein Treffer</span>';
    }

    // Matched member info
    let memberInfo = '–';
    if (r.matchedMember) {
      const m = r.matchedMember;
      const passivBadge = m._istPassiv ? ' <span class="badge bg-secondary" style="font-size: 10px; padding: 2px 4px;">Passiv</span>' : '';
      memberInfo = `<span class="fw-semibold">${m.FirstName || ''} ${m.LastName || ''}</span>${passivBadge}<br>
        <small class="text-muted">${m.PersonNumber || ''} · ${m.PostCode || ''} ${m.City || ''}</small>`;
    } else if (isJb) {
      memberInfo = '<span class="text-danger small">Kein Mitglied gefunden</span>';
    }

    // Action buttons
    let actionBtn = '';
    if (isJb && !r.alreadyPaid && canEdit) {
      const dateStr   = r.bookingDate || '';
      const headerId  = r.matchedBeitrag ? (r.matchedBeitrag.id || '') : '';
      let bookBtn = '';
      if (headerId) {
        if (score >= 2) {
          bookBtn = `<button class="btn btn-sm btn-success" onclick="jbBankBookOne('${headerId}','${dateStr}','${realI}')">
            <i class="fas fa-check me-1"></i>Buchen
          </button>`;
        } else if (score === 1) {
          bookBtn = `<button class="btn btn-sm btn-outline-warning" onclick="jbBankBookOne('${headerId}','${dateStr}','${realI}')">
            <i class="fas fa-question-circle me-1"></i>Trotzdem buchen
          </button>`;
        }
      } else if (r.matchedMember) {
        // Matched but no invoice calculated yet
        bookBtn = `<span class="badge bg-warning text-dark py-1.5" style="font-size: 11px;" title="Rechnung wurde für das aktive Jahr noch nicht berechnet. Bitte in Beitrags-Übersicht berechnen."><i class="fas fa-calculator me-1"></i>Rechnung fehlt</span>`;
      }
      const umbuchenBtn = `<button class="btn btn-sm btn-outline-secondary ms-1" title="Andere Person auswählen" onclick="jbBankShowReassignModal(${realI})">
        <i class="fas fa-exchange-alt"></i>
      </button>`;
      actionBtn = `<div class="d-flex gap-1 flex-wrap">${bookBtn}${umbuchenBtn}</div>`;
    } else if (isJb && r.alreadyPaid) {
      actionBtn = `<span class="text-success small"><i class="fas fa-check-circle me-1"></i>${r.alreadyPaidDate || ''}</span>`;
    }

    const rowBg = !isJb ? 'table-light' : (r.alreadyPaid ? 'table-success' : (score >= 2 ? '' : (score === 1 ? 'table-warning' : 'table-danger')));
    const opacity = !isJb ? ' style="opacity:0.6;"' : '';

    return `
      <tr class="${rowBg}"${opacity}>
        <td class="text-muted small">${r.bookingDate || ''}</td>
        <td><span class="fw-semibold">${escHtml(r.debtorName || '')}</span><br>
            <small class="text-muted">${escHtml(r.debtorCity || '')} · ${escHtml(r.debtorPostCode || '')}</small>
        </td>
        <td class="text-end fw-bold">CHF ${Number(r.amount || 0).toFixed(2)}</td>
        <td><small class="text-muted" style="font-size:11px;">${escHtml((r.remittanceInfo || '').substring(0, 60))}${r.remittanceInfo && r.remittanceInfo.length > 60 ? '…' : ''}</small></td>
        <td>${badge}</td>
        <td>${memberInfo}</td>
        ${canEdit ? `<td>${actionBtn}</td>` : ''}
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover table-sm mb-0" style="font-size: 13px;">
        <thead class="table-dark sticky-top">
          <tr>
            <th>Datum</th>
            <th>Zahler (Bank)</th>
            <th class="text-end">Betrag</th>
            <th>Verwendungszweck</th>
            <th>Status</th>
            <th>Matched Mitglied</th>
            ${canEdit ? '<th>Aktion</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="text-muted small mt-2 px-1">${filtered.length} von ${rows.length} Buchungen angezeigt</div>
  `;
}

// ---- Reassign Modal: Score alle Kandidaten ----------------
function jbBankScoreAllCandidates(tx) {
  const beitraege = (_jbAllBeitraege || []).filter(h => Number(h.year) === Number(_jbYear));
  const members   = _jbMembers || [];

  return members.map(m => {
    const b = beitraege.find(x => String(x.PersonNumber) === String(m.PersonNumber)) || null;

    const bankName = normalizeName(tx.debtorName || '');
    const bankPLZ  = String(tx.debtorPostCode || '').trim();
    const bankOrt  = normalizeName(tx.debtorCity || '');

    const mLast  = normalizeName(m.LastName  || '');
    const mFirst = normalizeName(m.FirstName || '');
    const mPLZ   = String(m.PostCode || '').trim();
    const mOrt   = normalizeName(m.City || '');
    const mGesamt = b ? Number(b.Gesamt || 0) : (m._istPassiv ? 20 : 0);

    let score = 0;
    let reasons = [];

    const amountMatch = Math.abs(mGesamt - tx.amount) < 0.01;
    if (amountMatch)   { score++;     reasons.push('Betrag'); }
    const lastMatch = bankName.includes(mLast) || mLast.includes(bankName);
    if (lastMatch && mLast.length > 1) { score++; reasons.push('Nachname'); }
    const firstMatch = bankName.includes(mFirst) || mFirst.includes(bankName.split(' ')[0]);
    if (firstMatch && mFirst.length > 1) { score += 0.5; reasons.push('Vorname'); }
    if (bankPLZ && mPLZ && bankPLZ === mPLZ) { score += 0.5; reasons.push('PLZ'); }
    if (bankOrt && mOrt && (bankOrt.includes(mOrt) || mOrt.includes(bankOrt))) { score += 0.3; reasons.push('Ort'); }

    // Reference matching in reassign modal
    const cleanMpn = String(m.PersonNumber || '').trim().replace(/^0+/, '');
    const cleanBid = b ? String(b.id || '').trim().replace(/^0+/, '') : '';
    const cleanDref = b ? String(b.document_ref || '').trim().replace(/^0+/, '') : '';
    const cleanRef = (tx.creditorReference || '').toLowerCase();

    if (cleanRef) {
      const numericRef = cleanRef.replace(/[^0-9]/g, '').replace(/^0+/, '');
      if (cleanMpn && numericRef.endsWith(cleanMpn)) {
        score += 2; reasons.push('Referenz (Mitglied)');
      } else if (cleanBid && numericRef === cleanBid) {
        score += 3; reasons.push('Referenz (Rechnung)');
      } else if (cleanDref && numericRef === cleanDref) {
        score += 3; reasons.push('Referenz (Beleg)');
      }
    }

    return { b, m, score, reasons, alreadyPaid: b ? (b.status === 'bezahlt') : false };
  })
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);
}

// ---- Reassign Modal öffnen ----------------------------------
function jbBankShowReassignModal(txIdx) {
  const tx = _jbBankMatchResults[txIdx];
  if (!tx) return;

  const candidates = jbBankScoreAllCandidates(tx);
  const dateStr = tx.bookingDate || '';

  // Score-Balken-Farbe
  function scoreColor(s) {
    if (s >= 2.5) return 'bg-success';
    if (s >= 1.5) return 'bg-primary';
    if (s >= 1)   return 'bg-warning';
    if (s > 0)    return 'bg-secondary';
    return 'bg-danger';
  }
  function scoreLabel(s) {
    if (s >= 2)   return '✅ Gut';
    if (s >= 1)   return '⚠️ Möglich';
    if (s > 0)    return '🖍️ Schwach';
    return '❓ Kein Match';
  }

  const listHTML = candidates.slice(0, 30).map((c, ci) => {
    const paidBadge = c.alreadyPaid
      ? '<span class="badge bg-success ms-1">Bezahlt</span>'
      : (c.b ? '<span class="badge bg-light text-dark border ms-1">Offen</span>' : '<span class="badge bg-warning text-dark ms-1" title="Rechnung wurde für das aktive Jahr noch nicht berechnet.">Rechnung fehlt</span>');
    const scoreBar = Math.min(100, Math.round((c.score / 3.3) * 100));
    const reasonStr = c.reasons.length ? `<small class="text-muted">(${c.reasons.join(', ')})</small>` : '';
    const disabledAttr = (c.alreadyPaid || !c.b) ? 'disabled title="Bereits als bezahlt markiert oder keine Beitragsrechnung vorhanden"' : '';
    const betragStr = c.b ? `CHF ${Number(c.b.Gesamt || 0).toFixed(2)}` : '–';
    const bidVal = c.b ? c.b.id : '';

    return `
      <tr>
        <td>
          <span class="fw-semibold">${escHtml(c.m.LastName || '')} ${escHtml(c.m.FirstName || '')}</span>${paidBadge}<br>
          <small class="text-muted">${c.m.PersonNumber || ''} · ${String(c.m.PostCode || '')} ${escHtml(c.m.City || '')}</small>
        </td>
        <td class="text-end fw-bold" style="white-space:nowrap;">${betragStr}</td>
        <td style="min-width:120px;">
          <div class="progress mb-1" style="height:6px;">
            <div class="progress-bar ${scoreColor(c.score)}" style="width:${scoreBar}%"></div>
          </div>
          <small>${scoreLabel(c.score)} ${reasonStr}</small>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-primary py-0" ${disabledAttr}
                  onclick="jbBankBookAlternative(${txIdx}, '${bidVal}', '${escHtml(c.m.FirstName || '')} ${escHtml(c.m.LastName || '')}', '${dateStr}')">
            <i class="fas fa-arrow-right me-1"></i>Buchen
          </button>
        </td>
      </tr>`;
  }).join('');

  // Modal einmalig ins DOM einfügen oder updaten
  let modal = document.getElementById('bankReassignModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="bankReassignModal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title"><i class="fas fa-exchange-alt me-2"></i>Zahlung umbuchen</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
              <div id="bankReassignInfo" class="px-3 pt-3 pb-2 bg-light border-bottom"></div>
              <div class="table-responsive">
                <table class="table table-hover table-sm mb-0" style="font-size:13px;">
                  <thead class="table-secondary sticky-top">
                    <tr>
                      <th>Mitglied</th>
                      <th class="text-end">Beitrag</th>
                      <th>Match</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="bankReassignList"></tbody>
                </table>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
            </div>
          </div>
        </div>
      </div>`);
    modal = document.getElementById('bankReassignModal');
  }

  // Inhalt füllen
  document.getElementById('bankReassignInfo').innerHTML = `
    <div class="d-flex gap-4 align-items-start flex-wrap">
      <div>
        <div class="text-muted small">Zahler (Bank)</div>
        <div class="fw-semibold">${escHtml(tx.debtorName || '–')}</div>
        <div class="text-muted small">${escHtml(tx.debtorPostCode || '')} ${escHtml(tx.debtorCity || '')}</div>
      </div>
      <div>
        <div class="text-muted small">Betrag</div>
        <div class="fw-bold text-success">CHF ${Number(tx.amount || 0).toFixed(2)}</div>
        <div class="text-muted small">${dateStr}</div>
      </div>
      <div style="flex:1;">
        <div class="text-muted small">Verwendungszweck</div>
        <div class="small">${escHtml((tx.remittanceInfo || '').substring(0, 120))}</div>
      </div>
    </div>
    <div class="mt-2 text-muted small">Top 30 Mitglieder nach Match-Score (absteigend). Vorschlag in Fettschrift.</div>`;

  document.getElementById('bankReassignList').innerHTML = listHTML;

  bootstrap.Modal.getOrCreateInstance(modal).show();
}

// ---- Alternative buchen ------------------------------------
async function jbBankBookAlternative(txIdx, headerId, memberName, dateStr) {
  if (!headerId || !dateStr) { alert('Fehlende Daten.'); return; }

  const confirmed = confirm(`Zahlung vom ${dateStr}\nan "${memberName}" buchen?\nZahlungsmethode: Überweisung (Bank)`);
  if (!confirmed) return;

  // Modal schließen
  const modal = document.getElementById('bankReassignModal');
  if (modal) bootstrap.Modal.getInstance(modal)?.hide();

  try {
    const params = new URLSearchParams({
      action: 'saveZahlung',
      headerId,
      datum: dateStr,
      methode: 'Überweisung',
      beleg: 'CAMT053'
    });
    const res = await apiFetch('jahresbeitrag', params.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Fehler beim Speichern');

    // Lokalen Cache aktualisieren
    if (_jbBankMatchResults[txIdx]) {
      _jbBankMatchResults[txIdx].alreadyPaid     = true;
      _jbBankMatchResults[txIdx].alreadyPaidDate = dateStr;
    }
    const cached = (_jbAllBeitraege || []).find(h => String(h.id) === String(headerId));
    if (cached) { cached.status = 'bezahlt'; cached.payment_date = dateStr; cached.payment_method = 'Überweisung'; }

    showToast(`✅ Zahlung für ${memberName} gebucht!`, 'success');
    jbBankRenderResults(window._jbBankActiveFilter);
    const banner = document.getElementById('bankStatsBanner');
    if (banner) banner.innerHTML = jbBankStatsBannerHTML();

  } catch(err) {
    alert('Fehler: ' + err.message);
  }
}

function jbBankFilter(filter) {
  // Toggle active button style
  ['bankFilterAll','bankFilterJb','bankFilterOther','bankFilterUnmatched'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) { btn.classList.remove('active'); btn.classList.remove('btn-dark'); }
  });
  jbBankRenderResults(filter);
}

// ---- File Handler ---------------------------------------------
var BANK_IBAN = 'ch0680808003633131892'; // Raiffeisenbank Sportschützen Muhen

function jbBankHandleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xml')) {
    alert('Bitte eine XML-Datei (CAMT.053) auswählen.');
    return;
  }

  // IBAN-Dateinamen-Prüfung (deaktivierbar per Checkbox)
  if (!window._jbBankIbanFilterOff) {
    const nameClean = file.name.toLowerCase().replace(/[-_]/g, '');
    const ibanClean = BANK_IBAN.replace(/[-_]/g, '');
    if (!nameClean.includes(ibanClean)) {
      const proceed = confirm(
        '⚠️ Kontofilter-Warnung\n\n' +
        'Die gewählte Datei enthält die IBAN\n' +
        'CH0680808003633131892\nnicht im Dateinamen.\n\n' +
        'Datei: ' + file.name + '\n\n' +
        'Möglicherweise handelt es sich um den falschen Kontoauszug.\n\n' +
        'Trotzdem laden?'
      );
      if (!proceed) {
        // Reset file input
        const inp = document.getElementById('bankXmlInput');
        if (inp) inp.value = '';
        return;
      }
    }
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const xmlText = e.target.result;
      const transactions = jbBankParseCAMT053(xmlText);
      _jbBankTransactions = transactions;
      _jbBankMatchResults = jbBankMatchAll(transactions);
      window._jbBankActiveFilter = 'all';
      // Re-render the whole tab to show stats + table
      renderJahresbeitragView();
    } catch(err) {
      alert('Fehler beim Lesen der XML-Datei: ' + err.message);
    } finally {
      // Immer resetten damit dieselbe oder eine andere Datei erneut gewählt werden kann
      const inp = document.getElementById('bankXmlInput');
      if (inp) inp.value = '';
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ---- CAMT.053 Parser ------------------------------------------
function jbBankParseCAMT053(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  // Namespace-agnostic helper
  function getTagText(el, tagName) {
    if (!el) return '';
    // Try with namespace prefix removal
    const nodes = el.getElementsByTagNameNS('*', tagName);
    if (nodes.length > 0) return (nodes[0].textContent || '').trim();
    return '';
  }

  function getFirstChild(el, tagName) {
    if (!el) return null;
    const nodes = el.getElementsByTagNameNS('*', tagName);
    return nodes.length > 0 ? nodes[0] : null;
  }

  const transactions = [];
  const entries = doc.getElementsByTagNameNS('*', 'Ntry');

  for (let i = 0; i < entries.length; i++) {
    const ntry = entries[i];

    // Only credits (Gutschriften)
    const cdtDbtInd = getTagText(ntry, 'CdtDbtInd');
    if (cdtDbtInd !== 'CRDT') continue;

    const amount      = parseFloat(getTagText(ntry, 'Amt') || '0');
    const bookingDate = getTagText(getFirstChild(ntry, 'BookgDt'), 'Dt');
    const addtlInfo   = getTagText(ntry, 'AddtlNtryInf');

    // TxDtls
    const txDtls = getFirstChild(ntry, 'TxDtls');

    // Debtor info
    const dbtrPty    = getFirstChild(getFirstChild(txDtls, 'Dbtr'), 'Pty');
    const ultDbtrPty = getFirstChild(getFirstChild(txDtls, 'UltmtDbtr'), 'Pty');
    // Prefer UltmtDbtr (actual payer), fallback to Dbtr
    const namePty = ultDbtrPty || dbtrPty;

    const debtorName     = getTagText(namePty, 'Nm');
    const pstlAdr        = getFirstChild(namePty, 'PstlAdr');
    const debtorPostCode = getTagText(pstlAdr, 'PstCd');
    const debtorCity     = getTagText(pstlAdr, 'TwnNm');
    // Some banks use AdrLine instead
    const adrLine        = getTagText(pstlAdr, 'AdrLine');

    // Remittance info
    const strd       = getFirstChild(getFirstChild(txDtls, 'RmtInf'), 'Strd');
    const ustrd      = getTagText(getFirstChild(txDtls, 'RmtInf'), 'Ustrd');
    const addtlRmt   = getTagText(strd, 'AddtlRmtInf');
    const remittanceInfo = addtlRmt || ustrd || addtlInfo || '';

    const cdtrRefInf = getFirstChild(strd, 'CdtrRefInf');
    const creditorReference = getTagText(cdtrRefInf, 'Ref');

    transactions.push({
      amount,
      bookingDate,
      debtorName,
      debtorPostCode,
      debtorCity: debtorCity || (adrLine ? adrLine.split(' ').slice(-1)[0] : ''),
      remittanceInfo,
      creditorReference,
      isJahresbeitrag: false // will be calculated during matching
    });
  }

  return transactions;
}

// ---- Matching Logic -------------------------------------------
// Score system:
//   +2 = Betrag stimmt UND Nachname stimmt (eindeutig)
//   +1 = Betrag stimmt ODER Name stimmt (unsicher)
//    0 = kein Treffer
function jbBankMatchAll(transactions) {
  // Alle Beitragsköpfe für das aktuelle Jahr
  const beitraege = (_jbAllBeitraege || []).filter(h => Number(h.year) === Number(_jbYear));
  const members   = _jbMembers || [];

  return transactions.map(tx => {
    // 1. Text-based detection (typos, abbreviations, keywords)
    const cleanRemittance = (tx.remittanceInfo || '').toLowerCase();
    const cleanAddtlInfo  = (tx.addtlInfo || '').toLowerCase();
    const cleanRef        = (tx.creditorReference || '').toLowerCase();
    
    // Patterns for matching the word "Jahresbeitrag" and its variants
    const jbRegex = /jahresbeitra\s*g/i;
    const jbRegex2 = /mitgliederbeitra\s*g/i;
    const jbRegex3 = /mitgliedsbeitra\s*g/i;
    const jbRegex4 = /vereinsbeitra\s*g/i;
    const jbRegex5 = /beitra\s*g/i;
    const jbRegex6 = /\bjb\b/i;
    const jbRegex7 = /jahresbeitr/i;
    
    const textHasJb = jbRegex.test(cleanRemittance) || jbRegex.test(cleanAddtlInfo) ||
                      jbRegex2.test(cleanRemittance) || jbRegex2.test(cleanAddtlInfo) ||
                      jbRegex3.test(cleanRemittance) || jbRegex3.test(cleanAddtlInfo) ||
                      jbRegex4.test(cleanRemittance) || jbRegex4.test(cleanAddtlInfo) ||
                      jbRegex5.test(cleanRemittance) || jbRegex5.test(cleanAddtlInfo) ||
                      jbRegex6.test(cleanRemittance) || jbRegex6.test(cleanAddtlInfo) ||
                      jbRegex7.test(cleanRemittance) || jbRegex7.test(cleanAddtlInfo);

    // If it has a structured reference, we consider it a likely Jahresbeitrag
    const hasRef = cleanRef.startsWith('rf') || /^\d+$/.test(cleanRef);

    // Extract name tokens from bank
    const bankName = normalizeName(tx.debtorName || '');
    const bankPLZ  = String(tx.debtorPostCode || '').trim();
    const bankOrt  = normalizeName(tx.debtorCity || '');

    let bestScore    = 0;
    let bestMember   = null;
    let bestBeitrag  = null;
    let bestAlready  = false;
    let bestPaidDate = '';
    let bestLastNameMatch = false;
    let bestFirstAndLastMatch = false;

    for (const m of members) {
      const b = beitraege.find(x => String(x.PersonNumber) === String(m.PersonNumber)) || null;

      const mLast  = normalizeName(m.LastName  || '');
      const mFirst = normalizeName(m.FirstName || '');
      const mPLZ   = String(m.PostCode || '').trim();
      const mOrt   = normalizeName(m.City || '');
      const mGesamt = b ? Number(b.Gesamt || 0) : (m._istPassiv ? 20 : 0);

      let score = 0;
      let lastNameMatch = false;
      let firstNameMatch = false;

      // 1. Betrag
      const amountMatch = Math.abs(mGesamt - tx.amount) < 0.01;
      if (amountMatch) score++;

      // 2. Nachname
      lastNameMatch = bankName.includes(mLast) || mLast.includes(bankName);
      if (lastNameMatch && mLast.length > 1) score++;

      // 3. Vorname (bonus)
      firstNameMatch = bankName.includes(mFirst) || mFirst.includes(bankName.split(' ')[0]);
      if (firstNameMatch && mFirst.length > 1) score += 0.5;

      // 4. PLZ / Ort (bonus)
      if (bankPLZ && mPLZ && bankPLZ === mPLZ) score += 0.5;
      if (bankOrt && mOrt && (bankOrt.includes(mOrt) || mOrt.includes(bankOrt))) score += 0.3;

      // 5. Reference number match
      const cleanMpn = String(m.PersonNumber || '').trim().replace(/^0+/, '');
      const cleanBid = b ? String(b.id || '').trim().replace(/^0+/, '') : '';
      const cleanDref = b ? String(b.document_ref || '').trim().replace(/^0+/, '') : '';

      if (cleanRef) {
        const numericRef = cleanRef.replace(/[^0-9]/g, '').replace(/^0+/, '');
        if (cleanMpn && numericRef.endsWith(cleanMpn)) {
          score += 2;
        } else if (cleanBid && numericRef === cleanBid) {
          score += 3;
        } else if (cleanDref && numericRef === cleanDref) {
          score += 3;
        }
      }

      if (score > bestScore) {
        bestScore   = score;
        bestMember  = m;
        bestBeitrag = b;
        bestAlready = b ? (b.status === 'bezahlt') : false;
        bestPaidDate = b ? (b.payment_date || '') : '';
        bestLastNameMatch = lastNameMatch;
        bestFirstAndLastMatch = lastNameMatch && firstNameMatch;
      }
    }

    // Determine if it is a Jahresbeitrag transaction
    const isJahresbeitrag = textHasJb || hasRef || bestFirstAndLastMatch || bestLastNameMatch || (bestScore >= 2);

    // Normalize matchScore to 0/1/2
    let matchScore = 0;
    if (isJahresbeitrag) {
      if (bestScore >= 2) matchScore = 2;       // eindeutig
      else if (bestScore >= 1) matchScore = 1;  // unsicher
    }

    return {
      ...tx,
      isJahresbeitrag,
      matchScore,
      matchedMember:  matchScore > 0 ? bestMember  : null,
      matchedBeitrag: matchScore > 0 ? bestBeitrag : null,
      alreadyPaid:    matchScore > 0 && bestAlready,
      alreadyPaidDate: bestPaidDate
    };
  });
}

// ---- Name Normalizer ------------------------------------------
function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Umlaute: ä→a, ö→o, ü→u
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Escape HTML helper (if not already defined) --------------
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Book one payment -----------------------------------------
async function jbBankBookOne(headerId, dateStr, resultIdx) {
  if (!headerId || !dateStr) { alert('Fehlende Daten zum Buchen.'); return; }

  const confirmed = confirm(`Zahlung vom ${dateStr} ins Sheet buchen?\nZahlungsmethode: Überweisung (Bank)`);
  if (!confirmed) return;

  try {
    const params = new URLSearchParams({
      action: 'saveZahlung',
      headerId,
      datum: dateStr,
      methode: 'Überweisung',
      beleg: 'CAMT053'
    });
    const res = await apiFetch('jahresbeitrag', params.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Fehler beim Speichern');

    // Update local cache
    const idx = Number(resultIdx);
    if (_jbBankMatchResults[idx]) {
      _jbBankMatchResults[idx].alreadyPaid    = true;
      _jbBankMatchResults[idx].alreadyPaidDate = dateStr;
    }
    // Update _jbAllBeitraege cache too
    if (_jbBankMatchResults[idx] && _jbBankMatchResults[idx].matchedBeitrag) {
      const bid = String(_jbBankMatchResults[idx].matchedBeitrag.id);
      const cached = (_jbAllBeitraege || []).find(h => String(h.id) === bid);
      if (cached) { cached.status = 'bezahlt'; cached.payment_date = dateStr; cached.payment_method = 'Überweisung'; }
    }

    showToast('✅ Zahlung erfolgreich gebucht!', 'success');
    jbBankRenderResults(window._jbBankActiveFilter);
    // Update stats banner
    const banner = document.getElementById('bankStatsBanner');
    if (banner) banner.innerHTML = jbBankStatsBannerHTML();

  } catch(err) {
    alert('Fehler: ' + err.message);
  }
}

// ---- Book ALL matched (score >= 2, not yet paid) --------------
async function jbBankBookAll() {
  const toBook = (_jbBankMatchResults || [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.isJahresbeitrag && r.matchScore >= 2 && !r.alreadyPaid && r.matchedBeitrag);

  if (!toBook.length) {
    showToast('Keine eindeutigen, unbezahlten Buchungen zum automatischen Buchen gefunden.', 'warning');
    return;
  }

  const ok = confirm(`${toBook.length} eindeutige Zahlungen jetzt buchen?`);
  if (!ok) return;

  let booked = 0;
  for (const { r, i } of toBook) {
    try {
      const params = new URLSearchParams({
        action: 'saveZahlung',
        headerId: r.matchedBeitrag.id,
        datum: r.bookingDate,
        methode: 'Überweisung',
        beleg: 'CAMT053'
      });
      const res = await apiFetch('jahresbeitrag', params.toString());
      const json = await res.json();
      if (json.success) {
        _jbBankMatchResults[i].alreadyPaid = true;
        _jbBankMatchResults[i].alreadyPaidDate = r.bookingDate;
        const bid = String(r.matchedBeitrag.id);
        const cached = (_jbAllBeitraege || []).find(h => String(h.id) === bid);
        if (cached) { cached.status = 'bezahlt'; cached.payment_date = r.bookingDate; cached.payment_method = 'Überweisung'; }
        booked++;
      }
    } catch(_) {}
  }

  showToast(`✅ ${booked} von ${toBook.length} Zahlungen gebucht!`, 'success');
  jbBankRenderResults(window._jbBankActiveFilter);
  const banner = document.getElementById('bankStatsBanner');
  if (banner) banner.innerHTML = jbBankStatsBannerHTML();
}

