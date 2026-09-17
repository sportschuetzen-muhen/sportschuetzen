// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - UI
// =====================================================================

// Tabelle- und UI-Styling sicherstellen
window.rnEnsureCustomStyles = function() {
  if (document.getElementById('rn-invoices-custom-styles')) return;
  const style = document.createElement('style');
  style.id = 'rn-invoices-custom-styles';
  style.textContent = `
    #rn-table-scroll-wrap {
      min-height: 480px !important;
      padding-bottom: 120px !important;
    }
    #rn-invoices-table {
      font-size: 14.5px !important;
    }
    #rn-invoices-table th {
      font-size: 13px !important;
      font-weight: 700 !important;
      padding: 14px 14px !important;
      letter-spacing: 0.5px !important;
      text-transform: uppercase !important;
      color: #334155 !important;
      background-color: #f8fafc !important;
      border-bottom: 2px solid #e2e8f0 !important;
    }
    #rn-invoices-table td {
      padding: 13px 14px !important;
      vertical-align: middle !important;
      font-size: 14px !important;
    }
    .rn-id-badge {
      font-size: 13px !important;
      font-weight: 700 !important;
      padding: 6px 11px !important;
      border-radius: 6px !important;
      letter-spacing: 0.5px !important;
      font-family: monospace !important;
    }
    .rn-recipient-name {
      font-size: 15px !important;
      font-weight: 600 !important;
      color: #0f172a !important;
      line-height: 1.3 !important;
    }
    .rn-sub-label {
      font-size: 12px !important;
      color: #64748b !important;
      margin-top: 2px !important;
    }
    .rn-amount-cell {
      font-size: 15.5px !important;
      font-weight: 700 !important;
      color: #0f3a5d !important;
    }
    .rn-batch-item-row:hover {
      background-color: rgba(13, 110, 253, 0.04) !important;
    }
  `;
  document.head.appendChild(style);
};

