// vorstand/js/jahresbeitrag/jahresbeitrag-bank.js
// ============================================================
// TAB 4: BANKABGLEICH (CAMT.053 XML)
// ============================================================

// ---- Render: Upload-Bereich + Ergebnistabelle ----------------
function renderBankabgleichTab() {
  const hasResults = _jbBankMatchResults && _jbBankMatchResults.length > 0;
  const jbCount  = hasResults ? _jbBankMatchResults.filter(r => r.isJahresbeitrag).length : 0;
  const otherCount = hasResults ? _jbBankMatchResults.filter(r => !r.isJahresbeitrag).length : 0;

  const ibanFilterChecked = window._jbBankIbanFilterOff ? '' : 'checked';

  return `
    <div class="card border-0 shadow-sm p-4 bg-white">
      <h4 class="mb-1 text-success"><i class="fas fa-university me-2"></i>Bankabgleich – Jahresbeiträge</h4>
      <p class="text-muted small mb-3">CAMT.053 Kontoauszug hochladen. Das System erkennt Jahresbeitragszahlungen automatisch und gleicht sie mit den Mitgliederdaten ab.</p>

      <!-- Upload-Zone -->
      <div class="card bg-light border-0 mb-2" style="border: 2px dashed #28a745 !important; border-radius: 12px; cursor: pointer;"
           onclick="document.getElementById('bankXmlInput').click()"
           ondragover="event.preventDefault(); this.style.background='#d4edda';"
           ondragleave="this.style.background='';"
           ondrop="event.preventDefault(); this.style.background=''; jbBankHandleFile(event.dataTransfer.files[0]);">
        <div class="p-4 text-center">
          <input type="file" id="bankXmlInput" class="d-none" accept=".xml" onchange="jbBankHandleFile(this.files[0])">
          <i class="fas fa-file-code fa-3x mb-2 text-success" style="opacity:0.7;"></i>
          <h6 class="text-success fw-bold mb-1">CAMT.053 XML-Datei hier ablegen oder klicken</h6>
          <div class="text-muted small">Unterstützt: camt.053.001.08 (Raiffeisenbank)</div>
        </div>
      </div>

      <!-- IBAN-Filter Hinweis -->
      <div class="d-flex align-items-center gap-3 mb-4 px-1">
        <div class="d-flex align-items-center gap-2 bg-light border rounded px-3 py-2" style="font-size:12px;">
          <i class="fas fa-filter text-success"></i>
          <span class="text-muted">Kontofilter:</span>
          <code class="fw-bold text-dark">CH0680808003633131892</code>
          <span class="text-muted">(Raiffeisenbank)</span>
        </div>
        <div class="form-check form-switch mb-0" title="Dateinamen-Prüfung deaktivieren">
          <input class="form-check-input" type="checkbox" id="bankIbanFilterCheck" ${ibanFilterChecked}
                 onchange="window._jbBankIbanFilterOff = !this.checked;">
          <label class="form-check-label small text-muted" for="bankIbanFilterCheck">Kontofilter active</label>
        </div>
      </div>

      <!-- Statistik-Banner (nur wenn Ergebnisse) -->
      <div id="bankStatsBanner" class="${hasResults ? '' : 'd-none'}">
        ${hasResults ? jbBankStatsBannerHTML() : ''}
      </div>

      <!-- Filter-Buttons -->
      <div id="bankFilterBar" class="${hasResults ? 'd-flex gap-2 mb-3 flex-wrap' : 'd-none'}">
        <button class="btn btn-sm btn-outline-secondary active" id="bankFilterAll" onclick="jbBankFilter('all')">Alle (${hasResults ? _jbBankMatchResults.length : 0})</button>
        <button class="btn btn-sm btn-success" id="bankFilterJb" onclick="jbBankFilter('jb')"><i class="fas fa-euro-sign me-1"></i>Jahresbeiträge (${jbCount})</button>
        <button class="btn btn-sm btn-outline-warning" id="bankFilterOther" onclick="jbBankFilter('other')">Andere Buchungen (${otherCount})</button>
        <button class="btn btn-sm btn-outline-danger" id="bankFilterUnmatched" onclick="jbBankFilter('unmatched')">❓ Nicht zugeordnet</button>
        <button class="btn btn-sm btn-outline-primary ms-auto" onclick="jbBankBookAll()"><i class="fas fa-check-double me-1"></i>Alle ✅ buchen</button>
      </div>

      <!-- Ergebnistabelle -->
      <div id="bankResultsContainer">
        ${hasResults ? '' : '<div class="text-center text-muted py-5"><i class="fas fa-file-upload fa-3x mb-3" style="opacity:0.2;"></i><br>Noch keine Datei geladen</div>'}
      </div>
    </div>
  `;
}

