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

  // Drucker & Festbetrieb-Einstellungen
  let printerSettings = {
    printerIp: '192.168.68.200',
    printDriver: 'gateway', // 'gateway' (CT 117 / Supabase) | 'epos_direct' (100% autark Browser) | 'tm_assistant' | 'browser'
    useSsl: false,
    printMode: 'manual', // 'manual' | 'auto' | 'browser'
    printGuestReceipt: true,
    printKitchenReceipt: true,
    printDrinksReceipt: false,
    openDrawer: true,
    orderSequence: 1
  };
  let lastCompletedOrder = null;
  let activeReceiptOrder = null;
  let changeDismissTimer = null;

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

    // Drucker-Einstellungen einlesen
    await loadPrinterSettings();

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
    KassenAbschluss.init();
    KellnerHandheld.init();
  }

  async function loadPrinterSettings() {
    try {
      const ip = await FestkasseDB.get('settings', 'printerIp');
      if (ip && ip.value) printerSettings.printerIp = ip.value;

      const driver = await FestkasseDB.get('settings', 'printDriver');
      if (driver && driver.value) printerSettings.printDriver = driver.value;

      const ssl = await FestkasseDB.get('settings', 'useSsl');
      if (ssl !== undefined && ssl.value !== undefined) printerSettings.useSsl = !!ssl.value;

      const mode = await FestkasseDB.get('settings', 'printMode');
      if (mode && mode.value) printerSettings.printMode = mode.value;

      const guest = await FestkasseDB.get('settings', 'printGuestReceipt');
      if (guest !== undefined && guest.value !== undefined) printerSettings.printGuestReceipt = !!guest.value;

      const kitchen = await FestkasseDB.get('settings', 'printKitchenReceipt');
      if (kitchen !== undefined && kitchen.value !== undefined) printerSettings.printKitchenReceipt = !!kitchen.value;

      const drinks = await FestkasseDB.get('settings', 'printDrinksReceipt');
      if (drinks !== undefined && drinks.value !== undefined) printerSettings.printDrinksReceipt = !!drinks.value;

      const drawer = await FestkasseDB.get('settings', 'openDrawer');
      if (drawer !== undefined && drawer.value !== undefined) printerSettings.openDrawer = !!drawer.value;

      const seq = await FestkasseDB.get('settings', 'orderSequence');
      if (seq && typeof seq.value === 'number') printerSettings.orderSequence = seq.value;
    } catch (e) {
      console.warn('[KasseModule] Konnte Drucker-Einstellungen nicht laden:', e);
    }
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

  // Map für eingehende Tisch-Bestellungen (Verhindert DOM-XSS)
  const pendingOrders = new Map();

  // Reagiert auf eingehende iPhone-Bestellung
  function handleIncomingOrder(order) {
    if (!order) return;
    playNotificationSound();
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    const printedNote = order.alreadyPrinted ? ' (Bon bereits gedruckt)' : '';
    showToast(`🔔 Neue Bestellung von ${escapeHtml(order.tableNumber)}: ${order.items ? order.items.length : 0} Artikel (${formatCHF(order.totalAmount)})${printedNote}`);

    const orderId = order.id || ('ord_' + Date.now());
    order.id = orderId;
    pendingOrders.set(orderId, order);

    // Banner im Bon anzeigen
    const banner = document.getElementById('incoming-order-banner');
    if (banner) {
      banner.style.display = 'block';
      const itemsText = (order.items || []).map(i => `${i.qty}× ${escapeHtml(i.name)}`).join(', ');
      banner.innerHTML = `
        <div style="background: rgba(2, 132, 199, 0.2); border: 1px solid #0284c7; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
          <div style="font-weight: 800; color: #38bdf8; font-size: 13px;">📲 EINGANG: ${escapeHtml(order.tableNumber)}</div>
          <div style="font-size: 12px; margin: 4px 0;">${itemsText}</div>
          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button class="btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="KasseModule.loadIncomingOrderToCart('${escapeHtml(orderId)}')">
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

  function loadIncomingOrderToCart(orderId) {
    const order = typeof orderId === 'object' ? orderId : pendingOrders.get(orderId);
    if (!order || !order.items) return;

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
    showToast(`Bestellung von ${escapeHtml(order.tableNumber)} in Kasse geladen`);
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

    // Rückgeldanzeige eines vorherigen Bons sofort ausblenden
    if (changeDismissTimer) {
      clearTimeout(changeDismissTimer);
      changeDismissTimer = null;
      const changeBox = document.getElementById('change-display-box');
      if (changeBox) changeBox.style.display = 'none';
    }

    const existing = cart.find(i => i.id === productId);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({
        id: prod.id,
        name: prod.name,
        price: prod.price,
        unit: prod.unit,
        categoryId: prod.categoryId || null,
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
            categoryId: 'cat_depot',
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

  // Rückgeld dezent anzeigen (Festbetrieb-Ergonomie)
  function showTemporaryChange(amount) {
    const changeBox = document.getElementById('change-display-box');
    const changeEl = document.getElementById('ticket-change-amount');
    if (!changeBox || !changeEl) return;

    if (changeDismissTimer) clearTimeout(changeDismissTimer);
    changeEl.textContent = formatCHF(amount);
    changeBox.style.display = 'flex';

    changeDismissTimer = setTimeout(() => {
      changeBox.style.display = 'none';
      changeDismissTimer = null;
    }, 6000);
  }

  // Aktualisiert die Anzeige des letzten getätigten Verkaufs
  function updateLastOrderBar(order) {
    const lastBar = document.getElementById('last-order-bar');
    const lastSummary = document.getElementById('last-order-summary');
    if (!lastBar || !lastSummary) return;

    lastSummary.textContent = `${order.displayOrderNumber || order.orderNumber} (${formatCHF(order.totalAmount)})`;
    lastBar.style.display = 'flex';
  }

  // Zahlung abschliessen (BAR oder TWINT) - 100% Festbetrieb-tauglich
  async function completePayment(method) {
    const total = cart.reduce((sum, it) => sum + (it.price * it.qty), 0);
    if (total <= 0) {
      alert('Der Bon ist leer.');
      return;
    }

    // Fortlaufende, grosse Bestellnummer für den Festbetrieb (#01, #02, ...)
    const seq = printerSettings.orderSequence || 1;
    const displayOrderNumber = '#' + String(seq).padStart(2, '0');
    printerSettings.orderSequence = (seq >= 999) ? 1 : (seq + 1);
    await FestkasseDB.put('settings', { key: 'orderSequence', value: printerSettings.orderSequence });

    const orderData = {
      id: 'ord_' + Date.now(),
      orderNumber: displayOrderNumber,
      displayOrderNumber,
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
    lastCompletedOrder = orderData;
    activeReceiptOrder = orderData;

    // 2. Schnellzugriff «Letzter Bon» aktualisieren
    updateLastOrderBar(orderData);

    // 3. Broadcast senden
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'ORDER_COMPLETED', orderId: orderData.id });
    }

    // 4. Audio & Haptik
    if (navigator.vibrate) navigator.vibrate([40, 30, 80]);
    playSuccessSound();

    // 5. Kassensturz-Daten live aktualisieren
    KassenAbschluss.init();

    // 6. Rückgeld für 6 Sekunden einblenden
    if (method === 'bar' && orderData.changeGiven > 0) {
      showTemporaryChange(orderData.changeGiven);
    }

    // 7. Bon leeren & Kasse SOFORT freigeben für nächsten Kunden
    cart = [];
    cashGiven = 0;
    renderCart();

    // 8. DRUCK-LOGIK (Je nach Konfiguration)
    if (printerSettings.printMode === 'auto') {
      showToast(`Bon ${displayOrderNumber} bezahlt (${method.toUpperCase()}) – Drucke Belege...`);
      EposPrint.printOrder(orderData, printerSettings).then(res => {
        if (res.success) {
          showToast(`✓ ${displayOrderNumber} an Drucker übermittelt (${res.printedCount} Bons)`);
        } else if (res.errors && res.errors.length) {
          showToast(`⚠️ Druckfehler: ${res.errors[0]}`);
        }
      }).catch(err => {
        showToast(`⚠️ Druckerfehler: ${err.message || err}`);
      });
    } else if (printerSettings.printMode === 'browser') {
      // Fallback: Quittungs-Modal anzeigen für AirPrint
      showReceiptModal(orderData);
    } else {
      // 'manual' (Empfohlen für Festbetrieb): Kasse sofort frei, kein Modal!
      showToast(`Bestellung ${displayOrderNumber} bezahlt (${formatCHF(total)}) – Kasse bereit`);
    }
  }

  // 1-Klick-Ausdruck des letzten getätigten Bons
  async function printLastOrder() {
    if (!lastCompletedOrder) {
      showToast('Noch kein vorheriger Bon vorhanden.');
      return;
    }

    activeReceiptOrder = lastCompletedOrder;

    if (printerSettings.printMode === 'browser') {
      showReceiptModal(lastCompletedOrder);
      return;
    }

    showToast(`🖨️ Sende ${lastCompletedOrder.displayOrderNumber} an Epson-Drucker...`);
    try {
      const res = await EposPrint.printOrder(lastCompletedOrder, printerSettings);
      if (res.success) {
        showToast(`✓ Bon ${lastCompletedOrder.displayOrderNumber} erfolgreich gedruckt`);
      } else {
        showToast(`⚠️ Drucker nicht erreichbar. Öffne Vorschau...`);
        showReceiptModal(lastCompletedOrder);
      }
    } catch (e) {
      showToast(`⚠️ Druckfehler: ${e.message || e}`);
      showReceiptModal(lastCompletedOrder);
    }
  }

  // Quittung / Beleg Modal (Vorschau & manueller Druck)
  function showReceiptModal(order) {
    activeReceiptOrder = order;
    const modal = document.getElementById('receipt-modal');
    const printArea = document.getElementById('print-receipt-area');
    if (!modal || !printArea) return;

    printArea.innerHTML = `
      <div style="text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 4px;">
        SPORTSCHÜTZEN MUHEN
      </div>
      <div style="text-align: center; font-size: 11px; margin-bottom: 10px;">
        Festwirtschaft & Kasse<br>
        <span style="font-size: 16px; font-weight: 800; color: #0284c7;">BESTELLUNG ${order.displayOrderNumber || order.orderNumber}</span><br>
        ${new Date(order.timestamp).toLocaleString('de-CH')}
      </div>
      <div style="border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px; font-size: 12px;">
        Bediener: ${escapeHtml(order.cashierName)} (${escapeHtml(order.stationName)})
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px;">
        ${order.items.map(it => `
          <tr>
            <td style="padding: 2px 0;">${it.qty}× ${escapeHtml(it.name)}</td>
            <td style="text-align: right; font-weight: bold;">${formatCHF(it.price * it.qty)}</td>
          </tr>
        `).join('')}
      </table>

      <div style="border-top: 1px solid #000; padding-top: 4px; margin-bottom: 6px; font-size: 13px;">
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

  // Direktdruck des aktiven Quittungsmodals via Epson ePOS
  async function printActiveReceipt() {
    if (!activeReceiptOrder) {
      showToast('Keine Quittung geladen');
      return;
    }
    showToast(`🖨️ Sende Beleg an Epson-Drucker (${printerSettings.printerIp})...`);
    try {
      const res = await EposPrint.printOrder(activeReceiptOrder, printerSettings);
      if (res.success) {
        showToast('✓ Belege erfolgreich gedruckt');
        const modal = document.getElementById('receipt-modal');
        if (modal) modal.classList.remove('active');
      } else {
        showToast('⚠️ Druck fehlgeschlagen: ' + (res.errors ? res.errors.join(', ') : 'Unbekannter Fehler'));
      }
    } catch (e) {
      showToast('⚠️ Verbindungsfehler: ' + (e.message || e));
    }
  }

  // Fallback: Über natives iOS/Browser Druckermenü
  function printBrowserReceipt() {
    window.print();
  }

  function printReceipt() {
    printActiveReceipt();
  }

  // ─────────────────────────────────────────────────────────────
  // EINSTELLUNGEN & DRUCKER DIALOG
  // ─────────────────────────────────────────────────────────────
  function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    // Felder vorbefüllen
    const ipInput = document.getElementById('setting-printer-ip');
    if (ipInput) ipInput.value = printerSettings.printerIp || '192.168.68.200';

    // Treiber / Verbindungsmethode Radio
    const driver = printerSettings.printDriver || 'gateway';
    const driverRadio = document.querySelector(`input[name="setting-print-driver"][value="${driver}"]`);
    if (driverRadio) driverRadio.checked = true;

    // SSL Checkbox
    const sslCheck = document.getElementById('setting-print-ssl');
    if (sslCheck) sslCheck.checked = !!printerSettings.useSsl;
    toggleDriverOptions();

    // Druckmodus Radio
    const mode = printerSettings.printMode || 'manual';
    const radio = document.querySelector(`input[name="setting-print-mode"][value="${mode}"]`);
    if (radio) radio.checked = true;

    // Checkboxen
    const guestCheck = document.getElementById('setting-print-guest');
    if (guestCheck) guestCheck.checked = printerSettings.printGuestReceipt !== false;

    const kitchenCheck = document.getElementById('setting-print-kitchen');
    if (kitchenCheck) kitchenCheck.checked = printerSettings.printKitchenReceipt !== false;

    const drinksCheck = document.getElementById('setting-print-drinks');
    if (drinksCheck) drinksCheck.checked = !!printerSettings.printDrinksReceipt;

    const drawerCheck = document.getElementById('setting-open-drawer');
    if (drawerCheck) drawerCheck.checked = printerSettings.openDrawer !== false;

    // Bestellnummer-Label
    const seqLabel = document.getElementById('setting-current-seq-label');
    if (seqLabel) {
      seqLabel.textContent = '#' + String(printerSettings.orderSequence || 1).padStart(2, '0');
    }

    const statusEl = document.getElementById('printer-test-status');
    if (statusEl) statusEl.innerHTML = '';

    modal.classList.add('active');
  }

  function toggleDriverOptions() {
    const selectedDriver = document.querySelector('input[name="setting-print-driver"]:checked');
    const driver = selectedDriver ? selectedDriver.value : (printerSettings.printDriver || 'gateway');
    const sslDiv = document.getElementById('epos-direct-options');
    if (sslDiv) {
      sslDiv.style.display = (driver === 'epos_direct') ? 'block' : 'none';
    }
  }

  async function saveSettings() {
    const ipInput = document.getElementById('setting-printer-ip');
    const newIp = ipInput ? ipInput.value.trim() : '';

    const selectedDriver = document.querySelector('input[name="setting-print-driver"]:checked');
    const newDriver = selectedDriver ? selectedDriver.value : 'gateway';

    const selectedMode = document.querySelector('input[name="setting-print-mode"]:checked');
    const newMode = selectedMode ? selectedMode.value : 'manual';

    const sslCheck = document.getElementById('setting-print-ssl');
    const newSsl = sslCheck ? sslCheck.checked : false;

    const guestCheck = document.getElementById('setting-print-guest');
    const kitchenCheck = document.getElementById('setting-print-kitchen');
    const drinksCheck = document.getElementById('setting-print-drinks');
    const drawerCheck = document.getElementById('setting-open-drawer');

    printerSettings.printerIp = newIp;
    printerSettings.printDriver = newDriver;
    printerSettings.useSsl = newSsl;
    printerSettings.printMode = newMode;
    printerSettings.printGuestReceipt = guestCheck ? guestCheck.checked : true;
    printerSettings.printKitchenReceipt = kitchenCheck ? kitchenCheck.checked : true;
    printerSettings.printDrinksReceipt = drinksCheck ? drinksCheck.checked : false;
    printerSettings.openDrawer = drawerCheck ? drawerCheck.checked : true;

    // In IndexedDB sichern
    await FestkasseDB.put('settings', { key: 'printerIp', value: printerSettings.printerIp });
    await FestkasseDB.put('settings', { key: 'printDriver', value: printerSettings.printDriver });
    await FestkasseDB.put('settings', { key: 'useSsl', value: printerSettings.useSsl });
    await FestkasseDB.put('settings', { key: 'printMode', value: printerSettings.printMode });
    await FestkasseDB.put('settings', { key: 'printGuestReceipt', value: printerSettings.printGuestReceipt });
    await FestkasseDB.put('settings', { key: 'printKitchenReceipt', value: printerSettings.printKitchenReceipt });
    await FestkasseDB.put('settings', { key: 'printDrinksReceipt', value: printerSettings.printDrinksReceipt });
    await FestkasseDB.put('settings', { key: 'openDrawer', value: printerSettings.openDrawer });

    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');

    showToast(`✓ Einstellungen & Drucker (${printerSettings.printerIp || 'Keine IP'}) gespeichert`);
  }

  async function resetOrderSequence() {
    printerSettings.orderSequence = 1;
    await FestkasseDB.put('settings', { key: 'orderSequence', value: 1 });
    const seqLabel = document.getElementById('setting-current-seq-label');
    if (seqLabel) seqLabel.textContent = '#01';
    showToast('Bestellnummer auf #01 zurückgesetzt');
  }

  async function runPrinterTest(type = 'guest') {
    const statusEl = document.getElementById('printer-test-status');
    const ipInput = document.getElementById('setting-printer-ip');
    const ip = ipInput ? ipInput.value.trim() : printerSettings.printerIp;

    const selectedDriver = document.querySelector('input[name="setting-print-driver"]:checked');
    const driver = selectedDriver ? selectedDriver.value : (printerSettings.printDriver || 'gateway');

    if (!ip && driver !== 'tm_assistant') {
      if (statusEl) statusEl.innerHTML = '<span style="color: #ef4444;">⚠️ Bitte zuerst eine Drucker-IP eingeben.</span>';
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = `<span style="color: #38bdf8;">⏳ Sende ${type === 'kitchen' ? 'Küchenbon' : 'Gastbeleg'} via ${driver === 'tm_assistant' ? 'TM Print Assistant' : ip}...</span>`;
    }

    const sslCheck = document.getElementById('setting-print-ssl');
    const useSsl = sslCheck ? sslCheck.checked : !!printerSettings.useSsl;

    try {
      await EposPrint.testPrint(ip, type, driver, { useSsl });
      if (statusEl) {
        if (driver === 'tm_assistant') {
          statusEl.innerHTML = '<span style="color: #10b981; font-weight: bold;">🟢 An Epson TM Print Assistant übergeben!</span>';
        } else if (driver === 'epos_direct') {
          statusEl.innerHTML = `<span style="color: #10b981; font-weight: bold;">🟢 Erfolgreich! ePOS-Testbon direkt an ${ip} gesendet (ohne Supabase).</span>`;
        } else {
          statusEl.innerHTML = `<span style="color: #10b981; font-weight: bold;">🟢 Erfolgreich! Testbon via LAN-Gateway an ${ip} gesendet.</span>`;
        }
      }
      showToast(`✓ Testdruck (${type}) übermittelt`);
    } catch (err) {
      if (statusEl) {
        statusEl.innerHTML = `<span style="color: #ef4444; font-weight: bold;">🔴 Fehler: ${err.message || err}</span>`;
      }
      showToast(`⚠️ Testdruck fehlgeschlagen: ${err.message || err}`);
    }
  }

  // View Navigation
  function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetBtn = document.getElementById(`tab-btn-${viewName}`);

    if (targetView) targetView.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

    if (viewName === 'abschluss') {
      KassenAbschluss.init();
    } else if (viewName === 'kellner') {
      KellnerHandheld.init();
    }
  }

  // Bediener Modal & Wechsel
  function openCashierModal() {
    const modal = document.getElementById('cashier-modal');
    const inputName = document.getElementById('input-cashier-name');
    const inputStation = document.getElementById('input-station-name');
    if (inputName) inputName.value = activeCashierName;
    if (inputStation) inputStation.value = activeStationName;
    if (modal) modal.classList.add('active');
  }

  async function saveCashier() {
    const inputName = document.getElementById('input-cashier-name');
    const inputStation = document.getElementById('input-station-name');
    const newName = inputName ? inputName.value.trim() : '';
    const newStation = inputStation ? inputStation.value.trim() : '';

    if (!newName) {
      alert('Bitte gib deinen Namen ein.');
      return;
    }

    activeCashierName = newName;
    if (newStation) activeStationName = newStation;

    await FestkasseDB.put('settings', { key: 'cashierName', value: activeCashierName });
    await FestkasseDB.put('settings', { key: 'stationName', value: activeStationName });

    const nameEl = document.getElementById('active-cashier-name');
    const stationEl = document.getElementById('active-cashier-station');
    if (nameEl) nameEl.textContent = activeCashierName;
    if (stationEl) stationEl.textContent = activeStationName;

    const avatarEl = document.getElementById('active-operator-avatar');
    if (avatarEl) avatarEl.textContent = getInitials(activeCashierName);

    const modal = document.getElementById('cashier-modal');
    if (modal) modal.classList.remove('active');

    showToast(`Bediener aktualisiert: ${activeCashierName} (${activeStationName})`);
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
    printActiveReceipt,
    printBrowserReceipt,
    printLastOrder,
    openSettingsModal,
    saveSettings,
    toggleDriverOptions,
    resetOrderSequence,
    runPrinterTest,
    switchView,
    openCashierModal,
    saveCashier,
    getActiveCashierName: () => activeCashierName,
    showToast,
    getPrinterSettings: () => ({ ...printerSettings }),
    loadIncomingOrderToCart
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  KasseModule.init();

  // Schutz vor versehentlichem Pull-to-Refresh auf iOS/iPadOS Safari
  window.addEventListener('touchmove', (e) => {
    let target = e.target;
    let scrollable = null;
    while (target && target !== document.body && target !== document.documentElement) {
      const style = window.getComputedStyle(target);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && target.scrollHeight > target.clientHeight) {
        scrollable = target;
        break;
      }
      target = target.parentElement;
    }
    if (!scrollable && e.touches && e.touches.length === 1) {
      e.preventDefault();
    }
  }, { passive: false });
});
