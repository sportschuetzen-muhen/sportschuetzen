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

