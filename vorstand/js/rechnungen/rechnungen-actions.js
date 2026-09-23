// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - ACTIONS (INVOICE CRUD & PDF/MAIL)
// =====================================================================

// ZAHLUNGS ERFASSUNGS MODAL WITH SYNC CHOICE
window.rnOpenPaymentModal = function(invoiceId, amount) {
  let modalEl = document.getElementById('rnModalPayment');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalPayment';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-success text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-coins me-2"></i>Zahlungseingang erfassen</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-payment-form" onsubmit="rnSavePayment(event, '${invoiceId}')">
            
            <div class="alert alert-light border shadow-xs p-3 rounded-3 mb-4 d-flex justify-content-between align-items-center">
              <div>
                <span class="text-muted small">Zu begleichender Betrag:</span>
                <h5 class="fw-bold mb-0 text-dark">Rechnung ${invoiceId}</h5>
              </div>
              <h3 class="fw-extrabold mb-0 text-primary font-monospace">${fmtChf(amount)}</h3>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Zahlungsdatum</label>
              <input type="date" class="form-control" id="rnp-datum" required value="${new Date().toISOString().split('T')[0]}">
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Zahlungsmethode</label>
              <select class="form-select" id="rnp-methode" required>
                <option value="Überweisung Raiffeisen" selected>Überweisung Bank (Raiffeisen)</option>
                <option value="Kassabuch Bar">Barzahlung (Kassa)</option>
                <option value="Twint">Twint</option>
                <option value="Sonstiges">Sonstiges / Gutschein</option>
              </select>
            </div>

            <div class="mb-4">
              <label class="form-label fw-bold small text-muted">Beleg / Buchungsnummer</label>
              <input type="text" class="form-control fw-bold" id="rnp-beleg" value="ZAL-${invoiceId}">
              <div class="form-text text-muted small">Wird als Buchungsreferenz im Hauptbuch verbucht.</div>
            </div>

            <div class="mb-4 bg-light p-3 rounded-3 border">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="rnp-sync-bookkeeping" checked>
                <label class="form-check-label fw-bold small text-dark" for="rnp-sync-bookkeeping">
                  Zahlungseingang in Buchhaltung verbuchen
                </label>
              </div>
              <div class="form-text text-muted small mt-1">
                <strong>Option EIN (Standard):</strong> Verbucht die Zahlung automatisch im Journal (Soll Bank <code>1020</code> / Kassa <code>1000</code> an Haben Ertragskonto, z. B. <code>3400</code> Miete / <code>3000</code> Beitragsertrag).<br>
                <span class="text-danger"><strong>Option AUS:</strong> Ändert nur den Rechnungsstatus im Cockpit (Ideal für bereits von Hand im Kassabuch erfasste Rechnungen!).</span>
              </div>
            </div>

            <div class="d-grid">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="rnp-submit-btn">
                <i class="fas fa-check-circle me-1"></i> Zahlungseingang speichern
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
};

// SAVE PAYMENT
window.rnSavePayment = async function(event, invoiceId) {
  event.preventDefault();

  const syncBookkeeping = document.getElementById('rnp-sync-bookkeeping').checked;
  const datum = document.getElementById('rnp-datum').value;
  const methode = document.getElementById('rnp-methode').value;
  const beleg = document.getElementById('rnp-beleg').value.trim();

  // 1. Optimistic Update
  const invIndex = window._invoices.findIndex(i => String(i.id) === String(invoiceId));
  let oldInv = null;
  if (invIndex !== -1) {
    oldInv = { ...window._invoices[invIndex] };
    window._invoices[invIndex].status = 'bezahlt';
    window._invoices[invIndex].zahlungsdatum = datum;
    window._invoices[invIndex].zahlungsmethode = methode;
    window._invoices[invIndex].beleg_nr = beleg || `PAY-${invoiceId}`;
    window.renderRechnungen(); // Render table instantly!
  }

  // Close modal instantly
  const modalEl = document.getElementById('rnModalPayment');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  showSuccess(`🎉 Zahlung für Rechnung ${invoiceId} erfolgreich erfasst (Hintergrund-Synchronisation läuft)...`);

  // 1. Primärspeicher: Supabase REST
  const supa = (typeof getRechnungenSupabaseClient === 'function') ? getRechnungenSupabaseClient() : null;
  if (supa) {
    try {
      await supa.from('invoices').update({
        status: 'bezahlt',
        payment_date: datum,
        payment_method: methode,
        document_ref: beleg || `PAY-${invoiceId}`,
        updated_at: new Date().toISOString()
      }).eq('id', invoiceId);

      if (syncBookkeeping) {
        const invObj = window._invoices.find(i => String(i.id) === String(invoiceId));
        const sollKonto = (methode === 'Bar' || methode === 'Kasse') ? '1000' : '1020';
        const habenKonto = (invObj && invObj.account_haben) ? String(invObj.account_haben).trim() : '3400';
        const payYear = new Date(datum).getFullYear() || new Date().getFullYear();
        const payAmt = Number(invObj ? invObj.total_amount : 0);
        if (payAmt > 0) {
          supa.from('accounting_journal').insert({
            id: `bh_inv_${invoiceId}_${Date.now()}`,
            jahr: payYear,
            datum: datum,
            beleg_nr: beleg || `RE-${invoiceId}`,
            beschreibung: `Zahlung Rechnung ${invoiceId} ${invObj ? invObj.name || '' : ''}`.trim(),
            konto_soll: sollKonto,
            konto_haben: habenKonto,
            betrag: payAmt,
            typ: 'Rechnung',
            created_at: new Date().toISOString()
          }).then(({ error }) => {
            if (error) console.warn('[Rechnungen -> FiBu] Supabase journal insert error:', error);
            else console.log('✅ Rechnungszahlung direkt in Supabase FiBu gebucht.');
          }).catch(e => console.warn('[Rechnungen -> FiBu] Journal insert exception:', e));
        }
      }
    } catch (supaErr) {
      console.warn("⚠️ Supabase savePayment Warning:", supaErr);
    }
  }

  // 2. Dual-Write: Asynchrone Spiegelung an Google Apps Script & Buchhaltung
  const payload = {
    action: 'saveZahlung',
    invoiceId: invoiceId,
    datum: datum,
    methode: methode,
    beleg: beleg || `PAY-${invoiceId}`,
    skipBooking: !syncBookkeeping
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Fehler beim Speichern der Zahlung.");
    }
    
    // Lazy sync after 1500ms
    setTimeout(async () => {
      await loadRechnungenData(true);
    }, 1500);
  } catch (err) {
    console.error("❌ Optimistic Save Payment failed:", err);
    // Revert optimistic update!
    if (invIndex !== -1 && oldInv) {
      window._invoices[invIndex] = oldInv;
      window.renderRechnungen();
    }
    alert("❌ Fehler beim Speichern der Zahlung (Revert durchgeführt): " + err.message);
  }
};


// PDF GENERATION ONLY
window.rnGeneratePDFOnly = async function(invoiceId, name) {
  showLoadingOverlay(`Generiere QR-Rechnung PDF für ${name}...`);
  
  const inv = window._invoices.find(i => String(i.id) === String(invoiceId));
  if (!inv) {
    hideLoadingOverlay();
    alert("❌ Rechnung nicht gefunden.");
    return;
  }

  // Externe Kontakte laden, falls noch nicht im Speicher
  if ((!window._externalContacts || window._externalContacts.length === 0) && typeof loadInvoiceContactsData === 'function') {
    try { await loadInvoiceContactsData(); } catch (_) {}
  }

  const recipient = (typeof rnGetRecipientForInvoice === 'function')
    ? rnGetRecipientForInvoice(inv)
    : {
        vorname: inv.name.split(' ')[0] || '',
        nachname: inv.name.split(' ').slice(1).join(' ') || '',
        strasse: '', plz: '', ort: '', email: ''
      };

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender(inv.type || 'Jahresbeitrag')
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType(inv.type || 'Jahresbeitrag') : null);

  const layout = (window._invoiceLayouts && window._invoiceLayouts[inv.type]) || null;

  const payload = {
    action: 'generateInvoicePDF',
    invoiceId: invoiceId,
    recipient: recipient,
    sender: sender,
    layout: layout
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess("🎉 PDF erfolgreich generiert!");
      if (result.pdfBase64) {
        openPdfBase64(result.pdfBase64);
      } else if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      }

      // Supabase State Update (pdf_url persistieren)
      const supa = (typeof getRechnungenSupabaseClient === 'function') ? getRechnungenSupabaseClient() : null;
      if (supa && result.pdfUrl) {
        try {
          await supa.from('invoices').update({
            pdf_url: result.pdfUrl,
            updated_at: new Date().toISOString()
          }).eq('id', invoiceId);
        } catch (e) { console.warn("Supabase pdf_url update:", e); }
      }

      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "Generierung fehlgeschlagen.");
    }
  } catch (err) {
    alert("❌ PDF Fehler: " + err.message);
  } finally {
    hideLoadingOverlay();
  }
};

// =====================================================================
// MODAL FOR SENDING INVOICE WITH ATTACHED SWISS QR-BILL PDF
// =====================================================================
window.rnOpenSendMailModal = async function(invoiceId, name) {
  const inv = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
  if (!inv) {
    alert("Rechnung nicht gefunden: " + invoiceId);
    return;
  }

  // Externe Kontakte laden, falls noch nicht im Speicher
  if ((!window._externalContacts || window._externalContacts.length === 0) && typeof loadInvoiceContactsData === 'function') {
    try { await loadInvoiceContactsData(); } catch (_) {}
  }

  const recipient = (typeof rnGetRecipientForInvoice === 'function')
    ? rnGetRecipientForInvoice(inv)
    : {
        vorname: inv.name.split(' ')[0] || '',
        nachname: inv.name.split(' ').slice(1).join(' ') || '',
        strasse: '', plz: '', ort: '', email: ''
      };

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender(inv.type || 'Jahresbeitrag')
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType(inv.type || 'Jahresbeitrag') : null);

  const senderEmail = (sender && sender.email) ? sender.email : 'kassier@sportschuetzen-muhen.ch';
  const senderName = (sender && (sender.vorname || sender.nachname))
    ? `${sender.vorname || ''} ${sender.nachname || ''}`.trim()
    : ((sender && sender.verein) || 'Sportschützen Muhen');

  // Layouts aus Speicher oder Defaults laden
  let layoutsMap = window._invoiceLayouts;
  if (!layoutsMap || Object.keys(layoutsMap).length === 0) {
    if (typeof rnGetDefaultLayouts === 'function') {
      layoutsMap = rnGetDefaultLayouts();
    }
    try {
      const stored = localStorage.getItem('portal_invoice_layouts');
      if (stored) {
        layoutsMap = { ...(layoutsMap || {}), ...JSON.parse(stored) };
      }
    } catch (_) {}
  }

  const layout = (layoutsMap && layoutsMap[inv.type]) 
    || (layoutsMap && layoutsMap['Sonstige'])
    || (typeof rnGetDefaultLayouts === 'function' ? (rnGetDefaultLayouts()[inv.type] || rnGetDefaultLayouts()['Sonstige']) : {})
    || {};

  const replaceMailVars = (str) => {
    let res = String(str || '')
      .replace(/{vorname}/g, recipient.vorname || '')
      .replace(/{nachname}/g, recipient.nachname || '')
      .replace(/{anrede}/g, recipient.anrede || '')
      .replace(/{firma}/g, recipient.firma || '')
      .replace(/{abteilung}/g, recipient.abteilung || '')
      .replace(/{rechnungsnummer}/g, inv.id)
      .replace(/{rechnungsjahr}/g, String(inv.year || ''))
      .replace(/{gesamtbetrag}/g, Number(inv.total_amount || 0).toFixed(2))
      .replace(/{rechnungsdatum}/g, inv.created_at ? String(inv.created_at).split(' ')[0] : '')
      .replace(/{iban}/g, typeof VEREIN_IBAN !== 'undefined' ? VEREIN_IBAN : '')
      .replace(/{absender_name}/g, senderName)
      .replace(/{absender_email}/g, senderEmail)
      .replace(/{absender_vorname}/g, (sender && sender.vorname) || '')
      .replace(/{absender_nachname}/g, (sender && sender.nachname) || '')
      .replace(/{absender_verein}/g, (sender && sender.verein) || 'Sportschützen Muhen')
      .replace(/{absender_funktion}/g, (sender && sender.funktion) || 'Vorstand');
    return res.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+,/g, ',');
  };

  // Vorlage-Betreff und Vorlage-Body 1:1 aus der Vorlage übernehmen und Variablen einsetzen
  const cleanSubjNum = String(inv.id || '').replace(/^RE[-_]?/i, '') || String(inv.id || '');
  let defaultSubject = layout.mail_subject
    ? replaceMailVars(layout.mail_subject)
        .replace(new RegExp('Rechnung\\s+' + String(inv.id || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), 'Rechnung ' + cleanSubjNum)
        .replace(/Rechnung\s+RE[-_]/gi, 'Rechnung ')
        .replace(/\bRE-(\d)/gi, '$1')
    : `Rechnung ${cleanSubjNum} – ${inv.type || 'Rechnung'} | Sportschützen Muhen`;

  let defaultBody = layout.mail_body
    ? replaceMailVars(layout.mail_body)
    : replaceMailVars('Guten Tag {vorname} {nachname},\n\nanbei erhalten Sie die Rechnung {rechnungsnummer} über CHF {gesamtbetrag}.\n\nDen QR-Zahlteil finden Sie im PDF-Anhang.\n\nFreundliche Grüsse\nSportschützen Muhen');

  window._rnmDefaultSubject = defaultSubject;
  window._rnmDefaultBody = defaultBody;

  let modalEl = document.getElementById('rnModalSendInvoiceMail');
  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.id = 'rnModalSendInvoiceMail';
  modalEl.className = 'modal fade';
  modalEl.tabIndex = -1;
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(modalEl);

  const cleanRecipientName = escapeHtml(inv.name || name || 'Empfänger');
  const targetEmailVal = recipient.email || '';
  const cleanPdfId = String(inv.id || '').replace(/^RE[-_]?/i, '') || String(inv.id || '');
  const pdfFilename = `Rechnung_${cleanPdfId}_${escapeHtml(String(inv.name || 'Empfaenger').replace(/\s+/g, '_'))}.pdf`;

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow" style="position: relative;">
        
        <!-- Modal Header mit Move & Maximize -->
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
          <h5 class="modal-title fw-bold mb-0">
            <i class="fas fa-paper-plane me-2"></i>QR-Rechnung per E-Mail versenden
          </h5>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm text-white p-1 border-0 shadow-none rn-modal-maximize-btn" title="Maximieren / Wiederherstellen" style="opacity: 0.85; line-height: 1;">
              <i class="fas fa-expand"></i>
            </button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
          </div>
        </div>

        <div class="modal-body p-4">
          
          <!-- Rechnungs-Info Leiste -->
          <div class="d-flex flex-wrap align-items-center justify-content-between p-3 bg-light rounded-3 border mb-4 gap-2">
            <div>
              <span class="text-muted small">Empfänger:</span>
              <div class="fw-bold text-dark fs-6">${cleanRecipientName}</div>
              <div class="text-muted font-monospace" style="font-size: 11px;">
                Rechnungs-ID: <strong class="text-primary">${inv.id}</strong> · Typ: <strong>${escapeHtml(inv.type || 'Rechnung')}</strong>
              </div>
            </div>
            <div class="text-end">
              <span class="text-muted small">Rechnungsbetrag:</span>
              <div class="fw-bold fs-5 text-primary font-monospace">${fmtChf(inv.total_amount)}</div>
              <span class="badge ${inv.status === 'bezahlt' ? 'bg-success' : 'bg-warning text-dark'}">${inv.status === 'bezahlt' ? 'Bereits bezahlt' : 'Offen'}</span>
            </div>
          </div>

          <form id="rn-send-mail-form" onsubmit="event.preventDefault(); rnExecuteSendMail('${inv.id}');">
            <div class="row g-3">
              
              <!-- Empfänger E-Mail -->
              <div class="col-md-7">
                <label class="form-label fw-bold small text-muted">
                  Empfänger E-Mail-Adresse <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-white"><i class="fas fa-at text-muted"></i></span>
                  <input type="email" class="form-control fw-bold" id="rnm-email" required value="${escapeHtml(targetEmailVal)}" placeholder="name@beispiel.ch">
                </div>
                <div class="form-text text-muted" style="font-size: 11px;">
                  ${recipient.email ? '<i class="fas fa-check-circle text-success me-1"></i>Aus Mitglieds-/Kontaktdaten übernommen' : '<i class="fas fa-exclamation-circle text-warning me-1"></i>Keine E-Mail hinterlegt – bitte eingeben'}
                </div>
              </div>

              <!-- Absender -->
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Absender</label>
                <div class="input-group">
                  <span class="input-group-text bg-light"><i class="fas fa-user-shield text-muted"></i></span>
                  <input type="text" class="form-control bg-light" readonly value="${escapeHtml(senderName)} <${escapeHtml(senderEmail)}>">
                </div>
                <div class="form-text text-muted" style="font-size: 11px;">
                  Zustelladresse des Vorstands
                </div>
              </div>

              <!-- Betreff -->
              <div class="col-12">
                <label class="form-label fw-bold small text-muted">
                  E-Mail Betreff <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-white"><i class="fas fa-heading text-muted"></i></span>
                  <input type="text" class="form-control fw-semibold" id="rnm-subject" required value="${escapeHtml(defaultSubject)}">
                </div>
              </div>

              <!-- Hauptbereich: Vollständiger E-Mail Nachrichtentext mit Tabs (Bearbeiten / Vorschau) -->
              <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                  <label class="form-label fw-bold small text-muted mb-0">
                    <i class="fas fa-envelope-open-text me-1 text-primary"></i>E-Mail Nachrichtentext
                  </label>
                  
                  <div class="d-flex align-items-center gap-1.5">
                    <button type="button" class="btn btn-xs btn-outline-secondary py-1 px-2" onclick="rnmResetTemplate()" title="Setzt Text und Betreff auf die Standard-Vorlage für diesen Typ zurück">
                      <i class="fas fa-undo me-1"></i>Vorlage neu laden
                    </button>
                    <div class="btn-group btn-group-sm" role="group">
                      <button type="button" id="rnm-tab-edit" class="btn btn-xs btn-primary active px-2.5 py-1 fw-bold" onclick="rnmSwitchTab('edit')">
                        <i class="fas fa-edit me-1"></i>Bearbeiten
                      </button>
                      <button type="button" id="rnm-tab-prev" class="btn btn-xs btn-light border px-2.5 py-1 text-dark" onclick="rnmSwitchTab('prev')">
                        <i class="fas fa-eye me-1"></i>E-Mail-Vorschau
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Pane 1: Vollständiger Text-Editor -->
                <div id="rnm-pane-edit">
                  <textarea class="form-control font-monospace" id="rnm-mail-body" rows="9" style="font-size: 13px; line-height: 1.5;" placeholder="Vollständiger Nachrichtentext...">${escapeHtml(defaultBody)}</textarea>
                  <div class="form-text text-muted d-flex justify-content-between" style="font-size: 11px;">
                    <span><i class="fas fa-info-circle me-1"></i>Vollständiger E-Mail-Text aus der Vorlage ('${escapeHtml(inv.type || 'Sonstige')}'). Kann vor dem Senden frei angepasst werden.</span>
                  </div>
                </div>

                <!-- Pane 2: Live HTML-Vorschau -->
                <div id="rnm-pane-prev" class="d-none border rounded-3 p-3 bg-light shadow-2xs" style="min-height: 200px; max-height: 320px; overflow-y: auto;">
                  <div class="bg-white p-3 rounded-2 border shadow-xs" style="max-width: 600px; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif;">
                    <div class="d-flex align-items-center border-bottom pb-2 mb-3 gap-2">
                      <img src="https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-192.png" width="40" height="40" class="rounded" alt="Logo">
                      <div>
                        <div class="fw-bold text-dark" style="font-size: 14px; line-height: 1.2;">Sportschützen Muhen</div>
                        <div class="text-muted" style="font-size: 11px;">Rechnungsversand</div>
                      </div>
                    </div>
                    <div class="text-muted small mb-2 font-monospace" style="font-size: 11px;">
                      <strong>Betreff:</strong> <span id="rnm-preview-subject">${escapeHtml(defaultSubject)}</span>
                    </div>
                    <hr class="my-2 opacity-50">
                    <div id="rnm-preview-body-content" class="pt-3"></div>
                  </div>
                </div>

              </div>

              <!-- Anhang Badge -->
              <div class="col-12">
                <div class="p-3 bg-light rounded-3 border d-flex align-items-center justify-content-between">
                  <div class="d-flex align-items-center">
                    <div class="me-3 p-2 bg-white rounded border text-danger">
                      <i class="fas fa-file-pdf fa-2x"></i>
                    </div>
                    <div>
                      <strong class="d-block text-dark small">${pdfFilename}</strong>
                      <span class="text-muted" style="font-size: 11px;">
                        <i class="fas fa-qrcode text-dark me-1"></i>Offizielle Schweizer QR-Rechnung mit QR-Zahlteil und Einzahlungsschein
                      </span>
                    </div>
                  </div>
                  <span class="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1.5 rounded-pill">
                    <i class="fas fa-paperclip me-1"></i>Wird automatisch angehängt
                  </span>
                </div>
              </div>

            </div>

            <!-- Fehlermeldungs-Container -->
            <div id="rnm-error-alert" class="alert alert-danger d-none mt-3 mb-0" role="alert"></div>

            <div class="modal-footer px-0 pb-0 pt-4 border-top mt-4 d-flex justify-content-between">
              <button type="button" class="btn btn-light border" data-bs-dismiss="modal">
                Abbrechen
              </button>
              <button type="submit" class="btn btn-primary fw-bold px-4 shadow-sm" id="rnm-btn-submit">
                <i class="fas fa-paper-plane me-1.5"></i>Jetzt verbindlich senden
              </button>
            </div>
          </form>

        </div>

        <!-- Resize-Grip Ecke unten rechts -->
        <div class="rn-modal-resizer" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;" title="Grösse durch Ziehen verändern">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M11 1v10H1V11h10z M11 5v6H5V11h6z M11 9v2H9V11h2z"/></svg>
        </div>

      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  rnMakeModalMovableAndResizable(modalEl);
};

