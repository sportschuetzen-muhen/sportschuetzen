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

// SEND MAIL PROMPT
window.rnSendMailPrompt = async function(invoiceId, name) {
  const inv = window._invoices.find(i => String(i.id) === String(invoiceId));
  if (!inv) return;

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

  const initialEmail = recipient.email || '';
  const targetEmail = prompt(`📧 QR-Rechnung per E-Mail an ${name} versenden?\n\nBitte E-Mail-Adresse bestätigen/eingeben:`, initialEmail);
  if (targetEmail === null) return;
  if (!targetEmail.includes('@')) {
    alert("❌ Ungültige E-Mail-Adresse.");
    return;
  }
  recipient.email = targetEmail;

  showLoadingOverlay(`Erstelle QR-Rechnung und sende E-Mail an ${name}...`);

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender(inv.type || 'Jahresbeitrag')
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType(inv.type || 'Jahresbeitrag') : null);

  const layout = (window._invoiceLayouts && window._invoiceLayouts[inv.type]) || null;

  const payload = {
    action: 'sendInvoiceEmail',
    invoiceId: invoiceId,
    recipient: recipient,
    sender: sender,
    layout: layout
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess(`🎉 E-Mail erfolgreich an ${targetEmail} versandt!`);
      await loadRechnungenData(true);
    } else {
      throw new Error(result.error || "E-Mail-Versand fehlgeschlagen.");
    }
  } catch (err) {
    alert("❌ E-Mail Fehler: " + err.message);
  } finally {
    hideLoadingOverlay();
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
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-file-invoice me-2"></i>Neue Rechnung verfassen</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-create-form" onsubmit="rnSaveCreateInvoice(event)">
            <input type="hidden" id="rnc-contact-id" value="">
            
            <!-- Empfänger-Auswahl -->
            <div class="row g-3 mb-3 pb-3 border-bottom">
              <div class="col-md-12">
                <label class="form-label fw-bold small text-muted">Empfänger auswählen (Externe Kontakte & Mitglieder)</label>
                <select class="form-select fw-bold text-primary" id="rnc-member-select" onchange="rnHandleMemberSelect(this.value)">
                  <option value="" selected>-- Manuelle Erfassung / Neuer externer Empfänger --</option>
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

            <!-- Adressdaten -->
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-bold small text-muted">Empfänger-ID / Mgl-Nr</label>
                <input type="text" class="form-control font-monospace" id="rnc-person-number" placeholder="z.B. EXT-1">
              </div>
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Empfänger (Name / Firma)</label>
                <input type="text" class="form-control" id="rnc-name" required placeholder="z.B. Mittelland AG oder Hans Müller">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">E-Mail</label>
                <input type="email" class="form-control" id="rnc-email" placeholder="z.B. rechnung@firma.ch">
              </div>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-muted">Strasse, Nr.</label>
                <input type="text" class="form-control" id="rnc-strasse" placeholder="z.B. Hauptstrasse 22">
              </div>
              <div class="col-md-2">
                <label class="form-label fw-bold small text-muted">PLZ</label>
                <input type="text" class="form-control font-monospace" id="rnc-plz" placeholder="5037">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Ort</label>
                <input type="text" class="form-control" id="rnc-ort" placeholder="Muhen">
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
                      <th style="width: 40px;" class="text-center">#</th>
                      <th>Beschreibung der Dienstleistung / Ware</th>
                      <th style="width: 90px;" class="text-end">Menge</th>
                      <th style="width: 130px;" class="text-end">Einzelpreis</th>
                      <th style="width: 130px;" class="text-end">Gesamt (CHF)</th>
                      <th style="width: 50px;" class="text-center">Aktion</th>
                    </tr>
                  </thead>
                  <tbody id="rnc-positions-tbody">
                    <!-- Wird dynamisch gefüllt -->
                  </tbody>
                  <tfoot>
                    <tr class="table-light fw-extrabold text-primary" style="font-size:14px;">
                      <td colspan="4" class="text-end">Gesamtsumme (CHF):</td>
                      <td class="text-end font-monospace" id="rnc-total-sum">CHF 0.00</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- Submit -->
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="rnc-submit-btn">
                <i class="fas fa-check-circle me-1"></i> Rechnung verbindlich erstellen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('rnc-invoice-id').value = (typeof window.generateSafeInvoiceId === 'function')
    ? window.generateSafeInvoiceId('RE', window._bhYear)
    : `RE-${String(window._bhYear || new Date().getFullYear()).slice(-2)}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  if (typeof window.rncAddPositionRow === 'function') {
    window.rncAddPositionRow("Miete Schützenhaus Muhen", 150);
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
};

// AUTOCOMPLETE SELECTOR HANDLER
window.rnHandleMemberSelect = function(val) {
  const contactIdEl = document.getElementById('rnc-contact-id');
  if (contactIdEl) contactIdEl.value = '';

  if (!val) {
    document.getElementById('rnc-person-number').value = '';
    document.getElementById('rnc-name').value = '';
    document.getElementById('rnc-email').value = '';
    document.getElementById('rnc-strasse').value = '';
    document.getElementById('rnc-plz').value = '';
    document.getElementById('rnc-ort').value = '';
    return;
  }

  if (val.startsWith('MBR:')) {
    const personNumber = val.replace('MBR:', '');
    const m = (window._mglData || []).find(x => String(x.PersonNumber) === String(personNumber));
    if (m) {
      document.getElementById('rnc-person-number').value = m.PersonNumber || '';
      document.getElementById('rnc-name').value = `${m.LastName} ${m.FirstName}`;
      document.getElementById('rnc-email').value = m.PrimaryEmail || m.Email || '';
      document.getElementById('rnc-strasse').value = m.Street || m.Strasse || '';
      document.getElementById('rnc-plz').value = m.ZipCode || m.PLZ || '';
      document.getElementById('rnc-ort').value = m.City || m.Ort || '';
      document.getElementById('rnc-type').value = 'Jahresbeitrag';
    }
  } else if (val.startsWith('EXT:')) {
    const extId = val.replace('EXT:', '').trim();
    const c = (window._externalContacts || []).find(x => String(x.id).trim() === extId);
    if (c) {
      if (contactIdEl) contactIdEl.value = c.id;
      document.getElementById('rnc-person-number').value = 'EXT-' + c.id;
      
      const isFirma = c.typ === 'firma' || Boolean(c.firma);
      const displayName = isFirma ? (c.firma || c.name) : ((c.vorname ? c.vorname + ' ' + c.nachname : '') || c.name);
      
      document.getElementById('rnc-name').value = displayName || '';
      document.getElementById('rnc-email').value = c.email || '';
      document.getElementById('rnc-strasse').value = [c.strasse, c.adresszusatz].filter(Boolean).join(', ') || '';
      document.getElementById('rnc-plz').value = c.plz || '';
      document.getElementById('rnc-ort').value = c.ort || '';
      
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

function rncAddPositionRow(desc = "", unitPrice = "", qty = 1) {
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

  const nowStr = typeof formatSwissDate === 'function' ? formatSwissDate(new Date()) : new Date().toLocaleDateString('de-CH');

  const invoiceHeader = {
    id: invoiceId,
    PersonNumber: personNumber,
    name: name,
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
    positions.push({
      position_nr: index + 1,
      description: desc,
      quantity: qty,
      unit_price: unitPrice,
      amount: amt
    });
    totalAmount += amt;
  });

  invoiceHeader.total_amount = totalAmount;

  if (positions.length === 0) {
    alert("❌ Bitte fügen Sie mindestens eine Rechnungsposition hinzu.");
    return;
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
  } else {
    // Externe Kontakte: streng nach ID (oder Fallback auf Name)
    const extId = String(inv.PersonNumber || '').replace('EXT-', '').replace('EXT:', '').trim();
    if (!recipient && extId) {
      recipient = (window._externalContacts || []).find(c => String(c.id).trim() === extId);
    }
    if (!recipient && inv.name) {
      recipient = (window._externalContacts || []).find(c => String(c.name).trim().toLowerCase() === String(inv.name).trim().toLowerCase());
    }
    if (recipient) {
      contactId = recipient.id || extId;
      email = recipient.email || '';
      strasse = recipient.strasse || '';
      plz = recipient.plz || '';
      ort = recipient.ort || '';
    }
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-warning text-dark border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-edit me-2"></i>Rechnung bearbeiten (ID: ${inv.id})</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-edit-form" onsubmit="rnSaveEditInvoice(event, '${inv.id}')">
            <input type="hidden" id="rne-contact-id" value="${escapeHtml(contactId)}">
            
            <!-- Adressdaten -->
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-bold small text-muted">Empfänger-ID / Mgl-Nr</label>
                <input type="text" class="form-control font-monospace bg-light" id="rne-person-number" readonly value="${inv.PersonNumber || ''}">
              </div>
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Empfänger (Name / Firma)</label>
                <input type="text" class="form-control" id="rne-name" required value="${escapeHtml(inv.name || '')}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">E-Mail</label>
                <input type="email" class="form-control" id="rne-email" value="${escapeHtml(email)}">
              </div>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-muted">Strasse, Nr.</label>
                <input type="text" class="form-control" id="rne-strasse" value="${escapeHtml(strasse)}">
              </div>
              <div class="col-md-2">
                <label class="form-label fw-bold small text-muted">PLZ</label>
                <input type="text" class="form-control font-monospace" id="rne-plz" value="${escapeHtml(plz)}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Ort</label>
                <input type="text" class="form-control" id="rne-ort" value="${escapeHtml(ort)}">
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
                      <th style="width: 40px;" class="text-center">#</th>
                      <th>Beschreibung der Dienstleistung / Ware</th>
                      <th style="width: 90px;" class="text-end">Menge</th>
                      <th style="width: 130px;" class="text-end">Einzelpreis</th>
                      <th style="width: 130px;" class="text-end">Gesamt (CHF)</th>
                      <th style="width: 50px;" class="text-center">Aktion</th>
                    </tr>
                  </thead>
                  <tbody id="rne-positions-tbody">
                    <!-- Wird dynamisch gefüllt -->
                  </tbody>
                  <tfoot>
                    <tr class="table-light fw-extrabold text-primary" style="font-size:14px;">
                      <td colspan="4" class="text-end">Gesamtsumme (CHF):</td>
                      <td class="text-end font-monospace" id="rne-total-sum">CHF 0.00</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- Submit -->
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-warning py-2.5 fw-bold rounded-3 shadow-sm" id="rne-submit-btn">
                <i class="fas fa-save me-1"></i> Änderungen speichern
              </button>
            </div>
          </form>
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

  function rneAddPositionRow(desc = "", unitPrice = "", qty = 1) {
    rnePosCounter++;
    const tbody = document.getElementById('rne-positions-tbody');
    if (!tbody) return;

    const initialAmount = (qty * (Number(unitPrice) || 0)).toFixed(2);

    const tr = document.createElement('tr');
    tr.id = `rne-pos-row-${rnePosCounter}`;
    tr.innerHTML = `
      <td class="text-center font-monospace text-muted rne-pos-idx">${tbody.children.length + 1}</td>
      <td>
        <input type="text" class="form-control form-control-sm rne-pos-desc" required value="${escapeHtml(desc)}" placeholder="z.B. Getränkebezug Süsswasser">
      </td>
      <td>
        <input type="number" step="1" min="1" class="form-control form-control-sm text-end rne-pos-qty" required value="${qty}" oninput="rneRecalculateRowTotal('${tr.id}')">
      </td>
      <td>
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted">CHF</span>
          <input type="number" step="0.05" class="form-control form-control-sm text-end rne-pos-unitprice" required value="${unitPrice}" placeholder="0.00" oninput="rneRecalculateRowTotal('${tr.id}')">
        </div>
      </td>
      <td>
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-light text-muted">CHF</span>
          <input type="number" class="form-control form-control-sm text-end fw-bold rne-pos-amt bg-light" readonly value="${initialAmount}">
        </div>
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
        window.rneAddPositionRow(p.description || '', p.unit_price || p.amount || 0, p.quantity || 1);
      }
    });
  } else {
    if (typeof window.rneAddPositionRow === 'function') {
      window.rneAddPositionRow();
    }
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
};

