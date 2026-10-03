// vorstand/js/jahresbeitrag/jahresbeitrag-matrix.js
// ============================================================
// BEITRAGSMATRIX / GEBÜHREN-ÜBERSICHT (EXCEL, DRUCK, PICKLISTE)
// ============================================================

let _jbMatrixSearch = '';
let _jbMatrixStatusFilter = ''; // '' = alle, 'offen', 'bezahlt'
let _jbMatrixSelected = new Set();
let _jbMatrixInitializedYear = null;
let _jbMatrixSortCol = 'name';
let _jbMatrixSortAsc = true;

// ============================================================
// HAUPT-RENDERER DES MATRIX-TABS
// ============================================================
function renderMatrixTab(canEdit, years) {
  const yearOptions = (years || []).map(y => 
    `<option value="${y}" ${Number(y) === Number(_jbYear) ? 'selected' : ''}>${y}</option>`
  ).join('');

  return `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3 mb-4 jb-matrix-root">
      
      <!-- Kopfbereich & Toolbar -->
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pb-3 mb-3 border-bottom d-print-none">
        <div>
          <h4 class="mb-1 text-primary fw-bold">
            <i class="fas fa-table-cells me-2"></i>Beitragsmatrix & Gebühren-Übersicht
          </h4>
          <p class="text-muted small mb-0">
            Detaillierte Matrix aller Schützen und Gebühren mit interaktiver Pickliste, Live-Summen, Excel-Export und Druckansicht.
          </p>
        </div>

        <div class="d-flex align-items-center gap-2 flex-wrap">
          <!-- Beitragsjahr Wechsler -->
          <div class="input-group input-group-sm" style="width: auto;">
            <span class="input-group-text bg-light fw-bold text-muted"><i class="fas fa-calendar-alt me-1"></i>Jahr</span>
            <select class="form-select form-select-sm fw-bold text-primary" id="jbMatrixYearSelect" onchange="jbChangeYear(this.value)" style="width: 95px;">
              ${yearOptions}
            </select>
          </div>

          <!-- Drucken Button -->
          <button class="btn btn-sm btn-outline-secondary shadow-sm fw-semibold" onclick="jbPrintMatrix()" title="Matrix im Querformat drucken / als PDF speichern">
            <i class="fas fa-print me-1"></i> Drucken / PDF
          </button>

          <!-- Excel Export Button -->
          <button class="btn btn-sm btn-success fw-bold shadow-sm" onclick="jbExportMatrixExcel()" title="Tabelle nach Excel (.xlsx) exportieren">
            <i class="fas fa-file-excel me-1"></i> Excel (.xlsx)
          </button>
        </div>
      </div>

      <!-- Druck-Kopf (nur beim Drucken sichtbar) -->
      <div class="d-none d-print-block mb-3">
        <div class="d-flex justify-content-between align-items-end border-bottom pb-2">
          <div>
            <h3 class="fw-bold mb-0 text-dark">Sportschützen Muhen</h3>
            <div class="fs-5 text-secondary">Beitragsmatrix & Gebühren-Übersicht ${Number(_jbYear)}</div>
          </div>
          <div class="text-end text-muted small">
            <div>Gedruckt am: ${new Date().toLocaleDateString('de-CH')}</div>
            <div id="jbMatrixPrintInfo"></div>
          </div>
        </div>
      </div>

      <!-- KPI-Karten (Live aktualisiert bei Pickliste) -->
      <div class="row g-3 mb-3 d-print-none">
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm p-3 border-start border-4 border-primary bg-light">
            <div class="small text-muted">Ausgewählte Schützen</div>
            <div class="fs-5 fw-bold text-primary" id="jbMatrixKpiCount">–</div>
            <div class="text-muted small" id="jbMatrixKpiCountSub">Standard: alle ausgewählt</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm p-3 border-start border-4 border-success bg-light">
            <div class="small text-muted">Summe Ausgewählt</div>
            <div class="fs-5 fw-bold text-success" id="jbMatrixKpiTotal">–</div>
            <div class="text-muted small">Live berechneter Gesamtbetrag</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm p-3 border-start border-4 border-info bg-light">
            <div class="small text-muted">Bezahlt (Ausgewählt)</div>
            <div class="fs-5 fw-bold text-dark" id="jbMatrixKpiBezahlt">–</div>
            <div class="text-muted small" id="jbMatrixKpiBezahltCount">–</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm p-3 border-start border-4 border-danger bg-light">
            <div class="small text-muted">Offen (Ausgewählt)</div>
            <div class="fs-5 fw-bold text-danger" id="jbMatrixKpiOffen">–</div>
            <div class="text-muted small" id="jbMatrixKpiOffenCount">–</div>
          </div>
        </div>
      </div>

      <!-- Filter- & Picklisten-Toolbar -->
      <div class="row g-2 mb-3 align-items-center d-print-none">
        <div class="col-md-4">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control" id="jbMatrixSearchInput" 
                   placeholder="Schütze suchen (Name oder Personennummer)..." 
                   value="${_jbMatrixSearch}" oninput="jbFilterMatrixTable()">
          </div>
        </div>

        <div class="col-md-3">
          <select class="form-select form-select-sm" id="jbMatrixStatusSelect" onchange="jbFilterMatrixTable()">
            <option value="" ${_jbMatrixStatusFilter === '' ? 'selected' : ''}>Alle Status (Offen & Bezahlt)</option>
            <option value="offen" ${_jbMatrixStatusFilter === 'offen' ? 'selected' : ''}>Nur Offene Rechnungen</option>
            <option value="bezahlt" ${_jbMatrixStatusFilter === 'bezahlt' ? 'selected' : ''}>Nur Bezahlte Rechnungen</option>
          </select>
        </div>

        <div class="col-md-5 d-flex justify-content-md-end gap-1 flex-wrap">
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-secondary" onclick="jbMatrixSelectAll(true)" title="Alle Schützen in Pickliste auswählen">
              <i class="fas fa-check-square me-1 text-primary"></i> Alle an
            </button>
            <button type="button" class="btn btn-outline-secondary" onclick="jbMatrixSelectAll(false)" title="Alle Schützen abwählen">
              <i class="far fa-square me-1"></i> Keine
            </button>
            <button type="button" class="btn btn-outline-secondary" onclick="jbMatrixSelectStatus('offen')" title="Nur offene Rechnungen auswählen">
              Nur Offene
            </button>
            <button type="button" class="btn btn-outline-secondary" onclick="jbMatrixSelectStatus('bezahlt')" title="Nur bezahlte Rechnungen auswählen">
              Nur Bezahlt
            </button>
          </div>
          <div id="jbMatrixColToggleDropdown"></div>
        </div>
      </div>

      <!-- Matrix Tabelle -->
      <div class="table-responsive border rounded-3 shadow-sm jb-matrix-container" style="max-height: calc(100vh - 290px); overflow: auto;">
        <table class="table table-hover table-sm align-middle mb-0 jb-matrix-table" id="jbMatrixTable">
          <thead class="table-light sticky-top small text-muted text-uppercase" style="font-size: 11px; z-index: 10;">
            <tr id="jbMatrixHeaderRow">
              <!-- Dynamisch gerendert -->
            </tr>
          </thead>
          <tbody id="jbMatrixBody">
            <!-- Dynamisch gerendert -->
          </tbody>
          <tfoot class="table-light small fw-bold sticky-bottom" id="jbMatrixFoot" style="z-index: 10; border-top: 2px solid #0f3a5d; background-color: #f1f5f9;">
            <tr id="jbMatrixFooterRow">
              <!-- Dynamisch berechnete Summen -->
            </tr>
          </tfoot>
        </table>
      </div>

    </div>

    <!-- Druck-Optimiertes Stylesheet -->
    <style>
      .jb-matrix-table th.tk-col-sticky-left,
      .jb-matrix-table td.tk-col-sticky-left {
        position: sticky;
        left: 0;
        z-index: 5;
        background-color: #ffffff;
      }
      .jb-matrix-table tr:hover td.tk-col-sticky-left {
        background-color: #f8fafc;
      }
      .jb-matrix-table th.tk-col-sticky-name,
      .jb-matrix-table td.tk-col-sticky-name {
        position: sticky;
        left: 42px;
        z-index: 5;
        background-color: #ffffff;
        box-shadow: 2px 0 4px rgba(0,0,0,0.04);
      }
      .jb-matrix-table tr:hover td.tk-col-sticky-name {
        background-color: #f8fafc;
      }
      .jb-matrix-table tfoot td.tk-col-sticky-left,
      .jb-matrix-table tfoot td.tk-col-sticky-name {
        background-color: #f1f5f9 !important;
        z-index: 11;
      }
      .jb-matrix-row-deselected {
        opacity: 0.45 !important;
        background-color: #f8fafc !important;
      }
      .jb-matrix-row-deselected td {
        color: #94a3b8 !important;
      }

      @media print {
        @page {
          size: landscape;
          margin: 8mm;
        }
        body {
          background: white !important;
          color: black !important;
          font-size: 9pt !important;
        }
        #jahresbeitrag-container > div:first-child,
        .d-print-none,
        .navbar,
        header,
        footer {
          display: none !important;
        }
        .jb-matrix-root {
          padding: 0 !important;
          box-shadow: none !important;
          border: 0 !important;
        }
        .jb-matrix-container {
          max-height: none !important;
          overflow: visible !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        .jb-matrix-table {
          width: 100% !important;
          font-size: 8.5pt !important;
        }
        .jb-matrix-table th, .jb-matrix-table td {
          padding: 3px 5px !important;
          border-color: #cbd5e1 !important;
        }
        .jb-matrix-table th.tk-col-sticky-left,
        .jb-matrix-table td.tk-col-sticky-left,
        .jb-matrix-table th.tk-col-sticky-name,
        .jb-matrix-table td.tk-col-sticky-name {
          position: static !important;
          box-shadow: none !important;
        }
        .jb-matrix-row-deselected {
          display: none !important; /* Abgewählte Schützen im Ausdruck standardmäßig ausblenden */
        }
      }
    </style>
  `;
}

