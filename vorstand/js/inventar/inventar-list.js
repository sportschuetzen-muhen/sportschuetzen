// =========================================================
//  MODULE: INVENTAR - LIST
//  - Bestandesliste, Admin-Formular & CRUD Aktionen (Edit, Save, Delete)
// =========================================================

// =========================================================
//  BESTANDESLISTE
// =========================================================
// =========================================================
//  BESTANDESLISTE & FILTER-ENGINE
// =========================================================
let inventarFilterStatus = 'all';
let lastFilterTargetCategory = null;

function safeEscapeHtml(val) {
    if (typeof escapeHtml === 'function') return escapeHtml(val);
    return String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setInventarStatusFilter(statusVal) {
    if (inventarFilterStatus === statusVal && statusVal !== 'all') {
        inventarFilterStatus = 'all';
    } else {
        inventarFilterStatus = statusVal;
    }
    updateStatusPillButtons();
    renderInventoryTable();
}
window.setInventarStatusFilter = setInventarStatusFilter;

function updateStatusPillButtons() {
    const buttons = document.querySelectorAll('.inv-status-pills button');
    buttons.forEach(btn => {
        const btnStatus = btn.getAttribute('data-status');
        const isActive = (btnStatus === inventarFilterStatus);
        btn.classList.toggle('active', isActive);

        if (btnStatus === 'all') {
            btn.className = `btn btn-sm ${isActive ? 'btn-secondary' : 'btn-outline-secondary'} fw-semibold`;
        } else if (btnStatus === 'Im Lager' || btnStatus === 'Aktiv') {
            btn.className = `btn btn-sm ${isActive ? 'btn-success text-white' : 'btn-outline-success'} fw-semibold`;
        } else if (btnStatus === 'Ausgegeben' || btnStatus === 'Passiv') {
            btn.className = `btn btn-sm ${isActive ? 'btn-warning text-dark' : 'btn-outline-warning'} fw-semibold`;
        } else if (btnStatus === 'Verkauft') {
            btn.className = `btn btn-sm ${isActive ? 'btn-primary text-white' : 'btn-outline-primary'} fw-semibold`;
        } else if (btnStatus === 'Defekt' || btnStatus === 'Verstorben') {
            btn.className = `btn btn-sm ${isActive ? 'btn-danger text-white' : 'btn-outline-danger'} fw-semibold`;
        }
    });
}

function resetInventarFilters(triggerRender = true) {
    const searchInput = document.getElementById('inv-search-input');
    if (searchInput) searchInput.value = '';

    inventarFilterStatus = 'all';
    updateStatusPillButtons();

    const dropdownIds = [
        'inv-filter-typ', 'inv-filter-modell', 'inv-filter-hersteller',
        'inv-filter-groesse', 'inv-filter-besitzer', 'inv-filter-distanz',
        'inv-filter-bezeichnung', 'inv-filter-sponsor'
    ];
    dropdownIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    if (triggerRender) {
        renderInventoryTable();
    }
}
window.resetInventarFilters = resetInventarFilters;

function onInventarCategoryChange() {
    resetInventarFilters(false);
    updateInventarFilterDropdowns(true);
    renderInventoryTable();
}
window.onInventarCategoryChange = onInventarCategoryChange;

function updateInventarFilterDropdowns(force = false) {
    if (!inventarState) return;
    const target = document.getElementById('filter-liste')?.value || 'Inventar_Kleidung';
    if (!force && lastFilterTargetCategory === target) {
        return;
    }
    lastFilterTargetCategory = target;

    const keyMap = {
        "Inventar_Gewehre":           "gewehre",
        "Inventar_Schluessel":        "schluessel",
        "Inventar_Kleidung":          "kleidung",
        "Inventar_Schiessbekleidung": "schiessbekleidung",
        "Personendaten":              "mitglieder"
    };
    const rawData = inventarState[keyMap[target]] || [];

    const typSelect = document.getElementById('inv-filter-typ');
    const modellSelect = document.getElementById('inv-filter-modell');
    const herstellerSelect = document.getElementById('inv-filter-hersteller');
    const groesseSelect = document.getElementById('inv-filter-groesse');
    const besitzerSelect = document.getElementById('inv-filter-besitzer');
    const distanzSelect = document.getElementById('inv-filter-distanz');
    const bezeichnungSelect = document.getElementById('inv-filter-bezeichnung');
    const sponsorSelect = document.getElementById('inv-filter-sponsor');
    const filterRow = document.getElementById('inv-filter-dropdowns-row');

    if (target === 'Inventar_Kleidung' || target === 'Inventar_Schiessbekleidung') {
        if (filterRow) filterRow.classList.remove('d-none');
        if (typSelect) typSelect.classList.remove('d-none');
        if (modellSelect) modellSelect.classList.remove('d-none');
        if (herstellerSelect) herstellerSelect.classList.remove('d-none');
        if (groesseSelect) groesseSelect.classList.remove('d-none');
        if (besitzerSelect) besitzerSelect.classList.remove('d-none');
        if (distanzSelect) distanzSelect.classList.add('d-none');
        if (bezeichnungSelect) bezeichnungSelect.classList.add('d-none');
        if (sponsorSelect) sponsorSelect.classList.remove('d-none');
    } else if (target === 'Inventar_Gewehre') {
        if (filterRow) filterRow.classList.remove('d-none');
        if (typSelect) typSelect.classList.add('d-none');
        if (modellSelect) modellSelect.classList.remove('d-none');
        if (herstellerSelect) herstellerSelect.classList.remove('d-none');
        if (groesseSelect) groesseSelect.classList.add('d-none');
        if (besitzerSelect) besitzerSelect.classList.remove('d-none');
        if (distanzSelect) distanzSelect.classList.remove('d-none');
        if (bezeichnungSelect) bezeichnungSelect.classList.add('d-none');
        if (sponsorSelect) sponsorSelect.classList.add('d-none');
    } else if (target === 'Inventar_Schluessel') {
        if (filterRow) filterRow.classList.remove('d-none');
        if (typSelect) typSelect.classList.add('d-none');
        if (modellSelect) modellSelect.classList.add('d-none');
        if (herstellerSelect) herstellerSelect.classList.add('d-none');
        if (groesseSelect) groesseSelect.classList.add('d-none');
        if (besitzerSelect) besitzerSelect.classList.remove('d-none');
        if (distanzSelect) distanzSelect.classList.add('d-none');
        if (bezeichnungSelect) bezeichnungSelect.classList.remove('d-none');
        if (sponsorSelect) sponsorSelect.classList.add('d-none');
    } else {
        if (filterRow) filterRow.classList.add('d-none');
    }

    function populateDropdown(selectEl, defaultText, values) {
        if (!selectEl) return;
        const currentVal = selectEl.value;
        selectEl.innerHTML = `<option value="">${defaultText}</option>` +
            values.map(v => `<option value="${safeEscapeHtml(v)}">${safeEscapeHtml(v)}</option>`).join('');
        if (values.includes(currentVal)) {
            selectEl.value = currentVal;
        } else {
            selectEl.value = '';
        }
    }

    const uniqueTypes = [...new Set(rawData.map(r => r.Typ).filter(Boolean))].sort();
    const uniqueModels = [...new Set(rawData.map(r => r.Modell).filter(Boolean))].sort();
    const uniqueHersteller = [...new Set(rawData.map(r => r.Hersteller).filter(Boolean))].sort();
    const uniqueDistanz = [...new Set(rawData.map(r => r.Distanz).filter(Boolean))].sort();
    const uniqueBezeichnung = [...new Set(rawData.map(r => r.Bezeichnung).filter(Boolean))].sort();
    const uniqueSponsor = [...new Set(rawData.map(r => r.Sponsor_Firma).filter(Boolean))].sort();

    const sizeHierarchy = ['116', '128', '140', '152', '164', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL'];
    const uniqueGroessen = [...new Set(rawData.map(r => r.Groesse).filter(Boolean))].sort((a, b) => {
        const ia = sizeHierarchy.indexOf(String(a).toUpperCase());
        const ib = sizeHierarchy.indexOf(String(b).toUpperCase());
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return String(a).localeCompare(String(b));
    });

    populateDropdown(typSelect, '👕 Alle Typen', uniqueTypes);
    populateDropdown(modellSelect, '🏷️ Alle Modelle', uniqueModels);
    populateDropdown(herstellerSelect, '🏭 Alle Hersteller', uniqueHersteller);
    populateDropdown(groesseSelect, '📏 Alle Grössen', uniqueGroessen);
    populateDropdown(distanzSelect, '🎯 Alle Distanzen', uniqueDistanz);
    populateDropdown(bezeichnungSelect, '🔑 Alle Bezeichnungen', uniqueBezeichnung);
    populateDropdown(sponsorSelect, '🤝 Alle Sponsoren', uniqueSponsor);

    if (besitzerSelect) {
        const ownerCounts = {};
        rawData.forEach(r => {
            const oid = r.Aktueller_Besitzer_ID;
            if (oid && oid !== '' && oid !== '0') {
                ownerCounts[oid] = (ownerCounts[oid] || 0) + 1;
            }
        });

        const ownerEntries = Object.keys(ownerCounts).map(id => ({
            id: id,
            name: getInventarNameFromId(id),
            count: ownerCounts[id]
        })).sort((a, b) => a.name.localeCompare(b.name));

        const currentBesitzerVal = besitzerSelect.value;
        let besitzerHtml = `
            <option value="">👤 Alle Besitzer</option>
            <option value="__unassigned__">🟢 Frei (Im Lager / Ohne Besitzer)</option>
            <option value="__assigned__">👤 Zugewiesen (Mit Besitzer)</option>
        `;
        if (ownerEntries.length > 0) {
            besitzerHtml += `<optgroup label="Aktuelle Besitzer">`;
            ownerEntries.forEach(o => {
                besitzerHtml += `<option value="${safeEscapeHtml(o.id)}">${safeEscapeHtml(o.name)} (${o.count})</option>`;
            });
            besitzerHtml += `</optgroup>`;
        }
        besitzerSelect.innerHTML = besitzerHtml;
        if (currentBesitzerVal === '__unassigned__' || currentBesitzerVal === '__assigned__' || ownerCounts[currentBesitzerVal]) {
            besitzerSelect.value = currentBesitzerVal;
        } else {
            besitzerSelect.value = '';
        }
    }
}
window.updateInventarFilterDropdowns = updateInventarFilterDropdowns;

function sortBestand(col) {
    bestandSortDir = bestandSortCol === col
        ? (bestandSortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    bestandSortCol = col;
    renderInventoryTable();
}

function renderInventoryTable() {
    if (!inventarState) return;
    const target = document.getElementById('filter-liste')?.value || 'Inventar_Kleidung';
    const keyMap = {
        "Inventar_Gewehre":           "gewehre",
        "Inventar_Schluessel":        "schluessel",
        "Inventar_Kleidung":          "kleidung",
        "Inventar_Schiessbekleidung": "schiessbekleidung",
        "Personendaten":              "mitglieder"
    };
    const rawData = inventarState[keyMap[target]];
    const table   = document.getElementById('inventory-table');
    if (!table) return;

    // Filter-Dropdowns für aktuelle Kategorie synchronisieren
    updateInventarFilterDropdowns();

    if (!rawData?.length) {
        table.innerHTML = `<thead class="table-light border-bottom"><tr><th class="py-3 px-3">Keine Daten vorhanden</th></tr></thead><tbody><tr><td class="text-muted p-4 text-center">In dieser Kategorie sind noch keine Datensätze vorhanden.</td></tr></tbody>`;
        const statsEl = document.getElementById('inv-filter-stats');
        if (statsEl) statsEl.innerText = '0 Gegenstände';
        window._lastFilteredInventoryItems = [];
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

    // Filter-Werte auslesen
    const search = (document.getElementById('inv-search-input')?.value || '').toLowerCase().trim();
    const filterTyp = (document.getElementById('inv-filter-typ')?.value || '').trim();
    const filterModell = (document.getElementById('inv-filter-modell')?.value || '').trim();
    const filterHersteller = (document.getElementById('inv-filter-hersteller')?.value || '').trim();
    const filterGroesse = (document.getElementById('inv-filter-groesse')?.value || '').trim();
    const filterBesitzer = (document.getElementById('inv-filter-besitzer')?.value || '').trim();
    const filterDistanz = (document.getElementById('inv-filter-distanz')?.value || '').trim();
    const filterBezeichnung = (document.getElementById('inv-filter-bezeichnung')?.value || '').trim();
    const filterSponsor = (document.getElementById('inv-filter-sponsor')?.value || '').trim();

    // 1. Zwischenfilterung (alle Filter AUSSER Status)
    let intermediate = [...rawData];

    if (filterTyp) {
        intermediate = intermediate.filter(r => (r.Typ || '').trim().toLowerCase() === filterTyp.toLowerCase());
    }
    if (filterModell) {
        intermediate = intermediate.filter(r => (r.Modell || '').trim().toLowerCase() === filterModell.toLowerCase());
    }
    if (filterHersteller) {
        intermediate = intermediate.filter(r => (r.Hersteller || '').trim().toLowerCase() === filterHersteller.toLowerCase());
    }
    if (filterGroesse) {
        intermediate = intermediate.filter(r => (r.Groesse || '').trim().toLowerCase() === filterGroesse.toLowerCase());
    }
    if (filterBesitzer) {
        if (filterBesitzer === '__unassigned__') {
            intermediate = intermediate.filter(r => !r.Aktueller_Besitzer_ID || r.Aktueller_Besitzer_ID === '' || r.Aktueller_Besitzer_ID === '0');
        } else if (filterBesitzer === '__assigned__') {
            intermediate = intermediate.filter(r => r.Aktueller_Besitzer_ID && r.Aktueller_Besitzer_ID !== '' && r.Aktueller_Besitzer_ID !== '0');
        } else {
            intermediate = intermediate.filter(r => String(r.Aktueller_Besitzer_ID) === String(filterBesitzer));
        }
    }
    if (filterDistanz) {
        intermediate = intermediate.filter(r => (r.Distanz || '').trim().toLowerCase() === filterDistanz.toLowerCase());
    }
    if (filterBezeichnung) {
        intermediate = intermediate.filter(r => (r.Bezeichnung || '').trim().toLowerCase() === filterBezeichnung.toLowerCase());
    }
    if (filterSponsor) {
        intermediate = intermediate.filter(r => (r.Sponsor_Firma || '').trim().toLowerCase() === filterSponsor.toLowerCase());
    }
    if (search) {
        intermediate = intermediate.filter(row => {
            const hasDirectMatch = Object.values(row).some(v => {
                if (v === null || v === undefined) return false;
                return String(v).toLowerCase().includes(search);
            });
            if (hasDirectMatch) return true;
            if (row.Aktueller_Besitzer_ID) {
                const ownerName = getInventarNameFromId(row.Aktueller_Besitzer_ID).toLowerCase();
                if (ownerName.includes(search)) return true;
            }
            return false;
        });
    }

    // 2. Status-Pill Badges aktualisieren
    const countAll = intermediate.length;
    const countLager = intermediate.filter(r => (r.Status || '').trim().toLowerCase() === 'im lager' || (r.Status || '').trim().toLowerCase() === 'aktiv').length;
    const countAusgegeben = intermediate.filter(r => (r.Status || '').trim().toLowerCase() === 'ausgegeben' || (r.Status || '').trim().toLowerCase() === 'passiv').length;
    const countVerkauft = intermediate.filter(r => (r.Status || '').trim().toLowerCase() === 'verkauft').length;
    const countDefekt = intermediate.filter(r => (r.Status || '').trim().toLowerCase() === 'defekt' || (r.Status || '').trim().toLowerCase() === 'ausgemustert' || (r.Status || '').trim().toLowerCase() === 'verstorben').length;

    const elCountAll = document.getElementById('inv-count-all');
    const elCountLager = document.getElementById('inv-count-lager');
    const elCountAusgegeben = document.getElementById('inv-count-ausgegeben');
    const elCountVerkauft = document.getElementById('inv-count-verkauft');
    const elCountDefekt = document.getElementById('inv-count-defekt');
    const btnDefekt = document.getElementById('btn-status-defekt');

    if (elCountAll) elCountAll.innerText = countAll;
    if (elCountLager) elCountLager.innerText = countLager;
    if (elCountAusgegeben) elCountAusgegeben.innerText = countAusgegeben;
    if (elCountVerkauft) elCountVerkauft.innerText = countVerkauft;
    if (elCountDefekt) elCountDefekt.innerText = countDefekt;
    if (btnDefekt) {
        if (countDefekt > 0) btnDefekt.classList.remove('d-none');
        else btnDefekt.classList.add('d-none');
    }

    // 3. Status-Filter anwenden
    let sorted = [...intermediate];
    if (inventarFilterStatus && inventarFilterStatus !== 'all') {
        sorted = sorted.filter(row => {
            const st = (row.Status || '').trim().toLowerCase();
            if (inventarFilterStatus === 'Im Lager') {
                return st === 'im lager' || st === 'aktiv';
            }
            if (inventarFilterStatus === 'Ausgegeben') {
                return st === 'ausgegeben' || st === 'passiv';
            }
            if (inventarFilterStatus === 'Verkauft') {
                return st === 'verkauft';
            }
            if (inventarFilterStatus === 'Defekt') {
                return st === 'defekt' || st === 'ausgemustert' || st === 'verstorben';
            }
            return st === inventarFilterStatus.toLowerCase();
        });
    }

    // Gefilterten Stand merken (für Excel-Export & Druck)
    window._lastFilteredInventoryItems = sorted;

    // Treffer-Statistik & Reset-Button Sichtbarkeit
    const hasActiveFilters = Boolean(
        search ||
        (inventarFilterStatus && inventarFilterStatus !== 'all') ||
        filterTyp || filterModell || filterHersteller || filterGroesse ||
        filterBesitzer || filterDistanz || filterBezeichnung || filterSponsor
    );

    const resetBtn = document.getElementById('btn-inv-reset-filters');
    if (resetBtn) {
        resetBtn.classList.toggle('d-none', !hasActiveFilters);
    }

    const statsEl = document.getElementById('inv-filter-stats');
    if (statsEl) {
        const noun = target === 'Personendaten' ? 'Mitgliedern' : 'Artikeln';
        if (hasActiveFilters) {
            statsEl.innerHTML = `<span class="text-primary fw-bold">Zeige ${sorted.length}</span> von ${rawData.length} ${noun}`;
        } else {
            statsEl.innerText = `${rawData.length} ${target === 'Personendaten' ? 'Mitglieder' : 'Gegenstände'}`;
        }
    }

    if (sorted.length === 0) {
        table.innerHTML = `<thead class="table-light border-bottom"><tr><th class="py-3 px-3">Keine Treffer</th></tr></thead><tbody><tr><td class="text-muted p-4 text-center">Kein Gegenstand entspricht deinen aktuellen Filterkriterien. <button class="btn btn-sm btn-link p-0 text-decoration-none ms-1" onclick="resetInventarFilters(true)">Filter zurücksetzen</button></td></tr></tbody>`;
        return;
    }

    // Header mit Sortier-Pfeilen (Globaler Design-Standard)
    let html = '<thead class="table-light"><tr class="border-bottom">';
    // ID-Spalte (links fixiert)
    html += `<th class="inv-col-sticky-id" style="cursor:pointer;user-select:none;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:0.5px;color:#475569;"
                 data-sort-key="ID" data-col-id="col_id" onclick="sortBestand('ID')">
                 ID
                 <span class="text-muted small">${bestandSortCol === 'ID' ? (bestandSortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
             </th>`;

    const colLabels = {
        'Grundpreis': 'Einstandspreis Material',
        'Veredelung': 'Einstandspreis Druck',
        'Kaufpreis': 'Total Einstandspreis',
        'Katalogpreis': 'Verkaufspreis gerundet',
        'Sponsoring': 'Sponsoring Beitrag',
        'Sponsor_Firma': 'Sponsor-Firma',
        'Verkaufspreis': 'Endpreis für Mitglied',
        'Groesse': 'Grösse',
        'Schaft': 'Schaft',
        'Aktueller_Besitzer_ID': 'Besitzer'
    };

    const defaultHiddenCols = {
        'Inventar_Kleidung': ['Grundpreis', 'Veredelung', 'Kaufpreis', 'Kaufdatum', 'Depotbetrag'],
        'Inventar_Schiessbekleidung': ['Kaufpreis', 'Kaufdatum'],
        'Inventar_Gewehre': ['Ringkorn', 'Zubehoer', 'Spezielles', 'Verkaeufer_ID', 'Kauf_Spender_Jahr']
    };

    displayHeaders.forEach((h, idx) => {
        const arrow = bestandSortCol === h
            ? (bestandSortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
        const label = colLabels[h] || h.replace(/_/g,' ');
        const isHiddenDefault = (defaultHiddenCols[target] || []).includes(h);
        html += `<th style="cursor:pointer;user-select:none;white-space:normal;line-height:1.25;vertical-align:bottom;font-size:12px;font-weight:700;letter-spacing:0.3px;color:#475569;min-width:80px;"
                     data-sort-key="${h}" data-col-id="col_${h.toLowerCase()}"
                     ${isHiddenDefault ? 'data-col-default="hidden"' : ''}
                     onclick="sortBestand('${h}')">
                     <span class="d-inline-block">${label}</span>
                     <span class="text-muted small">${arrow}</span>
                 </th>`;
    });
    // Aktionen-Spalte (rechts fixiert)
    html += '<th class="text-center inv-col-sticky-action" style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:#475569;white-space:normal;vertical-align:bottom;" data-col-id="col_aktionen" data-col-toggle="false">Aktionen</th></tr></thead><tbody>';

    html += sorted.map(row => {
        const idCell = `<td class="font-monospace fw-bold text-primary inv-col-sticky-id" data-col-id="col_id">${row.ID || '-'}</td>`;
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

        return `<tr>${idCell}${cells}<td class="text-center inv-col-sticky-action" data-col-id="col_aktionen">
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
            storageKey: `tk_inv_widths_${target}`,
            columns: {
                'col_id': { resizable: false, defaultWidth: 80 },
                'col_aktionen': { resizable: false, defaultWidth: 95 }
            }
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
        "Inventar_Gewehre":           ["Hersteller","Modell","Laufnummer","Diopter","Ringkorn","Schaft",
                                       "Zubehoer","Spezielles","Distanz","Eigentümer_ID",
                                       "Gespendet_ID","Kauf_Spender_Jahr","Verkaeufer_ID","Kaufpreis","Depotbetrag"],
        "Inventar_Schluessel":        ["Bezeichnung","Nummer","Depotbetrag"],
        "Inventar_Kleidung":          ["Typ","Modell","Hersteller","Groesse","Kaufdatum","Verkaufspreis","Katalogpreis","Sponsoring","Sponsor_Firma","Kaufpreis","Grundpreis","Veredelung","Depotbetrag"],
        "Inventar_Schiessbekleidung": ["Typ","Modell","Hersteller","Groesse","Kaufdatum","Sponsor_Firma","Kaufpreis","Depotbetrag"]
    };
    const dropdownMapping = {
        "Status":      "MG_Status",
        "Bezeichnung": "Schluessel_Bezeichnung",
        "Distanz":     "Gewehre_Distanz",
        "Typ":         target==="Inventar_Schiessbekleidung" ? "Schiessbekleidung_Typ":"Kleidung_Typ",
        "Groesse":     "Kleidung_Schiessbekleidung_Groesse"
    };

    const fieldLabels = {
        "Schaft": "Schaft / Schaftart",
        "Grundpreis": "Einstandspreis Material CHF",
        "Veredelung": "Einstandspreis Druck CHF",
        "Kaufpreis": "Total Einstandspreis CHF",
        "Katalogpreis": "Verkaufspreis gerundet CHF",
        "Sponsoring": "Sponsoring Beitrag CHF",
        "Sponsor_Firma": "Sponsor-Firma",
        "Verkaufspreis": "Endpreis für Mitglied CHF",
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
                supaItem.stock = fields.Schaft ? fields.Schaft.trim() : null;
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
                supaItem.sponsor_company = fields.Sponsor_Firma ? fields.Sponsor_Firma.trim() : null;
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
window.setInventarStatusFilter = setInventarStatusFilter;
window.resetInventarFilters = resetInventarFilters;
window.onInventarCategoryChange = onInventarCategoryChange;
window.updateInventarFilterDropdowns = updateInventarFilterDropdowns;
