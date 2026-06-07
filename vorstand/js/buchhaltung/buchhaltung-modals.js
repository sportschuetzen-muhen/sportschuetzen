// =====================================================================
// MODUL: BUCHHALTUNG & KMU-FINANZBERICHTE - MODALS & ACTIONS
// =====================================================================

// KONTENRAHMEN-EDITOR: MODAL ERSTELLEN ODER BEARBEITEN
window.bhOpenKontoModal = function(kontoCode) {
  let modalEl = document.getElementById('bhModalKonto');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalKonto';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }
  
  const prevYear = Number(window._bhYear) - 1;
  let prevYearActual = 0;
  let prevYearBudget = 0;
  let budgetVal = 0;

  if (kontoCode) {
    const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(kontoCode).trim());
    if (acc) {
      const prevYearJournal = window._bhJournal.filter(j => Number(j.jahr) === prevYear);
      let balanceChange = 0;
      const isAssetOrExpense = (acc.klasse == '1' || acc.klasse == '4' || acc.klasse == '5' || acc.klasse == '6' || acc.klasse == '7' || String(acc.klasse).toLowerCase().startsWith('akt') || String(acc.klasse).toLowerCase().startsWith('auf'));
      
      prevYearJournal.forEach(entry => {
        const soll = String(entry.konto_soll).trim();
        const haben = String(entry.konto_haben).trim();
        const amount = Number(entry.betrag || 0);
        
        if (soll === String(kontoCode).trim()) {
          balanceChange += isAssetOrExpense ? amount : -amount;
        }
        if (haben === String(kontoCode).trim()) {
          balanceChange += isAssetOrExpense ? -amount : amount;
        }
      });
      prevYearActual = Number(acc.eroeffnungssaldo || 0) + balanceChange;

      const prevBud = window._bhBudget.find(b => String(b.konto).trim() === String(kontoCode).trim());
      prevYearBudget = prevBud ? Number(prevBud['budget_' + prevYear] || 0) : 0;

      const bud = window._bhBudget.find(b => String(b.konto).trim() === String(kontoCode).trim());
      budgetVal = bud ? Number(bud['budget_' + window._bhYear] || 0) : 0;

      if (budgetVal === 0) {
        budgetVal = prevYearActual !== 0 ? prevYearActual : prevYearBudget;
      }
    }
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px);">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold" id="bh-konto-modal-title">Sachkonto bearbeiten</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="bh-konto-form" onsubmit="bhSaveKonto(event)">
            <input type="hidden" id="bhk-mode" value="new">
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Kontonummer (4-stellig)</label>
              <input type="text" class="form-control fw-bold" id="bhk-konto" required placeholder="z.B. 1000" pattern="^[0-9]{4}$" title="Bitte eine 4-stellige Nummer eingeben.">
              <div class="form-text text-muted small">Eindeutiger 4-stelliger Nummernschlüssel nach KMU.</div>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Bezeichnung</label>
              <input type="text" class="form-control" id="bhk-bezeichnung" required placeholder="z.B. PostFinance">
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Klassifizierung (Klasse)</label>
              <select class="form-select" id="bhk-klasse" required>
                <option value="1">1 - Aktiven (Vermögenswerte)</option>
                <option value="2">2 - Passiven (Fremd- & Eigenkapital)</option>
                <option value="3">3 - Ertrag (Einnahmen)</option>
                <option value="4">4 - Aufwand (Betrieblich/Schiessbetrieb)</option>
                <option value="5">5 - Aufwand (Personal/Entschädigungen)</option>
                <option value="6">6 - Aufwand (Verwaltung/Gebäude/Sonstiges)</option>
              </select>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Eröffnungssaldo (CHF)</label>
              <div class="input-group">
                <span class="input-group-text bg-light fw-bold text-muted">CHF</span>
                <input type="number" step="0.01" class="form-control fw-bold" id="bhk-eroeffnungssaldo" required value="0.00">
              </div>
            </div>

            <div class="mb-4 bg-light p-3 rounded-3 border border-light shadow-sm">
              <label class="form-label fw-bold small text-dark d-flex justify-content-between align-items-center mb-2">
                <span>Budget für das Jahr ${window._bhYear} (CHF)</span>
                <span class="text-secondary small fw-normal" style="cursor: pointer; user-select: none;" onclick="document.getElementById('bhk-budget').value = ${Math.round(prevYearActual)}; return false;" title="Klicken, um Vorjahres-Ist als Basis einzusetzen">
                  Vorjahres-Ist (${prevYear}): <span class="fw-bold text-primary">${fmtChf(prevYearActual)} 📋</span>
                </span>
              </label>
              <div class="input-group">
                <span class="input-group-text bg-white fw-bold text-secondary"><i class="fas fa-chart-pie me-1"></i> CHF</span>
                <input type="number" step="1" class="form-control fw-bold bg-white" id="bhk-budget" value="${Math.round(budgetVal)}">
              </div>
              <div class="form-text text-muted small d-flex justify-content-between mt-1">
                <span>Wird im Controlling verwendet.</span>
                <span>Vorjahres-Budget: ${prevYearBudget > 0 ? fmtChf(prevYearBudget) : 'keines'}</span>
              </div>
            </div>
            
            <div class="d-grid">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="bhk-submit-btn">
                <i class="fas fa-check-circle me-1"></i> Sachkonto speichern
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  
  const titleEl = document.getElementById('bh-konto-modal-title');
  const modeEl = document.getElementById('bhk-mode');
  const kontoEl = document.getElementById('bhk-konto');
  const bezeichnungEl = document.getElementById('bhk-bezeichnung');
  const klasseEl = document.getElementById('bhk-klasse');
  const saldoEl = document.getElementById('bhk-eroeffnungssaldo');
  
  if (kontoCode) {
    titleEl.textContent = 'Sachkonto bearbeiten';
    modeEl.value = 'edit';
    kontoEl.value = kontoCode;
    kontoEl.readOnly = true;
    
    const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(kontoCode).trim());
    if (acc) {
      bezeichnungEl.value = acc.bezeichnung || '';
      
      let mappedKlasse = '1';
      const k = String(acc.klasse).trim();
      if (k === '2' || k.toLowerCase().startsWith('pas')) mappedKlasse = '2';
      else if (k === '3' || k.toLowerCase().startsWith('ert')) mappedKlasse = '3';
      else if (k === '4') mappedKlasse = '4';
      else if (k === '5') mappedKlasse = '5';
      else if (k === '6' || k.toLowerCase().startsWith('auf')) mappedKlasse = '6';
      klasseEl.value = mappedKlasse;
      
      saldoEl.value = Number(acc.eroeffnungssaldo || 0).toFixed(2);
    }
  } else {
    titleEl.textContent = 'Neues Sachkonto anlegen';
    modeEl.value = 'new';
    kontoEl.value = '';
    kontoEl.readOnly = false;
    bezeichnungEl.value = '';
    klasseEl.value = '1';
    saldoEl.value = '0.00';
  }
  
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

