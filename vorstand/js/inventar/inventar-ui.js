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
            .warenkorb-card { border:2px dashed #0d6efd; border-radius:10px; background:#f8f9ff; overflow-x:auto; max-width:100%; }
            #warenkorb-list { overflow-x:auto; max-width:100%; }

            /* Sticky Spalten für Bestandsliste (ID links, Aktionen rechts) */
            #inventory-table th.inv-col-sticky-id,
            #inventory-table td.inv-col-sticky-id {
                position: sticky !important;
                left: 0 !important;
                background-color: #ffffff !important;
                z-index: 10 !important;
            }
            #inventory-table thead th.inv-col-sticky-id {
                background-color: #f8fafc !important;
                z-index: 22 !important;
            }
            #inventory-table tr:hover td.inv-col-sticky-id {
                background-color: #f1f5f9 !important;
            }
            #inventory-table th.inv-col-sticky-action,
            #inventory-table td.inv-col-sticky-action {
                position: sticky !important;
                right: 0 !important;
                background-color: #ffffff !important;
                box-shadow: -4px 0 8px rgba(0, 0, 0, 0.06);
                z-index: 10 !important;
            }
            #inventory-table thead th.inv-col-sticky-action {
                background-color: #f8fafc !important;
                z-index: 22 !important;
            }
            #inventory-table tr:hover td.inv-col-sticky-action {
                background-color: #f1f5f9 !important;
            }

            /* Toolbar-Ebene & Dropdown-Sicherheit gegen Header-Überlagerung */
            .inv-toolbar-card {
                position: relative !important;
                z-index: 45 !important;
                overflow: visible !important;
            }
            .inv-dropdown-menu {
                z-index: 1070 !important;
                min-width: 260px;
                background-color: #ffffff !important;
                border: 1px solid rgba(0,0,0,0.08) !important;
                box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.2), 0 8px 10px -6px rgba(15, 23, 42, 0.2) !important;
            }
        </style>

        <div class="d-flex flex-wrap gap-2 mb-4 align-items-center">
            ${canAdd() ? `
            <button class="btn btn-primary nav-btn" id="inv-btn-ausgabe"
                    onclick="localStorage.setItem('inventar-activeTab','ausgabe'); showInventarSection('ausgabe')">
                📤 Buchung
            </button>` : ''}
            <button class="btn ${!canAdd() ? 'btn-primary' : 'btn-outline-secondary'} nav-btn" id="inv-btn-liste"
                    onclick="localStorage.setItem('inventar-activeTab','liste'); showInventarSection('liste')">
                📦 Bestand
            </button>
            <button class="btn btn-outline-secondary nav-btn" id="inv-btn-journal"
                    onclick="localStorage.setItem('inventar-activeTab','journal'); showInventarSection('journal')">
                📖 Journal
            </button>
            <button class="btn btn-outline-secondary nav-btn" id="inv-btn-finanzen"
                    onclick="localStorage.setItem('inventar-activeTab','finanzen'); showInventarSection('finanzen')">
                💰 Finanzen
            </button>
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
                                <option value="verkauf" selected>💰 Verkauf</option>
                                <option value="checkout">📤 Ausgabe</option>
                                <option value="checkin">📥 Rückgabe</option>
                            </select>

                            <label class="form-label fw-bold">Mitglied</label>
                            <select id="select-mitglied" class="form-select mb-3"
                                    onchange="updateSubOptions()" required></select>
                            
                            <div id="container-mitglied-ausleihen" class="d-none mb-3"></div>

                            <label class="form-label fw-bold">Kategorie</label>
                            <select id="select-kategorie" class="form-select mb-3"
                                    onchange="updateSubOptions()">
                                <option value="gewehr">Gewehr</option>
                                <option value="schluessel">Schlüssel</option>
                                <option value="kleidung" selected>Kleidung</option>
                                <option value="schiessbekleidung">Schiessbekleidung</option>
                            </select>

                            <label class="form-label fw-bold">Gegenstand</label>
                            <select id="select-gegenstand" class="form-select mb-3" onchange="onGegenstandSelect()"></select>

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
                                    <label class="form-label fw-bold small" id="label-betrag">Pfandbetrag CHF</label>
                                    <input type="number" id="pfand-betrag" class="form-control"
                                           placeholder="0.00" step="0.01">
                                    <div id="inv-verkauf-sponsoring-hint" class="d-none"></div>
                                </div>
                                <div class="col-6" id="container-pfand-einnahme">
                                    <label class="form-label fw-bold small">Pfand Einnahme</label>
                                    <select id="pfand-einnahme" class="form-select" onchange="onPfandEinnahmeChange(this.value)">
                                        <option value="Einzahlungsschein" selected>Ja – QR-Rechnung (Einzahlungsschein)</option>
                                        <option value="Bar">Ja – Bar (Pfand-Kasse)</option>
                                        <option value="Twint">Ja – Twint</option>
                                        <option value="Nein">Nein (kein Pfand / nicht bezahlt)</option>
                                    </select>
                                </div>
                                <div class="col-6 d-none" id="container-pfand-retour">
                                    <label class="form-label fw-bold small">Pfand Retour</label>
                                    <select id="pfand-retour" class="form-select">
                                        <option value="Bar" selected>Ja – Bar retour</option>
                                        <option value="Twint">Ja – Twint retour</option>
                                        <option value="Banküberweisung">Ja – Banküberweisung</option>
                                        <option value="Nein">Nein (nicht ausbezahlt)</option>
                                    </select>
                                </div>
                                <div class="col-6 d-none" id="container-verkauf-methode">
                                    <label class="form-label fw-bold small">Zahlungsart</label>
                                    <select id="verkauf-methode" class="form-select">
                                        <option value="Bar">Bar</option>
                                        <option value="Twint">Twint</option>
                                        <option value="Einzahlungsschein">Einzahlungsschein (QR-Rechnung)</option>
                                    </select>
                                </div>
                                <div class="col-12 d-none mt-2" id="container-verkauf-konto">
                                    <label class="form-label fw-bold small text-primary mb-1" id="label-verkauf-konto">
                                      <i class="fas fa-book me-1"></i>Haben-Konto (Ertrag Materialverkauf)
                                    </label>
                                    <div class="input-group input-group-sm">
                                        <input type="text" id="verkauf-konto" class="form-control font-monospace" list="inv-konten-datalist"
                                               value="${localStorage.getItem('inventar_preferred_haben_konto_verkauf') || '8501'}" readonly style="background-color: #e9ecef;"
                                               placeholder="Konto suchen oder wählen..."
                                               onchange="onVerkaufKontoChange(this.value)">
                                        <button class="btn btn-outline-secondary" type="button" id="btn-verkauf-konto-lock" 
                                                onclick="toggleVerkaufKontoLock()" title="Konto-Sperre aufheben / sperren">
                                            <i class="fas fa-lock" id="icon-verkauf-konto-lock"></i>
                                        </button>
                                    </div>
                                    <div class="form-text small" style="font-size: 10px;" id="help-verkauf-konto">
                                        Standard: <code>8501</code> (Ertrag Materialverkauf) oder <code>2030</code> (Kautionen / Depots). Variabel aus Kontenrahmen wählbar.
                                    </div>
                                </div>
                                <div class="col-12 d-none mt-2" id="container-verkauf-info-banner">
                                    <div class="alert alert-info py-2 px-3 mb-0 border-0 rounded-3 shadow-xs" style="font-size: 11px; background-color: #e0f2fe; color: #0369a1;">
                                        <i class="fas fa-sync-alt me-1 fw-bold text-primary"></i>
                                        <strong>Automatische Buchhaltung & Rechnungs-Erstellung:</strong><br>
                                        • <strong>Bar / Twint:</strong> Bucht automatisch im Kassabuch (Soll 1000/1020 an Haben <span id="label-verwendungs-konto" class="fw-bold">8501</span>).<br>
                                        • <strong>Einzahlungsschein:</strong> Erstellt eine QR-Rechnung im Modul Rechnungen (bereit für Prüfung, Einzel- oder Massenversand).
                                    </div>
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
            <div class="card border-0 shadow-sm p-3 p-md-4 rounded-3">
                <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div>
                        <h4 class="mb-0 fw-bold text-primary"><i class="fas fa-boxes-stacked me-2"></i>Bestandsliste</h4>
                        <small class="text-muted">Vereinsinventar, Sportgeräte & Bekleidung</small>
                    </div>
                </div>

                <!-- Toolbar & Filter -->
                <div class="card border p-2 mb-3 shadow-xs rounded-3 bg-light inv-toolbar-card">
                    <div class="d-flex gap-2 align-items-center flex-wrap">
                        <div class="flex-grow-1 position-relative" style="min-width: 220px;">
                            <i class="fas fa-search position-absolute" style="left:12px;top:50%;transform:translateY(-50%);color:#aaa;"></i>
                            <input type="text" class="form-control form-control-sm ps-4 rounded-2 bg-white" id="inv-search-input"
                                   placeholder="Bestand durchsuchen (ID, Typ, Modell, Grösse, Besitzer...)" oninput="renderInventoryTable()">
                        </div>
                        <select id="filter-liste" class="form-select form-select-sm w-auto rounded-2 bg-white border"
                                onchange="renderInventoryTable()">
                            <option value="Inventar_Kleidung" selected>👕 Vereinskleidung</option>
                            <option value="Inventar_Schluessel">🔑 Schlüssel</option>
                            <option value="Inventar_Gewehre">🔫 Gewehre</option>
                            <option value="Inventar_Schiessbekleidung">🎯 Schiessbekleidung</option>
                            <option value="Personendaten">👥 Mitglieder</option>
                        </select>
                        <div id="inv-col-toggle-container"></div>
                        ${canAdd() ? `
                        <button type="button" class="btn btn-sm btn-primary fw-semibold rounded-2 shadow-xs d-inline-flex align-items-center" onclick="openInventarItemModal()" title="Neuen Gegenstand erfassen">
                            <i class="fas fa-plus me-1.5"></i> Neuer Artikel
                        </button>` : ''}
                        <button type="button" class="btn btn-sm btn-outline-success fw-semibold rounded-2 shadow-xs d-inline-flex align-items-center" onclick="openInventarExcelImportModal()" title="Inventargegenstände aus Excel oder CSV importieren">
                            <i class="fas fa-file-import me-1.5"></i> Excel-Import
                        </button>

                        <!-- Excel-Export Dropdown (Alle & nach Kategorie) -->
                        <div class="dropdown d-inline-block">
                            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle fw-semibold rounded-2 shadow-xs d-inline-flex align-items-center" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' data-bs-boundary="viewport" aria-expanded="false" title="Bestand in Excel (.xlsx) exportieren">
                                <i class="fas fa-file-excel me-1.5 text-success"></i> Excel-Export
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 inv-dropdown-menu">
                                <li><a class="dropdown-item py-2 fw-medium" href="#" onclick="exportInventarExcel('current'); return false;"><i class="fas fa-filter me-2 text-primary"></i>Aktuelle Kategorie (.xlsx)</a></li>
                                <li><a class="dropdown-item py-2 fw-medium" href="#" onclick="exportInventarExcel('all'); return false;"><i class="fas fa-layer-group me-2 text-success"></i>Gesamtes Inventar (Alle Kategorien) (.xlsx)</a></li>
                            </ul>
                        </div>

                        <!-- Drucken / PDF Dropdown (Alle & nach Kategorie) -->
                        <div class="dropdown d-inline-block">
                            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle fw-semibold rounded-2 shadow-xs d-inline-flex align-items-center" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' data-bs-boundary="viewport" aria-expanded="false" title="Bestand drucken oder als PDF speichern">
                                <i class="fas fa-print me-1.5 text-dark"></i> Drucken
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 inv-dropdown-menu">
                                <li><a class="dropdown-item py-2 fw-medium" href="#" onclick="printInventarBestand('current'); return false;"><i class="fas fa-filter me-2 text-primary"></i>Aktuelle Kategorie drucken</a></li>
                                <li><a class="dropdown-item py-2 fw-medium" href="#" onclick="printInventarBestand('all'); return false;"><i class="fas fa-layer-group me-2 text-dark"></i>Gesamtes Inventar drucken</a></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="table-responsive rounded-3 border" style="min-height: 380px;">
                    <table class="table table-hover table-sm align-middle mb-0"
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
                <div class="table-responsive rounded-3 border">
                    <table class="table table-hover table-sm align-middle mb-0" id="pfand-table">
                        <thead class="table-light border-bottom">
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

        <!-- MODAL: NEUER ARTIKEL / ARTIKEL BEARBEITEN -->
        <div class="modal fade" id="modal-inventar-item" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content shadow-lg border-0 rounded-3 overflow-hidden">
                    <div class="modal-header bg-primary text-white py-2.5 px-3">
                        <div>
                            <h5 class="modal-title fw-bold mb-0" id="modal-inventar-item-title"><i class="fas fa-box me-2"></i>Artikel erfassen</h5>
                            <small class="text-white-50">Vereinsinventar & Sachwerte verwalten</small>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <form id="form-inventar-item" onsubmit="saveInventarItemModal(event)">
                        <div class="modal-body p-3 p-md-4" style="background-color: #f8fafc;">
                            <input type="hidden" id="item-modal-id" name="ID">
                            
                            <!-- Du-Form Benutzer-Hinweis für Datalist / Freitexteingabe -->
                            <div class="alert alert-info border-0 rounded-3 py-2 px-3 small mb-3 shadow-xs d-flex align-items-center">
                                <i class="fas fa-lightbulb text-warning fs-5 me-2.5"></i>
                                <div>
                                    <strong>Flexibles Erfassen:</strong> Bei Feldern wie <em>Typ</em> und <em>Grösse</em> kannst du bestehende Werte aus der Liste wählen <u>oder</u> direkt neue Begriffe / Grössen eintippen. Neue Werte werden beim Speichern automatisch dauerhaft in deine Auswahlliste übernommen.
                                </div>
                            </div>

                            <div class="row g-3 mb-3 bg-white p-3 rounded-3 border">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold small text-muted text-uppercase mb-1">Kategorie</label>
                                    <select id="item-modal-category" class="form-select form-select-sm" onchange="renderItemModalFields(this.value)" required>
                                        <option value="Inventar_Kleidung">👕 Kleidung</option>
                                        <option value="Inventar_Schluessel">🔑 Schlüssel</option>
                                        <option value="Inventar_Gewehre">🔫 Gewehr</option>
                                        <option value="Inventar_Schiessbekleidung">🎯 Schiessbekleidung</option>
                                    </select>
                                </div>
                                <div class="col-md-6" id="container-item-modal-status" style="display:none;">
                                    <label class="form-label fw-bold small text-muted text-uppercase mb-1">Status</label>
                                    <select id="item-modal-status" name="Status" class="form-select form-select-sm">
                                        <option value="Im Lager">Im Lager</option>
                                        <option value="Ausgegeben">Ausgegeben</option>
                                        <option value="Defekt">Defekt</option>
                                        <option value="Verkauft">Verkauft</option>
                                        <option value="Ausgemustert">Ausgemustert</option>
                                    </select>
                                </div>
                            </div>

                            <div id="item-modal-fields" class="row"></div>
                        </div>
                        <div class="modal-footer bg-white border-top py-2.5 px-3 d-flex justify-content-between align-items-center">
                            <div>
                                <button type="button" class="btn btn-sm btn-outline-danger d-none rounded-2" id="btn-item-modal-delete" onclick="deleteItemFromModal()">
                                    <i class="fas fa-trash me-1"></i> Löschen
                                </button>
                            </div>
                            <div class="d-flex gap-2">
                                <button type="button" class="btn btn-sm btn-secondary px-3 rounded-2" data-bs-dismiss="modal">Abbrechen</button>
                                <button type="submit" class="btn btn-sm btn-primary px-3 rounded-2 fw-semibold shadow-sm" id="btn-item-modal-save">
                                    <i class="fas fa-save me-1.5"></i> Speichern
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

