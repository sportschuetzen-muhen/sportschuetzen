// =====================================================================
// MODUL: BUCHHALTUNG - CONTROLLING & GRAPHICAL ANALYTICS
// =====================================================================

// Globale Referenzen für Diagramm-Instanzen, um Overlaps zu verhindern
window._bhCharts = {
  yoyChart: null,
  budgetChart: null,
  cashflowChart: null
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

// Diagramm 1: YoY Erfolgsentwicklung über alle Jahre
function bhRenderYoYChart() {
  const canvas = document.getElementById('bhYoYChart');
  if (!canvas) return;
  
  // Extrahiere alle Jahre aus dem Journal
  const jahreSet = new Set(window._bhJournal.map(j => Number(j.jahr || window._bhYear)));
  // Mindestens das aktive Jahr anzeigen
  jahreSet.add(window._bhYear);
  const jahre = Array.from(jahreSet).sort((a,b) => a - b);
  
  const ertraege = [];
  const aufwaende = [];
  const gewinne = [];
  
  jahre.forEach(yr => {
    let yrErtrag = 0;
    let yrAufwand = 0;
    
    // Berechne Ertrag und Aufwand pro Jahr
    window._bhKontenrahmen.forEach(acc => {
      const codeStr = String(acc.konto).trim();
      const firstDigit = codeStr[0];
      const accountCode = String(acc.konto).trim();
      
      let balanceChange = 0;
      const currentYearJournal = window._bhJournal.filter(j => Number(j.jahr) === yr);
      
      currentYearJournal.forEach(entry => {
        const soll = String(entry.konto_soll).trim();
        const haben = String(entry.konto_haben).trim();
        const amount = Number(entry.betrag || 0);
        
        const isAssetOrExpense = (firstDigit === '1' || firstDigit === '4' || firstDigit === '5' || firstDigit === '6' || firstDigit === '7' || firstDigit === '8');
        
        if (soll === accountCode) {
          balanceChange += isAssetOrExpense ? amount : -amount;
        }
        if (haben === accountCode) {
          balanceChange += isAssetOrExpense ? -amount : amount;
        }
      });
      
      const endsaldo = Number(acc.eroeffnungssaldo || 0) + balanceChange;
      
      if (firstDigit === '3') {
        yrErtrag += endsaldo;
      } else if (firstDigit === '4' || firstDigit === '5' || firstDigit === '6' || firstDigit === '7' || firstDigit === '8') {
        yrAufwand += endsaldo;
      }
    });
    
    ertraege.push(yrErtrag);
    aufwaende.push(yrAufwand);
    gewinne.push(yrErtrag - yrAufwand);
  });
  
  // Diagramm neu zeichnen
  if (window._bhCharts.yoyChart) window._bhCharts.yoyChart.destroy();
  
  window._bhCharts.yoyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: jahre.map(y => `Jahr ${y}`),
      datasets: [
        {
          label: 'Einnahmen (Ertrag)',
          data: ertraege,
          backgroundColor: 'rgba(25, 135, 84, 0.75)',
          borderColor: '#198754',
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: 'Ausgaben (Aufwand)',
          data: aufwaende,
          backgroundColor: 'rgba(220, 53, 69, 0.75)',
          borderColor: '#dc3545',
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: 'Netto-Gewinn/Verlust',
          data: gewinne,
          type: 'line',
          borderColor: '#0f3a5d',
          backgroundColor: 'rgba(15, 58, 93, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointStyle: 'circle',
          pointRadius: 6,
          pointHoverRadius: 8
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
