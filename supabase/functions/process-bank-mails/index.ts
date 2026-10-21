// supabase/functions/process-bank-mails/index.ts
// ==============================================================================
// Automatischer Bank-Mail-Eingang (Raiffeisen -> Vermietung Schützenstube)
// Edge Function für Supabase
//
// Features:
// - Holt OAuth Access Token via Refresh Token von Google OAuth2
// - Sucht Mails mit Label "Raiffeisen" im Gmail Postfach
// - Parst Vertragsnummer (z.B. V-2026-0050) und Gutschriftsbetrag
// - Verbucht via RPC confirm_rental_payment() in Supabase (Single Source of Truth)
// - Sendet Bestätigungsmail (vm_bestaetigung) an Mieter & vm_info_wirtschaft an Wirtschaftsteam
// - Verschiebt Mail von Label "Raiffeisen" nach "Raiffeisen/Verarbeitet" bzw. "Raiffeisen/Fehler"
// - Erstellt Rapport (vm_bank_report) an Verteiler Info_Mail_Bank_Eingang
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import {
  loadRentalSettings,
  renderRentalMail,
  sendViaMailEngine,
} from "../_shared/rental-mail.ts";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailMessageHeader {
  name: string;
  value: string;
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

// 1. Google OAuth2 Access Token über Refresh Token beziehen
async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth Token Refresh fehlgeschlagen (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return json.access_token;
}

// 2. Hilfsfunktion: Label-IDs auflösen
async function getLabelMap(token: string): Promise<Map<string, string>> {
  const res = await fetch(`${GMAIL_API_BASE}/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Konnte Gmail Labels nicht abfragen");
  const data = await res.json();
  const map = new Map<string, string>();
  for (const l of data.labels || []) {
    map.set(l.name.toLowerCase(), l.id);
  }
  return map;
}

// 3. Label anlegen, falls noch nicht existent
async function ensureLabel(token: string, labelName: string, labelMap: Map<string, string>): Promise<string> {
  const existing = labelMap.get(labelName.toLowerCase());
  if (existing) return existing;

  const res = await fetch(`${GMAIL_API_BASE}/labels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Label '${labelName}' konnte nicht erstellt werden: ${errText}`);
  }

  const created = await res.json();
  labelMap.set(labelName.toLowerCase(), created.id);
  return created.id;
}

// 4. Mailinhalt & Parsing von Raiffeisen-Mails
function decodeBase64Url(str: string): string {
  const clean = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(clean)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch (_) {
    return atob(clean);
  }
}

function extractBodyText(payload: any): string {
  let body = "";
  if (payload.body && payload.body.data) {
    body += decodeBase64Url(payload.body.data) + "\n";
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const p of payload.parts) {
      if (p.mimeType === "text/plain" && p.body && p.body.data) {
        body += decodeBase64Url(p.body.data) + "\n";
      } else if (p.parts) {
        body += extractBodyText(p) + "\n";
      }
    }
  }
  return body;
}

function parseRaiffeisenMail(msg: any): ParsedPaymentInfo {
  const headers = msg.payload?.headers || [];
  const getH = (n: string) => headers.find((h: GmailMessageHeader) => h.name.toLowerCase() === n.toLowerCase())?.value || "";

  const subject = getH("Subject");
  const rawSender = getH("From");
  const dateStr = getH("Date");

  const fullText = (extractBodyText(msg.payload) + "\n" + msg.snippet).replace(/&#35;/g, "#").replace(/\r/g, "");

  // Vertragsnummer suchen (z.B. V-2026-0050 oder ##2026-050##)
  let contractNumber: string | null = null;
  const matchV = fullText.match(/V-(\d{4}-\d{3,4})/i);
  if (matchV) {
    contractNumber = `V-${matchV[1]}`;
  } else {
    const matchHash = fullText.match(/##(\d{4}-\d{3,4})##/);
    if (matchHash) contractNumber = `V-${matchHash[1]}`;
  }

  // Betrag suchen
  let amount: number | null = null;
  const matchAmt1 = fullText.match(/Betrag:\s*([\d']+[.,]\d{2})\s*CHF/i);
  if (matchAmt1) {
    amount = parseFloat(matchAmt1[1].replace(/'/g, "").replace(",", "."));
  } else {
    const matchAmt2 = fullText.match(/([\d']+[.,]\d{2})\s*CHF/i);
    if (matchAmt2) {
      amount = parseFloat(matchAmt2[1].replace(/'/g, "").replace(",", "."));
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
    rawSender,
    subject,
    dateStr,
  };
}

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
        // Prüfe vermietung.manage
        const { data: hasPerm } = await supabase.rpc("user_has_permission", {
          p_user_id: userRes.user.id,
          p_permission: "vermietung.manage",
        });
        if (hasPerm === true) isAuthorized = true;
      }
    }
  }

  // Für Test/Dev im CLI erlauben, falls Service-Role-Key im Auth-Header
  if (!isAuthorized && req.headers.get("Authorization")?.includes(supabaseServiceKey)) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ success: false, error: "Nicht autorisiert (vermietung.manage erforderlich)." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Google OAuth Credentials
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Gmail API Secrets fehlen auf CT 117 (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const googleToken = await getAccessToken(clientId, clientSecret, refreshToken);
    const labelMap = await getLabelMap(googleToken);

    const inboxLabelId = labelMap.get("raiffeisen");
    const successLabelId = await ensureLabel(googleToken, "Raiffeisen/Verarbeitet", labelMap);
    const errorLabelId = await ensureLabel(googleToken, "Raiffeisen/Fehler", labelMap);

    // Mails abfragen:
    // 1. Mails mit Label "Raiffeisen" ODER
    // 2. Gutschrifts-Benachrichtigungen von noreply@ebanking.raiffeisen.ch
    // 3. Ausschluss bereits verarbeiteter oder fehlerhafter Mails
    const queryParts = [
      "(label:Raiffeisen OR (from:noreply@ebanking.raiffeisen.ch AND subject:Gutschrift))",
      "-label:Raiffeisen/Verarbeitet",
      "-label:Raiffeisen/Fehler"
    ];
    const gmailQuery = encodeURIComponent(queryParts.join(" "));

    const listRes = await fetch(`${GMAIL_API_BASE}/messages?q=${gmailQuery}&maxResults=20`, {
      headers: { Authorization: `Bearer ${googleToken}` },
    });
    if (!listRes.ok) throw new Error("Fehler beim Abrufen der Nachrichtenliste");
    const listData = await listRes.json();
    const messages = listData.messages || [];

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Keine neuen Bank-Mails vorhanden." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = await loadRentalSettings(supabase);
    const resultsSummary: any[] = [];

    for (const m of messages) {
      const msgRes = await fetch(`${GMAIL_API_BASE}/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${googleToken}` },
      });
      if (!msgRes.ok) continue;
      const msgData = await msgRes.json();

      const parsed = parseRaiffeisenMail(msgData);
      const { contractNumber, amount, bookingDate, payerName, payerAddress, rentDate, rawSender, subject, dateStr } = parsed;

      // Log-Eintrag initial anlegen (Idempotenz)
      const { data: existingLog } = await supabase
        .from("bank_mail_ingest_logs")
        .select("id, result")
        .eq("gmail_message_id", m.id)
        .maybeSingle();

      if (existingLog && existingLog.result !== "processing") {
        // Bereits fertig verarbeitet, nur Label korrigieren falls nötig
        continue;
      }

      let logId = existingLog?.id;
      if (!logId) {
        const { data: newLog, error: insErr } = await supabase
          .from("bank_mail_ingest_logs")
          .insert({
            gmail_message_id: m.id,
            gmail_thread_id: m.threadId,
            mail_from: rawSender,
            mail_subject: subject,
            mail_date: dateStr ? new Date(dateStr) : new Date(),
            contract_nr: contractNumber,
            amount_chf: amount,
            booking_date: bookingDate || new Date().toISOString().split("T")[0],
            payer_name: payerName,
            payer_address: payerAddress,
            rent_date: rentDate,
            result: "processing",
            raw_excerpt: msgData.snippet,
          })
          .select("id")
          .single();
        if (insErr) {
          console.error("Fehler beim Erstellen des Ingest-Logs:", insErr);
          continue;
        }
        logId = newLog.id;
      }

      // Prüfungen: Wenn weder Vertragsnummer noch (Name + Mietdatum) vorhanden sind, oder Betrag fehlt
      if ((!contractNumber && (!payerName || !rentDate)) || amount === null || amount <= 0) {
        const errMsg = !contractNumber && (!payerName || !rentDate)
          ? "Weder Vertragsnummer noch Mietername & Mietdatum im Mailtext gefunden."
          : "Kein gültiger Zahlungsbetrag gefunden.";
        
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "parse_error",
            error_message: errMsg,
          })
          .eq("id", logId);

        // Mail-Label auf Fehler setzen
        await moveMessageLabels(googleToken, m.id, [errorLabelId], [inboxLabelId]);

        // Rapport senden
        await sendBankReport(supabase, settings, {
          ergebnis: "❌ Fehler: Daten unvollständig",
          vertragsnr: contractNumber || "Unbekannt",
          betrag: amount ? amount.toFixed(2) : "0.00",
          sollbetrag: "–",
          hinweis: `Das System konnte die Bank-Mail nicht eindeutig zuordnen.<br><b>Grund:</b> ${errMsg}`,
          rental: null,
        });

        resultsSummary.push({ id: m.id, result: "parse_error", error: errMsg });
        continue;
      }

      // Buchung in Supabase via RPC verbuchen (mit Fallback-Matching über Name + Datum + Betrag)
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

        await moveMessageLabels(googleToken, m.id, [errorLabelId], [inboxLabelId]);

        await sendBankReport(supabase, settings, {
          ergebnis: `🚨 Systemfehler bei ${contractNumber || payerName || 'Zahlung'}`,
          vertragsnr: contractNumber || "–",
          betrag: amount.toFixed(2),
          sollbetrag: "–",
          hinweis: `Bei der Verbuchung trat ein Datenbankfehler auf:<br><code>${errDetail}</code>`,
          rental: null,
        });

        resultsSummary.push({ id: m.id, result: "error", error: errDetail });
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

      const sollAmount = rentalData?.total_amount_chf ? Number(rentalData.total_amount_chf).toFixed(2) : (rpcRes.soll_amount ? Number(rpcRes.soll_amount).toFixed(2) : "300.00");

      if (rpcRes.code === "unknown_contract") {
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "unknown_contract",
            error_message: rpcRes.message,
          })
          .eq("id", logId);

        await moveMessageLabels(googleToken, m.id, [errorLabelId], [inboxLabelId]);

        const detailHinweis = [
          `<b>Vertrag im Mail:</b> ${contractNumber || '–'}`,
          payerName ? `<b>Mieter:</b> ${payerName}` : null,
          payerAddress ? `<b>Adresse:</b> ${payerAddress}` : null,
          rentDate ? `<b>Mietdatum im Mail:</b> ${new Date(rentDate).toLocaleDateString('de-CH')}` : null,
          `<b>Betrag:</b> CHF ${amount.toFixed(2)}`,
          `<b>Grund:</b> ${rpcRes.message || 'Keine passende Reservation gefunden.'}`
        ].filter(Boolean).join('<br>');

        await sendBankReport(supabase, settings, {
          ergebnis: `❓ Keine passende Reservation: ${contractNumber || payerName || 'Unbekannt'}`,
          vertragsnr: contractNumber || "–",
          betrag: amount.toFixed(2),
          sollbetrag: "–",
          hinweis: `Das System konnte die Zahlung keinem offenen Vertrag zuordnen:<br>${detailHinweis}`,
          rental: null,
        });

        resultsSummary.push({ id: m.id, result: "unknown_contract" });
        continue;
      }

      if (rpcRes.code === "underpaid") {
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "underpaid",
            rental_request_id: rentalData?.id || null,
            error_message: rpcRes.message,
          })
          .eq("id", logId);

        await moveMessageLabels(googleToken, m.id, [errorLabelId], [inboxLabelId]);

        await sendBankReport(supabase, settings, {
          ergebnis: `⚠️ Zahlung zu niedrig: ${contractNumber}`,
          vertragsnr: contractNumber,
          betrag: amount.toFixed(2),
          sollbetrag: sollAmount,
          hinweis: `Erhalten: <b>CHF ${amount.toFixed(2)}</b> &bull; Erwartet (Soll): <b>CHF ${sollAmount}</b>.<br>Buchung wurde nicht automatisch freigegeben.`,
          rental: rentalData,
        });

        resultsSummary.push({ id: m.id, result: "underpaid" });
        continue;
      }

      if (rpcRes.code === "cancelled") {
        await supabase
          .from("bank_mail_ingest_logs")
          .update({
            result: "cancelled",
            rental_request_id: rentalData?.id || null,
            error_message: rpcRes.message,
          })
          .eq("id", logId);

        await moveMessageLabels(googleToken, m.id, [errorLabelId], [inboxLabelId]);

        await sendBankReport(supabase, settings, {
          ergebnis: `⚠️ Zahlung für stornierten Vertrag: ${contractNumber}`,
          vertragsnr: contractNumber,
          betrag: amount.toFixed(2),
          sollbetrag: sollAmount,
          hinweis: `Für die stornierte Reservation <b>${contractNumber}</b> ging eine Zahlung von CHF ${amount.toFixed(2)} ein. Bitte Fall klären.`,
          rental: rentalData,
        });

        resultsSummary.push({ id: m.id, result: "cancelled" });
        continue;
      }

      // Erfolg oder bereits bezahlt
      const isAlready = rpcRes.code === "already_paid";
      await supabase
        .from("bank_mail_ingest_logs")
        .update({
          result: isAlready ? "already_paid" : "success",
          contract_nr: matchedVnr || contractNumber,
          rental_request_id: rentalData?.id || null,
          match_method: rpcRes.match_method || 'contract_nr',
          error_message: null,
        })
        .eq("id", logId);

      // Label umhängen: Verarbeitet
      await moveMessageLabels(googleToken, m.id, [successLabelId], [inboxLabelId]);

      if (!isAlready && rentalData) {
        // 1. Zahlungsbestätigung an Mieter (vm_bestaetigung)
        try {
          const renderedConfirm = await renderRentalMail(supabase, "vm_bestaetigung", rentalData, settings);
          await sendViaMailEngine({
            to: rentalData.email,
            ccSystemMailKey: "Info_Mail_an_Wirtschaftsverantwortliche",
            subject: renderedConfirm.subject,
            html: renderedConfirm.html,
            module: "vermietung",
            referenceId: contractNumber,
          });
        } catch (mErr: any) {
          console.error(`Fehler beim Senden der Zahlungsbestätigung an Mieter (${contractNumber}):`, mErr);
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
            referenceId: contractNumber,
          });
        } catch (wErr: any) {
          console.error(`Fehler beim Senden der Wirtschafts-Info (${contractNumber}):`, wErr);
        }
      }

      // 3. Rapport an Vorstand / Admin (Info_Mail_Bank_Eingang)
      await sendBankReport(supabase, settings, {
        ergebnis: isAlready ? `ℹ️ Bereits verbucht: ${contractNumber}` : `✅ Zahlung verbucht: ${contractNumber}`,
        vertragsnr: contractNumber,
        betrag: amount.toFixed(2),
        sollbetrag: sollAmount,
        hinweis: isAlready
          ? `Zahlung war bereits im Portal erfasst. Label wurde auf 'Verarbeitet' verschoben.`
          : `Zahlungsstufe 1 (Info-Mail Bank) gesetzt, RechnungsCore synchronisiert und Bestätigungs-Mails an Mieter &amp; Wirtschaft versandt.`,
        rental: rentalData,
      });

      resultsSummary.push({ id: m.id, contract: contractNumber, result: isAlready ? "already_paid" : "success" });
    }

    return new Response(
      JSON.stringify({
        success: true,
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
  }
});

async function moveMessageLabels(token: string, msgId: string, addLabelIds: (string | undefined)[], removeLabelIds: (string | undefined)[]) {
  const cleanAdd = addLabelIds.filter(Boolean) as string[];
  const cleanRemove = removeLabelIds.filter(Boolean) as string[];
  const res = await fetch(`${GMAIL_API_BASE}/messages/${msgId}/modify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addLabelIds: cleanAdd,
      removeLabelIds: cleanRemove,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`Label-Wechsel für Message ${msgId} fehlgeschlagen:`, err);
  }
}

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
