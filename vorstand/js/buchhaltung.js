// =====================================================================
// MODUL: BUCHHALTUNG & KMU-FINANZBERICHTE
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
      background-color: #f8f9fa !important;
      color: #495057;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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

// Globaler Hook für Navigation (wird aus main.js aufgerufen)
window.renderBuchhaltung = function() {
  const container = document.getElementById('buchhaltung-container');
  if (!container) return;
  
  // Grundgerüst zeichnen
  container.innerHTML = `
    <!-- KPI Header -->
    <div class="row g-3 mb-4" id="bh-kpi-container">
      <div class="col-md-4">
        <div class="bh-metric-card info shadow-sm">
          <div class="small text-muted fw-semibold">Bilanzsumme (Aktiven)</div>
          <h2 class="fw-bold mt-1 mb-0 text-dark" id="bh-kpi-aktiven">CHF 0.00</h2>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card shadow-sm">
          <div class="small text-muted fw-semibold">Verbindlichkeiten & Eigenkapital</div>
          <h2 class="fw-bold mt-1 mb-0 text-dark" id="bh-kpi-passiven">CHF 0.00</h2>
        </div>
      </div>
      <div class="col-md-4">
        <div class="bh-metric-card success shadow-sm" id="bh-kpi-profit-card">
          <div class="small text-muted fw-semibold" id="bh-kpi-profit-label">Netto-Gewinn (2026)</div>
          <h2 class="fw-bold mt-1 mb-0 text-success" id="bh-kpi-profit">CHF 0.00</h2>
        </div>
      </div>
    </div>
    
    <!-- Tab Navigation -->
    <div class="d-flex border-bottom mb-4 align-items-center justify-content-between flex-wrap" style="gap: 10px;">
      <div class="d-flex" style="gap: 5px;">
        <button class="bh-tab-btn ${window._bhActiveTab === 'berichte' ? 'active' : ''}" onclick="bhSwitchTab('berichte')">
          <i class="fas fa-file-invoice-dollar me-1.5"></i> KMU-Finanzberichte
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'journal' ? 'active' : ''}" onclick="bhSwitchTab('journal')">
          <i class="fas fa-list-ul me-1.5"></i> Kassabuch-Journal
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'konten' ? 'active' : ''}" onclick="bhSwitchTab('konten')">
          <i class="fas fa-university me-1.5"></i> Kontenrahmen & Budget
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'analyse' ? 'active' : ''}" onclick="bhSwitchTab('analyse')">
          <i class="fas fa-chart-pie me-1.5"></i> Budget & Jahresvergleich
        </button>
        <button class="bh-tab-btn ${window._bhActiveTab === 'cockpit' ? 'active' : ''}" onclick="bhSwitchTab('cockpit')">
          <i class="fas fa-print me-1.5"></i> GV-Export & Cockpit
        </button>
      </div>
      <div class="d-flex align-items-center mb-2 mb-md-0" style="gap: 10px;">
        <select class="form-select form-select-sm" id="bh-year-select" onchange="bhChangeYear(this.value)" style="width: auto;">
          <option value="2026" ${window._bhYear === 2026 ? 'selected' : ''}>Jahr: 2026</option>
          <option value="2025" ${window._bhYear === 2025 ? 'selected' : ''}>Jahr: 2025</option>
        </select>
        <button class="btn btn-sm btn-primary fw-bold shadow-sm" onclick="bhOpenEntryModal(null)">
          <i class="fas fa-plus me-1"></i> Buchung erfassen
        </button>
      </div>
    </div>
    
    <!-- Content Container -->
    <div id="bh-tab-content-container">
      <!-- Tabs werden hier dynamisch gerendert -->
    </div>
  `;
  
  // Lade Daten und render Inhalt
  loadBuchhaltungData(false);
};

// Lädt alle Buchhaltungsdaten vom Worker
async function loadBuchhaltungData(silent = false) {
  const hasCachedData = window._bhJournal && window._bhJournal.length > 0 && window._bhKontenrahmen && window._bhKontenrahmen.length > 0;
  
  if (!silent) {
    const content = document.getElementById('bh-tab-content-container');
    if (content) {
      if (hasCachedData) {
        // Daten sofort aus Cache rendern, damit es keine Ladeverzögerung/Spinner gibt!
        renderActiveAccountingTab();
      } else {
        content.innerHTML = `
          <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 text-muted">Lade Buchhaltungsdaten aus dem Hauptbuch...</p>
          </div>`;
      }
    }
  }
  
  // Im Hintergrund: Inventar für Pro Memoria Gewehre abrufen
  // Nur für Berechtigte (Kassier / Admin), um API-Fehler zu vermeiden
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
      apiFetch('buchhaltung', 'action=getJournal').then(r => r.json()),
      apiFetch('buchhaltung', 'action=getKontenrahmen').then(r => r.json()),
      apiFetch('buchhaltung', 'action=getBudget').then(r => r.json())
    ]);
    
    if (resJournal.success && resKonten.success && resBudget.success) {
      window._bhJournal = resJournal.data || [];
      window._bhKontenrahmen = resKonten.data || [];
      window._bhBudget = resBudget.data || [];
      
      // Live-Salden der Konten im Speicher berechnen
      recalculateLiveAccountBalances();
      
      // Update KPIs & Render aktiven Tab
      updateAccountingKPIs();
      
      const content = document.getElementById('bh-tab-content-container');
      if (content) {
        renderActiveAccountingTab();
      }
    } else {
      throw new Error(resJournal.error || resKonten.error || resBudget.error || "Unerwarteter API Fehler.");
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
}

