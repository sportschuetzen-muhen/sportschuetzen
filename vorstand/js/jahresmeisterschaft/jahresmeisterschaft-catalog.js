// vorstand/js/jahresmeisterschaft/jahresmeisterschaft-catalog.js
// ============================================================
// MODUL: JAHRESMEISTERSCHAFT - SCHÜTZENFESTE-KATALOG & MATCHING
// Verwaltet die Stammdaten bekannter Schiessanlässe, Suchbegriffe
// und Maximalpunkte für automatisches KI- & OCR-Matching.
// ============================================================

let _jmCatalogCache = null;
let _jmCatalogFilter = '';
let _jmCatalogStatusFilter = 'all'; // 'all', 'active', 'inactive'
let _jmCatalogSortKey = 'anlass';
let _jmCatalogSortDir = 'asc';
let _jmCatalogTableController = null;

/**
 * Lädt alle Schützenfeste aus public.jm_competitions_catalog.
 */
async function loadJMSchuetzenfesteCatalog(forceRefresh = false) {
    if (_jmCatalogCache && !forceRefresh) {
        return _jmCatalogCache;
    }

    const sb = getJMSupabaseClient();
    if (!sb) {
        console.warn("Supabase-Client für Schützenfeste-Katalog nicht bereit.");
        return [];
    }

    try {
        const { data, error } = await sb
            .from('jm_competitions_catalog')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('anlass', { ascending: true });

        if (error) throw error;
        _jmCatalogCache = data || [];
        return _jmCatalogCache;
    } catch (err) {
        console.error("Fehler beim Laden des Schützenfeste-Katalogs:", err);
        return [];
    }
}
window.loadJMSchuetzenfesteCatalog = loadJMSchuetzenfesteCatalog;

/**
 * Öffnet das Verwaltungs-Modal für den Schützenfeste-Katalog.
 */
async function openJMSchuetzenfesteModal() {
    const modalElem = document.getElementById('jm-schuetzenfeste-modal');
    if (!modalElem) return;

    // Globalen UIModalKit Standard aktivieren (Drag, Resize, Maximize)
    if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
        modalElem._uiModalKitInitialized = false;
        window.UIModalKit.makeMovableAndResizable(modalElem);
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalElem);
    modal.show();

    await renderJMSchuetzenfesteTable();
}
window.openJMSchuetzenfesteModal = openJMSchuetzenfesteModal;

/**
 * Rendert die Tabelle im Schützenfeste-Katalog-Modal.
 */
