/**
 * termine-ui.js
 * Modul: JAHRESPROGRAMM (Termine, Anlässe & Orte) - UI & RENDERING
 *
 * Implementiert den TableKit-Standard:
 * - Spalten-Sortierung (Header-Klick mit Sort-Indikator)
 * - Drag & Drop Verschiebung von Zeilen (Reordering mit Handle ⋮⋮)
 * - Live-Filterung (Suchfeld & Status-Pills)
 * - Einklappbare Sektionen für Stammdaten
 */

let termineFilterCtrl = null;
let termineEventsBound = false;

function ensureTermineStylesOnce() {
  if (document.getElementById('termine-inline-style')) return;
  const s = document.createElement('style');
  s.id = 'termine-inline-style';
  s.textContent = `
    #termine-container {
      position: relative;
      padding-bottom: 90px;
    }
    #termine-container .termine-overlay {
      position: absolute; inset: 0;
      background: rgba(255,255,255,.85);
      display: flex; align-items: center; justify-content: center;
      z-index: 2000;
      border-radius: 12px;
    }
    #termine-container .row-provisorisch { background-color: #fff8e1 !important; }
    #termine-container .row-abgesagt { opacity: .55; text-decoration: line-through; background-color: #f8f9fa !important; }
    #termine-container .row-warn { background-color: #fff3cd !important; }

    .termine-map-btn {
      color: #0d6efd;
      text-decoration: none;
      font-size: 0.9rem;
      padding: 0 4px;
    }
    .termine-map-btn:hover {
      color: #0a58ca;
    }

    @media (max-width: 1199px) {
      #termine-container {
        padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px));
      }
    }
  `;
  document.head.appendChild(s);
}

function showTermineOverlay(show, text) {
  const container = document.getElementById('termine-container');
  if (!container) return;

  let overlay = container.querySelector('.termine-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'termine-overlay';
    overlay.innerHTML = `
      <div class="text-center p-4 bg-white border rounded-3 shadow-sm">
        <div class="spinner-border text-primary"></div>
        <div class="mt-2 small text-muted" id="termine-overlay-text">Lade…</div>
      </div>
    `;
    container.appendChild(overlay);
  }

  const t = overlay.querySelector('#termine-overlay-text');
  if (t) t.innerText = text || 'Lade…';
  overlay.style.display = show ? 'flex' : 'none';
}