// Dropdown-Auswahl für Standard-Positionen generieren
window.rnGetDropdownMenuHtml = function(actionFuncName) {
  if (typeof rnInitializeTemplates === 'function') {
    rnInitializeTemplates();
  }
  let templates = window._invoiceTemplates;
  if (!templates || templates.length === 0) {
    try {
      templates = JSON.parse(localStorage.getItem('portal_invoice_templates') || '[]');
      window._invoiceTemplates = templates;
    } catch (e) {}
  }
  
  if (!templates || templates.length === 0) {
    return '<li><span class="dropdown-item text-muted small py-2"><i class="fas fa-info-circle me-1"></i>Keine Standard-Vorlagen vorhanden</span></li>';
  }

  const grouped = {};
  templates.forEach(t => {
    const cat = t.category || 'Sonstige';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });
  
  let html = '';
  const cats = Object.keys(grouped).sort();
  cats.forEach((cat, idx) => {
    if (idx > 0) html += '<li><hr class="dropdown-divider my-1"></li>';
    
    let catIcon = 'fa-shopping-cart';
    let catColor = 'text-info';
    if (cat === 'Vermietung') { catIcon = 'fa-home'; catColor = 'text-primary'; }
    else if (cat === 'Konsumationen') { catIcon = 'fa-wine-glass'; catColor = 'text-success'; }
    else if (cat === 'Schulsport') { catIcon = 'fa-bullseye'; catColor = 'text-danger'; }
    
    html += `<li><h6 class="dropdown-header ${catColor} fw-bold py-1 mb-0" style="font-size:11.5px;"><i class="fas ${catIcon} me-1"></i> ${cat}</h6></li>`;
    grouped[cat].forEach(t => {
      const priceLabel = t.price ? ` (CHF ${Number(t.price).toFixed(2)})` : ' (Preis manuell)';
      const escapedDesc = String(t.desc).replace(/'/g, "\\'");
      const kontoVal = t.habenkonto || t.konto || '';
      const escapedKonto = String(kontoVal).replace(/'/g, "\\'");
      html += `<li><a class="dropdown-item d-flex justify-content-between align-items-center py-1.5 px-3" href="#" onclick="${actionFuncName}('${escapedDesc}', '${t.price || ''}', 1, '${escapedKonto}'); return false;"><span>${escapeHtml(t.desc)}${priceLabel}</span>${kontoVal ? `<span class="badge bg-light text-primary font-monospace ms-2 border" style="font-size:11px;">${escapeHtml(kontoVal)}</span>` : ''}</a></li>`;
    });
  });
  
  return html;
};

// Render-Einstiegspunkt
window.renderRechnungen = function() {
  const container = document.getElementById('rechnungen-container');
  if (!container) return;

  rnInitializeTemplates();

  container.innerHTML = `
    <!-- Tab Navigation -->
    <div class="d-flex border-bottom mb-4 align-items-center justify-content-between flex-wrap" style="gap: 10px;">
      <div class="d-flex" style="gap: 5px;">
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'archiv' ? 'active' : ''}" id="rn-tab-btn-archiv" onclick="rnSwitchTab('archiv')">
          <i class="fas fa-file-invoice me-1.5"></i> Rechnungs-Archiv
        </button>
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'kontakte' ? 'active' : ''}" id="rn-tab-btn-kontakte" onclick="rnSwitchTab('kontakte')">
          <i class="fas fa-address-book me-1.5"></i> Externe Kontakte
        </button>
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'offen' ? 'active' : ''}" id="rn-tab-btn-offen" onclick="rnSwitchTab('offen')">
          <i class="fas fa-list-ol me-1.5"></i> Offene Posten (Nebenrechnung)
        </button>
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'templates' ? 'active' : ''}" id="rn-tab-btn-templates" onclick="rnSwitchTab('templates')">
          <i class="fas fa-magic me-1.5"></i> Standard-Positionen verwalten
        </button>
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'layouts' ? 'active' : ''}" id="rn-tab-btn-layouts" onclick="rnSwitchTab('layouts')">
          <i class="fas fa-sliders-h me-1.5"></i> Layouts & Texte
        </button>
      </div>
    </div>
    
    <div id="rn-tab-content-container">
      <!-- Tabs werden hier dynamisch gerendert -->
    </div>
  `;

  renderActiveRechnungenTab();
};

window.rnSwitchTab = function(tabName) {
  window._rechnungenActiveTab = tabName;
  document.querySelectorAll('#rechnungen-container .bh-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`rn-tab-btn-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');
  
  renderActiveRechnungenTab();
};

window.renderActiveRechnungenTab = function() {
  const content = document.getElementById('rn-tab-content-container');
  if (!content) return;

  if (window._rechnungenActiveTab === 'archiv') {
    renderTabArchiv(content);
  } else if (window._rechnungenActiveTab === 'kontakte') {
    renderTabContacts(content);
  } else if (window._rechnungenActiveTab === 'templates') {
    renderTabTemplates(content);
  } else if (window._rechnungenActiveTab === 'offen') {
    renderTabOffenePosten(content);
  } else if (window._rechnungenActiveTab === 'layouts') {
    if (typeof renderTabLayouts === 'function') {
      renderTabLayouts(content);
    }
  }
};

window.renderTabArchiv = function(content) {
  // 1. Berechne KPIs
  const totalCount = window._invoices.length;
  const openInvoices = window._invoices.filter(i => {
    const st = String(i.status || '').toLowerCase();
    return st !== 'bezahlt';
  });
  const openCount = openInvoices.length;
  const openSum = openInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  
  const paidInvoices = window._invoices.filter(i => String(i.status || '').toLowerCase() === 'bezahlt');
  const paidCount = paidInvoices.length;
  const paidSum = paidInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  // Überfällige Rechnungen (>30 Tage und unbezahlt)
  const now = new Date();
  const dueInvoices = openInvoices.filter(item => {
    if (!item.created_at) return false;
    const datePart = String(item.created_at).split(' ')[0];
    let createdDate = null;
    if (datePart.includes('.')) {
      const p = datePart.split('.');
      if (p.length === 3) createdDate = new Date(`${p[2]}-${p[1]}-${p[0]}`);
    } else if (datePart.includes('-')) {
      createdDate = new Date(datePart);
    }
    if (!createdDate || isNaN(createdDate.getTime())) return false;
    const diffDays = Math.ceil(Math.abs(now - createdDate) / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  });
  const dueCount = dueInvoices.length;

  const dunningInvoices = openInvoices.filter(i => {
    const st = String(i.status || '').toLowerCase();
    const m = Number(i.mahnstufe || 0);
    return st === 'gemahnt' || m > 0 || st.includes('mahn') || st === '2' || st === '3';
  });
  const dunningCount = dunningInvoices.length;

  content.innerHTML = `
    <!-- KPI Header (Klickbar zum Schnellfiltern) -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="bh-metric-card danger shadow-sm rn-kpi-clickable ${window._invoicesFilterStatus === 'offen' || window._invoicesFilterStatus === 'faellig' ? 'rn-kpi-active' : ''}" 
             data-kpi-status="offen" onclick="rnToggleFilterKpi('offen')" title="Klicken, um offene Rechnungen zu filtern">
          <div class="d-flex justify-content-between align-items-center">
            <div class="small text-muted fw-semibold">Offener Gesamtbetrag</div>
            <span class="badge bg-danger-subtle text-danger border border-danger-subtle small px-2 py-0.5 rounded-pill">
              <i class="fas fa-filter me-1"></i>Filter
            </span>
          </div>
          <h2 class="fw-bold mt-1 mb-0 text-danger"><span class="currency-label">CHF</span> ${openSum.toFixed(2)}</h2>
          <div class="small text-muted mt-1">
            ${openCount} offene Rechnungen ${dueCount > 0 ? `<span class="badge bg-danger text-white ms-1" title="${dueCount} Rechnungen älter als 30 Tage"><i class="fas fa-clock me-0.5"></i>${dueCount} überfällig</span>` : ''}
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card success shadow-sm rn-kpi-clickable ${window._invoicesFilterStatus === 'bezahlt' ? 'rn-kpi-active' : ''}" 
             data-kpi-status="bezahlt" onclick="rnToggleFilterKpi('bezahlt')" title="Klicken, um bezahlte Rechnungen zu filtern">
          <div class="d-flex justify-content-between align-items-center">
            <div class="small text-muted fw-semibold">Eingenommen (Bezahlt)</div>
            <span class="badge bg-success-subtle text-success border border-success-subtle small px-2 py-0.5 rounded-pill">
              <i class="fas fa-filter me-1"></i>Filter
            </span>
          </div>
          <h2 class="fw-bold mt-1 mb-0 text-success"><span class="currency-label">CHF</span> ${paidSum.toFixed(2)}</h2>
          <div class="small text-muted mt-1">${paidCount} bezahlte Rechnungen</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card info shadow-sm rn-kpi-clickable ${window._invoicesFilterStatus === 'alle' ? 'rn-kpi-active' : ''}" 
             data-kpi-status="alle" onclick="rnToggleFilterKpi('alle')" title="Klicken, um alle Rechnungen anzuzeigen">
          <div class="d-flex justify-content-between align-items-center">
            <div class="small text-muted fw-semibold">Gesamte Fakturierung</div>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle small px-2 py-0.5 rounded-pill">
              <i class="fas fa-list me-1"></i>Alle
            </span>
          </div>
          <h2 class="fw-bold mt-1 mb-0 text-dark"><span class="currency-label">CHF</span> ${(openSum + paidSum).toFixed(2)}</h2>
          <div class="small text-muted mt-1">${totalCount} Rechnungen insgesamt</div>
        </div>
      </div>
    </div>

    <!-- Steuerung & Filter -->
    <div class="bh-report-section border border-light shadow-sm mb-4">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap:15px;">
        <h5 class="fw-bold text-primary mb-0"><i class="fas fa-filter me-2"></i>Filter & Rechnungs-Archiv</h5>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-outline-warning fw-bold shadow-sm write-protected" onclick="rnOpenBatchMahnungModal()" title="Alle fälligen offenen Rechnungen prüfen und per Klick gesammelt mahnen">
            <i class="fas fa-bullhorn me-1"></i> Fällige Mahnungen (${dueCount > 0 ? dueCount : 'Mahnlauf'})
          </button>
          <button class="btn btn-sm btn-primary fw-bold shadow-sm write-protected" onclick="rnOpenMassSendModal()" title="Mehrere Rechnungen gesammelt per E-Mail versenden">
            <i class="fas fa-paper-plane me-1"></i> Massenversand
          </button>
          <button class="btn btn-sm btn-success fw-bold shadow-sm write-protected" onclick="rnOpenCreateModal(this)">
            <i class="fas fa-plus-circle me-1"></i> Rechnung erstellen
          </button>
        </div>
      </div>

      <!-- Quick Filter Pills -->
      <div class="d-flex flex-wrap gap-1.5 mb-3" id="rn-filter-pills">
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'alle' ? 'btn-primary text-white active' : 'btn-outline-secondary'}" data-status="alle" onclick="rnChangeFilterStatus('alle')">
          Alle (${totalCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'offen' ? 'btn-danger text-white active' : 'btn-outline-danger'}" data-status="offen" onclick="rnChangeFilterStatus('offen')">
          <i class="fas fa-clock me-1"></i>Offen (${openCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'faellig' ? 'btn-warning text-dark active' : 'btn-outline-warning text-dark'}" data-status="faellig" onclick="rnChangeFilterStatus('faellig')">
          <i class="fas fa-exclamation-circle me-1 text-danger"></i>Überfällig >30d (${dueCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'gemahnt' ? 'btn-warning text-dark active' : 'btn-outline-warning text-dark'}" data-status="gemahnt" onclick="rnChangeFilterStatus('gemahnt')">
          <i class="fas fa-bullhorn me-1"></i>Gemahnt (${dunningCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'bezahlt' ? 'btn-success text-white active' : 'btn-outline-success'}" data-status="bezahlt" onclick="rnChangeFilterStatus('bezahlt')">
          <i class="fas fa-check-circle me-1"></i>Bezahlt (${paidCount})
        </button>
      </div>

      <div class="row g-3">
        <div class="col-md-5">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light text-muted"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control" id="rn-search" placeholder="Suchen nach Empfänger, ID, Nr. oder Beleg..." oninput="rnFilterInvoices()">
            <button class="btn btn-outline-secondary" type="button" onclick="const s=document.getElementById('rn-search'); if(s){s.value=''; rnFilterInvoices(); s.focus();}" title="Suche leeren">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="col-md-3">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light text-muted">Status</span>
            <select class="form-select" id="rn-filter-status" onchange="rnChangeFilterStatus(this.value)">
              <option value="alle" ${window._invoicesFilterStatus === 'alle' ? 'selected' : ''}>Alle Status</option>
              <option value="offen" ${window._invoicesFilterStatus === 'offen' ? 'selected' : ''}>Offen (alle unbezahlten)</option>
              <option value="faellig" ${window._invoicesFilterStatus === 'faellig' ? 'selected' : ''}>Überfällig (> 30 Tage)</option>
              <option value="gemahnt" ${window._invoicesFilterStatus === 'gemahnt' ? 'selected' : ''}>Gemahnt (Stufe 1–3)</option>
              <option value="bezahlt" ${window._invoicesFilterStatus === 'bezahlt' ? 'selected' : ''}>Bezahlt</option>
            </select>
          </div>
        </div>
        <div class="col-md-4">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light text-muted">Typ</span>
            <select class="form-select" id="rn-filter-type" onchange="rnChangeFilterType(this.value)">
              <option value="alle">Alle Typen</option>
              <option value="Jahresbeitrag">Jahresbeitrag</option>
              <option value="Vermietung">Vermietung</option>
              <option value="Materialverkauf">Materialverkauf</option>
              <option value="Depot / Pfand">Depot / Pfand</option>
              <option value="Schulsport">Schulsport</option>
              <option value="Sponsoring">Sponsoring / Gönner</option>
              <option value="Sonstige">Sonstige / Diverse</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabelle -->
    <div class="bh-report-section border border-light shadow-sm">
      <!-- Floating Selection Action Bar -->
      <div id="rn-table-selection-bar" class="d-none alert alert-primary d-flex justify-content-between align-items-center py-2 px-3 mb-3 shadow-sm rounded-3">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-primary fs-6 px-2.5 py-1" id="rn-selected-count">0</span>
          <span class="fw-semibold text-primary">Rechnungen ausgewählt</span>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-primary fw-bold shadow-sm" onclick="rnStartMassSendFromSelection()">
            <i class="fas fa-paper-plane me-1"></i> Massenversand für Auswahl starten
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="rnClearTableSelection()">
            Auswahl aufheben
          </button>
        </div>
      </div>

      <div class="table-responsive" id="rn-table-scroll-wrap" style="min-height: 480px; padding-bottom: 120px;">
        <table class="table table-hover align-middle bh-table rn-invoices-table mb-0" id="rn-invoices-table">
          <thead>
            <tr>
              <th style="width: 44px;" class="text-center">
                <input type="checkbox" class="form-check-input" id="rn-table-select-all" title="Alle sichtbaren Rechnungen auswählen" onchange="rnToggleTableSelectAll(this.checked)">
              </th>
              <th class="bh-sort-header" onclick="rnSortInvoices('id')" style="width: 155px;">Rechnungs-ID ${rnGetSortIndicator('id')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('name')">Empfänger ${rnGetSortIndicator('name')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('created_at')" style="width: 140px;">Datum ${rnGetSortIndicator('created_at')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('year')" style="width: 90px;">Jahr ${rnGetSortIndicator('year')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('type')" style="width: 150px;">Typ ${rnGetSortIndicator('type')}</th>
              <th class="bh-sort-header text-center" onclick="rnSortInvoices('status')" style="width: 155px;">Status ${rnGetSortIndicator('status')}</th>
              <th class="bh-sort-header text-end" onclick="rnSortInvoices('total_amount')" style="width: 150px;">Betrag ${rnGetSortIndicator('total_amount')}</th>
              <th class="text-end" style="width: 160px;">Aktionen</th>
            </tr>
          </thead>
          <tbody id="rn-tbody">
            <!-- Dynamisch geladen -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  rnEnsureCustomStyles();
  rnRenderTable();
};

// Live Filter & Draw Table
window.rnRenderTable = function() {
  const tbody = document.getElementById('rn-tbody');
  if (!tbody) return;

  const query = document.getElementById('rn-search') ? document.getElementById('rn-search').value.toLowerCase().trim() : '';
  const now = new Date();

  // 1. Filtern
  let list = window._invoices.filter(i => {
    const matchesSearch = !query || 
      String(i.id).toLowerCase().includes(query) ||
      String(i.name).toLowerCase().includes(query) ||
      String(i.document_ref).toLowerCase().includes(query) ||
      String(i.PersonNumber).toLowerCase().includes(query);

    const st = String(i.status || '').toLowerCase();
    const isPaid = st === 'bezahlt';

    let mStufe = Number(i.mahnstufe || 0);
    if (!mStufe) {
      if (st === 'gemahnt') mStufe = 1;
      else if (st === '2' || st.includes('2. mahnung') || st.includes('stufe 2')) mStufe = 2;
      else if (st === '3' || st.includes('3. mahnung') || st.includes('stufe 3') || st.includes('letzte')) mStufe = 3;
      else if (st.includes('mahn') || st.includes('erinnerung')) mStufe = 1;
    }

    // Frist prüfen (für überfällig)
    let isOverdue = false;
    if (!isPaid && i.created_at) {
      const datePart = String(i.created_at).split(' ')[0];
      let createdDate = null;
      if (datePart.includes('.')) {
        const p = datePart.split('.');
        if (p.length === 3) createdDate = new Date(`${p[2]}-${p[1]}-${p[0]}`);
      } else if (datePart.includes('-')) {
        createdDate = new Date(datePart);
      }
      if (createdDate && !isNaN(createdDate.getTime())) {
        const diffDays = Math.ceil(Math.abs(now - createdDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 30) isOverdue = true;
      }
    }

    let matchesStatus = true;
    if (window._invoicesFilterStatus === 'offen') {
      matchesStatus = !isPaid;
    } else if (window._invoicesFilterStatus === 'faellig') {
      matchesStatus = !isPaid && isOverdue;
    } else if (window._invoicesFilterStatus === 'gemahnt') {
      matchesStatus = (st === 'gemahnt' || mStufe > 0 || st.includes('mahn') || st === '2' || st === '3');
    } else if (window._invoicesFilterStatus === 'bezahlt') {
      matchesStatus = isPaid;
    }

    const matchesType = window._invoicesFilterType === 'alle' || 
      String(i.type).toLowerCase().includes(window._invoicesFilterType.toLowerCase());

    return matchesSearch && matchesStatus && matchesType;
  });

  // 2. Sortieren
  const col = window._invoicesSearchCol;
  const asc = window._invoicesSearchAsc;
  list.sort((a, b) => {
    let valA = a[col];
    let valB = b[col];
    if (col === 'total_amount' || col === 'year') {
      valA = Number(valA || 0);
      valB = Number(valB || 0);
    } else if (col === 'created_at') {
      const parseD = (dStr) => {
        if (!dStr) return 0;
        const str = String(dStr).trim();
        if (str.includes('.')) {
          const parts = str.split(' ');
          const dateParts = parts[0].split('.');
          const timeParts = parts[1] ? parts[1].split(':') : [0, 0];
          return new Date(dateParts[2], (dateParts[1] || 1) - 1, dateParts[0] || 1, timeParts[0] || 0, timeParts[1] || 0).getTime();
        }
        const t = new Date(str).getTime();
        return isNaN(t) ? 0 : t;
      };
      valA = parseD(valA);
      valB = parseD(valB);
    } else {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
    }
    
    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });

  // 3. Tabellenzeilen generieren
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Keine passenden Rechnungen gefunden.</td></tr>`;
    if (typeof rnOnTableRowSelectChange === 'function') rnOnTableRowSelectChange();
    return;
  }

  tbody.innerHTML = list.map(item => {
    const st = String(item.status || '').toLowerCase();
    const isPaid = st === 'bezahlt';
    let mStufe = Number(item.mahnstufe || 0);
    if (!mStufe) {
      if (st === 'gemahnt') mStufe = 1;
      else if (st === '2' || st.includes('2. mahnung') || st.includes('stufe 2')) mStufe = 2;
      else if (st === '3' || st.includes('3. mahnung') || st.includes('stufe 3') || st.includes('letzte')) mStufe = 3;
      else if (st.includes('mahn') || st.includes('erinnerung')) mStufe = 1;
    }
    
    // Differenzierte Statusanzeige nach Schweizer 3-Stufen-Mahnwesen
    let statusBadge = '';
    if (isPaid) {
      statusBadge = '<span class="badge bg-success px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;"><i class="fas fa-check-circle me-1"></i>Bezahlt</span>';
    } else if (st === 'gemahnt' || mStufe > 0 || st.includes('mahn') || st === '2' || st === '3') {
      if (mStufe === 1) {
        statusBadge = '<span class="badge bg-warning text-dark px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;" title="1. Zahlungserinnerung versendet"><i class="fas fa-bell me-1"></i>Erinnerung (1/3)</span>';
      } else if (mStufe === 2) {
        statusBadge = '<span class="badge text-white px-2.5 py-1.5 rounded-pill" style="background-color: #fd7e14; font-size:12.5px;" title="2. Mahnung versendet"><i class="fas fa-exclamation-triangle me-1"></i>2. Mahnung (2/3)</span>';
      } else {
        statusBadge = '<span class="badge bg-danger text-white px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;" title="3. und letzte Mahnung vor Betreibung"><i class="fas fa-radiation me-1"></i>Letzte Mahnung (3/3)</span>';
      }
    } else {
      statusBadge = '<span class="badge bg-secondary px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;">Offen</span>';
    }

    // Frist prüfen (für überfällig)
    let extraBadge = '';
    if (!isPaid) {
      let createdDate = null;
      if (item.created_at) {
        const datePart = String(item.created_at).split(' ')[0];
        if (datePart.includes('.')) {
          const p = datePart.split('.');
          if (p.length === 3) createdDate = new Date(`${p[2]}-${p[1]}-${p[0]}`);
        } else if (datePart.includes('-')) {
          createdDate = new Date(datePart);
        }
      }
      if (createdDate && !isNaN(createdDate.getTime())) {
        const diffDays = Math.ceil(Math.abs(now - createdDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 30 && mStufe === 0) {
          extraBadge = `<span class="badge bg-danger ms-1" style="font-size:11px;" title="Überfällig seit ${diffDays - 30} Tagen"><i class="fas fa-clock me-0.5"></i>Fällig (${diffDays}d)</span>`;
        }
      }
    }

    let numberLabel = '';
    if (item.PersonNumber) {
      if (String(item.PersonNumber).startsWith('EXT')) {
        const cId = String(item.PersonNumber).replace('EXT-', '').replace('EXT:', '');
        numberLabel = `<div class="rn-sub-label text-muted"><i class="fas fa-address-card me-1 text-info"></i>Kontakt ID: ${escapeHtml(cId)}</div>`;
      } else {
        numberLabel = `<div class="rn-sub-label text-muted">Mitglieds-Nr: ${escapeHtml(item.PersonNumber)}</div>`;
      }
    }

    const mailSentBadge = item.mail_status === 'gesendet'
      ? `<span class="badge bg-success-subtle text-success border border-success-subtle ms-1" style="font-size:11px;" title="Rechnung wurde per E-Mail versendet"><i class="fas fa-check me-0.5"></i>Mail gesendet</span>`
      : '';

    const createdDisplay = typeof isoToDisplay === 'function'
      ? (isoToDisplay(item.created_at) || '–')
      : (item.created_at ? escapeHtml(String(item.created_at).split(' ')[0]) : '–');

    return `
      <tr class="bh-account-row" id="rn-row-${item.id}">
        <td class="text-center" onclick="event.stopPropagation()">
          <input type="checkbox" class="form-check-input rn-table-row-check" data-id="${item.id}" value="${item.id}" onchange="rnOnTableRowSelectChange()">
        </td>
        <td>
          <span class="bh-konto-badge bh-konto-soll-badge rn-id-badge" style="cursor: pointer;" onclick="rnOpenDetailsModal('${item.id}')" title="Klicken für Rechnungsdetails">
            ${item.id}
          </span>
        </td>
        <td>
          <div class="fw-bold text-dark mb-0 rn-recipient-name">
            ${escapeHtml(item.name)}
            ${mailSentBadge}
          </div>
          ${numberLabel}
        </td>
        <td class="text-muted font-monospace" style="font-size: 13.5px;">${createdDisplay}</td>
        <td class="text-muted font-monospace" style="font-size: 14px; font-weight: 500;">${item.year}</td>
        <td>
          <span class="badge bg-light text-dark border" style="font-size: 12.5px; padding: 5px 10px;">
            ${item.type}
            ${item.type === 'Jahresbeitrag' ? '<i class="fas fa-lock text-warning ms-1" title="Jahresbeitrag – synchronisiert über Schnellerfassung"></i>' : ''}
          </span>
        </td>
        <td class="text-center">
          ${statusBadge}
          ${extraBadge}
        </td>
        <td class="text-end fw-bold text-primary font-monospace rn-amount-cell">${fmtChf(item.total_amount)}</td>
        <td class="text-end" style="white-space: nowrap; width: 160px;">
          <div class="d-inline-flex align-items-center gap-1.5 justify-content-end">
            ${item.pdf_url ? `
              <a href="${item.pdf_url}" target="_blank" class="btn btn-sm btn-outline-danger shadow-xs fw-semibold px-2 py-1" title="PDF QR-Rechnung herunterladen / im Browser ansehen">
                <i class="fas fa-file-pdf me-1"></i>PDF
              </a>
            ` : `
              <button class="btn btn-sm btn-outline-secondary write-protected shadow-xs px-2 py-1" onclick="rnGeneratePDFOnly('${item.id}', '${escapeJs(item.name)}')" title="PDF QR-Rechnung generieren">
                <i class="fas fa-cog me-1"></i>PDF
              </button>
            `}

            <button class="btn btn-sm btn-outline-primary write-protected shadow-xs px-2 py-1" onclick="rnSendMailPrompt('${item.id}', '${escapeJs(item.name)}')" title="QR-Rechnung per E-Mail versenden">
              <i class="fas fa-paper-plane"></i>
            </button>

            <div class="dropdown d-inline-block">
              <button class="btn btn-sm btn-light border shadow-xs px-2 py-1" type="button" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false" title="Weitere Aktionen für ${item.id}">
                <i class="fas fa-ellipsis-v text-muted"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow border-0 py-1" style="font-size: 13px; min-width: 220px; z-index: 1055;">
                <li>
                  <a class="dropdown-item py-2" href="#" onclick="rnOpenDetailsModal('${item.id}'); return false;">
                    <i class="fas fa-eye text-primary me-2 fa-fw"></i>Details einsehen
                  </a>
                </li>
                ${!isPaid ? `
                  <li>
                    <a class="dropdown-item py-2 write-protected" href="#" onclick="rnOpenPaymentModal('${item.id}', ${item.total_amount}); return false;">
                      <i class="fas fa-coins text-success me-2 fa-fw"></i>Zahlung erfassen...
                    </a>
                  </li>
                  <li>
                    <a class="dropdown-item py-2 write-protected" href="#" onclick="rnOpenMahnungModal('${item.id}', '${escapeJs(item.name)}'); return false;">
                      <i class="fas fa-exclamation-triangle text-warning me-2 fa-fw"></i>Mahnung verwalten...
                    </a>
                  </li>
                ` : ''}
                <li><hr class="dropdown-divider my-1"></li>
                <li>
                  <a class="dropdown-item py-2 write-protected" href="#" onclick="rnGeneratePDFOnly('${item.id}', '${escapeJs(item.name)}'); return false;">
                    <i class="fas fa-sync text-secondary me-2 fa-fw"></i>PDF neu generieren
                  </a>
                </li>
                ${item.type === 'Jahresbeitrag' ? `
                  <li>
                    <a class="dropdown-item py-2" href="#" onclick="rnJumpToJahresbeitrag('${item.PersonNumber}'); return false;">
                      <i class="fas fa-lock text-warning me-2 fa-fw"></i>In Jahresbeitrag öffnen
                    </a>
                  </li>
                ` : `
                  ${!isPaid ? `
                    <li>
                      <a class="dropdown-item py-2 write-protected" href="#" onclick="rnOpenEditModal('${item.id}'); return false;">
                        <i class="fas fa-edit text-info me-2 fa-fw"></i>Rechnung bearbeiten
                      </a>
                    </li>
                    <li><hr class="dropdown-divider my-1"></li>
                    <li>
                      <a class="dropdown-item py-2 text-danger write-protected" href="#" onclick="rnDeleteInvoicePrompt('${item.id}'); return false;">
                        <i class="fas fa-trash-alt me-2 fa-fw"></i>Rechnung löschen
                      </a>
                    </li>
                  ` : ''}
                `}
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (typeof rnOnTableRowSelectChange === 'function') {
    rnOnTableRowSelectChange();
  }
};

// DETAILS MODAL
window.rnOpenDetailsModal = async function(invoiceId) {
  let modalEl = document.getElementById('rnModalInvoiceDetails');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalInvoiceDetails';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-receipt me-2"></i>Rechnungsdetails (ID: ${invoiceId})</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4" id="rn-details-modal-body">
          <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 text-muted">Lade Detailpositionen...</p>
          </div>
        </div>
        <div class="modal-footer bg-light py-2.5 px-4 border-top rounded-bottom-4 d-flex justify-content-between align-items-center" id="rn-details-modal-footer">
          <button type="button" class="btn btn-sm btn-secondary px-3" data-bs-dismiss="modal">Schliessen</button>
        </div>
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  try {
    const res = await apiFetch('rechnungen', { action: 'getInvoiceDetails', invoiceId });
    const data = await res.json();
    
    if (data.success) {
      const inv = data.invoice;
      const positions = data.positions || [];
      
      const posRows = positions.map(p => {
        const qty = Number(p.quantity || 1);
        const up = Number(p.unit_price || p.amount || 0);
        let qtyStr = '';
        if (qty > 1) {
          qtyStr = `<br><small class="text-muted font-monospace">${qty} Einheiten à ${fmtChf(up)}</small>`;
        }
        return `
        <tr>
          <td class="font-monospace text-muted" style="width: 50px;">#${p.position_nr}</td>
          <td class="fw-semibold">
            ${escapeHtml(p.description)}
            ${qtyStr}
          </td>
          <td class="text-muted text-center">${p.type}</td>
          <td class="text-end fw-bold text-dark font-monospace">${fmtChf(p.amount)}</td>
        </tr>
      `;
      }).join('');

      document.getElementById('rn-details-modal-body').innerHTML = `
        <div class="row g-3 mb-4 pb-3 border-bottom">
          <div class="col-6">
            <div class="small text-muted fw-semibold">Rechnungsempfänger:</div>
            <h5 class="fw-bold text-dark mt-1 mb-0">${escapeHtml(inv.name)}</h5>
            ${inv.PersonNumber ? `<span class="badge bg-secondary mt-1">Mitglieds-Nr: ${inv.PersonNumber}</span>` : ''}
          </div>
          <div class="col-6 text-end">
            <div class="small text-muted fw-semibold">Status:</div>
            <span class="badge ${inv.status === 'bezahlt' ? 'bg-success' : 'bg-warning text-dark'} px-2.5 py-1.5 rounded-pill mt-1 fw-bold">${inv.status}</span>
            <div class="text-muted small mt-1 font-monospace" style="font-size:11px;">Fakturierung: ${inv.created_at}</div>
          </div>
        </div>

        <div class="mb-4">
          <h6 class="fw-bold text-primary mb-3"><i class="fas fa-list me-1.5"></i>Rechnungspositionen</h6>
          <div class="table-responsive">
            <table class="table table-bordered table-striped table-hover align-middle mb-0" style="font-size: 13px;">
              <thead class="table-light">
                <tr>
                  <th>Pos</th>
                  <th>Beschreibung</th>
                  <th class="text-center" style="width: 80px;">Typ</th>
                  <th class="text-end" style="width: 150px;">Betrag</th>
                </tr>
              </thead>
              <tbody>
                ${posRows.length > 0 ? posRows : '<tr><td colspan="4" class="text-center text-muted">Keine Positionen erfasst.</td></tr>'}
                <tr class="table-light fw-bold" style="border-top: 2px solid #343a40;">
                  <td colspan="3" class="text-end">Gesamtsumme:</td>
                  <td class="text-end text-primary font-monospace" style="font-size:14px;">${fmtChf(inv.total_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        ${(inv.mahnstufe > 0 || inv.status === 'gemahnt' || inv.mahn_historie) ? `
          <div class="p-3 rounded-3 border mb-3 bg-light">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="small text-dark"><i class="fas fa-history me-1.5 text-warning"></i>Mahnstatus & Historie</strong>
              <span class="badge ${inv.mahnstufe == 1 ? 'bg-warning text-dark' : (inv.mahnstufe == 2 ? 'text-white' : 'bg-danger text-white')} rounded-pill" ${inv.mahnstufe == 2 ? 'style="background-color: #fd7e14;"' : ''}>
                ${inv.mahnstufe == 1 ? 'Stufe 1 (Zahlungserinnerung)' : (inv.mahnstufe == 2 ? 'Stufe 2 (2. Mahnung)' : (inv.mahnstufe == 3 ? 'Stufe 3 (Letzte Mahnung)' : 'Gemahnt'))}
              </span>
            </div>
            <div class="small text-muted mb-2">Letzte Mahnung: ${escapeHtml(inv.mahn_datum || '–')}</div>
            ${(() => {
              let hist = [];
              try {
                if (inv.mahn_historie) hist = typeof inv.mahn_historie === 'string' ? JSON.parse(inv.mahn_historie) : inv.mahn_historie;
              } catch (_) {}
              if (!Array.isArray(hist) || hist.length === 0) return '';
              return `
                <div class="table-responsive">
                  <table class="table table-sm table-bordered bg-white mb-0" style="font-size:11px;">
                    <thead class="table-light"><tr><th>Stufe</th><th>Datum</th><th>Versendet an</th></tr></thead>
                    <tbody>
                      ${hist.map(h => `<tr><td><strong>Stufe ${h.stufe}</strong></td><td class="font-monospace">${escapeHtml(h.datum)}</td><td>${escapeHtml(h.email || '–')}</td></tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            })()}
          </div>
        ` : ''}

        ${inv.status === 'bezahlt' ? `
          <div class="bg-success-subtle p-3 rounded-3 border border-success border-opacity-25 d-flex justify-content-between align-items-center">
            <div>
              <i class="fas fa-check-circle text-success me-2 fs-5"></i>
              <strong class="text-success-emphasis">Zahlungseingang verbucht</strong>
              <div class="small text-muted mt-0.5">Methode: ${inv.payment_method || 'Überweisung'}</div>
            </div>
            <div class="text-end text-success-emphasis font-monospace" style="font-size:12px;">
              Datum: ${isoToDisplay(inv.payment_date)}<br>
              Beleg: ${inv.document_ref || 'unbekannt'}
            </div>
          </div>
        ` : ''}
      `;

      // Modal Footer Aktionen aktualisieren
      const footerEl = document.getElementById('rn-details-modal-footer');
      if (footerEl) {
        footerEl.innerHTML = `
          <div class="d-flex flex-wrap gap-2 align-items-center">
            ${inv.pdf_url ? `
              <a href="${inv.pdf_url}" target="_blank" class="btn btn-sm btn-outline-danger fw-semibold">
                <i class="fas fa-file-pdf me-1.5"></i>PDF öffnen
              </a>
            ` : `
              <button class="btn btn-sm btn-outline-secondary write-protected" onclick="rnGeneratePDFOnly('${inv.id}', '${escapeJs(inv.name)}')">
                <i class="fas fa-cog me-1.5"></i>PDF erstellen
              </button>
            `}
            <button class="btn btn-sm btn-outline-primary write-protected" onclick="bootstrap.Modal.getInstance(document.getElementById('rnModalInvoiceDetails'))?.hide(); rnSendMailPrompt('${inv.id}', '${escapeJs(inv.name)}')">
              <i class="fas fa-envelope me-1.5"></i>E-Mail senden
            </button>
            ${inv.status !== 'bezahlt' ? `
              <button class="btn btn-sm btn-success write-protected" onclick="bootstrap.Modal.getInstance(document.getElementById('rnModalInvoiceDetails'))?.hide(); rnOpenPaymentModal('${inv.id}', ${inv.total_amount})">
                <i class="fas fa-coins me-1.5"></i>Zahlung erfassen
              </button>
            ` : ''}
            ${inv.type === 'Jahresbeitrag' ? `
              <button class="btn btn-sm btn-light border text-muted" onclick="bootstrap.Modal.getInstance(document.getElementById('rnModalInvoiceDetails'))?.hide(); rnJumpToJahresbeitrag('${inv.PersonNumber}')">
                <i class="fas fa-lock text-warning me-1.5"></i>In Jahresbeitrag
              </button>
            ` : ''}
          </div>
          <button type="button" class="btn btn-sm btn-secondary px-3" data-bs-dismiss="modal">Schliessen</button>
        `;
      }
    } else {
      throw new Error(data.error || "Unerwarteter Fehler.");
    }
  } catch (err) {
    document.getElementById('rn-details-modal-body').innerHTML = `
      <div class="alert alert-danger mb-0">
        <i class="fas fa-exclamation-triangle me-2"></i>
        Fehler beim Abrufen der Rechnungsdetails: ${err.message}
      </div>`;
  }
};

// =====================================================================
// TAB: OFFENE POSTEN (NEBENRECHNUNG PER MITGLIED)
// =====================================================================
window._rechnungenOffenePostenFilter = 'alle';
window._rechnungenOpViewMode = 'single'; // 'single' (jede Rechnung einzeln) oder 'grouped' (nach Empfänger)

window.rnFilterOffenePostenType = function(type) {
  window._rechnungenOffenePostenFilter = type;
  const content = document.getElementById('rn-tab-content-container');
  if (content) window.renderTabOffenePosten(content);
};

window.rnToggleOpViewMode = function(mode) {
  window._rechnungenOpViewMode = mode;
  const content = document.getElementById('rn-tab-content-container');
  if (content) window.renderTabOffenePosten(content);
};

window.renderTabOffenePosten = function(content) {
  if (!content) return;

  const currentFilter = window._rechnungenOffenePostenFilter || 'alle';
  const viewMode = window._rechnungenOpViewMode || 'single';

  const categoryLabels = {
    'alle': 'Alle Posten',
    'Jahresbeitrag': 'Jahresbeiträge (Mitglieder)',
    'Vermietung': 'Vermietung',
    'Materialverkauf': 'Materialverkauf',
    'Depot / Pfand': 'Depot / Pfand',
    'Schulsport': 'Schulsport',
    'Sponsoring': 'Sponsoring / Gönner',
    'Sonstige': 'Sonstige / Diverse'
  };

  const openInvoices = (window._invoices || []).filter(i => {
    const st = String(i.status || '').toLowerCase();
    const isUnpaid = st === 'offen' || st === 'teilweise' || st === 'gemahnt';
    if (!isUnpaid) return false;

    const t = String(i.type || '').toLowerCase();
    if (currentFilter === 'Jahresbeitrag') return t.includes('jahresbeitrag');
    if (currentFilter === 'Vermietung') return t.includes('vermietung');
    if (currentFilter === 'Materialverkauf') return t.includes('material');
    if (currentFilter === 'Depot / Pfand' || currentFilter === 'Depot') return t.includes('depot') || t.includes('pfand');
    if (currentFilter === 'Schulsport') return t.includes('schulsport');
    if (currentFilter === 'Sponsoring') return t.includes('sponsoring') || t.includes('gönner') || t.includes('goenner');
    if (currentFilter === 'Sonstige') return t.includes('sonstige') || t.includes('diverse');
    if (currentFilter === 'alle') return true;
    return true; // 'alle'
  });
  
  // Group open invoices by PersonNumber / Name
  const memberGroup = {};
  openInvoices.forEach(inv => {
    const key = inv.PersonNumber ? String(inv.PersonNumber).trim() : (inv.name || 'Unbekannt').trim();
    if (!memberGroup[key]) {
      memberGroup[key] = {
        key: key,
        personNumber: inv.PersonNumber || '–',
        name: inv.name || 'Unbekannt',
        invoices: [],
        totalOpen: 0
      };
    }
    memberGroup[key].invoices.push(inv);
    memberGroup[key].totalOpen += Number(inv.total_amount || 0);
  });

  const memberList = Object.values(memberGroup).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const totalOpenSum = openInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
  const totalOpenCount = openInvoices.length;

  let tableRowsHtml = '';
  if (openInvoices.length === 0) {
    tableRowsHtml = `
      <tr>
        <td colspan="${viewMode === 'single' ? 8 : 5}" class="text-center text-muted py-5">
          <i class="fas fa-check-circle fa-3x text-success mb-3" style="opacity:0.5;"></i>
          <h5>Keine offenen Posten in dieser Kategorie!</h5>
          <p class="small text-muted">Alle Rechnungen für den gewählten Filter wurden vollständig beglichen.</p>
        </td>
      </tr>
    `;
  } else if (viewMode === 'single') {
    // Einzelne Rechnungen anzeigen (jede Rechnung als eigene Zeile)
    tableRowsHtml = openInvoices.map((inv, idx) => {
      const st = String(inv.status || '').toLowerCase();
      const statusClass = st === 'gemahnt' ? 'bg-danger text-white' : 'bg-warning text-dark';
      
      let numberLabel = '';
      if (inv.PersonNumber) {
        if (String(inv.PersonNumber).startsWith('EXT')) {
          const cId = String(inv.PersonNumber).replace('EXT-', '').replace('EXT:', '');
          numberLabel = `<div class="text-muted" style="font-size:10px;"><i class="fas fa-address-card me-1 text-info"></i>Kontakt ID: ${escapeHtml(cId)}</div>`;
        } else {
          numberLabel = `<div class="text-muted" style="font-size:10px;">Mitglieds-Nr: ${escapeHtml(inv.PersonNumber)}</div>`;
        }
      }

      const mgl = (window._mglData || []).find(x => String(x.PersonNumber) === String(inv.PersonNumber));
      const nieMahnen = mgl && (mgl.Niemahnen === '1' || mgl.Niemahnen === true || mgl.Niemahnen === 1);
      const nieMahnenBadge = nieMahnen ? `<span class="badge bg-secondary ms-1" style="font-size:9px;"><i class="fas fa-ban me-1"></i>Nie mahnen</span>` : '';

      const createdDisplay = inv.created_at ? escapeHtml(String(inv.created_at).split(' ')[0]) : '–';

      return `
        <tr>
          <td class="text-center fw-bold text-muted small" style="width:40px;">${idx + 1}</td>
          <td>
            <span class="bh-konto-badge bh-konto-soll-badge">#${escapeHtml(inv.id)}</span>
          </td>
          <td>
            <div class="fw-bold text-primary mb-0">${escapeHtml(inv.name || 'Unbekannt')} ${nieMahnenBadge}</div>
            ${numberLabel}
          </td>
          <td class="text-muted small font-monospace">${createdDisplay}</td>
          <td>
            <span class="badge bg-light text-dark border">${escapeHtml(inv.type || 'Rechnung')}</span>
          </td>
          <td class="text-center">
            <span class="badge ${statusClass} px-2.5 py-1.5 rounded-pill small">${escapeHtml(inv.status || 'offen')}</span>
          </td>
          <td class="text-end fw-bold text-danger fs-6 font-monospace">
            CHF ${Number(inv.total_amount || 0).toFixed(2)}
          </td>
          <td class="text-center" style="width:110px;">
            <button class="btn btn-xs btn-outline-primary" onclick="rnOpenDetailsModal('${inv.id}')" title="Rechnungsdetails anzeigen">
              <i class="fas fa-eye me-1"></i>Details
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } else {
    // Nach Empfänger gruppierte Ansicht
    tableRowsHtml = memberList.map((m, idx) => {
      const invDetailsHtml = m.invoices.map(i => {
        return `<span class="badge bg-light text-dark border me-1 mb-1">
          #${escapeHtml(i.id)} (${escapeHtml(i.type || 'Rechnung')}) &middot; CHF ${Number(i.total_amount || 0).toFixed(2)}
        </span>`;
      }).join('');

      const mgl = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.personNumber));
      const nieMahnen = mgl && (mgl.Niemahnen === '1' || mgl.Niemahnen === true || mgl.Niemahnen === 1);
      const nieMahnenBadge = nieMahnen ? `<span class="badge bg-secondary ms-1" style="font-size:10px;"><i class="fas fa-ban me-1"></i>Nie mahnen</span>` : '';

      return `
        <tr>
          <td class="text-center fw-bold text-muted small" style="width:40px;">${idx + 1}</td>
          <td>
            <div class="fw-bold text-primary mb-0">${escapeHtml(m.name)} ${nieMahnenBadge}</div>
            <small class="text-muted">Mitglieds-Nr: ${escapeHtml(m.personNumber)}</small>
          </td>
          <td>
            <div class="small mb-1"><span class="badge bg-danger text-white me-1">${m.invoices.length} Rechnung(en)</span></div>
            <div>${invDetailsHtml}</div>
          </td>
          <td class="text-end fw-bold text-danger fs-6 font-monospace">
            CHF ${m.totalOpen.toFixed(2)}
          </td>
          <td class="text-center" style="width:110px;">
            <button class="btn btn-xs btn-outline-secondary" onclick="rnSwitchTab('archiv'); window._invoicesFilterStatus='offen'; renderActiveRechnungenTab();" title="Im Rechnungs-Archiv anzeigen">
              <i class="fas fa-search me-1"></i>Details
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  content.innerHTML = `
    <!-- Top Info & Print Header -->
    <div class="card border-0 shadow-sm p-4 bg-white rounded-4 mb-4">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
        <div>
          <h4 class="mb-1 text-primary fw-bold">
            <i class="fas fa-list-ol me-2"></i>Nebenrechnung: Offene Posten per Stichtag
          </h4>
          <p class="text-muted small mb-0">
            Übersicht aller ausstehenden Rechnungsbeträge für die Generalversammlung & Revision.
          </p>
        </div>
        <div class="d-flex gap-2 align-items-center flex-wrap">
          <div class="btn-group btn-group-sm me-1" role="group">
            <button type="button" class="btn ${viewMode === 'single' ? 'btn-primary active fw-bold' : 'btn-outline-secondary'}" onclick="rnToggleOpViewMode('single')" title="Jede offene Rechnung einzeln auflisten">
              <i class="fas fa-file-invoice me-1"></i>Einzel-Posten (${openInvoices.length})
            </button>
            <button type="button" class="btn ${viewMode === 'grouped' ? 'btn-primary active fw-bold' : 'btn-outline-secondary'}" onclick="rnToggleOpViewMode('grouped')" title="Nach Person/Empfänger zusammenfassen">
              <i class="fas fa-users me-1"></i>Nach Empfänger (${memberList.length})
            </button>
          </div>
          <button class="btn btn-sm btn-outline-primary" onclick="window.print()">
            <i class="fas fa-print me-1.5"></i>Liste Drucken / PDF
          </button>
        </div>
      </div>

      <!-- Filter Buttons Row (Alle 7 Rechnungstypen + Alle Posten) -->
      <div class="d-flex gap-1.5 mb-4 flex-wrap bg-light p-2 rounded-3 border align-items-center">
        <span class="small text-muted fw-bold me-2"><i class="fas fa-filter me-1"></i>Kategorie:</span>
        <button class="btn btn-xs ${currentFilter === 'alle' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('alle')">
          <i class="fas fa-list me-1"></i> Alle Posten
        </button>
        <button class="btn btn-xs ${currentFilter === 'Jahresbeitrag' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Jahresbeitrag')">
          <i class="fas fa-id-card me-1"></i> Jahresbeiträge
        </button>
        <button class="btn btn-xs ${currentFilter === 'Vermietung' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Vermietung')">
          <i class="fas fa-home me-1"></i> Vermietung
        </button>
        <button class="btn btn-xs ${currentFilter === 'Materialverkauf' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Materialverkauf')">
          <i class="fas fa-tshirt me-1"></i> Materialverkauf
        </button>
        <button class="btn btn-xs ${currentFilter === 'Depot / Pfand' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Depot / Pfand')">
          <i class="fas fa-hand-holding-usd me-1"></i> Depot / Pfand
        </button>
        <button class="btn btn-xs ${currentFilter === 'Schulsport' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Schulsport')">
          <i class="fas fa-bullseye me-1"></i> Schulsport
        </button>
        <button class="btn btn-xs ${currentFilter === 'Sponsoring' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Sponsoring')">
          <i class="fas fa-handshake me-1"></i> Sponsoring / Gönner
        </button>
        <button class="btn btn-xs ${currentFilter === 'Sonstige' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Sonstige')">
          <i class="fas fa-file-alt me-1"></i> Sonstige / Diverse
        </button>
      </div>

      <!-- Summary KPI Row -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="bh-metric-card danger shadow-sm">
            <div class="small text-muted fw-semibold">Offene Gesamtsumme</div>
            <h2 class="fw-bold mt-1 mb-0 text-danger">CHF ${totalOpenSum.toFixed(2)}</h2>
            <div class="small text-muted mt-1">Ausstehende Forderungen (${categoryLabels[currentFilter] || currentFilter})</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="bh-metric-card info shadow-sm">
            <div class="small text-muted fw-semibold">Säumige Empfänger</div>
            <h2 class="fw-bold mt-1 mb-0 text-info">${memberList.length} Personen</h2>
            <div class="small text-muted mt-1">Mit mind. 1 offenen Rechnung</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="bh-metric-card info shadow-sm">
            <div class="small text-muted fw-semibold">Offene Dokumente</div>
            <h2 class="fw-bold mt-1 mb-0 text-dark">${totalOpenCount} Dokumente</h2>
            <div class="small text-muted mt-1">Status 'offen' oder 'gemahnt'</div>
          </div>
        </div>
      </div>

      <!-- Offene Posten Tabelle -->
      <div class="table-responsive">
        <table class="table table-hover align-middle border">
          <thead class="table-light small">
            ${viewMode === 'single' ? `
              <tr>
                <th style="width:40px;" class="text-center">#</th>
                <th style="width:140px;">Rechnungs-ID</th>
                <th>Empfänger / Mitglied</th>
                <th style="width:110px;">Datum</th>
                <th style="width:140px;">Kategorie</th>
                <th style="width:100px;" class="text-center">Status</th>
                <th style="width:140px;" class="text-end">Offener Betrag</th>
                <th style="width:110px;" class="text-center">Aktion</th>
              </tr>
            ` : `
              <tr>
                <th style="width:40px;" class="text-center">#</th>
                <th style="width:250px;">Mitglied / Empfänger</th>
                <th>Offene Rechnungen</th>
                <th style="width:160px;" class="text-end">Offener Gesamtsaldo</th>
                <th style="width:110px;" class="text-center">Aktion</th>
              </tr>
            `}
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
          ${openInvoices.length > 0 ? `
            <tfoot class="table-light fw-bold">
              <tr>
                <td colspan="${viewMode === 'single' ? '6' : '3'}" class="text-end">TOTAL OFFENE POSTEN (${openInvoices.length} Rechnungen):</td>
                <td class="text-end text-danger fs-6 font-monospace">CHF ${totalOpenSum.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          ` : ''}
        </table>
      </div>
    </div>
  `;
};

// =====================================================================
// TAB: EXTERNE KONTAKTE (STRENG NACH ID)
// =====================================================================
window._contactsSearchQuery = '';

window.rnFilterContacts = function(query) {
  window._contactsSearchQuery = (query || '').toLowerCase().trim();
  const tbody = document.getElementById('rn-contacts-tbody');
  if (tbody) {
    tbody.innerHTML = rnRenderContactsRows();
  }
};

window.rnRenderContactsRows = function() {
  const list = window._externalContacts || [];
  const q = window._contactsSearchQuery || '';

  const filtered = list.filter(c => {
    if (!q) return true;
    const sId = String(c.id || '').toLowerCase();
    const sName = String(c.name || '').toLowerCase();
    const sFirma = String(c.firma || '').toLowerCase();
    const sVorname = String(c.vorname || '').toLowerCase();
    const sNachname = String(c.nachname || '').toLowerCase();
    const sEmail = String(c.email || '').toLowerCase();
    const sOrt = String(c.ort || '').toLowerCase();
    const sStrasse = String(c.strasse || '').toLowerCase();
    const sKat = String(c.kategorie || '').toLowerCase();
    return sId.includes(q) || sName.includes(q) || sFirma.includes(q) || sVorname.includes(q) || 
           sNachname.includes(q) || sEmail.includes(q) || sOrt.includes(q) || sStrasse.includes(q) || sKat.includes(q);
  });

  if (filtered.length === 0) {
    return `
      <tr>
        <td colspan="8" class="text-center text-muted py-5">
          <i class="fas fa-address-book fa-3x mb-3 text-secondary opacity-50"></i>
          <h5>Keine externen Kontakte gefunden</h5>
          <p class="small text-muted mb-0">${q ? 'Kein Kontakt entspricht den Suchkriterien.' : 'Noch keine externen Kontakte erfasst. Klicken Sie auf "+ Neuer Kontakt erfassen", um einen anzulegen.'}</p>
        </td>
      </tr>
    `;
  }

  return filtered.map((c, idx) => {
    const isFirma = c.typ === 'firma' || Boolean(c.firma);
    const category = c.kategorie || (isFirma ? 'Firma' : 'Privat');
    
    // Title & Subtitle
    let mainTitle = '';
    let subTitle = '';
    if (isFirma) {
      mainTitle = escapeHtml(c.firma || c.name || 'Unbenannte Organisation');
      const cpParts = [c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ');
      if (cpParts || c.abteilung) {
        subTitle = `<span class="text-muted"><i class="fas fa-user-tie me-1"></i>${escapeHtml(cpParts)}${c.abteilung ? ` · <span class="badge bg-light text-secondary border">${escapeHtml(c.abteilung)}</span>` : ''}</span>`;
      }
    } else {
      const nameParts = [c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ');
      mainTitle = escapeHtml(nameParts || c.name || 'Unbenannte Person');
    }

    // Address construction
    const addressParts = [
      c.strasse,
      c.adresszusatz,
      [c.plz, c.ort].filter(Boolean).join(' ') + (c.land && c.land !== 'CH' ? ` (${c.land})` : '')
    ].filter(Boolean);
    const fullAddress = addressParts.join(', ');

    // Category badge color
    let catBadgeClass = 'bg-secondary';
    if (category === 'Sponsor') catBadgeClass = 'bg-warning text-dark';
    else if (category === 'Gönner') catBadgeClass = 'bg-info text-dark';
    else if (category === 'Gemeinde') catBadgeClass = 'bg-primary';
    else if (category === 'Mieter') catBadgeClass = 'bg-success';
    else if (category === 'Lieferant') catBadgeClass = 'bg-dark';

    return `
      <tr>
        <td class="text-center fw-bold text-muted small" style="width: 40px;">${idx + 1}</td>
        <td style="width: 90px;">
          <span class="badge bg-light text-primary border font-monospace px-2 py-1">EXT-${escapeHtml(c.id)}</span>
        </td>
        <td style="width: 120px;">
          <span class="badge ${isFirma ? 'bg-indigo text-white bg-opacity-75' : 'bg-light text-dark border'} me-1">
            <i class="fas ${isFirma ? 'fa-building' : 'fa-user'} me-1"></i>${isFirma ? 'Firma' : 'Privat'}
          </span>
          <span class="badge ${catBadgeClass} small">${escapeHtml(category)}</span>
        </td>
        <td>
          <div class="fw-bold text-dark">${mainTitle}</div>
          ${subTitle ? `<div class="small mt-0.5">${subTitle}</div>` : ''}
          ${c.bemerkungen ? `<div class="small text-muted fst-italic mt-0.5"><i class="fas fa-sticky-note me-1 text-warning"></i>${escapeHtml(c.bemerkungen)}</div>` : ''}
        </td>
        <td>
          ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="text-decoration-none text-primary fw-medium"><i class="fas fa-envelope me-1 small"></i>${escapeHtml(c.email)}</a>` : '<span class="text-muted">–</span>'}
        </td>
        <td>
          ${fullAddress ? `<small class="text-secondary"><i class="fas fa-map-marker-alt me-1 text-muted"></i>${escapeHtml(fullAddress)}</small>` : '<span class="text-muted">–</span>'}
        </td>
        <td>
          ${c.telefon ? `<small class="text-secondary"><i class="fas fa-phone me-1 text-muted"></i>${escapeHtml(c.telefon)}</small>` : '<span class="text-muted">–</span>'}
        </td>
        <td class="text-end" style="width: 150px;">
          <div class="btn-group btn-group-sm shadow-sm">
            <button class="btn btn-outline-primary" onclick="rnOpenCreateModal(); setTimeout(() => { const sel = document.getElementById('rnc-member-select'); if(sel) { sel.value = 'EXT:${c.id}'; rnHandleMemberSelect(sel.value); } }, 200);" title="Rechnung an diesen Kontakt erstellen">
              <i class="fas fa-file-invoice-dollar"></i>
            </button>
            <button class="btn btn-outline-secondary" onclick="rnOpenContactModal('${c.id}')" title="Kontakt bearbeiten">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-outline-danger" onclick="rnDeleteContactPrompt('${c.id}')" title="Kontakt löschen">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

window.renderTabContacts = function(content) {
  if (!content) return;

  const totalContacts = (window._externalContacts || []).length;

  content.innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-4 mb-4">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
        <div>
          <h4 class="mb-1 text-primary fw-bold">
            <i class="fas fa-address-book me-2"></i>Externe Kontakte (Rechnungsempfänger)
          </h4>
          <p class="text-muted small mb-0">
            Zentrale Verwaltung externer Kontakte (Sponsoren, Mieter, Firmen, Behörden & Privatpersonen) mit QR-Rechnung- und Briefkopf-Konformität.
          </p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary fw-bold px-3 py-2 rounded-3 shadow-sm" onclick="rnOpenContactModal()">
            <i class="fas fa-plus me-1.5"></i> Neuer Kontakt erfassen
          </button>
        </div>
      </div>

      <!-- Suche und Zähler -->
      <div class="row g-3 mb-3 align-items-center">
        <div class="col-md-5">
          <div class="input-group shadow-sm">
            <span class="input-group-text bg-light text-muted border-end-0"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control border-start-0" placeholder="Suchen nach Firma, Name, Ort, E-Mail, Kategorie..." value="${escapeHtml(window._contactsSearchQuery || '')}" oninput="rnFilterContacts(this.value)">
          </div>
        </div>
        <div class="col-md-7 text-md-end text-muted small">
          <span class="badge bg-primary px-2.5 py-1.5 me-2">${totalContacts} Kontakt(e) erfasst</span>
          <span>Tabelle: <code>kontakte_extern</code></span>
        </div>
      </div>

      <!-- Tabelle -->
      <div class="table-responsive border rounded-3 shadow-sm">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light small">
            <tr>
              <th style="width: 40px;" class="text-center">#</th>
              <th style="width: 90px;">ID</th>
              <th style="width: 120px;">Typ / Kat.</th>
              <th>Name / Firma & Kontaktperson</th>
              <th>E-Mail</th>
              <th>Adresse</th>
              <th>Telefon</th>
              <th style="width: 150px;" class="text-end">Aktionen</th>
            </tr>
          </thead>
          <tbody id="rn-contacts-tbody">
            ${rnRenderContactsRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
};

