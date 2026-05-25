// =========================================================
//  MODULE: INVENTAR - CART
//  - Warenkorb-Interaktionen & Transaktions-Submit
// =========================================================

// =========================================================
//  WARENKORB
// =========================================================
function warenkorbAdd() {
    const action     = document.getElementById('select-action').value;
    const kategorie  = document.getElementById('select-kategorie').value;
    const itemId     = document.getElementById('select-gegenstand').value;
    const zustandA   = document.getElementById('select-zustand-abgabe').value;
    const zustandR   = document.getElementById('select-zustand-rueckgabe').value;
    const pfand      = parseFloat(document.getElementById('pfand-betrag').value) || 0;
    const pfandEin   = document.getElementById('pfand-einnahme').value;
    const pfandRet   = document.getElementById('pfand-retour').value;
    const mitgliedId = document.getElementById('select-mitglied').value;

    if (!itemId)     { alert("Bitte Gegenstand wählen."); return; }
    if (!mitgliedId) { alert("Bitte Mitglied wählen.");  return; }

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

    warenkorb.push({ itemId, kategorie, label,
                     zustandAbgabe: zustandA, zustandRueckgabe: zustandR,
                     pfandBetrag: pfand, pfandEinnahme: pfandEin, pfandRetour: pfandRet });
    renderWarenkorb();
    document.getElementById('pfand-betrag').value = '';
    updateSubOptions();
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
                <th>Kat.</th><th>Gegenstand</th><th>Zustand</th><th>Pfand</th><th></th>
            </tr></thead>
            <tbody>
                ${warenkorb.map((w, i) => `
                    <tr>
                        <td><span class="badge bg-secondary">${w.kategorie}</span></td>
                        <td><small>${w.label}</small></td>
                        <td><small>${action==='checkout' ? w.zustandAbgabe : w.zustandRueckgabe}</small></td>
                        <td><small>${w.pfandBetrag>0 ? `CHF ${w.pfandBetrag.toFixed(2)}` : '-'}</small></td>
                        <td>
                            <button class="btn btn-sm btn-outline-danger py-0"
                                    onclick="warenkorbRemove(${i})">✕</button>
                        </td>
                    </tr>`).join('')}
            </tbody>
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

    const payload = {
        action:                action,
        Aktion:                action === 'checkout' ? 'AUSGABE' : 'CHECKIN',
        Aktueller_Besitzer_ID: mitgliedId,
        mitgliedId:            mitgliedId,
        Bemerkungen:           document.getElementById('trans-bemerkungen').value,
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
                result.sigVorstandUrl || ""
            );
        }

        warenkorb = [];
        renderWarenkorb();
        document.getElementById('form-ausgabe').reset();
        if (sigPadMitglied) sigPadMitglied.clear();
        if (sigPadVorstand) sigPadVorstand.clear();

        await loadInventarData();
        showInventarSection('journal');

        const pdfHinweis = result.pdfUrl
            ? `${payload.items.length} Position(en) erfolgreich erfasst und Beleg im Google Drive gesichert.`
            : `${payload.items.length} Position(en) erfolgreich erfasst (Beleg wird heruntergeladen).`;
        showJournalConfirmationAlert(pdfHinweis);

    } catch (err) {
        console.error("Buchungsfehler:", err);
        alert("❌ Fehler bei der Buchung: " + err.message);
    } finally {
        setInventarBusy(false);
    }
}