// =========================================================
//  NAV
// =========================================================
function showInventarSection(id) {
    if (id === 'admin') id = 'liste';
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
                .map(v => {
                    const isOk = (v.toLowerCase() === 'ok' || v.toLowerCase() === 'i.o.');
                    return `<option value="${v}" ${isOk ? 'selected' : ''}>${v}</option>`;
                }).join('');
        document.getElementById('select-zustand-abgabe').innerHTML    = zOpts;
        document.getElementById('select-zustand-rueckgabe').innerHTML = zOpts;
    }
    fillInventarKontenDropdown();
    toggleBookingFields(); // Sorgt dafür, dass UI-State zur default action (Verkauf) passt
}

function fillInventarKontenDropdown() {
    let list = window._bhKontenrahmen;
    if (!list || list.length === 0) {
        try {
            const cached = localStorage.getItem('bh_kontenrahmen');
            if (cached) list = JSON.parse(cached);
        } catch (e) {}
    }
    let datalist = document.getElementById('inv-konten-datalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'inv-konten-datalist';
        document.body.appendChild(datalist);
    }
    if (list && list.length > 0) {
        datalist.innerHTML = list.map(k => `<option value="${escapeHtml(k.konto)} | ${escapeHtml(k.bezeichnung)}">`).join('');
    }
}
window.fillInventarKontenDropdown = fillInventarKontenDropdown;

