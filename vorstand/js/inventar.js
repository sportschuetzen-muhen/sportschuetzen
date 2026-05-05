// =========================================================
//  MODULE: INVENTAR
// =========================================================

let inventarState    = null;
let sigPadMitglied, sigPadVorstand;
let warenkorb        = [];

// Sortier-State
let journalSortCol   = 'datum';   let journalSortDir   = 'desc';
let protokollSortCol = 'zeit';    let protokollSortDir = 'desc';
let ausleihenSortCol = 'seit';    let ausleihenSortDir = 'desc';
let bestandSortCol = 'Status';
let bestandSortDir = 'asc';

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
//  ENTRY
// =========================================================
async function loadInventarData() {
    const container = document.getElementById('inventar-container');
    if (!container) return;

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
        ;
        renderJournalTables();

       // NEU:
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
    inventarState  = null;
    sigPadMitglied = null;
    sigPadVorstand = null;
    warenkorb      = [];
}


// =========================================================
//  UI SHELL
// =========================================================
function renderInventarUI(container) {
    container.innerHTML = `
        <style>
            #inventar-container .sig-container {
                border:1px solid #ccc; background:white;
                height:150px; border-radius:8px; overflow:hidden;
            }
            #inventar-container canvas {
                width:100% !important; height:100% !important; touch-action:none;
            }
            #inventar-container .nav-btn { font-weight:bold; border-radius:10px; padding:8px 16px; }
            #inventar-container .table-sm { font-size:0.85rem; }
            .warenkorb-card { border:2px dashed #0d6efd; border-radius:10px; background:#f8f9ff; }
        </style>

        <div class="d-flex flex-wrap gap-2 mb-4">
            <button class="btn btn-primary nav-btn" id="inv-btn-ausgabe"
                    onclick="localStorage.setItem('inventar-activeTab','ausgabe'); showInventarSection('ausgabe')">
                📤 Buchung
            </button>
            <button class="btn btn-outline-secondary nav-btn" id="inv-btn-journal"
                    onclick="localStorage.setItem('inventar-activeTab','journal'); showInventarSection('journal')">
                📖 Journal
            </button>
            <button class="btn btn-outline-secondary nav-btn" id="inv-btn-liste"
                    onclick="localStorage.setItem('inventar-activeTab','liste'); showInventarSection('liste')">
                ✏️ Bestand
            </button>
            <button class="btn btn-outline-secondary nav-btn" id="inv-btn-finanzen"
                    onclick="localStorage.setItem('inventar-activeTab','finanzen'); showInventarSection('finanzen')">
                💰 Finanzen
            </button>
         ${canAdd() ? `
<button class="btn btn-outline-dark nav-btn" id="inv-btn-admin"
        onclick="localStorage.setItem('inventar-activeTab','admin'); showInventarSection('admin')">
    ➕ Admin
</button>` : ''}
        </div>

        <!-- SECTION: BUCHUNG -->
        <div id="inv-section-ausgabe" class="inv-section">
            <div class="card border-0 shadow-sm p-4">
                <form id="form-ausgabe" onsubmit="handleInventarSubmit(event)">
                    <div class="row g-3">

                        <!-- Links: Artikel erfassen -->
                        <div class="col-md-4 border-end">
                            <h6 class="fw-bold text-muted mb-3 text-uppercase">Artikel erfassen</h6>

                            <label class="form-label fw-bold">Aktion</label>
                            <select id="select-action" class="form-select mb-3"
                                    onchange="toggleBookingFields(); warenkorb=[]; renderWarenkorb();">
                                <option value="checkout">📤 Ausgabe</option>
                                <option value="checkin">📥 Rückgabe</option>
                            </select>

                            <label class="form-label fw-bold">Mitglied</label>
                            <select id="select-mitglied" class="form-select mb-3"
                                    onchange="updateSubOptions()" required></select>

                            <label class="form-label fw-bold">Kategorie</label>
                            <select id="select-kategorie" class="form-select mb-3"
                                    onchange="updateSubOptions()">
                                <option value="gewehr">Gewehr</option>
                                <option value="schluessel">Schlüssel</option>
                                <option value="kleidung">Kleidung</option>
                                <option value="schiessbekleidung">Schiessbekleidung</option>
                            </select>

                            <label class="form-label fw-bold">Gegenstand</label>
                            <select id="select-gegenstand" class="form-select mb-3"></select>

                            <div id="container-zustand-abgabe">
                                <label class="form-label fw-bold text-primary">Zustand bei Abgabe</label>
                                <select id="select-zustand-abgabe" class="form-select mb-3"></select>
                            </div>
                            <div id="container-zustand-rueckgabe" class="d-none">
                                <label class="form-label fw-bold text-danger">Zustand bei Rückgabe</label>
                                <select id="select-zustand-rueckgabe" class="form-select mb-3"></select>
                            </div>

                            <div class="row g-2 mb-3">
                                <div class="col-6">
                                    <label class="form-label fw-bold small">Pfandbetrag CHF</label>
                                    <input type="number" id="pfand-betrag" class="form-control"
                                           placeholder="0.00" step="0.01">
                                </div>
                                <div class="col-6" id="container-pfand-einnahme">
                                    <label class="form-label fw-bold small">Einnahme</label>
                                    <select id="pfand-einnahme" class="form-select">
                                        <option value="Nein">Nein</option>
                                        <option value="Ja">Ja</option>
                                    </select>
                                </div>
                                <div class="col-6 d-none" id="container-pfand-retour">
                                    <label class="form-label fw-bold small">Retour bezahlt</label>
                                    <select id="pfand-retour" class="form-select">
                                        <option value="Nein">Nein</option>
                                        <option value="Ja">Ja</option>
                                    </select>
                                </div>
                            </div>

                            <button type="button" class="btn btn-outline-primary w-100"
                                    onclick="warenkorbAdd()">
                                ＋ Zum Warenkorb hinzufügen
                            </button>
                        </div>

                        <!-- Mitte: Warenkorb + Bemerkungen -->
                        <div class="col-md-4 border-end">
                            <h6 class="fw-bold text-muted mb-3 text-uppercase">🛒 Warenkorb</h6>
                            <div class="warenkorb-card p-3 mb-3">
                                <div id="warenkorb-list">
                                    <p class="text-muted small mb-0">Noch keine Gegenstände.</p>
                                </div>
                            </div>
                            <label class="form-label fw-bold">Bemerkungen</label>
                            <textarea id="trans-bemerkungen" class="form-control" rows="4"></textarea>
                        </div>

                        <!-- Rechts: Unterschriften -->
                        <div class="col-md-4">
                            <h6 class="fw-bold text-muted mb-3 text-uppercase">Unterschriften</h6>

                            <label class="form-label fw-bold">Mitglied</label>
                            <div class="sig-container mb-1">
                                <canvas id="sig-mitglied"></canvas>
                            </div>
                            <button type="button" class="btn btn-sm btn-link text-danger p-0 mb-3"
                                    onclick="sigPadMitglied.clear()">Löschen</button>

                            <div class="alert alert-light border py-2 mb-3 small">
                                <i class="fas fa-user-check text-success"></i>
                                Verantwortlich:<br>
                                <strong id="inv-verantwortlicher-label"></strong>
                            </div>

                            <label class="form-label fw-bold">Vorstand</label>
                            <div class="sig-container mb-1">
                                <canvas id="sig-vorstand"></canvas>
                            </div>
                            <button type="button" class="btn btn-sm btn-link text-danger p-0"
                                    onclick="sigPadVorstand.clear()">Löschen</button>
                        </div>
                    </div>

                    <button type="submit" id="btn-warenkorb-submit" disabled
                            class="btn btn-success w-100 mt-4 py-3 fw-bold inv-submit">
                        ✅ Warenkorb buchen &amp; Quittung erstellen
                    </button>
                </form>
            </div>
        </div>

        <!-- SECTION: BESTAND -->
        <div id="inv-section-liste" class="inv-section d-none">
            <div class="card border-0 shadow-sm p-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4>Bestandsliste</h4>
                    <select id="filter-liste" class="form-select w-auto"
                            onchange="renderInventoryTable()">
                        <option value="Inventar_Gewehre">Gewehre</option>
                        <option value="Inventar_Schluessel">Schlüssel</option>
                        <option value="Inventar_Kleidung">Kleidung</option>
                        <option value="Inventar_Schiessbekleidung">Schiessbekleidung</option>
                        <option value="Personendaten">Mitglieder</option>
                    </select>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover table-sm align-middle"
                           id="inventory-table"></table>
                </div>
            </div>
        </div>

        <!-- SECTION: FINANZEN -->
        <div id="inv-section-finanzen" class="inv-section d-none">
            <div class="row g-3 mb-4" id="finanz-stats"></div>
            <div class="card border-0 shadow-sm p-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4>Pfand-Journal (Offen)</h4>
                    <button class="btn btn-sm btn-outline-secondary" onclick="renderFinanzen()">
                        <i class="fas fa-sync"></i>
                    </button>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover table-sm align-middle" id="pfand-table">
                        <thead class="table-dark">
                            <tr>
                                <th>Datum</th>
                                <th>Mitglied</th>
                                <th>Kategorie</th>
                                <th>Gegenstand</th>
                                <th class="text-end">Betrag</th>
                            </tr>
                        </thead>
                        <tbody id="pfand-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- SECTION: JOURNAL -->
        <div id="inv-section-journal" class="inv-section d-none">
            <div class="card border-0 shadow-sm p-4 mb-4">
                <h4>📖 Material-Bewegungen</h4>
                <div class="table-responsive">
                    <table class="table table-hover table-sm" id="table-transaktionen"></table>
                </div>
            </div>
            <div class="card border-0 shadow-sm p-4">
                <h4>🛡️ Admin-Protokoll</h4>
                <div class="table-responsive">
                    <table class="table table-hover table-sm text-muted" id="table-protokoll"></table>
                </div>
            </div>
        </div>

        <!-- SECTION: ADMIN (nur für admin/materialwart) -->
        ${canAdd() ? `
        <div id="inv-section-admin" class="inv-section d-none">
            <div class="card border-0 shadow-sm p-4">
                <h4>Neuen Eintrag erfassen</h4>
                <select id="admin-target" class="form-select mb-4"
                        onchange="renderAdminFields(this.value)">
                    <option value="">-- Typ wählen --</option>
                    <option value="Personendaten">👤 Mitglied</option>
                    <option value="Inventar_Gewehre">🔫 Gewehr</option>
                    <option value="Inventar_Schluessel">🔑 Schlüssel</option>
                    <option value="Inventar_Kleidung">👕 Kleidung</option>
                    <option value="Inventar_Schiessbekleidung">🎯 Schiessbekleidung</option>
                </select>
                <form id="adminForm" onsubmit="saveNewInventarItem(event)">
                    <div id="dynamic-fields" class="row"></div>
                    <button type="submit" class="btn btn-success mt-4 d-none inv-submit"
                            id="btn-admin-save">Speichern</button>
                </form>
            </div>

            <div class="card border-0 shadow-sm p-4 mt-4">
                <h4>🔄 Adressbuch synchronisieren</h4>
                <p class="text-muted small">Aktualisiert die Personendaten mit der zentralen SSV-Mitgliederdatenbank. Spender und externe Personen bleiben erhalten.</p>
                <button type="button" class="btn btn-outline-primary" onclick="syncInventarMembers()" id="btn-sync-members">
                    <i class="fas fa-sync-alt me-2"></i>SSV-Daten jetzt synchronisieren
                </button>
            </div>
        </div>` : ''}
    `;
}

