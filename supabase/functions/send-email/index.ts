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
  path?: string; // URL oder StoragePath
}

interface SendEmailPayload {
  to: string | string[];
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  senderName?: string;
  senderEmail?: string;
  attachments?: Attachment[];
  moduleRef?: string;
  module?: string;
  recordId?: string;
  referenceId?: string;
  systemMailKey?: string; // Optional: Löst Empfänger aus public.system_mail_configs auf
  ccSystemMailKey?: string; // Optional: Löst CC-Empfänger aus public.system_mail_configs auf
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

// Hilfsfunktion: RFC 2047 MIME Encoding für Header-Phrasen (Display-Names in From/To/Cc)
function encodeHeaderPhrase(str: string): string {
  if (/^[\x20-\x7E]+$/.test(str) && !/[<>\"]/.test(str)) {
    return `"${str}"`;
  }
  return encodeSubject(str);
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

// IMAP Client mittels Deno TLS zur Ablage gesendeter Mails im Sent-Ordner (z.B. Infomaniak)
class ImapClient {
  private conn: Deno.TlsConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = "";
  private tagCounter = 0;

  async connect(host: string, port: number = 993) {
    this.conn = await Deno.connectTls({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    const greeting = await this.readLine();
    if (!greeting.startsWith("* OK")) {
      throw new Error(`IMAP Banner ungültig: ${greeting}`);
    }
  }

  private async readLine(): Promise<string> {
    const decoder = new TextDecoder();
    while (true) {
      const idx = this.buffer.indexOf("\r\n");
      if (idx !== -1) {
        const line = this.buffer.substring(0, idx);
        this.buffer = this.buffer.substring(idx + 2);
        return line;
      }
      if (!this.reader) throw new Error("IMAP Verbindung geschlossen");
      const { value, done } = await this.reader.read();
      if (done) throw new Error("IMAP Stream unerwartet beendet");
      this.buffer += decoder.decode(value, { stream: true });
    }
  }

  private async writeBytes(bytes: Uint8Array) {
    if (!this.conn) throw new Error("IMAP nicht verbunden");
    const writer = this.conn.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  private async writeString(text: string) {
    await this.writeBytes(new TextEncoder().encode(text));
  }

  private nextTag(): string {
    this.tagCounter += 1;
    return `A${String(this.tagCounter).padStart(3, "0")}`;
  }

  private escapeQuoted(val: string): string {
    return String(val || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private async readUntilTag(tag: string): Promise<string> {
    while (true) {
      const line = await this.readLine();
      if (line.startsWith(`${tag} `)) {
        if (!line.startsWith(`${tag} OK`)) {
          throw new Error(`IMAP Befehl fehlgeschlagen: ${line}`);
        }
        return line;
      }
    }
  }

  async login(user: string, pass: string) {
    const tag = this.nextTag();
    await this.writeString(`${tag} LOGIN "${this.escapeQuoted(user)}" "${this.escapeQuoted(pass)}"\r\n`);
    await this.readUntilTag(tag);
  }

  async appendSeen(folder: string, rfc822Bytes: Uint8Array) {
    const tag = this.nextTag();
    await this.writeString(`${tag} APPEND "${this.escapeQuoted(folder)}" (\\Seen) {${rfc822Bytes.byteLength}}\r\n`);

    while (true) {
      const line = await this.readLine();
      if (line.startsWith("+")) {
        break;
      }
      if (line.startsWith(`${tag} `)) {
        throw new Error(`IMAP APPEND abgelehnt: ${line}`);
      }
    }

    const payload = new Uint8Array(rfc822Bytes.byteLength + 2);
    payload.set(rfc822Bytes, 0);
    payload[rfc822Bytes.byteLength] = 13;
    payload[rfc822Bytes.byteLength + 1] = 10;
    await this.writeBytes(payload);

    await this.readUntilTag(tag);
  }

  async close() {
    try {
      if (this.conn) {
        const tag = this.nextTag();
        await this.writeString(`${tag} LOGOUT\r\n`);
        await this.readUntilTag(tag);
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

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://supabase-muhen.danfamily.uk";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Aufrufer-Authentifizierung ermitteln
  const authHeader = req.headers.get("Authorization") || "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = Boolean(callerToken && supabaseServiceKey && callerToken === supabaseServiceKey);
  let callerUser: any = null;
  if (callerToken && !isServiceRole) {
    try {
      const { data: { user } } = await supabase.auth.getUser(callerToken);
      if (user?.id) callerUser = user;
    } catch (_) {}
  }

  // SMTP & IMAP Konfiguration aus Supabase Secrets
  const smtpHost = Deno.env.get("SMTP_HOST") || "mail.infomaniak.com";
  const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
  const smtpUser = Deno.env.get("SMTP_USER") || "info@sportschuetzen-muhen.ch";
  const smtpPass = Deno.env.get("SMTP_PASS") || "";
  const defaultFrom = Deno.env.get("SMTP_FROM") || `Sportschützen Muhen <${smtpUser}>`;
  const forceSimulate = Deno.env.get("SIMULATE_EMAIL") === "true";
  const imapHost = Deno.env.get("IMAP_HOST") || (smtpHost.includes("infomaniak") ? "mail.infomaniak.com" : smtpHost);
  const imapPort = parseInt(Deno.env.get("IMAP_PORT") || "993", 10);
  const imapUser = Deno.env.get("IMAP_USER") || smtpUser;
  const imapPass = Deno.env.get("IMAP_PASS") || smtpPass;
  const imapSentFolder = Deno.env.get("IMAP_SENT_FOLDER") || "Sent";
  const saveToSentFolder = Deno.env.get("IMAP_SAVE_SENT") !== "false" && !smtpHost.includes("gmail");

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

  const rawCcList: string[] = Array.isArray(payload.cc)
    ? [...payload.cc]
    : (payload.cc ? payload.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []);

  // Optional: CC-System-Mail-Key auflösen (z.B. Info_Mail_an_Wirtschaftsverantwortliche)
  if (payload.ccSystemMailKey) {
    try {
      const { data: sysCcMails } = await supabase.rpc("get_system_mail_array", {
        p_schluessel: payload.ccSystemMailKey,
      });
      if (sysCcMails && Array.isArray(sysCcMails)) {
        rawCcList.push(...sysCcMails);
      }
    } catch (ccErr) {
      console.warn(`⚠️ Konnte ccSystemMailKey '${payload.ccSystemMailKey}' nicht auflösen:`, ccErr);
    }
  }

  const stripHeaderChars = (val: string) => String(val || "").replace(/[\r\n<>]/g, "").trim();
  const senderEmail = stripHeaderChars(smtpUser) || "info@sportschuetzen-muhen.ch";
  const senderName = String(payload.senderName || "Sportschützen Muhen").replace(/[\r\n]/g, " ").trim();
  const fromHeader = `${encodeHeaderPhrase(senderName)} <${senderEmail}>`;

  // Empfänger & CC/BCC von Zeilenumbrüchen bereinigen (SMTP-Header-Injection-Schutz)
  recipients = recipients.map(stripHeaderChars).filter(Boolean);

  // CC bereinigen: Duplikate entfernen und Adressen ausschliessen, die bereits in 'recipients' stehen
  const recipientSet = new Set(recipients.map(r => r.toLowerCase()));
  const ccList: string[] = Array.from(new Set(rawCcList))
    .map(stripHeaderChars)
    .filter((s) => s && !recipientSet.has(s.toLowerCase()));

  const bccList: string[] = (Array.isArray(payload.bcc)
    ? payload.bcc
    : (payload.bcc ? payload.bcc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []))
    .map(stripHeaderChars)
    .filter(Boolean);

  const reqModuleRef = String(payload.moduleRef || payload.module || "allgemein").trim();

  // RBAC-Prüfung für authentifizierte Benutzer (SP-2026-002 / SEC-013 & SEC-014: gesperrte Admins blockiert, modulgenaue Rechte geladen)
  let isAuthorizedBoardManager = false;
  let isCallerSuperAdmin = false;
  const callerPerms = new Set<string>();
  if (!isServiceRole && callerUser) {
    try {
      const { data: adminRows } = await supabase
        .from("admin_profiles")
        .select("is_active")
        .eq("auth_user_id", callerUser.id);
      const hasInactive = (adminRows || []).some((r: any) => r.is_active === false);
      const hasActive = (adminRows || []).some((r: any) => r.is_active === true);

      if (!(hasInactive && !hasActive)) {
        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", callerUser.id);

        const roleList = (userRoles || []).map((r: { role: string }) => String(r.role || "").toLowerCase()).filter(Boolean);
        if (roleList.includes("admin")) {
          isCallerSuperAdmin = true;
          isAuthorizedBoardManager = true;
          callerPerms.add("*");
        } else if (roleList.length > 0) {
          const { data: rolePerms } = await supabase
            .from("role_permissions")
            .select("permission")
            .in("role", roleList);

          for (const p of rolePerms || []) {
            const val = String((p as { permission: string }).permission || "").trim();
            if (val) callerPerms.add(val);
          }

          if (callerPerms.has("*")) {
            isCallerSuperAdmin = true;
            isAuthorizedBoardManager = true;
          } else if (reqModuleRef === "system_test") {
            isAuthorizedBoardManager = callerPerms.has("mail.manage");
          } else {
            isAuthorizedBoardManager = Array.from(callerPerms).some((p) => p.endsWith(".manage"));
          }
        }
      }
    } catch (rbacErr) {
      console.warn("⚠️ RBAC-Prüfung in send-email fehlgeschlagen:", rbacErr);
      isAuthorizedBoardManager = false;
    }
  }

  // Missbrauchsschutz: Unberechtigte oder anonyme Aufrufe nur für verifizierte Flows zulassen
  let isAllowedPublicRentalFlow = false;
  let allowedPublicRentalStoragePath: string | null = null;
  let allowedPublicRentalFileUrl: string | null = null;

  if (!isServiceRole && !isAuthorizedBoardManager) {
    const hasNoAttachments = !payload.attachments || payload.attachments.length === 0;
    const isWebsiteContactFlow =
      payload.systemMailKey === "Info_Mail_Kontakt_Website" &&
      !payload.to &&
      !payload.cc &&
      !payload.bcc &&
      hasNoAttachments;

    // Standblatt-Upload: Empfänger muss leer oder eine verifizierte aktive/passive Mitglieder-E-Mail sein (kein offenes Relay!)
    let isMemberStandblattFlow = false;
    if (
      Boolean(callerUser) &&
      payload.ccSystemMailKey === "Info_Mail_Standblatt_Upload" &&
      reqModuleRef === "jahresmeisterschaft" &&
      !payload.cc &&
      bccList.length === 0 &&
      hasNoAttachments &&
      recipients.length <= 1
    ) {
      if (recipients.length === 0) {
        isMemberStandblattFlow = true;
      } else {
        const targetEmail = recipients[0].trim().toLowerCase();
        const { data: memberMatch } = await supabase
          .from("members")
          .select("person_number")
          .ilike("primary_email", targetEmail)
          .or("is_active.eq.true,is_passive.eq.true")
          .limit(1)
          .maybeSingle();
        if (memberMatch) {
          isMemberStandblattFlow = true;
        }
      }
    }

    if (!isWebsiteContactFlow && !isMemberStandblattFlow && reqModuleRef === "vermietung" && bccList.length === 0) {
      const allowedEmails = new Set<string>(["info@sportschuetzen-muhen.ch", "sportschuetzen.muhen@gmail.com"]);
      const addEmailList = (val: unknown) => {
        if (!val) return;
        const arr = Array.isArray(val) ? val : String(val).split(/[,;]/);
        for (const item of arr) {
          const clean = String(item || "").trim().toLowerCase();
          if (clean) allowedEmails.add(clean);
        }
      };

      const { data: rSettings } = await supabase
        .from("rental_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["club_email", "rental_cc_emails", "wirtschaft_email"]);
      for (const s of rSettings || []) addEmailList(s.setting_value);

      for (const sysKey of ["Info_Mail_an_Wirtschaftsverantwortliche"]) {
        const { data: sysMails } = await supabase.rpc("get_system_mail_array", { p_schluessel: sysKey });
        addEmailList(sysMails);
      }

      if (payload.recordId) {
        const { data: rentalRow } = await supabase
          .from("rental_requests")
          .select("email, status, contract_storage_path, contract_file_url")
          .eq("booking_number", String(payload.recordId).trim())
          .maybeSingle();
        if (rentalRow && rentalRow.status !== "cancelled") {
          addEmailList(rentalRow.email);
          if (rentalRow.contract_storage_path) {
            allowedPublicRentalStoragePath = String(rentalRow.contract_storage_path).trim();
          }
          if (rentalRow.contract_file_url) {
            allowedPublicRentalFileUrl = String(rentalRow.contract_file_url).trim();
          }
        }
      }

      const allTargets = [...recipients, ...ccList].map((e) => e.trim().toLowerCase()).filter(Boolean);
      isAllowedPublicRentalFlow =
        allTargets.length > 0 && allTargets.every((addr) => allowedEmails.has(addr));
    }

    if (!isWebsiteContactFlow && !isMemberStandblattFlow && !isAllowedPublicRentalFlow) {
      return new Response(
        JSON.stringify({
          success: false,
          error: callerUser
            ? "Keine Berechtigung für den E-Mail-Versand (erfordert Vorstands-Verwaltungsrecht)."
            : "Nicht autorisierter E-Mail-Versand (Authentifizierung erforderlich).",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  const subject = String(payload.subject || "Mitteilung Sportschützen Muhen").replace(/[\r\n]/g, " ").trim();
  const bodyText = payload.text || (payload.html ? payload.html.replace(/<[^>]*>/g, " ") : "");
  const bodyHtml = payload.html || `<div style="font-family: sans-serif; font-size: 14px;">${bodyText.replace(/\n/g, "<br>")}</div>`;
  const snippet = bodyText.substring(0, 450);

  // 2. Anhänge laden / vorbereiten (Base64, storagePath oder Download via path URL)
  // Modulgenaue Storage-Prüfung (SP-2026-002 / SEC-014 & SEC-017) + SSRF-Härtung (SEC-016)
  const canReadStorageAttachment = (bucketName: string, rawPath: string): boolean => {
    if (isServiceRole || isCallerSuperAdmin || callerPerms.has("*")) return true;
    if (!isAuthorizedBoardManager) return false;
    const p = rawPath.replace(/^\/+/, "");
    if (p.includes("..")) return false;
    const hasAny = (list: string[]) => list.some((perm) => callerPerms.has(perm));

    if (bucketName === "operatives-storage") {
      if (p.startsWith("avatars/") || p === "assets/logo.png") return true;
      if (p.startsWith("invoices/") || /^archive\/[^/]+\/invoices\//.test(p)) {
        return hasAny(["rechnungen.view", "rechnungen.manage", "jahresbeitrag.view", "jahresbeitrag.manage", "buchhaltung.view", "buchhaltung.manage", "vermietung.view", "vermietung.manage", "inventar.view", "inventar.manage"]);
      }
      if (p.startsWith("contracts/") || /^archive\/[^/]+\/contracts\//.test(p)) {
        return hasAny(["vermietung.view", "vermietung.manage", "rechnungen.view", "rechnungen.manage", "buchhaltung.view", "buchhaltung.manage"]);
      }
      if (p.startsWith("gv/") || p.startsWith("gv-dossiers/") || /^archive\/[^/]+\/gv\//.test(p)) {
        return hasAny(["gv.view", "gv.manage", "mail.manage"]);
      }
      if (p.startsWith("letters/") || /^archive\/[^/]+\/letters\//.test(p)) {
        return hasAny(["mail.view", "mail.manage", "dokumente.view", "dokumente.manage"]);
      }
      if (p.startsWith("endschiessen/") || /^archive\/[^/]+\/endschiessen\//.test(p)) {
        return hasAny(["endschiessen.view", "endschiessen.manage"]);
      }
      if (p.startsWith("event-documents/")) {
        return hasAny(["anlaesse.view", "anlaesse.manage", "umfragen.view", "umfragen.manage"]);
      }
      return false;
    }
    if (bucketName === "club-documents") {
      return hasAny(["archiv.view", "archiv.manage", "dokumente.view", "dokumente.manage"]);
    }
    if (bucketName === "campaign-assets") {
      return hasAny(["mail.view", "mail.manage", "gv.view", "gv.manage"]);
    }
    if (bucketName === "jm-ranglisten") {
      return hasAny(["jahresmeisterschaft.view", "jahresmeisterschaft.manage", "resultate.view", "resultate.manage"]);
    }
    if (bucketName === "vereins-dokumente") {
      return true;
    }
    return false;
  };

  const canAccessPrivateStorage = isServiceRole || isAuthorizedBoardManager;
  const preparedAttachments: { filename: string; contentType: string; base64: string }[] = [];
  if (payload.attachments && payload.attachments.length > 0) {
    for (const att of payload.attachments) {
      if (att.contentBase64) {
        // Unauthentifizierte/öffentliche Flows dürfen keine beliebigen Base64-Dateien versenden
        if (!canAccessPrivateStorage) {
          return new Response(
            JSON.stringify({ success: false, error: "Nicht autorisierter Base64-Anhang." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const cleanBase64 = att.contentBase64.replace(/^data:[^;]+;base64,/i, "").trim();
        preparedAttachments.push({
          filename: att.filename,
          contentType: att.contentType || "application/octet-stream",
          base64: cleanBase64,
        });
      } else {
        // storagePath oder path zuerst auflösen, um den exakt autorisierten Pfad prüfen zu können
        let storagePath = att.storagePath ? String(att.storagePath).trim() : "";
        let bucket = att.storageBucket || "operatives-storage";
        const anyPath = att.path ? String(att.path).trim() : "";
        let isExternalHttpUrl = false;

        if (!storagePath && anyPath) {
          if (anyPath.includes("/storage/v1/object/")) {
            const m = anyPath.match(/\/storage\/v1\/object\/(?:public|authenticated)\/([^/?#]+)\/([^?#]+)/);
            if (m) {
              bucket = m[1];
              storagePath = decodeURIComponent(m[2]);
            }
          } else if (anyPath.startsWith("http://") || anyPath.startsWith("https://")) {
            isExternalHttpUrl = true;
          } else {
            storagePath = anyPath.replace(/^\/?operatives-storage\//, "");
          }
        }

        const normPath = storagePath.replace(/^\/+/, "");
        const normAllowedPath = (allowedPublicRentalStoragePath || "").replace(/^\/+/, "");
        const isAllowedPublicRentalAttachment =
          isAllowedPublicRentalFlow &&
          bucket === "operatives-storage" &&
          (
            (Boolean(normAllowedPath) && normPath === normAllowedPath) ||
            (Boolean(allowedPublicRentalFileUrl) && anyPath === allowedPublicRentalFileUrl)
          );

        const isStorageAllowed = isExternalHttpUrl
          ? (isServiceRole || isCallerSuperAdmin || callerPerms.has("mail.manage"))
          : (canReadStorageAttachment(bucket, normPath) || isAllowedPublicRentalAttachment);

        if (!isStorageAllowed) {
          console.warn(`⚠️ Storage-/URL-Anhang '${bucket}/${storagePath || anyPath}' für unberechtigten Aufrufer blockiert.`);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Nicht autorisierter Anhang-Zugriff.",
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!storagePath && isAllowedPublicRentalAttachment && normAllowedPath) {
          storagePath = normAllowedPath;
          isExternalHttpUrl = false;
        }

        if (isExternalHttpUrl && anyPath) {
          try {
            const parsedUrl = new URL(anyPath);
            const host = parsedUrl.hostname.toLowerCase();
            const isInternalServiceName = !host.includes(".") || [
              "api-gw", "supabase-db", "supabase-kong", "supabase-envoy", "supabase-auth",
              "supabase-rest", "supabase-storage", "supabase-meta", "supabase-studio",
              "supabase-edge-functions", "storage", "auth", "rest", "meta", "studio",
              "realtime", "imgproxy", "pooler", "immich", "postgres", "db", "kong"
            ].includes(host);
            const isPrivateOrLocalHost =
              isInternalServiceName ||
              host === "localhost" ||
              host.endsWith(".local") ||
              host.endsWith(".internal") ||
              host.startsWith("[") ||
              host.includes(":") ||
              /^127\./.test(host) ||
              /^10\./.test(host) ||
              /^192\.168\./.test(host) ||
              /^169\.254\./.test(host) ||
              /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
              /^0\./.test(host) ||
              host === "0.0.0.0";
            if (parsedUrl.protocol !== "https:" || isPrivateOrLocalHost) {
              throw new Error("Interne oder nicht erlaubte URL für Anhang blockiert (SSRF-Schutz).");
            }
            // redirect: "error" verhindert 302-Redirect-SSRF auf interne Adressen
            const res = await fetch(anyPath, { redirect: "error" });
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            const arr = new Uint8Array(await res.arrayBuffer());
            let bin = "";
            for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
            preparedAttachments.push({
              filename: att.filename || "Anhang.pdf",
              contentType: att.contentType || res.headers.get("content-type") || "application/pdf",
              base64: btoa(bin),
            });
            console.log(`📎 Anhang ${att.filename} (${arr.length} Bytes) via HTTP geladen.`);
          } catch (dlErr) {
            console.warn(`⚠️ HTTP Download für Anhang ${anyPath} fehlgeschlagen:`, dlErr);
          }
        } else if (storagePath) {
          const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
          if (dlErr || !fileData) {
            console.warn(`⚠️ Anhang ${storagePath} konnte nicht aus Storage '${bucket}' geladen werden:`, dlErr);
          } else {
            const arrayBuffer = await fileData.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            preparedAttachments.push({
              filename: att.filename || "Mietvertrag.pdf",
              contentType: att.contentType || "application/pdf",
              base64: btoa(binary),
            });
            console.log(`📎 Anhang ${att.filename} (${bytes.length} Bytes) aus Storage geladen.`);
          }
        }
      }
    }
  }

  const isSimulation = payload.simulate || forceSimulate || !smtpPass;
  const moduleRef = payload.moduleRef || payload.module || "allgemein";
  const recordId = payload.recordId || payload.referenceId || null;
  const primaryRecipient = recipients[0];
  const allTargetAddresses = Array.from(new Set([...recipients, ...ccList, ...bccList]));

  // 3. E-Mail versenden oder simulieren
  let sendSuccess = false;
  let errorMessage: string | null = null;
  let sentFolderSaved = false;
  let sentFolderError: string | null = null;
  let sentVia = isSimulation ? "Test_Simuliert" : (smtpHost.includes("gmail") ? "Supabase_Gmail_SMTP" : "Supabase_Infomaniak_SMTP");

  if (isSimulation) {
    console.log(`🧪 [SIMULATION] Mail an ${recipients.join(", ")} | Betreff: ${subject}`);
    sendSuccess = true;
  } else {
    // MIME Multipart Konstruktion (einmalig für SMTP & Sent-Ablage via IMAP)
    const boundaryMixed = "===MIXED_" + Math.random().toString(36).substring(2) + "===";
    const boundaryAlt = "===ALT_" + Math.random().toString(36).substring(2) + "===";
    const messageId = `<${crypto.randomUUID()}@${senderEmail.split("@")[1] || "sportschuetzen-muhen.ch"}>`;
    const mailDate = new Date().toUTCString();
    const cleanReplyTo = stripHeaderChars(payload.replyTo || senderEmail);

    const buildHeaders = (includeBcc: boolean): string => {
      let h = "";
      h += `From: ${fromHeader}\r\n`;
      if (cleanReplyTo) {
        h += `Reply-To: <${cleanReplyTo}>\r\n`;
      }
      h += `To: ${recipients.join(", ")}\r\n`;
      if (ccList.length > 0) h += `Cc: ${ccList.join(", ")}\r\n`;
      if (includeBcc && bccList.length > 0) h += `Bcc: ${bccList.join(", ")}\r\n`;
      h += `Subject: ${encodeSubject(subject)}\r\n`;
      h += `Date: ${mailDate}\r\n`;
      h += `Message-ID: ${messageId}\r\n`;
      h += `MIME-Version: 1.0\r\n`;
      h += `Content-Type: multipart/mixed; boundary="${boundaryMixed}"\r\n\r\n`;
      return h;
    };

    let rfc822Body = "";
    rfc822Body += `--${boundaryMixed}\r\n`;
    rfc822Body += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n`;

    rfc822Body += `--${boundaryAlt}\r\n`;
    rfc822Body += `Content-Type: text/plain; charset=utf-8\r\n`;
    rfc822Body += `Content-Transfer-Encoding: base64\r\n\r\n`;
    rfc822Body += btoa(unescape(encodeURIComponent(bodyText))) + "\r\n\r\n";

    rfc822Body += `--${boundaryAlt}\r\n`;
    rfc822Body += `Content-Type: text/html; charset=utf-8\r\n`;
    rfc822Body += `Content-Transfer-Encoding: base64\r\n\r\n`;
    rfc822Body += btoa(unescape(encodeURIComponent(bodyHtml))) + "\r\n\r\n";

    rfc822Body += `--${boundaryAlt}--\r\n\r\n`;

    // Anhänge
    for (const att of preparedAttachments) {
      rfc822Body += `--${boundaryMixed}\r\n`;
      rfc822Body += `Content-Type: ${att.contentType}; name="${att.filename}"\r\n`;
      rfc822Body += `Content-Transfer-Encoding: base64\r\n`;
      rfc822Body += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
      // Zeilenumbrüche alle 76 Zeichen für Base64
      const formattedBase64 = att.base64.match(/.{1,76}/g)?.join("\r\n") || att.base64;
      rfc822Body += formattedBase64 + "\r\n\r\n";
    }

    rfc822Body += `--${boundaryMixed}--\r\n`;

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

      const smtpPayload = buildHeaders(false) + rfc822Body + "\r\n.\r\n";
      await client.sendRawData(smtpPayload);
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

    // Nach erfolgreichem SMTP-Versand eine Kopie im IMAP Sent-Ordner ablegen (Infomaniak legt SMTP-Mails nicht automatisch in Sent ab)
    if (sendSuccess && saveToSentFolder && imapHost && imapUser && imapPass) {
      const imapClient = new ImapClient();
      try {
        await imapClient.connect(imapHost, imapPort);
        await imapClient.login(imapUser, imapPass);
        const sentCopyBytes = new TextEncoder().encode(buildHeaders(true) + rfc822Body);
        await imapClient.appendSeen(imapSentFolder, sentCopyBytes);
        sentFolderSaved = true;
        console.log(`📥 Kopie im IMAP-Ordner '${imapSentFolder}' (${imapUser}) abgelegt.`);
      } catch (imapErr) {
        sentFolderError = imapErr?.message || String(imapErr);
        console.warn(`⚠️ IMAP-Sent-Ablage in '${imapSentFolder}' fehlgeschlagen:`, sentFolderError);
      } finally {
        await imapClient.close();
      }
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
        sent_folder_saved: sentFolderSaved,
        sent_folder: saveToSentFolder ? imapSentFolder : null,
        sent_folder_error: sentFolderError,
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
        sentFolderSaved: sentFolderSaved,
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
