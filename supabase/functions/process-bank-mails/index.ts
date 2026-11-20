// supabase/functions/process-bank-mails/index.ts
// ==============================================================================
// Automatischer Bank-Mail-Eingang (Raiffeisen -> Vermietung Schützenstube)
// Edge Function für Supabase (Infomaniak IMAP)
//
// Features:
// - Verbindet per TLS-IMAP (Port 993) zum Vereins-Postfach info@sportschuetzen-muhen.ch
// - Scannt Ordner 'Raiffeisen' (alle Mails, ideal für Filter & Testmails) sowie
//   'INBOX' (FROM noreply@ebanking.raiffeisen.ch AND SUBJECT Gutschrift)
// - Parst Vertragsnummer (z.B. V-2026-0050) und Gutschriftsbetrag + 3-Punkte-Fallback
// - Verbucht via RPC confirm_rental_payment() in Supabase (Single Source of Truth)
// - Sendet Bestätigungsmail (vm_bestaetigung) an Mieter & vm_info_wirtschaft an Wirtschaftsteam
// - Verschiebt Mail per IMAP MOVE nach 'Raiffeisen/Verarbeitet' bzw. 'Raiffeisen/Fehler'
// - Erstellt Rapport (vm_bank_report) an Verteiler Info_Mail_Bank_Eingang
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import {
  loadRentalSettings,
  renderRentalMail,
  sendViaMailEngine,
} from "../_shared/rental-mail.ts";

interface ParsedEmailMessage {
  uid: string;
  folder: string;
  uidValidity: string;
  messageId: string;
  from: string;
  subject: string;
  dateStr: string;
  plainText: string;
}

interface ParsedPaymentInfo {
  contractNumber: string | null;
  amount: number | null;
  bookingDate: string | null;
  payerName: string | null;
  payerAddress: string | null;
  rentDate: string | null;
  rawSender: string;
  subject: string;
  dateStr: string;
}

// ==============================================================================
// 1. Binärsicherer TLS-IMAP-Client für Infomaniak (Port 993)
// ==============================================================================
class ImapBankClient {
  private conn: Deno.TlsConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private byteBuf: Uint8Array = new Uint8Array(0);
  private tagCounter = 0;

  async connect(host: string, port: number = 993) {
    this.conn = await Deno.connectTls({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    const greeting = await this.readLine();
    if (!greeting.startsWith("* OK")) {
      throw new Error(`IMAP Banner ungültig: ${greeting}`);
    }
  }

  private async pullMore(): Promise<boolean> {
    if (!this.reader) throw new Error("IMAP Verbindung geschlossen");
    const { value, done } = await this.reader.read();
    if (done || !value) return false;
    const merged = new Uint8Array(this.byteBuf.length + value.length);
    merged.set(this.byteBuf, 0);
    merged.set(value, this.byteBuf.length);
    this.byteBuf = merged;
    return true;
  }

  private async readLine(): Promise<string> {
    while (true) {
      for (let i = 0; i < this.byteBuf.length - 1; i++) {
        if (this.byteBuf[i] === 13 && this.byteBuf[i + 1] === 10) {
          const lineBytes = this.byteBuf.slice(0, i);
          this.byteBuf = this.byteBuf.slice(i + 2);
          return new TextDecoder("utf-8", { fatal: false }).decode(lineBytes);
        }
      }
      const gotMore = await this.pullMore();
      if (!gotMore) {
        throw new Error("IMAP Stream unerwartet beendet");
      }
    }
  }

  private async readExactBytes(n: number): Promise<Uint8Array> {
    while (this.byteBuf.length < n) {
      const gotMore = await this.pullMore();
      if (!gotMore) {
        throw new Error(`IMAP Literal unvollständig (erwartet ${n}, erhalten ${this.byteBuf.length})`);
      }
    }
    const out = this.byteBuf.slice(0, n);
    this.byteBuf = this.byteBuf.slice(n);
    return out;
  }

  private async writeString(cmd: string) {
    if (!this.conn) throw new Error("IMAP nicht verbunden");
    const writer = this.conn.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(cmd));
    } finally {
      writer.releaseLock();
    }
  }

  private nextTag(): string {
    this.tagCounter += 1;
    return `B${String(this.tagCounter).padStart(3, "0")}`;
  }

