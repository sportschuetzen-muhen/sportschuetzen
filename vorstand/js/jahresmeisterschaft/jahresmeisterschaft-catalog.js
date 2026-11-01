// vorstand/js/jahresmeisterschaft/jahresmeisterschaft-catalog.js
// ============================================================
// MODUL: JAHRESMEISTERSCHAFT - SCHÜTZENFESTE-KATALOG & MATCHING
// Verwaltet die Stammdaten bekannter Schiessanlässe, Suchbegriffe
// und Maximalpunkte für automatisches KI- & OCR-Matching.
// ============================================================

let _jmCatalogCache = null;
let _jmCatalogFilter = '';

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
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade Schützenfeste...</td></tr>`;

    const catalog = await loadJMSchuetzenfesteCatalog();
    const filter = (_jmCatalogFilter || '').toLowerCase().trim();

    const filtered = catalog.filter(item => {
        if (!filter) return true;
        const anlass = (item.anlass || '').toLowerCase();
        const ort = (item.ort || '').toLowerCase();
        const such = (item.suchbegriffe || '').toLowerCase();
        return anlass.includes(filter) || ort.includes(filter) || such.includes(filter);
    });

    if (countBadge) {
        countBadge.innerText = `${filtered.length} von ${catalog.length} Schützenfeste`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Keine Schützenfeste gefunden.</td></tr>`;
        return;
    }

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
            <tr id="jm-cat-row-${item.id}">
                <td class="fw-bold text-dark">${escapeHtml(item.anlass)}</td>
                <td class="text-muted">${escapeHtml(item.ort || '–')}</td>
                <td class="text-center fw-semibold"><span class="badge bg-primary-subtle text-primary">${item.max_punkte}</span></td>
                <td><span class="small text-muted">${escapeHtml(typText)}</span></td>
                <td><div class="d-flex flex-wrap align-items-center">${termsPreview} ${moreTerms}</div></td>
                <td class="text-center">${activeSwitch}</td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-secondary p-1 px-2 me-1" onclick="openJMSchuetzenfestEditModal('${escapeHtml(item.id)}')" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger p-1 px-2" onclick="deleteJMSchuetzenfest('${escapeHtml(item.id)}', '${escapeHtml(item.anlass)}')" title="Löschen">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
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
    } catch (err) {
        console.error("Fehler beim Umschalten des Status:", err);
        showError("Konnte Status nicht aktualisieren: " + err.message);
    }
}
window.toggleJMSchuetzenfestActive = toggleJMSchuetzenfestActive;

/**
 * Öffnet das Formular zum Erfassen oder Bearbeiten eines Schützenfestes.
 */
async function openJMSchuetzenfestEditModal(id = null) {
    const editModalElem = document.getElementById('jm-schuetzenfest-edit-modal');
    if (!editModalElem) return;

    const titleElem = document.getElementById('jm-schuetzenfest-edit-title');
    const idInput = document.getElementById('jm-catalog-edit-id');
    const anlassInput = document.getElementById('jm-catalog-edit-anlass');
    const ortInput = document.getElementById('jm-catalog-edit-ort');
    const maxInput = document.getElementById('jm-catalog-edit-max');
    const typSelect = document.getElementById('jm-catalog-edit-stich-typ');
    const suchInput = document.getElementById('jm-catalog-edit-suchbegriffe');
    const activeCheck = document.getElementById('jm-catalog-edit-active');

    if (id) {
        if (titleElem) titleElem.innerText = "Schützenfest bearbeiten";
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
        if (titleElem) titleElem.innerText = "Neues Schützenfest erfassen";
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
        showError("Bitte gib einen Namen für den Anlass ein.");
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

        showSuccess(`Schützenfest "${anlass}" erfolgreich gespeichert!`);

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

        showSuccess(`Schützenfest "${anlass}" wurde gelöscht.`);
        await loadJMSchuetzenfesteCatalog(true);
        await renderJMSchuetzenfesteTable();
        if (typeof jmPopulateTargetCompetitions === 'function') {
            jmPopulateTargetCompetitions();
        }
    } catch (err) {
        console.error("Fehler beim Löschen:", err);
        showError("Konnte Schützenfest nicht löschen: " + err.message);
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
