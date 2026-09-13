// vorstand/js/buchhaltung/buchhaltung-bank.js
// =====================================================================
// MODUL: BUCHHALTUNG - BANKABGLEICH & AUTOMATISCHE BUCHUNGSSÄTZE (CAMT.053)
// =====================================================================

window._bhBankTransactions = window._bhBankTransactions || [];
window._bhBankMatchResults = window._bhBankMatchResults || [];
window._bhBankActiveFilter = window._bhBankActiveFilter || 'all';

// Synchroner / Asynchroner Abruf der Bank-Regeln (Server-Sync + LocalStorage Fallback)
window.getBhBankRules = function() {
  try {
    let rules = [];
    if (window._bhBankServerRules && Array.isArray(window._bhBankServerRules)) {
      rules = window._bhBankServerRules;
    } else {
      const stored = localStorage.getItem('bh_bank_rules');
      rules = stored ? JSON.parse(stored) : [];
    }

    // Saubere Typisierung und Absicherung aller Felder
    return rules.map(r => {
      let updated = {
        ...r,
        label: String(r.label || ''),
        pattern_party: String(r.pattern_party !== undefined && r.pattern_party !== null ? r.pattern_party : ''),
        pattern_text: String(r.pattern_text !== undefined && r.pattern_text !== null ? r.pattern_text : ''),
        pattern: String(r.pattern !== undefined && r.pattern !== null ? r.pattern : ''),
        prefix: String(r.prefix || r.label || ''),
        soll: String(r.soll || '').split('|')[0].trim(),
        haben: String(r.haben || '').split('|')[0].trim(),
        scope: String(r.scope || 'all'),
        amount_mode: String(r.amount_mode || 'any'),
        amount_min: (r.amount_min !== undefined && r.amount_min !== null && r.amount_min !== '') ? Number(r.amount_min) : '',
        amount_max: (r.amount_max !== undefined && r.amount_max !== null && r.amount_max !== '') ? Number(r.amount_max) : ''
      };
      // Fallback/Migration: Falls neue getrennte Felder noch fehlen, aber altes pattern existiert
      if (!updated.pattern_party && !updated.pattern_text && updated.pattern) {
        if (updated.scope === 'party') {
          updated.pattern_party = updated.pattern;
        } else if (updated.scope === 'text') {
          updated.pattern_text = updated.pattern;
        } else {
          updated.pattern_party = updated.pattern;
        }
      }
      return updated;
    });
  } catch (e) {
    return [];
  }
};

window.saveBhBankRules = function(rules) {
  window._bhBankServerRules = rules;
  try {
    localStorage.setItem('bh_bank_rules', JSON.stringify(rules));
  } catch (e) {
    console.error('Fehler beim lokalen Speichern der Bank-Regeln:', e);
  }

  // Übermittlung an das zentrale Google Sheet
  try {
    apiFetch('buchhaltung', { action: 'saveBankRules', rules: rules }, 'POST')
      .then(res => res.json())
      .then(json => {
        if (json && json.success) {
          console.log('✅ Bank-Regeln erfolgreich im zentralen Google Sheet gespeichert.');
        }
      })
      .catch(err => {
        console.warn('⚠️ Hinweis: Zentrale Regel-Speicherung im Sheet:', err);
      });
  } catch (err) {
    console.warn('⚠️ Hinweis: apiFetch Fehler beim Speichern der Regeln:', err);
  }
};

// Beim Modulstart zentrale Regeln aus Google Sheet abrufen
window.fetchBhBankServerRules = function() {
  try {
    apiFetch('buchhaltung', { action: 'getBankRules' }, 'GET')
      .then(res => res.json())
      .then(json => {
        if (json && json.success && Array.isArray(json.data)) {
          const oldRulesJson = localStorage.getItem('bh_bank_rules') || '';
          const newRulesJson = JSON.stringify(json.data);
          window._bhBankServerRules = json.data;
          localStorage.setItem('bh_bank_rules', newRulesJson);
          console.log(`✅ ${json.data.length} Bank-Regeln erfolgreich aus dem zentralen Google Sheet geladen.`);
          
          // Wenn sich die Regeln nicht geändert haben, ist kein störendes Re-Rendern nötig!
          if (oldRulesJson === newRulesJson) return;

          // Falls der Nutzer gerade aktiv in einem Feld tippt, Re-Matching nicht mit Fokusverlust durchführen
          const active = document.activeElement;
          if (active && active.classList && active.classList.contains('bh-konto-input')) {
            console.log('Fokus aktiv in Konto-Eingabe, verzögere Hintergrund-Re-Matching...');
            return;
          }

          if (window._bhBankTransactions && window._bhBankTransactions.length > 0) {
            window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
            bhBankRenderResults(window._bhBankActiveFilter);
          }
        }
      })
      .catch(_ => {});
  } catch (_) {}
};

function getBhDefaultRules() {
  return [];
}

// ---------------------------------------------------------------------
// Hauptansicht: Tab "Bankabgleich (CAMT.053)"
// ---------------------------------------------------------------------
window.renderTabBankabgleich = function(container) {
  if (!container) return;

  if (typeof window.fetchBhBankServerRules === 'function') {
    window.fetchBhBankServerRules();
  }

  const hasResults = window._bhBankMatchResults && window._bhBankMatchResults.length > 0;
  const results = window._bhBankMatchResults || [];

  const jbCount = results.filter(r => r.isJahresbeitrag).length;
  const ruleCount = results.filter(r => !r.isJahresbeitrag && r.matchType === 'rule').length;
  const histCount = results.filter(r => !r.isJahresbeitrag && r.matchType === 'journal').length;
  const unklarCount = results.filter(r => r.matchScore === 0 && !r.alreadyBooked).length;

  const ibanFilterChecked = window._bhBankIbanFilterOff ? '' : 'checked';

  container.innerHTML = `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-4 mb-4">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <div>
          <h4 class="mb-1 text-primary fw-bold">
            <i class="fas fa-university me-2 text-primary"></i>Bankabgleich & Buchungszentrale
          </h4>
          <p class="text-muted small mb-0">
            CAMT.053 Kontoauszug hochladen. Das System erkennt <strong>Jahresbeiträge</strong> zum Haken im Beitragswesen sowie 
            <strong>Buchungssätze</strong> für alle Kontoaktivitäten.
          </p>
        </div>
        <div class="d-flex align-items-center gap-2">
          ${hasResults ? `
            <button class="btn btn-sm btn-outline-danger" onclick="bhBankClearTransactions()" title="Aktuell geladene Transaktionen verwerfen und Auszug neu hochladen">
              <i class="fas fa-trash-alt me-1"></i> Auszug leeren
            </button>
          ` : ''}
          <button class="btn btn-sm btn-outline-secondary" onclick="bhBankManageRulesModal()">
            <i class="fas fa-cog me-1"></i> Buchungsregeln verwalten
          </button>
        </div>
      </div>

      <!-- Drag & Drop Upload Zone -->
      <div class="card bg-light border-0 my-3" style="border: 2px dashed #0d6efd !important; border-radius: 14px; cursor: pointer; transition: all 0.2s;"
           onclick="document.getElementById('bhBankXmlInput').click()"
           ondragover="event.preventDefault(); this.style.background='#e7f1ff';"
           ondragleave="this.style.background='';"
           ondrop="event.preventDefault(); this.style.background=''; bhBankHandleFiles(event.dataTransfer.files);">
        <div class="p-4 text-center">
          <input type="file" id="bhBankXmlInput" class="d-none" accept=".xml" multiple onchange="bhBankHandleFiles(this.files)">
          <i class="fas fa-file-code fa-3x mb-2 text-primary" style="opacity:0.8;"></i>
          <h6 class="text-primary fw-bold mb-1">CAMT.053 XML-Kontoauszüge hier ablegen oder klicken</h6>
          <div class="text-muted small">Mehrfachauswahl möglich · Unterstützt: Raiffeisen, PostFinance, UBS, ZKB, etc.</div>
        </div>
      </div>

      <!-- Multi-Account & Info Bar -->
      <div class="d-flex align-items-center gap-3 mb-3 px-1 flex-wrap" style="font-size:12px;">
        <div class="d-flex align-items-center gap-2 bg-light border rounded-3 px-3 py-1.5">
          <i class="fas fa-university text-primary"></i>
          <span class="text-muted">Konto-Erkennung:</span>
          <span class="fw-semibold text-dark" id="bhBankDetectedAccountsInfo">
            ${hasResults ? bhBankGetAccountsInfoHTML() : 'Automatisch nach XML-Upload'}
          </span>
        </div>
        <div class="text-muted ms-auto">
          <i class="fas fa-layer-group me-1"></i>Kombiniert mehrere Bankkonten & geschützt gegen Duplikate
        </div>
      </div>

      <!-- Statistik-Banner -->
      <div id="bhBankStatsBanner">
        ${hasResults ? bhBankStatsBannerHTML() : ''}
      </div>

      <!-- Filter- & Action-Bar -->
      <div id="bhBankFilterBar" class="${hasResults ? 'd-flex gap-2 mb-3 flex-wrap align-items-center' : 'd-none'}">
        <button class="btn btn-sm btn-outline-primary active" id="bhBankFilterOffen" onclick="bhBankFilter('offen')">
          <i class="fas fa-hourglass-half me-1"></i>Offen (${results.filter(r => !r.alreadyBooked).length})
        </button>
        <button class="btn btn-sm btn-outline-secondary" id="bhBankFilterBooked" onclick="bhBankFilter('booked')">
          <i class="fas fa-check-double me-1"></i>Bereits gebucht (${results.filter(r => r.alreadyBooked).length})
        </button>
        <button class="btn btn-sm btn-outline-dark" id="bhBankFilterAll" onclick="bhBankFilter('all')">
          Alle (${results.length})
        </button>
        <button class="btn btn-sm btn-outline-success" id="bhBankFilterJb" onclick="bhBankFilter('jb')">
          <i class="fas fa-users me-1"></i>Jahresbeiträge (${jbCount})
        </button>
        <button class="btn btn-sm btn-outline-info text-dark" id="bhBankFilterRules" onclick="bhBankFilter('rules')">
          <i class="fas fa-magic me-1"></i>Erkannte Regeln (${ruleCount + histCount})
        </button>
        <button class="btn btn-sm btn-outline-warning text-dark" id="bhBankFilterUnklar" onclick="bhBankFilter('unklar')">
          <i class="fas fa-question-circle me-1"></i>Unklar (${unklarCount})
        </button>
        
        <button class="btn btn-sm btn-success ms-auto fw-bold shadow-sm" id="bhBtnBookAll" onclick="bhBankBookAll()">
          <i class="fas fa-bolt me-1"></i>Alle sicheren Buchungen ausführen
        </button>
      </div>

      <!-- Ergebnistabelle Container -->
      <div id="bhBankResultsContainer">
        ${hasResults ? '' : `
          <div class="text-center text-muted py-5">
            <i class="fas fa-file-invoice fa-3x mb-3" style="opacity:0.2;"></i>
            <h6>Noch keine Bankdatei geladen</h6>
            <p class="small text-muted">Lade eine CAMT.053 XML-Datei hoch, um Transaktionen abzugleichen und zu buchen.</p>
          </div>
        `}
      </div>
    </div>
  `;

  if (hasResults) {
    bhBankRenderResults(window._bhBankActiveFilter);
  }
};

// ---------------------------------------------------------------------
// Stats-Banner HTML
// ---------------------------------------------------------------------
function bhBankStatsBannerHTML() {
  const results = window._bhBankMatchResults || [];
  const jbRows = results.filter(r => r.isJahresbeitrag);
  const ruleRows = results.filter(r => !r.isJahresbeitrag && (r.matchType === 'rule' || r.matchType === 'journal' || r.matchType === 'heuristic'));
  const unklarRows = results.filter(r => r.matchScore === 0 && !r.alreadyBooked);
  const bookedRows = results.filter(r => r.alreadyBooked);

  const totalIn  = results.filter(r => r.isCredit).reduce((s, r) => s + r.amount, 0);
  const totalOut = results.filter(r => !r.isCredit).reduce((s, r) => s + r.amount, 0);

  return `
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-success bg-light">
          <div class="small text-muted">Gutschriften / Eingänge</div>
          <div class="fs-5 fw-bold text-success">+ CHF ${totalIn.toFixed(2)}</div>
          <div class="text-muted small">${results.filter(r => r.isCredit).length} Transaktionen</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-danger bg-light">
          <div class="small text-muted">Belastungen / Ausgänge</div>
          <div class="fs-5 fw-bold text-danger">- CHF ${totalOut.toFixed(2)}</div>
          <div class="text-muted small">${results.filter(r => !r.isCredit).length} Transaktionen</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-primary bg-light">
          <div class="small text-muted">Jahresbeiträge / Regeltreffer</div>
          <div class="fs-5 fw-bold text-primary">${jbRows.length + ruleRows.length}</div>
          <div class="text-muted small">${jbRows.length} Beiträge · ${ruleRows.length} Regeln</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-warning bg-light">
          <div class="small text-muted">Offen / Bereits gebucht</div>
          <div class="fs-5 fw-bold text-dark">${unklarRows.length} offen</div>
          <div class="text-muted small">${bookedRows.length} bereits gebucht</div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Render Results Table
// ---------------------------------------------------------------------
window._bhBankSortCol = window._bhBankSortCol || 'date';
window._bhBankSortAsc = window._bhBankSortAsc !== undefined ? window._bhBankSortAsc : false;

window.bhBankSortTable = function(col) {
  if (window._bhBankSortCol === col) {
    window._bhBankSortAsc = !window._bhBankSortAsc;
  } else {
    window._bhBankSortCol = col;
    window._bhBankSortAsc = (col === 'party' || col === 'date') ? true : false;
  }
  bhBankRenderResults(window._bhBankActiveFilter);
};

function formatSwissDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (s.includes('T')) {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      const d = String(dt.getDate()).padStart(2, '0');
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const y = dt.getFullYear();
      return `${d}.${m}.${y}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  }
  return s;
}

function toNormalizedIsoDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (s.includes('T')) {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split('.');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return s;
}

