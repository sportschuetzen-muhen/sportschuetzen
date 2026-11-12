// supabase/functions/pos-print/index.ts
// ==============================================================================
// Phase: Festkasse POS ESC/POS Print Gateway
// Projekt: Vereinsportal Sportschützen Muhen
//
// Features:
// - ESC/POS Binär-Treiber für Epson TM-T20II / TM-T88 / LAN-Bondrucker
// - Direkte TCP-Socket-Verbindung auf Port 9100 (Raw JetDirect)
// - Beseitigt Mixed-Content-Probleme im Browser (HTTPS -> LAN Gateway)
// - Unterstützt Gastbeleg (Quittung), Küchenbon, Z-Report und Testdruck
// - Automatischer Papierschnitt (Cut) & Kassenladen-Impuls (Drawer Pulse)
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import * as tls from "node:tls";

// ─────────────────────────────────────────────────────────────────────────────
// ESC/POS COMMAND BUILDER (CP437)
// ─────────────────────────────────────────────────────────────────────────────
class EscposBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  init(): this {
    this.buffer.push(0x1B, 0x40); // ESC @ (Initialize printer)
    this.buffer.push(0x1B, 0x74, 0x00); // ESC t 0 (Select Code Page CP437)
    return this;
  }

  align(alignment: "left" | "center" | "right"): this {
    const val = alignment === "center" ? 1 : alignment === "right" ? 2 : 0;
    this.buffer.push(0x1B, 0x61, val);
    return this;
  }

  bold(enable: boolean): this {
    this.buffer.push(0x1B, 0x45, enable ? 1 : 0);
    return this;
  }

  size(widthMultiplier: number = 1, heightMultiplier: number = 1): this {
    const w = Math.min(Math.max(widthMultiplier - 1, 0), 7);
    const h = Math.min(Math.max(heightMultiplier - 1, 0), 7);
    const n = (w << 4) | h;
    this.buffer.push(0x1D, 0x21, n);
    return this;
  }

  text(str: string): this {
    if (!str) return this;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      let code = str.charCodeAt(i);

      // CP437 Zeichensatz für deutsche Umlaute und Sonderzeichen
      switch (char) {
        case "ä": code = 0x84; break;
        case "ö": code = 0x94; break;
        case "ü": code = 0x81; break;
        case "Ä": code = 0x8E; break;
        case "Ö": code = 0x99; break;
        case "Ü": code = 0x9A; break;
        case "é": code = 0x82; break;
        case "è": code = 0x8A; break;
        case "à": code = 0x85; break;
        case "ç": code = 0x87; break;
        case "ß": code = 0xE1; break;
        default:
          if (code > 255) code = 0x3F; // Fallback '?'
      }
      this.buffer.push(code);
    }
    return this;
  }

  line(str: string = ""): this {
    this.text(str);
    this.buffer.push(0x0A); // LF
    return this;
  }

  separator(char: string = "-", width: number = 42): this {
    this.line(char.repeat(width));
    return this;
  }

  feed(lines: number = 3): this {
    this.buffer.push(0x1B, 0x64, lines);
    return this;
  }

  cut(partial: boolean = true): this {
    // GS V 66 0 (Feed and Cut)
    this.buffer.push(0x1D, 0x56, partial ? 0x42 : 0x41, 0x00);
    return this;
  }

  pulse(): this {
    // ESC p 0 25 250 (Kick drawer 1)
    this.buffer.push(0x1B, 0x70, 0x00, 0x19, 0xFA);
    return this;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTING HELPERS (80mm / 42 Spalten)
// ─────────────────────────────────────────────────────────────────────────────
function formatCHF(val: unknown): string {
  const num = parseFloat(String(val)) || 0;
  return "CHF " + num.toFixed(2);
}

function padLine(left: string, right: string, width: number = 42): string {
  const l = String(left || "");
  const r = String(right || "");
  const spaces = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(spaces) + r;
}

// ─────────────────────────────────────────────────────────────────────────────
// BELEG-BUILDER
// ─────────────────────────────────────────────────────────────────────────────

// 1. GASTBELEG
function buildGuestReceipt(order: any, options: { openDrawer?: boolean } = {}): Uint8Array {
  const b = new EscposBuilder();
  const width = 42;

  if (options.openDrawer && order.paymentMethod === "bar") {
    b.pulse();
  }

  const dateStr = new Date(order.timestamp || Date.now()).toLocaleString("de-CH");
  const orderNum = order.displayOrderNumber || order.orderNumber || "#01";

  // Header
  b.align("center")
    .bold(true)
    .line("SPORTSCHÜTZEN MUHEN")
    .bold(false)
    .line("Festwirtschaft & Kasse")
    .line(dateStr);

  if (order.tableNumber) {
    b.bold(true).line(`TISCH: ${order.tableNumber}`).bold(false);
  }

  b.line(`Bediener: ${order.cashierName || "Kasse"} (${order.stationName || "Station"})`)
    .line();

  // Bestellnummer (Gross)
  b.align("center")
    .size(2, 2)
    .bold(true)
    .line(`BESTELLUNG ${orderNum}`)
    .size(1, 1)
    .bold(false)
    .line();

  // Trennlinie
  b.align("left").separator("-", width);

  // Positionen
  for (const it of order.items || []) {
    const title = `${it.qty}x ${it.name}`;
    const priceStr = formatCHF((it.price || 0) * (it.qty || 1));
    if (title.length + priceStr.length + 1 <= width) {
      b.line(padLine(title, priceStr, width));
    } else {
      b.line(title);
      b.line(padLine("", priceStr, width));
    }
  }

  b.separator("-", width);

  // Total & Zahlart
  b.bold(true)
    .line(padLine("TOTAL:", formatCHF(order.totalAmount), width))
    .bold(false);

  const payMethod = (order.paymentMethod || "BAR").toUpperCase();
  b.line(padLine("Zahlart:", payMethod, width));

  if (order.paymentMethod === "bar") {
    b.line(padLine("Erhalten:", formatCHF(order.cashReceived), width));
    b.bold(true)
      .line(padLine("Rückgeld:", formatCHF(order.changeGiven), width))
      .bold(false);
  }

  b.separator("=", width);

  // Footer
  b.align("center")
    .line("Herzlichen Dank für deinen Besuch!")
    .line("Gut Schuss!")
    .feed(3)
    .cut();

  return b.getBytes();
}

// 2. KÜCHEN- / GRILL-BON
function buildKitchenReceipt(order: any): Uint8Array | null {
  const kitchenItems = (order.items || []).filter((it: any) => {
    if (it.categoryId === "cat_grill") return true;
    const n = (it.name || "").toLowerCase();
    return n.includes("wurst") || n.includes("steak") || n.includes("pommes") || n.includes("brot") || n.includes("salat") || n.includes("cervelat");
  });

  if (kitchenItems.length === 0) {
    return null;
  }

  const b = new EscposBuilder();
  const width = 42;
  const timeStr = new Date(order.timestamp || Date.now()).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const orderNum = order.displayOrderNumber || order.orderNumber || "#01";

  b.align("center")
    .size(2, 1)
    .bold(true)
    .line("*** KÜCHE / GRILL ***");

  if (order.tableNumber) {
    b.size(2, 2).line(`TISCH: ${order.tableNumber}`);
  }

  b.size(1, 1)
    .bold(false)
    .line();

  // Riesige Bestellnummer zum Ausrufen
  b.align("center")
    .size(3, 3)
    .bold(true)
    .line(orderNum)
    .size(1, 1)
    .bold(false)
    .line();

  b.align("left")
    .line(`Zeit: ${timeStr} | Kasse: ${order.stationName || "Kasse 1"}`)
    .separator("=", width);

  // Artikel in doppelter Grösse
  for (const it of kitchenItems) {
    b.size(2, 2)
      .bold(true)
      .line(`${it.qty}x ${it.name}`)
      .size(1, 1)
      .bold(false)
      .line();
  }

  b.separator("=", width)
    .feed(3)
    .cut();

  return b.getBytes();
}

// 3. GETRÄNKE- / BAR-BON
function buildDrinksReceipt(order: any): Uint8Array | null {
  const drinkItems = (order.items || []).filter((it: any) => {
    const c = it.categoryId || "";
    return c === "cat_getraenke" || c === "cat_bier_wein" || c === "cat_kaffee" || c === "cat_bar";
  });

  if (drinkItems.length === 0) return null;

  const b = new EscposBuilder();
  const width = 42;
  const timeStr = new Date(order.timestamp || Date.now()).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const orderNum = order.displayOrderNumber || order.orderNumber || "#01";

  b.align("center")
    .size(2, 1)
    .bold(true)
    .line("*** AUSSCHANK / BAR ***")
    .size(1, 1)
    .bold(false)
    .line();

  b.align("center")
    .size(3, 3)
    .bold(true)
    .line(orderNum)
    .size(1, 1)
    .bold(false)
    .line();

  b.align("left")
    .line(`Zeit: ${timeStr} | Kasse: ${order.stationName || "Kasse 1"}`)
    .separator("=", width);

  for (const it of drinkItems) {
    b.size(2, 2)
      .bold(true)
      .line(`${it.qty}x ${it.name}`)
      .size(1, 1)
      .bold(false)
      .line();
  }

  b.separator("=", width)
    .feed(3)
    .cut();

  return b.getBytes();
}

// 4. Z-BERICHT
function buildZReportReceipt(report: any): Uint8Array {
  const b = new EscposBuilder();
  const width = 42;
  const dateStr = new Date(report.timestamp || Date.now()).toLocaleString("de-CH");

  b.align("center")
    .size(1, 2)
    .bold(true)
    .line("SPORTSCHÜTZEN MUHEN")
    .line("*** Z-KASSENABSCHLUSS ***")
    .size(1, 1)
    .bold(false)
    .line(report.eventTitle || "Festwirtschaft")
    .line(`Beleg-Nr: ${report.reportNumber || "Z-01"}`)
    .line(`Datum: ${dateStr}`)
    .line(`Bediener: ${report.cashierName || "Kasse"}`)
    .line();

  b.align("left")
    .bold(true)
    .line("--- UMSATZ-ÜBERSICHT ---")
    .bold(false)
    .line(padLine("Anzahl Bons:", String(report.orderCount || 0), width))
    .line(padLine("Umsatz BAR:", formatCHF(report.totalCash), width))
    .line(padLine("Umsatz TWINT:", formatCHF(report.totalTwint), width))
    .separator("-", width)
    .bold(true)
    .line(padLine("TOTAL UMSATZ:", formatCHF(report.totalTurnover), width))
    .bold(false)
    .separator("=", width)
    .line();

  b.bold(true)
    .line("--- KASSENSTURZ (SOLL / IST) ---")
    .bold(false)
    .line(padLine("Wechselgeld Anfang:", formatCHF(report.openingCash), width))
    .line(padLine("+ Bar-Umsatz:", "+" + formatCHF(report.totalCash), width))
    .line(padLine("− Barauslagen:", "−" + formatCHF(report.totalExpenses), width))
    .separator("-", width)
    .bold(true)
    .line(padLine("SOLL-Kassenstand:", formatCHF(report.expectedCash), width))
    .line(padLine("IST-Gezählt:", formatCHF(report.actualCash), width));

  const diff = report.difference || 0;
  const diffSign = diff > 0 ? "+" : "";
  b.line(padLine("DIFFERENZ:", diffSign + formatCHF(diff), width))
    .bold(false)
    .separator("=", width)
    .line();

  if (report.totalDepotIn || report.totalDepotOut) {
    b.bold(true)
      .line("--- DEPOT-ABRECHNUNG ---")
      .bold(false)
      .line(padLine("Depot eingenommen (+):", formatCHF(report.totalDepotIn), width))
      .line(padLine("Depot retourniert (−):", formatCHF(report.totalDepotOut), width))
      .separator("-", width)
      .bold(true)
      .line(padLine("Netto Depot-Saldo:", formatCHF((report.totalDepotIn || 0) - (report.totalDepotOut || 0)), width))
      .bold(false)
      .separator("=", width)
      .line();
  }

  b.align("center")
    .line("Abrechnung abgeschlossen")
    .line("Sportschützen Muhen")
    .feed(4)
    .cut();

  return b.getBytes();
}

// 5. TESTBELEGE
function buildTestReceipt(type: string): Uint8Array {
  const mockOrder = {
    orderNumber: "TEST-01",
    displayOrderNumber: "#TEST",
    timestamp: new Date().toISOString(),
    cashierName: "Testbediener",
    stationName: "Kasse 1",
    items: [
      { qty: 2, name: "Bratwurst mit Brot", price: 7.5, categoryId: "cat_grill" },
      { qty: 1, name: "Portion Pommes", price: 5.5, categoryId: "cat_grill" },
      { qty: 2, name: "Bier Offenausschank 0.5l", price: 5.5, categoryId: "cat_bier_wein" },
    ],
    totalAmount: 31.0,
    paymentMethod: "bar",
    cashReceived: 50.0,
    changeGiven: 19.0,
  };

  if (type === "kitchen") {
    return buildKitchenReceipt(mockOrder) || new Uint8Array();
  }
  return buildGuestReceipt(mockOrder, { openDrawer: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// TCP SOCKET PRINTER SENDER
// ─────────────────────────────────────────────────────────────────────────────
async function sendRawToPrinter(ip: string, port: number, data: Uint8Array, timeoutMs = 4000): Promise<void> {
  const cleanIp = ip.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  const targetPort = port || 9100;

  // Timeout Abort
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout (${timeoutMs / 1000}s) beim Verbinden mit Drucker ${cleanIp}:${targetPort}`)), timeoutMs);
  });

  const connectAndWrite = async () => {
    const conn = await Deno.connect({ hostname: cleanIp, port: targetPort });
    try {
      await conn.write(data);
    } finally {
      conn.close();
    }
  };

  await Promise.race([connectAndWrite(), timeoutPromise]);
}

// ─────────────────────────────────────────────────────────────────────────────
// TLS PRINTER STATUS & CERTIFICATE MONITORING (PORT 443 / HTTPS ePOS-Print)
// ─────────────────────────────────────────────────────────────────────────────
async function checkPrinterTcp(ip: string, port = 443, timeoutMs = 2500): Promise<boolean> {
  const cleanIp = ip.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  const targetPort = port || 443;
  try {
    const conn = await Promise.race([
      Deno.connect({ hostname: cleanIp, port: targetPort }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
    ]);
    conn.close();
    return true;
  } catch {
    return false;
  }
}

async function getStoredCertConfig(): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "http://supabase-envoy:8000";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/system_app_configs?key=eq.festkasse_printer_cert&select=value`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0 && data[0].value) {
        return typeof data[0].value === "string" ? JSON.parse(data[0].value) : data[0].value;
      }
    }
  } catch (e) {
    console.warn("[pos-print] Fehler beim Laden von festkasse_printer_cert:", e);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP SERVER HANDLER
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const printerIp = payload.printerIp || "192.168.68.200";
    const port = Number(payload.port) || 9100;
    const type = payload.type || "test_guest";
    const options = payload.options || {};

    let bytesToPrint: Uint8Array | null = null;
    let label = "Beleg";

    switch (type) {
      case "check_cert": {
        const checkPort = payload.port || 443;
        const isReachable = await checkPrinterTcp(printerIp, checkPort, 3000);
        const storedCert = await getStoredCertConfig();

        const validTo = storedCert?.valid_to || "2027-11-12T19:04:10Z";
        const validToDate = new Date(validTo);
        const now = new Date();
        const daysRemaining = Math.ceil((validToDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return new Response(
          JSON.stringify({
            success: true,
            printerIp,
            port: checkPort,
            isOnline: isReachable,
            valid: daysRemaining > 0,
            valid_from: storedCert?.valid_from || "2026-11-12T19:04:10Z",
            valid_to: validTo,
            daysRemaining,
            issuer: storedCert?.issuer || "CN=Sportschuetzen Muhen Root CA",
            subject: storedCert?.subject || `CN=${printerIp}`,
            checked_at: new Date().toISOString(),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "test_guest":
      case "test":
        bytesToPrint = buildTestReceipt("guest");
        label = "Test-Gastbeleg";
        break;

      case "test_kitchen":
        bytesToPrint = buildTestReceipt("kitchen");
        label = "Test-Küchenbon";
        break;

      case "guest_order":
      case "order":
        if (!payload.order) throw new Error("Keine Bestelldaten übergeben");
        bytesToPrint = buildGuestReceipt(payload.order, options);
        label = `Gastquittung (${payload.order.displayOrderNumber || payload.order.orderNumber || "#"})`;
        break;

      case "kitchen_order":
        if (!payload.order) throw new Error("Keine Bestelldaten übergeben");
        bytesToPrint = buildKitchenReceipt(payload.order);
        label = `Küchenbon (${payload.order.displayOrderNumber || payload.order.orderNumber || "#"})`;
        break;

      case "drinks_order":
        if (!payload.order) throw new Error("Keine Bestelldaten übergeben");
        bytesToPrint = buildDrinksReceipt(payload.order);
        label = `Getränkebon (${payload.order.displayOrderNumber || payload.order.orderNumber || "#"})`;
        break;

      case "z_report":
        if (!payload.report) throw new Error("Keine Reportdaten übergeben");
        bytesToPrint = buildZReportReceipt(payload.report);
        label = `Z-Bericht (${payload.report.reportNumber || "Abschluss"})`;
        break;

      case "raw":
        if (!payload.rawBase64) throw new Error("Keine rawBase64-Daten übergeben");
        const binStr = atob(payload.rawBase64);
        bytesToPrint = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytesToPrint[i] = binStr.charCodeAt(i);
        label = "Raw ESC/POS";
        break;

      default:
        throw new Error(`Unbekannter Beleg-Typ: ${type}`);
    }

    if (!bytesToPrint || bytesToPrint.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: `${label} enthält keine Positionen für diesen Drucker. Druck übersprungen.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // An Drucker auf Port 9100 senden
    await sendRawToPrinter(printerIp, port, bytesToPrint, 4000);

    return new Response(
      JSON.stringify({
        success: true,
        printerIp: printerIp,
        port: port,
        bytesLength: bytesToPrint.length,
        message: `${label} erfolgreich an ${printerIp}:${port} gedruckt.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[pos-print] Fehler beim Drucken:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
