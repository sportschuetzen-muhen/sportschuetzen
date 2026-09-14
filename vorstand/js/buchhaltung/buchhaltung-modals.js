// =====================================================================
// MODUL: BUCHHALTUNG & KMU-FINANZBERICHTE - MODALS & ACTIONS
// =====================================================================

// KONTENRAHMEN-EDITOR: MODAL ERSTELLEN ODER BEARBEITEN
window.bhOpenKontoModal = function(kontoCode, rowIndex = null) {
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

  let acc = null;
  if (rowIndex !== null && rowIndex !== undefined) {
    acc = (window._bhKontenrahmen || []).find(a => Number(a._rowIndex) === Number(rowIndex));
  }
  if (!acc && kontoCode) {
    acc = (window._bhKontenrahmen || []).find(a => String(a.konto).trim() === String(kontoCode).trim());
  }

  if (acc) {
    const code = String(acc.konto).trim();
    const prevYearJournal = (window._bhJournal || []).filter(j => Number(j.jahr) === prevYear);
    let balanceChange = 0;
    const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: '' };
    const isAssetOrExpense = (cat.main === 'Aktiven' || cat.main === 'Aufwand');
    
    prevYearJournal.forEach(entry => {
      const soll = String(entry.konto_soll).trim();
      const haben = String(entry.konto_haben).trim();
      const amount = Number(entry.betrag || 0);
      
      if (soll === code) {
        balanceChange += isAssetOrExpense ? amount : -amount;
      }
      if (haben === code) {
        balanceChange += isAssetOrExpense ? -amount : amount;
      }
    });
    prevYearActual = Number(acc.eroeffnungssaldo || 0) + balanceChange;

    const prevBud = (window._bhBudget || []).find(b => String(b.konto).trim() === code);
    prevYearBudget = prevBud ? Number(prevBud['budget_' + prevYear] || 0) : 0;

    const bud = (window._bhBudget || []).find(b => String(b.konto).trim() === code);
    budgetVal = bud ? Number(bud['budget_' + window._bhYear] || 0) : 0;

    if (budgetVal === 0) {
      budgetVal = prevYearActual !== 0 ? prevYearActual : prevYearBudget;
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
            <input type="hidden" id="bhk-orig-konto" value="">
            <input type="hidden" id="bhk-row-index" value="">
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted d-flex justify-content-between align-items-center">
                <span>Kontonummer (4-stellig)</span>
                <span class="badge bg-light text-secondary border fw-normal" id="bhk-konto-badge">KMU-Nummer</span>
              </label>
              <input type="text" class="form-control fw-bold" id="bhk-konto" required placeholder="z.B. 1000" pattern="^[0-9]{4}$" title="Bitte eine 4-stellige Nummer eingeben.">
              <div class="form-text text-muted small">Eindeutiger 4-stelliger Nummernschlüssel nach Schweizer KMU.</div>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Bezeichnung</label>
              <input type="text" class="form-control" id="bhk-bezeichnung" required placeholder="z.B. PostFinance">
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Klassifizierung (Klasse)</label>
              <select class="form-select" id="bhk-klasse" required>
                <option value="Aktiven">1 - Aktiven (Vermögenswerte)</option>
                <option value="Passiven">2 - Passiven (Fremd- & Eigenkapital)</option>
                <option value="Ertrag">3 - Ertrag (Erlöse / Einnahmen)</option>
                <option value="Aufwand">4-8 - Aufwand (Betrieblich / Personal / Sonstiges)</option>
                <option value="Abschluss">9 - Abschluss (Erfolgsrechnung / Bilanz)</option>
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
  const origKontoEl = document.getElementById('bhk-orig-konto');
  const rowIndexEl = document.getElementById('bhk-row-index');
  const kontoEl = document.getElementById('bhk-konto');
  const bezeichnungEl = document.getElementById('bhk-bezeichnung');
  const klasseEl = document.getElementById('bhk-klasse');
  const saldoEl = document.getElementById('bhk-eroeffnungssaldo');
  const kontoBadge = document.getElementById('bhk-konto-badge');
  
  if (acc) {
    titleEl.textContent = 'Sachkonto bearbeiten';
    modeEl.value = 'edit';
    origKontoEl.value = acc.konto || '';
    rowIndexEl.value = acc._rowIndex || '';
    kontoEl.value = acc.konto || '';
    if (kontoBadge) kontoBadge.textContent = 'Zeile ' + (acc._rowIndex || 'Vorhanden');
    
    bezeichnungEl.value = acc.bezeichnung || '';
    
    const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: 'Aktiven' };
    klasseEl.value = cat.main || 'Aktiven';
    
    saldoEl.value = Number(acc.eroeffnungssaldo || 0).toFixed(2);
  } else {
    titleEl.textContent = 'Neues Sachkonto anlegen';
    modeEl.value = 'new';
    origKontoEl.value = '';
    rowIndexEl.value = '';
    kontoEl.value = '';
    if (kontoBadge) kontoBadge.textContent = 'Neu';
    bezeichnungEl.value = '';
    klasseEl.value = 'Aktiven';
    saldoEl.value = '0.00';
  }
  
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
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
    orig_konto: document.getElementById('bhk-orig-konto') ? document.getElementById('bhk-orig-konto').value.trim() : '',
    _rowIndex: document.getElementById('bhk-row-index') ? document.getElementById('bhk-row-index').value.trim() : '',
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
        orig_konto: payload.orig_konto,
        bezeichnung: payload.bezeichnung,
        jahr: window._bhYear,
        betrag: budgetVal
      };
      
      try {
        await apiFetch('buchhaltung', budgetPayload, 'POST');
      } catch (bErr) {
        console.warn("⚠️ Budget konnte nicht synchronisiert werden:", bErr);
      }
      
      if (typeof showSuccess === 'function') {
        showSuccess(`🎉 Sachkonto ${payload.konto} (${payload.bezeichnung}) und Budget erfolgreich gespeichert!`);
      } else {
        alert(`🎉 Sachkonto ${payload.konto} (${payload.bezeichnung}) erfolgreich gespeichert!`);
      }
      
      const modalEl = document.getElementById('bhModalKonto');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
      // Backdrops aufräumen
      document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('padding-right');
      document.body.style.removeProperty('overflow');
      
      await loadBuchhaltungData(true, true);
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

