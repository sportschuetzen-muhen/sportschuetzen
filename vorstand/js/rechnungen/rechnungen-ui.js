// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - UI
// =====================================================================

// Dropdown-Auswahl für Standard-Positionen generieren
window.rnGetDropdownMenuHtml = function(actionFuncName) {
  let templates = window._invoiceTemplates;
  if (!templates || templates.length === 0) {
    rnInitializeTemplates();
    templates = JSON.parse(localStorage.getItem('portal_invoice_templates') || '[]');
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
    if (idx > 0) html += '<li><hr class="dropdown-divider"></li>';
    
    let catIcon = 'fa-shopping-cart';
    let catColor = 'text-info';
    if (cat === 'Vermietung') { catIcon = 'fa-home'; catColor = 'text-primary'; }
    else if (cat === 'Konsumationen') { catIcon = 'fa-wine-glass'; catColor = 'text-success'; }
    else if (cat === 'Schulsport') { catIcon = 'fa-bullseye'; catColor = 'text-danger'; }
    
    html += `<li><h6 class="dropdown-header ${catColor} fw-bold"><i class="fas ${catIcon} me-1"></i> ${cat}</h6></li>`;
    grouped[cat].forEach(t => {
      const priceLabel = t.price ? ` (CHF ${Number(t.price).toFixed(2)})` : ' (Preis manuell)';
      const escapedDesc = String(t.desc).replace(/'/g, "\\'");
      html += `<li><a class="dropdown-item" href="#" onclick="${actionFuncName}('${escapedDesc}', '${t.price || ''}'); return false;">${escapeHtml(t.desc)}${priceLabel}</a></li>`;
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
  const openInvoices = window._invoices.filter(i => i.status === 'offen');
  const openCount = openInvoices.length;
  const openSum = openInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  
  const paidInvoices = window._invoices.filter(i => i.status === 'bezahlt');
  const paidCount = paidInvoices.length;
  const paidSum = paidInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  content.innerHTML = `
    <!-- KPI Header -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="bh-metric-card danger shadow-sm">
          <div class="small text-muted fw-semibold">Offener Gesamtbetrag</div>
          <h2 class="fw-bold mt-1 mb-0 text-danger"><span class="currency-label">CHF</span> ${openSum.toFixed(2)}</h2>
          <div class="small text-muted mt-1">${openCount} offene Rechnungen</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card success shadow-sm">
          <div class="small text-muted fw-semibold">Eingenommen (Bezahlt)</div>
          <h2 class="fw-bold mt-1 mb-0 text-success"><span class="currency-label">CHF</span> ${paidSum.toFixed(2)}</h2>
          <div class="small text-muted mt-1">${paidCount} bezahlte Rechnungen</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card info shadow-sm">
          <div class="small text-muted fw-semibold">Gesamte Fakturierung</div>
          <h2 class="fw-bold mt-1 mb-0 text-dark"><span class="currency-label">CHF</span> ${(openSum + paidSum).toFixed(2)}</h2>
          <div class="small text-muted mt-1">${totalCount} Rechnungen insgesamt</div>
        </div>
      </div>
    </div>

    <!-- Steuerung & Filter -->
    <div class="bh-report-section border border-light shadow-sm mb-4">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap:15px;">
        <h5 class="fw-bold text-primary mb-0"><i class="fas fa-filter me-2"></i>Filter & Rechnungs-Archiv</h5>
        <button class="btn btn-sm btn-success fw-bold shadow-sm write-protected" onclick="rnOpenCreateModal(this)">
          <i class="fas fa-plus-circle me-1"></i> Rechnung erstellen
        </button>
      </div>

      <div class="row g-3">
        <div class="col-md-4">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light text-muted"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control" id="rn-search" placeholder="Empfänger, ID oder Beleg..." oninput="rnFilterInvoices()">
          </div>
        </div>
        <div class="col-md-4">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light text-muted">Status</span>
            <select class="form-select" id="rn-filter-status" onchange="rnChangeFilterStatus(this.value)">
              <option value="alle">Alle Status</option>
              <option value="offen">Offen</option>
              <option value="bezahlt">Bezahlt</option>
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
      <div class="table-responsive" id="rn-table-scroll-wrap">
        <table class="table table-hover align-middle bh-table mb-0" id="rn-invoices-table">
          <thead>
            <tr>
              <th class="bh-sort-header" onclick="rnSortInvoices('id')">Rechnungs-ID ${rnGetSortIndicator('id')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('name')">Empfänger ${rnGetSortIndicator('name')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('created_at')">Datum ${rnGetSortIndicator('created_at')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('year')">Jahr ${rnGetSortIndicator('year')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('type')">Typ ${rnGetSortIndicator('type')}</th>
              <th class="bh-sort-header text-center" onclick="rnSortInvoices('status')" style="width: 100px;">Status ${rnGetSortIndicator('status')}</th>
              <th class="bh-sort-header text-end" onclick="rnSortInvoices('total_amount')" style="width: 130px;">Betrag ${rnGetSortIndicator('total_amount')}</th>
              <th class="text-end" style="width: 170px;">Aktionen</th>
            </tr>
          </thead>
          <tbody id="rn-tbody">
            <!-- Dynamisch geladen -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  rnRenderTable();
};

// Live Filter & Draw Table
window.rnRenderTable = function() {
  const tbody = document.getElementById('rn-tbody');
  if (!tbody) return;

  const query = document.getElementById('rn-search') ? document.getElementById('rn-search').value.toLowerCase().trim() : '';

  // 1. Filtern
  let list = window._invoices.filter(i => {
    const matchesSearch = !query || 
      String(i.id).toLowerCase().includes(query) ||
      String(i.name).toLowerCase().includes(query) ||
      String(i.document_ref).toLowerCase().includes(query) ||
      String(i.PersonNumber).toLowerCase().includes(query);

    const matchesStatus = window._invoicesFilterStatus === 'alle' || i.status === window._invoicesFilterStatus;

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
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Keine passenden Rechnungen gefunden.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const st = String(item.status || '').toLowerCase();
    const isPaid = st === 'bezahlt';
    const statusClass = isPaid ? 'bg-success' : (st === 'offen' ? 'bg-warning text-dark' : (st === 'gemahnt' ? 'bg-danger' : 'bg-secondary'));
    
    // Frist prüfen (für überfällig)
    let extraBadge = '';
    if (st === 'offen' || st === 'gemahnt') {
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
        const diffDays = Math.ceil(Math.abs(new Date() - createdDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 30) {
          extraBadge = `<span class="badge bg-danger ms-1" style="font-size:9px;"><i class="fas fa-exclamation-circle me-0.5"></i>Mahnfrist!</span>`;
        }
      }
    }

    let numberLabel = '';
    if (item.PersonNumber) {
      if (String(item.PersonNumber).startsWith('EXT')) {
        const cId = String(item.PersonNumber).replace('EXT-', '').replace('EXT:', '');
        numberLabel = `<div class="text-muted" style="font-size:10px;"><i class="fas fa-address-card me-1 text-info"></i>Kontakt ID: ${escapeHtml(cId)}</div>`;
      } else {
        numberLabel = `<div class="text-muted" style="font-size:10px;">Mitglieds-Nr: ${escapeHtml(item.PersonNumber)}</div>`;
      }
    }

    const createdDisplay = item.created_at ? escapeHtml(String(item.created_at).split(' ')[0]) : '–';

    return `
      <tr class="bh-account-row" id="rn-row-${item.id}">
        <td><span class="bh-konto-badge bh-konto-soll-badge">${item.id}</span></td>
        <td>
          <div class="fw-bold text-dark mb-0">${escapeHtml(item.name)}</div>
          ${numberLabel}
        </td>
        <td class="text-muted font-monospace small">${createdDisplay}</td>
        <td class="text-muted font-monospace">${item.year}</td>
        <td><span class="badge bg-light text-dark border small">${item.type}</span></td>
        <td class="text-center">
          <span class="badge ${statusClass} px-2.5 py-1.5 rounded-pill small">${item.status}</span>
          ${extraBadge}
        </td>
        <td class="text-end fw-bold text-primary font-monospace">${fmtChf(item.total_amount)}</td>
        <td class="text-end" style="white-space: nowrap;">
          <button class="btn btn-xs btn-outline-primary me-1" onclick="rnOpenDetailsModal('${item.id}')" title="Details einsehen">
            <i class="fas fa-eye"></i>
          </button>
          
          ${item.type === 'Jahresbeitrag' ? `
            <span class="badge bg-light text-secondary border small me-1" style="cursor: pointer;" onclick="rnJumpToJahresbeitrag('${item.PersonNumber}')" title="Klicken, um diesen Jahresbeitrag direkt im Jahresbeitrag-Modul zu bearbeiten">
              <i class="fas fa-lock me-1 text-warning"></i>JB-Gesperrt
            </span>
            ${!isPaid ? `
              <button class="btn btn-xs btn-outline-success write-protected me-1" onclick="rnOpenPaymentModal('${item.id}', ${item.total_amount})" title="Zahlung erfassen">
                <i class="fas fa-coins"></i>
              </button>
            ` : ''}
          ` : `
            ${!isPaid ? `
              <button class="btn btn-xs btn-outline-success write-protected me-1" onclick="rnOpenPaymentModal('${item.id}', ${item.total_amount})" title="Zahlung erfassen">
                <i class="fas fa-coins"></i>
              </button>
              <button class="btn btn-xs btn-outline-warning write-protected me-1" onclick="rnOpenEditModal('${item.id}')" title="Rechnung bearbeiten">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-xs btn-outline-danger write-protected me-1" onclick="rnDeleteInvoicePrompt('${item.id}')" title="Rechnung löschen">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : ''}
          `}

          ${item.pdf_url ? `
            <a href="${item.pdf_url}" target="_blank" class="btn btn-xs btn-outline-danger me-1" title="PDF QR-Rechnung herunterladen">
              <i class="fas fa-file-pdf"></i>
            </a>
            <button class="btn btn-xs btn-outline-secondary write-protected me-1" onclick="rnGeneratePDFOnly('${item.id}', '${escapeJs(item.name)}')" title="PDF neu generieren">
              <i class="fas fa-sync"></i>
            </button>
          ` : `
            <button class="btn btn-xs btn-outline-secondary write-protected me-1" onclick="rnGeneratePDFOnly('${item.id}', '${escapeJs(item.name)}')" title="PDF generieren">
              <i class="fas fa-cog"></i>
            </button>
          `}

          <button class="btn btn-xs btn-outline-info write-protected me-1" onclick="rnSendMailPrompt('${item.id}', '${escapeJs(item.name)}')" title="Per E-Mail versenden">
            <i class="fas fa-envelope"></i>
          </button>

          ${!isPaid ? `
            <button class="btn btn-xs btn-outline-warning write-protected" onclick="rnSendMahnungPrompt('${item.id}', '${escapeJs(item.name)}')" title="Zahlungserinnerung / Mahnung versenden">
              <i class="fas fa-exclamation-triangle"></i>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
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
window._rechnungenOffenePostenFilter = 'Jahresbeitrag';

window.rnFilterOffenePostenType = function(type) {
  window._rechnungenOffenePostenFilter = type;
  const content = document.getElementById('rn-tab-content-container');
  if (content) window.renderTabOffenePosten(content);
};

window.renderTabOffenePosten = function(content) {
  if (!content) return;

  const currentFilter = window._rechnungenOffenePostenFilter || 'Jahresbeitrag';

  const openInvoices = (window._invoices || []).filter(i => {
    const st = String(i.status || '').toLowerCase();
    const isUnpaid = st === 'offen' || st === 'teilweise' || st === 'gemahnt';
    if (!isUnpaid) return false;

    const t = String(i.type || '').toLowerCase();
    if (currentFilter === 'Jahresbeitrag') return t.includes('jahresbeitrag');
    if (currentFilter === 'Vermietung') return t.includes('vermietung') || t.includes('schulsport') || t.includes('sonstige') || t.includes('sponsoring');
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
  const totalOpenSum = memberList.reduce((s, m) => s + m.totalOpen, 0);
  const totalOpenCount = openInvoices.length;

  let memberRowsHtml = '';
  if (memberList.length === 0) {
    memberRowsHtml = `
      <tr>
        <td colspan="5" class="text-center text-muted py-5">
          <i class="fas fa-check-circle fa-3x text-success mb-3" style="opacity:0.5;"></i>
          <h5>Keine offenen Posten in dieser Kategorie!</h5>
          <p class="small text-muted">Alle Rechnungen für den gewählten Filter wurden vollständig beglichen.</p>
        </td>
      </tr>
    `;
  } else {
    memberRowsHtml = memberList.map((m, idx) => {
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
          <td class="text-end fw-bold text-danger fs-6">
            CHF ${m.totalOpen.toFixed(2)}
          </td>
          <td class="text-center" style="width:120px;">
            <button class="btn btn-sm btn-outline-secondary" onclick="rnSwitchTab('archiv'); window._invoicesFilterStatus='offen'; renderActiveRechnungenTab();" title="Im Rechnungs-Archiv anzeigen">
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
            Übersicht aller ausstehenden Rechnungsbeträge pro Mitglied / Empfänger für die Generalversammlung & Revision.
          </p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" onclick="window.print()">
            <i class="fas fa-print me-1.5"></i>Liste Drucken / PDF
          </button>
        </div>
      </div>

      <!-- Filter Buttons Row -->
      <div class="d-flex gap-2 mb-4 flex-wrap bg-light p-2 rounded-3 border">
        <span class="small text-muted fw-bold align-self-center me-2"><i class="fas fa-filter me-1"></i>Kategorie:</span>
        <button class="btn btn-xs ${currentFilter === 'Jahresbeitrag' ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Jahresbeitrag')">
          <i class="fas fa-id-card me-1"></i> Nur Jahresbeiträge (Mitglieder)
        </button>
        <button class="btn btn-xs ${currentFilter === 'Vermietung' ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Vermietung')">
          <i class="fas fa-home me-1"></i> Miete & Externe
        </button>
        <button class="btn btn-xs ${currentFilter === 'Materialverkauf' ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Materialverkauf')">
          <i class="fas fa-tshirt me-1"></i> Materialverkauf
        </button>
        <button class="btn btn-xs ${currentFilter === 'Depot / Pfand' ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('Depot / Pfand')">
          <i class="fas fa-hand-holding-usd me-1"></i> Depot / Pfand
        </button>
        <button class="btn btn-xs ${currentFilter === 'alle' ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="rnFilterOffenePostenType('alle')">
          <i class="fas fa-list me-1"></i> Alle Posten
        </button>
      </div>

      <!-- Summary KPI Row -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="bh-metric-card danger shadow-sm">
            <div class="small text-muted fw-semibold">Offene Gesamtsumme</div>
            <h2 class="fw-bold mt-1 mb-0 text-danger">CHF ${totalOpenSum.toFixed(2)}</h2>
            <div class="small text-muted mt-1">Ausstehende Forderungen (${currentFilter})</div>
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
            <tr>
              <th style="width:40px;" class="text-center">#</th>
              <th>Mitglied / Empfänger</th>
              <th>Offene Rechnungen</th>
              <th class="text-end">Offener Gesamtsaldo</th>
              <th style="width:120px;" class="text-center">Aktion</th>
            </tr>
          </thead>
          <tbody>
            ${memberRowsHtml}
          </tbody>
          ${memberList.length > 0 ? `
            <tfoot class="table-light fw-bold">
              <tr>
                <td colspan="3" class="text-end">TOTAL OFFENE POSTEN:</td>
                <td class="text-end text-danger fs-6">CHF ${totalOpenSum.toFixed(2)}</td>
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
    const sEmail = String(c.email || '').toLowerCase();
    const sOrt = String(c.ort || '').toLowerCase();
    const sStrasse = String(c.strasse || '').toLowerCase();
    return sId.includes(q) || sName.includes(q) || sEmail.includes(q) || sOrt.includes(q) || sStrasse.includes(q);
  });

  if (filtered.length === 0) {
    return `
      <tr>
        <td colspan="7" class="text-center text-muted py-5">
          <i class="fas fa-address-book fa-3x mb-3 text-secondary opacity-50"></i>
          <h5>Keine externen Kontakte gefunden</h5>
          <p class="small text-muted mb-0">${q ? 'Kein Kontakt entspricht den Suchkriterien.' : 'Noch keine externen Kontakte erfasst. Klicken Sie auf "+ Neuer Kontakt", um einen anzulegen.'}</p>
        </td>
      </tr>
    `;
  }

  return filtered.map((c, idx) => {
    const fullAddress = [c.strasse, [c.plz, c.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return `
      <tr>
        <td class="text-center fw-bold text-muted small" style="width: 40px;">${idx + 1}</td>
        <td style="width: 80px;">
          <span class="badge bg-light text-primary border font-monospace px-2 py-1">ID: ${escapeHtml(c.id)}</span>
        </td>
        <td>
          <div class="fw-bold text-dark">${escapeHtml(c.name)}</div>
          <small class="text-muted font-monospace">EXT-${escapeHtml(c.id)}</small>
        </td>
        <td>
          ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="text-decoration-none text-primary"><i class="fas fa-envelope me-1 small"></i>${escapeHtml(c.email)}</a>` : '<span class="text-muted">–</span>'}
        </td>
        <td>
          ${fullAddress ? `<i class="fas fa-map-marker-alt me-1 text-muted small"></i>${escapeHtml(fullAddress)}` : '<span class="text-muted">–</span>'}
        </td>
        <td>
          ${c.telefon ? `<i class="fas fa-phone me-1 text-muted small"></i>${escapeHtml(c.telefon)}` : '<span class="text-muted">–</span>'}
        </td>
        <td class="text-end" style="width: 180px;">
          <div class="btn-group btn-group-sm">
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
            Verwaltung von externen Rechnungsempfängern, Mietern, Firmen und Sponsoren. Die Zuordnung erfolgt strikt über die Kontakt-ID.
          </p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary fw-bold" onclick="rnOpenContactModal()">
            <i class="fas fa-plus me-1.5"></i> Neuer Kontakt erfassen
          </button>
        </div>
      </div>

      <!-- Suche und Zähler -->
      <div class="row g-3 mb-3 align-items-center">
        <div class="col-md-5">
          <div class="input-group">
            <span class="input-group-text bg-light text-muted"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control" placeholder="Kontakt suchen (ID, Name, Ort, E-Mail)..." value="${escapeHtml(window._contactsSearchQuery || '')}" oninput="rnFilterContacts(this.value)">
          </div>
        </div>
        <div class="col-md-7 text-md-end text-muted small">
          <span class="badge bg-secondary me-2">${totalContacts} Kontakt(e) erfasst</span>
          <span>Stammdaten-Tabelle: <code>kontakte_extern</code></span>
        </div>
      </div>

      <!-- Tabelle -->
      <div class="table-responsive border rounded-3">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light small">
            <tr>
              <th style="width: 40px;" class="text-center">#</th>
              <th style="width: 80px;">ID</th>
              <th>Name / Firma</th>
              <th>E-Mail</th>
              <th>Adresse</th>
              <th>Telefon</th>
              <th style="width: 180px;" class="text-end">Aktionen</th>
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