// ============================================================
// INITIALISIERUNG DES MATRIX-TABS
// ============================================================
function jbInitMatrixTab() {
  const currentYear = Number(_jbYear);

  // Standardmässig beim ersten Laden des Jahres: ALLE Mitglieder in die Pickliste aufnehmen
  if (_jbMatrixInitializedYear !== currentYear) {
    _jbMatrixSelected = new Set((_jbData || []).map(r => String(r.PersonNumber).trim()));
    _jbMatrixInitializedYear = currentYear;
  }

  jbRenderMatrixTable();
}

// ============================================================
// SPALTEN-ERMITTLUNG (ALLE RELEVANTEN GEBÜHREN DES JAHRES)
// ============================================================
function jbGetMatrixColumns() {
  const posList = (_jbAllPositions || []).filter(p => Number(p.year) === Number(_jbYear));
  const fees = window._jbGebuehren || [];

  // Finde alle Keys, die in Positionen vorkommen
  const usedKeys = new Set(posList.map(p => String(p.source_field || p.sourcefield || p.key || '').trim().toUpperCase()).filter(Boolean));

  // Gebührenkatalog sortieren
  const catalogMap = {};
  fees.forEach(f => {
    const k = String(f.key || '').trim().toUpperCase();
    if (k) catalogMap[k] = f;
  });

  // Sammle alle darzustellenden Gebührenspalten
  const colKeys = [];

  // 1. Alle im Katalog vorhandenen Gebühren prüfen
  fees.forEach(f => {
    const k = String(f.key || '').trim().toUpperCase();
    if (!k) return;
    const isUsed = usedKeys.has(k);
    const isAktiv = f.aktiv !== false && f.aktiv !== '0' && f.aktiv !== 0;

    // Einschliessen wenn benutzt ODER aktiv
    if (isUsed || isAktiv) {
      if (!colKeys.includes(k)) colKeys.push(k);
    }
  });

  // 2. Positionen prüfen, die eventuell nicht im Katalog stehen (Sonderposten)
  usedKeys.forEach(k => {
    if (!colKeys.includes(k)) colKeys.push(k);
  });

  // 3. Sortierung der Spalten (Kategorie, sort_order, key)
  colKeys.sort((a, b) => {
    const objA = catalogMap[a] || {};
    const objB = catalogMap[b] || {};
    
    // Sort Order
    const sortA = objA.sort_order !== undefined ? Number(objA.sort_order) : 99;
    const sortB = objB.sort_order !== undefined ? Number(objB.sort_order) : 99;
    if (sortA !== sortB) return sortA - sortB;

    return a.localeCompare(b);
  });

  return colKeys.map(k => {
    const f = catalogMap[k] || {};
    let label = f.bezeichnungfrontend || f.bezeichnung || k;
    
    // Kurzbezeichnungen für kompaktes Tabellenlayout
    if (k === 'GE001') label = 'Schützenhaus';
    else if (k === 'RA001') label = 'Rabatt Vorstand';
    else if (k === 'RA002') label = 'Hausmeister';
    else if (k === 'RA003') label = 'Ehrenmitgliedschaft';
    else if (k === 'LI001') label = 'Lizenz Verein';
    else if (k === 'LI002') label = 'Lizenz Junior';
    else if (k === 'LI003') label = 'Lizenz Fremd';

    return {
      key: k,
      label: label,
      bezeichnung: f.bezeichnung || label,
      kategorie: f.kategorie || 'Gebühr',
      konto: f.konto_haben || f.konto || ''
    };
  });
}

