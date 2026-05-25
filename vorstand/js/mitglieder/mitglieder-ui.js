// === SUB-MODUL: MITGLIEDER - UI ===

function renderMitgliederView(data) {
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
    <div class="d-flex gap-2 mb-3 border-bottom pb-2">
      <div class="mgl-pill-tab ${listTabActive}" onclick="mglSwitchTab('liste')">
        <i class="fas fa-list-ul me-1"></i> Mitgliederliste
      </div>
      <div class="mgl-pill-tab ${analyseTabActive}" onclick="mglSwitchTab('analyse')">
        <i class="fas fa-chart-pie me-1"></i> Mitglieder-Analyse
      </div>
    </div>

    <!-- TAB-INHALTE -->
    <div id="mglTabContent"></div>

    <!-- DETAIL MODAL -->
    <div class="modal fade" id="mglModalDetail" tabindex="-1">
      <div class="modal-dialog modal-xl modal-fullscreen-lg-down">
        <div class="modal-content border-0 shadow-lg">
          <div class="modal-header border-0 bg-primary text-white" style="border-radius: 8px 8px 0 0;">
            <h5 class="modal-title fw-bold" id="mglDetailTitle">Mitglied</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-0" id="mglDetailBody"></div>
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
            <button class="btn btn-primary" onclick="mglSaveNeu()">
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
  } else {
    mglRenderAnalyse(data);
  }
}

function mglSwitchTab(tab) {
  _mglActiveTab = tab;
  renderMitgliederView(_mglData);
  if (tab === 'liste') {
    mglFilter();
  }
}

function mglRenderStats(data) {
  const deceased = data.filter(m => m.Deceased == 1 || m.Deceased === true || m.Deceased === '1');
  const living = data.filter(m => !(m.Deceased == 1 || m.Deceased === true || m.Deceased === '1'));
  
  const totalLiving = living.filter(m => m.IsActive == 1 || m.IsActive === true || m.IsActive === '1').length;
  const mitLizenz = living.filter(m => Number(m._aktiveLizenzenCount || 0) > 0).length;
  const ehren = living.filter(m => m._istEhren).length;
  const vorstand = living.filter(m => Number(m._aktiveFunktionenCount || 0) > 0).length;
  const inactive = living.filter(m => !(m.IsActive == 1 || m.IsActive === true || m.IsActive === '1')).length;

  const el = document.getElementById('mglStats');
  if (!el) return;

  el.innerHTML = `
    <div class="row g-2 w-100 mb-2">
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100">
          <div class="mgl-stat-title text-uppercase fw-bold mb-1">Bestand</div>
          <div class="mgl-stat-value text-primary">${totalLiving}</div>
          <div class="small text-muted" style="font-size:0.7rem">Aktiv/Passiv/Ehren</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100">
          <div class="mgl-stat-title text-uppercase fw-bold mb-1">Wettkampf</div>
          <div class="mgl-stat-value text-success">${mitLizenz}</div>
          <div class="small text-muted" style="font-size:0.7rem">Mit aktiver Lizenz</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100">
          <div class="mgl-stat-title text-uppercase fw-bold mb-1">Ehrenamt</div>
          <div class="mgl-stat-value text-warning">${ehren}</div>
          <div class="small text-muted" style="font-size:0.7rem">Ehrenmitglieder</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mgl-stat-card p-3 h-100">
          <div class="mgl-stat-title text-uppercase fw-bold mb-1">Vorstand</div>
          <div class="mgl-stat-value text-info">${vorstand}</div>
          <div class="small text-muted" style="font-size:0.7rem">Aktive Funktionen</div>
        </div>
      </div>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center mt-1">
      <span class="badge bg-secondary px-3 py-2">📁 Ehemalige: ${inactive}</span>
      <span class="badge bg-dark px-3 py-2">† In Memoriam: ${deceased.length}</span>
    </div>`;
}

function mglStatusBadge(m) {
  const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
  const isEhren = m._istEhren || m.IsHonoraryMember == 1 || m.IsHonoraryMember === true;
  const isPassiv = m._istPassiv || m.IsPassive == 1 || m.IsPassive === true;
  const isAktiv = m.IsActive == 1 || m.IsActive === true || m.IsActive === '1';
  const hatAktLiz = Number(m._aktiveLizenzenCount || 0) > 0;

  if (isDeceased) return '<span class="badge bg-dark">† Verstorben</span>';
  if (isEhren) return '<span class="badge bg-warning text-dark">Ehrenmitglied</span>';
  if (isPassiv) return '<span class="badge bg-secondary">Passiv</span>';
  if (isAktiv && hatAktLiz) return '<span class="badge bg-success">Aktiv</span>';
  if (isAktiv && !hatAktLiz) return '<span class="badge bg-success opacity-75">Aktiv</span>';
  return '<span class="badge bg-dark">Inaktiv</span>';
}

function mglKatBadge(kat) {
  if (!kat) return '<span class="badge bg-light text-dark">–</span>';
  if (/vorstand/i.test(kat)) return `<span class="badge bg-info text-dark">${kat}</span>`;
  if (/ehren/i.test(kat)) return `<span class="badge bg-warning text-dark">${kat}</span>`;
  if (/passiv/i.test(kat)) return `<span class="badge bg-secondary">${kat}</span>`;
  if (/aktiv.*a/i.test(kat)) return `<span class="badge bg-primary">${kat}</span>`;
  if (/aktiv.*b/i.test(kat)) return `<span class="badge" style="background:#4a90d9">${kat}</span>`;
  if (/junior|schüler/i.test(kat)) return `<span class="badge bg-success">${kat}</span>`;
  return `<span class="badge bg-secondary">${kat}</span>`;
}

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

  const vorstandListe = activeMembers.filter(m => Number(m._aktiveFunktionenCount || 0) > 0);

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
      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm p-4 h-100">
          <h5 class="fw-bold mb-3 text-dark text-warning"><i class="fas fa-trophy me-2"></i>🏆 Ehrentafel</h5>
          <div style="max-height: 250px; overflow-y: auto;">
            ${ehrenListe.length > 0 ? `
              <ul class="list-group list-group-flush">
                ${ehrenListe.map(m => `
                  <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                    <span class="fw-bold text-dark">${escapeHtml(m.FirstName)} ${escapeHtml(m.LastName)}</span>
                    <span class="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill px-3">seit ${mglFmtDate(m.HonoraryMemberSince)}</span>
                  </li>
                `).join('')}
              </ul>
            ` : '<div class="text-center text-muted py-4">Keine Ehrenmitglieder eingetragen</div>'}
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm p-4 h-100">
          <h5 class="fw-bold mb-3 text-dark"><i class="fas fa-user-tie text-primary me-2"></i>💼 Vorstand & Funktionäre</h5>
          <div style="max-height: 250px; overflow-y: auto;">
            ${vorstandListe.length > 0 ? `
              <ul class="list-group list-group-flush">
                ${vorstandListe.map(m => `
                  <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                    <span class="fw-bold text-dark">${escapeHtml(m.FirstName)} ${escapeHtml(m.LastName)}</span>
                    <span class="text-muted small">${escapeHtml(m._kategorie)}</span>
                  </li>
                `).join('')}
              </ul>
            ` : '<div class="text-center text-muted py-4">Keine Funktionäre eingetragen</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}
