// =========================================================
//  MODULE: INVENTAR - JOURNAL
//  - Transaktionen, Offene Ausleihen, Finanzen/Pfand, Protokoll
// =========================================================

// =========================================================
//  JOURNAL TABELLEN
// =========================================================
function renderJournalTables() {
    if (!inventarState) return;
    renderOffeneAusleihen();
    renderTransaktionenTable();
    renderProtokollTable();
}

// ── Offene Ausleihen ──
function sortAusleihen(col) {
    ausleihenSortDir = ausleihenSortCol === col
        ? (ausleihenSortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    ausleihenSortCol = col;
    renderOffeneAusleihen();
}

function renderOffeneAusleihen() {
    const journalSection = document.getElementById('inv-section-journal');
    if (!journalSection) return;
    const existing = journalSection.querySelector('.offene-ausleihen-card');
    if (existing) existing.remove();

    const keyMap = {
        "gewehre":"gewehr","schluessel":"schluessel",
        "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung"
    };

    let rows = [];
    Object.keys(keyMap).forEach(key => {
        (inventarState[key] || []).forEach(item => {
            const besitzer = item.Aktueller_Besitzer_ID;
            if (!besitzer || besitzer.toString()==="0" || besitzer.toString()==="") return;
            if ((item.Status || '').toLowerCase() === 'verkauft') return;

            const mitglied  = getInventarNameFromId(besitzer);
            const itemLabel = getItemLabel(keyMap[key], item);
            const pfand     = (inventarState.pfand || []).find(p =>
                p.Inventar_ID?.toString() === item.ID.toString() &&
                (p.Status||"").toLowerCase() === "offen");
            const pfandStr  = pfand ? `CHF ${parseFloat(pfand.Betrag).toFixed(2)}` : '-';

            const trans = [...(inventarState.transaktionen||[])].reverse().find(t => {
                const ak = (t.Aktion||"").toUpperCase();
                if (ak !== 'AUSGABE' && ak !== 'CHECKOUT') return false;
                if (t.Inventar_ID.toString() === item.ID.toString()) return true;
                const numT = parseInt(t.Inventar_ID);
                const numI = parseInt(item.ID.toString().replace(/\D/g,''));
                return !isNaN(numT) && !isNaN(numI) && numT===numI &&
                       (t.Kategorie||"").toLowerCase() === keyMap[key];
            });
            const seit     = trans?.Zeitstempel ? formatCH(trans.Zeitstempel) : '-';
            const seitDate = trans?.Zeitstempel ? new Date(trans.Zeitstempel) : new Date(0);
            rows.push({ mitglied, kategorie:keyMap[key], itemLabel, seit, seitDate, pfandStr, besitzer, katKey: keyMap[key], itemId: item.ID });
        });
    });

    rows.sort((a, b) => {
        let va, vb;
        if      (ausleihenSortCol==='mitglied') { va=a.mitglied;  vb=b.mitglied; }
        else if (ausleihenSortCol==='kat')      { va=a.kategorie; vb=b.kategorie; }
        else if (ausleihenSortCol==='gegen')    { va=a.itemLabel; vb=b.itemLabel; }
        else                                    { va=a.seitDate;  vb=b.seitDate; }
        if (va<vb) return ausleihenSortDir==='asc'?-1:1;
        if (va>vb) return ausleihenSortDir==='asc'?1:-1;
        return 0;
    });

    const sh = (l,c) => sortHeader(l,c,ausleihenSortCol,ausleihenSortDir,'sortAusleihen');

    let html = `
        <div class="card border-0 shadow-sm p-4 mb-4 offene-ausleihen-card">
            <h4>📋 Offene Ausleihen</h4>
            <div class="table-responsive">
                <table class="table table-hover table-sm">
                    <thead><tr class="table-info">
                        ${sh('Mitglied','mitglied')}
                        ${sh('Kategorie','kat')}
                        ${sh('Gegenstand','gegen')}
                        ${sh('Seit','seit')}
                        <th>Pfand</th>
                        <th class="text-center">Aktion</th>
                    </tr></thead>
                    <tbody>`;

    if (rows.length === 0) {
        html += `<tr><td colspan="6" class="text-muted text-center py-3">✅ Keine offenen Ausleihen</td></tr>`;
    } else {
        rows.forEach(r => {
            html += `<tr>
                <td>${r.mitglied}</td>
                <td><span class="badge bg-secondary">${r.kategorie}</span></td>
                <td>${r.itemLabel}</td>
                <td>${r.seit}</td>
                <td class="fw-bold">${r.pfandStr}</td>
                <td class="text-center">
                    <button class="btn btn-xs btn-outline-success fw-bold py-0.5 px-2"
                            onclick="startCheckinFromJournal('${r.besitzer}', '${r.katKey}', '${r.itemId}')"
                            title="Rückgabe erfassen">
                        <i class="fas fa-undo me-1"></i>Rückgabe
                    </button>
                </td>
            </tr>`;
        });
    }
    html += `</tbody></table></div></div>`;
    journalSection.insertAdjacentHTML('afterbegin', html);
}

window.startCheckinFromJournal = function(mitgliedId, kat, itemId) {
    localStorage.setItem('inventar-activeTab', 'ausgabe');
    showInventarSection('ausgabe');
    document.getElementById('select-action').value = 'checkin';
    toggleBookingFields();
    document.getElementById('select-mitglied').value = mitgliedId;
    document.getElementById('select-kategorie').value = kat;
    updateSubOptions();
    document.getElementById('select-gegenstand').value = itemId;
    onGegenstandSelect();
};

// ── Material-Bewegungen ──
function sortTransaktionen(col) {
    journalSortDir = journalSortCol===col
        ? (journalSortDir==='asc'?'desc':'asc') : 'desc';
    journalSortCol = col;
    renderTransaktionenTable();
}

function renderTransaktionenTable() {
    const transTable = document.getElementById('table-transaktionen');
    if (!transTable) return;
    const sh = (l,c) => sortHeader(l,c,journalSortCol,journalSortDir,'sortTransaktionen');

    if (!inventarState?.transaktionen?.length) {
        transTable.innerHTML = `<thead><tr class="table-dark">
            <th>Datum</th><th>Mitglied</th><th>Aktion</th>
            <th>Kategorie</th><th>Gegenstand</th><th>Bemerkung</th><th class="text-center">Aktionen</th>
        </tr></thead>
        <tbody><tr><td colspan="7" class="text-center text-muted">Noch keine Transaktionen.</td></tr></tbody>`;
        return;
    }

    // Gruppierung: gleicher Besitzer + Aktion + Zeitstempel ±10 Sek
    const groups = [];
    const used   = new Set();
    const sorted = [...inventarState.transaktionen]
        .sort((a, b) => new Date(b.Zeitstempel) - new Date(a.Zeitstempel));

    sorted.forEach((t, i) => {
        if (used.has(i)) return;
        const group = [t];
        used.add(i);
        const tMs = new Date(t.Zeitstempel).getTime();
        sorted.forEach((t2, j) => {
            if (used.has(j)) return;
            const t2Ms = new Date(t2.Zeitstempel).getTime();
            if (Math.abs(tMs - t2Ms) <= 10000 &&
                t2.Aktueller_Besitzer_ID === t.Aktueller_Besitzer_ID &&
                (t2.Aktion||"").toUpperCase() === (t.Aktion||"").toUpperCase()) {
                group.push(t2);
                used.add(j);
            }
        });
        groups.push(group);
    });

    // Sortierung
    groups.sort((a, b) => {
        const dA  = new Date(a[0].Zeitstempel);
        const dB  = new Date(b[0].Zeitstempel);
        const mA  = getInventarNameFromId(a[0].Aktueller_Besitzer_ID);
        const mB  = getInventarNameFromId(b[0].Aktueller_Besitzer_ID);
        const akA = a[0].Aktion || '';
        const akB = b[0].Aktion || '';
        let va, vb;
        if      (journalSortCol==='datum') { va=dA;  vb=dB; }
        else if (journalSortCol==='mitgl') { va=mA;  vb=mB; }
        else if (journalSortCol==='aktion'){ va=akA; vb=akB; }
        else                               { va=dA;  vb=dB; }
        if (va<vb) return journalSortDir==='asc'?-1:1;
        if (va>vb) return journalSortDir==='asc'?1:-1;
        return 0;
    });

    let html = `<thead><tr class="table-light border-bottom">
        ${sh('Datum','datum')}
        ${sh('Mitglied','mitgl')}
        ${sh('Aktion','aktion')}
        <th>Kategorie</th>
        <th>Gegenstand</th>
        <th>Bemerkung</th>
        <th class="text-center">Aktionen</th>
    </tr></thead><tbody>`;

    groups.slice(0, 50).forEach(group => {
        const rowspan = group.length;
        group.forEach((t, idx) => {
            const date       = formatCH(t.Zeitstempel);
            const mitglied   = getInventarNameFromId(t.Aktueller_Besitzer_ID);
            const aktion     = (t.Aktion||"").toUpperCase();
            const istStorno  = aktion === 'STORNO' || (t.Bemerkungen||'').includes('[STORNIERT]');
            const istVerkauf = aktion === 'VERKAUF';
            const istAusgabe = aktion === 'AUSGABE' || aktion === 'CHECKOUT';
            const invBadge   = (t.invoice_id || t.Invoice_ID) ? ` <span class="badge bg-light text-primary border ms-1" title="Verknüpfte Rechnung: ${t.invoice_id || t.Invoice_ID}"><i class="fas fa-file-invoice me-1"></i>${t.invoice_id || t.Invoice_ID}</span>` : '';
            let aktionBadge  = `<span class="badge bg-success">Rückgabe</span>${invBadge}`;
            if (istStorno) {
                aktionBadge  = `<span class="badge bg-danger text-white fw-bold"><i class="fas fa-ban me-1"></i>Storniert</span>${invBadge}`;
            } else if (istVerkauf) {
                const methodeStr = t.Zahlungsart ? ` <span class="badge bg-light text-dark border ms-1">${t.Zahlungsart}</span>` : '';
                aktionBadge  = `<span class="badge bg-info text-dark fw-bold">Verkauf</span>${methodeStr}${invBadge}`;
            } else if (istAusgabe) {
                const pfandStr = parseFloat(t.Pfandbetrag) > 0 ? ` <span class="badge bg-warning text-dark border ms-1" title="Pfand: CHF ${parseFloat(t.Pfandbetrag).toFixed(2)} (${t.Zahlungsart || '-'})">Pfand CHF ${parseFloat(t.Pfandbetrag).toFixed(2)}</span>` : '';
                aktionBadge  = `<span class="badge bg-primary">Ausgabe</span>${pfandStr}${invBadge}`;
            } else if (parseFloat(t.Pfandbetrag) > 0) {
                const retourStr = ` <span class="badge bg-light text-dark border ms-1">Pfand-Retour</span>`;
                aktionBadge  = `<span class="badge bg-success">Rückgabe</span>${retourStr}${invBadge}`;
            }
            const kat        = t.Kategorie || '-';
            const gegenstand = getItemLabelFromTrans(t);

            let actionCell = '';
            if (idx === 0) {
                const safeGroup = encodeURIComponent(JSON.stringify(group));
                const backendPdfUrl = group[0].PDF_URL || "";
                const isGroupCancelled = group.some(gt => (gt.Aktion||'').toUpperCase() === 'STORNO' || (gt.Bemerkungen||'').includes('[STORNIERT]'));
                const pdfBtn = backendPdfUrl
                    ? `<a href="${backendPdfUrl}" target="_blank"
                          class="btn btn-sm btn-success py-1 px-2" title="Quittungs-PDF öffnen">📄</a>`
                    : `<button class="btn btn-sm btn-outline-secondary py-1 px-2"
                               title="PDF lokal generieren"
                               onclick="regeneratePDF('${safeGroup}')">📄</button>`;

                const stornoBtn = isGroupCancelled
                    ? `<span class="badge bg-secondary py-1 px-2" title="Buchung bereits storniert">Storniert</span>`
                    : (canDelete() ? `<button class="btn btn-sm btn-outline-danger py-1 px-2"
                                title="Buchung stornieren / rückgängig machen"
                                onclick="storniereInventarBuchung('${safeGroup}')">
                            <i class="fas fa-undo me-1"></i>Storno
                        </button>` : '');

                actionCell = `<td rowspan="${rowspan}" class="text-center align-middle" style="white-space:nowrap;">
                    <div class="d-inline-flex gap-1 align-items-center">
                        ${pdfBtn}
                        ${stornoBtn}
                    </div>
                </td>`;
            }
            html += `<tr>
                <td>${date}</td>
                <td>${mitglied}</td>
                <td>${aktionBadge}</td>
                <td><span class="badge bg-secondary">${kat}</span></td>
                <td><small>${gegenstand}</small></td>
                <td><small class="text-muted">${t.Bemerkungen||''}</small></td>
                ${actionCell}
            </tr>`;
        });
    });
    transTable.innerHTML = html + "</tbody>";
}

// =========================================================
//  STORNO / RÜCKGÄNGIG MACHEN EINER BUCHUNG
// =========================================================
window.storniereInventarBuchung = async function(safeGroup) {
    if (!canDelete()) {
        alert("❌ Keine Berechtigung zum Stornieren von Buchungen.");
        return;
    }
    let group = [];
    try {
        group = JSON.parse(decodeURIComponent(safeGroup));
    } catch (e) {
        alert("Fehler beim Lesen der Buchungsdaten.");
        return;
    }
    if (!group || !group.length) return;

    const first = group[0];
    const aktion = (first.Aktion || '').toUpperCase();
    const mitgliedName = getInventarNameFromId(first.Aktueller_Besitzer_ID);
    const datumStr = formatCH(first.Zeitstempel);
    const count = group.length;

    const warnMsg = `⚠️ Möchtest du diese Buchung wirklich stornieren / rückgängig machen?\n\n` +
        `• Datum: ${datumStr}\n` +
        `• Aktion: ${first.Aktion}\n` +
        `• Mitglied: ${mitgliedName}\n` +
        `• Positionen: ${count} Gegenstand/Gegenstände\n\n` +
        `Auswirkungen:\n` +
        `1. Artikelbestand wird auf den vorherigen Status zurückgestellt (z.B. zurück ins Lager).\n` +
        `2. Offene Pfandeinträge werden storniert.\n` +
        `3. Eine verknüpfte QR-Rechnung im Modul Rechnungen wird automatisch storniert / gelöscht.\n` +
        `(Hinweis: Bar-Kassenbuchungen bleiben unverändert).\n\n` +
        `Fortfahren?`;

    if (!confirm(warnMsg)) return;

    setInventarBusy(true);
    const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
    if (!supa) {
        alert("❌ Supabase Client nicht verfügbar.");
        setInventarBusy(false);
        return;
    }

    try {
        const nowIso = new Date().toISOString();
        let invoicesCancelled = [];

        // 0. Vorab verknüpfte Rechnungs-IDs der gesamten Buchungsgruppe ermitteln (Zwei-Wege-Identifikation)
        const groupInvoiceIds = new Set();
        group.forEach(t => {
            const iId = String(t.invoice_id || t.Invoice_ID || '').trim();
            if (iId) groupInvoiceIds.add(iId);
        });

        // Fallback für Altdaten vor Migration 66 (falls keine invoice_id auf Transaktion hinterlegt war)
        if (groupInvoiceIds.size === 0) {
            for (const t of group) {
                const itemId = String(t.Inventar_ID || '').trim();
                if (!itemId) continue;
                try {
                    const { data: positions } = await supa.from('invoice_positions')
                        .select('invoice_id')
                        .eq('source_field', itemId);
                    (positions || []).forEach(p => {
                        if (p.invoice_id) groupInvoiceIds.add(String(p.invoice_id).trim());
                    });

                    const { data: directInvs } = await supa.from('invoices')
                        .select('id')
                        .eq('source_module', 'inventar')
                        .eq('source_id', itemId);
                    (directInvs || []).forEach(di => {
                        if (di.id) groupInvoiceIds.add(String(di.id).trim());
                    });
                } catch (e) {
                    console.warn("Altdaten-Rechnungslookup Hinweis:", e);
                }
            }
        }

        // 1. Verknüpfte Rechnungen im Rechnungsmodul stornieren oder löschen
        for (const invId of groupInvoiceIds) {
            try {
                const { data: invData, error: fetchErr } = await supa.from('invoices')
                    .select('id, mail_status, status, total_amount, open_amount')
                    .eq('id', invId)
                    .maybeSingle();

                if (fetchErr) {
                    console.warn(`Fehler beim Laden der Rechnung ${invId}:`, fetchErr);
                    continue;
                }

                if (!invData) continue;

                // Prüfen, ob Zahlungen existieren
                const { count: paymentCount } = await supa.from('invoice_payments')
                    .select('*', { count: 'exact', head: true })
                    .eq('invoice_id', invId);

                const hasPayments = (paymentCount && paymentCount > 0) ||
                    (invData.open_amount !== null && Number(invData.open_amount) < Number(invData.total_amount));

                if (invData.status !== 'bezahlt' && !hasPayments) {
                    if (invData.mail_status === 'entwurf') {
                        // Entwurf: Positionen & Rechnung sauber physisch löschen
                        await supa.from('invoice_positions').delete().eq('invoice_id', invId);
                        await supa.from('invoices').delete().eq('id', invId);

                        // Referenzen in Transaktionen und Depots entkoppeln
                        await supa.from('inventory_transactions').update({ invoice_id: null }).eq('invoice_id', invId);
                        await supa.from('inventory_deposits').update({ invoice_id: null }).eq('invoice_id', invId);

                        // Sofort aus In-Memory Rechnungs-Cache entfernen
                        if (Array.isArray(window._invoices)) {
                            const remIdx = window._invoices.findIndex(i => String(i.id) === String(invId));
                            if (remIdx !== -1) window._invoices.splice(remIdx, 1);
                        }
                        invoicesCancelled.push(`${invId} (gelöscht)`);
                    } else {
                        // Versendet/Festgeschrieben: Revisionssicher via RechnungsCore stornieren
                        if (window.RechnungsCore && typeof window.RechnungsCore.cancelInvoice === 'function') {
                            await window.RechnungsCore.cancelInvoice(invId, 'Storniert über Inventar-Journal');
                        } else {
                            await supa.from('invoices').update({
                                status: 'storniert',
                                cancel_reason: 'Storniert über Inventar-Journal',
                                cancelled_at: nowIso,
                                open_amount: 0.00,
                                updated_at: nowIso
                            }).eq('id', invId);
                        }
                        invoicesCancelled.push(`${invId} (storniert)`);
                    }
                }
            } catch (invErr) {
                console.warn("Hinweis bei Rechnungs-Prüfung/Storno:", invErr);
            }
        }

        // 2. Artikelbestand, Pfand und Transaktionen zurücksetzen
        for (const t of group) {
            const itemId = String(t.Inventar_ID || '').trim();
            const memberId = t.Aktueller_Besitzer_ID ? parseInt(t.Aktueller_Besitzer_ID) : null;
            const tAction = (t.Aktion || '').toUpperCase();

            // A. Artikelbestand zurücksetzen in inventory_items
            if (itemId) {
                if (tAction === 'VERKAUF' || tAction === 'AUSGABE' || tAction === 'CHECKOUT') {
                    // War ausgegeben/verkauft -> wieder zurück ins Lager
                    await supa.from('inventory_items')
                        .update({ status: 'Im Lager', current_owner_id: null, updated_at: nowIso })
                        .eq('id', itemId);
                } else if (tAction === 'CHECKIN') {
                    // War zurückgegeben -> wieder als ausgegeben an das Mitglied markieren
                    await supa.from('inventory_items')
                        .update({ status: 'Ausgegeben', current_owner_id: memberId, updated_at: nowIso })
                        .eq('id', itemId);
                }
            }

            // B. Pfandkasse in inventory_deposits bereinigen
            if (itemId && memberId) {
                if (tAction === 'AUSGABE' || tAction === 'CHECKOUT') {
                    // Offenes Pfand stornieren
                    await supa.from('inventory_deposits')
                        .update({ status: 'Storniert', updated_at: nowIso })
                        .eq('member_id', memberId)
                        .eq('item_id', itemId)
                        .eq('status', 'Offen');
                } else if (tAction === 'CHECKIN') {
                    // Retourniertes Pfand wieder auf 'Offen' zurücksetzen
                    await supa.from('inventory_deposits')
                        .update({ status: 'Offen', date_returned: null, updated_at: nowIso })
                        .eq('member_id', memberId)
                        .eq('item_id', itemId)
                        .eq('status', 'Retour');
                }
            }

            // C. Transaktion in inventory_transactions als STORNO markieren
            const txDbId = t.db_id || t.id;
            if (txDbId) {
                await supa.from('inventory_transactions')
                    .update({
                        action: 'STORNO',
                        notes: `[STORNIERT ${new Date().toLocaleDateString('de-CH')}] ` + (t.Bemerkungen || '')
                    })
                    .eq('id', txDbId);
            } else if (itemId && t.Zeitstempel) {
                await supa.from('inventory_transactions')
                    .update({
                        action: 'STORNO',
                        notes: `[STORNIERT ${new Date().toLocaleDateString('de-CH')}] ` + (t.Bemerkungen || '')
                    })
                    .eq('item_id', itemId)
                    .eq('timestamp', t.Zeitstempel);
            }
        }

        // 3. Revisions-Auditlog erfassen
        await supa.from('inventory_audit_log').insert([{
            timestamp: nowIso,
            user_name: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
            action: 'cancelBooking',
            details: `Buchung (${first.Aktion}) für Mitglied ${mitgliedName} (${count} Positionen) storniert.${invoicesCancelled.length ? ' Verknüpfte Rechnungen: ' + invoicesCancelled.join(', ') : ''}`
        }]);

        // 4. Caches invalidieren & UI neu laden
        if (typeof window.loadRechnungenData === 'function') {
            window.loadRechnungenData(true, true).catch(() => {});
        }
        if (typeof window.renderRechnungen === 'function') {
            try { window.renderRechnungen(); } catch (_) {}
        }
        await loadInventarData(true);

        const infoFeedback = invoicesCancelled.length 
            ? `✅ Buchung erfolgreich storniert! Artikelbestand zurückgestellt & Rechnung ${invoicesCancelled.join(', ')} storniert.`
            : `✅ Buchung erfolgreich storniert! Artikelbestand und Pfandkasse wurden zurückgestellt.`;

        alert(infoFeedback);

    } catch (err) {
        console.error("Fehler beim Stornieren:", err);
        alert("❌ Fehler beim Stornieren: " + err.message);
    } finally {
        setInventarBusy(false);
    }
};

// =========================================================
//  FINANZEN & PFAND
// =========================================================
function renderFinanzen() {
    if (!inventarState?.pfand) return;

    // Aktuelle Rechnungsstati dynamisch mit window._invoices abgleichen (falls im Portal frisch bezahlt)
    if (window._invoices && Array.isArray(window._invoices)) {
        inventarState.pfand.forEach(p => {
            if (p.invoice_id) {
                const liveInv = window._invoices.find(i => String(i.id).trim() === String(p.invoice_id).trim());
                if (liveInv) {
                    p.Invoice_Status = liveInv.status;
                    p.Invoice_Open = Number(liveInv.open_amount || 0);
                    p.Invoice_Total = Number(liveInv.total_amount || 0);
                }
            }
        });
    }

    const offene = inventarState.pfand.filter(p => p.Status === 'Offen');
    const total  = offene.reduce((sum, p) => sum + (parseFloat(p.Betrag) || 0), 0);

    // Unterteilung: Bereits erhalten (Bar/Twint/Rechnung bezahlt) vs. Ausstehende QR-Rechnungen
    const bezahltTotal = offene.reduce((sum, p) => {
        const isPaid = (p.Invoice_Status === 'bezahlt') || 
                       (!p.invoice_id && (p.Zahlungsart || '').toLowerCase().includes('bar')) ||
                       (!p.invoice_id && (p.Zahlungsart || '').toLowerCase().includes('twint'));
        return isPaid ? sum + (parseFloat(p.Betrag) || 0) : sum;
    }, 0);
    const ausstehendRechnungTotal = Math.max(0, total - bezahltTotal);
    
    // Stats Karten
    const statsEl = document.getElementById('finanz-stats');
    if (statsEl) {
        const katStats = offene.reduce((acc, p) => {
            acc[p.Kategorie] = (acc[p.Kategorie] || 0) + (parseFloat(p.Betrag) || 0);
            return acc;
        }, {});

        statsEl.innerHTML = `
            <div class="col-md-5">
                <div class="card border-0 shadow-sm p-3 bg-primary text-white h-100">
                    <div class="small text-uppercase fw-bold opacity-75">Pfand-Kasse (Offen)</div>
                    <div class="fs-2 fw-bold">CHF ${total.toFixed(2)}</div>
                    <div class="small opacity-90 mt-1 d-flex flex-wrap gap-2 pt-1 border-top border-white-50">
                        <span><i class="fas fa-check-circle me-1"></i>Bezahlt/Erhalten: <strong>CHF ${bezahltTotal.toFixed(2)}</strong></span>
                        ${ausstehendRechnungTotal > 0 ? `<span><i class="fas fa-clock me-1 text-warning"></i>Offene Rechnungen: <strong>CHF ${ausstehendRechnungTotal.toFixed(2)}</strong></span>` : ''}
                    </div>
                </div>
            </div>
            <div class="col-md-7">
                <div class="card border-0 shadow-sm p-3 h-100">
                    <div class="small text-uppercase fw-bold text-muted mb-2">Nach Kategorie</div>
                    <div class="d-flex flex-wrap gap-2">
                        ${Object.entries(katStats).map(([kat, val]) => `
                            <div>
                                <span class="badge bg-light text-dark border px-2.5 py-1.5">${kat}: <strong>CHF ${val.toFixed(2)}</strong></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // Tabelle
    const tbody = document.getElementById('pfand-table-body');
    if (tbody) {
        if (offene.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Kein offenes Pfand vorhanden.</td></tr>';
            return;
        }

        tbody.innerHTML = offene.map(p => {
            const mitglied = getInventarNameFromId(p.Mitglied_ID);
            const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                             "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
            const item = (inventarState[keyMap[p.Kategorie]] || []).find(it => it.ID.toString() === p.Inventar_ID.toString());
            const label = item ? getItemLabel(p.Kategorie, item) : p.Inventar_ID;

            let paymentBadge = '';
            if (p.invoice_id) {
                const invStatus = (p.Invoice_Status || 'offen').toLowerCase();
                if (invStatus === 'bezahlt') {
                    paymentBadge = `
                        <div class="d-inline-flex align-items-center gap-1.5">
                            <span class="badge bg-light text-primary border font-monospace" title="QR-Rechnung ${p.invoice_id}"><i class="fas fa-file-invoice me-1"></i>${p.invoice_id}</span>
                            <span class="badge bg-success-subtle text-success border border-success-subtle fw-semibold"><i class="fas fa-check-circle me-1"></i>Bezahlt</span>
                        </div>`;
                } else if (invStatus === 'storniert') {
                    paymentBadge = `
                        <div class="d-inline-flex align-items-center gap-1.5">
                            <span class="badge bg-light text-muted border font-monospace text-decoration-line-through">${p.invoice_id}</span>
                            <span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="fas fa-ban me-1"></i>Storniert</span>
                        </div>`;
                } else if (invStatus.includes('teilweise')) {
                    paymentBadge = `
                        <div class="d-inline-flex align-items-center gap-1.5">
                            <span class="badge bg-light text-primary border font-monospace"><i class="fas fa-file-invoice me-1"></i>${p.invoice_id}</span>
                            <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle"><i class="fas fa-adjust me-1"></i>Teilzahlung</span>
                        </div>`;
                } else {
                    paymentBadge = `
                        <div class="d-inline-flex align-items-center gap-1.5">
                            <span class="badge bg-light text-primary border font-monospace"><i class="fas fa-file-invoice me-1"></i>${p.invoice_id}</span>
                            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fw-semibold"><i class="fas fa-clock me-1"></i>Rechnung offen</span>
                        </div>`;
                }
            } else if ((p.Zahlungsart || '').toLowerCase().includes('bar')) {
                paymentBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="fas fa-coins me-1"></i>Bar bezahlt</span>`;
            } else if ((p.Zahlungsart || '').toLowerCase().includes('twint')) {
                paymentBadge = `<span class="badge bg-info-subtle text-info border border-info-subtle"><i class="fas fa-mobile-alt me-1"></i>Twint bezahlt</span>`;
            } else {
                paymentBadge = `<span class="badge bg-light text-secondary border">${p.Zahlungsart || '-'}</span>`;
            }

            return `<tr>
                <td>${formatCH(p.Datum_Einnahme)}</td>
                <td class="fw-bold">${mitglied}</td>
                <td><span class="badge bg-secondary">${p.Kategorie}</span></td>
                <td><small class="fw-semibold">${label}</small></td>
                <td>${paymentBadge}</td>
                <td class="text-end fw-bold font-monospace">CHF ${(parseFloat(p.Betrag)||0).toFixed(2)}</td>
            </tr>`;
        }).join('');
    }
}

// ── Admin-Protokoll ──
function sortProtokoll(col) {
    protokollSortDir = protokollSortCol===col
        ? (protokollSortDir==='asc'?'desc':'asc') : 'desc';
    protokollSortCol = col;
    renderProtokollTable();
}

function renderProtokollTable() {
    const logTable = document.getElementById('table-protokoll');
    if (!logTable) return;
    const sh = (l,c) => sortHeader(l,c,protokollSortCol,protokollSortDir,'sortProtokoll');

    if (!inventarState?.protokoll?.length) {
        logTable.innerHTML = `<thead><tr class="table-secondary">
            <th>Zeit</th><th>Nutzer</th><th>Aktion</th><th>Details</th>
        </tr></thead>
        <tbody><tr><td colspan="4" class="text-center text-muted">Keine Admin-Aktionen.</td></tr></tbody>`;
        return;
    }

    let rows = inventarState.protokoll.map(p => ({
        ts:      p.Zeitstempel,
        tsDate:  new Date(p.Zeitstempel||0),
        nutzer:  p['Nutzer (Vorstand)'] || '-',
        aktion:  p.Aktion  || '-',
        details: [p.Details, p['']].filter(v=>v&&v!=='').join(' | ') || '-'
    }));

    rows.sort((a, b) => {
        let va, vb;
        if      (protokollSortCol==='nutzer') { va=a.nutzer; vb=b.nutzer; }
        else if (protokollSortCol==='akt')    { va=a.aktion; vb=b.aktion; }
        else                                  { va=a.tsDate; vb=b.tsDate; }
        if (va<vb) return protokollSortDir==='asc'?-1:1;
        if (va>vb) return protokollSortDir==='asc'?1:-1;
        return 0;
    });

    let html = `<thead><tr class="table-secondary">
        ${sh('Zeit','zeit')}
        ${sh('Nutzer','nutzer')}
        ${sh('Aktion','akt')}
        <th>Details</th>
    </tr></thead><tbody>`;

    rows.slice(0,30).forEach(r => {
        html += `<tr>
            <td><small>${formatCHDateTime(r.ts)}</small></td>
            <td><small>${r.nutzer}</small></td>
            <td><strong>${r.aktion}</strong></td>
            <td><small>${r.details}</small></td>
        </tr>`;
    });
    logTable.innerHTML = html + "</tbody>";
}