function renderTermineUI(container) {
  if (!container || !adminState) return;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <ul class="nav nav-pills" id="termine-tabs">
        <li class="nav-item">
          <a class="nav-link active" data-bs-toggle="tab" href="#tab-kalender">
            📅 Jahresprogramm <span class="badge bg-secondary ms-1" id="termine-count-badge">0</span>
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" data-bs-toggle="tab" href="#tab-stammdaten">
            📍 Anlässe & Orte (Stammdaten)
          </a>
        </li>
      </ul>
    </div>

    <div class="tab-content">
      <!-- TAB 1: TERMINE / JAHRESPROGRAMM -->
      <div class="tab-pane fade show active" id="tab-kalender">
        <div class="card border-0 shadow-sm mb-3">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="d-flex align-items-center flex-wrap gap-2">
                <button class="btn btn-sm btn-success write-protected" onclick="addTerminRow()">
                  <i class="fas fa-plus me-1"></i> Neuer Termin
                </button>
                <div class="vr mx-1 d-none d-md-block"></div>
                <!-- TableKit Filter-Pills -->
                <div class="tk-filter-pills" id="termine-status-pills">
                  <button type="button" class="tk-pill-btn active" data-filter="all">Alle</button>
                  <button type="button" class="tk-pill-btn" data-filter="active-only">Nur Aktive (ohne Abgesagt)</button>
                  <button type="button" class="tk-pill-btn" data-filter="fix">Fix</button>
                  <button type="button" class="tk-pill-btn" data-filter="provisorisch">Provisorisch</button>
                  <button type="button" class="tk-pill-btn" data-filter="abgesagt">Abgesagt</button>
                </div>
              </div>
              <!-- Suchfeld & Spalten Toggle -->
              <div class="d-flex align-items-center gap-2">
                <div class="input-group input-group-sm" style="max-width: 240px;">
                  <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>
                  <input type="text" id="termine-search-input" class="form-control border-start-0" placeholder="Termine filtern…">
                </div>
                <div id="termine-column-toggle"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- TABELLE -->
        <div class="table-responsive bg-white border rounded-3 shadow-sm">
          <table class="table table-sm table-hover align-middle mb-0" id="termine-table" style="min-width: 860px;">
            <thead class="table-light">
              <tr>
                <th style="width: 40px;" class="text-center" title="Manuell verschieben (Drag & Drop)">⋮⋮</th>
                <th data-sort-key="datum" data-col-id="datum" data-col-name="Datum" style="width: 140px;">Datum</th>
                <th data-sort-key="startzeit" data-col-id="startzeit" data-col-name="Start" style="width: 95px;">Start</th>
                <th data-sort-key="endzeit" data-col-id="endzeit" data-col-name="Ende" style="width: 95px;">Ende</th>
                <th data-sort-key="anlasstitel" data-col-id="anlasstitel" data-col-name="Anlass">Anlass</th>
                <th data-sort-key="ort" data-col-id="ort" data-col-name="Ort / Map">Ort / Map</th>
                <th data-sort-key="kategorie" data-col-id="kategorie" data-col-name="Kategorie" style="width: 130px;">Kategorie</th>
                <th data-sort-key="status" data-col-id="status" data-col-name="Status" style="width: 130px;">Status</th>
                <th style="width: 45px;"></th>
              </tr>
            </thead>
            <tbody id="termine-body"></tbody>
          </table>
        </div>
        <div class="small text-muted mt-2 d-flex justify-content-between">
          <span><i class="fas fa-info-circle me-1"></i>Tipp: Klicke auf die Spaltenüberschriften zum <strong>Sortieren</strong> oder ziehe Zeilen an <strong>⋮⋮</strong> zum <strong>Verschieben</strong>.</span>
          <span id="termine-filter-status" class="fw-bold"></span>
        </div>
      </div>

      <!-- TAB 2: STAMMDATEN (ANLÄSSE & ORTE) -->
      <div class="tab-pane fade" id="tab-stammdaten">
        <div class="row g-3">
          <!-- ANLASS-TYPEN -->
          <div class="col-md-6">
            <div class="card shadow-sm border-0 h-100">
              <div class="card-header bg-white border-bottom d-flex justify-content-between align-items-center py-2">
                <h6 class="mb-0 fw-bold" id="header-anlaesse">
                  <i class="fas fa-bullseye text-primary me-2"></i>Anlass-Typen
                </h6>
                <div class="d-flex gap-1">
                  <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="sortAnlaesseAZ()" title="Alphabetisch sortieren (A-Z)">
                    A–Z <i class="fas fa-sort-alpha-down"></i>
                  </button>
                  <button class="btn btn-primary btn-sm py-0 px-2 write-protected" onclick="addAnlass()">
                    + Typ
                  </button>
                </div>
              </div>
              <div class="card-body p-3" id="content-anlaesse">
                <p class="small text-muted mb-2">Reihenfolge bestimmt die Anordnung im Dropdown. Per <strong>⋮⋮</strong> verschiebbar.</p>
                <div id="edit-anlaesse" class="d-flex flex-column gap-2"></div>
              </div>
            </div>
          </div>

          <!-- ORTE & MAPS -->
          <div class="col-md-6">
            <div class="card shadow-sm border-0 h-100">
              <div class="card-header bg-white border-bottom d-flex justify-content-between align-items-center py-2">
                <h6 class="mb-0 fw-bold" id="header-orte">
                  <i class="fas fa-map-marker-alt text-danger me-2"></i>Orte & Google Maps
                </h6>
                <div class="d-flex gap-1">
                  <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="sortOrteAZ()" title="Alphabetisch sortieren (A-Z)">
                    A–Z <i class="fas fa-sort-alpha-down"></i>
                  </button>
                  <button class="btn btn-primary btn-sm py-0 px-2 write-protected" onclick="addOrt()">
                    + Ort
                  </button>
                </div>
              </div>
              <div class="card-body p-3" id="content-orte">
                <p class="small text-muted mb-2">Orte und Google Maps Links. Reihenfolge per <strong>⋮⋮</strong> frei verschiebbar.</p>
                <div id="edit-orte" class="d-flex flex-column gap-2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  renderTermineList();
  renderDropdownEditor();
  bindTermineEventsOnce();
  initTableKitForTermine();
  applyWriteProtection();
}

