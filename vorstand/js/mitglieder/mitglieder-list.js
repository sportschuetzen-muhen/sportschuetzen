// === SUB-MODUL: MITGLIEDER - LISTE & FILTER & SORTIERUNG ===

// Tabellen- vs. Kartenansicht-Variable
window._mglViewMode = window._mglViewMode || 'grid';

// Neue Filterleisten-Variablen
window._mglFilterType = window._mglFilterType || 'alle';
window._mglSubFilterLiz = window._mglSubFilterLiz || 'alle';

function mglRenderListe(data) {
  const canEdit = typeof hasWriteAccess === 'function' ? hasWriteAccess('members') : (typeof userHasRole === 'function' ? userHasRole('admin') : false);

  // Aufbau der progressiv eingeblendeten Unter-Chips für Lizenzen
  const subFiltersHtml = window._mglFilterType === 'mit-lizenz' 
    ? `
    <div class="d-flex flex-wrap gap-1 align-items-center mb-3 p-2 rounded-3 border border-light" style="background: rgba(15, 58, 93, 0.03);">
      <span class="text-muted small me-2" style="font-weight: 600;">Disziplin / Typ:</span>
      <div class="mgl-pill-tab btn-sm ${window._mglSubFilterLiz === 'alle' ? 'active' : ''}" onclick="mglSetSubFilterLiz('alle')">
        Alle Lizenzen
      </div>
      <div class="mgl-pill-tab btn-sm ${window._mglSubFilterLiz === 'g50m' ? 'active' : ''}" onclick="mglSetSubFilterLiz('g50m')">
        Gewehr 50m (KK)
      </div>
      <div class="mgl-pill-tab btn-sm ${window._mglSubFilterLiz === 'g10m' ? 'active' : ''}" onclick="mglSetSubFilterLiz('g10m')">
        Gewehr 10m (LG)
      </div>
      <div class="mgl-pill-tab btn-sm ${window._mglSubFilterLiz === 'doppel' ? 'active' : ''}" onclick="mglSetSubFilterLiz('doppel')" title="Mit aktiven Lizenzen in beiden Disziplinen (50m & 10m)">
        Mehrfachlizenz (KK & LG)
      </div>
      <div class="mgl-pill-tab btn-sm ${window._mglSubFilterLiz === 'a-liz' ? 'active' : ''}" onclick="mglSetSubFilterLiz('a-liz')">
        A-Lizenzen
      </div>
      <div class="mgl-pill-tab btn-sm ${window._mglSubFilterLiz === 'b-liz' ? 'active' : ''}" onclick="mglSetSubFilterLiz('b-liz')">
        B-Lizenzen
      </div>
    </div>
    `
    : '';

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

      <!-- Sortierung (Feld) -->
      <div class="d-flex align-items-center gap-1">
        <select class="form-select form-select-sm" style="width:145px" id="mglSortField" onchange="mglSortChange()">
          <option value="LastName" ${window._mglSort.field === 'LastName' ? 'selected' : ''}>Name</option>
          <option value="AddressNumber" ${window._mglSort.field === 'AddressNumber' ? 'selected' : ''}>Lizenz-Nr.</option>
          <option value="PersonNumber" ${window._mglSort.field === 'PersonNumber' ? 'selected' : ''}>SSV Personen-Nr.</option>
          <option value="BirthDate" ${window._mglSort.field === 'BirthDate' ? 'selected' : ''}>Geburtsdatum</option>
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

      <!-- Excel-Export Button -->
      <button class="btn btn-sm btn-outline-success ms-md-2" onclick="mglOpenExportModal()" title="Mitgliederdaten als Excel / CSV exportieren">
        <i class="fas fa-file-excel me-1"></i> Excel-Export
      </button>

      <!-- Spalten-Ausblender Button (nur bei Tabellenansicht sichtbar) -->
      <div id="mgl-column-toggle" class="ms-md-2 ${window._mglViewMode === 'table' ? '' : 'd-none'}"></div>

      <!-- Button Neues Mitglied -->
      ${canEdit ? `
      <button class="btn btn-sm btn-primary ms-auto" onclick="mglNeuesMitglied()">
        <i class="fas fa-plus"></i> Neues Mitglied
      </button>` : ''}
    </div>

    <!-- Filter Chips Row (Hauptkategorien) -->
    <div class="d-flex flex-wrap gap-1 align-items-center mb-3">
      <span class="text-muted small me-2" style="font-weight: 600;">Status:</span>
      <div class="mgl-pill-tab ${window._mglFilterType === 'alle' ? 'active' : ''}" onclick="mglSetTypeFilter('alle')">
        Alle
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'mit-lizenz' ? 'active' : ''}" onclick="mglSetTypeFilter('mit-lizenz')">
        Aktiv mit Lizenz
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'ohne-lizenz' ? 'active' : ''}" onclick="mglSetTypeFilter('ohne-lizenz')">
        Aktiv ohne Lizenz
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'u21' ? 'active' : ''}" onclick="mglSetTypeFilter('u21')" title="Nachwuchs & Jugendliche unter 21 Jahren (U21)">
        <i class="fas fa-child text-info me-1"></i>Jugend (U21)
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
        Austritte
      </div>
      <div class="mgl-pill-tab ${window._mglFilterType === 'verstorben' ? 'active' : ''}" onclick="mglSetTypeFilter('verstorben')">
        Verstorben
      </div>
    </div>

    <!-- Dynamische Unter-Chips Area -->
    <div id="mglSubFiltersArea">
      ${subFiltersHtml}
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

