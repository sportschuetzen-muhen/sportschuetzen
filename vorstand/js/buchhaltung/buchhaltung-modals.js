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
  
  const isEdit = Boolean(entryId);

  modalEl.innerHTML = `
    <div class="modal-dialog ${isEdit ? 'modal-dialog-centered' : 'modal-lg modal-dialog-centered'}">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px);">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold" id="bhe-modal-title">
            <i class="fas fa-receipt me-2"></i>${isEdit ? `Buchungssatz bearbeiten (ID: ${entryId})` : 'Journalbuchung erfassen'}
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          ${!isEdit ? `
            <!-- Tab-Auswahl: Einzelbuchung vs. Kassen-Sammelbeleg -->
            <ul class="nav nav-pills nav-fill mb-3 p-1 bg-light rounded-3 border" id="bhe-entry-tabs" role="tablist">
              <li class="nav-item" role="presentation">
                <button class="nav-link active fw-bold py-1.5" id="bhe-tab-single-btn" data-bs-toggle="pill" data-bs-target="#bhe-tab-single" type="button" role="tab">
                  <i class="fas fa-file-alt me-1.5"></i>Einzelbuchung
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link fw-bold py-1.5" id="bhe-tab-sammel-btn" data-bs-toggle="pill" data-bs-target="#bhe-tab-sammel" type="button" role="tab" onclick="bhInitKassaSammelbeleg()">
                  <i class="fas fa-layer-group me-1.5"></i>Kassen-Sammelbeleg (Mehrere Positionen)
                </button>
              </li>
            </ul>
          ` : ''}

          <div class="tab-content" id="bhe-tab-content">
            <!-- TAB 1: EINZELBUCHUNG -->
            <div class="tab-pane fade show active" id="bhe-tab-single" role="tabpanel">
              <form id="bh-new-entry-form" onsubmit="bhSaveJournalEntry(event, false)">
                <input type="hidden" id="bhe-id" value="">
                
                <div class="row g-3 mb-3">
                  <div class="col-6">
                    <label class="form-label fw-bold small text-muted">Buchungsdatum</label>
                    <input type="date" class="form-control" id="bhe-datum" required value="${new Date().toISOString().split('T')[0]}">
                  </div>
                  <div class="col-6">
                    <label class="form-label fw-bold small text-muted">Belegnummer</label>
                    <input type="text" class="form-control fw-bold font-monospace" id="bhe-beleg" required placeholder="z.B. Kasse_2026-001">
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
                
                <div class="d-flex gap-2">
                  <button type="submit" class="btn btn-success flex-grow-1 py-2.5 fw-bold rounded-3 shadow-sm" id="bhe-submit-btn">
                    <i class="fas fa-check-circle me-1"></i> ${isEdit ? 'Änderungen speichern' : 'Buchung speichern'}
                  </button>
                  <button type="button" class="btn btn-outline-primary py-2.5 px-3 fw-bold rounded-3 shadow-sm" onclick="bhSaveAndPrintSingleJournalEntry(event)" title="Buchung speichern und direkt Kassenbeleg drucken">
                    <i class="fas fa-print me-1"></i> Speichern & Beleg drucken
                  </button>
                </div>
              </form>
            </div>

            ${!isEdit ? `
            <!-- TAB 2: KASSEN-SAMMELBELEG (MEHRERE POSITIONEN) -->
            <div class="tab-pane fade" id="bhe-tab-sammel" role="tabpanel">
              <form id="bh-sammel-form" onsubmit="bhSaveKassaSammelbeleg(event, false)">
                <div class="row g-2 mb-3">
                  <div class="col-md-4">
                    <label class="form-label fw-bold small text-muted">Belegdatum</label>
                    <input type="date" class="form-control form-control-sm" id="bh-ks-datum" required value="${new Date().toISOString().split('T')[0]}">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-bold small text-muted">Stamm-Belegnummer</label>
                    <input type="text" class="form-control form-control-sm fw-bold font-monospace" id="bh-ks-beleg" required placeholder="z.B. Kasse_2026-001">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-bold small text-muted">Art der Kassenbewegung</label>
                    <select class="form-select form-select-sm fw-semibold" id="bh-ks-art" onchange="bhUpdateKassaSammelArt()">
                      <option value="ausgabe" selected>Barausgabe (Geld aus Kasse)</option>
                      <option value="einnahme">Bareinnahme (Geld in Kasse)</option>
                      <option value="frei">Freie Kontierung (Soll & Haben)</option>
                    </select>
                  </div>
                </div>

                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">Gesamttitel / Anlass (Belegkopf)</label>
                  <input type="text" class="form-control form-control-sm" id="bh-ks-titel" required placeholder="z.B. Abrechnung Eröffnungsschiessen 2026 oder Materialeinkauf">
                </div>

                <div class="d-flex justify-content-between align-items-center mb-2">
                  <label class="form-label fw-bold small text-primary mb-0"><i class="fas fa-list-ol me-1"></i>Positionen des Sammelbelegs</label>
                  <button type="button" class="btn btn-sm btn-outline-primary py-0.5 px-2 fw-semibold" onclick="bhAddKassaSammelRow()">
                    <i class="fas fa-plus me-1"></i>Position hinzufügen
                  </button>
                </div>

                <div class="table-responsive border rounded-3 mb-3 bg-white" style="max-height: 280px;">
                  <table class="table table-sm table-hover align-middle mb-0" id="bh-ks-table">
                    <thead class="table-light small">
                      <tr id="bh-ks-thead-tr">
                        <th style="width: 30px;" class="text-center">#</th>
                        <th>Beschreibung / Positionstext</th>
                        <th style="width: 260px;">Aufwandskonto (Soll)</th>
                        <th style="width: 120px;" class="text-end">Betrag (CHF)</th>
                        <th style="width: 35px;"></th>
                      </tr>
                    </thead>
                    <tbody id="bh-ks-tbody">
                      <!-- Dynamische Zeilen via bhRenderKassaSammelRows -->
                    </tbody>
                  </table>
                </div>

                <!-- Zusammenfassung / Saldo -->
                <div class="card p-2.5 mb-3 bg-light border-0 rounded-3">
                  <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span class="small fw-semibold text-muted">
                      <span id="bh-ks-pos-count">0</span> Position(en) erfasst &middot; Kassenkonto: <strong class="text-dark">1000 Kasse</strong>
                    </span>
                    <span class="fs-6 fw-bold text-primary">
                      Total Beleg: CHF <span id="bh-ks-total-sum">0.00</span>
                    </span>
                  </div>
                </div>

                <div class="d-flex gap-2">
                  <button type="submit" class="btn btn-success flex-grow-1 py-2 fw-bold rounded-3 shadow-sm" id="bh-ks-save-btn">
                    <i class="fas fa-save me-1"></i> Sammelbeleg buchen
                  </button>
                  <button type="button" class="btn btn-primary py-2 px-3 fw-bold rounded-3 shadow-sm" onclick="bhSaveKassaSammelbeleg(event, true)" id="bh-ks-save-print-btn">
                    <i class="fas fa-print me-1"></i> Buchen & Beleg drucken
                  </button>
                </div>
              </form>
            </div>
            ` : ''}
          </div>
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

// =====================================================================
// KASSEN-SAMMELBELEG VERWALTUNG & LOGIK
// =====================================================================
window.bhInitKassaSammelbeleg = function() {
  const y = Number(window._bhYear || new Date().getFullYear());
  const belegEl = document.getElementById('bh-ks-beleg');
  if (belegEl && !belegEl.value) {
    belegEl.value = window.bhGetNextJournalBelegNr(y, 'Kasse_');
  }
  if (!window._bhKassaSammelRows || window._bhKassaSammelRows.length === 0) {
    window._bhKassaSammelRows = [
      { text: '', konto: '', kontoSoll: '', kontoHaben: '', betrag: '' },
      { text: '', konto: '', kontoSoll: '', kontoHaben: '', betrag: '' }
    ];
  }
  bhRenderKassaSammelRows();
};

window.bhUpdateKassaSammelArt = function() {
  bhSyncKassaSammelFromInputs();
  const art = document.getElementById('bh-ks-art') ? document.getElementById('bh-ks-art').value : 'ausgabe';
  const tr = document.getElementById('bh-ks-thead-tr');
  if (tr) {
    if (art === 'frei') {
      tr.innerHTML = `
        <th style="width: 30px;" class="text-center">#</th>
        <th>Beschreibung / Positionstext</th>
        <th style="width: 190px;">Soll-Konto</th>
        <th style="width: 190px;">Haben-Konto</th>
        <th style="width: 120px;" class="text-end">Betrag (CHF)</th>
        <th style="width: 35px;"></th>
      `;
    } else {
      const thLabel = art === 'einnahme' ? 'Ertragskonto (Haben)' : 'Aufwandskonto (Soll)';
      tr.innerHTML = `
        <th style="width: 30px;" class="text-center">#</th>
        <th>Beschreibung / Positionstext</th>
        <th style="width: 260px;">${thLabel}</th>
        <th style="width: 120px;" class="text-end">Betrag (CHF)</th>
        <th style="width: 35px;"></th>
      `;
    }
  }
  bhRenderKassaSammelRows();
};

window.bhSyncKassaSammelFromInputs = function() {
  const art = document.getElementById('bh-ks-art') ? document.getElementById('bh-ks-art').value : 'ausgabe';
  const isFrei = (art === 'frei');
  const rows = window._bhKassaSammelRows || [];

  rows.forEach((r, i) => {
    const textEl = document.getElementById(`bh-ks-text-${i}`);
    const amtEl = document.getElementById(`bh-ks-amt-${i}`);
    if (textEl) r.text = textEl.value;
    if (amtEl) r.betrag = amtEl.value;

    if (isFrei) {
      const sollEl = document.getElementById(`bh-ks-soll-${i}`);
      const habenEl = document.getElementById(`bh-ks-haben-${i}`);
      if (sollEl) r.kontoSoll = sollEl.value;
      if (habenEl) r.kontoHaben = habenEl.value;
    } else {
      const kontoEl = document.getElementById(`bh-ks-konto-${i}`);
      if (kontoEl) r.konto = kontoEl.value;
    }
  });
};

window.bhAddKassaSammelRow = function() {
  bhSyncKassaSammelFromInputs();
  (window._bhKassaSammelRows = window._bhKassaSammelRows || []).push({
    text: '',
    konto: '',
    kontoSoll: '',
    kontoHaben: '',
    betrag: ''
  });
  bhRenderKassaSammelRows();
};

window.bhRemoveKassaSammelRow = function(idx) {
  bhSyncKassaSammelFromInputs();
  if (window._bhKassaSammelRows && window._bhKassaSammelRows.length > 1) {
    window._bhKassaSammelRows.splice(idx, 1);
  }
  bhRenderKassaSammelRows();
};

window.bhRenderKassaSammelRows = function() {
  const tbody = document.getElementById('bh-ks-tbody');
  if (!tbody) return;

  const art = document.getElementById('bh-ks-art') ? document.getElementById('bh-ks-art').value : 'ausgabe';
  const isFrei = (art === 'frei');
  const rows = window._bhKassaSammelRows || [];

  const makeKontoOptions = (selectedVal) => {
    return (window._bhKontenrahmen || []).map(acc => {
      const isSel = String(acc.konto).trim() === String(selectedVal || '').trim();
      return `<option value="${acc.konto}" ${isSel ? 'selected' : ''}>${acc.konto} | ${acc.bezeichnung}</option>`;
    }).join('');
  };

  tbody.innerHTML = rows.map((r, i) => {
    let kontoCells = '';
    if (isFrei) {
      kontoCells = `
        <td>
          <select class="form-select form-select-sm" id="bh-ks-soll-${i}" onchange="bhUpdateKassaSammelLiveTotal()">
            <option value="" disabled ${!r.kontoSoll ? 'selected' : ''}>Soll-Konto...</option>
            ${makeKontoOptions(r.kontoSoll)}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm" id="bh-ks-haben-${i}" onchange="bhUpdateKassaSammelLiveTotal()">
            <option value="" disabled ${!r.kontoHaben ? 'selected' : ''}>Haben-Konto...</option>
            ${makeKontoOptions(r.kontoHaben)}
          </select>
        </td>
      `;
    } else {
      const labelPlaceholder = art === 'einnahme' ? 'Ertragskonto wählen...' : 'Aufwandskonto wählen...';
      kontoCells = `
        <td>
          <select class="form-select form-select-sm" id="bh-ks-konto-${i}" onchange="bhUpdateKassaSammelLiveTotal()">
            <option value="" disabled ${!r.konto ? 'selected' : ''}>${labelPlaceholder}</option>
            ${makeKontoOptions(r.konto)}
          </select>
        </td>
      `;
    }

    return `
      <tr>
        <td class="text-center fw-bold small text-muted">${i + 1}</td>
        <td>
          <input type="text" class="form-control form-control-sm" id="bh-ks-text-${i}" value="${escapeHtml(r.text || '')}" placeholder="z.B. Einkauf Getränke, Reinigung, etc." oninput="bhUpdateKassaSammelLiveTotal()">
        </td>
        ${kontoCells}
        <td>
          <input type="number" step="0.01" min="0.01" class="form-control form-control-sm text-end fw-bold" id="bh-ks-amt-${i}" value="${r.betrag || ''}" placeholder="0.00" oninput="bhUpdateKassaSammelLiveTotal()">
        </td>
        <td class="text-center">
          ${rows.length > 1 ? `<button type="button" class="btn btn-sm btn-outline-danger py-0 px-1.5" onclick="bhRemoveKassaSammelRow(${i})"><i class="fas fa-times"></i></button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  bhUpdateKassaSammelLiveTotal();
};

window.bhUpdateKassaSammelLiveTotal = function() {
  bhSyncKassaSammelFromInputs();
  const rows = window._bhKassaSammelRows || [];
  let total = 0;
  let count = 0;

  rows.forEach(r => {
    const a = parseFloat(r.betrag);
    if (!isNaN(a) && a > 0) {
      total += a;
      count++;
    }
  });

  const sumEl = document.getElementById('bh-ks-total-sum');
  if (sumEl) sumEl.textContent = (typeof fmtChf === 'function') ? fmtChf(total) : total.toFixed(2);

  const countEl = document.getElementById('bh-ks-pos-count');
  if (countEl) countEl.textContent = rows.length;
};

window.bhSaveKassaSammelbeleg = async function(event, printAfter = false) {
  if (event) event.preventDefault();
  bhSyncKassaSammelFromInputs();

  const datumEl = document.getElementById('bh-ks-datum');
  const belegEl = document.getElementById('bh-ks-beleg');
  const titelEl = document.getElementById('bh-ks-titel');
  const artEl = document.getElementById('bh-ks-art');

  const datum = datumEl ? datumEl.value : new Date().toISOString().split('T')[0];
  const baseBeleg = belegEl ? belegEl.value.trim() : '';
  const titel = titelEl ? titelEl.value.trim() : '';
  const art = artEl ? artEl.value : 'ausgabe';

  if (!baseBeleg) {
    alert('Bitte Belegnummer angeben.');
    if (belegEl) belegEl.focus();
    return;
  }
  if (!titel) {
    alert('Bitte Gesamttitel / Anlass angeben.');
    if (titelEl) titelEl.focus();
    return;
  }

  const rows = window._bhKassaSammelRows || [];
  const validRows = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const amt = parseFloat(r.betrag);
    if (!r.text.trim() && isNaN(amt)) continue; // leere Zeile überspringen

    if (!r.text.trim()) {
      alert(`Bitte Beschreibung für Position #${i + 1} angeben.`);
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      alert(`Bitte gültigen Betrag (> 0) für Position #${i + 1} angeben.`);
      return;
    }

    if (art === 'frei') {
      if (!r.kontoSoll || !r.kontoHaben) {
        alert(`Bitte Soll- und Haben-Konto für Position #${i + 1} wählen.`);
        return;
      }
      if (r.kontoSoll === r.kontoHaben) {
        alert(`Soll- und Haben-Konto für Position #${i + 1} dürfen nicht identisch sein.`);
        return;
      }
      validRows.push({
        text: r.text.trim(),
        soll: r.kontoSoll,
        haben: r.kontoHaben,
        betrag: amt
      });
    } else {
      if (!r.konto) {
        alert(`Bitte Gegenkonto für Position #${i + 1} auswählen.`);
        return;
      }
      if (r.konto === '1000') {
        alert(`Gegenkonto für Position #${i + 1} darf nicht das Kassenkonto 1000 sein.`);
        return;
      }
      validRows.push({
        text: r.text.trim(),
        soll: (art === 'ausgabe') ? r.konto : '1000',
        haben: (art === 'ausgabe') ? '1000' : r.konto,
        betrag: amt
      });
    }
  }

  if (validRows.length === 0) {
    alert('Bitte mindestens eine gültige Position mit Text, Gegenkonto und Betrag erfassen.');
    return;
  }

  const saveBtn = document.getElementById('bh-ks-save-btn');
  const printBtn = document.getElementById('bh-ks-save-print-btn');
  if (saveBtn) saveBtn.disabled = true;
  if (printBtn) printBtn.disabled = true;
  if (saveBtn) saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Speichere Sammelbeleg...';

  const year = Number(window._bhYear || new Date().getFullYear());
  const savedEntries = [];

  try {
    for (let i = 0; i < validRows.length; i++) {
      const vr = validRows[i];
      const subSuffix = validRows.length > 1 ? String.fromCharCode(97 + i) : '';
      const belegNr = `${baseBeleg}${subSuffix}`;
      const desc = validRows.length > 1 ? `${titel} (${vr.text})` : `${titel} - ${vr.text}`;

      const payload = {
        action: 'addJournalEntry',
        jahr: year,
        datum: datum,
        beleg_nr: belegNr,
        beschreibung: desc,
        konto_soll: vr.soll,
        konto_haben: vr.haben,
        betrag: vr.betrag,
        typ: 'Kassa'
      };

      const res = await apiFetch('buchhaltung', payload, 'POST');
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || `Fehler bei Position #${i + 1}`);
      }

      const newEntry = (json.data && json.data.id) ? json.data : {
        id: Date.now() + i,
        jahr: year,
        datum: datum,
        beleg_nr: belegNr,
        beschreibung: desc,
        konto_soll: vr.soll,
        konto_haben: vr.haben,
        betrag: vr.betrag,
        typ: 'Kassa'
      };

      window._bhJournal = window._bhJournal || [];
      window._bhJournal.push(newEntry);
      savedEntries.push(newEntry);
    }

    if (typeof showSuccess === 'function') {
      showSuccess(`🎉 Kassen-Sammelbeleg mit ${savedEntries.length} Positionen erfolgreich gebucht!`);
    }

    const modalEl = document.getElementById('bhModalNewEntry');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    }

    if (typeof recalculateLiveAccountBalances === 'function') recalculateLiveAccountBalances();
    if (typeof updateAccountingKPIs === 'function') updateAccountingKPIs();
    if (typeof renderActiveAccountingTab === 'function') renderActiveAccountingTab();

    if (printAfter && savedEntries.length > 0) {
      bhPrintJournalBeleg(savedEntries, titel);
    }

    setTimeout(async () => {
      if (typeof loadBuchhaltungData === 'function') await loadBuchhaltungData(true, true);
    }, 1500);

  } catch (err) {
    alert('❌ Fehler beim Buchen des Sammelbelegs: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save me-1"></i> Sammelbeleg buchen';
    }
    if (printBtn) {
      printBtn.disabled = false;
      printBtn.innerHTML = '<i class="fas fa-print me-1"></i> Buchen & Beleg drucken';
    }
  }
};