// =========================================================
//  NAV
// =========================================================
function showInventarSection(id) {
    localStorage.setItem('inventar-activeTab', id);
    document.querySelectorAll('.inv-section').forEach(s => s.classList.add('d-none'));
    const el = document.getElementById('inv-section-' + id);
    if (el) el.classList.remove('d-none');
    document.querySelectorAll('#inventar-container .nav-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline-secondary');
    });
    const active = document.getElementById('inv-btn-' + id);
    if (active) {
        active.classList.remove('btn-outline-secondary');
        active.classList.add('btn-primary');
    }

    // Render-Trigger beim Tab-Wechsel
    if (id === 'liste') renderInventoryTable();
    if (id === 'finanzen') renderFinanzen();
    if (id === 'journal') renderJournalTables();
}


// =========================================================
//  DROPDOWNS
// =========================================================
function fillInventarDropdowns() {
    if (!inventarState?.mitglieder) return;

    // Finde alle IDs, die aktuell etwas ausgeliehen haben
    const currentPossessors = new Set();
    ['gewehre','schluessel','kleidung','schiessbekleidung'].forEach(k => {
        (inventarState[k] || []).forEach(i => {
            if (i.Aktueller_Besitzer_ID && i.Aktueller_Besitzer_ID != "0" && i.Aktueller_Besitzer_ID != "") {
                currentPossessors.add(i.Aktueller_Besitzer_ID.toString());
            }
        });
    });

    const sorted = [...inventarState.mitglieder]
      .filter(m => {
          const isAktivPassiv = (m.Status === 'Aktiv' || m.Status === 'Passiv');
          const hasMaterial = currentPossessors.has(m.ID.toString());
          return isAktivPassiv || hasMaterial;
      })
      .sort((a, b) => a.Nachname.localeCompare(b.Nachname));
    
    document.getElementById('select-mitglied').innerHTML =
        '<option value="">-- wählen --</option>' +
        sorted.map(m => {
            let label = `${m.Nachname} ${m.Vorname}`;
            if (m.Status === 'Verstorben') label += ' †';
            else if (m.Status === 'Ehemalig') label += ' (Ehem.)';
            else if (m.Status === 'Passiv') label += ' (Passiv)';
            return `<option value="${m.ID}">${label}</option>`;
        }).join('');

    if (inventarState.config) {
        const zOpts = '<option value="">-- wählen --</option>' +
            inventarState.config.map(c => c.Transaktion_Zustand).filter(v => v)
                .map(v => `<option value="${v}">${v}</option>`).join('');
        document.getElementById('select-zustand-abgabe').innerHTML    = zOpts;
        document.getElementById('select-zustand-rueckgabe').innerHTML = zOpts;
    }
    updateSubOptions();
}

