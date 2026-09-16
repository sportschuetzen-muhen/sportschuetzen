// === SUB-MODUL: VERMIETUNG - MANAGER & CRUD ===

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
