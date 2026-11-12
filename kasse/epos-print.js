/**
 * epos-print.js - Direktansteuerung von Epson LAN-Bondruckern via ePOS-Print & Gateway
 * Sportschützen Muhen - Festkasse
 * 
 * Unterstützt:
 * 1. ⚡ LAN-Gateway (CT 117 / Supabase): Nahtloser ESC/POS-Sofortdruck via Port 9100
 * 2. 🌐 Direkter ePOS-Print: 100% autarker Druck rein aus dem Browser via HTTP/HTTPS SOAP (ohne Supabase)
 * 3. 📄 AirPrint / Browser-Druckmenü Fallback
 * 
 * Belegarten:
 * - Gastbeleg (Quittung) mit Preisen, Zahlart & Abholnummer
 * - Küchen- / Grillbon (nur Speisen, riesige Bestell-Nr., automatischer Schnitt)
 * - Getränke- / Barbon
 * - Z-Kassenabschluss (Münzen, Noten, Differenz)
 */

const EposPrint = (function () {
  const SUPABASE_PRINT_URL = 'https://supabase-muhen.danfamily.uk/functions/v1/pos-print';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';

  // XML-Escaping
  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function formatCHF(val) {
    const num = parseFloat(val) || 0;
    return 'CHF ' + num.toFixed(2);
  }

  function padLine(left, right, width = 42) {
    const l = String(left || '');
    const r = String(right || '');
    const spaces = Math.max(1, width - l.length - r.length);
    return l + ' '.repeat(spaces) + r;
  }

  // Erzeugt das standardisierte ePOS-Print XML Wurzelelement (für URI-Scheme & Apps)
  function wrapEposXml(bodyXml) {
    return `<?xml version="1.0" encoding="utf-8"?>\n<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">\n${bodyXml}\n</epos-print>`;
  }

  // Erzeugt den offiziellen SOAP-Envelope für Epson ePOS-Print Web-Server (Port 80/443 Direktdruck)
  function wrapSoapEnvelope(bodyXml) {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
${bodyXml}
    </epos-print>
  </s:Body>
</s:Envelope>`;
  }

  // 1. GASTBELEG XML-KORPUS
  function buildGuestReceiptInnerXml(order, config = {}) {
    const dateStr = new Date(order.timestamp || Date.now()).toLocaleString('de-CH');
    const orderNum = order.displayOrderNumber || order.orderNumber || '#01';
    const width = 42;

    let xml = '';

    if (config.openDrawer && order.paymentMethod === 'bar') {
      xml += `      <pulse drawer="drawer_1" time="pulse_100"/>\n`;
    }

    // Header
    xml += `      <text align="center" smooth="true"/>\n`;
    xml += `      <text font="font_a" em="true">SPORTSCHÜTZEN MUHEN&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Festwirtschaft &amp; Kasse&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">${escapeXml(dateStr)}&#10;</text>\n`;
    if (order.tableNumber) {
      xml += `      <text font="font_a" em="true">📍 ${escapeXml(order.tableNumber)}&#10;</text>\n`;
    }
    xml += `      <text font="font_a" em="false">Bediener: ${escapeXml(order.cashierName || 'Kasse')} (${escapeXml(order.stationName || 'Station')})&#10;&#10;</text>\n`;

    // Grosse Bestell-Nummer
    xml += `      <text align="center"/>\n`;
    xml += `      <text width="2" height="2" em="true">BESTELLUNG ${escapeXml(orderNum)}&#10;</text>\n`;
    xml += `      <text width="1" height="1" em="false">&#10;</text>\n`;

    // Trennlinie
    xml += `      <text align="left"/>\n`;
    xml += `      <text font="font_a">${'-'.repeat(width)}&#10;</text>\n`;

    // Positionen
    for (const it of (order.items || [])) {
      const itemTitle = `${it.qty}x ${it.name}`;
      const itemPrice = formatCHF(it.price * it.qty);
      if (itemTitle.length + itemPrice.length + 1 <= width) {
        xml += `      <text font="font_a">${escapeXml(padLine(itemTitle, itemPrice, width))}&#10;</text>\n`;
      } else {
        xml += `      <text font="font_a">${escapeXml(itemTitle)}&#10;</text>\n`;
        xml += `      <text font="font_a">${escapeXml(padLine('', itemPrice, width))}&#10;</text>\n`;
      }
    }

    xml += `      <text font="font_a">${'-'.repeat(width)}&#10;</text>\n`;

    // Total & Zahlung
    const totalLine = padLine('TOTAL:', formatCHF(order.totalAmount), width);
    xml += `      <text font="font_a" em="true">${escapeXml(totalLine)}&#10;</text>\n`;

    const payMethodLine = padLine('Zahlart:', (order.paymentMethod || 'BAR').toUpperCase(), width);
    xml += `      <text font="font_a" em="false">${escapeXml(payMethodLine)}&#10;</text>\n`;

    if (order.paymentMethod === 'bar') {
      const receivedLine = padLine('Erhalten:', formatCHF(order.cashReceived), width);
      const changeLine = padLine('Rückgeld:', formatCHF(order.changeGiven), width);
      xml += `      <text font="font_a">${escapeXml(receivedLine)}&#10;</text>\n`;
      xml += `      <text font="font_a" em="true">${escapeXml(changeLine)}&#10;</text>\n`;
    }

    xml += `      <text font="font_a">${'='.repeat(width)}&#10;</text>\n`;

    // Footer
    xml += `      <text align="center"/>\n`;
    xml += `      <text font="font_a" em="false">Herzlichen Dank für deinen Besuch!&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Gut Schuss!&#10;</text>\n`;

    xml += `      <feed line="3"/>\n`;
    xml += `      <cut type="feed"/>\n`;

    return xml;
  }

  // 2. KÜCHEN- / GRILL-BON XML-KORPUS
  function buildKitchenReceiptInnerXml(order, config = {}) {
    const kitchenItems = (order.items || []).filter(it => {
      if (it.categoryId === 'cat_grill') return true;
      const n = (it.name || '').toLowerCase();
      return n.includes('wurst') || n.includes('steak') || n.includes('pommes') || n.includes('brot') || n.includes('salat') || n.includes('cervelat');
    });

    if (kitchenItems.length === 0) return null;

    const timeStr = new Date(order.timestamp || Date.now()).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    const orderNum = order.displayOrderNumber || order.orderNumber || '#01';
    const width = 42;

    let xml = '';
    xml += `      <text align="center"/>\n`;
    xml += `      <text font="font_a" em="true" width="2" height="1">*** KÜCHE / GRILL ***&#10;</text>\n`;
    if (order.tableNumber) {
      xml += `      <text font="font_a" em="true" width="2" height="2">📍 ${escapeXml(order.tableNumber)}&#10;</text>\n`;
    }
    xml += `      <text font="font_a" em="false" width="1" height="1">&#10;</text>\n`;

    xml += `      <text align="center"/>\n`;
    xml += `      <text width="3" height="3" em="true">${escapeXml(orderNum)}&#10;</text>\n`;
    xml += `      <text width="1" height="1" em="false">&#10;</text>\n`;

    xml += `      <text align="left"/>\n`;
    xml += `      <text font="font_a">Zeit: ${escapeXml(timeStr)} | Kasse: ${escapeXml(order.stationName || 'Kasse 1')}&#10;</text>\n`;
    xml += `      <text font="font_a">${'='.repeat(width)}&#10;</text>\n`;

    for (const it of kitchenItems) {
      xml += `      <text font="font_a" width="2" height="2" em="true">${it.qty}x ${escapeXml(it.name)}&#10;</text>\n`;
      xml += `      <text width="1" height="1" em="false">&#10;</text>\n`;
    }

    xml += `      <text font="font_a">${'='.repeat(width)}&#10;</text>\n`;
    xml += `      <feed line="3"/>\n`;
    xml += `      <cut type="feed"/>\n`;

    return xml;
  }

  // 3. GETRÄNKE- / BAR-BON XML-KORPUS
  function buildDrinksReceiptInnerXml(order, config = {}) {
    const drinkItems = (order.items || []).filter(it => {
      const c = it.categoryId || '';
      return c === 'cat_getraenke' || c === 'cat_bier_wein' || c === 'cat_kaffee' || c === 'cat_bar';
    });

    if (drinkItems.length === 0) return null;

    const timeStr = new Date(order.timestamp || Date.now()).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    const orderNum = order.displayOrderNumber || order.orderNumber || '#01';
    const width = 42;

    let xml = '';
    xml += `      <text align="center"/>\n`;
    xml += `      <text font="font_a" em="true" width="2" height="1">*** AUSSCHANK / BAR ***&#10;</text>\n`;
    xml += `      <text font="font_a" em="false" width="1" height="1">&#10;</text>\n`;

    xml += `      <text align="center"/>\n`;
    xml += `      <text width="3" height="3" em="true">${escapeXml(orderNum)}&#10;</text>\n`;
    xml += `      <text width="1" height="1" em="false">&#10;</text>\n`;

    xml += `      <text align="left"/>\n`;
    xml += `      <text font="font_a">Zeit: ${escapeXml(timeStr)} | Kasse: ${escapeXml(order.stationName || 'Kasse 1')}&#10;</text>\n`;
    xml += `      <text font="font_a">${'='.repeat(width)}&#10;</text>\n`;

    for (const it of drinkItems) {
      xml += `      <text font="font_a" width="2" height="2" em="true">${it.qty}x ${escapeXml(it.name)}&#10;</text>\n`;
      xml += `      <text width="1" height="1" em="false">&#10;</text>\n`;
    }

    xml += `      <text font="font_a">${'='.repeat(width)}&#10;</text>\n`;
    xml += `      <feed line="3"/>\n`;
    xml += `      <cut type="feed"/>\n`;

    return xml;
  }

  // 4. Z-BERICHT XML-KORPUS
  function buildZReportInnerXml(report) {
    const width = 42;
    const dateStr = new Date(report.timestamp || Date.now()).toLocaleString('de-CH');
    let xml = '';

    xml += `      <text align="center" smooth="true"/>\n`;
    xml += `      <text font="font_a" em="true" width="1" height="2">SPORTSCHÜTZEN MUHEN&#10;</text>\n`;
    xml += `      <text font="font_a" em="true">*** Z-KASSENABSCHLUSS ***&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">${escapeXml(report.eventTitle || 'Festwirtschaft')}&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Beleg-Nr: ${escapeXml(report.reportNumber || 'Z-01')}&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Datum: ${escapeXml(dateStr)}&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Bediener: ${escapeXml(report.cashierName || 'Kasse')}&#10;&#10;</text>\n`;

    xml += `      <text align="left"/>\n`;
    xml += `      <text font="font_a" em="true">--- UMSATZ-ÜBERSICHT ---&#10;</text>\n`;
    xml += `      <text font="font_a">${escapeXml(padLine('Anzahl Bons:', String(report.orderCount || 0), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${escapeXml(padLine('Umsatz BAR:', formatCHF(report.totalCash), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${escapeXml(padLine('Umsatz TWINT:', formatCHF(report.totalTwint), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${'-'.repeat(width)}&#10;</text>\n`;
    xml += `      <text font="font_a" em="true">${escapeXml(padLine('TOTAL UMSATZ:', formatCHF(report.totalTurnover), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${'='.repeat(width)}&#10;&#10;</text>\n`;

    xml += `      <text font="font_a" em="true">--- KASSENSTURZ (SOLL / IST) ---&#10;</text>\n`;
    xml += `      <text font="font_a">${escapeXml(padLine('Wechselgeld Anfang:', formatCHF(report.openingCash), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${escapeXml(padLine('+ Bar-Umsatz:', '+' + formatCHF(report.totalCash), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${escapeXml(padLine('− Barauslagen:', '−' + formatCHF(report.totalExpenses), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${'-'.repeat(width)}&#10;</text>\n`;
    xml += `      <text font="font_a" em="true">${escapeXml(padLine('SOLL-Kassenstand:', formatCHF(report.expectedCash), width))}&#10;</text>\n`;
    xml += `      <text font="font_a" em="true">${escapeXml(padLine('IST-Gezählt:', formatCHF(report.actualCash), width))}&#10;</text>\n`;
    const diffSign = (report.difference || 0) > 0 ? '+' : '';
    xml += `      <text font="font_a" em="true">${escapeXml(padLine('DIFFERENZ:', diffSign + formatCHF(report.difference), width))}&#10;</text>\n`;
    xml += `      <text font="font_a">${'='.repeat(width)}&#10;&#10;</text>\n`;

    if (report.totalDepotIn || report.totalDepotOut) {
      xml += `      <text font="font_a" em="true">--- DEPOT-ABRECHNUNG ---&#10;</text>\n`;
      xml += `      <text font="font_a">${escapeXml(padLine('Depot eingenommen (+):', formatCHF(report.totalDepotIn), width))}&#10;</text>\n`;
      xml += `      <text font="font_a">${escapeXml(padLine('Depot retourniert (−):', formatCHF(report.totalDepotOut), width))}&#10;</text>\n`;
      xml += `      <text font="font_a">${'-'.repeat(width)}&#10;</text>\n`;
      xml += `      <text font="font_a" em="true">${escapeXml(padLine('Netto Depot-Saldo:', formatCHF((report.totalDepotIn || 0) - (report.totalDepotOut || 0)), width))}&#10;</text>\n`;
      xml += `      <text font="font_a">${'='.repeat(width)}&#10;&#10;</text>\n`;
    }

    xml += `      <text align="center"/>\n`;
    xml += `      <text font="font_a" em="false">Abrechnung abgeschlossen&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Sportschützen Muhen&#10;</text>\n`;
    xml += `      <feed line="4"/>\n`;
    xml += `      <cut type="feed"/>\n`;

    return xml;
  }

  // KOMBINIERTES XML FÜR EPSON TM PRINT ASSISTANT (Gast + Küche in einem Rutsch)
  function buildCombinedOrderXml(order, settings = {}) {
    const printGuest = settings.printGuestReceipt !== false;
    const printKitchen = settings.printKitchenReceipt !== false;
    const printDrinks = settings.printDrinksReceipt === true;

    let body = '';
    if (printGuest) {
      body += buildGuestReceiptInnerXml(order, settings) + '\n';
    }
    if (printKitchen) {
      const k = buildKitchenReceiptInnerXml(order, settings);
      if (k) body += k + '\n';
    }
    if (printDrinks) {
      const d = buildDrinksReceiptInnerXml(order, settings);
      if (d) body += d + '\n';
    }

    if (!body.trim()) return null;
    return wrapEposXml(body);
  }

  // XML BUILDER MIT WURZELELEMENT (FÜR EXTERNE APIS)
  function buildGuestReceiptXml(order, config = {}) {
    return wrapEposXml(buildGuestReceiptInnerXml(order, config));
  }

  function buildKitchenReceiptXml(order, config = {}) {
    const inner = buildKitchenReceiptInnerXml(order, config);
    return inner ? wrapEposXml(inner) : null;
  }

  function buildDrinksReceiptXml(order, config = {}) {
    const inner = buildDrinksReceiptInnerXml(order, config);
    return inner ? wrapEposXml(inner) : null;
  }

  function buildZReportXml(report) {
    return wrapEposXml(buildZReportInnerXml(report));
  }

  function buildTestReceiptXml(type = 'guest') {
    const mockOrder = {
      orderNumber: 'TEST-01',
      displayOrderNumber: '#TEST',
      timestamp: new Date().toISOString(),
      cashierName: 'Testbediener',
      stationName: 'Kasse 1',
      items: [
        { qty: 2, name: 'Bratwurst mit Brot', price: 7.50, categoryId: 'cat_grill' },
        { qty: 1, name: 'Portion Pommes', price: 5.50, categoryId: 'cat_grill' },
        { qty: 2, name: 'Bier Offenausschank 0.5l', price: 5.50, categoryId: 'cat_bier_wein' }
      ],
      totalAmount: 31.00,
      paymentMethod: 'bar',
      cashReceived: 50.00,
      changeGiven: 19.00
    };

    if (type === 'kitchen') {
      const inner = buildKitchenReceiptInnerXml(mockOrder, {});
      return inner ? wrapEposXml(inner) : wrapEposXml('');
    }
    return wrapEposXml(buildGuestReceiptInnerXml(mockOrder, { openDrawer: false }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TREIBER: DIREKTER EPOS-PRINT (100% autark / ohne Supabase / rein Browser)
  // ───────────────────────────────────────────────────────────────────────────
  function sendDirectToEpson(printerIp, soapXml, timeoutMs = 6000, useSsl = false) {
    if (!printerIp || !printerIp.trim()) {
      throw new Error('Keine Drucker-IP angegeben. Bitte im Menü eintragen.');
    }
    const cleanIp = printerIp.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const protocol = useSsl ? 'https:' : (window.location.protocol === 'https:' ? 'https:' : 'http:');
    const port = useSsl ? 443 : 80;
    const url = `${protocol}//${cleanIp}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=${timeoutMs}`;

    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.timeout = timeoutMs;
        xhr.setRequestHeader('Content-Type', 'text/xml; charset=utf-8');
        xhr.setRequestHeader('SOAPAction', '""');

        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            const respText = xhr.responseText || '';
            if (respText.includes('success="false"')) {
              reject(new Error('Drucker meldet Fehler: ' + respText));
            } else {
              resolve({ success: true, message: `Druckauftrag direkt an ${cleanIp} übermittelt.` });
            }
          } else {
            reject(new Error(`Drucker meldet HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = function () {
          const isHttpsPage = window.location.protocol === 'https:';
          if (isHttpsPage && !useSsl) {
            reject(new Error(`Mixed-Content blockiert: Kasse läuft auf HTTPS, Drucker auf HTTP. Starte Kasse über HTTP oder aktiviere SSL auf dem Drucker.`));
          } else {
            reject(new Error(`Verbindung zu Drucker ${cleanIp} fehlgeschlagen. Prüfe IP-Adresse, WLAN und ob ePOS-Print aktiviert ist.`));
          }
        };

        xhr.ontimeout = function () {
          reject(new Error(`Timeout (${timeoutMs / 1000}s) beim Verbinden mit Drucker ${cleanIp}`));
        };

        xhr.send(soapXml);
      } catch (xhrErr) {
        reject(new Error(`Drucker ${cleanIp} nicht erreichbar: ${xhrErr.message || xhrErr}`));
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TREIBER 3: LAN-PRINT-GATEWAY (Supabase Edge Function / Port 9100 ESC/POS)
  // ───────────────────────────────────────────────────────────────────────────
  async function sendPrintRequest(payload, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(SUPABASE_PRINT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);

      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      return result;
    } catch (err) {
      clearTimeout(timer);
      console.warn('[EposPrint] Fehler beim Senden an Print-Gateway:', err);
      throw err;
    }
  }

  // Abwärtskompatible Hilfsfunktion
  async function sendToEpson(printerIp, payload, timeoutMs = 6000) {
    if (!printerIp || !printerIp.trim()) {
      throw new Error('Keine Drucker-IP angegeben. Bitte im Menü eintragen.');
    }
    const cleanIp = printerIp.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return await sendPrintRequest({
      type: 'test_guest',
      printerIp: cleanIp
    }, timeoutMs);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // HAUPTFUNKTION: BESTELLUNG DRUCKEN (MULTI-BON)
  // ───────────────────────────────────────────────────────────────────────────
  async function printOrder(order, settings = {}) {
    const driver = settings.printDriver || 'gateway';
    const printerIp = settings.printerIp || '192.168.68.200';
    const useSsl = !!settings.useSsl;

    // 1. Modus: Direkter ePOS-Druck (100% autark / ohne Supabase / rein Browser)
    if (driver === 'epos_direct') {
      if (!printerIp) {
        console.warn('[EposPrint] Keine Drucker-IP konfiguriert.');
        return { success: false, reason: 'NO_IP' };
      }

      const printGuest = settings.printGuestReceipt !== false;
      const printKitchen = settings.printKitchenReceipt !== false;
      const printDrinks = settings.printDrinksReceipt === true;

      let printedCount = 0;
      const errors = [];

      if (printGuest) {
        try {
          const innerXml = buildGuestReceiptInnerXml(order, settings);
          const soapXml = wrapSoapEnvelope(innerXml);
          await sendDirectToEpson(printerIp, soapXml, 6000, useSsl);
          printedCount++;
        } catch (e) {
          errors.push('Gastbeleg: ' + e.message);
        }
      }

      if (printKitchen) {
        const innerXml = buildKitchenReceiptInnerXml(order, settings);
        if (innerXml) {
          await new Promise(r => setTimeout(r, 250));
          try {
            const soapXml = wrapSoapEnvelope(innerXml);
            await sendDirectToEpson(printerIp, soapXml, 6000, useSsl);
            printedCount++;
          } catch (e) {
            errors.push('Küchenbon: ' + e.message);
          }
        }
      }

      if (printDrinks) {
        const innerXml = buildDrinksReceiptInnerXml(order, settings);
        if (innerXml) {
          await new Promise(r => setTimeout(r, 250));
          try {
            const soapXml = wrapSoapEnvelope(innerXml);
            await sendDirectToEpson(printerIp, soapXml, 6000, useSsl);
            printedCount++;
          } catch (e) {
            errors.push('Getränkebon: ' + e.message);
          }
        }
      }

      if (errors.length > 0 && printedCount === 0) {
        throw new Error(errors.join(' | '));
      }

      return {
        success: printedCount > 0,
        printedCount,
        errors
      };
    }

    // 3. Modus: LAN-Gateway (CT 117 / Supabase Edge Function)
    if (!printerIp) {
      console.warn('[EposPrint] Keine Drucker-IP konfiguriert.');
      return { success: false, reason: 'NO_IP' };
    }

    const printGuest = settings.printGuestReceipt !== false;
    const printKitchen = settings.printKitchenReceipt !== false;
    const printDrinks = settings.printDrinksReceipt === true;

    let printedCount = 0;
    const errors = [];

    if (printGuest) {
      try {
        await sendPrintRequest({
          type: 'guest_order',
          printerIp,
          order,
          options: { openDrawer: settings.openDrawer }
        });
        printedCount++;
      } catch (e) {
        errors.push('Gastbeleg: ' + e.message);
      }
    }

    if (printKitchen) {
      try {
        const res = await sendPrintRequest({
          type: 'kitchen_order',
          printerIp,
          order
        });
        if (!res.skipped) printedCount++;
      } catch (e) {
        errors.push('Küchenbon: ' + e.message);
      }
    }

    if (printDrinks) {
      try {
        const res = await sendPrintRequest({
          type: 'drinks_order',
          printerIp,
          order
        });
        if (!res.skipped) printedCount++;
      } catch (e) {
        errors.push('Getränkebon: ' + e.message);
      }
    }

    return {
      success: printedCount > 0,
      printedCount,
      errors
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Z-BERICHT DRUCKEN
  // ───────────────────────────────────────────────────────────────────────────
  async function printZReport(report, printerIp, driver = 'gateway', options = {}) {
    if (driver === 'epos_direct') {
      const inner = buildZReportInnerXml(report);
      const soapXml = wrapSoapEnvelope(inner);
      return await sendDirectToEpson(printerIp || '192.168.68.200', soapXml, 6000, !!options.useSsl);
    }
    return await sendPrintRequest({
      type: 'z_report',
      printerIp: printerIp || '192.168.68.200',
      report
    }, 6000);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TESTDRUCK
  // ───────────────────────────────────────────────────────────────────────────
  async function testPrint(printerIp, type = 'guest', driver = 'gateway', options = {}) {
    if (driver === 'epos_direct') {
      const mockOrder = {
        orderNumber: 'TEST-01',
        displayOrderNumber: '#TEST',
        timestamp: new Date().toISOString(),
        cashierName: 'Testbediener',
        stationName: 'Kasse 1',
        items: [
          { qty: 2, name: 'Bratwurst mit Brot', price: 7.50, categoryId: 'cat_grill' },
          { qty: 1, name: 'Portion Pommes', price: 5.50, categoryId: 'cat_grill' },
          { qty: 2, name: 'Bier Offenausschank 0.5l', price: 5.50, categoryId: 'cat_bier_wein' }
        ],
        totalAmount: 31.00,
        paymentMethod: 'bar',
        cashReceived: 50.00,
        changeGiven: 19.00
      };
      let inner;
      if (type === 'kitchen') {
        inner = buildKitchenReceiptInnerXml(mockOrder, {});
      } else {
        inner = buildGuestReceiptInnerXml(mockOrder, { openDrawer: false });
      }
      const soapXml = wrapSoapEnvelope(inner || '');
      return await sendDirectToEpson(printerIp || '192.168.68.200', soapXml, 5000, !!options.useSsl);
    }
    return await sendPrintRequest({
      type: type === 'kitchen' ? 'test_kitchen' : 'test_guest',
      printerIp: printerIp || '192.168.68.200'
    }, 5000);
  }

  return {
    buildGuestReceiptXml,
    buildKitchenReceiptXml,
    buildDrinksReceiptXml,
    buildZReportXml,
    buildTestReceiptXml,
    buildCombinedOrderXml,
    sendPrintRequest,
    sendToEpson,
    printOrder,
    printZReport,
    testPrint
  };
})();
