// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - UI
// =====================================================================

// RBAC-Schutz auf dynamisch gerenderte Container anwenden
window.rnApplyWriteProtection = function(rootEl) {
  if (!rootEl || typeof window.applyModuleWriteProtection !== 'function') return;
  const canWrite = typeof window.hasWriteAccess === 'function' ? window.hasWriteAccess('rechnungen') : true;
  window.applyModuleWriteProtection(rootEl, canWrite);
};

// Einheitliche Versand-Prüfung (kanonisch 'versendet', abwärtskompatibel 'gesendet')
window.rnIsInvoiceSent = function(inv) {
  if (!inv) return false;
  const ms = String(inv.mail_status || '').toLowerCase();
  return ms === 'versendet' || ms === 'gesendet' || Boolean(inv.send_date);
};

// Überfälligkeit in Tagen berechnen (primär über due_date, sonst > 30 Tage ab created_at)
window.rnGetOverdueDays = function(inv, nowRef) {
  if (!inv) return 0;
  const now = nowRef || new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const parseLocalDate = (raw) => {
    if (!raw) return null;
    const part = String(raw).split('T')[0].split(' ')[0].trim();
    if (part.includes('.')) {
      const p = part.split('.');
      if (p.length === 3) return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
    } else if (part.includes('-')) {
      const p = part.split('-');
      if (p.length === 3) return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
    }
    return null;
  };
  if (inv.due_date) {
    const dueMs = parseLocalDate(inv.due_date);
    if (dueMs && !isNaN(dueMs) && todayStart > dueMs) {
      return Math.ceil((todayStart - dueMs) / (1000 * 60 * 60 * 24));
    }
    return 0;
  }
  const createdMs = parseLocalDate(inv.created_at);
  if (createdMs && !isNaN(createdMs)) {
    const ageDays = Math.ceil((todayStart - createdMs) / (1000 * 60 * 60 * 24));
    if (ageDays > 30) return ageDays - 30;
  }
  return 0;
};

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
      position: relative !important;
      white-space: nowrap !important;
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
  const templates = window._invoiceTemplates;
  
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
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'offen' || window._rechnungenActiveTab === 'revision' ? 'active' : ''}" id="rn-tab-btn-offen" onclick="rnSwitchTab('offen')">
          <i class="fas fa-calculator me-1.5"></i> Revision & Auswertungen
        </button>
        <button class="bh-tab-btn ${window._rechnungenActiveTab === 'templates' ? 'active' : ''}" id="rn-tab-btn-templates" onclick="rnSwitchTab('templates')">
          <i class="fas fa-boxes-stacked me-1.5"></i> Artikelstamm & Positionen
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
  } else if (window._rechnungenActiveTab === 'offen' || window._rechnungenActiveTab === 'revision') {
    if (typeof renderTabRevision === 'function') {
      renderTabRevision(content);
    } else {
      renderTabOffenePosten(content);
    }
  } else {
    window._rechnungenActiveTab = 'archiv';
    renderTabArchiv(content);
  }
  rnApplyWriteProtection(content);
};

