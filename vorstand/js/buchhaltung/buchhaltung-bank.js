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
    if (window._bhBankServerRules && Array.isArray(window._bhBankServerRules) && window._bhBankServerRules.length > 0) {
      rules = window._bhBankServerRules;
    } else {
      const stored = localStorage.getItem('bh_bank_rules');
      rules = stored ? JSON.parse(stored) : getBhDefaultRules();
    }

    // Auto-Fix für alte RaiseNow Regel-Einträge
    rules = rules.map(r => {
      if (/raisenow/i.test(r.pattern || r.label || '')) {
        return {
          ...r,
          label: 'RaiseNow TWINT',
          prefix: 'Wirtschaftseinnahme TWINT (RaiseNow)',
          soll: '1020',
          haben: '3651'
        };
      }
      return r;
    });

    return rules;
  } catch (e) {
    return getBhDefaultRules();
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
        if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
          window._bhBankServerRules = json.data;
          localStorage.setItem('bh_bank_rules', JSON.stringify(json.data));
          console.log('✅ Bank-Regeln erfolgreich aus dem zentralen Google Sheet geladen.');
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
  return [
    { pattern: 'raisenow', soll: '1020', haben: '3651', label: 'RaiseNow TWINT', prefix: 'Wirtschaftseinnahme TWINT (RaiseNow)' },
    { pattern: 'vermietung', soll: '1020', haben: '3650', label: 'Vermietung Schützenhaus', prefix: 'Vermietung Schützenhaus' },
    { pattern: 'bankspesen', soll: '6900', haben: '1020', label: 'Bankspesen / Finanzaufwand', prefix: 'Bankspesen / Finanzaufwand' },
    { pattern: 'kontoführung', soll: '6900', haben: '1020', label: 'Bankspesen / Kontoführung', prefix: 'Bankspesen / Kontoführung' },
    { pattern: 'zins', soll: '1020', haben: '6950', label: 'Zinsertrag / Bank', prefix: 'Zinsertrag / Bank' },
    { pattern: 'schützenverband', soll: '6500', haben: '1020', label: 'Verbandsbeiträge', prefix: 'Verbandsbeiträge (SSV)' },
    { pattern: 'agksv', soll: '6500', haben: '1020', label: 'Verbandsbeiträge (AGKSV)', prefix: 'Verbandsbeiträge (AGKSV)' },
    { pattern: 'ssv', soll: '6500', haben: '1020', label: 'Verbandsbeiträge (SSV)', prefix: 'Verbandsbeiträge (SSV)' },
    { pattern: 'munition', soll: '4200', haben: '1020', label: 'Munitionsaufwand', prefix: 'Munitionsaufwand' },
    { pattern: 'helvetia', soll: '6200', haben: '1020', label: 'Versicherungsprämie', prefix: 'Versicherungsprämie Helvetia' },
    { pattern: 'gva', soll: '6200', haben: '1020', label: 'Gebäudeversicherung', prefix: 'Gebäudeversicherung GVA' },
    { pattern: 'sponsoring', soll: '1020', haben: '3600', label: 'Sponsoring-Ertrag', prefix: 'Sponsoring-Ertrag' },
    { pattern: 'spende', soll: '1020', haben: '3600', label: 'Spenden-Ertrag', prefix: 'Spenden-Ertrag' }
  ];
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
        <div>
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
        
        <button class="btn btn-sm btn-success ms-auto fw-bold shadow-sm" onclick="bhBankBookAll()">
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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  }
  return s;
}

function toNormalizedIsoDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split('.');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return s;
}

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

    return `<input type="text" id="${id}" list="bh-konten-datalist" class="form-control form-control-sm bh-konto-input" placeholder="Ziffern/Name..." value="${escHtml(displayVal)}" style="font-size:12px; min-width:150px;" autocomplete="off">`;
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
        <td style="min-width: 250px;">
          <small class="text-dark d-block" style="white-space: normal; word-break: break-word;" title="${escHtml(r.remittanceInfo)}">
            ${escHtml(r.remittanceInfo || '–')}
          </small>
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

  setTimeout(() => {
    bhMakeTableResizable(document.getElementById('bhBankTable'));
  }, 50);
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
// CAMT.053 File Handler & Parser
function bhBankGetAccountsInfoHTML() {
  const txs = window._bhBankTransactions || [];
  if (!txs.length) return 'Keine Datei geladen';

  const accounts = [...new Set(txs.map(t => t.accountIban).filter(Boolean))];
  if (!accounts.length) return '1 Konto erkannt';

  return accounts.map(iban => `<code class="fw-bold bg-white text-dark border px-1.5 py-0.5 rounded me-1">${escHtml(iban)}</code>`).join(' ');
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

      // Duplicate message ID check per file
      const firstMsgId = txs.length > 0 ? txs[0].fileMsgId : '';
      if (firstMsgId) {
        try {
          const processedMsgIds = JSON.parse(localStorage.getItem('bh_processed_camt_msgids') || '[]');
          if (processedMsgIds.includes(firstMsgId)) {
            showToast(`⚠️ Datei "${file.name}" (ID: ${firstMsgId}) wurde bereits früher geladen.`, 'warning');
          } else {
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
    const bookingDate = getTagText(getFirstChild(ntry, 'BookgDt'), 'Dt');
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
      partyName,
      partyPLZ,
      partyCity: partyCity || (adrLine ? adrLine.split(' ').slice(-1)[0] : ''),
      remittanceInfo,
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

    let suggestedSoll = isCreditDefault(tx.isCredit) ? '1020' : '';
    let suggestedHaben = isCreditDefault(tx.isCredit) ? '' : '1020';
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
        suggestedSoll = '1020'; // Bank
        suggestedHaben = '3000'; // Mitgliederbeiträge
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
        suggestedSoll = '1020'; // Bank / Wirtschaftskonto
        suggestedHaben = '3650'; // Mieterträge Schützenhaus
        matchLabel = vCode ? `Vermietung ${vCode}` : 'Mietertrag Schützenhaus';
        matchScore = 2;
      } else if (tx.isCredit && /raisenow/i.test(cleanRemittance)) {
        matchType = 'rule';
        matchRuleName = 'RaiseNow Payout';
        suggestedSoll = '1020';
        suggestedHaben = '3651';
        matchLabel = 'Gutschrift RaiseNow';
        matchScore = 2;
      }
    }

    // 2. STUFE: Benutzer-Regeln (Rules)
    let matchRulePrefix = '';
    if (!isJahresbeitrag && matchType === 'unknown') {
      for (const r of userRules) {
        const p = r.pattern.toLowerCase();
        if (cleanRemittance.includes(p) || cleanParty.includes(p)) {
          matchType = 'rule';
          matchRuleName = r.label;
          matchRulePrefix = r.prefix || r.label;
          suggestedSoll = r.soll;
          suggestedHaben = r.haben;
          matchLabel = `Regel: ${r.label}`;
          matchScore = 2;
          break;
        }
      }
    }

    // 3. STUFE: Historisches Journal-Learning
    if (!isJahresbeitrag && matchType === 'unknown' && journalHistory.length > 0) {
      const matchHist = journalHistory.find(j => {
        const desc = (j.beschreibung || '').toLowerCase();
        return desc && (cleanRemittance.includes(desc) || cleanParty.includes(desc) || desc.includes(cleanParty));
      });

      if (matchHist) {
        matchType = 'journal';
        suggestedSoll = matchHist.konto_soll;
        suggestedHaben = matchHist.konto_haben;
        matchLabel = 'Aus Journal-Historie';
        matchScore = 1;
      }
    }

    // 4. STUFE: Smart Defaults nach Vorzeichen
    if (!suggestedSoll || !suggestedHaben) {
      if (tx.isCredit) {
        suggestedSoll = suggestedSoll || '1020'; // Bank
        suggestedHaben = suggestedHaben || '3900'; // Übriger Ertrag
      } else {
        suggestedSoll = suggestedSoll || '6000'; // Raum/Unterhalt Aufwand
        suggestedHaben = suggestedHaben || '1020'; // Bank
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
// Einzelne Buchung durchführen
// ---------------------------------------------------------------------
window.bhBankBookOne = async function(txIdx, customBelegNr) {
  const tx = window._bhBankMatchResults[txIdx];
  if (!tx) return;

  if (tx.isWrongYear) {
    alert(`⚠️ Buchung gesperrt:\n\nDiese Transaktion stammt aus dem Jahr ${tx.txYear}, oben im Portal ist aber das Buchhaltungsjahr ${window._bhYear} gewählt.\n\nBitte wechseln Sie oben das Buchhaltungsjahr auf ${tx.txYear}, um diese Transaktion in das entsprechende Jahr zu buchen.`);
    return;
  }

  const sollEl  = document.getElementById(`bh-soll-${txIdx}`);
  const habenEl = document.getElementById(`bh-haben-${txIdx}`);

  const rawSoll  = sollEl ? sollEl.value : tx.suggestedSoll;
  const rawHaben = habenEl ? habenEl.value : tx.suggestedHaben;

  const kontoSoll  = String(rawSoll || '').split('|')[0].trim();
  const kontoHaben = String(rawHaben || '').split('|')[0].trim();

  if (!kontoSoll || !kontoHaben) {
    alert('Bitte wählen Sie Soll- und Haben-Konto aus.');
    return;
  }
  if (kontoSoll === kontoHaben) {
    alert('Soll- und Haben-Konto dürfen nicht identisch sein.');
    return;
  }

  let beschreibung = '';
  const vMatch = (tx.remittanceInfo || '').match(/v-\d{4}-\d{3,4}/i) || (tx.partyName || '').match(/v-\d{4}-\d{3,4}/i);
  const isMieteText = /miet/i.test(tx.remittanceInfo || '') || /miet/i.test(tx.partyName || '');
  const isRaiseNow = /raisenow/i.test(tx.remittanceInfo || '') || /raisenow/i.test(tx.partyName || '') || kontoHaben === '3651';

  if (vMatch || isMieteText || kontoHaben === '3650') {
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
    let belegNr = customBelegNr;
    if (!belegNr) {
      const existingBankBelege = (window._bhJournal || []).filter(j => Number(j.jahr) === year && String(j.beleg_nr || '').startsWith('BK-'));
      const nextSeq = String(existingBankBelege.length + 1).padStart(3, '0');
      belegNr = `BK-${year}-${nextSeq}`;
    }

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

    showToast(`✅ Buchungssatz über CHF ${tx.amount.toFixed(2)} gebucht!`, 'success');

    // Live Neu-Laden des Hauptbuchs
    if (typeof loadBuchhaltungData === 'function') {
      loadBuchhaltungData(true, true);
    } else {
      bhBankRenderResults(window._bhBankActiveFilter);
    }
  } catch(err) {
    alert('Fehler beim Buchen: ' + err.message);
  }
};

// ---------------------------------------------------------------------
// Batch-Buchung aller sicheren Treffer
// ---------------------------------------------------------------------
window.bhBankBookAll = async function() {
  const results = window._bhBankMatchResults || [];
  const activeYear = Number(window._bhYear || new Date().getFullYear());
  
  const toBook = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.alreadyBooked && !r.isWrongYear && (r.isJahresbeitrag || r.matchScore >= 2));

  if (!toBook.length) {
    showToast(`Keine eindeutigen, ungebuchten Transaktionen für das Buchungsjahr ${activeYear} vorhanden.`, 'warning');
    return;
  }

  const ok = confirm(`${toBook.length} eindeutige Bank-Buchungen jetzt automatisch ins Journal eintragen?`);
  if (!ok) return;

  const existingBankBelege = (window._bhJournal || []).filter(j => Number(j.jahr) === activeYear && String(j.beleg_nr || '').startsWith('BK-'));
  let nextSeqCounter = existingBankBelege.length + 1;

  let count = 0;
  for (const { r, i } of toBook) {
    try {
      const belegNr = `BK-${activeYear}-${String(nextSeqCounter++).padStart(3, '0')}`;
      await bhBankBookOne(i, belegNr);
      count++;
    } catch (_) {}
  }

  showToast(`⚡ ${count} von ${toBook.length} Buchungen erfolgreich ausgeführt!`, 'success');
};

// ---------------------------------------------------------------------
// Regel Editor Modal (Erstellen / Bearbeiten)
// ---------------------------------------------------------------------
window.bhBankOpenRuleEditorModal = function(editIdx, prefillObj) {
  const rules = window.getBhBankRules();
  const isEdit = typeof editIdx === 'number' && editIdx >= 0;
  const existingRule = isEdit ? rules[editIdx] : null;

  const rule = existingRule || prefillObj || {
    pattern: '',
    label: '',
    prefix: '',
    soll: '1020',
    haben: '3000'
  };

  let modalEl = document.getElementById('bhModalRuleEditor');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalRuleEditor';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  modalEl.style.zIndex = '1065';

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
              <input type="text" id="bhr-label" class="form-control form-control-sm" placeholder="z.B. Berchtold Fleisch AG" value="${escHtml(rule.label)}" required>
              <div class="form-text small">Wird im Status-Badge als Regelname angezeigt.</div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small">Journal-Präfix / Buchungstext (Vorangestellt im Kassabuch)</label>
              <input type="text" id="bhr-prefix" class="form-control form-control-sm" placeholder="z.B. Einkauf Lebensmittel Berchtold" value="${escHtml(rule.prefix || rule.label)}">
              <div class="form-text small">Dieser Text wird bei der Buchung im Kassabuch-Journal vorangestellt.</div>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small">Suchmuster (Text / Absender)</label>
              <input type="text" id="bhr-pattern" class="form-control form-control-sm" placeholder="z.B. Berchtold, Raiffeisen, Helvetia" value="${escHtml(rule.pattern)}" required>
              <div class="form-text small">Transaktionen mit diesem Suchbegriff im Absender oder Text werden automatisch erkannt.</div>
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

  const label   = document.getElementById('bhr-label').value.trim();
  const pattern = document.getElementById('bhr-pattern').value.trim();
  const prefix  = document.getElementById('bhr-prefix').value.trim() || label;
  const rawSoll = document.getElementById('bhr-soll').value.trim();
  const rawHaben= document.getElementById('bhr-haben').value.trim();

  const soll  = rawSoll.split('|')[0].trim();
  const haben = rawHaben.split('|')[0].trim();

  if (!label || !pattern || !soll || !haben) {
    alert('Bitte füllen Sie alle Pflichtfelder aus.');
    return;
  }

  const rules = window.getBhBankRules();

  if (editIdx >= 0 && editIdx < rules.length) {
    rules[editIdx] = { pattern, label, prefix, soll, haben };
    showToast(`✅ Regel "${label}" erfolgreich aktualisiert!`, 'success');
  } else {
    rules.push({ pattern, label, prefix, soll, haben });
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

  const defaultPattern = (tx.partyName || tx.remittanceInfo || '').trim();

  const sollEl  = document.getElementById(`bh-soll-${txIdx}`);
  const habenEl = document.getElementById(`bh-haben-${txIdx}`);

  const sollVal  = sollEl ? sollEl.value : tx.suggestedSoll;
  const habenVal = habenEl ? habenEl.value : tx.suggestedHaben;

  bhBankOpenRuleEditorModal(-1, {
    pattern: defaultPattern,
    label: tx.partyName || defaultPattern,
    prefix: tx.partyName || defaultPattern,
    soll: sollVal,
    haben: habenVal
  });
};

// ---------------------------------------------------------------------
// Regeln verwalten Modal
// ---------------------------------------------------------------------
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
    return `
      <tr>
        <td><span class="fw-bold text-primary">${escHtml(r.label)}</span></td>
        <td><code class="text-dark bg-light px-2 py-1 rounded border">${escHtml(r.pattern)}</code></td>
        <td><span class="text-dark small fw-semibold">${escHtml(r.prefix || r.label)}</span></td>
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
      <td colspan="6" class="text-center text-muted py-4">
        <i class="fas fa-magic fa-2x mb-2" style="opacity:0.3;"></i>
        <p class="mb-0">Noch keine Benutzer-Regeln definiert.</p>
      </td>
    </tr>
  `;

  modalEl.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-dark text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-sliders-h me-2"></i>Automatische Buchungsregeln verwalten</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <p class="text-muted small mb-0">Erstelle oder bearbeite Regeln für die automatische Zuordnung von Kontoauszug-Transaktionen.</p>
            <button class="btn btn-sm btn-success fw-bold px-3" onclick="bhBankOpenRuleEditorModal(-1)">
              <i class="fas fa-plus me-1"></i>Neue Regel erstellen
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-hover table-sm align-middle mb-0" style="table-layout: fixed; width: 100%;">
              <thead class="table-light">
                <tr>
                  <th style="width: 22%;">Bezeichnung</th>
                  <th style="width: 15%;">Suchmuster</th>
                  <th style="width: 32%;">Journal-Text / Präfix</th>
                  <th style="width: 8%;">Soll</th>
                  <th style="width: 8%;">Haben</th>
                  <th style="width: 15%;" class="text-end">Aktionen</th>
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

  // Preset 2 Split-Zeilen
  window._bhSplitCurrentRows = [
    {
      beschreibung: `${partyOrInfo} (Erwachsene / Transit 1190)`,
      betrag: Number(tx.amount || 0),
      kontoSoll: isCredit ? '1020' : '1190',
      kontoHaben: isCredit ? '1190' : '1020'
    },
    {
      beschreibung: `${partyOrInfo} (Junioren / Nachwuchsförderung)`,
      betrag: 0,
      kontoSoll: isCredit ? '1020' : '4210',
      kontoHaben: isCredit ? '4210' : '1020'
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
    return `
      <tr>
        <td class="text-center font-monospace fw-bold small" style="width:30px;">#${i + 1}</td>
        <td>
          <input type="text" class="form-control form-control-sm" id="bh-split-desc-${i}" value="${escHtml(r.beschreibung)}" placeholder="Beschreibung...">
        </td>
        <td style="width: 140px;">
          <input type="number" step="0.01" class="form-control form-control-sm text-end fw-bold" id="bh-split-amt-${i}" value="${Number(r.betrag || 0).toFixed(2)}" oninput="bhBankUpdateSplitFromInputs()">
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
          <div class="card p-3 border-0 ${isBalanced ? 'bg-success-subtle text-success border-success' : 'bg-warning-subtle text-dark border-warning'} rounded-3">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span class="fw-bold"><i class="fas ${isBalanced ? 'fa-check-circle text-success' : 'fa-exclamation-triangle text-warning'} me-2"></i>Status Aufteilung:</span>
                Summe Split-Zeilen: <strong>CHF ${currentSum.toFixed(2)}</strong> von <strong>CHF ${totalAmount.toFixed(2)}</strong>
              </div>
              <div class="fw-bold fs-6">
                ${isBalanced ? '<span class="badge bg-success fs-6"><i class="fas fa-check me-1"></i>Betrag exakt aufgeteilt</span>' : `<span class="text-danger"><i class="fas fa-times-circle me-1"></i>Rest unverteilt: CHF ${diff.toFixed(2)}</span>`}
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer bg-light">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
          <button type="button" class="btn btn-success fw-bold px-4" ${!isBalanced ? 'disabled' : ''} onclick="bhBankSaveSplitBooking(${window._bhSplitCurrentTxIndex})">
            <i class="fas fa-save me-1"></i>Split-Buchung speichern (${splitRows.length} Zeilen)
          </button>
        </div>
      </div>
    </div>
  `;
}

window.bhBankUpdateSplitFromInputs = function() {
  const rows = window._bhSplitCurrentRows || [];
  rows.forEach((r, i) => {
    const descEl = document.getElementById(`bh-split-desc-${i}`);
    const amtEl = document.getElementById(`bh-split-amt-${i}`);
    const sollEl = document.getElementById(`bh-split-soll-${i}`);
    const habenEl = document.getElementById(`bh-split-haben-${i}`);

    if (descEl) r.beschreibung = descEl.value;
    if (amtEl) r.betrag = parseFloat(amtEl.value) || 0;
    if (sollEl) r.kontoSoll = String(sollEl.value || '').split('|')[0].trim();
    if (habenEl) r.kontoHaben = String(habenEl.value || '').split('|')[0].trim();
  });

  const txs = window._bhBankMatchResults || [];
  const tx = txs[window._bhSplitCurrentTxIndex];
  if (tx) bhBankRenderSplitModalContent(tx);
};

window.bhBankAddSplitRow = function() {
  bhBankUpdateSplitFromInputs();
  const txs = window._bhBankMatchResults || [];
  const tx = txs[window._bhSplitCurrentTxIndex];
  const isCredit = tx ? tx.isCredit : false;

  (window._bhSplitCurrentRows = window._bhSplitCurrentRows || []).push({
    beschreibung: (tx ? (tx.partyName || tx.remittanceInfo || 'Split-Position') : 'Split-Position'),
    betrag: 0,
    kontoSoll: isCredit ? '1020' : '1190',
    kontoHaben: isCredit ? '1190' : '1020'
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

  const year = Number(window._bhYear || new Date().getFullYear());
  const existingBankBelege = (window._bhJournal || []).filter(j => Number(j.jahr) === year && String(j.beleg_nr || '').startsWith('BK-'));
  const baseBelegSeq = String(existingBankBelege.length + 1).padStart(3, '0');

  try {
    let successCount = 0;

    for (let i = 0; i < splitRows.length; i++) {
      const r = splitRows[i];
      if (Number(r.betrag) === 0) continue; // 0 CHF Zeilen überspringen

      const subChar = String.fromCharCode(97 + i); // a, b, c...
      const belegNr = `BK-${year}-${baseBelegSeq}${subChar}`;

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
  }
};