async function renderJMSchuetzenfesteTable() {
    const tbody = document.getElementById('jm-catalog-table-body');
    const countBadge = document.getElementById('jm-catalog-count-badge');
    const clearBtn = document.getElementById('jm-catalog-search-clear');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade Schützenfeste...</td></tr>`;

    const catalog = await loadJMSchuetzenfesteCatalog();
    const filter = (_jmCatalogFilter || '').toLowerCase().trim();

    // 1. Zähler für Status-Pills aktualisieren
    const totalCount = catalog.length;
    const activeCount = catalog.filter(c => c.is_active !== false).length;
    const inactiveCount = catalog.filter(c => c.is_active === false).length;

    const elCountAll = document.getElementById('jm-cat-count-all');
    const elCountActive = document.getElementById('jm-cat-count-active');
    const elCountInactive = document.getElementById('jm-cat-count-inactive');
    if (elCountAll) elCountAll.innerText = totalCount;
    if (elCountActive) elCountActive.innerText = activeCount;
    if (elCountInactive) elCountInactive.innerText = inactiveCount;

    // Button-Active States der Status-Pills aktualisieren
    const btnAll = document.getElementById('btn-cat-filter-all');
    const btnActive = document.getElementById('btn-cat-filter-active');
    const btnInactive = document.getElementById('btn-cat-filter-inactive');
    if (btnAll) btnAll.classList.toggle('active', _jmCatalogStatusFilter === 'all');
    if (btnActive) btnActive.classList.toggle('active', _jmCatalogStatusFilter === 'active');
    if (btnInactive) btnInactive.classList.toggle('active', _jmCatalogStatusFilter === 'inactive');

    // Clear-Button Anzeige
    if (clearBtn) {
        clearBtn.style.display = filter ? 'block' : 'none';
    }

    // 2. Filtern nach Status und Text
    let filtered = catalog.filter(item => {
        // Statusfilter
        if (_jmCatalogStatusFilter === 'active' && item.is_active === false) return false;
        if (_jmCatalogStatusFilter === 'inactive' && item.is_active !== false) return false;

        // Textfilter
        if (!filter) return true;
        const anlass = (item.anlass || '').toLowerCase();
        const ort = (item.ort || '').toLowerCase();
        const such = (item.suchbegriffe || '').toLowerCase();
        const typ = (item.stich_typ || '').toLowerCase();
        return anlass.includes(filter) || ort.includes(filter) || such.includes(filter) || typ.includes(filter);
    });

    if (countBadge) {
        countBadge.innerText = `${filtered.length} von ${totalCount} Schützenfeste`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fas fa-search me-2"></i>Keine passenden Schützenfeste gefunden.</td></tr>`;
        return;
    }

    // 3. Sortierung anwenden
    if (_jmCatalogSortKey) {
        filtered.sort((a, b) => {
            let valA, valB;
            switch (_jmCatalogSortKey) {
                case 'anlass':
                    valA = (a.anlass || '').toLowerCase();
                    valB = (b.anlass || '').toLowerCase();
                    break;
                case 'ort':
                    valA = (a.ort || '').toLowerCase();
                    valB = (b.ort || '').toLowerCase();
                    break;
                case 'max_punkte':
                    valA = parseFloat(a.max_punkte) || 0;
                    valB = parseFloat(b.max_punkte) || 0;
                    break;
                case 'stich_typ':
                    valA = (a.stich_typ || '').toLowerCase();
                    valB = (b.stich_typ || '').toLowerCase();
                    break;
                case 'suchbegriffe':
                    valA = (a.suchbegriffe || '').toLowerCase();
                    valB = (b.suchbegriffe || '').toLowerCase();
                    break;
                case 'is_active':
                    valA = a.is_active ? 1 : 0;
                    valB = b.is_active ? 1 : 0;
                    break;
                default:
                    valA = (a.anlass || '').toLowerCase();
                    valB = (b.anlass || '').toLowerCase();
            }

            if (valA < valB) return _jmCatalogSortDir === 'desc' ? 1 : -1;
            if (valA > valB) return _jmCatalogSortDir === 'desc' ? -1 : 1;
            return 0;
        });
    }

    // 4. Zeilen generieren
    let html = '';
    filtered.forEach(item => {
        const typLabels = {
            'standard_100': 'Standard (100 Pkt)',
            'liegend_600': 'Liegend (600 Pkt)',
            'sektion_200': 'Sektion (200 Pkt)',
            'sektion_150': 'Sektion (150 Pkt)',
            'auszahler_600': 'Auszahler (600 Pkt)'
        };
        const typText = typLabels[item.stich_typ] || item.stich_typ || 'Standard';

        const terms = (item.suchbegriffe || '').split(';').map(t => t.trim()).filter(Boolean);
        const termsPreview = terms.slice(0, 4).map(t => `<span class="badge bg-light text-secondary border me-1 mb-1 font-monospace" style="font-size: 10px;">${escapeHtml(t)}</span>`).join('');
        const moreTerms = terms.length > 4 ? `<span class="badge bg-secondary-subtle text-dark" title="${escapeHtml(item.suchbegriffe)}">+${terms.length - 4} weitere</span>` : '';

        const activeSwitch = `
            <div class="form-check form-switch d-inline-block">
                <input class="form-check-input" type="checkbox" ${item.is_active ? 'checked' : ''} 
                       onchange="toggleJMSchuetzenfestActive('${escapeHtml(item.id)}', this.checked)">
            </div>
        `;

        html += `
            <tr id="jm-cat-row-${item.id}" data-id="${item.id}">
                <td class="fw-bold text-dark" data-cell="anlass">${escapeHtml(item.anlass)}</td>
                <td class="text-muted" data-cell="ort">${escapeHtml(item.ort || '–')}</td>
                <td class="text-center fw-semibold" data-cell="max_punkte"><span class="badge bg-primary-subtle text-primary">${item.max_punkte}</span></td>
                <td data-cell="stich_typ"><span class="small text-muted">${escapeHtml(typText)}</span></td>
                <td data-cell="suchbegriffe"><div class="d-flex flex-wrap align-items-center">${termsPreview} ${moreTerms}</div></td>
                <td class="text-center" data-cell="is_active">${activeSwitch}</td>
                <td class="text-end" data-cell="aktionen" style="white-space: nowrap;">
                    <div class="d-flex align-items-center justify-content-end gap-1 flex-nowrap">
                        <button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="openJMSchuetzenfestEditModal('${escapeHtml(item.id)}')" title="Bearbeiten">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger py-1 px-2" onclick="deleteJMSchuetzenfest('${escapeHtml(item.id)}', '${escapeHtml(item.anlass)}')" title="Löschen">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // 5. TableKit Features aktivieren (Spalten aufziehen/verkleinern, Breiten merken, Sortierung)
    if (window.TableKit && typeof window.TableKit.initTable === 'function') {
        window._jmCatalogTableController = window.TableKit.initTable('#jm-catalog-table', {
            id: 'jm_catalog_table',
            storageKeyWidths: 'tk_cols_jm_catalog_widths',
            storageKeyOrder: 'tk_cols_jm_catalog_order',
            storageKeyCols: 'tk_cols_jm_catalog_cols',
            resizable: {
                minWidth: 50,
                columns: {
                    'aktionen': { resizable: false, minWidth: 105, defaultWidth: 110 }
                }
            },
            reorderable: {
                lockedColumns: ['is_active', 'aktionen']
            },
            sortable: {
                initialKey: _jmCatalogSortKey,
                initialDir: _jmCatalogSortDir,
                onSort: (key, dir) => {
                    _jmCatalogSortKey = key;
                    _jmCatalogSortDir = dir;
                    renderJMSchuetzenfesteTable();
                }
            }
        });
    }
}
window.renderJMSchuetzenfesteTable = renderJMSchuetzenfesteTable;

/**
 * Filtert die Tabelle bei Texteingabe.
 */
function jmFilterCatalogTable(val) {
    _jmCatalogFilter = val;
    renderJMSchuetzenfesteTable();
}
window.jmFilterCatalogTable = jmFilterCatalogTable;

/**
 * Leert die Textsuche im Schützenfeste-Katalog.
 */
function jmClearCatalogSearch() {
    _jmCatalogFilter = '';
    const input = document.getElementById('jm-catalog-search');
    if (input) {
        input.value = '';
        input.focus();
    }
    renderJMSchuetzenfesteTable();
}
window.jmClearCatalogSearch = jmClearCatalogSearch;

/**
 * Setzt den Statusfilter ('all', 'active', 'inactive').
 */
function jmSetCatalogStatusFilter(status) {
    _jmCatalogStatusFilter = status;
    renderJMSchuetzenfesteTable();
}
window.jmSetCatalogStatusFilter = jmSetCatalogStatusFilter;

/**
 * Lädt die Daten des Katalogs frisch aus Supabase neu (mit ButtonKit-Loading).
 */
async function jmReloadCatalogTable() {
    if (window.UIButtonKit && typeof window.UIButtonKit.withLoading === 'function') {
        await window.UIButtonKit.withLoading('#btn-reload-catalog', async () => {
            await loadJMSchuetzenfesteCatalog(true);
            await renderJMSchuetzenfesteTable();
            if (typeof showToast === 'function') {
                showToast('Schützenfeste-Katalog erfolgreich aktualisiert.');
            }
        });
    } else {
        await loadJMSchuetzenfesteCatalog(true);
        await renderJMSchuetzenfesteTable();
    }
}
window.jmReloadCatalogTable = jmReloadCatalogTable;

/**
 * Exportiert den Schützenfeste-Katalog nach Excel (.xlsx via UIExportKit).
 */
function jmExportCatalogToExcel() {
    const catalog = _jmCatalogCache || [];
    if (!catalog.length) {
        if (window.UIConfirmKit) {
            window.UIConfirmKit.alert({ title: 'Katalog leer', message: 'Es sind keine Schützenfeste zum Exportieren vorhanden.', type: 'info' });
        }
        return;
    }

    if (window.UIExportKit && typeof window.UIExportKit.dataToExcel === 'function') {
        const typLabels = {
            'standard_100': 'Standard (100 Pkt)',
            'liegend_600': 'Liegend (600 Pkt)',
            'sektion_200': 'Sektion (200 Pkt)',
            'sektion_150': 'Sektion (150 Pkt)',
            'auszahler_600': 'Auszahler (600 Pkt)'
        };
        const rows = catalog.map(item => ({
            anlass: item.anlass || '',
            ort: item.ort || '',
            max_punkte: item.max_punkte || 100,
            disziplin: typLabels[item.stich_typ] || item.stich_typ || 'Standard',
            suchbegriffe: item.suchbegriffe || '',
            aktiv: item.is_active ? 'Ja' : 'Nein'
        }));
        const cols = [
            { key: 'anlass', label: 'Anlass', width: 30 },
            { key: 'ort', label: 'Ort / Sektion', width: 20 },
            { key: 'max_punkte', label: 'Max. Punkte', width: 14 },
            { key: 'disziplin', label: 'Disziplin', width: 22 },
            { key: 'suchbegriffe', label: 'Suchbegriffe (OCR/KI)', width: 45 },
            { key: 'aktiv', label: 'Aktiv', width: 10 }
        ];
        window.UIExportKit.dataToExcel(rows, cols, 'Schuetzenfeste_Katalog.xlsx');
        if (typeof showToast === 'function') {
            showToast('✅ Schützenfeste-Katalog als Excel exportiert!');
        }
    } else if (window.UIExportKit && typeof window.UIExportKit.exportTableToExcel === 'function') {
        window.UIExportKit.exportTableToExcel('#jm-catalog-table', 'Schuetzenfeste_Katalog.xlsx');
    }
}
window.jmExportCatalogToExcel = jmExportCatalogToExcel;

/**
 * Aktiviert/Deaktiviert ein Schützenfest direkt aus der Tabelle.
 */
async function toggleJMSchuetzenfestActive(id, isActive) {
    const sb = getJMSupabaseClient();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('jm_competitions_catalog')
            .update({ is_active: isActive, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;
        await loadJMSchuetzenfesteCatalog(true);
        if (typeof jmPopulateTargetCompetitions === 'function') {
            jmPopulateTargetCompetitions();
        }
        if (typeof showToast === 'function') {
            showToast(`Status auf ${isActive ? 'aktiv' : 'inaktiv'} gesetzt.`);
        }
    } catch (err) {
        console.error("Fehler beim Umschalten des Status:", err);
        if (window.UIConfirmKit) {
            await window.UIConfirmKit.alert({
                title: 'Fehler beim Umschalten',
                message: `Konnte den Status nicht aktualisieren: ${err.message}`,
                type: 'danger'
            });
        } else if (typeof showError === 'function') {
            showError("Konnte Status nicht aktualisieren: " + err.message);
        }
    }
}
window.toggleJMSchuetzenfestActive = toggleJMSchuetzenfestActive;

/**
 * Öffnet das Formular zum Erfassen oder Bearbeiten eines Schützenfestes.
 */
async function openJMSchuetzenfestEditModal(id = null) {
    const editModalElem = document.getElementById('jm-schuetzenfest-edit-modal');
    if (!editModalElem) return;

    // UIModalKit aktivieren
    if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
        editModalElem._uiModalKitInitialized = false;
        window.UIModalKit.makeMovableAndResizable(editModalElem);
    }

    const titleElem = document.getElementById('jm-schuetzenfest-edit-title');
    const idInput = document.getElementById('jm-catalog-edit-id');
    const anlassInput = document.getElementById('jm-catalog-edit-anlass');
    const ortInput = document.getElementById('jm-catalog-edit-ort');
    const maxInput = document.getElementById('jm-catalog-edit-max');
    const typSelect = document.getElementById('jm-catalog-edit-stich-typ');
    const suchInput = document.getElementById('jm-catalog-edit-suchbegriffe');
    const activeCheck = document.getElementById('jm-catalog-edit-active');

    if (id) {
        if (titleElem) titleElem.innerHTML = `<i class="fas fa-bullseye text-warning me-2"></i>Schützenfest bearbeiten`;
        const catalog = await loadJMSchuetzenfesteCatalog();
        const item = catalog.find(c => c.id === id);
        if (item) {
            if (idInput) idInput.value = item.id;
            if (anlassInput) anlassInput.value = item.anlass || '';
            if (ortInput) ortInput.value = item.ort || '';
            if (maxInput) maxInput.value = item.max_punkte || 100;
            if (typSelect) typSelect.value = item.stich_typ || 'standard_100';
            if (suchInput) suchInput.value = item.suchbegriffe || '';
            if (activeCheck) activeCheck.checked = item.is_active !== false;
        }
    } else {
        if (titleElem) titleElem.innerHTML = `<i class="fas fa-plus-circle text-success me-2"></i>Neues Schützenfest erfassen`;
        if (idInput) idInput.value = '';
        if (anlassInput) anlassInput.value = '';
        if (ortInput) ortInput.value = '';
        if (maxInput) maxInput.value = '100';
        if (typSelect) typSelect.value = 'standard_100';
        if (suchInput) suchInput.value = '';
        if (activeCheck) activeCheck.checked = true;
    }

    const editModal = bootstrap.Modal.getOrCreateInstance(editModalElem);
    editModal.show();
}
window.openJMSchuetzenfestEditModal = openJMSchuetzenfestEditModal;

/**
 * Speichert ein Schützenfest nach public.jm_competitions_catalog.
 */
async function saveJMSchuetzenfest() {
    const anlassInput = document.getElementById('jm-catalog-edit-anlass');
    const ortInput = document.getElementById('jm-catalog-edit-ort');
    const maxInput = document.getElementById('jm-catalog-edit-max');
    const typSelect = document.getElementById('jm-catalog-edit-stich-typ');
    const suchInput = document.getElementById('jm-catalog-edit-suchbegriffe');
    const activeCheck = document.getElementById('jm-catalog-edit-active');
    const idInput = document.getElementById('jm-catalog-edit-id');

    const anlass = (anlassInput?.value || '').trim();
    if (!anlass) {
        if (window.UIConfirmKit) {
            await window.UIConfirmKit.alert({
                title: 'Pflichtfeld fehlt',
                message: 'Bitte trage einen Namen für den Schiessanlass ein.',
                type: 'warning'
            });
        } else if (typeof showError === 'function') {
            showError("Bitte gib einen Namen für den Anlass ein.");
        }
        return;
    }

    const ort = (ortInput?.value || '').trim();
    const maxPts = parseFloat(maxInput?.value) || 100;
    const stichTyp = typSelect?.value || 'standard_100';
    const suchbegriffe = (suchInput?.value || '').trim();
    const isActive = activeCheck ? activeCheck.checked : true;
    const existingId = idInput?.value || null;

    const sb = getJMSupabaseClient();
    if (!sb) return;

    await UIButtonKit.withLoading('#btn-save-schuetzenfest', async () => {
        const payload = {
            anlass,
            ort,
            max_punkte: maxPts,
            stich_typ: stichTyp,
            suchbegriffe,
            is_active: isActive,
            updated_at: new Date().toISOString()
        };

        let err = null;
        if (existingId) {
            const { error } = await sb
                .from('jm_competitions_catalog')
                .update(payload)
                .eq('id', existingId);
            err = error;
        } else {
            const { error } = await sb
                .from('jm_competitions_catalog')
                .insert([payload]);
            err = error;
        }

        if (err) throw err;

        if (typeof showSuccess === 'function') {
            showSuccess(`Schützenfest "${anlass}" erfolgreich gespeichert!`);
        }

        // Modal schliessen
        const editModalElem = document.getElementById('jm-schuetzenfest-edit-modal');
        if (editModalElem) {
            const modal = bootstrap.Modal.getInstance(editModalElem);
            if (modal) modal.hide();
        }

        // Cache erneuern & Ansicht aktualisieren
        await loadJMSchuetzenfesteCatalog(true);
        await renderJMSchuetzenfesteTable();
        if (typeof jmPopulateTargetCompetitions === 'function') {
            jmPopulateTargetCompetitions();
        }
    });
}
window.saveJMSchuetzenfest = saveJMSchuetzenfest;

/**
 * Löscht ein Schützenfest aus dem Katalog via UIConfirmKit.
 */
async function deleteJMSchuetzenfest(id, anlass) {
    const ok = await UIConfirmKit.confirm({
        title: 'Schützenfest löschen?',
        message: `Möchtest du das Schützenfest "${anlass}" wirklich aus dem Katalog entfernen? Bereits in der Jahresmeisterschaft erfasste Spalten bleiben davon unberührt.`,
        type: 'danger',
        confirmText: 'Löschen',
        cancelText: 'Abbrechen'
    });

    if (!ok) return;

    const sb = getJMSupabaseClient();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('jm_competitions_catalog')
            .delete()
            .eq('id', id);

        if (error) throw error;

        if (typeof showSuccess === 'function') {
            showSuccess(`Schützenfest "${anlass}" wurde gelöscht.`);
        }
        await loadJMSchuetzenfesteCatalog(true);
        await renderJMSchuetzenfesteTable();
        if (typeof jmPopulateTargetCompetitions === 'function') {
            jmPopulateTargetCompetitions();
        }
    } catch (err) {
        console.error("Fehler beim Löschen:", err);
        if (window.UIConfirmKit) {
            await window.UIConfirmKit.alert({
                title: 'Fehler beim Löschen',
                message: `Konnte Schützenfest nicht löschen: ${err.message}`,
                type: 'danger'
            });
        } else if (typeof showError === 'function') {
            showError("Konnte Schützenfest nicht löschen: " + err.message);
        }
    }
}
window.deleteJMSchuetzenfest = deleteJMSchuetzenfest;

/**
 * Durchsucht den Text (aus PDF oder OCR) nach bekannten Schützenfesten aus dem Katalog.
 * Verwendet den bewährten Score-Algorithmus aus GAS festV2_resolveSchiessanlassFromText.
 * 
 * @param {string} fullText - Der extrahierte Rohtext
 * @returns {object|null} - Bestes Match mit { anlass, ort, max_punkte, stich_typ, matchedKeyword, score } oder null
 */
async function jmMatchCompetitionFromCatalog(fullText) {
    if (!fullText || typeof fullText !== 'string' || fullText.trim().length === 0) {
        return null;
    }

    const catalog = await loadJMSchuetzenfesteCatalog();
    if (!catalog || catalog.length === 0) return null;

    const normText = fullText.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    let bestKeyword = '';

    for (const item of catalog) {
        if (item.is_active === false) continue;

        const aliases = (item.suchbegriffe ? item.suchbegriffe.split(';') : []).map(s => s.trim()).filter(Boolean);
        const candidates = [item.ort, item.anlass, ...aliases];

        let currentScore = 0;
        let matchedTerm = '';

        for (const c of candidates) {
            const cleanC = String(c || '').trim().toLowerCase();
            if (cleanC && cleanC.length >= 4 && normText.includes(cleanC)) {
                // Punktzahl basierend auf Länge des Treffers
                const weight = cleanC.length;
                if (weight > currentScore) {
                    currentScore = weight;
                    matchedTerm = cleanC;
                }
            }
        }

        if (currentScore > bestScore) {
            bestScore = currentScore;
            bestKeyword = matchedTerm;
            bestMatch = {
                id: item.id,
                anlass: item.anlass,
                ort: item.ort,
                max_punkte: parseFloat(item.max_punkte) || 100,
                stich_typ: item.stich_typ || 'standard_100',
                matchedKeyword: matchedTerm,
                score: bestScore
            };
        }
    }

    // Mindest-Score von 5 Zeichen (z.B. "sulz " oder "moos" oder Anlass-Teil)
    return bestScore >= 5 ? bestMatch : null;
}
window.jmMatchCompetitionFromCatalog = jmMatchCompetitionFromCatalog;

