// === SUB-MODUL: VERMIETUNG - MANAGER & CRUD (Native Supabase Single Source of Truth) ===

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
          <button class="btn btn-xs btn-outline-success" style="font-size:0.75rem; font-weight:600;" onclick="vmGenerateRentalContractPdf('${d.vertragsnr || d.id}')">
            <i class="fas fa-file-pdf me-1"></i>PDF QR-Vertrag
          </button>
          ${d.contract_file_url ? `
            <a href="${escapeHtml(d.contract_file_url)}" target="_blank" class="btn btn-xs btn-outline-primary" style="font-size:0.75rem; font-weight:600;">
              <i class="fas fa-external-link-alt me-1"></i>PDF öffnen
            </a>` : ''}
          ${!istStorniert ? `
            <button class="btn btn-xs btn-outline-info" style="font-size:0.75rem; font-weight:600;" onclick="vermietungAktion('vertrag_mail', '${d.id || d.row}')">
              <i class="far fa-paper-plane me-1"></i>Vertrag per Mail
            </button>` : ''}
        </div>
      </div>

      <!-- Rechte Spalte: Protokolle & Workflow-Notizen -->
      <div class="col-md-6">
        <h6 class="fw-bold text-primary mb-3 border-bottom pb-1">
          <i class="fas fa-clipboard-check me-2"></i>Statusprotokoll & Audit
        </h6>
        <div class="p-2 rounded mb-3 text-center"
             style="background:${statusColor}18; border: 1px solid ${statusColor}33; color: ${statusColor}; font-weight:bold; font-size:0.9rem;">
          Status: ${escapeHtml(statusLabel)}
        </div>
        <table class="table table-sm table-borderless" style="font-size: 0.82rem;">
          <tr><td class="text-muted" style="width: 140px;">Mietvertrag versandt</td><td>${escapeHtml(d.datum_vertrag || '–')}</td></tr>
          <tr><td class="text-muted">Mahnung versandt</td><td>${escapeHtml(d.datum_mahnung || '–')}</td></tr>
          <tr><td class="text-muted">Zahlungseingang</td><td>${escapeHtml(d.datum_raiffeisen || (d.is_paid ? 'Ja' : '–'))}</td></tr>
          <tr><td class="text-muted">Schlüsselübergabe</td><td>${escapeHtml(d.datum_schluessel || '–')}</td></tr>
          <tr><td class="text-muted">Storniert am</td><td>${escapeHtml(d.datum_storno || '–')}</td></tr>
        </table>

        ${d.kommentar ? `
          <div class="alert alert-info p-2 small border-0 mt-2 d-flex align-items-start gap-2" style="background:#e3f2fd; color:#0d47a1; border-radius:6px;">
            <i class="fas fa-info-circle mt-1" style="font-size: 1rem;"></i>
            <div><strong>Notiz / Kommentar:</strong><br>${escapeHtml(d.kommentar)}</div>
          </div>` : ''}

        ${d.is_inquiry ? `
          <div class="alert alert-warning p-2 small border-0 mt-2 d-flex align-items-start gap-2" style="border-radius:6px;">
            <i class="fas fa-question-circle mt-1"></i>
            <div><strong>Vorab-Terminanfrage:</strong><br>${escapeHtml(d.inquiry_note || 'Kunde wünscht Vorab-Prüfung')}</div>
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

// Baut das responsive HTML-Layout für alle Vermietungs-Mails
function buildRentalEmailHtml(title, bannerColor, bodyHtml, settings) {
  const logoUrl = settings?.logo_url || "https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-512.png";
  const clubName = settings?.club_name || "Sportschützen Muhen";
  const clubEmail = settings?.club_email || "sportschuetzen.muhen@gmail.com";

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;background-color:#ffffff;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${bannerColor}; width:100%; border-collapse:collapse;">
        <tr>
          <td style="padding:18px 25px; text-align:left; vertical-align:middle;">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; display:inline-block;">
              <tr>
                <td style="vertical-align:middle; padding-right:15px;">
                  <img src="${logoUrl}" width="38" height="38" style="width:38px; height:38px; display:block; border-radius:6px;" border="0" alt="Logo">
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-family:'Segoe UI',Arial,sans-serif; font-size:19px; font-weight:600; color:#ffffff; line-height:1.2;">${title}</span>
                  <div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:2px;">${clubName} – Schützenstube Muhen</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <div style="padding:28px 25px; color:#333333; line-height:1.6; font-size:15px;">
        ${bodyHtml}
      </div>
      <div style="background:#f8f9fa; padding:15px 25px; border-top:1px solid #eeeeee; font-size:11px; color:#64748b; text-align:center; line-height:1.6;">
        <strong>Sportschützen Muhen</strong> (gegründet 1919) &bull; Schiessanlage Rüteli &bull; 5037 Muhen<br>
        Web: <a href="https://sportschuetzen-muhen.ch" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none;">www.sportschuetzen-muhen.ch</a> &bull; E-Mail: <a href="mailto:sportschuetzen.muhen@gmail.com" style="color:#0284c7; text-decoration:none;">sportschuetzen.muhen@gmail.com</a><br>
        <a href="https://www.instagram.com/sportschuetzen.muhen/" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; font-weight:500;">Instagram</a> &bull; <a href="https://www.facebook.com/SportschuetzenMuhen/?locale=de_DE" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; font-weight:500;">Facebook</a>
      </div>
    </div>
  `;
}

