// js/jahresbeitrag.js
// ============================================================
// STATE
// ============================================================
let _jbYear = new Date().getFullYear();
let _jbData = [];
let _jbMemberMap = {};

// ============================================================
// EINSTIEGSPUNKT
// ============================================================
async function loadJahresbeitragData() {
  const container = document.getElementById('jahresbeitrag-container');
  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary"></div>
      <p class="mt-2 text-muted">Lade Beitragsdaten…</p>
    </div>`;
  try {
    // Jahr-Selector aufbauen
    const years = [];
    for (let y = _jbYear; y >= _jbYear - 4; y--) years.push(y);

    const [beitraege, members] = await Promise.all([
      apiFetch('jahresbeitrag', `action=getBeitraege&year=${_jbYear}`).then(r => r.json()),
      apiFetch('jahresbeitrag', `action=getMembers`).then(r => r.json())
    ]);

    if (!beitraege.success) throw new Error(beitraege.error);
    if (!members.success)   throw new Error(members.error);

    // MemberMap aufbauen
    _jbMemberMap = {};
    (members.data || []).forEach(m => { _jbMemberMap[String(m.PersonNumber)] = m; });

    _jbData = beitraege.data || [];
    renderJahresbeitragView(_jbData, years);
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler: ${e.message}</div>`;
  }
}

// ============================================================
// RENDER HAUPTANSICHT
// ============================================================
function renderJahresbeitragView(data, years) {
  const total    = data.reduce((s, r) => s + Number(r.Gesamt || 0), 0);
  const bezahlt  = data.filter(r => r.status === 'bezahlt').reduce((s, r) => s + Number(r.Gesamt || 0), 0);
  const offen    = total - bezahlt;
  const offenCount  = data.filter(r => r.status !== 'bezahlt').length;
  const bezahltCount = data.filter(r => r.status === 'bezahlt').length;

  const yearOptions = (years || [_jbYear]).map(y =>
    `<option value="${y}" ${y == _jbYear ? 'selected' : ''}>${y}</option>`
  ).join('');

  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));

  document.getElementById('jahresbeitrag-container').innerHTML = `
    <!-- Toolbar -->
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <select class="form-select form-select-sm" style="width:100px" id="jbYearSel" onchange="jbChangeYear(this.value)">
        ${yearOptions}
      </select>
      <input type="text" class="form-control form-control-sm" style="width:220px"
             id="jbSearch" placeholder="🔍 Name / PersonNumber…" oninput="jbFilter()">
      <select class="form-select form-select-sm" style="width:130px" id="jbStatusFilter" onchange="jbFilter()">
        <option value="">Alle Status</option>
        <option value="offen">Offen</option>
        <option value="bezahlt">Bezahlt</option>
      </select>
      ${canEdit ? `
      <button class="btn btn-sm btn-outline-warning ms-auto" onclick="jbBerechnen()">
        <i class="fas fa-calculator"></i> Berechnen
      </button>` : ''}
    </div>

    <!-- KPI-Karten -->
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-primary">
          <div class="small text-muted">Total</div>
          <div class="fs-5 fw-bold">${fmtChf(total)}</div>
          <div class="text-muted small">${data.length} Rechnungen</div>
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
                <th>Name</th>
                <th>Kategorie</th>
                <th class="text-end">Gesamt</th>
                <th>Status</th>
                <th>Bezahlt am</th>
                <th>Methode</th>
                <th>Beleg</th>
                ${canEdit ? '<th></th>' : ''}
              </tr>
            </thead>
            <tbody id="jbTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer text-muted small" id="jbCount"></div>
    </div>

    <!-- Modal: Zahlung -->
    <div class="modal fade" id="jbModalZahlung" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">💳 Zahlung erfassen</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
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
              <label class="form-label">Bezahlt am *</label>
              <input type="date" class="form-control" id="jbZahlungDatum">
            </div>
            <div class="mb-3">
              <label class="form-label">Zahlungsmethode</label>
              <select class="form-select" id="jbZahlungMethode">
                <option>Überweisung</option>
                <option>Bar</option>
                <option>TWINT</option>
                <option>E-Banking</option>
                <option>Dauerauftrag</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">Belegnummer / Referenz</label>
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
          <div class="modal-header">
            <h5 class="modal-title">📋 Rechnungsdetail</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="jbModalBody"></div>
        </div>
      </div>
    </div>`;

  jbRenderRows(data);
}