window.renderTabArchiv = function(content) {
  // 1. Berechne KPIs (stornierte Rechnungen fliessen nicht in offene/aktive Summen ein)
  const allRaw = window._invoices || [];
  const cancelledInvoices = allRaw.filter(i => String(i.status || '').toLowerCase() === 'storniert');
  const cancelledCount = cancelledInvoices.length;
  const activeInvoices = allRaw.filter(i => String(i.status || '').toLowerCase() !== 'storniert');
  const totalCount = activeInvoices.length;

  const openInvoices = activeInvoices.filter(i => String(i.status || '').toLowerCase() !== 'bezahlt');
  const openCount = openInvoices.length;
  const openSum = openInvoices.reduce((s, i) => s + Number(i.open_amount !== undefined ? i.open_amount : (i.total_amount || 0)), 0);
  
  const paidInvoices = activeInvoices.filter(i => String(i.status || '').toLowerCase() === 'bezahlt');
  const paidCount = paidInvoices.length;
  const paidSum = paidInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalActiveSum = activeInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  // Überfällige Rechnungen (due_date überschritten bzw. > 30 Tage und unbezahlt)
  const now = new Date();
  const dueInvoices = openInvoices.filter(item => rnGetOverdueDays(item, now) > 0);
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
          <h2 class="fw-bold mt-1 mb-0 text-danger">${fmtChf(openSum)}</h2>
          <div class="small text-muted mt-1">
            ${openCount} offene Rechnungen ${dueCount > 0 ? `<span class="badge bg-danger text-white ms-1" title="${dueCount} überfällige Rechnungen"><i class="fas fa-clock me-0.5"></i>${dueCount} überfällig</span>` : ''}
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
          <h2 class="fw-bold mt-1 mb-0 text-success">${fmtChf(paidSum)}</h2>
          <div class="small text-muted mt-1">${paidCount} bezahlte Rechnungen</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card info shadow-sm rn-kpi-clickable ${window._invoicesFilterStatus === 'alle' ? 'rn-kpi-active' : ''}" 
             data-kpi-status="alle" onclick="rnToggleFilterKpi('alle')" title="Klicken, um alle aktiven Rechnungen anzuzeigen">
          <div class="d-flex justify-content-between align-items-center">
            <div class="small text-muted fw-semibold">Gesamte Fakturierung</div>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle small px-2 py-0.5 rounded-pill">
              <i class="fas fa-list me-1"></i>Alle
            </span>
          </div>
          <h2 class="fw-bold mt-1 mb-0 text-dark">${fmtChf(totalActiveSum)}</h2>
          <div class="small text-muted mt-1">${totalCount} aktive Rechnungen${cancelledCount > 0 ? ` (${cancelledCount} storniert)` : ''}</div>
        </div>
      </div>
    </div>

    <!-- Steuerung & Filter -->
    <div class="bh-report-section border border-light shadow-sm mb-4">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap:15px;">
        <h5 class="fw-bold text-primary mb-0"><i class="fas fa-filter me-2"></i>Filter & Rechnungs-Archiv</h5>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <div id="rn-column-toggle" class="d-inline-block"></div>
          <button class="btn btn-sm btn-outline-success fw-bold shadow-sm" onclick="rnExportArchivToExcel()" title="Aktuell gefilterte Rechnungen als Excel-Datei (.xlsx) exportieren">
            <i class="fas fa-file-excel me-1"></i> Excel Export
          </button>
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
      <div class="d-flex flex-wrap gap-1.5 mb-3 align-items-center" id="rn-filter-pills">
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'alle' ? 'btn-primary text-white active' : 'btn-outline-secondary'}" data-status="alle" onclick="rnChangeFilterStatus('alle')">
          Alle (${totalCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'offen' ? 'btn-danger text-white active' : 'btn-outline-danger'}" data-status="offen" onclick="rnChangeFilterStatus('offen')">
          <i class="fas fa-clock me-1"></i>Offen (${openCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'faellig' ? 'btn-warning text-dark active' : 'btn-outline-warning text-dark'}" data-status="faellig" onclick="rnChangeFilterStatus('faellig')">
          <i class="fas fa-exclamation-circle me-1 text-danger"></i>Überfällig (${dueCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'gemahnt' ? 'btn-warning text-dark active' : 'btn-outline-warning text-dark'}" data-status="gemahnt" onclick="rnChangeFilterStatus('gemahnt')">
          <i class="fas fa-bullhorn me-1"></i>Gemahnt (${dunningCount})
        </button>
        <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'bezahlt' ? 'btn-success text-white active' : 'btn-outline-success'}" data-status="bezahlt" onclick="rnChangeFilterStatus('bezahlt')">
          <i class="fas fa-check-circle me-1"></i>Bezahlt (${paidCount})
        </button>
        ${window._invoicesShowCancelled ? `
          <button type="button" class="btn btn-xs rn-status-pill ${window._invoicesFilterStatus === 'storniert' ? 'btn-dark text-white active' : 'btn-outline-dark'}" data-status="storniert" onclick="rnChangeFilterStatus('storniert')">
            <i class="fas fa-ban me-1"></i>Storniert (${cancelledCount})
          </button>
        ` : ''}
        ${cancelledCount > 0 ? `
          <button type="button" id="rn-toggle-cancelled-btn" class="btn btn-xs ${window._invoicesShowCancelled ? 'btn-dark text-white' : 'btn-outline-secondary'} ms-auto" onclick="rnToggleShowCancelled()" title="Stornierte Rechnungen ein- oder ausblenden">
            <i class="fas fa-ban me-1"></i>${window._invoicesShowCancelled ? 'Stornierte ausblenden' : 'Stornierte einblenden'} (${cancelledCount})
          </button>
        ` : ''}
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
              <option value="faellig" ${window._invoicesFilterStatus === 'faellig' ? 'selected' : ''}>Überfällig</option>
              <option value="gemahnt" ${window._invoicesFilterStatus === 'gemahnt' ? 'selected' : ''}>Gemahnt (Stufe 1–3)</option>
              <option value="bezahlt" ${window._invoicesFilterStatus === 'bezahlt' ? 'selected' : ''}>Bezahlt</option>
              ${window._invoicesShowCancelled ? `<option value="storniert" ${window._invoicesFilterStatus === 'storniert' ? 'selected' : ''}>Storniert</option>` : ''}
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
          <button class="btn btn-sm btn-primary fw-bold shadow-sm write-protected" onclick="rnStartMassSendFromSelection()">
            <i class="fas fa-paper-plane me-1"></i> Massenversand für Auswahl starten
          </button>
          <button class="btn btn-sm btn-outline-danger fw-bold shadow-sm write-protected" onclick="rnDeleteSelectedInvoices()">
            <i class="fas fa-trash-alt me-1"></i> Ausgewählte löschen
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
              <th data-col-id="check" data-col-name="Auswahl" style="width: 44px;" class="text-center">
                <input type="checkbox" class="form-check-input" id="rn-table-select-all" title="Alle sichtbaren Rechnungen auswählen" onchange="rnToggleTableSelectAll(this.checked)">
              </th>
              <th data-col-id="id" data-col-name="Rechnungs-ID" class="bh-sort-header" onclick="rnSortInvoices('id')" style="width: 145px;">Rechnungs-ID ${rnGetSortIndicator('id')}</th>
              <th data-col-id="name" data-col-name="Empfänger" class="bh-sort-header" onclick="rnSortInvoices('name')">Empfänger ${rnGetSortIndicator('name')}</th>
              <th data-col-id="created_at" data-col-name="Rechnungsdatum" class="bh-sort-header" onclick="rnSortInvoices('created_at')" style="width: 130px;" title="Datum der Rechnungserstellung (Fakturierung)">Rechnungsdatum ${rnGetSortIndicator('created_at')}</th>
              <th data-col-id="send_date" data-col-name="Versanddatum" class="bh-sort-header" onclick="rnSortInvoices('send_date')" style="width: 130px;" title="Datum des E-Mail-Versands">Versanddatum ${rnGetSortIndicator('send_date')}</th>
              <th data-col-id="year" data-col-name="Jahr" class="bh-sort-header" onclick="rnSortInvoices('year')" style="width: 80px;">Jahr ${rnGetSortIndicator('year')}</th>
              <th data-col-id="type" data-col-name="Typ" class="bh-sort-header" onclick="rnSortInvoices('type')" style="width: 130px;">Typ ${rnGetSortIndicator('type')}</th>
              <th data-col-id="status" data-col-name="Status" class="bh-sort-header text-center" onclick="rnSortInvoices('status')" style="width: 140px;">Status ${rnGetSortIndicator('status')}</th>
              <th data-col-id="amount" data-col-name="Betrag" class="bh-sort-header text-end" onclick="rnSortInvoices('total_amount')" style="width: 135px;">Betrag ${rnGetSortIndicator('total_amount')}</th>
              <th data-col-id="actions" data-col-name="Aktionen" class="text-end" style="width: 150px;">Aktionen</th>
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
      String(i.PersonNumber).toLowerCase().includes(query) ||
      String(i.send_date || '').toLowerCase().includes(query) ||
      String(i.created_at || '').toLowerCase().includes(query);

    const st = String(i.status || '').toLowerCase();
    const isPaid = st === 'bezahlt';
    const isCancelled = st === 'storniert';

    // Standardmässig stornierte Rechnungen ausblenden (ausser explizit eingeblendet oder Status 'storniert' gewählt)
    if (isCancelled && !window._invoicesShowCancelled && window._invoicesFilterStatus !== 'storniert') {
      return false;
    }

    let mStufe = Number(i.mahnstufe || 0);
    if (!mStufe) {
      if (st === 'gemahnt') mStufe = 1;
      else if (st === '2' || st.includes('2. mahnung') || st.includes('stufe 2')) mStufe = 2;
      else if (st === '3' || st.includes('3. mahnung') || st.includes('stufe 3') || st.includes('letzte')) mStufe = 3;
      else if (st.includes('mahn') || st.includes('erinnerung')) mStufe = 1;
    }

    // Frist prüfen (für überfällig)
    const overdueDays = (!isPaid && !isCancelled) ? rnGetOverdueDays(i, now) : 0;
    const isOverdue = overdueDays > 0;

    let matchesStatus = true;
    if (window._invoicesFilterStatus === 'offen') {
      matchesStatus = !isPaid && !isCancelled;
    } else if (window._invoicesFilterStatus === 'faellig') {
      matchesStatus = !isPaid && !isCancelled && isOverdue;
    } else if (window._invoicesFilterStatus === 'gemahnt') {
      matchesStatus = !isPaid && !isCancelled && (st === 'gemahnt' || mStufe > 0 || st.includes('mahn') || st === '2' || st === '3');
    } else if (window._invoicesFilterStatus === 'bezahlt') {
      matchesStatus = isPaid;
    } else if (window._invoicesFilterStatus === 'storniert') {
      matchesStatus = isCancelled;
    }

    const filterType = String(window._invoicesFilterType || 'alle').toLowerCase();
    const matchesType = filterType === 'alle' || 
      String(i.type || '').toLowerCase().includes(filterType) ||
      String(i.source_module || '').toLowerCase().includes(filterType);

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
    } else if (col === 'created_at' || col === 'send_date') {
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
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Keine passenden Rechnungen gefunden.</td></tr>`;
    if (typeof rnOnTableRowSelectChange === 'function') rnOnTableRowSelectChange();
    return;
  }

  tbody.innerHTML = list.map(item => {
    const st = String(item.status || '').toLowerCase();
    const isPaid = st === 'bezahlt';
    const isCancelled = st === 'storniert';
    const isSent = rnIsInvoiceSent(item);
    const hasPayments = Number(item.total_paid || 0) > 0;
    const restAmount = Number(item.open_amount !== undefined ? item.open_amount : (item.total_amount || 0));
    const canEdit = !isPaid && !isCancelled && !hasPayments && !isSent && item.type !== 'Jahresbeitrag';
    const canDelete = !isPaid && !isCancelled && !hasPayments;

    let mStufe = Number(item.mahnstufe || 0);
    if (!mStufe) {
      if (st === 'gemahnt') mStufe = 1;
      else if (st === '2' || st.includes('2. mahnung') || st.includes('stufe 2')) mStufe = 2;
      else if (st === '3' || st.includes('3. mahnung') || st.includes('stufe 3') || st.includes('letzte')) mStufe = 3;
      else if (st.includes('mahn') || st.includes('erinnerung')) mStufe = 1;
    }
    
    // Differenzierte Statusanzeige nach Schweizer 3-Stufen-Mahnwesen & neuem Lifecycle
    let statusBadge = '';
    if (isPaid) {
      statusBadge = '<span class="badge bg-success px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;"><i class="fas fa-check-circle me-1"></i>Bezahlt</span>';
    } else if (st === 'teilbezahlt') {
      const restChf = fmtChf(restAmount);
      statusBadge = `<span class="badge bg-info text-dark px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;" title="Restbetrag: ${restChf}"><i class="fas fa-adjust me-1"></i>Teilbezahlt (${restChf})</span>`;
    } else if (st === 'entwurf') {
      statusBadge = '<span class="badge bg-light text-dark border px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;"><i class="fas fa-file-signature me-1"></i>Entwurf</span>';
    } else if (isCancelled) {
      statusBadge = '<span class="badge bg-dark text-white px-2.5 py-1.5 rounded-pill" style="font-size:12.5px;"><i class="fas fa-ban me-1"></i>Storniert</span>';
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
    if (!isPaid && !isCancelled) {
      const overdueDays = rnGetOverdueDays(item, now);
      if (overdueDays > 0 && mStufe === 0) {
        extraBadge = `<span class="badge bg-danger ms-1" style="font-size:11px;" title="Überfällig seit ${overdueDays} Tagen"><i class="fas fa-clock me-0.5"></i>Fällig (${overdueDays}d)</span>`;
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

    const mailSentBadge = isSent
      ? `<span class="badge bg-success-subtle text-success border border-success-subtle ms-1" style="font-size:11px;" title="Rechnung wurde per E-Mail versendet${item.send_date ? ' am ' + escapeHtml(item.send_date) : ''}"><i class="fas fa-check me-0.5"></i>Mail versendet</span>`
      : '';

    const createdDisplay = typeof isoToDisplay === 'function'
      ? (isoToDisplay(item.created_at) || '–')
      : (item.created_at ? escapeHtml(String(item.created_at).split(' ')[0]) : '–');

    let sendDisplay = '–';
    if (item.send_date) {
      const sRaw = String(item.send_date).trim();
      if (typeof isoToDisplay === 'function' && sRaw.includes('T')) {
        sendDisplay = isoToDisplay(sRaw) || sRaw;
      } else {
        sendDisplay = escapeHtml(sRaw);
      }
    } else if (isSent) {
      sendDisplay = '<span class="text-success small fst-italic" title="Rechnung versendet (Datum nicht hinterlegt)"><i class="fas fa-check me-1"></i>versendet</span>';
    }

    const safeIdHtml = escapeHtml(item.id);
    const safeIdJs = escapeJs(item.id);

    return `
      <tr class="bh-account-row ${isCancelled ? 'opacity-75' : ''}" id="rn-row-${safeIdHtml}">
        <td data-col-id="check" class="text-center tk-col-check" onclick="event.stopPropagation()">
          <input type="checkbox" class="form-check-input rn-table-row-check" data-id="${safeIdHtml}" value="${safeIdHtml}" onchange="rnOnTableRowSelectChange()">
        </td>
        <td data-col-id="id" class="tk-col-id">
          <span class="bh-konto-badge bh-konto-soll-badge rn-id-badge" style="cursor: pointer;" onclick="rnOpenDetailsModal('${safeIdJs}')" title="Klicken für Rechnungsdetails">
            ${safeIdHtml}
          </span>
        </td>
        <td data-col-id="name" class="tk-col-name">
          <div class="fw-bold text-dark mb-0 rn-recipient-name">
            ${escapeHtml(item.name)}
            ${mailSentBadge}
          </div>
          ${numberLabel}
        </td>
        <td data-col-id="created_at" class="text-muted font-monospace tk-col-created_at" style="font-size: 13px;" title="Rechnungsdatum: ${createdDisplay}">${createdDisplay}</td>
        <td data-col-id="send_date" class="text-muted font-monospace tk-col-send_date" style="font-size: 13px;" title="${item.send_date ? 'Versandt am: ' + escapeHtml(item.send_date) : (isSent ? 'Rechnung wurde versendet' : 'Noch nicht versendet')}">
          ${item.send_date ? `<span class="text-dark"><i class="fas fa-paper-plane text-success me-1" style="font-size:11px;"></i>${sendDisplay}</span>` : sendDisplay}
        </td>
        <td data-col-id="year" class="text-muted font-monospace tk-col-year" style="font-size: 14px; font-weight: 500;">${escapeHtml(item.year)}</td>
        <td data-col-id="type" class="tk-col-type">
          <span class="badge bg-light text-dark border" style="font-size: 12.5px; padding: 5px 10px;">
            ${escapeHtml(item.type)}
            ${item.type === 'Jahresbeitrag' ? '<i class="fas fa-lock text-warning ms-1" title="Jahresbeitrag – synchronisiert über Jahresbeitragsmodul"></i>' : ''}
          </span>
        </td>
        <td data-col-id="status" class="text-center tk-col-status">
          ${statusBadge}
          ${extraBadge}
        </td>
        <td data-col-id="amount" class="text-end fw-bold text-primary font-monospace rn-amount-cell tk-col-amount">${fmtChf(item.total_amount)}</td>
        <td data-col-id="actions" class="text-end tk-col-actions" style="white-space: nowrap; width: 160px;">
          <div class="d-inline-flex align-items-center gap-1.5 justify-content-end">
            ${item.pdf_url ? `
              <a href="${escapeHtml(item.pdf_url)}" onclick="rnOpenInvoicePdf('${safeIdJs}', '${escapeJs(item.pdf_url)}', '${escapeJs(item.name)}', event)" target="_blank" class="btn btn-sm btn-outline-danger shadow-xs fw-semibold px-2 py-1" title="PDF QR-Rechnung herunterladen / im Browser ansehen">
                <i class="fas fa-file-pdf me-1"></i>PDF
              </a>
            ` : (!isCancelled ? `
              <button class="btn btn-sm btn-outline-secondary write-protected shadow-xs px-2 py-1" onclick="rnGeneratePDFOnly('${safeIdJs}', '${escapeJs(item.name)}')" title="PDF QR-Rechnung generieren">
                <i class="fas fa-cog me-1"></i>PDF
              </button>
            ` : '')}

            ${!isCancelled ? `
              <button class="btn btn-sm btn-outline-primary write-protected shadow-xs px-2 py-1" onclick="rnSendMailPrompt('${safeIdJs}', '${escapeJs(item.name)}')" title="QR-Rechnung per E-Mail versenden">
                <i class="fas fa-paper-plane"></i>
              </button>
            ` : ''}

            <div class="dropdown d-inline-block">
              <button class="btn btn-sm btn-light border shadow-xs px-2 py-1" type="button" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false" title="Weitere Aktionen für ${safeIdHtml}">
                <i class="fas fa-ellipsis-v text-muted"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow border-0 py-1" style="font-size: 13px; min-width: 230px; z-index: 1055;">
                <li>
                  <a class="dropdown-item py-2" href="#" onclick="rnOpenDetailsModal('${safeIdJs}'); return false;">
                    <i class="fas fa-eye text-primary me-2 fa-fw"></i>Details einsehen
                  </a>
                </li>
                ${(!isPaid && !isCancelled) ? `
                  <li>
                    <a class="dropdown-item py-2 write-protected" href="#" onclick="rnOpenPaymentModal('${safeIdJs}', ${restAmount}); return false;">
                      <i class="fas fa-coins text-success me-2 fa-fw"></i>Zahlung erfassen...
                    </a>
                  </li>
                  <li>
                    <a class="dropdown-item py-2 write-protected" href="#" onclick="rnOpenMahnungModal('${safeIdJs}', '${escapeJs(item.name)}'); return false;">
                      <i class="fas fa-exclamation-triangle text-warning me-2 fa-fw"></i>Mahnung verwalten...
                    </a>
                  </li>
                ` : ''}
                ${!isCancelled ? `
                  <li><hr class="dropdown-divider my-1"></li>
                  <li>
                    <a class="dropdown-item py-2 write-protected" href="#" onclick="rnGeneratePDFOnly('${safeIdJs}', '${escapeJs(item.name)}'); return false;">
                      <i class="fas fa-sync text-secondary me-2 fa-fw"></i>PDF neu generieren
                    </a>
                  </li>
                ` : ''}
                ${item.type === 'Jahresbeitrag' ? `
                  <li>
                    <a class="dropdown-item py-2" href="#" onclick="rnJumpToJahresbeitrag('${escapeJs(item.PersonNumber || '')}'); return false;">
                      <i class="fas fa-lock text-warning me-2 fa-fw"></i>In Jahresbeitrag öffnen
                    </a>
                  </li>
                ` : `
                  ${(!isPaid && !isCancelled) ? (canEdit ? `
                    <li>
                      <a class="dropdown-item py-2 write-protected" href="#" onclick="rnOpenEditModal('${safeIdJs}'); return false;">
                        <i class="fas fa-edit text-info me-2 fa-fw"></i>Rechnung bearbeiten
                      </a>
                    </li>
                  ` : `
                    <li>
                      <span class="dropdown-item py-2 text-muted" title="${hasPayments ? 'Rechnung hat bereits erfasste Zahlungen und ist gesperrt.' : 'Rechnung wurde bereits versandt und kann inhaltlich nicht mehr verändert werden.'}">
                        <i class="fas fa-lock text-muted me-2 fa-fw"></i>Bearbeiten gesperrt (${hasPayments ? 'Teilzahlung' : 'versandt'})
                      </span>
                    </li>
                  `) : ''}
                `}
                ${(!isPaid && !isCancelled && !hasPayments) ? `
                  <li><hr class="dropdown-divider my-1"></li>
                  <li>
                    <a class="dropdown-item py-2 text-warning-emphasis write-protected" href="#" onclick="rnCancelInvoicePrompt('${safeIdJs}'); return false;">
                      <i class="fas fa-ban text-warning me-2 fa-fw"></i>Rechnung stornieren...
                    </a>
                  </li>
                ` : ''}
                ${canDelete ? `
                  <li>
                    <a class="dropdown-item py-2 text-danger write-protected" href="#" onclick="rnDeleteInvoicePrompt('${safeIdJs}'); return false;">
                      <i class="fas fa-trash-alt me-2 fa-fw"></i>Rechnung löschen
                    </a>
                  </li>
                ` : ''}
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  rnApplyWriteProtection(tbody);

  if (typeof rnOnTableRowSelectChange === 'function') {
    rnOnTableRowSelectChange();
  }

  if (window.TableKit && typeof window.TableKit.initTable === 'function') {
    window._rnInvoicesTableController = window.TableKit.initTable('#rn-invoices-table', {
      id: 'rn_invoices_table',
      storageKeyWidths: 'rn_invoices_table_col_widths',
      storageKeyOrder: 'rn_invoices_table_col_order',
      storageKeyCols: 'rn_invoices_table_cols',
      resizable: {
        minWidth: 45,
        columns: {
          check: { resizable: false, minWidth: 44, defaultWidth: 44 },
          actions: { minWidth: 100, defaultWidth: 150 }
        }
      },
      reorderable: {
        lockedColumns: ['check', 'actions']
      },
      columnToggle: '#rn-column-toggle'
    });
  }
};

window.rnTransitionFromDetails = function(targetFn) {
  const modalEl = document.getElementById('rnModalInvoiceDetails');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) {
      modalEl.addEventListener('hidden.bs.modal', () => {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        if (typeof targetFn === 'function') targetFn();
      }, { once: true });
      bsModal.hide();
      return;
    }
  }
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  if (typeof targetFn === 'function') targetFn();
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
          <h5 class="modal-title fw-bold"><i class="fas fa-receipt me-2"></i>Rechnungsdetails (ID: ${escapeHtml(invoiceId)})</h5>
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
    let inv = (window._invoices || []).find(i => String(i.id).trim() === String(invoiceId).trim());
    let positions = (window._invoicePositionsCache && window._invoicePositionsCache[String(invoiceId).trim()]) || [];

    const supa = (typeof getRechnungenSupabaseClient === 'function') ? getRechnungenSupabaseClient() : (window.supabaseClient || null);
    if (supa) {
      if (!inv) {
        const { data: invRow } = await supa.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
        if (invRow) {
          inv = (typeof mapInvoiceFromSupabase === 'function') ? mapInvoiceFromSupabase(invRow) : invRow;
        }
      }
      if (!positions || positions.length === 0) {
        const { data: posData } = await supa.from('invoice_positions').select('*').eq('invoice_id', invoiceId).order('position_nr', { ascending: true });
        if (posData && posData.length > 0) {
          positions = (typeof mapPositionFromSupabase === 'function') ? posData.map(mapPositionFromSupabase) : posData;
          if (!window._invoicePositionsCache) window._invoicePositionsCache = {};
          window._invoicePositionsCache[String(invoiceId).trim()] = positions;
        }
      }
    }

    if (!inv) {
      throw new Error(`Rechnung ${invoiceId} wurde im System nicht gefunden.`);
    }

    if (!positions || positions.length === 0) {
      positions = [{
        position_nr: 1,
        description: inv.type || 'Rechnungsposition',
        quantity: 1,
        unit_price: Number(inv.total_amount || 0),
        amount: Number(inv.total_amount || 0),
        type: 'standard'
      }];
    }

    if (true) {
      const invSt = String(inv.status || '').toLowerCase();
      const invIsPaid = invSt === 'bezahlt';
      const invIsCancelled = invSt === 'storniert';
      const invIsSent = rnIsInvoiceSent(inv);
      const invHasPayments = Number(inv.total_paid || 0) > 0;
      const invRestAmount = Number(inv.open_amount !== undefined ? inv.open_amount : (inv.total_amount || 0));
      const invCanEdit = !invIsPaid && !invIsCancelled && !invHasPayments && !invIsSent && inv.type !== 'Jahresbeitrag';
      const invCanDelete = !invIsPaid && !invIsCancelled && !invHasPayments;
      const safeInvIdJs = escapeJs(inv.id);
      const safeInvNameJs = escapeJs(inv.name);
      const statusPillClass = invIsPaid ? 'bg-success' : (invIsCancelled ? 'bg-dark text-white' : (invSt === 'teilbezahlt' ? 'bg-info text-dark' : 'bg-warning text-dark'));

      const posRows = positions.map(p => {
        const qty = Number(p.quantity || 1);
        const up = Number(p.unit_price || p.amount || 0);
        let qtyStr = '';
        if (qty > 1) {
          qtyStr = `<br><small class="text-muted font-monospace">${qty} Einheiten à ${fmtChf(up)}</small>`;
        }
        return `
        <tr>
          <td class="font-monospace text-muted tk-col-pos" style="width: 50px;">#${escapeHtml(p.position_nr)}</td>
          <td class="fw-semibold tk-col-desc">
            ${escapeHtml(p.description)}
            ${qtyStr}
          </td>
          <td class="text-muted text-center tk-col-type">${escapeHtml(p.type)}</td>
          <td class="text-end fw-bold text-dark font-monospace tk-col-amount">${fmtChf(p.amount)}</td>
        </tr>
      `;
      }).join('');

      document.getElementById('rn-details-modal-body').innerHTML = `
        <div class="row g-3 mb-4 pb-3 border-bottom">
          <div class="col-6">
            <div class="small text-muted fw-semibold">Rechnungsempfänger:</div>
            <h5 class="fw-bold text-dark mt-1 mb-0">${escapeHtml(inv.name)}</h5>
            ${inv.PersonNumber ? `<span class="badge bg-secondary mt-1">Mitglieds-Nr: ${escapeHtml(inv.PersonNumber)}</span>` : ''}
          </div>
          <div class="col-6 text-end">
            <div class="small text-muted fw-semibold">Status:</div>
            <span class="badge ${statusPillClass} px-2.5 py-1.5 rounded-pill mt-1 fw-bold">${escapeHtml(inv.status)}</span>
            <div class="text-muted small mt-1 font-monospace" style="font-size:11px;">Rechnungsdatum: ${escapeHtml(inv.created_at || '–')}</div>
            <div class="text-muted small font-monospace" style="font-size:11px;">Versanddatum: ${inv.send_date ? escapeHtml(inv.send_date) : (invIsSent ? '<span class="text-success"><i class="fas fa-check me-0.5"></i>versendet</span>' : '–')}</div>
          </div>
        </div>

        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="fw-bold text-primary mb-0"><i class="fas fa-list me-1.5"></i>Rechnungspositionen</h6>
            <div id="rn-detail-col-toggle"></div>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped table-hover align-middle mb-0" id="rn-detail-positions-table" style="font-size: 13px;">
              <thead class="table-light">
                <tr>
                  <th data-col-id="pos" data-col-name="Pos">Pos</th>
                  <th data-col-id="desc" data-col-name="Beschreibung">Beschreibung</th>
                  <th data-col-id="type" data-col-name="Typ" class="text-center" style="width: 80px;">Typ</th>
                  <th data-col-id="amount" data-col-name="Betrag" class="text-end" style="width: 150px;">Betrag</th>
                </tr>
              </thead>
              <tbody>
                ${posRows.length > 0 ? posRows : '<tr><td colspan="4" class="text-center text-muted">Keine Positionen erfasst.</td></tr>'}
                <tr class="table-light fw-extrabold" style="border-top: 2px solid #343a40;">
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
              <div class="small text-muted mt-0.5">Methode: ${escapeHtml(inv.payment_method || 'Überweisung')}</div>
            </div>
            <div class="text-end text-success-emphasis font-monospace" style="font-size:12px;">
              Datum: ${escapeHtml(isoToDisplay(inv.payment_date))}<br>
              Beleg: ${escapeHtml(inv.document_ref || 'unbekannt')}
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
              <a href="${escapeHtml(inv.pdf_url)}" onclick="rnOpenInvoicePdf('${safeInvIdJs}', '${escapeJs(inv.pdf_url)}', '${safeInvNameJs}', event)" target="_blank" class="btn btn-sm btn-outline-danger fw-semibold">
                <i class="fas fa-file-pdf me-1.5"></i>PDF öffnen
              </a>
            ` : (!invIsCancelled ? `
              <button class="btn btn-sm btn-outline-secondary write-protected" onclick="rnGeneratePDFOnly('${safeInvIdJs}', '${safeInvNameJs}')">
                <i class="fas fa-cog me-1.5"></i>PDF erstellen
              </button>
            ` : '')}
            ${!invIsCancelled ? `
              <button class="btn btn-sm btn-outline-primary write-protected" onclick="rnTransitionFromDetails(() => rnSendMailPrompt('${safeInvIdJs}', '${safeInvNameJs}'))">
                <i class="fas fa-envelope me-1.5"></i>E-Mail senden
              </button>
            ` : ''}
            ${(!invIsPaid && !invIsCancelled) ? `
              <button class="btn btn-sm btn-success write-protected" onclick="rnTransitionFromDetails(() => rnOpenPaymentModal('${safeInvIdJs}', ${invRestAmount}))">
                <i class="fas fa-coins me-1.5"></i>Zahlung erfassen
              </button>
            ` : ''}
            ${invCanEdit ? `
              <button class="btn btn-sm btn-outline-info write-protected" onclick="rnTransitionFromDetails(() => rnOpenEditModal('${safeInvIdJs}'))">
                <i class="fas fa-edit me-1.5"></i>Bearbeiten
              </button>
            ` : ''}
            ${inv.type === 'Jahresbeitrag' ? `
              <button class="btn btn-sm btn-light border text-muted" onclick="rnTransitionFromDetails(() => rnJumpToJahresbeitrag('${escapeJs(inv.PersonNumber || '')}'))">
                <i class="fas fa-lock text-warning me-1.5"></i>In Jahresbeitrag
              </button>
            ` : ''}
            ${(!invIsPaid && !invIsCancelled && !invHasPayments) ? `
              <button class="btn btn-sm btn-outline-warning text-dark write-protected" onclick="rnTransitionFromDetails(() => rnCancelInvoicePrompt('${safeInvIdJs}'))" title="Rechnung stornieren">
                <i class="fas fa-ban me-1.5"></i>Stornieren
              </button>
            ` : ''}
            ${invCanDelete ? `
              <button class="btn btn-sm btn-outline-danger write-protected" onclick="rnTransitionFromDetails(() => rnDeleteInvoicePrompt('${safeInvIdJs}'))" title="Rechnung löschen">
                <i class="fas fa-trash-alt me-1.5"></i>Löschen
              </button>
            ` : ''}
          </div>
          <button type="button" class="btn btn-sm btn-secondary px-3" data-bs-dismiss="modal">Schliessen</button>
        `;
      }
      rnApplyWriteProtection(modalEl);

      if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
        window.TableKit.setupColumnToggle('#rn-detail-positions-table', {
          container: '#rn-detail-col-toggle',
          storageKey: 'rn_detail_positions_table_cols'
        });
      }
      if (window.TableKit && typeof window.TableKit.makeResizable === 'function') {
        window.TableKit.makeResizable('#rn-detail-positions-table', {
          storageKey: 'rn_detail_positions_table_col_widths',
          minWidth: 40
        });
      }
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
// EXPORT- & REVISIONS-SERVICES
// =====================================================================
window.rnExportArchivToExcel = function() {
  if (window.UIExportKit && typeof window.UIExportKit.tableToExcel === 'function') {
    window.UIExportKit.tableToExcel('#rn-invoices-table', {
      filename: 'Rechnungs_Archiv',
      sheetName: 'Rechnungen',
      excludeHiddenColumns: true
    });
  } else if (window.UIConfirmKit) {
    window.UIConfirmKit.alert({ title: 'Export-Fehler', message: 'Das UIExportKit steht derzeit nicht zur Verfügung.', type: 'danger' });
  } else if (typeof showError === 'function') {
    showError('Das UIExportKit steht derzeit nicht zur Verfügung.');
  }
};

window.rnExportRevisionToExcel = function() {
  const statusLabels = {
    'offen': 'Offene_Posten_OP',
    'bezahlt': 'Bezahlte_Posten_Einnahmen',
    'alle': 'Rechnungsjournal_Alle',
    'artikel': 'Artikel_Positionsjournal'
  };
  const modeKey = window._rechnungenReportStatus || 'offen';
  const catKey = window._rechnungenOffenePostenFilter || 'alle';
  const filename = `Revision_${statusLabels[modeKey] || 'Auswertung'}_${catKey}`;

  if (window.UIExportKit && typeof window.UIExportKit.tableToExcel === 'function') {
    window.UIExportKit.tableToExcel('#rn-revision-table', {
      filename: filename,
      sheetName: 'Revisionsliste',
      excludeHiddenColumns: true
    });
  } else if (window.UIConfirmKit) {
    window.UIConfirmKit.alert({ title: 'Export-Fehler', message: 'Das UIExportKit steht derzeit nicht zur Verfügung.', type: 'danger' });
  } else if (typeof showError === 'function') {
    showError('Das UIExportKit steht derzeit nicht zur Verfügung.');
  }
};

window.rnExportRevisionDetailExcel = function() {
  const currentFilter = window._rechnungenOffenePostenFilter || 'alle';
  const reportStatus = window._rechnungenReportStatus || 'offen';
  const allInvoices = window._invoices || [];

  function matchesCategory(inv, cat) {
    if (!cat || cat === 'alle') return true;
    const t = String(inv.type || '').toLowerCase();
    const src = String(inv.source_module || '').toLowerCase();
    if (cat === 'Jahresbeitrag') return t.includes('jahresbeitrag') || src.includes('jahresbeitrag');
    if (cat === 'Vermietung') return t.includes('vermietung') || src.includes('vermietung');
    if (cat === 'Materialverkauf') return t.includes('material') || src.includes('inventar');
    if (cat === 'Depot / Pfand' || cat === 'Depot') return t.includes('depot') || t.includes('pfand');
    if (cat === 'Schulsport') return t.includes('schulsport');
    if (cat === 'Sponsoring') return t.includes('sponsoring') || t.includes('gönner') || t.includes('goenner');
    if (cat === 'Sonstige') return t.includes('sonstige') || t.includes('diverse');
    return true;
  }

  const filteredInvoices = allInvoices.filter(inv => {
    if (!matchesCategory(inv, currentFilter)) return false;
    const st = String(inv.status || '').toLowerCase();
    if (st === 'storniert') return false;
    if (reportStatus === 'offen') {
      return st !== 'bezahlt' && (inv.open_amount === undefined || Number(inv.open_amount) > 0);
    }
    if (reportStatus === 'bezahlt') {
      return st === 'bezahlt' || (Number(inv.total_paid || 0) > 0 && Number(inv.open_amount || 0) === 0);
    }
    return true; // 'alle' oder 'artikel'
  });

  const detailRows = [];
  filteredInvoices.forEach(inv => {
    const posList = (inv.positions && inv.positions.length) ? inv.positions : ((window._invoicePositionsCache && window._invoicePositionsCache[inv.id]) || []);
    const invDateStr = window.UIFormatKit ? window.UIFormatKit.formatDate(inv.created_at) : (rnFmtSwissDate(inv.created_at) || inv.created_at);
    const payDateStr = inv.payment_date ? (window.UIFormatKit ? window.UIFormatKit.formatDate(inv.payment_date) : inv.payment_date) : '';

    if (posList && posList.length) {
      posList.forEach(p => {
        const qty = Number(p.quantity || 1);
        const up = Number(p.unit_price || 0);
        const amt = Number(p.amount !== undefined ? p.amount : (qty * up));
        detailRows.push({
          'Rechnungs-ID': inv.id,
          'Datum': invDateStr,
          'Empfänger': inv.name || 'Unbekannt',
          'Mitglieds-Nr': inv.PersonNumber || '',
          'Kategorie': inv.type || '',
          'Status': inv.status || 'offen',
          'Pos-Nr': p.position_nr || 1,
          'Artikel / Beschreibung': p.description || inv.type || 'Position',
          'Gegenkonto': p.konto || '3000',
          'Menge': qty,
          'Einzelpreis CHF': up,
          'Positionsbetrag CHF': amt,
          'Rechnungs-Total CHF': Number(inv.total_amount || 0),
          'Offener Saldo CHF': Number(inv.open_amount !== undefined ? inv.open_amount : inv.total_amount || 0),
          'Zahlungsdatum': payDateStr
        });
      });
    } else {
      detailRows.push({
        'Rechnungs-ID': inv.id,
        'Datum': invDateStr,
        'Empfänger': inv.name || 'Unbekannt',
        'Mitglieds-Nr': inv.PersonNumber || '',
        'Kategorie': inv.type || '',
        'Status': inv.status || 'offen',
        'Pos-Nr': 1,
        'Artikel / Beschreibung': inv.type || 'Pauschale',
        'Gegenkonto': '3000',
        'Menge': 1,
        'Einzelpreis CHF': Number(inv.total_amount || 0),
        'Positionsbetrag CHF': Number(inv.total_amount || 0),
        'Rechnungs-Total CHF': Number(inv.total_amount || 0),
        'Offener Saldo CHF': Number(inv.open_amount !== undefined ? inv.open_amount : inv.total_amount || 0),
        'Zahlungsdatum': payDateStr
      });
    }
  });

  if (!detailRows.length) {
    if (window.UIConfirmKit) {
      window.UIConfirmKit.alert({ title: 'Keine Daten', message: 'Für die gewählten Filter sind keine Positionen vorhanden.', type: 'warning' });
    } else if (typeof showError === 'function') {
      showError('Für die gewählten Filter sind keine Positionen vorhanden.');
    }
    return;
  }

  if (window.UIExportKit && typeof window.UIExportKit.dataToExcel === 'function') {
    window.UIExportKit.dataToExcel(detailRows, {
      filename: `Revision_Artikel_Positionen_${currentFilter}_${reportStatus}`,
      sheetName: 'Positionen'
    });
  } else if (window.UIConfirmKit) {
    window.UIConfirmKit.alert({ title: 'Export-Fehler', message: 'Das UIExportKit steht derzeit nicht zur Verfügung.', type: 'danger' });
  } else if (typeof showError === 'function') {
    showError('Das UIExportKit steht derzeit nicht zur Verfügung.');
  }
};

window.rnPrintRevisionReport = function() {
  const currentFilter = window._rechnungenOffenePostenFilter || 'alle';
  const reportStatus = window._rechnungenReportStatus || 'offen';
  const viewMode = window._rechnungenOpViewMode || 'single';

  const categoryLabels = {
    'alle': 'Alle Kategorien',
    'Jahresbeitrag': 'Jahresbeiträge (Mitglieder)',
    'Vermietung': 'Vermietung Schützenstube',
    'Materialverkauf': 'Materialverkauf (Inventar)',
    'Depot / Pfand': 'Depot / Pfand & Kautionen',
    'Schulsport': 'Schulsport',
    'Sponsoring': 'Sponsoring & Gönner',
    'Sonstige': 'Sonstige / Diverse'
  };

  const statusTitles = {
    'offen': 'Offene Posten per Stichtag (Debitorenspiegel / Bilanz 1100)',
    'bezahlt': 'Bezahlte Posten (Einnahmen- & Zahlungsjournal)',
    'alle': 'Rechnungsjournal (Vollständige Fakturenübersicht)',
    'artikel': 'Positions- & Inventarjournal (Artikelbezug & Materialverkauf)'
  };

  const tableEl = document.getElementById('rn-revision-table');
  if (!tableEl) {
    window.print();
    return;
  }

  const tableHtml = tableEl.outerHTML;
  const nowDisplay = window.UIFormatKit ? window.UIFormatKit.formatDateTime(new Date()) : new Date().toLocaleString('de-CH');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    if (window.UIConfirmKit) {
      window.UIConfirmKit.alert({ title: 'Pop-up blockiert', message: 'Das Druckfenster konnte nicht geöffnet werden. Bitte deaktiviere deinen Pop-up-Blocker.', type: 'warning' });
    } else if (typeof showError === 'function') {
      showError('Das Druckfenster konnte nicht geöffnet werden. Bitte Pop-up-Blocker deaktivieren.');
    }
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8">
        <title>Sportschützen Muhen - ${statusTitles[reportStatus] || 'Revisionsbericht'}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #212529; padding: 25px; line-height: 1.35; margin: 0; }
          .no-print { margin-bottom: 20px; padding: 12px; background: #e9ecef; border-radius: 6px; display: flex; gap: 10px; align-items: center; }
          .no-print button { padding: 8px 16px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
          .btn-print { background: #0d6efd; color: #fff; }
          .btn-close { background: #6c757d; color: #fff; }
          .report-header { border-bottom: 3px double #0d6efd; padding-bottom: 12px; margin-bottom: 20px; }
          .report-header h1 { font-size: 20px; margin: 0 0 4px 0; color: #0d6efd; text-transform: uppercase; letter-spacing: 0.5px; }
          .report-header h2 { font-size: 15px; margin: 0 0 6px 0; color: #212529; font-weight: 600; }
          .report-meta { font-size: 11.5px; color: #555; display: flex; gap: 20px; flex-wrap: wrap; }
          .report-meta strong { color: #000; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background-color: #f8f9fa; border: 1px solid #dee2e6; border-bottom: 2px solid #adb5bd; padding: 6px 8px; text-align: left; font-weight: 600; color: #333; }
          td { border: 1px solid #dee2e6; padding: 5px 8px; vertical-align: middle; }
          tr:nth-child(even) td { background-color: #fafbfc; }
          .text-end { text-align: right !important; }
          .text-center { text-align: center !important; }
          .fw-bold { font-weight: bold !important; }
          .font-monospace { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
          .text-danger { color: #dc3545 !important; }
          .text-success { color: #198754 !important; }
          .text-primary { color: #0d6efd !important; }
          .badge { display: inline-block; padding: 2px 5px; font-size: 9.5px; border-radius: 3px; font-weight: normal; border: 1px solid #ccc; background: #fff; }
          tfoot tr td { background-color: #f1f3f5 !important; font-weight: bold; border-top: 2px solid #495057; font-size: 11.5px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            @page { size: A4 landscape; margin: 1cm; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="no-print">
          <button class="btn-print" onclick="window.print()">🖨️ Jetzt Drucken / Als PDF speichern</button>
          <button class="btn-close" onclick="window.close()">Fenster schliessen</button>
          <span style="font-size:12px; color:#555; margin-left:10px;">Tipp: Im Druckdialog als Ziel «Als PDF speichern» wählen.</span>
        </div>

        <div class="report-header">
          <h1>Sportschützen Muhen &middot; Vereinsportal</h1>
          <h2>${statusTitles[reportStatus] || 'Revisionsbericht'}</h2>
          <div class="report-meta">
            <div><strong>Filter:</strong> ${categoryLabels[currentFilter] || currentFilter}</div>
            <div><strong>Ansicht:</strong> ${reportStatus === 'artikel' ? 'Positions-Detail' : (viewMode === 'single' ? 'Einzel-Belege' : 'Gruppiert nach Empfänger')}</div>
            <div><strong>Stichtag / Erstellt am:</strong> ${nowDisplay}</div>
          </div>
        </div>

        ${tableHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
};

// =====================================================================
// TAB: REVISION & AUSWERTUNGEN (HAUPT-CONTROLLER)
// =====================================================================
window._rechnungenReportStatus = window._rechnungenReportStatus || 'offen'; // 'offen', 'bezahlt', 'alle', 'artikel'
window._rechnungenOffenePostenFilter = window._rechnungenOffenePostenFilter || 'alle';
window._rechnungenOpViewMode = window._rechnungenOpViewMode || 'single'; // 'single' oder 'grouped'

window.rnFilterRevisionStatus = function(status) {
  window._rechnungenReportStatus = status;
  const content = document.getElementById('rn-tab-content-container');
  if (content) window.renderTabRevision(content);
};

window.rnFilterOffenePostenType = function(type) {
  window._rechnungenOffenePostenFilter = type;
  const content = document.getElementById('rn-tab-content-container');
  if (content) window.renderTabRevision(content);
};

window.rnToggleOpViewMode = function(mode) {
  window._rechnungenOpViewMode = mode;
  const content = document.getElementById('rn-tab-content-container');
  if (content) window.renderTabRevision(content);
};

window.renderTabRevision = function(content) {
  if (!content) return;

  const currentFilter = window._rechnungenOffenePostenFilter || 'alle';
  const reportStatus = window._rechnungenReportStatus || 'offen';
  const viewMode = window._rechnungenOpViewMode || 'single';

  const categoryLabels = {
    'alle': 'Alle Posten',
    'Jahresbeitrag': 'Jahresbeiträge',
    'Vermietung': 'Vermietung',
    'Materialverkauf': 'Materialverkauf (Inventar)',
    'Depot / Pfand': 'Depot / Pfand',
    'Schulsport': 'Schulsport',
    'Sponsoring': 'Sponsoring / Gönner',
    'Sonstige': 'Sonstige / Diverse'
  };

  function matchesCategory(inv, cat) {
    if (!cat || cat === 'alle') return true;
    const t = String(inv.type || '').toLowerCase();
    const src = String(inv.source_module || '').toLowerCase();
    if (cat === 'Jahresbeitrag') return t.includes('jahresbeitrag') || src.includes('jahresbeitrag');
    if (cat === 'Vermietung') return t.includes('vermietung') || src.includes('vermietung');
    if (cat === 'Materialverkauf') return t.includes('material') || src.includes('inventar');
    if (cat === 'Depot / Pfand' || cat === 'Depot') return t.includes('depot') || t.includes('pfand');
    if (cat === 'Schulsport') return t.includes('schulsport');
    if (cat === 'Sponsoring') return t.includes('sponsoring') || t.includes('gönner') || t.includes('goenner');
    if (cat === 'Sonstige') return t.includes('sonstige') || t.includes('diverse');
    return true;
  }

  const allInvoices = window._invoices || [];
  const catInvoices = allInvoices.filter(i => matchesCategory(i, currentFilter));

  // Zähler für Status-Schalter
  const countOffen = catInvoices.filter(i => {
    const st = String(i.status || '').toLowerCase();
    return st !== 'bezahlt' && st !== 'storniert' && (i.open_amount === undefined || Number(i.open_amount) > 0);
  }).length;

  const countBezahlt = catInvoices.filter(i => {
    const st = String(i.status || '').toLowerCase();
    return st === 'bezahlt' || (Number(i.total_paid || 0) > 0 && Number(i.open_amount || 0) === 0);
  }).length;

  const countAlle = catInvoices.filter(i => String(i.status || '').toLowerCase() !== 'storniert').length;

  // Formatierungs-Helfer (Richtlinie 9: Schweizer Standard)
  const fmtMoney = (val) => {
    if (window.UIFormatKit && typeof window.UIFormatKit.formatCurrency === 'function') {
      return window.UIFormatKit.formatCurrency(val);
    }
    return 'CHF ' + Number(val || 0).toFixed(2);
  };

  const fmtDate = (val) => {
    if (window.UIFormatKit && typeof window.UIFormatKit.formatDate === 'function') {
      const s = window.UIFormatKit.formatDate(val);
      if (s && s !== '-') return s;
    }
    return rnFmtSwissDate(val) || val || '–';
  };

  let tableHtml = '';
  let kpi1Title = '';
  let kpi1Value = '';
  let kpi1Sub = '';
  let kpi1Class = 'danger';

  let kpi2Title = 'Beteiligte Debitoren';
  let kpi2Value = '0 Personen';
  let kpi2Sub = 'Empfänger / Kunden';

  let kpi3Title = 'Beleg-Umfang';
  let kpi3Value = '0 Dokumente';
  let kpi3Sub = 'In aktueller Auswahl';

  if (reportStatus === 'artikel') {
    // =================================================================
    // MODUS: ARTIKEL- & POSITIONSJOURNAL (INVENTAR / DETAILNACHWEIS)
    // =================================================================
    const articleRows = [];
    catInvoices.forEach(inv => {
      const st = String(inv.status || '').toLowerCase();
      if (st === 'storniert') return;

      const posList = (inv.positions && inv.positions.length) ? inv.positions : ((window._invoicePositionsCache && window._invoicePositionsCache[inv.id]) || []);
      if (posList && posList.length) {
        posList.forEach(p => {
          const qty = Number(p.quantity || 1);
          const up = Number(p.unit_price || 0);
          const amt = Number(p.amount !== undefined ? p.amount : (qty * up));
          articleRows.push({
            invoiceId: inv.id,
            personNumber: inv.PersonNumber || '',
            recipientName: inv.name || 'Unbekannt',
            invoiceDate: inv.created_at,
            type: inv.type || 'Rechnung',
            status: inv.status || 'offen',
            posNr: p.position_nr || 1,
            description: p.description || inv.type || 'Position',
            quantity: qty,
            unitPrice: up,
            amount: amt,
            konto: p.konto || '3200'
          });
        });
      } else {
        articleRows.push({
          invoiceId: inv.id,
          personNumber: inv.PersonNumber || '',
          recipientName: inv.name || 'Unbekannt',
          invoiceDate: inv.created_at,
          type: inv.type || 'Rechnung',
          status: inv.status || 'offen',
          posNr: 1,
          description: inv.type || 'Pauschale',
          quantity: 1,
          unitPrice: Number(inv.total_amount || 0),
          amount: Number(inv.total_amount || 0),
          konto: '3000'
        });
      }
    });

    const totalPosSum = articleRows.reduce((s, r) => s + r.amount, 0);
    const totalQty = articleRows.reduce((s, r) => s + r.quantity, 0);
    const uniquePersons = new Set(articleRows.map(r => r.recipientName)).size;
    const uniqueInvoices = new Set(articleRows.map(r => r.invoiceId)).size;

    kpi1Title = 'Positionen-Gesamtumsatz';
    kpi1Value = fmtMoney(totalPosSum);
    kpi1Sub = `Summe aller Artikelzeilen (${categoryLabels[currentFilter] || currentFilter})`;
    kpi1Class = 'primary';

    kpi2Title = 'Verkaufte Einheiten';
    kpi2Value = `${totalQty} Stk.`;
    kpi2Sub = `Abgesetzte Mengen über alle Belege`;

    kpi3Title = 'Artikelzeilen';
    kpi3Value = `${articleRows.length} Positionen`;
    kpi3Sub = `In insgesamt ${uniqueInvoices} Rechnungen (${uniquePersons} Debitoren)`;

    let rowsHtml = '';
    if (!articleRows.length) {
      rowsHtml = `
        <tr>
          <td colspan="12" class="text-center text-muted py-5">
            <i class="fas fa-boxes-stacked fa-3x text-secondary mb-3" style="opacity:0.4;"></i>
            <h5>Keine Positionen in dieser Kategorie gefunden</h5>
            <p class="small text-muted mb-0">Wähle eine andere Kategorie oder prüfe die Rechnungen.</p>
          </td>
        </tr>
      `;
    } else {
      rowsHtml = articleRows.map((r, idx) => {
        const st = String(r.status || '').toLowerCase();
        const statusBadge = (st === 'bezahlt') 
          ? '<span class="badge bg-success-subtle text-success border border-success-subtle">bezahlt</span>'
          : '<span class="badge bg-warning-subtle text-dark border border-warning-subtle">offen</span>';

        return `
          <tr>
            <td class="text-center fw-bold text-muted small" style="width:40px;">${idx + 1}</td>
            <td style="width:130px;"><span class="bh-konto-badge bh-konto-soll-badge">#${escapeHtml(r.invoiceId)}</span></td>
            <td class="text-muted small" style="width:105px;">${escapeHtml(fmtDate(r.invoiceDate))}</td>
            <td>
              <div class="fw-bold text-dark mb-0">${escapeHtml(r.recipientName)}</div>
              ${r.personNumber ? `<div class="text-muted" style="font-size:10px;">ID / Nr: ${escapeHtml(r.personNumber)}</div>` : ''}
            </td>
            <td style="width:130px;"><span class="badge bg-light text-dark border">${escapeHtml(r.type)}</span></td>
            <td><strong>${escapeHtml(r.description)}</strong></td>
            <td class="text-center font-monospace small" style="width:85px;"><span class="badge bg-light text-primary border">${escapeHtml(r.konto)}</span></td>
            <td class="text-center fw-bold" style="width:70px;">${r.quantity}</td>
            <td class="text-end font-monospace" style="width:105px;">${fmtMoney(r.unitPrice)}</td>
            <td class="text-end fw-bold font-monospace text-primary" style="width:115px;">${fmtMoney(r.amount)}</td>
            <td class="text-center" style="width:90px;">${statusBadge}</td>
            <td class="text-center" style="width:80px;">
              <button class="btn btn-xs btn-outline-primary" onclick="rnOpenDetailsModal('${r.invoiceId}')" title="Rechnungsdetails anzeigen">
                <i class="fas fa-eye me-1"></i>Details
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    tableHtml = `
      <div class="table-responsive">
        <table class="table table-hover align-middle border mb-0" id="rn-revision-table">
          <thead class="table-light small">
            <tr>
              <th style="width:40px;" class="text-center">#</th>
              <th style="width:130px;">Rechnungs-ID</th>
              <th style="width:105px;">Datum</th>
              <th>Empfänger / Debitor</th>
              <th style="width:130px;">Kategorie</th>
              <th>Artikel / Position</th>
              <th style="width:85px;" class="text-center">Konto</th>
              <th style="width:70px;" class="text-center">Menge</th>
              <th style="width:105px;" class="text-end">Einzelpreis</th>
              <th style="width:115px;" class="text-end">Positionsbetrag</th>
              <th style="width:90px;" class="text-center">Status</th>
              <th style="width:80px;" class="text-center">Aktion</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          ${articleRows.length > 0 ? `
            <tfoot class="table-light fw-bold">
              <tr>
                <td colspan="7" class="text-end">TOTAL (${articleRows.length} Positionen):</td>
                <td class="text-center">${totalQty} Stk.</td>
                <td></td>
                <td class="text-end text-primary fs-6 font-monospace">${fmtMoney(totalPosSum)}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          ` : ''}
        </table>
      </div>
    `;

  } else {
    // =================================================================
    // MODUS: OFFENE POSTEN, BEZAHLTE POSTEN ODER ALLE FAKTUREN
    // =================================================================
    let targetList = catInvoices.filter(inv => {
      const st = String(inv.status || '').toLowerCase();
      if (st === 'storniert') return false;

      if (reportStatus === 'offen') {
        return st !== 'bezahlt' && (inv.open_amount === undefined || Number(inv.open_amount) > 0);
      }
      if (reportStatus === 'bezahlt') {
        return st === 'bezahlt' || (Number(inv.total_paid || 0) > 0 && Number(inv.open_amount || 0) === 0);
      }
      return true; // 'alle'
    });

    // Gruppierung nach Person
    const memberGroup = {};
    targetList.forEach(inv => {
      const key = inv.PersonNumber ? String(inv.PersonNumber).trim() : (inv.name || 'Unbekannt').trim();
      if (!memberGroup[key]) {
        memberGroup[key] = {
          key: key,
          personNumber: inv.PersonNumber || '–',
          name: inv.name || 'Unbekannt',
          invoices: [],
          totalAmount: 0,
          totalDisplay: 0
        };
      }
      const amt = Number(inv.total_amount || 0);
      let dispAmt = amt;
      if (reportStatus === 'offen') {
        dispAmt = Number(inv.open_amount !== undefined ? inv.open_amount : amt);
      } else if (reportStatus === 'bezahlt') {
        dispAmt = Number(inv.total_paid !== undefined ? inv.total_paid : amt);
      }
      memberGroup[key].invoices.push(inv);
      memberGroup[key].totalAmount += amt;
      memberGroup[key].totalDisplay += dispAmt;
    });

    const memberList = Object.values(memberGroup).sort((a, b) => a.name.localeCompare(b.name, 'de'));

    const totalInvoicedSum = targetList.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    let totalDisplaySum = totalInvoicedSum;
    if (reportStatus === 'offen') {
      totalDisplaySum = targetList.reduce((s, i) => s + Number(i.open_amount !== undefined ? i.open_amount : i.total_amount || 0), 0);
      kpi1Title = 'Offene Gesamtsumme';
      kpi1Value = fmtMoney(totalDisplaySum);
      kpi1Sub = `Ausstehende Forderungen (Debitoren / Bilanz 1100)`;
      kpi1Class = 'danger';
      kpi2Title = 'Säumige Empfänger';
      kpi2Value = `${memberList.length} Personen`;
      kpi2Sub = `Mit mindestens 1 offenen Rechnung`;
      kpi3Title = 'Offene Dokumente';
      kpi3Value = `${targetList.length} Rechnungen`;
      kpi3Sub = `Status 'offen' oder 'gemahnt'`;
    } else if (reportStatus === 'bezahlt') {
      totalDisplaySum = targetList.reduce((s, i) => s + Number(i.total_paid !== undefined ? i.total_paid : i.total_amount || 0), 0);
      kpi1Title = 'Eingenommener Betrag';
      kpi1Value = fmtMoney(totalDisplaySum);
      kpi1Sub = `Erfolgreich beglichene Forderungen (Einnahmen)`;
      kpi1Class = 'success';
      kpi2Title = 'Zahlende Debitoren';
      kpi2Value = `${memberList.length} Personen`;
      kpi2Sub = `Vollständig oder teilbeglichen`;
      kpi3Title = 'Beglichene Dokumente';
      kpi3Value = `${targetList.length} Rechnungen`;
      kpi3Sub = `Status 'bezahlt'`;
    } else {
      kpi1Title = 'Gesamte Fakturierung';
      kpi1Value = fmtMoney(totalInvoicedSum);
      kpi1Sub = `Fakturierter Gesamtumsatz (${categoryLabels[currentFilter] || currentFilter})`;
      kpi1Class = 'primary';
      kpi2Title = 'Erfasste Debitoren';
      kpi2Value = `${memberList.length} Personen`;
      kpi2Sub = `In allen aktiven Fakturen`;
      kpi3Title = 'Fakturierte Dokumente';
      kpi3Value = `${targetList.length} Rechnungen`;
      kpi3Sub = `Alle Rechnungsbelege`;
    }

    let rowsHtml = '';
    if (!targetList.length) {
      rowsHtml = `
        <tr>
          <td colspan="${viewMode === 'single' ? 10 : 6}" class="text-center text-muted py-5">
            <i class="fas fa-check-circle fa-3x text-success mb-3" style="opacity:0.4;"></i>
            <h5>Keine Rechnungen für den gewählten Filter vorhanden</h5>
            <p class="small text-muted mb-0">Es liegen keine passenden Datensätze vor.</p>
          </td>
        </tr>
      `;
    } else if (viewMode === 'single') {
      rowsHtml = targetList.map((inv, idx) => {
        const st = String(inv.status || '').toLowerCase();
        let statusBadge = `<span class="badge bg-warning-subtle text-dark border border-warning-subtle">${escapeHtml(inv.status || 'offen')}</span>`;
        if (st === 'bezahlt') {
          statusBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle">bezahlt</span>`;
        } else if (st === 'gemahnt') {
          statusBadge = `<span class="badge bg-danger text-white">gemahnt (Stufe ${inv.mahnstufe || 1})</span>`;
        }

        const date1 = fmtDate(inv.created_at);
        let date2 = '–';
        if (reportStatus === 'bezahlt') {
          date2 = fmtDate(inv.payment_date || inv.updated_at);
        } else {
          date2 = fmtDate(inv.due_date || inv.raw_due_date);
        }

        const amtTotal = Number(inv.total_amount || 0);
        let amtDisplay = amtTotal;
        if (reportStatus === 'offen') {
          amtDisplay = Number(inv.open_amount !== undefined ? inv.open_amount : amtTotal);
        } else if (reportStatus === 'bezahlt') {
          amtDisplay = Number(inv.total_paid !== undefined ? inv.total_paid : amtTotal);
        }

        const mgl = (window._mglData || []).find(x => String(x.PersonNumber) === String(inv.PersonNumber));
        const nieMahnen = mgl && (mgl.Niemahnen === '1' || mgl.Niemahnen === true || mgl.Niemahnen === 1);
        const nieMahnenBadge = nieMahnen ? `<span class="badge bg-secondary ms-1" style="font-size:9px;"><i class="fas fa-ban me-1"></i>Nie mahnen</span>` : '';

        return `
          <tr>
            <td class="text-center fw-bold text-muted small" style="width:40px;">${idx + 1}</td>
            <td style="width:130px;"><span class="bh-konto-badge bh-konto-soll-badge">#${escapeHtml(inv.id)}</span></td>
            <td>
              <div class="fw-bold text-primary mb-0">${escapeHtml(inv.name || 'Unbekannt')} ${nieMahnenBadge}</div>
              ${inv.PersonNumber ? `<div class="text-muted" style="font-size:10px;">ID / Nr: ${escapeHtml(inv.PersonNumber)}</div>` : ''}
            </td>
            <td class="text-muted small" style="width:110px;">${escapeHtml(date1)}</td>
            <td class="text-muted small" style="width:115px;">${escapeHtml(date2)}</td>
            <td style="width:130px;"><span class="badge bg-light text-dark border">${escapeHtml(inv.type || 'Rechnung')}</span></td>
            <td class="text-center" style="width:110px;">${statusBadge}</td>
            <td class="text-end font-monospace" style="width:120px;">${fmtMoney(amtTotal)}</td>
            <td class="text-end fw-bold font-monospace ${reportStatus === 'offen' ? 'text-danger' : (reportStatus === 'bezahlt' ? 'text-success' : 'text-primary')}" style="width:125px;">
              ${fmtMoney(amtDisplay)}
            </td>
            <td class="text-center" style="width:85px;">
              <button class="btn btn-xs btn-outline-primary" onclick="rnOpenDetailsModal('${inv.id}')" title="Rechnungsdetails anzeigen">
                <i class="fas fa-eye me-1"></i>Details
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tableHtml = `
        <div class="table-responsive">
          <table class="table table-hover align-middle border mb-0" id="rn-revision-table">
            <thead class="table-light small">
              <tr>
                <th style="width:40px;" class="text-center">#</th>
                <th style="width:130px;">Rechnungs-ID</th>
                <th>Empfänger / Debitor</th>
                <th style="width:110px;">Rechnungsdatum</th>
                <th style="width:115px;">${reportStatus === 'bezahlt' ? 'Zahlungsdatum' : 'Fälligkeit'}</th>
                <th style="width:130px;">Kategorie</th>
                <th style="width:110px;" class="text-center">Status</th>
                <th style="width:120px;" class="text-end">Rechnungsbetrag</th>
                <th style="width:125px;" class="text-end">${reportStatus === 'offen' ? 'Offener Saldo' : (reportStatus === 'bezahlt' ? 'Bezahlt' : 'Offener Rest')}</th>
                <th style="width:85px;" class="text-center">Aktion</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            ${targetList.length > 0 ? `
              <tfoot class="table-light fw-bold">
                <tr>
                  <td colspan="7" class="text-end">TOTAL (${targetList.length} Rechnungen):</td>
                  <td class="text-end font-monospace">${fmtMoney(totalInvoicedSum)}</td>
                  <td class="text-end ${reportStatus === 'offen' ? 'text-danger' : (reportStatus === 'bezahlt' ? 'text-success' : 'text-primary')} fs-6 font-monospace">${fmtMoney(totalDisplaySum)}</td>
                  <td></td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
      `;

    } else {
      // Gruppierte Ansicht nach Person
      rowsHtml = memberList.map((m, idx) => {
        const invDetailsHtml = m.invoices.map(i => {
          return `<span class="badge bg-light text-dark border me-1 mb-1">
            #${escapeHtml(i.id)} (${escapeHtml(i.type || 'Rechnung')}) &middot; ${fmtMoney(i.total_amount)}
          </span>`;
        }).join('');

        const mgl = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.personNumber));
        const nieMahnen = mgl && (mgl.Niemahnen === '1' || mgl.Niemahnen === true || mgl.Niemahnen === 1);
        const nieMahnenBadge = nieMahnen ? `<span class="badge bg-secondary ms-1" style="font-size:10px;"><i class="fas fa-ban me-1"></i>Nie mahnen</span>` : '';

        return `
          <tr>
            <td class="text-center fw-bold text-muted small" style="width:40px;">${idx + 1}</td>
            <td style="width:260px;">
              <div class="fw-bold text-primary mb-0">${escapeHtml(m.name)} ${nieMahnenBadge}</div>
              <small class="text-muted">Mitglieds-Nr: ${escapeHtml(m.personNumber)}</small>
            </td>
            <td>
              <div>${invDetailsHtml}</div>
            </td>
            <td class="text-center" style="width:110px;">
              <span class="badge ${reportStatus === 'offen' ? 'bg-danger' : 'bg-primary'} text-white">${m.invoices.length} Beleg(e)</span>
            </td>
            <td class="text-end fw-bold font-monospace ${reportStatus === 'offen' ? 'text-danger' : 'text-primary'} fs-6" style="width:150px;">
              ${fmtMoney(m.totalDisplay)}
            </td>
            <td class="text-center" style="width:85px;">
              <button class="btn btn-xs btn-outline-secondary" onclick="rnSwitchTab('archiv'); window._invoicesFilterStatus='${reportStatus === 'bezahlt' ? 'bezahlt' : 'offen'}'; renderActiveRechnungenTab();" title="Im Rechnungs-Archiv anzeigen">
                <i class="fas fa-search me-1"></i>Details
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tableHtml = `
        <div class="table-responsive">
          <table class="table table-hover align-middle border mb-0" id="rn-revision-table">
            <thead class="table-light small">
              <tr>
                <th style="width:40px;" class="text-center">#</th>
                <th style="width:260px;">Empfänger / Debitor</th>
                <th>Zugeordnete Rechnungen</th>
                <th style="width:110px;" class="text-center">Anzahl</th>
                <th style="width:150px;" class="text-end">${reportStatus === 'offen' ? 'Offener Gesamtsaldo' : (reportStatus === 'bezahlt' ? 'Bezahltes Total' : 'Gesamttotal')}</th>
                <th style="width:85px;" class="text-center">Aktion</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            ${memberList.length > 0 ? `
              <tfoot class="table-light fw-bold">
                <tr>
                  <td colspan="3" class="text-end">TOTAL (${memberList.length} Empfänger):</td>
                  <td class="text-center">${targetList.length} Rechnungen</td>
                  <td class="text-end ${reportStatus === 'offen' ? 'text-danger' : 'text-primary'} fs-6 font-monospace">${fmtMoney(totalDisplaySum)}</td>
                  <td></td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
      `;
    }
  }

  content.innerHTML = `
    <!-- Top Info & Action Header -->
    <div class="card border-0 shadow-sm p-4 bg-white rounded-4 mb-4">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
        <div>
          <h4 class="mb-1 text-primary fw-bold">
            <i class="fas fa-calculator me-2"></i>Revision & Rechnungs-Journal
          </h4>
          <p class="text-muted small mb-0">
            Audit-fähige Übersichten für Revisoren, Vorstand & Generalversammlung (Offene & bezahlte Posten, Inventar- & Artikeljournal).
          </p>
        </div>
        <div class="d-flex gap-2 align-items-center flex-wrap">
          ${reportStatus !== 'artikel' ? `
            <div class="btn-group btn-group-sm me-1" role="group">
              <button type="button" class="btn ${viewMode === 'single' ? 'btn-primary active fw-bold' : 'btn-outline-secondary'}" onclick="rnToggleOpViewMode('single')" title="Jede Rechnung einzeln auflisten">
                <i class="fas fa-file-invoice me-1"></i>Einzel-Posten
              </button>
              <button type="button" class="btn ${viewMode === 'grouped' ? 'btn-primary active fw-bold' : 'btn-outline-secondary'}" onclick="rnToggleOpViewMode('grouped')" title="Nach Person/Empfänger zusammenfassen">
                <i class="fas fa-users me-1"></i>Nach Empfänger
              </button>
            </div>
          ` : ''}
          <button class="btn btn-sm btn-outline-success fw-bold shadow-sm" onclick="rnExportRevisionToExcel()" title="Tabelle als Excel-Datei (.xlsx) exportieren">
            <i class="fas fa-file-excel me-1.5"></i>Excel Export
          </button>
          <button class="btn btn-sm btn-outline-primary fw-bold shadow-sm" onclick="rnExportRevisionDetailExcel()" title="Detail-Export inklusive aller Rechnungspositionen & verkaufter Artikel">
            <i class="fas fa-boxes-stacked me-1.5"></i>Artikel-Detail Excel
          </button>
          <button class="btn btn-sm btn-outline-dark fw-bold shadow-sm" onclick="rnPrintRevisionReport()" title="A4-Druckansicht für die Revision erstellen">
            <i class="fas fa-print me-1.5"></i>Drucken / PDF
          </button>
        </div>
      </div>

      <!-- Hauptstatus-Schalter (Offene Posten, Bezahlte Posten, Alle, Artikeljournal) -->
      <div class="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <button type="button" class="btn btn-sm ${reportStatus === 'offen' ? 'btn-danger text-white active fw-bold shadow-sm' : 'btn-outline-danger'}" onclick="rnFilterRevisionStatus('offen')">
          <i class="fas fa-clock me-1.5"></i>🔴 Offene Posten (${countOffen})
        </button>
        <button type="button" class="btn btn-sm ${reportStatus === 'bezahlt' ? 'btn-success text-white active fw-bold shadow-sm' : 'btn-outline-success'}" onclick="rnFilterRevisionStatus('bezahlt')">
          <i class="fas fa-check-circle me-1.5"></i>🟢 Bezahlte Posten (${countBezahlt})
        </button>
        <button type="button" class="btn btn-sm ${reportStatus === 'alle' ? 'btn-primary text-white active fw-bold shadow-sm' : 'btn-outline-primary'}" onclick="rnFilterRevisionStatus('alle')">
          <i class="fas fa-list me-1.5"></i>🔵 Alle Fakturen (${countAlle})
        </button>
        <button type="button" class="btn btn-sm ${reportStatus === 'artikel' ? 'btn-dark text-white active fw-bold shadow-sm' : 'btn-outline-dark'}" onclick="rnFilterRevisionStatus('artikel')" title="Detailierte Auflistung der einzelnen Rechnungspositionen (Artikel, Mengen, Erlöse für Inventar & Material)">
          <i class="fas fa-boxes-stacked me-1.5"></i>📦 Artikel- & Positionsjournal
        </button>
      </div>

      <!-- Filter Buttons Row (Kategorien) -->
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
          <i class="fas fa-tshirt me-1"></i> Materialverkauf (Inventar)
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
          <div class="bh-metric-card ${kpi1Class} shadow-sm">
            <div class="small text-muted fw-semibold">${kpi1Title}</div>
            <h2 class="fw-bold mt-1 mb-0 text-${kpi1Class}">${kpi1Value}</h2>
            <div class="small text-muted mt-1">${kpi1Sub}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="bh-metric-card info shadow-sm">
            <div class="small text-muted fw-semibold">${kpi2Title}</div>
            <h2 class="fw-bold mt-1 mb-0 text-info">${kpi2Value}</h2>
            <div class="small text-muted mt-1">${kpi2Sub}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="bh-metric-card info shadow-sm">
            <div class="small text-muted fw-semibold">${kpi3Title}</div>
            <h2 class="fw-bold mt-1 mb-0 text-dark">${kpi3Value}</h2>
            <div class="small text-muted mt-1">${kpi3Sub}</div>
          </div>
        </div>
      </div>

      <!-- Revisions-Tabelle -->
      ${tableHtml}
    </div>
  `;
};

// Abwärtskompatibler Alias
window.renderTabOffenePosten = window.renderTabRevision;

// =====================================================================
// TAB: EXTERNE KONTAKTE (STRENG NACH ID)
// =====================================================================
window._contactsSearchQuery = '';

window.rnFilterContacts = function(query) {
  window._contactsSearchQuery = (query || '').toLowerCase().trim();
  const tbody = document.getElementById('rn-contacts-tbody');
  if (tbody) {
    tbody.innerHTML = rnRenderContactsRows();
    rnApplyWriteProtection(tbody);
    if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
      window.TableKit.setupColumnToggle('#rn-contacts-table', {
        container: '#rn-contacts-col-toggle',
        storageKey: 'rn_contacts_table_cols'
      });
    }
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
    const sTyp = String(c.typ || '').toLowerCase();

    return sId.includes(q) || sName.includes(q) || sFirma.includes(q) ||
           sVorname.includes(q) || sNachname.includes(q) || sEmail.includes(q) ||
           sOrt.includes(q) || sKat.includes(q) || sTyp.includes(q);
  });

  if (filtered.length === 0) {
    return `<tr><td colspan="8" class="text-center text-muted py-4"><i class="fas fa-search me-1"></i>Keine externen Kontakte gefunden.</td></tr>`;
  }

  return filtered.map((c, idx) => {
    const isFirma = c.typ === 'firma' || Boolean(c.firma);
    const category = c.kategorie || (isFirma ? 'Firma' : 'Privat');
    
    // Main Display Title & Subtitle
    let mainTitle = '';
    let subTitle = '';
    if (isFirma) {
      mainTitle = escapeHtml(c.firma || c.name || 'Unbenannte Firma');
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
        <td data-col-id="idx" class="text-center fw-bold text-muted small tk-col-idx" style="width: 40px;">${idx + 1}</td>
        <td data-col-id="id" class="tk-col-id" style="width: 90px;">
          <span class="badge bg-light text-primary border font-monospace px-2 py-1">EXT-${escapeHtml(c.id)}</span>
        </td>
        <td data-col-id="type" class="tk-col-type" style="width: 120px;">
          <span class="badge ${isFirma ? 'bg-indigo text-white bg-opacity-75' : 'bg-light text-dark border'} me-1">
            <i class="fas ${isFirma ? 'fa-building' : 'fa-user'} me-1"></i>${isFirma ? 'Firma' : 'Privat'}
          </span>
          <span class="badge ${catBadgeClass} small">${escapeHtml(category)}</span>
        </td>
        <td data-col-id="name" class="tk-col-name">
          <div class="fw-bold text-dark">${mainTitle}</div>
          ${subTitle ? `<div class="small mt-0.5">${subTitle}</div>` : ''}
          ${c.bemerkungen ? `<div class="small text-muted fst-italic mt-0.5"><i class="fas fa-sticky-note me-1 text-warning"></i>${escapeHtml(c.bemerkungen)}</div>` : ''}
        </td>
        <td data-col-id="email" class="tk-col-email">
          ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="text-decoration-none text-primary fw-medium"><i class="fas fa-envelope me-1 small"></i>${escapeHtml(c.email)}</a>` : '<span class="text-muted">–</span>'}
        </td>
        <td data-col-id="address" class="tk-col-address">
          ${fullAddress ? `<small class="text-secondary"><i class="fas fa-map-marker-alt me-1 text-muted"></i>${escapeHtml(fullAddress)}</small>` : '<span class="text-muted">–</span>'}
        </td>
        <td data-col-id="phone" class="tk-col-phone">
          ${c.telefon ? `<small class="text-secondary"><i class="fas fa-phone me-1 text-muted"></i>${escapeHtml(c.telefon)}</small>` : '<span class="text-muted">–</span>'}
        </td>
        <td data-col-id="actions" class="text-end tk-col-actions" style="width: 150px;">
          <div class="btn-group btn-group-sm shadow-sm">
            <button class="btn btn-outline-primary write-protected" onclick="rnOpenCreateModal(); setTimeout(() => { const sel = document.getElementById('rnc-member-select'); if(sel) { sel.value = 'EXT:${escapeJs(c.id)}'; rnHandleMemberSelect(sel.value); } }, 200);" title="Rechnung an diesen Kontakt erstellen">
              <i class="fas fa-file-invoice-dollar"></i>
            </button>
            <button class="btn btn-outline-secondary write-protected" onclick="rnOpenContactModal('${escapeJs(c.id)}')" title="Kontakt bearbeiten">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-outline-danger write-protected" onclick="rnDeleteContactPrompt('${escapeJs(c.id)}')" title="Kontakt löschen">
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
        <div class="d-flex gap-2 align-items-center">
          <div id="rn-contacts-col-toggle"></div>
          <button class="btn btn-primary fw-bold px-3 py-2 rounded-3 shadow-sm write-protected" onclick="rnOpenContactModal()">
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
          <span>Tabelle: <code>external_contacts</code></span>
        </div>
      </div>

      <!-- Tabelle -->
      <div class="table-responsive border rounded-3 shadow-sm">
        <table class="table table-hover align-middle mb-0" id="rn-contacts-table">
          <thead class="table-light small">
            <tr>
              <th data-col-id="idx" data-col-name="#" style="width: 40px;" class="text-center">#</th>
              <th data-col-id="id" data-col-name="ID" style="width: 90px;">ID</th>
              <th data-col-id="type" data-col-name="Typ / Kat." style="width: 120px;">Typ / Kat.</th>
              <th data-col-id="name" data-col-name="Name / Firma & Kontaktperson">Name / Firma & Kontaktperson</th>
              <th data-col-id="email" data-col-name="E-Mail">E-Mail</th>
              <th data-col-id="address" data-col-name="Adresse">Adresse</th>
              <th data-col-id="phone" data-col-name="Telefon">Telefon</th>
              <th data-col-id="actions" data-col-name="Aktionen" style="width: 150px;" class="text-end">Aktionen</th>
            </tr>
          </thead>
          <tbody id="rn-contacts-tbody">
            ${rnRenderContactsRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (window.TableKit && typeof window.TableKit.initTable === 'function') {
    window._rnContactsTableController = window.TableKit.initTable('#rn-contacts-table', {
      id: 'rn_contacts_table',
      storageKeyWidths: 'rn_contacts_table_col_widths',
      storageKeyOrder: 'rn_contacts_table_col_order',
      storageKeyCols: 'rn_contacts_table_cols',
      sortable: true,
      resizable: {
        minWidth: 40,
        columns: {
          idx: { minWidth: 40, defaultWidth: 40, resizable: false },
          actions: { minWidth: 100, defaultWidth: 150 }
        }
      },
      reorderable: {
        lockedColumns: ['idx', 'actions']
      },
      columnToggle: '#rn-contacts-col-toggle'
    });
  }
};