// Berechnet die Salden der Konten live im Browser aus dem Journal (inkl. automatischem Vortrag für Bilanzkonten)
function recalculateLiveAccountBalances() {
  const selectedYear = Number(window._bhYear);
  
  // Finde das früheste Buchungsjahr im Journal. Falls leer, nimm das aktuelle Jahr.
  const journalYears = window._bhJournal.map(j => Number(j.jahr || selectedYear));
  const minYear = journalYears.length > 0 ? Math.min(...journalYears) : selectedYear;
  
  window._bhKontenrahmen.forEach(acc => {
    const accountCode = String(acc.konto).trim();
    const isAssetOrLiability = (acc.klasse == '1' || acc.klasse == '2' || String(acc.klasse).toLowerCase().startsWith('akt') || String(acc.klasse).toLowerCase().startsWith('pas'));
    const isAssetOrExpense = (acc.klasse == '1' || acc.klasse == '4' || acc.klasse == '5' || acc.klasse == '6' || acc.klasse == '7' || String(acc.klasse).toLowerCase().startsWith('akt') || String(acc.klasse).toLowerCase().startsWith('auf'));

    // 1. DYNAMISCHEN ERÖFFNUNGSSALDO FÜR DAS GEWÄHLTE JAHR ERMITTELN
    let dynamicOpeningBalance = 0;
    
    if (selectedYear <= minYear) {
      // Erstes Jahr in der Datenbank: Nutze die statischen Werte aus Google Sheets
      dynamicOpeningBalance = Number(acc.eroeffnungssaldo || 0);
    } else {
      if (isAssetOrLiability) {
        // Bilanzkonten (Aktiven/Passiven): Startguthaben + alle Veränderungen aus den Vorjahren
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
        // Erfolgsrechnungskonten (Aufwand/Ertrag) starten jedes Jahr bei 0.00
        dynamicOpeningBalance = 0;
      }
    }
    
    // 2. VERÄNDERUNGEN IM AKTUELLEN BUCHUNGSJAHR
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
    
    // Werte im Objekt speichern
    acc._dynamicEroeffnungssaldo = dynamicOpeningBalance;
    acc._veraenderung = currentYearChange;
    acc._endsaldo = dynamicOpeningBalance + currentYearChange;
  });
}

// Update der KPI Werte ganz oben
function updateAccountingKPIs() {
  let totalAssets = 0;      // Klasse 1 (Aktiven)
  let totalLiabilities = 0; // Klasse 2 (Passiven)
  let totalRevenue = 0;     // Klasse 3 (Erträge)
  let totalExpenses = 0;    // Klasse 4, 5, 6, 7 (Aufwände)
  
  window._bhKontenrahmen.forEach(acc => {
    const k = String(acc.klasse).trim();
    const balance = Number(acc._endsaldo || 0);
    
    if (k === '1' || k.toLowerCase().startsWith('akt')) {
      totalAssets += balance;
    } else if (k === '2' || k.toLowerCase().startsWith('pas')) {
      totalLiabilities += balance;
    } else if (k === '3' || k.toLowerCase().startsWith('ert')) {
      totalRevenue += balance;
    } else if (k === '4' || k === '5' || k === '6' || k === '7' || k.toLowerCase().startsWith('auf')) {
      totalExpenses += balance;
    }
  });
  
  const netIncome = totalRevenue - totalExpenses;
  
  // DOM updaten
  const aktEl = document.getElementById('bh-kpi-aktiven');
  const pasEl = document.getElementById('bh-kpi-passiven');
  const profEl = document.getElementById('bh-kpi-profit');
  const profCard = document.getElementById('bh-kpi-profit-card');
  const profLabel = document.getElementById('bh-kpi-profit-label');
  
  if (aktEl) aktEl.textContent = 'CHF ' + totalAssets.toFixed(2);
  if (pasEl) pasEl.textContent = 'CHF ' + totalLiabilities.toFixed(2);
  
  if (profEl) {
    profEl.textContent = 'CHF ' + Math.abs(netIncome).toFixed(2);
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
}

// Schaltet Tabs um
window.bhSwitchTab = function(tabName) {
  window._bhActiveTab = tabName;
  
  // Buttons updaten
  document.querySelectorAll('.bh-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(`'${tabName}'`)) {
      btn.classList.add('active');
    }
  });
  
  renderActiveAccountingTab();
};

// Ändert das aktive Buchhaltungsjahr
window.bhChangeYear = function(year) {
  window._bhYear = Number(year);
  
  // Salden neu berechnen und UI neu laden
  recalculateLiveAccountBalances();
  updateAccountingKPIs();
  renderActiveAccountingTab();
};

// Rendert den Inhalt des aktiven Tabs
function renderActiveAccountingTab() {
  const content = document.getElementById('bh-tab-content-container');
  if (!content) return;
  
  if (window._bhActiveTab === 'berichte') {
    renderTabBerichte(content);
  } else if (window._bhActiveTab === 'journal') {
    renderTabJournal(content);
  } else if (window._bhActiveTab === 'konten') {
    renderTabKontenrahmen(content);
  } else if (window._bhActiveTab === 'analyse') {
    if (typeof renderTabAnalyse === 'function') {
      renderTabAnalyse(content);
    } else {
      content.innerHTML = `<div class="alert alert-info py-4 text-center"><i class="fas fa-spinner fa-spin me-2"></i> Lade Controlling-Diagramme...</div>`;
    }
  } else if (window._bhActiveTab === 'cockpit') {
    if (typeof renderTabCockpit === 'function') {
      renderTabCockpit(content);
    } else {
      content.innerHTML = `<div class="alert alert-info py-4 text-center"><i class="fas fa-spinner fa-spin me-2"></i> Lade GV-Export & Cockpit...</div>`;
    }
  }
}

// ---------------------------------------------------------------------
// HILFSFUNKTIONEN FÜR GLIEDERUNG, SORTIERUNG & EDITOR
// ---------------------------------------------------------------------

