/**
 * db.js - IndexedDB Engine für die Festkasse Sportschützen Muhen
 * Datenbankname: FestkasseDB
 * 100% autark und lokal ohne Serverabhängigkeit
 */

const FestkasseDB = (function () {
  const DB_NAME = 'FestkasseDB';
  const DB_VERSION = 1;
  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) {
        return resolve(dbInstance);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Kategorien
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('sortOrder', 'sortOrder', { unique: false });
        }

        // 2. Produkte / Artikel
        if (!db.objectStoreNames.contains('products')) {
          const prodStore = db.createObjectStore('products', { keyPath: 'id' });
          prodStore.createIndex('categoryId', 'categoryId', { unique: false });
          prodStore.createIndex('name', 'name', { unique: false });
        }

        // 3. Bestellungen / Quittungen
        if (!db.objectStoreNames.contains('orders')) {
          const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
          orderStore.createIndex('timestamp', 'timestamp', { unique: false });
          orderStore.createIndex('status', 'status', { unique: false });
          orderStore.createIndex('orderNumber', 'orderNumber', { unique: false });
        }

        // 4. Kassenbewegungen (Einlagen, Entnahmen, Barausgaben)
        if (!db.objectStoreNames.contains('cashMovements')) {
          const cashStore = db.createObjectStore('cashMovements', { keyPath: 'id' });
          cashStore.createIndex('timestamp', 'timestamp', { unique: false });
          cashStore.createIndex('type', 'type', { unique: false });
        }

        // 5. Aplano-Stationen
        if (!db.objectStoreNames.contains('stations')) {
          db.createObjectStore('stations', { keyPath: 'id' });
        }

        // 6. Aplano-Schichten
        if (!db.objectStoreNames.contains('shifts')) {
          const shiftStore = db.createObjectStore('shifts', { keyPath: 'id' });
          shiftStore.createIndex('stationId', 'stationId', { unique: false });
          shiftStore.createIndex('date', 'date', { unique: false });
        }

        // 7. Z-Abschlüsse / Kassensturz
        if (!db.objectStoreNames.contains('zReports')) {
          const zStore = db.createObjectStore('zReports', { keyPath: 'id' });
          zStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 8. Einstellungen
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('IndexedDB Fehler:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Generische Helpers
  async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function clear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // Seed Data Initialisierung
  async function initializeDefaults() {
    const categories = await getAll('categories');
    if (categories.length > 0) return; // Bereits initialisiert

    console.log('[FestkasseDB] Initialisiere Standard-Artikel und Aplano-Schichten...');

    // 1. Kategorien
    const defaultCategories = [
      { id: 'cat_getraenke', name: 'Alkoholfrei', icon: '🥤', color: '#0ea5e9', sortOrder: 1 },
      { id: 'cat_bier_wein', name: 'Bier & Wein', icon: '🍺', color: '#f59e0b', sortOrder: 2 },
      { id: 'cat_grill', name: 'Grill & Küche', icon: '🥩', color: '#ef4444', sortOrder: 3 },
      { id: 'cat_kaffee', name: 'Kaffee & Kuchen', icon: '☕', color: '#8b5cf6', sortOrder: 4 },
      { id: 'cat_bar', name: 'Bar & Spirituosen', icon: '🍸', color: '#ec4899', sortOrder: 5 },
      { id: 'cat_depot', name: 'Depot & Kaution', icon: '🔄', color: '#10b981', sortOrder: 6 }
    ];
    for (const c of defaultCategories) await put('categories', c);

    // 2. Produkte
    const defaultProducts = [
      // Alkoholfrei
      { id: 'p_mineral', categoryId: 'cat_getraenke', name: 'Mineral mit/ohne 0.5l', price: 4.50, unit: 'Fl.', icon: '💧', depotAmount: 0 },
      { id: 'p_cola', categoryId: 'cat_getraenke', name: 'Coca Cola 0.5l', price: 4.50, unit: 'Fl.', icon: '🥤', depotAmount: 0 },
      { id: 'p_cola_zero', categoryId: 'cat_getraenke', name: 'Cola Zero 0.5l', price: 4.50, unit: 'Fl.', icon: '🥤', depotAmount: 0 },
      { id: 'p_icetea', categoryId: 'cat_getraenke', name: 'Ice Tea Lemon 0.5l', price: 4.50, unit: 'Fl.', icon: '🍋', depotAmount: 0 },
      { id: 'p_rivella', categoryId: 'cat_getraenke', name: 'Rivella Rot/Blau 0.5l', price: 4.50, unit: 'Fl.', icon: '🥛', depotAmount: 0 },
      { id: 'p_schorle', categoryId: 'cat_getraenke', name: 'Apfelschorle 0.5l', price: 4.50, unit: 'Fl.', icon: '🍏', depotAmount: 0 },
      { id: 'p_redbull', categoryId: 'cat_getraenke', name: 'Red Bull 0.25l', price: 5.00, unit: 'Dose', icon: '⚡', depotAmount: 0 },

      // Bier & Wein
      { id: 'p_bier_offen', categoryId: 'cat_bier_wein', name: 'Bier Offenausschank 0.5l', price: 5.50, unit: 'Becher', icon: '🍺', depotAmount: 2.00 },
      { id: 'p_bier_stange', categoryId: 'cat_bier_wein', name: 'Stange Bier 0.3l', price: 4.50, unit: 'Glas', icon: '🍺', depotAmount: 2.00 },
      { id: 'p_panache', categoryId: 'cat_bier_wein', name: 'Panaché 0.5l', price: 5.50, unit: 'Becher', icon: '🍻', depotAmount: 2.00 },
      { id: 'p_bier_alkfrei', categoryId: 'cat_bier_wein', name: 'Bier Alkoholfrei 0.33l', price: 4.50, unit: 'Fl.', icon: '🍺', depotAmount: 0 },
      { id: 'p_wein_rot', categoryId: 'cat_bier_wein', name: 'Glas Rotwein 1dl', price: 5.00, unit: 'Glas', icon: '🍷', depotAmount: 2.00 },
      { id: 'p_wein_weiss', categoryId: 'cat_bier_wein', name: 'Glas Weisswein 1dl', price: 5.00, unit: 'Glas', icon: '🥂', depotAmount: 2.00 },
      { id: 'p_gespitzter', categoryId: 'cat_bier_wein', name: 'Gespritzter Weisswein', price: 5.50, unit: 'Glas', icon: '🍹', depotAmount: 2.00 },
      { id: 'p_flasche_wein', categoryId: 'cat_bier_wein', name: 'Flasche Wein 7.5dl', price: 28.00, unit: 'Fl.', icon: '🍾', depotAmount: 0 },

      // Grill & Küche
      { id: 'p_bratwurst', categoryId: 'cat_grill', name: 'Bratwurst mit Brot/Senf', price: 7.50, unit: 'Port.', icon: '🌭', depotAmount: 0 },
      { id: 'p_cervelat', categoryId: 'cat_grill', name: 'Cervelat mit Brot/Senf', price: 6.50, unit: 'Port.', icon: '🌭', depotAmount: 0 },
      { id: 'p_steak', categoryId: 'cat_grill', name: 'Schweinssteak mit Brot', price: 10.00, unit: 'Port.', icon: '🥩', depotAmount: 0 },
      { id: 'p_pommes', categoryId: 'cat_grill', name: 'Portion Pommes frites', price: 5.50, unit: 'Port.', icon: '🍟', depotAmount: 0 },
      { id: 'p_chnobli', categoryId: 'cat_grill', name: 'Chnoblibrot', price: 6.00, unit: 'Stk.', icon: '🥖', depotAmount: 0 },
      { id: 'p_kartoffelsalat', categoryId: 'cat_grill', name: 'Portion Kartoffelsalat', price: 4.50, unit: 'Port.', icon: '🥗', depotAmount: 0 },
      { id: 'p_gruener_salat', categoryId: 'cat_grill', name: 'Grüner Salatteller', price: 5.00, unit: 'Port.', icon: '🥗', depotAmount: 0 },

      // Kaffee & Kuchen
      { id: 'p_kaffee', categoryId: 'cat_kaffee', name: 'Kaffee Crème / Espresso', price: 4.00, unit: 'Tasse', icon: '☕', depotAmount: 0 },
      { id: 'p_kaffee_lutz', categoryId: 'cat_kaffee', name: 'Kaffee Luz / Fertig', price: 6.50, unit: 'Glas', icon: '☕', depotAmount: 2.00 },
      { id: 'p_kuchen', categoryId: 'cat_kaffee', name: 'Stück Kuchen / Torte', price: 3.50, unit: 'Stk.', icon: '🍰', depotAmount: 0 },

      // Bar
      { id: 'p_aperol', categoryId: 'cat_bar', name: 'Aperol Spritz', price: 8.50, unit: 'Glas', icon: '🍹', depotAmount: 2.00 },
      { id: 'p_gin_tonic', categoryId: 'cat_bar', name: 'Gin Tonic 4cl', price: 10.00, unit: 'Glas', icon: '🍸', depotAmount: 2.00 },
      { id: 'p_vodka_lemon', categoryId: 'cat_bar', name: 'Vodka Lemon 4cl', price: 10.00, unit: 'Glas', icon: '🥃', depotAmount: 2.00 },
      { id: 'p_shot', categoryId: 'cat_bar', name: 'Shot (Appenzeller, etc.)', price: 4.50, unit: 'Shot', icon: '🍶', depotAmount: 0 },

      // Depot
      { id: 'p_depot_glas_plus', categoryId: 'cat_depot', name: '+ Depot Becher/Glas', price: 2.00, unit: 'Stk.', icon: '➕', isDepot: true, depotType: 'plus' },
      { id: 'p_depot_teller_plus', categoryId: 'cat_depot', name: '+ Depot Geschirr', price: 5.00, unit: 'Stk.', icon: '➕', isDepot: true, depotType: 'plus' },
      { id: 'p_depot_glas_minus', categoryId: 'cat_depot', name: '− Rückgabe Glas/Becher', price: -2.00, unit: 'Stk.', icon: '↩️', isDepot: true, depotType: 'minus' },
      { id: 'p_depot_teller_minus', categoryId: 'cat_depot', name: '− Rückgabe Geschirr', price: -5.00, unit: 'Stk.', icon: '↩️', isDepot: true, depotType: 'minus' }
    ];
    for (const p of defaultProducts) await put('products', p);

    // 3. Aplano-Stationen
    const defaultStations = [
      { id: 'st_kasse1', name: 'Kasse 1 (Haupteingang)', icon: '💵', color: '#10b981', isCashier: true },
      { id: 'st_kasse2', name: 'Kasse 2 (Zelt / Schnell)', icon: '💵', color: '#059669', isCashier: true },
      { id: 'st_grill', name: 'Grill & Warme Küche', icon: '🥩', color: '#ef4444', isCashier: false },
      { id: 'st_ausschank', name: 'Ausschank & Bier', icon: '🍺', color: '#f59e0b', isCashier: false },
      { id: 'st_bar', name: 'Fest-Bar / Drinks', icon: '🍸', color: '#8b5cf6', isCashier: false },
      { id: 'st_service', name: 'Service & Tische', icon: '🍽️', color: '#3b82f6', isCashier: false },
      { id: 'st_springer', name: 'Springer & Abwasch', icon: '🧹', color: '#64748b', isCashier: false }
    ];
    for (const s of defaultStations) await put('stations', s);

    // 4. Aplano-Beispiel-Schichten für den aktuellen Tag
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultShifts = [
      // Kasse 1
      {
        id: 'sh_k1_1',
        stationId: 'st_kasse1',
        date: todayStr,
        startTime: '10:00',
        endTime: '14:00',
        title: 'Frühschicht',
        requiredHelpers: 1,
        assignedHelpers: [
          { name: 'Beat Müller', phone: '079 123 45 67', role: 'Kassier', note: 'Kassenverantwortlicher' }
        ]
      },
      {
        id: 'sh_k1_2',
        stationId: 'st_kasse1',
        date: todayStr,
        startTime: '14:00',
        endTime: '18:00',
        title: 'Nachmittag',
        requiredHelpers: 1,
        assignedHelpers: [
          { name: 'Sandra Frei', phone: '078 234 56 78', role: 'Kassier', note: '' }
        ]
      },
      {
        id: 'sh_k1_3',
        stationId: 'st_kasse1',
        date: todayStr,
        startTime: '18:00',
        endTime: '23:00',
        title: 'Abendschicht',
        requiredHelpers: 1,
        assignedHelpers: [] // Noch offen
      },

      // Grill
      {
        id: 'sh_gr_1',
        stationId: 'st_grill',
        date: todayStr,
        startTime: '10:00',
        endTime: '14:00',
        title: 'Frühschicht',
        requiredHelpers: 2,
        assignedHelpers: [
          { name: 'Thomas Hauri', phone: '079 345 67 89', role: 'Grillmeister' },
          { name: 'Martin Keller', phone: '076 456 78 90', role: 'Beilagen' }
        ]
      },
      {
        id: 'sh_gr_2',
        stationId: 'st_grill',
        date: todayStr,
        startTime: '14:00',
        endTime: '18:00',
        title: 'Nachmittag',
        requiredHelpers: 2,
        assignedHelpers: [
          { name: 'Urs Bertschi', phone: '079 567 89 01', role: 'Grill' }
        ] // 1 Helfer gesucht!
      },
      {
        id: 'sh_gr_3',
        stationId: 'st_grill',
        date: todayStr,
        startTime: '18:00',
        endTime: '23:00',
        title: 'Abendschicht',
        requiredHelpers: 2,
        assignedHelpers: [
          { name: 'Marc Wyrsch', phone: '079 678 90 12', role: 'Grill' },
          { name: 'Rolf Schärer', phone: '078 789 01 23', role: 'Beilagen' }
        ]
      },

      // Ausschank
      {
        id: 'sh_as_1',
        stationId: 'st_ausschank',
        date: todayStr,
        startTime: '10:00',
        endTime: '14:00',
        title: 'Frühschicht',
        requiredHelpers: 2,
        assignedHelpers: [
          { name: 'Lukas Burkhalter', phone: '079 890 12 34', role: 'Ausschank' },
          { name: 'Peter Meier', phone: '076 901 23 45', role: 'Bier' }
        ]
      },
      {
        id: 'sh_as_2',
        stationId: 'st_ausschank',
        date: todayStr,
        startTime: '14:00',
        endTime: '18:00',
        title: 'Nachmittag',
        requiredHelpers: 2,
        assignedHelpers: [
          { name: 'David Zürcher', phone: '079 012 34 56', role: 'Ausschank' }
        ]
      },
      {
        id: 'sh_as_3',
        stationId: 'st_ausschank',
        date: todayStr,
        startTime: '18:00',
        endTime: '23:00',
        title: 'Abendschicht',
        requiredHelpers: 2,
        assignedHelpers: [
          { name: 'Nicole Zurbriggen', phone: '079 111 22 33', role: 'Ausschank' },
          { name: 'Christian Morgenthaler', phone: '078 222 33 44', role: 'Ausschank' }
        ]
      }
    ];
    for (const sh of defaultShifts) await put('shifts', sh);

    // 5. Einstellungen
    await put('settings', { key: 'eventTitle', value: 'Festwirtschaft Sportschützen Muhen' });
    await put('settings', { key: 'cashierName', value: 'Beat Müller' });
    await put('settings', { key: 'stationName', value: 'Kasse 1' });
    await put('settings', { key: 'openingCash', value: 300.00 });
    await put('settings', { key: 'activeDate', value: todayStr });
    await put('settings', { key: 'printerIp', value: '192.168.68.200' });
    await put('settings', { key: 'printMode', value: 'manual' }); // 'manual' | 'auto' | 'browser'
    await put('settings', { key: 'printGuestReceipt', value: true });
    await put('settings', { key: 'printKitchenReceipt', value: true });
    await put('settings', { key: 'printDrinksReceipt', value: false });
    await put('settings', { key: 'openDrawer', value: true });
    await put('settings', { key: 'orderSequence', value: 1 });

    console.log('[FestkasseDB] Erfolgreich initialisiert!');
  }

  /**
   * Wendet synchronisierte Artikel & Depots aus dem Modul Anlässe (event_items) an.
   * Spiegelt diese in die lokalen IndexedDB Object Stores 'products' und 'categories'.
   */
  async function applySyncedEventItems(eventData, rawItems) {
    if (!eventData || !Array.isArray(rawItems)) {
      throw new Error('Ungültige Eventdaten oder Artikelliste für Kassen-Sync');
    }

    const catDefinitions = {
      cat_grill: { id: 'cat_grill', name: 'Grill & Küche', icon: '🥩', color: '#ef4444', sortOrder: 1 },
      cat_getraenke: { id: 'cat_getraenke', name: 'Alkoholfrei', icon: '🥤', color: '#0ea5e9', sortOrder: 2 },
      cat_bier_wein: { id: 'cat_bier_wein', name: 'Bier & Wein', icon: '🍺', color: '#f59e0b', sortOrder: 3 },
      cat_kaffee: { id: 'cat_kaffee', name: 'Kaffee & Kuchen', icon: '☕', color: '#8b5cf6', sortOrder: 4 },
      cat_bar: { id: 'cat_bar', name: 'Bar & Spirituosen', icon: '🍸', color: '#ec4899', sortOrder: 5 },
      cat_depot: { id: 'cat_depot', name: 'Depot & Kaution', icon: '🔄', color: '#10b981', sortOrder: 6 }
    };

    function guessIcon(name, category) {
      const lower = (name || '').toLowerCase();
      if (lower.includes('mineral') || lower.includes('wasser')) return '💧';
      if (lower.includes('cola')) return '🥤';
      if (lower.includes('tea') || lower.includes('tee')) return '🍋';
      if (lower.includes('rivella')) return '🥛';
      if (lower.includes('schorle') || lower.includes('apfel')) return '🍏';
      if (lower.includes('red bull') || lower.includes('energy')) return '⚡';
      if (lower.includes('bier') || lower.includes('feldschlösschen') || lower.includes('quöllfrisch') || lower.includes('eichhof')) return '🍺';
      if (lower.includes('panaché') || lower.includes('panache')) return '🍻';
      if (lower.includes('rotwein') || lower.includes('wein rot')) return '🍷';
      if (lower.includes('weisswein') || lower.includes('wein weiss') || lower.includes('gespritzt')) return '🥂';
      if (lower.includes('bratwurst') || lower.includes('cervelat') || lower.includes('hot dog')) return '🌭';
      if (lower.includes('steak') || lower.includes('fleisch') || lower.includes('kotelett')) return '🥩';
      if (lower.includes('pommes') || lower.includes('frites')) return '🍟';
      if (lower.includes('schnitzel') || lower.includes('burger')) return '🍔';
      if (lower.includes('chnobli') || lower.includes('brot') || lower.includes('bürli')) return '🥖';
      if (lower.includes('salat')) return '🥗';
      if (lower.includes('kaffee') || lower.includes('espresso') || lower.includes('luz') || lower.includes('fertig')) return '☕';
      if (lower.includes('kuchen') || lower.includes('torte') || lower.includes('cremeschnitte')) return '🍰';
      if (lower.includes('aperol') || lower.includes('spritz') || lower.includes('hugo')) return '🍹';
      if (lower.includes('gin') || lower.includes('tonic') || lower.includes('vodka') || lower.includes('whisky')) return '🍸';
      if (lower.includes('shot') || lower.includes('appenzeller') || lower.includes('jäger')) return '🍶';
      if (category === 'Grill') return '🥩';
      if (category === 'Getränke') return '🥤';
      if (category === 'Bar') return '🍸';
      if (category === 'Depot') return '🔄';
      return '🍴';
    }

    function mapCategory(name, dbCat) {
      if (dbCat === 'Depot') return 'cat_depot';
      if (dbCat === 'Grill') return 'cat_grill';
      if (dbCat === 'Bar') return 'cat_bar';
      const lower = (name || '').toLowerCase();
      if (lower.includes('kaffee') || lower.includes('espresso') || lower.includes('kuchen') || lower.includes('torte') || lower.includes('luz') || lower.includes('fertig')) {
        return 'cat_kaffee';
      }
      if (lower.includes('bier') || lower.includes('wein') || lower.includes('panaché') || lower.includes('cidre')) {
        return 'cat_bier_wein';
      }
      if (dbCat === 'Festwirtschaft') {
        if (lower.includes('wurst') || lower.includes('pommes') || lower.includes('steak') || lower.includes('brot') || lower.includes('salat') || lower.includes('schnitzel')) {
          return 'cat_grill';
        }
      }
      return 'cat_getraenke';
    }

    const transformedProducts = [];
    const usedCategoryIds = new Set();

    for (const item of rawItems) {
      const salesPrice = parseFloat(item.sales_price) || 0;
      if (salesPrice <= 0 && item.category !== 'Depot') continue;

      if (item.category === 'Depot') {
        const depotVal = Math.abs(salesPrice) || 2.00;
        const cleanName = item.item_name.replace(/^(depot|\+|\-)\s*/i, '').trim();

        // 1. Plus-Kachel (+ Depot)
        transformedProducts.push({
          id: `depot_plus_${item.id}`,
          categoryId: 'cat_depot',
          name: `+ Depot ${cleanName}`,
          price: depotVal,
          unit: item.unit || 'Stk.',
          icon: '➕',
          isDepot: true,
          depotType: 'plus',
          depotAmount: 0
        });

        // 2. Minus-Kachel (Rückgabe)
        transformedProducts.push({
          id: `depot_minus_${item.id}`,
          categoryId: 'cat_depot',
          name: `− Rückgabe ${cleanName}`,
          price: -depotVal,
          unit: item.unit || 'Stk.',
          icon: '↩️',
          isDepot: true,
          depotType: 'minus',
          depotAmount: 0
        });

        usedCategoryIds.add('cat_depot');
      } else {
        const catId = mapCategory(item.item_name, item.category);
        const icon = guessIcon(item.item_name, item.category);
        const autoDepot = parseFloat(item.depot_amount) || 0;

        transformedProducts.push({
          id: item.id,
          categoryId: catId,
          name: item.item_name,
          price: salesPrice,
          unit: item.unit || 'Port.',
          icon: icon,
          isDepot: false,
          depotAmount: autoDepot
        });

        usedCategoryIds.add(catId);
        if (autoDepot > 0) {
          usedCategoryIds.add('cat_depot');
        }
      }
    }

    if (transformedProducts.length > 0) {
      // Bestehende Produkte leeren und neue schreiben
      await clear('products');
      for (const prod of transformedProducts) {
        await put('products', prod);
      }

      // Kategorien leeren und nur verwendete schreiben
      await clear('categories');
      const catsToSave = Object.values(catDefinitions).filter(c => usedCategoryIds.has(c.id));
      catsToSave.sort((a, b) => a.sortOrder - b.sortOrder);
      for (const cat of catsToSave) {
        await put('categories', cat);
      }

      // Einstellungen aktualisieren
      await put('settings', { key: 'activeEventId', value: eventData.id });
      await put('settings', { key: 'eventTitle', value: eventData.name });
      await put('settings', { key: 'lastSyncTimestamp', value: new Date().toISOString() });
    }

    return {
      event: eventData,
      productCount: transformedProducts.length,
      categoriesCount: usedCategoryIds.size
    };
  }

  return {
    openDB,
    getAll,
    get,
    put,
    remove,
    clear,
    initializeDefaults,
    applySyncedEventItems
  };
})();
