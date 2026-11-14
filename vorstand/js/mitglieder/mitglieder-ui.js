// === SUB-MODUL: MITGLIEDER - UI ===

function renderMitgliederView(data) {
  const canEdit = typeof hasWriteAccess !== 'function' || hasWriteAccess('members');
  if (_mglActiveTab === 'import' && !canEdit) {
    _mglActiveTab = 'liste';
  }
  const listTabActive = _mglActiveTab === 'liste' ? 'active' : '';
  const analyseTabActive = _mglActiveTab === 'analyse' ? 'active' : '';

  document.getElementById('mitglieder-container').innerHTML = `
    <style>
      .mgl-stat-card{
        background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:12px;
        box-shadow:0 4px 14px rgba(0,0,0,.03);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .mgl-stat-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 20px rgba(15, 58, 93, 0.08);
      }
      .mgl-stat-title{font-size:.78rem;color:#6b7280;font-weight:600;}
      .mgl-stat-value{font-size:1.65rem;font-weight:700;color:#0f3a5d}
      .mgl-profile-head{
        background:#fff;border-radius:14px;padding:22px;
        box-shadow:0 8px 24px rgba(0,0,0,.06);
      }
      .mgl-avatar{
        width:68px;height:68px;border-radius:50%;
        background:#0f3a5d;color:#fff;font-weight:700;
        display:flex;align-items:center;justify-content:center;
        font-size:1.35rem;flex:0 0 auto;
      }
      .mgl-profile-name{font-size:1.4rem;font-weight:700;color:#111827}
      .mgl-profile-meta{font-size:.9rem;color:#6b7280}
      .mgl-badge-row{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.55rem}
      .mgl-chip{
        display:inline-flex;align-items:center;gap:.35rem;
        padding:.34rem .72rem;border-radius:999px;
        font-size:.78rem;font-weight:600
      }
      .mgl-chip.green{background:#198754;color:#fff}
      .mgl-chip.blue{background:#2563eb;color:#fff}
      .mgl-chip.gold{background:#f59e0b;color:#fff}
      .mgl-chip.gray{background:#6c757d;color:#fff}
      .mgl-chip.light{background:#eef2f7;color:#334155}
      .mgl-clickable-sort{cursor:pointer;user-select:none;white-space:nowrap}
      .mgl-clickable-sort:hover{opacity:.85}
      .mgl-sort-ind{font-size:.72rem;opacity:.7}
      .mgl-timeline{position:relative;padding-left:34px}
      .mgl-timeline:before{
        content:"";position:absolute;left:13px;top:0;bottom:0;width:2px;background:#e5e7eb
      }
      .mgl-timeline-item{position:relative;margin-bottom:16px}
      .mgl-timeline-dot{
        position:absolute;left:-26px;top:10px;width:10px;height:10px;border-radius:50%
      }
      .mgl-timeline-card{
        background:#fff;border-radius:10px;padding:12px 14px;
        box-shadow:0 4px 14px rgba(0,0,0,.05)
      }
      .mgl-timeline-title{font-weight:700;color:#111827}
      .mgl-timeline-date{font-size:.78rem;color:#6b7280}
      .mgl-timeline-meta{font-size:.74rem;color:#94a3b8}
      .mgl-detail-stats{
        display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px
      }
      .mgl-overview-card{
        background:#fff;border-radius:10px;padding:16px;
        box-shadow:0 4px 12px rgba(0,0,0,.05)
      }
      .mgl-overview-label{font-size:.78rem;color:#6b7280}
      .mgl-overview-value{font-size:1.35rem;font-weight:700;margin-top:2px}
      .mgl-tab-wrap .nav-link{font-weight:600}
      .mgl-empty{
        background:#fff;border-radius:10px;padding:28px;color:#6b7280;
        text-align:center;border:1px dashed #d1d5db
      }
      .cursor-pointer{cursor:pointer}
      .hover-opacity-100:hover{opacity:1 !important}
      
      .mgl-pill-tab {
        background: white; border: 1px solid #dee2e6; border-radius: 20px;
        padding: 5px 15px; font-size: 0.82rem; font-weight: 600; color: #495057;
        transition: all 0.2s ease; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        user-select: none;
      }
      .mgl-pill-tab:hover { background: #f1f3f5; }
      .mgl-pill-tab.active { background: #0f3a5d; color: white; border-color: #0f3a5d; }
    </style>

    <!-- Navigation Tabs -->
    <div class="d-flex flex-wrap gap-2 mb-3 border-bottom pb-2">
      <div class="mgl-pill-tab ${listTabActive}" onclick="mglSwitchTab('liste')">
        <i class="fas fa-list-ul me-1"></i> Mitgliederliste
      </div>
      <div class="mgl-pill-tab ${_mglActiveTab === 'jubilaeen' ? 'active' : ''}" onclick="mglSwitchTab('jubilaeen')">
        <i class="fas fa-award me-1"></i> Jubiläen &amp; Vereinsjahre
      </div>
      <div class="mgl-pill-tab ${analyseTabActive}" onclick="mglSwitchTab('analyse')">
        <i class="fas fa-chart-pie me-1"></i> Mitglieder-Analyse
      </div>
      ${canEdit ? `
      <div class="mgl-pill-tab ${_mglActiveTab === 'import' ? 'active' : ''}" onclick="mglSwitchTab('import')">
        <i class="fas fa-file-upload me-1"></i> SSV-Import
      </div>` : ''}
    </div>

    <!-- TAB-INHALTE -->
    <div id="mglTabContent"></div>

    <!-- DETAIL MODAL -->
    <div class="modal fade" id="mglModalDetail" tabindex="-1">
      <div class="modal-dialog modal-xl modal-fullscreen-lg-down">
        <div class="modal-content border-0 shadow-lg position-relative">
          <div class="modal-header border-0 bg-primary text-white" style="border-radius: 8px 8px 0 0;">
            <h5 class="modal-title fw-bold" id="mglDetailTitle">Mitglied</h5>
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-link text-white p-0 rn-modal-maximize-btn" title="Maximieren / Wiederherstellen" style="font-size: 0.95rem; text-decoration: none;">
                <i class="fas fa-expand"></i>
              </button>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
          </div>
          <div class="modal-body p-0" id="mglDetailBody"></div>
          <div class="rn-modal-resizer" title="Grösse durch Ziehen verändern" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;">
            <i class="fas fa-arrows-alt-diagonal" style="font-size: 10px; opacity: 0.5;"></i>
          </div>
        </div>
      </div>
    </div>

    <!-- NEU MODAL -->
    <div class="modal fade" id="mglModalNeu" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fw-bold">Neues Mitglied (intern)</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info small">
              <i class="fas fa-info-circle"></i>
              Nur für Schüler &lt;16 ohne SSV-Lizenz. Reguläre Mitglieder werden via SSV-Import erfasst.
            </div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Vorname *</label>
                <input type="text" class="form-control" id="nmVorname">
              </div>
              <div class="col-md-6">
                <label class="form-label">Nachname *</label>
                <input type="text" class="form-control" id="nmNachname">
              </div>
              <div class="col-md-6">
                <label class="form-label">Geburtsdatum *</label>
                <input type="date" class="form-control" id="nmGeburt">
              </div>
              <div class="col-md-6">
                <label class="form-label">E-Mail</label>
                <input type="email" class="form-control" id="nmEmail">
              </div>
              <div class="col-md-6">
                <label class="form-label">Strasse</label>
                <input type="text" class="form-control" id="nmStrasse">
              </div>
              <div class="col-md-3">
                <label class="form-label">PLZ</label>
                <input type="text" class="form-control" id="nmPlz">
              </div>
              <div class="col-md-3">
                <label class="form-label">Ort</label>
                <input type="text" class="form-control" id="nmOrt">
              </div>
              <div class="col-md-6">
                <label class="form-label">Telefon</label>
                <input type="text" class="form-control" id="nmTel">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
            <button class="btn btn-primary" id="mglBtnSaveNeu" onclick="mglSaveNeu()">
              <i class="fas fa-save"></i> Erstellen
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render correct tab
  if (_mglActiveTab === 'liste') {
    mglRenderListe(data);
  } else if (_mglActiveTab === 'jubilaeen') {
    mglRenderJubilaeen(data);
  } else if (_mglActiveTab === 'analyse') {
    mglRenderAnalyse(data);
  } else if (_mglActiveTab === 'import') {
    mglRenderImport();
  }
}

function mglSwitchTab(tab) {
  if (tab === 'import' && typeof hasWriteAccess === 'function' && !hasWriteAccess('members')) {
    tab = 'liste';
  }
  _mglActiveTab = tab;
  renderMitgliederView(_mglData);
  if (tab === 'liste') {
    mglFilter();
  }
}

function mglStatusBadge(m) {
  const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
  const isEhren = m._istEhren || m.IsHonoraryMember == 1 || m.IsHonoraryMember === true;
  const isPassiv = m._istPassiv || m.IsPassive == 1 || m.IsPassive === true;
  const isAktiv = m.IsActive == 1 || m.IsActive === true || m.IsActive === '1';
  const hatAktLiz = Number(m._aktiveLizenzenCount || 0) > 0;
  const isU21 = typeof mglIsU21 === 'function' ? mglIsU21(m) : false;
  const u21Badge = isU21 ? ' <span class="badge bg-info text-dark ms-1" title="Nachwuchs / Jugend (U21)"><i class="fas fa-child me-1"></i>U21</span>' : '';

  if (isDeceased) return '<span class="badge bg-dark">† Verstorben</span>';
  if (isEhren) {
    const yr = m._ernennungsjahr || (m.HonoraryMemberSince ? (window.mglExtractYear ? window.mglExtractYear(m.HonoraryMemberSince) : new Date(m.HonoraryMemberSince).getFullYear()) : null);
    const yrBadge = yr && !isNaN(yr) ? ` (${yr})` : '';
    return `<span class="badge bg-warning text-dark" title="Ehrenmitglied${yrBadge ? ' seit ' + yr : ''}"><i class="fas fa-medal me-1"></i>Ehrenmitglied${yrBadge}</span>${u21Badge}`;
  }
  if (isPassiv) return `<span class="badge bg-secondary">Passiv</span>${u21Badge}`;
  if (isAktiv && hatAktLiz) return `<span class="badge bg-success">Aktiv</span>${u21Badge}`;
  if (isAktiv && !hatAktLiz) return `<span class="badge bg-success opacity-75">Aktiv</span>${u21Badge}`;
  return `<span class="badge bg-dark">Inaktiv</span>${u21Badge}`;
}

function mglKatBadge(kat) {
  if (!kat) return '<span class="badge bg-light text-dark">–</span>';
  const safeKat = escapeHtml(String(kat));
  if (/vorstand/i.test(kat)) return `<span class="badge bg-info text-dark">${safeKat}</span>`;
  if (/ehren/i.test(kat)) return `<span class="badge bg-warning text-dark">${safeKat}</span>`;
  if (/passiv/i.test(kat)) return `<span class="badge bg-secondary">${safeKat}</span>`;
  if (/aktiv.*a/i.test(kat)) return `<span class="badge bg-primary">${safeKat}</span>`;
  if (/aktiv.*b/i.test(kat)) return `<span class="badge" style="background:#4a90d9">${safeKat}</span>`;
  if (/junior|schüler/i.test(kat)) return `<span class="badge bg-success">${safeKat}</span>`;
  return `<span class="badge bg-secondary">${safeKat}</span>`;
}

function mglFormatLicenseBadge(licOrCat) {
  const cat = typeof licOrCat === 'string' ? licOrCat : (licOrCat?.MembershipCategory || licOrCat?.membership_category || '');
  if (!cat) return '';

  const isB = /aktiv-b/i.test(cat) || licOrCat?.LicenseCategory === 'B';
  const isAuflage = /auflage/i.test(cat);
  const is50m = /50m/i.test(cat);
  const is10m = /10m/i.test(cat);

  let label = '';
  let badgeClass = '';

  if (is50m && isAuflage) {
    label = `G50m Aufl.${isB ? ' (B)' : ' (A)'}`;
    badgeClass = 'bg-primary-subtle text-primary-emphasis border border-primary-subtle';
  } else if (is50m) {
    label = `G50m${isB ? ' (B)' : ' (A)'}`;
    badgeClass = isB ? 'bg-info-subtle text-info-emphasis border border-info-subtle' : 'bg-primary text-white';
  } else if (is10m && isAuflage) {
    label = `G10m Aufl.${isB ? ' (B)' : ' (A)'}`;
    badgeClass = 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
  } else if (is10m) {
    label = `G10m${isB ? ' (B)' : ' (A)'}`;
    badgeClass = isB ? 'bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle' : 'bg-info text-dark';
  } else {
    label = cat;
    badgeClass = 'bg-light text-dark border';
  }

  return `<span class="badge ${badgeClass} font-monospace" style="font-size: 0.72rem; padding: 3px 6px;" title="${escapeHtml(cat)}">${escapeHtml(label)}</span>`;
}
window.mglFormatLicenseBadge = mglFormatLicenseBadge;

function mglFormatFunctionBadge(fn) {
  const name = typeof fn === 'string' ? fn : (fn?.OfficialFunctionCategory || fn?.official_function_category || '');
  if (!name) return '';

  let icon = 'fas fa-briefcase';
  let badgeClass = 'bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle';

  if (/präsident/i.test(name) && !/vize/i.test(name)) {
    icon = 'fas fa-crown';
    badgeClass = 'bg-warning text-dark border border-warning shadow-xs';
  } else if (/vize/i.test(name)) {
    icon = 'fas fa-user-tie';
    badgeClass = 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
  } else if (/kassier/i.test(name)) {
    icon = 'fas fa-coins';
    badgeClass = 'bg-success-subtle text-success-emphasis border border-success-subtle';
  } else if (/schützenmeister/i.test(name)) {
    icon = 'fas fa-crosshairs';
    badgeClass = 'bg-primary-subtle text-primary-emphasis border border-primary-subtle';
  } else if (/junior/i.test(name) || /leiter/i.test(name)) {
    icon = 'fas fa-graduation-cap';
    badgeClass = 'bg-info-subtle text-info-emphasis border border-info-subtle';
  } else if (/verwalter/i.test(name) || /aktuar/i.test(name)) {
    icon = 'fas fa-address-book';
    badgeClass = 'bg-info-subtle text-info-emphasis border border-info-subtle';
  }

  return `<span class="badge ${badgeClass}" style="font-size: 0.72rem; padding: 3px 7px;" title="${escapeHtml(name)}"><i class="${icon} me-1"></i>${escapeHtml(name)}</span>`;
}
window.mglFormatFunctionBadge = mglFormatFunctionBadge;

function mglAltersklasseBadge(m) {
  const altersklasse = m._altersklasse || (typeof mglCalcAltersklasse === 'function' ? mglCalcAltersklasse(m.BirthDate) : '');
  if (!altersklasse) return '';
  if (altersklasse === 'U21') return '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle" style="font-size:0.68rem;" title="Nachwuchs / U21">U21</span>';
  if (altersklasse === 'Elite') return '<span class="badge bg-light text-secondary border border-light-subtle" style="font-size:0.68rem;" title="Elite (21-45 Jahre)">Elite</span>';
  if (altersklasse === 'Senior') return '<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle" style="font-size:0.68rem;" title="Senior (46-59 Jahre)">Senior</span>';
  if (altersklasse === 'Veteran') return '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" style="font-size:0.68rem;" title="Veteran (60-69 Jahre)">Veteran</span>';
  if (altersklasse === 'Seniorveteran') return '<span class="badge bg-dark-subtle text-dark-emphasis border border-dark-subtle" style="font-size:0.68rem;" title="Seniorveteran (ab 70 Jahre)">Seniorveteran</span>';
  return '';
}
window.mglAltersklasseBadge = mglAltersklasseBadge;

function mglRenderAnalyse(data) {
  const isTrue = val => val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'ja' || String(val).toLowerCase() === 'true';

  // Filter active, living members for analysis base (include active, passive, and honorary members who are alive)
  const activeMembers = data.filter(m => 
    !isTrue(m.Deceased) && 
    (
      isTrue(m.IsActive) || 
      isTrue(m.IsPassive) || 
      isTrue(m.IsHonoraryMember) || 
      isTrue(m._istPassiv) || 
      isTrue(m._istEhren) ||
      String(m._kategorie || '').toLowerCase().includes('passiv') ||
      String(m._kategorie || '').toLowerCase().includes('ehren')
    )
  );
  
  const total = activeMembers.length;
  const totalPassive = activeMembers.filter(m => isTrue(m._istPassiv) || isTrue(m.IsPassive) || String(m._kategorie || '').toLowerCase().includes('passiv')).length;
  const totalEhren = activeMembers.filter(m => isTrue(m._istEhren) || isTrue(m.IsHonoraryMember) || String(m._kategorie || '').toLowerCase().includes('ehren')).length;
  
  const femaleCount = activeMembers.filter(m => m.Gender === 'F' || m.Gender === 'W' || String(m.Gender).toLowerCase().startsWith('w')).length;
  const maleCount = activeMembers.filter(m => m.Gender === 'M' || String(m.Gender).toLowerCase().startsWith('m')).length;
  
  const femalePct = total > 0 ? Math.round((femaleCount / total) * 100) : 0;
  const malePct = total > 0 ? Math.round((maleCount / total) * 100) : 0;

  const currentYear = new Date().getFullYear();
  let junior = 0, elite = 0, senior = 0, veteran = 0, seniorveteran = 0;
  
  activeMembers.forEach(m => {
    if (!m.BirthDate) return;
    const d = new Date(m.BirthDate);
    if (isNaN(d.getTime())) return;
    const age = currentYear - d.getFullYear();
    if (age <= 20) junior++;
    else if (age <= 45) elite++;
    else if (age <= 59) senior++;
    else if (age <= 69) veteran++;
    else seniorveteran++;
  });

  const activeCount = activeMembers.length;
  const juniorPct = activeCount > 0 ? Math.round((junior / activeCount) * 100) : 0;
  const elitePct = activeCount > 0 ? Math.round((elite / activeCount) * 100) : 0;
  const seniorPct = activeCount > 0 ? Math.round((senior / activeCount) * 100) : 0;
  const veteranPct = activeCount > 0 ? Math.round((veteran / activeCount) * 100) : 0;
  const svPct = activeCount > 0 ? Math.round((seniorveteran / activeCount) * 100) : 0;

  let g50 = { total: 0, aktivA: 0, aktivB: 0, aktivAAuflage: 0, aktivBAuflage: 0 };
  let g10 = { total: 0, aktivA: 0, aktivB: 0, aktivAAuflage: 0, aktivBAuflage: 0 };
  let kombi = { total: 0, aktivA: 0, aktivB: 0, aktivAAuflage: 0, aktivBAuflage: 0 };

  activeMembers.forEach(m => {
    // Verwende vorverlegte Lizenzen aus Cache falls nicht direkt am Objekt vorhanden
    const rawLizz = m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || _mglLizenzenCache?.[String(m.PersonNumber)] || [];
    // Nur aktive Lizenzen betrachten (kein ExitDate und aktiv-Flag)
    const lizz = rawLizz.filter(l => 
      (l.IsActive === undefined || isTrue(l.IsActive)) && 
      !String(l.ExitDate || '').trim()
    );

    let hasG50 = false;
    let hasG10 = false;

    lizz.forEach(l => {
      const c = String(l.MembershipCategory || '').toLowerCase();
      if (c.includes('g50') || c.includes('50m')) hasG50 = true;
      if (c.includes('g10') || c.includes('10m')) hasG10 = true;
    });

    // 1. Distanz-Zählungen einzeln
    lizz.forEach(l => {
      const c = String(l.MembershipCategory || '').toLowerCase();
      const isA = c.includes('aktiv-a') || c.includes('aktiv a');
      const isB = c.includes('aktiv-b') || c.includes('aktiv b');
      const isAuflage = c.includes('auflage') || c.includes('aufgelegt') || c.includes('aufg');
      
      if (c.includes('g50') || c.includes('50m')) {
        g50.total++;
        if (isA && isAuflage) g50.aktivAAuflage++;
        else if (isA) g50.aktivA++;
        else if (isB && isAuflage) g50.aktivBAuflage++;
        else if (isB) g50.aktivB++;
      }
      if (c.includes('g10') || c.includes('10m')) {
        g10.total++;
        if (isA && isAuflage) g10.aktivAAuflage++;
        else if (isA) g10.aktivA++;
        else if (isB && isAuflage) g10.aktivBAuflage++;
        else if (isB) g10.aktivB++;
      }
    });

    // 2. Kombi-Zählung (wenn beides vorhanden)
    if (hasG50 && hasG10) {
      kombi.total++;
      const isA = lizz.some(l => {
        const c = String(l.MembershipCategory || '').toLowerCase();
        return c.includes('aktiv-a') || c.includes('aktiv a');
      });
      const isB = lizz.some(l => {
        const c = String(l.MembershipCategory || '').toLowerCase();
        return c.includes('aktiv-b') || c.includes('aktiv b');
      });
      const isAuflage = lizz.some(l => {
        const c = String(l.MembershipCategory || '').toLowerCase();
        return c.includes('auflage') || c.includes('aufgelegt') || c.includes('aufg');
      });

      if (isA && isAuflage) kombi.aktivAAuflage++;
      else if (isA) kombi.aktivA++;
      else if (isB && isAuflage) kombi.aktivBAuflage++;
      else if (isB) kombi.aktivB++;
    }
  });

  let licensesHtml = '';

  // Gewehr 50m (KK)
  if (g50.total > 0) {
    const g50PctA = total > 0 ? Math.round((g50.aktivA / total) * 100) : 0;
    const g50PctB = total > 0 ? Math.round((g50.aktivB / total) * 100) : 0;
    const g50PctAA = total > 0 ? Math.round((g50.aktivAAuflage / total) * 100) : 0;
    const g50PctBA = total > 0 ? Math.round((g50.aktivBAuflage / total) * 100) : 0;

    licensesHtml += `
      <div class="mb-4">
        <div class="d-flex justify-content-between mb-1 small fw-bold text-dark" style="font-size:0.9rem">
          <span>Gewehr 50m (KK)</span>
          <span>${g50.total} Lizenzen</span>
        </div>
        <div class="progress mb-2" style="height: 12px; border-radius: 6px;">
          ${g50.aktivA > 0 ? `<div class="progress-bar bg-success" style="width: ${g50PctA}%; border-right: 2px solid #fff;" title="Aktiv-A: ${g50.aktivA}"></div>` : ''}
          ${g50.aktivB > 0 ? `<div class="progress-bar bg-success" style="width: ${g50PctB}%; opacity: 0.75; border-right: 2px solid #fff;" title="Aktiv-B: ${g50.aktivB}"></div>` : ''}
          ${g50.aktivAAuflage > 0 ? `<div class="progress-bar bg-success progress-bar-striped" style="width: ${g50PctAA}%; opacity: 0.5; border-right: 2px solid #fff;" title="Aktiv-A aufgelegt: ${g50.aktivAAuflage}"></div>` : ''}
          ${g50.aktivBAuflage > 0 ? `<div class="progress-bar bg-success progress-bar-striped" style="width: ${g50PctBA}%; opacity: 0.35; border-right: 2px solid #fff;" title="Aktiv-B aufgelegt: ${g50.aktivBAuflage}"></div>` : ''}
        </div>
        <div class="d-flex flex-column gap-3 mt-3 ps-3 ms-2 border-start" style="border-left: 3px solid #dee2e6 !important;">
    `;
    
    if (g50.aktivA > 0) {
      const pct = total > 0 ? Math.round((g50.aktivA / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-A</span>
              <span>${g50.aktivA} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-success" style="width: ${pct}%"></div>
            </div>
          </div>
      `;
    }
    if (g50.aktivB > 0) {
      const pct = total > 0 ? Math.round((g50.aktivB / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-B</span>
              <span>${g50.aktivB} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-success" style="width: ${pct}%; opacity: 0.75;"></div>
            </div>
          </div>
      `;
    }
    if (g50.aktivAAuflage > 0) {
      const pct = total > 0 ? Math.round((g50.aktivAAuflage / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-A aufgelegt</span>
              <span>${g50.aktivAAuflage} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-success progress-bar-striped" style="width: ${pct}%; opacity: 0.5;"></div>
            </div>
          </div>
      `;
    }
    if (g50.aktivBAuflage > 0) {
      const pct = total > 0 ? Math.round((g50.aktivBAuflage / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-B aufgelegt</span>
              <span>${g50.aktivBAuflage} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-success progress-bar-striped" style="width: ${pct}%; opacity: 0.35;"></div>
            </div>
          </div>
      `;
    }
    
    licensesHtml += `
        </div>
      </div>
    `;
  }

  // Luftgewehr 10m
  if (g10.total > 0) {
    const g10PctA = total > 0 ? Math.round((g10.aktivA / total) * 100) : 0;
    const g10PctB = total > 0 ? Math.round((g10.aktivB / total) * 100) : 0;
    const g10PctAA = total > 0 ? Math.round((g10.aktivAAuflage / total) * 100) : 0;
    const g10PctBA = total > 0 ? Math.round((g10.aktivBAuflage / total) * 100) : 0;

    licensesHtml += `
      <div class="mb-4">
        <div class="d-flex justify-content-between mb-1 small fw-bold text-dark" style="font-size:0.9rem">
          <span>Luftgewehr 10m</span>
          <span>${g10.total} Lizenzen</span>
        </div>
        <div class="progress mb-2" style="height: 12px; border-radius: 6px;">
          ${g10.aktivA > 0 ? `<div class="progress-bar bg-primary" style="width: ${g10PctA}%; border-right: 2px solid #fff;" title="Aktiv-A: ${g10.aktivA}"></div>` : ''}
          ${g10.aktivB > 0 ? `<div class="progress-bar bg-info text-dark" style="width: ${g10PctB}%; border-right: 2px solid #fff;" title="Aktiv-B: ${g10.aktivB}"></div>` : ''}
          ${g10.aktivAAuflage > 0 ? `<div class="progress-bar bg-primary progress-bar-striped" style="width: ${g10PctAA}%; opacity: 0.5; border-right: 2px solid #fff;" title="Aktiv-A aufgelegt: ${g10.aktivAAuflage}"></div>` : ''}
          ${g10.aktivBAuflage > 0 ? `<div class="progress-bar bg-info progress-bar-striped" style="width: ${g10PctBA}%; opacity: 0.5; border-right: 2px solid #fff;" title="Aktiv-B aufgelegt: ${g10.aktivBAuflage}"></div>` : ''}
        </div>
        <div class="d-flex flex-column gap-3 mt-3 ps-3 ms-2 border-start" style="border-left: 3px solid #dee2e6 !important;">
    `;
    
    if (g10.aktivA > 0) {
      const pct = total > 0 ? Math.round((g10.aktivA / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-A</span>
              <span>${g10.aktivA} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-primary" style="width: ${pct}%"></div>
            </div>
          </div>
      `;
    }
    if (g10.aktivB > 0) {
      const pct = total > 0 ? Math.round((g10.aktivB / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-B</span>
              <span>${g10.aktivB} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-info" style="width: ${pct}%"></div>
            </div>
          </div>
      `;
    }
    if (g10.aktivAAuflage > 0) {
      const pct = total > 0 ? Math.round((g10.aktivAAuflage / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-A aufgelegt</span>
              <span>${g10.aktivAAuflage} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-primary progress-bar-striped" style="width: ${pct}%; opacity: 0.5;"></div>
            </div>
          </div>
      `;
    }
    if (g10.aktivBAuflage > 0) {
      const pct = total > 0 ? Math.round((g10.aktivBAuflage / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-B aufgelegt</span>
              <span>${g10.aktivBAuflage} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-info progress-bar-striped" style="width: ${pct}%; opacity: 0.5;"></div>
            </div>
          </div>
      `;
    }
    
    licensesHtml += `
        </div>
      </div>
    `;
  }

  // Kombiniert Gewehr 50m & 10m
  if (kombi.total > 0) {
    const kombiPctA = total > 0 ? Math.round((kombi.aktivA / total) * 100) : 0;
    const kombiPctB = total > 0 ? Math.round((kombi.aktivB / total) * 100) : 0;
    const kombiPctAA = total > 0 ? Math.round((kombi.aktivAAuflage / total) * 100) : 0;
    const kombiPctBA = total > 0 ? Math.round((kombi.aktivBAuflage / total) * 100) : 0;

    licensesHtml += `
      <div class="mb-4">
        <div class="d-flex justify-content-between mb-1 small fw-bold text-dark" style="font-size:0.9rem">
          <span>Kombiniert (50m & 10m)</span>
          <span>${kombi.total} Mitglieder</span>
        </div>
        <div class="progress mb-2" style="height: 12px; border-radius: 6px;">
          ${kombi.aktivA > 0 ? `<div class="progress-bar" style="width: ${kombiPctA}%; background-color: #6f42c1 !important; border-right: 2px solid #fff;" title="Aktiv-A: ${kombi.aktivA}"></div>` : ''}
          ${kombi.aktivB > 0 ? `<div class="progress-bar" style="width: ${kombiPctB}%; background-color: #6f42c1 !important; opacity: 0.75; border-right: 2px solid #fff;" title="Aktiv-B: ${kombi.aktivB}"></div>` : ''}
          ${kombi.aktivAAuflage > 0 ? `<div class="progress-bar progress-bar-striped" style="width: ${kombiPctAA}%; background-color: #6f42c1 !important; opacity: 0.5; border-right: 2px solid #fff;" title="Aktiv-A aufgelegt: ${kombi.aktivAAuflage}"></div>` : ''}
          ${kombi.aktivBAuflage > 0 ? `<div class="progress-bar progress-bar-striped" style="width: ${kombiPctBA}%; background-color: #6f42c1 !important; opacity: 0.35; border-right: 2px solid #fff;" title="Aktiv-B aufgelegt: ${kombi.aktivBAuflage}"></div>` : ''}
        </div>
        <div class="d-flex flex-column gap-3 mt-3 ps-3 ms-2 border-start" style="border-left: 3px solid #dee2e6 !important;">
    `;
    
    if (kombi.aktivA > 0) {
      const pct = total > 0 ? Math.round((kombi.aktivA / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-A</span>
              <span>${kombi.aktivA} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar" style="width: ${pct}%; background-color: #6f42c1 !important;"></div>
            </div>
          </div>
      `;
    }
    if (kombi.aktivB > 0) {
      const pct = total > 0 ? Math.round((kombi.aktivB / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-B</span>
              <span>${kombi.aktivB} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar" style="width: ${pct}%; background-color: #6f42c1 !important; opacity: 0.75;"></div>
            </div>
          </div>
      `;
    }
    if (kombi.aktivAAuflage > 0) {
      const pct = total > 0 ? Math.round((kombi.aktivAAuflage / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-A aufgelegt</span>
              <span>${kombi.aktivAAuflage} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar progress-bar-striped" style="width: ${pct}%; background-color: #6f42c1 !important; opacity: 0.5;"></div>
            </div>
          </div>
      `;
    }
    if (kombi.aktivBAuflage > 0) {
      const pct = total > 0 ? Math.round((kombi.aktivBAuflage / total) * 100) : 0;
      licensesHtml += `
          <div>
            <div class="d-flex justify-content-between mb-1 small text-dark fw-semibold" style="font-size:0.8rem">
              <span>Aktiv-B aufgelegt</span>
              <span>${kombi.aktivBAuflage} Lizenzen</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar progress-bar-striped" style="width: ${pct}%; background-color: #6f42c1 !important; opacity: 0.35;"></div>
            </div>
          </div>
      `;
    }
    
    licensesHtml += `
        </div>
      </div>
    `;
  }

  const ehrenListe = activeMembers
    .filter(m => m._istEhren)
    .sort((a, b) => String(a.HonoraryMemberSince || '').localeCompare(String(b.HonoraryMemberSince || '')));

  const vorstandListe = activeMembers
    .filter(m => Number(m._aktiveFunktionenCount || 0) > 0)
    .sort((a, b) => String(a.LastName || '').localeCompare(String(b.LastName || '')));

  const passivListe = activeMembers
    .filter(m => m._istPassiv)
    .sort((a, b) => String(a.LastName || '').localeCompare(String(b.LastName || '')));

  document.getElementById('mglTabContent').innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100 border-start border-4" style="border-left-color: #0f3a5d !important;">
          <div class="mgl-stat-title text-uppercase mb-1">Mitglieder Total</div>
          <div class="mgl-stat-value">${total}</div>
          <div class="small text-muted" style="font-size:0.7rem">Lebende Mitglieder im System</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100 border-start border-4" style="border-left-color: #198754 !important;">
          <div class="mgl-stat-title text-uppercase mb-1">Aktive Lizenzierte</div>
          <div class="mgl-stat-value text-success">${activeMembers.filter(m => Number(m._aktiveLizenzenCount || 0) > 0).length}</div>
          <div class="small text-muted" style="font-size:0.7rem">Aktiv mit gültiger SSV Lizenz</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100 border-start border-4" style="border-left-color: #f59e0b !important;">
          <div class="mgl-stat-title text-uppercase mb-1">Ehrenmitglieder</div>
          <div class="mgl-stat-value text-warning">${totalEhren}</div>
          <div class="small text-muted" style="font-size:0.7rem">Besondere Verdienste</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100 border-start border-4" style="border-left-color: #6c757d !important;">
          <div class="mgl-stat-title text-uppercase mb-1">Passivmitglieder</div>
          <div class="mgl-stat-value text-secondary">${totalPassive}</div>
          <div class="small text-muted" style="font-size:0.7rem">Unterstützende Mitglieder</div>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm p-4 h-100">
          <h5 class="fw-bold mb-3 text-dark"><i class="fas fa-venus-mars text-primary me-2"></i>Geschlechterverteilung</h5>
          <div class="d-flex justify-content-between mb-2 fw-semibold small">
            <span>♂️ Männlich (${maleCount})</span>
            <span>♀️ Weiblich (${femaleCount})</span>
          </div>
          <div class="progress" style="height: 24px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;">
            <div class="progress-bar" style="width: ${malePct}%; background-color: #0f3a5d;" aria-valuenow="${malePct}" aria-valuemin="0" aria-valuemax="100">${malePct}%</div>
            <div class="progress-bar bg-danger" style="width: ${femalePct}%;" aria-valuenow="${femalePct}" aria-valuemin="0" aria-valuemax="100">${femalePct}%</div>
          </div>
          
          <h5 class="fw-bold mb-3 mt-4 text-dark"><i class="fas fa-award text-primary me-2"></i>Lizenzen & Disziplinen</h5>
          <div class="d-flex flex-column gap-3">
            ${licensesHtml}
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm p-4 h-100">
          <h5 class="fw-bold mb-3 text-dark"><i class="fas fa-birthday-cake text-primary me-2"></i>Altersstruktur (Aktive)</h5>
          
          <div class="d-flex flex-column gap-2">
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>👶 Schüler & Junioren (≤20 Jahre)</span>
                <span>${junior} (${juniorPct}%)</span>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar" style="background-color: #20c997; width: ${juniorPct}%"></div>
              </div>
            </div>
            
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>🎯 Elite / Aktiv (21–45 Jahre)</span>
                <span>${elite} (${elitePct}%)</span>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar" style="background-color: #0d6efd; width: ${elitePct}%"></div>
              </div>
            </div>
            
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>👨 Senioren (46–59 Jahre)</span>
                <span>${senior} (${seniorPct}%)</span>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar" style="background-color: #6f42c1; width: ${seniorPct}%"></div>
              </div>
            </div>
            
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>👴 Veteranen (60–69 Jahre)</span>
                <span>${veteran} (${veteranPct}%)</span>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar" style="background-color: #fd7e14; width: ${veteranPct}%"></div>
              </div>
            </div>
            
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>🏆 Seniorveteranen (≥70 Jahre)</span>
                <span>${seniorveteran} (${svPct}%)</span>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar" style="background-color: #dc3545; width: ${svPct}%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-4">
        <div class="card border-0 shadow-sm p-4 h-100">
          <h5 class="fw-bold mb-3 text-dark text-warning"><i class="fas fa-trophy me-2"></i>🏆 Ehrentafel</h5>
          <div style="max-height: 280px; overflow-y: auto;">
            ${ehrenListe.length > 0 ? `
              <ul class="list-group list-group-flush">
                ${ehrenListe.map(m => {
                  const pn = String(m.PersonNumber || '').trim();
                  const yr = m._ernennungsjahr || (m.HonoraryMemberSince ? (window.mglExtractYear ? window.mglExtractYear(m.HonoraryMemberSince) : new Date(m.HonoraryMemberSince).getFullYear()) : null);
                  const yrBadge = yr ? `Ernannt ${yr}` : (m.HonoraryMemberSince ? `seit ${mglFmtDate(m.HonoraryMemberSince)}` : 'Ehrenmitglied');
                  return `
                    <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                      <div>
                        <a href="#" class="text-decoration-none fw-bold text-dark" onclick="mglOpenDetail('${escapeJs(pn)}'); return false;">
                          ${escapeHtml(m.FirstName)} ${escapeHtml(m.LastName)}
                        </a>
                      </div>
                      <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-1 small fw-semibold"><i class="fas fa-medal me-1"></i>${yrBadge}</span>
                    </li>
                  `;
                }).join('')}
              </ul>
            ` : '<div class="text-center text-muted py-4">Keine Ehrenmitglieder eingetragen</div>'}
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-4">
        <div class="card border-0 shadow-sm p-4 h-100">
          <h5 class="fw-bold mb-3 text-dark"><i class="fas fa-user-tie text-primary me-2"></i>💼 Vorstand & Funktionäre</h5>
          <div style="max-height: 280px; overflow-y: auto;">
            ${vorstandListe.length > 0 ? `
              <ul class="list-group list-group-flush">
                ${vorstandListe.map(m => {
                  const pn = String(m.PersonNumber || '').trim();
                  const activeFns = (window._mglFunktionenCache?.[pn] || []).filter(f => typeof mglIsFunctionActive === 'function' ? mglIsFunctionActive(f) : !f.OfficialFunctionExitDate);
                  const fnList = activeFns.map(f => f.OfficialFunctionCategory).join(', ') || m._kategorie || 'Funktionär';
                  return `
                    <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                      <div>
                        <a href="#" class="text-decoration-none fw-bold text-dark" onclick="mglOpenDetail('${escapeJs(pn)}'); return false;">
                          ${escapeHtml(m.FirstName)} ${escapeHtml(m.LastName)}
                        </a>
                        <div class="text-primary small" style="font-size: 0.78rem;">
                          <i class="fas fa-briefcase me-1 opacity-75"></i>${escapeHtml(fnList)}
                        </div>
                      </div>
                      <button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="mglOpenDetail('${escapeJs(pn)}')" title="Profil öffnen">
                        <i class="fas fa-eye"></i>
                      </button>
                    </li>
                  `;
                }).join('')}
              </ul>
            ` : '<div class="text-center text-muted py-4">Keine Funktionäre eingetragen</div>'}
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-4">
        <div class="card border-0 shadow-sm p-4 h-100">
          <h5 class="fw-bold mb-3 text-dark"><i class="fas fa-users text-secondary me-2"></i>👥 Passivmitglieder</h5>
          <div style="max-height: 280px; overflow-y: auto;">
            ${passivListe.length > 0 ? `
              <ul class="list-group list-group-flush">
                ${passivListe.map(m => {
                  const pn = String(m.PersonNumber || '').trim();
                  const ort = [m.PostCode, m.City].filter(Boolean).join(' ');
                  return `
                    <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                      <div>
                        <a href="#" class="text-decoration-none fw-bold text-dark" onclick="mglOpenDetail('${escapeJs(pn)}'); return false;">
                          ${escapeHtml(m.FirstName)} ${escapeHtml(m.LastName)}
                        </a>
                        ${ort ? `<div class="text-muted small" style="font-size: 0.75rem;"><i class="fas fa-map-marker-alt me-1 opacity-75"></i>${escapeHtml(ort)}</div>` : ''}
                      </div>
                      <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="mglOpenDetail('${escapeJs(pn)}')" title="Profil öffnen">
                        <i class="fas fa-eye"></i>
                      </button>
                    </li>
                  `;
                }).join('')}
              </ul>
            ` : '<div class="text-center text-muted py-4">Keine Passivmitglieder eingetragen</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==============================================================================
// SUB-MODUL: MITGLIEDER - JUBILÄEN & VEREINSJAHRE
// ==============================================================================

window._mglJubileeYear = window._mglJubileeYear || new Date().getFullYear();
window._mglJubileeFilter = window._mglJubileeFilter || 'alle';
window._mglJubileeScope = window._mglJubileeScope || 'aktiv_passiv';

function mglSetJubileeYear(yr) {
  window._mglJubileeYear = parseInt(yr, 10) || new Date().getFullYear();
  mglRenderJubilaeen(window._mglData);
}
window.mglSetJubileeYear = mglSetJubileeYear;

function mglSetJubileeFilter(ms) {
  window._mglJubileeFilter = String(ms);
  mglRenderJubilaeen(window._mglData);
}
window.mglSetJubileeFilter = mglSetJubileeFilter;

function mglSetJubileeScope(scope) {
  window._mglJubileeScope = scope;
  mglRenderJubilaeen(window._mglData);
}
window.mglSetJubileeScope = mglSetJubileeScope;

function mglJubileeBadge(milestone, customText) {
  const m = Number(milestone);
  if (m === 25) {
    return `<span class="badge shadow-xs text-nowrap" style="background: linear-gradient(135deg, #64748b, #94a3b8); color: #fff; border: 1px solid #cbd5e1;"><i class="fas fa-medal me-1"></i>${customText || '🥈 25 Jahre (Silber)'}</span>`;
  }
  if (m === 50) {
    return `<span class="badge shadow-xs text-nowrap" style="background: linear-gradient(135deg, #d97706, #f59e0b); color: #fff; border: 1px solid #fbbf24;"><i class="fas fa-crown me-1"></i>${customText || '🥇 50 Jahre (Gold)'}</span>`;
  }
  if (m === 60) {
    return `<span class="badge shadow-xs text-nowrap" style="background: linear-gradient(135deg, #0284c7, #38bdf8); color: #fff; border: 1px solid #38bdf8;"><i class="fas fa-gem me-1"></i>${customText || '💎 60 Jahre (Diamant)'}</span>`;
  }
  if (m >= 65) {
    return `<span class="badge bg-danger-subtle text-danger border border-danger-subtle text-nowrap"><i class="fas fa-crown me-1"></i>${customText || m + ' Jahre (Kranz)'}</span>`;
  }
  if (m === 40) {
    return `<span class="badge bg-warning-subtle text-dark border border-warning text-nowrap"><i class="fas fa-star me-1 text-warning"></i>${customText || '⭐ 40 Jahre'}</span>`;
  }
  if (m === 30) {
    return `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle text-nowrap"><i class="fas fa-award me-1"></i>${customText || '🏅 30 Jahre'}</span>`;
  }
  if (m === 20) {
    return `<span class="badge bg-primary-subtle text-primary border border-primary-subtle text-nowrap"><i class="fas fa-bullseye me-1"></i>${customText || '🎯 20 Jahre'}</span>`;
  }
  if (m === 10) {
    return `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle text-nowrap"><i class="fas fa-certificate me-1"></i>${customText || '🥉 10 Jahre'}</span>`;
  }
  return `<span class="badge bg-light text-dark border text-nowrap">${customText || m + ' Jahre'}</span>`;
}
window.mglJubileeBadge = mglJubileeBadge;

function mglExportJubilaeenExcel() {
  if (window.UIExportKit?.tableToExcel) {
    window.UIExportKit.tableToExcel('#mgl-jubilaeen-table', {
      filename: `Vereinsjubilaeen_Sportschuetzen_Muhen_${window._mglJubileeYear}`,
      sheetName: `Jubiläen ${window._mglJubileeYear}`
    });
  } else if (window.UIConfirmKit?.alert) {
    window.UIConfirmKit.alert({
      title: 'Export nicht bereit',
      message: 'Das Excel-Exportmodul ist aktuell nicht verfügbar.',
      type: 'warning'
    });
  }
}
window.mglExportJubilaeenExcel = mglExportJubilaeenExcel;

function mglRenderJubilaeen(data) {
  const allList = Array.isArray(data) ? data : (Array.isArray(window._mglData) ? window._mglData : []);
  const targetYear = window._mglJubileeYear || new Date().getFullYear();
  const scope = window._mglJubileeScope || 'aktiv_passiv';
  const filterMs = window._mglJubileeFilter || 'alle';

  // Scope-Filterung
  const filteredMembers = allList.filter(m => {
    const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
    if (scope === 'aktiv') {
      return (m.IsActive == 1 || m.IsActive === true || m.IsActive === '1') && !isDeceased;
    }
    if (scope === 'aktiv_passiv') {
      return ((m.IsActive == 1 || m.IsActive === true || m.IsActive === '1') || m._istPassiv || m._istEhren) && !isDeceased;
    }
    return true; // 'alle' inkl. Archiv & Verstorbene
  });

  // Berechnung der Mitgliedsjahre im Zieljahr
  const membersWithYears = filteredMembers.map(m => {
    const entryDate = m.ClubEntryDate || m.FirstClubEntryDateSSV;
    const entryYear = window.mglExtractYear ? window.mglExtractYear(entryDate) : (entryDate ? new Date(entryDate).getFullYear() : null);
    const exitYear = m.Vereinsaustritt ? (window.mglExtractYear ? window.mglExtractYear(m.Vereinsaustritt) : new Date(m.Vereinsaustritt).getFullYear()) : null;
    
    let yearsInTarget = null;
    if (entryYear && entryYear > 1900) {
      const effEnd = exitYear && exitYear < targetYear ? exitYear : targetYear;
      yearsInTarget = Math.max(0, effEnd - entryYear);
    }

    const isCelebrator = yearsInTarget && yearsInTarget > 0 && (window.JUBILEE_MILESTONES ? window.JUBILEE_MILESTONES.includes(yearsInTarget) : [10, 20, 25, 30, 40, 50, 60, 65, 70, 75, 80].includes(yearsInTarget)) && (!exitYear || exitYear >= targetYear);
    const nextJubilee = (!exitYear && entryDate && window.mglNextJubilee) ? window.mglNextJubilee(entryDate, targetYear) : null;

    return {
      member: m,
      entryDate,
      entryYear,
      exitYear,
      yearsInTarget: yearsInTarget || 0,
      isCelebrator,
      nextJubilee
    };
  }).filter(item => item.entryYear && item.entryYear > 1900);

  // Jubilare des Zieljahres
  const allCelebrators = membersWithYears.filter(item => item.isCelebrator);
  
  // Meilenstein-Filter anwenden auf Jubilare
  const displayCelebrators = allCelebrators.filter(item => {
    if (filterMs === 'alle') return true;
    if (filterMs === '65plus') return item.yearsInTarget >= 65;
    return item.yearsInTarget === parseInt(filterMs, 10);
  }).sort((a, b) => b.yearsInTarget - a.yearsInTarget || String(a.member.LastName || '').localeCompare(String(b.member.LastName || '')));

  // Gesamtrangliste sortiert nach Dienstjahren
  const rankingList = [...membersWithYears].sort((a, b) => b.yearsInTarget - a.yearsInTarget || String(a.member.LastName || '').localeCompare(String(b.member.LastName || '')));

  // Statistiken
  const countSilber = allCelebrators.filter(c => c.yearsInTarget === 25).length;
  const countGold = allCelebrators.filter(c => c.yearsInTarget === 50).length;
  const countDiamant = allCelebrators.filter(c => c.yearsInTarget === 60).length;
  const maxYears = rankingList.length > 0 ? rankingList[0].yearsInTarget : 0;

  const currentCalYear = new Date().getFullYear();

  document.getElementById('mglTabContent').innerHTML = `
    <!-- HEADER & AKTIONEN -->
    <div class="card border-0 shadow-sm mb-4" style="background: linear-gradient(135deg, rgba(15, 58, 93, 0.04) 0%, rgba(245, 158, 11, 0.06) 100%); border-radius: 14px;">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <h4 class="fw-bold mb-1 text-dark d-flex align-items-center gap-2">
              <span class="fs-3">🏆</span> Jubiläen &amp; Vereinsjahre
            </h4>
            <div class="text-muted small">
              Ehrungen für die Generalversammlung, runde Meilensteine &amp; Bestenliste nach Vereinsjahren.
            </div>
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <!-- Zieljahr-Auswahl -->
            <div class="d-flex align-items-center gap-1 bg-white p-1 rounded-3 border shadow-xs">
              <span class="small text-muted px-2 fw-semibold">Jubiläumsjahr:</span>
              <button class="btn btn-sm ${targetYear === currentCalYear ? 'btn-primary' : 'btn-outline-secondary'} py-1 px-2" onclick="mglSetJubileeYear(${currentCalYear})">
                ${currentCalYear} (Aktuell)
              </button>
              <button class="btn btn-sm ${targetYear === currentCalYear + 1 ? 'btn-primary' : 'btn-outline-secondary'} py-1 px-2" onclick="mglSetJubileeYear(${currentCalYear + 1})">
                ${currentCalYear + 1} (Kommende GV)
              </button>
              <select class="form-select form-select-sm" style="width: 100px;" onchange="mglSetJubileeYear(this.value)">
                ${[currentCalYear - 2, currentCalYear - 1, currentCalYear, currentCalYear + 1, currentCalYear + 2].map(y => `
                  <option value="${y}" ${y === targetYear ? 'selected' : ''}>${y}</option>
                `).join('')}
              </select>
            </div>

            <!-- Excel-Export Button -->
            <button class="btn btn-sm btn-outline-success ms-md-2" onclick="mglExportJubilaeenExcel()" title="Jubiläumsliste und Rangliste als Excel-Datei exportieren">
              <i class="fas fa-file-excel me-1"></i> Excel-Export
            </button>
          </div>
        </div>

        <!-- STATS KARTEN -->
        <div class="row g-2 g-md-3 mt-3">
          <div class="col-6 col-md-3">
            <div class="mgl-stat-card p-3 h-100 border-start border-4 border-warning">
              <div class="mgl-stat-title text-uppercase mb-1">Jubilare im Jahr ${targetYear}</div>
              <div class="mgl-stat-value text-warning">${allCelebrators.length}</div>
              <div class="small text-muted" style="font-size:0.7rem">Runde Vereinsjubiläen</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="mgl-stat-card p-3 h-100 border-start border-4 border-secondary">
              <div class="mgl-stat-title text-uppercase mb-1">Silber (25 Jahre)</div>
              <div class="mgl-stat-value text-secondary">${countSilber}</div>
              <div class="small text-muted" style="font-size:0.7rem">Eintritt ${targetYear - 25}</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="mgl-stat-card p-3 h-100 border-start border-4 border-primary">
              <div class="mgl-stat-title text-uppercase mb-1">Gold (50 Jahre)</div>
              <div class="mgl-stat-value text-primary">${countGold}</div>
              <div class="small text-muted" style="font-size:0.7rem">Eintritt ${targetYear - 50}</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="mgl-stat-card p-3 h-100 border-start border-4 border-success">
              <div class="mgl-stat-title text-uppercase mb-1">Spitzenreiter</div>
              <div class="mgl-stat-value text-success">${maxYears} Jahre</div>
              <div class="small text-muted" style="font-size:0.7rem">Längste Vereinszugehörigkeit</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FILTERLEISTEN: SCOPE & MEILENSTEINE -->
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <!-- Meilenstein Filter Chips -->
      <div class="d-flex flex-wrap gap-1 align-items-center">
        <span class="text-muted small me-2" style="font-weight: 600;">Jubiläen ${targetYear}:</span>
        <div class="mgl-pill-tab ${filterMs === 'alle' ? 'active' : ''}" onclick="mglSetJubileeFilter('alle')">
          Alle Jubilare <span class="badge rounded-pill bg-light text-dark ms-1" style="font-size:0.7rem">${allCelebrators.length}</span>
        </div>
        <div class="mgl-pill-tab ${filterMs === '25' ? 'active' : ''}" onclick="mglSetJubileeFilter('25')">
          🥈 25 Jahre (Silber) <span class="badge rounded-pill bg-light text-dark ms-1" style="font-size:0.7rem">${countSilber}</span>
        </div>
        <div class="mgl-pill-tab ${filterMs === '50' ? 'active' : ''}" onclick="mglSetJubileeFilter('50')">
          🥇 50 Jahre (Gold) <span class="badge rounded-pill bg-light text-dark ms-1" style="font-size:0.7rem">${countGold}</span>
        </div>
        <div class="mgl-pill-tab ${filterMs === '40' ? 'active' : ''}" onclick="mglSetJubileeFilter('40')">
          ⭐ 40 Jahre <span class="badge rounded-pill bg-light text-dark ms-1" style="font-size:0.7rem">${allCelebrators.filter(c => c.yearsInTarget === 40).length}</span>
        </div>
        <div class="mgl-pill-tab ${filterMs === '30' ? 'active' : ''}" onclick="mglSetJubileeFilter('30')">
          🏅 30 Jahre <span class="badge rounded-pill bg-light text-dark ms-1" style="font-size:0.7rem">${allCelebrators.filter(c => c.yearsInTarget === 30).length}</span>
        </div>
        <div class="mgl-pill-tab ${filterMs === '20' ? 'active' : ''}" onclick="mglSetJubileeFilter('20')">
          🎯 20 Jahre <span class="badge rounded-pill bg-light text-dark ms-1" style="font-size:0.7rem">${allCelebrators.filter(c => c.yearsInTarget === 20).length}</span>
        </div>
        <div class="mgl-pill-tab ${filterMs === '10' ? 'active' : ''}" onclick="mglSetJubileeFilter('10')">
          🥉 10 Jahre <span class="badge rounded-pill bg-light text-dark ms-1" style="font-size:0.7rem">${allCelebrators.filter(c => c.yearsInTarget === 10).length}</span>
        </div>
      </div>

      <!-- Scope Filter -->
      <div class="d-flex align-items-center gap-1">
        <span class="text-muted small me-1">Umfang:</span>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-secondary ${scope === 'aktiv' ? 'active' : ''}" onclick="mglSetJubileeScope('aktiv')">Nur Aktive</button>
          <button type="button" class="btn btn-outline-secondary ${scope === 'aktiv_passiv' ? 'active' : ''}" onclick="mglSetJubileeScope('aktiv_passiv')">Aktiv &amp; Passiv</button>
          <button type="button" class="btn btn-outline-secondary ${scope === 'alle' ? 'active' : ''}" onclick="mglSetJubileeScope('alle')">Alle inkl. Archiv</button>
        </div>
      </div>
    </div>

    <!-- SEKTION 1: JUBILARE DES JAHRES (KARTEN) -->
    <div class="mb-4">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
          <span>🎉</span> Jubilare im Jahr ${targetYear}
          <span class="badge bg-warning text-dark fs-6">${displayCelebrators.length}</span>
        </h5>
        <span class="small text-muted">Kandidaten für die GV-Ehrung im Jahr ${targetYear}</span>
      </div>

      ${displayCelebrators.length > 0 ? `
        <div class="row g-3">
          ${displayCelebrators.map(item => {
            const m = item.member;
            const pn = String(m.PersonNumber || '');
            const name = escapeHtml((m.FirstName || '') + ' ' + (m.LastName || ''));
            const city = escapeHtml(m.City || '');
            const initials = `${(m.FirstName || '').charAt(0)}${(m.LastName || '').charAt(0)}`.trim() || '??';
            const jubileeBadgeHtml = mglJubileeBadge(item.yearsInTarget);
            const statusBadgeHtml = mglStatusBadge(m);

            return `
              <div class="col-sm-6 col-md-4 col-lg-3">
                <div class="card border-0 shadow-sm h-100 position-relative" style="border-radius: 12px; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='none'">
                  <div class="card-body p-3 d-flex flex-column">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                      <div class="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0" style="width: 46px; height: 46px; background: linear-gradient(135deg, var(--primary) 0%, #1e4b7a 100%); font-size: 1rem; overflow: hidden;">
                        ${m.AvatarUrl ? `<img src="${m.AvatarUrl}" alt="${name}" style="width:100%; height:100%; object-fit:cover;">` : initials}
                      </div>
                      <div>
                        ${jubileeBadgeHtml}
                      </div>
                    </div>

                    <div class="fw-bold text-dark text-truncate fs-6" title="${name}">
                      <a href="#" class="text-dark text-decoration-none" onclick="mglOpenDetail('${escapeJs(pn)}'); return false;">${name}</a>
                    </div>
                    ${city ? `<div class="text-muted small" style="font-size:0.75rem;"><i class="fas fa-location-dot me-1 text-muted opacity-50"></i>${city}</div>` : ''}

                    <div class="d-flex flex-wrap gap-1 my-2">
                      ${statusBadgeHtml}
                    </div>

                    <div class="mt-auto pt-2 border-top small text-muted">
                      <div class="d-flex justify-content-between">
                        <span>Eintritt:</span>
                        <span class="fw-semibold text-dark">${mglFmtDate(item.entryDate)}</span>
                      </div>
                      <div class="d-flex justify-content-between mt-1">
                        <span>Vereinsjahre ${targetYear}:</span>
                        <span class="fw-bold text-primary">${item.yearsInTarget} Jahre</span>
                      </div>
                    </div>

                    <button class="btn btn-sm btn-outline-primary mt-2 w-100" onclick="mglOpenDetail('${escapeJs(pn)}')">
                      <i class="fas fa-eye me-1"></i> Details anzeigen
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="card border-0 shadow-sm p-4 text-center text-muted">
          <i class="fas fa-calendar-times fa-2x mb-2 text-muted opacity-50"></i>
          <h6 class="fw-bold text-dark">Keine Jubilare für die gewählten Filter im Jahr ${targetYear}</h6>
          <p class="small mb-0">Im Jahr ${targetYear} steht unter den gewählten Kriterien kein Meilenstein-Jubiläum an.</p>
        </div>
      `}
    </div>

    <!-- SEKTION 2: GESAMTRANGLISTE ALLER MITGLIEDER NACH VEREINSJAHREN -->
    <div class="card border-0 shadow-sm mt-4">
      <div class="card-header bg-white border-0 py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h5 class="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
            <span>🎖️</span> Gesamtrangliste nach Vereinsjahren
            <span class="badge bg-secondary rounded-pill small">${rankingList.length}</span>
          </h5>
          <span class="small text-muted">Vollständige Rangfolge aller Vereinsmitglieder geordnet nach Treuejahren im Verein.</span>
        </div>
        <div id="mgl-jubilaeen-col-toggle"></div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0 align-middle" id="mgl-jubilaeen-table">
            <thead class="table-light sticky-top small text-muted text-uppercase" style="font-size: 11px; z-index: 10;">
              <tr>
                <th data-col-id="rank" data-col-name="Rang" class="py-2 text-center" style="width: 50px;">#</th>
                <th data-col-id="member" data-col-name="Mitglied" class="py-2">Mitglied</th>
                <th data-col-id="status" data-col-name="Status" class="py-2">Status</th>
                <th data-col-id="entry" data-col-name="Vereinseintritt" class="py-2">Vereinseintritt</th>
                <th data-col-id="years" data-col-name="Vereinsjahre" class="py-2 text-center" style="width: 140px;">Vereinsjahre (${targetYear})</th>
                <th data-col-id="next" data-col-name="Nächstes Jubiläum" class="py-2">Nächstes Jubiläum</th>
                <th data-col-id="actions" data-col-name="Aktionen" class="text-end py-2" style="width: 80px;"></th>
              </tr>
            </thead>
            <tbody>
              ${rankingList.map((item, idx) => {
                const m = item.member;
                const pn = String(m.PersonNumber || '');
                const name = escapeHtml((m.FirstName || '') + ' ' + (m.LastName || ''));
                const city = escapeHtml(m.City || '');
                const statusBadgeHtml = mglStatusBadge(m);
                const next = item.nextJubilee;
                
                let nextHtml = '–';
                if (item.isCelebrator) {
                  nextHtml = `<span class="badge bg-success shadow-xs"><i class="fas fa-award me-1"></i>Feiert ${item.yearsInTarget} Jahre in ${targetYear}!</span>`;
                } else if (next) {
                  const badgeIcon = next.milestone === 50 ? '🥇' : (next.milestone === 25 ? '🥈' : '🎖');
                  const inText = next.inYears === 1 ? 'nächstes Jahr' : `in ${next.inYears} Jahren`;
                  nextHtml = `<span class="badge bg-light text-dark border"><i class="fas fa-hourglass-half me-1 text-muted"></i>${badgeIcon} ${next.milestone} Jahre in ${next.jubileeYear} <span class="text-muted fw-normal">(${inText})</span></span>`;
                }

                // Fortschrittsbalken relativ zu 50 Jahren
                const pct = Math.min(100, Math.round((item.yearsInTarget / 50) * 100));

                return `
                  <tr>
                    <td data-col-id="rank" class="text-center font-monospace fw-bold text-muted small">${idx + 1}</td>
                    <td data-col-id="member">
                      <a href="#" class="text-decoration-none fw-semibold text-dark" onclick="mglOpenDetail('${escapeJs(pn)}'); return false;">
                        ${name}
                      </a>
                      ${city ? `<div class="text-muted small" style="font-size:0.74rem;"><i class="fas fa-location-dot me-1 text-muted opacity-50"></i>${city}</div>` : ''}
                    </td>
                    <td data-col-id="status">${statusBadgeHtml}</td>
                    <td data-col-id="entry" class="small text-nowrap">
                      <div>${mglFmtDate(item.entryDate)}</div>
                      <div class="text-muted" style="font-size: 0.72rem;">Eintritt ${item.entryYear}</div>
                    </td>
                    <td data-col-id="years" class="text-center">
                      <div class="fw-bold fs-6 text-primary">${item.yearsInTarget} Jahre</div>
                      <div class="progress" style="height: 4px; width: 80px; margin: 2px auto 0 auto;" title="${item.yearsInTarget} Jahre">
                        <div class="progress-bar ${item.yearsInTarget >= 50 ? 'bg-warning' : (item.yearsInTarget >= 25 ? 'bg-secondary' : 'bg-primary')}" style="width: ${pct}%;"></div>
                      </div>
                    </td>
                    <td data-col-id="next">${nextHtml}</td>
                    <td data-col-id="actions" class="text-end text-nowrap">
                      <button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="mglOpenDetail('${escapeJs(pn)}')" title="Mitgliedsprofil öffnen">
                        <i class="fas fa-eye"></i>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (typeof window.TableKit?.initTable === 'function') {
    window.TableKit.initTable('#mgl-jubilaeen-table', {
      id: 'portal_mgl_jubilaeen',
      storageKeyWidths: 'portal_mgl_jubilaeen_widths',
      storageKeyOrder: 'portal_mgl_jubilaeen_order',
      storageKeyCols: 'portal_mgl_jubilaeen_cols',
      resizable: {
        minWidth: 50,
        columns: {
          rank: { minWidth: 40, defaultWidth: 50, resizable: false },
          actions: { minWidth: 70, defaultWidth: 80, resizable: false }
        }
      },
      columnToggle: '#mgl-jubilaeen-col-toggle'
    });
  }
}
window.mglRenderJubilaeen = mglRenderJubilaeen;
