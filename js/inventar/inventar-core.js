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

    try {
        const res = await apiFetch('inventar', 'action=getInventarData');
        console.log("📋 inventar response status:", res.status);
        const data = await res.json();
        console.log("📋 inventar response data:", data);
        inventarState = data;

        renderInventarUI(container);

        console.log("renderInventarUI Role:", userRole);
        console.log("canDelete inside render:", canDelete());
        
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
        window._inventarRequestedTab = null; // einmalig verwenden
        showInventarSection(lastTab);
        
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
    }
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

