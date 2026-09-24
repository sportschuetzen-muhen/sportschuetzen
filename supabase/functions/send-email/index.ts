// supabase/functions/send-email/index.ts
// ==============================================================================
// Phase 20: Zentrale Mail-Engine (Supabase Edge Function)
// Projekt: Vereinsportal Sportschützen Muhen
//
// Features:
// - Universeller SMTP-Versand via Deno TLS (Port 465 / 587)
// - Unterstützt Gmail (aktuell) und Infomaniak (Ziel-Domainhoster)
// - Automatische Ablage im Audit-Log public.mail_logs (Phase 13)
// - Auflösung von Anhängen aus Base64 oder direkt aus Supabase Storage
// - Fallback / Simulationsmodus bei fehlenden SMTP-Credentials
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

interface Attachment {
  filename: string;
  contentBase64?: string;
  contentType?: string;
  storagePath?: string; // z.B. 'invoices/2026/RE-001.pdf'
  storageBucket?: string; // Standard: 'operatives-storage'
}

interface SendEmailPayload {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  senderName?: string;
  senderEmail?: string;
  attachments?: Attachment[];
  moduleRef?: string;
  recordId?: string;
  systemMailKey?: string; // Optional: Löst Empfänger aus public.system_mail_configs auf
  simulate?: boolean;
}

