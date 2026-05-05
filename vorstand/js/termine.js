// === MODUL: TERMINE & ORTE ===

let adminState = null;
let originalAdminState = null;

function ensureTermineStylesOnce() {
  if (document.getElementById('termine-inline-style')) return;
  const s = document.createElement('style');
  s.id = 'termine-inline-style';
  s.textContent = `
    /* Alles scoped aufs Termine-Modul */
    #termine-container { position: relative; }

    #termine-container .termine-overlay {
      position: absolute; inset: 0;
      background: rgba(255,255,255,.85);
      display: flex; align-items: center; justify-content: center;
      z-index: 2000;
      border-radius: 12px;
    }

    #termine-container .row-provisorisch { background: #fff3cd; } 
    #termine-container .row-warn { background: #fff8e1; }       
    #termine-container .row-abgesagt { opacity: .6; text-decoration: line-through; }
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
      <div class="text-center p-4 bg-white border rounded shadow-sm">
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

async function loadTermineData() {
  ensureTermineStylesOnce();

  // Flag zurücksetzen damit Events nach Re-Navigation neu gebunden werden (Bug-Fix)
  termineEventsBound = false;

  const container = document.getElementById('termine-container');
  container.innerHTML = `
    <div id="termine-shell">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="small text-muted" id="last-sync">Zuletzt aktualisiert: -</div>
      </div>
      <div id="termine-ui"></div>
    </div>
  `;

  showTermineOverlay(true, 'Lade Termine & Stammdaten…');

  try {
    const res = await apiFetch('termine', 'action=loadAdminData');
    adminState = await res.json();

    if (adminState.dropdowns?.orteMitMaps) {
      adminState.dropdowns.orteMitMaps = adminState.dropdowns.orteMitMaps
        .filter(p => p?.[0]?.trim() || p?.[1]?.trim());
    }

    originalAdminState = JSON.parse(JSON.stringify(adminState));

    renderTermineUI(document.getElementById('termine-ui'));

    const last = document.getElementById('last-sync');
    if (last) last.innerText = 'Zuletzt aktualisiert: ' + new Date().toLocaleString();

  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  } finally {
    showTermineOverlay(false);
  }
}

function formatTime(v) {
  if (!v) return "";
  const s = String(v).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return s; 
}

function renderTermineUI(container) {
    container.innerHTML = `
        <ul class="nav nav-tabs mb-3" id="termine-tabs">
            <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-kalender">📅 Termine</a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-stammdaten">📍 Anlässe & Orte</a></li>
        </ul>

        <div class="tab-content">
            <!-- TAB: TERMINE -->
            <div class="tab-pane fade show active" id="tab-kalender">
                <button class="btn btn-sm btn-success mb-2 write-protected" onclick="addTerminRow()">+ Neuer Termin</button>
                <div class="table-responsive bg-white border rounded">
                    <table class="table table-sm table-hover mb-0" style="min-width: 800px;">
                        <thead class="table-light"><tr><th>Datum</th><th>Start</th><th>Ende</th><th>Anlass</th><th>Ort</th><th>Kat</th><th>Status</th><th></th></tr></thead>
                        <tbody id="termine-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- TAB: STAMMDATEN -->
            <div class="tab-pane fade" id="tab-stammdaten">
                <div class="row g-3">
                    <div class="col-md-6 border-end">
                        <div class="p-2">
                            <h5 class="card-title">Anlass-Typen</h5>
                            <div id="edit-anlaesse"></div>
                            <button class="btn btn-outline-primary btn-sm w-100 mt-2 write-protected" onclick="addAnlass()">+ Typ hinzufügen</button>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-2">
                            <h5 class="card-title">Orte & Maps</h5>
                            <div id="edit-orte"></div>
                            <button class="btn btn-outline-primary btn-sm w-100 mt-2 write-protected" onclick="addOrt()">+ Ort hinzufügen</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    renderTermineList();
    bindTermineEventsOnce();
    renderDropdownEditor();
    
    // Check write protection manually since navTo might have happened before
    if(typeof hasWriteAccess === 'function') {
      const canWrite = hasWriteAccess('termine');
      container.querySelectorAll('.write-protected').forEach(el => {
          if (!canWrite) {
             if(el.tagName === 'BUTTON' || el.classList.contains('btn')) {
                 el.classList.add('d-none');
             } else {
                 el.setAttribute('disabled', 'true');
                 el.setAttribute('readonly', 'true');
             }
          }
      });
    }
}

