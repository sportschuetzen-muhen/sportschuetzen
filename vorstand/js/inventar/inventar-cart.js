// =========================================================
//  MODULE: INVENTAR - CART
//  - Warenkorb-Interaktionen & Transaktions-Submit
// =========================================================

// =========================================================
//  WARENKORB
// =========================================================
function warenkorbAdd() {
    try {
        const action     = document.getElementById('select-action').value;
        const kategorie  = document.getElementById('select-kategorie').value;
        const itemId     = document.getElementById('select-gegenstand').value;
        const zustandA   = document.getElementById('select-zustand-abgabe').value;
        const zustandR   = document.getElementById('select-zustand-rueckgabe').value;
        const pfand      = parseFloat(document.getElementById('pfand-betrag').value) || 0;
        const pfandEin   = document.getElementById('pfand-einnahme').value;
        const pfandRet   = document.getElementById('pfand-retour').value;
        const mitgliedId = document.getElementById('select-mitglied').value;

        if (!mitgliedId) { alert("⚠️ Bitte zuerst ein Mitglied wählen."); return; }
        if (!itemId)     { alert("⚠️ Bitte einen Gegenstand wählen."); return; }

    if (warenkorb.find(w => w.itemId === itemId && w.kategorie === kategorie)) {
        alert("Dieser Gegenstand ist bereits im Warenkorb."); return;
    }

    const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                     "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    const item   = (inventarState[keyMap[kategorie]] || [])
        .find(i => i.ID.toString() === itemId.toString());
    const label  = item ? getItemLabel(kategorie, item) : itemId;

    const isOut = item && item.Aktueller_Besitzer_ID &&
                  item.Aktueller_Besitzer_ID.toString() !== "0" &&
                  item.Aktueller_Besitzer_ID.toString() !== "";

    if (action === 'checkin') {
        if (!item || item.Aktueller_Besitzer_ID.toString() !== mitgliedId.toString()) {
            alert("⚠️ Dieser Gegenstand ist nicht bei diesem Mitglied!"); return;
        }
    } else if (action === 'checkout' || action === 'verkauf') {
        if (isOut) {
            alert("⚠️ Dieser Gegenstand ist bereits ausgegeben/verkauft und nicht im Bestand!"); return;
        }
    }

        const verkaufMethode = document.getElementById('verkauf-methode') ? document.getElementById('verkauf-methode').value : null;
        const pfandMethode = action === 'checkout' ? (pfandEin === 'Nein' ? '-' : pfandEin) : (action === 'checkin' ? pfandRet : null);

        warenkorb.push({ itemId, kategorie, label,
                         zustandAbgabe: zustandA, zustandRueckgabe: zustandR,
                         pfandBetrag: pfand, pfandEinnahme: pfandEin === 'Nein' ? 'Nein' : 'Ja',
                         pfandMethode: pfandMethode,
                         pfandRetour: pfandRet === 'Nein' ? 'Nein' : 'Ja',
                         pfandRetourMethode: pfandRet,
                         verkaufMethode: (action === 'verkauf' ? verkaufMethode : null) });
        renderWarenkorb();
        document.getElementById('pfand-betrag').value = '';
        updateSubOptions();
    } catch(err) {
        console.error("Fehler in warenkorbAdd:", err);
        alert("Fehler beim Hinzufügen: " + err.message);
    }
}

function warenkorbRemove(idx) {
    warenkorb.splice(idx, 1);
    renderWarenkorb();
    updateSubOptions();
}