function toggleBookingFields() {
    const action = document.getElementById('select-action').value;
    const isCheckout = action === 'checkout';
    const isVerkauf = action === 'verkauf';
    
    document.getElementById('container-zustand-abgabe').classList.toggle('d-none', !isCheckout && !isVerkauf);
    document.getElementById('container-zustand-rueckgabe').classList.toggle('d-none', isCheckout || isVerkauf);
    
    document.getElementById('container-pfand-einnahme').classList.toggle('d-none', !isCheckout);
    document.getElementById('container-pfand-retour').classList.toggle('d-none', action !== 'checkin');
    document.getElementById('container-verkauf-methode').classList.toggle('d-none', !isVerkauf);
    
    // Konto-Container bei Verkauf UND bei Ausgabe (Depot) anzeigen
    const kontoContainer = document.getElementById('container-verkauf-konto');
    const labelKonto = document.getElementById('label-verkauf-konto');
    const inputKonto = document.getElementById('verkauf-konto');
    const helpKonto = document.getElementById('help-verkauf-konto');
    
    if (kontoContainer) {
        kontoContainer.classList.toggle('d-none', !isVerkauf && !isCheckout);
        if (isVerkauf) {
            const savedVerkaufKonto = getInventarDefaultHabenKonto('verkauf');
            if (labelKonto) labelKonto.innerHTML = '<i class="fas fa-book me-1"></i>Haben-Konto (Ertrag Materialverkauf)';
            if (inputKonto && (inputKonto.value === '2030' || inputKonto.value.startsWith('2030 ') || !inputKonto.value)) {
                inputKonto.value = savedVerkaufKonto;
            } else if (inputKonto && inputKonto.value === '8501' && savedVerkaufKonto !== '8501') {
                inputKonto.value = savedVerkaufKonto;
            }
            if (helpKonto) helpKonto.innerHTML = 'Standard: <code>8501</code> (Ertrag Materialverkauf). Ansonsten variabel aus Kontenrahmen wählbar.';
            onVerkaufKontoChange(inputKonto ? inputKonto.value : savedVerkaufKonto);
        } else if (isCheckout) {
            const savedDepotKonto = getInventarDefaultHabenKonto('depot');
            if (labelKonto) labelKonto.innerHTML = '<i class="fas fa-shield-alt me-1"></i>Haben-Konto (Kautionen / Depots)';
            if (inputKonto && (inputKonto.value === '8501' || inputKonto.value.startsWith('8501 ') || inputKonto.value === '3200' || !inputKonto.value)) {
                inputKonto.value = savedDepotKonto;
            } else if (inputKonto && inputKonto.value === '2030' && savedDepotKonto !== '2030') {
                inputKonto.value = savedDepotKonto;
            }
            if (helpKonto) helpKonto.innerHTML = 'Standard: <code>2030</code> (Kautionen / Depots - Passivkonto). Ansonsten variabel aus Kontenrahmen wählbar.';
            onVerkaufKontoChange(inputKonto ? inputKonto.value : savedDepotKonto);
        }
    }
    
    document.getElementById('container-verkauf-info-banner')?.classList.toggle('d-none', !isVerkauf);
    
    // Label umschalten für Betrag
    const labelBetrag = document.getElementById('label-betrag');
    if (isVerkauf) {
        labelBetrag.innerText = 'Endpreis für Mitglied CHF';
    } else {
        labelBetrag.innerText = 'Pfandbetrag CHF';
    }
    
    updateSubOptions();
}