function renderTermineList() {
  const tbody = document.getElementById('termine-body');
  if (!tbody || !adminState?.termine) return;

  const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('termine') : true;

  tbody.innerHTML = adminState.termine.map((t, idx) => {
    const status = String(t.status || '').toLowerCase();
    let rowClass = '';
    if (status === 'abgesagt') rowClass = 'row-abgesagt';
    else if (status === 'provisorisch') rowClass = 'row-provisorisch';
    else if (!t.datum) rowClass = 'row-warn';

    const mapUrl = t.austragungsorte_map || '';
    const mapBtn = mapUrl
      ? `<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener" class="termine-map-btn" title="Google Maps öffnen"><i class="fas fa-map-marked-alt"></i></a>`
      : '';

    return `
      <tr data-id="${escapeHtml(String(t.id))}" class="tk-draggable-item ${rowClass}" draggable="true" data-index="${idx}">
        <td class="text-center align-middle">
          <span class="tk-drag-handle ${!canWrite ? 'd-none' : ''}" title="Zeile ziehen zum Verschieben">⋮⋮</span>
        </td>
        <td class="tk-col-datum">
          <input data-field="datum" type="date" class="form-control form-control-sm write-protected"
            value="${isoDate(t.datum)}" ${!canWrite ? 'readonly disabled' : ''}>
        </td>
        <td class="tk-col-startzeit">
          <input data-field="startzeit" type="time" class="form-control form-control-sm write-protected"
            value="${formatTime(t.startzeit)}" ${!canWrite ? 'readonly disabled' : ''}>
        </td>
        <td class="tk-col-endzeit">
          <input data-field="endzeit" type="time" class="form-control form-control-sm write-protected"
            value="${formatTime(t.endzeit)}" ${!canWrite ? 'readonly disabled' : ''}>
        </td>
        <td class="tk-col-anlasstitel">
          <select data-field="anlasstitel" class="form-select form-select-sm write-protected" ${!canWrite ? 'readonly disabled' : ''}>
            <option value="">-- Anlass --</option>
            ${(adminState.dropdowns.anlaesse || []).map(a =>
              `<option value="${escapeHtml(a)}" ${a === t.anlasstitel ? 'selected' : ''}>${escapeHtml(a)}</option>`
            ).join('')}
          </select>
        </td>
        <td class="tk-col-ort">
          <div class="d-flex align-items-center gap-1">
            <select data-field="ort" class="form-select form-select-sm write-protected" ${!canWrite ? 'readonly disabled' : ''}>
              <option value="">-- Ort --</option>
              ${(adminState.dropdowns.orteMitMaps || []).map(o =>
                `<option value="${escapeHtml(o[0])}" ${o[0] === t.ort ? 'selected' : ''}>${escapeHtml(o[0])}</option>`
              ).join('')}
            </select>
            <span class="ort-map-icon">${mapBtn}</span>
          </div>
        </td>
        <td class="tk-col-kategorie">
          <select data-field="kategorie" class="form-select form-select-sm write-protected" ${!canWrite ? 'readonly disabled' : ''}>
            ${(adminState.dropdowns.kategorien || ['Jahresprogramm', 'Schiesstermine']).map(k =>
              `<option value="${escapeHtml(k)}" ${k === t.kategorie ? 'selected' : ''}>${escapeHtml(k)}</option>`
            ).join('')}
          </select>
        </td>
        <td class="tk-col-status">
          <select data-field="status" class="form-select form-select-sm write-protected" ${!canWrite ? 'readonly disabled' : ''}>
            ${['fix', 'provisorisch', 'abgesagt'].map(s =>
              `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </td>
        <td class="text-center">
          <button type="button" class="btn btn-link text-danger p-0 write-protected ${!canWrite ? 'd-none' : ''}" data-action="remove" title="Termin löschen">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const countBadge = document.getElementById('termine-count-badge');
  if (countBadge) countBadge.innerText = adminState.termine.length;
  if (window._termineColToggle) window._termineColToggle.apply();
}

function renderDropdownEditor() {
  if (!adminState?.dropdowns) adminState.dropdowns = { anlaesse: [], orteMitMaps: [], kategorien: [] };

  const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('termine') : true;
  const a = document.getElementById('edit-anlaesse');
  const o = document.getElementById('edit-orte');

  if (a) {
    const arr = adminState.dropdowns.anlaesse || [];
    a.innerHTML = arr.map((val, i) => `
      <div class="d-flex align-items-center gap-2 tk-draggable-item p-1 bg-light rounded" data-index="${i}" data-id="anlass_${i}" draggable="true">
        <span class="tk-drag-handle ${!canWrite ? 'd-none' : ''}" title="Verschieben">⋮⋮</span>
        <input type="text" class="form-control form-control-sm write-protected bg-white"
          value="${escapeHtml(val || '')}"
          placeholder="Anlass-Bezeichnung"
          onchange="adminState.dropdowns.anlaesse[${i}]=this.value; if(window.markUnsaved) window.markUnsaved();" ${!canWrite ? 'readonly disabled' : ''}>
        <button class="btn btn-outline-danger btn-sm write-protected ${!canWrite ? 'd-none' : ''}" onclick="removeAnlass(${i})" title="Entfernen">✕</button>
      </div>
    `).join('');
  }

  if (o) {
    const arr = (adminState.dropdowns.orteMitMaps || []).map(p => [String(p?.[0] || ''), String(p?.[1] || '')]);
    adminState.dropdowns.orteMitMaps = arr;

    o.innerHTML = arr.map((pair, i) => `
      <div class="d-flex align-items-center gap-2 tk-draggable-item p-1 bg-light rounded" data-index="${i}" data-id="ort_${i}" draggable="true">
        <span class="tk-drag-handle ${!canWrite ? 'd-none' : ''}" title="Verschieben">⋮⋮</span>
        <input type="text" class="form-control form-control-sm write-protected bg-white"
          placeholder="Ort" value="${escapeHtml(pair[0] || '')}" style="width: 45%;"
          onchange="adminState.dropdowns.orteMitMaps[${i}][0]=this.value; if(window.markUnsaved) window.markUnsaved();" ${!canWrite ? 'readonly disabled' : ''}>
        <div class="input-group input-group-sm">
          <input type="text" class="form-control form-control-sm write-protected bg-white"
            placeholder="Google Maps Link" value="${escapeHtml(pair[1] || '')}"
            onchange="adminState.dropdowns.orteMitMaps[${i}][1]=this.value; if(window.markUnsaved) window.markUnsaved();" ${!canWrite ? 'readonly disabled' : ''}>
          ${pair[1] ? `<a href="${escapeHtml(pair[1])}" target="_blank" rel="noopener" class="btn btn-outline-secondary" title="Karte öffnen"><i class="fas fa-external-link-alt"></i></a>` : ''}
        </div>
        <button class="btn btn-outline-danger btn-sm write-protected ${!canWrite ? 'd-none' : ''}" onclick="removeOrt(${i})" title="Entfernen">✕</button>
      </div>
    `).join('');
  }
}

// =========================================================
//  TABLEKIT INITIALISIERUNG
// =========================================================
function initTableKitForTermine() {
  if (typeof window.TableKit === 'undefined') {
    console.warn('TableKit noch nicht bereit.');
    return;
  }

  // 1. Spalten-Sortierung
  window.TableKit.makeSortable(document.getElementById('termine-table'), {
    onSort: (key, dir) => {
      if (!adminState?.termine) return;
      adminState.termine.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];
        if (key === 'datum') {
          return dir === 'desc'
            ? (new Date(b.datum || '1970-01-01') - new Date(a.datum || '1970-01-01'))
            : (new Date(a.datum || '9999-12-31') - new Date(b.datum || '9999-12-31'));
        }
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
        return dir === 'desc' ? valB.localeCompare(valA, 'de-CH') : valA.localeCompare(valB, 'de-CH');
      });
      renderTermineList();
      if (window.markUnsaved) window.markUnsaved();
      if (termineFilterCtrl) termineFilterCtrl.apply();
    }
  });

  // 2. Drag & Drop Reordering für Termine
  window.TableKit.makeDraggable(document.getElementById('termine-body'), {
    itemSelector: 'tr[data-id]',
    onReorder: (newIds) => {
      if (!adminState?.termine) return;
      const termMap = new Map(adminState.termine.map(t => [String(t.id), t]));
      const reordered = [];
      newIds.forEach((id, idx) => {
        const t = termMap.get(String(id));
        if (t) {
          t.sort_order = idx + 1;
          reordered.push(t);
        }
      });
      adminState.termine.forEach(t => {
        if (!newIds.includes(String(t.id))) reordered.push(t);
      });
      adminState.termine = reordered;
      if (window.markUnsaved) window.markUnsaved();
      console.log('🔄 Termine neu angeordnet via Drag & Drop.');
    }
  });

  // 3. Drag & Drop Reordering für Anlass-Typen
  window.TableKit.makeDraggable(document.getElementById('edit-anlaesse'), {
    itemSelector: '.tk-draggable-item',
    onReorder: (_, items) => {
      const newAnlaesse = items.map(el => el.querySelector('input')?.value || '').filter(Boolean);
      adminState.dropdowns.anlaesse = newAnlaesse;
      if (window.markUnsaved) window.markUnsaved();
    }
  });

  // 4. Drag & Drop Reordering für Orte & Maps
  window.TableKit.makeDraggable(document.getElementById('edit-orte'), {
    itemSelector: '.tk-draggable-item',
    onReorder: (_, items) => {
      const newOrte = items.map(el => {
        const inputs = el.querySelectorAll('input');
        return [inputs[0]?.value || '', inputs[1]?.value || ''];
      }).filter(p => p[0]);
      adminState.dropdowns.orteMitMaps = newOrte;
      if (window.markUnsaved) window.markUnsaved();
    }
  });

  // 5. Filterung & Suche
  termineFilterCtrl = window.TableKit.setupFilter({
    searchInput: '#termine-search-input',
    pillsContainer: '#termine-status-pills',
    container: '#termine-body',
    rowSelector: 'tr[data-id]',
    countBadge: '#termine-count-badge',
    getStatus: (row) => row.querySelector('[data-field="status"]')?.value || '',
    onFilterChange: (visibleCount, filter) => {
      const statusSpan = document.getElementById('termine-filter-status');
      if (statusSpan) {
        statusSpan.innerText = `${visibleCount} von ${adminState.termine.length} angezeigt`;
      }
    }
  });

  if (termineFilterCtrl) termineFilterCtrl.apply();

  // 6. Einklappbare Sektionen
  window.TableKit.setupCollapsible(
    document.getElementById('header-anlaesse'),
    document.getElementById('content-anlaesse'),
    'termine_anlaesse'
  );
  window.TableKit.setupCollapsible(
    document.getElementById('header-orte'),
    document.getElementById('content-orte'),
    'termine_orte'
  );

  // 7. Spalten-Sichtbarkeit / Ein- und Ausblenden
  if (typeof window.TableKit.setupColumnToggle === 'function') {
    window._termineColToggle = window.TableKit.setupColumnToggle('#termine-table', {
      container: '#termine-column-toggle',
      storageKey: 'termine_columns_visibility'
    });
  }
}

