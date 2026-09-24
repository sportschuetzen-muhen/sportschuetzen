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
//  ADMIN FELDER RENDERN
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
                                       "Gespendet_ID","Kauf_Spender_Jahr","Verkaeufer_ID","Kaufpreis","Depotbetrag"],
        "Inventar_Schluessel":        ["Bezeichnung","Nummer","Depotbetrag"],
        "Inventar_Kleidung":          ["Typ","Groesse","Kaufdatum","Kaufpreis","Depotbetrag"],
        "Inventar_Schiessbekleidung": ["Typ","Groesse","Kaufdatum","Kaufpreis","Depotbetrag"]
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
// =========================================================
//  SAVE / UPDATE
// =========================================================
async function saveNewInventarItem(e) {
    e.preventDefault();
    setInventarBusy(true);
    const target = document.getElementById('admin-target').value;
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
                supaItem.size = fields.Groesse || '';
            }

            const { error: saveErr } = await supa
                .from('inventory_items')
                .upsert(supaItem, { onConflict: 'id' });

            if (saveErr) throw new Error("Supabase Speicherfehler: " + saveErr.message);

            // Revisions-Auditlog eintragen
            await supa.from('inventory_audit_log').insert([{
                timestamp: new Date().toISOString(),
                user_name: currentUser || 'Vorstand',
                action: isUpdate ? 'updateItem' : 'addNewItem',
                details: `${target}: ID ${itemId} (${isUpdate ? 'aktualisiert' : 'neu erfasst'})`
            }]);
        }

        // Asynchroner Dual-Write zu Google Apps Script (DEAKTIVIERT - Supabase ist Single Source of Truth)
        /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
        apiFetch('inventar', '', {
            method: 'POST',
            body: JSON.stringify({ action: isUpdate ? "updateItem" : "addNewItem", targetSheet: target, fields })
        }).then(r => r.json())
          .then(res => console.log("✅ Dual-Write Item erfolgreich:", res))
          .catch(e => console.warn("⚠️ Dual-Write Item Fehler:", e));

        // Falls kein Supabase aktiv war, synchron auf GAS warten
        if (!supa || target === 'Personendaten') {
            await apiFetch('inventar', '', {
                method: 'POST',
                body: JSON.stringify({ action: isUpdate ? "updateItem" : "addNewItem", targetSheet: target, fields })
            });
        }
        ------------------------------------------------------- */

        e.target.reset();
        const idField = document.getElementById('admin-edit-id');
        if (idField) idField.remove();
        const btn = document.getElementById('btn-admin-save');
        btn.innerText = "Speichern";
        btn.classList.replace('btn-warning','btn-success');
        await loadInventarData(true);
        alert(isUpdate ? "✅ Änderung gespeichert (Supabase Master)!" : "✅ Neu erfasst (Supabase Master)!");
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
        alert("❌ Keine Berechtigung zum Löschen.");
        return;
    }

    if (!confirm(`Eintrag ${id} wirklich löschen?`)) return;

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
                user_name: currentUser || 'Vorstand',
                action: 'deleteItem',
                details: `${target}: ID ${id} gelöscht`
            }]);
        }

        // Asynchroner Dual-Write zu Google Apps Script (DEAKTIVIERT - Supabase ist Single Source of Truth)
        /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
        apiFetch('inventar', '', {
            method: 'POST',
            body: JSON.stringify({
                action: "deleteItem",
                targetSheet: target,
                itemId: id
            })
        }).then(r => r.json())
          .then(res => console.log("✅ Dual-Write Delete erfolgreich:", res))
          .catch(e => console.warn("⚠️ Dual-Write Delete Fehler:", e));

        if (!supa || target === 'Personendaten') {
            await apiFetch('inventar', '', {
                method: 'POST',
                body: JSON.stringify({
                    action: "deleteItem",
                    targetSheet: target,
                    itemId: id
                })
            });
        }
        ------------------------------------------------------- */

        await loadInventarData(true);

    } catch (err) {
        alert("Fehler: " + err.message);
    } finally {
        setInventarBusy(false);
    }
}
