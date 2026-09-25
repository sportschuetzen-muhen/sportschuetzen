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
    // 1. Supabase-First Write
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
    if (supa) {
      try {
        const accObj = {
          konto: payload.konto,
          bezeichnung: payload.bezeichnung,
          klasse: payload.klasse,
          eroeffnungssaldo: payload.eroeffnungssaldo
        };
        const { error: accErr } = await supa.from('accounting_accounts').upsert(accObj, { onConflict: 'konto' });
        if (accErr) console.warn("⚠️ Supabase Konto upsert Warning:", accErr.message);

        if (budgetVal !== undefined) {
          const { error: budErr } = await supa.from('accounting_budgets').upsert({
            konto: payload.konto,
            jahr: Number(window._bhYear || new Date().getFullYear()),
            betrag: budgetVal
          }, { onConflict: 'konto,jahr' });
          if (budErr) console.warn("⚠️ Supabase Budget upsert Warning:", budErr.message);
        }
      } catch (supaErr) {
        console.warn("⚠️ Supabase saveKonto Fehler:", supaErr);
      }
    }

    // Supabase ist Single Source of Truth

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

// Ermittelt den Basis-Belegstamm ohne Suffix a, b, c (z.B. Kasse_2026-004a -> Kasse_2026-004)
window.bhGetSplitBaseBeleg = function(belegNr) {
  if (!belegNr) return '';
  const str = String(belegNr).trim();
  const m = str.match(/^(.+?)[a-z]$/i);
  return m ? m[1] : str;
};

// =====================================================================
// AUTOCOMPLETE-WIDGET FÜR KONTOAUSWAHL (Suchbar mit Dropdown)
// =====================================================================

// CSS für Autocomplete-Dropdown (einmalig injizieren)
(function() {
  if (document.getElementById('bh-konto-ac-styles')) return;
  const style = document.createElement('style');
  style.id = 'bh-konto-ac-styles';
  style.textContent = `
    .bh-konto-ac-wrap { position: relative; }
    .bh-konto-ac-dropdown {
      position: absolute; z-index: 1060; width: 100%; max-height: 280px;
      overflow-y: auto; background: #fff; border: 1px solid rgba(0,0,0,.15);
      border-radius: 0.5rem; box-shadow: 0 8px 24px rgba(0,0,0,.12);
      display: none; margin-top: 2px;
    }
    .bh-konto-ac-dropdown.show { display: block; }
    .bh-konto-ac-item {
      padding: 7px 12px; cursor: pointer; font-size: 0.85rem;
      border-bottom: 1px solid rgba(0,0,0,.04); display: flex;
      justify-content: space-between; align-items: center; gap: 8px;
    }
    .bh-konto-ac-item:last-child { border-bottom: none; }
    .bh-konto-ac-item:hover, .bh-konto-ac-item.active {
      background: rgba(13, 110, 253, 0.08);
    }
    .bh-konto-ac-item .konto-code {
      font-family: monospace; font-weight: 700; min-width: 44px;
    }
    .bh-konto-ac-item .konto-name { flex: 1; }
    .bh-konto-ac-badge {
      font-size: 0.7rem; padding: 1px 6px; border-radius: 4px; font-weight: 600;
      white-space: nowrap;
    }
    .bh-konto-ac-badge.cat-aktiven { background: #d1ecf1; color: #0c5460; }
    .bh-konto-ac-badge.cat-passiven { background: #f8d7da; color: #721c24; }
    .bh-konto-ac-badge.cat-ertrag { background: #d4edda; color: #155724; }
    .bh-konto-ac-badge.cat-aufwand { background: #fff3cd; color: #856404; }
    .bh-konto-ac-badge.cat-abschluss { background: #e2e3e5; color: #383d41; }
    .bh-konto-ac-empty {
      padding: 10px 14px; font-size: 0.82rem; color: #888; text-align: center;
    }
    .bh-konto-ac-input.is-resolved {
      border-color: #198754 !important;
      box-shadow: 0 0 0 0.15rem rgba(25, 135, 84, 0.15) !important;
    }
  `;
  document.head.appendChild(style);
})();

// Extrahiert den 4-stelligen Konto-Code aus einem Input-Wert ("1000 | Kasse" → "1000")
window.bhKontoResolveCode = function(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (s.includes('|')) return s.split('|')[0].trim();
  if (/^\d{4}$/.test(s)) return s;
  const matches = typeof bhFindMatchingKonten === 'function' ? bhFindMatchingKonten(s) : [];
  return matches.length > 0 ? String(matches[0].konto).trim() : s;
};

// Formatiert einen Konto-Code zum Display-Wert ("1000" → "1000 | Kasse")
window.bhKontoFormatDisplay = function(code) {
  if (!code) return '';
  const c = String(code).trim();
  const acc = (window._bhKontenrahmen || []).find(a => String(a.konto).trim() === c);
  return acc ? `${acc.konto} | ${acc.bezeichnung}` : c;
};