function getInventarDefaultHabenKonto(type) {
    const cfgKey = type === 'depot' ? 'inventar_haben_konto_depot' : 'inventar_haben_konto_verkauf';
    const storageKey = type === 'depot' ? 'inventar_preferred_haben_konto_depot' : 'inventar_preferred_haben_konto_verkauf';
    const fallback = type === 'depot' ? '2030' : '8501';

    // 1. Aus Supabase inventory_config (in inventarState.rawConfig)
    if (inventarState?.rawConfig) {
        const found = inventarState.rawConfig.find(c => c.config_key === cfgKey);
        if (found && found.value) return found.value;
    }
    // 2. Aus localStorage
    const local = localStorage.getItem(storageKey);
    if (local) return local;

    return fallback;
}
window.getInventarDefaultHabenKonto = getInventarDefaultHabenKonto;

window.onVerkaufKontoChange = async function(val) {
    const cleanKonto = (val || '').split('|')[0].trim();
    const lbl = document.getElementById('label-verwendungs-konto');
    if (lbl) lbl.innerText = cleanKonto || '8501';

    const action = document.getElementById('select-action')?.value;
    if (cleanKonto) {
        const isDepot = action === 'checkout';
        const storageKey = isDepot ? 'inventar_preferred_haben_konto_depot' : 'inventar_preferred_haben_konto_verkauf';
        const configKey = isDepot ? 'inventar_haben_konto_depot' : 'inventar_haben_konto_verkauf';

        localStorage.setItem(storageKey, cleanKonto);

        // Dauerhaft in Supabase inventory_config persistieren
        const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
        if (supa) {
            try {
                await supa.from('inventory_config').delete().eq('config_key', configKey);
                await supa.from('inventory_config').insert([{
                    config_key: configKey,
                    value: cleanKonto,
                    sort_order: isDepot ? 2 : 1
                }]);
                if (inventarState?.rawConfig) {
                    const existing = inventarState.rawConfig.find(c => c.config_key === configKey);
                    if (existing) existing.value = cleanKonto;
                    else inventarState.rawConfig.push({ config_key: configKey, value: cleanKonto, sort_order: isDepot ? 2 : 1 });
                }
            } catch (err) {
                console.warn("⚠️ Habenkonto konnte nicht in inventory_config gespeichert werden:", err);
            }
        }
    }
};

window.toggleVerkaufKontoLock = function() {
    const input = document.getElementById('verkauf-konto');
    const icon = document.getElementById('icon-verkauf-konto-lock');
    if (!input || !icon) return;

    if (input.hasAttribute('readonly')) {
        input.removeAttribute('readonly');
        input.style.backgroundColor = '#ffffff';
        icon.className = 'fas fa-lock-open text-warning';
    } else {
        input.setAttribute('readonly', 'readonly');
        input.style.backgroundColor = '#e9ecef';
        icon.className = 'fas fa-lock';
    }
};