// Sendet Workflow-Mails über die zentrale Supabase Edge Function Mail-Engine basierend auf Vorlagen aus document_templates
async function sendRentalWorkflowEmail(action, d, settings) {
  if (typeof window.sendMailViaEngine !== 'function') {
    console.warn("⚠️ window.sendMailViaEngine nicht verfügbar.");
    return { success: false, error: "Mail-Engine nicht geladen" };
  }

  const s = settings || window._rentalSettings || {};
  const clubEmail = s.club_email || "sportschuetzen.muhen@gmail.com";
  const wirtschaftEmail = s.wirtschaft_email || clubEmail;
  const wirtschaftName = s.wirtschaft_name || "Wirtschaftsteam";
  const wirtschaftPhone = s.wirtschaft_phone || "079 123 45 67";
  const feedbackBaseUrl = s.feedback_base_url || "https://sportschuetzen-muhen.ch/storno_feedback.html";

  // 1. Zuweisung des Aktionscodes zur Template-ID
  const actionToTplCode = {
    'vertrag_mail': 'vm_vertrag',
    'mahnung': 'vm_mahnung',
    'bestaetigen': 'vm_bestaetigung',
    'schluessel': 'vm_schluessel',
    'stornieren': 'vm_storno'
  };
  const tplCode = actionToTplCode[action] || action;

  // 2. Vorlage aus Supabase / Cache laden
  let tpl = (window._docTemplatesData || []).find(t => t.code === tplCode || t.id === tplCode);
  if (!tpl) {
    const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
    if (supa) {
      const { data } = await supa.from('document_templates').select('*').eq('code', tplCode).maybeSingle();
      if (data) tpl = data;
    }
  }

  // 3. STRIKTER CHECK: Keine stillen Fallbacks bei unvollständigen/fehlenden Vorlagen!
  if (!tpl || !tpl.mail_subject || !tpl.mail_body) {
    throw new Error(
      `Konfigurationsfehler: Die E-Mail-Vorlage '${tplCode}' ist in Supabase ('document_templates') nicht vorhanden oder unvollständig. Bitte im Modul 'Dokumente-Vorlagen' konfigurieren.`
    );
  }

  // Banner-Farben je nach Workflow-Schritt
  const bannerColors = {
    'vm_vertrag': '#0f3c5c',
    'vm_mahnung': '#c53030',
    'vm_bestaetigung': '#22543d',
    'vm_schluessel': '#2b6cb0',
    'vm_storno': '#742a2a'
  };
  const bannerColor = bannerColors[tplCode] || '#0f3c5c';

  // 4. Platzhalter-Auflösung
  const bookingNr = d.booking_number || d.vertragsnr || d.id || '';
  const dateStr = d.start_date ? new Date(d.start_date).toLocaleDateString('de-CH') : (d.mietdatum || '–');
  const amountStr = d.total_amount_chf ? Number(d.total_amount_chf).toFixed(2) : (d.mietbetrag || '300.00');
  const depositStr = d.deposit_amount_chf ? Number(d.deposit_amount_chf).toFixed(2) : (d.kaution || '200.00');
  const feedbackUrl = `${feedbackBaseUrl}?vnr=${encodeURIComponent(bookingNr)}`;

  const placeholderMap = {
    'vorname': d.first_name || d.vorname || '',
    'nachname': d.last_name || d.nachname || '',
    'anrede': d.salutation || d.anrede || 'Guten Tag',
    'mietdatum': dateStr,
    'festbeginn': d.festbeginn || '14:00 Uhr',
    'vertragsnr': bookingNr,
    'buchungsnummer': bookingNr,
    'mietbetrag': amountStr,
    'kaution': depositStr,
    'wirtschaft_name': wirtschaftName,
    'wirtschaft_phone': wirtschaftPhone,
    'wirtschaft_email': wirtschaftEmail,
    'feedback_url': feedbackUrl,
    'club_email': clubEmail
  };

  let renderedSubject = tpl.mail_subject;
  let renderedBody = tpl.mail_body;

  Object.entries(placeholderMap).forEach(([k, v]) => {
    const rx = new RegExp(`\\{${k}\\}`, 'gi');
    renderedSubject = renderedSubject.replace(rx, v);
    renderedBody = renderedBody.replace(rx, v);
  });

  // Body in HTML-Paragraphen umwandeln
  const bodyParagraphs = renderedBody.split('\n\n').map(p => 
    `<p style="margin:0 0 12px 0; line-height: 1.55;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`
  ).join('');

  // 5. Anhänge ermitteln
  let attachments = [];
  if ((action === 'vertrag_mail' || action === 'mahnung') && d.contract_file_url) {
    attachments.push({ filename: `Mietvertrag_${bookingNr}.pdf`, path: d.contract_file_url });
  }

  const fullHtml = buildRentalEmailHtml(renderedSubject, bannerColor, bodyParagraphs, s);

  return await window.sendMailViaEngine({
    to: d.email,
    cc: clubEmail,
    subject: renderedSubject,
    html: fullHtml,
    attachments: attachments,
    module: 'vermietung',
    referenceId: bookingNr
  });
}

