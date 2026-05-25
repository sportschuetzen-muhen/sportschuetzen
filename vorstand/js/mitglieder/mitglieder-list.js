// === SUB-MODUL: MITGLIEDER - LISTE & FILTER & SORTIERUNG ===

function mglRenderListe(data) {
  const canEdit = (window.currentRoles || []).some(r => ['admin', 'vorstand', 'schuetzenmeister'].includes(r));

  document.getElementById('mglTabContent').innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <input type="text" class="form-control form-control-sm" style="width:240px"
             id="mglSearch" placeholder="🔍 Name, E-Mail, PersonNumber…"
             oninput="mglFilter()">

      <select class="form-select form-select-sm" style="width:175px"
              id="mglFilterLizenz" onchange="mglFilter()">
        <option value="nur-aktive" selected>Nur mit aktiven Lizenzen</option>
        <option value="alle">Alle Mitglieder</option>
        <option value="ohne-aktive">Nur ohne aktive Lizenzen</option>
      </select>

      <select class="form-select form-select-sm" style="width:140px"
              id="mglFilterStatus" onchange="mglFilter()">
        <option value="">Alle Status</option>
        <option value="aktiv">Aktiv</option>
        <option value="passiv">Passiv</option>
        <option value="inaktiv">Inaktiv</option>
        <option value="ehren">Ehrenmitglied</option>
        <option value="verstorben">Verstorben</option>
      </select>

      <select class="form-select form-select-sm" style="width:180px"
              id="mglFilterKat" onchange="mglFilter()">
        <option value="">Alle Kategorien</option>
        <option value="Vorstand">Vorstand</option>
        <option value="Ehrenmitglied">Ehrenmitglied</option>
        <option value="Passiv">Passiv</option>
        <option value="Aktiv-A G50m">Aktiv-A G50m</option>
        <option value="Aktiv-B G50m">Aktiv-B G50m</option>
        <option value="Aktiv-A G10m">Aktiv-A G10m</option>
        <option value="Aktiv-B G10m">Aktiv-B G10m</option>
        <option value="Schüler-intern">Schüler-intern</option>
      </select>

      <select class="form-select form-select-sm" style="width:170px"
              id="mglSort" onchange="mglSortChange()">
        <option value="LastName:asc">Name A–Z</option>
        <option value="LastName:desc">Name Z–A</option>
        <option value="AddressNumber:asc">Mitglied-Nr. aufsteigend</option>
        <option value="AddressNumber:desc">Mitglied-Nr. absteigend</option>
        <option value="PersonNumber:asc">Lizenz-Nr. aufsteigend</option>
        <option value="PersonNumber:desc">Lizenz-Nr. absteigend</option>
        <option value="_mitgliedsjahre:desc">Mitgliedsjahre absteigend</option>
        <option value="_mitgliedsjahre:asc">Mitgliedsjahre aufsteigend</option>
        <option value="_aktiveLizenzenCount:desc">Aktive Lizenzen absteigend</option>
        <option value="_aktiveLizenzenCount:asc">Aktive Lizenzen aufsteigend</option>
        <option value="_aktiveFunktionenCount:desc">Aktive Funktionen absteigend</option>
        <option value="_aktiveFunktionenCount:asc">Aktive Funktionen aufsteigend</option>
      </select>

      ${canEdit ? `
      <button class="btn btn-sm btn-primary ms-auto" onclick="mglNeuesMitglied()">
        <i class="fas fa-plus"></i> Neues Mitglied
      </button>` : ''}
    </div>

    <div class="d-flex flex-wrap gap-2 mb-3" id="mglStats"></div>

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
            <tbody id="mglTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer text-muted small" id="mglCount"></div>
    </div>
  `;
}

function mglRenderRows(data) {
  const tbody = document.getElementById('mglTableBody');
  if (!tbody) return;

  const canEdit = (window.currentRoles || []).some(r => ['admin','vorstand','schuetzenmeister'].includes(r));

  if (!data.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center text-muted py-4">Keine Mitglieder gefunden</td>
      </tr>`;
    document.getElementById('mglCount').textContent = '0 Mitglieder';
    return;
  }

  tbody.innerHTML = data.map(m => {
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
  }).join('');

  document.getElementById('mglCount').textContent = `${data.length} Mitglieder`;
}

function mglFilter() {
  const search = (document.getElementById('mglSearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('mglFilterStatus')?.value || '';
  const kat = document.getElementById('mglFilterKat')?.value || '';
  const lizenzMode = document.getElementById('mglFilterLizenz')?.value || 'nur-aktive';

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

    const matchLizenz =
      lizenzMode === 'alle' ||
      (lizenzMode === 'nur-aktive' && aktiveLiz > 0) ||
      (lizenzMode === 'ohne-aktive' && aktiveLiz === 0);

    const matchStatus =
      !status ||
      (status === 'verstorben' && isDeceased) ||
      (status === 'aktiv' && isAktiv && !isPassiv && !isEhren && !isDeceased) ||
      (status === 'passiv' && isPassiv && !isDeceased) ||
      (status === 'inaktiv' && !isAktiv && !isDeceased) ||
      (status === 'ehren' && isEhren && !isDeceased);

    const matchKat = !kat || String(m._kategorie || '').includes(kat);

    return matchSearch && matchLizenz && matchStatus && matchKat;
  });

  filtered = mglSortData(filtered);
  _mglFiltered = filtered;

  mglRenderStats(filtered);
  mglRenderRows(filtered);

  // Update header arrows in real-time
  ['AddressNumber', 'LastName', '_kategorie', '_aktiveLizenzenCount', '_aktiveFunktionenCount'].forEach(field => {
    const el = document.querySelector(`[onclick="mglSetSort('${field}')"] .mgl-sort-ind`);
    if (el) el.textContent = mglSortIndicator(field);
  });
}

function mglSortChange() {
  const val = document.getElementById('mglSort')?.value || 'LastName:asc';
  const [field, dir] = val.split(':');
  _mglSort = { field, dir: dir || 'asc' };
  mglFilter();
}

function mglSetSort(field) {
  if (_mglSort.field === field) {
    _mglSort.dir = _mglSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _mglSort.field = field;
    _mglSort.dir = (field === 'LastName' || field === '_kategorie') ? 'asc' : 'desc';
  }

  const select = document.getElementById('mglSort');
  if (select) select.value = `${_mglSort.field}:${_mglSort.dir}`;
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