// Hilfsfunktionen für Mail-Modal Tabs und Vorlagen-Reset
window.rnmSwitchTab = function(mode) {
  const editTab = document.getElementById('rnm-tab-edit');
  const prevTab = document.getElementById('rnm-tab-prev');
  const editPane = document.getElementById('rnm-pane-edit');
  const prevPane = document.getElementById('rnm-pane-prev');
  const bodyText = document.getElementById('rnm-mail-body')?.value || '';

  if (mode === 'prev') {
    if (editTab) {
      editTab.classList.remove('active', 'btn-primary');
      editTab.classList.add('btn-light', 'text-dark', 'border');
    }
    if (prevTab) {
      prevTab.classList.add('active', 'btn-primary');
      prevTab.classList.remove('btn-light', 'text-dark', 'border');
    }
    if (editPane) editPane.classList.add('d-none');
    if (prevPane) prevPane.classList.remove('d-none');

    const prevContent = document.getElementById('rnm-preview-body-content');
    if (prevContent) {
      const clean = String(bodyText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      const paras = clean.split(/\n\s*\n/);
      const parasHtml = paras.map(p => {
        const withBr = p.split('\n').map(line => escapeHtml(line.trim())).join('<br>');
        return `<p style="margin:0 0 12px 0;line-height:1.6;font-size:13px;color:#333;">${withBr}</p>`;
      }).join('');
      prevContent.innerHTML = parasHtml || '<p class="text-muted fst-italic">Kein Text vorhanden.</p>';
    }
    const subjPrev = document.getElementById('rnm-preview-subject');
    const subjVal = document.getElementById('rnm-subject')?.value || '';
    if (subjPrev) subjPrev.textContent = subjVal;
  } else {
    if (prevTab) {
      prevTab.classList.remove('active', 'btn-primary');
      prevTab.classList.add('btn-light', 'text-dark', 'border');
    }
    if (editTab) {
      editTab.classList.add('active', 'btn-primary');
      editTab.classList.remove('btn-light', 'text-dark', 'border');
    }
    if (prevPane) prevPane.classList.add('d-none');
    if (editPane) editPane.classList.remove('d-none');
    document.getElementById('rnm-mail-body')?.focus();
  }
};

window.rnmResetTemplate = function() {
  if (confirm('Möchtest du den E-Mail-Betreff und den Nachrichtentext auf die Standard-Vorlage zurücksetzen?')) {
    const subjectEl = document.getElementById('rnm-subject');
    const bodyEl = document.getElementById('rnm-mail-body');
    if (subjectEl) subjectEl.value = window._rnmDefaultSubject || '';
    if (bodyEl) bodyEl.value = window._rnmDefaultBody || '';
    window.rnmSwitchTab('edit');
  }
};

window.rnExecuteSendMail = async function(invoiceId) {
  const inv = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
  if (!inv) return;

  const emailInput = document.getElementById('rnm-email');
  const subjectInput = document.getElementById('rnm-subject');
  const bodyInput = document.getElementById('rnm-mail-body');
  const submitBtn = document.getElementById('rnm-btn-submit');
  const errAlert = document.getElementById('rnm-error-alert');

  if (errAlert) { errAlert.classList.add('d-none'); errAlert.textContent = ''; }

  const targetEmail = emailInput ? emailInput.value.trim() : '';
  if (!targetEmail || !targetEmail.includes('@')) {
    if (emailInput) {
      emailInput.classList.add('is-invalid');
      emailInput.focus();
    }
    if (errAlert) {
      errAlert.textContent = 'Bitte eine gültige E-Mail-Adresse angeben.';
      errAlert.classList.remove('d-none');
    }
    return;
  }
  if (emailInput) emailInput.classList.remove('is-invalid');

  const targetSubject = subjectInput ? subjectInput.value.trim() : '';
  const targetBody = bodyInput ? bodyInput.value.trim() : '';

  const recipient = (typeof rnGetRecipientForInvoice === 'function')
    ? rnGetRecipientForInvoice(inv)
    : {
        vorname: inv.name.split(' ')[0] || '',
        nachname: inv.name.split(' ').slice(1).join(' ') || '',
        strasse: '', plz: '', ort: '', email: ''
      };
  recipient.email = targetEmail;

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender(inv.type || 'Jahresbeitrag')
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType(inv.type || 'Jahresbeitrag') : null);

  const baseLayout = (window._invoiceLayouts && window._invoiceLayouts[inv.type]) || {};
  const cleanTargetSubject = (targetSubject || baseLayout.mail_subject || '')
    .replace(/Rechnung\s+RE[-_]/gi, 'Rechnung ')
    .replace(/\bRE-(\d)/gi, '$1');
  const customLayout = Object.assign({}, baseLayout, {
    mail_subject: cleanTargetSubject,
    mail_body: targetBody || baseLayout.mail_body,
    mail_intro: targetBody || baseLayout.mail_intro // Kompatibilität
  });

  const payload = {
    action: 'sendInvoiceEmail',
    invoiceId: invoiceId,
    recipient: recipient,
    sender: sender,
    layout: customLayout
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Sende QR-Rechnung...';
  }

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      const modalEl = document.getElementById('rnModalSendInvoiceMail');
      if (modalEl) {
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
      }
      showSuccess(`🎉 E-Mail erfolgreich an ${targetEmail} versandt!`);
      const targetInv = (window._invoices || []).find(x => String(x.id).trim() === String(invoiceId).trim());
      const sendDateStr = result.sendDate || (typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH'));
      if (targetInv) {
        targetInv.mail_status = 'gesendet';
        targetInv.send_date = sendDateStr;
      }

      // Supabase State Update (mail_status & send_date)
      const supa = (typeof getRechnungenSupabaseClient === 'function') ? getRechnungenSupabaseClient() : null;
      if (supa) {
        try {
          await supa.from('invoices').update({
            mail_status: 'gesendet',
            send_date: new Date().toISOString(),
            pdf_url: result.pdfUrl || targetInv?.pdf_url || '',
            updated_at: new Date().toISOString()
          }).eq('id', invoiceId);
        } catch (e) { console.warn("Supabase mail_status update:", e); }
      }

      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "E-Mail-Versand fehlgeschlagen.");
    }
  } catch (err) {
    console.error("Fehler beim E-Mail-Versand:", err);
    if (errAlert) {
      errAlert.textContent = 'Fehler beim E-Mail-Versand: ' + err.message;
      errAlert.classList.remove('d-none');
    } else {
      alert("❌ E-Mail Fehler: " + err.message);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1.5"></i>Jetzt verbindlich senden';
    }
  }
};

// 100% Abwärtskompatibilität: Aufruf von rnSendMailPrompt öffnet das neue E-Mail-Modal
window.rnSendMailPrompt = async function(invoiceId, name) {
  return rnOpenSendMailModal(invoiceId, name);
};

/**
 * Macht ein Bootstrap-Modal interaktiv frei verschiebbar und in der Grösse veränderbar (verkleinern / vergrössern)
 */
function rnMakeModalMovableAndResizable(modalEl) {
  if (!modalEl) return;
  const dialog = modalEl.querySelector('.modal-dialog');
  const content = modalEl.querySelector('.modal-content');
  const header = modalEl.querySelector('.modal-header');
  const modalBody = modalEl.querySelector('.modal-body');
  const maxBtn = modalEl.querySelector('.rn-modal-maximize-btn');
  const resizer = modalEl.querySelector('.rn-modal-resizer');

  if (!dialog || !content || !header) return;

  header.style.cursor = 'grab';
  header.style.userSelect = 'none';

  if (modalBody) {
    modalBody.style.overflowY = 'auto';
    modalBody.style.maxHeight = 'calc(85vh - 65px)';
  }

  let isDragging = false;
  let isResizing = false;
  let isMaximized = false;
  let savedState = null;
  let startX, startY, initialLeft, initialTop, initialWidth, initialHeight;

  function ensureFixedPosition() {
    const rect = dialog.getBoundingClientRect();
    if (dialog.classList.contains('modal-dialog-centered') || dialog.style.position !== 'fixed') {
      dialog.classList.remove('modal-dialog-centered');
      dialog.style.position = 'fixed';
      dialog.style.margin = '0';
      dialog.style.left = Math.round(rect.left) + 'px';
      dialog.style.top = Math.max(10, Math.round(rect.top)) + 'px';
      dialog.style.width = Math.round(rect.width) + 'px';
      dialog.style.maxWidth = 'none';
      dialog.style.zIndex = '1060';
    }
    return rect;
  }

  // Header Drag (Verschieben bei jeglicher Grösse)
  header.addEventListener('pointerdown', function(e) {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('select')) {
      return;
    }
    if (isMaximized) return;

    e.preventDefault();
    ensureFixedPosition();

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = parseFloat(dialog.style.left) || dialog.getBoundingClientRect().left;
    initialTop = parseFloat(dialog.style.top) || dialog.getBoundingClientRect().top;

    header.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    function onPointerMove(ev) {
      if (!isDragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      const rect = dialog.getBoundingClientRect();
      let nextLeft = initialLeft + dx;
      let nextTop = initialTop + dy;

      nextLeft = Math.max(-rect.width + 120, Math.min(window.innerWidth - 120, nextLeft));
      nextTop = Math.max(0, Math.min(window.innerHeight - 60, nextTop));

      dialog.style.left = Math.round(nextLeft) + 'px';
      dialog.style.top = Math.round(nextTop) + 'px';
    }

    function onPointerUp() {
      isDragging = false;
      header.style.cursor = 'grab';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  // Doppelklick auf Header = Maximieren / Wiederherstellen
  header.addEventListener('dblclick', function(e) {
    if (e.target.closest('button') || e.target.closest('input')) return;
    if (maxBtn) maxBtn.click();
  });

  // Resizing via Grip unten rechts (Verkleinern & Vergrössern)
  if (resizer) {
    resizer.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (isMaximized) return;

      ensureFixedPosition();
      const rect = dialog.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();

      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      initialWidth = rect.width;
      initialHeight = contentRect.height;

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'nwse-resize';

      function onResizeMove(ev) {
        if (!isResizing) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        const currentLeft = parseFloat(dialog.style.left) || rect.left;
        const currentTop = parseFloat(dialog.style.top) || rect.top;

        const maxW = window.innerWidth - currentLeft - 10;
        const maxH = window.innerHeight - currentTop - 10;
        const newW = Math.max(450, Math.min(maxW, initialWidth + dx));
        const newH = Math.max(280, Math.min(maxH, initialHeight + dy));

        dialog.style.width = Math.round(newW) + 'px';
        content.style.height = Math.round(newH) + 'px';
        if (modalBody) {
          modalBody.style.maxHeight = `calc(${Math.round(newH)}px - 62px)`;
        }
      }

      function onResizeUp() {
        isResizing = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('pointermove', onResizeMove);
        window.removeEventListener('pointerup', onResizeUp);
      }

      window.addEventListener('pointermove', onResizeMove);
      window.addEventListener('pointerup', onResizeUp);
    });
  }

  // Button Maximieren / Wiederherstellen
  if (maxBtn) {
    maxBtn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      const icon = maxBtn.querySelector('i');

      if (!isMaximized) {
        const rect = dialog.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        savedState = {
          left: dialog.style.left || (Math.round(rect.left) + 'px'),
          top: dialog.style.top || (Math.round(rect.top) + 'px'),
          width: dialog.style.width || (Math.round(rect.width) + 'px'),
          height: content.style.height || (Math.round(contentRect.height) + 'px'),
          bodyMaxHeight: modalBody ? modalBody.style.maxHeight : ''
        };

        dialog.classList.remove('modal-dialog-centered');
        dialog.style.position = 'fixed';
        dialog.style.margin = '0';
        dialog.style.left = '12px';
        dialog.style.top = '12px';
        dialog.style.width = 'calc(100vw - 24px)';
        dialog.style.maxWidth = 'none';
        content.style.height = 'calc(100vh - 24px)';
        if (modalBody) {
          modalBody.style.maxHeight = 'calc(100vh - 24px - 62px)';
        }
        if (icon) icon.className = 'fas fa-compress';
        maxBtn.title = 'Wiederherstellen';
        isMaximized = true;
      } else {
        if (savedState) {
          dialog.style.left = savedState.left;
          dialog.style.top = savedState.top;
          dialog.style.width = savedState.width;
          content.style.height = savedState.height;
          if (modalBody) {
            modalBody.style.maxHeight = savedState.bodyMaxHeight || 'calc(85vh - 65px)';
          }
        }
        if (icon) icon.className = 'fas fa-expand';
        maxBtn.title = 'Maximieren / Verkleinern';
        isMaximized = false;
      }
    };
  }
}

// ---------------------------------------------------------------------
// CSS für Rechnungspositionen: Pfeile ausblenden & Spaltenbreiten
// ---------------------------------------------------------------------
function rnEnsurePositionsTableStyles() {
  if (document.getElementById('rn-positions-custom-style')) return;
  const style = document.createElement('style');
  style.id = 'rn-positions-custom-style';
  style.textContent = `
    /* Pfeile bei Menge, Einzelpreis und Gesamt komplett entfernen (Webkit & Firefox) */
    .rn-no-spin::-webkit-outer-spin-button,
    .rn-no-spin::-webkit-inner-spin-button,
    input.rnc-pos-qty::-webkit-outer-spin-button,
    input.rnc-pos-qty::-webkit-inner-spin-button,
    input.rnc-pos-unitprice::-webkit-outer-spin-button,
    input.rnc-pos-unitprice::-webkit-inner-spin-button,
    input.rnc-pos-amt::-webkit-outer-spin-button,
    input.rnc-pos-amt::-webkit-inner-spin-button,
    input.rne-pos-qty::-webkit-outer-spin-button,
    input.rne-pos-qty::-webkit-inner-spin-button,
    input.rne-pos-unitprice::-webkit-outer-spin-button,
    input.rne-pos-unitprice::-webkit-inner-spin-button,
    input.rne-pos-amt::-webkit-outer-spin-button,
    input.rne-pos-amt::-webkit-inner-spin-button {
      -webkit-appearance: none !important;
      margin: 0 !important;
    }
    .rn-no-spin,
    input.rnc-pos-qty,
    input.rnc-pos-unitprice,
    input.rnc-pos-amt,
    input.rne-pos-qty,
    input.rne-pos-unitprice,
    input.rne-pos-amt {
      -moz-appearance: textfield !important;
    }

    /* Tabelle: border-collapse separate damit position:relative auf th funktioniert */
    #rnc-positions-table, #rne-positions-table {
      border-collapse: separate !important;
      border-spacing: 0 !important;
      table-layout: fixed !important;
      width: 100% !important;
    }
    #rnc-positions-table th, #rne-positions-table th,
    #rnc-positions-table td, #rne-positions-table td {
      border-bottom: 1px solid #dee2e6 !important;
      border-right: 1px solid #dee2e6 !important;
      box-sizing: border-box !important;
    }
    #rnc-positions-table th:first-child, #rne-positions-table th:first-child,
    #rnc-positions-table td:first-child, #rne-positions-table td:first-child {
      border-left: 1px solid #dee2e6 !important;
    }
    #rnc-positions-table thead th, #rne-positions-table thead th {
      border-top: 1px solid #dee2e6 !important;
      position: relative !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------
// Spaltenbreiten der Rechnungspositionen-Tabelle anpassbar machen & in localStorage speichern
// ---------------------------------------------------------------------
const RN_POS_COL_WIDTHS_STORAGE_KEY = 'rn_positions_table_col_widths_v2';
const RN_DEFAULT_POS_COL_WIDTHS = {
  idx: 38,
  desc: 380,
  qty: 75,
  unitprice: 150,
  amt: 150,
  konto: 140,
  action: 45
};

function rnApplyPositionsTableColWidths(tableEl) {
  if (!tableEl) return;
  rnEnsurePositionsTableStyles();

  tableEl.style.borderCollapse = 'separate';
  tableEl.style.borderSpacing = '0';
  tableEl.style.tableLayout = 'fixed';

  let savedWidths = {};
  try {
    const raw = localStorage.getItem(RN_POS_COL_WIDTHS_STORAGE_KEY);
    if (raw) savedWidths = JSON.parse(raw) || {};
  } catch (e) {}

  const ths = tableEl.querySelectorAll('thead th[data-col]');
  ths.forEach(th => {
    th.style.position = 'relative';
    th.style.overflow = 'visible';
    th.style.boxSizing = 'border-box';
    const col = th.getAttribute('data-col');
    if (!col) return;
    const width = (savedWidths && typeof savedWidths[col] === 'number' && savedWidths[col] > 25)
      ? savedWidths[col]
      : RN_DEFAULT_POS_COL_WIDTHS[col];

    if (width) {
      th.style.width = width + 'px';
      th.style.minWidth = width + 'px';
      th.style.maxWidth = width + 'px';
    }
  });
}
window.rnApplyPositionsTableColWidths = rnApplyPositionsTableColWidths;

function rnSavePositionsTableColWidths(tableEl) {
  if (!tableEl) return;
  try {
    const ths = tableEl.querySelectorAll('thead th[data-col]');
    let saved = {};
    try {
      const raw = localStorage.getItem(RN_POS_COL_WIDTHS_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) || {};
    } catch (e) {}

    ths.forEach(th => {
      const col = th.getAttribute('data-col');
      if (col && th.style.width && th.style.width !== 'auto') {
        const val = parseInt(th.style.width, 10);
        if (!isNaN(val) && val > 25) {
          saved[col] = val;
        }
      }
    });
    localStorage.setItem(RN_POS_COL_WIDTHS_STORAGE_KEY, JSON.stringify(saved));
  } catch (e) {
    console.warn('Fehler beim Speichern der Spaltenbreiten:', e);
  }
}
window.rnSavePositionsTableColWidths = rnSavePositionsTableColWidths;

function rnResetPositionsTableColWidths(btnEl) {
  try {
    localStorage.removeItem(RN_POS_COL_WIDTHS_STORAGE_KEY);
  } catch (e) {}
  const modal = btnEl ? btnEl.closest('.modal') : null;
  const table = modal ? modal.querySelector('table[id$="-positions-table"]') : null;
  if (table) {
    rnApplyPositionsTableColWidths(table);
  }
}
window.rnResetPositionsTableColWidths = rnResetPositionsTableColWidths;

function rnInitPositionsTableResizable(tableEl) {
  if (!tableEl) return;

  rnApplyPositionsTableColWidths(tableEl);

  const resizableCols = ['desc', 'qty', 'unitprice', 'amt', 'konto'];
  const ths = tableEl.querySelectorAll('thead th[data-col]');

  ths.forEach(th => {
    const col = th.getAttribute('data-col');
    if (!resizableCols.includes(col)) return;
    if (th.querySelector('.rn-col-resizer')) return;

    th.style.position = 'relative';
    th.style.overflow = 'visible';

    const resizer = document.createElement('div');
    resizer.className = 'rn-col-resizer';
    resizer.style.cssText = 'position:absolute; top:0; bottom:0; right:-6px; width:12px; height:100%; min-height:36px; cursor:col-resize; user-select:none; z-index:25; display:flex; align-items:center; justify-content:center; touch-action:none;';
    resizer.title = 'Spaltenbreite anpassen (Ziehen zum Ändern, Doppelklick zum Zurücksetzen)';

    const handleLine = document.createElement('div');
    handleLine.style.cssText = 'width:2px; height:80%; background-color:#94a3b8; border-radius:1px; pointer-events:none; opacity:0.6; transition:opacity 0.15s, background-color 0.15s, width 0.15s;';
    resizer.appendChild(handleLine);

    resizer.addEventListener('mouseenter', () => {
      handleLine.style.opacity = '1';
      handleLine.style.backgroundColor = '#0d6efd';
      handleLine.style.width = '3px';
      resizer.style.zIndex = '30';
    });
    resizer.addEventListener('mouseleave', () => {
      if (!resizer.dataset.dragging) {
        handleLine.style.opacity = '0.6';
        handleLine.style.backgroundColor = '#94a3b8';
        handleLine.style.width = '2px';
        resizer.style.zIndex = '25';
      }
    });

    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      startX = e.pageX;
      startWidth = th.getBoundingClientRect().width;
      resizer.dataset.dragging = 'true';
      handleLine.style.opacity = '1';
      handleLine.style.backgroundColor = '#0d6efd';
      handleLine.style.width = '3px';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const minWidth = (col === 'desc') ? 120 : (col === 'qty' ? 45 : 80);

      const onMouseMove = (ev) => {
        const diff = ev.pageX - startX;
        const newWidth = Math.max(minWidth, Math.round(startWidth + diff));
        th.style.width = newWidth + 'px';
        th.style.minWidth = newWidth + 'px';
        th.style.maxWidth = newWidth + 'px';
      };

      const onMouseUp = () => {
        delete resizer.dataset.dragging;
        handleLine.style.opacity = '0.6';
        handleLine.style.backgroundColor = '#94a3b8';
        handleLine.style.width = '2px';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        rnSavePositionsTableColWidths(tableEl);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    resizer.addEventListener('mousedown', onMouseDown);

    resizer.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const def = RN_DEFAULT_POS_COL_WIDTHS[col] || 150;
      th.style.width = def + 'px';
      th.style.minWidth = def + 'px';
      th.style.maxWidth = def + 'px';
      try {
        const raw = localStorage.getItem(RN_POS_COL_WIDTHS_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          delete saved[col];
          localStorage.setItem(RN_POS_COL_WIDTHS_STORAGE_KEY, JSON.stringify(saved));
        }
      } catch (err) {}
    });

    th.appendChild(resizer);
  });
}
window.rnInitPositionsTableResizable = rnInitPositionsTableResizable;

// Hilfsfunktionen für sortierte Empfänger & Buchstabensuche
window._rnShowInactiveMembers = false;

window.rnIsMemberDeceased = function(m) {
  if (!m) return false;
  const dec = m.Deceased;
  return dec == 1 || dec === true || dec === '1' ||
         String(dec).toLowerCase() === 'true' ||
         (Boolean(m.Todesdatum) && String(m.Todesdatum).trim() !== '' && String(m.Todesdatum).trim() !== '–' && String(m.Todesdatum).trim() !== 'null') ||
         String(m.Status || '').toLowerCase().includes('verstorben');
};

window.rnIsMemberExited = function(m) {
  if (!m) return false;
  const isDateSet = (v) => {
    if (!v) return false;
    const s = String(v).trim().toLowerCase();
    return s !== '' && s !== '–' && s !== 'null' && s !== 'undefined' && s !== 'false' && s !== '0';
  };
  return isDateSet(m.Vereinsaustritt) ||
         isDateSet(m.ExitDate) ||
         (m.IsActive !== undefined && m.IsActive !== null && (m.IsActive == 0 || m.IsActive === false || m.IsActive === '0' || String(m.IsActive).toLowerCase() === 'false')) ||
         String(m.Status || '').toLowerCase().includes('ausgetreten') ||
         String(m.Status || '').toLowerCase().includes('ehemalig') ||
         String(m.Status || '').toLowerCase().includes('inaktiv');
};

window.rnToggleInactiveMembers = function(show) {
  window._rnShowInactiveMembers = Boolean(show);
  const searchInput = document.getElementById('rnc-recipient-search');
  const sel = document.getElementById('rnc-member-select');
  const currentVal = sel ? sel.value : null;
  window.rnPopulateRecipientSelect(searchInput ? searchInput.value : '', currentVal);
};

window.rnPopulateRecipientSelect = function(filterQuery = '', preserveSelectedValue = null) {
  const memberSelectEl = document.getElementById('rnc-member-select');
  if (!memberSelectEl) return;

  const currentVal = preserveSelectedValue !== null ? preserveSelectedValue : memberSelectEl.value;
  const q = String(filterQuery || '').trim().toLowerCase();
  const showInactiveSwitch = document.getElementById('rnc-show-inactive-members');
  const showInactive = showInactiveSwitch ? showInactiveSwitch.checked : Boolean(window._rnShowInactiveMembers);

  // 1. Externe Kontakte sortieren nach Firma bzw. Nachname, Vorname A - Z (ERSTE GRUPPE)
  const getContactSortKey = (c) => {
    if (c.typ === 'firma' || (!c.nachname && !c.vorname && c.firma)) {
      return (c.firma || c.name || '').trim();
    }
    const ln = (c.nachname || '').trim();
    const fn = (c.vorname || '').trim();
    if (ln || fn) return `${ln} ${fn}`.trim();
    return (c.firma || c.name || `ID-${c.id}`).trim();
  };

  const sortedExternals = [...(window._externalContacts || [])].sort((a, b) => {
    const na = getContactSortKey(a);
    const nb = getContactSortKey(b);
    return na.localeCompare(nb, 'de', { sensitivity: 'base' });
  });

  // 2. Vereinsmitglieder (aus Members100 via rnGetMembersList) sortieren nach Nachname, Vorname A - Z (ZWEITE GRUPPE)
  const memberSource = typeof window.rnGetMembersList === 'function'
    ? window.rnGetMembersList()
    : (window._mglData || []);

  const sortedMembers = [...memberSource]
    .filter(m => {
      const isDeceased = window.rnIsMemberDeceased(m);
      const isExited = window.rnIsMemberExited(m);
      if (!showInactive && (isDeceased || isExited)) {
        // Falls aktuell genau dieses Mitglied gewählt ist, im Dropdown erhalten
        if (currentVal && currentVal === `MBR:${m.PersonNumber}`) return true;
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const na = `${(a.LastName || '').trim()} ${(a.FirstName || '').trim()}`.trim();
      const nb = `${(b.LastName || '').trim()} ${(b.FirstName || '').trim()}`.trim();
      return na.localeCompare(nb, 'de', { sensitivity: 'base' });
    });

  // 3. Filtern nach Suchbegriff (Buchstabensuche: Name, Vorname, Firma, PersonNumber, Ort, E-Mail)
  const filteredExternals = sortedExternals.filter(c => {
    if (!q) return true;
    const name = String(c.name || '').toLowerCase();
    const fn = String(c.vorname || '').toLowerCase();
    const ln = String(c.nachname || '').toLowerCase();
    const firma = String(c.firma || '').toLowerCase();
    const id = String(c.id || '').toLowerCase();
    const em = String(c.email || '').toLowerCase();
    const kat = String(c.kategorie || '').toLowerCase();
    const city = String(c.ort || '').toLowerCase();
    return name.includes(q) || fn.includes(q) || ln.includes(q) || `${ln} ${fn}`.includes(q) || `${fn} ${ln}`.includes(q) || firma.includes(q) || id.includes(q) || em.includes(q) || kat.includes(q) || city.includes(q);
  });

  const filteredMembers = sortedMembers.filter(m => {
    if (!q) return true;
    const ln = String(m.LastName || '').toLowerCase();
    const fn = String(m.FirstName || '').toLowerCase();
    const pn = String(m.PersonNumber || '').toLowerCase();
    const an = String(m.AddressNumber || '').toLowerCase();
    const em = String(m.PrimaryEmail || m.Email || '').toLowerCase();
    const city = String(m.City || m.Ort || '').toLowerCase();
    return ln.includes(q) || fn.includes(q) || `${ln} ${fn}`.includes(q) || `${fn} ${ln}`.includes(q) || pn.includes(q) || an.includes(q) || em.includes(q) || city.includes(q);
  });

  const externalOptions = filteredExternals.map(c => {
    const isFirma = c.typ === 'firma' || Boolean(c.firma);
    const label = (typeof window.rnGetContactDisplayName === 'function')
      ? window.rnGetContactDisplayName(c)
      : (c.firma || [c.nachname, c.vorname].filter(Boolean).join(' ') || c.name || `Kontakt #${c.id}`);
    const kat = c.kategorie ? ` [${c.kategorie}]` : '';
    const extra = c.ort ? ` · ${c.ort}` : (c.email ? ` · ${c.email}` : '');
    return `<option value="EXT:${c.id}">${isFirma ? '🏢 ' : '👤 '}${escapeHtml(label)}${kat} (EXT-${c.id}${escapeHtml(extra)})</option>`;
  }).join('');

  const memberOptions = filteredMembers.map(m => {
    const isDeceased = window.rnIsMemberDeceased(m);
    const isExited = !isDeceased && window.rnIsMemberExited(m);
    let tag = '';
    if (isDeceased) tag = ' [† Verstorben]';
    else if (isExited) tag = ' [Ausgetreten]';
    const cityInfo = (m.City || m.Ort) ? ` · ${m.City || m.Ort}` : '';
    return `<option value="MBR:${m.PersonNumber}">👤 ${escapeHtml(m.LastName || '')} ${escapeHtml(m.FirstName || '')}${tag} (Nr: ${escapeHtml(m.PersonNumber || '')}${escapeHtml(cityInfo)})</option>`;
  }).join('');

  const totalCount = filteredMembers.length + filteredExternals.length;
  const isMembersLoading = memberSource.length === 0 && Boolean(window._mglLoadPromise);
  const isContactsLoading = (window._externalContacts || []).length === 0 && Boolean(window._externalContactsPromise);

  let placeholderText = totalCount > 0 
    ? `-- Bitte Empfänger auswählen (${totalCount} Kontakte: ${filteredExternals.length} externe, ${filteredMembers.length} Mitglieder) --`
    : (isMembersLoading 
        ? '⏳ Externe Kontakte geladen – Vereinsmitglieder werden abgerufen...' 
        : (filteredExternals.length > 0 
            ? `-- Bitte Empfänger auswählen (${filteredExternals.length} externe Kontakte verfügbar) --` 
            : '-- Bitte Empfänger auswählen --'));
  let html = `<option value="">${placeholderText}</option>`;

  // ZUERST: Externe Empfänger A–Z
  if (filteredExternals.length > 0) {
    html += `
      <optgroup label="🏢 Externe Empfänger / Kontakte (${filteredExternals.length})">
        ${externalOptions}
      </optgroup>
    `;
  }

  // DANACH: Eigene Vereinsmitglieder A–Z
  if (filteredMembers.length > 0) {
    const groupLabel = showInactive 
      ? `👥 Vereinsmitglieder (inkl. ehem. & verstorben: ${filteredMembers.length})` 
      : `👥 Vereinsmitglieder (${filteredMembers.length})`;
    html += `
      <optgroup label="${groupLabel}">
        ${memberOptions}
      </optgroup>
    `;
  } else if (isMembersLoading) {
    html += `
      <optgroup label="👥 Vereinsmitglieder (wird geladen...)">
        <option value="" disabled>⏳ Vereinsmitglieder werden vom Server geladen...</option>
      </optgroup>
    `;
  }

  if (filteredExternals.length === 0 && filteredMembers.length === 0) {
    if (isMembersLoading || isContactsLoading) {
      html += `<option value="" disabled>⏳ Empfängerdaten werden geladen...</option>`;
    } else {
      html += `<option value="" disabled>⚠️ Kein Empfänger für "${escapeHtml(q)}" gefunden</option>`;
    }
  }

  memberSelectEl.innerHTML = html;

  if (currentVal && memberSelectEl.querySelector(`option[value="${currentVal}"]`)) {
    memberSelectEl.value = currentVal;
  } else if (!currentVal) {
    memberSelectEl.value = "";
  }

  const hintEl = document.getElementById('rnc-search-count-hint');
  if (hintEl) {
    if (q) {
      hintEl.style.display = 'inline-block';
      hintEl.innerHTML = `<i class="fas fa-filter me-1 text-primary"></i>${filteredMembers.length + filteredExternals.length} Treffer (${filteredExternals.length} extern, ${filteredMembers.length} Mgl)`;
    } else {
      hintEl.style.display = 'none';
      hintEl.innerHTML = '';
    }
  }
};

