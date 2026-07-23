// =====================================================================
// MODUL: BUCHHALTUNG & KMU-FINANZBERICHTE - CORE
// =====================================================================

// Globale State-Variablen für Buchhaltung
window._bhJournal = [];
window._bhKontenrahmen = [];
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
  return 'CHF ' + Number(val || 0).toFixed(2);
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
    }
    .bh-account-row:hover {
      background-color: rgba(0,0,0,0.015) !important;
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

// Lädt alle Buchhaltungsdaten vom Worker
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
          <p class="mt-2 text-muted">Lade Buchhaltungsdaten aus dem Hauptbuch...</p>
        </div>`;
    }
  }
  
  try {
    const resInv = await apiFetch('inventar', 'action=getInventarData').then(r => r.json());
    if (resInv && resInv.gewehre) {
      window._bhProMemoriaGewehreCount = resInv.gewehre.length;
    }
  } catch (e) {
    console.warn("⚠️ Inventar-Daten für Pro Memoria konnten nicht geladen werden:", e);
  }
  
  try {
    const [resJournal, resKonten, resBudget] = await Promise.all([
      apiFetch('buchhaltung', 'action=getJournal'),
      apiFetch('buchhaltung', 'action=getKontenrahmen'),
      apiFetch('buchhaltung', 'action=getBudget')
    ]);

    const txtJournal = await resJournal.text();
    const txtKonten = await resKonten.text();
    const txtBudget = await resBudget.text();

    let dataJournal, dataKonten, dataBudget;
    try {
      dataJournal = JSON.parse(txtJournal);
      dataKonten = JSON.parse(txtKonten);
      dataBudget = JSON.parse(txtBudget);
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
      window._bhBudget = dataBudget.data || [];

      if (window._bhBankTransactions && window._bhBankTransactions.length > 0 && typeof bhBankMatchAll === 'function') {
        window._bhBankMatchResults = bhBankMatchAll(window._bhBankTransactions);
      }
      
      recalculateLiveAccountBalances();
      
      const yearSelect = document.getElementById('bh-year-select');
      if (yearSelect) {
        const yearsSet = new Set(window._bhJournal.map(j => Number(j.jahr || window._bhYear)));
        yearsSet.add(2026);
        yearsSet.add(2025);
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
        renderActiveAccountingTab();
      }
    } else {
      throw new Error(dataJournal.error || dataKonten.error || dataBudget.error || "Unerwarteter API Fehler.");
    }
  } catch (err) {
    console.error("❌ Fehler beim Laden der Buchhaltungsdaten:", err);
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
  }
};

// Berechnet die Salden der Konten live im Browser
window.recalculateLiveAccountBalances = function() {
  const selectedYear = Number(window._bhYear);
  
  const journalYears = window._bhJournal.map(j => Number(j.jahr || selectedYear));
  const minYear = journalYears.length > 0 ? Math.min(...journalYears) : selectedYear;
  
  window._bhKontenrahmen.forEach(acc => {
    const accountCode = String(acc.konto).trim();
    const isAssetOrLiability = (acc.klasse == '1' || acc.klasse == '2' || String(acc.klasse).toLowerCase().startsWith('akt') || String(acc.klasse).toLowerCase().startsWith('pas'));
    const isAssetOrExpense = (acc.klasse == '1' || acc.klasse == '4' || acc.klasse == '5' || acc.klasse == '6' || acc.klasse == '7' || String(acc.klasse).toLowerCase().startsWith('akt') || String(acc.klasse).toLowerCase().startsWith('auf'));

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
  
  const aktEl = document.getElementById('bh-kpi-aktiven');
  const pasEl = document.getElementById('bh-kpi-passiven');
  const profEl = document.getElementById('bh-kpi-profit');
  const profCard = document.getElementById('bh-kpi-profit-card');
  const profLabel = document.getElementById('bh-kpi-profit-label');
  
  if (aktEl) aktEl.innerHTML = '<span class="currency-label">CHF</span> ' + totalAssets.toFixed(2);
  if (pasEl) pasEl.innerHTML = '<span class="currency-label">CHF</span> ' + totalLiabilities.toFixed(2);
  
  if (profEl) {
    profEl.innerHTML = '<span class="currency-label">CHF</span> ' + Math.abs(netIncome).toFixed(2);
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

// Swiss KMU Gliederungs-Zuordnung
window.bhGetAccountCategory = function(account) {
  const codeStr = String(account.konto).trim();
  const k = codeStr[0]; // Klasse
  
  if (k === '1') {
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
    } else if (codeStr.startsWith('119')) {
      sub = 'Umlaufvermögen';
      detail = 'Transitkonten';
    } else if (codeStr.startsWith('14') || codeStr.startsWith('15')) {
      sub = 'Anlagevermögen';
      detail = 'Mobile Sachanlagen';
    }
    return { main: 'Aktiven', sub, detail };
  }
  
  if (k === '2') {
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
  
  if (k === '3') {
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
  
  if (k === '8') {
    let sub = 'Betriebsfremder Aufwand und Ertrag';
    let detail = 'Steuern';
    if (codeStr.startsWith('80') || codeStr.startsWith('81')) {
      sub = 'Betriebsfremder Aufwand und Ertrag';
      detail = 'Betriebsfremder Ertrag';
      return { main: 'Ertrag', sub, detail };
    } else if (codeStr.startsWith('89')) {
      sub = 'Direkte Steuern';
      detail = 'Steuern';
    }
    return { main: 'Aufwand', sub, detail };
  }
  
  if (k === '9') {
    return { main: 'Abschluss', sub: 'Abschluss', detail: 'Erfolgsrechnung' };
  }
  
  return { main: 'Unbekannt', sub: 'Sonstige', detail: 'Sonstige Konten' };
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
  
  if (s.startsWith('119') || h.startsWith('119')) {
    return 'TRANSIT';
  }
  if (s.startsWith('3') || h.startsWith('3') || s.startsWith('80') || h.startsWith('80') || s.startsWith('81') || h.startsWith('81')) {
    return 'ERTRAG';
  }
  if (s.startsWith('4') || h.startsWith('4') || s.startsWith('5') || h.startsWith('5') || s.startsWith('6') || h.startsWith('6') || s.startsWith('7') || h.startsWith('7') || s.startsWith('89') || h.startsWith('89')) {
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