// ============================================================
// TABELLEN-RENDERER & LIVE-SUMMEN
// ============================================================
function jbRenderMatrixTable() {
  const theadRow = document.getElementById('jbMatrixHeaderRow');
  const tbody = document.getElementById('jbMatrixBody');
  const tfootRow = document.getElementById('jbMatrixFooterRow');
  if (!theadRow || !tbody || !tfootRow) return;

  const columns = jbGetMatrixColumns();
  const search = (_jbMatrixSearch || '').toLowerCase().trim();
  const statusFilter = _jbMatrixStatusFilter;

  // 1. Daten filtern
  const rowsData = (_jbData || []).filter(r => {
    const pn = String(r.PersonNumber).trim();
    const m = _jbMemberMap[pn] || {};
    const fullName = `${m.FirstName || ''} ${m.LastName || ''} ${pn}`.toLowerCase();
    
    const matchSearch = !search || fullName.includes(search);
    const matchStatus = !statusFilter || r.status === statusFilter;

    return matchSearch && matchStatus;
  });

  // 2. Sortieren
  rowsData.sort((a, b) => {
    const pnA = String(a.PersonNumber).trim();
    const pnB = String(b.PersonNumber).trim();
    const mA = _jbMemberMap[pnA] || {};
    const mB = _jbMemberMap[pnB] || {};

    if (_jbMatrixSortCol === 'name') {
      const nameA = `${mA.LastName || ''} ${mA.FirstName || ''}`.toLowerCase();
      const nameB = `${mB.LastName || ''} ${mB.FirstName || ''}`.toLowerCase();
      return _jbMatrixSortAsc ? nameA.localeCompare(nameB, 'de') : nameB.localeCompare(nameA, 'de');
    } else if (_jbMatrixSortCol === 'pn') {
      const numA = Number(pnA) || 0;
      const numB = Number(pnB) || 0;
      return _jbMatrixSortAsc ? (numA - numB) : (numB - numA);
    } else if (_jbMatrixSortCol === 'gesamt') {
      const gA = Number(a.Gesamt || 0);
      const gB = Number(b.Gesamt || 0);
      return _jbMatrixSortAsc ? (gA - gB) : (gB - gA);
    } else if (_jbMatrixSortCol === 'status') {
      const sA = String(a.status || '');
      const sB = String(b.status || '');
      return _jbMatrixSortAsc ? sA.localeCompare(sB) : sB.localeCompare(sA);
    } else {
      // Sortierung nach einer spezifischen Gebühr
      const feeKey = _jbMatrixSortCol;
      const posA = _jbPositionsCache[a.id] || [];
      const posB = _jbPositionsCache[b.id] || [];
      const valA = posA.filter(p => (p.source_field || p.sourcefield || p.key) === feeKey).reduce((s, p) => s + Number(p.betrag || 0), 0);
      const valB = posB.filter(p => (p.source_field || p.sourcefield || p.key) === feeKey).reduce((s, p) => s + Number(p.betrag || 0), 0);
      return _jbMatrixSortAsc ? (valA - valB) : (valB - valA);
    }
  });

  // 3. Header rendern
  const allSelected = rowsData.length > 0 && rowsData.every(r => _jbMatrixSelected.has(String(r.PersonNumber).trim()));
  const someSelected = rowsData.some(r => _jbMatrixSelected.has(String(r.PersonNumber).trim()));

  let thHtml = `
    <th class="text-center tk-col-sticky-left" style="width: 42px;">
      <input type="checkbox" class="form-check-input" id="jbMatrixMasterCheck" 
             ${allSelected ? 'checked' : ''} 
             onclick="jbMatrixMasterCheckToggle(this.checked)" 
             title="Alle Schützen auswählen / abwählen">
    </th>
    <th class="tk-col-sticky-name" style="min-width: 170px; cursor: pointer; user-select: none;" onclick="jbMatrixSort('name')">
      Schütze <span class="tk-sort-ind">${_jbMatrixSortCol === 'name' ? (_jbMatrixSortAsc ? '▲' : '▼') : '↕'}</span>
    </th>
    <th class="text-center" style="width: 80px; cursor: pointer; user-select: none;" onclick="jbMatrixSort('status')">
      Status <span class="tk-sort-ind">${_jbMatrixSortCol === 'status' ? (_jbMatrixSortAsc ? '▲' : '▼') : '↕'}</span>
    </th>
  `;

  columns.forEach(col => {
    thHtml += `
      <th class="text-end" style="min-width: 45px; cursor: pointer; user-select: none;" onclick="jbMatrixSort('${col.key}')" title="${escHtml(col.bezeichnung)} (${col.key})">
        <div style="font-size: 10px; font-weight: 700; white-space: normal; word-break: break-word; overflow-wrap: break-word; hyphens: auto; -webkit-hyphens: auto; line-height: 1.15;" lang="de">${escHtml(col.label)}</div>
        <div class="text-muted" style="font-size: 9px; font-weight: normal; font-family: monospace;">${col.key}</div>
      </th>
    `;
  });

  thHtml += `
    <th class="text-end pe-3 bg-light" style="min-width: 95px; cursor: pointer; user-select: none;" onclick="jbMatrixSort('gesamt')">
      Total CHF <span class="tk-sort-ind">${_jbMatrixSortCol === 'gesamt' ? (_jbMatrixSortAsc ? '▲' : '▼') : '↕'}</span>
    </th>
  `;

  theadRow.innerHTML = thHtml;

  // Master Checkbox Indeterminate Status
  const masterCheckEl = document.getElementById('jbMatrixMasterCheck');
  if (masterCheckEl) {
    masterCheckEl.indeterminate = (!allSelected && someSelected);
  }

  // 4. Body rendern
  if (rowsData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${columns.length + 4}" class="text-center py-5 text-muted">
          <i class="fas fa-info-circle me-1"></i> Keine Beitragsrechnungen gefunden.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = rowsData.map(r => {
      const pn = String(r.PersonNumber).trim();
      const m = _jbMemberMap[pn] || {};
      const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : (r._name || pn);
      const isSelected = _jbMatrixSelected.has(pn);
      const isPaid = r.status === 'bezahlt';

      // Positionen dieses Mitglieds
      const positions = _jbPositionsCache[r.id] || [];
      const feeMap = {};
      positions.forEach(p => {
        const k = String(p.source_field || p.sourcefield || p.key || '').trim().toUpperCase();
        if (k) {
          feeMap[k] = (feeMap[k] || 0) + Number(p.betrag || 0);
        }
      });

      // Status Badge
      const statusBadge = isPaid
        ? `<span class="badge bg-success-subtle text-success border border-success-subtle px-1.5 py-0.5" style="font-size: 10px;">Bezahlt</span>`
        : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-1.5 py-0.5" style="font-size: 10px;">Offen</span>`;

      // Zellen für jede Gebühr
      let cellsHtml = '';
      columns.forEach(col => {
        const val = feeMap[col.key];
        if (val !== undefined && Math.abs(val) > 0.001) {
          const isCredit = val < 0;
          const displayVal = isCredit ? `-${fmtChf(Math.abs(val)).replace('CHF', '').trim()}` : fmtChf(val).replace('CHF', '').trim();
          const colorClass = isCredit ? 'text-success fw-bold' : 'text-dark font-monospace';
          cellsHtml += `<td class="text-end ${colorClass}" style="font-size: 12px;">${displayVal}</td>`;
        } else {
          cellsHtml += `<td class="text-end text-muted opacity-25" style="font-size: 11px;">–</td>`;
        }
      });

      const rowClass = isSelected ? '' : 'jb-matrix-row-deselected';

      return `
        <tr class="${rowClass}" id="jbMatrixRow_${pn}">
          <td class="text-center tk-col-sticky-left py-2">
            <input type="checkbox" class="form-check-input jb-matrix-row-check" 
                   value="${pn}" ${isSelected ? 'checked' : ''} 
                   onchange="jbMatrixToggleMember('${pn}', this.checked)">
          </td>
          <td class="tk-col-sticky-name py-2">
            <a href="#" class="text-decoration-none fw-semibold text-primary" 
               onclick="jbShowPositionen('${r.id}'); return false;">${escHtml(name)}</a>
            <div class="text-muted small" style="font-size: 10px;">${pn}</div>
          </td>
          <td class="text-center">${statusBadge}</td>
          ${cellsHtml}
          <td class="text-end pe-3 fw-bold bg-light font-monospace" style="font-size: 13px; color: #0f3a5d;">
            ${fmtChf(r.Gesamt)}
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. Footer & KPIs berechnen
  jbCalculateMatrixTotals(rowsData, columns);
}

// ============================================================
// LIVE-NEUBERECHNUNG DER SUMMEN BEI TICK/UNTICK
// ============================================================
function jbCalculateMatrixTotals(rowsData, columns) {
  if (!rowsData) {
    const search = (_jbMatrixSearch || '').toLowerCase().trim();
    const statusFilter = _jbMatrixStatusFilter;
    rowsData = (_jbData || []).filter(r => {
      const pn = String(r.PersonNumber).trim();
      const m = _jbMemberMap[pn] || {};
      const fullName = `${m.FirstName || ''} ${m.LastName || ''} ${pn}`.toLowerCase();
      const matchSearch = !search || fullName.includes(search);
      const matchStatus = !statusFilter || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }
  if (!columns) {
    columns = jbGetMatrixColumns();
  }

  const selectedRows = rowsData.filter(r => _jbMatrixSelected.has(String(r.PersonNumber).trim()));

  // Summen pro Gebühr berechnen
  const colTotals = {};
  columns.forEach(c => { colTotals[c.key] = 0; });
  let grandTotal = 0;
  let bezahltTotal = 0;
  let bezahltCount = 0;
  let offenTotal = 0;
  let offenCount = 0;

  selectedRows.forEach(r => {
    grandTotal += Number(r.Gesamt || 0);
    if (r.status === 'bezahlt') {
      bezahltTotal += Number(r.Gesamt || 0);
      bezahltCount++;
    } else {
      offenTotal += Number(r.Gesamt || 0);
      offenCount++;
    }

    const positions = _jbPositionsCache[r.id] || [];
    positions.forEach(p => {
      const k = String(p.source_field || p.sourcefield || p.key || '').trim().toUpperCase();
      if (colTotals[k] !== undefined) {
        colTotals[k] += Number(p.betrag || 0);
      }
    });
  });

  // 1. Footer-Zeile aktualisieren
  const tfootRow = document.getElementById('jbMatrixFooterRow');
  if (tfootRow) {
    let ftHtml = `
      <td class="text-center tk-col-sticky-left py-2">
        <i class="fas fa-sigma text-primary"></i>
      </td>
      <td class="tk-col-sticky-name py-2">
        <div class="fw-bold text-dark">SUMME (${selectedRows.length} Schützen)</div>
        <div class="text-muted small" style="font-size: 10px;">von ${rowsData.length} gefiltert</div>
      </td>
      <td class="text-center">–</td>
    `;

    columns.forEach(col => {
      const sumVal = colTotals[col.key] || 0;
      const displayVal = Math.abs(sumVal) > 0.001 
        ? fmtChf(sumVal).replace('CHF', '').trim() 
        : '–';
      const colorStyle = sumVal < 0 ? 'text-success' : 'text-dark';
      ftHtml += `<td class="text-end font-monospace ${colorStyle}" style="font-size: 12px; font-weight: 700;">${displayVal}</td>`;
    });

    ftHtml += `
      <td class="text-end pe-3 text-primary fw-extrabold font-monospace" style="font-size: 14px;">
        ${fmtChf(grandTotal)}
      </td>
    `;

    tfootRow.innerHTML = ftHtml;
  }

  // 2. KPI Karten aktualisieren
  const kpiCount = document.getElementById('jbMatrixKpiCount');
  const kpiCountSub = document.getElementById('jbMatrixKpiCountSub');
  const kpiTotal = document.getElementById('jbMatrixKpiTotal');
  const kpiBezahlt = document.getElementById('jbMatrixKpiBezahlt');
  const kpiBezahltCount = document.getElementById('jbMatrixKpiBezahltCount');
  const kpiOffen = document.getElementById('jbMatrixKpiOffen');
  const kpiOffenCount = document.getElementById('jbMatrixKpiOffenCount');

  if (kpiCount) kpiCount.textContent = `${selectedRows.length} / ${rowsData.length}`;
  if (kpiCountSub) kpiCountSub.textContent = `${Math.round((selectedRows.length / (rowsData.length || 1)) * 100)}% aktiv in Auswertung`;
  if (kpiTotal) kpiTotal.textContent = fmtChf(grandTotal);
  if (kpiBezahlt) kpiBezahlt.textContent = fmtChf(bezahltTotal);
  if (kpiBezahltCount) kpiBezahltCount.textContent = `${bezahltCount} Mitglieder bezahlt`;
  if (kpiOffen) kpiOffen.textContent = fmtChf(offenTotal);
  if (kpiOffenCount) kpiOffenCount.textContent = `${offenCount} Mitglieder ausstehend`;

  // 3. Druck-Info Text aktualisieren
  const printInfoEl = document.getElementById('jbMatrixPrintInfo');
  if (printInfoEl) {
    printInfoEl.textContent = `Ausgewählt: ${selectedRows.length} von ${rowsData.length} Schützen | Gesamtsumme: ${fmtChf(grandTotal)}`;
  }
}

// ============================================================
// PICKLISTEN-INTERAKTIONEN (TICK / UNTICK / BULK)
// ============================================================
function jbMatrixToggleMember(pn, isChecked) {
  pn = String(pn).trim();
  if (isChecked) {
    _jbMatrixSelected.add(pn);
  } else {
    _jbMatrixSelected.delete(pn);
  }

  // Zeile optisch hervorheben/dimmen
  const rowEl = document.getElementById(`jbMatrixRow_${pn}`);
  if (rowEl) {
    if (isChecked) rowEl.classList.remove('jb-matrix-row-deselected');
    else rowEl.classList.add('jb-matrix-row-deselected');
  }

  // Master Checkbox Status nachführen
  const checkBoxes = Array.from(document.querySelectorAll('.jb-matrix-row-check'));
  const masterCheck = document.getElementById('jbMatrixMasterCheck');
  if (masterCheck && checkBoxes.length > 0) {
    const allChecked = checkBoxes.every(cb => cb.checked);
    const someChecked = checkBoxes.some(cb => cb.checked);
    masterCheck.checked = allChecked;
    masterCheck.indeterminate = (!allChecked && someChecked);
  }

  // Summen sofort neu berechnen
  jbCalculateMatrixTotals();
}

function jbMatrixMasterCheckToggle(checkAll) {
  const checkBoxes = document.querySelectorAll('.jb-matrix-row-check');
  checkBoxes.forEach(cb => {
    cb.checked = checkAll;
    const pn = String(cb.value).trim();
    if (checkAll) _jbMatrixSelected.add(pn);
    else _jbMatrixSelected.delete(pn);

    const rowEl = document.getElementById(`jbMatrixRow_${pn}`);
    if (rowEl) {
      if (checkAll) rowEl.classList.remove('jb-matrix-row-deselected');
      else rowEl.classList.add('jb-matrix-row-deselected');
    }
  });

  jbCalculateMatrixTotals();
}

function jbMatrixSelectAll(selectAll) {
  if (selectAll) {
    (_jbData || []).forEach(r => _jbMatrixSelected.add(String(r.PersonNumber).trim()));
  } else {
    _jbMatrixSelected.clear();
  }
  jbRenderMatrixTable();
}

function jbMatrixSelectStatus(status) {
  _jbMatrixSelected.clear();
  (_jbData || []).forEach(r => {
    if (r.status === status) {
      _jbMatrixSelected.add(String(r.PersonNumber).trim());
    }
  });
  jbRenderMatrixTable();
}

function jbFilterMatrixTable() {
  _jbMatrixSearch = document.getElementById('jbMatrixSearchInput')?.value || '';
  _jbMatrixStatusFilter = document.getElementById('jbMatrixStatusSelect')?.value || '';
  jbRenderMatrixTable();
}

function jbMatrixSort(col) {
  if (_jbMatrixSortCol === col) {
    _jbMatrixSortAsc = !_jbMatrixSortAsc;
  } else {
    _jbMatrixSortCol = col;
    _jbMatrixSortAsc = true;
  }
  jbRenderMatrixTable();
}

// ============================================================
// EXCEL-EXPORT (.XLSX VIA SHEETJS)
// ============================================================
function jbExportMatrixExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Fehler: SheetJS (XLSX) Bibliothek ist nicht geladen.");
    return;
  }

  const columns = jbGetMatrixColumns();
  const search = (_jbMatrixSearch || '').toLowerCase().trim();
  const statusFilter = _jbMatrixStatusFilter;

  // Nur sichtbare/gefilterte Zeilen exportieren
  const rowsData = (_jbData || []).filter(r => {
    const pn = String(r.PersonNumber).trim();
    const m = _jbMemberMap[pn] || {};
    const fullName = `${m.FirstName || ''} ${m.LastName || ''} ${pn}`.toLowerCase();
    const matchSearch = !search || fullName.includes(search);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (rowsData.length === 0) {
    alert("Keine Daten für den Excel-Export vorhanden.");
    return;
  }

  // 1. Kopfzeilen aufbauen
  const headerRow1 = [
    'Ausgewählt',
    'Personennummer',
    'Name',
    'Vorname',
    'Kategorie',
    'Status',
    'Bezahlt am',
    'Zahlungsmethode',
    'Beleg / Ref'
  ];
  columns.forEach(col => {
    headerRow1.push(`${col.label} (${col.key})`);
  });
  headerRow1.push('Total CHF');

  // 2. Datenzeilen aufbauen
  const dataRows = [];
  const colTotals = {};
  columns.forEach(c => { colTotals[c.key] = 0; });
  let grandTotal = 0;

  rowsData.forEach(r => {
    const pn = String(r.PersonNumber).trim();
    const m = _jbMemberMap[pn] || {};
    const isSelected = _jbMatrixSelected.has(pn);

    const positions = _jbPositionsCache[r.id] || [];
    const feeMap = {};
    positions.forEach(p => {
      const k = String(p.source_field || p.sourcefield || p.key || '').trim().toUpperCase();
      if (k) feeMap[k] = (feeMap[k] || 0) + Number(p.betrag || 0);
    });

    const row = [
      isSelected ? 'Ja' : 'Nein',
      pn,
      m.LastName || r._name || '',
      m.FirstName || '',
      m._kategorie || r._kategorie || 'Aktiv',
      r.status || 'offen',
      r.payment_date || '',
      r.payment_method || '',
      r.document_ref || ''
    ];

    columns.forEach(col => {
      const val = feeMap[col.key] || 0;
      row.push(val);
      if (isSelected) {
        colTotals[col.key] = (colTotals[col.key] || 0) + val;
      }
    });

    const rowTotal = Number(r.Gesamt || 0);
    row.push(rowTotal);
    if (isSelected) {
      grandTotal += rowTotal;
    }

    dataRows.push(row);
  });

  // 3. Summenzeile aufbauen
  const sumRow = [
    'SUMME',
    `${_jbMatrixSelected.size} Schützen ausgewählt`,
    '', '', '', '', '', '', ''
  ];
  columns.forEach(col => {
    sumRow.push(colTotals[col.key] || 0);
  });
  sumRow.push(grandTotal);

  // 4. Excel Workbook erzeugen
  const wsData = [
    [`Sportschützen Muhen - Beitragsmatrix & Gebührenübersicht ${_jbYear}`],
    [`Erstellt am: ${new Date().toLocaleDateString('de-CH')} | Ausgewählt: ${_jbMatrixSelected.size} von ${rowsData.length} Schützen`],
    [], // Leerzeile
    headerRow1,
    ...dataRows,
    [], // Leerzeile
    sumRow
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Beitragsmatrix_${_jbYear}`);

  // Spaltenbreiten optimieren
  const colWidths = [
    { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
  ];
  columns.forEach(() => colWidths.push({ wch: 14 }));
  colWidths.push({ wch: 14 });
  ws['!cols'] = colWidths;

  const fileName = `Sportschuetzen_Muhen_Beitragsmatrix_${_jbYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ============================================================
// DRUCK-FUNKTION
// ============================================================
function jbPrintMatrix() {
  window.print();
}

window.renderMatrixTab = renderMatrixTab;
window.jbInitMatrixTab = jbInitMatrixTab;
window.jbRenderMatrixTable = jbRenderMatrixTable;
window.jbMatrixToggleMember = jbMatrixToggleMember;
window.jbMatrixMasterCheckToggle = jbMatrixMasterCheckToggle;
window.jbMatrixSelectAll = jbMatrixSelectAll;
window.jbMatrixSelectStatus = jbMatrixSelectStatus;
window.jbFilterMatrixTable = jbFilterMatrixTable;
window.jbMatrixSort = jbMatrixSort;
window.jbExportMatrixExcel = jbExportMatrixExcel;
window.jbPrintMatrix = jbPrintMatrix;