// API POST-Request zum Speichern des Kontos und des Budgets
window.bhSaveKonto = async function(event) {
  event.preventDefault();
  
  const submitBtn = document.getElementById('bhk-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere...';
  }
  
  const payload = {
    action: 'saveKonto',
    konto: document.getElementById('bhk-konto').value.trim(),
    bezeichnung: document.getElementById('bhk-bezeichnung').value.trim(),
    klasse: document.getElementById('bhk-klasse').value,
    eroeffnungssaldo: Number(document.getElementById('bhk-eroeffnungssaldo').value || 0)
  };

  const budgetVal = Number(document.getElementById('bhk-budget').value || 0);
  
  try {
    const response = await apiFetch('buchhaltung', payload, 'POST');
    const result = await response.json();
    
    if (result.success) {
      const budgetPayload = {
        action: 'saveBudget',
        konto: payload.konto,
        bezeichnung: payload.bezeichnung,
        jahr: window._bhYear,
        betrag: budgetVal
      };
      
      const budgetResponse = await apiFetch('buchhaltung', budgetPayload, 'POST');
      const budgetResult = await budgetResponse.json();
      
      if (!budgetResult.success) {
        throw new Error(budgetResult.error || "Fehler beim Speichern des Budgets.");
      }
      
      showSuccess(`🎉 Sachkonto ${payload.konto} (${payload.bezeichnung}) und Budget erfolgreich gespeichert!`);
      
      const modalEl = document.getElementById('bhModalKonto');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      await loadBuchhaltungData(true);
    } else {
      throw new Error(result.error || "Fehler beim Speichern im Backend.");
    }
  } catch (err) {
    alert("❌ Fehler beim Speichern: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Sachkonto speichern';
    }
  }
};