// Initialisiert Autocomplete für alle .bh-konto-ac-input Felder innerhalb eines Containers
window.bhInitKontoAutocompleteForContainer = function(container) {
  if (!container) return;
  const inputs = container.querySelectorAll('input.bh-konto-ac-input');
  inputs.forEach(input => {
    // Dropdown-Container erstellen falls nicht vorhanden
    let dropdown = input.parentElement.querySelector('.bh-konto-ac-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'bh-konto-ac-dropdown';
      input.parentElement.appendChild(dropdown);
    }

    let activeIdx = -1;
    let currentMatches = [];

    const getCatClass = (acc) => {
      const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: acc.klasse || '' };
      const m = (cat.main || '').toLowerCase();
      if (m.includes('aktiv')) return 'cat-aktiven';
      if (m.includes('passiv')) return 'cat-passiven';
      if (m.includes('ertrag')) return 'cat-ertrag';
      if (m.includes('aufwand')) return 'cat-aufwand';
      if (m.includes('abschluss')) return 'cat-abschluss';
      return '';
    };

    const getCatLabel = (acc) => {
      const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: acc.klasse || '' };
      return cat.main || acc.klasse || '';
    };

    const renderDropdown = (query) => {
      const q = String(query || '').trim();
      if (!q) {
        // Zeige alle Konten wenn kein Query (z.B. bei Fokus)
        currentMatches = (window._bhKontenrahmen || []).slice(0, 50);
      } else if (q.includes('|')) {
        dropdown.classList.remove('show');
        return;
      } else {
        currentMatches = typeof bhFindMatchingKonten === 'function' ? bhFindMatchingKonten(q) : [];
      }
      activeIdx = -1;

      if (currentMatches.length === 0 && q) {
        dropdown.innerHTML = '<div class="bh-konto-ac-empty"><i class="fas fa-search me-1"></i>Kein Konto gefunden für «' + (typeof escapeHtml === 'function' ? escapeHtml(q) : q) + '»</div>';
        dropdown.classList.add('show');
        return;
      }

      dropdown.innerHTML = currentMatches.map((acc, idx) => {
        const catCls = getCatClass(acc);
        const catLabel = getCatLabel(acc);
        return `<div class="bh-konto-ac-item" data-idx="${idx}" data-code="${acc.konto}">
          <span class="konto-code">${acc.konto}</span>
          <span class="konto-name">${typeof escapeHtml === 'function' ? escapeHtml(acc.bezeichnung || '') : (acc.bezeichnung || '')}</span>
          ${catLabel ? `<span class="bh-konto-ac-badge ${catCls}">${catLabel}</span>` : ''}
        </div>`;
      }).join('');
      dropdown.classList.add('show');
    };

    const selectItem = (acc) => {
      input.value = `${acc.konto} | ${acc.bezeichnung}`;
      input.classList.add('is-resolved');
      dropdown.classList.remove('show');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const highlightItem = (idx) => {
      const items = dropdown.querySelectorAll('.bh-konto-ac-item');
      items.forEach(it => it.classList.remove('active'));
      if (idx >= 0 && idx < items.length) {
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      }
    };

    // Input event
    input.addEventListener('input', () => {
      input.classList.remove('is-resolved');
      renderDropdown(input.value);
    });

    // Focus event – show all accounts
    input.addEventListener('focus', () => {
      const val = input.value.trim();
      if (!val || !val.includes('|')) {
        renderDropdown(val);
      }
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.bh-konto-ac-item');
      if (!dropdown.classList.contains('show') || items.length === 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          renderDropdown(input.value);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        highlightItem(activeIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        highlightItem(activeIdx);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < currentMatches.length) {
          selectItem(currentMatches[activeIdx]);
        } else if (currentMatches.length > 0) {
          selectItem(currentMatches[0]);
        }
      } else if (e.key === 'Tab') {
        // Resolve on Tab
        if (!input.value.includes('|') && currentMatches.length > 0) {
          const target = activeIdx >= 0 ? currentMatches[activeIdx] : currentMatches[0];
          selectItem(target);
        }
        dropdown.classList.remove('show');
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('show');
      }
    });

    // Click on dropdown item
    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent blur
      const item = e.target.closest('.bh-konto-ac-item');
      if (item) {
        const idx = Number(item.dataset.idx);
        if (idx >= 0 && idx < currentMatches.length) {
          selectItem(currentMatches[idx]);
        }
      }
    });

    // Blur – close dropdown and auto-resolve
    input.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.classList.remove('show');
        const val = input.value.trim();
        if (val && !val.includes('|')) {
          const matches = typeof bhFindMatchingKonten === 'function' ? bhFindMatchingKonten(val) : [];
          if (matches.length > 0) {
            input.value = `${matches[0].konto} | ${matches[0].bezeichnung}`;
            input.classList.add('is-resolved');
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, 150);
    });

    // Mark as resolved if already filled
    if (input.value && input.value.includes('|')) {
      input.classList.add('is-resolved');
    }
  });
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
  
  const isEdit = Boolean(entryId);

  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px);">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold" id="bhe-modal-title">
            <i class="fas fa-receipt me-2"></i>${isEdit ? `Buchungssatz bearbeiten (ID: ${entryId})` : 'Journalbuchung erfassen'}
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <!-- Split-Warnung / Verbund-Hinweis Container -->
          <div id="bhe-split-warning-container"></div>

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
                    <div class="bh-konto-ac-wrap">
                      <input type="text" class="form-control bh-konto-ac-input" id="bhe-soll" placeholder="Konto suchen (Nr. oder Name)..." autocomplete="off">
                    </div>
                  </div>
                  <div class="col-6">
                    <label class="form-label fw-bold small text-muted text-success"><i class="fas fa-long-arrow-alt-left me-1"></i> Haben-Konto (Quelle)</label>
                    <div class="bh-konto-ac-wrap">
                      <input type="text" class="form-control bh-konto-ac-input" id="bhe-haben" placeholder="Konto suchen (Nr. oder Name)..." autocomplete="off">
                    </div>
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

  // Autocomplete initialisieren für Soll/Haben
  setTimeout(() => bhInitKontoAutocompleteForContainer(modalEl), 50);
  
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
      sollEl.value = window.bhKontoFormatDisplay(entry.konto_soll || '');
      habenEl.value = window.bhKontoFormatDisplay(entry.konto_haben || '');
      if (sollEl.value && sollEl.value.includes('|')) sollEl.classList.add('is-resolved');
      if (habenEl.value && habenEl.value.includes('|')) habenEl.classList.add('is-resolved');
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

      // Split-Verbund prüfen und Infobox anzeigen
      const baseBeleg = window.bhGetSplitBaseBeleg(entry.beleg_nr);
      const isSplit = /[a-z]$/i.test(String(entry.beleg_nr || '').trim());
      const splitGroup = isSplit ? (window._bhJournal || []).filter(j => {
        return Number(j.jahr) === Number(entry.jahr) && window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg;
      }) : [];

      const warnContainer = document.getElementById('bhe-split-warning-container');
      if (warnContainer) {
        if (splitGroup.length > 1) {
          const splitGroupTotal = splitGroup.reduce((s, j) => s + (Number(j.betrag) || 0), 0);
          warnContainer.innerHTML = `
            <div class="alert alert-primary border-primary d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 py-2.5 px-3 rounded-3 shadow-sm" style="background: #eef5ff; border-left: 4px solid #0d6efd;">
              <div>
                <div class="fw-bold text-primary"><i class="fas fa-layer-group me-1.5"></i>Split-Buchung: <span class="font-monospace">${escapeHtml(baseBeleg)}</span></div>
                <div class="small text-muted">Gehört zu einem Verbund von <strong>${splitGroup.length} Positionen</strong> (Gesamtbetrag: <strong>${typeof fmtChf === 'function' ? fmtChf(splitGroupTotal) : 'CHF ' + splitGroupTotal.toFixed(2)}</strong>).</div>
              </div>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary bg-white fw-semibold" onclick="bhPrintJournalBeleg(${entry.id})" title="Gesamten Beleg drucken">
                  <i class="fas fa-print me-1"></i>Beleg drucken
                </button>
                <button type="button" class="btn btn-sm btn-primary fw-bold shadow-sm" onclick="bhOpenSplitGroupEditModal('${escapeHtml(baseBeleg)}', ${entry.jahr})">
                  <i class="fas fa-edit me-1"></i>Gesamten Split bearbeiten (${splitGroup.length} Zeilen)
                </button>
              </div>
            </div>
          `;
        } else {
          warnContainer.innerHTML = '';
        }
      }
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
      const pfx = window.bhDetermineAutoBelegPrefix(window.bhKontoResolveCode(sollEl.value), window.bhKontoResolveCode(habenEl.value), typEl.value);
      const y = Number(window._bhYear || new Date().getFullYear());
      belegEl.value = window.bhGetNextJournalBelegNr(y, pfx);
    };

    sollEl.addEventListener('change', updateAutoBeleg);
    habenEl.addEventListener('change', updateAutoBeleg);
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
      if (sollEl) r.kontoSoll = window.bhKontoResolveCode(sollEl.value);
      if (habenEl) r.kontoHaben = window.bhKontoResolveCode(habenEl.value);
    } else {
      const kontoEl = document.getElementById(`bh-ks-konto-${i}`);
      if (kontoEl) r.konto = window.bhKontoResolveCode(kontoEl.value);
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

  tbody.innerHTML = rows.map((r, i) => {
    let kontoCells = '';
    if (isFrei) {
      kontoCells = `
        <td>
          <div class="bh-konto-ac-wrap">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-ks-soll-${i}" value="${r.kontoSoll ? window.bhKontoFormatDisplay(r.kontoSoll) : ''}" placeholder="Soll-Konto..." autocomplete="off">
          </div>
        </td>
        <td>
          <div class="bh-konto-ac-wrap">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-ks-haben-${i}" value="${r.kontoHaben ? window.bhKontoFormatDisplay(r.kontoHaben) : ''}" placeholder="Haben-Konto..." autocomplete="off">
          </div>
        </td>
      `;
    } else {
      const labelPlaceholder = art === 'einnahme' ? 'Ertragskonto suchen...' : 'Aufwandskonto suchen...';
      kontoCells = `
        <td>
          <div class="bh-konto-ac-wrap">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-ks-konto-${i}" value="${r.konto ? window.bhKontoFormatDisplay(r.konto) : ''}" placeholder="${labelPlaceholder}" autocomplete="off">
          </div>
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

  // Autocomplete initialisieren für Konto-Inputs
  setTimeout(() => bhInitKontoAutocompleteForContainer(tbody), 30);

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

      const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : (window.supabaseClient || null);
      if (!supa) throw new Error("Supabase-Client nicht verfügbar");

      const insertPayload = {
        jahr: year,
        datum: datum,
        beleg_nr: belegNr,
        beschreibung: desc,
        konto_soll: vr.soll,
        konto_haben: vr.haben,
        betrag: vr.betrag,
        typ: 'Kassa'
      };

      const { data: supaData, error: supaErr } = await supa.from('accounting_journal').insert(insertPayload).select().single();
      if (supaErr) {
        throw new Error(supaErr.message || `Fehler bei Position #${i + 1}`);
      }

      const newEntry = (supaData && supaData.id) ? {
        ...supaData,
        id: Number(supaData.id),
        jahr: Number(supaData.jahr),
        betrag: Number(supaData.betrag)
      } : {
        id: Date.now() + i,
        ...insertPayload
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

  // Automatische Verbund-Erkennung beim Drucken:
  // Wenn ein einzelner Eintrag gedruckt wird, der auf a, b, c endet:
  if (entries.length === 1) {
    const singleEntry = entries[0];
    const baseBeleg = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(singleEntry.beleg_nr) : singleEntry.beleg_nr;
    if (/[a-z]$/i.test(String(singleEntry.beleg_nr || '').trim())) {
      const siblings = (window._bhJournal || []).filter(j => {
        return Number(j.jahr) === Number(singleEntry.jahr) && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
      });
      if (siblings.length > 1) {
        siblings.sort((a, b) => String(a.beleg_nr).localeCompare(String(b.beleg_nr)));
        entries = siblings;
      }
    }
  }

  const belegNrs = Array.from(new Set(entries.map(e => e.beleg_nr).filter(Boolean)));
  const belegNrDisplay = belegNrs.join(', ') || 'Ohne Belegnummer';
  
  const belegDatum = entries[0].datum ? (typeof isoToDisplay === 'function' ? isoToDisplay(entries[0].datum) : entries[0].datum) : new Date().toLocaleDateString('de-CH');
  const totalAmount = entries.reduce((s, e) => s + (Number(e.betrag) || 0), 0);
  const title = customTitle || (entries.length === 1 ? entries[0].beschreibung : `Kassenabrechnung (${entries.length} Positionen)`);
  
  // Situative Erkennung: Kassen-Einnahme vs. Kassen-Auszahlung
  let cashInflow = 0;
  let cashOutflow = 0;
  entries.forEach(e => {
    const soll = String(e.konto_soll || '').trim();
    const haben = String(e.konto_haben || '').trim();
    const amt = Math.abs(Number(e.betrag) || 0);
    if (soll === '1000' || soll.startsWith('1000')) {
      cashInflow += amt;
    } else if (haben === '1000' || haben.startsWith('1000')) {
      cashOutflow += amt;
    } else if (soll.startsWith('1020') || haben.startsWith('1020')) {
      if (soll.startsWith('1020')) cashInflow += amt;
      if (haben.startsWith('1020')) cashOutflow += amt;
    } else {
      if (haben.startsWith('3')) cashInflow += amt;
      else if (soll.startsWith('4') || soll.startsWith('5') || soll.startsWith('6') || soll.startsWith('7') || soll.startsWith('8')) cashOutflow += amt;
    }
  });
  const isEinnahme = cashInflow >= cashOutflow;
  const belegType = isEinnahme ? 'Kassen-Einnahme' : 'Kassen-Auszahlung';
  const belegTypeRowLabel = isEinnahme ? 'Kassen-Einnahme:' : 'Kassen-Auszahlung:';

  function formatMoney(val) {
    if (typeof fmtChf === 'function') {
      const res = fmtChf(val);
      return String(res).startsWith('CHF') ? res : 'CHF ' + res;
    }
    return 'CHF ' + Number(val || 0).toFixed(2);
  }

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
      <td style="text-align: right; font-weight: bold; white-space: nowrap; width: 110px;">${formatMoney(e.betrag)}</td>
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
      <title>${belegType}_${belegNrs[0] || 'Druck'}</title>
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
        @media print {
          body { padding: 10px; font-size: 12px; }
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
          <div class="doc-title">${escapeHtml(belegType)}</div>
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
          <div class="meta-value" style="color: #0b5ed7; font-size: 16px;">${formatMoney(totalAmount)}</div>
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
            <td colspan="5" style="text-align: right; text-transform: uppercase;">${escapeHtml(belegTypeRowLabel)}</td>
            <td style="text-align: right; color: #0b5ed7;">${formatMoney(totalAmount)}</td>
          </tr>
        </tbody>
      </table>

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
    konto_soll:   window.bhKontoResolveCode(document.getElementById('bhe-soll').value),
    konto_haben:  window.bhKontoResolveCode(document.getElementById('bhe-haben').value),
    betrag:       Number(document.getElementById('bhe-betrag').value),
    typ:          document.getElementById('bhe-typ').value
  };
  
  if (!payload.konto_soll && !payload.konto_haben) {
    alert("❌ Fehler: Mindestens ein Konto (Soll oder Haben) muss angegeben werden!");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchung speichern';
    }
    return;
  }
  if (payload.konto_soll && payload.konto_haben && payload.konto_soll === payload.konto_haben) {
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
    let savedEntry = null;

    // 1. Supabase-First Write
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
    if (supa) {
      try {
        const jObj = {
          jahr: Number(payload.jahr || new Date().getFullYear()),
          datum: payload.datum || new Date().toISOString().slice(0, 10),
          beleg_nr: payload.beleg_nr || '',
          beschreibung: payload.beschreibung || '',
          konto_soll: payload.konto_soll,
          konto_haben: payload.konto_haben,
          betrag: Number(payload.betrag || 0),
          typ: payload.typ || 'Kassa',
          buchungstyp: (typeof getBuchungstyp === 'function') ? getBuchungstyp(payload.konto_soll, payload.konto_haben) : 'TRANSIT'
        };
        if (payload.id) {
          jObj.id = Number(payload.id);
          const { data, error } = await supa.from('accounting_journal').update(jObj).eq('id', jObj.id).select().single();
          if (!error && data) savedEntry = data;
        } else {
          const { data, error } = await supa.from('accounting_journal').insert(jObj).select().single();
          if (!error && data) {
            savedEntry = data;
            payload.id = data.id;
          }
        }
      } catch (supaErr) {
        console.warn("⚠️ Supabase saveJournalEntry Warning:", supaErr);
      }
    }

    // Supabase ist Single Source of Truth

    showSuccess(payload.id ? "🎉 Buchungssatz erfolgreich aktualisiert!" : "🎉 Buchungssatz erfolgreich im Journal registriert!");
    
    const modalEl = document.getElementById('bhModalNewEntry');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
    
    if (!savedEntry) {
      savedEntry = {
        ...payload,
        id: payload.id || Date.now()
      };
    }

    if (payload.id) {
      const idx = window._bhJournal.findIndex(j => Number(j.id) === Number(savedEntry.id));
      if (idx !== -1) {
        window._bhJournal[idx] = savedEntry;
      }
    } else {
      window._bhJournal.unshift(savedEntry);
    }
    recalculateLiveAccountBalances();
    updateAccountingKPIs();
    renderActiveAccountingTab();
    
    if (printAfter) {
      bhPrintJournalBeleg([savedEntry]);
    }

    setTimeout(async () => {
      await loadBuchhaltungData(true, true);
    }, 1500);
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
  const entry = (window._bhJournal || []).find(j => Number(j.id) === Number(entryId));
  if (!entry) return;

  const baseBeleg = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(entry.beleg_nr) : entry.beleg_nr;
  const isSplitRow = /[a-z]$/i.test(String(entry.beleg_nr || '').trim());
  const splitSiblings = isSplitRow ? (window._bhJournal || []).filter(j => {
    return Number(j.jahr) === Number(entry.jahr) && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
  }) : [];

  if (splitSiblings.length > 1) {
    bhOpenDeleteSplitModal(entry, splitSiblings);
    return;
  }

  const conf = confirm(`⚠️ Buchungssatz löschen?\n\nMöchten Sie den Buchungssatz (ID: ${entryId}) wirklich unwiderruflich aus dem Journal löschen?\n\nBeleg: ${entry.beleg_nr}\nBetrag: ${typeof fmtChf === 'function' ? fmtChf(entry.betrag) : 'CHF ' + Number(entry.betrag).toFixed(2)}\nText: ${entry.beschreibung}`);
  if (!conf) return;

  await bhExecuteDeleteJournalDirect(entryId);
};

window.bhExecuteDeleteJournalDirect = async function(entryId) {
  try {
    // 1. Supabase-First Delete
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
    if (supa) {
      try {
        await supa.from('accounting_journal').delete().eq('id', Number(entryId));
      } catch (supaErr) {
        console.warn("⚠️ Supabase deleteJournalEntry Warning:", supaErr);
      }
    }

    // Supabase ist Single Source of Truth

    showSuccess("🎉 Buchungssatz erfolgreich aus dem Journal gelöscht!");
    
    window._bhJournal = (window._bhJournal || []).filter(j => Number(j.id) !== Number(entryId));
    recalculateLiveAccountBalances();
    updateAccountingKPIs();
    renderActiveAccountingTab();
    
    setTimeout(async () => {
      await loadBuchhaltungData(true, true);
    }, 1500);
  } catch (err) {
    alert("❌ Fehler beim Löschen der Buchung: " + err.message);
  }
};

// =====================================================================
// SPLIT-VERBUND: LÖSCH-MODAL & SAMMEL-LÖSCHUNG
// =====================================================================
window.bhOpenDeleteSplitModal = function(entry, splitSiblings) {
  let modalEl = document.getElementById('bhModalDeleteSplit');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalDeleteSplit';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  const baseBeleg = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(entry.beleg_nr) : entry.beleg_nr;
  const totalSum = splitSiblings.reduce((s, j) => s + (Number(j.betrag) || 0), 0);

  const rowsHtml = splitSiblings.map((s, idx) => `
    <tr class="${s.id === entry.id ? 'table-warning fw-bold' : ''}">
      <td class="font-monospace small">${escapeHtml(s.beleg_nr)}</td>
      <td class="small">${escapeHtml(s.beschreibung)}</td>
      <td class="small text-muted">${s.konto_soll} &rarr; ${s.konto_haben}</td>
      <td class="text-end small fw-bold">${typeof fmtChf === 'function' ? fmtChf(s.betrag) : 'CHF ' + Number(s.betrag).toFixed(2)}</td>
      <td class="text-center small">${s.id === entry.id ? '<span class="badge bg-warning text-dark">Ausgewählt</span>' : ''}</td>
    </tr>
  `).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content shadow-lg border-0 rounded-4">
        <div class="modal-header bg-danger text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-exclamation-triangle me-2"></i>Split-Buchung löschen (${escapeHtml(baseBeleg)})
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <p class="text-dark mb-2">
            Die ausgewählte Zeile <strong>${escapeHtml(entry.beleg_nr)}</strong> ist Teil eines 
            <strong>Beleg-Verbunds mit ${splitSiblings.length} Positionen</strong>:
          </p>

          <div class="table-responsive border rounded-3 mb-3 bg-white">
            <table class="table table-sm align-middle mb-0">
              <thead class="table-light small">
                <tr>
                  <th>Beleg-Nr</th>
                  <th>Beschreibung</th>
                  <th>Soll &rarr; Haben</th>
                  <th class="text-end">Betrag</th>
                  <th style="width: 80px;"></th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div class="alert alert-warning py-2.5 px-3 small rounded-3 mb-0">
            <i class="fas fa-info-circle me-1"></i>
            <strong>Empfehlung:</strong> Löschen Sie in der Regel den <strong>gesamten Beleg-Verbund</strong>, um verwaiste Buchungssätze zu vermeiden. Bei Bank-Splits wird die Banktransaktion danach im Bankabgleich wieder zur erneuten Buchung freigegeben.
          </div>
        </div>
        <div class="modal-footer bg-light flex-wrap gap-2">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
          <button type="button" class="btn btn-outline-danger" onclick="bhExecuteDeleteJournalSingleDirect(${entry.id})">
            Nur Zeile ${escapeHtml(entry.beleg_nr)} löschen
          </button>
          <button type="button" class="btn btn-danger fw-bold" onclick="bhExecuteDeleteSplitGroup('${escapeHtml(baseBeleg)}', ${entry.jahr})">
            <i class="fas fa-trash-alt me-1"></i>Gesamten Beleg-Verbund löschen (${splitSiblings.length} Positionen)
          </button>
        </div>
      </div>
    </div>
  `;

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
};

window.bhExecuteDeleteJournalSingleDirect = async function(entryId) {
  const modalEl = document.getElementById('bhModalDeleteSplit');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }
  await bhExecuteDeleteJournalDirect(entryId);
};

window.bhExecuteDeleteSplitGroup = async function(baseBeleg, year) {
  const modalEl = document.getElementById('bhModalDeleteSplit');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }

  const siblings = (window._bhJournal || []).filter(j => {
    return Number(j.jahr) === Number(year) && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
  });

  if (siblings.length === 0) return;

  try {
    // 1. Supabase Delete
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
    if (supa) {
      try {
        await supa.from('accounting_journal').delete().in('id', siblings.map(s => Number(s.id)));
      } catch (supaErr) {
        console.warn("⚠️ Supabase delete split group Warning:", supaErr);
      }
    }

    // Supabase ist Single Source of Truth
    window._bhJournal = (window._bhJournal || []).filter(j => !siblings.some(s => Number(s.id) === Number(j.id)));

    // Falls es ein Bank-Split war: Prüfe ob eine CAMT-Transaktion wieder entkoppelt werden kann
    if (window._bhBankMatchResults && window._bhBankMatchResults.length > 0) {
      window._bhBankMatchResults.forEach(tx => {
        if (tx.matchedBeleg && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(tx.matchedBeleg) === baseBeleg : tx.matchedBeleg.startsWith(baseBeleg))) {
          tx.alreadyBooked = false;
          delete tx.bookedDate;
        }
      });
      if (typeof bhBankRenderResults === 'function' && window._bhBankActiveFilter) {
        bhBankRenderResults(window._bhBankActiveFilter);
      }
    }

    if (typeof showSuccess === 'function') {
      showSuccess(`🎉 Alle ${siblings.length} Positionen des Belegs ${baseBeleg} wurden gelöscht!`);
    }

    recalculateLiveAccountBalances();
    updateAccountingKPIs();
    renderActiveAccountingTab();

    setTimeout(async () => {
      if (typeof loadBuchhaltungData === 'function') await loadBuchhaltungData(true, true);
    }, 1500);
  } catch (err) {
    alert('❌ Fehler beim Löschen des Split-Verbunds: ' + err.message);
  }
};

// =====================================================================
// SPLIT-VERBUND: GEMEINSAMES BEARBEITEN ALLER ZEILEN
// =====================================================================
window.bhOpenSplitGroupEditModal = function(baseBeleg, year) {
  const entryModalEl = document.getElementById('bhModalNewEntry');
  if (entryModalEl) {
    const bsEntryModal = bootstrap.Modal.getInstance(entryModalEl);
    if (bsEntryModal) bsEntryModal.hide();
  }

  const y = Number(year || window._bhYear || new Date().getFullYear());
  const siblings = (window._bhJournal || []).filter(j => {
    return Number(j.jahr) === y && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
  });
  siblings.sort((a, b) => String(a.beleg_nr).localeCompare(String(b.beleg_nr)));

  if (siblings.length === 0) {
    alert(`Keine Buchungssätze für den Beleg ${baseBeleg} gefunden.`);
    return;
  }

  window._bhCurrentSplitEdit = {
    baseBeleg,
    year: y,
    datum: siblings[0].datum,
    rows: siblings.map(s => ({
      id: s.id,
      beleg_nr: s.beleg_nr,
      beschreibung: s.beschreibung,
      konto_soll: s.konto_soll,
      konto_haben: s.konto_haben,
      betrag: s.betrag,
      typ: s.typ || 'Kassa'
    })),
    deletedIds: []
  };

  let modalEl = document.getElementById('bhModalSplitGroupEdit');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalSplitGroupEdit';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-centered">
      <div class="modal-content shadow-lg border-0 rounded-4">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-layer-group me-2"></i>Split-Verbund bearbeiten (${escapeHtml(baseBeleg)})
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <div class="alert bg-light border-start border-4 border-primary shadow-sm mb-3">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <strong>Belegstamm:</strong> <span class="font-monospace fw-bold text-primary">${escapeHtml(baseBeleg)}</span> &middot;
                <strong>Datum:</strong> ${escapeHtml(siblings[0].datum || '')} &middot;
                <strong>Jahr:</strong> ${y}
              </div>
              <div>
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="bhAddSplitGroupEditRow()">
                  <i class="fas fa-plus me-1"></i>Position hinzufügen
                </button>
              </div>
            </div>
          </div>

          <div class="table-responsive border rounded-3 mb-3 bg-white" style="max-height: 360px;">
            <table class="table table-sm align-middle table-bordered mb-0">
              <thead class="table-light small">
                <tr>
                  <th style="width: 35px;" class="text-center">#</th>
                  <th style="width: 140px;">Beleg-Nr</th>
                  <th>Beschreibung / Buchungstext</th>
                  <th style="width: 200px;">Soll-Konto</th>
                  <th style="width: 200px;">Haben-Konto</th>
                  <th style="width: 130px;" class="text-end">Betrag (CHF)</th>
                  <th style="width: 40px;"></th>
                </tr>
              </thead>
              <tbody id="bh-sge-tbody">
                <!-- Dynamische Zeilen via bhRenderSplitGroupEditRows -->
              </tbody>
            </table>
          </div>

          <div class="card p-3 bg-light border-0 rounded-3" id="bh-sge-balance-card">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span class="fw-bold text-dark"><i class="fas fa-calculator me-1.5 text-primary"></i>Status Split-Verbund:</span>
                <span id="bh-sge-summary-text" class="small text-muted ms-2"></span>
              </div>
              <div class="fs-6 fw-bold" id="bh-sge-total-display">
                Total: CHF 0.00
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer bg-light flex-wrap gap-2">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
          <button type="button" class="btn btn-success fw-bold px-3" id="bh-sge-save-btn" onclick="bhSaveSplitGroupEdit(false)">
            <i class="fas fa-save me-1"></i>Änderungen im Verbund speichern
          </button>
          <button type="button" class="btn btn-primary fw-bold px-3" id="bh-sge-save-print-btn" onclick="bhSaveSplitGroupEdit(true)">
            <i class="fas fa-print me-1"></i>Speichern & Beleg neu drucken
          </button>
        </div>
      </div>
    </div>
  `;

  bhRenderSplitGroupEditRows();
  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
};

window.bhRenderSplitGroupEditRows = function() {
  const tbody = document.getElementById('bh-sge-tbody');
  if (!tbody || !window._bhCurrentSplitEdit) return;

  const { baseBeleg, rows } = window._bhCurrentSplitEdit;

  tbody.innerHTML = rows.map((r, i) => {
    const subSuffix = rows.length > 1 ? String.fromCharCode(97 + i) : '';
    const belegDisplay = `${baseBeleg}${subSuffix}`;
    const amt = (r.betrag !== undefined && r.betrag !== null) ? r.betrag : '';

    return `
      <tr>
        <td class="text-center fw-bold small text-muted">${i + 1}</td>
        <td class="font-monospace small fw-bold text-secondary">${escapeHtml(belegDisplay)}</td>
        <td>
          <input type="text" class="form-control form-control-sm" id="bh-sge-desc-${i}" value="${escapeHtml(r.beschreibung || '')}" placeholder="Beschreibung..." oninput="bhUpdateSplitGroupLiveTotal()">
        </td>
        <td>
          <div class="bh-konto-ac-wrap">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-sge-soll-${i}" value="${r.konto_soll ? window.bhKontoFormatDisplay(r.konto_soll) : ''}" placeholder="Soll-Konto suchen..." autocomplete="off">
          </div>
        </td>
        <td>
          <div class="bh-konto-ac-wrap">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-sge-haben-${i}" value="${r.konto_haben ? window.bhKontoFormatDisplay(r.konto_haben) : ''}" placeholder="Haben-Konto suchen..." autocomplete="off">
          </div>
        </td>
        <td>
          <input type="number" step="0.01" min="0.01" class="form-control form-control-sm text-end fw-bold" id="bh-sge-amt-${i}" value="${amt}" placeholder="0.00" oninput="bhUpdateSplitGroupLiveTotal()">
        </td>
        <td class="text-center">
          ${rows.length > 1 ? `<button type="button" class="btn btn-sm btn-outline-danger py-0 px-1.5" onclick="bhRemoveSplitGroupEditRow(${i})"><i class="fas fa-times"></i></button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  // Autocomplete initialisieren für Soll/Haben Inputs
  setTimeout(() => bhInitKontoAutocompleteForContainer(tbody), 30);

  bhUpdateSplitGroupLiveTotal();
};

window.bhSyncSplitGroupFromInputs = function() {
  if (!window._bhCurrentSplitEdit) return;
  const rows = window._bhCurrentSplitEdit.rows || [];

  rows.forEach((r, i) => {
    const descEl = document.getElementById(`bh-sge-desc-${i}`);
    const sollEl = document.getElementById(`bh-sge-soll-${i}`);
    const habenEl = document.getElementById(`bh-sge-haben-${i}`);
    const amtEl = document.getElementById(`bh-sge-amt-${i}`);

    if (descEl) r.beschreibung = descEl.value;
    if (sollEl) r.konto_soll = window.bhKontoResolveCode(sollEl.value);
    if (habenEl) r.konto_haben = window.bhKontoResolveCode(habenEl.value);
    if (amtEl) r.betrag = amtEl.value;
  });
};

window.bhAddSplitGroupEditRow = function() {
  bhSyncSplitGroupFromInputs();
  if (!window._bhCurrentSplitEdit) return;
  const { rows, baseBeleg, datum } = window._bhCurrentSplitEdit;
  const template = rows[rows.length - 1] || {};
  rows.push({
    beschreibung: '',
    konto_soll: template.konto_soll || '',
    konto_haben: template.konto_haben || '',
    betrag: '',
    typ: template.typ || 'Kassa',
    datum: datum
  });
  bhRenderSplitGroupEditRows();
};

window.bhRemoveSplitGroupEditRow = function(idx) {
  bhSyncSplitGroupFromInputs();
  if (!window._bhCurrentSplitEdit) return;
  const { rows, deletedIds } = window._bhCurrentSplitEdit;
  if (rows.length > 1) {
    const removed = rows.splice(idx, 1)[0];
    if (removed && removed.id) {
      deletedIds.push(removed.id);
    }
  }
  bhRenderSplitGroupEditRows();
};

window.bhUpdateSplitGroupLiveTotal = function() {
  bhSyncSplitGroupFromInputs();
  if (!window._bhCurrentSplitEdit) return;
  const { rows, baseBeleg } = window._bhCurrentSplitEdit;

  let totalSum = 0;
  let count = 0;
  rows.forEach(r => {
    const a = parseFloat(r.betrag);
    if (!isNaN(a) && a > 0) {
      totalSum += a;
      count++;
    }
  });

  const totalEl = document.getElementById('bh-sge-total-display');
  if (totalEl) totalEl.innerHTML = `Total Beleg: <span class="text-primary font-monospace">CHF ${typeof fmtChf === 'function' ? fmtChf(totalSum) : totalSum.toFixed(2)}</span>`;

  const summaryEl = document.getElementById('bh-sge-summary-text');
  if (summaryEl) {
    summaryEl.textContent = `${rows.length} Position(en) im Verbund`;
  }
};

window.bhSaveSplitGroupEdit = async function(printAfter = false) {
  bhSyncSplitGroupFromInputs();
  const splitState = window._bhCurrentSplitEdit;
  if (!splitState) return;

  const { baseBeleg, year, rows, deletedIds } = splitState;
  const validRows = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const amt = parseFloat(r.betrag);
    if (!r.beschreibung.trim()) {
      alert(`Bitte Beschreibung für Zeile #${i + 1} eingeben.`);
      return;
    }
    if (!r.konto_soll || !r.konto_haben) {
      alert(`Bitte Soll- und Haben-Konto für Zeile #${i + 1} angeben.`);
      return;
    }
    if (r.konto_soll === r.konto_haben) {
      alert(`Soll- und Haben-Konto für Zeile #${i + 1} dürfen nicht identisch sein.`);
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      alert(`Bitte Betrag > 0 für Zeile #${i + 1} eingeben.`);
      return;
    }
    validRows.push({ ...r, betrag: amt });
  }

  if (validRows.length === 0) {
    alert('Der Split-Verbund muss mindestens eine gültige Zeile enthalten.');
    return;
  }

  const saveBtn = document.getElementById('bh-sge-save-btn');
  const printBtn = document.getElementById('bh-sge-save-print-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Speichere Verbund...';
  }
  if (printBtn) printBtn.disabled = true;

  try {
    // 1. Supabase-First Sync
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
    if (supa) {
      try {
        if (deletedIds && deletedIds.length > 0) {
          await supa.from('accounting_journal').delete().in('id', deletedIds.map(Number));
        }
        for (let i = 0; i < validRows.length; i++) {
          const vr = validRows[i];
          const subSuffix = validRows.length > 1 ? String.fromCharCode(97 + i) : '';
          const belegNr = `${baseBeleg}${subSuffix}`;
          const jRow = {
            jahr: Number(year || new Date().getFullYear()),
            datum: vr.datum || new Date().toISOString().slice(0, 10),
            beleg_nr: belegNr,
            beschreibung: vr.beschreibung,
            konto_soll: vr.konto_soll,
            konto_haben: vr.konto_haben,
            betrag: Number(vr.betrag || 0),
            typ: vr.typ || 'Kassa',
            buchungstyp: (typeof getBuchungstyp === 'function') ? getBuchungstyp(vr.konto_soll, vr.konto_haben) : 'TRANSIT'
          };
          if (vr.id) {
            jRow.id = Number(vr.id);
            await supa.from('accounting_journal').upsert(jRow, { onConflict: 'id' });
          } else {
            await supa.from('accounting_journal').insert(jRow);
          }
        }
      } catch (supaErr) {
        console.warn("⚠️ Supabase saveSplitGroupEdit Warning:", supaErr);
      }
    }

    // Supabase ist Single Source of Truth
    for (let i = 0; i < validRows.length; i++) {
      const vr = validRows[i];
      const subSuffix = validRows.length > 1 ? String.fromCharCode(97 + i) : '';
      const belegNr = `${baseBeleg}${subSuffix}`;
      const savedItem = {
        id: vr.id || Date.now() + i,
        jahr: Number(year || new Date().getFullYear()),
        datum: vr.datum || new Date().toISOString().split('T')[0],
        beleg_nr: belegNr,
        beschreibung: vr.beschreibung,
        konto_soll: vr.konto_soll,
        konto_haben: vr.konto_haben,
        betrag: Number(vr.betrag || 0),
        typ: vr.typ || 'Kassa'
      };
      
      if (vr.id) {
        const idx = (window._bhJournal || []).findIndex(j => Number(j.id) === Number(vr.id));
        if (idx !== -1) window._bhJournal[idx] = savedItem;
        else window._bhJournal.push(savedItem);
      } else {
        window._bhJournal.push(savedItem);
      }
      updatedEntries.push(savedItem);
    }

    if (typeof showSuccess === 'function') {
      showSuccess(`🎉 Split-Verbund ${baseBeleg} (${updatedEntries.length} Zeilen) erfolgreich aktualisiert!`);
    }

    const modalEl = document.getElementById('bhModalSplitGroupEdit');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    }

    recalculateLiveAccountBalances();
    updateAccountingKPIs();
    renderActiveAccountingTab();

    if (printAfter && updatedEntries.length > 0) {
      bhPrintJournalBeleg(updatedEntries, `Abrechnung ${baseBeleg}`);
    }

    setTimeout(async () => {
      if (typeof loadBuchhaltungData === 'function') await loadBuchhaltungData(true, true);
    }, 1500);

  } catch (err) {
    alert('❌ Fehler beim Speichern des Split-Verbunds: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save me-1"></i> Änderungen im Verbund speichern';
    }
    if (printBtn) {
      printBtn.disabled = false;
      printBtn.innerHTML = '<i class="fas fa-print me-1"></i> Speichern & Beleg neu drucken';
    }
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
      <td class="text-end fw-bold font-monospace small" style="white-space: nowrap;">${fmtChf(e.betrag)}</td>
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
                <strong>${fmtChf(totalAmount)}</strong> wirklich endgültig aus dem Kassabuch-Journal entfernen?
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
              <span class="badge bg-secondary font-monospace fs-6 px-3 py-1.5">${fmtChf(totalAmount)}</span>
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

    // 1. Supabase-First Batch Delete
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
    if (supa) {
      try {
        const { error: supaDelErr } = await supa.from('accounting_journal').delete().in('id', ids);
        if (supaDelErr) console.warn("⚠️ Supabase batch delete Warning:", supaDelErr.message);
        else success = true;
      } catch (sErr) {
        console.warn("⚠️ Supabase batch delete Exception:", sErr);
      }
    }

    // Supabase ist Single Source of Truth

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

  // Farbgebung: Die "reduzierende" Seite wird rot dargestellt
  // Aktiv/Aufwand: Soll = normal (primary), Haben = rot (danger) → Ausgabe/Abnahme
  // Passiv/Ertrag: Haben = normal (success), Soll = rot (danger) → Abnahme
  const sollColorClass = isAssetOrExpense ? 'text-primary' : 'text-danger';
  const habenColorClass = isAssetOrExpense ? 'text-danger' : 'text-success';

  const rowsHtml = computedEntries.map(entry => {
    return `
      <tr class="bh-account-row" onclick="this.classList.toggle('bh-row-selected')" title="Klicken zum dauerhaften Hervorheben dieser Zeile">
        <td class="font-monospace small text-muted tk-col-id">${entry.id}</td>
        <td class="tk-col-datum"><span class="fw-semibold">${window.isoToDisplay ? window.isoToDisplay(entry.datum) : entry.datum}</span></td>
        <td class="tk-col-beleg"><span class="badge bg-light text-dark border font-monospace" style="font-size:11px;" title="Klicken zum Kopieren" onclick="event.stopPropagation(); navigator.clipboard.writeText('${entry.beleg_nr || ''}'); window.showToast ? window.showToast('Beleg-Nr kopiert: ${entry.beleg_nr || ''}', 'info') : null;">${entry.beleg_nr || '–'}</span></td>
        <td class="small fw-semibold text-dark tk-col-beschreibung">${window.escapeHtml ? window.escapeHtml(entry.beschreibung) : entry.beschreibung}</td>
        <td class="tk-col-gegenkonto">
          <span class="bh-konto-badge">${entry.gegenKonto}</span>
          <span class="text-muted ms-1 small d-none d-md-inline">${entry.gegenKontoName || ''}</span>
        </td>
        <td class="text-end fw-semibold ${sollColorClass} tk-col-soll">${entry.sollVal > 0 ? window.fmtChf(entry.sollVal) : '–'}</td>
        <td class="text-end fw-semibold ${habenColorClass} tk-col-haben">${entry.habenVal > 0 ? window.fmtChf(entry.habenVal) : '–'}</td>
        <td class="text-end fw-bold text-dark tk-col-saldo">${window.fmtChf(entry.runningBalance)}</td>
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
            <div class="col-lg-5">
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
            <div class="col-lg-3 text-lg-end d-flex align-items-center justify-content-lg-end gap-2 flex-wrap">
              <div id="bh-kontoauszug-col-toggle" class="d-inline-block"></div>
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
                <div class="small text-muted fw-semibold ${sollColorClass}" style="font-size: 11px;">Total Soll (+)</div>
                <h5 class="fw-bold mt-1 mb-0 ${sollColorClass}">${window.fmtChf(totalSoll)}</h5>
              </div>
            </div>
            <div class="col-sm-3">
              <div class="p-2.5 bg-white border border-light rounded-3 text-center shadow-sm">
                <div class="small text-muted fw-semibold ${habenColorClass}" style="font-size: 11px;">Total Haben (-)</div>
                <h5 class="fw-bold mt-1 mb-0 ${habenColorClass}">${window.fmtChf(totalHaben)}</h5>
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
            <table id="bh-kontoauszug-modal-table" class="table table-hover align-middle bh-table mb-0">
              <thead class="table-light sticky-top" style="z-index: 2;">
                <tr>
                  <th class="tk-col-id" data-col-id="id" data-col-name="ID" style="width: 65px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('id')" title="Klicken zum Sortieren nach ID">
                    ID ${sortIndicator('id')}
                  </th>
                  <th class="tk-col-datum" data-col-id="datum" data-col-name="Datum" style="width: 115px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('datum')" title="Klicken zum Sortieren nach Datum">
                    Datum ${sortIndicator('datum')}
                  </th>
                  <th class="tk-col-beleg" data-col-id="beleg" data-col-name="Beleg-Nr" style="width: 130px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('beleg')" title="Klicken zum Sortieren nach Beleg-Nr">
                    Beleg-Nr ${sortIndicator('beleg')}
                  </th>
                  <th class="tk-col-beschreibung" data-col-id="beschreibung" data-col-name="Beschreibung" style="cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('beschreibung')" title="Klicken zum Sortieren nach Beschreibung">
                    Beschreibung ${sortIndicator('beschreibung')}
                  </th>
                  <th class="tk-col-gegenkonto" data-col-id="gegenkonto" data-col-name="Gegenkonto" style="width: 220px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('gegenkonto')" title="Klicken zum Sortieren nach Gegenkonto">
                    Gegenkonto ${sortIndicator('gegenkonto')}
                  </th>
                  <th class="text-end tk-col-soll" data-col-id="soll" data-col-name="Soll" style="width: 120px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('soll')" title="Klicken zum Sortieren nach Soll">
                    Soll ${sortIndicator('soll')}
                  </th>
                  <th class="text-end tk-col-haben" data-col-id="haben" data-col-name="Haben" style="width: 120px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('haben')" title="Klicken zum Sortieren nach Haben">
                    Haben ${sortIndicator('haben')}
                  </th>
                  <th class="text-end tk-col-saldo" data-col-id="saldo" data-col-name="Saldo" style="width: 140px; cursor: pointer; user-select: none;" onclick="bhSortKontoauszug('saldo')" title="Klicken zum Sortieren nach Saldo">
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
                  <td class="text-end fw-bold ${sollColorClass}">${window.fmtChf(totalSoll)}</td>
                  <td class="text-end fw-bold ${habenColorClass}">${window.fmtChf(totalHaben)}</td>
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

  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
    window.TableKit.setupColumnToggle('#bh-kontoauszug-modal-table', {
      container: '#bh-kontoauszug-col-toggle',
      storageKey: 'bh_kontoauszug_cols'
    });
  }
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
        <td class="font-monospace fw-bold text-primary tk-col-konto" style="width: 80px;" data-col-id="konto">${acc.konto}</td>
        <td class="tk-col-bezeichnung" data-col-id="bezeichnung">
          <div class="fw-bold text-dark">${window.escapeHtml ? window.escapeHtml(acc.bezeichnung) : acc.bezeichnung}</div>
          <span class="badge ${badgeClass} opacity-75" style="font-size:10px;">${cat.main}</span>
        </td>
        <td class="text-end fw-semibold text-muted font-monospace tk-col-prev-actual" data-col-id="prev-actual">${window.fmtChf(prevActual)}</td>
        <td class="text-end fw-semibold text-secondary font-monospace tk-col-prev-budget" data-col-id="prev-budget">${prevBudget > 0 ? window.fmtChf(prevBudget) : '–'}</td>
        <td class="tk-col-curr-budget" data-col-id="curr-budget" style="width: 200px;">
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
          <!-- Toolbar with Quick Copy buttons and Column Toggle -->
          <div class="p-3 bg-light rounded-3 border mb-4 d-flex justify-content-between align-items-center flex-wrap" style="gap: 10px;">
            <div class="d-flex align-items-center" style="gap: 10px;">
              <i class="fas fa-magic text-primary"></i>
              <span class="small fw-semibold text-dark">Schnell-Übernahme von Vorjahreswerten (${prevYear}):</span>
            </div>
            <div class="d-flex align-items-center flex-wrap" style="gap: 8px;">
              <button class="btn btn-sm btn-outline-primary fw-bold shadow-sm" onclick="bhCopyBudgetFromPrevActual()">
                <i class="fas fa-copy me-1"></i> Vorjahres-Ist (${prevYear}) kopieren
              </button>
              <button class="btn btn-sm btn-outline-secondary fw-bold shadow-sm" onclick="bhCopyBudgetFromPrevBudget()">
                <i class="fas fa-history me-1"></i> Vorjahres-Budget (${prevYear}) kopieren
              </button>
              <div id="bh-budget-matrix-col-toggle" class="d-inline-block"></div>
            </div>
          </div>

          <!-- Table matrix -->
          <div class="table-responsive" style="max-height: 480px;">
            <table class="table table-hover align-middle bh-table mb-0" id="bh-budget-matrix-table">
              <thead>
                <tr>
                  <th data-col-id="konto" class="tk-col-konto" style="width: 80px;">Konto</th>
                  <th data-col-id="bezeichnung" class="tk-col-bezeichnung">Bezeichnung / Klasse</th>
                  <th data-col-id="prev-actual" class="tk-col-prev-actual text-end" style="width: 150px;">Vorjahres-Ist (${prevYear})</th>
                  <th data-col-id="prev-budget" class="tk-col-prev-budget text-end" style="width: 150px;">Vorjahres-Budget (${prevYear})</th>
                  <th data-col-id="curr-budget" class="tk-col-curr-budget text-end" style="width: 200px;">Budget (${currentYear})</th>
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

  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
    setTimeout(() => {
      window.TableKit.setupColumnToggle('#bh-budget-matrix-table', {
        container: document.getElementById('bh-budget-matrix-col-toggle'),
        storageKey: 'tk_cols_bh_budget_matrix'
      });
    }, 50);
  }
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
    const records = [];
    inputs.forEach(inp => {
      const kCode = inp.getAttribute('data-konto');
      const val = Number(inp.value || 0);
      records.push({
        konto: kCode,
        jahr: parseInt(currentYear, 10),
        betrag: val,
        updated_at: new Date().toISOString()
      });
    });

    const sb = window.getBuchhaltungSupabaseClient ? window.getBuchhaltungSupabaseClient() : null;
    if (sb) {
      const { error: sbErr } = await sb.from('accounting_budgets').upsert(records, { onConflict: 'konto,jahr' });
      if (sbErr) {
        console.warn('[Buchhaltung] Supabase budget upsert error:', sbErr);
      } else {
        successCount = records.length;
      }
    }

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

