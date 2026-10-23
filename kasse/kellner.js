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
            <button class="table-selector-pill" onclick="KellnerHandheld.openTableModal()">
              <span>📍 ${escapeHtml(selectedTable)} ▾</span>
            </button>
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
          <div style="background-color: var(--bg-card); border-top: 1px solid var(--border-color); padding: 12px; display: flex; flex-direction: column; gap: 8px;">
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

            <!-- SENDEN BUTTON -->
            <button 
              class="btn-pay-cash" 
              style="height: 48px; font-size: 15px; margin-top: 4px; background: linear-gradient(135deg, #0284c7, #0369a1);"
              onclick="KellnerHandheld.sendOrderToKasse()"
              ${cart.length === 0 ? 'disabled style="opacity: 0.5;"' : ''}
            >
              <span>🚀 BESTELLUNG AN KASSE SENDEN</span>
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

  // Sendet Bestellung an die zentrale iPad Kasse
  async function sendOrderToKasse() {
    if (cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const orderData = {
      id: 'kellner_' + Date.now(),
      orderNumber: 'T-' + Math.floor(100 + Math.random() * 900),
      timestamp: new Date().toISOString(),
      tableNumber: selectedTable,
      items: [...cart],
      totalAmount: total,
      status: 'pending_payment',
      source: 'handheld_iphone'
    };

    // Im BroadcastChannel publizieren
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'NEW_KELLNER_ORDER',
        order: orderData
      });
    }

    // Lokalen Bon leeren
    cart = [];
    renderUI();

    if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
      KasseModule.showToast(`Bestellung für ${selectedTable} an Kasse gesendet!`);
    } else {
      alert(`Bestellung für ${selectedTable} erfolgreich an Kasse gesendet!`);
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
    openTableModal,
    selectTable
  };
})();
