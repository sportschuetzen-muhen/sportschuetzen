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
const CLUB_STREET = "Schiessanlage Rüteli";
const CLUB_ZIP = "5037";
const CLUB_CITY = "Muhen";
const CLUB_COUNTRY = "CH";
const CLUB_EMAIL = "sportschuetzen.muhen@gmail.com";
const CLUB_WEBSITE = "www.sportschuetzen-muhen.ch";

// Schweizer Tausendertrennzeichen (Apostroph: 2'280.00)
function formatSwissChf(num: number | string | null | undefined): string {
  const n = Number(num || 0);
  const parts = n.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return parts.join(".");
}

// mm zu PDF-Points (72 pt pro Inch = 72 / 25.4 pt/mm)
const MM = 72 / 25.4;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

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
  bereich?: string;
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
  action?: string; // 'generate-invoice' | 'generateInvoicePDF' | 'generate-contract' | 'generateRentalContractPDF' | 'generate-swiss-qr' | 'generate-gv-invitation' | 'compile-gv-dossier' | 'generate-letter' | 'generateLetterPDF'
  invoiceId?: string;
  bookingId?: string;
  campaignId?: string;
  campaignRecipientId?: string;
  letterId?: string;
  subject?: string;
  bodyText?: string;
  letterDate?: string;
  signers?: Array<{ name: string; role: string }>;
  gvData?: any;
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
  forceRecreate?: boolean;
}

