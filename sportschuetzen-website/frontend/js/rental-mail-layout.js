// sportschuetzen-website/frontend/js/rental-mail-layout.js
// ==============================================================================
// Gemeinsames Outlook-/MSO-kompatibles Mail-Layout & Vorlagen-Rendering für die
// öffentlichen Vermietungs-Formulare (schuetzenhaus_vermietung.html, storno_feedback.html).
// Keine hartcodierten E-Mail-Texte: Lädt Vorlagen strikt aus public.document_templates.
// ==============================================================================
(function (global) {
  'use strict';

  const RENTAL_BANNER_CONFIG = {
    vm_vertrag: { color: '#0f3c5c', title: 'Mietvertrag & QR-Rechnung' },
    vm_anfrage: { color: '#d97706', title: 'Bestätigung Terminanfrage' },
    vm_anfrage_intern: { color: '#d97706', title: 'Neue Vorab-Terminanfrage' },
    vm_mahnung: { color: '#c53030', title: 'Zahlungserinnerung' },
    vm_bestaetigung: { color: '#22543d', title: 'Zahlungseingang bestätigt' },
    vm_schluessel: { color: '#2b6cb0', title: 'Schlüsselübergabe & Hinweise' },
    vm_storno: { color: '#742a2a', title: 'Reservation storniert' },
    vm_storno_verzug: { color: '#7f1d1d', title: 'Stornierung Zahlungsverzug' },
    vm_storno_alarm: { color: '#b91c1c', title: 'Dringend: Storno-Rückmeldung' },
    vm_info_wirtschaft: { color: '#d97706', title: 'Info Wirtschaftsteam' },
    vm_bank_report: { color: '#1e40af', title: 'Bank-Mail-Automation' }
  };

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeRentalBodyForEmail(rawHtml) {
    let out = String(rawHtml || '').trim();
    if (!out) return '';

    out = out.replace(
      /<div\b[^>]*class="[^"]*club-banner-callout[^"]*"[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/div>/gi,
      (_m, styleStr, inner) => {
        const bgMatch = styleStr.match(/background-color:\s*([^;]+)/i);
        const borderMatch = styleStr.match(/border-left:\s*[^;]*?\s(#[0-9a-fA-F]{3,8}|[a-z]+)/i);
        const colorMatch = styleStr.match(/(?:^|;)\s*color:\s*([^;]+)/i);
        const bg = bgMatch ? bgMatch[1].trim() : '#fffbeb';
        const borderCol = borderMatch ? borderMatch[1].trim() : '#f59e0b';
        const textCol = colorMatch ? colorMatch[1].trim() : '#78350f';
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse;"><tr><td colspan="2" height="4" style="font-size:1px; line-height:4px;">&nbsp;</td></tr><tr><td width="4" bgcolor="${borderCol}" style="width:4px; background-color:${borderCol}; font-size:1px; line-height:1px;">&nbsp;</td><td bgcolor="${bg}" style="background-color:${bg}; padding:12px 16px; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:13.5px; line-height:1.55; color:${textCol};">${inner.trim()}</td></tr><tr><td colspan="2" height="12" style="font-size:1px; line-height:12px;">&nbsp;</td></tr></table>`;
      }
    );

    out = out.replace(
      /<div\b[^>]*class="[^"]*club-cta-container[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      (_m, inner) => {
        const aMatch = inner.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!aMatch) return inner;
        const href = aMatch[1];
        const label = aMatch[2].replace(/<[^>]*>/g, '').trim();
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td align="center" style="padding:8px 0 16px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" bgcolor="#0f3c5c" style="background-color:#0f3c5c; border-radius:6px; padding:12px 24px;"><a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; line-height:18px; text-decoration:none; display:inline-block;">${label}</a></td></tr></table></td></tr></table>`;
      }
    );

    out = out.replace(
      /<table\b([^>]*style="[^"]*border-collapse:\s*separate[^"]*"[^>]*)>([\s\S]*?)<\/table>/gi,
      (_m, attrs, inner) => {
        const cleanAttrs = attrs.replace(/\s*margin\s*:[^;"]+;?/gi, '');
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td style="padding:4px 0 16px 0;"><table${cleanAttrs}>${inner}</table></td></tr></table>`;
      }
    );

    out = out.replace(/<p(\s+[^>]*)?>/gi, (_m, attrs = '') => {
      const baseStyle = "margin:0 0 12px 0; line-height:1.55; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:15px; color:#333333;";
      if (!attrs || !/style=/i.test(attrs)) {
        return `<p${attrs} style="${baseStyle}">`;
      }
      const updatedAttrs = attrs.replace(/style="([^"]*)"/i, (_sm, s) => {
        let cleaned = s.replace(/background\s*:\s*white\s*;?/gi, '').trim();
        if (!/font-family/i.test(cleaned)) cleaned += (cleaned && !cleaned.endsWith(';') ? ';' : '') + "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
        if (!/font-size/i.test(cleaned)) cleaned += 'font-size:15px;';
        if (!/line-height/i.test(cleaned)) cleaned += 'line-height:1.55;';
        if (!/(?:^|;)\s*color/i.test(cleaned)) cleaned += 'color:#333333;';
        if (!/margin/i.test(cleaned)) cleaned += 'margin:0 0 12px 0;';
        return `style="${cleaned}"`;
      });
      return `<p${updatedAttrs}>`;
    });

    out = out.replace(/<(ul|ol)(\s+[^>]*)?>/gi, (_m, tag, attrs = '') => {
      if (/style=/i.test(attrs)) return `<${tag}${attrs}>`;
      return `<${tag}${attrs} style="margin:0 0 14px 0; padding-left:22px; font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:15px; line-height:1.55; color:#333333;">`;
    });

    return out;
  }

  function buildRentalEmailHtml(title, bannerColor, bodyHtml, settings, options = {}) {
    const logoUrl = settings?.logo_url || 'https://sps-b55.pages.dev/icons/icon-512.png';
    const clubName = settings?.club_name || 'Sportschützen Muhen';
    const bannerTitle = options.bannerTitle || title;
    const normalizedBody = normalizeRentalBodyForEmail(bodyHtml);

    const cardHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f1f5f9" style="background-color:#f1f5f9; border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:20px 12px;">
          <!--[if mso]>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="650" align="center" style="border-collapse:collapse;"><tr><td>
          <![endif]-->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="width:100%; max-width:650px; margin:0 auto; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; background-color:#ffffff; border-collapse:collapse; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
            <tr>
              <td bgcolor="${bannerColor}" style="background-color:${bannerColor}; padding:18px 24px; text-align:left; vertical-align:middle;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle; padding-right:14px; width:42px;">
                      <img src="${logoUrl}" width="38" height="38" style="width:38px; height:38px; display:block; border-radius:6px; border:1px solid #cbd5e1;" border="0" alt="Logo">
                    </td>
                    <td style="vertical-align:middle; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
                      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:19px; font-weight:600; color:#ffffff; line-height:1.25;">${escHtml(bannerTitle)}</div>
                      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif; font-size:12px; color:#e2e8f0; margin-top:3px; line-height:1.3;">${escHtml(clubName)} – Schützenstube Muhen</div>
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

    return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:'Segoe UI',Arial,Helvetica,sans-serif; color:#333333; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
${cardHtml}
</body>
</html>`;
  }

  async function renderWebsiteRentalMail({ restUrl, anonKey, tplCode, placeholderMap, settingsMap }) {
    const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
    const tplRes = await fetch(`${restUrl}/document_templates?code=eq.${encodeURIComponent(tplCode)}&select=mail_subject,mail_body`, { headers });
    if (!tplRes.ok) {
      throw new Error(`Vorlage '${tplCode}' konnte nicht geladen werden (HTTP ${tplRes.status}).`);
    }
    const tplRows = await tplRes.json();
    const tpl = tplRows && tplRows[0];
    if (!tpl || !tpl.mail_subject || !tpl.mail_body) {
      throw new Error(`Konfigurationsfehler: Die E-Mail-Vorlage '${tplCode}' fehlt in 'document_templates' oder ist unvollständig.`);
    }

    let s = settingsMap || {};
    if (!settingsMap) {
      const setRes = await fetch(`${restUrl}/rental_settings?select=setting_key,setting_value`, { headers });
      if (setRes.ok) {
        const setRows = await setRes.json();
        s = {};
        (setRows || []).forEach(r => { s[r.setting_key] = r.setting_value; });
      }
    }

    const vermieterFirst = s.sender_first_name || '';
    const vermieterLast = s.sender_last_name || '';
    const vermieterName = `${vermieterFirst} ${vermieterLast}`.trim() || 'Sportschützen Muhen';
    const vermieterPhone = s.sender_phone || '';
    const clubEmail = s.club_email || 'sportschuetzen.muhen@gmail.com';

    const mergedMap = {
      vermieter_vorname: vermieterFirst,
      vermieter_nachname: vermieterLast,
      vermieter_name: vermieterName,
      vermieter_telefon: vermieterPhone,
      vermieter_email: clubEmail,
      wirtschaft_name: s.wirtschaft_name || 'Wirtschaftsteam',
      wirtschaft_phone: s.wirtschaft_phone || '',
      wirtschaft_email: s.wirtschaft_email || clubEmail,
      zahlungsfrist_tage: String(s.payment_due_days || 14),
      zahlungsfrist: String(s.payment_due_days || 14),
      mietobjekt: s.rental_object || 'Schützenstube Rüteli',
      cockpit_url: 'https://sportschuetzen-muhen.ch/vorstand/#vermietung',
      club_email: clubEmail,
      ...placeholderMap
    };

    let subject = tpl.mail_subject;
    let body = tpl.mail_body;
    Object.entries(mergedMap).forEach(([k, v]) => {
      const rx = new RegExp(`\\{{1,2}${k}\\}{1,2}`, 'gi');
      const rawVal = v == null ? '' : String(v);
      subject = subject.replace(rx, () => rawVal);
      // URLs nicht HTML-escapen, Textwerte im Body sauber escapen
      const safeBodyVal = k.endsWith('_url') ? rawVal : escHtml(rawVal);
      body = body.replace(rx, () => safeBodyVal);
    });

    const bodyHtml = /<[a-z][\s\S]*>/i.test(body)
      ? body
      : body.split(/\n\s*\n/).map(p => `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('');

    const cfg = RENTAL_BANNER_CONFIG[tplCode] || { color: '#0f3c5c', title: subject };
    const html = buildRentalEmailHtml(subject, cfg.color, bodyHtml, s, { bannerTitle: cfg.title || subject });

    return { subject, html, settings: s };
  }

  global.RentalMailLayout = {
    RENTAL_BANNER_CONFIG,
    normalizeRentalBodyForEmail,
    buildRentalEmailHtml,
    renderWebsiteRentalMail
  };
})(window);
