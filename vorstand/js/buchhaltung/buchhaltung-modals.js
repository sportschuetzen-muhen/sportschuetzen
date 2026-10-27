// =====================================================================
// MODUL: BUCHHALTUNG & KMU-FINANZBERICHTE - MODALS & ACTIONS
// =====================================================================

// KONTENRAHMEN-EDITOR: MODAL ERSTELLEN ODER BEARBEITEN
window.bhOpenKontoModal = function(kontoCode, rowIndex = null) {
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('buchhaltung')) {
    alert("Keine Berechtigung zum Bearbeiten von Konten.");
    return;
  }
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
    .bh-konto-ac-wrap { position: relative; width: 100%; }
    .bh-konto-ac-dropdown {
      position: fixed; z-index: 99999; min-width: 340px; max-width: 460px; max-height: 290px;
      overflow-y: auto; background: #fff; border: 1px solid rgba(0,0,0,.18);
      border-radius: 0.6rem; box-shadow: 0 12px 32px rgba(0,0,0,.22);
      display: none;
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
  if (!acc) return c;
  if (window.TableKit && typeof window.TableKit.cleanKontoDisplay === 'function') {
    return window.TableKit.cleanKontoDisplay(acc.konto, acc.bezeichnung).display;
  }
  const cleanBezeichnung = String(acc.bezeichnung || '').replace(/\s*\bCH\d{2}[\s0-9A-Z]{12,}\b/gi, '').trim();
  return cleanBezeichnung ? `${acc.konto} | ${cleanBezeichnung}` : String(acc.konto);
};

// Initialisiert Autocomplete für alle .bh-konto-ac-input Felder innerhalb eines Containers
window.bhInitKontoAutocompleteForContainer = function(container) {
  if (!container) return;
  const inputs = container.querySelectorAll('input.bh-konto-ac-input');
  inputs.forEach(input => {
    // Dropdown-Container erstellen falls nicht vorhanden
    let dropdown = input.dataset.dropdownId ? document.getElementById(input.dataset.dropdownId) : null;
    if (!dropdown) {
      const dropId = 'bh-drop-' + Math.random().toString(36).substring(2, 9);
      input.dataset.dropdownId = dropId;
      dropdown = document.createElement('div');
      dropdown.id = dropId;
      dropdown.className = 'bh-konto-ac-dropdown';
      document.body.appendChild(dropdown);
    }

    let activeIdx = -1;
    let currentMatches = [];

    const isAufwandField = (input.id.includes('konto') || (input.placeholder || '').toLowerCase().includes('aufwand'));
    const isErtragField = ((input.placeholder || '').toLowerCase().includes('ertrag'));

    const updatePos = () => {
      if (!dropdown || !dropdown.classList.contains('show')) return;
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 290;
      dropdown.style.left = Math.max(5, rect.left) + 'px';
      dropdown.style.minWidth = Math.max(rect.width, 340) + 'px';
      dropdown.style.zIndex = '99999';

      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        // Nach oben öffnen wenn unten zu wenig Platz
        dropdown.style.top = Math.max(5, rect.top - dropdownHeight - 3) + 'px';
      } else {
        dropdown.style.top = (rect.bottom + 3) + 'px';
      }
    };

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
      let q = String(query || '').trim();
      if (q.includes('|')) {
        q = q.split('|')[0].trim();
      }

      let allKonten = window._bhKontenrahmen || [];
      if (isAufwandField) {
        allKonten = [...allKonten].sort((a, b) => {
          const aIs = (a.klasse || '').toLowerCase().includes('aufwand') || String(a.konto).startsWith('4') || String(a.konto).startsWith('6');
          const bIs = (b.klasse || '').toLowerCase().includes('aufwand') || String(b.konto).startsWith('4') || String(b.konto).startsWith('6');
          if (aIs && !bIs) return -1;
          if (!aIs && bIs) return 1;
          return String(a.konto).localeCompare(String(b.konto));
        });
      } else if (isErtragField) {
        allKonten = [...allKonten].sort((a, b) => {
          const aIs = (a.klasse || '').toLowerCase().includes('ertrag') || String(a.konto).startsWith('3');
          const bIs = (b.klasse || '').toLowerCase().includes('ertrag') || String(b.konto).startsWith('3');
          if (aIs && !bIs) return -1;
          if (!aIs && bIs) return 1;
          return String(a.konto).localeCompare(String(b.konto));
        });
      }

      if (!q) {
        currentMatches = allKonten.slice(0, 60);
      } else {
        currentMatches = typeof bhFindMatchingKonten === 'function' ? bhFindMatchingKonten(q) : [];
      }
      activeIdx = -1;

      if (currentMatches.length === 0 && q) {
        dropdown.innerHTML = '<div class="bh-konto-ac-empty"><i class="fas fa-search me-1"></i>Kein Konto gefunden für «' + (typeof escapeHtml === 'function' ? escapeHtml(q) : q) + '»</div>';
        dropdown.classList.add('show');
        updatePos();
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
      updatePos();
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

    input.addEventListener('input', () => {
      input.classList.remove('is-resolved');
      renderDropdown(input.value);
    });

    input.addEventListener('focus', () => {
      input.select();
      renderDropdown('');
    });

    input.addEventListener('click', () => {
      if (!dropdown.classList.contains('show')) {
        input.select();
        renderDropdown('');
      }
    });

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
        if (!input.value.includes('|') && currentMatches.length > 0) {
          const target = activeIdx >= 0 ? currentMatches[activeIdx] : currentMatches[0];
          selectItem(target);
        }
        dropdown.classList.remove('show');
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('show');
      }
    });

    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const item = e.target.closest('.bh-konto-ac-item');
      if (item) {
        const idx = Number(item.dataset.idx);
        if (idx >= 0 && idx < currentMatches.length) {
          selectItem(currentMatches[idx]);
        }
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target) && !e.target.closest?.('.bh-konto-ac-dropdown')) {
        dropdown.classList.remove('show');
      }
    });

    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);

    input.addEventListener('blur', () => {
      setTimeout(() => {
        const val = input.value.trim();
        if (val && !val.includes('|')) {
          const matches = typeof bhFindMatchingKonten === 'function' ? bhFindMatchingKonten(val) : [];
          if (matches.length > 0) {
            input.value = `${matches[0].konto} | ${matches[0].bezeichnung}`;
            input.classList.add('is-resolved');
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, 200);
    });

    if (input.value && input.value.includes('|')) {
      input.classList.add('is-resolved');
    }
  });
};

