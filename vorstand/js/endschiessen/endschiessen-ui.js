// ==============================================================================
// endschiessen-ui.js
// Frontend UI & Cockpit für das Modul ENDSCHIESSEN (Saisonabschluss KK 50m)
// Sportschützen Muhen - TableKit, Inline-Editing & Final-Elimination
// ==============================================================================

function renderEndschiessenUI() {
    const container = document.getElementById('endschiessen-container');
    if (!container) return;

    const state = window.EndschiessenState;
    const year = state.currentYear;
    const season = state.currentSeason || {};
    const activeStich = state.stiche.find(s => s.code === state.activeStichCode) || state.stiche[0];
    if (activeStich && state.activeStichCode !== activeStich.code) {
        state.activeStichCode = activeStich.code;
    }

    const canManage = typeof hasWriteAccess === 'function' ? hasWriteAccess('endschiessen') : true;

    container.innerHTML = `
        <style>
            .score-input::-webkit-outer-spin-button,
            .score-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            .score-input[type=number] {
                -moz-appearance: textfield;
            }
        </style>
        <!-- HEADER & TOOLBAR -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2">
                <h2 class="mb-0 fw-bold text-primary" style="font-family: 'Outfit', sans-serif;">
                    🎯 Endschiessen <span class="text-secondary fw-normal">${escapeHtml(year)}</span>
                </h2>
                ${season.is_archived ? '<span class="badge bg-secondary ms-2"><i class="fas fa-lock me-1"></i>Archiviert (Schreibgeschützt)</span>' : ''}
            </div>

            <div class="d-flex gap-2 align-items-center flex-wrap">
                <!-- Jahresauswahl -->
                <select id="endschiessen-year-select" class="form-select form-select-sm" style="width: auto;" onchange="loadEndschiessenData(this.value)">
                    ${(state.seasons || []).map(s => `
                        <option value="${escapeHtml(s.jahr)}" ${s.jahr === year ? 'selected' : ''}>
                            ${escapeHtml(s.title || 'Endschiessen ' + s.jahr)} ${s.is_archived ? '(Archiv)' : ''}
                        </option>
                    `).join('')}
                </select>

                <!-- Status Öffentlich schalten -->
                <div class="form-check form-switch ms-2 me-1" title="Ranglisten auf Website und in der Mitglieder-PWA anzeigen">
                    <input class="form-check-input write-protected" type="checkbox" id="endschiessen-pub-switch" 
                           ${season.is_published ? 'checked' : ''} 
                           ${!canManage || season.is_archived ? 'disabled' : ''}
                           onchange="toggleEndschiessenPublish(this.checked)">
                    <label class="form-check-label small fw-semibold" for="endschiessen-pub-switch">
                        ${season.is_published ? '<span class="text-success">● Öffentlich</span>' : '<span class="text-muted">○ Intern</span>'}
                    </label>
                </div>

                <!-- Live-Display / Beamer Schützenstube -->
                <button type="button" class="btn btn-sm btn-outline-info" onclick="openEndschiessenLiveScreen()" title="Festzelt- & Beamer-Modus für die Schützenstube öffnen">
                    <i class="fas fa-tv me-1"></i>Live-Beamer
                </button>

                <!-- Jahresmeisterschaft Übertrag -->
                <button type="button" class="btn btn-sm btn-outline-primary write-protected" 
                        ${!canManage || season.is_archived ? 'disabled' : ''}
                        onclick="openEndschiessenJMSyncModal()" title="Endstich-Resultate in die KK-Jahresmeisterschaft übertragen">
                    <i class="fas fa-medal me-1"></i>In JM übertragen
                </button>

                <!-- PDF Drucken -->
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="printEndschiessenRangliste()" title="Druckfertige Rangliste generieren">
                    <i class="fas fa-print me-1"></i>Drucken
                </button>

                <!-- Speichern Button (SaveButtonKit) -->
                <button id="btn-save-endschiessen" class="btn btn-sm btn-outline-secondary write-protected" disabled onclick="saveEndschiessenData()">
                    💾 Gespeichert
                </button>
            </div>
        </div>

        <!-- SCHÜTZENMEISTER SCHNELL-ANLEITUNG (Einklappbar) -->
        <div class="card mb-3 border-0 shadow-sm rounded-3 bg-light">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center" style="cursor: pointer;" data-bs-toggle="collapse" data-bs-target="#endschiessen-help-collapse">
                    <div class="d-flex align-items-center gap-2">
                        <i class="fas fa-info-circle text-primary"></i>
                        <span class="fw-bold text-dark small">💡 Kurzanleitung für den Schützenmeister (Hier klicken zum Ein-/Ausblenden)</span>
                    </div>
                    <i class="fas fa-chevron-down text-muted small"></i>
                </div>
                <div class="collapse show mt-2 pt-2 border-top" id="endschiessen-help-collapse">
                    <div class="row g-2 small text-muted">
                        <div class="col-md-3">
                            <span class="fw-bold text-dark">1. Schützen laden:</span> Klicke unten auf <em>«Alle KK-Schützen vorladen»</em>, um alle Mitglieder mit Kleinkaliber-Lizenz direkt in die Liste zu holen.
                        </div>
                        <div class="col-md-3">
                            <span class="fw-bold text-dark">2. Endstich erfassen:</span> Trage für jeden Schützen Passe 1 & 2 (Punkte & Zehntel) ein. Das Total und beide Ränge berechnen sich automatisch.
                        </div>
                        <div class="col-md-3">
                            <span class="fw-bold text-dark">3. Meister-Final:</span> Wechsle zum Reiter <em>«Meister-Final»</em> und klicke auf <em>«Top 8 übernehmen»</em>. Das System scheidet nach Serien automatisch aus.
                        </div>
                        <div class="col-md-3">
                            <span class="fw-bold text-dark">4. Abschluss & JM:</span> Klicke oben auf <em>«In JM übertragen»</em> und aktiviere den Schalter <em>«Öffentlich»</em> für Website & App.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- STICHE REITER (TABS) -->
        <ul class="nav nav-pills mb-3 gap-1 bg-white p-2 rounded-3 shadow-sm border" id="endschiessen-stiche-tabs">
            ${(state.stiche || []).map(stich => `
                <li class="nav-item">
                    <button class="nav-link py-1.5 px-3 rounded-pill fw-semibold ${stich.code === state.activeStichCode ? 'active' : ''}" 
                            onclick="switchEndschiessenStich('${escapeHtml(stich.code)}')">
                        ${getStichIcon(stich.code)} ${escapeHtml(stich.title)}
                        <span class="badge bg-secondary-subtle text-dark ms-1" style="font-size: 0.72rem;">
                            ${(state.scoresByStich[stich.id] || []).length}
                        </span>
                    </button>
                </li>
            `).join('')}

            ${canManage && !season.is_archived ? `
                <li class="nav-item ms-auto">
                    <button class="btn btn-sm btn-outline-primary rounded-pill py-1 px-3" onclick="openNewStichModal()">
                        <i class="fas fa-plus me-1"></i>Neuer Stich
                    </button>
                </li>
            ` : ''}
        </ul>

        <!-- INHALT DES AKTIVEN REITERS -->
        <div id="endschiessen-stich-content">
            ${renderActiveStichView(activeStich, canManage && !season.is_archived)}
        </div>
    `;

    setupEndschiessenTableNavigation();
    initEndschiessenTableKit();
    updateEndschiessenSaveButton();
}
window.renderEndschiessenUI = renderEndschiessenUI;

