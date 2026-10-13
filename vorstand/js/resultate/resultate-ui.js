// =========================================================
//  RESULTATE (Mannschaft & G & G) - UI Rendering
//  Native Supabase Architecture mit Multi-Wettbewerbs-Support
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
      
      // Parallel: Resultate, aktive Mitglieder und konfigurierte Teams
      const [resResult, membersResult, teamsResult] = await Promise.allSettled([
        supa.from('contest_results').select('*').eq('contest_type', contestType).eq('year', year),
        supa.from('members').select('person_number, first_name, last_name, primary_email').eq('is_active', true),
        supa.from('contest_teams').select('team_name').eq('contest_type', contestType).eq('year', year).order('sort_order')
      ]);

      const supaRows = (resResult.status === 'fulfilled' && !resResult.value.error) ? (resResult.value.data || []) : null;
      const supaMembers = (membersResult.status === 'fulfilled' && !membersResult.value.error) ? (membersResult.value.data || []) : [];
      const supaTeams = (teamsResult.status === 'fulfilled' && !teamsResult.value.error) ? (teamsResult.value.data || []).map(t => t.team_name) : [];

      if (supaRows !== null) {
        window._resultateIsSupabase = true;
        console.log(`✅ [Supabase] ${supaRows.length} Resultate-Zeilen geladen für ${contestType}.`);

        resultateState.members = supaMembers.map(m => ({
          id: String(m.person_number),
          vorname: m.first_name || "",
          nachname: m.last_name || "",
          email: m.primary_email || ""
        }));

        resultateState.rows = supaRows.map(r => mapContestResultFromSupabase(r));
        resultateState.teams = buildTeamsList(supaTeams, resultateState.rows);
        resultateState.isDirty = false;
        window._resultateOriginalRows = JSON.parse(JSON.stringify(resultateState.rows));

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

function updateBackendBadge() {
  const badge = document.getElementById("resultate-backend-badge");
  if (badge) badge.remove();
}

function switchResultateContest(type) {
  if (resultateState.isDirty && !confirm("Du hast ungespeicherte Änderungen. Möchtest du wirklich den Wettbewerb wechseln?")) {
    return;
  }
  window._resultateContestType = type;
  resultateState.rows = [];
  ensureResultateShell(true);
  loadResultateData(true);
}
window.switchResultateContest = switchResultateContest;

function ensureResultateShell(forceRebuild = false) {
  const host = document.getElementById("resultate-container");
  if (!host) return;

  if (!forceRebuild && document.getElementById("resultate-app")) return;

  injectStylesOnce();

  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('resultate') : true;
  const currentContest = window._resultateContestType || "mannschaft";
  const limit = getContestLimit(currentContest);

  let subtitle = "";
  if (currentContest === "mannschaft") {
    subtitle = `Schweizer Mannschaftsmeisterschaft (SMM): 7 Runden à 200 Pkt. Team-Limit: ${limit} Schützen/Team.`;
  } else if (currentContest === "gruppe") {
    subtitle = `Gruppenmeisterschaft (SGM): 3 Runden à 2 Passen (P1+P2 à 100 Pkt). Team-Limit: ${limit} Schützen (3 Liegend, 2 Kniend).`;
  } else {
    subtitle = `Grenzland Cup: 3 Runden à 100 Pkt. Team-Limit: ${limit} Schützen/Team (Pool unbegrenzt).`;
  }

  host.innerHTML = `
    <div id="resultate-app">
      <div class="d-flex justify-content-between align-items-center mb-3 sticky-top bg-white p-2 shadow-sm rounded" style="z-index: 600;">
        <div>
          <div class="d-flex align-items-center gap-3 flex-wrap">
            <h4 class="m-0 fw-bold">🏁 Resultate – Mannschaft & G & G</h4>
            <div class="btn-group btn-group-sm" role="group" aria-label="Wettbewerb wählen">
              <button type="button" class="btn btn-outline-primary ${currentContest === 'mannschaft' ? 'active fw-bold' : ''}" onclick="switchResultateContest('mannschaft')">👥 Mannschaft</button>
              <button type="button" class="btn btn-outline-primary ${currentContest === 'gruppe' ? 'active fw-bold' : ''}" onclick="switchResultateContest('gruppe')">🎯 Gruppe</button>
              <button type="button" class="btn btn-outline-primary ${currentContest === 'grenzland' ? 'active fw-bold' : ''}" onclick="switchResultateContest('grenzland')">🛡️ Grenzland</button>
            </div>
          </div>
          <div class="small text-muted mt-1">${subtitle}</div>
        </div>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          ${canWrite && currentContest === 'mannschaft' ? `
            <button class="btn btn-outline-success btn-sm fw-semibold" onclick="syncJmToContestMannschaftAction()" title="SMM-Runden 1–7 aus Jahresmeisterschaft übernehmen">
              <i class="fas fa-sync-alt me-1"></i>Aus Jahresmeisterschaft synchronisieren
            </button>
          ` : ''}
          ${canWrite ? `
            <button class="btn btn-outline-warning btn-sm fw-semibold" onclick="openResultateOcrModal()" title="Resultate aus Foto mit KI einlesen">📸 Foto einlesen</button>
            <button class="btn btn-outline-info btn-sm" onclick="syncSetupToResultate()" title="Schützen aus Setup übernehmen (nur fehlende)">📥 Von Setup laden</button>
          ` : ''}
          <button class="btn btn-outline-secondary btn-sm" onclick="loadResultateData(true)">🔄 Laden</button>
          ${canWrite ? `<button id="btn-save-resultate" class="btn btn-sm btn-outline-secondary write-protected" disabled onclick="saveResultateData()">💾 Gespeichert</button>` : ''}
        </div>
      </div>

      <div id="resultate-status" class="small text-muted mb-2"></div>

      <div class="card shadow-sm border-0">
        <div class="card-body">
          <div id="resultate-wrap"></div>

          ${canWrite ? `
          <div class="mt-3 p-2 border rounded bg-light">
            <div class="fw-bold mb-2">Schütze hinzufügen (nur aus Mitglieder)</div>
            <div class="d-flex gap-2 flex-wrap align-items-center">
              <select id="new-member-select" class="form-select form-select-sm" style="max-width: 320px;">
                <option value="">— Mitglied wählen —</option>
              </select>

              ${currentContest === 'gruppe' ? `
              <select id="new-start-stellung" class="form-select form-select-sm" style="max-width: 150px;">
                <option value="liegend">🛌 Liegend</option>
                <option value="kniend">🧎 Kniend</option>
              </select>
              ` : ''}

              <select id="new-start-round" class="form-select form-select-sm" style="max-width: 170px;">
                <option value="r1">Start ab Runde 1</option>
                <option value="r2">Start ab Runde 2</option>
                <option value="r3">Start ab Runde 3</option>
              </select>

              <select id="new-start-team" class="form-select form-select-sm" style="max-width: 200px;">
                <option value="">— Team wählen —</option>
              </select>

              <button class="btn btn-primary btn-sm" onclick="confirmAddSelectedMember()">Hinzufügen</button>
              <div id="avail-count" class="small text-muted"></div>
            </div>
          </div>
          ` : ''}

        </div>
      </div>

      <!-- KI OCR Modal -->
      <div class="modal fade" id="resultate-ocr-modal" tabindex="-1" aria-labelledby="resultateOcrModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-centered">
              <div class="modal-content border-0 rounded-4 shadow" style="background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,252,0.98) 100%); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);">
                  <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
                      <h5 class="modal-title fw-bold" id="resultateOcrModalLabel"><i class="fas fa-camera me-2"></i>KI-Bilderkennung für Resultate</h5>
                      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                  </div>
                  <div class="modal-body p-4">
                      <!-- Inline Error Alert -->
                      <div id="ocr-error-alert" class="alert alert-danger d-none" role="alert">
                          <i class="fas fa-exclamation-triangle me-2"></i>
                          <span id="ocr-error-text"></span>
                      </div>
                      <div id="ocr-step-upload">
                          <div class="row g-2 mb-2">
                              <div class="col-6">
                                  <label class="form-label fw-bold small text-muted">Ziel-Runde für die erkannten Resultate</label>
                                  <select id="ocr-target-round" class="form-select">
                                      <option value="r1">Runde 1</option>
                                      <option value="r2">Runde 2</option>
                                      <option value="r3">Runde 3</option>
                                  </select>
                              </div>
                              <div class="col-6">
                                  <label class="form-label fw-bold small text-muted">KI-Modell & Kapazität</label>
                                  <select id="ocr-model" class="form-select">
                                      <option value="gemini-2.5-flash" selected>Gemini 2.5 Flash (Standard)</option>
                                      <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Lite - Höchste Verfügbarkeit)</option>
                                      <option value="gemini-2.5-pro">Gemini 2.5 Pro (Beste Erkennungsrate)</option>
                                  </select>
                              </div>
                          </div>
                          <div id="ocr-model-desc" class="form-text text-muted mb-3 small" style="min-height: 20px;"></div>
                          <div class="mb-4">
                              <label class="form-label fw-bold small text-muted">Foto auswählen oder aufnehmen</label>
                              <div class="border rounded p-4 text-center bg-light position-relative" style="cursor:pointer; border-style: dashed !important; transition: border-color 0.2s;" id="ocr-dropzone" onclick="document.getElementById('ocr-file-input').click()">
                                  <i class="fas fa-file-image fa-3x text-muted mb-2"></i>
                                  <p class="mb-0 text-muted fw-semibold">Bild hierhin ziehen oder klicken zum Auswählen</p>
                                  <div id="ocr-preview-container" class="mt-3 d-none">
                                      <img id="ocr-image-preview" src="" class="img-fluid rounded border shadow-sm" style="max-height: 250px; max-width: 100%;">
                                  </div>
                              </div>
                              <input type="file" id="ocr-file-input" accept="image/*" style="display:none" onchange="onOcrFileSelected(event)">
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
    </div>
  `;
}

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
    .rowline-gruppe {
      display: grid;
      grid-template-columns: minmax(130px, 1.2fr) 95px 105px 65px 65px 45px;
      gap: 5px;
      align-items: center;
    }
    .points-input {
      text-align: right;
      font-weight: 600;
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
  renderMemberDropdown();
  renderRounds();
  setStatus(resultateState.isDirty ? "Ungespeicherte Änderungen" : "Alles gespeichert", resultateState.isDirty);
  updateResultateSaveButtonState();
}

function renderMemberDropdown() {
  const sel = document.getElementById("new-member-select");
  const teamSel = document.getElementById("new-start-team");
  const cnt = document.getElementById("avail-count");
  if (!sel) return;

  const used = new Set(resultateState.rows.map(r => String(r.id)).filter(Boolean));
  const available = resultateState.members
    .filter(m => !used.has(String(m.id)))
    .sort((a,b) => (`${a.nachname} ${a.vorname}`).localeCompare(`${b.nachname} ${b.vorname}`, "de"));

  sel.innerHTML = `<option value="">— Mitglied wählen —</option>` + available.map(m => {
    const label = `${m.nachname} ${m.vorname}`.trim();
    return `<option value="${escapeHtml(m.id)}">${escapeHtml(label)}</option>`;
  }).join("");

  if (teamSel) {
    const teamsPlusPool = [...resultateState.teams, POOL_LABEL];
    teamSel.innerHTML = `<option value="">— Team wählen —</option>` + teamsPlusPool.map(t =>
      `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
    ).join("");
  }

  if (cnt) cnt.innerText = `${available.length} verfügbar`;
}

function renderRounds() {
  const wrap = document.getElementById("resultate-wrap");
  if (!wrap) return;

  const teams = [...resultateState.teams];
  const teamsPlusPool = [...teams, POOL_LABEL];
  const contestType = window._resultateContestType || "mannschaft";
  const roundCount = getContestRoundCount(contestType);

  let html = "";
  for (let i = 1; i <= roundCount; i++) {
    html += renderRoundSection(`Runde ${i}`, `r${i}`, `round-${i}`, teamsPlusPool);
  }
  wrap.innerHTML = html;
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

    const header = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-bold">${escapeHtml(teamName)}</span>
        <span class="badge ${isPool ? "bg-secondary" : (count > limit ? "bg-danger" : "bg-primary")} team-badge">
          ${count}${isPool ? "" : "/" + limit}
        </span>
      </div>
    `;

    const body = list.length
      ? list.map(({r, idx}) => renderShooterLine(idx, roundKey, teamsPlusPool)).join("")
      : `<div class="text-muted small p-2">— Keine Schützen zugeteilt —</div>`;

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card team-card h-100 shadow-sm">
          ${header}
          <div class="card-body">
            ${body}
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="p-2 mb-3 rounded round-head ${roundClass}">
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
      ? '<span class="badge bg-warning text-dark border">Kniend</span>'
      : '<span class="badge bg-info text-dark border">Liegend</span>';

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
        <span id="sum-${roundKey}-${rowIndex}" class="badge bg-dark fw-bold">${sumText}</span>
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
  const origMap = new Map((window._resultateOriginalRows || []).map(r => [String(r.id), r]));
  (resultateState.rows || []).forEach(r => {
    const orig = origMap.get(String(r.id));
    if (!orig) {
      count++;
    } else {
      let isChanged = false;
      for (let i = 1; i <= 7; i++) {
        if (r[`r${i}_team`] !== orig[`r${i}_team`] || r[`r${i}_p1`] !== orig[`r${i}_p1`]) {
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