// ============================================================
// TABELLEN-RENDER
// ============================================================
function jbRenderRows(data) {
  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));
  const tbody = document.getElementById('jbTableBody');
  if (!tbody) return;

  tbody.innerHTML = data.map(r => {
    const m    = _jbMemberMap[String(r.PersonNumber)] || {};
    const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : (r._name || r.PersonNumber);
    const kat  = (m._kategorie || '').replace('Aktiv-', 'Aktiv ');
    const isOffen = r.status !== 'bezahlt';

    return `<tr>
      <td>
        <a href="#" class="text-decoration-none fw-semibold"
           onclick="jbShowPositionen(${r.id}); return false;">${name}</a>
        <div class="text-muted small">${r.PersonNumber}</div>
      </td>
      <td><span class="badge bg-secondary">${kat || '–'}</span></td>
      <td class="text-end fw-bold">${fmtChf(r.Gesamt)}</td>
      <td>
        <span class="badge ${isOffen ? 'bg-danger' : 'bg-success'}">
          ${r.status || 'offen'}
        </span>
      </td>
      <td class="small">${fmtDate(r.payment_date)}</td>
      <td class="small">${r.payment_method || '–'}</td>
      <td class="small">${r.document_ref || '–'}</td>
      ${canEdit ? `
      <td>
        ${isOffen ? `
          <button class="btn btn-xs btn-success btn-sm py-0 px-2"
                  onclick="jbOpenZahlung(${r.id}, '${name}', ${r.Gesamt})"
                  title="Zahlung erfassen">
            <i class="fas fa-check"></i>
          </button>` : ''}
      </td>` : ''}
    </tr>`;
  }).join('');

  document.getElementById('jbCount').textContent =
    `${data.length} Einträge · ${data.filter(r => r.status !== 'bezahlt').length} offen`;
}

// ============================================================
// FILTER & SUCHE
// ============================================================
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
// DETAIL: POSITIONEN ANZEIGEN
// ============================================================
async function jbShowPositionen(headerId) {
  const modal = new bootstrap.Modal(document.getElementById('jbModalPositionen'));
  document.getElementById('jbModalBody').innerHTML = `
    <div class="text-center py-3">
      <div class="spinner-border spinner-border-sm text-primary"></div> Lade…
    </div>`;
  modal.show();

  try {
    const res  = await apiFetch('jahresbeitrag', `action=getPositionen&headerId=${headerId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const header = data.header;
    const pos    = data.positions || [];
    const m      = _jbMemberMap[String(header.PersonNumber)] || {};
    const name   = m.FirstName ? `${m.FirstName} ${m.LastName}` : header.PersonNumber;

    const posRows = pos.map(p => `
      <tr>
        <td>${p.position_nr}</td>
        <td>${p.beschreibung}</td>
        <td>
          <span class="badge ${p.typ === 'Kredit' ? 'bg-success' : 'bg-primary'}">
            ${p.typ}
          </span>
        </td>
        <td class="text-end ${p.typ === 'Kredit' ? 'text-success' : ''}">
          ${fmtChf(p.betrag)}
        </td>
      </tr>`).join('');

    document.getElementById('jbModalBody').innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h6 class="mb-0">${name}</h6>
          <small class="text-muted">${header.PersonNumber} · Jahr ${header.year}</small>
        </div>
        <span class="badge fs-6 ${header.status !== 'bezahlt' ? 'bg-danger' : 'bg-success'}">
          ${header.status}
        </span>
      </div>
      <table class="table table-sm">
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
      ${header.payment_date ? `
        <div class="alert alert-success small mb-0">
          ✅ Bezahlt am ${fmtDate(header.payment_date)}
          via ${header.payment_method || '–'} · Beleg: ${header.document_ref || '–'}
        </div>` : ''}`;
  } catch(e) {
    document.getElementById('jbModalBody').innerHTML =
      `<div class="alert alert-danger">Fehler: ${e.message}</div>`;
  }
}

// ============================================================
// ZAHLUNG
// ============================================================
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
    const res  = await apiFetch('jahresbeitrag',
      `action=saveZahlung&headerId=${id}&datum=${datum}&methode=${encodeURIComponent(methode)}&beleg=${encodeURIComponent(beleg)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    bootstrap.Modal.getInstance(document.getElementById('jbModalZahlung')).hide();
    await loadJahresbeitragData();
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Zahlung speichern';
  }
}

// ============================================================
// BEITRÄGE BERECHNEN (nur Admin/Kassier)
// ============================================================
async function jbBerechnen() {
  if (!confirm(`Beiträge für ${_jbYear} berechnen? Bereits berechnete werden übersprungen.`)) return;
  const btn = document.querySelector('button[onclick="jbBerechnen()"]');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Berechne…';
  try {
    const res  = await apiFetch('jahresbeitrag', `action=berechnen&year=${_jbYear}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    alert(data.message || '✅ Fertig');
    await loadJahresbeitragData();
  } catch(e) {
    alert('Fehler: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-calculator"></i> Berechnen';
  }
}

async function jbChangeYear(year) {
  _jbYear = Number(year);
  await loadJahresbeitragData();
}

// ============================================================
// UTILS (lokal, damit kein Konflikt mit anderen Modulen)
// ============================================================
function fmtChf(val) {
  return 'CHF ' + Number(val || 0).toFixed(2);
}
function fmtDate(val) {
  if (!val || val === '') return '–';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('de-CH');
}
