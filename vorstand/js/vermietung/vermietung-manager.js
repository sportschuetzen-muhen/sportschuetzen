// === SUB-MODUL: VERMIETUNG - MANAGER & CRUD (Supabase + GAS Hybrid) ===

// Kopiert die Buchungsdetails als formatierten Text in die Zwischenablage
function copyReservationDetails(rowOrId) {
  const d = vermietungDaten.find(x => x.row === rowOrId || x.id === rowOrId || x.vertragsnr === rowOrId);
  if (!d) return;

  const text = `🎯 RESERVATION DETAILS (Schützenstube Muhen)
---------------------------------------------
Vertragsnr:     ${d.vertragsnr || '–'}
Name:           ${d.vorname || ''} ${d.nachname || ''}
E-Mail:         ${d.email || '–'}
Telefon:        ${d.telefon || '–'}
Adresse:        ${d.strasse || ''}, ${d.plz || ''} ${d.wohnort || ''}
Mietdatum:      ${d.mietdatum || '–'}
Festbeginn:     ${d.festbeginn || '–'}
Mietbetrag:     ${d.mietbetrag || '–'}
Status:         ${getStatusLabel(d.status)}
---------------------------------------------`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 Details in die Zwischenablage kopiert!");
  }).catch(err => {
    console.error("Kopieren fehlgeschlagen:", err);
    alert("Kopieren fehlgeschlagen.");
  });
}