function toggleBookingFields() {
    const isCheckout = document.getElementById('select-action').value === 'checkout';
    document.getElementById('container-zustand-abgabe').classList.toggle('d-none', !isCheckout);
    document.getElementById('container-zustand-rueckgabe').classList.toggle('d-none', isCheckout);
    document.getElementById('container-pfand-einnahme').classList.toggle('d-none', !isCheckout);
    document.getElementById('container-pfand-retour').classList.toggle('d-none', isCheckout);
    updateSubOptions();
}

function updateSubOptions() {
    if (!inventarState) return;
    const kat    = document.getElementById('select-kategorie').value;
    const action = document.getElementById('select-action').value;
    const mitgliedId = document.getElementById('select-mitglied').value;
    const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                     "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    const items  = inventarState[keyMap[kat]] || [];

    document.getElementById('select-gegenstand').innerHTML = items.map(i => {
        const isOut = i.Aktueller_Besitzer_ID &&
                      i.Aktueller_Besitzer_ID.toString() !== "0" &&
                      i.Aktueller_Besitzer_ID.toString() !== "";
        const disabled = (action === 'checkout' && isOut) || (action === 'checkin' && !isOut);
        // Bei Rückgabe: nur Items des gewählten Mitglieds aktivieren
        const wrongOwner = action === 'checkin' && isOut && mitgliedId &&
                           i.Aktueller_Besitzer_ID.toString() !== mitgliedId.toString();
        const label = getItemLabel(kat, i);
        return `<option value="${i.ID}"
            ${(disabled || wrongOwner) ? 'disabled style="color:#ccc"' : ''}>
            ${label} ${isOut ? '🔴' : '🟢'}
        </option>`;
    }).join('');
}


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
//  HELPER
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


