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
window._jbGebuehren = window._jbGebuehren || null;

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

// Supabase Client Access & State
function getJahresbeitragSupabaseClient() {
  if (typeof window.getSupabaseClient === 'function') {
    return window.getSupabaseClient();
  }
  return window.supabaseClient || null;
}
window.getJahresbeitragSupabaseClient = getJahresbeitragSupabaseClient;
window._jahresbeitragIsSupabase = false;

// Mapping Helpers für Supabase PostgreSQL
function mapContributionHeaderFromSupabase(r) {
  return {
    id: String(r.id),
    PersonNumber: String(r.person_number),
    year: Number(r.year),
    status: r.status || 'offen',
    Gesamt: Number(r.gesamt || 0),
    payment_date: r.payment_date,
    payment_method: r.payment_method,
    document_ref: r.document_ref,
    invoiceId: r.invoice_id,
    createdat: r.created_at,
    updatedat: r.updated_at
  };
}

function mapContributionPositionFromSupabase(r) {
  return {
    id: String(r.id),
    headerid: String(r.header_id),
    PersonNumber: String(r.person_number),
    year: Number(r.year),
    position_nr: Number(r.position_nr || 1),
    beschreibung: r.beschreibung || '',
    name: r.beschreibung || '',
    betrag: Number(r.betrag || 0),
    typ: r.typ || 'Debit',
    source_field: r.source_field || '',
    sourcefield: r.source_field || '',
    key: r.source_field || '',
    konto: r.konto || '',
    last_upd: r.last_upd
  };
}

function mapParticipationFromSupabase(r) {
  return {
    id: String(r.id),
    PersonNumber: String(r.person_number),
    year: Number(r.year),
    eventkey: r.event_key,
    teilgenommen: Number(r.teilgenommen || 0),
    quelle: r.quelle || 'schnellerfassung',
    erfasstam: r.erfasst_am,
    erfasstvon: r.erfasst_von
  };
}

function mapGebuehrFromSupabase(r) {
  return {
    key: r.key,
    bezeichnung: r.bezeichnung,
    bezeichnungfrontend: r.bezeichnung_frontend || r.bezeichnung,
    betrag: Number(r.betrag || 0),
    'Haben-Konto-Jahresbeitrag-Buchhaltung': r.konto_haben,
    konto_haben: r.konto_haben,
    konto: r.konto_haben,
    kategorie: r.kategorie || 'Jahresbeitrag',
    sort_order: r.sort_order || 10
  };
}

// ============================================================
// EINSTIEGSPUNKT
// ============================================================
async function loadJahresbeitragData(forceReload = false, showSpinner = true) {
  const container = document.getElementById('jahresbeitrag-container');
  
  // Wenn kein forceReload und Preload läuft, darauf warten
  if (!forceReload && !window._jbAllBeitraege && window._jbPreloadPromise) {
    console.log("⏳ loadJahresbeitragData: Warte auf laufenden Preload im Hintergrund...");
    if (container && showSpinner) {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status"></div>
          <p class="mt-2 text-muted">Lade Beitrags- und Mitgliederdaten (Preload im Hintergrund)…</p>
        </div>`;
    }
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

  if (container && showSpinner) {
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="mt-2 text-muted">Lade Beitrags- und Mitgliederdaten aus Supabase…</p>
      </div>`;
  }

  // 1. SUPABASE-FIRST LADEN
  const supa = getJahresbeitragSupabaseClient();
  if (supa) {
    try {
      const [headRes, posRes, partRes, gebRes] = await Promise.all([
        supa.from('contributions_header').select('*').order('created_at', { ascending: true }),
        supa.from('contributions_positions').select('*').order('position_nr', { ascending: true }),
        supa.from('member_participations').select('*'),
        supa.from('gebuehren_config').select('*').order('sort_order', { ascending: true })
      ]);

      if (!headRes.error && Array.isArray(headRes.data)) {
        console.log(`✅ ${headRes.data.length} Beitragsrechnungen & ${posRes.data?.length || 0} Positionen aus Supabase geladen (< 50 ms).`);
        window._jahresbeitragIsSupabase = true;

        // Sicherstellen, dass Mitglieder da sind
        if (!_jbMembers || _jbMembers.length === 0) {
          if (window._mglData && window._mglData.length > 0) {
            _jbMembers = window._mglData.filter(m => 
              m.Deceased != 1 && 
              (m.IsActive == 1 || m.IsPassive == 1 || m._istPassiv || m.IsHonoraryMember == 1 || m._istEhren)
            );
            _jbMemberMap = {};
            window._mglData.forEach(m => { _jbMemberMap[String(m.PersonNumber)] = m; });
          } else if (typeof loadMitgliederData === 'function') {
            await loadMitgliederData();
            _jbMembers = (window._mglData || []).filter(m => 
              m.Deceased != 1 && 
              (m.IsActive == 1 || m.IsPassive == 1 || m._istPassiv || m.IsHonoraryMember == 1 || m._istEhren)
            );
            _jbMemberMap = {};
            (window._mglData || []).forEach(m => { _jbMemberMap[String(m.PersonNumber)] = m; });
          }
        }

        // Sicherstellen, dass Rechnungen da sind
        if (!window._invoices || window._invoices.length === 0) {
          if (typeof loadRechnungenData === 'function') {
            await loadRechnungenData(true, false);
          }
        }

        window._jbAllBeitraege = headRes.data.map(mapContributionHeaderFromSupabase);
        window._jbAllPositions = (posRes.data || []).map(mapContributionPositionFromSupabase);
        window._jbAllParticipations = (partRes.data || []).map(mapParticipationFromSupabase);
        window._jbGebuehren = (gebRes.data || []).map(mapGebuehrFromSupabase);

        _jbAllBeitraege = window._jbAllBeitraege;
        _jbAllPositions = window._jbAllPositions;
        _jbAllParticipations = window._jbAllParticipations;

        // Für das aktive Jahr filtern
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

        window._jbAllInvoices = window._invoices || [];
        jbMergeInvoicesIntoData(window._jbAllInvoices);

        jbApplyTableSorting();
        jbApplySidebarSorting();
        renderJahresbeitragView();
        return;
      }
      }
      if (headRes.error) throw headRes.error;
    } catch (supaErr) {
      console.error("❌ Supabase Jahresbeitrag Abfrage fehlgeschlagen:", supaErr);
      if (container) {
        container.innerHTML = `<div class="alert alert-danger shadow-sm">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Fehler:</strong> Jahresbeiträge konnten nicht aus Supabase geladen werden: ${supaErr.message || supaErr}
        </div>`;
      }
    }
  } else {
    if (container) {
      container.innerHTML = `<div class="alert alert-danger shadow-sm">
        <i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Konfigurationsfehler:</strong> Supabase Client ist nicht initialisiert.
      </div>`;
    }
  }
}

