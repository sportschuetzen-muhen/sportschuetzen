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

      <!-- Spalten-Ausblender -->
      <div class="dropdown d-inline-block" id="jbTableColToggleDropdown">
        <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Spalten ein- oder ausblenden">
          <i class="fas fa-columns me-1"></i> Spalten <span class="badge bg-light text-dark border ms-1" id="jbTableColToggleBadge">8/8</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm p-2" style="min-width: 200px;" id="jbTableColToggleList">
        </ul>
      </div>

      ${canEdit ? `
      <div class="ms-auto d-inline-flex gap-2 align-items-center flex-wrap">
        <button class="btn btn-sm btn-outline-success" id="jb-sync-legacy-btn" onclick="syncJahresbeitragFromLegacy()" title="1-Klick Datenabgleich aller Beiträge, Positionen, Turniere und Gebühren von Google Sheets nach Supabase">
          <i class="fas fa-cloud-download-alt me-1"></i> Sheets-Sync
        </button>
        <button class="btn btn-sm btn-outline-primary" onclick="jbOpenSammelversandModal()" title="Alle Rechnungen für das aktive Jahr gesammelt per E-Mail versenden">
          <i class="fas fa-paper-plane me-1"></i> Sammelversand E-Mail
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="jbBerechnen()">
          <i class="fas fa-calculator me-1"></i> Alle Beiträge berechnen
        </button>
        <button class="btn btn-sm btn-outline-secondary d-flex align-items-center" onclick="jbResetYear('calculations')" title="Löscht alle Rechnungs- und Posteneinträge des aktiven Jahres und berechnet sie basierend auf den Turnierteilnahmen neu. Erfasste Teilnahmen und manuelle Gebühren-Überschreibungen (z.B. Schützenhaus) bleiben erhalten.">
          <i class="fas fa-history me-1"></i> Rechnungen zurücksetzen
          <i class="fas fa-info-circle text-muted ms-1.5" style="font-size:11px;"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger d-flex align-items-center" onclick="jbResetYear('all')" title="Löscht sowohl die Rechnungen als auch ALLE Turnierteilnahmen und manuellen Gebührenüberschreibungen für das aktive Jahr komplett. Setzt das Jahr auf den Ausgangszustand zurück.">
          <i class="fas fa-trash-alt me-1"></i> Alles zurücksetzen
          <i class="fas fa-info-circle text-muted ms-1.5" style="font-size:11px;"></i>
        </button>
      </div>` : ''}
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
          <!-- 0. IN SCHNELLERFASSUNG BEARBEITEN -->
          <button class="btn btn-xs btn-outline-primary btn-sm py-1 px-2.5 rounded-2 d-flex align-items-center justify-content-center"
                  onclick="jbSwitchToSchnellerfassung('${r.PersonNumber}')"
                  title="In Schnellerfassung bearbeiten" style="min-width: 32px;">
            <i class="fas fa-edit"></i>
          </button>

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

// ============================================================
// RECHNUNGS-INSPEKTOR / DETAIL-MODAL (READ-ONLY MIT SCHNELL-AKTIONEN)
// ============================================================
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
    const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : (header._name || pn);

    // 2. Hole Positionen direkt aus dem lokalen Browser-Cache
    const pos = _jbPositionsCache[headerId] || [];

    // 3. Render das aufgeräumte Rechnungs-Inspektor-Layout
    jbRenderModalContent(header, pos, m, name);
  } catch(e) {
    modalBody.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  }
}

