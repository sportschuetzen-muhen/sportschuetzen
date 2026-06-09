// =====================================================================
// MODUL: BUCHHALTUNG - CONTROLLING & GRAPHICAL ANALYTICS
// =====================================================================

// Globale Referenzen für Diagramm-Instanzen, um Overlaps zu verhindern
window._bhCharts = {
  yoyChart: null,
  budgetChart: null,
  cashflowChart: null,
  revenueStructureChart: null,
  expenseStructureChart: null,
  yoyCostChart: null
};

// Zentraler Render-Hook für den Controlling-Tab
window.renderTabAnalyse = function(container) {
  if (!container) return;
  
  // 1. Grid-Layout zeichnen
  container.innerHTML = `
    <!-- Top-Reihe: 2 Grafiken (YoY Trend & Budgetvergleich) -->
    <div class="row g-4 mb-4">
      <div class="col-lg-7">
        <div class="bh-report-section shadow-sm border border-light h-100">
          <h5 class="fw-bold text-primary mb-3">
            <i class="fas fa-chart-bar me-2"></i>Mehrjahres-Entwicklung (Erfolgstrend)
          </h5>
          <div style="position: relative; height: 300px; width: 100%;">
            <canvas id="bhYoYChart"></canvas>
          </div>
          <div class="small text-muted mt-2 text-center">
            Vergleich von Gesamtertrag, Gesamtaufwand und Unternehmenserfolg über alle erfassten Jahre.
          </div>
        </div>
      </div>
      
      <div class="col-lg-5">
        <div class="bh-report-section shadow-sm border border-light h-100">
          <h5 class="fw-bold text-primary mb-3">
            <i class="fas fa-chart-pie me-2"></i>Budget vs. Ist (${window._bhYear})
          </h5>
          <div style="position: relative; height: 300px; width: 100%;">
            <canvas id="bhBudgetChart"></canvas>
          </div>
          <div class="small text-muted mt-2 text-center">
            Soll/Ist-Vergleich der operativen Ertrags- und Aufwandsgruppen.
          </div>
        </div>
      </div>
    </div>
    
    <!-- Mittlere Reihe: Monatlicher Cashflow -->
    <div class="row g-4 mb-4">
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light">
          <h5 class="fw-bold text-primary mb-3">
            <i class="fas fa-money-bill-wave me-2"></i>Monatlicher Liquiditäts-Cashflow (${window._bhYear})
          </h5>
          <div style="position: relative; height: 280px; width: 100%;">
            <canvas id="bhCashflowChart"></canvas>
          </div>
          <div class="small text-muted mt-2 text-center">
            Einzahlungen (Soll-Buchungen auf Kassa/Bank) vs. Auszahlungen (Haben-Buchungen auf Kassa/Bank).
          </div>
        </div>
      </div>
    </div>
    
    <!-- Untere Reihe: Detaillierte Soll/Ist Controlling-Tabelle -->
    <div class="row g-4">
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light">
          <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap:10px;">
            <h5 class="fw-bold text-primary mb-0">
              <i class="fas fa-tasks me-2"></i>Soll/Ist-Vergleich & Budget-Ausschöpfung (${window._bhYear})
            </h5>
            <span class="badge bg-primary px-3 py-1.5 rounded-pill" id="bh-controlling-perf-badge">Lade Analyse...</span>
          </div>
          
          <div class="table-responsive">
            <table class="table table-hover align-middle bh-table mb-0">
              <thead>
                <tr>
                  <th>Kategorie / Gruppe</th>
                  <th>Typ</th>
                  <th class="text-end">Tatsächlich (Ist)</th>
                  <th class="text-end">Budgetiert (Soll)</th>
                  <th class="text-end">Differenz (CHF)</th>
                  <th style="width: 250px;">Ausschöpfung / Erreichung</th>
                </tr>
              </thead>
              <tbody id="bh-controlling-table-tbody">
                <!-- Dynamische Reihen werden hier gerendert -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 2. Diagramme und Tabelle zeichnen
  setTimeout(() => {
    bhRenderYoYChart();
    bhRenderBudgetChart();
    bhRenderCashflowChart();
    bhRenderControllingTable();
  }, 100);
};

// Diagramm E: Mehrjahres-Kostenstruktur-Trend (2000 - 2026)
function bhRenderYoYChart() {
  const canvas = document.getElementById('bhYoYChart');
  if (!canvas) return;
  
  // Extrahiere alle Jahre aus dem Journal
  const jahreSet = new Set(window._bhJournal.map(j => Number(j.jahr || window._bhYear)));
  jahreSet.add(window._bhYear);
  const jahre = Array.from(jahreSet).sort((a,b) => a - b);
  
  const schiessbetriebData = [];
  const gebaeudeData = [];
  const verwaltungData = [];
  const uebrigeData = [];
  
  jahre.forEach(yr => {
    let yrSchiess = 0;
    let yrGebaeude = 0;
    let yrVerwaltung = 0;
    let yrUebrige = 0;
    
    const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === yr);
    
    window._bhKontenrahmen.forEach(acc => {
      const code = String(acc.konto).trim();
      const cat = bhGetAccountCategory(acc);
      
      let balanceChange = 0;
      currentYearJournal.forEach(entry => {
        const soll = String(entry.konto_soll).trim();
        const haben = String(entry.konto_haben).trim();
        const amount = Number(entry.betrag || 0);
        
        if (soll === code) balanceChange += amount;
        if (haben === code) balanceChange -= amount;
      });
      
      const balance = Math.abs(balanceChange); // Expenses are positive values
      
      if (cat.main === 'Aufwand') {
        if (code.startsWith('41') || code.startsWith('42') || code.startsWith('44')) {
          yrSchiess += balance;
        } else if ((code.startsWith('60') && code !== '6011') || code.startsWith('62') || code.startsWith('63') || code.startsWith('64')) {
          yrGebaeude += balance; // Explicitly exclude Wasserschaden 6011!
        } else if (code.startsWith('65') || code.startsWith('67') || code.startsWith('69') || code.startsWith('89')) {
          yrVerwaltung += balance;
        } else {
          yrUebrige += balance;
        }
      }
    });
    
    schiessbetriebData.push(Math.max(0, yrSchiess));
    gebaeudeData.push(Math.max(0, yrGebaeude));
    verwaltungData.push(Math.max(0, yrVerwaltung));
    uebrigeData.push(Math.max(0, yrUebrige));
  });
  
  if (window._bhCharts.yoyChart) window._bhCharts.yoyChart.destroy();
  
  window._bhCharts.yoyChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: jahre.map(y => `Jahr ${y}`),
      datasets: [
        {
          label: 'Munition & Schiessbetrieb',
          data: schiessbetriebData,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Gebäude & Schützenhaus (exkl. Wasserschaden)',
          data: gebaeudeData,
          borderColor: '#198754',
          backgroundColor: 'rgba(25, 135, 84, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Verwaltung & Spesen',
          data: verwaltungData,
          borderColor: '#0d6efd',
          backgroundColor: 'rgba(13, 110, 253, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Übrige Aufwände',
          data: uebrigeData,
          borderColor: '#fd7e14',
          backgroundColor: 'rgba(253, 126, 20, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: value => 'CHF ' + value.toLocaleString('de-CH') }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: CHF ${context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`
          }
        }
      }
    }
  });
}

