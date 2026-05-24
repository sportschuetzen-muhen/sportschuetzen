// js/mitglieder.js
// ============================================================
// STATE
// ============================================================
window._mglData = window._mglData || [];
window._mglFiltered = window._mglFiltered || [];
window._mglSort = window._mglSort || { field: 'LastName', dir: 'asc' };
window._mglActiveTab = window._mglActiveTab || 'liste';

// Lokale Cache-Variablen für Mitglieder-Details (Lizenzen, Funktionen, Historie)
window._mglLizenzenCache = window._mglLizenzenCache || {};
window._mglFunktionenCache = window._mglFunktionenCache || {};
window._mglHistoryCache = window._mglHistoryCache || {};

// ============================================================
// EINSTIEG
// ============================================================
async function loadMitgliederData(forceReload = false) {
  const container = document.getElementById('mitglieder-container');
  
  // Wenn Caches bereits geladen sind und kein forceReload erzwungen wird,
  // laden wir direkt und instant aus dem lokalen Speicher!
  if (!forceReload && _mglData && _mglData.length > 0) {
    console.log("⚡ loadMitgliederData: Lade aus lokalem Cache...");
    renderMitgliederView(_mglData);
    mglFilter();
    return;
  }

  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary"></div>
      <p class="mt-2 text-muted">Lade Mitglieder & Details…</p>
    </div>`;

  try {
    const [resAll, resLizz, resFn, resHist] = await Promise.all([
      apiFetch('mitglieder', 'action=getAll'),
      apiFetch('mitglieder', 'action=getLizenzen'),
      apiFetch('mitglieder', 'action=getFunktionen'),
      apiFetch('mitglieder', 'action=getHistorie')
    ]);

    // Prüfe Content-Type – wenn HTML kommt, ist das Script nicht korrekt deployed
    const rawText = await resAll.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      // HTML zurückgekommen (Google Login-Seite oder GAS-Fehlerseite)
      console.error('❌ Mitglieder API: HTML statt JSON erhalten:', rawText.slice(0, 300));
      container.innerHTML = `
        <div class="alert alert-warning">
          <h5>⚠️ Backend nicht erreichbar</h5>
          <p>Das Google Apps Script für <strong>Mitglieder</strong> gibt kein JSON zurück. 
          Mögliche Ursachen:</p>
          <ul>
            <li>Das Script ist noch nicht als <strong>Web App</strong> deployed</li>
            <li>Die URL im <code>worker.js</code> zeigt noch auf ein Platzhalter-Script</li>
            <li>Das Script hat keinen <code>doGet()</code> implementiert</li>
          </ul>
          <details class="mt-2">
            <summary class="small text-muted">Technische Details</summary>
            <pre class="small mt-2 bg-light p-2 rounded">${escapeHtml(rawText.slice(0, 500))}</pre>
          </details>
        </div>`;
      return;
    }

    if (!data.success) throw new Error(data.error || 'Unbekannter Fehler');

    // Lizenzen indizieren
    try {
      const lizzData = await resLizz.json();
      _mglLizenzenCache = {};
      if (lizzData.success && Array.isArray(lizzData.data)) {
        lizzData.data.forEach(l => {
          const pnKey = String(l.PersonNumber || '').trim();
          if (pnKey) {
            if (!_mglLizenzenCache[pnKey]) _mglLizenzenCache[pnKey] = [];
            _mglLizenzenCache[pnKey].push(l);
          }
        });
      }
    } catch (err) {
      console.error('❌ Fehler beim Parsen der Lizenzen im Cache:', err);
    }

    // Funktionen indizieren
    try {
      const fnData = await resFn.json();
      _mglFunktionenCache = {};
      if (fnData.success && Array.isArray(fnData.data)) {
        fnData.data.forEach(f => {
          const pnKey = String(f.PersonNumber || '').trim();
          if (pnKey) {
            if (!_mglFunktionenCache[pnKey]) _mglFunktionenCache[pnKey] = [];
            _mglFunktionenCache[pnKey].push(f);
          }
        });
      }
    } catch (err) {
      console.error('❌ Fehler beim Parsen der Funktionen im Cache:', err);
    }

    // Historie indizieren
    try {
      const histData = await resHist.json();
      _mglHistoryCache = {};
      if (histData.success && Array.isArray(histData.data)) {
        histData.data.forEach(h => {
          const pnKey = String(h.PersonNumber || '').trim();
          if (pnKey) {
            if (!_mglHistoryCache[pnKey]) _mglHistoryCache[pnKey] = [];
            _mglHistoryCache[pnKey].push(h);
          }
        });
      }
    } catch (err) {
      console.error('❌ Fehler beim Parsen der Historie im Cache:', err);
    }

    _mglData = Array.isArray(data.data) ? data.data : [];
    renderMitgliederView(_mglData);
    mglFilter();
  } catch (e) {
    console.error('❌ loadMitgliederData:', e);
    container.innerHTML = `<div class="alert alert-danger"><strong>Fehler:</strong> ${escapeHtml(e.message)}</div>`;
  }
}



// ============================================================
// RENDER MAIN
// ============================================================
function renderMitgliederView(data) {
  const canEdit = (window.currentRoles || []).some(r => ['admin', 'vorstand', 'schuetzenmeister'].includes(r));

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
                <th class="mgl-clickable-sort" onclick="mglSetSort('AddressNumber')">Nr. / Lizenz <span class="mgl-sort-ind">\${mglSortIndicator('AddressNumber')}</span></th>
                <th class="mgl-clickable-sort" onclick="mglSetSort('LastName')">Name <span class="mgl-sort-ind">\${mglSortIndicator('LastName')}</span></th>
                <th>E-Mail</th>
                <th>Telefon</th>
                <th class="mgl-clickable-sort" onclick="mglSetSort('_kategorie')">Kategorie <span class="mgl-sort-ind">\${mglSortIndicator('_kategorie')}</span></th>
                <th class="mgl-clickable-sort" onclick="mglSetSort('_aktiveLizenzenCount')">Lizenzen <span class="mgl-sort-ind">\${mglSortIndicator('_aktiveLizenzenCount')}</span></th>
                <th class="mgl-clickable-sort" onclick="mglSetSort('_aktiveFunktionenCount')">Funktionen <span class="mgl-sort-ind">\${mglSortIndicator('_aktiveFunktionenCount')}</span></th>
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

function mglRenderAnalyse(data) {
  const deceased = data.filter(m => m.Deceased == 1 || m.Deceased === true || m.Deceased === '1');
  const living = data.filter(m => !(m.Deceased == 1 || m.Deceased === true || m.Deceased === '1'));
  const active = living.filter(m => m.IsActive == 1 || m.IsActive === true || m.IsActive === '1');
  
  const total = living.length;
  const totalActive = active.length;
  const totalPassive = living.filter(m => m._istPassiv || m.IsPassive == 1 || m.IsPassive === true).length;
  const totalEhren = living.filter(m => m._istEhren || m.IsHonoraryMember == 1 || m.IsHonoraryMember === true).length;
  
  const femaleCount = living.filter(m => m.Gender === 'F' || m.Gender === 'W' || String(m.Gender).toLowerCase().startsWith('w')).length;
  const maleCount = living.filter(m => m.Gender === 'M' || String(m.Gender).toLowerCase().startsWith('m')).length;
  
  const femalePct = total > 0 ? Math.round((femaleCount / total) * 100) : 0;
  const malePct = total > 0 ? Math.round((maleCount / total) * 100) : 0;

  const currentYear = new Date().getFullYear();
  let junior = 0, elite = 0, senior = 0, veteran = 0, seniorveteran = 0;
  
  active.forEach(m => {
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

  const activeCount = active.length;
  const juniorPct = activeCount > 0 ? Math.round((junior / activeCount) * 100) : 0;
  const elitePct = activeCount > 0 ? Math.round((elite / activeCount) * 100) : 0;
  const seniorPct = activeCount > 0 ? Math.round((senior / activeCount) * 100) : 0;
  const veteranPct = activeCount > 0 ? Math.round((veteran / activeCount) * 100) : 0;
  const svPct = activeCount > 0 ? Math.round((seniorveteran / activeCount) * 100) : 0;

  let g50Count = 0, g10Count = 0, g300Count = 0;
  living.forEach(m => {
    const lizz = m._lizenzen || [];
    lizz.forEach(l => {
      const c = String(l.MembershipCategory || '').toLowerCase();
      if (c.includes('g50') || c.includes('50m')) g50Count++;
      else if (c.includes('g10') || c.includes('10m')) g10Count++;
      else if (c.includes('g300') || c.includes('300')) g300Count++;
    });
  });

  const ehrenListe = living
    .filter(m => m._istEhren)
    .sort((a, b) => String(a.HonoraryMemberSince || '').localeCompare(String(b.HonoraryMemberSince || '')));

  const vorstandListe = living.filter(m => Number(m._aktiveFunktionenCount || 0) > 0);

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
          <div class="mgl-stat-value text-success">${active.filter(m => Number(m._aktiveLizenzenCount || 0) > 0).length}</div>
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
          
          <h5 class="fw-bold mb-3 mt-4 text-dark"><i class="fas fa-award text-primary me-2"></i>Disziplinen & Lizenzen</h5>
          <div class="d-flex flex-column gap-3">
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>Gewehr 50m (KK)</span>
                <span>${g50Count} Lizenzen</span>
              </div>
              <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-success" style="width: ${total > 0 ? Math.round(g50Count/total*100) : 0}%"></div>
              </div>
            </div>
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>Luftgewehr 10m</span>
                <span>${g10Count} Lizenzen</span>
              </div>
              <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-primary" style="width: ${total > 0 ? Math.round(g10Count/total*100) : 0}%"></div>
              </div>
            </div>
            <div>
              <div class="d-flex justify-content-between mb-1 small fw-semibold">
                <span>Gewehr 300m (Fremd)</span>
                <span>${g300Count} Lizenzen</span>
              </div>
              <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-secondary" style="width: ${total > 0 ? Math.round(g300Count/total*100) : 0}%"></div>
              </div>
            </div>
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

// mglLoadTurniere und mglToggleTurnier wurden in Mitglieder-Details entfernt,
// da die Turnierteilnahmen vollumfänglich in der Beitrags-Schnellerfassung
// und dem Beitrags-Modal verwaltet werden.


// ============================================================
// STATS
// ============================================================
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


// ============================================================
// TABLE
// ============================================================
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


// ============================================================
// FILTER + SORT
// ============================================================
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


// ============================================================
// DETAIL MODAL
// ============================================================
function mglAssembleTimeline(m, liz, fn, his) {
  const timeline = [];
  
  if (m) {
    const entry = m.ClubEntryDate || m.FirstClubEntryDateSSV;
    if (entry) {
      timeline.push({ datum: entry, title: 'Vereinseintritt', typ: 'Eintritt', icon: '👤', color: '#2563eb' });
    }
    if ((m.IsHonoraryMember == 1 || m.IsHonoraryMember === true || m._istEhren) && m.HonoraryMemberSince) {
      timeline.push({ datum: m.HonoraryMemberSince, title: 'Ehrenmitglied ernannt', typ: 'Ehren', icon: '🏆', color: '#f59e0b' });
    }
    if (m.Vereinsaustritt) {
      timeline.push({ datum: m.Vereinsaustritt, title: 'Vereinsaustritt', typ: 'Austritt', icon: '🚪', color: '#6b7280' });
    }
  }

  if (Array.isArray(liz)) {
    liz.forEach(l => {
      if (l.EntryDate) {
        timeline.push({ datum: l.EntryDate, title: 'Lizenz erteilt', typ: 'Lizenz', meta: l.MembershipCategory, icon: '🎖', color: '#2563eb' });
      }
      if (l.ExitDate) {
        timeline.push({ datum: l.ExitDate, title: 'Lizenz beendet', typ: 'LizenzEnde', meta: l.MembershipCategory, icon: '📋', color: '#9ca3af' });
      }
    });
  }

  if (Array.isArray(fn)) {
    fn.forEach(f => {
      if (f.OfficialFunctionEntryDate) {
        timeline.push({ datum: f.OfficialFunctionEntryDate, title: 'Funktion übernommen', typ: 'Funktion', meta: f.OfficialFunctionCategory, icon: '💼', color: '#7c3aed' });
      }
      if (f.OfficialFunctionExitDate) {
        timeline.push({ datum: f.OfficialFunctionExitDate, title: 'Funktion abgegeben', typ: 'FunktionEnde', meta: f.OfficialFunctionCategory, icon: '📋', color: '#9ca3af' });
      }
    });
  }

  if (Array.isArray(his)) {
    his.forEach(h => {
      timeline.push({
        datum: h.datum || h.erfasstam || '',
        title: h.ereignistyp || h.ereignis_typ || 'Änderung',
        typ: 'Historie',
        meta: h.neuerwert || h.neuer_wert ? `${h.name || h.erfasst_von || ''}: ${h.neuerwert || h.neuer_wert}` : '',
        text: h.alterwert || h.alter_wert ? `Vorher: ${h.alterwert || h.alter_wert}` : '',
        icon: '📝',
        color: '#64748b'
      });
    });
  }

  // Sortierung: neueste zuerst
  timeline.sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
  return timeline;
}

function mglOpenDetail(pn) {
  const modal = new bootstrap.Modal(document.getElementById('mglModalDetail'));
  const body = document.getElementById('mglDetailBody');
  body.innerHTML = '';
  document.getElementById('mglDetailTitle').textContent = 'Lade Mitglied…';
  modal.show();

  try {
    const m = _mglData.find(x => String(x.PersonNumber) === String(pn));
    if (!m) throw new Error('Mitglied nicht in lokalen Daten gefunden: ' + pn);

    const liz = _mglLizenzenCache[pn] || [];
    const fn = _mglFunktionenCache[pn] || [];
    const his = _mglHistoryCache[pn] || [];
    const timelineData = mglAssembleTimeline(m, liz, fn, his);

    document.getElementById('mglDetailTitle').textContent = `${m.FirstName || ''} ${m.LastName || ''}`;

    const initials = `${(m.FirstName || '').charAt(0)}${(m.LastName || '').charAt(0)}`.trim() || '??';
    const mitgliedSeit = m._mitgliedSeit || m.EntryDate || m.HonoraryMemberSince || '';
    const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
    const badgeAktiv = (m._badgeAktiv || (m.IsActive == 1 || m.IsActive === true || m.IsActive === '1')) && !m._istPassiv && !isDeceased;
    const badgeLizenz = m._badgeLizenzText || `${Number(m._aktiveLizenzenCount || 0)} aktiv`;
    const badgeEhren = m._badgeEhren || m.IsHonoraryMember == 1 || m.IsHonoraryMember === true;

    document.getElementById('mglDetailTitle').textContent = `${m.FirstName || ''} ${m.LastName || ''} ${isDeceased ? '†' : ''}`;

    const stammdatenRows = [
      ['PersonNumber', m.PersonNumber],
      ['Anrede', m.Salutation],
      ['Vorname', m.FirstName],
      ['Nachname', m.LastName],
      ['Geburtsdatum', mglFmtDate(m.BirthDate)],
      ['Geschlecht', m.Gender],
      ['Nationalität', m.Nationality],
      ['Strasse', m.Street],
      ['PLZ / Ort', `${m.PostCode || ''} ${m.City || ''}`.trim()],
      ['Land', m.Country],
      ['Status', isDeceased ? '† Verstorben' : ''],
      ['E-Mail', m.PrimaryEmail],
      ['Weitere E-Mail', m.AdditionalEmail],
      ['Mobil (privat)', m.PrivateMobilePhone],
      ['Mobil (geschäftl.)', m.BusinessMobilePhone],
      ['Tel. privat', m.PrivateLandlinePhone],
      ['Tel. geschäftl.', m.BusinessLandlinePhone],
    ].filter(([,v]) => v && String(v).trim() !== '' && String(v).trim() !== 'undefined undefined')
     .map(([k, v]) => `
      <div class="row border-bottom py-1">
        <div class="col-5 text-muted small">${escapeHtml(k)}</div>
        <div class="col-7 small fw-semibold">${escapeHtml(String(v))}</div>
      </div>`).join('');

    const lizRows = liz.map(l => {
      const aktiv = (l.IsActive == 1 || l.IsActive === true || l.IsActive === '1') && !String(l.ExitDate || '').trim();
      const istMuhen = l.istMuhen || String(l.LicenseInvoicingClubNumber || '').trim() === '1.02.0.01.087';
      return `<tr>
        <td>${escapeHtml(l.MembershipCategory || '–')}</td>
        <td>${mglFmtDate(l.EntryDate)}</td>
        <td>${mglFmtDate(l.ExitDate)}</td>
        <td>${escapeHtml(l.LicenseType || '–')}</td>
        <td>${istMuhen ? '<span class="badge bg-success opacity-75">Muhen (bezahlt)</span>' : `<span class="badge bg-warning text-dark">Fremdzahler: ${escapeHtml(l.LicenseInvoicingClubName || '–')}</span>`}</td>
        <td><span class="badge ${aktiv ? 'bg-success' : 'bg-secondary'}">${aktiv ? 'aktiv' : 'inaktiv'}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="text-muted text-center">Keine Lizenzen</td></tr>';

    const fnRows = fn.map(f => {
      const aktiv = !String(f.OfficialFunctionExitDate || '').trim();
      const rabattKat = f.rabatt_kategorie || f.rabattkategorie;
      return `<tr>
        <td>${escapeHtml(f.OfficialFunctionCategory || '–')}</td>
        <td>${mglFmtDate(f.OfficialFunctionEntryDate)}</td>
        <td>${mglFmtDate(f.OfficialFunctionExitDate)}</td>
        <td>${rabattKat ? `<span class="badge bg-warning text-dark">${escapeHtml(rabattKat)}</span>` : '–'}</td>
        <td><span class="badge ${aktiv ? 'bg-success' : 'bg-secondary'}">${aktiv ? 'aktiv' : 'ehemalig'}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="text-muted text-center">Keine Funktionen</td></tr>';

    const timeline = timelineData.length
      ? timelineData.map(t => `
        <div class="mgl-timeline-item">
          <div class="mgl-timeline-dot" style="background:${escapeHtml(t.color || '#2563eb')}"></div>
          <div class="mgl-timeline-card">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
              <div>
                <div class="mgl-timeline-title">${escapeHtml(t.icon || '•')} ${escapeHtml(t.title || t.typ || 'Eintrag')}</div>
                ${t.text ? `<div class="small mt-1">${escapeHtml(t.text)}</div>` : ''}
                ${t.meta ? `<div class="mgl-timeline-meta mt-1">${escapeHtml(t.meta)}</div>` : ''}
              </div>
              <div class="mgl-timeline-date">${mglFmtDate(t.datum)}</div>
            </div>
          </div>
        </div>
      `).join('')
      : '<div class="mgl-empty">Keine Timeline-Einträge</div>';

    const canEditVerein = (window.currentRoles || []).some(r => ['admin','kassier','vorstand','schuetzenmeister'].includes(r));

    body.innerHTML = `
      <div class="p-3 p-md-4 bg-light">
        <div class="mgl-profile-head">
          <div class="d-flex flex-wrap gap-3 align-items-center">
            <div class="mgl-avatar">${initials}</div>
            <div class="flex-grow-1">
              <div class="mgl-profile-name">${m.FirstName || ''} ${m.LastName || ''}</div>
              <div class="mgl-profile-meta">
                Mitglied seit ${mitgliedSeit ? mglFmtDate(mitgliedSeit) : '–'} • Mitgliedsnummer ${m.PersonNumber || '–'}
              </div>
              <div class="mgl-badge-row">
                ${isDeceased ? `<span class="mgl-chip gray">† Verstorben</span>` : (badgeAktiv ? `<span class="mgl-chip green">Aktiv</span>` : `<span class="mgl-chip gray">Inaktiv</span>`)}
                <span class="mgl-chip blue">${badgeLizenz}</span>
                ${badgeEhren ? `<span class="mgl-chip gold">Ehrenmitglied</span>` : ''}
              </div>
            </div>
          </div>

          <div class="mgl-detail-stats mt-4">
            <div class="mgl-overview-card">
              <div class="mgl-overview-label">Mitgliedsjahre</div>
              <div class="mgl-overview-value">${Number(m._mitgliedsjahre || 0)}</div>
            </div>
            <div class="mgl-overview-card">
              <div class="mgl-overview-label">Aktive Lizenzen</div>
              <div class="mgl-overview-value">${Number(m._aktiveLizenzenCount || 0)}</div>
            </div>
            <div class="mgl-overview-card">
              <div class="mgl-overview-label">Vorstand Funktionen</div>
              <div class="mgl-overview-value">${Number(m._aktiveFunktionenCount || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="mgl-tab-wrap">
        <ul class="nav nav-tabs px-3 pt-2" id="mglDetailTabs">
          <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#mglTabTimeline">Timeline</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabStamm">Stammdaten</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabLiz">Lizenzen</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabFn">Funktionen</a></li>
          ${canEditVerein ? `<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabEdit">✏️ Bearbeiten</a></li>` : ''}
        </ul>

        <div class="tab-content p-3">
          <div class="tab-pane fade show active" id="mglTabTimeline">
            <div class="mgl-timeline mt-2">${timeline}</div>
          </div>

          <div class="tab-pane fade" id="mglTabStamm">
            <div class="row">
              <div class="col-md-6">
                <h6 class="fw-bold mb-2">Personalien <small class="text-muted fw-normal">(SSV – nur lesen)</small></h6>
                ${stammdatenRows || '<div class="mgl-empty">Keine Stammdaten</div>'}
              </div>
              <div class="col-md-6">
                <h6 class="fw-bold mb-2">Vereinsintern</h6>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Ehrenmitglied</div>
                  <div class="col-7 small">${badgeEhren ? '✅ Ja' : 'Nein'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Ehrenmitglied seit</div>
                  <div class="col-7 small">${mglFmtDate(m.HonoraryMemberSince)}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">IBAN</div>
                  <div class="col-7 small">${m.IBAN || '–'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Kontoinhaber</div>
                  <div class="col-7 small">${m.Kontoinhaber || '–'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Rechnungsversand</div>
                  <div class="col-7 small">${m.Rechnungsversand || '–'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Nie mahnen</div>
                  <div class="col-7 small">${m.Niemahnen ? '✅ Ja' : 'Nein'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Vereinsaustritt</div>
                  <div class="col-7 small">${mglFmtDate(m.Vereinsaustritt)}</div>
                </div>
                <div class="row py-1">
                  <div class="col-5 text-muted small">Bemerkung</div>
                  <div class="col-7 small">${m.Remark || '–'}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="tab-pane fade" id="mglTabLiz">
            <div class="table-responsive">
              <table class="table table-sm mgl-table">
                <thead>
                  <tr><th>Kategorie</th><th>Eintritt</th><th>Austritt</th><th>Typ</th><th>Zahlstelle (SSV)</th><th>Status</th></tr>
                </thead>
                <tbody>${lizRows}</tbody>
              </table>
            </div>
          </div>

          <div class="tab-pane fade" id="mglTabFn">
            <div class="table-responsive">
              <table class="table table-sm">
                <thead class="table-light">
                  <tr><th>Funktion</th><th>Eintritt</th><th>Austritt</th><th>Rabatt</th><th>Status</th></tr>
                </thead>
                <tbody>${fnRows}</tbody>
              </table>
            </div>
          </div>

          ${canEditVerein ? `
          <div class="tab-pane fade" id="mglTabEdit">
            <div class="row g-3 mt-1">
              <div class="col-md-6">
                <label class="form-label">IBAN</label>
                <input type="text" class="form-control" id="mglEditIBAN" value="${m.IBAN || ''}">
              </div>
              <div class="col-md-3">
                <label class="form-label">BIC</label>
                <input type="text" class="form-control" id="mglEditBIC" value="${m.BIC || ''}">
              </div>
              <div class="col-md-3">
                <label class="form-label">Kontoinhaber</label>
                <input type="text" class="form-control" id="mglEditKonto" value="${m.Kontoinhaber || ''}">
              </div>
              <div class="col-md-4">
                <label class="form-label">Rechnungsversand</label>
                <select class="form-select" id="mglEditRV">
                  <option ${m.Rechnungsversand === 'E-Mail' ? 'selected' : ''}>E-Mail</option>
                  <option ${m.Rechnungsversand === 'Post' ? 'selected' : ''}>Post</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Vereinsaustritt</label>
                <input type="date" class="form-control" id="mglEditAustritt"
                       value="${mglFmtDateIso(m.Vereinsaustritt)}">
              </div>
              <div class="col-md-4">
                <div class="form-check mt-4">
                  <input type="checkbox" class="form-check-input" id="mglEditMahnen"
                         ${m.Niemahnen ? 'checked' : ''}>
                  <label class="form-check-label">Nie mahnen</label>
                </div>
              </div>
              <div class="col-12">
                <button class="btn btn-primary" onclick="mglSaveVerein('${pn}')">
                  <i class="fas fa-save"></i> Speichern
                </button>
              </div>
            </div>
          </div>` : ''}
        </div>
      </div>`;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger m-3">Fehler: ${e.message}</div>`;
  }
}


// ============================================================
// SAVE
// ============================================================
async function mglSaveVerein(pn) {
  const btn = document.querySelector('#mglTabEdit .btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  const params = {
    action: 'saveVerein',
    pn,
    IBAN: document.getElementById('mglEditIBAN').value,
    BIC: document.getElementById('mglEditBIC').value,
    Kontoinhaber: document.getElementById('mglEditKonto').value,
    Rechnungsversand: document.getElementById('mglEditRV').value,
    Vereinsaustritt: document.getElementById('mglEditAustritt').value,
    Niemahnen: document.getElementById('mglEditMahnen').checked ? '1' : '0'
  };

  try {
    const res = await apiFetch('mitglieder', params, 'POST');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');

    const idx = _mglData.findIndex(m => String(m.PersonNumber) === String(pn));
    if (idx >= 0) {
      Object.assign(_mglData[idx], {
        IBAN: params.IBAN,
        BIC: params.BIC,
        Kontoinhaber: params.Kontoinhaber,
        Rechnungsversand: params.Rechnungsversand,
        Vereinsaustritt: params.Vereinsaustritt,
        Niemahnen: params.Niemahnen === '1'
      });
    }

    btn.innerHTML = '<i class="fas fa-check text-success"></i> Gespeichert!';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Speichern';
    }, 1800);
  } catch (e) {
    alert('Fehler: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Speichern';
  }
}


// ============================================================
// NEUES MITGLIED
// ============================================================
function mglNeuesMitglied() {
  ['nmVorname','nmNachname','nmEmail','nmStrasse','nmPlz','nmOrt','nmTel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('nmGeburt').value = '';
  new bootstrap.Modal(document.getElementById('mglModalNeu')).show();
}

async function mglSaveNeu() {
  const vorname = document.getElementById('nmVorname').value.trim();
  const nachname = document.getElementById('nmNachname').value.trim();
  const geburt = document.getElementById('nmGeburt').value;

  if (!vorname || !nachname || !geburt) {
    alert('Vorname, Nachname und Geburtsdatum sind Pflichtfelder.');
    return;
  }

  const btn = document.querySelector('#mglModalNeu .btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  const payload = {
    action: 'createIntern',
    FirstName: vorname,
    LastName: nachname,
    BirthDate: geburt,
    PrimaryEmail: document.getElementById('nmEmail').value,
    Street: document.getElementById('nmStrasse').value,
    PostCode: document.getElementById('nmPlz').value,
    City: document.getElementById('nmOrt').value,
    PrivateMobilePhone: document.getElementById('nmTel').value
  };

  try {
    const res = await apiFetch('mitglieder', payload, 'POST');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Erstellen fehlgeschlagen');

    bootstrap.Modal.getInstance(document.getElementById('mglModalNeu')).hide();
    alert(`✅ Mitglied erstellt (${data.PersonNumber})`);
    await loadMitgliederData();
  } catch (e) {
    alert('Fehler: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Erstellen';
  }
}

function mglOpenEdit(pn) {
  mglOpenDetail(pn);
  setTimeout(() => {
    document.querySelector('[href="#mglTabEdit"]')?.click();
  }, 700);
}


// ============================================================
// UTILS
// ============================================================
function mglFmtDate(val) {
  if (!val || val === '' || val === '–') return '–';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('de-CH');
}

function mglFmtDateIso(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d) ? '' : d.toISOString().split('T')[0];
}