function renderWarenkorb() {
    const container = document.getElementById('warenkorb-list');
    if (!container) return;

    if (warenkorb.length === 0) {
        container.innerHTML = `<p class="text-muted small mb-0">Noch keine Gegenstände.</p>`;
        document.getElementById('btn-warenkorb-submit').disabled = true;
        return;
    }
    document.getElementById('btn-warenkorb-submit').disabled = false;
    const action = document.getElementById('select-action').value;

    container.innerHTML = `
        <table class="table table-sm table-bordered mb-1">
            <thead><tr class="table-light">
                <th>Kat.</th><th>Gegenstand</th><th>Zustand</th><th>${action === 'verkauf' ? 'Preis' : 'Pfand'}</th><th></th>
            </tr></thead>
            <tbody>
                ${warenkorb.map((w, i) => {
                    let methodeInfo = '';
                    if (w.pfandBetrag > 0) {
                        if (action === 'verkauf') methodeInfo = ` (${w.verkaufMethode || 'Bar'})`;
                        else if (action === 'checkout') methodeInfo = ` (${w.pfandMethode || 'Bar'})`;
                        else if (action === 'checkin') methodeInfo = ` (${w.pfandRetourMethode || 'Bar retour'})`;
                    }
                    return `
                    <tr>
                        <td><span class="badge bg-secondary">${w.kategorie}</span></td>
                        <td><small>${w.label}</small></td>
                        <td><small>${action==='checkout' || action==='verkauf' ? w.zustandAbgabe : w.zustandRueckgabe}</small></td>
                        <td><small>${w.pfandBetrag>0 ? `CHF ${w.pfandBetrag.toFixed(2)}${methodeInfo}` : '-'}</small></td>
                        <td>
                            <button class="btn btn-sm btn-outline-danger py-0"
                                    onclick="warenkorbRemove(${i})">✕</button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
            ${warenkorb.length > 1 ? `
            <tfoot>
                <tr class="table-light fw-bold">
                    <td colspan="3" class="text-end">Total:</td>
                    <td colspan="2">CHF ${warenkorb.reduce((sum, w) => sum + (parseFloat(w.pfandBetrag)||0), 0).toFixed(2)}</td>
                </tr>
            </tfoot>` : ''}
        </table>
        <small class="text-muted">${warenkorb.length} Position(en)</small>`;
}

// =========================================================
//  SUBMIT – Buchung anstoßen
// =========================================================
async function handleInventarSubmit(e) {
    e.preventDefault();
    if (window._isInventarSubmitting) return;
    if (warenkorb.length === 0) { alert("Warenkorb ist leer."); return; }
    
    window._isInventarSubmitting = true;
    setInventarBusy(true);

    const action     = document.getElementById('select-action').value;
    const mitgliedId = document.getElementById('select-mitglied').value;

    const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
    const cleanKonto = rawKonto.split('|')[0].trim();
    if (action === 'verkauf' && !cleanKonto) {
        alert("❌ Bitte wählen Sie für den Verkauf ein gültiges Haben-Konto aus dem Kontenrahmen aus.");
        window._isInventarSubmitting = false;
        setInventarBusy(false);
        return;
    }
    const hasPfandCheckout = action === 'checkout' && warenkorb.some(w => parseFloat(w.pfandBetrag) > 0);
    if (hasPfandCheckout && !cleanKonto) {
        alert("❌ Bitte wählen Sie für das Depot ein gültiges Kautionskonto aus dem Kontenrahmen aus (Standard: 2030).");
        window._isInventarSubmitting = false;
        setInventarBusy(false);
        return;
    }

    const mailAdresse = localStorage.getItem('portal_mailadresse') || localStorage.getItem('portal_mailanzeige') || "";
    const emailToUse = mailAdresse.includes('@') ? mailAdresse : "sportschuetzen.muhen@gmail.com";

    const payloadAction = action === 'verkauf' ? 'VERKAUF' : (action === 'checkout' ? 'AUSGABE' : 'CHECKIN');
    
    let bemerkungen = document.getElementById('trans-bemerkungen').value;
    if (action === 'verkauf') {
        const methods = [...new Set(warenkorb.map(w => w.verkaufMethode))].filter(Boolean);
        bemerkungen = `[VERKAUF - Zahlung: ${methods.join(', ')}] ` + bemerkungen;
    }

    const payload = {
        action:                action === 'verkauf' ? 'checkout' : action,
        Aktion:                payloadAction,
        isVerkauf:             action === 'verkauf',
        Aktueller_Besitzer_ID: mitgliedId,
        mitgliedId:            mitgliedId,
        Bemerkungen:           bemerkungen,
        Verantwortliche_ID:    currentUser,
        verantwortlicheEmail:  emailToUse,
        sigMitglied:           sigPadMitglied ? sigPadMitglied.toDataURL() : "",
        Sig_Vorstand:          sigPadVorstand ? sigPadVorstand.toDataURL() : "",
        items: warenkorb.map(w => ({
            itemId:           w.itemId,
            kategorie:        w.kategorie,
            zustandAbgabe:    w.zustandAbgabe,
            zustandRueckgabe: w.zustandRueckgabe,
            pfandBetrag:      w.pfandBetrag,
            pfandEinnahme:    w.pfandEinnahme,
            pfandRetour:      w.pfandRetour,
            pfandMethode:     w.pfandMethode,
            pfandRetourMethode: w.pfandRetourMethode,
            label:            w.label,
            verkaufMethode:   w.verkaufMethode,
            zahlungsart:      action === 'verkauf' ? w.verkaufMethode : (action === 'checkout' ? w.pfandMethode : w.pfandRetourMethode)
        }))
    };

    // --- SUPABASE FIRST BUCHUNG ---
    const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
    let result = { status: 'success', transactionIds: [] };

    try {
        if (supa) {
            const neuerStatus = action === 'checkin' ? "Im Lager" : (action === 'verkauf' ? "Verkauft" : "Ausgegeben");
            const neuerBesitzer = action === 'checkin' ? null : ((mitgliedId && parseInt(mitgliedId) > 0) ? parseInt(mitgliedId) : null);
            const bookingTime = new Date().toISOString();

            // 1. Transaktionen in Supabase anlegen
            const txRecords = warenkorb.map(w => ({
                timestamp: bookingTime,
                action: payloadAction,
                member_id: (mitgliedId && parseInt(mitgliedId) > 0) ? parseInt(mitgliedId) : null,
                item_id: String(w.itemId).trim(),
                category: w.kategorie,
                condition_out: w.zustandAbgabe || null,
                condition_in: w.zustandRueckgabe || null,
                notes: bemerkungen || null,
                responsible_person: currentUser || 'Vorstand',
                deposit_amount: parseFloat(w.pfandBetrag) || 0,
                deposit_received: action === 'checkout' ? (w.pfandEinnahme || '-') : '-',
                deposit_returned: action === 'checkin' ? (w.pfandRetour || '-') : '-',
                payment_method: action === 'verkauf' ? (w.verkaufMethode || 'Bar') : (action === 'checkout' ? (w.pfandMethode || 'Bar') : (w.pfandRetourMethode || 'Bar retour')),
                sig_member_url: payload.sigMitglied || null,
                sig_board_url: payload.Sig_Vorstand || null
            }));

            const { data: createdTx, error: txErr } = await supa
                .from('inventory_transactions')
                .insert(txRecords)
                .select('id');

            if (txErr) {
                console.warn("Supabase Transaktions-Insert Fehler:", txErr.message);
            } else if (createdTx) {
                result.transactionIds = createdTx.map(t => t.id);
                result.transactionId = createdTx[0]?.id;
            }

            // 2. Artikelstatus & Besitzer aktualisieren
            for (const w of warenkorb) {
                await supa
                    .from('inventory_items')
                    .update({
                        status: neuerStatus,
                        current_owner_id: neuerBesitzer,
                        updated_at: bookingTime
                    })
                    .eq('id', String(w.itemId).trim());
            }

            // 3. Pfand-Verwaltung in Supabase
            if (action === 'checkout') {
                for (const w of warenkorb) {
                    if (parseFloat(w.pfandBetrag) > 0) {
                        const pfandId = 'P-' + Math.floor(100000 + Math.random() * 900000);
                        await supa.from('inventory_deposits').insert([{
                            id: pfandId,
                            member_id: parseInt(mitgliedId),
                            item_id: String(w.itemId).trim(),
                            category: w.kategorie,
                            amount: parseFloat(w.pfandBetrag) || 0,
                            date_out: bookingTime,
                            status: 'Offen',
                            payment_method: w.pfandMethode || 'Bar'
                        }]);
                    }
                }
            } else if (action === 'checkin') {
                for (const w of warenkorb) {
                    if (w.pfandRetour === 'Ja' || (w.pfandRetour && w.pfandRetour !== 'Nein' && w.pfandRetour !== '-')) {
                        await supa.from('inventory_deposits')
                            .update({
                                status: 'Retour',
                                date_returned: bookingTime
                            })
                            .eq('member_id', parseInt(mitgliedId))
                            .eq('item_id', String(w.itemId).trim())
                            .eq('status', 'Offen');
                    }
                }
            }

            // 4. Revisions-Auditlog
            await supa.from('inventory_audit_log').insert([{
                timestamp: bookingTime,
                user_name: currentUser || 'Vorstand',
                action: payloadAction,
                details: `${payloadAction} (${warenkorb.length} Pos.) für Mitglied ${mitgliedId}: ${warenkorb.map(w => w.label || w.itemId).join(', ')}`
            }]);

            console.log("✅ Buchung erfolgreich in Supabase gespeichert!");
        }



        // PDF lokal generieren
        await generateQuittungPDF(
            payload,
            result.transactionId || result.transactionIds?.[0] || '1',
            payload.sigMitglied || "",
            payload.Sig_Vorstand || "",
            action === 'verkauf'
        );

        // --- NACHBEARBEITUNG (Rechnung/Buchhaltung) ---
        if (action === 'verkauf') {
            await verarbeiteVerkaufNachbereitung(warenkorb, mitgliedId);
        } else if (action === 'checkout') {
            await verarbeitePfandRechnungen(warenkorb, mitgliedId);
            await verarbeitePfandBuchhaltung(warenkorb, 'checkout');
        } else if (action === 'checkin') {
            await verarbeitePfandBuchhaltung(warenkorb, 'checkin');
        }

        warenkorb = [];
        renderWarenkorb();
        document.getElementById('form-ausgabe').reset();
        sigPadMitglied?.clear();
        sigPadVorstand?.clear();

        showJournalConfirmationAlert(`${warenkorb.length || 1} Position(en) erfolgreich erfasst (Supabase Master). Bitte überprüfe die Buchung kurz unten in der Liste.`);
        localStorage.setItem('inventar-activeTab', 'journal');
        showInventarSection('journal');
        
        // Journal direkt mit neuen Daten vom Server aktualisieren
        await loadInventarData(true);
        
    } catch(err) {
        console.error("Buchungsfehler:", err);
        alert("❌ Fehler bei der Buchung: " + err.message);
    } finally {
        window._isInventarSubmitting = false;
        setInventarBusy(false);
    }
}

// =========================================================
//  VERKAUF NACHBEREITUNG (Rechnung/Buchhaltung)
// =========================================================
async function verarbeiteVerkaufNachbereitung(verkaufWarenkorb, mitgliedId) {
    try {
        const invoiceItems = verkaufWarenkorb.filter(w => w.verkaufMethode === 'Einzahlungsschein');
        const barTwintItems = verkaufWarenkorb.filter(w => w.verkaufMethode === 'Bar' || w.verkaufMethode === 'Twint');

        // 1. RECHNUNGEN GENERIEREN
        if (invoiceItems.length > 0) {
            const invoiceId = (typeof window.generateSafeInvoiceId === 'function')
                ? window.generateSafeInvoiceId('MV', new Date().getFullYear())
                : `MV-${String(new Date().getFullYear()).slice(-2)}-${String(Math.floor(1000 + Math.random() * 9000))}`;
            const m = (inventarState.mitglieder || []).find(x => String(x.ID) === String(mitgliedId)) || {};
            const mglMaster = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.PersonNumber || m.ID) || String(x.ID) === String(mitgliedId)) || {};

            const memberEmail = (m.email || m.Email || mglMaster.PrimaryEmail || mglMaster.email || '').trim();
            const memberStrasse = mglMaster.Street || m.Strasse || '';
            const memberPlz = mglMaster.PostCode || m.PLZ || '';
            const memberOrt = mglMaster.City || m.Ort || '';
            
            const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
            const customKontoHaben = rawKonto.split('|')[0].trim() || '8501';

            let totalAmount = 0;
            const positions = invoiceItems.map((w, index) => {
                totalAmount += w.pfandBetrag;
                return {
                    position_nr: index + 1,
                    description: `Kleiderverkauf: ${w.label}`,
                    quantity: 1,
                    unit_price: w.pfandBetrag,
                    amount: w.pfandBetrag,
                    konto: customKontoHaben
                };
            });

            const invoiceHeader = {
                id: invoiceId,
                PersonNumber: m.PersonNumber || m.ID || '',
                name: `${m.Nachname || mglMaster.LastName || ''} ${m.Vorname || mglMaster.FirstName || ''}`.trim(),
                year: new Date().getFullYear(),
                type: 'Materialverkauf',
                total_amount: totalAmount,
                status: 'Offen'
            };

            const payloadRechnung = {
                action: 'createInvoice',
                invoice: invoiceHeader,
                positions: positions,
                recipient: {
                    vorname: m.Vorname || mglMaster.FirstName || '',
                    nachname: m.Nachname || mglMaster.LastName || '',
                    strasse: memberStrasse,
                    plz: memberPlz,
                    ort: memberOrt,
                    email: memberEmail
                }
            };

            console.log("Erstelle Rechnung direkt in Supabase Master...", { invoiceId, totalAmount, recipient: payloadRechnung.recipient });

            // 1. Rechnungs-PDF via Supabase PDF-Engine erzeugen
            let pdfUrl = null;
            let pdfStoragePath = null;
            let pdfBase64 = null;
            if (typeof window.generatePdfViaEngine === 'function') {
                try {
                    let pdfRes = await window.generatePdfViaEngine({
                        action: 'generate-invoice',
                        invoiceId: invoiceId,
                        recipient: payloadRechnung.recipient,
                        positions: positions,
                        totalAmount: totalAmount,
                        year: new Date().getFullYear(),
                        type: 'Materialverkauf'
                    });
                    if (!pdfRes || !pdfRes.success) {
                        if (typeof window.generatePdfClientFallback === 'function') {
                            pdfRes = await window.generatePdfClientFallback({
                                invoiceId: invoiceId,
                                recipient: payloadRechnung.recipient,
                                positions: positions,
                                totalAmount: totalAmount,
                                year: new Date().getFullYear(),
                                type: 'Materialverkauf'
                            });
                        }
                    }
                    if (pdfRes && (pdfRes.pdfUrl || pdfRes.storagePath || pdfRes.pdfBase64)) {
                        pdfUrl = pdfRes.pdfUrl || null;
                        pdfStoragePath = pdfRes.storagePath || null;
                        pdfBase64 = pdfRes.pdfBase64 || null;
                    }
                } catch (pdfErr) {
                    console.warn("⚠️ Supabase PDF-Engine Fehler bei Materialverkauf:", pdfErr);
                    if (typeof window.generatePdfClientFallback === 'function') {
                        try {
                            const fbRes = await window.generatePdfClientFallback({
                                invoiceId: invoiceId,
                                recipient: payloadRechnung.recipient,
                                positions: positions,
                                totalAmount: totalAmount,
                                year: new Date().getFullYear(),
                                type: 'Materialverkauf'
                            });
                            if (fbRes && (fbRes.pdfUrl || fbRes.storagePath || fbRes.pdfBase64)) {
                                pdfUrl = fbRes.pdfUrl || null;
                                pdfStoragePath = fbRes.storagePath || null;
                                pdfBase64 = fbRes.pdfBase64 || null;
                            }
                        } catch (fbErr) {
                            console.warn("⚠️ PDF Client Fallback ebenfalls fehlgeschlagen:", fbErr);
                        }
                    }
                }
            }

            // 2. Mailversand via Supabase Mail-Engine (Edge Function send-email)
            let mailResult = null;
            if (memberEmail && memberEmail.includes('@') && typeof window.sendMailViaEngine === 'function') {
                try {
                    const attachments = [];
                    if (pdfStoragePath) {
                        attachments.push({
                            filename: `Rechnung_${invoiceId}.pdf`,
                            contentType: 'application/pdf',
                            storagePath: pdfStoragePath,
                            storageBucket: 'operatives-storage'
                        });
                    } else if (pdfBase64) {
                        attachments.push({
                            filename: `Rechnung_${invoiceId}.pdf`,
                            contentType: 'application/pdf',
                            contentBase64: pdfBase64.replace(/^data:application\/pdf;base64,/, '')
                        });
                    }

                    console.log("Sende Rechnung per E-Mail via Supabase Mail-Engine an", memberEmail, "Anhänge:", attachments.length);
                    mailResult = await window.sendMailViaEngine({
                        to: memberEmail,
                        subject: `Rechnung ${invoiceId} – Materialverkauf | Sportschützen Muhen`,
                        html: `<p>Guten Tag ${invoiceHeader.name},</p><p>vielen Dank für deinen Bezug aus unserem Vereinsinventar. Anbei findest du die Rechnung <strong>${invoiceId}</strong> über CHF ${Number(totalAmount).toFixed(2)} inkl. QR-Einzahlungsschein.</p>`,
                        text: `Guten Tag ${invoiceHeader.name},\n\nvielen Dank für deinen Bezug aus unserem Vereinsinventar. Anbei findest du die Rechnung ${invoiceId} über CHF ${Number(totalAmount).toFixed(2)} inkl. QR-Einzahlungsschein.`,
                        senderName: 'Sportschützen Muhen',
                        senderEmail: 'sportschuetzen.muhen@gmail.com',
                        moduleRef: 'rechnung',
                        recordId: invoiceId,
                        attachments: attachments
                    });
                } catch (mErr) {
                    console.warn("⚠️ Fehler beim Supabase-Mailversand:", mErr);
                }
            }

            // 3. In Supabase Master schreiben (invoices, invoice_positions & mail_logs)
            await saveInventarInvoiceToSupabase({
                invoiceId: invoiceId,
                personNumber: m.PersonNumber || mglMaster.PersonNumber || m.ID || '',
                recipientName: invoiceHeader.name,
                type: 'Materialverkauf',
                totalAmount: totalAmount,
                positions: positions,
                memberEmail: memberEmail,
                pdfUrl: pdfUrl,
                pdfStoragePath: pdfStoragePath,
                mailResult: mailResult
            });
        }

        // 2. NUR BAR IN BUCHHALTUNG VERBUCHEN
        // (Twint wird NICHT sofort gebucht, da Twint erst Tage später als Netto-Sammelüberweisung auf der Bank eingeht)
        const barItems = verkaufWarenkorb.filter(w => w.verkaufMethode === 'Bar');
        if (barItems.length > 0) {
            const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
            const customKontoHaben = rawKonto.split('|')[0].trim() || '8501';

            let seqCounter = 1;
            for (let w of barItems) {
                const uniqueBeleg = `VK-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${seqCounter++}`;
                
                const bhPayload = {
                    action: 'addJournalEntry',
                    beleg_nr: uniqueBeleg,
                    beschreibung: `Materialverkauf (Bar): ${w.label}`,
                    konto_soll: '1000', // Kasse
                    konto_haben: customKontoHaben, // z.B. 3200 Ertrag Materialverkauf
                    betrag: w.pfandBetrag,
                    typ: 'Verkauf',
                    jahr: new Date().getFullYear()
                };

                console.log("Buche Bar-Verkauf in Buchhaltung...", bhPayload);
                const sb = (typeof window.getBuchhaltungSupabaseClient === 'function') ? window.getBuchhaltungSupabaseClient() : (typeof window.getInventarSupabaseClient === 'function' ? window.getInventarSupabaseClient() : null);
                if (sb) {
                    sb.from('accounting_journal').insert({
                        id: `bh_vk_${Date.now()}_${seqCounter}`,
                        jahr: parseInt(bhPayload.jahr, 10),
                        datum: new Date().toISOString().slice(0, 10),
                        beleg_nr: bhPayload.beleg_nr,
                        beschreibung: bhPayload.beschreibung,
                        konto_soll: String(bhPayload.konto_soll).trim(),
                        konto_haben: String(bhPayload.konto_haben).trim(),
                        betrag: Number(bhPayload.betrag || 0),
                        typ: 'Verkauf',
                        created_at: new Date().toISOString()
                    }).then(({ error }) => {
                        if (error) console.warn('[Inventar -> FiBu] Supabase journal insert error:', error);
                        else console.log('✅ Materialverkauf in Supabase FiBu gebucht.');
                    }).catch(e => console.warn('[Inventar -> FiBu] Insert exception:', e));
                }
            }
        }
    } catch (err) {
        console.error("Fehler in der Verkaufs-Nachbereitung:", err);
    }
}

// =========================================================
//  PFAND / DEPOT: KAUTIONSKONTO IN BUCHHALTUNG VERBUCHEN
// =========================================================
async function verarbeitePfandBuchhaltung(cart, action) {
    try {
        const sb = (typeof window.getBuchhaltungSupabaseClient === 'function') ? window.getBuchhaltungSupabaseClient() : (typeof window.getInventarSupabaseClient === 'function' ? window.getInventarSupabaseClient() : null);
        if (action === 'checkout') {
            const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
            const kautionsKonto = rawKonto.split('|')[0].trim() || '2030';
            // Bar-Pfand erhalten: Soll 1000 (Kasse) an Haben 2030 (Kautionen / Depots)
            const barPfand = cart.filter(w => (w.pfandMethode === 'Bar' || w.pfandEinnahme === 'Ja') && w.pfandMethode !== 'Twint' && w.pfandMethode !== 'Einzahlungsschein' && (parseFloat(w.pfandBetrag) || 0) > 0);
            let seqCounter = 1;
            for (let w of barPfand) {
                const betrag = parseFloat(w.pfandBetrag) || 0;
                const uniqueBeleg = `DEP-IN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${seqCounter++}`;
                const bhPayload = {
                    action: 'addJournalEntry',
                    beleg_nr: uniqueBeleg,
                    beschreibung: `Pfand Kasse (Eingang): ${w.label}`,
                    konto_soll: '1000', // Kasse
                    konto_haben: kautionsKonto, // z.B. 2030 Kautionen / Depots (Passivkonto)
                    betrag: betrag,
                    typ: 'Kaution',
                    jahr: new Date().getFullYear()
                };
                console.log("Buche Bar-Pfand Eingang auf Kautionskonto 2030...", bhPayload);
                if (sb) {
                    sb.from('accounting_journal').insert({
                        id: `bh_depin_${Date.now()}_${seqCounter}`,
                        jahr: parseInt(bhPayload.jahr, 10),
                        datum: new Date().toISOString().slice(0, 10),
                        beleg_nr: bhPayload.beleg_nr,
                        beschreibung: bhPayload.beschreibung,
                        konto_soll: String(bhPayload.konto_soll).trim(),
                        konto_haben: String(bhPayload.konto_haben).trim(),
                        betrag: betrag,
                        typ: 'Kaution',
                        created_at: new Date().toISOString()
                    }).then(({ error }) => {
                        if (error) console.warn('[Inventar -> FiBu] Supabase Pfand-Eingang error:', error);
                    }).catch(e => console.warn('[Inventar -> FiBu] Exception:', e));
                }
            }
        } else if (action === 'checkin') {
            // Bar-Pfand zurückbezahlt: Soll 2030 (Kautionen / Depots) an Haben 1000 (Kasse)
            const barRetour = cart.filter(w => (w.pfandRetourMethode === 'Bar' || w.pfandRetour === 'Ja') && w.pfandRetourMethode !== 'Twint' && w.pfandRetourMethode !== 'Banküberweisung');
            let seqCounter = 1;
            for (let w of barRetour) {
                let betrag = parseFloat(w.pfandBetrag) || 0;
                if (betrag === 0 && inventarState?.pfand) {
                    const op = inventarState.pfand.find(p => String(p.Inventar_ID) === String(w.itemId) && (p.Status || '').toLowerCase() === 'offen');
                    if (op) betrag = parseFloat(op.Betrag) || 0;
                }
                if (betrag <= 0) continue;

                const uniqueBeleg = `DEP-OUT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${seqCounter++}`;
                const bhPayload = {
                    action: 'addJournalEntry',
                    beleg_nr: uniqueBeleg,
                    beschreibung: `Pfand Rückzahlung (Bar): ${w.label}`,
                    konto_soll: '2030', // Kautionen / Depots (Passivkonto)
                    konto_haben: '1000', // Kasse
                    betrag: betrag,
                    typ: 'Kaution',
                    jahr: new Date().getFullYear()
                };
                console.log("Buche Bar-Pfand Rückzahlung von Kautionskonto 2030...", bhPayload);
                if (sb) {
                    sb.from('accounting_journal').insert({
                        id: `bh_depout_${Date.now()}_${seqCounter}`,
                        jahr: parseInt(bhPayload.jahr, 10),
                        datum: new Date().toISOString().slice(0, 10),
                        beleg_nr: bhPayload.beleg_nr,
                        beschreibung: bhPayload.beschreibung,
                        konto_soll: String(bhPayload.konto_soll).trim(),
                        konto_haben: String(bhPayload.konto_haben).trim(),
                        betrag: betrag,
                        typ: 'Kaution',
                        created_at: new Date().toISOString()
                    }).then(({ error }) => {
                        if (error) console.warn('[Inventar -> FiBu] Supabase Pfand-Rückzahlung error:', error);
                    }).catch(e => console.warn('[Inventar -> FiBu] Exception:', e));
                }
            }
        }
    } catch (err) {
        console.error("Fehler in verarbeitePfandBuchhaltung:", err);
    }
}

// =========================================================
//  PFAND / DEPOT RECHNUNG GENERIEREN (falls QR-Rechnung gewählt)
// =========================================================
async function verarbeitePfandRechnungen(cart, mitgliedId) {
    try {
        const invoicePfandItems = cart.filter(w => w.pfandMethode === 'Einzahlungsschein' && (parseFloat(w.pfandBetrag) || 0) > 0);
        if (invoicePfandItems.length === 0) return;

        const invoiceId = (typeof window.generateSafeInvoiceId === 'function')
            ? window.generateSafeInvoiceId('DP', new Date().getFullYear())
            : `DP-${String(new Date().getFullYear()).slice(-2)}-${String(Math.floor(1000 + Math.random() * 9000))}`;
        const m = (inventarState.mitglieder || []).find(x => String(x.ID) === String(mitgliedId)) || {};
        const mglMaster = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.PersonNumber || m.ID) || String(x.ID) === String(mitgliedId)) || {};

        const memberEmail = (m.email || m.Email || mglMaster.PrimaryEmail || mglMaster.email || '').trim();
        const memberStrasse = mglMaster.Street || m.Strasse || '';
        const memberPlz = mglMaster.PostCode || m.PLZ || '';
        const memberOrt = mglMaster.City || m.Ort || '';

        const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
        const kautionsKonto = rawKonto.split('|')[0].trim() || '2030';

        let totalAmount = 0;
        const positions = invoicePfandItems.map((w, index) => {
            const betrag = parseFloat(w.pfandBetrag) || 0;
            totalAmount += betrag;
            return {
                position_nr: index + 1,
                description: `Depot / Kaution: ${w.label} (wird bei Rückgabe erstattet)`,
                quantity: 1,
                unit_price: betrag,
                amount: betrag,
                konto: kautionsKonto
            };
        });

        const invoiceHeader = {
            id: invoiceId,
            PersonNumber: m.PersonNumber || m.ID || '',
            name: `${m.Nachname || mglMaster.LastName || ''} ${m.Vorname || mglMaster.FirstName || ''}`.trim(),
            year: new Date().getFullYear(),
            type: 'Depot / Pfand',
            total_amount: totalAmount,
            status: 'Offen'
        };

        const payloadRechnung = {
            action: 'createInvoice',
            invoice: invoiceHeader,
            positions: positions,
            recipient: {
                vorname: m.Vorname || mglMaster.FirstName || '',
                nachname: m.Nachname || mglMaster.LastName || '',
                strasse: memberStrasse,
                plz: memberPlz,
                ort: memberOrt,
                email: memberEmail
            }
        };

        console.log("Erstelle QR-Rechnung für Pfand/Depot direkt in Supabase Master...", { invoiceId, totalAmount, recipient: payloadRechnung.recipient });

        // 1. Rechnungs-PDF via Supabase PDF-Engine erzeugen
        let pdfUrl = null;
        let pdfStoragePath = null;
        let pdfBase64 = null;
        if (typeof window.generatePdfViaEngine === 'function') {
            try {
                let pdfRes = await window.generatePdfViaEngine({
                    action: 'generate-invoice',
                    invoiceId: invoiceId,
                    recipient: payloadRechnung.recipient,
                    positions: positions,
                    totalAmount: totalAmount,
                    year: new Date().getFullYear(),
                    type: 'Depot / Pfand'
                });
                if (!pdfRes || !pdfRes.success) {
                    if (typeof window.generatePdfClientFallback === 'function') {
                        pdfRes = await window.generatePdfClientFallback({
                            invoiceId: invoiceId,
                            recipient: payloadRechnung.recipient,
                            positions: positions,
                            totalAmount: totalAmount,
                            year: new Date().getFullYear(),
                            type: 'Depot / Pfand'
                        });
                    }
                }
                if (pdfRes && (pdfRes.pdfUrl || pdfRes.storagePath || pdfRes.pdfBase64)) {
                    pdfUrl = pdfRes.pdfUrl || null;
                    pdfStoragePath = pdfRes.storagePath || null;
                    pdfBase64 = pdfRes.pdfBase64 || null;
                }
            } catch (pdfErr) {
                console.warn("⚠️ Supabase PDF-Engine Fehler bei Pfand-Rechnung:", pdfErr);
                if (typeof window.generatePdfClientFallback === 'function') {
                    try {
                        const fbRes = await window.generatePdfClientFallback({
                            invoiceId: invoiceId,
                            recipient: payloadRechnung.recipient,
                            positions: positions,
                            totalAmount: totalAmount,
                            year: new Date().getFullYear(),
                            type: 'Depot / Pfand'
                        });
                        if (fbRes && (fbRes.pdfUrl || fbRes.storagePath || fbRes.pdfBase64)) {
                            pdfUrl = fbRes.pdfUrl || null;
                            pdfStoragePath = fbRes.storagePath || null;
                            pdfBase64 = fbRes.pdfBase64 || null;
                        }
                    } catch (fbErr) {
                        console.warn("⚠️ PDF Client Fallback für Pfand ebenfalls fehlgeschlagen:", fbErr);
                    }
                }
            }
        }

        // 2. Mailversand via Supabase Mail-Engine (Edge Function send-email)
        let mailResult = null;
        if (memberEmail && memberEmail.includes('@') && typeof window.sendMailViaEngine === 'function') {
            try {
                const attachments = [];
                if (pdfStoragePath) {
                    attachments.push({
                        filename: `Rechnung_${invoiceId}.pdf`,
                        contentType: 'application/pdf',
                        storagePath: pdfStoragePath,
                        storageBucket: 'operatives-storage'
                    });
                } else if (pdfBase64) {
                    attachments.push({
                        filename: `Rechnung_${invoiceId}.pdf`,
                        contentType: 'application/pdf',
                        contentBase64: pdfBase64.replace(/^data:application\/pdf;base64,/, '')
                    });
                }

                console.log("Sende Pfand-Rechnung per E-Mail via Supabase Mail-Engine an", memberEmail, "Anhänge:", attachments.length);
                mailResult = await window.sendMailViaEngine({
                    to: memberEmail,
                    subject: `Rechnung ${invoiceId} – Depot / Pfand | Sportschützen Muhen`,
                    html: `<p>Guten Tag ${invoiceHeader.name},</p><p>für deine Ausleihe aus unserem Vereinsinventar stellen wir dir hiermit das Pfand / Depot mit der Rechnung <strong>${invoiceId}</strong> über CHF ${Number(totalAmount).toFixed(2)} inkl. QR-Einzahlungsschein zu.</p>`,
                    text: `Guten Tag ${invoiceHeader.name},\n\nfür deine Ausleihe aus unserem Vereinsinventar stellen wir dir hiermit das Pfand / Depot mit der Rechnung ${invoiceId} über CHF ${Number(totalAmount).toFixed(2)} inkl. QR-Einzahlungsschein zu.`,
                    senderName: 'Sportschützen Muhen',
                    senderEmail: 'sportschuetzen.muhen@gmail.com',
                    moduleRef: 'rechnung',
                    recordId: invoiceId,
                    attachments: attachments
                });
            } catch (mErr) {
                console.warn("⚠️ Fehler beim Supabase-Mailversand:", mErr);
            }
        }

        // 3. In Supabase Master schreiben (invoices, invoice_positions & mail_logs)
        await saveInventarInvoiceToSupabase({
            invoiceId: invoiceId,
            personNumber: m.PersonNumber || mglMaster.PersonNumber || m.ID || '',
            recipientName: invoiceHeader.name,
            type: 'Depot / Pfand',
            totalAmount: totalAmount,
            positions: positions,
            memberEmail: memberEmail,
            pdfUrl: pdfUrl,
            pdfStoragePath: pdfStoragePath,
            mailResult: mailResult
        });
    } catch (err) {
        console.error("Fehler in verarbeitePfandRechnungen:", err);
    }
}

// =========================================================
//  INVENTAR-RECHNUNG & MAIL-LOG IN SUPABASE SICHERN
// =========================================================
async function saveInventarInvoiceToSupabase({
    invoiceId,
    personNumber,
    recipientName,
    type,
    totalAmount,
    positions,
    memberEmail,
    pdfUrl,
    pdfStoragePath,
    mailResult
}) {
    const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
    if (!supa) return;

    try {
        const isSent = !!(memberEmail && memberEmail.includes('@') && mailResult?.success !== false);
        const nowIso = new Date().toISOString();

        // 1. Invoices Header
        const sbInvoice = {
            id: invoiceId,
            person_number: personNumber ? String(personNumber).trim() : null,
            recipient_name: recipientName || 'Mitglied',
            year: new Date().getFullYear(),
            type: type || 'Materialverkauf',
            status: 'offen',
            total_amount: Number(totalAmount || 0),
            mail_status: isSent ? 'gesendet' : 'entwurf',
            send_date: isSent ? nowIso : null,
            pdf_url: pdfUrl || mailResult?.pdfUrl || null,
            pdf_storage_path: pdfStoragePath || mailResult?.storagePath || null,
            created_at: nowIso,
            updated_at: nowIso
        };
        const { error: invErr } = await supa.from('invoices').upsert(sbInvoice);
        if (invErr) console.warn("⚠️ [Inventar->Supabase] Fehler beim Speichern der Rechnung:", invErr);

        // 2. Invoice Positions
        if (positions && positions.length > 0) {
            const sbPositions = positions.map(p => ({
                invoice_id: invoiceId,
                position_nr: p.position_nr,
                description: p.description,
                quantity: p.quantity,
                unit_price: p.unit_price,
                amount: p.amount,
                konto: String(p.konto || '8501').trim()
            }));
            await supa.from('invoice_positions').delete().eq('invoice_id', invoiceId);
            const { error: posErr } = await supa.from('invoice_positions').insert(sbPositions);
            if (posErr) console.warn("⚠️ [Inventar->Supabase] Fehler beim Speichern der Positionen:", posErr);
        }

        // 3. Mail Log (Versandprotokoll) - nur falls nicht schon durch sendMailViaEngine geloggt
        if (isSent && !mailResult?.logId) {
            const { error: mailErr } = await supa.from('mail_logs').insert([{
                module_ref: 'rechnung',
                record_id: invoiceId,
                recipient_email: memberEmail,
                recipient_name: recipientName,
                subject: `Rechnung ${invoiceId} – ${type} | Sportschützen Muhen`,
                body_snippet: `Guten Tag ${recipientName},\n\nvielen Dank für deinen Bezug aus unserem Vereinsinventar. Anbei senden wir dir die Rechnung ${invoiceId} über CHF ${Number(totalAmount).toFixed(2)} inkl. QR-Einzahlungsschein.`,
                status: 'gesendet',
                sender_email: 'sportschuetzen.muhen@gmail.com',
                sender_name: 'Sportschützen Muhen',
                attachment_name: `Rechnung_${invoiceId}_${(recipientName || 'Rechnung').replace(/\s+/g, '_')}.pdf`,
                has_pdf: !!pdfUrl,
                sent_via: 'Supabase_SMTP',
                created_by: 'Inventar',
                sent_at: nowIso
            }]);
            if (mailErr) console.warn("⚠️ [Inventar->Supabase] Fehler beim Eintrag in mail_logs:", mailErr);
        }

        // 4. In-Memory Cache des Rechnungsmoduls invalidieren & im Hintergrund frisch laden
        window._invoices = null;
        window._jbAllInvoices = null;
        if (typeof window.loadRechnungenData === 'function') {
            window.loadRechnungenData(true, true).catch(e => console.warn("Rechnungen Refresh:", e));
        }

        console.log(`✅ [Inventar->Supabase] Rechnung ${invoiceId} und Mail-Log erfolgreich in Supabase synchronisiert.`);
    } catch (e) {
        console.error("❌ [Inventar->Supabase] Ausnahme bei Rechnungs-Speicherung:", e);
    }
}