// SAVE EDITED INVOICE
window.rnSaveEditInvoice = async function(event, invoiceId) {
  event.preventDefault();

  const name = document.getElementById('rne-name').value.trim();
  const email = document.getElementById('rne-email').value.trim();
  const strasse = document.getElementById('rne-strasse').value.trim();
  const plz = document.getElementById('rne-plz').value.trim();
  const ort = document.getElementById('rne-ort').value.trim();
  const contactId = document.getElementById('rne-contact-id') ? document.getElementById('rne-contact-id').value.trim() : '';

  let personNumber = document.getElementById('rne-person-number').value.trim();
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
    positions.push({
      position_nr: index + 1,
      description: desc,
      quantity: qty,
      unit_price: unitPrice,
      amount: amt
    });
    totalAmount += amt;
  });

  invoiceHeader.total_amount = totalAmount;

  if (positions.length === 0) {
    alert("❌ Bitte fügen Sie mindestens eine Rechnungsposition hinzu.");
    return;
  }

  // 1. Optimistic Update
  const invIndex = window._invoices.findIndex(i => String(i.id) === String(invoiceId));
  let oldInv = null;
  if (invIndex !== -1) {
    oldInv = { ...window._invoices[invIndex] };
    window._invoices[invIndex] = { ...window._invoices[invIndex], ...invoiceHeader };
    window.renderRechnungen(); // Render table instantly!
  }

  // Falls externer Kontakt, Kontaktdaten auch lokal in _externalContacts aktualisieren
  if (contactId || !document.getElementById('rne-person-number').value.trim() || String(document.getElementById('rne-person-number').value.trim()).startsWith('EXT')) {
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
    }
  }

  // Close modal instantly
  const modalEl = document.getElementById('rnModalEditInvoice');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  showSuccess(`🎉 Rechnung ${invoiceId} erfolgreich aktualisiert (Hintergrund-Synchronisation läuft)...`);

  const payload = {
    action: 'updateInvoice',
    invoice: invoiceHeader,
    positions: positions,
    recipient: {
      id: contactId,
      vorname: name.split(' ')[0] || '',
      nachname: name.split(' ').slice(1).join(' ') || '',
      strasse: strasse,
      plz: plz,
      ort: ort,
      email: email
    }
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

// MAHNUNG PROMPT & SEND
window.rnSendMahnungPrompt = async function(invoiceId, name) {
  const inv = window._invoices.find(i => String(i.id) === String(invoiceId));
  if (!inv) return;

  const m = (window._mglData || []).find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};
  const nieMahnen = m && (m.Niemahnen === '1' || m.Niemahnen === true || m.Niemahnen === 1);

  if (nieMahnen) {
    if (!confirm(`⚠️ WICHTIGER HINWEIS:\n\nFür ${name} ist in den Mitgliederstammdaten die Option "Nie mahnen" aktiviert!\n\nMöchtest du trotzdem eine Zahlungserinnerung / Mahnung versenden?`)) {
      return;
    }
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

  const initialEmail = recipient.email || '';
  const targetEmail = prompt(`⚠️ Zahlungserinnerung / Mahnung an ${name} versenden?\n\nBitte E-Mail-Adresse bestätigen/eingeben:`, initialEmail);
  if (targetEmail === null) return;
  if (!targetEmail.includes('@')) {
    alert("❌ Ungültige E-Mail-Adresse.");
    return;
  }
  recipient.email = targetEmail;

  showLoadingOverlay(`Erstelle Mahnungs-PDF und sende E-Mail an ${name}...`);

  const sender = (typeof rnGetLoggedInSender === 'function')
    ? rnGetLoggedInSender(inv.type || 'Mahnung')
    : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType(inv.type || 'Mahnung') : null);

  const layout = (window._invoiceLayouts && window._invoiceLayouts['Mahnung']) || null;

  const payload = {
    action: 'sendMahnung',
    invoiceId: invoiceId,
    recipient: recipient,
    sender: sender,
    layout: layout
  };

  try {
    const response = await apiFetch('rechnungen', payload, 'POST');
    const result = await response.json();

    if (result.success) {
      // Optimistic Status Update
      inv.status = 'gemahnt';
      window.renderRechnungen();
      showSuccess(`🎉 Mahnung / Zahlungserinnerung erfolgreich an ${targetEmail} versandt!`);
      await loadRechnungenData(true, true);
    } else {
      throw new Error(result.error || "Mahnungs-Versand fehlgeschlagen.");
    }
  } catch (err) {
    alert("❌ Mahnung Fehler: " + err.message);
  } finally {
    hideLoadingOverlay();
  }
};

// =====================================================================
// EXTERNE KONTAKTE VERWALTUNG (CRUD STRENG NACH ID)
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
      <div class="modal-content border-0 rounded-4 shadow-lg">
        <div class="modal-header ${contact ? 'bg-warning text-dark' : 'bg-primary text-white'} border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold">
            <i class="fas ${contact ? 'fa-user-edit' : 'fa-user-plus'} me-2"></i>
            ${contact ? 'Externen Kontakt bearbeiten' : 'Neuer externer Kontakt erfassen'}
          </h5>
          <button type="button" class="btn-close ${contact ? '' : 'btn-close-white'}" data-bs-dismiss="modal" aria-label="Close"></button>
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
      if (nachname || vorname) {
        const pName = [anrede, vorname, nachname].filter(Boolean).join(' ');
        lines.push(`z.Hd. ${pName}${abteilung ? ` (${abteilung})` : ''}`);
      } else if (abteilung) {
        lines.push(abteilung);
      }
    } else {
      const pName = [anrede, vorname, nachname].filter(Boolean).join(' ');
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
