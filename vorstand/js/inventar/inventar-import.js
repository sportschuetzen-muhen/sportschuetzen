// =====================================================================
// MODUL: INVENTAR - EXCEL & CSV IMPORT ENGINE (SheetJS)
// Unterstützt .xlsx, .xls und .csv für Kleidung, Schlüssel, Gewehre
// =====================================================================

window.openInventarExcelImportModal = function() {
    let modalEl = document.getElementById('invModalExcelImport');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'invModalExcelImport';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modalEl);
    }

    const currentFilter = document.getElementById('filter-liste') ? document.getElementById('filter-liste').value : 'Inventar_Kleidung';
    let defaultCat = 'kleidung';
    if (currentFilter.includes('Gewehre')) defaultCat = 'gewehr';
    else if (currentFilter.includes('Schluessel')) defaultCat = 'schluessel';
    else if (currentFilter.includes('Schiessbekleidung')) defaultCat = 'schiessbekleidung';

    modalEl.innerHTML = `
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content border-0 rounded-4 shadow-lg">
                <div class="modal-header bg-success text-white border-0 py-3 rounded-top-4">
                    <div>
                        <h5 class="modal-title fw-bold mb-0">
                            <i class="fas fa-file-excel me-2"></i>Inventar: Excel / CSV Import
                        </h5>
                        <div class="small text-white-50 mt-0.5">Schneller Massenimport von Inventargegenständen via .xlsx, .xls oder .csv</div>
                    </div>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>

                <div class="modal-body p-4">
                    <!-- Steuerungsleiste & Muster-Download -->
                    <div class="row g-3 align-items-end mb-4 bg-light p-3 rounded-3 border">
                        <div class="col-md-4">
                            <label class="form-label fw-bold small text-muted">Ziel-Kategorie</label>
                            <select class="form-select form-select-sm" id="inv-import-category" onchange="invOnImportCategoryChange(this.value)">
                                <option value="kleidung" ${defaultCat === 'kleidung' ? 'selected' : ''}>👕 Vereinskleidung (K-*)</option>
                                <option value="schluessel" ${defaultCat === 'schluessel' ? 'selected' : ''}>🔑 Schlüssel (SCH-*)</option>
                                <option value="gewehr" ${defaultCat === 'gewehr' ? 'selected' : ''}>🎯 Sportwaffen / Gewehre (G-*)</option>
                                <option value="schiessbekleidung" ${defaultCat === 'schiessbekleidung' ? 'selected' : ''}>🧥 Schiessbekleidung (SB-*)</option>
                            </select>
                        </div>
                        <div class="col-md-5">
                            <label class="form-label fw-bold small text-muted">Datei auswählen (.xlsx, .xls, .csv)</label>
                            <input type="file" class="form-control form-control-sm" id="inv-import-file-input" accept=".xlsx,.xls,.csv" onchange="invHandleImportFileSelect(event)">
                        </div>
                        <div class="col-md-3 text-md-end">
                            <button type="button" class="btn btn-outline-success btn-sm fw-bold w-100" onclick="invDownloadExcelTemplate()">
                                <i class="fas fa-download me-1"></i> Muster-Vorlage (.xlsx)
                            </button>
                        </div>
                    </div>

                    <!-- Dropzone -->
                    <div id="inv-import-dropzone" class="border border-2 border-dashed rounded-3 p-4 text-center mb-3 bg-white" 
                         style="cursor: pointer; border-color: #cbd5e1 !important;"
                         onclick="document.getElementById('inv-import-file-input').click()"
                         ondragover="event.preventDefault(); this.style.borderColor='#198754';"
                         ondragleave="this.style.borderColor='#cbd5e1';"
                         ondrop="invHandleDrop(event)">
                        <i class="fas fa-cloud-arrow-up text-success fs-1 mb-2"></i>
                        <h6 class="fw-bold mb-1">Datei hier ablegen oder durchsuchen</h6>
                        <p class="text-muted small mb-0">Unterstützt Excel-Dateien (.xlsx, .xls) sowie formatierte CSV-Dateien mit Kopfzeile</p>
                    </div>

                    <!-- Feedback & Info-Leiste -->
                    <div id="inv-import-stats" class="d-none alert alert-info py-2 px-3 small rounded-3 mb-3 d-flex justify-content-between align-items-center">
                        <div>
                            <i class="fas fa-info-circle me-1"></i>
                            <span id="inv-import-stats-text">0 Datensätze geladen</span>
                        </div>
                        <span class="badge bg-success" id="inv-import-badge-valid">0 bereit</span>
                    </div>

                    <!-- Vorschau-Tabelle -->
                    <div class="table-responsive border rounded-3 mb-3 d-none" id="inv-import-preview-wrapper" style="max-height: 380px; overflow-y: auto;">
                        <table class="table table-hover table-sm align-middle mb-0" id="inv-import-preview-table" style="font-size: 13px;">
                            <thead class="table-dark sticky-top">
                                <tr id="inv-import-preview-thead"></tr>
                            </thead>
                            <tbody id="inv-import-preview-tbody"></tbody>
                        </table>
                    </div>
                </div>

                <div class="modal-footer bg-light border-0 py-2.5 rounded-bottom-4">
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
                    <button type="button" class="btn btn-sm btn-success fw-bold px-4" id="btn-inv-do-import" disabled onclick="invExecuteImport()">
                        <i class="fas fa-check-circle me-1"></i> Jetzt importieren
                    </button>
                </div>
            </div>
        </div>
    `;

    window._invImportParsedRows = [];
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
};