// Hilfsfunktion: UTF-8 Subject Base64 Header Encoding
function encodeSubject(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

// SMTP Client mittels Deno TCP / TLS
class SmtpClient {
  private conn: Deno.TlsConn | Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer: string = "";

  async connect(host: string, port: number, isTls: boolean = true) {
    if (isTls) {
      this.conn = await Deno.connectTls({ hostname: host, port: port });
    } else {
      this.conn = await Deno.connect({ hostname: host, port: port });
    }
    this.reader = this.conn.readable.getReader();
    const banner = await this.readResponse();
    if (!banner.startsWith("220")) {
      throw new Error(`SMTP Banner ungültig: ${banner}`);
    }
  }

  private async readResponse(): Promise<string> {
    const decoder = new TextDecoder();
    while (true) {
      const lineEnd = this.buffer.indexOf("\r\n");
      if (lineEnd !== -1) {
        const line = this.buffer.substring(0, lineEnd);
        this.buffer = this.buffer.substring(lineEnd + 2);
        // Multiline responses in SMTP: '250-...' means more lines follow, '250 ...' is end
        if (line.length >= 4 && line[3] === "-") {
          continue; // Weiterlesen bis Zeile ohne '-'
        }
        return line;
      }
      if (!this.reader) throw new Error("Connection closed");
      const { value, done } = await this.reader.read();
      if (done) throw new Error("SMTP Stream beendet");
      this.buffer += decoder.decode(value);
    }
  }

  async sendCommand(cmd: string, expectedCodePrefix: string): Promise<string> {
    if (!this.conn) throw new Error("Nicht verbunden");
    const writer = this.conn.writable.getWriter();
    await writer.write(new TextEncoder().encode(cmd + "\r\n"));
    writer.releaseLock();

    const response = await this.readResponse();
    if (!response.startsWith(expectedCodePrefix)) {
      throw new Error(`SMTP Fehler für Befehl '${cmd.split(" ")[0]}': ${response}`);
    }
    return response;
  }

  async sendRawData(data: string) {
    if (!this.conn) throw new Error("Nicht verbunden");
    const writer = this.conn.writable.getWriter();
    await writer.write(new TextEncoder().encode(data));
    writer.releaseLock();
  }

  async close() {
    try {
      if (this.conn) {
        await this.sendCommand("QUIT", "221");
      }
    } catch (_) {
      // Ignorieren bei Schliessen
    } finally {
      if (this.conn) {
        try { this.conn.close(); } catch (_) {}
        this.conn = null;
      }
    }
  }
}

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // SMTP Konfiguration aus Supabase Secrets
  const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
  const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
  const smtpUser = Deno.env.get("SMTP_USER") || "sportschuetzen.muhen@gmail.com";
  const smtpPass = Deno.env.get("SMTP_PASS") || "";
  const defaultFrom = Deno.env.get("SMTP_FROM") || `Sportschützen Muhen <${smtpUser}>`;
  const forceSimulate = Deno.env.get("SIMULATE_EMAIL") === "true";

  let payload: SendEmailPayload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: "Ungültiger JSON-Payload: " + e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Empfänger validieren & zusammenstellen
  let recipients: string[] = [];
  if (Array.isArray(payload.to)) {
    recipients = payload.to.filter(Boolean);
  } else if (typeof payload.to === "string" && payload.to.trim()) {
    recipients = payload.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }

  // Optional: System-Mail-Key auflösen
  if (payload.systemMailKey) {
    const { data: sysMails } = await supabase.rpc("get_system_mail_array", {
      p_schluessel: payload.systemMailKey,
    });
    if (sysMails && Array.isArray(sysMails)) {
      recipients.push(...sysMails);
    }
  }

  // Deduplizieren
  recipients = Array.from(new Set(recipients));

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ success: false, error: "Keine gültigen Empfänger angegeben." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ccList: string[] = Array.isArray(payload.cc)
    ? payload.cc
    : (payload.cc ? payload.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []);
  const bccList: string[] = Array.isArray(payload.bcc)
    ? payload.bcc
    : (payload.bcc ? payload.bcc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []);

  const senderEmail = payload.senderEmail || smtpUser;
  const senderName = payload.senderName || "Sportschützen Muhen";
  const fromHeader = `"${senderName}" <${senderEmail}>`;

  const subject = payload.subject || "Mitteilung Sportschützen Muhen";
  const bodyText = payload.text || (payload.html ? payload.html.replace(/<[^>]*>/g, " ") : "");
  const bodyHtml = payload.html || `<div style="font-family: sans-serif; font-size: 14px;">${bodyText.replace(/\n/g, "<br>")}</div>`;
  const snippet = bodyText.substring(0, 450);

  // 2. Anhänge laden / vorbereiten
  const preparedAttachments: { filename: string; contentType: string; base64: string }[] = [];
  if (payload.attachments && payload.attachments.length > 0) {
    for (const att of payload.attachments) {
      if (att.contentBase64) {
        preparedAttachments.push({
          filename: att.filename,
          contentType: att.contentType || "application/octet-stream",
          base64: att.contentBase64,
        });
      } else if (att.storagePath) {
        // Lade direkt aus Supabase Storage
        const bucket = att.storageBucket || "operatives-storage";
        const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(att.storagePath);
        if (dlErr || !fileData) {
          console.warn(`⚠️ Anhang ${att.storagePath} konnte nicht aus Storage geladen werden:`, dlErr);
        } else {
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          preparedAttachments.push({
            filename: att.filename,
            contentType: att.contentType || "application/pdf",
            base64: btoa(binary),
          });
        }
      }
    }
  }

  const isSimulation = payload.simulate || forceSimulate || !smtpPass;
  const moduleRef = payload.moduleRef || "allgemein";
  const recordId = payload.recordId || null;
  const primaryRecipient = recipients[0];
  const allTargetAddresses = Array.from(new Set([...recipients, ...ccList, ...bccList]));

  // 3. E-Mail versenden oder simulieren
  let sendSuccess = false;
  let errorMessage: string | null = null;
  let sentVia = isSimulation ? "Test_Simuliert" : (smtpHost.includes("gmail") ? "Supabase_Gmail_SMTP" : "Supabase_Infomaniak_SMTP");

  if (isSimulation) {
    console.log(`🧪 [SIMULATION] Mail an ${recipients.join(", ")} | Betreff: ${subject}`);
    sendSuccess = true;
  } else {
    const client = new SmtpClient();
    try {
      console.log(`📡 Verbinde mit SMTP Server ${smtpHost}:${smtpPort}...`);
      await client.connect(smtpHost, smtpPort, smtpPort === 465);

      await client.sendCommand("EHLO muhen.local", "250");
      await client.sendCommand("AUTH LOGIN", "334");
      await client.sendCommand(btoa(smtpUser), "334");
      await client.sendCommand(btoa(smtpPass), "235");

      // Absender
      await client.sendCommand(`MAIL FROM:<${senderEmail}>`, "250");

      // Alle Empfänger
      for (const rcpt of allTargetAddresses) {
        await client.sendCommand(`RCPT TO:<${rcpt}>`, "250");
      }

      await client.sendCommand("DATA", "354");

      // MIME Multipart Konstruktion
      const boundaryMixed = "===MIXED_" + Math.random().toString(36).substring(2) + "===";
      const boundaryAlt = "===ALT_" + Math.random().toString(36).substring(2) + "===";

      let rfc822 = "";
      rfc822 += `From: ${fromHeader}\r\n`;
      rfc822 += `To: ${recipients.join(", ")}\r\n`;
      if (ccList.length > 0) rfc822 += `Cc: ${ccList.join(", ")}\r\n`;
      rfc822 += `Subject: ${encodeSubject(subject)}\r\n`;
      rfc822 += `Date: ${new Date().toUTCString()}\r\n`;
      rfc822 += `MIME-Version: 1.0\r\n`;
      rfc822 += `Content-Type: multipart/mixed; boundary="${boundaryMixed}"\r\n\r\n`;

      // Text / HTML Part
      rfc822 += `--${boundaryMixed}\r\n`;
      rfc822 += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n`;

      rfc822 += `--${boundaryAlt}\r\n`;
      rfc822 += `Content-Type: text/plain; charset=utf-8\r\n`;
      rfc822 += `Content-Transfer-Encoding: base64\r\n\r\n`;
      rfc822 += btoa(unescape(encodeURIComponent(bodyText))) + "\r\n\r\n";

      rfc822 += `--${boundaryAlt}\r\n`;
      rfc822 += `Content-Type: text/html; charset=utf-8\r\n`;
      rfc822 += `Content-Transfer-Encoding: base64\r\n\r\n`;
      rfc822 += btoa(unescape(encodeURIComponent(bodyHtml))) + "\r\n\r\n";

      rfc822 += `--${boundaryAlt}--\r\n\r\n`;

      // Anhänge
      for (const att of preparedAttachments) {
        rfc822 += `--${boundaryMixed}\r\n`;
        rfc822 += `Content-Type: ${att.contentType}; name="${att.filename}"\r\n`;
        rfc822 += `Content-Transfer-Encoding: base64\r\n`;
        rfc822 += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
        // Zeilenumbrüche alle 76 Zeichen für Base64
        const formattedBase64 = att.base64.match(/.{1,76}/g)?.join("\r\n") || att.base64;
        rfc822 += formattedBase64 + "\r\n\r\n";
      }

      rfc822 += `--${boundaryMixed}--\r\n`;
      rfc822 += "\r\n.\r\n";

      await client.sendRawData(rfc822);
      const resData = await client.sendCommand("", "250");
      console.log("✅ SMTP Versand erfolgreich:", resData);
      sendSuccess = true;
    } catch (smtpErr) {
      console.error("❌ SMTP Versandfehler:", smtpErr);
      sendSuccess = false;
      errorMessage = smtpErr.message || String(smtpErr);
    } finally {
      await client.close();
    }
  }

  // 4. Audit-Log in public.mail_logs eintragen (Phase 13 Standard)
  let logId: string | null = null;
  try {
    const hasPdf = preparedAttachments.some((a) => a.contentType.includes("pdf") || a.filename.endsWith(".pdf"));
    const attNames = preparedAttachments.map((a) => a.filename).join(", ") || null;
    const recipientsSummary = recipients.slice(0, 5).join(", ") + (recipients.length > 5 ? ` (+${recipients.length - 5} weitere)` : "");

    const { data: logEntry, error: logErr } = await supabase.from("mail_logs").insert({
      module_ref: moduleRef,
      record_id: recordId,
      recipient_email: primaryRecipient,
      recipient_name: payload.to ? (Array.isArray(payload.to) ? null : String(payload.to)) : null,
      cc_email: ccList.join(", ") || null,
      subject: subject,
      body_snippet: snippet,
      status: sendSuccess ? (isSimulation ? "simuliert" : "gesendet") : "fehler",
      error_message: errorMessage,
      sender_email: senderEmail,
      sender_name: senderName,
      attachment_name: attNames,
      has_pdf: hasPdf,
      sent_via: sentVia,
      created_by: "supabase_edge_function",
      recipient_count: recipients.length,
      recipients_summary: recipientsSummary,
      metadata: {
        all_recipients: recipients,
        cc: ccList,
        attachments_count: preparedAttachments.length,
        smtp_host: smtpHost,
      },
    }).select("id").single();

    if (!logErr && logEntry) {
      logId = logEntry.id;
    } else if (logErr) {
      console.warn("⚠️ Konnte Audit-Log nicht schreiben:", logErr);
    }
  } catch (auditErr) {
    console.warn("⚠️ Fehler bei Audit-Log Eintrag:", auditErr);
  }

  // 5. Response an Aufrufer
  if (sendSuccess) {
    return new Response(
      JSON.stringify({
        success: true,
        logId: logId,
        simulated: isSimulation,
        recipientCount: recipients.length,
        message: isSimulation
          ? "E-Mail simuliert (kein SMTP-Versand, da SIMULATE_EMAIL aktiv oder SMTP_PASS nicht hinterlegt)"
          : `E-Mail erfolgreich via ${smtpHost} an ${recipients.length} Empfänger versendet.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage || "Unbekannter SMTP-Fehler",
        logId: logId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
