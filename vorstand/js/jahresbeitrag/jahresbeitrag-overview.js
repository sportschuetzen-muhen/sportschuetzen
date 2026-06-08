// vorstand/js/jahresbeitrag/jahresbeitrag-overview.js
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
                <th onclick="jbSortTable('gesamt')" class="text-end pe-4" style="cursor: pointer; user-select: none;">Gesamt${_jbSortCol === 'gesamt' ? (_jbSortAsc ? ' ▲' : ' ▼') : ''}</th>
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
// TAB 1 UTILS (CLASSIC CALCULATOR & PAYMENT HANDLERS)
// ============================================================
function jbRenderRows(data) {
  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));
  const tbody = document.getElementById('jbTableBody');
  if (!tbody) return;

  tbody.innerHTML = data.map(r => {
    const m    = _jbMemberMap[String(r.PersonNumber)] || {};
    const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : (r._name || r.PersonNumber);
    const isOffen = r.status !== 'bezahlt';

    // 1. Kategorien & Junior Badges
    let katHtml = '';
    if (m._kategorien && m._kategorien.length > 0) {
      katHtml = m._kategorien.map(k => typeof mglKatBadge === 'function' ? mglKatBadge(k) : `<span class="badge bg-secondary">${k}</span>`).join(' ');
    } else if (m._kategorie) {
      katHtml = m._kategorie.split(',').map(k => typeof mglKatBadge === 'function' ? mglKatBadge(k.trim()) : `<span class="badge bg-secondary">${k.trim()}</span>`).join(' ');
    } else {
      const fallbackKat = (r._kategorie || '').replace('Aktiv-', 'Aktiv ');
      katHtml = typeof mglKatBadge === 'function' ? mglKatBadge(fallbackKat) : `<span class="badge bg-secondary">${fallbackKat || '–'}</span>`;
    }
    
    const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
    const isJunior = age > 0 && age <= 20;
    if (isJunior && !katHtml.toLowerCase().includes('junior') && !katHtml.toLowerCase().includes('schüler')) {
      if (typeof mglKatBadge === 'function') {
        katHtml += ' ' + mglKatBadge('Junior');
      } else {
        katHtml += ' <span class="badge bg-success">Junior</span>';
      }
    }

    // 2. Zahlungsmethode Badges
    let methodHtml = '–';
    if (r.payment_method) {
      const pm = String(r.payment_method).toLowerCase();
      if (pm === 'überweisung' || pm.includes('camt') || pm === 'bank' || pm === 'e-banking') {
        methodHtml = `<span class="badge bg-light text-dark border border-secondary-subtle px-2 py-1"><i class="fas fa-university me-1 text-success" style="font-size:10px;"></i>Bank</span>`;
      } else if (pm === 'twint') {
        methodHtml = `<span class="badge bg-light text-dark border border-secondary-subtle px-2 py-1"><i class="fas fa-mobile-alt me-1 text-primary" style="font-size:10px;"></i>TWINT</span>`;
      } else if (pm === 'bar') {
        methodHtml = `<span class="badge bg-light text-dark border border-secondary-subtle px-2 py-1"><i class="fas fa-coins me-1 text-warning" style="font-size:10px;"></i>Bar</span>`;
      } else {
        methodHtml = `<span class="badge bg-light text-muted border border-secondary-subtle px-2 py-1">${r.payment_method}</span>`;
      }
    }

    // 3. Status Badges
    const statusHtml = isOffen
      ? `<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1.5 fw-bold text-uppercase" style="font-size: 11px;"><i class="fas fa-clock me-1"></i>Offen</span>`
      : `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1.5 fw-bold text-uppercase" style="font-size: 11px;"><i class="fas fa-check-circle me-1"></i>Bezahlt</span>`;

    const rowBg = isOffen ? '' : 'table-light text-muted';
    const rowStyle = isOffen ? '' : 'style="opacity: 0.85;"';

    return `<tr class="${rowBg}" ${rowStyle}>
      <td class="align-middle py-2">
        <a href="#" class="text-decoration-none fw-semibold ${isOffen ? 'text-primary' : 'text-secondary'}"
           onclick="jbShowPositionen(${r.id}); return false;">${name}</a>
        <div class="text-muted small" style="font-size: 11px;">${r.PersonNumber}</div>
      </td>
      <td class="align-middle">${katHtml}</td>
      <td class="text-end fw-bold align-middle pe-4 ${isOffen ? 'text-danger' : 'text-muted'}" style="font-size: 14px;">${fmtChf(r.Gesamt)}</td>
      <td class="align-middle">${statusHtml}</td>
      <td class="small align-middle">${fmtDate(r.payment_date)}</td>
      <td class="align-middle">${methodHtml}</td>
      <td class="small align-middle text-muted">${r.document_ref || '–'}</td>
      ${canEdit ? `
      <td class="align-middle text-end">
        <div class="d-inline-flex gap-1">
          <!-- 1. PDF RECHNUNG -->
          ${r.pdf_url ? `
            <a href="${r.pdf_url}" target="_blank" class="btn btn-xs btn-outline-danger btn-sm py-1 px-2.5 rounded-2 d-flex align-items-center justify-content-center"
               title="PDF-Rechnung öffnen" style="min-width: 32px;">
              <i class="fas fa-file-pdf"></i>
            </a>` : `
            <button class="btn btn-xs btn-outline-secondary btn-sm py-1 px-2.5 rounded-2 d-flex align-items-center justify-content-center"
                    onclick="jbGenerateInvoicePdfRemote(${r.id}, '${r.PersonNumber}')"
                    id="btn-pdf-${r.id}"
                    title="PDF-Rechnung generieren" style="min-width: 32px;">
              <i class="fas fa-file-invoice"></i>
            </button>`}

          <!-- 2. E-MAIL VERSAND -->
          ${m.PrimaryEmail ? `
            <button class="btn btn-xs ${r.mail_status === 'gesendet' ? 'btn-success text-white' : 'btn-outline-primary'} btn-sm py-1 px-2.5 rounded-2 d-flex align-items-center justify-content-center"
                    onclick="jbSendInvoiceEmailRemote(${r.id}, '${r.PersonNumber}', '${m.PrimaryEmail}')"
                    id="btn-mail-${r.id}"
                    title="Rechnung per E-Mail senden (${r.mail_status === 'gesendet' ? 'bereits gesendet' : 'noch nicht gesendet'})" style="min-width: 32px;">
              <i class="fas ${r.mail_status === 'gesendet' ? 'fa-envelope-open-text' : 'fa-paper-plane'}"></i>
            </button>` : `
            <button class="btn btn-xs btn-outline-secondary btn-sm py-1 px-2.5 rounded-2 d-flex align-items-center justify-content-center opacity-50"
                    disabled
                    title="Keine E-Mail-Adresse hinterlegt" style="min-width: 32px;">
              <i class="fas fa-envelope"></i>
            </button>`}

          <!-- 3. ZAHLUNG ERFASSEN -->
          ${isOffen ? `
            <button class="btn btn-xs btn-success btn-sm py-1 px-2.5 rounded-2 d-flex align-items-center justify-content-center"
                    onclick="jbOpenZahlung(${r.id}, '${name}', ${r.Gesamt})"
                    title="Zahlung erfassen" style="min-width: 32px;">
              <i class="fas fa-check"></i>
            </button>` : ''}
        </div>
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
    // 1. Hole Rechnungskopf direkt aus der lokalen Liste in Memory
    const header = _jbData.find(x => String(x.id) === String(headerId));
    if (!header) throw new Error('Beitragsrechnung nicht gefunden: ' + headerId);

    const pn = String(header.PersonNumber || '').trim();
    const m = _jbMemberMap[pn] || {};
    const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : pn;

    // 2. Hole Positionen direkt aus dem lokalen Browser-Cache
    const pos = _jbPositionsCache[headerId] || [];

    // 3. Hole Teilnahmen direkt aus dem lokalen Browser-Cache
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
    let hasKK002 = false;
    let hasKK003 = false;
    let hasKK004 = false;
    let hasKK005 = false;

    memberParts.forEach(p => {
      const val = Number(p.teilgenommen || 0);
      if (val > 0) {
        if (p.eventkey === 'KK001') _jbModalParticipationsState.kk_grenzland = '1';
        if (p.eventkey === 'KK002') hasKK002 = true;
        if (p.eventkey === 'KK003') hasKK003 = true;
        if (p.eventkey === 'KK004') hasKK004 = true;
        if (p.eventkey === 'KK005') hasKK005 = true;
        if (p.eventkey === 'KK006') _jbModalParticipationsState.kk_verband = true;
        if (p.eventkey === 'KK007') _jbModalParticipationsState.kk_verein = true;   // KK007 = Vereinsschiessen
        if (p.eventkey === 'KK008') _jbModalParticipationsState.kk_volksschiessen = String(val); // KK008 = Volksschiessen
        if (p.eventkey === 'LG001') _jbModalParticipationsState.lg_ag_dez = true;
        if (p.eventkey === 'LG002') _jbModalParticipationsState.lg_ag_dez_auflage = true;
        if (p.eventkey === 'LG003') _jbModalParticipationsState.lg_ch_dez = true;
        if (p.eventkey === 'LG004') _jbModalParticipationsState.lg_ch_dez_auflage = true;
        if (p.eventkey === 'LG005') _jbModalParticipationsState.lg_verband = true;
        if (p.eventkey === 'LG006') _jbModalParticipationsState.lg_verein = true;
        if (p.eventkey === 'LG007') _jbModalParticipationsState.lg_ch_kniend = true;
      }
    });

    const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
    const isJunior = age > 0 && age <= 20;

    if (hasKK005) {
      _jbModalParticipationsState.ssv_dez = 'sv';
    } else if (isJunior && (hasKK002 || hasKK003 || hasKK004)) {
      _jbModalParticipationsState.ssv_dez = 'js';
    } else if (hasKK002 && hasKK003 && hasKK004) {
      _jbModalParticipationsState.ssv_dez = 'liegend_2_3';
    } else if (hasKK002) {
      _jbModalParticipationsState.ssv_dez = 'liegend';
    } else if (hasKK003) {
      _jbModalParticipationsState.ssv_dez = '2-stellung';
    } else if (hasKK004) {
      _jbModalParticipationsState.ssv_dez = '3-stellung';
    }

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
            <div class="small fw-bold text-secondary mb-1.5 text-uppercase" style="font-size: 10px;">KK Volksschiessen (KK008)</div>
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

  // Segmented Pill Buttons aktualisieren
  const buttons = document.querySelectorAll(`#jbModalTabBearbeiten button[onclick*="${key}"]`);
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick').includes(`'${val}'`)) {
      btn.className = btn.className.replace('bg-transparent text-muted', 'btn-primary');
      btn.className = btn.className.replace('btn-danger text-white', 'btn-danger');
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

  // Checkboxen aktualisieren
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

    list.push({ pn: pnClean, year, eventkey: 'KK008', teilgenommen: _jbModalParticipationsState.kk_volksschiessen === 'keine' ? 0 : Number(_jbModalParticipationsState.kk_volksschiessen), quelle: 'volksschiessen' });
    list.push({ pn: pnClean, year, eventkey: 'KK007', teilgenommen: _jbModalParticipationsState.kk_verein ? 1 : 0, quelle: 'verein' });
    
    const ssv = _jbModalParticipationsState.ssv_dez;
    list.push({ pn: pnClean, year, eventkey: 'KK002', teilgenommen: (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK003', teilgenommen: (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK004', teilgenommen: (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK005', teilgenommen: ssv === 'sv' ? 1 : 0 });
    
    list.push({ pn: pnClean, year, eventkey: 'KK001', teilgenommen: _jbModalParticipationsState.kk_grenzland !== 'keine' ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'KK006', teilgenommen: _jbModalParticipationsState.kk_verband ? 1 : 0 });

    list.push({ pn: pnClean, year, eventkey: 'LG001', teilgenommen: _jbModalParticipationsState.lg_ag_dez ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG002', teilgenommen: _jbModalParticipationsState.lg_ag_dez_auflage ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG003', teilgenommen: _jbModalParticipationsState.lg_ch_dez ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG004', teilgenommen: _jbModalParticipationsState.lg_ch_dez_auflage ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG005', teilgenommen: _jbModalParticipationsState.lg_verband ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG006', teilgenommen: _jbModalParticipationsState.lg_verein ? 1 : 0 });
    list.push({ pn: pnClean, year, eventkey: 'LG007', teilgenommen: _jbModalParticipationsState.lg_ch_kniend ? 1 : 0 });

    // 1. In Google Sheets speichern via Bulk-API (inkl. Lizenz & Passiv-Status)
    const resSave = await apiFetch('jahresbeitrag', '', {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveParticipationsBulk',
        list: list,
        licenses: [{ pn: pnClean, lizenz: _jbModalParticipationsState.lizenz }],
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
    await loadJahresbeitragData(true);

    // 5. Automatisch die Rechnung synchronisieren, falls bereits eine existiert
    const updatedHeader = _jbData.find(x => String(x.PersonNumber).trim() === pnClean);
    if (updatedHeader && updatedHeader.invoiceId) {
      const updatedM = _jbMemberMap[pnClean] || {};
      const updatedName = updatedM.FirstName ? `${updatedM.FirstName} ${updatedM.LastName}` : pnClean;
      try {
        console.log(`🤖 Synchronisiere Rechnung für ${pnClean} nach Änderung...`);
        await ensureInvoiceCreatedRemote(updatedHeader, updatedM, updatedName);
      } catch (err) {
        console.error("⚠️ Fehler bei automatischer Rechnungs-Aktualisierung:", err);
      }
    }
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
    // 1. In Members100_GAS verbuchen
    const res  = await apiFetch('jahresbeitrag',
      `action=saveZahlung&headerId=${id}&datum=${datum}&methode=${encodeURIComponent(methode)}&beleg=${encodeURIComponent(beleg)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    // 2. In Rechnungen_GAS verbuchen, falls die Rechnung dort bereits existiert
    const r = _jbData.find(x => String(x.id) === String(id));
    if (r && r.invoiceId) {
      try {
        const payPayload = {
          action: 'saveZahlung',
          invoiceId: r.invoiceId,
          datum: datum,
          methode: methode,
          beleg: beleg || `PAY-${r.invoiceId}`
        };
        const payRes = await rechnungenApiFetch(payPayload);
        if (!payRes.success) {
          console.warn("⚠️ Rechnungen_GAS Zahlungssynchronisierung fehlgeschlagen:", payRes.error);
        }
      } catch (payErr) {
        console.warn("⚠️ Fehler bei Zahlungssynchronisierung mit Rechnungen_GAS:", payErr);
      }
    }

    bootstrap.Modal.getInstance(document.getElementById('jbModalZahlung')).hide();
    await loadJahresbeitragData(true);
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Zahlung speichern';
  }
}

// Hilfsfunktion zur Kommunikation mit der Rechnungen_GAS Web-App über den Worker
async function rechnungenApiFetch(payload) {
  const response = await apiFetch('rechnungen', payload, 'POST');
  const data = await response.json();
  return data;
}

// Ermittelt ein Vorstandsmitglied anhand einer bestimmten Funktion (z.B. 'Kassier', 'Juniorenleiter Gewehr 50 m')
function jbFindBoardMemberByFunction(funcCategory) {
  if (!window._mglData || !window._mglFunktionenCache) {
    console.warn("⚠️ Mitgliederdaten oder Funktionen-Cache nicht geladen.");
    return null;
  }
  
  // Suche das Mitglied, das diese Funktion aktiv innehat (kein ExitDate)
  const found = window._mglData.find(m => {
    const mFunctions = window._mglFunktionenCache[String(m.PersonNumber)] || [];
    return mFunctions.some(f => 
      String(f.OfficialFunctionCategory).trim().toLowerCase() === String(funcCategory).trim().toLowerCase() && 
      !String(f.OfficialFunctionExitDate || '').trim()
    );
  });
  
  return found || null;
}

// Baut das dynamische Absender-Objekt basierend auf dem Rechnungstyp
function jbGetSenderForInvoiceType(invoiceType) {
  // Jahresbeitrag wird standardmässig vom Kassier versandt
  // Schulsport vom Juniorenleiter Gewehr 50 m
  // Fallback ist immer der Kassier
  let roleToFind = 'Kassier';
  
  const typeClean = String(invoiceType || '').toLowerCase();
  if (typeClean.includes('schulsport') || typeClean.includes('schüler') || typeClean.includes('junior')) {
    roleToFind = 'Juniorenleiter Gewehr 50 m';
  } else if (typeClean.includes('vermietung') || typeClean.includes('miete')) {
    roleToFind = 'Kassier'; // Standard für Vermietungen
  }
  
  let member = jbFindBoardMemberByFunction(roleToFind);
  
  // Falls die spezifische Rolle nicht gefunden wurde, weichen wir auf den Kassier aus
  if (!member && roleToFind !== 'Kassier') {
    console.log(`ℹ️ Rolle '${roleToFind}' nicht gefunden. Nutze Fallback 'Kassier'…`);
    member = jbFindBoardMemberByFunction('Kassier');
  }
  
  if (member) {
    return {
      verein:   'Sportschützen Muhen',
      vorname:  member.FirstName || '',
      nachname: member.LastName || '',
      strasse:  member.Street || '',
      plz:      member.PostCode || '',
      ort:      member.City || '',
      mobil:    member.PrivateMobilePhone || member.BusinessMobilePhone || '',
      email:    member.PrimaryEmail || '',
      funktion: roleToFind
    };
  }
  
  console.warn(`⚠️ Kein Vorstandsmitglied für die Rolle '${roleToFind}' (oder Fallback 'Kassier') in Members gefunden.`);
  return null; // Backend nutzt dann DEFAULT_ABSENDER
}

// Interne Hilfsfunktion: Stellt sicher, dass eine Rechnung in Rechnungen_GAS existiert.
// Falls nicht, wird sie zuerst angelegt. Falls sie existiert aber sich der Betrag geändert hat, wird sie aktualisiert.
async function ensureInvoiceCreatedRemote(r, m, name) {
  const invoiceId = `RE-JB-${r.year}-${r.PersonNumber}`;
  
  const cachedPos = _jbPositionsCache[r.id] || [];
  if (cachedPos.length === 0) {
    throw new Error("Keine berechneten Positionen für dieses Mitglied gefunden. Bitte zuerst Beiträge berechnen.");
  }
  
  const positions = cachedPos.map((p, idx) => ({
    position_nr: p.position_nr || (idx + 1),
    description: p.beschreibung || '',
    quantity: Number(p.quantity || 1),
    unit_price: Number(p.betrag || 0),
    amount: Number(p.betrag || 0),
    type: p.typ || 'Debit',
    source_field: p.sourcefield || ''
  }));

  // Finde die Rechnung in unserem lokalen Cache (window._invoices)
  const existingInv = window._invoices && window._invoices.find(i => String(i.id) === invoiceId);
  
  if (existingInv) {
    const diff = Math.abs(Number(existingInv.total_amount || 0) - Number(r.Gesamt || 0));
    if (diff > 0.01) {
      console.log(`🔄 Rechnungsbetrag hat sich geändert (${existingInv.total_amount} -> ${r.Gesamt}). Aktualisiere Rechnung ${invoiceId}…`);
      
      const updatePayload = {
        action: 'updateInvoice',
        invoice: {
          id: invoiceId,
          PersonNumber: r.PersonNumber,
          name: name,
          year: Number(r.year),
          type: 'Jahresbeitrag',
          total_amount: Number(r.Gesamt)
        },
        positions: positions,
        recipient: {
          vorname: m.FirstName || '',
          nachname: m.LastName || '',
          strasse: m.Street || '',
          plz: m.PostCode || '',
          ort: m.City || '',
          email: m.PrimaryEmail || ''
        }
      };
      
      const updateRes = await rechnungenApiFetch(updatePayload);
      if (!updateRes.success) {
        throw new Error("Fehler beim Aktualisieren der Rechnung in Rechnungen_GAS: " + updateRes.error);
      }
      
      // Caches im Hintergrund aktualisieren
      if (typeof loadRechnungenData === 'function') {
        loadRechnungenData(true, true);
      }
    }
    r.invoiceId = invoiceId;
    return invoiceId;
  }
  
  // Rechnung neu anlegen
  const invoicePayload = {
    action: 'createInvoice',
    invoice: {
      id: invoiceId,
      PersonNumber: r.PersonNumber,
      name: name,
      year: Number(r.year),
      type: 'Jahresbeitrag',
      total_amount: Number(r.Gesamt)
    },
    positions: positions
  };
  
  const createRes = await rechnungenApiFetch(invoicePayload);
  if (!createRes.success) {
    throw new Error("Fehler beim Anlegen der Rechnung in Rechnungen_GAS: " + createRes.error);
  }
  
  // Caches im Hintergrund aktualisieren
  if (typeof loadRechnungenData === 'function') {
    loadRechnungenData(true, true);
  }
  
  r.invoiceId = invoiceId;
  return r.invoiceId;
}

// PDF Rechnung auf Knopfdruck generieren & anzeigen
async function jbGenerateInvoicePdfRemote(rId, pn) {
  const btn = document.getElementById(`btn-pdf-${rId}`);
  let oldHtml = '';
  if (btn) {
    oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 14px; height: 14px;"></span>';
  }
  
  try {
    const r = _jbData.find(x => String(x.id) === String(rId));
    if (!r) throw new Error("Rechnungs-Eintrag nicht gefunden in Memory.");
    const m = _jbMemberMap[String(pn)] || {};
    const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : pn;
    
    // 1. Sicherstellen, dass die Rechnung in Rechnungen_GAS existiert
    const invoiceId = await ensureInvoiceCreatedRemote(r, m, name);
    
    // 2. PDF Generierung anstossen
    const pdfPayload = {
      action: 'generateInvoicePDF',
      invoiceId: invoiceId,
      recipient: {
        vorname: m.FirstName || '',
        nachname: m.LastName || '',
        strasse: m.Street || '',
        plz: m.PostCode || '',
        ort: m.City || '',
        email: m.PrimaryEmail || ''
      },
      sender: jbGetSenderForInvoiceType(r.type || 'Jahresbeitrag')
    };
    
    const res = await rechnungenApiFetch(pdfPayload);
    if (!res.success) throw new Error(res.error);
    
    showToast("🎉 PDF-Rechnung erfolgreich generiert!");
    
    // PDF in neuem Tab öffnen
    if (res.pdfUrl) {
      window.open(res.pdfUrl, '_blank');
    }
    
    // Daten neu laden, um die UI zu aktualisieren (PDF-Link anzeigen)
    await loadJahresbeitragData(true);
  } catch (err) {
    alert("Fehler bei PDF-Erstellung: " + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}

// Rechnung per E-Mail versenden
async function jbSendInvoiceEmailRemote(rId, pn, email) {
  const r = _jbData.find(x => String(x.id) === String(rId));
  if (!r) { alert("Eintrag nicht gefunden."); return; }
  const m = _jbMemberMap[String(pn)] || {};
  const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : pn;
  
  if (!confirm(`Möchtest du die Jahresbeitrag-Rechnung für ${name} an die E-Mail-Adresse "${email}" senden?`)) {
    return;
  }
  
  const btn = document.getElementById(`btn-mail-${rId}`);
  let oldHtml = '';
  if (btn) {
    oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 14px; height: 14px;"></span>';
  }
  
  try {
    // 1. Sicherstellen, dass die Rechnung existiert
    const invoiceId = await ensureInvoiceCreatedRemote(r, m, name);
    
    // 2. E-Mail Versand anstossen
    const emailPayload = {
      action: 'sendInvoiceEmail',
      invoiceId: invoiceId,
      recipient: {
        vorname: m.FirstName || '',
        nachname: m.LastName || '',
        strasse: m.Street || '',
        plz: m.PostCode || '',
        ort: m.City || '',
        email: email
      },
      sender: jbGetSenderForInvoiceType(r.type || 'Jahresbeitrag')
    };
    
    const res = await rechnungenApiFetch(emailPayload);
    if (!res.success) throw new Error(res.error);
    
    showToast(`✉️ E-Mail-Rechnung erfolgreich an ${name} (${email}) gesendet!`);
    
    // Daten neu laden
    await loadJahresbeitragData(true);
  } catch (err) {
    alert("Fehler bei E-Mail-Versand: " + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
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
    await loadJahresbeitragData(true);
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-calculator"></i> Alle Beiträge berechnen';
    }
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