function renderTermineList() {
  const tbody = document.getElementById('termine-body');
  if (!tbody || !adminState.termine) return;

  const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('termine') : true;

  tbody.innerHTML = adminState.termine.map((t) => {
    const status = String(t.status || '').toLowerCase();
    let rowClass = '';
    if (status === 'abgesagt') rowClass = 'row-abgesagt';
    else if (status === 'provisorisch') rowClass = 'row-provisorisch';
    else if (!t.datum) rowClass = 'row-warn';

   return `
  <tr data-id="${escapeHtml(String(t.id))}" class="${rowClass}">
    <td>
      <input data-field="datum" type="date" class="form-control form-control-sm write-protected" value="${isoDate(t.datum)}" ${!canWrite?'readonly disabled':''}>
    </td>
    <td><input data-field="startzeit" type="time" class="form-control form-control-sm write-protected" value="${formatTime(t.startzeit)}" ${!canWrite?'readonly disabled':''}></td>
    <td><input data-field="endzeit" type="time" class="form-control form-control-sm write-protected" value="${formatTime(t.endzeit)}" ${!canWrite?'readonly disabled':''}></td>

        <td>
          <select data-field="anlasstitel" class="form-select form-select-sm write-protected" ${!canWrite?'readonly disabled':''}>
            <option value="">-- Anlass --</option>
            ${(adminState.dropdowns.anlaesse||[]).map(a =>
              `<option value="${escapeHtml(a)}" ${a===t.anlasstitel?'selected':''}>${escapeHtml(a)}</option>`
            ).join('')}
          </select>
        </td>

        <td>
          <select data-field="ort" class="form-select form-select-sm write-protected" ${!canWrite?'readonly disabled':''}>
            <option value="">-- Ort --</option>
            ${(adminState.dropdowns.orteMitMaps||[]).map(o =>
              `<option value="${escapeHtml(o[0])}" ${o[0]===t.ort?'selected':''}>${escapeHtml(o[0])}</option>`
            ).join('')}
          </select>
        </td>

        <td>
          <select data-field="kategorie" class="form-select form-select-sm write-protected" ${!canWrite?'readonly disabled':''}>
            <option value="">-- Kat --</option>
            ${(adminState.dropdowns.kategorien||[]).map(k =>
              `<option value="${escapeHtml(k)}" ${k===t.kategorie?'selected':''}>${escapeHtml(k)}</option>`
            ).join('')}
          </select>
        </td>

        <td>
          <select data-field="status" class="form-select form-select-sm write-protected" ${!canWrite?'readonly disabled':''}>
            <option value="">-- Status --</option>
            ${['fix','provisorisch','abgesagt'].map(s =>
              `<option value="${s}" ${s===t.status?'selected':''}>${s}</option>`
            ).join('')}
          </select>
        </td>

        <td><button type="button" class="btn btn-link text-danger p-0 write-protected ${!canWrite ? 'd-none':''}" data-action="remove">🗑️</button></td>
      </tr>
    `;
  }).join('');
}

function isoDate(v) {
  if (!v) return "";
  try {
    if (String(v).match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
      const [day, month, year] = String(v).split('.');
      return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
    }
    const s = String(v);
    return s.includes('T') ? s.split('T')[0] : s;
  } catch(e) { return v; }
}

function applyDefaultsOnDateSetById(id) {
  const idx = adminState.termine.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;

  const t = adminState.termine[idx];
  if (!t.datum) return;

  if (!t.startzeit) t.startzeit = "19:00";
  if (!t.endzeit)   t.endzeit   = "22:00";
  if (!t.status)    t.status    = "provisorisch";
  if (!t.kategorie) t.kategorie = "Jahresprogramm";
}

function renderDropdownEditor() {
  if (!adminState.dropdowns) adminState.dropdowns = { anlaesse: [], orteMitMaps: [], kategorien: [] };

  const a = document.getElementById('edit-anlaesse');
  const o = document.getElementById('edit-orte');
  
  const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('termine') : true;

  if (a) {
    const arr = (adminState.dropdowns.anlaesse || []);
    adminState.dropdowns.anlaesse = arr;

    a.innerHTML = arr.map((val, i) => `
      <div class="d-flex gap-2 mb-2">
        <input type="text" class="form-control form-control-sm write-protected"
          value="${escapeHtml(val || '')}"
          onchange="adminState.dropdowns.anlaesse[${i}]=this.value; window.markUnsaved();" ${!canWrite?'readonly disabled':''}>
        <button class="btn btn-outline-danger btn-sm write-protected ${!canWrite ? 'd-none':''}" onclick="removeAnlass(${i})">✕</button>
      </div>
    `).join('');
  }

  if (o) {
    const arr = (adminState.dropdowns.orteMitMaps || []).map(p => [String(p?.[0] || ''), String(p?.[1] || '')]);
    adminState.dropdowns.orteMitMaps = arr;

    o.innerHTML = arr.map((pair, i) => {
      const hidden = (!pair[0] && !pair[1]) ? 'style="display:none"' : '';
      return `
        <div class="d-flex gap-2 mb-2" ${hidden}>
          <input type="text" class="form-control form-control-sm write-protected"
            placeholder="Ort" value="${escapeHtml(pair[0] || '')}"
            onchange="adminState.dropdowns.orteMitMaps[${i}][0]=this.value; window.markUnsaved();" ${!canWrite?'readonly disabled':''}>
          <input type="text" class="form-control form-control-sm write-protected"
            placeholder="Map Link" value="${escapeHtml(pair[1] || '')}"
            onchange="adminState.dropdowns.orteMitMaps[${i}][1]=this.value; window.markUnsaved();" ${!canWrite?'readonly disabled':''}>
          <button class="btn btn-outline-danger btn-sm write-protected ${!canWrite ? 'd-none':''}" onclick="removeOrt(${i})">✕</button>
        </div>
      `;
    }).join('');
  }
}