// =========================================================
//  EVENTS & MUTATIONEN
// =========================================================
function bindTermineEventsOnce() {
  if (termineEventsBound) return;
  termineEventsBound = true;

  const root = document.getElementById('termine-container');
  if (!root) return;

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (!el?.dataset?.field) return;
    if (!el.closest('#termine-body')) return;

    if (window.markUnsaved) window.markUnsaved();

    const tr = el.closest('tr[data-id]');
    if (!tr) return;

    const id = tr.dataset.id;
    const field = el.dataset.field;

    setTerminFieldById(id, field, el.value);

    if (field === 'datum') {
      applyDefaultsOnDateSetById(id);
      const t = adminState.termine.find(x => String(x.id) === String(id));
      if (t) {
        tr.querySelector('[data-field="startzeit"]').value = formatTime(t.startzeit);
        tr.querySelector('[data-field="endzeit"]').value = formatTime(t.endzeit);
        tr.querySelector('[data-field="kategorie"]').value = t.kategorie;
        tr.querySelector('[data-field="status"]').value = t.status;
      }
    }

    if (field === 'ort') {
      applyOrtMapById(id, el.value);
      const t = adminState.termine.find(x => String(x.id) === String(id));
      const iconSpan = tr.querySelector('.ort-map-icon');
      if (iconSpan) {
        iconSpan.innerHTML = t?.austragungsorte_map
          ? `<a href="${escapeHtml(t.austragungsorte_map)}" target="_blank" rel="noopener" class="termine-map-btn" title="Google Maps öffnen"><i class="fas fa-map-marked-alt"></i></a>`
          : '';
      }
    }

    const t = adminState.termine.find(x => String(x.id) === String(id));
    if (t) {
      tr.className = 'tk-draggable-item';
      const status = String(t.status || '').toLowerCase();
      if (status === 'abgesagt') tr.classList.add('row-abgesagt');
      else if (status === 'provisorisch') tr.classList.add('row-provisorisch');
      else if (!t.datum) tr.classList.add('row-warn');
    }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="remove"]');
    if (!btn || !btn.closest('#termine-body')) return;

    const tr = btn.closest('tr[data-id]');
    if (!tr) return;

    if (window.markUnsaved) window.markUnsaved();
    removeTerminById(tr.dataset.id);
  });
}

