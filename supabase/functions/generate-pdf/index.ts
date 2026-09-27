// supabase/functions/generate-pdf/index.ts
// ==============================================================================
// Phase 21: Zentrale Dokument- & PDF-Engine (Supabase Edge Function)
// Projekt: Vereinsportal Sportschützen Muhen
//
// Features:
// - Standardisierte Schweizer QR-Rechnung nach SIX-Spezifikation (SPC 0200 1)
// - Vektorbasierte PDF-Erstellung mittels pdf-lib (A4, DIN 5008 Fenster rechts)
// - Empfangsschein (Receipt, 62mm) & Zahlteil (Payment part, 148mm) mit Perforationslinie
// - Vektorbasiertes Schweizerkreuz (7x7mm) im QR-Code Zentrum (Fehlerkorrektur Level M)
// - Unterstützung für Rechnungen, Jahresbeiträge, Mietverträge und Quittungen
// - Direkter Upload in Supabase Storage (Bucket 'operatives-storage')
// - Automatische Verknüpfung in public.invoices & public.rental_bookings
// - Optionale Weiterleitung an Paperless-NGX REST-API (Langzeitarchiv)
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";
import { EMBEDDED_LOGO_BASE64 } from "./logo-base64.ts";

// Vereins-Standard-Konstanten
const CLUB_IBAN = "CH0680808003633131892";
const CLUB_IBAN_FORMATTED = "CH06 8080 8003 6331 3189 2";
const CLUB_NAME = "Sportschützen Muhen";
const CLUB_STREET = "Schiessanlage Hard";
const CLUB_ZIP = "5037";
const CLUB_CITY = "Muhen";
const CLUB_COUNTRY = "CH";
const CLUB_EMAIL = "sportschuetzen.muhen@gmail.com";
const CLUB_WEBSITE = "www.sportschuetzen-muhen.ch";

// mm zu PDF-Points (72 pt pro Inch = 72 / 25.4 pt/mm)
const MM = 72 / 25.4;

// Globaler In-Memory Cache für Logo-Bytes (Latenz- & Cold-Start-Optimierung)
let cachedLogoBytes: Uint8Array | null = null;

// Hilfsfunktion: Logo mit In-Memory Cache, Base64-Inlining und Storage-Fallback laden
async function getOrLoadLogoBytes(supabaseClient?: any): Promise<Uint8Array | null> {
  if (cachedLogoBytes) return cachedLogoBytes;

  // 1. Primär: Kompiliertes Base64-Logo nutzen (Cold-Start Latenz: 0 ms)
  if (EMBEDDED_LOGO_BASE64) {
    try {
      const binStr = atob(EMBEDDED_LOGO_BASE64);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      cachedLogoBytes = bytes;
      return cachedLogoBytes;
    } catch (err) {
      console.warn("⚠️ [PDF-Engine] Base64-Logo Decode Warnung:", err);
    }
  }

  // 2. Sekundär: Supabase Storage Bucket 'operatives-storage'
  if (supabaseClient) {
    try {
      const { data: logoBlob } = await supabaseClient.storage.from("operatives-storage").download("assets/logo.png");
      if (logoBlob) {
        cachedLogoBytes = new Uint8Array(await logoBlob.arrayBuffer());
        return cachedLogoBytes;
      }
    } catch (err) {
      console.warn("⚠️ [PDF-Engine] Storage Logo-Download Warnung:", err);
    }
  }

  return null;
}

// Zweistufiger Text-Sanitizer für sicheres WinAnsi-Encoding (StandardFonts.Helvetica)
// Stufe 1: Typografie & Sonderzeichen (Anführungszeichen, Gedankenstriche, Aufzählungspunkte, NBSP)
// Stufe 2: Europäische Umlaut-Garantie (ä, ö, ü, Ä, Ö, Ü, é, è, ê, à, â, ç) & WinAnsi-Crash-Schutz
function sanitizeWinAnsiText(str: string | null | undefined): string {
  if (!str) return "";
  let text = String(str).normalize("NFC");

  // Stufe 1: Typografische Zeichen & Whitespace
  text = text
    .replace(/[\u00AB\u00BB\u201C\u201D\u201E\u201F]/g, '"') // « » “ ” „
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")             // ‘ ’ ‚
    .replace(/[\u2013\u2014]/g, "-")                         // – —
    .replace(/\u2022/g, "-")                                 // •
    .replace(/\u2026/g, "...")                               // …
    .replace(/[\u00A0\u202F]/g, " ");                        // Non-breaking spaces

  // Stufe 2: WinAnsi-Bereich (0x00 - 0xFF) sicherstellen
  // Bekannte Sonderzeichen oberhalb von 255 sauber mappen
  const extendedMap: Record<string, string> = {
    'Š': 'S', 'š': 's', 'Ž': 'Z', 'ž': 'z', 'Œ': 'OE', 'œ': 'oe', 'Ÿ': 'Y',
    '€': 'CHF', '’': "'", '–': "-", '—': "-", '™': "TM", '•': "-"
  };

  return text.replace(/[^\x00-\xFF]/g, (char) => {
    return extendedMap[char] || "?";
  });
}

// Abwärtskompatibler Alias
function sanitizeText(str: string | null | undefined): string {
  return sanitizeWinAnsiText(str);
}

// Text-Wrapping für dynamische Beschreibungszeilen
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const clean = sanitizeText(text);
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [clean];
}

interface InvoicePosition {
  position_nr?: number;
  description: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
}

interface RecipientData {
  vorname?: string;
  nachname?: string;
  name?: string;
  firma?: string;
  abteilung?: string;
  anrede?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  email?: string;
  telefon?: string;
  typ?: string; // 'privat' | 'firma'
}

interface SenderData {
  vorname?: string;
  nachname?: string;
  funktion?: string;
  verein?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  email?: string;
  mobil?: string;
}

interface LayoutData {
  title?: string;
  intro?: string;
  outro?: string;
  notice?: string;
}

interface GeneratePdfPayload {
  action?: string; // 'generate-invoice' | 'generateInvoicePDF' | 'generate-contract' | 'generateRentalContractPDF' | 'generate-swiss-qr'
  invoiceId?: string;
  bookingId?: string;
  recipient?: RecipientData;
  sender?: SenderData;
  layout?: LayoutData;
  positions?: InvoicePosition[];
  totalAmount?: number | string;
  year?: number | string;
  type?: string;
  // Mietvertrags-Spezifisch:
  mietdatum?: string;
  festbeginn?: string;
  mietbetrag?: number | string;
  kaution?: number | string;
  saveToStorage?: boolean;
  syncPaperless?: boolean;
}

// Hilfsfunktion: Strasse und Hausnummer trennen
function splitStreetAndNumber(strasse: string): { streetName: string; houseNumber: string } {
  if (!strasse) return { streetName: "–", houseNumber: "" };
  const parts = strasse.trim().split(/\s+(?=\d)/);
  return {
    streetName: parts[0] || strasse.trim(),
    houseNumber: parts.slice(1).join(" ") || " ",
  };
}

