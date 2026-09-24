/**
 * pdf-engine.js
 * ==============================================================================
 * Phase 21: Zentrale PDF-Engine Client-Integration für das Vorstand-Portal
 * Projekt: Vereinsportal Sportschützen Muhen
 *
 * Stellt modulübergreifend bereit:
 * - window.generatePdfViaEngine(options)
 * - window.rnGeneratePDFOnly(invoiceId, name) [Ablösung GAS in Rechnungen & Faktura]
 * - window.jbGenerateInvoicePdfRemote(rId, pn) [Ablösung GAS in Jahresbeitrag]
 * - window.vmGenerateRentalContractPdf(bookingId) [Ablösung GAS in Vermietung]
 * - Swiss QR-Bill (SIX SPC 0200 1) Vektor- & Browser-Engine mit Direktablage in
 *   Supabase Storage (Bucket 'operatives-storage') und Paperless-NGX Anbindung.
 * ==============================================================================
 */

(function () {
    const SUPABASE_URL = 'https://supabase-muhen.danfamily.uk';
    const FUNCTION_NAME = 'generate-pdf';
    const STORAGE_BUCKET = 'operatives-storage';

    const CLUB_IBAN = 'CH0680808003633131892';
    const CLUB_IBAN_FORMATTED = 'CH06 8080 8003 6331 3189 2';
    const CLUB_NAME = 'Sportschützen Muhen';
    const CLUB_ZIP = '5037';
    const CLUB_CITY = 'Muhen';
    const CLUB_COUNTRY = 'CH';

    /**
     * Erzeugt den standardisierten Schweizer QR-Rechnungstext nach SIX SPC 0200 1
     */
    window.createSwissQrBillPayload = function (invoice, recipient) {
        const cleanIban = CLUB_IBAN.replace(/\s/g, '');
        const isFirma = recipient.typ === 'firma' ||
            Boolean(recipient.firma) ||
            Boolean(recipient.name && recipient.name.match(/\b(AG|GmbH|Genossenschaft|Verein|Verband|Stiftung|Gemeinde)\b/i));

        let debtorName = '';
        if (isFirma) {
            debtorName = recipient.firma || recipient.name || '';
        } else {
            debtorName = [recipient.vorname, recipient.nachname].filter(Boolean).join(' ').trim() || (recipient.name || '');
        }
        if (debtorName.length > 70) debtorName = debtorName.substring(0, 70);

        // Strasse und Nummer aufteilen
        const strasse = (recipient.strasse || '').trim();
        const parts = strasse.split(/\s+(?=\d)/);
        const streetName = parts[0] || '–';
        const houseNumber = parts.slice(1).join(' ') || ' ';

        const totalAmount = Number(invoice.total_amount || invoice.amount || 0);
        const formattedAmount = totalAmount > 0 ? totalAmount.toFixed(2) : '';
        const qrRefText = `${invoice.id || 'RECHNUNG'} / ${invoice.type || 'Rechnung'} ${invoice.year || new Date().getFullYear()}`;

        return [
            "SPC", "0200", "1",
            cleanIban,
            "S", CLUB_NAME, "", "", CLUB_ZIP, CLUB_CITY, CLUB_COUNTRY,
            "", "", "", "", "", "", "",
            formattedAmount, "CHF",
            "S", debtorName || "Debitor",
            streetName, houseNumber,
            recipient.plz || CLUB_ZIP,
            recipient.ort || CLUB_CITY,
            recipient.land || "CH",
            "NON", "",
            qrRefText,
            "EPD"
        ].join('\n');
    };

    /**
     * Zentraler PDF-Generierungs-Call an die Supabase Edge Function 'generate-pdf'
     * @param {Object} options
     * @param {string} options.action - 'generate-invoice' | 'generate-contract'
     * @param {string} options.invoiceId - ID der Rechnung
     * @param {string} [options.bookingId] - ID der Vermietung
     * @param {Object} options.recipient - { vorname, nachname, strasse, plz, ort, email, firma }
     * @param {Object} [options.sender] - { vorname, nachname, funktion, verein, email }
     * @param {Object} [options.layout] - { title, intro, outro, notice }
     * @param {Array}  [options.positions] - [{ description, quantity, unit_price, amount }]
     * @param {number} [options.totalAmount]
     * @param {number|string} [options.year]
     * @param {string} [options.type]
     * @returns {Promise<{success: boolean, pdfUrl?: string, storagePath?: string, pdfBase64?: string, error?: string}>}
     */
    window.generatePdfViaEngine = async function (options) {
        if (!options || (!options.invoiceId && !options.bookingId)) {
            return { success: false, error: 'Rechnungs-ID oder Buchungs-ID ist erforderlich.' };
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

        const defaultAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';
        const keyToUse = apiKey || defaultAnonKey;

        const headers = {
            'Content-Type': 'application/json',
            'apikey': keyToUse,
            'Authorization': `Bearer ${authToken || keyToUse}`
        };

        const targetUrl = `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`;
        console.log(`📄 [PDF-Engine] Erzeuge PDF via Supabase Edge Function (${options.action || 'generate-invoice'}):`, options.invoiceId || options.bookingId);

        try {
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(options)
            });

            const result = await resp.json();

            if (resp.ok && result.success) {
                console.log(`✅ [PDF-Engine] PDF erfolgreich erstellt & in Storage abgelegt:`, result.pdfUrl);
                return result;
            } else {
                console.warn(`⚠️ [PDF-Engine] Edge Function Fehler:`, result);
                return {
                    success: false,
                    error: result.error || `HTTP ${resp.status}: PDF-Generierung fehlgeschlagen`
                };
            }
        } catch (fetchErr) {
            console.error(`❌ [PDF-Engine] Netzwerk-/Verbindungsfehler:`, fetchErr);
            return {
                success: false,
                error: `Verbindung zur PDF-Engine fehlgeschlagen: ${fetchErr.message}`
            };
        }
    };

    /**
     * Browser-Fallback: Erzeugt ein Basis-PDF direkt im Browser via jsPDF,
     * lädt es in den Supabase Storage Bucket hoch und aktualisiert den Datensatz.
     */
    window.generatePdfClientFallback = async function (options) {
        if (!window.jspdf?.jsPDF) {
            throw new Error("Weder Edge Function noch jsPDF im Browser verfügbar.");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const curYear = options.year || new Date().getFullYear();
        const invId = options.invoiceId || options.bookingId || 'RE';
        const recipient = options.recipient || {};
        const total = Number(options.totalAmount || 0);

        // Header
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text(CLUB_NAME, 20, 20);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`${CLUB_STREET} · ${CLUB_ZIP} ${CLUB_CITY} · ${CLUB_EMAIL}`, 20, 26);

        // Empfänger
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        let y = 45;
        if (recipient.firma) { doc.text(recipient.firma, 125, y); y += 5; }
        const rName = [recipient.vorname, recipient.nachname].filter(Boolean).join(' ') || recipient.name || '';
        if (rName) { doc.text(rName, 125, y); y += 5; }
        if (recipient.strasse) { doc.text(recipient.strasse, 125, y); y += 5; }
        doc.text(`${recipient.plz || ''} ${recipient.ort || ''}`.trim(), 125, y);

        // Titel
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.text(`Rechnung ${invId} – ${options.type || 'Jahresbeitrag'} ${curYear}`, 20, 75);

        // Einleitung
        doc.setFontSize(9.5);
        doc.setFont(undefined, 'normal');
        const salutation = recipient.vorname ? `Guten Tag ${recipient.vorname},` : 'Guten Tag,';
        doc.text(salutation, 20, 85);
        doc.text(`anbei erhalten Sie die Rechnung über CHF ${total.toFixed(2)}.`, 20, 92);

        // Positionen
        doc.setLineWidth(0.3);
        doc.rect(20, 100, 170, 7, 'F');
        doc.setFont(undefined, 'bold');
        doc.text("Pos.", 22, 105);
        doc.text("Beschreibung", 35, 105);
        doc.text("Betrag (CHF)", 165, 105);

        doc.setFont(undefined, 'normal');
        let py = 113;
        const positions = options.positions || [{ description: options.type || "Rechnung", amount: total }];
        positions.forEach((p, i) => {
            doc.text(String(i + 1), 22, py);
            doc.text(String(p.description || '').substring(0, 50), 35, py);
            doc.text(Number(p.amount || p.unit_price || 0).toFixed(2), 165, py);
            py += 6;
        });

        doc.line(20, py, 190, py);
        py += 5;
        doc.setFont(undefined, 'bold');
        doc.text("Gesamtbetrag:", 130, py);
        doc.text(`CHF ${total.toFixed(2)}`, 165, py);

        // QR-Zahlteil Trennlinie bei 105mm von unten (297 - 105 = 192mm)
        doc.setLineDash([2, 2], 0);
        doc.line(0, 192, 210, 192);
        doc.line(62, 192, 62, 297);
        doc.setLineDash([], 0);

        // Empfangsschein
        doc.setFontSize(11);
        doc.text("Empfangsschein", 5, 200);
        doc.setFontSize(7);
        doc.text("Konto / Zahlbar an", 5, 208);
        doc.text(CLUB_IBAN_FORMATTED, 5, 212);
        doc.text(CLUB_NAME, 5, 215);
        doc.text(`${CLUB_ZIP} ${CLUB_CITY}`, 5, 218);
        doc.text("Zahlbar durch", 5, 226);
        doc.text(rName, 5, 230);
        doc.text(recipient.strasse || '', 5, 233);
        doc.text(`${recipient.plz || ''} ${recipient.ort || ''}`.trim(), 5, 236);
        doc.text("CHF", 5, 285);
        doc.text(total.toFixed(2), 20, 285);

        // Zahlteil
        doc.setFontSize(11);
        doc.text("Zahlteil", 67, 200);
        doc.setFontSize(8);
        doc.text("Konto / Zahlbar an", 118, 208);
        doc.text(CLUB_IBAN_FORMATTED, 118, 212);
        doc.text(CLUB_NAME, 118, 216);
        doc.text(`${CLUB_ZIP} ${CLUB_CITY}`, 118, 220);
        doc.text("Zusätzliche Informationen", 118, 228);
        doc.text(`${invId} / ${options.type || 'Rechnung'} ${curYear}`, 118, 232);
        doc.text("Zahlbar durch", 118, 240);
        doc.text(rName, 118, 244);
        doc.text(recipient.strasse || '', 118, 247);
        doc.text(`${recipient.plz || ''} ${recipient.ort || ''}`.trim(), 118, 250);
        doc.text("CHF", 67, 285);
        doc.text(total.toFixed(2), 85, 285);

        // Blob erzeugen & in Supabase Storage hochladen
        const pdfBlob = doc.output('blob');
        const safeName = (recipient.nachname || recipient.name || 'Rechnung').replace(/[^a-zA-Z0-9_-]/g, '_');
        const storagePath = `invoices/${curYear}/Rechnung_${invId}_${safeName}.pdf`;

        const supa = (typeof window.getSupabaseClient === 'function')
            ? window.getSupabaseClient()
            : (window.supabaseClient || null);

        let publicUrl = '';
        if (supa) {
            try {
                await supa.storage.from(STORAGE_BUCKET).upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
                const { data } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
                publicUrl = data?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;

                await supa.from('invoices').update({
                    pdf_url: publicUrl,
                    pdf_storage_path: storagePath,
                    updated_at: new Date().toISOString()
                }).eq('id', invId);
            } catch (upErr) {
                console.warn("Storage Upload Fallback Fehler:", upErr);
            }
        }

        const pdfBase64 = doc.output('datauristring');
        return {
            success: true,
            pdfUrl: publicUrl || pdfBase64,
            storagePath: storagePath,
            pdfBase64: pdfBase64
        };
    };

    // ==========================================================================
    // MODUL-ÜBERSCHREIBUNGEN: ABLÖSUNG DER GOOGLE APPS SCRIPTS
    // ==========================================================================

    /**
     * Zentrale Ablösung für Rechnungen-Cockpit (vorstand/js/rechnungen.js)
     */
    window.rnGeneratePDFOnly = async function (invoiceId, name) {
        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay(`Generiere QR-Rechnung PDF für ${name || invoiceId}...`);
        }

        const inv = (window._invoices || []).find(i => String(i.id).trim() === String(invoiceId).trim()) || { id: invoiceId, name: name };
        const m = (window._mglData || []).find(x => String(x.PersonNumber).trim() === String(inv.PersonNumber || '').trim()) || {};

        const recipient = (typeof rnGetRecipientForInvoice === 'function')
            ? rnGetRecipientForInvoice(inv)
            : {
                vorname: m.FirstName || (inv.name ? inv.name.split(' ')[0] : ''),
                nachname: m.LastName || (inv.name ? inv.name.split(' ').slice(1).join(' ') : ''),
                name: inv.name || `${m.FirstName || ''} ${m.LastName || ''}`.trim(),
                strasse: m.Street || m.Strasse || '',
                plz: m.ZipCode || m.PLZ || m.PostCode || '5037',
                ort: m.City || m.Ort || 'Muhen',
                email: m.Email || m.PrimaryEmail || ''
            };

        const sender = (typeof rnGetLoggedInSender === 'function')
            ? rnGetLoggedInSender(inv.type || 'Jahresbeitrag')
            : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType(inv.type || 'Jahresbeitrag') : null);

        const layout = (window._invoiceLayouts && window._invoiceLayouts[inv.type]) || null;

        const payload = {
            action: 'generate-invoice',
            invoiceId: invoiceId,
            recipient: recipient,
            sender: sender,
            layout: layout,
            totalAmount: inv.total_amount,
            year: inv.year || new Date().getFullYear(),
            type: inv.type || 'Rechnung'
        };

        try {
            let result = await window.generatePdfViaEngine(payload);

            // Fallback auf Browser jsPDF falls Edge Function nicht antwortet
            if (!result.success) {
                console.warn("⚠️ Edge Function nicht erreichbar, nutze Browser-Fallback...", result.error);
                result = await window.generatePdfClientFallback(payload);
            }

            if (result.success) {
                if (typeof showSuccess === 'function') {
                    showSuccess("🎉 Schweizer QR-Rechnung erfolgreich generiert!");
                }

                // URL im lokalen In-Memory-Array aktualisieren
                inv.pdf_url = result.pdfUrl || inv.pdf_url;
                inv.pdf_storage_path = result.storagePath || inv.pdf_storage_path;

                // PDF im neuen Browser-Tab öffnen
                if (result.pdfUrl && result.pdfUrl.startsWith('http')) {
                    window.open(result.pdfUrl, '_blank');
                } else if (result.pdfBase64) {
                    if (typeof openPdfBase64 === 'function') {
                        openPdfBase64(result.pdfBase64);
                    } else {
                        const win = window.open();
                        win?.document.write(`<iframe src="${result.pdfBase64}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`);
                    }
                }

                if (typeof loadRechnungenData === 'function') {
                    await loadRechnungenData(true);
                }
            } else {
                throw new Error(result.error || "Generierung fehlgeschlagen.");
            }
        } catch (err) {
            console.error("PDF Fehler:", err);
            alert("❌ PDF Fehler: " + err.message);
        } finally {
            if (typeof hideLoadingOverlay === 'function') {
                hideLoadingOverlay();
            }
        }
    };

    /**
     * Zentrale Ablösung für Jahresbeitrag-Cockpit (vorstand/js/jahresbeitrag/jahresbeitrag-overview.js)
     */
    window.jbGenerateInvoicePdfRemote = async function (rId, pn) {
        const btn = document.getElementById(`btn-pdf-${rId}`);
        let oldHtml = '';
        if (btn) {
            oldHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 14px; height: 14px;"></span>';
        }

        try {
            const allJb = window._jbData || [];
            const r = allJb.find(x => String(x.id).trim() === String(rId).trim());
            if (!r) throw new Error("Rechnungs-Eintrag nicht gefunden.");

            const m = (window._jbMemberMap && window._jbMemberMap[String(pn)]) || {};
            const name = m.FirstName ? `${m.FirstName} ${m.LastName}` : pn;

            // Invoice-ID ermitteln
            let invoiceId = r.id;
            if (typeof ensureInvoiceCreatedRemote === 'function') {
                invoiceId = await ensureInvoiceCreatedRemote(r, m, name);
            }

            const sender = (typeof rnGetLoggedInSender === 'function')
                ? rnGetLoggedInSender('Jahresbeitrag')
                : (typeof jbGetSenderForInvoiceType === 'function' ? jbGetSenderForInvoiceType(r.type || 'Jahresbeitrag') : null);

            const layout = (window._invoiceLayouts && window._invoiceLayouts['Jahresbeitrag']) || null;

            const payload = {
                action: 'generate-invoice',
                invoiceId: invoiceId,
                recipient: {
                    vorname: m.FirstName || '',
                    nachname: m.LastName || '',
                    name: name,
                    strasse: m.Street || m.Strasse || '',
                    plz: m.PostCode || m.PLZ || '5037',
                    ort: m.City || m.Ort || 'Muhen',
                    email: m.PrimaryEmail || m.Email || ''
                },
                sender: sender,
                layout: layout,
                totalAmount: r.total_amount || r.betrag || 0,
                year: r.year || new Date().getFullYear(),
                type: 'Jahresbeitrag'
            };

            let res = await window.generatePdfViaEngine(payload);
            if (!res.success) {
                res = await window.generatePdfClientFallback(payload);
            }

            if (!res.success) throw new Error(res.error);

            if (typeof showToast === 'function') {
                showToast("🎉 QR-Rechnung erfolgreich generiert!");
            }

            if (res.pdfUrl && res.pdfUrl.startsWith('http')) {
                window.open(res.pdfUrl, '_blank');
            } else if (res.pdfBase64 && typeof openPdfBase64 === 'function') {
                openPdfBase64(res.pdfBase64);
            }

            if (typeof loadJahresbeitragData === 'function') {
                await loadJahresbeitragData(true, false);
            }
        } catch (err) {
            console.error("Jahresbeitrag PDF Fehler:", err);
            alert("Fehler bei PDF-Erstellung: " + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = oldHtml;
            }
        }
    };

    /**
     * Zentrale PDF-Generierung für Vermietungs-Mietverträge (vorstand/js/vermietung/vermietung-manager.js)
     */
    window.vmGenerateRentalContractPdf = async function (bookingId) {
        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay(`Generiere Mietvertrag PDF für ${bookingId}...`);
        }

        const supa = (typeof window.getSupabaseClient === 'function')
            ? window.getSupabaseClient()
            : (window.supabaseClient || null);

        let booking = null;
        if (supa) {
            const { data } = await supa.from('rental_bookings').select('*').or(`booking_number.eq.${bookingId},id.eq.${bookingId}`).single();
            booking = data;
        }

        const payload = {
            action: 'generate-contract',
            bookingId: bookingId,
            recipient: {
                vorname: booking?.first_name || '',
                nachname: booking?.last_name || '',
                name: `${booking?.first_name || ''} ${booking?.last_name || ''}`.trim() || 'Mieter',
                strasse: booking?.street || '',
                plz: booking?.post_code || '5037',
                ort: booking?.city || 'Muhen',
                email: booking?.email || '',
                telefon: booking?.phone || ''
            },
            mietdatum: booking?.start_date ? new Date(booking.start_date).toLocaleDateString('de-CH') : new Date().toLocaleDateString('de-CH'),
            festbeginn: '14:00 Uhr',
            mietbetrag: booking?.total_amount_chf || 300,
            kaution: booking?.deposit_amount_chf || 200,
            type: 'Vermietung'
        };

        try {
            let res = await window.generatePdfViaEngine(payload);
            if (!res.success) {
                res = await window.generatePdfClientFallback(payload);
            }

            if (res.success) {
                if (typeof showSuccess === 'function') {
                    showSuccess("🎉 Mietvertrag PDF erfolgreich generiert!");
                }
                if (res.pdfUrl && res.pdfUrl.startsWith('http')) {
                    window.open(res.pdfUrl, '_blank');
                } else if (res.pdfBase64 && typeof openPdfBase64 === 'function') {
                    openPdfBase64(res.pdfBase64);
                }
                return res;
            } else {
                throw new Error(res.error || "Generierung fehlgeschlagen.");
            }
        } catch (err) {
            console.error("Mietvertrag PDF Fehler:", err);
            alert("❌ Fehler beim Generieren des Mietvertrags: " + err.message);
        } finally {
            if (typeof hideLoadingOverlay === 'function') {
                hideLoadingOverlay();
            }
        }
    };

    console.log("🚀 [PDF-Engine] Modul geladen: window.generatePdfViaEngine, window.rnGeneratePDFOnly, window.jbGenerateInvoicePdfRemote & window.vmGenerateRentalContractPdf aktiv.");
})();
