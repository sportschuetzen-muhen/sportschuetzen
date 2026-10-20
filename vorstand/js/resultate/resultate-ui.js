// vorstand/js/resultate/resultate-ui.js
// =========================================================
//  RESULTATE (Mannschaft & G & G) - UI Rendering & Clean UX
//  Native Supabase Architecture mit Multi-Wettbewerbs-Support,
//  Runden-Filterung (Pills), Kompakt-Matrix & Aktionen-Dropdown
// =========================================================

async function loadResultateData(force = false) {
  ensureResultateShell();

  if (!force && resultateState.rows.length > 0 && document.getElementById('resultate-app')) {
    console.log("⚡ loadResultateData: Lade aus lokalem Cache...");
    return Promise.resolve();
  }

  setStatus("Lade…", false);
  renderLoading();

  const supa = getResultateSupabaseClient();
  const contestType = window._resultateContestType || "mannschaft";
  const year = window._resultateYear || new Date().getFullYear();

  // 1. ZUERST SUPABASE PRÜFEN
  if (supa) {
    try {
      console.log(`📡 [Supabase] Lade Resultate für ${contestType} (${year})...`);
      
      // Parallel: Resultate, aktive Mitglieder (inkl. address_number für SSV-Lizenz), Teams und verfügbare Jahre
      const [resResult, membersResult, teamsResult, yearsResult] = await Promise.allSettled([
        supa.from('contest_results').select('*').eq('contest_type', contestType).eq('year', year),
        supa.from('members').select('person_number, first_name, last_name, address_number, primary_email').eq('is_active', true),
        supa.from('contest_teams').select('team_name').eq('contest_type', contestType).eq('year', year).order('sort_order'),
        supa.from('contest_results').select('year')
      ]);

      const supaRows = (resResult.status === 'fulfilled' && !resResult.value.error) ? (resResult.value.data || []) : null;
      const supaMembers = (membersResult.status === 'fulfilled' && !membersResult.value.error) ? (membersResult.value.data || []) : [];
      const supaTeams = (teamsResult.status === 'fulfilled' && !teamsResult.value.error) ? (teamsResult.value.data || []).map(t => t.team_name) : [];
      const supaYears = (yearsResult.status === 'fulfilled' && !yearsResult.value.error) ? (yearsResult.value.data || []) : [];

      if (supaRows !== null) {
        window._resultateIsSupabase = true;
        console.log(`✅ [Supabase] ${supaRows.length} Resultate-Zeilen geladen für ${contestType}.`);

        // Verfügbare Jahre aufbauen
        const distinctYears = [...new Set(supaYears.map(y => parseInt(y.year, 10)).filter(y => !isNaN(y)))];
        const curY = new Date().getFullYear();
        if (!distinctYears.includes(curY)) distinctYears.push(curY);
        distinctYears.sort((a,b) => b - a);
        resultateState.availableYears = distinctYears;

        resultateState.members = supaMembers.map(m => ({
          id: String(m.person_number),
          vorname: m.first_name || "",
          nachname: m.last_name || "",
          address_number: m.address_number || "",
          email: m.primary_email || ""
        }));

        resultateState.rows = supaRows.map(r => mapContestResultFromSupabase(r));
        if (contestType === 'gruppe') {
          resultateState.rows.sort((a, b) => {
            const stA = (a.stellung || 'liegend').toLowerCase();
            const stB = (b.stellung || 'liegend').toLowerCase();
            if (stA !== stB) return stA === 'liegend' ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '', 'de');
          });
        }
        resultateState.teams = buildTeamsList(supaTeams, resultateState.rows);
        resultateState.isDirty = false;
        window._resultateOriginalRows = JSON.parse(JSON.stringify(resultateState.rows));

        updateYearSelectorUI();
        renderUI();
        updateBackendBadge();
        setStatus("Alles geladen", false);
        updateResultateSaveButtonState(false);
        return;
      }
      throw new Error("Supabase Resultate-Abfrage fehlgeschlagen");
    } catch (supaErr) {
      console.error("❌ [Supabase] Fehler beim Laden der Resultate:", supaErr);
      const wrap = document.getElementById("resultate-wrap");
      if (wrap) wrap.innerHTML = `<div class="alert alert-danger shadow-sm">
        <i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Fehler:</strong> Resultate konnten nicht aus Supabase geladen werden: ${escapeHtml(supaErr.message || String(supaErr))}
      </div>`;
      setStatus("Fehler", false);
    }
  } else {
    const wrap = document.getElementById("resultate-wrap");
    if (wrap) wrap.innerHTML = `<div class="alert alert-danger shadow-sm">
      <i class="fas fa-exclamation-triangle me-2"></i>
      <strong>Konfigurationsfehler:</strong> Supabase Client ist nicht initialisiert.
    </div>`;
    setStatus("Fehler", false);
  }
}
window.loadResultateData = loadResultateData;

function updateBackendBadge() {
  const badge = document.getElementById("resultate-backend-badge");
  if (badge) badge.remove();
}

function switchResultateContest(type) {
  if (resultateState.isDirty && !confirm("Du hast ungespeicherte Änderungen. Möchtest du wirklich den Wettbewerb wechseln?")) {
    return;
  }
  window._resultateContestType = type;
  window._resultateActiveRound = "all"; // Reset round filter
  resultateState.rows = [];
  ensureResultateShell(true);
  loadResultateData(true);
}
window.switchResultateContest = switchResultateContest;

async function onResultateYearChange(yearVal) {
  if (resultateState.isDirty && !confirm("Du hast ungespeicherte Änderungen. Möchtest du wirklich die Saison wechseln?")) {
    const sel = document.getElementById('resultate-year-select');
    if (sel) sel.value = String(window._resultateYear);
    return;
  }
  window._resultateYear = parseInt(yearVal, 10) || new Date().getFullYear();
  resultateState.rows = [];
  ensureResultateShell(true);
  await loadResultateData(true);
}
window.onResultateYearChange = onResultateYearChange;

function setResultateRoundFilter(filterKey) {
  window._resultateActiveRound = filterKey;
  window._resultateViewMode = "cards";
  renderUI();
}
window.setResultateRoundFilter = setResultateRoundFilter;

function setResultateViewMode(mode) {
  window._resultateViewMode = mode;
  renderUI();
}
window.setResultateViewMode = setResultateViewMode;

