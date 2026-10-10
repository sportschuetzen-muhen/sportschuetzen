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

        if (action === 'verkauf' && pfand <= 0) {
            alert("⚠️ Für einen Verkauf muss ein gültiger Verkaufspreis grösser als CHF 0.00 eingegeben werden.");
            const pInput = document.getElementById('pfand-betrag');
            if (pInput) { pInput.focus(); pInput.classList.add('is-invalid'); }
            return;
        }

        if (action === 'checkout') {
            if (pfandEin === 'Einzahlungsschein' && pfand <= 0) {
                alert("⚠️ Für eine Pfandrechnung (Einzahlungsschein) muss ein Pfandbetrag grösser als CHF 0.00 eingegeben werden.");
                const pInput = document.getElementById('pfand-betrag');
                if (pInput) { pInput.focus(); pInput.classList.add('is-invalid'); }
                return;
            }
            if ((pfandEin === 'Bar' || pfandEin === 'Twint') && pfand <= 0) {
                alert(`⚠️ Für die Pfandeinnahme (${pfandEin}) muss ein Pfandbetrag grösser als CHF 0.00 eingegeben werden (oder 'Nein' wählen).`);
                const pInput = document.getElementById('pfand-betrag');
                if (pInput) { pInput.focus(); pInput.classList.add('is-invalid'); }
                return;
            }
        }
        const pInput = document.getElementById('pfand-betrag');
        if (pInput) pInput.classList.remove('is-invalid');

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
        Verantwortliche_ID:    (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
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
                responsible_person: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
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
                user_name: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
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
        let invoiceFeedback = '';
        if (action === 'verkauf') {
            const invRes = await verarbeiteVerkaufNachbereitung(warenkorb, mitgliedId);
            if (invRes && invRes.invoiceId) {
                invoiceFeedback = `Rechnung <strong>${invRes.invoiceId}</strong> (CHF ${Number(invRes.totalAmount).toFixed(2)}) wurde ins <strong>Modul Rechnungen</strong> übertragen (bereit für Massenversand).`;
            }
        } else if (action === 'checkout') {
            const invRes = await verarbeitePfandRechnungen(warenkorb, mitgliedId);
            if (invRes && invRes.invoiceId) {
                invoiceFeedback = `Depot-Rechnung <strong>${invRes.invoiceId}</strong> (CHF ${Number(invRes.totalAmount).toFixed(2)}) wurde ins <strong>Modul Rechnungen</strong> übertragen (bereit für Massenversand).`;
            }
            await verarbeitePfandBuchhaltung(warenkorb, 'checkout');
        } else if (action === 'checkin') {
            await verarbeitePfandBuchhaltung(warenkorb, 'checkin');
        }

        const bookedCount = warenkorb.length || 1;
        warenkorb = [];
        renderWarenkorb();
        document.getElementById('form-ausgabe').reset();
        sigPadMitglied?.clear();
        sigPadVorstand?.clear();

        const alertText = invoiceFeedback 
            ? `${bookedCount} Position(en) erfolgreich erfasst. ${invoiceFeedback}`
            : `${bookedCount} Position(en) erfolgreich erfasst (Supabase Master).`;

        showJournalConfirmationAlert(alertText);
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
//  INVENTAR-VORLAGEN & MAIL-VARIABLEN HELPER
// =========================================================
async function getInventarInvoiceTemplate(typeKey) {
    if (!window._invoiceLayouts || Object.keys(window._invoiceLayouts).length === 0) {
        if (typeof window.loadInvoiceLayoutsData === 'function') {
            try {
                await window.loadInvoiceLayoutsData();
            } catch (_) {}
        }
    }
    if (window._invoiceLayouts) {
        if (window._invoiceLayouts[typeKey]) return window._invoiceLayouts[typeKey];
        if (typeKey === 'Depot / Pfand' && window._invoiceLayouts['depot_pfand']) return window._invoiceLayouts['depot_pfand'];
        if (typeKey === 'Materialverkauf' && window._invoiceLayouts['materialverkauf']) return window._invoiceLayouts['materialverkauf'];
    }

    const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
    if (supa) {
        try {
            const cleanCode = (typeKey.toLowerCase().includes('depot') || typeKey.toLowerCase().includes('pfand')) ? 'depot_pfand' : 'materialverkauf';
            const { data } = await supa.from('document_templates').select('*').or(`code.eq.${cleanCode},id.eq.${cleanCode}`).maybeSingle();
            if (data) return data;
        } catch (_) {}
    }
    return null;
}

function replaceInventarMailVars(text, vars) {
    if (!text) return '';
    return String(text)
        .replace(/{vorname}/g, vars.vorname || '')
        .replace(/{nachname}/g, vars.nachname || '')
        .replace(/{anrede}/g, vars.anrede || '')
        .replace(/{rechnungsnummer}/g, vars.rechnungsnummer || '')
        .replace(/{rechnungsjahr}/g, String(vars.rechnungsjahr || new Date().getFullYear()))
        .replace(/{gesamtbetrag}/g, Number(vars.gesamtbetrag || 0).toFixed(2))
        .replace(/{absender_vorname}/g, vars.absender_vorname || '')
        .replace(/{absender_nachname}/g, vars.absender_nachname || '')
        .replace(/{absender_funktion}/g, vars.absender_funktion || 'Materialwart')
        .replace(/{absender_email}/g, vars.absender_email || 'sportschuetzen.muhen@gmail.com')
        .replace(/{absender_mobil}/g, vars.absender_mobil || '');
}

// =========================================================
//  VERKAUF NACHBEREITUNG (Rechnung via RechnungsCore / Buchhaltung)
// =========================================================
async function verarbeiteVerkaufNachbereitung(verkaufWarenkorb, mitgliedId) {
    try {
        const invoiceItems = verkaufWarenkorb.filter(w => w.verkaufMethode === 'Einzahlungsschein');
        const barItems = verkaufWarenkorb.filter(w => w.verkaufMethode === 'Bar');

        // 1. RECHNUNGEN ÜBER ZENTRALEN RECHNUNGSCORE GENERIEREN
        if (invoiceItems.length > 0) {
            const m = (inventarState.mitglieder || []).find(x => String(x.ID) === String(mitgliedId)) || {};
            const mglMaster = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.PersonNumber || m.ID) || String(x.ID) === String(mitgliedId)) || {};

            const memberEmail = (m.email || m.Email || mglMaster.PrimaryEmail || mglMaster.email || '').trim();
            const memberSalutation = m.Salutation || mglMaster.Salutation || m.salutation || '';
            const memberStrasse = m.Strasse || mglMaster.Street || mglMaster.street || '';
            const memberPlz = m.PLZ || mglMaster.PostCode || mglMaster.post_code || '';
            const memberOrt = m.Ort || mglMaster.City || mglMaster.city || '';
            const recipientName = `${m.Nachname || mglMaster.LastName || ''} ${m.Vorname || mglMaster.FirstName || ''}`.trim() || 'Mitglied';

            const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
            const customKontoHaben = rawKonto.split('|')[0].trim() || '3200';

            // Einheitlicher Datenvertrag: InvoiceOrder
            const invoiceOrder = {
                source: {
                    module: 'inventar',
                    entityId: (invoiceItems[0] && invoiceItems[0].itemId) ? String(invoiceItems[0].itemId) : null,
                    referenceCode: `INV-VERKAUF-${new Date().getFullYear()}`
                },
                recipient: {
                    type: 'mitglied',
                    memberId: mitgliedId,
                    personNumber: m.PersonNumber || mglMaster.PersonNumber || m.ID || '',
                    anrede: memberSalutation,
                    salutation: memberSalutation,
                    name: recipientName,
                    firstName: m.Vorname || mglMaster.FirstName || '',
                    lastName: m.Nachname || mglMaster.LastName || '',
                    vorname: m.Vorname || mglMaster.FirstName || '',
                    nachname: m.Nachname || mglMaster.LastName || '',
                    street: memberStrasse,
                    strasse: memberStrasse,
                    zip: memberPlz,
                    plz: memberPlz,
                    city: memberOrt,
                    ort: memberOrt,
                    email: memberEmail
                },
                type: 'Materialverkauf',
                positions: (() => {
                    const orderPositions = [];
                    let posNr = 1;
                    invoiceItems.forEach(w => {
                        const invItem = (inventarState.kleidung || []).find(k => String(k.ID) === String(w.itemId)) || {};
                        const endBetrag = parseFloat(w.pfandBetrag) || 0;
                        const retailPrice = invItem.retail_price ? Math.ceil(parseFloat(invItem.retail_price)) : (invItem.Katalogpreis ? Math.ceil(parseFloat(invItem.Katalogpreis)) : null);
                        const sponsorDiscount = invItem.discount_amount ? Math.round(parseFloat(invItem.discount_amount)) : (invItem.Sponsoring ? Math.round(parseFloat(invItem.Sponsoring)) : null);

                        if (retailPrice && sponsorDiscount && (retailPrice - sponsorDiscount === Math.round(endBetrag))) {
                            // Variante A: Regulärer Katalogpreis + Sponsoring-Abzug C-Ma Trading GmbH
                            orderPositions.push({
                                positionNr: posNr++,
                                title: `${w.label}`,
                                quantity: 1,
                                unitPrice: retailPrice,
                                amount: retailPrice,
                                accountHaben: customKontoHaben,
                                sourceField: String(w.itemId)
                            });
                            orderPositions.push({
                                positionNr: posNr++,
                                title: `Sponsoringbeitrag C-Ma Trading GmbH`,
                                quantity: 1,
                                unitPrice: -sponsorDiscount,
                                amount: -sponsorDiscount,
                                accountHaben: customKontoHaben,
                                sourceField: String(w.itemId)
                            });
                        } else {
                            // Standardposition
                            orderPositions.push({
                                positionNr: posNr++,
                                title: `Kleiderverkauf: ${w.label}`,
                                quantity: 1,
                                unitPrice: endBetrag,
                                amount: endBetrag,
                                accountHaben: customKontoHaben,
                                sourceField: String(w.itemId)
                            });
                        }
                    });
                    return orderPositions;
                })(),
                notes: `Materialverkauf über Vereinsinventar (${invoiceItems.length} Positionen)`,
                sender: {
                    bereich: 'Materialverkauf',
                    funktion: 'Materialwart'
                },
                options: {
                    autoIssue: true // Status direkt auf 'offen'
                }
            };

            console.log("Erstelle Rechnung über zentralen RechnungsCore...", invoiceOrder);
            if (!window.RechnungsCore || typeof window.RechnungsCore.createInvoice !== 'function') {
                throw new Error("RechnungsCore ist nicht verfügbar. Bitte Seite neu laden.");
            }

            const coreRes = await window.RechnungsCore.createInvoice(invoiceOrder);
            const createdInv = coreRes.invoice;
            const invoiceId = createdInv.id;
            const totalAmount = createdInv.total_amount;
            const positions = createdInv.positions || [];

            // 1. Rechnungs-PDF via RechnungsCore.renderPdf (Richtlinie 6)
            if (window.RechnungsCore && typeof window.RechnungsCore.renderPdf === 'function') {
                try {
                    await window.RechnungsCore.renderPdf(invoiceId, { forceRecreate: true });
                } catch (pdfErr) {
                    console.warn("⚠️ [Inventar->RechnungsCore] PDF-Generierung fehlgeschlagen:", pdfErr);
                }
            }

            // 2. Rechnung ins Rechnungsmodul übertragen (Bereit für Prüfung & Massenversand, KEIN Direktversand)
            console.log(`✅ [Inventar->RechnungsCore] Rechnung ${invoiceId} über CHF ${totalAmount} angelegt. Verbleibt in 'mail_status: entwurf' für Massenversand.`);

            // In-Memory Rechnungs-Cache invalidieren & neu laden
            if (typeof window.loadRechnungenData === 'function') {
                window.loadRechnungenData(true, true).catch(e => console.warn("Rechnungen Refresh:", e));
            }

            return { success: true, invoiceId: invoiceId, totalAmount: totalAmount };
        }

        // 2. NUR BAR IN BUCHHALTUNG VERBUCHEN
        // (Twint wird NICHT sofort gebucht, da Twint erst Tage später als Netto-Sammelüberweisung auf der Bank eingeht)
        if (barItems.length > 0) {
            const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
            const customKontoHaben = rawKonto.split('|')[0].trim() || '3200';

            let seqCounter = 1;
            for (let w of barItems) {
                const uniqueBeleg = `VK-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${seqCounter++}`;

                const bhPayload = {
                    beleg_nr: uniqueBeleg,
                    beschreibung: `Materialverkauf (Bar): ${w.label}`,
                    konto_soll: '1000', // Kasse
                    konto_haben: customKontoHaben, // z.B. 3200 Ertrag Materialverkauf
                    betrag: parseFloat(w.pfandBetrag) || 0,
                    typ: 'Verkauf',
                    buchungstyp: 'KASSE',
                    jahr: new Date().getFullYear()
                };

                console.log("Buche Bar-Verkauf in Buchhaltung...", bhPayload);
                const sb = (typeof window.getBuchhaltungSupabaseClient === 'function') ? window.getBuchhaltungSupabaseClient() : (typeof window.getInventarSupabaseClient === 'function' ? window.getInventarSupabaseClient() : null);
                if (sb) {
                    sb.from('accounting_journal').insert([{
                        jahr: parseInt(bhPayload.jahr, 10),
                        datum: new Date().toISOString().slice(0, 10),
                        beleg_nr: bhPayload.beleg_nr,
                        beschreibung: bhPayload.beschreibung,
                        konto_soll: String(bhPayload.konto_soll).trim(),
                        konto_haben: String(bhPayload.konto_haben).trim(),
                        betrag: Number(bhPayload.betrag || 0),
                        typ: 'Verkauf',
                        buchungstyp: 'KASSE',
                        created_at: new Date().toISOString()
                    }]).then(({ error }) => {
                        if (error) console.warn('[Inventar -> FiBu] Supabase journal insert error:', error);
                        else console.log('✅ Materialverkauf in Supabase FiBu gebucht.');
                    }).catch(e => console.warn('[Inventar -> FiBu] Insert exception:', e));
                }
            }
        }
    } catch (err) {
        console.error("❌ Fehler in der Verkaufs-Nachbereitung:", err);
        throw new Error(`Fehler bei der Verkaufs-Rechnungserstellung: ${err.message}`);
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
                    beleg_nr: uniqueBeleg,
                    beschreibung: `Pfand Kasse (Eingang): ${w.label}`,
                    konto_soll: '1000', // Kasse
                    konto_haben: kautionsKonto, // z.B. 2030 Kautionen / Depots (Passivkonto)
                    betrag: betrag,
                    typ: 'Kaution',
                    buchungstyp: 'KASSE',
                    jahr: new Date().getFullYear()
                };
                console.log("Buche Bar-Pfand Eingang auf Kautionskonto 2030...", bhPayload);
                if (sb) {
                    sb.from('accounting_journal').insert([{
                        jahr: parseInt(bhPayload.jahr, 10),
                        datum: new Date().toISOString().slice(0, 10),
                        beleg_nr: bhPayload.beleg_nr,
                        beschreibung: bhPayload.beschreibung,
                        konto_soll: String(bhPayload.konto_soll).trim(),
                        konto_haben: String(bhPayload.konto_haben).trim(),
                        betrag: betrag,
                        typ: 'Kaution',
                        buchungstyp: 'KASSE',
                        created_at: new Date().toISOString()
                    }]).then(({ error }) => {
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
                    beleg_nr: uniqueBeleg,
                    beschreibung: `Pfand Rückzahlung (Bar): ${w.label}`,
                    konto_soll: '2030', // Kautionen / Depots (Passivkonto)
                    konto_haben: '1000', // Kasse
                    betrag: betrag,
                    typ: 'Kaution',
                    buchungstyp: 'KASSE',
                    jahr: new Date().getFullYear()
                };
                console.log("Buche Bar-Pfand Rückzahlung von Kautionskonto 2030...", bhPayload);
                if (sb) {
                    sb.from('accounting_journal').insert([{
                        jahr: parseInt(bhPayload.jahr, 10),
                        datum: new Date().toISOString().slice(0, 10),
                        beleg_nr: bhPayload.beleg_nr,
                        beschreibung: bhPayload.beschreibung,
                        konto_soll: String(bhPayload.konto_soll).trim(),
                        konto_haben: String(bhPayload.konto_haben).trim(),
                        betrag: betrag,
                        typ: 'Kaution',
                        buchungstyp: 'KASSE',
                        created_at: new Date().toISOString()
                    }]).then(({ error }) => {
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
//  PFAND / DEPOT RECHNUNG GENERIEREN (via zentralem RechnungsCore)
// =========================================================
async function verarbeitePfandRechnungen(cart, mitgliedId) {
    try {
        const invoicePfandItems = cart.filter(w => w.pfandMethode === 'Einzahlungsschein' && (parseFloat(w.pfandBetrag) || 0) > 0);
        if (invoicePfandItems.length === 0) return;

        const m = (inventarState.mitglieder || []).find(x => String(x.ID) === String(mitgliedId)) || {};
        const mglMaster = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.PersonNumber || m.ID) || String(x.ID) === String(mitgliedId)) || {};

        const memberEmail = (m.email || m.Email || mglMaster.PrimaryEmail || mglMaster.email || '').trim();
        const memberSalutation = m.Salutation || mglMaster.Salutation || m.salutation || '';
        const memberStrasse = m.Strasse || mglMaster.Street || mglMaster.street || '';
        const memberPlz = m.PLZ || mglMaster.PostCode || mglMaster.post_code || '';
        const memberOrt = m.Ort || mglMaster.City || mglMaster.city || '';
        const recipientName = `${m.Nachname || mglMaster.LastName || ''} ${m.Vorname || mglMaster.FirstName || ''}`.trim() || 'Mitglied';

        const rawKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
        const kautionsKonto = rawKonto.split('|')[0].trim() || '2030';

        // Typisiertes InvoiceOrder Payload
        const invoiceOrder = {
            source: {
                module: 'inventar',
                entityId: (invoicePfandItems[0] && invoicePfandItems[0].itemId) ? String(invoicePfandItems[0].itemId) : null,
                referenceCode: `DEP-${new Date().getFullYear()}`
            },
            prefix: 'DP',
            recipient: {
                type: 'mitglied',
                memberId: mitgliedId,
                personNumber: m.PersonNumber || mglMaster.PersonNumber || m.ID || '',
                anrede: memberSalutation,
                salutation: memberSalutation,
                name: recipientName,
                firstName: m.Vorname || mglMaster.FirstName || '',
                lastName: m.Nachname || mglMaster.LastName || '',
                vorname: m.Vorname || mglMaster.FirstName || '',
                nachname: m.Nachname || mglMaster.LastName || '',
                street: memberStrasse,
                strasse: memberStrasse,
                zip: memberPlz,
                plz: memberPlz,
                city: memberOrt,
                ort: memberOrt,
                email: memberEmail
            },
            type: 'Depot / Pfand',
            positions: invoicePfandItems.map((w, index) => {
                const betrag = parseFloat(w.pfandBetrag) || 0;
                return {
                    positionNr: index + 1,
                    title: `Depot / Kaution: ${w.label} (wird bei Rückgabe erstattet)`,
                    quantity: 1,
                    unitPrice: betrag,
                    amount: betrag,
                    accountHaben: kautionsKonto,
                    sourceField: String(w.itemId)
                };
            }),
            notes: `Depot/Pfand für Vereinsinventar (${invoicePfandItems.length} Positionen)`,
            sender: {
                bereich: 'Depot & Kautionen',
                funktion: 'Materialwart'
            },
            options: {
                autoIssue: true
            }
        };

        console.log("Erstelle QR-Rechnung für Pfand/Depot via RechnungsCore...", invoiceOrder);
        if (!window.RechnungsCore || typeof window.RechnungsCore.createInvoice !== 'function') {
            throw new Error("RechnungsCore ist nicht verfügbar. Bitte Seite neu laden.");
        }

        const coreRes = await window.RechnungsCore.createInvoice(invoiceOrder);
        const createdInv = coreRes.invoice;
        const invoiceId = createdInv.id;
        const totalAmount = createdInv.total_amount;
        const positions = createdInv.positions || [];

        // 1. Rechnungs-PDF via RechnungsCore.renderPdf (Richtlinie 6)
        if (window.RechnungsCore && typeof window.RechnungsCore.renderPdf === 'function') {
            try {
                await window.RechnungsCore.renderPdf(invoiceId, { forceRecreate: true });
            } catch (pdfErr) {
                console.warn("⚠️ [Inventar->RechnungsCore] PDF-Generierung fehlgeschlagen:", pdfErr);
            }
        }

        // 2. Rechnung ins Rechnungsmodul übertragen (Bereit für Prüfung & Massenversand, KEIN Direktversand)
        console.log(`✅ [Inventar->RechnungsCore] Kaution/Depot Rechnung ${invoiceId} über CHF ${totalAmount} angelegt. Verbleibt in 'mail_status: entwurf' für Massenversand.`);

        // In-Memory Rechnungs-Cache invalidieren & neu laden
        if (typeof window.loadRechnungenData === 'function') {
            window.loadRechnungenData(true, true).catch(e => console.warn("Rechnungen Refresh:", e));
        }

        return { success: true, invoiceId: invoiceId, totalAmount: totalAmount };
    } catch (err) {
        console.error("❌ Fehler in verarbeitePfandRechnungen:", err);
        throw new Error(`Fehler bei der Pfand-Rechnungserstellung: ${err.message}`);
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