// ---------------------------------------------------------------------
// Hilfsfunktion: Sucht im Kontenrahmen nach passenden Sachkonten (Nummer, Name, Wörter)
// ---------------------------------------------------------------------
function bhFindMatchingKonten(query) {
  if (!query) return [];
  const q = String(query).toLowerCase().trim();
  const konten = window._bhKontenrahmen || [];
  
  // 1. Exakte Kontonummer (z.B. "6701" oder "1020")
  const exactCode = konten.find(k => String(k.konto).trim() === q);
  if (exactCode) return [exactCode];

  // 2. Kontonummer beginnt mit q (z.B. "67" -> 6700, 6701...)
  const codeStarts = konten.filter(k => String(k.konto).trim().startsWith(q));
  
  // 3. Bezeichnung beginnt mit q (z.B. "gesc" -> Geschenke...)
  const nameStarts = konten.filter(k => (k.bezeichnung || '').toLowerCase().startsWith(q));
  
  // 4. Wort in Bezeichnung beginnt mit q (z.B. "helfer" -> ... & Helfer-Essen)
  const wordStarts = konten.filter(k => {
    if (nameStarts.includes(k)) return false;
    const words = (k.bezeichnung || '').toLowerCase().split(/[\s,./\-&]+/);
    return words.some(w => w.startsWith(q));
  });

  // 5. Bezeichnung enthält q
  const nameContains = konten.filter(k => 
    !nameStarts.includes(k) && !wordStarts.includes(k) && (k.bezeichnung || '').toLowerCase().includes(q)
  );
  
  // 6. Code enthält q
  const codeContains = konten.filter(k => 
    !codeStarts.includes(k) && String(k.konto).includes(q)
  );

  return [...codeStarts, ...nameStarts, ...wordStarts, ...nameContains, ...codeContains];
}

// Tastatur-Erfassung (Power-User UX): [Enter] & [Tab] übernehmen automatisch den Treffer
if (typeof window !== 'undefined' && !window._bhKontoInputListenersAttached) {
  window._bhKontoInputListenersAttached = true;

  // 1. Tastatur-Erkennung: Markieren nur bei Tastatur-Navigation (Tab/Enter), NIE beim Mausklick/Scrollen
  let _isKeyboardNav = false;
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab' || e.key === 'Enter') {
      _isKeyboardNav = true;
    }
  }, true);
  document.addEventListener('mousedown', function() {
    _isKeyboardNav = false;
  }, true);

  document.addEventListener('focusin', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('bh-konto-input')) {
      if (_isKeyboardNav) {
        setTimeout(() => {
          try { e.target.select(); } catch (_) {}
        }, 30);
      }
    }
  });

  // 2. Während des Tippens: Stabiles visuelles Feedback OHNE Layout-Verschiebung / ohne is-valid-Icon
  document.addEventListener('input', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('bh-konto-input')) {
      const input = e.target;
      const val = input.value.trim();
      if (!val || val.includes('|')) {
        input.style.borderColor = '';
        input.style.boxShadow = '';
        return;
      }
      const matches = bhFindMatchingKonten(val);
      if (matches.length === 1) {
        input.style.borderColor = '#198754';
        input.style.boxShadow = '0 0 0 0.2rem rgba(25, 135, 84, 0.25)';
        input.title = `💡 1 Treffer: ${matches[0].konto} | ${matches[0].bezeichnung} (Drücke [Enter] oder [Tab] zum Übernehmen)`;
      } else {
        input.style.borderColor = '';
        input.style.boxShadow = '';
        input.title = 'Tippe Suchbegriff und drücke [Enter] oder [Tab] zum automatischen Übernehmen';
      }
    }
  });

  // 3. Tastaturbedienung: Enter & Tab übernehmen automatisch den besten/letzten Treffer und springen weiter
  document.addEventListener('keydown', function(e) {
    if (!e.target || !e.target.classList || !e.target.classList.contains('bh-konto-input')) return;
    const input = e.target;

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      const matches = bhFindMatchingKonten(val);
      if (matches.length > 0) {
        input.value = `${matches[0].konto} | ${matches[0].bezeichnung}`;
        input.style.borderColor = '';
        input.style.boxShadow = '';
        input.dispatchEvent(new Event('change'));
      }

      // Smarter Fokus-Sprung für blitzschnelles Arbeiten ohne Maus:
      // Vom Soll-Konto direkt ins Haben-Konto
      if (input.id && input.id.startsWith('bh-soll-')) {
        const realI = input.id.replace('bh-soll-', '');
        const habenInput = document.getElementById('bh-haben-' + realI);
        if (habenInput) {
          habenInput.focus({ preventScroll: true });
          try { habenInput.select(); } catch (_) {}
        }
      } 
      // Vom Haben-Konto direkt auf den "Buchen"-Button dieser Zeile
      else if (input.id && input.id.startsWith('bh-haben-')) {
        const tr = input.closest('tr');
        const bookBtn = tr ? tr.querySelector('button.btn-success') : null;
        if (bookBtn) {
          bookBtn.focus({ preventScroll: true });
        }
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      const val = input.value.trim();
      if (val && !val.includes('|')) {
        const matches = bhFindMatchingKonten(val);
        if (matches.length > 0) {
          input.value = `${matches[0].konto} | ${matches[0].bezeichnung}`;
          input.style.borderColor = '';
          input.style.boxShadow = '';
          input.dispatchEvent(new Event('change'));
        }
      }
    }
  });

  // 4. Verlassen des Feldes (Blur): Unvollständige Eingabe (z.B. "gesc") automatisch auflösen
  document.addEventListener('focusout', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('bh-konto-input')) {
      const input = e.target;
      const val = input.value.trim();
      if (val && !val.includes('|')) {
        const matches = bhFindMatchingKonten(val);
        if (matches.length > 0) {
          input.value = `${matches[0].konto} | ${matches[0].bezeichnung}`;
          input.style.borderColor = '';
          input.style.boxShadow = '';
          input.dispatchEvent(new Event('change'));
        }
      }
    }
  });
}

window._bhUpdateTxRemittance = function(idx, val) {
  const rows = window._bhBankMatchResults || [];
  if (rows[idx]) {
    rows[idx].remittanceInfo = val;
    rows[idx]._customRemittance = val;
    rows[idx]._customRemittanceEdited = true;
  }
};

function bhBankRenderResults(filter) {
  const container = document.getElementById('bhBankResultsContainer');
  if (!container) return;

  const rows = window._bhBankMatchResults || [];
  if (!rows.length) return;

  const activeFilter = filter || window._bhBankActiveFilter || 'offen';
  window._bhBankActiveFilter = activeFilter;

  let filtered = [...rows];
  if (activeFilter === 'offen')  filtered = rows.filter(r => !r.alreadyBooked);
  if (activeFilter === 'booked') filtered = rows.filter(r => r.alreadyBooked);
  if (activeFilter === 'jb')     filtered = rows.filter(r => r.isJahresbeitrag);
  if (activeFilter === 'rules')  filtered = rows.filter(r => !r.isJahresbeitrag && (r.matchType === 'rule' || r.matchType === 'journal' || r.matchType === 'heuristic'));
  if (activeFilter === 'unklar') filtered = rows.filter(r => r.matchScore === 0 && !r.alreadyBooked);

  // Sortierung auf alle Spalten anwenden
  const col = window._bhBankSortCol || 'date';
  const asc = window._bhBankSortAsc;

  filtered.sort((a, b) => {
    let res = 0;
    if (col === 'date') {
      res = new Date(a.bookingDate || 0) - new Date(b.bookingDate || 0);
    } else if (col === 'party') {
      res = (a.partyName || '').localeCompare(b.partyName || '', 'de');
    } else if (col === 'amount') {
      res = (a.amount || 0) - (b.amount || 0);
    } else if (col === 'remittance') {
      res = (a.remittanceInfo || '').localeCompare(b.remittanceInfo || '', 'de');
    } else if (col === 'status') {
      const scoreA = a.alreadyBooked ? -2 : (a.alreadyPaidJb ? -1 : (a.isJahresbeitrag ? 2 : (a.matchScore || 0)));
      const scoreB = b.alreadyBooked ? -2 : (b.alreadyPaidJb ? -1 : (b.isJahresbeitrag ? 2 : (b.matchScore || 0)));
      res = scoreA - scoreB;
    } else if (col === 'type') {
      res = (a.matchLabel || '').localeCompare(b.matchLabel || '', 'de');
    } else if (col === 'soll') {
      res = (a.suggestedSoll || '').localeCompare(b.suggestedSoll || '');
    } else if (col === 'haben') {
      res = (a.suggestedHaben || '').localeCompare(b.suggestedHaben || '');
    }
    return asc ? res : -res;
  });

  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));
  const kontenrahmen = window._bhKontenrahmen || [];

  function makeKontoSelectHTML(id, selectedVal, accountClassHint) {
    const matchedKonto = kontenrahmen.find(k => String(k.konto).trim() === String(selectedVal).trim());
    const displayVal = matchedKonto ? `${matchedKonto.konto} | ${matchedKonto.bezeichnung}` : (selectedVal ? String(selectedVal) : '');

    return `<input type="text" id="${id}" list="bh-konten-datalist" class="form-control form-control-sm bh-konto-input" placeholder="Ziffern/Name..." value="${escHtml(displayVal)}" style="font-size:12px; min-width:160px;" autocomplete="off" title="Tippe Suchbegriff und drücke [Enter] oder [Tab] zum automatischen Übernehmen">`;
  }

  const realIdxMap = filtered.map(r => rows.indexOf(r));

  const rowsHTML = filtered.map((r, idx) => {
    const realI = realIdxMap[idx];
    const isCredit = r.isCredit;

    let statusBadge = '';
    if (r.isWrongYear) {
      statusBadge = `<span class="badge bg-secondary opacity-75" title="🔒 FALSCHES BUCHUNGSJAHR: Diese Transaktion stammt aus ${r.txYear}, oben ist Buchhaltungsjahr ${window._bhYear} gewählt. Bitte oben Jahr umschalten!"><i class="fas fa-calendar-times me-1"></i>Jahr ${r.txYear} (Falsches Jahr)</span>`;
    } else if (r.alreadyBooked) {
      statusBadge = '<span class="badge bg-secondary opacity-75" title="🔒 GSCHÜTZT: Diese Buchung existiert bereits im Kassabuch-Journal. Sie ist vor Doppelbuchung geschützt."><i class="fas fa-check-double me-1"></i>Bereits im Journal</span>';
    } else if (r.isJahresbeitrag) {
      if (r.alreadyPaidJb) {
        statusBadge = '<span class="badge bg-success opacity-75" title="🔒 BEITRAG ERLEDIGT: Der Jahresbeitrag für dieses Mitglied wurde für dieses Jahr bereits verbucht."><i class="fas fa-check me-1"></i>Beitrag bezahlt</span>';
      } else if (r.matchScore >= 2) {
        statusBadge = '<span class="badge bg-success" title="✅ BEITRAGS-TREFFER: Eindeutig erkanntes Mitglied. Klicke \'Buchen\' um Beitrag abzuhaken und ins Journal einzutragen."><i class="fas fa-user-check me-1"></i>Beitrag Treffer</span>';
      } else {
        statusBadge = '<span class="badge bg-warning text-dark" title="⚠️ UNSICHERER BEITRAG: Namens- oder Betragsabweichung. Bitte Mitglied und Konto prüfen."><i class="fas fa-exclamation-triangle me-1"></i>Unsicherer Beitrag</span>';
      }
    } else if (r.matchType === 'rule') {
      statusBadge = `<span class="badge bg-info text-dark" title="⚡ REGEL-TREFFER: Durch benutzerdefinierte Regel \'${escHtml(r.matchRuleName)}\' erkannt. Konten sind vorausgefüllt. Bereit zum Buchen."><i class="fas fa-magic me-1"></i>Regel: ${escHtml(r.matchRuleName)}</span>`;
    } else if (r.matchType === 'journal') {
      statusBadge = '<span class="badge bg-primary text-white" title="💡 HISTORIE-TREFFER: Noch NICHT gebucht! Kontenvorschlag basiert auf deinen früheren Buchungen. Klicke \'Buchen\' zum Ausführen."><i class="fas fa-history me-1"></i>Historie Treffer</span>';
    } else if (r.matchType === 'heuristic') {
      statusBadge = '<span class="badge bg-light text-dark border" title="💡 SMART VORSCHLAG: Noch NICHT gebucht. Basiskonten nach Vorzeichen vorausgefüllt."><i class="fas fa-lightbulb me-1"></i>Vorschlag</span>';
    } else {
      statusBadge = '<span class="badge bg-warning text-dark" title="❓ OFFEN: Keine automatische Regel gefunden. Bitte Soll- und Haben-Konto wählen."><i class="fas fa-question-circle me-1"></i>Offen</span>';
    }

    if (r.isVerbandsschiessen && !r.alreadyBooked && !r.isWrongYear) {
      statusBadge += `<br><span class="badge bg-warning text-dark mt-1" style="font-size:10px;" title="${escHtml(r.splitHint)}"><i class="fas fa-exclamation-triangle me-1"></i>Wettschiessen / Split</span>`;
    }

    let matchInfo = '';
    if (r.isJahresbeitrag && r.matchedMember) {
      const m = r.matchedMember;
      matchInfo = `<div class="fw-semibold text-primary" style="font-size:12px;">
        <i class="fas fa-user me-1"></i>${escHtml(m.FirstName)} ${escHtml(m.LastName)}
      </div>
      <div class="text-muted" style="font-size:10px;">Mitglieds-Nr: ${m.PersonNumber || '–'}</div>`;
    } else {
      matchInfo = `<div class="text-muted" style="font-size:11px;">${escHtml(r.matchLabel || 'Manuelle Buchung')}</div>`;
    }

    const sollSelectId = `bh-soll-${realI}`;
    const habenSelectId = `bh-haben-${realI}`;

    let actionButtons = '';
    if (r.isWrongYear) {
      actionButtons = `<span class="badge bg-light text-danger border px-2 py-1.5" title="🔒 Transaktion aus ${r.txYear} kann nicht im Buchhaltungsjahr ${window._bhYear} gebucht werden. Bitte oben Jahr umschalten!"><i class="fas fa-ban me-1"></i>Jahr ${r.txYear}</span>`;
    } else if (canEdit && !r.alreadyBooked) {
      const splitBtnClass = r.isVerbandsschiessen ? 'btn-warning text-dark fw-bold' : 'btn-outline-secondary';
      actionButtons = `
        <button class="btn btn-sm btn-success py-1 px-2 me-1" onclick="bhBankBookOne(${realI})" title="Buchungssatz ausführen und ins Kassabuch eintragen">
          <i class="fas fa-check me-1"></i>Buchen
        </button>
        <button class="btn btn-sm ${splitBtnClass} py-1 px-2 me-1" onclick="bhBankOpenSplitModal(${realI})" title="Betrag in mehrere Zeilen aufteilen (z.B. 1190 Transit & 4210 Nachwuchsförderung)">
          <i class="fas fa-columns me-1"></i>Split
        </button>
        <button class="btn btn-sm btn-outline-secondary py-1 px-2" onclick="bhBankSaveRuleModal(${realI})" title="Dauerhafte automatische Regel für diesen Absender/Text merken">
          <i class="fas fa-plus-circle"></i>
        </button>
      `;
    } else if (r.alreadyBooked) {
      actionButtons = `<span class="badge bg-light text-secondary border px-2 py-1.5" title="🔒 Bereits im Kassabuch erfasst. Doppelbuchung geschützt."><i class="fas fa-lock me-1"></i>Geschützt</span>`;
    }

    const amountClass = isCredit ? 'text-success' : 'text-danger';
    const amountSign  = isCredit ? '+' : '-';
    const rowBg = (r.alreadyBooked || r.isWrongYear) ? 'table-secondary text-muted' : (r.isJahresbeitrag ? 'table-light' : '');

    return `
      <tr class="${rowBg}" ${(r.alreadyBooked || r.isWrongYear) ? 'style="opacity:0.65;"' : ''}>
        <td class="small" style="white-space:nowrap;">
          <span class="fw-bold">${formatSwissDate(r.bookingDate)}</span>
          ${r.accountIban ? `<br><span class="badge bg-light text-muted border" style="font-size:9px;" title="Konto: ${escHtml(r.accountIban)}">${escHtml(r.accountIban.slice(-8))}</span>` : ''}
        </td>
        <td>
          <span class="fw-bold">${escHtml(r.partyName || '–')}</span>
          ${r.partyCity ? `<br><small class="text-muted">${escHtml(r.partyPLZ)} ${escHtml(r.partyCity)}</small>` : ''}
        </td>
        <td class="text-end fw-bold ${amountClass}" style="white-space:nowrap;">
          ${amountSign} CHF ${Number(r.amount || 0).toFixed(2)}
        </td>
        <td style="min-width: 220px;">
          ${(r.alreadyBooked || r.isWrongYear) ? `
            <small class="text-muted d-block" style="white-space: normal; word-break: break-word;" title="${escHtml(r.remittanceInfo || '–')}">
              ${escHtml(r.remittanceInfo || '–')}
            </small>
          ` : `
            <input type="text" id="bh-rmt-${realI}" class="form-control form-control-sm bh-rmt-input"
              value="${escHtml(r.remittanceInfo || '')}"
              placeholder="Verwendungszweck / Buchungstext..."
              title="Klicken zum Anpassen des Verwendungszwecks / Buchungstextes"
              style="font-size: 12px; min-width: 210px;"
              oninput="window._bhUpdateTxRemittance(${realI}, this.value)">
          `}
        </td>
        <td>${statusBadge}</td>
        <td>${matchInfo}</td>
        <td style="min-width: 150px;">
          ${makeKontoSelectHTML(sollSelectId, r.suggestedSoll, 'soll')}
        </td>
        <td style="min-width: 150px;">
          ${makeKontoSelectHTML(habenSelectId, r.suggestedHaben, 'haben')}
        </td>
        ${canEdit ? `<td><div class="d-flex align-items-center">${actionButtons}</div></td>` : ''}
      </tr>
    `;
  }).join('');

  function sortHeaderHTML(colKey, label, alignRight = false) {
    const isCurrent = window._bhBankSortCol === colKey;
    const icon = isCurrent ? (window._bhBankSortAsc ? ' <i class="fas fa-sort-up text-primary"></i>' : ' <i class="fas fa-sort-down text-primary"></i>') : ' <i class="fas fa-sort opacity-25"></i>';
    const alignClass = alignRight ? 'text-end' : '';
    return `<th class="${alignClass}" style="cursor:pointer; user-select:none; position:relative;" onclick="bhBankSortTable('${colKey}')" title="Klicken zum Sortieren / Rand ziehen zum Anpassen der Breite">${label}${icon}</th>`;
  }

  let datalistOptions = kontenrahmen.map(k => {
    return `<option value="${String(k.konto).trim()} | ${escHtml(k.bezeichnung)}"></option>`;
  }).join('');

  // Aktiven Fokus, Position und Eingabewert merken
  const prevScrollY = window.scrollY;
  const oldTableContainer = container.querySelector('.table-responsive');
  const prevScrollLeft = oldTableContainer ? oldTableContainer.scrollLeft : 0;

  const activeEl = document.activeElement;
  let focusedInputId = null;
  let focusedInputVal = null;
  let selStart = null;
  let selEnd = null;
  if (activeEl && activeEl.id && activeEl.classList && (activeEl.classList.contains('bh-konto-input') || activeEl.classList.contains('bh-rmt-input'))) {
    focusedInputId = activeEl.id;
    focusedInputVal = activeEl.value;
    try {
      selStart = activeEl.selectionStart;
      selEnd = activeEl.selectionEnd;
    } catch (_) {}
  }

  container.innerHTML = `
    <datalist id="bh-konten-datalist">
      ${datalistOptions}
    </datalist>
    <div class="table-responsive">
      <table id="bhBankTable" class="table table-hover table-sm align-middle mb-0" style="font-size: 13px;">
        <thead class="table-dark sticky-top">
          <tr>
            ${sortHeaderHTML('date', 'Datum')}
            ${sortHeaderHTML('party', 'Zahler / Empfänger')}
            ${sortHeaderHTML('amount', 'Betrag', true)}
            ${sortHeaderHTML('remittance', 'Verwendungszweck')}
            ${sortHeaderHTML('status', 'Status')}
            ${sortHeaderHTML('type', 'Zuordnung / Typ')}
            ${sortHeaderHTML('soll', 'Soll-Konto')}
            ${sortHeaderHTML('haben', 'Haben-Konto')}
            ${canEdit ? '<th>Aktion</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="text-muted small mt-2 px-1">${filtered.length} von ${rows.length} Buchungen angezeigt</div>
  `;

  // Scrollposition sofort stabilisieren
  if (window.scrollY !== prevScrollY) {
    window.scrollTo({ top: prevScrollY, behavior: 'instant' });
  }
  const newTableContainer = container.querySelector('.table-responsive');
  if (newTableContainer && prevScrollLeft) {
    newTableContainer.scrollLeft = prevScrollLeft;
  }

  setTimeout(() => {
    bhMakeTableResizable(document.getElementById('bhBankTable'));
    
    // 1. Falls der Nutzer vor dem Re-Render in einem Feld war: Fokus und Cursor nahtlos wiederherstellen OHNE Scroll-Sprung!
    if (focusedInputId) {
      const restored = document.getElementById(focusedInputId);
      if (restored) {
        if (focusedInputVal !== null && focusedInputVal !== restored.value) {
          restored.value = focusedInputVal;
        }
        restored.focus({ preventScroll: true });
        try {
          if (selStart !== null && selEnd !== null) {
            restored.setSelectionRange(selStart, selEnd);
          }
        } catch (_) {}
        return; // Priorität für aktive Nutzereingabe
      }
    }

    // 2. Automatischer Sprung zur nächsten offenen Zeile nach erfolgreichem Buchen (sanft ohne Schlingern)
    if (window._bhFocusNextAfterBooking !== undefined) {
      const nextIdx = window._bhFocusNextAfterBooking;
      window._bhFocusNextAfterBooking = undefined;
      const target = document.getElementById('bh-soll-' + nextIdx);
      if (target) {
        target.focus({ preventScroll: true });
      }
    }
  }, 60);
}

