// === SUB-MODUL: MITGLIEDER - LISTE & FILTER & SORTIERUNG ===

// Tabellen- vs. Kartenansicht-Variable
window._mglViewMode = window._mglViewMode || 'grid';

// Neue Filterleisten-Variablen
window._mglFilterLizenz = window._mglFilterLizenz || 'nur-aktive';
window._mglFilterType = window._mglFilterType || 'alle';
window._mglFilterKat = window._mglFilterKat || '';

function mglRenderListe(data) {
  const canEdit = (window.currentRoles || []).some(r => ['admin', 'vorstand', 'schuetzenmeister'].includes(r));

  document.getElementById('mglTabContent').innerHTML = `
    <!-- FILTER- UND AKTIONEN-BAR -->
    <div class="d-flex flex-wrap gap-3 align-items-center mb-3">
      <!-- Premium Suchfeld -->
      <div class="search-input-wrapper" style="width:240px">
        <i class="fas fa-search"></i>
        <input type="text" class="form-control form-control-sm"
               id="mglSearch" placeholder="Name, E-Mail, Lizenz-Nr..."
               oninput="mglFilter()">
      </div>

      <!-- Segmenttasten für Lizenz-Filter (Alle / Mit / Ohne) -->
      <div class="btn-group btn-group-sm" role="group">
        <button type="button" class="btn btn-outline-primary ${window._mglFilterLizenz === 'alle' ? 'active' : ''}" onclick="mglSetLizenzFilter('alle')">
          Alle
        </button>
        <button type="button" class="btn btn-outline-primary ${window._mglFilterLizenz === 'nur-aktive' ? 'active' : ''}" onclick="mglSetLizenzFilter('nur-aktive')" title="Nur Mitglieder mit aktiven SSV-Lizenzen">
          Mit Lizenz
        </button>
        <button type="button" class="btn btn-outline-primary ${window._mglFilterLizenz === 'ohne-aktive' ? 'active' : ''}" onclick="mglSetLizenzFilter('ohne-aktive')" title="Nur Mitglieder ohne aktive SSV-Lizenzen">
          Ohne Lizenz
        </button>
      </div>

      <!-- Spezifische Gewehr-Kategorie-Filter -->
      <select class="form-select form-select-sm" style="width:145px" id="mglFilterKat" onchange="mglSetKatFilter(this.value)">
        <option value="" ${window._mglFilterKat === '' ? 'selected' : ''}>Alle Lizenzen</option>
        <option value="Aktiv-A G50m" ${window._mglFilterKat === 'Aktiv-A G50m' ? 'selected' : ''}>Aktiv-A G50m</option>
        <option value="Aktiv-B G50m" ${window._mglFilterKat === 'Aktiv-B G50m' ? 'selected' : ''}>Aktiv-B G50m</option>
        <option value="Aktiv-A G10m" ${window._mglFilterKat === 'Aktiv-A G10m' ? 'selected' : ''}>Aktiv-A G10m</option>
        <option value="Aktiv-B G10m" ${window._mglFilterKat === 'Aktiv-B G10m' ? 'selected' : ''}>Aktiv-B G10m</option>
        <option value="Schüler-intern" ${window._mglFilterKat === 'Schüler-intern' ? 'selected' : ''}>Schüler-intern</option>
      </select>

      <!-- Sortierung (Feld) -->
      <div class="d-flex align-items-center gap-1">
        <select class="form-select form-select-sm" style="width:145px" id="mglSortField" onchange="mglSortChange()">
          <option value="LastName" ${window._mglSort.field === 'LastName' ? 'selected' : ''}>Name</option>
          <option value="AddressNumber" ${window._mglSort.field === 'AddressNumber' ? 'selected' : ''}>Mitglied-Nr.</option>
          <option value="PersonNumber" ${window._mglSort.field === 'PersonNumber' ? 'selected' : ''}>Lizenz-Nr.</option>
          <option value="_mitgliedsjahre" ${window._mglSort.field === '_mitgliedsjahre' ? 'selected' : ''}>Mitgliedsjahre</option>
          <option value="_aktiveLizenzenCount" ${window._mglSort.field === '_aktiveLizenzenCount' ? 'selected' : ''}>Anzahl Lizenzen</option>
          <option value="_aktiveFunktionenCount" ${window._mglSort.field === '_aktiveFunktionenCount' ? 'selected' : ''}>Anzahl Funktionen</option>
        </select>
        <!-- Sortierung (Richtung Toggle-Button) -->
        <button class="btn btn-sm btn-outline-secondary" id="mglSortDirBtn" onclick="mglToggleSortDir()" title="Sortierreihenfolge umkehren">
          ${window._mglSort.dir === 'asc' ? '<i class="fas fa-sort-amount-up"></i>' : '<i class="fas fa-sort-amount-down"></i>'}
        </button>
      </div>

      <!-- Darstellungs-Toggle (Karten vs. Tabelle) -->
      <div class="btn-group btn-group-sm ms-md-2" role="group">
        <button type="button" class="btn btn-outline-primary ${window._mglViewMode === 'grid' ? 'active' : ''}" onclick="mglSetViewMode('grid')" title="Kartenansicht">
          <i class="fas fa-th-large"></i> Karten
        </button>
        <button type="button" class="btn btn-outline-primary ${window._mglViewMode === 'table' ? 'active' : ''}" onclick="mglSetViewMode('table')" title="Tabellenansicht">
          <i class="fas fa-list"></i> Tabelle
        </button>
      </div>

      <!-- Button Neues Mitglied -->
      ${canEdit ? `
      <button class="btn btn-sm btn-primary ms-auto" onclick="mglNeuesMitglied()">
        <i class="fas fa-plus"></i> Neues Mitglied
      </button>` : ''}
    </div>

    <!-- Filter Chips Row -->
    <div class="d-flex flex-wrap gap-1 align-items-center mb-3">
      <span class="text-muted small me-2" style="font-weight: 600;">Status:</span>
      <div class="mgl-pill-tab ${window._mglFilterType === 'alle' ? 'active' : ''}" onclick="mglSetTypeFilter('alle')">
        Alle
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'aktiv' ? 'active' : ''}" onclick="mglSetTypeFilter('aktiv')">
        Aktiv
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'passiv' ? 'active' : ''}" onclick="mglSetTypeFilter('passiv')">
        Passiv
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'ehren' ? 'active' : ''}" onclick="mglSetTypeFilter('ehren')">
        Ehrenmitglied
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'vorstand' ? 'active' : ''}" onclick="mglSetTypeFilter('vorstand')">
        Vorstand
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'inaktiv' ? 'active' : ''}" onclick="mglSetTypeFilter('inaktiv')">
        Inaktiv
      </div>
    </div>

    <!-- HIER WERDEN DIE ELEMENTE GERENDERT -->
    <div id="mglListContainer"></div>
    <div class="mt-3 text-muted small px-2" id="mglCount"></div>
  `;
}

