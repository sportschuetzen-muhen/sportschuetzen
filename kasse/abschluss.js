/**
 * abschluss.js - Kassensturz, Z-Abschluss & SOLL/IST-Zählprotokoll (Phase 2)
 * Sportschützen Muhen
 * Vollständige Bargeldzählung nach Schweizer Münzen & Noten, Depotabrechnung und Z-Bericht
 */

const KassenAbschluss = (function () {
  // Schweizer Währungsstückelungen
  const DENOMINATIONS = [
    { key: 'c005', label: '5 Rappen', factor: 0.05, isCoin: true },
    { key: 'c010', label: '10 Rappen', factor: 0.10, isCoin: true },
    { key: 'c020', label: '20 Rappen', factor: 0.20, isCoin: true },
    { key: 'c050', label: '50 Rappen', factor: 0.50, isCoin: true },
    { key: 'c100', label: '1 Franken', factor: 1.00, isCoin: true },
    { key: 'c200', label: '2 Franken', factor: 2.00, isCoin: true },
    { key: 'c500', label: '5 Franken', factor: 5.00, isCoin: true },
    { key: 'n010', label: '10er Note', factor: 10.00, isCoin: false },
    { key: 'n020', label: '20er Note', factor: 20.00, isCoin: false },
    { key: 'n050', label: '50er Note', factor: 50.00, isCoin: false },
    { key: 'n100', label: '100er Note', factor: 100.00, isCoin: false },
    { key: 'n200', label: '200er Note', factor: 200.00, isCoin: false },
    { key: 'n1000', label: '1000er Note', factor: 1000.00, isCoin: false }
  ];

  let counts = {};
  let openingCash = 300.00;
  let stats = {
    totalCash: 0,
    totalTwint: 0,
    totalDepotIn: 0,
    totalDepotOut: 0,
    totalExpenses: 0,
    orderCount: 0
  };

  async function init() {
    DENOMINATIONS.forEach(d => {
      if (counts[d.key] === undefined) counts[d.key] = 0;
    });

    const savedOpening = await FestkasseDB.get('settings', 'openingCash');
    if (savedOpening && savedOpening.value !== undefined) {
      openingCash = parseFloat(savedOpening.value) || 300.00;
    }

    await calculateStats();
    renderUI();
  }

  // Berechnet aggregierte Summen aller bisherigen Bons des aktuellen Tages
  async function calculateStats() {
    const orders = await FestkasseDB.getAll('orders');
    const movements = await FestkasseDB.getAll('cashMovements');

    stats = {
      totalCash: 0,
      totalTwint: 0,
      totalDepotIn: 0,
      totalDepotOut: 0,
      totalExpenses: 0,
      orderCount: orders.length
    };

    orders.forEach(ord => {
      if (ord.paymentMethod === 'bar') {
        stats.totalCash += ord.totalAmount || 0;
      } else if (ord.paymentMethod === 'twint') {
        stats.totalTwint += ord.totalAmount || 0;
      }

      // Depot-Positionen analysieren
      if (ord.items) {
        ord.items.forEach(it => {
          if (it.isDepot) {
            if (it.depotType === 'plus') {
              stats.totalDepotIn += (it.price * it.qty);
            } else if (it.depotType === 'minus') {
              stats.totalDepotOut += Math.abs(it.price * it.qty);
            }
          }
        });
      }
    });

    // Barausgaben / Entnahmen berücksichtigen
    movements.forEach(m => {
      if (m.type === 'ausgabe' || m.type === 'entnahme') {
        stats.totalExpenses += (parseFloat(m.amount) || 0);
      } else if (m.type === 'einlage') {
        openingCash += (parseFloat(m.amount) || 0);
      }
    });
  }

  // Rendert die Kassensturz-Oberfläche
  function renderUI() {
    const container = document.getElementById('abschluss-view-content');
    if (!container) return;

    // Zählsumme (IST)
    let actualCash = 0;
    DENOMINATIONS.forEach(d => {
      const qty = counts[d.key] || 0;
      actualCash += qty * d.factor;
    });

    // Erwarteter Kassenstand (SOLL)
    const expectedCash = openingCash + stats.totalCash - stats.totalExpenses;
    const diff = actualCash - expectedCash;

    container.innerHTML = `
      <div class="abschluss-layout">
        <!-- LINKE SPALTE: MÜNZEN & NOTEN ZÄHLTAFEL -->
        <div class="abschluss-left">
          <div class="abschluss-card">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <div class="abschluss-card-title mb-0">
                <span>💰 Bargeld-Zählung (IST-Bestand)</span>
              </div>
              <button class="btn-secondary" onclick="KassenAbschluss.resetCounts()" style="padding: 6px 12px; font-size: 12px;">
                Zähler nullen
              </button>
            </div>

            <div class="money-grid">
              ${DENOMINATIONS.map(d => {
                const qty = counts[d.key] || 0;
                const subtotal = qty * d.factor;
                return `
                  <div class="money-row">
                    <span class="money-label">${d.label}</span>
                    <input 
                      type="number" 
                      class="money-input" 
                      min="0" 
                      value="${qty}" 
                      onchange="KassenAbschluss.updateCount('${d.key}', this.value)"
                      onfocus="this.select()"
                    >
                    <span class="money-subtotal">${formatCHF(subtotal)}</span>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top" style="border-color: var(--border-color);">
              <span style="font-weight: 700; font-size: 16px;">Gezähltes Total (IST):</span>
              <span style="font-weight: 900; font-size: 24px; color: #34d399; font-family: monospace;">${formatCHF(actualCash)}</span>
            </div>
          </div>
        </div>

        <!-- RECHTE SPALTE: SOLL/IST ABGLEICH & Z-BERICHT -->
        <div class="abschluss-right">
          <!-- KASSENSTAND KONTROLL-BOX -->
          <div class="abschluss-card">
            <div class="abschluss-card-title">
              <span>📊 SOLL / IST Kassensturz</span>
            </div>

            <div class="d-flex flex-column gap-2 mb-3">
              <div class="d-flex justify-content-between text-muted" style="font-size: 14px;">
                <span>Wechselgeld Anfangsbestand:</span>
                <span class="font-monospace fw-bold text-main">${formatCHF(openingCash)}</span>
              </div>
              <div class="d-flex justify-content-between text-muted" style="font-size: 14px;">
                <span>+ Bar-Einnahmen (${stats.orderCount} Bons):</span>
                <span class="font-monospace fw-bold text-success">+${formatCHF(stats.totalCash)}</span>
              </div>
              <div class="d-flex justify-content-between text-muted" style="font-size: 14px;">
                <span>− Barauslagen / Nacheinkauf:</span>
                <span class="font-monospace fw-bold text-danger">−${formatCHF(stats.totalExpenses)}</span>
              </div>
              <div class="d-flex justify-content-between pt-2 border-top" style="border-color: var(--border-color); font-weight: 800; font-size: 16px;">
                <span>Erwarteter Barbestand (SOLL):</span>
                <span class="font-monospace text-primary">${formatCHF(expectedCash)}</span>
              </div>
              <div class="d-flex justify-content-between text-muted" style="font-size: 14px;">
                <span>Tatsächlich gezählt (IST):</span>
                <span class="font-monospace fw-bold text-main">${formatCHF(actualCash)}</span>
              </div>
            </div>

            <!-- DIFFERENZ BANNER -->
            <div class="diff-banner ${Math.abs(diff) < 0.05 ? 'diff-zero' : 'diff-error'} mb-3">
              <div>
                <div style="font-weight: 800; font-size: 14px;">
                  ${Math.abs(diff) < 0.05 ? '✅ Kasse stimmt exakt überein!' : (diff > 0 ? '⚠️ Überschuss in der Kasse' : '⚠️ Manko in der Kasse')}
                </div>
                <div style="font-size: 11px; opacity: 0.8;">Differenz (IST minus SOLL)</div>
              </div>
              <div class="diff-val">${diff > 0 ? '+' : ''}${formatCHF(diff)}</div>
            </div>

            <!-- BARAUSLAGE SCHNELL-ERFASSUNG -->
            <div class="d-flex gap-2 mb-3">
              <button class="btn-secondary" style="flex: 1; font-size: 13px;" onclick="KassenAbschluss.openMovementModal('ausgabe')">
                <span>💸 Barauslage buchen</span>
              </button>
              <button class="btn-secondary" style="flex: 1; font-size: 13px;" onclick="KassenAbschluss.openMovementModal('einlage')">
                <span>📥 Wechselgeld ändern</span>
              </button>
            </div>

            <!-- Z-ABSCHLUSS DURCHFÜHREN BUTTON -->
            <button class="btn-primary" style="width: 100%; height: 50px; font-size: 16px; font-weight: 800;" onclick="KassenAbschluss.performZReport(${actualCash}, ${expectedCash}, ${diff})">
              <span>🧾 Kassenabschluss (Z-Bericht) festschreiben</span>
            </button>
          </div>

          <!-- TWINT & DEPOT ZUSAMMENFASSUNG -->
          <div class="abschluss-card">
            <div class="abschluss-card-title">
              <span>📱 Bargeldlose Einnahmen & Depot</span>
            </div>
            <div class="d-flex flex-column gap-2" style="font-size: 14px;">
              <div class="d-flex justify-content-between">
                <span class="text-muted">TWINT Umsätze gesamt:</span>
                <span class="font-monospace fw-bold" style="color: #009b77;">${formatCHF(stats.totalTwint)}</span>
              </div>
              <div class="d-flex justify-content-between">
                <span class="text-muted">Depot eingenommen (+):</span>
                <span class="font-monospace fw-bold text-success">${formatCHF(stats.totalDepotIn)}</span>
              </div>
              <div class="d-flex justify-content-between">
                <span class="text-muted">Depot retourniert (−):</span>
                <span class="font-monospace fw-bold text-danger">${formatCHF(stats.totalDepotOut)}</span>
              </div>
              <div class="d-flex justify-content-between pt-2 border-top" style="border-color: var(--border-color); font-weight: 700;">
                <span>Effektiver Tagesumsatz gesamt:</span>
                <span class="font-monospace text-primary" style="font-size: 16px;">${formatCHF(stats.totalCash + stats.totalTwint)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function updateCount(key, val) {
    counts[key] = parseInt(val, 10) || 0;
    renderUI();
  }

  function resetCounts() {
    DENOMINATIONS.forEach(d => counts[d.key] = 0);
    renderUI();
  }

  // Barauslage / Einlage erfassen Modal
  function openMovementModal(type) {
    const modal = document.getElementById('cash-movement-modal');
    document.getElementById('movement-type').value = type;
    document.getElementById('movement-title').textContent = type === 'ausgabe' ? 'Barauslage / Not-Einkauf' : 'Wechselgeld Einlage';
    document.getElementById('movement-amount').value = '';
    document.getElementById('movement-reason').value = '';
    if (modal) modal.classList.add('active');
  }

  async function saveCashMovement() {
    const type = document.getElementById('movement-type').value;
    const amount = parseFloat(document.getElementById('movement-amount').value) || 0;
    const reason = document.getElementById('movement-reason').value.trim();

    if (amount <= 0) {
      alert('Bitte gib einen gültigen Betrag größer als 0 ein.');
      return;
    }

    const cashier = await FestkasseDB.get('settings', 'cashierName');
    const movement = {
      id: 'mov_' + Date.now(),
      timestamp: new Date().toISOString(),
      type,
      amount,
      reason: reason || (type === 'ausgabe' ? 'Barauslage' : 'Wechselgeld'),
      cashierName: cashier ? cashier.value : 'Kasse'
    };

    await FestkasseDB.put('cashMovements', movement);
    closeModal('cash-movement-modal');
    await calculateStats();
    renderUI();
    if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
      KasseModule.showToast(`Buchung über ${formatCHF(amount)} gespeichert`);
    }
  }

  // Z-Abschluss festschreiben & Beleg anzeigen
  async function performZReport(actualCash, expectedCash, diff) {
    if (!confirm('Möchtest du den offiziellen Kassenabschluss (Z-Bericht) für heute erstellen und festschreiben?')) {
      return;
    }

    const reportNumber = 'Z-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const cashier = await FestkasseDB.get('settings', 'cashierName');
    const eventSetting = await FestkasseDB.get('settings', 'eventTitle');

    const zReport = {
      id: 'z_' + Date.now(),
      reportNumber,
      timestamp: new Date().toISOString(),
      eventTitle: eventSetting ? eventSetting.value : 'Festwirtschaft',
      cashierName: cashier ? cashier.value : 'Kasse',
      openingCash,
      totalCash: stats.totalCash,
      totalTwint: stats.totalTwint,
      totalTurnover: stats.totalCash + stats.totalTwint,
      totalDepotIn: stats.totalDepotIn,
      totalDepotOut: stats.totalDepotOut,
      totalExpenses: stats.totalExpenses,
      expectedCash,
      actualCash,
      difference: diff,
      orderCount: stats.orderCount
    };

    await FestkasseDB.put('zReports', zReport);

    // Beleg anzeigen
    showZReportModal(zReport);
  }

  function showZReportModal(report) {
    const modal = document.getElementById('z-report-receipt-modal');
    const body = document.getElementById('z-report-receipt-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div style="font-family: monospace; font-size: 13px; line-height: 1.4; color: #000; background: #fff; padding: 16px; border-radius: 8px;">
        <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">
          SPORTSCHÜTZEN MUHEN
        </div>
        <div style="text-align: center; font-size: 12px; margin-bottom: 12px;">
          ${escapeHtml(report.eventTitle)}<br>
          *** Z-KASSENABSCHLUSS ***
        </div>
        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px;">
          Beleg-Nr: ${report.reportNumber}<br>
          Datum: ${new Date(report.timestamp).toLocaleString('de-CH')}<br>
          Bediener: ${escapeHtml(report.cashierName)}
        </div>
        
        <table style="width: 100%; margin-bottom: 8px;">
          <tr><td>Anzahl Bons:</td><td style="text-align: right; font-weight: bold;">${report.orderCount}</td></tr>
          <tr><td>Umsatz BAR:</td><td style="text-align: right;">${formatCHF(report.totalCash)}</td></tr>
          <tr><td>Umsatz TWINT:</td><td style="text-align: right;">${formatCHF(report.totalTwint)}</td></tr>
          <tr style="font-weight: bold; border-top: 1px solid #000;">
            <td>TOTAL UMSATZ:</td><td style="text-align: right;">${formatCHF(report.totalTurnover)}</td>
          </tr>
        </table>

        <div style="border-top: 1px dashed #000; padding-top: 6px; margin-bottom: 8px;">
          <table style="width: 100%;">
            <tr><td>Anfangsbestand:</td><td style="text-align: right;">${formatCHF(report.openingCash)}</td></tr>
            <tr><td>+ Bar-Umsatz:</td><td style="text-align: right;">+${formatCHF(report.totalCash)}</td></tr>
            <tr><td>− Barauslagen:</td><td style="text-align: right;">−${formatCHF(report.totalExpenses)}</td></tr>
            <tr style="font-weight: bold;">
              <td>SOLL-Bestand:</td><td style="text-align: right;">${formatCHF(report.expectedCash)}</td>
            </tr>
            <tr style="font-weight: bold;">
              <td>IST-Gezählt:</td><td style="text-align: right;">${formatCHF(report.actualCash)}</td>
            </tr>
            <tr style="font-weight: bold; color: ${Math.abs(report.difference) < 0.05 ? '#000' : '#d00'};">
              <td>DIFFERENZ:</td><td style="text-align: right;">${report.difference > 0 ? '+' : ''}${formatCHF(report.difference)}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-top: 16px; font-size: 11px;">
          Vielen Dank für den Einsatz!<br>
          Festkasse Sportschützen Muhen
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  function printZReport() {
    window.print();
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  function formatCHF(val) {
    const num = parseFloat(val) || 0;
    return 'CHF ' + num.toFixed(2);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    init,
    updateCount,
    resetCounts,
    openMovementModal,
    saveCashMovement,
    performZReport,
    printZReport,
    closeModal
  };
})();