// =========================================================
//  BESTANDESLISTE
// =========================================================
function sortBestand(col) {
    bestandSortDir = bestandSortCol === col
        ? (bestandSortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    bestandSortCol = col;
    renderInventoryTable();
}

function renderInventoryTable() {
    if (!inventarState) return;
    const target = document.getElementById('filter-liste').value;
    const keyMap = {
        "Inventar_Gewehre":           "gewehre",
        "Inventar_Schluessel":        "schluessel",
        "Inventar_Kleidung":          "kleidung",
        "Inventar_Schiessbekleidung": "schiessbekleidung",
        "Personendaten":              "mitglieder"
    };
    const rawData = inventarState[keyMap[target]];
    const table   = document.getElementById('inventory-table');

    if (!rawData?.length) {
        table.innerHTML = "<thead><tr><th>Keine Daten vorhanden</th></tr></thead>";
        return;
    }

    // Standard-Sortierung je nach Typ
    if (target === 'Personendaten') {
    if (bestandSortCol === 'Status') bestandSortCol = 'Nachname';
} else {
    if (bestandSortCol === 'Nachname') bestandSortCol = 'Status';
}

    const allHeaders     = Object.keys(rawData[0]);
    const displayHeaders = allHeaders.filter(h => h !== "ID");
    const dateKeys       = ['zeitstempel','kaufdatum','birthdate','kassiert_am',
                            'retour_am','kauf_spender_jahr','datum','date'];

    // Sortieren
    let sorted = [...rawData];
    sorted.sort((a, b) => {
        let va = a[bestandSortCol];
        let vb = b[bestandSortCol];

        // Mitglieder: Nachname + Vorname kombiniert
        if (target === 'Personendaten' && bestandSortCol === 'Nachname') {
            va = (a['Nachname']||'') + ' ' + (a['Vorname']||'');
            vb = (b['Nachname']||'') + ' ' + (b['Vorname']||'');
        }

        // Status-Sortierung: Im Lager zuerst
        if (bestandSortCol === 'Status') {
            const order = { 'Im Lager': 0, 'Ausgegeben': 1 };
            va = order[va] !== undefined ? order[va] : 2;
            vb = order[vb] !== undefined ? order[vb] : 2;
            return bestandSortDir === 'asc' ? va - vb : vb - va;
        }

        if (va === undefined || va === null || va === '') va = '';
        if (vb === undefined || vb === null || vb === '') vb = '';
        if (va < vb) return bestandSortDir === 'asc' ? -1 : 1;
        if (va > vb) return bestandSortDir === 'asc' ?  1 : -1;
        return 0;
    });

    // Header mit Sortier-Pfeilen
    let html = '<thead><tr class="table-dark">';
    displayHeaders.forEach(h => {
        const arrow = bestandSortCol === h
            ? (bestandSortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
        html += `<th style="cursor:pointer;user-select:none;white-space:nowrap"
                     onclick="sortBestand('${h}')">
                     ${h.replace(/_/g,' ')}
                     <span class="text-muted small">${arrow}</span>
                 </th>`;
    });
    html += '<th>Aktion</th></tr></thead><tbody>';

    html += sorted.map(row => {
        const cells = displayHeaders.map(key => {
            const val = row[key];
            if (key.endsWith("_ID") || key === "Aktueller_Besitzer_ID")
                return `<td>${getInventarNameFromId(val) || '<span class="text-muted">-</span>'}</td>`;
            if (key === "Status") {
                if (val === "Im Lager" || val === "Aktiv")
                    return `<td><span class="badge bg-success">${val==='Aktiv'?'Aktiv':'Lager'}</span></td>`;
                if (val === "Ausgegeben" || val === "Passiv")
                    return `<td><span class="badge bg-warning text-dark">${val==='Passiv'?'Passiv':'Ausleihe'}</span></td>`;
                if (val === "Verstorben")
                    return `<td><span class="badge bg-dark">† Verstorben</span></td>`;
                return `<td><span class="badge bg-secondary">${val||'-'}</span></td>`;
            }
            if (dateKeys.some(dk => key.toLowerCase().includes(dk.toLowerCase())) && val)
                return `<td>${formatCH(val)}</td>`;
            if (key.toLowerCase().includes("pfand") || key === "Depot")
                return `<td class="fw-bold">${val ? parseFloat(val).toFixed(2) : '0.00'}</td>`;
            return `<td>${val !== undefined && val !== null && val !== "" ? val : '-'}</td>`;
        }).join('');

       
// NEU:
return `<tr>${cells}<td>
    <div class="btn-group">
        <button class="btn btn-sm btn-outline-primary"
                onclick="editInventarItem('${target}','${row.ID}')">✏️</button>
        ${canDelete() ? `<button class="btn btn-sm btn-outline-danger"
                onclick="deleteInventarItem('${target}','${row.ID}')">🗑️</button>` : ''}
    </div>
</td></tr>`;
    }).join('');

    table.innerHTML = html + "</tbody>";
}


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
            rows.push({ mitglied, kategorie:keyMap[key], itemLabel, seit, seitDate, pfandStr });
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
                    </tr></thead>
                    <tbody>`;

    if (rows.length === 0) {
        html += `<tr><td colspan="5" class="text-muted text-center py-3">✅ Keine offenen Ausleihen</td></tr>`;
    } else {
        rows.forEach(r => {
            html += `<tr>
                <td>${r.mitglied}</td>
                <td><span class="badge bg-secondary">${r.kategorie}</span></td>
                <td>${r.itemLabel}</td>
                <td>${r.seit}</td>
                <td class="fw-bold">${r.pfandStr}</td>
            </tr>`;
        });
    }
    html += `</tbody></table></div></div>`;
    journalSection.insertAdjacentHTML('afterbegin', html);
}


// ── Material-Bewegungen ──
function sortTransaktionen(col) {
    journalSortDir = journalSortCol===col
        ? (journalSortDir==='asc'?'desc':'asc') : 'desc';
    journalSortCol = col;
    renderTransaktionenTable();
}

function renderTransaktionenTable() {
    const transTable = document.getElementById('table-transaktionen');
    const sh = (l,c) => sortHeader(l,c,journalSortCol,journalSortDir,'sortTransaktionen');

    if (!inventarState?.transaktionen?.length) {
        transTable.innerHTML = `<thead><tr class="table-dark">
            <th>Datum</th><th>Mitglied</th><th>Aktion</th>
            <th>Kategorie</th><th>Gegenstand</th><th>Bemerkung</th><th>PDF</th>
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
        <th>PDF</th>
    </tr></thead><tbody>`;

    groups.slice(0, 50).forEach(group => {
        const rowspan = group.length;
        group.forEach((t, idx) => {
            const date       = formatCH(t.Zeitstempel);
            const mitglied   = getInventarNameFromId(t.Aktueller_Besitzer_ID);
            const aktion     = (t.Aktion||"").toUpperCase();
            const istAusgabe = aktion==='AUSGABE'||aktion==='CHECKOUT';
            const aktionBadge= istAusgabe
                ? '<span class="badge bg-primary">Ausgabe</span>'
                : '<span class="badge bg-success">Rückgabe</span>';
            const kat        = t.Kategorie || '-';
            const gegenstand = getItemLabelFromTrans(t);

            let pdfCell = '';
            if (idx === 0) {
                const safeGroup = encodeURIComponent(JSON.stringify(group));
         // NEU – zuerst Backend-PDF versuchen, Fallback auf lokale Generierung:
const backendPdfUrl = group[0].PDF_URL || "";
pdfCell = `<td rowspan="${rowspan}" class="text-center align-middle">
    ${backendPdfUrl
        ? `<a href="${backendPdfUrl}" target="_blank"
              class="btn btn-sm btn-success" title="PDF aus Drive öffnen">📄</a>`
        : `<button class="btn btn-sm btn-outline-secondary"
                   title="PDF lokal generieren"
                   onclick="regeneratePDF('${safeGroup}')">📄</button>`
    }
</td>`;
            }
            html += `<tr>
                <td>${date}</td>
                <td>${mitglied}</td>
                <td>${aktionBadge}</td>
                <td><span class="badge bg-secondary">${kat}</span></td>
                <td><small>${gegenstand}</small></td>
                <td><small class="text-muted">${t.Bemerkungen||''}</small></td>
                ${pdfCell}
            </tr>`;
        });
    });
    transTable.innerHTML = html + "</tbody>";
    renderOffeneAusleihen(); // Sicherstellen dass diese auch refreshed werden
}


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
            // Gegenstand-Label finden
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


// =========================================================
//  ADMIN FELDER
// =========================================================
function renderAdminFields(target) {
    const fieldsDiv = document.getElementById('dynamic-fields');
    const saveBtn   = document.getElementById('btn-admin-save');
    if (!target || !inventarState) {
        fieldsDiv.innerHTML = ""; saveBtn.classList.add('d-none'); return;
    }
    saveBtn.classList.remove('d-none');

    const configs = {
        "Personendaten":              ["PersonNumber","Vorname","Nachname","email","BirthDate","Status"],
        "Inventar_Gewehre":           ["Hersteller","Modell","Laufnummer","Diopter","Ringkorn",
                                       "Zubehoer","Spezielles","Distanz","Eigentümer_ID",
                                       "Gespendet_ID","Kauf_Spender_Jahr","Verkaeufer_ID"],
        "Inventar_Schluessel":        ["Bezeichnung","Nummer"],
        "Inventar_Kleidung":          ["Typ","Groesse","Kaufdatum"],
        "Inventar_Schiessbekleidung": ["Typ","Groesse","Kaufdatum"]
    };
    const dropdownMapping = {
        "Status":      "MG_Status",
        "Bezeichnung": "Schluessel_Bezeichnung",
        "Distanz":     "Gewehre_Distanz",
        "Typ":         target==="Inventar_Schiessbekleidung" ? "Schiessbekleidung_Typ":"Kleidung_Typ",
        "Groesse":     "Kleidung_Schiessbekleidung_Groesse"
    };

    fieldsDiv.innerHTML = (configs[target]||[]).map(field => {
        if (field.endsWith("_ID")) {
            const sorted = [...inventarState.mitglieder]
                .sort((a,b)=>(a.Nachname||"").localeCompare(b.Nachname||""));
            const options = sorted
                .map(m=>`<option value="${m.ID}">${m.Nachname} ${m.Vorname}</option>`).join('');
            return `<div class="col-md-6 mb-3">
                <label class="fw-bold">${field.replace(/_/g,' ')}</label>
                <select name="${field}" class="form-select">
                    <option value="">-- Mitglied wählen --</option>${options}
                </select></div>`;
        }
        if (dropdownMapping[field]) {
            const options = (inventarState.config||[])
                .map(c=>c[dropdownMapping[field]]).filter(v=>v)
                .map(v=>`<option value="${v}">${v}</option>`).join('');
            return `<div class="col-md-6 mb-3">
                <label class="fw-bold">${field.replace(/_/g,' ')}</label>
                <select name="${field}" class="form-select">
                    <option value="">-- wählen --</option>${options}
                </select></div>`;
        }
        const isDate = ['datum','date','Jahr'].some(d=>field.toLowerCase().includes(d.toLowerCase()));
        return `<div class="col-md-6 mb-3">
            <label class="fw-bold">${field.replace(/_/g,' ')}</label>
            <input type="${isDate?'date':'text'}" name="${field}" class="form-control">
        </div>`;
    }).join('');
}


// =========================================================
//  EDIT ITEM
// =========================================================
function editInventarItem(targetSheet, id) {
    showInventarSection('admin');
    const select = document.getElementById('admin-target');
    select.value = targetSheet;
    renderAdminFields(targetSheet);

    const keyMap = {
        "Inventar_Gewehre":"gewehre","Inventar_Schluessel":"schluessel",
        "Inventar_Kleidung":"kleidung","Inventar_Schiessbekleidung":"schiessbekleidung",
        "Personendaten":"mitglieder"
    };
    const data = (inventarState[keyMap[targetSheet]]||[])
        .find(item => item.ID.toString() === id.toString());

    if (data) {
        let idField = document.getElementById('admin-edit-id');
        if (!idField) {
            idField = document.createElement('input');
            idField.type='hidden'; idField.id='admin-edit-id'; idField.name='ID';
            document.getElementById('adminForm').appendChild(idField);
        }
        idField.value = id;
        const form = document.getElementById('adminForm');
        Object.keys(data).forEach(key => {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) input.value = data[key];
        });
        const btn = document.getElementById('btn-admin-save');
        btn.innerText = "Änderungen speichern";
        btn.classList.replace('btn-success','btn-warning');
    }
}


// =========================================================
//  SUBMIT – Warenkorb buchen
// =========================================================
async function handleInventarSubmit(e) {
    e.preventDefault();
    if (warenkorb.length === 0) { alert("Warenkorb ist leer."); return; }
    setInventarBusy(true);

    const action     = document.getElementById('select-action').value;
    const mitgliedId = document.getElementById('select-mitglied').value;

    const payload = {
        action:                action,
        Aktion:                action === 'checkout' ? 'AUSGABE' : 'CHECKIN',
        Aktueller_Besitzer_ID: mitgliedId,
        mitgliedId:            mitgliedId,
        Bemerkungen:           document.getElementById('trans-bemerkungen').value,
        Verantwortliche_ID:    currentUser,
        sigMitglied:           sigPadMitglied ? sigPadMitglied.toDataURL() : "",
        Sig_Vorstand:          sigPadVorstand ? sigPadVorstand.toDataURL() : "",
        items: warenkorb.map(w => ({
            itemId:           w.itemId,
            kategorie:        w.kategorie,
            zustandAbgabe:    w.zustandAbgabe,
            zustandRueckgabe: w.zustandRueckgabe,
            pfandBetrag:      w.pfandBetrag,
            pfandEinnahme:    w.pfandEinnahme,
            pfandRetour:      w.pfandRetour
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
            ? `✅ ${payload.items.length} Position(en) gebucht!\n📄 PDF im Drive gespeichert.`
            : `✅ ${payload.items.length} Position(en) gebucht!\n📄 PDF wird heruntergeladen.`;
        alert(pdfHinweis);

    } catch (err) {
        console.error("Buchungsfehler:", err);
        alert("❌ Fehler bei der Buchung: " + err.message);
    } finally {
        setInventarBusy(false);
    }
}



// =========================================================
//  SAVE NEW / UPDATE
// =========================================================
async function saveNewInventarItem(e) {
    e.preventDefault();
    setInventarBusy(true);
    const target = document.getElementById('admin-target').value;
    const fields = {};
    new FormData(e.target).forEach((v,k) => fields[k]=v);
    const isUpdate = fields.ID && fields.ID !== "";

    try {
        await apiFetch('inventar', '', {
            method: 'POST',
            body: JSON.stringify({ action: isUpdate?"updateItem":"addNewItem", targetSheet:target, fields })
        });
        e.target.reset();
        const idField = document.getElementById('admin-edit-id');
        if (idField) idField.remove();
        const btn = document.getElementById('btn-admin-save');
        btn.innerText = "Speichern";
        btn.classList.replace('btn-warning','btn-success');
        await loadInventarData();
        alert(isUpdate ? "✅ Änderung gespeichert!" : "✅ Neu erfasst!");
    } catch (err) { alert("Fehler: " + err.message); }
    setInventarBusy(false);
}


// =========================================================
//  DELETE
// =========================================================
async function deleteInventarItem(target, id) {

    if (!canDelete()) {
        alert("❌ Keine Berechtigung zum Löschen.");
        return;
    }

    if (!confirm("Eintrag wirklich löschen?")) return;

    setInventarBusy(true);

    try {
        await apiFetch('inventar', '', {
            method: 'POST',
            body: JSON.stringify({
                action: "deleteItem",
                targetSheet: target,
                itemId: id
            })
        });

        await loadInventarData();

    } catch (err) {
        alert("Fehler: " + err.message);
    }

    setInventarBusy(false);
}


// =========================================================
//  PDF WIEDERHERSTELLEN
// =========================================================
async function regeneratePDF(groupJson) {
    try {
        const group = JSON.parse(decodeURIComponent(groupJson));
        if (!group?.length) return;
        const first     = group[0];
        const aktion    = (first.Aktion||"").toUpperCase();
        const isAusgabe = aktion==='AUSGABE'||aktion==='CHECKOUT';

        const items = group.map(t => ({
            itemId:           t.Inventar_ID,
            kategorie:        (t.Kategorie||"").toLowerCase(),
            zustandAbgabe:    t.Zustand_Abgabe    || '-',
            zustandRueckgabe: t.Zustand_Rueckgabe || '-',
            pfandBetrag:      parseFloat(t.Pfandbetrag)    || 0,
            pfandEinnahme:    t.Pfand_einnahme             || 'Nein',
            pfandRetour:      t.Pfand_retour_bezahlt       || 'Nein'
        }));

        const [sigMBase64, sigVBase64] = await Promise.all([
            urlToBase64(first.Unterschrift_URL || ""),
            urlToBase64(first.Sig_Vorstand     || "")
        ]);

        await generateQuittungPDF({
            action:                isAusgabe ? 'checkout' : 'checkin',
            Aktion:                first.Aktion,
            Aktueller_Besitzer_ID: first.Aktueller_Besitzer_ID,
            mitgliedId:            first.Aktueller_Besitzer_ID,
            Bemerkungen:           first.Bemerkungen || '',
            Verantwortliche_ID:    first.Verantwortliche_ID || '',
            sigMitglied:           sigMBase64,
            Sig_Vorstand:          sigVBase64,
            items
        }, String(first.Inventar_ID || '?'));
    } catch (err) {
        alert("PDF konnte nicht wiederhergestellt werden: " + err.message);
    }
}

async function urlToBase64(url) {
    if (!url) return "";
    try {
        const res  = await fetch(url);
        const blob = await res.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch { return ""; }
}


// =========================================================
//  PDF-QUITTUNG
// =========================================================
async function generateQuittungPDF(data, transId, sigMitgliedUrl, sigVorstandUrl) {
    const { jsPDF }    = window.jspdf;
    const doc          = new jsPDF();
    const mitgliedId   = data.Aktueller_Besitzer_ID || data.mitgliedId;
    const mitglied     = (inventarState.mitglieder||[])
        .find(m => m.ID.toString() === mitgliedId.toString());
    const mitgliedName = mitglied ? `${mitglied.Nachname} ${mitglied.Vorname}` : mitgliedId;
    const isAusgabe    = data.action==='checkout' || data.Aktion==='AUSGABE';
    const typ          = isAusgabe ? 'AUSGABE-QUITTUNG' : 'RÜCKNAHME-QUITTUNG';

    // Header
    doc.setFontSize(20); doc.setFont(undefined,'bold');
    doc.text("Sportschützen Muhen", 105, 18, { align:'center' });
    doc.setFontSize(15);
    doc.text(typ, 105, 28, { align:'center' });
    doc.setLineWidth(0.5); doc.line(20, 33, 190, 33);

    // Stammdaten
    doc.setFontSize(10); doc.setFont(undefined,'normal');
    let y = 42;
    const rowMeta = (label, value) => {
        doc.setFont(undefined,'bold');   doc.text(label, 20, y);
        doc.setFont(undefined,'normal'); doc.text(String(value||'-'), 65, y);
        y += 7;
    };
    rowMeta("Datum:",          formatCH(new Date()));
    rowMeta("Quittungs-Nr.:",  `T-${transId}`);
    rowMeta("Mitglied:",        mitgliedName);
    rowMeta("Verantwortlich:",  data.Verantwortliche_ID || '-');
    if (data.Bemerkungen) rowMeta("Bemerkungen:", data.Bemerkungen);
    y += 4;

    // Tabellen-Header
    doc.setFont(undefined,'bold');
    doc.setFillColor(30,30,30); doc.setTextColor(255,255,255);
    doc.rect(20, y, 170, 8, 'F');
    doc.text("Pos.",       22, y+5.5);
    doc.text("Kategorie",  35, y+5.5);
    doc.text("Gegenstand", 68, y+5.5);
    doc.text("Zustand",    130, y+5.5);
    doc.text("Pfand",      165, y+5.5);
    doc.setTextColor(0,0,0);
    y += 10;

    const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                     "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    const items  = data.items || [{
        itemId:           data.Inventar_ID || data.itemId,
        kategorie:        (data.Kategorie||data.kategorie||"").toLowerCase(),
        zustandAbgabe:    data.Zustand_Abgabe,
        zustandRueckgabe: data.Zustand_Rueckgabe,
        pfandBetrag:      data.Pfandbetrag || 0,
        pfandEinnahme:    data.Pfand_einnahme,
        pfandRetour:      data.Pfand_retour_bezahlt
    }];

    let totalPfand = 0;
    items.forEach((w, i) => {
        const item    = (inventarState[keyMap[w.kategorie]]||[])
            .find(it => it.ID.toString()===w.itemId.toString() ||
                        parseInt(it.ID)===parseInt(w.itemId));
        const label   = item ? getItemLabel(w.kategorie, item) : String(w.itemId);
        const zustand = isAusgabe ? w.zustandAbgabe : w.zustandRueckgabe;
        const pfand   = parseFloat(w.pfandBetrag) || 0;
        totalPfand   += pfand;

        if (i%2===0) {
            doc.setFillColor(245,245,245);
            doc.rect(20, y-1, 170, 8, 'F');
        }
        doc.setFont(undefined,'normal');
        doc.text(String(i+1), 22, y+5);
        doc.text((w.kategorie||'-').toUpperCase().slice(0,10), 35, y+5);
        doc.text(label.length>38 ? label.slice(0,36)+'…' : label, 68, y+5);
        doc.text(zustand||'-', 130, y+5);
        doc.text(pfand>0 ? `CHF ${pfand.toFixed(2)}` : '-', 165, y+5);
        y += 8;
        if (y > 245) { doc.addPage(); y = 20; }
    });

    // Pfand-Summe
    if (totalPfand > 0) {
        doc.setLineWidth(0.3); doc.line(130, y, 190, y); y += 5;
        doc.setFont(undefined,'bold');
        doc.text(`Total Pfand: CHF ${totalPfand.toFixed(2)}`, 130, y);
        const pfandStatus = isAusgabe
            ? (items[0]?.pfandEinnahme==='Ja' ? '✓ Kassiert' : '✗ Nicht kassiert')
            : (items[0]?.pfandRetour  ==='Ja' ? '✓ Retour bezahlt' : '✗ Noch offen');
        doc.setFont(undefined,'normal');
        doc.text(pfandStatus, 130, y+6);
        y += 14;
    }
    y += 8;

    // Unterschriften
    doc.setLineWidth(0.4); doc.line(20, y, 190, y); y += 8;
    doc.setFont(undefined,'bold'); doc.text("Unterschriften", 20, y);
    doc.setFont(undefined,'normal'); y += 8;

    const sigM = data.sigMitglied  || "";
    const sigV = data.Sig_Vorstand || "";

    if (sigM.length > 50) {
        doc.addImage(sigM, 'PNG', 20, y, 70, 22);
        doc.text("Mitglied", 20, y+26);
    } else if (sigMitgliedUrl) {
        doc.setFontSize(7); doc.setTextColor(100);
        doc.text(`Sig. Mitglied: ${sigMitgliedUrl}`, 20, y+10);
        doc.setFontSize(10); doc.setTextColor(0);
    }
    if (sigV.length > 50) {
        doc.addImage(sigV, 'PNG', 110, y, 70, 22);
        doc.text("Vorstand", 110, y+26);
    } else if (sigVorstandUrl) {
        doc.setFontSize(7); doc.setTextColor(100);
        doc.text(`Sig. Vorstand: ${sigVorstandUrl}`, 110, y+10);
        doc.setFontSize(10); doc.setTextColor(0);
    }

    // Footer
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Sportschützen Muhen | www.sportschuetzen-muhen.ch | ${formatCH(new Date())}`,
             105, 287, { align:'center' });

    const dateStr  = new Date().toISOString().split('T')[0].replace(/-/g,'');
    const typKurz  = isAusgabe ? 'Ausgabe' : 'Rueckgabe';
    doc.save(`${dateStr}_${typKurz}_${mitglied?.Nachname||'Unbekannt'}_T${transId}.pdf`);
}


// =========================================================
//  BUSY
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
