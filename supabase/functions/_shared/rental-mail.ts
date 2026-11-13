// supabase/functions/_shared/rental-mail.ts
// ==============================================================================
// Serverseitiges Rendering der Vermietungs-Workflow-Mails
// Projekt: Vereinsportal Sportschützen Muhen
//
// Spiegelt bewusst die Platzhalter-Auflösung und das Outlook-kompatible
// Tabellen-Layout von sendRentalWorkflowEmail() / buildRentalEmailHtml()
// (vorstand/js/vermietung/vermietung-manager.js), damit automatisch versandte
// Mails identisch zu manuell ausgelösten Mails aussehen.
//
// Striktes Fallback-Verbot: Fehlt eine Vorlage in public.document_templates,
// wird ein Fehler geworfen (kein Code-Default-Text).
// ==============================================================================

// deno-lint-ignore no-explicit-any
type Supa = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const RENTAL_BANNER_COLORS: Record<string, string> = {
  vm_vertrag: "#0f3c5c",
  vm_anfrage: "#d97706",
  vm_anfrage_intern: "#d97706",
  vm_mahnung: "#c53030",
  vm_bestaetigung: "#22543d",
  vm_schluessel: "#2b6cb0",
  vm_storno: "#742a2a",
  vm_storno_verzug: "#7f1d1d",
  vm_storno_alarm: "#b91c1c",
  vm_info_wirtschaft: "#d97706",
  vm_bank_report: "#1e40af",
};

export const RENTAL_BANNER_TITLES: Record<string, string> = {
  vm_vertrag: "Mietvertrag & QR-Rechnung",
  vm_anfrage: "Bestätigung Terminanfrage",
  vm_anfrage_intern: "Neue Vorab-Terminanfrage",
  vm_mahnung: "Zahlungserinnerung",
  vm_bestaetigung: "Zahlungseingang bestätigt",
  vm_schluessel: "Schlüsselübergabe & Hinweise",
  vm_storno: "Reservation storniert",
  vm_storno_verzug: "Stornierung Zahlungsverzug",
  vm_storno_alarm: "Dringend: Storno-Rückmeldung",
  vm_info_wirtschaft: "Info Wirtschaftsteam",
  vm_bank_report: "Bank-Mail-Automation",
};

export async function loadRentalSettings(supabase: Supa): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("rental_settings").select("setting_key, setting_value");
  if (error) throw new Error(`rental_settings konnten nicht geladen werden: ${error.message}`);
  const s: Record<string, string> = {};
  for (const r of data || []) s[r.setting_key] = r.setting_value;
  return s;
}

export async function loadMailTemplate(supabase: Supa, code: string): Promise<Row> {
  const { data, error } = await supabase
    .from("document_templates")
    .select("code, mail_subject, mail_body, is_active")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`Vorlage '${code}' konnte nicht geladen werden: ${error.message}`);
  if (!data || !data.mail_subject || !data.mail_body) {
    throw new Error(
      `Konfigurationsfehler: Die E-Mail-Vorlage '${code}' ist in 'document_templates' nicht vorhanden oder unvollständig. Bitte im Modul 'Dokumente-Vorlagen' konfigurieren.`,
    );
  }
  return data;
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateCH(iso?: string | null): string {
  if (!iso) return "–";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso);
}

