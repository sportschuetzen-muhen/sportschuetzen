// ============================================================
// vermietung.js – Cockpit für Vermietungsverwaltung
// ============================================================

let vermietungDaten = [];
let sortAsc = true;
let aktuellerFilter = 'alle';
let einnahmenJahr = new Date().getFullYear(); // ← für Jahresfilter

async function loadVermietungData() {
  const container = document.getElementById('vermietung-container');
  container.innerHTML = `<div class="text-center py-5">
    <div class="spinner-border text-primary"></div>
    <p class="mt-2 text-muted">Lade Reservationen...</p>
  </div>`;

  try {
    const res  = await apiFetch('vermietung', 'action=getAll');
    console.log("📋 vermietung response status:", res.status);
    const data = await res.json();
    console.log("📋 vermietung response data:", data);
    if (!data.success) throw new Error(data.error);
    vermietungDaten = data.data;
    renderVermietungCockpit(vermietungDaten);
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler: ${e.message}</div>`;
  }
}

function renderVermietungCockpit(daten) {
  const stats = {
    offen:     daten.filter(d => d.status.includes("01")).length,
    gemahnt:   daten.filter(d => d.status.includes("02")).length,
    bezahlt:   daten.filter(d => d.status.includes("03") || d.status.includes("04")).length,
    storniert: daten.filter(d => d.status.includes("05")).length,
  };

  // Nächste Vermietung
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

  // Einnahmen – gefiltertes Jahr
  const einnahmen = berechneEinnahmen(daten, einnahmenJahr);

  // Verfügbare Jahre für Auswahl
  const jahre = [...new Set(daten.map(d => {
    const p = (d.mietdatum || "").split(".");
    return p.length === 3 ? p[2] : null;
  }).filter(Boolean))].sort().reverse();

  document.getElementById('vermietung-container').innerHTML = `

    <!-- STATISTIK-KACHELN -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-2">
        <div class="card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #ffc107 !important;">
          <div style="font-size:2rem;font-weight:bold;color:#ffc107">${stats.offen}</div>
          <div class="small text-muted">🟡 Offen</div>
        </div>
      </div>
      <div class="col-6 col-md-2">
        <div class="card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #fd7e14 !important;">
          <div style="font-size:2rem;font-weight:bold;color:#fd7e14">${stats.gemahnt}</div>
          <div class="small text-muted">🟠 Gemahnt</div>
        </div>
      </div>
      <div class="col-6 col-md-2">
        <div class="card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #28a745 !important;">
          <div style="font-size:2rem;font-weight:bold;color:#28a745">${stats.bezahlt}</div>
          <div class="small text-muted">🟢 Bezahlt</div>
        </div>
      </div>
      <div class="col-6 col-md-2">
        <div class="card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #dc3545 !important;">
          <div style="font-size:2rem;font-weight:bold;color:#dc3545">${stats.storniert}</div>
          <div class="small text-muted">⚫ Storniert</div>
        </div>
      </div>

      <!-- EINNAHMEN mit Jahresauswahl -->
      <div class="col-6 col-md-2">
        <div class="card border-0 shadow-sm text-center p-3 h-100" style="border-left:4px solid #0f3a5d !important;">
          <div style="font-size:1.2rem;font-weight:bold;color:#0f3a5d" id="einnahmen-betrag">
            CHF ${einnahmen.toFixed(0)}
          </div>
          <div class="small text-muted mb-1">💰 Einnahmen</div>
          <select class="form-select form-select-sm" onchange="updateEinnahmen(this.value)">
            ${jahre.map(j => `<option value="${j}" ${j == einnahmenJahr ? 'selected' : ''}>${j}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="col-6 col-md-2">
        <div class="card border-0 shadow-sm text-center p-3 h-100"
             style="border-left:4px solid #6f42c1 !important; cursor:pointer"
             onclick="triggerClubdeskExport()">
          <div style="font-size:1.5rem;">📤</div>
          <div class="small text-muted">Clubdesk Export</div>
        </div>
      </div>
    </div>

    <!-- NÄCHSTE VERMIETUNG -->
    ${naechste ? `
    <div class="alert mb-4" style="background:#eef2ff;border-left:4px solid #0f3a5d;border-radius:8px;">
      <strong>📅 Nächste Vermietung:</strong>
      ${escapeHtml(naechste.mietdatum)} – ${escapeHtml(naechste.vorname)} ${escapeHtml(naechste.nachname)}
      <span class="badge ms-2" style="background:#0f3a5d">${escapeHtml(naechste.vertragsnr)}</span>
      <button class="btn btn-sm btn-outline-primary ms-3"
              onclick="openVermietungModal(${naechste.row})">Details</button>
    </div>`
    : '<div class="alert alert-success mb-4">✅ Keine bevorstehenden Vermietungen</div>'}

    <!-- KALENDER + TABELLE -->
    <div class="row g-4">
      <div class="col-12 col-lg-5">
        <div class="card border-0 shadow-sm p-3">
          <h5 class="mb-3">📅 Belegungskalender</h5>
          <iframe
            src="https://calendar.google.com/calendar/embed?src=c3BvcnRzY2h1ZXR6ZW4ubXVoZW5AZ21haWwuY29t&ctz=Europe%2FZurich&mode=MONTH&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&wkst=2&bgcolor=%23ffffff&color=%23009688"
            style="border:none;border-radius:8px;width:100%;height:380px;"
            frameborder="0" scrolling="no">
          </iframe>
        </div>
      </div>

      <div class="col-12 col-lg-7">
        <div class="card border-0 shadow-sm p-3">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">📋 Alle Reservationen</h5>
            <div class="d-flex gap-2">
              <select class="form-select form-select-sm" style="width:160px"
                      onchange="filterVermietung(this.value)">
                <option value="alle">Alle</option>
                <option value="offen">Offen</option>
                <option value="gemahnt">Gemahnt</option>
                <option value="bezahlt">Bezahlt</option>
                <option value="storniert">Storniert</option>
              </select>
              <button class="btn btn-sm btn-outline-secondary"
                      onclick="loadVermietungData()">🔄</button>
            </div>
          </div>
          <div style="overflow-x:auto;max-height:350px;overflow-y:auto;">
            <table class="table table-sm table-hover mb-0">
              <thead style="position:sticky;top:0;background:white;z-index:1;">
                <tr>
                  <th style="cursor:pointer" onclick="sortVermietung()">Datum ↕</th>
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
      </div>
    </div>

    <!-- MODAL -->
    <div class="modal fade" id="vermietungModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 shadow">
          <div class="modal-header" style="background:#0f3a5d;color:white;">
            <h5 class="modal-title">📄 Reservation Details</h5>
            <button type="button" class="btn-close btn-close-white"
                    data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="vermietung-modal-body"></div>
          <div class="modal-footer" id="vermietung-modal-footer"></div>
        </div>
      </div>
    </div>
  `;
}

// Einnahmen-Berechnung mit Jahresfilter
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

function updateEinnahmen(jahr) {
  einnahmenJahr = jahr;
  const einnahmen = berechneEinnahmen(vermietungDaten, jahr);
  document.getElementById('einnahmen-betrag').innerText = `CHF ${einnahmen.toFixed(0)}`;
}

function renderVermietungRows(daten) {
  if (!daten || daten.length === 0) {
    return '<tr><td colspan="5" class="text-center text-muted py-3">Keine Einträge</td></tr>';
  }
  return daten.map(d => {
    const statusColor = getStatusColor(d.status);
    const statusLabel = getStatusLabel(d.status);
    return `
      <tr style="cursor:pointer" onclick="openVermietungModal(${d.row})">
        <td>${escapeHtml(d.mietdatum || '–')}</td>
        <td>${escapeHtml((d.vorname || '') + ' ' + (d.nachname || ''))}</td>
        <td><small class="text-muted">${escapeHtml(d.vertragsnr || '')}</small></td>
        <td><span class="badge" style="background:${statusColor};font-size:0.7rem;">
          ${escapeHtml(statusLabel)}
        </span></td>
        <td>
          <button class="btn btn-outline-secondary btn-sm py-0 px-1"
                  onclick="event.stopPropagation();openVermietungModal(${d.row})">›
          </button>
        </td>
      </tr>`;
  }).join('');
}

function filterVermietung(filter) {
  aktuellerFilter = filter;
  let gefiltert = vermietungDaten;
  if (filter === 'offen')     gefiltert = vermietungDaten.filter(d => d.status.includes("01"));
  if (filter === 'gemahnt')   gefiltert = vermietungDaten.filter(d => d.status.includes("02"));
  if (filter === 'bezahlt')   gefiltert = vermietungDaten.filter(d => d.status.includes("03") || d.status.includes("04"));
  if (filter === 'storniert') gefiltert = vermietungDaten.filter(d => d.status.includes("05"));
  document.getElementById('vermietung-tbody').innerHTML = renderVermietungRows(gefiltert);
}

function sortVermietung() {
  sortAsc = !sortAsc;
  const toDate = s => {
    const p = (s || "").split(".");
    return p.length === 3 ? new Date(p[2], p[1]-1, p[0]) : new Date(0);
  };

  // Aktuellen Filter anwenden
  let gefiltert = vermietungDaten;
  if (aktuellerFilter === 'offen')     gefiltert = vermietungDaten.filter(d => d.status.includes("01"));
  if (aktuellerFilter === 'gemahnt')   gefiltert = vermietungDaten.filter(d => d.status.includes("02"));
  if (aktuellerFilter === 'bezahlt')   gefiltert = vermietungDaten.filter(d => d.status.includes("03") || d.status.includes("04"));
  if (aktuellerFilter === 'storniert') gefiltert = vermietungDaten.filter(d => d.status.includes("05"));

  const sorted = [...gefiltert].sort((a, b) => sortAsc
    ? toDate(a.mietdatum) - toDate(b.mietdatum)
    : toDate(b.mietdatum) - toDate(a.mietdatum));

  document.getElementById('vermietung-tbody').innerHTML = renderVermietungRows(sorted);
}

function openVermietungModal(row) {
  const d = vermietungDaten.find(x => x.row === row);
  if (!d) return;

  const statusColor  = getStatusColor(d.status);
  const istStorniert = d.status.includes("05");
  const istBezahlt   = d.status.includes("03") || d.status.includes("04");

  document.getElementById('vermietung-modal-body').innerHTML = `
    <div class="row g-3">
      <div class="col-md-6">
        <table class="table table-sm table-borderless">
          <tr><td class="text-muted fw-bold">Vertragsnummer</td><td>${escapeHtml(d.vertragsnr)}</td></tr>
          <tr><td class="text-muted fw-bold">Name</td><td>${escapeHtml(d.vorname)} ${escapeHtml(d.nachname)}</td></tr>
          <tr><td class="text-muted fw-bold">E-Mail</td>
              <td><a href="mailto:${escapeHtml(d.email)}">${escapeHtml(d.email)}</a></td></tr>
          <tr><td class="text-muted fw-bold">Telefon</td>
              <td><a href="tel:${escapeHtml(d.telefon)}">${escapeHtml(d.telefon)}</a></td></tr>
          <tr><td class="text-muted fw-bold">Mietdatum</td><td>${escapeHtml(d.mietdatum)}</td></tr>
          <tr><td class="text-muted fw-bold">Festbeginn</td><td>${escapeHtml(d.festbeginn)}</td></tr>
          <tr><td class="text-muted fw-bold">Mietbetrag</td><td>${escapeHtml(d.mietbetrag)}</td></tr>
        </table>
      </div>
      <div class="col-md-6">
        <div class="p-3 rounded mb-3"
             style="background:${statusColor}22;border-left:4px solid ${statusColor}">
          <strong>Status:</strong> ${escapeHtml(d.status)}
        </div>
        <table class="table table-sm table-borderless">
          <tr><td class="text-muted">Vertrag versandt</td><td>${escapeHtml(d.datum_vertrag || '–')}</td></tr>
          <tr><td class="text-muted">Mahnung</td><td>${escapeHtml(d.datum_mahnung || '–')}</td></tr>
          <tr><td class="text-muted">Schlüsselübergabe</td><td>${escapeHtml(d.datum_schluessel || '–')}</td></tr>
          <tr><td class="text-muted">Storniert</td><td>${escapeHtml(d.datum_storno || '–')}</td></tr>
          <tr><td class="text-muted">Clubdesk</td><td>${escapeHtml(d.transfer || '–')}</td></tr>
        </table>
        ${d.kommentar ? `<div class="alert alert-info p-2 small">💬 ${escapeHtml(d.kommentar)}</div>` : ''}
      </div>
    </div>`;

  document.getElementById('vermietung-modal-footer').innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Schliessen</button>
    ${!istStorniert && !istBezahlt ? `
      <button class="btn btn-sm btn-warning"
              onclick="vermietungAktion('mahnung', ${row})">❗ Mahnung</button>` : ''}
    ${!istStorniert && !istBezahlt ? `
      <button class="btn btn-sm btn-success"
              onclick="vermietungAktion('bestaetigen', ${row})">✅ Zahlung bestätigen</button>` : ''}
    <button class="btn btn-sm btn-primary"
            onclick="vermietungAktion('whatsapp', ${row})">📱 WhatsApp</button>
    ${!istStorniert ? `
      <button class="btn btn-sm btn-danger"
              onclick="vermietungAktion('stornieren', ${row})">❌ Stornieren</button>` : ''}
  `;

  new bootstrap.Modal(document.getElementById('vermietungModal')).show();
}

async function vermietungAktion(action, row) {
  const labels = {
    mahnung: "Mahnung senden?",
    bestaetigen: "Zahlung bestätigen?",
    stornieren: "⚠️ Wirklich stornieren?",
    whatsapp: "WhatsApp senden?"
  };
  if (!confirm(labels[action] || "Ausführen?")) return;

  // Feedback: Zeige dem User, dass gearbeitet wird
  const modalFooter = document.getElementById('vermietung-modal-footer');
  const originalFooter = modalFooter.innerHTML;
  modalFooter.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Verarbeite...`;

  try {
    const res = await apiFetch('vermietung', `action=${action}&row=${row}`);
    const data = await res.json();
    
    if (data.success) {
      // Modal schließen
      const modalElem = document.getElementById('vermietungModal');
      const modalInstance = bootstrap.Modal.getInstance(modalElem);
      if (modalInstance) modalInstance.hide();
      
      // Toast sofort zeigen
      showToast("✅ " + (data.message || "Erfolgreich ausgeführt"));
      
      // Daten im Hintergrund aktualisieren
      await loadVermietungData();
    } else {
      modalFooter.innerHTML = originalFooter; // Buttons wiederherstellen
      alert("❌ Fehler vom Server: " + data.error);
    }
  } catch(e) {
    modalFooter.innerHTML = originalFooter;
    alert("🌐 Verbindungsfehler: " + e.message);
  }
}
async function triggerClubdeskExport() {
  if (!confirm("Clubdesk Export jetzt senden?")) return;
  const res  = await apiFetch('vermietung', 'action=clubdesk');
  const data = await res.json();
  showToast(data.success ? "✅ Export gesendet" : "❌ Fehler: " + data.error);
}

function getStatusColor(status) {
  if (!status) return "#6c757d";
  if (status.includes("01")) return "#ffc107";
  if (status.includes("02")) return "#fd7e14";
  if (status.includes("03")) return "#28a745";
  if (status.includes("04")) return "#0f3a5d";
  if (status.includes("05")) return "#dc3545";
  return "#6c757d";
}

function getStatusLabel(status) {
  if (!status) return "Unbekannt";
  if (status.includes("01")) return "Offen";
  if (status.includes("02")) return "Gemahnt";
  if (status.includes("03")) return "Bezahlt";
  if (status.includes("04")) return "Schlüssel versandt";
  if (status.includes("05")) return "Storniert";
  return status;
}

function showToast(msg) {
    // Falls schon ein Toast da ist, entfernen
    const oldToast = document.querySelector('.custom-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerHTML = `<i class="fas fa-check-circle me-2"></i> ${msg}`;
    
    document.body.appendChild(toast);

    // Nach 4 Sekunden ausblenden
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}