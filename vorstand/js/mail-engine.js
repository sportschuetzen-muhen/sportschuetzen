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

    console.log('✅ Supabase Mail-Engine (Phase 20) initialisiert.');
})();