// Automatische Belegnummern-Generierung nach Konto (Kasse_2026-001, B_Zahl_2026-xxx, etc.)
window.bhGetNextJournalBelegNr = function(year, prefix = 'Kasse_') {
  const y = Number(year || window._bhYear || new Date().getFullYear());
  const cleanPrefix = String(prefix || 'BEL-').replace(/[-_]$/, '');
  const regex = new RegExp(`^${cleanPrefix}[-_]${y}[-_](\\d+)`, 'i');
  let maxSeq = 0;
  (window._bhJournal || []).forEach(j => {
    if (Number(j.jahr) === y && j.beleg_nr) {
      const m = String(j.beleg_nr).match(regex);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
  });
  const delimiter = (cleanPrefix.startsWith('B_') || cleanPrefix === 'Kasse') ? '_' : '-';
  return `${cleanPrefix}${delimiter}${y}-${String(maxSeq + 1).padStart(3, '0')}`;
};

window.bhDetermineAutoBelegPrefix = function(soll, haben, typ) {
  const s = String(soll || '').trim();
  const h = String(haben || '').trim();
  const t = String(typ || '').trim();

  // Prio 1: Bankkonten (Zahlungskonto 1020, Wirtschaft 1021, Anteilschein/Geno 1022)
  // Bei Geldtransfer Kasse <-> Bank hat die Bank Prio, da der Bankauszug der externe Hauptbeleg ist
  if (s === '1020' || h === '1020') return 'B_Zahl_';
  if (s === '1021' || h === '1021') return 'B_Wirt_';
  if (s === '1022' || h === '1022') return 'B_Geno_';

  // Prio 2: Kasse (Konto 1000 oder Aktionstyp Kassa)
  if (s === '1000' || h === '1000' || t === 'Kassa') return 'Kasse_';

  // Prio 3: Allgemeine manuelle Belege (z.B. Umbuchungen, Abschreibungen)
  return 'BEL-';
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
  
  const sollOptions = (window._bhKontenrahmen || []).map(acc => {
    const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: acc.klasse || '' };
    return `<option value="${acc.konto}">${acc.konto} - ${acc.bezeichnung} (${cat.main})</option>`;
  }).join('');
  
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
                <input type="text" class="form-control fw-bold" id="bhe-beleg" required placeholder="z.B. Kasse_2026-001">
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
    
    belegEl.dataset.userEdited = 'false';
    belegEl.oninput = () => {
      belegEl.dataset.userEdited = 'true';
    };

    const updateAutoBeleg = () => {
      if (idEl.value) return;
      if (belegEl.dataset.userEdited === 'true') return;
      const pfx = window.bhDetermineAutoBelegPrefix(sollEl.value, habenEl.value, typEl.value);
      const y = Number(window._bhYear || new Date().getFullYear());
      belegEl.value = window.bhGetNextJournalBelegNr(y, pfx);
    };

    sollEl.onchange = updateAutoBeleg;
    habenEl.onchange = updateAutoBeleg;
    typEl.onchange = updateAutoBeleg;

    updateAutoBeleg();
  }
  
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
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
        await loadBuchhaltungData(true, true);
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
        await loadBuchhaltungData(true, true);
      }, 1500);
    } else {
      throw new Error(result.error || "Unerwarteter Fehler beim Löschen.");
    }
  } catch (err) {
    alert("❌ Fehler beim Löschen der Buchung: " + err.message);
  }
};