function applyOrtMapById(id, ortName) {
  const idx = adminState.termine.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;
  const found = (adminState.dropdowns.orteMitMaps || []).find(o => o[0] === ortName);
  adminState.termine[idx].austragungsorte_map = found ? (found[1] || '') : '';
}

function setTerminFieldById(id, field, value) {
  const idx = adminState.termine.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;
  adminState.termine[idx][field] = value;
}

function removeTerminById(id) {
  if (!confirm('Termin wirklich löschen?')) return;
  adminState.termine = adminState.termine.filter(t => String(t.id) !== String(id));
  renderTermineList();
  initTableKitForTermine();
}

function addTerminRow() {
  if (window.markUnsaved) window.markUnsaved();
  adminState.termine.unshift({
    id: generateTerminId(),
    datum: '',
    startzeit: '19:00',
    endzeit: '22:00',
    anlasstitel: '',
    ort: (adminState.dropdowns.orteMitMaps?.[0]?.[0] || 'Schiessanlage Muhen'),
    kategorie: 'Jahresprogramm',
    status: 'provisorisch',
    austragungsorte_map: (adminState.dropdowns.orteMitMaps?.[0]?.[1] || ''),
    typ: 'verein',
    sort_order: 0
  });
  renderTermineList();
  initTableKitForTermine();
}

