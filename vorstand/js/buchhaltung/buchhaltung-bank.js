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

  // Sicherstellen, dass Kontenrahmen, Rechnungsdaten und Beitrags-Gebühren geladen sind
  if ((!window._bhKontenrahmen || window._bhKontenrahmen.length === 0)) {
    try {
      const cached = localStorage.getItem('bh_kontenrahmen');
      if (cached) window._bhKontenrahmen = JSON.parse(cached);
    } catch(_) {}
    if ((!window._bhKontenrahmen || window._bhKontenrahmen.length === 0) && typeof window.loadBuchhaltungData === 'function') {
      window.loadBuchhaltungData(true).then(() => {
        if (window._bhBankTransactions && window._bhBankTransactions.length > 0) {
          window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
          bhBankRenderResults(window._bhBankActiveFilter);
        }
      }).catch(() => {});
    }
  }

  if ((!window._invoices || window._invoices.length === 0) && typeof window.loadRechnungenData === 'function') {
    window.loadRechnungenData(true).then(() => {
      if (window._bhBankTransactions && window._bhBankTransactions.length > 0) {
        window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
        bhBankRenderResults(window._bhBankActiveFilter);
      }
    }).catch(() => {});
  }
  if (!window._jbGebuehren || window._jbGebuehren.length === 0) {
    apiFetch('jahresbeitrag', 'action=getGebuehren')
      .then(r => r.json())
      .then(json => { if (json && json.success) window._jbGebuehren = json.data || []; })
      .catch(() => {});
  }
  if (!window._jbAllPositions || window._jbAllPositions.length === 0) {
    apiFetch('jahresbeitrag', 'action=getPositionen')
      .then(r => r.json())
      .then(json => { if (json && json.success) window._jbAllPositions = json.positions || []; })
      .catch(() => {});
  }

  const hasResults = window._bhBankMatchResults && window._bhBankMatchResults.length > 0;
  const results = window._bhBankMatchResults || [];

  const jbCount = results.filter(r => r.isJahresbeitrag || r.isInvoice).length;
  const ruleCount = results.filter(r => !r.isJahresbeitrag && !r.isInvoice && (r.matchType === 'rule' || r.matchType === 'journal' || r.matchType === 'heuristic')).length;
  const unklarCount = results.filter(r => !r.isJahresbeitrag && !r.isInvoice && r.matchType !== 'rule' && r.matchType !== 'journal' && !r.alreadyBooked).length;

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
          <i class="fas fa-file-invoice-dollar me-1"></i>Beiträge & Rechnungen (${jbCount})
        </button>
        <button class="btn btn-sm btn-outline-info text-dark" id="bhBankFilterRules" onclick="bhBankFilter('rules')">
          <i class="fas fa-magic me-1"></i>Erkannte Regeln (${ruleCount})
        </button>
        <button class="btn btn-sm btn-outline-warning text-dark" id="bhBankFilterUnklar" onclick="bhBankFilter('unklar')">
          <i class="fas fa-question-circle me-1"></i>Unklar (${unklarCount})
        </button>
        
        <div class="ms-auto d-flex gap-3 align-items-center flex-wrap justify-content-end">
          <div class="text-muted small d-none d-md-flex align-items-center bg-light border rounded-3 px-2.5 py-1" style="font-size: 11.5px;" title="Garantiert saubere Belegnummern und Datumschronologie">
            <i class="fas fa-info-circle text-primary me-1.5"></i>
            <span>Buchungen werden in einem Schritt chronologisch nach Datum sortiert verbucht.</span>
          </div>
          <button class="btn btn-sm btn-success fw-bold shadow-sm px-3 py-1.5" id="bhBtnBookAll" onclick="bhBankBookAll()" title="Alle offenen Bank-Buchungen chronologisch nach Datum sortiert ins Journal buchen">
            <i class="fas fa-bolt me-1"></i>Alle Buchungen ausführen
          </button>
        </div>
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
  const jbRows = results.filter(r => r.isJahresbeitrag || r.isInvoice);
  const ruleRows = results.filter(r => !r.isJahresbeitrag && !r.isInvoice && (r.matchType === 'rule' || r.matchType === 'journal' || r.matchType === 'heuristic'));
  const unklarRows = results.filter(r => !r.isJahresbeitrag && !r.isInvoice && r.matchType !== 'rule' && r.matchType !== 'journal' && !r.alreadyBooked);
  const bookedRows = results.filter(r => r.alreadyBooked);
  const openRows = results.filter(r => !r.alreadyBooked);

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
          <div class="small text-muted">Beiträge, Rechnungen & Regeln</div>
          <div class="fs-5 fw-bold text-primary">${jbRows.length + ruleRows.length}</div>
          <div class="text-muted small">${jbRows.length} Rechnungen/Beiträge · ${ruleRows.length} Regeln</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-warning bg-light">
          <div class="small text-muted">Offen im Kassabuch</div>
          <div class="fs-5 fw-bold text-dark">${openRows.length} offen</div>
          <div class="text-muted small">${bookedRows.length} gebucht · <span class="text-warning fw-semibold">${unklarRows.length} noch unklar</span></div>
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
      // Vom Haben-Konto direkt ins Soll-Konto der nächsten Zeile
      else if (input.id && input.id.startsWith('bh-haben-')) {
        const tr = input.closest('tr');
        const nextTr = tr ? tr.nextElementSibling : null;
        const nextSoll = nextTr ? nextTr.querySelector('input[id^="bh-soll-"]') : null;
        if (nextSoll) {
          nextSoll.focus({ preventScroll: true });
          try { nextSoll.select(); } catch (_) {}
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
  const tx = rows[idx];
  if (!tx) return;
  tx.remittanceInfo = val;
  tx._customRemittance = val;
  const isEdited = !!(tx._originalRemittanceInfo && val.trim() !== tx._originalRemittanceInfo.trim());
  tx._customRemittanceEdited = isEdited;

  if (window._bhBankTransactions && window._bhBankTransactions[idx]) {
    window._bhBankTransactions[idx].remittanceInfo = val;
    window._bhBankTransactions[idx]._customRemittance = val;
    window._bhBankTransactions[idx]._customRemittanceEdited = isEdited;
  }

  const origEl = document.getElementById(`bh-rmt-orig-${idx}`);
  if (origEl) {
    if (isEdited) {
      origEl.innerHTML = `<i class="fas fa-info-circle me-1 opacity-75"></i>Original: ${escHtml(tx._originalRemittanceInfo)}`;
      origEl.classList.remove('d-none');
    } else {
      origEl.innerHTML = '';
      origEl.classList.add('d-none');
    }
  }
};

window._bhUpdateTxKonto = function(idx, type, val) {
  const rows = window._bhBankMatchResults || [];
  const tx = rows[idx];
  if (!tx) return;

  function resolveCode(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (s.includes('|')) return s.split('|')[0].trim();
    if (/^\d{4}$/.test(s)) return s;
    const matches = typeof bhFindMatchingKonten === 'function' ? bhFindMatchingKonten(s) : [];
    return matches.length > 0 ? String(matches[0].konto).trim() : s;
  }

  const code = resolveCode(val);
  if (type === 'soll') {
    tx.suggestedSoll = code;
    tx._customSollEdited = true;
  } else if (type === 'haben') {
    tx.suggestedHaben = code;
    tx._customHabenEdited = true;
  }

  if (window._bhBankTransactions && window._bhBankTransactions[idx]) {
    if (type === 'soll') {
      window._bhBankTransactions[idx].suggestedSoll = code;
      window._bhBankTransactions[idx]._customSollEdited = true;
    } else if (type === 'haben') {
      window._bhBankTransactions[idx].suggestedHaben = code;
      window._bhBankTransactions[idx]._customHabenEdited = true;
    }
  }

  // Status-Badge der Zeile dynamisch und reaktiv aktualisieren
  const badgeEl = document.getElementById(`bh-status-badge-${idx}`);
  if (badgeEl && !tx.alreadyBooked && !tx.isWrongYear) {
    if (tx.suggestedSoll && tx.suggestedHaben) {
      badgeEl.className = 'badge px-2 py-1.5 fw-semibold';
      badgeEl.style.cssText = 'background-color: rgba(25, 135, 84, 0.12); color: #0f5132; border: 1px solid rgba(25, 135, 84, 0.25);';
      badgeEl.innerHTML = '<i class="fas fa-check me-1"></i>Bereit';
      badgeEl.title = 'Vollständig kontiert und bereit zur Ausführung';
    } else {
      badgeEl.className = 'badge px-2 py-1.5 fw-semibold';
      badgeEl.style.cssText = 'background-color: rgba(255, 193, 7, 0.15); color: #664d03; border: 1px solid rgba(255, 193, 7, 0.35);';
      badgeEl.innerHTML = '<i class="fas fa-exclamation-circle text-warning me-1"></i>Konto fehlt';
      badgeEl.title = 'Gegenkonto fehlt noch. Kann manuell ergänzt werden oder wird als unvollständig gebucht.';
    }
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
  if (activeFilter === 'jb')     filtered = rows.filter(r => r.isJahresbeitrag || r.isInvoice);
  if (activeFilter === 'rules')  filtered = rows.filter(r => !r.isJahresbeitrag && !r.isInvoice && (r.matchType === 'rule' || r.matchType === 'journal' || r.matchType === 'heuristic'));
  if (activeFilter === 'unklar') filtered = rows.filter(r => !r.isJahresbeitrag && !r.isInvoice && r.matchType !== 'rule' && r.matchType !== 'journal' && !r.alreadyBooked);

  // Live-Aktualisierung des Statistik-Banners & Filter-Counts ohne DOM-Zerstörung
  const statsEl = document.getElementById('bhBankStatsBanner');
  if (statsEl && typeof bhBankStatsBannerHTML === 'function') {
    statsEl.innerHTML = bhBankStatsBannerHTML();
  }

  const jbCount = rows.filter(r => r.isJahresbeitrag || r.isInvoice).length;
  const ruleCount = rows.filter(r => !r.isJahresbeitrag && !r.isInvoice && (r.matchType === 'rule' || r.matchType === 'journal' || r.matchType === 'heuristic')).length;
  const unklarCount = rows.filter(r => !r.isJahresbeitrag && !r.isInvoice && r.matchType !== 'rule' && r.matchType !== 'journal' && !r.alreadyBooked).length;
  const offenCount = rows.filter(r => !r.alreadyBooked).length;
  const bookedCount = rows.filter(r => r.alreadyBooked).length;

  const btnOffen = document.getElementById('bhBankFilterOffen');
  if (btnOffen) btnOffen.innerHTML = `<i class="fas fa-hourglass-half me-1"></i>Offen (${offenCount})`;
  const btnBooked = document.getElementById('bhBankFilterBooked');
  if (btnBooked) btnBooked.innerHTML = `<i class="fas fa-check-double me-1"></i>Bereits gebucht (${bookedCount})`;
  const btnAll = document.getElementById('bhBankFilterAll');
  if (btnAll) btnAll.innerHTML = `Alle (${rows.length})`;
  const btnJb = document.getElementById('bhBankFilterJb');
  if (btnJb) btnJb.innerHTML = `<i class="fas fa-file-invoice-dollar me-1"></i>Beiträge & Rechnungen (${jbCount})`;
  const btnRules = document.getElementById('bhBankFilterRules');
  if (btnRules) btnRules.innerHTML = `<i class="fas fa-magic me-1"></i>Erkannte Regeln (${ruleCount})`;
  const btnUnklar = document.getElementById('bhBankFilterUnklar');
  if (btnUnklar) btnUnklar.innerHTML = `<i class="fas fa-question-circle me-1"></i>Unklar (${unklarCount})`;

  // Buttons "Alle sicheren Buchungen ausführen" und "Ausgewählte Buchungen verbuchen" aktualisieren
  if (typeof bhBankUpdateSafeBookingsBtn === 'function') {
    bhBankUpdateSafeBookingsBtn();
  }
  if (typeof bhBankUpdateSelectedBtn === 'function') {
    bhBankUpdateSelectedBtn();
  }

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
      const scoreA = a.alreadyBooked ? -2 : ((a.alreadyPaidJb || a.alreadyPaidInvoice) ? -1 : ((a.isJahresbeitrag || a.isInvoice) ? 2 : (a.matchScore || 0)));
      const scoreB = b.alreadyBooked ? -2 : ((b.alreadyPaidJb || b.alreadyPaidInvoice) ? -1 : ((b.isJahresbeitrag || b.isInvoice) ? 2 : (b.matchScore || 0)));
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

  function makeKontoSelectHTML(id, selectedVal, type, isLocked = false) {
    const cleanCode = String(selectedVal || '').split('|')[0].trim();
    const matchedKonto = kontenrahmen.find(k => String(k.konto).trim() === cleanCode);
    const displayVal = matchedKonto ? `${matchedKonto.konto} | ${matchedKonto.bezeichnung}` : (selectedVal ? String(selectedVal) : '');

    if (isLocked) {
      return `<div class="font-monospace small px-2 py-1 rounded bg-light border text-truncate text-secondary" style="max-width:180px;" title="${escHtml(displayVal || '–')}">${escHtml(displayVal || '–')}</div>`;
    }

    const realIdx = id.startsWith('bh-soll-') ? id.replace('bh-soll-', '') : id.replace('bh-haben-', '');
    const isEmpty = !cleanCode;
    const highlightStyle = isEmpty 
      ? 'background-color: #fff9db !important; border: 1.5px dashed #f59f00 !important; color: #495057;' 
      : '';
    const placeholderText = isEmpty ? '⚠️ Gegenkonto wählen...' : 'Ziffern/Name...';

    return `<input type="text" id="${id}" list="bh-konten-datalist" class="form-control form-control-sm bh-konto-input ${isEmpty ? 'bh-konto-empty' : ''}" placeholder="${placeholderText}" value="${escHtml(displayVal)}" style="font-size:12px; width:100%; min-width:140px; ${highlightStyle}" autocomplete="off" oninput="window._bhUpdateTxKonto(${realIdx}, '${type}', this.value)" onchange="window._bhUpdateTxKonto(${realIdx}, '${type}', this.value)" title="${escHtml(displayVal || 'Kein Gegenkonto zugeordnet (kann leer gebucht oder manuell gewählt werden)')}">`;
  }

  const realIdxMap = filtered.map(r => rows.indexOf(r));

  const rowsHTML = filtered.map((r, idx) => {
    const realI = realIdxMap[idx];
    const isCredit = r.isCredit;

    let statusBadge = '';
    const isRowEditable = !r.alreadyBooked && !r.isWrongYear;

    if (r.isWrongYear) {
      statusBadge = `<span class="badge bg-secondary opacity-75" title="🔒 FALSCHES BUCHUNGSJAHR: Diese Transaktion stammt aus ${r.txYear}, oben ist Buchhaltungsjahr ${window._bhYear} gewählt. Bitte oben Jahr umschalten!"><i class="fas fa-calendar-times me-1"></i>Jahr ${r.txYear}</span>`;
    } else if (r.alreadyBooked) {
      statusBadge = `<span class="badge bg-light text-secondary border" title="🔒 Transaktion wurde am ${escHtml(r.bookedDate || 'früher')} im Kassabuch erfasst."><i class="fas fa-check-double text-success me-1"></i>Gebucht</span>`;
    } else if (r.alreadyPaidInvoice) {
      statusBadge = `<span class="badge bg-secondary opacity-75" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="🔒 Rechnung ${escHtml(r.matchedInvoice?.id || '')} ist im Rechnungsmodul bereits als BEZAHLT markiert. Klicken zum Ändern oder Aufheben."><i class="fas fa-info-circle me-1"></i>Bezahlt <i class="fas fa-pen ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    } else if (r.alreadyPaidJb) {
      statusBadge = `<span class="badge bg-secondary opacity-75" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="🔒 Jahresbeitrag von ${escHtml(r.matchedMember?.FirstName || '')} ${escHtml(r.matchedMember?.LastName || '')} ist bereits als BEZAHLT markiert. Klicken zum Ändern oder Aufheben."><i class="fas fa-info-circle me-1"></i>Bezahlt <i class="fas fa-pen ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    } else if (r.isInvoice) {
      statusBadge = `<span class="badge bg-success" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="✅ RECHNUNGS-TREFFER: ${escHtml(r.matchedInvoice?.id || '')} (${escHtml(r.matchedInvoice?.name || '')}). Klicken zum Ändern oder Aufheben."><i class="fas fa-file-invoice me-1"></i>Rechnung <i class="fas fa-pen ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    } else if (r.isJahresbeitrag) {
      statusBadge = `<span class="badge bg-success" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="✅ JAHRESBEITRAG: Mitglied und offener Beitrag erkannt. Klicken zum Ändern oder Aufheben."><i class="fas fa-check-circle me-1"></i>Jahresbeitrag <i class="fas fa-pen ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    } else if (r.matchType === 'rule') {
      statusBadge = `<span class="badge bg-info text-dark" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="⚡ REGEL-TREFFER: ${escHtml(r.matchRuleName)}. Klicken zum Ändern oder Aufheben."><i class="fas fa-magic me-1"></i>Regel <i class="fas fa-pen ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    } else if (r.matchType === 'journal') {
      statusBadge = `<span class="badge bg-primary text-white" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="💡 HISTORIE-TREFFER: Noch NICHT gebucht! Klicken zum Ändern oder Zuordnen."><i class="fas fa-history me-1"></i>Historie <i class="fas fa-pen ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    } else if (r.matchType === 'heuristic') {
      statusBadge = `<span class="badge bg-light text-dark border" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="💡 SMART VORSCHLAG: Noch NICHT gebucht. Klicken zum Zuordnen."><i class="fas fa-lightbulb me-1"></i>Vorschlag <i class="fas fa-pen ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    } else {
      statusBadge = `<span class="badge bg-warning text-dark" role="button" tabindex="0" onclick="bhBankOpenAssignModal(${realI})" style="cursor:pointer;" title="❓ OFFEN: Keine automatische Zuordnung. Klicken zum Zuordnen."><i class="fas fa-question-circle me-1"></i>Offen <i class="fas fa-link ms-1 opacity-75" style="font-size:9px;"></i></span>`;
    }

    if (r.isVerbandsschiessen && !r.alreadyBooked && !r.isWrongYear) {
      statusBadge += `<br><span class="badge bg-warning text-dark mt-1" style="font-size:10px;" title="${escHtml(r.splitHint)}"><i class="fas fa-exclamation-triangle me-1"></i>Wettschiessen / Split</span>`;
    }

    let matchContent = '';
    if (r.isInvoice && r.matchedInvoice) {
      const inv = r.matchedInvoice;
      matchContent = `<div class="fw-semibold text-success" style="font-size:12px;">
        <i class="fas fa-file-invoice me-1"></i>${escHtml(inv.id)}: ${escHtml(inv.name)}
      </div>
      <div class="text-muted" style="font-size:10px;">Typ: ${escHtml(inv.type || 'Rechnung')} · Soll: CHF ${Number(inv.total_amount || 0).toFixed(2)}</div>`;
    } else if (r.isJahresbeitrag && r.matchedMember) {
      const m = r.matchedMember;
      matchContent = `<div class="fw-semibold text-primary" style="font-size:12px;">
        <i class="fas fa-user me-1"></i>${escHtml(m.FirstName)} ${escHtml(m.LastName)}
      </div>
      <div class="text-muted" style="font-size:10px;">Mitglieds-Nr: ${m.PersonNumber || '–'}</div>`;
    } else {
      matchContent = `<div class="text-muted" style="font-size:11px;">${escHtml(r.matchLabel || 'Manuelle Buchung')}</div>`;
    }

    let matchInfo = '';
    if (!isRowEditable) {
      matchInfo = matchContent;
    } else {
      matchInfo = `
        <div class="d-flex align-items-center justify-content-between gap-1">
          <div class="text-truncate">${matchContent}</div>
          <div class="dropdown flex-shrink-0">
            <button class="btn btn-xs btn-outline-secondary py-0 px-1 dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" title="Status & Zuordnung ändern">
              <i class="fas fa-pen small"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm" style="font-size: 12px; z-index: 1055;">
              ${(r.isJahresbeitrag || r.isInvoice) ? `
                <li><a class="dropdown-item text-danger fw-semibold" href="javascript:void(0)" onclick="bhBankRemoveJbAssignment(${realI})"><i class="fas fa-times-circle me-2"></i>Status Jahresbeitrag entfernen (Manuell)</a></li>
                <li><hr class="dropdown-divider my-1"></li>
              ` : ''}
              <li><a class="dropdown-item ${r.isJahresbeitrag ? '' : 'text-success fw-semibold'}" href="javascript:void(0)" onclick="bhBankOpenAssignModal(${realI}, 'member')"><i class="fas fa-id-card me-2"></i>${r.isJahresbeitrag ? 'Anderes Mitglied zuordnen...' : 'Als Jahresbeitrag zuordnen...'}</a></li>
              <li><a class="dropdown-item" href="javascript:void(0)" onclick="bhBankOpenAssignModal(${realI}, 'invoice')"><i class="fas fa-file-invoice me-2"></i>Rechnung zuordnen...</a></li>
              <li><hr class="dropdown-divider my-1"></li>
              <li><a class="dropdown-item text-secondary" href="javascript:void(0)" onclick="bhBankOpenAssignModal(${realI})"><i class="fas fa-sliders-h me-2"></i>Status &amp; Zuordnung anpassen...</a></li>
            </ul>
          </div>
        </div>
      `;
    }

    const sollSelectId = `bh-soll-${realI}`;
    const habenSelectId = `bh-haben-${realI}`;

    let actionButtons = '';
    if (r.isWrongYear) {
      actionButtons = `<span id="bh-status-badge-${realI}" class="badge bg-light text-danger border px-2 py-1.5" title="🔒 Transaktion aus ${r.txYear} kann nicht im Buchhaltungsjahr ${window._bhYear} gebucht werden. Bitte oben Jahr umschalten!"><i class="fas fa-ban me-1"></i>Jahr ${r.txYear}</span>`;
    } else if (canEdit && !r.alreadyBooked) {
      const splitBtnClass = r.isVerbandsschiessen ? 'btn-warning text-dark fw-bold' : 'btn-outline-secondary';
      const isComplete = Boolean(r.suggestedSoll && r.suggestedHaben);
      const statusBadge = isComplete
        ? `<span id="bh-status-badge-${realI}" class="badge px-2 py-1.5 fw-semibold" style="background-color: rgba(25, 135, 84, 0.12); color: #0f5132; border: 1px solid rgba(25, 135, 84, 0.25);" title="Vollständig kontiert und bereit zur Ausführung"><i class="fas fa-check me-1"></i>Bereit</span>`
        : `<span id="bh-status-badge-${realI}" class="badge px-2 py-1.5 fw-semibold" style="background-color: rgba(255, 193, 7, 0.15); color: #664d03; border: 1px solid rgba(255, 193, 7, 0.35);" title="Gegenkonto fehlt noch. Kann manuell ergänzt werden oder wird als unvollständig gebucht."><i class="fas fa-exclamation-circle text-warning me-1"></i>Konto fehlt</span>`;

      actionButtons = `
        ${statusBadge}
        <button class="btn btn-sm ${splitBtnClass} py-1 px-2" onclick="bhBankOpenSplitModal(${realI})" title="Betrag in mehrere Zeilen aufteilen (z.B. Splitbuchung)">
          <i class="fas fa-columns me-1"></i>Split
        </button>
        <button class="btn btn-sm btn-outline-secondary py-1 px-2" onclick="bhBankSaveRuleModal(${realI})" title="Dauerhafte automatische Regel für diesen Absender/Text merken">
          <i class="fas fa-plus-circle"></i>
        </button>
        <button class="btn btn-sm btn-outline-secondary py-1 px-2" onclick="bhBankOpenAssignModal(${realI})" title="Status & Zuordnung anpassen (Jahresbeitrag / Rechnung / Manuell)">
          <i class="fas fa-tag"></i>
        </button>
      `;
    } else if (r.alreadyBooked) {
      actionButtons = `<span id="bh-status-badge-${realI}" class="badge bg-light text-secondary border px-2 py-1.5" title="🔒 Bereits im Journal erfasst. Doppelbuchung geschützt."><i class="fas fa-lock me-1"></i>Gebucht</span>`;
    }

    const amountClass = isCredit ? 'text-success' : 'text-danger';
    const amountSign  = isCredit ? '+' : '-';
    const rowBg = (r.alreadyBooked || r.isWrongYear) 
      ? 'table-secondary text-muted' 
      : ((r.isJahresbeitrag || r.isInvoice) ? 'table-light' : '');

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
        <td style="min-width: 200px; max-width: 320px;">
          ${(r.alreadyBooked || r.isWrongYear) ? `
            <div class="small text-muted" style="white-space: normal; word-break: break-word;" title="${escHtml(r.remittanceInfo || '–')}">
              ${escHtml(r.remittanceInfo || '–')}
            </div>
          ` : `
            <input type="text" id="bh-rmt-${realI}" class="form-control form-control-sm bh-rmt-input"
              value="${escHtml(r.remittanceInfo || '')}"
              placeholder="Verwendungszweck / Buchungstext..."
              title="${escHtml(r.remittanceInfo || 'Klicken zum Anpassen')}"
              style="font-size: 12px; width: 100%; min-width: 180px;"
              oninput="window._bhUpdateTxRemittance(${realI}, this.value)">
            <div id="bh-rmt-orig-${realI}" class="text-muted mt-1 ${r._customRemittanceEdited && r._originalRemittanceInfo && r.remittanceInfo.trim() !== r._originalRemittanceInfo.trim() ? '' : 'd-none'}"
                 style="font-size: 10px; line-height: 1.25; white-space: normal; word-break: break-word;"
                 title="Originaler Bankauszug-Text: ${escHtml(r._originalRemittanceInfo || '')}">
              ${(r._customRemittanceEdited && r._originalRemittanceInfo && r.remittanceInfo.trim() !== r._originalRemittanceInfo.trim()) ? `<i class="fas fa-info-circle me-1 opacity-75"></i>Original: ${escHtml(r._originalRemittanceInfo)}` : ''}
            </div>
          `}
        </td>
        <td>${statusBadge}</td>
        <td>${matchInfo}</td>
        <td style="min-width: 140px;">
          ${makeKontoSelectHTML(sollSelectId, r.suggestedSoll, 'soll', r.alreadyBooked || r.isWrongYear)}
        </td>
        <td style="min-width: 140px;">
          ${makeKontoSelectHTML(habenSelectId, r.suggestedHaben, 'haben', r.alreadyBooked || r.isWrongYear)}
          ${(() => {
            if ((r.isJahresbeitrag || (r.isInvoice && String(r.matchedInvoice?.type || '').toLowerCase().includes('jahresbeitrag'))) && typeof window.jbGetSplitBookings === 'function') {
              const hId = r.matchedBeitrag ? r.matchedBeitrag.id : (r.matchedInvoice ? r.matchedInvoice.id : null);
              const mObj = r.matchedMember || (r.matchedInvoice ? { FirstName: r.matchedInvoice.name, LastName: '', PersonNumber: r.matchedInvoice.PersonNumber } : {});
              const splits = window.jbGetSplitBookings({
                headerId: hId,
                member: mObj,
                paidAmount: r.amount,
                bankAccount: isBankKontoCode(r.suggestedSoll) ? r.suggestedSoll : '1020',
                year: Number(window._bhYear || new Date().getFullYear())
              });
              if (splits && splits.length > 1) {
                const summary = window.jbFormatSplitSummary(splits);
                return `<div class="mt-1"><span class="badge bg-primary text-white border border-primary py-1 px-2" style="font-size:10px; cursor:help;" title="${escHtml(summary)}"><i class="fas fa-layer-group me-1"></i>Split (${splits.length} Posten)</span></div>`;
              }
            }
            return '';
          })()}
        </td>
        ${canEdit ? `<td class="bh-col-sticky-action text-center"><div class="d-flex align-items-center justify-content-center gap-1">${actionButtons}</div></td>` : ''}
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
    <div class="table-responsive" style="overflow-x: auto; width: 100%;">
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
            ${canEdit ? '<th class="bh-col-sticky-action text-center" style="min-width: 145px;">Aktion</th>' : ''}
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
    if (th.classList.contains('bh-col-sticky-action')) return;
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

  // Sicherstellen, dass Kontenrahmen vor Matching & Rendering verfügbar ist
  if (!window._bhKontenrahmen || window._bhKontenrahmen.length === 0) {
    try {
      const cached = localStorage.getItem('bh_kontenrahmen');
      if (cached) window._bhKontenrahmen = JSON.parse(cached);
    } catch(_) {}
    if ((!window._bhKontenrahmen || window._bhKontenrahmen.length === 0) && typeof window.loadBuchhaltungData === 'function') {
      try {
        await window.loadBuchhaltungData(true);
      } catch(_) {}
    }
  }

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
  const invoices = window._invoices || window._jbAllInvoices || [];
  const userRules = window.getBhBankRules();
  const journalHistory = window._bhJournal || [];

  return transactions.map(tx => {
    const cleanRemittance = (tx.remittanceInfo || '').toLowerCase();
    const cleanParty      = (tx.partyName || '').toLowerCase();
    const cleanRef        = (tx.creditorReference || '').toLowerCase();

    // 0. STUFE: DUPLIKATS-PRÜFUNG GEGEN DAS BESTEHENDE KASSABUCH-JOURNAL
    let alreadyBooked = false;
    let bookedDate = '';
    let matchedJournalEntry = null;

    if (journalHistory && journalHistory.length > 0) {
      // 1. Priorisiere Journal-Eintrag mit passendem Betrag, Datum UND Beschreibung/Zahler
      matchedJournalEntry = journalHistory.find(j => {
        const amountDiff = Math.abs(Number(j.betrag || 0) - tx.amount);
        if (amountDiff >= 0.05) return false;

        const jIso = toNormalizedIsoDate(j.datum);
        const txIso = toNormalizedIsoDate(tx.bookingDate);
        if (jIso && txIso) {
          const dJ = new Date(jIso);
          const dTx = new Date(txIso);
          if (!isNaN(dJ) && !isNaN(dTx)) {
            const daysDiff = Math.abs((dTx - dJ) / (1000 * 60 * 60 * 24));
            if (daysDiff > 7) return false;
          }
        }

        const desc = normalizeString(j.beschreibung || '');
        const party = normalizeString(tx.partyName || '');
        const rmt = normalizeString(tx.remittanceInfo || '');
        const ref = normalizeString(tx.creditorReference || '');

        if (!party && !rmt && !ref) return true;

        return (party && (desc.includes(party) || party.includes(desc))) || 
               (rmt && desc.includes(rmt)) || 
               (ref && desc.includes(ref));
      });

      // 2. Fallback: Falls kein Text-Treffer, aber Betrag und Datum exakt übereinstimmen
      if (!matchedJournalEntry) {
        matchedJournalEntry = journalHistory.find(j => {
          const amountDiff = Math.abs(Number(j.betrag || 0) - tx.amount);
          if (amountDiff >= 0.05) return false;
          const jIso = toNormalizedIsoDate(j.datum);
          const txIso = toNormalizedIsoDate(tx.bookingDate);
          if (jIso && txIso) {
            const dJ = new Date(jIso);
            const dTx = new Date(txIso);
            if (!isNaN(dJ) && !isNaN(dTx)) {
              const daysDiff = Math.abs((dTx - dJ) / (1000 * 60 * 60 * 24));
              if (daysDiff <= 7) return true;
            }
          }
          return false;
        });
      }

      if (matchedJournalEntry) {
        alreadyBooked = true;
        bookedDate = formatSwissDate(matchedJournalEntry.datum || tx.bookingDate);
      }
    }

    let isInvoice = false;
    let matchedInvoice = null;
    let alreadyPaidInvoice = false;
    let isJahresbeitrag = false;
    let matchScore = 0;
    let matchedMember = null;
    let matchedBeitrag = null;
    let alreadyPaidJb = false;
    let matchType = 'unknown'; // 'invoice' | 'jb' | 'rule' | 'journal' | 'heuristic' | 'unknown'
    let matchRuleName = '';
    let matchRulePrefix = '';

    // Bank-Konto dynamisch anhand der erkannten XML-IBAN ermitteln (z.B. 1021 für Wirtschaftskonto, 1020 für Vereinskonto, 1022 für Sparkonto)
    const txBankKonto = bhBankGetAccountForIban(tx.accountIban, '1020');

    let suggestedSoll = tx._customSollEdited ? tx.suggestedSoll : (isCreditDefault(tx.isCredit) ? txBankKonto : '');
    let suggestedHaben = tx._customHabenEdited ? tx.suggestedHaben : (isCreditDefault(tx.isCredit) ? '' : txBankKonto);
    let matchLabel = 'Manuelle Buchung';

    if (alreadyBooked && matchedJournalEntry) {
      suggestedSoll = String(matchedJournalEntry.konto_soll || '').trim() || suggestedSoll;
      suggestedHaben = String(matchedJournalEntry.konto_haben || '').trim() || suggestedHaben;
      matchLabel = `Im Journal gebucht (${matchedJournalEntry.beleg_nr || 'Kassabuch'})`;
      matchType = 'journal';
    }

    function isCreditDefault(isCred) { return isCred; }

    // 0b. STUFE: Prüfung auf manuelle Benutzer-Übersteuerung (Status / Zuordnung manuell geändert)
    let hasCustomOverride = false;
    if (tx._customMatchOverride === 'manual') {
      hasCustomOverride = true;
      isInvoice = false;
      matchedInvoice = null;
      alreadyPaidInvoice = false;
      isJahresbeitrag = false;
      matchedMember = null;
      matchedBeitrag = null;
      alreadyPaidJb = false;
      matchType = (tx.alreadyBooked || alreadyBooked) ? 'journal' : 'unknown';
      matchLabel = 'Manuelle Buchung';
      matchScore = 0;
      if (!tx._customSollEdited) suggestedSoll = tx.isCredit ? txBankKonto : '';
      if (!tx._customHabenEdited) suggestedHaben = tx.isCredit ? '' : txBankKonto;
    } else if (tx._customMatchOverride === 'jahresbeitrag') {
      hasCustomOverride = true;
      isJahresbeitrag = true;
      matchedMember = tx.matchedMember;
      matchedBeitrag = tx.matchedBeitrag;
      alreadyPaidJb = tx.alreadyPaidJb || (tx.matchedBeitrag && tx.matchedBeitrag.status === 'bezahlt');
      matchType = (tx.alreadyBooked || alreadyBooked) ? 'journal' : 'jb';
      matchLabel = tx.matchLabel || (tx.matchedMember ? `Jahresbeitrag (${tx.matchedMember.FirstName} ${tx.matchedMember.LastName})` : 'Jahresbeitrag Mitglied');
      matchScore = 2;
      if (!tx._customSollEdited) suggestedSoll = txBankKonto;
      if (!tx._customHabenEdited) suggestedHaben = '3410';
    } else if (tx._customMatchOverride === 'invoice') {
      hasCustomOverride = true;
      isInvoice = true;
      matchedInvoice = tx.matchedInvoice;
      alreadyPaidInvoice = tx.alreadyPaidInvoice;
      isJahresbeitrag = tx.isJahresbeitrag;
      matchedMember = tx.matchedMember;
      matchedBeitrag = tx.matchedBeitrag;
      alreadyPaidJb = tx.alreadyPaidJb;
      matchType = (tx.alreadyBooked || alreadyBooked) ? 'journal' : 'invoice';
      matchLabel = tx.matchLabel || (tx.matchedInvoice ? `Rechnung ${tx.matchedInvoice.id}` : 'Rechnung');
      matchScore = 2;
      if (!tx._customSollEdited) suggestedSoll = txBankKonto;
      if (!tx._customHabenEdited) suggestedHaben = tx.suggestedHaben || '3650';
    }

    if (!hasCustomOverride) {
      // 1. STUFE: Rechnungs- & Beitrags-Matching (nur bei Gutschriften)
      if (tx.isCredit) {
        const bankName = normalizeString(tx.partyName || '');
        const txAmt = tx.amount;

        // A. Rechnungs-Matching aus Modul Rechnungen (_invoices)
        let bestInv = null;
        let bestInvScore = 0;

        // Vorfilterung für sicheres Matching: Datumsmuster (z.B. 02.02.2026, 2.2.26, 2026-02-02) und isolierte 4-stellige Jahreszahlen aus Verwendungszweck ausblenden
        const rmtNoDates = cleanRemittance
          .replace(/\b\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}\b/g, ' ')
          .replace(/\b20\d{2}\b/g, ' ');

        for (const inv of invoices) {
          const invIdRaw = String(inv.id || '').trim();
          const invIdClean = invIdRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
          const invTotal = Number(inv.total_amount || 0);
          const invName = normalizeString(inv.name || '');
          const invPn = String(inv.PersonNumber || '').replace(/[^0-9]/g, '');
          const sameAmount = Math.abs(invTotal - txAmt) < 0.05;

          let score = 0;

          // 1. Exakte Rechnungs-ID im Text oder Referenz (z.B. "RE-26-7K4M", "MV-26-8N2W", "DP-26-5M7T", "RE-JB-2026-0042", "V-2026-0012")
          const cleanRmtNoSpace = cleanRemittance.replace(/[^a-z0-9]/g, '');
          const cleanRefNoSpace = cleanRef.replace(/[^a-z0-9]/g, '');
          if (invIdClean && (cleanRmtNoSpace.includes(invIdClean) || cleanRefNoSpace.includes(invIdClean))) {
            score += 4.5; // Volltreffer bei exakter ID
          } else {
            // 1b. Eindeutiger Kennungsteil / Suffix (z.B. "7K4M" aus "RE-26-7K4M" oder "8N2W" aus "MV-26-8N2W")
            const idParts = invIdRaw.split('-');
            const suffix = idParts.length > 1 ? idParts[idParts.length - 1].toLowerCase().trim() : '';

            // Suffix muss mindestens 3 Zeichen haben und darf keine reine Jahreszahl (z.B. 2026) sein
            if (suffix && suffix.length >= 3 && !/^20\d{2}$/.test(suffix)) {
              const suffixRegex = new RegExp(`\\b${suffix}\\b`, 'i');
              if (suffixRegex.test(rmtNoDates) || cleanRef.includes(suffix)) {
                const hasKeyword = /(?:rechnung|re-?nr|inv|ref|beleg|nr)/i.test(cleanRemittance);
                score += hasKeyword ? 2.5 : 2.0;
              }
            }
          }

          // 2. QR-Referenz-Endung auf PersonNumber
          if (cleanRef && invPn && cleanRef.replace(/[^0-9]/g, '').endsWith(invPn)) {
            score += 2;
          }

          // 3. Exakter Betrag
          if (sameAmount) {
            score += 1.5;
          }

          // 4. Namensabgleich (Vor-/Nachname oder Firma)
          if (invName && bankName) {
            if (bankName.includes(invName) || invName.includes(bankName)) {
              score += 2;
            } else {
              const parts = invName.split(/\s+/).filter(p => p.length > 2);
              let partMatches = 0;
              parts.forEach(p => { if (bankName.includes(p)) partMatches++; });
              if (partMatches >= 2) score += 1.5;
              else if (partMatches === 1) score += 0.8;
            }
          }

          // 5. Bevorzuge noch offene Rechnungen (nur wenn mindestens ein Identifikator wie Name, ID oder Suffix gematcht hat)
          if (inv.status !== 'bezahlt' && score >= 2.0) {
            score += 1;
          }

          if (score > bestInvScore) {
            bestInvScore = score;
            bestInv = inv;
          }
        }

        if (bestInv && bestInvScore >= 2.5) {
          isInvoice = true;
          matchedInvoice = bestInv;
          alreadyPaidInvoice = (bestInv.status === 'bezahlt');
          matchType = 'invoice';
          if (!tx._customSollEdited) suggestedSoll = txBankKonto;
          
          // Habenkonto nach Rechnungstyp auflösen
          if (!tx._customHabenEdited) {
            const invType = String(bestInv.type || '').toLowerCase();
            const invIdUpper = String(bestInv.id || '').toUpperCase();
            if (invType.includes('jahresbeitrag') || invIdUpper.startsWith('JB-') || invIdUpper.startsWith('RE-JB-')) {
              suggestedHaben = '3410'; // Mitgliederbeiträge Aktive
              isJahresbeitrag = true;
              matchedBeitrag = beitraege.find(b => String(b.PersonNumber) === String(bestInv.PersonNumber) || String(b.id) === String(bestInv.id)) || null;
              matchedMember = members.find(m => String(m.PersonNumber) === String(bestInv.PersonNumber)) || null;
              alreadyPaidJb = alreadyPaidInvoice || (matchedBeitrag && matchedBeitrag.status === 'bezahlt');
            } else if (invType.includes('vermietung') || invType.includes('miete') || invIdUpper.startsWith('VT-') || invIdUpper.startsWith('V-')) {
              suggestedHaben = '3650'; // Mieterträge Schützenhaus
            } else if (invType.includes('schulsport')) {
              suggestedHaben = '3420'; // Nachwuchsförderung
            } else if (invType.includes('sponsor') || invType.includes('gönner')) {
              suggestedHaben = '3800'; // Sponsoring / Spenden
            } else if (invType.includes('munition') || invType.includes('material') || invIdUpper.startsWith('MV-')) {
              suggestedHaben = '3800'; // Material-/Munitionsverkauf
            } else if (invType.includes('depot') || invType.includes('pfand') || invType.includes('kaution') || invIdUpper.startsWith('DP-')) {
              suggestedHaben = '2000'; // Kaution / Verbindlichkeiten
            } else {
              suggestedHaben = '3650';
            }
          }

          matchScore = bestInvScore >= 3.5 ? 2 : 1;
          matchLabel = `Rechnung ${bestInv.id} (${bestInv.type || 'Diverse'}): ${bestInv.name}`;
        }

        // B. Falls keine Rechnung direkt gefunden, prüfe Jahresbeiträge über Mitgliederstamm
        if (!isInvoice) {
          const jbKeywords = [/jahresbeitra/i, /mitgliederbeitra/i, /vereinsbeitra/i, /\bjb\b/i, /beitra\s*g/i];
          const textHasJb = jbKeywords.some(r => r.test(cleanRemittance));

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

          const hasMemberMatch = (bestScore >= 2) || (textHasJb && bestMem && bestScore >= 1) || (cleanRef && bestScore >= 2);
          if (hasMemberMatch && bestMem) {
            isJahresbeitrag = true;
            matchScore = bestScore >= 2 ? 2 : 1;
            matchedMember = bestMem;
            matchedBeitrag = bestBeit;
            alreadyPaidJb = bestBeit ? (bestBeit.status === 'bezahlt') : false;
            matchType = 'jb';
            if (!tx._customSollEdited) suggestedSoll = txBankKonto; // Bank
            if (!tx._customHabenEdited) suggestedHaben = '3410'; // Mitgliederbeiträge Aktive
            matchLabel = `Jahresbeitrag (${bestMem.FirstName} ${bestMem.LastName})`;

            // Falls eine Rechnung im Rechnungsmodul für diesen Beitrag existiert:
            if (bestMem) {
              const relInv = invoices.find(inv => String(inv.PersonNumber) === String(bestMem.PersonNumber) && String(inv.type || '').toLowerCase().includes('jahresbeitrag'));
              if (relInv) {
                matchedInvoice = relInv;
                isInvoice = true;
                alreadyPaidInvoice = (relInv.status === 'bezahlt');
              }
            }
          }
        }
      }

    // 1b. STUFE: AUTOMATISCHE VERMIETUNGS-REGEL & SYSTEM-PATTERNS (V-YYYY-XXXX, Miete, Mietvertrag)
    if (!isJahresbeitrag && !isInvoice) {
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
    matchRulePrefix = '';
    if (!isJahresbeitrag && !isInvoice && matchType === 'unknown') {
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
    // 3. STUFE: Historie-Matching (Journal der letzten 12 Monate)
    if (!isJahresbeitrag && !isInvoice && matchType === 'unknown' && journalHistory.length > 0) {
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

    // 4. STUFE: Smart Defaults nach Vorzeichen (ohne Standard 6000 / 3900)
    // Wenn kein Gegenkonto ermittelt werden kann, bleibt es leer und wird im UI hervorgehoben!
    if (!suggestedSoll || !suggestedHaben) {
      if (tx.isCredit) {
        suggestedSoll = suggestedSoll || txBankKonto; // Bank
        suggestedHaben = suggestedHaben || ''; // Gegenkonto leer lassen statt 3900
      } else {
        suggestedSoll = suggestedSoll || ''; // Gegenkonto leer lassen statt 6000
        suggestedHaben = suggestedHaben || txBankKonto; // Bank
      }
    }
    } // Ende if (!hasCustomOverride)

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
        suggestedHaben = suggestedHaben || suggestedSoll || '';
        suggestedSoll = txBankKonto;
      }
    } else {
      if (isBankKontoCode(suggestedSoll) && !isBankKontoCode(suggestedHaben)) {
        const tmp = suggestedHaben;
        suggestedHaben = suggestedSoll;
        suggestedSoll = tmp;
      }
      if (!isBankKontoCode(suggestedHaben)) {
        suggestedSoll = suggestedSoll || suggestedHaben || '';
        suggestedHaben = txBankKonto;
      }
    }

    if (suggestedSoll && suggestedHaben && suggestedSoll === suggestedHaben) {
      if (tx.isCredit) suggestedHaben = '';
      else suggestedSoll = '';
    }

    const txYear = tx.bookingDate ? new Date(tx.bookingDate).getFullYear() : Number(window._bhYear || new Date().getFullYear());
    const activeYear = Number(window._bhYear || new Date().getFullYear());
    const isWrongYear = txYear !== activeYear;

    // Erkennung von Verbandsschiessen / Wettschiessen (Splitbuchungs-Empfehlung)
    const cleanTextAll = ((tx.remittanceInfo || '') + ' ' + (tx.partyName || '')).toLowerCase();
    const isVerbandsschiessen = /verbandsschiessen|vereinswettschiessen|wettschiessen|agksv|ssv|schützenverband|feldschiessen|kantonalstich|dmm/i.test(cleanTextAll);
    const splitHint = isVerbandsschiessen 
      ? '⚠️ Wettschiessen / Verbandsabrechnung! Enthält evtl. mehrere Teilbeträge (z. B. Nachwuchs / Meisterschaften). Split-Buchung empfohlen.'
      : '';

    return {
      ...tx,
      _customMatchOverride: tx._customMatchOverride,
      txYear,
      isWrongYear,
      isVerbandsschiessen,
      splitHint,
      alreadyBooked: tx.alreadyBooked || alreadyBooked,
      bookedDate: tx.bookedDate || bookedDate,
      matchedJournalEntry: tx.matchedJournalEntry || matchedJournalEntry,
      isInvoice,
      matchedInvoice,
      alreadyPaidInvoice,
      isJahresbeitrag,
      matchScore,
      matchedMember,
      matchedBeitrag,
      alreadyPaidJb,
      matchType: (tx.alreadyBooked || alreadyBooked) ? 'journal' : matchType,
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
// Buchungssatz im Speicher vorbereiten (für Einzel- & Sammel-Buchung)
// ---------------------------------------------------------------------
window.bhBankPrepareBookingItem = function(txIdx, customBelegNr, isBatch = false) {
  const tx = window._bhBankMatchResults[txIdx];
  if (!tx) return null;

  // 1. Doppel-Klick- & Parallel-Schutz (Re-entrancy Guard)
  if (tx._isBooking || tx.alreadyBooked) {
    console.warn(`[Bankabgleich] Transaktion #${txIdx} wird bereits gebucht oder ist bereits im Journal.`);
    return null;
  }

  if (tx.isWrongYear) {
    if (!isBatch) {
      alert(`⚠️ Buchung gesperrt:\n\nDiese Transaktion stammt aus dem Jahr ${tx.txYear}, oben im Portal ist aber das Buchhaltungsjahr ${window._bhYear} gewählt.\n\nBitte wechseln Sie oben das Buchhaltungsjahr auf ${tx.txYear}, um diese Transaktion in das entsprechende Jahr zu buchen.`);
    }
    return null;
  }

  const sollEl  = document.getElementById(`bh-soll-${txIdx}`);
  const habenEl = document.getElementById(`bh-haben-${txIdx}`);
  const statusBadge = document.getElementById(`bh-status-badge-${txIdx}`) || document.getElementById(`bh-book-btn-${txIdx}`) || (rowTr ? rowTr.querySelector('.badge') : null);
  const bookBtn = statusBadge;

  function resolveKontoCode(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('|')) return s.split('|')[0].trim();
    if (/^\d{4}$/.test(s)) return s;
    const matches = bhFindMatchingKonten(s);
    return matches.length > 0 ? String(matches[0].konto).trim() : s;
  }

  const rawSoll  = (sollEl && sollEl.value) ? sollEl.value : tx.suggestedSoll;
  const rawHaben = (habenEl && habenEl.value) ? habenEl.value : tx.suggestedHaben;
  let kontoSoll  = resolveKontoCode(rawSoll) || tx.suggestedSoll;
  let kontoHaben = resolveKontoCode(rawHaben) || tx.suggestedHaben;
  tx.suggestedSoll = kontoSoll;
  tx.suggestedHaben = kontoHaben;

  if (!kontoSoll && !kontoHaben) {
    if (!isBatch) alert('Mindestens das Bankkonto (Soll oder Haben) muss vorhanden sein.');
    throw new Error('Mindestens das Bankkonto (Soll oder Haben) muss vorhanden sein.');
  }
  if (kontoSoll && kontoHaben && kontoSoll === kontoHaben) {
    if (!isBatch) alert('Soll- und Haben-Konto dürfen nicht identisch sein.');
    throw new Error('Soll- und Haben-Konto dürfen nicht identisch sein.');
  }

  // AUTOMATISCHER SICHERHEITS-CHECK: Verhindern, dass Bankkonto auf der falschen Seite gebucht wird!
  const defaultBankKonto = tx.accountIban ? bhBankGetAccountForIban(tx.accountIban, '1020') : '1020';
  if (!tx.isCredit) {
    // Belastung: Bank muss im Haben stehen
    if (isBankKontoCode(kontoSoll) && !isBankKontoCode(kontoHaben)) {
      const tempKonto = kontoSoll;
      kontoSoll = kontoHaben;
      kontoHaben = tempKonto;
    }
    if (!isBankKontoCode(kontoHaben)) {
      kontoHaben = defaultBankKonto;
    }
  } else {
    // Gutschrift: Bank muss im Soll stehen
    if (isBankKontoCode(kontoHaben) && !isBankKontoCode(kontoSoll)) {
      const tempKonto = kontoSoll;
      kontoSoll = kontoHaben;
      kontoHaben = tempKonto;
    }
    if (!isBankKontoCode(kontoSoll)) {
      kontoSoll = defaultBankKonto;
    }
  }
  if (sollEl) sollEl.value = kontoSoll;
  if (habenEl) habenEl.value = kontoHaben;
  tx.suggestedSoll = kontoSoll;
  tx.suggestedHaben = kontoHaben;

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

    const rangeMatch = rmt.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\s*-\s*(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
    if (rangeMatch) {
      const [, y1, m1, d1, y2, m2, d2] = rangeMatch;
      if (y1 === y2 && m1 === m2) {
        extractedDate = `${d1}.${m1}. - ${d2}.${m2}.${y2}`;
      } else {
        extractedDate = `${d1}.${m1}.${y1} - ${d2}.${m2}.${y2}`;
      }
    }

    if (!extractedDate) {
      const singleIsoMatch = rmt.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
      if (singleIsoMatch) {
        const [, y, m, d] = singleIsoMatch;
        extractedDate = `${d}.${m}.${y}`;
      }
    }

    if (!extractedDate) {
      const swissMatch = rmt.match(/\b(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})?)\b/);
      if (swissMatch) {
        extractedDate = swissMatch[1];
      }
    }

    beschreibung = `Wirtschaftseinnahme TWINT (RaiseNow${extractedDate ? ' vom ' + extractedDate : ''})`;
  } else if (tx.isInvoice && tx.matchedInvoice) {
    const inv = tx.matchedInvoice;
    beschreibung = `Zahlungseingang Rechnung ${inv.id} (${inv.name})${inv.type ? ' - ' + inv.type : ''}`;
  } else if (tx.isJahresbeitrag && tx.matchedMember) {
    const m = tx.matchedMember;
    const refTxt = tx.matchedBeitrag ? ` (Rechnung ${tx.matchedBeitrag.id})` : '';
    beschreibung = `Jahresbeitrag ${window._bhYear}: ${m.FirstName} ${m.LastName}${refTxt}`;
  } else if (tx.matchType === 'rule') {
    let prefix = (tx.matchRulePrefix || tx.matchRuleName || '').trim();
    let party  = (tx.partyName || '').trim();
    let rmt    = (tx.remittanceInfo || '').trim();

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

  const year = Number(window._bhYear || new Date().getFullYear());
  const txBankKonto = isBankKontoCode(kontoSoll) ? kontoSoll : (isBankKontoCode(kontoHaben) ? kontoHaben : (tx.accountIban ? bhBankGetAccountForIban(tx.accountIban) : '1020'));
  const belegNr = customBelegNr || bhGetNextBankBelegNr(year, txBankKonto);
  const bookingDate = tx.bookingDate || new Date().toISOString().split('T')[0];

  let entries = [];
  if ((tx.isJahresbeitrag || (tx.matchedInvoice && String(tx.matchedInvoice.type || '').toLowerCase().includes('jahresbeitrag'))) && (!tx._customHabenEdited || tx.suggestedHaben === '3410') && typeof window.jbGetSplitBookings === 'function') {
    const hId = tx.matchedBeitrag ? tx.matchedBeitrag.id : (tx.matchedInvoice ? tx.matchedInvoice.id : null);
    const mObj = tx.matchedMember || (tx.matchedInvoice ? { FirstName: tx.matchedInvoice.name, LastName: '', PersonNumber: tx.matchedInvoice.PersonNumber } : {});
    const split = window.jbGetSplitBookings({
      headerId: hId,
      member: mObj,
      paidAmount: Number(tx.amount || 0),
      bookingDate: bookingDate,
      belegNr: belegNr,
      bankAccount: txBankKonto,
      year: year
    });
    if (Array.isArray(split) && split.length > 0) {
      entries = split;
    }
  }

  if (entries.length === 0) {
    entries = [{
      jahr: year,
      datum: bookingDate,
      beleg_nr: belegNr,
      beschreibung: beschreibung,
      konto_soll: kontoSoll,
      konto_haben: kontoHaben,
      betrag: Number(tx.amount || 0),
      typ: 'Bank'
    }];
  }

  return {
    txIdx,
    tx,
    belegNr,
    bookingDate,
    entries,
    bookBtn,
    matchedInvoice: tx.matchedInvoice,
    matchedBeitrag: tx.matchedBeitrag,
    isJahresbeitrag: tx.isJahresbeitrag
  };
};

// ---------------------------------------------------------------------
// Einzelne Buchung durchführen (mit sequentieller Request-Queue)
// ---------------------------------------------------------------------
window._bhBookingPromiseQueue = window._bhBookingPromiseQueue || Promise.resolve();
window._bhBookingQueueCount = window._bhBookingQueueCount || 0;

window.bhBankBookOne = async function(txIdx, customBelegNr, isBatch = false) {
  if (isBatch) {
    return await _bhBankBookOneInternal(txIdx, customBelegNr, true);
  }

  const tx = window._bhBankMatchResults[txIdx];
  if (!tx || tx._isBooking || tx.alreadyBooked) return;

  // Sofortige Sperre gegen Mehrfachklick auf denselben Button
  tx._isBooking = true;

  const sollEl  = document.getElementById(`bh-soll-${txIdx}`);
  const rowTr   = sollEl ? sollEl.closest('tr') : null;
  const bookBtn = rowTr ? rowTr.querySelector('button.btn-success') : null;

  if (bookBtn) {
    bookBtn.disabled = true;
    if (window._bhBookingQueueCount > 0) {
      bookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Wartet...';
    } else {
      bookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Bucht...';
    }
  }

  window._bhBookingQueueCount++;

  const runTask = async () => {
    try {
      if (bookBtn && bookBtn.innerHTML.includes('Wartet...')) {
        bookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Bucht...';
      }
      await _bhBankBookOneInternal(txIdx, customBelegNr, false);
    } finally {
      window._bhBookingQueueCount = Math.max(0, (window._bhBookingQueueCount || 1) - 1);
      // Erst neu laden, wenn keine weiteren Klicks in der Warteschlange hängen
      if (window._bhBookingQueueCount === 0) {
        if (typeof loadBuchhaltungData === 'function') {
          loadBuchhaltungData(true, true);
        } else {
          bhBankRenderResults(window._bhBankActiveFilter);
        }
      }
      if (typeof bhBankUpdateSelectedBtn === 'function') bhBankUpdateSelectedBtn();
      if (typeof bhBankUpdateSafeBookingsBtn === 'function') bhBankUpdateSafeBookingsBtn();
    }
  };

  // Streng sequentiell an die Queue hängen, damit HTTP-Requests nie zeitgleich bei GAS eintreffen
  window._bhBookingPromiseQueue = window._bhBookingPromiseQueue.then(runTask, runTask);
  return window._bhBookingPromiseQueue;
};

async function _bhBankBookOneInternal(txIdx, customBelegNr, isBatch = false) {
  const prepared = window.bhBankPrepareBookingItem(txIdx, customBelegNr, isBatch);
  if (!prepared) return;
  const { tx, belegNr, bookingDate, entries, bookBtn, matchedInvoice, matchedBeitrag, isJahresbeitrag } = prepared;

  // Visuelle Rückmeldung
  tx._isBooking = true;
  if (bookBtn) {
    bookBtn.disabled = true;
    bookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Bucht...';
  }

  try {
    let jsonBh = null;
    const isSplit = entries.length > 1;

    if (isSplit) {
      const payloadBh = {
        action: 'addJournalEntries',
        jahr: entries[0].jahr,
        datum: bookingDate,
        beleg_nr: belegNr,
        entries: entries,
        typ: 'Bank'
      };
      const resBh = await apiFetch('buchhaltung', payloadBh, 'POST');
      jsonBh = await resBh.json();
      if (!jsonBh.success) throw new Error(jsonBh.error || 'Fehler beim Buchen der Splitbuchung im Journal');
    } else {
      const payloadBh = {
        action: 'addJournalEntry',
        jahr: entries[0].jahr,
        datum: bookingDate,
        beleg_nr: belegNr,
        beschreibung: entries[0].beschreibung,
        konto_soll: entries[0].konto_soll,
        konto_haben: entries[0].konto_haben,
        betrag: entries[0].betrag,
        typ: 'Bank'
      };
      const resBh = await apiFetch('buchhaltung', payloadBh, 'POST');
      jsonBh = await resBh.json();
      if (!jsonBh.success) throw new Error(jsonBh.error || 'Fehler beim Buchen im Journal');
    }

    // 2. Falls eine Rechnung erkannt wurde: im Rechnungs-Modul als bezahlt markieren (POST mit skipBooking: true)
    if (matchedInvoice && matchedInvoice.id) {
      try {
        const payloadInv = {
          action: 'saveZahlung',
          invoiceId: matchedInvoice.id,
          datum: bookingDate,
          methode: 'Überweisung',
          beleg: belegNr,
          skipBooking: true // Journalbuchung wurde bereits oben ausgeführt!
        };
        await apiFetch('rechnungen', payloadInv, 'POST');
        
        // Cache im Rechnungsmodul direkt aktualisieren
        const cachedInv = (window._invoices || []).find(i => String(i.id) === String(matchedInvoice.id));
        if (cachedInv) {
          cachedInv.status = 'bezahlt';
          cachedInv.payment_date = bookingDate;
          cachedInv.payment_method = 'Überweisung';
          cachedInv.document_ref = belegNr;
        }
      } catch (invErr) {
        console.warn('⚠️ Hinweis: Journal gebucht, Rechnungsstatus konnte nicht aktualisiert werden:', invErr);
      }
    }

    // 3. Falls Jahresbeitrag: auch im Jahresbeitrags-Modul als bezahlt setzen (POST)
    if (isJahresbeitrag && matchedBeitrag && matchedBeitrag.id) {
      try {
        const payloadJb = {
          action: 'saveZahlung',
          headerId: matchedBeitrag.id,
          datum: bookingDate,
          methode: 'Überweisung',
          beleg: belegNr
        };
        await apiFetch('jahresbeitrag', payloadJb, 'POST');
        
        // Cache im Beitragswesen updaten
        const cachedJb = (window._jbAllBeitraege || []).find(h => String(h.id) === String(matchedBeitrag.id));
        if (cachedJb) { cachedJb.status = 'bezahlt'; cachedJb.payment_date = bookingDate; }
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
    if (isSplit && Array.isArray(jsonBh.data)) {
      jsonBh.data.forEach(entry => {
        window._bhJournal.push(entry);
      });
    } else {
      window._bhJournal.push((jsonBh && jsonBh.data) ? jsonBh.data : entries[0]);
    }

    // Sofort Button dauerhaft deaktivieren & Kennzeichnen (noch vor dem Re-Render)
    if (bookBtn) {
      bookBtn.className = 'badge bg-light text-secondary border px-2 py-1.5';
      bookBtn.innerHTML = '<i class="fas fa-check me-1"></i>Gebucht';
      bookBtn.disabled = true;
    }

    // Einzelbuchung bestätigen: unten rechts (bottom-end)
    if (isSplit) {
      showToast(`✅ Splitbuchung über CHF ${tx.amount.toFixed(2)} (${entries.length} Posten) gebucht!`, 'success', 'bottom-end', 3000);
    } else {
      showToast(`✅ Buchungssatz über CHF ${tx.amount.toFixed(2)} gebucht!`, 'success', 'bottom-end', 2500);
    }

    // Nächste ungebuchte Zeile nach dem Neuladen automatisch fokussieren
    window._bhFocusNextAfterBooking = txIdx + 1;
  } catch(err) {
    tx._isBooking = false;
    if (bookBtn) {
      bookBtn.disabled = false;
      bookBtn.innerHTML = '<i class="fas fa-check me-1"></i>Buchen';
    }
    if (!isBatch) {
      alert('Fehler beim Buchen: ' + err.message);
    } else {
      console.error('Fehler beim Batch-Buchen von Transaktion ' + txIdx + ':', err);
      showToast(`❌ Fehler bei Buchung: ${err.message}`, 'danger', 'bottom-end', 4000);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------
// Batch-Buchung aller sicheren Treffer (1x atomarer Commit)
// ---------------------------------------------------------------------
window.bhBankBookAll = async function() {
  if (window._bhIsBookingAll) return;
  const allBtn = document.getElementById('bhBtnBookAll') || document.querySelector('button[onclick="bhBankBookAll()"]');

  const results = window._bhBankMatchResults || [];
  const activeYear = Number(window._bhYear || new Date().getFullYear());
  
  // Zusammengelegter Buchungs-Pool: Alle ungebuchten Transaktionen des aktiven Jahres,
  // bei denen mindestens das Bankkonto vorhanden ist (Sichere + unvollständige manuelle Posten).
  const toBook = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.alreadyBooked && !r._isBooking && !r.isWrongYear && Number(r.amount || 0) > 0);

  if (!toBook.length) {
    showToast(`Keine ungebuchten Transaktionen für das Buchungsjahr ${activeYear} vorhanden.`, 'warning', 'top-end');
    return;
  }

  const unvollstaendigCount = toBook.filter(({ r }) => !r.suggestedSoll || !r.suggestedHaben).length;
  let confirmMsg = `${toBook.length} Bank-Buchungen jetzt in streng chronologischer Reihenfolge ins Journal eintragen?`;
  if (unvollstaendigCount > 0) {
    confirmMsg += `\n\nℹ️ Hinweis: ${unvollstaendigCount} Buchung(en) haben noch kein Gegenkonto und werden im Journal als unvollständig markiert, damit die Belegnummerierung und Datums-Chronologie sauber bleibt.`;
  }
  confirmMsg += '\n\nZugeordnete Rechnungen und Jahresbeiträge werden parallel als bezahlt markiert.';

  const ok = confirm(confirmMsg);
  if (!ok) return;

  window._bhIsBookingAll = true;
  if (allBtn) {
    allBtn.disabled = true;
    allBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Bereite Buchungen vor...`;
  }

  // Oben rechts das persistente Batch-Banner anzeigen
  const batchToast = showToast(`⏳ Bereite ${toBook.length} Buchungen lokal im Browser vor...`, 'info', 'top-end', 0);

  try {
    // 1. WICHTIG: Vor der Belegnummern-Vergabe STRIKT chronologisch nach Buchungsdatum sortieren!
    toBook.sort((a, b) => {
      const dateA = new Date(a.r.bookingDate || '1970-01-01').getTime();
      const dateB = new Date(b.r.bookingDate || '1970-01-01').getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.i - b.i;
    });

    // 2. Belegnummern im Vorfeld lückenlos und streng chronologisch vergeben
    toBook.forEach(({ r }) => {
      const txBankKonto = isBankKontoCode(r.suggestedSoll) 
        ? r.suggestedSoll 
        : (isBankKontoCode(r.suggestedHaben) 
            ? r.suggestedHaben 
            : bhBankGetAccountForIban(r.accountIban, '1020'));
      r._batchBelegNr = bhGetNextBankBelegNr(activeYear, txBankKonto);
    });

    // 2. Alle Buchungspakete lokal im RAM zusammenstellen
    const preparedList = [];
    const allJournalEntries = [];

    for (const { r, i } of toBook) {
      const prepared = window.bhBankPrepareBookingItem(i, r._batchBelegNr, true);
      if (prepared) {
        preparedList.push(prepared);
        allJournalEntries.push(...prepared.entries);
        r._isBooking = true;
        if (prepared.bookBtn) {
          prepared.bookBtn.disabled = true;
          prepared.bookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Bucht...';
        }
      }
    }

    if (allJournalEntries.length === 0) {
      throw new Error('Keine gültigen Buchungssätze generiert.');
    }

    // 3. 1x atomarer Sammel-Commit an Buchhaltung_GAS
    if (allBtn) {
      allBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Übertrage ${allJournalEntries.length} Buchungssätze...`;
    }
    if (batchToast) {
      const span = batchToast.querySelector('span');
      if (span) span.textContent = `⏳ Sende ${allJournalEntries.length} Buchungssätze in einem Commit an GAS...`;
    }

    const payloadBh = {
      action: 'addJournalEntries',
      jahr: activeYear,
      entries: allJournalEntries,
      typ: 'Bank'
    };
    const resBh = await apiFetch('buchhaltung', payloadBh, 'POST');
    const jsonBh = await resBh.json();
    if (!jsonBh.success) {
      throw new Error(jsonBh.error || 'Fehler beim Sammel-Buchen im Journal');
    }

    // Lokales Journal direkt mit den bestätigten Datensätzen aktualisieren
    window._bhJournal = window._bhJournal || [];
    const serverEntries = Array.isArray(jsonBh.data) ? jsonBh.data : allJournalEntries;
    serverEntries.forEach(entry => window._bhJournal.push(entry));

    // Alle vorbereiteten Transaktionen im UI als gebucht markieren
    const todayStr = new Date().toLocaleDateString('de-CH');
    preparedList.forEach(({ tx, txIdx, bookBtn }) => {
      tx._isBooking = false;
      if (window._bhBankMatchResults && window._bhBankMatchResults[txIdx]) {
        window._bhBankMatchResults[txIdx].alreadyBooked = true;
        window._bhBankMatchResults[txIdx].bookedDate = todayStr;
      }
      if (bookBtn) {
        bookBtn.className = 'badge bg-light text-secondary border px-2 py-1.5';
        bookBtn.innerHTML = '<i class="fas fa-check me-1"></i>Gebucht';
        bookBtn.disabled = true;
      }
    });

    // Salden & KPIs sofort live im RAM neu berechnen
    if (typeof recalculateLiveAccountBalances === 'function') recalculateLiveAccountBalances();
    if (typeof updateAccountingKPIs === 'function') updateAccountingKPIs();

    // Spinner sofort entfernen & Batch-Toast schließen
    if (batchToast && batchToast.parentNode) batchToast.remove();
    window._bhIsBookingAll = false;

    // Sofort die Tabelle und Buttons aktualisieren (0ms Latenz)
    bhBankRenderResults(window._bhBankActiveFilter);
    window.bhBankUpdateSelectedBtn();
    window.bhBankUpdateSafeBookingsBtn();

    showToast(`⚡ ${preparedList.length} Bank-Buchungen (${allJournalEntries.length} Buchungssätze) erfolgreich ausgeführt!`, 'success', 'top-end', 4000);

    // 4. Nachgelagerte Modul-Aktualisierungen (Rechnungen & Jahresbeiträge) non-blocking im Hintergrund abarbeiten
    const secondaryTasks = [];

    preparedList.forEach(({ belegNr, bookingDate, matchedInvoice, matchedBeitrag, isJahresbeitrag }) => {
      // a) Rechnungs-Zahlung: lokaler Cache sofort updaten
      if (matchedInvoice && matchedInvoice.id) {
        const cachedInv = (window._invoices || []).find(inv => String(inv.id) === String(matchedInvoice.id));
        if (cachedInv) {
          cachedInv.status = 'bezahlt';
          cachedInv.payment_date = bookingDate;
          cachedInv.payment_method = 'Überweisung';
          cachedInv.document_ref = belegNr;
        }
        secondaryTasks.push(apiFetch('rechnungen', {
          action: 'saveZahlung',
          invoiceId: matchedInvoice.id,
          datum: bookingDate,
          methode: 'Überweisung',
          beleg: belegNr,
          skipBooking: true
        }, 'POST').catch(err => console.warn('⚠️ Hintergrund-Update Rechnung:', err)));
      }

      // b) Jahresbeitrags-Zahlung: lokaler Cache sofort updaten
      if (isJahresbeitrag && matchedBeitrag && matchedBeitrag.id) {
        const cachedJb = (window._jbAllBeitraege || []).find(h => String(h.id) === String(matchedBeitrag.id));
        if (cachedJb) {
          cachedJb.status = 'bezahlt';
          cachedJb.payment_date = bookingDate;
        }
        secondaryTasks.push(apiFetch('jahresbeitrag', {
          action: 'saveZahlung',
          headerId: matchedBeitrag.id,
          datum: bookingDate,
          methode: 'Überweisung',
          beleg: belegNr
        }, 'POST').catch(err => console.warn('⚠️ Hintergrund-Update Jahresbeitrag:', err)));
      }
    });

    if (secondaryTasks.length > 0) {
      Promise.allSettled(secondaryTasks).then(() => {
        console.log(`✅ ${secondaryTasks.length} nachgelagerte Rechnungs-/Beitrags-Aktualisierungen im Hintergrund abgeschlossen.`);
      });
    }
  } catch (err) {
    console.error('Fehler beim Sammel-Buchen:', err);
    showToast(`Fehler beim Sammel-Buchen: ${err.message || err}`, 'error', 'top-end', 6000);
    toBook.forEach(({ r }) => { r._isBooking = false; });
  } finally {
    if (batchToast && batchToast.parentNode) batchToast.remove();
    window._bhIsBookingAll = false;
    (window._bhBankMatchResults || []).forEach(r => {
      if (!r.alreadyBooked) r._isBooking = false;
    });
    if (typeof bhBankUpdateSafeBookingsBtn === 'function') bhBankUpdateSafeBookingsBtn();
    if (typeof bhBankUpdateSelectedBtn === 'function') bhBankUpdateSelectedBtn();
  }
};

// ---------------------------------------------------------------------
// Buchungsstapel & Einzelauswahl (in Variante 1 durch Gesamtbuchung abgelöst)
// ---------------------------------------------------------------------
window.bhBankToggleQueue = function(txIdx, evt) {
  showToast('ℹ️ Alle Bank-Buchungen werden gesammelt mit «Alle Buchungen ausführen» gebucht (automatisch nach Datum sortiert).', 'info', 'top-end', 3500);
};

window.bhBankUpdateSafeBookingsBtn = function() {
  const allBtn = document.getElementById('bhBtnBookAll');
  if (!allBtn) return;
  if (window._bhIsBookingAll) {
    allBtn.disabled = true;
    return;
  }
  const rows = window._bhBankMatchResults || [];
  const openCount = rows.filter(r => 
    !r.alreadyBooked && !r._isBooking && !r.isWrongYear && Number(r.amount || 0) > 0
  ).length;
  allBtn.innerHTML = `<i class="fas fa-bolt me-1"></i>Alle Buchungen ausführen${openCount > 0 ? ` (${openCount})` : ''}`;
  allBtn.disabled = (openCount === 0);
};

window.bhBankUpdateSelectedBtn = function() {
  const btn = document.getElementById('bhBtnBookSelected');
  if (btn) {
    btn.classList.add('d-none');
  }
};

window.bhBankBookSelected = async function() {
  if (window._bhIsBookingSelected || window._bhIsBookingAll) return;
  const selBtn = document.getElementById('bhBtnBookSelected');

  const results = window._bhBankMatchResults || [];
  const activeYear = Number(window._bhYear || new Date().getFullYear());

  const toBook = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r._inBookingQueue && !r.alreadyBooked && !r._isBooking && !r.isWrongYear);

  if (!toBook.length) {
    showToast('Keine Buchungen im Buchungsstapel ausgewählt.', 'warning', 'top-end');
    return;
  }

  const totalAmount = toBook.reduce((sum, { r }) => sum + (Number(r.amount) || 0), 0);
  const ok = confirm(`${toBook.length} vorgemerkte Bank-Buchung(en) jetzt zusammenhängend in einem Schritt ins Journal eintragen?\n\nGesamtbetrag: CHF ${totalAmount.toFixed(2)}`);
  if (!ok) return;

  window._bhIsBookingSelected = true;
  if (selBtn) {
    selBtn.disabled = true;
    selBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Bereite Buchungen vor...`;
  }

  const batchToast = showToast(`⏳ Bereite ${toBook.length} Buchungen aus dem Stapel vor...`, 'info', 'top-end', 0);

  try {
    // 1. Vor der Belegnummern-Vergabe STRIKT chronologisch nach Buchungsdatum sortieren
    toBook.sort((a, b) => {
      const dateA = new Date(a.r.bookingDate || '1970-01-01').getTime();
      const dateB = new Date(b.r.bookingDate || '1970-01-01').getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.i - b.i;
    });

    // 2. Belegnummern lückenlos und chronologisch vergeben
    toBook.forEach(({ r }) => {
      const txBankKonto = isBankKontoCode(r.suggestedSoll) 
        ? r.suggestedSoll 
        : (isBankKontoCode(r.suggestedHaben) 
            ? r.suggestedHaben 
            : bhBankGetAccountForIban(r.accountIban, '1020'));
      r._batchBelegNr = bhGetNextBankBelegNr(activeYear, txBankKonto);
    });

    // 2. Alle Buchungspakete lokal zusammenstellen
    const preparedList = [];
    const allJournalEntries = [];

    for (const { r, i } of toBook) {
      try {
        const prepared = window.bhBankPrepareBookingItem(i, r._batchBelegNr, true);
        if (prepared) {
          preparedList.push(prepared);
          allJournalEntries.push(...prepared.entries);
          r._isBooking = true;
          if (prepared.bookBtn) {
            prepared.bookBtn.disabled = true;
            prepared.bookBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Bucht...';
          }
        }
      } catch (valErr) {
        throw new Error(`Fehler bei Transaktion "${r.partyName || 'Zeile ' + (i+1)}": ${valErr.message}`);
      }
    }

    if (allJournalEntries.length === 0) {
      throw new Error('Keine gültigen Buchungssätze generiert.');
    }

    // 3. 1x atomarer Sammel-Commit an Buchhaltung_GAS
    if (selBtn) {
      selBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Übertrage ${allJournalEntries.length} Buchungssätze...`;
    }
    if (batchToast) {
      const span = batchToast.querySelector('span');
      if (span) span.textContent = `⏳ Sende ${allJournalEntries.length} Buchungssätze in einem Commit an GAS...`;
    }

    const payloadBh = {
      action: 'addJournalEntries',
      jahr: activeYear,
      entries: allJournalEntries,
      typ: 'Bank'
    };
    const resBh = await apiFetch('buchhaltung', payloadBh, 'POST');
    const jsonBh = await resBh.json();
    if (!jsonBh.success) {
      throw new Error(jsonBh.error || 'Fehler beim Sammel-Buchen im Journal');
    }

    // Lokales Journal direkt mit den bestätigten Datensätzen aktualisieren
    window._bhJournal = window._bhJournal || [];
    const serverEntries = Array.isArray(jsonBh.data) ? jsonBh.data : allJournalEntries;
    serverEntries.forEach(entry => window._bhJournal.push(entry));

    // Alle vorbereiteten Transaktionen im UI als gebucht markieren & aus Stapel entfernen
    const todayStr = new Date().toLocaleDateString('de-CH');
    preparedList.forEach(({ tx, txIdx, bookBtn }) => {
      tx._isBooking = false;
      tx._inBookingQueue = false;
      if (window._bhBankMatchResults && window._bhBankMatchResults[txIdx]) {
        window._bhBankMatchResults[txIdx].alreadyBooked = true;
        window._bhBankMatchResults[txIdx].bookedDate = todayStr;
        window._bhBankMatchResults[txIdx]._inBookingQueue = false;
      }
      if (bookBtn) {
        bookBtn.className = 'badge bg-light text-secondary border px-2 py-1.5';
        bookBtn.innerHTML = '<i class="fas fa-check me-1"></i>Gebucht';
        bookBtn.disabled = true;
      }
    });

    // Salden & KPIs sofort live im RAM neu berechnen
    if (typeof recalculateLiveAccountBalances === 'function') recalculateLiveAccountBalances();
    if (typeof updateAccountingKPIs === 'function') updateAccountingKPIs();

    // Spinner sofort entfernen & Batch-Toast schließen
    if (batchToast && batchToast.parentNode) batchToast.remove();
    window._bhIsBookingSelected = false;

    // Sofort die Tabelle und Buttons aktualisieren (0ms Latenz)
    bhBankRenderResults(window._bhBankActiveFilter);
    window.bhBankUpdateSelectedBtn();
    window.bhBankUpdateSafeBookingsBtn();

    showToast(`⚡ ${preparedList.length} Bank-Buchung(en) (${allJournalEntries.length} Buchungssätze) erfolgreich ausgeführt!`, 'success', 'top-end', 4000);

    // 4. Nachgelagerte Modul-Aktualisierungen (Rechnungen & Jahresbeiträge) non-blocking im Hintergrund abarbeiten
    const secondaryTasks = [];

    preparedList.forEach(({ belegNr, bookingDate, matchedInvoice, matchedBeitrag, isJahresbeitrag }) => {
      // a) Rechnungs-Zahlung: lokaler Cache sofort updaten
      if (matchedInvoice && matchedInvoice.id) {
        const cachedInv = (window._invoices || []).find(inv => String(inv.id) === String(matchedInvoice.id));
        if (cachedInv) {
          cachedInv.status = 'bezahlt';
          cachedInv.payment_date = bookingDate;
          cachedInv.payment_method = 'Überweisung';
          cachedInv.document_ref = belegNr;
        }
        secondaryTasks.push(apiFetch('rechnungen', {
          action: 'saveZahlung',
          invoiceId: matchedInvoice.id,
          datum: bookingDate,
          methode: 'Überweisung',
          beleg: belegNr,
          skipBooking: true
        }, 'POST').catch(err => console.warn('⚠️ Hintergrund-Update Rechnung:', err)));
      }

      // b) Jahresbeitrags-Zahlung: lokaler Cache sofort updaten
      if (isJahresbeitrag && matchedBeitrag && matchedBeitrag.id) {
        const cachedJb = (window._jbAllBeitraege || []).find(h => String(h.id) === String(matchedBeitrag.id));
        if (cachedJb) {
          cachedJb.status = 'bezahlt';
          cachedJb.payment_date = bookingDate;
        }
        secondaryTasks.push(apiFetch('jahresbeitrag', {
          action: 'saveZahlung',
          headerId: matchedBeitrag.id,
          datum: bookingDate,
          methode: 'Überweisung',
          beleg: belegNr
        }, 'POST').catch(err => console.warn('⚠️ Hintergrund-Update Jahresbeitrag:', err)));
      }
    });

    if (secondaryTasks.length > 0) {
      Promise.allSettled(secondaryTasks).then(() => {
        console.log(`✅ ${secondaryTasks.length} nachgelagerte Rechnungs-/Beitrags-Aktualisierungen im Hintergrund abgeschlossen.`);
      });
    }
  } catch (err) {
    console.error('Fehler beim Stapel-Buchen:', err);
    showToast(`Fehler beim Stapel-Buchen: ${err.message || err}`, 'error', 'top-end', 6000);
    toBook.forEach(({ r }) => { r._isBooking = false; });
  } finally {
    if (batchToast && batchToast.parentNode) batchToast.remove();
    window._bhIsBookingSelected = false;
    const selBtn = document.getElementById('bhBtnBookSelected');
    if (selBtn) {
      selBtn.disabled = false;
    }
    (window._bhBankMatchResults || []).forEach(r => {
      if (!r.alreadyBooked) r._isBooking = false;
    });
    window.bhBankUpdateSelectedBtn();
    window.bhBankUpdateSafeBookingsBtn();
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

  let soll  = rawSoll.split('|')[0].trim();
  let haben = rawHaben.split('|')[0].trim();

  // Soll/Haben Harmonisierung für Aufwände / Erträge:
  // Bei Aufwand (4xxx, 5xxx, 6xxx, 7xxx, 89xx): Soll = Aufwand, Haben = Bank
  // Bei Ertrag (3xxx, 80xx, 81xx): Soll = Bank, Haben = Ertrag
  const isSollBank = isBankKontoCode(soll);
  const isHabenBank = isBankKontoCode(haben);
  const isSollAufwand = /^[4567]|^89/.test(soll);
  const isHabenAufwand = /^[4567]|^89/.test(haben);
  const isSollErtrag = /^3|^80|^81/.test(soll);
  const isHabenErtrag = /^3|^80|^81/.test(haben);

  if (isSollBank && isHabenAufwand) {
    const tmp = soll;
    soll = haben;
    haben = tmp;
  } else if (isHabenBank && isSollErtrag) {
    const tmp = soll;
    soll = haben;
    haben = tmp;
  }

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

  const matchGegenkonto = isCredit
    ? (tx.suggestedHaben && tx.suggestedHaben !== txBankKonto ? tx.suggestedHaben : '')
    : (tx.suggestedSoll && tx.suggestedSoll !== txBankKonto ? tx.suggestedSoll : '');

  // Preset 2 Split-Zeilen (flexibel ohne feste Kontenverdrahtung)
  window._bhSplitCurrentRows = [
    {
      beschreibung: `${partyOrInfo} (Teilbetrag 1)`,
      betrag: Number(tx.amount || 0),
      kontoSoll: isCredit ? txBankKonto : matchGegenkonto,
      kontoHaben: isCredit ? matchGegenkonto : txBankKonto
    },
    {
      beschreibung: `${partyOrInfo} (Teilbetrag 2)`,
      betrag: 0,
      kontoSoll: isCredit ? txBankKonto : '',
      kontoHaben: isCredit ? '' : txBankKonto
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

function bhBankCleanKonto(val) {
  if (!val) return '';
  return String(val).split('|')[0].trim();
}

function bhBankCalcSplitBalance(tx, splitRows) {
  const totalAmount = Number(tx.amount || 0);
  const isCredit = Boolean(tx.isCredit);
  const txBankKonto = bhBankGetAccountForIban(tx.accountIban, '1020');

  let bankSollSum = 0;
  let bankHabenSum = 0;
  let hasNegative = false;

  (splitRows || []).forEach(r => {
    const rawAmt = Number(r.betrag) || 0;
    if (rawAmt < 0) hasNegative = true;
    const amt = Math.abs(rawAmt);
    const s = bhBankCleanKonto(r.kontoSoll);
    const h = bhBankCleanKonto(r.kontoHaben);

    if (s === txBankKonto && h !== txBankKonto) {
      bankSollSum += amt;
    } else if (h === txBankKonto && s !== txBankKonto) {
      bankHabenSum += amt;
    } else {
      // Falls noch nicht spezifisch Bankkonto zugewiesen, Default nach Transaktionsrichtung
      if (isCredit) {
        bankSollSum += amt;
      } else {
        bankHabenSum += amt;
      }
    }
  });

  // Netto-Wirkung auf Bankkonto:
  // Für Gutschrift (isCredit): Soll (Mehrung) minus Haben (Minderung) muss dem Bankbetrag entsprechen
  // Für Belastung (!isCredit): Haben (Minderung) minus Soll (Mehrung) muss dem Bankbetrag entsprechen
  const actualNetBank = isCredit ? (bankSollSum - bankHabenSum) : (bankHabenSum - bankSollSum);
  const diff = totalAmount - actualNetBank;
  const isBalanced = Math.abs(diff) < 0.01 && !hasNegative;

  return {
    totalAmount,
    isCredit,
    txBankKonto,
    bankSollSum,
    bankHabenSum,
    actualNetBank,
    diff,
    hasNegative,
    isBalanced
  };
}

function bhBankRenderSplitModalContent(tx) {
  const modalEl = document.getElementById('bhBankSplitModal');
  if (!modalEl) return;

  const totalAmount = Number(tx.amount || 0);
  const splitRows = window._bhSplitCurrentRows || [];
  const bal = bhBankCalcSplitBalance(tx, splitRows);

  const kontenrahmen = window._bhKontenrahmen || [];

  function makeKontoSelectHTML(id, selectedVal) {
    const matched = kontenrahmen.find(k => String(k.konto).trim() === String(selectedVal).trim());
    const displayVal = matched ? `${matched.konto} | ${matched.bezeichnung}` : (selectedVal ? String(selectedVal) : '');
    return `<input type="text" id="${id}" list="bh-konten-datalist" class="form-control form-control-sm" placeholder="Konto..." value="${escHtml(displayVal)}" autocomplete="off" oninput="bhBankUpdateSplitLiveBalance()" onchange="bhBankUpdateSplitLiveBalance()">`;
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
          <input type="number" step="0.01" min="0" class="form-control form-control-sm text-end fw-bold" id="bh-split-amt-${i}" value="${amtVal}" placeholder="0.00" oninput="bhBankUpdateSplitLiveBalance()">
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

  let breakdownText = '';
  if (bal.isCredit && bal.bankHabenSum > 0) {
    breakdownText = `(Gutschriften Soll: CHF ${bal.bankSollSum.toFixed(2)} &middot; Abzüge Haben: CHF ${bal.bankHabenSum.toFixed(2)})`;
  } else if (!bal.isCredit && bal.bankSollSum > 0) {
    breakdownText = `(Belastungen Haben: CHF ${bal.bankHabenSum.toFixed(2)} &middot; Gutschriften Soll: CHF ${bal.bankSollSum.toFixed(2)})`;
  }

  let diffStatusHtml = '';
  if (bal.hasNegative) {
    diffStatusHtml = '<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-1"></i>Nur positive Beträge erlaubt (Soll/Haben anpassen)</span>';
  } else if (bal.isBalanced) {
    diffStatusHtml = '<span class="badge bg-success fs-6"><i class="fas fa-check me-1"></i>Betrag exakt aufgeteilt</span>';
  } else {
    diffStatusHtml = `<span class="text-danger"><i class="fas fa-times-circle me-1"></i>Rest unverteilt: CHF ${bal.diff.toFixed(2)}</span>`;
  }

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
          <div id="bh-split-banner" class="card p-3 border-0 ${bal.isBalanced ? 'bg-success-subtle text-success border-success' : 'bg-warning-subtle text-dark border-warning'} rounded-3">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span class="fw-bold"><i id="bh-split-banner-icon" class="fas ${bal.isBalanced ? 'fa-check-circle text-success' : 'fa-exclamation-triangle text-warning'} me-2"></i>Status Aufteilung:</span>
                Netto Bank: <strong>CHF <span id="bh-split-current-sum">${bal.actualNetBank.toFixed(2)}</span></strong> von <strong>CHF ${totalAmount.toFixed(2)}</strong>
                <span id="bh-split-breakdown" class="small ms-2 text-muted">${breakdownText}</span>
              </div>
              <div class="fw-bold fs-6" id="bh-split-diff-status">
                ${diffStatusHtml}
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer bg-light">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
          <button type="button" id="bh-split-save-btn" class="btn btn-success fw-bold px-4" ${!bal.isBalanced ? 'disabled' : ''} onclick="bhBankSaveSplitBooking(${window._bhSplitCurrentTxIndex})">
            <i class="fas fa-save me-1"></i>Split-Buchung speichern (${splitRows.length} Zeilen)
          </button>
        </div>
      </div>
    </div>
  `;
}

window.bhBankUpdateSplitLiveBalance = function() {
  bhBankUpdateSplitFromInputs();

  const txs = window._bhBankMatchResults || [];
  const tx = txs[window._bhSplitCurrentTxIndex];
  if (!tx) return;

  const rows = window._bhSplitCurrentRows || [];
  const bal = bhBankCalcSplitBalance(tx, rows);

  const sumEl = document.getElementById('bh-split-current-sum');
  if (sumEl) sumEl.textContent = bal.actualNetBank.toFixed(2);

  const breakdownEl = document.getElementById('bh-split-breakdown');
  if (breakdownEl) {
    let breakdownText = '';
    if (bal.isCredit && bal.bankHabenSum > 0) {
      breakdownText = `(Gutschriften Soll: CHF ${bal.bankSollSum.toFixed(2)} &middot; Abzüge Haben: CHF ${bal.bankHabenSum.toFixed(2)})`;
    } else if (!bal.isCredit && bal.bankSollSum > 0) {
      breakdownText = `(Belastungen Haben: CHF ${bal.bankHabenSum.toFixed(2)} &middot; Gutschriften Soll: CHF ${bal.bankSollSum.toFixed(2)})`;
    }
    breakdownEl.innerHTML = breakdownText;
  }

  const diffStatusEl = document.getElementById('bh-split-diff-status');
  if (diffStatusEl) {
    if (bal.hasNegative) {
      diffStatusEl.innerHTML = '<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-1"></i>Nur positive Beträge erlaubt (Soll/Haben anpassen)</span>';
    } else if (bal.isBalanced) {
      diffStatusEl.innerHTML = '<span class="badge bg-success fs-6"><i class="fas fa-check me-1"></i>Betrag exakt aufgeteilt</span>';
    } else {
      diffStatusEl.innerHTML = `<span class="text-danger"><i class="fas fa-times-circle me-1"></i>Rest unverteilt: CHF ${bal.diff.toFixed(2)}</span>`;
    }
  }

  const bannerEl = document.getElementById('bh-split-banner');
  if (bannerEl) {
    bannerEl.className = `card p-3 border-0 ${bal.isBalanced ? 'bg-success-subtle text-success border-success' : 'bg-warning-subtle text-dark border-warning'} rounded-3`;
  }

  const iconEl = document.getElementById('bh-split-banner-icon');
  if (iconEl) {
    iconEl.className = `fas ${bal.isBalanced ? 'fa-check-circle text-success' : 'fa-exclamation-triangle text-warning'} me-2`;
  }

  const saveBtn = document.getElementById('bh-split-save-btn');
  if (saveBtn) {
    saveBtn.disabled = !bal.isBalanced;
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
    if (sollEl) r.kontoSoll = bhBankCleanKonto(sollEl.value);
    if (habenEl) r.kontoHaben = bhBankCleanKonto(habenEl.value);
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
    kontoSoll: isCredit ? txBankKonto : '',
    kontoHaben: isCredit ? '' : txBankKonto
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
  const bal = bhBankCalcSplitBalance(tx, splitRows);

  if (bal.hasNegative) {
    alert('⚠️ Buchungsbeträge müssen positiv sein. Die Richtung (Zunahme/Abnahme) wird ausschliesslich über Soll und Haben bestimmt.');
    return;
  }

  if (!bal.isBalanced) {
    alert(`⚠️ Die Netto-Aufteilung auf das Bankkonto (CHF ${bal.actualNetBank.toFixed(2)}) entspricht nicht dem Bankbetrag (CHF ${bal.totalAmount.toFixed(2)}).`);
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
    if (Number(r.betrag) < 0) {
      alert(`Zeile #${i+1}: Bitte Betrag als positive Zahl eingeben.`);
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
        betrag: Math.abs(Number(r.betrag)),
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

// =====================================================================
// MODAL & FUNKTIONEN: STATUS & ZUORDNUNG ANPASSEN (Jahresbeitrag / Manuell)
// =====================================================================

window.bhBankRemoveJbAssignment = function(txIdx) {
  const rows = window._bhBankMatchResults || [];
  const tx = rows[txIdx];
  if (!tx) return;

  tx._customMatchOverride = 'manual';
  tx.isJahresbeitrag = false;
  tx.matchedMember = null;
  tx.matchedBeitrag = null;
  tx.alreadyPaidJb = false;
  tx.isInvoice = false;
  tx.matchedInvoice = null;
  tx.alreadyPaidInvoice = false;
  tx.matchType = tx.alreadyBooked ? 'journal' : 'unknown';
  tx.matchLabel = 'Manuelle Buchung';
  tx.matchScore = 0;

  // Wenn Haben-Konto automatisch auf 3410 (Mitgliederbeiträge) gesetzt war, leeren
  if (!tx._customHabenEdited && tx.suggestedHaben === '3410') {
    tx.suggestedHaben = '';
  }

  if (window._bhBankTransactions && window._bhBankTransactions[txIdx]) {
    Object.assign(window._bhBankTransactions[txIdx], {
      _customMatchOverride: 'manual',
      isJahresbeitrag: false,
      matchedMember: null,
      matchedBeitrag: null,
      alreadyPaidJb: false,
      isInvoice: false,
      matchedInvoice: null,
      alreadyPaidInvoice: false,
      matchType: tx.matchType,
      matchLabel: 'Manuelle Buchung',
      matchScore: 0,
      suggestedHaben: tx.suggestedHaben
    });
  }

  const modalEl = document.getElementById('bhModalAssign');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }

  bhBankRenderResults(window._bhBankActiveFilter);
  if (typeof showToast === 'function') {
    showToast('✅ Status "Jahresbeitrag" entfernt. Buchung kann nun frei manuell verbucht werden.', 'info');
  }
};

window.bhBankApplyJbAssignment = function(txIdx, personNumber) {
  const rows = window._bhBankMatchResults || [];
  const tx = rows[txIdx];
  if (!tx) return;

  const members = window._jbMembers || [];
  const beitraege = (window._jbAllBeitraege || []).filter(h => Number(h.year) === Number(window._bhYear || new Date().getFullYear()));
  const mem = members.find(m => String(m.PersonNumber) === String(personNumber));
  if (!mem) {
    if (typeof showToast === 'function') showToast('Bitte ein Mitglied auswählen.', 'warning');
    return;
  }

  const beitrag = beitraege.find(b => String(b.PersonNumber) === String(mem.PersonNumber)) || null;

  tx._customMatchOverride = 'jahresbeitrag';
  tx.isJahresbeitrag = true;
  tx.matchedMember = mem;
  tx.matchedBeitrag = beitrag;
  tx.alreadyPaidJb = beitrag ? (beitrag.status === 'bezahlt') : false;
  tx.isInvoice = false;
  tx.matchedInvoice = null;
  tx.alreadyPaidInvoice = false;
  tx.matchType = tx.alreadyBooked ? 'journal' : 'jb';
  tx.matchLabel = `Jahresbeitrag (${mem.FirstName} ${mem.LastName})`;
  tx.matchScore = 2;

  const txBankKonto = tx.accountIban ? bhBankGetAccountForIban(tx.accountIban, '1020') : '1020';
  if (!tx._customSollEdited) tx.suggestedSoll = txBankKonto;
  if (!tx._customHabenEdited) tx.suggestedHaben = '3410';

  if (window._bhBankTransactions && window._bhBankTransactions[txIdx]) {
    Object.assign(window._bhBankTransactions[txIdx], {
      _customMatchOverride: 'jahresbeitrag',
      isJahresbeitrag: true,
      matchedMember: mem,
      matchedBeitrag: beitrag,
      alreadyPaidJb: tx.alreadyPaidJb,
      isInvoice: false,
      matchedInvoice: null,
      alreadyPaidInvoice: false,
      matchType: tx.matchType,
      matchLabel: tx.matchLabel,
      matchScore: 2,
      suggestedSoll: tx.suggestedSoll,
      suggestedHaben: tx.suggestedHaben
    });
  }

  const modalEl = document.getElementById('bhModalAssign');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }

  bhBankRenderResults(window._bhBankActiveFilter);
  if (typeof showToast === 'function') {
    showToast(`✅ Transaktion als Jahresbeitrag von ${mem.FirstName} ${mem.LastName} zugeordnet.`, 'success');
  }
};

window.bhBankApplyInvoiceAssignment = function(txIdx, invoiceId) {
  const rows = window._bhBankMatchResults || [];
  const tx = rows[txIdx];
  if (!tx) return;

  const invoices = window._invoices || window._jbAllInvoices || [];
  const inv = invoices.find(i => String(i.id) === String(invoiceId));
  if (!inv) {
    if (typeof showToast === 'function') showToast('Bitte eine Rechnung auswählen.', 'warning');
    return;
  }

  tx._customMatchOverride = 'invoice';
  tx.isInvoice = true;
  tx.matchedInvoice = inv;
  tx.alreadyPaidInvoice = (inv.status === 'bezahlt');

  const invType = String(inv.type || '').toLowerCase();
  const invIdUpper = String(inv.id || '').toUpperCase();
  if (invType.includes('jahresbeitrag') || invIdUpper.startsWith('JB-') || invIdUpper.startsWith('RE-JB-')) {
    tx.isJahresbeitrag = true;
    const members = window._jbMembers || [];
    const beitraege = window._jbAllBeitraege || [];
    tx.matchedBeitrag = beitraege.find(b => String(b.PersonNumber) === String(inv.PersonNumber) || String(b.id) === String(inv.id)) || null;
    tx.matchedMember = members.find(m => String(m.PersonNumber) === String(inv.PersonNumber)) || null;
    tx.alreadyPaidJb = tx.alreadyPaidInvoice || (tx.matchedBeitrag && tx.matchedBeitrag.status === 'bezahlt');
    if (!tx._customHabenEdited) tx.suggestedHaben = '3410';
  } else {
    tx.isJahresbeitrag = false;
    tx.matchedBeitrag = null;
    tx.matchedMember = null;
    tx.alreadyPaidJb = false;
    if (!tx._customHabenEdited) {
      if (invType.includes('vermietung') || invType.includes('miete')) tx.suggestedHaben = '3650';
      else if (invType.includes('schulsport')) tx.suggestedHaben = '3420';
      else if (invType.includes('sponsor') || invType.includes('gönner')) tx.suggestedHaben = '3800';
      else tx.suggestedHaben = '3650';
    }
  }

  tx.matchType = tx.alreadyBooked ? 'journal' : 'invoice';
  tx.matchLabel = `Rechnung ${inv.id} (${inv.type || 'Diverse'}): ${inv.name}`;
  tx.matchScore = 2;

  const txBankKonto = tx.accountIban ? bhBankGetAccountForIban(tx.accountIban, '1020') : '1020';
  if (!tx._customSollEdited) tx.suggestedSoll = txBankKonto;

  if (window._bhBankTransactions && window._bhBankTransactions[txIdx]) {
    Object.assign(window._bhBankTransactions[txIdx], {
      _customMatchOverride: 'invoice',
      isInvoice: true,
      matchedInvoice: inv,
      alreadyPaidInvoice: tx.alreadyPaidInvoice,
      isJahresbeitrag: tx.isJahresbeitrag,
      matchedBeitrag: tx.matchedBeitrag,
      matchedMember: tx.matchedMember,
      alreadyPaidJb: tx.alreadyPaidJb,
      matchType: tx.matchType,
      matchLabel: tx.matchLabel,
      matchScore: 2,
      suggestedSoll: tx.suggestedSoll,
      suggestedHaben: tx.suggestedHaben
    });
  }

  const modalEl = document.getElementById('bhModalAssign');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }

  bhBankRenderResults(window._bhBankActiveFilter);
  if (typeof showToast === 'function') {
    showToast(`✅ Transaktion Rechnung ${inv.id} (${inv.name}) zugeordnet.`, 'success');
  }
};

window.bhBankFilterAssignMemberList = function(txIdx) {
  const q = normalizeString(document.getElementById('bhAssignMemberSearch')?.value || '');
  const sel = document.getElementById('bhAssignMemberSelect');
  if (!sel) return;

  const members = window._jbMembers || [];
  const beitraege = (window._jbAllBeitraege || []).filter(h => Number(h.year) === Number(window._bhYear || new Date().getFullYear()));
  const tx = (window._bhBankMatchResults || [])[txIdx];
  const currentMemPn = tx && tx.matchedMember ? String(tx.matchedMember.PersonNumber) : '';

  const filteredMems = members.filter(m => {
    if (!q) return true;
    const name = normalizeString(`${m.FirstName} ${m.LastName} ${m.PersonNumber}`);
    return name.includes(q);
  });

  if (filteredMems.length === 0) {
    sel.innerHTML = '<option value="" disabled>Keine Mitglieder gefunden</option>';
    return;
  }

  sel.innerHTML = filteredMems.map(m => {
    const b = beitraege.find(x => String(x.PersonNumber) === String(m.PersonNumber));
    const amt = b ? Number(b.Gesamt || 0) : 0;
    const isSel = String(m.PersonNumber) === currentMemPn;
    const bStatus = b ? (b.status === 'bezahlt' ? ' (bereits bezahlt)' : ` (Offen: CHF ${amt.toFixed(2)})`) : '';
    return `<option value="${escHtml(m.PersonNumber)}" ${isSel ? 'selected' : ''}>${escHtml(m.LastName)} ${escHtml(m.FirstName)} [Nr. ${escHtml(m.PersonNumber)}]${bStatus}</option>`;
  }).join('');
};

window.bhBankApplyJbFromModal = function(txIdx) {
  const sel = document.getElementById('bhAssignMemberSelect');
  if (!sel || !sel.value) {
    if (typeof showToast === 'function') showToast('Bitte wähle ein Mitglied aus der Liste aus.', 'warning');
    return;
  }
  bhBankApplyJbAssignment(txIdx, sel.value);
};

window.bhBankApplyInvoiceFromModal = function(txIdx) {
  const sel = document.getElementById('bhAssignInvoiceSelect');
  if (!sel || !sel.value) {
    if (typeof showToast === 'function') showToast('Bitte wähle eine Rechnung aus der Liste aus.', 'warning');
    return;
  }
  bhBankApplyInvoiceAssignment(txIdx, sel.value);
};

window.bhBankOpenAssignModal = function(txIdx, initialTab = 'auto') {
  const rows = window._bhBankMatchResults || [];
  const tx = rows[txIdx];
  if (!tx) return;

  let modalEl = document.getElementById('bhModalAssign');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalAssign';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  const invoices = window._invoices || window._jbAllInvoices || [];
  const currentInvId = tx.matchedInvoice ? String(tx.matchedInvoice.id) : '';

  const isCredit = tx.isCredit;
  const amtClass = isCredit ? 'text-success' : 'text-danger';
  const amtSign  = isCredit ? '+' : '-';

  let invoiceOptions = '<option value="">-- Offene Rechnung auswählen --</option>';
  invoices.forEach(inv => {
    const isSel = String(inv.id) === currentInvId;
    const invAmt = Number(inv.total_amount || 0).toFixed(2);
    invoiceOptions += `<option value="${escHtml(inv.id)}" ${isSel ? 'selected' : ''}>${escHtml(inv.id)}: ${escHtml(inv.name)} (CHF ${invAmt}, ${escHtml(inv.status || 'offen')})</option>`;
  });

  let currentStatusBadge = '';
  if (tx.isJahresbeitrag) {
    currentStatusBadge = `<span class="badge bg-success me-1"><i class="fas fa-check-circle me-1"></i>Jahresbeitrag</span>`;
  } else if (tx.isInvoice) {
    currentStatusBadge = `<span class="badge bg-success me-1"><i class="fas fa-file-invoice me-1"></i>Rechnung</span>`;
  } else if (tx.matchType === 'rule') {
    currentStatusBadge = `<span class="badge bg-info text-dark me-1"><i class="fas fa-magic me-1"></i>Regel</span>`;
  } else {
    currentStatusBadge = `<span class="badge bg-warning text-dark me-1"><i class="fas fa-question-circle me-1"></i>Offen / Manuell</span>`;
  }

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content shadow-lg border-0 rounded-4">
        <div class="modal-header bg-primary text-white py-3">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-sliders-h me-2"></i>Status &amp; Zuordnung anpassen
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
        </div>
        <div class="modal-body p-4">
          <!-- Transaktions-Info -->
          <div class="card bg-light border-0 p-3 mb-4 rounded-3">
            <div class="row g-2 small">
              <div class="col-6 col-md-3">
                <span class="text-muted d-block">Buchungsdatum:</span>
                <strong>${formatSwissDate(tx.bookingDate)}</strong>
              </div>
              <div class="col-6 col-md-3">
                <span class="text-muted d-block">Betrag:</span>
                <strong class="${amtClass}">${amtSign} CHF ${Number(tx.amount || 0).toFixed(2)}</strong>
              </div>
              <div class="col-12 col-md-6">
                <span class="text-muted d-block">Zahler / Empfänger:</span>
                <strong class="text-truncate d-block" title="${escHtml(tx.partyName || '–')}">${escHtml(tx.partyName || '–')}</strong>
              </div>
              <div class="col-12">
                <span class="text-muted d-block">Verwendungszweck:</span>
                <span class="text-muted font-monospace small d-block" style="white-space:normal; word-break:break-word;">${escHtml(tx.remittanceInfo || '–')}</span>
              </div>
              <div class="col-12 mt-2 pt-2 border-top">
                <span class="text-muted">Aktueller Status:</span>
                ${currentStatusBadge}
                <span class="text-secondary small fw-semibold ms-1">${escHtml(tx.matchLabel || 'Manuelle Buchung')}</span>
              </div>
            </div>
          </div>

          <!-- OPTION 1: Status Jahresbeitrag entfernen / Manuelle Buchung -->
          <div class="card border rounded-3 p-3 mb-3 ${(tx.isJahresbeitrag || tx.isInvoice || tx.matchType === 'rule') ? 'border-danger bg-light' : 'border-secondary'}">
            <div class="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3">
              <div>
                <h6 class="fw-bold text-dark mb-1">
                  <i class="fas fa-times-circle text-danger me-2"></i>Kein Jahresbeitrag (Manuell buchen)
                </h6>
                <p class="small text-muted mb-0">
                  Entfernt die Erkennung als Jahresbeitrag oder Rechnung. Die Buchung wird als reguläre Kontobuchung behandelt (keine automatischen Split-Beiträge, kein Statusupdate im Jahresbeitrags-Modul).
                </p>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm text-nowrap fw-bold px-3 py-1.5 flex-shrink-0" onclick="bhBankRemoveJbAssignment(${txIdx})">
                <i class="fas fa-unlink me-1"></i>Status auf 'Manuell' setzen
              </button>
            </div>
          </div>

          <!-- OPTION 2: Als Jahresbeitrag einem Mitglied zuordnen -->
          <div class="card border rounded-3 p-3 mb-3 ${tx.isJahresbeitrag ? 'border-success' : ''}">
            <h6 class="fw-bold text-primary mb-1">
              <i class="fas fa-id-card me-2"></i>Als Jahresbeitrag einem Mitglied zuordnen
            </h6>
            <p class="small text-muted mb-2">
              Wähle das Mitglied aus. Beim Verbuchen wird der offene Jahresbeitrag im Beitrags-Modul automatisch als bezahlt markiert und der Buchungssatz gemäss Gebührenreglement gesplittet.
            </p>
            <div class="row g-2">
              <div class="col-12 col-md-8">
                <div class="input-group input-group-sm mb-1">
                  <span class="input-group-text"><i class="fas fa-search"></i></span>
                  <input type="text" id="bhAssignMemberSearch" class="form-control" placeholder="Name oder Nr. tippen..." oninput="bhBankFilterAssignMemberList(${txIdx})">
                </div>
                <select id="bhAssignMemberSelect" class="form-select form-select-sm" size="5" style="font-size:12px;">
                  <!-- Dynamisch befüllt -->
                </select>
              </div>
              <div class="col-12 col-md-4 d-flex flex-column justify-content-end">
                <button type="button" class="btn btn-success btn-sm w-100 fw-bold py-2 shadow-sm" onclick="bhBankApplyJbFromModal(${txIdx})">
                  <i class="fas fa-check-circle me-1"></i>Als Jahresbeitrag zuordnen
                </button>
              </div>
            </div>
          </div>

          <!-- OPTION 3: Rechnung zuordnen -->
          <div class="card border rounded-3 p-3">
            <h6 class="fw-bold text-dark mb-1">
              <i class="fas fa-file-invoice me-2"></i>Rechnung aus Rechnungsmodul zuordnen
            </h6>
            <p class="small text-muted mb-2">
              Ordne diese Zahlung einer bestehenden Vereinsrechnung zu.
            </p>
            <div class="row g-2 align-items-center">
              <div class="col-12 col-md-8">
                <select id="bhAssignInvoiceSelect" class="form-select form-select-sm" style="font-size:12px;">
                  ${invoiceOptions}
                </select>
              </div>
              <div class="col-12 col-md-4">
                <button type="button" class="btn btn-primary btn-sm w-100 fw-bold py-1.5" onclick="bhBankApplyInvoiceFromModal(${txIdx})">
                  <i class="fas fa-link me-1"></i>Rechnung zuweisen
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer bg-light border-0 py-2.5 rounded-bottom-4">
          <button type="button" class="btn btn-secondary btn-sm fw-semibold px-3" data-bs-dismiss="modal">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();

  window.bhBankFilterAssignMemberList(txIdx);

  setTimeout(() => {
    const searchInp = document.getElementById('bhAssignMemberSearch');
    if (searchInp && initialTab === 'member') searchInp.focus();
  }, 300);
};
