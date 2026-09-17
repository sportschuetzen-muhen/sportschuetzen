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
  let defaultSubject = layout.mail_subject
    ? replaceMailVars(layout.mail_subject)
    : `Rechnung ${inv.id} – ${inv.type || 'Rechnung'} | Sportschützen Muhen`;

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
  const pdfFilename = `Rechnung_${inv.id}_${escapeHtml(String(inv.name || 'Empfaenger').replace(/\s+/g, '_'))}.pdf`;

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
                    <div id="rnm-preview-body-content" class="pt-1"></div>
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
  const customLayout = Object.assign({}, baseLayout, {
    mail_subject: targetSubject || baseLayout.mail_subject,
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

  // Externe Kontakte laden (falls nicht bereits geladen)
  if (!window._externalContacts || window._externalContacts.length === 0) {
    let origText = '';
    if (btnEl) {
      origText = btnEl.innerHTML;
      btnEl.disabled = true;
      btnEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Laden...';
    }
    try {
      const response = await apiFetch('rechnungen', 'action=getContacts');
      const result = await response.json();
      if (result.success) {
        window._externalContacts = result.data || [];
      }
    } catch (err) {
      console.error("⚠️ Fehler beim Laden der externen Kontakte:", err);
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = origText;
      }
    }
  }

  const memberOptions = (window._mglData || []).map(m => 
    `<option value="MBR:${m.PersonNumber}">${m.LastName} ${m.FirstName} (Nr: ${m.PersonNumber})</option>`
  ).join('');

  const externalOptions = (window._externalContacts || []).map(c => {
    const isFirma = c.typ === 'firma' || Boolean(c.firma);
    const label = (typeof window.rnGetContactDisplayName === 'function') ? window.rnGetContactDisplayName(c) : (c.firma || c.name || `Kontakt #${c.id}`);
    const kat = c.kategorie ? ` [${c.kategorie}]` : '';
    return `<option value="EXT:${c.id}">${isFirma ? '🏢 ' : '👤 '}${escapeHtml(label)}${kat} (EXT-${c.id}${c.email ? ' · ' + escapeHtml(c.email) : ''})</option>`;
  }).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
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
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2 pb-1" style="margin-bottom: 9px;">
                  <label for="rnc-member-select" class="form-label fw-bold small text-muted mb-0">
                    <i class="fas fa-user-tag me-1 text-primary"></i>Empfänger auswählen *
                  </label>
                  <button type="button" class="btn btn-xs btn-outline-primary fw-bold px-2.5 py-1" onclick="rnOpenContactModal()" style="font-size: 12px; border-radius: 6px;">
                    <i class="fas fa-user-plus me-1"></i> + Neuer externer Kontakt erfassen
                  </button>
                </div>
                <select class="form-select fw-bold text-primary shadow-sm" id="rnc-member-select" required onchange="rnHandleMemberSelect(this.value)">
                  <option value="" selected>-- Bitte Empfänger auswählen (oder oben neu anlegen) --</option>
                  ${window._externalContacts.length > 0 ? `
                  <optgroup label="Gespeicherte externe Kontakte (Sponsoren, Mieter, Firmen, Privat)">
                    ${externalOptions}
                  </optgroup>
                  ` : ''}
                  <optgroup label="Vereinsmitglieder">
                    ${memberOptions}
                  </optgroup>
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
                <div class="d-flex gap-2">
                  <div class="dropdown">
                    <button class="btn btn-xs btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                      <i class="fas fa-magic me-1"></i> Standard-Positionen
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow" style="font-size: 0.85rem; max-width: 320px;">
                      ${(typeof window.rnGetDropdownMenuHtml === 'function' ? window.rnGetDropdownMenuHtml('rncAddPositionRow') : '')}
                    </ul>
                  </div>
                  
                  <button type="button" class="btn btn-xs btn-primary" onclick="rncAddPositionRow()">
                    <i class="fas fa-plus"></i> Pos hinzufügen
                  </button>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle mb-0" style="font-size: 13px;">
                  <thead class="table-light">
                    <tr>
                      <th style="width: 35px;" class="text-center">#</th>
                      <th>Beschreibung der Dienstleistung / Ware</th>
                      <th style="width: 80px;" class="text-end">Menge</th>
                      <th style="width: 120px;" class="text-end">Einzelpreis</th>
                      <th style="width: 120px;" class="text-end">Gesamt (CHF)</th>
                      <th style="width: 130px;">Konto (Haben)</th>
                      <th style="width: 45px;" class="text-center">Aktion</th>
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
  rnMakeModalMovableAndResizable(modalEl);
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
    const personNumber = val.replace('MBR:', '');
    const m = (window._mglData || []).find(x => String(x.PersonNumber) === String(personNumber));
    if (m) {
      if (editBtn) editBtn.style.display = 'none';
      if (badgeType) badgeType.textContent = '👤 Vereinsmitglied';
      if (badgeKat) badgeKat.textContent = m.Status || 'Aktiv';
      if (cpCol) cpCol.style.display = 'none';
      if (abtCol) abtCol.style.display = 'none';

      document.getElementById('rnc-person-number').value = m.PersonNumber || '';
      document.getElementById('rnc-name').value = `${m.LastName} ${m.FirstName}`;
      document.getElementById('rnc-email').value = m.PrimaryEmail || m.Email || '';
      document.getElementById('rnc-strasse').value = m.Street || m.Strasse || '';
      if (document.getElementById('rnc-adresszusatz')) document.getElementById('rnc-adresszusatz').value = '';
      document.getElementById('rnc-plz').value = m.ZipCode || m.PLZ || '';
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
    <td class="text-center font-monospace text-muted rnc-pos-idx">${tbody.children.length + 1}</td>
    <td>
      <input type="text" class="form-control form-control-sm rnc-pos-desc" required value="${desc}" placeholder="z.B. Getränkebezug Süsswasser">
    </td>
    <td>
      <input type="number" step="1" min="1" class="form-control form-control-sm text-end rnc-pos-qty" required value="${qty}" oninput="rncRecalculateRowTotal('${tr.id}')">
    </td>
    <td>
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-light text-muted">CHF</span>
        <input type="number" step="0.05" class="form-control form-control-sm text-end rnc-pos-unitprice" required value="${unitPrice}" placeholder="0.00" oninput="rncRecalculateRowTotal('${tr.id}')">
      </div>
    </td>
    <td>
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-light text-muted">CHF</span>
        <input type="number" class="form-control form-control-sm text-end fw-bold rnc-pos-amt bg-light" readonly value="${initialAmount}">
      </div>
    </td>
    <td>
      <input type="text" class="form-control form-control-sm font-monospace rnc-pos-konto" list="rn-konten-datalist" value="${escapeHtml(konto || '')}" placeholder="Konto...">
    </td>
    <td class="text-center">
      <button type="button" class="btn btn-xs btn-outline-danger" onclick="rncRemovePositionRow('${tr.id}')">
        <i class="fas fa-trash-alt"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  rncRecalculateTotal();
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

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Fehler beim Anlegen im Backend.");
    }
    
    // Server-Sync mit forceReload = true!
    setTimeout(async () => {
      await loadRechnungenData(true, true);
      await loadInvoiceContactsData();
    }, 1200);
  } catch (err) {
    console.error("❌ Optimistic Create Invoice failed:", err);
    // Revert optimistic update!
    window._invoices = window._invoices.filter(i => String(i.id) !== String(invoiceId));
    window.renderRechnungen();
    alert("❌ Fehler beim Erstellen der Rechnung (Revert durchgeführt): " + err.message);
  }
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
    <div class="modal-dialog modal-dialog-centered modal-lg">
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
                <div class="d-flex gap-2">
                  <div class="dropdown">
                    <button class="btn btn-xs btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                      <i class="fas fa-magic me-1"></i> Standard-Positionen
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow" style="font-size: 0.85rem; max-width: 320px;">
                      ${(typeof window.rnGetDropdownMenuHtml === 'function' ? window.rnGetDropdownMenuHtml('rneAddPositionRow') : '')}
                    </ul>
                  </div>
                  
                  <button type="button" class="btn btn-xs btn-primary" onclick="rneAddPositionRow()">
                    <i class="fas fa-plus"></i> Pos hinzufügen
                  </button>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle mb-0" style="font-size: 13px;">
                  <thead class="table-light">
                    <tr>
                      <th style="width: 35px;" class="text-center">#</th>
                      <th>Beschreibung der Dienstleistung / Ware</th>
                      <th style="width: 80px;" class="text-end">Menge</th>
                      <th style="width: 120px;" class="text-end">Einzelpreis</th>
                      <th style="width: 120px;" class="text-end">Gesamt (CHF)</th>
                      <th style="width: 130px;">Konto (Haben)</th>
                      <th style="width: 45px;" class="text-center">Aktion</th>
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
              <button type="submit" class="btn btn-warning py-2.5 fw-bold rounded-3 shadow-sm" id="rne-submit-btn">
                <i class="fas fa-save me-1"></i> Änderungen speichern
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

  function rneAddPositionRow(desc = '', unitPrice = 0, qty = 1, konto = '') {
    rnePosCounter++;
    const tbody = document.getElementById('rne-positions-tbody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.id = `rne-pos-row-${rnePosCounter}`;
    const initialAmount = (Number(qty || 1) * Number(unitPrice || 0)).toFixed(2);

    tr.innerHTML = `
      <td class="text-center font-monospace rne-pos-idx">${tbody.children.length + 1}</td>
      <td>
        <input type="text" class="form-control form-control-sm rne-pos-desc" required value="${escapeHtml(desc)}" placeholder="z.B. Miete Schützenhaus">
      </td>
      <td>
        <input type="number" class="form-control form-control-sm text-end rne-pos-qty" required step="1" min="1" value="${qty}" oninput="rneRecalculateRowTotal('${tr.id}')">
      </td>
      <td>
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted">CHF</span>
          <input type="number" class="form-control form-control-sm text-end rne-pos-unitprice" required step="0.05" min="0" value="${unitPrice}" oninput="rneRecalculateRowTotal('${tr.id}')">
        </div>
      </td>
      <td>
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted">CHF</span>
          <input type="number" class="form-control form-control-sm text-end fw-bold rne-pos-amt bg-light" readonly value="${initialAmount}">
        </div>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm font-monospace rne-pos-konto" list="rn-konten-datalist" value="${escapeHtml(konto || '')}" placeholder="Konto...">
      </td>
      <td class="text-center">
        <button type="button" class="btn btn-xs btn-outline-danger" onclick="rneRemovePositionRow('${tr.id}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
    rneRecalculateTotal();
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

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Fehler beim Aktualisieren im Backend.");
    }
    
    // Server-Sync mit forceReload = true!
    setTimeout(async () => {
      await loadRechnungenData(true, true);
      await loadInvoiceContactsData();
    }, 1200);
  } catch (err) {
    console.error("❌ Optimistic Edit Invoice failed:", err);
    // Revert optimistic update!
    if (invIndex !== -1 && oldInv) {
      window._invoices[invIndex] = oldInv;
      window.renderRechnungen();
    }
    alert("❌ Fehler beim Bearbeiten der Rechnung (Revert durchgeführt): " + err.message);
  }
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

  try {
    const response = await apiFetch('rechnungen', { action: 'deleteInvoice', invoiceId }, 'POST');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Fehler beim Löschen im Backend.");
    }
    
    // Lazy sync after 1500ms
    setTimeout(async () => {
      await loadRechnungenData(true);
    }, 1500);
  } catch (err) {
    console.error("❌ Optimistic Delete Invoice failed:", err);
    // Revert optimistic update!
    if (deletedInv !== null) {
      window._invoices.splice(deletedInv.originalIndex, 0, deletedInv);
      window.renderRechnungen();
    }
    alert("❌ Fehler beim Löschen der Rechnung (Revert durchgeführt): " + err.message);
  }
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
  const inv = window._invoices.find(i => String(i.id) === String(invoiceId));
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

  let modalEl = document.getElementById('rnModalSendMahnung');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalSendMahnung';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  const stufenLabels = {
    1: { name: '1. Zahlungserinnerung', frist: '14 Tage Frist', fee: 'CHF 0.–', color: 'warning', icon: 'fa-bell' },
    2: { name: '2. Mahnung', frist: '10 Tage Frist', fee: 'CHF 0.–', color: 'orange', icon: 'fa-exclamation-triangle' },
    3: { name: '3. / Letzte Mahnung', frist: '7 Tage Frist (Rechtsfolge)', fee: 'CHF 20.– (optional)', color: 'danger', icon: 'fa-radiation' }
  };

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-warning text-dark border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-exclamation-triangle me-2 text-danger"></i>Mahnwesen – Rechnung ${escapeHtml(inv.id)}
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          ${nieMahnen ? `
            <div class="alert alert-danger d-flex align-items-center mb-3 py-2 px-3 rounded-3">
              <i class="fas fa-hand-paper fa-2x me-3"></i>
              <div>
                <strong>⚠️ VETO-HINWEIS: Option "Nie mahnen" ist aktiv!</strong><br>
                <span class="small">Für ${escapeHtml(name)} ist in den Mitgliederstammdaten eine Mahnsperre hinterlegt. Mahnungen sollten nur nach ausdrücklicher Vorstandsrücksprache versendet werden.</span>
              </div>
            </div>
          ` : ''}

          ${daysSinceLastMahnung !== null && daysSinceLastMahnung < 10 ? `
            <div class="alert alert-warning py-2 px-3 rounded-3 small mb-3">
              <i class="fas fa-clock me-1 text-danger"></i>
              <strong>Kurzer Mahnabstand:</strong> Die letzte Mahnung wurde erst vor <strong>${daysSinceLastMahnung} Tagen</strong> versendet (am ${escapeHtml(inv.mahn_datum || 'kürzlich')}). Empfohlen wird ein Mindestabstand von 10–14 Tagen.
            </div>
          ` : ''}

          <!-- Rechnungsübersicht Kärtchen -->
          <div class="bg-light p-3 rounded-3 border mb-3">
            <div class="row g-2 align-items-center">
              <div class="col-md-5">
                <div class="text-muted small">Empfänger / Debitor</div>
                <div class="fw-bold text-dark fs-6">${escapeHtml(inv.name)}</div>
                <div class="text-muted small">${inv.PersonNumber ? (String(inv.PersonNumber).startsWith('EXT') ? 'Kontakt ' + escapeHtml(inv.PersonNumber) : 'Mgl-Nr: ' + escapeHtml(inv.PersonNumber)) : ''}</div>
              </div>
              <div class="col-md-3">
                <div class="text-muted small">Rechnungsbetrag</div>
                <div class="fw-bold text-primary font-monospace fs-6">${fmtChf(inv.total_amount)}</div>
                <div class="text-muted small">${inv.type || 'Rechnung'} · ${inv.year}</div>
              </div>
              <div class="col-md-4 text-md-end">
                <div class="text-muted small">Aktueller Mahnstatus</div>
                ${curStufe > 0 ? `
                  <span class="badge ${curStufe === 1 ? 'bg-warning text-dark' : (curStufe === 2 ? 'text-white' : 'bg-danger text-white')} px-2 py-1 rounded-pill" ${curStufe === 2 ? 'style="background-color: #fd7e14;"' : ''}>
                    Stufe ${curStufe} (${escapeHtml(inv.mahn_datum || 'gemahnt')})
                  </span>
                ` : `
                  <span class="badge bg-secondary px-2 py-1 rounded-pill">Noch nicht gemahnt</span>
                `}
                <div class="text-muted small mt-1">Rechnung erstellt: ${escapeHtml(String(inv.created_at || '–').split(' ')[0])}${daysSinceCreated !== null ? ` (${daysSinceCreated} Tage her)` : ''}</div>
              </div>
            </div>
          </div>

          <form id="rn-mahnung-form" onsubmit="rnExecuteSendMahnung(event, '${inv.id}')">
            <!-- Stufenauswahl -->
            <label class="form-label fw-bold text-dark mb-2">Zu versendende Mahnstufe auswählen:</label>
            <div class="row g-2 mb-3">
              ${[1, 2, 3].map(st => {
                const info = stufenLabels[st];
                const isRec = st === recommendedStufe;
                const isChecked = st === recommendedStufe ? 'checked' : '';
                return `
                  <div class="col-md-4">
                    <label class="card h-100 p-2.5 border rounded-3 text-start position-relative shadow-2xs cursor-pointer ${isRec ? 'border-primary bg-primary-subtle' : 'border-secondary-subtle'}" style="cursor: pointer;">
                      <div class="d-flex align-items-center mb-1">
                        <input class="form-check-input me-2 mt-0" type="radio" name="rnMahnstufeRadio" id="rnStufe${st}" value="${st}" ${isChecked} onchange="rnUpdateMahnungPreview(${st})">
                        <span class="fw-bold small text-dark">${info.name}</span>
                      </div>
                      <div class="text-muted ps-4" style="font-size: 11px;">
                        <div><i class="fas fa-hourglass-half me-1"></i>${info.frist}</div>
                        <div><i class="fas fa-coins me-1"></i>Gebühr: ${info.fee}</div>
                      </div>
                      ${isRec ? `<span class="badge bg-primary position-absolute top-0 end-0 m-1" style="font-size:9px;">Empfohlen</span>` : ''}
                    </label>
                  </div>
                `;
              }).join('')}
            </div>

            <!-- E-Mail Adresse -->
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted mb-1">Empfänger E-Mail-Adresse *</label>
              <div class="input-group">
                <span class="input-group-text bg-light"><i class="fas fa-envelope text-primary"></i></span>
                <input type="email" class="form-control" id="rn-mahnung-email" required value="${escapeHtml(initialEmail)}" placeholder="empfaenger@beispiel.ch">
              </div>
              <div class="form-text small">An diese Adresse wird das Mahnungs-PDF mit QR-Zahlteil versendet.</div>
            </div>

            <!-- Vorlagen-Vorschau (Collapsible / Dynamic) -->
            <div class="card border rounded-3 p-3 bg-light mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold small text-primary"><i class="fas fa-eye me-1"></i>Text-Vorschau</span>
                <span class="badge bg-secondary" id="rn-preview-stufe-badge">Stufe ${recommendedStufe}</span>
              </div>
              <div class="small fw-semibold text-dark mb-1" id="rn-preview-subject">...</div>
              <div class="small text-muted font-monospace bg-white p-2 rounded border" id="rn-preview-body" style="max-height: 110px; overflow-y: auto; white-space: pre-wrap; font-size: 11px;">...</div>
            </div>

            <!-- Aktionen -->
            <div class="d-flex justify-content-end gap-2 mt-4 pt-2 border-top">
              <button type="button" class="btn btn-light" data-bs-dismiss="modal">Abbrechen</button>
              <button type="submit" class="btn btn-warning fw-bold px-4 shadow-sm" id="rn-mahnung-submit-btn">
                <i class="fas fa-paper-plane me-1.5"></i> Mahnung jetzt versenden
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  // Vorschautext initialisieren
  rnUpdateMahnungPreview(recommendedStufe);
};

// Hilfsfunktion: Live-Vorschautext im Mahn-Modal aktualisieren
window.rnUpdateMahnungPreview = function(stufe) {
  const badgeEl = document.getElementById('rn-preview-stufe-badge');
  const subjEl = document.getElementById('rn-preview-subject');
  const bodyEl = document.getElementById('rn-preview-body');
  if (!badgeEl || !subjEl || !bodyEl) return;

  badgeEl.textContent = `Stufe ${stufe}`;
  const key = `Mahnung ${stufe}`;
  const l = (window._invoiceLayouts && (window._invoiceLayouts[key] || window._invoiceLayouts['Mahnung']))
    || (typeof rnGetDefaultLayouts === 'function' ? (rnGetDefaultLayouts()[key] || rnGetDefaultLayouts()['Mahnung']) : null);

  if (l) {
    subjEl.textContent = `Betreff: ${l.mail_subject || 'Zahlungserinnerung'}`;
    bodyEl.textContent = l.mail_body || l.intro || '...';
  }
};

// 2. MANUELLE MAHNUNG: VERSAND AUSFÜHREN
window.rnExecuteSendMahnung = async function(event, invoiceId) {
  event.preventDefault();

  const inv = window._invoices.find(i => String(i.id) === String(invoiceId));
  if (!inv) return;

  const emailInput = document.getElementById('rn-mahnung-email');
  const targetEmail = emailInput ? emailInput.value.trim() : '';
  if (!targetEmail || !targetEmail.includes('@')) {
    alert("❌ Bitte geben Sie eine gültige E-Mail-Adresse ein.");
    return;
  }

  const stufeEl = document.querySelector('input[name="rnMahnstufeRadio"]:checked');
  const targetStufe = stufeEl ? Number(stufeEl.value) : 1;

  const stufenLabels = {
    1: '1. Zahlungserinnerung',
    2: '2. Mahnung',
    3: '3. / Letzte Mahnung vor Betreibung'
  };
  const stufenTitle = stufenLabels[targetStufe] || `Mahnung (Stufe ${targetStufe})`;

  if (!confirm(`Möchtest du wirklich die "${stufenTitle}" für Rechnung ${invoiceId} (${inv.name || ''}) per E-Mail an "${targetEmail}" versenden?`)) {
    return;
  }

  const recipient = (typeof rnGetRecipientForInvoice === 'function')
    ? rnGetRecipientForInvoice(inv)
    : {
        vorname: inv.name.split(' ')[0] || '',
        nachname: inv.name.split(' ').slice(1).join(' ') || '',
        strasse: '', plz: '', ort: '', email: ''
      };
  recipient.email = targetEmail;

  // Modal schliessen
  const modalEl = document.getElementById('rnModalSendMahnung');
  if (modalEl) {
    const mInstance = bootstrap.Modal.getInstance(modalEl);
    if (mInstance) mInstance.hide();
  }

  showLoadingOverlay(`Erstelle Mahnungs-PDF (${stufenTitle}) und sende E-Mail an ${inv.name}...`);

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender('Mahnung ' + targetStufe)
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType('Mahnung') : null);

  const layoutKey = `Mahnung ${targetStufe}`;
  const layout = (window._invoiceLayouts && (window._invoiceLayouts[layoutKey] || window._invoiceLayouts['Mahnung'])) || null;

  const payload = {
    action: 'sendMahnung',
    invoiceId: invoiceId,
    mahnstufe: targetStufe,
    recipient: recipient,
    sender: sender,
    layout: layout
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      // 1. Loading Overlay SOFORT ausblenden
      hideLoadingOverlay();

      // 2. Optimistic Status Update in RAM-Datenbank
      const nowStr = result.mahn_datum || (typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH'));
      inv.status = 'gemahnt';
      inv.mahnstufe = targetStufe;
      inv.mahn_datum = nowStr;
      window.renderRechnungen();

      // 3. Sichtbare Erfolgsbestätigung für den Anwender ausgeben
      showSuccess(`🎉 ${stufenTitle} für Rechnung ${invoiceId} erfolgreich an ${targetEmail} versandt!`, 4000);

      // 4. Sanfter Reload im Hintergrund nach Pufferzeit (kein UI-Flickern)
      setTimeout(async () => {
        try {
          await loadRechnungenData(true, true);
        } catch (_) {}
      }, 1000);
    } else {
      throw new Error(result.error || "Mahnungs-Versand fehlgeschlagen.");
    }
  } catch (err) {
    hideLoadingOverlay();
    alert("❌ Mahnung Fehler: " + err.message);
  } finally {
    hideLoadingOverlay();
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
        <td class="text-center" style="width: 44px;">
          <input type="checkbox" class="form-check-input rn-mass-item-check" 
                 id="rn-mass-check-${idx}" 
                 data-invoice-id="${inv.id}" 
                 data-idx="${idx}" 
                 ${isChecked} 
                 onchange="rnUpdateMassSendSelectedCount()">
        </td>
        <td>
          <span class="bh-konto-badge bh-konto-soll-badge rn-id-badge">${inv.id}</span>
          <span class="badge bg-light text-dark border ms-1" style="font-size: 11.5px;">${escapeHtml(inv.type || 'Rechnung')}</span>
        </td>
        <td>
          <div class="fw-bold text-dark mb-0">${escapeHtml(inv.name)}</div>
          <div class="text-muted small">${sentBadge}</div>
        </td>
        <td>
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
        <td class="text-end fw-bold text-primary font-monospace" style="font-size: 14.5px;">
          ${fmtChf(inv.total_amount)}
        </td>
        <td class="text-center" style="width: 140px;" id="rn-mass-status-col-${inv.id}">
          <span class="badge bg-light text-muted border py-1.5 px-2.5 font-monospace" id="rn-mass-row-badge-${inv.id}" style="font-size: 11.5px;">
            <i class="fas fa-clock me-1 text-secondary"></i>Wartet
          </span>
        </td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="6" class="text-center text-muted py-5">
        <i class="fas fa-inbox fa-3x text-secondary opacity-50 mb-3 d-block"></i>
        <strong>Keine passenden Rechnungen für diesen Filter gefunden.</strong>
      </td>
    </tr>
  `;

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-xl">
      <div class="modal-content border-0 rounded-4 shadow-lg">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-paper-plane me-2"></i>Massenversand von QR-Rechnungen
          </h5>
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
                  <th style="width: 44px;" class="text-center">
                    <input type="checkbox" class="form-check-input" id="rn-mass-select-all" checked onchange="rnToggleMassSendSelectAll(this.checked)">
                  </th>
                  <th style="width: 170px;">Rechnung</th>
                  <th>Empfänger</th>
                  <th style="width: 290px;">E-Mail-Adresse</th>
                  <th class="text-end" style="width: 140px;">Betrag</th>
                  <th class="text-center" style="width: 140px;">Status</th>
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
        inv.updated_at = nowSwiss;
        if (badge) {
          badge.className = 'badge bg-success text-white py-1.5 px-2.5';
          badge.innerHTML = `<i class="fas fa-check me-1"></i>Gesendet`;
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
  try {
    const res = await apiFetch('rechnungen', { action: 'saveContact', contact: contactObj }, 'POST');
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Fehler beim Speichern');
    
    showSuccess(result.message || 'Kontakt erfolgreich gespeichert.');
    await loadInvoiceContactsData();

    const savedId = result.id || id;

    // Falls das "Neue Rechnung"-Modal geöffnet ist: Dropdown aktualisieren & Kontakt direkt anwählen
    const memberSelectEl = document.getElementById('rnc-member-select');
    if (memberSelectEl) {
      const memberOptions = (window._mglData || []).map(m => 
        `<option value="MBR:${m.PersonNumber}">${m.LastName} ${m.FirstName} (Nr: ${m.PersonNumber})</option>`
      ).join('');

      const externalOptions = (window._externalContacts || []).map(c => {
        const isFirma = c.typ === 'firma' || Boolean(c.firma);
        const label = (typeof window.rnGetContactDisplayName === 'function') ? window.rnGetContactDisplayName(c) : (c.firma || c.name || `Kontakt #${c.id}`);
        const kat = c.kategorie ? ` [${c.kategorie}]` : '';
        return `<option value="EXT:${c.id}">${isFirma ? '🏢 ' : '👤 '}${escapeHtml(label)}${kat} (EXT-${c.id}${c.email ? ' · ' + escapeHtml(c.email) : ''})</option>`;
      }).join('');

      memberSelectEl.innerHTML = `
        <option value="">-- Bitte Empfänger auswählen (oder oben neu anlegen) --</option>
        ${window._externalContacts.length > 0 ? `
        <optgroup label="Gespeicherte externe Kontakte (Sponsoren, Mieter, Firmen, Privat)">
          ${externalOptions}
        </optgroup>
        ` : ''}
        <optgroup label="Vereinsmitglieder">
          ${memberOptions}
        </optgroup>
      `;

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
