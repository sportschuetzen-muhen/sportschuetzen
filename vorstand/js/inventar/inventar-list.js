// =========================================================
//  MODULE: INVENTAR - LIST
//  - Bestandesliste, Admin-Formular & CRUD Aktionen (Edit, Save, Delete)
// =========================================================

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
        table.innerHTML = `<thead class="table-light border-bottom"><tr><th class="py-3 px-3">Keine Daten vorhanden</th></tr></thead><tbody><tr><td class="text-muted p-4 text-center">In dieser Kategorie sind noch keine Datensätze vorhanden.</td></tr></tbody>`;
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

    // Suchfilter (Live-Suche)
    const search = (document.getElementById('inv-search-input')?.value || '').toLowerCase().trim();

    // Sortieren & Filtern
    let sorted = [...rawData];

    if (search) {
        sorted = sorted.filter(row => {
            return Object.values(row).some(v => {
                if (v === null || v === undefined) return false;
                return String(v).toLowerCase().includes(search);
            });
        });
    }

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

    if (sorted.length === 0) {
        table.innerHTML = `<thead class="table-light border-bottom"><tr><th class="py-3 px-3">Keine Treffer</th></tr></thead><tbody><tr><td class="text-muted p-4 text-center">Kein Gegenstand entspricht deiner Suche «${escapeHtml(search)}».</td></tr></tbody>`;
        return;
    }

    // Header mit Sortier-Pfeilen (Globaler Design-Standard)
    let html = '<thead class="table-light"><tr class="border-bottom">';
    // ID-Spalte
    html += `<th style="cursor:pointer;user-select:none;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:0.5px;color:#475569;"
                 data-sort-key="ID" data-col-id="col_id" onclick="sortBestand('ID')">
                 ID
                 <span class="text-muted small">${bestandSortCol === 'ID' ? (bestandSortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
             </th>`;

    displayHeaders.forEach((h, idx) => {
        const arrow = bestandSortCol === h
            ? (bestandSortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
        html += `<th style="cursor:pointer;user-select:none;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:0.5px;color:#475569;"
                     data-sort-key="${h}" data-col-id="col_${h.toLowerCase()}"
                     onclick="sortBestand('${h}')">
                     ${h.replace(/_/g,' ')}
                     <span class="text-muted small">${arrow}</span>
                 </th>`;
    });
    html += '<th class="text-center" style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:#475569;" data-col-id="col_aktionen" data-col-toggle="false">Aktionen</th></tr></thead><tbody>';

    html += sorted.map(row => {
        const idCell = `<td class="font-monospace fw-bold text-primary" data-col-id="col_id">${row.ID || '-'}</td>`;
        const cells = displayHeaders.map(key => {
            const val = row[key];
            const colAttr = `data-col-id="col_${key.toLowerCase()}"`;
            if (key.endsWith("_ID") || key === "Aktueller_Besitzer_ID")
                return `<td ${colAttr}>${getInventarNameFromId(val) || '<span class="text-muted">-</span>'}</td>`;
            if (key === "Status") {
                if (val === "Im Lager" || val === "Aktiv")
                    return `<td ${colAttr}><span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2 rounded-pill">${val==='Aktiv'?'Aktiv':'Lager'}</span></td>`;
                if (val === "Ausgegeben" || val === "Passiv")
                    return `<td ${colAttr}><span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-1 px-2 rounded-pill">${val==='Passiv'?'Passiv':'Ausleihe'}</span></td>`;
                if (val === "Verkauft")
                    return `<td ${colAttr}><span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle py-1 px-2 rounded-pill">Verkauft</span></td>`;
                if (val === "Defekt" || val === "Ausgemustert")
                    return `<td ${colAttr}><span class="badge bg-danger-subtle text-danger border border-danger-subtle py-1 px-2 rounded-pill">${val}</span></td>`;
                if (val === "Verstorben")
                    return `<td ${colAttr}><span class="badge bg-dark text-white py-1 px-2 rounded-pill">† Verstorben</span></td>`;
                return `<td ${colAttr}><span class="badge bg-secondary py-1 px-2 rounded-pill">${val||'-'}</span></td>`;
            }
            if (dateKeys.some(dk => key.toLowerCase().includes(dk.toLowerCase())) && val)
                return `<td ${colAttr}>${formatCH(val)}</td>`;
            if (key.toLowerCase().includes("preis") || key.toLowerCase().includes("sponsoring")) {
                if (val !== undefined && val !== null && val !== "") {
                    const num = parseFloat(val);
                    const isNeg = key.toLowerCase().includes("sponsoring") && num > 0;
                    return `<td ${colAttr} class="text-end font-monospace ${key.toLowerCase().includes("sponsoring") ? 'text-danger fw-semibold' : (key.toLowerCase().includes("verkauf") ? 'fw-bold text-success' : '')}">${!isNaN(num) ? (isNeg ? '-CHF ' : 'CHF ') + num.toFixed(2) : val}</td>`;
                }
                return `<td ${colAttr} class="text-end text-muted small">-</td>`;
            }
            if (key.toLowerCase().includes("pfand") || key === "Depot" || key === "Depotbetrag")
                return `<td ${colAttr} class="text-end font-monospace fw-bold text-primary">${val ? parseFloat(val).toFixed(2) : '0.00'}</td>`;
            return `<td ${colAttr}>${val !== undefined && val !== null && val !== "" ? val : '-'}</td>`;
        }).join('');

        return `<tr>${idCell}${cells}<td class="text-center" data-col-id="col_aktionen">
            <div class="btn-group btn-group-sm">
                ${canAdd() ? `<button class="btn btn-outline-primary btn-sm rounded-2 me-1"
                        onclick="editInventarItem('${target}','${row.ID}')" title="Bearbeiten"><i class="fas fa-edit"></i></button>` : ''}
                ${canDelete() ? `<button class="btn btn-outline-danger btn-sm rounded-2"
                        onclick="deleteInventarItem('${target}','${row.ID}')" title="Löschen"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </td></tr>`;
    }).join('');

    table.innerHTML = html + "</tbody>";

    // TableKit-Features initialisieren
    if (window.TableKit?.makeColumnReorderable) {
        window.TableKit.makeColumnReorderable('#inventory-table', {
            storageKey: `tk_inv_col_order_${target}`,
            lockedColumns: ['col_id', 'col_aktionen']
        });
    }
    if (window.TableKit?.setupColumnToggle) {
        window.TableKit.setupColumnToggle('#inventory-table', {
            container: '#inv-col-toggle-container',
            storageKey: `tk_inv_cols_${target}`
        });
    }
    if (window.TableKit?.makeResizable) {
        window.TableKit.makeResizable('#inventory-table', {
            storageKey: `tk_inv_widths_${target}`
        });
    }
}

// =========================================================
//  MODAL: ARTIKEL ERFASSEN & BEARBEITEN (NEUES KONZEPT)
// =========================================================
function openInventarItemModal(preferredCat) {
    if (!canAdd()) {
        alert("❌ Du hast keine Berechtigung zum Erfassen von Gegenständen.");
        return;
    }
    const filterVal = preferredCat || document.getElementById('filter-liste')?.value || 'Inventar_Kleidung';
    const target = (filterVal === 'Personendaten') ? 'Inventar_Kleidung' : filterVal;

    const modalEl = document.getElementById('modal-inventar-item');
    if (!modalEl) return;

    if (window.UIModalKit?.makeMovableAndResizable) {
        window.UIModalKit.makeMovableAndResizable(modalEl);
    }

    const titleEl = document.getElementById('modal-inventar-item-title');
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-plus-circle me-2 text-primary"></i>Neuen Gegenstand erfassen`;

    const catSelect = document.getElementById('item-modal-category');
    if (catSelect) catSelect.value = target;

    const idInput = document.getElementById('item-modal-id');
    if (idInput) idInput.value = '';

    const statusCont = document.getElementById('container-item-modal-status');
    if (statusCont) statusCont.style.display = 'none';

    const delBtn = document.getElementById('btn-item-modal-delete');
    if (delBtn) delBtn.classList.add('d-none');

    const form = document.getElementById('form-inventar-item');
    if (form) form.reset();

    renderItemModalFields(target);

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
}

function renderItemModalFields(target) {
    const fieldsDiv = document.getElementById('item-modal-fields');
    if (!fieldsDiv || !target || !inventarState) return;

    const configs = {
        "Inventar_Gewehre":           ["Hersteller","Modell","Laufnummer","Diopter","Ringkorn",
                                       "Zubehoer","Spezielles","Distanz","Eigentümer_ID",
                                       "Gespendet_ID","Kauf_Spender_Jahr","Verkaeufer_ID","Kaufpreis","Depotbetrag"],
        "Inventar_Schluessel":        ["Bezeichnung","Nummer","Depotbetrag"],
        "Inventar_Kleidung":          ["Typ","Modell","Hersteller","Groesse","Kaufdatum","Verkaufspreis","Katalogpreis","Sponsoring","Kaufpreis","Grundpreis","Veredelung","Depotbetrag"],
        "Inventar_Schiessbekleidung": ["Typ","Modell","Hersteller","Groesse","Kaufdatum","Kaufpreis","Depotbetrag"]
    };
    const dropdownMapping = {
        "Status":      "MG_Status",
        "Bezeichnung": "Schluessel_Bezeichnung",
        "Distanz":     "Gewehre_Distanz",
        "Typ":         target==="Inventar_Schiessbekleidung" ? "Schiessbekleidung_Typ":"Kleidung_Typ",
        "Groesse":     "Kleidung_Schiessbekleidung_Groesse"
    };

    const fieldLabels = {
        "Verkaufspreis": "Verkaufspreis an Mitglied CHF",
        "Katalogpreis": "Katalogpreis (vor Sponsoring) CHF",
        "Sponsoring": "Sponsoring-Abzug (C-Ma) CHF",
        "Kaufpreis": "Einkaufspreis Verein CHF",
        "Grundpreis": "Netto-Grundpreis CHF",
        "Veredelung": "Netto-Veredelung CHF",
        "Depotbetrag": "Depotbetrag / Kaution CHF"
    };

    fieldsDiv.innerHTML = (configs[target]||[]).map(field => {
        const displayLabel = fieldLabels[field] || field.replace(/_/g,' ');
        if (field.endsWith("_ID")) {
            const sorted = [...(inventarState.mitglieder||[])]
                .sort((a,b)=>(a.Nachname||"").localeCompare(b.Nachname||""));
            const options = sorted
                .map(m=>`<option value="${m.ID}">${m.Nachname} ${m.Vorname}</option>`).join('');
            return `<div class="col-md-6 mb-3">
                <label class="form-label fw-bold small text-muted text-uppercase mb-1">${displayLabel}</label>
                <select name="${field}" class="form-select form-select-sm">
                    <option value="">-- Mitglied wählen --</option>${options}
                </select></div>`;
        }
        if (dropdownMapping[field]) {
            let optionsList = (inventarState.config||[])
                .map(c=>c[dropdownMapping[field]]).filter(v=>v);

            // Schlüssel: Exakte Vorgabe gemäss Vorstand ('allgemein', 'Wirtschaftsraum', 'Tresor 1', 'Tresor 2', 'Tresor 3')
            if (target === 'Inventar_Schluessel' && field === 'Bezeichnung') {
                const standardKeys = ['allgemein', 'Wirtschaftsraum', 'Tresor 1', 'Tresor 2', 'Tresor 3'];
                optionsList = standardKeys;
            }

            const options = optionsList.map(v=>`<option value="${v}">${v}</option>`).join('');

            // Kleidung / Schiessbekleidung: Grössen und Typen flexibel via Datalist (Auswahl oder Freitext)
            if (field === 'Groesse' || field === 'Typ') {
                return `<div class="col-md-6 mb-3">
                    <label class="form-label fw-bold small text-muted text-uppercase mb-1">${displayLabel}</label>
                    <input type="text" name="${field}" list="datalist-${field}" class="form-control form-control-sm" placeholder="Auswählen oder eintippen..." autocomplete="off">
                    <datalist id="datalist-${field}">
                        ${options}
                    </datalist>
                    <div class="form-text text-muted" style="font-size: 11px;"><i class="fas fa-keyboard me-1"></i>Aus Liste wählen oder frei eingeben (wird gemerkt)</div>
                </div>`;
            }

            return `<div class="col-md-6 mb-3">
                <label class="form-label fw-bold small text-muted text-uppercase mb-1">${displayLabel}</label>
                <select name="${field}" class="form-select form-select-sm" ${field === 'Bezeichnung' ? 'required' : ''}>
                    <option value="">-- wählen --</option>${options}
                </select></div>`;
        }
        const isDate = ['datum','date','Jahr'].some(d=>field.toLowerCase().includes(d.toLowerCase()));
        return `<div class="col-md-6 mb-3">
            <label class="form-label fw-bold small text-muted text-uppercase mb-1">${displayLabel}</label>
            <input type="${isDate?'date':'text'}" name="${field}" class="form-control form-control-sm" placeholder="${field.includes('preis')||field.includes('Sponsoring')||field.includes('betrag') ? '0.00' : ''}">
        </div>`;
    }).join('');
}

// =========================================================
//  EDIT ITEM (ÖFFNET MODAL DIREKT IM BESTAND)
// =========================================================
function editInventarItem(targetSheet, id) {
    if (targetSheet === 'Personendaten') {
        alert("ℹ️ Mitgliederdaten werden im Modul 'Mitglieder' gepflegt.");
        return;
    }

    const keyMap = {
        "Inventar_Gewehre":"gewehre","Inventar_Schluessel":"schluessel",
        "Inventar_Kleidung":"kleidung","Inventar_Schiessbekleidung":"schiessbekleidung"
    };
    const data = (inventarState[keyMap[targetSheet]]||[])
        .find(item => item.ID.toString() === id.toString());

    if (!data) {
        alert("Gegenstand nicht gefunden.");
        return;
    }

    const modalEl = document.getElementById('modal-inventar-item');
    if (!modalEl) return;

    if (window.UIModalKit?.makeMovableAndResizable) {
        window.UIModalKit.makeMovableAndResizable(modalEl);
    }

    const titleEl = document.getElementById('modal-inventar-item-title');
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-edit me-2 text-warning"></i>Gegenstand bearbeiten: <strong>${id}</strong>`;

    const catSelect = document.getElementById('item-modal-category');
    if (catSelect) catSelect.value = targetSheet;

    const idInput = document.getElementById('item-modal-id');
    if (idInput) idInput.value = id;

    const statusCont = document.getElementById('container-item-modal-status');
    if (statusCont) statusCont.style.display = 'block';

    const statusSelect = document.getElementById('item-modal-status');
    if (statusSelect) statusSelect.value = data.Status || 'Im Lager';

    const delBtn = document.getElementById('btn-item-modal-delete');
    if (delBtn) delBtn.classList.remove('d-none');

    renderItemModalFields(targetSheet);

    const form = document.getElementById('form-inventar-item');
    if (form) {
        Object.keys(data).forEach(key => {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                if (input.tagName === 'SELECT' && data[key] && !Array.from(input.options).some(o => o.value === String(data[key]))) {
                    const opt = document.createElement('option');
                    opt.value = data[key];
                    opt.textContent = data[key];
                    input.appendChild(opt);
                }
                input.value = data[key];
            }
        });
    }

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
}

// =========================================================
//  SAVE / UPDATE VIA MODAL
// =========================================================
async function saveInventarItemModal(e) {
    e.preventDefault();
    setInventarBusy(true);

    const target = document.getElementById('item-modal-category')?.value || 'Inventar_Kleidung';
    const fields = {};
    new FormData(e.target).forEach((v,k) => fields[k]=v);
    const isUpdate = Boolean(fields.ID && fields.ID !== "");

    const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);

    try {
        if (supa && target !== 'Personendaten') {
            const catMap = {
                "Inventar_Gewehre": "gewehr",
                "Inventar_Schluessel": "schluessel",
                "Inventar_Kleidung": "kleidung",
                "Inventar_Schiessbekleidung": "schiessbekleidung"
            };
            const prefixMap = {
                "Inventar_Gewehre": "G",
                "Inventar_Schluessel": "SCH",
                "Inventar_Kleidung": "K",
                "Inventar_Schiessbekleidung": "SB"
            };
            const category = catMap[target] || 'gewehr';
            const prefix = prefixMap[target] || 'X';

            let itemId = fields.ID;
            if (!isUpdate) {
                const keyMap = { "gewehr":"gewehre","schluessel":"schluessel","kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
                const existingItems = inventarState?.[keyMap[category]] || [];
                let maxNum = 0;
                existingItems.forEach(it => {
                    const idStr = String(it.ID || '');
                    if (idStr.startsWith(prefix + '-')) {
                        const n = parseInt(idStr.split('-')[1]);
                        if (!isNaN(n) && n > maxNum) maxNum = n;
                    }
                });
                itemId = `${prefix}-${maxNum + 1}`;
                fields.ID = itemId;
            }

            const supaItem = {
                id: String(itemId).trim(),
                category: category,
                depot_amount: parseFloat(fields.Depotbetrag) || 0,
                purchase_price: parseFloat(fields.Kaufpreis) || null,
                purchase_year: fields.Kauf_Spender_Jahr ? String(fields.Kauf_Spender_Jahr) : null,
                purchase_date: fields.Kaufdatum ? (typeof formatISODateSafe === 'function' ? formatISODateSafe(fields.Kaufdatum) : fields.Kaufdatum) : null,
                updated_at: new Date().toISOString()
            };

            if (!isUpdate) {
                supaItem.status = 'Im Lager';
                supaItem.current_owner_id = null;
            } else if (fields.Status) {
                supaItem.status = fields.Status;
            }

            if (category === 'gewehr') {
                supaItem.manufacturer = fields.Hersteller || null;
                supaItem.model = fields.Modell || null;
                supaItem.serial_number = fields.Laufnummer || null;
                supaItem.diopter = fields.Diopter || null;
                supaItem.front_sight = fields.Ringkorn || null;
                supaItem.accessories = fields.Zubehoer || null;
                supaItem.special_notes = fields.Spezielles || null;
                supaItem.caliber_distance = fields.Distanz || '50m';
                supaItem.owner_person_id = fields.Eigentümer_ID || null;
                supaItem.donor_person_id = fields.Gespendet_ID || null;
                supaItem.seller_person_id = fields.Verkaeufer_ID || null;
            } else if (category === 'schluessel') {
                supaItem.key_name = fields.Bezeichnung || '';
                supaItem.key_number = fields.Nummer ? String(fields.Nummer) : null;
            } else if (category === 'kleidung' || category === 'schiessbekleidung') {
                supaItem.item_type = fields.Typ || '';
                supaItem.model = fields.Modell || null;
                supaItem.manufacturer = fields.Hersteller || (category === 'kleidung' ? 'Erima' : null);
                supaItem.size = fields.Groesse || '';
                supaItem.selling_price = fields.Verkaufspreis ? parseFloat(fields.Verkaufspreis) : null;
                supaItem.retail_price = fields.Katalogpreis ? parseFloat(fields.Katalogpreis) : (fields.Kaufpreis ? parseFloat(fields.Kaufpreis) : null);
                supaItem.discount_amount = fields.Sponsoring ? parseFloat(fields.Sponsoring) : null;
                supaItem.base_price = fields.Grundpreis ? parseFloat(fields.Grundpreis) : null;
                supaItem.finishing_price = fields.Veredelung ? parseFloat(fields.Veredelung) : null;
            }

            const { error: saveErr } = await supa
                .from('inventory_items')
                .upsert(supaItem, { onConflict: 'id' });

            if (saveErr) throw new Error("Supabase Speicherfehler: " + saveErr.message);

            // Falls neuer Kleidungstyp oder neue Grösse erfasst wurde, in inventory_config abspeichern
            if ((category === 'kleidung' || category === 'schiessbekleidung') && supa) {
                try {
                    if (fields.Typ && fields.Typ.trim()) {
                        const typKey = category === 'schiessbekleidung' ? 'Schiessbekleidung_Typ' : 'Kleidung_Typ';
                        const knownTypes = (inventarState?.config || []).map(c => c[typKey]).filter(Boolean);
                        if (!knownTypes.includes(fields.Typ.trim())) {
                            await supa.from('inventory_config').insert([{
                                config_key: typKey,
                                value: fields.Typ.trim(),
                                sort_order: knownTypes.length + 1
                            }]);
                        }
                    }
                    if (fields.Groesse && fields.Groesse.trim()) {
                        const knownSizes = (inventarState?.config || []).map(c => c['Kleidung_Schiessbekleidung_Groesse']).filter(Boolean);
                        if (!knownSizes.includes(fields.Groesse.trim())) {
                            await supa.from('inventory_config').insert([{
                                config_key: 'Kleidung_Schiessbekleidung_Groesse',
                                value: fields.Groesse.trim(),
                                sort_order: knownSizes.length + 1
                            }]);
                        }
                    }
                } catch (confErr) {
                    console.warn("Warnung beim Speichern neuer Typ/Grösse-Konfiguration:", confErr);
                }
            }

            // Revisions-Auditlog eintragen
            await supa.from('inventory_audit_log').insert([{
                timestamp: new Date().toISOString(),
                user_name: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
                action: isUpdate ? 'updateItem' : 'addNewItem',
                details: `${target}: ID ${itemId} (${isUpdate ? 'aktualisiert' : 'neu erfasst'})`
            }]);
        }

        const modalEl = document.getElementById('modal-inventar-item');
        if (modalEl) {
            bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        await loadInventarData(true);
        alert(isUpdate ? `✅ Änderung für ${fields.ID} gespeichert!` : `✅ Neuer Gegenstand ${fields.ID} erfolgreich angelegt!`);
    } catch (err) {
        alert("Fehler: " + err.message);
    } finally {
        setInventarBusy(false);
    }
}

// =========================================================
//  DELETE
// =========================================================
async function deleteInventarItem(target, id) {
    if (!canDelete()) {
        alert("❌ Du hast keine Berechtigung zum Löschen.");
        return;
    }

    if (!confirm(`Möchtest du den Eintrag ${id} wirklich unwiderruflich löschen?`)) return;

    setInventarBusy(true);

    const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);

    try {
        if (supa && target !== 'Personendaten') {
            const { error: delErr } = await supa
                .from('inventory_items')
                .delete()
                .eq('id', String(id).trim());

            if (delErr) throw new Error("Supabase Löschfehler: " + delErr.message);

            await supa.from('inventory_audit_log').insert([{
                timestamp: new Date().toISOString(),
                user_name: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
                action: 'deleteItem',
                details: `${target}: ID ${id} gelöscht`
            }]);
        }

        await loadInventarData(true);
        alert(`✅ Eintrag ${id} wurde erfolgreich gelöscht!`);
    } catch (err) {
        alert("Fehler: " + err.message);
    } finally {
        setInventarBusy(false);
    }
}

async function deleteItemFromModal() {
    const id = document.getElementById('item-modal-id')?.value;
    const cat = document.getElementById('item-modal-category')?.value;
    if (!id) return;
    const modalEl = document.getElementById('modal-inventar-item');
    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    await deleteInventarItem(cat, id);
}

// Abwärtskompatible Aliase
window.openInventarItemModal = openInventarItemModal;
window.renderItemModalFields = renderItemModalFields;
window.saveInventarItemModal = saveInventarItemModal;
window.renderAdminFields = renderItemModalFields;
window.saveNewInventarItem = saveInventarItemModal;
window.deleteItemFromModal = deleteItemFromModal;
window.deleteInventarItem = deleteInventarItem;
window.renderInventoryTable = renderInventoryTable;
window.sortBestand = sortBestand;
window.editInventarItem = editInventarItem;
