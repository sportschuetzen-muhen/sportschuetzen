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
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'templates' ? 'active' : ''}" id="rn-tab-btn-templates" onclick="rnSwitchTab('templates')">
          <i class="fas fa-magic me-1.5"></i> Standard-Positionen verwalten
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
  } else if (window._rechnungenActiveTab === 'templates') {
    renderTabTemplates(content);
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
        <button class="btn btn-sm btn-success fw-bold shadow-sm write-protected" onclick="rnOpenCreateModal()">
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
      <div class="table-responsive" style="max-height: 520px;">
        <table class="table table-hover align-middle bh-table mb-0" id="rn-invoices-table">
          <thead>
            <tr>
              <th class="bh-sort-header" onclick="rnSortInvoices('id')">Rechnungs-ID ${rnGetSortIndicator('id')}</th>
              <th class="bh-sort-header" onclick="rnSortInvoices('name')">Empfänger ${rnGetSortIndicator('name')}</th>
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
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Keine passenden Rechnungen gefunden.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const isPaid = item.status === 'bezahlt';
    const statusClass = isPaid ? 'bg-success' : (item.status === 'offen' ? 'bg-warning text-dark' : 'bg-secondary');
    
    // Frist prüfen (für überfällig)
    let extraBadge = '';
    if (item.status === 'offen') {
      const createdDate = item.created_at ? new Date(displayToIso(item.created_at.split(' ')[0])) : null;
      if (createdDate) {
        const diffTime = Math.abs(new Date() - createdDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 30) {
          extraBadge = `<span class="badge bg-danger ms-1 animate__animated animate__flash animate__infinite animate__slower" style="font-size:9px;">Mahnfrist!</span>`;
        }
      }
    }

    return `
      <tr class="bh-account-row">
        <td><span class="bh-konto-badge bh-konto-soll-badge">${item.id}</span></td>
        <td>
          <div class="fw-bold text-dark mb-0">${escapeHtml(item.name)}</div>
          ${item.PersonNumber ? `<div class="text-muted" style="font-size:10px;">Mitglieds-Nr: ${item.PersonNumber}</div>` : ''}
        </td>
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
              <i class="fas fa-cog fa-spin-slow"></i>
            </button>
          `}

          <button class="btn btn-xs btn-outline-info write-protected" onclick="rnSendMailPrompt('${item.id}', '${escapeJs(item.name)}')" title="Per E-Mail versenden">
            <i class="fas fa-envelope"></i>
          </button>
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
