// =====================================================================
// MODUL: BUCHHALTUNG & KMU-FINANZBERICHTE - UI
// =====================================================================

// Globaler Hook für Navigation (wird aus main.js aufgerufen)
window.renderBuchhaltung = function() {
  const container = document.getElementById('buchhaltung-container');
  if (!container) return;
  
  // Grundgerüst zeichnen
  container.innerHTML = `
    <!-- KPI Header -->
    <div class="row g-3 mb-4" id="bh-kpi-container">
      <div class="col-md-4">
        <div class="bh-metric-card info shadow-sm">
          <div class="small text-muted fw-semibold">Bilanzsumme (Aktiven)</div>
          <h2 class="fw-bold mt-1 mb-0 text-dark" id="bh-kpi-aktiven">CHF 0.00</h2>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card shadow-sm">
          <div class="small text-muted fw-semibold">Verbindlichkeiten & Eigenkapital</div>
          <h2 class="fw-bold mt-1 mb-0 text-dark" id="bh-kpi-passiven">CHF 0.00</h2>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card success shadow-sm" id="bh-kpi-profit-card">
          <div class="small text-muted fw-semibold" id="bh-kpi-profit-label">Netto-Gewinn (2026)</div>
          <h2 class="fw-bold mt-1 mb-0 text-success" id="bh-kpi-profit">CHF 0.00</h2>
        </div>
      </div>
    </div>
    
    <!-- Tab Navigation -->
    <div class="d-flex border-bottom mb-4 align-items-center justify-content-between flex-wrap" style="gap: 10px;">
      <div class="d-flex" style="gap: 5px;">
        <button class="bh-tab-btn ${window._bhActiveTab === 'berichte' ? 'active' : ''}" onclick="bhSwitchTab('berichte')">
          <i class="fas fa-file-invoice-dollar me-1.5"></i> KMU-Finanzberichte
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'journal' ? 'active' : ''}" onclick="bhSwitchTab('journal')">
          <i class="fas fa-list-ul me-1.5"></i> Kassabuch-Journal
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'konten' ? 'active' : ''}" onclick="bhSwitchTab('konten')">
          <i class="fas fa-university me-1.5"></i> Kontenrahmen & Budget
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'analyse' ? 'active' : ''}" onclick="bhSwitchTab('analyse')">
          <i class="fas fa-chart-pie me-1.5"></i> Budget & Jahresvergleich
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'cockpit' ? 'active' : ''}" onclick="bhSwitchTab('cockpit')">
          <i class="fas fa-store me-1.5"></i> Betriebs-Cockpit
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'gvexport' ? 'active' : ''}" onclick="bhSwitchTab('gvexport')">
          <i class="fas fa-print me-1.5"></i> GV-Export
        </button>
      </div>
      <div class="d-flex align-items-center mb-2 mb-md-0" style="gap: 10px;">
        <select class="form-select form-select-sm" id="bh-year-select" onchange="bhChangeYear(this.value)" style="width: auto;">
          <option value="2026" ${window._bhYear === 2026 ? 'selected' : ''}>Jahr: 2026</option>
          <option value="2025" ${window._bhYear === 2025 ? 'selected' : ''}>Jahr: 2025</option>
        </select>
        <button class="btn btn-sm btn-primary fw-bold shadow-sm" onclick="bhOpenEntryModal(null)">
          <i class="fas fa-plus me-1"></i> Buchung erfassen
        </button>
      </div>
    </div>
    
    <!-- Content Container -->
    <div id="bh-tab-content-container">
      <!-- Tabs werden hier dynamisch gerendert -->
    </div>
  `;
  
  loadBuchhaltungData(false);
};

// Schaltet Tabs um
window.bhSwitchTab = function(tabName) {
  window._bhActiveTab = tabName;
  
  document.querySelectorAll('.bh-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(`'${tabName}'`)) {
      btn.classList.add('active');
    }
  });
  
  renderActiveAccountingTab();
};

