// =====================================================================
// MODUL: BUCHHALTUNG & KMU-FINANZBERICHTE - CORE
// =====================================================================

// Globale State-Variablen für Buchhaltung
window._bhJournal = [];
try {
  const cachedKonten = localStorage.getItem('bh_kontenrahmen');
  window._bhKontenrahmen = cachedKonten ? JSON.parse(cachedKonten) : [];
} catch(_) {
  window._bhKontenrahmen = [];
}
window._bhBudget = [];
window._bhYear = new Date().getFullYear();
window._bhActiveTab = 'berichte'; // 'berichte' | 'journal' | 'konten'

// Sortier-Zustände
window._bhJournalSortCol = 'id';
window._bhJournalSortAsc = false;
window._bhKontenSortCol = 'konto';
window._bhKontenSortAsc = true;

// Pro Memoria Gewehre Zähler
window._bhProMemoriaGewehreCount = 0;

// Währungsformatierungs-Hilfsfunktion
window.fmtChf = window.fmtChf || function(val) {
  const num = Number(val || 0);
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return 'CHF ' + parts.join('.');
};

// CSS dynamisch für Buchhaltung injizieren
if (!document.getElementById('buchhaltung-module-styles')) {
  const style = document.createElement('style');
  style.id = 'buchhaltung-module-styles';
  style.textContent = `
    .bh-metric-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      border-left: 5px solid var(--primary);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .bh-metric-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.06);
    }
    .bh-metric-card.success { border-left-color: #198754; }
    .bh-metric-card.danger { border-left-color: #dc3545; }
    .bh-metric-card.info { border-left-color: #0dcaf0; }
    
    .bh-tab-btn {
      border: none;
      background: transparent;
      color: #6c757d;
      padding: 10px 16px;
      font-weight: 600;
      font-size: 14px;
      border-bottom: 3px solid transparent;
      transition: all 0.2s ease;
    }
    .bh-tab-btn:hover {
      color: var(--primary);
      background: rgba(15,58,93,0.02);
    }
    .bh-tab-btn.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      background: rgba(15,58,93,0.04);
      border-radius: 6px 6px 0 0;
    }
    
    .bh-table th {
      position: sticky;
      top: 0;
      z-index: 10;
      background-color: #f8f9fa !important;
      color: #495057;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: inset 0 -1px 0 rgba(0,0,0,0.1);
    }
    
    .bh-account-row {
      transition: background-color 0.15s ease;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
    }
    .bh-account-row:hover {
      background-color: rgba(13, 110, 253, 0.07) !important;
    }
    .bh-account-row:focus {
      outline: 2px solid #0d6efd !important;
      outline-offset: -2px;
      position: relative;
      z-index: 1;
    }
    .bh-account-row.bh-row-selected {
      background-color: #e7f1ff !important;
      box-shadow: inset 4px 0 0 #0d6efd !important;
      font-weight: 500;
    }
    .bh-account-row.bh-row-selected:focus {
      outline: 2px solid #0a58ca !important;
      outline-offset: -2px;
    }
    
    .bh-konto-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 4px;
      background-color: #e9ecef;
      color: #495057;
      font-family: monospace;
    }
    .bh-konto-soll-badge {
      background-color: rgba(13,110,253,0.1);
      color: #0d6efd;
    }
    .bh-konto-haben-badge {
      background-color: rgba(25,135,84,0.1);
      color: #198754;
    }
    
    .bh-report-section {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    }
    
    .bh-total-line {
      font-weight: 800;
      border-top: 2px solid #343a40;
      border-bottom: 2px double #343a40;
      background-color: #f8f9fa;
    }
    
    .bh-sort-header {
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s ease;
    }
    .bh-sort-header:hover {
      background-color: #e9ecef !important;
    }
    
    .bh-sub-header {
      background-color: #f8f9fa;
      font-weight: 700;
      color: #0f3a5d;
      font-size: 13px;
      border-bottom: 1.5px solid #dee2e6;
    }
    
    .bh-detail-row {
      font-size: 13px;
    }
    .bh-detail-row td {
      padding-top: 6px !important;
      padding-bottom: 6px !important;
    }
    
    .bh-subtotal-row {
      font-weight: 700;
      background-color: rgba(0,0,0,0.01);
      border-top: 1px solid #dee2e6;
      border-bottom: 1px solid #dee2e6;
      font-size: 13px;
    }
    .bh-subtotal-row td {
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }
    
    .bh-main-total-row {
      font-weight: 800;
      background-color: #f1f3f5;
      border-top: 2px solid #343a40;
      border-bottom: 2px double #343a40;
      font-size: 14px;
    }
    .bh-main-total-row td {
      padding-top: 10px !important;
      padding-bottom: 10px !important;
    }
    
    .bh-edit-btn {
      color: #6c757d;
      border: none;
      background: transparent;
      padding: 2px 6px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .bh-edit-btn:hover {
      background-color: rgba(15,58,93,0.08);
      color: var(--primary);
    }
  `;
  document.head.appendChild(style);
}

