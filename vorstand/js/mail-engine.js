/**
 * mail-engine.js
 * ==============================================================================
 * Phase 20: Zentrale Mail-Engine Client-Integration für das Vorstand-Portal
 * Projekt: Vereinsportal Sportschützen Muhen
 *
 * Stellt modulübergreifend window.sendMailViaEngine() bereit.
 * Kommuniziert direkt mit der Supabase Edge Function 'send-email'.
 * Unterstützt SMTP-Versand via Gmail (aktuell) und Infomaniak (Zielsystem),
 * automatische Audit-Protokollierung in public.mail_logs und Fallback-Schutz.
 * ==============================================================================
 */

(function () {
    const SUPABASE_URL = 'https://supabase-muhen.danfamily.uk';
    const FUNCTION_NAME = 'send-email';

    /**
     * Zentraler Mail-Versand via Supabase Edge Function
     * @param {Object} options
     * @param {string|string[]} options.to - Empfänger E-Mail-Adresse(n)
     * @param {string|string[]} [options.cc] - CC E-Mail-Adresse(n)
     * @param {string|string[]} [options.bcc] - BCC E-Mail-Adresse(n)
     * @param {string} options.subject - Betreffzeile
     * @param {string} [options.text] - Plaintext Body
     * @param {string} [options.html] - HTML Body
     * @param {string} [options.senderName] - Absender Name (z.B. 'Kassier Sportschützen Muhen')
     * @param {string} [options.senderEmail] - Absender Mailadresse
     * @param {Array} [options.attachments] - [{ filename, contentBase64, contentType, storagePath }]
     * @param {string} [options.moduleRef] - Herkunftsmodul ('rechnung', 'mietvertrag', 'manager', 'allgemein')
     * @param {string} [options.recordId] - Zugehörige ID (z.B. Rechnungsnummer 'RE-2026-0042')
     * @param {string} [options.systemMailKey] - Key aus public.system_mail_configs
     * @param {boolean} [options.simulate] - Nur simulieren, kein echter SMTP-Push
     * @returns {Promise<{success: boolean, logId?: string, message?: string, error?: string}>}
     */
    window.sendMailViaEngine = async function (options) {
        if (!options || !options.to || !options.subject) {
            return { success: false, error: 'Empfänger (to) und Betreff (subject) sind erforderlich.' };
        }

        const supa = (typeof window.getSupabaseClient === 'function')
            ? window.getSupabaseClient()
            : (window.supabaseClient || null);

        let authToken = null;
        let apiKey = null;

        if (supa) {
            try {
                const session = await supa.auth.getSession();
                authToken = session?.data?.session?.access_token || null;
                apiKey = supa.supabaseKey || null;
            } catch (_) {}
        }

        // Standard-Anon-Key als Fallback
        const defaultAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';
        const keyToUse = apiKey || defaultAnonKey;

        const headers = {
            'Content-Type': 'application/json',
            'apikey': keyToUse,
            'Authorization': `Bearer ${authToken || keyToUse}`
        };

        const targetUrl = `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`;
        console.log(`📤 [Mail-Engine] Sende Mail via Supabase Edge Function an:`, options.to);

        try {
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(options)
            });

            const result = await resp.json();

            if (resp.ok && result.success) {
                console.log(`✅ [Mail-Engine] Mail erfolgreich versendet / geloggt (Log-ID: ${result.logId})`);
                return result;
            } else {
                console.warn(`⚠️ [Mail-Engine] Fehlerantwort der Edge Function:`, result);
                return {
                    success: false,
                    error: result.error || `HTTP ${resp.status}: Mailversand fehlgeschlagen`,
                    logId: result.logId
                };
            }
        } catch (fetchErr) {
            console.error(`❌ [Mail-Engine] Netzwerk-/Verbindungsfehler zur Edge Function:`, fetchErr);
            return {
                success: false,
                error: `Verbindung zur Mail-Engine fehlgeschlagen: ${fetchErr.message}`
            };
        }
    };

    /**
     * Testet die SMTP-Verbindung live über das Vorstand-Portal
     * @param {string} testTargetEmail
     */
    window.testSmtpConnectionViaEngine = async function (testTargetEmail) {
        if (!testTargetEmail || !testTargetEmail.includes('@')) {
            alert('Bitte eine gültige Test-E-Mail-Adresse angeben.');
            return;
        }

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay('Sende Test-E-Mail über Supabase Mail-Engine...');
        }

        try {
            const res = await window.sendMailViaEngine({
                to: testTargetEmail,
                subject: `Test-Mail Supabase Mail-Engine [${new Date().toLocaleTimeString('de-CH')}]`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 500px;">
                        <h3 style="color: #198754; margin-top: 0;">🎉 Supabase Mail-Engine Test</h3>
                        <p>Dies ist eine automatische Test-Nachricht aus dem Vereinsportal der Sportschützen Muhen.</p>
                        <ul>
                            <li><strong>System:</strong> Supabase Edge Function (send-email)</li>
                            <li><strong>Zeitstempel:</strong> ${new Date().toLocaleString('de-CH')}</li>
                            <li><strong>Empfänger:</strong> ${testTargetEmail}</li>
                        </ul>
                        <p style="font-size: 12px; color: #666; margin-bottom: 0;">Bereit für Phase 20 (Gmail / Infomaniak Transition).</p>
                    </div>
                `,
                moduleRef: 'system_test',
                recordId: 'TEST-' + Date.now()
            });

            if (res.success) {
                if (typeof showSuccess === 'function') {
                    showSuccess(`🎉 ${res.message || 'Test-Mail erfolgreich versendet!'}`);
                } else {
                    alert(`🎉 ${res.message || 'Test-Mail erfolgreich versendet!'}`);
                }
            } else {
                throw new Error(res.error || 'Versand fehlgeschlagen.');
            }
        } catch (e) {
            if (typeof showError === 'function') {
                showError(`Fehler beim SMTP-Test: ${e.message}`);
            } else {
                alert(`❌ Fehler beim SMTP-Test: ${e.message}`);
            }
        } finally {
            if (typeof hideLoadingOverlay === 'function') {
                hideLoadingOverlay();
            }
        }
    };

    /**
     * Interaktiver Prompt für den Vorstand zur Durchführung eines SMTP-Verbindungstests
     */
    window.promptSmtpTest = async function () {
        const defaultMail = (window._currentLoggedInUser && window._currentLoggedInUser.email) || 'daniel.hunziker@gmail.com';
        const target = prompt('Ziel-E-Mail-Adresse für den SMTP-Testversand angeben:', defaultMail);
        if (!target) return;
        await window.testSmtpConnectionViaEngine(target.trim());
        if (typeof loadMailLogData === 'function') {
            setTimeout(() => loadMailLogData(true), 1200);
        }
    };

    /**
     * Zentrales Rahmen-Layout (Shell / Corporate Identity) für Vereins-E-Mails.
     * @param {Object} params
     * @param {string} [params.title] - Haupttitel (z.B. 'Rechnung Jahresbeitrag', 'Mitteilung')
     * @param {string} [params.subtitle] - Untertitel / Kategorie (z.B. 'Rechnungsversand', 'Vorstandsbrief')
     * @param {string} params.contentHtml - Eigentlicher HTML-Inhalt des Moduls
     * @param {string} [params.noticeHtml] - Auffällige Hinweisbox (z.B. Frist, Anmerkung)
     * @param {string} [params.senderInfo] - Vorstandssignatur
     * @returns {string} Vollständiges, mobil-optimiertes HTML
     */
    window.renderClubEmailHtml = function({
        title = 'Sportschützen Muhen',
        subtitle = 'Mitteilung',
        contentHtml = '',
        noticeHtml = '',
        senderInfo = 'Vorstand Sportschützen Muhen'
    } = {}) {
        const logoUrl = 'https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-192.png';
        const cleanTitle = (typeof escapeHtml === 'function') ? escapeHtml(title) : title;
        const cleanSubtitle = (typeof escapeHtml === 'function') ? escapeHtml(subtitle) : subtitle;
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;color:#1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.05);border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#1a3a5a;padding:20px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="width:56px;vertical-align:middle;">
                    <img src="${logoUrl}" width="50" height="50" alt="Sportschützen Muhen" style="display:block;border-radius:8px;border:2px solid rgba(255,255,255,0.2);">
                  </td>
                  <td style="padding-left:16px;vertical-align:middle;">
                    <div style="font-size:18px;font-weight:bold;color:#ffffff;line-height:1.2;">Sportschützen Muhen</div>
                    <div style="font-size:12px;color:#94a3b8;letter-spacing:0.5px;margin-top:2px;">${cleanSubtitle || 'Offizielle Mitteilung'}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;font-size:14px;line-height:1.6;color:#334155;">
              ${title ? `<h2 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;">${cleanTitle}</h2>` : ''}
              ${contentHtml}

              ${noticeHtml ? `
                <div style="margin-top:20px;background-color:#f8fafc;border-left:4px solid #0284c7;padding:12px 16px;border-radius:6px;font-size:13px;color:#475569;">
                  ${noticeHtml}
                </div>
              ` : ''}

              ${senderInfo ? `
                <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">
                  ${senderInfo.replace(/\n/g, '<br>')}
                </div>
              ` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">
              <strong>Sportschützen Muhen</strong> &bull; Schützenhaus Muhen &bull; 5037 Muhen<br>
              Web: <a href="https://sportschuetzen-muhen.ch" style="color:#0284c7;text-decoration:none;">www.sportschuetzen-muhen.ch</a> &bull; E-Mail: sportschuetzen.muhen@gmail.com<br>
              <em>Dieses Schreiben wurde über das Vereinsportal generiert.</em>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    };

    console.log('✅ Supabase Mail-Engine (Phase 20) initialisiert.');
})();