function mglSetViewMode(mode) {
  window._mglViewMode = mode;
  renderMitgliederView(_mglData);
  mglFilter();
}

function mglSetLizenzFilter(val) {
  window._mglFilterLizenz = val;
  mglRenderListe(_mglData); // Aktualisiert aktive Zustände in der Filterleiste
  mglFilter();
}

function mglSetTypeFilter(val) {
  window._mglFilterType = val;
  mglRenderListe(_mglData); // Aktualisiert aktive Zustände der Chips
  mglFilter();
}

function mglSetKatFilter(val) {
  window._mglFilterKat = val;
  mglFilter();
}

function mglRenderRows(data) {
  const container = document.getElementById('mglListContainer');
  if (!container) return;

  const canEdit = (window.currentRoles || []).some(r => ['admin','vorstand','schuetzenmeister'].includes(r));

  if (!data.length) {
    container.innerHTML = `
      <div class="card border-0 shadow-sm p-5 text-center text-muted">
        <i class="fas fa-users-slash fa-3x mb-3 text-muted opacity-50"></i>
        <h5>Keine Mitglieder gefunden</h5>
      </div>`;
    document.getElementById('mglCount').textContent = '0 Mitglieder';
    return;
  }

  if (window._mglViewMode === 'table') {
    // Rendern als klassische Tabelle
    container.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover table-sm mb-0 align-middle">
              <thead class="table-dark">
                <tr>
                  <th class="mgl-clickable-sort" onclick="mglSetSort('AddressNumber')">Nr. / Lizenz <span class="mgl-sort-ind">${mglSortIndicator('AddressNumber')}</span></th>
                  <th class="mgl-clickable-sort" onclick="mglSetSort('LastName')">Name <span class="mgl-sort-ind">${mglSortIndicator('LastName')}</span></th>
                  <th>E-Mail</th>
                  <th>Telefon</th>
                  <th class="mgl-clickable-sort" onclick="mglSetSort('_kategorie')">Kategorie <span class="mgl-sort-ind">${mglSortIndicator('_kategorie')}</span></th>
                  <th class="mgl-clickable-sort" onclick="mglSetSort('_aktiveLizenzenCount')">Lizenzen <span class="mgl-sort-ind">${mglSortIndicator('_aktiveLizenzenCount')}</span></th>
                  <th class="mgl-clickable-sort" onclick="mglSetSort('_aktiveFunktionenCount')">Funktionen <span class="mgl-sort-ind">${mglSortIndicator('_aktiveFunktionenCount')}</span></th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="mglTableBody">
                ${data.map(m => {
                  const statusBadge = mglStatusBadge(m);
                  const katBadge = (m._kategorien && m._kategorien.length > 0) 
                    ? m._kategorien.map(k => mglKatBadge(k)).join(' ') 
                    : mglKatBadge(m._kategorie || '');
                  const aktiveLiz = Number(m._aktiveLizenzenCount || 0);
                  const aktiveFn = Number(m._aktiveFunktionenCount || 0);
                  const pn = escapeHtml(m.PersonNumber || '');
                  const name = escapeHtml((m.FirstName || '') + ' ' + (m.LastName || ''));
                  const email = escapeHtml(m.PrimaryEmail || '–');
                  const phone = escapeHtml(m.PrivateMobilePhone || m.BusinessMobilePhone || '–');

                  const addrNum = String(m.AddressNumber || '').padStart(6, '0');
                  const birthDateStr = mglFmtDate(m.BirthDate);
                  const copyIcon = `<i class="fa-regular fa-copy text-muted ms-1 cursor-pointer opacity-50 hover-opacity-100" onclick="navigator.clipboard.writeText('${escapeJs(pn)}'); showSuccess('Lizenznummer kopiert: ${escapeJs(pn)}'); event.stopPropagation();" title="Lizenznummer kopieren"></i>`;

                  return `<tr>
                    <td class="small">
                      <div class="fw-bold text-dark font-monospace" style="font-size:0.9rem">${addrNum}</div>
                      <div class="text-muted small d-flex align-items-center mt-1" style="font-size:0.75rem">
                        <span class="font-monospace">Liz: ${pn}</span>
                        ${copyIcon}
                      </div>
                      <div class="text-muted mt-1" style="font-size:0.75rem">
                        <i class="fa-regular fa-calendar-days text-muted me-1" style="font-size:0.7rem"></i>${birthDateStr}
                      </div>
                    </td>
                    <td>
                      <a href="#" class="text-decoration-none fw-semibold"
                         onclick="mglOpenDetail('${pn}'); return false;">
                        ${name}
                      </a>
                    </td>
                    <td class="small">${email}</td>
                    <td class="small">${phone}</td>
                    <td>${katBadge}</td>
                    <td><span class="badge bg-primary">${aktiveLiz}</span></td>
                    <td><span class="badge bg-info text-dark">${aktiveFn}</span></td>
                    <td>${statusBadge}</td>
                    <td class="text-nowrap">
                      <button class="btn btn-outline-primary btn-sm py-0 px-2"
                              onclick="mglOpenDetail('${pn}')">
                        <i class="fas fa-eye"></i>
                      </button>
                      ${canEdit ? `
                      <button class="btn btn-outline-secondary btn-sm py-0 px-2"
                              onclick="mglOpenEdit('${pn}')"
                              title="Vereinsinterne Felder bearbeiten">
                        <i class="fas fa-pen"></i>
                      </button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } else {
    // Rendern als moderne, kartenbasierte Grid-Ansicht
    container.innerHTML = `
      <div class="row g-3">
        ${data.map(m => {
          const statusBadge = mglStatusBadge(m);
          const katBadges = (m._kategorien && m._kategorien.length > 0) 
            ? m._kategorien.map(k => mglKatBadge(k)).join(' ') 
            : mglKatBadge(m._kategorie || '');
          
          const pn = escapeHtml(m.PersonNumber || '');
          const name = escapeHtml((m.FirstName || '') + ' ' + (m.LastName || ''));
          const email = escapeHtml(m.PrimaryEmail || '');
          const phone = escapeHtml(m.PrivateMobilePhone || m.BusinessMobilePhone || '');
          const initials = `${(m.FirstName || '').charAt(0)}${(m.LastName || '').charAt(0)}`.trim() || '??';
          const addrNum = String(m.AddressNumber || '').padStart(6, '0');

          const emailBtn = email 
            ? `<a href="mailto:${email}" class="btn btn-sm btn-light border rounded-circle flex-shrink-0" style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;" title="${email}" onclick="event.stopPropagation();">
                <i class="fas fa-envelope text-muted"></i>
               </a>` 
            : '';
          const phoneBtn = phone 
            ? `<a href="tel:${phone}" class="btn btn-sm btn-light border rounded-circle flex-shrink-0" style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;" title="${phone}" onclick="event.stopPropagation();">
                <i class="fas fa-phone text-muted"></i>
               </a>` 
            : '';
          const copyIcon = `<i class="fa-regular fa-copy text-muted ms-1 cursor-pointer opacity-50 hover-opacity-100" onclick="navigator.clipboard.writeText('${escapeJs(pn)}'); showSuccess('Lizenznummer kopiert: ${escapeJs(pn)}'); event.stopPropagation();" title="Lizenznummer kopieren"></i>`;

          return `
            <div class="col-sm-6 col-md-4 col-lg-3">
              <div class="card border-0 shadow-sm h-100 cursor-pointer" onclick="mglOpenDetail('${pn}')" style="transition: all 0.25s ease;">
                <div class="card-body p-3 d-flex flex-column">
                  
                  <div class="d-flex align-items-center gap-2 mb-2">
                    <div class="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0" style="width: 44px; height: 44px; background: linear-gradient(135deg, var(--primary) 0%, #1e4b7a 100%); font-size: 1rem;">
                      ${initials}
                    </div>
                    <div class="overflow-hidden flex-grow-1">
                      <div class="fw-bold text-dark text-truncate" style="font-size: 0.95rem;" title="${name}">${name}</div>
                      <div class="text-muted small font-monospace d-flex align-items-center mt-1" style="font-size: 0.72rem;">
                        <span>Nr: ${addrNum}</span>
                      </div>
                    </div>
                  </div>

                  <div class="d-flex flex-wrap gap-1 mb-2">
                    ${statusBadge}
                  </div>

                  <div class="mb-3 d-flex flex-wrap gap-1" style="min-height: 24px;">
                    ${katBadges}
                  </div>

                  <div class="mt-auto pt-2 border-top d-flex align-items-center justify-content-between">
                    <div class="small text-muted font-monospace" style="font-size: 0.72rem;">
                      <span>Liz: ${pn}</span>
                      ${copyIcon}
                    </div>
                    <div class="d-flex gap-1">
                      ${emailBtn}
                      ${phoneBtn}
                      <button class="btn btn-sm btn-primary rounded-circle" style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;" onclick="mglOpenDetail('${pn}'); event.stopPropagation();">
                        <i class="fas fa-chevron-right" style="font-size: 0.8rem;"></i>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  document.getElementById('mglCount').textContent = `${data.length} Mitglieder`;
}

function mglFilter() {
  const search = (document.getElementById('mglSearch')?.value || '').toLowerCase().trim();
  const kat = window._mglFilterKat || '';
  const typeMode = window._mglFilterType || 'alle';
  const lizenzMode = window._mglFilterLizenz || 'nur-aktive';

  let filtered = _mglData.filter(m => {
    const fullName = `${m.FirstName || ''} ${m.LastName || ''}`.toLowerCase();
    const birthDateStr = mglFmtDate(m.BirthDate).toLowerCase();
    const addrNum = String(m.AddressNumber || '').padStart(6, '0');
    const matchSearch = !search ||
      fullName.includes(search) ||
      String(m.PrimaryEmail || '').toLowerCase().includes(search) ||
      String(m.PersonNumber || '').toLowerCase().includes(search) ||
      String(m.AddressNumber || '').toLowerCase().includes(search) ||
      addrNum.toLowerCase().includes(search) ||
      birthDateStr.includes(search);

    const aktiveLiz = Number(m._aktiveLizenzenCount || 0);
    const isAktiv = m.IsActive == 1 || m.IsActive === true || m.IsActive === '1';
    const isPassiv = !!m._istPassiv;
    const isEhren = !!m._istEhren;
    const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
    const hasFn = Number(m._aktiveFunktionenCount || 0) > 0;

    const matchLizenz =
      lizenzMode === 'alle' ||
      (lizenzMode === 'nur-aktive' && aktiveLiz > 0) ||
      (lizenzMode === 'ohne-aktive' && aktiveLiz === 0);

    const matchStatus =
      typeMode === 'alle' ||
      (typeMode === 'inaktiv' && !isAktiv && !isDeceased) ||
      (typeMode === 'aktiv' && isAktiv && !isPassiv && !isEhren && !isDeceased) ||
      (typeMode === 'passiv' && isPassiv && !isDeceased) ||
      (typeMode === 'ehren' && isEhren && !isDeceased) ||
      (typeMode === 'vorstand' && hasFn && !isDeceased);

    const matchKat = !kat || String(m._kategorie || '').includes(kat) || (m._kategorien && m._kategorien.includes(kat));

    return matchSearch && matchLizenz && matchStatus && matchKat;
  });

  filtered = mglSortData(filtered);
  _mglFiltered = filtered;

  mglRenderStats(filtered);
  mglRenderRows(filtered);

  // Spaltensortierungsanzeigen aktualisieren (falls Tabellenansicht)
  if (window._mglViewMode === 'table') {
    ['AddressNumber', 'LastName', '_kategorie', '_aktiveLizenzenCount', '_aktiveFunktionenCount'].forEach(field => {
      const el = document.querySelector(`[onclick="mglSetSort('${field}')"] .mgl-sort-ind`);
      if (el) el.textContent = mglSortIndicator(field);
    });
  }
}

function mglSortChange() {
  const field = document.getElementById('mglSortField')?.value || 'LastName';
  _mglSort.field = field;
  mglFilter();
}

function mglToggleSortDir() {
  _mglSort.dir = _mglSort.dir === 'asc' ? 'desc' : 'asc';
  
  // Icon aktualisieren
  const btn = document.getElementById('mglSortDirBtn');
  if (btn) {
    btn.innerHTML = _mglSort.dir === 'asc' 
      ? '<i class="fas fa-sort-amount-up"></i>' 
      : '<i class="fas fa-sort-amount-down"></i>';
  }
  
  mglFilter();
}

function mglSetSort(field) {
  if (_mglSort.field === field) {
    _mglSort.dir = _mglSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _mglSort.field = field;
    _mglSort.dir = (field === 'LastName' || field === '_kategorie') ? 'asc' : 'desc';
  }

  // UI-Controls synchronisieren
  const select = document.getElementById('mglSortField');
  if (select) select.value = _mglSort.field;

  const btn = document.getElementById('mglSortDirBtn');
  if (btn) {
    btn.innerHTML = _mglSort.dir === 'asc' 
      ? '<i class="fas fa-sort-amount-up"></i>' 
      : '<i class="fas fa-sort-amount-down"></i>';
  }

  mglFilter();
}

function mglSortIndicator(field) {
  if (_mglSort.field !== field) return '↕';
  return _mglSort.dir === 'asc' ? '↑' : '↓';
}

function mglSortData(data) {
  const dir = _mglSort.dir === 'desc' ? -1 : 1;
  const field = _mglSort.field;

  return [...data].sort((a, b) => {
    let va = a[field];
    let vb = b[field];

    if (field === 'LastName') {
      va = `${a.LastName || ''} ${a.FirstName || ''}`.toLowerCase();
      vb = `${b.LastName || ''} ${b.FirstName || ''}`.toLowerCase();
    } else if (typeof va === 'string' || typeof vb === 'string') {
      va = String(va || '').toLowerCase();
      vb = String(vb || '').toLowerCase();
    } else {
      va = Number(va || 0);
      vb = Number(vb || 0);
    }

    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}