/**
 * Icon je Stich-Typ ermitteln
 */
function getStichIcon(code) {
    switch (code) {
        case 'endstich': return '🏅';
        case 'final': return '🏆';
        case 'gaben': return '🥩';
        case 'glueck': return '🎲';
        case 'sie_er': return '👫';
        default: return '🎯';
    }
}

/**
 * Reiter-Wechsel
 */
function switchEndschiessenStich(stichCode) {
    window.EndschiessenState.activeStichCode = stichCode;
    renderEndschiessenUI();
}
window.switchEndschiessenStich = switchEndschiessenStich;

/**
 * Rendert die Ansicht des ausgewählten Stichs
 */
function renderActiveStichView(stich, canEdit) {
    if (!stich) return '<div class="alert alert-info">Kein Stich ausgewählt.</div>';

    // SPEZIALANSICHT: MEISTER-FINAL (TOP 8 AUSSCHEIDUNG)
    if (stich.code === 'final' || stich.modus === 'final_elimination') {
        return renderFinalEliminationView(stich, canEdit);
    }

    // STANDARD-ANSICHT: TABELLE (ENDSTICH, GABEN, DIFFERENZLER ETC.)
    return renderStandardStichTableView(stich, canEdit);
}

/**
 * Standard-Tabellenansicht (z. B. Endstich 20 Schuss)
 */