// ---- Stats-Banner HTML ----------------------------------------
function jbBankStatsBannerHTML() {
  const results = _jbBankMatchResults;
  const jbRows = results.filter(r => r.isJahresbeitrag);
  const matched = jbRows.filter(r => r.matchScore >= 2);
  const unsure  = jbRows.filter(r => r.matchScore === 1);
  const none    = jbRows.filter(r => r.matchScore === 0);
  const already = jbRows.filter(r => r.alreadyPaid);
  const totalCHF = jbRows.reduce((s, r) => s + r.amount, 0);

  return `
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-success">
          <div class="small text-muted">Jahresbeitrag-Buchungen</div>
          <div class="fs-5 fw-bold text-success">${jbRows.length}</div>
          <div class="text-muted small">CHF ${totalCHF.toFixed(2)}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-primary">
          <div class="small text-muted">✅ Eindeutig zugeordnet</div>
          <div class="fs-5 fw-bold text-primary">${matched.length}</div>
          <div class="text-muted small">Betrag + Name stimmt</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-warning">
          <div class="small text-muted">⚠️ Unsicher</div>
          <div class="fs-5 fw-bold text-warning">${unsure.length}</div>
          <div class="text-muted small">Manuelle Prüfung</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm p-3 border-start border-4 border-danger">
          <div class="small text-muted">❓ Nicht zugeordnet</div>
          <div class="fs-5 fw-bold text-danger">${none.length}</div>
          <div class="text-muted small">Kein Treffer</div>
        </div>
      </div>
    </div>
  `;
}