// Ändert das aktive Buchhaltungsjahr
window.bhChangeYear = function(year) {
  window._bhYear = Number(year);
  
  recalculateLiveAccountBalances();
  updateAccountingKPIs();
  renderActiveAccountingTab();
};

// Rendert den Inhalt des aktiven Tabs
window.renderActiveAccountingTab = function() {
  const content = document.getElementById('bh-tab-content-container');
  if (!content) return;
  
  if (window._bhActiveTab === 'berichte') {
    renderTabBerichte(content);
  } else if (window._bhActiveTab === 'journal') {
    renderTabJournal(content);
  } else if (window._bhActiveTab === 'konten') {
    renderTabKontenrahmen(content);
  } else if (window._bhActiveTab === 'analyse') {
    if (typeof renderTabAnalyse === 'function') {
      renderTabAnalyse(content);
    } else {
      content.innerHTML = `<div class="alert alert-info py-4 text-center"><i class="fas fa-spinner fa-spin me-2"></i> Lade Controlling-Diagramme...</div>`;
    }
  } else if (window._bhActiveTab === 'cockpit') {
    if (typeof renderTabCockpit === 'function') {
      renderTabCockpit(content);
    } else {
      content.innerHTML = `<div class="alert alert-info py-4 text-center"><i class="fas fa-spinner fa-spin me-2"></i> Lade Betriebs-Cockpit...</div>`;
    }
  } else if (window._bhActiveTab === 'gvexport') {
    if (typeof renderTabGVExport === 'function') {
      renderTabGVExport(content);
    } else {
      content.innerHTML = `<div class="alert alert-info py-4 text-center"><i class="fas fa-spinner fa-spin me-2"></i> Lade GV-Export...</div>`;
    }
  }
};

// Sortier-Mechanismus für Kassabuch-Journal
window.bhSortJournal = function(col) {
  if (window._bhJournalSortCol === col) {
    window._bhJournalSortAsc = !window._bhJournalSortAsc;
  } else {
    window._bhJournalSortCol = col;
    window._bhJournalSortAsc = true;
  }
  renderActiveAccountingTab();
};

// Sortier-Mechanismus für Kontenrahmen
window.bhSortKonten = function(col) {
  if (window._bhKontenSortCol === col) {
    window._bhKontenSortAsc = !window._bhKontenSortAsc;
  } else {
    window._bhKontenSortCol = col;
    window._bhKontenSortAsc = true;
  }
  renderActiveAccountingTab();
};

// Rendert Untergruppen-Zeilen und berechnet deren Subsumme
window.renderSubgroupRows = function(accounts, subgroupTitle) {
  if (accounts.length === 0) return '';
  const sum = accounts.reduce((s, acc) => s + Number(acc._endsaldo || 0), 0);
  
  let html = `
    <tr class="table-light">
      <td colspan="3" class="ps-3 fw-bold text-muted small" style="background-color: rgba(15,58,93,0.02);">${subgroupTitle}</td>
    </tr>
  `;
  
  accounts.forEach(acc => {
    let proMemoriaHTML = '';
    if (String(acc.konto).trim() === '1510' && window._bhProMemoriaGewehreCount > 0) {
      const pmVal = window._bhProMemoriaGewehreCount * 0.5;
      proMemoriaHTML = `
        <div class="small text-muted mt-1 ps-2 border-start border-primary" style="font-size: 11px; font-style: italic;">
          <i class="fas fa-crosshairs me-1 text-primary"></i> 
          Pro Memoria (Inventar): ${window._bhProMemoriaGewehreCount} Gewehre (à CHF 0.50 = ${fmtChf(pmVal)})
        </div>
      `;
    }
    
    html += `
      <tr class="bh-detail-row bh-account-row">
        <td class="ps-4 font-monospace" style="width: 80px;">
          <a href="#" onclick="bhOpenKontoauszugModal('${acc.konto}'); return false;" class="text-primary fw-bold text-decoration-none" title="Kontoauszug anzeigen">${acc.konto}</a>
        </td>
        <td class="ps-3">
          ${acc.bezeichnung}
          ${proMemoriaHTML}
        </td>
        <td class="text-end fw-semibold text-dark">${fmtChf(acc._endsaldo)}</td>
      </tr>
    `;
  });
  
  html += `
    <tr class="bh-subtotal-row">
      <td colspan="2" class="ps-3 text-muted italic">Subtotal ${subgroupTitle}</td>
      <td class="text-end fw-bold text-dark">${fmtChf(sum)}</td>
    </tr>
  `;
  
  return html;
};