function cleanupDropdownsForSave() {
  adminState.dropdowns.anlaesse = (adminState.dropdowns.anlaesse || [])
    .map(x => String(x||'').trim())
    .filter(Boolean);

  adminState.dropdowns.orteMitMaps = (adminState.dropdowns.orteMitMaps || [])
    .map(p => [String(p?.[0]||'').trim(), String(p?.[1]||'').trim()])
    .filter(p => p[0]);
}

function addAnlass() {
  window.markUnsaved();
  adminState.dropdowns.anlaesse = adminState.dropdowns.anlaesse || [];
  adminState.dropdowns.anlaesse.push('');
  renderDropdownEditor();
}

function removeAnlass(i) {
  window.markUnsaved();
  adminState.dropdowns.anlaesse.splice(i, 1);
  renderDropdownEditor();
}

function addOrt() {
  window.markUnsaved();
  adminState.dropdowns.orteMitMaps = adminState.dropdowns.orteMitMaps || [];
  adminState.dropdowns.orteMitMaps.push(['', '']);
  renderDropdownEditor();
}

function removeOrt(i) {
  window.markUnsaved();
  adminState.dropdowns.orteMitMaps.splice(i, 1);
  renderDropdownEditor();
}

function addTerminRow() {
  window.markUnsaved();
  adminState.termine.push({
    id: generateTerminId(),
    datum: "", startzeit: "", endzeit: "", anlasstitel: "", ort: "", kategorie: "", status: ""
  });
  renderTermineList();
}

function generateTerminId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function sortTermineForSave() {
  adminState.termine.sort((a, b) => {
    if (!a.datum && !b.datum) return 0;
    if (!a.datum) return 1;
    if (!b.datum) return -1;
    return new Date(a.datum) - new Date(b.datum);
  });
}

async function saveTermineData() {
    if(!confirm("Alle Änderungen speichern?")) return;
    sortTermineForSave();
    cleanupDropdownsForSave();
    const user = localStorage.getItem('portal_user') || "Admin";

  const payload = {
    action: "saveAdminData",
    user: user,
    termine: adminState.termine,
    platzhalter: adminState.platzhalter,
    app_info: adminState.app_info,
    dropdowns: adminState.dropdowns,
    logDetails: buildChangeLogDetails()
  };

    try {
        await apiFetch('termine', '', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        window.clearUnsaved();
        alert("✅ Gespeichert!");
        loadTermineData();
    } catch(e) {
        alert("Fehler beim Speichern: " + e);
    }
}

function buildChangeLogDetails() {
  if (!originalAdminState) return "Daten aktualisiert";
  const changed = [];
  if (JSON.stringify(adminState.termine) !== JSON.stringify(originalAdminState.termine)) changed.push("Termine");
  if (JSON.stringify(adminState.dropdowns) !== JSON.stringify(originalAdminState.dropdowns)) changed.push("Stammdaten");
  return changed.length ? ("Geändert: " + changed.join(", ")) : "Speichern ohne Änderungen";
}

let termineEventsBound = false;

function bindTermineEventsOnce() {
  if (termineEventsBound) return;
  termineEventsBound = true;

  const root = document.getElementById('termine-container');
  if (!root) return;

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.field) return;
    if (!el.closest('#termine-body')) return;

    window.markUnsaved();

    const tr = el.closest('tr[data-id]');
    if (!tr) return;

    const id = tr.dataset.id;
    const field = el.dataset.field;

    setTerminFieldById(id, field, el.value);

    // Apply defaults silently without re-rendering everything
    if (field === 'datum') {
        applyDefaultsOnDateSetById(id);
        const t = adminState.termine.find(x => String(x.id) === String(id));
        if(t) {
            tr.querySelector('[data-field="startzeit"]').value = formatTime(t.startzeit);
            tr.querySelector('[data-field="endzeit"]').value = formatTime(t.endzeit);
            tr.querySelector('[data-field="kategorie"]').value = t.kategorie;
            tr.querySelector('[data-field="status"]').value = t.status;
        }
    }
    if (field === 'ort') applyOrtMapById(id, el.value);

    // Update row colors directly without stealing focus
    const t = adminState.termine.find(x => String(x.id) === String(id));
    if(t) {
       tr.className = '';
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

    window.markUnsaved();
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
  if (!confirm("Termin wirklich löschen?")) return;
  adminState.termine = adminState.termine.filter(t => String(t.id) !== String(id));
  renderTermineList();
}