function mglSetTypeFilter(val) {
  window._mglFilterType = val;
  // Unterfilter zurücksetzen
  window._mglSubFilterLiz = 'alle';
  mglRenderListe(_mglData); // Zeichnet Filterbar & Unterfilter neu
  mglFilter();
}

function mglSetSubFilterLiz(val) {
  window._mglSubFilterLiz = val;
  mglRenderListe(_mglData); // Aktualisiert aktiven Zustand der Unterchips
  mglFilter();
}

function mglRenderRows(data) {
  const container = document.getElementById('mglListContainer');
  if (!container) return;

  const canEdit = typeof hasWriteAccess === 'function' ? hasWriteAccess('members') : (typeof userHasRole === 'function' ? userHasRole('admin') : false);

  if (!data.length) {
    const isDbEmpty = !window._mglData || window._mglData.length === 0;
    container.innerHTML = isDbEmpty ? `
      <div class="card border-0 shadow-sm p-5 text-center text-muted">
        <i class="fas fa-users fa-3x mb-3 text-muted opacity-50"></i>
        <h5 class="text-dark fw-bold">Keine Mitglieder in der Datenbank vorhanden</h5>
        <p class="text-muted small mb-4">Die Mitgliederdatenbank ist aktuell leer. Führen Sie den SSV-Verbandsimport durch, um den initialen Mitgliederstamm einzulesen, oder erfassen Sie ein Mitglied manuell.</p>
        <div class="d-flex justify-content-center gap-2">
          <button class="btn btn-primary btn-sm px-3" onclick="mglSwitchTab('import')">
            <i class="fas fa-file-upload me-1"></i> Zum SSV-Import
          </button>
          ${canEdit ? `
          <button class="btn btn-outline-secondary btn-sm px-3" onclick="mglNeuesMitglied()">
            <i class="fas fa-plus me-1"></i> Manuell erfassen
          </button>` : ''}
        </div>
      </div>` : `
      <div class="card border-0 shadow-sm p-5 text-center text-muted">
        <i class="fas fa-users-slash fa-3x mb-3 text-muted opacity-50"></i>
        <h5>Keine Mitglieder gefunden</h5>
        <p class="text-muted small">Für die gewählten Filter- und Suchkriterien wurden keine Einträge gefunden.</p>
        <div class="mt-2">
          <button class="btn btn-sm btn-outline-primary" onclick="const s = document.getElementById('mglSearch'); if (s) s.value=''; mglSetTypeFilter('alle');">
            Filter zurücksetzen
          </button>
        </div>
      </div>`;
    const countEl = document.getElementById('mglCount');
    if (countEl) countEl.textContent = '0 Mitglieder';
    return;
  }

  if (window._mglViewMode === 'table') {
    // Rendern als klassische Tabelle
    container.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover table-sm mb-0 align-middle" id="mgl-table">
              <thead class="table-light sticky-top small text-muted text-uppercase" style="font-size: 11px; z-index: 10;">
                <tr>
                  <th data-col-id="idx" data-col-name="#" class="tk-col-idx py-2 text-center" style="width: 44px; min-width: 40px; max-width: 50px;">#</th>
                  <th data-col-id="nr" data-col-name="Lizenz / SSV-Nr." class="mgl-clickable-sort tk-col-nr py-2" onclick="mglSetSort('AddressNumber')" style="cursor: pointer; user-select: none;">Lizenz / SSV-Nr. <span class="mgl-sort-ind">${mglSortIndicator('AddressNumber')}</span></th>
                  <th data-col-id="name" data-col-name="Name" class="mgl-clickable-sort tk-col-name py-2" onclick="mglSetSort('LastName')" style="cursor: pointer; user-select: none;">Name <span class="mgl-sort-ind">${mglSortIndicator('LastName')}</span></th>
                  <th data-col-id="geburt" data-col-name="Geburtsdatum" class="mgl-clickable-sort tk-col-geburt py-2" onclick="mglSetSort('BirthDate')" style="cursor: pointer; user-select: none;">Geburtsdatum <span class="mgl-sort-ind">${mglSortIndicator('BirthDate')}</span></th>
                  <th data-col-id="email" data-col-name="E-Mail" class="tk-col-email py-2">E-Mail</th>
                  <th data-col-id="telefon" data-col-name="Telefon" class="tk-col-telefon py-2">Telefon</th>
                  <th data-col-id="lizenzen" data-col-name="Lizenzen" class="mgl-clickable-sort tk-col-lizenzen py-2" onclick="mglSetSort('_aktiveLizenzenCount')" style="cursor: pointer; user-select: none;">Lizenzen <span class="mgl-sort-ind">${mglSortIndicator('_aktiveLizenzenCount')}</span></th>
                  <th data-col-id="funktionen" data-col-name="Funktionen" class="mgl-clickable-sort tk-col-funktionen py-2" onclick="mglSetSort('_aktiveFunktionenCount')" style="cursor: pointer; user-select: none;">Funktionen <span class="mgl-sort-ind">${mglSortIndicator('_aktiveFunktionenCount')}</span></th>
                  <th data-col-id="status" data-col-name="Status" class="tk-col-status py-2">Status</th>
                  <th data-col-id="actions" data-col-name="Aktionen" class="text-end py-2" style="width: 85px;"></th>
                </tr>
              </thead>
              <tbody id="mglTableBody">
                ${data.map((m, idx) => {
                  const statusBadge = mglStatusBadge(m);
                  const pn = escapeHtml(m.PersonNumber || '');
                  const name = escapeHtml((m.FirstName || '') + ' ' + (m.LastName || ''));
                  const email = escapeHtml(m.PrimaryEmail || '–');
                  const phone = escapeHtml(m.PrivateMobilePhone || m.BusinessMobilePhone || '–');
                  const city = escapeHtml(m.City || '');

                  const addrNum = String(m.AddressNumber || '').padStart(6, '0');
                  const birthDateStr = mglFmtDate(m.BirthDate);
                  const altersBadge = typeof mglAltersklasseBadge === 'function' ? mglAltersklasseBadge(m) : '';

                  const copyIconLiz = `<i class="fa-regular fa-copy text-muted ms-1 cursor-pointer opacity-50 hover-opacity-100" onclick="navigator.clipboard.writeText('${escapeJs(addrNum)}'); showSuccess('Lizenznummer kopiert: ${escapeJs(addrNum)}'); event.stopPropagation();" title="Lizenznummer (${escapeJs(addrNum)}) kopieren"></i>`;

                  // Aktive Lizenzen
                  const activeLics = m._aktiveLizenzen || (window._mglLizenzenCache?.[pn] || []).filter(l => typeof mglIsLicenseActive === 'function' ? mglIsLicenseActive(l) : ((l.IsActive == 1 || l.IsActive === true) && !l.ExitDate));
                  const licBadgesHtml = activeLics.length > 0 
                    ? activeLics.map(l => typeof mglFormatLicenseBadge === 'function' ? mglFormatLicenseBadge(l) : l.MembershipCategory).join(' ') 
                    : '<span class="text-muted small">–</span>';

                  // Aktive Funktionen
                  const activeFns = m._aktiveFunktionen || (window._mglFunktionenCache?.[pn] || []).filter(f => typeof mglIsFunctionActive === 'function' ? mglIsFunctionActive(f) : !f.OfficialFunctionExitDate);
                  const fnBadgesHtml = activeFns.length > 0 
                    ? activeFns.map(f => typeof mglFormatFunctionBadge === 'function' ? mglFormatFunctionBadge(f) : f.OfficialFunctionCategory).join(' ') 
                    : '<span class="text-muted small">–</span>';

                  return `<tr>
                    <td class="small text-muted text-center tk-col-idx font-monospace" style="font-size:0.8rem">${idx + 1}</td>
                    <td class="small tk-col-nr">
                      <div class="d-flex align-items-center">
                        <span class="fw-bold text-dark font-monospace" style="font-size:0.88rem">${addrNum}</span>
                        ${copyIconLiz}
                      </div>
                      <div class="text-muted small font-monospace mt-1" style="font-size:0.72rem">
                        <span>SSV: ${pn}</span>
                      </div>
                    </td>
                    <td class="tk-col-name">
                      <a href="#" class="text-decoration-none fw-semibold text-dark"
                         onclick="mglOpenDetail('${pn}'); return false;">
                        ${name}
                      </a>
                      ${city ? `<div class="text-muted small" style="font-size: 0.74rem;"><i class="fas fa-location-dot me-1 text-muted opacity-50"></i>${city}</div>` : ''}
                      ${(m.Vereinsaustritt && window._mglFilterType === 'inaktiv') ? `<div class="text-danger small mt-1" style="font-size:0.75rem;"><i class="fas fa-sign-out-alt me-1"></i>Austritt: ${mglFmtDate(m.Vereinsaustritt)}</div>` : ''}
                      ${(m.Todesdatum && window._mglFilterType === 'verstorben') ? `<div class="text-secondary small mt-1" style="font-size:0.75rem;"><i class="fas fa-cross me-1"></i>Verstorben: ${mglFmtDate(m.Todesdatum)}</div>` : ''}
                    </td>
                    <td class="small text-nowrap tk-col-geburt">
                      <div>${birthDateStr}</div>
                      ${altersBadge ? `<div class="mt-1">${altersBadge}</div>` : ''}
                    </td>
                    <td class="small tk-col-email">${email}</td>
                    <td class="small tk-col-telefon">${phone}</td>
                    <td class="tk-col-lizenzen">
                      <div class="d-flex flex-wrap gap-1">${licBadgesHtml}</div>
                    </td>
                    <td class="tk-col-funktionen">
                      <div class="d-flex flex-wrap gap-1">${fnBadgesHtml}</div>
                    </td>
                    <td class="tk-col-status">${statusBadge}</td>
                    <td class="text-nowrap text-end tk-col-actions">
                      <button class="btn btn-outline-primary btn-sm py-0 px-2"
                              onclick="mglOpenDetail('${pn}')" title="Details öffnen">
                        <i class="fas fa-eye"></i>
                      </button>
                      ${canEdit ? `
                      <button class="btn btn-outline-secondary btn-sm py-0 px-2"
                              onclick="mglOpenEdit('${pn}')"
                              title="Mitgliedsdaten bearbeiten">
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

    if (typeof window.TableKit?.makeResizable === 'function') {
      window.TableKit.makeResizable('#mgl-table', {
        storageKey: 'portal_mgl_col_widths',
        minWidth: 50,
        columns: {
          idx: { minWidth: 35, defaultWidth: 44, resizable: false },
          actions: { minWidth: 75, defaultWidth: 85, resizable: false }
        }
      });
    }

    if (typeof window.TableKit?.setupColumnToggle === 'function') {
      window._mglColToggle = window.TableKit.setupColumnToggle('#mgl-table', {
        container: '#mgl-column-toggle',
        storageKey: 'portal_mgl_columns_visibility'
      });
    }
  } else {
    // Rendern als moderne, kartenbasierte Grid-Ansicht
    container.innerHTML = `
      <div class="row g-3">
        ${data.map(m => {
          const statusBadge = mglStatusBadge(m);
          const pn = escapeHtml(m.PersonNumber || '');
          const name = escapeHtml((m.FirstName || '') + ' ' + (m.LastName || ''));
          const email = escapeHtml(m.PrimaryEmail || '');
          const phone = escapeHtml(m.PrivateMobilePhone || m.BusinessMobilePhone || '');
          const city = escapeHtml(m.City || '');
          const initials = `${(m.FirstName || '').charAt(0)}${(m.LastName || '').charAt(0)}`.trim() || '??';
          const addrNum = String(m.AddressNumber || '').padStart(6, '0');

          const birthYear = m.BirthDate ? new Date(m.BirthDate).getFullYear() : null;
          const altersBadge = typeof mglAltersklasseBadge === 'function' ? mglAltersklasseBadge(m) : '';

          // Aktive Funktionen
          const activeFns = m._aktiveFunktionen || (window._mglFunktionenCache?.[pn] || []).filter(f => typeof mglIsFunctionActive === 'function' ? mglIsFunctionActive(f) : !f.OfficialFunctionExitDate);
          const fnBadgesHtml = activeFns.map(f => typeof mglFormatFunctionBadge === 'function' ? mglFormatFunctionBadge(f) : f.OfficialFunctionCategory).join(' ');

          // Aktive Lizenzen
          const activeLics = m._aktiveLizenzen || (window._mglLizenzenCache?.[pn] || []).filter(l => typeof mglIsLicenseActive === 'function' ? mglIsLicenseActive(l) : ((l.IsActive == 1 || l.IsActive === true) && !l.ExitDate));
          const licBadgesHtml = activeLics.length > 0 
            ? activeLics.map(l => typeof mglFormatLicenseBadge === 'function' ? mglFormatLicenseBadge(l) : l.MembershipCategory).join(' ') 
            : '<span class="badge bg-light text-muted border border-light-subtle small fw-normal" style="font-size: 0.7rem;">Keine Lizenz</span>';

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
          const copyIconLiz = `<i class="fa-regular fa-copy text-muted ms-1 cursor-pointer opacity-50 hover-opacity-100" onclick="navigator.clipboard.writeText('${escapeJs(addrNum)}'); showSuccess('Lizenznummer kopiert: ${escapeJs(addrNum)}'); event.stopPropagation();" title="Lizenznummer (${escapeJs(addrNum)}) kopieren"></i>`;

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
                      <div class="text-muted small d-flex flex-wrap align-items-center gap-1 mt-1" style="font-size: 0.72rem;">
                        ${city ? `<span class="text-secondary"><i class="fas fa-location-dot me-1 text-muted opacity-50"></i>${city}</span>` : ''}
                        ${birthYear && !isNaN(birthYear) ? `<span class="text-muted">· Jg. ${birthYear}</span>` : ''}
                        ${altersBadge}
                      </div>
                      ${(m.Vereinsaustritt && window._mglFilterType === 'inaktiv') ? `<div class="text-danger small mt-1" style="font-size:0.75rem;"><i class="fas fa-sign-out-alt me-1"></i>Austritt: ${mglFmtDate(m.Vereinsaustritt)}</div>` : ''}
                      ${(m.Todesdatum && window._mglFilterType === 'verstorben') ? `<div class="text-secondary small mt-1" style="font-size:0.75rem;"><i class="fas fa-cross me-1"></i>Verstorben: ${mglFmtDate(m.Todesdatum)}</div>` : ''}
                    </div>
                  </div>

                  <div class="d-flex flex-wrap gap-1 mb-2">
                    ${statusBadge}
                  </div>

                  <!-- Funktionen (falls vorhanden) -->
                  ${activeFns.length > 0 ? `
                  <div class="d-flex flex-wrap gap-1 mb-2">
                    ${fnBadgesHtml}
                  </div>` : ''}

                  <!-- Lizenzen / Disziplinen -->
                  <div class="mb-3 d-flex flex-wrap gap-1 align-items-center" style="min-height: 24px;">
                    ${licBadgesHtml}
                  </div>

                  <!-- Footer: Lizenz-Nr, SSV-Nr & Aktionen -->
                  <div class="mt-auto pt-2 border-top d-flex align-items-center justify-content-between">
                    <div class="d-flex flex-column font-monospace" style="font-size: 0.72rem; line-height: 1.35;">
                      <div class="d-flex align-items-center">
                        <span class="text-muted me-1" style="font-size:0.68rem;">Lizenz:</span>
                        <span class="fw-bold text-dark">${addrNum}</span>
                        ${copyIconLiz}
                      </div>
                      <div class="d-flex align-items-center text-muted" style="font-size: 0.68rem;">
                        <span class="me-1">SSV:</span>
                        <span>${pn}</span>
                      </div>
                    </div>
                    <div class="d-flex gap-1">
                      ${emailBtn}
                      ${phoneBtn}
                      <button class="btn btn-sm btn-primary rounded-circle" style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;" onclick="mglOpenDetail('${pn}'); event.stopPropagation();" title="Details öffnen">
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
  const typeMode = window._mglFilterType || 'alle';
  const subLizMode = window._mglSubFilterLiz || 'alle';

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

    // Aufteilung der Vereinsmitglieder in exklusive Gruppen
    const matchStatus =
      typeMode === 'alle' 
        ? (!isDeceased && (isAktiv || isPassiv || isEhren))
        : typeMode === 'mit-lizenz' 
          ? (!isDeceased && isAktiv && aktiveLiz > 0)
        : typeMode === 'ohne-lizenz' 
          ? (!isDeceased && isAktiv && aktiveLiz === 0)
        : typeMode === 'u21'
          ? (!isDeceased && (typeof mglIsU21 === 'function' ? mglIsU21(m) : !!m._isU21))
        : typeMode === 'passiv' 
          ? (!isDeceased && isPassiv)
        : typeMode === 'ehren' 
          ? (!isDeceased && isEhren)
        : typeMode === 'vorstand' 
          ? (!isDeceased && hasFn)
        : typeMode === 'inaktiv' 
          ? (!isDeceased && !isAktiv && !isPassiv)
        : typeMode === 'verstorben' 
          ? isDeceased
          : true;

    // Feinere Lizenzunterteilung bei "Aktiv mit Lizenz"
    let matchSubLiz = true;
    if (typeMode === 'mit-lizenz' && subLizMode !== 'alle') {
      const pId = String(m.PersonNumber || '').trim();
      const licensesList = window._mglLizenzenCache?.[pId] || [];
      const activeLicenses = licensesList.filter(l => (l.IsActive == 1 || l.IsActive === true || l.IsActive === '1') && !l.ExitDate);

      const hasG50 = activeLicenses.some(l => String(l.MembershipCategory || '').includes('G50m'));
      const hasG10 = activeLicenses.some(l => String(l.MembershipCategory || '').includes('G10m'));

      if (subLizMode === 'g50m') {
        matchSubLiz = hasG50;
      } else if (subLizMode === 'g10m') {
        matchSubLiz = hasG10;
      } else if (subLizMode === 'doppel') {
        matchSubLiz = hasG50 && hasG10; // Beides aktiv vorhanden
      } else if (subLizMode === 'a-liz') {
        matchSubLiz = activeLicenses.some(l => String(l.MembershipCategory || '').includes('Aktiv-A'));
      } else if (subLizMode === 'b-liz') {
        matchSubLiz = activeLicenses.some(l => String(l.MembershipCategory || '').includes('Aktiv-B'));
      }
    }

    return matchSearch && matchStatus && matchSubLiz;
  });

  filtered = mglSortData(filtered);
  _mglFiltered = filtered;

  mglRenderStats(filtered);
  mglRenderRows(filtered);

  // Spaltensortierungsanzeigen aktualisieren (falls Tabellenansicht)
  if (window._mglViewMode === 'table') {
    ['AddressNumber', 'LastName', 'BirthDate', '_aktiveLizenzenCount', '_aktiveFunktionenCount'].forEach(field => {
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
    _mglSort.dir = (field === 'LastName' || field === '_kategorie' || field === 'BirthDate') ? 'asc' : 'desc';
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
    } else if (field === 'BirthDate') {
      const da = a.BirthDate ? new Date(a.BirthDate).getTime() : 0;
      const db = b.BirthDate ? new Date(b.BirthDate).getTime() : 0;
      va = isNaN(da) ? 0 : da;
      vb = isNaN(db) ? 0 : db;
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
