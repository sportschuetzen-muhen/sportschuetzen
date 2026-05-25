// =========================================================
//  MODULE: INVENTAR - UI
//  - UI Shell, Tab-Navigation, Dropdowns & Booking Field Toggles
// =========================================================

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
        const isInCart = warenkorb.some(w => w.itemId.toString() === i.ID.toString() && w.kategorie === kat);
        const disabled = (action === 'checkout' && isOut) || (action === 'checkin' && !isOut) || isInCart;
        // Bei Rückgabe: nur Items des gewählten Mitglieds aktivieren
        const wrongOwner = action === 'checkin' && isOut && mitgliedId &&
                           i.Aktueller_Besitzer_ID.toString() !== mitgliedId.toString();
        const label = getItemLabel(kat, i);
        
        let statusIcon = isOut ? '🔴' : '🟢';
        if (isInCart) statusIcon = '🛒';

        return `<option value="${i.ID}"
            ${(disabled || wrongOwner) ? 'disabled style="color:#ccc"' : ''}>
            ${label} ${statusIcon}
        </option>`;
    }).join('');
}

function showJournalConfirmationAlert(message) {
    const journalSection = document.getElementById('inv-section-journal');
    if (!journalSection) return;

    // Bestehenden Alert entfernen falls vorhanden
    const oldAlert = journalSection.querySelector('.journal-booking-alert');
    if (oldAlert) oldAlert.remove();

    const alertHtml = `
        <div class="alert alert-success alert-dismissible fade show mb-4 shadow-sm border-start border-success border-4 journal-booking-alert animate__animated animate__fadeInDown" role="alert" style="border-radius: 8px;">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div class="d-flex align-items-center">
                    <i class="fas fa-check-circle me-3 text-success" style="font-size: 1.5rem;"></i>
                    <div>
                        <h6 class="alert-heading fw-bold mb-1" style="font-size: 1rem; color: #198754;">Buchung erfolgreich durchgeführt!</h6>
                        <p class="mb-0 small text-dark">${message} Bitte überprüfe die Buchung kurz unten in der Liste.</p>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-success fw-bold px-3 py-1.5" data-bs-dismiss="alert" style="border-radius: 6px;">✓ Verstanden</button>
            </div>
        </div>
    `;
    
    // Ganz oben einfügen
    journalSection.insertAdjacentHTML('afterbegin', alertHtml);
}