// Swiss KMU Gliederungs-Zuordnung basierend auf Kontopräfixen & Klassen
function bhGetAccountCategory(account) {
  const codeStr = String(account.konto).trim();
  const code = parseInt(codeStr);
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
    } else if (codeStr.startsWith('29')) {
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
  
  if (k === '8') {
    let sub = 'Betriebsfremder Aufwand und Ertrag';
    let detail = 'Steuern';
    if (codeStr.startsWith('81')) {
      sub = 'Betriebsfremder Aufwand und Ertrag';
      detail = 'Betriebsfremder Ertrag';
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
}

// Generiert Sortier-Symbole
function bhGetSortIndicator(activeCol, targetCol, asc) {
  if (activeCol !== targetCol) return '<i class="fas fa-sort text-muted ms-1 small opacity-50"></i>';
  return asc ? '<i class="fas fa-sort-up text-primary ms-1"></i>' : '<i class="fas fa-sort-down text-primary ms-1"></i>';
}

// Sortier-Mechanismus für Kassabuch-Journal
window.bhSortJournal = function(col) {
  if (window._bhJournalSortCol === col) {
    window._bhJournalSortAsc = !window._bhJournalSortAsc;
  } else {
    window._bhJournalSortCol = col;
    window._bhJournalSortAsc = true;
  }
  renderActiveAccountingTab();
};

// Sortier-Mechanismus für Kontenrahmen
window.bhSortKonten = function(col) {
  if (window._bhKontenSortCol === col) {
    window._bhKontenSortAsc = !window._bhKontenSortAsc;
  } else {
    window._bhKontenSortCol = col;
    window._bhKontenSortAsc = true;
  }
  renderActiveAccountingTab();
};

// Rendert Untergruppen-Zeilen und berechnet deren Subsumme
function renderSubgroupRows(accounts, subgroupTitle) {
  if (accounts.length === 0) return '';
  const sum = accounts.reduce((s, acc) => s + Number(acc._endsaldo || 0), 0);
  
  let html = `
    <tr class="table-light">
      <td colspan="3" class="ps-3 fw-bold text-muted small" style="background-color: rgba(15,58,93,0.02);">${subgroupTitle}</td>
    </tr>
  `;
  
  accounts.forEach(acc => {
    // Pro Memoria Liste für Gewehre (Konto 1510 Mobiliar und Einrichtungen)
    let proMemoriaHTML = '';
    if (String(acc.konto).trim() === '1510' && window._bhProMemoriaGewehreCount > 0) {
      const pmVal = window._bhProMemoriaGewehreCount * 0.5;
      proMemoriaHTML = `
        <div class="small text-muted mt-1 ps-2 border-start border-primary" style="font-size: 11px; font-style: italic;">
          <i class="fas fa-crosshairs me-1 text-primary"></i> 
          Pro Memoria (Inventar): ${window._bhProMemoriaGewehreCount} Gewehre (à CHF 0.50 = ${fmtChf(pmVal)})
        </div>
      `;
    }
    
    html += `
      <tr class="bh-detail-row bh-account-row">
        <td class="ps-4 text-muted font-monospace" style="width: 80px;">${acc.konto}</td>
        <td class="ps-3">
          ${acc.bezeichnung}
          ${proMemoriaHTML}
        </td>
        <td class="text-end fw-semibold text-dark">${fmtChf(acc._endsaldo)}</td>
      </tr>
    `;
  });
  
  html += `
    <tr class="bh-subtotal-row">
      <td colspan="2" class="ps-3 text-muted italic">Subtotal ${subgroupTitle}</td>
      <td class="text-end fw-bold text-dark">${fmtChf(sum)}</td>
    </tr>
  `;
  
  return html;
}

// ---------------------------------------------------------------------
// RENDERING: TAB 1 – KMU-FINANZBERICHTE (BILANZ & ERFOLGSRECHNUNG)
// ---------------------------------------------------------------------
function renderTabBerichte(container) {
  // Tree bauen
  const tree = {};
  window._bhKontenrahmen.forEach(acc => {
    const cat = bhGetAccountCategory(acc);
    if (!tree[cat.main]) tree[cat.main] = {};
    if (!tree[cat.main][cat.sub]) tree[cat.main][cat.sub] = {};
    if (!tree[cat.main][cat.sub][cat.detail]) tree[cat.main][cat.sub][cat.detail] = [];
    tree[cat.main][cat.sub][cat.detail].push(acc);
  });
  
  // Rechnerische Summen
  function getClassTotal(mainClass) {
    if (!tree[mainClass]) return 0;
    let total = 0;
    Object.keys(tree[mainClass]).forEach(sub => {
      Object.keys(tree[mainClass][sub]).forEach(detail => {
        tree[mainClass][sub][detail].forEach(acc => {
          total += Number(acc._endsaldo || 0);
        });
      });
    });
    return total;
  }
  
  // Bilanzsummen berechnen
  const totalAktiven = getClassTotal('Aktiven');
  
  // Passiven summen
  const sumFremd = (tree['Passiven'] && tree['Passiven']['Kurzfristiges Fremdkapital'] ? 
    Object.keys(tree['Passiven']['Kurzfristiges Fremdkapital']).reduce((s, d) => s + tree['Passiven']['Kurzfristiges Fremdkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0) +
    (tree['Passiven'] && tree['Passiven']['Langfristiges Fremdkapital'] ? 
    Object.keys(tree['Passiven']['Langfristiges Fremdkapital']).reduce((s, d) => s + tree['Passiven']['Langfristiges Fremdkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0);
    
  const sumEkOhneErgebnis = tree['Passiven'] && tree['Passiven']['Eigenkapital'] ? 
    Object.keys(tree['Passiven']['Eigenkapital']).reduce((s, d) => s + tree['Passiven']['Eigenkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0;
    
  // Erfolgsrechnung summen
  const sumErtrag = getClassTotal('Ertrag');
  const sumAufwand = getClassTotal('Aufwand');
  const gewinnVerlust = sumErtrag - sumAufwand;
  const totalPassiven = sumFremd + sumEkOhneErgebnis + gewinnVerlust;

  // Generiert HTML für Bilanzseite
  function renderClassHTML(mainClass) {
    let html = '';
    if (!tree[mainClass]) return html;
    
    // Sortiere Hauptgruppen
    const subs = Object.keys(tree[mainClass]).sort((a,b) => {
      // Umlaufvermögen vor Anlagevermögen
      if (a.includes('Umlauf')) return -1;
      if (b.includes('Umlauf')) return 1;
      // Kurzfristig vor Langfristig vor Eigenkapital
      if (a.includes('Kurzfristig')) return -1;
      if (b.includes('Kurzfristig')) return 1;
      if (a.includes('Langfristig')) return -1;
      if (b.includes('Langfristig')) return 1;
      return 0;
    });
    
    subs.forEach(sub => {
      html += `<tr class="bh-sub-header"><td colspan="3"><i class="fas fa-folder-open me-2 text-primary"></i>${sub}</td></tr>`;
      
      const details = Object.keys(tree[mainClass][sub]).sort();
      let subSum = 0;
      
      details.forEach(detail => {
        const accounts = tree[mainClass][sub][detail];
        accounts.sort((a, b) => parseInt(a.konto) - parseInt(b.konto));
        
        const detailSum = accounts.reduce((sum, acc) => sum + Number(acc._endsaldo || 0), 0);
        subSum += detailSum;
        
        html += renderSubgroupRows(accounts, detail);
      });
      
      // Für Eigenkapital: Jahresergebnis zum Ausgleich auf der Passivseite einfügen
      if (mainClass === 'Passiven' && sub === 'Eigenkapital') {
        const proMemoriaJahresgewinn = `
          <tr class="bh-detail-row bh-account-row italic">
            <td class="ps-4 text-muted font-monospace" style="width: 80px;">2990</td>
            <td class="ps-3 fw-bold ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">
              <i class="fas ${gewinnVerlust >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} me-1.5"></i>
              Jahresergebnis (Erfolgsrechnung)
            </td>
            <td class="text-end fw-bold ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">${fmtChf(gewinnVerlust)}</td>
          </tr>
          <tr class="bh-subtotal-row">
            <td colspan="2" class="ps-3 text-muted italic">Ergebnis-Übertrag</td>
            <td class="text-end fw-bold ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">${fmtChf(gewinnVerlust)}</td>
          </tr>
        `;
        html += proMemoriaJahresgewinn;
        subSum += gewinnVerlust;
      }
      
      html += `
        <tr class="bh-subtotal-row bg-light" style="border-top: 1.5px solid #6c757d;">
          <td colspan="2" class="fw-bold ps-2 text-primary">Total ${sub}</td>
          <td class="text-end fw-bold text-primary">${fmtChf(subSum)}</td>
        </tr>
      `;
    });
    
    return html;
  }

  // Generiert HTML für Erfolgsrechnungsseite
  function renderErfolgsrechnungHTML(mainClass) {
    let html = '';
    if (!tree[mainClass]) return html;
    
    const subs = Object.keys(tree[mainClass]).sort();
    subs.forEach(sub => {
      const details = Object.keys(tree[mainClass][sub]).sort();
      details.forEach(detail => {
        const accounts = tree[mainClass][sub][detail];
        accounts.sort((a, b) => parseInt(a.konto) - parseInt(b.konto));
        html += renderSubgroupRows(accounts, detail);
      });
    });
    
    return html;
  }
  
  const aktivenHTML = renderClassHTML('Aktiven');
  const passivenHTML = renderClassHTML('Passiven');
  const ertraegeHTML = renderErfolgsrechnungHTML('Ertrag');
  const aufwaendeHTML = renderErfolgsrechnungHTML('Aufwand');
  
  container.innerHTML = `
    <div class="row g-4">
      
      <!-- 1. LIVE-BILANZ (Side-by-Side) -->
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap" style="gap:10px;">
            <h4 class="fw-bold text-primary mb-0"><i class="fas fa-balance-scale me-2"></i>Live-Bilanz (${window._bhYear})</h4>
            <span class="badge bg-primary px-3 py-1.5 fs-7 rounded-pill">Doppelte Buchhaltung</span>
          </div>
          
          <div class="row g-4">
            <!-- Aktiven links -->
            <div class="col-lg-6 border-end">
              <h5 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-arrow-circle-down text-primary me-2"></i>Aktiven (Vermögenswerte)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${aktivenHTML}
                    <tr class="bh-main-total-row">
                      <td colspan="2">TOTAL AKTIVEN</td>
                      <td class="text-end">${fmtChf(totalAktiven)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Passiven rechts -->
            <div class="col-lg-6">
              <h5 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-arrow-circle-up text-success me-2"></i>Passiven (Kapital & Schulden)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${passivenHTML}
                    <tr class="bh-main-total-row">
                      <td colspan="2">TOTAL PASSIVEN</td>
                      <td class="text-end">${fmtChf(totalPassiven)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 2. STRUKTURIERTE ERFOLGSRECHNUNG -->
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap" style="gap:10px;">
            <h4 class="fw-bold text-primary mb-0"><i class="fas fa-chart-line me-2"></i>Erfolgsrechnung (${window._bhYear})</h4>
            <span class="badge ${gewinnVerlust >= 0 ? 'bg-success' : 'bg-danger'} px-3 py-1.5 fs-7 rounded-pill">
              ${gewinnVerlust >= 0 ? 'Reingewinn' : 'Reinverlust'}: ${fmtChf(Math.abs(gewinnVerlust))}
            </span>
          </div>
          
          <div class="row g-4">
            <!-- Ertrag links -->
            <div class="col-lg-6 border-end">
              <h5 class="fw-bold text-success border-bottom pb-2 mb-3"><i class="fas fa-arrow-trend-up me-2"></i>Ertrag (Einnahmen)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ertraegeHTML}
                    <tr class="bh-main-total-row text-success">
                      <td colspan="2">TOTAL ERTRAG</td>
                      <td class="text-end">${fmtChf(sumErtrag)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Aufwand rechts -->
            <div class="col-lg-6">
              <h5 class="fw-bold text-danger border-bottom pb-2 mb-3"><i class="fas fa-arrow-trend-down me-2"></i>Aufwand (Kosten)</h5>
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Konto</th>
                      <th>Bezeichnung</th>
                      <th class="text-end" style="width: 150px;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${aufwaendeHTML}
                    <tr class="bh-main-total-row text-danger">
                      <td colspan="2">TOTAL AUFWAND</td>
                      <td class="text-end">${fmtChf(sumAufwand)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <!-- Erfolgs-Leiste unten -->
          <div class="mt-4 p-3 rounded-3 d-flex justify-content-between align-items-center flex-wrap shadow-sm border" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); gap: 15px;">
            <div>
              <span class="text-muted fw-semibold small">Erfolgsberechnung:</span>
              <h5 class="fw-bold mb-0 text-dark">
                ${fmtChf(sumErtrag)} (Ertrag) &minus; ${fmtChf(sumAufwand)} (Aufwand)
              </h5>
            </div>
            <div class="text-end">
              <span class="text-muted fw-semibold small">Jahresergebnis (${window._bhYear}):</span>
              <h4 class="fw-extrabold mb-0 ${gewinnVerlust >= 0 ? 'text-success' : 'text-danger'}">
                <i class="fas ${gewinnVerlust >= 0 ? 'fa-circle-check' : 'fa-circle-exclamation'} me-1.5"></i>
                ${gewinnVerlust >= 0 ? 'Reingewinn' : 'Reinverlust'}: ${fmtChf(Math.abs(gewinnVerlust))}
              </h4>
            </div>
          </div>
          
        </div>
      </div>
      
    </div>
  `;
}

// ---------------------------------------------------------------------
// RENDERING: TAB 2 – KASSABUCH-JOURNAL (Ledger mit voller Sortierbarkeit)
// ---------------------------------------------------------------------
function renderTabJournal(container) {
  // Scroll-Positionen vor dem Rendern sichern, um ein Springen der Seite/Tabelle nach dem Speichern zu verhindern
  const tableResp = container.querySelector('.table-responsive');
  const tableScrollTop = tableResp ? tableResp.scrollTop : 0;
  const windowScrollTop = window.scrollY || document.documentElement.scrollTop;

  // Hol das Journal für das aktuelle Jahr
  let filteredJournal = window._bhJournal.filter(j => Number(j.jahr) === Number(window._bhYear));
  
  // Sortierung anwenden
  const col = window._bhJournalSortCol;
  const asc = window._bhJournalSortAsc;
  
  filteredJournal.sort((a, b) => {
    let valA = a[col];
    let valB = b[col];
    
    if (col === 'id' || col === 'betrag' || col === 'jahr') {
      valA = Number(valA || 0);
      valB = Number(valB || 0);
    } else {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
    }
    
    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });
  
  // Tabellarische Zeilen rendern
  const journalRows = filteredJournal.map(item => `
    <tr class="bh-account-row">
      <td class="fw-semibold text-muted small">${item.id}</td>
      <td>${isoToDisplay(item.datum)}</td>
      <td class="fw-bold text-dark small">${item.beleg_nr}</td>
      <td class="small fw-semibold">${escapeHtml(item.beschreibung)}</td>
      <td>
        <span class="bh-konto-badge bh-konto-soll-badge">${item.konto_soll}</span> 
        <span class="text-muted ms-1 small">${getAccountNameByCode(item.konto_soll)}</span>
      </td>
      <td>
        <span class="bh-konto-badge bh-konto-haben-badge">${item.konto_haben}</span> 
        <span class="text-muted ms-1 small">${getAccountNameByCode(item.konto_haben)}</span>
      </td>
      <td class="text-end fw-bold text-primary">${fmtChf(item.betrag)}</td>
      <td>
        <span class="badge bg-light text-dark border small">${item.typ || 'Rechnung'}</span>
      </td>
      <td class="text-end" style="white-space: nowrap;">
        <button class="bh-edit-btn" onclick="bhOpenEntryModal(${item.id})" title="Buchung bearbeiten">
          <i class="fas fa-edit"></i>
        </button>
        <button class="bh-edit-btn text-danger ms-1" onclick="bhDeleteJournalEntry(${item.id})" title="Buchung löschen">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <div class="bh-report-section border border-light shadow-sm">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap: 10px;">
        <h4 class="fw-bold text-primary mb-0"><i class="fas fa-receipt me-2"></i>Kassabuch-Journal (${window._bhYear})</h4>
        <div class="d-flex align-items-center" style="gap: 10px;">
          <input type="text" class="form-control form-control-sm" id="bh-journal-search" placeholder="🔎 Beleg suchen..." oninput="bhFilterJournal(this.value)" style="max-width: 220px;">
          <span class="badge bg-secondary p-2 rounded-2">${filteredJournal.length} Buchungen</span>
        </div>
      </div>
      
      <div class="table-responsive" style="max-height: 520px;">
        <table class="table table-hover align-middle bh-table mb-0">
          <thead>
            <tr>
              <th class="bh-sort-header" onclick="bhSortJournal('id')">ID ${bhGetSortIndicator(col, 'id', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('datum')">Datum ${bhGetSortIndicator(col, 'datum', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('beleg_nr')">Beleg-Nr ${bhGetSortIndicator(col, 'beleg_nr', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('beschreibung')">Beschreibung ${bhGetSortIndicator(col, 'beschreibung', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('konto_soll')">Soll-Konto ${bhGetSortIndicator(col, 'konto_soll', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('konto_haben')">Haben-Konto ${bhGetSortIndicator(col, 'konto_haben', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortJournal('betrag')">Betrag ${bhGetSortIndicator(col, 'betrag', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortJournal('typ')">Typ ${bhGetSortIndicator(col, 'typ', asc)}</th>
              <th class="text-end" style="width: 80px;">Aktion</th>
            </tr>
          </thead>
          <tbody id="bh-journal-tbody">
            ${journalRows.length > 0 ? journalRows : '<tr><td colspan="9" class="text-center text-muted py-4">Keine Buchungssätze für dieses Jahr vorhanden.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Scroll-Positionen wiederherstellen
  const tableRespNew = container.querySelector('.table-responsive');
  if (tableRespNew && tableScrollTop) {
    tableRespNew.scrollTop = tableScrollTop;
  }
  window.scrollTo(0, windowScrollTop);
}

// Hilfsfunktion: Sucht den Kontonamen anhand der Nummer
function getAccountNameByCode(code) {
  const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(code).trim());
  return acc ? acc.bezeichnung : 'Unbekannt';
}

// Live filter im Journal
window.bhFilterJournal = function(query) {
  const q = String(query).toLowerCase().trim();
  const rows = document.querySelectorAll('#bh-journal-tbody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    if (text.includes(q)) {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  });
};

// ---------------------------------------------------------------------
// RENDERING: TAB 3 – KONTENRAHMEN & BUDGET (Sortierbar, Bearbeitbar & Löschbar)
// ---------------------------------------------------------------------
function renderTabKontenrahmen(container) {
  // Kopie erstellen und sortieren
  let sortedKonten = [...window._bhKontenrahmen];
  const col = window._bhKontenSortCol;
  const asc = window._bhKontenSortAsc;
  
  sortedKonten.sort((a, b) => {
    let valA, valB;
    if (col === '_veraenderung' || col === '_endsaldo') {
      valA = Number(a[col] || 0);
      valB = Number(b[col] || 0);
    } else if (col === 'eroeffnungssaldo') {
      valA = Number(a._dynamicEroeffnungssaldo || 0);
      valB = Number(b._dynamicEroeffnungssaldo || 0);
    } else if (col === 'budget') {
      const budA = window._bhBudget.find(x => String(x.konto).trim() === String(a.konto).trim());
      const budB = window._bhBudget.find(x => String(x.konto).trim() === String(b.konto).trim());
      valA = Number(budA ? (budA['budget_' + window._bhYear] || 0) : 0);
      valB = Number(budB ? (budB['budget_' + window._bhYear] || 0) : 0);
    } else if (col === 'konto') {
      valA = Number(a.konto || 0);
      valB = Number(b.konto || 0);
    } else {
      valA = String(a[col] || '').toLowerCase();
      valB = String(b[col] || '').toLowerCase();
    }
    
    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });

  const tableRows = sortedKonten.map(acc => {
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    const budgetVal = bud ? Number(bud['budget_' + window._bhYear] || 0) : 0;
    
    let classLabel = 'Aktiven';
    let classColor = 'bg-primary';
    const cat = bhGetAccountCategory(acc);
    if (cat.main === 'Passiven') { classLabel = 'Passiven'; classColor = 'bg-secondary'; }
    if (cat.main === 'Ertrag') { classLabel = 'Ertrag'; classColor = 'bg-success'; }
    if (cat.main === 'Aufwand') { classLabel = 'Aufwand'; classColor = 'bg-danger'; }
    if (cat.main === 'Abschluss') { classLabel = 'Abschluss'; classColor = 'bg-dark'; }
    
    return `
      <tr class="bh-account-row">
        <td><span class="bh-konto-badge">${acc.konto}</span></td>
        <td class="fw-bold text-dark">${acc.bezeichnung}</td>
        <td><span class="badge ${classColor} opacity-75">${classLabel}</span></td>
        <td class="text-end text-muted">${fmtChf(acc._dynamicEroeffnungssaldo)}</td>
        <td class="text-end ${acc._veraenderung >= 0 ? 'text-success' : 'text-danger'}">
          ${acc._veraenderung >= 0 ? '+' : ''}${fmtChf(acc._veraenderung)}
        </td>
        <td class="text-end fw-bold text-primary">${fmtChf(acc._endsaldo)}</td>
        <td class="text-end fw-semibold text-secondary">${budgetVal > 0 ? fmtChf(budgetVal) : '–'}</td>
        <td class="text-end" style="white-space: nowrap;">
          <button class="bh-edit-btn" onclick="bhOpenKontoModal('${acc.konto}')" title="Konto bearbeiten">
            <i class="fas fa-edit"></i>
          </button>
          <button class="bh-edit-btn text-danger ms-1" onclick="bhDeleteKonto('${acc.konto}')" title="Konto löschen">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <div class="bh-report-section border border-light shadow-sm">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap:10px;">
        <h4 class="fw-bold text-primary mb-0"><i class="fas fa-university me-2"></i>KMU-Kontenrahmen & Budget (${window._bhYear})</h4>
        <div class="d-flex align-items-center" style="gap: 10px;">
          <button class="btn btn-sm btn-outline-primary fw-bold shadow-sm" onclick="bhOpenKontoModal(null)">
            <i class="fas fa-plus-circle me-1"></i> Konto hinzufügen
          </button>
          <span class="badge bg-primary px-3 py-2 rounded-2">${window._bhKontenrahmen.length} Konten</span>
        </div>
      </div>
      
      <div class="table-responsive">
        <table class="table table-hover align-middle bh-table mb-0">
          <thead>
            <tr>
              <th class="bh-sort-header" onclick="bhSortKonten('konto')">Konto ${bhGetSortIndicator(col, 'konto', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortKonten('bezeichnung')">Bezeichnung ${bhGetSortIndicator(col, 'bezeichnung', asc)}</th>
              <th class="bh-sort-header" onclick="bhSortKonten('klasse')">Klassifizierung ${bhGetSortIndicator(col, 'klasse', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('eroeffnungssaldo')">Eröffnungssaldo ${bhGetSortIndicator(col, 'eroeffnungssaldo', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('_veraenderung')">Veränderung ${bhGetSortIndicator(col, '_veraenderung', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('_endsaldo')">Endsaldo ${bhGetSortIndicator(col, '_endsaldo', asc)}</th>
              <th class="bh-sort-header text-end" onclick="bhSortKonten('budget')">Budget (${window._bhYear}) ${bhGetSortIndicator(col, 'budget', asc)}</th>
              <th class="text-end" style="width: 80px;">Aktion</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// KONTENRAHMEN-EDITOR: MODAL ERSTELLEN ODER BEARBEITEN
// ---------------------------------------------------------------------
window.bhOpenKontoModal = function(kontoCode) {
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

  if (kontoCode) {
    const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(kontoCode).trim());
    if (acc) {
      // Vorjahres-Ist berechnen
      const prevYearJournal = window._bhJournal.filter(j => Number(j.jahr) === prevYear);
      let balanceChange = 0;
      const isAssetOrExpense = (acc.klasse == '1' || acc.klasse == '4' || acc.klasse == '5' || acc.klasse == '6' || acc.klasse == '7' || String(acc.klasse).toLowerCase().startsWith('akt') || String(acc.klasse).toLowerCase().startsWith('auf'));
      
      prevYearJournal.forEach(entry => {
        const soll = String(entry.konto_soll).trim();
        const haben = String(entry.konto_haben).trim();
        const amount = Number(entry.betrag || 0);
        
        if (soll === String(kontoCode).trim()) {
          balanceChange += isAssetOrExpense ? amount : -amount;
        }
        if (haben === String(kontoCode).trim()) {
          balanceChange += isAssetOrExpense ? -amount : amount;
        }
      });
      prevYearActual = Number(acc.eroeffnungssaldo || 0) + balanceChange;

      // Vorjahres-Budget finden
      const prevBud = window._bhBudget.find(b => String(b.konto).trim() === String(kontoCode).trim());
      prevYearBudget = prevBud ? Number(prevBud['budget_' + prevYear] || 0) : 0;

      // Aktuelles Budget finden
      const bud = window._bhBudget.find(b => String(b.konto).trim() === String(kontoCode).trim());
      budgetVal = bud ? Number(bud['budget_' + window._bhYear] || 0) : 0;

      // Als Basis Vorjahres-Zahlen einsetzen, falls das aktuelle Budget noch 0/leer ist
      if (budgetVal === 0) {
        budgetVal = prevYearActual !== 0 ? prevYearActual : prevYearBudget;
      }
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
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Kontonummer (4-stellig)</label>
              <input type="text" class="form-control fw-bold" id="bhk-konto" required placeholder="z.B. 1000" pattern="^[0-9]{4}$" title="Bitte eine 4-stellige Nummer eingeben.">
              <div class="form-text text-muted small">Eindeutiger 4-stelliger Nummernschlüssel nach KMU.</div>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Bezeichnung</label>
              <input type="text" class="form-control" id="bhk-bezeichnung" required placeholder="z.B. PostFinance">
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Klassifizierung (Klasse)</label>
              <select class="form-select" id="bhk-klasse" required>
                <option value="1">1 - Aktiven (Vermögenswerte)</option>
                <option value="2">2 - Passiven (Fremd- & Eigenkapital)</option>
                <option value="3">3 - Ertrag (Einnahmen)</option>
                <option value="4">4 - Aufwand (Betrieblich/Schiessbetrieb)</option>
                <option value="5">5 - Aufwand (Personal/Entschädigungen)</option>
                <option value="6">6 - Aufwand (Verwaltung/Gebäude/Sonstiges)</option>
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
  const kontoEl = document.getElementById('bhk-konto');
  const bezeichnungEl = document.getElementById('bhk-bezeichnung');
  const klasseEl = document.getElementById('bhk-klasse');
  const saldoEl = document.getElementById('bhk-eroeffnungssaldo');
  
  if (kontoCode) {
    // Bearbeiten-Modus
    titleEl.textContent = 'Sachkonto bearbeiten';
    modeEl.value = 'edit';
    kontoEl.value = kontoCode;
    kontoEl.readOnly = true; // Primärschlüssel sperren
    
    const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(kontoCode).trim());
    if (acc) {
      bezeichnungEl.value = acc.bezeichnung || '';
      
      // Klasse mappen
      let mappedKlasse = '1';
      const k = String(acc.klasse).trim();
      if (k === '2' || k.toLowerCase().startsWith('pas')) mappedKlasse = '2';
      else if (k === '3' || k.toLowerCase().startsWith('ert')) mappedKlasse = '3';
      else if (k === '4') mappedKlasse = '4';
      else if (k === '5') mappedKlasse = '5';
      else if (k === '6' || k.toLowerCase().startsWith('auf')) mappedKlasse = '6';
      klasseEl.value = mappedKlasse;
      
      saldoEl.value = Number(acc.eroeffnungssaldo || 0).toFixed(2);
    }
  } else {
    // Erstellen-Modus
    titleEl.textContent = 'Neues Sachkonto anlegen';
    modeEl.value = 'new';
    kontoEl.value = '';
    kontoEl.readOnly = false;
    bezeichnungEl.value = '';
    klasseEl.value = '1';
    saldoEl.value = '0.00';
  }
  
  const modal = new bootstrap.Modal(modalEl);
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
    bezeichnung: document.getElementById('bhk-bezeichnung').value.trim(),
    klasse: document.getElementById('bhk-klasse').value,
    eroeffnungssaldo: Number(document.getElementById('bhk-eroeffnungssaldo').value || 0)
  };

  const budgetVal = Number(document.getElementById('bhk-budget').value || 0);
  
  try {
    // 1. Speichere das Sachkonto
    const response = await apiFetch('buchhaltung', payload, 'POST');
    const result = await response.json();
    
    if (result.success) {
      // 2. Speichere das Budget
      const budgetPayload = {
        action: 'saveBudget',
        konto: payload.konto,
        bezeichnung: payload.bezeichnung,
        jahr: window._bhYear,
        betrag: budgetVal
      };
      
      const budgetResponse = await apiFetch('buchhaltung', budgetPayload, 'POST');
      const budgetResult = await budgetResponse.json();
      
      if (!budgetResult.success) {
        throw new Error(budgetResult.error || "Fehler beim Speichern des Budgets.");
      }
      
      showSuccess(`🎉 Sachkonto ${payload.konto} (${payload.bezeichnung}) und Budget erfolgreich gespeichert!`);
      
      const modalEl = document.getElementById('bhModalKonto');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      // Daten geräuschlos im Hintergrund neu laden und Tab aktualisieren
      await loadBuchhaltungData(true);
    } else {
      throw new Error(result.error || "Fehler beim Speichern im Backend.");
    }
  } catch (err) {
    alert("❌ Fehler beim Speichern: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Sachkonto speichern';
    }
  }
};


// ---------------------------------------------------------------------
// POPUP-MODAL: MANUELLE BUCHUNG ERFASSEN ODER BEARBEITEN
// ---------------------------------------------------------------------
window.bhOpenEntryModal = function(entryId) {
  let modalEl = document.getElementById('bhModalNewEntry');
  
  // Wenn das Modal noch nicht im DOM ist, dynamisch erstellen
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'bhModalNewEntry';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }
  
  // Optionen für Soll- und Haben-Konten generieren
  const sollOptions = window._bhKontenrahmen.map(acc => 
    `<option value="${acc.konto}">${acc.konto} - ${acc.bezeichnung} (${acc.klasse == '1' ? 'Aktiv' : acc.klasse == '2' ? 'Passiv' : acc.klasse == '3' ? 'Ertrag' : 'Aufwand'})</option>`
  ).join('');
  
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px);">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold" id="bhe-modal-title"><i class="fas fa-receipt me-2"></i>Neue Journalbuchung erfassen</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form id="bh-new-entry-form" onsubmit="bhSaveJournalEntry(event)">
            <input type="hidden" id="bhe-id" value="">
            
            <div class="row g-3 mb-3">
              <div class="col-6">
                <label class="form-label fw-bold small text-muted">Buchungsdatum</label>
                <input type="date" class="form-control" id="bhe-datum" required value="${new Date().toISOString().split('T')[0]}">
              </div>
              <div class="col-6">
                <label class="form-label fw-bold small text-muted">Belegnummer</label>
                <input type="text" class="form-control fw-bold" id="bhe-beleg" required placeholder="z.B. BEL-2026-001">
              </div>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Buchungstext (Beschreibung)</label>
              <input type="text" class="form-control" id="bhe-beschreibung" required placeholder="z.B. Munitionskauf Kaliber .22">
            </div>
            
            <div class="row g-3 mb-3">
              <div class="col-6">
                <label class="form-label fw-bold small text-muted text-primary"><i class="fas fa-long-arrow-alt-right me-1"></i> Soll-Konto (Empfänger)</label>
                <select class="form-select" id="bhe-soll" required>
                  <option value="" disabled selected>Konto wählen...</option>
                  ${sollOptions}
                </select>
              </div>
              <div class="col-6">
                <label class="form-label fw-bold small text-muted text-success"><i class="fas fa-long-arrow-alt-left me-1"></i> Haben-Konto (Quelle)</label>
                <select class="form-select" id="bhe-haben" required>
                  <option value="" disabled selected>Konto wählen...</option>
                  ${sollOptions}
                </select>
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
            
            <div class="d-grid">
              <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm" id="bhe-submit-btn">
                <i class="fas fa-check-circle me-1"></i> Buchungssatz ins Journal schreiben
              </button>
            </div>
            
          </form>
        </div>
      </div>
    </div>
  `;
  
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
    // Edit-Modus
    const entry = window._bhJournal.find(j => Number(j.id) === Number(entryId));
    if (entry) {
      titleEl.innerHTML = `<i class="fas fa-edit me-2"></i>Buchungssatz bearbeiten (ID: ${entryId})`;
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
      sollEl.value = entry.konto_soll || '';
      habenEl.value = entry.konto_haben || '';
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
    }
  } else {
    // Create-Modus
    titleEl.innerHTML = `<i class="fas fa-receipt me-2"></i>Neue Journalbuchung erfassen`;
    idEl.value = '';
    
    // Belegnummer automatisch generieren als Vorschlag
    const maxJournalId = window._bhJournal.reduce((max, current) => Math.max(max, Number(current.id || 0)), 0);
    const nextNumber = String(maxJournalId + 1).padStart(3, '0');
    belegEl.value = `BEL-${window._bhYear}-${nextNumber}`;
  }
  
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

// POST-Request zum Speichern/Aktualisieren des Buchungssatzes
window.bhSaveJournalEntry = async function(event) {
  event.preventDefault();
  
  const submitBtn = document.getElementById('bhe-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Übermittle an Hauptbuch...';
  }
  
  const payload = {
    action:       'saveJournalEntry',
    id:           document.getElementById('bhe-id').value || null,
    jahr:         window._bhYear,
    datum:        document.getElementById('bhe-datum').value,
    beleg_nr:     document.getElementById('bhe-beleg').value.trim(),
    beschreibung: document.getElementById('bhe-beschreibung').value.trim(),
    konto_soll:   document.getElementById('bhe-soll').value,
    konto_haben:  document.getElementById('bhe-haben').value,
    betrag:       Number(document.getElementById('bhe-betrag').value),
    typ:          document.getElementById('bhe-typ').value
  };
  
  // Sicherstellen, dass Soll- und Haben-Konten verschieden sind
  if (payload.konto_soll === payload.konto_haben) {
    alert("❌ Fehler: Soll- und Haben-Konto dürfen nicht identisch sein (Doppelte Buchführung erfordert Gegenkonto)!");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchungssatz ins Journal schreiben';
    }
    return;
  }
  
  try {
    const response = await apiFetch('buchhaltung', payload, 'POST');
    const result = await response.json();
    
    if (result.success) {
      showSuccess(payload.id ? "🎉 Buchungssatz erfolgreich aktualisiert!" : "🎉 Buchungssatz erfolgreich im Journal registriert!");
      
      // Modal schliessen
      const modalEl = document.getElementById('bhModalNewEntry');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      // Lokalen Speicher sofort aktualisieren (Optimistic UI Update)
      if (result.data) {
        const savedEntry = result.data;
        if (payload.id) {
          const idx = window._bhJournal.findIndex(j => Number(j.id) === Number(savedEntry.id));
          if (idx !== -1) {
            window._bhJournal[idx] = savedEntry;
          }
        } else {
          window._bhJournal.push(savedEntry);
        }
        // Sofortige Neuberechnung und UI-Update im Browser
        recalculateLiveAccountBalances();
        updateAccountingKPIs();
        renderActiveAccountingTab();
      }
      
      // Verzögertes Neuladen im Hintergrund (Google Sheets Schreibverzögerung abwarten)
      setTimeout(async () => {
        await loadBuchhaltungData(true);
      }, 1500);
    } else {
      throw new Error(result.error || "Unerwarteter Fehler im Backend.");
    }
  } catch (err) {
    alert("❌ Fehler beim Buchen: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = payload.id ? '<i class="fas fa-save me-1"></i> Änderungen im Journal speichern' : '<i class="fas fa-check-circle me-1"></i> Buchungssatz ins Journal schreiben';
    }
  }
};

// POST-Request zum Löschen eines Buchungssatzes
window.bhDeleteJournalEntry = async function(entryId) {
  const entry = window._bhJournal.find(j => Number(j.id) === Number(entryId));
  if (!entry) return;

  const conf = confirm(`⚠️ Buchungssatz löschen?\n\nMöchten Sie den Buchungssatz (ID: ${entryId}) wirklich unwiderruflich aus dem Journal löschen?\n\nBeleg: ${entry.beleg_nr}\nBetrag: ${fmtChf(entry.betrag)}\nText: ${entry.beschreibung}`);
  if (!conf) return;

  try {
    const response = await apiFetch('buchhaltung', { action: 'deleteJournalEntry', id: entryId }, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess("🎉 Buchungssatz erfolgreich aus dem Journal gelöscht!");
      
      // Lokalen Speicher sofort aktualisieren
      window._bhJournal = window._bhJournal.filter(j => Number(j.id) !== Number(entryId));
      recalculateLiveAccountBalances();
      updateAccountingKPIs();
      renderActiveAccountingTab();
      
      // Verzögertes Neuladen im Hintergrund (Google Sheets Schreibverzögerung abwarten)
      setTimeout(async () => {
        await loadBuchhaltungData(true);
      }, 1500);
    } else {
      throw new Error(result.error || "Unerwarteter Fehler beim Löschen.");
    }
  } catch (err) {
    alert("❌ Fehler beim Löschen der Buchung: " + err.message);
  }
};