function renderStandardStichTableView(stich, canEdit) {
    const state = window.EndschiessenState;
    const scores = state.scoresByStich[stich.id] || [];
    const isEndstich = stich.code === 'endstich' || stich.modus === 'standard_20';
    const isDifferenzler = stich.modus === 'differenzler';
    const isTiefschuss = stich.modus === 'tiefschuss';

    return `
        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
            <div class="card-header bg-white border-bottom p-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <h5 class="mb-0 fw-bold text-dark">${escapeHtml(stich.title)}</h5>
                    <small class="text-muted">${escapeHtml(stich.description || '')} (Scheibe: ${escapeHtml(stich.scheibe)}, ${stich.schusszahl} Schuss)</small>
                </div>
                <div class="d-flex gap-2 align-items-center">
                    <div class="input-group input-group-sm" style="max-width: 220px;">
                        <span class="input-group-text bg-light text-muted border-end-0"><i class="fas fa-search"></i></span>
                        <input type="text" class="form-control border-start-0" id="endschiessen-search-input" placeholder="Schütze filtern..." 
                               oninput="filterEndschiessenTable(this.value)">
                    </div>
                    <span id="endschiessen-count-badge" class="badge bg-light text-dark border py-1.5 px-2">
                        ${scores.length} Schütze(n)
                    </span>
                    
                    ${canEdit ? `
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="preloadAllKKMembers('${stich.id}')" title="Alle lizenzierten G50m Schützen zur Tabelle hinzufügen">
                            <i class="fas fa-users me-1"></i>Alle KK-Schützen vorladen
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" onclick="openAddShooterModal('${stich.id}')">
                            <i class="fas fa-user-plus me-1"></i>+ Schütze hinzufügen
                        </button>
                    ` : ''}
                </div>
            </div>

            <div class="table-responsive" style="max-height: 65vh;">
                <table class="table table-hover align-middle mb-0" id="endschiessen-main-table">
                    <thead class="table-light sticky-top small text-muted text-uppercase" style="z-index: 5;">
                        <tr>
                            <th data-col-id="rang" data-col-name="Rang" data-sort-key="rang" style="width: 60px;" class="text-center tk-sortable">Rang</th>
                            <th data-col-id="name" data-col-name="Schütze" data-sort-key="name" style="min-width: 180px;" class="tk-sortable">Schütze</th>
                            
                            ${isEndstich ? `
                                <th data-col-id="p1" data-col-name="Passe 1" style="min-width: 175px; width: 180px;" class="text-center">Passe 1 (Pkt / Zehntel)</th>
                                <th data-col-id="p2" data-col-name="Passe 2" style="min-width: 175px; width: 180px;" class="text-center">Passe 2 (Pkt / Zehntel)</th>
                                <th data-col-id="total" data-col-name="Total Pkt" data-sort-key="total" style="width: 95px;" class="text-center fw-bold text-dark tk-sortable">Total Pkt</th>
                                <th data-col-id="decimal" data-col-name="Zehntel" data-sort-key="decimal" style="width: 95px;" class="text-center text-primary tk-sortable">Zehntel</th>
                                <th data-col-id="rang_decimal" data-col-name="Rang 10tel" data-sort-key="rang_decimal" style="width: 85px;" class="text-center text-muted tk-sortable">Rang 10tel</th>
                            ` : ''}

                            ${isDifferenzler ? `
                                <th data-col-id="target" data-col-name="Zielwert" style="width: 100px;" class="text-center">Zielwert</th>
                                <th data-col-id="total" data-col-name="Ist-Punkte" data-sort-key="total" style="width: 100px;" class="text-center tk-sortable">Ist-Punkte</th>
                                <th data-col-id="diff" data-col-name="Differenz" data-sort-key="diff" style="width: 100px;" class="text-center fw-bold text-danger tk-sortable">Differenz</th>
                            ` : ''}

                            ${isTiefschuss ? `
                                <th data-col-id="total" data-col-name="Punkte Total" data-sort-key="total" style="width: 100px;" class="text-center tk-sortable">Punkte Total</th>
                                <th data-col-id="tiefschuss" data-col-name="Bester Tiefschuss" data-sort-key="tiefschuss" style="width: 110px;" class="text-center fw-bold text-primary tk-sortable">Bester Tiefschuss</th>
                            ` : ''}

                            ${!isEndstich && !isDifferenzler && !isTiefschuss ? `
                                <th data-col-id="total" data-col-name="Total Punkte" data-sort-key="total" style="width: 120px;" class="text-center fw-bold tk-sortable">Total Punkte</th>
                            ` : ''}

                            <th data-col-id="remark" data-col-name="Bemerkung" style="min-width: 120px;">Bemerkung</th>
                            ${canEdit ? '<th data-col-id="actions" data-col-name="" style="width: 50px;" class="text-center"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody id="endschiessen-tbody">
                        ${scores.length === 0 ? `
                            <tr>
                                <td colspan="9" class="text-center py-5 text-muted">
                                    <i class="fas fa-bullseye fa-2x mb-2 text-secondary opacity-50"></i>
                                    <p class="mb-2">Noch keine Schützen für diesen Stich erfasst.</p>
                                    ${canEdit ? `
                                        <button class="btn btn-sm btn-primary" onclick="preloadAllKKMembers('${stich.id}')">
                                             <i class="fas fa-users me-1"></i>Jetzt alle lizenzierten KK-Schützen laden
                                        </button>
                                    ` : ''}
                                </td>
                            </tr>
                        ` : scores.map((s, idx) => {
                            const name = s.member ? `${s.member.last_name} ${s.member.first_name}` : (s.guest_name || 'Unbekannt');
                            const isTop3 = s.rang_total <= 3;
                            const badgeColor = s.rang_total === 1 ? 'bg-warning text-dark' : (s.rang_total === 2 ? 'bg-secondary' : (s.rang_total === 3 ? 'bg-danger-subtle text-danger' : 'bg-light text-muted'));

                            return `
                                <tr data-id="${s.id}" data-score-id="${s.id}" class="${isTop3 ? 'table-warning-subtle' : ''}">
                                    <td class="text-center fw-bold" data-cell="rang">
                                        <span class="badge ${badgeColor} rounded-pill px-2 py-1">${s.rang_total || (idx + 1)}</span>
                                    </td>
                                    <td data-cell="name">
                                        <div class="fw-semibold text-dark">${escapeHtml(name)}</div>
                                        ${s.member?.birth_date ? `<small class="text-muted" style="font-size: 0.75rem;">Jg. ${new Date(s.member.birth_date).getFullYear()}</small>` : ''}
                                    </td>

                                    ${isEndstich ? `
                                        <!-- Passe 1 (Ganzpunkte / Zehntel) -->
                                        <td class="text-center">
                                            <div class="input-group input-group-sm flex-nowrap" style="max-width: 175px; margin: auto;">
                                                <input type="number" step="1" min="0" max="100" class="form-control text-center fw-semibold score-input" 
                                                       style="min-width: 50px; width: 50px; padding: 2px 4px;"
                                                       value="${s.passe_1_score || ''}" placeholder="98"
                                                       ${!canEdit ? 'readonly disabled' : ''}
                                                       oninput="onScoreInputChange('${stich.id}', '${s.id}', 'passe_1_score', this.value)">
                                                <span class="input-group-text px-1 text-muted" style="font-size: 0.8rem;">/</span>
                                                <input type="number" step="0.1" min="0" max="109.0" class="form-control text-center text-primary fw-bold score-input" 
                                                       style="min-width: 72px; width: 75px; padding: 2px 4px;"
                                                       value="${s.passe_1_decimal || ''}" placeholder="102.3"
                                                       ${!canEdit ? 'readonly disabled' : ''}
                                                       oninput="onScoreInputChange('${stich.id}', '${s.id}', 'passe_1_decimal', this.value)">
                                            </div>
                                        </td>

                                        <!-- Passe 2 (Ganzpunkte / Zehntel) -->
                                        <td class="text-center">
                                            <div class="input-group input-group-sm flex-nowrap" style="max-width: 175px; margin: auto;">
                                                <input type="number" step="1" min="0" max="100" class="form-control text-center fw-semibold score-input" 
                                                       style="min-width: 50px; width: 50px; padding: 2px 4px;"
                                                       value="${s.passe_2_score || ''}" placeholder="100"
                                                       ${!canEdit ? 'readonly disabled' : ''}
                                                       oninput="onScoreInputChange('${stich.id}', '${s.id}', 'passe_2_score', this.value)">
                                                <span class="input-group-text px-1 text-muted" style="font-size: 0.8rem;">/</span>
                                                <input type="number" step="0.1" min="0" max="109.0" class="form-control text-center text-primary fw-bold score-input" 
                                                       style="min-width: 72px; width: 75px; padding: 2px 4px;"
                                                       value="${s.passe_2_decimal || ''}" placeholder="104.8"
                                                       ${!canEdit ? 'readonly disabled' : ''}
                                                       oninput="onScoreInputChange('${stich.id}', '${s.id}', 'passe_2_decimal', this.value)">
                                            </div>
                                        </td>

                                        <!-- Totals -->
                                        <td class="text-center fw-bold fs-6 text-dark" id="total-score-${s.id}" data-cell="total">
                                            ${s.total_score || 0}
                                        </td>
                                        <td class="text-center fw-semibold text-primary" id="total-decimal-${s.id}" data-cell="decimal">
                                            ${(s.total_decimal || 0).toFixed(1)}
                                        </td>
                                        <td class="text-center text-muted small" id="rang-decimal-${s.id}" data-cell="rang_decimal">
                                            ${s.rang_decimal || '-'}
                                        </td>
                                    ` : ''}

                                    ${isDifferenzler ? `
                                        <td class="text-center" data-cell="target">
                                            <input type="number" class="form-control form-control-sm text-center fw-bold" 
                                                   value="${s.target_score || ''}" placeholder="85"
                                                   ${!canEdit ? 'readonly disabled' : ''}
                                                   oninput="onScoreInputChange('${stich.id}', '${s.id}', 'target_score', this.value)">
                                        </td>
                                        <td class="text-center" data-cell="total">
                                            <input type="number" class="form-control form-control-sm text-center fw-bold" 
                                                   value="${s.total_score || ''}" placeholder="83"
                                                   ${!canEdit ? 'readonly disabled' : ''}
                                                   oninput="onScoreInputChange('${stich.id}', '${s.id}', 'total_score', this.value)">
                                        </td>
                                        <td class="text-center fw-bold text-danger fs-6" id="diff-score-${s.id}" data-cell="diff">
                                            ${s.diff_score !== undefined && s.diff_score !== null ? s.diff_score : '-'}
                                        </td>
                                    ` : ''}

                                    ${isTiefschuss ? `
                                        <td class="text-center" data-cell="total">
                                            <input type="number" class="form-control form-control-sm text-center fw-bold" 
                                                   value="${s.total_score || ''}" placeholder="58"
                                                   ${!canEdit ? 'readonly disabled' : ''}
                                                   oninput="onScoreInputChange('${stich.id}', '${s.id}', 'total_score', this.value)">
                                        </td>
                                        <td class="text-center" data-cell="tiefschuss">
                                            <input type="number" class="form-control form-control-sm text-center fw-bold text-primary" 
                                                   value="${s.tiefschuss || ''}" placeholder="982"
                                                   ${!canEdit ? 'readonly disabled' : ''}
                                                   oninput="onScoreInputChange('${stich.id}', '${s.id}', 'tiefschuss', this.value)">
                                        </td>
                                    ` : ''}

                                    ${!isEndstich && !isDifferenzler && !isTiefschuss ? `
                                        <td class="text-center" data-cell="total">
                                            <input type="number" class="form-control form-control-sm text-center fw-bold fs-6" 
                                                   value="${s.total_score || ''}" placeholder="0"
                                                   ${!canEdit ? 'readonly disabled' : ''}
                                                   oninput="onScoreInputChange('${stich.id}', '${s.id}', 'total_score', this.value)">
                                        </td>
                                    ` : ''}

                                    <td data-cell="remark">
                                        <input type="text" class="form-control form-control-sm" 
                                               value="${escapeHtml(s.remark || '')}" placeholder="Optional..."
                                               ${!canEdit ? 'readonly disabled' : ''}
                                               oninput="onScoreInputChange('${stich.id}', '${s.id}', 'remark', this.value)">
                                    </td>

                                    ${canEdit ? `
                                        <td class="text-center">
                                            <button type="button" class="btn btn-link text-danger p-0 opacity-50 hover-opacity-100" 
                                                    onclick="removeShooterFromStich('${stich.id}', '${s.id}')" title="Schütze entfernen">
                                                <i class="fas fa-trash-alt"></i>
                                            </button>
                                        </td>
                                    ` : ''}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Meister-Final Ansicht (Top 8 Ausscheidung nach Serien 1–8)
 */
function renderFinalEliminationView(stich, canEdit) {
    const state = window.EndschiessenState;
    const finalists = state.finalParticipants || [];

    return `
        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
            <div class="card-header bg-dark text-white p-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <h5 class="mb-0 fw-bold"><i class="fas fa-trophy text-warning me-2"></i>Meister-Final (Top 8 Ausscheidung)</h5>
                    <small class="text-white-50">Die besten 8 Schützen des Endstichs kämpfen Schuss um Schuss um den Siegertitel.</small>
                </div>
                ${canEdit ? `
                    <button type="button" class="btn btn-sm btn-warning fw-bold" onclick="pullTop8FromEndstich()">
                        <i class="fas fa-sync-alt me-1"></i>Top 8 aus Endstich übernehmen
                    </button>
                ` : ''}
            </div>

            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" id="endschiessen-final-table">
                    <thead class="table-light sticky-top small text-muted text-uppercase" style="z-index: 5;">
                        <tr>
                            <th data-col-id="rang" data-col-name="Rang" data-sort-key="rang" style="width: 60px;" class="text-center tk-sortable">Rang</th>
                            <th data-col-id="name" data-col-name="Schütze" data-sort-key="name" style="min-width: 180px;" class="tk-sortable">Schütze</th>
                            <th data-col-id="s1" data-col-name="Serie 1" style="width: 80px;" class="text-center">Serie 1</th>
                            <th data-col-id="s2" data-col-name="Serie 2" style="width: 80px;" class="text-center">Serie 2</th>
                            <th data-col-id="s3" data-col-name="Serie 3" style="width: 80px;" class="text-center">Serie 3</th>
                            <th data-col-id="s4" data-col-name="Serie 4" style="width: 80px;" class="text-center">Serie 4</th>
                            <th data-col-id="s5" data-col-name="Serie 5" style="width: 80px;" class="text-center">Serie 5</th>
                            <th data-col-id="s6" data-col-name="Serie 6" style="width: 80px;" class="text-center">Serie 6</th>
                            <th data-col-id="s7" data-col-name="Serie 7" style="width: 80px;" class="text-center">Serie 7</th>
                            <th data-col-id="s8" data-col-name="Serie 8" style="width: 80px;" class="text-center">Serie 8</th>
                            <th data-col-id="total" data-col-name="Total" data-sort-key="total" style="width: 110px;" class="text-center fw-bold text-dark fs-6 tk-sortable">Total</th>
                            <th data-col-id="status" data-col-name="Status" style="min-width: 120px;" class="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${finalists.length === 0 ? `
                            <tr>
                                <td colspan="12" class="text-center py-5 text-muted">
                                    <i class="fas fa-trophy fa-2x mb-2 text-warning opacity-50"></i>
                                    <p class="mb-2">Noch keine Finalisten geladen.</p>
                                    ${canEdit ? `
                                        <button class="btn btn-sm btn-warning fw-bold" onclick="pullTop8FromEndstich()">
                                            <i class="fas fa-magic me-1"></i>Jetzt die Top 8 aus dem Endstich übernehmen
                                        </button>
                                    ` : ''}
                                </td>
                            </tr>
                        ` : finalists.map((f, idx) => {
                            const name = f.member ? `${f.member.last_name} ${f.member.first_name}` : 'Schütze ' + (idx + 1);
                            const rang = f.final_rang || (idx + 1);
                            const isWinner = rang === 1;
                            const isSilver = rang === 2;
                            const isBronze = rang === 3;
                            
                            let rowClass = '';
                            if (isWinner) rowClass = 'table-warning fw-bold';
                            else if (isSilver) rowClass = 'table-light fw-semibold';
                            else if (isBronze) rowClass = 'table-danger-subtle';

                            return `
                                <tr data-id="${f.id}" class="${rowClass}">
                                    <td class="text-center" data-cell="rang">
                                        <span class="badge ${isWinner ? 'bg-warning text-dark' : (isSilver ? 'bg-secondary' : (isBronze ? 'bg-danger-subtle text-danger' : 'bg-light text-muted'))} rounded-pill px-2 py-1">
                                            ${rang}
                                        </span>
                                    </td>
                                    <td data-cell="name">
                                        <div class="fw-bold">${escapeHtml(name)}</div>
                                        <small class="text-muted" style="font-size: 0.72rem;">Start-Rang Endstich: ${f.start_rang}</small>
                                    </td>

                                    ${[1, 2, 3, 4, 5, 6, 7, 8].map(sNum => `
                                        <td class="text-center p-1">
                                            <input type="number" class="form-control form-control-sm text-center fw-semibold p-1" 
                                                   style="max-width: 75px; margin: auto;"
                                                   value="${f['serie_' + sNum] || ''}" placeholder="-"
                                                   ${!canEdit ? 'readonly disabled' : ''}
                                                   oninput="onFinalSerieInputChange('${f.id}', 'serie_${sNum}', this.value)">
                                        </td>
                                    `).join('')}

                                    <td class="text-center fw-bold fs-6 text-dark" id="final-total-${f.id}" data-cell="total">
                                        ${f.total_score || 0}
                                    </td>

                                    <td class="text-center" data-cell="status">
                                        ${isWinner ? '<span class="badge bg-warning text-dark"><i class="fas fa-crown me-1"></i>Endschiessen-Meister</span>' : 
                                          isSilver ? '<span class="badge bg-secondary"><i class="fas fa-medal me-1"></i>2. Rang</span>' : 
                                          isBronze ? '<span class="badge bg-danger-subtle text-danger"><i class="fas fa-medal me-1"></i>3. Rang</span>' : 
                                          '<span class="badge bg-light text-muted">Finalist</span>'}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Punkteeingabe bei Standard-Stichen
 */
function onScoreInputChange(stichId, scoreId, field, value) {
    const state = window.EndschiessenState;
    const scores = state.scoresByStich[stichId] || [];
    const entry = scores.find(s => s.id === scoreId);
    if (!entry) return;

    entry[field] = value ? (field.includes('score') || field.includes('decimal') || field === 'tiefschuss' ? parseFloat(value) : value) : 0;

    // Totals sofort neu berechnen
    entry.total_score = (parseFloat(entry.passe_1_score) || 0) + (parseFloat(entry.passe_2_score) || 0);
    entry.total_decimal = (parseFloat(entry.passe_1_decimal) || 0) + (parseFloat(entry.passe_2_decimal) || 0);

    // DOM-Zellen für Sofort-Feedback aktualisieren
    const totalEl = document.getElementById(`total-score-${scoreId}`);
    if (totalEl) totalEl.innerText = entry.total_score;

    const decimalEl = document.getElementById(`total-decimal-${scoreId}`);
    if (decimalEl) decimalEl.innerText = entry.total_decimal.toFixed(1);

    // Differenzler Update
    if (field === 'target_score' || field === 'total_score') {
        const diffEl = document.getElementById(`diff-score-${scoreId}`);
        if (diffEl) {
            const diff = Math.abs((parseFloat(entry.total_score) || 0) - (parseFloat(entry.target_score) || 0));
            diffEl.innerText = diff;
        }
    }

    markEndschiessenUnsaved();
}
window.onScoreInputChange = onScoreInputChange;

/**
 * Punkteeingabe beim Meister-Final
 */
function onFinalSerieInputChange(finalId, field, value) {
    const state = window.EndschiessenState;
    const entry = state.finalParticipants.find(f => f.id === finalId);
    if (!entry) return;

    entry[field] = value ? parseFloat(value) : 0;
    state.finalParticipants = recalculateFinalRankings(state.finalParticipants);

    const totalEl = document.getElementById(`final-total-${finalId}`);
    if (totalEl) totalEl.innerText = entry.total_score;

    markEndschiessenUnsaved();
}
window.onFinalSerieInputChange = onFinalSerieInputChange;

/**
 * Zentrale Aktualisierung des Speichern-Buttons (SaveButtonKit)
 */
function updateEndschiessenSaveButton() {
    if (!window.SaveButtonKit) return;
    const canManage = typeof hasWriteAccess === 'function' ? hasWriteAccess('endschiessen') : true;
    const isArchived = window.EndschiessenState.currentSeason?.is_archived;
    const count = window.EndschiessenState.unsavedCount || (window.EndschiessenState.hasUnsavedChanges ? 1 : 0);
    window.SaveButtonKit.update('btn-save-endschiessen', {
        count: count,
        canWrite: canManage && !isArchived,
        label: 'Speichern',
        savedLabel: 'Gespeichert'
    });
}
window.updateEndschiessenSaveButton = updateEndschiessenSaveButton;

/**
 * Markiert ungespeicherte Änderungen
 */
function markEndschiessenUnsaved() {
    window.EndschiessenState.hasUnsavedChanges = true;
    window.EndschiessenState.unsavedCount = (window.EndschiessenState.unsavedCount || 0) + 1;
    updateEndschiessenSaveButton();
}
window.markEndschiessenUnsaved = markEndschiessenUnsaved;

/**
 * Übernimmt die Top 8 aus dem Endstich in den Final
 */
function pullTop8FromEndstich() {
    const state = window.EndschiessenState;
    const endstich = state.stiche.find(s => s.code === 'endstich');
    if (!endstich) {
        alert("Endstich-Konfiguration nicht gefunden.");
        return;
    }

    const endstichScores = state.scoresByStich[endstich.id] || [];
    if (!endstichScores.length) {
        alert("Im Endstich liegen noch keine Resultate vor.");
        return;
    }

    // Top 8 filtern
    const top8 = endstichScores
        .filter(s => s.person_number)
        .slice(0, 8);

    if (!top8.length) {
        alert("Keine lizenzierten Schützen im Endstich gefunden.");
        return;
    }

    state.finalParticipants = top8.map((s, idx) => ({
        id: 'temp_final_' + Date.now() + '_' + idx,
        jahr: state.currentYear,
        person_number: s.person_number,
        member: s.member,
        start_rang: s.rang_total || (idx + 1),
        serie_1: 0,
        serie_2: 0,
        serie_3: 0,
        serie_4: 0,
        serie_5: 0,
        serie_6: 0,
        serie_7: 0,
        serie_8: 0,
        total_score: 0,
        final_rang: idx + 1
    }));

    markEndschiessenUnsaved();
    renderEndschiessenUI();
}
window.pullTop8FromEndstich = pullTop8FromEndstich;

/**
 * Alle lizenzierten KK-Mitglieder in den aktuellen Stich vorladen
 */
function preloadAllKKMembers(stichId) {
    const state = window.EndschiessenState;
    const pool = state.kkMembersPool || [];
    if (!pool.length) {
        alert("Keine lizenzierten Kleinkaliber-Mitglieder gefunden.");
        return;
    }

    const existingScores = state.scoresByStich[stichId] || [];
    let addedCount = 0;

    for (const member of pool) {
        const exists = existingScores.some(s => s.person_number === member.person_number);
        if (!exists) {
            existingScores.push({
                id: 'temp_score_' + Date.now() + '_' + member.person_number,
                jahr: state.currentYear,
                stich_id: stichId,
                person_number: member.person_number,
                member: {
                    person_number: member.person_number,
                    first_name: member.first_name,
                    last_name: member.last_name,
                    birth_date: member.birth_year ? `${member.birth_year}-01-01` : null
                },
                passe_1_score: 0,
                passe_1_decimal: 0,
                passe_2_score: 0,
                passe_2_decimal: 0,
                total_score: 0,
                total_decimal: 0,
                rang_total: existingScores.length + 1
            });
            addedCount++;
        }
    }

    state.scoresByStich[stichId] = recalculateStichRankings(existingScores, 'standard_20');
    markEndschiessenUnsaved();
    renderEndschiessenUI();

    if (typeof showToast === 'function') {
        showToast(`${addedCount} lizenzierte KK-Schützen in den Stich geladen!`, "success");
    }
}
window.preloadAllKKMembers = preloadAllKKMembers;

/**
 * Schütze aus Stich entfernen
 */
function removeShooterFromStich(stichId, scoreId) {
    if (!confirm("Diesen Schützen wirklich aus dem Stich entfernen?")) return;

    const state = window.EndschiessenState;
    const scores = state.scoresByStich[stichId] || [];
    state.scoresByStich[stichId] = scores.filter(s => s.id !== scoreId);

    markEndschiessenUnsaved();
    renderEndschiessenUI();
}
window.removeShooterFromStich = removeShooterFromStich;

/**
 * Modal: Schütze hinzufügen
 */
function openAddShooterModal(stichId) {
    const state = window.EndschiessenState;
    const pool = state.kkMembersPool || [];

    let modal = document.getElementById('endschiessen-add-shooter-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'endschiessen-add-shooter-modal';
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow-lg">
                <div class="modal-header bg-primary text-white py-3 px-4">
                    <h5 class="modal-title fw-bold"><i class="fas fa-user-plus me-2"></i>Schütze hinzufügen</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-4">
                    <ul class="nav nav-pills mb-3" id="addShooterTabs">
                        <li class="nav-item">
                            <button class="nav-link active py-1 px-3" data-bs-toggle="pill" data-bs-target="#tab-kk-member">KK-Mitglied (Pool)</button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link py-1 px-3" data-bs-toggle="pill" data-bs-target="#tab-guest-shooter">Gastschütze / Partner</button>
                        </li>
                    </ul>

                    <div class="tab-content">
                        <!-- TAB KK MITGLIED -->
                        <div class="tab-pane fade show active" id="tab-kk-member">
                            <label class="form-label small fw-bold">Mitglied aus KK-Lizenzpool auswählen:</label>
                            <select id="modal-select-member" class="form-select mb-3">
                                <option value="">-- Schütze wählen --</option>
                                ${pool.map(m => `
                                    <option value="${m.person_number}">
                                        ${escapeHtml(m.last_name)} ${escapeHtml(m.first_name)} (Jg. ${m.birth_year}) ${m.is_junior ? '[U21]' : ''}
                                    </option>
                                `).join('')}
                            </select>
                            <button type="button" class="btn btn-primary w-100 fw-bold" onclick="confirmAddMemberToStich('${stichId}')">
                                Schütze hinzufügen
                            </button>
                        </div>

                        <!-- TAB GASTSCHÜTZE -->
                        <div class="tab-pane fade" id="tab-guest-shooter">
                            <label class="form-label small fw-bold">Name & Vorname des Gastschützen:</label>
                            <input type="text" id="modal-guest-name" class="form-control mb-3" placeholder="z. B. Hans Muster (Begleitung)">
                            <button type="button" class="btn btn-primary w-100 fw-bold" onclick="confirmAddGuestToStich('${stichId}')">
                                Gast hinzufügen
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}
window.openAddShooterModal = openAddShooterModal;

function confirmAddMemberToStich(stichId) {
    const select = document.getElementById('modal-select-member');
    const pn = parseInt(select.value);
    if (!pn) return;

    const state = window.EndschiessenState;
    const member = state.kkMembersPool.find(m => m.person_number === pn);
    if (!member) return;

    const existingScores = state.scoresByStich[stichId] || [];
    existingScores.push({
        id: 'temp_score_' + Date.now() + '_' + pn,
        jahr: state.currentYear,
        stich_id: stichId,
        person_number: pn,
        member: {
            person_number: member.person_number,
            first_name: member.first_name,
            last_name: member.last_name,
            birth_date: member.birth_year ? `${member.birth_year}-01-01` : null
        },
        passe_1_score: 0,
        passe_1_decimal: 0,
        passe_2_score: 0,
        passe_2_decimal: 0,
        total_score: 0,
        total_decimal: 0,
        rang_total: existingScores.length + 1
    });

    state.scoresByStich[stichId] = recalculateStichRankings(existingScores, 'standard_20');
    markEndschiessenUnsaved();
    renderEndschiessenUI();

    const modalEl = document.getElementById('endschiessen-add-shooter-modal');
    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

    if (typeof showToast === 'function') {
        showToast("Schütze hinzugefügt. Klicke oben auf «Speichern», um die Daten zu sichern.", "info");
    }
}
window.confirmAddMemberToStich = confirmAddMemberToStich;

function confirmAddGuestToStich(stichId) {
    const input = document.getElementById('modal-guest-name');
    const guestName = (input.value || '').trim();
    if (!guestName) return;

    const state = window.EndschiessenState;
    const existingScores = state.scoresByStich[stichId] || [];

    existingScores.push({
        id: 'temp_score_' + Date.now() + '_guest',
        jahr: state.currentYear,
        stich_id: stichId,
        guest_name: guestName,
        passe_1_score: 0,
        passe_1_decimal: 0,
        passe_2_score: 0,
        passe_2_decimal: 0,
        total_score: 0,
        total_decimal: 0,
        rang_total: existingScores.length + 1
    });

    state.scoresByStich[stichId] = recalculateStichRankings(existingScores, 'standard_20');
    markEndschiessenUnsaved();
    renderEndschiessenUI();

    const modalEl = document.getElementById('endschiessen-add-shooter-modal');
    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

    if (typeof showToast === 'function') {
        showToast("Gastschütze hinzugefügt. Klicke oben auf «Speichern», um die Daten zu sichern.", "info");
    }
}
window.confirmAddGuestToStich = confirmAddGuestToStich;

/**
 * Filter für die Schützentabelle mit Treffer-Zähler (TableKit Standard)
 */
function filterEndschiessenTable(query) {
    const q = (query || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#endschiessen-tbody tr[data-id]');
    let visibleCount = 0;
    rows.forEach(r => {
        const text = r.innerText.toLowerCase();
        const matches = !q || text.includes(q);
        r.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;
    });
    const countBadge = document.getElementById('endschiessen-count-badge');
    if (countBadge) {
        countBadge.textContent = q ? `${visibleCount} von ${rows.length} Schützen` : `${rows.length} Schütze(n)`;
    }
}
window.filterEndschiessenTable = filterEndschiessenTable;

/**
 * Modal für die Übertragung in die Jahresmeisterschaft
 */
function openEndschiessenJMSyncModal() {
    const state = window.EndschiessenState;
    const endstich = state.stiche.find(s => s.code === 'endstich');
    const scores = endstich ? (state.scoresByStich[endstich.id] || []) : [];

    let modal = document.getElementById('endschiessen-jm-sync-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'endschiessen-jm-sync-modal';
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered" style="max-width: 520px;">
            <div class="modal-content rounded-4 border-0 shadow-lg">
                <div class="modal-header bg-primary text-white py-3 px-4">
                    <h5 class="modal-title fw-bold"><i class="fas fa-medal me-2"></i>In Jahresmeisterschaft übertragen</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-4">
                    <p class="text-muted small mb-3">
                        Möchtest du die Resultate des <strong>Endstichs (20 Schuss)</strong> für das Jahr <strong>${escapeHtml(state.currentYear)}</strong> direkt in die Spalte <em>«Endschiessen»</em> der aktiven Jahresmeisterschaft übertragen?
                    </p>
                    <div class="bg-light p-3 rounded-3 border mb-3">
                        <div class="d-flex justify-content-between mb-1">
                            <span class="small text-muted">Zielsaison:</span>
                            <span class="badge bg-primary-subtle text-primary fw-bold">Jahresmeisterschaft (aktuell)</span>
                        </div>
                        <div class="d-flex justify-content-between mb-1">
                            <span class="small text-muted">Zu übertragende Schützen:</span>
                            <span class="fw-bold text-dark">${scores.length} Schützen</span>
                        </div>
                        <div class="d-flex justify-content-between mb-1">
                            <span class="small text-muted">Bester Schütze:</span>
                            <span class="fw-bold text-primary">${scores[0]?.member ? scores[0].member.last_name + ' ' + scores[0].member.first_name : '-'} (${scores[0]?.total_score || 0} Pkt.)</span>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span class="small text-muted">Abgleichs-Modus:</span>
                            <span class="text-muted small">Exakt nach Vorname & Nachname</span>
                        </div>
                    </div>
                    <div class="d-grid gap-2">
                        <button type="button" class="btn btn-primary fw-bold py-2.5 rounded-3" onclick="executeJMSync()">
                            <i class="fas fa-check-circle me-1"></i>Jetzt in Jahresmeisterschaft übertragen
                        </button>
                        <button type="button" class="btn btn-light py-2 text-muted" data-bs-dismiss="modal">Abbrechen</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}
window.openEndschiessenJMSyncModal = openEndschiessenJMSyncModal;

async function executeJMSync() {
    try {
        if (typeof showLoadingOverlay === 'function') showLoadingOverlay("Übertrage in Jahresmeisterschaft...");
        const res = await syncEndschiessenToJM();
        if (typeof showToast === 'function') {
            showToast(`Erfolgreich übertragen: ${res.updatedCount} Schützen in «${res.targetSeason}» (Spalte: ${res.columnTitle}) aktualisiert! ✓`, "success");
        }
        const modalEl = document.getElementById('endschiessen-jm-sync-modal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    } catch (e) {
        alert("Fehler bei der Synchronisation: " + e.message);
    } finally {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    }
}
window.executeJMSync = executeJMSync;

/**
 * Initialisiert TableKit Spaltensortierung und Resizing für das Endschiessen
 */
function initEndschiessenTableKit() {
    if (!window.TableKit) return;

    // 1. Haupttabelle (Endstich, Gaben, Differenzler etc.)
    const mainTable = document.getElementById('endschiessen-main-table');
    if (mainTable && typeof window.TableKit.makeSortable === 'function') {
        window.TableKit.makeSortable(mainTable, {
            getValue: (row, key) => {
                const cell = row.querySelector(`[data-cell="${key}"]`);
                if (!cell) return '';
                if (key === 'rang' || key === 'rang_decimal') {
                    const badge = cell.querySelector('.badge') || cell;
                    const num = parseInt(badge.textContent.trim(), 10);
                    return isNaN(num) ? 9999 : num;
                }
                if (key === 'total' || key === 'decimal' || key === 'diff' || key === 'tiefschuss') {
                    const num = parseFloat(cell.textContent.trim());
                    return isNaN(num) ? 0 : num;
                }
                return cell.textContent.trim();
            }
        });
    }

    if (mainTable && typeof window.TableKit.makeResizable === 'function') {
        window.TableKit.makeResizable('#endschiessen-main-table', {
            storageKey: 'endschiessen_main_table_widths',
            minWidth: 50,
            columns: {
                rang: { minWidth: 55, defaultWidth: 60, resizable: false },
                actions: { minWidth: 40, defaultWidth: 50, resizable: false }
            }
        });
    }

    // 2. Meister-Final Tabelle
    const finalTable = document.getElementById('endschiessen-final-table');
    if (finalTable && typeof window.TableKit.makeSortable === 'function') {
        window.TableKit.makeSortable(finalTable, {
            getValue: (row, key) => {
                const cell = row.querySelector(`[data-cell="${key}"]`);
                if (!cell) return '';
                if (key === 'rang') {
                    const badge = cell.querySelector('.badge') || cell;
                    const num = parseInt(badge.textContent.trim(), 10);
                    return isNaN(num) ? 9999 : num;
                }
                if (key === 'total') {
                    const num = parseFloat(cell.textContent.trim());
                    return isNaN(num) ? 0 : num;
                }
                return cell.textContent.trim();
            }
        });
    }

    if (finalTable && typeof window.TableKit.makeResizable === 'function') {
        window.TableKit.makeResizable('#endschiessen-final-table', {
            storageKey: 'endschiessen_final_table_widths',
            minWidth: 50,
            columns: {
                rang: { minWidth: 55, defaultWidth: 60, resizable: false }
            }
        });
    }
}
window.initEndschiessenTableKit = initEndschiessenTableKit;

/**
 * Veröffentlichungs-Status toggeln
 */
async function toggleEndschiessenPublish(isPub) {
    try {
        const client = getEndschiessenClient();
        const year = window.EndschiessenState.currentYear;
        const { error } = await client
            .from('endschiessen_seasons')
            .update({ is_published: isPub, updated_at: new Date().toISOString() })
            .eq('jahr', year);

        if (error) throw error;
        if (window.EndschiessenState.currentSeason) {
            window.EndschiessenState.currentSeason.is_published = isPub;
        }

        if (typeof showToast === 'function') {
            showToast(isPub ? "Rangliste öffentlich freigegeben!" : "Rangliste wieder auf intern gesetzt.", "info");
        }
    } catch (e) {
        alert("Fehler beim Umschalten: " + e.message);
    }
}
window.toggleEndschiessenPublish = toggleEndschiessenPublish;

/**
 * Schützenstuben-Beamer / Live-Screen
 */
function openEndschiessenLiveScreen() {
    const year = window.EndschiessenState.currentYear;
    window.open(`live-endschiessen.html?jahr=${year}`, '_blank');
}
window.openEndschiessenLiveScreen = openEndschiessenLiveScreen;

/**
 * Drucken der Rangliste
 */
function printEndschiessenRangliste() {
    window.print();
}
window.printEndschiessenRangliste = printEndschiessenRangliste;

/**
 * Tastatur-Navigation (Pfeil runter / Pfeil hoch / Tab) für schnelle Schützenblatt-Erfassung
 */
function setupEndschiessenTableNavigation() {
    const inputs = document.querySelectorAll('.score-input');
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                // 2 inputs weiter runter springen (gleiche Spalte in der nächsten Zeile)
                const next = inputs[index + 2];
                if (next) next.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = inputs[index - 2];
                if (prev) prev.focus();
            }
        });
    });
}