// ---------------------------------------------------------------------
// Spaltenbreiten ziehbar/anpassbar machen (Column Resizing)
// ---------------------------------------------------------------------
function bhMakeTableResizable(table) {
  if (!table) return;
  const ths = table.querySelectorAll('thead th');
  ths.forEach(th => {
    if (th.querySelector('.bh-col-resizer')) return;

    th.style.position = 'relative';
    const resizer = document.createElement('div');
    resizer.className = 'bh-col-resizer';
    resizer.style.cssText = 'position:absolute; top:0; right:0; width:7px; cursor:col-resize; height:100%; user-select:none; z-index:5;';

    resizer.addEventListener('mouseenter', () => { resizer.style.backgroundColor = '#0d6efd'; });
    resizer.addEventListener('mouseleave', () => { resizer.style.backgroundColor = 'transparent'; });

    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      startX = e.pageX;
      startWidth = th.offsetWidth;
      resizer.style.backgroundColor = '#0d6efd';

      const onMouseMove = (ev) => {
        const diff = ev.pageX - startX;
        const newWidth = Math.max(60, startWidth + diff);
        th.style.width = newWidth + 'px';
        th.style.minWidth = newWidth + 'px';
      };

      const onMouseUp = () => {
        resizer.style.backgroundColor = 'transparent';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    resizer.addEventListener('mousedown', onMouseDown);
    th.appendChild(resizer);
  });
}

// ---------------------------------------------------------------------
// Prüft, ob ein Konto ein Bank-/Geldkonto ist (10xx, z.B. 1020, 1021, 1022, 1000)
// ---------------------------------------------------------------------
function isBankKontoCode(code) {
  const c = String(code || '').trim();
  return c.startsWith('102') || c === '1000' || c === '1010';
}

// ---------------------------------------------------------------------
// Ermittelt das Buchhaltungskonto (z.B. 1020, 1021, 1022) anhand der IBAN aus der XML-Datei
// ---------------------------------------------------------------------
function bhBankGetAccountForIban(iban, fallbackKonto = '1020') {
  if (!iban) return fallbackKonto;
  const cleanIban = String(iban).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!cleanIban) return fallbackKonto;

  const kontenrahmen = window._bhKontenrahmen || [];

  // 1. Suche im geladenen Kontenrahmen nach der IBAN in der Kontobezeichnung
  for (const acc of kontenrahmen) {
    const kCode = String(acc.konto).trim();
    if (!kCode.startsWith('10')) continue; // Nur liquide Konten (10xx)

    const cleanBezeichnung = String(acc.bezeichnung || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleanBezeichnung.includes(cleanIban)) {
      return kCode;
    }
    // Auch Teilvergleich (ohne CH-Ländercode) prüfen
    if (cleanIban.length >= 12 && cleanBezeichnung.includes(cleanIban.slice(4))) {
      return kCode;
    }
  }

  // 2. Bekannte Vereins-Bankkonten als stabiler Fallback
  // CH28 8080 8005 3321 8786 1 -> 1021 Wirtschaftskonto
  if (cleanIban.includes('533218786') || cleanIban.startsWith('CH28')) {
    return '1021';
  }
  // CH06 8080 8003 6331 3189 2 -> 1020 Zahlungskonto / Vereinskonto
  if (cleanIban.includes('36331') || cleanIban.startsWith('CH06')) {
    return '1020';
  }
  // CH81 8080 8003 0788 5129 9 -> 1022 Sparkonto
  if (cleanIban.includes('07885129') || cleanIban.startsWith('CH81')) {
    return '1022';
  }

  return fallbackKonto;
}

// ---------------------------------------------------------------------
// CAMT.053 File Handler & Parser
function bhBankGetAccountsInfoHTML() {
  const txs = window._bhBankTransactions || [];
  if (!txs.length) return 'Keine Datei geladen';

  const accounts = [...new Set(txs.map(t => t.accountIban).filter(Boolean))];
  if (!accounts.length) return '1 Konto erkannt';

  return accounts.map(iban => {
    const kCode = bhBankGetAccountForIban(iban);
    const acc = (window._bhKontenrahmen || []).find(a => String(a.konto).trim() === String(kCode).trim());
    const accName = acc ? acc.bezeichnung : '';
    return `<span class="badge bg-white text-dark border px-2 py-1 me-1 shadow-sm" title="${escHtml(accName)}"><i class="fas fa-university text-primary me-1"></i><strong>${escHtml(kCode)}</strong> (${escHtml(iban)})</span>`;
  }).join(' ');
}

