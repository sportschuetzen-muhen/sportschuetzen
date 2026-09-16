// === SUB-MODUL: VERMIETUNG - UI ===

// Dynamische CSS-Styles für Premium-Aesthetics
function ensureVermietungStylesOnce() {
  if (document.getElementById('vermietung-inline-style')) return;
  const s = document.createElement('style');
  s.id = 'vermietung-inline-style';
  s.textContent = `
    #vermietung-container {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    }
    .vermietung-stat-card {
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(0,0,0,0.06) !important;
    }
    .vermietung-stat-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 16px rgba(15, 58, 93, 0.08) !important;
    }
    .filter-pill {
      border: 1px solid #dee2e6;
      background: white;
      border-radius: 20px;
      padding: 5px 14px;
      font-size: 0.82rem;
      font-weight: 600;
      color: #495057;
      transition: all 0.2s ease;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    }
    .filter-pill:hover {
      background: #f1f3f5;
      border-color: #ced4da;
    }
    .filter-pill.active {
      background: #0f3a5d;
      color: white;
      border-color: #0f3a5d;
    }
    .filter-pill .badge {
      font-size: 0.72rem;
      background: rgba(0,0,0,0.08);
      color: inherit;
    }
    .filter-pill.active .badge {
      background: rgba(255,255,255,0.22);
      color: white;
    }
    .bg-orange {
      background-color: #fd7e14 !important;
      color: white;
    }
    .feedback-card {
      border-left: 4px solid #dc3545 !important;
      border-radius: 8px;
      transition: all 0.2s ease;
      background: white;
      border: 1px solid rgba(0,0,0,0.06);
    }
    .feedback-card:hover {
      transform: translateX(3px);
      box-shadow: 0 5px 12px rgba(0,0,0,0.05) !important;
    }
    .timeline-steps {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      margin: 25px 0 35px;
    }
    .timeline-steps::after {
      content: '';
      position: absolute;
      height: 3px;
      background: #e9ecef;
      top: 18px;
      left: 10%;
      right: 10%;
      z-index: 1;
    }
    .timeline-step {
      text-align: center;
      position: relative;
      z-index: 2;
      flex: 1;
    }
    .timeline-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e9ecef;
      color: #6c757d;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 8px;
      font-size: 0.9rem;
      font-weight: bold;
      transition: all 0.3s ease;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.08);
    }
    .timeline-step.completed .timeline-circle {
      background: #28a745;
      color: white;
    }
    .timeline-step.active .timeline-circle {
      background: #0f3a5d;
      color: white;
      animation: pulseGlow 2s infinite;
    }
    .timeline-step.storniert .timeline-circle {
      background: #dc3545;
      color: white;
    }
    .timeline-title {
      font-size: 0.72rem;
      font-weight: 600;
      color: #6c757d;
    }
    .timeline-step.completed .timeline-title {
      color: #28a745;
    }
    .timeline-step.active .timeline-title {
      color: #0f3a5d;
    }
    .timeline-step.storniert .timeline-title {
      color: #dc3545;
    }
    @keyframes pulseGlow {
      0% { box-shadow: 0 0 0 0 rgba(15, 58, 93, 0.4); }
      70% { box-shadow: 0 0 0 8px rgba(15, 58, 93, 0); }
      100% { box-shadow: 0 0 0 0 rgba(15, 58, 93, 0); }
    }
  `;
  document.head.appendChild(s);
}