function jbRenderModalContent(header, pos, m, name) {
  const modalBody = document.getElementById('jbModalBody');
  const isPaid = header.status === 'bezahlt';
  const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;

  // Kategorien-Badges
  let katHtml = '';
  if (m._kategorien && m._kategorien.length > 0) {
    katHtml = m._kategorien.map(k => typeof mglKatBadge === 'function' ? mglKatBadge(k) : `<span class="badge bg-secondary">${k}</span>`).join(' ');
  } else if (m._kategorie) {
    katHtml = m._kategorie.split(',').map(k => typeof mglKatBadge === 'function' ? mglKatBadge(k.trim()) : `<span class="badge bg-secondary">${k.trim()}</span>`).join(' ');
  } else {
    const fallbackKat = (header._kategorie || '').replace('Aktiv-', 'Aktiv ');
    katHtml = typeof mglKatBadge === 'function' ? mglKatBadge(fallbackKat) : `<span class="badge bg-secondary">${fallbackKat || '–'}</span>`;
  }
  if (isJunior && !katHtml.toLowerCase().includes('junior') && !katHtml.toLowerCase().includes('schüler')) {
    if (typeof mglKatBadge === 'function') katHtml += ' ' + mglKatBadge('Junior');
  }

  // Positions-Zeilen
  const posRows = pos.length > 0 ? pos.map(p => `
    <tr>
      <td class="text-muted small">${p.position_nr || p.positionnr || '–'}</td>
      <td class="fw-semibold text-dark">${p.beschreibung || '–'}</td>
      <td>
        <span class="badge ${p.typ === 'Kredit' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle'}">
          ${p.typ}
        </span>
      </td>
      <td class="text-end fw-bold ${p.typ === 'Kredit' ? 'text-success' : 'text-dark'}">
        ${p.typ === 'Kredit' ? '-' : ''}${fmtChf(Math.abs(p.betrag))}
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="4" class="text-center py-4 text-muted">
        <i class="fas fa-info-circle me-1"></i> Keine separaten Einzelpositionen vorhanden.
      </td>
    </tr>
  `;

  const safeName = typeof escHtml === 'function' ? escHtml(name) : name;

  modalBody.innerHTML = `
    <!-- 1. Header-Karte: Mitglieds- und Betragsübersicht -->
    <div class="card border-0 bg-light shadow-sm p-3 mb-3 rounded-3">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <h5 class="mb-0 text-primary fw-bold">${safeName}</h5>
            <span class="badge bg-secondary font-monospace" style="font-size: 11px;">${header.PersonNumber}</span>
          </div>
          <div class="small text-muted d-flex align-items-center flex-wrap gap-2">
            <span>Jahr: <strong>${header.year}</strong></span>
            <span>·</span>
            <span>${isJunior ? 'Junior' : 'Erwachsen'}${age > 0 ? ` (${age} J.)` : ''}</span>
            <span>·</span>
            <div>${katHtml}</div>
          </div>
        </div>
        <div class="text-end">
          <div class="small text-muted fw-semibold">Rechnungsbetrag</div>
          <div class="fs-3 fw-extrabold ${isPaid ? 'text-success' : 'text-danger'}">${fmtChf(header.Gesamt)}</div>
          <span class="badge ${isPaid ? 'bg-success' : 'bg-danger'} px-2 py-1 text-uppercase" style="font-size: 10px; letter-spacing: 0.5px;">
            <i class="fas ${isPaid ? 'fa-check-circle' : 'fa-clock'} me-1"></i>${isPaid ? 'Bezahlt' : 'Offen'}
          </span>
        </div>
      </div>
    </div>

    <!-- 2. Rechnungs-Positionen -->
    <div class="card border shadow-sm mb-3 rounded-3 overflow-hidden">
      <div class="card-header bg-white py-2 px-3 d-flex justify-content-between align-items-center border-bottom">
        <span class="fw-bold small text-secondary text-uppercase" style="font-size: 11px; letter-spacing: 0.5px;">
          <i class="fas fa-list-ol me-1 text-primary"></i> Aufstellung der Rechnungsposten
        </span>
        <button class="btn btn-xs btn-outline-primary fw-bold shadow-sm" onclick="jbSwitchToSchnellerfassung('${header.PersonNumber}')" title="Teilnahmen & Posten in Schnellerfassung anpassen">
          <i class="fas fa-edit me-1"></i> In Schnellerfassung bearbeiten
        </button>
      </div>
      <div class="table-responsive mb-0">
        <table class="table table-hover table-sm align-middle mb-0">
          <thead class="table-light small text-muted">
            <tr>
              <th style="width: 45px;">#</th>
              <th>Bezeichnung</th>
              <th style="width: 90px;">Typ</th>
              <th class="text-end" style="width: 120px;">Betrag</th>
            </tr>
          </thead>
          <tbody>
            ${posRows}
          </tbody>
          <tfoot class="table-secondary fw-bold">
            <tr>
              <td colspan="3" class="text-end">Gesamtsumme</td>
              <td class="text-end text-dark">${fmtChf(header.Gesamt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- 3. Status-, Beleg- und Zahlungs-Information -->
    ${isPaid ? `
      <div class="alert alert-success d-flex align-items-center justify-content-between p-3 rounded-3 mb-3 shadow-sm border-success-subtle">
        <div class="d-flex align-items-center">
          <i class="fas fa-check-circle text-success fs-3 me-3"></i>
          <div>
            <div class="fw-bold text-success">Rechnung vollständig bezahlt</div>
            <div class="small text-muted">
              Datum: <strong>${fmtDate(header.payment_date)}</strong> · 
              Methode: <strong>${header.payment_method || '–'}</strong> · 
              Beleg / Ref: <strong>${header.document_ref || '–'}</strong>
            </div>
          </div>
        </div>
      </div>
    ` : `
      <div class="alert alert-warning d-flex align-items-center justify-content-between p-3 rounded-3 mb-3 shadow-sm border-warning-subtle">
        <div class="d-flex align-items-center">
          <i class="fas fa-exclamation-circle text-warning fs-3 me-3"></i>
          <div>
            <div class="fw-bold text-dark">Zahlung noch ausstehend</div>
            <div class="small text-muted">Offener Betrag: ${fmtChf(header.Gesamt)}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-success fw-bold px-3 shadow-sm" onclick="jbOpenZahlungFromModal(${header.id}, '${safeName}', ${header.Gesamt})">
          <i class="fas fa-check me-1"></i> Zahlung jetzt verbuchen
        </button>
      </div>
    `}

    <!-- 4. Dokumenten-Aktionen (PDF / Mail) -->
    <div class="card p-2.5 bg-light border rounded-3 mb-3 shadow-sm">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="small fw-bold text-secondary">
          <i class="fas fa-file-invoice me-1 text-primary"></i> Rechnungsdokumente & Versand
        </div>
        <div class="d-flex gap-2">
          ${header.pdf_url ? `
            <a href="${header.pdf_url}" target="_blank" class="btn btn-sm btn-outline-danger shadow-sm fw-semibold">
              <i class="fas fa-file-pdf me-1"></i> PDF-Rechnung öffnen
            </a>
          ` : `
            <button class="btn btn-sm btn-outline-secondary shadow-sm fw-semibold" onclick="jbGenerateInvoicePdfRemote(${header.id}, '${header.PersonNumber}')">
              <i class="fas fa-file-invoice me-1"></i> PDF generieren
            </button>
          `}
          ${m.PrimaryEmail ? `
            <button class="btn btn-sm ${header.mail_status === 'gesendet' ? 'btn-success text-white' : 'btn-outline-primary'} shadow-sm fw-semibold"
                    onclick="jbSendInvoiceEmailRemote(${header.id}, '${header.PersonNumber}', '${m.PrimaryEmail}')">
              <i class="fas ${header.mail_status === 'gesendet' ? 'fa-envelope-open-text' : 'fa-paper-plane'} me-1"></i>
              ${header.mail_status === 'gesendet' ? 'Erneut senden' : 'Per E-Mail senden'}
            </button>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- 5. Modal Footer / Schnellwechsel -->
    <div class="d-flex justify-content-between align-items-center pt-2 border-top">
      <button class="btn btn-secondary" data-bs-dismiss="modal">Schliessen</button>
      <button class="btn btn-primary fw-bold px-3 shadow-sm" onclick="jbSwitchToSchnellerfassung('${header.PersonNumber}')">
        <i class="fas fa-edit me-1"></i> In Schnellerfassung bearbeiten
      </button>
    </div>
  `;
}

function jbOpenZahlungFromModal(id, name, betrag) {
  const modalEl = document.getElementById('jbModalPositionen');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';

  jbOpenZahlung(id, name, betrag);
}

window.jbSwitchToSchnellerfassung = function(pn) {
  const pnClean = String(pn || '').trim();
  const modalEl = document.getElementById('jbModalPositionen');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';

  _jbActiveTab = 'entry';
  _jbSelectedMemberPN = pnClean;
  renderJahresbeitragView();

  if (pnClean && typeof jbEntrySelectMember === 'function') {
    jbEntrySelectMember(pnClean);
    setTimeout(() => {
      if (typeof jbScrollToActiveMember === 'function') {
        jbScrollToActiveMember();
      }
    }, 150);
  }
};

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
    const r = _jbData.find(x => String(x.id) === String(id));

    // 1. In Supabase verbuchen (< 50 ms)
    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    if (supa) {
      try {
        await supa.from('contributions_header').update({
          status: 'bezahlt',
          payment_date: datum,
          payment_method: methode,
          document_ref: beleg || `PAY-${id}`,
          updated_at: new Date().toISOString()
        }).eq('id', id);

        if (r && r.invoiceId) {
          await supa.from('invoices').update({
            status: 'bezahlt',
            payment_date: datum,
            payment_method: methode,
            document_ref: beleg || `PAY-${r.invoiceId}`,
            updated_at: new Date().toISOString()
          }).eq('id', r.invoiceId);
        }
        console.log(`✅ [Supabase] Zahlung für Beitrag ${id} (und ggf. Rechnung ${r?.invoiceId}) direkt verbucht.`);
      } catch (errSup) {
        console.warn("⚠️ Fehler bei direkter Supabase Beitragszahlung:", errSup);
      }
    }



    // 3. In Buchhaltung_GAS verbuchen via Splitbuchung
    if (typeof window.jbGetSplitBookings === 'function') {
      try {
        const isBar = String(methode || '').toLowerCase().includes('bar');
        const bankKonto = isBar ? '1000' : '1020';
        const member = _jbMemberMap ? _jbMemberMap[String(r?.PersonNumber)] : null;
        const splits = window.jbGetSplitBookings({
          headerId: id,
          member: member,
          paidAmount: Number(r?.Gesamt || 0),
          bookingDate: datum,
          belegNr: beleg || `PAY-${id}`,
          bankAccount: bankKonto,
          year: Number(r?.year || new Date().getFullYear())
        });
        if (splits && splits.length > 0) {
          if (supa) {
            const rowsToInsert = splits.map((s, sIdx) => ({
              id: `bh_jb_${id}_${Date.now()}_${sIdx}`,
              jahr: Number(r?.year || new Date().getFullYear()),
              datum: datum,
              beleg_nr: beleg || `PAY-${id}`,
              beschreibung: s.beschreibung,
              konto_soll: String(s.konto_soll).trim(),
              konto_haben: String(s.konto_haben).trim(),
              betrag: Number(s.betrag || 0),
              typ: isBar ? 'Kassa' : 'Bank',
              split_group_id: splits.length > 1 ? `grp_${beleg || 'PAY-' + id}_${Date.now()}` : null,
              created_at: new Date().toISOString()
            }));
            supa.from('accounting_journal').insert(rowsToInsert)
              .then(({ error }) => {
                if (error) console.warn('[Jahresbeitrag -> FiBu] Supabase journal insert error:', error);
                else console.log('✅ Jahresbeitrag Split-Zahlung in Supabase FiBu gebucht.');
              }).catch(e => console.warn('[Jahresbeitrag -> FiBu] Journal insert exception:', e));
          }

        }
      } catch (bhErr) {
        console.warn("⚠️ Fehler bei Buchhaltung Splitbuchung:", bhErr);
      }
    }

    bootstrap.Modal.getInstance(document.getElementById('jbModalZahlung')).hide();
    
    // Explizites Entfernen des Backdrops und Beendigung des Scroll-Locks, um Freezes zu verhindern
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    // Optimistisches lokales Update des Beleg-Status
    const header = _jbData.find(x => String(x.id) === String(id));
    if (header) {
      header.status = 'bezahlt';
      header.payment_date = datum;
      header.payment_method = methode;
      header.document_ref = beleg || `PAY-${id}`;
    }
    if (typeof renderJahresbeitragView === 'function') {
      renderJahresbeitragView();
    }

    await loadJahresbeitragData(true, false); // showSpinner = false
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Zahlung speichern';
  }
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
  const invoicesList = window._invoices || window._jbAllInvoices || [];
  
  // 1. Suche nach existierender Rechnung:
  // a) Über gespeicherte r.invoiceId
  // b) Über PersonNumber + Jahr + Typ 'Jahresbeitrag'
  // c) Über Legacy-Format 'RE-JB-...'
  let existingInv = null;
  if (r.invoiceId) {
    existingInv = invoicesList.find(i => String(i.id).trim() === String(r.invoiceId).trim());
  }
  if (!existingInv) {
    existingInv = invoicesList.find(i => 
      String(i.PersonNumber).trim() === String(r.PersonNumber).trim() && 
      Number(i.year) === Number(r.year) && 
      String(i.type || '').toLowerCase() === 'jahresbeitrag'
    );
  }
  if (!existingInv) {
    existingInv = invoicesList.find(i => String(i.id).trim() === `RE-JB-${r.year}-${r.PersonNumber}`);
  }

  const invoiceId = existingInv 
    ? existingInv.id 
    : (r.invoiceId || ((typeof window.generateSafeInvoiceId === 'function') ? window.generateSafeInvoiceId('RE', r.year) : `RE-JB-${r.year}-${r.PersonNumber}`));
  
  const cachedPos = _jbPositionsCache[r.id] || [];
  if (cachedPos.length === 0) {
    throw new Error("Keine berechneten Positionen für dieses Mitglied gefunden. Bitte zuerst Beiträge berechnen.");
  }
  
  const positions = cachedPos.map((p, idx) => {
    const desc = p.beschreibung || p.name || '';
    const sf = p.sourcefield || p.key || '';
    let posKonto = p.konto || '';
    if (!posKonto && typeof window.jbResolveAccountForPosition === 'function') {
      posKonto = window.jbResolveAccountForPosition(sf, desc);
    }

    if (!posKonto) {
      throw new Error(`Fehlendes Haben-Konto für Jahresbeitrag-Position ${p.position_nr || (idx + 1)} („${desc}“, Key: ${sf || '–'}) bei Mitglied ${name}. Bitte im Sheet 'gebuehrenconfig' (Members100) das Gegenkonto eintragen.`);
    }

    return {
      position_nr: p.position_nr || (idx + 1),
      description: desc,
      quantity: Number(p.quantity || 1),
      unit_price: Number(p.betrag || 0),
      amount: Number(p.betrag || 0),
      type: p.typ || 'Debit',
      source_field: sf,
      konto: posKonto
    };
  });

  // 1. Direkt in Supabase persistieren (falls aktiv)
  const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
  if (supa) {
    try {
      const sbInv = {
        id: invoiceId,
        person_number: String(r.PersonNumber || '').trim(),
        recipient_name: name,
        year: Number(r.year),
        type: 'Jahresbeitrag',
        total_amount: Number(r.Gesamt || 0),
        status: r.status || 'offen',
        updated_at: new Date().toISOString()
      };
      await supa.from('invoices').upsert(sbInv, { onConflict: 'id' });

      if (positions.length > 0) {
        const sbPositions = positions.map(p => ({
          invoice_id: invoiceId,
          position_nr: p.position_nr,
          description: p.description,
          quantity: p.quantity,
          unit_price: p.unit_price,
          amount: p.amount,
          konto: p.konto || '3000'
        }));
        await supa.from('invoice_positions').delete().eq('invoice_id', invoiceId);
        await supa.from('invoice_positions').insert(sbPositions);
      }

      await supa.from('contributions_header').update({ invoice_id: invoiceId }).eq('id', r.id);
      console.log(`✅ [Supabase] Jahresbeitrags-Rechnung ${invoiceId} gespeichert & in contributions_header verknüpft.`);
    } catch (errSup) {
      console.warn("⚠️ Fehler bei direkter Supabase Rechnungs-Speicherung:", errSup);
    }
  }



  if (existingInv) {
    r.invoiceId = existingInv.id;
    return existingInv.id;
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
    
    // 2. Phase 21: Supabase-First PDF Generierung
    if (typeof window.generatePdfViaEngine === 'function') {
      try {
        const engineRes = await window.generatePdfViaEngine({
          action: 'generate-invoice',
          invoiceId: invoiceId,
          recipient: {
            vorname: m.FirstName || '',
            nachname: m.LastName || '',
            name: name,
            strasse: m.Street || '',
            plz: m.PostCode || '',
            ort: m.City || '',
            email: m.PrimaryEmail || ''
          },
          totalAmount: r.total_amount || r.betrag || 0,
          year: r.year || new Date().getFullYear(),
          type: 'Jahresbeitrag'
        });

        if (engineRes && engineRes.success) {
          showToast("🎉 Schweizer QR-Rechnung erfolgreich generiert!");
          if (engineRes.pdfUrl) {
            window.open(engineRes.pdfUrl, '_blank');
          } else if (engineRes.pdfBase64 && typeof openPdfBase64 === 'function') {
            openPdfBase64(engineRes.pdfBase64);
          }
          await loadJahresbeitragData(true, false);
          return;
        } else {
          throw new Error(engineRes?.error || "Fehler bei PDF-Generierung");
        }
      } catch (engineErr) {
        console.warn("⚠️ PDF-Engine Fehler in Jahresbeitrag:", engineErr);
        if (typeof window.generatePdfClientFallback === 'function') {
          const clientRes = await window.generatePdfClientFallback({
            invoiceId: invoiceId,
            recipient: {
              vorname: m.FirstName || '',
              nachname: m.LastName || '',
              strasse: m.Street || '',
              plz: m.PostCode || '',
              ort: m.City || '',
              email: m.PrimaryEmail || ''
            },
            totalAmount: r.total_amount || r.betrag || 0,
            year: r.year || new Date().getFullYear(),
            type: 'Jahresbeitrag'
          });
          if (clientRes && clientRes.success) {
            showToast("🎉 PDF über Browser generiert!");
            if (clientRes.pdfUrl) window.open(clientRes.pdfUrl, '_blank');
            await loadJahresbeitragData(true, false);
            return;
          }
        }
        throw engineErr;
      }
    } else {
      throw new Error("PDF-Engine ist nicht verfügbar.");
    }
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
    
    // 2. Absender ermitteln
    const sender = (typeof rnGetLoggedInSender === 'function')
      ? rnGetLoggedInSender('Jahresbeitrag')
      : jbGetSenderForInvoiceType(r.type || 'Jahresbeitrag');

    // 3. PDF vorbereiten falls nötig
    let pdfUrl = r.pdf_url || '';
    let pdfStoragePath = null;
    let pdfBase64 = null;

    if (!pdfUrl && typeof window.generatePdfViaEngine === 'function') {
      try {
        const engineRes = await window.generatePdfViaEngine({
          action: 'generate-invoice',
          invoiceId: invoiceId,
          recipient: {
            vorname: m.FirstName || '',
            nachname: m.LastName || '',
            name: name,
            strasse: m.Street || '',
            plz: m.PostCode || '',
            ort: m.City || '',
            email: email
          },
          totalAmount: r.total_amount || r.betrag || r.Gesamt || 0,
          year: r.year || new Date().getFullYear(),
          type: 'Jahresbeitrag'
        });
        if (engineRes && engineRes.success) {
          pdfUrl = engineRes.pdfUrl || '';
          pdfStoragePath = engineRes.storagePath || null;
          pdfBase64 = engineRes.pdfBase64 || null;
          r.pdf_url = pdfUrl;
        }
      } catch (pErr) {
        console.warn("⚠️ PDF-Engine Vorbereitung Hinweis:", pErr);
      }
    }

    const attachments = [];
    if (pdfStoragePath) {
      attachments.push({ filename: `Rechnung_${invoiceId}.pdf`, storagePath: pdfStoragePath, contentType: 'application/pdf' });
    } else if (pdfBase64) {
      attachments.push({ filename: `Rechnung_${invoiceId}.pdf`, contentBase64: pdfBase64, contentType: 'application/pdf' });
    } else if (pdfUrl && pdfUrl.includes('/operatives-storage/')) {
      const parts = pdfUrl.split('/operatives-storage/');
      if (parts[1]) {
        attachments.push({ filename: `Rechnung_${invoiceId}.pdf`, storagePath: decodeURIComponent(parts[1].split('?')[0]), contentType: 'application/pdf' });
      }
    }

    // 4. E-Mail über Supabase Mail-Engine senden
    if (typeof window.sendMailViaEngine !== 'function') {
      throw new Error("Mail-Engine nicht verfügbar");
    }

    const totalBetrag = Number(r.total_amount || r.betrag || r.Gesamt || 0);
    const emailHtml = (typeof window.renderClubEmailHtml === 'function')
      ? window.renderClubEmailHtml({
          title: `Rechnung Jahresbeitrag ${r.year || new Date().getFullYear()}`,
          subtitle: 'Jahresbeitrag',
          contentHtml: `<p>Guten Tag ${name},</p><p>anbei senden wir dir die Rechnung für den Jahresbeitrag ${r.year || new Date().getFullYear()} mit der Rechnungsnummer <strong>${invoiceId}</strong> über CHF ${totalBetrag.toFixed(2)} inkl. beiliegender QR-Rechnung.</p>`,
          noticeHtml: `<strong>Rechnungsbetrag:</strong> CHF ${totalBetrag.toFixed(2)}`,
          senderInfo: sender ? `${sender.name}\n${sender.funktion || ''}\nSportschützen Muhen` : 'Kassier Sportschützen Muhen'
        })
      : `<p>Guten Tag ${name}, anbei deine Rechnung ${invoiceId}.</p>`;

    const mailRes = await window.sendMailViaEngine({
      to: email,
      subject: `Rechnung Jahresbeitrag ${r.year || new Date().getFullYear()} – ${invoiceId} | Sportschützen Muhen`,
      html: emailHtml,
      text: `Guten Tag ${name},\n\nanbei die Rechnung für den Jahresbeitrag ${r.year || new Date().getFullYear()} (${invoiceId}).`,
      senderName: sender?.name || 'Sportschützen Muhen',
      senderEmail: sender?.email || 'sportschuetzen.muhen@gmail.com',
      attachments: attachments,
      moduleRef: 'rechnung',
      recordId: String(invoiceId)
    });

    if (!mailRes.success) {
      throw new Error(mailRes.error || "E-Mail-Versand fehlgeschlagen.");
    }

    // Status lokal sofort aktualisieren
    const nowSwissStr = (typeof formatSwissDate === 'function') ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH');
    r.mail_status = 'gesendet';
    r.send_date = nowSwissStr;
    const allInvs = window._invoices || window._jbAllInvoices || [];
    const targetInv = allInvs.find(i => String(i.id).trim() === String(invoiceId).trim());
    if (targetInv) {
      targetInv.mail_status = 'gesendet';
      targetInv.send_date = nowSwissStr;
      targetInv.updated_at = nowSwissStr;
      if (pdfUrl) targetInv.pdf_url = pdfUrl;
    }

    // In Supabase Master invoices Tabelle spiegeln
    const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : null;
    if (supa) {
      supa.from('invoices').update({
        mail_status: 'gesendet',
        send_date: new Date().toISOString(),
        pdf_url: pdfUrl || r.pdf_url || '',
        updated_at: new Date().toISOString()
      }).eq('id', invoiceId).then(() => {}).catch(() => {});
    }
    
    showToast(`✉️ E-Mail-Rechnung erfolgreich an ${name} (${email}) gesendet!`);
    
    // Rechnungs-Modul & Jahresbeitrag neu laden und synchronisieren
    if (typeof loadRechnungenData === 'function') {
      await loadRechnungenData(true, true);
    }
    if (typeof rnRenderTable === 'function') {
      rnRenderTable();
    }
    await loadJahresbeitragData(true, false);
  } catch (err) {
    alert("Fehler bei E-Mail-Versand: " + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}

// Sammelversand für Jahresbeiträge: Öffnet das Massenversand-Modal vorselektiert mit allen Rechnungen des aktiven Jahres
window.jbOpenSammelversandModal = async function() {
  if (typeof rnOpenMassSendModal !== 'function') {
    alert("Das Massenversand-Modul steht momentan nicht zur Verfügung.");
    return;
  }
  
  // Stelle sicher, dass die Rechnungen geladen sind
  if (typeof loadRechnungenData === 'function') {
    await loadRechnungenData(true, true);
  }
  
  // Filter auf Jahresbeitrag setzen
  window._rnMassSendTypeFilter = 'Jahresbeitrag';
  
  // Alle Rechnungs-IDs des aktuellen Jahres filtern
  const jbInvs = (window._invoices || []).filter(inv => 
    String(inv.type || '').toLowerCase() === 'jahresbeitrag' && 
    Number(inv.year) === Number(_jbYear)
  );
  
  const jbIds = jbInvs.map(i => i.id);
  window.rnOpenMassSendModal(jbIds.length > 0 ? jbIds : []);
};


async function jbBerechnen() {
  if (!confirm(`Beiträge für ${_jbYear} berechnen? Bereits berechnete werden übersprungen.`)) return;
  const btn = document.querySelector('button[onclick="jbBerechnen()"]');
  if (btn) {
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Berechne…';
  }
  try {
    // 1. Supabase Berechnung & Persistierung
    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    let newlyCalculatedCount = 0;
    if (supa && Array.isArray(_jbMembers) && _jbMembers.length > 0) {
      try {
        const existingPns = new Set((_jbData || []).map(d => String(d.PersonNumber).trim()));
        const toCalculate = _jbMembers.filter(m => !existingPns.has(String(m.PersonNumber).trim()));

        if (toCalculate.length > 0) {
          console.log(`🤖 Berechne ${toCalculate.length} fehlende Beiträge für ${_jbYear} in Supabase...`);
          const newHeaders = [];
          const newPositions = [];

          for (const m of toCalculate) {
            const pn = String(m.PersonNumber).trim();
            const headId = `${_jbYear}-${pn}`;
            const calc = typeof jbCalculateLiveTotal === 'function' ? jbCalculateLiveTotal(m, {}) : { total: 0, positions: [] };

            newHeaders.push({
              id: headId,
              person_number: pn,
              year: Number(_jbYear),
              status: 'offen',
              gesamt: calc.total,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

            calc.positions.forEach((p, idx) => {
              newPositions.push({
                id: `${headId}-${idx + 1}`,
                header_id: headId,
                person_number: pn,
                year: Number(_jbYear),
                position_nr: idx + 1,
                beschreibung: p.name || 'Position',
                betrag: Number(p.betrag || 0),
                typ: p.typ || 'Debit',
                source_field: p.key || '',
                konto: p.konto || (typeof window.jbResolveAccountForPosition === 'function' ? window.jbResolveAccountForPosition(p.key, p.name) : '3000'),
                last_upd: new Date().toISOString()
              });
            });
          }

          if (newHeaders.length > 0) {
            await supa.from('contributions_header').upsert(newHeaders, { onConflict: 'person_number,year' });
            if (newPositions.length > 0) {
              await supa.from('contributions_positions').upsert(newPositions, { onConflict: 'id' });
            }
            newlyCalculatedCount = newHeaders.length;
            console.log(`✅ [Supabase] ${newHeaders.length} neue Beiträge und ${newPositions.length} Positionen angelegt.`);
          }
        }
      } catch (errSup) {
        console.warn("⚠️ Fehler bei Supabase Vorberechnung:", errSup);
      }
    }

    alert(`✅ Beiträge für ${_jbYear} erfolgreich in Supabase berechnet!`);
    await loadJahresbeitragData(true, false);
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-calculator"></i> Alle Beiträge berechnen';
    }
  }
}

async function jbResetYear(mode) {
  const modeText = mode === 'all' 
    ? 'alle Rechnungen, Posten SOWIE ALLE Turnierteilnahmen und manuellen Gebührenüberschreibungen' 
    : 'alle Beitragsrechnungen und Posten (Turnierteilnahmen bleiben erhalten)';
  
  if (!confirm(`⚠️ ACHTUNG: Möchten Sie wirklich ${modeText} für das Beitragsjahr ${_jbYear} zurücksetzen?\n\nVorjahre bleiben unberührt. Diese Aktion kann nicht rückgängig gemacht werden!`)) {
    return;
  }
  
  // Zweite Bestätigung zur Sicherheit
  if (!confirm(`Sind Sie absolut sicher?`)) {
    return;
  }
  
  showLoadingOverlay(`Setze das Jahr ${_jbYear} in Supabase zurück (${mode === 'all' ? 'Alles' : 'Rechnungen'})…`);
  
  try {
    const supa = typeof getJahresbeitragSupabaseClient === 'function' ? getJahresbeitragSupabaseClient() : null;
    if (!supa) throw new Error("Supabase Client nicht verfügbar");

    const yr = Number(_jbYear);
    // Positionen für das Jahr löschen
    const { error: posErr } = await supa.from('contributions_positions').delete().eq('year', yr);
    if (posErr) console.warn("Supabase positions delete warning:", posErr);

    // Beitrags-Header für das Jahr löschen
    const { error: headErr } = await supa.from('contributions_header').delete().eq('year', yr);
    if (headErr) console.warn("Supabase header delete warning:", headErr);

    if (mode === 'all') {
      const { error: partErr } = await supa.from('member_participations').delete().eq('year', yr);
      if (partErr) console.warn("Supabase participations delete warning:", partErr);
    }
    
    showToast(`🎉 Zurücksetzen des Jahres ${_jbYear} in Supabase erfolgreich abgeschlossen!`);
    await loadJahresbeitragData(true, false);
  } catch (e) {
    alert("Fehler beim Zurücksetzen: " + e.message);
  } finally {
    hideLoadingOverlay();
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
