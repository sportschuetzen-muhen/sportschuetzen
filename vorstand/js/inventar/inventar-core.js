// =========================================================
//  MODULE: INVENTAR - CORE
//  - State, Lade-Routine, Adressbuch-Sync, Berechtigungen & Helpers
// =========================================================

let inventarState    = null;
let sigPadMitglied, sigPadVorstand;
let warenkorb        = [];

// Sortier-State
let journalSortCol   = 'datum';   let journalSortDir   = 'desc';
let protokollSortCol = 'zeit';    let protokollSortDir = 'desc';
let ausleihenSortCol = 'seit';    let ausleihenSortDir = 'desc';
let bestandSortCol   = 'Status';
let bestandSortDir   = 'asc';

function canAdd() {
    const role = userRole || localStorage.getItem('portal_role');
    return ['admin','materialwart','schuetzenmeister'].includes(role);
}

function canDelete() {
    const role = userRole || localStorage.getItem('portal_role');
    return ['admin','materialwart'].includes(role);
}

// =========================================================
//  DATUM HELPER
// =========================================================
function formatCH(val) {
    if (!val || val === "" || val === 0) return '-';
    const d = new Date(val);
    if (!isNaN(d.getTime()))
        return d.toLocaleDateString('de-CH', { day:'2-digit', month:'2-digit', year:'numeric' });
    return val;
}

function formatCHDateTime(val) {
    if (!val || val === "" || val === 0) return '-';
    const d = new Date(val);
    if (!isNaN(d.getTime()))
        return d.toLocaleString('de-CH', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit'
        });
    return val;
}

// =========================================================
// =========================================================
//  SUPABASE CLIENT & MAPPERS
// =========================================================
function getInventarSupabaseClient() {
    if (typeof window.getSupabaseClient === 'function') {
        return window.getSupabaseClient();
    }
    return window.supabaseClient || null;
}
window.getInventarSupabaseClient = getInventarSupabaseClient;

function mapGewehrFromSupabase(r) {
    return {
        ID: r.id,
        Hersteller: r.manufacturer || '',
        Modell: r.model || '',
        Laufnummer: r.serial_number || '',
        Diopter: r.diopter || '',
        Ringkorn: r.front_sight || '',
        Zubehoer: r.accessories || '',
        Spezielles: r.special_notes || '',
        Distanz: r.caliber_distance || '50m',
        Eigentümer_ID: r.owner_person_id || '',
        Gespendet_ID: r.donor_person_id || '',
        Kauf_Spender_Jahr: r.purchase_year || '',
        Verkaeufer_ID: r.seller_person_id || '',
        Kaufpreis: r.purchase_price !== null && r.purchase_price !== undefined ? r.purchase_price : '',
        Depotbetrag: r.depot_amount || 0,
        Status: r.status || 'Im Lager',
        Aktueller_Besitzer_ID: r.current_owner_id ? String(r.current_owner_id) : ''
    };
}

function mapSchluesselFromSupabase(r) {
    return {
        ID: r.id,
        Bezeichnung: r.key_name || '',
        Nummer: r.key_number || '',
        Depotbetrag: r.depot_amount || 0,
        Status: r.status || 'Im Lager',
        Aktueller_Besitzer_ID: r.current_owner_id ? String(r.current_owner_id) : ''
    };
}

function mapKleidungFromSupabase(r) {
    return {
        ID: r.id,
        Typ: r.item_type || '',
        Groesse: r.size || '',
        Kaufdatum: r.purchase_date || '',
        Kaufpreis: r.purchase_price !== null && r.purchase_price !== undefined ? r.purchase_price : '',
        Depotbetrag: r.depot_amount || 0,
        Status: r.status || 'Im Lager',
        Aktueller_Besitzer_ID: r.current_owner_id ? String(r.current_owner_id) : ''
    };
}

function mapSchiessbekleidungFromSupabase(r) {
    return {
        ID: r.id,
        Typ: r.item_type || '',
        Groesse: r.size || '',
        Kaufdatum: r.purchase_date || '',
        Kaufpreis: r.purchase_price !== null && r.purchase_price !== undefined ? r.purchase_price : '',
        Depotbetrag: r.depot_amount || 0,
        Status: r.status || 'Im Lager',
        Aktueller_Besitzer_ID: r.current_owner_id ? String(r.current_owner_id) : ''
    };
}