// ============================================================
// MIGRATIONSSTATUS: ALLE BEITRÄGE IN SUPABASE
// ============================================================
window.syncJahresbeitragFromLegacy = async function() {
  alert("ℹ️ Migration bereits abgeschlossen:\n\nAlle Beitragsrechnungen, Positionen, Turnierteilnahmen und die Gebührenordnung werden direkt über Supabase PostgreSQL verwaltet. Die Google Sheets / GAS-Schnittstelle ist entkoppelt.");
  return;
};

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
  _jbActiveTab = tabName === 'bank' ? 'overview' : tabName;
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
    <div class="d-flex bg-white p-1 rounded shadow-sm mb-4 border" style="max-width: 680px;">
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'overview' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('overview')">
        <i class="fas fa-list-ul me-2"></i> Beitrags-Übersicht
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'entry' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('entry')">
        <i class="fas fa-bolt me-2"></i> Schnellerfassung
      </button>
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'import' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('import')">
        <i class="fas fa-file-excel me-2"></i> Excel-Import
      </button>
      ${canEdit ? `
      <button class="btn flex-fill py-2 text-center rounded border-0 transition fw-semibold ${_jbActiveTab === 'config' ? 'btn-primary text-white' : 'text-muted bg-transparent'}" onclick="jbSwitchTab('config')">
        <i class="fas fa-cog me-2"></i> Gebühren
      </button>` : ''}
    </div>
  `;

  let contentHTML = '';
  
  if (_jbActiveTab === 'overview') {
    contentHTML = renderOverviewTab(canEdit, years);
  } else if (_jbActiveTab === 'entry') {
    contentHTML = renderSchnellerfassungTab();
  } else if (_jbActiveTab === 'import') {
    contentHTML = renderExcelImportTab();
  } else if (_jbActiveTab === 'config') {
    contentHTML = typeof renderGebuehrenConfigTab === 'function' ? renderGebuehrenConfigTab() : '<div class="alert alert-info">Lade Gebührenmodul…</div>';
  }

  document.getElementById('jahresbeitrag-container').innerHTML = tabControlHTML + contentHTML;

  if (_jbActiveTab === 'overview') {
    jbRenderRows(_jbData);
    if (typeof TableKit !== 'undefined' && typeof TableKit.setupColumnToggle === 'function') {
      setTimeout(() => {
        TableKit.setupColumnToggle({
          tableId: 'jbTable',
          dropdownId: 'jbTableColToggleDropdown',
          badgeId: 'jbTableColToggleBadge',
          storageKey: 'portal_jb_overview_cols'
        });
      }, 50);
    }
  } else if (_jbActiveTab === 'entry') {
    jbRenderEntryList();
    jbAddScrollSupport();
    if (_jbSelectedMemberPN && typeof jbEntrySelectMember === 'function') {
      jbEntrySelectMember(_jbSelectedMemberPN);
      setTimeout(() => {
        if (typeof jbScrollToActiveMember === 'function') {
          jbScrollToActiveMember();
        }
      }, 150);
    }
  } else if (_jbActiveTab === 'config') {
    if (typeof jbInitGebuehrenConfig === 'function') jbInitGebuehrenConfig();
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

// Synchronisiert lokale Änderungen sofort in die Caches aller Tabs
window.jbSyncMemberToCache = function(pn, settings) {
  pn = String(pn).trim();
  const m = (_jbMemberMap && _jbMemberMap[pn]) || (_jbMembers || []).find(x => String(x.PersonNumber).trim() === pn);
  if (!m) return;

  if (typeof jbCalculateLiveTotal !== 'function') return;
  const calc = jbCalculateLiveTotal(m, settings);

  // 1. Header in _jbData & _jbAllBeitraege updaten
  let header = (_jbData || []).find(x => String(x.PersonNumber).trim() === pn);
  if (header) {
    header.Gesamt = calc.total;
  }
  if (_jbAllBeitraege) {
    const allHeader = _jbAllBeitraege.find(x => String(x.PersonNumber).trim() === pn && Number(x.year) === Number(_jbYear));
    if (allHeader) allHeader.Gesamt = calc.total;
  }

  // 2. Positions-Cache updaten
  if (header && header.id && _jbPositionsCache) {
    _jbPositionsCache[header.id] = calc.positions.map((p, idx) => ({
      headerid: header.id,
      position_nr: idx + 1,
      name: p.name,
      betrag: p.betrag,
      typ: p.typ,
      sourcefield: p.key || '',
      konto: p.konto || (typeof window.jbResolveAccountForPosition === 'function' ? window.jbResolveAccountForPosition(p.key, p.name) : '')
    }));
  }
};