// ---------------------------------------------------------------------
// Multi-File XML Handler
// ---------------------------------------------------------------------
window.bhBankHandleFiles = async function(files) {
  if (!files || !files.length) return;

  const fileList = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.xml'));
  if (!fileList.length) {
    alert('Bitte mindestens eine gültige XML-Datei (CAMT.053) auswählen.');
    return;
  }

  let allParsedTransactions = [];
  let processedFilesCount = 0;

  for (const file of fileList) {
    try {
      const xmlText = await file.text();
      const txs = bhBankParseCAMT053(xmlText);

      // Message-ID für Duplikatskontrolle festhalten
      const firstMsgId = txs.length > 0 ? txs[0].fileMsgId : '';
      if (firstMsgId) {
        try {
          const processedMsgIds = JSON.parse(localStorage.getItem('bh_processed_camt_msgids') || '[]');
          if (!processedMsgIds.includes(firstMsgId)) {
            processedMsgIds.push(firstMsgId);
            localStorage.setItem('bh_processed_camt_msgids', JSON.stringify(processedMsgIds.slice(-50)));
          }
        } catch(_) {}
      }

      allParsedTransactions.push(...txs);
      processedFilesCount++;
    } catch(err) {
      console.error(`Fehler beim Lesen von ${file.name}:`, err);
    }
  }

  // Kombinieren & Deduplizieren neuer Transaktionen
  const existing = window._bhBankTransactions || [];
  const combined = [...existing, ...allParsedTransactions];

  // Exakte Transaktions-Deduplizierung innerhalb des Arbeits-Speichers
  const uniqueTxs = [];
  const seenKeys = new Set();

  combined.forEach(t => {
    const key = `${t.bookingDate}_${t.amount}_${(t.partyName||'').toLowerCase()}_${(t.remittanceInfo||'').substring(0,30).toLowerCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueTxs.push(t);
    }
  });

  window._bhBankTransactions = uniqueTxs;
  window._bhBankMatchResults = bhBankMatchAll(uniqueTxs);
  window._bhBankActiveFilter = 'all';

  renderTabBankabgleich(document.getElementById('bh-tab-content-container'));
  showToast(`✅ ${processedFilesCount} Datei(en) eingelesen! Insges. ${uniqueTxs.length} Transaktionen analysiert.`, 'success');

  const inp = document.getElementById('bhBankXmlInput');
  if (inp) inp.value = '';
};

window.bhBankClearTransactions = function() {
  if (!confirm('Möchtest du die aktuell geladenen Kontoauszugs-Transaktionen wirklich leeren, um den Auszug frisch einzulesen?')) return;
  window._bhBankTransactions = [];
  window._bhBankMatchResults = [];
  try {
    localStorage.removeItem('bh_processed_camt_msgids');
  } catch(_) {}
  const container = document.getElementById('bh-tab-content-container');
  if (container) {
    renderTabBankabgleich(container);
  }
  showToast('Bankauszug geleert. Du kannst die CAMT-Datei nun neu einlesen.', 'info');
};

function bhBankParseCAMT053(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  function getTagText(el, tagName) {
    if (!el) return '';
    const nodes = el.getElementsByTagNameNS('*', tagName);
    return nodes.length > 0 ? (nodes[0].textContent || '').trim() : '';
  }

  function getFirstChild(el, tagName) {
    if (!el) return null;
    const nodes = el.getElementsByTagNameNS('*', tagName);
    return nodes.length > 0 ? nodes[0] : null;
  }

  const msgIdNode = doc.getElementsByTagNameNS('*', 'MsgId');
  const fileMsgId = msgIdNode.length > 0 ? (msgIdNode[0].textContent || '').trim() : '';

  // Stammkonto-IBAN & Bankname aus XML auslesen
  const stmtNode = getFirstChild(doc, 'Stmt');
  const acctNode = getFirstChild(stmtNode, 'Acct');
  const accountIban = getTagText(getFirstChild(acctNode, 'Id'), 'IBAN') || getTagText(getFirstChild(acctNode, 'Id'), 'Othr');
  const accountName = getTagText(acctNode, 'Nm') || getTagText(acctNode, 'Ownr');

  const transactions = [];
  const entries = doc.getElementsByTagNameNS('*', 'Ntry');

  for (let i = 0; i < entries.length; i++) {
    const ntry = entries[i];

    const cdtDbtInd = getTagText(ntry, 'CdtDbtInd'); // 'CRDT' (Eingang) oder 'DBIT' (Ausgang)
    const isCredit = cdtDbtInd === 'CRDT';

    const amount      = parseFloat(getTagText(ntry, 'Amt') || '0');
    
    // Buchungsdatum (BookgDt) & Valutadatum (ValDt) auslesen
    const bookgDtNode = getFirstChild(ntry, 'BookgDt');
    const valDtNode   = getFirstChild(ntry, 'ValDt');
    const rawBookgDt  = getTagText(bookgDtNode, 'Dt') || getTagText(bookgDtNode, 'DtTm');
    const rawValDt    = getTagText(valDtNode, 'Dt') || getTagText(valDtNode, 'DtTm');
    const bookingDate = (rawBookgDt || rawValDt || '').split('T')[0];
    const valutaDate  = (rawValDt || '').split('T')[0];

    const addtlInfo   = getTagText(ntry, 'AddtlNtryInf');

    const txDtls = getFirstChild(ntry, 'TxDtls');

    // Debtor (Zahler) oder Creditor (Empfänger)
    const partyNode = isCredit
      ? (getFirstChild(getFirstChild(txDtls, 'UltmtDbtr'), 'Pty') || getFirstChild(getFirstChild(txDtls, 'Dbtr'), 'Pty'))
      : (getFirstChild(getFirstChild(txDtls, 'UltmtCdtr'), 'Pty') || getFirstChild(getFirstChild(txDtls, 'Cdtr'), 'Pty'));

    const partyName     = getTagText(partyNode, 'Nm');
    const pstlAdr       = getFirstChild(partyNode, 'PstlAdr');
    const partyPLZ      = getTagText(pstlAdr, 'PstCd');
    const partyCity     = getTagText(pstlAdr, 'TwnNm');
    const adrLine       = getTagText(pstlAdr, 'AdrLine');

    const strd       = getFirstChild(getFirstChild(txDtls, 'RmtInf'), 'Strd');
    const ustrd      = getTagText(getFirstChild(txDtls, 'RmtInf'), 'Ustrd');
    const addtlRmt   = getTagText(strd, 'AddtlRmtInf');
    const remittanceInfo = addtlRmt || ustrd || addtlInfo || '';

    const cdtrRefInf = getFirstChild(strd, 'CdtrRefInf');
    const creditorReference = getTagText(cdtrRefInf, 'Ref');

    transactions.push({
      isCredit,
      amount,
      bookingDate,
      valutaDate,
      partyName,
      partyPLZ,
      partyCity: partyCity || (adrLine ? adrLine.split(' ').slice(-1)[0] : ''),
      remittanceInfo,
      _originalRemittanceInfo: remittanceInfo,
      creditorReference,
      fileMsgId,
      accountIban,
      accountName,
      alreadyBooked: false
    });
  }

  return transactions;
}

// ---------------------------------------------------------------------
// Matching Engine (Jahresbeiträge + Rules + Journal History + Duplikats-Schutz)
// ---------------------------------------------------------------------
function bhBankMatchAll(transactions) {
  const members = window._jbMembers || [];
  const beitraege = (window._jbAllBeitraege || []).filter(h => Number(h.year) === Number(window._bhYear || new Date().getFullYear()));
  const userRules = window.getBhBankRules();
  const journalHistory = window._bhJournal || [];

  return transactions.map(tx => {
    const cleanRemittance = (tx.remittanceInfo || '').toLowerCase();
    const cleanParty      = (tx.partyName || '').toLowerCase();
    const cleanRef        = (tx.creditorReference || '').toLowerCase();

    // 0. STUFE: DUPLIKATS-PRÜFUNG GEGEN DAS BESTEHENDE KASSABUCH-JOURNAL
    let alreadyBooked = false;
    let bookedDate = '';

    if (journalHistory && journalHistory.length > 0) {
      const isAlreadyInJournal = journalHistory.some(j => {
        const amountDiff = Math.abs(Number(j.betrag || 0) - tx.amount);
        const sameAmountExact = amountDiff < 0.05; // Betragstoleranz bis 5 Rappen (z.B. Zinsen 3.91 vs 3.90)

        const jIso = toNormalizedIsoDate(j.datum);
        const txIso = toNormalizedIsoDate(tx.bookingDate);

        let daysDiff = 999;
        if (jIso && txIso) {
          const dJ = new Date(jIso);
          const dTx = new Date(txIso);
          if (!isNaN(dJ) && !isNaN(dTx)) {
            daysDiff = Math.abs((dTx - dJ) / (1000 * 60 * 60 * 24));
          }
        }

        const closeDate = daysDiff <= 7; // Toleranzfenster von max. 7 Tagen zwischen Belegdatum & Bank-Wertstellung

        if (!sameAmountExact || !closeDate) return false;

        const desc = normalizeString(j.beschreibung || '');
        const party = normalizeString(tx.partyName || '');
        const rmt = normalizeString(tx.remittanceInfo || '');
        const ref = normalizeString(tx.creditorReference || '');

        if (!party && !rmt && !ref) return true;

        const samePartyOrRef = (party && (desc.includes(party) || party.includes(desc))) || 
                               (rmt && desc.includes(rmt)) || 
                               (ref && desc.includes(ref));

        return samePartyOrRef || true; // Betrag & nahe beieinander liegendes Datum stimmen überein
      });

      if (isAlreadyInJournal) {
        alreadyBooked = true;
        bookedDate = formatSwissDate(tx.bookingDate);
      }
    }

    let isJahresbeitrag = false;
    let matchScore = 0;
    let matchedMember = null;
    let matchedBeitrag = null;
    let alreadyPaidJb = false;
    let matchType = 'unknown'; // 'jb' | 'rule' | 'journal' | 'heuristic' | 'unknown'
    let matchRuleName = '';

    // Bank-Konto dynamisch anhand der erkannten XML-IBAN ermitteln (z.B. 1021 für Wirtschaftskonto, 1020 für Vereinskonto, 1022 für Sparkonto)
    const txBankKonto = bhBankGetAccountForIban(tx.accountIban, '1020');

    let suggestedSoll = isCreditDefault(tx.isCredit) ? txBankKonto : '';
    let suggestedHaben = isCreditDefault(tx.isCredit) ? '' : txBankKonto;
    let matchLabel = 'Manuelle Buchung';

    function isCreditDefault(isCred) { return isCred; }

    // 1. STUFE: Jahresbeitrags-Matching (nur bei Gutschriften)
    if (tx.isCredit) {
      const jbKeywords = [/jahresbeitra/i, /mitgliederbeitra/i, /vereinsbeitra/i, /\bjb\b/i, /beitra\s*g/i];
      const textHasJb = jbKeywords.some(r => r.test(cleanRemittance));
      const bankName = normalizeString(tx.partyName || '');

      let bestScore = 0;
      let bestMem = null;
      let bestBeit = null;

      for (const m of members) {
        const b = beitraege.find(x => String(x.PersonNumber) === String(m.PersonNumber)) || null;
        const mLast  = normalizeString(m.LastName  || '');
        const mFirst = normalizeString(m.FirstName || '');
        const mGesamt = b ? Number(b.Gesamt || 0) : (m._istPassiv ? 20 : 0);

        let score = 0;
        if (Math.abs(mGesamt - tx.amount) < 0.01) score += 1;
        if (bankName.includes(mLast) && mLast.length > 1) score += 1;
        if (bankName.includes(mFirst) && mFirst.length > 1) score += 0.5;

        const cleanMpn = String(m.PersonNumber || '').trim().replace(/^0+/, '');
        if (cleanRef && cleanMpn && cleanRef.replace(/[^0-9]/g, '').endsWith(cleanMpn)) {
          score += 2;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMem = m;
          bestBeit = b;
        }
      }

      if (textHasJb || cleanRef || bestScore >= 2) {
        isJahresbeitrag = true;
        matchScore = bestScore >= 2 ? 2 : (bestScore >= 1 ? 1 : 0);
        matchedMember = bestMem;
        matchedBeitrag = bestBeit;
        alreadyPaidJb = bestBeit ? (bestBeit.status === 'bezahlt') : false;
        matchType = 'jb';
        suggestedSoll = txBankKonto; // Bank
        suggestedHaben = '3410'; // Mitgliederbeiträge Aktive
        matchLabel = 'Jahresbeitrag Mitglied';
      }
    }

    // 1b. STUFE: AUTOMATISCHE VERMIETUNGS-REGEL & SYSTEM-PATTERNS (V-YYYY-XXXX, Miete, Mietvertrag)
    if (!isJahresbeitrag) {
      const vMatch = (tx.remittanceInfo || '').match(/v-\d{4}-\d{3,4}/i) || (tx.partyName || '').match(/v-\d{4}-\d{3,4}/i);
      const isMieteText = /miet/i.test(cleanRemittance) || /miet/i.test(cleanParty);

      if (tx.isCredit && (vMatch || isMieteText)) {
        matchType = 'rule';
        const vCode = vMatch ? vMatch[0].toUpperCase() : '';
        matchRuleName = vCode ? `Vermietung ${vCode}` : 'Vermietung Schützenhaus';
        suggestedSoll = txBankKonto; // Dynamisch das erkannte Bankkonto (z.B. 1021 Wirtschaftskonto)
        suggestedHaben = '3650'; // Mieterträge Schützenhaus
        matchLabel = vCode ? `Vermietung ${vCode}` : 'Mietertrag Schützenhaus';
        matchScore = 2;
      } else if (tx.isCredit && /raisenow/i.test(cleanRemittance)) {
        matchType = 'rule';
        matchRuleName = 'RaiseNow Payout';
        suggestedSoll = txBankKonto;
        suggestedHaben = '3651';
        matchLabel = 'Gutschrift RaiseNow';
        matchScore = 2;
      }
    }

    // 2. STUFE: Benutzer-Regeln (Rules)
    // Spezifischere Regeln (sowohl Empfänger als auch Verwendungszweck und/oder Betrag gesetzt) priorisieren
    let matchRulePrefix = '';
    if (!isJahresbeitrag && matchType === 'unknown') {
      const sortedRules = [...userRules].sort((a, b) => {
        let aSpec = 0;
        const aParty = String(a.pattern_party || (a.scope === 'party' ? a.pattern : '') || '').trim();
        const aText  = String(a.pattern_text  || (a.scope === 'text'  ? a.pattern : '') || '').trim();
        if (aParty) aSpec += 1;
        if (aText) aSpec += 1;
        if (a.amount_mode && a.amount_mode !== 'any') aSpec += 2;

        let bSpec = 0;
        const bParty = String(b.pattern_party || (b.scope === 'party' ? b.pattern : '') || '').trim();
        const bText  = String(b.pattern_text  || (b.scope === 'text'  ? b.pattern : '') || '').trim();
        if (bParty) bSpec += 1;
        if (bText) bSpec += 1;
        if (b.amount_mode && b.amount_mode !== 'any') bSpec += 2;

        return bSpec - aSpec;
      });

      for (const r of sortedRules) {
        const rawParty = (r.pattern_party !== undefined && r.pattern_party !== null && String(r.pattern_party).trim() !== '')
          ? r.pattern_party
          : (r.scope === 'party' ? r.pattern : '');
        const rawText  = (r.pattern_text !== undefined && r.pattern_text !== null && String(r.pattern_text).trim() !== '')
          ? r.pattern_text
          : (r.scope === 'text' ? r.pattern : '');
        const rawLegacy = r.pattern || '';

        const pParty = String(rawParty || '').toLowerCase().trim();
        const pText  = String(rawText || '').toLowerCase().trim();
        const legacyP = String(rawLegacy || '').toLowerCase().trim();

        let isMatch = false;

        if (pParty || pText) {
          const matchParty = !pParty || cleanParty.includes(pParty);
          const matchText  = !pText  || cleanRemittance.includes(pText);
          // Wenn beide Kriterien gesetzt sind, müssen beide matchen. Wenn nur eines gesetzt ist, reicht dieses eine.
          isMatch = matchParty && matchText;
        } else if (legacyP) {
          const scope = String(r.scope || 'all');
          if (scope === 'party') {
            isMatch = cleanParty.includes(legacyP);
          } else if (scope === 'text') {
            isMatch = cleanRemittance.includes(legacyP);
          } else {
            isMatch = cleanRemittance.includes(legacyP) || cleanParty.includes(legacyP);
          }
        }

        // Betragsprüfung (optional: exakt, grösser als, kleiner als, von ... bis)
        const amtMode = r.amount_mode || 'any';
        if (isMatch && amtMode && amtMode !== 'any') {
          const txAmt = Math.abs(Number(tx.amount) || 0);
          const minAmt = Number(r.amount_min || 0);
          const maxAmt = Number(r.amount_max || 0);
          let amtMatches = true;

          if (amtMode === 'exact') {
            amtMatches = Math.abs(txAmt - minAmt) < 0.01;
          } else if (amtMode === 'gt') {
            amtMatches = txAmt > minAmt;
          } else if (amtMode === 'lt') {
            const limit = (r.amount_max !== undefined && r.amount_max !== null && r.amount_max !== '') ? maxAmt : minAmt;
            amtMatches = txAmt < limit;
          } else if (amtMode === 'range') {
            amtMatches = txAmt >= minAmt && txAmt <= maxAmt;
          }

          if (!amtMatches) {
            isMatch = false;
          }
        }

        if (isMatch) {
          matchType = 'rule';
          matchRuleName = r.label;
          matchRulePrefix = r.prefix || r.label;
          
          // Eindeutige Ermittlung des Gegenkontos:
          // Unabhängig davon, wie die Regel erfasst wurde (ob Soll oder Haben das Bankkonto war):
          // Bei Gutschrift (Geldeingang): Soll = Bank (txBankKonto), Haben = Gegenkonto
          // Bei Belastung (Geldausgang): Soll = Gegenkonto, Haben = Bank (txBankKonto)
          const rBankInSoll = isBankKontoCode(r.soll);
          const rBankInHaben = isBankKontoCode(r.haben);
          const gegenKonto = rBankInSoll ? r.haben : (rBankInHaben ? r.soll : (tx.isCredit ? r.haben : r.soll));

          if (tx.isCredit) {
            suggestedSoll = txBankKonto;
            suggestedHaben = gegenKonto;
          } else {
            suggestedSoll = gegenKonto;
            suggestedHaben = txBankKonto;
          }

          matchLabel = `Regel: ${r.label}`;
          matchScore = 2;
          break;
        }
      }
    }

    // 3. STUFE: Historisches Journal-Learning
    // WICHTIGE SICHERHEIT: Ausgang (Belastung) gleicht NUR mit früheren Ausgängen ab!
    // Eingang (Gutschrift) gleicht NUR mit früheren Eingängen ab!
    if (!isJahresbeitrag && matchType === 'unknown' && journalHistory.length > 0) {
      // Passende Historien-Pools bilden:
      const historyPool = journalHistory.filter(j => {
        if (tx.isCredit) {
          return isBankKontoCode(j.konto_soll); // Frühere Gutschriften (Bank war im Soll)
        } else {
          return isBankKontoCode(j.konto_haben); // Frühere Belastungen (Bank war im Haben)
        }
      });

      // Von neu nach alt durchsuchen (neueste Buchungen haben Priorität)
      const matchHist = [...historyPool].reverse().find(j => {
        const desc = (j.beschreibung || '').toLowerCase().trim();
        if (!desc || desc.length < 3) return false;

        // Bevorzugt nach Empfänger/Zahler suchen
        if (cleanParty && (desc.includes(cleanParty) || (cleanParty.length >= 4 && cleanParty.includes(desc)))) {
          return true;
        }
        // Oder im Verwendungszweck (nur bei mindestens 4 Zeichen)
        if (cleanRemittance && desc.length >= 4 && (cleanRemittance.includes(desc) || desc.includes(cleanRemittance))) {
          return true;
        }
        return false;
      });

      if (matchHist) {
        matchType = 'journal';
        if (tx.isCredit) {
          suggestedSoll = txBankKonto;
          suggestedHaben = matchHist.konto_haben;
        } else {
          suggestedSoll = matchHist.konto_soll;
          suggestedHaben = txBankKonto;
        }
        matchLabel = 'Aus Journal-Historie';
        matchScore = 1;
      }
    }

    // 4. STUFE: Smart Defaults nach Vorzeichen
    if (!suggestedSoll || !suggestedHaben) {
      if (tx.isCredit) {
        suggestedSoll = suggestedSoll || txBankKonto; // Bank
        suggestedHaben = suggestedHaben || '3900'; // Übriger Ertrag
      } else {
        suggestedSoll = suggestedSoll || '6000'; // Raum/Unterhalt Aufwand
        suggestedHaben = suggestedHaben || txBankKonto; // Bank
      }
    }

    // ABSOLUTER GARANTIE-CHECK: Bankkonto darf NIEMALS auf der verkehrten Seite stehen!
    // Belastung (tx.isCredit === false) -> Bank (1020) MUSS im HABEN stehen!
    // Gutschrift (tx.isCredit === true)  -> Bank (1020) MUSS im SOLL stehen!
    if (tx.isCredit) {
      if (isBankKontoCode(suggestedHaben) && !isBankKontoCode(suggestedSoll)) {
        const tmp = suggestedSoll;
        suggestedSoll = suggestedHaben;
        suggestedHaben = tmp;
      }
      if (!isBankKontoCode(suggestedSoll)) {
        suggestedHaben = suggestedHaben || suggestedSoll || '3900';
        suggestedSoll = txBankKonto;
      }
    } else {
      if (isBankKontoCode(suggestedSoll) && !isBankKontoCode(suggestedHaben)) {
        const tmp = suggestedHaben;
        suggestedHaben = suggestedSoll;
        suggestedSoll = tmp;
      }
      if (!isBankKontoCode(suggestedHaben)) {
        suggestedSoll = suggestedSoll || suggestedHaben || '6000';
        suggestedHaben = txBankKonto;
      }
    }

    const txYear = tx.bookingDate ? new Date(tx.bookingDate).getFullYear() : Number(window._bhYear || new Date().getFullYear());
    const activeYear = Number(window._bhYear || new Date().getFullYear());
    const isWrongYear = txYear !== activeYear;

    // Erkennung von Verbandsschiessen / Wettschiessen (Splitbuchungs-Empfehlung)
    const cleanTextAll = ((tx.remittanceInfo || '') + ' ' + (tx.partyName || '')).toLowerCase();
    const isVerbandsschiessen = /verbandsschiessen|vereinswettschiessen|wettschiessen|agksv|ssv|schützenverband|feldschiessen|kantonalstich|dmm/i.test(cleanTextAll);
    const splitHint = isVerbandsschiessen 
      ? '⚠️ Wettschiessen / Verbandsabrechnung! Enthält evtl. Junioren-Anteile (Konto 4210 Nachwuchsförderung) und Erwachsene (Transit 1190). Split-Buchung empfohlen.'
      : '';

    return {
      ...tx,
      txYear,
      isWrongYear,
      isVerbandsschiessen,
      splitHint,
      alreadyBooked: tx.alreadyBooked || alreadyBooked,
      bookedDate: tx.bookedDate || bookedDate,
      isJahresbeitrag,
      matchScore,
      matchedMember,
      matchedBeitrag,
      alreadyPaidJb,
      matchType,
      matchRuleName,
      matchRulePrefix,
      suggestedSoll,
      suggestedHaben,
      matchLabel
    };
  });
}

function normalizeString(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------------------------------------------------------------------
// Filter-Steuerung
// ---------------------------------------------------------------------
window.bhBankFilter = function(filter) {
  ['bhBankFilterOffen','bhBankFilterBooked','bhBankFilterAll','bhBankFilterJb','bhBankFilterRules','bhBankFilterUnklar'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active', 'btn-dark', 'btn-primary', 'btn-secondary');
  });
  const idMap = {
    offen: 'bhBankFilterOffen',
    booked: 'bhBankFilterBooked',
    all: 'bhBankFilterAll',
    jb: 'bhBankFilterJb',
    rules: 'bhBankFilterRules',
    unklar: 'bhBankFilterUnklar'
  };
  const activeBtn = document.getElementById(idMap[filter] || 'bhBankFilterOffen');
  if (activeBtn) activeBtn.classList.add('active');

  bhBankRenderResults(filter);
};

// ---------------------------------------------------------------------
// Eindeutige, lückenlose Belegnummern nach Bankkonto (z.B. B_Zahl_2026-001, B_Wirt_2026-001, B_Geno_2026-001)
// ---------------------------------------------------------------------
function getBankBelegPrefix(kontoCode) {
  const c = String(kontoCode || '').trim();
  if (c === '1021') return 'B_Wirt_';
  if (c === '1020') return 'B_Zahl_';
  if (c === '1022') return 'B_Geno_';
  return 'BK_';
}

function bhGetNextBankBelegSeq(year, bankKonto = '1020') {
  const y = Number(year || new Date().getFullYear());
  const prefix = getBankBelegPrefix(bankKonto);
  const regex = new RegExp(`^(?:${prefix}|BK[-_])${y}[-_](\\d+)`, 'i');
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

  const stateKey = `${prefix}${y}`;
  window._bhLastAssignedBankSeqs = window._bhLastAssignedBankSeqs || {};
  const nextSeq = Math.max(maxSeq, window._bhLastAssignedBankSeqs[stateKey] || 0) + 1;
  window._bhLastAssignedBankSeqs[stateKey] = nextSeq;
  return nextSeq;
}

function bhGetNextBankBelegNr(year, bankKonto = '1020') {
  const prefix = getBankBelegPrefix(bankKonto);
  const seq = bhGetNextBankBelegSeq(year, bankKonto);
  return `${prefix}${year}-${String(seq).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------
// Einzelne Buchung durchführen
// ---------------------------------------------------------------------
window.bhBankBookOne = async function(txIdx, customBelegNr) {
  const tx = window._bhBankMatchResults[txIdx];
  if (!tx) return;

  // 1. Doppel-Klick- & Parallel-Schutz (Re-entrancy Guard)
  if (tx._isBooking || tx.alreadyBooked) {
    console.warn(`[Bankabgleich] Transaktion #${txIdx} wird bereits gebucht oder ist bereits im Journal.`);
    return;
  }

  if (tx.isWrongYear) {
    alert(`⚠️ Buchung gesperrt:\n\nDiese Transaktion stammt aus dem Jahr ${tx.txYear}, oben im Portal ist aber das Buchhaltungsjahr ${window._bhYear} gewählt.\n\nBitte wechseln Sie oben das Buchhaltungsjahr auf ${tx.txYear}, um diese Transaktion in das entsprechende Jahr zu buchen.`);
    return;
  }

  const sollEl  = document.getElementById(`bh-soll-${txIdx}`);
  const habenEl = document.getElementById(`bh-haben-${txIdx}`);
  const rowTr   = sollEl ? sollEl.closest('tr') : null;
  const bookBtn = rowTr ? rowTr.querySelector('button.btn-success') : null;

  function resolveKontoCode(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('|')) return s.split('|')[0].trim();
    if (/^\d{4}$/.test(s)) return s;
    const matches = bhFindMatchingKonten(s);
    return matches.length > 0 ? String(matches[0].konto).trim() : s;
  }

  const rawSoll  = sollEl ? sollEl.value : tx.suggestedSoll;
  const rawHaben = habenEl ? habenEl.value : tx.suggestedHaben;
  const kontoSoll  = resolveKontoCode(rawSoll);
  const kontoHaben = resolveKontoCode(rawHaben);

  if (!kontoSoll || !kontoHaben) {
    alert('Bitte wählen Sie Soll- und Haben-Konto aus.');
    return;
  }
  if (kontoSoll === kontoHaben) {
    alert('Soll- und Haben-Konto dürfen nicht identisch sein.');
    return;
  }

  // Sofortige visuelle Rückmeldung: Button deaktivieren & Ladespinner anzeigen
  tx._isBooking = true;
  if (bookBtn) {
    bookBtn.disabled = true;
    bookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Bucht...';
  }

  const rmtEl = document.getElementById(`bh-rmt-${txIdx}`);
  if (rmtEl) {
    const rmtVal = rmtEl.value.trim();
    if (rmtVal !== (tx._originalRemittanceInfo || '')) {
      tx._customRemittanceEdited = true;
      tx._customRemittance = rmtVal;
      tx.remittanceInfo = rmtVal;
    }
  }

  const cleanRemittance = (tx.remittanceInfo || '').toLowerCase();
  const cleanParty = (tx.partyName || '').toLowerCase();
  const vMatch = (tx.remittanceInfo || '').match(/v-\d{4}-\d{3,4}/i) || (tx.partyName || '').match(/v-\d{4}-\d{3,4}/i);
  const isMieteText = /miet/i.test(cleanRemittance) || /miet/i.test(cleanParty);
  const isRaiseNow = /raisenow/i.test(cleanRemittance);

  let beschreibung = '';
  // Falls der Nutzer den Text im Verwendungszweck-Feld manuell angepasst hat:
  if (tx._customRemittanceEdited && tx._customRemittance) {
    const party = (tx.partyName || '').trim();
    const customTxt = tx._customRemittance.trim();
    if (party && !customTxt.toLowerCase().includes(party.toLowerCase())) {
      beschreibung = `${party}: ${customTxt}`;
    } else {
      beschreibung = customTxt;
    }
  } else if (vMatch || isMieteText || kontoHaben === '3650') {
    const vCode = vMatch ? ` (${vMatch[0].toUpperCase()})` : '';
    const party = tx.partyName ? `: ${tx.partyName}` : '';
    const cleanRmt = (tx.remittanceInfo || '').replace(/v-\d{4}-\d{3,4}/i, '').replace(/miete/i, '').replace(/mietvertrag/i, '').trim();
    beschreibung = `Vermietung Schützenhaus${vCode}${party}${cleanRmt ? ' - ' + cleanRmt : ''}`;
  } else if (isRaiseNow) {
    let extractedDate = '';
    const rmt = tx.remittanceInfo || '';

    // 1. Datumsbereich YYYYMMDD - YYYYMMDD (z.B. 20260525 - 20260531 -> 25.05. - 31.05.2026)
    const rangeMatch = rmt.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\s*-\s*(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
    if (rangeMatch) {
      const [, y1, m1, d1, y2, m2, d2] = rangeMatch;
      if (y1 === y2 && m1 === m2) {
        extractedDate = `${d1}.${m1}. - ${d2}.${m2}.${y2}`;
      } else {
        extractedDate = `${d1}.${m1}.${y1} - ${d2}.${m2}.${y2}`;
      }
    }

    // 2. Einzelnes Datum YYYYMMDD (z.B. 20260531 -> 31.05.2026)
    if (!extractedDate) {
      const singleIsoMatch = rmt.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
      if (singleIsoMatch) {
        const [, y, m, d] = singleIsoMatch;
        extractedDate = `${d}.${m}.${y}`;
      }
    }

    // 3. Schweizer Format DD.MM.YYYY
    if (!extractedDate) {
      const swissMatch = rmt.match(/\b(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})?)\b/);
      if (swissMatch) {
        extractedDate = swissMatch[1];
      }
    }

    beschreibung = `Wirtschaftseinnahme TWINT (RaiseNow${extractedDate ? ' vom ' + extractedDate : ''})`;
  } else if (tx.isJahresbeitrag && tx.matchedMember) {
    const m = tx.matchedMember;
    const refTxt = tx.matchedBeitrag ? ` (Rechnung ${tx.matchedBeitrag.id})` : '';
    beschreibung = `Jahresbeitrag ${window._bhYear}: ${m.FirstName} ${m.LastName}${refTxt}`;
  } else if (tx.matchType === 'rule') {
    let prefix = (tx.matchRulePrefix || tx.matchRuleName || '').trim();
    let party  = (tx.partyName || '').trim();
    let rmt    = (tx.remittanceInfo || '').trim();

    // Redundanz-Filter: Doppelte Absender- / Zahlungsbegriffe entfernen
    if (rmt.toLowerCase().replace(/^(zahlung|gutschrift|überweisung|auszahlung)\s+/, '') === party.toLowerCase()) {
      rmt = '';
    }
    if (party && prefix.toLowerCase().includes(party.toLowerCase())) {
      party = '';
    }

    const details = [party, rmt].filter(Boolean).join(' - ');
    beschreibung = `${prefix}${details ? ': ' + details : ''}`;
  } else {
    beschreibung = (tx.partyName ? `${tx.partyName}: ` : '') + (tx.remittanceInfo || 'Bankbuchung CAMT.053');
  }

  try {
    // 1. Journal-Buchungssatz in Buchhaltung speichern (POST)
    const year = Number(window._bhYear || new Date().getFullYear());
    const txBankKonto = isBankKontoCode(kontoSoll) ? kontoSoll : (isBankKontoCode(kontoHaben) ? kontoHaben : (tx.accountIban ? bhBankGetAccountForIban(tx.accountIban) : '1020'));
    const belegNr = customBelegNr || bhGetNextBankBelegNr(year, txBankKonto);

    const payloadBh = {
      action: 'addJournalEntry',
      jahr: year,
      datum: tx.bookingDate || new Date().toISOString().split('T')[0],
      beleg_nr: belegNr,
      beschreibung: beschreibung,
      konto_soll: kontoSoll,
      konto_haben: kontoHaben,
      betrag: Number(tx.amount || 0),
      typ: 'Bank'
    };

    const resBh = await apiFetch('buchhaltung', payloadBh, 'POST');
    const jsonBh = await resBh.json();
    if (!jsonBh.success) throw new Error(jsonBh.error || 'Fehler beim Buchen im Journal');

    // 2. Falls Jahresbeitrag: auch im Jahresbeitrags-Modul als bezahlt setzen (POST)
    if (tx.isJahresbeitrag && tx.matchedBeitrag && tx.matchedBeitrag.id) {
      try {
        const payloadJb = {
          action: 'saveZahlung',
          headerId: tx.matchedBeitrag.id,
          datum: tx.bookingDate,
          methode: 'Überweisung',
          beleg: 'CAMT053'
        };
        await apiFetch('jahresbeitrag', payloadJb, 'POST');
        
        // Cache im Beitragswesen updaten
        const cachedJb = (window._jbAllBeitraege || []).find(h => String(h.id) === String(tx.matchedBeitrag.id));
        if (cachedJb) { cachedJb.status = 'bezahlt'; cachedJb.payment_date = tx.bookingDate; }
      } catch (jbErr) {
        console.warn('⚠️ Hinweis: Journal gebucht, Beitragsstatus konnte nicht aktualisiert werden:', jbErr);
      }
    }

    // Status im UI updaten
    tx._isBooking = false;
    window._bhBankMatchResults[txIdx].alreadyBooked = true;
    window._bhBankMatchResults[txIdx].bookedDate = new Date().toLocaleDateString('de-CH');

    // Sofort lokal im Kassabuch-Journal registrieren für 100%ige Sofort-Sperre
    window._bhJournal = window._bhJournal || [];
    window._bhJournal.push({
      id: (jsonBh.data && jsonBh.data.id) ? jsonBh.data.id : Date.now(),
      jahr: year,
      datum: tx.bookingDate || new Date().toISOString().split('T')[0],
      beleg_nr: belegNr,
      beschreibung: beschreibung,
      konto_soll: kontoSoll,
      konto_haben: kontoHaben,
      betrag: Number(tx.amount || 0),
      typ: 'Bank'
    });

    // Sofort Button dauerhaft deaktivieren & Kennzeichnen (noch vor dem Re-Render)
    if (bookBtn) {
      bookBtn.className = 'badge bg-light text-secondary border px-2 py-1.5';
      bookBtn.innerHTML = '<i class="fas fa-check me-1"></i>Gebucht';
      bookBtn.disabled = true;
    }

    showToast(`✅ Buchungssatz über CHF ${tx.amount.toFixed(2)} gebucht!`, 'success');

    // Nächste ungebuchte Zeile nach dem Neuladen automatisch fokussieren
    window._bhFocusNextAfterBooking = txIdx + 1;

    // Live Neu-Laden des Hauptbuchs
    if (typeof loadBuchhaltungData === 'function') {
      loadBuchhaltungData(true, true);
    } else {
      bhBankRenderResults(window._bhBankActiveFilter);
    }
  } catch(err) {
    tx._isBooking = false;
    if (bookBtn) {
      bookBtn.disabled = false;
      bookBtn.innerHTML = '<i class="fas fa-check me-1"></i>Buchen';
    }
    alert('Fehler beim Buchen: ' + err.message);
  }
};

// ---------------------------------------------------------------------
// Batch-Buchung aller sicheren Treffer
// ---------------------------------------------------------------------
window.bhBankBookAll = async function() {
  if (window._bhIsBookingAll) return;
  const allBtn = document.getElementById('bhBtnBookAll') || document.querySelector('button[onclick="bhBankBookAll()"]');

  const results = window._bhBankMatchResults || [];
  const activeYear = Number(window._bhYear || new Date().getFullYear());
  
  const toBook = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.alreadyBooked && !r._isBooking && !r.isWrongYear && (r.isJahresbeitrag || r.matchScore >= 2));

  if (!toBook.length) {
    showToast(`Keine eindeutigen, ungebuchten Transaktionen für das Buchungsjahr ${activeYear} vorhanden.`, 'warning');
    return;
  }

  const ok = confirm(`${toBook.length} eindeutige Bank-Buchungen jetzt automatisch ins Journal eintragen?`);
  if (!ok) return;

  window._bhIsBookingAll = true;
  if (allBtn) {
    allBtn.disabled = true;
    allBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Buche 0/${toBook.length}...`;
  }

  try {
    let count = 0;
    for (const { r, i } of toBook) {
      try {
        if (allBtn) {
          allBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Buche ${count + 1}/${toBook.length}...`;
        }
        const txBankKonto = isBankKontoCode(r.suggestedSoll) ? r.suggestedSoll : (isBankKontoCode(r.suggestedHaben) ? r.suggestedHaben : bhBankGetAccountForIban(r.accountIban, '1020'));
        const belegNr = bhGetNextBankBelegNr(activeYear, txBankKonto);
        await bhBankBookOne(i, belegNr);
        count++;
      } catch (_) {}
    }

    showToast(`⚡ ${count} von ${toBook.length} Buchungen erfolgreich ausgeführt!`, 'success');
  } finally {
    window._bhIsBookingAll = false;
    if (allBtn) {
      allBtn.disabled = false;
      allBtn.innerHTML = '<i class="fas fa-bolt me-1"></i>Alle sicheren Buchungen ausführen';
    }
  }
};

