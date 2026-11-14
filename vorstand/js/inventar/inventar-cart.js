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

        if (!mitgliedId) { invAlert('Eingabe fehlt', 'Bitte wähle zuerst ein Mitglied aus.', 'warning'); return; }
        if (!itemId)     { invAlert('Eingabe fehlt', 'Bitte wähle einen Gegenstand aus.', 'warning'); return; }

        if (warenkorb.find(w => w.itemId === itemId && w.kategorie === kategorie)) {
            invAlert('Bereits im Warenkorb', 'Dieser Gegenstand ist bereits in deinem Warenkorb.', 'info');
            return;
        }

        if (action === 'verkauf' && (kategorie === 'gewehr' || kategorie === 'schluessel')) {
            invAlert('Verkauf nicht möglich', 'Vereinsgewehre und Schlüssel können nicht direkt verkauft werden. Bitte wähle «Ausgabe (Ausleihe)» oder eine verkäufliche Kategorie.', 'warning');
            return;
        }

        const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                         "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
        const item   = (inventarState[keyMap[kategorie]] || [])
            .find(i => i.ID.toString() === itemId.toString());
        const label  = item ? getItemLabel(kategorie, item) : itemId;

        const isOut = item && item.Aktueller_Besitzer_ID &&
                      item.Aktueller_Besitzer_ID.toString() !== "0" &&
                      item.Aktueller_Besitzer_ID.toString() !== "";
        const isVerkauft = item && (item.Status || '').toLowerCase() === 'verkauft';

        if (action === 'checkin') {
            if (!item || String(item.Aktueller_Besitzer_ID || '') !== String(mitgliedId)) {
                invAlert('Ungültige Rückgabe', 'Dieser Gegenstand ist nicht bei diesem Mitglied ausgeliehen.', 'warning'); return;
            }
            if (pfandRet !== 'Nein') {
                if (pfand <= 0) {
                    invAlert('Betrag fehlt', 'Für eine Pfand-Rückzahlung musst du einen Betrag grösser als CHF 0.00 eingeben (oder «Nein (nicht ausbezahlt)» wählen).', 'warning');
                    const pInput = document.getElementById('pfand-betrag');
                    if (pInput) { pInput.focus(); pInput.classList.add('is-invalid'); }
                    return;
                }
                const openPfand = (inventarState?.pfand || []).find(p =>
                    String(p.Mitglied_ID) === String(mitgliedId) &&
                    String(p.Inventar_ID) === String(itemId) &&
                    (p.Status || '').toLowerCase() === 'offen'
                );
                if (!openPfand) {
                    invAlert('Kein offenes Depot', 'Für diesen Artikel ist bei diesem Mitglied kein offenes Pfand/Depot hinterlegt. Bitte wähle bei Pfand retour «Nein».', 'warning');
                    return;
                }
                if (openPfand.invoice_id && String(openPfand.Invoice_Status || '').toLowerCase() !== 'bezahlt') {
                    invAlert('Depot-Rechnung unbezahlt', `Die zugehörige Depot-Rechnung (${invEscapeHtml(openPfand.invoice_id)}) ist noch nicht bezahlt. Es darf keine Rückerstattung erfolgen.`, 'warning');
                    return;
                }
            }
        } else if (action === 'checkout' || action === 'verkauf') {
            if (isOut || isVerkauft) {
                invAlert('Nicht verfügbar', 'Dieser Gegenstand ist bereits ausgegeben oder verkauft und nicht mehr im Bestand.', 'warning'); return;
            }
        }

        if (action === 'verkauf' && pfand <= 0) {
            invAlert('Verkaufspreis fehlt', 'Für einen Verkauf musst du einen gültigen Verkaufspreis grösser als CHF 0.00 eingeben.', 'warning');
            const pInput = document.getElementById('pfand-betrag');
            if (pInput) { pInput.focus(); pInput.classList.add('is-invalid'); }
            return;
        }

        if (action === 'checkout') {
            if (pfandEin === 'Einzahlungsschein' && pfand <= 0) {
                invAlert('Pfandbetrag fehlt', 'Für eine Pfandrechnung (Einzahlungsschein) musst du einen Pfandbetrag grösser als CHF 0.00 eingeben.', 'warning');
                const pInput = document.getElementById('pfand-betrag');
                if (pInput) { pInput.focus(); pInput.classList.add('is-invalid'); }
                return;
            }
            if ((pfandEin === 'Bar' || pfandEin === 'Twint') && pfand <= 0) {
                invAlert('Pfandbetrag fehlt', `Für die Pfandeinnahme (${invEscapeHtml(pfandEin)}) musst du einen Pfandbetrag grösser als CHF 0.00 eingeben (oder «Nein» wählen).`, 'warning');
                const pInput = document.getElementById('pfand-betrag');
                if (pInput) { pInput.focus(); pInput.classList.add('is-invalid'); }
                return;
            }
        }
        const pInput = document.getElementById('pfand-betrag');
        if (pInput) pInput.classList.remove('is-invalid');

        const verkaufMethode = document.getElementById('verkauf-methode') ? document.getElementById('verkauf-methode').value : null;
        const pfandMethode = action === 'checkout' ? (pfandEin === 'Nein' ? '-' : pfandEin) : (action === 'checkin' ? pfandRet : null);

        let itemSponsor = 0;
        let itemSponsorCompany = '';
        if (action === 'verkauf' && item) {
            const rawSponsor = item.Sponsoring !== undefined && item.Sponsoring !== null && item.Sponsoring !== '' ? item.Sponsoring : item.discount_amount;
            if (rawSponsor) itemSponsor = Math.round(parseFloat(rawSponsor)) || 0;
            itemSponsorCompany = item.Sponsor_Firma || item.sponsor_company || '';
        }

        warenkorb.push({ itemId, kategorie, label,
                         zustandAbgabe: zustandA, zustandRueckgabe: zustandR,
                         pfandBetrag: pfand, pfandEinnahme: pfandEin === 'Nein' ? 'Nein' : 'Ja',
                         pfandMethode: pfandMethode,
                         pfandRetour: pfandRet === 'Nein' ? 'Nein' : 'Ja',
                         pfandRetourMethode: pfandRet,
                         sponsorDiscount: itemSponsor,
                         sponsorCompany: itemSponsorCompany,
                         verkaufMethode: (action === 'verkauf' ? verkaufMethode : null) });
        renderWarenkorb();
        document.getElementById('pfand-betrag').value = '';
        updateSubOptions();
    } catch(err) {
        console.error("Fehler in warenkorbAdd:", err);
        invAlert('Fehler beim Hinzufügen', invEscapeHtml(err.message), 'danger');
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
        <div class="table-responsive w-100 mb-1" style="overflow-x: auto;">
            <table class="table table-sm table-bordered mb-0 align-middle">
                <thead><tr class="table-light">
                    <th style="width: 55px;">Kat.</th>
                    <th>Gegenstand</th>
                    <th style="width: 60px;">Zustand</th>
                    <th>${action === 'verkauf' ? 'Preis' : 'Pfand'}</th>
                    <th style="width: 36px; text-align: center;"></th>
                </tr></thead>
                <tbody>
                    ${warenkorb.map((w, i) => {
                        let methodeInfo = '';
                        if (w.pfandBetrag > 0) {
                            if (action === 'verkauf') methodeInfo = ` (${w.verkaufMethode || 'Bar'})`;
                            else if (action === 'checkout') methodeInfo = ` (${w.pfandMethode || 'Bar'})`;
                            else if (action === 'checkin') methodeInfo = ` (${w.pfandRetourMethode || 'Bar retour'})`;
                        }
                        const sponsorCompanyText = w.sponsorCompany ? ` ${invEscapeHtml(w.sponsorCompany)}` : '';
                        const sponsorBadge = (action === 'verkauf' && w.sponsorDiscount > 0) 
                            ? `<br><span class="badge bg-danger-subtle text-danger border border-danger-subtle text-wrap text-start mt-1" style="font-size: 10px; line-height: 1.25; display: inline-block; max-width: 190px;">abzgl. CHF ${w.sponsorDiscount} Sponsoring${sponsorCompanyText}</span>` 
                            : '';
                        return `
                        <tr>
                            <td style="white-space: nowrap;"><span class="badge bg-secondary">${invEscapeHtml(w.kategorie)}</span></td>
                            <td><small class="fw-semibold">${invEscapeHtml(w.label)}</small></td>
                            <td><small>${invEscapeHtml(action==='checkout' || action==='verkauf' ? w.zustandAbgabe : w.zustandRueckgabe)}</small></td>
                            <td><small class="fw-bold">${w.pfandBetrag>0 ? `CHF ${w.pfandBetrag.toFixed(2)}${invEscapeHtml(methodeInfo)}${sponsorBadge}` : '-'}</small></td>
                            <td style="width: 36px; text-align: center;">
                                <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1" title="Position entfernen"
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
        </div>
        <small class="text-muted">${warenkorb.length} Position(en)</small>`;
}

// =========================================================
//  SUBMIT – Buchung anstoßen
// =========================================================
async function handleInventarSubmit(e) {
    e.preventDefault();
    if (window._isInventarSubmitting) return;
    if (warenkorb.length === 0) {
        await invAlert('Warenkorb leer', 'Dein Warenkorb ist noch leer. Bitte füge zuerst mindestens einen Gegenstand hinzu.', 'warning');
        return;
    }

    const executeSubmit = async () => {
        if (window._isInventarSubmitting) return;
        window._isInventarSubmitting = true;
        setInventarBusy(true);

        const action     = document.getElementById('select-action').value;
        const mitgliedId = document.getElementById('select-mitglied').value;

        const cleanKonto = (action === 'verkauf')
            ? ((typeof window.getInventarDefaultHabenKonto === 'function') ? window.getInventarDefaultHabenKonto('verkauf') : '8121')
            : ((typeof window.getInventarDefaultHabenKonto === 'function') ? window.getInventarDefaultHabenKonto('depot') : '2030');

        if (action === 'verkauf' && !cleanKonto) {
            await invAlert('Konto fehlt', 'Es ist kein gültiges Ertragskonto für den Materialverkauf konfiguriert.', 'danger');
            window._isInventarSubmitting = false;
            setInventarBusy(false);
            return;
        }
        const hasPfandCheckout = action === 'checkout' && warenkorb.some(w => parseFloat(w.pfandBetrag) > 0);
        if (hasPfandCheckout && !cleanKonto) {
            await invAlert('Konto fehlt', 'Es ist kein gültiges Kautionskonto für das Depot konfiguriert (Standard: 2030).', 'danger');
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

        // --- SUPABASE FIRST BUCHUNG MIT ROLLBACK-SCHUTZ ---
        const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
        if (!supa) {
            await invAlert('Verbindungsfehler', 'Supabase Client ist nicht verfügbar. Buchung abgebrochen.', 'danger');
            window._isInventarSubmitting = false;
            setInventarBusy(false);
            return;
        }

        let result = { status: 'success', transactionIds: [], depositIds: [] };
        const createdTxIds = [];
        const createdDepositIds = [];
        const closedDepositIds = [];
        const previousItemStates = [];
        const keyMap = { "gewehr":"gewehre","schluessel":"schluessel","kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };

        try {
            const neuerStatus = action === 'checkin' ? "Im Lager" : (action === 'verkauf' ? "Verkauft" : "Ausgegeben");
            const neuerBesitzer = action === 'checkin' ? null : ((mitgliedId && parseInt(mitgliedId, 10) > 0) ? parseInt(mitgliedId, 10) : null);
            const bookingTime = new Date().toISOString();

            // Aktuellen Item-Status für allfälliges Rollback merken
            warenkorb.forEach(w => {
                const curItem = (inventarState?.[keyMap[w.kategorie]] || []).find(i => String(i.ID) === String(w.itemId));
                if (curItem) {
                    previousItemStates.push({
                        id: String(w.itemId).trim(),
                        status: curItem.Status || 'Im Lager',
                        current_owner_id: curItem.Aktueller_Besitzer_ID ? parseInt(curItem.Aktueller_Besitzer_ID, 10) : null
                    });
                }
            });

            // 1. Transaktionen in Supabase anlegen
            const txRecords = warenkorb.map(w => ({
                timestamp: bookingTime,
                action: payloadAction,
                member_id: (mitgliedId && parseInt(mitgliedId, 10) > 0) ? parseInt(mitgliedId, 10) : null,
                item_id: String(w.itemId).trim(),
                category: w.kategorie,
                condition_out: w.zustandAbgabe || null,
                condition_in: w.zustandRueckgabe || null,
                notes: bemerkungen || null,
                responsible_person: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
                deposit_amount: parseFloat(w.pfandBetrag) || 0,
                deposit_received: action === 'checkout' ? (w.pfandEinnahme || '-') : '-',
                deposit_returned: action === 'checkin' ? (w.pfandRetour || '-') : '-',
                payment_method: action === 'verkauf' ? (w.verkaufMethode || 'Bar') : (action === 'checkout' ? (w.pfandMethode || 'Bar') : (w.pfandRetour === 'Ja' ? (w.pfandRetourMethode || 'Bar') : 'Keine Rückzahlung')),
                sig_member_url: payload.sigMitglied || null,
                sig_board_url: payload.Sig_Vorstand || null
            }));

            const { data: createdTx, error: txErr } = await supa
                .from('inventory_transactions')
                .insert(txRecords)
                .select('id, item_id, category');

            if (txErr || !createdTx || createdTx.length === 0) {
                throw new Error(`Transaktion konnte nicht in Supabase gespeichert werden: ${txErr?.message || 'Unbekannter Fehler'}`);
            }

            result.transactionIds = createdTx.map(t => t.id);
            result.transactionId = createdTx[0]?.id;
            createdTxIds.push(...result.transactionIds);
            createdTx.forEach((row, idx) => {
                if (warenkorb[idx]) warenkorb[idx]._txId = row.id;
            });

            // 2. Artikelstatus & Besitzer aktualisieren
            for (const w of warenkorb) {
                const { error: itemErr } = await supa
                    .from('inventory_items')
                    .update({
                        status: neuerStatus,
                        current_owner_id: neuerBesitzer,
                        updated_at: bookingTime
                    })
                    .eq('id', String(w.itemId).trim());
                if (itemErr) {
                    throw new Error(`Artikel ${w.itemId} konnte nicht aktualisiert werden: ${itemErr.message}`);
                }
            }

            // 3. Pfand-Verwaltung in Supabase
            if (action === 'checkout') {
                for (const w of warenkorb) {
                    if (parseFloat(w.pfandBetrag) > 0) {
                        const pfandId = 'P-' + Math.floor(100000 + Math.random() * 900000);
                        result.depositIds.push(pfandId);
                        createdDepositIds.push(pfandId);
                        w._depositId = pfandId;
                        const { error: depInsErr } = await supa.from('inventory_deposits').insert([{
                            id: pfandId,
                            member_id: parseInt(mitgliedId, 10),
                            item_id: String(w.itemId).trim(),
                            category: w.kategorie,
                            amount: parseFloat(w.pfandBetrag) || 0,
                            date_out: bookingTime,
                            status: 'Offen',
                            payment_method: (w.pfandMethode && w.pfandMethode !== '-') ? w.pfandMethode : 'Bar'
                        }]);
                        if (depInsErr) {
                            throw new Error(`Pfand für ${w.itemId} konnte nicht gespeichert werden: ${depInsErr.message}`);
                        }
                    }
                }
            } else if (action === 'checkin') {
                for (const w of warenkorb) {
                    if (w.pfandRetour === 'Ja') {
                        const { data: openDeps, error: depFindErr } = await supa
                            .from('inventory_deposits')
                            .select('id')
                            .eq('member_id', parseInt(mitgliedId, 10))
                            .eq('item_id', String(w.itemId).trim())
                            .eq('status', 'Offen')
                            .order('date_out', { ascending: false })
                            .limit(1);
                        if (depFindErr) {
                            throw new Error(`Offenes Pfand für ${w.itemId} konnte nicht geprüft werden: ${depFindErr.message}`);
                        }
                        if (openDeps && openDeps.length > 0) {
                            const depId = openDeps[0].id;
                            const { error: depUpdErr } = await supa.from('inventory_deposits')
                                .update({
                                    status: 'Retour',
                                    date_returned: bookingTime,
                                    payment_method: w.pfandRetourMethode || 'Bar',
                                    updated_at: bookingTime
                                })
                                .eq('id', depId);
                            if (depUpdErr) {
                                throw new Error(`Pfand-Rückzahlung für ${w.itemId} konnte nicht gespeichert werden: ${depUpdErr.message}`);
                            }
                            closedDepositIds.push(depId);
                        }
                    }
                }
            }

            // 4. Nachbearbeitung (Rechnung / FiBu-Journal) vor UI-Reset, damit Rollback greifen kann
            let invoiceFeedback = '';
            if (action === 'verkauf') {
                const invRes = await verarbeiteVerkaufNachbereitung(warenkorb, mitgliedId, result.transactionIds);
                if (invRes && invRes.invoiceId) {
                    invoiceFeedback = `Rechnung <strong>${invEscapeHtml(invRes.invoiceId)}</strong> (${UIFormatKit.money(invRes.totalAmount)}) wurde ins <strong>Modul Rechnungen</strong> übertragen (bereit für Massenversand).`;
                }
            } else if (action === 'checkout') {
                const invRes = await verarbeitePfandRechnungen(warenkorb, mitgliedId, result.depositIds, result.transactionIds);
                if (invRes && invRes.invoiceId) {
                    invoiceFeedback = `Depot-Rechnung <strong>${invEscapeHtml(invRes.invoiceId)}</strong> (${UIFormatKit.money(invRes.totalAmount)}) wurde ins <strong>Modul Rechnungen</strong> übertragen (bereit für Massenversand).`;
                }
                await verarbeitePfandBuchhaltung(warenkorb, 'checkout');
            } else if (action === 'checkin') {
                await verarbeitePfandBuchhaltung(warenkorb, 'checkin');
            }

            // 5. Revisions-Auditlog
            const { error: auditErr } = await supa.from('inventory_audit_log').insert([{
                timestamp: bookingTime,
                user_name: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
                action: payloadAction,
                details: `${payloadAction} (${warenkorb.length} Pos.) für Mitglied ${mitgliedId}: ${warenkorb.map(w => w.label || w.itemId).join(', ')}`
            }]);
            if (auditErr) console.warn("⚠️ Audit-Log Eintrag fehlgeschlagen:", auditErr.message);

            console.log("✅ Buchung erfolgreich in Supabase gespeichert!");

            // 6. PDF lokal generieren (nach erfolgreicher DB- und FiBu-Buchung)
            await generateQuittungPDF(
                payload,
                result.transactionId || result.transactionIds?.[0] || '1',
                payload.sigMitglied || "",
                payload.Sig_Vorstand || "",
                action === 'verkauf'
            );

            const bookedCount = warenkorb.length || 1;
            warenkorb = [];
            renderWarenkorb();
            document.getElementById('form-ausgabe').reset();
            sigPadMitglied?.clear();
            sigPadVorstand?.clear();

            const alertText = invoiceFeedback
                ? `${bookedCount} Position(en) erfolgreich erfasst. ${invoiceFeedback}`
                : `${bookedCount} Position(en) erfolgreich erfasst.`;

            showJournalConfirmationAlert(alertText);
            localStorage.setItem('inventar-activeTab', 'journal');
            showInventarSection('journal');

            // Journal direkt mit neuen Daten vom Server aktualisieren
            await loadInventarData(true);

        } catch (err) {
            console.error("Buchungsfehler:", err);
            // Kompensierendes Rollback der bereits geschriebenen Inventar-Änderungen
            try {
                for (const prev of previousItemStates) {
                    await supa.from('inventory_items').update({
                        status: prev.status,
                        current_owner_id: prev.current_owner_id,
                        updated_at: new Date().toISOString()
                    }).eq('id', prev.id);
                }
                if (createdDepositIds.length > 0) {
                    await supa.from('inventory_deposits').delete().in('id', createdDepositIds);
                }
                if (closedDepositIds.length > 0) {
                    await supa.from('inventory_deposits').update({ status: 'Offen', date_returned: null, updated_at: new Date().toISOString() }).in('id', closedDepositIds);
                }
                if (createdTxIds.length > 0) {
                    await supa.from('inventory_transactions').delete().in('id', createdTxIds);
                }
                console.warn("↩️ Rollback nach Buchungsfehler erfolgreich durchgeführt.");
            } catch (rbErr) {
                console.error("⚠️ Rollback nach Buchungsfehler teilweise fehlgeschlagen:", rbErr);
            }
            await invAlert('Fehler bei der Buchung', `${invEscapeHtml(err.message)}<br><small class="text-muted">Bereits erfasste Bestandsänderungen wurden automatisch zurückgerollt.</small>`, 'danger');
        } finally {
            window._isInventarSubmitting = false;
            setInventarBusy(false);
        }
    };

    if (window.UIButtonKit && typeof window.UIButtonKit.withLoading === 'function') {
        await window.UIButtonKit.withLoading('#btn-warenkorb-submit', executeSubmit);
    } else {
        await executeSubmit();
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
async function verarbeiteVerkaufNachbereitung(verkaufWarenkorb, mitgliedId, txIds = []) {
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

            const customKontoHaben = (typeof window.getInventarDefaultHabenKonto === 'function')
                ? window.getInventarDefaultHabenKonto('verkauf')
                : (localStorage.getItem('inventar_preferred_haben_konto_verkauf') || '8121');

            const primaryTxId = (txIds && txIds[0]) ? String(txIds[0]) : null;

            // Einheitlicher Datenvertrag: InvoiceOrder
            const invoiceOrder = {
                source: {
                    module: 'inventar',
                    entityId: primaryTxId || ((invoiceItems[0] && invoiceItems[0].itemId) ? String(invoiceItems[0].itemId) : null),
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
                    const allInventoryItems = [
                        ...(inventarState?.kleidung || []),
                        ...(inventarState?.schiessbekleidung || []),
                        ...(inventarState?.gewehre || []),
                        ...(inventarState?.schluessel || [])
                    ];
                    invoiceItems.forEach(w => {
                        const invItem = allInventoryItems.find(k => String(k.ID) === String(w.itemId)) || {};
                        const endBetrag = parseFloat(w.pfandBetrag) || 0;
                        const retailPrice = (invItem.Katalogpreis !== '' && invItem.Katalogpreis !== null && invItem.Katalogpreis !== undefined)
                            ? Math.round(parseFloat(invItem.Katalogpreis))
                            : (invItem.retail_price ? Math.round(parseFloat(invItem.retail_price)) : null);
                        const sponsorDiscount = (invItem.Sponsoring !== '' && invItem.Sponsoring !== null && invItem.Sponsoring !== undefined)
                            ? Math.round(parseFloat(invItem.Sponsoring))
                            : (invItem.discount_amount ? Math.round(parseFloat(invItem.discount_amount)) : (w.sponsorDiscount || 0));

                        // Robuste Fallbacks: Wenn retailPrice fehlt, aus Kaufpreis oder endBetrag + Sponsoring ableiten:
                        const effectiveRetail = retailPrice 
                            || (invItem.Kaufpreis ? Math.round(parseFloat(invItem.Kaufpreis)) : null)
                            || (invItem.purchase_price ? Math.round(parseFloat(invItem.purchase_price)) : null)
                            || (sponsorDiscount > 0 ? Math.round(endBetrag + sponsorDiscount) : null);

                        if (sponsorDiscount > 0) {
                            // Bruttobetrag (Verkaufspreis gerundet) so ableiten, dass die Rechnung nach Abzug exakt endBetrag ergibt:
                            const calculatedRetail = (effectiveRetail && (effectiveRetail - sponsorDiscount === Math.round(endBetrag)))
                                ? effectiveRetail
                                : Math.round(endBetrag + sponsorDiscount);
                            const sponsorTitle = (invItem.Sponsor_Firma || invItem.sponsor_company || w.sponsorCompany || '').trim();
                            orderPositions.push({
                                positionNr: posNr++,
                                title: `${w.label} (Verkaufspreis gerundet)`,
                                quantity: 1,
                                unitPrice: calculatedRetail,
                                amount: calculatedRetail,
                                accountHaben: customKontoHaben,
                                sourceField: String(w.itemId)
                            });
                            orderPositions.push({
                                positionNr: posNr++,
                                title: sponsorTitle ? `Sponsoring Beitrag (${sponsorTitle})` : `Sponsoring Beitrag`,
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
                                title: `Materialverkauf: ${w.label}`,
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

            // 2. Rechnungs-ID in inventory_transactions hinterlegen (nur für Positionen mit Einzahlungsschein)
            const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
            const invoiceTxIds = invoiceItems.map(w => w._txId).filter(Boolean);
            const targetTxIds = invoiceTxIds.length > 0 ? invoiceTxIds : (txIds || []);
            if (supa && targetTxIds.length > 0) {
                try {
                    const { error: linkErr } = await supa.from('inventory_transactions')
                        .update({ invoice_id: invoiceId })
                        .in('id', targetTxIds);
                    if (linkErr) throw linkErr;
                    console.log(`✅ [Inventar->Supabase] invoice_id ${invoiceId} in ${targetTxIds.length} Transaktion(en) hinterlegt.`);
                } catch (txLinkErr) {
                    console.warn("⚠️ Fehler beim Hinterlegen von invoice_id in inventory_transactions:", txLinkErr);
                }
            }

            // 3. Rechnung ins Rechnungsmodul übertragen (Bereit für Prüfung & Massenversand, KEIN Direktversand)
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
            const customKontoHaben = (typeof window.getInventarDefaultHabenKonto === 'function')
                ? window.getInventarDefaultHabenKonto('verkauf')
                : (localStorage.getItem('inventar_preferred_haben_konto_verkauf') || '8121');

            const sb = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
            if (!sb) throw new Error("Supabase Client für FiBu-Buchung nicht verfügbar.");

            let seqCounter = 1;
            const todayIso = new Date().toISOString().slice(0, 10);
            const curYear = new Date().getFullYear();
            for (const w of barItems) {
                const betrag = parseFloat(w.pfandBetrag) || 0;
                if (betrag <= 0) continue;
                const uniqueBeleg = `VK-${curYear}-${Date.now().toString().slice(-4)}${seqCounter++}`;

                const { error: rpcErr } = await sb.rpc('inventar_book_accounting_journal', {
                    p_jahr: curYear,
                    p_datum: todayIso,
                    p_beleg_nr: uniqueBeleg,
                    p_beschreibung: `Materialverkauf (Bar): ${w.label}`,
                    p_konto_soll: '1000',
                    p_konto_haben: String(customKontoHaben).trim(),
                    p_betrag: betrag,
                    p_typ: 'Verkauf',
                    p_buchungstyp: 'KASSE'
                });
                if (rpcErr) {
                    throw new Error(`FiBu-Buchung fehlgeschlagen (${w.label}): ${rpcErr.message}`);
                }
                console.log('✅ Materialverkauf in Supabase FiBu gebucht:', uniqueBeleg);
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
    const sb = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
    const kautionsKonto = (typeof window.getInventarDefaultHabenKonto === 'function')
        ? window.getInventarDefaultHabenKonto('depot')
        : (localStorage.getItem('inventar_preferred_haben_konto_depot') || '2030');
    const todayIso = new Date().toISOString().slice(0, 10);
    const curYear = new Date().getFullYear();

    if (action === 'checkout') {
        // Bar-Pfand erhalten: Soll 1000 (Kasse) an Haben Kautionskonto (z. B. 2030)
        const barPfand = cart.filter(w => (w.pfandMethode === 'Bar' || w.pfandEinnahme === 'Ja') && w.pfandMethode !== 'Twint' && w.pfandMethode !== 'Einzahlungsschein' && (parseFloat(w.pfandBetrag) || 0) > 0);
        if (barPfand.length > 0 && !sb) throw new Error("Supabase Client für Pfand-FiBu-Buchung nicht verfügbar.");
        let seqCounter = 1;
        for (const w of barPfand) {
            const betrag = parseFloat(w.pfandBetrag) || 0;
            const uniqueBeleg = `DEP-IN-${curYear}-${Date.now().toString().slice(-4)}${seqCounter++}`;
            const { error: rpcErr } = await sb.rpc('inventar_book_accounting_journal', {
                p_jahr: curYear,
                p_datum: todayIso,
                p_beleg_nr: uniqueBeleg,
                p_beschreibung: `Pfand Kasse (Eingang): ${w.label}`,
                p_konto_soll: '1000',
                p_konto_haben: String(kautionsKonto).trim(),
                p_betrag: betrag,
                p_typ: 'Kaution',
                p_buchungstyp: 'KASSE'
            });
            if (rpcErr) {
                throw new Error(`Pfand-Eingang FiBu fehlgeschlagen (${w.label}): ${rpcErr.message}`);
            }
        }
    } else if (action === 'checkin') {
        // Bar-Pfand zurückbezahlt: Soll Kautionskonto (z. B. 2030) an Haben 1000 (Kasse)
        const barRetour = cart.filter(w => w.pfandRetour === 'Ja' && (w.pfandRetourMethode === 'Bar' || !w.pfandRetourMethode));
        if (barRetour.length > 0 && !sb) throw new Error("Supabase Client für Pfand-Rückzahlung nicht verfügbar.");
        let seqCounter = 1;
        for (const w of barRetour) {
            const openPfand = (inventarState?.pfand || []).find(p =>
                String(p.Inventar_ID) === String(w.itemId) && (p.Status || '').toLowerCase() === 'offen'
            );
            if (!openPfand) continue;
            if (openPfand.invoice_id && String(openPfand.Invoice_Status || '').toLowerCase() !== 'bezahlt') continue;

            let betrag = parseFloat(w.pfandBetrag) || parseFloat(openPfand.Betrag) || 0;
            if (betrag <= 0) continue;

            const uniqueBeleg = `DEP-OUT-${curYear}-${Date.now().toString().slice(-4)}${seqCounter++}`;
            const { error: rpcErr } = await sb.rpc('inventar_book_accounting_journal', {
                p_jahr: curYear,
                p_datum: todayIso,
                p_beleg_nr: uniqueBeleg,
                p_beschreibung: `Pfand Rückzahlung (Bar): ${w.label}`,
                p_konto_soll: String(kautionsKonto).trim(),
                p_konto_haben: '1000',
                p_betrag: betrag,
                p_typ: 'Kaution',
                p_buchungstyp: 'KASSE'
            });
            if (rpcErr) {
                throw new Error(`Pfand-Rückzahlung FiBu fehlgeschlagen (${w.label}): ${rpcErr.message}`);
            }
        }
    }
}

// =========================================================
//  PFAND / DEPOT RECHNUNG GENERIEREN (via zentralem RechnungsCore)
// =========================================================
async function verarbeitePfandRechnungen(cart, mitgliedId, depositIds = [], txIds = []) {
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

        const kautionsKonto = (typeof window.getInventarDefaultHabenKonto === 'function')
            ? window.getInventarDefaultHabenKonto('depot')
            : (localStorage.getItem('inventar_preferred_haben_konto_depot') || '2030');

        const primaryTxId = (txIds && txIds[0]) ? String(txIds[0]) : null;

        // Typisiertes InvoiceOrder Payload
        const invoiceOrder = {
            source: {
                module: 'inventar',
                entityId: primaryTxId || ((invoicePfandItems[0] && invoicePfandItems[0].itemId) ? String(invoicePfandItems[0].itemId) : null),
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

        // 2. Rechnungs-ID in inventory_transactions und inventory_deposits hinterlegen (nur für Positionen mit Einzahlungsschein)
        const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
        const invoiceTxIds = invoicePfandItems.map(w => w._txId).filter(Boolean);
        const targetTxIds = invoiceTxIds.length > 0 ? invoiceTxIds : (txIds || []);
        const invoiceDepositIds = invoicePfandItems.map(w => w._depositId).filter(Boolean);
        const targetDepositIds = invoiceDepositIds.length > 0 ? invoiceDepositIds : (depositIds || []);
        if (supa) {
            try {
                if (targetTxIds.length > 0) {
                    await supa.from('inventory_transactions')
                        .update({ invoice_id: invoiceId })
                        .in('id', targetTxIds);
                }
                if (targetDepositIds.length > 0) {
                    await supa.from('inventory_deposits')
                        .update({ invoice_id: invoiceId })
                        .in('id', targetDepositIds);
                }
                console.log(`✅ [Inventar->Supabase] invoice_id ${invoiceId} in Transaktion(en) & Deposit(s) hinterlegt.`);
            } catch (pfandLinkErr) {
                console.warn("⚠️ Fehler beim Hinterlegen von invoice_id in inventory_deposits/transactions:", pfandLinkErr);
            }
        }

        // 3. Rechnung ins Rechnungsmodul übertragen (Bereit für Prüfung & Massenversand, KEIN Direktversand)
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