// Diagramm 2: Budget vs. Ist für Hauptbereiche
function bhRenderBudgetChart() {
  const canvas = document.getElementById('bhBudgetChart');
  if (!canvas) return;
  
  // Finde das Budget-Jahr
  const activeBudgetCol = `budget_${window._bhYear}`;
  
  // Gruppiere nach Major-Sparten
  const categories = {
    'Mitglieder':  { ist: 0, soll: 0, isExpense: false },
    'Sponsoren':   { ist: 0, soll: 0, isExpense: false },
    'Vermietung':  { ist: 0, soll: 0, isExpense: false },
    'Übriger Ertrag': { ist: 0, soll: 0, isExpense: false },
    'Schiessbetrieb': { ist: 0, soll: 0, isExpense: true },
    'Jungschützen': { ist: 0, soll: 0, isExpense: true },
    'Gebäude & SH': { ist: 0, soll: 0, isExpense: true },
    'Verwaltung/IT': { ist: 0, soll: 0, isExpense: true },
    'Übriger Aufwand': { ist: 0, soll: 0, isExpense: true }
  };
  
  window._bhKontenrahmen.forEach(acc => {
    const codeStr = String(acc.konto).trim();
    const istVal = Number(acc._endsaldo || 0);
    const cat = bhGetAccountCategory(acc);
    
    // Budget
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    const sollVal = bud ? Number(bud[activeBudgetCol] || 0) : 0;
    
    if (cat.main === 'Ertrag') {
      if (codeStr.startsWith('341')) {
        categories['Mitglieder'].ist += istVal;
        categories['Mitglieder'].soll += sollVal;
      } else if (codeStr.startsWith('32')) {
        categories['Sponsoren'].ist += istVal;
        categories['Sponsoren'].soll += sollVal;
      } else if (codeStr.startsWith('340') || codeStr.startsWith('3650') || codeStr.startsWith('34')) {
        categories['Vermietung'].ist += istVal;
        categories['Vermietung'].soll += sollVal;
      } else {
        categories['Übriger Ertrag'].ist += istVal;
        categories['Übriger Ertrag'].soll += sollVal;
      }
    } else if (cat.main === 'Aufwand') {
      if (codeStr.startsWith('41') || codeStr.startsWith('44')) {
        categories['Schiessbetrieb'].ist += istVal;
        categories['Schiessbetrieb'].soll += sollVal;
      } else if (codeStr.startsWith('42')) {
        categories['Jungschützen'].ist += istVal;
        categories['Jungschützen'].soll += sollVal;
      } else if (codeStr.startsWith('60') || codeStr.startsWith('62')) {
        categories['Gebäude & SH'].ist += istVal;
        categories['Gebäude & SH'].soll += sollVal;
      } else if (codeStr.startsWith('65')) {
        categories['Verwaltung/IT'].ist += istVal;
        categories['Verwaltung/IT'].soll += sollVal;
      } else {
        categories['Übriger Aufwand'].ist += istVal;
        categories['Übriger Aufwand'].soll += sollVal;
      }
    }
  });
  
  const labels = Object.keys(categories);
  const dataIst = labels.map(l => categories[l].ist);
  const dataSoll = labels.map(l => categories[l].soll);
  
  if (window._bhCharts.budgetChart) window._bhCharts.budgetChart.destroy();
  
  window._bhCharts.budgetChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Ist-Wert (Effektiv)',
          data: dataIst,
          backgroundColor: '#0f3a5d',
          borderRadius: 4
        },
        {
          label: 'Soll-Wert (Budget)',
          data: dataSoll,
          backgroundColor: '#adb5bd',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Horizontaler Chart für hervorragende Lesbarkeit
      scales: {
        x: { beginAtZero: true }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: CHF ${context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`
          }
        }
      }
    }
  });
}

// Diagramm 3: Monatlicher Cashflow-Trend
function bhRenderCashflowChart() {
  const canvas = document.getElementById('bhCashflowChart');
  if (!canvas) return;
  
  // 12 Monate initialisieren
  const cashIn = Array(12).fill(0);
  const cashOut = Array(12).fill(0);
  const monateLabels = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  
  // Hole Journal für das gewählte Jahr
  const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === Number(window._bhYear));
  
  currentYearJournal.forEach(entry => {
    const datum = new Date(entry.datum);
    if (isNaN(datum.getTime())) return;
    const m = datum.getMonth(); // 0 bis 11
    const amount = Number(entry.betrag || 0);
    
    const soll = String(entry.konto_soll).trim();
    const haben = String(entry.konto_haben).trim();
    
    // Kassen & Bank-Konten präfix: startsWith('10')
    const isSollLiquid = soll.startsWith('10');
    const isHabenLiquid = haben.startsWith('10');
    
    if (isSollLiquid && !isHabenLiquid) {
      // Einnahmen (Geld fliesst auf ein liquides Kassa/Bank-Konto)
      cashIn[m] += amount;
    }
    if (isHabenLiquid && !isSollLiquid) {
      // Ausgaben (Geld fliesst von einem liquiden Kassa/Bank-Konto ab)
      cashOut[m] += amount;
    }
  });
  
  if (window._bhCharts.cashflowChart) window._bhCharts.cashflowChart.destroy();
  
  window._bhCharts.cashflowChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: monateLabels,
      datasets: [
        {
          label: 'Einzahlungen (Inflow)',
          data: cashIn,
          borderColor: '#198754',
          backgroundColor: 'rgba(25, 135, 84, 0.05)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.5
        },
        {
          label: 'Auszahlungen (Outflow)',
          data: cashOut,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.05)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: CHF ${context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`
          }
        }
      }
    }
  });
}

// Controlling-Tabelle: Detaillierter Soll/Ist Fortschritt
function bhRenderControllingTable() {
  const tbody = document.getElementById('bh-controlling-table-tbody');
  if (!tbody) return;
  
  const activeBudgetCol = `budget_${window._bhYear}`;
  
  // Wir aggregieren Konten in Major-Controlling-Kategorien
  const categories = {
    '3410 - Mitgliederbeiträge': { key: '3410', ist: 0, soll: 0, isExpense: false },
    '3200 - Sponsoring & Gönner': { key: '3200', ist: 0, soll: 0, isExpense: false },
    '3650 - Vermietungen Gebäude': { key: '3650', ist: 0, soll: 0, isExpense: false },
    '4000 - Wirtschaft Munition': { key: '4000', ist: 0, soll: 0, isExpense: true },
    '4110 - Unterhalt KK-Anlagen': { key: '4110', ist: 0, soll: 0, isExpense: true },
    '4200 - Jungschützen & Munition': { key: '4200', ist: 0, soll: 0, isExpense: true },
    '6000 - Schützenhaus-Unterhalt': { key: '6000', ist: 0, soll: 0, isExpense: true },
    '6500 - Verwaltung & Informatik': { key: '6500', ist: 0, soll: 0, isExpense: true }
  };
  
  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const istVal = Number(acc._endsaldo || 0);
    
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    const sollVal = bud ? Number(bud[activeBudgetCol] || 0) : 0;
    
    // Genaues Matching aufbauen
    Object.keys(categories).forEach(catName => {
      const prefix = categories[catName].key;
      // Entweder exakter Match oder Gruppenpräfix (z.B. alle 42er Konten)
      if (code === prefix || (prefix.endsWith('00') && code.startsWith(prefix.substring(0, 2)))) {
        categories[catName].ist += istVal;
        categories[catName].soll += sollVal;
      }
    });
  });
  
  let rowsHTML = '';
  let successfulBudgetsCount = 0;
  let totalBudgetsTracked = 0;
  
  Object.keys(categories).forEach(catName => {
    const item = categories[catName];
    const diff = item.ist - item.soll;
    
    // Prozentuale Zielerreichung / Ausschöpfung berechnen
    let percent = 0;
    if (item.soll > 0) {
      percent = (item.ist / item.soll) * 100;
    }
    
    // Status bestimmen für Farbkodierung
    let isSuccess = false;
    let colorClass = 'bg-secondary';
    
    if (item.isExpense) {
      // Bei Ausgaben ist weniger als Budget gut! (Ausschöpfung <= 100%)
      if (percent <= 100) {
        isSuccess = true;
        colorClass = 'bg-success'; // Emerald Green
      } else {
        colorClass = 'bg-danger'; // Alarm Red (Überzogen!)
      }
    } else {
      // Bei Einnahmen ist mehr als Budget gut! (Erreichung >= 100%)
      if (percent >= 100) {
        isSuccess = true;
        colorClass = 'bg-success';
      } else if (percent > 0) {
        colorClass = 'bg-info'; // Blau (Laufend)
      } else {
        colorClass = 'bg-danger'; // Rot (Noch keine Erreichung)
      }
    }
    
    if (item.soll > 0) {
      totalBudgetsTracked++;
      if (isSuccess) successfulBudgetsCount++;
    }
    
    const progressPercent = Math.min(100, percent);
    const badgeText = item.soll > 0 ? `${percent.toFixed(0)}%` : '–';
    
    rowsHTML += `
      <tr class="bh-account-row">
        <td class="fw-bold text-dark">${catName}</td>
        <td>
          <span class="badge ${item.isExpense ? 'bg-danger text-white' : 'bg-success text-white'} bg-opacity-75">
            ${item.isExpense ? 'Aufwand' : 'Ertrag'}
          </span>
        </td>
        <td class="text-end fw-semibold">${fmtChf(item.ist)}</td>
        <td class="text-end text-muted">${item.soll > 0 ? fmtChf(item.soll) : '–'}</td>
        <td class="text-end fw-bold ${diff >= 0 ? (item.isExpense ? 'text-danger' : 'text-success') : (item.isExpense ? 'text-success' : 'text-danger')}">
          ${diff >= 0 ? '+' : ''}${fmtChf(diff)}
        </td>
        <td>
          <div class="d-flex align-items-center" style="gap: 10px;">
            <div class="progress flex-grow-1" style="height: 8px; background-color: #e9ecef; border-radius: 4px; overflow: hidden;">
              <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${progressPercent}%;" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <span class="small fw-bold text-muted" style="min-width: 45px; text-align: right;">${badgeText}</span>
          </div>
        </td>
      </tr>
    `;
  });
  
  tbody.innerHTML = rowsHTML || '<tr><td colspan="6" class="text-center text-muted">Keine Controlling-Daten verfügbar.</td></tr>';
  
  // Performance-Indikator Badge oben aktualisieren
  const perfBadge = document.getElementById('bh-controlling-perf-badge');
  if (perfBadge && totalBudgetsTracked > 0) {
    const successRate = (successfulBudgetsCount / totalBudgetsTracked) * 100;
    perfBadge.textContent = `${successfulBudgetsCount} von ${totalBudgetsTracked} Zielen im Budget (${successRate.toFixed(0)}% optimal)`;
    perfBadge.className = `badge ${successRate >= 70 ? 'bg-success' : successRate >= 40 ? 'bg-warning text-dark' : 'bg-danger'} px-3 py-1.5 rounded-pill shadow-sm`;
  }
}