  private escapeQuoted(val: string): string {
    return String(val || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private async runCommand(cmd: string): Promise<string[]> {
    const tag = this.nextTag();
    await this.writeString(`${tag} ${cmd}\r\n`);
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      if (line.startsWith(`${tag} `)) {
        if (!line.startsWith(`${tag} OK`)) {
          throw new Error(`IMAP Befehl '${cmd.split(" ")[0]}' fehlgeschlagen: ${line}`);
        }
        return lines;
      }
      lines.push(line);
    }
  }

  async login(user: string, pass: string) {
    await this.runCommand(`LOGIN "${this.escapeQuoted(user)}" "${this.escapeQuoted(pass)}"`);
  }

  async listFolders(): Promise<string[]> {
    const lines = await this.runCommand(`LIST "" "*"`);
    const folders: string[] = [];
    for (const line of lines) {
      // Format: * LIST (\Flags) "/" "FolderName" oder * LIST (\Flags) "/" FolderName
      const m = line.match(/^\*\s+LIST\s+\([^)]*\)\s+(?:"[^"]*"|NIL)\s+(.+)$/i);
      if (m) {
        let name = m[1].trim();
        if (name.startsWith('"') && name.endsWith('"')) {
          name = name.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        }
        folders.push(name);
      }
    }
    return folders;
  }

  async ensureFolder(folder: string, existingFolders: Set<string>) {
    if (existingFolders.has(folder.toLowerCase())) return;
    try {
      await this.runCommand(`CREATE "${this.escapeQuoted(folder)}"`);
      existingFolders.add(folder.toLowerCase());
      console.log(`📁 IMAP-Ordner '${folder}' erstellt.`);
    } catch (err) {
      const msg = String(err?.message || err);
      if (!/ALREADYEXISTS/i.test(msg)) {
        throw err;
      }
      existingFolders.add(folder.toLowerCase());
    }
  }

  async selectFolder(folder: string): Promise<{ uidValidity: string }> {
    const lines = await this.runCommand(`SELECT "${this.escapeQuoted(folder)}"`);
    let uidValidity = "0";
    for (const line of lines) {
      const m = line.match(/\[UIDVALIDITY\s+(\d+)\]/i);
      if (m) uidValidity = m[1];
    }
    return { uidValidity };
  }

  async uidSearch(criteria: string): Promise<string[]> {
    const lines = await this.runCommand(`UID SEARCH ${criteria}`);
    const uids: string[] = [];
    for (const line of lines) {
      const m = line.match(/^\*\s+SEARCH\s*(.*)$/i);
      if (m && m[1].trim()) {
        for (const token of m[1].trim().split(/\s+/)) {
          if (/^\d+$/.test(token)) uids.push(token);
        }
      }
    }
    return uids;
  }

  async uidFetchRaw(uid: string): Promise<Uint8Array | null> {
    const tag = this.nextTag();
    await this.writeString(`${tag} UID FETCH ${uid} (BODY.PEEK[])\r\n`);
    let rawBytes: Uint8Array | null = null;

    while (true) {
      const line = await this.readLine();
      if (line.startsWith(`${tag} `)) {
        if (!line.startsWith(`${tag} OK`)) {
          throw new Error(`IMAP UID FETCH ${uid} fehlgeschlagen: ${line}`);
        }
        return rawBytes;
      }
      const litMatch = line.match(/\{(\d+)\}\s*$/);
      if (litMatch) {
        const len = parseInt(litMatch[1], 10);
        rawBytes = await this.readExactBytes(len);
        // Abschliessendes ")" der FETCH-Antwortzeile einlesen
        await this.readLine();
      }
    }
  }

  async uidMove(uid: string, targetFolder: string) {
    const escaped = this.escapeQuoted(targetFolder);
    try {
      await this.runCommand(`UID MOVE ${uid} "${escaped}"`);
    } catch (_) {
      // Fallback für Server ohne MOVE-Erweiterung
      await this.runCommand(`UID COPY ${uid} "${escaped}"`);
      await this.runCommand(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);
      await this.runCommand(`EXPUNGE`);
    }
  }

  async close() {
    try {
      if (this.conn) {
        await this.runCommand("LOGOUT");
      }
    } catch (_) {
      // Ignorieren bei Schliessen
    } finally {
      if (this.reader) {
        try { this.reader.releaseLock(); } catch (_) {}
        this.reader = null;
      }
      if (this.conn) {
        try { this.conn.close(); } catch (_) {}
        this.conn = null;
      }
    }
  }
}

// ==============================================================================
// 2. RFC-822 / MIME-Dekodierung & Raiffeisen-Parser
// ==============================================================================
function decodeBytesWithCharset(bytes: Uint8Array, charsetRaw?: string): string {
  const cs = String(charsetRaw || "utf-8").trim().toLowerCase().replace(/["']/g, "");
  try {
    return new TextDecoder(cs || "utf-8", { fatal: false }).decode(bytes);
  } catch (_) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function decodeQuotedPrintableBytes(input: string): Uint8Array {
  const cleaned = input.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "=" && i + 2 < cleaned.length && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      out.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function decodeBase64Bytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, "");
  const binStr = atob(clean);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

function decodeRfc2047Header(str: string): string {
  return String(str || "")
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_m, charset, enc, text) => {
      try {
        if (enc.toUpperCase() === "B") {
          return decodeBytesWithCharset(decodeBase64Bytes(text), charset);
        }
        const qText = text.replace(/_/g, " ");
        return decodeBytesWithCharset(decodeQuotedPrintableBytes(qText), charset);
      } catch (_) {
        return text;
      }
    });
}

function splitHeaderAndBody(rawStr: string): { headerBlock: string; bodyStr: string } {
  const crlfIdx = rawStr.indexOf("\r\n\r\n");
  if (crlfIdx !== -1) {
    return { headerBlock: rawStr.slice(0, crlfIdx), bodyStr: rawStr.slice(crlfIdx + 4) };
  }
  const lfIdx = rawStr.indexOf("\n\n");
  if (lfIdx !== -1) {
    return { headerBlock: rawStr.slice(0, lfIdx), bodyStr: rawStr.slice(lfIdx + 2) };
  }
  return { headerBlock: rawStr, bodyStr: "" };
}

function parseHeaders(headerBlock: string): Record<string, string> {
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const map: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const k = line.slice(0, idx).trim().toLowerCase();
      const v = line.slice(idx + 1).trim();
      if (!map[k]) map[k] = v;
    }
  }
  return map;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<td[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#35;/g, "#")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&auml;/g, "ä").replace(/&Auml;/g, "Ä")
    .replace(/&ouml;/g, "ö").replace(/&Ouml;/g, "Ö")
    .replace(/&uuml;/g, "ü").replace(/&Uuml;/g, "Ü")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMimeTextParts(rawPart: string, outPlain: string[], outHtml: string[]) {
  const { headerBlock, bodyStr } = splitHeaderAndBody(rawPart);
  const headers = parseHeaders(headerBlock);
  const contentType = headers["content-type"] || "text/plain; charset=utf-8";
  const cte = (headers["content-transfer-encoding"] || "7bit").toLowerCase().trim();

  const boundaryMatch = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (/^multipart\//i.test(contentType) && boundaryMatch) {
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const delim = `--${boundary}`;
    const chunks = bodyStr.split(delim);
    for (let i = 1; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (chunk.startsWith("--")) break; // End-Boundary
      chunk = chunk.replace(/^\r?\n/, "");
      extractMimeTextParts(chunk, outPlain, outHtml);
    }
    return;
  }

  const charsetMatch = contentType.match(/charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  const charset = charsetMatch ? (charsetMatch[1] || charsetMatch[2]) : "utf-8";

  const decodePartBody = (): string => {
    if (cte === "base64") {
      try {
        return decodeBytesWithCharset(decodeBase64Bytes(bodyStr), charset);
      } catch (_) {
        return bodyStr;
      }
    }
    if (cte === "quoted-printable") {
      return decodeBytesWithCharset(decodeQuotedPrintableBytes(bodyStr), charset);
    }
    const bytes = new Uint8Array(bodyStr.length);
    for (let i = 0; i < bodyStr.length; i++) bytes[i] = bodyStr.charCodeAt(i) & 0xff;
    return decodeBytesWithCharset(bytes, charset);
  };

  if (/^text\/plain/i.test(contentType)) {
    outPlain.push(decodePartBody());
  } else if (/^text\/html/i.test(contentType)) {
    outHtml.push(decodePartBody());
  }
}

function parseRawRfc822Email(
  rawBytes: Uint8Array,
  meta: { uid: string; folder: string; uidValidity: string }
): ParsedEmailMessage {
  // Als ISO-8859-1 / Latin-1 1:1-Byte-String dekodieren, damit Byte-Indizes für MIME/QP/8bit exakt bleiben
  let rawStr = "";
  for (let i = 0; i < rawBytes.length; i++) {
    rawStr += String.fromCharCode(rawBytes[i]);
  }

  const { headerBlock } = splitHeaderAndBody(rawStr);
  const headers = parseHeaders(headerBlock);

  const outPlain: string[] = [];
  const outHtml: string[] = [];
  extractMimeTextParts(rawStr, outPlain, outHtml);

  let plainText = outPlain.join("\n").trim();
  if (!plainText && outHtml.length > 0) {
    plainText = htmlToPlainText(outHtml.join("\n"));
  }

  const rawMsgId = (headers["message-id"] || "").replace(/[<>]/g, "").trim();

  return {
    uid: meta.uid,
    folder: meta.folder,
    uidValidity: meta.uidValidity,
    messageId: rawMsgId,
    from: decodeRfc2047Header(headers["from"] || ""),
    subject: decodeRfc2047Header(headers["subject"] || ""),
    dateStr: headers["date"] || "",
    plainText,
  };
}

function parseRaiffeisenMail(msg: ParsedEmailMessage): ParsedPaymentInfo {
  const fullText = (msg.subject + "\n" + msg.plainText)
    .replace(/&#35;/g, "#")
    .replace(/\r/g, "");

  // Vertragsnummer suchen (z.B. V-2026-0050, V-2026-N001 oder ##2026-050##)
  let contractNumber: string | null = null;
  const matchV = fullText.match(/V-(\d{4}-N?\d{3,4})/i);
  if (matchV) {
    contractNumber = `V-${matchV[1].toUpperCase()}`;
  } else {
    const matchHash = fullText.match(/##(\d{4}-N?\d{3,4})##/i);
    if (matchHash) contractNumber = `V-${matchHash[1].toUpperCase()}`;
  }

  // Betrag suchen (z.B. "Betrag: 300.00 CHF", "300.00 CHF" oder "CHF 300.00")
  let amount: number | null = null;
  const matchAmt1 = fullText.match(/Betrag:\s*([\d']+[.,]\d{2})\s*CHF/i);
  if (matchAmt1) {
    amount = parseFloat(matchAmt1[1].replace(/'/g, "").replace(",", "."));
  } else {
    const matchAmt2 = fullText.match(/([\d']+[.,]\d{2})\s*CHF/i);
    if (matchAmt2) {
      amount = parseFloat(matchAmt2[1].replace(/'/g, "").replace(",", "."));
    } else {
      const matchAmt3 = fullText.match(/(?:Betrag:\s*)?CHF\s*([\d']+[.,]\d{2})/i);
      if (matchAmt3) {
        amount = parseFloat(matchAmt3[1].replace(/'/g, "").replace(",", "."));
      }
    }
  }

  // Buchungsdatum suchen
  let bookingDate: string | null = null;
  const matchDate = fullText.match(/Buchungsdatum:\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  if (matchDate) {
    bookingDate = `${matchDate[3]}-${matchDate[2]}-${matchDate[1]}`;
  }

  // Mieter-Name suchen (z.B. "Bezahlt für: Lenka Habenicht" oder "Gutschrift Lenka Habenicht")
  let payerName: string | null = null;
  const matchName1 = fullText.match(/Bezahlt für:\s*([^\n\r,;/]+)/i);
  if (matchName1) {
    payerName = matchName1[1].trim();
  } else {
    const matchName2 = fullText.match(/Gutschrift\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/);
    if (matchName2) {
      payerName = matchName2[1].trim();
    }
  }

  // Adresse suchen (z.B. "- Feldweg 11, 5040 Schoeftland")
  let payerAddress: string | null = null;
  const matchAddr = fullText.match(/-\s*([^,\n\r]+,\s*\d{4}\s+[^,\n\r]+)/);
  if (matchAddr) {
    payerAddress = matchAddr[1].trim();
  }

  // Mietdatum suchen (z.B. "Miete vom 14.11.2026")
  let rentDate: string | null = null;
  const matchRentDate = fullText.match(/Miete(?:\s+vom|\s+am)?\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  if (matchRentDate) {
    rentDate = `${matchRentDate[3]}-${matchRentDate[2]}-${matchRentDate[1]}`;
  }

  return {
    contractNumber,
    amount,
    bookingDate,
    payerName,
    payerAddress,
    rentDate,
    rawSender: msg.from,
    subject: msg.subject,
    dateStr: msg.dateStr,
  };
}

async function buildIngestKey(msg: ParsedEmailMessage): Promise<string> {
  if (msg.messageId) {
    const candidate = `imap-msgid:${msg.messageId}`;
    if (candidate.length <= 250) return candidate;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg.messageId));
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `imap-sha256:${hex}`;
  }
  return `imap:${msg.folder}:${msg.uidValidity}:${msg.uid}`.slice(0, 250);
}

// ==============================================================================
// 3. HTTP Handler
// ==============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Authentifizierungsprüfung:
  // 1. Cron-Aufruf mit x-cron-secret (wird über verify_bank_ingest_secret im Vault geprüft)
  // 2. ODER Autorisierter Benutzer mit vermietung.manage
  const cronSecret = req.headers.get("x-cron-secret");
  let isAuthorized = false;

  if (cronSecret) {
    const { data: validSecret } = await supabase.rpc("verify_bank_ingest_secret", { p_secret: cronSecret });
    if (validSecret === true) isAuthorized = true;
  }

  if (!isAuthorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userRes } = await supabase.auth.getUser(token);
      if (userRes && userRes.user) {
        const { data: hasPerm } = await supabase.rpc("user_has_permission", {
          p_user_id: userRes.user.id,
          p_permission: "vermietung.manage",
        });
        if (hasPerm === true) isAuthorized = true;
      }
    }
  }

  if (!isAuthorized && req.headers.get("Authorization")?.includes(supabaseServiceKey)) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ success: false, error: "Nicht autorisiert (vermietung.manage erforderlich)." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Infomaniak IMAP Credentials (Fallback auf SMTP_USER / SMTP_PASS)
  const imapHost = Deno.env.get("IMAP_HOST") || "mail.infomaniak.com";
  const imapPort = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);
  const imapUser = Deno.env.get("IMAP_USER") || Deno.env.get("SMTP_USER") || "info@sportschuetzen-muhen.ch";
  const imapPass = Deno.env.get("IMAP_PASS") || Deno.env.get("SMTP_PASS") || "";

  if (!imapUser || !imapPass) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Infomaniak IMAP Zugangsdaten fehlen auf CT 117 (IMAP_USER/SMTP_USER, IMAP_PASS/SMTP_PASS).",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const FOLDER_QUEUE = "Raiffeisen";
  const FOLDER_DONE = "Raiffeisen/Verarbeitet";
  const FOLDER_ERROR = "Raiffeisen/Fehler";

  const imap = new ImapBankClient();
  try {
    await imap.connect(imapHost, imapPort);
    await imap.login(imapUser, imapPass);

    const existingFolders = new Set((await imap.listFolders()).map((f) => f.toLowerCase()));
    await imap.ensureFolder(FOLDER_QUEUE, existingFolders);
    await imap.ensureFolder(FOLDER_DONE, existingFolders);
    await imap.ensureFolder(FOLDER_ERROR, existingFolders);

    // Mails abrufen:
    // 1. Alle Mails im Ordner 'Raiffeisen' (z.B. via Webmail-Filter oder Testmails von beliebigen Absendern)
    // 2. Gutschrifts-Mails in 'INBOX' von noreply@ebanking.raiffeisen.ch mit Betreff 'Gutschrift'
    const targets: { folder: string; uid: string; uidValidity: string }[] = [];
    const scanSpecs: { folder: string; criteria: string }[] = [
      { folder: FOLDER_QUEUE, criteria: "ALL" },
      { folder: "INBOX", criteria: `FROM "noreply@ebanking.raiffeisen.ch" SUBJECT "Gutschrift"` },
    ];

    for (const spec of scanSpecs) {
      const { uidValidity } = await imap.selectFolder(spec.folder);
      const uids = await imap.uidSearch(spec.criteria);
      for (const uid of uids) {
        if (targets.length < 20) {
          targets.push({ folder: spec.folder, uid, uidValidity });
        }
      }
    }

    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, mailbox: imapUser, message: "Keine neuen Bank-Mails vorhanden." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = await loadRentalSettings(supabase);
    const resultsSummary: any[] = [];
    let currentSelectedFolder = "";

    for (const item of targets) {
      if (currentSelectedFolder !== item.folder) {
        await imap.selectFolder(item.folder);
        currentSelectedFolder = item.folder;
      }

      const rawBytes = await imap.uidFetchRaw(item.uid);
      if (!rawBytes) continue;

      const msg = parseRawRfc822Email(rawBytes, item);
      const parsed = parseRaiffeisenMail(msg);
      const { contractNumber, amount, bookingDate, payerName, payerAddress, rentDate, rawSender, subject, dateStr } = parsed;

      const ingestKey = await buildIngestKey(msg);
      const excerpt = msg.plainText.replace(/\s+/g, " ").trim().slice(0, 400);

      // Log-Eintrag initial prüfen (Idempotenz)
      const { data: existingLog } = await supabase
        .from("bank_mail_ingest_logs")
        .select("id, result")
        .eq("gmail_message_id", ingestKey)
        .maybeSingle();

      if (existingLog && existingLog.result !== "processing") {
        // Bereits verarbeitet -> falls noch im Eingangsordner liegt, sauber wegräumen
        const targetArchive = (existingLog.result === "success" || existingLog.result === "already_paid")
          ? FOLDER_DONE
          : FOLDER_ERROR;
        await imap.uidMove(item.uid, targetArchive);
        continue;
      }

      let logId = existingLog?.id;
      if (!logId) {
        const parsedMailDate = dateStr ? new Date(dateStr) : new Date();
        const safeMailDate = isNaN(parsedMailDate.getTime()) ? new Date() : parsedMailDate;
        const { data: newLog, error: insErr } = await supabase
          .from("bank_mail_ingest_logs")
          .insert({
            gmail_message_id: ingestKey,
            gmail_thread_id: `${item.folder}:${item.uid}`,
            mail_from: rawSender,
            mail_subject: subject,
            mail_date: safeMailDate,
            contract_nr: contractNumber,
            amount_chf: amount,
            booking_date: bookingDate || new Date().toISOString().split("T")[0],
            payer_name: payerName,
            payer_address: payerAddress,
            rent_date: rentDate,
            result: "processing",
            raw_excerpt: excerpt,
          })
          .select("id")
          .single();
        if (insErr) {
          console.error("Fehler beim Erstellen des Ingest-Logs:", insErr);
          continue;
        }
        logId = newLog.id;
      }

      // Prüfungen: Vertragsnummer und gültiger Betrag sind zwingend (Name/Mietdatum sind optional, um Drittzahler nicht zu blockieren)
      if (!contractNumber || amount === null || amount <= 0) {
        const errMsg = !contractNumber
          ? "Keine Vertragsnummer (z.B. V-2026-0001) im Mailtext gefunden."
          : "Kein gültiger Zahlungsbetrag gefunden.";

        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "parse_error",
            error_message: errMsg,
          })
          .eq("id", logId);

        await imap.uidMove(item.uid, FOLDER_ERROR);

        await sendBankReport(supabase, settings, {
          ergebnis: "❌ Fehler: Daten unvollständig",
          vertragsnr: contractNumber || "Unbekannt",
          betrag: amount ? amount.toFixed(2) : "0.00",
          sollbetrag: "–",
          hinweis: `Das System konnte die Bank-Mail nicht eindeutig zuordnen.<br><b>Grund:</b> ${errMsg}`,
          rental: null,
        });

        resultsSummary.push({ id: ingestKey, result: "parse_error", error: errMsg });
        continue;
      }

      // Zahlungsstatus im Vermietungsmodul setzen (ohne Rechnungs-/FiBu-Buchung – diese erfolgt via CAMT)
      const payDate = bookingDate || new Date().toISOString().split("T")[0];
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("confirm_rental_payment", {
        p_booking_number: contractNumber,
        p_amount: amount,
        p_payment_date: payDate,
        p_source: "Bank-Mail Raiffeisen",
        p_payer_name: payerName,
        p_payer_address: payerAddress,
        p_rent_date: rentDate,
      });

      if (rpcErr || !rpcRes) {
        const errDetail = rpcErr ? rpcErr.message : "Unbekannter RPC-Fehler";
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "error",
            error_message: errDetail,
          })
          .eq("id", logId);

        await imap.uidMove(item.uid, FOLDER_ERROR);

        await sendBankReport(supabase, settings, {
          ergebnis: `🚨 Systemfehler bei ${contractNumber || payerName || "Zahlung"}`,
          vertragsnr: contractNumber || "–",
          betrag: amount.toFixed(2),
          sollbetrag: "–",
          hinweis: `Bei der Verbuchung trat ein Datenbankfehler auf:<br><code>${errDetail}</code>`,
          rental: null,
        });

        resultsSummary.push({ id: ingestKey, result: "error", error: errDetail });
        continue;
      }

      // Den tatsächlich gematchten Buchungsdatensatz laden
      const matchedVnr = rpcRes.booking_number || contractNumber;
      let rentalData: any = null;
      if (rpcRes.rental_id) {
        const { data: rData } = await supabase.from("rental_requests").select("*").eq("id", rpcRes.rental_id).maybeSingle();
        rentalData = rData;
      } else if (matchedVnr) {
        const { data: rData } = await supabase.from("rental_requests").select("*").eq("booking_number", matchedVnr).maybeSingle();
        rentalData = rData;
      }

      const sollAmount = rentalData?.total_amount_chf
        ? Number(rentalData.total_amount_chf).toFixed(2)
        : (rpcRes.soll_amount ? Number(rpcRes.soll_amount).toFixed(2) : "300.00");

      if (rpcRes.code === "unknown_contract") {
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "unknown_contract",
            error_message: rpcRes.message,
          })
          .eq("id", logId);

        await imap.uidMove(item.uid, FOLDER_ERROR);

        const detailHinweis = [
          `<b>Vertrag im Mail:</b> ${contractNumber || "–"}`,
          payerName ? `<b>Mieter:</b> ${payerName}` : null,
          payerAddress ? `<b>Adresse:</b> ${payerAddress}` : null,
          rentDate ? `<b>Mietdatum im Mail:</b> ${new Date(rentDate).toLocaleDateString("de-CH")}` : null,
          `<b>Betrag:</b> CHF ${amount.toFixed(2)}`,
          `<b>Grund:</b> ${rpcRes.message || "Keine passende Reservation gefunden."}`,
        ].filter(Boolean).join("<br>");

        await sendBankReport(supabase, settings, {
          ergebnis: `❓ Keine passende Reservation: ${contractNumber || payerName || "Unbekannt"}`,
          vertragsnr: contractNumber || "–",
          betrag: amount.toFixed(2),
          sollbetrag: "–",
          hinweis: `Das System konnte die Zahlung keinem offenen Vertrag zuordnen:<br>${detailHinweis}`,
          rental: null,
        });

        resultsSummary.push({ id: ingestKey, result: "unknown_contract" });
        continue;
      }

      if (rpcRes.code === "underpaid") {
        const displayVnr = matchedVnr || contractNumber || "–";
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "underpaid",
            contract_nr: matchedVnr || contractNumber,
            rental_request_id: rentalData?.id || null,
            error_message: rpcRes.message,
          })
          .eq("id", logId);

        await imap.uidMove(item.uid, FOLDER_ERROR);

        await sendBankReport(supabase, settings, {
          ergebnis: `⚠️ Zahlung zu niedrig: ${displayVnr}`,
          vertragsnr: displayVnr,
          betrag: amount.toFixed(2),
          sollbetrag: sollAmount,
          hinweis: `Erhalten: <b>CHF ${amount.toFixed(2)}</b> &bull; Erwartet (Soll): <b>CHF ${sollAmount}</b>.<br>Buchung wurde nicht automatisch freigegeben.`,
          rental: rentalData,
        });

        resultsSummary.push({ id: ingestKey, result: "underpaid" });
        continue;
      }

      if (rpcRes.code === "cancelled") {
        const displayVnr = matchedVnr || contractNumber || "–";
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "cancelled",
            contract_nr: matchedVnr || contractNumber,
            rental_request_id: rentalData?.id || null,
            error_message: rpcRes.message,
          })
          .eq("id", logId);

        await imap.uidMove(item.uid, FOLDER_ERROR);

        await sendBankReport(supabase, settings, {
          ergebnis: `⚠️ Zahlung für stornierten Vertrag: ${displayVnr}`,
          vertragsnr: displayVnr,
          betrag: amount.toFixed(2),
          sollbetrag: sollAmount,
          hinweis: `Für die stornierte Reservation <b>${displayVnr}</b> ging eine Zahlung von CHF ${amount.toFixed(2)} ein. Bitte Fall klären.`,
          rental: rentalData,
        });

        resultsSummary.push({ id: ingestKey, result: "cancelled" });
        continue;
      }

      // Erfolg oder bereits bezahlt
      const isAlready = rpcRes.code === "already_paid";
      const effectiveVnr = matchedVnr || contractNumber || rentalData?.booking_number || "–";
      await supabase
        .from("bank_mail_ingest_logs")
        .update({
          result: isAlready ? "already_paid" : "success",
          contract_nr: effectiveVnr !== "–" ? effectiveVnr : null,
          rental_request_id: rentalData?.id || null,
          match_method: rpcRes.match_method || "contract_nr",
          error_message: null,
        })
        .eq("id", logId);

      // Mail in Infomaniak-Ordner 'Raiffeisen/Verarbeitet' verschieben
      await imap.uidMove(item.uid, FOLDER_DONE);

      if (!isAlready && rentalData) {
        // 1. Zahlungsbestätigung & Schlüsselhinweis an Mieter (vm_bestaetigung)
        try {
          const renderedConfirm = await renderRentalMail(supabase, "vm_bestaetigung", rentalData, settings);
          await sendViaMailEngine({
            to: rentalData.email,
            cc: settings.rental_cc_emails || settings.club_email || undefined,
            ccSystemMailKey: "Info_Mail_an_Wirtschaftsverantwortliche",
            subject: renderedConfirm.subject,
            html: renderedConfirm.html,
            module: "vermietung",
            referenceId: effectiveVnr,
          });
        } catch (mErr: any) {
          console.error(`Fehler beim Senden der Zahlungsbestätigung an Mieter (${effectiveVnr}):`, mErr);
          await supabase.from("bank_mail_ingest_logs").update({ mail_error: mErr.message }).eq("id", logId);
        }

        // 2. Info-Mail an Wirtschaftsteam (vm_info_wirtschaft)
        try {
          const renderedWirt = await renderRentalMail(supabase, "vm_info_wirtschaft", rentalData, settings);
          await sendViaMailEngine({
            systemMailKey: "Info_Mail_an_Wirtschaftsverantwortliche",
            subject: renderedWirt.subject,
            html: renderedWirt.html,
            module: "vermietung",
            referenceId: effectiveVnr,
          });
        } catch (wErr: any) {
          console.error(`Fehler beim Senden der Wirtschafts-Info (${effectiveVnr}):`, wErr);
        }
      }

      // 3. Rapport an Vorstand / Admin (Info_Mail_Bank_Eingang)
      await sendBankReport(supabase, settings, {
        ergebnis: isAlready ? `ℹ️ Bereits bezahlt: ${effectiveVnr}` : `✅ Zahlung bestätigt: ${effectiveVnr}`,
        vertragsnr: effectiveVnr,
        betrag: amount.toFixed(2),
        sollbetrag: sollAmount,
        hinweis: isAlready
          ? `Zahlung war bereits im Vermietungsmodul erfasst. Mail wurde nach '${FOLDER_DONE}' verschoben.`
          : `Zahlungsstufe 1 (Info-Mail Bank) im Vermietungsmodul gesetzt und Bestätigungs-Mails an Mieter &amp; Wirtschaft versandt (FiBu-Buchung folgt über CAMT).`,
        rental: rentalData,
      });

      resultsSummary.push({ id: ingestKey, contract: effectiveVnr, result: isAlready ? "already_paid" : "success" });
    }

    return new Response(
      JSON.stringify({
        success: true,
        mailbox: imapUser,
        processed: resultsSummary.length,
        results: resultsSummary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Unerwarteter Fehler in process-bank-mails:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await imap.close();
  }
});

// Hilfsfunktion: Admin-Rapport senden
async function sendBankReport(supabase: any, settings: Record<string, string>, data: any) {
  try {
    const extra = {
      bank_ergebnis: data.ergebnis,
      vertragsnr: data.vertragsnr,
      bank_betrag: data.betrag,
      bank_sollbetrag: data.sollbetrag,
      bank_buchungsdatum: new Date().toLocaleDateString("de-CH"),
      bank_hinweis: data.hinweis,
    };

    const rendered = await renderRentalMail(supabase, "vm_bank_report", data.rental, settings, extra);

    await sendViaMailEngine({
      systemMailKey: "Info_Mail_Bank_Eingang",
      subject: rendered.subject,
      html: rendered.html,
      module: "vermietung",
      referenceId: data.vertragsnr,
    });
  } catch (err) {
    console.error("Konnte Admin-Rapport vm_bank_report nicht senden:", err);
  }
}