// ---------------------------------------------------------------------
// Regel Editor Modal (Erstellen / Bearbeiten)
// ---------------------------------------------------------------------
window.bhUpdateRuleAmountInputs = function() {
  const mode = document.getElementById('bhr-amount-mode')?.value || 'any';
  const minWrap = document.getElementById('bhr-amount-min-wrap');
  const maxWrap = document.getElementById('bhr-amount-max-wrap');
  const minLabel = document.getElementById('bhr-amount-min-label');
  if (!minWrap || !maxWrap) return;

  if (mode === 'any') {
    minWrap.style.display = 'none';
    maxWrap.style.display = 'none';
  } else if (mode === 'exact') {
    minWrap.style.display = 'block';
    maxWrap.style.display = 'none';
    if (minLabel) minLabel.innerHTML = '<i class="fas fa-equals me-1 text-primary"></i>Exakter Betrag (CHF)';
  } else if (mode === 'gt') {
    minWrap.style.display = 'block';
    maxWrap.style.display = 'none';
    if (minLabel) minLabel.innerHTML = '<i class="fas fa-greater-than me-1 text-primary"></i>Grösser als (&gt;) (CHF)';
  } else if (mode === 'lt') {
    minWrap.style.display = 'block';
    maxWrap.style.display = 'none';
    if (minLabel) minLabel.innerHTML = '<i class="fas fa-less-than me-1 text-primary"></i>Kleiner als (&lt;) (CHF)';
  } else if (mode === 'range') {
    minWrap.style.display = 'block';
    maxWrap.style.display = 'block';
    if (minLabel) minLabel.innerHTML = '<i class="fas fa-arrow-right me-1 text-primary"></i>Von Betrag (CHF)';
  }
};

