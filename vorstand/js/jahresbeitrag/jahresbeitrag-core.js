// vorstand/js/jahresbeitrag/jahresbeitrag-core.js
// ============================================================
// STATE & CONFIG
// ============================================================
window._jbYear = window._jbYear || new Date().getFullYear();
window._jbData = window._jbData || []; // Rechnungs-Header
window._jbMembers = window._jbMembers || []; // Stammdaten aller aktiven Mitglieder
window._jbMemberMap = window._jbMemberMap || {};
window._jbActiveTab = window._jbActiveTab || 'overview'; // 'overview', 'entry', 'import', 'bank'
window._jbSelectedMemberPN = window._jbSelectedMemberPN || null; // Aktive Person in der Schnellerfassung
window._jbEntrySearch = window._jbEntrySearch || ''; // Filter für die Mitgliederliste in der Schnellerfassung
window._jbParticipationsState = window._jbParticipationsState || {}; // Lokale Teilnahmen-Änderungen vor dem Speichern
window._jbImportData = window._jbImportData || null; // Gelesene Excel-Import-Daten
window._jbLocalBulkChanges = window._jbLocalBulkChanges || {}; // Lokale, ungespeicherte Änderungen für die Schnellerfassung
window._jbParticipationsCache = window._jbParticipationsCache || {}; // Lokaler Cache für Turnierteilnahmen: { [pn]: [ ... ] }
window._jbPositionsCache = window._jbPositionsCache || {}; // Lokaler Cache für Rechnungspositionen: { [headerId]: [ ... ] }
window._jbSortCol = window._jbSortCol || 'name'; // Aktuell sortierte Tabellenspalte
window._jbSortAsc = window._jbSortAsc === undefined ? true : window._jbSortAsc; // Sortierrichtung: true (aufsteigend), false (absteigend)
window._jbSidebarSort = window._jbSidebarSort || 'name'; // Sortierung der Seitenleiste
window._jbBankTransactions = window._jbBankTransactions || []; // Parsed CAMT.053 transactions
window._jbBankMatchResults = window._jbBankMatchResults || [];  // Match results after reconciliation

// Komplette globale Caches über alle Jahre hinweg
window._jbAllBeitraege = window._jbAllBeitraege || null;
window._jbAllParticipations = window._jbAllParticipations || null;
window._jbAllPositions = window._jbAllPositions || null;

// Event-Keys Zuordnung für Wettschiessen
const EVENT_KEYS = {
  // Kleinkaliber (50m)
  kk_volksschiessen: 'KK008', // KK008 = Volksschiessen
  kk_verband: 'KK006',
  kk_verein: 'KK007',         // KK007 = Vereinsschiessen
  kk_grenzland: 'KK001',
  ssv_dez_liegend: 'KK002',
  ssv_dez_2stellung: 'KK003',
  ssv_dez_3stellung: 'KK004',
  ssv_dez_sv: 'KK005',
  // Luftgewehr (10m)
  lg_ag_dez: 'LG001',
  lg_ag_dez_auflage: 'LG002',
  lg_ch_dez: 'LG003',
  lg_ch_dez_auflage: 'LG004',
  lg_verband: 'LG005',
  lg_verein: 'LG006',
  lg_ch_kniend: 'LG007'
};