// Baut das Haupt-Cockpit (Kennzahlen, Kalender und Registerkarten) auf
function renderVermietungCockpit(daten) {
  ensureVermietungStylesOnce();

  const stats = {
    offen:     daten.filter(d => d.status.includes("01")).length,
    gemahnt:   daten.filter(d => d.status.includes("02")).length,
    bezahlt:   daten.filter(d => d.status.includes("03") || d.status.includes("04")).length,
    storniert: daten.filter(d => d.status.includes("05")).length,
  };

  // Nächste Vermietung bestimmen
  const heute  = new Date();
  const aktive = daten
    .filter(d => !d.status.includes("05") && !d.status.includes("00"))
    .filter(d => {
      const p = (d.mietdatum || "").split(".");
      return p.length === 3 && new Date(p[2], p[1]-1, p[0]) >= heute;
    })
    .sort((a, b) => {
      const pa = a.mietdatum.split("."), pb = b.mietdatum.split(".");
      return new Date(pa[2],pa[1]-1,pa[0]) - new Date(pb[2],pb[1]-1,pb[0]);
    });
  const naechste = aktive[0];

  // Einnahmen für das gefilterte Jahr berechnen
  const einnahmen = berechneEinnahmen(daten, einnahmenJahr);

  // Verfügbare Jahre für Auswahl ermitteln
  const jahre = [...new Set(daten.map(d => {
    const p = (d.mietdatum || "").split(".");
    return p.length === 3 ? p[2] : null;
  }).filter(Boolean))].sort().reverse();

  // Zähler für Filter-Badges
  const countAll = daten.length;
  const countOffen = stats.offen;
  const countGemahnt = stats.gemahnt;
  const countBezahlt = stats.bezahlt;
  const countStorniert = stats.storniert;

  document.getElementById('vermietung-container').innerHTML = `
    <!-- STATISTIK-KACHELN -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-2">
        <div class="card vermietung-stat-card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #ffc107 !important;">
          <div style="font-size:1.8rem;font-weight:bold;color:#ffc107">
            <i class="fas fa-clock me-2" style="font-size: 1.3rem; opacity: 0.85;"></i>${stats.offen}
          </div>
          <div class="small text-muted fw-bold mt-1">🟡 Offen</div>
        </div>
      </div>
      <div class="col-6 col-md-2">
        <div class="card vermietung-stat-card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #fd7e14 !important;">
          <div style="font-size:1.8rem;font-weight:bold;color:#fd7e14">
            <i class="fas fa-exclamation-circle me-2" style="font-size: 1.3rem; opacity: 0.85;"></i>${stats.gemahnt}
          </div>
          <div class="small text-muted fw-bold mt-1">🟠 Gemahnt</div>
        </div>
      </div>
      <div class="col-6 col-md-2">
        <div class="card vermietung-stat-card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #28a745 !important;">
          <div style="font-size:1.8rem;font-weight:bold;color:#28a745">
            <i class="fas fa-check-double me-2" style="font-size: 1.3rem; opacity: 0.85;"></i>${stats.bezahlt}
          </div>
          <div class="small text-muted fw-bold mt-1">🟢 Bezahlt</div>
        </div>
      </div>
      <div class="col-6 col-md-2">
        <div class="card vermietung-stat-card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #dc3545 !important;">
          <div style="font-size:1.8rem;font-weight:bold;color:#dc3545">
            <i class="fas fa-times-circle me-2" style="font-size: 1.3rem; opacity: 0.85;"></i>${stats.storniert}
          </div>
          <div class="small text-muted fw-bold mt-1">⚫ Storniert</div>
        </div>
      </div>

      <!-- EINNAHMEN mit Jahresauswahl -->
      <div class="col-6 col-md-2">
        <div class="card vermietung-stat-card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #0f3a5d !important;">
          <div style="font-size:1.1rem;font-weight:bold;color:#0f3a5d" id="einnahmen-betrag">
            CHF ${einnahmen.toFixed(0)}
          </div>
          <div class="small text-muted fw-bold mb-1">💰 Einnahmen</div>
          <select class="form-select form-select-sm border-0 bg-light" style="font-size: 0.8rem; font-weight: 600;" onchange="updateEinnahmen(this.value)">
            ${jahre.map(j => `<option value="${j}" ${j == einnahmenJahr ? 'selected' : ''}>${j}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="col-6 col-md-2">
        <div class="card vermietung-stat-card border-0 shadow-sm text-center p-3 h-100"
             style="border-left:4px solid #6f42c1 !important; cursor:pointer"
             onclick="triggerClubdeskExport()">
          <div style="font-size:1.6rem;color:#6f42c1;"><i class="fas fa-file-csv"></i></div>
          <div class="small text-muted fw-bold mt-1">Clubdesk Export</div>
        </div>
      </div>
    </div>

    <!-- NÄCHSTE VERMIETUNG -->
    ${naechste ? `
    <div class="alert mb-4 shadow-sm border-0 d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:#eef2ff;border-left:4px solid #0f3a5d !important;border-radius:8px;">
      <div>
        <i class="fas fa-calendar-check text-primary me-2" style="font-size: 1.1rem;"></i>
        <strong>Nächste Vermietung:</strong>
        ${escapeHtml(naechste.mietdatum)} – ${escapeHtml(naechste.vorname)} ${escapeHtml(naechste.nachname)}
        <span class="badge ms-2" style="background:#0f3a5d">${escapeHtml(naechste.vertragsnr)}</span>
      </div>
      <button class="btn btn-sm btn-outline-primary" style="font-weight:600; font-size:0.8rem;"
              onclick="openVermietungModal(${naechste.row})"><i class="fas fa-external-link-alt me-1"></i>Details</button>
    </div>`
    : '<div class="alert alert-success mb-4 border-0 shadow-sm"><i class="fas fa-info-circle me-2"></i>Keine bevorstehenden Vermietungen</div>'}

    <!-- KALENDER + TABELLE -->
    <div class="row g-4">
      <div class="col-12 col-lg-5">
        <div class="card border-0 shadow-sm p-3">
          <h5 class="mb-3 fw-bold text-dark"><i class="fas fa-calendar-alt text-primary me-2"></i>Belegungskalender</h5>
          <iframe
            src="https://calendar.google.com/calendar/embed?src=c3BvcnRzY2h1ZXR6ZW4ubXVoZW5AZ21haWwuY29t&ctz=Europe%2FZurich&mode=MONTH&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&wkst=2&bgcolor=%23ffffff&color=%23009688"
            style="border:none;border-radius:8px;width:100%;height:380px;"
            frameborder="0" scrolling="no">
          </iframe>
        </div>
      </div>

      <!-- RECHTE SEITE: REGISTERKARTEN (RESERVATIONEN & FEEDBACK) -->
      <div class="col-12 col-lg-7">
        <div class="card border-0 shadow-sm p-3">
          <!-- REGISTER-TABS -->
          <ul class="nav nav-pills mb-3 border-bottom pb-2" id="vermietung-cockpit-tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active fw-bold btn-sm me-2" id="reservations-tab" data-bs-toggle="pill" data-bs-target="#tab-reservations" type="button" role="tab" aria-controls="tab-reservations" aria-selected="true">
                <i class="fas fa-clipboard-list me-1"></i> Reservationen
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link fw-bold btn-sm text-secondary" id="feedback-tab" data-bs-toggle="pill" data-bs-target="#tab-feedback" type="button" role="tab" aria-controls="tab-feedback" aria-selected="false" onclick="renderFeedbackCards()">
                <i class="fas fa-comment-slash me-1"></i> Stornorückmeldungen
              </button>
            </li>
          </ul>

          <div class="tab-content" id="vermietung-cockpit-tabs-content">
            <!-- TAB 1: RESERVATIONEN -->
            <div class="tab-pane fade show active" id="tab-reservations" role="tabpanel" aria-labelledby="reservations-tab">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div class="position-relative" style="width: 230px;">
                  <input type="text" class="form-control form-control-sm ps-4" id="res-search-input" placeholder="Suche Name, E-Mail, Datum..." oninput="searchReservations(this.value)">
                  <i class="fas fa-search position-absolute text-muted" style="left: 10px; top: 9px; font-size: 0.8rem;"></i>
                </div>
                <div class="d-flex gap-2">
                  <button class="btn btn-sm btn-outline-secondary py-1" onclick="loadVermietungData(true)">🔄 Aktualisieren</button>
                </div>
              </div>

              <!-- FILTER PILLS -->
              <div class="d-flex flex-wrap gap-2 mb-3" id="vermietung-filter-pills">
                <div class="filter-pill ${aktuellerFilter === 'alle' ? 'active' : ''}" onclick="filterVermietungPill('alle')">
                  Alle <span class="badge rounded-pill">${countAll}</span>
                </div>
                <div class="filter-pill ${aktuellerFilter === 'offen' ? 'active' : ''}" onclick="filterVermietungPill('offen')">
                  Offen <span class="badge rounded-pill bg-warning text-dark">${countOffen}</span>
                </div>
                <div class="filter-pill ${aktuellerFilter === 'gemahnt' ? 'active' : ''}" onclick="filterVermietungPill('gemahnt')">
                  Gemahnt <span class="badge rounded-pill bg-orange">${countGemahnt}</span>
                </div>
                <div class="filter-pill ${aktuellerFilter === 'bezahlt' ? 'active' : ''}" onclick="filterVermietungPill('bezahlt')">
                  Bezahlt <span class="badge rounded-pill bg-success">${countBezahlt}</span>
                </div>
                <div class="filter-pill ${aktuellerFilter === 'storniert' ? 'active' : ''}" onclick="filterVermietungPill('storniert')">
                  Storniert <span class="badge rounded-pill bg-danger">${countStorniert}</span>
                </div>
              </div>

              <div style="overflow-x:auto;max-height:350px;overflow-y:auto;" class="border rounded shadow-sm bg-white">
                <table class="table table-hover mb-0" style="font-size: 0.88rem;">
                  <thead class="table-light" style="position:sticky;top:0;background:#f8f9fa;z-index:1;border-bottom: 2px solid #dee2e6;">
                    <tr>
                      <th style="cursor:pointer" onclick="sortVermietung()">Datum <i class="fas fa-sort text-muted ms-1"></i></th>
                      <th>Name</th>
                      <th>Vertrag</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="vermietung-tbody">
                    ${renderVermietungRows(daten)}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 2: STORNORÜCKMELDUNGEN -->
            <div class="tab-pane fade" id="tab-feedback" role="tabpanel" aria-labelledby="feedback-tab">
              <div class="mb-3">
                <div class="position-relative" style="width: 250px;">
                  <input type="text" class="form-control form-control-sm ps-4" id="fb-search-input" placeholder="Feedback filtern (Name, Grund...)" oninput="searchFeedback(this.value)">
                  <i class="fas fa-search position-absolute text-muted" style="left: 10px; top: 9px; font-size: 0.8rem;"></i>
                </div>
              </div>

              <div id="feedback-cards-container" style="max-height: 420px; overflow-y: auto; padding-right: 5px;">
                <!-- Dynamisch durch renderFeedbackCards gerendert -->
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- DETAILS MODAL -->
    <div class="modal fade" id="vermietungModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header border-0" style="background:#0f3a5d;color:white;border-radius:8px 8px 0 0;">
            <h5 class="modal-title fw-bold"><i class="fas fa-file-signature me-2"></i>Reservation Details</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4" id="vermietung-modal-body"></div>
          <div class="modal-footer border-0 bg-light" id="vermietung-modal-footer"></div>
        </div>
      </div>
    </div>
  `;
}

// Generiert die HTML-Visualisierung der Reservierungs-Zeitleiste (Timeline)
function getTimelineHtml(status) {
  const isStorniert = status.includes("05");
  const isKonflikt  = status.includes("00");
  
  if (isKonflikt) {
    return `
      <div class="timeline-steps">
        <div class="timeline-step storniert">
          <div class="timeline-circle"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="timeline-title">Konflikt</div>
        </div>
      </div>`;
  }
  
  if (isStorniert) {
    return `
      <div class="timeline-steps">
        <div class="timeline-step completed">
          <div class="timeline-circle">1</div>
          <div class="timeline-title">Vertrag</div>
        </div>
        <div class="timeline-step storniert">
          <div class="timeline-circle">✕</div>
          <div class="timeline-title">Storniert</div>
        </div>
      </div>`;
  }

  const step1Class = status.includes("01") || status.includes("02") || status.includes("03") || status.includes("04") ? 'completed' : '';
  const step2Class = status.includes("02") ? 'storniert' : (status.includes("03") || status.includes("04") ? 'completed' : 'active');
  const step3Class = status.includes("03") || status.includes("04") ? 'completed' : '';
  const step4Class = status.includes("04") ? 'completed' : '';

  const step2Icon = status.includes("02") ? '<i class="fas fa-exclamation"></i>' : '2';
  const step2Title = status.includes("02") ? 'Gemahnt' : 'Zahlung';
  const step3Icon = status.includes("03") || status.includes("04") ? '<i class="fas fa-check"></i>' : '3';
  const step4Icon = status.includes("04") ? '<i class="fas fa-key"></i>' : '4';

  return `
    <div class="timeline-steps">
      <div class="timeline-step ${step1Class}">
        <div class="timeline-circle">1</div>
        <div class="timeline-title">Vertrag</div>
      </div>
      <div class="timeline-step ${step2Class}">
        <div class="timeline-circle">${step2Icon}</div>
        <div class="timeline-title">${step2Title}</div>
      </div>
      <div class="timeline-step ${step3Class}">
        <div class="timeline-circle">${step3Icon}</div>
        <div class="timeline-title">Bezahlt</div>
      </div>
      <div class="timeline-step ${step4Class}">
        <div class="timeline-circle">${step4Icon}</div>
        <div class="timeline-title">Schlüssel</div>
      </div>
    </div>`;
}