window.invOnImportCategoryChange = function(cat) {
    if (window._invImportRawData) {
        invProcessRawData(window._invImportRawData);
    }
};

window.invHandleDrop = function(e) {
    e.preventDefault();
    document.getElementById('inv-import-dropzone').style.borderColor = '#cbd5e1';
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        document.getElementById('inv-import-file-input').files = e.dataTransfer.files;
        invParseFile(e.dataTransfer.files[0]);
    }
};

window.invHandleImportFileSelect = function(e) {
    if (e.target.files && e.target.files.length > 0) {
        invParseFile(e.target.files[0]);
    }
};

window.invParseFile = function(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        alert("❌ Fehler: SheetJS (XLSX) Bibliothek ist im Portal nicht verfügbar.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (!jsonRows || jsonRows.length < 2) {
                alert("⚠️ Die Datei enthält keine Datenzeilen.");
                return;
            }

            window._invImportRawData = jsonRows;
            invProcessRawData(jsonRows);
        } catch (err) {
            console.error("Fehler beim Lesen der Excel-Datei:", err);
            alert("❌ Fehler beim Lesen der Datei: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
};

window.invProcessRawData = function(jsonRows) {
    const rawHeaders = (jsonRows[0] || []).map(h => String(h || '').trim());
    const dataRows = jsonRows.slice(1).filter(r => r && r.some(c => c !== undefined && c !== null && String(c).trim() !== ''));

    const category = document.getElementById('inv-import-category').value;
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const headerIndices = {};
    rawHeaders.forEach((h, idx) => {
        const n = norm(h);
        if (n === 'id' || n === 'artikelid' || n === 'nummer') headerIndices.id = idx;
        else if (n === 'typ' || n === 'artikel' || n === 'bezeichnung' || n === 'kategorie') headerIndices.typ = idx;
        else if (n === 'modell' || n === 'model') headerIndices.modell = idx;
        else if (n === 'hersteller' || n === 'marke') headerIndices.hersteller = idx;
        else if (n === 'groesse' || n === 'grosse' || n === 'size') headerIndices.groesse = idx;
        else if (n === 'status') headerIndices.status = idx;
        else if (n === 'kaufpreis' || n === 'ek' || n === 'selbstkosten' || n === 'einkaufspreis') headerIndices.kaufpreis = idx;
        else if (n === 'verkaufspreis' || n === 'vk' || n === 'mitgliederpreis' || n === 'endpreis') headerIndices.verkaufspreis = idx;
        else if (n === 'katalogpreis' || n === 'uvp' || n === 'bruttopreis') headerIndices.katalogpreis = idx;
        else if (n === 'sponsoring' || n === 'rabatt' || n === 'subvention') headerIndices.sponsoring = idx;
        else if (n === 'depot' || n === 'depotbetrag' || n === 'pfand' || n === 'kaution') headerIndices.depotbetrag = idx;
        else if (n === 'kaufdatum' || n === 'datum') headerIndices.kaufdatum = idx;
        else if (n === 'laufnummer' || n === 'seriennummer') headerIndices.seriennummer = idx;
        else if (n === 'diopter') headerIndices.diopter = idx;
        else if (n === 'ringkorn') headerIndices.ringkorn = idx;
        else if (n === 'distanz') headerIndices.distanz = idx;
    });

    const parsedItems = [];
    const prefixMap = { kleidung: 'K', schluessel: 'SCH', gewehr: 'G', schiessbekleidung: 'SB' };
    const prefix = prefixMap[category] || 'K';

    const existingItems = inventarState?.[category === 'kleidung' ? 'kleidung' : (category === 'gewehr' ? 'gewehre' : (category === 'schluessel' ? 'schluessel' : 'schiessbekleidung'))] || [];
    let nextNum = 1;
    existingItems.forEach(it => {
        const m = String(it.ID).match(new RegExp(`^${prefix}-(\\d+)`, 'i'));
        if (m) nextNum = Math.max(nextNum, parseInt(m[1], 10) + 1);
    });

    dataRows.forEach((row) => {
        let idVal = headerIndices.id !== undefined && row[headerIndices.id] ? String(row[headerIndices.id]).trim() : '';
        if (!idVal) {
            idVal = `${prefix}-${nextNum++}`;
        }

        const parseNum = v => {
            if (v === undefined || v === null || v === '') return null;
            const n = parseFloat(String(v).replace("'", "").replace("CHF", "").replace(",", ".").trim());
            return isNaN(n) ? null : n;
        };

        const itemObj = {
            id: idVal,
            category: category,
            status: (headerIndices.status !== undefined && row[headerIndices.status]) ? String(row[headerIndices.status]).trim() : 'Im Lager',
            item_type: (headerIndices.typ !== undefined && row[headerIndices.typ]) ? String(row[headerIndices.typ]).trim() : '',
            model: (headerIndices.modell !== undefined && row[headerIndices.modell]) ? String(row[headerIndices.modell]).trim() : null,
            manufacturer: (headerIndices.hersteller !== undefined && row[headerIndices.hersteller]) ? String(row[headerIndices.hersteller]).trim() : (category === 'kleidung' ? 'Erima' : null),
            size: (headerIndices.groesse !== undefined && row[headerIndices.groesse]) ? String(row[headerIndices.groesse]).trim() : null,
            purchase_price: parseNum(headerIndices.kaufpreis !== undefined ? row[headerIndices.kaufpreis] : null),
            selling_price: parseNum(headerIndices.verkaufspreis !== undefined ? row[headerIndices.verkaufspreis] : null),
            retail_price: parseNum(headerIndices.katalogpreis !== undefined ? row[headerIndices.katalogpreis] : null),
            discount_amount: parseNum(headerIndices.sponsoring !== undefined ? row[headerIndices.sponsoring] : null),
            depot_amount: parseNum(headerIndices.depotbetrag !== undefined ? row[headerIndices.depotbetrag] : 0) || 0,
            purchase_date: (headerIndices.kaufdatum !== undefined && row[headerIndices.kaufdatum]) ? String(row[headerIndices.kaufdatum]).slice(0, 10) : new Date().toISOString().slice(0, 10),
            serial_number: (headerIndices.seriennummer !== undefined && row[headerIndices.seriennummer]) ? String(row[headerIndices.seriennummer]).trim() : null,
            key_name: (category === 'schluessel' && headerIndices.typ !== undefined) ? String(row[headerIndices.typ]).trim() : null,
            key_number: (category === 'schluessel' && headerIndices.seriennummer !== undefined) ? String(row[headerIndices.seriennummer]).trim() : null
        };

        // Auf ganze Franken runden falls Dezimalstellen vorhanden (gemäss Vorstands-Vorgabe)
        if (itemObj.purchase_price !== null) itemObj.purchase_price = Math.round(itemObj.purchase_price);
        if (itemObj.selling_price !== null) itemObj.selling_price = Math.round(itemObj.selling_price);
        if (itemObj.retail_price !== null) itemObj.retail_price = Math.round(itemObj.retail_price);
        if (itemObj.discount_amount !== null) itemObj.discount_amount = Math.round(itemObj.discount_amount);

        parsedItems.push(itemObj);
    });

    window._invImportParsedRows = parsedItems;
    invRenderPreview(parsedItems, category);
};

window.invRenderPreview = function(items, category) {
    const statsEl = document.getElementById('inv-import-stats');
    const statsText = document.getElementById('inv-import-stats-text');
    const badgeValid = document.getElementById('inv-import-badge-valid');
    const tableWrap = document.getElementById('inv-import-preview-wrapper');
    const thead = document.getElementById('inv-import-preview-thead');
    const tbody = document.getElementById('inv-import-preview-tbody');
    const btnImport = document.getElementById('btn-inv-do-import');

    if (!items || items.length === 0) {
        statsEl.classList.add('d-none');
        tableWrap.classList.add('d-none');
        btnImport.disabled = true;
        return;
    }

    statsEl.classList.remove('d-none');
    tableWrap.classList.remove('d-none');
    btnImport.disabled = false;

    statsText.innerText = `${items.length} Datensätze aus Datei erfolgreich analysiert`;
    badgeValid.innerText = `${items.length} bereit zum Import`;

    if (category === 'kleidung') {
        thead.innerHTML = `
            <th>ID</th>
            <th>Typ</th>
            <th>Modell</th>
            <th>Grösse</th>
            <th class="text-end">Einkauf (CHF)</th>
            <th class="text-end">Katalog (CHF)</th>
            <th class="text-end">Sponsoring (CHF)</th>
            <th class="text-end">Verkauf (CHF)</th>
            <th>Status</th>
        `;
        tbody.innerHTML = items.map(it => `
            <tr>
                <td class="font-monospace fw-bold text-primary">${escapeHtml(it.id)}</td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(it.item_type || '-')}</span></td>
                <td>${escapeHtml(it.model || '-')}</td>
                <td><span class="badge bg-secondary-subtle text-secondary border">${escapeHtml(it.size || '-')}</span></td>
                <td class="text-end font-monospace">${it.purchase_price !== null ? it.purchase_price + '.00' : '-'}</td>
                <td class="text-end font-monospace text-muted">${it.retail_price !== null ? it.retail_price + '.00' : '-'}</td>
                <td class="text-end font-monospace text-danger">${it.discount_amount !== null ? '-' + it.discount_amount + '.00' : '-'}</td>
                <td class="text-end font-monospace fw-bold text-success">${it.selling_price !== null ? it.selling_price + '.00' : '-'}</td>
                <td><span class="badge bg-success-subtle text-success border">${escapeHtml(it.status)}</span></td>
            </tr>
        `).join('');
    } else {
        thead.innerHTML = `
            <th>ID</th>
            <th>Bezeichnung / Typ</th>
            <th>Hersteller / Details</th>
            <th class="text-end">Kaufpreis (CHF)</th>
            <th class="text-end">Depot (CHF)</th>
            <th>Status</th>
        `;
        tbody.innerHTML = items.map(it => `
            <tr>
                <td class="font-monospace fw-bold text-primary">${escapeHtml(it.id)}</td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(it.item_type || it.key_name || '-')}</span></td>
                <td>${escapeHtml(it.manufacturer || it.model || it.serial_number || '-')}</td>
                <td class="text-end font-monospace">${it.purchase_price !== null ? it.purchase_price + '.00' : '-'}</td>
                <td class="text-end font-monospace text-primary">${it.depot_amount ? Number(it.depot_amount).toFixed(2) : '-'}</td>
                <td><span class="badge bg-success-subtle text-success border">${escapeHtml(it.status)}</span></td>
            </tr>
        `).join('');
    }
};

window.invExecuteImport = function() {
    const items = window._invImportParsedRows;
    if (!items || items.length === 0) return;

    if (!confirm(`Möchten Sie ${items.length} Datensätze jetzt verbindlich in die Supabase-Datenbank importieren?`)) {
        return;
    }

    const btn = document.getElementById('btn-inv-do-import');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Importiere...';

    const supa = (typeof getInventarSupabaseClient === 'function') ? getInventarSupabaseClient() : (window.supabaseClient || null);
    if (!supa) {
        alert("❌ Supabase Client nicht initialisiert.");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Jetzt importieren';
        return;
    }

    // Upsert in Batches von 50
    const category = document.getElementById('inv-import-category').value;
    supa.from('inventory_items')
        .upsert(items, { onConflict: 'id' })
        .then(async ({ error }) => {
            if (error) {
                console.error("Import-Fehler:", error);
                alert("❌ Fehler beim Importieren: " + error.message);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Jetzt importieren';
                return;
            }

            // Audit Log
            try {
                await supa.from('inventory_audit_log').insert([{
                    timestamp: new Date().toISOString(),
                    user_name: (window.currentUser || localStorage.getItem('portal_user') || 'Vorstand'),
                    action: 'excelImport',
                    details: `Excel-Import: ${items.length} Artikel in Kategorie ${category} importiert.`
                }]);
            } catch (_) {}

            alert(`✅ ${items.length} Datensätze erfolgreich in Supabase importiert!`);
            const modalEl = document.getElementById('invModalExcelImport');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Neu laden
            await loadInventarData(true);
        })
        .catch(err => {
            console.error("Import Exception:", err);
            alert("❌ Ausnahme beim Import: " + err.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Jetzt importieren';
        });
};

window.invDownloadExcelTemplate = function() {
    if (typeof XLSX === 'undefined') {
        alert("SheetJS ist nicht verfügbar.");
        return;
    }

    const category = document.getElementById('inv-import-category') ? document.getElementById('inv-import-category').value : 'kleidung';
    let sampleData = [];
    let fileName = `Muster_Inventar_${category}.xlsx`;

    if (category === 'kleidung') {
        sampleData = [
            {
                "ID": "K-1",
                "Typ": "Trainerjacke",
                "Modell": "Erima Celebrate 125",
                "Hersteller": "Erima",
                "Groesse": "XS",
                "Kaufpreis": 80,
                "Katalogpreis": 83,
                "Sponsoring": 20,
                "Verkaufspreis": 63,
                "Status": "Im Lager"
            },
            {
                "ID": "K-22",
                "Typ": "Softshell-Jacke",
                "Modell": "Erima Function",
                "Hersteller": "Erima",
                "Groesse": "38",
                "Kaufpreis": 122,
                "Katalogpreis": 127,
                "Sponsoring": 31,
                "Verkaufspreis": 96,
                "Status": "Im Lager"
            },
            {
                "ID": "K-25",
                "Typ": "Team-Jacke",
                "Modell": "Erima Team Jacke m. abnehmb. Ärmeln",
                "Hersteller": "Erima",
                "Groesse": "S",
                "Kaufpreis": 110,
                "Katalogpreis": 114,
                "Sponsoring": 27,
                "Verkaufspreis": 87,
                "Status": "Im Lager"
            },
            {
                "ID": "K-28",
                "Typ": "Poloshirt",
                "Modell": "Erima Celebrate 125",
                "Hersteller": "Erima",
                "Groesse": "XXL",
                "Kaufpreis": 69,
                "Katalogpreis": 72,
                "Sponsoring": 17,
                "Verkaufspreis": 55,
                "Status": "Im Lager"
            },
            {
                "ID": "K-30",
                "Typ": "T-Shirt",
                "Modell": "Erima Celebrate 125",
                "Hersteller": "Erima",
                "Groesse": "S",
                "Kaufpreis": 65,
                "Katalogpreis": 68,
                "Sponsoring": 17,
                "Verkaufspreis": 51,
                "Status": "Im Lager"
            },
            {
                "ID": "K-46",
                "Typ": "T-Shirt",
                "Modell": "Erima Celebrate 125",
                "Hersteller": "Erima",
                "Groesse": "164",
                "Kaufpreis": 62,
                "Katalogpreis": 65,
                "Sponsoring": 16,
                "Verkaufspreis": 49,
                "Status": "Im Lager"
            }
        ];
    } else if (category === 'schluessel') {
        sampleData = [
            {
                "ID": "SCH-1",
                "Bezeichnung": "Hauptschlüssel Schützenstube",
                "Nummer": "2410",
                "Depotbetrag": 50,
                "Status": "Im Lager"
            },
            {
                "ID": "SCH-2",
                "Bezeichnung": "Anlagenschlüssel 50m Stand",
                "Nummer": "5001",
                "Depotbetrag": 50,
                "Status": "Im Lager"
            }
        ];
    } else {
        sampleData = [
            {
                "ID": "G-1",
                "Hersteller": "Bleiker",
                "Modell": "Challenger",
                "Laufnummer": "CH-9812",
                "Diopter": "Gehmann 510",
                "Ringkorn": "Centra 3.8",
                "Distanz": "50m",
                "Kaufpreis": 2500,
                "Depotbetrag": 200,
                "Status": "Im Lager"
            }
        ];
    }

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventar");
    XLSX.writeFile(wb, fileName);
};
