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

    try {
        const res = await apiFetch('inventar', '', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const result = await res.json();

        console.log("Backend PDF URL:", result.pdfUrl);

        // PDF nur lokal generieren wenn Backend keins hat
        if (!result.pdfUrl) {
            await generateQuittungPDF(
                payload,
                result.transactionId || result.transactionIds?.[0],
                result.sigMitgliedUrl || "",
                result.sigVorstandUrl || "",
                action === 'verkauf'
            );
        }

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

        showJournalConfirmationAlert(`${result.transactionIds ? result.transactionIds.length : 1} Position(en) erfolgreich erfasst und Beleg im Google Drive gesichert. Bitte überprüfe die Buchung kurz unten in der Liste.`);
        localStorage.setItem('inventar-activeTab', 'journal');
        showInventarSection('journal');
        
        // Journal direkt mit neuen Daten vom Server aktualisieren
        loadInventarData(true);
        
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
            const nextRand = String(Math.floor(1000 + Math.random() * 9000));
            const invoiceId = `INV-${new Date().getFullYear()}-${nextRand}`;
            const m = (inventarState.mitglieder || []).find(x => String(x.ID) === String(mitgliedId)) || {};
            const mglMaster = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.PersonNumber || m.ID) || String(x.ID) === String(mitgliedId)) || {};

            const memberEmail = (m.email || m.Email || mglMaster.PrimaryEmail || mglMaster.email || '').trim();
            const memberStrasse = mglMaster.Street || m.Strasse || '';
            const memberPlz = mglMaster.PostCode || m.PLZ || '';
            const memberOrt = mglMaster.City || m.Ort || '';
            
            let totalAmount = 0;
            const positions = invoiceItems.map((w, index) => {
                totalAmount += w.pfandBetrag;
                return {
                    position_nr: index + 1,
                    description: `Kleiderverkauf: ${w.label}`,
                    quantity: 1,
                    unit_price: w.pfandBetrag,
                    amount: w.pfandBetrag
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

            console.log("Erstelle Rechnung für Einzahlungsschein...", payloadRechnung);
            const resRechnung = await apiFetch('rechnungen', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadRechnung) });
            const resultRechnung = await resRechnung.json();
            
            if (resultRechnung.success) {
                // Rechnung per Mail versenden (sofern gültige E-Mail-Adresse vorhanden)
                if (memberEmail && memberEmail.includes('@')) {
                    const mailPayload = {
                        action: 'sendInvoiceEmail',
                        invoiceId: invoiceId,
                        recipient: payloadRechnung.recipient
                    };
                    console.log("Sende Rechnung per E-Mail...", mailPayload);
                    await apiFetch('rechnungen', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mailPayload) });
                }
            } else {
                console.error("Fehler beim Erstellen der Rechnung:", resultRechnung.error);
                alert("⚠️ Die QR-Rechnung konnte nicht automatisch erstellt werden. Bitte manuell im Modul Rechnungen nachholen.");
            }
        }

        // 2. NUR BAR IN BUCHHALTUNG VERBUCHEN
        // (Twint wird NICHT sofort gebucht, da Twint erst Tage später als Netto-Sammelüberweisung auf der Bank eingeht)
        const barItems = verkaufWarenkorb.filter(w => w.verkaufMethode === 'Bar');
        if (barItems.length > 0) {
            const userKonto = document.getElementById('verkauf-konto') ? document.getElementById('verkauf-konto').value.trim() : '';
            const customKontoHaben = userKonto || '3200';

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
                const resBh = await apiFetch('buchhaltung', bhPayload, 'POST');
                const resultBh = await resBh.json();
                if (!resultBh.success) {
                    console.error("Fehler beim Buchen:", resultBh.error);
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
        if (action === 'checkout') {
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
                    konto_haben: '2030', // Kautionen / Depots (Passivkonto)
                    betrag: betrag,
                    typ: 'Kaution',
                    jahr: new Date().getFullYear()
                };
                console.log("Buche Bar-Pfand Eingang auf Kautionskonto 2030...", bhPayload);
                const resBh = await apiFetch('buchhaltung', bhPayload, 'POST');
                const resultBh = await resBh.json();
                if (!resultBh.success) console.error("Fehler beim Buchen des Pfands:", resultBh.error);
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
                const resBh = await apiFetch('buchhaltung', bhPayload, 'POST');
                const resultBh = await resBh.json();
                if (!resultBh.success) console.error("Fehler beim Buchen der Pfand-Rückgabe:", resultBh.error);
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

        const nextRand = String(Math.floor(1000 + Math.random() * 9000));
        const invoiceId = `DEP-${new Date().getFullYear()}-${nextRand}`;
        const m = (inventarState.mitglieder || []).find(x => String(x.ID) === String(mitgliedId)) || {};
        const mglMaster = (window._mglData || []).find(x => String(x.PersonNumber) === String(m.PersonNumber || m.ID) || String(x.ID) === String(mitgliedId)) || {};

        const memberEmail = (m.email || m.Email || mglMaster.PrimaryEmail || mglMaster.email || '').trim();
        const memberStrasse = mglMaster.Street || m.Strasse || '';
        const memberPlz = mglMaster.PostCode || m.PLZ || '';
        const memberOrt = mglMaster.City || m.Ort || '';

        let totalAmount = 0;
        const positions = invoicePfandItems.map((w, index) => {
            const betrag = parseFloat(w.pfandBetrag) || 0;
            totalAmount += betrag;
            return {
                position_nr: index + 1,
                description: `Depot / Kaution: ${w.label} (wird bei Rückgabe erstattet)`,
                quantity: 1,
                unit_price: betrag,
                amount: betrag
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

        console.log("Erstelle QR-Rechnung für Pfand/Depot...", payloadRechnung);
        const resRechnung = await apiFetch('rechnungen', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadRechnung) });
        const resultRechnung = await resRechnung.json();

        if (resultRechnung.success) {
            if (memberEmail && memberEmail.includes('@')) {
                const mailPayload = {
                    action: 'sendInvoiceEmail',
                    invoiceId: invoiceId,
                    recipient: payloadRechnung.recipient
                };
                console.log("Sende Pfand-Rechnung per E-Mail...", mailPayload);
                await apiFetch('rechnungen', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mailPayload) });
            }
        } else {
            console.error("Fehler beim Erstellen der Pfand-Rechnung:", resultRechnung.error);
            alert("⚠️ Die QR-Rechnung für das Depot konnte nicht automatisch erstellt werden. Bitte manuell im Modul Rechnungen nachholen.");
        }
    } catch (err) {
        console.error("Fehler in verarbeitePfandRechnungen:", err);
    }
}