function mapTransaktionFromSupabase(t) {
    return {
        ID: t.legacy_id || t.id,
        Zeitstempel: t.timestamp,
        Besitzer_ID: t.member_id ? String(t.member_id) : '',
        Aktueller_Besitzer_ID: t.member_id ? String(t.member_id) : '',
        Aktion: t.action,
        Inventar_ID: t.item_id || '',
        Kategorie: t.category || '',
        Zustand_Abgabe: t.condition_out || '',
        Zustand_Rueckgabe: t.condition_in || '',
        Bemerkungen: t.notes || '',
        Verantwortliche_ID: t.responsible_person || '',
        Pfandbetrag: t.deposit_amount || 0,
        Pfand_einnahme: t.deposit_received || '-',
        Pfand_retour_bezahlt: t.deposit_returned || '-',
        Sig_Vorstand: t.sig_board_url || '',
        Unterschrift_URL: t.sig_member_url || '',
        PDF_URL: t.pdf_url || '',
        Zahlungsart: t.payment_method || '-'
    };
}

function mapPfandFromSupabase(p) {
    return {
        ID: p.id,
        Mitglied_ID: p.member_id ? String(p.member_id) : '',
        Inventar_ID: p.item_id || '',
        Kategorie: p.category || '',
        Betrag: p.amount || 0,
        Datum_Ausgabe: p.date_out,
        Datum_Einnahme: p.date_out,
        Datum_Rueckgabe: p.date_returned,
        Status: p.status || 'Offen',
        Zahlungsart: p.payment_method || '-'
    };
}

function mapLogFromSupabase(l) {
    return {
        Zeitstempel: l.timestamp,
        'Nutzer (Vorstand)': l.user_name || '-',
        Aktion: l.action || '-',
        Details: l.details || '-'
    };
}

