// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT
// =====================================================================

// Globale State-Variablen für Rechnungen
window._invoices = [];
window._invoicesSearchCol = 'id';
window._invoicesSearchAsc = false;
window._invoicesFilterStatus = 'alle';
window._invoicesFilterType = 'alle';

// Standard-Rechnungs-Typen
const RECHNUNG_TYPES = [
  { value: 'Jahresbeitrag', label: 'Jahresbeitrag' },
  { value: 'Vermietung', label: 'Vermietung' },
  { value: 'Schulsport', label: 'Schulsport' },
  { value: 'Sponsoring', label: 'Sponsoring / Gönner' },
  { value: 'Sonstige', label: 'Sonstige / Diverse' }
];

// Online/Preload Endpoint Trigger
window.loadRechnungenData = async function(silent = false) {
  const hasCachedData = window._invoices && window._invoices.length > 0;
  
  if (!silent && !hasCachedData) {
    const container = document.getElementById('rechnungen-container');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status"></div>
          <p class="mt-2 text-muted">Lade Rechnungen und Zahlungsdaten aus der Datenbank...</p>
        </div>`;
    }
  }

  try {
    const response = await apiFetch('rechnungen', 'action=getInvoices');
    const result = await response.json();
    
    if (result.success) {
      window._invoices = result.data || [];
      window.renderRechnungen();
    } else {
      throw new Error(result.error || "API returned success: false");
    }
  } catch (err) {
    console.error("❌ Fehler beim Laden der Rechnungen:", err);
    const container = document.getElementById('rechnungen-container');
    if (container && (!silent || !hasCachedData)) {
      container.innerHTML = `
        <div class="alert alert-danger shadow-sm rounded-3">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Verbindungsfehler:</strong> Die Rechnungsdaten konnten nicht abgerufen werden.
          <br><small class="text-muted">${err.message}</small>
        </div>`;
    }
  }
};

// Render-Einstiegspunkt
window.renderRechnungen = function() {
  const container = document.getElementById('rechnungen-container');
  if (!container) return;

  // 1. Berechne KPIs
  const totalCount = window._invoices.length;
  const openInvoices = window._invoices.filter(i => i.status === 'offen');
  const openCount = openInvoices.length;
  const openSum = openInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  
  const paidInvoices = window._invoices.filter(i => i.status === 'bezahlt');
  const paidCount = paidInvoices.length;
  const paidSum = paidInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  // 2. Cockpit Grundgerüst
  container.innerHTML = `
    <!-- KPI Header -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="bh-metric-card danger shadow-sm">
          <div class="small text-muted fw-semibold">Offener Gesamtbetrag</div>
          <h2 class="fw-bold mt-1 mb-0 text-danger">${fmtChf(openSum)}</h2>
          <div class="small text-muted mt-1">${openCount} offene Rechnungen</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card success shadow-sm">
          <div class="small text-muted fw-semibold">Eingenommen (Bezahlt)</div>
          <h2 class="fw-bold mt-1 mb-0 text-success">${fmtChf(paidSum)}</h2>
          <div class="small text-muted mt-1">${paidCount} bezahlte Rechnungen</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card info shadow-sm">
          <div class="small text-muted fw-semibold">Gesamte Fakturierung</div>
          <h2 class="fw-bold mt-1 mb-0 text-dark">${fmtChf(openSum + paidSum)}</h2>
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

// Filter Handler
window.rnChangeFilterStatus = function(val) {
  window._invoicesFilterStatus = val;
  rnRenderTable();
};

window.rnChangeFilterType = function(val) {
  window._invoicesFilterType = val;
  rnRenderTable();
};

// Sortierung anwenden
window.rnSortInvoices = function(col) {
  if (window._invoicesSearchCol === col) {
    window._invoicesSearchAsc = !window._invoicesSearchAsc;
  } else {
    window._invoicesSearchCol = col;
    window._invoicesSearchAsc = true;
  }
  rnRenderTable();
};

// Sort Indicator
function rnGetSortIndicator(targetCol) {
  const col = window._invoicesSearchCol;
  const asc = window._invoicesSearchAsc;
  if (col !== targetCol) return '<i class="fas fa-sort text-muted ms-1 small opacity-50"></i>';
  return asc ? '<i class="fas fa-sort-up text-primary ms-1"></i>' : '<i class="fas fa-sort-down text-primary ms-1"></i>';
}

// Live Filter & Draw Table
window.rnFilterInvoices = function() {
  rnRenderTable();
};

window.rnRenderTable = function() {
  const tbody = document.getElementById('rn-tbody');
  if (!tbody) return;

  const query = document.getElementById('rn-search') ? document.getElementById('rn-search').value.toLowerCase().trim() : '';

  // 1. Filtern
  let list = window._invoices.filter(i => {
    // Suchfilter
    const matchesSearch = !query || 
      String(i.id).toLowerCase().includes(query) ||
      String(i.name).toLowerCase().includes(query) ||
      String(i.document_ref).toLowerCase().includes(query) ||
      String(i.PersonNumber).toLowerCase().includes(query);

    // Statusfilter
    const matchesStatus = window._invoicesFilterStatus === 'alle' || i.status === window._invoicesFilterStatus;

    // Typenfilter
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
      // Wenn das Erstellungsdatum älter als 30 Tage ist und nicht bezahlt, gilt es als überfällig
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

          ${item.pdf_url ? `
            <a href="${item.pdf_url}" target="_blank" class="btn btn-xs btn-outline-danger me-1" title="PDF QR-Rechnung herunterladen">
              <i class="fas fa-file-pdf"></i>
            </a>
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

// ZAHLUNGS ERFASSUNGS MODAL WITH SYNC CHOICE
window.rnOpenPaymentModal = function(invoiceId, amount) {
  let modalEl = document.getElementById('rnModalPayment');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalPayment';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-success text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-coins me-2"></i>Zahlungseingang erfassen</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-payment-form" onsubmit="rnSavePayment(event, '${invoiceId}')">
            
            <div class="alert alert-light border shadow-xs p-3 rounded-3 mb-4 d-flex justify-content-between align-items-center">
              <div>
                <span class="text-muted small">Zu begleichender Betrag:</span>
                <h5 class="fw-bold mb-0 text-dark">Rechnung ${invoiceId}</h5>
              </div>
              <h3 class="fw-extrabold mb-0 text-primary font-monospace">${fmtChf(amount)}</h3>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Zahlungsdatum</label>
              <input type="date" class="form-control" id="rnp-datum" required value="${new Date().toISOString().split('T')[0]}">
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Zahlungsmethode</label>
              <select class="form-select" id="rnp-methode" required>
                <option value="Überweisung Raiffeisen" selected>Überweisung Bank (Raiffeisen)</option>
                <option value="Kassabuch Bar">Barzahlung (Kassa)</option>
                <option value="Twint">Twint</option>
                <option value="Sonstiges">Sonstiges / Gutschein</option>
              </select>
            </div>

            <div class="mb-4">
              <label class="form-label fw-bold small text-muted">Beleg / Buchungsnummer</label>
              <input type="text" class="form-control fw-bold" id="rnp-beleg" value="ZAL-${invoiceId}">
              <div class="form-text text-muted small">Wird als Buchungsreferenz im Hauptbuch verbucht.</div>
            </div>

            <!-- Buchungsweiche zur Sicherheitsverhinderung von Doppelbuchungen -->
            <div class="mb-4 bg-light p-3 rounded-3 border">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="rnp-sync-bookkeeping" checked>
                <label class="form-check-label fw-bold small text-dark" for="rnp-sync-bookkeeping">
                  Zahlungseingang in Buchhaltung verbuchen
                </label>
              </div>
              <div class="form-text text-muted small mt-1">
                <strong>Option EIN (Standard):</strong> Verbucht die Zahlung automatisch im Journal (Soll Bank \`1020\` an Haben Debitoren \`1100\`).<br>
                <span class="text-danger"><strong>Option AUS:</strong> Ändert nur den Rechnungsstatus im Cockpit (Ideal für bereits von Hand im Kassabuch erfasste Rechnungen!).</span>
              </div>
            </div>

            <div class="d-grid">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="rnp-submit-btn">
                <i class="fas fa-check-circle me-1"></i> Zahlungseingang speichern
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

// SAVE PAYMENT
window.rnSavePayment = async function(event, invoiceId) {
  event.preventDefault();
  const btn = document.getElementById('rnp-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere...';
  }

  const syncBookkeeping = document.getElementById('rnp-sync-bookkeeping').checked;
  const datum = document.getElementById('rnp-datum').value;
  const methode = document.getElementById('rnp-methode').value;
  const beleg = document.getElementById('rnp-beleg').value.trim();

  // Falls der Nutzer die automatische Buchung im Journal deaktiviert hat:
  // Wir senden dem Backend das Flag syncBookkeeping=false, oder wir rufen eine alternative Backend-Action, 
  // oder wir senden dem Backend einfach einen Parameter, dass das Remote Buchen übersprungen werden soll.
  // Wait! In doget_dopost.js, saveZahlung automatically triggers remoteBookJournalEntry!
  // To bypass it, we can modify doget_dopost.js to check if `skipBooking: true` is passed.
  // Oh! Let's check in doget_dopost.js, does it support any skip flag? No, not yet!
  // That means we need to extend saveZahlung in doget_dopost.js to check `if (!postData.skipBooking)` before booking!
  // This is a crucial E2E integration step! We will implement this backend check very elegantly!
  
  const payload = {
    action: 'saveZahlung',
    invoiceId: invoiceId,
    datum: datum,
    methode: methode,
    beleg: beleg || `PAY-${invoiceId}`,
    skipBooking: !syncBookkeeping // Flag to skip double-entry booking!
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess(`🎉 Zahlung für Rechnung ${invoiceId} erfolgreich erfasst!`);
      const modalEl = document.getElementById('rnModalPayment');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "Fehler beim Speichern der Zahlung.");
    }
  } catch (err) {
    alert("❌ Fehler beim Speichern der Zahlung: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Zahlungseingang speichern';
    }
  }
};

// PDF GENERATION ONLY
window.rnGeneratePDFOnly = async function(invoiceId, name) {
  showLoadingOverlay(`Generiere QR-Rechnung PDF für ${name}...`);
  
  // Wir laden Empfänger-Infos aus der Rechnungs-ID (da wir sie in window._invoices haben)
  const inv = window._invoices.find(i => String(i.id) === String(invoiceId));
  if (!inv) {
    hideLoadingOverlay();
    alert("❌ Rechnung nicht gefunden.");
    return;
  }

  // Suche Mitglied für Adresse
  const m = window._mglData.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};

  const payload = {
    action: 'generateInvoicePDF',
    invoiceId: invoiceId,
    recipient: {
      vorname: m.FirstName || inv.name.split(' ')[0] || '',
      nachname: m.LastName || inv.name.split(' ').slice(1).join(' ') || '',
      strasse: m.Street || m.Strasse || '',
      plz: m.ZipCode || m.PLZ || '',
      ort: m.City || m.Ort || '',
      email: m.Email || ''
    }
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success && result.pdfUrl) {
      showSuccess("🎉 PDF erfolgreich generiert!");
      window.open(result.pdfUrl, '_blank');
      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "Generierung fehlgeschlagen.");
    }
  } catch (err) {
    alert("❌ PDF Fehler: " + err.message);
  } finally {
    hideLoadingOverlay();
  }
};

// SEND MAIL PROMPT
window.rnSendMailPrompt = async function(invoiceId, name) {
  const inv = window._invoices.find(i => String(i.id) === String(invoiceId));
  if (!inv) return;

  const m = window._mglData.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};
  const email = m.Email || '';

  const targetEmail = prompt(`📧 QR-Rechnung per E-Mail an ${name} versenden?\n\nBitte E-Mail-Adresse bestätigen/eingeben:`, email || 'mitglied@sportschuetzen-muhen.ch');
  if (targetEmail === null) return;
  if (!targetEmail.includes('@')) {
    alert("❌ Ungültige E-Mail-Adresse.");
    return;
  }

  showLoadingOverlay(`Erstelle QR-Rechnung und sende E-Mail an ${name}...`);

  const payload = {
    action: 'sendInvoiceEmail',
    invoiceId: invoiceId,
    recipient: {
      vorname: m.FirstName || inv.name.split(' ')[0] || '',
      nachname: m.LastName || inv.name.split(' ').slice(1).join(' ') || '',
      strasse: m.Street || m.Strasse || '',
      plz: m.ZipCode || m.PLZ || '',
      ort: m.City || m.Ort || '',
      email: targetEmail
    }
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess(`🎉 E-Mail erfolgreich an ${targetEmail} versandt!`);
      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "E-Mail-Versand fehlgeschlagen.");
    }
  } catch (err) {
    alert("❌ E-Mail Fehler: " + err.message);
  } finally {
    hideLoadingOverlay();
  }
};

// CREATE MANUALLY INVOICE MODAL
window.rnOpenCreateModal = async function() {
  let modalEl = document.getElementById('rnModalCreateInvoice');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalCreateInvoice';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  // Externe Kontakte laden
  window._externalContacts = [];
  try {
    const response = await apiFetch('rechnungen', 'action=getContacts');
    const result = await response.json();
    if (result.success) {
      window._externalContacts = result.data || [];
    }
  } catch (err) {
    console.error("⚠️ Fehler beim Laden der externen Kontakte:", err);
  }

  // Generiere Mitglieder-Optionen für die Autocomplete-Auswahl
  const memberOptions = (window._mglData || []).map(m => 
    `<option value="MBR:${m.PersonNumber}">${m.LastName} ${m.FirstName} (Nr: ${m.PersonNumber})</option>`
  ).join('');

  // Generiere externe Optionen
  const externalOptions = (window._externalContacts || []).map((c, idx) => 
    `<option value="EXT:${idx}">${c.name} (Extern - ${c.email || 'keine Mail'})</option>`
  ).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-file-invoice me-2"></i>Neue Rechnung verfassen</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-create-form" onsubmit="rnSaveCreateInvoice(event)">
            
            <!-- Empfänger-Auswahl -->
            <div class="row g-3 mb-3 pb-3 border-bottom">
              <div class="col-md-12">
                <label class="form-label fw-bold small text-muted">Empfänger auswählen (Mitglieder & Externe)</label>
                <select class="form-select fw-bold text-primary" id="rnc-member-select" onchange="rnHandleMemberSelect(this.value)">
                  <option value="" selected>-- Manuelle Erfassung / Neuer externer Empfänger --</option>
                  <optgroup label="Vereinsmitglieder">
                    ${memberOptions}
                  </optgroup>
                  ${window._externalContacts.length > 0 ? `
                  <optgroup label="Gespeicherte externe Kontakte">
                    ${externalOptions}
                  </optgroup>
                  ` : ''}
                </select>
              </div>
            </div>

            <!-- Adressdaten -->
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-bold small text-muted">Mitglieds-Nr</label>
                <input type="text" class="form-control font-monospace" id="rnc-person-number" placeholder="Optional">
              </div>
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Name, Vorname (Empfänger)</label>
                <input type="text" class="form-control" id="rnc-name" required placeholder="z.B. Müller Hans">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">E-Mail</label>
                <input type="email" class="form-control" id="rnc-email" placeholder="z.B. hans@mueller.ch">
              </div>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-muted">Strasse, Nr.</label>
                <input type="text" class="form-control" id="rnc-strasse" placeholder="z.B. Hauptstrasse 22">
              </div>
              <div class="col-md-2">
                <label class="form-label fw-bold small text-muted">PLZ</label>
                <input type="text" class="form-control font-monospace" id="rnc-plz" placeholder="5037">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Ort</label>
                <input type="text" class="form-control" id="rnc-ort" placeholder="Muhen">
              </div>
            </div>

            <!-- Rechnungs-Kopfdaten -->
            <div class="row g-3 mb-4 p-3 bg-light rounded-3 border border-light">
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungsjahr</label>
                <input type="number" class="form-control fw-bold font-monospace" id="rnc-year" required value="${window._bhYear}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungstyp</label>
                <select class="form-select" id="rnc-type" required>
                  <option value="Vermietung" selected>Vermietung</option>
                  <option value="Jahresbeitrag">Jahresbeitrag / Mitglieder</option>
                  <option value="Schulsport">Schulsport</option>
                  <option value="Sponsoring">Sponsoring / Gönner</option>
                  <option value="Sonstige">Sonstige / Diverse</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungs-ID (Vorschlag)</label>
                <input type="text" class="form-control fw-bold text-success font-monospace" id="rnc-invoice-id" readonly>
              </div>
            </div>

            <!-- Positionen verfassen -->
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="fw-bold text-primary mb-0"><i class="fas fa-list me-1.5"></i>Rechnungspositionen</h6>
                <button type="button" class="btn btn-xs btn-outline-primary" onclick="rncAddPositionRow()">
                  <i class="fas fa-plus"></i> Pos hinzufügen
                </button>
              </div>

              <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle mb-0" style="font-size: 13px;">
                  <thead class="table-light">
                    <tr>
                      <th style="width: 40px;" class="text-center">#</th>
                      <th>Beschreibung der Dienstleistung / Ware</th>
                      <th style="width: 90px;" class="text-end">Menge</th>
                      <th style="width: 130px;" class="text-end">Einzelpreis</th>
                      <th style="width: 130px;" class="text-end">Gesamt (CHF)</th>
                      <th style="width: 50px;" class="text-center">Aktion</th>
                    </tr>
                  </thead>
                  <tbody id="rnc-positions-tbody">
                    <!-- Standardmäßig eine Zeile eintragen -->
                  </tbody>
                  <tfoot>
                    <tr class="table-light fw-extrabold text-primary" style="font-size:14px;">
                      <td colspan="4" class="text-end">Gesamtsumme (CHF):</td>
                      <td class="text-end font-monospace" id="rnc-total-sum">CHF 0.00</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- Submit -->
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="rnc-submit-btn">
                <i class="fas fa-check-circle me-1"></i> QR-Rechnung erstellen & Soll-Buchen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  // ID vorschlagen
  const nextRand = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById('rnc-invoice-id').value = `INV-${window._bhYear}-${nextRand}`;

  // Erste Zeile hinzufügen
  rncAddPositionRow("Miete Schützenhaus Muhen", 150);

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

// AUTOCOMPLETE SELECTOR HANDLER
window.rnHandleMemberSelect = function(val) {
  if (!val) {
    // Leeren
    document.getElementById('rnc-person-number').value = '';
    document.getElementById('rnc-name').value = '';
    document.getElementById('rnc-email').value = '';
    document.getElementById('rnc-strasse').value = '';
    document.getElementById('rnc-plz').value = '';
    document.getElementById('rnc-ort').value = '';
    return;
  }

  if (val.startsWith('MBR:')) {
    const personNumber = val.replace('MBR:', '');
    const m = window._mglData.find(x => String(x.PersonNumber) === String(personNumber));
    if (m) {
      document.getElementById('rnc-person-number').value = m.PersonNumber || '';
      document.getElementById('rnc-name').value = `${m.LastName} ${m.FirstName}`;
      document.getElementById('rnc-email').value = m.Email || '';
      document.getElementById('rnc-strasse').value = m.Street || m.Strasse || '';
      document.getElementById('rnc-plz').value = m.ZipCode || m.PLZ || '';
      document.getElementById('rnc-ort').value = m.City || m.Ort || '';
      
      // Typ auf Jahresbeitrag setzen falls nötig
      document.getElementById('rnc-type').value = 'Jahresbeitrag';
    }
  } else if (val.startsWith('EXT:')) {
    const idx = parseInt(val.replace('EXT:', ''), 10);
    const c = window._externalContacts[idx];
    if (c) {
      document.getElementById('rnc-person-number').value = ''; // keine Mitglieds-Nr
      document.getElementById('rnc-name').value = c.name || '';
      document.getElementById('rnc-email').value = c.email || '';
      document.getElementById('rnc-strasse').value = c.strasse || '';
      document.getElementById('rnc-plz').value = c.plz || '';
      document.getElementById('rnc-ort').value = c.ort || '';
      
      // Typ standardmäßig auf Vermietung für Externe setzen
      document.getElementById('rnc-type').value = 'Vermietung';
    }
  }
};

// POSITION ROW DYNAMIC FUNCTIONS
let rncPosCounter = 0;
window.rncAddPositionRow = function(desc = "", unitPrice = "", qty = 1) {
  rncPosCounter++;
  const tbody = document.getElementById('rnc-positions-tbody');
  if (!tbody) return;

  const initialAmount = (qty * (Number(unitPrice) || 0)).toFixed(2);

  const tr = document.createElement('tr');
  tr.id = `rnc-pos-row-${rncPosCounter}`;
  tr.innerHTML = `
    <td class="text-center font-monospace text-muted rnc-pos-idx">${tbody.children.length + 1}</td>
    <td>
      <input type="text" class="form-control form-control-sm rnc-pos-desc" required value="${desc}" placeholder="z.B. Getränkebezug Süsswasser">
    </td>
    <td>
      <input type="number" step="1" min="1" class="form-control form-control-sm text-end rnc-pos-qty" required value="${qty}" oninput="rncRecalculateRowTotal('${tr.id}')">
    </td>
    <td>
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-light text-muted">CHF</span>
        <input type="number" step="0.05" class="form-control form-control-sm text-end rnc-pos-unitprice" required value="${unitPrice}" placeholder="0.00" oninput="rncRecalculateRowTotal('${tr.id}')">
      </div>
    </td>
    <td>
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-light text-muted">CHF</span>
        <input type="number" class="form-control form-control-sm text-end fw-bold rnc-pos-amt bg-light" readonly value="${initialAmount}">
      </div>
    </td>
    <td class="text-center">
      <button type="button" class="btn btn-xs btn-outline-danger" onclick="rncRemovePositionRow('${tr.id}')">
        <i class="fas fa-trash-alt"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  rncRecalculateTotal();
};

window.rncRecalculateRowTotal = function(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const qty = Number(row.querySelector('.rnc-pos-qty').value || 1);
  const unitPrice = Number(row.querySelector('.rnc-pos-unitprice').value || 0);
  const amtEl = row.querySelector('.rnc-pos-amt');
  if (amtEl) {
    amtEl.value = (qty * unitPrice).toFixed(2);
  }
  rncRecalculateTotal();
};

window.rncRemovePositionRow = function(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    // Nummerierung korrigieren
    const idxs = document.querySelectorAll('.rnc-pos-idx');
    idxs.forEach((el, index) => el.textContent = index + 1);
    
    rncRecalculateTotal();
  }
};

// RECALCULATE TOTAL AMOUNT
window.rncRecalculateTotal = function() {
  const amts = document.querySelectorAll('.rnc-pos-amt');
  let sum = 0;
  amts.forEach(el => sum += Number(el.value || 0));

  const totalEl = document.getElementById('rnc-total-sum');
  if (totalEl) {
    totalEl.textContent = fmtChf(sum);
  }
};

// SAVE NEW MANUALLY INVOICE
window.rnSaveCreateInvoice = async function(event) {
  event.preventDefault();
  const btn = document.getElementById('rnc-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Erstelle QR-Rechnung & Buche...';
  }

  const invoiceId = document.getElementById('rnc-invoice-id').value;
  const name = document.getElementById('rnc-name').value.trim();
  const email = document.getElementById('rnc-email').value.trim();
  const strasse = document.getElementById('rnc-strasse').value.trim();
  const plz = document.getElementById('rnc-plz').value.trim();
  const ort = document.getElementById('rnc-ort').value.trim();
  
  const invoiceHeader = {
    id: invoiceId,
    PersonNumber: document.getElementById('rnc-person-number').value.trim(),
    name: name,
    year: Number(document.getElementById('rnc-year').value),
    type: document.getElementById('rnc-type').value,
    total_amount: 0 // Wird unten berechnet
  };

  const posRows = document.querySelectorAll('#rnc-positions-tbody tr');
  const positions = [];
  let totalAmount = 0;

  posRows.forEach((row, index) => {
    const desc = row.querySelector('.rnc-pos-desc').value.trim();
    const qty = Number(row.querySelector('.rnc-pos-qty').value || 1);
    const unitPrice = Number(row.querySelector('.rnc-pos-unitprice').value || 0);
    const amt = Number(row.querySelector('.rnc-pos-amt').value || (qty * unitPrice));
    positions.push({
      position_nr: index + 1,
      description: desc,
      quantity: qty,
      unit_price: unitPrice,
      amount: amt
    });
    totalAmount += amt;
  });

  invoiceHeader.total_amount = totalAmount;

  if (positions.length === 0) {
    alert("❌ Bitte fügen Sie mindestens eine Rechnungsposition hinzu.");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> QR-Rechnung erstellen & Soll-Buchen';
    }
    return;
  }

  const payload = {
    action: 'createInvoice',
    invoice: invoiceHeader,
    positions: positions,
    
    // Empfänger-Daten mitsenden für die PDF Generierung
    recipient: {
      vorname: name.split(' ')[0] || '',
      nachname: name.split(' ').slice(1).join(' ') || '',
      strasse: strasse,
      plz: plz,
      ort: ort,
      email: email
    }
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess(`🎉 Rechnung ${invoiceId} erfolgreich erstellt und remote verbucht!`);
      
      const modalEl = document.getElementById('rnModalCreateInvoice');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "Fehler beim Anlegen im Backend.");
    }
  } catch (err) {
    alert("❌ Fehler beim Erstellen der Rechnung: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> QR-Rechnung erstellen & Soll-Buchen';
    }
  }
};

// EDIT MANUALLY INVOICE MODAL
window.rnOpenEditModal = async function(invoiceId) {
  let modalEl = document.getElementById('rnModalEditInvoice');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalEditInvoice';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  // Lade Rechnungsdetails incl. Positionen abrufen
  showLoadingOverlay(`Lade Rechnung ${invoiceId}...`);
  let inv, positions;
  try {
    const res = await apiFetch('rechnungen', { action: 'getInvoiceDetails', invoiceId });
    const data = await res.json();
    if (data.success) {
      inv = data.invoice;
      positions = data.positions || [];
    } else {
      throw new Error(data.error || "Unerwarteter Fehler.");
    }
  } catch (err) {
    hideLoadingOverlay();
    alert("❌ Fehler beim Laden der Rechnungsdetails: " + err.message);
    return;
  }
  hideLoadingOverlay();

  // Suche Mitglied für Adresse
  const m = window._mglData.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-warning text-dark border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-edit me-2"></i>Rechnung bearbeiten (ID: ${inv.id})</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-edit-form" onsubmit="rnSaveEditInvoice(event, '${inv.id}')">
            
            <!-- Adressdaten -->
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-bold small text-muted">Mitglieds-Nr</label>
                <input type="text" class="form-control font-monospace bg-light" id="rne-person-number" readonly value="${inv.PersonNumber || ''}">
              </div>
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Name, Vorname (Empfänger)</label>
                <input type="text" class="form-control" id="rne-name" required value="${escapeHtml(inv.name || '')}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">E-Mail</label>
                <input type="email" class="form-control" id="rne-email" value="${escapeHtml(m.Email || '')}">
              </div>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-muted">Strasse, Nr.</label>
                <input type="text" class="form-control" id="rne-strasse" value="${escapeHtml(m.Street || m.Strasse || '')}">
              </div>
              <div class="col-md-2">
                <label class="form-label fw-bold small text-muted">PLZ</label>
                <input type="text" class="form-control font-monospace" id="rne-plz" value="${escapeHtml(m.ZipCode || m.PLZ || '')}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Ort</label>
                <input type="text" class="form-control" id="rne-ort" value="${escapeHtml(m.City || m.Ort || '')}">
              </div>
            </div>

            <!-- Rechnungs-Kopfdaten -->
            <div class="row g-3 mb-4 p-3 bg-light rounded-3 border border-light">
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungsjahr</label>
                <input type="number" class="form-control fw-bold font-monospace" id="rne-year" required value="${inv.year}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungstyp</label>
                <select class="form-select" id="rne-type" required>
                  <option value="Vermietung" ${inv.type === 'Vermietung' ? 'selected' : ''}>Vermietung</option>
                  <option value="Jahresbeitrag" ${inv.type === 'Jahresbeitrag' ? 'selected' : ''}>Jahresbeitrag / Mitglieder</option>
                  <option value="Schulsport" ${inv.type === 'Schulsport' ? 'selected' : ''}>Schulsport</option>
                  <option value="Sponsoring" ${inv.type === 'Sponsoring' ? 'selected' : ''}>Sponsoring / Gönner</option>
                  <option value="Sonstige" ${inv.type === 'Sonstige' ? 'selected' : ''}>Sonstige / Diverse</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungs-ID (Fixiert)</label>
                <input type="text" class="form-control fw-bold text-success font-monospace bg-light" id="rne-invoice-id" readonly value="${inv.id}">
              </div>
            </div>

            <!-- Positionen verfassen -->
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="fw-bold text-primary mb-0"><i class="fas fa-list me-1.5"></i>Rechnungspositionen</h6>
                <button type="button" class="btn btn-xs btn-outline-primary" onclick="rneAddPositionRow()">
                  <i class="fas fa-plus"></i> Pos hinzufügen
                </button>
              </div>

              <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle mb-0" style="font-size: 13px;">
                  <thead class="table-light">
                    <tr>
                      <th style="width: 40px;" class="text-center">#</th>
                      <th>Beschreibung der Dienstleistung / Ware</th>
                      <th style="width: 90px;" class="text-end">Menge</th>
                      <th style="width: 130px;" class="text-end">Einzelpreis</th>
                      <th style="width: 130px;" class="text-end">Gesamt (CHF)</th>
                      <th style="width: 50px;" class="text-center">Aktion</th>
                    </tr>
                  </thead>
                  <tbody id="rne-positions-tbody">
                    <!-- Wird dynamisch gefüllt -->
                  </tbody>
                  <tfoot>
                    <tr class="table-light fw-extrabold text-primary" style="font-size:14px;">
                      <td colspan="4" class="text-end">Gesamtsumme (CHF):</td>
                      <td class="text-end font-monospace" id="rne-total-sum">CHF 0.00</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- Warnhinweis bei Betragsänderungen -->
            <div class="alert alert-info text-start small mb-4 py-2 border-0" style="background-color: rgba(13, 110, 253, 0.08); border-radius: 12px; font-weight: 500;">
              <i class="fas fa-info-circle me-1 text-primary"></i>
              <strong>Hinweis:</strong> Falls sich der Gesamtbetrag ändert, passe bitte den Soll-Buchungssatz (Beleg: ${inv.id}) manuell in der Buchhaltung an.
            </div>

            <!-- Submit -->
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-warning py-2.5 fw-bold rounded-3 shadow-sm" id="rne-submit-btn">
                <i class="fas fa-save me-1"></i> Änderungen speichern & Buchen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  // Hilfsfunktionen deklarieren
  let rnePosCounter = 0;
  window.rneAddPositionRow = function(desc = "", unitPrice = "", qty = 1) {
    rnePosCounter++;
    const tbody = document.getElementById('rne-positions-tbody');
    if (!tbody) return;

    const initialAmount = (qty * (Number(unitPrice) || 0)).toFixed(2);

    const tr = document.createElement('tr');
    tr.id = `rne-pos-row-${rnePosCounter}`;
    tr.innerHTML = `
      <td class="text-center font-monospace text-muted rne-pos-idx">${tbody.children.length + 1}</td>
      <td>
        <input type="text" class="form-control form-control-sm rne-pos-desc" required value="${escapeHtml(desc)}" placeholder="z.B. Getränkebezug Süsswasser">
      </td>
      <td>
        <input type="number" step="1" min="1" class="form-control form-control-sm text-end rne-pos-qty" required value="${qty}" oninput="rneRecalculateRowTotal('${tr.id}')">
      </td>
      <td>
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted">CHF</span>
          <input type="number" step="0.05" class="form-control form-control-sm text-end rne-pos-unitprice" required value="${unitPrice}" placeholder="0.00" oninput="rneRecalculateRowTotal('${tr.id}')">
        </div>
      </td>
      <td>
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted">CHF</span>
          <input type="number" class="form-control form-control-sm text-end fw-bold rne-pos-amt bg-light" readonly value="${initialAmount}">
        </div>
      </td>
      <td class="text-center">
        <button type="button" class="btn btn-xs btn-outline-danger" onclick="rneRemovePositionRow('${tr.id}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
    rneRecalculateTotal();
  };

  window.rneRecalculateRowTotal = function(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const qty = Number(row.querySelector('.rne-pos-qty').value || 1);
    const unitPrice = Number(row.querySelector('.rne-pos-unitprice').value || 0);
    const amtEl = row.querySelector('.rne-pos-amt');
    if (amtEl) {
      amtEl.value = (qty * unitPrice).toFixed(2);
    }
    rneRecalculateTotal();
  };

  window.rneRemovePositionRow = function(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
      row.remove();
      const idxs = document.querySelectorAll('.rne-pos-idx');
      idxs.forEach((el, index) => el.textContent = index + 1);
      rneRecalculateTotal();
    }
  };

  window.rneRecalculateTotal = function() {
    const amts = document.querySelectorAll('.rne-pos-amt');
    let sum = 0;
    amts.forEach(el => sum += Number(el.value || 0));
    const totalEl = document.getElementById('rne-total-sum');
    if (totalEl) {
      totalEl.textContent = fmtChf(sum);
    }
  };

  // Vorhandene Positionen hinzufügen
  if (positions.length > 0) {
    positions.forEach(p => {
      rneAddPositionRow(p.description || '', p.unit_price || p.amount || 0, p.quantity || 1);
    });
  } else {
    rneAddPositionRow();
  }

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

// SAVE EDITED INVOICE
window.rnSaveEditInvoice = async function(event, invoiceId) {
  event.preventDefault();
  const btn = document.getElementById('rne-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere Änderungen...';
  }

  const name = document.getElementById('rne-name').value.trim();
  const email = document.getElementById('rne-email').value.trim();
  const strasse = document.getElementById('rne-strasse').value.trim();
  const plz = document.getElementById('rne-plz').value.trim();
  const ort = document.getElementById('rne-ort').value.trim();
  
  const invoiceHeader = {
    id: invoiceId,
    PersonNumber: document.getElementById('rne-person-number').value.trim(),
    name: name,
    year: Number(document.getElementById('rne-year').value),
    type: document.getElementById('rne-type').value,
    total_amount: 0
  };

  const posRows = document.querySelectorAll('#rne-positions-tbody tr');
  const positions = [];
  let totalAmount = 0;

  posRows.forEach((row, index) => {
    const desc = row.querySelector('.rne-pos-desc').value.trim();
    const qty = Number(row.querySelector('.rne-pos-qty').value || 1);
    const unitPrice = Number(row.querySelector('.rne-pos-unitprice').value || 0);
    const amt = Number(row.querySelector('.rne-pos-amt').value || (qty * unitPrice));
    positions.push({
      position_nr: index + 1,
      description: desc,
      quantity: qty,
      unit_price: unitPrice,
      amount: amt
    });
    totalAmount += amt;
  });

  invoiceHeader.total_amount = totalAmount;

  if (positions.length === 0) {
    alert("❌ Bitte fügen Sie mindestens eine Rechnungsposition hinzu.");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Änderungen speichern & Buchen';
    }
    return;
  }

  const payload = {
    action: 'updateInvoice',
    invoice: invoiceHeader,
    positions: positions,
    recipient: {
      vorname: name.split(' ')[0] || '',
      nachname: name.split(' ').slice(1).join(' ') || '',
      strasse: strasse,
      plz: plz,
      ort: ort,
      email: email
    }
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess(`🎉 Rechnung ${invoiceId} erfolgreich aktualisiert!`);
      const modalEl = document.getElementById('rnModalEditInvoice');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "Fehler beim Aktualisieren im Backend.");
    }
  } catch (err) {
    alert("❌ Fehler beim Aktualisieren der Rechnung: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Änderungen speichern & Buchen';
    }
  }
};

// DELETE INVOICE PROMPT
window.rnDeleteInvoicePrompt = async function(invoiceId) {
  if (!confirm(`⚠️ Möchtest du die offene Rechnung ${invoiceId} wirklich unwiderruflich löschen?\n\nDadurch werden die Rechnungsdaten und alle Positionen in der Tabelle gelöscht.`)) {
    return;
  }

  showLoadingOverlay(`Lösche Rechnung ${invoiceId}...`);
  try {
    const response = await apiFetch('rechnungen', { action: 'deleteInvoice', invoiceId }, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess(`🎉 Rechnung ${invoiceId} wurde erfolgreich gelöscht!`);
      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "Fehler beim Löschen im Backend.");
    }
  } catch (err) {
    alert("❌ Fehler beim Löschen der Rechnung: " + err.message);
  } finally {
    hideLoadingOverlay();
  }
};