window.bhSaveAndPrintSingleJournalEntry = function(event) {
  bhSaveJournalEntry(event, true);
};

// =====================================================================
// DRUCKFUNKTION FÜR KASSEN- UND SAMMELBELEGE (A4 PRINT-TEMPLATE)
// =====================================================================
window.bhPrintJournalBeleg = function(entriesOrIds, customTitle) {
  let entries = [];
  if (!entriesOrIds) return;
  if (Array.isArray(entriesOrIds)) {
    entries = entriesOrIds.map(item => {
      if (typeof item === 'object' && item !== null) return item;
      return (window._bhJournal || []).find(j => Number(j.id) === Number(item));
    }).filter(Boolean);
  } else if (typeof entriesOrIds === 'object') {
    entries = [entriesOrIds];
  } else {
    const found = (window._bhJournal || []).find(j => Number(j.id) === Number(entriesOrIds));
    if (found) entries = [found];
  }

  if (entries.length === 0) {
    alert('Keine Buchungsdaten zum Drucken gefunden.');
    return;
  }

  const belegNrs = Array.from(new Set(entries.map(e => e.beleg_nr).filter(Boolean)));
  const belegNrDisplay = belegNrs.join(', ') || 'Ohne Belegnummer';
  
  const belegDatum = entries[0].datum ? (typeof isoToDisplay === 'function' ? isoToDisplay(entries[0].datum) : entries[0].datum) : new Date().toLocaleDateString('de-CH');
  const totalAmount = entries.reduce((s, e) => s + (Number(e.betrag) || 0), 0);
  const title = customTitle || (entries.length === 1 ? entries[0].beschreibung : `Kassenabrechnung (${entries.length} Positionen)`);
  
  const kontenrahmen = window._bhKontenrahmen || [];
  function getKontoLabel(code) {
    const matched = kontenrahmen.find(k => String(k.konto).trim() === String(code).trim());
    return matched ? `${matched.konto} ${matched.bezeichnung}` : String(code || '–');
  }

  const tableRowsHtml = entries.map((e, idx) => `
    <tr>
      <td style="text-align: center; font-weight: bold; width: 35px;">${idx + 1}</td>
      <td style="font-family: monospace; font-size: 11px; width: 130px;">${escapeHtml(e.beleg_nr || '–')}</td>
      <td><strong>${escapeHtml(e.beschreibung || '')}</strong></td>
      <td style="font-size: 11.5px;">${escapeHtml(getKontoLabel(e.konto_soll))}</td>
      <td style="font-size: 11.5px;">${escapeHtml(getKontoLabel(e.konto_haben))}</td>
      <td style="text-align: right; font-weight: bold; white-space: nowrap; width: 110px;">CHF ${typeof fmtChf === 'function' ? fmtChf(e.betrag) : Number(e.betrag).toFixed(2)}</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank', 'width=950,height=800');
  if (!printWindow) {
    alert('Popup-Blocker aktiv! Bitte Popups für diese Seite erlauben, um den Beleg zu drucken.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="utf-8">
      <title>Kassenbeleg_${belegNrs[0] || 'Druck'}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #212529;
          background: #fff;
          margin: 0;
          padding: 25px;
          font-size: 13px;
          line-height: 1.4;
        }
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0d6efd;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .club-title {
          font-size: 20px;
          font-weight: 800;
          color: #0b5ed7;
          margin: 0 0 4px 0;
          letter-spacing: 0.5px;
        }
        .club-sub {
          font-size: 12px;
          color: #6c757d;
          margin: 0;
        }
        .doc-title-badge {
          text-align: right;
        }
        .doc-title {
          font-size: 18px;
          font-weight: 800;
          margin: 0 0 4px 0;
          color: #212529;
          text-transform: uppercase;
        }
        .beleg-badge {
          display: inline-block;
          background: #e7f1ff;
          color: #0d6efd;
          padding: 4px 10px;
          border-radius: 4px;
          font-weight: bold;
          font-family: monospace;
          font-size: 13px;
          border: 1px solid #b6d4fe;
        }
        .meta-box {
          display: flex;
          gap: 20px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          padding: 12px 16px;
          margin-bottom: 20px;
        }
        .meta-item { flex: 1; }
        .meta-label {
          font-size: 10px;
          text-transform: uppercase;
          color: #6c757d;
          font-weight: bold;
          margin-bottom: 2px;
        }
        .meta-value {
          font-size: 14px;
          font-weight: 600;
          color: #212529;
        }
        table.beleg-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        table.beleg-table th {
          background: #f1f4f9;
          color: #495057;
          border: 1px solid #dee2e6;
          padding: 8px 10px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        table.beleg-table td {
          border: 1px solid #dee2e6;
          padding: 8px 10px;
        }
        .total-row td {
          background: #f8f9fa;
          border-top: 2px solid #0d6efd;
          font-size: 15px;
          font-weight: 800;
        }
        .signature-section {
          margin-top: 35px;
          display: flex;
          gap: 25px;
          justify-content: space-between;
        }
        .sig-box {
          flex: 1;
          border-top: 1px solid #495057;
          padding-top: 8px;
          font-size: 11px;
          color: #495057;
        }
        .sig-title {
          font-weight: bold;
          color: #212529;
          font-size: 12px;
          margin-bottom: 25px;
        }
        .receipt-attach-zone {
          margin-top: 35px;
          border: 2px dashed #ced4da;
          border-radius: 6px;
          padding: 25px;
          text-align: center;
          color: #adb5bd;
          font-size: 12px;
          background: #fafbfc;
        }
        @media print {
          body { padding: 10px; font-size: 12px; }
          .receipt-attach-zone { page-break-inside: avoid; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div>
          <h1 class="club-title">Sportschützen Muhen</h1>
          <p class="club-sub">Kassabuch &middot; Belegwesen Vereinsrechnung</p>
        </div>
        <div class="doc-title-badge">
          <div class="doc-title">Kassenbeleg</div>
          <div class="beleg-badge">${escapeHtml(belegNrDisplay)}</div>
        </div>
      </div>

      <div class="meta-box">
        <div class="meta-item">
          <div class="meta-label">Belegdatum</div>
          <div class="meta-value">${belegDatum}</div>
        </div>
        <div class="meta-item" style="flex: 2;">
          <div class="meta-label">Betreff / Verwendungszweck</div>
          <div class="meta-value">${escapeHtml(title)}</div>
        </div>
        <div class="meta-item" style="text-align: right;">
          <div class="meta-label">Total Betrag</div>
          <div class="meta-value" style="color: #0b5ed7; font-size: 16px;">CHF ${typeof fmtChf === 'function' ? fmtChf(totalAmount) : totalAmount.toFixed(2)}</div>
        </div>
      </div>

      <table class="beleg-table">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">#</th>
            <th style="width: 130px;">Beleg-Nr</th>
            <th>Beschreibung / Buchungstext</th>
            <th>Soll-Konto</th>
            <th>Haben-Konto</th>
            <th style="text-align: right; width: 110px;">Betrag</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
          <tr class="total-row">
            <td colspan="5" style="text-align: right; text-transform: uppercase;">Total Abrechnung:</td>
            <td style="text-align: right; color: #0b5ed7;">CHF ${typeof fmtChf === 'function' ? fmtChf(totalAmount) : totalAmount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div class="signature-section">
        <div class="sig-box">
          <div class="sig-title">Verbucht / Kassier:</div>
          <div>Daniel Hunziker &middot; Datum: ${belegDatum}</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Auszahlung erhalten / Belegsteller:</div>
          <div>Name / Datum / Unterschrift: ...........................................</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Geprüft GPK / Revision:</div>
          <div>Datum / Visum: ................................................................</div>
        </div>
      </div>

      <div class="receipt-attach-zone">
        ✂ Original-Kassenbons, Quittungen oder Belege hier anheften / aufkleben
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 350);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// POST-Request zum Speichern/Aktualisieren des Buchungssatzes
window.bhSaveJournalEntry = async function(event, printAfter = false) {
  if (event) event.preventDefault();
  
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
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchung speichern';
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
        submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchung speichern';
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
      
      let savedEntry = null;
      if (result.data) {
        savedEntry = result.data;
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
      
      if (printAfter && (savedEntry || payload)) {
        bhPrintJournalBeleg([savedEntry || payload]);
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
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchung speichern';
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

// POPUP-MODAL: SICHERHEITSBESTÄTIGUNG FÜR MEHRFACH-LÖSCHUNG IM KASSABUCH-JOURNAL
window.bhConfirmDeleteSelectedJournalEntries = function() {
  if (!window._bhSelectedJournalIds || window._bhSelectedJournalIds.size === 0) {
    alert("Bitte markieren Sie mindestens einen Buchungssatz zum Löschen.");
    return;
  }

  const selectedEntries = (window._bhJournal || []).filter(j => window._bhSelectedJournalIds.has(Number(j.id)));
  if (selectedEntries.length === 0) {
    alert("Keine gültigen Buchungssätze für die ausgewählten IDs gefunden.");
    return;
  }

  let totalAmount = 0;
  selectedEntries.forEach(e => {
    totalAmount += Number(e.betrag || 0);
  });

  let modalEl = document.getElementById('bhModalBatchDeleteJournal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalBatchDeleteJournal';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  const previewRows = selectedEntries.map(e => `
    <tr>
      <td class="text-muted small font-monospace">${e.id}</td>
      <td class="small" style="white-space: nowrap;">${isoToDisplay(e.datum)}</td>
      <td class="fw-bold small" style="white-space: nowrap;">${escapeHtml(e.beleg_nr)}</td>
      <td class="small text-truncate" style="max-width: 200px;" title="${escapeHtml(e.beschreibung)}">${escapeHtml(e.beschreibung)}</td>
      <td class="small font-monospace">${e.konto_soll} → ${e.konto_haben}</td>
      <td class="text-end fw-bold font-monospace small" style="white-space: nowrap;">CHF ${fmtChf(e.betrag)}</td>
    </tr>
  `).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content shadow-lg border-0">
        <div class="modal-header bg-danger text-white">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-trash-alt me-2"></i>Ausgewählte Buchungssätze löschen (${selectedEntries.length})
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
        </div>
        <div class="modal-body p-4">
          <div class="alert alert-danger d-flex align-items-center mb-3 shadow-sm border-0" style="background-color: #fde8e8; color: #991b1b;">
            <i class="fas fa-exclamation-triangle fa-2x me-3 flex-shrink-0"></i>
            <div>
              <div class="fw-bold fs-6">Achtung: Unwiderruflicher Vorgang!</div>
              <div>
                Möchten Sie die folgenden <strong>${selectedEntries.length} Buchungssatz/-sätze</strong> mit einem Gesamtwert von 
                <strong>CHF ${fmtChf(totalAmount)}</strong> wirklich endgültig aus dem Kassabuch-Journal entfernen?
              </div>
            </div>
          </div>

          <div class="card border rounded-3 mb-3">
            <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
              <span class="small fw-bold text-secondary text-uppercase">Vorschau der zu löschenden Buchungen</span>
              <span class="badge bg-danger">${selectedEntries.length} Datensätze</span>
            </div>
            <div class="table-responsive" style="max-height: 260px;">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light text-muted small" style="position: sticky; top: 0; z-index: 2;">
                  <tr>
                    <th>ID</th>
                    <th>Datum</th>
                    <th>Beleg</th>
                    <th>Beschreibung</th>
                    <th>Konto (Soll → Haben)</th>
                    <th class="text-end">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  ${previewRows}
                </tbody>
              </table>
            </div>
            <div class="card-footer bg-light py-2 text-end">
              <span class="fw-bold me-2">Gesamtsumme:</span>
              <span class="badge bg-secondary font-monospace fs-6 px-3 py-1.5">CHF ${fmtChf(totalAmount)}</span>
            </div>
          </div>

          <div class="small text-muted">
            <i class="fas fa-info-circle me-1 text-primary"></i>
            Nach der Löschung werden Kontensaldi, Bilanz und Erfolgsrechnung automatisch aktualisiert.
          </div>
        </div>
        <div class="modal-footer bg-light">
          <button type="button" class="btn btn-secondary px-3" data-bs-dismiss="modal">Abbrechen</button>
          <button type="button" class="btn btn-danger fw-bold px-3 shadow-sm" id="bh-batch-delete-submit-btn" onclick="bhExecuteBatchDeleteJournalEntries()">
            <i class="fas fa-trash-alt me-1.5"></i>${selectedEntries.length} Buchung(en) endgültig löschen
          </button>
        </div>
      </div>
    </div>
  `;

  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
};

// AUSFÜHRUNG: MEHRFACHLÖSCHUNG DER AUSGEWÄHLTEN BUCHUNGSSÄTZE
window.bhExecuteBatchDeleteJournalEntries = async function() {
  const submitBtn = document.getElementById('bh-batch-delete-submit-btn');
  const ids = Array.from(window._bhSelectedJournalIds || []).map(Number);
  
  if (ids.length === 0) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1.5" role="status" aria-hidden="true"></span>Wird gelöscht...';
  }

  try {
    let success = false;
    let errorMessage = '';

    // 1. Primärversuch: Schneller Batch-Endpunkt in GAS
    try {
      const response = await apiFetch('buchhaltung', { action: 'deleteJournalEntriesBatch', ids: ids }, 'POST');
      const result = await response.json();
      if (result.success) {
        success = true;
      } else {
        errorMessage = result.error || '';
      }
    } catch (batchErr) {
      errorMessage = batchErr.message || '';
    }

    // 2. Fallback: Falls Batch-Action noch nicht deployed ist, serielle Einzellöschungen durchführen
    if (!success) {
      let failedCount = 0;
      for (const id of ids) {
        try {
          const res = await apiFetch('buchhaltung', { action: 'deleteJournalEntry', id: id }, 'POST');
          const r = await res.json();
          if (!r.success) failedCount++;
        } catch (e) {
          failedCount++;
        }
      }
      if (failedCount === 0 || failedCount < ids.length) {
        success = true;
      } else {
        throw new Error(errorMessage || "Fehler beim Ausführen der Mehrfachlöschung.");
      }
    }

    // Modal schliessen
    const modalEl = document.getElementById('bhModalBatchDeleteJournal');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    // Lokalen State sofort anpassen (Optimistic / Reactive UI)
    const deletedSet = new Set(ids);
    window._bhJournal = (window._bhJournal || []).filter(j => !deletedSet.has(Number(j.id)));
    window._bhSelectedJournalIds.clear();
    window._bhLastCheckedJournalId = null;

    recalculateLiveAccountBalances();
    updateAccountingKPIs();
    renderActiveAccountingTab();

    showSuccess(`🎉 ${ids.length} Buchungssatz/-sätze erfolgreich aus dem Journal gelöscht!`);

    // Im Hintergrund Daten neu synchronisieren
    setTimeout(async () => {
      if (typeof loadBuchhaltungData === 'function') {
        await loadBuchhaltungData(true, true);
      }
    }, 1500);

  } catch (err) {
    alert("❌ Fehler beim Löschen der Buchungssätze: " + err.message);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fas fa-trash-alt me-1.5"></i>${ids.length} Buchung(en) endgültig löschen`;
    }
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

