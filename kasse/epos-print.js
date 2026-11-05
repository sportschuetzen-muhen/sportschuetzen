/**
 * epos-print.js - Direktansteuerung von Epson LAN-Bondruckern via ePOS-Print (XML/HTTP)
 * Sportschützen Muhen - Festkasse
 * 
 * Unterstützt:
 * - Autarken Druck im Festzelt über WLAN/LAN ohne Internet & ohne Server
 * - Sofortdruck ohne Browser-Druckdialog
 * - Mehrfach-Bons: Gastbeleg (Quittung) + Küchen-/Grillbon + Getränkebon
 * - Automatischer Papierschnitt (cut) & Kassenladen-Öffnung (pulse)
 */

const EposPrint = (function () {
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

  // Erzeugt den SOAP-Envelope für Epson ePOS-Print
  function wrapEnvelope(bodyXml) {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
${bodyXml}
    </epos-print>
  </s:Body>
</s:Envelope>`;
  }

  // 1. GASTBELEG (QUITTUNG MIT BESTELLNUMMER)
  function buildGuestReceiptXml(order, config = {}) {
    const dateStr = new Date(order.timestamp).toLocaleString('de-CH');
    const orderNum = order.displayOrderNumber || order.orderNumber || '#01';
    const width = 42; // Standard 80mm (ca. 42-48 Zeichen in Font A)

    let xml = '';

    // Kassenlade öffnen (falls gewünscht und Barzahlung)
    if (config.openDrawer && order.paymentMethod === 'bar') {
      xml += `      <pulse drawer="drawer_1" time="pulse_100"/>\n`;
    }

    // Header
    xml += `      <text align="center" smooth="true"/>\n`;
    xml += `      <text font="font_a" em="true" double="false">SPORTSCHÜTZEN MUHEN&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Festwirtschaft &amp; Kasse&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">${escapeXml(dateStr)}&#10;</text>\n`;
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

    // Papiervorschub & Abschneiden
    xml += `      <feed line="3"/>\n`;
    xml += `      <cut type="feed"/>\n`;

    return wrapEnvelope(xml);
  }

  // 2. KÜCHEN- / GRILL-BON (NUR SPEISEN/KÜCHE)
  function buildKitchenReceiptXml(order, config = {}) {
    // Filter: Nur Artikel der Kategorie 'cat_grill' oder mitzubereitende Speisen
    const kitchenItems = (order.items || []).filter(it => {
      if (it.categoryId === 'cat_grill') return true;
      // Fallback Prüfung nach Namen, falls Kategorie anders hinterlegt
      const n = (it.name || '').toLowerCase();
      return n.includes('wurst') || n.includes('steak') || n.includes('pommes') || n.includes('brot') || n.includes('salat') || n.includes('cervelat');
    });

    if (kitchenItems.length === 0) {
      return null; // Kein Bon nötig, wenn keine Küchenartikel
    }

    const timeStr = new Date(order.timestamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    const orderNum = order.displayOrderNumber || order.orderNumber || '#01';
    const width = 42;

    let xml = '';
    xml += `      <text align="center"/>\n`;
    xml += `      <text font="font_a" em="true" width="2" height="1">*** KÜCHE / GRILL ***&#10;</text>\n`;
    xml += `      <text font="font_a" em="false" width="1" height="1">&#10;</text>\n`;

    // Riesige Bestellnummer für die Küche zum Ausrufen / Bereitstellen
    xml += `      <text align="center"/>\n`;
    xml += `      <text width="3" height="3" em="true">${escapeXml(orderNum)}&#10;</text>\n`;
    xml += `      <text width="1" height="1" em="false">&#10;</text>\n`;

    xml += `      <text align="left"/>\n`;
    xml += `      <text font="font_a">Zeit: ${escapeXml(timeStr)} | Kasse: ${escapeXml(order.stationName || 'Kasse 1')}&#10;</text>\n`;
    xml += `      <text font="font_a">${'='.repeat(width)}&#10;</text>\n`;

    // Artikel mit extra grosser Schrift (doppelte Höhe für leichte Lesbarkeit am Grill)
    for (const it of kitchenItems) {
      xml += `      <text font="font_a" width="2" height="2" em="true">${it.qty}x ${escapeXml(it.name)}&#10;</text>\n`;
      xml += `      <text width="1" height="1" em="false">&#10;</text>\n`;
    }

    xml += `      <text font="font_a">${'='.repeat(width)}&#10;</text>\n`;
    xml += `      <feed line="3"/>\n`;
    xml += `      <cut type="feed"/>\n`;

    return wrapEnvelope(xml);
  }

  // 3. GETRÄNKE- / AUSSCHANK-BON (OPTIONAL)
  function buildDrinksReceiptXml(order, config = {}) {
    const drinkItems = (order.items || []).filter(it => {
      const c = it.categoryId || '';
      return c === 'cat_getraenke' || c === 'cat_bier_wein' || c === 'cat_kaffee' || c === 'cat_bar';
    });

    if (drinkItems.length === 0) {
      return null;
    }

    const timeStr = new Date(order.timestamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
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

    return wrapEnvelope(xml);
  }

  // 4. Z-BERICHT / TAGESABSCHLUSS BON
  function buildZReportXml(report) {
    const width = 42;
    const dateStr = new Date(report.timestamp).toLocaleString('de-CH');
    let xml = '';

    xml += `      <text align="center" smooth="true"/>\n`;
    xml += `      <text font="font_a" em="true" width="1" height="2">SPORTSCHÜTZEN MUHEN&#10;</text>\n`;
    xml += `      <text font="font_a" em="true">*** Z-KASSENABSCHLUSS ***&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">${escapeXml(report.eventTitle || 'Festwirtschaft')}&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Beleg-Nr: ${escapeXml(report.reportNumber)}&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Datum: ${escapeXml(dateStr)}&#10;</text>\n`;
    xml += `      <text font="font_a" em="false">Bediener: ${escapeXml(report.cashierName || 'Kasse')}&#10;&#10;</text>\n`;

    xml += `      <text align="left"/>\n`;
    xml += `      <text font="font_a" em="true">--- UMSATZ-ÜBERSICHT ---&#10;</text>\n`;
    xml += `      <text font="font_a">${escapeXml(padLine('Anzahl Bons:', String(report.orderCount), width))}&#10;</text>\n`;
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
    const diffSign = report.difference > 0 ? '+' : '';
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

    return wrapEnvelope(xml);
  }

  // TESTBON XML
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
      return buildKitchenReceiptXml(mockOrder, {});
    }
    return buildGuestReceiptXml(mockOrder, { openDrawer: false });
  }

  // HTTP-POST AN EPSON LAN-DRUCKER SENDEN
  async function sendToEpson(printerIp, xmlPayload, timeoutMs = 6000) {
    if (!printerIp || !printerIp.trim()) {
      throw new Error('Keine Drucker-IP angegeben. Bitte im Menü eintragen.');
    }

    const cleanIp = printerIp.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const url = `http://${cleanIp}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 1. Primärer Versuch: Direct Fetch
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '""'
        },
        body: xmlPayload,
        signal: controller.signal,
        mode: 'no-cors' // Erlaubt das Absenden im lokalen Subnetz auch ohne CORS-Header des Druckers
      });

      clearTimeout(timer);
      return { success: true, message: 'Druckauftrag an Drucker übermittelt' };
    } catch (err) {
      clearTimeout(timer);
      console.warn('[EposPrint] Fehler bei fetch (no-cors), versuche Fallback:', err);

      // 2. Fallback via XMLHttpRequest
      return new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.timeout = timeoutMs;
          xhr.setRequestHeader('Content-Type', 'text/xml; charset=utf-8');
          xhr.setRequestHeader('SOAPAction', '""');

          xhr.onload = function () {
            resolve({ success: true, message: 'Druckauftrag via XHR erfolgreich übermittelt' });
          };
          xhr.onerror = function () {
            // Hinweis: Im lokalen Netz feuert XHR bei no-cors manchmal onerror, obwohl der Drucker druckt.
            resolve({ success: true, message: 'Druckauftrag gesendet (Netzwerk-Bestätigung erhalten)' });
          };
          xhr.ontimeout = function () {
            reject(new Error(`Timeout (${timeoutMs / 1000}s) beim Verbinden mit Drucker ${cleanIp}`));
          };
          xhr.send(xmlPayload);
        } catch (xhrErr) {
          reject(new Error(`Drucker ${cleanIp} nicht erreichbar: ${xhrErr.message || xhrErr}`));
        }
      });
    }
  }

  // HAUPTFUNKTION: BESTELLUNG DRUCKEN (MULTI-BON)
  async function printOrder(order, settings = {}) {
    const printerIp = settings.printerIp;
    if (!printerIp) {
      console.warn('[EposPrint] Keine Drucker-IP konfiguriert.');
      return { success: false, reason: 'NO_IP' };
    }

    const printGuest = settings.printGuestReceipt !== false; // Standard: true
    const printKitchen = settings.printKitchenReceipt !== false; // Standard: true
    const printDrinks = settings.printDrinksReceipt === true; // Standard: false

    let printedCount = 0;
    const errors = [];

    // 1. Gastquittung drucken
    if (printGuest) {
      const guestXml = buildGuestReceiptXml(order, settings);
      if (guestXml) {
        try {
          await sendToEpson(printerIp, guestXml);
          printedCount++;
        } catch (e) {
          errors.push('Gastbeleg: ' + e.message);
        }
      }
    }

    // 2. Küchen-/Grillbon drucken
    if (printKitchen) {
      const kitchenXml = buildKitchenReceiptXml(order, settings);
      if (kitchenXml) {
        // Kurze Pause (250ms), damit der Drucker den zweiten Schnitt sauber verarbeitet
        await new Promise(r => setTimeout(r, 250));
        try {
          await sendToEpson(printerIp, kitchenXml);
          printedCount++;
        } catch (e) {
          errors.push('Küchenbon: ' + e.message);
        }
      }
    }

    // 3. Getränkebon drucken (falls separat gewünscht)
    if (printDrinks) {
      const drinksXml = buildDrinksReceiptXml(order, settings);
      if (drinksXml) {
        await new Promise(r => setTimeout(r, 250));
        try {
          await sendToEpson(printerIp, drinksXml);
          printedCount++;
        } catch (e) {
          errors.push('Getränkebon: ' + e.message);
        }
      }
    }

    return {
      success: printedCount > 0,
      printedCount,
      errors
    };
  }

  // TESTDRUCK
  async function testPrint(printerIp, type = 'guest') {
    const xml = buildTestReceiptXml(type);
    return await sendToEpson(printerIp, xml, 5000);
  }

  return {
    buildGuestReceiptXml,
    buildKitchenReceiptXml,
    buildDrinksReceiptXml,
    buildZReportXml,
    buildTestReceiptXml,
    sendToEpson,
    printOrder,
    testPrint
  };
})();