// =========================================================
//  ENTRYPOINT
// =========================================================
async function loadInventarData(force = false) {
    const container = document.getElementById('inventar-container');
    if (!container) return;

    if (!force && inventarState && container.querySelector('.nav-btn')) {
        console.log("⚡ loadInventarData: Lade aus lokalem Cache...");
        return;
    }

    container.innerHTML = `
        <div class="text-center p-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Lade Inventar...</p>
        </div>`;

    // 1. SUPABASE FIRST: Schneller relationaler Abruf
    const supa = getInventarSupabaseClient();
    if (supa) {
        try {
            const { data: items, error: itemsErr } = await supa
                .from('inventory_items')
                .select('*')
                .order('id', { ascending: true });

            if (!itemsErr && Array.isArray(items) && items.length > 0) {
                console.log(`✅ ${items.length} Inventar-Objekte aus Supabase geladen.`);

                // Begleitende Daten parallel laden
                const [transRes, pfandRes, logRes, confRes, membersRes] = await Promise.all([
                    supa.from('inventory_transactions').select('*').order('timestamp', { ascending: false }).limit(250),
                    supa.from('inventory_deposits').select('*').order('date_out', { ascending: false }),
                    supa.from('inventory_audit_log').select('*').order('timestamp', { ascending: false }).limit(60),
                    supa.from('inventory_config').select('*').order('sort_order', { ascending: true }),
                    (window._mglData && window._mglData.length > 0)
                        ? Promise.resolve({ data: window._mglData })
                        : supa.from('members').select('person_number, first_name, last_name, primary_email, birth_date, is_active, is_passive, deceased').order('last_name')
                ]);

                // Mitglieder-Lookup aufbereiten
                let rawMembers = membersRes.data || window._mglData || [];
                const mappedMembers = rawMembers.map(m => ({
                    ID: String(m.person_number || m.PersonNumber),
                    PersonNumber: m.person_number || m.PersonNumber,
                    Vorname: m.first_name || m.FirstName || '',
                    Nachname: m.last_name || m.LastName || '',
                    email: m.primary_email || m.PrimaryEmail || '',
                    BirthDate: m.birth_date || m.BirthDate || '',
                    Status: (m.deceased || m.Deceased) ? 'Verstorben' : ((m.is_active || m.IsActive) && !(m.is_passive || m.IsPassive) ? 'Aktiv' : ((m.is_passive || m.IsPassive) ? 'Passiv' : 'Ehemalig'))
                }));

                // Dropdown-Konfiguration aufbereiten
                const confList = confRes.data || [];
                const configRows = [];
                const configKeys = ['Transaktion_Zustand', 'Schluessel_Bezeichnung', 'Gewehre_Distanz', 'Kleidung_Typ', 'Schiessbekleidung_Typ', 'Kleidung_Schiessbekleidung_Groesse'];
                const maxRows = Math.max(...configKeys.map(k => confList.filter(c => c.config_key === k).length), 0);
                for (let i = 0; i < maxRows; i++) {
                    const row = {};
                    configKeys.forEach(k => {
                        const matches = confList.filter(c => c.config_key === k);
                        row[k] = matches[i]?.value || '';
                    });
                    configRows.push(row);
                }

                inventarState = {
                    gewehre: items.filter(i => i.category === 'gewehr').map(mapGewehrFromSupabase),
                    schluessel: items.filter(i => i.category === 'schluessel').map(mapSchluesselFromSupabase),
                    kleidung: items.filter(i => i.category === 'kleidung').map(mapKleidungFromSupabase),
                    schiessbekleidung: items.filter(i => i.category === 'schiessbekleidung').map(mapSchiessbekleidungFromSupabase),
                    transaktionen: (transRes.data || []).map(mapTransaktionFromSupabase),
                    pfand: (pfandRes.data || []).map(mapPfandFromSupabase),
                    protokoll: (logRes.data || []).map(mapLogFromSupabase),
                    config: configRows,
                    mitglieder: mappedMembers,
                    _isSupabase: true
                };

                initInventarUI(container);
                return;
            } else if (itemsErr) {
                throw new Error(itemsErr.message || "Fehler beim Laden von inventory_items");
            }
        } catch (supaErr) {
            console.error("Supabase Abfrage für Inventar fehlgeschlagen:", supaErr);
            container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Fehler beim Laden aus Supabase: ${supaErr.message}</div>`;
            return;
        }
    }

    // 2. FALLBACK: Aus Google Apps Script laden (DEAKTIVIERT - Supabase ist Single Source of Truth)
    /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
    try {
        const res = await apiFetch('inventar', 'action=getInventarData');
        const data = await res.json();
        inventarState = data;
        inventarState._isSupabase = false;

        initInventarUI(container);

        // Falls Supabase erreichbar ist, aber noch leer war, Einladungs-Banner einblenden
        if (supa && (!inventarState._isSupabase)) {
            const banner = document.createElement('div');
            banner.className = 'alert alert-info border-info d-flex justify-content-between align-items-center flex-wrap gap-2 my-3 rounded-3 shadow-sm';
            banner.innerHTML = `
                <div>
                    <strong class="text-primary"><i class="fas fa-database me-2"></i>Supabase-Migration bereit:</strong> 
                    Aktuell werden die Daten noch aus Google Sheets geladen. Du kannst alle Gewehre, Schlüssel, Kleider & Transaktionen jetzt mit 1 Klick nach Supabase übernehmen!
                </div>
                <button class="btn btn-sm btn-primary fw-bold" onclick="syncInventarFromLegacy()">
                    <i class="fas fa-cloud-upload-alt me-1"></i> Jetzt nach Supabase migrieren
                </button>
            `;
            const headerNav = container.querySelector('.d-flex.flex-wrap.gap-2.mb-4');
            if (headerNav) headerNav.after(banner);
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
    }
    ------------------------------------------------------- */
}

function initInventarUI(container) {
    renderInventarUI(container);

    const label = document.getElementById('inv-verantwortlicher-label');
    if (label) label.innerText = currentUser;

    const canvasMitglied = document.getElementById('sig-mitglied');
    const canvasVorstand = document.getElementById('sig-vorstand');
    if (canvasMitglied) sigPadMitglied = new SignaturePad(canvasMitglied);
    if (canvasVorstand) sigPadVorstand = new SignaturePad(canvasVorstand);

    fillInventarDropdowns();
    renderJournalTables();

    // Aktiv-Tab wiederherstellen
    const requestedTab = window._inventarRequestedTab || null;
    const lastTab = requestedTab || localStorage.getItem('inventar-activeTab') || 'ausgabe';
    window._inventarRequestedTab = null;
    showInventarSection(lastTab);
}

// =========================================================
//  1-KLICK SYNC VON GOOGLE SHEETS NACH SUPABASE (DEAKTIVIERT - Cut-Over vollzogen)
// =========================================================
async function syncInventarFromLegacy() {
    /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
    const supa = getInventarSupabaseClient();
    if (!supa) {
        alert("❌ Supabase-Verbindung nicht verfügbar.");
        return;
    }

    if (!confirm("Möchtest du alle Gewehre, Schlüssel, Kleider, Transaktionen und Pfand-Einträge aus dem Google Sheet nach Supabase importieren?")) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'position-fixed bottom-0 end-0 p-3';
    toast.style.zIndex = '9999';
    toast.innerHTML = `
        <div class="toast show align-items-center text-white bg-primary border-0 shadow-lg" role="alert">
            <div class="d-flex p-3 align-items-center">
                <div class="spinner-border spinner-border-sm text-light me-3"></div>
                <div id="inv-sync-status-msg">Lade Daten aus Google Sheet...</div>
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    const statusMsg = document.getElementById('inv-sync-status-msg');

    try {
        setInventarBusy(true);

        // 1. Daten aus GAS abrufen
        statusMsg.innerText = "Lese Bestände und Transaktionen aus Google Sheets...";
        const res = await apiFetch('inventar', 'action=getInventarData');
        const legacy = await res.json();

        // 2. Artikel zusammenstellen
        statusMsg.innerText = "Konvertiere Inventar-Gegenstände...";
        const allItems = [];

        (legacy.gewehre || []).forEach(g => {
            if (!g.ID) return;
            allItems.push({
                id: String(g.ID).trim(),
                category: 'gewehr',
                status: g.Status || 'Im Lager',
                current_owner_id: (g.Aktueller_Besitzer_ID && parseInt(g.Aktueller_Besitzer_ID) > 0) ? parseInt(g.Aktueller_Besitzer_ID) : null,
                depot_amount: parseFloat(g.Depotbetrag) || 0,
                purchase_price: parseFloat(g.Kaufpreis) || null,
                purchase_year: g.Kauf_Spender_Jahr ? String(g.Kauf_Spender_Jahr) : null,
                manufacturer: g.Hersteller || null,
                model: g.Modell || null,
                serial_number: g.Laufnummer || null,
                diopter: g.Diopter || null,
                front_sight: g.Ringkorn || null,
                accessories: g.Zubehoer || null,
                special_notes: g.Spezielles || null,
                caliber_distance: g.Distanz || '50m',
                owner_person_id: g.Eigentümer_ID ? String(g.Eigentümer_ID) : null,
                donor_person_id: g.Gespendet_ID ? String(g.Gespendet_ID) : null,
                seller_person_id: g.Verkaeufer_ID ? String(g.Verkaeufer_ID) : null
            });
        });

        (legacy.schluessel || []).forEach(s => {
            if (!s.ID) return;
            allItems.push({
                id: String(s.ID).trim(),
                category: 'schluessel',
                status: s.Status || 'Im Lager',
                current_owner_id: (s.Aktueller_Besitzer_ID && parseInt(s.Aktueller_Besitzer_ID) > 0) ? parseInt(s.Aktueller_Besitzer_ID) : null,
                depot_amount: parseFloat(s.Depotbetrag) || 0,
                key_name: s.Bezeichnung || '',
                key_number: s.Nummer ? String(s.Nummer) : null
            });
        });

        (legacy.kleidung || []).forEach(k => {
            if (!k.ID) return;
            allItems.push({
                id: String(k.ID).trim(),
                category: 'kleidung',
                status: k.Status || 'Im Lager',
                current_owner_id: (k.Aktueller_Besitzer_ID && parseInt(k.Aktueller_Besitzer_ID) > 0) ? parseInt(k.Aktueller_Besitzer_ID) : null,
                depot_amount: parseFloat(k.Depotbetrag) || 0,
                purchase_price: parseFloat(k.Kaufpreis) || null,
                purchase_date: k.Kaufdatum ? formatISODateSafe(k.Kaufdatum) : null,
                item_type: k.Typ || '',
                size: k.Groesse || ''
            });
        });

        (legacy.schiessbekleidung || []).forEach(sb => {
            if (!sb.ID) return;
            allItems.push({
                id: String(sb.ID).trim(),
                category: 'schiessbekleidung',
                status: sb.Status || 'Im Lager',
                current_owner_id: (sb.Aktueller_Besitzer_ID && parseInt(sb.Aktueller_Besitzer_ID) > 0) ? parseInt(sb.Aktueller_Besitzer_ID) : null,
                depot_amount: parseFloat(sb.Depotbetrag) || 0,
                purchase_price: parseFloat(sb.Kaufpreis) || null,
                purchase_date: sb.Kaufdatum ? formatISODateSafe(sb.Kaufdatum) : null,
                item_type: sb.Typ || '',
                size: sb.Groesse || ''
            });
        });

        statusMsg.innerText = `Übertrage ${allItems.length} Inventargegenstände nach Supabase...`;
        if (allItems.length > 0) {
            const { error: itemsErr } = await supa
                .from('inventory_items')
                .upsert(allItems, { onConflict: 'id' });
            if (itemsErr) console.warn("Warnung beim Item-Upsert:", itemsErr.message);
        }

        // 3. Transaktionen importieren
        statusMsg.innerText = "Übertrage Transaktions-Journal...";
        const transRows = (legacy.transaktionen || []).map((t, idx) => ({
            legacy_id: String(idx + 1),
            timestamp: t.Zeitstempel ? new Date(t.Zeitstempel).toISOString() : new Date().toISOString(),
            action: t.Aktion || 'AUSGABE',
            member_id: (t.Besitzer_ID && parseInt(t.Besitzer_ID) > 0) ? parseInt(t.Besitzer_ID) : null,
            item_id: t.Inventar_ID ? String(t.Inventar_ID).trim() : null,
            category: t.Kategorie || null,
            condition_out: t.Zustand_Abgabe || null,
            condition_in: t.Zustand_Rueckgabe || null,
            notes: t.Bemerkungen || null,
            responsible_person: t.Verantwortliche_ID || null,
            deposit_amount: parseFloat(t.Pfandbetrag) || 0,
            deposit_received: t.Pfand_einnahme || '-',
            deposit_returned: t.Pfand_retour_bezahlt || '-',
            payment_method: t.Zahlungsart || '-',
            sig_board_url: t.Sig_Vorstand || null,
            sig_member_url: t.Unterschrift_URL || null,
            pdf_url: t.PDF_URL || null
        }));

        if (transRows.length > 0) {
            // In Blöcken von 50 schreiben
            for (let i = 0; i < transRows.length; i += 50) {
                const chunk = transRows.slice(i, i + 50);
                await supa.from('inventory_transactions').insert(chunk);
            }
        }

        // 4. Pfand importieren
        statusMsg.innerText = "Übertrage Kautions- & Pfandkasse...";
        const pfandRows = (legacy.pfand || []).map((p, idx) => ({
            id: p.ID ? String(p.ID).trim() : `P-${idx + 1}`,
            member_id: (p.Mitglied_ID && parseInt(p.Mitglied_ID) > 0) ? parseInt(p.Mitglied_ID) : null,
            item_id: p.Inventar_ID ? String(p.Inventar_ID).trim() : null,
            category: p.Kategorie || null,
            amount: parseFloat(p.Betrag) || 0,
            date_out: p.Datum_Ausgabe || p.Datum_Einnahme ? new Date(p.Datum_Ausgabe || p.Datum_Einnahme).toISOString() : new Date().toISOString(),
            date_returned: p.Datum_Rueckgabe ? new Date(p.Datum_Rueckgabe).toISOString() : null,
            status: p.Status || 'Offen',
            payment_method: p.Zahlungsart || 'Bar'
        })).filter(p => p.member_id !== null);

        if (pfandRows.length > 0) {
            const { error: pfandErr } = await supa
                .from('inventory_deposits')
                .upsert(pfandRows, { onConflict: 'id' });
            if (pfandErr) console.warn("Warnung beim Pfand-Upsert:", pfandErr.message);
        }

        // 5. Protokoll importieren
        statusMsg.innerText = "Übertrage Revisions-Protokoll...";
        const auditRows = (legacy.protokoll || []).map(pr => ({
            timestamp: pr.Zeitstempel ? new Date(pr.Zeitstempel).toISOString() : new Date().toISOString(),
            user_name: pr['Nutzer (Vorstand)'] || pr.Verantwortlicher || 'System',
            action: pr.Aktion || 'Aktion',
            details: [pr.Details, pr['']].filter(Boolean).join(' | ') || null
        }));

        if (auditRows.length > 0) {
            for (let i = 0; i < auditRows.length; i += 50) {
                const chunk = auditRows.slice(i, i + 50);
                await supa.from('inventory_audit_log').insert(chunk);
            }
        }

        toast.remove();
        alert(`✅ Migration nach Supabase erfolgreich!\n\n${allItems.length} Inventar-Artikel\n${transRows.length} Transaktionen\n${pfandRows.length} Pfand-Positionen\n${auditRows.length} Protokoll-Einträge übernommen.`);
        await loadInventarData(true);

    } catch (err) {
        toast.remove();
        alert("❌ Fehler bei der Migration nach Supabase: " + err.message);
    } finally {
        setInventarBusy(false);
    }
    ------------------------------------------------------- */
    alert("ℹ️ Hinweis: Der Google-Sheets-Import ist deaktiviert. Das Inventar läuft autark auf Supabase (Single Source of Truth).");
}
window.syncInventarFromLegacy = syncInventarFromLegacy;

function formatISODateSafe(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return null;
}

// =========================================================
//  TEARDOWN
// =========================================================
function teardownInventar() {
    sigPadMitglied = null;
    sigPadVorstand = null;
    warenkorb      = [];
}

// =========================================================
//  BUSY STATE
// =========================================================
function setInventarBusy(status) {
    document.querySelectorAll('.inv-submit').forEach(b => b.disabled = status);
}

// =========================================================
//  SYNC MEMBERS
// =========================================================
async function syncInventarMembers() {
    // Adressbuch-Sync via Google Apps Script (DEAKTIVIERT - Supabase public.members ist live angebunden)
    /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
    if (!confirm("SSV-Daten abrufen und Inventar-Adressbuch aktualisieren?\n\nDies betrifft nur Aktive und Passive aus der zentralen Datenbank. Externe Personen/Spender bleiben erhalten.")) return;
    
    const btn = document.getElementById('btn-sync-members');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Synchronisiere...';
    btn.disabled = true;
    setInventarBusy(true);
    
    try {
        const res = await apiFetch('inventar', '', {
            method: 'POST',
            body: JSON.stringify({ action: "syncMembers" })
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            alert("✅ " + data.message);
            await loadInventarData(); // Daten neu laden und UI aktualisieren
        } else {
            alert("❌ Fehler: " + data.message);
        }
    } catch(e) {
        alert("❌ Verbindungsfehler: " + e.message);
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
        setInventarBusy(false);
    }
    ------------------------------------------------------- */
    alert("ℹ️ Hinweis: Das Inventar ist direkt mit der Supabase-Mitgliederdatenbank (public.members) verknüpft. Ein manueller Sync mit Google Sheets ist nicht mehr erforderlich.");
}

// =========================================================
//  COMMON INVENTORY HELPERS
// =========================================================
function getInventarNameFromId(id) {
    if (!id || id === "" || id === 0 || id === "0") return '-';
    if (!inventarState?.mitglieder) return String(id);
    const m = inventarState.mitglieder.find(
        member => member.ID.toString() === id.toString()
    );
    return m ? `${m.Nachname} ${m.Vorname}` : String(id);
}

function getItemLabel(kat, item) {
    if (!item) return '-';
    if (kat === 'gewehr')
        return `${item.Hersteller||''} ${item.Modell||''} (${item.Laufnummer||'-'})`.trim();
    if (kat === 'schluessel')
        return `${item.Bezeichnung||''} (${item.Nummer||'-'})`.trim();
    return `${item.Typ||''} (${item.Groesse||'-'})`.trim();
}

function getItemLabelFromTrans(t) {
    if (!t?.Inventar_ID) return '-';
    const kat    = (t.Kategorie || "").toLowerCase();
    const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                     "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    const key    = keyMap[kat];
    if (!key || !inventarState[key]) return String(t.Inventar_ID);
    const item   = inventarState[key].find(
        i => i.ID.toString() === t.Inventar_ID.toString() ||
             parseInt(i.ID) === parseInt(t.Inventar_ID)
    );
    return item ? getItemLabel(kat, item) : String(t.Inventar_ID);
}

function sortHeader(label, col, currentCol, currentDir, callbackFn) {
    const arrow = currentCol === col
        ? (currentDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
    return `<th style="cursor:pointer;user-select:none;white-space:nowrap"
                onclick="${callbackFn}('${col}')">
                ${label}<span class="text-muted small">${arrow}</span>
            </th>`;
}

