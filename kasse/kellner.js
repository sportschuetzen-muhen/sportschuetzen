/**
 * kellner.js - iPhone Handheld Bediener- & Kellneransicht (Phase 3)
 * Sportschützen Muhen
 * Schnelle Tischerfassung, kompaktes Mobil-Grid & Lokale Echtzeit-Übermittlung an die Hauptkasse
 */

const KellnerHandheld = (function () {
  let selectedTable = 'Tisch 1';
  let cart = [];
  let products = [];
  let broadcastChannel = null;
  let cashModalReceived = 0;

  async function init() {
    products = await FestkasseDB.getAll('products');
    initBroadcast();
    renderUI();
  }

  // Initialisiert die geräteübergreifende Offline-Kommunikation
  function initBroadcast() {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel('festkasse_channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'ORDER_COMPLETED') {
          console.log('[Kellner] Bestellung abgeschlossen an Kasse:', event.data.orderId);
        }
      };
    }
  }

  function renderUI() {
    const container = document.getElementById('kellner-view-content');
    if (!container) return;

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);

    container.innerHTML = `
      <div class="kellner-layout">
        <div class="kellner-device-frame">
          <div class="kellner-notch"></div>
          
          <!-- MOBILE HEADER -->
          <div class="kellner-header">
            <div>
              <div style="font-size: 11px; color: var(--text-dim); font-weight: 700;">KELLNER-MODUS</div>
              <div style="font-size: 14px; font-weight: 800;">Sportschützen Fest</div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="table-selector-pill" onclick="KellnerHandheld.openTableModal()">
                <span>📍 ${escapeHtml(selectedTable)} ▾</span>
              </button>
              <button class="nav-tab-btn" onclick="KasseModule.openSettingsModal()" style="height: 36px; padding: 0 10px; border: 1px solid var(--border-color); background: var(--bg-card); border-radius: var(--radius-sm); color: var(--text-main); font-weight: 700; display: inline-flex; align-items: center; cursor: pointer;" title="Drucker-Einstellungen">
                <span>⚙️</span>
              </button>
            </div>
          </div>

          <!-- ARTIKEL SCHNELLAUSWAHL -->
          <div style="flex: 1; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; align-content: flex-start;">
            ${products.filter(p => !p.isDepot).map(p => `
              <div 
                class="product-card" 
                style="padding: 10px; min-height: 85px;" 
                onclick="KellnerHandheld.addToCart('${p.id}')"
              >
                <div class="product-card-top">
                  <span style="font-size: 16px;">${p.icon || '📦'}</span>
                  <span class="product-name" style="font-size: 13px;">${escapeHtml(p.name)}</span>
                </div>
                <div class="product-card-bottom">
                  <span class="product-price" style="font-size: 14px;">${formatCHF(p.price)}</span>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- BON-LEISTE UNTEN (MOBILE DOCK) -->
          <div class="kellner-bottom-dock">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-size: 13px; color: var(--text-muted); font-weight: 700;">${itemCount} Artikel im Bon</span>
              <span style="font-size: 22px; font-weight: 900; color: #38bdf8; font-family: monospace;">${formatCHF(total)}</span>
            </div>

            <!-- KURZÜBERSICHT POSITIONEN -->
            <div style="max-height: 90px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
              ${cart.length === 0 ? '<div style="color: var(--text-dim); text-align: center; padding: 10px 0;">Noch keine Artikel gewählt</div>' : cart.map((it, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-tertiary); padding: 4px 8px; border-radius: 4px;">
                  <span>${it.qty}× ${escapeHtml(it.name)}</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-family: monospace; font-weight: bold;">${formatCHF(it.price * it.qty)}</span>
                    <button onclick="KellnerHandheld.removeItem(${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer;">✕</button>
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- DIREKT AM TISCH KASSIEREN (FLIEGENDER KELLNER) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px;">
              <button 
                class="btn-pay-cash" 
                style="height: 44px; font-size: 13px; background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: 800; border-radius: var(--radius-sm); color: white; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer;"
                onclick="KellnerHandheld.checkoutAtTable('bar')"
                ${cart.length === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}
              >
                <span>💵 BAR KASSIEREN</span>
              </button>
              <button 
                class="btn-pay-twint" 
                style="height: 44px; font-size: 13px; background: linear-gradient(135deg, #009b77, #007a5e); border: none; font-weight: 800; border-radius: var(--radius-sm); color: white; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer;"
                onclick="KellnerHandheld.checkoutAtTable('twint')"
                ${cart.length === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}
              >
                <span>📱 TWINT KASSIEREN</span>
              </button>
            </div>

            <!-- OFFEN AN KÜCHE SENDEN (FALLS SPÄTER BEZAHLT WIRD) -->
            <button 
              class="btn-secondary" 
              style="width: 100%; height: 34px; font-size: 11px; margin-top: 4px; font-weight: 700; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-sm); cursor: pointer;"
              onclick="KellnerHandheld.sendOrderToKasse()"
              ${cart.length === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}
              title="Bestellung noch nicht kassiert, offen an Hauptkasse übermitteln"
            >
              <span>🚀 Nur an Küche senden (Zahlung offen)</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function addToCart(productId) {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const existing = cart.find(i => i.id === productId);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({
        id: prod.id,
        name: prod.name,
        price: prod.price,
        qty: 1
      });
    }

    if (navigator.vibrate) navigator.vibrate(30);
    renderUI();
  }

  function removeItem(index) {
    cart.splice(index, 1);
    renderUI();
  }

  // Sendet Bestellung und druckt Bon sofort aus
  async function sendOrderToKasse() {
    if (cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const orderData = {
      id: 'kellner_' + Date.now(),
      orderNumber: 'T-' + Math.floor(100 + Math.random() * 900),
      displayOrderNumber: selectedTable,
      timestamp: new Date().toISOString(),
      tableNumber: selectedTable,
      cashierName: (typeof KasseModule !== 'undefined' && KasseModule.getActiveCashierName) ? KasseModule.getActiveCashierName() : 'Kellner (iPhone)',
      stationName: 'Handheld',
      items: [...cart],
      totalAmount: total,
      paymentMethod: 'bar',
      status: 'pending_payment',
      source: 'handheld_iphone'
    };

    // 1. In lokaler Datenbank sichern
    try {
      await FestkasseDB.put('orders', orderData);
    } catch (dbErr) {
      console.warn('[Kellner] Fehler beim Speichern in DB:', dbErr);
    }

    // 2. Drucker-Settings ermitteln
    let printerSettings = {
      printerIp: '192.168.68.200',
      printDriver: 'epos_direct',
      useSsl: true,
      printGuestReceipt: true,
      printKitchenReceipt: true,
      printDrinksReceipt: false
    };

    if (typeof KasseModule !== 'undefined' && KasseModule.getPrinterSettings) {
      printerSettings = KasseModule.getPrinterSettings();
    } else {
      try {
        const ip = await FestkasseDB.get('settings', 'printerIp');
        if (ip && ip.value) printerSettings.printerIp = ip.value;
        const drv = await FestkasseDB.get('settings', 'printDriver');
        if (drv && drv.value) printerSettings.printDriver = drv.value;
        const ssl = await FestkasseDB.get('settings', 'useSsl');
        if (ssl && ssl.value !== undefined) printerSettings.useSsl = !!ssl.value;
        const kg = await FestkasseDB.get('settings', 'printGuestReceipt');
        if (kg && kg.value !== undefined) printerSettings.printGuestReceipt = !!kg.value;
        const kk = await FestkasseDB.get('settings', 'printKitchenReceipt');
        if (kk && kk.value !== undefined) printerSettings.printKitchenReceipt = !!kk.value;
      } catch (e) {}
    }

    // 3. Sofortigen Druck auslösen (Küchenbon / Tischbeleg)
    let printSuccess = false;
    let printError = null;
    if (typeof EposPrint !== 'undefined' && typeof EposPrint.printOrder === 'function') {
      try {
        const res = await EposPrint.printOrder(orderData, printerSettings);
        printSuccess = res && res.success;
      } catch (printErr) {
        printError = printErr.message || String(printErr);
        console.warn('[Kellner] Sofortdruck fehlgeschlagen:', printErr);
      }
    }

    // 4. Im BroadcastChannel publizieren (falls Tabs/Kassen auf demselben Host offen sind)
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'NEW_KELLNER_ORDER',
        order: orderData,
        alreadyPrinted: printSuccess
      });
    }

    // 5. Lokalen Bon leeren & UI aktualisieren
    const prevTable = selectedTable;
    cart = [];
    renderUI();

    // 6. Feedback & Haptik
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    if (printSuccess) {
      if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
        KasseModule.showToast(`✓ Bon für ${prevTable} gedruckt!`);
      } else {
        alert(`✓ Bon für ${prevTable} erfolgreich gedruckt!`);
      }
    } else if (printError) {
      if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
        KasseModule.showToast(`⚠️ ${prevTable} verbucht, aber Druckfehler: ${printError}`);
      } else {
        alert(`Bestellung für ${prevTable} erfasst, aber Druckfehler: ${printError}`);
      }
    } else {
      if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
        KasseModule.showToast(`Bestellung für ${prevTable} erfasst!`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FLIEGENDER KELLNER: DIREKT AM TISCH KASSIEREN (BAR / TWINT)
  // ─────────────────────────────────────────────────────────────
  function checkoutAtTable(method) {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    if (method === 'bar') {
      openCashModal(total);
      return;
    }

    if (method === 'twint') {
      executeCheckout('twint', total, 0);
    }
  }

  function openCashModal(total) {
    const modal = document.getElementById('kellner-cash-modal');
    if (!modal) {
      executeCheckout('bar', total, 0);
      return;
    }

    const tableNameEl = document.getElementById('kellner-cash-table-name');
    if (tableNameEl) tableNameEl.textContent = selectedTable;

    const totalEl = document.getElementById('kellner-cash-total-display');
    if (totalEl) totalEl.textContent = formatCHF(total);

    cashModalReceived = total;
    updateCashModalChange(total, total);

    // Noten-Buttons: Passend, und Stückelungen >= total
    const notes = [
      { label: `Passend (${formatCHF(total)})`, val: total, isPrimary: true },
      { label: '10 CHF', val: 10 },
      { label: '20 CHF', val: 20 },
      { label: '50 CHF', val: 50 },
      { label: '100 CHF', val: 100 },
      { label: '200 CHF', val: 200 }
    ].filter(n => n.isPrimary || n.val >= total);

    const notesGrid = document.getElementById('kellner-quick-notes-grid');
    if (notesGrid) {
      notesGrid.innerHTML = notes.map(n => `
        <button 
          class="cat-btn" 
          style="width: 100%; justify-content: center; height: 38px; font-size: 13px; font-weight: 700; ${n.isPrimary ? 'background: #0284c7; color: white;' : ''}"
          onclick="KellnerHandheld.selectQuickCash(${n.val})"
        >
          ${n.label}
        </button>
      `).join('');
    }

    modal.classList.add('active');
  }

  function selectQuickCash(amount) {
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    cashModalReceived = amount;
    updateCashModalChange(total, amount);
  }

  function updateCashModalChange(total, received) {
    const change = Math.max(0, received - total);
    const changeEl = document.getElementById('kellner-cash-change-display');
    if (changeEl) changeEl.textContent = formatCHF(change);
  }

  function closeCashModal() {
    const modal = document.getElementById('kellner-cash-modal');
    if (modal) modal.classList.remove('active');
  }

  function confirmCashPayment() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const received = Math.max(cashModalReceived, total);
    const change = Math.max(0, received - total);
    closeCashModal();
    executeCheckout('bar', received, change);
  }

  async function executeCheckout(method, cashReceived, changeGiven) {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const prevTable = selectedTable;

    const orderData = {
      id: 'ord_mob_' + Date.now(),
      orderNumber: 'T-' + Math.floor(100 + Math.random() * 900),
      displayOrderNumber: selectedTable,
      timestamp: new Date().toISOString(),
      tableNumber: selectedTable,
      cashierName: (typeof KasseModule !== 'undefined' && KasseModule.getActiveCashierName) ? KasseModule.getActiveCashierName() : 'Kellner (iPhone)',
      stationName: 'Handheld (iPhone)',
      items: [...cart],
      totalAmount: total,
      paymentMethod: method,
      cashReceived: cashReceived,
      changeGiven: changeGiven,
      status: 'completed',
      source: 'handheld_iphone'
    };

    // 1. In IndexedDB speichern
    try {
      await FestkasseDB.put('orders', orderData);
    } catch (e) {
      console.warn('[Kellner] Fehler beim Speichern des Bons:', e);
    }

    // 2. Drucker-Settings ermitteln (Standard: 192.168.68.200 / epos_direct / SSL)
    let printerSettings = {
      printerIp: '192.168.68.200',
      printDriver: 'epos_direct',
      useSsl: true,
      printGuestReceipt: true,
      printKitchenReceipt: true,
      printDrinksReceipt: false
    };

    if (typeof KasseModule !== 'undefined' && KasseModule.getPrinterSettings) {
      printerSettings = KasseModule.getPrinterSettings();
    } else {
      try {
        const ip = await FestkasseDB.get('settings', 'printerIp');
        if (ip && ip.value) printerSettings.printerIp = ip.value;
        const drv = await FestkasseDB.get('settings', 'printDriver');
        if (drv && drv.value) printerSettings.printDriver = drv.value;
        const ssl = await FestkasseDB.get('settings', 'useSsl');
        if (ssl && ssl.value !== undefined) printerSettings.useSsl = !!ssl.value;
      } catch (e) {}
    }

    // 3. Belege drucken (Gastbeleg + Küchenbon)
    let printSuccess = false;
    let printError = null;
    if (typeof EposPrint !== 'undefined' && typeof EposPrint.printOrder === 'function') {
      try {
        const res = await EposPrint.printOrder(orderData, printerSettings);
        printSuccess = res && res.success;
      } catch (err) {
        printError = err.message || String(err);
        console.warn('[Kellner] Fehler beim Drucken:', err);
      }
    }

    // 4. Live-Umsatz & Kassensturz aktualisieren
    if (typeof KasseModule !== 'undefined' && KasseModule.updateLiveSalesBadge) {
      KasseModule.updateLiveSalesBadge();
    }
    if (typeof KassenAbschluss !== 'undefined' && KassenAbschluss.init) {
      KassenAbschluss.init();
    }

    // 5. Broadcast senden
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'ORDER_COMPLETED', orderId: orderData.id });
    }

    // 6. Warenkorb leeren & UI neu rendern
    cart = [];
    renderUI();

    // 7. Feedback
    if (navigator.vibrate) navigator.vibrate([40, 30, 80]);

    const changeNote = changeGiven > 0 ? ` (Rückgeld: ${formatCHF(changeGiven)})` : '';
    const printNote = printSuccess ? '✓ Beleg gedruckt' : (printError ? `⚠️ Druckfehler: ${printError}` : '');

    if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
      KasseModule.showToast(`✓ ${prevTable} bezahlt (${method.toUpperCase()}${changeNote}) ${printNote}`);
    } else {
      alert(`✓ ${prevTable} bezahlt (${method.toUpperCase()}${changeNote})`);
    }
  }

  // Tischwechsel Modal
  function openTableModal() {
    const tables = [
      'Tisch 1', 'Tisch 2', 'Tisch 3', 'Tisch 4', 'Tisch 5', 
      'Tisch 6', 'Tisch 7', 'Tisch 8', 'Tisch 9', 'Tisch 10',
      'Tisch 11', 'Tisch 12', 'Tisch 14', 'Tisch 15', 'Tisch 20',
      'Stehtisch 1', 'Stehtisch 2', 'Festbank A', 'Festbank B', 'Theke'
    ];

    const modal = document.getElementById('kellner-table-modal');
    const listEl = document.getElementById('kellner-table-list');
    if (!modal || !listEl) return;

    listEl.innerHTML = tables.map(t => `
      <button 
        class="cat-btn" 
        style="width: 100%; justify-content: center; ${selectedTable === t ? 'background: var(--accent-primary); color: white;' : ''}"
        onclick="KellnerHandheld.selectTable('${t}')"
      >
        ${t}
      </button>
    `).join('');

    modal.classList.add('active');
  }

  function selectTable(t) {
    selectedTable = t;
    const modal = document.getElementById('kellner-table-modal');
    if (modal) modal.classList.remove('active');
    renderUI();
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
    addToCart,
    removeItem,
    sendOrderToKasse,
    checkoutAtTable,
    openCashModal,
    selectQuickCash,
    closeCashModal,
    confirmCashPayment,
    openTableModal,
    selectTable
  };
})();
