// vorstand/js/jahresbeitrag/jahresbeitrag-gebuehren.js
// ============================================================
// GEBÜHREN-KONFIGURATION (MEMBERS100) - MANAGEMENT IM FRONTEND
// ============================================================

let _jbGebuehrenSearch = '';
let _jbGebuehrenKategorieFilter = '';
let _jbGebuehrenGruppeFilter = '';

function renderGebuehrenConfigTab() {
  return `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
      
      <!-- Kopfbereich -->
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pb-3 mb-3 border-bottom">
        <div>
          <h4 class="mb-1 text-primary fw-bold">
            <i class="fas fa-sliders-h me-2"></i>Gebühren-Konfiguration
          </h4>
          <p class="text-muted small mb-0">
            Verwalten Sie alle Tarife, Wettkampfgebühren und UI-Darstellungstypen (Members100 <code>gebuehrenconfig</code>).
          </p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" onclick="jbReloadGebuehrenData()">
            <i class="fas fa-sync-alt me-1"></i> Neu laden
          </button>
          <button class="btn btn-sm btn-success fw-bold shadow-sm" onclick="jbOpenEditGebuehrModal('')">
            <i class="fas fa-plus me-1"></i> Neue Gebühr anlegen
          </button>
        </div>
      </div>

      <!-- Filterleiste -->
      <div class="row g-2 mb-3 align-items-center">
        <div class="col-md-4">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control" id="jbGebuehrSearch" placeholder="Suche nach Key, Bezeichnung, Konto..." oninput="jbFilterGebuehrenTable()">
          </div>
        </div>
        <div class="col-md-3">
          <select class="form-select form-select-sm" id="jbGebuehrKatFilter" onchange="jbFilterGebuehrenTable()">
            <option value="">Alle Kategorien (Kategorie)</option>
          </select>
        </div>
        <div class="col-md-3">
          <select class="form-select form-select-sm" id="jbGebuehrGruppeFilter" onchange="jbFilterGebuehrenTable()">
            <option value="">Alle UI-Gruppen (ui_gruppe)</option>
          </select>
        </div>
        <div class="col-md-2 text-end text-muted small" id="jbGebuehrenCount">
          <!-- Anzahl -->
        </div>
      </div>

      <!-- Tabelle -->
      <div class="table-responsive border rounded-3 overflow-hidden shadow-sm">
        <table class="table table-hover table-sm align-middle mb-0" id="jbGebuehrenTable">
          <thead class="table-light small text-muted text-uppercase" style="font-size: 11px;">
            <tr>
              <th style="width: 75px;">Key</th>
              <th style="width: 105px;">Kategorie</th>
              <th style="width: 95px;">Zielgruppe</th>
              <th>Bezeichnung Frontend</th>
              <th class="text-end" style="width: 90px;">Betrag</th>
              <th style="width: 95px;">Konto</th>
              <th>UI-Gruppe (Card)</th>
              <th>UI-Feld</th>
              <th style="width: 110px;">UI-Typ</th>
              <th class="text-center" style="width: 55px;">Sort</th>
              <th class="text-center" style="width: 60px;">Aktiv</th>
              <th class="text-end" style="width: 65px;">Aktion</th>
            </tr>
          </thead>
          <tbody id="jbGebuehrenTableBody">
            <!-- Dynamisch gerendert -->
          </tbody>
        </table>
      </div>

    </div>

    <!-- Modals für Bearbeitung -->
    ${renderGebuehrenConfigModals()}
  `;
}