// ============================================================
// EINSTIEGSPUNKT
// ============================================================
async function loadJahresbeitragData(forceReload = false) {
  const container = document.getElementById('jahresbeitrag-container');
  
  // Wenn kein forceReload und Preload läuft, darauf warten
  if (!forceReload && !window._jbAllBeitraege && window._jbPreloadPromise) {
    console.log("⏳ loadJahresbeitragData: Warte auf laufenden Preload im Hintergrund...");
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="mt-2 text-muted">Lade Beitrags- und Mitgliederdaten (Preload im Hintergrund)…</p>
      </div>`;
    try {
      await window._jbPreloadPromise;
    } catch (e) {
      console.error("❌ Fehler beim Warten auf Preload:", e);
    }
  }

  // Wenn Caches bereits geladen sind und kein forceReload erzwungen wird,
  // laden wir direkt und instant aus dem lokalen Speicher!
  if (!forceReload && window._jbAllBeitraege !== null) {
    console.log("⚡ loadJahresbeitragData: Lade aus lokalem Cache...");
    
    _jbData = _jbAllBeitraege.filter(h => Number(h.year) === Number(_jbYear));
    
    _jbParticipationsCache = {};
    _jbAllParticipations.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const pn = String(p.PersonNumber).trim();
        if (!_jbParticipationsCache[pn]) _jbParticipationsCache[pn] = [];
        _jbParticipationsCache[pn].push(p);
      }
    });

    _jbPositionsCache = {};
    _jbAllPositions.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const hid = String(p.headerid).trim();
        if (!_jbPositionsCache[hid]) _jbPositionsCache[hid] = [];
        _jbPositionsCache[hid].push(p);
      }
    });

    // Invoices mergen
    jbMergeInvoicesIntoData(window._jbAllInvoices || []);

    jbApplyTableSorting();
    jbApplySidebarSorting();
    renderJahresbeitragView();
    return;
  }

  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-2 text-muted">Lade Beitrags- und Mitgliederdaten (alle Jahre)…</p>
    </div>`;

  try {
    const [beitraege, members, participations, positions, invoicesRes] = await Promise.all([
      apiFetch('jahresbeitrag', `action=getBeitraege`).then(r => r.json()),
      apiFetch('jahresbeitrag', `action=getMembers`).then(r => r.json()),
      apiFetch('jahresbeitrag', `action=getParticipations`).then(r => r.json()),
      apiFetch('jahresbeitrag', `action=getPositionen`).then(r => r.json()),
      // TODO: Nach Worker-Redeploy auf apiFetch('rechnungen', ...) umstellen
      fetch('https://script.google.com/macros/s/AKfycbweZdRndbQRvQN4tiGjMjzDKo2uO1dsdqfFseuvdnuBdg6xqEbHw9XdIWN8rZU-PO1A/exec?action=getInvoices')
        .then(r => r.json())
        .catch(err => {
          console.warn("⚠️ Fehler beim Abrufen der Rechnungen:", err);
          return { success: false, data: [] };
        })
    ]);

    if (!beitraege.success) throw new Error(beitraege.error);
    if (!members.success)   throw new Error(members.error);
    if (!participations.success) throw new Error(participations.error);
    if (!positions.success) throw new Error(positions.error);

    // Alle aktiven, passiven und ehrenwerten lebenden Mitglieder filtern
    _jbMembers = (members.data || []).filter(m => 
      m.Deceased != 1 && 
      (m.IsActive == 1 || m.IsPassive == 1 || m._istPassiv || m.IsHonoraryMember == 1 || m._istEhren)
    );
    
    _jbMemberMap = {};
    (members.data || []).forEach(m => { 
      _jbMemberMap[String(m.PersonNumber)] = m; 
    });

    // In globalen Caches speichern
    _jbAllBeitraege = beitraege.data || [];
    _jbAllParticipations = participations.data || [];
    _jbAllPositions = positions.positions || [];
    window._jbAllInvoices = invoicesRes.success ? (invoicesRes.data || []) : [];

    // Für das aktive Jahr filtern
    _jbData = _jbAllBeitraege.filter(h => Number(h.year) === Number(_jbYear));

    // Turnierteilnahmen-Cache aufbauen (nur für das aktive Jahr)
    _jbParticipationsCache = {};
    _jbAllParticipations.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const pn = String(p.PersonNumber).trim();
        if (!_jbParticipationsCache[pn]) _jbParticipationsCache[pn] = [];
        _jbParticipationsCache[pn].push(p);
      }
    });

    // Rechnungspositionen-Cache aufbauen (nur für das aktive Jahr)
    _jbPositionsCache = {};
    _jbAllPositions.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const hid = String(p.headerid).trim();
        if (!_jbPositionsCache[hid]) _jbPositionsCache[hid] = [];
        _jbPositionsCache[hid].push(p);
      }
    });
    
    // Invoices mergen
    jbMergeInvoicesIntoData(window._jbAllInvoices);

    // Sortierungen anwenden
    jbApplyTableSorting();
    jbApplySidebarSorting();
    
    renderJahresbeitragView();
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  }
}