// =====================================================================
// NEU: RENDERING: TAB 5 – GV-EXPORT & COCKPIT (Druckberichte, Wirtschafts-KPI & Struktur-Charts)
// =====================================================================
window.renderTabCockpit = function(container) {
  if (!container) return;
  
  container.innerHTML = `
    <!-- Top-Reihe: Controlling-Kennzahlen (B & C) -->
    <div class="row g-4 mb-4">
      <!-- Card B: Mitglieder-Entwicklung & Verbandskosten-Quote -->
      <div class="col-lg-6">
        <div class="bh-report-section shadow-sm border border-light h-100" id="bh-membership-quote-container">
          <div class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm" role="status"></div>
            <span class="ms-2 small text-muted">Lade Mitgliederquote...</span>
          </div>
        </div>
      </div>
      
      <!-- Card C: Schützenhaus Erfolgsrechnung / Facility ROI (exkl. Wasserschaden 6011) -->
      <div class="col-lg-6">
        <div class="bh-report-section shadow-sm border border-light h-100" id="bh-facility-roi-container">
          <div class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm" role="status"></div>
            <span class="ms-2 small text-muted">Lade Facility ROI...</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Mittlere Reihe: E – Mehrjahres-Kostenstruktur-Trend (2000-2026) -->
    <div class="row g-4 mb-4">
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light">
          <h5 class="fw-bold text-primary mb-3">
            <i class="fas fa-chart-line me-2"></i>Mehrjahres-Kostenstruktur-Trend (2000 - 2026)
          </h5>
          <div style="position: relative; height: 320px; width: 100%;">
            <canvas id="bhYoYCostChart"></canvas>
          </div>
          <div class="small text-muted mt-2 text-center">
            Kostenentwicklung über alle erfassten Jahre für Schiessbetrieb, Gebäude (exkl. Wasserschaden) und Verwaltung.
          </div>
        </div>
      </div>
    </div>
    
    <!-- Untere Reihe: Struktur-Kreisdiagramme (Doughnuts) -->
    <div class="row g-4">
      <div class="col-md-6">
        <div class="bh-report-section shadow-sm border border-light h-100">
          <h5 class="fw-bold text-primary mb-3">
            <i class="fas fa-chart-pie me-2"></i>Vereins-Ertragsstruktur (${window._bhYear})
          </h5>
          <div style="position: relative; height: 260px; width: 100%;">
            <canvas id="bhRevenueStructureChart"></canvas>
          </div>
          <div class="small text-muted mt-3 text-center fs-7">
            Prozentuale Verteilung der Einnahmequellen (Mitglieder, Sponsoren, Wirtschaft, Gebäude).
          </div>
        </div>
      </div>
      
      <div class="col-md-6">
        <div class="bh-report-section shadow-sm border border-light h-100">
          <h5 class="fw-bold text-primary mb-3">
            <i class="fas fa-chart-pie me-2"></i>Vereins-Aufwandsstruktur (${window._bhYear})
          </h5>
          <div style="position: relative; height: 260px; width: 100%;">
            <canvas id="bhExpenseStructureChart"></canvas>
          </div>
          <div class="small text-muted mt-3 text-center fs-7">
            Prozentuale Verteilung der Hauptausgaben (Munition, Schiessbetrieb, Unterhalt, Verwaltung).
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Rendern der Charts & KPIs verzögert ausführen
  setTimeout(() => {
    bhRenderRevenueStructureChart();
    bhRenderExpenseStructureChart();
    bhRenderMembershipQuote();
    bhRenderFacilityROI();
    bhRenderYoYCostChart();
  }, 100);
};

window.renderTabGVExport = function(container) {
  if (!container) return;
  
  // Set default export view
  window._bhActiveExportView = window._bhActiveExportView || 'full_journal';
  window._bhRevisorenHideTransit = window._bhRevisorenHideTransit !== undefined ? window._bhRevisorenHideTransit : true;
  
  const selectedYear = window._bhYear;
  const filteredJournal = window._bhJournal.filter(j => Number(j.jahr) === Number(selectedYear));
  
  let reportTitle = '';
  let reportHtml = '';
  
  if (window._bhActiveExportView === 'full_journal') {
    reportTitle = 'Vollständiges Journal';
    reportHtml = renderFullJournalReport(filteredJournal);
  } else if (window._bhActiveExportView === 'revisoren_journal') {
    reportTitle = 'Revisoren-Journal';
    reportHtml = renderRevisorenJournalReport(filteredJournal, window._bhRevisorenHideTransit);
  } else if (window._bhActiveExportView === 'gv_auswertung') {
    reportTitle = 'GV-Auswertung (Erfolgsrechnung & Transit)';
    reportHtml = renderGVAuswertungReport(filteredJournal);
  }
  
  container.innerHTML = `
    <div class="row g-4 mb-4 animate__animated animate__fadeIn">
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%);">
          <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap: 15px;">
            <div>
              <h5 class="fw-bold text-primary mb-1">
                <i class="fas fa-file-export me-2"></i>GV-Export & Berichtswesen (${selectedYear})
              </h5>
              <p class="text-muted small mb-0">Erstelle Berichte und Exporte formatiert für Revisoren, den Vorstand oder die Generalversammlung.</p>
            </div>
            
            <div class="d-flex align-items-center" style="gap: 10px;">
              <button class="btn btn-sm btn-outline-primary fw-bold px-3 py-2 shadow-sm" onclick="bhPrintGVReport()" style="border-radius: 6px;">
                <i class="fas fa-print me-1.5"></i>Bericht drucken (PDF)
              </button>
              <button class="btn btn-sm btn-outline-success fw-bold px-3 py-2 shadow-sm" onclick="bhExportJournalToExcel()" style="border-radius: 6px;">
                <i class="fas fa-file-excel me-1.5"></i>CSV / Excel Export
              </button>
            </div>
          </div>
          
          <!-- View Selector Button Group -->
          <div class="btn-group w-100 shadow-sm border border-light rounded-3 overflow-hidden" role="group" style="border-radius: 8px;">
            <button type="button" class="btn btn-outline-primary py-2.5 fw-bold ${window._bhActiveExportView === 'full_journal' ? 'active' : ''}" onclick="bhSwitchExportView('full_journal')">
              <i class="fas fa-receipt me-1.5"></i>A) Vollständiges Journal
            </button>
            <button type="button" class="btn btn-outline-primary py-2.5 fw-bold ${window._bhActiveExportView === 'revisoren_journal' ? 'active' : ''}" onclick="bhSwitchExportView('revisoren_journal')">
              <i class="fas fa-user-check me-1.5"></i>B) Revisoren-Journal
            </button>
            <button type="button" class="btn btn-outline-primary py-2.5 fw-bold ${window._bhActiveExportView === 'gv_auswertung' ? 'active' : ''}" onclick="bhSwitchExportView('gv_auswertung')">
              <i class="fas fa-file-invoice-dollar me-1.5"></i>C) GV-Auswertung (ER & Transit)
            </button>
          </div>
          
          <!-- Additional filters based on view -->
          ${window._bhActiveExportView === 'revisoren_journal' ? `
            <div class="mt-3 p-3 bg-light rounded-3 border d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center">
                <i class="fas fa-filter text-primary me-2.5"></i>
                <span class="small fw-semibold text-dark">Filteroptionen für Revisoren:</span>
              </div>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="bh-hide-transit-checkbox" ${window._bhRevisorenHideTransit ? 'checked' : ''} onchange="bhToggleRevisorenTransit(this.checked)" style="cursor: pointer;">
                <label class="form-check-label small fw-bold text-muted" for="bh-hide-transit-checkbox" style="cursor: pointer; user-select: none;">Transit-Detailzeilen ausblenden</label>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
    
    <!-- Report Preview Area -->
    <div class="row">
      <div class="col-12 animate__animated animate__fadeIn">
        <div class="bh-report-section shadow-sm border border-light bg-white p-4">
          <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
            <h5 class="fw-extrabold text-dark mb-0">${reportTitle} (${selectedYear})</h5>
            <span class="text-muted small italic">Vorschau für den Ausdruck</span>
          </div>
          
          <div id="bh-export-report-preview-container">
            ${reportHtml}
          </div>
        </div>
      </div>
    </div>
  `;
};