// Deaktivierte Lösch-Aktion für Sachkonten
window.bhDeleteKonto = function(kontoCode) {
  alert(`Sachkonto ${kontoCode} kann nicht gelöscht werden, da es mit historischen Transaktionen verknüpft sein könnte. Falls es ungenutzt ist, wenden Sie sich bitte an den Systemadministrator.`);
};

// POPUP-MODAL: MANUELLE BUCHUNG ERFASSEN ODER BEARBEITEN
window.bhOpenEntryModal = function(entryId) {
  let modalEl = document.getElementById('bhModalNewEntry');
  
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalNewEntry';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }
  
  const sollOptions = window._bhKontenrahmen.map(acc => 
    `<option value="${acc.konto}">${acc.konto} - ${acc.bezeichnung} (${acc.klasse == '1' ? 'Aktiv' : acc.klasse == '2' ? 'Passiv' : acc.klasse == '3' ? 'Ertrag' : 'Aufwand'})</option>`
  ).join('');
  
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px);">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold" id="bhe-modal-title"><i class="fas fa-receipt me-2"></i>Neue Journalbuchung erfassen</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="bh-new-entry-form" onsubmit="bhSaveJournalEntry(event)">
            <input type="hidden" id="bhe-id" value="">
            
            <div class="row g-3 mb-3">
              <div class="col-6">
                <label class="form-label fw-bold small text-muted">Buchungsdatum</label>
                <input type="date" class="form-control" id="bhe-datum" required value="${new Date().toISOString().split('T')[0]}">
              </div>
              <div class="col-6">
                <label class="form-label fw-bold small text-muted">Belegnummer</label>
                <input type="text" class="form-control fw-bold" id="bhe-beleg" required placeholder="z.B. BEL-2026-001">
              </div>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Buchungstext (Beschreibung)</label>
              <input type="text" class="form-control" id="bhe-beschreibung" required placeholder="z.B. Munitionskauf Kaliber .22">
            </div>
            
            <div class="row g-3 mb-3">
              <div class="col-6">
                <label class="form-label fw-bold small text-muted text-primary"><i class="fas fa-long-arrow-alt-right me-1"></i> Soll-Konto (Empfänger)</label>
                <select class="form-select" id="bhe-soll" required>
                  <option value="" disabled selected>Konto wählen...</option>
                  ${sollOptions}
                </select>
              </div>
              <div class="col-6">
                <label class="form-label fw-bold small text-muted text-success"><i class="fas fa-long-arrow-alt-left me-1"></i> Haben-Konto (Quelle)</label>
                <select class="form-select" id="bhe-haben" required>
                  <option value="" disabled selected>Konto wählen...</option>
                  ${sollOptions}
                </select>
              </div>
            </div>
            
            <div class="row g-3 mb-4">
              <div class="col-6">
                <label class="form-label fw-bold small text-muted">Buchungsbetrag (CHF)</label>
                <div class="input-group">
                  <span class="input-group-text bg-light fw-bold text-muted">CHF</span>
                  <input type="number" step="0.01" min="0.01" class="form-control fw-extrabold text-primary" id="bhe-betrag" required placeholder="0.00">
                </div>
              </div>
              <div class="col-6">
                <label class="form-label fw-bold small text-muted">Aktionstyp</label>
                <select class="form-select" id="bhe-typ">
                  <option value="Kassa" selected>Ausgabe / Bar</option>
                  <option value="Überweisung">Überweisung Bank</option>
                  <option value="Einnahme">Erlös / Einnahme</option>
                  <option value="Umbuchung">Umbuchung</option>
                  <option value="Rechnung">Rechnung</option>
                  <option value="Zahlung">Zahlung</option>
                </select>
              </div>
            </div>
            
            <div class="d-grid">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="bhe-submit-btn">
                <i class="fas fa-check-circle me-1"></i> Buchungssatz ins Journal schreiben
              </button>
            </div>
            
          </form>
        </div>
      </div>
    </div>
  `;
  
  const titleEl = document.getElementById('bhe-modal-title');
  const idEl = document.getElementById('bhe-id');
  const datumEl = document.getElementById('bhe-datum');
  const belegEl = document.getElementById('bhe-beleg');
  const beschreibungEl = document.getElementById('bhe-beschreibung');
  const sollEl = document.getElementById('bhe-soll');
  const habenEl = document.getElementById('bhe-haben');
  const betragEl = document.getElementById('bhe-betrag');
  const typEl = document.getElementById('bhe-typ');
  const submitBtn = document.getElementById('bhe-submit-btn');

  if (entryId) {
    const entry = window._bhJournal.find(j => Number(j.id) === Number(entryId));
    if (entry) {
      titleEl.innerHTML = `<i class="fas fa-edit me-2"></i>Buchungssatz bearbeiten (ID: ${entryId})`;
      idEl.value = entryId;
      
      let formattedDate = entry.datum;
      if (formattedDate) {
        const dateStr = String(formattedDate).trim();
        if (dateStr.includes('T')) {
          formattedDate = dateStr.split('T')[0];
        } else if (dateStr.includes('.')) {
          formattedDate = displayToIso(dateStr);
        }
      }
      datumEl.value = formattedDate || '';
      
      belegEl.value = entry.beleg_nr || '';
      beschreibungEl.value = entry.beschreibung || '';
      sollEl.value = entry.konto_soll || '';
      habenEl.value = entry.konto_haben || '';
      betragEl.value = Number(entry.betrag || 0).toFixed(2);
      
      let actionType = entry.typ || 'Kassa';
      if (actionType === 'Ausgabe / Bar' || actionType === 'Kassabuch Bar' || actionType === 'Barzahlung') {
        actionType = 'Kassa';
      } else if (actionType === 'Überweisung Bank') {
        actionType = 'Überweisung';
      } else if (actionType === 'Erlös / Einnahme') {
        actionType = 'Einnahme';
      }
      typEl.value = actionType;
      
      submitBtn.innerHTML = '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern';
    }
  } else {
    titleEl.innerHTML = `<i class="fas fa-receipt me-2"></i>Neue Journalbuchung erfassen`;
    idEl.value = '';
    
    const maxJournalId = window._bhJournal.reduce((max, current) => Math.max(max, Number(current.id || 0)), 0);
    const nextNumber = String(maxJournalId + 1).padStart(3, '0');
    belegEl.value = `BEL-${window._bhYear}-${nextNumber}`;
  }
  
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

// POST-Request zum Speichern/Aktualisieren des Buchungssatzes
window.bhSaveJournalEntry = async function(event) {
  event.preventDefault();
  
  const submitBtn = document.getElementById('bhe-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Übermittle an Hauptbuch...';
  }
  
  const payload = {
    action:       'saveJournalEntry',
    id:           document.getElementById('bhe-id').value || null,
    jahr:         window._bhYear,
    datum:        document.getElementById('bhe-datum').value,
    beleg_nr:     document.getElementById('bhe-beleg').value.trim(),
    beschreibung: document.getElementById('bhe-beschreibung').value.trim(),
    konto_soll:   document.getElementById('bhe-soll').value,
    konto_haben:  document.getElementById('bhe-haben').value,
    betrag:       Number(document.getElementById('bhe-betrag').value),
    typ:          document.getElementById('bhe-typ').value
  };
  
  if (payload.konto_soll === payload.konto_haben) {
    alert("❌ Fehler: Soll- und Haben-Konto dürfen nicht identisch sein (Gegenkonto erforderlich)!");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchungssatz ins Journal schreiben';
    }
    return;
  }
  
  // Validierung des Buchungsjahres gegenüber dem Datum
  const entryDate = new Date(payload.datum);
  const entryYear = isNaN(entryDate.getTime()) ? null : entryDate.getFullYear();
  if (entryYear && entryYear !== Number(window._bhYear)) {
    const confirmMsg = `⚠️ Buchungsdatum weicht ab!\n\nDas eingegebene Datum liegt im Jahr ${entryYear}, Sie buchen jedoch im aktiven Buchungsjahr ${window._bhYear}.\n\nMöchten Sie diese Buchung trotzdem durchführen?`;
    if (!confirm(confirmMsg)) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchungssatz ins Journal schreiben';
      }
      return;
    }
  }
  
  try {
    const response = await apiFetch('buchhaltung', payload, 'POST');
    const result = await response.json();
    
    if (result.success) {
      showSuccess(payload.id ? "🎉 Buchungssatz erfolgreich aktualisiert!" : "🎉 Buchungssatz erfolgreich im Journal registriert!");
      
      const modalEl = document.getElementById('bhModalNewEntry');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      if (result.data) {
        const savedEntry = result.data;
        if (payload.id) {
          const idx = window._bhJournal.findIndex(j => Number(j.id) === Number(savedEntry.id));
          if (idx !== -1) {
            window._bhJournal[idx] = savedEntry;
          }
        } else {
          window._bhJournal.push(savedEntry);
        }
        recalculateLiveAccountBalances();
        updateAccountingKPIs();
        renderActiveAccountingTab();
      }
      
      setTimeout(async () => {
        await loadBuchhaltungData(true);
      }, 1500);
    } else {
      throw new Error(result.error || "Unerwarteter Fehler im Backend.");
    }
  } catch (err) {
    alert("❌ Fehler beim Buchen: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchungssatz ins Journal schreiben';
    }
  }
};

// POST-Request zum Löschen eines Buchungssatzes
window.bhDeleteJournalEntry = async function(entryId) {
  const entry = window._bhJournal.find(j => Number(j.id) === Number(entryId));
  if (!entry) return;

  const conf = confirm(`⚠️ Buchungssatz löschen?\n\nMöchten Sie den Buchungssatz (ID: ${entryId}) wirklich unwiderruflich aus dem Journal löschen?\n\nBeleg: ${entry.beleg_nr}\nBetrag: ${fmtChf(entry.betrag)}\nText: ${entry.beschreibung}`);
  if (!conf) return;

  try {
    const response = await apiFetch('buchhaltung', { action: 'deleteJournalEntry', id: entryId }, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess("🎉 Buchungssatz erfolgreich aus dem Journal gelöscht!");
      
      window._bhJournal = window._bhJournal.filter(j => Number(j.id) !== Number(entryId));
      recalculateLiveAccountBalances();
      updateAccountingKPIs();
      renderActiveAccountingTab();
      
      setTimeout(async () => {
        await loadBuchhaltungData(true);
      }, 1500);
    } else {
      throw new Error(result.error || "Unerwarteter Fehler beim Löschen.");
    }
  } catch (err) {
    alert("❌ Fehler beim Löschen der Buchung: " + err.message);
  }
};

// POPUP-MODAL: KONTOAUSZUG / DETAILS FÜR EIN EINZELNES KONTO ANZEIGEN
window.bhOpenKontoauszugModal = function(kontoCode) {
  let modalEl = document.getElementById('bhModalKontoauszug');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalKontoauszug';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  let selectedKonto = String(kontoCode || '').trim();
  let acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === selectedKonto);
  if (!acc && window._bhKontenrahmen.length > 0) {
    acc = window._bhKontenrahmen[0];
    selectedKonto = String(acc.konto).trim();
  }

  if (!acc) {
    alert("Keine Sachkonten vorhanden!");
    return;
  }

  const isAssetOrExpense = (acc.klasse == '1' || acc.klasse == '4' || acc.klasse == '5' || acc.klasse == '6' || acc.klasse == '7' || String(acc.klasse).toLowerCase().startsWith('akt') || String(acc.klasse).toLowerCase().startsWith('auf'));
  const opBalance = Number(acc._dynamicEroeffnungssaldo || 0);

  // Filter journal entries for the current account and year
  const accountEntries = window._bhJournal.filter(j => 
    Number(j.jahr) === Number(window._bhYear) && 
    (String(j.konto_soll).trim() === selectedKonto || String(j.konto_haben).trim() === selectedKonto)
  );

  // Sort by date (chronological) and then by id
  accountEntries.sort((a, b) => {
    const dateA = new Date(a.datum);
    const dateB = new Date(b.datum);
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    return Number(a.id || 0) - Number(b.id || 0);
  });

  let runningBalance = opBalance;
  let totalSoll = 0;
  let totalHaben = 0;

  const rowsHtml = accountEntries.map(entry => {
    const isSoll = String(entry.konto_soll).trim() === selectedKonto;
    const amount = Number(entry.betrag || 0);
    let sollVal = 0;
    let habenVal = 0;

    if (isSoll) {
      sollVal = amount;
      totalSoll += amount;
      runningBalance += isAssetOrExpense ? amount : -amount;
    } else {
      habenVal = amount;
      totalHaben += amount;
      runningBalance += isAssetOrExpense ? -amount : amount;
    }

    const gegenKonto = isSoll ? String(entry.konto_haben).trim() : String(entry.konto_soll).trim();
    const gegenKontoName = window.getAccountNameByCode ? window.getAccountNameByCode(gegenKonto) : '';

    return `
      <tr class="bh-account-row">
        <td class="font-monospace small text-muted">${entry.id}</td>
        <td>${window.isoToDisplay ? window.isoToDisplay(entry.datum) : entry.datum}</td>
        <td class="fw-bold text-dark small">${entry.beleg_nr || '–'}</td>
        <td class="small fw-semibold">${window.escapeHtml ? window.escapeHtml(entry.beschreibung) : entry.beschreibung}</td>
        <td>
          <span class="bh-konto-badge">${gegenKonto}</span>
          <span class="text-muted ms-1 small d-none d-sm-inline">${gegenKontoName}</span>
        </td>
        <td class="text-end fw-semibold text-primary">${sollVal > 0 ? window.fmtChf(sollVal) : '–'}</td>
        <td class="text-end fw-semibold text-success">${habenVal > 0 ? window.fmtChf(habenVal) : '–'}</td>
        <td class="text-end fw-bold text-dark">${window.fmtChf(runningBalance)}</td>
      </tr>
    `;
  }).join('');

  // Generate sorting list of all accounts for selector
  const kontoOptions = window._bhKontenrahmen
    .slice()
    .sort((a, b) => parseInt(a.konto) - parseInt(b.konto))
    .map(a => `<option value="${a.konto}" ${String(a.konto).trim() === selectedKonto ? 'selected' : ''}>${a.konto} - ${a.bezeichnung} (${window.bhGetAccountCategory(a).main})</option>`)
    .join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px);">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-file-invoice-dollar me-2"></i>Kontoauszug / Kontoblatt (${window._bhYear})</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <!-- Account selector -->
          <div class="row g-3 mb-4 align-items-end">
            <div class="col-md-6">
              <label class="form-label fw-bold small text-muted">Konto auswählen</label>
              <select class="form-select fw-bold border-2" id="bha-konto-select" onchange="bhOpenKontoauszugModal(this.value)">
                ${kontoOptions}
              </select>
            </div>
            <div class="col-md-6 text-md-end">
              <span class="badge bg-primary px-3 py-2 fs-7 rounded-pill">
                Klassifizierung: ${acc.klasse} - ${window.bhGetAccountCategory(acc).main}
              </span>
            </div>
          </div>

          <!-- KPI Header inside Modal -->
          <div class="row g-3 mb-4">
            <div class="col-sm-3">
              <div class="p-3 bg-white border border-light rounded-3 text-center shadow-sm">
                <div class="small text-muted fw-semibold" style="font-size: 11px;">Eröffnungssaldo</div>
                <h5 class="fw-bold mt-1 mb-0 text-dark">${window.fmtChf(opBalance)}</h5>
              </div>
            </div>
            <div class="col-sm-3">
              <div class="p-3 bg-white border border-light rounded-3 text-center shadow-sm">
                <div class="small text-muted fw-semibold text-primary" style="font-size: 11px;">Total Soll (+)</div>
                <h5 class="fw-bold mt-1 mb-0 text-primary">${window.fmtChf(totalSoll)}</h5>
              </div>
            </div>
            <div class="col-sm-3">
              <div class="p-3 bg-white border border-light rounded-3 text-center shadow-sm">
                <div class="small text-muted fw-semibold text-success" style="font-size: 11px;">Total Haben (-)</div>
                <h5 class="fw-bold mt-1 mb-0 text-success">${window.fmtChf(totalHaben)}</h5>
              </div>
            </div>
            <div class="col-sm-3">
              <div class="p-3 border rounded-3 text-center shadow-sm" style="background-color: rgba(15,58,93,0.02); border-color: var(--primary) !important;">
                <div class="small text-muted fw-semibold" style="font-size: 11px;">Endsaldo</div>
                <h5 class="fw-bold mt-1 mb-0 text-primary">${window.fmtChf(acc._endsaldo)}</h5>
              </div>
            </div>
          </div>

          <!-- Ledgers Table -->
          <div class="table-responsive animate__animated animate__fadeIn" style="max-height: 400px;">
            <table class="table table-hover align-middle bh-table mb-0">
              <thead>
                <tr>
                  <th style="width: 50px;">ID</th>
                  <th style="width: 100px;">Datum</th>
                  <th style="width: 120px;">Beleg-Nr</th>
                  <th>Beschreibung</th>
                  <th>Gegenkonto</th>
                  <th class="text-end" style="width: 120px;">Soll</th>
                  <th class="text-end" style="width: 120px;">Haben</th>
                  <th class="text-end" style="width: 140px;">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr class="table-light italic">
                  <td colspan="5" class="fw-bold text-muted small">Eröffnungsbilanz / Saldenvortrag</td>
                  <td class="text-end text-muted">–</td>
                  <td class="text-end text-muted">–</td>
                  <td class="text-end fw-bold text-muted">${window.fmtChf(opBalance)}</td>
                </tr>
                ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="8" class="text-center text-muted py-4">Keine Buchungen auf diesem Konto im Jahr ' + window._bhYear + ' vorhanden.</td></tr>'}
                <tr class="bh-main-total-row">
                  <td colspan="5">KUMULIERT / JAHRESSUMME</td>
                  <td class="text-end text-primary">${window.fmtChf(totalSoll)}</td>
                  <td class="text-end text-success">${window.fmtChf(totalHaben)}</td>
                  <td class="text-end text-primary">${window.fmtChf(acc._endsaldo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer bg-light border-0 py-2.5 rounded-bottom-4">
          <button type="button" class="btn btn-secondary btn-sm fw-bold px-3 shadow-sm" data-bs-dismiss="modal">Schliessen</button>
        </div>
      </div>
    </div>
  `;

  const bootstrapModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  bootstrapModal.show();
};