// Accessor für Supabase Client im Buchhaltungs-Modul
function getBuchhaltungSupabaseClient() {
  if (typeof window.getSupabaseClient === 'function') {
    return window.getSupabaseClient();
  }
  return window.supabaseClient || null;
}
window.getBuchhaltungSupabaseClient = getBuchhaltungSupabaseClient;

// Lädt alle Buchhaltungsdaten (Supabase-First mit GAS-Fallback)
window.loadBuchhaltungData = async function(silent = false, forceReload = false) {
  const hasCachedData = window._bhJournal && window._bhJournal.length > 0 && window._bhKontenrahmen && window._bhKontenrahmen.length > 0;
  
  if (!forceReload && hasCachedData) {
    console.log("⚡ loadBuchhaltungData: Lade aus lokalem Cache...");
    const content = document.getElementById('bh-tab-content-container');
    if (content) {
      renderActiveAccountingTab();
    }
    return;
  }

  if (!silent && !hasCachedData) {
    const content = document.getElementById('bh-tab-content-container');
    if (content) {
      content.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status"></div>
          <p class="mt-2 text-muted">Lade Buchhaltungsdaten (Supabase Master)...</p>
        </div>`;
    }
  }

  const supa = getBuchhaltungSupabaseClient();
  let loadedFromSupabase = false;

  if (supa) {
    try {
      console.log("🚀 Lade Buchhaltungsdaten aus Supabase...");
      const [accRes, jnlRes, budRes, ruleRes] = await Promise.all([
        supa.from('accounting_accounts').select('*').order('sort_order', { ascending: true }),
        supa.from('accounting_journal').select('*').order('id', { ascending: false }),
        supa.from('accounting_budgets').select('*'),
        supa.from('accounting_bank_rules').select('*').order('sort_order', { ascending: true }),
        (async () => {
          try {
            // Pro Memoria Gewehre aus inventar_items falls vorhanden
            const r = await supa.from('inventar_items').select('id, typ').ilike('typ', '%gewehr%');
            if (r.data) window._bhProMemoriaGewehreCount = r.data.length;
          } catch (_) {}
        })()
      ]);

      if (!accRes.error && !jnlRes.error && Array.isArray(accRes.data) && accRes.data.length > 0) {
        window._bhKontenrahmen = accRes.data.map((a, idx) => ({
          ...a,
          _rowIndex: idx + 2
        }));
        window._bhJournal = (jnlRes.data || []).map(j => ({
          ...j,
          id: Number(j.id),
          jahr: Number(j.jahr),
          betrag: Number(j.betrag)
        }));

        // Budgets in Matrix/Map-Format überführen für Abwärtskompatibilität
        const rawBudgets = budRes.data || [];
        const budgetMap = {};
        rawBudgets.forEach(b => {
          const k = String(b.konto).trim();
          if (!budgetMap[k]) {
            const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === k);
            budgetMap[k] = { konto: k, bezeichnung: acc ? acc.bezeichnung : '' };
          }
          budgetMap[k]['budget_' + b.jahr] = Number(b.betrag || 0);
        });
        window._bhBudget = Object.values(budgetMap);

        if (!ruleRes.error && Array.isArray(ruleRes.data)) {
          window._bhBankServerRules = ruleRes.data;
          try {
            localStorage.setItem('bh_bank_rules', JSON.stringify(ruleRes.data));
          } catch(_) {}
        }

        try {
          localStorage.setItem('bh_kontenrahmen', JSON.stringify(window._bhKontenrahmen));
        } catch(_) {}

        window._bhIsSupabase = true;
        loadedFromSupabase = true;
        console.log(`✅ Buchhaltung erfolgreich aus Supabase geladen: ${window._bhKontenrahmen.length} Konten, ${window._bhJournal.length} Journal-Einträge.`);
      }
    } catch (supaErr) {
      console.warn("⚠️ Supabase Buchhaltung Abfrage fehlgeschlagen, versuche Legacy GAS:", supaErr);
    }
  }

  // Fallback auf GAS, falls Supabase noch leer ist oder nicht erreichbar war
  if (!loadedFromSupabase) {
    console.log("ℹ️ Lade Buchhaltungsdaten via Google Apps Script (Fallback)...");
    window._bhIsSupabase = false;

    try {
      const [resJournal, resKonten, resBudget, resRules] = await Promise.all([
        apiFetch('buchhaltung', 'action=getJournal'),
        apiFetch('buchhaltung', 'action=getKontenrahmen'),
        apiFetch('buchhaltung', 'action=getBudget'),
        apiFetch('buchhaltung', 'action=getBankRules'),
        apiFetch('inventar', 'action=getInventarData').then(r => r.json()).then(resInv => {
          if (resInv && resInv.gewehre) {
            window._bhProMemoriaGewehreCount = resInv.gewehre.length;
          }
        }).catch(e => {
          console.warn("⚠️ Inventar-Daten für Pro Memoria konnten nicht geladen werden:", e);
        })
      ]);

      const txtJournal = await resJournal.text();
      const txtKonten = await resKonten.text();
      const txtBudget = await resBudget.text();
      const txtRules = await resRules.text();

      let dataJournal, dataKonten, dataBudget, dataRules;
      try {
        dataJournal = JSON.parse(txtJournal);
        dataKonten = JSON.parse(txtKonten);
        dataBudget = JSON.parse(txtBudget);
        dataRules = JSON.parse(txtRules);
      } catch (_) {
        console.error('❌ Buchhaltung API: HTML statt JSON erhalten.');
        const content = document.getElementById('bh-tab-content-container');
        if (content) {
          content.innerHTML = `
            <div class="alert alert-warning">
              <h5>⚠️ Backend nicht erreichbar</h5>
              <p>Das Google Apps Script für <strong>Buchhaltung</strong> gibt kein JSON zurück. Mögliche Ursachen:</p>
              <ul>
                <li>Das Script ist noch nicht als <strong>Web App</strong> deployed</li>
                <li>Die URL im <code>worker.js</code> ist inkorrekt oder abgelaufen</li>
                <li>Ein Berechtigungs- oder Quotenlimit bei Google wurde überschritten</li>
              </ul>
              <details class="mt-2">
                <summary class="small text-muted">Technische Details (Journal-Antwort)</summary>
                <pre class="small mt-2 bg-light p-2 rounded">${escapeHtml(txtJournal.slice(0, 500))}</pre>
              </details>
            </div>`;
        }
        return;
      }
      
      if (dataJournal.success && dataKonten.success && dataBudget.success) {
        window._bhJournal = dataJournal.data || [];
        window._bhKontenrahmen = dataKonten.data || [];
        try {
          localStorage.setItem('bh_kontenrahmen', JSON.stringify(dataKonten.data || []));
        } catch(_) {}
        window._bhBudget = dataBudget.data || [];

        if (dataRules && dataRules.success && Array.isArray(dataRules.data)) {
          window._bhBankServerRules = dataRules.data;
          try {
            localStorage.setItem('bh_bank_rules', JSON.stringify(dataRules.data));
          } catch(_) {}
        }
      } else {
        throw new Error(dataJournal.error || dataKonten.error || dataBudget.error || "Unerwarteter API Fehler.");
      }
    } catch (err) {
      console.error("❌ Fehler beim Laden der Buchhaltungsdaten via GAS:", err);
      if (!silent || !hasCachedData) {
        const content = document.getElementById('bh-tab-content-container');
        if (content) {
          content.innerHTML = `
            <div class="alert alert-danger shadow-sm rounded-3">
              <i class="fas fa-exclamation-triangle me-2"></i>
              <strong>Verbindungsfehler:</strong> Die Buchhaltungsdaten konnten nicht geladen werden.
              <br><small class="text-muted">${err.message}</small>
            </div>`;
        }
      }
      return;
    }
  }

  // Gemeinsame Nachbearbeitung (Live-Berechnungen, Filter, KPI)
  if (window._bhBankTransactions && window._bhBankTransactions.length > 0 && typeof bhBankMatchAll === 'function') {
    window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
  }
  
  recalculateLiveAccountBalances();
  
  const yearSelect = document.getElementById('bh-year-select');
  if (yearSelect) {
    const yearsSet = new Set((window._bhJournal || []).map(j => Number(j.jahr || window._bhYear)));
    yearsSet.add(2026);
    yearsSet.add(2025);
    yearsSet.add(2024);
    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    
    let selectHTML = '';
    sortedYears.forEach(yr => {
      selectHTML += `<option value="${yr}" ${window._bhYear === yr ? 'selected' : ''}>Jahr: ${yr}</option>`;
    });
    yearSelect.innerHTML = selectHTML;
  }
  
  updateAccountingKPIs();
  
  const content = document.getElementById('bh-tab-content-container');
  if (content) {
    const active = document.activeElement;
    const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
    if (isTyping && (window._bhActiveTab === 'bank' || window._bhActiveTab === 'bankabgleich')) {
      console.log('⚡ loadBuchhaltungData: Nutzer editiert gerade ein Feld im Bankabgleich, überspringe Tab-Neuaufbau.');
    } else {
      renderActiveAccountingTab();
    }
  }
};

// =====================================================================
// 1-KLICK DATENMIGRATION: GOOGLE SHEET -> SUPABASE
// =====================================================================
window.migrateBuchhaltungFromGoogleSheets = async function() {
  if (!confirm("Möchtest du alle Konten, Journal-Buchungen, Budgets und Bank-Regeln jetzt aus dem Google Sheet nach Supabase importieren? Bestehende Daten in Supabase werden dabei synchronisiert.")) {
    return;
  }
  const supa = getBuchhaltungSupabaseClient();
  if (!supa) {
    alert("❌ Supabase-Client nicht initialisiert. Bitte Seite neu laden.");
    return;
  }
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay("Lese Daten aus Google Sheets (GAS)...");

  try {
    const [resJnl, resKto, resBud, resRules] = await Promise.all([
      apiFetch('buchhaltung', 'action=getJournal').then(r => r.json()),
      apiFetch('buchhaltung', 'action=getKontenrahmen').then(r => r.json()),
      apiFetch('buchhaltung', 'action=getBudget').then(r => r.json()),
      apiFetch('buchhaltung', 'action=getBankRules').then(r => r.json()).catch(() => ({ success: false, data: [] }))
    ]);

    if (!resKto.success || !resJnl.success) {
      throw new Error("Fehler beim Abruf der Daten aus Google Sheets: " + (resKto.error || resJnl.error));
    }

    const rawKonten = resKto.data || [];
    const rawJournal = resJnl.data || [];
    const rawBudget = resBud.data || [];
    const rawRules = (resRules && resRules.success) ? (resRules.data || []) : [];

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay(`Übertrage ${rawKonten.length} Konten nach Supabase...`);
    const accountsMap = new Map();
    rawKonten.forEach((k, idx) => {
      const acc = String(k.konto || '').trim();
      if (!acc) return;
      accountsMap.set(acc, {
        konto: acc,
        bezeichnung: String(k.bezeichnung || '').trim(),
        klasse: String(k.klasse || '').trim(),
        eroeffnungssaldo: Number(k.eroeffnungssaldo || 0),
        sort_order: (idx + 1) * 10
      });
    });

    // Sicherheit: Prüfe, ob im Journal verwendete Konten im Kontenrahmen fehlen (z.B. Konto 3800 für Spenden/Aufrundungen)
    rawJournal.forEach(j => {
      [j.konto_soll, j.konto_haben].forEach(rawAcc => {
        const acc = String(rawAcc || '').trim();
        if (acc && !accountsMap.has(acc)) {
          let bezeichnung = 'Sammelkonto ' + acc;
          let klasse = 'Ertrag';
          if (acc === '3800') {
            bezeichnung = 'Sponsoring, Gönner & Spenden';
            klasse = 'Ertrag';
          } else if (acc.startsWith('1')) {
            klasse = 'Aktiven';
          } else if (acc.startsWith('2')) {
            klasse = 'Passiven';
          } else if (acc.startsWith('3')) {
            klasse = 'Ertrag';
          } else if (/^[4-8]/.test(acc)) {
            klasse = 'Aufwand';
          }
          accountsMap.set(acc, {
            konto: acc,
            bezeichnung: bezeichnung,
            klasse: klasse,
            eroeffnungssaldo: 0,
            sort_order: parseInt(acc, 10) || 9999
          });
          console.warn(`ℹ️ Konto ${acc} wurde im Journal gefunden, fehlte aber im Kontenrahmen. Automatisch als ${klasse} angelegt.`);
        }
      });
    });

    const accountsToUpsert = Array.from(accountsMap.values());

    if (accountsToUpsert.length > 0) {
      const { error: accErr } = await supa.from('accounting_accounts').upsert(accountsToUpsert, { onConflict: 'konto' });
      if (accErr) throw new Error("Fehler beim Speichern der Konten: " + accErr.message);
    }

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay(`Übertrage ${rawJournal.length} Journal-Einträge nach Supabase...`);
    // Chunks à 100 Zeilen
    for (let i = 0; i < rawJournal.length; i += 100) {
      const chunk = rawJournal.slice(i, i + 100).map(j => ({
        id: Number(j.id),
        jahr: Number(j.jahr || new Date().getFullYear()),
        datum: j.datum || new Date().toISOString().slice(0, 10),
        beleg_nr: String(j.beleg_nr || ''),
        beschreibung: String(j.beschreibung || ''),
        konto_soll: String(j.konto_soll || '').trim(),
        konto_haben: String(j.konto_haben || '').trim(),
        betrag: Number(j.betrag || 0),
        typ: String(j.typ || 'Kassa'),
        buchungstyp: String(j.buchungstyp || 'TRANSIT')
      })).filter(j => j.konto_soll && j.konto_haben && j.betrag > 0);

      if (chunk.length > 0) {
        const { error: jnlErr } = await supa.from('accounting_journal').upsert(chunk, { onConflict: 'id' });
        if (jnlErr) throw new Error("Fehler beim Speichern der Buchungssätze: " + jnlErr.message);
      }
    }

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay(`Übertrage Budgets nach Supabase...`);
    const budgetsToUpsert = [];
    rawBudget.forEach(b => {
      const k = String(b.konto || '').trim();
      if (!k) return;
      Object.keys(b).forEach(prop => {
        if (prop.startsWith('budget_')) {
          const yr = parseInt(prop.replace('budget_', ''), 10);
          const amt = Number(b[prop] || 0);
          if (!isNaN(yr) && amt !== 0) {
            budgetsToUpsert.push({
              konto: k,
              jahr: yr,
              betrag: amt
            });
          }
        }
      });
    });

    if (budgetsToUpsert.length > 0) {
      const { error: budErr } = await supa.from('accounting_budgets').upsert(budgetsToUpsert, { onConflict: 'konto,jahr' });
      if (budErr) console.warn("Warnung beim Budget-Sync:", budErr.message);
    }

    if (rawRules.length > 0) {
      if (typeof showLoadingOverlay === 'function') showLoadingOverlay(`Übertrage ${rawRules.length} Bank-Regeln nach Supabase...`);
      const rulesToUpsert = rawRules.map((r, idx) => ({
        label: String(r.label || ''),
        pattern_party: String(r.pattern_party || ''),
        pattern_text: String(r.pattern_text || ''),
        prefix: String(r.prefix || ''),
        soll: String(r.soll || ''),
        haben: String(r.haben || ''),
        pattern: String(r.pattern || ''),
        scope: String(r.scope || 'all'),
        amount_mode: String(r.amount_mode || 'any'),
        amount_min: (r.amount_min !== '' && r.amount_min !== undefined && r.amount_min !== null) ? Number(r.amount_min) : null,
        amount_max: (r.amount_max !== '' && r.amount_max !== undefined && r.amount_max !== null) ? Number(r.amount_max) : null,
        sort_order: (idx + 1) * 10
      })).filter(r => r.label);

      if (rulesToUpsert.length > 0) {
        await supa.from('accounting_bank_rules').delete().neq('label', '___dummy___');
        const { error: ruleErr } = await supa.from('accounting_bank_rules').insert(rulesToUpsert);
        if (ruleErr) console.warn("Warnung beim Bankregeln-Sync:", ruleErr.message);
      }
    }

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    alert(`✅ Erfolgreich nach Supabase migriert:\n• ${rawKonten.length} Konten\n• ${rawJournal.length} Buchungen\n• ${budgetsToUpsert.length} Budgetwerte\n• ${rawRules.length} Bank-Regeln`);
    await window.loadBuchhaltungData(false, true);
  } catch (err) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error("❌ Fehler bei Migration Google Sheets -> Supabase:", err);
    alert("❌ Fehler bei der Migration: " + err.message);
  }
};

// Berechnet die Salden der Konten live im Browser
window.recalculateLiveAccountBalances = function() {
  const selectedYear = Number(window._bhYear);
  
  const journalYears = window._bhJournal.map(j => Number(j.jahr || selectedYear));
  const minYear = journalYears.length > 0 ? Math.min(...journalYears) : selectedYear;
  
  window._bhKontenrahmen.forEach(acc => {
    const accountCode = String(acc.konto).trim();
    const cat = window.bhGetAccountCategory ? window.bhGetAccountCategory(acc) : { main: '' };
    const isAssetOrLiability = (cat.main === 'Aktiven' || cat.main === 'Passiven');
    const isAssetOrExpense = (cat.main === 'Aktiven' || cat.main === 'Aufwand');

    let dynamicOpeningBalance = 0;
    
    if (selectedYear <= minYear) {
      dynamicOpeningBalance = Number(acc.eroeffnungssaldo || 0);
    } else {
      if (isAssetOrLiability) {
        let accumulatedPriorChanges = 0;
        const priorJournal = window._bhJournal.filter(j => Number(j.jahr) >= minYear && Number(j.jahr) < selectedYear);
        
        priorJournal.forEach(entry => {
          const soll = String(entry.konto_soll).trim();
          const haben = String(entry.konto_haben).trim();
          const amount = Number(entry.betrag || 0);
          
          if (soll === accountCode) {
            accumulatedPriorChanges += isAssetOrExpense ? amount : -amount;
          }
          if (haben === accountCode) {
            accumulatedPriorChanges += isAssetOrExpense ? -amount : amount;
          }
        });
        
        dynamicOpeningBalance = Number(acc.eroeffnungssaldo || 0) + accumulatedPriorChanges;
      } else {
        dynamicOpeningBalance = 0;
      }
    }
    
    let currentYearChange = 0;
    const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === selectedYear);
    
    currentYearJournal.forEach(entry => {
      const soll = String(entry.konto_soll).trim();
      const haben = String(entry.konto_haben).trim();
      const amount = Number(entry.betrag || 0);
      
      if (soll === accountCode) {
        currentYearChange += isAssetOrExpense ? amount : -amount;
      }
      if (haben === accountCode) {
        currentYearChange += isAssetOrExpense ? -amount : amount;
      }
    });
    
    acc._dynamicEroeffnungssaldo = dynamicOpeningBalance;
    acc._veraenderung = currentYearChange;
    acc._endsaldo = dynamicOpeningBalance + currentYearChange;
  });
};

// Update der KPI Werte ganz oben
window.updateAccountingKPIs = function() {
  let totalAssets = 0;      // Klasse 1 (Aktiven)
  let totalLiabilities = 0; // Klasse 2 (Passiven)
  let totalRevenue = 0;     // Klasse 3 & 8 (Erträge)
  let totalExpenses = 0;    // Klasse 4, 5, 6, 7 & 8 (Aufwände)
  
  window._bhKontenrahmen.forEach(acc => {
    const cat = bhGetAccountCategory(acc);
    const balance = Number(acc._endsaldo || 0);
    
    if (cat.main === 'Aktiven') {
      totalAssets += balance;
    } else if (cat.main === 'Passiven') {
      totalLiabilities += balance;
    } else if (cat.main === 'Ertrag') {
      totalRevenue += balance;
    } else if (cat.main === 'Aufwand') {
      totalExpenses += balance;
    }
  });
  
  const netIncome = totalRevenue - totalExpenses;
  const totalPassivenWithIncome = totalLiabilities + netIncome;
  
  const aktEl = document.getElementById('bh-kpi-aktiven');
  const pasEl = document.getElementById('bh-kpi-passiven');
  const profEl = document.getElementById('bh-kpi-profit');
  const profCard = document.getElementById('bh-kpi-profit-card');
  const profLabel = document.getElementById('bh-kpi-profit-label');
  
  if (aktEl) aktEl.innerHTML = '<span class="currency-label">CHF</span> ' + fmtChf(totalAssets).replace('CHF ', '');
  if (pasEl) pasEl.innerHTML = '<span class="currency-label">CHF</span> ' + fmtChf(totalPassivenWithIncome).replace('CHF ', '');
  
  if (profEl) {
    profEl.innerHTML = '<span class="currency-label">CHF</span> ' + fmtChf(Math.abs(netIncome)).replace('CHF ', '');
    if (netIncome >= 0) {
      profEl.className = 'fw-bold mt-1 mb-0 text-success';
      if (profCard) {
        profCard.className = 'bh-metric-card success shadow-sm';
      }
      if (profLabel) profLabel.textContent = `Netto-Gewinn (${window._bhYear})`;
    } else {
      profEl.className = 'fw-bold mt-1 mb-0 text-danger';
      if (profCard) {
        profCard.className = 'bh-metric-card danger shadow-sm';
      }
      if (profLabel) profLabel.textContent = `Netto-Verlust (${window._bhYear})`;
    }
  }
};

// Swiss KMU Gliederungs-Zuordnung unter Berücksichtigung der Google Tabelle (Kontenrahmen)
window.bhGetAccountCategory = function(account) {
  if (!account) return { main: 'Unbekannt', sub: 'Sonstige', detail: 'Sonstige Konten' };

  const codeStr = String(account.konto || '').trim();
  const rawKlasse = String(account.klasse || '').trim();
  const kLower = rawKlasse.toLowerCase();
  const bezLower = String(account.bezeichnung || '').toLowerCase();
  
  // 1. Zuerst die explizite Klassifizierung aus der Google Tabelle prüfen
  let explicitMain = null;
  if (kLower.startsWith('akt') || rawKlasse === '1') explicitMain = 'Aktiven';
  else if (kLower.startsWith('pas') || rawKlasse === '2') explicitMain = 'Passiven';
  else if (kLower.startsWith('ert') || rawKlasse === '3') explicitMain = 'Ertrag';
  else if (kLower.startsWith('auf') || ['4', '5', '6', '7'].includes(rawKlasse)) explicitMain = 'Aufwand';
  else if (kLower.startsWith('abs') || rawKlasse === '9') explicitMain = 'Abschluss';

  // Klasse 8 Fallback / Erkennung (In KMU Klasse 8 gibt es Aufwand & Ertrag)
  if (!explicitMain && (rawKlasse === '8' || codeStr.startsWith('8'))) {
    if (bezLower.includes('ertrag') || codeStr.startsWith('81') || codeStr.startsWith('857')) {
      explicitMain = 'Ertrag';
    } else {
      explicitMain = 'Aufwand';
    }
  }

  const k = codeStr[0]; // 1. Ziffer der Kontonummer
  
  // Bestimme Hauptkategorie, Subkategorie und Detail basierend auf Schweizer KMU
  if (explicitMain === 'Aktiven' || (!explicitMain && k === '1')) {
    let sub = 'Umlaufvermögen';
    let detail = 'Übrige kurzfristige Forderungen';
    if (codeStr.startsWith('10')) {
      sub = 'Umlaufvermögen';
      detail = 'Flüssige Mittel';
    } else if (codeStr.startsWith('110')) {
      sub = 'Umlaufvermögen';
      detail = 'Forderungen aus Lieferungen und Leistungen';
    } else if (codeStr.startsWith('114')) {
      sub = 'Umlaufvermögen';
      detail = 'Übrige kurzfristige Forderungen';
    } else if (codeStr.startsWith('13') || codeStr.startsWith('119')) {
      sub = 'Umlaufvermögen';
      detail = 'Transitorische Aktiven / Transitkonten';
    } else if (codeStr.startsWith('14') || codeStr.startsWith('15')) {
      sub = 'Anlagevermögen';
      detail = 'Mobile Sachanlagen';
    }
    return { main: 'Aktiven', sub, detail };
  }
  
  if (explicitMain === 'Passiven' || (!explicitMain && k === '2')) {
    let sub = 'Kurzfristiges Fremdkapital';
    let detail = 'Verbindlichkeiten aus Lieferungen und Leistungen';
    if (codeStr.startsWith('200') || codeStr.startsWith('2000')) {
      sub = 'Kurzfristiges Fremdkapital';
      detail = 'Verbindlichkeiten aus Lieferungen und Leistungen';
    } else if (codeStr.startsWith('203')) {
      sub = 'Kurzfristiges Fremdkapital';
      detail = 'Noch nicht verbucht (Kreditoren)';
    } else if (codeStr.startsWith('24')) {
      sub = 'Langfristiges Fremdkapital';
      detail = 'Langfristiges Fremdkapital';
    } else if (codeStr.startsWith('28') || codeStr.startsWith('29')) {
      sub = 'Eigenkapital';
      detail = 'Grund-, Gesellschafter- oder Stiftungskapital';
    }
    return { main: 'Passiven', sub, detail };
  }
  
  if (explicitMain === 'Ertrag' || (!explicitMain && k === '3')) {
    let sub = 'Dienstleistungen';
    let detail = 'Beiträge Mitglieder';
    if (codeStr.startsWith('341')) {
      sub = 'Dienstleistungen';
      detail = 'Beiträge Mitglieder';
    } else if (codeStr.startsWith('342')) {
      sub = 'Dienstleistungen';
      detail = 'Beiträge Öffentlicher Bereich';
    } else if (codeStr.startsWith('361')) {
      sub = 'Übrige Erlöse aus Lieferungen und Leistungen';
      detail = 'Erträge aus Veranstaltungen';
    } else if (codeStr.startsWith('365')) {
      sub = 'Übrige Erlöse aus Lieferungen und Leistungen';
      detail = 'Diverse betriebliche Erträge';
    } else if (codeStr.startsWith('34')) {
      sub = 'Dienstleistungen';
      detail = 'Dienstleistungen Erträge';
    } else if (k === '8' || codeStr.startsWith('8')) {
      sub = 'Betriebsfremder, ausserordentlicher Ertrag';
      detail = codeStr.startsWith('81') ? 'Finanzertrag / Zinsertrag' : (account.bezeichnung || 'Ausserordentlicher Ertrag');
    } else {
      sub = 'Übrige Erlöse aus Lieferungen und Leistungen';
      detail = 'Diverse betriebliche Erträge';
    }
    return { main: 'Ertrag', sub, detail };
  }
  
  if (k === '4') {
    let sub = 'Materialaufwand';
    let detail = 'Materialaufwand Wirtschaft';
    if (codeStr.startsWith('40')) {
      sub = 'Materialaufwand Wirtschaft';
      detail = 'Materialaufwand Wirtschaft';
    } else if (codeStr.startsWith('41')) {
      sub = 'Schiessbetrieb';
      detail = 'Schiessbetrieb';
    } else if (codeStr.startsWith('42')) {
      sub = 'Jungschützen';
      detail = 'Jungschützen';
    } else if (codeStr.startsWith('441')) {
      sub = 'Aufwand für bezogene Dienstleistungen';
      detail = 'Beiträge';
    } else if (codeStr.startsWith('442')) {
      sub = 'Aufwand für bezogene Dienstleistungen';
      detail = 'G50m';
    } else if (codeStr.startsWith('443')) {
      sub = 'Aufwand für bezogene Dienstleistungen';
      detail = 'G10m & Meisterschaften';
    } else if (codeStr.startsWith('44')) {
      sub = 'Aufwand für bezogene Dienstleistungen';
      detail = 'Beiträge';
    }
    return { main: 'Aufwand', sub, detail };
  }

  if (k === '5') {
    let sub = 'Personalaufwand';
    let detail = 'Entschädigungen Vorstand / Übriges';
    if (codeStr.startsWith('50')) {
      sub = 'Personalaufwand';
      detail = 'Entschädigungen';
    }
    return { main: 'Aufwand', sub, detail };
  }
  
  if (k === '6') {
    let sub = 'Sonstiger betrieblicher Aufwand';
    let detail = 'Unterhalt Gebäude & Umgebung';
    if (codeStr.startsWith('60')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Unterhalt Gebäude & Umgebung';
    } else if (codeStr.startsWith('61')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Versicherungen';
    } else if (codeStr.startsWith('62')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Energie- und Entsorgungsaufwand';
    } else if (codeStr.startsWith('65')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Verwaltungs- und Informatikaufwand';
    } else if (codeStr.startsWith('67')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Sonstiger betrieblicher Aufwand';
    } else if (codeStr.startsWith('690')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Finanzaufwand';
    } else if (codeStr.startsWith('695')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Finanzertrag';
    } else if (codeStr.startsWith('69')) {
      sub = 'Sonstiger betrieblicher Aufwand';
      detail = 'Finanzaufwand';
    }
    return { main: 'Aufwand', sub, detail };
  }

  if (k === '7') {
    let sub = 'Betrieblicher Nebenerfolg';
    let detail = 'Finanzaufwand / Nebenerfolg';
    return { main: 'Aufwand', sub, detail };
  }
  
  if (explicitMain === 'Aufwand' || (!explicitMain && k === '8')) {
    let sub = 'Betriebsfremder Aufwand und Ertrag';
    let detail = 'Betriebsfremder Aufwand';
    if (codeStr.startsWith('89')) {
      sub = 'Direkte Steuern';
      detail = 'Kantons- und Gemeindesteuern';
    } else if (codeStr.startsWith('87')) {
      sub = 'Steuern & Abgaben';
      detail = 'Steuern';
    } else if (codeStr.startsWith('80')) {
      sub = 'Anlagenunterhalt';
      detail = 'Unterhalt & Umgebung';
    } else if (codeStr.startsWith('83')) {
      sub = 'Versicherungen';
      detail = 'Sach- & Haftpflicht';
    } else if (codeStr.startsWith('84')) {
      sub = 'Energie';
      detail = 'Energie & Wasser';
    } else if (codeStr.startsWith('85')) {
      sub = 'Verwaltung';
      detail = 'Verwaltungsaufwand';
    }
    return { main: 'Aufwand', sub, detail };
  }
  
  if (explicitMain === 'Abschluss' || (!explicitMain && k === '9')) {
    return { main: 'Abschluss', sub: 'Abschluss', detail: 'Erfolgsrechnung' };
  }
  
  return { main: explicitMain || 'Unbekannt', sub: 'Sonstige', detail: 'Sonstige Konten' };
};

// Generiert Sortier-Symbole
window.bhGetSortIndicator = function(activeCol, targetCol, asc) {
  if (activeCol !== targetCol) return '<i class="fas fa-sort text-muted ms-1 small opacity-50"></i>';
  return asc ? '<i class="fas fa-sort-up text-primary ms-1"></i>' : '<i class="fas fa-sort-down text-primary ms-1"></i>';
};

// Hilfsfunktion zur Ermittlung des Buchungstyps im Frontend
window.getBuchungstyp = function(soll, haben) {
  const s = String(soll || '').trim();
  const h = String(haben || '').trim();
  
  if (s.startsWith('13') || h.startsWith('13') || s.startsWith('119') || h.startsWith('119')) {
    return 'TRANSIT';
  }

  // Zuerst im geladenen Kontenrahmen nachsehen
  const konten = window._bhKontenrahmen || [];
  const accS = konten.find(a => String(a.konto).trim() === s);
  const accH = konten.find(a => String(a.konto).trim() === h);

  if (accS || accH) {
    const catS = accS ? window.bhGetAccountCategory(accS) : null;
    const catH = accH ? window.bhGetAccountCategory(accH) : null;
    if ((catS && catS.main === 'Ertrag') || (catH && catH.main === 'Ertrag')) {
      return 'ERTRAG';
    }
    if ((catS && catS.main === 'Aufwand') || (catH && catH.main === 'Aufwand')) {
      return 'AUFWAND';
    }
  }

  // Fallback anhand Kontonummern
  if (s.startsWith('3') || h.startsWith('3') || s.startsWith('81') || h.startsWith('81') || s.startsWith('857') || h.startsWith('857')) {
    return 'ERTRAG';
  }
  if (s.startsWith('4') || h.startsWith('4') || s.startsWith('5') || h.startsWith('5') || s.startsWith('6') || h.startsWith('6') || s.startsWith('7') || h.startsWith('7') || s.startsWith('8') || h.startsWith('8')) {
    return 'AUFWAND';
  }
  if (s.startsWith('100') || h.startsWith('100')) {
    return 'KASSE';
  }
  if (s.startsWith('102') || h.startsWith('102')) {
    return 'BANK';
  }
  if (s.startsWith('110') || h.startsWith('110')) {
    return 'DEBITOR';
  }
  return 'TRANSIT';
};