// Automatischer Re-Render wenn Mitgliederdaten im Hintergrund fertig eintreffen
if (!window._rnMitgliederLoadedListenerAdded) {
  window._rnMitgliederLoadedListenerAdded = true;
  window.addEventListener('mitglieder-loaded', () => {
    const memberSelectEl = document.getElementById('rnc-member-select');
    if (memberSelectEl && typeof window.rnPopulateRecipientSelect === 'function') {
      const searchInput = document.getElementById('rnc-recipient-search');
      window.rnPopulateRecipientSelect(searchInput ? searchInput.value : '', memberSelectEl.value);
    }
  });
}

window.rnFilterRecipientSelect = function(query) {
  window.rnPopulateRecipientSelect(query);
};

window.rnClearRecipientSearch = function() {
  const searchInput = document.getElementById('rnc-recipient-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  window.rnPopulateRecipientSelect('');
};

window.rnSelectFirstFilteredRecipient = function() {
  const sel = document.getElementById('rnc-member-select');
  if (!sel) return;
  const firstOption = sel.querySelector('optgroup option');
  if (firstOption && firstOption.value) {
    sel.value = firstOption.value;
    if (typeof window.rnHandleMemberSelect === 'function') {
      window.rnHandleMemberSelect(sel.value);
    }
  }
};

// CREATE MANUALLY INVOICE MODAL
window.rnOpenCreateModal = async function(btnEl) {
  let modalEl = document.getElementById('rnModalCreateInvoice');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalCreateInvoice';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  // Externe Kontakte, Mitgliederdaten (Members100) & Standard-Vorlagen sicherstellen
  const loadTasks = [];
  if (typeof window.rnEnsureMembersLoaded === 'function') {
    loadTasks.push(window.rnEnsureMembersLoaded().catch(e => console.warn("Members100 load error:", e)));
  } else if ((!window._mglData || window._mglData.length === 0) && typeof loadMitgliederData === 'function') {
    loadTasks.push(loadMitgliederData(false).catch(e => console.warn("Mitglieder load error:", e)));
  }

  if (typeof window.rnEnsureContactsLoaded === 'function') {
    loadTasks.push(window.rnEnsureContactsLoaded().catch(e => console.warn("Contacts load error:", e)));
  } else if (!window._externalContacts || window._externalContacts.length === 0) {
    loadTasks.push((async () => {
      try {
        const response = await apiFetch('rechnungen', 'action=getContacts');
        const result = await response.json();
        if (result.success) {
          window._externalContacts = result.data || [];
        }
      } catch (err) {
        console.error("⚠️ Fehler beim Laden der externen Kontakte:", err);
      }
    })());
  }

  if (typeof rnInitializeTemplates === 'function') {
    rnInitializeTemplates();
  }

  if (loadTasks.length > 0) {
    let origText = '';
    if (btnEl) {
      origText = btnEl.innerHTML;
      btnEl.disabled = true;
      btnEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Empfänger laden...';
    }
    try {
      await Promise.all(loadTasks);
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = origText;
      }
    }
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-xl" style="max-width: 1100px;">
      <div class="modal-content border-0 rounded-4 shadow" style="position: relative;">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
          <h5 class="modal-title fw-bold mb-0"><i class="fas fa-file-invoice me-2"></i>Neue Rechnung verfassen</h5>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm text-white p-1 border-0 shadow-none rn-modal-maximize-btn" title="Maximieren / Verkleinern" style="opacity: 0.85; line-height: 1;">
              <i class="fas fa-expand"></i>
            </button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body p-4">
          <form id="rn-create-form" onsubmit="rnSaveCreateInvoice(event)">
            <input type="hidden" id="rnc-contact-id" value="">
            
            <!-- Empfänger-Auswahl -->
            <div class="row g-3 mb-3 pb-3 border-bottom">
              <div class="col-md-12">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2 pb-1">
                  <label for="rnc-member-select" class="form-label fw-bold text-dark mb-0" style="font-size: 13.5px;">
                    <i class="fas fa-user-tag me-1.5 text-primary"></i>Empfänger auswählen <span class="text-danger">*</span>
                  </label>
                  <button type="button" class="btn btn-xs btn-outline-primary fw-bold px-2.5 py-1" onclick="rnOpenContactModal()" style="font-size: 12px; border-radius: 6px;">
                    <i class="fas fa-user-plus me-1"></i> + Neuer externer Kontakt erfassen
                  </button>
                </div>

                <!-- Suchfeld für Buchstabensuche -->
                <div class="input-group mb-2 shadow-2xs">
                  <span class="input-group-text bg-white border-end-0 text-muted" style="border-radius: 8px 0 0 8px;">
                    <i class="fas fa-search text-primary"></i>
                  </span>
                  <input type="text" 
                         id="rnc-recipient-search" 
                         class="form-control border-start-0 border-end-0" 
                         style="min-height: 38px; font-size: 13.5px;"
                         placeholder="🔍 Empfänger suchen (Buchstabensuche: Name, Vorname, Firma, Nr...)" 
                         oninput="rnFilterRecipientSelect(this.value)"
                         onkeydown="if(event.key==='Enter'){ event.preventDefault(); rnSelectFirstFilteredRecipient(); }"
                         autocomplete="off">
                  <button class="btn btn-outline-secondary border-start-0" 
                          type="button" 
                          style="border-radius: 0 8px 8px 0;"
                          onclick="rnClearRecipientSearch()" 
                          title="Suche zurücksetzen">
                    <i class="fas fa-times"></i>
                  </button>
                </div>

                <!-- Option: Verstorbene & Ausgetretene einblenden -->
                <div class="d-flex justify-content-between align-items-center mb-2 px-1">
                  <div class="form-check form-switch m-0" style="font-size: 12px;">
                    <input class="form-check-input" type="checkbox" id="rnc-show-inactive-members" onchange="rnToggleInactiveMembers(this.checked)" style="cursor: pointer;">
                    <label class="form-check-label text-muted fw-semibold" for="rnc-show-inactive-members" style="cursor: pointer; user-select: none;">
                      <i class="fas fa-user-clock me-1 text-secondary"></i>Auch ehemalige &amp; verstorbene Mitglieder anzeigen
                    </label>
                  </div>
                  <div id="rnc-search-count-hint" class="text-muted small" style="display: none; font-size: 11.5px;"></div>
                </div>

                <style>
                  #rnc-member-select optgroup {
                    font-weight: 700;
                    color: #0f3a5d;
                    background: #f1f5f9;
                    font-size: 12.5px;
                    padding: 4px;
                  }
                  #rnc-member-select option {
                    font-weight: 500;
                    color: #1e293b;
                    background: #ffffff;
                    padding: 4px 6px;
                    font-size: 13.5px;
                  }
                </style>

                <!-- Großzügiges Dropdown -->
                <select class="form-select fw-bold text-primary shadow-sm" 
                        id="rnc-member-select" 
                        required 
                        onchange="rnHandleMemberSelect(this.value)" 
                        style="min-height: 44px; font-size: 14px; border-radius: 8px; border: 1.5px solid #cbd5e1;">
                </select>
              </div>
            </div>

            <!-- Adressdaten (Gesperrt / Readonly Master-Kärtchen) -->
            <div id="rnc-recipient-box" class="p-3 bg-light rounded-3 border mb-4 shadow-2xs">
              <div id="rnc-empty-hint" class="text-muted small text-center py-2">
                <i class="fas fa-info-circle me-1 text-primary"></i> Bitte wählen Sie oben einen Empfänger aus oder erfassen Sie einen neuen Kontakt.
              </div>
              
              <div id="rnc-details-wrap" style="display:none;">
                <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom flex-wrap gap-2">
                  <div class="d-flex gap-1.5 align-items-center">
                    <span class="badge bg-primary px-2 py-1" id="rnc-badge-type"></span>
                    <span class="badge bg-secondary px-2 py-1" id="rnc-badge-kat"></span>
                  </div>
                  <button type="button" class="btn btn-xs btn-outline-secondary" id="rnc-edit-contact-btn" style="display:none;" onclick="rnEditCurrentSelectedContact()">
                    <i class="fas fa-edit me-1"></i> Kontakt in Stammdaten bearbeiten
                  </button>
                </div>

                <div class="row g-2">
                  <div class="col-md-3">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Empfänger-ID / Mgl-Nr</label>
                    <input type="text" class="form-control form-control-sm font-monospace bg-white" id="rnc-person-number" readonly>
                  </div>
                  <div class="col-md-5">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Empfänger (Name / Firma)</label>
                    <input type="text" class="form-control form-control-sm fw-bold bg-white" id="rnc-name" readonly required>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">E-Mail</label>
                    <input type="email" class="form-control form-control-sm bg-white" id="rnc-email" readonly>
                  </div>

                  <div class="col-md-6" id="rnc-contact-person-col" style="display:none;">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Ansprechperson / Kontaktperson</label>
                    <input type="text" class="form-control form-control-sm bg-white" id="rnc-contact-person" readonly>
                  </div>
                  <div class="col-md-6" id="rnc-abteilung-col" style="display:none;">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Abteilung / Zusatz</label>
                    <input type="text" class="form-control form-control-sm bg-white" id="rnc-abteilung" readonly>
                  </div>

                  <div class="col-md-5">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Strasse & Hausnummer</label>
                    <input type="text" class="form-control form-control-sm bg-white" id="rnc-strasse" readonly>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Adresszusatz / Postfach</label>
                    <input type="text" class="form-control form-control-sm bg-white" id="rnc-adresszusatz" readonly>
                  </div>
                  <div class="col-md-2">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">PLZ</label>
                    <input type="text" class="form-control form-control-sm font-monospace bg-white" id="rnc-plz" readonly>
                  </div>
                  <div class="col-md-2">
                    <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Ort (Land)</label>
                    <input type="text" class="form-control form-control-sm bg-white" id="rnc-ort" readonly>
                  </div>
                </div>
              </div>
            </div>

            <!-- Rechnungs-Kopfdaten -->
            <div class="row g-3 mb-4 p-3 bg-light rounded-3 border border-light">
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungsjahr</label>
                <input type="number" class="form-control fw-bold font-monospace" id="rnc-year" required value="${window._bhYear}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungstyp</label>
                <select class="form-select" id="rnc-type" required>
                  <option value="Vermietung" selected>Vermietung</option>
                  <option value="Jahresbeitrag">Jahresbeitrag / Mitglieder</option>
                  <option value="Materialverkauf">Materialverkauf</option>
                  <option value="Depot / Pfand">Depot / Pfand</option>
                  <option value="Schulsport">Schulsport</option>
                  <option value="Sponsoring">Sponsoring / Gönner</option>
                  <option value="Sonstige">Sonstige / Diverse</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungs-ID (Vorschlag)</label>
                <input type="text" class="form-control fw-bold text-success font-monospace" id="rnc-invoice-id" readonly>
              </div>
            </div>

            <!-- Positionen verfassen -->
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <h6 class="fw-bold text-primary mb-0"><i class="fas fa-list me-1.5"></i>Rechnungspositionen</h6>
                <div class="d-flex gap-2 align-items-center">
                  <div id="rnc-pos-col-toggle"></div>
                  <button type="button" class="btn btn-xs btn-outline-secondary" onclick="rnResetPositionsTableColWidths(this)" title="Spaltenbreiten auf Standard zurücksetzen">
                    <i class="fas fa-arrows-alt-h me-1"></i> Breiten-Reset
                  </button>
                  <div class="dropdown">
                    <button class="btn btn-xs btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                      <i class="fas fa-magic me-1"></i> Standard-Positionen
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow py-2" style="font-size: 0.85rem; min-width: 290px; max-width: 380px; max-height: 420px; overflow-y: auto;">
                      ${(typeof window.rnGetDropdownMenuHtml === 'function' ? window.rnGetDropdownMenuHtml('rncAddPositionRow') : '')}
                    </ul>
                  </div>
                  
                  <button type="button" class="btn btn-xs btn-primary" onclick="rncAddPositionRow()">
                    <i class="fas fa-plus"></i> Pos hinzufügen
                  </button>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle mb-0" id="rnc-positions-table" style="font-size: 13px;">
                  <thead class="table-light">
                    <tr>
                      <th data-col="idx" data-col-id="idx" data-col-name="#" style="width: 38px;" class="text-center">#</th>
                      <th data-col="desc" data-col-id="desc" data-col-name="Beschreibung" style="min-width: 180px;">Beschreibung der Dienstleistung / Ware</th>
                      <th data-col="qty" data-col-id="qty" data-col-name="Menge" style="width: 80px;" class="text-end">Menge</th>
                      <th data-col="unitprice" data-col-id="unitprice" data-col-name="Einzelpreis" style="width: 150px;" class="text-end">Einzelpreis</th>
                      <th data-col="amt" data-col-id="amt" data-col-name="Gesamt (CHF)" style="width: 150px;" class="text-end">Gesamt (CHF)</th>
                      <th data-col="konto" data-col-id="konto" data-col-name="Konto (Haben)" style="width: 140px;">Konto (Haben)</th>
                      <th data-col="action" data-col-id="action" data-col-name="Aktion" style="width: 45px;" class="text-center">Aktion</th>
                    </tr>
                  </thead>
                  <tbody id="rnc-positions-tbody">
                    <!-- Wird dynamisch gefüllt -->
                  </tbody>
                  <tfoot>
                    <tr class="table-light fw-extrabold text-primary" style="font-size:14px;">
                      <td colspan="4" class="text-end">Gesamtsumme (CHF):</td>
                      <td class="text-end font-monospace" id="rnc-total-sum">CHF 0.00</td>
                      <td colspan="2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              ${typeof getRnKontenDatalistHtml === 'function' ? getRnKontenDatalistHtml() : ''}
            </div>

            <!-- Submit -->
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="rnc-submit-btn" disabled>
                <i class="fas fa-check-circle me-1"></i> Rechnung verbindlich erstellen
              </button>
            </div>
          </form>
        </div>
        <!-- Resize-Grip Ecke unten rechts -->
        <div class="rn-modal-resizer" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;" title="Grösse durch Ziehen verändern">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M11 1v10H1V11h10z M11 5v6H5V11h6z M11 9v2H9V11h2z"/></svg>
        </div>
      </div>
    </div>
  `;

  document.getElementById('rnc-invoice-id').value = (typeof window.generateSafeInvoiceId === 'function')
    ? window.generateSafeInvoiceId('RE', window._bhYear)
    : `RE-${String(window._bhYear || new Date().getFullYear()).slice(-2)}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  const defaultTpl = (window._invoiceTemplates || []).find(t => t.desc && t.desc.toLowerCase().includes('miete schützenhaus'));
  const defaultKonto = defaultTpl ? (defaultTpl.habenkonto || defaultTpl.konto || '') : '3650';
  if (typeof window.rncAddPositionRow === 'function') {
    window.rncAddPositionRow("Miete Schützenhaus Muhen", 150, 1, defaultKonto);
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  window.rnPopulateRecipientSelect('');
  if (typeof window.rnEnsureMembersLoaded === 'function') {
    window.rnEnsureMembersLoaded().then(() => window.rnPopulateRecipientSelect('')).catch(() => {});
  }
  if (typeof window.rnEnsureContactsLoaded === 'function') {
    window.rnEnsureContactsLoaded().then(() => window.rnPopulateRecipientSelect('')).catch(() => {});
  }
  rnMakeModalMovableAndResizable(modalEl);
  const posTable = modalEl.querySelector('#rnc-positions-table');
  if (posTable) rnInitPositionsTableResizable(posTable);

  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
    window._rncColToggle = window.TableKit.setupColumnToggle('#rnc-positions-table', {
      container: '#rnc-pos-col-toggle',
      storageKey: 'rnc_positions_table_cols'
    });
  }
};

window.rnEditCurrentSelectedContact = function() {
  const contactId = document.getElementById('rnc-contact-id')?.value;
  if (contactId) {
    window.rnOpenContactModal(contactId);
  }
};

