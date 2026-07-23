// vorstand/js/buchhaltung/buchhaltung-bank.js
// =====================================================================
// MODUL: BUCHHALTUNG - BANKABGLEICH & AUTOMATISCHE BUCHUNGSSÄTZE (CAMT.053)
// =====================================================================

window._bhBankTransactions = window._bhBankTransactions || [];
window._bhBankMatchResults = window._bhBankMatchResults || [];
window._bhBankActiveFilter = window._bhBankActiveFilter || 'all';

// Aus localStorage geladene Benutzer-Buchungsregeln
window.getBhBankRules = function() {
  try {
    const stored = localStorage.getItem('bh_bank_rules');
    return stored ? JSON.parse(stored) : getBhDefaultRules();
  } catch (e) {
    return getBhDefaultRules();
  }
};

window.saveBhBankRules = function(rules) {
  try {
    localStorage.setItem('bh_bank_rules', JSON.stringify(rules));
  } catch (e) {
    console.error('Fehler beim Speichern der Bank-Regeln:', e);
  }
};

function getBhDefaultRules() {
  return [
    { pattern: 'bankspesen', soll: '6900', haben: '1020', label: 'Bankspesen / Finanzaufwand' },
    { pattern: 'kontoführung', soll: '6900', haben: '1020', label: 'Bankspesen / Kontoführung' },
    { pattern: 'zins', soll: '1020', haben: '6950', label: 'Zinsertrag / Bank' },
    { pattern: 'schützenverband', soll: '6500', haben: '1020', label: 'Verbandsbeiträge' },
    { pattern: 'agksv', soll: '6500', haben: '1020', label: 'Verbandsbeiträge (AGKSV)' },
    { pattern: 'ssv', soll: '6500', haben: '1020', label: 'Verbandsbeiträge (SSV)' },
    { pattern: 'munition', soll: '4200', haben: '1020', label: 'Munitionsaufwand' },
    { pattern: 'helvetia', soll: '6200', haben: '1020', label: 'Versicherungsprämie' },
    { pattern: 'gva', soll: '6200', haben: '1020', label: 'Gebäudeversicherung' },
    { pattern: 'sponsoring', soll: '1020', haben: '3600', label: 'Sponsoring-Ertrag' },
    { pattern: 'spende', soll: '1020', haben: '3600', label: 'Spenden-Ertrag' }
  ];
}

