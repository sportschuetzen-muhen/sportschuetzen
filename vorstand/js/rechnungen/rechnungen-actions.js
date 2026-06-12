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
                <strong>Option EIN (Standard):</strong> Verbucht die Zahlung automatisch im Journal (Soll Bank \`1020\` an Haben Debitoren \`1100\`).<br>
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

  const modal = new bootstrap.Modal(modalEl);
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
    window._invoices[invIndex].status = 'Bezahlt';
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

  const m = window._mglData.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};

  const sender = typeof jbGetSenderForInvoiceType === 'function'
    ? jbGetSenderForInvoiceType(inv.type || 'Jahresbeitrag')
    : null;

  const payload = {
    action: 'generateInvoicePDF',
    invoiceId: invoiceId,
    recipient: {
      vorname: m.FirstName || inv.name.split(' ')[0] || '',
      nachname: m.LastName || inv.name.split(' ').slice(1).join(' ') || '',
      strasse: m.Street || m.Strasse || '',
      plz: m.PostCode || m.ZipCode || m.PLZ || '',
      ort: m.City || m.Ort || '',
      email: m.PrimaryEmail || m.Email || ''
    },
    sender: sender
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

  const m = window._mglData.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};
  const email = m.PrimaryEmail || m.Email || '';

  const targetEmail = prompt(`📧 QR-Rechnung per E-Mail an ${name} versenden?\n\nBitte E-Mail-Adresse bestätigen/eingeben:`, email || 'mitglied@sportschuetzen-muhen.ch');
  if (targetEmail === null) return;
  if (!targetEmail.includes('@')) {
    alert("❌ Ungültige E-Mail-Adresse.");
    return;
  }

  showLoadingOverlay(`Erstelle QR-Rechnung und sende E-Mail an ${name}...`);

  const sender = typeof jbGetSenderForInvoiceType === 'function'
    ? jbGetSenderForInvoiceType(inv.type || 'Jahresbeitrag')
    : null;

  const payload = {
    action: 'sendInvoiceEmail',
    invoiceId: invoiceId,
    recipient: {
      vorname: m.FirstName || inv.name.split(' ')[0] || '',
      nachname: m.LastName || inv.name.split(' ').slice(1).join(' ') || '',
      strasse: m.Street || m.Strasse || '',
      plz: m.PostCode || m.ZipCode || m.PLZ || '',
      ort: m.City || m.Ort || '',
      email: targetEmail
    },
    sender: sender
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
window.rnOpenCreateModal = async function() {
  let modalEl = document.getElementById('rnModalCreateInvoice');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalCreateInvoice';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  // Externe Kontakte laden
  window._externalContacts = [];
  try {
    const response = await apiFetch('rechnungen', 'action=getContacts');
    const result = await response.json();
    if (result.success) {
      window._externalContacts = result.data || [];
    }
  } catch (err) {
    console.error("⚠️ Fehler beim Laden der externen Kontakte:", err);
  }

  const memberOptions = (window._mglData || []).map(m => 
    `<option value="MBR:${m.PersonNumber}">${m.LastName} ${m.FirstName} (Nr: ${m.PersonNumber})</option>`
  ).join('');

  const externalOptions = (window._externalContacts || []).map((c, idx) => 
    `<option value="EXT:${idx}">${c.name} (Extern - ${c.email || 'keine Mail'})</option>`
  ).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-file-invoice me-2"></i>Neue Rechnung verfassen</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-create-form" onsubmit="rnSaveCreateInvoice(event)">
            
            <!-- Empfänger-Auswahl -->
            <div class="row g-3 mb-3 pb-3 border-bottom">
              <div class="col-md-12">
                <label class="form-label fw-bold small text-muted">Empfänger auswählen (Mitglieder & Externe)</label>
                <select class="form-select fw-bold text-primary" id="rnc-member-select" onchange="rnHandleMemberSelect(this.value)">
                  <option value="" selected>-- Manuelle Erfassung / Neuer externer Empfänger --</option>
                  <optgroup label="Vereinsmitglieder">
                    ${memberOptions}
                  </optgroup>
                  ${window._externalContacts.length > 0 ? `
                  <optgroup label="Gespeicherte externe Kontakte">
                    ${externalOptions}
                  </optgroup>
                  ` : ''}
                </select>
              </div>
            </div>

            <!-- Adressdaten -->
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-bold small text-muted">Mitglieds-Nr</label>
                <input type="text" class="form-control font-monospace" id="rnc-person-number" placeholder="Optional">
              </div>
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Name, Vorname (Empfänger)</label>
                <input type="text" class="form-control" id="rnc-name" required placeholder="z.B. Müller Hans">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">E-Mail</label>
                <input type="email" class="form-control" id="rnc-email" placeholder="z.B. hans@mueller.ch">
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
                      ${rnGetDropdownMenuHtml('rncAddPositionRow')}
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
                    <!-- Standardmäßig eine Zeile eintragen -->
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
                <i class="fas fa-check-circle me-1"></i> QR-Rechnung erstellen & Soll-Buchen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const nextRand = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById('rnc-invoice-id').value = `INV-${window._bhYear}-${nextRand}`;

  rncAddPositionRow("Miete Schützenhaus Muhen", 150);

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

// AUTOCOMPLETE SELECTOR HANDLER
window.rnHandleMemberSelect = function(val) {
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
    const m = window._mglData.find(x => String(x.PersonNumber) === String(personNumber));
    if (m) {
      document.getElementById('rnc-person-number').value = m.PersonNumber || '';
      document.getElementById('rnc-name').value = `${m.LastName} ${m.FirstName}`;
      document.getElementById('rnc-email').value = m.Email || '';
      document.getElementById('rnc-strasse').value = m.Street || m.Strasse || '';
      document.getElementById('rnc-plz').value = m.ZipCode || m.PLZ || '';
      document.getElementById('rnc-ort').value = m.City || m.Ort || '';
      document.getElementById('rnc-type').value = 'Jahresbeitrag';
    }
  } else if (val.startsWith('EXT:')) {
    const idx = parseInt(val.replace('EXT:', ''), 10);
    const c = window._externalContacts[idx];
    if (c) {
      document.getElementById('rnc-person-number').value = '';
      document.getElementById('rnc-name').value = c.name || '';
      document.getElementById('rnc-email').value = c.email || '';
      document.getElementById('rnc-strasse').value = c.strasse || '';
      document.getElementById('rnc-plz').value = c.plz || '';
      document.getElementById('rnc-ort').value = c.ort || '';
      document.getElementById('rnc-type').value = 'Vermietung';
    }
  }
};

// POSITION ROW DYNAMIC FUNCTIONS
let rncPosCounter = 0;
window.rncAddPositionRow = function(desc = "", unitPrice = "", qty = 1) {
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
};

window.rncRecalculateRowTotal = function(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const qty = Number(row.querySelector('.rnc-pos-qty').value || 1);
  const unitPrice = Number(row.querySelector('.rnc-pos-unitprice').value || 0);
  const amtEl = row.querySelector('.rnc-pos-amt');
  if (amtEl) {
    amtEl.value = (qty * unitPrice).toFixed(2);
  }
  rncRecalculateTotal();
};

window.rncRemovePositionRow = function(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    const idxs = document.querySelectorAll('.rnc-pos-idx');
    idxs.forEach((el, index) => el.textContent = index + 1);
    rncRecalculateTotal();
  }
};

window.rncRecalculateTotal = function() {
  const amts = document.querySelectorAll('.rnc-pos-amt');
  let sum = 0;
  amts.forEach(el => sum += Number(el.value || 0));

  const totalEl = document.getElementById('rnc-total-sum');
  if (totalEl) {
    totalEl.textContent = fmtChf(sum);
  }
};

// SAVE NEW MANUALLY INVOICE
window.rnSaveCreateInvoice = async function(event) {
  event.preventDefault();

  const invoiceId = document.getElementById('rnc-invoice-id').value;
  const name = document.getElementById('rnc-name').value.trim();
  const email = document.getElementById('rnc-email').value.trim();
  const strasse = document.getElementById('rnc-strasse').value.trim();
  const plz = document.getElementById('rnc-plz').value.trim();
  const ort = document.getElementById('rnc-ort').value.trim();
  
  const invoiceHeader = {
    id: invoiceId,
    PersonNumber: document.getElementById('rnc-person-number').value.trim(),
    name: name,
    year: Number(document.getElementById('rnc-year').value),
    type: document.getElementById('rnc-type').value,
    total_amount: 0,
    status: 'Offen',
    datum: new Date().toISOString().split('T')[0]
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
  window.renderRechnungen(); // Render table instantly!

  // Close modal instantly
  const modalEl = document.getElementById('rnModalCreateInvoice');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  showSuccess(`🎉 Rechnung ${invoiceId} erfolgreich erstellt (Hintergrund-Synchronisation läuft)...`);

  const payload = {
    action: 'createInvoice',
    invoice: invoiceHeader,
    positions: positions,
    recipient: {
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
      throw new Error(result.error || "Fehler beim Anlegen im Backend.");
    }
    
    // Lazy sync after 1500ms
    setTimeout(async () => {
      await loadRechnungenData(true);
    }, 1500);
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
  let inv, positions;
  try {
    const res = await apiFetch('rechnungen', { action: 'getInvoiceDetails', invoiceId });
    const data = await res.json();
    if (data.success) {
      inv = data.invoice;
      positions = data.positions || [];
    } else {
      throw new Error(data.error || "Unerwarteter Fehler.");
    }
  } catch (err) {
    hideLoadingOverlay();
    alert("❌ Fehler beim Laden der Rechnungsdetails: " + err.message);
    return;
  }
  hideLoadingOverlay();

  const m = window._mglData.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) || {};

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-warning text-dark border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-edit me-2"></i>Rechnung bearbeiten (ID: ${inv.id})</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="rn-edit-form" onsubmit="rnSaveEditInvoice(event, '${inv.id}')">
            
            <!-- Adressdaten -->
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-bold small text-muted">Mitglieds-Nr</label>
                <input type="text" class="form-control font-monospace bg-light" id="rne-person-number" readonly value="${inv.PersonNumber || ''}">
              </div>
              <div class="col-md-5">
                <label class="form-label fw-bold small text-muted">Name, Vorname (Empfänger)</label>
                <input type="text" class="form-control" id="rne-name" required value="${escapeHtml(inv.name || '')}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">E-Mail</label>
                <input type="email" class="form-control" id="rne-email" value="${escapeHtml(m.Email || '')}">
              </div>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-muted">Strasse, Nr.</label>
                <input type="text" class="form-control" id="rne-strasse" value="${escapeHtml(m.Street || m.Strasse || '')}">
              </div>
              <div class="col-md-2">
                <label class="form-label fw-bold small text-muted">PLZ</label>
                <input type="text" class="form-control font-monospace" id="rne-plz" value="${escapeHtml(m.ZipCode || m.PLZ || '')}">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold small text-muted">Ort</label>
                <input type="text" class="form-control" id="rne-ort" value="${escapeHtml(m.City || m.Ort || '')}">
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
                      ${rnGetDropdownMenuHtml('rneAddPositionRow')}
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

            <div class="alert alert-info text-start small mb-4 py-2 border-0" style="background-color: rgba(13, 110, 253, 0.08); border-radius: 12px; font-weight: 500;">
              <i class="fas fa-info-circle me-1 text-primary"></i>
              <strong>Hinweis:</strong> Falls sich der Gesamtbetrag ändert, passe bitte den Soll-Buchungssatz (Beleg: ${inv.id}) manuell in der Buchhaltung an.
            </div>

            <!-- Submit -->
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-warning py-2.5 fw-bold rounded-3 shadow-sm" id="rne-submit-btn">
                <i class="fas fa-save me-1"></i> Änderungen speichern & Buchen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  let rnePosCounter = 0;
  window.rneAddPositionRow = function(desc = "", unitPrice = "", qty = 1) {
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
  };

  window.rneRecalculateRowTotal = function(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const qty = Number(row.querySelector('.rne-pos-qty').value || 1);
    const unitPrice = Number(row.querySelector('.rne-pos-unitprice').value || 0);
    const amtEl = row.querySelector('.rne-pos-amt');
    if (amtEl) {
      amtEl.value = (qty * unitPrice).toFixed(2);
    }
    rneRecalculateTotal();
  };

  window.rneRemovePositionRow = function(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
      row.remove();
      const idxs = document.querySelectorAll('.rne-pos-idx');
      idxs.forEach((el, index) => el.textContent = index + 1);
      rneRecalculateTotal();
    }
  };

  window.rneRecalculateTotal = function() {
    const amts = document.querySelectorAll('.rne-pos-amt');
    let sum = 0;
    amts.forEach(el => sum += Number(el.value || 0));
    const totalEl = document.getElementById('rne-total-sum');
    if (totalEl) {
      totalEl.textContent = fmtChf(sum);
    }
  };

  if (positions.length > 0) {
    positions.forEach(p => {
      rneAddPositionRow(p.description || '', p.unit_price || p.amount || 0, p.quantity || 1);
    });
  } else {
    rneAddPositionRow();
  }

  const modal = new bootstrap.Modal(modalEl);
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
  
  const invoiceHeader = {
    id: invoiceId,
    PersonNumber: document.getElementById('rne-person-number').value.trim(),
    name: name,
    year: Number(document.getElementById('rne-year').value),
    type: document.getElementById('rne-type').value,
    total_amount: 0
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
    
    // Lazy sync after 1500ms
    setTimeout(async () => {
      await loadRechnungenData(true);
    }, 1500);
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