// Führt Vermietungsaktionen aus (Supabase Single Source of Truth, Audit-Log & Mail-Engine)
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
    if (!confirm(`⚠️ Reservation ${d.vertragsnr} wirklich stornieren?\n\nDadurch wird die Reservation freigegeben und dem Mieter ein Stornomail mit Feedbacklink gesendet.`)) return;
  } else if (action === 'vertrag_mail') {
    if (!confirm(`Mietvertrag per E-Mail an ${d.email} senden?`)) return;
  }

  const modalFooter = document.getElementById('vermietung-modal-footer');
  const originalFooter = modalFooter ? modalFooter.innerHTML : '';
  if (modalFooter) {
    modalFooter.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Verarbeite ${action}...`;
  }

  try {
    const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
    if (!supa) throw new Error("Supabase Client ist nicht verfügbar.");

    const todayIso = new Date().toISOString().split('T')[0];
    const updatePayload = {};
    let statusLogNewStatus = null;

    if (action === 'mahnung') {
      updatePayload.status = 'reminded';
      updatePayload.datum_mahnung = todayIso;
      statusLogNewStatus = 'reminded';
    } else if (action === 'bestaetigen') {
      updatePayload.status = 'paid';
      updatePayload.is_paid = true;
      updatePayload.datum_raiffeisen = todayIso;
      statusLogNewStatus = 'paid';
    } else if (action === 'schluessel') {
      updatePayload.status = 'keys_issued';
      updatePayload.datum_schluessel = todayIso;
      statusLogNewStatus = 'keys_issued';
    } else if (action === 'stornieren') {
      updatePayload.status = 'cancelled';
      updatePayload.datum_storno = todayIso;
      statusLogNewStatus = 'cancelled';
    }

    // 1. Supabase-Aktualisierung
    if (Object.keys(updatePayload).length > 0) {
      const { error: supaErr } = await supa
        .from('rental_requests')
        .update(updatePayload)
        .eq('id', d.id);
      if (supaErr) throw supaErr;

      // Status-Audit protokollieren
      await supa.from('rental_status_logs').insert([{
        rental_request_id: d.id,
        previous_status: d.raw?.status || d.status,
        new_status: statusLogNewStatus,
        comment: `Aktion ${action} durch Vorstand ausgeführt`,
        changed_by: (window.currentUser && (window.currentUser.display_name || window.currentUser.email)) || 'Vorstand'
      }]);
    }

    // 1.1 RechnungsCore-Synchronisation (Single Source of Truth)
    if (action === 'bestaetigen' && window.RechnungsCore && typeof window.RechnungsCore.recordPayment === 'function') {
      try {
        const inv = await ensureRentalInvoice(d);
        if (inv && (inv.status === 'offen' || inv.status === 'teilbezahlt' || inv.status === 'entwurf')) {
          await window.RechnungsCore.recordPayment(inv.id, {
            amount: inv.open_amount || inv.total_amount,
            method: 'Bank',
            notes: `Zahlungseingang Mietvertrag ${d.vertragsnr}`
          });
          console.log(`✅ [Vermietung] RechnungsCore-Zahlung verbucht: ${inv.id}`);
        }
      } catch (payErr) {
        console.warn("⚠️ [Vermietung] RechnungsCore Zahlungseingang:", payErr);
      }
    } else if (action === 'stornieren' && window.RechnungsCore && typeof window.RechnungsCore.cancelInvoice === 'function') {
      try {
        const inv = await ensureRentalInvoice(d);
        if (inv && inv.status !== 'storniert' && inv.status !== 'bezahlt') {
          await window.RechnungsCore.cancelInvoice(inv.id, 'Reservation im Vermietungsmodul storniert');
          console.log(`✅ [Vermietung] RechnungsCore-Storno verbucht: ${inv.id}`);
        }
      } catch (stornoErr) {
        console.warn("⚠️ [Vermietung] RechnungsCore Stornierung:", stornoErr);
      }
    }

    // 2. E-Mail-Versand über Supabase Mail-Engine
    const mailRes = await sendRentalWorkflowEmail(action, d, window._rentalSettings);
    if (!mailRes.success) {
      console.warn("Mailversand-Hinweis:", mailRes.error);
    }

    // Modal schliessen und Daten neu laden
    const modalElem = document.getElementById('vermietungModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElem);
    if (modalInstance) modalInstance.hide();

    showToast(`✅ Aktion «${action}» erfolgreich ausgeführt!`);
    await loadVermietungData(true);

  } catch (e) {
    if (modalFooter) modalFooter.innerHTML = originalFooter;
    console.error("Fehler bei Vermietungsaktion:", e);
    alert("❌ Fehler beim Ausführen: " + e.message);
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

// Speichert die neu erfasste Reservation direkt in Supabase
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

    // RechnungsCore: Zentrale Forderung/Rechnung automatisch anlegen
    try {
      await ensureRentalInvoice(data);
    } catch (invErr) {
      console.warn("⚠️ RechnungsCore Erstellung Vermietung:", invErr);
    }

    // Automatisches Generieren des Mietvertrags-PDFs mit Schweizer QR-Rechnung
    if (typeof window.vmGenerateRentalContractPdf === 'function') {
      try {
        await window.vmGenerateRentalContractPdf(data.booking_number);
      } catch (pdfErr) {
        console.warn("Hinweis PDF-Generierung:", pdfErr);
      }
    }

    // Modal schliessen
    const modalElem = document.getElementById('newReservationModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElem);
    if (modalInstance) modalInstance.hide();

    showToast(`✅ Reservation ${data.booking_number} erfolgreich in Supabase erfasst!`);
    await loadVermietungData(true);

  } catch (err) {
    console.error("Fehler beim Speichern der Reservation:", err);
    alert("❌ Fehler beim Speichern: " + err.message);
  }
}

/**
 * Stellt sicher, dass zu einer Vermietung ein zentraler Rechnungsdatensatz via RechnungsCore existiert
 * @param {Object} d Vermietungsdatensatz
 * @returns {Promise<Object|null>} Rechnungsdatensatz
 */
async function ensureRentalInvoice(d) {
  if (!d) return null;
  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  if (!supa) return null;

  const bookingNr = d.booking_number || d.vertragsnr || d.id;

  try {
    // 1. Prüfen, ob bereits eine Rechnung vorhanden ist
    const { data: existing } = await supa
      .from('invoices')
      .select('id, total_amount, open_amount, status, recipient_address')
      .eq('source_module', 'vermietung')
      .or(`source_id.eq.${bookingNr},source_id.eq.${d.id}`)
      .limit(1);

    if (existing && existing.length > 0) {
      return existing[0];
    }

    if (!window.RechnungsCore || typeof window.RechnungsCore.createInvoice !== 'function') {
      return null;
    }

    // 2. Einheitliches InvoiceOrder-Payload nach Vertragsstandard
    const invoiceOrder = {
      source: {
        module: 'vermietung',
        id: bookingNr
      },
      recipient: {
        name: `${d.first_name || d.vorname || ''} ${d.last_name || d.nachname || ''}`.trim() || 'Mieter Schützenstube',
        salutation: d.salutation || d.anrede || '',
        street: d.street || d.strasse || '',
        zip: d.post_code || d.plz || '',
        city: d.city || d.wohnort || '',
        email: d.email || ''
      },
      sender: {
        bereich: 'Vermietung Schützenstube',
        funktion: 'Vermieter'
      },
      positions: [
        {
          title: `Miete Schützenstube Muhen (${d.start_date || d.mietdatum || 'Reservation'})`,
          quantity: 1,
          unitPrice: Number(d.total_amount_chf || d.betrag_raw || 300),
          account: '3400' // Ertrag Vermietung Schützenhaus
        }
      ],
      options: {
        dueDateDays: 14,
        type: 'Vermietung',
        notes: `Mietvertrag ${bookingNr}`,
        bookingNumber: bookingNr
      }
    };

    const newInvoice = await window.RechnungsCore.createInvoice(invoiceOrder);
    console.log(`✅ [Vermietung] Zentrale Rechnung erfolgreich via RechnungsCore erstellt: ${newInvoice.id}`);
    return newInvoice;
  } catch (err) {
    console.warn("⚠️ [Vermietung] Fehler bei ensureRentalInvoice:", err);
    return null;
  }
}

/**
 * Speichert alle Tarife und Systemeinstellungen der Vermietung atomar in Supabase
 */
async function saveRentalSettings() {
  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  if (!supa) {
    alert("Supabase Client nicht initialisiert.");
    return;
  }

  const btn = document.getElementById('cfg-save-btn');
  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Speichere Einstellungen...`;
  }

  try {
    const stdPrice = parseFloat(document.getElementById('cfg-price-standard')?.value || 300);
    const mbrPrice = parseFloat(document.getElementById('cfg-price-member')?.value || 150);
    const deposit = parseFloat(document.getElementById('cfg-deposit')?.value || 200);
    const stornoFee = parseFloat(document.getElementById('cfg-storno-fee')?.value || 100);
    const woodFee = parseFloat(document.getElementById('cfg-wood-fee')?.value || 20);
    const cleanFee = parseFloat(document.getElementById('cfg-cleaning-fee')?.value || 35);
    const garbageFee = parseFloat(document.getElementById('cfg-garbage-fee')?.value || 4);

    const sFirst = document.getElementById('cfg-sender-firstname')?.value.trim() || '';
    const sLast = document.getElementById('cfg-sender-lastname')?.value.trim() || '';
    const sPhone = document.getElementById('cfg-sender-phone')?.value.trim() || '';
    const clubEmail = document.getElementById('cfg-club-email')?.value.trim() || '';

    const wName = document.getElementById('cfg-wirtschaft-name')?.value.trim() || '';
    const wPhone = document.getElementById('cfg-wirtschaft-phone')?.value.trim() || '';
    const wEmail = document.getElementById('cfg-wirtschaft-email')?.value.trim() || '';
    const wSalut = document.getElementById('cfg-wirtschaft-salutation')?.value.trim() || '';

    const iban = document.getElementById('cfg-iban')?.value.trim() || '';
    const mapsUrl = document.getElementById('cfg-maps-url')?.value.trim() || '';
    const fbUrl = document.getElementById('cfg-feedback-url')?.value.trim() || '';

    // 1. Settings Upsert in public.rental_settings
    const settingsRows = [
      { setting_key: 'sender_first_name', setting_value: sFirst, description: 'Vorname des Vermieters / Absenders' },
      { setting_key: 'sender_last_name', setting_value: sLast, description: 'Nachname des Vermieters / Absenders' },
      { setting_key: 'sender_phone', setting_value: sPhone, description: 'Telefonnummer des Vermieters' },
      { setting_key: 'club_email', setting_value: clubEmail, description: 'Hauptkontakt / CC für Vermietungen' },
      { setting_key: 'wirtschaft_name', setting_value: wName, description: 'Name / Kontakt Schlüsselübergabe' },
      { setting_key: 'wirtschaft_phone', setting_value: wPhone, description: 'Telefon Schlüsselübergabe' },
      { setting_key: 'wirtschaft_email', setting_value: wEmail, description: 'E-Mail Schlüsselübergabe' },
      { setting_key: 'wirtschaft_salutation', setting_value: wSalut, description: 'Begrüssung im Wirtschafts-Mail' },
      { setting_key: 'iban', setting_value: iban, description: 'IBAN für Schweizer QR-Rechnung' },
      { setting_key: 'maps_url', setting_value: mapsUrl, description: 'Google Maps Link Schützenhaus' },
      { setting_key: 'feedback_base_url', setting_value: fbUrl, description: 'Basis-URL für Storno-Rückmeldung' },
      { setting_key: 'deposit_amount', setting_value: String(deposit), description: 'Kaution / Depot in CHF' },
      { setting_key: 'storno_fee', setting_value: String(stornoFee), description: 'Stornogebühr in CHF' },
      { setting_key: 'wood_fee', setting_value: String(woodFee), description: 'Zusatz Cheminéeholz pro Kiste in CHF' },
      { setting_key: 'cleaning_fee_per_hour', setting_value: String(cleanFee), description: 'Nachreinigung pro Stunde in CHF' },
      { setting_key: 'garbage_bag_fee', setting_value: String(garbageFee), description: 'Kehrichtsack pro Stk in CHF' }
    ];

    for (const row of settingsRows) {
      const { error: setErr } = await supa.from('rental_settings').upsert(row, { onConflict: 'setting_key' });
      if (setErr) throw setErr;
    }

    // 2. Pricing Updates in public.rental_pricing
    await supa.from('rental_pricing').update({
      base_price_chf: stdPrice,
      deposit_chf: deposit
    }).eq('tariff_code', 'standard_tag');

    await supa.from('rental_pricing').update({
      base_price_chf: mbrPrice,
      deposit_chf: deposit
    }).eq('tariff_code', 'mitglied_rabatt');

    // 3. Lokalen State synchronisieren
    if (!window._rentalSettings) window._rentalSettings = {};
    settingsRows.forEach(r => {
      window._rentalSettings[r.setting_key] = r.setting_value;
    });

    if (window._rentalPricing) {
      const std = window._rentalPricing.find(p => p.tariff_code === 'standard_tag');
      if (std) { std.base_price_chf = stdPrice; std.deposit_chf = deposit; }
      const mbr = window._rentalPricing.find(p => p.tariff_code === 'mitglied_rabatt');
      if (mbr) { mbr.base_price_chf = mbrPrice; mbr.deposit_chf = deposit; }
    }

    showToast("✅ Einstellungen und Tarife erfolgreich in Supabase gespeichert!");
  } catch (err) {
    console.error("Fehler beim Speichern der Einstellungen:", err);
    alert("❌ Fehler beim Speichern: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
  }
}

