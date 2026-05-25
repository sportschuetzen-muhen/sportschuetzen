// === SUB-MODUL: VERMIETUNG - LISTE & FILTER & SORTIERUNG ===

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