// =====================================================================
// MITGLIEDER-AUTOCOMPLETE & ISO 20022 PAIN.001 GENERATOR
// =====================================================================
window.bhInitMemberAutocompleteForContainer = function(container) {
  if (!container) return;
  const inputs = container.querySelectorAll('input.bh-member-ac-input');
  inputs.forEach(input => {
    let dropdown = input.dataset.dropdownId ? document.getElementById(input.dataset.dropdownId) : null;
    if (!dropdown) {
      const dropId = 'bh-mdrop-' + Math.random().toString(36).substring(2, 9);
      input.dataset.dropdownId = dropId;
      dropdown = document.createElement('div');
      dropdown.id = dropId;
      dropdown.className = 'bh-konto-ac-dropdown bh-member-ac-dropdown';
      document.body.appendChild(dropdown);
    }
    const prefix = input.id.startsWith('bh-ks') ? 'bh-ks' : 'bhe';

    const updatePos = () => {
      if (!dropdown || !dropdown.classList.contains('show')) return;
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      dropdown.style.left = Math.max(5, rect.left) + 'px';
      dropdown.style.minWidth = Math.max(rect.width, 380) + 'px';
      dropdown.style.zIndex = '99999';
      dropdown.style.top = (rect.bottom + 3) + 'px';
    };

    const renderDropdown = (query) => {
      const q = String(query || '').trim().toLowerCase();
      const members = window._bhMembers || [];
      const matches = members.filter(m => {
        if (!q) return true;
        const fn = String(m.first_name || '').toLowerCase();
        const ln = String(m.last_name || '').toLowerCase();
        const full = `${fn} ${ln}`;
        const pn = String(m.person_number || '');
        return fn.includes(q) || ln.includes(q) || full.includes(q) || pn.includes(q);
      }).slice(0, 30);

      if (matches.length === 0) {
        dropdown.innerHTML = '<div class="bh-konto-ac-empty"><i class="fas fa-user-slash me-1"></i>Kein Mitglied gefunden</div>';
        dropdown.classList.add('show');
        updatePos();
        return;
      }

      dropdown.innerHTML = matches.map(m => {
        const hasIban = Boolean(m.iban && m.iban.trim());
        const addr = [m.street, `${m.post_code || ''} ${m.city || ''}`.trim()].filter(Boolean).join(', ');
        return `
          <div class="bh-konto-ac-item bh-member-item" data-pn="${m.person_number}">
            <div style="flex: 1;">
              <div class="fw-bold">${typeof escapeHtml === 'function' ? escapeHtml(m.first_name) : m.first_name} ${typeof escapeHtml === 'function' ? escapeHtml(m.last_name) : m.last_name} <span class="text-muted small fw-normal font-monospace">#${m.person_number}</span></div>
              ${addr ? `<div class="small text-muted" style="font-size: 11px;">${typeof escapeHtml === 'function' ? escapeHtml(addr) : addr}</div>` : ''}
            </div>
            <span class="badge ${hasIban ? 'bg-success-subtle text-success border border-success' : 'bg-warning-subtle text-dark border border-warning'}" style="font-size: 10px;">
              ${hasIban ? 'IBAN hinterlegt' : 'Keine IBAN'}
            </span>
          </div>
        `;
      }).join('');

      dropdown.querySelectorAll('.bh-member-item').forEach(item => {
        item.onmousedown = (e) => {
          e.preventDefault();
          const pn = item.dataset.pn;
          const member = (window._bhMembers || []).find(x => String(x.person_number) === String(pn));
          if (member) window.bhSelectMember(prefix, member);
          dropdown.classList.remove('show');
        };
      });
      dropdown.classList.add('show');
      updatePos();
    };

    input.addEventListener('focus', () => { input.select(); renderDropdown(input.value); });
    input.addEventListener('input', () => renderDropdown(input.value));
    document.addEventListener('mousedown', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
  });
};

window.bhSelectMember = function(prefix, member) {
  const searchEl = document.getElementById(`${prefix}-member-search`);
  const ibanEl = document.getElementById(`${prefix}-member-iban`);
  const pnEl = document.getElementById(`${prefix}-member-pn`);
  const nameEl = document.getElementById(`${prefix}-member-name`);
  const addrEl = document.getElementById(`${prefix}-member-address`);
  const streetEl = document.getElementById(`${prefix}-member-street`);
  const zipEl = document.getElementById(`${prefix}-member-zip`);
  const cityEl = document.getElementById(`${prefix}-member-city`);
  const addrDisplayEl = document.getElementById(`${prefix}-member-address-display`);

  const cleanName = `${member.first_name} ${member.last_name}`.trim();
  if (searchEl) searchEl.value = cleanName;
  if (ibanEl) ibanEl.value = member.iban ? member.iban.trim() : '';
  if (pnEl) pnEl.value = member.person_number;
  if (nameEl) nameEl.value = cleanName;
  if (streetEl) streetEl.value = member.street || '';
  if (zipEl) zipEl.value = member.post_code || '';
  if (cityEl) cityEl.value = member.city || '';
  
  const addr = [member.street, `${member.post_code || ''} ${member.city || ''}`.trim()].filter(Boolean).join(', ');
  if (addrEl) addrEl.value = addr;
  if (addrDisplayEl) {
    addrDisplayEl.innerHTML = `<strong>${typeof escapeHtml === 'function' ? escapeHtml(cleanName) : cleanName}</strong> &middot; ${typeof escapeHtml === 'function' ? escapeHtml(addr || 'Keine Adresse hinterlegt') : addr} &middot; Lizenz: #${member.person_number}`;
  }

  // Falls Einzelbuchung: Wenn Aktionstyp noch 'Kassa', auf 'Überweisung' wechseln
  if (prefix === 'bhe') {
    const typEl = document.getElementById('bhe-typ');
    const habenEl = document.getElementById('bhe-haben');
    if (typEl && typEl.value === 'Kassa') {
      typEl.value = 'Überweisung';
    }
    if (habenEl && (!habenEl.value || habenEl.value.includes('1000'))) {
      habenEl.value = window.bhKontoFormatDisplay ? window.bhKontoFormatDisplay('1020') : '1020 | Zahlungskonto';
      habenEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const descEl = document.getElementById('bhe-beschreibung');
    if (descEl && !descEl.value) {
      descEl.value = `Vergütung ${cleanName}: `;
    }
  } else if (prefix === 'bh-ks') {
    const artEl = document.getElementById('bh-ks-art');
    if (artEl && artEl.value !== 'bank') {
      artEl.value = 'bank';
      if (typeof window.bhUpdateKassaSammelArt === 'function') window.bhUpdateKassaSammelArt();
    }
    const titelEl = document.getElementById('bh-ks-titel');
    if (titelEl && !titelEl.value) {
      titelEl.value = `Rückvergütung Vorfinanzierung ${cleanName}`;
    }
  }
};

window.bhClearMember = function(prefix) {
  const searchEl = document.getElementById(`${prefix}-member-search`);
  const ibanEl = document.getElementById(`${prefix}-member-iban`);
  const pnEl = document.getElementById(`${prefix}-member-pn`);
  const nameEl = document.getElementById(`${prefix}-member-name`);
  const addrEl = document.getElementById(`${prefix}-member-address`);
  const streetEl = document.getElementById(`${prefix}-member-street`);
  const zipEl = document.getElementById(`${prefix}-member-zip`);
  const cityEl = document.getElementById(`${prefix}-member-city`);
  const addrDisplayEl = document.getElementById(`${prefix}-member-address-display`);

  if (searchEl) searchEl.value = '';
  if (ibanEl) ibanEl.value = '';
  if (pnEl) pnEl.value = '';
  if (nameEl) nameEl.value = '';
  if (addrEl) addrEl.value = '';
  if (streetEl) streetEl.value = '';
  if (zipEl) zipEl.value = '';
  if (cityEl) cityEl.value = '';
  if (addrDisplayEl) addrDisplayEl.innerText = 'Kein Mitglied ausgewählt (Freitext oder Vereinsmitglied)';
};

window.bhToggleMemberSection = function(prefix) {
  const details = document.getElementById(`${prefix}-member-details`);
  const indicator = document.getElementById(`${prefix}-member-toggle-indicator`);
  if (!details) return;
  const isHidden = details.style.display === 'none';
  details.style.display = isHidden ? 'block' : 'none';
  if (indicator) {
    indicator.innerHTML = isHidden ? 'Ausblenden <i class="fas fa-chevron-up ms-1"></i>' : 'Anzeigen <i class="fas fa-chevron-down ms-1"></i>';
  }
};

window.bhDownloadFile = function(filename, content, mimeType = 'application/xml;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

window.bhGeneratePain001Xml = function(params) {
  const {
    executionDate,
    debtorIban,
    debtorName,
    debtorStreet,
    debtorZip,
    debtorCity,
    creditorName,
    creditorStreet,
    creditorZip,
    creditorCity,
    creditorIban,
    amount,
    endToEndId,
    remittanceInfo
  } = params;

  function escapeXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // SWIFT-Zeichensatz für Identifier (Max35Text-Swift): nur [A-Za-z0-9/\-?:().,'+ ] erlaubt, kein Unterstrich!
  function sanitizeSwiftId(str, fallback = 'PAY') {
    const clean = String(str || fallback).replace(/[^A-Za-z0-9\-\+\?\/\:\(\)\.\,\']/g, '-').slice(0, 35);
    return clean || fallback;
  }

  const now = new Date();
  const createdIso = now.toISOString().replace(/\.\d{3}Z$/, '');
  const msgId = sanitizeSwiftId(`SPM-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Date.now().toString().slice(-6)}`);
  const safeEndToEndId = sanitizeSwiftId(endToEndId || `PAY-${Date.now()}`);
  const pmtInfId = sanitizeSwiftId(`PMT-${safeEndToEndId}`);
  const amtFormatted = Number(amount || 0).toFixed(2);
  const cleanDebtorIban = String(debtorIban || 'CH0680808003633131892').replace(/\s+/g, '').toUpperCase();
  const cleanCreditorIban = String(creditorIban || '').replace(/\s+/g, '').toUpperCase();
  const execDate = executionDate || now.toISOString().split('T')[0];

  let creditorAddressXml = '';
  if (creditorStreet || creditorZip || creditorCity) {
    creditorAddressXml = `
          <PstlAdr>
            ${creditorStreet ? `<StrtNm>${escapeXml(creditorStreet.slice(0, 70))}</StrtNm>` : ''}
            ${creditorZip ? `<PstCd>${escapeXml(creditorZip.slice(0, 16))}</PstCd>` : ''}
            ${creditorCity ? `<TwnNm>${escapeXml(creditorCity.slice(0, 35))}</TwnNm>` : ''}
            <Ctry>CH</Ctry>
          </PstlAdr>`;
  } else {
    creditorAddressXml = `
          <PstlAdr>
            <Ctry>CH</Ctry>
          </PstlAdr>`;
  }

  const cleanRemittance = String(remittanceInfo || 'Rückvergütung Sportschützen Muhen').slice(0, 140);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="http://www.six-interbank-clearing.com/de/pain.001.001.03.ch.02.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.six-interbank-clearing.com/de/pain.001.001.03.ch.02.xsd pain.001.001.03.ch.02.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${createdIso}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${amtFormatted}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(debtorName || 'Sportschützen Muhen')}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${amtFormatted}</CtrlSum>
      <PmtTpInf>
        <InstrPrty>NORM</InstrPrty>
      </PmtTpInf>
      <ReqdExctnDt>${execDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(debtorName || 'Sportschützen Muhen')}</Nm>
        <PstlAdr>
          <StrtNm>${escapeXml(debtorStreet || 'Schiessanlage Hard')}</StrtNm>
          <PstCd>${escapeXml(debtorZip || '5037')}</PstCd>
          <TwnNm>${escapeXml(debtorCity || 'Muhen')}</TwnNm>
          <Ctry>CH</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${cleanDebtorIban}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>RAIFCH22</BIC>
        </FinInstnId>
      </DbtrAgt>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(safeEndToEndId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="CHF">${amtFormatted}</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>${escapeXml(creditorName || 'Mitglied')}</Nm>
          ${creditorAddressXml}
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${cleanCreditorIban}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(cleanRemittance)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
};

window.bhDownloadPain001Xml = function(entries, recipientData) {
  if (!entries || entries.length === 0) return;
  const single = entries[0];
  const totalAmount = entries.reduce((s, e) => s + (Number(e.betrag) || 0), 0);
  const baseBeleg = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(single.beleg_nr) : single.beleg_nr;

  const rec = recipientData || {};
  const iban = String(rec.iban || '').replace(/\s+/g, '').toUpperCase();
  if (!iban || !/^CH\d{2}[0-9A-Z]{17}$/.test(iban)) {
    alert("⚠️ Für den Export als Bank-XML (pain.001) wird eine gültige Schweizer IBAN benötigt.\n\nBitte trage die IBAN des Mitglieds ein.");
    return;
  }

  // Remittance-Zwecktext aus Buchungstexten
  let remittance = '';
  if (entries.length === 1) {
    remittance = entries[0].beschreibung || 'Auszahlung';
  } else {
    const posSnippets = entries.map(e => {
      const cleanDesc = (e.beschreibung || '').replace(/^.+?\(|\)$/g, '').trim();
      return `${cleanDesc} (CHF ${Number(e.betrag || 0).toFixed(2)})`;
    });
    remittance = `Abrechnung ${baseBeleg}: ${posSnippets.join(', ')}`;
  }

  let street = rec.street || '';
  let zip = rec.zip || rec.post_code || '';
  let city = rec.city || '';
  if (!street && rec.address && rec.address.includes(',')) {
    const parts = rec.address.split(',').map(p => p.trim());
    street = parts[0] || '';
    if (parts[1]) {
      const m = parts[1].match(/^(\d{4,5})\s+(.+)$/);
      if (m) {
        zip = m[1];
        city = m[2];
      } else {
        city = parts[1];
      }
    }
  }

  const xmlContent = window.bhGeneratePain001Xml({
    executionDate: single.datum || new Date().toISOString().split('T')[0],
    debtorIban: 'CH0680808003633131892',
    debtorName: 'Sportschützen Muhen',
    debtorStreet: 'Schiessanlage Hard',
    debtorZip: '5037',
    debtorCity: 'Muhen',
    creditorName: rec.name || 'Mitglied',
    creditorStreet: street,
    creditorZip: zip,
    creditorCity: city,
    creditorIban: iban,
    amount: totalAmount,
    endToEndId: baseBeleg || `PAY-${Date.now()}`,
    remittanceInfo: remittance
  });

  const filename = `pain001_${(baseBeleg || 'Zahlungsauftrag').replace(/[^A-Za-z0-9\-]/g, '-')}_${Date.now()}.xml`;
  window.bhDownloadFile(filename, xmlContent, 'application/xml;charset=utf-8');

  if (typeof showSuccess === 'function') {
    showSuccess(`📥 Bank-Datei ${filename} (pain.001) heruntergeladen! Kann direkt im E-Banking hochgeladen werden.`);
  }
};

// POPUP-MODAL: MANUELLE BUCHUNG ERFASSEN ODER BEARBEITEN
window.bhOpenEntryModal = function(entryId) {
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('buchhaltung')) {
    alert("Keine Berechtigung zum Bearbeiten von Buchungen.");
    return;
  }
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
    <div class="modal-dialog modal-dialog-centered modal-xl" style="max-width: 1100px;">
      <div class="modal-content border-0 rounded-4 shadow" style="position: relative;">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
          <h5 class="modal-title fw-bold mb-0" id="bhe-modal-title">
            <i class="fas fa-receipt me-2"></i>${isEdit ? `Buchungssatz bearbeiten (ID: ${entryId})` : 'Journalbuchung erfassen'}
          </h5>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm text-white p-1 border-0 shadow-none rn-modal-maximize-btn" title="Maximieren / Verkleinern" style="opacity: 0.85; line-height: 1;">
              <i class="fas fa-expand"></i>
            </button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body p-4">
          <!-- Split-Warnung / Verbund-Hinweis Container -->
          <div id="bhe-split-warning-container"></div>

          ${!isEdit ? `
            <!-- Tab-Auswahl: Einzelbuchung vs. Sammelbeleg & Auszahlungen -->
            <ul class="nav nav-pills nav-fill mb-3 p-1 bg-light rounded-3 border" id="bhe-entry-tabs" role="tablist">
              <li class="nav-item" role="presentation">
                <button class="nav-link active fw-bold py-1.5" id="bhe-tab-single-btn" data-bs-toggle="pill" data-bs-target="#bhe-tab-single" type="button" role="tab">
                  <i class="fas fa-file-alt me-1.5"></i>Einzelbuchung
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link fw-bold py-1.5" id="bhe-tab-sammel-btn" data-bs-toggle="pill" data-bs-target="#bhe-tab-sammel" type="button" role="tab" onclick="bhInitKassaSammelbeleg()">
                  <i class="fas fa-layer-group me-1.5"></i>Sammelbeleg & Auszahlungen (Mehrere Positionen)
                </button>
              </li>
            </ul>
          ` : ''}

          <div class="tab-content" id="bhe-tab-content">
            <!-- TAB 1: EINZELBUCHUNG -->
            <div class="tab-pane fade show active" id="bhe-tab-single" role="tabpanel">
              <form id="bh-new-entry-form" onsubmit="bhSaveJournalEntry(event, false, false)">
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

                <!-- OPTIONAL: BEGÜNSTIGTER / MITGLIED (FÜR VERGÜTUNGEN & BANK-XML) -->
                <div class="card p-2.5 mb-3 bg-light border rounded-3" id="bhe-member-card">
                  <div class="d-flex justify-content-between align-items-center cursor-pointer" onclick="bhToggleMemberSection('bhe')" style="cursor: pointer;">
                    <label class="form-label fw-bold small text-primary mb-0" style="cursor: pointer;">
                      <i class="fas fa-user-check me-1"></i>Begünstigtes Mitglied / Auszahlungsempfänger <span class="text-muted fw-normal">(optional für Beleg & Bank-XML)</span>
                    </label>
                    <span class="badge bg-white text-secondary border small" id="bhe-member-toggle-indicator">Anzeigen <i class="fas fa-chevron-down ms-1"></i></span>
                  </div>
                  <div id="bhe-member-details" style="display: none;" class="mt-2 pt-2 border-top">
                    <div class="row g-2">
                      <div class="col-md-6">
                        <label class="form-label small text-muted fw-bold mb-1">Mitglied suchen</label>
                        <div class="bh-member-ac-wrap position-relative">
                          <input type="text" class="form-control form-control-sm bh-member-ac-input" id="bhe-member-search" placeholder="Name oder Nr. tippen (z.B. Marco Fischer)..." autocomplete="off">
                        </div>
                      </div>
                      <div class="col-md-6">
                        <label class="form-label small text-muted fw-bold mb-1">Zahlungsverbindung (IBAN)</label>
                        <div class="input-group input-group-sm">
                          <input type="text" class="form-control font-monospace fw-bold" id="bhe-member-iban" placeholder="CH.. .... .... .... .">
                          <button type="button" class="btn btn-outline-secondary" onclick="bhClearMember('bhe')" title="Auswahl zurücksetzen"><i class="fas fa-times"></i></button>
                        </div>
                      </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-2 small">
                      <span class="text-muted" id="bhe-member-address-display">Kein Mitglied ausgewählt</span>
                      <div class="form-check mb-0">
                        <input class="form-check-input" type="checkbox" id="bhe-save-iban-to-member" checked>
                        <label class="form-check-label text-muted" for="bhe-save-iban-to-member" style="font-size: 11px;">IBAN bei Mitglied speichern falls neu</label>
                      </div>
                    </div>
                    <input type="hidden" id="bhe-member-pn" value="">
                    <input type="hidden" id="bhe-member-name" value="">
                    <input type="hidden" id="bhe-member-address" value="">
                    <input type="hidden" id="bhe-member-street" value="">
                    <input type="hidden" id="bhe-member-zip" value="">
                    <input type="hidden" id="bhe-member-city" value="">
                  </div>
                </div>
                
                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">Buchungstext (Beschreibung)</label>
                  <input type="text" class="form-control" id="bhe-beschreibung" required placeholder="z.B. Munitionskauf Kaliber .22">
                </div>
                
                <div class="row g-3 mb-3">
                  <div class="col-6">
                    <label class="form-label fw-bold small text-muted text-primary"><i class="fas fa-long-arrow-alt-right me-1"></i> Soll-Konto (Empfänger)</label>
                    <div class="input-group">
                      <input type="text" class="form-control bh-konto-ac-input" id="bhe-soll" placeholder="Konto suchen (Nr. oder Name)..." autocomplete="off">
                      <button type="button" class="btn btn-outline-secondary px-2.5" tabindex="-1" onclick="const inp=this.previousElementSibling; inp.focus(); inp.click();" title="Kontenliste anzeigen">
                        <i class="fas fa-chevron-down" style="font-size: 11px;"></i>
                      </button>
                    </div>
                  </div>
                  <div class="col-6">
                    <label class="form-label fw-bold small text-muted text-success"><i class="fas fa-long-arrow-alt-left me-1"></i> Haben-Konto (Quelle)</label>
                    <div class="input-group">
                      <input type="text" class="form-control bh-konto-ac-input" id="bhe-haben" placeholder="Konto suchen (Nr. oder Name)..." autocomplete="off">
                      <button type="button" class="btn btn-outline-secondary px-2.5" tabindex="-1" onclick="const inp=this.previousElementSibling; inp.focus(); inp.click();" title="Kontenliste anzeigen">
                        <i class="fas fa-chevron-down" style="font-size: 11px;"></i>
                      </button>
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
                
                <div class="row g-2 pt-2">
                  <div class="col-md-6 col-12">
                    <button type="submit" class="btn btn-success w-100 py-2.5 fw-bold rounded-3 shadow-sm" id="bhe-submit-btn">
                      <i class="fas fa-check-circle me-1.5"></i> ${isEdit ? 'Änderungen speichern' : 'Buchung speichern'}
                    </button>
                  </div>
                  <div class="col-md-6 col-12">
                    <button type="button" class="btn btn-outline-primary w-100 py-2.5 fw-bold rounded-3 shadow-sm" onclick="bhSaveAndPrintSingleJournalEntry(event, false)" id="bhe-save-print-btn" title="Buchung speichern und direkt Beleg drucken">
                      <i class="fas fa-print me-1.5"></i> Speichern & Beleg drucken
                    </button>
                  </div>
                  <div class="col-12" id="bhe-xml-btn-wrap">
                    <button type="button" class="btn btn-primary w-100 py-2.5 fw-bold rounded-3 shadow-sm" onclick="bhSaveAndPrintSingleJournalEntry(event, true)" id="bhe-save-xml-btn" title="Buchung speichern, Beleg drucken und ISO 20022 XML für E-Banking herunterladen">
                      <i class="fas fa-file-code me-1.5"></i> Speichern & Bank-XML
                    </button>
                  </div>
                </div>
              </form>
            </div>

            ${!isEdit ? `
            <!-- TAB 2: SAMMELBELEG & AUSZAHLUNGEN -->
            <div class="tab-pane fade" id="bhe-tab-sammel" role="tabpanel">
              <form id="bh-sammel-form" onsubmit="bhSaveKassaSammelbeleg(event, false, false)">
                <div class="row g-2 mb-3">
                  <div class="col-md-3">
                    <label class="form-label fw-bold small text-muted">Belegdatum</label>
                    <input type="date" class="form-control form-control-sm" id="bh-ks-datum" required value="${new Date().toISOString().split('T')[0]}">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-bold small text-muted">Stamm-Belegnummer</label>
                    <input type="text" class="form-control form-control-sm fw-bold font-monospace" id="bh-ks-beleg" required placeholder="z.B. B_Zahl_2026-001">
                  </div>
                  <div class="col-md-5">
                    <label class="form-label fw-bold small text-muted">Art / Zahlweg</label>
                    <select class="form-select form-select-sm fw-semibold" id="bh-ks-art" onchange="bhUpdateKassaSammelArt()">
                      <option value="bank" selected>Banküberweisung (Ausgang via Bank 1020)</option>
                      <option value="ausgabe">Barausgabe (Geld aus Kasse 1000)</option>
                      <option value="einnahme">Bareinnahme (Geld in Kasse 1000)</option>
                      <option value="frei">Freie Kontierung (Soll & Haben)</option>
                    </select>
                  </div>
                </div>

                <!-- BEGÜNSTIGTER / MITGLIEDER-AUSWAHL -->
                <div class="card p-2.5 mb-3 bg-light border rounded-3" id="bh-ks-member-card">
                  <div class="d-flex justify-content-between align-items-center cursor-pointer" onclick="bhToggleMemberSection('bh-ks')" style="cursor: pointer;">
                    <label class="form-label fw-bold small text-primary mb-0" style="cursor: pointer;">
                      <i class="fas fa-user-check me-1"></i>Begünstigtes Mitglied / Auszahlungsempfänger <span class="text-muted fw-normal">(für Beleg & Bank-XML)</span>
                    </label>
                    <span class="badge bg-white text-secondary border small" id="bh-ks-member-toggle-indicator">Ausblenden <i class="fas fa-chevron-up ms-1"></i></span>
                  </div>
                  <div id="bh-ks-member-details" class="mt-2 pt-2 border-top">
                    <div class="row g-2">
                      <div class="col-md-6">
                        <label class="form-label small text-muted fw-bold mb-1">Mitglied suchen</label>
                        <div class="bh-member-ac-wrap position-relative">
                          <input type="text" class="form-control form-control-sm bh-member-ac-input" id="bh-ks-member-search" placeholder="Name oder Nr. tippen (z.B. Marco Fischer)..." autocomplete="off">
                        </div>
                      </div>
                      <div class="col-md-6">
                        <label class="form-label small text-muted fw-bold mb-1">Zahlungsverbindung (IBAN)</label>
                        <div class="input-group input-group-sm">
                          <input type="text" class="form-control font-monospace fw-bold" id="bh-ks-member-iban" placeholder="CH.. .... .... .... .">
                          <button type="button" class="btn btn-outline-secondary" onclick="bhClearMember('bh-ks')" title="Auswahl zurücksetzen"><i class="fas fa-times"></i></button>
                        </div>
                      </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-2 small">
                      <span class="text-muted" id="bh-ks-member-address-display">Kein Mitglied ausgewählt (Freitext oder Vereinsmitglied)</span>
                      <div class="form-check mb-0">
                        <input class="form-check-input" type="checkbox" id="bh-ks-save-iban-to-member" checked>
                        <label class="form-check-label text-muted" for="bh-ks-save-iban-to-member" style="font-size: 11px;">IBAN bei Mitglied speichern falls neu</label>
                      </div>
                    </div>
                    <input type="hidden" id="bh-ks-member-pn" value="">
                    <input type="hidden" id="bh-ks-member-name" value="">
                    <input type="hidden" id="bh-ks-member-address" value="">
                    <input type="hidden" id="bh-ks-member-street" value="">
                    <input type="hidden" id="bh-ks-member-zip" value="">
                    <input type="hidden" id="bh-ks-member-city" value="">
                  </div>
                </div>

                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">Gesamttitel / Anlass (Belegkopf)</label>
                  <input type="text" class="form-control form-control-sm" id="bh-ks-titel" required placeholder="z.B. Vorfinanzierung Gruppendoppel oder Spesenabrechnung">
                </div>

                <div class="d-flex justify-content-between align-items-center mb-2">
                  <label class="form-label fw-bold small text-primary mb-0"><i class="fas fa-list-ol me-1"></i>Positionen des Sammelbelegs</label>
                  <button type="button" class="btn btn-sm btn-outline-primary py-0.5 px-2 fw-semibold" onclick="bhAddKassaSammelRow()">
                    <i class="fas fa-plus me-1"></i>Position hinzufügen
                  </button>
                </div>

                <div class="table-responsive border rounded-3 mb-3 bg-white" style="min-height: 180px;">
                  <table class="table table-bordered table-striped table-hover align-middle mb-0" id="bh-ks-table" style="font-size: 13.5px;">
                    <thead class="table-light">
                      <tr id="bh-ks-thead-tr">
                        <th style="width: 38px;" class="text-center">#</th>
                        <th>Beschreibung / Positionstext</th>
                        <th style="width: 340px;">Aufwandskonto (Soll)</th>
                        <th style="width: 140px;" class="text-end">Betrag (CHF)</th>
                        <th style="width: 45px;" class="text-center">Aktion</th>
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
                      <span id="bh-ks-pos-count">0</span> Position(en) erfasst &middot; <strong class="text-dark" id="bh-ks-account-info">Geldkonto: 1020 Bank (Vereinskonto)</strong>
                    </span>
                    <span class="fs-6 fw-bold text-primary">
                      Total Beleg: <span class="font-monospace" id="bh-ks-total-sum">CHF 0.00</span>
                    </span>
                  </div>
                </div>

                <div class="row g-2 pt-2">
                  <div class="col-md-6 col-12">
                    <button type="submit" class="btn btn-success w-100 py-2.5 fw-bold rounded-3 shadow-sm" id="bh-ks-save-btn">
                      <i class="fas fa-check-circle me-1.5"></i> Nur Sammelbeleg buchen
                    </button>
                  </div>
                  <div class="col-md-6 col-12">
                    <button type="button" class="btn btn-outline-primary w-100 py-2.5 fw-bold rounded-3 shadow-sm" onclick="bhSaveKassaSammelbeleg(event, true, false)" id="bh-ks-save-print-btn">
                      <i class="fas fa-print me-1.5"></i> Buchen & Beleg drucken
                    </button>
                  </div>
                  <div class="col-12" id="bh-ks-xml-btn-wrap">
                    <button type="button" class="btn btn-primary w-100 py-2.5 fw-bold rounded-3 shadow-sm" onclick="bhSaveKassaSammelbeleg(event, true, true)" id="bh-ks-save-xml-btn" title="Buchen, Beleg drucken und ISO 20022 XML für E-Banking herunterladen">
                      <i class="fas fa-file-code me-1.5"></i> Buchen & Bank-XML (pain.001)
                    </button>
                  </div>
                </div>
              </form>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Resize-Grip Ecke unten rechts für UIModalKit -->
        <div class="rn-modal-resizer" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;" title="Grösse durch Ziehen verändern">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M11 1v10H1V11h10z M11 5v6H5V11h6z M11 9v2H9V11h2z"/></svg>
        </div>
      </div>
    </div>
  `;

  // Autocomplete initialisieren für Soll/Haben und Mitglieder
  setTimeout(() => {
    bhInitKontoAutocompleteForContainer(modalEl);
    bhInitMemberAutocompleteForContainer(modalEl);
  }, 50);
  
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
          warnContainer.innerHTML = `
            <div class="alert alert-light border border-secondary-subtle d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 py-2 px-3 rounded-3 shadow-sm" style="background: #f8fafc;">
              <div class="small text-muted">
                <i class="fas fa-info-circle text-primary me-1.5"></i>Dies ist eine <strong>Einzelbuchung</strong>. Du kannst sie nachträglich in mehrere Teilpositionen aufteilen.
              </div>
              <div>
                <button type="button" class="btn btn-sm btn-outline-primary fw-semibold" onclick="bhConvertEntryToSplit(${entry.id})" title="Buchungssatz nachträglich in mehrere Teilpositionen aufteilen">
                  <i class="fas fa-layer-group me-1.5"></i>In Split-Buchung aufteilen
                </button>
              </div>
            </div>
          `;
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
  if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
    window.UIModalKit.makeMovableAndResizable(modalEl);
  }
};

// =====================================================================
// KASSEN-SAMMELBELEG VERWALTUNG & LOGIK
// =====================================================================
window.bhInitKassaSammelbeleg = function() {
  const y = Number(window._bhYear || new Date().getFullYear());
  const belegEl = document.getElementById('bh-ks-beleg');
  const artEl = document.getElementById('bh-ks-art');
  const art = artEl ? artEl.value : 'bank';
  if (belegEl && (!belegEl.value || belegEl.value.startsWith('Kasse_') || belegEl.value.startsWith('B_Zahl_'))) {
    const pfx = (art === 'bank') ? 'B_Zahl_' : (art === 'ausgabe' || art === 'einnahme' ? 'Kasse_' : 'BEL-');
    belegEl.value = window.bhGetNextJournalBelegNr(y, pfx);
  }
  if (!window._bhKassaSammelRows || window._bhKassaSammelRows.length === 0) {
    window._bhKassaSammelRows = [
      { text: '', konto: '4000', kontoSoll: '', kontoHaben: '', betrag: '' },
      { text: '', konto: '4000', kontoSoll: '', kontoHaben: '', betrag: '' }
    ];
  }
  window.bhUpdateKassaSammelArt();
};

window.bhUpdateKassaSammelArt = function() {
  bhSyncKassaSammelFromInputs();
  const art = document.getElementById('bh-ks-art') ? document.getElementById('bh-ks-art').value : 'bank';
  const tr = document.getElementById('bh-ks-thead-tr');
  const belegEl = document.getElementById('bh-ks-beleg');
  const y = Number(window._bhYear || new Date().getFullYear());

  if (belegEl && (belegEl.value.startsWith('Kasse_') || belegEl.value.startsWith('B_Zahl_') || !belegEl.value)) {
    const pfx = (art === 'bank') ? 'B_Zahl_' : (art === 'ausgabe' || art === 'einnahme' ? 'Kasse_' : 'BEL-');
    belegEl.value = window.bhGetNextJournalBelegNr(y, pfx);
  }

  const xmlWrap = document.getElementById('bh-ks-xml-btn-wrap');
  if (xmlWrap) {
    xmlWrap.style.display = (art === 'bank') ? 'block' : 'none';
  }

  const accountInfo = (art === 'bank') 
    ? 'Geldkonto: 1020 Bank (Vereinskonto)' 
    : (art === 'ausgabe') 
      ? 'Kassenkonto: 1000 Kasse (Bargeldausgabe)' 
      : (art === 'einnahme') 
        ? 'Kassenkonto: 1000 Kasse (Bargeldeinnahme)' 
        : 'Freie Kontierung (individuelle Soll- & Haben-Konten)';

  const infoEl = document.getElementById('bh-ks-account-info');
  if (infoEl) infoEl.innerText = accountInfo;

  if (tr) {
    if (art === 'frei') {
      tr.innerHTML = `
        <th style="width: 38px;" class="text-center">#</th>
        <th>Beschreibung / Positionstext</th>
        <th style="width: 250px;">Soll-Konto</th>
        <th style="width: 250px;">Haben-Konto</th>
        <th style="width: 140px;" class="text-end">Betrag (CHF)</th>
        <th style="width: 45px;" class="text-center">Aktion</th>
      `;
    } else {
      const thLabel = (art === 'einnahme') ? 'Ertragskonto (Haben)' : 'Aufwandskonto (Soll)';
      tr.innerHTML = `
        <th style="width: 38px;" class="text-center">#</th>
        <th>Beschreibung / Positionstext</th>
        <th style="width: 340px;">${thLabel}</th>
        <th style="width: 140px;" class="text-end">Betrag (CHF)</th>
        <th style="width: 45px;" class="text-center">Aktion</th>
      `;
    }
  }
  bhRenderKassaSammelRows();
};

window.bhSyncKassaSammelFromInputs = function() {
  const art = document.getElementById('bh-ks-art') ? document.getElementById('bh-ks-art').value : 'bank';
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
    konto: '4000',
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

  const art = document.getElementById('bh-ks-art') ? document.getElementById('bh-ks-art').value : 'bank';
  const isFrei = (art === 'frei');
  const rows = window._bhKassaSammelRows || [];

  tbody.innerHTML = rows.map((r, i) => {
    let kontoCells = '';
    if (isFrei) {
      kontoCells = `
        <td>
          <div class="input-group input-group-sm">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-ks-soll-${i}" value="${r.kontoSoll ? window.bhKontoFormatDisplay(r.kontoSoll) : ''}" placeholder="Soll-Konto..." autocomplete="off">
            <button type="button" class="btn btn-outline-secondary px-2" tabindex="-1" onclick="const inp=this.previousElementSibling; inp.focus(); inp.click();" title="Soll-Konto auswählen">
              <i class="fas fa-chevron-down" style="font-size: 10px;"></i>
            </button>
          </div>
        </td>
        <td>
          <div class="input-group input-group-sm">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-ks-haben-${i}" value="${r.kontoHaben ? window.bhKontoFormatDisplay(r.kontoHaben) : ''}" placeholder="Haben-Konto..." autocomplete="off">
            <button type="button" class="btn btn-outline-secondary px-2" tabindex="-1" onclick="const inp=this.previousElementSibling; inp.focus(); inp.click();" title="Haben-Konto auswählen">
              <i class="fas fa-chevron-down" style="font-size: 10px;"></i>
            </button>
          </div>
        </td>
      `;
    } else {
      const labelPlaceholder = (art === 'einnahme') ? 'Ertragskonto suchen...' : 'Aufwandskonto suchen (z.B. 4000)...';
      kontoCells = `
        <td>
          <div class="input-group input-group-sm">
            <input type="text" class="form-control form-control-sm bh-konto-ac-input" id="bh-ks-konto-${i}" value="${r.konto ? window.bhKontoFormatDisplay(r.konto) : ''}" placeholder="${labelPlaceholder}" autocomplete="off">
            <button type="button" class="btn btn-outline-secondary px-2" tabindex="-1" onclick="const inp=this.previousElementSibling; inp.focus(); inp.click();" title="Aufwandskonto auswählen">
              <i class="fas fa-chevron-down" style="font-size: 10px;"></i>
            </button>
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
  if (sumEl) sumEl.textContent = (typeof fmtChf === 'function') ? fmtChf(total) : ('CHF ' + total.toFixed(2));

  const countEl = document.getElementById('bh-ks-pos-count');
  if (countEl) countEl.textContent = rows.length;
};

window.bhSaveKassaSammelbeleg = async function(event, printAfter = false, exportXml = false) {
  if (event) event.preventDefault();
  bhSyncKassaSammelFromInputs();

  const datumEl = document.getElementById('bh-ks-datum');
  const belegEl = document.getElementById('bh-ks-beleg');
  const titelEl = document.getElementById('bh-ks-titel');
  const artEl = document.getElementById('bh-ks-art');

  const datum = datumEl ? datumEl.value : new Date().toISOString().split('T')[0];
  const baseBeleg = belegEl ? belegEl.value.trim() : '';
  const titel = titelEl ? titelEl.value.trim() : '';
  const art = artEl ? artEl.value : 'bank';

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

  // Mitgliedsdaten auslesen
  const memberPn = document.getElementById('bh-ks-member-pn')?.value;
  const memberName = document.getElementById('bh-ks-member-name')?.value;
  const memberIban = (document.getElementById('bh-ks-member-iban')?.value || '').replace(/\s+/g, '').toUpperCase();
  const memberAddr = document.getElementById('bh-ks-member-address')?.value;
  const memberStreet = document.getElementById('bh-ks-member-street')?.value;
  const memberZip = document.getElementById('bh-ks-member-zip')?.value;
  const memberCity = document.getElementById('bh-ks-member-city')?.value;
  const saveIban = document.getElementById('bh-ks-save-iban-to-member')?.checked;

  if (exportXml && (!memberIban || !/^CH\d{2}[0-9A-Z]{17}$/.test(memberIban))) {
    alert("⚠️ Für die Erstellung der Bank-XML (pain.001) wird eine gültige Schweizer IBAN benötigt.\n\nBitte trage die IBAN des Mitglieds ein.");
    const ibanInp = document.getElementById('bh-ks-member-iban');
    if (ibanInp) {
      const details = document.getElementById('bh-ks-member-details');
      if (details) details.style.display = 'block';
      ibanInp.focus();
    }
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
      if (art === 'bank' && (r.konto === '1020' || r.konto === '1021' || r.konto === '1022')) {
        alert(`Aufwandskonto für Position #${i + 1} darf nicht das Bankkonto selbst sein.`);
        return;
      }
      if (art === 'ausgabe' && r.konto === '1000') {
        alert(`Aufwandskonto für Position #${i + 1} darf nicht das Kassenkonto 1000 sein.`);
        return;
      }
      if (art === 'einnahme' && r.konto === '1000') {
        alert(`Ertragskonto für Position #${i + 1} darf nicht das Kassenkonto 1000 sein.`);
        return;
      }
      validRows.push({
        text: r.text.trim(),
        soll: (art === 'einnahme') ? ((art === 'bank') ? '1020' : '1000') : r.konto,
        haben: (art === 'einnahme') ? r.konto : ((art === 'bank') ? '1020' : '1000'),
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
  const xmlBtn = document.getElementById('bh-ks-save-xml-btn');
  if (saveBtn) saveBtn.disabled = true;
  if (printBtn) printBtn.disabled = true;
  if (xmlBtn) xmlBtn.disabled = true;
  if (saveBtn) saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Speichere Sammelbeleg...';

  // IBAN bei Mitglied in Supabase speichern falls angehakt
  if (saveIban && memberPn && memberIban && /^CH\d{2}[0-9A-Z]{17}$/.test(memberIban)) {
    try {
      const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
      if (supa) {
        await supa.from('members').update({ iban: memberIban }).eq('person_number', parseInt(memberPn, 10));
        const cachedM = (window._bhMembers || []).find(x => String(x.person_number) === String(memberPn));
        if (cachedM) cachedM.iban = memberIban;
      }
    } catch (mErr) {
      console.warn("⚠️ Fehler beim Aktualisieren der IBAN in members:", mErr);
    }
  }

  const recipientData = memberName ? {
    name: memberName,
    iban: memberIban,
    address: memberAddr,
    street: memberStreet,
    zip: memberZip,
    city: memberCity,
    personNumber: memberPn
  } : null;

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
        typ: (art === 'bank') ? 'Überweisung' : (art === 'einnahme' ? 'Einnahme' : 'Kassa'),
        buchungstyp: (typeof getBuchungstyp === 'function') ? getBuchungstyp(vr.soll, vr.haben) : 'TRANSIT'
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
      showSuccess(`🎉 Sammelbeleg mit ${savedEntries.length} Positionen erfolgreich gebucht!`);
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
      bhPrintJournalBeleg(savedEntries, titel, recipientData);
    }

    if (exportXml && savedEntries.length > 0 && recipientData && recipientData.iban) {
      bhDownloadPain001Xml(savedEntries, recipientData);
    }

    setTimeout(async () => {
      if (typeof loadBuchhaltungData === 'function') await loadBuchhaltungData(true, true);
    }, 1500);

  } catch (err) {
    alert('❌ Fehler beim Buchen des Sammelbelegs: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-check-circle me-1.5"></i> Nur Sammelbeleg buchen';
    }
    if (printBtn) {
      printBtn.disabled = false;
      printBtn.innerHTML = '<i class="fas fa-print me-1.5"></i> Buchen & Beleg drucken';
    }
    if (xmlBtn) {
      xmlBtn.disabled = false;
      xmlBtn.innerHTML = '<i class="fas fa-file-code me-1.5"></i> Buchen & Bank-XML (pain.001)';
    }
  }
};

window.bhSaveAndPrintSingleJournalEntry = function(event, exportXml = false) {
  bhSaveJournalEntry(event, true, exportXml);
};

// =====================================================================
// DRUCKFUNKTION FÜR KASSEN-, BANK- UND SAMMELBELEGE (A4 PRINT-TEMPLATE)
// =====================================================================
window.bhPrintJournalBeleg = function(entriesOrIds, customTitle, recipientData) {
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
  let belegNrDisplay = belegNrs.join(', ') || 'Ohne Belegnummer';
  if (entries.length > 1 && typeof window.bhGetSplitBaseBeleg === 'function') {
    const bases = Array.from(new Set(entries.map(e => window.bhGetSplitBaseBeleg(e.beleg_nr)).filter(Boolean)));
    if (bases.length === 1 && bases[0] && bases[0] !== entries[0].beleg_nr) {
      const suffixes = entries.map(e => String(e.beleg_nr).slice(bases[0].length)).filter(Boolean);
      belegNrDisplay = `${bases[0]} (${suffixes.join(', ')})`;
    }
  }
  
  const belegDatum = entries[0].datum ? (typeof isoToDisplay === 'function' ? isoToDisplay(entries[0].datum) : entries[0].datum) : new Date().toLocaleDateString('de-CH');
  const totalAmount = entries.reduce((s, e) => s + (Number(e.betrag) || 0), 0);
  const title = customTitle || (entries.length === 1 ? entries[0].beschreibung : `Abrechnung (${entries.length} Positionen)`);
  
  // Situative Erkennung: Banküberweisung vs. Kassa vs. Umbuchung
  let isBank = false;
  let isCash = false;
  let cashInflow = 0;
  let cashOutflow = 0;
  entries.forEach(e => {
    const soll = String(e.konto_soll || '').trim();
    const haben = String(e.konto_haben || '').trim();
    const typ = String(e.typ || '').trim();
    const amt = Math.abs(Number(e.betrag) || 0);

    if (soll === '1000' || haben === '1000' || typ === 'Kassa') {
      isCash = true;
      if (soll === '1000') cashInflow += amt;
      if (haben === '1000') cashOutflow += amt;
    } else if (soll.startsWith('102') || haben.startsWith('102') || typ === 'Bank' || typ === 'Überweisung') {
      isBank = true;
      if (soll.startsWith('102')) cashInflow += amt;
      if (haben.startsWith('102')) cashOutflow += amt;
    } else {
      if (haben.startsWith('3')) cashInflow += amt;
      else if (soll.startsWith('4') || soll.startsWith('5') || soll.startsWith('6') || soll.startsWith('7') || soll.startsWith('8')) cashOutflow += amt;
    }
  });

  const isEinnahme = cashInflow >= cashOutflow;
  let belegType = '';
  let belegSubTitle = 'Finanzbuchhaltung &middot; Belegwesen Vereinsrechnung';
  let paymentMethodLabel = '';

  if (isBank) {
    belegType = isEinnahme ? 'Bank-Gutschrift / Einnahme' : 'Bank-Auszahlung / Vergütungsbeleg';
    paymentMethodLabel = isEinnahme ? 'Bank-Zahlungseingang (Gutschrift auf 1020 Vereinskonto)' : 'Banküberweisung (Auszahlung via 1020 Vereinskonto)';
  } else if (isCash) {
    belegType = isEinnahme ? 'Kassen-Einnahme' : 'Kassen-Auszahlung';
    belegSubTitle = 'Kassabuch &middot; Belegwesen Vereinsrechnung';
    paymentMethodLabel = isEinnahme ? 'Bareinzahlung (Eingang in Kasse 1000)' : 'Barauszahlung (Geld aus Kasse 1000)';
  } else {
    belegType = isEinnahme ? 'Ertragsbeleg' : 'Aufwands- / Umbuchungsbeleg';
    paymentMethodLabel = 'Umbuchung / Verrechnung';
  }
  const belegTypeRowLabel = `${belegType}:`;

  // Auto-Detect Mitglied falls kein recipientData explizit übergeben wurde
  if (!recipientData) {
    const allTexts = entries.map(e => `${e.beschreibung || ''} ${customTitle || ''}`).join(' ');
    const foundMember = (window._bhMembers || []).find(m => {
      const full = `${m.first_name} ${m.last_name}`.toLowerCase();
      const fn = String(m.first_name || '').toLowerCase();
      const ln = String(m.last_name || '').toLowerCase();
      return (fn.length > 2 && ln.length > 2 && allTexts.toLowerCase().includes(full)) ||
             (m.person_number && allTexts.includes(String(m.person_number)));
    });
    if (foundMember) {
      const addr = [foundMember.street, `${foundMember.post_code || ''} ${foundMember.city || ''}`.trim()].filter(Boolean).join(', ');
      recipientData = {
        name: `${foundMember.first_name} ${foundMember.last_name}`,
        iban: foundMember.iban || '',
        address: addr,
        street: foundMember.street || '',
        zip: foundMember.post_code || '',
        city: foundMember.city || '',
        personNumber: foundMember.person_number
      };
    }
  }

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

  const isSingle = (entries.length === 1);

  // Kassier Name und aktuelles Datum ermitteln
  const rawUser = window.currentUser || localStorage.getItem('portal_user');
  let userName = 'Daniel Hunziker';
  if (typeof rawUser === 'string' && rawUser.trim()) {
    userName = rawUser.trim();
  } else if (typeof rawUser === 'object' && rawUser !== null) {
    userName = rawUser.display_name || rawUser.name || rawUser.full_name || rawUser.email || 'Daniel Hunziker';
  }
  const todayDate = new Date();
  const todayFormatted = `${String(todayDate.getDate()).padStart(2, '0')}.${String(todayDate.getMonth() + 1).padStart(2, '0')}.${todayDate.getFullYear()}`;

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
      <title>${belegType}_${(typeof window.bhGetSplitBaseBeleg === 'function' ? window.bhGetSplitBaseBeleg(belegNrs[0]) : belegNrs[0]) || 'Druck'}</title>
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
        .recipient-box {
          margin-bottom: 20px;
          background: #f8faff;
          border: 1px solid #b6d4fe;
          border-left: 4px solid #0d6efd;
          border-radius: 6px;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 15px;
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
          .no-print { display: none !important; }
          body { padding: 5px; font-size: 12px; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      </style>
    </head>
    <body>
      <!-- Aktionen im Browserfenster (wird beim Ausdrucken ausgeblendet) -->
      <div class="no-print" style="margin-bottom: 20px; display: flex; gap: 10px; align-items: center; justify-content: space-between; background: #e7f1ff; border: 1px solid #b6d4fe; padding: 10px 16px; border-radius: 8px;">
        <div style="font-size: 13px; font-weight: 600; color: #0b5ed7;">
          <i class="fas fa-file-invoice me-1"></i> Beleganzeige: <strong>${escapeHtml(belegType)}</strong> (${escapeHtml(belegNrDisplay)})
        </div>
        <div style="display: flex; gap: 8px;">
          ${(isBank && !isEinnahme && recipientData && recipientData.iban) ? `
            <button type="button" onclick="downloadPain001Xml()" style="background: #198754; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;">
              📥 ISO 20022 XML (pain.001) herunterladen
            </button>
          ` : ''}
          <button type="button" onclick="window.print()" style="background: #0d6efd; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;">
            🖨️ Beleg drucken
          </button>
        </div>
      </div>

      <div class="header-container">
        <div>
          <h1 class="club-title">Sportschützen Muhen</h1>
          <p class="club-sub">${belegSubTitle}</p>
        </div>
        <div class="doc-title-badge">
          <div class="doc-title">${escapeHtml(belegType)}</div>
          <div class="beleg-badge">${escapeHtml(belegNrDisplay)}</div>
        </div>
      </div>

      ${(!isEinnahme && recipientData && recipientData.name) ? `
      <div class="recipient-box">
        <div>
          <div style="font-size: 10px; text-transform: uppercase; color: #0d6efd; font-weight: bold; margin-bottom: 3px;">Begünstigte Person / Empfänger</div>
          <div style="font-size: 15px; font-weight: 800; color: #212529;">
            ${escapeHtml(recipientData.name)}
            ${recipientData.personNumber ? `<span style="font-size: 11px; font-weight: normal; color: #6c757d; font-family: monospace;">(#${escapeHtml(recipientData.personNumber)})</span>` : ''}
          </div>
          ${recipientData.address ? `<div style="font-size: 12px; color: #495057; margin-top: 2px;">${escapeHtml(recipientData.address)}</div>` : ''}
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; text-transform: uppercase; color: #6c757d; font-weight: bold; margin-bottom: 3px;">Zahlungsweg &amp; Verbindung</div>
          ${recipientData.iban ? `
            <div style="font-family: monospace; font-size: 13px; font-weight: bold; color: #0b5ed7;">${escapeHtml(recipientData.iban)}</div>
            <div style="font-size: 11px; color: #6c757d; margin-top: 1px;">${escapeHtml(paymentMethodLabel)}</div>
          ` : `
            <div style="font-size: 12px; font-weight: bold; color: #212529;">${escapeHtml(paymentMethodLabel)}</div>
          `}
        </div>
      </div>
      ` : ''}

      <div class="meta-box">
        <div class="meta-item">
          <div class="meta-label">Belegdatum</div>
          <div class="meta-value">${belegDatum}</div>
        </div>
        ${(isEinnahme && recipientData && recipientData.name) ? `
        <div class="meta-item">
          <div class="meta-label">Zahler / Mitglied</div>
          <div class="meta-value">${escapeHtml(recipientData.name)}${recipientData.personNumber ? ` <span style="font-size: 11px; font-weight: normal; color: #6c757d; font-family: monospace;">(#${escapeHtml(recipientData.personNumber)})</span>` : ''}</div>
        </div>
        ` : ''}
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
        function downloadPain001Xml() {
          if (window.opener && typeof window.opener.bhDownloadPain001Xml === 'function') {
            window.opener.bhDownloadPain001Xml(${JSON.stringify(entries)}, ${JSON.stringify(recipientData)});
          } else {
            alert('Das Hauptfenster ist nicht mehr geöffnet.');
          }
        }
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
window.bhSaveJournalEntry = async function(event, printAfter = false, exportXml = false) {
  if (event) event.preventDefault();
  
  const submitBtn = document.getElementById('bhe-submit-btn');
  const printBtn = document.getElementById('bhe-save-print-btn');
  const xmlBtn = document.getElementById('bhe-save-xml-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Übermittle an Hauptbuch...';
  }
  if (printBtn) printBtn.disabled = true;
  if (xmlBtn) xmlBtn.disabled = true;
  
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
    if (printBtn) printBtn.disabled = false;
    if (xmlBtn) xmlBtn.disabled = false;
    return;
  }
  if (payload.konto_soll && payload.konto_haben && payload.konto_soll === payload.konto_haben) {
    alert("❌ Fehler: Soll- und Haben-Konto dürfen nicht identisch sein (Gegenkonto erforderlich)!");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchung speichern';
    }
    if (printBtn) printBtn.disabled = false;
    if (xmlBtn) xmlBtn.disabled = false;
    return;
  }

  // Mitgliedsdaten auslesen
  const memberPn = document.getElementById('bhe-member-pn')?.value;
  const memberName = document.getElementById('bhe-member-name')?.value;
  const memberIban = (document.getElementById('bhe-member-iban')?.value || '').replace(/\s+/g, '').toUpperCase();
  const memberAddr = document.getElementById('bhe-member-address')?.value;
  const memberStreet = document.getElementById('bhe-member-street')?.value;
  const memberZip = document.getElementById('bhe-member-zip')?.value;
  const memberCity = document.getElementById('bhe-member-city')?.value;
  const saveIban = document.getElementById('bhe-save-iban-to-member')?.checked;

  if (exportXml && (!memberIban || !/^CH\d{2}[0-9A-Z]{17}$/.test(memberIban))) {
    alert("⚠️ Für die Erstellung der Bank-XML (pain.001) wird eine gültige Schweizer IBAN benötigt.\n\nBitte trage die IBAN des Mitglieds ein.");
    const ibanInp = document.getElementById('bhe-member-iban');
    if (ibanInp) {
      const details = document.getElementById('bhe-member-details');
      if (details) details.style.display = 'block';
      ibanInp.focus();
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchung speichern';
    }
    if (printBtn) printBtn.disabled = false;
    if (xmlBtn) xmlBtn.disabled = false;
    return;
  }
  
  // Validierung des Buchungsjahres gegenüber dem Datum
  const entryDate = new Date(payload.datum);
  const entryYear = isNaN(entryDate.getTime()) ? null : entryDate.getFullYear();
  if (entryYear && entryYear !== Number(window._bhYear)) {
    const confirmMsg = `⚠️ Buchungsdatum weicht ab!\n\nDas eingegebene Datum liegt im Jahr ${entryYear}, du buchst jedoch im aktiven Buchungsjahr ${window._bhYear}.\n\nMöchtest du diese Buchung trotzdem durchführen?`;
    if (!confirm(confirmMsg)) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchung speichern';
      }
      if (printBtn) printBtn.disabled = false;
      if (xmlBtn) xmlBtn.disabled = false;
      return;
    }
  }

  // IBAN bei Mitglied in Supabase speichern falls angehakt
  if (saveIban && memberPn && memberIban && /^CH\d{2}[0-9A-Z]{17}$/.test(memberIban)) {
    try {
      const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
      if (supa) {
        await supa.from('members').update({ iban: memberIban }).eq('person_number', parseInt(memberPn, 10));
        const cachedM = (window._bhMembers || []).find(x => String(x.person_number) === String(memberPn));
        if (cachedM) cachedM.iban = memberIban;
      }
    } catch (mErr) {
      console.warn("⚠️ Fehler beim Aktualisieren der IBAN in members:", mErr);
    }
  }

  const recipientData = memberName ? {
    name: memberName,
    iban: memberIban,
    address: memberAddr,
    street: memberStreet,
    zip: memberZip,
    city: memberCity,
    personNumber: memberPn
  } : null;
  
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
      bhPrintJournalBeleg([savedEntry], payload.beschreibung, recipientData);
    }

    if (exportXml && recipientData && recipientData.iban) {
      bhDownloadPain001Xml([savedEntry], recipientData);
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
    if (printBtn) printBtn.disabled = false;
    if (xmlBtn) xmlBtn.disabled = false;
  }
};

// =====================================================================
// MODUL-ERKENNUNG & STATUS-RÜCKSETZUNG BEIM LÖSCHEN VON JOURNALZEILEN
// =====================================================================

/**
 * Erkennt automatisch verknüpfte Module (Rechnungen, Jahresbeitrag, Vermietung, Inventar),
 * die mit einer oder mehreren Journalzeilen in Verbindung stehen und als bezahlt markiert sind.
 * @param {Object|Array} entries Einzelne Journalzeile oder Liste von Split-Zeilen
 * @returns {Promise<Object>} Erkannte Entitäten und Flag hasLinkedPaid
 */
window.bhDetectLinkedModulesForJournal = async function(entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;

  const result = {
    hasLinkedPaid: false,
    invoices: [],
    contributions: [],
    rentals: [],
    deposits: [],
    allBelegs: []
  };

  if (!list.length || !supa) return result;

  const entryIds = list.map(e => Number(e.id)).filter(id => !isNaN(id) && id > 0);
  const belegs = new Set();
  list.forEach(e => {
    const b = String(e.beleg_nr || '').trim();
    if (b) {
      belegs.add(b);
      const base = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(b) : b.replace(/[a-z]$/i, '');
      if (base) belegs.add(base);
    }
  });
  result.allBelegs = Array.from(belegs);

  // Rechnungsnummern & Vermietungsnummern aus Buchungstexten parsen (z.B. MV-26-0396, VM-2026-001, RE-2026-0005, V-2026-001)
  const invIdRegex = /\b((?:MV|VM|RE|INV|DEP|DP|VT|V|JB|RE-JB)-\d{2,4}-[\w-]+)\b/gi;
  const parsedInvIds = new Set();
  const rentalNrRegex = /\b(V-\d{4}-\d{3,4})\b/gi;
  const parsedRentalNrs = new Set();

  list.forEach(e => {
    const text = String(e.beschreibung || '');
    let m;
    while ((m = invIdRegex.exec(text)) !== null) {
      parsedInvIds.add(m[1].trim());
    }
    while ((m = rentalNrRegex.exec(text)) !== null) {
      parsedRentalNrs.add(m[1].trim());
    }
  });

  // 1. invoice_payments nach journal_entry_id oder document_ref durchsuchen
  const foundInvoiceIds = new Set(parsedInvIds);

  try {
    const filters = [];
    if (entryIds.length > 0) {
      filters.push(`journal_entry_id.in.(${entryIds.join(',')})`);
    }
    if (result.allBelegs.length > 0) {
      filters.push(`document_ref.in.(${result.allBelegs.join(',')})`);
    }
    if (filters.length > 0) {
      const { data: payRows } = await supa.from('invoice_payments')
        .select('id, invoice_id, journal_entry_id, document_ref')
        .or(filters.join(','));
      if (payRows && payRows.length > 0) {
        payRows.forEach(p => {
          if (p.invoice_id) foundInvoiceIds.add(String(p.invoice_id));
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ [bhDetectLinked] Hinweis bei invoice_payments Abfrage:", err);
  }

  // 2. Invoices abfragen (nach gefundenen IDs oder Beleg-Referenz)
  try {
    const invFilters = [];
    if (foundInvoiceIds.size > 0) {
      invFilters.push(`id.in.(${Array.from(foundInvoiceIds).join(',')})`);
    }
    if (result.allBelegs.length > 0) {
      invFilters.push(`document_ref.in.(${result.allBelegs.join(',')})`);
    }
    if (invFilters.length > 0) {
      const { data: invRows } = await supa.from('invoices')
        .select('id, recipient_name, total_amount, open_amount, status, type, source_module, source_id, document_ref')
        .or(invFilters.join(','));
      if (invRows && invRows.length > 0) {
        invRows.forEach(inv => {
          result.invoices.push(inv);
          if (inv.status === 'bezahlt' || inv.status === 'teilbezahlt') {
            result.hasLinkedPaid = true;
          }
          if (inv.source_module === 'vermietung' || String(inv.id).startsWith('VM-') || String(inv.source_id).startsWith('V-')) {
            parsedRentalNrs.add(inv.source_id || inv.id);
          }
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ [bhDetectLinked] Hinweis bei invoices Abfrage:", err);
  }

  // In-Memory Ergänzung falls Rechnungen bereits im Client geladen sind
  if (window._invoices && Array.isArray(window._invoices)) {
    window._invoices.forEach(inv => {
      const matchesId = foundInvoiceIds.has(String(inv.id));
      const matchesBeleg = inv.document_ref && result.allBelegs.includes(String(inv.document_ref));
      if ((matchesId || matchesBeleg) && !result.invoices.some(i => String(i.id) === String(inv.id))) {
        result.invoices.push(inv);
        if (inv.status === 'bezahlt' || inv.status === 'teilbezahlt') {
          result.hasLinkedPaid = true;
        }
      }
    });
  }

  // 3. Jahresbeiträge (contributions_header) prüfen
  const invIdsForContrib = result.invoices.map(i => i.id);
  try {
    const cFilters = [];
    if (invIdsForContrib.length > 0) {
      cFilters.push(`invoice_id.in.(${invIdsForContrib.join(',')})`);
    }
    if (result.allBelegs.length > 0) {
      cFilters.push(`document_ref.in.(${result.allBelegs.join(',')})`);
    }
    if (cFilters.length > 0) {
      const { data: cRows } = await supa.from('contributions_header')
        .select('id, person_number, year, status, gesamt, invoice_id, document_ref')
        .or(cFilters.join(','));
      if (cRows && cRows.length > 0) {
        cRows.forEach(c => {
          result.contributions.push(c);
          if (c.status === 'bezahlt') {
            result.hasLinkedPaid = true;
          }
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ [bhDetectLinked] Hinweis bei contributions_header Abfrage:", err);
  }

  // 4. Vermietungen (rental_requests) prüfen
  try {
    const rFilters = [];
    if (invIdsForContrib.length > 0) {
      rFilters.push(`invoice_id.in.(${invIdsForContrib.join(',')})`);
    }
    if (parsedRentalNrs.size > 0) {
      rFilters.push(`booking_number.in.(${Array.from(parsedRentalNrs).join(',')})`);
    }
    if (rFilters.length > 0) {
      const { data: rentRows } = await supa.from('rental_requests')
        .select('id, booking_number, first_name, last_name, status, is_paid, status_raiffeisen, invoice_id')
        .or(rFilters.join(','));
      if (rentRows && rentRows.length > 0) {
        rentRows.forEach(r => {
          result.rentals.push(r);
          if (r.status === 'paid' || r.is_paid || r.status_raiffeisen === 'fibu_gebucht') {
            result.hasLinkedPaid = true;
          }
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ [bhDetectLinked] Hinweis bei rental_requests Abfrage:", err);
  }

  // 5. Inventar-Depots (inventory_deposits) prüfen
  if (invIdsForContrib.length > 0) {
    try {
      const { data: depRows } = await supa.from('inventory_deposits')
        .select('id, member_id, item_id, category, amount, status, invoice_id')
        .in('invoice_id', invIdsForContrib);
      if (depRows && depRows.length > 0) {
        depRows.forEach(d => {
          result.deposits.push(d);
          if (d.status === 'Hinterlegt' || d.status === 'Bezahlt') {
            result.hasLinkedPaid = true;
          }
        });
      }
    } catch (err) {
      console.warn("⚠️ [bhDetectLinked] Hinweis bei inventory_deposits Abfrage:", err);
    }
  }

  return result;
};

/**
 * Setzt den Status in verknüpften Modulen kaskadierend auf «offen» zurück
 * @param {Object} linkedInfo Von bhDetectLinkedModulesForJournal ermittelte Verknüpfungen
 */
window.bhCascadeResetLinkedModules = async function(linkedInfo) {
  if (!linkedInfo) return;
  const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;
  if (!supa) return;

  const nowIso = new Date().toISOString();

  // 1. Invoices zurücksetzen
  if (linkedInfo.invoices && linkedInfo.invoices.length > 0) {
    for (const inv of linkedInfo.invoices) {
      try {
        await supa.from('invoices').update({
          status: 'offen',
          open_amount: inv.total_amount || 0,
          payment_date: null,
          payment_method: null,
          document_ref: null,
          updated_at: nowIso
        }).eq('id', inv.id);

        // Zahlungen entfernen
        await supa.from('invoice_payments').delete().eq('invoice_id', inv.id);

        // Lokalen Cache aktualisieren
        const cachedInv = (window._invoices || []).find(i => String(i.id) === String(inv.id));
        if (cachedInv) {
          cachedInv.status = 'offen';
          cachedInv.open_amount = inv.total_amount || 0;
          cachedInv.payment_date = null;
          cachedInv.payment_method = null;
          cachedInv.document_ref = null;
        }
      } catch (e) {
        console.warn(`⚠️ Fehler beim Zurücksetzen der Rechnung ${inv.id}:`, e);
      }
    }
    if (typeof window.renderRechnungen === 'function') {
      window.renderRechnungen();
    }
  }

  // 2. Jahresbeiträge (contributions_header) zurücksetzen
  if (linkedInfo.contributions && linkedInfo.contributions.length > 0) {
    for (const jb of linkedInfo.contributions) {
      try {
        await supa.from('contributions_header').update({
          status: 'offen',
          payment_date: null,
          payment_method: null,
          document_ref: null,
          updated_at: nowIso
        }).eq('id', jb.id);

        const cachedJb = (window._jbAllBeitraege || []).find(h => String(h.id) === String(jb.id));
        if (cachedJb) {
          cachedJb.status = 'offen';
          cachedJb.payment_date = null;
          cachedJb.payment_method = null;
          cachedJb.document_ref = null;
        }
      } catch (e) {
        console.warn(`⚠️ Fehler beim Zurücksetzen von Jahresbeitrag ${jb.id}:`, e);
      }
    }
  }

  // 3. Vermietung (rental_requests) zurücksetzen
  if (linkedInfo.rentals && linkedInfo.rentals.length > 0) {
    for (const r of linkedInfo.rentals) {
      try {
        await supa.from('rental_requests').update({
          status: 'confirmed',
          is_paid: false,
          status_raiffeisen: 'offen',
          datum_raiffeisen: null,
          kommentar_raiffeisen: 'Zahlungsbuchung im Journal gelöscht, Status auf bestätigt zurückgesetzt',
          updated_at: nowIso
        }).eq('id', r.id);

        await supa.from('rental_status_logs').insert([{
          rental_request_id: r.id,
          previous_status: r.status,
          new_status: 'confirmed',
          comment: 'Zahlung im Journal gelöscht, Status zurückgesetzt',
          changed_by: 'FIBU Journal'
        }]);
      } catch (e) {
        console.warn(`⚠️ Fehler beim Zurücksetzen der Vermietung ${r.id}:`, e);
      }
    }
  }

  // 4. Inventar-Depots (inventory_deposits) zurücksetzen
  if (linkedInfo.deposits && linkedInfo.deposits.length > 0) {
    for (const dep of linkedInfo.deposits) {
      try {
        await supa.from('inventory_deposits').update({
          status: 'Offen',
          updated_at: nowIso
        }).eq('id', dep.id);
      } catch (e) {
        console.warn(`⚠️ Fehler beim Zurücksetzen von Depot ${dep.id}:`, e);
      }
    }
  }

  // 5. CAMT-Transaktionen im Bankabgleich wieder freigeben (alreadyBooked = false)
  if (window._bhBankMatchResults && window._bhBankMatchResults.length > 0) {
    const invIds = (linkedInfo.invoices || []).map(i => String(i.id));
    const belegs = (linkedInfo.allBelegs || []);
    window._bhBankMatchResults.forEach(tx => {
      const matchInvId = tx.matchedInvoice ? String(tx.matchedInvoice.id) : null;
      const matchBeleg = tx.matchedBeleg ? String(tx.matchedBeleg) : null;
      if ((matchInvId && invIds.includes(matchInvId)) || (matchBeleg && belegs.includes(matchBeleg))) {
        tx.alreadyBooked = false;
        delete tx.bookedDate;
      }
    });
    if (typeof bhBankRenderResults === 'function' && window._bhBankActiveFilter) {
      bhBankRenderResults(window._bhBankActiveFilter);
    }
  }
};

// =====================================================================
// LÖSCH-WORKFLOW & ENTSCHEIDUNGS-MODAL
// =====================================================================

// Einstiegspunkt beim Klick auf den Lösch-Button einer Journalzeile
window.bhDeleteJournalEntry = async function(entryId) {
  const entry = (window._bhJournal || []).find(j => Number(j.id) === Number(entryId));
  if (!entry) return;

  const baseBeleg = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(entry.beleg_nr) : entry.beleg_nr;
  const isSplitRow = /[a-z]$/i.test(String(entry.beleg_nr || '').trim());
  const splitSiblings = isSplitRow ? (window._bhJournal || []).filter(j => {
    return Number(j.jahr) === Number(entry.jahr) && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
  }) : [];

  if (splitSiblings.length > 1) {
    await bhOpenDeleteSplitModal(entry, splitSiblings);
    return;
  }

  // Modulverknüpfungen für Einzelbuchung ermitteln
  const linkedInfo = await bhDetectLinkedModulesForJournal(entry);
  bhOpenDeleteJournalModal(entry, linkedInfo);
};

/**
 * Zeigt das Lösch- und Entscheidungsmodal für einen Buchungssatz an
 */
window.bhOpenDeleteJournalModal = function(entry, linkedInfo) {
  let modalEl = document.getElementById('bhModalDeleteJournalEntry');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalDeleteJournalEntry';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  window._activeDeleteLinkedInfo = linkedInfo;
  const hasLinked = linkedInfo && linkedInfo.hasLinkedPaid;

  let linkedModulesHtml = '';
  if (hasLinked) {
    const items = [];

    // Rechnungen
    (linkedInfo.invoices || []).forEach(inv => {
      const isPaid = inv.status === 'bezahlt' || inv.status === 'teilbezahlt';
      const badgeCls = isPaid ? 'bg-success' : 'bg-secondary';
      items.push(`
        <div class="d-flex align-items-center justify-content-between bg-white p-2.5 rounded-2 border mb-2 shadow-sm">
          <div>
            <span class="badge bg-primary me-2"><i class="fas fa-file-invoice me-1"></i>Rechnung</span>
            <strong>${escapeHtml(inv.id)}</strong> &ndash; ${escapeHtml(inv.recipient_name || '')}
            <div class="text-muted small">Betrag: ${typeof fmtChf === 'function' ? fmtChf(inv.total_amount) : 'CHF ' + Number(inv.total_amount).toFixed(2)} &bull; Typ: ${escapeHtml(inv.type || inv.source_module || 'Standard')}</div>
          </div>
          <span class="badge ${badgeCls} font-monospace px-2.5 py-1.5 fs-7"><i class="fas fa-check-circle me-1"></i>${escapeHtml(inv.status.toUpperCase())}</span>
        </div>
      `);
    });

    // Jahresbeiträge
    (linkedInfo.contributions || []).forEach(c => {
      if (c.status === 'bezahlt') {
        items.push(`
          <div class="d-flex align-items-center justify-content-between bg-white p-2.5 rounded-2 border mb-2 shadow-sm">
            <div>
              <span class="badge bg-warning text-dark me-2"><i class="fas fa-id-card me-1"></i>Jahresbeitrag</span>
              <strong>Saison ${c.year}</strong> (Mitglied-Nr: ${escapeHtml(c.person_number)})
              <div class="text-muted small">Beitrag: ${typeof fmtChf === 'function' ? fmtChf(c.gesamt) : 'CHF ' + Number(c.gesamt).toFixed(2)}</div>
            </div>
            <span class="badge bg-success font-monospace px-2.5 py-1.5 fs-7"><i class="fas fa-check-circle me-1"></i>BEZAHLT</span>
          </div>
        `);
      }
    });

    // Vermietungen
    (linkedInfo.rentals || []).forEach(r => {
      items.push(`
        <div class="d-flex align-items-center justify-content-between bg-white p-2.5 rounded-2 border mb-2 shadow-sm">
          <div>
            <span class="badge bg-info text-dark me-2"><i class="fas fa-home me-1"></i>Vermietung</span>
            <strong>${escapeHtml(r.booking_number)}</strong> (${escapeHtml(r.first_name || '')} ${escapeHtml(r.last_name || '')})
            <div class="text-muted small">Status: ${escapeHtml(r.status)} &bull; Raiffeisen: ${escapeHtml(r.status_raiffeisen || '-')}</div>
          </div>
          <span class="badge bg-success font-monospace px-2.5 py-1.5 fs-7"><i class="fas fa-check-circle me-1"></i>GEBUCHT</span>
        </div>
      `);
    });

    // Depots
    (linkedInfo.deposits || []).forEach(d => {
      items.push(`
        <div class="d-flex align-items-center justify-content-between bg-white p-2.5 rounded-2 border mb-2 shadow-sm">
          <div>
            <span class="badge bg-secondary me-2"><i class="fas fa-box me-1"></i>Inventar-Depot</span>
            <strong>${escapeHtml(d.category || d.item_id || 'Depot')}</strong> (Mitglied: ${escapeHtml(d.member_id)})
            <div class="text-muted small">Hinterlegter Betrag: ${typeof fmtChf === 'function' ? fmtChf(d.amount) : 'CHF ' + Number(d.amount).toFixed(2)}</div>
          </div>
          <span class="badge bg-success font-monospace px-2.5 py-1.5 fs-7">${escapeHtml(d.status)}</span>
        </div>
      `);
    });

    linkedModulesHtml = `
      <div class="alert alert-warning border-2 rounded-3 mb-3 p-3">
        <div class="d-flex align-items-center mb-2">
          <i class="fas fa-exclamation-triangle text-warning fs-4 me-2"></i>
          <div>
            <strong class="text-dark">Verknüpfte Zahlungen erkannt</strong>
            <div class="small text-muted">Dieser Buchungssatz steht in direkter Verbindung mit folgenden als bezahlt markierten Datensätzen:</div>
          </div>
        </div>
        <div class="mt-2 mb-2">
          ${items.join('')}
        </div>
        <div class="small text-dark fw-bold mt-2">
          <i class="fas fa-question-circle me-1 text-primary"></i>Wie möchtest du mit dem Status in den verknüpften Modulen verfahren?
        </div>
      </div>
    `;
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content shadow-lg border-0 rounded-4">
        <div class="modal-header bg-danger text-white py-3 rounded-top-4 border-0">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-trash-alt me-2"></i>Buchungssatz löschen
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <!-- Buchungsdetails -->
          <div class="card bg-light border-0 rounded-3 mb-3 p-3">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span class="badge bg-dark font-monospace fs-7 me-1">${escapeHtml(entry.beleg_nr)}</span>
                <span class="text-muted small ms-1">${escapeHtml(entry.datum)}</span>
              </div>
              <span class="fs-5 fw-bold text-danger">${typeof fmtChf === 'function' ? fmtChf(entry.betrag) : 'CHF ' + Number(entry.betrag).toFixed(2)}</span>
            </div>
            <div class="fw-semibold text-dark mb-1">${escapeHtml(entry.beschreibung)}</div>
            <div class="text-muted small font-monospace">
              Konto Soll: <strong>${escapeHtml(entry.konto_soll)}</strong> &rarr; Haben: <strong>${escapeHtml(entry.konto_haben)}</strong>
            </div>
          </div>

          <!-- Verknüpfte Module -->
          ${linkedModulesHtml}

          ${!hasLinked ? `
            <p class="text-dark mb-0">
              Möchtest du diesen Buchungssatz wirklich unwiderruflich aus dem Journal löschen?
            </p>
          ` : ''}
        </div>
        <div class="modal-footer bg-light flex-wrap gap-2 justify-content-end p-3">
          <button type="button" class="btn btn-outline-secondary px-3" data-bs-dismiss="modal">
            Abbrechen
          </button>
          ${hasLinked ? `
            <button type="button" class="btn btn-outline-danger" onclick="bhExecuteDeleteJournalConfirmed(${entry.id}, false)">
              <i class="fas fa-trash me-1"></i>Nur Journalzeile löschen
              <div class="text-muted" style="font-size:10px;">Status bleibt «bezahlt»</div>
            </button>
            <button type="button" class="btn btn-danger fw-bold shadow-sm" onclick="bhExecuteDeleteJournalConfirmed(${entry.id}, true)">
              <i class="fas fa-undo-alt me-1.5"></i>Löschen & Status auf «offen» zurücksetzen
              <span class="badge bg-light text-danger ms-1.5">Empfohlen</span>
            </button>
          ` : `
            <button type="button" class="btn btn-danger fw-bold px-3 shadow-sm" onclick="bhExecuteDeleteJournalConfirmed(${entry.id}, false)">
              <i class="fas fa-trash-alt me-1.5"></i>Buchungssatz löschen
            </button>
          `}
        </div>
      </div>
    </div>
  `;

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
};

/**
 * Führt das Löschen einer Journalzeile mit optionaler Status-Rücksetzung aus
 */
window.bhExecuteDeleteJournalConfirmed = async function(entryId, resetStatus) {
  const modalEl = document.getElementById('bhModalDeleteJournalEntry');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }

  const entry = (window._bhJournal || []).find(j => Number(j.id) === Number(entryId));
  const linkedInfo = window._activeDeleteLinkedInfo;

  try {
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;

    // 1. Kaskadierende Statusrücksetzung falls gewünscht
    if (resetStatus && linkedInfo) {
      await bhCascadeResetLinkedModules(linkedInfo);
    }

    // 2. Buchung im Journal löschen
    if (supa) {
      await supa.from('accounting_journal').delete().eq('id', Number(entryId));
    }

    // 3. CAMT-Transaktionen freigeben falls Bankbuchung
    if (entry && window._bhBankMatchResults && window._bhBankMatchResults.length > 0) {
      const bNr = entry.beleg_nr;
      window._bhBankMatchResults.forEach(tx => {
        if (tx.matchedBeleg === bNr) {
          tx.alreadyBooked = false;
          delete tx.bookedDate;
        }
      });
      if (typeof bhBankRenderResults === 'function' && window._bhBankActiveFilter) {
        bhBankRenderResults(window._bhBankActiveFilter);
      }
    }

    // 4. Lokalen State aktualisieren
    window._bhJournal = (window._bhJournal || []).filter(j => Number(j.id) !== Number(entryId));
    recalculateLiveAccountBalances();
    updateAccountingKPIs();
    renderActiveAccountingTab();

    const successMsg = resetStatus 
      ? '🎉 Buchungssatz gelöscht und Status der verknüpften Rechnungen/Module auf «offen» zurückgesetzt!' 
      : '🎉 Buchungssatz erfolgreich aus dem Journal gelöscht!';
    showSuccess(successMsg);

    setTimeout(async () => {
      if (typeof loadBuchhaltungData === 'function') await loadBuchhaltungData(true, true);
    }, 1500);
  } catch (err) {
    alert('❌ Fehler beim Löschen der Buchung: ' + err.message);
  }
};

window.bhExecuteDeleteJournalDirect = async function(entryId) {
  await bhExecuteDeleteJournalConfirmed(entryId, false);
};

// =====================================================================
// SPLIT-VERBUND: LÖSCH-MODAL & SAMMEL-LÖSCHUNG MIT STATUS-RÜCKSETZUNG
// =====================================================================
window.bhOpenDeleteSplitModal = async function(entry, splitSiblings) {
  let modalEl = document.getElementById('bhModalDeleteSplit');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalDeleteSplit';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  const baseBeleg = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(entry.beleg_nr) : entry.beleg_nr;
  const linkedInfo = await bhDetectLinkedModulesForJournal(splitSiblings);
  window._activeDeleteSplitLinkedInfo = linkedInfo;

  const rowsHtml = splitSiblings.map((s, idx) => `
    <tr class="${s.id === entry.id ? 'table-warning fw-bold' : ''}">
      <td class="font-monospace small">${escapeHtml(s.beleg_nr)}</td>
      <td class="small">${escapeHtml(s.beschreibung)}</td>
      <td class="small text-muted">${escapeHtml(s.konto_soll)} &rarr; ${escapeHtml(s.konto_haben)}</td>
      <td class="text-end small fw-bold">${typeof fmtChf === 'function' ? fmtChf(s.betrag) : 'CHF ' + Number(s.betrag).toFixed(2)}</td>
      <td class="text-center small">${s.id === entry.id ? '<span class="badge bg-warning text-dark">Ausgewählt</span>' : ''}</td>
    </tr>
  `).join('');

  let linkedNoticeHtml = '';
  if (linkedInfo.hasLinkedPaid) {
    const invNames = linkedInfo.invoices.map(i => `${i.id} (${i.recipient_name})`).join(', ');
    linkedNoticeHtml = `
      <div class="alert alert-warning py-2.5 px-3 small rounded-3 mb-3 border-2">
        <div class="d-flex align-items-center mb-1">
          <i class="fas fa-exclamation-triangle text-warning me-2"></i>
          <strong>Verknüpfte bezahlte Rechnungen/Module gefunden:</strong>
        </div>
        <div class="small mb-2">${escapeHtml(invNames || 'Rechnung verknüpft')}</div>
        <div class="form-check form-switch p-0 ms-4">
          <input class="form-check-input" type="checkbox" id="bhSplitResetStatusCheck" checked>
          <label class="form-check-label fw-bold text-dark small" for="bhSplitResetStatusCheck">
            Status verknüpfter Rechnungen/Module wieder auf «offen» zurücksetzen (Empfohlen)
          </label>
        </div>
      </div>
    `;
  }

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

          ${linkedNoticeHtml}

          <div class="alert alert-warning py-2.5 px-3 small rounded-3 mb-0">
            <i class="fas fa-info-circle me-1"></i>
            <strong>Empfehlung:</strong> Lösche in der Regel den <strong>gesamten Beleg-Verbund</strong>, um verwaiste Buchungssätze zu vermeiden. Bei Bank-Splits wird die Banktransaktion danach im Bankabgleich wieder zur erneuten Buchung freigegeben.
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

  const resetCheck = document.getElementById('bhSplitResetStatusCheck');
  const resetStatus = resetCheck ? resetCheck.checked : false;

  await bhExecuteDeleteJournalConfirmed(entryId, resetStatus);
};

window.bhExecuteDeleteSplitGroup = async function(baseBeleg, year) {
  const modalEl = document.getElementById('bhModalDeleteSplit');
  const resetCheck = document.getElementById('bhSplitResetStatusCheck');
  const resetStatus = resetCheck ? resetCheck.checked : false;

  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }

  const siblings = (window._bhJournal || []).filter(j => {
    return Number(j.jahr) === Number(year) && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
  });

  if (siblings.length === 0) return;

  try {
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;

    // 1. Kaskadierendes Zurücksetzen verknüpfter Module
    if (resetStatus && window._activeDeleteSplitLinkedInfo) {
      await bhCascadeResetLinkedModules(window._activeDeleteSplitLinkedInfo);
    }

    // 2. Supabase Delete aller Siblings
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

    const successMsg = resetStatus
      ? `🎉 Alle ${siblings.length} Positionen des Belegs ${baseBeleg} gelöscht und Status verknüpfter Rechnungen/Module auf «offen» zurückgesetzt!`
      : `🎉 Alle ${siblings.length} Positionen des Belegs ${baseBeleg} wurden gelöscht!`;
    if (typeof showSuccess === 'function') {
      showSuccess(successMsg);
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
// SPLIT-VERBUND: GEMEINSAMES BEARBEITEN ALLER ZEILEN & NACHTRÄGLICHER SPLIT
// =====================================================================
window.bhConvertEntryToSplit = function(entryId) {
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('buchhaltung')) {
    alert("Keine Berechtigung zum Bearbeiten von Buchungen.");
    return;
  }
  const entry = (window._bhJournal || []).find(j => Number(j.id) === Number(entryId));
  if (!entry) {
    alert("Buchungssatz nicht gefunden.");
    return;
  }

  const baseBeleg = window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(entry.beleg_nr) : String(entry.beleg_nr || '').trim();
  const y = Number(entry.jahr || window._bhYear || new Date().getFullYear());

  // Falls bereits ein Verbund mit mehreren Geschwistern existiert: direkt öffnen
  const siblings = (window._bhJournal || []).filter(j => {
    return Number(j.jahr) === y && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
  });
  if (siblings.length > 1) {
    return window.bhOpenSplitGroupEditModal(baseBeleg, y);
  }

  // Schliesse das Einzelbuchungs-Modal falls geöffnet
  const entryModalEl = document.getElementById('bhModalNewEntry');
  if (entryModalEl) {
    const bsEntryModal = bootstrap.Modal.getInstance(entryModalEl);
    if (bsEntryModal) bsEntryModal.hide();
  }

  const originalAmt = Number(entry.betrag || 0);

  window._bhCurrentSplitEdit = {
    baseBeleg: baseBeleg,
    year: y,
    datum: entry.datum,
    originalSingleTotal: originalAmt,
    isConvertedFromSingle: true,
    rows: [
      {
        id: entry.id, // Verknüpfung mit existierendem Datensatz in der DB
        beleg_nr: `${baseBeleg}a`,
        beschreibung: entry.beschreibung || '',
        konto_soll: entry.konto_soll || '',
        konto_haben: entry.konto_haben || '',
        betrag: originalAmt > 0 ? (originalAmt / 2).toFixed(2) : '',
        typ: entry.typ || 'Kassa',
        datum: entry.datum
      },
      {
        beschreibung: '',
        konto_soll: entry.konto_soll || '',
        konto_haben: '',
        betrag: originalAmt > 0 ? (originalAmt - Number((originalAmt / 2).toFixed(2))).toFixed(2) : '',
        typ: entry.typ || 'Kassa',
        datum: entry.datum
      }
    ],
    deletedIds: []
  };

  window.bhOpenSplitGroupModalUI(baseBeleg, y, entry.datum);
};

window.bhOpenSplitGroupEditModal = function(baseBeleg, year) {
  const y = Number(year || window._bhYear || new Date().getFullYear());
  const siblings = (window._bhJournal || []).filter(j => {
    return Number(j.jahr) === y && (window.bhGetSplitBaseBeleg ? window.bhGetSplitBaseBeleg(j.beleg_nr) === baseBeleg : false);
  });
  siblings.sort((a, b) => String(a.beleg_nr).localeCompare(String(b.beleg_nr)));

  if (siblings.length === 0) {
    alert(`Keine Buchungssätze für den Beleg ${baseBeleg} gefunden.`);
    return;
  }

  if (siblings.length === 1) {
    return window.bhConvertEntryToSplit(siblings[0].id);
  }

  const entryModalEl = document.getElementById('bhModalNewEntry');
  if (entryModalEl) {
    const bsEntryModal = bootstrap.Modal.getInstance(entryModalEl);
    if (bsEntryModal) bsEntryModal.hide();
  }

  const origTotal = siblings.reduce((s, j) => s + (Number(j.betrag) || 0), 0);

  window._bhCurrentSplitEdit = {
    baseBeleg,
    year: y,
    datum: siblings[0].datum,
    originalSingleTotal: origTotal,
    rows: siblings.map(s => ({
      id: s.id,
      beleg_nr: s.beleg_nr,
      beschreibung: s.beschreibung,
      konto_soll: s.konto_soll,
      konto_haben: s.konto_haben,
      betrag: s.betrag,
      typ: s.typ || 'Kassa',
      datum: s.datum || siblings[0].datum
    })),
    deletedIds: []
  };

  window.bhOpenSplitGroupModalUI(baseBeleg, y, siblings[0].datum);
};

window.bhOpenSplitGroupModalUI = function(baseBeleg, year, datum) {
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
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
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
                <strong>Datum:</strong> ${escapeHtml(datum || '')} &middot;
                <strong>Jahr:</strong> ${year}
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
  if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
    window.UIModalKit.makeMovableAndResizable(modalEl);
  }
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
  const { rows, baseBeleg, originalSingleTotal } = window._bhCurrentSplitEdit;

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
  if (totalEl) {
    totalEl.innerHTML = `Total Beleg: <span class="text-primary font-monospace">CHF ${typeof fmtChf === 'function' ? fmtChf(totalSum) : totalSum.toFixed(2)}</span>`;
  }

  const summaryEl = document.getElementById('bh-sge-summary-text');
  if (summaryEl) {
    if (typeof originalSingleTotal === 'number' && originalSingleTotal > 0) {
      const diff = totalSum - originalSingleTotal;
      if (Math.abs(diff) < 0.005) {
        summaryEl.innerHTML = `${rows.length} Position(en) &middot; <span class="badge bg-success text-white"><i class="fas fa-check me-1"></i>Deckung 100% (${typeof fmtChf === 'function' ? fmtChf(originalSingleTotal) : originalSingleTotal.toFixed(2)})</span>`;
      } else {
        const diffText = (diff > 0 ? '+' : '') + (typeof fmtChf === 'function' ? fmtChf(diff) : diff.toFixed(2));
        summaryEl.innerHTML = `${rows.length} Position(en) &middot; <span class="badge bg-warning text-dark"><i class="fas fa-balance-scale me-1"></i>Original: ${typeof fmtChf === 'function' ? fmtChf(originalSingleTotal) : originalSingleTotal.toFixed(2)} (Diff: ${diffText})</span>`;
      }
    } else {
      summaryEl.textContent = `${rows.length} Position(en) im Verbund`;
    }
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
            const { data: insData, error: insErr } = await supa.from('accounting_journal').insert(jRow).select('id');
            if (insErr) throw insErr;
            if (insData && insData.length > 0) {
              vr.id = insData[0].id;
            }
          }
        }
      } catch (supaErr) {
        console.warn("⚠️ Supabase saveSplitGroupEdit Warning:", supaErr);
      }
    }

    // Supabase ist Single Source of Truth
    const updatedEntries = [];
    for (let i = 0; i < validRows.length; i++) {
      const vr = validRows[i];
      const subSuffix = validRows.length > 1 ? String.fromCharCode(97 + i) : '';
      const belegNr = `${baseBeleg}${subSuffix}`;
      const savedItem = {
        id: vr.id || (Date.now() + i),
        jahr: Number(year || new Date().getFullYear()),
        datum: vr.datum || new Date().toISOString().split('T')[0],
        beleg_nr: belegNr,
        beschreibung: vr.beschreibung,
        konto_soll: vr.konto_soll,
        konto_haben: vr.konto_haben,
        betrag: Number(vr.betrag || 0),
        typ: vr.typ || 'Kassa',
        buchungstyp: (typeof getBuchungstyp === 'function') ? getBuchungstyp(vr.konto_soll, vr.konto_haben) : 'TRANSIT'
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
    console.error("Fehler beim Speichern des Split-Verbunds:", err);
    if (window.UIConfirmKit && typeof window.UIConfirmKit.alert === 'function') {
      await window.UIConfirmKit.alert({
        title: 'Fehler beim Speichern',
        message: 'Der Split-Verbund konnte nicht gespeichert werden: ' + (err.message || err),
        type: 'danger'
      });
    } else {
      alert('❌ Fehler beim Speichern des Split-Verbunds: ' + err.message);
    }
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
window.bhConfirmDeleteSelectedJournalEntries = async function() {
  if (!window._bhSelectedJournalIds || window._bhSelectedJournalIds.size === 0) {
    alert("Bitte markiere mindestens einen Buchungssatz zum Löschen.");
    return;
  }

  const selectedEntries = (window._bhJournal || []).filter(j => window._bhSelectedJournalIds.has(Number(j.id)));
  if (selectedEntries.length === 0) {
    alert("Keine gültigen Buchungssätze für die ausgewählten IDs gefunden.");
    return;
  }

  const linkedInfo = await bhDetectLinkedModulesForJournal(selectedEntries);
  window._activeDeleteBatchLinkedInfo = linkedInfo;

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
      <td class="small font-monospace">${escapeHtml(e.konto_soll)} → ${escapeHtml(e.konto_haben)}</td>
      <td class="text-end fw-bold font-monospace small" style="white-space: nowrap;">${fmtChf(e.betrag)}</td>
    </tr>
  `).join('');

  let batchLinkedNoticeHtml = '';
  if (linkedInfo.hasLinkedPaid) {
    const invNames = linkedInfo.invoices.map(i => `${i.id} (${i.recipient_name})`).join(', ');
    batchLinkedNoticeHtml = `
      <div class="alert alert-warning py-2.5 px-3 small rounded-3 mb-3 border-2">
        <div class="d-flex align-items-center mb-1">
          <i class="fas fa-exclamation-triangle text-warning me-2"></i>
          <strong>Verknüpfte bezahlte Rechnungen/Module gefunden:</strong>
        </div>
        <div class="small mb-2">${escapeHtml(invNames || 'Verknüpfte Datensätze gefunden')}</div>
        <div class="form-check form-switch p-0 ms-4">
          <input class="form-check-input" type="checkbox" id="bhBatchResetStatusCheck" checked>
          <label class="form-check-label fw-bold text-dark small" for="bhBatchResetStatusCheck">
            Status verknüpfter Rechnungen/Module wieder auf «offen» zurücksetzen (Empfohlen)
          </label>
        </div>
      </div>
    `;
  }

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
                Möchtest du die folgenden <strong>${selectedEntries.length} Buchungssatz/-sätze</strong> mit einem Gesamtwert von 
                <strong>${fmtChf(totalAmount)}</strong> wirklich endgültig aus dem Kassabuch-Journal entfernen?
              </div>
            </div>
          </div>

          ${batchLinkedNoticeHtml}

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

  const resetCheck = document.getElementById('bhBatchResetStatusCheck');
  const resetStatus = resetCheck ? resetCheck.checked : false;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1.5" role="status" aria-hidden="true"></span>Wird gelöscht...';
  }

  try {
    const supa = (typeof getBuchhaltungSupabaseClient === 'function') ? getBuchhaltungSupabaseClient() : window.supabaseClient;

    // 1. Kaskadierendes Zurücksetzen verknüpfter Module falls gewünscht
    if (resetStatus && window._activeDeleteBatchLinkedInfo) {
      await bhCascadeResetLinkedModules(window._activeDeleteBatchLinkedInfo);
    }

    // 2. Supabase-First Batch Delete
    if (supa) {
      try {
        const { error: supaDelErr } = await supa.from('accounting_journal').delete().in('id', ids);
        if (supaDelErr) console.warn("⚠️ Supabase batch delete Warning:", supaDelErr.message);
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

    const successMsg = resetStatus
      ? `🎉 ${ids.length} Buchungssatz/-sätze gelöscht und Status verknüpfter Rechnungen/Module auf «offen» zurückgesetzt!`
      : `🎉 ${ids.length} Buchungssatz/-sätze erfolgreich aus dem Journal gelöscht!`;
    showSuccess(successMsg);

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
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('buchhaltung')) {
    alert("Keine Berechtigung zum Bearbeiten des Budgets.");
    return;
  }
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