// POPUP-MODAL: KONTOAUSZUG / DETAILS FÜR EIN EINZELNES KONTO ANZEIGEN
window._bhKontoauszugSortCol = window._bhKontoauszugSortCol || 'datum';
window._bhKontoauszugSortAsc = window._bhKontoauszugSortAsc !== undefined ? window._bhKontoauszugSortAsc : true;
window._bhKontoauszugIsFullscreen = window._bhKontoauszugIsFullscreen || false;

window.bhSortKontoauszug = function(col) {
  if (window._bhKontoauszugSortCol === col) {
    window._bhKontoauszugSortAsc = !window._bhKontoauszugSortAsc;
  } else {
    window._bhKontoauszugSortCol = col;
    window._bhKontoauszugSortAsc = true;
  }
  const selectEl = document.getElementById('bha-konto-select');
  const konto = selectEl ? selectEl.value : null;
  bhOpenKontoauszugModal(konto);
};

window.bhToggleKontoauszugFullscreen = function() {
  window._bhKontoauszugIsFullscreen = !window._bhKontoauszugIsFullscreen;
  const dialog = document.getElementById('bhModalKontoauszugDialog');
  const icon = document.getElementById('bhKontoauszugFsIcon');
  const tableWrap = document.getElementById('bhKontoauszugTableWrap');
  if (!dialog) return;

  if (window._bhKontoauszugIsFullscreen) {
    dialog.classList.add('modal-fullscreen');
    dialog.classList.remove('modal-xl');
    if (icon) icon.className = 'fas fa-compress';
    if (tableWrap) tableWrap.style.maxHeight = 'calc(100vh - 330px)';
  } else {
    dialog.classList.remove('modal-fullscreen');
    dialog.classList.add('modal-xl');
    if (icon) icon.className = 'fas fa-expand';
    if (tableWrap) tableWrap.style.maxHeight = '480px';
  }
};

window.bhNavigateKontoauszug = function(delta) {
  const selectEl = document.getElementById('bha-konto-select');
  if (!selectEl) return;
  const newIndex = selectEl.selectedIndex + delta;
  if (newIndex >= 0 && newIndex < selectEl.options.length) {
    selectEl.selectedIndex = newIndex;
    bhOpenKontoauszugModal(selectEl.value);
  }
};

window.bhFilterKontoauszug = function(val) {
  const query = (val || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#bhKontoauszugTableBody tr.bh-account-row');
  let count = 0;
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    const match = !query || text.includes(query);
    r.style.display = match ? '' : 'none';
    if (match) count++;
  });
  const badge = document.getElementById('bhKontoauszugCountBadge');
  if (badge) {
    badge.textContent = query ? `${count} von ${rows.length} Buchungen` : `${rows.length} Buchungen`;
  }
};

