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
//  SAVE / UPDATE
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