// ---- Render Results Table -------------------------------------
function jbBankRenderResults(filter) {
  const container = document.getElementById('bankResultsContainer');
  if (!container) return;

  let rows = _jbBankMatchResults || [];
  if (!rows.length) return;

  const activeFilter = filter || window._jbBankActiveFilter || 'all';
  window._jbBankActiveFilter = activeFilter;
  let filtered = rows;
  if (activeFilter === 'jb')        filtered = rows.filter(r => r.isJahresbeitrag);
  if (activeFilter === 'other')     filtered = rows.filter(r => !r.isJahresbeitrag);
  if (activeFilter === 'unmatched') filtered = rows.filter(r => r.isJahresbeitrag && r.matchScore === 0);

  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));

  const realIdx = filtered.map(r => rows.indexOf(r));

  const rowsHTML = filtered.map((r, idx) => {
    const realI  = realIdx[idx];
    const isJb = r.isJahresbeitrag;
    const score = r.matchScore;

    let badge = '';
    if (!isJb) {
      badge = '<span class="badge bg-secondary">Andere Buchung</span>';
    } else if (r.alreadyPaid) {
      badge = '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Bereits gebucht</span>';
    } else if (score >= 2) {
      badge = '<span class="badge bg-primary">✅ Eindeutig</span>';
    } else if (score === 1) {
      badge = '<span class="badge bg-warning text-dark">⚠️ Unsicher</span>';
    } else {
      badge = '<span class="badge bg-danger">❓ Kein Treffer</span>';
    }

    let memberInfo = '–';
    if (r.matchedMember) {
      const m = r.matchedMember;
      const passivBadge = m._istPassiv ? ' <span class="badge bg-secondary" style="font-size: 10px; padding: 2px 4px;">Passiv</span>' : '';
      memberInfo = `<span class="fw-semibold">${m.FirstName || ''} ${m.LastName || ''}</span>${passivBadge}<br>
        <small class="text-muted">${m.PersonNumber || ''} · ${m.PostCode || ''} ${m.City || ''}</small>`;
    } else if (isJb) {
      memberInfo = '<span class="text-danger small">Kein Mitglied gefunden</span>';
    }

    let actionBtn = '';
    if (isJb && !r.alreadyPaid && canEdit) {
      const dateStr   = r.bookingDate || '';
      const headerId  = r.matchedBeitrag ? (r.matchedBeitrag.id || '') : '';
      let bookBtn = '';
      if (headerId) {
        if (score >= 2) {
          bookBtn = `<button class="btn btn-sm btn-success" onclick="jbBankBookOne('${headerId}','${dateStr}','${realI}')">
            <i class="fas fa-check me-1"></i>Buchen
          </button>`;
        } else if (score === 1) {
          bookBtn = `<button class="btn btn-sm btn-outline-warning" onclick="jbBankBookOne('${headerId}','${dateStr}','${realI}')">
            <i class="fas fa-question-circle me-1"></i>Trotzdem buchen
          </button>`;
        }
      } else if (r.matchedMember) {
        bookBtn = `<span class="badge bg-warning text-dark py-1.5" style="font-size: 11px;" title="Rechnung wurde für das aktive Jahr noch nicht berechnet. Bitte in Beitrags-Übersicht berechnen."><i class="fas fa-calculator me-1"></i>Rechnung fehlt</span>`;
      }
      const umbuchenBtn = `<button class="btn btn-sm btn-outline-secondary ms-1" title="Andere Person auswählen" onclick="jbBankShowReassignModal(${realI})">
        <i class="fas fa-exchange-alt"></i>
      </button>`;
      actionBtn = `<div class="d-flex gap-1 flex-wrap">${bookBtn}${umbuchenBtn}</div>`;
    } else if (isJb && r.alreadyPaid) {
      actionBtn = `<span class="text-success small"><i class="fas fa-check-circle me-1"></i>${r.alreadyPaidDate || ''}</span>`;
    }

    const rowBg = !isJb ? 'table-light' : (r.alreadyPaid ? 'table-success' : (score >= 2 ? '' : (score === 1 ? 'table-warning' : 'table-danger')));
    const opacity = !isJb ? ' style="opacity:0.6;"' : '';

    return `
      <tr class="${rowBg}"${opacity}>
        <td class="text-muted small">${r.bookingDate || ''}</td>
        <td><span class="fw-semibold">${escHtml(r.debtorName || '')}</span><br>
            <small class="text-muted">${escHtml(r.debtorCity || '')} · ${escHtml(r.debtorPostCode || '')}</small>
        </td>
        <td class="text-end fw-bold">CHF ${Number(r.amount || 0).toFixed(2)}</td>
        <td><small class="text-muted" style="font-size:11px;">${escHtml((r.remittanceInfo || '').substring(0, 60))}${r.remittanceInfo && r.remittanceInfo.length > 60 ? '…' : ''}</small></td>
        <td>${badge}</td>
        <td>${memberInfo}</td>
        ${canEdit ? `<td>${actionBtn}</td>` : ''}
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover table-sm mb-0" style="font-size: 13px;">
        <thead class="table-dark sticky-top">
          <tr>
            <th>Datum</th>
            <th>Zahler (Bank)</th>
            <th class="text-end">Betrag</th>
            <th>Verwendungszweck</th>
            <th>Status</th>
            <th>Matched Mitglied</th>
            ${canEdit ? '<th>Aktion</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="text-muted small mt-2 px-1">${filtered.length} von ${rows.length} Buchungen angezeigt</div>
  `;
}

// ---- Reassign Modal Candidates ----------------------------
function jbBankScoreAllCandidates(tx) {
  const beitraege = (_jbAllBeitraege || []).filter(h => Number(h.year) === Number(_jbYear));
  const members   = _jbMembers || [];

  return members.map(m => {
    const b = beitraege.find(x => String(x.PersonNumber) === String(m.PersonNumber)) || null;

    const bankName = normalizeName(tx.debtorName || '');
    const bankPLZ  = String(tx.debtorPostCode || '').trim();
    const bankOrt  = normalizeName(tx.debtorCity || '');

    const mLast  = normalizeName(m.LastName  || '');
    const mFirst = normalizeName(m.FirstName || '');
    const mPLZ   = String(m.PostCode || '').trim();
    const mOrt   = normalizeName(m.City || '');
    const mGesamt = b ? Number(b.Gesamt || 0) : (m._istPassiv ? 20 : 0);

    let score = 0;
    let reasons = [];

    const amountMatch = Math.abs(mGesamt - tx.amount) < 0.01;
    if (amountMatch)   { score++;     reasons.push('Betrag'); }
    const lastMatch = bankName.includes(mLast) || mLast.includes(bankName);
    if (lastMatch && mLast.length > 1) { score++; reasons.push('Nachname'); }
    const firstMatch = bankName.includes(mFirst) || mFirst.includes(bankName.split(' ')[0]);
    if (firstMatch && mFirst.length > 1) { score += 0.5; reasons.push('Vorname'); }
    if (bankPLZ && mPLZ && bankPLZ === mPLZ) { score += 0.5; reasons.push('PLZ'); }
    if (bankOrt && mOrt && (bankOrt.includes(mOrt) || mOrt.includes(bankOrt))) { score += 0.3; reasons.push('Ort'); }

    const cleanMpn = String(m.PersonNumber || '').trim().replace(/^0+/, '');
    const cleanBid = b ? String(b.id || '').trim().replace(/^0+/, '') : '';
    const cleanDref = b ? String(b.document_ref || '').trim().replace(/^0+/, '') : '';
    const cleanRef = (tx.creditorReference || '').toLowerCase();

    if (cleanRef) {
      const numericRef = cleanRef.replace(/[^0-9]/g, '').replace(/^0+/, '');
      if (cleanMpn && numericRef.endsWith(cleanMpn)) {
        score += 2; reasons.push('Referenz (Mitglied)');
      } else if (cleanBid && numericRef === cleanBid) {
        score += 3; reasons.push('Referenz (Rechnung)');
      } else if (cleanDref && numericRef === cleanDref) {
        score += 3; reasons.push('Referenz (Beleg)');
      }
    }

    return { b, m, score, reasons, alreadyPaid: b ? (b.status === 'bezahlt') : false };
  })
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);
}

