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
      
      const balance = balanceChange;
      
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
    'Mitglieder & Beiträge':     { ist: 0, soll: 0, isExpense: false },
    'Sponsoren & Spenden':       { ist: 0, soll: 0, isExpense: false },
    'Vermietung Schützenhaus':   { ist: 0, soll: 0, isExpense: false },
    'Übriger Ertrag':            { ist: 0, soll: 0, isExpense: false },
    'Schiessbetrieb & Munition': { ist: 0, soll: 0, isExpense: true },
    'Nachwuchs & Jungschützen':  { ist: 0, soll: 0, isExpense: true },
    'Gebäude & Unterhalt':       { ist: 0, soll: 0, isExpense: true },
    'Verwaltung & Verband':      { ist: 0, soll: 0, isExpense: true },
    'Übriger Aufwand':           { ist: 0, soll: 0, isExpense: true }
  };
  
  const processedKonten = new Set();

  window._bhKontenrahmen.forEach(acc => {
    const codeStr = String(acc.konto).trim();
    processedKonten.add(codeStr);
    const istVal = Math.abs(Number(acc._endsaldo || 0));
    const cat = bhGetAccountCategory(acc);
    
    // Budget direkt über Kontonummer matchen
    const bud = (window._bhBudget || []).find(b => String(b.konto).trim() === codeStr);
    const sollVal = bud ? Number(bud[activeBudgetCol] || 0) : 0;
    
    if (cat.main === 'Ertrag') {
      if (codeStr.startsWith('341') || codeStr.startsWith('342') || codeStr.startsWith('340') || codeStr.startsWith('34')) {
        categories['Mitglieder & Beiträge'].ist += istVal;
        categories['Mitglieder & Beiträge'].soll += sollVal;
      } else if (codeStr.startsWith('32')) {
        categories['Sponsoren & Spenden'].ist += istVal;
        categories['Sponsoren & Spenden'].soll += sollVal;
      } else if (codeStr.startsWith('3650') || /vermiet/i.test(acc.bezeichnung || '')) {
        categories['Vermietung Schützenhaus'].ist += istVal;
        categories['Vermietung Schützenhaus'].soll += sollVal;
      } else {
        categories['Übriger Ertrag'].ist += istVal;
        categories['Übriger Ertrag'].soll += sollVal;
      }
    } else if (cat.main === 'Aufwand') {
      if (codeStr.startsWith('41') || codeStr.startsWith('44') || codeStr.startsWith('40')) {
        categories['Schiessbetrieb & Munition'].ist += istVal;
        categories['Schiessbetrieb & Munition'].soll += sollVal;
      } else if (codeStr.startsWith('42')) {
        categories['Nachwuchs & Jungschützen'].ist += istVal;
        categories['Nachwuchs & Jungschützen'].soll += sollVal;
      } else if (codeStr.startsWith('60') || codeStr.startsWith('62') || codeStr.startsWith('64')) {
        categories['Gebäude & Unterhalt'].ist += istVal;
        categories['Gebäude & Unterhalt'].soll += sollVal;
      } else if (codeStr.startsWith('65') || codeStr.startsWith('69')) {
        categories['Verwaltung & Verband'].ist += istVal;
        categories['Verwaltung & Verband'].soll += sollVal;
      } else {
        categories['Übriger Aufwand'].ist += istVal;
        categories['Übriger Aufwand'].soll += sollVal;
      }
    }
  });

  // Auch reine Budget-Einträge ohne bisherige Kontenrahmen-Buchungen berücksichtigen
  (window._bhBudget || []).forEach(bud => {
    const codeStr = String(bud.konto).trim();
    if (!codeStr || processedKonten.has(codeStr)) return;
    const sollVal = Number(bud[activeBudgetCol] || 0);
    if (sollVal <= 0) return;

    if (codeStr.startsWith('341') || codeStr.startsWith('342') || codeStr.startsWith('34')) {
      categories['Mitglieder & Beiträge'].soll += sollVal;
    } else if (codeStr.startsWith('32')) {
      categories['Sponsoren & Spenden'].soll += sollVal;
    } else if (codeStr.startsWith('3650')) {
      categories['Vermietung Schützenhaus'].soll += sollVal;
    } else if (codeStr.startsWith('3')) {
      categories['Übriger Ertrag'].soll += sollVal;
    } else if (codeStr.startsWith('41') || codeStr.startsWith('44') || codeStr.startsWith('40')) {
      categories['Schiessbetrieb & Munition'].soll += sollVal;
    } else if (codeStr.startsWith('42')) {
      categories['Nachwuchs & Jungschützen'].soll += sollVal;
    } else if (codeStr.startsWith('60') || codeStr.startsWith('62') || codeStr.startsWith('64')) {
      categories['Gebäude & Unterhalt'].soll += sollVal;
    } else if (codeStr.startsWith('65') || codeStr.startsWith('69')) {
      categories['Verwaltung & Verband'].soll += sollVal;
    } else {
      categories['Übriger Aufwand'].soll += sollVal;
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
  
  // Sammle alle eindeutigen Konten aus Kontenrahmen und Budget
  const accountMap = new Map();
  
  // 1. Aus Kontenrahmen erfassen
  (window._bhKontenrahmen || []).forEach(acc => {
    const code = String(acc.konto).trim();
    if (!code) return;
    const cat = bhGetAccountCategory(acc);
    const isExpense = cat.main === 'Aufwand';
    const isRevenue = cat.main === 'Ertrag';
    const isOperating = isExpense || isRevenue;
    
    // Berechne Ist-Wert für das aktive Jahr
    const istVal = Math.abs(Number(acc._endsaldo || 0));
    
    accountMap.set(code, {
      konto: code,
      bezeichnung: acc.bezeichnung || '',
      catMain: cat.main,
      isExpense: isExpense,
      isOperating: isOperating,
      ist: istVal,
      soll: 0,
      hasBudgetEntry: false
    });
  });
  
  // 2. Aus Budget verknüpfen (oder neu anlegen falls im Kontenrahmen noch nicht vorhanden)
  (window._bhBudget || []).forEach(bud => {
    const code = String(bud.konto).trim();
    if (!code) return;
    const sollVal = Number(bud[activeBudgetCol] || 0);
    
    let item = accountMap.get(code);
    if (!item) {
      // Wenn Konto nicht im Kontenrahmen existiert, aus Budget ableiten
      const dummyAcc = { konto: code, bezeichnung: bud.bezeichnung || '' };
      const cat = bhGetAccountCategory(dummyAcc);
      const isExpense = cat.main === 'Aufwand';
      const isRevenue = cat.main === 'Ertrag';
      
      item = {
        konto: code,
        bezeichnung: bud.bezeichnung || `Konto ${code}`,
        catMain: cat.main,
        isExpense: isExpense,
        isOperating: isExpense || isRevenue,
        ist: 0,
        soll: sollVal,
        hasBudgetEntry: true
      };
      accountMap.set(code, item);
    } else {
      item.soll = sollVal;
      item.hasBudgetEntry = true;
      // Falls Bezeichnung im Kontenrahmen leer war, aber im Budget vorhanden
      if (!item.bezeichnung && bud.bezeichnung) {
        item.bezeichnung = bud.bezeichnung;
      }
    }
  });

  // 3. Filtere Konten:
  // Wir listen alle Konten auf, die entweder:
  // - Ein definiertes Budget haben (soll > 0 oder explizit in der Budget-Tabelle geführt)
  // - ODER tatsächliche Buchungen aufweisen (ist > 0)
  const relevantItems = Array.from(accountMap.values()).filter(item => {
    if (!item.isOperating) {
      // Bilanz-/Transitkonten (z.B. 1190) nur auflisten, wenn explizit im Budget oder gebucht
      return item.hasBudgetEntry || item.ist > 0;
    }
    return item.soll > 0 || item.ist > 0 || item.hasBudgetEntry;
  });

  // Sortierung: Ertrag zuerst, dann Aufwand, danach Bilanz/Transit; innerhalb nach Kontonummer aufsteigend
  relevantItems.sort((a, b) => {
    const orderA = a.catMain === 'Ertrag' ? 1 : a.catMain === 'Aufwand' ? 2 : 3;
    const orderB = b.catMain === 'Ertrag' ? 1 : b.catMain === 'Aufwand' ? 2 : 3;
    if (orderA !== orderB) return orderA - orderB;
    return Number(a.konto) - Number(b.konto);
  });
  
  let rowsHTML = '';
  let successfulBudgetsCount = 0;
  let totalBudgetsTracked = 0;
  
  relevantItems.forEach(item => {
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
      if (item.soll > 0) {
        if (percent <= 100) {
          isSuccess = true;
          colorClass = 'bg-success'; // Im Budget
        } else {
          colorClass = 'bg-danger'; // Überzogen!
        }
      } else {
        colorClass = item.ist > 0 ? 'bg-warning' : 'bg-secondary';
      }
    } else if (item.catMain === 'Ertrag') {
      // Bei Einnahmen ist mehr als Budget gut! (Erreichung >= 100%)
      if (item.soll > 0) {
        if (percent >= 100) {
          isSuccess = true;
          colorClass = 'bg-success';
        } else if (percent > 0) {
          colorClass = 'bg-info'; // Laufend
        } else {
          colorClass = 'bg-danger'; // Noch keine Einnahmen
        }
      } else {
        colorClass = item.ist > 0 ? 'bg-success' : 'bg-secondary';
      }
    } else {
      // Transit / Bilanzkonto
      colorClass = 'bg-secondary';
    }
    
    if (item.soll > 0) {
      totalBudgetsTracked++;
      if (isSuccess) successfulBudgetsCount++;
    }
    
    const progressPercent = item.soll > 0 ? Math.min(100, Math.max(0, percent)) : 0;
    const badgeText = item.soll > 0 ? `${percent.toFixed(0)}%` : (item.hasBudgetEntry ? '0%' : '–');
    
    // Typ-Badge
    let typeBadge = '';
    if (item.catMain === 'Ertrag') {
      typeBadge = '<span class="badge bg-success bg-opacity-75 text-white">Ertrag</span>';
    } else if (item.catMain === 'Aufwand') {
      typeBadge = '<span class="badge bg-danger bg-opacity-75 text-white">Aufwand</span>';
    } else {
      typeBadge = `<span class="badge bg-secondary bg-opacity-75 text-white">${escapeHtml(item.catMain || 'Transit')}</span>`;
    }

    // Differenz-Farbe
    let diffColorClass = 'text-muted';
    let diffPrefix = '';
    if (item.soll > 0 || item.ist > 0) {
      if (diff > 0) {
        diffPrefix = '+';
        diffColorClass = item.isExpense ? 'text-danger' : 'text-success';
      } else if (diff < 0) {
        diffColorClass = item.isExpense ? 'text-success' : 'text-danger';
      }
    }
    
    rowsHTML += `
      <tr class="bh-account-row">
        <td class="fw-bold text-dark">
          <span class="badge bg-light text-primary border me-2">${escapeHtml(item.konto)}</span>
          ${escapeHtml(item.bezeichnung || 'Ohne Bezeichnung')}
        </td>
        <td>${typeBadge}</td>
        <td class="text-end fw-semibold">${fmtChf(item.ist)}</td>
        <td class="text-end text-muted">${item.soll > 0 ? fmtChf(item.soll) : (item.hasBudgetEntry ? 'CHF 0.00' : '–')}</td>
        <td class="text-end fw-bold ${diffColorClass}">
          ${diffPrefix}${fmtChf(diff)}
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
  
  tbody.innerHTML = rowsHTML || '<tr><td colspan="6" class="text-center text-muted py-4">Keine budgetierten oder aktiven Konten für dieses Jahr gefunden.</td></tr>';
  
  // Performance-Indikator Badge oben aktualisieren
  const perfBadge = document.getElementById('bh-controlling-perf-badge');
  if (perfBadge) {
    if (totalBudgetsTracked > 0) {
      const successRate = (successfulBudgetsCount / totalBudgetsTracked) * 100;
      perfBadge.textContent = `${successfulBudgetsCount} von ${totalBudgetsTracked} Zielen im Budget (${successRate.toFixed(0)}% optimal)`;
      perfBadge.className = `badge ${successRate >= 70 ? 'bg-success' : successRate >= 40 ? 'bg-warning text-dark' : 'bg-danger'} px-3 py-1.5 rounded-pill shadow-sm`;
    } else {
      perfBadge.textContent = 'Keine Budget-Werte erfasst';
      perfBadge.className = 'badge bg-secondary px-3 py-1.5 rounded-pill shadow-sm';
    }
  }
}

// =====================================================================
// NEU: RENDERING: TAB 5 – GV-EXPORT & COCKPIT (Druckberichte, Wirtschafts-KPI & Struktur-Charts)
// =====================================================================
window.renderTabCockpit = function(container) {
  if (!container) return;
  
  container.innerHTML = `
    <!-- Top-Reihe: Zuteilungsquoten & Gemeinkostenschlüssel (Interaktiv & Variabel) -->
    <div class="row g-4 mb-4">
      <div class="col-12" id="bh-allocations-panel-container">
        <!-- Dynamisch gerendert durch bhRenderAllocationsPanel() -->
      </div>
    </div>

    <!-- 3 getrennte Controlling-Auswertungen (Vermietung, Wirtschaft & Anlässe, Mitglieder & Verband) -->
    <div class="row g-4 mb-4">
      <!-- Card 1: Schützenhaus-Vermietung: Ist die Vermietung rentabel? -->
      <div class="col-lg-4 col-md-6">
        <div class="bh-report-section shadow-sm border border-light h-100" id="bh-facility-roi-container">
          <div class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm" role="status"></div>
            <span class="ms-2 small text-muted">Lade Vermietungsrechnung...</span>
          </div>
        </div>
      </div>
      
      <!-- Card 2: Wirtschaft & Vereinsanlässe -->
      <div class="col-lg-4 col-md-6">
        <div class="bh-report-section shadow-sm border border-light h-100" id="bh-hospitality-container">
          <div class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm" role="status"></div>
            <span class="ms-2 small text-muted">Lade Wirtschaft & Anlässe...</span>
          </div>
        </div>
      </div>

      <!-- Card 3: Mitglieder- & Verbandskostenquote -->
      <div class="col-lg-4 col-md-12">
        <div class="bh-report-section shadow-sm border border-light h-100" id="bh-membership-quote-container">
          <div class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm" role="status"></div>
            <span class="ms-2 small text-muted">Lade Mitgliederquote...</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Sparten-Erfolgsrechnung (Tätigkeitsbereiche) -->
    <div class="row g-4 mb-4">
      <div class="col-12">
        <div class="bh-report-section shadow-sm border border-light" id="bh-sparten-container">
          <div class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm" role="status"></div>
            <span class="ms-2 small text-muted">Lade Sparten-Erfolgsrechnung...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Mehrjahres-Kostenstruktur-Trend (2000-2026) -->
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
    bhRenderAllocationsPanel();
    bhRenderFacilityROI();
    bhRenderHospitalityCard();
    bhRenderMembershipQuote();
    bhRenderSpartenErfolgsrechnung();
    bhRenderRevenueStructureChart();
    bhRenderExpenseStructureChart();
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
  return { inflow, outflow, balance: outflow - inflow };
}

function getTransitAccountsList(journalEntries) {
  const accountMap = new Map();
  
  // 1. Aus Kontenrahmen erfassen (alle mit 13xx oder 119x)
  (window._bhKontenrahmen || []).forEach(acc => {
    const code = String(acc.konto || '').trim();
    if (code.startsWith('13') || code.startsWith('119')) {
      accountMap.set(code, {
        konto: code,
        bezeichnung: acc.bezeichnung || ('Transitkonto ' + code)
      });
    }
  });

  // 2. Aus Journal erfassen (falls ein Konto bebucht wurde, das nicht im Kontenrahmen steht)
  (journalEntries || []).forEach(entry => {
    const s = String(entry.konto_soll || '').trim();
    const h = String(entry.konto_haben || '').trim();
    if ((s.startsWith('13') || s.startsWith('119')) && !accountMap.has(s)) {
      accountMap.set(s, { konto: s, bezeichnung: 'Transitkonto ' + s });
    }
    if ((h.startsWith('13') || h.startsWith('119')) && !accountMap.has(h)) {
      accountMap.set(h, { konto: h, bezeichnung: 'Transitkonto ' + h });
    }
  });

  // Sortiert nach Kontonummer
  return Array.from(accountMap.values()).sort((a, b) => a.konto.localeCompare(b.konto, undefined, { numeric: true }));
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
  const activeBudgetCol = `budget_${window._bhYear}`;
  
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
  
  const totalBudgetRevenues = revenues.reduce((sum, acc) => {
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    return sum + (bud ? Number(bud[activeBudgetCol] || 0) : 0);
  }, 0);

  const totalBudgetExpenses = expenses.reduce((sum, acc) => {
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    return sum + (bud ? Number(bud[activeBudgetCol] || 0) : 0);
  }, 0);
  
  const transitAccounts = getTransitAccountsList(journal);
  
  const revenueRows = revenues.map(acc => {
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    const budgetVal = bud ? Number(bud[activeBudgetCol] || 0) : 0;
    const istVal = Number(acc._endsaldo || 0);
    const diff = istVal - budgetVal;
    const diffColor = diff >= 0 ? 'text-success' : 'text-danger';
    const diffSign = diff >= 0 ? '+' : '';

    return `
      <tr class="bh-account-row">
        <td class="font-monospace text-muted" style="width: 70px;">${acc.konto}</td>
        <td class="fw-semibold text-dark">${acc.bezeichnung}</td>
        <td class="text-end fw-bold text-success">${fmtChf(istVal)}</td>
        <td class="text-end text-muted">${budgetVal > 0 ? fmtChf(budgetVal) : '–'}</td>
        <td class="text-end fw-bold ${diffColor}">${budgetVal > 0 ? diffSign + fmtChf(diff) : '–'}</td>
      </tr>
    `;
  }).join('');
  
  const expenseRows = expenses.map(acc => {
    const bud = window._bhBudget.find(b => String(b.konto).trim() === String(acc.konto).trim());
    const budgetVal = bud ? Number(bud[activeBudgetCol] || 0) : 0;
    const istVal = Number(acc._endsaldo || 0);
    const diff = istVal - budgetVal;
    const diffColor = diff <= 0 ? 'text-success' : 'text-danger';
    const diffSign = diff >= 0 ? '+' : '';

    return `
      <tr class="bh-account-row">
        <td class="font-monospace text-muted" style="width: 70px;">${acc.konto}</td>
        <td class="fw-semibold text-dark">${acc.bezeichnung}</td>
        <td class="text-end fw-bold text-danger">${fmtChf(istVal)}</td>
        <td class="text-end text-muted">${budgetVal > 0 ? fmtChf(budgetVal) : '–'}</td>
        <td class="text-end fw-bold ${diffColor}">${budgetVal > 0 ? diffSign + fmtChf(diff) : '–'}</td>
      </tr>
    `;
  }).join('');
  
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
              <th class="text-end" style="width: 110px;">Rechnung (Ist)</th>
              <th class="text-end" style="width: 110px;">Budget (Soll)</th>
              <th class="text-end" style="width: 110px;">Abweichung</th>
            </tr>
          </thead>
          <tbody>
            ${revenueRows.length > 0 ? revenueRows : '<tr><td colspan="5" class="text-center text-muted">Keine Erträge.</td></tr>'}
            <tr class="table-light fw-bold" style="border-top: 1.5px solid #198754;">
              <td colspan="2" class="text-success">Total Einnahmen / Erträge</td>
              <td class="text-end text-success">${fmtChf(totalRevenues)}</td>
              <td class="text-end text-muted">${totalBudgetRevenues > 0 ? fmtChf(totalBudgetRevenues) : '–'}</td>
              <td class="text-end ${totalRevenues >= totalBudgetRevenues ? 'text-success' : 'text-danger'}">${totalBudgetRevenues > 0 ? (totalRevenues >= totalBudgetRevenues ? '+' : '') + fmtChf(totalRevenues - totalBudgetRevenues) : '–'}</td>
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
              <th class="text-end" style="width: 110px;">Rechnung (Ist)</th>
              <th class="text-end" style="width: 110px;">Budget (Soll)</th>
              <th class="text-end" style="width: 110px;">Abweichung</th>
            </tr>
          </thead>
          <tbody>
            ${expenseRows.length > 0 ? expenseRows : '<tr><td colspan="5" class="text-center text-muted">Keine Aufwände.</td></tr>'}
            <tr class="table-light fw-bold" style="border-top: 1.5px solid #dc3545;">
              <td colspan="2" class="text-danger">Total Ausgaben / Aufwände</td>
              <td class="text-end text-danger">${fmtChf(totalExpenses)}</td>
              <td class="text-end text-muted">${totalBudgetExpenses > 0 ? fmtChf(totalBudgetExpenses) : '–'}</td>
              <td class="text-end ${totalExpenses <= totalBudgetExpenses ? 'text-success' : 'text-danger'}">${totalBudgetExpenses > 0 ? (totalExpenses >= totalBudgetExpenses ? '+' : '') + fmtChf(totalExpenses - totalBudgetExpenses) : '–'}</td>
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
              ${transitAccounts.length > 0 ? transitAccounts.map(tAcc => {
                const stats = calculateTransitStats(journal, tAcc.konto);
                return `
                  <tr>
                    <td class="font-monospace text-muted fw-bold">${tAcc.konto}</td>
                    <td><strong>${tAcc.bezeichnung}</strong></td>
                    <td class="text-end text-success">${fmtChf(stats.inflow)}</td>
                    <td class="text-end text-danger">${fmtChf(stats.outflow)}</td>
                    <td class="text-end fw-bold ${stats.balance === 0 ? 'text-dark' : 'text-primary'}">${fmtChf(stats.balance)}</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="5" class="text-center text-muted py-3">Keine aktiven Durchlauf- oder Transitkonten (13xx) im Kontenrahmen/Journal vorhanden.</td>
                </tr>
              `}
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

// =====================================================================
// INTERAKTIVES PANEL: ZUTEILUNGSQUOTEN & GEMEINKOSTENSCHLÜSSEL
// =====================================================================
window.bhRenderAllocationsPanel = function() {
  const container = document.getElementById('bh-allocations-panel-container');
  if (!container) return;

  const allocations = (window._bhCostAllocations && window._bhCostAllocations.length)
    ? window._bhCostAllocations 
    : window._bhDefaultAllocations;

  const hasWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('buchhaltung') : true;

  let html = `
    <div class="card shadow-sm border border-light rounded-3 overflow-hidden" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%);">
      <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center flex-wrap" style="gap: 12px;">
        <div>
          <h6 class="fw-bold text-primary mb-0 d-flex align-items-center">
            <i class="fas fa-sliders-h me-2 text-primary"></i>
            Zuteilungsquoten & Gemeinkostenschlüssel (Konfigurierbar)
          </h6>
          <p class="text-muted small mb-0 mt-0.5">
            Passe die Prozentsätze (%) an; alle 3 Auswertungen berechnen sich sofort live neu.
          </p>
        </div>
        <div class="d-flex align-items-center" style="gap: 8px;">
          ${hasWrite ? `
            <button class="btn btn-sm btn-primary fw-bold shadow-sm px-3" onclick="bhSaveCostAllocations()">
              <i class="fas fa-save me-1.5"></i>In DB speichern
            </button>
          ` : ''}
          <button class="btn btn-sm btn-outline-secondary px-2.5" onclick="bhResetCostAllocations()" title="Standardwerte wiederherstellen">
            <i class="fas fa-undo me-1"></i>Standard
          </button>
          <button class="btn btn-sm btn-light border px-2.5" type="button" data-bs-toggle="collapse" data-bs-target="#bh-alloc-collapse" aria-expanded="true" title="Ein-/Ausklappen">
            <i class="fas fa-chevron-down"></i>
          </button>
        </div>
      </div>
      
      <div class="collapse show" id="bh-alloc-collapse">
        <div class="card-body p-3">
          <div class="row g-3">
  `;

  allocations.forEach(alloc => {
    const quote = Number(alloc.quote_percent ?? 0);
    const badgeColor = quote >= 50 ? 'primary' : quote > 0 ? 'info' : 'secondary';
    
    html += `
      <div class="col-md-6 col-lg-4">
        <div class="p-2.5 rounded-3 border bg-white h-100 shadow-2xs">
          <div class="d-flex justify-content-between align-items-start mb-1">
            <span class="fw-bold small text-dark">${alloc.label}</span>
            <span class="badge bg-${badgeColor} rounded-pill font-monospace ms-2" id="bh-quote-badge-${alloc.key}">${quote.toFixed(0)}%</span>
          </div>
          <div class="small text-muted font-monospace mb-2" style="font-size: 11px;">
            <i class="fas fa-receipt me-1 text-secondary"></i>Konto: ${alloc.konten}
          </div>
          <div class="d-flex align-items-center" style="gap: 10px;">
            <input type="range" class="form-range flex-grow-1" min="0" max="100" step="5" value="${quote}" 
                   id="bh-slider-${alloc.key}" 
                   oninput="bhOnAllocationInput('${alloc.key}', this.value)" 
                   style="cursor: pointer;">
            <input type="number" class="form-control form-control-sm text-end font-monospace" min="0" max="100" step="5" value="${quote}" 
                   id="bh-num-${alloc.key}" 
                   onchange="bhOnAllocationInput('${alloc.key}', this.value)" 
                   style="width: 65px; font-weight: 600;">
          </div>
          <div class="small text-muted mt-1" style="font-size: 11px; line-height: 1.2;">
            ${alloc.beschreibung || ''}
          </div>
        </div>
      </div>
    `;
  });

  html += `
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
};

window.bhOnAllocationInput = function(key, val) {
  const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
  window.bhSetAllocationQuote(key, num);

  const slider = document.getElementById('bh-slider-' + key);
  const numInput = document.getElementById('bh-num-' + key);
  const badge = document.getElementById('bh-quote-badge-' + key);

  if (slider && Number(slider.value) !== num) slider.value = num;
  if (numInput && Number(numInput.value) !== num) numInput.value = num;
  if (badge) {
    badge.textContent = num.toFixed(0) + '%';
    badge.className = `badge bg-${num >= 50 ? 'primary' : num > 0 ? 'info' : 'secondary'} rounded-pill font-monospace ms-2`;
  }

  // Live Neuberechnung aller 3 Fachkarten + Spartenrechnung
  bhRenderFacilityROI();
  bhRenderHospitalityCard();
  bhRenderMembershipQuote();
  bhRenderSpartenErfolgsrechnung();
};

// =====================================================================
// AUSWERTUNG 1: SCHÜTZENHAUS-VERMIETUNG (Rentabilität & Deckungsbeitrag)
// =====================================================================
function bhRenderFacilityROI() {
  const container = document.getElementById('bh-facility-roi-container');
  if (!container) return;

  const currentYear = Number(window._bhYear);
  const currentJournal = (window._bhJournal || []).filter(j => Number(j.jahr) === currentYear);

  const qEntschaedigung = bhGetAllocationQuote('vermietung_entschaedigung_4011', 100);
  const qReinigung = bhGetAllocationQuote('vermietung_reinigung_4010', 70);
  const qEnergie = bhGetAllocationQuote('vermietung_energie_6400', 30);
  const qUnterhalt = bhGetAllocationQuote('vermietung_unterhalt_6000', 10);
  const qVersicherung = bhGetAllocationQuote('vermietung_versicherung_6301', 10);

  let rev3650 = 0;
  let exp4011 = 0;
  let exp4010 = 0;
  let exp4002 = 0;
  let exp6400 = 0;
  let exp6000 = 0;
  let exp6301 = 0;
  let exp6302 = 0;

  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const balance = Number(acc._endsaldo || 0);

    if (code === '3650') rev3650 += balance;
    else if (code === '4011') exp4011 += balance;
    else if (code === '4010') exp4010 += balance;
    else if (code === '4002') exp4002 += balance;
    else if (code === '6400') exp6400 += balance;
    else if (code === '6000' || code === '6010') exp6000 += balance;
    else if (code === '6301') exp6301 += balance;
    else if (code === '6302') exp6302 += balance;
  });

  const costEntschaedigung = exp4011 * (qEntschaedigung / 100);
  const costReinigung = (exp4010 + exp4002) * (qReinigung / 100);
  const costEnergie = exp6400 * (qEnergie / 100);
  const costUnterhalt = exp6000 * (qUnterhalt / 100);
  const costVersicherung = (exp6301 + exp6302) * (qVersicherung / 100);

  const totalCost = costEntschaedigung + costReinigung + costEnergie + costUnterhalt + costVersicherung;
  const netContribution = rev3650 - totalCost;
  const marginPercent = rev3650 > 0 ? (netContribution / rev3650) * 100 : 0;

  // Zähle Anzahl Miet-Gutschriften im Journal
  const rentalEntries = currentJournal.filter(j => String(j.konto_haben).trim() === '3650');
  const rentalCount = rentalEntries.length;
  const avgContributionPerRental = rentalCount > 0 ? (netContribution / rentalCount) : 0;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="fw-bold text-primary mb-0 d-flex align-items-center">
        <i class="fas fa-hotel me-2"></i>1. Schützenhaus-Vermietung
      </h6>
      <span class="badge bg-primary px-2 py-1" style="font-size: 10px;">Jahr ${currentYear}</span>
    </div>
    
    <div class="row g-2 mb-3">
      <div class="col-6">
        <div class="p-2.5 rounded-3 bg-light border border-light text-center">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Mietertrag (3650)</div>
          <div class="fw-bold text-dark mt-0.5" style="font-size: 15px;">${fmtChf(rev3650)}</div>
        </div>
      </div>
      <div class="col-6">
        <div class="p-2.5 rounded-3 border text-center" style="background-color: ${netContribution >= 0 ? 'rgba(25,135,84,0.06)' : 'rgba(220,53,69,0.06)'}; border-color: ${netContribution >= 0 ? '#198754' : '#dc3545'} !important;">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Vermietungsbeitrag</div>
          <div class="fw-bold mt-0.5 ${netContribution >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 15px;">${fmtChf(netContribution)}</div>
        </div>
      </div>
    </div>
    
    <div class="small mb-3">
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Vermietungsentschädigung (4011 <span class="badge bg-light text-secondary border py-0">${qEntschaedigung}%</span>):</span>
        <span class="text-danger fw-semibold">-${fmtChf(costEntschaedigung)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Reinigung & Verbrauch (4010/02 <span class="badge bg-light text-secondary border py-0">${qReinigung}%</span>):</span>
        <span class="text-danger fw-semibold">-${fmtChf(costReinigung)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Energie & Wasser (6400 <span class="badge bg-light text-secondary border py-0">${qEnergie}%</span>):</span>
        <span class="text-danger fw-semibold">-${fmtChf(costEnergie)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Gebäudeunterhalt (6000 <span class="badge bg-light text-secondary border py-0">${qUnterhalt}%</span>):</span>
        <span class="text-danger fw-semibold">-${fmtChf(costUnterhalt)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Versicherungen (6301/02 <span class="badge bg-light text-secondary border py-0">${qVersicherung}%</span>):</span>
        <span class="text-danger fw-semibold">-${fmtChf(costVersicherung)}</span>
      </div>
      <div class="d-flex justify-content-between pt-1 border-top fw-bold">
        <span>Zugeordnete Gesamtkosten:</span>
        <span class="text-danger">-${fmtChf(totalCost)}</span>
      </div>
    </div>

    <div class="d-flex justify-content-between mb-2 pt-2 border-top small fw-bold">
      <span class="text-muted">Vermietungsmarge:</span>
      <span class="${marginPercent >= 40 ? 'text-success' : marginPercent >= 20 ? 'text-primary' : 'text-danger'}">${marginPercent.toFixed(1)}%</span>
    </div>
    
    <div class="progress mb-2" style="height: 8px; background-color: #e9ecef; border-radius: 4px; overflow: hidden;">
      <div class="progress-bar ${marginPercent >= 40 ? 'bg-success' : marginPercent >= 20 ? 'bg-primary' : 'bg-danger'}" role="progressbar" style="width: ${Math.max(0, Math.min(100, marginPercent))}%;" aria-valuenow="${marginPercent}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>
    <div class="d-flex justify-content-between small text-muted pt-1" style="font-size: 11px;">
      <span>Anzahl Buchungen: <strong>${rentalCount}</strong></span>
      <span>Ø Netto / Event: <strong>${fmtChf(avgContributionPerRental)}</strong></span>
    </div>
  `;
}

// =====================================================================
// AUSWERTUNG 2: FESTWIRTSCHAFT & VEREINSANLÄSSE
// =====================================================================
function bhRenderHospitalityCard() {
  const container = document.getElementById('bh-hospitality-container');
  if (!container) return;

  const currentYear = Number(window._bhYear);

  const qWirtReinigung = bhGetAllocationQuote('wirtschaft_reinigung_4010', 30);
  const qAnlaesseAbzug = bhGetAllocationQuote('wirtschaft_anlaesse_abzug', 15);

  let rev3651 = 0;
  let exp4000 = 0;
  let exp4001 = 0;
  let exp4002 = 0;
  let exp4010 = 0;

  // Vereinsanlässe
  let rev3631 = 0;
  let rev3632 = 0;
  let exp4020 = 0;

  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const balance = Number(acc._endsaldo || 0);

    if (code === '3651') rev3651 += balance;
    else if (code === '4000') exp4000 += balance;
    else if (code === '4001') exp4001 += balance;
    else if (code === '4002') exp4002 += balance;
    else if (code === '4010') exp4010 += balance;
    else if (code === '3631') rev3631 += balance;
    else if (code === '3632') rev3632 += balance;
    else if (code === '4020') exp4020 += balance;
  });

  const wareneinsatzBrutto = exp4000 + exp4001 + exp4002;
  const anlaesseAbzug = wareneinsatzBrutto * (qAnlaesseAbzug / 100);
  const wareneinsatzNetto = Math.max(0, wareneinsatzBrutto - anlaesseAbzug);
  const costReinigung = (exp4010 + exp4002) * (qWirtReinigung / 100);

  const totalWirtExpense = wareneinsatzNetto + costReinigung;
  const wirtErgebnis = rev3651 - totalWirtExpense;
  const wirtMarge = rev3651 > 0 ? ((rev3651 - wareneinsatzNetto) / rev3651) * 100 : 0;

  // Vereinsanlässe
  const revAnlaesse = rev3631 + rev3632;
  const expAnlaesse = exp4020 + anlaesseAbzug;
  const anlaesseErgebnis = revAnlaesse - expAnlaesse;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="fw-bold text-primary mb-0 d-flex align-items-center">
        <i class="fas fa-beer me-2"></i>2. Wirtschaft & Anlässe
      </h6>
      <span class="badge bg-primary px-2 py-1" style="font-size: 10px;">Jahr ${currentYear}</span>
    </div>
    
    <div class="row g-2 mb-3">
      <div class="col-6">
        <div class="p-2.5 rounded-3 bg-light border border-light text-center">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Wirtschaftsertrag (3651)</div>
          <div class="fw-bold text-dark mt-0.5" style="font-size: 15px;">${fmtChf(rev3651)}</div>
        </div>
      </div>
      <div class="col-6">
        <div class="p-2.5 rounded-3 border text-center" style="background-color: ${wirtErgebnis >= 0 ? 'rgba(25,135,84,0.06)' : 'rgba(220,53,69,0.06)'}; border-color: ${wirtErgebnis >= 0 ? '#198754' : '#dc3545'} !important;">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Wirtschaftsergebnis</div>
          <div class="fw-bold mt-0.5 ${wirtErgebnis >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 15px;">${fmtChf(wirtErgebnis)}</div>
        </div>
      </div>
    </div>
    
    <div class="small mb-3">
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Wareneinsatz brutto (4000/01/02):</span>
        <span class="text-dark fw-semibold">${fmtChf(wareneinsatzBrutto)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Abzug Vereinsanlässe (<span class="badge bg-light text-secondary border py-0">${qAnlaesseAbzug}%</span>):</span>
        <span class="text-success fw-semibold">-${fmtChf(anlaesseAbzug)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Wareneinsatz bereinigt netto:</span>
        <span class="text-danger fw-semibold">-${fmtChf(wareneinsatzNetto)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Reinigung Wirtschaft (4010 <span class="badge bg-light text-secondary border py-0">${qWirtReinigung}%</span>):</span>
        <span class="text-danger fw-semibold">-${fmtChf(costReinigung)}</span>
      </div>
      <div class="d-flex justify-content-between pt-1 border-top fw-bold">
        <span>Wirtschaftsaufwand total:</span>
        <span class="text-danger">-${fmtChf(totalWirtExpense)}</span>
      </div>
    </div>

    <div class="d-flex justify-content-between mb-2 pt-2 border-top small fw-bold">
      <span class="text-muted">Wirtschaftsmarge:</span>
      <span class="${wirtMarge >= 40 ? 'text-success' : wirtMarge >= 15 ? 'text-primary' : 'text-danger'}">${wirtMarge.toFixed(1)}%</span>
    </div>
    
    <div class="progress mb-2" style="height: 8px; background-color: #e9ecef; border-radius: 4px; overflow: hidden;">
      <div class="progress-bar ${wirtMarge >= 40 ? 'bg-success' : wirtMarge >= 15 ? 'bg-primary' : 'bg-danger'}" role="progressbar" style="width: ${Math.max(0, Math.min(100, wirtMarge))}%;" aria-valuenow="${wirtMarge}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>

    <div class="p-2 rounded-2 bg-light border mt-2 small" style="font-size: 11px;">
      <div class="d-flex justify-content-between fw-semibold">
        <span class="text-muted"><i class="fas fa-bullhorn me-1 text-primary"></i>Vereinsanlässe (3631/32 vs 4020):</span>
        <span class="${anlaesseErgebnis >= 0 ? 'text-success' : 'text-danger'} fw-bold">${fmtChf(anlaesseErgebnis)}</span>
      </div>
      <div class="text-muted mt-0.5">Ertrag: ${fmtChf(revAnlaesse)} | Aufwand (inkl. Anteil Ware): ${fmtChf(expAnlaesse)}</div>
    </div>
  `;
}

// =====================================================================
// AUSWERTUNG 3: MITGLIEDER- UND VERBANDSKOSTENQUOTE
// =====================================================================
function bhRenderMembershipQuote() {
  const container = document.getElementById('bh-membership-quote-container');
  if (!container) return;

  const activeMembers = window._bhActiveMembersCount || 53;

  let rev3410 = 0;
  let rev3411 = 0;
  let rev3412 = 0;
  let exp4400 = 0;
  let exp4401 = 0;

  // Erweiterte Sportbetriebskosten
  let exp4410 = 0;
  let exp4420 = 0;
  let exp4421 = 0;
  let exp4430 = 0;
  let exp4431 = 0;
  let exp4210 = 0;
  let exp4211 = 0;

  window._bhKontenrahmen.forEach(acc => {
    const code = String(acc.konto).trim();
    const balance = Number(acc._endsaldo || 0);

    if (code === '3410') rev3410 += balance;
    else if (code === '3411') rev3411 += balance;
    else if (code === '3412') rev3412 += balance;
    else if (code === '4400') exp4400 += balance;
    else if (code === '4401') exp4401 += balance;
    else if (code === '4410') exp4410 += balance;
    else if (code === '4420') exp4420 += balance;
    else if (code === '4421') exp4421 += balance;
    else if (code === '4430') exp4430 += balance;
    else if (code === '4431') exp4431 += balance;
    else if (code === '4210') exp4210 += balance;
    else if (code === '4211') exp4211 += balance;
  });

  const totalMembersRev = rev3410 + rev3411;
  const totalVerbandExp = exp4400 + exp4401;

  const costPerMember = activeMembers > 0 ? (totalVerbandExp / activeMembers) : 0;
  const deckungPerMember = activeMembers > 0 ? ((totalMembersRev - totalVerbandExp) / activeMembers) : 0;
  const quotePercent = totalMembersRev > 0 ? (totalVerbandExp / totalMembersRev) * 100 : 0;
  const deckungQuote = Math.max(0, 100 - quotePercent);

  const retainedRevenue = totalMembersRev - totalVerbandExp;
  const totalSportExpense = totalVerbandExp + exp4410 + exp4420 + exp4421 + exp4430 + exp4431 + exp4210 + exp4211;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="fw-bold text-primary mb-0 d-flex align-items-center">
        <i class="fas fa-users-cog me-2"></i>3. Mitglieder & Verbandskosten
      </h6>
      <span class="badge bg-primary px-2 py-1" style="font-size: 10px;">${activeMembers} Aktive Schützen</span>
    </div>
    
    <div class="row g-2 mb-3">
      <div class="col-6">
        <div class="p-2.5 rounded-3 bg-light border border-light text-center">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Beiträge Aktive (3410/11)</div>
          <div class="fw-bold text-dark mt-0.5" style="font-size: 15px;">${fmtChf(totalMembersRev)}</div>
        </div>
      </div>
      <div class="col-6">
        <div class="p-2.5 rounded-3 border text-center" style="background-color: ${retainedRevenue >= 0 ? 'rgba(25,135,84,0.06)' : 'rgba(220,53,69,0.06)'}; border-color: ${retainedRevenue >= 0 ? '#198754' : '#dc3545'} !important;">
          <div class="small text-muted fw-semibold" style="font-size: 10px;">Deckungsbeitrag Verein</div>
          <div class="fw-bold mt-0.5 ${retainedRevenue >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 15px;">${fmtChf(retainedRevenue)}</div>
        </div>
      </div>
    </div>
    
    <div class="small mb-3">
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Mitgliederbeiträge Aktive (3410):</span>
        <span class="text-dark fw-semibold">${fmtChf(rev3410)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Lizenzgebühren Aktive (3411):</span>
        <span class="text-dark fw-semibold">${fmtChf(rev3411)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Verbandsabgaben SSV/AGSV (4400):</span>
        <span class="text-danger fw-semibold">-${fmtChf(exp4400)}</span>
      </div>
      <div class="d-flex justify-content-between mb-1.5">
        <span class="text-muted">Lizenzgebühren bezahlt (4401):</span>
        <span class="text-danger fw-semibold">-${fmtChf(exp4401)}</span>
      </div>
      <div class="d-flex justify-content-between pt-1 border-top fw-bold">
        <span>Verbandsabgaben total:</span>
        <span class="text-danger">-${fmtChf(totalVerbandExp)}</span>
      </div>
    </div>

    <div class="d-flex justify-content-between mb-2 pt-2 border-top small fw-bold">
      <span class="text-muted">Kostenquote Verband / Einnahmen:</span>
      <span class="${quotePercent <= 40 ? 'text-success' : quotePercent <= 60 ? 'text-primary' : 'text-danger'}">${quotePercent.toFixed(1)}%</span>
    </div>
    
    <div class="progress mb-2" style="height: 8px; background-color: #e9ecef; border-radius: 4px; overflow: hidden;">
      <div class="progress-bar ${quotePercent <= 40 ? 'bg-success' : quotePercent <= 60 ? 'bg-primary' : 'bg-danger'}" role="progressbar" style="width: ${Math.max(0, Math.min(100, quotePercent))}%;" aria-valuenow="${quotePercent}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>

    <div class="p-2 rounded-2 bg-light border mt-2 small" style="font-size: 11px;">
      <div class="d-flex justify-content-between">
        <span>Verbandskosten / Kopf: <strong>${fmtChf(costPerMember)}</strong></span>
        <span>Deckung / Kopf: <strong class="text-success">${fmtChf(deckungPerMember)}</strong></span>
      </div>
      <div class="d-flex justify-content-between text-muted mt-1 pt-1 border-top">
        <span>Sportbetriebsaufwand gesamt (inkl. Meisterschaften/Munition):</span>
        <span class="fw-bold text-dark">${fmtChf(totalSportExpense)}</span>
      </div>
    </div>
  `;
}

// =====================================================================
// AUSWERTUNG 4: SPARTEN-ERFOLGSRECHNUNG (Tätigkeitsbereiche)
// =====================================================================
function bhRenderSpartenErfolgsrechnung() {
  const container = document.getElementById('bh-sparten-container');
  if (!container) return;

  const currentYear = Number(window._bhYear);

  // Quoten
  const qEntschaedigung = bhGetAllocationQuote('vermietung_entschaedigung_4011', 100);
  const qReinigung = bhGetAllocationQuote('vermietung_reinigung_4010', 70);
  const qEnergie = bhGetAllocationQuote('vermietung_energie_6400', 30);
  const qUnterhalt = bhGetAllocationQuote('vermietung_unterhalt_6000', 10);
  const qVersicherung = bhGetAllocationQuote('vermietung_versicherung_6301', 10);
  const qWirtReinigung = bhGetAllocationQuote('wirtschaft_reinigung_4010', 30);
  const qAnlaesseAbzug = bhGetAllocationQuote('wirtschaft_anlaesse_abzug', 15);

  const getBal = (code) => {
    const acc = window._bhKontenrahmen.find(a => String(a.konto).trim() === String(code).trim());
    return acc ? Number(acc._endsaldo || 0) : 0;
  };

  // 1. Wirtschaft
  const wirtErtrag = getBal('3651');
  const wareneinsatzBrutto = getBal('4000') + getBal('4001') + getBal('4002');
  const anlaesseAbzug = wareneinsatzBrutto * (qAnlaesseAbzug / 100);
  const wirtAufwand = (wareneinsatzBrutto - anlaesseAbzug) + ((getBal('4010') + getBal('4002')) * (qWirtReinigung / 100));

  // 2. Vermietung
  const vermietungErtrag = getBal('3650');
  const vermietungAufwand = (getBal('4011') * (qEntschaedigung / 100)) +
                           ((getBal('4010') + getBal('4002')) * (qReinigung / 100)) +
                           (getBal('6400') * (qEnergie / 100)) +
                           (getBal('6000') * (qUnterhalt / 100)) +
                           ((getBal('6301') + getBal('6302')) * (qVersicherung / 100));

  // 3. Schiessbetrieb 50m
  const s50Ertrag = getBal('3630');
  const s50Aufwand = getBal('4100') + getBal('4211') + getBal('4420') + getBal('4421') + (getBal('6001') * 0.7);

  // 4. Schiessbetrieb 10m
  const s10Ertrag = 0;
  const s10Aufwand = getBal('4101') + getBal('4430') + getBal('4431') + (getBal('6001') * 0.3);

  // 5. Vereinsanlässe
  const anlassErtrag = getBal('3631') + getBal('3632');
  const anlassAufwand = getBal('4020') + anlaesseAbzug;

  // 6. Mitgliederbeiträge
  const mitgliederErtrag = getBal('3410') + getBal('3412') + getBal('3413');
  const mitgliederAufwand = 0;

  // 7. Verbands- und Lizenzwesen
  const verbandErtrag = getBal('3411') + getBal('3421');
  const verbandAufwand = getBal('4400') + getBal('4401') + getBal('4410');

  // 8. Jugendförderung
  const jugendErtrag = getBal('3423') + getBal('3424');
  const jugendAufwand = getBal('4210');

  // 9. Allgemeiner Gebäudebetrieb (verbleibende Gemeinkosten)
  const restReinigungQuote = Math.max(0, 100 - qReinigung - qWirtReinigung);
  const restEnergieQuote = Math.max(0, 100 - qEnergie);
  const restUnterhaltQuote = Math.max(0, 100 - qUnterhalt);
  const restVersicherungQuote = Math.max(0, 100 - qVersicherung);

  const gebaeudeErtrag = 0;
  const gebaeudeAufwand = (getBal('6000') * (restUnterhaltQuote / 100)) +
                          getBal('6002') + getBal('6003') + getBal('6006') + getBal('6010') +
                          (getBal('6400') * (restEnergieQuote / 100)) +
                          ((getBal('6301') + getBal('6302')) * (restVersicherungQuote / 100)) +
                          ((getBal('4010') + getBal('4002')) * (restReinigungQuote / 100));

  // 10. Administration & IT
  const adminErtrag = 0;
  const adminAufwand = getBal('6500') + getBal('6510') + getBal('6520') + getBal('6700') + getBal('6702');

  // 11. Finanzergebnis
  const finanzErtrag = getBal('8110');
  const finanzAufwand = getBal('6940');

  // 12. Kleidergeschäft Netto
  const kleiderErtrag = getBal('8121');
  const kleiderAufwand = getBal('8501');

  // 13. Sponsoring & Spenden
  const sponsorErtrag = getBal('3800');
  const sponsorAufwand = 0;

  const sparten = [
    { name: 'Wirtschaft (Stubenbetrieb)', ertragKonti: '3651', ertrag: wirtErtrag, aufwandKonti: '4000-02, 4010 anteilig', aufwand: wirtAufwand },
    { name: 'Schützenhaus-Vermietung', ertragKonti: '3650', ertrag: vermietungErtrag, aufwandKonti: '4011, 4010, 6000, 63xx, 6400 anteilig', aufwand: vermietungAufwand },
    { name: 'Schiessbetrieb 50m (KK)', ertragKonti: '3630', ertrag: s50Ertrag, aufwandKonti: '4100, 4211, 4420/21, 6001', aufwand: s50Aufwand },
    { name: 'Schiessbetrieb 10m (LG)', ertragKonti: '–', ertrag: s10Ertrag, aufwandKonti: '4101, 4430/31, 6001', aufwand: s10Aufwand },
    { name: 'Vereinsanlässe & Feste', ertragKonti: '3631, 3632', ertrag: anlassErtrag, aufwandKonti: '4020, Anteil Wareneinsatz', aufwand: anlassAufwand },
    { name: 'Mitgliederbeiträge', ertragKonti: '3410, 3412, 3413', ertrag: mitgliederErtrag, aufwandKonti: '–', aufwand: mitgliederAufwand },
    { name: 'Verbands- & Lizenzwesen', ertragKonti: '3411, 3421', ertrag: verbandErtrag, aufwandKonti: '4400, 4401, 4410', aufwand: verbandAufwand },
    { name: 'Jugendförderung & J&S', ertragKonti: '3423, 3424', ertrag: jugendErtrag, aufwandKonti: '4210', aufwand: jugendAufwand },
    { name: 'Sponsoring, Gönner & Spenden', ertragKonti: '3800', ertrag: sponsorErtrag, aufwandKonti: '–', aufwand: sponsorAufwand },
    { name: 'Allgemeiner Gebäudebetrieb', ertragKonti: '–', ertrag: gebaeudeErtrag, aufwandKonti: '60xx, 63xx, 6400 (Restanteil)', aufwand: gebaeudeAufwand },
    { name: 'Administration, IT & Verein', ertragKonti: '–', ertrag: adminErtrag, aufwandKonti: '6500-20, 6700-02', aufwand: adminAufwand },
    { name: 'Finanzergebnis', ertragKonti: '8110', ertrag: finanzErtrag, aufwandKonti: '6940 Bankspesen', aufwand: finanzAufwand },
    { name: 'Kleidergeschäft (Netto)', ertragKonti: '8121', ertrag: kleiderErtrag, aufwandKonti: '8501', aufwand: kleiderAufwand }
  ];

  let totalErtrag = 0;
  let totalAufwand = 0;

  let tbodyHtml = '';
  sparten.forEach(s => {
    totalErtrag += s.ertrag;
    totalAufwand += s.aufwand;
    const diff = s.ertrag - s.aufwand;
    const isPositive = diff >= 0;

    tbodyHtml += `
      <tr>
        <td class="fw-bold ps-3">${s.name}</td>
        <td class="small text-muted font-monospace">${s.ertragKonti}</td>
        <td class="text-end fw-semibold text-dark">${s.ertrag > 0 ? fmtChf(s.ertrag) : '<span class="text-muted">–</span>'}</td>
        <td class="small text-muted font-monospace">${s.aufwandKonti}</td>
        <td class="text-end fw-semibold text-danger">${s.aufwand > 0 ? '-' + fmtChf(s.aufwand) : '<span class="text-muted">–</span>'}</td>
        <td class="text-end fw-bold ${isPositive ? 'text-success' : 'text-danger'}">${fmtChf(diff)}</td>
        <td class="text-center">
          <span class="badge ${isPositive ? 'bg-success' : 'bg-danger'} rounded-pill px-2.5 py-1">
            ${isPositive ? '+ Deckung' : '- Verlust'}
          </span>
        </td>
      </tr>
    `;
  });

  const gesamtergebnis = totalErtrag - totalAufwand;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap" style="gap: 12px;">
      <div>
        <h5 class="fw-bold text-primary mb-1">
          <i class="fas fa-layer-group me-2"></i>Sparten-Erfolgsrechnung (Tätigkeitsbereiche ${currentYear})
        </h5>
        <p class="text-muted small mb-0">
          Gegenüberstellung von Erträgen und Aufwänden nach operativen Verantwortungsbereichen unter Berücksichtigung der Zuteilungsquoten.
        </p>
      </div>
      <div class="text-end">
        <span class="small text-muted d-block">Operatives Vereinsergebnis:</span>
        <span class="fw-bold fs-5 ${gesamtergebnis >= 0 ? 'text-success' : 'text-danger'}">${fmtChf(gesamtergebnis)}</span>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-hover align-middle bh-table mb-0">
        <thead>
          <tr>
            <th class="ps-3">Tätigkeitsbereich</th>
            <th>Ertragskonti</th>
            <th class="text-end">Ertrag</th>
            <th>Aufwandskonti</th>
            <th class="text-end">Aufwand</th>
            <th class="text-end">Netto-Ergebnis</th>
            <th class="text-center" style="width: 120px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyHtml}
        </tbody>
        <tfoot>
          <tr class="bh-total-line fs-6">
            <td colspan="2" class="ps-3 fw-bold">Gesamttotal Verein (${currentYear})</td>
            <td class="text-end fw-bold text-dark">${fmtChf(totalErtrag)}</td>
            <td></td>
            <td class="text-end fw-bold text-danger">-${fmtChf(totalAufwand)}</td>
            <td class="text-end fw-bold ${gesamtergebnis >= 0 ? 'text-success' : 'text-danger'}">${fmtChf(gesamtergebnis)}</td>
            <td class="text-center">
              <span class="badge ${gesamtergebnis >= 0 ? 'bg-success' : 'bg-danger'} px-3 py-1.5 fs-7">
                ${gesamtergebnis >= 0 ? 'Gewinn' : 'Verlust'}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
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
    
    // Transitkonten (dynamisch 13xx / 119x)
    const transitAccountsCsv = getTransitAccountsList(filteredJournal);
    transitAccountsCsv.forEach(tAcc => {
      const stats = calculateTransitStats(filteredJournal, tAcc.konto);
      csvRows.push(`${tAcc.konto};"${(tAcc.bezeichnung || '').replace(/"/g, '""')}";Transit;${stats.inflow.toFixed(2)};${stats.outflow.toFixed(2)};${stats.balance.toFixed(2)}`);
    });
    
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
    
    const transitAccountsPrint = getTransitAccountsList(filteredJournal);
    
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
          ${transitAccountsPrint.length > 0 ? transitAccountsPrint.map(tAcc => {
            const stats = calculateTransitStats(filteredJournal, tAcc.konto);
            return `
              <tr class="detail-row">
                <td class="code fw-bold">${tAcc.konto}</td>
                <td><strong>${tAcc.bezeichnung}</strong></td>
                <td class="amount" style="color:#198754;">${fmtChf(stats.inflow)}</td>
                <td class="amount" style="color:#dc3545;">${fmtChf(stats.outflow)}</td>
                <td class="amount" style="font-weight:bold;">${fmtChf(stats.balance)}</td>
              </tr>
            `;
          }).join('') : `
            <tr class="detail-row">
              <td colspan="5" style="text-align:center; color:#888;">Keine aktiven Durchlauf- oder Transitkonten vorhanden.</td>
            </tr>
          `}
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