// Schweizer QR-Payload nach SIX SPC 0200 1 erzeugen
function createSwissQrBillString(
  iban: string,
  amount: number,
  invoiceRef: string,
  recipient: RecipientData,
  yearStr: string,
  docType: string
): string {
  const cleanIban = iban.replace(/\s/g, "");
  const isFirma =
    recipient.typ === "firma" ||
    Boolean(recipient.firma) ||
    Boolean(recipient.name && recipient.name.match(/\b(AG|GmbH|Genossenschaft|Verein|Verband|Stiftung|Gemeinde)\b/i));

  const { streetName, houseNumber } = splitStreetAndNumber(recipient.strasse || "");

  let debtorName = "";
  if (isFirma) {
    debtorName = recipient.firma || recipient.name || "";
  } else {
    debtorName = [recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || (recipient.name || "");
  }
  if (debtorName.length > 70) debtorName = debtorName.substring(0, 70);

  const qrRefText = `${invoiceRef} / ${docType || "Rechnung"} ${yearStr}`.trim();
  const formattedAmount = amount > 0 ? amount.toFixed(2) : "";

  return [
    "SPC",
    "0200",
    "1",
    cleanIban,
    "S",
    CLUB_NAME,
    "",
    "",
    CLUB_ZIP,
    CLUB_CITY,
    CLUB_COUNTRY,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formattedAmount,
    "CHF",
    "S",
    debtorName || "Debitor",
    streetName,
    houseNumber || " ",
    recipient.plz || CLUB_ZIP,
    recipient.ort || CLUB_CITY,
    recipient.land || "CH",
    "NON",
    "",
    qrRefText,
    "EPD",
  ].join("\n");
}

// Hilfsfunktion: Zeichnet den Schweizer QR-Code mit zentriertem Schweizerkreuz via pdf-lib Vektoren
function drawSwissQrCodeVector(
  page: any,
  qrText: string,
  x: number, // PDF-Points (Links)
  y: number, // PDF-Points (Unten)
  sizeMm: number = 46
) {
  const sizePt = sizeMm * MM;

  // QR-Code Matrix mit Level M (erforderlich für 7x7mm Logo-Überdeckung)
  const qr = qrcode(0, "M");
  qr.addData(qrText, "Byte");
  qr.make();
  const moduleCount = qr.getModuleCount();
  const moduleSize = sizePt / moduleCount;

  // 1. QR-Code Module (Vektor-Rechtecke) zeichnen
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        page.drawRectangle({
          x: x + col * moduleSize,
          y: y + (moduleCount - 1 - row) * moduleSize,
          width: moduleSize,
          height: moduleSize,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  // 2. Schweizerkreuz im Zentrum (exakt 7x7 mm nach SIX-Vorgabe)
  const crossBoxMm = 7;
  const crossBoxPt = crossBoxMm * MM;
  const crossX = x + (sizePt - crossBoxPt) / 2;
  const crossY = y + (sizePt - crossBoxPt) / 2;

  // Schwarzes Hintergrund-Quadrat mit weissem Rand
  const borderMm = 0.5;
  const borderPt = borderMm * MM;
  page.drawRectangle({
    x: crossX - borderPt,
    y: crossY - borderPt,
    width: crossBoxPt + borderPt * 2,
    height: crossBoxPt + borderPt * 2,
    color: rgb(1, 1, 1),
  });

  page.drawRectangle({
    x: crossX,
    y: crossY,
    width: crossBoxPt,
    height: crossBoxPt,
    color: rgb(0, 0, 0),
  });

  // Weisses Schweizerkreuz (Arme: 5x1.5mm und 1.5x5mm)
  const armLenPt = 4.8 * MM;
  const armThickPt = 1.6 * MM;

  // Horizontaler Balken
  page.drawRectangle({
    x: crossX + (crossBoxPt - armLenPt) / 2,
    y: crossY + (crossBoxPt - armThickPt) / 2,
    width: armLenPt,
    height: armThickPt,
    color: rgb(1, 1, 1),
  });

  // Vertikaler Balken
  page.drawRectangle({
    x: crossX + (crossBoxPt - armThickPt) / 2,
    y: crossY + (crossBoxPt - armLenPt) / 2,
    width: armThickPt,
    height: armLenPt,
    color: rgb(1, 1, 1),
  });
}

// Zeichnet den normierten Schweizer QR-Zahlteil nach SIX Spezifikation (SPC 0200 1)
function drawSwissQrBillSection(
  page: any,
  fontRegular: any,
  fontBold: any,
  invoiceRef: string,
  totalAmount: number,
  recipient: RecipientData,
  yearStr: string,
  docType: string
) {
  const qrBillHeightPt = 105 * MM; // 105mm Höhe
  const receiptWidthPt = 62 * MM;  // 62mm Breite Empfangsschein
  const fullWidthPt = 210 * MM;    // 210mm Seitenbreite

  // 1. Perforationslinien (Trennlinien oben und zwischen Empfangsschein und Zahlteil)
  // Horizontale Trennlinie bei 105mm
  page.drawLine({
    start: { x: 0, y: qrBillHeightPt },
    end: { x: fullWidthPt, y: qrBillHeightPt },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
    dashArray: [4, 4],
  });

  // Scheren-Hinweis
  page.drawText("Vor der Einzahlung abzutrennen", {
    x: 85 * MM,
    y: qrBillHeightPt + 2 * MM,
    size: 7,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Vertikale Trennlinie bei 62mm
  page.drawLine({
    start: { x: receiptWidthPt, y: 0 },
    end: { x: receiptWidthPt, y: qrBillHeightPt },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
    dashArray: [4, 4],
  });

  // ============================================================================
  // A. EMPFANGSSCHEIN (Links, 62mm breit)
  // ============================================================================
  const recX = 5 * MM;

  // Titel
  page.drawText("Empfangsschein", {
    x: recX,
    y: qrBillHeightPt - 12 * MM,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Konto / Zahlbar an
  page.drawText("Konto / Zahlbar an", {
    x: recX,
    y: qrBillHeightPt - 20 * MM,
    size: 6,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText(CLUB_IBAN_FORMATTED, {
    x: recX,
    y: qrBillHeightPt - 24 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
  page.drawText(CLUB_NAME, {
    x: recX,
    y: qrBillHeightPt - 27.5 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
  page.drawText(`${CLUB_ZIP} ${CLUB_CITY}`, {
    x: recX,
    y: qrBillHeightPt - 31 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // Referenz (Ohne Referenz / NON)
  page.drawText("Referenz", {
    x: recX,
    y: qrBillHeightPt - 38 * MM,
    size: 6,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("-", {
    x: recX,
    y: qrBillHeightPt - 42 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // Zahlbar durch (Debitor)
  page.drawText("Zahlbar durch", {
    x: recX,
    y: qrBillHeightPt - 49 * MM,
    size: 6,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const debtorLines: string[] = [];
  if (recipient.firma) debtorLines.push(sanitizeText(recipient.firma));
  const pName = [recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || recipient.name || "";
  if (pName && (!recipient.firma || debtorLines.length === 1)) debtorLines.push(sanitizeText(pName));
  if (recipient.strasse) debtorLines.push(sanitizeText(recipient.strasse));
  const plzOrt = `${recipient.plz || ""} ${recipient.ort || ""}`.trim();
  if (plzOrt) debtorLines.push(sanitizeText(plzOrt));

  debtorLines.slice(0, 4).forEach((line, idx) => {
    page.drawText(line, {
      x: recX,
      y: qrBillHeightPt - (53 + idx * 3.5) * MM,
      size: 8,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
  });

  // Währung & Betrag (unten links im Empfangsschein)
  page.drawText("Währung", {
    x: recX,
    y: 18 * MM,
    size: 6,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("CHF", {
    x: recX,
    y: 13 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  page.drawText("Betrag", {
    x: recX + 15 * MM,
    y: 18 * MM,
    size: 6,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText(totalAmount > 0 ? totalAmount.toFixed(2) : "", {
    x: recX + 15 * MM,
    y: 13 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // Annahmestelle
  page.drawText("Annahmestelle", {
    x: receiptWidthPt - 22 * MM,
    y: 18 * MM,
    size: 6,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.3),
  });

  // ============================================================================
  // B. ZAHLTEIL (Rechts, 148mm breit)
  // ============================================================================
  const payX = receiptWidthPt + 5 * MM;

  // Titel
  page.drawText("Zahlteil", {
    x: payX,
    y: qrBillHeightPt - 12 * MM,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // 1. Schweizer QR-Code einfügen
  const qrString = createSwissQrBillString(CLUB_IBAN, totalAmount, invoiceRef, recipient, yearStr, docType);
  const qrX = payX;
  const qrY = qrBillHeightPt - (17 + 46) * MM;
  drawSwissQrCodeVector(page, qrString, qrX, qrY, 46);

  // Währung & Betrag unterhalb des QR-Codes
  page.drawText("Währung", {
    x: qrX,
    y: 18 * MM,
    size: 7,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("CHF", {
    x: qrX,
    y: 13 * MM,
    size: 10,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  page.drawText("Betrag", {
    x: qrX + 18 * MM,
    y: 18 * MM,
    size: 7,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText(totalAmount > 0 ? totalAmount.toFixed(2) : "", {
    x: qrX + 18 * MM,
    y: 13 * MM,
    size: 10,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // 2. Rechte Textspalte im Zahlteil
  const rightColX = payX + 51 * MM;

  // Konto / Zahlbar an
  page.drawText("Konto / Zahlbar an", {
    x: rightColX,
    y: qrBillHeightPt - 12 * MM,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText(CLUB_IBAN_FORMATTED, {
    x: rightColX,
    y: qrBillHeightPt - 16.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
  page.drawText(CLUB_NAME, {
    x: rightColX,
    y: qrBillHeightPt - 20.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
  page.drawText(`${CLUB_ZIP} ${CLUB_CITY}`, {
    x: rightColX,
    y: qrBillHeightPt - 24.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // Referenz
  page.drawText("Referenz", {
    x: rightColX,
    y: qrBillHeightPt - 31 * MM,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page.drawText("-", {
    x: rightColX,
    y: qrBillHeightPt - 35.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // Zusätzliche Informationen
  page.drawText("Zusätzliche Informationen", {
    x: rightColX,
    y: qrBillHeightPt - 42 * MM,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  const infoText = sanitizeText(`${invoiceRef} / ${docType || "Rechnung"} ${yearStr}`);
  page.drawText(infoText, {
    x: rightColX,
    y: qrBillHeightPt - 46.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // Zahlbar durch
  page.drawText("Zahlbar durch", {
    x: rightColX,
    y: qrBillHeightPt - 53 * MM,
    size: 8,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  debtorLines.slice(0, 4).forEach((line, idx) => {
    page.drawText(sanitizeText(line), {
      x: rightColX,
      y: qrBillHeightPt - (57.5 + idx * 4) * MM,
      size: 9,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
  });
}

// Erstellt das vollständige Rechnungs-PDF (A4, dynamischer Y-Cursor, Lookahead-Paginierung)
async function generateInvoicePdf(
  invoiceId: string,
  recipient: RecipientData,
  sender: SenderData,
  layout: LayoutData,
  positions: InvoicePosition[],
  totalAmount: number,
  yearStr: string,
  docType: string,
  supabaseClient?: any
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 0. Server-Side Resolution: Vorlage aus document_templates nachladen falls unvollständig
  let resolvedLayout: LayoutData = { ...layout };
  if ((!resolvedLayout.title || !resolvedLayout.notice) && supabaseClient) {
    try {
      const typeKey = (docType || "jahresbeitrag").toLowerCase().trim();
      const { data: tmpl } = await supabaseClient
        .from("document_templates")
        .select("*")
        .or(`code.eq.${typeKey},category.eq.${typeKey}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tmpl) {
        resolvedLayout = {
          title: resolvedLayout.title || tmpl.title,
          intro: resolvedLayout.intro || tmpl.intro,
          outro: resolvedLayout.outro || tmpl.outro,
          notice: resolvedLayout.notice || tmpl.notice,
        };
      }
    } catch (_) {}
  }

  // 1. Logo mit In-Memory Cache & Base64-Inlining laden (scaleToFit)
  let logoImage: any = null;
  const logoBytes = await getOrLoadLogoBytes(supabaseClient);
  if (logoBytes) {
    try {
      logoImage = await pdfDoc.embedPng(logoBytes);
    } catch (embedErr) {
      console.warn("⚠️ [PDF-Engine] Logo-Embed Warnung:", embedErr);
    }
  }

  const isFirma =
    recipient.typ === "firma" ||
    Boolean(recipient.firma) ||
    Boolean(recipient.name && recipient.name.match(/\b(AG|GmbH|Genossenschaft|Verein|Verband|Stiftung|Gemeinde)\b/i));

  const validPositions = (positions && positions.length > 0)
    ? positions
    : [{ position_nr: 1, description: docType || "Jahresbeitrag", quantity: 1, unit_price: totalAmount, amount: totalAmount }];

  const dateStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  
  // Geometrie-Konstanten
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  const tblX = 20 * MM;
  const tblW = 170 * MM;
  const colW = { pos: 12 * MM, desc: 92 * MM, qty: 18 * MM, price: 22 * MM, total: 26 * MM };
  const QR_BILL_HEIGHT = 105 * MM;
  const MARGIN_BOTTOM = 22 * MM;
  const TOTALS_FOOTER_HEIGHT = 38 * MM;
  const QR_SAFE_FLOOR = QR_BILL_HEIGHT + 6 * MM; // 111 mm

  // 2. Vorbereitung der Tabellenzeilen mit automatischem Text-Wrapping
  interface PreparedRow {
    posNr: string;
    lines: string[];
    qtyStr: string;
    unitStr: string;
    totalStr: string;
    rowHeight: number;
  }

  const preparedRows: PreparedRow[] = validPositions.map((pos, idx) => {
    const pAmt = Number(pos.amount || pos.unit_price || 0);
    const pQty = Number(pos.quantity || 1);
    const pUnit = Number(pos.unit_price || pAmt);
    const lines = wrapText(pos.description || "", fontRegular, 8.5, colW.desc - 4 * MM);
    const rowHeight = Math.max(lines.length * 3.8 * MM + 2.0 * MM, 5.8 * MM);
    return {
      posNr: String(pos.position_nr || idx + 1),
      lines,
      qtyStr: pQty > 1 ? String(pQty) : "1",
      unitStr: pUnit.toFixed(2),
      totalStr: pAmt.toFixed(2),
      rowHeight,
    };
  });

  // Hilfsfunktion: Tabellenkopf zeichnen
  const drawTableHeader = (p: any, y: number) => {
    p.drawRectangle({
      x: tblX,
      y: y - 2 * MM,
      width: tblW,
      height: 6.5 * MM,
      color: rgb(0.93, 0.95, 0.98),
    });
    p.drawText("Pos.", { x: tblX + 2 * MM, y: y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Beschreibung", { x: tblX + colW.pos + 2 * MM, y: y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Menge", { x: tblX + colW.pos + colW.desc + 2 * MM, y: y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Ansatz", { x: tblX + colW.pos + colW.desc + colW.qty + 2 * MM, y: y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Betrag (CHF)", { x: tblX + tblW - 25 * MM, y: y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    return y - 6.5 * MM;
  };

  // Hilfsfunktion: Tabellenzeile mit mehrzeiligem Text zeichnen
  const drawTableRow = (p: any, row: PreparedRow, idx: number, y: number) => {
    if (idx % 2 === 1) {
      p.drawRectangle({
        x: tblX,
        y: y - row.rowHeight + 3.8 * MM,
        width: tblW,
        height: row.rowHeight,
        color: rgb(0.98, 0.98, 0.99),
      });
    }

    // Pos.-Nummer
    p.drawText(row.posNr, { x: tblX + 2 * MM, y, size: 8.5, font: fontRegular });

    // Beschreibung (mehrzeilig gerendert)
    row.lines.forEach((line, lIdx) => {
      p.drawText(sanitizeText(line), {
        x: tblX + colW.pos + 2 * MM,
        y: y - (lIdx * 3.8 * MM),
        size: 8.5,
        font: fontRegular,
      });
    });

    // Menge, Ansatz, Betrag auf erster Zeile
    p.drawText(row.qtyStr, { x: tblX + colW.pos + colW.desc + 2 * MM, y, size: 8.5, font: fontRegular });
    p.drawText(row.unitStr, { x: tblX + colW.pos + colW.desc + colW.qty + 2 * MM, y, size: 8.5, font: fontRegular });
    p.drawText(row.totalStr, { x: tblX + tblW - 20 * MM, y, size: 8.5, font: fontRegular });

    return y - row.rowHeight;
  };

  // Hilfsfunktion: Summenzeile, Zahlungsfrist & Grussformel
  const drawTotalsAndFooter = (p: any, y: number) => {
    p.drawLine({
      start: { x: tblX, y: y + 1 * MM },
      end: { x: tblX + tblW, y: y + 1 * MM },
      thickness: 0.8,
      color: rgb(0.2, 0.2, 0.2),
    });

    p.drawText("Gesamtbetrag (CHF):", { x: tblX + tblW - 65 * MM, y: y - 3 * MM, size: 9.5, font: fontBold });
    p.drawText(totalAmount.toFixed(2), { x: tblX + tblW - 20 * MM, y: y - 3 * MM, size: 10, font: fontBold });

    y -= 8.5 * MM;

    const noticeRaw = (resolvedLayout.notice || "Zahlbar innert 30 Tagen mit beiliegendem QR-Zahlteil. Besten Dank für deine Unterstützung!")
      .replace(/{rechnungsnummer}/g, invoiceId)
      .replace(/{rechnungsjahr}/g, yearStr);
    const noticeClean = sanitizeText(noticeRaw);

    p.drawText(noticeClean, { x: 20 * MM, y, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
    y -= 4.8 * MM;

    const senderName = [sender.vorname, sender.nachname].filter(Boolean).join(" ") || CLUB_NAME;
    const senderFunc = sender.funktion || "Vorstand Sportschützen Muhen";
    p.drawText("Freundliche Grüsse", { x: 20 * MM, y, size: 9, font: fontRegular });
    y -= 4 * MM;
    p.drawText(sanitizeText(`${senderName} (${senderFunc})`), { x: 20 * MM, y, size: 9, font: fontBold });

    return y - 5 * MM;
  };

  // Hilfsfunktion: Folgeseiten-Header mit Dokument-Metadaten
  const renderFollowUpHeader = (p: any) => {
    p.drawText(sanitizeText(`${CLUB_NAME} · Rechnung ${invoiceId} · ${dateStr}`), {
      x: 20 * MM,
      y: 278 * MM,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.55),
    });
    p.drawLine({
      start: { x: 20 * MM, y: 274 * MM },
      end: { x: 190 * MM, y: 274 * MM },
      thickness: 0.3,
      color: rgb(0.7, 0.7, 0.7),
    });
    return 265 * MM;
  };

  // ============================================================================
  // SEITE 1 INITIALISIEREN & KOPFBEREICH ZEICHNEN
  // ============================================================================
  let currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  // Briefkopf: Logo proportional skaliert (scaleToFit)
  let textStartX = 20 * MM;
  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(38 * MM, 18 * MM);
    currentPage.drawImage(logoImage, {
      x: 20 * MM,
      y: 280 * MM - scaledLogo.height,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
    textStartX = 20 * MM + scaledLogo.width + 4 * MM;
  }

  currentPage.drawText(CLUB_NAME.toUpperCase(), {
    x: textStartX,
    y: 277 * MM,
    size: 13,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54), // Vereinsblau
  });
  currentPage.drawText("Gegründet 1933 · Schiessanlage Hard · 5037 Muhen", {
    x: textStartX,
    y: 272 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });
  currentPage.drawText(`${CLUB_EMAIL} · ${CLUB_WEBSITE}`, {
    x: textStartX,
    y: 267 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  // DIN 5008 Fensterzeile Absender
  currentPage.drawText(`${CLUB_NAME} · Postfach · 5037 Muhen`, {
    x: 125 * MM,
    y: 262 * MM,
    size: 7,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });
  currentPage.drawLine({
    start: { x: 125 * MM, y: 260.5 * MM },
    end: { x: 195 * MM, y: 260.5 * MM },
    thickness: 0.3,
    color: rgb(0.7, 0.7, 0.7),
  });

  // Empfänger-Adresse (DIN 5008 Fenster rechts)
  let addrY = 255 * MM;
  if (recipient.firma) {
    currentPage.drawText(sanitizeText(recipient.firma), { x: 125 * MM, y: addrY, size: 10, font: fontBold });
    addrY -= 4.5 * MM;
  }
  if (recipient.abteilung) {
    currentPage.drawText(sanitizeText(recipient.abteilung), { x: 125 * MM, y: addrY, size: 9, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  const fullRecName = [recipient.anrede, recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || (recipient.name || "");
  if (fullRecName) {
    currentPage.drawText(sanitizeText(fullRecName), { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  if (recipient.strasse) {
    currentPage.drawText(sanitizeText(recipient.strasse), { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  const plzOrt = `${recipient.plz || ""} ${recipient.ort || ""}`.trim();
  if (plzOrt) {
    currentPage.drawText(sanitizeText(plzOrt), { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  if (recipient.land && recipient.land !== "CH" && recipient.land !== "Schweiz") {
    currentPage.drawText(sanitizeText(recipient.land), { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }

  // Datum & Ort
  currentPage.drawText(`Muhen, ${dateStr}`, {
    x: 20 * MM,
    y: 232 * MM,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Rechnungstitel
  const defaultTitle = `Rechnung ${invoiceId} – ${docType || "Jahresbeitrag"} ${yearStr}`;
  const finalTitle = sanitizeText(resolvedLayout.title ? resolvedLayout.title.replace(/{rechnungsnummer}/g, invoiceId).replace(/{rechnungsjahr}/g, yearStr) : defaultTitle);
  currentPage.drawText(finalTitle, {
    x: 20 * MM,
    y: 223 * MM,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  // Anrede & Einleitung
  let curY = 214 * MM;
  let salutation = "Guten Tag,";
  if (isFirma) {
    salutation = recipient.nachname
      ? (recipient.anrede === "Frau" ? "Sehr geehrte Frau " : "Sehr geehrter Herr ") + recipient.nachname + ","
      : "Sehr geehrte Damen und Herren,";
  } else {
    if (recipient.vorname) {
      salutation = `Guten Tag ${recipient.vorname},`;
    } else if (recipient.nachname) {
      salutation = `Guten Tag ${recipient.anrede || ""} ${recipient.nachname},`.trim();
    }
  }

  const introRaw = (resolvedLayout.intro || "anbei erhalten Sie die Rechnung für das Vereinsjahr {rechnungsjahr}.")
    .replace(/{rechnungsnummer}/g, invoiceId)
    .replace(/{rechnungsjahr}/g, yearStr)
    .replace(/{vorname}/g, recipient.vorname || "")
    .replace(/{nachname}/g, recipient.nachname || "");

  currentPage.drawText(sanitizeText(salutation), { x: 20 * MM, y: curY, size: 9.5, font: fontRegular });
  curY -= 5 * MM;

  const introLines = introRaw.split("\n");
  introLines.forEach((l) => {
    if (l.trim()) {
      currentPage.drawText(sanitizeText(l.trim()), { x: 20 * MM, y: curY, size: 9, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
      curY -= 4.2 * MM;
    } else {
      curY -= 2 * MM;
    }
  });

  curY -= 3 * MM;

  // ============================================================================
  // 3. INTELLIGENTER LOOKAHEAD: PASST ALLES AUF SEITE 1 INKL. QR-ZAHLTEIL?
  // ============================================================================
  const totalRowsHeight = preparedRows.reduce((acc, r) => acc + r.rowHeight, 0);
  const tableHeaderHeight = 6.5 * MM;
  const singlePageRequiredSpace = tableHeaderHeight + totalRowsHeight + TOTALS_FOOTER_HEIGHT;
  const fitsOnSinglePage = (curY - singlePageRequiredSpace) >= QR_SAFE_FLOOR;

  if (fitsOnSinglePage) {
    // --------------------------------------------------------------------------
    // EINSEITIGE RECHNUNG: Kein Umbruch nötig, verhindert leere Folgeseiten
    // --------------------------------------------------------------------------
    curY = drawTableHeader(currentPage, curY);

    preparedRows.forEach((row, idx) => {
      curY = drawTableRow(currentPage, row, idx, curY);
    });

    drawTotalsAndFooter(currentPage, curY);
    drawSwissQrBillSection(currentPage, fontRegular, fontBold, invoiceId, totalAmount, recipient, yearStr, docType);
  } else {
    // --------------------------------------------------------------------------
    // MEHRSEITIGE RECHNUNG MIT DYNAMISCHEM Y-CURSOR
    // --------------------------------------------------------------------------
    // Seite 1: Nutzt den vollen Raum nach unten bis MARGIN_BOTTOM (kein QR-Teil auf S.1)
    curY = drawTableHeader(currentPage, curY);

    let rowIndex = 0;
    while (rowIndex < preparedRows.length) {
      const nextRow = preparedRows[rowIndex];
      if (curY - nextRow.rowHeight < MARGIN_BOTTOM) {
        break; // Seite 1 voll, Umbruch auf Folgeseite
      }
      curY = drawTableRow(currentPage, nextRow, rowIndex, curY);
      rowIndex++;
    }

    let qrPlaced = false;

    // Folgeseite(n)
    while (rowIndex < preparedRows.length) {
      currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      curY = renderFollowUpHeader(currentPage);
      curY = drawTableHeader(currentPage, curY);

      // Berechnen, wie viel Platz die verbleibenden Zeilen insgesamt benötigen
      let remainingHeight = 0;
      for (let r = rowIndex; r < preparedRows.length; r++) {
        remainingHeight += preparedRows[r].rowHeight;
      }

      // Prüfen, ob alle verbleibenden Positionen + Footer noch über den QR-Zahlteil passen
      const canFinishOnThisPage = (curY - (remainingHeight + TOTALS_FOOTER_HEIGHT)) >= QR_SAFE_FLOOR;

      if (canFinishOnThisPage) {
        // Diese Folgeseite wird die finale Schlussseite mit QR-Teil!
        while (rowIndex < preparedRows.length) {
          curY = drawTableRow(currentPage, preparedRows[rowIndex], rowIndex, curY);
          rowIndex++;
        }
        drawTotalsAndFooter(currentPage, curY);
        drawSwissQrBillSection(currentPage, fontRegular, fontBold, invoiceId, totalAmount, recipient, yearStr, docType);
        qrPlaced = true;
        break;
      } else {
        // Nicht alle passen -> Fülle bis MARGIN_BOTTOM und nächste Seite
        while (rowIndex < preparedRows.length) {
          const nextRow = preparedRows[rowIndex];
          if (curY - nextRow.rowHeight < MARGIN_BOTTOM) {
            break;
          }
          curY = drawTableRow(currentPage, nextRow, rowIndex, curY);
          rowIndex++;
        }
      }
    }

    // Falls alle Zeilen gezeichnet sind, der QR-Zahlteil aber nicht mehr passte:
    // Dedizierte Schlussseite mit standardisiertem Belegbezugs-Kopf anlegen (SIX SPC 0200 1)
    if (!qrPlaced) {
      currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      curY = renderFollowUpHeader(currentPage);

      // Standardisierter Belegbezugs-Kopf
      currentPage.drawText(`Zahlteil & Belegdetails zu Rechnung: ${invoiceId}`, {
        x: 20 * MM,
        y: curY,
        size: 11,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.3),
      });
      curY -= 5.5 * MM;

      const recSummary = [recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || recipient.firma || recipient.name || "Rechnungsempfänger";
      currentPage.drawText(sanitizeWinAnsiText(`Rechnungsempfänger: ${recSummary}   |   Gesamtbetrag: CHF ${totalAmount.toFixed(2)}`), {
        x: 20 * MM,
        y: curY,
        size: 9,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });
      curY -= 8 * MM;

      drawTotalsAndFooter(currentPage, curY);
      drawSwissQrBillSection(currentPage, fontRegular, fontBold, invoiceId, totalAmount, recipient, yearStr, docType);
    }
  }

  // ============================================================================
  // 4. SEITENNUMMERIERUNG & SIX-KONFORME STEMPELUNG
  // ============================================================================
  const totalPages = pdfDoc.getPageCount();
  const allPages = pdfDoc.getPages();
  allPages.forEach((p, idx) => {
    const pageNum = idx + 1;
    const isLastPage = (pageNum === totalPages);
    // Auf der letzten Seite liegt der QR-Teil bei 0..105mm -> Stempel oberhalb der Trennlinie bei 108.5mm
    // Auf Zwischenseiten -> Stempel unten bei 12mm
    const stampY = isLastPage ? (QR_BILL_HEIGHT + 3.5 * MM) : (12 * MM);

    p.drawText(`Seite ${pageNum} von ${totalPages}`, {
      x: 175 * MM,
      y: stampY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });

    if (!isLastPage) {
      p.drawText("Fortsetzung auf der nächsten Seite...", {
        x: 20 * MM,
        y: stampY,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      });
    }
  });

  return await pdfDoc.save();
}

// Erstellt das Mietvertrags-PDF inkl. dynamischer Benützungsordnung (Klauseln Ziffern 1-8), Übergabeprotokoll und Schweizer QR-Rechnung
async function generateRentalContractPdf(
  bookingId: string,
  recipient: RecipientData,
  mietdatum: string,
  festbeginn: string,
  mietbetrag: number,
  kaution: number,
  sender: SenderData,
  supabaseClient?: any
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const curYear = new Date().getFullYear().toString();
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  // Logo laden (Base64-Inlining / Storage)
  let logoImage: any = null;
  const logoBytes = await getOrLoadLogoBytes(supabaseClient);
  if (logoBytes) {
    try {
      logoImage = await pdfDoc.embedPng(logoBytes);
    } catch (_) {}
  }

  // Dynamische Klauseln aus Supabase laden
  let clauses: any[] = [];
  if (supabaseClient) {
    try {
      const { data: tData } = await supabaseClient
        .from("document_templates")
        .select("*")
        .eq("category", "vertrag")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tData) {
        const { data: cData } = await supabaseClient
          .from("document_template_clauses")
          .select("*")
          .eq("template_id", tData.id)
          .order("sort_order", { ascending: true });

        if (cData && cData.length > 0) {
          clauses = cData;
        }
      }
    } catch (err) {
      console.warn("⚠️ [PDF-Engine] Fehler beim Laden der Vertragsklauseln:", err);
    }
  }

  // Fallback-Klauseln (Ziffern 1–8 nach Benützungsreglement Schützenstube Rüteli)
  if (!clauses || clauses.length === 0) {
    clauses = [
      { clause_number: "1", clause_title: "Zweckbestimmung", clause_text: "Die Schützenstube dient geselligen Anlässen. Politische Extremveranstaltungen sind untersagt." },
      { clause_number: "2", clause_title: "Benutzungsrecht & Cheminée", clause_text: "Beinhaltet Saal, Küche, Geschirr und WC-Anlagen. Cheminéeholz ist massvoll zu verwenden; Abzugsklappe stets öffnen." },
      { clause_number: "3", clause_title: "Sorgfaltspflicht & Reinigung", clause_text: "Räume sind besenrein abzugeben. Geschirr gereinigt versorgen. Nachreinigung wird mit CHF 35.00/h verrechnet." },
      { clause_number: "4", clause_title: "Dekoration & Lärmschutz", clause_text: "Keine Nägel/Klammern an Decken und Wänden. Nachtruhe ab 22:00 Uhr im Aussenbereich strikte einhalten." },
      { clause_number: "5", clause_title: "Haftung & Schäden", clause_text: "Der Mieter haftet vollumfänglich für Personen- und Sachschäden sowie für Beschädigungen der Schiessanlage." },
      { clause_number: "6", clause_title: "Vermietungskontakt & Notfall", clause_text: "Schlüsselübergabe und Notfallkontakt erfolgen über die zuständige Vermietungsstelle der Sportschützen Muhen." },
      { clause_number: "7", clause_title: "Reservation & Stornogebühr", clause_text: "Bei Absage weniger als 30 Tage vor Mietbeginn wird eine Stornogebühr von CHF 100.00 fällig." },
      { clause_number: "8", clause_title: "Gebühren & Kaution", clause_text: "Mietgebühr und Kaution sind vor Antritt zu begleichen. Rückerstattung der Kaution erfolgt nach beanstandungsloser Abnahme." }
    ];
  }

  // ============================================================================
  // SEITE 1: PARTEIEN, MIETOBJEKT, GEBÜHREN & KLAUSELN 1-4
  // ============================================================================
  const page1 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  let textStartX = 20 * MM;
  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(38 * MM, 18 * MM);
    page1.drawImage(logoImage, {
      x: 20 * MM,
      y: 280 * MM - scaledLogo.height,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
    textStartX = 20 * MM + scaledLogo.width + 4 * MM;
  }

  page1.drawText(CLUB_NAME.toUpperCase(), {
    x: textStartX,
    y: 278 * MM,
    size: 13,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  page1.drawText("Vermietung Schützenstube Hard · 5037 Muhen · info@sportschuetzen-muhen.ch", {
    x: textStartX,
    y: 273 * MM,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  page1.drawText(`Mietvertrag & Benützungsvereinbarung: ${bookingId}`, {
    x: 20 * MM,
    y: 257 * MM,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  let curY = 247 * MM;

  // Parteien
  page1.drawText("Vermieter:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page1.drawText(`${CLUB_NAME}, 5037 Muhen (Vertretung: ${sender.vorname || "Vermietung"} ${sender.nachname || ""})`, {
    x: 50 * MM,
    y: curY,
    size: 9,
    font: fontRegular,
  });
  curY -= 5 * MM;

  const mieterName = [recipient.vorname, recipient.nachname].filter(Boolean).join(" ") || recipient.name || "–";
  page1.drawText("Mieter:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page1.drawText(`${mieterName}, ${recipient.strasse || ""}, ${recipient.plz || ""} ${recipient.ort || ""}`, {
    x: 50 * MM,
    y: curY,
    size: 9,
    font: fontRegular,
  });
  curY -= 4 * MM;
  page1.drawText(`Kontakt: ${recipient.email || "–"} | Tel: ${recipient.telefon || "–"}`, {
    x: 50 * MM,
    y: curY,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  curY -= 6.5 * MM;

  // Mietobjekt & Konditionen
  page1.drawText("Mietdatum:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page1.drawText(`${mietdatum} (Festbeginn: ${festbeginn || "Nach Vereinbarung"})`, { x: 50 * MM, y: curY, size: 9, font: fontRegular });
  curY -= 5 * MM;

  page1.drawText("Mietobjekt:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page1.drawText("Schützenstube Muhen inkl. Mobiliar, Küche, Geschirr und WC-Anlagen", { x: 50 * MM, y: curY, size: 9, font: fontRegular });
  curY -= 5 * MM;

  page1.drawText("Gebühren:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page1.drawText(`Mietgebühr: CHF ${mietbetrag.toFixed(2)}   |   Kaution (Depot): CHF ${kaution.toFixed(2)}`, {
    x: 50 * MM,
    y: curY,
    size: 9,
    font: fontBold,
  });
  curY -= 8 * MM;

  // Trennlinie
  page1.drawLine({ start: { x: 20 * MM, y: curY }, end: { x: 190 * MM, y: curY }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  curY -= 6 * MM;

  page1.drawText("Benützungsordnung & Vereinbarungen (Ziffern 1 bis 4):", { x: 20 * MM, y: curY, size: 9.5, font: fontBold, color: rgb(0.12, 0.23, 0.54) });
  curY -= 5.5 * MM;

  // Ziffern 1 bis 4
  const firstHalf = clauses.slice(0, 4);
  firstHalf.forEach((c, idx) => {
    const num = c.clause_number || String(idx + 1);
    page1.drawText(`${num}. ${sanitizeWinAnsiText(c.clause_title)}:`, { x: 20 * MM, y: curY, size: 8.5, font: fontBold });
    curY -= 4 * MM;
    const lines = wrapText(c.clause_text || "", fontRegular, 8, 170 * MM);
    lines.forEach(l => {
      page1.drawText(sanitizeWinAnsiText(l), { x: 24 * MM, y: curY, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
      curY -= 3.8 * MM;
    });
    curY -= 2 * MM;
  });

  // Hinweis am Fuss von Seite 1
  page1.drawText("Fortsetzung der Bestimmungen, Übergabeprotokoll und Einzahlungsschein auf Seite 2...", {
    x: 20 * MM,
    y: 16 * MM,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.45, 0.45, 0.45),
  });

  // ============================================================================
  // SEITE 2: KLAUSELN 5-8, ÜBERGABEPROTOKOLL, UNTERSCHRIFTEN & QR-BILL
  // ============================================================================
  const page2 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  page2.drawText(sanitizeWinAnsiText(`${CLUB_NAME} · Mietvertrag & Vereinbarung ${bookingId} (Seite 2)`), {
    x: 20 * MM,
    y: 278 * MM,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });
  page2.drawLine({ start: { x: 20 * MM, y: 274 * MM }, end: { x: 190 * MM, y: 274 * MM }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });

  let curY2 = 267 * MM;

  page2.drawText("Benützungsordnung & Vereinbarungen (Ziffern 5 bis 8):", { x: 20 * MM, y: curY2, size: 9.5, font: fontBold, color: rgb(0.12, 0.23, 0.54) });
  curY2 -= 5.5 * MM;

  const secondHalf = clauses.slice(4);
  secondHalf.forEach((c, idx) => {
    const num = c.clause_number || String(idx + 5);
    page2.drawText(`${num}. ${sanitizeWinAnsiText(c.clause_title)}:`, { x: 20 * MM, y: curY2, size: 8.5, font: fontBold });
    curY2 -= 4 * MM;
    const lines = wrapText(c.clause_text || "", fontRegular, 8, 170 * MM);
    lines.forEach(l => {
      page2.drawText(sanitizeWinAnsiText(l), { x: 24 * MM, y: curY2, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
      curY2 -= 3.8 * MM;
    });
    curY2 -= 2 * MM;
  });

  curY2 -= 2 * MM;

  // Checkliste / Übergabeprotokoll-Kästchen
  page2.drawRectangle({
    x: 20 * MM,
    y: curY2 - 14 * MM,
    width: 170 * MM,
    height: 14 * MM,
    color: rgb(0.96, 0.97, 0.99),
  });
  page2.drawText("Übergabe- und Rücknahmeprotokoll:", { x: 23 * MM, y: curY2 - 3.5 * MM, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
  page2.drawText("[  ] Raum & Mobiliar intakt      [  ] Küche & Geschirr gereinigt      [  ] Abfall entsorgt      [  ] Schlüssel zurück", {
    x: 23 * MM,
    y: curY2 - 9 * MM,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });
  curY2 -= 18 * MM;

  // Unterschriften
  const dateStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  page2.drawText(`Muhen, den ${dateStr}`, { x: 20 * MM, y: curY2, size: 8, font: fontRegular });
  curY2 -= 4.5 * MM;

  page2.drawText("Für den Verein: Sportschützen Muhen", { x: 20 * MM, y: curY2, size: 8, font: fontBold });
  page2.drawText("Der Mieter (gelesen & akzeptiert):", { x: 110 * MM, y: curY2, size: 8, font: fontBold });

  curY2 -= 9 * MM;
  page2.drawLine({ start: { x: 20 * MM, y: curY2 }, end: { x: 80 * MM, y: curY2 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  page2.drawLine({ start: { x: 110 * MM, y: curY2 }, end: { x: 180 * MM, y: curY2 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });

  // QR-Bill auf Seite 2 (105mm am unteren Rand)
  drawSwissQrBillSection(page2, fontRegular, fontBold, bookingId, mietbetrag, recipient, curYear, "Miete Schützenhaus");

  // ============================================================================
  // SEITENNUMMERIERUNG (2-Pass)
  // ============================================================================
  page1.drawText("Seite 1 von 2", { x: 175 * MM, y: 12 * MM, size: 7.5, font: fontRegular, color: rgb(0.45, 0.45, 0.45) });
  page2.drawText("Seite 2 von 2", { x: 175 * MM, y: 108.5 * MM, size: 7.5, font: fontRegular, color: rgb(0.45, 0.45, 0.45) });

  return await pdfDoc.save();
}

// Erstellt die mehrseitige Einladungsbroschüre zur Generalversammlung inkl. Traktanden und Jahresprogramm
async function generateGVInvitationPdf(
  year: number,
  gvData: any,
  supabaseClient?: any
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  // 1. Logo laden
  const logoBytes = await getOrLoadLogoBytes(supabaseClient);
  let logoImage: any = null;
  if (logoBytes) {
    try {
      logoImage = await pdfDoc.embedPng(logoBytes);
    } catch (_) {}
  }

  // 2. Daten aus Supabase laden (Template, Traktanden/Klauseln, Termine)
  let templateTitle = `Einladung zur ${gvData.gvNummer || ''}. ordentlichen Generalversammlung`;
  let templateIntro = `Liebe Schützinnen, liebe Schützen, geschätzte Ehren- und Freimitglieder\n\nWir laden euch herzlich zu unserer ordentlichen Generalversammlung ein.`;
  let templateNotice = "Der Vorstand freut sich über eine zahlreiche und pünktliche Teilnahme!";
  let clauses: any[] = [];
  let termine: any[] = [];

  if (supabaseClient) {
    try {
      // Template laden
      let tQuery = supabaseClient
        .from("document_templates")
        .select("*");
      if (gvData.templateId) {
        tQuery = tQuery.eq("id", gvData.templateId);
      } else if (gvData.templateCode) {
        tQuery = tQuery.eq("code", gvData.templateCode);
      } else {
        tQuery = tQuery.eq("category", "gv");
      }
      const { data: tData } = await tQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tData) {
        const replacePlaceholders = (text: string) => {
          return text
            .replace(/{jahr}/gi, String(year))
            .replace(/{rechnungsjahr}/gi, String(year))
            .replace(/{gv_nummer}/gi, String(gvData.gvNummer || ""));
        };

        if (tData.title) templateTitle = replacePlaceholders(tData.title);
        if (tData.intro) templateIntro = replacePlaceholders(tData.intro);
        if (tData.notice) templateNotice = replacePlaceholders(tData.notice);

        // Traktanden/Klauseln laden
        const { data: cData } = await supabaseClient
          .from("document_template_clauses")
          .select("*")
          .eq("template_id", tData.id)
          .order("sort_order", { ascending: true });

        if (cData && cData.length > 0) {
          clauses = cData;
        }
      }

      // Termine aus public.termine für das GV-Jahr laden
      const { data: termData } = await supabaseClient
        .from("termine")
        .select("*")
        .gte("datum", `${year}-01-01`)
        .lte("datum", `${year}-12-31`)
        .order("datum", { ascending: true });

      if (termData && termData.length > 0) {
        termine = termData;
      }
    } catch (err) {
      console.warn("⚠️ [PDF-Engine] GV Datenabfrage Warnung:", err);
    }
  }

  // Fallback-Traktanden falls in DB noch nicht angelegt
  if (!clauses || clauses.length === 0) {
    clauses = [
      { clause_number: "1", clause_title: "Begrüssung und Appell", clause_text: "" },
      { clause_number: "2", clause_title: "Wahl der Stimmenzähler", clause_text: "" },
      { clause_number: "3", clause_title: "Genehmigung des Protokolls der letzten GV", clause_text: "" },
      { clause_number: "4", clause_title: "Jahresberichte (Präsident, Schützenmeister, Jungschützen)", clause_text: "" },
      { clause_number: "5", clause_title: "Kassa- und Revisorenbericht, Entlastung des Vorstands", clause_text: "" },
      { clause_number: "6", clause_title: "Mutationen (Aufnahmen, Austritte, Ehrungen)", clause_text: "" },
      { clause_number: "7", clause_title: "Wahlen (Vorstand, Rechnungsrevisoren)", clause_text: "" },
      { clause_number: "8", clause_title: `Festsetzung Jahresprogramm ${year}`, clause_text: "" },
      { clause_number: "9", clause_title: `Budget ${year} und Festsetzung der Jahresbeiträge`, clause_text: "" },
      { clause_number: "10", clause_title: "Anträge von Mitgliedern", clause_text: "Schriftlich einzureichen gemäss Statuten" },
      { clause_number: "11", clause_title: "Ehrungen und Auszeichnungen", clause_text: "" },
      { clause_number: "12", clause_title: "Verschiedenes und Umfrage", clause_text: "" },
    ];
  }

  // ============================================================================
  // SEITE 1: EINLADUNG, ORT/ZEIT, BEGLEITTEXT & TRAKTANDEN
  // ============================================================================
  const page1 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  // Briefkopf
  let textStartX = 20 * MM;
  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(38 * MM, 18 * MM);
    page1.drawImage(logoImage, {
      x: 20 * MM,
      y: 280 * MM - scaledLogo.height,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
    textStartX = 20 * MM + scaledLogo.width + 4 * MM;
  }

  page1.drawText(CLUB_NAME.toUpperCase(), {
    x: textStartX,
    y: 277 * MM,
    size: 13,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  page1.drawText("Schiessanlage Hard · 5037 Muhen · www.sportschuetzen-muhen.ch", {
    x: textStartX,
    y: 272 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  // Titel
  page1.drawText(sanitizeWinAnsiText(templateTitle), {
    x: 20 * MM,
    y: 254 * MM,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  // Datum / Zeit / Ort - Banner
  page1.drawRectangle({
    x: 20 * MM,
    y: 236 * MM,
    width: 170 * MM,
    height: 14 * MM,
    color: rgb(0.94, 0.96, 0.99),
  });

  const gvDatum = gvData.datum || `Freitag, im März ${year}`;
  const gvZeit = gvData.zeit || "19:30 Uhr";
  const gvOrt = gvData.ort || "Schützenstube Hard, Muhen";

  page1.drawText(`Datum & Zeit:  ${sanitizeWinAnsiText(gvDatum)}, ${sanitizeWinAnsiText(gvZeit)}`, {
    x: 24 * MM,
    y: 244 * MM,
    size: 9.5,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  page1.drawText(`Ort:                 ${sanitizeWinAnsiText(gvOrt)}`, {
    x: 24 * MM,
    y: 239 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  let curY = 227 * MM;

  // Einleitungstext
  const introLines = templateIntro.split("\n");
  for (const line of introLines) {
    if (line.trim()) {
      const wrapped = wrapText(line, fontRegular, 8.5, 170 * MM);
      for (const w of wrapped) {
        page1.drawText(sanitizeWinAnsiText(w), { x: 20 * MM, y: curY, size: 8.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        curY -= 3.8 * MM;
      }
    } else {
      curY -= 2.5 * MM;
    }
  }

  curY -= 2 * MM;

  // Traktandenliste
  page1.drawText("TRAKTANDENLISTE:", {
    x: 20 * MM,
    y: curY,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });
  curY -= 5 * MM;

  clauses.forEach((c, idx) => {
    const num = c.clause_number || String(idx + 1);
    page1.drawText(`${num}.`, { x: 22 * MM, y: curY, size: 8.5, font: fontBold, color: rgb(0.12, 0.23, 0.54) });
    page1.drawText(sanitizeWinAnsiText(c.clause_title || ""), { x: 30 * MM, y: curY, size: 8.5, font: fontBold });

    if (c.clause_text && c.clause_text.trim()) {
      curY -= 3.5 * MM;
      page1.drawText(sanitizeWinAnsiText(c.clause_text.trim()), {
        x: 30 * MM,
        y: curY,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });
      curY -= 4.5 * MM;
    } else {
      curY -= 4.2 * MM;
    }
  });

  curY -= 2 * MM;

  // Gruss & Schluss
  page1.drawText(sanitizeWinAnsiText(templateNotice), {
    x: 20 * MM,
    y: curY,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  curY -= 4.5 * MM;
  page1.drawText("Freundliche Schützengrüsse", { x: 20 * MM, y: curY, size: 8.5, font: fontRegular });
  curY -= 4 * MM;
  page1.drawText("Der Vorstand der Sportschützen Muhen", { x: 20 * MM, y: curY, size: 9, font: fontBold, color: rgb(0.12, 0.23, 0.54) });

  // ============================================================================
  // SEITE 2+: JAHRESPROGRAMM / TERMINLISTE
  // ============================================================================
  const drawProgHeader = (p: any, y: number) => {
    p.drawText(`Sportschützen Muhen · Jahresprogramm ${year}`, {
      x: 20 * MM,
      y: y,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.15, 0.3),
    });
    p.drawText("Übersicht aller Termine, Schiessanlässe, Trainings und Meisterschaften", {
      x: 20 * MM,
      y: y - 4.5 * MM,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.55),
    });
    p.drawLine({
      start: { x: 20 * MM, y: y - 6.5 * MM },
      end: { x: 190 * MM, y: y - 6.5 * MM },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    return y - 12 * MM;
  };

  const drawProgTableHeader = (p: any, y: number) => {
    p.drawRectangle({
      x: 20 * MM,
      y: y - 2 * MM,
      width: 170 * MM,
      height: 6 * MM,
      color: rgb(0.93, 0.95, 0.98),
    });
    p.drawText("Datum", { x: 22 * MM, y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Tag", { x: 44 * MM, y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Zeit", { x: 55 * MM, y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Anlass / Schiessprogramm", { x: 74 * MM, y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    p.drawText("Ort / Stand", { x: 150 * MM, y, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
    return y - 6 * MM;
  };

  if (termine && termine.length > 0) {
    let curProgPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    let progY = drawProgHeader(curProgPage, 275 * MM);
    progY = drawProgTableHeader(curProgPage, progY);

    termine.forEach((term, idx) => {
      // Prüfen, ob noch Platz auf Seite
      if (progY < 25 * MM) {
        curProgPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        progY = drawProgHeader(curProgPage, 275 * MM);
        progY = drawProgTableHeader(curProgPage, progY);
      }

      const dObj = new Date(term.datum);
      const dStr = !isNaN(dObj.getTime())
        ? dObj.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
        : (term.datum || "–");
      const weekdayStr = !isNaN(dObj.getTime())
        ? dObj.toLocaleDateString("de-CH", { weekday: "short" })
        : "";
      const zeitStr = term.zeit || "–";
      const titleStr = term.titel || term.anlass || "–";
      const ortStr = term.ort || "Schiessanlage Hard";

      // Zebrastreifen
      if (idx % 2 === 1) {
        curProgPage.drawRectangle({
          x: 20 * MM,
          y: progY - 1.5 * MM,
          width: 170 * MM,
          height: 4.8 * MM,
          color: rgb(0.98, 0.98, 0.99),
        });
      }

      curProgPage.drawText(sanitizeWinAnsiText(dStr), { x: 22 * MM, y: progY, size: 7.5, font: fontRegular });
      curProgPage.drawText(sanitizeWinAnsiText(weekdayStr), { x: 44 * MM, y: progY, size: 7.5, font: fontRegular });
      curProgPage.drawText(sanitizeWinAnsiText(zeitStr), { x: 55 * MM, y: progY, size: 7.5, font: fontRegular });
      
      const titleClean = sanitizeWinAnsiText(titleStr);
      const maxTitleLen = 42;
      const displayTitle = titleClean.length > maxTitleLen ? titleClean.substring(0, maxTitleLen) + "..." : titleClean;
      curProgPage.drawText(displayTitle, { x: 74 * MM, y: progY, size: 7.5, font: fontBold });

      const ortClean = sanitizeWinAnsiText(ortStr);
      const displayOrt = ortClean.length > 24 ? ortClean.substring(0, 24) + "..." : ortClean;
      curProgPage.drawText(displayOrt, { x: 150 * MM, y: progY, size: 7.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

      progY -= 4.8 * MM;
    });
  }

  // ============================================================================
  // SEITENNUMMERIERUNG (2-Pass)
  // ============================================================================
  const totalPages = pdfDoc.getPageCount();
  const allPages = pdfDoc.getPages();
  allPages.forEach((p, idx) => {
    p.drawText(`Seite ${idx + 1} von ${totalPages}`, {
      x: 175 * MM,
      y: 12 * MM,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
    p.drawText(`Sportschützen Muhen · Generalversammlung ${year}`, {
      x: 20 * MM,
      y: 12 * MM,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
  });

  return await pdfDoc.save();
}

// Optionaler Paperless-NGX REST-Upload
async function syncToPaperlessNgx(
  pdfBytes: Uint8Array,
  filename: string,
  title: string,
  correspondentName: string,
  tags: string[]
): Promise<{ success: boolean; documentId?: number; error?: string }> {
  const paperlessUrl = Deno.env.get("PAPERLESS_API_URL");
  const paperlessToken = Deno.env.get("PAPERLESS_API_TOKEN");

  if (!paperlessUrl || !paperlessToken) {
    return { success: false, error: "PAPERLESS_API_URL oder PAPERLESS_API_TOKEN nicht konfiguriert." };
  }

  try {
    const formData = new FormData();
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    formData.append("document", pdfBlob, filename);
    formData.append("title", title);
    formData.append("created", new Date().toISOString().split("T")[0]);

    const cleanBaseUrl = paperlessUrl.replace(/\/+$/, "");
    const targetEndpoint = `${cleanBaseUrl}/api/documents/post_document/`;

    const resp = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${paperlessToken}`,
      },
      body: formData,
    });

    if (resp.ok || resp.status === 200 || resp.status === 202) {
      const text = await resp.text();
      let docId: number | undefined = undefined;
      try {
        const json = JSON.parse(text);
        docId = json.task_id || json.id || undefined;
      } catch (_) {}
      return { success: true, documentId: docId };
    } else {
      const errText = await resp.text();
      return { success: false, error: `Paperless HTTP ${resp.status}: ${errText}` };
    }
  } catch (err: any) {
    return { success: false, error: `Paperless Verbindungsfehler: ${err.message}` };
  }
}

// ==============================================================================
// MAIN HTTP REQUEST HANDLER
// ==============================================================================
Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: GeneratePdfPayload;
  try {
    payload = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Ungültiges JSON-Format im Request-Body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Supabase Client initialisieren
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://supabase-muhen.danfamily.uk";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authHeader = req.headers.get("Authorization");
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });

  const action = payload.action || "generate-invoice";
  const curYear = payload.year ? String(payload.year) : new Date().getFullYear().toString();

  try {
    let pdfBytes: Uint8Array;
    let fileName = "";
    let storageSubDir = "";
    let recordId = "";
    let docTitle = "";

    // --------------------------------------------------------------------------
    // FALL 1: RECHNUNGS-PDF GENERIEREN
    // --------------------------------------------------------------------------
    if (action === "generate-invoice" || action === "generateInvoicePDF") {
      const invId = payload.invoiceId || "";
      if (!invId) throw new Error("Rechnungs-ID (invoiceId) ist zwingend erforderlich.");
      recordId = invId;

      // Daten aus DB nachladen falls unvollständig
      let invRow: any = null;
      let positions = payload.positions || [];
      if (!positions.length || !payload.totalAmount) {
        const { data: invData } = await supabase.from("invoices").select("*").eq("id", invId).single();
        if (invData) {
          invRow = invData;
          if (!payload.totalAmount) payload.totalAmount = invData.total_amount;
          if (!payload.type) payload.type = invData.type;
        }

        const { data: posData } = await supabase
          .from("invoice_positions")
          .select("*")
          .eq("invoice_id", invId)
          .order("position_nr", { ascending: true });
        if (posData && posData.length > 0) positions = posData;
      }

      const totalAmount = Number(payload.totalAmount || invRow?.total_amount || 0);
      const recipient = payload.recipient || {
        name: invRow?.recipient_name || "Mitglied",
        vorname: "",
        nachname: invRow?.recipient_name || "",
        strasse: "",
        plz: "5037",
        ort: "Muhen",
      };
      const sender = payload.sender || {
        vorname: "",
        nachname: "",
        funktion: "Kassier",
        verein: CLUB_NAME,
        email: CLUB_EMAIL,
      };
      const layout = payload.layout || {};

      pdfBytes = await generateInvoicePdf(
        invId,
        recipient,
        sender,
        layout,
        positions,
        totalAmount,
        curYear,
        payload.type || invRow?.type || "Rechnung",
        supabase
      );

      const safeName = (recipient.nachname || recipient.firma || recipient.name || "Rechnung")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      const cleanId = invId.replace(/^RE[-_]?/i, "");
      fileName = `Rechnung_${cleanId}_${safeName}.pdf`;
      storageSubDir = `invoices/${curYear}`;
      docTitle = `Rechnung ${invId} – ${recipient.name || recipient.firma || ""}`;
    }

    // --------------------------------------------------------------------------
    // FALL 2: MIETVERTRAG GENERIEREN
    // --------------------------------------------------------------------------
    else if (action === "generate-contract" || action === "generateRentalContractPDF") {
      const bookId = payload.bookingId || payload.invoiceId || "";
      if (!bookId) throw new Error("Mietvertrags- oder Buchungs-ID ist zwingend erforderlich.");
      recordId = bookId;

      const recipient = payload.recipient || { name: "Mieter" };
      const sender = payload.sender || { vorname: "Vermietung", nachname: CLUB_NAME };
      const mietdatum = payload.mietdatum || new Date().toLocaleDateString("de-CH");
      const festbeginn = payload.festbeginn || "14:00 Uhr";
      const mietbetrag = Number(payload.mietbetrag || payload.totalAmount || 300);
      const kaution = Number(payload.kaution || 200);

      pdfBytes = await generateRentalContractPdf(
        bookId,
        recipient,
        mietdatum,
        festbeginn,
        mietbetrag,
        kaution,
        sender,
        supabase
      );

      const safeName = (recipient.nachname || recipient.firma || recipient.name || "Mieter")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      fileName = `Mietvertrag_${bookId}_${safeName}.pdf`;
      storageSubDir = `contracts/${curYear}`;
      docTitle = `Mietvertrag ${bookId} – ${recipient.name || ""}`;
    }

    // --------------------------------------------------------------------------
    // FALL 3: GENERALVERSAMMLUNGS-EINLADUNG & TERMINLISTE GENERIEREN
    // --------------------------------------------------------------------------
    else if (action === "generate-gv-invitation" || action === "generateGVInvitationPDF") {
      const year = Number(payload.year || curYear);
      const gvData = (payload as any).gvData || {};
      recordId = `GV-${year}`;

      pdfBytes = await generateGVInvitationPdf(
        year,
        gvData,
        supabase
      );

      fileName = `GV_Einladung_${year}.pdf`;
      storageSubDir = `gv/${curYear}`;
      docTitle = `Einladung zur ${gvData.gvNummer || ''}. Generalversammlung ${year}`;
    } else {
      throw new Error(`Unbekannte Aktion: ${action}`);
    }

    // --------------------------------------------------------------------------
    // WORM-ARCHIVIERUNG (OR 957ff): Existierendes Archiv prüfen
    // --------------------------------------------------------------------------
    const storageBucket = "operatives-storage";
    const archiveCategory = action.includes("contract") ? "contracts" : (action.includes("gv") ? "gv" : "invoices");
    const archivePath = `archive/${curYear}/${archiveCategory}/${recordId || "doc"}.pdf`;

    if (payload.saveToStorage !== false && !payload.forceRecreate && recordId) {
      try {
        const { data: archBlob } = await supabase.storage.from(storageBucket).download(archivePath);
        if (archBlob) {
          const archBytes = new Uint8Array(await archBlob.arrayBuffer());
          const { data: urlData } = supabase.storage.from(storageBucket).getPublicUrl(archivePath);
          const externalDomain = Deno.env.get("API_EXTERNAL_URL") || "https://supabase-muhen.danfamily.uk";
          const publicUrl = (urlData?.publicUrl || `${externalDomain}/storage/v1/object/public/${storageBucket}/${archivePath}`)
            .replace(/^http:\/\/api-gw:8000/, externalDomain);

          let pdfBase64 = "";
          try {
            let binary = "";
            const len = archBytes.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(archBytes[i]);
            }
            pdfBase64 = btoa(binary);
          } catch (_) {}

          return new Response(
            JSON.stringify({
              success: true,
              isArchived: true,
              recordId: recordId,
              pdfUrl: publicUrl,
              storagePath: archivePath,
              storageBucket: storageBucket,
              fileName: `${archiveCategory}_${recordId}.pdf`,
              fileSizeBytes: archBytes.byteLength,
              pdfBase64: pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : null,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } catch (_) {}
    }

    // --------------------------------------------------------------------------
    // UPLOAD IN SUPABASE STORAGE (Bucket: 'operatives-storage')
    // --------------------------------------------------------------------------
    const storagePath = `${storageSubDir}/${fileName}`;
    let publicUrl = "";

    const { error: uploadErr } = await supabase.storage
      .from(storageBucket)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.warn("⚠️ Storage-Upload Warnung:", uploadErr);
    }

    // WORM-Archivierung: Kopie im unveränderlichen Revisions-Archiv ablegen
    if (payload.saveToStorage !== false && recordId) {
      try {
        await supabase.storage
          .from(storageBucket)
          .upload(archivePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: false,
          });
      } catch (_) {}
    }

    // Öffentliche URL abrufen (stellt sicher, dass keine interne Docker-URL 'api-gw:8000' an Clients geliefert wird)
    const externalDomain = Deno.env.get("API_EXTERNAL_URL") || "https://supabase-muhen.danfamily.uk";
    const { data: urlData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
    publicUrl = (urlData?.publicUrl || `${externalDomain}/storage/v1/object/public/${storageBucket}/${storagePath}`)
      .replace(/^http:\/\/api-gw:8000/, externalDomain);

    // --------------------------------------------------------------------------
    // OPTIONALE PAPERLESS-NGX INTEGRATION
    // --------------------------------------------------------------------------
    let paperlessStatus = "not_applicable";
    let paperlessDocId: number | undefined = undefined;
    let paperlessError: string | undefined = undefined;

    if (payload.syncPaperless !== false && (Deno.env.get("PAPERLESS_API_URL") || Deno.env.get("PAPERLESS_API_TOKEN"))) {
      const pRes = await syncToPaperlessNgx(
        pdfBytes,
        fileName,
        docTitle,
        CLUB_NAME,
        [action.includes("contract") ? "Mietvertrag" : "Rechnung", curYear]
      );
      if (pRes.success) {
        paperlessStatus = "archived";
        paperlessDocId = pRes.documentId;
      } else {
        paperlessStatus = "error";
        paperlessError = pRes.error;
      }
    }

    // --------------------------------------------------------------------------
    // DATENBANK-UPDATE & AUDIT-LOG
    // --------------------------------------------------------------------------
    if (action.includes("invoice") || action === "generateInvoicePDF") {
      await supabase.rpc("update_invoice_pdf", {
        p_invoice_id: recordId,
        p_pdf_url: publicUrl,
        p_storage_path: storagePath,
        p_file_size: pdfBytes.byteLength,
        p_paperless_status: paperlessStatus,
        p_paperless_id: paperlessDocId || null,
      });
    } else if (action.includes("contract") || action === "generateRentalContractPDF") {
      await supabase.rpc("update_rental_contract_pdf", {
        p_booking_id: recordId,
        p_pdf_url: publicUrl,
        p_storage_path: storagePath,
        p_file_size: pdfBytes.byteLength,
        p_paperless_status: paperlessStatus,
        p_paperless_id: paperlessDocId || null,
      });
    } else if (action.includes("gv") || action === "generate-gv-invitation") {
      try {
        await supabase
          .from("gv_instances")
          .update({ doc_einladung_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("year", Number(curYear));
      } catch (_) {}
    }

    // Base64 für direkte Browser-Vorschau erzeugen
    let pdfBase64 = "";
    try {
      let binary = "";
      const len = pdfBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(pdfBytes[i]);
      }
      pdfBase64 = btoa(binary);
    } catch (_) {}

    return new Response(
      JSON.stringify({
        success: true,
        recordId: recordId,
        pdfUrl: publicUrl,
        storagePath: storagePath,
        storageBucket: storageBucket,
        fileName: fileName,
        fileSizeBytes: pdfBytes.byteLength,
        paperlessStatus: paperlessStatus,
        paperlessDocId: paperlessDocId,
        paperlessError: paperlessError,
        pdfBase64: pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ PDF-Generierungsfehler:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