// ---------------------------------------------------------------------
// Hauptansicht: Tab "Bankabgleich (CAMT.053)"
// ---------------------------------------------------------------------
window.renderTabBankabgleich = function(container) {
  if (!container) return;

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
        <button class="btn btn-sm btn-outline-secondary active" id="bhBankFilterAll" onclick="bhBankFilter('all')">
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

  const activeFilter = filter || window._bhBankActiveFilter || 'all';
  window._bhBankActiveFilter = activeFilter;

  let filtered = [...rows];
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
      actionButtons = `
        <button class="btn btn-sm btn-success py-1 px-2" onclick="bhBankBookOne(${realI})" title="Buchungssatz ausführen und ins Kassabuch eintragen">
          <i class="fas fa-check me-1"></i>Buchen
        </button>
        <button class="btn btn-sm btn-outline-secondary py-1 px-2 ms-1" onclick="bhBankSaveRuleModal(${realI})" title="Dauerhafte automatische Regel für diesen Absender/Text merken">
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
        <td style="max-width: 220px;">
          <small class="text-muted d-block text-truncate" title="${escHtml(r.remittanceInfo)}">
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
    return `<th class="${alignClass}" style="cursor:pointer; user-select:none;" onclick="bhBankSortTable('${colKey}')" title="Klicken zum Sortieren nach ${label}">${label}${icon}</th>`;
  }

  let datalistOptions = kontenrahmen.map(k => {
    return `<option value="${String(k.konto).trim()} | ${escHtml(k.bezeichnung)}"></option>`;
  }).join('');

  container.innerHTML = `
    <datalist id="bh-konten-datalist">
      ${datalistOptions}
    </datalist>
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle mb-0" style="font-size: 13px;">
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
        const sameAmount = Math.abs(Number(j.betrag || 0) - tx.amount) < 0.01;
        const jIso = toNormalizedIsoDate(j.datum);
        const txIso = toNormalizedIsoDate(tx.bookingDate);
        const sameDate = jIso && txIso && jIso === txIso;

        if (!sameAmount || !sameDate) return false;

        const desc = normalizeString(j.beschreibung || '');
        const party = normalizeString(tx.partyName || '');
        const rmt = normalizeString(tx.remittanceInfo || '');
        const ref = normalizeString(tx.creditorReference || '');

        if (!party && !rmt && !ref) return true;

        const samePartyOrRef = (party && (desc.includes(party) || party.includes(desc))) || 
                               (rmt && desc.includes(rmt)) || 
                               (ref && desc.includes(ref));

        return samePartyOrRef || true; // Betrag & Datum stimmen überein
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

    // 2. STUFE: Benutzer-Regeln (Rules)
    if (!isJahresbeitrag) {
      for (const r of userRules) {
        const p = r.pattern.toLowerCase();
        if (cleanRemittance.includes(p) || cleanParty.includes(p)) {
          matchType = 'rule';
          matchRuleName = r.label;
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

    return {
      ...tx,
      txYear,
      isWrongYear,
      alreadyBooked: tx.alreadyBooked || alreadyBooked,
      bookedDate: tx.bookedDate || bookedDate,
      isJahresbeitrag,
      matchScore,
      matchedMember,
      matchedBeitrag,
      alreadyPaidJb,
      matchType,
      matchRuleName,
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
  ['bhBankFilterAll','bhBankFilterJb','bhBankFilterRules','bhBankFilterUnklar'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active', 'btn-dark');
  });
  const activeBtn = document.getElementById(filter === 'jb' ? 'bhBankFilterJb' : (filter === 'rules' ? 'bhBankFilterRules' : (filter === 'unklar' ? 'bhBankFilterUnklar' : 'bhBankFilterAll')));
  if (activeBtn) activeBtn.classList.add('active');

  bhBankRenderResults(filter);
};

// ---------------------------------------------------------------------
// Einzelne Buchung durchführen
// ---------------------------------------------------------------------
window.bhBankBookOne = async function(txIdx) {
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

  const beschreibung = (tx.partyName ? `${tx.partyName}: ` : '') + (tx.remittanceInfo || 'Bankbuchung CAMT.053');

  try {
    // 1. Journal-Buchungssatz in Buchhaltung speichern (POST)
    const payloadBh = {
      action: 'addJournalEntry',
      jahr: Number(window._bhYear || new Date().getFullYear()),
      datum: tx.bookingDate || new Date().toISOString().split('T')[0],
      beleg_nr: 'CAMT-' + (tx.bookingDate ? tx.bookingDate.replace(/-/g,'') : '00') + '-' + (txIdx + 1),
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

  let count = 0;
  for (const { r, i } of toBook) {
    try {
      await bhBankBookOne(i);
      count++;
    } catch (_) {}
  }

  showToast(`⚡ ${count} von ${toBook.length} Buchungen erfolgreich ausgeführt!`, 'success');
};

// ---------------------------------------------------------------------
// Regel merken (Modal & Speicher-Logik)
// ---------------------------------------------------------------------
window.bhBankSaveRuleModal = function(txIdx) {
  const tx = window._bhBankMatchResults[txIdx];
  if (!tx) return;

  const defaultPattern = (tx.partyName || tx.remittanceInfo || '').trim();

  const sollEl  = document.getElementById(`bh-soll-${txIdx}`);
  const habenEl = document.getElementById(`bh-haben-${txIdx}`);

  const sollVal  = sollEl ? sollEl.value : tx.suggestedSoll;
  const habenVal = habenEl ? habenEl.value : tx.suggestedHaben;

  const pattern = prompt(
    `Neue automatische Buchungsregel erstellen:\n\nSystem durchsucht Zahler/Text nach diesem Begriff:`,
    defaultPattern
  );

  if (!pattern) return;

  const label = prompt('Kurze Beschreibung der Regel (z.B. "Bankspesen Raiffeisen"):', pattern);
  if (!label) return;

  const rules = window.getBhBankRules();
  rules.push({
    pattern: pattern.trim(),
    soll: sollVal,
    haben: habenVal,
    label: label.trim()
  });

  window.saveBhBankRules(rules);
  showToast(`✅ Regel "${label}" erfolgreich gespeichert!`, 'success');

  // Neu-Match durchführen
  window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
  bhBankRenderResults(window._bhBankActiveFilter);
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

  const rulesRows = rules.map((r, i) => `
    <tr>
      <td><code>${escHtml(r.pattern)}</code></td>
      <td>${escHtml(r.label)}</td>
      <td><span class="badge bg-primary">${escHtml(r.soll)}</span></td>
      <td><span class="badge bg-success">${escHtml(r.haben)}</span></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger py-0" onclick="bhBankDeleteRule(${i})">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-dark text-white border-0 py-3">
          <h5 class="modal-title fw-bold"><i class="fas fa-cog me-2"></i>Automatische Buchungsregeln</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <p class="text-muted small mb-3">Diese Regeln werden beim Import von CAMT.053 Dateien automatisch angewendet.</p>
          <div class="table-responsive">
            <table class="table table-hover table-sm">
              <thead class="table-light">
                <tr>
                  <th>Such-Muster</th>
                  <th>Beschreibung</th>
                  <th>Soll</th>
                  <th>Haben</th>
                  <th class="text-end">Aktion</th>
                </tr>
              </thead>
              <tbody>${rulesRows}</tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer border-0">
          <button class="btn btn-secondary" data-bs-dismiss="modal">Schließen</button>
        </div>
      </div>
    </div>
  `;

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.bhBankDeleteRule = function(idx) {
  const rules = window.getBhBankRules();
  rules.splice(idx, 1);
  window.saveBhBankRules(rules);

  const modalEl = document.getElementById('bhModalManageRules');
  if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

  showToast('Regel gelöscht.', 'info');
  if (window._bhBankTransactions.length > 0) {
    window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
    bhBankRenderResults(window._bhBankActiveFilter);
  }
};