/** Baut die Platzhalter-Map analog zum Frontend (Mieter-, Vermieter-, Wirtschafts-, Buchungsdaten). */
export function buildRentalPlaceholders(d: Row | null, s: Record<string, string>, extra: Record<string, string> = {}) {
  const r = d || {};
  const clubEmail = s.club_email || "sportschuetzen.muhen@gmail.com";
  const vermieterFirst = s.sender_first_name || "";
  const vermieterLast = s.sender_last_name || "";
  const bookingNr = r.booking_number || "";
  // Kein Hardcoded-Fallback: fehlt die Einstellung, bricht renderRentalMail bei Vorlagen mit {feedback_url} ab.
  const feedbackBaseUrl = s.feedback_base_url || "";
  const strasse = r.street || "";
  const plz = r.post_code || "";
  const ort = r.city || "";
  const amount = r.total_amount_chf !== undefined && r.total_amount_chf !== null ? Number(r.total_amount_chf) : 0;

  const map: Record<string, string> = {
    mieter_vorname: r.first_name || "",
    mieter_nachname: r.last_name || "",
    mieter_anrede: r.salutation || "Guten Tag",
    mieter_email: r.email || "",
    mieter_telefon: r.phone || "",
    mieter_strasse: strasse,
    mieter_plz: plz,
    mieter_ort: ort,
    mieter_adresse: strasse ? `${strasse}, ${plz} ${ort}`.trim() : `${plz} ${ort}`.trim(),
    vorname: r.first_name || "",
    nachname: r.last_name || "",
    anrede: r.salutation || "Guten Tag",
    vermieter_vorname: vermieterFirst,
    vermieter_nachname: vermieterLast,
    vermieter_name: `${vermieterFirst} ${vermieterLast}`.trim() || "Sportschützen Muhen",
    vermieter_telefon: s.sender_phone || "",
    vermieter_email: clubEmail,
    wirtschaft_name: s.wirtschaft_name || "Wirtschaftsteam",
    wirtschaft_phone: s.wirtschaft_phone || "",
    wirtschaft_email: s.wirtschaft_email || clubEmail,
    mietdatum: r.start_date ? formatDateCH(r.start_date) : "–",
    festbeginn: r.festbeginn || "14:00 Uhr",
    vertragsnr: bookingNr,
    buchungsnummer: bookingNr,
    mietbetrag: amount.toFixed(2),
    kaution: "0.00",
    zahlungsfrist_tage: String(s.payment_due_days || 14),
    zahlungsfrist: String(s.payment_due_days || 14),
    mietobjekt: s.rental_object || "Schützenstube Rüteli",
    gebuehr_glas: Number(s.glass_fee || 2).toFixed(2),
    gebuehr_teller: Number(s.plate_fee || 5).toFixed(2),
    gebuehr_holz: Number(s.wood_fee || 20).toFixed(2),
    gebuehr_abfallsack: Number(s.garbage_bag_fee || 4).toFixed(2),
    gebuehr_reinigung: Number(s.cleaning_fee_per_hour || 35).toFixed(2),
    gebuehr_storno: Number(s.storno_fee || 100).toFixed(2),
    bemerkung: r.inquiry_note || r.admin_comment || "–",
    cockpit_url: "https://sportschuetzen-muhen.ch/vorstand/#vermietung",
    feedback_url: feedbackBaseUrl ? `${feedbackBaseUrl}?vnr=${encodeURIComponent(bookingNr)}` : "",
    club_email: clubEmail,
  };
  return { ...map, ...extra };
}

export function applyPlaceholders(text: string, map: Record<string, string>): string {
  let out = text || "";
  for (const [k, v] of Object.entries(map)) {
    const rx = new RegExp(`\\{{1,2}${k}\\}{1,2}`, "gi");
    out = out.replace(rx, () => v ?? "");
  }
  return out;
}