window.bhBankOpenRuleEditorModal = function(editIdx, prefillObj) {
  const rules = window.getBhBankRules();
  const isEdit = typeof editIdx === 'number' && editIdx >= 0;
  const existingRule = isEdit ? rules[editIdx] : null;

  const rule = existingRule || prefillObj || {
    pattern_party: '',
    pattern_text: '',
    pattern: '',
    label: '',
    prefix: '',
    soll: '1020',
    haben: '3410',
    scope: 'all',
    amount_mode: 'any',
    amount_min: '',
    amount_max: ''
  };

  const partyVal = rule.pattern_party !== undefined ? rule.pattern_party : (rule.scope === 'party' ? rule.pattern : (rule.scope === 'all' ? rule.pattern : ''));
  const textVal  = rule.pattern_text  !== undefined ? rule.pattern_text  : (rule.scope === 'text'  ? rule.pattern : '');

  let modalEl = document.getElementById('bhModalRuleEditor');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalRuleEditor';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  modalEl.style.zIndex = '1065';

  const amtMode = rule.amount_mode || 'any';

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered" style="z-index: 1066;">
      <div class="modal-content border-0 rounded-4 shadow-lg">
        <div class="modal-header bg-dark text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold">
            <i class="fas ${isEdit ? 'fa-edit' : 'fa-plus-circle'} me-2"></i>
            ${isEdit ? 'Buchhaltungsregel bearbeiten' : 'Neue Buchhaltungsregel erstellen'}
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <form onsubmit="bhBankSaveRuleSubmit(event, ${isEdit ? editIdx : -1})">
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-bold small">Regel-Bezeichnung (System-Name)</label>
              <input type="text" id="bhr-label" class="form-control form-control-sm" placeholder="z.B. AGSV Gruppenmeisterschaft oder Berchtold Fleisch AG" value="${escHtml(rule.label)}" required>
              <div class="form-text small">Wird im Status-Badge als Regelname angezeigt.</div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small">Journal-Präfix / Buchungstext (Vorangestellt im Kassabuch)</label>
              <input type="text" id="bhr-prefix" class="form-control form-control-sm" placeholder="z.B. AGSV Gruppenmeisterschaft" value="${escHtml(rule.prefix || rule.label)}">
              <div class="form-text small">Dieser Text wird bei der Buchung im Kassabuch-Journal vorangestellt.</div>
            </div>
            
            <div class="row g-2 mb-2">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-primary">
                  <i class="fas fa-user me-1"></i>Suchbegriff: Empfänger / Zahler
                </label>
                <input type="text" id="bhr-pattern-party" class="form-control form-control-sm" placeholder="z.B. AGSV, Berchtold, Swisscom..." value="${escHtml(partyVal)}">
                <div class="form-text small">Wird im Absender/Empfänger gesucht (kann leer bleiben).</div>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-bold small text-success">
                  <i class="fas fa-file-alt me-1"></i>Suchbegriff: Verwendungszweck
                </label>
                <input type="text" id="bhr-pattern-text" class="form-control form-control-sm" placeholder="z.B. Gruppenmeisterschaft, Munition..." value="${escHtml(textVal)}">
                <div class="form-text small">Wird im Buchungstext/Mitteilung gesucht (kann leer bleiben).</div>
              </div>
            </div>

            <!-- Betragseinschränkung (optional: beliebig, exakt, grösser als, kleiner als, von...bis) -->
            <div class="row g-2 mb-3 align-items-end bg-light p-2 rounded-3 border">
              <div class="col-md-5">
                <label class="form-label fw-bold small text-dark mb-1">
                  <i class="fas fa-coins me-1 text-warning"></i>Betragseinschränkung
                </label>
                <select id="bhr-amount-mode" class="form-select form-select-sm" onchange="bhUpdateRuleAmountInputs()">
                  <option value="any" ${amtMode === 'any' ? 'selected' : ''}>Beliebiger Betrag (Standard)</option>
                  <option value="exact" ${amtMode === 'exact' ? 'selected' : ''}>Exakter Betrag (=)</option>
                  <option value="range" ${amtMode === 'range' ? 'selected' : ''}>Betragsbereich (von ... bis)</option>
                  <option value="gt" ${amtMode === 'gt' ? 'selected' : ''}>Grösser als (&gt;)</option>
                  <option value="lt" ${amtMode === 'lt' ? 'selected' : ''}>Kleiner als (&lt;)</option>
                </select>
              </div>
              <div class="col-md-4" id="bhr-amount-min-wrap" style="display: ${amtMode === 'any' ? 'none' : 'block'};">
                <label id="bhr-amount-min-label" class="form-label fw-bold small mb-1">
                  ${amtMode === 'lt' ? 'Kleiner als (<) (CHF)' : (amtMode === 'gt' ? 'Grösser als (>) (CHF)' : (amtMode === 'range' ? 'Von Betrag (CHF)' : 'Exakter Betrag (CHF)'))}
                </label>
                <input type="number" step="0.01" min="0" id="bhr-amount-min" class="form-control form-control-sm font-monospace" placeholder="0.00" value="${(rule.amount_min !== undefined && rule.amount_min !== null && rule.amount_min !== '') ? rule.amount_min : ''}">
              </div>
              <div class="col-md-3" id="bhr-amount-max-wrap" style="display: ${amtMode === 'range' ? 'block' : 'none'};">
                <label class="form-label fw-bold small mb-1">Bis Betrag (CHF)</label>
                <input type="number" step="0.01" min="0" id="bhr-amount-max" class="form-control form-control-sm font-monospace" placeholder="0.00" value="${(rule.amount_max !== undefined && rule.amount_max !== null && rule.amount_max !== '') ? rule.amount_max : ''}">
              </div>
            </div>

            <div class="alert alert-light border py-1.5 px-2.5 mb-3 small text-muted">
              <i class="fas fa-info-circle me-1 text-info"></i>
              Mindestens ein Kriterium (Empfänger, Text oder Betrag) muss gesetzt sein. Sind mehrere Kriterien gesetzt, greift die Regel nur, wenn alle zutreffen.
            </div>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <label class="form-label fw-bold small">Soll-Konto</label>
                <input type="text" id="bhr-soll" list="bh-konten-datalist" class="form-control form-control-sm" placeholder="Soll-Konto..." value="${escHtml(rule.soll)}" required autocomplete="off">
              </div>
              <div class="col-6">
                <label class="form-label fw-bold small">Haben-Konto</label>
                <input type="text" id="bhr-haben" list="bh-konten-datalist" class="form-control form-control-sm" placeholder="Haben-Konto..." value="${escHtml(rule.haben)}" required autocomplete="off">
              </div>
            </div>
          </div>

          <div class="modal-footer border-0 bg-light rounded-bottom-4">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
            <button type="submit" class="btn btn-sm btn-primary px-3 fw-bold">
              <i class="fas fa-save me-1"></i> ${isEdit ? 'Änderungen speichern' : 'Regel erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.bhBankSaveRuleSubmit = function(e, editIdx) {
  e.preventDefault();

  const label        = document.getElementById('bhr-label').value.trim();
  const patternParty = document.getElementById('bhr-pattern-party').value.trim();
  const patternText  = document.getElementById('bhr-pattern-text').value.trim();
  const prefix       = document.getElementById('bhr-prefix').value.trim() || label;
  const rawSoll      = document.getElementById('bhr-soll').value.trim();
  const rawHaben     = document.getElementById('bhr-haben').value.trim();

  const amountMode   = document.getElementById('bhr-amount-mode')?.value || 'any';
  const rawAmountMin = document.getElementById('bhr-amount-min')?.value.trim();
  const rawAmountMax = document.getElementById('bhr-amount-max')?.value.trim();

  const amountMin = (rawAmountMin !== '' && !isNaN(Number(rawAmountMin))) ? Number(rawAmountMin) : '';
  const amountMax = (rawAmountMax !== '' && !isNaN(Number(rawAmountMax))) ? Number(rawAmountMax) : '';

  const soll  = rawSoll.split('|')[0].trim();
  const haben = rawHaben.split('|')[0].trim();

  const hasAnyFilter = Boolean(patternParty || patternText || (amountMode !== 'any' && amountMin !== ''));

  if (!label || !hasAnyFilter || !soll || !haben) {
    alert('Bitte Regel-Bezeichnung, mindestens ein Filterkriterium (Empfänger, Verwendungszweck oder Betrag) sowie Soll- und Haben-Konto angeben.');
    return;
  }

  const legacyPattern = patternParty || patternText;
  const legacyScope = (patternParty && !patternText) ? 'party' : (!patternParty && patternText ? 'text' : 'all');

  const ruleObj = {
    label,
    pattern_party: patternParty,
    pattern_text: patternText,
    prefix,
    soll,
    haben,
    pattern: legacyPattern,
    scope: legacyScope,
    amount_mode: amountMode,
    amount_min: amountMin,
    amount_max: amountMax
  };

  const rules = window.getBhBankRules();

  if (editIdx >= 0 && editIdx < rules.length) {
    rules[editIdx] = ruleObj;
    showToast(`✅ Regel "${label}" erfolgreich aktualisiert!`, 'success');
  } else {
    rules.push(ruleObj);
    showToast(`✅ Neue Regel "${label}" gespeichert!`, 'success');
  }

  window.saveBhBankRules(rules);

  const editorModalEl = document.getElementById('bhModalRuleEditor');
  if (editorModalEl) bootstrap.Modal.getInstance(editorModalEl)?.hide();

  // Live Neu-Match durchführen
  if (window._bhBankTransactions && window._bhBankTransactions.length > 0) {
    window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
    bhBankRenderResults(window._bhBankActiveFilter);
  }

  // Falls das Verwalten-Modal offen ist, Ansicht neu rendern
  const manageModalEl = document.getElementById('bhModalManageRules');
  if (manageModalEl && manageModalEl.classList.contains('show')) {
    bhBankManageRulesModal();
  }
};

// ---------------------------------------------------------------------
// Regel merken aus Zeilen-Button (+)
// ---------------------------------------------------------------------
window.bhBankSaveRuleModal = function(txIdx) {
  const tx = window._bhBankMatchResults[txIdx];
  if (!tx) return;

  const party = (tx.partyName || '').trim();
  const rmtEl = document.getElementById(`bh-rmt-${txIdx}`);
  const remittance = (rmtEl ? rmtEl.value : (tx.remittanceInfo || '')).trim();

  const sollEl  = document.getElementById(`bh-soll-${txIdx}`);
  const habenEl = document.getElementById(`bh-haben-${txIdx}`);

  const sollVal  = sollEl ? sollEl.value : tx.suggestedSoll;
  const habenVal = habenEl ? habenEl.value : tx.suggestedHaben;
  const txAmt    = (tx.amount !== undefined && tx.amount !== null) ? Number(tx.amount).toFixed(2) : '';

  bhBankOpenRuleEditorModal(-1, {
    label: party || remittance || 'Neue Regel',
    prefix: party || remittance || '',
    pattern_party: party,
    pattern_text: '',
    pattern: party || remittance,
    scope: party ? 'party' : 'text',
    soll: sollVal,
    haben: habenVal,
    amount_mode: 'any',
    amount_min: txAmt,
    amount_max: ''
  });
};

// ---------------------------------------------------------------------
// Regeln verwalten Modal & Vollbild-Toggle
// ---------------------------------------------------------------------
window._bhManageRulesIsFullscreen = window._bhManageRulesIsFullscreen || false;
window.bhToggleManageRulesFullscreen = function() {
  window._bhManageRulesIsFullscreen = !window._bhManageRulesIsFullscreen;
  const dialog = document.getElementById('bhModalManageRulesDialog');
  const icon = document.getElementById('bhManageRulesFsIcon');
  const tableWrap = document.getElementById('bhManageRulesTableWrap');
  if (!dialog) return;

  if (window._bhManageRulesIsFullscreen) {
    dialog.classList.add('modal-fullscreen');
    dialog.classList.remove('modal-xl');
    if (icon) icon.className = 'fas fa-compress';
    if (tableWrap) tableWrap.style.maxHeight = 'calc(100vh - 220px)';
  } else {
    dialog.classList.remove('modal-fullscreen');
    dialog.classList.add('modal-xl');
    if (icon) icon.className = 'fas fa-expand';
    if (tableWrap) tableWrap.style.maxHeight = '520px';
  }
};

window.bhBankManageRulesModal = function() {
  const rules = window.getBhBankRules();

  let modalEl = document.getElementById('bhModalManageRules');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalManageRules';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  function extractCleanKontoNr(val) {
    if (!val) return '–';
    const str = String(val).trim();
    const match = str.match(/\b\d{4}\b/);
    if (match) return match[0];
    return str.split('|')[0].trim().substring(0, 8);
  }

  const rulesRows = rules.length ? rules.map((r, i) => {
    const sollNr  = extractCleanKontoNr(r.soll);
    const habenNr = extractCleanKontoNr(r.haben);

    const partyVal = r.pattern_party !== undefined ? r.pattern_party : (r.scope === 'party' ? r.pattern : '');
    const textVal  = r.pattern_text  !== undefined ? r.pattern_text  : (r.scope === 'text'  ? r.pattern : '');
    const legacyVal = (!partyVal && !textVal) ? (r.pattern || '') : '';

    let partyHtml = partyVal
      ? `<code class="text-primary bg-light px-2 py-0.5 rounded border small fw-bold">${escHtml(partyVal)}</code>`
      : (legacyVal ? `<code class="text-secondary bg-light px-2 py-0.5 rounded border small">${escHtml(legacyVal)}</code>` : '<span class="text-muted small">–</span>');

    let textHtml = textVal
      ? `<code class="text-success bg-light px-2 py-0.5 rounded border small fw-bold">${escHtml(textVal)}</code>`
      : (legacyVal ? `<span class="badge bg-light text-muted border">Überall</span>` : '<span class="text-muted small">–</span>');

    // Betragsbedingung Formatierung
    const amtMode = r.amount_mode || 'any';
    let amtHtml = '<span class="text-muted small">Beliebig</span>';
    if (amtMode === 'exact' && r.amount_min !== '' && r.amount_min !== undefined) {
      amtHtml = `<span class="badge bg-light text-dark border font-monospace" title="Exakt gleich">= CHF ${Number(r.amount_min).toFixed(2)}</span>`;
    } else if (amtMode === 'gt' && r.amount_min !== '' && r.amount_min !== undefined) {
      amtHtml = `<span class="badge bg-light text-dark border font-monospace" title="Grösser als">&gt; CHF ${Number(r.amount_min).toFixed(2)}</span>`;
    } else if (amtMode === 'lt' && ((r.amount_min !== '' && r.amount_min !== undefined) || (r.amount_max !== '' && r.amount_max !== undefined))) {
      const val = (r.amount_max !== '' && r.amount_max !== undefined) ? r.amount_max : r.amount_min;
      amtHtml = `<span class="badge bg-light text-dark border font-monospace" title="Kleiner als">&lt; CHF ${Number(val).toFixed(2)}</span>`;
    } else if (amtMode === 'range' && (r.amount_min !== '' || r.amount_max !== '')) {
      amtHtml = `<span class="badge bg-light text-dark border font-monospace" title="Betragsbereich">CHF ${Number(r.amount_min || 0).toFixed(2)} – ${Number(r.amount_max || 0).toFixed(2)}</span>`;
    }

    return `
      <tr>
        <td><span class="fw-bold text-dark">${escHtml(r.label)}</span></td>
        <td>${partyHtml}</td>
        <td>${textHtml}</td>
        <td>${amtHtml}</td>
        <td><span class="text-muted small fw-semibold">${escHtml(r.prefix || r.label)}</span></td>
        <td><span class="badge bg-primary font-monospace px-2 py-1" title="Soll: ${escHtml(r.soll)}">${escHtml(sollNr)}</span></td>
        <td><span class="badge bg-success font-monospace px-2 py-1" title="Haben: ${escHtml(r.haben)}">${escHtml(habenNr)}</span></td>
        <td class="text-end" style="white-space: nowrap;">
          <button class="btn btn-sm btn-outline-primary py-1 px-2 me-1" onclick="bhBankOpenRuleEditorModal(${i})" title="Regel bearbeiten">
            <i class="fas fa-edit me-1"></i>Bearbeiten
          </button>
          <button class="btn btn-sm btn-outline-danger py-1 px-2" onclick="bhBankDeleteRule(${i})" title="Regel löschen">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="8" class="text-center text-muted py-4">
        <i class="fas fa-magic fa-2x mb-2" style="opacity:0.3;"></i>
        <p class="mb-0">Noch keine Benutzer-Regeln definiert.</p>
      </td>
    </tr>
  `;

  const isFs = window._bhManageRulesIsFullscreen;

  modalEl.innerHTML = `
    <div id="bhModalManageRulesDialog" class="modal-dialog ${isFs ? 'modal-fullscreen' : 'modal-xl'} modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-dark text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-sliders-h me-2"></i>Automatische Buchungsregeln verwalten</h5>
          <div class="d-flex align-items-center ms-auto">
            <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 me-2" onclick="bhToggleManageRulesFullscreen()" title="Vollbild umschalten (Vergrössern / Verkleinern)">
              <i id="bhManageRulesFsIcon" class="fas ${isFs ? 'fa-compress' : 'fa-expand'}"></i>
            </button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
        </div>
        <div class="modal-body p-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <p class="text-muted small mb-0">Erstelle oder bearbeite Regeln für die automatische Zuordnung von Kontoauszug-Transaktionen (getrennte Kriterien für Empfänger/Zahler, Verwendungszweck und optionale Betragsfilter).</p>
            <button class="btn btn-sm btn-success fw-bold px-3" onclick="bhBankOpenRuleEditorModal(-1)">
              <i class="fas fa-plus me-1"></i>Neue Regel erstellen
            </button>
          </div>
          <div id="bhManageRulesTableWrap" class="table-responsive" style="max-height: ${isFs ? 'calc(100vh - 220px)' : '520px'}; overflow-y: auto;">
            <table class="table table-hover table-sm align-middle mb-0" style="table-layout: fixed; width: 100%;">
              <thead class="table-light sticky-top">
                <tr>
                  <th style="width: 17%;">Bezeichnung</th>
                  <th style="width: 15%;"><i class="fas fa-user me-1 text-primary"></i>Empfänger / Zahler</th>
                  <th style="width: 15%;"><i class="fas fa-file-alt me-1 text-success"></i>Verwendungszweck</th>
                  <th style="width: 14%;"><i class="fas fa-coins me-1 text-warning"></i>Betrag</th>
                  <th style="width: 17%;">Journal-Text / Präfix</th>
                  <th style="width: 6%;">Soll</th>
                  <th style="width: 6%;">Haben</th>
                  <th style="width: 10%;" class="text-end">Aktionen</th>
                </tr>
              </thead>
              <tbody>${rulesRows}</tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer border-0 bg-light rounded-bottom-4">
          <button class="btn btn-sm btn-secondary px-4 fw-bold" data-bs-dismiss="modal">Schliessen</button>
        </div>
      </div>
    </div>
  `;

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.bhBankDeleteRule = function(idx) {
  const rules = window.getBhBankRules();
  const r = rules[idx];
  const ok = confirm(`Regel "${r ? r.label : ''}" wirklich löschen?`);
  if (!ok) return;

  rules.splice(idx, 1);
  window.saveBhBankRules(rules);

  showToast('Regel gelöscht.', 'info');

  if (window._bhBankTransactions && window._bhBankTransactions.length > 0) {
    window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
    bhBankRenderResults(window._bhBankActiveFilter);
  }

  const manageModalEl = document.getElementById('bhModalManageRules');
  if (manageModalEl && manageModalEl.classList.contains('show')) {
    bhBankManageRulesModal();
  }
};

// =====================================================================
// SPLIT-BUCHUNG MODAL & VERARBEITUNG
// =====================================================================
window.bhBankOpenSplitModal = function(txIdx) {
  const rows = window._bhBankMatchResults || [];
  const tx = rows[txIdx];
  if (!tx) return;

  window._bhSplitCurrentTxIndex = txIdx;
  const isCredit = tx.isCredit;
  const partyOrInfo = (tx.partyName || tx.remittanceInfo || 'Abrechnung Wettschiessen').trim();

  const txBankKonto = bhBankGetAccountForIban(tx.accountIban, '1020');

  // Preset 2 Split-Zeilen
  window._bhSplitCurrentRows = [
    {
      beschreibung: `${partyOrInfo} (Erwachsene / Transit 1190)`,
      betrag: Number(tx.amount || 0),
      kontoSoll: isCredit ? txBankKonto : '1190',
      kontoHaben: isCredit ? '1190' : txBankKonto
    },
    {
      beschreibung: `${partyOrInfo} (Junioren / Nachwuchsförderung)`,
      betrag: 0,
      kontoSoll: isCredit ? txBankKonto : '4210',
      kontoHaben: isCredit ? '4210' : txBankKonto
    }
  ];

  let modalEl = document.getElementById('bhBankSplitModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhBankSplitModal';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  bhBankRenderSplitModalContent(tx);
  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
};

function bhBankRenderSplitModalContent(tx) {
  const modalEl = document.getElementById('bhBankSplitModal');
  if (!modalEl) return;

  const totalAmount = Number(tx.amount || 0);
  const splitRows = window._bhSplitCurrentRows || [];
  const currentSum = splitRows.reduce((s, r) => s + (Number(r.betrag) || 0), 0);
  const diff = totalAmount - currentSum;
  const isBalanced = Math.abs(diff) < 0.01;

  const kontenrahmen = window._bhKontenrahmen || [];

  function makeKontoSelectHTML(id, selectedVal) {
    const matched = kontenrahmen.find(k => String(k.konto).trim() === String(selectedVal).trim());
    const displayVal = matched ? `${matched.konto} | ${matched.bezeichnung}` : (selectedVal ? String(selectedVal) : '');
    return `<input type="text" id="${id}" list="bh-konten-datalist" class="form-control form-control-sm" placeholder="Konto..." value="${escHtml(displayVal)}" autocomplete="off">`;
  }

  let tableRowsHtml = splitRows.map((r, i) => {
    const amtVal = (r.betrag !== undefined && r.betrag !== null) ? r.betrag : '';
    return `
      <tr>
        <td class="text-center font-monospace fw-bold small" style="width:30px;">#${i + 1}</td>
        <td>
          <input type="text" class="form-control form-control-sm" id="bh-split-desc-${i}" value="${escHtml(r.beschreibung)}" placeholder="Beschreibung..." oninput="bhBankUpdateSplitLiveBalance()">
        </td>
        <td style="width: 140px;">
          <input type="number" step="0.01" class="form-control form-control-sm text-end fw-bold" id="bh-split-amt-${i}" value="${amtVal}" placeholder="0.00" oninput="bhBankUpdateSplitLiveBalance()">
        </td>
        <td style="width: 170px;">
          ${makeKontoSelectHTML(`bh-split-soll-${i}`, r.kontoSoll)}
        </td>
        <td style="width: 170px;">
          ${makeKontoSelectHTML(`bh-split-haben-${i}`, r.kontoHaben)}
        </td>
        <td class="text-center" style="width:40px;">
          ${splitRows.length > 1 ? `<button class="btn btn-sm btn-outline-danger py-0 px-1.5" onclick="bhBankRemoveSplitRow(${i})"><i class="fas fa-times"></i></button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-centered">
      <div class="modal-content shadow-lg border-0 rounded-4">
        <div class="modal-header bg-primary text-white">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-columns me-2"></i>Split-Buchung durchführen
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <div class="alert bg-light border-start border-4 border-warning shadow-sm mb-4">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div>
                <span class="badge bg-warning text-dark me-2">CAMT Transaktion</span>
                <strong>${formatSwissDate(tx.bookingDate)}</strong> &middot; ${escHtml(tx.partyName || 'Bank-Transaktion')}
                <div class="small text-muted mt-1">${escHtml(tx.remittanceInfo || '')}</div>
              </div>
              <div class="text-end">
                <span class="text-muted small d-block">Gesamtbetrag Bank</span>
                <span class="fs-4 fw-bold ${tx.isCredit ? 'text-success' : 'text-danger'}">
                  ${tx.isCredit ? '+' : '-'} CHF ${totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="fw-bold mb-0 text-primary"><i class="fas fa-list me-1"></i>Split-Positionen (Kontoaufteilung)</h6>
            <button class="btn btn-sm btn-outline-primary" onclick="bhBankAddSplitRow()">
              <i class="fas fa-plus me-1"></i>Zeile hinzufügen
            </button>
          </div>

          <div class="table-responsive mb-3">
            <table class="table table-sm align-middle table-bordered">
              <thead class="table-light small">
                <tr>
                  <th style="width:30px;">#</th>
                  <th>Buchungstext / Beschreibung</th>
                  <th style="width:140px;" class="text-end">Betrag (CHF)</th>
                  <th style="width:170px;">Soll-Konto</th>
                  <th style="width:170px;">Haben-Konto</th>
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- Live Balance Banner -->
          <div id="bh-split-banner" class="card p-3 border-0 ${isBalanced ? 'bg-success-subtle text-success border-success' : 'bg-warning-subtle text-dark border-warning'} rounded-3">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span class="fw-bold"><i id="bh-split-banner-icon" class="fas ${isBalanced ? 'fa-check-circle text-success' : 'fa-exclamation-triangle text-warning'} me-2"></i>Status Aufteilung:</span>
                Summe Split-Zeilen: <strong>CHF <span id="bh-split-current-sum">${currentSum.toFixed(2)}</span></strong> von <strong>CHF ${totalAmount.toFixed(2)}</strong>
              </div>
              <div class="fw-bold fs-6" id="bh-split-diff-status">
                ${isBalanced ? '<span class="badge bg-success fs-6"><i class="fas fa-check me-1"></i>Betrag exakt aufgeteilt</span>' : `<span class="text-danger"><i class="fas fa-times-circle me-1"></i>Rest unverteilt: CHF ${diff.toFixed(2)}</span>`}
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer bg-light">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
          <button type="button" id="bh-split-save-btn" class="btn btn-success fw-bold px-4" ${!isBalanced ? 'disabled' : ''} onclick="bhBankSaveSplitBooking(${window._bhSplitCurrentTxIndex})">
            <i class="fas fa-save me-1"></i>Split-Buchung speichern (${splitRows.length} Zeilen)
          </button>
        </div>
      </div>
    </div>
  `;
}

window.bhBankUpdateSplitLiveBalance = function() {
  const rows = window._bhSplitCurrentRows || [];
  rows.forEach((r, i) => {
    const descEl = document.getElementById(`bh-split-desc-${i}`);
    const amtEl = document.getElementById(`bh-split-amt-${i}`);
    const sollEl = document.getElementById(`bh-split-soll-${i}`);
    const habenEl = document.getElementById(`bh-split-haben-${i}`);

    if (descEl) r.beschreibung = descEl.value;
    if (amtEl) r.betrag = amtEl.value !== '' ? (parseFloat(amtEl.value) || 0) : 0;
    if (sollEl) r.kontoSoll = String(sollEl.value || '').split('|')[0].trim();
    if (habenEl) r.kontoHaben = String(habenEl.value || '').split('|')[0].trim();
  });

  const txs = window._bhBankMatchResults || [];
  const tx = txs[window._bhSplitCurrentTxIndex];
  if (!tx) return;

  const totalAmount = Number(tx.amount || 0);
  const currentSum = rows.reduce((s, r) => s + (Number(r.betrag) || 0), 0);
  const diff = totalAmount - currentSum;
  const isBalanced = Math.abs(diff) < 0.01;

  const sumEl = document.getElementById('bh-split-current-sum');
  if (sumEl) sumEl.textContent = currentSum.toFixed(2);

  const diffStatusEl = document.getElementById('bh-split-diff-status');
  if (diffStatusEl) {
    diffStatusEl.innerHTML = isBalanced 
      ? '<span class="badge bg-success fs-6"><i class="fas fa-check me-1"></i>Betrag exakt aufgeteilt</span>' 
      : `<span class="text-danger"><i class="fas fa-times-circle me-1"></i>Rest unverteilt: CHF ${diff.toFixed(2)}</span>`;
  }

  const bannerEl = document.getElementById('bh-split-banner');
  if (bannerEl) {
    bannerEl.className = `card p-3 border-0 ${isBalanced ? 'bg-success-subtle text-success border-success' : 'bg-warning-subtle text-dark border-warning'} rounded-3`;
  }

  const iconEl = document.getElementById('bh-split-banner-icon');
  if (iconEl) {
    iconEl.className = `fas ${isBalanced ? 'fa-check-circle text-success' : 'fa-exclamation-triangle text-warning'} me-2`;
  }

  const saveBtn = document.getElementById('bh-split-save-btn');
  if (saveBtn) {
    saveBtn.disabled = !isBalanced;
  }
};

window.bhBankUpdateSplitFromInputs = function() {
  const rows = window._bhSplitCurrentRows || [];
  rows.forEach((r, i) => {
    const descEl = document.getElementById(`bh-split-desc-${i}`);
    const amtEl = document.getElementById(`bh-split-amt-${i}`);
    const sollEl = document.getElementById(`bh-split-soll-${i}`);
    const habenEl = document.getElementById(`bh-split-haben-${i}`);

    if (descEl) r.beschreibung = descEl.value;
    if (amtEl) r.betrag = amtEl.value !== '' ? (parseFloat(amtEl.value) || 0) : 0;
    if (sollEl) r.kontoSoll = String(sollEl.value || '').split('|')[0].trim();
    if (habenEl) r.kontoHaben = String(habenEl.value || '').split('|')[0].trim();
  });
};

window.bhBankAddSplitRow = function() {
  bhBankUpdateSplitFromInputs();
  const txs = window._bhBankMatchResults || [];
  const tx = txs[window._bhSplitCurrentTxIndex];
  const isCredit = tx ? tx.isCredit : false;
  const txBankKonto = tx ? bhBankGetAccountForIban(tx.accountIban, '1020') : '1020';

  (window._bhSplitCurrentRows = window._bhSplitCurrentRows || []).push({
    beschreibung: (tx ? (tx.partyName || tx.remittanceInfo || 'Split-Position') : 'Split-Position'),
    betrag: 0,
    kontoSoll: isCredit ? txBankKonto : '1190',
    kontoHaben: isCredit ? '1190' : txBankKonto
  });

  if (tx) bhBankRenderSplitModalContent(tx);
};

window.bhBankRemoveSplitRow = function(idx) {
  bhBankUpdateSplitFromInputs();
  if (window._bhSplitCurrentRows && window._bhSplitCurrentRows.length > 1) {
    window._bhSplitCurrentRows.splice(idx, 1);
  }
  const txs = window._bhBankMatchResults || [];
  const tx = txs[window._bhSplitCurrentTxIndex];
  if (tx) bhBankRenderSplitModalContent(tx);
};

window.bhBankSaveSplitBooking = async function(txIdx) {
  bhBankUpdateSplitFromInputs();
  const txs = window._bhBankMatchResults || [];
  const tx = txs[txIdx];
  if (!tx) return;

  const splitRows = window._bhSplitCurrentRows || [];
  const totalAmount = Number(tx.amount || 0);
  const currentSum = splitRows.reduce((s, r) => s + (Number(r.betrag) || 0), 0);

  if (Math.abs(totalAmount - currentSum) >= 0.01) {
    alert(`⚠️ Die Summe der Split-Zeilen (CHF ${currentSum.toFixed(2)}) entspricht nicht dem Bankbetrag (CHF ${totalAmount.toFixed(2)}).`);
    return;
  }

  // Validierung der einzelnen Zeilen
  for (let i = 0; i < splitRows.length; i++) {
    const r = splitRows[i];
    if (!r.beschreibung.trim()) {
      alert(`Bitte Beschreibung für Zeile #${i+1} eingeben.`);
      return;
    }
    if (!r.kontoSoll || !r.kontoHaben) {
      alert(`Bitte Soll- und Haben-Konto für Zeile #${i+1} angeben.`);
      return;
    }
    if (r.kontoSoll === r.kontoHaben) {
      alert(`Soll- und Haben-Konto für Zeile #${i+1} dürfen nicht identisch sein.`);
      return;
    }
  }

  const saveBtn = document.querySelector('#bhBankSplitModal .modal-footer button.btn-success');
  if (window._bhIsSavingSplit) return;
  window._bhIsSavingSplit = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Speichere...';
  }

  const year = Number(window._bhYear || new Date().getFullYear());
  const txBankKonto = bhBankGetAccountForIban(tx.accountIban, '1020');
  const baseSeq = bhGetNextBankBelegSeq(year, txBankKonto);
  const prefix = getBankBelegPrefix(txBankKonto);
  const baseBelegSeq = String(baseSeq).padStart(3, '0');

  try {
    let successCount = 0;

    for (let i = 0; i < splitRows.length; i++) {
      const r = splitRows[i];
      if (Number(r.betrag) === 0) continue; // 0 CHF Zeilen überspringen

      const subChar = String.fromCharCode(97 + i); // a, b, c...
      const belegNr = `${prefix}${year}-${baseBelegSeq}${subChar}`;

      const payloadBh = {
        action: 'addJournalEntry',
        jahr: year,
        datum: tx.bookingDate || new Date().toISOString().split('T')[0],
        beleg_nr: belegNr,
        beschreibung: r.beschreibung,
        konto_soll: r.kontoSoll,
        konto_haben: r.kontoHaben,
        betrag: Number(r.betrag),
        typ: 'Bank-Split'
      };

      const resBh = await apiFetch('buchhaltung', payloadBh, 'POST');
      const jsonBh = await resBh.json();
      if (!jsonBh.success) throw new Error(jsonBh.error || `Fehler beim Buchen der Split-Zeile #${i+1}`);

      window._bhJournal = window._bhJournal || [];
      window._bhJournal.push({
        id: (jsonBh.data && jsonBh.data.id) ? jsonBh.data.id : Date.now() + i,
        jahr: year,
        datum: tx.bookingDate || new Date().toISOString().split('T')[0],
        beleg_nr: belegNr,
        beschreibung: r.beschreibung,
        konto_soll: r.kontoSoll,
        konto_haben: r.kontoHaben,
        betrag: Number(r.betrag),
        typ: 'Bank-Split'
      });

      successCount++;
    }

    // Transaktion als gebucht markieren
    window._bhBankMatchResults[txIdx].alreadyBooked = true;
    window._bhBankMatchResults[txIdx].bookedDate = new Date().toLocaleDateString('de-CH');

    // Modal schliessen
    const modalEl = document.getElementById('bhBankSplitModal');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    }

    if (typeof showToast === 'function') {
      showToast(`✅ Split-Buchung erfolgreich! ${successCount} Buchungssätze ins Kassabuch eingetragen.`, 'success');
    } else {
      alert(`✅ Split-Buchung erfolgreich! ${successCount} Buchungssätze eingetragen.`);
    }

    bhBankRenderResults(window._bhBankActiveFilter);
  } catch (err) {
    alert('❌ Fehler bei der Split-Buchung: ' + err.message);
  } finally {
    window._bhIsSavingSplit = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fas fa-save me-1"></i>Split-Buchung speichern (${splitRows.length} Zeilen)`;
    }
  }
};