// Öffnet das Detailmodal mit Timeline, Statusprotokoll und geschützten Aktionsknöpfen
function openVermietungModal(rowOrId) {
  const d = vermietungDaten.find(x => x.row === rowOrId || x.id === rowOrId || x.vertragsnr === rowOrId);
  if (!d) return;

  const statusColor  = getStatusColor(d.status);
  const statusLabel  = getStatusLabel(d.status);
  const s            = String(d.status || '').toLowerCase();
  const istStorniert = s.includes("05") || s === 'cancelled';
  const istBezahlt   = s.includes("03") || s.includes("04") || s === 'paid' || s === 'keys_issued' || s === 'completed';

  document.getElementById('vermietung-modal-body').innerHTML = `
    <!-- Buchungs-Timeline -->
    ${getTimelineHtml(d.status)}
    
    <div class="row g-4 mt-2">
      <!-- Linke Spalte: Kontaktdaten & Buchung -->
      <div class="col-md-6 border-end">
        <h6 class="fw-bold text-primary mb-3 border-bottom pb-1">
          <i class="fas fa-address-card me-2"></i>Kontaktdaten & Buchung
        </h6>
        <table class="table table-sm table-borderless align-middle" style="font-size:0.88rem;">
          <tr><td class="text-muted fw-semibold" style="width: 120px;">Vertragsnr.</td><td><strong>${escapeHtml(d.vertragsnr)}</strong></td></tr>
          <tr><td class="text-muted fw-semibold">Mieter</td><td>${escapeHtml((d.anrede ? d.anrede + ' ' : '') + d.vorname + ' ' + d.nachname)}</td></tr>
          <tr><td class="text-muted fw-semibold">Adresse</td><td>${escapeHtml(d.strasse || '–')}, ${escapeHtml(d.plz || '')} ${escapeHtml(d.wohnort || '')}</td></tr>
          <tr><td class="text-muted fw-semibold">E-Mail</td>
              <td><a href="mailto:${escapeHtml(d.email)}" class="text-decoration-none"><i class="far fa-envelope me-1"></i>${escapeHtml(d.email)}</a></td></tr>
          <tr><td class="text-muted fw-semibold">Telefon</td>
              <td><a href="tel:${escapeHtml(d.telefon)}" class="text-decoration-none"><i class="fas fa-phone-alt me-1"></i>${escapeHtml(d.telefon)}</a></td></tr>
          <tr><td class="text-muted fw-semibold">Mietdatum</td><td><span class="badge bg-light text-dark border fw-semibold">${escapeHtml(d.mietdatum)}</span></td></tr>
          <tr><td class="text-muted fw-semibold">Festbeginn</td><td>${escapeHtml(d.festbeginn)}</td></tr>
          <tr><td class="text-muted fw-semibold">Mietbetrag</td><td><strong class="text-primary fs-6">${escapeHtml(d.mietbetrag)}</strong></td></tr>
        </table>
        
        <div class="d-flex flex-wrap gap-2 mt-3">
          <button class="btn btn-xs btn-outline-secondary" style="font-size:0.75rem; font-weight:600;" onclick="copyReservationDetails('${d.id || d.row}')">
            <i class="far fa-copy me-1"></i>Details kopieren
          </button>
          <button class="btn btn-xs btn-outline-success" style="font-size:0.75rem; font-weight:600;" onclick="vmGenerateRentalContractPdf('${d.booking_number || d.vertragsnummer || d.id}')">
            <i class="fas fa-file-pdf me-1"></i>PDF generieren
          </button>
          ${d.contract_file_url ? `
            <a href="${escapeHtml(d.contract_file_url)}" target="_blank" class="btn btn-xs btn-outline-primary" style="font-size:0.75rem; font-weight:600;">
              <i class="fas fa-external-link-alt me-1"></i>Mietvertrag öffnen
            </a>` : ''}
        </div>
      </div>

      <!-- Rechte Spalte: Protokolle & Workflow-Notizen -->
      <div class="col-md-6">
        <h6 class="fw-bold text-primary mb-3 border-bottom pb-1">
          <i class="fas fa-clipboard-check me-2"></i>Statusprotokoll
        </h6>
        <div class="p-2 rounded mb-3 text-center"
             style="background:${statusColor}18; border: 1px solid ${statusColor}33; color: ${statusColor}; font-weight:bold; font-size:0.9rem;">
          Status: ${escapeHtml(statusLabel)}
        </div>
        <table class="table table-sm table-borderless" style="font-size: 0.82rem;">
          <tr><td class="text-muted" style="width: 140px;">Mietvertrag versandt</td><td>${escapeHtml(d.datum_vertrag || '–')}</td></tr>
          <tr><td class="text-muted">Mahnung versandt</td><td>${escapeHtml(d.datum_mahnung || '–')}</td></tr>
          <tr><td class="text-muted">Schlüsselübergabe</td><td>${escapeHtml(d.datum_schluessel || '–')}</td></tr>
          <tr><td class="text-muted">Storniert am</td><td>${escapeHtml(d.datum_storno || '–')}</td></tr>
        </table>

        ${d.kommentar ? `
          <div class="alert alert-info p-2 small border-0 mt-2 d-flex align-items-start gap-2" style="background:#e3f2fd; color:#0d47a1; border-radius:6px;">
            <i class="fas fa-info-circle mt-1" style="font-size: 1rem;"></i>
            <div><strong>Notiz / Bank-Info:</strong><br>${escapeHtml(d.kommentar)}</div>
          </div>` : ''}

        ${d.is_inquiry ? `
          <div class="alert alert-warning p-2 small border-0 mt-2 d-flex align-items-start gap-2" style="border-radius:6px;">
            <i class="fas fa-question-circle mt-1"></i>
            <div><strong>Vorab-Terminanfrage:</strong><br>${escapeHtml(d.inquiry_note || 'Kunde wünscht Vorprüfung')}</div>
          </div>` : ''}
      </div>
    </div>`;

  // Aktionsknöpfe mit Schutz vor Doppelversand
  const modalFooter = document.getElementById('vermietung-modal-footer');
  modalFooter.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Schliessen</button>
    
    ${!istStorniert && !istBezahlt ? `
      <button class="btn btn-sm btn-warning fw-semibold"
              onclick="vermietungAktion('mahnung', '${d.id || d.row}')">
        <i class="fas fa-exclamation-triangle me-1"></i>❗ Mahnung
      </button>` : ''}
    
    ${!istStorniert && !istBezahlt ? `
      <button class="btn btn-sm btn-success fw-semibold"
              onclick="vermietungAktion('bestaetigen', '${d.id || d.row}')">
        <i class="fas fa-check-circle me-1"></i>Zahlung bestätigen
      </button>` : ''}

    ${!istStorniert && istBezahlt && d.status !== 'keys_issued' && d.status !== '04' ? `
      <button class="btn btn-sm btn-info text-white fw-semibold"
              onclick="vermietungAktion('schluessel', '${d.id || d.row}')">
        <i class="fas fa-key me-1"></i>Schlüsselübergabe senden
      </button>` : ''}
            
    ${!istStorniert ? `
      <button class="btn btn-sm btn-danger fw-semibold"
              onclick="vermietungAktion('stornieren', '${d.id || d.row}')">
        <i class="fas fa-trash-alt me-1"></i>Stornieren
      </button>` : ''}
  `;

  new bootstrap.Modal(document.getElementById('vermietungModal')).show();
}

// Führt Vermietungsaktionen aus (mit RLS / Supabase-Aktualisierung und Backend-Trigger)
async function vermietungAktion(action, idOrRow) {
  const d = vermietungDaten.find(x => x.row === idOrRow || x.id === idOrRow || x.vertragsnr === idOrRow);
  if (!d) return;

  // Schutz vor versehentlichem Doppelversand:
  if (action === 'mahnung') {
    let warnung = "Mahnung an " + d.email + " senden?";
    if (d.datum_mahnung && d.datum_mahnung !== '–') {
      warnung = `⚠️ HINWEIS: Eine Mahnung wurde bereits am ${d.datum_mahnung} versandt.\n\nMöchtest du wirklich eine ERNEUTE Mahnung senden?`;
    }
    if (!confirm(warnung)) return;
  } else if (action === 'schluessel') {
    let warnung = "Schlüsselübergabe-Mail an " + d.email + " senden?";
    if (d.datum_schluessel && d.datum_schluessel !== '–') {
      warnung = `⚠️ HINWEIS: Schlüsselübergabe-Mail wurde bereits am ${d.datum_schluessel} versandt.\n\nTrotzdem erneut senden?`;
    }
    if (!confirm(warnung)) return;
  } else if (action === 'bestaetigen') {
    if (!confirm(`Zahlungseingang für Vertrag ${d.vertragsnr} bestätigen?`)) return;
  } else if (action === 'stornieren') {
    if (!confirm(`⚠️ Reservation ${d.vertragsnr} wirklich stornieren?\n\nDadurch wird das Google-Kalenderereignis freigegeben und dem Mieter ein Stornomail mit Feedbacklink zugesendet.`)) return;
  }

  const modalFooter = document.getElementById('vermietung-modal-footer');
  const originalFooter = modalFooter.innerHTML;
  modalFooter.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Verarbeite...`;

  try {
    const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
    const todayIso = new Date().toISOString().split('T')[0];

    // 1. Supabase-Aktualisierung (falls Supabase-ID vorhanden)
    if (supa && d.id) {
      const updatePayload = {};
      if (action === 'mahnung') {
        updatePayload.status = 'reminded';
        updatePayload.datum_mahnung = todayIso;
      } else if (action === 'bestaetigen') {
        updatePayload.status = 'paid';
        updatePayload.is_paid = true;
        updatePayload.datum_raiffeisen = todayIso;
      } else if (action === 'schluessel') {
        updatePayload.status = 'keys_issued';
        updatePayload.datum_schluessel = todayIso;
      } else if (action === 'stornieren') {
        updatePayload.status = 'cancelled';
        updatePayload.datum_storno = todayIso;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: supaErr } = await supa
          .from('rental_requests')
          .update(updatePayload)
          .eq('id', d.id);
        if (supaErr) {
          console.warn("⚠️ Supabase Update Warnung:", supaErr.message);
        }
      }
    }

    // 2. Backend-Trigger aufrufen (für Google Calendar Freigabe / Mailversand / Sheet-Sync)
    let backendCallSuccess = true;
    try {
      if (typeof apiFetch === 'function') {
        const res = await apiFetch('vermietung', `action=${encodeURIComponent(action)}&row=${encodeURIComponent(d.raw?.row_index || d.row || '')}&vertragsnr=${encodeURIComponent(d.vertragsnr || '')}`);
        const data = await res.json();
        if (!data.success && data.error) {
          console.warn("Backend-Meldung:", data.error);
        }
      }
    } catch (backendErr) {
      console.warn("Backend API Trigger Hinweis (wurde offline oder via Supabase ausgeführt):", backendErr);
    }

    // Modal schliessen und Daten neu laden
    const modalElem = document.getElementById('vermietungModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElem);
    if (modalInstance) modalInstance.hide();

    showToast("✅ Aktion erfolgreich ausgeführt");
    await loadVermietungData(true);

  } catch (e) {
    modalFooter.innerHTML = originalFooter;
    alert("🌐 Fehler beim Ausführen: " + e.message);
  }
}