function updateSubOptions() {
    if (!inventarState) return;
    const kat    = document.getElementById('select-kategorie').value;
    const action = document.getElementById('select-action').value;
    const mitgliedId = document.getElementById('select-mitglied').value;
    const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                     "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    const items  = inventarState[keyMap[kat]] || [];

    // --- UX-HIGHLIGHT: Ausgeliehenes Material des Mitglieds anzeigen ---
    const containerHoldings = document.getElementById('container-mitglied-ausleihen');
    if (containerHoldings) {
        if (action === 'checkin' && mitgliedId) {
            let memberItems = [];
            const allKeyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                                "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
            Object.keys(allKeyMap).forEach(k => {
                (inventarState[allKeyMap[k]] || []).forEach(item => {
                    if (item.Aktueller_Besitzer_ID && String(item.Aktueller_Besitzer_ID) === String(mitgliedId) && (item.Status || '').toLowerCase() !== 'verkauft') {
                        memberItems.push({ kat: k, item: item, label: getItemLabel(k, item) });
                    }
                });
            });

            if (memberItems.length === 0) {
                containerHoldings.className = 'mb-3';
                containerHoldings.innerHTML = `
                    <div class="alert alert-info py-2 px-3 small mb-0 border-0 rounded-3 shadow-xs">
                        <i class="fas fa-check-circle me-1 text-success"></i>Dieses Mitglied hat aktuell <b>keine offenen Ausleihen</b>.
                    </div>`;
            } else {
                containerHoldings.className = 'mb-3';
                containerHoldings.innerHTML = `
                    <div class="card border border-primary border-opacity-25 shadow-xs p-2.5 rounded-3 bg-white">
                        <div class="d-flex justify-content-between align-items-center mb-1 pb-1 border-bottom">
                            <span class="small fw-bold text-primary">
                                <i class="fas fa-box-open me-1"></i>Aktuell ausgeliehen (${memberItems.length}):
                            </span>
                            ${memberItems.length > 1 ? `
                            <button type="button" class="btn btn-xs btn-outline-primary fw-bold py-0.5 px-2" 
                                    onclick="addAllMemberItemsToReturnCart('${mitgliedId}')" style="font-size: 11px;">
                                <i class="fas fa-bolt me-1"></i>Alle retournieren
                            </button>` : ''}
                        </div>
                        <div class="list-group list-group-flush">
                            ${memberItems.map(m => {
                                const openPfand = (inventarState?.pfand || []).find(p => 
                                    String(p.Mitglied_ID) === String(mitgliedId) && 
                                    String(p.Inventar_ID) === String(m.item.ID) && 
                                    (p.Status||'').toLowerCase() === 'offen'
                                );
                                const pfandInfo = openPfand ? `CHF ${parseFloat(openPfand.Betrag).toFixed(2)} (${openPfand.Zahlungsart||'Bar'})` : (m.item.Depotbetrag ? `CHF ${parseFloat(m.item.Depotbetrag).toFixed(2)}` : 'Kein Pfand');
                                const isInCart = warenkorb.some(w => w.itemId.toString() === m.item.ID.toString() && w.kategorie === m.kat);
                                return `
                                <div class="d-flex justify-content-between align-items-center py-1.5 small border-bottom border-light">
                                    <div>
                                        <span class="badge bg-secondary me-1 text-uppercase" style="font-size: 9px;">${m.kat}</span>
                                        <strong>${m.label}</strong>
                                        <div class="text-muted" style="font-size: 10px;">Pfand: <span class="fw-semibold text-dark">${pfandInfo}</span></div>
                                    </div>
                                    <button type="button" class="btn btn-sm ${isInCart ? 'btn-success disabled' : 'btn-outline-primary'} py-0 px-2" 
                                            style="font-size: 11px;" 
                                            onclick="quickSelectMemberItem('${m.kat}', '${m.item.ID}')">
                                        ${isInCart ? '✓ Im Korb' : '📥 Wählen'}
                                    </button>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>`;
            }
        } else {
            containerHoldings.className = 'd-none mb-3';
            containerHoldings.innerHTML = '';
        }
    }

    // Sortierung: Bei Rückgabe die Gegenstände dieses Mitglieds ganz oben anzeigen!
    const sortedItems = [...items].sort((a, b) => {
        if (action === 'checkin' && mitgliedId) {
            const aMine = String(a.Aktueller_Besitzer_ID) === String(mitgliedId);
            const bMine = String(b.Aktueller_Besitzer_ID) === String(mitgliedId);
            if (aMine && !bMine) return -1;
            if (!aMine && bMine) return 1;
        }
        return 0;
    });

    document.getElementById('select-gegenstand').innerHTML = sortedItems.map(i => {
        const isVerkauft = (i.Status || '').toLowerCase() === 'verkauft';
        const isMine = action === 'checkin' && mitgliedId && String(i.Aktueller_Besitzer_ID) === String(mitgliedId);
        const isOut = (i.Aktueller_Besitzer_ID &&
                      i.Aktueller_Besitzer_ID.toString() !== "0" &&
                      i.Aktueller_Besitzer_ID.toString() !== "") || isVerkauft;
        const isInCart = warenkorb.some(w => w.itemId.toString() === i.ID.toString() && w.kategorie === kat);
        
        // Verkauf und Checkout sind blockiert wenn isOut oder isVerkauft, Checkin nur wenn !isOut bzw. !isVerkauft
        const disabled = ((action === 'checkout' || action === 'verkauf') && isOut) || 
                         (action === 'checkin' && (!isOut || isVerkauft)) || 
                         isInCart;
        // Bei Rückgabe: nur Items des gewählten Mitglieds aktivieren
        const wrongOwner = action === 'checkin' && isOut && !isVerkauft && mitgliedId && !isMine;
        const label = getItemLabel(kat, i);
        
        let statusIcon = isVerkauft ? '❌ (Verkauft)' : (isOut ? (isMine ? '⭐ (Bei Mitglied)' : '🔴') : '🟢');
        if (isInCart) statusIcon = '🛒';

        return `<option value="${i.ID}" ${isMine ? 'class="fw-bold text-primary"' : ''}
            ${(disabled || wrongOwner) ? 'disabled style="color:#ccc"' : ''}>
            ${label} ${statusIcon}
        </option>`;
    }).join('');
    
    // Initial den Betrag laden (Kaufpreis bei Verkauf ODER Depotbetrag bei Ausleihe)
    onGegenstandSelect();
}

window.quickSelectMemberItem = function(kat, itemId) {
    document.getElementById('select-kategorie').value = kat;
    updateSubOptions();
    document.getElementById('select-gegenstand').value = itemId;
    onGegenstandSelect();
};

window.addAllMemberItemsToReturnCart = function(mitgliedId) {
    const allKeyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                        "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    let addedCount = 0;
    Object.keys(allKeyMap).forEach(k => {
        (inventarState[allKeyMap[k]] || []).forEach(item => {
            if (item.Aktueller_Besitzer_ID && String(item.Aktueller_Besitzer_ID) === String(mitgliedId) && (item.Status || '').toLowerCase() !== 'verkauft') {
                const itemId = item.ID.toString();
                if (!warenkorb.some(w => w.itemId.toString() === itemId && w.kategorie === k)) {
                    const label = getItemLabel(k, item);
                    const openPfand = (inventarState?.pfand || []).find(p => 
                        String(p.Mitglied_ID) === String(mitgliedId) && 
                        String(p.Inventar_ID) === String(itemId) && 
                        (p.Status||'').toLowerCase() === 'offen'
                    );
                    let pfand = 0;
                    let retourMethode = 'Bar';
                    if (openPfand && parseFloat(openPfand.Betrag) > 0) {
                        pfand = parseFloat(openPfand.Betrag);
                        const art = (openPfand.Zahlungsart || '').toLowerCase();
                        if (art.includes('twint')) retourMethode = 'Twint';
                        else if (art.includes('einzahlungsschein') || art.includes('rechnung')) retourMethode = 'Banküberweisung';
                    } else if (item.Depotbetrag) {
                        pfand = parseFloat(item.Depotbetrag) || 0;
                    }
                    warenkorb.push({
                        itemId: itemId,
                        kategorie: k,
                        label: label,
                        zustandAbgabe: 'i.O.',
                        zustandRueckgabe: 'i.O.',
                        pfandBetrag: pfand,
                        pfandEinnahme: 'Nein',
                        pfandMethode: null,
                        pfandRetour: 'Ja',
                        pfandRetourMethode: retourMethode,
                        verkaufMethode: null
                    });
                    addedCount++;
                }
            }
        });
    });
    if (addedCount > 0) {
        renderWarenkorb();
        updateSubOptions();
    }
};

function onGegenstandSelect() {
    const action = document.getElementById('select-action').value;
    const kat = document.getElementById('select-kategorie').value;
    const itemId = document.getElementById('select-gegenstand').value;
    if (!itemId) return;

    const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                     "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    const item = (inventarState[keyMap[kat]] || []).find(i => i.ID.toString() === itemId.toString());
    
    if (item) {
        const sponsorHintEl = document.getElementById('inv-verkauf-sponsoring-hint');
        if (action === 'verkauf') {
            // 1. Verkauf: Verkaufspreis (Mitgliederpreis) vorblenden, sonst Kaufpreis
            let preisRaw = item.Verkaufspreis || item.selling_price || item.Kaufpreis || item.Preis || item.kaufpreis || 0;
            const rawSponsor = item.Sponsoring !== undefined && item.Sponsoring !== null && item.Sponsoring !== '' ? item.Sponsoring : item.discount_amount;
            if (preisRaw && preisRaw !== "") {
                const preis = parseFloat(preisRaw.toString().replace("'", "").replace("CHF", "").trim());
                if (!isNaN(preis) && preis > 0) {
                    document.getElementById('pfand-betrag').value = preis.toFixed(2);
                    if (sponsorHintEl) {
                        const sponsorNum = parseFloat(rawSponsor) || 0;
                        if (sponsorNum > 0) {
                            const rawKatalog = item.Katalogpreis || item.retail_price || (item.Kaufpreis ? parseFloat(item.Kaufpreis) : (preis + sponsorNum));
                            const sponsorTitle = (item.Sponsor_Firma || item.sponsor_company || 'Sponsoring Beitrag').trim();
                            sponsorHintEl.className = 'small text-danger fw-semibold mt-1 d-block';
                            sponsorHintEl.innerHTML = `<i class="fas fa-handshake me-1"></i>Verkaufspreis gerundet CHF ${parseFloat(rawKatalog).toFixed(2)} abzgl. ${escapeHtml(sponsorTitle)} -CHF ${sponsorNum.toFixed(2)} = <strong>Endpreis für Mitglied CHF ${preis.toFixed(2)}</strong>`;
                        } else {
                            sponsorHintEl.className = 'd-none';
                        }
                    }
                    return;
                }
            }
            if (sponsorHintEl) sponsorHintEl.className = 'd-none';
        } else {
            if (sponsorHintEl) sponsorHintEl.className = 'd-none';
        }
        if (action === 'checkout') {
            // 2. Ausleihe (Option B): Depotbetrag vorblenden
            let depotRaw = item.Depotbetrag || item.Depot || item.depot || item.Pfandbetrag || item.Pfand || 0;
            if (depotRaw && depotRaw !== "") {
                const depot = parseFloat(depotRaw.toString().replace("'", "").replace("CHF", "").trim());
                if (!isNaN(depot) && depot > 0) {
                    document.getElementById('pfand-betrag').value = depot.toFixed(2);
                    return;
                }
            }
            document.getElementById('pfand-betrag').value = '';
            document.getElementById('pfand-betrag').placeholder = 'Pfandbetrag z.B. 50.00';
            return;
        } else if (action === 'checkin') {
            // 3. Rückgabe: Nachschlagen, ob ein offenes Pfand für dieses Mitglied & Item existiert
            const mitgliedId = document.getElementById('select-mitglied').value;
            const openPfand = (inventarState?.pfand || []).find(p => 
                String(p.Mitglied_ID) === String(mitgliedId) && 
                String(p.Inventar_ID) === String(itemId) && 
                (p.Status || '').toLowerCase() === 'offen'
            );
            if (openPfand && parseFloat(openPfand.Betrag) > 0) {
                document.getElementById('pfand-betrag').value = parseFloat(openPfand.Betrag).toFixed(2);
                const retSelect = document.getElementById('pfand-retour');
                if (retSelect) {
                    const art = (openPfand.Zahlungsart || '').toLowerCase();
                    if (art.includes('twint')) retSelect.value = 'Twint';
                    else if (art.includes('einzahlungsschein') || art.includes('rechnung')) retSelect.value = 'Banküberweisung';
                    else retSelect.value = 'Bar';
                }
                return;
            } else {
                // Fallback: hinterlegter Depotbetrag des Gegenstands
                let depotRaw = item.Depotbetrag || item.Depot || 0;
                if (depotRaw) {
                    const depot = parseFloat(depotRaw.toString().replace("'", "").replace("CHF", "").trim());
                    if (!isNaN(depot) && depot > 0) {
                        document.getElementById('pfand-betrag').value = depot.toFixed(2);
                        return;
                    }
                }
            }
        }
    }
    document.getElementById('pfand-betrag').value = '';
}

function onPfandEinnahmeChange(val) {
    const pInput = document.getElementById('pfand-betrag');
    if (!pInput) return;
    if (val === 'Nein') {
        pInput.classList.remove('is-invalid');
    } else {
        if (!pInput.value || parseFloat(pInput.value) <= 0) {
            pInput.placeholder = 'Pfandbetrag z.B. 50.00';
            pInput.focus();
        }
    }
}
window.onPfandEinnahmeChange = onPfandEinnahmeChange;

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

// =========================================================
//  INVENTAR EXPORT & PRINT ENGINE (SheetJS & Native Print)
// =========================================================
function formatChfNum(val) {
    if (val === null || val === undefined || val === '') return '';
    const n = parseFloat(val);
    return isNaN(n) ? '' : n.toFixed(2);
}

function getCategoryExportRows(targetKey) {
    if (!inventarState) return [];
    const catMap = {
        'Inventar_Kleidung': { key: 'kleidung', name: 'Vereinskleidung' },
        'Inventar_Schluessel': { key: 'schluessel', name: 'Schlüssel' },
        'Inventar_Gewehre': { key: 'gewehre', name: 'Gewehre' },
        'Inventar_Schiessbekleidung': { key: 'schiessbekleidung', name: 'Schiessbekleidung' },
        'kleidung': { key: 'kleidung', name: 'Vereinskleidung' },
        'schluessel': { key: 'schluessel', name: 'Schlüssel' },
        'gewehre': { key: 'gewehre', name: 'Gewehre' },
        'schiessbekleidung': { key: 'schiessbekleidung', name: 'Schiessbekleidung' }
    };
    const catInfo = catMap[targetKey];
    if (!catInfo) return [];
    const items = inventarState[catInfo.key] || [];

    if (catInfo.key === 'kleidung') {
        return items.map(r => ({
            'ID': r.ID || '',
            'Typ': r.Typ || '',
            'Modell': r.Modell || '',
            'Hersteller': r.Hersteller || '',
            'Grösse': r.Groesse || '',
            'Kaufdatum': r.Kaufdatum ? formatCH(r.Kaufdatum) : '',
            'Verkaufspreis gerundet CHF': formatChfNum(r.Katalogpreis),
            'Sponsoring Beitrag CHF': formatChfNum(r.Sponsoring),
            'Sponsor-Firma': r.Sponsor_Firma || '',
            'Endpreis für Mitglied CHF': formatChfNum(r.Verkaufspreis),
            'Total Einstandspreis CHF': formatChfNum(r.Kaufpreis),
            'Einstandspreis Material CHF': formatChfNum(r.Grundpreis),
            'Einstandspreis Druck CHF': formatChfNum(r.Veredelung),
            'Depot CHF': formatChfNum(r.Depotbetrag),
            'Status': r.Status || 'Im Lager',
            'Aktueller Besitzer': getInventarNameFromId(r.Aktueller_Besitzer_ID)
        }));
    }
    if (catInfo.key === 'schluessel') {
        return items.map(r => ({
            'ID': r.ID || '',
            'Bezeichnung': r.Bezeichnung || '',
            'Schlüsselnummer': r.Nummer || '',
            'Depot CHF': formatChfNum(r.Depotbetrag),
            'Status': r.Status || 'Im Lager',
            'Aktueller Besitzer': getInventarNameFromId(r.Aktueller_Besitzer_ID)
        }));
    }
    if (catInfo.key === 'gewehre') {
        return items.map(r => ({
            'ID': r.ID || '',
            'Hersteller': r.Hersteller || '',
            'Modell': r.Modell || '',
            'Laufnummer': r.Laufnummer || '',
            'Diopter': r.Diopter || '',
            'Ringkorn': r.Ringkorn || '',
            'Zubehör': r.Zubehoer || '',
            'Spezielles': r.Spezielles || '',
            'Distanz': r.Distanz || '',
            'Eigentümer': getInventarNameFromId(r.Eigentümer_ID),
            'Gespendet von': getInventarNameFromId(r.Gespendet_ID),
            'Spender-/Kaufjahr': r.Kauf_Spender_Jahr || '',
            'Verkäufer': getInventarNameFromId(r.Verkaeufer_ID),
            'Total Einstandspreis CHF': formatChfNum(r.Kaufpreis),
            'Depot CHF': formatChfNum(r.Depotbetrag),
            'Status': r.Status || 'Im Lager',
            'Aktueller Besitzer': getInventarNameFromId(r.Aktueller_Besitzer_ID)
        }));
    }
    if (catInfo.key === 'schiessbekleidung') {
        return items.map(r => ({
            'ID': r.ID || '',
            'Typ': r.Typ || '',
            'Modell': r.Modell || '',
            'Hersteller': r.Hersteller || '',
            'Grösse': r.Groesse || '',
            'Kaufdatum': r.Kaufdatum ? formatCH(r.Kaufdatum) : '',
            'Sponsor-Firma': r.Sponsor_Firma || '',
            'Total Einstandspreis CHF': formatChfNum(r.Kaufpreis),
            'Depot CHF': formatChfNum(r.Depotbetrag),
            'Status': r.Status || 'Im Lager',
            'Aktueller Besitzer': getInventarNameFromId(r.Aktueller_Besitzer_ID)
        }));
    }
    return [];
}

window.exportInventarExcel = function(scope = 'current') {
    if (typeof XLSX === 'undefined') {
        alert("❌ SheetJS (XLSX) Bibliothek ist im Portal nicht verfügbar.");
        return;
    }
    if (!inventarState) {
        alert("⚠️ Keine Inventardaten geladen.");
        return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    const catLabels = {
        'Inventar_Kleidung': 'Vereinskleidung',
        'Inventar_Schluessel': 'Schlüssel',
        'Inventar_Gewehre': 'Gewehre',
        'Inventar_Schiessbekleidung': 'Schiessbekleidung'
    };

    if (scope === 'current') {
        const currentTarget = document.getElementById('filter-liste')?.value || 'Inventar_Kleidung';
        if (currentTarget === 'Personendaten') {
            alert("ℹ️ Mitglieder-Export steht direkt im Modul «Mitglieder» zur Verfügung.");
            return;
        }
        const rows = getCategoryExportRows(currentTarget);
        if (rows.length === 0) {
            alert("⚠️ Keine Datensätze in dieser Kategorie vorhanden.");
            return;
        }
        const sheetName = (catLabels[currentTarget] || 'Bestand').slice(0, 31);
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `Inventar_${sheetName}_${todayStr}.xlsx`);
    } else {
        const categories = [
            { key: 'Inventar_Kleidung', name: 'Vereinskleidung' },
            { key: 'Inventar_Schluessel', name: 'Schlüssel' },
            { key: 'Inventar_Gewehre', name: 'Gewehre' },
            { key: 'Inventar_Schiessbekleidung', name: 'Schiessbekleidung' }
        ];

        let totalExported = 0;
        categories.forEach(c => {
            const rows = getCategoryExportRows(c.key);
            if (rows.length > 0) {
                const ws = XLSX.utils.json_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, c.name.slice(0, 31));
                totalExported += rows.length;
            }
        });

        if (totalExported === 0) {
            alert("⚠️ Keine Inventargegenstände zum Exportieren vorhanden.");
            return;
        }
        XLSX.writeFile(wb, `Vereinsinventar_Gesamtbestand_${todayStr}.xlsx`);
    }
};

window.printInventarBestand = function(scope = 'current') {
    if (!inventarState) {
        alert("⚠️ Keine Inventardaten vorhanden.");
        return;
    }

    const catLabels = {
        'Inventar_Kleidung': 'Vereinskleidung',
        'Inventar_Schluessel': 'Schlüssel',
        'Inventar_Gewehre': 'Gewehre',
        'Inventar_Schiessbekleidung': 'Schiessbekleidung'
    };

    const categoriesToPrint = [];
    if (scope === 'current') {
        const currentTarget = document.getElementById('filter-liste')?.value || 'Inventar_Kleidung';
        if (currentTarget === 'Personendaten') {
            alert("ℹ️ Druckfunktion für Mitglieder befindet sich im Modul «Mitglieder».");
            return;
        }
        categoriesToPrint.push({ key: currentTarget, label: catLabels[currentTarget] || currentTarget });
    } else {
        categoriesToPrint.push(
            { key: 'Inventar_Kleidung', label: 'Vereinskleidung' },
            { key: 'Inventar_Schluessel', label: 'Schlüssel' },
            { key: 'Inventar_Gewehre', label: 'Gewehre' },
            { key: 'Inventar_Schiessbekleidung', label: 'Schiessbekleidung' }
        );
    }

    const todayDate = new Date().toLocaleDateString('de-CH');
    const todayTime = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

    let sectionsHtml = '';
    let totalItems = 0;
    let totalLager = 0;
    let totalAusleihe = 0;

    categoriesToPrint.forEach(cat => {
        const rows = getCategoryExportRows(cat.key);
        if (rows.length === 0) return;

        totalItems += rows.length;
        const lagerCount = rows.filter(r => (r.Status || '').toLowerCase().includes('lager')).length;
        const ausleiheCount = rows.filter(r => (r.Status || '').toLowerCase().includes('ausgegeben') || (r.Status || '').toLowerCase().includes('ausleihe')).length;
        totalLager += lagerCount;
        totalAusleihe += ausleiheCount;

        const headers = Object.keys(rows[0]);

        sectionsHtml += `
            <div class="category-section mb-4">
                <div class="section-header d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                    <h5 class="fw-bold mb-0 text-primary">${cat.label}</h5>
                    <span class="badge bg-light text-dark border">${rows.length} Gegenstände (${lagerCount} im Lager, ${ausleiheCount} ausgegeben)</span>
                </div>
                <table class="print-table mb-4">
                    <thead>
                        <tr>
                            ${headers.map(h => `<th class="${h.includes('CHF') ? 'text-end' : ''}">${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                ${headers.map(h => {
                                    const val = r[h] !== undefined && r[h] !== null ? r[h] : '';
                                    if (h === 'Status') {
                                        const badgeClass = String(val).toLowerCase().includes('lager') ? 'status-lager' : (String(val).toLowerCase().includes('aus') ? 'status-ausleihe' : 'status-other');
                                        return `<td><span class="status-badge ${badgeClass}">${val}</span></td>`;
                                    }
                                    if (h.includes('CHF')) {
                                        return `<td class="text-end font-monospace">${val ? (h.includes('Sponsoring') ? '-CHF ' : 'CHF ') + val : '-'}</td>`;
                                    }
                                    return `<td>${val || '-'}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });

    if (totalItems === 0) {
        alert("⚠️ Keine Datensätze zum Drucken vorhanden.");
        return;
    }

    const printWin = window.open('', '_blank', 'width=1150,height=850');
    if (!printWin) {
        alert("Popup-Fenster wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben.");
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <title>Inventarbestand - Sportschützen Muhen</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                @page { size: A4 landscape; margin: 10mm; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                    font-size: 11px;
                    color: #1e293b;
                    background: #fff;
                    padding: 10px;
                }
                .print-header {
                    border-bottom: 2px solid #0f3a5d;
                    padding-bottom: 10px;
                    margin-bottom: 15px;
                }
                .print-logo-title {
                    font-size: 1.4rem;
                    font-weight: 800;
                    color: #0f3a5d;
                    letter-spacing: -0.5px;
                }
                .kpi-box {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    padding: 6px 12px;
                    text-align: center;
                }
                .kpi-box .val {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #0f3a5d;
                }
                .kpi-box .lbl {
                    font-size: 10px;
                    color: #64748b;
                    text-transform: uppercase;
                }
                .print-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                }
                .print-table th {
                    background-color: #f1f5f9;
                    color: #334155;
                    font-weight: 700;
                    padding: 5px 6px;
                    border: 1px solid #cbd5e1;
                    white-space: nowrap;
                }
                .print-table td {
                    padding: 4px 6px;
                    border: 1px solid #e2e8f0;
                    vertical-align: middle;
                }
                .print-table tr:nth-child(even) td {
                    background-color: #f8fafc;
                }
                .status-badge {
                    display: inline-block;
                    padding: 1px 6px;
                    border-radius: 4px;
                    font-size: 9px;
                    font-weight: 600;
                }
                .status-lager { background: #dcfce7; color: #166534; }
                .status-ausleihe { background: #fef3c7; color: #92400e; }
                .status-other { background: #f1f5f9; color: #475569; }
                @media print {
                    .no-print { display: none !important; }
                    body { padding: 0; }
                    .category-section { page-break-inside: auto; }
                    tr { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="print-header d-flex justify-content-between align-items-center">
                <div>
                    <div class="print-logo-title">Sportschützen Muhen</div>
                    <div class="text-muted" style="font-size: 12px; font-weight: 600;">Vereinsinventar – Bestandsliste</div>
                    <div class="text-muted" style="font-size: 10px;">Stichtag: ${todayDate} um ${todayTime} Uhr</div>
                </div>
                <div class="d-flex gap-2">
                    <div class="kpi-box"><div class="val">${totalItems}</div><div class="lbl">Total Artikel</div></div>
                    <div class="kpi-box"><div class="val text-success">${totalLager}</div><div class="lbl">Im Lager</div></div>
                    <div class="kpi-box"><div class="val text-warning">${totalAusleihe}</div><div class="lbl">Ausgegeben</div></div>
                </div>
            </div>

            <div class="no-print mb-3 text-end">
                <button class="btn btn-primary btn-sm px-3 fw-bold" onclick="window.print()">
                    🖨️ Jetzt drucken / Als PDF speichern
                </button>
                <button class="btn btn-outline-secondary btn-sm px-3 ms-2" onclick="window.close()">
                    Schliessen
                </button>
            </div>

            ${sectionsHtml}

            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 300);
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
};
