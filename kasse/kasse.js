/**
 * kasse.js - Hauptsteuerung der Festkasse (WaiterOne-Stil)
 * Sportschützen Muhen
 * Offline-First Kasse mit Schweizer Notenrechner, TWINT, Depot & Multi-Device Empfang
 */

const KasseModule = (function () {
  let categories = [];
  let products = [];
  let activeCategoryId = 'all';
  let searchQuery = '';
  
  // Aktueller Bon / Warenkorb
  let cart = [];
  let cashGiven = 0;
  let activeCashierName = 'Beat Müller';
  let activeStationName = 'Kasse 1';
  let broadcastChannel = null;

  async function init() {
    // 1. Service Worker registrieren
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('[SW] Registrierung fehlgeschlagen:', err);
      });
    }

    // 2. IndexedDB initialisieren & Seeds laden
    await FestkasseDB.initializeDefaults();
    
    // 3. Daten einlesen
    categories = await FestkasseDB.getAll('categories');
    products = await FestkasseDB.getAll('products');

    const cashierSetting = await FestkasseDB.get('settings', 'cashierName');
    if (cashierSetting && cashierSetting.value) activeCashierName = cashierSetting.value;

    const stationSetting = await FestkasseDB.get('settings', 'stationName');
    if (stationSetting && stationSetting.value) activeStationName = stationSetting.value;

    // 4. UI Header aktualisieren
    const nameEl = document.getElementById('active-cashier-name');
    const stationEl = document.getElementById('active-cashier-station');
    if (nameEl) nameEl.textContent = activeCashierName;
    if (stationEl) stationEl.textContent = activeStationName;

    const avatarEl = document.getElementById('active-operator-avatar');
    if (avatarEl) avatarEl.textContent = getInitials(activeCashierName);

    // 5. BroadcastChannel für iPhone-Bestellungen öffnen
    initBroadcast();

    // 6. Kasse rendern
    renderCategories();
    renderProducts();
    renderCart();

    // 7. Sub-Module initialisieren
    AplanoSchichtplan.init();
    KassenAbschluss.init();
    KellnerHandheld.init();
  }

  // Multi-Device Empfänger für Tisch-Bestellungen
  function initBroadcast() {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel('festkasse_channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'NEW_KELLNER_ORDER') {
          handleIncomingOrder(event.data.order);
        }
      };
    }
  }

  // Reagiert auf eingehende iPhone-Bestellung
  function handleIncomingOrder(order) {
    playNotificationSound();
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    showToast(`🔔 Neue Bestellung von ${order.tableNumber}: ${order.items.length} Artikel (${formatCHF(order.totalAmount)})`);

    // Banner im Bon anzeigen
    const banner = document.getElementById('incoming-order-banner');
    if (banner) {
      banner.style.display = 'block';
      banner.innerHTML = `
        <div style="background: rgba(2, 132, 199, 0.2); border: 1px solid #0284c7; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
          <div style="font-weight: 800; color: #38bdf8; font-size: 13px;">📲 EINGANG: ${escapeHtml(order.tableNumber)}</div>
          <div style="font-size: 12px; margin: 4px 0;">${order.items.map(i => `${i.qty}× ${escapeHtml(i.name)}`).join(', ')}</div>
          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button class="btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="KasseModule.loadIncomingOrderToCart(${JSON.stringify(order).replace(/"/g, '&quot;')})">
              In Bon übernehmen
            </button>
            <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="this.parentElement.parentElement.parentElement.style.display='none'">
              Ausblenden
            </button>
          </div>
        </div>
      `;
    }
  }

  function loadIncomingOrderToCart(order) {
    cart = [];
    order.items.forEach(it => {
      cart.push({
        id: it.id,
        name: it.name,
        price: it.price,
        qty: it.qty,
        isDepot: false
      });
    });
    
    const banner = document.getElementById('incoming-order-banner');
    if (banner) banner.style.display = 'none';

    cashGiven = 0;
    renderCart();
    showToast(`Bestellung von ${order.tableNumber} in Kasse geladen`);
  }

  // Rendert die Kategorie-Pills
  function renderCategories() {
    const bar = document.getElementById('category-bar');
    if (!bar) return;

    let html = `
      <button class="cat-btn ${activeCategoryId === 'all' ? 'active' : ''}" onclick="KasseModule.filterCategory('all')">
        <span>⭐</span>
        <span>Alle Artikel</span>
      </button>
    `;

    categories.sort((a, b) => a.sortOrder - b.sortOrder).forEach(cat => {
      html += `
        <button class="cat-btn ${activeCategoryId === cat.id ? 'active' : ''}" onclick="KasseModule.filterCategory('${cat.id}')">
          <span>${cat.icon || '📁'}</span>
          <span>${escapeHtml(cat.name)}</span>
        </button>
      `;
    });

    bar.innerHTML = html;
  }

  function filterCategory(catId) {
    activeCategoryId = catId;
    renderCategories();
    renderProducts();
  }

  function setSearch(query) {
    searchQuery = query.toLowerCase().trim();
    renderProducts();
  }

  // Rendert die Produktkacheln
  function renderProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    let filtered = products;
    if (activeCategoryId !== 'all') {
      filtered = filtered.filter(p => p.categoryId === activeCategoryId);
    }
    if (searchQuery) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 40px;">
          Keine Artikel gefunden.
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p => `
      <div 
        class="product-card ${p.isDepot ? 'depot-card' : ''}" 
        onclick="KasseModule.addToCart('${p.id}')"
      >
        <div class="product-card-top">
          <span class="product-icon">${p.icon || '📦'}</span>
          <span class="product-name">${escapeHtml(p.name)}</span>
        </div>
        <div class="product-card-bottom">
          <span class="product-unit">${escapeHtml(p.unit || '')}</span>
          <span class="product-price">${formatCHF(p.price)}</span>
        </div>
      </div>
    `).join('');
  }

  // Fügt Produkt zum Warenkorb hinzu
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
        unit: prod.unit,
        qty: 1,
        isDepot: prod.isDepot || false,
        depotType: prod.depotType || null
      });
    }

    // Wenn ein Artikel mit Becher/Glas-Depot gewählt wird (z.B. Bier Offenausschank),
    // automatisch das Glasdepot (CHF 2.00) als Vorschlag beifügen
    if (prod.depotAmount && prod.depotAmount > 0 && !prod.isDepot) {
      const depotProd = products.find(p => p.id === 'p_depot_glas_plus');
      if (depotProd) {
        const existingDepot = cart.find(i => i.id === depotProd.id);
        if (existingDepot) {
          existingDepot.qty++;
        } else {
          cart.push({
            id: depotProd.id,
            name: depotProd.name,
            price: depotProd.price,
            qty: 1,
            isDepot: true,
            depotType: 'plus'
          });
        }
      }
    }

    if (navigator.vibrate) navigator.vibrate(25);
    cashGiven = 0; // Rückgeldrechner zurücksetzen
    renderCart();
  }

  function changeQty(index, delta) {
    if (cart[index]) {
      cart[index].qty += delta;
      if (cart[index].qty <= 0) {
        cart.splice(index, 1);
      }
    }
    cashGiven = 0;
    renderCart();
  }

  function clearCart() {
    if (cart.length === 0) return;
    cart = [];
    cashGiven = 0;
    renderCart();
  }

  // Rendert den rechten Kassenbon
  function renderCart() {
    const listEl = document.getElementById('ticket-items-list');
    const totalEl = document.getElementById('ticket-total-display');
    const changeBox = document.getElementById('change-display-box');
    const changeEl = document.getElementById('ticket-change-amount');
    const quickNotes = document.getElementById('cash-quick-buttons');

    const total = cart.reduce((sum, it) => sum + (it.price * it.qty), 0);

    if (totalEl) totalEl.textContent = formatCHF(total);

    // Positionsliste
    if (listEl) {
      if (cart.length === 0) {
        listEl.innerHTML = `
          <div class="ticket-empty-state">
            <div class="ticket-empty-icon">🧾</div>
            <div style="font-weight: 700; font-size: 15px;">Aktueller Bon ist leer</div>
            <div style="font-size: 13px; margin-top: 4px;">Klicke links auf Artikel, um die Bestellung zu erfassen.</div>
          </div>
        `;
      } else {
        listEl.innerHTML = cart.map((item, idx) => `
          <div class="ticket-item-row">
            <div class="ticket-item-info">
              <span class="ticket-item-title">${escapeHtml(item.name)}</span>
              <span class="ticket-item-price-unit">${formatCHF(item.price)} ${item.unit ? '/ ' + item.unit : ''}</span>
            </div>
            <div class="ticket-stepper">
              <button class="step-btn" onclick="KasseModule.changeQty(${idx}, -1)">−</button>
              <span class="step-qty">${item.qty}</span>
              <button class="step-btn" onclick="KasseModule.changeQty(${idx}, 1)">+</button>
            </div>
            <span class="ticket-item-total">${formatCHF(item.price * item.qty)}</span>
          </div>
        `).join('');
      }
    }

    // Schweizer Noten Schnelltasten aktivieren
    if (quickNotes) {
      const notes = [
        { label: 'Exakt', val: total },
        { label: '10 Fr', val: 10 },
        { label: '20 Fr', val: 20 },
        { label: '50 Fr', val: 50 },
        { label: '100 Fr', val: 100 }
      ];

      quickNotes.innerHTML = notes.map(n => `
        <button 
          class="btn-note ${cashGiven === n.val ? 'active' : ''}" 
          onclick="KasseModule.setCashGiven(${n.val})"
          ${total <= 0 ? 'disabled' : ''}
        >
          ${n.label}
        </button>
      `).join('');
    }

    // Rückgeld Berechnung
    if (changeBox && changeEl) {
      if (cashGiven >= total && total > 0) {
        const change = cashGiven - total;
        changeEl.textContent = formatCHF(change);
        changeBox.style.display = 'flex';
      } else {
        changeBox.style.display = 'none';
      }
    }
  }

  function setCashGiven(amount) {
    cashGiven = amount;
    renderCart();
  }

  // Zahlung abschliessen (BAR oder TWINT)
  async function completePayment(method) {
    const total = cart.reduce((sum, it) => sum + (it.price * it.qty), 0);
    if (total <= 0) {
      alert('Der Bon ist leer.');
      return;
    }

    const orderNumber = 'B-' + Math.floor(1000 + Math.random() * 9000);
    const orderData = {
      id: 'ord_' + Date.now(),
      orderNumber,
      timestamp: new Date().toISOString(),
      cashierName: activeCashierName,
      stationName: activeStationName,
      items: [...cart],
      totalAmount: total,
      paymentMethod: method, // 'bar' | 'twint'
      cashReceived: method === 'bar' ? (cashGiven >= total ? cashGiven : total) : total,
      changeGiven: method === 'bar' ? Math.max(0, (cashGiven - total)) : 0,
      status: 'completed'
    };

    // 1. In IndexedDB speichern
    await FestkasseDB.put('orders', orderData);

    // 2. Broadcast senden
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'ORDER_COMPLETED', orderId: orderData.id });
    }

    // 3. Audio & Haptik
    if (navigator.vibrate) navigator.vibrate([40, 30, 80]);
    playSuccessSound();

    // 4. Kassensturz-Daten live aktualisieren
    KassenAbschluss.init();

    // 5. Quittungs-Modal vorbereiten
    showReceiptModal(orderData);

    // 6. Bon leeren
    cart = [];
    cashGiven = 0;
    renderCart();

    showToast(`Bon ${orderNumber} erfolgreich bezahlt (${method.toUpperCase()})`);
  }

  // Quittung / Beleg Modal
  function showReceiptModal(order) {
    const modal = document.getElementById('receipt-modal');
    const printArea = document.getElementById('print-receipt-area');
    if (!modal || !printArea) return;

    printArea.innerHTML = `
      <div style="text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 4px;">
        SPORTSCHÜTZEN MUHEN
      </div>
      <div style="text-align: center; font-size: 11px; margin-bottom: 10px;">
        Festwirtschaft & Kasse<br>
        Bon-Nr: <strong>${order.orderNumber}</strong><br>
        ${new Date(order.timestamp).toLocaleString('de-CH')}
      </div>
      <div style="border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px;">
        Bediener: ${escapeHtml(order.cashierName)} (${escapeHtml(order.stationName)})
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
        ${order.items.map(it => `
          <tr>
            <td style="padding: 2px 0;">${it.qty}× ${escapeHtml(it.name)}</td>
            <td style="text-align: right; font-weight: bold;">${formatCHF(it.price * it.qty)}</td>
          </tr>
        `).join('')}
      </table>

      <div style="border-top: 1px solid #000; padding-top: 4px; margin-bottom: 6px;">
        <table style="width: 100%;">
          <tr style="font-weight: bold; font-size: 14px;">
            <td>TOTAL:</td>
            <td style="text-align: right;">${formatCHF(order.totalAmount)}</td>
          </tr>
          <tr>
            <td>Zahlart:</td>
            <td style="text-align: right;">${order.paymentMethod.toUpperCase()}</td>
          </tr>
          ${order.paymentMethod === 'bar' ? `
            <tr>
              <td>Erhalten:</td>
              <td style="text-align: right;">${formatCHF(order.cashReceived)}</td>
            </tr>
            <tr>
              <td>Rückgeld:</td>
              <td style="text-align: right;">${formatCHF(order.changeGiven)}</td>
            </tr>
          ` : ''}
        </table>
      </div>

      <div style="text-align: center; margin-top: 12px; font-size: 11px;">
        Herzlichen Dank für deinen Besuch!<br>
        Gut Schuss!
      </div>
    `;

    modal.classList.add('active');
  }

  function printReceipt() {
    window.print();
  }

  // View Navigation
  function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetBtn = document.getElementById(`tab-btn-${viewName}`);

    if (targetView) targetView.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

    if (viewName === 'schichtplan') {
      AplanoSchichtplan.renderTimelineGrid();
    } else if (viewName === 'abschluss') {
      KassenAbschluss.init();
    } else if (viewName === 'kellner') {
      KellnerHandheld.init();
    }
  }

  // Toast Nachrichten
  function showToast(message) {
    const toast = document.getElementById('global-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  function playSuccessSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  }

  function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
    filterCategory,
    setSearch,
    addToCart,
    changeQty,
    clearCart,
    setCashGiven,
    completePayment,
    printReceipt,
    switchView,
    showToast,
    loadIncomingOrderToCart
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  KasseModule.init();
});
