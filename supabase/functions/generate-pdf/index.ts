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
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.9";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";

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
  page.drawText("–", {
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
  if (recipient.firma) debtorLines.push(recipient.firma);
  const pName = [recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || recipient.name || "";
  if (pName && (!recipient.firma || debtorLines.length === 1)) debtorLines.push(pName);
  if (recipient.strasse) debtorLines.push(recipient.strasse);
  const plzOrt = `${recipient.plz || ""} ${recipient.ort || ""}`.trim();
  if (plzOrt) debtorLines.push(plzOrt);

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
  page.drawText("–", {
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
  page.drawText(`${invoiceRef} / ${docType || "Rechnung"} ${yearStr}`, {
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
    page.drawText(line, {
      x: rightColX,
      y: qrBillHeightPt - (57.5 + idx * 4) * MM,
      size: 9,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
  });
}

// Erstellt das vollständige Rechnungs-PDF (A4)
async function generateInvoicePdf(
  invoiceId: string,
  recipient: RecipientData,
  sender: SenderData,
  layout: LayoutData,
  positions: InvoicePosition[],
  totalAmount: number,
  yearStr: string,
  docType: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4: 210 x 297 mm
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const isFirma =
    recipient.typ === "firma" ||
    Boolean(recipient.firma) ||
    Boolean(recipient.name && recipient.name.match(/\b(AG|GmbH|Genossenschaft|Verein|Verband|Stiftung|Gemeinde)\b/i));

  // 1. Briefkopf links oben (Sportschützen Muhen)
  page.drawText(CLUB_NAME.toUpperCase(), {
    x: 20 * MM,
    y: 278 * MM,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54), // Vereinsblau
  });
  page.drawText("Gegründet 1933 · Schiessanlage Hard · 5037 Muhen", {
    x: 20 * MM,
    y: 273 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });
  page.drawText(`${CLUB_EMAIL} · ${CLUB_WEBSITE}`, {
    x: 20 * MM,
    y: 269 * MM,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  // Kleiner Absender-Vermerk (DIN 5008 Fensterzeile)
  page.drawText(`${CLUB_NAME} · Postfach · 5037 Muhen`, {
    x: 125 * MM,
    y: 262 * MM,
    size: 7,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawLine({
    start: { x: 125 * MM, y: 260.5 * MM },
    end: { x: 195 * MM, y: 260.5 * MM },
    thickness: 0.3,
    color: rgb(0.7, 0.7, 0.7),
  });

  // 2. Empfänger-Adresse (DIN 5008 Fenster rechts)
  let addrY = 255 * MM;
  if (recipient.firma) {
    page.drawText(recipient.firma, { x: 125 * MM, y: addrY, size: 10, font: fontBold });
    addrY -= 4.5 * MM;
  }
  if (recipient.abteilung) {
    page.drawText(recipient.abteilung, { x: 125 * MM, y: addrY, size: 9, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  const fullRecName = [recipient.anrede, recipient.vorname, recipient.nachname].filter(Boolean).join(" ").trim() || (recipient.name || "");
  if (fullRecName) {
    page.drawText(fullRecName, { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  if (recipient.strasse) {
    page.drawText(recipient.strasse, { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  const plzOrt = `${recipient.plz || ""} ${recipient.ort || ""}`.trim();
  if (plzOrt) {
    page.drawText(plzOrt, { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }
  if (recipient.land && recipient.land !== "CH" && recipient.land !== "Schweiz") {
    page.drawText(recipient.land, { x: 125 * MM, y: addrY, size: 10, font: fontRegular });
    addrY -= 4.5 * MM;
  }

  // 3. Datum & Ort
  const dateStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  page.drawText(`Muhen, ${dateStr}`, {
    x: 20 * MM,
    y: 232 * MM,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  // 4. Rechnungstitel
  const defaultTitle = `Rechnung ${invoiceId} – ${docType || "Jahresbeitrag"} ${yearStr}`;
  const finalTitle = layout.title ? layout.title.replace(/{rechnungsnummer}/g, invoiceId).replace(/{rechnungsjahr}/g, yearStr) : defaultTitle;
  page.drawText(finalTitle, {
    x: 20 * MM,
    y: 223 * MM,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  // 5. Anrede & Einleitung
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

  const introText = (layout.intro || "anbei erhalten Sie die Rechnung für das Vereinsjahr {rechnungsjahr}.")
    .replace(/{rechnungsnummer}/g, invoiceId)
    .replace(/{rechnungsjahr}/g, yearStr)
    .replace(/{vorname}/g, recipient.vorname || "")
    .replace(/{nachname}/g, recipient.nachname || "");

  page.drawText(salutation, { x: 20 * MM, y: curY, size: 9.5, font: fontRegular });
  curY -= 5 * MM;

  // Textzeilen wrappen
  const introLines = introText.split("\n");
  introLines.forEach((l) => {
    if (l.trim()) {
      page.drawText(l.trim(), { x: 20 * MM, y: curY, size: 9, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
      curY -= 4.2 * MM;
    } else {
      curY -= 2 * MM;
    }
  });

  curY -= 3 * MM;

  // 6. Positionen-Tabelle
  const tblX = 20 * MM;
  const tblW = 170 * MM;
  const colW = { pos: 12 * MM, desc: 92 * MM, qty: 18 * MM, price: 22 * MM, total: 26 * MM };

  // Tabellenkopf
  page.drawRectangle({
    x: tblX,
    y: curY - 2 * MM,
    width: tblW,
    height: 6.5 * MM,
    color: rgb(0.93, 0.95, 0.98),
  });

  page.drawText("Pos.", { x: tblX + 2 * MM, y: curY, size: 8, font: fontBold });
  page.drawText("Beschreibung", { x: tblX + colW.pos + 2 * MM, y: curY, size: 8, font: fontBold });
  page.drawText("Menge", { x: tblX + colW.pos + colW.desc + 2 * MM, y: curY, size: 8, font: fontBold });
  page.drawText("Ansatz", { x: tblX + colW.pos + colW.desc + colW.qty + 2 * MM, y: curY, size: 8, font: fontBold });
  page.drawText("Betrag (CHF)", { x: tblX + tblW - 25 * MM, y: curY, size: 8, font: fontBold });

  curY -= 6.5 * MM;

  const validPositions = (positions && positions.length > 0)
    ? positions
    : [{ position_nr: 1, description: docType || "Jahresbeitrag", quantity: 1, unit_price: totalAmount, amount: totalAmount }];

  validPositions.forEach((pos, idx) => {
    const pAmt = Number(pos.amount || pos.unit_price || 0);
    const pQty = Number(pos.quantity || 1);
    const pUnit = Number(pos.unit_price || pAmt);

    // Abwechselnde Hintergrundzeile
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: tblX,
        y: curY - 1.5 * MM,
        width: tblW,
        height: 5.5 * MM,
        color: rgb(0.98, 0.98, 0.99),
      });
    }

    page.drawText(String(pos.position_nr || idx + 1), { x: tblX + 2 * MM, y: curY, size: 8.5, font: fontRegular });
    page.drawText(pos.description.substring(0, 55), { x: tblX + colW.pos + 2 * MM, y: curY, size: 8.5, font: fontRegular });
    page.drawText(pQty > 1 ? String(pQty) : "1", { x: tblX + colW.pos + colW.desc + 2 * MM, y: curY, size: 8.5, font: fontRegular });
    page.drawText(pUnit.toFixed(2), { x: tblX + colW.pos + colW.desc + colW.qty + 2 * MM, y: curY, size: 8.5, font: fontRegular });
    page.drawText(pAmt.toFixed(2), { x: tblX + tblW - 20 * MM, y: curY, size: 8.5, font: fontRegular });

    curY -= 5.5 * MM;
  });

  // Summenzeile
  page.drawLine({
    start: { x: tblX, y: curY + 1 * MM },
    end: { x: tblX + tblW, y: curY + 1 * MM },
    thickness: 0.8,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText("Gesamtbetrag (CHF):", { x: tblX + tblW - 65 * MM, y: curY - 3 * MM, size: 9.5, font: fontBold });
  page.drawText(totalAmount.toFixed(2), { x: tblX + tblW - 20 * MM, y: curY - 3 * MM, size: 10, font: fontBold });

  curY -= 9 * MM;

  // 7. Hinweis & Schlusstext
  const noticeText = (layout.notice || "Zahlbar innert 30 Tagen mit beiliegendem QR-Zahlteil. Besten Dank für deine Unterstützung!")
    .replace(/{rechnungsnummer}/g, invoiceId)
    .replace(/{rechnungsjahr}/g, yearStr);

  page.drawText(noticeText, { x: 20 * MM, y: curY, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  curY -= 5 * MM;

  const senderName = [sender.vorname, sender.nachname].filter(Boolean).join(" ") || CLUB_NAME;
  const senderFunc = sender.funktion || "Vorstand Sportschützen Muhen";
  page.drawText("Freundliche Grüsse", { x: 20 * MM, y: curY, size: 9, font: fontRegular });
  curY -= 4 * MM;
  page.drawText(`${senderName} (${senderFunc})`, { x: 20 * MM, y: curY, size: 9, font: fontBold });

  // 8. Schweizer QR-Rechnung am unteren Rand (105 mm)
  drawSwissQrBillSection(page, fontRegular, fontBold, invoiceId, totalAmount, recipient, yearStr, docType);

  return await pdfDoc.save();
}

// Erstellt das Mietvertrags-PDF inkl. Benützungsordnung und Schweizer QR-Rechnung
async function generateRentalContractPdf(
  bookingId: string,
  recipient: RecipientData,
  mietdatum: string,
  festbeginn: string,
  mietbetrag: number,
  kaution: number,
  sender: SenderData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const curYear = new Date().getFullYear().toString();

  // 1. Briefkopf
  page.drawText("SPORTSCHÜTZEN MUHEN", {
    x: 20 * MM,
    y: 278 * MM,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  page.drawText("Vermietung Schützenstube Hard · 5037 Muhen", {
    x: 20 * MM,
    y: 273 * MM,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55),
  });

  // 2. Titel
  page.drawText(`Mietvertrag & Benützungsvereinbarung: ${bookingId}`, {
    x: 20 * MM,
    y: 258 * MM,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  let curY = 248 * MM;

  // 3. Parteien
  page.drawText("Vermieter:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page.drawText(`${CLUB_NAME}, 5037 Muhen (Vertretung: ${sender.vorname || "Vermietung"} ${sender.nachname || ""})`, {
    x: 50 * MM,
    y: curY,
    size: 9,
    font: fontRegular,
  });
  curY -= 5 * MM;

  const mieterName = [recipient.vorname, recipient.nachname].filter(Boolean).join(" ") || recipient.name || "–";
  page.drawText("Mieter:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page.drawText(`${mieterName}, ${recipient.strasse || ""}, ${recipient.plz || ""} ${recipient.ort || ""}`, {
    x: 50 * MM,
    y: curY,
    size: 9,
    font: fontRegular,
  });
  curY -= 4 * MM;
  page.drawText(`Kontakt: ${recipient.email || "–"} | Tel: ${recipient.telefon || "–"}`, {
    x: 50 * MM,
    y: curY,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  curY -= 7 * MM;

  // 4. Mietobjekt & Konditionen
  page.drawText("Mietdatum:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page.drawText(`${mietdatum} (Festbeginn: ${festbeginn || "Nach Vereinbarung"})`, { x: 50 * MM, y: curY, size: 9, font: fontRegular });
  curY -= 5 * MM;

  page.drawText("Mietobjekt:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page.drawText("Schützenstube Muhen inkl. Mobiliar, Küche, Geschirr und WC-Anlagen", { x: 50 * MM, y: curY, size: 9, font: fontRegular });
  curY -= 5 * MM;

  page.drawText("Gebühren:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  page.drawText(`Mietgebühr: CHF ${mietbetrag.toFixed(2)}  |  Kaution (Depot): CHF ${kaution.toFixed(2)}`, {
    x: 50 * MM,
    y: curY,
    size: 9,
    font: fontBold,
  });
  curY -= 8 * MM;

  // 5. Bestimmungen
  page.drawText("Wichtige Vereinbarungen & Benützungsordnung:", { x: 20 * MM, y: curY, size: 9, font: fontBold });
  curY -= 4.5 * MM;

  const terms = [
    "1. Der Vertrag tritt in Kraft, sobald die Mietgebühr via untenstehendem QR-Zahlteil innert 14 Tagen beglichen ist.",
    "2. Das Mietobjekt ist besenrein und mit gereinigtem Geschirr abzugeben. Abfälle sind selbst zu entsorgen.",
    "3. Die Nachtruhe (ab 22:00 Uhr im Aussenbereich) ist strikte einzuhalten. Fenster und Türen sind geschlossen zu halten.",
    "4. Allfällige Schäden an Einrichtung oder Schiessanlage sind dem Vermieter unverzüglich zu melden.",
    "5. Die Kaution wird nach erfolgter, beanstandungsloser Schlüssel- und Raumrückgabe rückerstattet.",
  ];

  terms.forEach((t) => {
    page.drawText(t, { x: 20 * MM, y: curY, size: 7.8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
    curY -= 4 * MM;
  });

  curY -= 3 * MM;

  // Unterschriften
  const dateStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  page.drawText(`Muhen, den ${dateStr}`, { x: 20 * MM, y: curY, size: 8.5, font: fontRegular });
  curY -= 6 * MM;

  page.drawText("Für den Verein: Sportschützen Muhen", { x: 20 * MM, y: curY, size: 8.5, font: fontBold });
  page.drawText("Der Mieter (gelesen & akzeptiert):", { x: 110 * MM, y: curY, size: 8.5, font: fontBold });

  curY -= 12 * MM;
  page.drawLine({ start: { x: 20 * MM, y: curY }, end: { x: 80 * MM, y: curY }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  page.drawLine({ start: { x: 110 * MM, y: curY }, end: { x: 180 * MM, y: curY }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });

  // QR-Bill für den Mietvertrag
  drawSwissQrBillSection(page, fontRegular, fontBold, bookingId, mietbetrag, recipient, curYear, "Miete Schützenhaus");

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
        payload.type || invRow?.type || "Rechnung"
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
        sender
      );

      const safeName = (recipient.nachname || recipient.firma || recipient.name || "Mieter")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      fileName = `Mietvertrag_${bookId}_${safeName}.pdf`;
      storageSubDir = `contracts/${curYear}`;
      docTitle = `Mietvertrag ${bookId} – ${recipient.name || ""}`;
    } else {
      throw new Error(`Unbekannte Aktion: ${action}`);
    }

    // --------------------------------------------------------------------------
    // UPLOAD IN SUPABASE STORAGE (Bucket: 'operatives-storage')
    // --------------------------------------------------------------------------
    const storageBucket = "operatives-storage";
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

    // Öffentliche URL abrufen
    const { data: urlData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
    publicUrl = urlData?.publicUrl || `${supabaseUrl}/storage/v1/object/public/${storageBucket}/${storagePath}`;

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