/** Normalisiert WYSIWYG-HTML für Outlook Desktop (Word-Engine) & Webmail. */
export function normalizeRentalBodyForEmail(rawHtml: string): string {
  let out = String(rawHtml || "").trim();
  if (!out) return "";

  // 1. Callout-Banner (<div class="club-banner-callout">) in Outlook-feste 2-Zellen-Tabelle umwandeln
  out = out.replace(
    /<div\b[^>]*class="[^"]*club-banner-callout[^"]*"[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/div>/gi,
    (_m, styleStr: string, inner: string) => {
      const bgMatch = styleStr.match(/background-color:\s*([^;]+)/i);
      const borderMatch = styleStr.match(/border-left:\s*[^;]*?\s(#[0-9a-fA-F]{3,8}|[a-z]+)/i);
      const colorMatch = styleStr.match(/(?:^|;)\s*color:\s*([^;]+)/i);
      const bg = bgMatch ? bgMatch[1].trim() : "#fffbeb";
      const borderCol = borderMatch ? borderMatch[1].trim() : "#f59e0b";
      const textCol = colorMatch ? colorMatch[1].trim() : "#78350f";
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse;"><tr><td colspan="2" height="4" style="font-size:1px; line-height:4px;">&nbsp;</td></tr><tr><td width="4" bgcolor="${borderCol}" style="width:4px; background-color:${borderCol}; font-size:1px; line-height:1px;">&nbsp;</td><td bgcolor="${bg}" style="background-color:${bg}; padding:12px 16px; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:13.5px; line-height:1.55; color:${textCol};">${inner.trim()}</td></tr><tr><td colspan="2" height="12" style="font-size:1px; line-height:12px;">&nbsp;</td></tr></table>`;
    },
  );

  // 2. ClubWysiwyg CTA-Container (<div class="club-cta-container">) in Outlook-Button-Tabelle umwandeln
  out = out.replace(
    /<div\b[^>]*class="[^"]*club-cta-container[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    (_m, inner: string) => {
      const aMatch = inner.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!aMatch) return inner;
      const href = aMatch[1];
      const label = aMatch[2].replace(/<[^>]*>/g, "").trim();
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td align="center" style="padding:8px 0 16px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" bgcolor="#0f3c5c" style="background-color:#0f3c5c; border-radius:6px; padding:12px 24px;"><a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; line-height:18px; text-decoration:none; display:inline-block;">${label}</a></td></tr></table></td></tr></table>`;
    },
  );

  // 3. Info-Tabellen (.vm-info-table) mit Outlook-Spacing und kompakter Zeilenhöhe versehen
  out = out.replace(
    /<table\b([^>]*class="[^"]*vm-info-table[^"]*"[^>]*)>([\s\S]*?)<\/table>/gi,
    (_m, attrs: string, inner: string) => {
      const cleanAttrs = attrs.replace(/\s*margin\s*:[^;"]+;?/gi, "");
      const styledInner = inner.replace(/<td(\s+[^>]*)?>/gi, (_tm, tdAttrs: string = "") => {
        if (!tdAttrs || !/style=/i.test(tdAttrs)) {
          return `<td${tdAttrs} style="padding:7px 12px; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:13.5px; line-height:1.4;">`;
        }
        return `<td${tdAttrs.replace(/style="([^"]*)"/i, (_sm, s: string) => {
          let c = s.trim();
          if (!/font-family/i.test(c)) c += (c && !c.endsWith(";") ? ";" : "") + "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
          if (!/line-height/i.test(c)) c += (c && !c.endsWith(";") ? ";" : "") + "line-height:1.4;";
          return `style="${c}"`;
        })}>`;
      });
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse;"><tr><td style="padding:4px 0 14px 0;"><table${cleanAttrs}>${styledInner}</table></td></tr></table>`;
    },
  );

  // 4. Bulletproof-Buttons mit margin auf <table> in Outlook-sichere Spacer-Zeile betten
  out = out.replace(
    /<table\b([^>]*style="[^"]*border-collapse:\s*separate[^"]*"[^>]*)>([\s\S]*?)<\/table>/gi,
    (_m, attrs: string, inner: string) => {
      const cleanAttrs = attrs.replace(/\s*margin\s*:[^;"]+;?/gi, "");
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td style="padding:4px 0 16px 0;"><table${cleanAttrs}>${inner}</table></td></tr></table>`;
    },
  );

  // 5. <p>-Tags explizit für Outlook stylen (verhindert Times New Roman & inkonsistente Abstände)
  out = out.replace(/<p(\s+[^>]*)?>/gi, (_m, attrs: string = "") => {
    const baseStyle = "margin:0 0 12px 0; line-height:1.55; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:15px; color:#333333;";
    if (!attrs || !/style=/i.test(attrs)) {
      return `<p${attrs} style="${baseStyle}">`;
    }
    const updatedAttrs = attrs.replace(/style="([^"]*)"/i, (_sm, s: string) => {
      let cleaned = s.replace(/background\s*:\s*white\s*;?/gi, "").trim();
      if (!/font-family/i.test(cleaned)) cleaned += (cleaned && !cleaned.endsWith(";") ? ";" : "") + "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
      if (!/font-size/i.test(cleaned)) cleaned += "font-size:15px;";
      if (!/line-height/i.test(cleaned)) cleaned += "line-height:1.55;";
      if (!/(?:^|;)\s*color/i.test(cleaned)) cleaned += "color:#333333;";
      if (!/margin/i.test(cleaned)) cleaned += "margin:0 0 12px 0;";
      return `style="${cleaned}"`;
    });
    return `<p${updatedAttrs}>`;
  });

  // 6. Listen (<ul>/<ol>) einheitlich stylen
  out = out.replace(/<(ul|ol)(\s+[^>]*)?>/gi, (_m, tag: string, attrs: string = "") => {
    if (/style=/i.test(attrs)) return `<${tag}${attrs}>`;
    return `<${tag}${attrs} style="margin:0 0 14px 0; padding-left:22px; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:15px; line-height:1.55; color:#333333;">`;
  });

  return out;
}

/** Outlook-/MSO-kompatibles Vereinslayout (linksbündig max. 800px, iPhone-responsive 100%). */
export function buildRentalEmailHtml(
  title: string,
  bannerColor: string,
  bodyHtml: string,
  s: Record<string, string>,
  options: { bannerTitle?: string; fullDocument?: boolean } = {},
): string {
  const logoUrl = s.logo_url || "https://sps-b55.pages.dev/icons/icon-512.png";
  const clubName = s.club_name || "Sportschützen Muhen";
  const bannerTitle = options.bannerTitle || title;
  const normalizedBody = normalizeRentalBodyForEmail(bodyHtml);

  const cardHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="width:100%; background-color:#ffffff; border-collapse:collapse;">
      <tr>
        <td align="left" style="padding:12px 16px;">
          <!--[if mso]>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="800" align="left" style="border-collapse:collapse;"><tr><td>
          <![endif]-->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="width:100%; max-width:800px; margin:0; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background-color:#ffffff; border-collapse:collapse; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
            <tr>
              <td bgcolor="${bannerColor}" style="background-color:${bannerColor}; padding:18px 24px; text-align:left; vertical-align:middle;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle; padding-right:14px; width:42px;">
                      <img src="${logoUrl}" width="38" height="38" style="width:38px; height:38px; display:block; border-radius:6px; border:1px solid #cbd5e1;" border="0" alt="Logo">
                    </td>
                    <td style="vertical-align:middle; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
                      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:19px; font-weight:600; color:#ffffff; line-height:1.25;">${escapeHtml(bannerTitle)}</div>
                      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:12px; color:#e2e8f0; margin-top:3px; line-height:1.3;">${escapeHtml(clubName)} – Schützenstube Muhen</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:24px 24px 18px 24px; background-color:#ffffff; color:#333333; line-height:1.55; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:15px;">
                ${normalizedBody}
              </td>
            </tr>
            <tr>
              <td bgcolor="#f8fafc" align="center" style="background-color:#f8fafc; padding:15px 24px; border-top:1px solid #e2e8f0; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:11px; color:#64748b; text-align:center; line-height:1.6;">
                <strong>Sportschützen Muhen</strong> (gegründet 1919) &bull; Schiessanlage Rüteli &bull; 5037 Muhen<br>
                Web: <a href="https://sportschuetzen-muhen.ch" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none;">www.sportschuetzen-muhen.ch</a> &bull; E-Mail: <a href="mailto:sportschuetzen.muhen@gmail.com" style="color:#0284c7; text-decoration:none;">sportschuetzen.muhen@gmail.com</a><br>
                <a href="https://www.instagram.com/sportschuetzen.muhen/" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; font-weight:500;">Instagram</a> &bull; <a href="https://www.facebook.com/SportschuetzenMuhen/?locale=de_DE" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; font-weight:500;">Facebook</a>
              </td>
            </tr>
          </table>
          <!--[if mso]>
          </td></tr></table>
          <![endif]-->
        </td>
      </tr>
    </table>`;

  if (options.fullDocument === false) {
    return cardHtml;
  }

  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body bgcolor="#ffffff" style="margin:0; padding:0; background-color:#ffffff; font-family:'Segoe UI',Arial,Helvetica,sans-serif; color:#333333; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
${cardHtml}
</body>
</html>`;
}

/** Rendert eine Vermietungs-Vorlage zu Betreff + vollständigem HTML. */
export async function renderRentalMail(
  supabase: Supa,
  tplCode: string,
  rental: Row | null,
  settings: Record<string, string>,
  extra: Record<string, string> = {},
): Promise<{ subject: string; html: string }> {
  const tpl = await loadMailTemplate(supabase, tplCode);
  if (/feedback_url/i.test(`${tpl.mail_subject} ${tpl.mail_body}`) && !settings.feedback_base_url && !extra.feedback_url) {
    throw new Error(
      `Konfigurationsfehler: Die Vorlage '${tplCode}' benötigt {feedback_url}, aber 'feedback_base_url' fehlt in rental_settings.`,
    );
  }
  const map = buildRentalPlaceholders(rental, settings, extra);
  const subject = applyPlaceholders(tpl.mail_subject, map);
  const body = applyPlaceholders(tpl.mail_body, map);
  const bodyHtml = /<[a-z][\s\S]*>/i.test(body)
    ? body
    : body
        .split(/\n\s*\n/)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
  const html = buildRentalEmailHtml(
    subject,
    RENTAL_BANNER_COLORS[tplCode] || "#0f3c5c",
    bodyHtml,
    settings,
    { bannerTitle: RENTAL_BANNER_TITLES[tplCode] || subject },
  );
  return { subject, html };
}

/** Versand über die zentrale Edge Function send-email (inkl. mail_logs Audit). */
export async function sendViaMailEngine(payload: Row): Promise<{ success: boolean; error?: string }> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
    body: JSON.stringify(payload),
  });
  let json: Row = {};
  try {
    json = await res.json();
  } catch (_) { /* leer */ }
  if (!res.ok || json.success === false) {
    return { success: false, error: json.error || `send-email HTTP ${res.status}` };
  }
  return { success: true };
}