// Invoices aus Rechnungen_GAS mit den Beitrags-Header-Einträgen mergen
function jbMergeInvoicesIntoData(invoices) {
  if (!invoices || !Array.isArray(invoices)) return;
  _jbData.forEach(r => {
    r.pdf_url = '';
    r.mail_status = 'entwurf';
    r.invoiceId = '';
    
    const match = invoices.find(inv => 
      String(inv.PersonNumber).trim() === String(r.PersonNumber).trim() && 
      Number(inv.year) === Number(r.year) && 
      String(inv.type).toLowerCase() === 'jahresbeitrag'
    );
    
    if (match) {
      r.pdf_url = match.pdf_url || '';
      r.mail_status = match.mail_status || 'entwurf';
      r.invoiceId = match.id || '';
      
      // Falls in Rechnungen_GAS bezahlt, synchronisieren wir den Status im Frontend
      if (match.status === 'bezahlt' && r.status !== 'bezahlt') {
        r.status = 'bezahlt';
        r.payment_date = match.payment_date;
        r.payment_method = match.payment_method;
        r.document_ref = match.document_ref;
      }
    }
  });
}

// ============================================================
// SWITCH TABS
// ============================================================
function jbSwitchTab(tabName) {
  _jbActiveTab = tabName;
  renderJahresbeitragView();
}

// ============================================================
// RENDER GENERAL VIEW
// ============================================================
function renderJahresbeitragView() {
  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 4; y--) years.push(y);

  const canEdit = (window.currentRoles || []).some(r => ['admin','kassier','schuetzenmeister'].includes(r));

  // Tab Navigation Controls
  const tabControlHTML = `
    <div class="d-flex bg-white p-1 rounded shadow-sm mb-4 border" style="max-width: 720px;">
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'overview' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('overview')">
        <i class="fas fa-list-ul me-2"></i> Beitrags-Übersicht
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'entry' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('entry')">
        <i class="fas fa-bolt me-2"></i> Schnellerfassung
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'import' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('import')">
        <i class="fas fa-file-excel me-2"></i> Excel-Import
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'bank' ? 'btn-success text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('bank')">
        <i class="fas fa-university me-2"></i> Bankabgleich
      </button>
    </div>
  `;

  let contentHTML = '';
  
  if (_jbActiveTab === 'overview') {
    contentHTML = renderOverviewTab(canEdit, years);
  } else if (_jbActiveTab === 'entry') {
    contentHTML = renderSchnellerfassungTab();
  } else if (_jbActiveTab === 'import') {
    contentHTML = renderExcelImportTab();
  } else if (_jbActiveTab === 'bank') {
    contentHTML = renderBankabgleichTab();
  }

  document.getElementById('jahresbeitrag-container').innerHTML = tabControlHTML + contentHTML;

  if (_jbActiveTab === 'overview') {
    jbRenderRows(_jbData);
  } else if (_jbActiveTab === 'entry') {
    jbRenderEntryList();
    jbAddScrollSupport();
  } else if (_jbActiveTab === 'bank') {
    jbBankRenderResults();
  }
}

function jbChangeYear(year) {
  _jbYear = Number(year);
  
  if (_jbAllBeitraege) {
    _jbData = _jbAllBeitraege.filter(h => Number(h.year) === Number(_jbYear));
  }
  
  if (_jbAllParticipations) {
    _jbParticipationsCache = {};
    _jbAllParticipations.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const pn = String(p.PersonNumber).trim();
        if (!_jbParticipationsCache[pn]) _jbParticipationsCache[pn] = [];
        _jbParticipationsCache[pn].push(p);
      }
    });
  }

  if (_jbAllPositions) {
    _jbPositionsCache = {};
    _jbAllPositions.forEach(p => {
      if (Number(p.year) === Number(_jbYear)) {
        const hid = String(p.headerid).trim();
        if (!_jbPositionsCache[hid]) _jbPositionsCache[hid] = [];
        _jbPositionsCache[hid].push(p);
      }
    });
  }

  // Sortierungen anwenden
  jbApplyTableSorting();
  jbApplySidebarSorting();
  
  renderJahresbeitragView();
}
