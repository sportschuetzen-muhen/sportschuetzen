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

    let allRows = [];
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
            const pfandNum  = pfand ? parseFloat(pfand.Betrag || 0) : 0;
            const pfandStr  = pfand ? `CHF ${pfandNum.toFixed(2)}` : '-';

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
            allRows.push({ mitglied, kategorie:keyMap[key], itemLabel, seit, seitDate, pfandNum, pfandStr, besitzer, katKey: keyMap[key], itemId: item.ID });
        });
    });

    const searchInput = document.getElementById('inv-search-ausleihen');
    const search = (searchInput?.value || '').toLowerCase().trim();
    let rows = [...allRows];
    if (search) {
        rows = rows.filter(r =>
            r.mitglied.toLowerCase().includes(search) ||
            r.kategorie.toLowerCase().includes(search) ||
            r.itemLabel.toLowerCase().includes(search) ||
            r.seit.toLowerCase().includes(search) ||
            r.pfandStr.toLowerCase().includes(search)
        );
    }

    rows.sort((a, b) => {
        let res = 0;
        if (ausleihenSortCol === 'mitglied') {
            res = a.mitglied.localeCompare(b.mitglied, 'de-CH', { sensitivity: 'base' });
        } else if (ausleihenSortCol === 'kat') {
            res = a.kategorie.localeCompare(b.kategorie, 'de-CH');
        } else if (ausleihenSortCol === 'gegen') {
            res = a.itemLabel.localeCompare(b.itemLabel, 'de-CH', { numeric: true });
        } else if (ausleihenSortCol === 'pfand') {
            res = a.pfandNum - b.pfandNum;
        } else {
            res = a.seitDate - b.seitDate;
        }
        return ausleihenSortDir === 'asc' ? res : -res;
    });

    const sh = (l, c, id) => sortHeader(l, c, ausleihenSortCol, ausleihenSortDir, 'sortAusleihen', id);

    let html = `
        <div class="card border-0 shadow-sm p-3 p-md-4 mb-4 offene-ausleihen-card">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div>
                    <h4 class="fw-bold mb-0 text-slate-800 d-inline-flex align-items-center">
                        <span class="me-2">📋</span> Offene Ausleihen
                    </h4>
                    <div class="small text-muted" id="journal-ausleihen-stats">
                        ${search ? `<span class="text-primary fw-bold">Zeige ${rows.length}</span> von ${allRows.length} Ausleihen` : `${rows.length} Gegenstände aktuell ausgeliehen`}
                    </div>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-2">
                    <div class="input-group input-group-sm" style="max-width: 250px;">
                        <span class="input-group-text bg-white border-end-0 text-muted"><i class="fas fa-search"></i></span>
                        <input type="text" id="inv-search-ausleihen" class="form-control border-start-0" placeholder="Ausleihen durchsuchen..." value="${search ? search.replace(/"/g, '&quot;') : ''}" oninput="renderOffeneAusleihen()">
                    </div>
                    <div id="tk-toggle-ausleihen"></div>
                </div>
            </div>
            <div class="table-responsive rounded-3 border">
                <table class="table table-hover table-sm align-middle mb-0" id="table-offene-ausleihen">
                    <thead class="table-light border-bottom"><tr>
                        ${sh('Mitglied', 'mitglied', 'col_mitglied')}
                        ${sh('Kategorie', 'kat', 'col_kategorie')}
                        ${sh('Gegenstand', 'gegen', 'col_gegenstand')}
                        ${sh('Seit', 'seit', 'col_seit')}
                        ${sh('Pfand', 'pfand', 'col_pfand')}
                        <th class="text-center" data-col-id="col_aktionen" data-col-toggle="false">Aktion</th>
                    </tr></thead>
                    <tbody>`;

    if (rows.length === 0) {
        html += `<tr><td colspan="6" class="text-muted text-center py-3">${search ? 'Keine passenden Ausleihen gefunden' : '✅ Keine offenen Ausleihen'}</td></tr>`;
    } else {
        rows.forEach(r => {
            html += `<tr>
                <td data-col-id="col_mitglied"><span class="fw-semibold text-dark">${r.mitglied}</span></td>
                <td data-col-id="col_kategorie"><span class="badge bg-secondary-subtle text-secondary border">${r.kategorie}</span></td>
                <td data-col-id="col_gegenstand">${r.itemLabel}</td>
                <td data-col-id="col_seit"><span class="font-monospace small text-muted">${r.seit}</span></td>
                <td data-col-id="col_pfand"><span class="font-monospace fw-bold ${r.pfandNum > 0 ? 'text-primary' : 'text-muted'}">${r.pfandStr}</span></td>
                <td data-col-id="col_aktionen" class="text-center">
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

    // TableKit-Initialisierung für Offene Ausleihen
    if (window.TableKit?.makeColumnReorderable) {
        window.TableKit.makeColumnReorderable('#table-offene-ausleihen', {
            storageKey: 'tk_inv_order_ausleihen',
            lockedColumns: ['col_aktionen']
        });
    }
    if (window.TableKit?.setupColumnToggle) {
        window.TableKit.setupColumnToggle('#table-offene-ausleihen', {
            container: '#tk-toggle-ausleihen',
            storageKey: 'tk_inv_cols_ausleihen'
        });
    }
    if (window.TableKit?.makeResizable) {
        window.TableKit.makeResizable('#table-offene-ausleihen', {
            storageKey: 'tk_inv_widths_ausleihen',
            columns: {
                'col_aktionen': { resizable: false, defaultWidth: 95 }
            }
        });
    }
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
    const sh = (l,c,id) => sortHeader(l,c,journalSortCol,journalSortDir,'sortTransaktionen',id);

    const rawTrans = inventarState?.transaktionen || [];
    if (!rawTrans.length) {
        transTable.innerHTML = `<thead class="table-light border-bottom"><tr>
            <th>Datum</th><th>Mitglied</th><th>Aktion</th>
            <th>Kategorie</th><th>Gegenstand</th><th>Bemerkung</th><th class="text-center">Aktionen</th>
        </tr></thead>
        <tbody><tr><td colspan="7" class="text-center text-muted py-4">Noch keine Transaktionen.</td></tr></tbody>`;
        const statsEl = document.getElementById('journal-trans-stats');
        if (statsEl) statsEl.innerText = '0 Transaktionen';
        return;
    }

    const search = (document.getElementById('inv-search-transaktionen')?.value || '').toLowerCase().trim();
    const filterAktion = (document.getElementById('inv-filter-trans-aktion')?.value || '').toUpperCase().trim();

    let transList = rawTrans;
    if (filterAktion) {
        transList = transList.filter(t => {
            const ak = (t.Aktion || '').toUpperCase();
            if (filterAktion === 'RÜCKGABE') return ak === 'RÜCKGABE' || ak === 'CHECKIN';
            if (filterAktion === 'AUSGABE') return ak === 'AUSGABE' || ak === 'CHECKOUT';
            if (filterAktion === 'VERKAUF') return ak === 'VERKAUF';
            if (filterAktion === 'STORNO') return ak === 'STORNO' || (t.Bemerkungen || '').includes('[STORNIERT]');
            return ak === filterAktion;
        });
    }
    if (search) {
        transList = transList.filter(t => {
            const mName = getInventarNameFromId(t.Aktueller_Besitzer_ID).toLowerCase();
            const label = getItemLabelFromTrans(t).toLowerCase();
            const invId = String(t.invoice_id || t.Invoice_ID || '').toLowerCase();
            const itemCode = String(t.Inventar_ID || '').toLowerCase();
            const notes = String(t.Bemerkungen || '').toLowerCase();
            const ak = String(t.Aktion || '').toLowerCase();
            return mName.includes(search) || label.includes(search) || invId.includes(search) || itemCode.includes(search) || notes.includes(search) || ak.includes(search);
        });
    }

    // Gruppierung: gleicher Besitzer + Aktion + Zeitstempel ±10 Sek
    const groups = [];
    const used   = new Set();
    const sorted = [...transList]
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
        const dA  = new Date(a[0].Zeitstempel).getTime();
        const dB  = new Date(b[0].Zeitstempel).getTime();
        const mA  = getInventarNameFromId(a[0].Aktueller_Besitzer_ID);
        const mB  = getInventarNameFromId(b[0].Aktueller_Besitzer_ID);
        const akA = a[0].Aktion || '';
        const akB = b[0].Aktion || '';
        let res = 0;
        if      (journalSortCol==='mitgl') { res = mA.localeCompare(mB, 'de-CH', { sensitivity: 'base' }); }
        else if (journalSortCol==='aktion'){ res = akA.localeCompare(akB, 'de-CH'); }
        else if (journalSortCol==='kat')   { res = String(a[0].Kategorie||'').localeCompare(String(b[0].Kategorie||''), 'de-CH'); }
        else if (journalSortCol==='gegen') { res = getItemLabelFromTrans(a[0]).localeCompare(getItemLabelFromTrans(b[0]), 'de-CH', { numeric: true }); }
        else                               { res = dA - dB; }
        return journalSortDir==='asc' ? res : -res;
    });

    const statsEl = document.getElementById('journal-trans-stats');
    if (statsEl) {
        statsEl.innerHTML = (search || filterAktion)
            ? `<span class="text-primary fw-bold">Zeige ${groups.length}</span> Buchungsgruppen von ${rawTrans.length} Positionen`
            : `${groups.length} Buchungsgruppen (${rawTrans.length} Positionen)`;
    }

    let html = `<thead class="table-light"><tr class="border-bottom">
        ${sh('Datum','datum','col_datum')}
        ${sh('Mitglied','mitgl','col_mitglied')}
        ${sh('Aktion','aktion','col_aktion')}
        ${sh('Kategorie','kat','col_kategorie')}
        ${sh('Gegenstand','gegen','col_gegenstand')}
        ${sh('Bemerkung','bem','col_bemerkung')}
        <th class="text-center" data-col-id="col_aktionen" data-col-toggle="false">Aktionen</th>
    </tr></thead><tbody>`;

    if (groups.length === 0) {
        html += `<tr><td colspan="7" class="text-muted text-center py-4">Keine passenden Buchungen gefunden.</td></tr>`;
    } else {
        groups.forEach(group => {
            const rowspan = group.length;
            group.forEach((t, idx) => {
                const date       = formatCH(t.Zeitstempel);
                const mitglied   = getInventarNameFromId(t.Aktueller_Besitzer_ID);
                const aktion     = (t.Aktion||"").toUpperCase();
                const istStorno  = aktion === 'STORNO' || (t.Bemerkungen||'').includes('[STORNIERT]');
                const istVerkauf = aktion === 'VERKAUF';
                const istAusgabe = aktion === 'AUSGABE' || aktion === 'CHECKOUT';
                const invBadge   = (t.invoice_id || t.Invoice_ID) ? ` <span class="badge bg-light text-primary border ms-1" title="Verknüpfte Rechnung: ${t.invoice_id || t.Invoice_ID}"><i class="fas fa-file-invoice me-1"></i>${t.invoice_id || t.Invoice_ID}</span>` : '';
                let aktionBadge  = `<span class="badge bg-success-subtle text-success border border-success-subtle">Rückgabe</span>${invBadge}`;
                if (istStorno) {
                    aktionBadge  = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-bold"><i class="fas fa-ban me-1"></i>Storniert</span>${invBadge}`;
                } else if (istVerkauf) {
                    const methodeStr = t.Zahlungsart ? ` <span class="badge bg-light text-dark border ms-1">${t.Zahlungsart}</span>` : '';
                    aktionBadge  = `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle fw-bold">Verkauf</span>${methodeStr}${invBadge}`;
                } else if (istAusgabe) {
                    const pfandStr = parseFloat(t.Pfandbetrag) > 0 ? ` <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1" title="Pfand: CHF ${parseFloat(t.Pfandbetrag).toFixed(2)} (${t.Zahlungsart || '-'})">Pfand CHF ${parseFloat(t.Pfandbetrag).toFixed(2)}</span>` : '';
                    aktionBadge  = `<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Ausgabe</span>${pfandStr}${invBadge}`;
                } else if (parseFloat(t.Pfandbetrag) > 0) {
                    const retourStr = ` <span class="badge bg-light text-dark border ms-1">Pfand-Retour</span>`;
                    aktionBadge  = `<span class="badge bg-success-subtle text-success border border-success-subtle">Rückgabe</span>${retourStr}${invBadge}`;
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
                              class="btn btn-sm btn-outline-success py-1 px-2 rounded-2" title="Quittungs-PDF öffnen"><i class="fas fa-file-pdf"></i></a>`
                        : `<button class="btn btn-sm btn-outline-secondary py-1 px-2 rounded-2"
                                   title="PDF lokal generieren"
                                   onclick="regeneratePDF('${safeGroup}')"><i class="fas fa-file-pdf"></i></button>`;

                    const stornoBtn = isGroupCancelled
                        ? `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle py-1 px-2" title="Buchung bereits storniert">Storniert</span>`
                        : (canDelete() ? `<button class="btn btn-sm btn-outline-danger py-1 px-2 rounded-2"
                                    title="Buchung stornieren / rückgängig machen"
                                    onclick="storniereInventarBuchung('${safeGroup}')">
                                <i class="fas fa-undo me-1"></i>Storno
                            </button>` : '');

                    actionCell = `<td rowspan="${rowspan}" data-col-id="col_aktionen" class="text-center align-middle" style="white-space:nowrap;">
                        <div class="d-inline-flex gap-1 align-items-center">
                            ${pdfBtn}
                            ${stornoBtn}
                        </div>
                    </td>`;
                }
                html += `<tr>
                    <td data-col-id="col_datum"><span class="font-monospace small text-muted">${date}</span></td>
                    <td data-col-id="col_mitglied"><span class="fw-semibold text-dark">${mitglied}</span></td>
                    <td data-col-id="col_aktion">${aktionBadge}</td>
                    <td data-col-id="col_kategorie"><span class="badge bg-secondary-subtle text-secondary border">${kat}</span></td>
                    <td data-col-id="col_gegenstand">${gegenstand}</td>
                    <td data-col-id="col_bemerkung"><small class="text-muted">${t.Bemerkungen||'-'}</small></td>
                    ${actionCell}
                </tr>`;
            });
        });
    }
    transTable.innerHTML = html + "</tbody>";

    // TableKit-Initialisierung für Transaktionen
    if (window.TableKit?.makeColumnReorderable) {
        window.TableKit.makeColumnReorderable('#table-transaktionen', {
            storageKey: 'tk_inv_order_transaktionen',
            lockedColumns: ['col_aktionen']
        });
    }
    if (window.TableKit?.setupColumnToggle) {
        window.TableKit.setupColumnToggle('#table-transaktionen', {
            container: '#tk-toggle-transaktionen',
            storageKey: 'tk_inv_cols_transaktionen'
        });
    }
    if (window.TableKit?.makeResizable) {
        window.TableKit.makeResizable('#table-transaktionen', {
            storageKey: 'tk_inv_widths_transaktionen',
            columns: {
                'col_aktionen': { resizable: false, defaultWidth: 105 }
            }
        });
    }
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
    const sh = (l,c,id) => sortHeader(l,c,protokollSortCol,protokollSortDir,'sortProtokoll',id);

    const rawProt = inventarState?.protokoll || [];
    if (!rawProt.length) {
        logTable.innerHTML = `<thead class="table-light border-bottom"><tr>
            <th>Zeit</th><th>Nutzer</th><th>Aktion</th><th>Details</th>
        </tr></thead>
        <tbody><tr><td colspan="4" class="text-center text-muted py-4">Keine Admin-Aktionen protokolliert.</td></tr></tbody>`;
        const statsEl = document.getElementById('journal-protokoll-stats');
        if (statsEl) statsEl.innerText = '0 Einträge';
        return;
    }

    const search = (document.getElementById('inv-search-protokoll')?.value || '').toLowerCase().trim();

    let rows = rawProt.map(p => ({
        ts:      p.Zeitstempel,
        tsDate:  new Date(p.Zeitstempel||0),
        nutzer:  p['Nutzer (Vorstand)'] || '-',
        aktion:  p.Aktion  || '-',
        details: [p.Details, p['']].filter(v=>v&&v!=='').join(' | ') || '-'
    }));

    if (search) {
        rows = rows.filter(r =>
            r.nutzer.toLowerCase().includes(search) ||
            r.aktion.toLowerCase().includes(search) ||
            r.details.toLowerCase().includes(search) ||
            formatCHDateTime(r.ts).toLowerCase().includes(search)
        );
    }

    rows.sort((a, b) => {
        let res = 0;
        if      (protokollSortCol==='nutzer') { res = a.nutzer.localeCompare(b.nutzer, 'de-CH', { sensitivity: 'base' }); }
        else if (protokollSortCol==='akt' || protokollSortCol==='aktion') { res = a.aktion.localeCompare(b.aktion, 'de-CH'); }
        else if (protokollSortCol==='details') { res = a.details.localeCompare(b.details, 'de-CH'); }
        else                                  { res = a.tsDate - b.tsDate; }
        return protokollSortDir==='asc' ? res : -res;
    });

    const statsEl = document.getElementById('journal-protokoll-stats');
    if (statsEl) {
        statsEl.innerHTML = search
            ? `<span class="text-primary fw-bold">Zeige ${rows.length}</span> von ${rawProt.length} Einträgen`
            : `${rows.length} Protokoll-Einträge`;
    }

    let html = `<thead class="table-light"><tr class="border-bottom">
        ${sh('Zeit','zeit','col_zeit')}
        ${sh('Nutzer','nutzer','col_nutzer')}
        ${sh('Aktion','akt','col_aktion')}
        ${sh('Details','details','col_details')}
    </tr></thead><tbody>`;

    if (rows.length === 0) {
        html += `<tr><td colspan="4" class="text-center text-muted py-4">Keine passenden Protokolleinträge gefunden.</td></tr>`;
    } else {
        rows.forEach(r => {
            html += `<tr>
                <td data-col-id="col_zeit"><small class="text-muted font-monospace">${formatCHDateTime(r.ts)}</small></td>
                <td data-col-id="col_nutzer"><span class="fw-semibold text-dark">${r.nutzer}</span></td>
                <td data-col-id="col_aktion"><span class="badge bg-light text-primary border">${r.aktion}</span></td>
                <td data-col-id="col_details"><small class="text-secondary">${r.details}</small></td>
            </tr>`;
        });
    }
    logTable.innerHTML = html + "</tbody>";

    // TableKit-Initialisierung für Protokoll
    if (window.TableKit?.makeColumnReorderable) {
        window.TableKit.makeColumnReorderable('#table-protokoll', {
            storageKey: 'tk_inv_order_protokoll'
        });
    }
    if (window.TableKit?.setupColumnToggle) {
        window.TableKit.setupColumnToggle('#table-protokoll', {
            container: '#tk-toggle-protokoll',
            storageKey: 'tk_inv_cols_protokoll'
        });
    }
    if (window.TableKit?.makeResizable) {
        window.TableKit.makeResizable('#table-protokoll', {
            storageKey: 'tk_inv_widths_protokoll'
        });
    }
}

// Window-Exporte
window.sortAusleihen = sortAusleihen;
window.renderOffeneAusleihen = renderOffeneAusleihen;
window.sortTransaktionen = sortTransaktionen;
window.renderTransaktionenTable = renderTransaktionenTable;
window.sortProtokoll = sortProtokoll;
window.renderProtokollTable = renderProtokollTable;
window.renderJournalTables = renderJournalTables;