// Hilfsfunktion: Empfänger-Daten universell normalisieren (deutsche & englische Keys)
function normalizeRecipient(r: any): RecipientData {
  if (!r) return { name: "Mitglied" };
  const vorname = (r.vorname || r.first_name || r.firstName || "").trim();
  const nachname = (r.nachname || r.last_name || r.lastName || "").trim();
  let name = (r.name || "").trim();
  if (!name && (vorname || nachname)) {
    name = [vorname, nachname].filter(Boolean).join(" ");
  }

  const anrede = (r.anrede || r.salutation || "").trim();
  const strasse = (r.strasse || r.street || r.adresse || "").trim();
  const plz = String(r.plz || r.zip || r.post_code || r.postCode || "").trim();
  const ort = (r.ort || r.city || "").trim();
  let firma = (r.firma || "").trim();
  const abteilung = (r.abteilung || r.zusatz || "").trim();
  const email = (r.email || r.mail || r.primary_email || "").trim();
  const telefon = (r.telefon || r.phone || r.mobil || "").trim();
  const land = (r.land || r.country || "Schweiz").trim();
  let typ = (r.typ || r.type || (firma ? "firma" : "privat")).trim().toLowerCase();

  // Schutz gegen versehentlich als Firma gesetzte Personennamen
  if (typ === "privat" || typ === "mitglied") {
    firma = "";
  } else if (firma) {
    const fnLn = `${vorname} ${nachname}`.trim().toLowerCase();
    const lnFn = `${nachname} ${vorname}`.trim().toLowerCase();
    const fLower = firma.trim().toLowerCase();
    const nLower = name.trim().toLowerCase();
    if (fLower === fnLn || fLower === lnFn || fLower === nLower) {
      firma = "";
      typ = "privat";
    }
  }

  return {
    vorname,
    nachname,
    name: name || [vorname, nachname].filter(Boolean).join(" ") || firma || "Mitglied",
    firma,
    abteilung,
    anrede,
    strasse,
    plz,
    ort,
    land,
    email,
    telefon,
    typ,
  };
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
  const pName = [recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || recipient.name || "";
  const isComp = Boolean(recipient.firma && recipient.typ !== "privat" && recipient.typ !== "mitglied");

  if (isComp) {
    debtorLines.push(sanitizeText(recipient.firma!));
    if (pName && pName.toLowerCase() !== recipient.firma!.toLowerCase() && debtorLines.length < 2) {
      debtorLines.push(sanitizeText(pName));
    }
  } else if (pName) {
    debtorLines.push(sanitizeText(pName));
  }

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
  const normRecipient = normalizeRecipient(recipient);
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 0. Server-Side Resolution: Vorlage aus document_templates nachladen
  let resolvedLayout: LayoutData = { ...layout };
  if (supabaseClient) {
    try {
      let typeKey = (docType || "jahresbeitrag").toLowerCase().trim();
      if (typeKey === "depot / pfand" || typeKey === "depot/pfand" || typeKey === "depot" || typeKey === "pfand" || typeKey === "kaution" || typeKey === "depot & kaution") {
        typeKey = "depot_pfand";
      } else if (typeKey === "material- & kleiderbezug" || typeKey === "material" || typeKey === "kleiderverkauf") {
        typeKey = "materialverkauf";
      }
      let { data: tmpl } = await supabaseClient
        .from("document_templates")
        .select("*")
        .or(`code.eq.${typeKey},id.eq.${typeKey}`)
        .limit(1)
        .maybeSingle();

      if (!tmpl) {
        const { data: tmplCat } = await supabaseClient
          .from("document_templates")
          .select("*")
          .eq("category", typeKey)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();
        tmpl = tmplCat;
      }

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
    normRecipient.typ === "firma" ||
    Boolean(normRecipient.firma) ||
    Boolean(normRecipient.name && normRecipient.name.match(/\b(AG|GmbH|Genossenschaft|Verein|Verband|Stiftung|Gemeinde)\b/i));

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

  // Koordinaten für Spalten
  const xPos = tblX + 2 * MM;
  const xDesc = tblX + colW.pos + 2 * MM;
  const xQty = tblX + colW.pos + colW.desc + 2 * MM;
  const xPriceRight = tblX + colW.pos + colW.desc + colW.qty + colW.price - 2 * MM;
  const xTotalRight = tblX + tblW - 2 * MM;

  // Hilfsfunktion: Tabellenkopf zeichnen (schlichte Linien nach Referenz-Layout)
  const drawTableHeader = (p: any, y: number) => {
    p.drawLine({
      start: { x: tblX, y: y + 2 * MM },
      end: { x: tblX + tblW, y: y + 2 * MM },
      thickness: 0.8,
      color: rgb(0.1, 0.1, 0.1),
    });

    p.drawText("Pos", { x: xPos, y: y - 2 * MM, size: 8, font: fontBold, color: rgb(0, 0, 0) });
    p.drawText("Beschreibung", { x: xDesc, y: y - 2 * MM, size: 8, font: fontBold, color: rgb(0, 0, 0) });
    p.drawText("Menge", { x: xQty, y: y - 2 * MM, size: 8, font: fontBold, color: rgb(0, 0, 0) });

    const priceHdr = "Einzelpreis";
    const totalHdr = "Preis (CHF)";
    p.drawText(priceHdr, { x: xPriceRight - fontBold.widthOfTextAtSize(priceHdr, 8), y: y - 2 * MM, size: 8, font: fontBold, color: rgb(0, 0, 0) });
    p.drawText(totalHdr, { x: xTotalRight - fontBold.widthOfTextAtSize(totalHdr, 8), y: y - 2 * MM, size: 8, font: fontBold, color: rgb(0, 0, 0) });

    p.drawLine({
      start: { x: tblX, y: y - 4 * MM },
      end: { x: tblX + tblW, y: y - 4 * MM },
      thickness: 0.6,
      color: rgb(0.2, 0.2, 0.2),
    });

    return y - 8 * MM;
  };

  // Hilfsfunktion: Tabellenzeile zeichnen
  const drawTableRow = (p: any, row: PreparedRow, _idx: number, y: number) => {
    // Pos.-Nummer
    p.drawText(row.posNr, { x: xPos, y, size: 8.5, font: fontRegular });

    // Beschreibung (mehrzeilig gerendert)
    row.lines.forEach((line, lIdx) => {
      p.drawText(sanitizeText(line), {
        x: xDesc,
        y: y - (lIdx * 3.8 * MM),
        size: 8.5,
        font: fontRegular,
      });
    });

    // Menge, Ansatz, Betrag auf erster Zeile mit Tabellenziffern
    p.drawText(row.qtyStr, { x: xQty, y, size: 8.5, font: fontRegular });
    p.drawText(row.unitStr, { x: xPriceRight - fontRegular.widthOfTextAtSize(row.unitStr, 8.5), y, size: 8.5, font: fontRegular });
    p.drawText(row.totalStr, { x: xTotalRight - fontRegular.widthOfTextAtSize(row.totalStr, 8.5), y, size: 8.5, font: fontRegular });

    return y - row.rowHeight;
  };

  // Hilfsfunktion: Summenzeile, Zahlungsfrist & Grussformel (Referenz-Design)
  const drawTotalsAndFooter = (p: any, y: number) => {
    p.drawLine({
      start: { x: tblX, y: y + 1 * MM },
      end: { x: tblX + tblW, y: y + 1 * MM },
      thickness: 0.8,
      color: rgb(0.1, 0.1, 0.1),
    });

    // "Total" bündig links (wie Pos-Spalte)
    p.drawText("Total", { x: xPos, y: y - 3.5 * MM, size: 9.5, font: fontBold });

    // Betrag exakt rechtsbündig unter Spalte Preis (CHF)
    const totalAmountStr = formatSwissChf(totalAmount);
    const totalW = fontBold.widthOfTextAtSize(totalAmountStr, 10);
    p.drawText(totalAmountStr, { x: xTotalRight - totalW, y: y - 3.5 * MM, size: 10, font: fontBold });

    p.drawLine({
      start: { x: tblX, y: y - 6 * MM },
      end: { x: tblX + tblW, y: y - 6 * MM },
      thickness: 1.0,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= 12 * MM;

    // Outro / Notiz mit vollständiger Variablen-Ersetzung und automatischem Umbruch
    const senderFullName = [sender.vorname, sender.nachname].filter(Boolean).join(" ") || CLUB_NAME;
    const senderRole = sender.funktion || sender.bereich || "Vorstand";

    const noticeDefault = "Bei allfälligen Fragen bitte bei mir melden.\nVielen Dank für das Vertrauen.";
    const noticeRaw = (resolvedLayout.outro || resolvedLayout.notice || noticeDefault)
      .replace(/{rechnungsnummer}/g, invoiceId)
      .replace(/{rechnungsjahr}/g, yearStr)
      .replace(/{anrede}/g, normRecipient.anrede || "")
      .replace(/{vorname}/g, normRecipient.vorname || "")
      .replace(/{nachname}/g, normRecipient.nachname || "")
      .replace(/{gesamtbetrag}/g, formatSwissChf(totalAmount))
      .replace(/{absender_vorname}/g, sender.vorname || "")
      .replace(/{absender_nachname}/g, sender.nachname || "")
      .replace(/{absender_funktion}/g, senderRole)
      .replace(/{absender_email}/g, sender.email || "")
      .replace(/{absender_mobil}/g, sender.mobil || "");

    const noticeLines = noticeRaw.split("\n");
    noticeLines.forEach((nl: string) => {
      const trimmed = nl.trim();
      if (!trimmed) {
        y -= 3.2 * MM;
      } else {
        const wrapped = wrapText(trimmed, fontRegular, 9, 170 * MM);
        wrapped.forEach((wl) => {
          p.drawText(sanitizeText(wl), { x: 20 * MM, y, size: 9, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
          y -= 4.2 * MM;
        });
      }
    });

    // Grusszeile & Signatur nur anhängen, wenn im Outro nicht bereits eine Grussformel enthalten ist
    const hasGreetingInOutro = /freundliche gr[üu]sse|beste gr[üu]sse|sportliche gr[üu]sse/i.test(noticeRaw);
    if (!hasGreetingInOutro) {
      y -= 3.5 * MM;
      p.drawText("Mit besten Grüssen", { x: 20 * MM, y, size: 9, font: fontRegular });
      y -= 4.8 * MM;
      p.drawText(CLUB_NAME, { x: 20 * MM, y, size: 9.5, font: fontBold });
      y -= 7.5 * MM;
      p.drawText(sanitizeText(senderFullName), { x: 20 * MM, y, size: 9, font: fontRegular });
      y -= 4.0 * MM;
      p.drawText(sanitizeText(senderRole), { x: 20 * MM, y, size: 9, font: fontRegular });
    }

    return y - 4 * MM;
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

  // Hilfsfunktion: Juristischer Vereins-Footer (nur auf Inhaltsseiten, zentriert)
  const drawClubLegalFooter = (p: any, yPos: number = 12 * MM) => {
    p.drawLine({
      start: { x: 20 * MM, y: yPos + 3 * MM },
      end: { x: 190 * MM, y: yPos + 3 * MM },
      thickness: 0.3,
      color: rgb(0.75, 0.75, 0.75),
    });
    const footerStr = "Sportschützen Muhen · sportschützen.muhen@gmail.com · www.sportschuetzen-muhen.ch";
    const strW = fontRegular.widthOfTextAtSize(footerStr, 7.5);
    p.drawText(footerStr, {
      x: (A4_WIDTH - strW) / 2,
      y: yPos,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
  };

  // ============================================================================
  // SEITE 1: RECHNUNGSINHALT (KOPF, ADRESSEN, TABELLE, TOTAL & SIGNATUR)
  // ============================================================================
  let currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  // 1. Logo oben links + zweizeiliger Vereinskopf daneben (harmonisiert: weiter links oben, 14pt)
  let textStartX = 15 * MM;
  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(32 * MM, 32 * MM);
    currentPage.drawImage(logoImage, {
      x: 15 * MM,
      y: 291 * MM - scaledLogo.height,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
    textStartX = 15 * MM + scaledLogo.width + 3.5 * MM;
  }
  currentPage.drawText(CLUB_NAME.toUpperCase(), {
    x: textStartX,
    y: 281.5 * MM,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  currentPage.drawText("gegründet 1919 · Schiessanlage Rüteli", {
    x: textStartX,
    y: 275.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  // 2. Absenderblock links unter dem Logo (ab ca. 246 mm) - Nur Funktion ohne 'Sportschützen Muhen'
  let sendY = 246 * MM;
  const senderRole = sender.funktion || sender.bereich || "Vorstand";
  currentPage.drawText(sanitizeText(senderRole), { x: 20 * MM, y: sendY, size: 9.5, font: fontBold });
  sendY -= 4.2 * MM;

  const senderNameStr = [sender.vorname, sender.nachname].filter(Boolean).join(" ");
  if (senderNameStr) {
    currentPage.drawText(sanitizeText(senderNameStr), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  if (sender.strasse) {
    currentPage.drawText(sanitizeText(sender.strasse), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  const senderPlzOrt = `${sender.plz || ""} ${sender.ort || ""}`.trim();
  if (senderPlzOrt) {
    currentPage.drawText(sanitizeText(senderPlzOrt), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  if (sender.mobil) {
    currentPage.drawText(sanitizeText(`Mobil ${sender.mobil}`), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  if (sender.email) {
    currentPage.drawText(sanitizeText(sender.email), {
      x: 20 * MM,
      y: sendY,
      size: 9,
      font: fontRegular,
      color: rgb(0.08, 0.35, 0.75), // Vereinsblau für Mail
    });
    sendY -= 4.0 * MM;
  }

  // Datum & Zahlbar bis unter dem Absender
  sendY -= 3 * MM;
  currentPage.drawText(`Datum:`, { x: 20 * MM, y: sendY, size: 8.5, font: fontRegular });
  currentPage.drawText(dateStr, { x: 44 * MM, y: sendY, size: 8.5, font: fontRegular });
  sendY -= 4.0 * MM;

  const dueDays = 30;
  const dueDateObj = new Date();
  dueDateObj.setDate(dueDateObj.getDate() + dueDays);
  const dueDateStr = dueDateObj.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

  currentPage.drawText(`Zahlbar bis:`, { x: 20 * MM, y: sendY, size: 8.5, font: fontRegular });
  currentPage.drawText(dueDateStr, { x: 44 * MM, y: sendY, size: 8.5, font: fontRegular });

  // 3. Empfänger-Adresse (DIN 5008 Fenster rechts, ab 246 mm)
  let addrY = 246 * MM;
  const isCompany = Boolean(normRecipient.firma && normRecipient.typ !== 'privat' && normRecipient.typ !== 'mitglied');
  const fullRecName = [normRecipient.vorname, normRecipient.nachname].filter(Boolean).join(" ").trim() || (normRecipient.name || "");

  if (isCompany) {
    // 1. Firmenname (Fett)
    currentPage.drawText(sanitizeText(normRecipient.firma!), { x: 125 * MM, y: addrY, size: 9.5, font: fontBold });
    addrY -= 4.2 * MM;

    // 2. Abteilung (falls vorhanden)
    if (normRecipient.abteilung || (normRecipient as any).zusatz) {
      currentPage.drawText(sanitizeText(normRecipient.abteilung || (normRecipient as any).zusatz), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
      addrY -= 4.2 * MM;
    }

    // 3. Ansprechperson mit Anrede (falls vorhanden und weicht von Firma ab)
    const contactPerson = [normRecipient.anrede, normRecipient.vorname, normRecipient.nachname].filter(Boolean).join(" ").trim();
    if (contactPerson && contactPerson.toLowerCase() !== normRecipient.firma!.toLowerCase()) {
      currentPage.drawText(sanitizeText(contactPerson), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
      addrY -= 4.2 * MM;
    }
  } else {
    // PRIVATPERSON / VEREINSMITGLIED
    // 1. Anrede (Herr / Frau)
    if (normRecipient.anrede) {
      currentPage.drawText(sanitizeText(normRecipient.anrede), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
      addrY -= 4.2 * MM;
    }

    // 2. Vorname Nachname (Normalschrift, KEIN Fett)
    if (fullRecName) {
      currentPage.drawText(sanitizeText(fullRecName), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
      addrY -= 4.2 * MM;
    }

    // 3. Adresszusatz / Postfach (falls vorhanden)
    if (normRecipient.abteilung || (normRecipient as any).zusatz || (normRecipient as any).adresszusatz) {
      currentPage.drawText(sanitizeText(normRecipient.abteilung || (normRecipient as any).zusatz || (normRecipient as any).adresszusatz), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
      addrY -= 4.2 * MM;
    }
  }

  // 4. Strasse
  if (normRecipient.strasse) {
    currentPage.drawText(sanitizeText(normRecipient.strasse), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
    addrY -= 4.2 * MM;
  }
  const plzOrt = `${normRecipient.plz || ""} ${normRecipient.ort || ""}`.trim();
  if (plzOrt) {
    currentPage.drawText(sanitizeText(plzOrt), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
    addrY -= 4.2 * MM;
  }
  if (normRecipient.land && normRecipient.land !== "CH" && normRecipient.land !== "Schweiz") {
    currentPage.drawText(sanitizeText(normRecipient.land), { x: 125 * MM, y: addrY, size: 9.5, font: fontRegular });
    addrY -= 4.2 * MM;
  }

  // 4. Rechnungstitel (H1, linksbündig ab ca. 195 mm) - Rechnungsnummer zwingend enthalten
  const rawTitle = resolvedLayout.title || `${docType || "Rechnung"}`;
  let finalTitle = rawTitle
    .replace(/{rechnungsnummer}/g, invoiceId)
    .replace(/{rechnungsjahr}/g, yearStr);
  if (!finalTitle.includes(invoiceId)) {
    const cleanDocTitle = finalTitle.replace(/^Rechnung\s*[-–]?\s*/i, "").trim();
    finalTitle = `Rechnung ${invoiceId} – ${cleanDocTitle || docType || "Materialverkauf"}`;
  }
  currentPage.drawText(sanitizeText(finalTitle), {
    x: 20 * MM,
    y: 195 * MM,
    size: 13.5,
    font: fontBold,
    color: rgb(0.05, 0.05, 0.05),
  });

  // 5. Einleitung (ab ca. 182 mm) mit Absätzen und automatischem Zeilenumbruch
  let curY = 182 * MM;

  let introRaw = (resolvedLayout.intro || "Anbei erhalten Sie die Rechnung.")
    .replace(/{rechnungsnummer}/g, invoiceId)
    .replace(/{rechnungsjahr}/g, yearStr)
    .replace(/{anrede}/g, normRecipient.anrede || "")
    .replace(/{vorname}/g, normRecipient.vorname || "")
    .replace(/{nachname}/g, normRecipient.nachname || "")
    .replace(/{gesamtbetrag}/g, formatSwissChf(totalAmount))
    .replace(/{absender_vorname}/g, sender.vorname || "")
    .replace(/{absender_nachname}/g, sender.nachname || "")
    .replace(/{absender_funktion}/g, senderRole)
    .replace(/{absender_email}/g, sender.email || "")
    .replace(/{absender_mobil}/g, sender.mobil || "");

  const introLines = introRaw.split("\n");
  introLines.forEach((l) => {
    const trimmed = l.trim();
    if (!trimmed) {
      curY -= 3.5 * MM;
    } else {
      const wrapped = wrapText(trimmed, fontRegular, 9.5, 170 * MM);
      wrapped.forEach((wl) => {
        currentPage.drawText(sanitizeText(wl), { x: 20 * MM, y: curY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
        curY -= 4.5 * MM;
      });
    }
  });

  curY -= 3.5 * MM;

  // 6. Tabelle der Rechnungspositionen
  curY = drawTableHeader(currentPage, curY);

  let rowIndex = 0;
  while (rowIndex < preparedRows.length) {
    const nextRow = preparedRows[rowIndex];
    // Falls die Zeile unter 28mm fallen würde, neue Inhaltsseite anlegen
    if (curY - nextRow.rowHeight < 28 * MM) {
      drawClubLegalFooter(currentPage, 12 * MM);
      currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      curY = renderFollowUpHeader(currentPage);
      curY = drawTableHeader(currentPage, curY);
    }
    curY = drawTableRow(currentPage, nextRow, rowIndex, curY);
    rowIndex++;
  }

  // Totals & Grusszeile zeichnen (falls nicht genug Platz auf aktueller Inhaltsseite, Folgeseite anlegen)
  if (curY - TOTALS_FOOTER_HEIGHT < 28 * MM) {
    drawClubLegalFooter(currentPage, 12 * MM);
    currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    curY = renderFollowUpHeader(currentPage);
  }
  drawTotalsAndFooter(currentPage, curY);
  drawClubLegalFooter(currentPage, 12 * MM);

  // ============================================================================
  // FINALE SEITE: DEDIZIERTER SCHWEIZER QR-ZAHLTEIL (ES ALLEIN AUF SEITE)
  // ============================================================================
  const qrPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  renderFollowUpHeader(qrPage);

  // Belegbezugs-Kopf oberhalb des Zahlteils
  qrPage.drawText(`Zahlteil & Beleg zu Rechnung: ${invoiceId}`, {
    x: 20 * MM,
    y: 258 * MM,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  const recSummary = [recipient.anrede, recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || recipient.firma || recipient.name || "Rechnungsempfänger";
  qrPage.drawText(sanitizeWinAnsiText(`Rechnungsempfänger: ${recSummary}   |   Rechnungsbetrag: CHF ${formatSwissChf(totalAmount)}   |   Zahlbar bis: ${dueDateStr}`), {
    x: 20 * MM,
    y: 252 * MM,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  // Schweizer QR-Zahlteil (SIX SPC 0200 1) auf den unteren 105 mm (kein Footer auf dieser Seite!)
  drawSwissQrBillSection(qrPage, fontRegular, fontBold, invoiceId, totalAmount, recipient, yearStr, docType);

  // ============================================================================
  // SEITENNUMMERIERUNG & FORTSETZUNGSHINWEISE
  // ============================================================================
  const totalPages = pdfDoc.getPageCount();
  const allPages = pdfDoc.getPages();
  allPages.forEach((p, idx) => {
    const pageNum = idx + 1;
    const isQrPage = (pageNum === totalPages);

    if (isQrPage) {
      // Auf der QR-Seite: Stempel leicht oberhalb der Trennlinie des ES bei 108.5 mm
      p.drawText(`Seite ${pageNum} von ${totalPages}`, {
        x: 175 * MM,
        y: 108.5 * MM,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      });
    } else {
      // Auf Inhaltsseiten: Fortsetzungshinweis und Seitenzahl bei Y = 17 mm
      p.drawText("Fortsetzung mit QR-Zahlteil auf der nächsten Seite...", {
        x: 20 * MM,
        y: 17 * MM,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      });
      p.drawText(`Seite ${pageNum} von ${totalPages}`, {
        x: 175 * MM,
        y: 17 * MM,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      });
    }
  });

  return await pdfDoc.save();
}

// Erstellt das Mietvertrags-PDF inkl. dynamischer Benützungsordnung (mehrseitig), Übergabeprotokoll und Schweizer QR-Rechnung auf separater Schlussseite
async function generateRentalContractPdf(
  bookingId: string,
  recipient: RecipientData,
  mietdatum: string,
  festbeginn: string,
  mietbetrag: number,
  kaution: number,
  sender: SenderData,
  supabaseClient?: any,
  layoutData?: any,
  templateId?: string
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
  let templateTitle = layoutData?.title || "Mietvertrag & Benützungsreglement Schützenstube";
  let templateNotice = layoutData?.notice || "Zahlbar innert 14 Tagen mit beiliegendem QR-Einzahlungsschein.";

  if (supabaseClient) {
    try {
      let tQuery = supabaseClient.from("document_templates").select("*");
      if (templateId) {
        tQuery = tQuery.eq("id", templateId);
      } else {
        tQuery = tQuery.or("code.eq.mietvertrag,id.eq.mietvertrag_rueteli,category.eq.vertrag");
      }
      const { data: tData } = await tQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tData) {
        if (!layoutData?.title && tData.title) templateTitle = tData.title;
        if (!layoutData?.notice && tData.notice) templateNotice = tData.notice;

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

  // STRIKTER BETRIEBS-CHECK: Keine stillen Fallbacks bei fehlenden Klauseln!
  if (!clauses || clauses.length === 0) {
    throw new Error(
      "Konfigurationsfehler: In Supabase wurden keine Klauseln für den Mietvertrag gefunden (Tabelle 'document_template_clauses'). Bitte im Modul 'Dokumente-Vorlagen' hinterlegen."
    );
  }

  // ============================================================================
  // SEITE 1: KOPFDATEN, PARTEIEN, MIETOBJEKT & KONDITIONEN
  // ============================================================================
  const page1 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let currentPage = page1;

  let textStartX = 15 * MM;
  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(32 * MM, 32 * MM);
    page1.drawImage(logoImage, {
      x: 15 * MM,
      y: 291 * MM - scaledLogo.height,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
    textStartX = 15 * MM + scaledLogo.width + 3.5 * MM;
  }

  page1.drawText(CLUB_NAME.toUpperCase(), {
    x: textStartX,
    y: 281.5 * MM,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  page1.drawText("gegründet 1919 · Schiessanlage Rüteli, 5037 Muhen", {
    x: textStartX,
    y: 275.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  page1.drawText(`${sanitizeWinAnsiText(templateTitle)}: ${bookingId}`, {
    x: 20 * MM,
    y: 257 * MM,
    size: 12.5,
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
  page1.drawText(`Mietgebühr: CHF ${mietbetrag.toFixed(2)}   |   Kaution (Depot bar): CHF ${kaution.toFixed(2)}`, {
    x: 50 * MM,
    y: curY,
    size: 9,
    font: fontBold,
  });
  curY -= 7.5 * MM;

  // Trennlinie
  page1.drawLine({ start: { x: 20 * MM, y: curY }, end: { x: 190 * MM, y: curY }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  curY -= 5.5 * MM;

  page1.drawText("Benützungsordnung & Vereinbarungen:", { x: 20 * MM, y: curY, size: 9.5, font: fontBold, color: rgb(0.12, 0.23, 0.54) });
  curY -= 5.5 * MM;

  // HILFSFUNKTION FÜR MEHRSEITIGEN VERTRAGSFLUSS
  function addNewContractPage(): any {
    const newPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    newPage.drawText(sanitizeWinAnsiText(`${CLUB_NAME} · Mietvertrag & Benützungsreglement ${bookingId} (Fortsetzung)`), {
      x: 20 * MM,
      y: 278 * MM,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.55),
    });
    newPage.drawLine({
      start: { x: 20 * MM, y: 274 * MM },
      end: { x: 190 * MM, y: 274 * MM },
      thickness: 0.3,
      color: rgb(0.7, 0.7, 0.7),
    });
    currentPage = newPage;
    curY = 265 * MM;
    return newPage;
  }

  // DYNAMISCHE KLAUSELN FLIESSEND RENDERN
  clauses.forEach((c, idx) => {
    const num = c.clause_number || String(idx + 1);
    const titleText = `${num}. ${sanitizeWinAnsiText(c.clause_title)}:`;
    const lines = wrapText(c.clause_text || "", fontRegular, 8, 170 * MM);
    const neededHeight = 4.5 * MM + (lines.length * 3.8 * MM) + 3 * MM;

    // Falls auf aktueller Seite nicht genügend Platz, neue Seite anlegen
    if (curY - neededHeight < 22 * MM) {
      currentPage.drawText("Fortsetzung der Bestimmungen auf nächster Seite...", {
        x: 20 * MM,
        y: 14 * MM,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      });
      addNewContractPage();
    }

    currentPage.drawText(titleText, { x: 20 * MM, y: curY, size: 8.5, font: fontBold });
    curY -= 4 * MM;
    lines.forEach(l => {
      currentPage.drawText(sanitizeWinAnsiText(l), { x: 24 * MM, y: curY, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
      curY -= 3.8 * MM;
    });
    curY -= 2.5 * MM;
  });

  // ÜBERGABEPROTOKOLL & UNTERSCHRIFTEN
  // Benötigter Platz: ca. 45 mm
  if (curY - 45 * MM < 22 * MM) {
    currentPage.drawText("Fortsetzung mit Übergabeprotokoll und Unterschriften auf nächster Seite...", {
      x: 20 * MM,
      y: 14 * MM,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
    addNewContractPage();
  }

  curY -= 2 * MM;

  // Checkliste / Übergabeprotokoll-Kästchen
  currentPage.drawRectangle({
    x: 20 * MM,
    y: curY - 14 * MM,
    width: 170 * MM,
    height: 14 * MM,
    color: rgb(0.96, 0.97, 0.99),
  });
  currentPage.drawText("Übergabe- und Rücknahmeprotokoll:", { x: 23 * MM, y: curY - 3.5 * MM, size: 8, font: fontBold, color: rgb(0.1, 0.15, 0.3) });
  currentPage.drawText("[  ] Raum & Mobiliar intakt      [  ] Küche & Geschirr gereinigt      [  ] Abfall entsorgt      [  ] Schlüssel zurück", {
    x: 23 * MM,
    y: curY - 9 * MM,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });
  curY -= 18 * MM;

  // Unterschriften
  const dateStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  currentPage.drawText(`Muhen, den ${dateStr}`, { x: 20 * MM, y: curY, size: 8, font: fontRegular });
  curY -= 4.5 * MM;

  currentPage.drawText("Für den Verein: Sportschützen Muhen", { x: 20 * MM, y: curY, size: 8, font: fontBold });
  currentPage.drawText("Der Mieter (gelesen & akzeptiert):", { x: 110 * MM, y: curY, size: 8, font: fontBold });

  curY -= 9 * MM;
  currentPage.drawLine({ start: { x: 20 * MM, y: curY }, end: { x: 80 * MM, y: curY }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  currentPage.drawLine({ start: { x: 110 * MM, y: curY }, end: { x: 180 * MM, y: curY }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });

  // ============================================================================
  // SEPARATE SCHLUSS-SEITE: ABRECHNUNG & SCHWEIZER QR-EINZAHLUNGSSCHEIN
  // ============================================================================
  const qrPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let qrTopY = 280 * MM;

  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(28 * MM, 28 * MM);
    qrPage.drawImage(logoImage, {
      x: 20 * MM,
      y: qrTopY - scaledLogo.height + 2 * MM,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
  }

  qrPage.drawText(CLUB_NAME.toUpperCase(), {
    x: 55 * MM,
    y: qrTopY,
    size: 13,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  qrPage.drawText("gegründet 1919 · Schiessanlage Rüteli, 5037 Muhen", {
    x: 55 * MM,
    y: qrTopY - 5 * MM,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  qrTopY -= 17 * MM;
  qrPage.drawText("Abrechnung & Schweizer QR-Einzahlungsschein", {
    x: 20 * MM,
    y: qrTopY,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  qrTopY -= 6 * MM;

  // Übersichtliche Abrechnungsbox
  const boxHeight = 78 * MM;
  qrPage.drawRectangle({
    x: 20 * MM,
    y: qrTopY - boxHeight,
    width: 170 * MM,
    height: boxHeight,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.82, 0.85, 0.9),
    borderWidth: 0.5,
  });

  let boxY = qrTopY - 7 * MM;
  qrPage.drawText("Buchungs- & Abrechnungsdetails:", { x: 25 * MM, y: boxY, size: 9, font: fontBold, color: rgb(0.12, 0.23, 0.54) });
  boxY -= 6 * MM;

  qrPage.drawText("Vertrags-/Rechnungs-Nr.:", { x: 25 * MM, y: boxY, size: 8.5, font: fontBold });
  qrPage.drawText(bookingId, { x: 75 * MM, y: boxY, size: 8.5, font: fontRegular });
  boxY -= 5 * MM;

  qrPage.drawText("Mieter / Rechnungsempfänger:", { x: 25 * MM, y: boxY, size: 8.5, font: fontBold });
  qrPage.drawText(sanitizeWinAnsiText(mieterName), { x: 75 * MM, y: boxY, size: 8.5, font: fontRegular });
  boxY -= 5 * MM;

  qrPage.drawText("Adresse:", { x: 25 * MM, y: boxY, size: 8.5, font: fontBold });
  qrPage.drawText(sanitizeWinAnsiText(`${recipient.strasse || "–"}, ${recipient.plz || ""} ${recipient.ort || ""}`), { x: 75 * MM, y: boxY, size: 8.5, font: fontRegular });
  boxY -= 5 * MM;

  qrPage.drawText("Mietdatum / Anlass:", { x: 25 * MM, y: boxY, size: 8.5, font: fontBold });
  qrPage.drawText(`${mietdatum} (Festbeginn: ${festbeginn || "Nach Vereinbarung"})`, { x: 75 * MM, y: boxY, size: 8.5, font: fontRegular });
  boxY -= 5 * MM;

  qrPage.drawText("Mietgebühr Schützenstube:", { x: 25 * MM, y: boxY, size: 8.5, font: fontBold });
  qrPage.drawText(`CHF ${mietbetrag.toFixed(2)}`, { x: 75 * MM, y: boxY, size: 8.5, font: fontBold, color: rgb(0.12, 0.23, 0.54) });
  boxY -= 5 * MM;

  qrPage.drawText("Kaution (Depot bar vor Ort):", { x: 25 * MM, y: boxY, size: 8.5, font: fontBold });
  qrPage.drawText(`CHF ${kaution.toFixed(2)}`, { x: 75 * MM, y: boxY, size: 8.5, font: fontRegular });
  boxY -= 6 * MM;

  qrPage.drawText("Zahlungsziel:", { x: 25 * MM, y: boxY, size: 8.5, font: fontBold });
  qrPage.drawText("Innert 14 Tagen nach Erhalt des Mietvertrags", { x: 75 * MM, y: boxY, size: 8.5, font: fontRegular });
  boxY -= 7 * MM;

  qrPage.drawText("Wichtiger Hinweis:", { x: 25 * MM, y: boxY, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  qrPage.drawText("Bitte verwenden Sie für die Zahlung ausschliesslich den untenstehenden QR-Einzahlungsschein.", { x: 55 * MM, y: boxY, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  boxY -= 4 * MM;
  qrPage.drawText("Mit fristgerechter Bezahlung gilt die Reservation als definitiv abgeschlossen.", { x: 55 * MM, y: boxY, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  // Schweizer QR-Zahlteil auf der letzten Seite (105mm am unteren Rand)
  drawSwissQrBillSection(qrPage, fontRegular, fontBold, bookingId, mietbetrag, recipient, curYear, "Mietvertrag Schützenstube");

  // ============================================================================
  // SEITENNUMMERIERUNG ÜBER ALLE SEITEN (2-PASS)
  // ============================================================================
  const allDocPages = pdfDoc.getPages();
  const totalPagesCount = allDocPages.length;
  for (let i = 0; i < totalPagesCount; i++) {
    const p = allDocPages[i];
    const isFinalQrPage = (i === totalPagesCount - 1);
    const pageNumY = isFinalQrPage ? 108.5 * MM : 12 * MM;
    p.drawText(`Seite ${i + 1} von ${totalPagesCount}`, {
      x: 175 * MM,
      y: pageNumY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

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
  let textStartX = 15 * MM;
  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(32 * MM, 32 * MM);
    page1.drawImage(logoImage, {
      x: 15 * MM,
      y: 291 * MM - scaledLogo.height,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
    textStartX = 15 * MM + scaledLogo.width + 3.5 * MM;
  }

  page1.drawText(CLUB_NAME.toUpperCase(), {
    x: textStartX,
    y: 281.5 * MM,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  page1.drawText("gegründet 1919 · Schiessanlage Rüteli", {
    x: textStartX,
    y: 275.5 * MM,
    size: 9,
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

// ==============================================================================
// TYP 2: OFFIZIELLER VORSTANDSBRIEF (DIN 5008 FENSTER RECHTS)
// ==============================================================================
async function generateLetterPdf(
  docId: string,
  recipient: RecipientData,
  sender: SenderData,
  layout: LayoutData,
  subject: string,
  content: string,
  signers?: Array<{ name: string; role: string }>,
  letterDate?: string,
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

  // 2. Datum
  const dateStr = letterDate || new Date().toLocaleDateString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // 3. Betreff & Bereinigung
  const docSubject = subject || layout.title || "Mitteilung";

  // Hilfsfunktion: Folgeseiten-Header mit Dokument-Metadaten
  const renderFollowUpHeader = (p: any, pageNum: number) => {
    p.drawLine({
      start: { x: 20 * MM, y: 278 * MM },
      end: { x: 190 * MM, y: 278 * MM },
      thickness: 0.3,
      color: rgb(0.75, 0.75, 0.75),
    });

    p.drawText(`${CLUB_NAME} · ${sanitizeWinAnsiText(docSubject)}`, {
      x: 20 * MM,
      y: 280.5 * MM,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.55),
    });

    return 265 * MM;
  };

  // Hilfsfunktion: Juristischer Vereins-Footer ganz unten
  const drawClubLegalFooter = (p: any) => {
    p.drawLine({
      start: { x: 20 * MM, y: 15 * MM },
      end: { x: 190 * MM, y: 15 * MM },
      thickness: 0.3,
      color: rgb(0.75, 0.75, 0.75),
    });
    const footerStr = "Sportschützen Muhen (gegründet 1919) · Schiessanlage Rüteli, 5037 Muhen · www.sportschuetzen-muhen.ch · sportschuetzen.muhen@gmail.com";
    const strW = fontRegular.widthOfTextAtSize(footerStr, 6.8);
    p.drawText(footerStr, {
      x: (A4_WIDTH - strW) / 2,
      y: 11.5 * MM,
      size: 6.8,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
  };

  // ============================================================================
  // SEITE 1: KOPFBEREICH & ADRESSEN (DIN 5008)
  // ============================================================================
  const normRecipient = normalizeRecipient(recipient);
  let currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let pageCount = 1;

  // Logo freistehend oben links + zweizeiliger Vereinskopf daneben (harmonisiert)
  let textStartX = 15 * MM;
  if (logoImage) {
    const scaledLogo = logoImage.scaleToFit(32 * MM, 32 * MM);
    currentPage.drawImage(logoImage, {
      x: 15 * MM,
      y: 291 * MM - scaledLogo.height,
      width: scaledLogo.width,
      height: scaledLogo.height,
    });
    textStartX = 15 * MM + scaledLogo.width + 3.5 * MM;
  }

  currentPage.drawText(CLUB_NAME.toUpperCase(), {
    x: textStartX,
    y: 281.5 * MM,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  currentPage.drawText("gegründet 1919 · Schiessanlage Rüteli", {
    x: textStartX,
    y: 275.5 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  // Absenderblock links unter dem Logo (ab ca. 246 mm)
  let sendY = 246 * MM;
  const clubSubTitle = sender.bereich
    ? `${CLUB_NAME} ${sender.bereich}`
    : (sender.funktion ? `${CLUB_NAME} ${sender.funktion}` : CLUB_NAME);
  currentPage.drawText(sanitizeWinAnsiText(clubSubTitle), { x: 20 * MM, y: sendY, size: 9.5, font: fontBold });
  sendY -= 4.2 * MM;

  const senderNameStr = [sender.vorname, sender.nachname].filter(Boolean).join(" ");
  if (senderNameStr) {
    currentPage.drawText(sanitizeWinAnsiText(senderNameStr), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  if (sender.strasse) {
    currentPage.drawText(sanitizeWinAnsiText(sender.strasse), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  const senderPlzOrt = `${sender.plz || ""} ${sender.ort || ""}`.trim();
  if (senderPlzOrt) {
    currentPage.drawText(sanitizeWinAnsiText(senderPlzOrt), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  if (sender.mobil) {
    currentPage.drawText(sanitizeWinAnsiText(`Mobil ${sender.mobil}`), { x: 20 * MM, y: sendY, size: 9, font: fontRegular });
    sendY -= 4.0 * MM;
  }
  if (sender.email) {
    currentPage.drawText(sanitizeWinAnsiText(sender.email), {
      x: 20 * MM,
      y: sendY,
      size: 9,
      font: fontRegular,
      color: rgb(0.08, 0.35, 0.75),
    });
    sendY -= 4.0 * MM;
  }

  // Empfänger-Adresse (DIN 5008 Fenster rechts ab 125 mm, Höhe 246 mm) mit separater Anredezeile
  let addrY = 246 * MM;
  if (normRecipient.abteilung) {
    currentPage.drawText(sanitizeWinAnsiText(normRecipient.abteilung), {
      x: 125 * MM,
      y: addrY,
      size: 9.5,
      font: fontRegular,
    });
    addrY -= 4.2 * MM;
  }
  if (normRecipient.firma) {
    currentPage.drawText(sanitizeWinAnsiText(normRecipient.firma), {
      x: 125 * MM,
      y: addrY,
      size: 9.5,
      font: fontBold,
    });
    addrY -= 4.2 * MM;
  }
  if (normRecipient.anrede && !normRecipient.firma) {
    currentPage.drawText(sanitizeWinAnsiText(normRecipient.anrede), {
      x: 125 * MM,
      y: addrY,
      size: 9.5,
      font: fontRegular,
    });
    addrY -= 4.2 * MM;
  }
  const fullRecName = [normRecipient.vorname, normRecipient.nachname].filter(Boolean).join(" ").trim() || (normRecipient.name || "");
  if (fullRecName && (!normRecipient.firma || fullRecName !== normRecipient.firma)) {
    currentPage.drawText(sanitizeWinAnsiText(fullRecName), {
      x: 125 * MM,
      y: addrY,
      size: 9.5,
      font: fontRegular,
    });
    addrY -= 4.2 * MM;
  }
  if (normRecipient.strasse) {
    currentPage.drawText(sanitizeWinAnsiText(normRecipient.strasse), {
      x: 125 * MM,
      y: addrY,
      size: 9.5,
      font: fontRegular,
    });
    addrY -= 4.2 * MM;
  }
  const recPlzOrt = `${normRecipient.plz || ""} ${normRecipient.ort || ""}`.trim();
  if (recPlzOrt) {
    currentPage.drawText(sanitizeWinAnsiText(recPlzOrt), {
      x: 125 * MM,
      y: addrY,
      size: 9.5,
      font: fontRegular,
    });
    addrY -= 4.2 * MM;
  }
  if (normRecipient.land && normRecipient.land !== "CH" && normRecipient.land !== "Schweiz") {
    currentPage.drawText(sanitizeWinAnsiText(normRecipient.land), {
      x: 125 * MM,
      y: addrY,
      size: 9.5,
      font: fontRegular,
    });
    addrY -= 4.2 * MM;
  }

  // Ort & Datum (Höhe 195 mm)
  const fullDateText = `Muhen, ${dateStr}`;
  currentPage.drawText(sanitizeWinAnsiText(fullDateText), {
    x: 125 * MM,
    y: 195 * MM,
    size: 9,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Betreff (H1)
  let curY = 180 * MM;
  currentPage.drawText(sanitizeWinAnsiText(docSubject), {
    x: 20 * MM,
    y: curY,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });
  curY -= 9 * MM;

  // Anrede
  let anredeText = "";
  if (recipient.vorname) {
    anredeText = `Guten Tag ${recipient.vorname} ${recipient.nachname || ""}`.trim() + ",";
  } else if (recipient.name) {
    anredeText = `Guten Tag ${recipient.name},`;
  } else {
    anredeText = "Sehr geehrte Damen und Herren, liebe Schützenkameradinnen und Schützenkameraden,";
  }

  // Textzusammensetzung: intro, content, outro
  const fullText = [layout.intro, content, layout.outro].filter(Boolean).join("\n\n").trim();
  if (fullText.startsWith("Liebe") || fullText.startsWith("Sehr geehrte") || fullText.startsWith("Guten Tag") || fullText.startsWith("Hallo")) {
    // Anrede ist bereits im Text enthalten
  } else {
    currentPage.drawText(sanitizeWinAnsiText(anredeText), {
      x: 20 * MM,
      y: curY,
      size: 10,
      font: fontRegular,
    });
    curY -= 7 * MM;
  }

  // Fliesstext in Absätze aufteilen
  const paragraphs = (fullText || "Wir bedanken uns für Ihre geschätzte Aufmerksamkeit.").split(/\n\n+/);
  const maxTextWidth = 170 * MM;
  const lineSpacing = 4.8 * MM; // ca. 13.6 pt

  for (const para of paragraphs) {
    const rawLines = para.split("\n");
    for (const rawLine of rawLines) {
      const isBullet = rawLine.trim().startsWith("- ") || rawLine.trim().startsWith("• ") || rawLine.trim().startsWith("* ");
      const isNumbered = /^\d+[\.\)]\s/.test(rawLine.trim());
      const indentX = (isBullet || isNumbered) ? 25 * MM : 20 * MM;
      const effectiveMaxWidth = (isBullet || isNumbered) ? maxTextWidth - 5 * MM : maxTextWidth;

      const wrapped = wrapText(rawLine.trim(), fontRegular, 9.5, effectiveMaxWidth);

      for (let wIdx = 0; wIdx < wrapped.length; wIdx++) {
        if (curY < 38 * MM) {
          drawClubLegalFooter(currentPage);
          currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
          pageCount++;
          curY = renderFollowUpHeader(currentPage, pageCount);
        }

        const lineToDraw = wrapped[wIdx];
        currentPage.drawText(sanitizeWinAnsiText(lineToDraw), {
          x: indentX,
          y: curY,
          size: 9.5,
          font: fontRegular,
          color: rgb(0.12, 0.16, 0.2),
        });
        curY -= lineSpacing;
      }
    }
    curY -= 3.0 * MM; // Absatzabstand
  }

  // ============================================================================
  // UNTERSCHRIFTENBLOCK (Zweispaltig)
  // ============================================================================
  if (curY < 45 * MM) {
    drawClubLegalFooter(currentPage);
    currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    pageCount++;
    curY = renderFollowUpHeader(currentPage, pageCount);
  }

  curY -= 4 * MM;
  currentPage.drawText("Mit freundlichen Grüssen", { x: 20 * MM, y: curY, size: 9.5, font: fontRegular });
  curY -= 5 * MM;
  currentPage.drawText(CLUB_NAME, { x: 20 * MM, y: curY, size: 10, font: fontBold });
  curY -= 15 * MM; // Freiraum für handschriftliche Signatur

  // Signer 1 (links)
  const signer1Name = (signers && signers[0]?.name) || senderNameStr || CLUB_NAME;
  const signer1Role = (signers && signers[0]?.role) || sender.funktion || sender.bereich || "Präsident";

  // Signer 2 (rechts)
  const signer2Name = (signers && signers[1]?.name) || "";
  const signer2Role = (signers && signers[1]?.role) || (signer2Name ? "Vorstand" : "");

  // Unterschriftenlinie links
  currentPage.drawLine({
    start: { x: 20 * MM, y: curY + 3 * MM },
    end: { x: 85 * MM, y: curY + 3 * MM },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  currentPage.drawText(sanitizeWinAnsiText(signer1Name), { x: 20 * MM, y: curY - 1 * MM, size: 9, font: fontBold });
  currentPage.drawText(sanitizeWinAnsiText(signer1Role), { x: 20 * MM, y: curY - 5 * MM, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  // Unterschriftenlinie rechts
  if (signer2Name || signer2Role) {
    currentPage.drawLine({
      start: { x: 115 * MM, y: curY + 3 * MM },
      end: { x: 180 * MM, y: curY + 3 * MM },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    currentPage.drawText(sanitizeWinAnsiText(signer2Name), { x: 115 * MM, y: curY - 1 * MM, size: 9, font: fontBold });
    currentPage.drawText(sanitizeWinAnsiText(signer2Role), { x: 115 * MM, y: curY - 5 * MM, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  }

  // Footer auf letzter Seite
  drawClubLegalFooter(currentPage);

  // ============================================================================
  // 2-PASS SEITENNUMMERIERUNG ("Seite X von Y")
  // ============================================================================
  const totalPages = pdfDoc.getPageCount();
  if (totalPages > 1) {
    const allPages = pdfDoc.getPages();
    allPages.forEach((p, idx) => {
      const pageStr = `Seite ${idx + 1} von ${totalPages}`;
      const pageStrW = fontRegular.widthOfTextAtSize(pageStr, 7.5);
      const centerX = (A4_WIDTH - pageStrW) / 2;
      p.drawText(pageStr, {
        x: centerX,
        y: 8 * MM,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      });
    });
  }

  return await pdfDoc.save();
}

// ==============================================================================
// GENERATOR: ENDSCHIESSEN-FESTFÜHRER & EINLADUNG (TYP 4)
// ==============================================================================
async function generateEndschiessenPdf(
  year: number,
  data: any,
  supabaseClient?: any
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Logo laden
  let logoImage: any = null;
  const logoBytes = await getOrLoadLogoBytes(supabaseClient);
  if (logoBytes) {
    try {
      logoImage = await pdfDoc.embedPng(logoBytes);
    } catch (_) {
      try {
        logoImage = await pdfDoc.embedJpg(logoBytes);
      } catch (_) {}
    }
  }

  // Seite 1 anlegen
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  // Kopfzeile & Logo
  // Links: Vereinsabsender
  page.drawText(CLUB_NAME, {
    x: 20 * MM,
    y: A4_HEIGHT - 20 * MM,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });
  page.drawText(`${CLUB_STREET} · ${CLUB_ZIP} ${CLUB_CITY}`, {
    x: 20 * MM,
    y: A4_HEIGHT - 24 * MM,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText(`${CLUB_WEBSITE} · ${CLUB_EMAIL}`, {
    x: 20 * MM,
    y: A4_HEIGHT - 28 * MM,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Rechts: Logo
  if (logoImage) {
    const logoDims = logoImage.scaleToFit(32 * MM, 22 * MM);
    page.drawImage(logoImage, {
      x: A4_WIDTH - 20 * MM - logoDims.width,
      y: A4_HEIGHT - 30 * MM,
      width: logoDims.width,
      height: logoDims.height,
    });
  }

  // Trennlinie oben
  page.drawLine({
    start: { x: 20 * MM, y: A4_HEIGHT - 32 * MM },
    end: { x: A4_WIDTH - 20 * MM, y: A4_HEIGHT - 32 * MM },
    thickness: 1.0,
    color: rgb(0.1, 0.25, 0.5), // Schützenblau
  });

  // H1 Haupttitel
  let curY = A4_HEIGHT - 43 * MM;
  const mainTitle = data.title || `Endschiessen & Absenden ${year}`;
  page.drawText(sanitizeWinAnsiText(mainTitle), {
    x: 20 * MM,
    y: curY,
    size: 17,
    font: fontBold,
    color: rgb(0.08, 0.15, 0.35),
  });

  curY -= 5.5 * MM;
  const subtitle = data.subtitle || "Offizieller Festführer, Schiessplan & Menü-Einladung";
  page.drawText(sanitizeWinAnsiText(subtitle), {
    x: 20 * MM,
    y: curY,
    size: 10,
    font: fontItalic,
    color: rgb(0.3, 0.3, 0.4),
  });

  // Begrüssung / Einleitungstext
  curY -= 7.5 * MM;
  const defaultIntro = data.intro || `Liebe Schützinnen, liebe Schützen, geschätzte Ehren- und Passivmitglieder\n\nZum traditionellen Saisonabschluss laden die Sportschützen Muhen herzlich zum Endschiessen ${year} in die Schiessanlage Rüteli ein. Neben dem sportlichen Wettkampf steht die Kameradschaft und das gemütliche Beisammensein beim gemeinsamen Absenden im Mittelpunkt.`;
  
  const introParas = defaultIntro.split("\n\n");
  for (const para of introParas) {
    const wrapped = wrapText(para, fontRegular, 9, 170 * MM);
    for (const line of wrapped) {
      page.drawText(sanitizeWinAnsiText(line), {
        x: 20 * MM,
        y: curY,
        size: 9,
        font: fontRegular,
        color: rgb(0.12, 0.15, 0.2),
      });
      curY -= 4.0 * MM;
    }
    curY -= 1.8 * MM;
  }

  curY -= 2 * MM;

  // ----------------------------------------------------------------------------
  // SEKTION 1: SCHIESSTAGE & SCHIESSZEITEN (2-Spalten-Boxen)
  // ----------------------------------------------------------------------------
  page.drawText("1. Schiesstage & Schiesszeiten", {
    x: 20 * MM,
    y: curY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.4),
  });
  curY -= 4.5 * MM;

  const shootingDays = data.shootingDays || [
    { day: "Freitag", date: data.dateFriday || `Herbst ${year}`, time: "16:30 – 19:15 Uhr", note: "Standblattausgabe bis 18:45 Uhr" },
    { day: "Samstag", date: data.dateSaturday || `Herbst ${year}`, time: "09:00 – 11:45 Uhr / 13:30 – 17:00 Uhr", note: "Standblattausgabe bis 16:30 Uhr" },
  ];

  // Box-Layout für Schiesstage
  const boxWidth = 82 * MM;
  const boxHeight = 20 * MM;
  shootingDays.forEach((sd: any, idx: number) => {
    const boxX = (idx % 2 === 0) ? 20 * MM : 108 * MM;
    const boxY = curY - boxHeight;

    // Hintergrund
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: rgb(0.95, 0.97, 1.0),
      borderColor: rgb(0.75, 0.82, 0.92),
      borderWidth: 0.8,
    });

    page.drawText(sanitizeWinAnsiText(`${sd.day}, ${sd.date}`), {
      x: boxX + 4 * MM,
      y: boxY + boxHeight - 5.5 * MM,
      size: 9,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.4),
    });

    page.drawText(sanitizeWinAnsiText(`Schiesszeit: ${sd.time}`), {
      x: boxX + 4 * MM,
      y: boxY + boxHeight - 10.5 * MM,
      size: 8,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    page.drawText(sanitizeWinAnsiText(sd.note), {
      x: boxX + 4 * MM,
      y: boxY + boxHeight - 15.5 * MM,
      size: 7.5,
      font: fontItalic,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  curY -= (boxHeight + 7 * MM);

  // ----------------------------------------------------------------------------
  // SEKTION 2: WETTKAMPFPROGRAMM & STICHE (Tabelle)
  // ----------------------------------------------------------------------------
  page.drawText("2. Stichprogramm & Scheibenwertung (300m)", {
    x: 20 * MM,
    y: curY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.4),
  });
  curY -= 5.5 * MM;

  // Tabellenkopf
  const colX = [20 * MM, 75 * MM, 125 * MM, 160 * MM]; // Stich | Programm / Scheibe | Auszeichnung | Einsatz
  page.drawRectangle({
    x: 20 * MM,
    y: curY - 5 * MM,
    width: 170 * MM,
    height: 5.5 * MM,
    color: rgb(0.1, 0.2, 0.4),
  });
  page.drawText("Stich / Wettbewerb", { x: colX[0] + 2 * MM, y: curY - 3.8 * MM, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Programm / Scheibe", { x: colX[1] + 2 * MM, y: curY - 3.8 * MM, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Wertung / Zählung", { x: colX[2] + 2 * MM, y: curY - 3.8 * MM, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Einsatz", { x: colX[3] + 2 * MM, y: curY - 3.8 * MM, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  curY -= 6.0 * MM;

  const stiche = data.stiche || [
    { name: "Vereinsstich (Hauptstich)", prog: "2 Probe, 10 Einzel (Scheibe A10)", val: "Zählt zur Jahresmeisterschaft", fee: "CHF 15.00" },
    { name: "Gabenstich", prog: "5 Schuss Einzel (Scheibe A100)", val: "Gabentempel (bester Schuss)", fee: "CHF 18.00" },
    { name: "Glücksstich / Differenzler", prog: "3 Schuss Einzel (Scheibe A10)", val: "Zielvorgabe / Tiefschuss", fee: "CHF 8.00" },
    { name: "Nachdoppel", prog: "Serien à 5 Schuss (A100)", val: "Unbeschränkt nachlösbar", fee: "CHF 6.00 / Serie" },
    { name: "Junioren / Nachwuchs", prog: "Hauptstich (reduziert)", val: "U17 / U21 Spezialpreis", fee: "CHF 8.00" },
  ];

  stiche.forEach((st: any, sIdx: number) => {
    const isEven = sIdx % 2 === 0;
    const rowH = 5.8 * MM;
    if (isEven) {
      page.drawRectangle({
        x: 20 * MM,
        y: curY - 4.5 * MM,
        width: 170 * MM,
        height: rowH,
        color: rgb(0.96, 0.97, 0.98),
      });
    }

    page.drawText(sanitizeWinAnsiText(st.name), { x: colX[0] + 2 * MM, y: curY - 3 * MM, size: 7.5, font: fontBold, color: rgb(0.1, 0.15, 0.25) });
    page.drawText(sanitizeWinAnsiText(st.prog), { x: colX[1] + 2 * MM, y: curY - 3 * MM, size: 7.0, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(sanitizeWinAnsiText(st.val), { x: colX[2] + 2 * MM, y: curY - 3 * MM, size: 7.0, font: fontRegular, color: rgb(0.25, 0.25, 0.25) });
    page.drawText(sanitizeWinAnsiText(st.fee), { x: colX[3] + 2 * MM, y: curY - 3 * MM, size: 7.5, font: fontBold, color: rgb(0.1, 0.25, 0.4) });

    curY -= rowH;
  });

  // Munitionshinweis
  curY -= 1.5 * MM;
  page.drawText("Munition: GP90 & GP11 zum Vereinstarif an der Standblattausgabe erhältlich. Sportgeräte nach SSV-Reglement.", {
    x: 20 * MM,
    y: curY,
    size: 7.0,
    font: fontItalic,
    color: rgb(0.4, 0.4, 0.4),
  });

  curY -= 7 * MM;

  // ----------------------------------------------------------------------------
  // SEKTION 3: ABSENDEN & GEMEINSAMES NACHTESSEN (Festwirtschaft)
  // ----------------------------------------------------------------------------
  page.drawText("3. Absenden, Rangverkündigung & Nachtessen", {
    x: 20 * MM,
    y: curY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.4),
  });
  curY -= 4.5 * MM;

  const dinnerDate = data.dinnerDate || `Samstagabend nach Schiessende (ab 18:30 Uhr)`;
  const dinnerLoc = data.dinnerLocation || "Schützenstube Rüteli, Muhen";
  const dinnerMenu = data.dinnerMenu || "Herbstliches Nachtessen vom Schützenwirt mit Salat & Dessert";
  const dinnerDeadline = data.dinnerDeadline || "Anmeldung bis 3 Tage vor dem Anlass erbeten";

  // Box für Absenden
  page.drawRectangle({
    x: 20 * MM,
    y: curY - 22 * MM,
    width: 170 * MM,
    height: 22 * MM,
    color: rgb(0.98, 0.97, 0.93), // Warm beige
    borderColor: rgb(0.85, 0.78, 0.65),
    borderWidth: 0.8,
  });

  page.drawText(`Festakt & Zeit: ${dinnerDate} · Ort: ${dinnerLoc}`, {
    x: 24 * MM,
    y: curY - 5.5 * MM,
    size: 8.5,
    font: fontBold,
    color: rgb(0.4, 0.2, 0.05),
  });

  page.drawText(`Menü: ${dinnerMenu}`, {
    x: 24 * MM,
    y: curY - 10.5 * MM,
    size: 8.0,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Rangverkündigung: Jeder Schütze erhält einen Preis vom reich bestückten Gabentempel!`, {
    x: 24 * MM,
    y: curY - 15.0 * MM,
    size: 8.0,
    font: fontBold,
    color: rgb(0.1, 0.35, 0.15),
  });

  page.drawText(`Anmeldung Nachtessen: ${dinnerDeadline} via Portal oder an Schützenmeister / Wirt.`, {
    x: 24 * MM,
    y: curY - 19.5 * MM,
    size: 7.5,
    font: fontItalic,
    color: rgb(0.45, 0.3, 0.1),
  });

  curY -= (22 * MM + 6 * MM);

  // ----------------------------------------------------------------------------
  // SEKTION 4: VORSCHRIFTEN & UNTERSCHRIFT
  // ----------------------------------------------------------------------------
  page.drawText("4. Allgemeine Bestimmungen & Schiessvorschriften", {
    x: 20 * MM,
    y: curY,
    size: 9.5,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.4),
  });
  curY -= 4 * MM;

  const rulesText = "Es gelten die aktuellen Sicherheitsbestimmungen des SSV und des AGSV. Die Laufkontrolle vor dem Verlassen des Standes ist obligatorisch. Verschlüsse bleiben ausserhalb des Schützenstandes stets geöffnet. Wir freuen uns auf eine hohe Beteiligung und faire Wettkämpfe!";
  const wrappedRules = wrapText(rulesText, fontRegular, 7.5, 170 * MM);
  for (const rLine of wrappedRules) {
    page.drawText(sanitizeWinAnsiText(rLine), {
      x: 20 * MM,
      y: curY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });
    curY -= 3.3 * MM;
  }

  curY -= 3.5 * MM;

  // Unterschriftenzeile Schützenmeister & Vorstand
  page.drawText("Sportschützen Muhen", { x: 20 * MM, y: curY, size: 8.5, font: fontBold });
  page.drawText("Die Schützenmeister & der Vorstand", { x: 20 * MM, y: curY - 3.8 * MM, size: 7.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  // Footer
  page.drawLine({
    start: { x: 20 * MM, y: 15 * MM },
    end: { x: 190 * MM, y: 15 * MM },
    thickness: 0.3,
    color: rgb(0.75, 0.75, 0.75),
  });
  page.drawText("Sportschützen Muhen (gegründet 1919) · Schiessanlage Rüteli, 5037 Muhen · www.sportschuetzen-muhen.ch · sportschuetzen.muhen@gmail.com", {
    x: 20 * MM,
    y: 11.5 * MM,
    size: 6.8,
    font: fontRegular,
    color: rgb(0.45, 0.45, 0.45),
  });

  // Seitenzahl
  const pageStr = "Seite 1 von 1";
  const pageStrW = fontRegular.widthOfTextAtSize(pageStr, 7.5);
  page.drawText(pageStr, {
    x: (A4_WIDTH - pageStrW) / 2,
    y: 8 * MM,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.45, 0.45, 0.45),
  });

  return await pdfDoc.save();
}

// ==============================================================================
// MODULARER GV-DOSSIER-COMPILER (PDF-ASSEMBLER & CORPORATE STEMPEL)
// ==============================================================================
async function compileGvDossierPdf(
  campaignId: string,
  year: number,
  gvData: any,
  supabaseClient: any
): Promise<{ pdfBytes: Uint8Array; pageCount: number; attachmentsCompiled: number }> {
  const masterDoc = await PDFDocument.create();
  const fontRegular = await masterDoc.embedFont(StandardFonts.Helvetica);

  // 1. DYNAMISCHE BASIS-SEITEN GENERIEREN (Einladung S.1 + Jahresprogramm S.2ff)
  const baseBytes = await generateGVInvitationPdf(year, gvData, supabaseClient);
  const baseDoc = await PDFDocument.load(baseBytes);
  const basePageIndices = baseDoc.getPageIndices();
  const copiedBasePages = await masterDoc.copyPages(baseDoc, basePageIndices);
  copiedBasePages.forEach((p) => masterDoc.addPage(p));

  // 2. BEILAGEN AUS campaign_attachments LADEN & ZUSAMMENFÜGEN
  let attachmentsCompiled = 0;
  if (campaignId && supabaseClient) {
    const { data: attachments, error: attErr } = await supabaseClient
      .from("campaign_attachments")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true });

    if (!attErr && attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (!att.storage_path) continue;

        try {
          // Versuche Download aus campaign-assets oder operatives-storage
          let fileBytes: Uint8Array | null = null;
          const bucketCandidates = ["campaign-assets", "operatives-storage"];
          for (const b of bucketCandidates) {
            const { data: fileBlob } = await supabaseClient.storage.from(b).download(att.storage_path);
            if (fileBlob) {
              fileBytes = new Uint8Array(await fileBlob.arrayBuffer());
              break;
            }
          }

          if (fileBytes) {
            const extDoc = await PDFDocument.load(fileBytes);
            const extPageIndices = extDoc.getPageIndices();
            const copiedExtPages = await masterDoc.copyPages(extDoc, extPageIndices);
            copiedExtPages.forEach((p) => masterDoc.addPage(p));

            // Status in DB aktualisieren
            await supabaseClient
              .from("campaign_attachments")
              .update({
                page_count: extDoc.getPageCount(),
                status: "compiled",
                updated_at: new Date().toISOString(),
              })
              .eq("id", att.id);

            attachmentsCompiled++;
          }
        } catch (attLoadErr) {
          console.warn(`⚠️ [GV-Compiler] Fehler beim Laden von Beilage ${att.title}:`, attLoadErr);
          await supabaseClient
            .from("campaign_attachments")
            .update({
              status: "error",
              error_message: String(attLoadErr),
              updated_at: new Date().toISOString(),
            })
            .eq("id", att.id);
        }
      }
    }
  }

  // 3. CORPORATE STEMPEL (2-Pass über ALLE Seiten des Master-Dossiers)
  const totalPages = masterDoc.getPageCount();
  const allPages = masterDoc.getPages();

  allPages.forEach((p, idx) => {
    const pageNum = idx + 1;
    const { width, height } = p.getSize();

    // Dezente Kopfzeile (ab Seite 2)
    if (pageNum > 1) {
      p.drawLine({
        start: { x: 20 * MM, y: height - 12 * MM },
        end: { x: width - 20 * MM, y: height - 12 * MM },
        thickness: 0.3,
        color: rgb(0.75, 0.75, 0.75),
      });

      p.drawText(`Sportschützen Muhen · Generalversammlung ${year}`, {
        x: 20 * MM,
        y: height - 10 * MM,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.55),
      });
    }

    // Fortlaufende Seitennummerierung unten zentriert
    const pageStr = `Seite ${pageNum} von ${totalPages}`;
    const pageStrW = fontRegular.widthOfTextAtSize(pageStr, 7.5);
    const centerX = (width - pageStrW) / 2;

    p.drawLine({
      start: { x: 20 * MM, y: 15 * MM },
      end: { x: width - 20 * MM, y: 15 * MM },
      thickness: 0.3,
      color: rgb(0.75, 0.75, 0.75),
    });

    p.drawText(pageStr, {
      x: centerX,
      y: 11 * MM,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  const finalPdfBytes = await masterDoc.save();
  return {
    pdfBytes: finalPdfBytes,
    pageCount: totalPages,
    attachmentsCompiled: attachmentsCompiled,
  };
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
      // Falls invRow noch nicht geladen ist, laden wir die Rechnung aus Supabase
      if (!invRow && supabase) {
        const { data: invData } = await supabase.from("invoices").select("*").eq("id", invId).maybeSingle();
        if (invData) invRow = invData;
      }

      // Zusammenführung: Payload-Empfänger + gespeicherte DB-Adresse (invoices.recipient_address)
      const mergedRec = {
        ...(invRow?.recipient_address || {}),
        ...(payload.recipient || {}),
      };

      let recipient = normalizeRecipient(mergedRec);

      // Auto-Hydration der Empfänger-Adresse & Anrede aus members, falls strasse oder anrede noch fehlen
      const pNr = mergedRec.person_number || mergedRec.personNumber || mergedRec.member_id || mergedRec.memberId || invRow?.person_number;
      if ((!recipient.strasse || !recipient.anrede || !recipient.vorname) && pNr && supabase) {
        try {
          const { data: memberData } = await supabase
            .from("members")
            .select("salutation, first_name, last_name, street, post_code, city, primary_email")
            .eq("person_number", pNr)
            .maybeSingle();

          if (memberData) {
            recipient.firma = "";
            recipient.typ = "privat";
            recipient.anrede = recipient.anrede || memberData.salutation || "";
            recipient.vorname = recipient.vorname || memberData.first_name || "";
            recipient.nachname = recipient.nachname || memberData.last_name || "";
            recipient.strasse = recipient.strasse || memberData.street || "";
            recipient.plz = recipient.plz || String(memberData.post_code || "");
            recipient.ort = recipient.ort || memberData.city || "";
            recipient.email = recipient.email || memberData.primary_email || "";
            recipient.name = recipient.name || [recipient.vorname, recipient.nachname].filter(Boolean).join(" ");
          }
        } catch (_) {}
      }
      let parsedSenderAddress: any = invRow?.sender_address;
      if (typeof parsedSenderAddress === "string") {
        try { parsedSenderAddress = JSON.parse(parsedSenderAddress); } catch (_) {}
      }
      const sender = {
        ...(parsedSenderAddress || {}),
        ...(payload.sender || {}),
      };
      if (!sender.funktion) sender.funktion = parsedSenderAddress?.funktion || "Kassier";
      if (!sender.email) sender.email = parsedSenderAddress?.email || CLUB_EMAIL;
      if (!sender.verein) sender.verein = CLUB_NAME;

      // Automatisches Nachladen aus admin_profiles & members bei unvollständigem Absender
      if ((!sender.vorname || !sender.strasse) && supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: prof } = await supabase
              .from("admin_profiles")
              .select("*, members(*)")
              .eq("auth_user_id", user.id)
              .maybeSingle();
            if (prof) {
              const m = prof.members || {};
              sender.vorname = sender.vorname || m.first_name || (prof.display_name ? prof.display_name.split(" ")[0] : "");
              sender.nachname = sender.nachname || m.last_name || (prof.display_name ? prof.display_name.split(" ").slice(1).join(" ") : "");
              sender.funktion = sender.funktion || prof.role_external || "Vorstand";
              sender.bereich = sender.bereich || prof.role_external || "";
              sender.strasse = sender.strasse || m.street || "";
              sender.plz = sender.plz || String(m.post_code || "5037");
              sender.ort = sender.ort || m.city || "Muhen";
              sender.mobil = sender.mobil || m.private_mobile_phone || m.business_mobile_phone || "";
              sender.email = sender.email || m.primary_email || prof.email || CLUB_EMAIL;
            }
          }
        } catch (_) {}
      }

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
        supabase,
        payload.layout,
        (payload as any).templateId
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
    }

    // --------------------------------------------------------------------------
    // FALL 4: VOLLSTÄNDIGES GV-DOSSIER ASSEMBLIEREN & STEMPELN
    // --------------------------------------------------------------------------
    else if (action === "compile-gv-dossier" || action === "compileGVDossier") {
      const year = Number(payload.year || curYear);
      const campId = payload.campaignId || "";
      const gvData = (payload as any).gvData || {};
      recordId = campId || `GV-DOSSIER-${year}`;

      const res = await compileGvDossierPdf(
        campId,
        year,
        gvData,
        supabase
      );

      pdfBytes = res.pdfBytes;
      fileName = `GV_Dossier_${year}_Gesamt.pdf`;
      storageSubDir = `gv-dossiers/${year}`;
      docTitle = `GV-Dossier ${year} Gesamt (${res.pageCount} Seiten)`;
    }

    // --------------------------------------------------------------------------
    // FALL 5: FREIER VORSTANDSBRIEF (DIN 5008 FENSTER RECHTS)
    // --------------------------------------------------------------------------
    else if (action === "generate-letter" || action === "generateLetterPDF") {
      const letId = payload.letterId || `BRIEF-${curYear}-${Date.now().toString().slice(-4)}`;
      recordId = letId;

      const recipient = payload.recipient || {
        name: "Mitglied",
        vorname: "",
        nachname: "Mitglied",
        strasse: "",
        plz: "5037",
        ort: "Muhen",
      };
      const sender = payload.sender || {
        vorname: "",
        nachname: "",
        funktion: "Vorstand",
        verein: CLUB_NAME,
        email: CLUB_EMAIL,
      };

      // Automatisches Nachladen aus admin_profiles & members bei unvollständigem Absender
      if ((!sender.vorname || !sender.strasse) && supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: prof } = await supabase
              .from("admin_profiles")
              .select("*, members(*)")
              .eq("auth_user_id", user.id)
              .maybeSingle();
            if (prof) {
              const m = prof.members || {};
              sender.vorname = sender.vorname || m.first_name || (prof.display_name ? prof.display_name.split(" ")[0] : "");
              sender.nachname = sender.nachname || m.last_name || (prof.display_name ? prof.display_name.split(" ").slice(1).join(" ") : "");
              sender.funktion = sender.funktion || prof.role_external || "Vorstand";
              sender.bereich = sender.bereich || prof.role_external || "";
              sender.strasse = sender.strasse || m.street || "";
              sender.plz = sender.plz || String(m.post_code || "5037");
              sender.ort = sender.ort || m.city || "Muhen";
              sender.mobil = sender.mobil || m.private_mobile_phone || m.business_mobile_phone || "";
              sender.email = sender.email || m.primary_email || prof.email || CLUB_EMAIL;
            }
          }
        } catch (_) {}
      }

      const layout = payload.layout || {};
      const subject = payload.subject || layout.title || "Mitteilung";
      const bodyText = payload.bodyText || "";
      const signers = payload.signers || [];
      const letterDate = payload.letterDate || "";

      pdfBytes = await generateLetterPdf(
        letId,
        recipient,
        sender,
        layout,
        subject,
        bodyText,
        signers,
        letterDate,
        supabase
      );

      const safeName = (recipient.nachname || recipient.firma || recipient.name || "Brief")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      fileName = `Brief_${letId}_${safeName}.pdf`;
      storageSubDir = `letters/${curYear}`;
      docTitle = `Brief: ${subject} – ${recipient.name || recipient.firma || ""}`;
    }

    // --------------------------------------------------------------------------
    // FALL 6: ENDSCHIESSEN-FESTFÜHRER & EINLADUNG (TYP 4)
    // --------------------------------------------------------------------------
    else if (action === "generate-endschiessen" || action === "generateEndschiessenPDF") {
      const year = Number(payload.year || curYear);
      const endschiessenData = (payload as any).endschiessenData || (payload as any).data || {};
      recordId = `ENDSCHIESSEN-${year}`;

      pdfBytes = await generateEndschiessenPdf(
        year,
        endschiessenData,
        supabase
      );

      fileName = `Endschiessen_Festfuehrer_${year}.pdf`;
      storageSubDir = `endschiessen/${year}`;
      docTitle = `Endschiessen & Festführer ${year} – Sportschützen Muhen`;
    } else {
      throw new Error(`Unbekannte Aktion: ${action}`);
    }

    // --------------------------------------------------------------------------
    // WORM-ARCHIVIERUNG (OR 957ff): Existierendes Archiv prüfen
    // --------------------------------------------------------------------------
    const storageBucket = "operatives-storage";
    const archiveCategory = action.includes("contract") ? "contracts" : (action.includes("gv") ? "gv" : (action.includes("letter") ? "letters" : (action.includes("endschiessen") ? "endschiessen" : "invoices")));
    const archivePath = `archive/${curYear}/${archiveCategory}/${recordId || "doc"}.pdf`;

    const isTestRun = Boolean(
      payload.saveToStorage === false ||
      payload.forceRecreate ||
      (recordId && (recordId.startsWith("TEST") || recordId.startsWith("RE-TEST") || recordId.startsWith("PREVIEW")))
    );

    if (!isTestRun && payload.saveToStorage !== false && !payload.forceRecreate && recordId) {
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
        [action.includes("contract") ? "Mietvertrag" : (action.includes("gv") ? "GV" : (action.includes("letter") ? "Brief" : (action.includes("endschiessen") ? "Endschiessen" : "Rechnung"))), curYear]
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

      // Proforma-Rechnung für Rechnungsmodul & CAMT Bankabgleich sicherstellen
      try {
        await supabase.rpc("ensure_rental_proforma_invoice", {
          p_booking_number: recordId,
        });
      } catch (invRpcErr) {
        console.warn("⚠️ ensure_rental_proforma_invoice RPC Warnung:", invRpcErr);
      }
    } else if (action === "compile-gv-dossier" || action === "compileGVDossier") {
      try {
        if (payload.campaignId) {
          await supabase
            .from("communication_campaigns")
            .update({
              dossier_pdf_url: publicUrl,
              dossier_storage_path: storagePath,
              status: "ready",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payload.campaignId);
        }
        await supabase
          .from("gv_instances")
          .update({ doc_anhaenge_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("year", Number(curYear));
      } catch (_) {}
    } else if (action.includes("gv") || action === "generate-gv-invitation") {
      try {
        await supabase
          .from("gv_instances")
          .update({ doc_einladung_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("year", Number(curYear));
      } catch (_) {}
    } else if (action.includes("letter") || action === "generate-letter" || action === "generateLetterPDF") {
      try {
        if (payload.campaignRecipientId) {
          await supabase
            .from("campaign_recipients")
            .update({ pdf_storage_path: storagePath, updated_at: new Date().toISOString() })
            .eq("id", payload.campaignRecipientId);
        }
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
