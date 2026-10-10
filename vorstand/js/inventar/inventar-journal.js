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

    let html = `<thead><tr class="table-dark">
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
            let aktionBadge  = '<span class="badge bg-success">Rückgabe</span>';
            if (istStorno) {
                aktionBadge  = `<span class="badge bg-danger text-white fw-bold"><i class="fas fa-ban me-1"></i>Storniert</span>`;
            } else if (istVerkauf) {
                const methodeStr = t.Zahlungsart ? ` <span class="badge bg-light text-dark border ms-1">${t.Zahlungsart}</span>` : '';
                aktionBadge  = `<span class="badge bg-info text-dark fw-bold">Verkauf</span>${methodeStr}`;
            } else if (istAusgabe) {
                const pfandStr = parseFloat(t.Pfandbetrag) > 0 ? ` <span class="badge bg-warning text-dark border ms-1" title="Pfand: CHF ${parseFloat(t.Pfandbetrag).toFixed(2)} (${t.Zahlungsart || '-'})">Pfand CHF ${parseFloat(t.Pfandbetrag).toFixed(2)}</span>` : '';
                aktionBadge  = `<span class="badge bg-primary">Ausgabe</span>${pfandStr}`;
            } else if (parseFloat(t.Pfandbetrag) > 0) {
                const retourStr = ` <span class="badge bg-light text-dark border ms-1">Pfand-Retour</span>`;
                aktionBadge  = `<span class="badge bg-success">Rückgabe</span>${retourStr}`;
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

        for (const t of group) {
            const itemId = String(t.Inventar_ID || '').trim();
            const memberId = t.Aktueller_Besitzer_ID ? parseInt(t.Aktueller_Besitzer_ID) : null;
            const tAction = (t.Aktion || '').toUpperCase();

            // 1. Artikelbestand zurücksetzen in inventory_items
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

            // 2. Pfandkasse in inventory_deposits bereinigen
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

            // 3. Verknüpfte Rechnung im Rechnungsmodul stornieren / löschen (falls Einzahlungsschein)
            if (itemId) {
                try {
                    // Suche in invoice_positions nach diesem Gegenstand
                    const { data: positions } = await supa.from('invoice_positions')
                        .select('invoice_id')
                        .eq('source_field', itemId);
                    
                    const invIds = new Set((positions || []).map(p => p.invoice_id));

                    // Suche zusätzlich nach source_id in invoices
                    const { data: directInvs } = await supa.from('invoices')
                        .select('id, mail_status, status')
                        .eq('source_module', 'inventar')
                        .eq('source_id', itemId);
                    (directInvs || []).forEach(di => invIds.add(di.id));

                    for (const invId of invIds) {
                        const { data: invData } = await supa.from('invoices')
                            .select('id, mail_status, status, total_paid')
                            .eq('id', invId)
                            .maybeSingle();

                        if (invData && invData.status !== 'bezahlt' && (!invData.total_paid || Number(invData.total_paid) === 0)) {
                            if (invData.mail_status === 'entwurf') {
                                await supa.from('invoice_positions').delete().eq('invoice_id', invId);
                                await supa.from('invoices').delete().eq('id', invId);
                                invoicesCancelled.push(`${invId} (gelöscht)`);
                            } else {
                                await supa.from('invoices').update({
                                    status: 'storniert',
                                    cancel_reason: 'Storniert über Inventar-Journal',
                                    cancelled_at: nowIso,
                                    open_amount: 0.00,
                                    updated_at: nowIso
                                }).eq('id', invId);
                                invoicesCancelled.push(`${invId} (storniert)`);
                            }
                        }
                    }
                } catch (invErr) {
                    console.warn("Hinweis bei Rechnungs-Prüfung/Storno:", invErr);
                }
            }

            // 4. Transaktion in inventory_transactions als STORNO markieren
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

        // 5. Revisions-Auditlog erfassen
        await supa.from('inventory_audit_log').insert([{
            timestamp: nowIso,
            user_name: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
            action: 'cancelBooking',
            details: `Buchung (${first.Aktion}) für Mitglied ${mitgliedName} (${count} Positionen) storniert.${invoicesCancelled.length ? ' Verknüpfte Rechnungen: ' + invoicesCancelled.join(', ') : ''}`
        }]);

        // 6. Caches invalidieren & neu laden
        if (typeof window.loadRechnungenData === 'function') {
            window.loadRechnungenData(true, true).catch(() => {});
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

    const offene = inventarState.pfand.filter(p => p.Status === 'Offen');
    const total  = offene.reduce((sum, p) => sum + (parseFloat(p.Betrag) || 0), 0);
    
    // Stats Karten
    const statsEl = document.getElementById('finanz-stats');
    if (statsEl) {
        const katStats = offene.reduce((acc, p) => {
            acc[p.Kategorie] = (acc[p.Kategorie] || 0) + (parseFloat(p.Betrag) || 0);
            return acc;
        }, {});

        statsEl.innerHTML = `
            <div class="col-md-4">
                <div class="card border-0 shadow-sm p-3 bg-primary text-white">
                    <div class="small text-uppercase fw-bold opacity-75">Pfand-Kasse (Offen)</div>
                    <div class="fs-2 fw-bold">CHF ${total.toFixed(2)}</div>
                </div>
            </div>
            <div class="col-md-8">
                <div class="card border-0 shadow-sm p-3">
                    <div class="small text-uppercase fw-bold text-muted mb-2">Nach Kategorie</div>
                    <div class="d-flex gap-3">
                        ${Object.entries(katStats).map(([kat, val]) => `
                            <div>
                                <span class="badge bg-light text-dark">${kat}: CHF ${val.toFixed(2)}</span>
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
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Kein offenes Pfand vorhanden.</td></tr>';
            return;
        }

        tbody.innerHTML = offene.map(p => {
            const mitglied = getInventarNameFromId(p.Mitglied_ID);
            const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                             "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
            const item = (inventarState[keyMap[p.Kategorie]] || []).find(it => it.ID.toString() === p.Inventar_ID.toString());
            const label = item ? getItemLabel(p.Kategorie, item) : p.Inventar_ID;

            return `<tr>
                <td>${formatCH(p.Datum_Einnahme)}</td>
                <td class="fw-bold">${mitglied}</td>
                <td><span class="badge bg-secondary">${p.Kategorie}</span></td>
                <td><small>${label}</small></td>
                <td class="text-end fw-bold">CHF ${(parseFloat(p.Betrag)||0).toFixed(2)}</td>
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