function renderGebuehrenConfigModals() {
  return `
    <div class="modal fade" id="jbModalGebuehrEdit" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content shadow">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title" id="jbModalGebuehrTitle">⚙️ Gebühr bearbeiten</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="jbFormGebuehr" onsubmit="event.preventDefault(); jbSaveGebuehrFromModal();">
              
              <!-- 💡 Aufklappbarer Spickzettel & Erklärung der UI-Felder -->
              <div class="card border-info-subtle bg-light-subtle mb-3">
                <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center" style="cursor: pointer;" data-bs-toggle="collapse" data-bs-target="#jbGebuehrenHelpCollapse">
                  <span class="fw-bold text-primary small">
                    <i class="fas fa-question-circle me-1 text-info"></i> 💡 Spickzettel: Wie funktionieren die 5 UI-Felder & Zielgruppen?
                  </span>
                  <span class="badge bg-light text-muted border small"><i class="fas fa-chevron-down"></i></span>
                </div>
                <div class="collapse show" id="jbGebuehrenHelpCollapse">
                  <div class="card-body p-3 small text-muted" style="font-size: 11.5px; line-height: 1.5;">
                    <div class="row g-2">
                      <div class="col-md-6">
                        <div class="p-2 border rounded bg-white h-100">
                          <strong class="text-dark d-block mb-1">🏷️ UI-Gruppe & UI-Feld</strong>
                          <ul class="ps-3 mb-0">
                            <li><strong>UI-Gruppe:</strong> Überschrift der Card in der Schnellerfassung (z. B. <code>50m Wettschiessen (KK)</code>).</li>
                            <li><strong>UI-Feld:</strong> Beschriftung des Elements oder Gruppenname (z. B. <code>SSV Dezernat</code>).</li>
                            <li><strong>Sortierung (ui_sort):</strong> Reihenfolge innerhalb der Gruppe (z. B. <code>10</code>, <code>20</code>, <code>30</code>).</li>
                          </ul>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="p-2 border rounded bg-white h-100">
                          <strong class="text-dark d-block mb-1">🎛️ UI-Typ & Steuerelement</strong>
                          <ul class="ps-3 mb-0">
                            <li><code>checkbox</code>: Häkchen (Ja / Nein) für Einzelstiche.</li>
                            <li><code>counter</code>: Stiche-Zähler (0, 1, 2, 3 Stiche, multipliziert Betrag × Stiche).</li>
                            <li><code>singleselect</code>: Radio-Pills (nur 1 Option aus der Gruppe wählbar).</li>
                            <li><code>multiselect</code>: Mehrfachauswahl als Pill-Buttons.</li>
                            <li><code>amount</code>: Freier Betrag mit Schutzkonto (Zusatzpositionen).</li>
                          </ul>
                        </div>
                      </div>
                      <div class="col-12">
                        <div class="p-2 border rounded bg-white">
                          <strong class="text-dark d-block mb-1">🎯 Zielgruppe (Variante A) & Buchhaltung</strong>
                          <div class="d-flex gap-3 flex-wrap">
                            <div><code>Alle</code>: Für alle Mitglieder wählbar.</div>
                            <div><code>Aktive</code>: Nur für erwachsene Aktivmitglieder (Zahlung durch Mitglied).</div>
                            <div><code>Junioren</code>: Nur für Junioren (wird auf der Rechnung automatisch via <strong>Jugendförderung Konto 3420</strong> vom Verein übernommen).</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Basisdaten Zeile 1 -->
              <div class="row g-3 mb-3">
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">Schlüssel (Key) *</label>
                  <input type="text" class="form-control form-control-sm font-monospace fw-bold" id="g_key" placeholder="z.B. KK009" required>
                  <div class="form-text small" style="font-size: 10px;">Eindeutiger Code (KK..., LG..., Z...)</div>
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">Kategorie *</label>
                  <select class="form-select form-select-sm" id="g_kategorie_select" onchange="jbHandleSmartSelect(this, 'g_kategorie')">
                    <!-- Dynamisch geladen -->
                  </select>
                  <input type="text" class="form-control form-control-sm mt-1" id="g_kategorie" placeholder="Kategorie eingeben" required style="display: none;">
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">🎯 Zielgruppe *</label>
                  <select class="form-select form-select-sm fw-semibold" id="g_zielgruppe">
                    <option value="Alle">👥 Alle (Aktive & Junioren)</option>
                    <option value="Aktive">🎯 Nur Aktive (Erwachsene)</option>
                    <option value="Junioren">👦 Nur Junioren (Vereinsübernahme)</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">Betrag (CHF) *</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">CHF</span>
                    <input type="number" step="0.05" class="form-control text-end" id="g_betrag" placeholder="0.00" required>
                  </div>
                </div>
              </div>

              <!-- Zeile 2: Bezeichnungen -->
              <div class="row g-3 mb-3">
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Bezeichnung Frontend *</label>
                  <input type="text" class="form-control form-control-sm" id="g_bezeichnungfrontend" placeholder="z.B. 50m Liegend Nachdoppel" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Vollständige Bezeichnung (Rechnungsdruck)</label>
                  <input type="text" class="form-control form-control-sm" id="g_bezeichnung" placeholder="Wird auf PDF-Rechnung gedruckt">
                </div>
              </div>

              <!-- Zeile 3: Buchhaltungskonto -->
              <div class="row g-3 mb-3">
                <div class="col-md-4">
                  <label class="form-label small fw-bold text-muted">Haben-Konto</label>
                  <input type="text" class="form-control form-control-sm font-monospace" id="g_konto" placeholder="z.B. 4426">
                </div>
                <div class="col-md-8">
                  <label class="form-label small fw-bold text-muted">Kontobezeichnung (KMU)</label>
                  <input type="text" class="form-control form-control-sm" id="g_kontobezeichnung" placeholder="z.B. Ertrag Wettschiessen">
                </div>
              </div>

              <!-- UI-Darstellung Card -->
              <div class="card p-3 bg-light border-0 rounded-3 mb-3">
                <h6 class="text-secondary fw-bold mb-2 small text-uppercase" style="font-size: 11px;">
                  <i class="fas fa-desktop me-1 text-primary"></i> UI-Darstellung in der Schnellerfassung
                </h6>
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">UI-Gruppe (Card-Überschrift)</label>
                    <select class="form-select form-select-sm" id="g_ui_gruppe_select" onchange="jbHandleSmartSelect(this, 'g_ui_gruppe')">
                      <!-- Dynamisch geladen -->
                    </select>
                    <input type="text" class="form-control form-control-sm mt-1" id="g_ui_gruppe" placeholder="UI-Gruppe eingeben" style="display: none;">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">UI-Feld (Steuerelement-Name)</label>
                    <select class="form-select form-select-sm" id="g_ui_feld_select" onchange="jbHandleSmartSelect(this, 'g_ui_feld')">
                      <!-- Dynamisch geladen -->
                    </select>
                    <input type="text" class="form-control form-control-sm mt-1" id="g_ui_feld" placeholder="UI-Feld eingeben" style="display: none;">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">UI-Typ *</label>
                    <select class="form-select form-select-sm fw-semibold" id="g_ui_typ">
                      <option value="checkbox">☑️ Checkbox (Toggle Ja/Nein)</option>
                      <option value="counter">🔢 Counter (Stiche-Zähler: 0, 1, 2, 3)</option>
                      <option value="multiselect">🔲 Mehrfachauswahl (Pill-Gruppe)</option>
                      <option value="singleselect">🔘 Einzelauswahl (Radio-Pills)</option>
                      <option value="amount">💵 Freier Betrag (Variable Zusatzkosten)</option>
                    </select>
                  </div>
                </div>
                <div class="row g-3 mt-1">
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">Sortierung (ui_sort)</label>
                    <input type="number" class="form-control form-control-sm" id="g_ui_sort" value="10">
                  </div>
                  <div class="col-md-4 d-flex align-items-center mt-4">
                    <div class="form-check form-switch mb-0">
                      <input class="form-check-input" type="checkbox" id="g_aktiv" checked>
                      <label class="form-check-label small fw-semibold" for="g_aktiv">In Schnellerfassung aktiv</label>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">Bemerkung</label>
                    <input type="text" class="form-control form-control-sm" id="g_bem" placeholder="Optionale Notiz">
                  </div>
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
                <button type="submit" class="btn btn-success fw-bold px-4" id="btnSaveGebuehr">
                  <i class="fas fa-save me-1"></i> Gebühr speichern
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

function jbInitGebuehrenConfig() {
  jbPopulateFilterDropdowns();
  jbRenderGebuehrenTable();
}

function jbPopulateFilterDropdowns() {
  const fees = window._jbGebuehren || [];
  const kats = Array.from(new Set(fees.map(f => String(f.kategorie || '').trim()).filter(Boolean))).sort();
  const gruppen = Array.from(new Set(fees.map(f => String(f.ui_gruppe || '').trim()).filter(Boolean))).sort();

  const katEl = document.getElementById('jbGebuehrKatFilter');
  if (katEl) {
    katEl.innerHTML = '<option value="">Alle Kategorien (kategorie)</option>' +
      kats.map(k => `<option value="${k}">${k}</option>`).join('');
  }

  const grpEl = document.getElementById('jbGebuehrGruppeFilter');
  if (grpEl) {
    grpEl.innerHTML = '<option value="">Alle UI-Gruppen (ui_gruppe)</option>' +
      gruppen.map(g => `<option value="${g}">${g}</option>`).join('');
  }
}

function jbFilterGebuehrenTable() {
  _jbGebuehrenSearch = (document.getElementById('jbGebuehrSearch')?.value || '').toLowerCase().trim();
  _jbGebuehrenKategorieFilter = document.getElementById('jbGebuehrKatFilter')?.value || '';
  _jbGebuehrenGruppeFilter = document.getElementById('jbGebuehrGruppeFilter')?.value || '';
  jbRenderGebuehrenTable();
}

function jbRenderGebuehrenTable() {
  const tbody = document.getElementById('jbGebuehrenTableBody');
  const countEl = document.getElementById('jbGebuehrenCount');
  if (!tbody) return;

  const fees = window._jbGebuehren || [];
  const filtered = fees.filter(f => {
    const k = String(f.key || '').toLowerCase();
    const bez = String(f.bezeichnungfrontend || f.bezeichnung || '').toLowerCase();
    const konto = String(f['Haben-Konto-Jahresbeitrag-Buchhaltung'] || f.konto || '').toLowerCase();
    const grp = String(f.ui_gruppe || '').toLowerCase();

    const matchesSearch = !_jbGebuehrenSearch || k.includes(_jbGebuehrenSearch) || bez.includes(_jbGebuehrenSearch) || konto.includes(_jbGebuehrenSearch) || grp.includes(_jbGebuehrenSearch);
    const matchesKat = !_jbGebuehrenKategorieFilter || String(f.kategorie || '').trim() === _jbGebuehrenKategorieFilter;
    const matchesGrp = !_jbGebuehrenGruppeFilter || String(f.ui_gruppe || '').trim() === _jbGebuehrenGruppeFilter;

    return matchesSearch && matchesKat && matchesGrp;
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} von ${fees.length} Gebühren`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-4 text-muted">
          <i class="fas fa-info-circle me-1"></i> Keine Gebühren entsprechen den Filterkriterien.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(f => {
    const k = String(f.key || '').trim().toUpperCase();
    const konto = f['Haben-Konto-Jahresbeitrag-Buchhaltung'] || f.konto || '–';
    const kontoBezeichnung = f['Kontobezeichnung im KMU-Kontenrahmen'] || f.kontobezeichnung || '';
    const isAktiv = f.aktiv !== false && f.aktiv !== 'FALSE' && f.aktiv !== '0' && f.aktiv !== 0;
    const uiTyp = (f.ui_typ || 'checkbox').toLowerCase();

    let typBadge = `<span class="badge bg-secondary">checkbox</span>`;
    if (uiTyp === 'counter') typBadge = `<span class="badge bg-info text-dark">counter (1-3)</span>`;
    else if (uiTyp === 'multiselect') typBadge = `<span class="badge bg-primary">multiselect</span>`;
    else if (uiTyp === 'singleselect') typBadge = `<span class="badge bg-warning text-dark">singleselect</span>`;
    else if (uiTyp === 'amount') typBadge = `<span class="badge bg-success">amount</span>`;

    const zg = String(f.zielgruppe || 'Alle').trim();
    let zgBadge = `<span class="badge bg-light text-muted border">Alle</span>`;
    if (zg.toLowerCase() === 'junioren') zgBadge = `<span class="badge bg-success text-white">👦 Junioren</span>`;
    else if (zg.toLowerCase() === 'aktive') zgBadge = `<span class="badge bg-primary text-white">🎯 Aktive</span>`;

    return `
      <tr class="${isAktiv ? '' : 'table-light opacity-75'}">
        <td><strong class="font-monospace text-primary">${k}</strong></td>
        <td><span class="badge bg-light text-secondary border">${f.kategorie || '–'}</span></td>
        <td>${zgBadge}</td>
        <td>
          <div class="fw-semibold text-dark">${f.bezeichnungfrontend || f.bezeichnung || '–'}</div>
          ${f.bezeichnung && f.bezeichnung !== f.bezeichnungfrontend ? `<div class="text-muted small" style="font-size:10px;">${f.bezeichnung}</div>` : ''}
        </td>
        <td class="text-end fw-bold text-dark">CHF ${Number(f.betrag || 0).toFixed(2)}</td>
        <td>
          <span class="badge bg-light text-dark border font-monospace">${konto}</span>
          ${kontoBezeichnung ? `<div class="text-muted small" style="font-size:10px;">${escHtml(kontoBezeichnung)}</div>` : ''}
        </td>
        <td><small class="text-secondary">${f.ui_gruppe || '<span class="text-muted fst-italic">Auto</span>'}</small></td>
        <td><small class="text-dark">${f.ui_feld || '<span class="text-muted fst-italic">Auto</span>'}</small></td>
        <td>${typBadge}</td>
        <td class="text-center small">${f.ui_sort !== undefined && f.ui_sort !== '' ? f.ui_sort : '–'}</td>
        <td class="text-center">
          <i class="fas ${isAktiv ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i>
        </td>
        <td class="text-end">
          <button class="btn btn-xs btn-outline-primary py-1 px-2 rounded" onclick="jbOpenEditGebuehrModal('${k}')" title="Gebühr bearbeiten">
            <i class="fas fa-edit"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function jbPopulateModalDropdowns(selectedKat, selectedGrp, selectedFeld) {
  const fees = window._jbGebuehren || [];
  
  // 1. Kategorie Select
  const kats = Array.from(new Set(fees.map(f => String(f.kategorie || '').trim()).filter(Boolean))).sort();
  const katSelect = document.getElementById('g_kategorie_select');
  const katInput = document.getElementById('g_kategorie');
  if (katSelect && katInput) {
    let html = '<option value="">-- Kategorie wählen --</option>';
    let found = false;
    kats.forEach(k => {
      const sel = k === selectedKat;
      if (sel) found = true;
      html += `<option value="${escHtml(k)}"${sel ? ' selected' : ''}>${escHtml(k)}</option>`;
    });
    html += '<option value="__custom__">➕ [ Neue Kategorie erfassen… ]</option>';
    katSelect.innerHTML = html;
    if (!found && selectedKat) {
      katSelect.value = '__custom__';
      katInput.value = selectedKat;
      katInput.style.display = 'block';
    } else {
      katInput.value = selectedKat || '';
      katInput.style.display = 'none';
    }
  }

  // 2. UI-Gruppe Select
  const gruppen = Array.from(new Set(fees.map(f => String(f.ui_gruppe || '').trim()).filter(Boolean))).sort();
  const grpSelect = document.getElementById('g_ui_gruppe_select');
  const grpInput = document.getElementById('g_ui_gruppe');
  if (grpSelect && grpInput) {
    let html = '<option value="">-- UI-Gruppe wählen --</option>';
    let found = false;
    gruppen.forEach(g => {
      const sel = g === selectedGrp;
      if (sel) found = true;
      html += `<option value="${escHtml(g)}"${sel ? ' selected' : ''}>${escHtml(g)}</option>`;
    });
    html += '<option value="__custom__">➕ [ Neue UI-Gruppe erfassen… ]</option>';
    grpSelect.innerHTML = html;
    if (!found && selectedGrp) {
      grpSelect.value = '__custom__';
      grpInput.value = selectedGrp;
      grpInput.style.display = 'block';
    } else {
      grpInput.value = selectedGrp || '';
      grpInput.style.display = 'none';
    }
  }

  // 3. UI-Feld Select
  const felder = Array.from(new Set(fees.map(f => String(f.ui_feld || '').trim()).filter(Boolean))).sort();
  const feldSelect = document.getElementById('g_ui_feld_select');
  const feldInput = document.getElementById('g_ui_feld');
  if (feldSelect && feldInput) {
    let html = '<option value="">-- Bestehendes Feld wählen oder neu --</option>';
    let found = false;
    felder.forEach(fld => {
      const sel = fld === selectedFeld;
      if (sel) found = true;
      html += `<option value="${escHtml(fld)}"${sel ? ' selected' : ''}>${escHtml(fld)}</option>`;
    });
    html += '<option value="__custom__">➕ [ Neues Feld erfassen… ]</option>';
    feldSelect.innerHTML = html;
    if (!found && selectedFeld) {
      feldSelect.value = '__custom__';
      feldInput.value = selectedFeld;
      feldInput.style.display = 'block';
    } else {
      feldInput.value = selectedFeld || '';
      feldInput.style.display = 'none';
    }
  }
}

function jbHandleSmartSelect(selectEl, inputId) {
  const inputEl = document.getElementById(inputId);
  if (!inputEl) return;
  if (selectEl.value === '__custom__') {
    inputEl.style.display = 'block';
    inputEl.value = '';
    inputEl.focus();
  } else if (selectEl.value) {
    inputEl.value = selectEl.value;
    inputEl.style.display = 'none';
  } else {
    inputEl.value = '';
    inputEl.style.display = 'none';
  }
}

function jbOpenEditGebuehrModal(key) {
  const modalEl = document.getElementById('jbModalGebuehrEdit');
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);

  const titleEl = document.getElementById('jbModalGebuehrTitle');
  const keyInput = document.getElementById('g_key');
  const isNew = !key;

  if (isNew) {
    if (titleEl) titleEl.innerHTML = '➕ Neue Gebühr erfassen';
    keyInput.readOnly = false;
    keyInput.value = '';
    jbPopulateModalDropdowns('Kleinkaliber', '50m Wettschiessen (KK)', '');
    document.getElementById('g_zielgruppe').value = 'Alle';
    document.getElementById('g_bezeichnungfrontend').value = '';
    document.getElementById('g_bezeichnung').value = '';
    document.getElementById('g_betrag').value = '15.00';
    document.getElementById('g_konto').value = '4426';
    document.getElementById('g_kontobezeichnung').value = '';
    document.getElementById('g_ui_typ').value = 'checkbox';
    document.getElementById('g_ui_sort').value = '10';
    document.getElementById('g_aktiv').checked = true;
    document.getElementById('g_bem').value = '';
  } else {
    if (titleEl) titleEl.innerHTML = `⚙️ Gebühr bearbeiten: <span class="font-monospace">${key}</span>`;
    keyInput.readOnly = true;
    keyInput.value = key;

    const f = (window._jbGebuehren || []).find(x => String(x.key || '').trim().toUpperCase() === String(key).toUpperCase()) || {};
    jbPopulateModalDropdowns(f.kategorie || '', f.ui_gruppe || '', f.ui_feld || '');
    document.getElementById('g_zielgruppe').value = f.zielgruppe || 'Alle';
    document.getElementById('g_bezeichnungfrontend').value = f.bezeichnungfrontend || '';
    document.getElementById('g_bezeichnung').value = f.bezeichnung || '';
    document.getElementById('g_betrag').value = f.betrag !== undefined ? f.betrag : '';
    document.getElementById('g_konto').value = f['Haben-Konto-Jahresbeitrag-Buchhaltung'] || f.konto || '';
    document.getElementById('g_kontobezeichnung').value = f['Kontobezeichnung im KMU-Kontenrahmen'] || f.kontobezeichnung || '';
    document.getElementById('g_ui_typ').value = (f.ui_typ || 'checkbox').toLowerCase();
    document.getElementById('g_ui_sort').value = f.ui_sort !== undefined ? f.ui_sort : '10';
    document.getElementById('g_aktiv').checked = f.aktiv !== false && f.aktiv !== 'FALSE' && f.aktiv !== '0' && f.aktiv !== 0;
    document.getElementById('g_bem').value = f.bem || '';
  }

  modal.show();
}

async function jbSaveGebuehrFromModal() {
  const btn = document.getElementById('btnSaveGebuehr');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Speichere…';
  }

  try {
    const key = document.getElementById('g_key').value.trim().toUpperCase();
    const kategorie = document.getElementById('g_kategorie').value.trim();
    const zielgruppe = document.getElementById('g_zielgruppe')?.value || 'Alle';
    const bezeichnungfrontend = document.getElementById('g_bezeichnungfrontend').value.trim();
    const bezeichnung = document.getElementById('g_bezeichnung').value.trim() || bezeichnungfrontend;
    const betrag = parseFloat(document.getElementById('g_betrag').value) || 0;
    const konto = document.getElementById('g_konto').value.trim();
    const kontobezeichnung = document.getElementById('g_kontobezeichnung').value.trim();
    const ui_gruppe = document.getElementById('g_ui_gruppe').value.trim();
    const ui_feld = document.getElementById('g_ui_feld').value.trim() || bezeichnungfrontend;
    const ui_typ = document.getElementById('g_ui_typ').value;
    const ui_sort = parseInt(document.getElementById('g_ui_sort').value, 10) || 10;
    const aktiv = document.getElementById('g_aktiv').checked;
    const bem = document.getElementById('g_bem').value.trim();

    if (!key) throw new Error('Key ist erforderlich!');
    if (!kategorie) throw new Error('Kategorie ist erforderlich!');
    if (!bezeichnungfrontend) throw new Error('Bezeichnung ist erforderlich!');

    const payload = {
      action: 'saveGebuehr',
      key,
      kategorie,
      zielgruppe,
      bezeichnungfrontend,
      bezeichnung,
      betrag,
      konto,
      'Haben-Konto-Jahresbeitrag-Buchhaltung': konto,
      'Kontobezeichnung im KMU-Kontenrahmen': kontobezeichnung,
      kontobezeichnung,
      ui_gruppe,
      ui_feld,
      ui_typ,
      ui_sort,
      aktiv,
      bem,
      user: window.currentUser || 'frontend'
    };

    // 1. Direkt in Supabase speichern
    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    if (supa) {
      try {
        await supa.from('gebuehren_config').upsert({
          key: key,
          bezeichnung: bezeichnung,
          bezeichnung_frontend: bezeichnungfrontend,
          betrag: Number(betrag || 0),
          konto_haben: konto || '3000',
          kategorie: ui_gruppe || 'Jahresbeitrag',
          sort_order: Number(ui_sort || 10),
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
        console.log(`✅ [Supabase] Gebühr ${key} gespeichert.`);
      } catch (errSup) {
        console.warn("⚠️ Fehler bei Supabase Gebühren-Speicherung:", errSup);
      }
    }

    // 2. Dual-Write an GAS (DEAKTIVIERT - Supabase ist Single Source of Truth)
    /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
    apiFetch('jahresbeitrag', '', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).catch(err => console.warn("⚠️ Dual-Write GAS Gebühren-Speicherung:", err));
    ------------------------------------------------------- */

    showToast(`🎉 Gebühr ${key} erfolgreich in Supabase gespeichert!`);

    // Modal schliessen
    const modalEl = document.getElementById('jbModalGebuehrEdit');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    }

    // Lokalen Gebühren-Cache synchronisieren
    const existingIdx = (window._jbGebuehren || []).findIndex(x => String(x.key || '').trim().toUpperCase() === key);
    if (existingIdx >= 0) {
      window._jbGebuehren[existingIdx] = { ...window._jbGebuehren[existingIdx], ...payload };
    } else {
      window._jbGebuehren.push(payload);
    }

    jbPopulateFilterDropdowns();
    jbRenderGebuehrenTable();

  } catch(err) {
    alert("Fehler beim Speichern der Gebühr: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Gebühr speichern';
    }
  }
}

async function jbReloadGebuehrenData() {
  try {
    showToast("Lade Gebührenkonfiguration neu…");
    const t = Date.now();
    const res = await apiFetch('jahresbeitrag', `action=getGebuehren&_t=${t}`).then(r => r.json());
    if (res.success) {
      window._jbGebuehren = res.data || [];
      jbPopulateFilterDropdowns();
      jbRenderGebuehrenTable();
      showToast("✅ Gebühren aktualisiert!");
    }
  } catch(e) {
    console.error("Fehler beim Neuladen der Gebühren:", e);
  }
}
