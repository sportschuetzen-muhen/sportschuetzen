// ============================================================
// vermietung.js – Cockpit für Vermietungsverwaltung
// ============================================================

let vermietungDaten = [];
let stornoFeedbackDaten = [];
let sortAsc = true;
let aktuellerFilter = 'alle';
let einnahmenJahr = new Date().getFullYear(); // ← für Jahresfilter
let reservationSearchQuery = '';
let feedbackSearchQuery = '';

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

// Lädt Reservierungen und Stornorückmeldungen gleichzeitig im Hintergrund
async function loadVermietungData(force = false) {
  const container = document.getElementById('vermietung-container');
  if (!container) return;

  if (!force && vermietungDaten.length > 0 && document.getElementById('reservations-tab')) {
    console.log("⚡ loadVermietungData: Lade aus lokalem Cache...");
    return;
  }

  container.innerHTML = `<div class="text-center py-5">
    <div class="spinner-border text-primary"></div>
    <p class="mt-2 text-muted">Lade Cockpit, Belegungen & Feedbacks...</p>
  </div>`;

  try {
    const [resReservations, resFeedback] = await Promise.all([
      apiFetch('vermietung', 'action=getAll'),
      apiFetch('vermietung', 'action=getFeedback')
    ]);

    console.log("📋 vermietung response status:", resReservations.status);
    const data = await resReservations.json();
    console.log("📋 vermietung response data:", data);
    
    if (!data.success) throw new Error(data.error);
    vermietungDaten = data.data;

    try {
      const feedbackData = await resFeedback.json();
      if (feedbackData.success) {
        stornoFeedbackDaten = feedbackData.data;
      } else {
        console.warn("Stornorückmeldungen konnten nicht geladen werden:", feedbackData.error);
      }
    } catch (errFeedback) {
      console.warn("Feedback JSON Parser Fehler:", errFeedback);
    }

    renderVermietungCockpit(vermietungDaten);
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden des Cockpits: ${e.message}</div>`;
  }
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

// Berechnet die Einnahmen (Status 03 oder 04) für ein bestimmtes Jahr
function berechneEinnahmen(daten, jahr) {
  return daten
    .filter(d => {
      if (!d.status.includes("03") && !d.status.includes("04")) return false;
      const p = (d.mietdatum || "").split(".");
      return p.length === 3 && p[2] == jahr;
    })
    .reduce((sum, d) => {
      return sum + parseFloat((d.mietbetrag || "0").replace(/[^\d.]/g, '') || 0);
    }, 0);
}

// Aktualisiert den Umsatzausweis im Dashboard
function updateEinnahmen(jahr) {
  einnahmenJahr = jahr;
  const einnahmen = berechneEinnahmen(vermietungDaten, jahr);
  document.getElementById('einnahmen-betrag').innerText = `CHF ${einnahmen.toFixed(0)}`;
}

// Generiert Tabellenzeilen für Reservationen mit modernem Hover-Effekt
function renderVermietungRows(daten) {
  if (!daten || daten.length === 0) {
    return '<tr><td colspan="5" class="text-center text-muted py-4">Keine Reservationen gefunden</td></tr>';
  }
  return daten.map(d => {
    const statusColor = getStatusColor(d.status);
    const statusLabel = getStatusLabel(d.status);
    return `
      <tr style="cursor:pointer; vertical-align: middle;" onclick="openVermietungModal(${d.row})">
        <td class="fw-bold">${escapeHtml(d.mietdatum || '–')}</td>
        <td>${escapeHtml((d.vorname || '') + ' ' + (d.nachname || ''))}</td>
        <td><small class="text-muted fw-semibold">${escapeHtml(d.vertragsnr || '')}</small></td>
        <td>
          <span class="badge px-2 py-1 rounded-pill" style="background:${statusColor}22; color:${statusColor}; border: 1px solid ${statusColor}44; font-size:0.75rem; font-weight:600;">
            ${escapeHtml(statusLabel)}
          </span>
        </td>
        <td class="text-end">
          <button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size:0.8rem; font-weight:bold;"
                  onclick="event.stopPropagation();openVermietungModal(${d.row})">›
          </button>
        </td>
      </tr>`;
  }).join('');
}

// Filtert Reservationen über Klick-Pill-Schaltflächen
function filterVermietungPill(filter) {
  aktuellerFilter = filter;
  
  // Alle Pills aktualisieren (Aktiv/Inaktiv Klasse setzen)
  const pills = document.querySelectorAll('#vermietung-filter-pills .filter-pill');
  pills.forEach(pill => pill.classList.remove('active'));
  
  const mapping = { alle: 0, offen: 1, gemahnt: 2, bezahlt: 3, storniert: 4 };
  const idx = mapping[filter];
  if (pills[idx]) pills[idx].classList.add('active');

  applyFiltersAndSearch();
}

// Sucht in Echtzeit innerhalb der Reservationen
function searchReservations(query) {
  reservationSearchQuery = query;
  applyFiltersAndSearch();
}

// Sucht und filtert gleichzeitig
function applyFiltersAndSearch() {
  const query = (reservationSearchQuery || '').toLowerCase().trim();
  let gefiltert = vermietungDaten;
  
  // 1. Status Filter anwenden
  if (aktuellerFilter === 'offen')     gefiltert = vermietungDaten.filter(d => d.status.includes("01"));
  else if (aktuellerFilter === 'gemahnt')   gefiltert = vermietungDaten.filter(d => d.status.includes("02"));
  else if (aktuellerFilter === 'bezahlt')   gefiltert = vermietungDaten.filter(d => d.status.includes("03") || d.status.includes("04"));
  else if (aktuellerFilter === 'storniert') gefiltert = vermietungDaten.filter(d => d.status.includes("05"));

  // 2. Suchtext Filter anwenden
  if (query) {
    gefiltert = gefiltert.filter(d => {
      const fullname = ((d.vorname || '') + ' ' + (d.nachname || '')).toLowerCase();
      return fullname.includes(query) ||
             (d.vertragsnr || '').toLowerCase().includes(query) ||
             (d.email || '').toLowerCase().includes(query) ||
             (d.mietdatum || '').toLowerCase().includes(query);
    });
  }

  document.getElementById('vermietung-tbody').innerHTML = renderVermietungRows(gefiltert);
}

// Suchfunktion für Stornorückmeldungen
function searchFeedback(query) {
  feedbackSearchQuery = query;
  renderFeedbackCards();
}

// Rendert die Stornorückmeldungen als schöne Cards
function renderFeedbackCards() {
  const container = document.getElementById('feedback-cards-container');
  if (!container) return;

  const query = (feedbackSearchQuery || '').toLowerCase().trim();
  const filtered = stornoFeedbackDaten.filter(f => {
    if (!query) return true;
    return (f.vertragsnr || '').toLowerCase().includes(query) ||
           (f.grund || '').toLowerCase().includes(query) ||
           (f.bemerkung || '').toLowerCase().includes(query) ||
           (f.zeitstempel || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-comment-slash fa-2x mb-2" style="opacity:0.3;"></i><br>Keine Stornorückmeldungen vorhanden</div>';
    return;
  }

  container.innerHTML = filtered.map(f => `
    <div class="card feedback-card shadow-sm mb-3 p-3 border-0">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="badge rounded-pill bg-danger-subtle text-danger border border-danger-subtle px-2 py-1" style="font-size: 0.72rem; font-weight:600;">Storno-Feedback</span>
        <small class="text-muted fw-semibold"><i class="far fa-calendar-alt me-1"></i>${escapeHtml(f.zeitstempel)}</small>
      </div>
      <h6 class="fw-bold text-dark mb-1">Vertrag: ${escapeHtml(f.vertragsnr)}</h6>
      <p class="mb-2" style="font-size:0.88rem;"><strong>Grund:</strong> <span class="text-secondary">${escapeHtml(f.grund)}</span></p>
      ${f.bemerkung ? `
        <div class="mt-2 p-2 bg-light border-start border-danger-subtle rounded-end" style="font-style: italic; font-size:0.85rem;">
          💬 "${escapeHtml(f.bemerkung)}"
        </div>
      ` : ''}
    </div>
  `).join('');
}

// Sortiert die Reservationen nach Datum auf- oder absteigend
function sortVermietung() {
  sortAsc = !sortAsc;
  const toDate = s => {
    const p = (s || "").split(".");
    return p.length === 3 ? new Date(p[2], p[1]-1, p[0]) : new Date(0);
  };

  let gefiltert = vermietungDaten;
  if (aktuellerFilter === 'offen')     gefiltert = vermietungDaten.filter(d => d.status.includes("01"));
  else if (aktuellerFilter === 'gemahnt')   gefiltert = vermietungDaten.filter(d => d.status.includes("02"));
  else if (aktuellerFilter === 'bezahlt')   gefiltert = vermietungDaten.filter(d => d.status.includes("03") || d.status.includes("04"));
  else if (aktuellerFilter === 'storniert') gefiltert = vermietungDaten.filter(d => d.status.includes("05"));

  const sorted = [...gefiltert].sort((a, b) => sortAsc
    ? toDate(a.mietdatum) - toDate(b.mietdatum)
    : toDate(b.mietdatum) - toDate(a.mietdatum));

  document.getElementById('vermietung-tbody').innerHTML = renderVermietungRows(sorted);
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

// Kopiert die Buchungsdetails als formatierten Text in die Zwischenablage
function copyReservationDetails(row) {
  const d = vermietungDaten.find(x => x.row === row);
  if (!d) return;

  const text = `🎯 RESERVATION DETAILS (Schützenstube Muhen)
---------------------------------------------
Vertragsnr:     ${d.vertragsnr || '–'}
Name:           ${d.vorname || ''} ${d.nachname || ''}
E-Mail:         ${d.email || '–'}
Telefon:        ${d.telefon || '–'}
Mietdatum:      ${d.mietdatum || '–'}
Festbeginn:     ${d.festbeginn || '–'}
Mietbetrag:     ${d.mietbetrag || '–'}
Status:         ${d.status || '–'}
---------------------------------------------`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 Details in die Zwischenablage kopiert!");
  }).catch(err => {
    console.error("Kopieren fehlgeschlagen:", err);
    alert("Kopieren fehlgeschlagen.");
  });
}

// Öffnet das Detailmodal mit Timeline und Statusbedingungen für die Aktionsknöpfe
function openVermietungModal(row) {
  const d = vermietungDaten.find(x => x.row === row);
  if (!d) return;

  const statusColor  = getStatusColor(d.status);
  const statusLabel  = getStatusLabel(d.status);
  const istStorniert = d.status.includes("05");
  const istBezahlt   = d.status.includes("03") || d.status.includes("04");

  document.getElementById('vermietung-modal-body').innerHTML = `
    <!-- Buchungs-Timeline -->
    ${getTimelineHtml(d.status)}
    
    <div class="row g-4 mt-2">
      <!-- Linke Spalte: Kontaktdaten -->
      <div class="col-md-6 border-end">
        <h6 class="fw-bold text-primary mb-3 border-bottom pb-1"><i class="fas fa-address-card me-2"></i>Kontaktdaten</h6>
        <table class="table table-sm table-borderless align-middle" style="font-size:0.88rem;">
          <tr><td class="text-muted fw-semibold" style="width: 120px;">Vertragsnr.</td><td><strong>${escapeHtml(d.vertragsnr)}</strong></td></tr>
          <tr><td class="text-muted fw-semibold">Mieter</td><td>${escapeHtml(d.vorname)} ${escapeHtml(d.nachname)}</td></tr>
          <tr><td class="text-muted fw-semibold">E-Mail</td>
              <td><a href="mailto:${escapeHtml(d.email)}" class="text-decoration-none"><i class="far fa-envelope me-1"></i>${escapeHtml(d.email)}</a></td></tr>
          <tr><td class="text-muted fw-semibold">Telefon</td>
              <td><a href="tel:${escapeHtml(d.telefon)}" class="text-decoration-none"><i class="fas fa-phone-alt me-1"></i>${escapeHtml(d.telefon)}</a></td></tr>
          <tr><td class="text-muted fw-semibold">Mietdatum</td><td><span class="badge bg-light text-dark border fw-semibold">${escapeHtml(d.mietdatum)}</span></td></tr>
          <tr><td class="text-muted fw-semibold">Festbeginn</td><td>${escapeHtml(d.festbeginn)}</td></tr>
          <tr><td class="text-muted fw-semibold">Mietbetrag</td><td><strong>${escapeHtml(d.mietbetrag)}</strong></td></tr>
        </table>
        
        <button class="btn btn-xs btn-outline-secondary mt-2" style="font-size:0.75rem; font-weight:600;" onclick="copyReservationDetails(${row})">
          <i class="far fa-copy me-1"></i>Details in Zwischenablage
        </button>
      </div>

      <!-- Rechte Spalte: Protokolle & Notizen -->
      <div class="col-md-6">
        <h6 class="fw-bold text-primary mb-3 border-bottom pb-1"><i class="fas fa-clipboard-check me-2"></i>Statusprotokoll</h6>
        <div class="p-2 rounded mb-3 text-center"
             style="background:${statusColor}18; border: 1px solid ${statusColor}33; color: ${statusColor}; font-weight:bold; font-size:0.9rem;">
          Status: ${escapeHtml(statusLabel)}
        </div>
        <table class="table table-sm table-borderless" style="font-size: 0.82rem;">
          <tr><td class="text-muted" style="width: 130px;">Vertrag versandt</td><td>${escapeHtml(d.datum_vertrag || '–')}</td></tr>
          <tr><td class="text-muted">Mahnung versandt</td><td>${escapeHtml(d.datum_mahnung || '–')}</td></tr>
          <tr><td class="text-muted">Schlüsselübergabe</td><td>${escapeHtml(d.datum_schluessel || '–')}</td></tr>
          <tr><td class="text-muted">Storniert am</td><td>${escapeHtml(d.datum_storno || '–')}</td></tr>
          <tr><td class="text-muted">Clubdesk Export</td><td><span class="badge bg-light text-secondary border">${escapeHtml(d.transfer || '–')}</span></td></tr>
        </table>
        ${d.kommentar ? `
          <div class="alert alert-info p-2 small border-0 mt-3 d-flex align-items-start gap-2" style="background:#e3f2fd; color:#0d47a1; border-radius:6px;">
            <i class="fas fa-info-circle mt-1" style="font-size: 1rem;"></i>
            <div><strong>Admin Notiz / Bank-Info:</strong><br>${escapeHtml(d.kommentar)}</div>
          </div>` : ''}
      </div>
    </div>`;

  // Bedingtes Rendern der Aktionsknöpfe passend zum Reservierungsstatus
  document.getElementById('vermietung-modal-footer').innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Schliessen</button>
    
    ${!istStorniert && !istBezahlt ? `
      <button class="btn btn-sm btn-warning fw-semibold"
              onclick="vermietungAktion('mahnung', ${row})"><i class="fas fa-exclamation-triangle me-1"></i>❗ Mahnung</button>` : ''}
    
    ${!istStorniert && !istBezahlt ? `
      <button class="btn btn-sm btn-success fw-semibold"
              onclick="vermietungAktion('bestaetigen', ${row})"><i class="fas fa-check-circle me-1"></i>Zahlung bestätigen</button>` : ''}
    
    <button class="btn btn-sm btn-primary fw-semibold"
            onclick="vermietungAktion('whatsapp', ${row})"><i class="fab fa-whatsapp me-1"></i>WhatsApp</button>
            
    ${!istStorniert ? `
      <button class="btn btn-sm btn-danger fw-semibold"
              onclick="vermietungAktion('stornieren', ${row})"><i class="fas fa-trash-alt me-1"></i>Stornieren</button>` : ''}
  `;

  new bootstrap.Modal(document.getElementById('vermietungModal')).show();
}

// Führt Vermietungsaktionen (Mahnung, Bestätigung, Storno, WhatsApp) aus
async function vermietungAktion(action, row) {
  const labels = {
    mahnung: "Mahnung senden?",
    bestaetigen: "Zahlung bestätigen?",
    stornieren: "⚠️ Wirklich stornieren?\n(Dadurch wird das Kalenderereignis gelöscht und dem Kunden ein Stornomail mit Feedbacklink gesendet!)",
    whatsapp: "WhatsApp senden?"
  };
  if (!confirm(labels[action] || "Ausführen?")) return;

  const modalFooter = document.getElementById('vermietung-modal-footer');
  const originalFooter = modalFooter.innerHTML;
  modalFooter.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Verarbeite...`;

  try {
    const res = await apiFetch('vermietung', `action=${action}&row=${row}`);
    const data = await res.json();
    
    if (data.success) {
      const modalElem = document.getElementById('vermietungModal');
      const modalInstance = bootstrap.Modal.getInstance(modalElem);
      if (modalInstance) modalInstance.hide();
      
      showToast("✅ " + (data.message || "Erfolgreich ausgeführt"));
      await loadVermietungData();
    } else {
      modalFooter.innerHTML = originalFooter;
      alert("❌ Fehler vom Server: " + data.error);
    }
  } catch(e) {
    modalFooter.innerHTML = originalFooter;
    alert("🌐 Verbindungsfehler: " + e.message);
  }
}

// Stösst den Export der Belegungsdaten an Clubdesk an
async function triggerClubdeskExport() {
  if (!confirm("Clubdesk Export jetzt senden?")) return;
  const res  = await apiFetch('vermietung', 'action=clubdesk');
  const data = await res.json();
  showToast(data.success ? "✅ Export gesendet" : "❌ Fehler: " + data.error);
}

// Liefert die Vereinsfarbe passend zum Statuscode zurück
function getStatusColor(status) {
  if (!status) return "#6c757d";
  if (status.includes("00")) return "#c0392b"; // Dunkelrot für Konflikt
  if (status.includes("01")) return "#ffc107";
  if (status.includes("02")) return "#fd7e14";
  if (status.includes("03")) return "#28a745";
  if (status.includes("04")) return "#0f3a5d";
  if (status.includes("05")) return "#dc3545";
  return "#6c757d";
}

// Wandelt den internen Statuscode in einen klaren Begriff um
function getStatusLabel(status) {
  if (!status) return "Unbekannt";
  if (status.includes("00")) return "Konflikt";
  if (status.includes("01")) return "Offen";
  if (status.includes("02")) return "Gemahnt";
  if (status.includes("03")) return "Bezahlt";
  if (status.includes("04")) return "Schlüssel versandt";
  if (status.includes("05")) return "Storniert";
  return status;
}

// Zeigt Toasts als modern gestyltes Info-Fenster unten rechts an
function showToast(msg) {
    const oldToast = document.querySelector('.custom-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerHTML = `<i class="fas fa-check-circle me-2"></i> ${msg}`;
    
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}