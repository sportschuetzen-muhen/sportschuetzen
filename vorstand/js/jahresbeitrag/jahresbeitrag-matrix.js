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
            <option value="" ${_jbMatrixStatusFilter === '' ? 'selected' : ''}>Alle Status</option>
            <option value="berechnet" ${_jbMatrixStatusFilter === 'berechnet' ? 'selected' : ''}>Berechnet (Noch keine RE)</option>
            <option value="entwurf" ${_jbMatrixStatusFilter === 'entwurf' ? 'selected' : ''}>Entwurf (RE im RechnungsCore)</option>
            <option value="versendet" ${_jbMatrixStatusFilter === 'versendet' ? 'selected' : ''}>Versendet (Offen)</option>
            <option value="teilbezahlt" ${_jbMatrixStatusFilter === 'teilbezahlt' ? 'selected' : ''}>Teilbezahlt</option>
            <option value="bezahlt" ${_jbMatrixStatusFilter === 'bezahlt' ? 'selected' : ''}>Bezahlt</option>
            <option value="befreit" ${_jbMatrixStatusFilter === 'befreit' ? 'selected' : ''}>Befreit (0 CHF)</option>
            <option value="offen" ${_jbMatrixStatusFilter === 'offen' ? 'selected' : ''}>Ausstehend (Offen)</option>
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
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="jbMatrixResetColumns()" title="Spaltenreihenfolge und Breiten auf Standard zurücksetzen">
            <i class="fas fa-undo me-1"></i> Standard-Spalten
          </button>
          <div id="jbMatrixColToggleDropdown"></div>
        </div>
      </div>

      <!-- Obere synchrone Scrollleiste für schnelles horizontales Scrollen -->
      <div id="jbMatrixTopScroll" class="border rounded-top-3 bg-light overflow-x-auto overflow-y-hidden d-print-none" style="height: 12px; margin-bottom: -1px;">
        <div id="jbMatrixTopScrollTrack" style="height: 1px; min-width: 100%;"></div>
      </div>

      <!-- Matrix Tabelle -->
      <div class="table-responsive border rounded-bottom-3 shadow-sm jb-matrix-container" id="jbMatrixContainer" style="max-height: calc(100vh - 410px); min-height: 380px; overflow: auto;">
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

    <!-- Druck- & Matrix-Optimiertes Stylesheet -->
    <style>
      .jb-matrix-table thead th {
        vertical-align: top !important;
        padding-top: 6px !important;
        padding-bottom: 6px !important;
      }
      .jb-matrix-table th.tk-col-sticky-left,
      .jb-matrix-table td.tk-col-sticky-left {
        position: sticky;
        left: 0;
        z-index: 6;
        background-color: #ffffff;
      }
      .jb-matrix-table tr:hover td.tk-col-sticky-left {
        background-color: #f8fafc;
      }
      .jb-matrix-table th.tk-col-sticky-name,
      .jb-matrix-table td.tk-col-sticky-name {
        position: sticky;
        left: 42px;
        z-index: 6;
        background-color: #ffffff;
        box-shadow: 2px 0 4px rgba(0,0,0,0.04);
      }
      .jb-matrix-table tr:hover td.tk-col-sticky-name {
        background-color: #f8fafc;
      }
      .jb-matrix-table th.tk-col-sticky-status,
      .jb-matrix-table td.tk-col-sticky-status {
        position: sticky;
        left: 192px;
        z-index: 6;
        background-color: #ffffff;
        box-shadow: 3px 0 5px rgba(0,0,0,0.05);
      }
      .jb-matrix-table tr:hover td.tk-col-sticky-status {
        background-color: #f8fafc;
      }
      .jb-matrix-table thead th.tk-col-sticky-left,
      .jb-matrix-table thead th.tk-col-sticky-name,
      .jb-matrix-table thead th.tk-col-sticky-status {
        background-color: #f8fafc !important;
        z-index: 15 !important;
      }
      .jb-matrix-table tfoot td.tk-col-sticky-left,
      .jb-matrix-table tfoot td.tk-col-sticky-name,
      .jb-matrix-table tfoot td.tk-col-sticky-status {
        background-color: #f1f5f9 !important;
        z-index: 15 !important;
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
// HILFSFUNKTION: KATEGORISIERUNG & FARBEN DER GEBÜHREN
// ============================================================
function jbGetMatrixCategory(key) {
  const k = String(key || '').trim().toUpperCase();
  if (k.startsWith('JB')) {
    return { id: 'jb', label: 'Jahresbeitrag', badge: 'JB', color: '#1d4ed8', bg: '#eff6ff', border: '#2563eb', sort: 1 };
  }
  if (k.startsWith('LI') || k.startsWith('GE')) {
    return { id: 'anlage', label: 'Lizenzen & Anlage', badge: 'LIZENZ / GEB', color: '#0f766e', bg: '#f0fdfa', border: '#0d9488', sort: 2 };
  }
  if (k.startsWith('KK')) {
    return { id: 'kk', label: 'Kleinkaliber (50m)', badge: 'KK 50m', color: '#c2410c', bg: '#fff7ed', border: '#ea580c', sort: 3 };
  }
  if (k.startsWith('LG')) {
    return { id: 'lg', label: 'Luftgewehr (10m)', badge: 'LG 10m', color: '#7c3aed', bg: '#faf5ff', border: '#8b5cf6', sort: 4 };
  }
  if (k.startsWith('RA') || k.includes('JUGEND') || k === 'KOSTENUEBERNAHME_JUGEND') {
    return { id: 'rabatt', label: 'Rabatte & Gutschriften', badge: 'RABATT', color: '#047857', bg: '#ecfdf5', border: '#10b981', sort: 5 };
  }
  if (k.startsWith('Z')) {
    return { id: 'var', label: 'Variable Positionen', badge: 'VAR', color: '#475569', bg: '#f8fafc', border: '#64748b', sort: 6 };
  }
  return { id: 'sonst', label: 'Sonstige Gebühren', badge: 'SONST', color: '#6b7280', bg: '#f9fafb', border: '#9ca3af', sort: 7 };
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

  // 3. Sortierung der Spalten (Kategorie-Gruppierung, dann sort_order, dann Key)
  colKeys.sort((a, b) => {
    const catA = jbGetMatrixCategory(a);
    const catB = jbGetMatrixCategory(b);
    if (catA.sort !== catB.sort) return catA.sort - catB.sort;

    const objA = catalogMap[a] || {};
    const objB = catalogMap[b] || {};
    
    const sortA = objA.sort_order !== undefined ? Number(objA.sort_order) : 99;
    const sortB = objB.sort_order !== undefined ? Number(objB.sort_order) : 99;
    if (sortA !== sortB) return sortA - sortB;

    return a.localeCompare(b);
  });

  return colKeys.map(k => {
    const f = catalogMap[k] || {};
    const label = f.ui_feld || f.bezeichnung_frontend || f.bezeichnungfrontend || f.bezeichnung || k;
    const cat = jbGetMatrixCategory(k);

    return {
      key: k,
      label: label,
      bezeichnung: f.bezeichnung || f.bezeichnung_frontend || f.bezeichnungfrontend || label,
      kategorie: f.kategorie || cat.label,
      categoryInfo: cat,
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
    const effStatus = typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(r) : (r.status || 'offen');
    let matchStatus = true;
    if (statusFilter === 'offen') {
      matchStatus = effStatus !== 'bezahlt' && effStatus !== 'befreit';
    } else if (statusFilter) {
      matchStatus = effStatus === statusFilter;
    }

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
      const sA = (typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(a) : (a.status || '')).toLowerCase();
      const sB = (typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(b) : (b.status || '')).toLowerCase();
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
    <th class="text-center tk-col-sticky-left" data-col-id="check" style="width: 42px;">
      <div class="d-flex flex-column justify-content-between h-100" style="min-height: 75px;">
        <div class="mb-1" style="height: 14px;"></div>
        <div class="my-auto">
          <input type="checkbox" class="form-check-input" id="jbMatrixMasterCheck" 
                 ${allSelected ? 'checked' : ''} 
                 onclick="jbMatrixMasterCheckToggle(this.checked)" 
                 title="Alle Schützen auswählen / abwählen">
        </div>
        <div class="mt-auto" style="height: 12px;"></div>
      </div>
    </th>
    <th class="tk-col-sticky-name" data-col-id="name" style="width: 150px; min-width: 110px; cursor: pointer; user-select: none;" onclick="jbMatrixSort('name')">
      <div class="d-flex flex-column justify-content-between h-100" style="min-height: 75px;">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="badge px-1 py-0 text-muted bg-white border" style="font-size: 8px; font-weight: 700;">NAME</span>
          <span class="tk-sort-ind text-muted" style="font-size: 9px;">${_jbMatrixSortCol === 'name' ? (_jbMatrixSortAsc ? '▲' : '▼') : '↕'}</span>
        </div>
        <div class="my-auto py-1 fw-bold text-dark" style="font-size: 11px;">Schütze</div>
        <div class="mt-auto text-muted" style="font-size: 8.5px; font-family: monospace;">Mitglied</div>
      </div>
    </th>
    <th class="text-center tk-col-status tk-col-sticky-status" data-col-id="status" data-col-name="Status" style="width: 80px; min-width: 75px; cursor: pointer; user-select: none;" onclick="jbMatrixSort('status')">
      <div class="d-flex flex-column justify-content-between h-100" style="min-height: 75px;">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="badge px-1 py-0 text-muted bg-white border" style="font-size: 8px; font-weight: 700;">INFO</span>
          <span class="tk-sort-ind text-muted" style="font-size: 9px;">${_jbMatrixSortCol === 'status' ? (_jbMatrixSortAsc ? '▲' : '▼') : '↕'}</span>
        </div>
        <div class="my-auto py-1 fw-bold text-dark" style="font-size: 11px;">Status</div>
        <div class="mt-auto text-muted" style="font-size: 8.5px; font-family: monospace;">Beleg</div>
      </div>
    </th>
  `;

  columns.forEach(col => {
    const cat = col.categoryInfo || jbGetMatrixCategory(col.key);
    thHtml += `
      <th class="text-end tk-col-${col.key}" 
          data-col-id="${col.key}" 
          data-col-name="[${cat.badge}] ${escHtml(col.label)} (${col.key})"
          data-col-cat="${cat.id}"
          data-col-cat-name="${cat.label}"
          data-col-cat-color="${cat.color}"
          style="min-width: 58px; cursor: pointer; user-select: none; border-top: 4px solid ${cat.border} !important; background-color: ${cat.bg} !important; transition: background-color 0.15s ease;" 
          onclick="jbMatrixSort('${col.key}')" 
          title="${escHtml(cat.label)}: ${escHtml(col.bezeichnung)} (${col.key})">
        <div class="d-flex flex-column justify-content-between h-100" style="min-height: 75px;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge px-1 py-0 shadow-xs" style="font-size: 8px; font-weight: 700; background-color: ${cat.color}; color: #ffffff; letter-spacing: 0.3px;">${cat.badge}</span>
            <span class="tk-sort-ind text-muted" style="font-size: 9px;">${_jbMatrixSortCol === col.key ? (_jbMatrixSortAsc ? '▲' : '▼') : '↕'}</span>
          </div>
          <div class="my-auto py-1" style="font-size: 10px; font-weight: 700; color: #1e293b; white-space: normal; word-break: break-word; overflow-wrap: break-word; hyphens: auto; -webkit-hyphens: auto; line-height: 1.15;" lang="de">${escHtml(col.label)}</div>
          <div class="mt-auto" style="font-size: 8.5px; font-weight: 600; font-family: monospace; color: ${cat.color};">${col.key}</div>
        </div>
      </th>
    `;
  });

  thHtml += `
    <th class="text-end pe-3 tk-col-gesamt" data-col-id="gesamt" data-col-name="Total CHF" 
        style="min-width: 95px; cursor: pointer; user-select: none; border-top: 4px solid #0f3a5d !important; background-color: #f1f5f9 !important;" 
        onclick="jbMatrixSort('gesamt')">
      <div class="d-flex flex-column justify-content-between h-100" style="min-height: 75px;">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="badge px-1 py-0" style="font-size: 8px; font-weight: 700; background-color: #0f3a5d; color: #ffffff;">TOTAL</span>
          <span class="tk-sort-ind text-muted" style="font-size: 9px;">${_jbMatrixSortCol === 'gesamt' ? (_jbMatrixSortAsc ? '▲' : '▼') : '↕'}</span>
        </div>
        <div class="my-auto py-1 fw-bold text-dark" style="font-size: 11px;">Total CHF</div>
        <div class="mt-auto text-muted" style="font-size: 8.5px; font-family: monospace;">Saldo</div>
      </div>
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
      const effStatus = typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(r) : (r.status || 'offen');

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
      let statusBadge = '';
      if (effStatus === 'bezahlt') {
        statusBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle px-1.5 py-0.5" style="font-size: 10px;">Bezahlt</span>`;
      } else if (effStatus === 'teilbezahlt') {
        statusBadge = `<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-1.5 py-0.5" style="font-size: 10px;">Teilbezahlt</span>`;
      } else if (effStatus === 'versendet') {
        statusBadge = `<span class="badge bg-info-subtle text-info border border-info-subtle px-1.5 py-0.5" style="font-size: 10px;">Versendet</span>`;
      } else if (effStatus === 'entwurf') {
        statusBadge = `<span class="badge bg-warning-subtle text-warning border border-warning-subtle px-1.5 py-0.5" style="font-size: 10px;">Entwurf</span>`;
      } else if (effStatus === 'befreit') {
        statusBadge = `<span class="badge bg-light text-muted border px-1.5 py-0.5" style="font-size: 10px;">Befreit</span>`;
      } else {
        statusBadge = `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-1.5 py-0.5" style="font-size: 10px;">Berechnet</span>`;
      }

      // Zellen für jede Gebühr
      let cellsHtml = '';
      columns.forEach(col => {
        const val = feeMap[col.key];
        if (val !== undefined && Math.abs(val) > 0.001) {
          const isCredit = val < 0;
          const displayVal = isCredit ? `-${fmtChf(Math.abs(val)).replace('CHF', '').trim()}` : fmtChf(val).replace('CHF', '').trim();
          const colorClass = isCredit ? 'text-success fw-bold' : 'text-dark font-monospace';
          cellsHtml += `<td class="text-end tk-col-${col.key} ${colorClass}" data-col-id="${col.key}" style="font-size: 12px;">${displayVal}</td>`;
        } else {
          cellsHtml += `<td class="text-end text-muted opacity-25 tk-col-${col.key}" data-col-id="${col.key}" style="font-size: 11px;">–</td>`;
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
          <td class="tk-col-sticky-name py-2" data-col-id="name" style="max-width: 150px;">
            <a href="#" class="text-decoration-none fw-semibold text-primary d-block text-truncate" 
               onclick="jbShowPositionen('${r.id}'); return false;" title="${escHtml(name)}">${escHtml(name)}</a>
            <div class="text-muted small text-truncate" style="font-size: 10px;" title="${pn}">${pn}</div>
          </td>
          <td class="text-center tk-col-status tk-col-sticky-status" data-col-id="status">${statusBadge}</td>
          ${cellsHtml}
          <td class="text-end pe-3 fw-bold bg-light font-monospace tk-col-gesamt" data-col-id="gesamt" style="font-size: 13px; color: #0f3a5d;">
            ${fmtChf(r.Gesamt)}
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. Footer & KPIs berechnen
  jbCalculateMatrixTotals(rowsData, columns);

  // 6. Spaltenauswahl, Resizing & Drag & Drop Verschieben initialisieren
  if (window.TableKit && typeof window.TableKit.makeColumnReorderable === 'function') {
    window._jbMatrixColReorder = window.TableKit.makeColumnReorderable('#jbMatrixTable', {
      storageKey: 'jb_matrix_col_order',
      lockedColumns: ['check', 'name', 'status', 'gesamt']
    });
    if (window._jbMatrixColReorder && typeof window._jbMatrixColReorder.apply === 'function') {
      window._jbMatrixColReorder.apply();
    }
  }
  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function' && document.getElementById('jbMatrixColToggleDropdown')) {
    window._jbMatrixColToggle = window.TableKit.setupColumnToggle('#jbMatrixTable', {
      container: '#jbMatrixColToggleDropdown',
      storageKey: 'portal_jb_matrix_cols'
    });
  }
  if (window.TableKit && typeof window.TableKit.makeResizable === 'function') {
    window.TableKit.makeResizable('#jbMatrixTable', {
      storageKey: 'jb_matrix_col_widths',
      minWidth: 40,
      columns: {
        'name': { defaultWidth: 150, minWidth: 100 },
        'status': { defaultWidth: 80, minWidth: 65 }
      },
      onResize: function() {
        jbMatrixSyncStickyOffsets();
        jbMatrixSyncTopScroll();
      }
    });
  }

  // Sticky-Offsets, Top-Scroll & Mausrad initial synchronisieren
  jbMatrixSyncStickyOffsets();
  jbMatrixSyncTopScroll();
  jbMatrixSetupWheelScroll();
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
      const effStatus = typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(r) : (r.status || 'offen');
      let matchStatus = true;
      if (statusFilter === 'offen') {
        matchStatus = effStatus !== 'bezahlt' && effStatus !== 'befreit';
      } else if (statusFilter) {
        matchStatus = effStatus === statusFilter;
      }
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
    const effStatus = typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(r) : (r.status || 'offen');
    grandTotal += Number(r.Gesamt || 0);
    if (effStatus === 'bezahlt') {
      bezahltTotal += Number(r.Gesamt || 0);
      bezahltCount++;
    } else if (effStatus !== 'befreit') {
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
      <td class="text-center tk-col-status tk-col-sticky-status" data-col-id="status">–</td>
    `;

    columns.forEach(col => {
      const sumVal = colTotals[col.key] || 0;
      const displayVal = Math.abs(sumVal) > 0.001 
        ? fmtChf(sumVal).replace('CHF', '').trim() 
        : '–';
      const colorStyle = sumVal < 0 ? 'text-success' : 'text-dark';
      ftHtml += `<td class="text-end font-monospace tk-col-${col.key} ${colorStyle}" data-col-id="${col.key}" style="font-size: 12px; font-weight: 700;">${displayVal}</td>`;
    });

    ftHtml += `
      <td class="text-end pe-3 text-primary fw-extrabold font-monospace tk-col-gesamt" data-col-id="gesamt" style="font-size: 14px;">
        ${fmtChf(grandTotal)}
      </td>
    `;

    tfootRow.innerHTML = ftHtml;
  }

  // Sichtbarkeit der Spalten auf neu gerenderten Footer anwenden
  if (window._jbMatrixColToggle && typeof window._jbMatrixColToggle.apply === 'function') {
    window._jbMatrixColToggle.apply();
  }

  // Sticky-Offsets und Scroll-Breite nach Footer-Render nachführen
  jbMatrixSyncStickyOffsets();
  jbMatrixSyncTopScroll();

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
    const effStatus = typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(r) : (r.status || 'offen');
    if (status === 'offen' && (effStatus !== 'bezahlt' && effStatus !== 'befreit')) {
      _jbMatrixSelected.add(String(r.PersonNumber).trim());
    } else if (status === 'bezahlt' && effStatus === 'bezahlt') {
      _jbMatrixSelected.add(String(r.PersonNumber).trim());
    } else if (effStatus === status) {
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
    const effStatus = typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(r) : (r.status || 'offen');
    let matchStatus = true;
    if (statusFilter === 'offen') {
      matchStatus = effStatus !== 'bezahlt' && effStatus !== 'befreit';
    } else if (statusFilter) {
      matchStatus = effStatus === statusFilter;
    }
    return matchSearch && matchStatus;
  });

  if (rowsData.length === 0) {
    alert("Keine Daten für den Excel-Export vorhanden.");
    return;
  }

  // Ermittle ausgeblendete Spalten gemäss aktuellem TableKit Status
  const hiddenColIds = new Set();
  const hiddenThs = document.querySelectorAll('#jbMatrixHeaderRow th.tk-col-hidden[data-col-id]');
  hiddenThs.forEach(th => {
    if (th.dataset.colId) hiddenColIds.add(th.dataset.colId);
  });

  const exportColumns = columns.filter(col => !hiddenColIds.has(col.key));
  const isStatusVisible = !hiddenColIds.has('status');
  const isGesamtVisible = !hiddenColIds.has('gesamt');

  // 1. Kopfzeilen aufbauen
  const headerRow1 = [
    'Ausgewählt',
    'Personennummer',
    'Name',
    'Vorname',
    'Kategorie'
  ];
  if (isStatusVisible) headerRow1.push('Status');
  headerRow1.push('Bezahlt am', 'Zahlungsmethode', 'Beleg / Ref');

  exportColumns.forEach(col => {
    headerRow1.push(`${col.label} (${col.key})`);
  });
  if (isGesamtVisible) headerRow1.push('Total CHF');

  // 2. Datenzeilen aufbauen
  const dataRows = [];
  const colTotals = {};
  exportColumns.forEach(c => { colTotals[c.key] = 0; });
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
      m._kategorie || r._kategorie || 'Aktiv'
    ];
    if (isStatusVisible) {
      row.push((typeof jbGetEffectiveStatus === 'function' ? jbGetEffectiveStatus(r) : (r.status || 'offen')).toUpperCase());
    }
    row.push(
      r.payment_date || '',
      r.payment_method || '',
      r.document_ref || ''
    );

    exportColumns.forEach(col => {
      const val = feeMap[col.key] || 0;
      row.push(val);
      if (isSelected) {
        colTotals[col.key] = (colTotals[col.key] || 0) + val;
      }
    });

    if (isGesamtVisible) {
      const rowTotal = Number(r.Gesamt || 0);
      row.push(rowTotal);
      if (isSelected) {
        grandTotal += rowTotal;
      }
    }

    dataRows.push(row);
  });

  // 3. Summenzeile aufbauen
  const sumRow = [
    'SUMME',
    `${_jbMatrixSelected.size} Schützen ausgewählt`,
    '', '', ''
  ];
  if (isStatusVisible) sumRow.push('');
  sumRow.push('', '', '');

  exportColumns.forEach(col => {
    sumRow.push(colTotals[col.key] || 0);
  });
  if (isGesamtVisible) sumRow.push(grandTotal);

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

// ============================================================
// STICKY OFFSETS, SYNCED SCROLLBAR & WHEEL HANDLER
// ============================================================
function jbMatrixSyncStickyOffsets() {
  const checkTh = document.querySelector('#jbMatrixTable th.tk-col-sticky-left');
  const nameTh = document.querySelector('#jbMatrixTable th.tk-col-sticky-name');
  if (!nameTh) return;
  const leftPos = (checkTh ? checkTh.offsetWidth : 42) + nameTh.offsetWidth;
  document.querySelectorAll('#jbMatrixTable .tk-col-sticky-status').forEach(el => {
    el.style.left = leftPos + 'px';
  });
}

function jbMatrixSyncTopScroll() {
  const table = document.getElementById('jbMatrixTable');
  const container = document.getElementById('jbMatrixContainer');
  const topScroll = document.getElementById('jbMatrixTopScroll');
  const topTrack = document.getElementById('jbMatrixTopScrollTrack');
  if (!table || !container || !topScroll || !topTrack) return;

  topTrack.style.width = table.scrollWidth + 'px';
  topScroll.scrollLeft = container.scrollLeft;

  if (!topScroll._syncBound) {
    topScroll._syncBound = true;
    topScroll.addEventListener('scroll', () => {
      if (topScroll._preventSync) return;
      container._preventSync = true;
      container.scrollLeft = topScroll.scrollLeft;
      container._preventSync = false;
    });
    container.addEventListener('scroll', () => {
      if (container._preventSync) return;
      topScroll._preventSync = true;
      topScroll.scrollLeft = container.scrollLeft;
      topScroll._preventSync = false;
    });
  }
}

function jbMatrixSetupWheelScroll() {
  const container = document.getElementById('jbMatrixContainer');
  if (!container || container._wheelBound) return;
  container._wheelBound = true;
  container.addEventListener('wheel', (e) => {
    if (e.shiftKey) {
      e.preventDefault();
      container.scrollLeft += (e.deltaY || e.deltaX);
    }
  }, { passive: false });
}

function jbMatrixResetColumns() {
  localStorage.removeItem('jb_matrix_col_order');
  localStorage.removeItem('jb_matrix_col_widths');
  localStorage.removeItem('portal_jb_matrix_cols');
  if (typeof jbToast === 'function') {
    jbToast('Standard-Spaltenordnung und -breiten wiederhergestellt.', 'info');
  }
  jbRenderMatrixTable();
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
window.jbMatrixResetColumns = jbMatrixResetColumns;
window.jbMatrixSyncStickyOffsets = jbMatrixSyncStickyOffsets;
window.jbMatrixSyncTopScroll = jbMatrixSyncTopScroll;
window.jbMatrixSetupWheelScroll = jbMatrixSetupWheelScroll;