window.bhExportKontoauszugCsv = function(kontoCode) {
  const acc = (window._bhKontenrahmen || []).find(a => String(a.konto).trim() === String(kontoCode).trim());
  if (!acc) return;
  const selectedKonto = String(acc.konto).trim();
  const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: '' };
  const isAssetOrExpense = (cat.main === 'Aktiven' || cat.main === 'Aufwand');
  const opBalance = Number(acc._dynamicEroeffnungssaldo || 0);

  const entries = (window._bhJournal || []).filter(j => 
    Number(j.jahr) === Number(window._bhYear) && 
    (String(j.konto_soll).trim() === selectedKonto || String(j.konto_haben).trim() === selectedKonto)
  );

  function parseDateMs(dtStr) {
    if (!dtStr) return 0;
    const s = String(dtStr).trim();
    if (s.includes('.')) {
      const p = s.split('.');
      if (p.length === 3) return new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`).getTime() || 0;
    }
    return new Date(s).getTime() || 0;
  }

  entries.sort((a, b) => {
    const timeA = parseDateMs(a.datum);
    const timeB = parseDateMs(b.datum);
    if (timeA !== timeB) return timeA - timeB;
    return Number(a.id || 0) - Number(b.id || 0);
  });

  let running = opBalance;
  let csv = `Konto: ${acc.konto} - ${acc.bezeichnung} (${cat.main}) - Jahr: ${window._bhYear}\n`;
  csv += `Eröffnungssaldo: ${opBalance.toFixed(2)}\n\n`;
  csv += `ID;Datum;Beleg-Nr;Beschreibung;Gegenkonto;Gegenkonto-Name;Soll;Haben;Saldo\n`;
  csv += `0;01.01.${window._bhYear};-;Eröffnungsbilanz / Saldenvortrag;-;-;-;-;${opBalance.toFixed(2)}\n`;

  entries.forEach(e => {
    const isSoll = String(e.konto_soll).trim() === selectedKonto;
    const amount = Number(e.betrag || 0);
    const sollVal = isSoll ? amount : 0;
    const habenVal = isSoll ? 0 : amount;
    running += isAssetOrExpense ? (isSoll ? amount : -amount) : (isSoll ? -amount : amount);
    const gegen = isSoll ? String(e.konto_haben).trim() : String(e.konto_soll).trim();
    const gegenName = window.getAccountNameByCode ? window.getAccountNameByCode(gegen) : '';
    const descClean = String(e.beschreibung || '').replace(/;/g, ',');

    csv += `${e.id || ''};${e.datum || ''};${e.beleg_nr || ''};"${descClean}";${gegen};"${gegenName}";${sollVal > 0 ? sollVal.toFixed(2) : ''};${habenVal > 0 ? habenVal.toFixed(2) : ''};${running.toFixed(2)}\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Kontoblatt_${acc.konto}_${window._bhYear}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

window.bhPrintKontoauszug = function() {
  window.print();
};

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
  let acc = (window._bhKontenrahmen || []).find(a => String(a.konto).trim() === selectedKonto);
  if (!acc && (window._bhKontenrahmen || []).length > 0) {
    acc = window._bhKontenrahmen[0];
    selectedKonto = String(acc.konto).trim();
  }

  if (!acc) {
    alert("Keine Sachkonten vorhanden!");
    return;
  }

  const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: '' };
  const isAssetOrExpense = (cat.main === 'Aktiven' || cat.main === 'Aufwand');
  const opBalance = Number(acc._dynamicEroeffnungssaldo || 0);

  // Filter journal entries for the current account and year
  const accountEntries = (window._bhJournal || []).filter(j => 
    Number(j.jahr) === Number(window._bhYear) && 
    (String(j.konto_soll).trim() === selectedKonto || String(j.konto_haben).trim() === selectedKonto)
  );

  function parseDateMs(dtStr) {
    if (!dtStr) return 0;
    const s = String(dtStr).trim();
    if (s.includes('.')) {
      const p = s.split('.');
      if (p.length === 3) return new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`).getTime() || 0;
    }
    return new Date(s).getTime() || 0;
  }

  // 1. Zuerst chronologisch sortieren, um Salden & Totale exakt aufzubauen
  accountEntries.sort((a, b) => {
    const timeA = parseDateMs(a.datum);
    const timeB = parseDateMs(b.datum);
    if (timeA !== timeB) return timeA - timeB;
    return Number(a.id || 0) - Number(b.id || 0);
  });

  let runningBalance = opBalance;
  let totalSoll = 0;
  let totalHaben = 0;

  const computedEntries = accountEntries.map(entry => {
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

    return {
      ...entry,
      isSoll,
      amount,
      sollVal,
      habenVal,
      runningBalance,
      gegenKonto,
      gegenKontoName
    };
  });

  // 2. Jetzt nach Benutzer-Sortierung anordnen
  const sortCol = window._bhKontoauszugSortCol || 'datum';
  const asc = window._bhKontoauszugSortAsc !== undefined ? window._bhKontoauszugSortAsc : true;

  computedEntries.sort((a, b) => {
    let res = 0;
    if (sortCol === 'id') {
      res = Number(a.id || 0) - Number(b.id || 0);
    } else if (sortCol === 'datum') {
      res = parseDateMs(a.datum) - parseDateMs(b.datum);
      if (res === 0) res = Number(a.id || 0) - Number(b.id || 0);
    } else if (sortCol === 'beleg') {
      res = (a.beleg_nr || '').localeCompare(b.beleg_nr || '', 'de');
    } else if (sortCol === 'beschreibung') {
      res = (a.beschreibung || '').localeCompare(b.beschreibung || '', 'de');
    } else if (sortCol === 'gegenkonto') {
      res = (a.gegenKonto || '').localeCompare(b.gegenKonto || '', 'de');
    } else if (sortCol === 'soll') {
      res = (a.sollVal || 0) - (b.sollVal || 0);
    } else if (sortCol === 'haben') {
      res = (a.habenVal || 0) - (b.habenVal || 0);
    } else if (sortCol === 'saldo') {
      res = (a.runningBalance || 0) - (b.runningBalance || 0);
    }
    return asc ? res : -res;
  });

  function sortIndicator(col) {
    if (sortCol === col) {
      return asc 
        ? '<i class="fas fa-sort-up ms-1 text-primary"></i>'
        : '<i class="fas fa-sort-down ms-1 text-primary"></i>';
    }
    return '<i class="fas fa-sort ms-1 text-muted opacity-50"></i>';
  }

  const rowsHtml = computedEntries.map(entry => {
    return `
      <tr class="bh-account-row" onclick="this.classList.toggle('bh-row-selected')" title="Klicken zum dauerhaften Hervorheben dieser Zeile">
        <td class="font-monospace small text-muted">${entry.id}</td>
        <td><span class="fw-semibold">${window.isoToDisplay ? window.isoToDisplay(entry.datum) : entry.datum}</span></td>
        <td><span class="badge bg-light text-dark border font-monospace" style="font-size:11px;" title="Klicken zum Kopieren" onclick="event.stopPropagation(); navigator.clipboard.writeText('${entry.beleg_nr || ''}'); window.showToast ? window.showToast('Beleg-Nr kopiert: ${entry.beleg_nr || ''}', 'info') : null;">${entry.beleg_nr || '–'}</span></td>
        <td class="small fw-semibold text-dark">${window.escapeHtml ? window.escapeHtml(entry.beschreibung) : entry.beschreibung}</td>
        <td>
          <span class="bh-konto-badge">${entry.gegenKonto}</span>
          <span class="text-muted ms-1 small d-none d-md-inline">${entry.gegenKontoName || ''}</span>
        </td>
        <td class="text-end fw-semibold text-primary">${entry.sollVal > 0 ? window.fmtChf(entry.sollVal) : '–'}</td>
        <td class="text-end fw-semibold text-success">${entry.habenVal > 0 ? window.fmtChf(entry.habenVal) : '–'}</td>
        <td class="text-end fw-bold text-dark">${window.fmtChf(entry.runningBalance)}</td>
      </tr>
    `;
  }).join('');

  // Generate sorting list of all accounts for selector
  const kontoOptions = window._bhKontenrahmen
    .slice()
    .sort((a, b) => parseInt(a.konto) - parseInt(b.konto))
    .map(a => `<option value="${a.konto}" ${String(a.konto).trim() === selectedKonto ? 'selected' : ''}>${a.konto} - ${a.bezeichnung} (${window.bhGetAccountCategory(a).main})</option>`)
    .join('');

  const isFs = window._bhKontoauszugIsFullscreen;
  const dialogSizeClass = isFs ? 'modal-fullscreen' : 'modal-xl';

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ${dialogSizeClass}" id="bhModalKontoauszugDialog">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px);">
        <div class="modal-header bg-primary text-white border-0 py-2.5 rounded-top-4 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <h5 class="modal-title fw-bold mb-0"><i class="fas fa-file-invoice-dollar me-2"></i>Kontoauszug / Kontoblatt (${window._bhYear})</h5>
            <span class="badge bg-white text-primary fw-bold" id="bhKontoauszugCountBadge">${computedEntries.length} Buchungen</span>
          </div>
          <div class="d-flex align-items-center gap-1">
            <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5" onclick="bhToggleKontoauszugFullscreen()" title="Vollbild umschalten (Vergrössern / Verkleinern)">
              <i class="fas ${isFs ? 'fa-compress' : 'fa-expand'}" id="bhKontoauszugFsIcon"></i>
            </button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body p-4">
          <!-- Account selector & Live-Filter -->
          <div class="row g-3 mb-3 align-items-end">
            <div class="col-lg-6">
              <label class="form-label fw-bold small text-muted mb-1">Konto auswählen & blättern</label>
              <div class="input-group">
                <button class="btn btn-outline-secondary border-2" type="button" onclick="bhNavigateKontoauszug(-1)" title="Vorheriges Konto">
                  <i class="fas fa-chevron-left"></i>
                </button>
                <select class="form-select fw-bold border-2" id="bha-konto-select" onchange="bhOpenKontoauszugModal(this.value)">
                  ${kontoOptions}
                </select>
                <button class="btn btn-outline-secondary border-2" type="button" onclick="bhNavigateKontoauszug(1)" title="Nächstes Konto">
                  <i class="fas fa-chevron-right"></i>
                </button>
              </div>
            </div>
            <div class="col-lg-4">
              <label class="form-label fw-bold small text-muted mb-1">Live-Filter / Schnellsuche</label>
              <div class="input-group">
                <span class="input-group-text bg-white border-2"><i class="fas fa-search text-muted"></i></span>
                <input type="text" id="bhKontoauszugSearch" class="form-control border-2" placeholder="Text, Beleg, Betrag filtern..." oninput="bhFilterKontoauszug(this.value)" autocomplete="off">
              </div>
            </div>
            <div class="col-lg-2 text-lg-end">
              <span class="badge bg-primary px-3 py-2 fs-7 rounded-pill text-wrap">
                ${acc.klasse} - ${window.bhGetAccountCategory(acc).main}
              </span>
            </div>
          </div>

          <!-- KPI Header inside Modal -->
          <div class="row g-3 mb-3">
            <div class="col-sm-3">
              <div class="p-2.5 bg-white border border-light rounded-3 text-center shadow-sm">
                <div class="small text-muted fw-semibold" style="font-size: 11px;">Eröffnungssaldo</div>
                <h5 class="fw-bold mt-1 mb-0 text-dark">${window.fmtChf(opBalance)}</h5>
              </div>
            </div>
            <div class="col-sm-3">
              <div class="p-2.5 bg-white border border-light rounded-3 text-center shadow-sm">
                <div class="small text-muted fw-semibold text-primary" style="font-size: 11px;">Total Soll (+)</div>
                <h5 class="fw-bold mt-1 mb-0 text-primary">${window.fmtChf(totalSoll)}</h5>
              </div>
            </div>
            <div class="col-sm-3">
              <div class="p-2.5 bg-white border border-light rounded-3 text-center shadow-sm">
                <div class="small text-muted fw-semibold text-success" style="font-size: 11px;">Total Haben (-)</div>
                <h5 class="fw-bold mt-1 mb-0 text-success">${window.fmtChf(totalHaben)}</h5>
              </div>
            </div>
            <div class="col-sm-3">
              <div class="p-2.5 border rounded-3 text-center shadow-sm" style="background-color: rgba(15,58,93,0.02); border-color: var(--primary) !important;">
                <div class="small text-muted fw-semibold" style="font-size: 11px;">Endsaldo</div>
                <h5 class="fw-bold mt-1 mb-0 text-primary">${window.fmtChf(acc._endsaldo)}</h5>
              </div>
            </div>
          </div>

          <!-- Ledgers Table -->
          <div class="table-responsive animate__animated animate__fadeIn border rounded-3 shadow-sm bg-white" id="bhKontoauszugTableWrap" style="max-height: ${isFs ? 'calc(100vh - 330px)' : '480px'}; overflow-y: auto;">
            <table class="table table-hover align-middle bh-table mb-0">
              <thead class="table-light sticky-top" style="z-index: 2;">
                <tr>
                  <th style="width: 65px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('id')" title="Klicken zum Sortieren nach ID">
                    ID ${sortIndicator('id')}
                  </th>
                  <th style="width: 115px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('datum')" title="Klicken zum Sortieren nach Datum">
                    Datum ${sortIndicator('datum')}
                  </th>
                  <th style="width: 130px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('beleg')" title="Klicken zum Sortieren nach Beleg-Nr">
                    Beleg-Nr ${sortIndicator('beleg')}
                  </th>
                  <th style="cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('beschreibung')" title="Klicken zum Sortieren nach Beschreibung">
                    Beschreibung ${sortIndicator('beschreibung')}
                  </th>
                  <th style="width: 220px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('gegenkonto')" title="Klicken zum Sortieren nach Gegenkonto">
                    Gegenkonto ${sortIndicator('gegenkonto')}
                  </th>
                  <th class="text-end" style="width: 120px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('soll')" title="Klicken zum Sortieren nach Soll">
                    Soll ${sortIndicator('soll')}
                  </th>
                  <th class="text-end" style="width: 120px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('haben')" title="Klicken zum Sortieren nach Haben">
                    Haben ${sortIndicator('haben')}
                  </th>
                  <th class="text-end" style="width: 140px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('saldo')" title="Klicken zum Sortieren nach Saldo">
                    Saldo ${sortIndicator('saldo')}
                  </th>
                </tr>
              </thead>
              <tbody id="bhKontoauszugTableBody">
                <tr class="table-light italic">
                  <td colspan="5" class="fw-bold text-muted small">Eröffnungsbilanz / Saldenvortrag</td>
                  <td class="text-end text-muted">–</td>
                  <td class="text-end text-muted">–</td>
                  <td class="text-end fw-bold text-muted">${window.fmtChf(opBalance)}</td>
                </tr>
                ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="8" class="text-center text-muted py-4">Keine Buchungen auf diesem Konto im Jahr ' + window._bhYear + ' vorhanden.</td></tr>'}
                <tr class="bh-main-total-row sticky-bottom bg-white" style="border-top: 2px solid #dee2e6;">
                  <td colspan="5" class="fw-bold">KUMULIERT / JAHRESSUMME</td>
                  <td class="text-end fw-bold text-primary">${window.fmtChf(totalSoll)}</td>
                  <td class="text-end fw-bold text-success">${window.fmtChf(totalHaben)}</td>
                  <td class="text-end fw-bold text-primary">${window.fmtChf(acc._endsaldo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer bg-light border-0 py-2.5 rounded-bottom-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="small text-muted">
            <i class="fas fa-info-circle text-primary me-1"></i>
            <strong>Tipp:</strong> Klicke auf eine Zeile zum <strong>dauerhaften Markieren</strong>. Spaltentitel zum <strong>Sortieren</strong>.
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-outline-success btn-sm fw-bold px-3 shadow-sm" onclick="bhExportKontoauszugCsv('${selectedKonto}')" title="Als CSV für Excel exportieren">
              <i class="fas fa-file-csv me-1"></i>CSV Export
            </button>
            <button type="button" class="btn btn-outline-primary btn-sm fw-bold px-3 shadow-sm" onclick="bhPrintKontoauszug()" title="Kontoblatt drucken / als PDF speichern">
              <i class="fas fa-print me-1"></i>Drucken
            </button>
            <button type="button" class="btn btn-secondary btn-sm fw-bold px-3 shadow-sm" data-bs-dismiss="modal">Schliessen</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const bootstrapModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  bootstrapModal.show();
};

// POPUP-MODAL: MASSEN-BUDGETIERUNG & BUDGET-MATRIX EDITOR
window.bhOpenBudgetMatrixModal = function() {
  let modalEl = document.getElementById('bhModalBudgetMatrix');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalBudgetMatrix';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  const prevYear = Number(window._bhYear) - 1;
  const currentYear = Number(window._bhYear);

  // Filter accounts for Erfolgsrechnung (Ertrag & Aufwand) and sort by konto
  const successAccounts = window._bhKontenrahmen
    .slice()
    .filter(acc => {
      const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: '' };
      return cat.main === 'Ertrag' || cat.main === 'Aufwand';
    })
    .sort((a, b) => parseInt(a.konto) - parseInt(b.konto));

  // Compute prior year actuals & budgets
  const priorJournal = window._bhJournal.filter(j => Number(j.jahr) === prevYear);

  const rowsHtml = successAccounts.map(acc => {
    const kCode = String(acc.konto).trim();
    const cat = window.bhGetAccountCategory(acc);

    // Calculate prev year actual
    let balanceChange = 0;
    const isAssetOrExpense = (cat.main === 'Aufwand');
    
    priorJournal.forEach(entry => {
      const soll = String(entry.konto_soll).trim();
      const haben = String(entry.konto_haben).trim();
      const amount = Number(entry.betrag || 0);
      if (soll === kCode) balanceChange += isAssetOrExpense ? amount : -amount;
      if (haben === kCode) balanceChange += isAssetOrExpense ? -amount : amount;
    });

    const prevActual = Math.round(Number(acc.eroeffnungssaldo || 0) + balanceChange);

    // Prev year budget
    const prevBudObj = window._bhBudget.find(b => String(b.konto).trim() === kCode);
    const prevBudget = prevBudObj ? Math.round(Number(prevBudObj['budget_' + prevYear] || 0)) : 0;

    // Current year budget
    const currBudObj = window._bhBudget.find(b => String(b.konto).trim() === kCode);
    const currentBudget = currBudObj ? Math.round(Number(currBudObj['budget_' + currentYear] || 0)) : 0;

    const badgeClass = cat.main === 'Ertrag' ? 'bg-success' : 'bg-danger';

    return `
      <tr class="bh-account-row align-middle" data-konto="${kCode}" data-prev-actual="${prevActual}" data-prev-budget="${prevBudget}">
        <td class="font-monospace fw-bold text-primary" style="width: 80px;">${acc.konto}</td>
        <td>
          <div class="fw-bold text-dark">${window.escapeHtml ? window.escapeHtml(acc.bezeichnung) : acc.bezeichnung}</div>
          <span class="badge ${badgeClass} opacity-75" style="font-size:10px;">${cat.main}</span>
        </td>
        <td class="text-end fw-semibold text-muted font-monospace">${window.fmtChf(prevActual)}</td>
        <td class="text-end fw-semibold text-secondary font-monospace">${prevBudget > 0 ? window.fmtChf(prevBudget) : '–'}</td>
        <td style="width: 200px;">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light font-monospace" style="font-size: 11px;">CHF</span>
            <input type="number" step="1" class="form-control form-control-sm fw-bold text-end bhm-budget-input" id="bhm-budget-${kCode}" value="${currentBudget}" data-konto="${kCode}">
          </div>
        </td>
      </tr>
    `;
  }).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%);">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <div class="d-flex align-items-center justify-content-between w-100 me-3">
            <h5 class="modal-title fw-bold mb-0">
              <i class="fas fa-calculator me-2"></i>Massen-Budgetierung & Schnell-Editor (${currentYear})
            </h5>
            <span class="badge bg-white text-primary fw-bold px-3 py-1.5 rounded-pill fs-7">
              ${successAccounts.length} Erfolgsrechnungskonten
            </span>
          </div>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        
        <div class="modal-body p-4">
          <!-- Toolbar with Quick Copy buttons -->
          <div class="p-3 bg-light rounded-3 border mb-4 d-flex justify-content-between align-items-center flex-wrap" style="gap: 10px;">
            <div class="d-flex align-items-center" style="gap: 10px;">
              <i class="fas fa-magic text-primary"></i>
              <span class="small fw-semibold text-dark">Schnell-Übernahme von Vorjahreswerten (${prevYear}):</span>
            </div>
            <div class="d-flex" style="gap: 8px;">
              <button class="btn btn-sm btn-outline-primary fw-bold shadow-sm" onclick="bhCopyBudgetFromPrevActual()">
                <i class="fas fa-copy me-1"></i> Vorjahres-Ist (${prevYear}) kopieren
              </button>
              <button class="btn btn-sm btn-outline-secondary fw-bold shadow-sm" onclick="bhCopyBudgetFromPrevBudget()">
                <i class="fas fa-history me-1"></i> Vorjahres-Budget (${prevYear}) kopieren
              </button>
            </div>
          </div>

          <!-- Table matrix -->
          <div class="table-responsive" style="max-height: 480px;">
            <table class="table table-hover align-middle bh-table mb-0">
              <thead>
                <tr>
                  <th style="width: 80px;">Konto</th>
                  <th>Bezeichnung / Klasse</th>
                  <th class="text-end" style="width: 150px;">Vorjahres-Ist (${prevYear})</th>
                  <th class="text-end" style="width: 150px;">Vorjahres-Budget (${prevYear})</th>
                  <th class="text-end" style="width: 200px;">Budget (${currentYear})</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="5" class="text-center text-muted py-4">Keine Erfolgsrechnungskonten gefunden.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer bg-light border-0 py-3 rounded-bottom-4 justify-content-between">
          <button type="button" class="btn btn-secondary btn-sm fw-bold px-3 shadow-sm" data-bs-dismiss="modal">Abbrechen</button>
          <button type="button" class="btn btn-success fw-bold px-4 py-2 shadow-sm" id="bhm-save-btn" onclick="bhSaveAllBudgets()">
            <i class="fas fa-save me-1.5"></i> Gesamtes Budget ${currentYear} speichern
          </button>
        </div>
      </div>
    </div>
  `;

  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
};

// Übernimmt Vorjahres-Ist für alle Eingabefelder
window.bhCopyBudgetFromPrevActual = function() {
  const rows = document.querySelectorAll('#bhModalBudgetMatrix tbody tr');
  rows.forEach(tr => {
    const prevAct = tr.getAttribute('data-prev-actual') || 0;
    const input = tr.querySelector('.bhm-budget-input');
    if (input) input.value = prevAct;
  });
  if (typeof showToast === 'function') showToast("📋 Vorjahres-Ist in alle Budgetfelder übernommen!", "info");
};

// Übernimmt Vorjahres-Budget für alle Eingabefelder
window.bhCopyBudgetFromPrevBudget = function() {
  const rows = document.querySelectorAll('#bhModalBudgetMatrix tbody tr');
  rows.forEach(tr => {
    const prevBud = tr.getAttribute('data-prev-budget') || 0;
    const input = tr.querySelector('.bhm-budget-input');
    if (input) input.value = prevBud;
  });
  if (typeof showToast === 'function') showToast("📋 Vorjahres-Budget in alle Budgetfelder übernommen!", "info");
};

// Speichert alle Budgetwerte im Backend
window.bhSaveAllBudgets = async function() {
  const saveBtn = document.getElementById('bhm-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere Budget...';
  }

  const inputs = document.querySelectorAll('.bhm-budget-input');
  const currentYear = window._bhYear;
  let successCount = 0;

  try {
    const savePromises = Array.from(inputs).map(inp => {
      const kCode = inp.getAttribute('data-konto');
      const val = Number(inp.value || 0);
      const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(kCode).trim());
      
      const payload = {
        action: 'saveBudget',
        konto: kCode,
        bezeichnung: acc ? acc.bezeichnung : '',
        jahr: currentYear,
        betrag: val
      };
      
      return apiFetch('buchhaltung', payload, 'POST')
        .then(r => r.json())
        .then(res => { if (res.success) successCount++; });
    });

    await Promise.all(savePromises);

    if (typeof showToast === 'function') {
      showToast(`🎉 Budget ${currentYear} für ${successCount} Konten erfolgreich gespeichert!`, 'success');
    } else {
      alert(`🎉 Budget ${currentYear} für ${successCount} Konten erfolgreich gespeichert!`);
    }

    const modalEl = document.getElementById('bhModalBudgetMatrix');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    await loadBuchhaltungData(true, true);
  } catch (err) {
    alert("❌ Fehler beim Speichern des Budgets: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fas fa-save me-1.5"></i> Gesamtes Budget ${currentYear} speichern`;
    }
  }
};

