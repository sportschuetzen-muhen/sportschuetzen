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
  
  jahre.forEach(yr => {
    let yrSchiess = 0;
    let yrGebaeude = 0;
    let yrVerwaltung = 0;
    
    const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === yr);
    
    window._bhKontenrahmen.forEach(acc => {
      const code = String(acc.konto).trim();
      
      let balanceChange = 0;
      currentYearJournal.forEach(entry => {
        const soll = String(entry.konto_soll).trim();
        const haben = String(entry.konto_haben).trim();
        const amount = Number(entry.betrag || 0);
        
        if (soll === code) balanceChange += amount;
        if (haben === code) balanceChange -= amount;
      });
      
      const balance = Math.abs(balanceChange); // Expenses are positive values
      
      if (code.startsWith('41') || code.startsWith('42') || code.startsWith('44')) {
        yrSchiess += balance;
      } else if ((code.startsWith('60') && code !== '6011') || code.startsWith('62') || code.startsWith('63') || code.startsWith('64')) {
        yrGebaeude += balance; // Explicitly exclude Wasserschaden 6011!
      } else if (code.startsWith('65') || code.startsWith('67') || code.startsWith('69') || code.startsWith('89')) {
        yrVerwaltung += balance;
      }
    });
    
    schiessbetriebData.push(Math.max(0, yrSchiess));
    gebaeudeData.push(Math.max(0, yrGebaeude));
    verwaltungData.push(Math.max(0, yrVerwaltung));
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
    'Schiessbetrieb': { ist: 0, soll: 0, isExpense: true },
    'Jungschützen': { ist: 0, soll: 0, isExpense: true },
    'Gebäude & SH': { ist: 0, soll: 0, isExpense: true },
    'Verwaltung/IT': { ist: 0, soll: 0, isExpense: true }
  };
  
  window._bhKontenrahmen.forEach(acc => {
    const codeStr = String(acc.konto).trim();
    const istVal = Number(acc._endsaldo || 0);
    
    // Budget
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    const sollVal = bud ? Number(bud[activeBudgetCol] || 0) : 0;
    
    if (codeStr.startsWith('341')) {
      categories['Mitglieder'].ist += istVal;
      categories['Mitglieder'].soll += sollVal;
    } else if (codeStr.startsWith('32')) {
      categories['Sponsoren'].ist += istVal;
      categories['Sponsoren'].soll += sollVal;
    } else if (codeStr.startsWith('340') || codeStr.startsWith('3650') || codeStr.startsWith('34')) {
      categories['Vermietung'].ist += istVal;
      categories['Vermietung'].soll += sollVal;
    } else if (codeStr.startsWith('41') || codeStr.startsWith('44')) {
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
  
  container.innerHTML = `
    <div class="row g-4 mb-4">
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light" style="background: linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(245,248,252,0.9) 100%);">
          <h5 class="fw-bold text-primary mb-2">
            <i class="fas fa-file-export me-2"></i>GV-Export & Berichtswesen (${window._bhYear})
          </h5>
          <p class="text-muted small mb-4">Erstelle strukturierte Exporte für Excel oder drucke den vollständigen Jahresabschluss (Bilanz & Erfolgsrechnung) formatiert für die Generalversammlung (GV).</p>
          
          <div class="row g-3">
            <div class="col-sm-6">
              <button class="btn btn-outline-primary w-100 py-4 fw-bold shadow-sm d-flex flex-column align-items-center justify-content-center border-2 rounded-3" onclick="bhPrintGVReport()" style="gap: 12px; transition: all 0.2s ease;">
                <i class="fas fa-print fa-3x text-primary mb-1"></i>
                <span>Jahresrechnung drucken (PDF)</span>
              </button>
            </div>
            <div class="col-sm-6">
              <button class="btn btn-outline-success w-100 py-4 fw-bold shadow-sm d-flex flex-column align-items-center justify-content-center border-2 rounded-3" onclick="bhExportJournalToExcel()" style="gap: 12px; transition: all 0.2s ease;">
                <i class="fas fa-file-excel fa-3x text-success mb-1"></i>
                <span>Kassabuch exportieren (Excel)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

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
  
  jahre.forEach(yr => {
    let yrSchiess = 0;
    let yrGebaeude = 0;
    let yrVerwaltung = 0;
    
    const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === yr);
    
    window._bhKontenrahmen.forEach(acc => {
      const code = String(acc.konto).trim();
      
      let balanceChange = 0;
      currentYearJournal.forEach(entry => {
        const soll = String(entry.konto_soll).trim();
        const haben = String(entry.konto_haben).trim();
        const amount = Number(entry.betrag || 0);
        
        if (soll === code) balanceChange += amount;
        if (haben === code) balanceChange -= amount;
      });
      
      const balance = Math.abs(balanceChange);
      
      if (code.startsWith('41') || code.startsWith('42') || code.startsWith('44')) {
        yrSchiess += balance;
      } else if ((code.startsWith('60') && code !== '6011') || code.startsWith('62') || code.startsWith('63') || code.startsWith('64')) {
        yrGebaeude += balance;
      } else if (code.startsWith('65') || code.startsWith('67') || code.startsWith('69') || code.startsWith('89')) {
        yrVerwaltung += balance;
      }
    });
    
    schiessbetriebData.push(Math.max(0, yrSchiess));
    gebaeudeData.push(Math.max(0, yrGebaeude));
    verwaltungData.push(Math.max(0, yrVerwaltung));
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
  const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === Number(window._bhYear));
  
  const csvRows = [];
  csvRows.push('ID;Beleg-Nr;Datum;Beschreibung;Soll-Konto;Soll-Bezeichnung;Haben-Konto;Haben-Bezeichnung;Betrag (CHF);Aktionstyp');
  
  currentYearJournal.forEach(item => {
    const sollName = getAccountNameByCode(item.konto_soll);
    const habenName = getAccountNameByCode(item.konto_haben);
    
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
      item.typ || 'Rechnung'
    ];
    
    csvRows.push(row.join(';'));
  });
  
  const csvContent = '\ufeff' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `kassabuch_journal_sportschuetzen_muhen_${window._bhYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// PDF/Druck-Jahresrechnung für die Generalversammlung (GV) generieren
window.bhPrintGVReport = function() {
  const tree = {};
  window._bhKontenrahmen.forEach(acc => {
    const cat = bhGetAccountCategory(acc);
    if (!tree[cat.main]) tree[cat.main] = {};
    if (!tree[cat.main][cat.sub]) tree[cat.main][cat.sub] = {};
    if (!tree[cat.main][cat.sub][cat.detail]) tree[cat.main][cat.sub][cat.detail] = [];
    tree[cat.main][cat.sub][cat.detail].push(acc);
  });
  
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
  
  const totalAktiven = getClassTotal('Aktiven');
  
  const sumFremd = (tree['Passiven'] && tree['Passiven']['Kurzfristiges Fremdkapital'] ? 
    Object.keys(tree['Passiven']['Kurzfristiges Fremdkapital']).reduce((s, d) => s + tree['Passiven']['Kurzfristiges Fremdkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0) +
    (tree['Passiven'] && tree['Passiven']['Langfristiges Fremdkapital'] ? 
    Object.keys(tree['Passiven']['Langfristiges Fremdkapital']).reduce((s, d) => s + tree['Passiven']['Langfristiges Fremdkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0);
    
  const sumEkOhneErgebnis = tree['Passiven'] && tree['Passiven']['Eigenkapital'] ? 
    Object.keys(tree['Passiven']['Eigenkapital']).reduce((s, d) => s + tree['Passiven']['Eigenkapital'][d].reduce((sm, a) => sm + Number(a._endsaldo || 0), 0), 0) : 0;
    
  const sumErtrag = getClassTotal('Ertrag');
  const sumAufwand = getClassTotal('Aufwand');
  const gewinnVerlust = sumErtrag - sumAufwand;
  const totalPassiven = sumFremd + sumEkOhneErgebnis + gewinnVerlust;

  function getPrintRows(mainClass) {
    let html = '';
    if (!tree[mainClass]) return html;
    
    const subs = Object.keys(tree[mainClass]).sort((a,b) => {
      if (a.includes('Umlauf')) return -1;
      if (b.includes('Umlauf')) return 1;
      if (a.includes('Kurzfristig')) return -1;
      if (b.includes('Kurzfristig')) return 1;
      return 0;
    });
    
    subs.forEach(sub => {
      html += `<tr class="section-title"><td colspan="3">${sub}</td></tr>`;
      
      const details = Object.keys(tree[mainClass][sub]).sort();
      let subSum = 0;
      
      details.forEach(detail => {
        const accounts = tree[mainClass][sub][detail];
        accounts.sort((a, b) => parseInt(a.konto) - parseInt(b.konto));
        
        const detailSum = accounts.reduce((sum, acc) => sum + Number(acc._endsaldo || 0), 0);
        subSum += detailSum;
        
        accounts.forEach(acc => {
          html += `
            <tr class="detail-row">
              <td class="code">${acc.konto}</td>
              <td class="name">${acc.bezeichnung}</td>
              <td class="amount">${fmtChf(acc._endsaldo)}</td>
            </tr>
          `;
        });
      });
      
      if (mainClass === 'Passiven' && sub === 'Eigenkapital') {
        html += `
          <tr class="detail-row italic">
            <td class="code">2990</td>
            <td class="name" style="font-weight: bold;">Jahresergebnis (Erfolgsrechnung)</td>
            <td class="amount" style="font-weight: bold;">${fmtChf(gewinnVerlust)}</td>
          </tr>
        `;
        subSum += gewinnVerlust;
      }
      
      html += `
        <tr class="subtotal-row">
          <td colspan="2">Total ${sub}</td>
          <td class="amount">${fmtChf(subSum)}</td>
        </tr>
      `;
    });
    return html;
  }

  function getPrintErfolgsRows(mainClass) {
    let html = '';
    if (!tree[mainClass]) return html;
    const subs = Object.keys(tree[mainClass]).sort();
    subs.forEach(sub => {
      const details = Object.keys(tree[mainClass][sub]).sort();
      details.forEach(detail => {
        const accounts = tree[mainClass][sub][detail];
        accounts.sort((a, b) => parseInt(a.konto) - parseInt(b.konto));
        accounts.forEach(acc => {
          html += `
            <tr class="detail-row">
              <td class="code">${acc.konto}</td>
              <td class="name">${acc.bezeichnung}</td>
              <td class="amount">${fmtChf(acc._endsaldo)}</td>
            </tr>
          `;
        });
      });
    });
    return html;
  }

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Jahresrechnung Sportschützen Muhen - ${window._bhYear}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 40px; line-height: 1.4; }
          .header { text-align: center; margin-bottom: 40px; border-bottom: 3px double #333; padding-bottom: 20px; }
          .header h1 { margin: 0 0 10px 0; font-size: 26px; text-transform: uppercase; letter-spacing: 1px; }
          .header h2 { margin: 0; font-size: 18px; color: #555; font-weight: normal; }
          .section-header { font-size: 18px; font-weight: bold; border-bottom: 2px solid #333; margin: 30px 0 15px 0; padding-bottom: 5px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px; }
          th { border-bottom: 1.5px solid #333; text-align: left; padding: 6px 10px; font-weight: bold; }
          td { padding: 6px 10px; vertical-align: top; }
          .section-title { font-weight: bold; background-color: #f5f5f5; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }
          .section-title td { padding: 8px 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
          .detail-row { border-bottom: 1px solid #eee; }
          .detail-row.italic { font-style: italic; }
          .code { font-family: monospace; width: 60px; color: #666; }
          .amount { text-align: right; width: 150px; font-weight: 500; }
          .subtotal-row { font-weight: bold; border-bottom: 1.5px solid #333; border-top: 1px solid #333; }
          .total-row { font-weight: bold; font-size: 16px; border-bottom: 3px double #333; border-top: 2px solid #333; background-color: #eaeaea; }
          .total-row td { padding: 10px; }
          .signature-section { margin-top: 60px; page-break-inside: avoid; }
          .signature-grid { display: flex; justify-content: space-between; gap: 40px; margin-top: 30px; }
          .signature-box { border-top: 1px solid #333; width: 45%; pt: 10px; font-size: 13px; text-align: center; padding-top: 10px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
            @page { size: A4; margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Sportschützen Muhen</h1>
          <h2>Jahresrechnung & Finanzbericht für das Vereinsjahr ${window._bhYear}</h2>
        </div>

        <!-- 1. BILANZ -->
        <div class="section-header">Bilanz per 31. Dezember ${window._bhYear}</div>
        
        <table>
          <thead>
            <tr>
              <th class="code">Konto</th>
              <th>Aktiven (Vermögen)</th>
              <th class="amount">Saldo (CHF)</th>
            </tr>
          </thead>
          <tbody>
            ${getPrintRows('Aktiven')}
            <tr class="total-row">
              <td colspan="2">TOTAL AKTIVEN</td>
              <td class="amount">${fmtChf(totalAktiven)}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th class="code">Konto</th>
              <th>Passiven (Fremd- & Eigenkapital)</th>
              <th class="amount">Saldo (CHF)</th>
            </tr>
          </thead>
          <tbody>
            ${getPrintRows('Passiven')}
            <tr class="total-row">
              <td colspan="2">TOTAL PASSIVEN</td>
              <td class="amount">${fmtChf(totalPassiven)}</td>
            </tr>
          </tbody>
        </table>

        <div style="page-break-after: always;"></div>

        <!-- 2. ERFOLGSRECHNUNG -->
        <div class="section-header">Erfolgsrechnung vom 1. Jan. bis 31. Dez. ${window._bhYear}</div>
        
        <table>
          <thead>
            <tr>
              <th class="code">Konto</th>
              <th>Ertrag (Vereinseinnahmen)</th>
              <th class="amount">Betrag (CHF)</th>
            </tr>
          </thead>
          <tbody>
            ${getPrintErfolgsRows('Ertrag')}
            <tr class="subtotal-row">
              <td colspan="2">Total Erträge</td>
              <td class="amount">${fmtChf(sumErtrag)}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th class="code">Konto</th>
              <th>Aufwand (Vereinsausgaben)</th>
              <th class="amount">Betrag (CHF)</th>
            </tr>
          </thead>
          <tbody>
            ${getPrintErfolgsRows('Aufwand')}
            <tr class="subtotal-row">
              <td colspan="2">Total Aufwände</td>
              <td class="amount">${fmtChf(sumAufwand)}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr class="total-row" style="background-color: ${gewinnVerlust >= 0 ? '#d1e7dd' : '#f8d7da'}; color: ${gewinnVerlust >= 0 ? '#0f5132' : '#842029'};">
              <td colspan="2">${gewinnVerlust >= 0 ? 'VEREINSGEWINN (ÜBERSCHUSS)' : 'VEREINSVERLUST (DEFIZIT)'}</td>
              <td class="amount">${fmtChf(gewinnVerlust)}</td>
            </tr>
          </tbody>
        </table>

        <!-- 3. UNTERSCHRIFTEN -->
        <div class="signature-section">
          <p>Die Jahresrechnung wurde ordnungsgemäss erstellt und wird der Generalversammlung zur Genehmigung vorgelegt.</p>
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