// AUTOCOMPLETE SELECTOR HANDLER (READONLY MASTER BINDING)
window.rnHandleMemberSelect = function(val) {
  const contactIdEl = document.getElementById('rnc-contact-id');
  if (contactIdEl) contactIdEl.value = '';

  const emptyHint = document.getElementById('rnc-empty-hint');
  const detailsWrap = document.getElementById('rnc-details-wrap');
  const editBtn = document.getElementById('rnc-edit-contact-btn');
  const cpCol = document.getElementById('rnc-contact-person-col');
  const abtCol = document.getElementById('rnc-abteilung-col');
  const badgeType = document.getElementById('rnc-badge-type');
  const badgeKat = document.getElementById('rnc-badge-kat');
  const submitBtn = document.getElementById('rnc-submit-btn');

  if (!val) {
    if (emptyHint) emptyHint.style.display = '';
    if (detailsWrap) detailsWrap.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;

    document.getElementById('rnc-person-number').value = '';
    document.getElementById('rnc-name').value = '';
    document.getElementById('rnc-email').value = '';
    document.getElementById('rnc-strasse').value = '';
    document.getElementById('rnc-plz').value = '';
    document.getElementById('rnc-ort').value = '';
    if (document.getElementById('rnc-adresszusatz')) document.getElementById('rnc-adresszusatz').value = '';
    if (document.getElementById('rnc-contact-person')) document.getElementById('rnc-contact-person').value = '';
    if (document.getElementById('rnc-abteilung')) document.getElementById('rnc-abteilung').value = '';
    return;
  }

  if (submitBtn) submitBtn.disabled = false;
  if (emptyHint) emptyHint.style.display = 'none';
  if (detailsWrap) detailsWrap.style.display = '';

  if (val.startsWith('MBR:')) {
    const personNumber = val.replace('MBR:', '').trim();
    const members = (typeof window.rnGetMembersList === 'function')
      ? window.rnGetMembersList()
      : (window._mglData || []);
    const m = members.find(x => String(x.PersonNumber).trim() === personNumber);
    if (m) {
      if (editBtn) editBtn.style.display = 'none';
      const isDeceased = (typeof window.rnIsMemberDeceased === 'function') ? window.rnIsMemberDeceased(m) : false;
      const isExited = (typeof window.rnIsMemberExited === 'function') ? window.rnIsMemberExited(m) : false;
      if (badgeType) badgeType.textContent = '👤 Vereinsmitglied';
      if (badgeKat) {
        if (isDeceased) {
          badgeKat.textContent = '† Verstorben';
          badgeKat.className = 'badge bg-dark px-2 py-1';
        } else if (isExited) {
          badgeKat.textContent = 'Ausgetreten / Ehemalig';
          badgeKat.className = 'badge bg-secondary px-2 py-1';
        } else {
          badgeKat.textContent = m._kategorie || m.Status || 'Aktiv';
          badgeKat.className = 'badge bg-success px-2 py-1';
        }
      }
      if (cpCol) cpCol.style.display = 'none';
      if (abtCol) abtCol.style.display = 'none';

      document.getElementById('rnc-person-number').value = m.PersonNumber || '';
      document.getElementById('rnc-name').value = `${m.LastName || ''} ${m.FirstName || ''}`.trim();
      document.getElementById('rnc-email').value = m.PrimaryEmail || m.Email || '';
      document.getElementById('rnc-strasse').value = m.Street || m.Strasse || '';
      if (document.getElementById('rnc-adresszusatz')) {
        document.getElementById('rnc-adresszusatz').value = m.Addition || m.Adresszusatz || '';
      }
      document.getElementById('rnc-plz').value = m.PostCode || m.ZipCode || m.PLZ || '';
      document.getElementById('rnc-ort').value = m.City || m.Ort || '';
      document.getElementById('rnc-type').value = 'Jahresbeitrag';
    }
  } else if (val.startsWith('EXT:')) {
    const extId = val.replace('EXT:', '').trim();
    const c = (window._externalContacts || []).find(x => String(x.id).trim() === extId);
    if (c) {
      if (contactIdEl) contactIdEl.value = c.id;
      if (editBtn) editBtn.style.display = '';
      
      const isFirma = c.typ === 'firma' || Boolean(c.firma);
      if (badgeType) badgeType.textContent = isFirma ? '🏢 Firma / Organisation' : '👤 Privatperson';
      if (badgeKat) badgeKat.textContent = c.kategorie || 'Extern';

      const displayName = isFirma ? (c.firma || c.name) : ([c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ') || c.name);
      
      document.getElementById('rnc-person-number').value = 'EXT-' + c.id;
      document.getElementById('rnc-name').value = displayName || '';
      document.getElementById('rnc-email').value = c.email || '';
      document.getElementById('rnc-strasse').value = c.strasse || '';
      if (document.getElementById('rnc-adresszusatz')) document.getElementById('rnc-adresszusatz').value = c.adresszusatz || '';
      document.getElementById('rnc-plz').value = c.plz || '';
      document.getElementById('rnc-ort').value = c.ort ? `${c.ort}${c.land && c.land !== 'CH' ? ` (${c.land})` : ''}` : '';
      
      // Ansprechperson & Abteilung anzeigen
      const cpName = isFirma ? [c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ') : '';
      if (cpCol) {
        cpCol.style.display = cpName ? '' : 'none';
        if (document.getElementById('rnc-contact-person')) document.getElementById('rnc-contact-person').value = cpName;
      }
      if (abtCol) {
        abtCol.style.display = c.abteilung ? '' : 'none';
        if (document.getElementById('rnc-abteilung')) document.getElementById('rnc-abteilung').value = c.abteilung || '';
      }

      const typeEl = document.getElementById('rnc-type');
      if (typeEl) {
        if (c.kategorie === 'Sponsor') typeEl.value = 'Sponsoring';
        else if (c.kategorie === 'Gönner') typeEl.value = 'Gönnerbeitrag';
        else if (c.kategorie === 'Mieter') typeEl.value = 'Vermietung';
        else typeEl.value = 'Vermietung';
      }
    }
  }
};

// POSITION ROW DYNAMIC FUNCTIONS
let rncPosCounter = 0;
function rncRecalculateTotal() {
  const amts = document.querySelectorAll('.rnc-pos-amt');
  let sum = 0;
  amts.forEach(el => sum += Number(el.value || 0));

  const totalEl = document.getElementById('rnc-total-sum');
  if (totalEl) {
    totalEl.textContent = fmtChf(sum);
  }
}
window.rncRecalculateTotal = rncRecalculateTotal;

function getRnKontenDatalistHtml() {
  let list = window._bhKontenrahmen;
  if (!list || list.length === 0) {
    try {
      const cached = localStorage.getItem('bh_kontenrahmen');
      if (cached) list = JSON.parse(cached);
    } catch (e) {}
  }
  const options = (list || []).map(k => `<option value="${escapeHtml(k.konto)} | ${escapeHtml(k.bezeichnung)}">`).join('');
  return `<datalist id="rn-konten-datalist">${options}</datalist>`;
}
window.getRnKontenDatalistHtml = getRnKontenDatalistHtml;

function rncAddPositionRow(desc = "", unitPrice = "", qty = 1, konto = "") {
  rncPosCounter++;
  const tbody = document.getElementById('rnc-positions-tbody');
  if (!tbody) return;

  const initialAmount = (qty * (Number(unitPrice) || 0)).toFixed(2);

  const tr = document.createElement('tr');
  tr.id = `rnc-pos-row-${rncPosCounter}`;
  tr.innerHTML = `
    <td class="text-center font-monospace text-muted rnc-pos-idx tk-col-idx">${tbody.children.length + 1}</td>
    <td class="tk-col-desc">
      <input type="text" class="form-control form-control-sm rnc-pos-desc" required value="${desc}" placeholder="z.B. Getränkebezug Süsswasser">
    </td>
    <td class="tk-col-qty">
      <input type="number" step="1" min="1" class="form-control form-control-sm text-end rnc-pos-qty rn-no-spin" required value="${qty}" oninput="rncRecalculateRowTotal('${tr.id}')">
    </td>
    <td class="tk-col-unitprice">
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-light text-muted px-1.5 py-0" style="font-size: 11px; min-width: 32px; justify-content: center;">CHF</span>
        <input type="number" step="0.05" class="form-control form-control-sm text-end rnc-pos-unitprice rn-no-spin" required value="${unitPrice}" placeholder="0.00" oninput="rncRecalculateRowTotal('${tr.id}')">
      </div>
    </td>
    <td class="tk-col-amt">
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-light text-muted px-1.5 py-0" style="font-size: 11px; min-width: 32px; justify-content: center;">CHF</span>
        <input type="number" class="form-control form-control-sm text-end fw-bold rnc-pos-amt bg-light rn-no-spin" readonly value="${initialAmount}">
      </div>
    </td>
    <td class="tk-col-konto">
      <input type="text" class="form-control form-control-sm font-monospace rnc-pos-konto" list="rn-konten-datalist" value="${escapeHtml(konto || '')}" placeholder="Konto...">
    </td>
    <td class="text-center tk-col-action">
      <button type="button" class="btn btn-xs btn-outline-danger" onclick="rncRemovePositionRow('${tr.id}')">
        <i class="fas fa-trash-alt"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  rncRecalculateTotal();
  if (window._rncColToggle && typeof window._rncColToggle.apply === 'function') {
    window._rncColToggle.apply();
  }
}
window.rncAddPositionRow = rncAddPositionRow;

function rncRecalculateRowTotal(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const qty = Number(row.querySelector('.rnc-pos-qty').value || 1);
  const unitPrice = Number(row.querySelector('.rnc-pos-unitprice').value || 0);
  const amtEl = row.querySelector('.rnc-pos-amt');
  if (amtEl) {
    amtEl.value = (qty * unitPrice).toFixed(2);
  }
  rncRecalculateTotal();
}
window.rncRecalculateRowTotal = rncRecalculateRowTotal;

function rncRemovePositionRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    const idxs = document.querySelectorAll('.rnc-pos-idx');
    idxs.forEach((el, index) => el.textContent = index + 1);
    rncRecalculateTotal();
  }
}
window.rncRemovePositionRow = rncRemovePositionRow;

// SAVE NEW MANUALLY INVOICE
window.rnSaveCreateInvoice = async function(event) {
  event.preventDefault();

  const invoiceId = document.getElementById('rnc-invoice-id').value;
  const name = document.getElementById('rnc-name').value.trim();
  const email = document.getElementById('rnc-email').value.trim();
  const strasse = document.getElementById('rnc-strasse').value.trim();
  const plz = document.getElementById('rnc-plz').value.trim();
  const ort = document.getElementById('rnc-ort').value.trim();
  const contactId = document.getElementById('rnc-contact-id') ? document.getElementById('rnc-contact-id').value.trim() : '';
  
  let personNumber = document.getElementById('rnc-person-number').value.trim();
  if (!personNumber && contactId) {
    personNumber = 'EXT-' + contactId;
  }

  // Wenn es sich um eine Firma handelt, soll stets und ausschliesslich der Firmenname verwendet werden
  let finalInvoiceName = name;
  if (contactId) {
    const existingContact = (window._externalContacts || []).find(c => String(c.id).trim() === String(contactId).trim());
    if (existingContact) {
      const isFirma = existingContact.typ === 'firma' || Boolean(existingContact.firma);
      if (isFirma && existingContact.firma) {
        finalInvoiceName = String(existingContact.firma).trim();
      }
    }
  }

  const nowStr = typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH');

  const invoiceHeader = {
    id: invoiceId,
    PersonNumber: personNumber,
    name: finalInvoiceName,
    year: Number(document.getElementById('rnc-year').value),
    type: document.getElementById('rnc-type').value,
    total_amount: 0,
    status: 'offen',
    created_at: nowStr,
    updated_at: nowStr
  };

  const posRows = document.querySelectorAll('#rnc-positions-tbody tr');
  const positions = [];
  let totalAmount = 0;

  posRows.forEach((row, index) => {
    const desc = row.querySelector('.rnc-pos-desc').value.trim();
    const qty = Number(row.querySelector('.rnc-pos-qty').value || 1);
    const unitPrice = Number(row.querySelector('.rnc-pos-unitprice').value || 0);
    const amt = Number(row.querySelector('.rnc-pos-amt').value || (qty * unitPrice));
    const rawKonto = row.querySelector('.rnc-pos-konto') ? row.querySelector('.rnc-pos-konto').value.trim() : '';
    const konto = rawKonto.split('|')[0].trim();
    positions.push({
      position_nr: index + 1,
      description: desc,
      quantity: qty,
      unit_price: unitPrice,
      amount: amt,
      konto: konto
    });
    totalAmount += amt;
  });

  invoiceHeader.total_amount = totalAmount;

  if (positions.length === 0) {
    alert("❌ Bitte fügen Sie mindestens eine Rechnungsposition hinzu.");
    return;
  }

  // Strikte Validierung: Jede Position MUSS ein Gegenkonto haben
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i].konto) {
      alert(`❌ Position ${positions[i].position_nr} („${positions[i].description || 'Ohne Bezeichnung'}“) hat kein Gegenkonto (Haben).\n\nJede Rechnungsposition muss zwingend ein gültiges Gegenkonto aufweisen.\nBitte wählen Sie in der Spalte „Konto (Haben)“ ein Konto aus dem Kontenrahmen aus.`);
      return;
    }
  }

  // 1. Optimistic Update
  window._invoices.unshift(invoiceHeader);

  // Falls externer Kontakt, Kontaktdaten auch lokal in _externalContacts aktualisieren
  if (!document.getElementById('rnc-person-number').value.trim() || String(document.getElementById('rnc-person-number').value.trim()).startsWith('EXT')) {
    const extIdx = contactId ? window._externalContacts.findIndex(c => String(c.id).trim() === String(contactId).trim()) : -1;
    if (extIdx !== -1) {
      window._externalContacts[extIdx] = {
        ...window._externalContacts[extIdx],
        name: name,
        email: email,
        strasse: strasse,
        plz: plz,
        ort: ort
      };
    } else {
      window._externalContacts.push({
        id: contactId || (window._externalContacts.length + 1),
        name: name,
        email: email,
        strasse: strasse,
        plz: plz,
        ort: ort
      });
    }
  }

  // Tab & Filter zurücksetzen, damit die Rechnung sofort sichtbar ist
  window._rechnungenActiveTab = 'archiv';
  window._invoicesFilterStatus = 'alle';
  window._invoicesFilterType = 'alle';
  if (typeof rnRenderTable === 'function') {
    rnRenderTable();
  } else {
    window.renderRechnungen();
  }

  // Close modal instantly
  const modalEl = document.getElementById('rnModalCreateInvoice');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  showSuccess(`🎉 Rechnung ${invoiceId} erfolgreich erstellt (Hintergrund-Synchronisation läuft)...`);

  // Sofort zur neu erstellten Zeile scrollen und hervorheben
  setTimeout(() => {
    const rowEl = document.getElementById(`rn-row-${invoiceId}`);
    if (rowEl) {
      rowEl.classList.add('table-success');
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => rowEl.classList.remove('table-success'), 3000);
    }
  }, 100);

  let recipientPayload = null;
  if (contactId) {
    const existingContact = (window._externalContacts || []).find(c => String(c.id).trim() === String(contactId).trim());
    if (existingContact) {
      recipientPayload = { ...existingContact };
    }
  }
  if (!recipientPayload) {
    recipientPayload = {
      id: contactId || '',
      name: name,
      firma: name,
      vorname: '',
      nachname: '',
      strasse: strasse,
      plz: plz,
      ort: ort,
      email: email
    };
  }

  const payload = {
    action: 'createInvoice',
    invoice: invoiceHeader,
    positions: positions,
    recipient: recipientPayload
  };

  // 1. Supabase PostgreSQL Master Write (< 50ms)
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (sb) {
    try {
      const sbInv = {
        id: invoiceId,
        person_number: personNumber || null,
        name: finalInvoiceName,
        year: Number(document.getElementById('rnc-year').value),
        type: document.getElementById('rnc-type').value,
        total_amount: totalAmount,
        status: 'offen',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { error: invErr } = await sb.from('invoices').upsert(sbInv);
      if (invErr) console.warn("⚠️ [Supabase] Invoice header upsert warning:", invErr);

      if (positions.length > 0) {
        const sbPositions = positions.map(p => ({
          invoice_id: invoiceId,
          position_nr: p.position_nr,
          description: p.description,
          quantity: p.quantity,
          unit_price: p.unit_price,
          amount: p.amount,
          konto: p.konto || null
        }));
        await sb.from('invoice_positions').delete().eq('invoice_id', invoiceId);
        const { error: posErr } = await sb.from('invoice_positions').insert(sbPositions);
        if (posErr) console.warn("⚠️ [Supabase] Positions insert warning:", posErr);
      }

      if (contactId && recipientPayload) {
        await sb.from('external_contacts').upsert({
          id: String(contactId),
          typ: recipientPayload.typ || 'privat',
          kategorie: recipientPayload.kategorie || null,
          firma: recipientPayload.firma || null,
          vorname: recipientPayload.vorname || null,
          nachname: recipientPayload.nachname || null,
          name: recipientPayload.name || finalInvoiceName,
          strasse: recipientPayload.strasse || null,
          plz: recipientPayload.plz || null,
          ort: recipientPayload.ort || null,
          email: recipientPayload.email || null,
          updated_at: new Date().toISOString()
        });
      }
      console.log(`✅ [Supabase] Invoice ${invoiceId} and positions saved to Supabase.`);
    } catch (sbEx) {
      console.warn("⚠️ [Supabase] Create Invoice error:", sbEx);
    }
  }

  // 2. Dual-Write to Google Apps Script / Sheets (DEAKTIVIERT - Supabase ist Single Source of Truth)
  /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();
    if (!result.success) console.warn("⚠️ Dual-Write GAS returned error:", result.error);
  } catch (err) {
    console.warn("⚠️ Dual-write to Sheets failed (Supabase Master intact):", err);
  }
  ------------------------------------------------------- */
  
  // Schneller UI-Refresh direkt aus Supabase
  setTimeout(async () => {
    await loadRechnungenData(true, true);
    await loadInvoiceContactsData();
  }, 200);
};

// EDIT MANUALLY INVOICE MODAL
window.rnOpenEditModal = async function(invoiceId) {
  let modalEl = document.getElementById('rnModalEditInvoice');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalEditInvoice';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  showLoadingOverlay(`Lade Rechnung ${invoiceId}...`);
  let inv = null;
  let positions = [];
  let data = null;
  let recipient = null;

  try {
    const res = await apiFetch('rechnungen', { action: 'getInvoiceDetails', invoiceId });
    data = await res.json();
    if (data.success) {
      inv = data.invoice;
      positions = data.positions || [];
      recipient = data.recipient || null;
    } else {
      throw new Error(data.error || "Unerwarteter Fehler.");
    }
  } catch (err) {
    console.warn("⚠️ getInvoiceDetails Server-Fehler, versuche lokalen Fallback:", err);
    // Fallback: Aus lokalem Cache laden
    inv = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
    if (!inv) {
      hideLoadingOverlay();
      alert("❌ Fehler beim Laden der Rechnungsdetails: " + err.message);
      return;
    }
    positions = [{
      position_nr: 1,
      description: inv.type || 'Rechnungsposition',
      quantity: 1,
      unit_price: inv.total_amount || 0,
      amount: inv.total_amount || 0
    }];
  }
  hideLoadingOverlay();

  let contactId = '';
  let email = '';
  let strasse = '';
  let plz = '';
  let ort = '';
  let isFirma = false;
  let ansprechperson = '';
  let abteilung = '';
  let adresszusatz = '';
  let land = 'CH';
  let kat = '';

  const isMember = inv.PersonNumber && !String(inv.PersonNumber).startsWith('EXT');
  if (isMember) {
    let members = window._mglData || [];
    if (members.length === 0 && window.AppCache) {
      const cached = window.AppCache.get('mitglieder');
      if (cached && Array.isArray(cached.data)) members = cached.data;
    }
    const m = members.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};
    email = m.Email || m.PrimaryEmail || '';
    strasse = m.Street || m.Strasse || '';
    plz = m.ZipCode || m.PLZ || '';
    ort = m.City || m.Ort || '';
    kat = 'Vereinsmitglied';
  } else {
    // Externe Kontakte: streng nach ID (oder Fallback auf Name)
    const extId = String(inv.PersonNumber || '').replace('EXT-', '').replace('EXT:', '').trim();
    if (!recipient && extId) {
      recipient = (window._externalContacts || []).find(c => String(c.id).trim() === extId);
    }
    if (!recipient && inv.name) {
      recipient = (window._externalContacts || []).find(c => 
        (c.firma && String(c.firma).trim().toLowerCase() === String(inv.name).trim().toLowerCase()) ||
        (c.name && String(c.name).trim().toLowerCase() === String(inv.name).trim().toLowerCase())
      );
    }
    if (recipient) {
      contactId = recipient.id || extId;
      isFirma = recipient.typ === 'firma' || Boolean(recipient.firma);
      kat = recipient.kategorie || (isFirma ? 'Firma' : 'Privat');
      email = recipient.email || '';
      ansprechperson = recipient.ansprechperson || '';
      abteilung = recipient.abteilung || '';
      strasse = recipient.strasse || '';
      adresszusatz = recipient.adresszusatz || '';
      plz = recipient.plz || '';
      ort = recipient.ort || '';
      land = recipient.land || 'CH';
    } else if (extId) {
      contactId = extId;
    }
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-xl" style="max-width: 1100px;">
      <div class="modal-content border-0 rounded-4 shadow" style="position: relative;">
        <div class="modal-header bg-warning text-dark border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
          <h5 class="modal-title fw-bold mb-0"><i class="fas fa-edit me-2"></i>Rechnung bearbeiten (ID: ${inv.id})</h5>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm text-dark p-1 border-0 shadow-none rn-modal-maximize-btn" title="Maximieren / Verkleinern" style="opacity: 0.85; line-height: 1;">
              <i class="fas fa-expand"></i>
            </button>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body p-4">
          <form id="rn-edit-form" onsubmit="rnSaveEditInvoice(event, '${inv.id}')">
            <input type="hidden" id="rne-contact-id" value="${escapeHtml(contactId)}">
            
            <!-- Adressdaten (Master-Kärtchen mit Absprung zu Stammdaten) -->
            <div id="rne-recipient-box" class="p-3 bg-light rounded-3 border mb-4 shadow-2xs">
              <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom flex-wrap gap-2">
                <div class="d-flex gap-1.5 align-items-center">
                  <span class="badge ${isMember ? 'bg-info text-dark' : (isFirma ? 'bg-primary' : 'bg-secondary')} px-2 py-1" id="rne-badge-type">
                    ${isMember ? '👤 Vereinsmitglied' : (isFirma ? '🏢 Firma / Organisation' : '👤 Privatperson')}
                  </span>
                  ${kat ? `<span class="badge bg-secondary px-2 py-1" id="rne-badge-kat">${escapeHtml(kat)}</span>` : ''}
                </div>
                ${contactId ? `
                <button type="button" class="btn btn-xs btn-outline-primary fw-bold" onclick="rnOpenContactModal('${contactId}')">
                  <i class="fas fa-user-edit me-1"></i> Kontakt in Stammdaten bearbeiten
                </button>
                ` : `
                <span class="text-muted small"><i class="fas fa-lock me-1"></i>Stammdaten schreibgeschützt</span>
                `}
              </div>

              <div class="row g-2">
                <div class="col-md-3">
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Empfänger-ID / Mgl-Nr</label>
                  <input type="text" class="form-control form-control-sm font-monospace bg-white" id="rne-person-number" readonly value="${inv.PersonNumber || (contactId ? 'EXT-' + contactId : '')}">
                </div>
                <div class="col-md-5">
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Empfänger (Name / Firma)</label>
                  <input type="text" class="form-control form-control-sm fw-bold bg-white" id="rne-name" readonly required value="${escapeHtml(inv.name || (recipient ? (recipient.firma || recipient.name) : ''))}">
                </div>
                <div class="col-md-4">
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">E-Mail</label>
                  <input type="email" class="form-control form-control-sm bg-white" id="rne-email" readonly value="${escapeHtml(email)}">
                </div>

                ${isFirma && (ansprechperson || abteilung) ? `
                <div class="col-md-6" id="rne-contact-person-col" ${!ansprechperson ? 'style="display:none;"' : ''}>
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Ansprechperson / Kontaktperson</label>
                  <input type="text" class="form-control form-control-sm bg-white" id="rne-contact-person" readonly value="${escapeHtml(ansprechperson)}">
                </div>
                <div class="col-md-6" id="rne-abteilung-col" ${!abteilung ? 'style="display:none;"' : ''}>
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Abteilung / Zusatz</label>
                  <input type="text" class="form-control form-control-sm bg-white" id="rne-abteilung" readonly value="${escapeHtml(abteilung)}">
                </div>
                ` : ''}

                <div class="col-md-5">
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Strasse & Hausnummer</label>
                  <input type="text" class="form-control form-control-sm bg-white" id="rne-strasse" readonly value="${escapeHtml(strasse)}">
                </div>
                <div class="col-md-3">
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Adresszusatz / Postfach</label>
                  <input type="text" class="form-control form-control-sm bg-white" id="rne-adresszusatz" readonly value="${escapeHtml(adresszusatz)}">
                </div>
                <div class="col-md-2">
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">PLZ</label>
                  <input type="text" class="form-control form-control-sm font-monospace bg-white" id="rne-plz" readonly value="${escapeHtml(plz)}">
                </div>
                <div class="col-md-2">
                  <label class="form-label text-muted fw-bold mb-0" style="font-size:11px;">Ort (Land)</label>
                  <input type="text" class="form-control form-control-sm bg-white" id="rne-ort" readonly value="${escapeHtml(ort + (land && land !== 'CH' ? ' (' + land + ')' : ''))}">
                </div>
              </div>
            </div>

            <!-- Rechnungs-Kopfdaten -->
            <div class="row g-3 mb-4 p-3 bg-light rounded-3 border border-light">
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungsjahr</label>
                <input type="number" class="form-control fw-bold font-monospace" id="rne-year" required value="${inv.year}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungstyp</label>
                <select class="form-select" id="rne-type" required>
                  <option value="Vermietung" ${inv.type === 'Vermietung' ? 'selected' : ''}>Vermietung</option>
                  <option value="Jahresbeitrag" ${inv.type === 'Jahresbeitrag' ? 'selected' : ''}>Jahresbeitrag / Mitglieder</option>
                  <option value="Materialverkauf" ${inv.type === 'Materialverkauf' ? 'selected' : ''}>Materialverkauf</option>
                  <option value="Depot / Pfand" ${inv.type === 'Depot / Pfand' ? 'selected' : ''}>Depot / Pfand</option>
                  <option value="Schulsport" ${inv.type === 'Schulsport' ? 'selected' : ''}>Schulsport</option>
                  <option value="Sponsoring" ${inv.type === 'Sponsoring' ? 'selected' : ''}>Sponsoring / Gönner</option>
                  <option value="Sonstige" ${inv.type === 'Sonstige' ? 'selected' : ''}>Sonstige / Diverse</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Rechnungs-ID (Fixiert)</label>
                <input type="text" class="form-control fw-bold text-success font-monospace bg-light" id="rne-invoice-id" readonly value="${inv.id}">
              </div>
            </div>

            <!-- Positionen verfassen -->
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <h6 class="fw-bold text-primary mb-0"><i class="fas fa-list me-1.5"></i>Rechnungspositionen</h6>
                 <div class="d-flex gap-2 align-items-center">
                  <div id="rne-pos-col-toggle"></div>
                  <button type="button" class="btn btn-xs btn-outline-secondary" onclick="rnResetPositionsTableColWidths(this)" title="Spaltenbreiten auf Standard zurücksetzen">
                    <i class="fas fa-arrows-alt-h me-1"></i> Breiten-Reset
                  </button>
                  <div class="dropdown">
                    <button class="btn btn-xs btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                      <i class="fas fa-magic me-1"></i> Standard-Positionen
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow py-2" style="font-size: 0.85rem; min-width: 290px; max-width: 380px; max-height: 420px; overflow-y: auto;">
                      ${(typeof window.rnGetDropdownMenuHtml === 'function' ? window.rnGetDropdownMenuHtml('rneAddPositionRow') : '')}
                    </ul>
                  </div>
                  
                  <button type="button" class="btn btn-xs btn-primary" onclick="rneAddPositionRow()">
                    <i class="fas fa-plus"></i> Pos hinzufügen
                  </button>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle mb-0" id="rne-positions-table" style="font-size: 13px;">
                  <thead class="table-light">
                    <tr>
                      <th data-col="idx" data-col-id="idx" data-col-name="#" style="width: 38px;" class="text-center">#</th>
                      <th data-col="desc" data-col-id="desc" data-col-name="Beschreibung" style="min-width: 180px;">Beschreibung der Dienstleistung / Ware</th>
                      <th data-col="qty" data-col-id="qty" data-col-name="Menge" style="width: 80px;" class="text-end">Menge</th>
                      <th data-col="unitprice" data-col-id="unitprice" data-col-name="Einzelpreis" style="width: 150px;" class="text-end">Einzelpreis</th>
                      <th data-col="amt" data-col-id="amt" data-col-name="Gesamt (CHF)" style="width: 150px;" class="text-end">Gesamt (CHF)</th>
                      <th data-col="konto" data-col-id="konto" data-col-name="Konto (Haben)" style="width: 140px;">Konto (Haben)</th>
                      <th data-col="action" data-col-id="action" data-col-name="Aktion" style="width: 45px;" class="text-center">Aktion</th>
                    </tr>
                  </thead>
                  <tbody id="rne-positions-tbody">
                    <!-- Wird dynamisch gefüllt -->
                  </tbody>
                  <tfoot>
                    <tr class="table-light fw-extrabold text-primary" style="font-size:14px;">
                      <td colspan="4" class="text-end">Gesamtsumme (CHF):</td>
                      <td class="text-end font-monospace" id="rne-total-sum">CHF 0.00</td>
                      <td colspan="2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              ${typeof getRnKontenDatalistHtml === 'function' ? getRnKontenDatalistHtml() : ''}
            </div>

            <!-- Submit -->
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-warning py-2.5 fw-bold rounded-3 shadow-sm text-dark" id="rne-submit-btn">
                <i class="fas fa-save me-1"></i> Änderungen verbindlich speichern
              </button>
            </div>
          </form>
        </div>
        <!-- Resize-Grip Ecke unten rechts -->
        <div class="rn-modal-resizer" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;" title="Grösse durch Ziehen verändern">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M11 1v10H1V11h10z M11 5v6H5V11h6z M11 9v2H9V11h2z"/></svg>
        </div>
      </div>
    </div>
  `;

  let rnePosCounter = 0;
  function rneRecalculateTotal() {
    const amts = document.querySelectorAll('.rne-pos-amt');
    let sum = 0;
    amts.forEach(el => sum += Number(el.value || 0));
    const totalEl = document.getElementById('rne-total-sum');
    if (totalEl) {
      totalEl.textContent = fmtChf(sum);
    }
  }
  window.rneRecalculateTotal = rneRecalculateTotal;

  function rneAddPositionRow(desc = "", unitPrice = "", qty = 1, konto = "") {
    rnePosCounter++;
    const tbody = document.getElementById('rne-positions-tbody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.id = `rne-pos-row-${rnePosCounter}`;
    const initialAmount = (Number(qty || 1) * Number(unitPrice || 0)).toFixed(2);

    tr.innerHTML = `
      <td class="text-center font-monospace rne-pos-idx tk-col-idx">${tbody.children.length + 1}</td>
      <td class="tk-col-desc">
        <input type="text" class="form-control form-control-sm rne-pos-desc" required value="${escapeHtml(desc)}" placeholder="z.B. Miete Schützenhaus">
      </td>
      <td class="tk-col-qty">
        <input type="number" class="form-control form-control-sm text-end rne-pos-qty rn-no-spin" required step="1" min="1" value="${qty}" oninput="rneRecalculateRowTotal('${tr.id}')">
      </td>
      <td class="tk-col-unitprice">
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted px-1.5 py-0" style="font-size: 11px; min-width: 32px; justify-content: center;">CHF</span>
          <input type="number" class="form-control form-control-sm text-end rne-pos-unitprice rn-no-spin" required step="0.05" min="0" value="${unitPrice}" oninput="rneRecalculateRowTotal('${tr.id}')">
        </div>
      </td>
      <td class="tk-col-amt">
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted px-1.5 py-0" style="font-size: 11px; min-width: 32px; justify-content: center;">CHF</span>
          <input type="number" class="form-control form-control-sm text-end fw-bold rne-pos-amt bg-light rn-no-spin" readonly value="${initialAmount}">
        </div>
      </td>
      <td class="tk-col-konto">
        <input type="text" class="form-control form-control-sm font-monospace rne-pos-konto" list="rn-konten-datalist" value="${escapeHtml(konto || '')}" placeholder="Konto...">
      </td>
      <td class="text-center tk-col-action">
        <button type="button" class="btn btn-xs btn-outline-danger" onclick="rneRemovePositionRow('${tr.id}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
    rneRecalculateTotal();
    if (window._rneColToggle && typeof window._rneColToggle.apply === 'function') {
      window._rneColToggle.apply();
    }
  }
  window.rneAddPositionRow = rneAddPositionRow;

  function rneRecalculateRowTotal(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const qty = Number(row.querySelector('.rne-pos-qty').value || 1);
    const unitPrice = Number(row.querySelector('.rne-pos-unitprice').value || 0);
    const amtEl = row.querySelector('.rne-pos-amt');
    if (amtEl) {
      amtEl.value = (qty * unitPrice).toFixed(2);
    }
    rneRecalculateTotal();
  }
  window.rneRecalculateRowTotal = rneRecalculateRowTotal;

  function rneRemovePositionRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
      row.remove();
      const idxs = document.querySelectorAll('.rne-pos-idx');
      idxs.forEach((el, index) => el.textContent = index + 1);
      rneRecalculateTotal();
    }
  }
  window.rneRemovePositionRow = rneRemovePositionRow;

  if (positions.length > 0) {
    positions.forEach(p => {
      if (typeof window.rneAddPositionRow === 'function') {
        window.rneAddPositionRow(p.description || '', p.unit_price || p.amount || 0, p.quantity || 1, p.konto || '');
      }
    });
  } else {
    if (typeof window.rneAddPositionRow === 'function') {
      window.rneAddPositionRow();
    }
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  rnMakeModalMovableAndResizable(modalEl);
  const posTable = modalEl.querySelector('#rne-positions-table');
  if (posTable) rnInitPositionsTableResizable(posTable);

  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
    window._rneColToggle = window.TableKit.setupColumnToggle('#rne-positions-table', {
      container: '#rne-pos-col-toggle',
      storageKey: 'rne_positions_table_cols'
    });
  }
};

// SAVE EDITED INVOICE
window.rnSaveEditInvoice = async function(event, invoiceId) {
  event.preventDefault();

  const name = document.getElementById('rne-name') ? document.getElementById('rne-name').value.trim() : '';
  const contactId = document.getElementById('rne-contact-id') ? document.getElementById('rne-contact-id').value.trim() : '';

  let personNumber = document.getElementById('rne-person-number') ? document.getElementById('rne-person-number').value.trim() : '';
  if (!personNumber && contactId) {
    personNumber = 'EXT-' + contactId;
  }
  const nowStr = typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH');
  
  const invoiceHeader = {
    id: invoiceId,
    PersonNumber: personNumber,
    name: name,
    year: Number(document.getElementById('rne-year').value),
    type: document.getElementById('rne-type').value,
    total_amount: 0,
    updated_at: nowStr
  };

  const posRows = document.querySelectorAll('#rne-positions-tbody tr');
  const positions = [];
  let totalAmount = 0;

  posRows.forEach((row, index) => {
    const desc = row.querySelector('.rne-pos-desc').value.trim();
    const qty = Number(row.querySelector('.rne-pos-qty').value || 1);
    const unitPrice = Number(row.querySelector('.rne-pos-unitprice').value || 0);
    const amt = Number(row.querySelector('.rne-pos-amt').value || (qty * unitPrice));
    const rawKonto = row.querySelector('.rne-pos-konto') ? row.querySelector('.rne-pos-konto').value.trim() : '';
    const konto = rawKonto.split('|')[0].trim();
    positions.push({
      position_nr: index + 1,
      description: desc,
      quantity: qty,
      unit_price: unitPrice,
      amount: amt,
      konto: konto
    });
    totalAmount += amt;
  });

  invoiceHeader.total_amount = totalAmount;

  if (positions.length === 0) {
    alert("❌ Bitte fügen Sie mindestens eine Rechnungsposition hinzu.");
    return;
  }

  // Strikte Validierung: Jede Position MUSS ein Gegenkonto haben
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i].konto) {
      alert(`❌ Position ${positions[i].position_nr} („${positions[i].description || 'Ohne Bezeichnung'}“) hat kein Gegenkonto (Haben).\n\nJede Rechnungsposition muss zwingend ein gültiges Gegenkonto aufweisen.\nBitte wählen Sie in der Spalte „Konto (Haben)“ ein Konto aus dem Kontenrahmen aus.`);
      return;
    }
  }

  // 1. Optimistic Update
  const invIndex = window._invoices.findIndex(i => String(i.id) === String(invoiceId));
  let oldInv = null;
  if (invIndex !== -1) {
    oldInv = { ...window._invoices[invIndex] };
    window._invoices[invIndex] = { ...window._invoices[invIndex], ...invoiceHeader };
    window.renderRechnungen(); // Render table instantly!
  }

  // Close modal instantly
  const modalEl = document.getElementById('rnModalEditInvoice');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  showSuccess(`🎉 Rechnung ${invoiceId} erfolgreich aktualisiert (Hintergrund-Synchronisation läuft)...`);

  // WICHTIG: Kein recipient-Objekt mitsenden! Stammdaten werden ausschliesslich über "Externe Kontakte" verwaltet,
  // damit Firmennamen/Ansprechpersonen/Stammdaten nicht überschrieben oder fehlerhaft aufgeteilt werden.
  const payload = {
    action: 'updateInvoice',
    invoice: invoiceHeader,
    positions: positions
  };

  // 1. Supabase PostgreSQL Master Update (< 50ms)
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (sb) {
    try {
      const sbInv = {
        name: name,
        year: Number(document.getElementById('rne-year').value),
        type: document.getElementById('rne-type').value,
        total_amount: totalAmount,
        person_number: personNumber || null,
        updated_at: new Date().toISOString()
      };
      const { error: invErr } = await sb.from('invoices').update(sbInv).eq('id', invoiceId);
      if (invErr) console.warn("⚠️ [Supabase] Invoice update warning:", invErr);

      await sb.from('invoice_positions').delete().eq('invoice_id', invoiceId);
      if (positions.length > 0) {
        const sbPositions = positions.map(p => ({
          invoice_id: invoiceId,
          position_nr: p.position_nr,
          description: p.description,
          quantity: p.quantity,
          unit_price: p.unit_price,
          amount: p.amount,
          konto: p.konto || null
        }));
        const { error: posErr } = await sb.from('invoice_positions').insert(sbPositions);
        if (posErr) console.warn("⚠️ [Supabase] Positions update warning:", posErr);
      }
      console.log(`✅ [Supabase] Invoice ${invoiceId} and positions updated in Supabase.`);
    } catch (sbEx) {
      console.warn("⚠️ [Supabase] Update Invoice error:", sbEx);
    }
  }

  // 2. Dual-Write to Google Apps Script / Sheets (DEAKTIVIERT - Supabase ist Single Source of Truth)
  /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();
    if (!result.success) console.warn("⚠️ Dual-Write GAS update returned error:", result.error);
  } catch (err) {
    console.warn("⚠️ Dual-write edit to Sheets failed (Supabase Master intact):", err);
  }
  ------------------------------------------------------- */
  
  // Schneller UI-Refresh direkt aus Supabase
  setTimeout(async () => {
    await loadRechnungenData(true, true);
    await loadInvoiceContactsData();
  }, 200);
};

// DELETE INVOICE PROMPT
window.rnDeleteInvoicePrompt = async function(invoiceId) {
  if (!confirm(`⚠️ Möchtest du die offene Rechnung ${invoiceId} wirklich unwiderruflich löschen?\n\nDadurch werden die Rechnungsdaten und alle Positionen in der Tabelle gelöscht.`)) {
    return;
  }

  // 1. Optimistic Update
  const invIndex = window._invoices.findIndex(i => String(i.id) === String(invoiceId));
  let deletedInv = null;
  if (invIndex !== -1) {
    deletedInv = { ...window._invoices[invIndex], originalIndex: invIndex };
    window._invoices.splice(invIndex, 1);
    window.renderRechnungen(); // Render table instantly!
  }

  showSuccess(`🎉 Rechnung ${invoiceId} wurde gelöscht (Hintergrund-Synchronisation läuft)...`);

  // Supabase PostgreSQL Master Delete
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (sb) {
    try {
      await sb.from('invoice_positions').delete().eq('invoice_id', invoiceId);
      await sb.from('invoices').delete().eq('id', invoiceId);
      console.log(`✅ [Supabase] Invoice ${invoiceId} deleted from Supabase.`);
    } catch (sbEx) {
      console.warn("⚠️ [Supabase] Delete Invoice error:", sbEx);
    }
  }

  // Dual-Write Delete to GAS / Sheets (DEAKTIVIERT - Supabase ist Single Source of Truth)
  /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
  try {
    const response = await apiFetch('rechnungen', { action: 'deleteInvoice', invoiceId }, 'POST');
    const result = await response.json();
    if (!result.success) console.warn("⚠️ Dual-Write GAS delete returned error:", result.error);
  } catch (err) {
    console.warn("⚠️ Dual-write delete to Sheets failed (Supabase Master intact):", err);
  }
  ------------------------------------------------------- */
  
  // Schneller UI-Refresh direkt aus Supabase
  setTimeout(async () => {
    await loadRechnungenData(true);
  }, 200);
};

// =====================================================================
// 3-STUFIGES MAHNWESEN (MANUELL & AUTOMATISCHER SAMMEL-MAHNLAUF)
// =====================================================================

// Hilfsfunktion: Datumsdifferenz in Tagen berechnen
function rnGetDaysSince(dateStr) {
  if (!dateStr) return null;
  let d = null;
  const clean = String(dateStr).split(' ')[0].trim();
  if (clean.includes('.')) {
    const p = clean.split('.');
    if (p.length === 3) d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
  } else if (clean.includes('-')) {
    d = new Date(clean);
  }
  if (!d || isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// 1. MANUELLE MAHNUNG: DIALOG ÖFFNEN
window.rnOpenMahnungModal = async function(invoiceId, name) {
  const inv = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
  if (!inv) {
    alert("❌ Rechnung nicht gefunden: " + invoiceId);
    return;
  }

  // Externe Kontakte laden, falls noch nicht im Speicher
  if ((!window._externalContacts || window._externalContacts.length === 0) && typeof loadInvoiceContactsData === 'function') {
    try { await loadInvoiceContactsData(); } catch (_) {}
  }

  const m = (window._mglData || []).find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};
  const nieMahnen = m && (m.Niemahnen === '1' || m.Niemahnen === true || m.Niemahnen === 1);

  const recipient = (typeof rnGetRecipientForInvoice === 'function')
    ? rnGetRecipientForInvoice(inv)
    : {
        vorname: inv.name.split(' ')[0] || '',
        nachname: inv.name.split(' ').slice(1).join(' ') || '',
        strasse: '', plz: '', ort: '', email: ''
      };

  const initialEmail = recipient.email || '';
  const curStufe = Number(inv.mahnstufe || 0) || (inv.status === 'gemahnt' ? 1 : 0);
  const recommendedStufe = Math.min(3, curStufe + 1);

  const daysSinceCreated = rnGetDaysSince(inv.created_at);
  const daysSinceLastMahnung = rnGetDaysSince(inv.mahn_datum);

  const cleanRecipientName = escapeHtml(inv.name || name || 'Empfänger');
  const targetEmailVal = initialEmail;

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender('Mahnung ' + recommendedStufe)
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType('Mahnung') : null);

  const senderEmail = (sender && sender.email) ? sender.email : 'kassier@sportschuetzen-muhen.ch';
  const senderName = (sender && (sender.vorname || sender.nachname))
    ? `${sender.vorname || ''} ${sender.nachname || ''}`.trim()
    : ((sender && sender.verein) || 'Sportschützen Muhen');

  // Layouts aus Speicher oder Defaults laden
  let layoutsMap = window._invoiceLayouts;
  if (!layoutsMap || Object.keys(layoutsMap).length === 0) {
    if (typeof rnGetDefaultLayouts === 'function') {
      layoutsMap = rnGetDefaultLayouts();
    }
    try {
      const stored = localStorage.getItem('portal_invoice_layouts');
      if (stored) {
        layoutsMap = { ...(layoutsMap || {}), ...JSON.parse(stored) };
      }
    } catch (_) {}
  }

  const replaceMailVars = (str, stufeNum) => {
    let res = String(str || '')
      .replace(/{vorname}/g, recipient.vorname || '')
      .replace(/{nachname}/g, recipient.nachname || '')
      .replace(/{anrede}/g, recipient.anrede || '')
      .replace(/{firma}/g, recipient.firma || '')
      .replace(/{abteilung}/g, recipient.abteilung || '')
      .replace(/{rechnungsnummer}/g, inv.id)
      .replace(/{rechnungsjahr}/g, String(inv.year || ''))
      .replace(/{gesamtbetrag}/g, Number(inv.total_amount || 0).toFixed(2))
      .replace(/{rechnungsdatum}/g, inv.created_at ? String(inv.created_at).split(' ')[0] : '')
      .replace(/{iban}/g, typeof VEREIN_IBAN !== 'undefined' ? VEREIN_IBAN : '')
      .replace(/{absender_name}/g, senderName)
      .replace(/{absender_email}/g, senderEmail)
      .replace(/{absender_vorname}/g, (sender && sender.vorname) || '')
      .replace(/{absender_nachname}/g, (sender && sender.nachname) || '')
      .replace(/{absender_verein}/g, (sender && sender.verein) || 'Sportschützen Muhen')
      .replace(/{absender_funktion}/g, (sender && sender.funktion) || 'Vorstand')
      .replace(/{mahnstufe}/g, String(stufeNum || 1));
    return res.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+,/g, ',');
  };

  window._rnMahnLayoutsMap = layoutsMap;
  window._rnMahnCurrentInvoice = inv;
  window._rnMahnRecipient = recipient;
  window._rnMahnSenderName = senderName;
  window._rnMahnSenderEmail = senderEmail;
  window._rnMahnReplaceMailVars = replaceMailVars;
  window._rnMahnSelectedStufe = recommendedStufe;

  const stufenLabels = {
    1: { name: '1. Zahlungserinnerung', frist: '14 Tage Frist', fee: 'CHF 0.–', color: 'warning', icon: 'fa-bell' },
    2: { name: '2. Mahnung', frist: '10 Tage Frist', fee: 'CHF 0.–', color: 'orange', icon: 'fa-exclamation-triangle' },
    3: { name: '3. / Letzte Mahnung', frist: '7 Tage Frist (Rechtsfolge)', fee: 'CHF 20.– (optional)', color: 'danger', icon: 'fa-radiation' }
  };
  window._rnMahnStufenLabels = stufenLabels;

  const initLayout = (layoutsMap && (layoutsMap[`Mahnung ${recommendedStufe}`] || layoutsMap['Mahnung']))
    || (typeof rnGetDefaultLayouts === 'function' ? (rnGetDefaultLayouts()[`Mahnung ${recommendedStufe}`] || rnGetDefaultLayouts()['Mahnung']) : {})
    || {};

  const cleanSubjNum = String(inv.id || '').replace(/^RE[-_]?/i, '') || String(inv.id || '');
  const initialSubject = (initLayout.mail_subject
    ? replaceMailVars(initLayout.mail_subject, recommendedStufe)
        .replace(new RegExp('Rechnung\\s+' + String(inv.id || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), 'Rechnung ' + cleanSubjNum)
        .replace(/Rechnung\s+RE[-_]/gi, 'Rechnung ')
        .replace(/\bRE-(\d)/gi, '$1')
    : `Zahlungserinnerung: Rechnung ${cleanSubjNum} | Sportschützen Muhen`);

  const initialBody = initLayout.mail_body
    ? replaceMailVars(initLayout.mail_body, recommendedStufe)
    : replaceMailVars('Guten Tag {vorname} {nachname},\n\nbei der Überprüfung unserer Buchhaltung haben wir festgestellt, dass für folgende Rechnung noch kein Zahlungseingang vorliegt:\n\nRechnungsnummer: {rechnungsnummer}\nAusstehender Betrag: CHF {gesamtbetrag}\n\nWir bitten dich höflich, den Betrag innert 14 Tagen zu begleichen. Den QR-Einzahlungsschein findest du im Anhang.\n\nSportliche Grüsse\nSportschützen Muhen', recommendedStufe);

  window._rnMahnDefaultSubject = initialSubject;
  window._rnMahnDefaultBody = initialBody;

  const cleanNameForFile = escapeHtml(String(inv.name || 'Empfaenger').replace(/\s+/g, '_'));
  const initialPdfFilename = `${recommendedStufe === 1 ? 'Zahlungserinnerung' : 'Mahnung_' + recommendedStufe}_${inv.id}_${cleanNameForFile}.pdf`;

  let modalEl = document.getElementById('rnModalSendMahnung');
  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.id = 'rnModalSendMahnung';
  modalEl.className = 'modal fade';
  modalEl.tabIndex = -1;
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(modalEl);

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow" style="position: relative;">
        
        <!-- Modal Header mit Move & Maximize -->
        <div class="modal-header bg-warning text-dark border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
          <h5 class="modal-title fw-bold mb-0">
            <i class="fas fa-exclamation-triangle me-2 text-dark"></i>Mahnwesen – Rechnung ${escapeHtml(inv.id)}
          </h5>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm text-dark p-1 border-0 shadow-none rn-modal-maximize-btn" title="Maximieren / Wiederherstellen" style="opacity: 0.85; line-height: 1;">
              <i class="fas fa-expand"></i>
            </button>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schliessen"></button>
          </div>
        </div>

        <div class="modal-body p-4">
          
          <!-- Optionale Mahn-Alerts -->
          ${nieMahnen ? `
            <div class="alert alert-danger d-flex align-items-center mb-3 py-2 px-3 rounded-3 shadow-2xs">
              <i class="fas fa-hand-paper fa-2x me-3"></i>
              <div>
                <strong>⚠️ VETO-HINWEIS: Option "Nie mahnen" ist aktiv!</strong><br>
                <span class="small">Für ${cleanRecipientName} ist in den Stammdaten eine Mahnsperre hinterlegt. Mahnungen sollten nur nach Vorstandsrücksprache versendet werden.</span>
              </div>
            </div>
          ` : ''}

          ${daysSinceLastMahnung !== null && daysSinceLastMahnung < 10 ? `
            <div class="alert alert-warning d-flex align-items-center mb-3 py-2 px-3 rounded-3 small shadow-2xs">
              <i class="fas fa-clock fa-lg me-2 text-danger"></i>
              <div>
                <strong>Kurzer Mahnabstand:</strong> Die letzte Mahnung wurde erst vor <strong>${daysSinceLastMahnung} Tagen</strong> versendet (am ${escapeHtml(inv.mahn_datum || 'kürzlich')}). Empfohlen wird ein Mindestabstand von 10–14 Tagen.
              </div>
            </div>
          ` : ''}

          <!-- Rechnungs-Info Leiste (Analog Rechnungsversand) -->
          <div class="d-flex flex-wrap align-items-center justify-content-between p-3 bg-light rounded-3 border mb-4 gap-2">
            <div>
              <span class="text-muted small">Empfänger / Debitor:</span>
              <div class="fw-bold text-dark fs-6">${cleanRecipientName}</div>
              <div class="text-muted font-monospace" style="font-size: 11px;">
                Rechnungs-ID: <strong class="text-primary">${inv.id}</strong> · Typ: <strong>${escapeHtml(inv.type || 'Rechnung')}</strong> ${inv.year ? `· ${inv.year}` : ''} ${inv.PersonNumber ? (String(inv.PersonNumber).startsWith('EXT') ? '· Kontakt ' + escapeHtml(inv.PersonNumber) : '· Mgl-Nr: ' + escapeHtml(inv.PersonNumber)) : ''}
              </div>
            </div>
            <div class="text-end">
              <span class="text-muted small">Rechnungsbetrag:</span>
              <div class="fw-bold fs-5 text-primary font-monospace">${fmtChf(inv.total_amount)}</div>
              <div class="d-flex align-items-center justify-content-end gap-1 mt-1">
                ${curStufe > 0 ? `
                  <span class="badge ${curStufe === 1 ? 'bg-warning text-dark' : (curStufe === 2 ? 'text-white' : 'bg-danger text-white')}" ${curStufe === 2 ? 'style="background-color: #fd7e14;"' : ''}>
                    Stufe ${curStufe} (${escapeHtml(inv.mahn_datum || 'gemahnt')})
                  </span>
                ` : `
                  <span class="badge bg-secondary">Noch nicht gemahnt</span>
                `}
                <span class="badge bg-white text-muted border" style="font-size: 10px;">
                  ${daysSinceCreated !== null ? `${daysSinceCreated} Tage her` : 'neu'}
                </span>
              </div>
            </div>
          </div>

          <form id="rn-mahnung-form" onsubmit="event.preventDefault(); rnExecuteSendMahnung(event, '${inv.id}');">
            
            <!-- Mahnstufen-Auswahl -->
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="form-label fw-bold small text-muted mb-0">
                  <i class="fas fa-layer-group me-1 text-warning"></i>Zu versendende Mahnstufe auswählen:
                </label>
                <span class="text-muted" style="font-size: 11px;">Klick auf eine Stufe lädt passende Vorlage</span>
              </div>
              <div class="row g-2">
                ${[1, 2, 3].map(st => {
                  const info = stufenLabels[st];
                  const isRec = st === recommendedStufe;
                  const isChecked = st === recommendedStufe;
                  return `
                    <div class="col-md-4">
                      <label class="card h-100 p-2.5 border rounded-3 text-start position-relative shadow-2xs rn-mahnstufe-card ${isChecked ? 'border-warning bg-warning-subtle shadow-sm' : 'border-secondary-subtle bg-white'}" id="rn-mahnstufe-card-${st}" style="cursor: pointer; transition: all 0.15s ease;">
                        <div class="d-flex align-items-center mb-1">
                          <input class="form-check-input me-2 mt-0" type="radio" name="rnMahnstufeRadio" id="rnStufe${st}" value="${st}" ${isChecked ? 'checked' : ''} onchange="rnSelectMahnstufe(${st})">
                          <span class="fw-bold small text-dark">${info.name}</span>
                        </div>
                        <div class="text-muted ps-4" style="font-size: 11px;">
                          <div><i class="fas fa-hourglass-half me-1 text-muted"></i>${info.frist}</div>
                          <div><i class="fas fa-coins me-1 text-muted"></i>Gebühr: ${info.fee}</div>
                        </div>
                        ${isRec ? `<span class="badge bg-primary position-absolute top-0 end-0 m-1" style="font-size:9px;">Empfohlen</span>` : ''}
                      </label>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="row g-3">
              
              <!-- Empfänger E-Mail -->
              <div class="col-md-7">
                <label class="form-label fw-bold small text-muted">
                  Empfänger E-Mail-Adresse <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-white"><i class="fas fa-at text-muted"></i></span>
                  <input type="email" class="form-control fw-bold" id="rn-mahnung-email" required value="${escapeHtml(targetEmailVal)}" placeholder="name@beispiel.ch">
                </div>
                <div class="form-text text-muted" style="font-size: 11px;">
                  ${targetEmailVal ? '<i class="fas fa-check-circle text-success me-1"></i>Aus Mitglieds-/Kontaktdaten übernommen' : '<i class="fas fa-exclamation-circle text-warning me-1"></i>Keine E-Mail hinterlegt – bitte eingeben'}
                </div>
              </div>

              <!-- Absender -->
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Absender</label>
                <div class="input-group">
                  <span class="input-group-text bg-light"><i class="fas fa-user-shield text-muted"></i></span>
                  <input type="text" class="form-control bg-light" readonly value="${escapeHtml(senderName)} <${escapeHtml(senderEmail)}>">
                </div>
                <div class="form-text text-muted" style="font-size: 11px;">
                  Zustelladresse des Vorstands
                </div>
              </div>

              <!-- Betreff -->
              <div class="col-12">
                <label class="form-label fw-bold small text-muted">
                  E-Mail Betreff <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-white"><i class="fas fa-heading text-muted"></i></span>
                  <input type="text" class="form-control fw-semibold" id="rn-mahnung-subject" required value="${escapeHtml(initialSubject)}">
                </div>
              </div>

              <!-- Hauptbereich: Vollständiger E-Mail Nachrichtentext mit Tabs (Bearbeiten / Vorschau) -->
              <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                  <label class="form-label fw-bold small text-muted mb-0">
                    <i class="fas fa-envelope-open-text me-1 text-warning"></i>E-Mail Nachrichtentext
                  </label>
                  
                  <div class="d-flex align-items-center gap-1.5">
                    <button type="button" class="btn btn-xs btn-outline-secondary py-1 px-2" onclick="rnResetMahnungTemplate()" title="Setzt Text und Betreff auf die Standard-Vorlage für diese Stufe zurück">
                      <i class="fas fa-undo me-1"></i>Vorlage neu laden
                    </button>
                    <div class="btn-group btn-group-sm" role="group">
                      <button type="button" id="rnm-mahn-tab-edit" class="btn btn-xs btn-warning active px-2.5 py-1 fw-bold text-dark" onclick="rnSwitchMahnungTab('edit')">
                        <i class="fas fa-edit me-1"></i>Bearbeiten
                      </button>
                      <button type="button" id="rnm-mahn-tab-prev" class="btn btn-xs btn-light border px-2.5 py-1 text-dark" onclick="rnSwitchMahnungTab('prev')">
                        <i class="fas fa-eye me-1"></i>E-Mail-Vorschau
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Pane 1: Vollständiger Text-Editor -->
                <div id="rnm-mahn-pane-edit">
                  <textarea class="form-control font-monospace" id="rn-mahnung-body" rows="9" style="font-size: 13px; line-height: 1.5;" placeholder="Vollständiger Mahnungs-Nachrichtentext...">${escapeHtml(initialBody)}</textarea>
                  <div class="form-text text-muted d-flex justify-content-between" style="font-size: 11px;">
                    <span id="rn-mahnung-body-hint"><i class="fas fa-info-circle me-1"></i>Vollständiger E-Mail-Text aus der Vorlage ('Mahnung ${recommendedStufe}'). Kann vor dem Senden frei angepasst werden.</span>
                  </div>
                </div>

                <!-- Pane 2: Live HTML-Vorschau -->
                <div id="rnm-mahn-pane-prev" class="d-none border rounded-3 p-3 bg-light shadow-2xs" style="min-height: 200px; max-height: 320px; overflow-y: auto;">
                  <div class="bg-white p-3 rounded-2 border shadow-xs" style="max-width: 600px; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif;">
                    <div class="d-flex align-items-center border-bottom pb-2 mb-3 gap-2">
                      <img src="https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-192.png" width="40" height="40" class="rounded" alt="Logo">
                      <div>
                        <div class="fw-bold text-dark" style="font-size: 14px; line-height: 1.2;">Sportschützen Muhen</div>
                        <div class="text-muted" style="font-size: 11px;" id="rnm-mahn-preview-header-subtitle">Mahnwesen · ${stufenLabels[recommendedStufe].name}</div>
                      </div>
                    </div>
                    <div class="text-muted small mb-2 font-monospace" style="font-size: 11px;">
                      <strong>Betreff:</strong> <span id="rnm-mahn-preview-subject">${escapeHtml(initialSubject)}</span>
                    </div>
                    <hr class="my-2 opacity-50">
                    <div id="rnm-mahn-preview-body-content" class="pt-3"></div>
                  </div>
                </div>

              </div>

              <!-- Anhang Badge -->
              <div class="col-12">
                <div class="p-3 bg-light rounded-3 border d-flex align-items-center justify-content-between">
                  <div class="d-flex align-items-center">
                    <div class="me-3 p-2 bg-white rounded border text-danger">
                      <i class="fas fa-file-pdf fa-2x"></i>
                    </div>
                    <div>
                      <strong class="d-block text-dark small" id="rn-mahnung-pdf-filename">${initialPdfFilename}</strong>
                      <span class="text-muted" style="font-size: 11px;">
                        <i class="fas fa-qrcode text-dark me-1"></i>Offizielles Mahnungsdokument mit Schweizer QR-Code Zahlteil und Rechnungskopie
                      </span>
                    </div>
                  </div>
                  <span class="badge bg-warning-subtle text-dark border border-warning-subtle px-2.5 py-1.5 rounded-pill">
                    <i class="fas fa-paperclip me-1"></i>Wird automatisch generiert & angehängt
                  </span>
                </div>
              </div>

            </div>

            <!-- Fehlermeldungs-Container -->
            <div id="rn-mahnung-error-alert" class="alert alert-danger d-none mt-3 mb-0" role="alert"></div>

            <div class="modal-footer px-0 pb-0 pt-4 border-top mt-4 d-flex justify-content-between">
              <button type="button" class="btn btn-light border" data-bs-dismiss="modal">
                Abbrechen
              </button>
              <button type="submit" class="btn btn-warning fw-bold px-4 shadow-sm" id="rn-mahnung-submit-btn">
                <i class="fas fa-paper-plane me-1.5"></i>Mahnung jetzt verbindlich versenden
              </button>
            </div>

          </form>

        </div>

        <!-- Resize-Grip Ecke unten rechts -->
        <div class="rn-modal-resizer" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;" title="Grösse durch Ziehen verändern">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M11 1v10H1V11h10z M11 5v6H5V11h6z M11 9v2H9V11h2z"/></svg>
        </div>

      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  rnMakeModalMovableAndResizable(modalEl);
};

// Hilfsfunktion: Stufenauswahl im Mahn-Modal umschalten
window.rnSelectMahnstufe = function(st) {
  window._rnMahnSelectedStufe = st;
  const inv = window._rnMahnCurrentInvoice;
  const recipient = window._rnMahnRecipient;
  const layoutsMap = window._rnMahnLayoutsMap;
  const replaceMailVars = window._rnMahnReplaceMailVars;
  const stufenLabels = window._rnMahnStufenLabels || {
    1: { name: '1. Zahlungserinnerung' },
    2: { name: '2. Mahnung' },
    3: { name: '3. / Letzte Mahnung' }
  };

  // 1. Radio & Visuelle Kartengestaltung aktualisieren
  [1, 2, 3].forEach(s => {
    const radio = document.getElementById(`rnStufe${s}`);
    if (radio) radio.checked = (s === st);

    const card = document.getElementById(`rn-mahnstufe-card-${s}`);
    if (card) {
      if (s === st) {
        card.classList.remove('border-secondary-subtle', 'bg-white');
        card.classList.add('border-warning', 'bg-warning-subtle', 'shadow-sm');
      } else {
        card.classList.remove('border-warning', 'bg-warning-subtle', 'shadow-sm');
        card.classList.add('border-secondary-subtle', 'bg-white');
      }
    }
  });

  // 2. Vorlage für gewählte Stufe ermitteln
  const key = `Mahnung ${st}`;
  const l = (layoutsMap && (layoutsMap[key] || layoutsMap['Mahnung']))
    || (typeof rnGetDefaultLayouts === 'function' ? (rnGetDefaultLayouts()[key] || rnGetDefaultLayouts()['Mahnung']) : {})
    || {};

  const cleanSubjNum = String(inv?.id || '').replace(/^RE[-_]?/i, '') || String(inv?.id || '');
  let defSubj = (l.mail_subject
    ? (replaceMailVars ? replaceMailVars(l.mail_subject, st) : l.mail_subject)
    : `Zahlungserinnerung: Rechnung ${cleanSubjNum} | Sportschützen Muhen`)
    .replace(new RegExp('Rechnung\\s+' + String(inv?.id || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), 'Rechnung ' + cleanSubjNum)
    .replace(/Rechnung\s+RE[-_]/gi, 'Rechnung ')
    .replace(/\bRE-(\d)/gi, '$1');

  let defBody = l.mail_body
    ? (replaceMailVars ? replaceMailVars(l.mail_body, st) : l.mail_body)
    : (replaceMailVars ? replaceMailVars('Guten Tag {vorname} {nachname},\n\nfür folgende Rechnung konnte noch kein Zahlungseingang festgestellt werden:\n\nRechnungsnummer: {rechnungsnummer}\nAusstehender Betrag: CHF {gesamtbetrag}\n\nWir bitten höflich um Überweisung.\n\nFreundliche Grüsse\nSportschützen Muhen', st) : '');

  window._rnMahnDefaultSubject = defSubj;
  window._rnMahnDefaultBody = defBody;

  const subjEl = document.getElementById('rn-mahnung-subject');
  const bodyEl = document.getElementById('rn-mahnung-body');
  if (subjEl) subjEl.value = defSubj;
  if (bodyEl) bodyEl.value = defBody;

  // 3. Hinweise & Badges aktualisieren
  const hintEl = document.getElementById('rn-mahnung-body-hint');
  if (hintEl) {
    hintEl.innerHTML = `<i class="fas fa-info-circle me-1"></i>Vollständiger E-Mail-Text aus der Vorlage ('Mahnung ${st}'). Kann vor dem Senden frei angepasst werden.`;
  }

  const subEl = document.getElementById('rnm-mahn-preview-header-subtitle');
  if (subEl) {
    subEl.textContent = `Mahnwesen · ${(stufenLabels[st] && stufenLabels[st].name) || 'Mahnung'}`;
  }

  const pdfEl = document.getElementById('rn-mahnung-pdf-filename');
  if (pdfEl && inv) {
    const cleanName = escapeHtml(String(inv.name || 'Empfaenger').replace(/\s+/g, '_'));
    pdfEl.textContent = `${st === 1 ? 'Zahlungserinnerung' : 'Mahnung_' + st}_${inv.id}_${cleanName}.pdf`;
  }

  // Falls Vorschau aktiv ist, Text synchronisieren
  const prevPane = document.getElementById('rnm-mahn-pane-prev');
  if (prevPane && !prevPane.classList.contains('d-none')) {
    rnSwitchMahnungTab('prev');
  }
};

// Rückwärtskompatibler Wrapper
window.rnUpdateMahnungPreview = function(stufe) {
  if (typeof window.rnSelectMahnstufe === 'function') {
    window.rnSelectMahnstufe(stufe);
  }
};

// Hilfsfunktionen für Mahn-Modal Tabs und Vorlagen-Reset
window.rnSwitchMahnungTab = function(mode) {
  const editTab = document.getElementById('rnm-mahn-tab-edit');
  const prevTab = document.getElementById('rnm-mahn-tab-prev');
  const editPane = document.getElementById('rnm-mahn-pane-edit');
  const prevPane = document.getElementById('rnm-mahn-pane-prev');
  const bodyText = document.getElementById('rn-mahnung-body')?.value || '';

  if (mode === 'prev') {
    if (editTab) {
      editTab.classList.remove('active', 'btn-warning');
      editTab.classList.add('btn-light', 'text-dark', 'border');
    }
    if (prevTab) {
      prevTab.classList.add('active', 'btn-warning');
      prevTab.classList.remove('btn-light', 'text-dark', 'border');
    }
    if (editPane) editPane.classList.add('d-none');
    if (prevPane) prevPane.classList.remove('d-none');

    const prevContent = document.getElementById('rnm-mahn-preview-body-content');
    if (prevContent) {
      const clean = String(bodyText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      const paras = clean.split(/\n\s*\n/);
      const parasHtml = paras.map(p => {
        const withBr = p.split('\n').map(line => escapeHtml(line.trim())).join('<br>');
        return `<p style="margin:0 0 12px 0;line-height:1.6;font-size:13px;color:#333;">${withBr}</p>`;
      }).join('');
      prevContent.innerHTML = parasHtml || '<p class="text-muted fst-italic">Kein Text vorhanden.</p>';
    }
    const subjPrev = document.getElementById('rnm-mahn-preview-subject');
    const subjVal = document.getElementById('rn-mahnung-subject')?.value || '';
    if (subjPrev) subjPrev.textContent = subjVal;
  } else {
    if (prevTab) {
      prevTab.classList.remove('active', 'btn-warning');
      prevTab.classList.add('btn-light', 'text-dark', 'border');
    }
    if (editTab) {
      editTab.classList.add('active', 'btn-warning');
      editTab.classList.remove('btn-light', 'text-dark', 'border');
    }
    if (prevPane) prevPane.classList.add('d-none');
    if (editPane) editPane.classList.remove('d-none');
    document.getElementById('rn-mahnung-body')?.focus();
  }
};

window.rnResetMahnungTemplate = function() {
  if (confirm('Möchtest du den E-Mail-Betreff und den Mahnungstext auf die Standard-Vorlage der aktuellen Stufe zurücksetzen?')) {
    const subjectEl = document.getElementById('rn-mahnung-subject');
    const bodyEl = document.getElementById('rn-mahnung-body');
    if (subjectEl) subjectEl.value = window._rnMahnDefaultSubject || '';
    if (bodyEl) bodyEl.value = window._rnMahnDefaultBody || '';
    window.rnSwitchMahnungTab('edit');
  }
};

// 2. MANUELLE MAHNUNG: VERSAND AUSFÜHREN
window.rnExecuteSendMahnung = async function(event, invoiceId) {
  if (event) event.preventDefault();

  const inv = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
  if (!inv) return;

  const emailInput = document.getElementById('rn-mahnung-email');
  const subjectInput = document.getElementById('rn-mahnung-subject');
  const bodyInput = document.getElementById('rn-mahnung-body');
  const submitBtn = document.getElementById('rn-mahnung-submit-btn');
  const errAlert = document.getElementById('rn-mahnung-error-alert');

  if (errAlert) { errAlert.classList.add('d-none'); errAlert.textContent = ''; }

  const targetEmail = emailInput ? emailInput.value.trim() : '';
  if (!targetEmail || !targetEmail.includes('@')) {
    if (emailInput) {
      emailInput.classList.add('is-invalid');
      emailInput.focus();
    }
    if (errAlert) {
      errAlert.textContent = 'Bitte eine gültige E-Mail-Adresse angeben.';
      errAlert.classList.remove('d-none');
    }
    return;
  }
  if (emailInput) emailInput.classList.remove('is-invalid');

  const stufeEl = document.querySelector('input[name="rnMahnstufeRadio"]:checked');
  const targetStufe = stufeEl ? Number(stufeEl.value) : (window._rnMahnSelectedStufe || 1);

  const stufenLabels = {
    1: '1. Zahlungserinnerung',
    2: '2. Mahnung',
    3: '3. / Letzte Mahnung vor Betreibung'
  };
  const stufenTitle = stufenLabels[targetStufe] || `Mahnung (Stufe ${targetStufe})`;

  if (!confirm(`Möchtest du wirklich die "${stufenTitle}" für Rechnung ${invoiceId} (${inv.name || ''}) per E-Mail an "${targetEmail}" versenden?`)) {
    return;
  }

  const targetSubject = subjectInput ? subjectInput.value.trim() : '';
  const targetBody = bodyInput ? bodyInput.value.trim() : '';

  const recipient = (typeof rnGetRecipientForInvoice === 'function')
    ? rnGetRecipientForInvoice(inv)
    : {
        vorname: inv.name.split(' ')[0] || '',
        nachname: inv.name.split(' ').slice(1).join(' ') || '',
        strasse: '', plz: '', ort: '', email: ''
      };
  recipient.email = targetEmail;

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender('Mahnung ' + targetStufe)
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType('Mahnung') : null);

  const layoutKey = `Mahnung ${targetStufe}`;
  const baseLayout = (window._invoiceLayouts && (window._invoiceLayouts[layoutKey] || window._invoiceLayouts['Mahnung']))
    || (typeof rnGetDefaultLayouts === 'function' ? (rnGetDefaultLayouts()[layoutKey] || rnGetDefaultLayouts()['Mahnung']) : {})
    || {};

  const cleanTargetSubject = (targetSubject || baseLayout.mail_subject || '')
    .replace(/Rechnung\s+RE[-_]/gi, 'Rechnung ')
    .replace(/\bRE-(\d)/gi, '$1');
  const customLayout = Object.assign({}, baseLayout, {
    mail_subject: cleanTargetSubject,
    mail_body: targetBody || baseLayout.mail_body,
    mail_intro: targetBody || baseLayout.mail_intro
  });

  const payload = {
    action: 'sendMahnung',
    invoiceId: invoiceId,
    mahnstufe: targetStufe,
    recipient: recipient,
    sender: sender,
    layout: customLayout
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Erstelle Mahnungs-PDF & sende E-Mail...';
  }

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      const modalEl = document.getElementById('rnModalSendMahnung');
      if (modalEl) {
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
      }

      // Optimistic Status Update in RAM-Datenbank
      const nowStr = result.mahn_datum || (typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH'));
      inv.status = 'gemahnt';
      inv.mahnstufe = targetStufe;
      inv.mahn_datum = nowStr;
      window.renderRechnungen();

      // Supabase PostgreSQL Master Update
      const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
      if (sb) {
        try {
          let hist = [];
          try {
            if (inv.mahn_historie) hist = typeof inv.mahn_historie === 'string' ? JSON.parse(inv.mahn_historie) : inv.mahn_historie;
          } catch (_) {}
          if (!Array.isArray(hist)) hist = [];
          hist.push({ stufe: targetStufe, datum: nowStr, email: targetEmail });
          inv.mahn_historie = hist;

          await sb.from('invoices').update({
            status: 'gemahnt',
            mahnstufe: targetStufe,
            mahn_datum: nowStr,
            mahn_historie: JSON.stringify(hist),
            updated_at: new Date().toISOString()
          }).eq('id', invoiceId);
        } catch (sbErr) {
          console.warn("⚠️ [Supabase] Dunning update warning:", sbErr);
        }
      }

      showSuccess(`🎉 ${stufenTitle} für Rechnung ${invoiceId} erfolgreich an ${targetEmail} versandt!`, 4000);

      setTimeout(async () => {
        try {
          await loadRechnungenData(true, true);
        } catch (_) {}
      }, 1000);
    } else {
      throw new Error(result.error || "Mahnungs-Versand fehlgeschlagen.");
    }
  } catch (err) {
    console.error("Fehler beim Mahnungs-Versand:", err);
    if (errAlert) {
      errAlert.textContent = 'Fehler beim Mahnungs-Versand: ' + err.message;
      errAlert.classList.remove('d-none');
    } else {
      alert("❌ Mahnung Fehler: " + err.message);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1.5"></i>Mahnung jetzt verbindlich versenden';
    }
  }
};

// Abwärtskompatibler Alias
window.rnSendMahnungPrompt = window.rnOpenMahnungModal;

// =====================================================================
// 3. AUTOMATISCHER SAMMEL-MAHNLAUF (BATCH-MAHNUNG)
// =====================================================================

// Ermittelt alle Rechnungen, die fällig für eine Mahnung sind
window.rnGetDueDunningInvoices = function() {
  const invoices = window._invoices || [];
  const candidates = [];

  invoices.forEach(inv => {
    const st = String(inv.status || '').toLowerCase();
    if (st === 'bezahlt' || st === 'storniert') return;

    const curStufe = Number(inv.mahnstufe || 0) || (st === 'gemahnt' ? 1 : 0);
    const m = (window._mglData || []).find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};
    const nieMahnen = m && (m.Niemahnen === '1' || m.Niemahnen === true || m.Niemahnen === 1);

    const daysSinceCreated = rnGetDaysSince(inv.created_at);
    const daysSinceLastMahnung = rnGetDaysSince(inv.mahn_datum);

    let isDue = false;
    let nextStufe = 1;
    let reason = '';

    if (curStufe === 0) {
      // Stufe 1 fällig, wenn Rechnung älter als 30 Tage ist
      if (daysSinceCreated !== null && daysSinceCreated >= 30) {
        isDue = true;
        nextStufe = 1;
        reason = `Rechnung seit ${daysSinceCreated} Tagen unbezahlt (Frist 30 Tage überschritten)`;
      }
    } else if (curStufe === 1) {
      // Stufe 2 fällig, wenn Erinnerung mindestens 14 Tage her ist
      if (daysSinceLastMahnung !== null && daysSinceLastMahnung >= 14) {
        isDue = true;
        nextStufe = 2;
        reason = `Zahlungserinnerung vor ${daysSinceLastMahnung} Tagen versendet (Frist 14 Tage)`;
      }
    } else if (curStufe === 2) {
      // Stufe 3 fällig, wenn 2. Mahnung mindestens 10 Tage her ist
      if (daysSinceLastMahnung !== null && daysSinceLastMahnung >= 10) {
        isDue = true;
        nextStufe = 3;
        reason = `2. Mahnung vor ${daysSinceLastMahnung} Tagen versendet (Frist 10 Tage)`;
      }
    }

    if (isDue) {
      const recipient = (typeof rnGetRecipientForInvoice === 'function')
        ? rnGetRecipientForInvoice(inv)
        : { email: '' };

      candidates.push({
        invoice: inv,
        curStufe: curStufe,
        nextStufe: nextStufe,
        reason: reason,
        nieMahnen: nieMahnen,
        email: recipient.email || '',
        daysOverdue: curStufe === 0 ? (daysSinceCreated - 30) : (daysSinceLastMahnung - (curStufe === 1 ? 14 : 10))
      });
    }
  });

  return candidates;
};

// Modal für Sammel-Mahnlauf öffnen
window.rnOpenBatchMahnungModal = async function() {
  // Externe Kontakte laden, falls noch nicht im Speicher
  if ((!window._externalContacts || window._externalContacts.length === 0) && typeof loadInvoiceContactsData === 'function') {
    try { await loadInvoiceContactsData(); } catch (_) {}
  }

  const candidates = window.rnGetDueDunningInvoices();

  let modalEl = document.getElementById('rnModalBatchMahnung');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalBatchMahnung';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  const stufenPills = {
    1: '<span class="badge bg-warning text-dark px-2 py-1"><i class="fas fa-bell me-1"></i>Stufe 1 (Erinnerung)</span>',
    2: '<span class="badge text-white px-2 py-1" style="background-color:#fd7e14;"><i class="fas fa-exclamation-triangle me-1"></i>Stufe 2 (2. Mahnung)</span>',
    3: '<span class="badge bg-danger text-white px-2 py-1"><i class="fas fa-radiation me-1"></i>Stufe 3 (Letzte Mahnung)</span>'
  };

  const candidateRowsHtml = candidates.length > 0 ? candidates.map((c, idx) => {
    const inv = c.invoice;
    const canSend = !c.nieMahnen && c.email && c.email.includes('@');
    const isChecked = canSend ? 'checked' : '';

    return `
      <tr class="${c.nieMahnen ? 'table-danger' : (!c.email ? 'table-warning' : '')}">
        <td class="text-center">
          <input type="checkbox" class="form-check-input rn-batch-check" id="rn-batch-item-${idx}" data-invoice-id="${inv.id}" data-next-stufe="${c.nextStufe}" data-email="${escapeHtml(c.email)}" ${isChecked} ${!canSend ? 'disabled' : ''} onchange="rnUpdateBatchSelectedCount()">
        </td>
        <td>
          <div class="fw-bold text-dark">${escapeHtml(inv.name)}</div>
          <div class="text-muted font-monospace small">${inv.id} · ${inv.type}</div>
        </td>
        <td class="text-end fw-bold font-monospace text-primary">${fmtChf(inv.total_amount)}</td>
        <td>
          ${stufenPills[c.nextStufe] || ''}
          <div class="text-muted" style="font-size:10px;">${escapeHtml(c.reason)}</div>
        </td>
        <td>
          ${c.email ? `<span class="small font-monospace text-dark">${escapeHtml(c.email)}</span>` : `<span class="badge bg-secondary">Keine E-Mail</span>`}
          ${c.nieMahnen ? `<div class="badge bg-danger mt-1">⚠️ "Nie mahnen" aktiv</div>` : ''}
        </td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="5" class="text-center text-muted py-4">
        <i class="fas fa-check-circle text-success fa-2x mb-2"></i><br>
        <strong>Grossartig!</strong> Es sind aktuell keine offenen Rechnungen für eine Mahnung fällig.
      </td>
    </tr>
  `;

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-xl">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-bullhorn me-2"></i>Automatischer Sammel-Mahnlauf (Fällige Mahnungen prüfen)
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <div class="alert alert-info py-2.5 px-3 rounded-3 small mb-3">
            <i class="fas fa-info-circle me-1.5"></i>
            Das System hat alle Rechnungen nach Schweizer Standardregeln geprüft:
            <strong>Stufe 1</strong> nach 30 Tagen Fälligkeit · 
            <strong>Stufe 2</strong> nach weiteren 14 Tagen · 
            <strong>Stufe 3</strong> nach weiteren 10 Tagen. 
            Mitglieder mit Sperre <em>"Nie mahnen"</em> werden automatisch geschützt.
          </div>

          <div class="table-responsive border rounded-3 mb-3" style="max-height: 420px; overflow-y: auto;">
            <table class="table table-hover align-middle mb-0" style="font-size: 13px;">
              <thead class="table-light sticky-top">
                <tr>
                  <th style="width: 40px;" class="text-center">
                    <input type="checkbox" class="form-check-input" id="rn-batch-select-all" checked onchange="rnToggleBatchSelectAll(this.checked)">
                  </th>
                  <th>Empfänger / Rechnung</th>
                  <th class="text-end" style="width: 130px;">Offener Betrag</th>
                  <th>Vorgeschlagene Mahnung</th>
                  <th>E-Mail & Prüfstatus</th>
                </tr>
              </thead>
              <tbody>
                ${candidateRowsHtml}
              </tbody>
            </table>
          </div>

          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-2 border-top">
            <div class="text-muted small">
              <span id="rn-batch-selected-label">0</span> Rechnungen für den Versand ausgewählt.
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-light" data-bs-dismiss="modal">Schliessen</button>
              <button type="button" class="btn btn-warning fw-bold px-4 shadow-sm" id="rn-batch-submit-btn" onclick="rnExecuteBatchMahnung()" ${candidates.length === 0 ? 'disabled' : ''}>
                <i class="fas fa-paper-plane me-1.5"></i> Ausgewählte Mahnungen jetzt versenden
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  rnUpdateBatchSelectedCount();
};

// Hilfsfunktion: Select-All Checkbox im Batch-Mahnlauf
window.rnToggleBatchSelectAll = function(isChecked) {
  const checkboxes = document.querySelectorAll('.rn-batch-check:not(:disabled)');
  checkboxes.forEach(cb => cb.checked = isChecked);
  rnUpdateBatchSelectedCount();
};

// Hilfsfunktion: Zähler der ausgewählten Mahnungen aktualisieren
window.rnUpdateBatchSelectedCount = function() {
  const checkedBoxes = document.querySelectorAll('.rn-batch-check:checked');
  const count = checkedBoxes.length;
  const label = document.getElementById('rn-batch-selected-label');
  const btn = document.getElementById('rn-batch-submit-btn');

  if (label) label.textContent = count;
  if (btn) {
    btn.disabled = count === 0;
    btn.innerHTML = `<i class="fas fa-paper-plane me-1.5"></i> ${count} Mahnung${count === 1 ? '' : 'en'} jetzt versenden`;
  }
};

// 4. AUTOMATISCHER SAMMEL-MAHNLAUF: AUSFÜHRUNG
window.rnExecuteBatchMahnung = async function() {
  const checkedBoxes = document.querySelectorAll('.rn-batch-check:checked');
  if (checkedBoxes.length === 0) {
    alert("❌ Bitte wählen Sie mindestens eine Rechnung für den Mahnlauf aus.");
    return;
  }

  if (!confirm(`Möchtest du wirklich ${checkedBoxes.length} Mahnungen generieren und per E-Mail versenden?`)) {
    return;
  }

  const items = [];
  checkedBoxes.forEach(cb => {
    const invId = cb.getAttribute('data-invoice-id');
    const stufe = Number(cb.getAttribute('data-next-stufe') || 1);
    const email = cb.getAttribute('data-email');
    const inv = window._invoices.find(i => String(i.id) === String(invId));
    if (inv) {
      const recipient = (typeof rnGetRecipientForInvoice === 'function')
        ? rnGetRecipientForInvoice(inv)
        : { email: email };
      recipient.email = email;

      items.push({
        invoiceId: invId,
        mahnstufe: stufe,
        recipient: recipient
      });
    }
  });

  // Modal schliessen
  const modalEl = document.getElementById('rnModalBatchMahnung');
  if (modalEl) {
    const mInstance = bootstrap.Modal.getInstance(modalEl);
    if (mInstance) mInstance.hide();
  }

  showLoadingOverlay(`Verarbeite Sammel-Mahnlauf (${items.length} Mahnungen werden erstellt und versendet)...`);

  try {
    const response = await apiFetch('rechnungen', {
      action: 'sendBatchMahnung',
      items: items
    }, 'POST');
    const result = await response.json();

    if (result.success) {
      hideLoadingOverlay();
      // Optimistic update
      const nowStr = typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH');
      items.forEach(itm => {
        const inv = window._invoices.find(i => String(i.id) === String(itm.invoiceId));
        if (inv) {
          inv.status = 'gemahnt';
          inv.mahnstufe = itm.mahnstufe;
          inv.mahn_datum = nowStr;
        }
      });
      window.renderRechnungen();
      showSuccess(`🎉 ${result.message || 'Sammel-Mahnlauf erfolgreich abgeschlossen!'}`, 4000);
      setTimeout(async () => {
        try {
          await loadRechnungenData(true, true);
        } catch (_) {}
      }, 1000);
    } else {
      throw new Error(result.error || "Sammel-Mahnlauf fehlgeschlagen.");
    }
  } catch (err) {
    hideLoadingOverlay();
    alert("❌ Sammel-Mahnlauf Fehler: " + err.message);
  } finally {
    hideLoadingOverlay();
  }
};

// =====================================================================
// 5. TABELLEN-SELEKTION & MASSENVERSAND VON RECHNUNGEN
// =====================================================================

// Tabellenauswahl: Alle Checkboxen umschalten
window.rnToggleTableSelectAll = function(isChecked) {
  const checkboxes = document.querySelectorAll('.rn-table-row-check');
  checkboxes.forEach(cb => { cb.checked = isChecked; });
  rnOnTableRowSelectChange();
};

// Tabellenauswahl: Event-Handler bei Änderung
window.rnOnTableRowSelectChange = function() {
  const checkboxes = document.querySelectorAll('.rn-table-row-check');
  const checked = document.querySelectorAll('.rn-table-row-check:checked');
  const selectAll = document.getElementById('rn-table-select-all');
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
  }

  const bar = document.getElementById('rn-table-selection-bar');
  const countLabel = document.getElementById('rn-selected-count');
  if (countLabel) countLabel.textContent = checked.length;

  if (bar) {
    if (checked.length > 0) {
      bar.classList.remove('d-none');
    } else {
      bar.classList.add('d-none');
    }
  }
};

// Ausgewählte Rechnungs-IDs abrufen
window.rnGetSelectedInvoiceIds = function() {
  const checked = document.querySelectorAll('.rn-table-row-check:checked');
  return Array.from(checked).map(cb => cb.value || cb.getAttribute('data-id')).filter(Boolean);
};

// Auswahl leeren
window.rnClearTableSelection = function() {
  const checkboxes = document.querySelectorAll('.rn-table-row-check');
  checkboxes.forEach(cb => { cb.checked = false; });
  const selectAll = document.getElementById('rn-table-select-all');
  if (selectAll) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  }
  const bar = document.getElementById('rn-table-selection-bar');
  if (bar) bar.classList.add('d-none');
};

// Massenversand aus Tabellenauswahl starten
window.rnStartMassSendFromSelection = function() {
  const ids = rnGetSelectedInvoiceIds();
  if (ids.length === 0) {
    alert("Bitte wähle mindestens eine Rechnung in der Tabelle aus.");
    return;
  }
  rnOpenMassSendModal(ids);
};

// State für Massenversand-Filterung im Modal
window._rnMassSendActiveFilter = 'unsent';
window._rnMassSendTypeFilter = 'alle';
window._rnMassSendCancelled = false;
window._rnMassSendInProgress = false;
window._rnMassSendPreselectedIds = [];

// Modal für Massenversand öffnen
window.rnOpenMassSendModal = async function(preselectedIds = []) {
  if ((!window._externalContacts || window._externalContacts.length === 0) && typeof loadInvoiceContactsData === 'function') {
    try { await loadInvoiceContactsData(); } catch (_) {}
  }
  if ((!window._mglData || window._mglData.length === 0) && typeof loadMitgliederData === 'function') {
    try { await loadMitgliederData(false); } catch (_) {}
  }

  let modalEl = document.getElementById('rnModalMassSend');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalMassSend';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  window._rnMassSendCancelled = false;
  window._rnMassSendInProgress = false;
  window._rnMassSendPreselectedIds = Array.isArray(preselectedIds) ? preselectedIds : [];
  if (window._rnMassSendPreselectedIds.length > 0) {
    window._rnMassSendActiveFilter = 'selection';
  } else {
    window._rnMassSendActiveFilter = 'unsent';
  }

  rnRenderMassSendModalContent(modalEl);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
};

window.rnRenderMassSendModalContent = function(modalEl) {
  if (!modalEl) modalEl = document.getElementById('rnModalMassSend');
  if (!modalEl) return;

  const preselected = window._rnMassSendPreselectedIds || [];
  const currentFilter = window._rnMassSendActiveFilter || 'unsent';
  const typeFilter = window._rnMassSendTypeFilter || 'alle';

  // 1. Rechnungen filtern
  let candidates = (window._invoices || []).filter(inv => {
    // Typ Filter
    if (typeFilter !== 'alle' && String(inv.type || '').toLowerCase() !== typeFilter.toLowerCase()) {
      return false;
    }

    if (currentFilter === 'selection') {
      return preselected.includes(String(inv.id));
    }
    if (currentFilter === 'unsent') {
      return inv.mail_status !== 'gesendet';
    }
    if (currentFilter === 'open') {
      return String(inv.status || '').toLowerCase() !== 'bezahlt';
    }
    if (currentFilter === 'all') {
      return true;
    }
    return true;
  });

  // Empfängerdetails für Kandidaten auflösen
  const rowsData = candidates.map(inv => {
    const recipient = (typeof rnGetRecipientForInvoice === 'function')
      ? rnGetRecipientForInvoice(inv)
      : { email: '' };
    const hasEmail = Boolean(recipient.email && recipient.email.includes('@'));
    const isAlreadySent = inv.mail_status === 'gesendet';
    return {
      invoice: inv,
      recipient: recipient,
      email: recipient.email || '',
      hasEmail: hasEmail,
      isAlreadySent: isAlreadySent
    };
  });

  const totalCount = rowsData.length;
  const readyCount = rowsData.filter(r => r.hasEmail).length;
  const missingEmailCount = totalCount - readyCount;
  const totalAmount = rowsData.reduce((s, r) => s + Number(r.invoice.total_amount || 0), 0);

  const tableRowsHtml = rowsData.length > 0 ? rowsData.map((row, idx) => {
    const inv = row.invoice;
    const isChecked = row.hasEmail ? 'checked' : '';
    const sentBadge = row.isAlreadySent
      ? `<span class="badge bg-info-subtle text-info border border-info-subtle ms-1" style="font-size: 11px;"><i class="fas fa-history me-1"></i>Bereits versendet</span>`
      : `<span class="badge bg-secondary-subtle text-muted border border-secondary-subtle ms-1" style="font-size: 11px;"><i class="fas fa-envelope-open me-1"></i>Noch nicht versendet</span>`;

    return `
      <tr id="rn-mass-row-${inv.id}" class="rn-batch-item-row align-middle">
        <td class="text-center tk-col-check" style="width: 44px;">
          <input type="checkbox" class="form-check-input rn-mass-item-check" 
                 id="rn-mass-check-${idx}" 
                 data-invoice-id="${inv.id}" 
                 data-idx="${idx}" 
                 ${isChecked} 
                 onchange="rnUpdateMassSendSelectedCount()">
        </td>
        <td class="tk-col-id">
          <span class="bh-konto-badge bh-konto-soll-badge rn-id-badge">${inv.id}</span>
          <span class="badge bg-light text-dark border ms-1" style="font-size: 11.5px;">${escapeHtml(inv.type || 'Rechnung')}</span>
        </td>
        <td class="tk-col-recipient">
          <div class="fw-bold text-dark mb-0">${escapeHtml(inv.name)}</div>
          <div class="text-muted small">${sentBadge}</div>
        </td>
        <td class="tk-col-email">
          <div class="input-group input-group-sm" style="max-width: 280px;">
            <span class="input-group-text bg-white ${row.hasEmail ? 'text-success' : 'text-danger'}">
              <i class="fas ${row.hasEmail ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
            </span>
            <input type="email" class="form-control form-control-sm rn-mass-email-input" 
                   id="rn-mass-email-${inv.id}" 
                   value="${escapeHtml(row.email)}" 
                   placeholder="E-Mail eingeben..." 
                   oninput="rnOnMassEmailChange('${inv.id}', this.value)">
          </div>
        </td>
        <td class="text-end fw-bold text-primary font-monospace tk-col-amount" style="font-size: 14.5px;">
          ${fmtChf(inv.total_amount)}
        </td>
        <td class="text-center tk-col-status" style="width: 140px;" id="rn-mass-status-col-${inv.id}">
          <span class="badge bg-light text-muted border py-1.5 px-2.5 font-monospace" id="rn-mass-row-badge-${inv.id}" style="font-size: 11.5px;">
            <i class="fas fa-clock me-1 text-secondary"></i>Wartet
          </span>
        </td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="6" class="text-center text-muted py-4">
        <i class="fas fa-info-circle me-1"></i>Keine Rechnungen für die ausgewählten Filterkriterien gefunden.
      </td>
    </tr>
  `;

  modalEl.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 shadow-lg rounded-4">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <div>
            <h5 class="modal-title fw-bold mb-0">
              <i class="fas fa-paper-plane me-2"></i>Massenversand: Rechnungen per E-Mail
            </h5>
            <div class="small text-white-50 mt-0.5">Automatisierter Rechnungsversand mit Schweizer QR-Rechnung (PDF-Anhang)</div>
          </div>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close" id="rn-mass-close-x"></button>
        </div>

        <div class="modal-body p-4">
          <!-- Filterleiste & Schnellfilter -->
          <div class="p-3 bg-light rounded-3 border mb-3">
            <div class="row g-2 align-items-center justify-content-between">
              <div class="col-md-8 d-flex flex-wrap align-items-center gap-1.5">
                <span class="text-muted small fw-bold me-1">Filter:</span>
                <button type="button" class="btn btn-xs ${currentFilter === 'unsent' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="rnSetMassSendFilter('unsent')">
                  <i class="fas fa-envelope-open me-1"></i>Noch nicht versendet
                </button>
                <button type="button" class="btn btn-xs ${currentFilter === 'open' ? 'btn-danger' : 'btn-outline-danger'}" onclick="rnSetMassSendFilter('open')">
                  <i class="fas fa-clock me-1"></i>Alle offenen
                </button>
                <button type="button" class="btn btn-xs ${currentFilter === 'all' ? 'btn-secondary text-white' : 'btn-outline-secondary'}" onclick="rnSetMassSendFilter('all')">
                  <i class="fas fa-list me-1"></i>Alle Rechnungen
                </button>
                ${preselected.length > 0 ? `
                  <button type="button" class="btn btn-xs ${currentFilter === 'selection' ? 'btn-info text-white' : 'btn-outline-info'}" onclick="rnSetMassSendFilter('selection')">
                    <i class="fas fa-check-square me-1"></i>Tabellenauswahl (${preselected.length})
                  </button>
                ` : ''}
                <div id="rn-mass-col-toggle" class="d-inline-block ms-1"></div>
              </div>
              <div class="col-md-4 text-md-end">
                <select class="form-select form-select-sm" id="rn-mass-type-select" onchange="rnSetMassSendTypeFilter(this.value)">
                  <option value="alle" ${typeFilter === 'alle' ? 'selected' : ''}>Alle Rechnungstypen</option>
                  <option value="Jahresbeitrag" ${typeFilter === 'Jahresbeitrag' ? 'selected' : ''}>Jahresbeitrag</option>
                  <option value="Vermietung" ${typeFilter === 'Vermietung' ? 'selected' : ''}>Vermietung</option>
                  <option value="Materialverkauf" ${typeFilter === 'Materialverkauf' ? 'selected' : ''}>Materialverkauf</option>
                  <option value="Schulsport" ${typeFilter === 'Schulsport' ? 'selected' : ''}>Schulsport</option>
                  <option value="Sponsoring" ${typeFilter === 'Sponsoring' ? 'selected' : ''}>Sponsoring / Gönner</option>
                  <option value="Sonstige" ${typeFilter === 'Sonstige' ? 'selected' : ''}>Sonstige / Diverse</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Live Progress Box (Standard versteckt) -->
          <div id="rn-mass-progress-box" class="d-none alert alert-primary py-3 px-4 rounded-3 mb-3 border border-primary-subtle shadow-sm">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-bold fs-6" id="rn-mass-progress-title">
                <i class="fas fa-spinner fa-spin me-2"></i>Massenversand wird ausgeführt...
              </span>
              <span class="badge bg-primary fs-6 font-monospace" id="rn-mass-progress-percent">0%</span>
            </div>
            <div class="progress mb-2" style="height: 18px; border-radius: 9px; background-color: rgba(255,255,255,0.6);">
              <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" id="rn-mass-progress-bar" style="width: 0%;"></div>
            </div>
            <div class="d-flex justify-content-between text-muted small">
              <span id="rn-mass-progress-detail">Initialisiere Versand...</span>
              <span class="font-monospace fw-bold" id="rn-mass-progress-counts">0 / 0</span>
            </div>
          </div>

          <!-- Tabelle mit Kandidaten -->
          <div class="table-responsive border rounded-3 mb-3" style="max-height: 400px; overflow-y: auto;">
            <table class="table table-hover align-middle mb-0" style="font-size: 13.5px;" id="rn-mass-send-table">
              <thead class="table-light sticky-top">
                <tr>
                  <th data-col-id="check" data-col-name="Auswahl" style="width: 44px;" class="text-center">
                    <input type="checkbox" class="form-check-input" id="rn-mass-select-all" checked onchange="rnToggleMassSendSelectAll(this.checked)">
                  </th>
                  <th data-col-id="id" data-col-name="Rechnung" style="width: 170px;">Rechnung</th>
                  <th data-col-id="recipient" data-col-name="Empfänger">Empfänger</th>
                  <th data-col-id="email" data-col-name="E-Mail-Adresse" style="width: 290px;">E-Mail-Adresse</th>
                  <th data-col-id="amount" data-col-name="Betrag" class="text-end" style="width: 140px;">Betrag</th>
                  <th data-col-id="status" data-col-name="Status" class="text-center" style="width: 140px;">Status</th>
                </tr>
              </thead>
              <tbody id="rn-mass-tbody">
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- Footer Steuerung -->
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-2 border-top">
            <div class="text-muted small">
              <span class="fw-bold text-dark" id="rn-mass-selected-label">${readyCount}</span> von <span class="fw-bold">${totalCount}</span> Rechnungen ausgewählt.
              <span class="text-primary font-monospace ms-2 fw-semibold" id="rn-mass-amount-label">Gesamt: ${fmtChf(totalAmount)}</span>
              ${missingEmailCount > 0 ? `<span class="badge bg-warning text-dark ms-2"><i class="fas fa-exclamation-triangle me-1"></i>${missingEmailCount} ohne E-Mail</span>` : ''}
            </div>

            <div class="d-flex gap-2 align-items-center" id="rn-mass-btn-group">
              <button type="button" class="btn btn-light" data-bs-dismiss="modal" id="rn-mass-cancel-btn">Schliessen</button>
              <button type="button" class="btn btn-primary fw-bold px-4 shadow-sm" id="rn-mass-submit-btn" onclick="rnExecuteMassSend()" ${readyCount === 0 ? 'disabled' : ''}>
                <i class="fas fa-paper-plane me-1.5"></i> <span id="rn-mass-submit-text">${readyCount} Rechnungen jetzt versenden</span>
              </button>
              <button type="button" class="btn btn-danger fw-bold px-3 d-none shadow-sm" id="rn-mass-abort-btn" onclick="rnAbortMassSend()">
                <i class="fas fa-stop-circle me-1.5"></i> Abbrechen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  rnUpdateMassSendSelectedCount();

  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
    window.TableKit.setupColumnToggle('#rn-mass-send-table', {
      container: '#rn-mass-col-toggle',
      storageKey: 'rn_mass_send_table_cols'
    });
  }
};

window.rnSetMassSendFilter = function(filterName) {
  window._rnMassSendActiveFilter = filterName;
  rnRenderMassSendModalContent();
};

window.rnSetMassSendTypeFilter = function(typeName) {
  window._rnMassSendTypeFilter = typeName;
  rnRenderMassSendModalContent();
};

window.rnOnMassEmailChange = function(invoiceId, newEmail) {
  const cb = document.querySelector(`.rn-mass-item-check[data-invoice-id="${invoiceId}"]`);
  if (cb) {
    const isValid = Boolean(newEmail && newEmail.includes('@'));
    if (!cb.checked && isValid) {
      cb.checked = true;
    }
  }
  rnUpdateMassSendSelectedCount();
};

window.rnToggleMassSendSelectAll = function(isChecked) {
  const checkboxes = document.querySelectorAll('.rn-mass-item-check');
  checkboxes.forEach(cb => { cb.checked = isChecked; });
  rnUpdateMassSendSelectedCount();
};

window.rnUpdateMassSendSelectedCount = function() {
  const checkedBoxes = document.querySelectorAll('.rn-mass-item-check:checked');
  const allBoxes = document.querySelectorAll('.rn-mass-item-check');
  const selectAll = document.getElementById('rn-mass-select-all');
  if (selectAll) {
    selectAll.checked = allBoxes.length > 0 && checkedBoxes.length === allBoxes.length;
    selectAll.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < allBoxes.length;
  }

  let validSelectedCount = 0;
  let totalAmount = 0;

  checkedBoxes.forEach(cb => {
    const invId = cb.getAttribute('data-invoice-id');
    const emailInput = document.getElementById(`rn-mass-email-${invId}`);
    const email = emailInput ? emailInput.value.trim() : '';
    if (email && email.includes('@')) {
      validSelectedCount++;
    }
    const inv = (window._invoices || []).find(i => String(i.id) === String(invId));
    if (inv) totalAmount += Number(inv.total_amount || 0);
  });

  const label = document.getElementById('rn-mass-selected-label');
  if (label) label.textContent = validSelectedCount;

  const amountLabel = document.getElementById('rn-mass-amount-label');
  if (amountLabel) amountLabel.textContent = `Gesamt: ${fmtChf(totalAmount)}`;

  const submitBtn = document.getElementById('rn-mass-submit-btn');
  const submitText = document.getElementById('rn-mass-submit-text');
  if (submitBtn && submitText) {
    if (validSelectedCount > 0 && !window._rnMassSendInProgress) {
      submitBtn.removeAttribute('disabled');
      submitText.textContent = `${validSelectedCount} Rechnungen jetzt versenden`;
    } else if (!window._rnMassSendInProgress) {
      submitBtn.setAttribute('disabled', 'true');
      submitText.textContent = `Keine Rechnungen ausgewählt`;
    }
  }
};

window.rnAbortMassSend = function() {
  if (window._rnMassSendInProgress) {
    window._rnMassSendCancelled = true;
    const detail = document.getElementById('rn-mass-progress-detail');
    if (detail) detail.textContent = 'Abbruch angefordert... Bitte warten.';
  }
};

// Ausführung des Massenversands mit Live Progress Bar
window.rnExecuteMassSend = async function() {
  const checkedBoxes = document.querySelectorAll('.rn-mass-item-check:checked');
  const itemsToSend = [];

  checkedBoxes.forEach(cb => {
    const invId = cb.getAttribute('data-invoice-id');
    const emailInput = document.getElementById(`rn-mass-email-${invId}`);
    const email = emailInput ? emailInput.value.trim() : '';
    const inv = (window._invoices || []).find(i => String(i.id) === String(invId));

    if (inv && email && email.includes('@')) {
      const recipient = (typeof rnGetRecipientForInvoice === 'function')
        ? rnGetRecipientForInvoice(inv)
        : {};
      recipient.email = email;
      itemsToSend.push({
        invoice: inv,
        invoiceId: invId,
        recipient: recipient
      });
    }
  });

  if (itemsToSend.length === 0) {
    alert("❌ Bitte wähle mindestens eine Rechnung mit gültiger E-Mail-Adresse aus.");
    return;
  }

  if (!confirm(`Möchtest du wirklich ${itemsToSend.length} Rechnungen als PDF mit Schweizer QR-Code generieren und per E-Mail versenden?`)) {
    return;
  }

  window._rnMassSendInProgress = true;
  window._rnMassSendCancelled = false;

  // UI in Progress-Modus umschalten
  const progressBox = document.getElementById('rn-mass-progress-box');
  const progressBar = document.getElementById('rn-mass-progress-bar');
  const progressPercent = document.getElementById('rn-mass-progress-percent');
  const progressTitle = document.getElementById('rn-mass-progress-title');
  const progressDetail = document.getElementById('rn-mass-progress-detail');
  const progressCounts = document.getElementById('rn-mass-progress-counts');
  const submitBtn = document.getElementById('rn-mass-submit-btn');
  const cancelBtn = document.getElementById('rn-mass-cancel-btn');
  const abortBtn = document.getElementById('rn-mass-abort-btn');
  const closeX = document.getElementById('rn-mass-close-x');

  if (progressBox) progressBox.classList.remove('d-none');
  if (submitBtn) submitBtn.classList.add('d-none');
  if (cancelBtn) cancelBtn.classList.add('d-none');
  if (closeX) closeX.classList.add('d-none');
  if (abortBtn) abortBtn.classList.remove('d-none');

  let successCount = 0;
  let failCount = 0;
  const total = itemsToSend.length;
  const nowSwiss = typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH');

  // Alle Checkboxen deaktivieren während Versand
  document.querySelectorAll('.rn-mass-item-check').forEach(cb => { cb.setAttribute('disabled', 'true'); });

  for (let i = 0; i < total; i++) {
    if (window._rnMassSendCancelled) {
      if (progressDetail) progressDetail.textContent = 'Versand durch Benutzer abgebrochen.';
      break;
    }

    const itm = itemsToSend[i];
    const inv = itm.invoice;
    const pct = Math.round((i / total) * 100);

    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (progressCounts) progressCounts.textContent = `${i + 1} / ${total}`;
    if (progressDetail) progressDetail.textContent = `Sende Rechnung ${inv.id} an ${inv.name} (${itm.recipient.email})...`;

    // Zeilen-Badge aktualisieren
    const badge = document.getElementById(`rn-mass-row-badge-${inv.id}`);
    if (badge) {
      badge.className = 'badge bg-primary text-white py-1.5 px-2.5';
      badge.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Sende...`;
    }

    try {
      const sender = (typeof rnGetLoggedInSender === 'function')
        ? rnGetLoggedInSender(inv.type || 'Jahresbeitrag')
        : null;
      const layout = (window._invoiceLayouts && window._invoiceLayouts[inv.type]) || null;

      const response = await apiFetch('rechnungen', {
        action: 'sendInvoiceEmail',
        invoiceId: inv.id,
        recipient: itm.recipient,
        sender: sender,
        layout: layout
      }, 'POST');

      const result = await response.json();
      if (result.success) {
        successCount++;
        inv.mail_status = 'gesendet';
        inv.send_date = result.sendDate || nowSwiss;
        inv.updated_at = nowSwiss;
        if (badge) {
          badge.className = 'badge bg-success text-white py-1.5 px-2.5';
          badge.innerHTML = `<i class="fas fa-check me-1"></i>Gesendet`;
        }

        const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
        if (sb) {
          sb.from('invoices').update({
            mail_status: 'gesendet',
            send_date: inv.send_date,
            updated_at: new Date().toISOString()
          }).eq('id', inv.id).then(() => {}).catch(() => {});
        }
      } else {
        throw new Error(result.error || 'Serverfehler beim Versand');
      }
    } catch (sendErr) {
      failCount++;
      console.error(`Fehler bei Rechnung ${inv.id}:`, sendErr);
      if (badge) {
        badge.className = 'badge bg-danger text-white py-1.5 px-2.5';
        badge.title = sendErr.message;
        badge.innerHTML = `<i class="fas fa-times me-1"></i>Fehler`;
      }
    }

    // Kleine Pause (250ms), um Server nicht zu überlasten
    await new Promise(r => setTimeout(r, 250));
  }

  // Abschluss
  window._rnMassSendInProgress = false;
  const finalPct = window._rnMassSendCancelled ? Math.round(((successCount + failCount) / total) * 100) : 100;

  if (progressBar) {
    progressBar.style.width = `${finalPct}%`;
    progressBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
    if (failCount === 0 && !window._rnMassSendCancelled) {
      progressBar.classList.remove('bg-primary');
      progressBar.classList.add('bg-success');
    } else {
      progressBar.classList.remove('bg-primary');
      progressBar.classList.add('bg-warning');
    }
  }
  if (progressPercent) progressPercent.textContent = `${finalPct}%`;
  if (progressCounts) progressCounts.textContent = `${successCount + failCount} / ${total}`;

  if (progressTitle) {
    if (window._rnMassSendCancelled) {
      progressTitle.innerHTML = `<i class="fas fa-exclamation-triangle text-warning me-2"></i>Massenversand abgebrochen`;
    } else if (failCount === 0) {
      progressTitle.innerHTML = `<i class="fas fa-check-circle text-success me-2"></i>Massenversand erfolgreich abgeschlossen!`;
    } else {
      progressTitle.innerHTML = `<i class="fas fa-info-circle text-warning me-2"></i>Massenversand mit Hinweisen abgeschlossen`;
    }
  }

  if (progressDetail) {
    progressDetail.innerHTML = `<strong>${successCount}</strong> erfolgreich versendet${failCount > 0 ? `, <span class="text-danger"><strong>${failCount}</strong> fehlgeschlagen</span>` : ''}.`;
  }

  // Buttons zurücksetzen
  if (abortBtn) abortBtn.classList.add('d-none');
  if (cancelBtn) {
    cancelBtn.classList.remove('d-none');
    cancelBtn.textContent = 'Schliessen';
  }
  if (closeX) closeX.classList.remove('d-none');

  // Haupttabelle im Hintergrund sofort aktualisieren
  if (typeof rnRenderTable === 'function') rnRenderTable();
  if (typeof showSuccess === 'function') {
    showSuccess(`🎉 ${successCount} Rechnungen erfolgreich versendet!`);
  }

  // Nachgeladener Sync
  setTimeout(async () => {
    try {
      if (typeof loadRechnungenData === 'function') await loadRechnungenData(true, true);
      if (typeof jbMergeInvoicesIntoData === 'function' && window._jbData) {
        jbMergeInvoicesIntoData(window._invoices || []);
        if (typeof renderJahresbeitragView === 'function') renderJahresbeitragView();
      }
    } catch (_) {}
  }, 1200);
};

// =====================================================================
// 6. EXTERNE KONTAKTE VERWALTUNG (CRUD STRENG NACH ID)
// =====================================================================
window.rnOpenContactModal = function(contactId = null) {
  let modalEl = document.getElementById('rnModalContact');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalContact';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  let contact = null;
  if (contactId) {
    contact = (window._externalContacts || []).find(c => String(c.id).trim() === String(contactId).trim());
  }

  const isFirma = contact ? (contact.typ === 'firma' || Boolean(contact.firma)) : false;
  const currentCategory = (contact && contact.kategorie) ? contact.kategorie : (isFirma ? 'Sponsor' : 'Privat');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow-lg" style="position: relative;">
        <div class="modal-header ${contact ? 'bg-warning text-dark' : 'bg-primary text-white'} border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
          <h5 class="modal-title fw-bold mb-0">
            <i class="fas ${contact ? 'fa-user-edit' : 'fa-user-plus'} me-2"></i>
            ${contact ? 'Externen Kontakt bearbeiten' : 'Neuer externer Kontakt erfassen'}
          </h5>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm ${contact ? 'text-dark' : 'text-white'} p-1 border-0 shadow-none rn-modal-maximize-btn" title="Maximieren / Verkleinern" style="opacity: 0.85; line-height: 1;">
              <i class="fas fa-expand"></i>
            </button>
            <button type="button" class="btn-close ${contact ? '' : 'btn-close-white'}" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body p-4">
          <form id="rn-contact-form" onsubmit="rnSaveContactForm(event)">
            <input type="hidden" id="rnc-crud-id" value="${contact ? contact.id : ''}">
            
            <!-- Kontakt-Typ Umschaltung -->
            <div class="card bg-light border-0 rounded-3 p-3 mb-3">
              <div class="row align-items-center g-2">
                <div class="col-md-6">
                  <label class="form-label fw-bold small text-muted mb-1">Kontaktart *</label>
                  <div class="btn-group w-100 shadow-sm" role="group">
                    <input type="radio" class="btn-check" name="rnc_typ_toggle" id="rnc-type-privat" value="privat" ${!isFirma ? 'checked' : ''} onchange="rnToggleContactType('privat')">
                    <label class="btn btn-outline-primary fw-bold" for="rnc-type-privat">
                      <i class="fas fa-user me-1.5"></i> Privatperson
                    </label>

                    <input type="radio" class="btn-check" name="rnc_typ_toggle" id="rnc-type-firma" value="firma" ${isFirma ? 'checked' : ''} onchange="rnToggleContactType('firma')">
                    <label class="btn btn-outline-primary fw-bold" for="rnc-type-firma">
                      <i class="fas fa-building me-1.5"></i> Firma / Organisation
                    </label>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold small text-muted mb-1">Kategorie / Segment</label>
                  <select class="form-select shadow-sm" id="rnc-crud-kategorie" onchange="rnUpdateContactLivePreview()">
                    <option value="Privat" ${currentCategory === 'Privat' ? 'selected' : ''}>👤 Privatperson</option>
                    <option value="Sponsor" ${currentCategory === 'Sponsor' ? 'selected' : ''}>⭐ Sponsor / Werbepartner</option>
                    <option value="Gönner" ${currentCategory === 'Gönner' ? 'selected' : ''}>🤝 Gönner / Spender</option>
                    <option value="Gemeinde" ${currentCategory === 'Gemeinde' ? 'selected' : ''}>🏛️ Gemeinde / Behörde</option>
                    <option value="Mieter" ${currentCategory === 'Mieter' ? 'selected' : ''}>🏠 Mieter Schützenhaus</option>
                    <option value="Lieferant" ${currentCategory === 'Lieferant' ? 'selected' : ''}>📦 Lieferant / Partner</option>
                    <option value="Verband" ${currentCategory === 'Verband' ? 'selected' : ''}>🎯 Verband / Verein</option>
                    <option value="Sonstige" ${currentCategory === 'Sonstige' ? 'selected' : ''}>📌 Sonstige</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- FIRMENFELDER -->
            <div id="rnc-firma-section" style="${isFirma ? '' : 'display:none;'}">
              <div class="row g-3 mb-3">
                <div class="col-md-7">
                  <label class="form-label fw-bold small text-muted">Firma / Organisationsname *</label>
                  <input type="text" class="form-control fw-bold text-dark" id="rnc-crud-firma" value="${escapeHtml(contact ? contact.firma || contact.name || '' : '')}" placeholder="z.B. Müller Holzbau AG oder Gemeinde Muhen" oninput="rnUpdateContactLivePreview()">
                </div>
                <div class="col-md-5">
                  <label class="form-label fw-bold small text-muted">Abteilung / Zusatz (optional)</label>
                  <input type="text" class="form-control" id="rnc-crud-abteilung" value="${escapeHtml(contact ? contact.abteilung || '' : '')}" placeholder="z.B. Finanzverwaltung oder Sponsoring" oninput="rnUpdateContactLivePreview()">
                </div>
              </div>
            </div>

            <!-- ANSPRECHPERSON / NAME -->
            <div class="card border rounded-3 p-3 mb-3 bg-white">
              <div class="fw-bold small text-primary mb-2">
                <i class="fas fa-id-card me-1.5"></i>
                <span id="rnc-person-section-title">${isFirma ? 'Ansprechperson / Kontaktperson (optional)' : 'Persönliche Angaben (Privatperson)'}</span>
              </div>
              <div class="row g-2">
                <div class="col-md-3">
                  <label class="form-label fw-bold small text-muted">Anrede</label>
                  <select class="form-select" id="rnc-crud-anrede" onchange="rnUpdateContactLivePreview()">
                    <option value="" ${!contact || !contact.anrede ? 'selected' : ''}>– Keine –</option>
                    <option value="Herr" ${contact && contact.anrede === 'Herr' ? 'selected' : ''}>Herr</option>
                    <option value="Frau" ${contact && contact.anrede === 'Frau' ? 'selected' : ''}>Frau</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-bold small text-muted">Vorname</label>
                  <input type="text" class="form-control" id="rnc-crud-vorname" value="${escapeHtml(contact ? contact.vorname || '' : '')}" placeholder="Hans" oninput="rnUpdateContactLivePreview()">
                </div>
                <div class="col-md-5">
                  <label class="form-label fw-bold small text-muted">Nachname *</label>
                  <input type="text" class="form-control fw-bold" id="rnc-crud-nachname" value="${escapeHtml(contact ? contact.nachname || (!isFirma ? contact.name || '' : '') : '')}" placeholder="Meier" oninput="rnUpdateContactLivePreview()">
                </div>
              </div>
            </div>

            <!-- ADRESSE -->
            <div class="card border rounded-3 p-3 mb-3 bg-white">
              <div class="fw-bold small text-primary mb-2">
                <i class="fas fa-map-marker-alt me-1.5"></i> Postadresse (QR-Rechnung & Briefkopf konform)
              </div>
              <div class="row g-2 mb-2">
                <div class="col-md-8">
                  <label class="form-label fw-bold small text-muted">Strasse & Hausnummer *</label>
                  <input type="text" class="form-control" id="rnc-crud-strasse" required value="${escapeHtml(contact ? contact.strasse || '' : '')}" placeholder="Hauptstrasse 12" oninput="rnUpdateContactLivePreview()">
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-bold small text-muted">Adresszusatz / c/o / Postfach</label>
                  <input type="text" class="form-control" id="rnc-crud-adresszusatz" value="${escapeHtml(contact ? contact.adresszusatz || '' : '')}" placeholder="z.B. Postfach 45" oninput="rnUpdateContactLivePreview()">
                </div>
              </div>
              <div class="row g-2">
                <div class="col-md-3">
                  <label class="form-label fw-bold small text-muted">PLZ *</label>
                  <input type="text" class="form-control font-monospace" id="rnc-crud-plz" required value="${escapeHtml(contact ? contact.plz || '' : '')}" placeholder="5037" oninput="rnUpdateContactLivePreview()">
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold small text-muted">Ort *</label>
                  <input type="text" class="form-control" id="rnc-crud-ort" required value="${escapeHtml(contact ? contact.ort || '' : '')}" placeholder="Muhen" oninput="rnUpdateContactLivePreview()">
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-bold small text-muted">Land</label>
                  <input type="text" class="form-control font-monospace text-uppercase" id="rnc-crud-land" value="${escapeHtml(contact ? contact.land || 'CH' : 'CH')}" placeholder="CH" oninput="rnUpdateContactLivePreview()">
                </div>
              </div>
            </div>

            <!-- KONTAKTDATEN & BEMERKUNGEN -->
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-muted"><i class="fas fa-envelope me-1"></i>E-Mail (Rechnungsversand)</label>
                <input type="email" class="form-control" id="rnc-crud-email" value="${escapeHtml(contact ? contact.email || '' : '')}" placeholder="rechnung@beispiel.ch">
              </div>
              <div class="col-md-6">
                <label class="form-label fw-bold small text-muted"><i class="fas fa-phone me-1"></i>Telefon / Mobil</label>
                <input type="text" class="form-control" id="rnc-crud-telefon" value="${escapeHtml(contact ? contact.telefon || '' : '')}" placeholder="+41 62 123 45 67">
              </div>
              <div class="col-md-12">
                <label class="form-label fw-bold small text-muted"><i class="fas fa-sticky-note me-1"></i>Bemerkungen / Notizen / Vereinbarungen</label>
                <input type="text" class="form-control" id="rnc-crud-bemerkungen" value="${escapeHtml(contact ? contact.bemerkungen || '' : '')}" placeholder="z.B. Sponsoringvertrag 2026/2027; Rabatt 10%">
              </div>
            </div>

            <!-- LIVE ADRESSVORSCHAU -->
            <div class="card bg-light border-primary border-opacity-25 rounded-3 p-3 mb-4">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold small text-primary"><i class="fas fa-eye me-1.5"></i>Live-Vorschau Rechnungsanschrift (PDF & QR)</span>
                <span class="badge bg-light text-muted border font-monospace small">ID: ${contact ? 'EXT-' + contact.id : '(Neu)'}</span>
              </div>
              <div id="rnc-live-preview-box" class="p-2.5 bg-white rounded-2 border font-monospace text-dark small" style="white-space: pre-line; line-height: 1.4;">
                <!-- Wird dynamisch befüllt -->
              </div>
            </div>

            <div class="d-grid">
              <button type="submit" class="btn ${contact ? 'btn-warning' : 'btn-primary'} py-2.5 fw-bold rounded-3 shadow">
                <i class="fas fa-save me-1.5"></i> ${contact ? 'Änderungen speichern' : 'Kontakt verbindlich anlegen'}
              </button>
            </div>
          </form>
        </div>
        <!-- Resize-Grip Ecke unten rechts -->
        <div class="rn-modal-resizer" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;" title="Grösse durch Ziehen verändern">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M11 1v10H1V11h10z M11 5v6H5V11h6z M11 9v2H9V11h2z"/></svg>
        </div>
      </div>
    </div>
  `;

  window.rnToggleContactType = function(type) {
    const isF = type === 'firma';
    const fSec = document.getElementById('rnc-firma-section');
    const pTitle = document.getElementById('rnc-person-section-title');
    const firmaInput = document.getElementById('rnc-crud-firma');
    const nachnameInput = document.getElementById('rnc-crud-nachname');

    if (fSec) fSec.style.display = isF ? '' : 'none';
    if (pTitle) pTitle.textContent = isF ? 'Ansprechperson / Kontaktperson (optional)' : 'Persönliche Angaben (Privatperson)';
    
    if (firmaInput) {
      if (isF) firmaInput.setAttribute('required', 'required');
      else firmaInput.removeAttribute('required');
    }
    if (nachnameInput) {
      if (!isF) nachnameInput.setAttribute('required', 'required');
      else nachnameInput.removeAttribute('required');
    }

    rnUpdateContactLivePreview();
  };

  window.rnUpdateContactLivePreview = function() {
    const isF = document.getElementById('rnc-type-firma')?.checked;
    const firma = document.getElementById('rnc-crud-firma')?.value.trim() || '';
    const abteilung = document.getElementById('rnc-crud-abteilung')?.value.trim() || '';
    const anrede = document.getElementById('rnc-crud-anrede')?.value.trim() || '';
    const vorname = document.getElementById('rnc-crud-vorname')?.value.trim() || '';
    const nachname = document.getElementById('rnc-crud-nachname')?.value.trim() || '';
    const strasse = document.getElementById('rnc-crud-strasse')?.value.trim() || 'Musterstrasse 1';
    const zusatz = document.getElementById('rnc-crud-adresszusatz')?.value.trim() || '';
    const plz = document.getElementById('rnc-crud-plz')?.value.trim() || '5037';
    const ort = document.getElementById('rnc-crud-ort')?.value.trim() || 'Muhen';
    const land = document.getElementById('rnc-crud-land')?.value.trim() || 'CH';

    const lines = [];
    if (isF) {
      lines.push(firma || '[Firmenname / Organisation]');
      if (abteilung) lines.push(abteilung);
      const cpName = [anrede, vorname, nachname].filter(Boolean).join(' ');
      if (cpName) lines.push(cpName);
    } else {
      if (anrede) lines.push(anrede);
      const pName = [vorname, nachname].filter(Boolean).join(' ');
      lines.push(pName || '[Vorname Nachname]');
    }

    lines.push(strasse);
    if (zusatz) lines.push(zusatz);
    lines.push(`${plz} ${ort}${land && land !== 'CH' ? ` (${land})` : ''}`);

    const previewEl = document.getElementById('rnc-live-preview-box');
    if (previewEl) {
      previewEl.textContent = lines.join('\n');
    }
  };

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  rnMakeModalMovableAndResizable(modalEl);
  rnUpdateContactLivePreview();
};

window.rnSaveContactForm = async function(event) {
  event.preventDefault();
  const id = document.getElementById('rnc-crud-id').value.trim();
  const typ = document.getElementById('rnc-type-firma')?.checked ? 'firma' : 'privat';
  const kategorie = document.getElementById('rnc-crud-kategorie').value.trim();
  const firma = document.getElementById('rnc-crud-firma') ? document.getElementById('rnc-crud-firma').value.trim() : '';
  const abteilung = document.getElementById('rnc-crud-abteilung') ? document.getElementById('rnc-crud-abteilung').value.trim() : '';
  const anrede = document.getElementById('rnc-crud-anrede').value.trim();
  const vorname = document.getElementById('rnc-crud-vorname').value.trim();
  const nachname = document.getElementById('rnc-crud-nachname').value.trim();
  const strasse = document.getElementById('rnc-crud-strasse').value.trim();
  const adresszusatz = document.getElementById('rnc-crud-adresszusatz').value.trim();
  const plz = document.getElementById('rnc-crud-plz').value.trim();
  const ort = document.getElementById('rnc-crud-ort').value.trim();
  const land = document.getElementById('rnc-crud-land').value.trim() || 'CH';
  const email = document.getElementById('rnc-crud-email').value.trim();
  const telefon = document.getElementById('rnc-crud-telefon').value.trim();
  const bemerkungen = document.getElementById('rnc-crud-bemerkungen').value.trim();

  // Name für Fallback/Legacy
  const name = typ === 'firma' ? (firma || [vorname, nachname].join(' ').trim()) : [vorname, nachname].join(' ').trim() || firma;

  const contactObj = {
    id,
    typ,
    kategorie,
    firma,
    abteilung,
    anrede,
    vorname,
    nachname,
    name,
    strasse,
    adresszusatz,
    plz,
    ort,
    land,
    email,
    telefon,
    bemerkungen
  };

  const modalEl = document.getElementById('rnModalContact');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  showLoadingOverlay('Speichere externen Kontakt...');
  
  // 1. Supabase PostgreSQL Master Save
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (sb) {
    try {
      const targetId = id || ('EXT-' + Date.now());
      await sb.from('external_contacts').upsert({
        id: targetId,
        typ: typ || 'privat',
        kategorie: kategorie || null,
        firma: firma || null,
        abteilung: abteilung || null,
        anrede: anrede || null,
        vorname: vorname || null,
        nachname: nachname || null,
        name: name,
        strasse: strasse || null,
        adresszusatz: adresszusatz || null,
        plz: plz || null,
        ort: ort || null,
        land: land || 'CH',
        email: email || null,
        telefon: telefon || null,
        bemerkungen: bemerkungen || null,
        updated_at: new Date().toISOString()
      });
      contactObj.id = targetId;
      console.log(`✅ [Supabase] External contact ${targetId} saved.`);
    } catch (sbErr) {
      console.warn("⚠️ [Supabase] Contact upsert warning:", sbErr);
    }
  }

  try {
    const res = await apiFetch('rechnungen', { action: 'saveContact', contact: contactObj }, 'POST');
    const result = await res.json();
    if (!result.success) {
      console.warn('⚠️ GAS contact save returned warning:', result.error);
    }
    
    showSuccess(result.message || 'Kontakt erfolgreich gespeichert.');
    await loadInvoiceContactsData();

    const savedId = result.id || contactObj.id || id;

    // Falls das "Neue Rechnung"-Modal geöffnet ist: Dropdown aktualisieren & Kontakt direkt anwählen
    const memberSelectEl = document.getElementById('rnc-member-select');
    if (memberSelectEl) {
      if (typeof window.rnPopulateRecipientSelect === 'function') {
        const searchInput = document.getElementById('rnc-recipient-search');
        window.rnPopulateRecipientSelect(searchInput ? searchInput.value : '', savedId ? `EXT:${savedId}` : null);
      }
      if (savedId) {
        memberSelectEl.value = `EXT:${savedId}`;
        if (typeof window.rnHandleMemberSelect === 'function') {
          window.rnHandleMemberSelect(`EXT:${savedId}`);
        }
      }
    }

    // Falls das "Rechnung bearbeiten"-Modal geöffnet ist: Kontaktdaten darin live aktualisieren
    const editForm = document.getElementById('rn-edit-form');
    if (editForm) {
      const c = (window._externalContacts || []).find(x => String(x.id).trim() === String(savedId).trim());
      if (c) {
        const isF = c.typ === 'firma' || Boolean(c.firma);
        const displayName = (typeof window.rnGetContactDisplayName === 'function') ? window.rnGetContactDisplayName(c) : (c.firma || c.name || '');
        const nameInput = document.getElementById('rne-name');
        if (nameInput) nameInput.value = displayName;
        const emailInput = document.getElementById('rne-email');
        if (emailInput) emailInput.value = c.email || '';
        const strasseInput = document.getElementById('rne-strasse');
        if (strasseInput) strasseInput.value = c.strasse || '';
        const plzInput = document.getElementById('rne-plz');
        if (plzInput) plzInput.value = c.plz || '';
        const ortInput = document.getElementById('rne-ort');
        if (ortInput) ortInput.value = (c.ort || '') + (c.land && c.land !== 'CH' ? ' (' + c.land + ')' : '');
        const badgeType = document.getElementById('rne-badge-type');
        if (badgeType) badgeType.textContent = isF ? '🏢 Firma / Organisation' : '👤 Privatperson';
        const badgeKat = document.getElementById('rne-badge-kat');
        if (badgeKat && c.kategorie) badgeKat.textContent = c.kategorie;
        const cpInput = document.getElementById('rne-contact-person');
        if (cpInput) cpInput.value = c.ansprechperson || '';
        const cpCol = document.getElementById('rne-contact-person-col');
        if (cpCol) cpCol.style.display = (isF && c.ansprechperson) ? '' : 'none';
        const abtInput = document.getElementById('rne-abteilung');
        if (abtInput) abtInput.value = c.abteilung || '';
        const abtCol = document.getElementById('rne-abteilung-col');
        if (abtCol) abtCol.style.display = (isF && c.abteilung) ? '' : 'none';
        const adrInput = document.getElementById('rne-adresszusatz');
        if (adrInput) adrInput.value = c.adresszusatz || '';
      }
    }

    if (window._rechnungenActiveTab === 'kontakte') {
      renderActiveRechnungenTab();
    }
  } catch (err) {
    alert('❌ Fehler: ' + err.message);
  } finally {
    hideLoadingOverlay();
  }
};

window.rnDeleteContactPrompt = async function(contactId) {
  const c = (window._externalContacts || []).find(x => String(x.id).trim() === String(contactId).trim());
  const label = c ? (window.rnGetContactDisplayName ? window.rnGetContactDisplayName(c) : (c.firma || c.name || `ID ${c.id}`)) : `ID ${contactId}`;
  if (!confirm(`Möchten Sie den externen Kontakt "${label}" (EXT-${contactId}) wirklich löschen?`)) return;

  showLoadingOverlay('Lösche Kontakt...');

  // Supabase PostgreSQL Master Delete
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (sb) {
    try {
      await sb.from('external_contacts').delete().eq('id', String(contactId));
      console.log(`✅ [Supabase] External contact ${contactId} deleted.`);
    } catch (sbErr) {
      console.warn("⚠️ [Supabase] Contact delete warning:", sbErr);
    }
  }

  try {
    const res = await apiFetch('rechnungen', { action: 'deleteContact', id: contactId }, 'POST');
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Fehler beim Löschen');

    showSuccess('Kontakt gelöscht.');
    window._externalContacts = window._externalContacts.filter(x => String(x.id).trim() !== String(contactId).trim());
    if (window._rechnungenActiveTab === 'kontakte') {
      renderActiveRechnungenTab();
    }
  } catch (err) {
    alert('❌ Fehler: ' + err.message);
  } finally {
    hideLoadingOverlay();
  }
};