function addAnlass() {
  if (window.markUnsaved) window.markUnsaved();
  adminState.dropdowns.anlaesse = adminState.dropdowns.anlaesse || [];
  adminState.dropdowns.anlaesse.push('');
  renderDropdownEditor();
  initTableKitForTermine();
}

function removeAnlass(i) {
  if (window.markUnsaved) window.markUnsaved();
  adminState.dropdowns.anlaesse.splice(i, 1);
  renderDropdownEditor();
  initTableKitForTermine();
}

function sortAnlaesseAZ() {
  if (!adminState?.dropdowns?.anlaesse) return;
  if (window.markUnsaved) window.markUnsaved();
  adminState.dropdowns.anlaesse.sort((a, b) => a.localeCompare(b, 'de-CH'));
  renderDropdownEditor();
  initTableKitForTermine();
}

function addOrt() {
  if (window.markUnsaved) window.markUnsaved();
  adminState.dropdowns.orteMitMaps = adminState.dropdowns.orteMitMaps || [];
  adminState.dropdowns.orteMitMaps.push(['', '']);
  renderDropdownEditor();
  initTableKitForTermine();
}

function removeOrt(i) {
  if (window.markUnsaved) window.markUnsaved();
  adminState.dropdowns.orteMitMaps.splice(i, 1);
  renderDropdownEditor();
  initTableKitForTermine();
}

function sortOrteAZ() {
  if (!adminState?.dropdowns?.orteMitMaps) return;
  if (window.markUnsaved) window.markUnsaved();
  adminState.dropdowns.orteMitMaps.sort((a, b) => (a[0] || '').localeCompare(b[0] || '', 'de-CH'));
  renderDropdownEditor();
  initTableKitForTermine();
}

function applyWriteProtection() {
  const container = document.getElementById('termine-container');
  if (!container || typeof hasWriteAccess !== 'function') return;

  const canWrite = hasWriteAccess('termine');
  container.querySelectorAll('.write-protected').forEach(el => {
    if (!canWrite) {
      if (el.tagName === 'BUTTON' || el.classList.contains('btn')) {
        el.classList.add('d-none');
      } else {
        el.setAttribute('disabled', 'true');
        el.setAttribute('readonly', 'true');
      }
    }
  });
}
