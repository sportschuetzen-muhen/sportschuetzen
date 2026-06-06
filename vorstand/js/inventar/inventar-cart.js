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

    if (action === 'checkin') {
        if (!item || item.Aktueller_Besitzer_ID.toString() !== mitgliedId.toString()) {
            alert("⚠️ Dieser Gegenstand ist nicht bei diesem Mitglied!"); return;
        }
    }

        const verkaufMethode = document.getElementById('verkauf-methode') ? document.getElementById('verkauf-methode').value : null;

        warenkorb.push({ itemId, kategorie, label,
                         zustandAbgabe: zustandA, zustandRueckgabe: zustandR,
                         pfandBetrag: pfand, pfandEinnahme: pfandEin, pfandRetour: pfandRet,
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
                ${warenkorb.map((w, i) => `
                    <tr>
                        <td><span class="badge bg-secondary">${w.kategorie}</span></td>
                        <td><small>${w.label}</small></td>
                        <td><small>${action==='checkout' || action==='verkauf' ? w.zustandAbgabe : w.zustandRueckgabe}</small></td>
                        <td><small>${w.pfandBetrag>0 ? `CHF ${w.pfandBetrag.toFixed(2)} ${action==='verkauf' ? '('+w.verkaufMethode+')' : ''}` : '-'}</small></td>
                        <td>
                            <button class="btn btn-sm btn-outline-danger py-0"
                                    onclick="warenkorbRemove(${i})">✕</button>
                        </td>
                    </tr>`).join('')}
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
    if (warenkorb.length === 0) { alert("Warenkorb ist leer."); return; }
    setInventarBusy(true);

    const action     = document.getElementById('select-action').value;
    const mitgliedId = document.getElementById('select-mitglied').value;

    const mailAdresse = localStorage.getItem('portal_mailadresse') || localStorage.getItem('portal_mailanzeige') || "";
    const emailToUse = mailAdresse.includes('@') ? mailAdresse : "sportschuetzen.muhen@gmail.com";

    const payloadAction = (action === 'checkout' || action === 'verkauf') ? 'AUSGABE' : 'CHECKIN';
    
    let bemerkungen = document.getElementById('trans-bemerkungen').value;
    if (action === 'verkauf') {
        const methods = [...new Set(warenkorb.map(w => w.verkaufMethode))].filter(Boolean);
        bemerkungen = `[VERKAUF - Zahlung: ${methods.join(', ')}] ` + bemerkungen;
    }

    const payload = {
        action:                action === 'verkauf' ? 'checkout' : action,
        Aktion:                payloadAction,
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
            label:            w.label
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

        // --- VERKAUF NACHBEARBEITUNG ---
        if (action === 'verkauf') {
            await verarbeiteVerkaufNachbereitung(warenkorb, mitgliedId);
        }

        warenkorb = [];
        renderWarenkorb();
        document.getElementById('form-ausgabe').reset();
        sigPadMitglied?.clear();
        sigPadVorstand?.clear();
        document.getElementById('sig-mitglied-container').style.display = 'block';

        showJournalConfirmationAlert(`${result.transactionIds ? result.transactionIds.length : 1} Position(en) erfolgreich erfasst und Beleg im Google Drive gesichert. Bitte überprüfe die Buchung kurz unten in der Liste.`);
        localStorage.setItem('inventar-activeTab', 'journal');
        showInventarSection('journal');
        
        // Journal direkt mit neuen Daten vom Server aktualisieren
        loadInventarData(true);
        
    } catch(err) {
        console.error("Buchungsfehler:", err);
        alert("❌ Fehler bei der Buchung: " + err.message);
    } finally {
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
                PersonNumber: m.ID || '',
                name: `${m.Nachname || ''} ${m.Vorname || ''}`.trim(),
                year: new Date().getFullYear(),
                type: 'Sonstige',
                total_amount: totalAmount,
                status: 'Offen'
            };

            const payloadRechnung = {
                action: 'createInvoice',
                invoice: invoiceHeader,
                positions: positions,
                recipient: {
                    vorname: m.Vorname || '',
                    nachname: m.Nachname || '',
                    strasse: m.Strasse || '',
                    plz: m.PLZ || '',
                    ort: m.Ort || '',
                    email: m.Email || ''
                }
            };

            console.log("Erstelle Rechnung für Einzahlungsschein...", payloadRechnung);
            const resRechnung = await apiFetch('rechnungen', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadRechnung) });
            const resultRechnung = await resRechnung.json();
            
            if (resultRechnung.success) {
                // Rechnung per Mail versenden
                if (m.Email && m.Email.includes('@')) {
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

        // 2. BAR / TWINT IN BUCHHALTUNG VERBUCHEN
        if (barTwintItems.length > 0) {
            for (let w of barTwintItems) {
                const kontoSoll = w.verkaufMethode === 'Twint' ? '1020' : '1000'; // 1020 Bank/Twint, 1000 Kasse
                const kontoHaben = '3200'; // Ertrag Kleiderverkauf (Annahme)
                
                const bhPayload = {
                    action: 'addJournalEntry',
                    beleg_nr: `VK-${new Date().getFullYear()}`,
                    beschreibung: `Kleiderverkauf (${w.verkaufMethode}): ${w.label}`,
                    konto_soll: kontoSoll,
                    konto_haben: kontoHaben,
                    betrag: w.pfandBetrag,
                    typ: 'Verkauf',
                    jahr: new Date().getFullYear()
                };

                console.log("Buche Verkauf in Buchhaltung...", bhPayload);
                const resBh = await apiFetch('buchhaltung', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bhPayload) });
                const resultBh = await resBh.json();
                if (!resultBh.success) {
                    console.error("Fehler beim Buchen:", resultBh.error);
                } else if (w.verkaufMethode === 'Twint') {
                    // Automatische Twint-Gebühren Buchung (RaiseNow 1.3%)
                    const feeAmount = parseFloat((w.pfandBetrag * 0.013).toFixed(2));
                    if (feeAmount > 0) {
                        const feePayload = {
                            action: 'addJournalEntry',
                            beleg_nr: `VK-${new Date().getFullYear()}`,
                            beschreibung: `Twint/RaiseNow Gebühr (1.3%): ${w.label}`,
                            konto_soll: '6840', // Bankspesen
                            konto_haben: kontoSoll, // Twint-Transitkonto (z.B. 1020)
                            betrag: feeAmount,
                            typ: 'Spesen',
                            jahr: new Date().getFullYear()
                        };
                        console.log("Buche Twint-Gebühren...", feePayload);
                        const resFee = await apiFetch('buchhaltung', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(feePayload) });
                        const resultFee = await resFee.json();
                        if (!resultFee.success) console.error("Fehler bei Gebührenbuchung:", resultFee.error);
                    }
                }
            }
        }
    } catch (err) {
        console.error("Fehler in der Verkaufs-Nachbereitung:", err);
    }
}

