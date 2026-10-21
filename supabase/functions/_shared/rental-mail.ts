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
  vm_mahnung: "#c53030",
  vm_bestaetigung: "#22543d",
  vm_schluessel: "#2b6cb0",
  vm_storno: "#742a2a",
  vm_storno_verzug: "#7f1d1d",
  vm_info_wirtschaft: "#d97706",
  vm_bank_report: "#1e40af",
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
  const feedbackBaseUrl = s.feedback_base_url || "https://sportschuetzen-muhen.ch/storno_feedback.html";
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
    feedback_url: `${feedbackBaseUrl}?vnr=${encodeURIComponent(bookingNr)}`,
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

/** Outlook-/MSO-kompatibles Vereinslayout (identisch zu buildRentalEmailHtml im Frontend). */
export function buildRentalEmailHtml(title: string, bannerColor: string, bodyHtml: string, s: Record<string, string>): string {
  const logoUrl = s.logo_url || "https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-512.png";
  const clubName = s.club_name || "Sportschützen Muhen";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:650px;margin:0 auto;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;background-color:#ffffff;border-collapse:collapse;font-family:'Segoe UI',Arial,sans-serif;">
      <tr>
        <td style="background-color:${bannerColor}; padding:18px 25px; text-align:left; vertical-align:middle;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle; padding-right:15px; width:44px;">
                <img src="${logoUrl}" width="38" height="38" style="width:38px; height:38px; display:block; border-radius:6px; border:2px solid rgba(255,255,255,0.2);" border="0" alt="Logo">
              </td>
              <td style="vertical-align:middle;">
                <div style="font-family:'Segoe UI',Arial,sans-serif; font-size:19px; font-weight:600; color:#ffffff; line-height:1.2;">${title}</div>
                <div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:3px;">${clubName} – Schützenstube Muhen</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 25px 22px 25px; color:#333333; line-height:1.6; font-size:15px;">
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="background:#f8f9fa; padding:15px 25px; border-top:1px solid #eeeeee; font-size:11px; color:#64748b; text-align:center; line-height:1.6;">
          <strong>Sportschützen Muhen</strong> (gegründet 1919) &bull; Schiessanlage Rüteli &bull; 5037 Muhen<br>
          Web: <a href="https://sportschuetzen-muhen.ch" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none;">www.sportschuetzen-muhen.ch</a> &bull; E-Mail: <a href="mailto:sportschuetzen.muhen@gmail.com" style="color:#0284c7; text-decoration:none;">sportschuetzen.muhen@gmail.com</a><br>
          <a href="https://www.instagram.com/sportschuetzen.muhen/" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; font-weight:500;">Instagram</a> &bull; <a href="https://www.facebook.com/SportschuetzenMuhen/?locale=de_DE" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; font-weight:500;">Facebook</a>
        </td>
      </tr>
    </table>
  `;
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
  const map = buildRentalPlaceholders(rental, settings, extra);
  const subject = applyPlaceholders(tpl.mail_subject, map);
  const body = applyPlaceholders(tpl.mail_body, map);
  const bodyHtml = /<[a-z][\s\S]*>/i.test(body)
    ? body
    : body
        .split(/\n\s*\n/)
        .map((p) => `<p style="margin:0 0 12px 0; line-height: 1.55;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
  const html = buildRentalEmailHtml(subject, RENTAL_BANNER_COLORS[tplCode] || "#0f3c5c", bodyHtml, settings);
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