// Öffnet das Modal für die Schnellerfassung einer neuen Miete
function openNewReservationModal() {
  const modalBody = document.getElementById('new-reservation-modal-body');
  if (!modalBody) return;

  const pricingList = window._rentalPricing || [
    { id: 'std', tariff_code: 'standard_tag', description: 'Ganzer Tag Schützenstube (Standard)', base_price_chf: 300 }
  ];

  const pricingOptions = pricingList.map(p => `
    <option value="${p.id}" data-price="${p.base_price_chf}">
      ${escapeHtml(p.description)} – CHF ${parseFloat(p.base_price_chf).toFixed(2)}
    </option>
  `).join('');

  modalBody.innerHTML = `
    <form id="new-reservation-form" class="row g-3">
      <div class="col-md-3">
        <label class="form-label small fw-bold text-muted">Anrede</label>
        <select class="form-select form-select-sm" id="new-res-salutation">
          <option value="Herr">Herr</option>
          <option value="Frau">Frau</option>
          <option value="Familie">Familie</option>
          <option value="Firma">Firma / Verein</option>
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label small fw-bold text-muted">Vorname *</label>
        <input type="text" class="form-control form-control-sm" id="new-res-firstname" required placeholder="Vorname">
      </div>
      <div class="col-md-5">
        <label class="form-label small fw-bold text-muted">Nachname *</label>
        <input type="text" class="form-control form-control-sm" id="new-res-lastname" required placeholder="Nachname">
      </div>

      <div class="col-md-6">
        <label class="form-label small fw-bold text-muted">E-Mail-Adresse *</label>
        <input type="email" class="form-control form-control-sm" id="new-res-email" required placeholder="name@beispiel.ch">
      </div>
      <div class="col-md-6">
        <label class="form-label small fw-bold text-muted">Telefonnummer *</label>
        <input type="tel" class="form-control form-control-sm" id="new-res-phone" required placeholder="079 000 00 00">
      </div>

      <div class="col-md-6">
        <label class="form-label small fw-bold text-muted">Strasse / Nr.</label>
        <input type="text" class="form-control form-control-sm" id="new-res-street" placeholder="Musterweg 1">
      </div>
      <div class="col-md-2">
        <label class="form-label small fw-bold text-muted">PLZ</label>
        <input type="text" class="form-control form-control-sm" id="new-res-plz" placeholder="5037">
      </div>
      <div class="col-md-4">
        <label class="form-label small fw-bold text-muted">Ort</label>
        <input type="text" class="form-control form-control-sm" id="new-res-city" placeholder="Muhen">
      </div>

      <hr class="my-2">

      <div class="col-md-4">
        <label class="form-label small fw-bold text-muted">Mietdatum *</label>
        <input type="date" class="form-control form-control-sm" id="new-res-date" required>
      </div>
      <div class="col-md-3">
        <label class="form-label small fw-bold text-muted">Festbeginn</label>
        <input type="time" class="form-control form-control-sm" id="new-res-time" value="14:00">
      </div>
      <div class="col-md-5">
        <label class="form-label small fw-bold text-muted">Tarif & Mietbetrag</label>
        <select class="form-select form-select-sm" id="new-res-tariff">
          ${pricingOptions}
        </select>
      </div>

      <div class="col-12">
        <label class="form-label small fw-bold text-muted">Bemerkungen / Admin-Notiz</label>
        <textarea class="form-control form-control-sm" id="new-res-notes" rows="2" placeholder="Zusätzliche Vereinbarungen..."></textarea>
      </div>
    </form>
  `;

  new bootstrap.Modal(document.getElementById('newReservationModal')).show();
}