window.bhSwitchExportView = function(view) {
  window._bhActiveExportView = view;
  const content = document.getElementById('bh-tab-content-container');
  if (content && window.renderTabGVExport) {
    window.renderTabGVExport(content);
  }
};

window.bhToggleRevisorenTransit = function(checked) {
  window._bhRevisorenHideTransit = checked;
  const content = document.getElementById('bh-tab-content-container');
  if (content && window.renderTabGVExport) {
    window.renderTabGVExport(content);
  }
};

function calculateTransitStats(journal, accountCode) {
  let inflow = 0;
  let outflow = 0;
  journal.forEach(item => {
    const soll = String(item.konto_soll).trim();
    const haben = String(item.konto_haben).trim();
    const amount = Number(item.betrag || 0);
    if (haben === accountCode) {
      inflow += amount;
    }
    if (soll === accountCode) {
      outflow += amount;
    }
  });
  return { inflow, outflow, balance: inflow - outflow };
}

function renderFullJournalReport(journal) {
  const sortedJournal = [...journal].sort((a, b) => Number(a.id) - Number(b.id));
  
  const rows = sortedJournal.map(item => {
    const bType = item.buchungstyp || window.getBuchungstyp(item.konto_soll, item.konto_haben);
    return `
      <tr class="bh-account-row">
        <td class="font-monospace text-muted small">${item.id}</td>
        <td style="white-space:nowrap;">${isoToDisplay(item.datum)}</td>
        <td class="font-monospace fw-bold text-dark">${item.beleg_nr}</td>
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
          <span class="badge bg-primary text-white border-0 small me-1 mb-1">${bType}</span>
          <span class="badge bg-light text-dark border small">${item.typ || 'Rechnung'}</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-responsive" style="max-height: 500px;">
      <table class="table table-hover align-middle bh-table mb-0" style="font-size:13px;">
        <thead>
          <tr>
            <th style="width: 50px;">ID</th>
            <th style="width: 100px;">Datum</th>
            <th style="width: 110px;">Beleg-Nr</th>
            <th>Beschreibung</th>
            <th>Soll-Konto</th>
            <th>Haben-Konto</th>
            <th class="text-end" style="width: 120px;">Betrag</th>
            <th style="width: 140px;">Typen</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="8" class="text-center text-muted py-4">Keine Buchungssätze für dieses Jahr vorhanden.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderRevisorenJournalReport(journal, hideTransit) {
  let displayJournal = [...journal].sort((a, b) => Number(a.id) - Number(b.id));
  
  if (hideTransit) {
    displayJournal = displayJournal.filter(item => {
      const bType = item.buchungstyp || window.getBuchungstyp(item.konto_soll, item.konto_haben);
      return bType !== 'TRANSIT';
    });
  }
  
  const rows = displayJournal.map(item => {
    const bType = item.buchungstyp || window.getBuchungstyp(item.konto_soll, item.konto_haben);
    return `
      <tr class="bh-account-row">
        <td class="font-monospace text-muted small">${item.id}</td>
        <td style="white-space:nowrap;">${isoToDisplay(item.datum)}</td>
        <td class="font-monospace fw-bold text-dark">${item.beleg_nr}</td>
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
          <span class="badge bg-primary text-white border-0 small me-1 mb-1">${bType}</span>
          <span class="badge bg-light text-dark border small">${item.typ || 'Rechnung'}</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
    ${hideTransit ? `
      <div class="alert alert-info py-2 px-3 mb-3 small d-flex align-items-center border-0 shadow-sm" style="background-color: rgba(13,110,253,0.05); color: #0d6efd;">
        <i class="fas fa-info-circle me-2"></i>
        <span><strong>Hinweis:</strong> Transit-Detailbuchungen wurden ausgeblendet. Der Report zeigt nur vereinsrelevante Aufwände, Erträge und reguläre Zahlungen.</span>
      </div>
    ` : ''}
    <div class="table-responsive" style="max-height: 500px;">
      <table class="table table-hover align-middle bh-table mb-0" style="font-size:13px;">
        <thead>
          <tr>
            <th style="width: 50px;">ID</th>
            <th style="width: 100px;">Datum</th>
            <th style="width: 110px;">Beleg-Nr</th>
            <th>Beschreibung</th>
            <th>Soll-Konto</th>
            <th>Haben-Konto</th>
            <th class="text-end" style="width: 120px;">Betrag</th>
            <th style="width: 140px;">Typen</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="8" class="text-center text-muted py-4">Keine Buchungssätze vorhanden.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderGVAuswertungReport(journal) {
  // Erfolgsrechnung Konten holen
  const successAccounts = window._bhKontenrahmen.filter(acc => {
    const cat = bhGetAccountCategory(acc);
    return (cat.main === 'Ertrag' || cat.main === 'Aufwand') && Number(acc._endsaldo || 0) !== 0;
  });
  
  const revenues = successAccounts.filter(acc => bhGetAccountCategory(acc).main === 'Ertrag');
  const expenses = successAccounts.filter(acc => bhGetAccountCategory(acc).main === 'Aufwand');
  
  const totalRevenues = revenues.reduce((sum, acc) => sum + Number(acc._endsaldo || 0), 0);
  const totalExpenses = expenses.reduce((sum, acc) => sum + Number(acc._endsaldo || 0), 0);
  const netResult = totalRevenues - totalExpenses;
  
  const stats1190 = calculateTransitStats(journal, '1190');
  const stats1191 = calculateTransitStats(journal, '1191');
  
  const revenueRows = revenues.map(acc => `
    <tr class="bh-account-row">
      <td class="font-monospace text-muted" style="width: 80px;">${acc.konto}</td>
      <td class="fw-semibold text-dark">${acc.bezeichnung}</td>
      <td class="text-end fw-bold text-success">${fmtChf(acc._endsaldo)}</td>
    </tr>
  `).join('');
  
  const expenseRows = expenses.map(acc => `
    <tr class="bh-account-row">
      <td class="font-monospace text-muted" style="width: 80px;">${acc.konto}</td>
      <td class="fw-semibold text-dark">${acc.bezeichnung}</td>
      <td class="text-end fw-bold text-danger">${fmtChf(acc._endsaldo)}</td>
    </tr>
  `).join('');
  
  return `
    <div class="row g-4">
      <!-- Erfolgsrechnung -->
      <div class="col-lg-6">
        <h6 class="fw-bold text-success border-bottom pb-2 mb-3">
          <i class="fas fa-arrow-trend-up me-2"></i>Erträge (Verein)
        </h6>
        <table class="table table-sm table-hover align-middle mb-4" style="font-size: 13px;">
          <thead>
            <tr>
              <th>Konto</th>
              <th>Ertragskonto</th>
              <th class="text-end" style="width: 120px;">Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            ${revenueRows.length > 0 ? revenueRows : '<tr><td colspan="3" class="text-center text-muted">Keine Erträge.</td></tr>'}
            <tr class="table-light fw-bold" style="border-top: 1.5px solid #198754;">
              <td colspan="2" class="text-success">Total Einnahmen / Erträge</td>
              <td class="text-end text-success">${fmtChf(totalRevenues)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="col-lg-6">
        <h6 class="fw-bold text-danger border-bottom pb-2 mb-3">
          <i class="fas fa-arrow-trend-down me-2"></i>Aufwände (Verein)
        </h6>
        <table class="table table-sm table-hover align-middle mb-4" style="font-size: 13px;">
          <thead>
            <tr>
              <th>Konto</th>
              <th>Aufwandskonto</th>
              <th class="text-end" style="width: 120px;">Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            ${expenseRows.length > 0 ? expenseRows : '<tr><td colspan="3" class="text-center text-muted">Keine Aufwände.</td></tr>'}
            <tr class="table-light fw-bold" style="border-top: 1.5px solid #dc3545;">
              <td colspan="2" class="text-danger">Total Ausgaben / Aufwände</td>
              <td class="text-end text-danger">${fmtChf(totalExpenses)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- Erfolgs-Zusammenfassung -->
      <div class="col-12">
        <div class="p-3 rounded-3 d-flex justify-content-between align-items-center border shadow-sm mb-4" style="background-color: rgba(15,58,93,0.02); gap: 15px;">
          <div>
            <span class="text-muted fw-semibold small">Ordentliches Vereinsergebnis:</span>
            <h5 class="fw-bold mb-0 text-dark">
              ${fmtChf(totalRevenues)} (Erträge) &minus; ${fmtChf(totalExpenses)} (Aufwände)
            </h5>
          </div>
          <div class="text-end">
            <span class="text-muted fw-semibold small">Vereins-Ergebnis (${window._bhYear}):</span>
            <h4 class="fw-extrabold mb-0 ${netResult >= 0 ? 'text-success' : 'text-danger'}">
              <i class="fas ${netResult >= 0 ? 'fa-check-circle' : 'fa-exclamation-circle'} me-1.5"></i>
              ${netResult >= 0 ? 'Reingewinn' : 'Reinverlust'}: ${fmtChf(Math.abs(netResult))}
            </h4>
          </div>
        </div>
      </div>
      
      <!-- Transitkonten separat -->
      <div class="col-12">
        <h6 class="fw-bold text-primary border-bottom pb-2 mb-3">
          <i class="fas fa-arrows-alt-h me-2"></i>Transitkonten (Nicht in Erfolgsrechnung enthalten)
        </h6>
        <div class="table-responsive">
          <table class="table table-bordered align-middle mb-0" style="font-size: 13px;">
            <thead class="table-light">
              <tr>
                <th style="width: 80px;">Konto</th>
                <th>Durchlaufposten / Transitkonten</th>
                <th class="text-end" style="width: 150px;">Eingang (Credits)</th>
                <th class="text-end" style="width: 150px;">Ausgang (Debits)</th>
                <th class="text-end" style="width: 150px;">Netto-Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="font-monospace text-muted fw-bold">1190</td>
                <td><strong>Meisterschaften & sonstige Teilnahmen</strong> (Startgelder, Vorschüsse, Verbandsgebühren etc.)</td>
                <td class="text-end text-success">${fmtChf(stats1190.inflow)}</td>
                <td class="text-end text-danger">${fmtChf(stats1190.outflow)}</td>
                <td class="text-end fw-bold ${stats1190.balance === 0 ? 'text-dark' : 'text-primary'}">${fmtChf(stats1190.balance)}</td>
              </tr>
              <tr>
                <td class="font-monospace text-muted fw-bold">1191</td>
                <td><strong>Gruppengewinne</strong> (Geldeingänge für Mitglieder aus Meisterschaften)</td>
                <td class="text-end text-success">${fmtChf(stats1191.inflow)}</td>
                <td class="text-end text-danger">${fmtChf(stats1191.outflow)}</td>
                <td class="text-end fw-bold ${stats1191.balance === 0 ? 'text-dark' : 'text-primary'}">${fmtChf(stats1191.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="form-text text-muted small mt-2">
          * Transit-Durchlaufposten stellen keinen wirksamen Gewinn oder Verlust des Vereins dar und werden daher in der Erfolgsrechnung nicht ausgewiesen.
        </div>
      </div>
    </div>
  `;
}

function bhRenderMembershipQuote() {
  const container = document.getElementById('bh-membership-quote-container');
  if (!container) return;

  let totalMembersRevenue = 0;
  let revenue3410 = 0;
  let revenue3411 = 0;
  let revenue3412 = 0;
  let totalVerbandExpense = 0;

  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const balance = Number(acc._endsaldo || 0);

    if (code === '3410') {
      revenue3410 = balance;
      totalMembersRevenue += balance;
    } else if (code === '3411') {
      revenue3411 = balance;
      totalMembersRevenue += balance;
    } else if (code === '3412') {
      revenue3412 = balance;
      totalMembersRevenue += balance;
    } else if (code === '4410') {
      totalVerbandExpense += balance;
    }
  });

  const retainedRevenue = totalMembersRevenue - totalVerbandExpense;
  const quotePercent = totalMembersRevenue > 0 ? (retainedRevenue / totalMembersRevenue) * 100 : 0;

  container.innerHTML = `
    <h5 class="fw-bold text-primary mb-3">
      <i class="fas fa-users-cog me-2"></i>Mitglieder & Verbandskosten-Quote (${window._bhYear})
    </h5>
    
    <div class="row g-2 mb-3">
      <div class="col-6">
        <div class="p-2.5 rounded-3 bg-light border border-light text-center">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Einnahmen Beiträge</div>
          <div class="fw-bold text-dark mt-0.5" style="font-size: 15px;">${fmtChf(totalMembersRevenue)}</div>
        </div>
      </div>
      <div class="col-6">
        <div class="p-2.5 rounded-3 border text-center" style="background-color: ${retainedRevenue >= 0 ? 'rgba(25,135,84,0.06)' : 'rgba(220,53,69,0.06)'}; border-color: ${retainedRevenue >= 0 ? '#198754' : '#dc3545'} !important;">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Einbehaltener Betrag</div>
          <div class="fw-bold mt-0.5 ${retainedRevenue >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 15px;">${fmtChf(retainedRevenue)}</div>
        </div>
      </div>
    </div>
    
    <div class="d-flex justify-content-between mb-2 small fw-semibold">
      <span class="text-muted">Mitgliederbeiträge Aktive (3410):</span>
      <span class="text-dark">${fmtChf(revenue3410)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2 small fw-semibold">
      <span class="text-muted">Lizenzgebühren Aktive (3411):</span>
      <span class="text-dark">${fmtChf(revenue3411)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2 small fw-semibold">
      <span class="text-muted">Mitgliederbeiträge Passive (3412):</span>
      <span class="text-dark">${fmtChf(revenue3412)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2 small fw-semibold pt-1 border-top">
      <span class="text-muted">Verbandsabgaben SSV/AGSV (4410):</span>
      <span class="text-danger">${fmtChf(totalVerbandExpense)}</span>
    </div>
    <div class="d-flex justify-content-between mb-3 pt-2 border-top small fw-bold">
      <span class="text-muted">Einbehaltungsquote (Netto):</span>
      <span class="${quotePercent >= 60 ? 'text-success' : quotePercent >= 30 ? 'text-primary' : 'text-danger'}">${quotePercent.toFixed(1)}%</span>
    </div>
    
    <div class="progress" style="height: 8px; background-color: #e9ecef; border-radius: 4px; overflow: hidden;">
      <div class="progress-bar ${quotePercent >= 60 ? 'bg-success' : quotePercent >= 30 ? 'bg-primary' : 'bg-danger'}" role="progressbar" style="width: ${Math.max(0, Math.min(100, quotePercent))}%;" aria-valuenow="${quotePercent}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>
    <div class="small text-muted mt-2 text-center" style="font-size: 11px;">
      ${quotePercent >= 60 ? '🎉 Sehr gute Einbehaltungsquote!' : quotePercent >= 30 ? '👍 Ausgewogenes Verhältnis der Verbandskosten.' : '⚠️ Hohe Verbandskosten im Verhältnis zu den Beiträgen!'}
    </div>
  `;
}

function bhRenderFacilityROI() {
  const container = document.getElementById('bh-facility-roi-container');
  if (!container) return;

  let revenue3650 = 0;
  let revenue3651 = 0;
  let totalRevenue = 0;
  
  let expenseCleaning = 0;
  let expenseMaintenance = 0;
  let expenseUtilities = 0;
  let totalExpense = 0;

  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const balance = Number(acc._endsaldo || 0);

    if (code === '3650') {
      revenue3650 = balance;
      totalRevenue += balance;
    } else if (code === '3651') {
      revenue3651 = balance;
      totalRevenue += balance;
    } else if (code === '4010' || code === '4011') {
      expenseCleaning += balance;
      totalExpense += balance;
    } else if (code.startsWith('60') && code !== '6011') {
      expenseMaintenance += balance;
      totalExpense += balance;
    } else if (code === '6400') {
      expenseUtilities += balance;
      totalExpense += balance;
    }
  });

  const netIncome = totalRevenue - totalExpense;
  const marginPercent = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="fw-bold text-primary mb-0">
        <i class="fas fa-hotel me-2"></i>Schützenhaus Erfolgsrechnung / Facility ROI (${window._bhYear})
      </h5>
      <span class="badge bg-secondary small px-2 py-1" style="font-size: 9px; cursor: help;" title="Einmaliger Wasserschaden (Konto 6011) ist explizit ausgeblendet">exkl. Wasserschaden</span>
    </div>
    
    <div class="row g-2 mb-3">
      <div class="col-6">
        <div class="p-2.5 rounded-3 bg-light border border-light text-center">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Einnahmen Schützenhaus</div>
          <div class="fw-bold text-dark mt-0.5" style="font-size: 15px;">${fmtChf(totalRevenue)}</div>
        </div>
      </div>
      <div class="col-6">
        <div class="p-2.5 rounded-3 border text-center" style="background-color: ${netIncome >= 0 ? 'rgba(25,135,84,0.06)' : 'rgba(220,53,69,0.06)'}; border-color: ${netIncome >= 0 ? '#198754' : '#dc3545'} !important;">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Netto-Ergebnis</div>
          <div class="fw-bold mt-0.5 ${netIncome >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 15px;">${fmtChf(netIncome)}</div>
        </div>
      </div>
    </div>
    
    <div class="d-flex justify-content-between mb-2 small fw-semibold">
      <span class="text-muted">Mieteinnahmen Schützenhaus (3650):</span>
      <span class="text-dark">${fmtChf(revenue3650)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2 small fw-semibold">
      <span class="text-muted">Festwirtschaftsertrag (3651):</span>
      <span class="text-dark">${fmtChf(revenue3651)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2 small fw-semibold pt-1 border-top">
      <span class="text-muted">Unterhalt Gebäude (60xx exkl. 6011):</span>
      <span class="text-danger">${fmtChf(expenseMaintenance)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2 small fw-semibold">
      <span class="text-muted">Reinigungsaufwand (4010/4011):</span>
      <span class="text-danger">${fmtChf(expenseCleaning)}</span>
    </div>
    <div class="d-flex justify-content-between mb-2 small fw-semibold">
      <span class="text-muted">Nebenkosten Strom/Wasser/Gas (6400):</span>
      <span class="text-danger">${fmtChf(expenseUtilities)}</span>
    </div>
    <div class="d-flex justify-content-between mb-3 pt-2 border-top small fw-bold">
      <span class="text-muted">Facility ROI / Marge:</span>
      <span class="${marginPercent >= 40 ? 'text-success' : marginPercent >= 20 ? 'text-primary' : 'text-danger'}">${marginPercent.toFixed(1)}%</span>
    </div>
    
    <div class="progress" style="height: 8px; background-color: #e9ecef; border-radius: 4px; overflow: hidden;">
      <div class="progress-bar ${marginPercent >= 40 ? 'bg-success' : marginPercent >= 20 ? 'bg-primary' : 'bg-danger'}" role="progressbar" style="width: ${Math.max(0, Math.min(100, marginPercent))}%;" aria-valuenow="${marginPercent}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>
    <div class="small text-muted mt-2 text-center" style="font-size: 11px;">
      ${marginPercent >= 40 ? '🎉 Exzellenter Facility ROI!' : marginPercent >= 20 ? '👍 Gesunder Schützenhaus-Erfolg.' : '⚠️ Niedrige Marge: Bitte Kosten oder Auslastung prüfen.'}
    </div>
  `;
}

function bhRenderYoYCostChart() {
  const canvas = document.getElementById('bhYoYCostChart');
  if (!canvas) return;
  
  const jahreSet = new Set(window._bhJournal.map(j => Number(j.jahr || window._bhYear)));
  jahreSet.add(window._bhYear);
  const jahre = Array.from(jahreSet).sort((a,b) => a - b);
  
  const schiessbetriebData = [];
  const gebaeudeData = [];
  const verwaltungData = [];
  const uebrigeData = [];
  
  jahre.forEach(yr => {
    let yrSchiess = 0;
    let yrGebaeude = 0;
    let yrVerwaltung = 0;
    let yrUebrige = 0;
    
    const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === yr);
    
    window._bhKontenrahmen.forEach(acc => {
      const code = String(acc.konto).trim();
      const cat = bhGetAccountCategory(acc);
      
      let balanceChange = 0;
      currentYearJournal.forEach(entry => {
        const soll = String(entry.konto_soll).trim();
        const haben = String(entry.konto_haben).trim();
        const amount = Number(entry.betrag || 0);
        
        if (soll === code) balanceChange += amount;
        if (haben === code) balanceChange -= amount;
      });
      
      const balance = Math.abs(balanceChange);
      
      if (cat.main === 'Aufwand') {
        if (code.startsWith('41') || code.startsWith('42') || code.startsWith('44')) {
          yrSchiess += balance;
        } else if ((code.startsWith('60') && code !== '6011') || code.startsWith('62') || code.startsWith('63') || code.startsWith('64')) {
          yrGebaeude += balance;
        } else if (code.startsWith('65') || code.startsWith('67') || code.startsWith('69') || code.startsWith('89')) {
          yrVerwaltung += balance;
        } else {
          yrUebrige += balance;
        }
      }
    });
    
    schiessbetriebData.push(Math.max(0, yrSchiess));
    gebaeudeData.push(Math.max(0, yrGebaeude));
    verwaltungData.push(Math.max(0, yrVerwaltung));
    uebrigeData.push(Math.max(0, yrUebrige));
  });
  
  if (window._bhCharts.yoyCostChart) window._bhCharts.yoyCostChart.destroy();
  
  window._bhCharts.yoyCostChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: jahre.map(y => `Jahr ${y}`),
      datasets: [
        {
          label: 'Munition & Schiessbetrieb',
          data: schiessbetriebData,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Gebäude & Schützenhaus (exkl. Wasserschaden)',
          data: gebaeudeData,
          borderColor: '#198754',
          backgroundColor: 'rgba(25, 135, 84, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Verwaltung & Spesen',
          data: verwaltungData,
          borderColor: '#0d6efd',
          backgroundColor: 'rgba(13, 110, 253, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Übrige Aufwände',
          data: uebrigeData,
          borderColor: '#fd7e14',
          backgroundColor: 'rgba(253, 126, 20, 0.03)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => 'CHF ' + value.toLocaleString('de-CH')
          }
        }
      },
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: context => ` ${context.dataset.label}: CHF ${context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`
          }
        }
      }
    }
  });
}

// Doughnut-Diagramm 1: Ertragsstruktur
function bhRenderRevenueStructureChart() {
  const canvas = document.getElementById('bhRevenueStructureChart');
  if (!canvas) return;

  const revenueGroups = {
    'Sponsoring': 0,
    'Mitgliederbeiträge': 0,
    'Vermietung Gebäude': 0,
    'Bar & Festwirtschaft': 0,
    'Übrige Erträge': 0
  };

  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const balance = Number(acc._endsaldo || 0);
    if (code.startsWith('3')) {
      if (code.startsWith('32')) {
        revenueGroups['Sponsoring'] += balance;
      } else if (code.startsWith('341')) {
        revenueGroups['Mitgliederbeiträge'] += balance;
      } else if (code === '3650') {
        revenueGroups['Vermietung Gebäude'] += balance;
      } else if (code === '3651') {
        revenueGroups['Bar & Festwirtschaft'] += balance;
      } else {
        revenueGroups['Übrige Erträge'] += balance;
      }
    }
  });

  const labels = Object.keys(revenueGroups).filter(l => revenueGroups[l] > 0);
  const data = labels.map(l => revenueGroups[l]);

  if (window._bhCharts.revenueStructureChart) window._bhCharts.revenueStructureChart.destroy();

  window._bhCharts.revenueStructureChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#0f3a5d',
          '#198754',
          '#fd7e14',
          '#20c997',
          '#6c757d'
        ],
        borderWidth: 1.5,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: context => ` ${context.label}: CHF ${context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`
          }
        }
      }
    }
  });
}

// Doughnut-Diagramm 2: Aufwandsstruktur
function bhRenderExpenseStructureChart() {
  const canvas = document.getElementById('bhExpenseStructureChart');
  if (!canvas) return;

  const expenseGroups = {
    'Munition & Nachwuchs': 0,
    'Schiessbetrieb & Doppel': 0,
    'Schützenhaus-Unterhalt': 0,
    'Verwaltung & Versicherungen': 0,
    'Übrige Aufwände': 0
  };

  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const balance = Number(acc._endsaldo || 0);
    const k = code[0];
    if (k === '4' || k === '5' || k === '6' || k === '7' || k === '8') {
      if (code.startsWith('42')) {
        expenseGroups['Munition & Nachwuchs'] += balance;
      } else if (code.startsWith('41') || code.startsWith('44')) {
        expenseGroups['Schiessbetrieb & Doppel'] += balance;
      } else if (code.startsWith('60') || code.startsWith('62') || code.startsWith('61')) {
        expenseGroups['Schützenhaus-Unterhalt'] += balance;
      } else if (code.startsWith('65') || code.startsWith('63')) {
        expenseGroups['Verwaltung & Versicherungen'] += balance;
      } else {
        expenseGroups['Übrige Aufwände'] += balance;
      }
    }
  });

  const labels = Object.keys(expenseGroups).filter(l => expenseGroups[l] > 0);
  const data = labels.map(l => expenseGroups[l]);

  if (window._bhCharts.expenseStructureChart) window._bhCharts.expenseStructureChart.destroy();

  window._bhCharts.expenseStructureChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#dc3545',
          '#fd7e14',
          '#6f42c1',
          '#0d6efd',
          '#6c757d'
        ],
        borderWidth: 1.5,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: context => ` ${context.label}: CHF ${context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`
          }
        }
      }
    }
  });
}

// Kassabuch-Export: Lädt das Journal als perfekt formatiertes Excel-CSV herunter
window.bhExportJournalToExcel = function() {
  const selectedYear = window._bhYear;
  const filteredJournal = window._bhJournal.filter(j => Number(j.jahr) === Number(selectedYear));
  
  const csvRows = [];
  
  if (window._bhActiveExportView === 'gv_auswertung') {
    // Export verdichtete Erfolgsrechnung & Transitkonten
    csvRows.push('Konto;Bezeichnung;Klasse;Eingang (Transit);Ausgang (Transit);Saldo (CHF)');
    
    // Erfolgsrechnung Konten
    const successAccounts = window._bhKontenrahmen.filter(acc => {
      const cat = bhGetAccountCategory(acc);
      return (cat.main === 'Ertrag' || cat.main === 'Aufwand') && Number(acc._endsaldo || 0) !== 0;
    });
    
    successAccounts.forEach(acc => {
      const cat = bhGetAccountCategory(acc);
      csvRows.push(`${acc.konto};"${acc.bezeichnung.replace(/"/g, '""')}";${cat.main};;;${Number(acc._endsaldo || 0).toFixed(2)}`);
    });
    
    // Transitkonten
    const stats1190 = calculateTransitStats(filteredJournal, '1190');
    const stats1191 = calculateTransitStats(filteredJournal, '1191');
    
    csvRows.push(`1190;"Transit Meisterschaften & sonstige Teilnahmen";Transit;${stats1190.inflow.toFixed(2)};${stats1190.outflow.toFixed(2)};${stats1190.balance.toFixed(2)}`);
    csvRows.push(`1191;"Transit Gruppengewinne";Transit;${stats1191.inflow.toFixed(2)};${stats1191.outflow.toFixed(2)};${stats1191.balance.toFixed(2)}`);
    
  } else {
    // Export Journal (Vollständig oder Revisoren)
    let displayJournal = [...filteredJournal].sort((a, b) => Number(a.id) - Number(b.id));
    if (window._bhActiveExportView === 'revisoren_journal' && window._bhRevisorenHideTransit) {
      displayJournal = displayJournal.filter(item => {
        const bType = item.buchungstyp || window.getBuchungstyp(item.konto_soll, item.konto_haben);
        return bType !== 'TRANSIT';
      });
    }
    
    csvRows.push('ID;Beleg-Nr;Datum;Beschreibung;Soll-Konto;Soll-Bezeichnung;Haben-Konto;Haben-Bezeichnung;Betrag (CHF);Aktionstyp;Buchungstyp');
    
    displayJournal.forEach(item => {
      const sollName = getAccountNameByCode(item.konto_soll);
      const habenName = getAccountNameByCode(item.konto_haben);
      const bType = item.buchungstyp || window.getBuchungstyp(item.konto_soll, item.konto_haben);
      
      let desc = item.beschreibung || '';
      if (desc.startsWith('"') && desc.endsWith('"')) {
        desc = desc.substring(1, desc.length - 1).replace(/""/g, '"');
      }
      desc = `"${desc.replace(/"/g, '""')}"`;
      
      const row = [
        item.id,
        item.beleg_nr,
        isoToDisplay(item.datum),
        desc,
        item.konto_soll,
        `"${sollName.replace(/"/g, '""')}"`,
        item.konto_haben,
        `"${habenName.replace(/"/g, '""')}"`,
        Number(item.betrag || 0).toFixed(2),
        item.typ || 'Rechnung',
        bType
      ];
      
      csvRows.push(row.join(';'));
    });
  }
  
  const csvContent = '\ufeff' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const filename = window._bhActiveExportView === 'gv_auswertung' 
    ? `gv_auswertung_sportschuetzen_muhen_${selectedYear}.csv`
    : window._bhActiveExportView === 'revisoren_journal'
      ? `revisoren_journal_sportschuetzen_muhen_${selectedYear}.csv`
      : `kassabuch_journal_sportschuetzen_muhen_${selectedYear}.csv`;
      
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// PDF/Druck-Jahresrechnung für die Generalversammlung (GV) generieren
window.bhPrintGVReport = function() {
  const selectedYear = window._bhYear;
  const filteredJournal = window._bhJournal.filter(j => Number(j.jahr) === Number(selectedYear));
  
  let reportTitle = '';
  let contentHtml = '';
  let customStyle = '';
  
  if (window._bhActiveExportView === 'full_journal' || window._bhActiveExportView === 'revisoren_journal') {
    const isRevisoren = window._bhActiveExportView === 'revisoren_journal';
    reportTitle = isRevisoren ? `Revisoren-Journal (${selectedYear})` : `Kassabuch-Journal (${selectedYear})`;
    
    let displayJournal = [...filteredJournal].sort((a, b) => Number(a.id) - Number(b.id));
    if (isRevisoren && window._bhRevisorenHideTransit) {
      displayJournal = displayJournal.filter(item => {
        const bType = item.buchungstyp || window.getBuchungstyp(item.konto_soll, item.konto_haben);
        return bType !== 'TRANSIT';
      });
    }
    
    const rows = displayJournal.map(item => {
      const bType = item.buchungstyp || window.getBuchungstyp(item.konto_soll, item.konto_haben);
      return `
        <tr class="detail-row">
          <td class="code" style="width:40px;">${item.id}</td>
          <td style="width:80px;">${isoToDisplay(item.datum)}</td>
          <td class="code" style="width:90px; font-weight:bold;">${item.beleg_nr}</td>
          <td>${escapeHtml(item.beschreibung)}</td>
          <td style="width:140px;">
            <span class="code" style="background:#eee; padding:1px 4px; border-radius:3px;">${item.konto_soll}</span>
            <span style="font-size:11px; color:#555;">${getAccountNameByCode(item.konto_soll)}</span>
          </td>
          <td style="width:140px;">
            <span class="code" style="background:#eee; padding:1px 4px; border-radius:3px;">${item.konto_haben}</span>
            <span style="font-size:11px; color:#555;">${getAccountNameByCode(item.konto_haben)}</span>
          </td>
          <td class="amount" style="width:100px; font-weight:bold;">${fmtChf(item.betrag)}</td>
          <td style="width:110px;">
            <span style="background:#0f3a5d; color:#fff; padding:1px 5px; font-size:10px; border-radius:3px; font-weight:bold;">${bType}</span>
            <span style="background:#eee; padding:1px 4px; font-size:10px; border-radius:3px;">${item.typ || 'Rechnung'}</span>
          </td>
        </tr>
      `;
    }).join('');
    
    contentHtml = `
      ${isRevisoren && window._bhRevisorenHideTransit ? `
        <div style="background:#f0f7ff; color:#0066cc; border:1px solid #c2e0ff; padding:10px; border-radius:4px; font-size:12px; margin-bottom:15px;">
          <strong>Hinweis:</strong> Transit-Detailbuchungen wurden ausgeblendet. Der Report zeigt nur vereinsrelevante Aufwände, Erträge und reguläre Zahlungen.
        </div>
      ` : ''}
      <table>
        <thead>
          <tr>
            <th class="code" style="width:40px;">ID</th>
            <th>Datum</th>
            <th>Beleg-Nr</th>
            <th>Beschreibung</th>
            <th>Soll-Konto</th>
            <th>Haben-Konto</th>
            <th class="amount">Betrag</th>
            <th>Typen</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="8" style="text-align:center; padding:20px; color:#666;">Keine Buchungssätze vorhanden.</td></tr>'}
        </tbody>
      </table>
    `;
    
    customStyle = `
      table { font-size: 11px; }
      td { padding: 4px 6px; }
      th { padding: 4px 6px; }
    `;
    
  } else if (window._bhActiveExportView === 'gv_auswertung') {
    reportTitle = `GV-Auswertung (Vereinsrechnung & Transit) - ${selectedYear}`;
    
    const successAccounts = window._bhKontenrahmen.filter(acc => {
      const cat = bhGetAccountCategory(acc);
      return (cat.main === 'Ertrag' || cat.main === 'Aufwand') && Number(acc._endsaldo || 0) !== 0;
    });
    
    const revenues = successAccounts.filter(acc => bhGetAccountCategory(acc).main === 'Ertrag');
    const expenses = successAccounts.filter(acc => bhGetAccountCategory(acc).main === 'Aufwand');
    
    const totalRevenues = revenues.reduce((sum, acc) => sum + Number(acc._endsaldo || 0), 0);
    const totalExpenses = expenses.reduce((sum, acc) => sum + Number(acc._endsaldo || 0), 0);
    const netResult = totalRevenues - totalExpenses;
    
    const stats1190 = calculateTransitStats(filteredJournal, '1190');
    const stats1191 = calculateTransitStats(filteredJournal, '1191');
    
    const revenueRows = revenues.map(acc => `
      <tr class="detail-row">
        <td class="code" style="width:80px;">${acc.konto}</td>
        <td>${acc.bezeichnung}</td>
        <td class="amount" style="color:#198754; font-weight:bold;">${fmtChf(acc._endsaldo)}</td>
      </tr>
    `).join('');
    
    const expenseRows = expenses.map(acc => `
      <tr class="detail-row">
        <td class="code" style="width:80px;">${acc.konto}</td>
        <td>${acc.bezeichnung}</td>
        <td class="amount" style="color:#dc3545; font-weight:bold;">${fmtChf(acc._endsaldo)}</td>
      </tr>
    `).join('');
    
    contentHtml = `
      <div style="display: flex; gap: 30px; margin-bottom: 25px;">
        <!-- Erträge links -->
        <div style="width: 50%;">
          <div class="section-header" style="color: #198754; border-bottom-color: #198754; margin-top:0;">Erträge (Vereinseinnahmen)</div>
          <table>
            <thead>
              <tr>
                <th class="code" style="width:60px;">Konto</th>
                <th>Konto-Bezeichnung</th>
                <th class="amount">Saldo (CHF)</th>
              </tr>
            </thead>
            <tbody>
              ${revenueRows.length > 0 ? revenueRows : '<tr><td colspan="3" style="text-align:center; color:#666;">Keine Erträge.</td></tr>'}
              <tr class="subtotal-row" style="color: #198754; border-top-color:#198754; border-bottom-color:#198754;">
                <td colspan="2">Total Vereinserträge</td>
                <td class="amount">${fmtChf(totalRevenues)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Aufwände rechts -->
        <div style="width: 50%;">
          <div class="section-header" style="color: #dc3545; border-bottom-color: #dc3545; margin-top:0;">Aufwände (Vereinsausgaben)</div>
          <table>
            <thead>
              <tr>
                <th class="code" style="width:60px;">Konto</th>
                <th>Konto-Bezeichnung</th>
                <th class="amount">Saldo (CHF)</th>
              </tr>
            </thead>
            <tbody>
              ${expenseRows.length > 0 ? expenseRows : '<tr><td colspan="3" style="text-align:center; color:#666;">Keine Aufwände.</td></tr>'}
              <tr class="subtotal-row" style="color: #dc3545; border-top-color:#dc3545; border-bottom-color:#dc3545;">
                <td colspan="2">Total Vereinsaufwände</td>
                <td class="amount">${fmtChf(totalExpenses)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- Netto Ergebnis-Box -->
      <table style="margin-bottom:30px;">
        <tbody>
          <tr class="total-row" style="background-color: ${netResult >= 0 ? '#d1e7dd' : '#f8d7da'}; color: ${netResult >= 0 ? '#0f5132' : '#842029'}; font-size:14px;">
            <td colspan="2" style="padding:10px;">${netResult >= 0 ? 'ORDENTLICHES VEREINSERGEBNIS (REINGEWINN)' : 'ORDENTLICHES VEREINSERGEBNIS (REINVERLUST)'}</td>
            <td class="amount" style="padding:10px;">${fmtChf(netResult)}</td>
          </tr>
        </tbody>
      </table>
      
      <!-- Transitkonten separat -->
      <div class="section-header">Transitkonten (nicht erfolgswirksam)</div>
      <table>
        <thead>
          <tr>
            <th class="code" style="width:80px;">Konto</th>
            <th>Durchlaufposten / Transitkonten</th>
            <th class="amount" style="width:150px;">Eingang (Credits)</th>
            <th class="amount" style="width:150px;">Ausgang (Debits)</th>
            <th class="amount" style="width:150px;">Netto-Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr class="detail-row">
            <td class="code fw-bold">1190</td>
            <td><strong>Transit Meisterschaften & sonstige Teilnahmen</strong> (Startgelder, Vorschüsse, Verbandsgebühren)</td>
            <td class="amount" style="color:#198754;">${fmtChf(stats1190.inflow)}</td>
            <td class="amount" style="color:#dc3545;">${fmtChf(stats1190.outflow)}</td>
            <td class="amount" style="font-weight:bold;">${fmtChf(stats1190.balance)}</td>
          </tr>
          <tr class="detail-row">
            <td class="code fw-bold">1191</td>
            <td><strong>Transit Gruppengewinne</strong> (Vereinsgelder für Meisterschafts-Auszahlungen)</td>
            <td class="amount" style="color:#198754;">${fmtChf(stats1191.inflow)}</td>
            <td class="amount" style="color:#dc3545;">${fmtChf(stats1191.outflow)}</td>
            <td class="amount" style="font-weight:bold;">${fmtChf(stats1191.balance)}</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:11px; color:#666; font-style:italic; margin-top:5px;">
        * Diese Transitkonten stellen Durchlaufposten dar. Sie beeinflussen weder das Nettovermögen noch den steuerbaren Reingewinn des Vereins und werden daher nicht in der Erfolgsrechnung verbucht.
      </p>
    `;
    
    customStyle = `
      .signature-section { margin-top: 40px; }
    `;
  }
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 30px; line-height: 1.4; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px double #333; padding-bottom: 15px; }
          .header h1 { margin: 0 0 5px 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
          .header h2 { margin: 0; font-size: 16px; color: #555; font-weight: normal; }
          .section-header { font-size: 16px; font-weight: bold; border-bottom: 2px solid #333; margin: 25px 0 12px 0; padding-bottom: 4px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          th { border-bottom: 1.5px solid #333; text-align: left; padding: 5px 8px; font-weight: bold; }
          td { padding: 5px 8px; vertical-align: top; }
          .section-title { font-weight: bold; background-color: #f5f5f5; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }
          .detail-row { border-bottom: 1px solid #eee; }
          .code { font-family: monospace; color: #444; }
          .amount { text-align: right; font-weight: 500; }
          .subtotal-row { font-weight: bold; border-bottom: 1.5px solid #333; border-top: 1px solid #333; }
          .total-row { font-weight: bold; border-bottom: 3px double #333; border-top: 2px solid #333; }
          .signature-section { margin-top: 40px; page-break-inside: avoid; }
          .signature-grid { display: flex; justify-content: space-between; gap: 40px; margin-top: 25px; }
          .signature-box { border-top: 1px solid #333; width: 45%; pt: 10px; font-size: 12px; text-align: center; padding-top: 8px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
            @page { size: A4; margin: 1.2cm; }
          }
          ${customStyle}
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Sportschützen Muhen</h1>
          <h2>Jahresabschluss-Bericht &bull; Vereinsjahr ${selectedYear}</h2>
        </div>
        
        <h4 style="text-align:center; text-transform:uppercase; margin-top:0; font-weight:bold; letter-spacing:0.5px;">${reportTitle}</h4>
        
        ${contentHtml}
        
        <!-- UNTERSCHRIFTEN -->
        <div class="signature-section">
          <p>Dieser Bericht wurde ordnungsgemäss aus dem Hauptbuch generiert und wird der Generalversammlung / den Revisoren vorgelegt.</p>
          <div class="signature-grid">
            <div class="signature-box">
              <br><br>
              <p>Der Kassier:</p>
              <p>Daniel Hunziker</p>
            </div>
            <div class="signature-box">
              <br><br>
              <p>Die Geschäftsprüfungskommission (Revisoren):</p>
              <p>Name Revisor 1 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Name Revisor 2</p>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