// RENDERING: TAB 1 – KMU-FINANZBERICHTE (BILANZ & ERFOLGSRECHNUNG)
window.renderTabBerichte = function(container) {
  const tree = {};
  window._bhKontenrahmen.forEach(acc => {
    const cat = bhGetAccountCategory(acc);
    if (!tree[cat.main]) tree[cat.main] = {};
    if (!tree[cat.main][cat.sub]) tree[cat.main][cat.sub] = {};
    if (!tree[cat.main][cat.sub][cat.detail]) tree[cat.main][cat.sub][cat.detail] = [];
    tree[cat.main][cat.sub][cat.detail].push(acc);
  });
  
  function getClassTotal(mainClass) {
    if (!tree[mainClass]) return 0;
    let total = 0;
    Object.keys(tree[mainClass]).forEach(sub => {
      Object.keys(tree[mainClass][sub]).forEach(detail => {
        tree[mainClass][sub][detail].forEach(acc => {
          total += Number(acc._endsaldo || 0);
        });
      });
    });
    return total;
  }
  
  const totalAktiven = getClassTotal('Aktiven');
  
  const sumFremd = (tree['Passiven'] && tree['Passiven']['Kurzfristiges Fremdkapital'] ? 
    Object.keys(tree['Passiven']['Kurzfristiges Fremdkapital']).reduce((s, d) => s + tree['Passiven']['Kurzfristiges Fremdkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0) +
    (tree['Passiven'] && tree['Passiven']['Langfristiges Fremdkapital'] ? 
    Object.keys(tree['Passiven']['Langfristiges Fremdkapital']).reduce((s, d) => s + tree['Passiven']['Langfristiges Fremdkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0);
    
  const sumEkOhneErgebnis = tree['Passiven'] && tree['Passiven']['Eigenkapital'] ? 
    Object.keys(tree['Passiven']['Eigenkapital']).reduce((s, d) => s + tree['Passiven']['Eigenkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0;
    
  const sumErtrag = getClassTotal('Ertrag');
  const sumAufwand = getClassTotal('Aufwand');
  const gewinnVerlust = sumErtrag - sumAufwand;
  const totalPassiven = sumFremd + sumEkOhneErgebnis + gewinnVerlust;

  function renderClassHTML(mainClass) {
    let html = '';
    if (!tree[mainClass]) return html;
    
    const subs = Object.keys(tree[mainClass]).sort((a,b) => {
      if (a.includes('Umlauf')) return -1;
      if (b.includes('Umlauf')) return 1;
      if (a.includes('Kurzfristig')) return -1;
      if (b.includes('Kurzfristig')) return 1;
      if (a.includes('Langfristig')) return -1;
      if (b.includes('Langfristig')) return 1;
      return 0;
    });
    
    subs.forEach(sub => {
      html += `<tr class="bh-sub-header"><td colspan="3"><i class="fas fa-folder-open me-2 text-primary"></i>${sub}</td></tr>`;
      
      const details = Object.keys(tree[mainClass][sub]).sort();
      let subSum = 0;
      
      details.forEach(detail => {
        const accounts = tree[mainClass][sub][detail];
        accounts.sort((a, b) => parseInt(a.konto) - parseInt(b.konto));
        
        const detailSum = accounts.reduce((sum, acc) => sum + Number(acc._endsaldo || 0), 0);
        subSum += detailSum;
        
        html += renderSubgroupRows(accounts, detail);
      });
      
      if (mainClass === 'Passiven' && sub === 'Eigenkapital') {
        const proMemoriaJahresgewinn = `
          <tr class="bh-detail-row bh-account-row italic">
            <td class="ps-4 text-muted font-monospace" style="width: 80px;">2990</td>
            <td class="ps-3 fw-bold ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">
              <i class="fas ${gewinnVerlust >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} me-1.5"></i>
              Jahresergebnis (Erfolgsrechnung)
            </td>
            <td class="text-end fw-bold ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">${fmtChf(gewinnVerlust)}</td>
          </tr>
          <tr class="bh-subtotal-row">
            <td colspan="2" class="ps-3 text-muted italic">Ergebnis-Übertrag</td>
            <td class="text-end fw-bold ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">${fmtChf(gewinnVerlust)}</td>
          </tr>
        `;
        html += proMemoriaJahresgewinn;
        subSum += gewinnVerlust;
      }
      
      html += `
        <tr class="bh-subtotal-row bg-light" style="border-top: 1.5px solid #6c757d;">
          <td colspan="2" class="fw-bold ps-2 text-primary">Total ${sub}</td>
          <td class="text-end fw-bold text-primary">${fmtChf(subSum)}</td>
        </tr>
      `;
    });
    
    return html;
  }

  function renderErfolgsrechnungHTML(mainClass) {
    let html = '';
    if (!tree[mainClass]) return html;
    
    const subs = Object.keys(tree[mainClass]).sort();
    subs.forEach(sub => {
      const details = Object.keys(tree[mainClass][sub]).sort();
      details.forEach(detail => {
        const accounts = tree[mainClass][sub][detail];
        accounts.sort((a, b) => parseInt(a.konto) - parseInt(b.konto));
        html += renderSubgroupRows(accounts, detail);
      });
    });
    
    return html;
  }
  
  const aktivenHTML = renderClassHTML('Aktiven');
  const passivenHTML = renderClassHTML('Passiven');
  const ertraegeHTML = renderErfolgsrechnungHTML('Ertrag');
  const aufwaendeHTML = renderErfolgsrechnungHTML('Aufwand');
  
  container.innerHTML = `
    <div class="row g-4">
      
      <!-- 1. LIVE-BILANZ (Side-by-Side) -->
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap" style="gap:10px;">
            <h4 class="fw-bold text-primary mb-0"><i class="fas fa-balance-scale me-2"></i>Live-Bilanz (${window._bhYear})</h4>
            <span class="badge bg-primary px-3 py-1.5 fs-7 rounded-pill">Doppelte Buchhaltung</span>
          </div>
          
          <div class="row g-4">
            <!-- Aktiven links -->
            <div class="col-lg-6 border-end">
              <h5 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-arrow-circle-down text-primary me-2"></i>Aktiven (Vermögenswerte)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${aktivenHTML}
                    <tr class="bh-main-total-row">
                      <td colspan="2">TOTAL AKTIVEN</td>
                      <td class="text-end">${fmtChf(totalAktiven)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Passiven rechts -->
            <div class="col-lg-6">
              <h5 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-arrow-circle-up text-success me-2"></i>Passiven (Kapital & Schulden)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${passivenHTML}
                    <tr class="bh-main-total-row">
                      <td colspan="2">TOTAL PASSIVEN</td>
                      <td class="text-end">${fmtChf(totalPassiven)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 2. STRUKTURIERTE ERFOLGSRECHNUNG -->
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap" style="gap:10px;">
            <h4 class="fw-bold text-primary mb-0"><i class="fas fa-chart-line me-2"></i>Erfolgsrechnung (${window._bhYear})</h4>
            <span class="badge ${gewinnVerlust >= 0 ? 'bg-success' : 'bg-danger'} px-3 py-1.5 fs-7 rounded-pill">
              ${gewinnVerlust >= 0 ? 'Reingewinn' : 'Reinverlust'}: ${fmtChf(Math.abs(gewinnVerlust))}
            </span>
          </div>
          
          <div class="row g-4">
            <!-- Ertrag links -->
            <div class="col-lg-6 border-end">
              <h5 class="fw-bold text-success border-bottom pb-2 mb-3"><i class="fas fa-arrow-trend-up me-2"></i>Ertrag (Einnahmen)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ertraegeHTML}
                    <tr class="bh-main-total-row text-success">
                      <td colspan="2">TOTAL ERTRAG</td>
                      <td class="text-end">${fmtChf(sumErtrag)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Aufwand rechts -->
            <div class="col-lg-6">
              <h5 class="fw-bold text-danger border-bottom pb-2 mb-3"><i class="fas fa-arrow-trend-down me-2"></i>Aufwand (Kosten)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${aufwaendeHTML}
                    <tr class="bh-main-total-row text-danger">
                      <td colspan="2">TOTAL AUFWAND</td>
                      <td class="text-end">${fmtChf(sumAufwand)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <!-- Erfolgs-Leiste unten -->
          <div class="mt-4 p-3 rounded-3 d-flex justify-content-between align-items-center flex-wrap shadow-sm border" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); gap: 15px;">
            <div>
              <span class="text-muted fw-semibold small">Erfolgsberechnung:</span>
              <h5 class="fw-bold mb-0 text-dark">
                ${fmtChf(sumErtrag)} (Ertrag) &minus; ${fmtChf(sumAufwand)} (Aufwand)
              </h5>
            </div>
            <div class="text-end">
              <span class="text-muted fw-semibold small">Jahresergebnis (${window._bhYear}):</span>
              <h4 class="fw-extrabold mb-0 ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">
                <i class="fas ${gewinnVerlust >= 0 ? 'fa-circle-check' : 'fa-circle-exclamation'} me-1.5"></i>
                ${gewinnVerlust >= 0 ? 'Reingewinn' : 'Reinverlust'}: ${fmtChf(Math.abs(gewinnVerlust))}
              </h4>
            </div>
          </div>
          
        </div>
      </div>
      
    </div>
  `;
};

// RENDERING: TAB 2 – KASSABUCH-JOURNAL
window.renderTabJournal = function(container) {
  const tableResp = container.querySelector('.table-responsive');
  const tableScrollTop = tableResp ? tableResp.scrollTop : 0;
  const windowScrollTop = window.scrollY || document.documentElement.scrollTop;

  let filteredJournal = window._bhJournal.filter(j => Number(j.jahr) === Number(window._bhYear));
  
  const col = window._bhJournalSortCol;
  const asc = window._bhJournalSortAsc;
  
  filteredJournal.sort((a, b) => {
    let valA = a[col];
    let valB = b[col];
    
    if (col === 'id' || col === 'betrag' || col === 'jahr') {
      valA = Number(valA || 0);
      valB = Number(valB || 0);
    } else {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
    }
    
    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });
  
  const journalRows = filteredJournal.map(item => `
    <tr class="bh-account-row">
      <td class="fw-semibold text-muted small">${item.id}</td>
      <td>${isoToDisplay(item.datum)}</td>
      <td class="fw-bold text-dark small">${item.beleg_nr}</td>
      <td class="small fw-semibold">${escapeHtml(item.beschreibung)}</td>
      <td>
        <span class="bh-konto-badge bh-konto-soll-badge">${item.konto_soll}</span> 
        <span class="text-muted ms-1 small">${getAccountNameByCode(item.konto_soll)}</span>
      </td>
      <td>
        <span class="bh-konto-badge bh-konto-haben-badge">${item.konto_haben}</span> 
        <span class="text-muted ms-1 small">${getAccountNameByCode(item.konto_haben)}</span>
      </td>
      <td class="text-end fw-bold text-primary">${fmtChf(item.betrag)}</td>
      <td>
        <span class="badge bg-light text-dark border small">${item.typ || 'Rechnung'}</span>
      </td>
      <td class="text-end" style="white-space: nowrap;">
        <button class="bh-edit-btn" onclick="bhOpenEntryModal(${item.id})" title="Buchung bearbeiten">
          <i class="fas fa-edit"></i>
        </button>
        <button class="bh-edit-btn text-danger ms-1" onclick="bhDeleteJournalEntry(${item.id})" title="Buchung löschen">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <div class="bh-report-section border border-light shadow-sm">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap: 10px;">
        <h4 class="fw-bold text-primary mb-0"><i class="fas fa-receipt me-2"></i>Kassabuch-Journal (${window._bhYear})</h4>
        <div class="d-flex align-items-center" style="gap: 10px;">
          <input type="text" class="form-control form-control-sm" id="bh-journal-search" placeholder="🔎 Beleg suchen..." oninput="bhFilterJournal(this.value)" style="max-width: 220px;">
          <span class="badge bg-secondary p-2 rounded-2">${filteredJournal.length} Buchungen</span>
        </div>
      </div>
      
      <div class="table-responsive" style="max-height: 520px;">
        <table class="table table-hover align-middle bh-table mb-0">
          <thead>
            <tr>
              <th class="bh-sort-header" onclick="bhSortJournal('id')">ID ${bhGetSortIndicator(col, 'id', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('datum')">Datum ${bhGetSortIndicator(col, 'datum', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('beleg_nr')">Beleg-Nr ${bhGetSortIndicator(col, 'beleg_nr', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('beschreibung')">Beschreibung ${bhGetSortIndicator(col, 'beschreibung', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('konto_soll')">Soll-Konto ${bhGetSortIndicator(col, 'konto_soll', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('konto_haben')">Haben-Konto ${bhGetSortIndicator(col, 'konto_haben', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortJournal('betrag')">Betrag ${bhGetSortIndicator(col, 'betrag', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('typ')">Typ ${bhGetSortIndicator(col, 'typ', asc)}</th>
              <th class="text-end" style="width: 80px;">Aktion</th>
            </tr>
          </thead>
          <tbody id="bh-journal-tbody">
            ${journalRows.length > 0 ? journalRows : '<tr><td colspan="9" class="text-center text-muted py-4">Keine Buchungssätze für dieses Jahr vorhanden.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const tableRespNew = container.querySelector('.table-responsive');
  if (tableRespNew && tableScrollTop) {
    tableRespNew.scrollTop = tableScrollTop;
  }
  window.scrollTo(0, windowScrollTop);
};

// Hilfsfunktion: Sucht den Kontonamen anhand der Nummer
window.getAccountNameByCode = function(code) {
  const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(code).trim());
  return acc ? acc.bezeichnung : 'Unbekannt';
};

// Live filter im Journal
window.bhFilterJournal = function(query) {
  const q = String(query).toLowerCase().trim();
  const rows = document.querySelectorAll('#bh-journal-tbody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    if (text.includes(q)) {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  });
};

// RENDERING: TAB 3 – KONTENRAHMEN & BUDGET
window.renderTabKontenrahmen = function(container) {
  let sortedKonten = [...window._bhKontenrahmen];
  const col = window._bhKontenSortCol;
  const asc = window._bhKontenSortAsc;
  
  sortedKonten.sort((a, b) => {
    let valA, valB;
    if (col === '_veraenderung' || col === '_endsaldo') {
      valA = Number(a[col] || 0);
      valB = Number(b[col] || 0);
    } else if (col === 'eroeffnungssaldo') {
      valA = Number(a._dynamicEroeffnungssaldo || 0);
      valB = Number(b._dynamicEroeffnungssaldo || 0);
    } else if (col === 'budget') {
      const budA = window._bhBudget.find(x => String(x.konto).trim() === String(a.konto).trim());
      const budB = window._bhBudget.find(x => String(x.konto).trim() === String(b.konto).trim());
      valA = Number(budA ? (budA['budget_' + window._bhYear] || 0) : 0);
      valB = Number(budB ? (budB['budget_' + window._bhYear] || 0) : 0);
    } else if (col === 'konto') {
      valA = Number(a.konto || 0);
      valB = Number(b.konto || 0);
    } else {
      valA = String(a[col] || '').toLowerCase();
      valB = String(b[col] || '').toLowerCase();
    }
    
    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });

  const tableRows = sortedKonten.map(acc => {
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    const budgetVal = bud ? Number(bud['budget_' + window._bhYear] || 0) : 0;
    
    let classLabel = 'Aktiven';
    let classColor = 'bg-primary';
    const cat = bhGetAccountCategory(acc);
    if (cat.main === 'Passiven') { classLabel = 'Passiven'; classColor = 'bg-secondary'; }
    if (cat.main === 'Ertrag') { classLabel = 'Ertrag'; classColor = 'bg-success'; }
    if (cat.main === 'Aufwand') { classLabel = 'Aufwand'; classColor = 'bg-danger'; }
    if (cat.main === 'Abschluss') { classLabel = 'Abschluss'; classColor = 'bg-dark'; }
    
    return `
      <tr class="bh-account-row">
        <td><a href="#" onclick="bhOpenKontoauszugModal('${acc.konto}'); return false;" class="bh-konto-badge text-primary text-decoration-none" title="Kontoauszug anzeigen">${acc.konto}</a></td>
        <td class="fw-bold text-dark">${acc.bezeichnung}</td>
        <td><span class="badge ${classColor} opacity-75">${classLabel}</span></td>
        <td class="text-end text-muted">${fmtChf(acc._dynamicEroeffnungssaldo)}</td>
        <td class="text-end ${acc._veraenderung >= 0 ? 'text-success' : 'text-danger'}">
          ${acc._veraenderung >= 0 ? '+' : ''}${fmtChf(acc._veraenderung)}
        </td>
        <td class="text-end fw-bold text-primary">${fmtChf(acc._endsaldo)}</td>
        <td class="text-end fw-semibold text-secondary">${budgetVal > 0 ? fmtChf(budgetVal) : '–'}</td>
        <td class="text-end" style="white-space: nowrap;">
          <button class="bh-edit-btn" onclick="bhOpenKontoModal('${acc.konto}')" title="Konto bearbeiten">
            <i class="fas fa-edit"></i>
          </button>
          <button class="bh-edit-btn text-danger ms-1" onclick="bhDeleteKonto('${acc.konto}')" title="Konto löschen">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <div class="bh-report-section border border-light shadow-sm">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap:10px;">
        <h4 class="fw-bold text-primary mb-0"><i class="fas fa-university me-2"></i>KMU-Kontenrahmen & Budget (${window._bhYear})</h4>
        <div class="d-flex align-items-center" style="gap: 10px;">
          <button class="btn btn-sm btn-outline-primary fw-bold shadow-sm" onclick="bhOpenKontoModal(null)">
            <i class="fas fa-plus-circle me-1"></i> Konto hinzufügen
          </button>
          <span class="badge bg-primary px-3 py-2 rounded-2">${window._bhKontenrahmen.length} Konten</span>
        </div>
      </div>
      
      <div class="table-responsive">
        <table class="table table-hover align-middle bh-table mb-0">
          <thead>
            <tr>
              <th class="bh-sort-header" onclick="bhSortKonten('konto')">Konto ${bhGetSortIndicator(col, 'konto', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortKonten('bezeichnung')">Bezeichnung ${bhGetSortIndicator(col, 'bezeichnung', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortKonten('klasse')">Klassifizierung ${bhGetSortIndicator(col, 'klasse', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('eroeffnungssaldo')">Eröffnungssaldo ${bhGetSortIndicator(col, 'eroeffnungssaldo', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('_veraenderung')">Veränderung ${bhGetSortIndicator(col, '_veraenderung', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('_endsaldo')">Endsaldo ${bhGetSortIndicator(col, '_endsaldo', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('budget')">Budget (${window._bhYear}) ${bhGetSortIndicator(col, 'budget', asc)}</th>
              <th class="text-end" style="width: 80px;">Aktion</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
};