// Speichert die neu erfasste Reservation direkt in Supabase und synchronisiert Backend
async function saveNewReservation() {
  const firstname = document.getElementById('new-res-firstname')?.value.trim();
  const lastname  = document.getElementById('new-res-lastname')?.value.trim();
  const email     = document.getElementById('new-res-email')?.value.trim();
  const phone     = document.getElementById('new-res-phone')?.value.trim();
  const dateStr   = document.getElementById('new-res-date')?.value;
  const timeStr   = document.getElementById('new-res-time')?.value || '14:00';
  const salutation= document.getElementById('new-res-salutation')?.value || 'Herr';
  const street    = document.getElementById('new-res-street')?.value.trim() || '–';
  const plz       = document.getElementById('new-res-plz')?.value.trim() || '5037';
  const city      = document.getElementById('new-res-city')?.value.trim() || 'Muhen';
  const notes     = document.getElementById('new-res-notes')?.value.trim() || '';

  const tariffSelect = document.getElementById('new-res-tariff');
  const pricingId    = tariffSelect?.value;
  const priceOption  = tariffSelect?.options[tariffSelect.selectedIndex];
  const totalAmount  = parseFloat(priceOption?.getAttribute('data-price') || 300.00);

  if (!firstname || !lastname || !email || !phone || !dateStr) {
    alert("Bitte fülle alle mit * markierten Pflichtfelder aus.");
    return;
  }

  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  if (!supa) {
    alert("Supabase Verbindung nicht initialisiert.");
    return;
  }

  try {
    const payload = {
      salutation: salutation,
      first_name: firstname,
      last_name: lastname,
      street: street,
      post_code: plz,
      city: city,
      email: email,
      phone: phone,
      start_date: dateStr,
      end_date: dateStr,
      festbeginn: timeStr,
      pricing_id: pricingId && pricingId !== 'std' ? pricingId : null,
      total_amount_chf: totalAmount,
      status: 'contract_sent',
      datum_vertrag: new Date().toISOString().split('T')[0],
      admin_comment: notes
    };

    const { data, error } = await supa
      .from('rental_requests')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Optionaler Backend-Sync (für Google Calendar Belegung & Sheet)
    try {
      if (typeof apiFetch === 'function') {
        await apiFetch('vermietung', `action=sync_new&booking_number=${encodeURIComponent(data.booking_number)}&date=${encodeURIComponent(dateStr)}&name=${encodeURIComponent(firstname + ' ' + lastname)}`);
      }
    } catch (e) {
      console.warn("Backend-Sync Hinweis:", e);
    }

    // Modal schliessen
    const modalElem = document.getElementById('newReservationModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElem);
    if (modalInstance) modalInstance.hide();

    showToast(`✅ Reservation ${data.booking_number} erfolgreich erfasst!`);
    await loadVermietungData(true);

  } catch (err) {
    console.error("Fehler beim Speichern der Reservation:", err);
    alert("❌ Fehler beim Speichern: " + err.message);
  }
}