// ---- Reassign Modal öffnen ----------------------------------
function jbBankShowReassignModal(txIdx) {
  const tx = _jbBankMatchResults[txIdx];
  if (!tx) return;

  const candidates = jbBankScoreAllCandidates(tx);
  const dateStr = tx.bookingDate || '';

  function scoreColor(s) {
    if (s >= 2.5) return 'bg-success';
    if (s >= 1.5) return 'bg-primary';
    if (s >= 1)   return 'bg-warning';
    if (s > 0)    return 'bg-secondary';
    return 'bg-danger';
  }
  function scoreLabel(s) {
    if (s >= 2)   return '✅ Gut';
    if (s >= 1)   return '⚠️ Möglich';
    if (s > 0)    return '🖍️ Schwach';
    return '❓ Kein Match';
  }

  const listHTML = candidates.slice(0, 30).map((c, ci) => {
    const paidBadge = c.alreadyPaid
      ? '<span class="badge bg-success ms-1">Bezahlt</span>'
      : (c.b ? '<span class="badge bg-light text-dark border ms-1">Offen</span>' : '<span class="badge bg-warning text-dark ms-1">Rechnung fehlt</span>');
    const scoreBar = Math.min(100, Math.round((c.score / 3.3) * 100));
    const reasonStr = c.reasons.length ? `<small class="text-muted">(${c.reasons.join(', ')})</small>` : '';
    const disabledAttr = (c.alreadyPaid || !c.b) ? 'disabled title="Bereits als bezahlt markiert oder keine Beitragsrechnung vorhanden"' : '';
    const betragStr = c.b ? `CHF ${Number(c.b.Gesamt || 0).toFixed(2)}` : '–';
    const bidVal = c.b ? c.b.id : '';

    return `
      <tr>
        <td>
          <span class="fw-semibold">${escHtml(c.m.LastName || '')} ${escHtml(c.m.FirstName || '')}</span>${paidBadge}<br>
          <small class="text-muted">${c.m.PersonNumber || ''} · ${String(c.m.PostCode || '')} ${escHtml(c.m.City || '')}</small>
        </td>
        <td class="text-end fw-bold" style="white-space:nowrap;">${betragStr}</td>
        <td style="min-width:120px;">
          <div class="progress mb-1" style="height:6px;">
            <div class="progress-bar ${scoreColor(c.score)}" style="width:${scoreBar}%"></div>
          </div>
          <small>${scoreLabel(c.score)} ${reasonStr}</small>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-primary py-0" ${disabledAttr}
                  onclick="jbBankBookAlternative(${txIdx}, '${bidVal}', '${escHtml(c.m.FirstName || '')} ${escHtml(c.m.LastName || '')}', '${dateStr}')">
            <i class="fas fa-arrow-right me-1"></i>Buchen
          </button>
        </td>
      </tr>`;
  }).join('');

  let modal = document.getElementById('bankReassignModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="bankReassignModal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title"><i class="fas fa-exchange-alt me-2"></i>Zahlung umbuchen</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
              <div id="bankReassignInfo" class="px-3 pt-3 pb-2 bg-light border-bottom"></div>
              <div class="table-responsive">
                <table class="table table-hover table-sm mb-0" style="font-size:13px;">
                  <thead class="table-secondary sticky-top">
                    <tr>
                      <th>Mitglied</th>
                      <th class="text-end">Beitrag</th>
                      <th>Match</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="bankReassignList"></tbody>
                </table>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
            </div>
          </div>
        </div>
      </div>`);
    modal = document.getElementById('bankReassignModal');
  }

  document.getElementById('bankReassignInfo').innerHTML = `
    <div class="d-flex gap-4 align-items-start flex-wrap">
      <div>
        <div class="text-muted small">Zahler (Bank)</div>
        <div class="fw-semibold">${escHtml(tx.debtorName || '–')}</div>
        <div class="text-muted small">${escHtml(tx.debtorPostCode || '')} ${escHtml(tx.debtorCity || '')}</div>
      </div>
      <div>
        <div class="text-muted small">Betrag</div>
        <div class="fw-bold text-success">CHF ${Number(tx.amount || 0).toFixed(2)}</div>
        <div class="text-muted small">${dateStr}</div>
      </div>
      <div style="flex:1;">
        <div class="text-muted small">Verwendungszweck</div>
        <div class="small">${escHtml((tx.remittanceInfo || '').substring(0, 120))}</div>
      </div>
    </div>
    <div class="mt-2 text-muted small">Top 30 Mitglieder nach Match-Score (absteigend). Vorschlag in Fettschrift.</div>`;

  document.getElementById('bankReassignList').innerHTML = listHTML;

  bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function jbBankBookAlternative(txIdx, headerId, memberName, dateStr) {
  if (!headerId || !dateStr) { alert('Fehlende Daten.'); return; }

  const confirmed = confirm(`Zahlung vom ${dateStr}\nan "${memberName}" buchen?\nZahlungsmethode: Überweisung (Bank)`);
  if (!confirmed) return;

  const modal = document.getElementById('bankReassignModal');
  if (modal) bootstrap.Modal.getInstance(modal)?.hide();

  try {
    const params = new URLSearchParams({
      action: 'saveZahlung',
      headerId,
      datum: dateStr,
      methode: 'Überweisung',
      beleg: 'CAMT053'
    });
    const res = await apiFetch('jahresbeitrag', params.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Fehler beim Speichern');

    if (_jbBankMatchResults[txIdx]) {
      _jbBankMatchResults[txIdx].alreadyPaid     = true;
      _jbBankMatchResults[txIdx].alreadyPaidDate = dateStr;
    }
    const cached = (_jbAllBeitraege || []).find(h => String(h.id) === String(headerId));
    if (cached) { cached.status = 'bezahlt'; cached.payment_date = dateStr; cached.payment_method = 'Überweisung'; }

    showToast(`✅ Zahlung für ${memberName} gebucht!`, 'success');
    jbBankRenderResults(window._jbBankActiveFilter);
    const banner = document.getElementById('bankStatsBanner');
    if (banner) banner.innerHTML = jbBankStatsBannerHTML();

  } catch(err) {
    alert('Fehler: ' + err.message);
  }
}

function jbBankFilter(filter) {
  ['bankFilterAll','bankFilterJb','bankFilterOther','bankFilterUnmatched'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) { btn.classList.remove('active'); btn.classList.remove('btn-dark'); }
  });
  jbBankRenderResults(filter);
}

var BANK_IBAN = 'ch0680808003633131892';

function jbBankHandleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xml')) {
    alert('Bitte eine XML-Datei (CAMT.053) auswählen.');
    return;
  }

  if (!window._jbBankIbanFilterOff) {
    const nameClean = file.name.toLowerCase().replace(/[-_]/g, '');
    const ibanClean = BANK_IBAN.replace(/[-_]/g, '');
    if (!nameClean.includes(ibanClean)) {
      const proceed = confirm(
        '⚠️ Kontofilter-Warnung\n\n' +
        'Die gewählte Datei enthält die IBAN\n' +
        'CH0680808003633131892\nnicht im Dateinamen.\n\n' +
        'Datei: ' + file.name + '\n\n' +
        'Möglicherweise handelt es sich um den falschen Kontoauszug.\n\n' +
        'Trotzdem laden?'
      );
      if (!proceed) {
        const inp = document.getElementById('bankXmlInput');
        if (inp) inp.value = '';
        return;
      }
    }
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const xmlText = e.target.result;
      const transactions = jbBankParseCAMT053(xmlText);
      _jbBankTransactions = transactions;
      _jbBankMatchResults = jbBankMatchAll(transactions);
      window._jbBankActiveFilter = 'all';
      renderJahresbeitragView();
    } catch(err) {
      alert('Fehler beim Lesen der XML-Datei: ' + err.message);
    } finally {
      const inp = document.getElementById('bankXmlInput');
      if (inp) inp.value = '';
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function jbBankParseCAMT053(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  function getTagText(el, tagName) {
    if (!el) return '';
    const nodes = el.getElementsByTagNameNS('*', tagName);
    if (nodes.length > 0) return (nodes[0].textContent || '').trim();
    return '';
  }

  function getFirstChild(el, tagName) {
    if (!el) return null;
    const nodes = el.getElementsByTagNameNS('*', tagName);
    return nodes.length > 0 ? nodes[0] : null;
  }

  const transactions = [];
  const entries = doc.getElementsByTagNameNS('*', 'Ntry');

  for (let i = 0; i < entries.length; i++) {
    const ntry = entries[i];

    const cdtDbtInd = getTagText(ntry, 'CdtDbtInd');
    if (cdtDbtInd !== 'CRDT') continue;

    const amount      = parseFloat(getTagText(ntry, 'Amt') || '0');
    const bookingDate = getTagText(getFirstChild(ntry, 'BookgDt'), 'Dt');
    const addtlInfo   = getTagText(ntry, 'AddtlNtryInf');

    const txDtls = getFirstChild(ntry, 'TxDtls');

    const dbtrPty    = getFirstChild(getFirstChild(txDtls, 'Dbtr'), 'Pty');
    const ultDbtrPty = getFirstChild(getFirstChild(txDtls, 'UltmtDbtr'), 'Pty');
    const namePty = ultDbtrPty || dbtrPty;

    const debtorName     = getTagText(namePty, 'Nm');
    const pstlAdr        = getFirstChild(namePty, 'PstlAdr');
    const debtorPostCode = getTagText(pstlAdr, 'PstCd');
    const debtorCity     = getTagText(pstlAdr, 'TwnNm');
    const adrLine        = getTagText(pstlAdr, 'AdrLine');

    const strd       = getFirstChild(getFirstChild(txDtls, 'RmtInf'), 'Strd');
    const ustrd      = getTagText(getFirstChild(txDtls, 'RmtInf'), 'Ustrd');
    const addtlRmt   = getTagText(strd, 'AddtlRmtInf');
    const remittanceInfo = addtlRmt || ustrd || addtlInfo || '';

    const cdtrRefInf = getFirstChild(strd, 'CdtrRefInf');
    const creditorReference = getTagText(cdtrRefInf, 'Ref');

    transactions.push({
      amount,
      bookingDate,
      debtorName,
      debtorPostCode,
      debtorCity: debtorCity || (adrLine ? adrLine.split(' ').slice(-1)[0] : ''),
      remittanceInfo,
      creditorReference,
      isJahresbeitrag: false
    });
  }

  return transactions;
}

function jbBankMatchAll(transactions) {
  const beitraege = (_jbAllBeitraege || []).filter(h => Number(h.year) === Number(_jbYear));
  const members   = _jbMembers || [];

  return transactions.map(tx => {
    const cleanRemittance = (tx.remittanceInfo || '').toLowerCase();
    const cleanAddtlInfo  = (tx.addtlInfo || '').toLowerCase();
    const cleanRef        = (tx.creditorReference || '').toLowerCase();
    
    const jbRegex = /jahresbeitra\s*g/i;
    const jbRegex2 = /mitgliederbeitra\s*g/i;
    const jbRegex3 = /mitgliedsbeitra\s*g/i;
    const jbRegex4 = /vereinsbeitra\s*g/i;
    const jbRegex5 = /beitra\s*g/i;
    const jbRegex6 = /\bjb\b/i;
    const jbRegex7 = /jahresbeitr/i;
    
    const textHasJb = jbRegex.test(cleanRemittance) || jbRegex.test(cleanAddtlInfo) ||
                      jbRegex2.test(cleanRemittance) || jbRegex2.test(cleanAddtlInfo) ||
                      jbRegex3.test(cleanRemittance) || jbRegex3.test(cleanAddtlInfo) ||
                      jbRegex4.test(cleanRemittance) || jbRegex4.test(cleanAddtlInfo) ||
                      jbRegex5.test(cleanRemittance) || jbRegex5.test(cleanAddtlInfo) ||
                      jbRegex6.test(cleanRemittance) || jbRegex6.test(cleanAddtlInfo) ||
                      jbRegex7.test(cleanRemittance) || jbRegex7.test(cleanAddtlInfo);

    const hasRef = cleanRef.startsWith('rf') || /^\d+$/.test(cleanRef);

    const bankName = normalizeName(tx.debtorName || '');
    const bankPLZ  = String(tx.debtorPostCode || '').trim();
    const bankOrt  = normalizeName(tx.debtorCity || '');

    let bestScore    = 0;
    let bestMember   = null;
    let bestBeitrag  = null;
    let bestAlready  = false;
    let bestPaidDate = '';
    let bestLastNameMatch = false;
    let bestFirstAndLastMatch = false;

    for (const m of members) {
      const b = beitraege.find(x => String(x.PersonNumber) === String(m.PersonNumber)) || null;

      const mLast  = normalizeName(m.LastName  || '');
      const mFirst = normalizeName(m.FirstName || '');
      const mPLZ   = String(m.PostCode || '').trim();
      const mOrt   = normalizeName(m.City || '');
      const mGesamt = b ? Number(b.Gesamt || 0) : (m._istPassiv ? 20 : 0);

      let score = 0;
      let lastNameMatch = false;
      let firstNameMatch = false;

      const amountMatch = Math.abs(mGesamt - tx.amount) < 0.01;
      if (amountMatch) score++;

      lastNameMatch = bankName.includes(mLast) || mLast.includes(bankName);
      if (lastNameMatch && mLast.length > 1) score++;

      firstNameMatch = bankName.includes(mFirst) || mFirst.includes(bankName.split(' ')[0]);
      if (firstNameMatch && mFirst.length > 1) score += 0.5;

      if (bankPLZ && mPLZ && bankPLZ === mPLZ) score += 0.5;
      if (bankOrt && mOrt && (bankOrt.includes(mOrt) || mOrt.includes(bankOrt))) score += 0.3;

      const cleanMpn = String(m.PersonNumber || '').trim().replace(/^0+/, '');
      const cleanBid = b ? String(b.id || '').trim().replace(/^0+/, '') : '';
      const cleanDref = b ? String(b.document_ref || '').trim().replace(/^0+/, '') : '';

      if (cleanRef) {
        const numericRef = cleanRef.replace(/[^0-9]/g, '').replace(/^0+/, '');
        if (cleanMpn && numericRef.endsWith(cleanMpn)) {
          score += 2;
        } else if (cleanBid && numericRef === cleanBid) {
          score += 3;
        } else if (cleanDref && numericRef === cleanDref) {
          score += 3;
        }
      }

      if (score > bestScore) {
        bestScore   = score;
        bestMember  = m;
        bestBeitrag = b;
        bestAlready = b ? (b.status === 'bezahlt') : false;
        bestPaidDate = b ? (b.payment_date || '') : '';
        bestLastNameMatch = lastNameMatch;
        bestFirstAndLastMatch = lastNameMatch && firstNameMatch;
      }
    }

    const isJahresbeitrag = textHasJb || hasRef || bestFirstAndLastMatch || bestLastNameMatch || (bestScore >= 2);

    let matchScore = 0;
    if (isJahresbeitrag) {
      if (bestScore >= 2) matchScore = 2;
      else if (bestScore >= 1) matchScore = 1;
    }

    return {
      ...tx,
      isJahresbeitrag,
      matchScore,
      matchedMember:  matchScore > 0 ? bestMember  : null,
      matchedBeitrag: matchScore > 0 ? bestBeitrag : null,
      alreadyPaid:    matchScore > 0 && bestAlready,
      alreadyPaidDate: bestPaidDate
    };
  });
}

function normalizeName(s) {
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

async function jbBankBookOne(headerId, dateStr, resultIdx) {
  if (!headerId || !dateStr) { alert('Fehlende Daten zum Buchen.'); return; }

  const confirmed = confirm(`Zahlung vom ${dateStr} ins Sheet buchen?\nZahlungsmethode: Überweisung (Bank)`);
  if (!confirmed) return;

  try {
    const params = new URLSearchParams({
      action: 'saveZahlung',
      headerId,
      datum: dateStr,
      methode: 'Überweisung',
      beleg: 'CAMT053'
    });
    const res = await apiFetch('jahresbeitrag', params.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Fehler beim Speichern');

    const idx = Number(resultIdx);
    if (_jbBankMatchResults[idx]) {
      _jbBankMatchResults[idx].alreadyPaid    = true;
      _jbBankMatchResults[idx].alreadyPaidDate = dateStr;
    }
    if (_jbBankMatchResults[idx] && _jbBankMatchResults[idx].matchedBeitrag) {
      const bid = String(_jbBankMatchResults[idx].matchedBeitrag.id);
      const cached = (_jbAllBeitraege || []).find(h => String(h.id) === bid);
      if (cached) { cached.status = 'bezahlt'; cached.payment_date = dateStr; cached.payment_method = 'Überweisung'; }
    }

    showToast('✅ Zahlung erfolgreich gebucht!', 'success');
    jbBankRenderResults(window._jbBankActiveFilter);
    const banner = document.getElementById('bankStatsBanner');
    if (banner) banner.innerHTML = jbBankStatsBannerHTML();

  } catch(err) {
    alert('Fehler: ' + err.message);
  }
}

async function jbBankBookAll() {
  const toBook = (_jbBankMatchResults || [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.isJahresbeitrag && r.matchScore >= 2 && !r.alreadyPaid && r.matchedBeitrag);

  if (!toBook.length) {
    showToast('Keine eindeutigen, unbezahlten Buchungen zum automatischen Buchen gefunden.', 'warning');
    return;
  }

  const ok = confirm(`${toBook.length} eindeutige Zahlungen jetzt buchen?`);
  if (!ok) return;

  let booked = 0;
  for (const { r, i } of toBook) {
    try {
      const params = new URLSearchParams({
        action: 'saveZahlung',
        headerId: r.matchedBeitrag.id,
        datum: r.bookingDate,
        methode: 'Überweisung',
        beleg: 'CAMT053'
      });
      const res = await apiFetch('jahresbeitrag', params.toString());
      const json = await res.json();
      if (json.success) {
        _jbBankMatchResults[i].alreadyPaid = true;
        _jbBankMatchResults[i].alreadyPaidDate = r.bookingDate;
        const bid = String(r.matchedBeitrag.id);
        const cached = (_jbAllBeitraege || []).find(h => String(h.id) === bid);
        if (cached) { cached.status = 'bezahlt'; cached.payment_date = r.bookingDate; cached.payment_method = 'Überweisung'; }
        booked++;
      }
    } catch(_) {}
  }

  showToast(`✅ ${booked} von ${toBook.length} Zahlungen gebucht!`, 'success');
  jbBankRenderResults(window._jbBankActiveFilter);
  const banner = document.getElementById('bankStatsBanner');
  if (banner) banner.innerHTML = jbBankStatsBannerHTML();
}