function updateYearSelectorUI() {
  const sel = document.getElementById("resultate-year-select");
  if (!sel) return;

  const currentSysYear = new Date().getFullYear();
  const years = resultateState.availableYears && resultateState.availableYears.length > 0
    ? resultateState.availableYears
    : [currentSysYear, currentSysYear - 1];

  const activeY = window._resultateYear || currentSysYear;

  sel.innerHTML = years.map(y => {
    const isCur = (y === currentSysYear);
    const isSel = (y === activeY);
    const label = isCur ? `${y} (Aktiv)` : `${y} (Archiv)`;
    return `<option value="${y}" ${isSel ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function ensureResultateShell(forceRebuild = false) {
  const host = document.getElementById("resultate-container");
  if (!host) return;

  if (!forceRebuild && document.getElementById("resultate-app")) return;

  injectStylesOnce();

  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('resultate') : true;
  const currentContest = window._resultateContestType || "mannschaft";
  const limit = getContestLimit(currentContest);
  const activeYear = window._resultateYear || new Date().getFullYear();
  const isHistorical = activeYear < new Date().getFullYear();

  let subtitle = "";
  let contestBadge = "";
  if (currentContest === "mannschaft") {
    contestBadge = "👥 Mannschaft (SMM)";
    subtitle = `7 Runden à 200 Pkt. Limit: max. ${limit} Schützen/Team.`;
  } else if (currentContest === "gruppe") {
    contestBadge = "🎯 Gruppe (SGM)";
    subtitle = `3 Runden à 2 Passen (P1+P2 à 100 Pkt). Limit: ${limit} Schützen (3 Liegend, 2 Kniend).`;
  } else {
    contestBadge = "🛡️ Grenzland";
    subtitle = `3 Runden à 100 Pkt. Limit: ${limit} Schützen/Team (Pool unbegrenzt).`;
  }

  host.innerHTML = `
    <div id="resultate-app">
      <!-- 1. HEADER-TOOLBAR MIT WETTBEWERB, SAISON & AKTIONEN -->
      <div class="d-flex justify-content-between align-items-center mb-3 sticky-top bg-white p-2.5 shadow-sm rounded-3 border" style="z-index: 600;">
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <div>
            <div class="d-flex align-items-center gap-2">
              <h4 class="m-0 fw-bold">🏁 Resultate</h4>
              <span class="badge bg-primary-subtle text-primary border">${contestBadge}</span>
              ${isHistorical ? '<span class="badge bg-secondary-subtle text-secondary border"><i class="fas fa-archive me-1"></i>Archiv</span>' : ''}
            </div>
            <div class="small text-muted mt-0.5">${subtitle}</div>
          </div>

          <!-- Wettbewerbs-Auswahl Pills -->
          <div class="btn-group btn-group-sm" role="group" aria-label="Wettbewerb wählen">
            <button type="button" class="btn btn-outline-primary ${currentContest === 'mannschaft' ? 'active fw-bold' : ''}" onclick="switchResultateContest('mannschaft')">👥 Mannschaft</button>
            <button type="button" class="btn btn-outline-primary ${currentContest === 'gruppe' ? 'active fw-bold' : ''}" onclick="switchResultateContest('gruppe')">🎯 Gruppe</button>
            <button type="button" class="btn btn-outline-primary ${currentContest === 'grenzland' ? 'active fw-bold' : ''}" onclick="switchResultateContest('grenzland')">🛡️ Grenzland</button>
          </div>

          <!-- Saison / Jahr Selector -->
          <div class="d-flex align-items-center gap-1.5 ms-1">
            <label for="resultate-year-select" class="small text-muted fw-semibold mb-0">Saison:</label>
            <select id="resultate-year-select" class="form-select form-select-sm" style="width: auto; min-width: 125px;" onchange="onResultateYearChange(this.value)">
              <option value="${activeYear}">${activeYear}</option>
            </select>
          </div>
        </div>

        <!-- Rechte Werkzeugleiste (Aktionen-Dropdown + SaveButtonKit) -->
        <div class="d-flex gap-2 flex-wrap align-items-center">
          ${canWrite ? `
            <!-- Dropdown: Aktionen -->
            <div class="dropdown">
              <button class="btn btn-outline-primary btn-sm dropdown-toggle fw-semibold" type="button" id="resultateActionsDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="fas fa-bolt me-1"></i>Aktionen
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3" aria-labelledby="resultateActionsDropdown">
                ${currentContest === 'gruppe' ? `
                  <li><a class="dropdown-item fw-bold text-success" href="#" onclick="triggerSgmExcelImport(); return false;">
                    <i class="fas fa-file-excel me-2"></i>SGM Standblatt importieren (Excel)
                  </a></li>
                  <li><hr class="dropdown-divider"></li>
                ` : ''}
                ${currentContest === 'mannschaft' ? `
                  <li><a class="dropdown-item fw-bold text-success" href="#" onclick="syncJmToContestMannschaftAction(); return false;">
                    <i class="fas fa-sync-alt me-2"></i>Aus Jahresmeisterschaft synchronisieren
                  </a></li>
                  <li><hr class="dropdown-divider"></li>
                ` : ''}
                ${currentContest === 'grenzland' ? `
                  <li><a class="dropdown-item fw-bold text-success" href="#" onclick="triggerGrenzlandPdfImport(); return false;">
                    <i class="fas fa-file-pdf me-2"></i>Grenzland Rangliste importieren (PDF)
                  </a></li>
                  <li><hr class="dropdown-divider"></li>
                ` : ''}
                <li><a class="dropdown-item" href="#" onclick="syncSetupToResultate(); return false;">
                  <i class="fas fa-users-cog text-info me-2"></i>Aus Team-Setup übernehmen (Teams synchronisieren)
                </a></li>
                <li><a class="dropdown-item" href="#" onclick="openResultateOcrModal(); return false;">
                  <i class="fas fa-camera text-warning me-2"></i>KI-Standblattfoto einlesen (OCR)
                </a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="openArchiveSeasonModal(); return false;">
                  <i class="fas fa-archive me-2"></i>Saison archivieren / Neues Jahr starten...
                </a></li>
              </ul>
            </div>

            <!-- Modal Trigger: Schütze hinzufügen -->
            <button class="btn btn-outline-success btn-sm fw-semibold" onclick="openAddShooterModal()" title="Neuen Schützen aus Mitgliederliste erfassen">
              <i class="fas fa-user-plus me-1"></i>+ Schütze
            </button>
          ` : ''}

          ${canWrite ? `<button id="btn-save-resultate" class="btn btn-sm btn-outline-secondary write-protected" disabled onclick="saveResultateData()">💾 Gespeichert</button>` : ''}
        </div>
      </div>

      <!-- 2. RUNDEN-SUB-NAVIGATION & ANSICHTS-UMSCHALTER -->
      <div id="resultate-round-nav" class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 bg-light p-2 rounded-3 border">
        <!-- Rendered in renderRoundNavigation() -->
      </div>

      <!-- 3. STATUS-MELDUNG -->
      <div id="resultate-status" class="small text-muted mb-2 ps-1"></div>

      <!-- 4. HAUPT-INHALT -->
      <div class="card shadow-sm border-0">
        <div class="card-body p-3">
          <div id="resultate-wrap"></div>
        </div>
      </div>

      <!-- 5. MODAL: SCHÜTZE HINZUFÜGEN (SCHLANK & KOMPAKT) -->
      <div class="modal fade" id="modal-add-resultate-shooter" tabindex="-1" aria-labelledby="modalAddShooterLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
              <h5 class="modal-title fw-bold" id="modalAddShooterLabel"><i class="fas fa-user-plus me-2"></i>Schütze zu ${escapeHtml(contestBadge)} hinzufügen</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <div class="mb-3">
                <label for="new-member-select" class="form-label fw-bold small text-muted">Mitglied wählen</label>
                <select id="new-member-select" class="form-select">
                  <option value="">— Mitglied wählen —</option>
                </select>
                <div id="avail-count" class="form-text text-muted small mt-1"></div>
              </div>

              ${currentContest === 'gruppe' ? `
              <div class="mb-3">
                <label for="new-start-stellung" class="form-label fw-bold small text-muted">Schiessstellung</label>
                <select id="new-start-stellung" class="form-select">
                  <option value="liegend">🛌 Liegend</option>
                  <option value="kniend">🧎 Kniend</option>
                </select>
              </div>
              ` : ''}

              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label for="new-start-round" class="form-label fw-bold small text-muted">Start ab Runde</label>
                  <select id="new-start-round" class="form-select">
                    <option value="r1">Runde 1</option>
                    <option value="r2">Runde 2</option>
                    <option value="r3">Runde 3</option>
                    ${currentContest === 'mannschaft' ? `
                      <option value="r4">Runde 4</option>
                      <option value="r5">Runde 5</option>
                      <option value="r6">Runde 6</option>
                      <option value="r7">Runde 7</option>
                    ` : ''}
                  </select>
                </div>
                <div class="col-6">
                  <label for="new-start-team" class="form-label fw-bold small text-muted">Zuteilung / Team</label>
                  <select id="new-start-team" class="form-select">
                    <option value="">— Team wählen —</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer border-0 p-3 bg-light rounded-bottom-4">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
              <button type="button" class="btn btn-primary fw-bold" onclick="confirmAddSelectedMember()">
                <i class="fas fa-check me-1"></i>Hinzufügen
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. MODAL: KI OCR BILDERKENNUNG -->
      <div class="modal fade" id="resultate-ocr-modal" tabindex="-1" aria-labelledby="resultateOcrModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);">
            <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
              <h5 class="modal-title fw-bold" id="resultateOcrModalLabel"><i class="fas fa-camera me-2"></i>KI-Bilderkennung für Resultate</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <div id="ocr-error-alert" class="alert alert-danger d-none" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <span id="ocr-error-text"></span>
              </div>
              <div id="ocr-step-upload">
                <div class="row g-2 mb-2">
                  <div class="col-6">
                    <label class="form-label fw-bold small text-muted">Ziel-Runde für die Resultate</label>
                    <select id="ocr-target-round" class="form-select">
                      <option value="r1">Runde 1</option>
                      <option value="r2">Runde 2</option>
                      <option value="r3">Runde 3</option>
                    </select>
                  </div>
                  <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label class="form-label fw-bold small text-muted mb-0">KI-Erkennung</label>
                      <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1" style="font-size: 0.72rem;" onclick="window.openAiHealthModal()" title="KI-Modellstatus anzeigen">
                        <i class="fas fa-heartbeat text-danger me-1"></i>Status
                      </button>
                    </div>
                    <div class="p-1.5 px-2 rounded-2 bg-light border d-flex justify-content-between align-items-center">
                      <span class="small fw-semibold text-dark" style="font-size: 0.78rem;">
                        <i class="fas fa-wand-magic-sparkles text-primary me-1"></i>Smarte OCR (Auto)
                      </span>
                      <button type="button" class="btn btn-sm btn-link text-decoration-none text-muted p-0 role-protected" data-roles="admin" data-bs-toggle="collapse" data-bs-target="#ocr-admin-model-collapse" title="Modell manuell wählen (Admin)">
                        <i class="fas fa-sliders" style="font-size: 0.75rem;"></i>
                      </button>
                    </div>
                    <div class="collapse mt-1" id="ocr-admin-model-collapse">
                      <select id="ocr-model" class="form-select form-select-sm" style="font-size: 0.78rem;">
                        <option value="auto" selected>✨ Auto-Wahl (Empfohlen)</option>
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                        <option value="gemini-flash-lite-latest">Gemini Flash Lite</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div id="ocr-model-desc" class="form-text text-muted mb-3 small d-none" style="min-height: 0;"></div>
                <div class="mb-4">
                  <label class="form-label fw-bold small text-muted">Foto auswählen oder aufnehmen</label>
                  <div class="border rounded p-4 text-center bg-light position-relative" style="cursor:pointer; border-style: dashed !important; transition: border-color 0.2s;" id="ocr-dropzone" onclick="document.getElementById('ocr-file-input').click()">
                    <i class="fas fa-file-image fa-3x text-muted mb-2"></i>
                    <p class="mb-0 text-muted fw-semibold">Bild oder PDF-Rangliste hierhin ziehen oder klicken zum Auswählen</p>
                    <div id="ocr-preview-container" class="mt-3 d-none">
                      <img id="ocr-image-preview" src="" class="img-fluid rounded border shadow-sm" style="max-height: 250px; max-width: 100%;">
                    </div>
                  </div>
                  <input type="file" id="ocr-file-input" accept="image/*,.heic,.heif,.pdf,application/pdf" style="display:none" onchange="onOcrFileSelected(event)">
                </div>
                <div class="d-grid">
                  <button type="button" class="btn btn-primary py-2.5 fw-bold rounded-3 shadow-sm" id="btn-start-ocr" onclick="startOcrAnalysis()" disabled>
                    <i class="fas fa-magic me-1"></i> Resultate erkennen
                  </button>
                </div>
              </div>
              <div id="ocr-step-loading" class="text-center py-5 d-none">
                <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                <h5 class="fw-bold">Analysiere Foto mit Google Gemini...</h5>
                <p class="text-muted small">Dies kann einige Sekunden dauern. Bitte warten.</p>
              </div>
              <div id="ocr-step-results" class="d-none">
                <h6 class="fw-bold mb-3"><i class="fas fa-check-circle text-success me-1"></i> Erkannte Ergebnisse prüfen</h6>
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                  <table class="table table-sm table-hover align-middle">
                    <thead>
                      <tr>
                        <th style="width: 40px;"></th>
                        <th>Schütze</th>
                        <th>Aktuell</th>
                        <th>Erkannt (anpassbar)</th>
                      </tr>
                    </thead>
                    <tbody id="ocr-results-tbody">
                    </tbody>
                  </table>
                </div>
                <div class="d-flex justify-content-between mt-4">
                  <button type="button" class="btn btn-outline-secondary" onclick="resetOcrModal()">Anderes Bild</button>
                  <button type="button" class="btn btn-success fw-bold" onclick="applyOcrResults()">Ergebnisse übernehmen</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 7. MODAL: SAISON ARCHIVIEREN & NEUES JAHR STARTEN -->
      <div class="modal fade" id="modal-archive-resultate-season" tabindex="-1" aria-labelledby="modalArchiveSeasonLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header bg-danger text-white border-0 py-3 rounded-top-4">
              <h5 class="modal-title fw-bold" id="modalArchiveSeasonLabel"><i class="fas fa-archive me-2"></i>Saison archivieren & neues Jahr starten</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <div class="alert alert-info border-0 rounded-3 mb-3 small">
                <i class="fas fa-info-circle me-1"></i>
                Wettbewerb: <strong id="archive-modal-contest-badge"></strong><br>
                Das bisherige Archivjahr bleibt unverändert gespeichert und auf der Website abrufbar.
              </div>
              <div class="row g-3 mb-3">
                <div class="col-6">
                  <label class="form-label fw-bold small text-muted">Bisheriges Jahr (Archiv)</label>
                  <input type="number" id="archive-source-year" class="form-control bg-light" readonly disabled>
                </div>
                <div class="col-6">
                  <label for="archive-target-year" class="form-label fw-bold small text-primary">Neues Zieljahr *</label>
                  <input type="number" id="archive-target-year" class="form-control fw-bold border-primary" min="2000" max="2100" step="1">
                </div>
              </div>
              <div class="text-muted small">
                <strong>Was passiert beim Initialisieren?</strong>
                <ul class="ps-3 mb-0 mt-1">
                  <li>Alle Schützen & Team-Zuteilungen werden für das neue Jahr übernommen.</li>
                  <li>Sämtliche Rundenpunkte werden auf <code>null</code> zurückgesetzt.</li>
                  <li>Bei der Gruppenmeisterschaft (SGM) bleibt die Schiessstellung (Liegend/Kniend) erhalten.</li>
                </ul>
              </div>
              <div id="archive-warning-box" class="alert alert-warning border-0 rounded-3 mt-3 mb-0 small d-none">
                <i class="fas fa-exclamation-triangle me-1"></i>
                <span id="archive-warning-text"></span>
              </div>
            </div>
            <div class="modal-footer border-0 p-3 bg-light rounded-bottom-4">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
              <button type="button" class="btn btn-danger fw-bold" id="btn-confirm-archive-season" onclick="executeArchiveSeasonAction()">
                <i class="fas fa-check me-1"></i>Saison jetzt initialisieren
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openAddShooterModal() {
  const modalEl = document.getElementById('modal-add-resultate-shooter');
  if (modalEl) {
    renderMemberDropdown();
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}
window.openAddShooterModal = openAddShooterModal;

function openArchiveSeasonModal() {
  const modalEl = document.getElementById('modal-archive-resultate-season');
  if (!modalEl) return;

  const contestType = window._resultateContestType || "gruppe";
  const sourceYear = window._resultateYear || new Date().getFullYear();
  const defaultTargetYear = sourceYear + 1;

  let badgeText = "";
  if (contestType === "mannschaft") badgeText = "👥 Mannschaft (SMM)";
  else if (contestType === "gruppe") badgeText = "🎯 Gruppe (SGM)";
  else badgeText = "🛡️ Grenzland";

  const badgeEl = document.getElementById("archive-modal-contest-badge");
  if (badgeEl) badgeEl.innerText = badgeText;

  const srcInput = document.getElementById("archive-source-year");
  if (srcInput) srcInput.value = sourceYear;

  const targetInput = document.getElementById("archive-target-year");
  if (targetInput) targetInput.value = defaultTargetYear;

  const warnBox = document.getElementById("archive-warning-box");
  if (warnBox) warnBox.classList.add("d-none");

  const btnConfirm = document.getElementById("btn-confirm-archive-season");
  if (btnConfirm) {
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = '<i class="fas fa-check me-1"></i>Saison jetzt initialisieren';
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}
window.openArchiveSeasonModal = openArchiveSeasonModal;

function injectStylesOnce() {
  if (document.getElementById("resultate-inline-style")) return;
  const s = document.createElement("style");
  s.id = "resultate-inline-style";
  s.textContent = `
    .round-head {
      background: #eef3f8;
      border-left: 5px solid #0f3a5d;
    }
    .round-1 { border-left-color: #0d6efd; }
    .round-2 { border-left-color: #198754; }
    .round-3 { border-left-color: #fd7e14; }
    .round-4 { border-left-color: #6f42c1; }
    .round-5 { border-left-color: #d63384; }
    .round-6 { border-left-color: #0dcaf0; }
    .round-7 { border-left-color: #20c997; }

    .team-card {
      border: 1px solid #e1e7ed;
      border-radius: 0.5rem;
    }
    .team-card-body {
      overflow-x: auto;
    }
    .team-badge {
      font-size: 0.8rem;
    }
    .rowline {
      display: grid;
      grid-template-columns: minmax(130px, 1fr) 115px 85px;
      gap: 6px;
      align-items: center;
    }
    .rowline-header {
      display: grid;
      grid-template-columns: minmax(130px, 1fr) 115px 85px;
      gap: 6px;
      align-items: center;
      font-size: 0.72rem;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: #6c757d;
      font-weight: 700;
      padding-bottom: 4px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e9ecef;
    }
    .rowline-gruppe {
      display: grid;
      grid-template-columns: minmax(130px, 1.4fr) 72px 100px 52px 52px 48px;
      gap: 6px;
      align-items: center;
      min-width: 460px;
    }
    .rowline-gruppe-header {
      display: grid;
      grid-template-columns: minmax(130px, 1.4fr) 72px 100px 52px 52px 48px;
      gap: 6px;
      align-items: center;
      font-size: 0.72rem;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: #6c757d;
      font-weight: 700;
      padding-bottom: 4px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e9ecef;
      min-width: 460px;
    }
    .stellung-pill {
      font-size: 0.75rem;
      padding: 0.22rem 0.4rem;
      font-weight: 600;
      text-align: center;
      display: block;
      border-radius: 4px;
    }
    .points-input {
      text-align: right;
      font-weight: 600;
      padding: 0.25rem 0.35rem;
    }
    .matrix-input {
      max-width: 70px;
      text-align: right;
      font-weight: 600;
      padding: 0.2rem 0.4rem;
      font-size: 0.85rem;
    }
    .matrix-team-badge {
      font-size: 10px;
      padding: 2px 5px;
    }
  `;
  document.head.appendChild(s);
}

function renderLoading() {
  const wrap = document.getElementById("resultate-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="text-center p-4"><div class="spinner-border text-primary"></div><div class="text-muted mt-2">Lade Resultate…</div></div>`;
}

function renderUI() {
  renderRoundNavigation();
  renderMemberDropdown();
  renderRounds();
  setStatus(resultateState.isDirty ? "Ungespeicherte Änderungen" : "Alles gespeichert", resultateState.isDirty);
  updateResultateSaveButtonState();
}

function renderRoundNavigation() {
  const container = document.getElementById("resultate-round-nav");
  if (!container) return;

  const contestType = window._resultateContestType || "mannschaft";
  const roundCount = getContestRoundCount(contestType);
  const activeRound = window._resultateActiveRound || "all";
  const viewMode = window._resultateViewMode || "cards";
  const limit = getContestLimit(contestType);

  let pillsHtml = `
    <button type="button" class="btn btn-sm ${viewMode === 'cards' && activeRound === 'all' ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="setResultateRoundFilter('all')">
      Alle Runden
    </button>
  `;

  for (let r = 1; r <= roundCount; r++) {
    const isAct = (viewMode === 'cards' && activeRound === `r${r}`);
    pillsHtml += `
      <button type="button" class="btn btn-sm ${isAct ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="setResultateRoundFilter('r${r}')">
        Runde ${r}
      </button>
    `;
  }

  pillsHtml += `
    <button type="button" class="btn btn-sm ${viewMode === 'matrix' ? 'btn-dark fw-bold' : 'btn-outline-dark'}" onclick="setResultateViewMode('matrix')" title="Kompakte Gesamttabelle aller Runden">
      <i class="fas fa-table me-1"></i>📊 Kompakt-Matrix
    </button>
  `;

  container.innerHTML = `
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <span class="small text-muted fw-semibold me-1"><i class="fas fa-filter me-1"></i>Ansicht:</span>
      <div class="btn-group btn-group-sm" role="group">
        ${pillsHtml}
      </div>
      <button type="button" class="btn btn-sm btn-success fw-bold shadow-sm d-inline-flex align-items-center ms-1" onclick="exportResultateMatrixToExcel()" title="Kompakt-Matrix als Excel-Datei (.xlsx) herunterladen">
        <i class="fas fa-file-excel me-1.5"></i>Excel Export
      </button>
    </div>
    <div class="small text-muted">
      <strong>${resultateState.rows.length}</strong> Schützen | Team-Limit: <strong>${limit}</strong> / Team
    </div>
  `;
}

function renderMemberDropdown() {
  const sel = document.getElementById("new-member-select");
  const teamSel = document.getElementById("new-start-team");
  const cnt = document.getElementById("avail-count");
  if (!sel) return;

  const used = new Set(resultateState.rows.map(r => String(r.id)).filter(Boolean));
  const available = (resultateState.members || [])
    .filter(m => !used.has(String(m.id)))
    .sort((a,b) => (`${a.nachname} ${a.vorname}`).localeCompare(`${b.nachname} ${b.vorname}`, "de"));

  sel.innerHTML = `<option value="">— Mitglied wählen —</option>` + available.map(m => {
    const label = `${m.nachname} ${m.vorname}`.trim();
    const licInfo = m.address_number ? ` (Lizenz: ${m.address_number})` : '';
    return `<option value="${escapeHtml(m.id)}">${escapeHtml(label + licInfo)}</option>`;
  }).join("");

  if (teamSel) {
    const teamsPlusPool = [...resultateState.teams, POOL_LABEL];
    teamSel.innerHTML = `<option value="">— Team wählen —</option>` + teamsPlusPool.map(t =>
      `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
    ).join("");
  }

  if (cnt) cnt.innerText = `${available.length} Mitglieder verfügbar`;
}

function renderRounds() {
  const wrap = document.getElementById("resultate-wrap");
  if (!wrap) return;

  if (window._resultateViewMode === "matrix") {
    renderMatrixView(wrap);
    return;
  }

  const teams = [...resultateState.teams];
  const teamsPlusPool = [...teams, POOL_LABEL];
  const contestType = window._resultateContestType || "mannschaft";
  const roundCount = getContestRoundCount(contestType);
  const activeRound = window._resultateActiveRound || "all";

  let html = "";
  if (activeRound === "all") {
    for (let i = 1; i <= roundCount; i++) {
      html += renderRoundSection(`Runde ${i}`, `r${i}`, `round-${i}`, teamsPlusPool);
    }
  } else {
    const rNum = parseInt(activeRound.replace(/\D/g, '') || "1", 10);
    html += renderRoundSection(`Runde ${rNum}`, activeRound, `round-${rNum}`, teamsPlusPool);
  }

  wrap.innerHTML = html;
}

function renderMatrixView(wrap) {
  const contestType = window._resultateContestType || "mannschaft";
  const roundCount = getContestRoundCount(contestType);
  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('resultate') : true;

  if (!resultateState.rows || resultateState.rows.length === 0) {
    wrap.innerHTML = `<div class="text-center p-4 text-muted">— Keine Schützen erfasst. Klicke auf "+ Schütze" oder importiere ein Standblatt. —</div>`;
    return;
  }

  let tableHeaderCols = "";
  for (let r = 1; r <= roundCount; r++) {
    tableHeaderCols += `<th class="text-center" style="min-width: ${contestType === 'gruppe' ? '140px' : '90px'};">Runde ${r}</th>`;
  }

  let rowsHtml = "";
  const sortedMatrixRows = resultateState.rows.map((row, rowIndex) => ({ row, rowIndex }));
  if (contestType === "gruppe") {
    sortedMatrixRows.sort((a, b) => {
      const stA = (a.row.stellung || 'liegend').toLowerCase();
      const stB = (b.row.stellung || 'liegend').toLowerCase();
      if (stA !== stB) {
        return stA === 'liegend' ? -1 : 1;
      }
      return (a.row.name || '').localeCompare(b.row.name || '', 'de');
    });
  } else {
    sortedMatrixRows.sort((a, b) => (a.row.name || '').localeCompare(b.row.name || '', 'de'));
  }

  sortedMatrixRows.forEach(({ row, rowIndex }) => {
    let roundsCells = "";
    let shooterTotal = 0;

    for (let r = 1; r <= roundCount; r++) {
      const team = row[`r${r}_team`] || "";
      const p1 = row[`r${r}_p1`];
      const p2 = row[`r${r}_p2`];
      const p1Num = parseInt(p1 || "0", 10) || 0;
      const p2Num = parseInt(p2 || "0", 10) || 0;

      if (contestType === "gruppe") {
        shooterTotal += (p1Num + p2Num);
        const teamBadge = team ? `<span class="badge bg-secondary-subtle text-dark border matrix-team-badge mb-1">${escapeHtml(team)}</span>` : '<span class="text-muted" style="font-size:10px;">Pool</span>';
        roundsCells += `
          <td class="text-center align-middle">
            <div class="d-flex flex-column align-items-center">
              ${teamBadge}
              <div class="d-flex gap-1 align-items-center">
                <input class="form-control form-control-sm matrix-input"
                       data-row="${rowIndex}" data-round="r${r}" data-part="p1"
                       inputmode="numeric" placeholder="P1"
                       ${canWrite ? '' : 'disabled readonly'}
                       value="${escapeHtml(p1 ?? "")}"
                       oninput="onPointsInputEvent(event)">
                <input class="form-control form-control-sm matrix-input"
                       data-row="${rowIndex}" data-round="r${r}" data-part="p2"
                       inputmode="numeric" placeholder="P2"
                       ${canWrite ? '' : 'disabled readonly'}
                       value="${escapeHtml(p2 ?? "")}"
                       oninput="onPointsInputEvent(event)">
              </div>
              <span id="sum-r${r}-${rowIndex}" class="badge bg-dark mt-1" style="font-size:10px;">${(p1Num + p2Num > 0) ? (p1Num + p2Num) : '–'}</span>
            </div>
          </td>
        `;
      } else {
        shooterTotal += p1Num;
        const teamBadge = team ? `<span class="badge bg-secondary-subtle text-dark border matrix-team-badge mb-1">${escapeHtml(team)}</span>` : '<span class="text-muted" style="font-size:10px;">Pool</span>';
        roundsCells += `
          <td class="text-center align-middle">
            <div class="d-flex flex-column align-items-center">
              ${teamBadge}
              <input class="form-control form-control-sm matrix-input"
                     data-row="${rowIndex}" data-round="r${r}" data-part="p1"
                     inputmode="numeric" placeholder="${contestType === 'mannschaft' ? '0-200' : '0-100'}"
                     ${canWrite ? '' : 'disabled readonly'}
                     value="${escapeHtml(p1 ?? "")}"
                     oninput="onPointsInputEvent(event)">
            </div>
          </td>
        `;
      }
    }

    const stellungBadge = row.stellung === 'kniend'
      ? '<span class="badge bg-warning text-dark border">Kniend</span>'
      : '<span class="badge bg-info text-dark border">Liegend</span>';

    rowsHtml += `
      <tr>
        <td class="fw-bold align-middle">${escapeHtml(row.name)}</td>
        <td class="align-middle">${stellungBadge}</td>
        ${roundsCells}
        <td class="text-center align-middle fw-bold fs-6">${shooterTotal > 0 ? shooterTotal : '–'}</td>
      </tr>
    `;
  });

  wrap.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2 px-1 flex-wrap gap-2">
      <div class="small text-muted">
        <i class="fas fa-info-circle me-1"></i><strong>Kompakt-Matrix:</strong> Alle Runden und Teams auf einen Blick. Änderungen werden direkt übernommen.
      </div>
      <button type="button" class="btn btn-sm btn-success fw-bold shadow-sm d-inline-flex align-items-center" onclick="exportResultateMatrixToExcel()" title="Kompakt-Matrix aller Runden nach Excel (.xlsx) exportieren">
        <i class="fas fa-file-excel me-1.5"></i>Excel (.xlsx)
      </button>
    </div>
    <div class="table-responsive rounded-3 border">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light sticky-top">
          <tr>
            <th style="min-width: 160px;">Schütze</th>
            <th style="width: 80px;">Stellung</th>
            ${tableHeaderCols}
            <th class="text-center" style="width: 80px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderRoundSection(title, roundKey, roundClass, teamsPlusPool) {
  const contestType = window._resultateContestType || "grenzland";
  const limit = getContestLimit(contestType);

  // Gruppieren nach Team
  const grouped = new Map();
  teamsPlusPool.forEach(t => grouped.set(t, []));
  resultateState.rows.forEach((r, idx) => {
    const team = (r[`${roundKey}_team`] || "") || POOL_LABEL;
    if (!grouped.has(team)) grouped.set(team, []);
    grouped.get(team).push({ r, idx });
  });

  // Team Cards Grid
  const cardsHtml = teamsPlusPool.map(teamName => {
    const list = grouped.get(teamName) || [];
    const count = list.length;
    const isPool = (teamName === POOL_LABEL);

    // Sortierung innerhalb des Teams: Zuerst Liegend, dann Kniend
    if (contestType === "gruppe") {
      list.sort((a, b) => {
        const stA = (a.r.stellung || 'liegend').toLowerCase();
        const stB = (b.r.stellung || 'liegend').toLowerCase();
        if (stA !== stB) {
          return stA === 'liegend' ? -1 : 1;
        }
        return (a.r.name || '').localeCompare(b.r.name || '', 'de');
      });
    } else {
      list.sort((a, b) => (a.r.name || '').localeCompare(b.r.name || '', 'de'));
    }

    // Runden-Summe für das Team berechnen
    let teamTotal = 0;
    list.forEach(({ r }) => {
      const p1 = parseInt(r[`${roundKey}_p1`] || "0", 10) || 0;
      const p2 = (contestType === "gruppe") ? (parseInt(r[`${roundKey}_p2`] || "0", 10) || 0) : 0;
      teamTotal += (p1 + p2);
    });

    const safeTeamId = escapeHtml(teamName).replace(/[^a-zA-Z0-9_-]/g, '_');
    const totalBadge = (!isPool && teamTotal > 0)
      ? `<span id="team-total-${roundKey}-${safeTeamId}" class="badge bg-success-subtle text-success border fw-bold me-2">${teamTotal} Pkt</span>`
      : '';

    const header = `
      <div class="card-header bg-white d-flex justify-content-between align-items-center py-2 px-3">
        <div class="d-flex align-items-center gap-2">
          <span class="fw-bold">${escapeHtml(teamName)}</span>
          ${totalBadge}
        </div>
        <span class="badge ${isPool ? "bg-secondary" : (count > limit ? "bg-danger" : "bg-primary")} team-badge">
          ${count}${isPool ? "" : "/" + limit}
        </span>
      </div>
    `;

    const tableHeader = (list.length > 0)
      ? (contestType === "gruppe"
          ? `<div class="rowline-gruppe-header">
               <span>Schütze</span>
               <span class="text-center">Stellung</span>
               <span>Team</span>
               <span class="text-end pe-1">P1</span>
               <span class="text-end pe-1">P2</span>
               <span class="text-center">Total</span>
             </div>`
          : `<div class="rowline-header">
               <span>Schütze</span>
               <span>Team</span>
               <span class="text-end pe-1">Punkte</span>
             </div>`)
      : '';

    const body = list.length
      ? `${tableHeader}${list.map(({r, idx}) => renderShooterLine(idx, roundKey, teamsPlusPool)).join("")}`
      : `<div class="text-muted small p-3 text-center">— Keine Schützen zugeteilt —</div>`;

    // Bei Gruppe: 2 breite Spalten (col-12 col-lg-6), bei mannschaft/grenzland: 3 Spalten (col-12 col-md-6 col-xl-4)
    const colClass = (contestType === "gruppe") ? "col-12 col-lg-6" : "col-12 col-md-6 col-xl-4";

    return `
      <div class="${colClass}">
        <div class="card team-card h-100 shadow-sm border">
          ${header}
          <div class="card-body p-2.5 team-card-body">
            ${body}
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="p-2 mb-3 rounded-3 round-head ${roundClass}">
      <div class="d-flex justify-content-between align-items-center">
        <h5 class="m-0 fw-bold">${escapeHtml(title)}</h5>
        <div class="small text-muted">Team-Limit: ${limit} (Pool unbegrenzt)</div>
      </div>
    </div>
    <div class="row g-3 mb-4">
      ${cardsHtml}
    </div>
  `;
}

function renderShooterLine(rowIndex, roundKey, teamsPlusPool) {
  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('resultate') : true;
  const r = resultateState.rows[rowIndex];
  const contestType = window._resultateContestType || "grenzland";
  const teamField = `${roundKey}_team`;
  const p1Field = `${roundKey}_p1`;
  const p2Field = `${roundKey}_p2`;

  const selected = (r[teamField] || "") || POOL_LABEL;
  const invalidP1 = (r[p1Field] === "" || isValidPoints(r[p1Field], contestType)) ? "" : "is-invalid";
  const invalidP2 = (r[p2Field] === "" || isValidPoints(r[p2Field], contestType)) ? "" : "is-invalid";

  const opts = teamsPlusPool.map(t => {
    const sel = (t === selected) ? "selected" : "";
    return `<option value="${escapeHtml(t)}" ${sel}>${escapeHtml(t)}</option>`;
  }).join("");

  if (contestType === "gruppe") {
    const stellungBadge = r.stellung === 'kniend'
      ? '<span class="badge bg-warning text-dark border stellung-pill">Kniend</span>'
      : '<span class="badge bg-info text-dark border stellung-pill">Liegend</span>';

    const p1 = parseInt(r[p1Field] || "0", 10) || 0;
    const p2 = parseInt(r[p2Field] || "0", 10) || 0;
    const sumText = (p1 + p2 > 0) ? String(p1 + p2) : "–";

    return `
      <div class="rowline-gruppe mb-2">
        <div class="name-cell text-truncate fw-bold" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
        <div>${stellungBadge}</div>
        <select class="form-select form-select-sm"
                data-row="${rowIndex}"
                data-round="${roundKey}"
                ${canWrite ? '' : 'disabled'}
                onchange="onTeamChangeEvent(event)">
          ${opts}
        </select>
        <input class="form-control form-control-sm points-input ${invalidP1}"
               data-row="${rowIndex}"
               data-round="${roundKey}"
               data-part="p1"
               inputmode="numeric"
               placeholder="P1"
               ${canWrite ? '' : 'disabled readonly'}
               value="${escapeHtml(r[p1Field] ?? "")}"
               oninput="onPointsInputEvent(event)">
        <input class="form-control form-control-sm points-input ${invalidP2}"
               data-row="${rowIndex}"
               data-round="${roundKey}"
               data-part="p2"
               inputmode="numeric"
               placeholder="P2"
               ${canWrite ? '' : 'disabled readonly'}
               value="${escapeHtml(r[p2Field] ?? "")}"
               oninput="onPointsInputEvent(event)">
        <span id="sum-${roundKey}-${rowIndex}" class="badge bg-dark fw-bold text-center d-flex align-items-center justify-content-center" style="height: 31px;">${sumText}</span>
      </div>
    `;
  }

  const placeholder = (contestType === "mannschaft") ? "0-200" : "0-100";

  return `
    <div class="rowline mb-2">
      <div class="name-cell text-truncate fw-bold" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
      <select class="form-select form-select-sm"
              data-row="${rowIndex}"
              data-round="${roundKey}"
              ${canWrite ? '' : 'disabled'}
              onchange="onTeamChangeEvent(event)">
        ${opts}
      </select>
      <input class="form-control form-control-sm points-input ${invalidP1}"
             data-row="${rowIndex}"
             data-round="${roundKey}"
             data-part="p1"
             inputmode="numeric"
             placeholder="${placeholder}"
             ${canWrite ? '' : 'disabled readonly'}
             value="${escapeHtml(r[p1Field] ?? "")}"
             oninput="onPointsInputEvent(event)">
    </div>
  `;
}

function setStatus(text, dirty) {
  const el = document.getElementById("resultate-status");
  if (!el) return;
  el.innerText = text;
  el.classList.toggle("text-danger", !!dirty);
  el.classList.toggle("text-muted", !dirty);
}

function getResultateChangeCount() {
  if (!window._resultateOriginalRows || !resultateState?.rows) return resultateState?.isDirty ? 1 : 0;
  let count = 0;
  resultateState.rows.forEach(r => {
    const orig = window._resultateOriginalRows.find(o => String(o.id) === String(r.id));
    if (!orig) {
      count++;
    } else {
      let isChanged = false;
      if (r.stellung !== orig.stellung) isChanged = true;
      for (let i = 1; i <= 7; i++) {
        if (r[`r${i}_team`] !== orig[`r${i}_team`]) {
          isChanged = true;
          break;
        }
        if (r[`r${i}_p1`] !== orig[`r${i}_p1`]) {
          isChanged = true;
          break;
        }
        if (i <= 3 && r[`r${i}_p2`] !== orig[`r${i}_p2`]) {
          isChanged = true;
          break;
        }
      }
      if (isChanged) count++;
    }
  });
  return count;
}
window.getResultateChangeCount = getResultateChangeCount;

function updateResultateSaveButtonState(isSaving = false) {
  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('resultate') : true;
  const count = getResultateChangeCount();
  if (window.SaveButtonKit) {
    SaveButtonKit.update('btn-save-resultate', {
      count,
      canWrite,
      isSaving
    });
  }
}
window.updateResultateSaveButtonState = updateResultateSaveButtonState;

/**
 * Exportiert die aktuelle Kompakt-Matrix (Grenzland, Gruppe, Mannschaft) nach Excel (.xlsx).
 */
function exportResultateMatrixToExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Fehler: Excel-Bibliothek (SheetJS) ist nicht geladen.");
    return;
  }

  if (!resultateState.rows || resultateState.rows.length === 0) {
    alert("Keine Resultate zum Exportieren vorhanden.");
    return;
  }

  const contestType = window._resultateContestType || "mannschaft";
  const year = window._resultateYear || new Date().getFullYear();
  const roundCount = getContestRoundCount(contestType);

  let contestTitle = "Resultate";
  if (contestType === "gruppe") contestTitle = "SGM Gruppenmeisterschaft";
  else if (contestType === "mannschaft") contestTitle = "SMM Mannschaftsmeisterschaft";
  else if (contestType === "grenzland") contestTitle = "Grenzland-Cup";

  // Sortierung analog Matrix-View
  const sortedRows = [...resultateState.rows];
  if (contestType === "gruppe") {
    sortedRows.sort((a, b) => {
      const stA = (a.stellung || 'liegend').toLowerCase();
      const stB = (b.stellung || 'liegend').toLowerCase();
      if (stA !== stB) {
        return stA === 'liegend' ? -1 : 1;
      }
      return (a.name || '').localeCompare(b.name || '', 'de');
    });
  } else {
    sortedRows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  }

  const headerRow = ['Schütze', 'Lizenz', 'Stellung'];
  if (contestType === "gruppe") {
    for (let r = 1; r <= roundCount; r++) {
      headerRow.push(`R${r} Team`, `R${r} P1`, `R${r} P2`, `R${r} Total`);
    }
  } else {
    for (let r = 1; r <= roundCount; r++) {
      headerRow.push(`R${r} Team`, `R${r} Punkte`);
    }
  }
  headerRow.push('Gesamttotal', 'Schnitt (Ø)');

  const dataRows = [];
  const colTotals = {};
  const colCounts = {};

  sortedRows.forEach(row => {
    const mem = (resultateState.members || []).find(m => String(m.id) === String(row.id));
    const lizenz = mem?.address_number || '';
    const stellung = (row.stellung || 'liegend').charAt(0).toUpperCase() + (row.stellung || 'liegend').slice(1);

    const rowData = [row.name || 'Unbekannt', lizenz, stellung];
    let shooterTotal = 0;
    let shooterRoundsCount = 0;

    for (let r = 1; r <= roundCount; r++) {
      const team = row[`r${r}_team`] || 'Pool';
      const p1Raw = row[`r${r}_p1`];
      const p2Raw = row[`r${r}_p2`];
      const p1 = (p1Raw !== "" && p1Raw != null) ? parseInt(p1Raw, 10) : null;
      const p2 = (p2Raw !== "" && p2Raw != null) ? parseInt(p2Raw, 10) : null;

      if (contestType === "gruppe") {
        const rSum = (p1 !== null || p2 !== null) ? ((p1 || 0) + (p2 || 0)) : null;
        rowData.push(team, p1 !== null ? p1 : '', p2 !== null ? p2 : '', rSum !== null ? rSum : '');

        if (p1 !== null) {
          colTotals[`r${r}_p1`] = (colTotals[`r${r}_p1`] || 0) + p1;
          colCounts[`r${r}_p1`] = (colCounts[`r${r}_p1`] || 0) + 1;
        }
        if (p2 !== null) {
          colTotals[`r${r}_p2`] = (colTotals[`r${r}_p2`] || 0) + p2;
          colCounts[`r${r}_p2`] = (colCounts[`r${r}_p2`] || 0) + 1;
        }
        if (rSum !== null) {
          colTotals[`r${r}_tot`] = (colTotals[`r${r}_tot`] || 0) + rSum;
          colCounts[`r${r}_tot`] = (colCounts[`r${r}_tot`] || 0) + 1;
          shooterTotal += rSum;
          shooterRoundsCount++;
        }
      } else {
        rowData.push(team, p1 !== null ? p1 : '');
        if (p1 !== null) {
          colTotals[`r${r}_p1`] = (colTotals[`r${r}_p1`] || 0) + p1;
          colCounts[`r${r}_p1`] = (colCounts[`r${r}_p1`] || 0) + 1;
          shooterTotal += p1;
          shooterRoundsCount++;
        }
      }
    }

    const schnitt = shooterRoundsCount > 0 ? (shooterTotal / shooterRoundsCount).toFixed(1) : '';
    rowData.push(shooterTotal > 0 ? shooterTotal : '', schnitt);
    dataRows.push(rowData);
  });

  // Durchschnittszeile
  const avgRow = ['DURCHSCHNITT (Ø)', '', ''];
  for (let r = 1; r <= roundCount; r++) {
    if (contestType === "gruppe") {
      const avgP1 = colCounts[`r${r}_p1`] ? (colTotals[`r${r}_p1`] / colCounts[`r${r}_p1`]).toFixed(1) : '';
      const avgP2 = colCounts[`r${r}_p2`] ? (colTotals[`r${r}_p2`] / colCounts[`r${r}_p2`]).toFixed(1) : '';
      const avgTot = colCounts[`r${r}_tot`] ? (colTotals[`r${r}_tot`] / colCounts[`r${r}_tot`]).toFixed(1) : '';
      avgRow.push('', avgP1, avgP2, avgTot);
    } else {
      const avgP1 = colCounts[`r${r}_p1`] ? (colTotals[`r${r}_p1`] / colCounts[`r${r}_p1`]).toFixed(1) : '';
      avgRow.push('', avgP1);
    }
  }
  avgRow.push('', '');

  const wsData = [
    [`Sportschützen Muhen - Resultate Matrix: ${contestTitle} (${year})`],
    [`Erstellt am: ${new Date().toLocaleDateString('de-CH')} ${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} | ${sortedRows.length} Schützen`],
    [],
    headerRow,
    ...dataRows,
    [],
    avgRow
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Spaltenbreiten anpassen
  const colWidths = [{ wch: 22 }, { wch: 12 }, { wch: 12 }];
  if (contestType === "gruppe") {
    for (let r = 1; r <= roundCount; r++) {
      colWidths.push({ wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 });
    }
  } else {
    for (let r = 1; r <= roundCount; r++) {
      colWidths.push({ wch: 12 }, { wch: 10 });
    }
  }
  colWidths.push({ wch: 12 }, { wch: 12 });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  const sheetName = `${contestType.charAt(0).toUpperCase() + contestType.slice(1)}_${year}`.substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const todayIso = new Date().toISOString().split('T')[0];
  const fileName = `Sportschuetzen_Muhen_${contestType}_Matrix_${year}_${todayIso}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
window.exportResultateMatrixToExcel = exportResultateMatrixToExcel;

